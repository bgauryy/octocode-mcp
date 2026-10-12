//! ghSearchCode: indexed default-branch code or path search.
mod code_output;
mod fragments;
mod leads;
mod lines;
#[cfg(test)]
mod provider_tests;
mod query;
mod ranking;

use crate::providers::github::{
    CodeSearchRequest, ConditionalCache, GitHubProvider, ProviderError, ProviderErrorKind,
    RequestContext,
};
use crate::security::scan::ContentScan;
use crate::tools::gh_shared::{
    GhFailure, SearchReach, add_next, apply_partial, field_names, pick_rows, push_warning_front,
    reject_window, search_failure, with_ref_recovery, with_search_repair,
};
use crate::tools::id::ToolId;
use crate::tools::num::usize_of;
use crate::tools::result::{Continuation, ToolData, query_row};
use serde_json::json;

pub use crate::contracts::tool_types::{GhSearchCodeQuery, GhSearchCodeQueryMatchIn};

/// What a `fields` pick always keeps of a code row: its identity (path, and
/// repository on owner-wide pages) and the facts that qualify its lines
/// (where else the same evidence sits, how many hits exist, whether the
/// lines were read at the ref, and the commit they were read at).
const CODE_ROW_ID: &[&str] = &[
    "owner",
    "repo",
    "path",
    "alsoAt",
    "matchCount",
    "atRef",
    "lineResolved",
    "commitSha",
];

/// Run one ghSearchCode row.
pub async fn run<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    request: Result<&RequestContext, ProviderError>,
    security: &impl ContentScan,
) -> Result<ToolData, GhFailure> {
    let result = match request {
        Ok(context) => execute(provider, query, context, security).await,
        Err(error) => Err(error),
    };
    result.map_err(|error| {
        let repo = query.repo.as_deref().map(|repo| repo.as_str());
        let failure = with_search_repair(
            search_failure(error, None),
            ToolId::GhSearchCode,
            query,
            page_size(query),
            repo,
        );
        match repo {
            Some(repo) => with_ref_recovery(failure, &query.owner, repo),
            // An owner-wide search that found no such login: the message
            // names the login, and its one hint is the spelling.
            None if failure.error.reason
                == Some(crate::providers::github::ProviderErrorReason::UserNotFound) =>
            {
                GhFailure {
                    message: format!(
                        "Owner \"{}\" not found: no GitHub user or organization has this login",
                        query.owner
                    ),
                    hints: vec![
                        "Check the owner spelling: a user or organization login.".to_owned(),
                    ],
                    ..failure
                }
            }
            None => failure,
        }
    })
}

/// Files per page: the query's, within the contract maximum.
fn page_size(query: &GhSearchCodeQuery) -> usize {
    usize_of(query.page_size).min(crate::contracts::query_schema_max(
        ToolId::GhSearchCode,
        None,
        "pageSize",
    ))
}

pub(crate) async fn execute<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    context: &RequestContext,
    security: &impl ContentScan,
) -> Result<ToolData, ProviderError> {
    let current = usize_of(query.page);
    let per = page_size(query);
    reject_window(current, per)?;
    // The commit hit lines are read at does not depend on the hits: resolve
    // it during the index search instead of after it.
    let (data, commit) = futures_util::future::join(
        search_page(provider, query, current, per, context),
        code_output::line_commit(provider, query, context),
    )
    .await;
    let data = data?;
    // GitHub code search does not follow renames: an empty scoped search
    // reruns once against the canonical name, as ghSearchHistory does.
    // A page past the last holds no files of a search that has results.
    let past_end = data.items.is_empty() && data.total > 0 && current > data.pages;
    if data.items.is_empty()
        && !past_end
        && let Some((renamed, warnings)) = renamed_scope(provider, query, context).await?
    {
        let mut output = Box::pin(execute(provider, &renamed, context, security)).await?;
        for warning in warnings.into_iter().rev() {
            push_warning_front(&mut output.data, warning);
        }
        return Ok(output);
    }
    let more = current < data.pages;
    let mut items = code_output::files(&data.items, query, security)?;
    let mut value = json!({});
    let resolution = code_output::resolve_lines(
        provider,
        query,
        &items,
        &data.items,
        commit,
        context,
        security,
    )
    .await?;
    let resolved_sha = resolution
        .as_ref()
        .and_then(|resolution| resolution.sha.clone());
    let reads = code_output::shape_files(&mut value, &mut items, query, resolution);
    code_output::merge_identical(&mut items);
    code_output::hoist_shared(&mut value, &mut items);
    let fields = field_names(&query.fields);
    if !items.is_empty() {
        value["files"] = json!(items);
    }
    pick_rows(&mut value, "files", CODE_ROW_ID, &fields);
    if data.pages > 1 || past_end {
        value["pagination"] = crate::response::pages::PageFacts::open(current, Some(per), more)
            .with_total(data.total)
            .out_of_range(past_end)
            .to_value();
    }
    add_next(&mut value, ToolId::GhSearchCode, query, current, more);
    if let Some(read) = reads.top {
        value["next"]["read"] = read;
    }
    // A file lists at most a few of its hit lines; `readHits` reads the rest.
    let hits_unlisted = !reads.hits.is_empty();
    // `readHits`, `readHits2`, …: one per capped or cut file.
    for (position, read) in reads.hits.into_iter().enumerate() {
        let key = match position {
            0 => "readHits".to_owned(),
            n => format!("readHits{}", n + 1),
        };
        value["next"][key] = read;
    }
    // The index scope is stated once, on the first page of a ref search.
    if !items.is_empty() && current == 1 {
        code_output::disclose_index_ref(provider, &mut value, query, resolved_sha, context).await?;
    }
    // Provider-index completeness is reported on every page, apart from
    // whether another page exists.
    apply_partial(
        &mut value,
        ToolId::GhSearchCode,
        query,
        data.incomplete,
        // Past the cap the page states GitHub's match count.
        if data.capped { data.matched } else { 0 },
        current,
        more,
        "code",
    );
    // A page with another page behind it states its remainder through
    // `pagination`; a complete one has no other way to say why it is partial.
    if hits_unlisted && !more {
        value["isPartial"] = json!(true);
        let reasons = value["partialReasons"].take();
        let mut reasons = reasons.as_array().cloned().unwrap_or_default();
        reasons.push(json!("hitLinesNotListed"));
        value["partialReasons"] = json!(reasons);
    }
    if let Some(warning) = octocode_github::sso_partial_warning(&data.sso_partial) {
        push_warning_front(&mut value, warning);
    }
    let mut output = ToolData::from(value);
    if data.incomplete {
        output.diagnostics.add(
            "ghIncompleteResults",
            "GitHub reported an incomplete search index result; retry, narrow the scope, or verify locally before concluding absence.",
            true,
        );
    }
    if data.items.is_empty() {
        output.status = Some("empty");
    }
    if data.items.is_empty() && data.incomplete && query.repo.is_none() {
        code_output::owner_exists(&query.owner, &provider.transport, context).await?;
    }
    if data.items.is_empty() && !past_end {
        empty_page(provider, query, context, &mut output).await?;
    }
    Ok(output)
}

/// One provider page, merged across `extensions`: GitHub ANDs repeated
/// `extension:` qualifiers, so each extension is its own indexed search on
/// the same page number. The searches share `pageSize` (each lists
/// `ceil(pageSize / k)`), so a merged page holds about `pageSize` files and
/// page N of every search is page N of the merge: lossless.
struct SearchPage {
    items: Vec<crate::providers::github::CodeSearchItem>,
    /// Reachable results (each search caps at 1,000).
    total: usize,
    pages: usize,
    capped: bool,
    /// GitHub's match counts, summed over the merged searches.
    matched: usize,
    incomplete: bool,
    /// Organizations SAML enforcement withheld from the merged searches.
    sso_partial: Vec<u64>,
}

async fn search_page<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    current: usize,
    per: usize,
    context: &RequestContext,
) -> Result<SearchPage, ProviderError> {
    let extensions = query
        .extensions
        .iter()
        .map(|extension| extension.as_str())
        .collect::<Vec<_>>();
    let scopes = match extensions.as_slice() {
        [_, _, ..] => extensions.iter().copied().map(Some).collect(),
        _ => vec![None],
    };
    let per_search = per.div_ceil(scopes.len()).max(1);
    let mut page = SearchPage {
        items: Vec::new(),
        total: 0,
        pages: 0,
        capped: false,
        matched: 0,
        incomplete: false,
        sso_partial: Vec::new(),
    };
    let requests = scopes
        .into_iter()
        .map(|extension| CodeSearchRequest {
            query: query::code(query, extension),
            page: current,
            per_page: per_search,
            include_fragments: query.match_in != GhSearchCodeQueryMatchIn::Path,
        })
        .collect::<Vec<_>>();
    // Each extension's search takes its own window slot, so a row
    // whose uncached searches cannot all start within the wait cap is
    // refused before the first is sent, not midway with its slots spent.
    let mut cached = Vec::with_capacity(requests.len());
    for request in &requests {
        cached.push(
            provider
                .transport
                .cached_code_search(request, context)
                .await?,
        );
    }
    let sends = cached.iter().filter(|page| page.is_none()).count();
    if let Some(refusal) = provider.transport.code_search_batch_refusal(sends, context) {
        return Err(refusal);
    }
    for (request, cached) in requests.iter().zip(cached) {
        let data = match cached {
            Some(data) => data,
            None => provider.transport.search_code(request, context).await?,
        };
        let reach = SearchReach::new(data.total_count, per_search);
        page.total += reach.total;
        page.pages = page.pages.max(reach.pages);
        page.capped |= reach.capped;
        page.matched += data.total_count;
        page.incomplete |= data.incomplete_results;
        for organization in data.sso_partial_organizations {
            if !page.sso_partial.contains(&organization) {
                page.sso_partial.push(organization);
            }
        }
        page.items.extend(data.items);
    }
    Ok(page)
}

/// The query re-scoped to a renamed repository's canonical name, with the
/// rename warning; `None` when the name stands or cannot be checked.
async fn renamed_scope<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    context: &RequestContext,
) -> Result<Option<(GhSearchCodeQuery, Vec<String>)>, ProviderError> {
    let Some(scoped) = query.repo.as_deref() else {
        return Ok(None);
    };
    match provider
        .transport
        .canonical_owner_repo(&query.owner, scoped, context)
        .await
    {
        Ok(Some((owner, repo))) => {
            let warning = crate::tools::gh_shared::renamed_warning(
                query.owner.as_str(),
                scoped,
                &(owner.clone(), repo.clone()),
            );
            let decode = |error: &dyn std::fmt::Display| {
                ProviderError::new(ProviderErrorKind::Decode, error.to_string())
            };
            let mut renamed = query.clone();
            renamed.owner = owner.parse().map_err(|error| decode(&error))?;
            renamed.repo = Some(repo.parse().map_err(|error| decode(&error))?);
            Ok(Some((renamed, vec![warning])))
        }
        Err(error)
            if matches!(
                error.kind,
                ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
            ) =>
        {
            Err(error)
        }
        Ok(_) | Err(_) => Ok(None),
    }
}

/// Why a search is empty, with the route that verifies it.
async fn empty_page<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    context: &RequestContext,
    output: &mut ToolData,
) -> Result<(), ProviderError> {
    let value = &mut output.data;
    code_output::empty_scope(
        value,
        &mut output.diagnostics,
        query,
        &provider.transport,
        context,
    )
    .await?;
    if value.get("hints").is_none() && code_output::path_mode_given_code(query) {
        // Path matching never sees file contents: search them instead.
        let mut content = query_row(query, &[]);
        content["matchIn"] = json!("file");
        content["page"] = json!(1);
        value["next"]["findCode"] = Continuation::new(ToolId::GhSearchCode, content)
            .confidence("high")
            .build();
    }
    if value.get("hints").is_none()
        && let Some(hint) = code_output::empty_hint(query)
    {
        value["hints"] = json!([hint]);
        if value["next"].get("read").is_none()
            && let Some(read) = leads::unsearched_ref_read(query)
        {
            value["next"]["read"] = read;
        }
    }
    if let Some(broader) =
        leads::broaden_search(query, provider.transport.code_search_room(context))
    {
        value["next"]["broadenSearch"] = broader;
    }
    Ok(())
}

/// This tool's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, query: &serde_json::Value) -> &'static str {
        use crate::tools::output::has_value;
        if query["matchIn"] == "path" {
            "Try a shorter name fragment, or ghStructure include to find paths by name."
        } else if ["extensions", "filename", "path", "language"]
            .iter()
            .any(|key| has_value(query, key))
        {
            "Drop extensions/filename/path/language or use fewer keywords; only the default branch is indexed."
        } else if query["keywords"].as_array().is_some_and(|k| k.len() > 1) {
            "An empty index result is unproven absence: use fewer keywords, or ghGetFileContent a likely file to verify."
        } else {
            "An empty index result is unproven absence: ghStructure the repository, then ghGetFileContent likely files to verify."
        }
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
}

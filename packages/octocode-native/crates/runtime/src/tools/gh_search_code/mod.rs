//! ghSearchCode: indexed default-branch code or path search.
mod code_output;
mod fragments;
mod leads;
mod lines;
#[cfg(test)]
mod provider_tests;
mod query;
mod ranking;
#[cfg(test)]
mod selection_tests;

use crate::security::scan::ContentScan;
use crate::tools::gh_shared::{
    CODE_ROW_ID, GhFailure, SearchCompleteness, SearchWindow, add_next, apply_partial, field_names,
    pick_rows, push_warning_front, search_failure, with_ref_recovery, with_search_repair,
};
use crate::tools::id::ToolId;
use crate::tools::num::usize_of;
use crate::tools::paging::{mark_partial, push_warnings};
use crate::tools::result::{Continuation, ToolData, query_row};
use octocode_github::{
    CodeSearchRequest, ConditionalCache, GitHubProvider, ProviderError, ProviderErrorKind,
    RequestContext,
};
use serde_json::json;

pub use crate::contracts::tool_types::{GhSearchCodeQuery, GhSearchCodeQueryMatchIn};

/// Run one ghSearchCode row.
pub async fn run<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    request: Result<&RequestContext, ProviderError>,
    security: &(impl ContentScan + Sync),
) -> Result<ToolData, GhFailure> {
    if let Some(failure) = ref_without_repo(query) {
        return Err(failure);
    }
    let context = request.as_ref().ok().copied();
    let result = match request {
        Ok(context) => execute(provider, query, context, security).await,
        Err(error) => Err(error),
    };
    let error = match result {
        Ok(data) => return Ok(data),
        Err(error) => error,
    };
    // A page past the 1,000-result window repairs to the search's last real
    // page: the window's last page, or the first page's own last page when
    // it names an earlier one (one search, usually cached). Its reachable
    // results are the first page's total (every merged search's).
    let window = match context {
        Some(context)
            if error.reason == Some(octocode_github::ProviderErrorReason::SearchWindowExceeded) =>
        {
            let window_last = SearchWindow::PageEnd.last_page(per_search(query, page_size(query)));
            let first = search_page(provider, query, 1, page_size(query), context)
                .await
                .ok();
            let last = first
                .as_ref()
                .map_or(window_last, |page| page.pages.max(1).min(window_last));
            Some((last, first.map(|page| page.total)))
        }
        _ => None,
    };
    Err({
        let repo = query.repo.as_deref().map(|repo| repo.as_str());
        let mut failure = with_search_repair(
            search_failure(error, None),
            ToolId::GhSearchCode,
            query,
            page_size(query),
            repo,
        );
        if let Some((last, reachable)) = window {
            // Stated in the caller's page size: each merged search's own
            // page size is internal.
            failure.message = format!(
                "Page {} is past GitHub's search window: at pageSize {}, page {last} is the last{}.",
                usize_of(query.page),
                page_size(query),
                reachable.map_or_else(String::new, |total| format!(
                    ", reaching the first {total} results"
                )),
            );
            if let Some(row) = failure
                .next
                .as_mut()
                .and_then(|next| next.pointer_mut("/repair/query/queries/0"))
            {
                row["page"] = json!(last);
            }
        }
        match repo {
            Some(repo) => with_ref_recovery(failure, &query.owner, repo),
            // An owner-wide search that found no such login: the message
            // names the login, and its one hint is the spelling.
            None if failure.error.reason
                == Some(octocode_github::ProviderErrorReason::UserNotFound) =>
            {
                GhFailure {
                    message: crate::tools::gh_shared::owner_not_found_message(&query.owner),
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

/// `ref` re-reads one repository's hits at that ref; an owner-wide search
/// spans many repositories, each read at its own indexed commit, so the
/// ref cannot apply. Rejected before any request, with the same search
/// without it as the repair.
fn ref_without_repo(query: &GhSearchCodeQuery) -> Option<GhFailure> {
    let reference = code_output::requested_ref(query).filter(|_| query.repo.is_none())?;
    let error = ProviderError::new(
        ProviderErrorKind::Validation,
        format!(
            "ref \"{reference}\" needs repo: an owner-wide search reads each hit at its repository's indexed commit."
        ),
    );
    let message = error.message.to_string();
    let repair = Continuation::new(ToolId::GhSearchCode, query_row(query, &["ref"]))
        .confidence("high")
        .build();
    Some(GhFailure {
        next: Some(Box::new(json!({ "repair": repair }))),
        ..GhFailure::new(error, message).hint("Add repo to read that repository's hits at the ref.")
    })
}

/// Files each merged search lists per page: GitHub ANDs repeated
/// `extension:` qualifiers, so each of `k` extensions is its own search of
/// `ceil(per / k)` files on the same page number.
fn per_search(query: &GhSearchCodeQuery, per: usize) -> usize {
    per.div_ceil(query.extensions.len().max(1)).max(1)
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
    security: &(impl ContentScan + Sync),
) -> Result<ToolData, ProviderError> {
    let current = usize_of(query.page);
    let per = page_size(query);
    SearchWindow::PageEnd.reject(current, per_search(query, per))?;
    // A ref search's lines are read at the ref's commit, which does not
    // depend on the hits: resolve it during the index search, not after.
    let (data, commit) = futures_util::future::join(
        search_page(provider, query, current, per, context),
        code_output::line_commit(provider, query, context),
    )
    .await;
    let data = data?;
    // GitHub code search does not follow renames: an empty scoped search
    // reruns once against the canonical name, as ghSearchHistory does.
    // A page past the last holds no files of a search that has results.
    let past_end = data.fetched == 0 && data.total > 0 && current > data.pages;
    if data.fetched == 0 && !past_end {
        match renamed_scope(provider, query, context).await? {
            Rescope::Renamed(renamed, warnings) => {
                let mut output = Box::pin(execute(provider, &renamed, context, security)).await?;
                for warning in warnings.into_iter().rev() {
                    push_warning_front(&mut output.data, warning);
                }
                return Ok(output);
            }
            // The repository check already failed: the empty page's own
            // check of it would read the same 404 again.
            Rescope::Missing(error) => return Err(error),
            Rescope::Stands => {}
        }
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
    // The core-quota cost of this page's line numbers (`extras:["stats"]`):
    // the files read through the contents API.
    let content_reads = resolution.as_ref().map_or(0, |resolution| resolution.reads);
    if resolution.is_none() {
        code_output::index_commits(&mut value, &mut items, &data.items, query);
    }
    let reads = code_output::shape_files(&mut value, &mut items, query, resolution);
    if content_reads > 0 {
        value["contentReads"] = json!(content_reads);
    }
    code_output::merge_identical(&mut items);
    code_output::hoist_shared(&mut value, &mut items);
    value["files"] = json!(items);
    // The shared sanitizer and selector need the captured hit evidence.
    // A classified response applies the caller's projection after selection.
    if query.clasify_context.is_none() {
        let fields = field_names(&query.fields);
        pick_rows(&mut value, "files", CODE_ROW_ID, &fields);
    }
    if data.pages > 1 || past_end {
        // The merged searches page together, so the page count is the
        // longest search's, not `totalItems / pageSize`: once a short
        // search runs out, the later pages hold the long one's share only.
        value["pagination"] =
            crate::response::pages::PageFacts::sized(current, data.pages, data.total, more)
                .with_page_size(per)
                .out_of_range(past_end)
                .to_value();
    }
    add_next(&mut value, ToolId::GhSearchCode, query, current, more);
    // A file lists at most a few of its hit lines; `readHits` reads the rest.
    let hits_unlisted = !reads.hits.is_empty();
    add_reads(&mut value, reads);
    // The index scope is stated once, on the first page of a ref search.
    if !items.is_empty() && current == 1 {
        code_output::disclose_index_ref(provider, &mut value, query, resolved_sha, context).await?;
    }
    disclose_completeness(&mut value, query, &data, current, hits_unlisted);
    let mut output = ToolData::from(value);
    if data.incomplete {
        output.diagnostics.add(
            "ghIncompleteResults",
            "GitHub reported an incomplete search index result; retry, narrow the scope, or verify locally before concluding absence.",
            true,
        );
    }
    if data.fetched == 0 {
        output.status = Some("empty");
    }
    if data.fetched == 0 && data.incomplete && query.repo.is_none() {
        code_output::owner_exists(&query.owner, &provider.transport, context).await?;
    }
    if data.fetched == 0 && !past_end {
        empty_page(provider, query, context, &mut output).await?;
    }
    Ok(output)
}

/// The page's reads: `read` (the top hit) and `readHits`, `readHits2`, …,
/// one per file whose hit lines were capped or cut.
fn add_reads(value: &mut serde_json::Value, reads: code_output::PageReads) {
    if let Some(read) = reads.top {
        value["next"]["read"] = read;
    }
    for (position, read) in reads.hits.into_iter().enumerate() {
        let key = match position {
            0 => "readHits".to_owned(),
            n => format!("readHits{}", n + 1),
        };
        value["next"][key] = read;
    }
}

/// What the page says about its own completeness: provider-index
/// completeness on every page, apart from whether another page exists; a
/// last page with unlisted hit lines (it has no other way to say why it is
/// partial: an earlier page states its remainder through `pagination`); the
/// estimate and repeat facts of a paged search; and SAML-withheld
/// organizations.
fn disclose_completeness(
    value: &mut serde_json::Value,
    query: &GhSearchCodeQuery,
    data: &SearchPage,
    current: usize,
    hits_unlisted: bool,
) {
    let more = current < data.pages;
    apply_partial(
        value,
        query,
        &SearchCompleteness {
            tool: ToolId::GhSearchCode,
            matched: data.matched,
            reachable: data.total,
            incomplete: data.incomplete,
            page: current,
            has_more: more,
            subject: "code",
        },
    );
    if hits_unlisted && !more {
        mark_partial(value, "hitLinesNotListed", &[]);
    }
    if data.pages > 1 {
        push_warnings(value, data.paging_warnings());
    }
    if let Some(warning) = octocode_github::sso_partial_warning(&data.sso_partial) {
        push_warning_front(value, warning);
    }
}

/// One merged page across `extensions`: GitHub ANDs repeated `extension:`
/// qualifiers, so each extension is its own indexed search of
/// `ceil(pageSize / k)` files a GitHub page ([`per_search`]). Page 1 lists
/// page 1 of every search; their totals lay out the later pages, which take
/// the searches' remaining GitHub pages `k` at a time, page by page in
/// extension order ([`later_pages`]). A search that has run out is never
/// asked for a later page, a page stays about `pageSize` files while any
/// search has files left, and every GitHub page is on exactly one merged
/// page: lossless. One search's page N is its GitHub page N. A later page
/// lays itself out from every search's page 1, read from the code-search
/// cache: when that cache is cold (memory storage across CLI processes, or
/// an expired page 1) each page 1 is searched again, one request per
/// search, an exhausted one included.
struct SearchPage {
    /// The files this page lists: GitHub's, less those an earlier page of
    /// the same search already listed.
    items: Vec<octocode_github::CodeSearchItem>,
    /// Files GitHub returned for the page, before repeats were dropped.
    fetched: usize,
    /// Repeats dropped: files an earlier page (or this one) already listed.
    dropped: usize,
    /// Earlier page searches the repeat check could read, of those it needed.
    earlier_checked: usize,
    earlier_total: usize,
    /// Reachable results (each search's window ends at its last whole
    /// page within 1,000 results).
    total: usize,
    pages: usize,
    /// GitHub's match counts, summed over the merged searches.
    matched: usize,
    incomplete: bool,
    /// Organizations SAML enforcement withheld from the merged searches.
    sso_partial: Vec<u64>,
}

/// The GitHub pages (search index, page number) merged page `current`
/// (≥ 2) lists, given each search's page count: pages 2 and on of every
/// search that has them, page by page, `searches` to a merged page.
fn later_pages(pages: &[usize], current: usize) -> Vec<(usize, usize)> {
    let per = pages.len().max(1);
    let deepest = pages.iter().copied().max().unwrap_or(0);
    (2..=deepest)
        .flat_map(|page| {
            pages
                .iter()
                .enumerate()
                .filter(move |&(_, &count)| count >= page)
                .map(move |(search, _)| (search, page))
        })
        .skip((current.saturating_sub(2)).saturating_mul(per))
        .take(per)
        .collect()
}

/// Merged pages of searches with these page counts: page 1, then the
/// later GitHub pages `searches` at a time; none when every search is empty.
fn merged_pages(pages: &[usize]) -> usize {
    if pages.iter().all(|&count| count == 0) {
        return 0;
    }
    let later: usize = pages.iter().map(|count| count.saturating_sub(1)).sum();
    1 + later.div_ceil(pages.len().max(1))
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
    let per_search = per_search(query, per);
    let mut page = SearchPage {
        items: Vec::new(),
        fetched: 0,
        dropped: 0,
        earlier_checked: 0,
        earlier_total: 0,
        total: 0,
        pages: 0,
        matched: 0,
        incomplete: false,
        sso_partial: Vec::new(),
    };
    let searches = scopes
        .into_iter()
        .map(|extension| CodeSearchRequest {
            query: query::code(query, extension),
            page: 1,
            per_page: per_search,
            include_fragments: query.match_in != GhSearchCodeQueryMatchIn::Path,
        })
        .collect::<Vec<_>>();
    let at = |search: usize, number: usize| CodeSearchRequest {
        page: number,
        ..searches[search].clone()
    };
    let merged = searches.len() > 1;
    // Each GitHub page takes its own window slot, so a row whose uncached
    // searches cannot all start within the wait cap is refused before the
    // first is sent, not midway with its slots spent.
    let refuse = |sends: usize| match provider.transport.code_search_batch_refusal(sends, context) {
        Some(refusal) => Err(refusal),
        None => Ok(()),
    };
    // A later merged page is laid out by every search's page 1 (usually
    // cached by the walk's first page). Uncached ones are read first; the
    // pages they lay out are counted unseen, as all uncached.
    let mut firsts = Vec::new();
    let mut reserved = false;
    if merged && current > 1 {
        for search in &searches {
            firsts.push(
                provider
                    .transport
                    .cached_code_search(search, context)
                    .await?,
            );
        }
        let missing = firsts.iter().filter(|first| first.is_none()).count();
        if missing > 0 {
            refuse(missing + searches.len())?;
            reserved = true;
        }
        for (search, first) in searches.iter().zip(&mut firsts) {
            if first.is_none() {
                *first = Some(provider.transport.search_code(search, context).await?);
            }
        }
    }
    let counts = |firsts: &[Option<octocode_github::CodeSearchPage>]| {
        firsts
            .iter()
            .map(|first| first.as_ref().map_or(0, |first| first.total_count))
            .collect::<Vec<_>>()
    };
    let reach_pages = |counts: &[usize]| {
        counts
            .iter()
            .map(|&count| SearchWindow::PageEnd.reach(count, per_search).pages)
            .collect::<Vec<_>>()
    };
    let units = if merged && current > 1 {
        later_pages(&reach_pages(&counts(&firsts)), current)
    } else {
        (0..searches.len())
            .map(|search| (search, current))
            .collect()
    };
    let requests = units
        .iter()
        .map(|&(search, number)| at(search, number))
        .collect::<Vec<_>>();
    let mut cached = Vec::with_capacity(requests.len());
    for request in &requests {
        cached.push(
            provider
                .transport
                .cached_code_search(request, context)
                .await?,
        );
    }
    if !reserved {
        refuse(cached.iter().filter(|page| page.is_none()).count())?;
    }
    // GitHub's index moves between page reads, so a file can come back on a
    // later page. The earlier pages of each listed search that are still
    // cached (no request) say which files the walk already delivered.
    let mut seen = std::collections::HashSet::new();
    let mut checked = Vec::with_capacity(units.len());
    for &(search, number) in &units {
        // A search's first page here is its lowest: the earlier ones precede it.
        if checked.contains(&search) {
            continue;
        }
        checked.push(search);
        for earlier in 1..number {
            page.earlier_total += 1;
            if let Ok(Some(listed)) = provider
                .transport
                .cached_code_search(&at(search, earlier), context)
                .await
            {
                page.earlier_checked += 1;
                seen.extend(listed.items.iter().map(repeat_key));
            }
        }
    }
    let mut unit_counts = Vec::with_capacity(requests.len());
    for (request, cached) in requests.iter().zip(cached) {
        let data = match cached {
            Some(data) => data,
            None => provider.transport.search_code(request, context).await?,
        };
        unit_counts.push(data.total_count);
        page.incomplete |= data.incomplete_results;
        for organization in data.sso_partial_organizations {
            if !page.sso_partial.contains(&organization) {
                page.sso_partial.push(organization);
            }
        }
        page.fetched += data.items.len();
        for item in data.items {
            if seen.insert(repeat_key(&item)) {
                page.items.push(item);
            } else {
                page.dropped += 1;
            }
        }
    }
    // Merged totals are every search's page-1 count, so each page of the
    // walk states the same layout; one search states its own page's.
    let counts = if merged && current > 1 {
        counts(&firsts)
    } else {
        unit_counts
    };
    for &count in &counts {
        page.total += SearchWindow::PageEnd.reach(count, per_search).total;
        page.matched += count;
    }
    page.pages = merged_pages(&reach_pages(&counts));
    Ok(page)
}

/// A file's identity across pages: its repository and path (its blob `sha`
/// changes with the index state, so it is not part of it).
fn repeat_key(item: &octocode_github::CodeSearchItem) -> (String, String) {
    (item.repository.full_name.to_lowercase(), item.path.clone())
}

impl SearchPage {
    /// What a paged page says about overlap: the repeats this page dropped,
    /// with how many earlier pages the check could read. That GitHub's
    /// totals are estimates is static and lives in the tool description.
    fn paging_warnings(&self) -> Vec<String> {
        let mut warnings = Vec::new();
        if self.dropped > 0 {
            let files = if self.dropped == 1 { "file" } else { "files" };
            warnings.push(format!(
                "Dropped {} {files} GitHub listed again (already on an earlier page or this one).",
                self.dropped,
            ));
        }
        // Said beside a found repeat, to scope it: a page the caller jumped
        // to dropped nothing, and a missed repeat would list a row twice,
        // not lose one, so a clean or uncheckable page restates nothing.
        if self.dropped > 0 {
            warnings.push(format!(
                "Repeat check read {} of {} earlier page{}; pages no longer cached were not compared.",
                self.earlier_checked,
                self.earlier_total,
                if self.earlier_total == 1 { "" } else { "s" },
            ));
        }
        warnings
    }
}

/// What an empty scoped search learned of its repository's name.
enum Rescope {
    /// The query re-scoped to the canonical name, with the rename warning.
    Renamed(Box<GhSearchCodeQuery>, Vec<String>),
    /// The repository does not exist: the search's not-found failure.
    Missing(ProviderError),
    /// The name stands, cannot be checked, or the search is owner-wide.
    Stands,
}

/// [`Rescope`] of an empty search's scope.
async fn renamed_scope<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    context: &RequestContext,
) -> Result<Rescope, ProviderError> {
    use crate::tools::gh_shared::CanonicalScope;
    let Some(scoped) = query.repo.as_deref() else {
        return Ok(Rescope::Stands);
    };
    let (owner, repo) = match crate::tools::gh_shared::canonical_scope(
        provider,
        &query.owner,
        scoped,
        context,
        crate::tools::gh_shared::RenameCheck::Metadata,
    )
    .await?
    {
        CanonicalScope::Renamed(canonical) => canonical,
        CanonicalScope::Missing(error) => return Ok(Rescope::Missing(error)),
        CanonicalScope::Stands => return Ok(Rescope::Stands),
    };
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
    Ok(Rescope::Renamed(Box::new(renamed), vec![warning]))
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
    let hints = code_output::empty_hints(query);
    if value.get("hints").is_none() && !hints.is_empty() {
        value["hints"] = json!(hints);
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
    fn selects_provider_page(&self) -> bool {
        true
    }

    fn finish_selection(&self, data: &mut serde_json::Value, query: &serde_json::Value) {
        crate::tools::gh_shared::finish_code_selection(data, query);
    }

    fn fallback_hint(&self, query: &serde_json::Value) -> &'static str {
        use crate::tools::output::has_value;
        if query["matchIn"] == "path" {
            "Try a shorter name fragment, or ghStructure include to find paths by name."
        } else if ["extensions", "filename", "path"]
            .iter()
            .any(|key| has_value(query, key))
        {
            "Drop extensions/filename/path or use fewer keywords; only the default branch is indexed."
        } else if query["keywords"].as_array().is_some_and(|k| k.len() > 1) {
            "An empty index result is unproven absence: use fewer keywords, or ghGetFileContent a likely file to verify."
        } else if has_value(query, "repo") {
            "An empty index result is unproven absence: ghStructure the repository, then ghGetFileContent likely files to verify."
        } else {
            "An empty index result is unproven absence: ghSearchRepo the owner's repositories, then ghStructure one to verify."
        }
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
}

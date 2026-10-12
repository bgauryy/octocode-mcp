//! ghSearchRepo: repository search, or an owner-only repository listing.
#[cfg(test)]
mod provider_tests;
mod query;

use crate::providers::github::{
    ConditionalCache, GitHubProvider, ProviderError, RepositorySearchPage, RepositorySearchRequest,
    RequestContext,
};
use crate::tools::gh_shared::{
    GhFailure, SEARCH_RESULT_CAP, add_next, apply_partial, field_names, pick_rows, push_warning,
    reject_window, search_failure, with_search_repair,
};
use crate::tools::id::ToolId;
use crate::tools::num::usize_of;
use crate::tools::result::{Continuation, ToolData, remove_null_fields};
use serde_json::{Value, json};

pub use crate::contracts::tool_types::{GhSearchRepoQuery, GhSearchRepoQuerySort};

/// Run one ghSearchRepo row.
pub async fn run<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchRepoQuery,
    request: Result<&RequestContext, ProviderError>,
) -> Result<ToolData, GhFailure> {
    let result = match request {
        Ok(context) => execute(provider, query, context).await,
        Err(error) => Err(error),
    };
    result.map_err(|error| {
        // An owner listing's bare 404 is the login itself.
        let missing_owner = owner_only(query).filter(|_| {
            error.kind == crate::providers::github::ProviderErrorKind::NotFound
                && error.reason.is_none()
        });
        let failure = with_search_repair(
            search_failure(error, None),
            ToolId::GhSearchRepo,
            query,
            page_size(query),
            query.repo.as_deref().map(|repo| repo.as_str()),
        );
        // The message names the login; no repair lead exists for it.
        match missing_owner {
            Some(owner) => GhFailure {
                message: format!(
                    "Owner \"{owner}\" not found: no GitHub user or organization has this login"
                ),
                hints: Vec::new(),
                ..failure
            },
            None => failure,
        }
    })
}

/// Repositories per page: the query's, within the contract maximum.
fn page_size(query: &GhSearchRepoQuery) -> usize {
    usize_of(query.page_size).min(crate::contracts::query_schema_max(
        ToolId::GhSearchRepo,
        None,
        "pageSize",
    ))
}

pub(crate) async fn execute<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchRepoQuery,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    query::validate_repo_scope(query)?;
    if let (Some(owner), Some(repo)) = (query.owner.as_deref(), query.repo.as_deref())
        && !filtered(query)
    {
        return exact_repository(provider, query, owner, repo, context).await;
    }
    let current = usize_of(query.page);
    let per = page_size(query);
    let owner_only = owner_only(query);
    // The owner listing pages through the REST list API, which has no
    // 1,000-result search window; only search is bounded by it.
    let (data, listing) = match owner_only {
        Some(owner) => {
            let (data, listing) = owner_listing(provider, owner, current, per, context).await?;
            (data, Some(listing))
        }
        None => {
            reject_window(current, per)?;
            let data = provider
                .transport
                .search_repositories(
                    &RepositorySearchRequest {
                        query: query::repositories(query),
                        sort: (query.sort != GhSearchRepoQuerySort::BestMatch)
                            .then(|| query.sort.to_string()),
                        page: current,
                        per_page: per,
                    },
                    context,
                )
                .await?;
            (data, None)
        }
    };
    let total = data.total_count.min(SEARCH_RESULT_CAP);
    let pages = total.div_ceil(per);
    let more = match &listing {
        Some(listing) => listing.more,
        None => current < pages,
    };
    let provider_incomplete = data.incomplete_results;
    // An owner listing reports no total (REST pages, no search window).
    let provider_matched = if listing.is_none() {
        data.total_count
    } else {
        0
    };
    let provider_capped = provider_matched > SEARCH_RESULT_CAP;
    let mut leads = top_leads(data.items.first());
    // Archived repositories are excluded unless the caller set `archived`;
    // a listing that skipped some offers them (the description states the
    // search default once).
    let archived_skipped = listing.as_ref().map_or(0, |listing| listing.archived);
    let excluded = query.include_archived != Some(true) && archived_skipped > 0;
    if excluded {
        leads.insert(
            leads.len().min(1),
            ("includeArchived", include_archived(query)),
        );
    }
    let wanted = wanted_topics(query);
    let fields = field_names(&query.fields);
    let repositories = data
        .items
        .into_iter()
        .map(|item| repository_row(item, &wanted))
        .collect::<Vec<_>>();
    let repositories_empty = repositories.is_empty();
    // A page past the last has no rows though the search (or the listing's
    // earlier pages) has some: the shared response stage restarts it.
    let past_end = repositories_empty
        && current > 1
        && match &listing {
            Some(_) => archived_skipped == 0,
            None => total > 0 && current > pages,
        };
    let mut value = match &listing {
        // The REST listing reports no total: `page` is the provider page
        // cursor and `next.nextPage` follows the real Link header. The
        // listing is ordered by latest push (the `owner` description says
        // so); page counters are verbose (core field class).
        Some(listing) => {
            let mut pagination = crate::response::pages::PageFacts::open(current, Some(per), more)
                .out_of_range(past_end)
                .to_value();
            pagination["providerPagesRead"] = json!(listing.last_page + 1 - current);
            json!({"repositories":repositories,"pagination":pagination})
        }
        None => json!({"repositories":repositories,"pagination":
            crate::response::pages::PageFacts::counted(current, per, total)
                .out_of_range(past_end)
                .to_value()}),
    };
    let next_from = listing
        .as_ref()
        .map_or(current, |listing| listing.last_page);
    add_next(&mut value, ToolId::GhSearchRepo, query, next_from, more);
    for (name, lead) in leads {
        value["next"][name] = lead;
    }
    apply_partial(
        &mut value,
        ToolId::GhSearchRepo,
        query,
        provider_incomplete,
        provider_matched,
        current,
        more,
        "repository",
    );
    if archived_skipped > 0 {
        push_warning(
            &mut value,
            format!(
                "{} skipped",
                crate::response::pages::counted(
                    u64::try_from(archived_skipped).unwrap_or(u64::MAX),
                    "archived repository",
                    "archived repositories"
                )
            ),
        );
    }
    pick_rows(&mut value, "repositories", REPO_ID, &fields);
    let output = repository_output(
        value,
        query,
        repositories_empty && !more && !past_end,
        provider_incomplete,
        provider_capped,
    );
    Ok(output)
}

/// `owner`+`repo` alone: that repository's row, with its default branch, from the
/// repository endpoint; no search request and no page.
async fn exact_repository<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhSearchRepoQuery,
    owner: &str,
    repo: &str,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let item = provider.transport.repository(owner, repo, context).await?;
    let row = repository_row(item, &[]);
    let fields = field_names(&query.fields);
    let mut value = json!({ "repositories": [row] });
    pick_rows(&mut value, "repositories", REPO_ID, &fields);
    Ok(ToolData::from(value))
}

/// A repository row's id: a `fields` pick keeps it.
const REPO_ID: &[&str] = &["owner", "repo"];

/// The filters a query sets beside its keywords, by wire name: the one
/// table every narrowing check reads.
fn set_filters(query: &GhSearchRepoQuery) -> Vec<&'static str> {
    [
        ("topics", !query.topics.is_empty()),
        ("language", query.language.is_some()),
        ("stars", query.stars.is_some()),
        ("pushed", query.pushed.is_some()),
        ("created", query.created.is_some()),
        ("match", !query.match_in.is_empty()),
        ("license", query.license.is_some()),
        ("qualifiers", query.qualifiers.is_some()),
    ]
    .into_iter()
    .filter_map(|(name, set)| set.then_some(name))
    .collect()
}

/// Filters beside owner+repo search inside that repository; without them
/// the pair is a one-row lookup.
fn filtered(query: &GhSearchRepoQuery) -> bool {
    !query.keywords.is_empty()
        || !set_filters(query).is_empty()
        // `archived:false` is the default, so it filters nothing.
        || query.include_archived == Some(true)
}

/// The owner a query only lists: no term, topic, or filter beyond the owner,
/// in an order the listing API can serve.
fn owner_only(query: &GhSearchRepoQuery) -> Option<&str> {
    let listable = !filtered(query)
        && matches!(
            query.sort,
            GhSearchRepoQuerySort::BestMatch | GhSearchRepoQuerySort::UpdatedDesc
        );
    query
        .owner
        .as_deref()
        .map(String::as_str)
        .filter(|_| listable)
}

/// List an owner's repositories by latest push. The listing API cannot rank
/// by relevance, and its own default order is creation (oldest first).
/// Search excludes archived repositories by default (`archived:false`); the
/// listing API cannot, so it filters them and keeps reading provider pages
/// until a page of kept rows, the end of the listing (no Link next), or the
/// page budget.
async fn owner_listing<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    current: usize,
    per: usize,
    context: &RequestContext,
) -> Result<(RepositorySearchPage, OwnerListing), ProviderError> {
    let mut items = Vec::new();
    let mut archived = 0;
    let mut provider_page = current;
    let more = loop {
        let (batch, has_next) = provider
            .transport
            .list_owner_repositories(owner, "pushed", provider_page, per, context)
            .await?;
        let read = batch.len();
        let kept = items.len();
        items.extend(batch.into_iter().filter(|item| !item.archived));
        archived += read - (items.len() - kept);
        if !has_next || items.len() >= per || provider_page + 1 - current >= MAX_OWNER_LISTING_PAGES
        {
            break has_next;
        }
        provider_page += 1;
    };
    Ok((
        RepositorySearchPage {
            total_count: items.len(),
            incomplete_results: false,
            items,
        },
        OwnerListing {
            last_page: provider_page,
            more,
            archived,
        },
    ))
}

/// Where the top repository leads: its default-branch root listing. Repo
/// discovery words are not code keywords, so no code-search lead follows.
fn top_leads(
    top: Option<&crate::providers::github::RepositorySearchItem>,
) -> Vec<(&'static str, Value)> {
    let Some((owner, repo)) = top.and_then(|item| item.full_name.split_once('/')) else {
        return Vec::new();
    };
    vec![(
        "viewRepo",
        Continuation::new(ToolId::GhStructure, json!({"owner": owner, "repo": repo})).build(),
    )]
}

/// The same search with archived repositories included, from its first page.
fn include_archived(query: &GhSearchRepoQuery) -> Value {
    let mut row = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    if let Some(row) = row.as_object_mut() {
        // Defaults and the brief stay out of the copied call.
        row.retain(|key, value| {
            !matches!(
                key.as_str(),
                "page" | "extras" | "sort" | "pageSize" | "mainGoal" | "reasoning"
            ) && !value.is_null()
        });
    }
    if query.sort != GhSearchRepoQuerySort::BestMatch {
        row["sort"] = json!(query.sort.to_string());
    }
    row["includeArchived"] = json!(true);
    Continuation::new(ToolId::GhSearchRepo, row).build()
}

/// Broadened variants at most: one call's batch.
const BROADEN_VARIANTS: usize = 5;

/// An empty search, broadened: one variant per set filter (and, with
/// several keywords, one per dropped keyword), run as one batch, so the
/// variant that returns rows names what emptied the search. A variant the
/// tool would reject (nothing left to search by) is skipped.
fn broaden_search(query: &GhSearchRepoQuery) -> Option<Value> {
    let mut base = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    if let Some(row) = base.as_object_mut() {
        // Defaults and the brief stay out of the copied call.
        row.retain(|key, value| {
            !matches!(
                key.as_str(),
                "page" | "extras" | "sort" | "pageSize" | "mainGoal" | "reasoning"
            ) && !value.is_null()
        });
    }
    if query.sort != GhSearchRepoQuerySort::BestMatch {
        base["sort"] = json!(query.sort.to_string());
    }
    let mut variants = Vec::new();
    for filter in set_filters(query) {
        let mut row = base.clone();
        if let Some(object) = row.as_object_mut() {
            object.remove(filter);
        }
        variants.push(row);
    }
    if query.keywords.len() >= 2 {
        variants.extend((0..query.keywords.len()).rev().map(|dropped| {
            let mut row = base.clone();
            row["keywords"] = json!(
                query
                    .keywords
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| *index != dropped)
                    .map(|(_, keyword)| keyword)
                    .collect::<Vec<_>>()
            );
            row
        }));
    }
    variants.retain(|row| {
        crate::contracts::validate(ToolId::GhSearchRepo.as_str(), json!({"queries":[row]})).is_ok()
    });
    variants.truncate(BROADEN_VARIANTS);
    (!variants.is_empty()).then(|| {
        Continuation::input(ToolId::GhSearchRepo, json!({ "queries": variants }))
            .confidence("low")
            .build()
    })
}

/// Provider pages read by one owner-only listing call before it stops.
const MAX_OWNER_LISTING_PAGES: usize = 5;

struct OwnerListing {
    /// Last provider page read; the next cursor is the page after it.
    last_page: usize,
    /// The last page carried a Link `rel="next"`.
    more: bool,
    /// Archived repositories skipped on the provider pages read.
    archived: usize,
}

fn repository_output(
    value: Value,
    query: &GhSearchRepoQuery,
    repositories_empty: bool,
    provider_incomplete: bool,
    provider_capped: bool,
) -> ToolData {
    let mut output = ToolData::from(value);
    if repositories_empty && !provider_incomplete && !provider_capped {
        output.status = Some("empty");
        if let Some(broader) = broaden_search(query) {
            output.data["next"]["broadenSearch"] = broader;
        }
    }
    output
}

fn date(value: Option<String>) -> Option<String> {
    value.map(|v| v.chars().take(10).collect())
}

/// Lowercased query topics and keyword words: a row lists these topics first.
fn wanted_topics(query: &GhSearchRepoQuery) -> Vec<String> {
    query
        .topics
        .iter()
        .map(|topic| topic.to_lowercase())
        .chain(query.keywords.iter().flat_map(|keyword| {
            let keyword = keyword.to_lowercase();
            let hyphenated = keyword.split_whitespace().collect::<Vec<_>>().join("-");
            keyword
                .split_whitespace()
                .map(str::to_owned)
                .chain(std::iter::once(hyphenated))
                .collect::<Vec<_>>()
        }))
        .collect()
}

/// One compact repository row: `owner`, `repo` and `defaultBranch` (the
/// next hop's coordinates; a page whose rows agree states the branch once in
/// `shared`), the decision facts (stars,
/// language, license, last push, creation, `archived`/`fork` when set), the whole
/// description, and every topic (query matches first). Forks and the
/// metadata-update date are verbose (core field class).
fn repository_row(
    item: crate::providers::github::RepositorySearchItem,
    wanted: &[String],
) -> Value {
    let mut topics = item.topics;
    // A topic equal to the repository's own name repeats `repo`; one equal
    // to its language repeats `language`.
    topics.retain(|topic| {
        !topic.eq_ignore_ascii_case(&item.name)
            && item
                .language
                .as_deref()
                .is_none_or(|language| !topic.eq_ignore_ascii_case(language))
    });
    // Stable: matching topics keep GitHub's order, then the rest.
    topics.sort_by_key(|topic| !wanted.contains(&topic.to_lowercase()));
    let (owner, repo) = item
        .full_name
        .split_once('/')
        .map_or((None, item.name.clone()), |(owner, repo)| {
            (Some(owner.to_owned()), repo.to_owned())
        });
    let default_branch = Some(item.default_branch).filter(|branch| !branch.is_empty());
    let mut row = json!({
        "owner": owner,
        "repo": repo,
        "defaultBranch": default_branch,
        "stars": item.stargazers_count,
        "language": item.language,
        "license": item.license.and_then(|license| license.spdx_id),
        "pushedAt": date(item.pushed_at),
        "createdAt": date(item.created_at),
        "description": item.description,
    });
    if item.archived {
        row["archived"] = json!(true);
    }
    // A fork in an owner listing is not the owner's own source.
    if item.fork {
        row["fork"] = json!(true);
    }
    if !topics.is_empty() {
        row["topics"] = json!(topics);
    }
    row["forks"] = json!(item.forks_count);
    row["updatedAt"] = json!(date(item.updated_at));
    remove_null_fields(&mut row);
    row
}

/// This tool's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, query: &serde_json::Value) -> &'static str {
        use crate::tools::output::has_value;
        if [
            "topics",
            "language",
            "stars",
            "pushed",
            "created",
            "license",
            "qualifiers",
        ]
        .iter()
        .any(|key| has_value(query, key))
        {
            "Drop topics/language/stars/date/license filters or use fewer keywords."
        } else {
            "Use fewer or broader keywords, or set owner and repo to open one."
        }
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
    fn clasify_items(
        &self,
        _source: &crate::tools::clasify::resource::ResourceSource,
        state: &serde_json::Value,
    ) -> Option<Vec<crate::tools::clasify::items::Item>> {
        clasify_repositories(state)
    }
}

/// One clasify candidate per repository, read through ghStructure.
fn clasify_repositories(
    state: &serde_json::Value,
) -> Option<Vec<crate::tools::clasify::items::Item>> {
    use crate::tools::clasify::items;
    let found = items::page_data(state)?
        .get("repositories")?
        .as_array()?
        .iter()
        .filter_map(|repository| {
            let owner = repository.get("owner")?.as_str()?;
            let repo = repository.get("repo")?.as_str()?;
            let mut fetch = serde_json::Map::new();
            fetch.insert("owner".into(), json!(owner));
            fetch.insert("repo".into(), json!(repo));
            Some(items::Item {
                state: items::narrowed(
                    state,
                    "/results/0/data/repositories",
                    vec![repository.clone()],
                ),
                read: Some(items::read(ToolId::GhStructure, fetch)),
                path: None,
                item: Some(format!("{owner}/{repo}")),
            })
        })
        .collect();
    Some(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_repository_zero_is_empty_but_partial_zero_is_not() {
        let query: GhSearchRepoQuery =
            serde_json::from_value(json!({"keywords":["x"],"language":"rust"})).expect("query");
        let complete = repository_output(json!({"repositories":[]}), &query, true, false, false);
        assert_eq!(complete.status, Some("empty"));
        assert!(complete.data.get("hints").is_none());
        assert_eq!(
            complete.data["next"]["broadenSearch"]["query"]["queries"],
            json!([{"keywords":["x"]}])
        );

        for (incomplete, capped) in [(true, false), (false, true)] {
            let partial =
                repository_output(json!({"repositories":[]}), &query, true, incomplete, capped);
            assert_eq!(partial.status, None);
            assert!(partial.data.get("hints").is_none());
            assert!(partial.data.get("next").is_none());
        }
    }

    /// A topic that only repeats the repository's own name is dropped;
    /// every other topic stays.
    #[test]
    fn topic_naming_the_repository_itself_is_dropped() {
        let item: crate::providers::github::RepositorySearchItem = serde_json::from_value(json!({
            "full_name":"harlanc/xiu","name":"xiu","html_url":"h","default_branch":"main",
            "topics":["rtmp","XIU","rust"]
        }))
        .expect("item");
        let row = repository_row(item, &[]);
        assert_eq!(row["topics"], json!(["rtmp", "rust"]), "{row}");
    }

    /// A topic that only repeats the row's `language` is dropped too.
    #[test]
    fn topic_naming_the_language_is_dropped() {
        let item: crate::providers::github::RepositorySearchItem = serde_json::from_value(json!({
            "full_name":"psf/requests","name":"requests","html_url":"h","default_branch":"main",
            "language":"Python","topics":["python","http"]
        }))
        .expect("item");
        let row = repository_row(item, &[]);
        assert_eq!(row["topics"], json!(["http"]), "{row}");
        assert_eq!(row["language"], "Python", "{row}");
    }
}

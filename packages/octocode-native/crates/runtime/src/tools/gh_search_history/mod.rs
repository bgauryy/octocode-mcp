//! GitHub history *search* — pull requests, issues, and commits.
//!
//! **Cache bypass is intentional.**  This tool uses `&provider.transport`
//! directly rather than the `GitHubProvider<_, GitHubContentCache>` wrapper, so
//! none of the `ConditionalCache` ETag / disk-tier machinery applies.  History
//! search results are inherently mutable (new PRs/issues appear, existing ones
//! are updated, merged, or closed), so caching them would serve stale state;
//! the GitHub API's own rate-limit budget is the right throttle here.
mod errors;
mod filters;
mod leads;
mod query;
pub(crate) mod rows;
mod shape;
#[cfg(test)]
mod tests;

pub use crate::contracts::tool_types::{
    GhSearchHistoryQuery, GhSearchHistoryQueryOwner, GhSearchHistoryQueryRepo,
};
use crate::providers::github::{
    CommitListRequest, GitHubTransport, HistoryPage, HistoryRequest, ProviderError,
    ProviderErrorKind, ProviderErrorReason, PullListRequest, RequestContext,
};
use crate::security::scan::ContentScan;
use crate::tools::gh_shared::field_names;
use crate::tools::num::usize_of;
pub(crate) use errors::history_failure;
use filters::Filters;
use serde_json::{Value, json};

/// The operation discriminant of a [`GhSearchHistoryQuery`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HistoryOperation {
    PullRequest,
    Issue,
    Commit,
}

/// Operation-independent views over the generated wire query.
impl GhSearchHistoryQuery {
    pub(crate) fn operation(&self) -> HistoryOperation {
        match self {
            Self::PullRequest { .. } => HistoryOperation::PullRequest,
            Self::Issue { .. } => HistoryOperation::Issue,
            Self::Commit { .. } => HistoryOperation::Commit,
        }
    }
    pub(crate) fn owner(&self) -> Option<&str> {
        match self {
            Self::PullRequest { owner, .. } => owner.as_deref().map(String::as_str),
            Self::Issue { owner, .. } | Self::Commit { owner, .. } => Some(owner.as_str()),
        }
    }
    pub(crate) fn repo(&self) -> Option<&str> {
        match self {
            Self::PullRequest { repo, .. } => repo.as_deref().map(String::as_str),
            Self::Issue { repo, .. } | Self::Commit { repo, .. } => Some(repo.as_str()),
        }
    }
    /// Points the query at a repository's canonical (post-rename) name.
    /// Names the contract would reject leave the query unchanged.
    pub(crate) fn set_scope(&mut self, new_owner: &str, new_repo: &str) {
        let (Ok(new_owner), Ok(new_repo)) = (
            new_owner.parse::<GhSearchHistoryQueryOwner>(),
            new_repo.parse::<GhSearchHistoryQueryRepo>(),
        ) else {
            return;
        };
        match self {
            Self::PullRequest { owner, repo, .. } => {
                *owner = Some(new_owner);
                *repo = Some(new_repo);
            }
            Self::Issue { owner, repo, .. } | Self::Commit { owner, repo, .. } => {
                *owner = new_owner;
                *repo = new_repo;
            }
        }
    }
    pub(crate) fn keywords(&self) -> Vec<&str> {
        match self {
            Self::PullRequest { keywords, .. } | Self::Issue { keywords, .. } => {
                keywords.iter().map(String::as_str).collect()
            }
            Self::Commit { keywords, .. } => keywords.iter().map(|k| k.as_str()).collect(),
        }
    }
    pub(crate) fn qualifiers(&self) -> Option<&str> {
        match self {
            Self::PullRequest { qualifiers, .. } => qualifiers.as_deref().map(String::as_str),
            Self::Issue { qualifiers, .. } => qualifiers.as_deref().map(String::as_str),
            Self::Commit { qualifiers, .. } => qualifiers.as_deref().map(String::as_str),
        }
    }
    /// The `fields` pick; empty keeps rows whole.
    pub(crate) fn fields(&self) -> Vec<String> {
        match self {
            Self::PullRequest { fields, .. } => field_names(fields),
            Self::Issue { fields, .. } => field_names(fields),
            Self::Commit { fields, .. } => field_names(fields),
        }
    }
    pub(crate) fn page(&self) -> Option<usize> {
        match self {
            Self::PullRequest { page, .. }
            | Self::Issue { page, .. }
            | Self::Commit { page, .. } => Some(usize_of(*page)),
        }
    }
    pub(crate) fn page_size(&self) -> Option<usize> {
        match self {
            Self::PullRequest { page_size, .. }
            | Self::Issue { page_size, .. }
            | Self::Commit { page_size, .. } => page_size.as_ref().map(|size| usize_of(size.0)),
        }
    }
    pub(crate) fn path(&self) -> Option<&str> {
        match self {
            Self::Commit { path, .. } => path.as_ref().map(|value| value.as_str()),
            _ => None,
        }
    }
    pub(crate) fn since(&self) -> Option<&str> {
        match self {
            Self::PullRequest { since, .. } | Self::Issue { since, .. } => {
                since.as_ref().map(|value| value.as_str())
            }
            Self::Commit { since, .. } => since.as_ref().map(|value| value.as_str()),
        }
    }
    pub(crate) fn until(&self) -> Option<&str> {
        match self {
            Self::PullRequest { until, .. } | Self::Issue { until, .. } => {
                until.as_ref().map(|value| value.as_str())
            }
            Self::Commit { until, .. } => until.as_ref().map(|value| value.as_str()),
        }
    }
    /// The ref a commit listing walks.
    pub(crate) fn reference(&self) -> Option<&str> {
        match self {
            Self::Commit { ref_, .. } => ref_.as_ref().map(|value| value.as_str()),
            _ => None,
        }
    }
    /// The wire `sort` is `field` or `field:direction`; this is the field.
    pub(crate) fn sort(&self) -> Option<String> {
        self.sort_spec().map(|spec| {
            spec.split_once(':')
                .map_or(spec.as_str(), |(f, _)| f)
                .to_owned()
        })
    }
    /// The direction half of the wire `sort`, when it names one.
    pub(crate) fn order(&self) -> Option<String> {
        self.sort_spec()
            .and_then(|spec| spec.split_once(':').map(|(_, order)| order.to_owned()))
    }
    fn sort_spec(&self) -> Option<String> {
        match self {
            Self::PullRequest { sort, .. } | Self::Issue { sort, .. } => {
                sort.as_ref().map(ToString::to_string)
            }
            Self::Commit { .. } => None,
        }
    }
}

/// A history search: the wire query plus the GitHub filters its
/// `qualifiers` string sets, parsed once. The wire query keeps `qualifiers`
/// as sent, so a continuation replays the same filters.
#[derive(Clone, Debug)]
pub struct HistorySearch {
    pub query: GhSearchHistoryQuery,
    filters: Filters,
}

impl std::ops::Deref for HistorySearch {
    type Target = GhSearchHistoryQuery;
    fn deref(&self) -> &GhSearchHistoryQuery {
        &self.query
    }
}

impl HistorySearch {
    /// Parses the query's `qualifiers` into filters.
    pub fn new(query: GhSearchHistoryQuery) -> Result<Self, ProviderError> {
        let filters = Filters::parse(&query)?;
        Ok(Self { query, filters })
    }
    fn filters(&self) -> &Filters {
        &self.filters
    }
    pub(crate) fn author(&self) -> Option<&str> {
        self.filters.author.as_deref()
    }
    /// The commit committer filter (`committer:`).
    pub(crate) fn committer(&self) -> Option<&str> {
        self.filters.committer.as_deref()
    }
    /// The PR source branch filter (`head:`).
    pub(crate) fn head(&self) -> Option<&str> {
        self.filters.head.as_deref()
    }
    /// The PR target branch filter (`base:`).
    pub(crate) fn base(&self) -> Option<&str> {
        self.filters.base.as_deref()
    }
    pub(crate) fn state(&self) -> Option<String> {
        match &self.query {
            GhSearchHistoryQuery::PullRequest { state, .. }
            | GhSearchHistoryQuery::Issue { state, .. } => state.as_ref().map(ToString::to_string),
            GhSearchHistoryQuery::Commit { .. } => None,
        }
        .or_else(|| self.filters.state.clone())
    }
    /// Labels set by `label:` qualifiers; all must match.
    pub(crate) fn label(&self) -> &[String] {
        &self.filters.label
    }
}

/// A failed history search: the provider error and, when one call repairs
/// it, that lead (keyed by name).
#[derive(Debug)]
pub struct HistoryFailure {
    pub error: ProviderError,
    pub next: Option<Value>,
}

impl From<ProviderError> for HistoryFailure {
    fn from(error: ProviderError) -> Self {
        Self { error, next: None }
    }
}

/// Runs one history search: GitHub search for keywords and search-only
/// filters, else the REST list endpoint.
pub async fn execute(
    transport: &GitHubTransport,
    query: GhSearchHistoryQuery,
    context: &RequestContext,
    security: &impl ContentScan,
) -> Result<Value, HistoryFailure> {
    let mut query = HistorySearch::new(query)?;
    let page = query.page().unwrap_or(1);
    let per = page_size(&query);
    let searching = query::uses_search(&query);
    if searching {
        crate::tools::gh_shared::reject_window(page, per)?;
    }
    let mut unconfirmed = Vec::new();
    if searching && query.operation() == HistoryOperation::Commit {
        unconfirmed = confirm_commit_users(transport, &query, context).await?;
    }
    let mut fetched = fetch(transport, &query, page, per, searching, context).await;
    let mut rename_warnings = Vec::new();
    // GitHub search does not follow renames, so a renamed repository answers
    // with no rows or a 422; only then is the canonical name looked up.
    if searching
        && may_be_renamed(&fetched)
        && let Some(warnings) = follow_rename(transport, &mut query, context).await?
    {
        rename_warnings = warnings;
        fetched = fetch(transport, &query, page, per, searching, context).await;
    }
    let Fetched {
        mut result,
        terms,
        warnings,
    } = fetched.map_err(|error| missing_scope_failure(error, &query))?;
    // A commit list answers an unknown author with no rows; only an empty
    // list pays for confirming the login.
    if !searching && query.operation() == HistoryOperation::Commit && result.items.is_empty() {
        unconfirmed = confirm_commit_users(transport, &query, context).await?;
    }
    result.warnings.splice(0..0, rename_warnings);
    result.warnings.splice(0..0, unconfirmed);
    result.warnings.extend(warnings);
    rows::sanitize_items(&mut result.items, security)?;
    let paging = shape::Paging::new(&result, page, per);
    Ok(shape::shape(&query, result, &paging, terms))
}

/// Confirms the logins a commit search or an empty commit list names
/// (`author:`, `committer:`; an email has no profile to look up), each once.
/// GitHub's commit search drops an unknown login and answers the unfiltered
/// total, and the commit list answers it with no rows, where issue and PR
/// search answer a 422; a missing login is that same typed failure. A
/// lookup that fails otherwise never blocks the answer: it is a warning.
async fn confirm_commit_users(
    transport: &GitHubTransport,
    query: &HistorySearch,
    context: &RequestContext,
) -> Result<Vec<String>, HistoryFailure> {
    let mut logins: Vec<&str> = Vec::new();
    for login in [query.author(), query.committer()].into_iter().flatten() {
        // Apps (`app/name`) have no `/users` route either.
        if !login.contains(['@', '/']) && !logins.iter().any(|l| l.eq_ignore_ascii_case(login)) {
            logins.push(login);
        }
    }
    let lookups = logins
        .iter()
        .map(|login| transport.confirm_user(login, context));
    let mut warnings = Vec::new();
    for (login, outcome) in logins
        .iter()
        .zip(futures_util::future::join_all(lookups).await)
    {
        match outcome {
            Ok(()) => {}
            Err(error) if error.reason == Some(ProviderErrorReason::UserNotFound) => {
                return Err(missing_scope_failure(error, query));
            }
            Err(error) if error.kind == ProviderErrorKind::Cancelled => return Err(error.into()),
            Err(error) => warnings.push(format!(
                "Could not confirm that user {login} exists ({}); GitHub does not report an unknown login for commits.",
                error.message
            )),
        }
    }
    Ok(warnings)
}

/// The page size: the stamped contract default, else the schema default,
/// within the schema maximum.
fn page_size(query: &HistorySearch) -> usize {
    use crate::tools::id::query_limits::gh_search_history::{PAGE_SIZE_DEFAULT, PAGE_SIZE_MAXIMUM};
    query
        .page_size()
        .unwrap_or(PAGE_SIZE_DEFAULT)
        .min(PAGE_SIZE_MAXIMUM)
}

/// One provider page and the search terms it ran.
struct Fetched {
    result: HistoryPage,
    terms: String,
    warnings: Vec<String>,
}

async fn fetch(
    transport: &GitHubTransport,
    query: &HistorySearch,
    page: usize,
    per: usize,
    searching: bool,
    context: &RequestContext,
) -> Result<Fetched, ProviderError> {
    let (terms, warnings) = query::build_query_with_warnings(query)?;
    let commit_search = searching && query.operation() == HistoryOperation::Commit;
    let newest_first = query::lists_issues_newest_first(query);
    let request = HistoryRequest {
        query: terms,
        page,
        per_page: per,
        sort: if commit_search {
            Some("committer-date".into())
        } else if newest_first {
            Some("created".into())
        } else {
            query.sort().filter(|v| v != "best-match")
        },
        order: if commit_search {
            Some("desc".into())
        } else if newest_first {
            Some(query.order().unwrap_or_else(|| "desc".into()))
        } else {
            query.order()
        },
    };
    let result = match query.operation() {
        HistoryOperation::Commit if searching => {
            transport.search_commits(&request, context).await?
        }
        HistoryOperation::Commit => list_commits(transport, query, page, per, context).await?,
        HistoryOperation::PullRequest if !searching => {
            list_pull_requests(transport, query, page, per, context).await?
        }
        _ => transport.search_issues(&request, context).await?,
    };
    Ok(Fetched {
        result,
        terms: request.query,
        warnings,
    })
}

async fn list_commits(
    transport: &GitHubTransport,
    query: &HistorySearch,
    page: usize,
    per: usize,
    context: &RequestContext,
) -> Result<HistoryPage, ProviderError> {
    let (o, r) = query::required_repo(query)?;
    // Invalid-value warnings were already collected by the terms.
    let (since, until) = query::resolve_commit_window(query, &mut Vec::new())?;
    transport
        .list_commits_by_committer(
            &CommitListRequest {
                owner: o.into(),
                repo: r.into(),
                branch: query.reference().map(str::to_owned),
                path: query.path().map(str::to_owned),
                author: query.author().map(str::to_owned),
                since,
                until: until.map(|until| query::inclusive_until(&until)),
                page,
                per_page: per,
            },
            query.committer(),
            context,
        )
        .await
}

async fn list_pull_requests(
    transport: &GitHubTransport,
    query: &HistorySearch,
    page: usize,
    per: usize,
    context: &RequestContext,
) -> Result<HistoryPage, ProviderError> {
    let (o, r) = query::required_repo(query)?;
    transport
        .list_pull_requests(
            &PullListRequest {
                owner: o.into(),
                repo: r.into(),
                state: query.state(),
                head: query.head().map(str::to_owned),
                base: query.base().map(str::to_owned),
                sort: query.sort(),
                order: query.order(),
                page,
                per_page: per,
            },
            context,
        )
        .await
}

/// A scoped search a rename could explain: no rows, or a repository GitHub
/// search could not find (its 422 "cannot be searched", typed by the
/// transport).
fn may_be_renamed(fetched: &Result<Fetched, ProviderError>) -> bool {
    match fetched {
        // Rows on other pages mean the scope exists: a page past the end is
        // not a rename.
        Ok(fetched) => fetched.result.items.is_empty() && fetched.result.total_count == 0,
        Err(error) => crate::tools::gh_shared::repository_not_found(error),
    }
}

/// Points the query at the repository's canonical name when it was renamed,
/// returning the rename warnings; `None` when the name stands. A failed
/// lookup keeps the original answer.
async fn follow_rename(
    transport: &GitHubTransport,
    query: &mut HistorySearch,
    context: &RequestContext,
) -> Result<Option<Vec<String>>, ProviderError> {
    let Some((owner, repo)) = query.owner().zip(query.repo()) else {
        return Ok(None);
    };
    match transport.canonical_owner_repo(owner, repo, context).await {
        Ok(Some(canonical)) => {
            let warning = crate::tools::gh_shared::renamed_warning(owner, repo, &canonical);
            query.query.set_scope(&canonical.0, &canonical.1);
            Ok(Some(vec![warning]))
        }
        Err(error)
            if matches!(
                error.kind,
                ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
            ) =>
        {
            Err(error)
        }
        Ok(None) | Err(_) => Ok(None),
    }
}

/// A bare GitHub 404 of a listing. A commit listing at a `ref` cannot tell
/// a missing ref from a missing repository: the message names the ref and
/// the refs listing is the one lead (it fails on a missing repository).
/// Without a ref the repository itself did not resolve; the message names it.
fn missing_scope_failure(mut error: ProviderError, query: &HistorySearch) -> HistoryFailure {
    if error.reason == Some(ProviderErrorReason::UserNotFound) {
        let next = leads::without_users(query).map(|lead| json!({ "withoutUsers": lead }));
        return HistoryFailure { error, next };
    }
    if error.kind != ProviderErrorKind::NotFound || error.reason.is_some() {
        return error.into();
    }
    let (Some(owner), Some(repo)) = (query.owner(), query.repo()) else {
        error.message = crate::tools::gh_shared::provider_message(&error).into_boxed_str();
        return error.into();
    };
    let Some(reference) = query.reference() else {
        // The repository itself did not resolve: the message names it.
        error.message = format!(
            "Repository {owner}/{repo} not found, or private and not accessible to this token"
        )
        .into_boxed_str();
        return error.into();
    };
    error.message =
        format!("Ref \"{reference}\" or repository {owner}/{repo} not found").into_boxed_str();
    HistoryFailure {
        error,
        next: Some(
            serde_json::json!({"viewRefs": crate::tools::gh_shared::ref_recovery(owner, repo)}),
        ),
    }
}

/// Output facts the shared response stages ask about.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, _query: &Value) -> &'static str {
        "Broaden keywords or remove history filters."
    }
    fn evidence_kind(&self, _query: &Value, _data: &Value) -> &'static str {
        "provider"
    }
    fn clasify_items(
        &self,
        source: &crate::tools::clasify::resource::ResourceSource,
        state: &Value,
    ) -> Option<Vec<crate::tools::clasify::items::Item>> {
        let crate::tools::clasify::resource::ResourceSource::GhSearchHistory(query) = source else {
            return None;
        };
        clasify_history(state, query)
    }
}

/// One clasify candidate per pull request, issue, or commit, read through
/// ghGetHistoryItem when its repository is known.
fn clasify_history(
    state: &Value,
    query: &GhSearchHistoryQuery,
) -> Option<Vec<crate::tools::clasify::items::Item>> {
    use crate::tools::clasify::items;
    let data = items::page_data(state)?;
    let (key, operation) = [
        ("pullRequests", "pullRequest"),
        ("issues", "issue"),
        ("commits", "commit"),
    ]
    .into_iter()
    .find(|(key, _)| data.get(*key).is_some_and(Value::is_array))?;
    let pointer = format!("/results/0/data/{key}");
    let found = data[key]
        .as_array()?
        .iter()
        .map(|row| {
            let located = clasify_item_repository(row, query);
            let mut fetch = serde_json::Map::new();
            fetch.insert("operation".into(), serde_json::json!(operation));
            let identity = match (operation, &located) {
                ("commit", Some((owner, repo))) => {
                    row.get("commitSha").and_then(Value::as_str).map(|sha| {
                        fetch.insert("ref".into(), serde_json::json!(sha));
                        format!(
                            "{owner}/{repo}@{}",
                            sha.chars().take(12).collect::<String>()
                        )
                    })
                }
                (_, Some((owner, repo))) => {
                    row.get("number").and_then(Value::as_u64).map(|number| {
                        fetch.insert("number".into(), serde_json::json!(number));
                        format!("{owner}/{repo}#{number}")
                    })
                }
                _ => None,
            };
            let read = identity.as_ref().and(located).map(|(owner, repo)| {
                fetch.insert("owner".into(), serde_json::json!(owner));
                fetch.insert("repo".into(), serde_json::json!(repo));
                items::read(crate::tools::id::ToolId::GhGetHistoryItem, fetch)
            });
            items::Item {
                state: items::narrowed(state, &pointer, vec![row.clone()]),
                read,
                path: None,
                item: identity,
            }
        })
        .collect();
    Some(found)
}

/// Owner and repository of a history item: its own fields when a search spans
/// repositories, else the searched repository.
fn clasify_item_repository(row: &Value, query: &GhSearchHistoryQuery) -> Option<(String, String)> {
    let owner = row
        .get("owner")
        .and_then(Value::as_str)
        .or_else(|| query.owner())?;
    let repo = row
        .get("repo")
        .and_then(Value::as_str)
        .or_else(|| query.repo())?;
    Some((owner.to_owned(), repo.to_owned()))
}

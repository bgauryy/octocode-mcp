//! Pieces every GitHub tool shares: the failure a tool states, search paging,
//! and the missing-path recovery of ghStructure and ghGetFileContent.
pub(crate) mod commit;
pub(crate) mod query;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;

use crate::tools::id::ToolId;
use crate::tools::paging::push_warnings;
use crate::tools::result::{Continuation, query_row};
use octocode_github::{
    ConditionalCache, GitHubProvider, ProviderError, ProviderErrorKind, ProviderErrorReason,
    RequestContext,
};
use serde_json::{Value, json};

/// Hints are rendered whole only up to the response guidance limit (120
/// chars); keep every GitHub recovery hint within it.
pub(crate) const GITHUB_AUTH_RECOVERY_HINT: &str = "Run octocode auth login or set GH_TOKEN/GITHUB_TOKEN; an invalid env token overrides stored login.";

/// A SAML-protected organization refused the token: the row's `ssoUrl` is
/// where it is authorized.
pub(crate) const SSO_AUTHORIZATION_HINT: &str =
    "Authorize this token for the organization (SAML SSO) at the row's ssoUrl, then retry.";

/// A search qualifier named a login GitHub cannot resolve.
pub(crate) const USER_QUALIFIER_HINT: &str = "A login in a user qualifier (author, assignee, reviewed-by, …) does not resolve: fix its spelling or drop it.";

/// A repository that did not resolve: GitHub answers a private repository
/// the token cannot see exactly like a missing one (the error says so); the
/// hint is the action.
pub(crate) const REPOSITORY_ACCESS_HINT: &str =
    "Check the owner/repo spelling and this token's access.";

/// A GitHub provider failure as the tool states it: its message, hints and
/// recovery `next`; the runtime adds the provider's status and rate-limit
/// metadata.
#[derive(Debug)]
pub struct GhFailure {
    /// The error and the recovery lead are boxed: they are most of the
    /// failure's size, and every GitHub tool returns it on its error path.
    pub error: Box<ProviderError>,
    pub message: String,
    pub hints: Vec<String>,
    pub next: Option<Box<Value>>,
    /// Fields the error row names besides the error (a file's identity).
    pub fields: Vec<(&'static str, Value)>,
}

impl GhFailure {
    pub(crate) fn new(error: ProviderError, message: impl Into<String>) -> Self {
        Self {
            error: Box::new(error),
            message: message.into(),
            hints: Vec::new(),
            next: None,
            fields: Vec::new(),
        }
    }

    pub(crate) fn hint(mut self, hint: impl Into<String>) -> Self {
        self.hints = vec![hint.into()];
        self
    }
}

pub(crate) fn repository_not_found(error: &ProviderError) -> bool {
    error.reason == Some(ProviderErrorReason::RepositoryNotFound)
}

/// The message every GitHub tool states for a provider failure its own
/// not-found, ref and validation wording does not cover: authentication, an
/// unresolved repository, a missing resource, an outage, a network failure or
/// timeout, else the provider's own message.
pub(crate) fn provider_message(error: &ProviderError) -> String {
    match error.kind {
        // GitHub's own words (`Bad credentials`) say what is wrong with the token.
        ProviderErrorKind::Authentication if error.status == Some(401) => {
            let detail = error.message.trim();
            if detail.is_empty() {
                "GitHub authentication required".to_owned()
            } else {
                format!("GitHub authentication required: {detail}")
            }
        }
        ProviderErrorKind::Authentication => "GitHub authentication required".to_owned(),
        ProviderErrorKind::NotFound if repository_not_found(error) => {
            "Repository not found, or private and not accessible to this token".to_owned()
        }
        ProviderErrorKind::NotFound if error.reason == Some(ProviderErrorReason::UserNotFound) => {
            // GitHub's own words say which logins failed to resolve.
            format!(
                "A user named in the search qualifiers does not exist or is not visible to this token. GitHub: {}",
                error
                    .message
                    .trim()
                    .strip_prefix("Validation Failed: ")
                    .unwrap_or(error.message.trim())
            )
        }
        ProviderErrorKind::NotFound => "Repository, resource, or path not found".to_owned(),
        ProviderErrorKind::Server if matches!(error.status, Some(502..=504)) => {
            "GitHub API temporarily unavailable".to_owned()
        }
        ProviderErrorKind::Transport => "Network connection failed".to_owned(),
        ProviderErrorKind::Timeout => "Request timeout".to_owned(),
        _ => error.message.to_string(),
    }
}

/// A GitHub 422 as `summary: detail`, keeping GitHub's own detail (e.g.
/// `"abc" is not a numeric value`): it names the bad input.
pub(crate) fn validation_message(error: &ProviderError, summary: &str) -> String {
    let detail = error.message.trim();
    let detail = detail.strip_prefix("Validation Failed: ").unwrap_or(detail);
    if detail.is_empty() || detail.eq_ignore_ascii_case("Validation Failed") {
        summary.to_owned()
    } else {
        format!("{summary}: {detail}")
    }
}

/// The hint every GitHub tool gives for a failure whose recovery does not
/// depend on the tool: authenticate, or check the repository's access.
/// Other failures take the runtime's one hint per error kind.
pub(crate) fn provider_hint(error: &ProviderError) -> Option<&'static str> {
    if error.sso_url.is_some() {
        Some(SSO_AUTHORIZATION_HINT)
    } else if error.kind == ProviderErrorKind::Authentication {
        Some(GITHUB_AUTH_RECOVERY_HINT)
    } else if repository_not_found(error) {
        Some(REPOSITORY_ACCESS_HINT)
    } else if error.reason == Some(ProviderErrorReason::UserNotFound) {
        Some(USER_QUALIFIER_HINT)
    } else {
        None
    }
}

/// The failure of a search tool (ghSearchRepo, ghSearchCode, ghStructure).
/// `window_hint` names the tool's own filters that reach results past the
/// 1,000-result search window.
pub(crate) fn search_failure(error: ProviderError, window_hint: Option<&str>) -> GhFailure {
    let message = match error.kind {
        // A typed missing ref names the ref it could not resolve.
        ProviderErrorKind::NotFound if error.reason == Some(ProviderErrorReason::RefNotFound) => {
            error.message.to_string()
        }
        ProviderErrorKind::Validation if error.status == Some(422) => {
            validation_message(&error, "Invalid search query or request parameters")
        }
        _ => provider_message(&error),
    };
    let hint = if let Some(hint) = provider_hint(&error) {
        Some(hint)
    } else if error.reason == Some(ProviderErrorReason::SearchWindowExceeded) {
        window_hint
    } else {
        None
    };
    let failure = GhFailure::new(error, message);
    match hint {
        Some(hint) => failure.hint(hint),
        None => failure,
    }
}

/// A ref that did not resolve: ghStructure `operation:"refs"` lists the
/// branches and tags it could name.
pub(crate) fn ref_recovery(owner: &str, repo: &str) -> Value {
    Continuation::new(
        ToolId::GhStructure,
        json!({"owner": owner, "repo": repo, "operation": "refs"}),
    )
    .confidence("high")
    .build()
}

/// A repository that did not resolve: a search for its name names the
/// owner that holds it.
pub(crate) fn repository_search(repo: &str) -> Value {
    Continuation::new(ToolId::GhSearchRepo, json!({"keywords": [repo]}))
        .confidence("medium")
        .build()
}

/// The error for an owner-wide search that found no such login. It names the
/// login; the caller adds the spelling hint only where one helps.
pub(crate) fn owner_not_found_message(owner: &str) -> String {
    format!("Owner \"{owner}\" not found: no GitHub user or organization has this login")
}

/// A missing ref's failure gets the runnable refs listing (the lead is the
/// fix: no hint beside it); any other failure is returned unchanged.
pub(crate) fn with_ref_recovery(mut failure: GhFailure, owner: &str, repo: &str) -> GhFailure {
    if failure.error.reason != Some(ProviderErrorReason::RefNotFound) {
        return failure;
    }
    let mut next = failure.next.take().unwrap_or_else(|| Box::new(json!({})));
    next["viewRefs"] = ref_recovery(owner, repo);
    failure.next = Some(next);
    failure
}

/// How long a repository's canonical name is remembered.
const CANONICAL_TTL: std::time::Duration = std::time::Duration::from_secs(60);

/// The memo of a repository's canonical `owner/repo`.
fn canonical_key(owner: &str, repo: &str) -> String {
    format!("repo-canonical:{owner}/{repo}").to_ascii_lowercase()
}

/// `full_name` split into owner and repository when it names another
/// repository than `owner/repo` (case-insensitive).
fn renamed_to(owner: &str, repo: &str, full_name: &str) -> Option<(String, String)> {
    let (to_owner, to_repo) = full_name.split_once('/')?;
    let same = to_owner.eq_ignore_ascii_case(owner) && to_repo.eq_ignore_ascii_case(repo);
    (!same && !to_owner.is_empty() && !to_repo.is_empty())
        .then(|| (to_owner.to_owned(), to_repo.to_owned()))
}

/// Remember `owner/repo`'s canonical `full_name` (from repository metadata
/// a tool already read) for later calls and processes.
pub(crate) async fn remember_canonical<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    repo: &str,
    full_name: &str,
    context: &RequestContext,
) {
    if let Ok(partition) = provider.transport.cache_partition(context, None) {
        provider
            .cache
            .put(
                &partition,
                canonical_key(owner, repo),
                octocode_github::CachedContent {
                    etag: None,
                    bytes: full_name.as_bytes().to_vec().into(),
                    resolved_ref: String::new(),
                },
                octocode_github::Retention::Expires(CANONICAL_TTL),
            )
            .await;
    }
}

/// The canonical name of a renamed repository, `None` when `owner/repo`
/// stands. Costs no request for a repository GitHub never redirected: the
/// memo answers first, then a followed rename redirect triggers one
/// metadata read, which is memoized.
pub(crate) async fn canonical_repo<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    repo: &str,
    context: &RequestContext,
) -> Option<(String, String)> {
    let partition = provider.transport.cache_partition(context, None).ok()?;
    if let Some(cached) = provider
        .cache
        .get(&partition, &canonical_key(owner, repo))
        .await
    {
        return renamed_to(owner, repo, std::str::from_utf8(&cached.bytes).ok()?);
    }
    if !provider.transport.followed_rename(owner, repo) {
        return None;
    }
    let full_name = provider
        .transport
        .repository_metadata(owner, repo, context)
        .await
        .ok()?
        .full_name?;
    remember_canonical(provider, owner, repo, &full_name, context).await;
    renamed_to(owner, repo, &full_name)
}

/// The one warning a read states for a renamed repository.
pub(crate) fn renamed_warning(owner: &str, repo: &str, to: &(String, String)) -> String {
    format!(
        "Repository {owner}/{repo} was renamed to {}/{}; leads use the canonical name.",
        to.0, to.1
    )
}

/// Keywords are ANDed literal terms: a bare GitHub boolean operator (`OR`,
/// `NOT`, `AND`, as GitHub spells them) standing as a word of a keyword
/// would be searched as a word (quoted into a phrase) and silently empty
/// the search, so it is refused, naming the operator and the one way to ask
/// for alternatives.
pub(crate) fn reject_boolean_keywords<S: AsRef<str>>(keywords: &[S]) -> Result<(), ProviderError> {
    let operator = keywords
        .iter()
        .flat_map(|keyword| keyword.as_ref().split_whitespace())
        .find_map(|word| ["OR", "NOT", "AND"].into_iter().find(|op| word == *op));
    match operator {
        Some(operator) => Err(ProviderError::new(
            ProviderErrorKind::Validation,
            format!(
                "keywords are ANDed literal terms; {operator} is no operator here: run one search per alternative"
            ),
        )),
        None => Ok(()),
    }
}

/// Results GitHub search reaches for one query, however many match.
pub(crate) const SEARCH_RESULT_CAP: usize = 1000;

/// What one search's match count reaches through GitHub's 1,000-result
/// window at `per` rows a page.
#[derive(Clone, Copy)]
pub(crate) struct SearchReach {
    /// Reachable results.
    pub(crate) total: usize,
    pub(crate) pages: usize,
    /// More results matched than the window reaches.
    pub(crate) capped: bool,
}

impl SearchReach {
    pub(crate) fn new(matched: usize, per: usize) -> Self {
        let total = matched.min(SEARCH_RESULT_CAP);
        Self {
            total,
            pages: total.div_ceil(per.max(1)),
            capped: matched > SEARCH_RESULT_CAP,
        }
    }

    /// Whether page `current` lies past the last page of a non-empty search.
    pub(crate) fn past_last(&self, current: usize) -> bool {
        self.total > 0 && current > self.pages
    }
}

/// A search page past GitHub's 1,000-result window cannot be read.
pub(crate) fn reject_window(page: usize, per: usize) -> Result<(), ProviderError> {
    if (page - 1).saturating_mul(per) >= SEARCH_RESULT_CAP {
        Err(ProviderError::new(
            ProviderErrorKind::Validation,
            "GitHub search page exceeds the 1,000-result search window",
        )
        .with_reason(ProviderErrorReason::SearchWindowExceeded))
    } else {
        Ok(())
    }
}

/// A search failure's one repair lead, replacing its static hint: a page
/// past the search window leads to the last reachable page (`repair`); a
/// repository that did not resolve leads to a search for its name
/// (`findRepository`), which names the owner that holds it. Any other
/// failure is returned unchanged.
pub(crate) fn with_search_repair(
    mut failure: GhFailure,
    tool: ToolId,
    query: &impl serde::Serialize,
    per: usize,
    repo: Option<&str>,
) -> GhFailure {
    let (name, lead) = if failure.error.reason == Some(ProviderErrorReason::SearchWindowExceeded) {
        (
            "repair",
            page_replay(tool, query, SEARCH_RESULT_CAP.div_ceil(per.max(1))),
        )
    } else if let Some(repo) = repo.filter(|_| repository_not_found(&failure.error)) {
        ("findRepository", repository_search(repo))
    } else {
        return failure;
    };
    failure.hints.clear();
    let mut next = failure.next.take().unwrap_or_else(|| Box::new(json!({})));
    next[name] = lead;
    failure.next = Some(next);
    failure
}

/// `next.nextPage`: the same query at the page after `page`; the contract
/// `page` maximum is the last a search can name, so past it the page is a
/// terminal limit.
pub(crate) fn add_next(
    value: &mut Value,
    tool: ToolId,
    query: &impl serde::Serialize,
    page: usize,
    has_more: bool,
) {
    if !has_more {
        return;
    }
    let Some(next_page) = crate::tools::paging::next_cursor(value, tool, None, "page", page + 1)
    else {
        return;
    };
    value["next"] = json!({"nextPage": page_replay(tool, query, next_page)});
}

/// The same query at `page`: an exact replay.
fn page_replay(tool: ToolId, query: &impl serde::Serialize, page: usize) -> Value {
    let mut row = query_row(query, &[]);
    row["page"] = json!(page);
    Continuation::new(tool, row).confidence("exact").build()
}

/// `row` without `keys`.
pub(crate) fn without(row: &Value, keys: &[&str]) -> Value {
    let mut variant = row.clone();
    if let Some(object) = variant.as_object_mut() {
        for key in keys {
            object.remove(*key);
        }
    }
    variant
}

/// `row` once per keyword with that keyword dropped, the last first (the
/// first usually names the subject); none for fewer than two keywords.
pub(crate) fn drop_each_keyword(row: &Value) -> Vec<Value> {
    let keywords = row["keywords"].as_array().map_or(&[][..], Vec::as_slice);
    if keywords.len() < 2 {
        return Vec::new();
    }
    (0..keywords.len())
        .rev()
        .map(|dropped| {
            let mut variant = row.clone();
            variant["keywords"] = keywords
                .iter()
                .enumerate()
                .filter(|(index, _)| *index != dropped)
                .map(|(_, keyword)| keyword.clone())
                .collect();
            variant
        })
        .collect()
}

/// An empty search's broader `variants` as one low-confidence batch lead,
/// so the variant that returns rows names what emptied the search. A
/// variant the tool would reject is skipped, and at most `limit` are kept.
pub(crate) fn broaden_lead(tool: ToolId, variants: Vec<Value>, limit: usize) -> Option<Value> {
    let variants = variants
        .into_iter()
        .filter(|variant| {
            crate::contracts::validate(tool.as_str(), json!({ "queries": [variant] })).is_ok()
        })
        .take(limit)
        .collect::<Vec<_>>();
    (!variants.is_empty()).then(|| {
        Continuation::input(tool, json!({ "queries": variants }))
            .confidence("low")
            .build()
    })
}

/// What GitHub said about one search page's completeness.
#[derive(Clone, Copy)]
pub(crate) struct SearchCompleteness<'a> {
    pub(crate) tool: ToolId,
    /// GitHub's own match count (past the cap, more than the reachable
    /// `totalItems`).
    pub(crate) matched: usize,
    /// GitHub's incomplete-results flag.
    pub(crate) incomplete: bool,
    pub(crate) page: usize,
    pub(crate) has_more: bool,
    /// What one result is (`code`, `repository`), for the count warning.
    pub(crate) subject: &'a str,
}

/// Provider-side incompleteness of a search page: the 1,000-result cap and
/// GitHub's own incomplete-results flag (with a `retry` of the same page).
/// Past the cap the first page states GitHub's match count, since the
/// reachable `totalItems` is not the count. Only the last reachable page of
/// a capped search ends coverage (`terminalLimit`: no executable
/// continuation remains).
pub(crate) fn apply_partial(
    value: &mut Value,
    query: &impl serde::Serialize,
    facts: &SearchCompleteness<'_>,
) {
    use crate::tools::paging::{mark_partial, terminal_limit};
    let SearchCompleteness {
        tool,
        matched,
        incomplete,
        page,
        has_more,
        subject,
    } = *facts;
    if matched > SEARCH_RESULT_CAP {
        // The match count is this call's fact; that search stops at 1,000
        // is the cap reason (`providerResultCap`), not a per-call note.
        let count = (page == 1).then(|| {
            format!(
                "GitHub matched {matched} {subject} results; the first {SEARCH_RESULT_CAP} are reachable."
            )
        });
        let warnings = Vec::from_iter(count);
        if has_more {
            mark_partial(value, "providerResultCap", &warnings);
        } else {
            terminal_limit(value, "providerResultCap", &warnings);
        }
    }
    if incomplete {
        mark_partial(value, "providerIncompleteResults", &[]);
        value["next"]["retry"] = page_replay(tool, query, page);
    }
}

/// A non-empty repository-relative path that stays below the directory it is
/// joined to: no root, drive, `.`/`..` segment or backslash.
pub(crate) fn is_repo_relative(path: &str) -> bool {
    let value = std::path::Path::new(path);
    !path.trim().is_empty()
        && !path.contains('\\')
        && !value.is_absolute()
        && value
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

/// A read or listing whose path (not repository or ref) did not resolve.
pub(crate) fn missing_path(error: &ProviderError, path: Option<&str>) -> bool {
    error.kind == ProviderErrorKind::NotFound
        && !repository_not_found(error)
        && error.reason != Some(ProviderErrorReason::RefNotFound)
        && path.is_some_and(|path| !path.trim_matches('/').is_empty())
}

/// Directory listings a missing-path recovery may spend.
const PATH_RECOVERY_LISTINGS: usize = 6;

/// Where a missing path's nearest existing parts are.
pub(crate) struct PathRecovery {
    /// Deepest existing directory on the requested path (case-corrected).
    pub(crate) directory: String,
    /// The requested file itself when only its case differed.
    pub(crate) file: Option<String>,
}

/// The repository coordinates a missing-path recovery lists under.
pub(crate) struct RepoPath<'a> {
    pub(crate) owner: &'a str,
    pub(crate) repo: &'a str,
    pub(crate) path: &'a str,
    pub(crate) reference: Option<&'a str>,
}

/// Walk up to the nearest directory that exists, then back down matching each
/// remaining segment case-insensitively, within [`PATH_RECOVERY_LISTINGS`].
pub(crate) async fn locate_path<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    at: &RepoPath<'_>,
    context: &RequestContext,
) -> Option<PathRecovery> {
    let (owner, repo) = (at.owner, at.repo);
    let segments: Vec<&str> = at.path.split('/').filter(|part| !part.is_empty()).collect();
    let reference = provider
        .resolve_reference(owner, repo, at.reference, false, context)
        .await
        .ok()?;
    let mut listings = 0;
    let mut depth = segments.len().saturating_sub(1);
    let mut listing = loop {
        listings += 1;
        let directory = segments[..depth].join("/");
        match provider
            .repository_contents(owner, repo, &directory, &reference, context)
            .await
        {
            Ok(listing) => break listing,
            Err(error)
                if error.kind == ProviderErrorKind::NotFound
                    && depth > 0
                    && listings < PATH_RECOVERY_LISTINGS =>
            {
                depth -= 1;
            }
            Err(_) => return None,
        }
    };
    let mut directory = segments[..depth].join("/");
    for (index, wanted) in segments.iter().enumerate().skip(depth) {
        let matches: Vec<_> = listing
            .entries
            .iter()
            .filter(|entry| entry.name.eq_ignore_ascii_case(wanted))
            .collect();
        let entry = match matches.as_slice() {
            [entry] => *entry,
            many => match many.iter().find(|entry| entry.name == *wanted) {
                Some(entry) => *entry,
                None => break,
            },
        };
        let (kind, path) = (entry.kind.clone(), entry.path.clone());
        let last = index + 1 == segments.len();
        if last && kind == "file" {
            return Some(PathRecovery {
                directory,
                file: Some(path),
            });
        }
        if kind != "dir" {
            break;
        }
        if last {
            directory = path;
            break;
        }
        if listings >= PATH_RECOVERY_LISTINGS {
            break;
        }
        listings += 1;
        match provider
            .repository_contents(owner, repo, &path, &reference, context)
            .await
        {
            Ok(next) => {
                listing = next;
                directory = path;
            }
            Err(_) => break,
        }
    }
    Some(PathRecovery {
        directory,
        file: None,
    })
}

/// The parent directory of a repository path, `.` at the root.
pub(crate) fn parent_dir(path: &str) -> String {
    let normal = repo_path(path);
    std::path::Path::new(&normal)
        .parent()
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| ".".into())
}

/// A repository path with its `.` and `..` segments resolved lexically and
/// clamped at the repository root (a tree has nothing above it); `.` for
/// the root. A recovery lead never repeats a traversal the caller sent.
pub(crate) fn repo_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            segment => segments.push(segment),
        }
    }
    if segments.is_empty() {
        ".".into()
    } else {
        segments.join("/")
    }
}

/// A ghStructure listing of `path` at the caller's ref (and depth, when the
/// caller set one): a fresh query from page 1, not a page of the failed call.
pub(crate) fn tree_recovery(at: &RepoPath<'_>, max_depth: Option<i64>, confidence: &str) -> Value {
    let mut tree_query = json!({"owner": at.owner, "repo": at.repo, "path": repo_path(at.path)});
    if let Some(reference) = at.reference {
        tree_query["ref"] = json!(reference);
    }
    if let Some(depth) = max_depth {
        tree_query["maxDepth"] = json!(depth);
    }
    Continuation::new(ToolId::GhStructure, tree_query)
        .confidence(confidence)
        .build()
}

/// What a `fields` pick always keeps of a code row: its identity (path, and
/// repository on owner-wide pages) and the facts that qualify its lines
/// (where else the same evidence sits, how many hits exist, whether the
/// lines were read at the ref, and the commit they were read at).
pub(crate) const CODE_ROW_ID: &[&str] = &[
    "owner",
    "repo",
    "path",
    "alsoAt",
    "matchCount",
    "atRef",
    "lineResolved",
    "commitSha",
];

/// Finish a classified provider page after shared sanitization and selection.
/// Read leads may only name selected evidence; `unfiltered` remains the explicit
/// route to the original page. Output fields never change the judged evidence.
pub(crate) fn finish_code_selection(value: &mut Value, query: &Value) {
    let mut selected = std::collections::HashSet::new();
    for file in value["files"].as_array().into_iter().flatten() {
        let identity = |key: &str| {
            file[key]
                .as_str()
                .or_else(|| value[key].as_str())
                .or_else(|| query[key].as_str())
                .unwrap_or_default()
                .to_owned()
        };
        let (owner, repo) = (identity("owner"), identity("repo"));
        for path in file["path"].as_str().into_iter().chain(
            file["alsoAt"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str),
        ) {
            selected.insert((owner.clone(), repo.clone(), path.to_owned()));
        }
    }
    for group in ["next", "hints"] {
        if let Some(leads) = value.get_mut(group).and_then(Value::as_object_mut) {
            leads.retain(|_, lead| {
                if lead["tool"] != ToolId::GhGetFileContent.as_str() {
                    return true;
                }
                let Some(rows) = lead
                    .pointer_mut("/query/queries")
                    .and_then(Value::as_array_mut)
                else {
                    return false;
                };
                rows.retain(|read| {
                    let (Some(owner), Some(repo), Some(path)) = (
                        read["owner"].as_str(),
                        read["repo"].as_str(),
                        read["path"].as_str(),
                    ) else {
                        return false;
                    };
                    selected.contains(&(owner.to_owned(), repo.to_owned(), path.to_owned()))
                });
                !rows.is_empty()
            });
        }
    }
    let fields = query["fields"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    pick_rows(value, "files", CODE_ROW_ID, &fields);
}

/// `fields` row pick (gh `--json a,b`): the row's `id` keys, then the
/// picked keys in request order, so a picked row stays readable (its
/// number, sha, owner+repo or path). No pick, or a row that is not an
/// object, passes through whole; a key the row lacks stays absent.
pub(crate) fn pick_fields(row: Value, id: &[&str], fields: &[String]) -> Value {
    let Value::Object(map) = row else {
        return row;
    };
    if fields.is_empty() {
        return Value::Object(map);
    }
    let mut picked = serde_json::Map::new();
    for key in id.iter().copied().chain(fields.iter().map(String::as_str)) {
        if !picked.contains_key(key)
            && let Some(value) = map.get(key)
        {
            picked.insert(key.to_owned(), value.clone());
        }
    }
    Value::Object(picked)
}

/// A generated `fields` list as plain key names.
pub(crate) fn field_names<T: ToString>(fields: &[T]) -> Vec<String> {
    fields.iter().map(ToString::to_string).collect()
}

/// Makes the row's `next` an object (an empty one when absent), so leads
/// can be added by name.
pub(crate) fn ensure_next(value: &mut Value) {
    if !value.get("next").is_some_and(Value::is_object) {
        value["next"] = json!({});
    }
}

/// Puts one per-call warning first in a row's `warnings` (a rename the
/// rest of the row's warnings follow from).
pub(crate) fn push_warning_front(value: &mut Value, warning: String) {
    match value.get_mut("warnings").and_then(Value::as_array_mut) {
        Some(warnings) => warnings.insert(0, json!(warning)),
        None => value["warnings"] = json!([warning]),
    }
}

/// The one `fields` path of the search tools: picks `value[rows]` (each row
/// keeps its `id` keys) and names picked keys no row carries.
pub(crate) fn pick_rows(value: &mut Value, rows: &str, id: &[&str], fields: &[String]) {
    if fields.is_empty() {
        return;
    }
    if let Some(listed) = value.get_mut(rows).and_then(Value::as_array_mut) {
        for row in listed.iter_mut() {
            *row = pick_fields(std::mem::take(row), id, fields);
        }
    }
    warn_absent_fields(value, rows, fields);
}

/// Names the picked `fields` no row of `value[rows]` carries: a typo, or a
/// value these rows lack. The call still answers; the caller is told
/// instead of reading the missing key as an empty value.
fn warn_absent_fields(value: &mut Value, rows: &str, fields: &[String]) {
    let Some(listed) = value.get(rows).and_then(Value::as_array) else {
        return;
    };
    if listed.is_empty() {
        return;
    }
    let absent = fields
        .iter()
        .map(String::as_str)
        .filter(|key| !listed.iter().any(|row| row.get(*key).is_some()))
        .collect::<Vec<_>>();
    if !absent.is_empty() {
        push_warnings(value, [format!("No row has {}.", absent.join(", "))]);
    }
}

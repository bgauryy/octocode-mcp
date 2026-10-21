//! ghStructure: a known repository's tree at one commit, optionally written
//! to a local directory (`materialize`).
use crate::contracts::tool_types::ExtraKind;
use crate::tools::gh_shared::{
    GhFailure, PathRecovery, RepoPath, default_branch, locate_path, missing_path, parent_dir,
    push_warning_front, repo_key, search_failure, tree_recovery, with_default_branch,
    with_ref_recovery,
};
use crate::tools::id::ToolId;
use crate::tools::result::ToolData;
use crate::tools::result::query_row;
use octocode_github::{
    ContentsEntry, GitHubProvider, ProviderError, ProviderErrorKind, ProviderErrorReason,
    RequestContext, TreeRequest,
};
use serde_json::{Map, Value, json};
use std::collections::HashSet;
use std::path::Path;

pub use crate::contracts::tool_types::GhStructureQuery;
use crate::contracts::tool_types::{
    GhStructureQueryLanguages, GhStructureQueryRefs, GhStructureQueryTree,
};

mod dates;
mod listing;
pub(crate) mod materialize;
mod refs;
mod traverse;
use listing::*;
use materialize::*;
use traverse::*;

pub async fn run<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    request: Result<&RequestContext, ProviderError>,
    home: &Path,
) -> Result<ToolData, GhFailure> {
    if let GhStructureQuery::Tree(query) = query {
        return run_tree(provider, query, request, home).await;
    }
    let context = request.map_err(|error| search_failure(error, None))?;
    let error = match execute(provider, query, context, home).await {
        Ok(output) => return Ok(output),
        Err(error) => error,
    };
    let (owner, repo) = repository(query);
    let renamed = canonical(provider, query, owner, repo, context)
        .await
        .ok()
        .flatten();
    let query = renamed.as_ref().map_or(query, |(_, canonical)| canonical);
    let (owner, repo) = repository(query);
    let failure = with_ref_recovery(search_failure(error, None), owner, repo);
    let failure = with_default_branch(provider, failure, ToolId::GhStructure, query, context).await;
    Err(crate::tools::gh_shared::with_search_repair(
        failure,
        ToolId::GhStructure,
        query,
        1,
        Some(repo),
    ))
}

fn repository(query: &GhStructureQuery) -> (&str, &str) {
    match query {
        GhStructureQuery::Tree(query) => (query.owner.as_str(), query.repo.as_str()),
        GhStructureQuery::Refs(query) => (query.owner.as_str(), query.repo.as_str()),
        GhStructureQuery::Languages(query) => (query.owner.as_str(), query.repo.as_str()),
    }
}

pub(crate) async fn execute<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
    home: &Path,
) -> Result<ToolData, ProviderError> {
    match query {
        GhStructureQuery::Tree(query) => execute_tree(provider, query, context, home).await,
        GhStructureQuery::Refs(query) => refs::refs(provider, query, context).await,
        GhStructureQuery::Languages(query) => refs::languages(provider, query, context).await,
    }
}

/// Run one ghStructure row. A listing of a missing path names the path and
/// lists the nearest existing directory (case-corrected) with
/// `hints.viewTree`; without a located directory it lists the parent.
async fn run_tree<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQueryTree,
    request: Result<&RequestContext, ProviderError>,
    home: &Path,
) -> Result<ToolData, GhFailure> {
    let context = request.map_err(|error| search_failure(error, None))?;
    let listed = listed_at(query).map_err(|error| search_failure(error, None))?;
    let query = listed.as_ref().unwrap_or(query);
    let error = match execute_tree(provider, query, context, home).await {
        Ok(output) => return Ok(output),
        Err(error) => error,
    };
    let error = classify_unresolved_sha(provider, query, context, error).await;
    // Recovery leads name a renamed repository as it is now.
    let renamed = canonical(
        provider,
        query,
        query.owner.as_str(),
        query.repo.as_str(),
        context,
    )
    .await
    .ok()
    .flatten();
    let query = renamed.as_ref().map_or(query, |(_, canonical)| canonical);
    let path = query.path.as_deref().unwrap_or_default().trim_matches('/');
    let requested = query.ref_.as_ref().map(|value| value.as_str());
    // A path failure comes after its ref resolved: its leads pin that commit.
    let commit = if error.reason == Some(ProviderErrorReason::PathIsFile)
        || missing_path(&error, Some(path))
    {
        crate::tools::gh_shared::failed_at_commit(
            provider,
            query.owner.as_str(),
            query.repo.as_str(),
            requested,
            context,
        )
        .await
    } else {
        None
    };
    let at = RepoPath {
        owner: query.owner.as_str(),
        repo: query.repo.as_str(),
        path,
        reference: commit.as_deref().or(requested),
    };
    if error.reason == Some(ProviderErrorReason::PathIsFile) {
        return Err(file_failure(error, &at));
    }
    if error.reason == Some(ProviderErrorReason::Submodule) {
        let failure = search_failure(error, None);
        return Err(
            crate::tools::gh_shared::submodule_failure(provider, &at, context, failure).await,
        );
    }
    if !missing_path(&error, Some(at.path)) {
        // A repository that did not resolve leads to a search for its name.
        let failure = with_ref_recovery(search_failure(error, None), at.owner, at.repo);
        let failure =
            with_default_branch(provider, failure, ToolId::GhStructure, query, context).await;
        return Err(crate::tools::gh_shared::with_search_repair(
            failure,
            ToolId::GhStructure,
            query,
            1,
            Some(at.repo),
        ));
    }
    let found = locate_path(provider, &at, context).await;
    Err(path_failure(error, &at, query.max_depth, found))
}

/// The query with its `path` as the repository names it
/// ([`crate::tools::gh_shared::listing_path`]), so the listing, its
/// continuations and its recovery leads all name one path; `None` when it
/// already does. A path climbing above the root is invalid input.
fn listed_at(query: &GhStructureQueryTree) -> Result<Option<GhStructureQueryTree>, ProviderError> {
    let Some(requested) = query.path.as_deref() else {
        return Ok(None);
    };
    let path = crate::tools::gh_shared::listing_path(requested)?;
    Ok((path != requested).then(|| GhStructureQueryTree {
        path: Some(path),
        ..query.clone()
    }))
}

/// A full 40-hex `ref` skips ref resolution, so a SHA GitHub does not have
/// surfaces as the tree read's bare 404. On that failure only, one commit
/// lookup tells a missing commit (named like any missing ref, with
/// `hints.viewRefs`) from a missing repository; any other outcome keeps the
/// original error.
async fn classify_unresolved_sha<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQueryTree,
    context: &RequestContext,
    error: ProviderError,
) -> ProviderError {
    let Some(reference) = query.ref_.as_deref() else {
        return error;
    };
    if error.kind != ProviderErrorKind::NotFound
        || error.reason.is_some()
        || !octocode_github::is_full_sha(reference)
    {
        return error;
    }
    let (owner, repo) = (query.owner.as_str(), query.repo.as_str());
    match provider
        .transport
        .commit_sha(owner, repo, reference, context)
        .await
    {
        Err(probe)
            if probe.reason == Some(ProviderErrorReason::RefNotFound)
                || probe.reason == Some(ProviderErrorReason::RepositoryNotFound) =>
        {
            missing_ref(probe, owner, repo, reference)
        }
        _ => error,
    }
}

/// A listing of a file: the repair is that file's read at the same ref.
fn file_failure(error: ProviderError, at: &RepoPath<'_>) -> GhFailure {
    let mut read = json!({"owner": at.owner, "repo": at.repo, "path": at.path});
    if let Some(reference) = at.reference {
        read["ref"] = json!(reference);
    }
    let mut failure = search_failure(error, None);
    failure.next = Some(Box::new(json!({
        "read": crate::tools::result::Continuation::new(ToolId::GhGetFileContent, read)
            .confidence("exact")
            .build()
    })));
    failure
}

fn path_failure(
    error: ProviderError,
    at: &RepoPath<'_>,
    max_depth: Option<std::num::NonZeroU64>,
    found: Option<PathRecovery>,
) -> GhFailure {
    let mut failure = search_failure(error, None);
    let requested = at.path;
    let (directory, confidence, hint) = match &found {
        Some(found) => {
            failure.message = format!("Path not found in {}/{}: {requested}", at.owner, at.repo);
            let directory = if found.directory.is_empty() {
                ".".to_owned()
            } else {
                found.directory.clone()
            };
            // The listing lead targets the deepest existing prefix; only a
            // case-only difference is a fact the lead does not state.
            let hint = if found.file.is_some() {
                Some("The path names a file (its case differs).")
            } else if found.directory.eq_ignore_ascii_case(requested) {
                Some("Only the path's case differs.")
            } else {
                None
            };
            (directory, "exact", hint)
        }
        // Without a walk answer the parent listing is the whole recovery.
        None => (parent_dir(requested), "low", None),
    };
    let depth = max_depth.map(|depth| i64::try_from(depth.get()).unwrap_or(i64::MAX));
    let listing = RepoPath {
        path: &directory,
        ..*at
    };
    failure.next = Some(Box::new(
        json!({ "viewTree": tree_recovery(&listing, depth, confidence) }),
    ));
    match hint {
        Some(hint) => failure.hint(hint),
        None => failure,
    }
}

/// Largest listing page (contract `pageSize` maximum). Path-only rows stay
/// compact: 500 entries of a deep tree render in about 13k chars.
fn max_entries_per_page() -> usize {
    crate::contracts::query_schema_max(ToolId::GhStructure, None, "pageSize")
}
const CONTENTS_LIMIT: usize = 1000;
/// Tree listing page size when `pageSize` is omitted (contract
/// `ghStructure.semanticPolicy.treePageSize`).
pub(super) const DEFAULT_ENTRIES_PER_PAGE: u64 =
    crate::tools::id::gh_structure_policy::TREE_PAGE_SIZE as u64;
/// Upper bound on Contents API directory reads for one fallback walk (git
/// trees API truncated or unavailable). Past it the listing is a typed
/// terminal limit instead of an unbounded request fan-out.
pub(crate) const MAX_DIRECTORY_FETCHES: usize = 200;
/// GitHub reads one listing step (a walk level, a materialize chunk) sends
/// at once; the global request semaphore still bounds the total.
const READ_CONCURRENCY: usize = 8;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TreeEntry {
    path: String,
    kind: EntryKind,
    size: Option<u64>,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
enum EntryKind {
    File,
    Dir,
}
#[derive(Default, serde::Serialize, serde::Deserialize)]
struct Traversal {
    entries: Vec<TreeEntry>,
    failed_subtrees: usize,
    contents_limit: bool,
    /// Fallback walk stopped at [`MAX_DIRECTORY_FETCHES`].
    #[serde(default)]
    fetch_limit: bool,
    /// What the listing does not show, as `"<repo-relative path> (<kind>)"`:
    /// symlinks and submodules, which have no listable content. Every
    /// committed directory is listed and walked: a tree holds only tracked
    /// content, so the local build-output prune names (`build/`,
    /// `coverage/`, `node_modules/`) do not apply to it.
    #[serde(default)]
    omitted: std::collections::BTreeMap<String, usize>,
}

async fn execute_tree<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQueryTree,
    context: &RequestContext,
    home: &Path,
) -> Result<ToolData, ProviderError> {
    let scope = Scope::of(query)?;
    let (resolved_branch, commit_sha) = resolve_listing_ref(provider, query, context).await?;
    let (renamed_warning, canonical) = canonical(
        provider,
        query,
        query.owner.as_str(),
        query.repo.as_str(),
        context,
    )
    .await?
    .unzip();
    let query = canonical.as_ref().unwrap_or(query);
    let listing = Listing {
        owner: &query.owner,
        repo: &query.repo,
        branch: &commit_sha,
        root: &scope.path,
        max_depth: scope.depth,
    };
    let mut traversal = traverse(provider, &listing, context).await?;
    scope.select(&mut traversal);
    let page = ListingPage::of(query, &traversal.entries);
    let mut value = json!({
        "files": build_structure(page.entries),
        "summary": summary(&traversal.entries),
        "resolvedRef": resolved_branch,
    });
    // A caller-supplied full SHA is not restated.
    if !resolved_branch.eq_ignore_ascii_case(&commit_sha) {
        value["commitSha"] = json!(commit_sha);
    }
    page.paginate(&mut value);
    let dating = date_page(provider, query, &commit_sha, &page, context, &mut value).await;
    // Sizes and dates join the names last: dates key bare names.
    attach_fields(&mut value, page.entries);
    let mut output = ToolData::from(Value::Null);
    let materialize_resume = if query.materialize == Some(true) {
        materialize_page(
            provider,
            query,
            &scope,
            &commit_sha,
            &page,
            home,
            context,
            &mut value,
        )
        .await?
    } else {
        None
    };
    disclose_limits(&traversal, &page, &mut value, &mut output);
    if traversal.contents_limit {
        value["next"]["cloneRepo"] = clone_lead(query, &scope, &commit_sha);
    }
    if let Some(warning) = renamed_warning {
        push_warning_front(&mut value, warning);
    }
    // Continuations read the same commit.
    let pinned = GhStructureQueryTree {
        ref_: Some(commit_sha.parse().map_err(
            |error: crate::contracts::tool_types::error::ConversionError| {
                ProviderError::new(ProviderErrorKind::Decode, error.to_string())
            },
        )?),
        ..query.clone()
    };
    attach_continuations(
        &mut value,
        &pinned,
        &page,
        traversal.failed_subtrees > 0 || dating.failed,
        query.materialize == Some(true),
        materialize_resume,
    )?;
    dates::expand(&mut value, &pinned, &page, dating.undated)?;
    // A resumed materialize page (offset > 0) is anchored by `location`:
    // its first call already listed these entries.
    let resumed = query.materialize == Some(true)
        && query.materialize_offset.is_some_and(|offset| offset > 0)
        && value.get("location").is_some();
    if resumed && let Some(map) = value.as_object_mut() {
        map.remove("files");
    }
    if !resumed && structure_is_empty(&value) && value.get("isPartial").is_none() {
        output.status = Some("empty");
        if let Some(broader) = broaden_listing(&pinned) {
            value["next"]["broadenSearch"] = broader;
        }
    } else if value.pointer("/location/localPath").is_some() {
        // A materialized listing continues with the local tools at
        // `location.localPath`; re-listing the tree it just returned adds
        // nothing.
    } else if page.current == 1
        && let Some(read) = entry_read(&pinned, &traversal.entries, &commit_sha)
    {
        value["next"]["read"] = read;
    }
    output.data = value;
    Ok(output)
}

/// An empty filtered listing, broadened ([`crate::tools::gh_shared::broaden`]):
/// the same commit's listing without its `include` globs, so what the tree
/// holds names why they matched nothing. Never a materialization.
fn broaden_listing(pinned: &GhStructureQueryTree) -> Option<Value> {
    crate::tools::gh_shared::broaden(
        ToolId::GhStructure,
        &query_row(pinned, &[]),
        &crate::tools::gh_shared::Broaden {
            strip: &["materialize", "materializeOffset"],
            groups: &[&["include"]],
        },
        1,
    )
}

/// What dating a listing page left: entries no date reached, and whether
/// the dating request failed (the same page retries it).
#[derive(Default)]
struct PageDating {
    undated: usize,
    failed: bool,
}

/// With `extras: ["details"]` a listing states when each entry last changed
/// (one GraphQL request per page, so only when asked); a materialized page
/// hands its files to local tools and stays undated.
async fn date_page<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQueryTree,
    commit_sha: &str,
    page: &ListingPage<'_>,
    context: &RequestContext,
    value: &mut Value,
) -> PageDating {
    if !query.extras.contains(&ExtraKind::Details) || query.materialize == Some(true) {
        return PageDating::default();
    }
    let page_dates = dates::page_dates(
        provider,
        &query.owner,
        &query.repo,
        commit_sha,
        page.entries,
        context,
    )
    .await;
    let dating = PageDating {
        undated: page_dates.undated,
        failed: page_dates.warning.is_some(),
    };
    dates::attach(value, page_dates);
    dating
}

/// A renamed repository's one warning and the query under its canonical
/// name, `None` when the name stands. A listing or refs page is read, dated
/// and continued under the canonical name: later requests skip the
/// redirect, and every lead names the repository as it is now.
async fn canonical<
    C: octocode_github::ConditionalCache,
    Q: serde::Serialize + serde::de::DeserializeOwned,
>(
    provider: &GitHubProvider<C>,
    query: &Q,
    owner: &str,
    repo: &str,
    context: &RequestContext,
) -> Result<Option<(String, Q)>, ProviderError> {
    let Some(to) = crate::tools::gh_shared::canonical_repo(
        provider,
        owner,
        repo,
        context,
        crate::tools::gh_shared::RenameCheck::Redirected,
    )
    .await?
    else {
        return Ok(None);
    };
    let decode = |error: &dyn std::fmt::Display| {
        ProviderError::new(ProviderErrorKind::Decode, error.to_string())
    };
    let mut canonical = serde_json::to_value(query).map_err(|error| decode(&error))?;
    canonical["owner"] = json!(to.0);
    canonical["repo"] = json!(to.1);
    let canonical = serde_json::from_value(canonical).map_err(|error| decode(&error))?;
    Ok(Some((
        crate::tools::gh_shared::renamed_warning(owner, repo, &to),
        canonical,
    )))
}

/// What one listing covers: the requested directory, the depth, and the
/// `include` globs (ORed: a path matching any is kept).
struct Scope {
    path: String,
    depth: usize,
    filter: Option<Vec<PathFilter>>,
}

impl Scope {
    /// The listed entries of the walk: those the `include` globs keep
    /// (matched relative to `path`, as the local tools match), directory by
    /// directory in path order, so a page of a deep listing carries each
    /// directory's files with its folders instead of every folder of the
    /// tree before the first file. An omitted entry stays named only when
    /// the globs keep its path too.
    fn select(&self, traversal: &mut Traversal) {
        if let Some(filter) = &self.filter {
            let kept = |path: &str| {
                let path = relative(path, &self.path);
                filter.iter().any(|glob| glob.matches(&path))
            };
            traversal.entries.retain(|entry| kept(&entry.path));
            traversal.omitted.retain(|named, _| {
                kept(
                    named
                        .rsplit_once(" (")
                        .map_or(named.as_str(), |(path, _)| path),
                )
            });
        }
        let entries = &mut traversal.entries;
        let parent = |path: &str| path.rsplit_once('/').map_or("", |(dir, _)| dir).to_owned();
        entries.sort_by(|left, right| {
            parent(&left.path)
                .cmp(&parent(&right.path))
                .then_with(|| left.path.cmp(&right.path))
        });
    }

    fn of(query: &GhStructureQueryTree) -> Result<Self, ProviderError> {
        let filters = query
            .include
            .iter()
            .map(|glob| PathFilter::new(glob))
            .collect::<Result<Vec<_>, _>>()?;
        let filter = (!filters.is_empty()).then_some(filters);
        let path = crate::tools::gh_shared::listing_path(query.path.as_deref().unwrap_or(""))?;
        // A name search looks at every level unless the caller bounds it.
        let depth = match (query.max_depth, &filter) {
            (Some(depth), _) => crate::tools::num::usize_of(depth),
            (None, Some(_)) => max_listing_depth(),
            (None, None) => 1,
        };
        Ok(Self {
            path,
            depth,
            filter,
        })
    }
}

/// This tool's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, query: &serde_json::Value) -> &'static str {
        if crate::tools::output::has_value(query, "include") {
            "Loosen the include glob, raise maxDepth, or list the tree without include."
        } else {
            "Check ref and path, raise maxDepth, or list the parent path."
        }
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
    /// The resolved branch is next-call input when the caller named none;
    /// it goes only when it repeats the requested ref.
    fn compact(
        &self,
        data: &mut serde_json::Map<String, serde_json::Value>,
        query: &serde_json::Value,
    ) {
        if data.get("resolvedRef").is_some() && data.get("resolvedRef") == query.get("ref") {
            data.remove("resolvedRef");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_listing_does_not_restate_the_requested_ref() {
        use crate::tools::output::ToolOutput;
        let sha = "63c5760d8a672cee96e1e523d84bfa1c77d9ee4c";
        let listing =
            serde_json::json!({"files":[{"dir":"src","files":["a.rs"]}],"resolvedRef":sha});
        let mut pinned = listing.as_object().cloned().unwrap_or_default();
        Output.compact(&mut pinned, &serde_json::json!({"ref": sha}));
        assert!(pinned.get("resolvedRef").is_none(), "{pinned:?}");
        // A resolved default branch is news to the caller.
        let mut default_branch = listing.as_object().cloned().unwrap_or_default();
        Output.compact(&mut default_branch, &serde_json::json!({}));
        assert_eq!(default_branch["resolvedRef"], sha);
    }
    #[tokio::test]
    async fn materialize_never_writes_a_provider_path_outside_its_root() {
        let base = tempfile::tempdir().expect("tempdir");
        let root = base.path().join("snapshot");
        std::fs::create_dir_all(&root).expect("root");
        let outside = base.path().join("escape.txt");
        let mut writer = MaterializeWriter {
            root: &root,
            home: base.path(),
            written: 0,
            total_bytes: 0,
            cursor: 0,
            skips: MaterializeSkips::default(),
            recorded: Vec::new(),
        };
        let read = || {
            Acquired::Read(Ok(octocode_github::ContentResponse {
                bytes: b"owned".to_vec().into(),
                resolved_ref: "main".into(),
                etag: None,
                from_cache: false,
                raw_response_bytes: 5,
            }))
        };
        for path in [
            "../escape.txt".to_owned(),
            outside.to_string_lossy().into_owned(),
            "a/../../escape.txt".to_owned(),
            "ok/kept.txt".to_owned(),
        ] {
            let entry = TreeEntry {
                path,
                kind: EntryKind::File,
                size: Some(5),
            };
            assert!(writer.write(&entry, read()).await.expect("write"));
        }
        assert!(!outside.exists());
        assert_eq!(writer.written, 1);
        assert_eq!(
            std::fs::read(root.join("ok/kept.txt")).expect("kept"),
            b"owned"
        );
        assert_eq!(
            writer.skips.unreadable.len(),
            3,
            "{:?}",
            writer.skips.unreadable
        );
    }

    #[test]
    fn materialize_skips_name_each_path_once_and_warn_with_counts() {
        let skips = MaterializeSkips {
            oversized: (0..30).map(|n| format!("big/{n}.bin")).collect(),
            unreadable: vec![
                ("a.dat".into(), "binary".into()),
                ("b.dat".into(), "binary".into()),
                ("c".into(), "unsupported entry".into()),
            ],
        };
        let warnings = skips.warnings();
        assert_eq!(warnings.len(), 2, "{warnings:?}");
        assert!(
            warnings[0].starts_with("Skipped 30 file(s) larger than"),
            "{warnings:?}"
        );
        assert!(!warnings[0].contains("big/0.bin"), "{warnings:?}");
        assert_eq!(
            warnings[1],
            "Skipped 3 unreadable file(s) (location.skipped): binary; unsupported entry."
        );
        let paths = skips.paths();
        assert_eq!(paths.len(), 33);
        assert_eq!(paths[0], "big/0.bin");
        assert_eq!(paths[32], "c");
        assert!(MaterializeSkips::default().warnings().is_empty());
    }

    #[test]
    fn materialization_page_boundary_continues_and_page_ceiling_is_explicit() {
        let query: GhStructureQueryTree = serde_json::from_value(json!({
            "owner": "a", "repo": "b", "ref": "a".repeat(40),
            "path": "", "mainGoal": "Read every materialized file", "reasoning": "Preserve the remaining listing"
        })).expect("query");
        let mut value = json!({
            "files": [{"dir": ".", "files": ["a.rs"]}],
            "location": {"localPath": "/t"}
        });
        let page = |current| ListingPage {
            current,
            per_page: 1,
            total_entries: current + 1,
            total_pages: current + 1,
            entries: &[],
        };
        attach_continuations(&mut value, &query, &page(1), false, true, None)
            .expect("continuation");
        assert_eq!(value["location"], json!({"localPath": "/t"}));
        assert_eq!(value["isPartial"], true);
        assert_eq!(value["partialReasons"], json!(["materializeIncomplete"]));
        assert_eq!(
            value["next"]["continueMaterialize"]["query"]["queries"][0]["page"],
            2
        );
        assert_eq!(
            value["next"]["continueMaterialize"]["query"]["queries"][0]["materializeOffset"],
            0
        );
        assert_eq!(
            value["next"]["continueMaterialize"]["query"]["queries"][0]["ref"],
            "a".repeat(40)
        );
        for materialize in [false, true] {
            let mut value = json!({"files": [{"dir": ".", "files": ["last.rs"]}]});
            attach_continuations(&mut value, &query, &page(1000), false, materialize, None)
                .expect("terminal");
            assert_eq!(value["terminalLimit"], true);
            assert!(value.get("next").is_none());
            assert_eq!(value["files"][0]["files"][0], "last.rs");
        }
    }

    /// A recursive git-tree listing of a path the tree lacks is a
    /// missing path (not an empty listing), so the viewTree recovery runs.
    #[test]
    fn a_root_missing_from_the_git_tree_is_not_found() {
        let tree: octocode_github::TreeResponse = serde_json::from_value(json!({
            "sha":"s","truncated":false,"tree":[
                {"path":"src","type":"tree"},{"path":"src/lib.rs","type":"blob"}
            ]
        }))
        .expect("tree");
        assert!(root_is_directory(&tree, "").is_ok());
        assert!(root_is_directory(&tree, "src").is_ok());
        let missing = root_is_directory(&tree, "no/such").expect_err("missing");
        assert_eq!(missing.kind, ProviderErrorKind::NotFound);
        assert_eq!(missing.reason, None);
        let file = root_is_directory(&tree, "src/lib.rs").expect_err("file");
        assert_eq!(file.kind, ProviderErrorKind::Validation);
    }
    /// A depth-3 listing of the repository root of `a/b`.
    fn test_listing() -> Listing<'static> {
        Listing {
            owner: "a",
            repo: "b",
            branch: "main",
            root: "",
            max_depth: 3,
        }
    }

    /// A submodule is not listed, and not dropped silently: the listing
    /// names it by its repository-relative path.
    #[test]
    fn a_submodule_is_named_not_silently_dropped() {
        let tree: octocode_github::TreeResponse = serde_json::from_value(json!({
            "sha":"s","truncated":false,"tree":[
                {"path":"src","type":"tree"},
                {"path":"third_party/zlib","type":"commit"},
                {"path":"README.md","type":"blob","size":1}
            ]
        }))
        .expect("tree");
        let traversal = traverse::traversal_from_git_tree(tree, &test_listing());
        assert_eq!(traversal.entries.len(), 2);
        assert_eq!(
            serde_json::to_value(&traversal.omitted).expect("omitted"),
            json!({"third_party/zlib (submodule)": 1})
        );
    }

    /// `include` matches paths relative to the listed `path`, as the local
    /// tools do, and an omitted entry outside the globs is not named.
    #[test]
    fn include_globs_match_relative_to_the_listed_path() {
        let query: GhStructureQueryTree = serde_json::from_value(json!({
            "owner":"a","repo":"b","path":"pkg","include":["src/*.rs"]
        }))
        .expect("query");
        let scope = Scope::of(&query).expect("scope");
        let entry = |path: &str| TreeEntry {
            path: path.into(),
            kind: EntryKind::File,
            size: Some(1),
        };
        let mut traversal = Traversal {
            entries: vec![
                entry("pkg/src/lib.rs"),
                entry("pkg/src/nested/a.rs"),
                entry("pkg/lib.rs"),
            ],
            omitted: [
                ("pkg/src/link.rs (symlink)".to_owned(), 1),
                ("pkg/vendor (submodule)".to_owned(), 1),
            ]
            .into(),
            ..Traversal::default()
        };
        scope.select(&mut traversal);
        let kept = traversal
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert_eq!(kept, ["pkg/src/lib.rs"]);
        assert_eq!(
            serde_json::to_value(&traversal.omitted).expect("omitted"),
            json!({"pkg/src/link.rs (symlink)": 1})
        );
    }

    /// A git tree types a symlink `blob` of mode `120000`: it is named
    /// beside the skipped entries, never listed or sized as a file, and a
    /// listing rooted at it says it is a symlink and is repaired by a read
    /// (which follows the link to its file).
    #[test]
    fn a_git_tree_symlink_is_named_not_listed_as_a_file() {
        let tree: octocode_github::TreeResponse = serde_json::from_value(json!({
            "sha":"s","truncated":false,"tree":[
                {"path":"README.md","type":"blob","mode":"100644","size":1},
                {"path":"docs","type":"blob","mode":"120000","size":9}
            ]
        }))
        .expect("tree");
        let traversal = traverse::traversal_from_git_tree(tree.clone(), &test_listing());
        let listed = traversal
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert_eq!(listed, ["README.md"]);
        assert_eq!(
            serde_json::to_value(&traversal.omitted).expect("omitted"),
            json!({"docs (symlink)": 1})
        );
        let link = root_is_directory(&tree, "docs").expect_err("a symlink");
        assert_eq!(link.reason, Some(ProviderErrorReason::PathIsFile));
        assert_eq!(
            link.message.as_ref(),
            "Path \"docs\" is a symlink, not a directory"
        );
    }

    /// A Contents listing types a submodule `file` with size 0; its git
    /// URL names another repository's tree.
    #[test]
    fn a_submodule_typed_file_is_not_a_zero_byte_file() {
        let entries: Vec<ContentsEntry> = serde_json::from_value(json!([
            {"name":"book","path":"src/doc/book","type":"file","size":0,
             "git_url":"https://api.github.com/repos/rust-lang/book/git/trees/abc"},
            {"name":"empty.txt","path":"src/doc/empty.txt","type":"file","size":0,
             "git_url":"https://api.github.com/repos/rust-lang/rust/git/blobs/def"}
        ]))
        .expect("entries");
        assert!(entry_kind(&entries[0]).is_none());
        assert_eq!(entry_kind(&entries[1]), Some(EntryKind::File));
    }

    #[test]
    fn skips_symlinks_and_submodules() {
        for kind in ["symlink", "submodule"] {
            assert!(
                entry_kind(&ContentsEntry {
                    name: "x".into(),
                    path: "x".into(),
                    kind: kind.into(),
                    size: None,
                    sha: None,
                    git_url: None,
                })
                .is_none()
            );
        }
    }
    /// The `dir` of a row is repo-relative, the same base as `path` and `include`.
    #[test]
    fn structure_dirs_are_repo_relative() {
        let rows = build_structure(&[
            TreeEntry {
                path: "src/lib.rs".into(),
                kind: EntryKind::File,
                size: Some(1),
            },
            TreeEntry {
                path: "src/nested".into(),
                kind: EntryKind::Dir,
                size: None,
            },
            TreeEntry {
                path: "src/nested/a.rs".into(),
                kind: EntryKind::File,
                size: Some(1),
            },
        ]);
        assert_eq!(
            rows,
            vec![
                json!({"dir":"src","files":["lib.rs"],"folders":["nested"]}),
                json!({"dir":"src/nested","files":["a.rs"]}),
            ]
        );
        let root = build_structure(&[TreeEntry {
            path: "README.md".into(),
            kind: EntryKind::File,
            size: Some(1),
        }]);
        assert_eq!(root, vec![json!({"dir":".","files":["README.md"]})]);
    }

    mod provider_tests {
        use super::*;
        use crate::tools::gh_shared::test_support::{default_context, mock_provider, mount_json};
        use octocode_github::RetryPolicy;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

        async fn server() -> MockServer {
            let server = MockServer::builder().start().await;
            for reference in ["main", "HEAD"] {
                Mock::given(method("GET"))
                    .and(path(format!("/api/v3/repos/a/b/commits/{reference}")))
                    .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
                    .mount(&server)
                    .await;
            }
            mount_json(
                &server,
                "/api/v3/repos/a/b",
                200,
                json!({"default_branch":"main","full_name":"a/b"}),
            )
            .await;
            server
        }

        fn query(value: Value) -> GhStructureQuery {
            serde_json::from_value(value).expect("ghStructure query")
        }

        /// A repository that does not resolve (a typo) leads to a search for
        /// its name, as the search tools' failures do.
        #[tokio::test]
        async fn a_missing_repository_leads_to_a_repository_search() {
            let server = MockServer::builder().start().await;
            for route in ["/api/v3/repos/a/typo", "/api/v3/repos/a/typo/commits/HEAD"] {
                mount_json(&server, route, 404, json!({"message":"Not Found"})).await;
            }
            let home = tempfile::tempdir().expect("home");
            let provider = mock_provider(&server, RetryPolicy::default());
            let context = default_context();
            let failure = run(
                &provider,
                &query(json!({"owner":"a","repo":"typo"})),
                Ok(&context),
                home.path(),
            )
            .await
            .expect_err("missing repository");
            let lead = &failure.next.as_ref().expect("next")["findRepository"];
            assert_eq!(lead["tool"], "ghSearchRepo", "{lead}");
            assert_eq!(
                lead["query"]["queries"][0]["keywords"],
                json!(["typo"]),
                "{lead}"
            );
        }

        /// A `refs` read of one `ref` says what the name resolved to
        /// (branch, tag or commit), not only the commit it points at.
        #[tokio::test]
        async fn a_named_ref_states_its_kind() {
            let server = server().await;
            for (reference, branch, tag) in [
                ("main", Some(SHA), None),
                ("v1.0", None, Some(SHA)),
                (SHA, None, None),
            ] {
                if reference != "main" && reference != SHA {
                    Mock::given(method("GET"))
                        .and(path(format!("/api/v3/repos/a/b/commits/{reference}")))
                        .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
                        .mount(&server)
                        .await;
                }
                for (kind, found) in [("heads", branch), ("tags", tag)] {
                    let route = format!("/api/v3/repos/a/b/git/ref/{kind}/{reference}");
                    match found {
                        Some(sha) => {
                            mount_json(&server, route, 200, json!({"object":{"sha":sha}})).await
                        }
                        None => {
                            mount_json(&server, route, 404, json!({"message":"Not Found"})).await
                        }
                    }
                }
            }
            for (reference, kind) in [("main", "branch"), ("v1.0", "tag"), (SHA, "commit")] {
                let out = list(
                    &server,
                    json!({"owner":"a","repo":"b","operation":"refs","ref":reference}),
                )
                .await
                .expect("refs");
                assert_eq!(out.data["commitSha"], SHA, "{reference}: {}", out.data);
                assert_eq!(out.data["refKind"], kind, "{reference}: {}", out.data);
            }
        }

        /// The branch-listing lead keeps the caller's extras and adds
        /// `details` (the extra that lists branches); it never replaces them.
        #[tokio::test]
        async fn the_branch_listing_lead_adds_details_to_the_callers_extras() {
            let server = server().await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/tags",
                200,
                json!([{"name":"v1","commit":{"sha":SHA}}]),
            )
            .await;
            for (extras, expected) in [
                (json!(["hints"]), json!(["hints", "details"])),
                (json!([]), json!(["details"])),
                (
                    json!(["stats", "hints"]),
                    json!(["stats", "hints", "details"]),
                ),
            ] {
                let out = list(
                    &server,
                    json!({"owner":"a","repo":"b","operation":"refs","extras":extras}),
                )
                .await
                .expect("refs");
                assert_eq!(
                    out.data
                        .pointer("/next/viewRefs/query/queries/0/extras")
                        .cloned(),
                    Some(expected),
                    "{}",
                    out.data
                );
            }
        }

        /// A refs page of a renamed repository (GitHub answers 301 to
        /// `/repositories/<id>`) warns once and leads under the canonical
        /// name, as a listing does.
        #[tokio::test]
        async fn a_refs_page_of_a_renamed_repository_warns_and_leads_canonically() {
            let server = MockServer::builder().start().await;
            Mock::given(method("GET"))
                .and(path("/api/v3/repos/a/b/commits/HEAD"))
                .respond_with(ResponseTemplate::new(301).insert_header(
                    "location",
                    format!("{}/api/v3/repositories/1/commits/HEAD", server.uri()),
                ))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/api/v3/repositories/1/commits/HEAD"))
                .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
                .mount(&server)
                .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b",
                200,
                json!({"default_branch":"main","full_name":"c/d"}),
            )
            .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/tags",
                200,
                json!([{"name":"v1","commit":{"sha":SHA}}]),
            )
            .await;
            let out = list(
                &server,
                json!({"owner":"a","repo":"b","operation":"refs","extras":[]}),
            )
            .await
            .expect("refs");
            assert_eq!(
                out.data["warnings"],
                json!([crate::tools::gh_shared::renamed_warning(
                    "a",
                    "b",
                    &("c".into(), "d".into())
                )]),
                "{}",
                out.data
            );
            let lead = &out.data["next"]["viewRefs"]["query"]["queries"][0];
            assert_eq!(
                (lead["owner"].as_str(), lead["repo"].as_str()),
                (Some("c"), Some("d")),
                "{}",
                out.data
            );
        }

        /// A renamed repository answers `/repos/a/b/...` with a 301 to
        /// `/repositories/1/...`; its metadata names `c/d`.
        async fn renamed_server(route: &str, status: u16, body: Value) -> MockServer {
            let server = MockServer::builder().start().await;
            Mock::given(method("GET"))
                .and(path(format!("/api/v3/repos/a/b/{route}")))
                .respond_with(ResponseTemplate::new(301).insert_header(
                    "location",
                    format!("{}/api/v3/repositories/1/{route}", server.uri()),
                ))
                .mount(&server)
                .await;
            mount_json(
                &server,
                format!("/api/v3/repositories/1/{route}"),
                status,
                body,
            )
            .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b",
                200,
                json!({"default_branch":"main","full_name":"c/d"}),
            )
            .await;
            server
        }

        /// `operation:"languages"` on a renamed repository carries the
        /// rename warning, as its tree and refs rows do.
        #[tokio::test]
        async fn languages_of_a_renamed_repository_warn_of_the_rename() {
            let server = renamed_server("languages", 200, json!({"Rust": 10})).await;
            let out = list(
                &server,
                json!({"owner":"a","repo":"b","operation":"languages"}),
            )
            .await
            .expect("languages");
            assert_eq!(out.data["languages"], json!({"Rust": 10}), "{}", out.data);
            assert_eq!(
                out.data["warnings"],
                json!([crate::tools::gh_shared::renamed_warning(
                    "a",
                    "b",
                    &("c".into(), "d".into())
                )]),
                "{}",
                out.data
            );
        }

        /// A ref that does not resolve on a renamed repository names the
        /// repository as it is now, in the message and the `viewRefs` lead.
        #[tokio::test]
        async fn a_missing_ref_of_a_renamed_repository_names_it_canonically() {
            let server = renamed_server(
                "commits/nope",
                422,
                json!({"message":"No commit found for SHA: nope"}),
            )
            .await;
            let home = tempfile::tempdir().expect("home");
            let provider = mock_provider(&server, RetryPolicy::default());
            let context = default_context();
            let failure = run(
                &provider,
                &query(json!({"owner":"a","repo":"b","operation":"refs","ref":"nope"})),
                Ok(&context),
                home.path(),
            )
            .await
            .expect_err("missing ref");
            assert!(failure.message.contains("c/d"), "{}", failure.message);
            let lead = &failure.next.expect("viewRefs")["viewRefs"]["query"]["queries"][0];
            assert_eq!(
                (lead["owner"].as_str(), lead["repo"].as_str()),
                (Some("c"), Some("d")),
                "{lead}"
            );
        }

        /// A listing path is read as the repository names it (`./`, `//`
        /// and `a/../` resolved), and its leads name that path; a path that
        /// climbs above the root is invalid input, before any request.
        #[tokio::test]
        async fn listing_paths_are_normalized_and_escapes_rejected() {
            let server = server().await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/src%2Flib",
                200,
                json!([{"name":"a.rs","path":"src/lib/a.rs","type":"file","size":3}]),
            )
            .await;
            let home = tempfile::tempdir().expect("home");
            let provider = mock_provider(&server, RetryPolicy::default());
            let context = default_context();
            for requested in ["./src/lib", "src//lib/", "src/x/../lib"] {
                let out = run(
                    &provider,
                    &query(json!({"owner":"a","repo":"b","path":requested})),
                    Ok(&context),
                    home.path(),
                )
                .await
                .unwrap_or_else(|failure| panic!("{requested}: {}", failure.message));
                assert_eq!(
                    out.data["files"][0]["dir"], "src/lib",
                    "{requested}: {}",
                    out.data
                );
            }
            let before = server.received_requests().await.unwrap_or_default().len();
            for escape in ["../..", "../../etc", "src/../../x"] {
                let failure = run(
                    &provider,
                    &query(json!({"owner":"a","repo":"b","path":escape})),
                    Ok(&context),
                    home.path(),
                )
                .await
                .expect_err(escape);
                assert_eq!(
                    failure.error.kind,
                    ProviderErrorKind::Validation,
                    "{escape}"
                );
            }
            let after = server.received_requests().await.unwrap_or_default().len();
            assert_eq!(before, after, "an escape sends no request");
        }

        async fn list(server: &MockServer, value: Value) -> Result<ToolData, ProviderError> {
            let home = tempfile::tempdir().expect("home");
            let provider = mock_provider(server, RetryPolicy::default());
            let context = default_context();
            execute(&provider, &query(value), &context, home.path()).await
        }

        /// The happy-path anchors: each `dir` with its entry names (the
        /// next read's path), the resolved branch and its `commitSha` (the
        /// next read's ref); no query field is echoed.
        #[tokio::test]
        async fn a_listing_row_carries_dir_entries_commit_and_resolved_ref() {
            let server = server().await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents",
                200,
                json!([
                    {"name":"lib.rs","path":"lib.rs","type":"file","size":3},
                    {"name":"src","path":"src","type":"dir"}
                ]),
            )
            .await;
            let out = list(&server, json!({"owner":"a","repo":"b"}))
                .await
                .expect("listing");
            let data = &out.data;
            assert_eq!(
                data["files"],
                json!([{"dir":".","files":["lib.rs (3)"],"folders":["src"]}]),
                "{data}"
            );
            assert_eq!(data["resolvedRef"], "main", "{data}");
            assert_eq!(data["commitSha"], SHA, "{data}");
            for echo in ["owner", "repo", "path", "operation", "ref"] {
                assert!(data.get(echo).is_none(), "{echo} echoed: {data}");
            }
            let read = &data["next"]["read"]["query"]["queries"][0];
            assert_eq!(read["path"], "lib.rs", "{data}");
            assert_eq!(read["ref"], SHA, "{data}");
        }

        /// A recursive tree past GitHub's limit is read subtree by subtree:
        /// a folder's whole subtree comes from one recursive read by its
        /// tree SHA (no per-folder Contents walk), so a bare-word `include`
        /// finds names at any depth. Pages are disjoint, and each page's
        /// continuation is the whole query pinned to the listed commit.
        #[tokio::test]
        async fn a_truncated_tree_is_read_by_subtree_and_pages_without_overlap() {
            let server = server().await;
            mount_json(
                &server,
                format!("/api/v3/repos/a/b/git/trees/{SHA}"),
                200,
                json!({"sha":SHA,"truncated":true,"tree":[]}),
            )
            .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents",
                200,
                json!([
                    {"name":"README.md","path":"README.md","type":"file","size":1},
                    {"name":"src","path":"src","type":"dir","sha":"d".repeat(40)}
                ]),
            )
            .await;
            mount_json(
                &server,
                format!("/api/v3/repos/a/b/git/trees/{}", "d".repeat(40)),
                200,
                json!({"sha":"d".repeat(40),"truncated":false,"tree":[
                    {"path":"a","type":"tree"},
                    {"path":"a/b","type":"tree"},
                    {"path":"a/b/handler.rs","type":"blob","size":5},
                    {"path":"a/b/other.rs","type":"blob","size":5},
                    {"path":"a/handler_test.rs","type":"blob","size":5}
                ]}),
            )
            .await;
            Mock::given(method("GET"))
                .and(path("/api/v3/repos/a/b/contents/src"))
                .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
                .expect(0)
                .mount(&server)
                .await;
            let base =
                json!({"owner":"a","repo":"b","ref":"main","include":["handler"],"pageSize":1});
            let first = list(&server, base.clone()).await.expect("page 1");
            let next = &first.data["next"]["nextPage"]["query"]["queries"][0];
            assert_eq!(next["include"], json!(["handler"]), "{}", first.data);
            assert_eq!(next["ref"], SHA, "{}", first.data);
            assert_eq!(next["pageSize"], 1, "{}", first.data);
            assert_eq!(next["page"], 2, "{}", first.data);
            assert!(first.data.get("terminalLimit").is_none(), "{}", first.data);
            let second = list(&server, next.clone()).await.expect("page 2");
            assert!(
                second.data["next"].get("nextPage").is_none(),
                "{}",
                second.data
            );
            let rows = [&first.data, &second.data].map(|data| data["files"].clone());
            assert_eq!(
                json!(rows),
                json!([
                    [{"dir":"src/a","files":["handler_test.rs (5)"]}],
                    [{"dir":"src/a/b","files":["handler.rs (5)"]}]
                ]),
                "{} {}",
                first.data,
                second.data
            );
        }

        /// A directory past the Contents API's 1,000-entry cap is listed
        /// whole from its own git tree (the root's is the commit's; a scoped
        /// directory's SHA comes from its parent listing) and paged like any
        /// listing: every entry once, no provider limit, no clone lead.
        #[tokio::test]
        async fn a_directory_past_the_contents_cap_is_listed_whole_and_paged() {
            let names = |count: usize| (0..count).map(|n| format!("f{n:04}.rs"));
            let contents: Vec<Value> = names(1000)
                .map(|name| json!({"name":name,"path":name,"type":"file","size":1}))
                .collect();
            let tree: Vec<Value> = names(1200)
                .map(|name| json!({"path":name,"type":"blob","size":1}))
                .collect();
            let server = server().await;
            mount_json(&server, "/api/v3/repos/a/b/contents", 200, json!(contents)).await;
            mount_json(
                &server,
                format!("/api/v3/repos/a/b/git/trees/{SHA}"),
                200,
                json!({"sha":SHA,"truncated":false,"tree":tree}),
            )
            .await;
            let mut listed = Vec::new();
            let mut row = json!({"owner":"a","repo":"b","pageSize":500});
            for page in 1..=3 {
                let out = list(&server, row.clone()).await.expect("listing");
                let data = &out.data;
                assert!(data.get("terminalLimit").is_none(), "page {page}: {data}");
                assert!(data.get("providerLimit").is_none(), "page {page}: {data}");
                assert!(
                    data["next"].get("cloneRepo").is_none(),
                    "page {page}: {data}"
                );
                for name in data["files"][0]["files"].as_array().expect("files") {
                    listed.push(name.as_str().unwrap_or_default().to_owned());
                }
                match data["next"].get("nextPage") {
                    Some(next) => row = next["query"]["queries"][0].clone(),
                    None => assert_eq!(page, 3, "{data}"),
                }
            }
            let expected: Vec<String> = names(1200).map(|name| format!("{name} (1)")).collect();
            assert_eq!(listed, expected);

            // A scoped directory: its tree SHA is read from its parent.
            let dir = "e".repeat(40);
            let scoped: Vec<Value> = names(1000)
                .map(
                    |name| json!({"name":name,"path":format!("big/{name}"),"type":"file","size":1}),
                )
                .collect();
            let server = self::server().await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents",
                200,
                json!([{"name":"big","path":"big","type":"dir","sha":dir}]),
            )
            .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/big",
                200,
                json!(scoped),
            )
            .await;
            mount_json(
                &server,
                format!("/api/v3/repos/a/b/git/trees/{dir}"),
                200,
                json!({"sha":dir,"truncated":false,"tree":tree}),
            )
            .await;
            let out = list(
                &server,
                json!({"owner":"a","repo":"b","path":"big","pageSize":500,"page":3}),
            )
            .await
            .expect("scoped listing");
            assert!(out.data.get("providerLimit").is_none(), "{}", out.data);
            assert_eq!(out.data["files"][0]["dir"], "big", "{}", out.data);
            assert_eq!(
                out.data["files"][0]["files"].as_array().map(Vec::len),
                Some(200),
                "{}",
                out.data
            );
        }

        /// A listing of a file is typed; its one repair is that file's read
        /// at the commit the listing resolved (not the movable ref), with no
        /// prose beside it.
        #[tokio::test]
        async fn a_listing_of_a_file_leads_to_its_read() {
            let server = server().await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/src%2Flib.rs",
                200,
                json!({"name":"lib.rs","path":"src/lib.rs","type":"file","size":3}),
            )
            .await;
            let provider = mock_provider(&server, RetryPolicy::default());
            let context = default_context();
            let home = tempfile::tempdir().expect("home");
            let failure = run(
                &provider,
                &query(json!({"owner":"a","repo":"b","path":"src/lib.rs","ref":"main"})),
                Ok(&context),
                home.path(),
            )
            .await
            .expect_err("a file is not a tree");
            assert_eq!(failure.error.reason, Some(ProviderErrorReason::PathIsFile));
            assert_eq!(
                failure.message,
                "Path \"src/lib.rs\" is a file, not a directory"
            );
            assert!(failure.hints.is_empty(), "{:?}", failure.hints);
            let next = failure.next.expect("read lead");
            assert_eq!(next["read"]["tool"], "ghGetFileContent", "{next}");
            assert_eq!(
                next["read"]["query"]["queries"][0],
                json!({"owner":"a","repo":"b","path":"src/lib.rs","ref":SHA}),
                "{next}"
            );
        }

        /// A listing of a submodule leads to the submodule's repository at
        /// the commit the parent pins, as a read of it does; a symlink is
        /// read (the read follows it to its file). Neither gets the generic
        /// invalid-field tip.
        #[tokio::test]
        async fn a_listing_of_a_submodule_or_symlink_leads_to_its_content() {
            let server = server().await;
            let pinned = "89abcdef0123456789abcdef0123456789abcdef";
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/vendor%2Flib",
                200,
                json!({"type":"submodule","name":"lib","path":"vendor/lib","sha":pinned,
                    "submodule_git_url":format!("{}/o2/r2.git", server.uri())}),
            )
            .await;
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/docs%2Flink",
                200,
                json!({"type":"symlink","name":"link","path":"docs/link","target":"../README.md"}),
            )
            .await;
            let provider = mock_provider(&server, RetryPolicy::default());
            let context = default_context();
            let home = tempfile::tempdir().expect("home");
            let listing =
                |path: &str| query(json!({"owner":"a","repo":"b","path":path,"ref":"main"}));
            let submodule = run(&provider, &listing("vendor/lib"), Ok(&context), home.path())
                .await
                .expect_err("a submodule is not a tree");
            assert_eq!(submodule.error.reason, Some(ProviderErrorReason::Submodule));
            assert!(submodule.hints.is_empty(), "{:?}", submodule.hints);
            let next = submodule.next.expect("submodule lead");
            let row = &next["viewTree"]["query"]["queries"][0];
            assert_eq!(next["viewTree"]["tool"], "ghStructure", "{next}");
            assert_eq!(
                (&row["owner"], &row["repo"]),
                (&json!("o2"), &json!("r2")),
                "{next}"
            );
            assert_eq!(row["ref"], pinned, "{next}");
            let symlink = run(&provider, &listing("docs/link"), Ok(&context), home.path())
                .await
                .expect_err("a symlink is not a tree");
            assert_eq!(
                symlink.message,
                "Path \"docs/link\" is a symlink, not a directory"
            );
            let next = symlink.next.expect("read lead");
            assert_eq!(
                next["read"]["query"]["queries"][0],
                json!({"owner":"a","repo":"b","path":"docs/link","ref":SHA}),
                "{next}"
            );
        }
    }
}

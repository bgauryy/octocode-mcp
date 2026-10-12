use super::leads::{declaration_read, hits_read, line_read, read_top_match, scoped_fragment_read};
use super::{GhSearchCodeQuery, GhSearchCodeQueryMatchIn};
use crate::providers::github::{
    GitHubTransport, ProviderErrorKind, ProviderErrorReason, RequestContext,
};
use crate::tools::gh_shared::ensure_next;
use crate::tools::id::ToolId;
use crate::tools::result::Continuation;
use crate::{
    providers::github::{CodeSearchItem, ProviderError},
    security::scan::ContentScan,
};
use serde_json::{Value, json};
use std::collections::HashMap;

/// GitHub answers a code search of a login that does not exist with an empty,
/// incomplete page. An empty, incomplete owner-wide search therefore checks
/// the login: a missing one is a not-found failure, not an empty search.
pub(super) async fn owner_exists(
    owner: &str,
    transport: &GitHubTransport,
    context: &RequestContext,
) -> Result<(), ProviderError> {
    match transport
        .list_owner_repositories(owner, "pushed", 1, 1, context)
        .await
    {
        Err(error) if error.kind == ProviderErrorKind::NotFound => {
            Err(error.with_reason(ProviderErrorReason::UserNotFound))
        }
        Err(error)
            if matches!(
                error.kind,
                ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
            ) =>
        {
            Err(error)
        }
        _ => Ok(()),
    }
}

pub(super) async fn empty_scope(
    value: &mut Value,
    diagnostics: &mut crate::tools::result::ToolDiagnostics,
    query: &GhSearchCodeQuery,
    transport: &GitHubTransport,
    context: &RequestContext,
) -> Result<(), ProviderError> {
    let GhSearchCodeQuery {
        owner,
        repo: Some(repo),
        ..
    } = query
    else {
        return Ok(());
    };
    let metadata = transport.repository_metadata(owner, repo, context).await;
    let (name, tool, mut next_query, confidence, code) = match metadata {
        Err(error)
            if matches!(
                error.kind,
                ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
            ) =>
        {
            return Err(error);
        }
        // A missing repository is a not-found failure, not an empty
        // search: the shared search failure names repository access.
        Err(error) if error.kind == ProviderErrorKind::NotFound => {
            return Err(error.with_reason(ProviderErrorReason::RepositoryNotFound));
        }
        Ok(metadata) if metadata.archived => (
            "viewTree",
            ToolId::GhStructure,
            json!({"owner":owner,"repo":repo,"path":""}),
            "exact",
            "ghRepoArchived",
        ),
        // The repository exists: only a scoped path is left to verify (a
        // root listing cannot show a keyword is absent).
        _ => {
            let hint = "No indexed matches is unproven absence; verify the repo structure and search a bounded local copy before concluding.";
            diagnostics.add("ghScopedZeroUnproven", hint, false);
            let Some(scope) = query.path.as_deref().map(|path| path.as_str()) else {
                add_clone_lead(value, query, owner.as_str(), repo.as_str());
                return Ok(());
            };
            // `path` is a directory prefix: list the directory, or for a
            // file's path its parent, and read the file for the keywords.
            let listed = match file_scope(scope) {
                Some(file) => {
                    ensure_next(value);
                    if let Some(read) = super::leads::file_scope_read(query, file.path) {
                        value["next"]["read"] = read;
                    }
                    file.parent
                }
                None => scope.trim_matches('/'),
            };
            (
                "viewTree",
                ToolId::GhStructure,
                json!({"owner":owner,"repo":repo,"path":listed}),
                "exact",
                "ghScopedZeroUnproven",
            )
        }
    };
    let hint = match code {
        "ghRepoArchived" => {
            Some("The repository is archived; its code-search index may lag.".to_owned())
        }
        _ => None,
    };
    // Structure checks inspect the ref the caller asked about, not the
    // default branch the code-search index covers.
    if tool == ToolId::GhStructure
        && let Some(reference) = requested_ref(query)
    {
        next_query["ref"] = json!(reference);
    }
    // A missing, renamed, or archived repository is the answer: say so
    // instead of the generic default-branch note.
    if let Some(hint) = hint {
        diagnostics.add(code, &hint, false);
        value["hints"] = json!([hint]);
    }
    value["next"][name] = Continuation::new(tool, next_query)
        .confidence(confidence)
        .build();
    Ok(())
}

/// The index proves nothing about absence: a local clone of the searched ref
/// is the check that does. Offered for a repository-wide search only: a path
/// scope already leads to its listing, and a row shows two leads at most, so
/// a third would push `broadenSearch` out.
fn add_clone_lead(value: &mut Value, query: &GhSearchCodeQuery, owner: &str, repo: &str) {
    let mut clone = json!({"owner":owner,"repo":repo});
    if let Some(reference) = requested_ref(query) {
        clone["ref"] = json!(reference);
    }
    ensure_next(value);
    value["next"]["cloneRepo"] = Continuation::new(ToolId::GhCloneRepo, clone)
        .confidence("exact")
        .build();
}

/// A `match:"path"` search whose keywords read as code (spaces or syntax
/// characters) rather than path segments.
pub(super) fn path_mode_given_code(query: &GhSearchCodeQuery) -> bool {
    query.match_in == GhSearchCodeQueryMatchIn::Path
        && query.keywords.iter().any(|keyword| {
            keyword
                .trim()
                .chars()
                .any(|c| !(c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '/')))
        })
}

/// Line hits for the files of a `match:"file"` page: a repo-scoped page is
/// read at the requested ref or the default-branch HEAD; an owner-wide page
/// at each hit's indexed commit (from its `html_url`).
pub(super) struct Resolution {
    /// The one commit every row was read at; `None` when rows differ (each
    /// row then names its own `commitSha`).
    pub(super) sha: Option<String>,
    pub(super) reference: Option<String>,
    /// Per row: the commit it was read at, and its hits.
    pub(super) hits: Vec<(String, super::lines::FileHits)>,
}

/// The owner and repository a row's reads target: the query's when it is
/// repo-scoped, else the row's own.
pub(super) fn row_repo<'a>(
    query: &'a GhSearchCodeQuery,
    row: &'a serde_json::Map<String, Value>,
) -> Option<(&'a str, &'a str)> {
    match query.repo.as_deref() {
        Some(repo) => Some((query.owner.as_str(), repo.as_str())),
        None => Some((row.get("owner")?.as_str()?, row.get("repo")?.as_str()?)),
    }
}

/// `(owner, repo, commit)` an owner-wide row is read at.
type RepoCommit = (String, String, String);

/// The commit a code-search hit was indexed at: `html_url` is
/// `…/blob/<sha>/<path>`.
fn indexed_commit(html_url: &str) -> Option<String> {
    let (_, rest) = html_url.split_once("/blob/")?;
    let sha = rest.split('/').next()?;
    octocode_github::is_full_sha(sha).then(|| sha.to_ascii_lowercase())
}

/// The ref hits are verified at; `None` is the default branch.
pub(super) fn requested_ref(query: &GhSearchCodeQuery) -> Option<&str> {
    query
        .ref_
        .as_deref()
        .map(|branch| branch.trim())
        .filter(|branch| !branch.is_empty())
}

/// The commit a page's hit lines are read at, resolved while the index
/// search runs (`None`: the page lists no lines — owner-wide, path-only,
/// or a `fields` pick without `lines`).
pub(super) async fn line_commit<C: crate::providers::github::ConditionalCache>(
    provider: &crate::providers::github::GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    context: &RequestContext,
) -> Option<Result<String, ProviderError>> {
    let repo = query.repo.as_deref()?;
    if !reads_lines(query) {
        return None;
    }
    Some(
        super::lines::resolve_commit(provider, &query.owner, repo, requested_ref(query), context)
            .await,
    )
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn resolve_lines<C: crate::providers::github::ConditionalCache>(
    provider: &crate::providers::github::GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    items: &[Value],
    found: &[CodeSearchItem],
    commit: Option<Result<String, ProviderError>>,
    context: &RequestContext,
    security: &impl ContentScan,
) -> Result<Option<Resolution>, ProviderError> {
    if items.is_empty() {
        return Ok(None);
    }
    let Some(repo) = query.repo.as_deref() else {
        return owner_wide_lines(provider, query, items, found, context, security).await;
    };
    let Some(commit) = commit else {
        return Ok(None);
    };
    let reference = requested_ref(query);
    let sha = match commit {
        Ok(sha) => sha,
        Err(error) if error.kind == ProviderErrorKind::Cancelled => return Err(error),
        // A named ref that does not resolve is the caller's mistake: never
        // fall back to default-branch lines labeled as that ref.
        Err(error) if reference.is_some() => return Err(error),
        Err(_) => return Ok(None),
    };
    // Every row is read (through the contents cache): an index fragment
    // carries no line numbers, and at a ref it is default-branch text.
    let paths = items
        .iter()
        .filter_map(|row| row.get("path").and_then(Value::as_str).map(str::to_owned))
        .collect::<Vec<_>>();
    let hits = super::lines::resolve_files(
        provider,
        &query.owner,
        repo,
        &sha,
        &paths,
        &query.keywords,
        // Without a mainGoal the keywords alone pick the best hit.
        query.main_goal.as_ref().map_or("", |goal| goal.as_str()),
        context,
        security,
    )
    .await?;
    Ok(Some(Resolution {
        hits: hits.into_iter().map(|hits| (sha.clone(), hits)).collect(),
        sha: Some(sha),
        reference: reference.map(str::to_owned),
    }))
}

/// Line hits of an owner-wide `match:"file"` page: each row is read at the
/// commit its hit was indexed at, one concurrent batch per repository and
/// commit. A row without an indexed commit keeps its fragments.
async fn owner_wide_lines<C: crate::providers::github::ConditionalCache>(
    provider: &crate::providers::github::GitHubProvider<C>,
    query: &GhSearchCodeQuery,
    items: &[Value],
    found: &[CodeSearchItem],
    context: &RequestContext,
    security: &impl ContentScan,
) -> Result<Option<Resolution>, ProviderError> {
    if !reads_lines(query) {
        return Ok(None);
    }
    let commits: HashMap<(&str, &str), String> = found
        .iter()
        .filter_map(|item| {
            let sha = indexed_commit(&item.html_url)?;
            Some((
                (item.repository.full_name.as_str(), item.path.as_str()),
                sha,
            ))
        })
        .collect();
    // (owner, repo, sha) -> the rows (index, path) read there.
    let mut groups: Vec<(RepoCommit, Vec<(usize, String)>)> = Vec::new();
    for (index, row) in items.iter().enumerate() {
        let (Some(owner), Some(repo), Some(path)) = (
            row.get("owner").and_then(Value::as_str),
            row.get("repo").and_then(Value::as_str),
            row.get("path").and_then(Value::as_str),
        ) else {
            continue;
        };
        let full_name = format!("{owner}/{repo}");
        let Some(sha) = commits.get(&(full_name.as_str(), path)) else {
            continue;
        };
        let key = (owner.to_owned(), repo.to_owned(), sha.clone());
        match groups.iter_mut().find(|(group, _)| *group == key) {
            Some((_, rows)) => rows.push((index, path.to_owned())),
            None => groups.push((key, vec![(index, path.to_owned())])),
        }
    }
    if groups.is_empty() {
        return Ok(None);
    }
    let goal = query.main_goal.as_ref().map_or("", |goal| goal.as_str());
    let reads = groups.iter().map(|((owner, repo, sha), rows)| async move {
        let paths = rows
            .iter()
            .map(|(_, path)| path.clone())
            .collect::<Vec<_>>();
        super::lines::resolve_files(
            provider,
            owner,
            repo,
            sha,
            &paths,
            &query.keywords,
            goal,
            context,
            security,
        )
        .await
    });
    let resolved = futures_util::future::join_all(reads).await;
    let mut hits: Vec<Option<(String, super::lines::FileHits)>> =
        (0..items.len()).map(|_| None).collect();
    for (((_, _, sha), rows), result) in groups.iter().zip(resolved) {
        for ((index, _), file) in rows.iter().zip(result?) {
            hits[*index] = Some((sha.clone(), file));
        }
    }
    let hits: Vec<(String, super::lines::FileHits)> = hits
        .into_iter()
        .map(|hit| hit.unwrap_or_else(|| (String::new(), super::lines::FileHits::Unavailable)))
        .collect();
    let mut shas = hits
        .iter()
        .map(|(sha, _)| sha.as_str())
        .filter(|sha| !sha.is_empty());
    let first = shas.next().map(str::to_owned);
    let uniform = first.filter(|sha| shas.all(|other| other == sha));
    Ok(Some(Resolution {
        sha: uniform,
        reference: None,
        hits,
    }))
}

/// A search pinned to a ref other than the default-branch head: its files
/// come from the default-branch index, so files only at the ref are missing
/// and unresolved rows show default-branch text. Warn with the index commit
/// and lead first to the ref's own listing. `resolved_sha` is the ref's
/// commit when the hit lines were read at it.
pub(super) async fn disclose_index_ref<C: crate::providers::github::ConditionalCache>(
    provider: &crate::providers::github::GitHubProvider<C>,
    value: &mut Value,
    query: &GhSearchCodeQuery,
    resolved_sha: Option<String>,
    context: &RequestContext,
) -> Result<(), ProviderError> {
    let (Some(reference), Some(repo)) = (requested_ref(query), query.repo.as_deref()) else {
        return Ok(());
    };
    let owner = query.owner.as_str();
    let head = commit_or_none(provider, owner, repo, None, context).await?;
    let at_ref = match resolved_sha {
        Some(sha) => Some(sha),
        None => commit_or_none(provider, owner, repo, Some(reference), context).await?,
    };
    if head.is_some() && head == at_ref {
        return Ok(());
    }
    let index = head.as_deref().map_or_else(String::new, |sha| {
        format!(" at {}", &sha[..sha.len().min(7)])
    });
    let lines = if resolved_sha_shown(value) {
        format!("; `lines` read at {reference}")
    } else {
        String::new()
    };
    // The per-call facts only: the index commit and the ref. That files
    // only at the ref are missing is the description's, and `viewRepo`
    // lists them.
    let warning = format!("Files from the default-branch index{index}, not {reference}{lines}.");
    crate::tools::gh_shared::push_warning(value, warning);
    let mut listing = json!({
        "owner": owner,
        "repo": repo.as_str(),
        "path": query.path.as_deref().map_or("", |path| path.as_str()),
        "ref": at_ref.as_deref().unwrap_or(reference),
    });
    // Rows not at the ref were moved or renamed there: search their names
    // across the whole tree (a moved file may leave the searched path).
    let moved = moved_names(value);
    if !moved.is_empty() {
        listing["include"] = json!(moved);
        if let Some(listing) = listing.as_object_mut() {
            listing.shift_remove("path");
        }
    }
    let lead = Continuation::new(ToolId::GhStructure, listing).build();
    ensure_next(value);
    if let Some(next) = value.get_mut("next").and_then(Value::as_object_mut) {
        next.shift_insert(0, "viewRepo".to_owned(), lead);
    }
    Ok(())
}

/// File names of the rows absent at the requested ref (`atRef:false`),
/// once each, within the input array limit.
fn moved_names(value: &Value) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for row in value["files"].as_array().into_iter().flatten() {
        if row.get("atRef") != Some(&json!(false)) {
            continue;
        }
        let Some(path) = row.get("path").and_then(Value::as_str) else {
            continue;
        };
        let name = path.rsplit('/').next().unwrap_or(path).to_owned();
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }
    names.truncate(crate::tools::id::MAX_INPUT_ARRAY_ITEMS);
    names
}

/// The commit `reference` (`None`: the default-branch head) names, or
/// `None` when it does not resolve; only cancellation fails.
async fn commit_or_none<C: crate::providers::github::ConditionalCache>(
    provider: &crate::providers::github::GitHubProvider<C>,
    owner: &str,
    repo: &str,
    reference: Option<&str>,
    context: &RequestContext,
) -> Result<Option<String>, ProviderError> {
    match super::lines::resolve_commit(provider, owner, repo, reference, context).await {
        Ok(sha) => Ok(Some(sha)),
        Err(error) if error.kind == ProviderErrorKind::Cancelled => Err(error),
        Err(_) => Ok(None),
    }
}

/// Some row lists `lines` read at the resolved commit.
fn resolved_sha_shown(value: &Value) -> bool {
    value["files"]
        .as_array()
        .is_some_and(|files| files.iter().any(|row| row.get("lines").is_some()))
}

/// Reads a shaped page carries: the top hit's line range, and one read of
/// every keyword line for each file whose listed hits were capped or cut.
pub(super) struct PageReads {
    pub(super) top: Option<Value>,
    pub(super) hits: Vec<Value>,
}

/// Shape file rows: resolved files list numbered `lines` instead of index
/// fragments; fragment `matchIndices` are verbose (core field class); a repo-scoped
/// page names owner/repo once. The top read is a line range of the top
/// resolved hit, else `fragment_read` kept inside the verified source scope.
/// Hit lines are read for content matches unless a `fields` pick leaves
/// them out (then the page is paths, with no line reads).
fn reads_lines(query: &GhSearchCodeQuery) -> bool {
    query.match_in == GhSearchCodeQueryMatchIn::File
        && (query.fields.is_empty() || query.fields.iter().any(|field| field.as_str() == "lines"))
}

pub(super) fn shape_files(
    value: &mut Value,
    items: &mut [Value],
    query: &GhSearchCodeQuery,
    resolution: Option<Resolution>,
) -> PageReads {
    let mut hit_reads = Vec::new();
    // One read lead: the top resolved hit's lines; only without them, the
    // index fragment (computed from the top row before it is reshaped).
    let fragment = items.first().cloned();
    let mut top = None;
    if let Some(resolution) = &resolution {
        if let Some(sha) = &resolution.sha {
            value["commitSha"] = json!(sha);
        }
        for (row, (sha, hits)) in items.iter_mut().zip(&resolution.hits) {
            let Some(row) = row.as_object_mut() else {
                continue;
            };
            // Rows read at different commits each name theirs.
            if resolution.sha.is_none()
                && !sha.is_empty()
                && matches!(hits, super::lines::FileHits::Lines { .. })
            {
                row.insert("commitSha".into(), json!(sha));
            }
            match hits {
                super::lines::FileHits::Lines {
                    lines,
                    clipped,
                    first,
                    last,
                    best,
                    total,
                    line_count,
                    declaration,
                    resume_after,
                } => {
                    if !query
                        .extras
                        .contains(&crate::contracts::tool_types::ExtraKind::Details)
                    {
                        row.shift_remove("matches");
                    }
                    row.insert("lines".into(), json!(lines));
                    if *total > lines.len() {
                        row.insert("matchCount".into(), json!(total));
                    }
                    if (*total > lines.len() || *clipped)
                        && let Some(read) = hits_read(
                            query,
                            row,
                            sha,
                            resume_after.map(|after| (after, *line_count)),
                        )
                    {
                        hit_reads.push(read);
                    }
                    if top.is_none() {
                        top = Some(match declaration {
                            Some(head) => declaration_read(query, row, head, sha),
                            None => line_read(query, row, (*first, *last, *best), *line_count, sha),
                        });
                    }
                }
                super::lines::FileHits::Missing | super::lines::FileHits::Unmatched
                    if resolution.reference.is_some() =>
                {
                    // The path, or its hit, is not at the ref; the
                    // default-branch snippet is not this ref's content.
                    row.shift_remove("matches");
                    row.insert("atRef".into(), json!(false));
                }
                super::lines::FileHits::Unavailable if resolution.reference.is_some() => {
                    // Not read at the ref: drop the default-branch snippet and
                    // lead to the keyword lines at the ref.
                    row.shift_remove("matches");
                    row.insert("lineResolved".into(), json!(false));
                    if let Some(read) = hits_read(query, row, sha, None) {
                        hit_reads.push(read);
                    }
                }
                _ => {
                    row.insert("lineResolved".into(), json!(false));
                }
            }
        }
    }
    for row in items.iter_mut().filter_map(Value::as_object_mut) {
        if query.repo.is_some() {
            row.shift_remove("owner");
            row.shift_remove("repo");
        }
    }
    let top = top.flatten().or_else(|| {
        let read = fragment.as_ref().and_then(read_top_match);
        scoped_fragment_read(read, query, resolution.as_ref())
    });
    PageReads {
        top,
        hits: hit_reads,
    }
}

/// Fields an owner-wide page names once, on the row, when every file row
/// carries the same value: the repository and the commit its lines were
/// read at.
const HOISTED_FIELDS: [&str; 3] = ["owner", "repo", "commitSha"];

/// Move each of [`HOISTED_FIELDS`] that every file row shares to the row
/// itself (a repo-scoped page names owner/repo there already).
pub(super) fn hoist_shared(value: &mut Value, items: &mut [Value]) {
    for field in HOISTED_FIELDS {
        let mut rows = items.iter().map(|row| row.get(field));
        let Some(Some(first)) = rows.next() else {
            continue;
        };
        if value.get(field).is_some() || !rows.all(|other| other == Some(first)) {
            continue;
        }
        let first = first.clone();
        for row in items.iter_mut().filter_map(Value::as_object_mut) {
            row.shift_remove(field);
        }
        value[field] = first;
    }
}

/// Rows whose listed evidence (everything but `path`) is identical, such as
/// the same README in several packages, are listed once: the first keeps the
/// evidence and names every other path in `alsoAt`, in page order.
pub(super) fn merge_identical(items: &mut Vec<Value>) {
    let mut first_of = std::collections::HashMap::new();
    let mut kept: Vec<Value> = Vec::with_capacity(items.len());
    for item in items.drain(..) {
        let evidence = item
            .as_object()
            .filter(|row| row.contains_key("lines") || row.contains_key("matches"))
            .and_then(|row| {
                let mut evidence = row.clone();
                evidence.shift_remove("path")?;
                serde_json::to_string(&evidence).ok()
            });
        let Some(evidence) = evidence else {
            kept.push(item);
            continue;
        };
        match first_of.get(&evidence) {
            Some(&index) => {
                let row: &mut Value = &mut kept[index];
                let path = item["path"].clone();
                match row.get_mut("alsoAt").and_then(Value::as_array_mut) {
                    Some(paths) => paths.push(path),
                    None => {
                        if let Value::Object(fields) = row {
                            let mut rest = std::mem::take(fields);
                            let own = rest.shift_remove("path");
                            fields.extend(own.map(|own| ("path".to_owned(), own)));
                            fields.insert("alsoAt".into(), json!([path]));
                            fields.extend(rest);
                        }
                    }
                }
            }
            None => {
                first_of.insert(evidence, kept.len());
                kept.push(item);
            }
        }
    }
    *items = kept;
}

/// A `path` scope that names one file rather than a directory.
pub(super) struct FileScope<'a> {
    /// The scope without surrounding slashes.
    pub(super) path: &'a str,
    pub(super) parent: &'a str,
    pub(super) name: &'a str,
}

/// The index matches `path` as a directory prefix, so a scope whose last
/// segment looks like a file (an extension that holds a letter, or a known
/// extensionless or dot file such as `Makefile` or `.gitignore`) matches
/// nothing. A dotted directory such as `docs/v1.2` is not a file.
pub(super) fn file_scope(scope: &str) -> Option<FileScope<'_>> {
    let path = scope.trim_matches('/');
    let (parent, name) = path.rsplit_once('/').unwrap_or(("", path));
    let has_extension = name.rsplit_once('.').is_some_and(|(stem, extension)| {
        !stem.is_empty()
            && (1..=8).contains(&extension.len())
            && extension.chars().all(|c| c.is_ascii_alphanumeric())
            && extension.chars().any(|c| c.is_ascii_alphabetic())
    });
    let known = matches!(
        crate::content::classify_file_type(name),
        Some(crate::content::FileType::Config | crate::content::FileType::Lock)
    );
    (has_extension || known).then_some(FileScope { path, parent, name })
}

/// What an empty code search says in its default hint: a requested ref the
/// default-branch index did not cover, and for a `path` scope why that proves
/// nothing (a file's path matches no directory; a directory's index can lag).
/// The leads carry the routes that verify it.
pub(super) fn empty_hint(query: &GhSearchCodeQuery) -> Option<String> {
    let reference = requested_ref(query).map(|reference| {
        format!("Code search indexes only the default branch; `{reference}` was not searched.")
    });
    let scope = query.repo.as_ref().and_then(|_| {
        let scope = query.path.as_deref()?.as_str();
        Some(match file_scope(scope) {
            Some(file) => {
                let under = if file.parent.is_empty() {
                    String::new()
                } else {
                    format!(" with `path:\"{}\"`", file.parent)
                };
                format!(
                    "`path` is a directory prefix and `{}` looks like a file: search it by `filename:\"{}\"`{under}, or read it with matchString.",
                    file.path, file.name
                )
            }
            None => format!(
                "No indexed match under `{}`: unproven absence (the index can lag); ghCloneRepo the path, localSearch it.",
                scope.trim_matches('/')
            ),
        })
    });
    match (reference, scope) {
        (Some(reference), Some(scope)) => Some(format!("{reference} {scope}")),
        (one, other) => one.or(other),
    }
}

pub(super) fn files(
    items: &[CodeSearchItem],
    query: &GhSearchCodeQuery,
    security: &impl ContentScan,
) -> Result<Vec<Value>, ProviderError> {
    let GhSearchCodeQuery {
        match_in, keywords, ..
    } = query;
    let path_only = *match_in == GhSearchCodeQueryMatchIn::Path;
    let terms = super::ranking::terms(keywords)?;
    let mut groups: Vec<super::ranking::Group> = Vec::new();
    let mut group_indices = HashMap::new();
    for item in items {
        let group_index = *group_indices
            .entry(item.repository.full_name.clone())
            .or_insert_with(|| {
                groups.push(super::ranking::Group {
                    id: item.repository.full_name.clone(),
                    matches: Vec::new(),
                });
                groups.len() - 1
            });
        let mut matches = Vec::new();
        if !path_only {
            for fragment in &item.text_matches {
                if let Some(value) = super::fragments::project(fragment, &item.path, security)? {
                    matches.push(value);
                }
            }
            if matches.is_empty() {
                matches.push(json!({"pathOnly":true}));
            }
        } else {
            matches.push(json!({}));
        }
        for value in matches {
            let score = super::ranking::score(
                &item.path,
                value["value"].as_str().unwrap_or_default(),
                &terms,
            );
            groups[group_index].matches.push(super::ranking::Match {
                path: item.path.clone(),
                value,
                score,
            });
        }
    }
    super::ranking::sort(&mut groups)?;
    let mut files: Vec<Value> = Vec::new();
    let mut indices = HashMap::new();
    for group in groups {
        let (owner, repo) = group.id.split_once('/').unwrap_or(("", &group.id));
        for matched in group.matches {
            let key = (group.id.clone(), matched.path.clone());
            let values = if path_only {
                Vec::new()
            } else {
                vec![matched.value]
            };
            if let Some(&index) = indices.get(&key) {
                if let Some(existing) = files
                    .get_mut(index)
                    .and_then(|v: &mut Value| v["matches"].as_array_mut())
                {
                    existing.extend(values);
                }
            } else {
                indices.insert(key, files.len());
                let mut row = json!({"owner":owner,"repo":repo,"path":matched.path});
                // Path matches carry no snippets.
                if !path_only {
                    row["matches"] = json!(values);
                }
                files.push(row);
            }
        }
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::super::leads::unsearched_ref_read;
    use super::*;

    /// An owner-wide page whose rows share a repository and commit names
    /// them once on the row; a field the rows disagree on stays per row.
    #[test]
    fn owner_wide_rows_hoist_shared_repository_and_commit() {
        let mut value = json!({});
        let mut items = vec![
            json!({"owner":"o","repo":"r","commitSha":"c1","path":"a.rs"}),
            json!({"owner":"o","repo":"r","commitSha":"c1","path":"b.rs"}),
        ];
        hoist_shared(&mut value, &mut items);
        assert_eq!(value, json!({"owner":"o","repo":"r","commitSha":"c1"}));
        assert_eq!(items, vec![json!({"path":"a.rs"}), json!({"path":"b.rs"})]);
        let mut value = json!({});
        let mut items = vec![
            json!({"owner":"o","repo":"r","commitSha":"c1","path":"a.rs"}),
            json!({"owner":"o","repo":"s","commitSha":"c2","path":"b.rs"}),
            json!({"owner":"o","repo":"s","path":"c.rs"}),
        ];
        hoist_shared(&mut value, &mut items);
        assert_eq!(value, json!({"owner":"o"}));
        assert_eq!(items[0], json!({"repo":"r","commitSha":"c1","path":"a.rs"}));
        assert_eq!(items[2], json!({"repo":"s","path":"c.rs"}));
    }

    /// A repo-scoped page names no owner/repo: they are the query's, and the
    /// shared minimizer would drop the echo.
    #[test]
    fn repo_scoped_pages_carry_no_owner_repo_echo() {
        let query: GhSearchCodeQuery = serde_json::from_value(json!({
            "mainGoal":"test","reasoning":"test","owner":"o","repo":"r","keywords":["x"],"ref":"dev"
        }))
        .expect("query");
        let mut value = json!({});
        let mut items = vec![json!({"owner":"o","repo":"r","path":"src/a.rs","matches":[]})];
        shape_files(&mut value, &mut items, &query, None);
        assert!(value.get("owner").is_none(), "{value}");
        assert!(value.get("repo").is_none(), "{value}");
        // The index is always the default branch (the description says
        // so): no constant `indexRef` echo.
        assert!(value.get("indexRef").is_none(), "{value}");
        assert!(items[0].get("owner").is_none(), "{:?}", items[0]);
        // The empty row's one fact is the ref the index did not cover; a
        // named file at that ref is read there.
        assert_eq!(
            empty_hint(&query).as_deref(),
            Some("Code search indexes only the default branch; `dev` was not searched.")
        );
        assert!(unsearched_ref_read(&query).is_none());
        let mut named = query.clone();
        named.filename = Some("Cargo.toml".parse().expect("filename"));
        named.path = Some("crates/x".parse().expect("path"));
        let read = unsearched_ref_read(&named).expect("read at the ref");
        assert_eq!(read["tool"], "ghGetFileContent", "{read}");
        assert_eq!(
            read["query"]["queries"][0]["path"], "crates/x/Cargo.toml",
            "{read}"
        );
        assert_eq!(read["query"]["queries"][0]["ref"], "dev", "{read}");
        let plain: GhSearchCodeQuery = serde_json::from_value(json!({
            "mainGoal":"test","reasoning":"test","owner":"o","keywords":["x"]
        }))
        .expect("query");
        assert!(empty_hint(&plain).is_none());
    }

    /// Files whose listed evidence is identical are listed once, naming
    /// every path that shares it; path-only rows and differing rows stay.
    #[test]
    fn identical_files_are_listed_once_with_every_path() {
        let header = json!(["1\t# Octocode"]);
        let mut items = vec![
            json!({"path": "a/README.md", "lines": header}),
            json!({"path": "src/x.rs", "lines": ["3\tfn octocode()"]}),
            json!({"path": "b/README.md", "lines": header}),
            json!({"path": "c/README.md", "lines": header, "matchCount": 40}),
            json!({"path": "d/README.md", "lines": header}),
            json!({"path": "p1"}),
            json!({"path": "p2"}),
        ];
        merge_identical(&mut items);
        assert_eq!(
            items,
            vec![
                json!({"path": "a/README.md", "alsoAt": ["b/README.md", "d/README.md"], "lines": header}),
                json!({"path": "src/x.rs", "lines": ["3\tfn octocode()"]}),
                json!({"path": "c/README.md", "lines": header, "matchCount": 40}),
                json!({"path": "p1"}),
                json!({"path": "p2"}),
            ]
        );
    }
}

//! `operation: "commit"` and `operation: "compare"`: commit metadata or a
//! ref comparison, each with one page of changed files.
use super::filter::{FileFilter, FileScope, FilteredPage};
use super::inventory::file_page_size;
use super::patch_hop::{
    DiffCursors, attach_diff_continuations, commit_pull_request_lead, commit_query, files_only,
};
use super::pr_menu::{
    ChangeSides, base_public_query, change_reads, remove_key, without_match_string,
};
use super::rest::Rest;
use super::util::{array, str_at, string, usize_at};
use super::window::{
    COMPARE_FILE_LIMIT, MAX_FILE_BATCHES, WindowSpec, WindowState, clamp_warning,
    commit_file_items, load_window_with, page_starting_at,
};
use super::{HistoryItemRequest, ItemOperation, Section, fetch, validation};
use crate::response::pages::Remaining;
use crate::tools::gh_shared::commit::{commit_date, utc_date};
use crate::tools::gh_shared::ensure_next;
use crate::tools::id::ToolId;
use crate::tools::paging::push_warnings;
use crate::tools::result::{Continuation, ToolData, remove_nulls};
use octocode_github::{GitHubTransport, ProviderError, RequestContext};
use serde_json::{Value, json};

pub(super) async fn commit(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let reference = query
        .reference()
        .ok_or_else(|| validation("ref is required"))?;
    let scope = FileScope::from_query(query).map_err(|message| validation(&message))?;
    let path = scope.as_ref();
    let needle = patch_needle(query);
    let filter = FileFilter {
        needle: needle.as_deref(),
        scope: path,
    };
    let pinned = if octocode_github::is_full_sha(reference) {
        reference.to_owned()
    } else {
        transport
            .commit_sha(query.owner(), query.repo(), reference, context)
            .await?
    };
    // File batches are derived from page×pageSize; a scope or a literal
    // hides files, so a filtered read scans from the first batch.
    let mut loaded = load_window_with(
        transport,
        &["repos", query.owner(), query.repo(), "commits", &pinned],
        WindowSpec {
            max_batches: MAX_FILE_BATCHES,
            page: query.page().unwrap_or(1),
            page_size: file_page_size(query, query.include_diff()),
            filtered: !filter.is_trivial(),
            provider_total: None,
            prefetched: None,
        },
        |file| filter.matches(file),
        commit_file_items,
        context,
    )
    .await?;
    // The commit API ends at its file boundary without an authoritative
    // file total or a next link. At that boundary the observed count is a
    // lower bound, including for an include-filtered read.
    if loaded.state.exhausted
        && loaded.state.skipped.saturating_add(loaded.items.len())
            >= MAX_FILE_BATCHES * octocode_github::MAX_PER_PAGE
    {
        loaded.state.capped = true;
    }
    let state = loaded.state;
    let raw = &loaded.first;
    let unmatched = path
        .is_some()
        .then(|| empty_scope_warning(&loaded.items, path, query, state.exhausted && !state.capped))
        .flatten();
    let listed = state.skipped + loaded.items.len();
    let commit = CommitFacts::of(raw);
    let mut out = commit_header(&commit, reference, query.include_diff(), listed, state);
    // A filter that left no file is an empty answer, not a bare `files: []`:
    // the row says so and its leads show.
    let scope_removed_all = unmatched.is_some();
    push_warnings(&mut out, unmatched);
    let files = filter.page(loaded.items, state, query, query.include_diff());
    let page = commit_file_page(&mut out, files, query, path.is_none(), &commit);
    attach_diff_continuations(
        &mut out,
        query,
        ItemOperation::Commit,
        Some(&commit.sha),
        page.cursors,
    );
    let remaining = file_page_note(&out);
    if scope_removed_all {
        out["status"] = json!("empty");
    }
    let leads = commit_leads(query, &commit, page);
    lead_first(&mut out, leads);
    remove_nulls(&mut out);
    Ok(ToolData {
        remaining,
        ..ToolData::from(out)
    })
}

/// The facts of one commit a read names it by.
struct CommitFacts<'a> {
    raw: &'a Value,
    sha: String,
    message: &'a str,
    headline: &'a str,
    /// The first parent: the old side of the commit's diff.
    parent: Option<String>,
}

impl<'a> CommitFacts<'a> {
    fn of(raw: &'a Value) -> Self {
        let message = str_at(raw, "/commit/message").unwrap_or("");
        Self {
            raw,
            sha: string(raw.get("sha")),
            message,
            headline: message.lines().next().unwrap_or(message),
            parent: raw
                .pointer("/parents/0/sha")
                .and_then(Value::as_str)
                .map(str::to_owned),
        }
    }
}

/// The commit row before its files. A patch read is the diff's evidence: it
/// names the commit by its headline once; the summary read
/// (`hints.readCommit`) holds the whole message, whose first line the
/// headline would repeat.
fn commit_header(
    commit: &CommitFacts<'_>,
    reference: &str,
    patches: bool,
    listed: usize,
    state: WindowState,
) -> Value {
    let raw = commit.raw;
    let author = identity(raw, "author");
    let committer = committer(raw, &author);
    let mut out = json!({
        "ref":reference,"commitSha":commit.sha,
        "message":(!patches).then_some(commit.message),
        "messageHeadline":patches.then_some(commit.headline),
        "author":author,"committer":committer,
        "parents":raw.get("parents").and_then(Value::as_array).into_iter().flatten().filter_map(|v|str_at(v,"/sha").map(str::to_owned)).collect::<Vec<_>>(),
        // Top-level counts always describe the whole commit; a path scope's
        // own count is `contentPagination.files.totalItems`.
        "additions":raw.pointer("/stats/additions"),"deletions":raw.pointer("/stats/deletions"),
        "changedFilesCount":listed,
        // A scan stopped at the batch cap never saw the remaining files; a
        // complete count states no scope.
        "changedFilesCountScope":if state.capped {Some("partial")} else if state.exhausted {None} else {Some("loaded")}
    });
    // A caller-supplied SHA is not restated as the ref it already names.
    if reference.eq_ignore_ascii_case(&commit.sha)
        && let Some(fields) = out.as_object_mut()
    {
        fields.remove("ref");
    }
    out
}

/// What a commit's or comparison's file page leaves for its continuations
/// and leads.
struct FilePage {
    cursors: DiffCursors,
    /// The reads of the page's top file at both sides of the numbered diff.
    side_reads: Vec<Lead>,
    /// `withoutMatchString`: the same read without the literal, when a
    /// `matchString` hit none of the listed files it could search.
    without_match: Option<Lead>,
}

/// One page of a commit's changed files on `out`: its window of the
/// commit's file batches, then the shared file-page shaping.
fn commit_file_page(
    out: &mut Value,
    files: FilteredPage,
    query: &HistoryItemRequest,
    unscoped: bool,
    commit: &CommitFacts<'_>,
) -> FilePage {
    // A first page that lists every changed file (no scope, no grep) needs
    // no separate count.
    let whole = unscoped
        && query.match_string().is_none()
        && files.page["countScope"] != "partial"
        && files.page["outOfRange"] != true
        && query.page().unwrap_or(1) == 1
        && files.page["hasMore"] != true;
    if whole && let Some(fields) = out.as_object_mut() {
        fields.remove("changedFilesCount");
    }
    shape_file_page(
        out,
        files,
        query,
        DiffSides {
            new: Some(commit.sha.as_str()),
            old: commit.parent.as_deref(),
        },
        || commit_query(query, &commit.sha),
    )
}

/// The two commits a commit's or comparison's numbered diff reads at: the
/// commit (or comparison head) for ` `/`+` lines, its first parent (or the
/// merge base) for `-` lines.
#[derive(Clone, Copy)]
struct DiffSides<'a> {
    new: Option<&'a str>,
    old: Option<&'a str>,
}

/// One page of changed files on `out` (`files`, `contentPagination.files`, and the
/// page's warnings), for a commit and a comparison alike. Without the
/// patches section the page lists paths and line stats (no patches) so the
/// agent can pick files before paying for diffs. A `matchString` that hit
/// none of the listed files it could search is an empty answer, never a bare
/// `files: []`: the row says so, and `same_read` (the read that paged here)
/// without the literal is its recovery.
fn shape_file_page(
    out: &mut Value,
    filtered: FilteredPage,
    query: &HistoryItemRequest,
    sides: DiffSides<'_>,
    same_read: impl FnOnce() -> Value,
) -> FilePage {
    let FilteredPage {
        files,
        mut page,
        kept,
        unsearched,
        dropped,
        in_scope,
    } = filtered;
    let patches = query.include_diff();
    // A file page's first patch window reads its top file at both sides of
    // the numbered diff (a file the filter kept); the filter's facts are
    // stated once, on the first page.
    let first_window = query.char_offset().is_none_or(|offset| offset == 0);
    let side_reads = if patches && first_window {
        change_reads(
            query.owner(),
            query.repo(),
            &files,
            &ChangeSides {
                new_ref: sides.new,
                old_ref: sides.old,
                old_confidence: "high",
            },
            |_| true,
        )
    } else {
        Vec::new()
    };
    let (rows, cursor) = file_rows(files, query);
    let listed = rows.as_array().is_some_and(|rows| !rows.is_empty());
    // Files it could not search may hold the literal: no empty answer then.
    let match_removed_all = patches && in_scope > 0 && unsearched.is_empty() && kept == 0;
    let cursors = DiffCursors::of_file_page(&page, cursor, listed);
    out["files"] = rows;
    super::window::lift_page_limits(out, &mut page);
    out["contentPagination"]["files"] = page;
    if patches {
        push_warnings(out, clamp_warning(query));
    }
    let mut without_match = None;
    if first_page(query) {
        if match_removed_all && let Some(needle) = query.match_string() {
            push_warnings(
                out,
                [super::filter::match_removed_all_warning(needle, in_scope)],
            );
            out["status"] = json!("empty");
            // A literal alone resolved the sections to patches: without it,
            // the read lists the files.
            let mut same = same_read();
            if !query.has_sections() {
                same["sections"] = json!(["files"]);
            }
            without_match = Some(("withoutMatchString", without_match_string(same)));
        } else if dropped > 0 {
            push_warnings(
                out,
                [super::filter::match_dropped_warning(dropped, in_scope)],
            );
        }
        mark_unsearched(out, query, &unsearched, (sides.new, sides.old));
    }
    FilePage {
        cursors,
        side_reads,
        without_match,
    }
}

/// A commit read's leads in rank order: the unfiltered read when a
/// `matchString` hit nothing, the rest of the message, the pull request the
/// commit names, then both sides of the diff; the response keeps the first
/// ones its lead cap allows.
fn commit_leads(query: &HistoryItemRequest, commit: &CommitFacts<'_>, page: FilePage) -> Vec<Lead> {
    let mut leads = Vec::from_iter(page.without_match);
    let pull_request = commit_pull_request_lead(commit.message, &commit.sha, query);
    if query.include_diff() && commit.message.trim_end() != commit.headline {
        leads.push(("readCommit", read_commit_lead(query, &commit.sha)));
    }
    // A pull request the commit names is the route to its discussion, ahead
    // of the diff's side reads; a search by SHA is only a guess, so it
    // yields to them.
    let named = pull_request.0 == "readPullRequest";
    if named {
        leads.push(pull_request.clone());
    }
    leads.extend(page.side_reads);
    if !named {
        leads.push(pull_request);
    }
    leads
}

/// The note of the next changed-file page of a commit or comparison, from
/// its file page's facts ([`Rest`]).
fn file_page_note(out: &Value) -> Vec<Remaining> {
    out.pointer("/next/nextFilePage")
        .and(out.pointer("/contentPagination/files"))
        .and_then(|page| Rest::default().note("nextFilePage", "files", page))
        .into_iter()
        .collect()
}

/// The rows of a filtered file page and the patch-stream offset that
/// continues them: without patches the pull-request inventory
/// (`M +3 -1 path`, grouped by directory); with patches, one row per file,
/// each narrowed to its `matchString` hits.
fn file_rows(files: Vec<Value>, query: &HistoryItemRequest) -> (Value, Option<usize>) {
    if !query.include_diff() {
        return (
            Value::Array(super::inventory::compact_inventory(&files)),
            None,
        );
    }
    let page = super::patch::page::shape_patch_page(files, query).compact();
    let mut rows = Value::Array(page.rows);
    // The narrowed-view marker is internal to the pull-request lead.
    super::patch_hop::take_reshaped_paths(Some(&mut rows), false);
    (rows, page.cursor)
}

/// The literal a read filters changed files by: its `matchString`, when it
/// reads patches (an inventory lists every file).
fn patch_needle(query: &HistoryItemRequest) -> Option<String> {
    super::text::needle(query).filter(|_| query.include_diff())
}

/// List the files a `matchString` could not search (`!reason path`, as on
/// a pull request), mark the row partial, and lead to the literal search of
/// the first one's source: at `old` for a removed file, else at `new`.
fn mark_unsearched(
    out: &mut Value,
    query: &HistoryItemRequest,
    unsearched: &[(&'static str, String, bool)],
    (new, old): (Option<&str>, Option<&str>),
) {
    let Some((_, path, removed)) = unsearched.first() else {
        return;
    };
    out["unsearchedFiles"] = json!(
        unsearched
            .iter()
            .map(|(reason, path, _)| format!("!{reason} {path}"))
            .collect::<Vec<_>>()
    );
    let sha = if *removed { old } else { new };
    super::pr_finish::attach_unsearched_read(out, query, path, sha);
}

/// The read of one commit at its default sections.
fn read_commit_lead(query: &HistoryItemRequest, sha: &str) -> Value {
    Continuation::new(
        ToolId::GhGetHistoryItem,
        json!({"operation":"commit","owner":query.owner(),"repo":query.repo(),"ref":sha}),
    )
    .confidence("exact")
    .build()
}

/// Put `leads` ahead of the row's other leads, in order (pages keep their
/// places: the response caps leads only).
fn lead_first(out: &mut Value, leads: Vec<(impl Into<String>, Value)>) {
    if leads.is_empty() {
        return;
    }
    ensure_next(out);
    if let Some(next) = out["next"].as_object_mut() {
        for (name, lead) in leads.into_iter().rev() {
            next.shift_insert(0, name.into(), lead);
        }
    }
}

pub(super) async fn compare(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let page = query.page().unwrap_or(1);
    let per = query.collection_page_size();
    // Omitted sections read both lists; named sections read what they name.
    // A patch window continues one file page's patches only.
    let window = query.char_offset().is_some_and(|offset| offset > 0);
    let sections = query.sections();
    let wants_commits = !window && (!query.has_sections() || sections.has(Section::Commits));
    let wants_files = !query.has_sections() || sections.lists_files();
    let Comparison {
        mut raw,
        total,
        more,
        base_sha,
        head_sha,
    } = read_comparison(transport, query, context, wants_commits).await?;
    let capped = raw
        .get("files")
        .and_then(Value::as_array)
        .is_some_and(|files| files.len() >= COMPARE_FILE_LIMIT);
    // Past GitHub's compare file cap the two commits' trees name every
    // other changed path (two reads); the cap stays only when a tree is
    // truncated or unreadable.
    let tree_files = if wants_files && capped {
        tree_changed_files(transport, query, &raw, &head_sha, context).await
    } else {
        None
    };
    let file_limit = capped && tree_files.is_none();
    if let Some(extra) = tree_files.as_ref().filter(|extra| !extra.is_empty())
        && let Some(files) = raw.get_mut("files").and_then(Value::as_array_mut)
    {
        files.extend(extra.iter().cloned());
    }
    let mut out = json!({"baseSha":base_sha,"headSha":head_sha,
        "aheadBy":usize_at(&raw,"/ahead_by"),"behindBy":usize_at(&raw,"/behind_by")});
    if more {
        out["isPartial"] = json!(true);
    }
    // The changed files lead the row (what the comparison changed), the
    // commit page follows (why): each is paged apart by its own continuation.
    // One marker: the file list stops at GitHub's cap and the trees could
    // not extend it. Its lead below reads the range's commits instead.
    if wants_files && file_limit {
        crate::tools::paging::mark_partial(&mut out, "providerFileLimit", &[]);
    }
    // Continuations read the same two commits.
    let pinned = query.with_compare_refs(&base_sha, &head_sha)?;
    let file_page = wants_files
        .then(|| attach_file_page(&mut out, &raw, &pinned, file_limit))
        .transpose()?;
    let mut cursors = file_page
        .as_ref()
        .map_or_else(DiffCursors::default, |page| page.cursors);
    // An identical range (the head is the base, or behind it) changes
    // nothing: an empty answer, as a commit or PR with nothing in scope is.
    if total == 0
        && usize_at(&raw, "/ahead_by") == 0
        && raw
            .get("files")
            .and_then(Value::as_array)
            .is_none_or(Vec::is_empty)
    {
        out["status"] = json!("empty");
    }
    let commits = wants_commits.then(|| {
        attach_commit_page(
            &mut out,
            &raw,
            query,
            CommitPage {
                page,
                per,
                total,
                more,
            },
        )
    });
    cursors.commit_page = more
        .then(|| {
            crate::tools::paging::next_cursor(
                &mut out,
                crate::tools::id::ToolId::GhGetHistoryItem,
                None,
                "page",
                page + 1,
            )
        })
        .flatten()
        .map(|next| u64::try_from(next).unwrap_or(u64::MAX));
    attach_diff_continuations(&mut out, &pinned, ItemOperation::Compare, None, cursors);
    // A literal that hit nothing leads with its recovery, as on a commit.
    let (without_match, side_reads) = file_page
        .map(|page| (page.without_match, page.side_reads))
        .unwrap_or_default();
    let mut leads = Vec::from_iter(without_match);
    leads.extend(capped_file_leads(
        query,
        &mut out,
        &raw,
        file_limit,
        wants_files,
        commits.as_ref(),
    ));
    leads.extend(side_reads);
    // A literal that emptied the file page answers with its recovery alone.
    if leads
        .first()
        .is_none_or(|(name, _)| *name != "withoutMatchString")
    {
        leads.extend(
            commits
                .and_then(|commits| commits.read)
                .map(|read| ("readCommit", read)),
        );
    }
    // The tree source is a static fact of the comparison: stated once, on
    // its first page.
    if first_page(query) && tree_files.as_ref().is_some_and(|extra| !extra.is_empty()) {
        push_warnings(
            &mut out,
            [format!(
                "GitHub's compare lists {COMPARE_FILE_LIMIT} changed files; the rest come from the two commits' trees: no line counts or patches (each reads at headSha), and a rename shows as a removal plus an addition."
            )],
        );
    }
    lead_first(&mut out, leads);
    Ok(ToolData {
        remaining: file_page_note(&out),
        ..ToolData::from(out)
    })
}

/// The comparison's changed paths past GitHub's compare file list, from the
/// merge base's and the head's recursive trees: every path whose blob (or
/// submodule commit) differs, as provider-shaped entries without patch or
/// line counts, skipping the paths the compare list already holds. `None`
/// when either tree is truncated or unreadable (the cap then stands).
async fn tree_changed_files(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    raw: &Value,
    head_sha: &str,
    context: &RequestContext,
) -> Option<Vec<Value>> {
    let merge_base = str_at(raw, "/merge_base_commit/sha")?;
    let request = |reference: &str| octocode_github::TreeRequest {
        owner: query.owner().to_owned(),
        repo: query.repo().to_owned(),
        reference: reference.to_owned(),
        recursive: true,
    };
    let (base_tree, head_tree) = (request(merge_base), request(head_sha));
    let (base, head) = tokio::join!(
        transport.get_tree(&base_tree, context),
        transport.get_tree(&head_tree, context)
    );
    let (base, head) = (base.ok()?, head.ok()?);
    if base.truncated || head.truncated {
        return None;
    }
    Some(tree_diff(&base.tree, &head.tree, raw))
}

/// The changed entries between two recursive trees that `raw`'s compare
/// file list does not name (by path, or a rename's previous path).
fn tree_diff(
    base: &[octocode_github::TreeEntry],
    head: &[octocode_github::TreeEntry],
    raw: &Value,
) -> Vec<Value> {
    use std::collections::{BTreeMap, HashSet};
    let listed: HashSet<&str> = raw
        .get("files")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|file| {
            [
                str_at(file, "/filename"),
                str_at(file, "/previous_filename"),
            ]
        })
        .flatten()
        .collect();
    let content = |entries: &[octocode_github::TreeEntry]| {
        entries
            .iter()
            .filter(|entry| entry.kind == "blob" || entry.kind == "commit")
            .map(|entry| {
                (
                    entry.path.clone(),
                    (entry.sha.clone().unwrap_or_default(), entry.mode.clone()),
                )
            })
            .collect::<BTreeMap<_, _>>()
    };
    let (base, head) = (content(base), content(head));
    let mut changed = Vec::new();
    for (path, side) in &head {
        let status = match base.get(path) {
            None => "added",
            Some(old) if old != side => "modified",
            Some(_) => continue,
        };
        changed.push((path, status, &side.0));
    }
    for (path, side) in &base {
        if !head.contains_key(path) {
            changed.push((path, "removed", &side.0));
        }
    }
    changed.sort_by(|a, b| a.0.cmp(b.0));
    changed
        .into_iter()
        .filter(|(path, _, _)| !listed.contains(path.as_str()))
        .map(|(path, status, sha)| json!({"filename": path, "status": status, "sha": sha}))
        .collect()
}

/// One comparison page as GitHub answers it, with both ends pinned to
/// commits.
struct Comparison {
    raw: Value,
    /// GitHub's count of the range's commits (`total_commits`).
    total: usize,
    /// A later commit page exists.
    more: bool,
    base_sha: String,
    head_sha: String,
}

/// Read the comparison page the query names (its commit page when
/// `wants_commits`, else one commit beside the whole file list).
async fn read_comparison(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    wants_commits: bool,
) -> Result<Comparison, ProviderError> {
    let page = query.page().unwrap_or(1);
    let per = query.collection_page_size();
    let base = query.base().ok_or_else(|| validation("base is required"))?;
    let head = query.head().ok_or_else(|| validation("head is required"))?;
    // The head commit is the last of the comparison, often past this commit
    // page: resolve a movable head (branch, tag) to the commit read so the
    // row and every continuation name one comparison. A cross-repository
    // `owner:ref` head is pinned below, from the comparison's own commits.
    let head = if head.contains(':') || octocode_github::is_full_sha(head) {
        head.to_owned()
    } else {
        transport
            .commit_sha(query.owner(), query.repo(), head, context)
            .await?
    };
    let refs = format!("{base}...{head}");
    // GitHub pages the commit list; the changed files come whole with any
    // page, so a files-only read asks for one commit.
    let (commit_page, commit_per) = if wants_commits { (page, per) } else { (1, 1) };
    let (raw, link_more) = fetch(
        transport,
        &["repos", query.owner(), query.repo(), "compare", &refs],
        &[
            ("page", commit_page.to_string()),
            ("per_page", commit_per.to_string()),
        ],
        context,
    )
    .await?;
    let total = usize_at(&raw, "/total_commits");
    let more = wants_commits && (link_more || page.saturating_mul(per) < total);
    let (base_sha, mut head_sha) = compare_identity(&raw, base, &head);
    if head.contains(':') {
        head_sha = pin_fork_head(
            transport,
            query,
            &refs,
            &raw,
            commit_page.saturating_mul(commit_per),
            context,
        )
        .await?;
    }
    Ok(Comparison {
        raw,
        total,
        more,
        base_sha,
        head_sha,
    })
}

/// The commit a cross-repository head (`owner:branch`) names now. A fork's
/// branch moves and the upstream repository cannot resolve it by name, so
/// every continuation needs the SHA. The range's last commit is the head;
/// when the page read (ending at commit `read_end`) does not end the range,
/// one more read of the last page
/// (one commit) names it. A head with no commits ahead is the merge base.
async fn pin_fork_head(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    refs: &str,
    raw: &Value,
    read_end: usize,
    context: &RequestContext,
) -> Result<String, ProviderError> {
    let total = usize_at(raw, "/total_commits");
    let last_of = |value: &Value| {
        value
            .get("commits")
            .and_then(Value::as_array)
            .and_then(|commits| commits.last())
            .and_then(|commit| str_at(commit, "/sha"))
            .map(str::to_owned)
    };
    if total == 0 {
        return Ok(str_at(raw, "/merge_base_commit/sha")
            .unwrap_or(refs)
            .to_owned());
    }
    if read_end >= total
        && let Some(sha) = last_of(raw)
    {
        return Ok(sha);
    }
    let (last_page, _) = fetch(
        transport,
        &["repos", query.owner(), query.repo(), "compare", refs],
        &[("page", total.to_string()), ("per_page", "1".to_owned())],
        context,
    )
    .await?;
    last_of(&last_page).ok_or_else(|| validation("compare head has no commit"))
}

/// The comparison's commit page a read asked for.
struct CommitPage {
    page: usize,
    per: usize,
    /// GitHub's count of the range's commits (`total_commits`).
    total: usize,
    more: bool,
}

/// What a listed commit page leaves to the row's leads.
struct ListedCommits {
    /// The page's commit SHAs, in order.
    shas: Vec<String>,
    /// How many of the range's commits this page and the pages before it
    /// show, when more follow; `None` when it shows the last one.
    seen: Option<usize>,
    /// The whole-message read of the first commit whose message has more
    /// than its headline.
    read: Option<Value>,
}

/// The commit page: each commit by its SHA and headline (any row's
/// `commitSha` reads its whole message). A scoped comparison lists every
/// commit of the range, not only the scope's: the `narrowScope` lead lists
/// the scope's own commits.
fn attach_commit_page(
    out: &mut Value,
    raw: &Value,
    query: &HistoryItemRequest,
    at: CommitPage,
) -> ListedCommits {
    let commits = array(raw.get("commits").cloned().unwrap_or(json!([])));
    let shas = commits
        .iter()
        .filter_map(|v| str_at(v, "/sha"))
        .map(str::to_owned)
        .collect();
    let read = commits
        .iter()
        .find(|v| {
            let message = str_at(v, "/commit/message").unwrap_or("").trim_end();
            message.lines().nth(1).is_some()
        })
        .and_then(|v| str_at(v, "/sha"))
        .map(|sha| read_commit_lead(query, sha));
    out["commits"] = json!(
        commits
            .into_iter()
            .map(|v| {
                let message = str_at(&v, "/commit/message").unwrap_or("");
                json!({
                    "commitSha":v["sha"],
                    "messageHeadline":message.lines().next().unwrap_or(message),
                    "author":super::pr_sections::commit_person(&v),
                    "date":commit_date(&v)
                })
            })
            .collect::<Vec<_>>()
    );
    // Every commit page states where it stands, the last one too. GitHub
    // counts the range (`total_commits`): a count-cut page states that
    // total unless the provider's links say otherwise.
    let counted = at.total > 0 && (at.page.saturating_mul(at.per) < at.total) == at.more;
    let facts = if counted {
        crate::response::pages::PageFacts::counted(at.page, at.per, at.total)
    } else {
        crate::response::pages::PageFacts::open(at.page, Some(at.per), at.more)
    };
    // A commit page past the last is the shared out-of-range outcome (empty,
    // `page N of M`, a restart), unless the same page still lists files.
    let files_listed = out
        .get("files")
        .and_then(Value::as_array)
        .is_some_and(|files| !files.is_empty());
    if files_listed
        || !crate::tools::paging::out_of_range(out, &["contentPagination", "commits"], facts)
    {
        // The commit page continuation (`nextCommitPage`) is the cursor.
        out["contentPagination"]["commits"] = facts.to_value();
    }
    ListedCommits {
        shas,
        seen: at.more.then(|| at.page.saturating_mul(at.per)),
        read,
    }
}

/// A named lead: its `next` key and the call.
type Lead = (&'static str, Value);

/// The comparison's changed-file page (paths and line stats; patches with
/// the patches section or a `matchString`): GitHub lists the files whole
/// with any commit page, so the page is a window of that list, then the
/// shared file-page shaping. `query` names the comparison by its pinned
/// commits.
fn attach_file_page(
    out: &mut Value,
    raw: &Value,
    query: &HistoryItemRequest,
    file_limit: bool,
) -> Result<FilePage, ProviderError> {
    let all_files = array(raw.get("files").cloned().unwrap_or(json!([])));
    let all_count = all_files.len();
    let scope = FileScope::from_query(query).map_err(|message| validation(&message))?;
    let first_window = query.char_offset().is_none_or(|offset| offset == 0);
    let unmatched = scope
        .as_ref()
        .filter(|_| first_window)
        .and_then(|scope| empty_scope_warning(&all_files, Some(scope), query, !file_limit));
    let include_diff = query.include_diff();
    let needle = patch_needle(query);
    let mut files = FileFilter {
        needle: needle.as_deref(),
        scope: scope.as_ref(),
    }
    .page(all_files, WindowState::COMPLETE, query, include_diff);
    // The whole comparison's count, when the listed files are not all of
    // it (a scope or a later page). At GitHub's cap the count is only a
    // floor: the file page's `countScope` says so and no count is claimed.
    if !include_diff && !file_limit && files.files.len() < all_count {
        out["changedFilesCount"] = json!(all_count);
    }
    // The page's own count fact: at the cap its total is a floor.
    if file_limit {
        files.page["countScope"] = json!("partial");
    }
    let head = out["headSha"].as_str().map(str::to_owned);
    let page = shape_file_page(
        out,
        files,
        query,
        DiffSides {
            new: head.as_deref(),
            // The old side of a three-dot comparison is the merge base.
            old: str_at(raw, "/merge_base_commit/sha"),
        },
        || {
            let mut same = base_public_query(query, ItemOperation::Compare);
            remove_key(&mut same, "offset");
            files_only(&mut same, ItemOperation::Compare);
            same
        },
    );
    if let Some(warning) = unmatched {
        push_warnings(out, [warning]);
        // A scope that left none of a complete file list is an empty answer,
        // as it is on a commit; a capped list may hide the scope's files.
        if !file_limit {
            out["status"] = json!("empty");
        }
    }
    Ok(page)
}

/// A scoped path's own history lists the commits of the range that touched
/// it: `ghSearchHistory` at the pinned head, from the range's start (its
/// merge base: the base commit's own date is the first it can list, never an
/// older commit). When GitHub's compare file cap stands (the trees could
/// not extend it) the scoped path may look unchanged when it is not; a file
/// read warns and leads to the range's commits, whose touched files cover
/// the net change (and more: a file changed and then reverted is touched).
fn capped_file_leads(
    query: &HistoryItemRequest,
    out: &mut Value,
    raw: &Value,
    file_limit: bool,
    wants_files: bool,
    commits: Option<&ListedCommits>,
) -> Vec<Lead> {
    let mut leads = Vec::new();
    // The scope's literal prefix: a glob's directory, or the exact path.
    if let Some(path) = query
        .include_patterns()
        .into_iter()
        .find_map(literal_prefix)
    {
        let mut history = json!({"operation":"commit","owner":query.owner(),"repo":query.repo(),"path":path,"ref":out["headSha"]});
        if let Some(date) = str_at(raw, "/merge_base_commit/commit/committer/date")
            .or_else(|| str_at(raw, "/base_commit/commit/committer/date"))
        {
            history["since"] = json!(utc_date(Some(date)));
        }
        leads.push((
            "narrowScope",
            Continuation::new(ToolId::GhSearchHistory, history)
                .confidence("high")
                .build(),
        ));
    }
    if !file_limit {
        return leads;
    }
    if wants_files && first_page(query) {
        // The cap is stated once, on the comparison's first page, with what
        // it may hide.
        let include = query.include_patterns();
        let hidden = if include.is_empty() {
            "other changed files".to_owned()
        } else {
            format!("changes to {}", include.join(", "))
        };
        push_warnings(
            out,
            [format!(
                "GitHub lists at most {COMPARE_FILE_LIMIT} changed files, so {hidden} may be missing; the range's commits reach them, as files each commit touched (a superset of the net change)."
            )],
        );
    }
    if wants_files {
        leads.extend(capped_files_reach(query, out, commits));
    }
    leads
}

/// Whether the read is the comparison's first page (no later `page`, no
/// patch window past the start): where its static notices are stated.
fn first_page(query: &HistoryItemRequest) -> bool {
    query.page().unwrap_or(1) <= 1 && query.char_offset().is_none_or(|offset| offset == 0)
}

/// The lead that reaches the changed files past GitHub's compare cap through
/// the range's commits: this page's commits as one batch of commit reads when
/// the page lists no more commits than a batch takes, else the commits the
/// page does not show, in batch-sized pages (each carries that batch read;
/// [`page_starting_at`] aligns them). A wider page that ends the range has
/// no unseen commit to list: its rows' `commitSha` are the reads.
fn capped_files_reach(
    query: &HistoryItemRequest,
    out: &Value,
    commits: Option<&ListedCommits>,
) -> Option<(&'static str, Value)> {
    let batch = crate::tools::result::rows_per_call(ToolId::GhGetHistoryItem);
    let Some(listed) = commits else {
        return Some(commit_list_lead(query, out, batch, 1));
    };
    if !listed.shas.is_empty() && listed.shas.len() <= batch {
        let rows = listed
            .shas
            .iter()
            .map(|sha| {
                json!({"operation":"commit","owner":query.owner(),"repo":query.repo(),"ref":sha})
            })
            .collect::<Vec<_>>();
        return Some((
            "readCommitFiles",
            Continuation::input(ToolId::GhGetHistoryItem, json!({"queries": rows}))
                .confidence("high")
                .build(),
        ));
    }
    let (page, size) = page_starting_at(listed.seen?, batch);
    Some(commit_list_lead(query, out, size, page))
}

fn commit_list_lead(
    query: &HistoryItemRequest,
    out: &Value,
    size: usize,
    page: usize,
) -> (&'static str, Value) {
    let mut list = json!({"operation":"compare","owner":query.owner(),"repo":query.repo(),"base":out["baseSha"],"head":out["headSha"],"sections":["commits"],"pageSize":size});
    if page > 1 {
        list["page"] = json!(page);
    }
    (
        "listCommits",
        Continuation::new(ToolId::GhGetHistoryItem, list)
            .confidence("high")
            .build(),
    )
}

/// Changed directories an empty-scope warning names at most.
const NEAREST_DIRS: usize = 5;

/// An `include` scope that matched none of the listed changed files:
/// `include matched 0 of N changed files`, with up to
/// [`NEAREST_DIRS`] changed directories, closest to the scope first.
/// `complete` says whether `files` is the whole list (else N is a floor).
fn empty_scope_warning(
    files: &[Value],
    scope: Option<&FileScope>,
    query: &HistoryItemRequest,
    complete: bool,
) -> Option<String> {
    let scope = scope?;
    if files.is_empty() || files.iter().any(|file| scope.matches(file)) {
        return None;
    }
    let target = query
        .include_patterns()
        .into_iter()
        .find_map(literal_prefix)
        .unwrap_or_default();
    let mut dirs: Vec<&str> = Vec::new();
    for file in files {
        let name = str_at(file, "/filename").unwrap_or("");
        let dir = name.rsplit_once('/').map_or("", |(dir, _)| dir);
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    let shared = |dir: &str| {
        dir.split('/')
            .zip(target.split('/'))
            .take_while(|(a, b)| a == b && !a.is_empty())
            .count()
    };
    // Most leading segments shared with the scope first; GitHub's order
    // among equals.
    let mut ranked = dirs.into_iter().enumerate().collect::<Vec<_>>();
    ranked.sort_by_key(|(index, dir)| (std::cmp::Reverse(shared(dir)), *index));
    let nearest = ranked
        .into_iter()
        .take(NEAREST_DIRS)
        .map(|(_, dir)| {
            if dir.is_empty() {
                "(root)".to_owned()
            } else {
                format!("{dir}/")
            }
        })
        .collect::<Vec<_>>();
    let count = if complete {
        files.len().to_string()
    } else {
        format!("at least {}", files.len())
    };
    Some(format!(
        "include matched 0 of {count} changed files; changed directories: {}.",
        nearest.join(", ")
    ))
}

/// The literal path prefix of an `include` pattern: the pattern itself
/// without glob characters, else the directory before its first glob
/// (`packages/react/**` → `packages/react/`); `None` for a bare glob.
fn literal_prefix(pattern: &str) -> Option<String> {
    let glob = pattern.find(['*', '?', '[', '{']);
    let prefix = match glob {
        None => pattern,
        Some(at) => pattern[..at].rsplit_once('/').map_or("", |(dir, _)| dir),
    };
    let prefix = prefix.trim_start_matches("./");
    if prefix.is_empty() {
        return None;
    }
    Some(if glob.is_some() {
        format!("{prefix}/")
    } else {
        prefix.to_owned()
    })
}

/// The committer, unless GitHub's web-flow committed for the author (a
/// merge or edit in the web UI: that identity says nothing of the change)
/// or it repeats the author whole. A committer that differs in any field
/// (date or email after a rebase, cherry-pick or web merge) is evidence and
/// stays.
fn committer(raw: &Value, author: &Value) -> Option<Value> {
    if str_at(raw, "/committer/login") == Some(WEB_FLOW_LOGIN) {
        return None;
    }
    Some(identity(raw, "committer")).filter(|committer| committer != author)
}

/// The login GitHub commits under for changes made in its web UI.
const WEB_FLOW_LOGIN: &str = "web-flow";

fn identity(raw: &Value, kind: &str) -> Value {
    let p = format!("/commit/{kind}");
    let login = format!("/{kind}/login");
    let mut out = json!({"name":str_at(raw,&format!("{p}/name")).unwrap_or("unknown"),"email":str_at(raw,&format!("{p}/email")).unwrap_or(""),"login":str_at(raw,&login),"date":str_at(raw,&format!("{p}/date")).map(|date| utc_date(Some(date)))});
    remove_nulls(&mut out);
    out
}

pub(super) fn compare_identity(
    raw: &Value,
    requested_base: &str,
    requested_head: &str,
) -> (String, String) {
    let permalink = raw
        .get("permalink_url")
        .and_then(Value::as_str)
        .unwrap_or("");
    let pair = permalink
        .rsplit('/')
        .next()
        .and_then(|tail| tail.split_once("..."));
    // The permalink spells both sides `owner:abbrev`; the echo keeps the
    // requested form (an `owner:` prefix only when the caller wrote one) and
    // expands an abbreviation to the full SHA it uniquely names.
    let expand = |requested: &str, parsed: Option<&str>| {
        let candidate = parsed.unwrap_or(requested);
        let abbrev = candidate.rsplit(':').next().unwrap_or(candidate);
        let prefix = requested
            .rsplit_once(':')
            .map_or(String::new(), |(owner, _)| format!("{owner}:"));
        if abbrev.len() == 40 {
            return format!("{prefix}{abbrev}");
        }
        let mut known = Vec::new();
        if let Some(sha) = raw.pointer("/base_commit/sha").and_then(Value::as_str) {
            known.push(sha);
        }
        if let Some(sha) = raw
            .pointer("/merge_base_commit/sha")
            .and_then(Value::as_str)
        {
            known.push(sha);
        }
        for commit in raw
            .get("commits")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(sha) = commit.get("sha").and_then(Value::as_str) {
                known.push(sha);
            }
        }
        // base_commit and merge_base_commit are often the same commit.
        known.sort_unstable();
        known.dedup();
        let matches: Vec<_> = known
            .into_iter()
            .filter(|sha| {
                sha.to_ascii_lowercase()
                    .starts_with(&abbrev.to_ascii_lowercase())
            })
            .collect();
        if matches.len() == 1 {
            format!("{prefix}{}", matches[0])
        } else {
            requested.to_owned()
        }
    };
    (
        expand(requested_base, pair.map(|(base, _)| base)),
        expand(requested_head, pair.map(|(_, head)| head)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A committer that repeats the author whole is not restated; one that
    /// differs in any field (a rebased date, another email) is evidence.
    #[test]
    fn a_committer_is_shown_only_when_it_differs_from_the_author() {
        let raw = |committer: Value| {
            json!({"commit":{
                "author":{"name":"Ada","email":"ada@x.dev","date":"2024-01-01T00:00:00Z"},
                "committer":committer}})
        };
        let same = raw(json!({"name":"Ada","email":"ada@x.dev","date":"2024-01-01T00:00:00Z"}));
        assert_eq!(committer(&same, &identity(&same, "author")), None);
        let other_email =
            raw(json!({"name":"Ada","email":"ada@y.dev","date":"2024-01-01T00:00:00Z"}));
        let kept = committer(&other_email, &identity(&other_email, "author")).expect("kept");
        assert_eq!(kept["email"], "ada@y.dev");
        let rebased = raw(json!({"name":"Ada","email":"ada@x.dev","date":"2024-02-01T00:00:00Z"}));
        let kept = committer(&rebased, &identity(&rebased, "author")).expect("kept");
        assert_eq!(kept["date"], "2024-02-01T00:00:00Z");
    }

    #[test]
    fn compare_identity_expands_permalink_abbreviations() {
        let raw = json!({
            "permalink_url": "https://github.com/a/b/compare/abc1234...def5678",
            "base_commit": {"sha": "abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
            "commits": [{"sha": "def5678bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]
        });
        let (base, head) = compare_identity(&raw, "main", "feature");
        assert!(base.starts_with("abc1234"));
        assert!(head.starts_with("def5678"));
    }

    /// GitHub's permalink spells both sides `owner:abbrev`; the echo
    /// must keep the caller's bare-SHA form on both sides, and a base that is
    /// both base_commit and merge_base_commit still expands.
    #[test]
    fn compare_identity_echoes_the_requested_form_without_owner_prefix() {
        let base_sha = "af20f667fd2536c9502f69d99fe6bdedfcc839cb";
        let head_sha = "c265e3f9413161c900cbf4aa70d451b8e6b3920a";
        let raw = json!({
            "permalink_url": "https://github.com/o/r/compare/o:af20f66...o:c265e3f",
            "base_commit": {"sha": base_sha},
            "merge_base_commit": {"sha": base_sha},
            "commits": [{"sha": head_sha}]
        });
        assert_eq!(
            compare_identity(&raw, base_sha, head_sha),
            (base_sha.to_owned(), head_sha.to_owned())
        );
        assert_eq!(
            compare_identity(&raw, "af20f66", "c265e3f"),
            (base_sha.to_owned(), head_sha.to_owned())
        );
        // A caller-written fork prefix is kept.
        assert_eq!(
            compare_identity(&raw, base_sha, "fork:c265e3f").1,
            format!("fork:{head_sha}")
        );
    }

    /// A list lead starts right after the shown items and every later item
    /// falls on exactly one of its pages: the comparison's unseen commits
    /// (batch-sized pages) and an issue's unshown comments (one provider
    /// batch at most) alike.
    #[test]
    fn a_page_starting_at_an_item_reaches_every_later_item_once() {
        for (seen, batch) in [(100, 5), (100, 3), (97, 5), (30, 4), (7, 1), (5, 5)] {
            let (page, size) = page_starting_at(seen, batch);
            assert!((1..=batch).contains(&size), "{seen}/{batch}: {size}");
            assert_eq!(size * (page - 1), seen, "{seen}/{batch}: {size} {page}");
        }
        assert_eq!(page_starting_at(100, 5), (21, 5));
        assert_eq!(page_starting_at(12, 100), (2, 12));
        assert_eq!(page_starting_at(97, 100), (2, 97));
        assert_eq!(page_starting_at(190, 100), (3, 95));
        assert_eq!(page_starting_at(200, 100), (3, 100));
    }
}

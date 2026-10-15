//! `operation: "commit"` and `operation: "compare"`: commit metadata or a
//! ref comparison, each with one page of changed files.
use super::filter::{PathScope, in_path_scope, scope_files};
use super::inventory::file_page_size;
use super::patch::page::shape_files;
use super::patch_hop::{
    DiffCursors, attach_diff_continuations, commit_pull_request_lead, commit_query,
};
use super::pr_menu::{ChangeSides, change_reads, without_match_string};
use super::rest::Rest;
use super::util::{array, str_at, string, usize_at};
use super::window::{
    MAX_FILE_BATCHES, WindowSpec, WindowState, clamp_warning, commit_file_items, load_window_with,
    mark_capped, paginate_collection, paginate_window,
};
use super::{HistoryItemRequest, ItemOperation, fetch, validation};
use crate::response::pages::Remaining;
use crate::tools::gh_shared::commit::{commit_date, utc_date};
use crate::tools::gh_shared::ensure_next;
use crate::tools::id::ToolId;
use crate::tools::paging::push_warnings;
use crate::tools::result::{Continuation, ToolData, remove_nulls};
use octocode_github::{GitHubTransport, ProviderError, RequestContext};
use serde_json::{Value, json};

/// GitHub's compare endpoint lists at most this many changed files.
const COMPARE_FILE_LIMIT: usize = 300;

pub(super) async fn commit(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let reference = query
        .reference()
        .ok_or_else(|| validation("ref is required"))?;
    let scope = PathScope::from_query(query).map_err(|message| validation(&message))?;
    let path = scope.as_ref();
    // File batches are derived from page×pageSize; an include scope hides
    // files, so it scans from the first batch.
    let mut loaded = load_window_with(
        transport,
        &["repos", query.owner(), query.repo(), "commits", reference],
        WindowSpec {
            max_batches: MAX_FILE_BATCHES,
            page: query.page().unwrap_or(1),
            page_size: file_page_size(query, query.include_diff()),
            filtered: path.is_some(),
            provider_total: None,
        },
        |file| in_path_scope(file, path),
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
    let scoped = scope_files(loaded.items, path);
    let commit = CommitFacts::of(raw);
    let mut out = commit_header(&commit, reference, query.include_diff(), listed, state);
    // A filter that left no file is an empty answer, not a bare `files: []`:
    // the row says so and its leads show.
    let scope_removed_all = unmatched.is_some();
    push_warnings(&mut out, unmatched);
    let page = commit_file_page(&mut out, scoped, state, query, path.is_none(), &commit);
    attach_diff_continuations(
        &mut out,
        query,
        ItemOperation::Commit,
        Some(&commit.sha),
        false,
        page.cursors,
    );
    let remaining = file_page_note(&out);
    if page.match_removed_all || scope_removed_all {
        out["status"] = json!("empty");
    }
    let leads = commit_leads(&mut out, query, &commit, page);
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
        // own count is `filePagination.totalItems`.
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

/// What a commit's file page leaves for its continuations and leads.
struct CommitFilePage {
    cursors: DiffCursors,
    /// The reads of the page's top file at both sides of the numbered diff.
    side_reads: Vec<Lead>,
    /// A `matchString` hit no listed file it could search.
    match_removed_all: bool,
    /// Files the page listed before the `matchString` filter.
    listed_on_page: usize,
}

/// One page of the commit's changed files on `out` (`files`,
/// `filePagination`, and the page's warnings). Without the patches section
/// the page still lists paths and line stats (no patches) so the agent can
/// pick files before paying for diffs.
fn commit_file_page(
    out: &mut Value,
    scoped: Vec<Value>,
    state: WindowState,
    query: &HistoryItemRequest,
    unscoped: bool,
    commit: &CommitFacts<'_>,
) -> CommitFilePage {
    let patches = query.include_diff();
    let (files, mut page) = paginate_window(
        scoped,
        state.skipped,
        state.exhausted,
        query.page(),
        Some(file_page_size(query, patches)),
    );
    mark_capped(&mut page, state.capped);
    // A first page that lists every changed file (no scope, no grep) needs
    // no separate count.
    let whole = unscoped
        && query.match_string().is_none()
        && state.exhausted
        && !state.capped
        && query.page().unwrap_or(1) == 1
        && page["hasMore"] != true;
    if whole && let Some(fields) = out.as_object_mut() {
        fields.remove("changedFilesCount");
    }
    // A file page's first patch window reads its top file at both sides of
    // the numbered diff: the commit and its first parent.
    let first_window = query.char_offset().is_none_or(|offset| offset == 0);
    let side_reads = if patches && first_window {
        change_reads(
            query.owner(),
            query.repo(),
            &files,
            &ChangeSides {
                new_ref: Some(commit.sha.as_str()),
                old_ref: commit.parent.as_deref(),
                old_confidence: "high",
            },
            |_| true,
        )
    } else {
        Vec::new()
    };
    let listed_on_page = files.len();
    let FileRows {
        rows: files,
        cursor,
        dropped,
        unsearched,
    } = file_rows(files, query);
    // Files it could not search may hold the literal: no empty answer then.
    let match_removed_all = patches
        && listed_on_page > 0
        && unsearched.is_empty()
        && files.as_array().is_some_and(Vec::is_empty);
    let cursors = DiffCursors::of_file_page(
        &page,
        cursor,
        files.as_array().is_some_and(|files| !files.is_empty()),
    );
    out["files"] = files;
    super::window::lift_page_limits(out, &mut page);
    out["filePagination"] = page;
    if patches {
        push_warnings(out, clamp_warning(query));
    }
    if first_window {
        if dropped > 0 && !match_removed_all {
            push_warnings(
                out,
                [super::filter::match_dropped_warning(
                    dropped,
                    listed_on_page,
                )],
            );
        }
        mark_unsearched(
            out,
            query,
            &unsearched,
            (Some(commit.sha.as_str()), commit.parent.as_deref()),
        );
    }
    CommitFilePage {
        cursors,
        side_reads,
        match_removed_all,
        listed_on_page,
    }
}

/// A commit read's leads in rank order: the unfiltered read when a
/// `matchString` hit nothing, the rest of the message, the pull request the
/// commit names, then both sides of the diff; the response keeps the first
/// ones its lead cap allows.
fn commit_leads(
    out: &mut Value,
    query: &HistoryItemRequest,
    commit: &CommitFacts<'_>,
    page: CommitFilePage,
) -> Vec<Lead> {
    let mut leads = Vec::new();
    if page.match_removed_all
        && let Some(needle) = query.match_string()
    {
        push_warnings(
            out,
            [match_removed_all_warning(needle, page.listed_on_page)],
        );
        leads.push((
            "withoutMatchString",
            without_match_string(commit_query(query, &commit.sha, false)),
        ));
    }
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
        .and(out.get("filePagination"))
        .and_then(|page| Rest::default().note("nextFilePage", "files", page))
        .into_iter()
        .collect()
}

/// A shaped file page: its rows, the patch-stream offset that continues
/// them, how many in-scope files the `matchString` dropped (searched, no
/// hit), and the files it could not search (GitHub sent no patch), each
/// `(reason, path, removed)` like the pull-request file filter's.
struct FileRows {
    rows: Value,
    cursor: Option<usize>,
    dropped: usize,
    unsearched: Vec<(&'static str, String, bool)>,
}

/// Changed files without patches read as the pull-request inventory
/// (`M +3 -1 path`, grouped by directory); with patches, one row per file,
/// and a `matchString` keeps the files whose patch it hits (the
/// pull-request file filter), each narrowed to its hits. A file GitHub sent
/// without a patch was never searched: it is unsearched, not dropped.
fn file_rows(files: Vec<Value>, query: &HistoryItemRequest) -> FileRows {
    if !query.include_diff() {
        return FileRows {
            rows: Value::Array(super::inventory::compact_inventory(&files)),
            cursor: None,
            dropped: 0,
            unsearched: Vec::new(),
        };
    }
    let needle = query.match_string().map(str::to_lowercase);
    let filter = super::filter::FileFilter {
        needle: needle.as_deref(),
        scope: None,
    };
    let unsearched = match needle {
        Some(_) => super::filter::unsearched_files(&files, &filter),
        None => Vec::new(),
    };
    let listed = files.len();
    let files = files
        .into_iter()
        .filter(|file| filter.matches(file))
        .collect::<Vec<_>>();
    let dropped = listed.saturating_sub(files.len() + unsearched.len());
    let (mut rows, cursor) = shape_files(files, true, query);
    // The narrowed-view marker is internal to the pull-request lead.
    super::patch_hop::take_reshaped_paths(Some(&mut rows), false);
    FileRows {
        rows,
        cursor,
        dropped,
        unsearched,
    }
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
    let wants_commits = !window && (!query.has_sections() || query.names_section("commits"));
    let wants_files =
        !query.has_sections() || query.names_section("files") || query.names_section("patches");
    let Comparison {
        raw,
        total,
        more,
        base_sha,
        head_sha,
    } = read_comparison(transport, query, context, wants_commits).await?;
    let file_limit = raw
        .get("files")
        .and_then(Value::as_array)
        .is_some_and(|files| files.len() >= COMPARE_FILE_LIMIT);
    let mut out = json!({"baseSha":base_sha,"headSha":head_sha,
        "aheadBy":usize_at(&raw,"/ahead_by"),"behindBy":usize_at(&raw,"/behind_by")});
    if more {
        out["isPartial"] = json!(true);
    }
    // The changed files lead the row (what the comparison changed), the
    // commit page follows (why): each is paged apart by its own continuation.
    // One marker: the file list stops at GitHub's cap. Its continuation
    // below reaches every changed file through the range's commits.
    if wants_files && file_limit {
        crate::tools::paging::mark_partial(&mut out, "providerFileLimit", &[]);
    }
    let mut cursors = DiffCursors::default();
    let mut side_reads = Vec::new();
    if wants_files {
        (cursors, side_reads) = attach_file_page(&mut out, &raw, query, window, file_limit)?;
    }
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
    // Continuations read the same two commits.
    let pinned = query.with_compare_refs(&base_sha, &head_sha)?;
    attach_diff_continuations(
        &mut out,
        &pinned,
        ItemOperation::Compare,
        None,
        false,
        cursors,
    );
    let mut leads = capped_file_leads(
        query,
        &mut out,
        &raw,
        file_limit,
        wants_files,
        commits.as_ref(),
    );
    leads.extend(side_reads);
    leads.extend(
        commits
            .and_then(|commits| commits.read)
            .map(|read| ("readCommit", read)),
    );
    lead_first(&mut out, leads);
    Ok(ToolData {
        remaining: file_page_note(&out),
        ..ToolData::from(out)
    })
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
    // The last commit page past the first needs no page object.
    if at.more || at.page == 1 {
        // GitHub counts the range (`total_commits`): a count-cut page
        // states that total unless the provider's links say otherwise.
        let counted = at.total > 0 && (at.page.saturating_mul(at.per) < at.total) == at.more;
        let facts = if counted {
            crate::response::pages::PageFacts::counted(at.page, at.per, at.total)
        } else {
            crate::response::pages::PageFacts::open(at.page, Some(at.per), at.more)
        };
        // The commit page continuation (`nextCommitPage`) is the cursor.
        out["pagination"] = facts.to_value();
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
/// the patches section or a `matchString`), its cursors, and the reads of
/// its top file at both sides of the diff.
fn attach_file_page(
    out: &mut Value,
    raw: &Value,
    query: &HistoryItemRequest,
    window: bool,
    file_limit: bool,
) -> Result<(DiffCursors, Vec<Lead>), ProviderError> {
    let all_files = array(raw.get("files").cloned().unwrap_or(json!([])));
    let all_count = all_files.len();
    let scope = PathScope::from_query(query).map_err(|message| validation(&message))?;
    let unmatched = scope
        .as_ref()
        .filter(|_| !window)
        .and_then(|scope| empty_scope_warning(&all_files, Some(scope), query, !file_limit));
    let scoped = scope_files(all_files, scope.as_ref());
    let include_diff = query.include_diff();
    let (files, mut file_page) = paginate_collection(
        scoped,
        query.page(),
        Some(file_page_size(query, include_diff)),
    );
    // The whole comparison's count, when the listed files are not all of
    // it (a scope or a later page); GitHub stops listing at 300, so a
    // count at the cap is a floor (`partialReasons`).
    if !include_diff && (files.len() < all_count || file_limit) {
        out["changedFilesCount"] = json!(all_count);
    }
    // The page's own count fact: at the cap its total is a floor.
    if file_limit {
        file_page["countScope"] = json!("partial");
    }
    // The old side of a three-dot comparison is the merge base.
    let side_reads = if include_diff && !window {
        change_reads(
            query.owner(),
            query.repo(),
            &files,
            &ChangeSides {
                new_ref: out["headSha"].as_str(),
                old_ref: str_at(raw, "/merge_base_commit/sha"),
                old_confidence: "high",
            },
            |_| true,
        )
    } else {
        Vec::new()
    };
    let listed_on_page = files.len();
    let FileRows {
        rows: files,
        cursor,
        dropped,
        unsearched,
    } = file_rows(files, query);
    let kept_any = files.as_array().is_some_and(|files| !files.is_empty());
    let cursors = DiffCursors::of_file_page(
        &file_page,
        cursor,
        files.as_array().is_some_and(|files| !files.is_empty()),
    );
    out["files"] = files;
    super::window::lift_page_limits(out, &mut file_page);
    out["filePagination"] = file_page;
    if include_diff && let Some(warning) = clamp_warning(query) {
        push_warnings(out, [warning]);
    }
    if dropped > 0 && kept_any && !window {
        push_warnings(
            out,
            [super::filter::match_dropped_warning(
                dropped,
                listed_on_page,
            )],
        );
    }
    if !window {
        let head = out["headSha"].as_str().map(str::to_owned);
        mark_unsearched(
            out,
            query,
            &unsearched,
            (head.as_deref(), str_at(raw, "/merge_base_commit/sha")),
        );
    }
    if let Some(warning) = unmatched {
        push_warnings(out, [warning]);
        // A scope that left none of a complete file list is an empty answer,
        // as it is on a commit; a capped list may hide the scope's files.
        if !file_limit {
            out["status"] = json!("empty");
        }
    }
    Ok((cursors, side_reads))
}

/// A scoped path's own history lists the commits of the range that touched
/// it: `ghSearchHistory` at the pinned head, from the range's start (its
/// merge base: the base commit's own date is the first it can list, never an
/// older commit). Past GitHub's compare file cap the scoped path also looks
/// unchanged when it may not be, so this is the only complete answer for it;
/// a file read warns, and reaches every changed file through the range's
/// commits.
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
        .file_scope
        .iter()
        .find_map(|pattern| literal_prefix(pattern))
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
    if wants_files {
        // The cap is stated on every capped comparison, with what it may hide.
        let hidden = if query.file_scope.is_empty() {
            "other changed files".to_owned()
        } else {
            format!("changes to {}", query.file_scope.join(", "))
        };
        push_warnings(
            out,
            [format!(
                "GitHub lists at most {COMPARE_FILE_LIMIT} changed files, so {hidden} may be missing."
            )],
        );
        leads.extend(capped_files_reach(query, out, commits));
    }
    leads
}

/// The lead that reaches the changed files past GitHub's compare cap through
/// the range's commits: this page's commits as one batch of commit reads when
/// the page lists no more commits than a batch takes, else the commits the
/// page does not show, in batch-sized pages (each carries that batch read;
/// [`unseen_commit_pages`] aligns them). A wider page that ends the range has
/// no unseen commit to list: its rows' `commitSha` are the reads.
fn capped_files_reach(
    query: &HistoryItemRequest,
    out: &Value,
    commits: Option<&ListedCommits>,
) -> Option<(&'static str, Value)> {
    let batch = crate::contracts::tool_contract(ToolId::GhGetHistoryItem)
        .ok()
        .and_then(|contract| {
            contract
                .pointer("/inputSchema/properties/queries/maxItems")?
                .as_u64()
        })
        .and_then(|max| usize::try_from(max).ok())
        .unwrap_or(1);
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
    let (size, page) = unseen_commit_pages(listed.seen?, batch);
    Some(commit_list_lead(query, out, size, page))
}

/// The page size and first page that list the range's commits after the
/// first `seen`, each exactly once: GitHub pages the list by whole pages, so
/// the size is the largest one within `batch` that divides `seen`.
fn unseen_commit_pages(seen: usize, batch: usize) -> (usize, usize) {
    let size = (1..=batch.max(1))
        .rev()
        .find(|size| seen.is_multiple_of(*size))
        .unwrap_or(1);
    (size, seen / size + 1)
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

/// A `matchString` that kept none of the page's changed files. It searches
/// each file's path and its diff text, so the function context git prints
/// after a hunk's `@@ … @@` counts as text: a hit there is not a changed line.
fn match_removed_all_warning(needle: &str, listed: usize) -> String {
    format!(
        "matchString matched 0 of {listed} changed files listed on this page (it searched {needle:?} in each file's diff text, hunk-header context included); drop matchString to list the files."
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
    scope: Option<&PathScope>,
    query: &HistoryItemRequest,
    complete: bool,
) -> Option<String> {
    let scope = scope?;
    if files.is_empty() || files.iter().any(|file| scope.matches(file)) {
        return None;
    }
    let target = query
        .file_scope
        .iter()
        .find_map(|pattern| literal_prefix(pattern))
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

    /// The commit list lead starts after the shown commits and every commit
    /// of the range falls on exactly one of its pages.
    #[test]
    fn unseen_commit_pages_start_where_the_shown_page_ends() {
        for (seen, batch) in [(100, 5), (100, 3), (97, 5), (30, 4), (7, 1), (5, 5)] {
            let (size, page) = unseen_commit_pages(seen, batch);
            assert!((1..=batch).contains(&size), "{seen}/{batch}: {size}");
            assert_eq!(size * (page - 1), seen, "{seen}/{batch}: {size} {page}");
        }
        assert_eq!(unseen_commit_pages(100, 5), (5, 21));
    }
}

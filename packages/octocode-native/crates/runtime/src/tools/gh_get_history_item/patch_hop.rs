//! Patch hops: the whole-patch re-read, selected-patch continuations, and
//! commit/comparison file-page cursors.
use super::pr_menu::*;
use super::{HistoryItemRequest, ItemOperation};
use crate::tools::gh_shared::commit::commit_pull_request;
use crate::tools::gh_shared::ensure_next;
use crate::tools::id::ToolId;
use crate::tools::result::Continuation;
use serde_json::{Map, Value, json};

/// The whole-patch re-read of every patch row a `matchString` view narrowed
/// (hit lines, clipped long lines; rows marked `fullPatchChars`, kept on
/// rows only with `extras: ["details"]`): the opt-in lead `readFullPatches`
/// reads the selected files whole; more files than one selection holds
/// continue in `readFullPatches2`, `readFullPatches3`, …. The grep showed
/// what was asked, so the lead yields to code reads (`confidence: "low"`).
pub(super) fn attach_full_patch_continuation(out: &mut Value, q: &HistoryItemRequest) {
    let narrowed = take_reshaped_paths(
        out.pointer_mut("/pullRequests/0/files"),
        q.wants(crate::contracts::tool_types::ExtraKind::Details),
    );
    if narrowed.is_empty() {
        return;
    }
    let mut nq = base_public_query(q, ItemOperation::PullRequest);
    for key in ["offset", "length", "page"] {
        remove_key(&mut nq, key);
    }
    ensure_next(out);
    remove_key(&mut nq, "matchString");
    remove_key(&mut nq, "contextLines");
    let name = "readFullPatches";
    // Patch hunks are never minified: the whole patch needs no `minify`.
    remove_key(&mut nq, "minify");
    // Each read names its files in the public `include` beside `patches`.
    remove_key(&mut nq, "content");
    for (index, files) in narrowed.chunks(selected_patch_files()).enumerate() {
        let read = super::util::merge(
            nq.clone(),
            json!({"include": files, "sections": ["patches"]}),
        );
        let key = if index == 0 {
            name.to_owned()
        } else {
            format!("{name}{}", index + 1)
        };
        let mut lead = menu_read(read);
        lead["confidence"] = json!("low");
        out["next"][key] = lead;
    }
}

/// Paths of the rows marked `fullPatchChars` (a view that is not the raw
/// patch). The marker stays on rows only with `debug`.
pub(super) fn take_reshaped_paths(rows: Option<&mut Value>, debug: bool) -> Vec<String> {
    let mut paths = Vec::new();
    for file in rows.and_then(Value::as_array_mut).into_iter().flatten() {
        let Some(fields) = file.as_object_mut() else {
            continue;
        };
        let marked = if debug {
            fields.contains_key("fullPatchChars")
        } else {
            fields.remove("fullPatchChars").is_some()
        };
        if marked && let Some(path) = fields.get("path").and_then(Value::as_str) {
            paths.push(path.to_owned());
        }
    }
    paths
}

/// Paths one selected-patch read names: the contract's pull-request
/// `include` `maxItems`.
#[allow(clippy::panic)]
pub(super) fn selected_patch_files() -> usize {
    crate::contracts::query_schema_number(
        ToolId::GhGetHistoryItem,
        Some("pullRequest"),
        "include",
        "maxItems",
    )
    .and_then(|maximum| usize::try_from(maximum).ok())
    .unwrap_or_else(|| panic!("contract declares no maxItems for ghGetHistoryItem include"))
}

/// The patch continuation of a pull-request page: the same query (file
/// page, filters, selection) at the page-stream cursor, narrowed to the
/// patch surface.
pub(super) fn patch_continuation(mut nq: Value, entry: &Value, q: &HistoryItemRequest) -> Value {
    let files_requested = q
        .content_value()
        .as_ref()
        .and_then(|value| value.get("files"))
        .and_then(Value::as_bool)
        == Some(true);
    if let Some(content) = nq.get_mut("content").and_then(Value::as_object_mut) {
        if !files_requested {
            content.remove("files");
        }
        content.retain(|key, _| key == "patches" || key == "files");
    }
    if let Some(cursor) = entry.get("nextOffset") {
        nq["offset"] = cursor.clone();
    }
    clamp_hop_length(&mut nq, q);
    menu_read(nq)
}

/// A hop carries the caller's `length` as the window it got, so a length
/// clamped to the response page is said once, on the call that asked.
pub(super) fn clamp_hop_length(nq: &mut Value, q: &HistoryItemRequest) {
    if let Some(length) = q.char_length() {
        nq["length"] = json!(super::window::patch_window(Some(length), q.auto_page_chars));
    }
}

/// The page state a commit or comparison read leaves to continue, as the
/// shaping code computed it (never re-read from the shaped output).
#[derive(Clone, Copy, Debug, Default)]
pub(super) struct DiffCursors {
    /// The next comparison commit page.
    pub(super) commit_page: Option<u64>,
    /// The next changed-file page.
    pub(super) file_page: Option<u64>,
    /// The page-stream cursor of an unfinished patch window.
    pub(super) patch_offset: Option<usize>,
    /// The page listed changed files.
    pub(super) files_listed: bool,
}

impl DiffCursors {
    /// The cursors of a file page: its `nextPage` and the patch-stream
    /// cursor of its unfinished patch window. The cursor is internal state
    /// for `next.continuePatch`, never an output field.
    pub(super) fn of_file_page(
        files_page: &Value,
        patch_offset: Option<usize>,
        files_listed: bool,
    ) -> Self {
        Self {
            commit_page: None,
            file_page: files_page.get("nextPage").and_then(Value::as_u64),
            patch_offset,
            files_listed,
        }
    }
}

/// The commit read a commit file page continues: the generated
/// `ghGetHistoryItem` commit query at `reference`, with the caller's
/// page, window and scope (a nested PR commit reads its patches from the
/// first file page).
pub(super) fn commit_query(q: &HistoryItemRequest, reference: &str, nested: bool) -> Value {
    use crate::contracts::tool_types::{
        GhGetHistoryItemQuery, GhGetHistoryItemQueryRef, GhGetHistoryItemQuerySectionsItem,
        HiInclude, HiIncludeItem, HiMatchString, HiOwner, HiRepo,
    };
    let positive = |value: usize| {
        u64::try_from(value)
            .ok()
            .and_then(std::num::NonZeroU64::new)
    };
    let typed = || -> Option<GhGetHistoryItemQuery> {
        Some(GhGetHistoryItemQuery::Commit {
            // A hop keeps the patch grep that narrowed the row it came from.
            context_lines: None,
            extras: Vec::new(),
            page: q
                .page()
                .or((!nested).then_some(1))
                .and_then(positive)
                .map(Into::into),
            include: (!nested && !q.file_scope.is_empty())
                .then(|| {
                    q.file_scope
                        .iter()
                        .map(|path| HiIncludeItem::try_from(path.as_str()).ok())
                        .collect::<Option<Vec<_>>>()
                        .map(HiInclude)
                })
                .flatten(),
            length: q.char_length().and_then(positive).map(Into::into),
            main_goal: None,
            match_string: q.match_string().map(|text| HiMatchString(text.to_owned())),
            offset: q
                .char_offset()
                .and_then(|offset| u64::try_from(offset).ok())
                .map(Into::into),
            owner: HiOwner::try_from(q.owner()).ok()?,
            page_size: q.page_size().and_then(positive).map(Into::into),
            reasoning: None,
            ref_: GhGetHistoryItemQueryRef::try_from(reference).ok()?,
            repo: HiRepo::try_from(q.repo()).ok()?,
            sections: if nested || q.include_diff() {
                vec![GhGetHistoryItemQuerySectionsItem::Patches]
            } else {
                Vec::new()
            },
        })
    };
    let mut value = typed()
        .and_then(|query| serde_json::to_value(query).ok())
        .unwrap_or_default();
    remove_key(&mut value, "extras");
    value
}

/// `next.*` for a commit or comparison file page (also nested per PR commit
/// when `direct`), from the cursors the page computed.
pub(super) fn attach_diff_continuations(
    out: &mut Value,
    q: &HistoryItemRequest,
    operation: ItemOperation,
    resolved_ref: Option<&str>,
    direct: bool,
    cursors: DiffCursors,
) {
    let mut next = Map::new();
    let base = match (operation, resolved_ref.or(q.reference())) {
        (ItemOperation::Commit, Some(reference)) => commit_query(q, reference, direct),
        _ => base_public_query(q, operation),
    };
    let make = |query: Value| {
        if direct {
            Continuation::new(ToolId::GhGetHistoryItem, query)
                .confidence("exact")
                .build()
        } else {
            continuation(query)
        }
    };
    if let Some(page) = cursors.commit_page {
        let mut nq = base.clone();
        nq["page"] = json!(page);
        // A commit page carries commits only; patch cursors would be inert.
        nq["sections"] = json!(["commits"]);
        for key in ["offset", "length", "matchString", "contextLines"] {
            remove_key(&mut nq, key);
        }
        next.insert("nextCommitPage".into(), make(nq));
    }
    // A file page with unread patches continues them first: its window
    // that finishes the patches offers the next file page.
    if let Some(page) = cursors.file_page.filter(|_| cursors.patch_offset.is_none()) {
        let mut nq = base.clone();
        nq["page"] = json!(page);
        remove_key(&mut nq, "offset");
        files_only(&mut nq, operation);
        next.insert("nextFilePage".into(), make(nq));
    }
    // Files were listed without patches: offer the same page with diffs.
    if !q.include_diff() && base.get("sections").is_none() && cursors.files_listed {
        let mut nq = base.clone();
        nq["sections"] = json!(["patches"]);
        remove_key(&mut nq, "offset");
        next.insert("readPatches".into(), make(nq));
    }
    // The page-stream cursor, not a file's own `patchPagination` offset.
    if let Some(offset) = cursors.patch_offset {
        let mut nq = base;
        nq["offset"] = json!(offset);
        files_only(&mut nq, operation);
        clamp_hop_length(&mut nq, q);
        next.insert("continuePatch".into(), make(nq));
    }
    if !next.is_empty() {
        out["next"] = Value::Object(next);
    }
}

/// A comparison file or patch continuation reads files alone: the commit
/// list was delivered with the page it continues.
fn files_only(query: &mut Value, operation: ItemOperation) {
    if !matches!(operation, ItemOperation::Compare) {
        return;
    }
    let sections = query
        .get("sections")
        .and_then(Value::as_array)
        .map(|sections| {
            sections
                .iter()
                .filter(|section| section.as_str() != Some("commits"))
                .cloned()
                .collect::<Vec<_>>()
        })
        .filter(|sections| !sections.is_empty())
        // A `matchString` with no section named reads patches.
        .unwrap_or_else(|| {
            let section = if query.get("matchString").is_some() {
                "patches"
            } else {
                "files"
            };
            vec![json!(section)]
        });
    query["sections"] = Value::Array(sections);
}

/// Commit → pull request: the PR the message names (a squash headline's
/// `(#8506)`, a merge commit, or a `PR-URL:` trailer); otherwise issue search
/// matches PRs by commit SHA. `message` is the whole commit message, which a
/// patch read does not carry.
pub(super) fn commit_pull_request_lead(
    message: &str,
    sha: &str,
    q: &HistoryItemRequest,
) -> (&'static str, Value) {
    if let Some(number) = commit_pull_request(message, q.owner(), q.repo()) {
        return (
            "readPullRequest",
            Continuation::new(
                ToolId::GhGetHistoryItem,
                json!({"operation":"pullRequest","owner":q.owner(),"repo":q.repo(),"number":number}),
            )
            .confidence("exact")
            .build(),
        );
    }
    (
        "findPullRequest",
        Continuation::new(
            ToolId::GhSearchHistory,
            json!({"operation":"pullRequest","owner":q.owner(),"repo":q.repo(),"keywords":[sha]}),
        )
        .confidence("high")
        .build(),
    )
}

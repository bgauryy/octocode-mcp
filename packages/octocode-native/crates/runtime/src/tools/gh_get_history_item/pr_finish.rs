//! The finish step of a pull-request read: marks an unmatched scope or
//! literal, attaches the continuations and context reads, trims pagination,
//! and builds the metadata row.
use super::HistoryItemRequest;
use super::patch::hunks::match_context;
use super::patch_hop::attach_full_patch_continuation;
use super::promotion::{attach_raw_body_read, promote_pr_continuations};
use super::pull_request::{ContentWants, FileOutcome, PrPlan, ShapedPr};
use super::text::history_body_view;
use super::util::{nonzero, str_at, string};
use super::window::clamp_warning;
use crate::contracts::tool_types::ExtraKind;
use crate::tools::gh_shared::ensure_next;
use crate::tools::id::ToolId;
use crate::tools::paging::push_warnings;
use crate::tools::result::remove_nulls;
use serde_json::{Value, json};

/// A scope or literal that matched nothing: an empty row with a recovery
/// tip, or, when other sections hold evidence, a warning.
fn mark_unmatched(
    out: &mut Value,
    query: &HistoryItemRequest,
    plan: &PrPlan,
    files: &FileOutcome,
    other_evidence: bool,
) -> Option<String> {
    let mut needle_missed = None;
    if files.scope_unmatched && files.unsearched.is_empty() {
        match query.match_string().filter(|_| plan.needle.is_some()) {
            Some(literal) if plan.scope.is_none() && other_evidence => {
                needle_missed = Some(format!(
                    "matchString {literal:?} hit no patch line in the PR's changed files."
                ));
            }
            Some(_) => {
                out["status"] = json!("empty");
                out["hints"] = json!([
                    "matchString hit no patch line; check its spelling, drop it, or read the inventory (sections:[\"files\"])."
                ]);
            }
            None => {
                out["status"] = json!("empty");
                out["hints"] = json!([
                    "No changed file matched include/status/minChanges; read the inventory (sections:[\"files\"]) and copy a path."
                ]);
            }
        }
    }
    needle_missed
}

pub(super) fn finish_pr(
    query: &HistoryItemRequest,
    wants: &ContentWants,
    plan: &PrPlan,
    shaped: ShapedPr,
    graphql_fallback: Option<String>,
) -> Value {
    let ShapedPr {
        row,
        files,
        minified,
        menu,
        comment_reads,
    } = shaped;
    let patch_mode = wants.patch_mode.as_str();
    // A `matchString` miss in the files is an empty row only when no other
    // section of the read (body, comments, reviews) holds evidence;
    // otherwise the row says so in a warning.
    let other_evidence = wants.body
        || ["comments", "reviews"].iter().any(|key| {
            row.get(*key)
                .and_then(Value::as_array)
                .is_some_and(|items| !items.is_empty())
        });
    let mut out = json!({"pullRequests":[row]});
    let needle_missed = mark_unmatched(&mut out, query, plan, &files, other_evidence);
    if !files.unsearched.is_empty() {
        out["pullRequests"][0]["unsearchedFiles"] = json!(files.unsearched);
    }
    if (patch_mode != "none" || plan.needle.is_some())
        && let Some(warning) = clamp_warning(query)
    {
        push_warnings(&mut out, [warning]);
    }
    if let Some(warning) = needle_missed {
        push_warnings(&mut out, [warning]);
    }
    promote_pr_continuations(&mut out, query);
    attach_full_patch_continuation(&mut out, query);
    attach_raw_body_read(&mut out, query, &minified);
    if let Some(path) = &files.first_unsearched {
        attach_unsearched_read(&mut out, query, path);
    }
    attach_context_reads(&mut out, query, &files.clipped);
    // The row's next steps ride the response's leads (one capped list),
    // never a second list nested in the row; the contract's lead priority
    // keeps every lead under the lead cap.
    let merge_read = files.merge_read.filter(|_| patch_mode != "none");
    // A patch read's next step is the code at either side of its numbered
    // diff: those reads rank ahead of the section menu.
    let leads = files
        .side_reads
        .into_iter()
        .map(|(name, read)| (name.to_owned(), read))
        .chain(
            menu.and_then(|menu| match menu {
                Value::Object(menu) => Some(menu),
                _ => None,
            })
            .into_iter()
            .flatten(),
        )
        .chain(merge_read.map(|read| ("readAtMerge".to_owned(), read)));
    for (name, lead) in leads {
        ensure_next(&mut out);
        if let Some(next) = out["next"].as_object_mut() {
            next.entry(name).or_insert(lead);
        }
    }
    // The comments' own leads go before the menu's: they are the reads the
    // comment page asked for, ten anchor ranges each.
    if !comment_reads.is_empty() {
        ensure_next(&mut out);
        if let Some(next) = out["next"].as_object_mut() {
            for (index, read) in comment_reads.into_iter().enumerate().rev() {
                let name = match index {
                    0 => "readCommentCode".to_owned(),
                    n => format!("readCommentCode{}", n + 1),
                };
                next.shift_insert(0, name, read);
            }
        }
    }
    if !query.wants(ExtraKind::Details) {
        trim_content_pagination(&mut out);
    }
    if query.wants(ExtraKind::Diagnostics)
        && let Some(reason) = graphql_fallback
    {
        out["graphqlFallback"] = json!(reason);
    }
    out
}

/// A `matchString` search that skipped patchless files covers only part of
/// the diff: mark it partial and offer the literal search of the first
/// skipped file's source at the PR head (a template for the rest).
fn attach_unsearched_read(out: &mut Value, query: &HistoryItemRequest, path: &str) {
    let source_sha = str_at(out, "/pullRequests/0/headSha").map(str::to_owned);
    out["isPartial"] = json!(true);
    match out.get_mut("partialReasons").and_then(Value::as_array_mut) {
        Some(reasons) => reasons.push(json!("patchUnavailable")),
        None => out["partialReasons"] = json!(["patchUnavailable"]),
    }
    let (Some(needle), Some(sha)) = (query.match_string(), source_sha) else {
        return;
    };
    ensure_next(out);
    out["next"]["searchUnpatchedFile"] = crate::tools::result::Continuation::new(
        ToolId::GhGetFileContent,
        json!({
            "owner": query.owner(),
            "repo": query.repo(),
            "path": path,
            "ref": sha,
            "matchString": needle,
        }),
    )
    .confidence("high")
    .build();
}

/// `matchString` context the hunks cut short and the head text did not
/// fill: the row is partial, and `next.expandContext` reads each file's
/// wanted windows at the PR head (`headSha`).
fn attach_context_reads(
    out: &mut Value,
    query: &HistoryItemRequest,
    clipped: &[(String, Vec<String>)],
) {
    let Some(sha) = str_at(out, "/pullRequests/0/headSha").map(str::to_owned) else {
        return;
    };
    if clipped.is_empty() {
        return;
    }
    out["isPartial"] = json!(true);
    match out.get_mut("partialReasons").and_then(Value::as_array_mut) {
        Some(reasons) => reasons.push(json!("contextClipped")),
        None => out["partialReasons"] = json!(["contextClipped"]),
    }
    push_warnings(
        out,
        [format!(
            "contextLines {} reaches past the diff hunks of {} file(s) (contextClipped).",
            match_context(query),
            clipped.len()
        )],
    );
    ensure_next(out);
    for (index, (path, ranges)) in clipped.iter().enumerate() {
        let name = if index == 0 {
            "expandContext".to_owned()
        } else {
            format!("expandContext{}", index + 1)
        };
        out["next"][name] = crate::tools::result::Continuation::new(
            ToolId::GhGetFileContent,
            json!({
                "owner": query.owner(),
                "repo": query.repo(),
                "path": path,
                "ref": sha,
                "ranges": ranges,
            }),
        )
        .confidence("exact")
        .build();
    }
}

/// Default responses drop pagination that adds nothing once `next.*` is
/// built: a finished single-page list or whole text window, and the patch
/// cursor, which the cut file's own `patchPagination` already carries.
/// Provider limits stay.
fn trim_content_pagination(out: &mut Value) {
    let Some(row) = out
        .pointer_mut("/pullRequests/0")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    let Some(pages) = row
        .get_mut("contentPagination")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    pages.retain(|_, page| {
        let done =
            page.get("hasMore") == Some(&Value::Bool(false)) && page.get("terminalLimit").is_none();
        // A finished first page, or a whole text window (offset zero).
        let first = page.get("currentPage").and_then(Value::as_u64) == Some(1)
            || page.get("offset").and_then(Value::as_u64) == Some(0);
        !(done && first)
    });
    if pages
        .get("patches")
        .is_some_and(|patches| patches.get("hasMore") != Some(&Value::Bool(true)))
    {
        pages.remove("patches");
    }
    if let Some(patches) = pages.get_mut("patches").and_then(Value::as_object_mut) {
        patches.retain(|key, _| matches!(key.as_str(), "hasMore" | "unfinishedFiles"));
    }
    if pages.is_empty() {
        row.remove("contentPagination");
    }
    lift_terminal_limits(out);
}

/// A page's terminal limit is restated on the row (`terminalLimit`,
/// `partialReasons`); the page schema does not declare it.
fn lift_terminal_limits(out: &mut Value) {
    let Some(row) = out.pointer_mut("/pullRequests/0") else {
        return;
    };
    let limited: Vec<Value> = row
        .get_mut("contentPagination")
        .and_then(Value::as_object_mut)
        .into_iter()
        .flat_map(|pages| pages.values_mut())
        .filter_map(Value::as_object_mut)
        .filter_map(|page| {
            (page.remove("terminalLimit") == Some(Value::Bool(true)))
                .then(|| json!({"terminalLimit": true, "providerLimit": page.get("providerLimit")}))
        })
        .collect();
    for mut page in limited {
        super::window::lift_page_limits(row, &mut page);
    }
}

/// A section read (or a later page) is read for its sections; the summary
/// read owns the rest of the header. It keeps the identity and the commits
/// code is read at: `number`, `state`, `headSha` and a merged PR's
/// `mergeCommitSha` (gh `pr view --json files` carries no header at all).
/// The first page of a file inventory also keeps `changedFilesCount`: the
/// denominator of the list it opens, which a one-page list would not state.
pub(super) fn slim_row(row: &mut Value, query: &HistoryItemRequest) {
    let Some(fields) = row.as_object_mut() else {
        return;
    };
    let wants = super::pull_request::content_wants(query);
    let inventory = wants.files && wants.patch_mode == "none" && !query.later_page();
    fields.retain(|key, _| {
        matches!(
            key.as_str(),
            "number" | "state" | "headSha" | "mergeCommitSha"
        ) || (inventory && key == "changedFilesCount")
    });
}

/// Characters a PR summary's `bodyPreview` shows.
const BODY_PREVIEW_CHARS: usize = 300;

/// The opening of a PR body's (template-minified) view, whitespace runs
/// collapsed; a cut preview ends with `…`. `None` for an empty body.
fn body_preview(body: &str, query: &HistoryItemRequest) -> Option<String> {
    let view = history_body_view(body, query);
    let flat = view.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.is_empty() {
        return None;
    }
    if flat.chars().count() <= BODY_PREVIEW_CHARS {
        return Some(flat);
    }
    let mut preview = flat.chars().take(BODY_PREVIEW_CHARS).collect::<String>();
    preview.push('…');
    Some(preview)
}

pub(super) fn pr_metadata(raw: &Value, query: &HistoryItemRequest) -> Value {
    let merged = raw.get("merged_at").is_some_and(|v| !v.is_null());
    let open = !merged && str_at(raw, "/state").unwrap_or("open") == "open";
    let labels = raw
        .get("labels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|v| {
            v.as_str()
                .map(str::to_owned)
                .or_else(|| str_at(v, "/name").map(str::to_owned))
        })
        .collect::<Vec<_>>();
    // The body is opt-in (`include:["body"]`, offered by the menu): the
    // summary names the change; a merged PR's close time is its merge time,
    // and only an open PR's last update says whether it is still moving.
    let mut row = json!({
        "number": raw["number"],
        "title": string(raw.get("title")),
        "state": if merged {"merged"} else {str_at(raw,"/state").unwrap_or("open")},
        "draft": raw.get("draft").and_then(Value::as_bool).filter(|v|*v),
        "author": str_at(raw,"/user/login").unwrap_or(""),
        "labels": (!labels.is_empty()).then_some(labels),
        // GraphQL reads the first 20 labels; say when more exist.
        "labelsTruncated": raw.get("labels_truncated").and_then(Value::as_bool).filter(|v| *v),
        "baseBranch": str_at(raw,"/base/ref").filter(|v|!v.is_empty()),
        "headBranch": str_at(raw,"/head/ref").filter(|v|!v.is_empty()),
        "headSha": str_at(raw,"/head/sha").filter(|v|!v.is_empty()),
        // The target-branch tip GitHub recorded for the PR: not the diff's
        // old side (that is the merge base, which `readParent` reads).
        "baseSha": str_at(raw,"/base/sha").filter(|v|!v.is_empty()),
        "createdAt": string(raw.get("created_at")),
        "updatedAt": open.then(|| string(raw.get("updated_at"))).filter(|v| !v.is_empty()),
        "closedAt": (!merged).then(|| raw.get("closed_at").filter(|v|!v.is_null())).flatten(),
        "mergedAt": raw.get("merged_at").filter(|v|!v.is_null()),
        // Only a merged PR has a real merge commit (open PRs expose GitHub's
        // test-merge SHA, which is not on the base branch).
        "mergeCommitSha": merged.then(|| str_at(raw,"/merge_commit_sha")).flatten().filter(|v|!v.is_empty()),
        "commentsCount": nonzero(raw.get("comments")),
        "commitsCount": nonzero(raw.get("commits")),
        // Review threads (GraphQL only): REST counts review comments, a
        // different unit, so a REST read leaves this out.
        "reviewThreadsCount": nonzero(raw.get("review_threads")),
        "changedFilesCount": nonzero(raw.get("changed_files")),
        "additions": nonzero(raw.get("additions")),
        "deletions": nonzero(raw.get("deletions")),
    });
    // A summary previews what the PR says; the menu's body read (`readFiles`,
    // `readPatches` or `readBody`) holds the whole body.
    if query.content_value().is_none()
        && let Some(preview) = str_at(raw, "/body").and_then(|body| body_preview(body, query))
    {
        row["bodyPreview"] = json!(preview);
    }
    if query.wants(ExtraKind::Details) {
        // Details keep the provider's timestamps whole.
        if let Some(updated) = raw.get("updated_at").filter(|v| v.is_string()) {
            row["updatedAt"] = updated.clone();
        }
        if let Some(closed) = raw.get("closed_at").filter(|v| !v.is_null()) {
            row["closedAt"] = closed.clone();
        }
    }
    remove_nulls(&mut row);
    row
}

#[cfg(test)]
mod tests {
    use super::super::util::merge;
    use super::*;

    fn summary(raw: Value, details: bool) -> Value {
        let mut row = json!({
            "operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r",
            "number":1
        });
        if details {
            row["extras"] = json!(["details"]);
        }
        let query = HistoryItemRequest::from_row(row).expect("query");
        pr_metadata(&raw, &query)
    }

    #[test]
    fn summary_rows_state_each_time_once_and_preview_the_body() {
        let base = json!({"number":1,"title":"t","user":{"login":"a"},"body":"Long description",
            "created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-05T00:00:00Z"});
        let merged = summary(
            merge(
                base.clone(),
                json!({"state":"closed","merged_at":"2026-01-04T00:00:00Z",
                "closed_at":"2026-01-04T00:00:01Z","merge_commit_sha":"abc"}),
            ),
            false,
        );
        assert_eq!(merged["mergedAt"], "2026-01-04T00:00:00Z", "{merged}");
        for absent in ["closedAt", "updatedAt", "body"] {
            assert!(merged.get(absent).is_none(), "{absent}: {merged}");
        }
        // The summary previews the body; the menu's body read holds it whole.
        assert_eq!(merged["bodyPreview"], "Long description", "{merged}");
        let closed = summary(
            merge(
                base.clone(),
                json!({"state":"closed","merged_at":null,
                "closed_at":"2026-01-04T00:00:00Z"}),
            ),
            false,
        );
        assert_eq!(closed["closedAt"], "2026-01-04T00:00:00Z", "{closed}");
        assert!(closed.get("updatedAt").is_none(), "{closed}");
        let open = summary(merge(base.clone(), json!({"state":"open"})), false);
        assert_eq!(open["updatedAt"], "2026-01-05T00:00:00Z", "{open}");
        // details keep the provider's timestamps whole.
        let details = summary(
            merge(
                base,
                json!({"state":"closed","merged_at":"2026-01-04T00:00:00Z",
                "closed_at":"2026-01-04T00:00:01Z"}),
            ),
            true,
        );
        assert_eq!(details["closedAt"], "2026-01-04T00:00:01Z", "{details}");
        assert_eq!(details["updatedAt"], "2026-01-05T00:00:00Z", "{details}");
    }

    /// The summary names the change's three commits: the head
    /// (`headSha`), the recorded target-branch tip (`baseSha`) and a
    /// merged PR's merge commit. A section read keeps the identity and the
    /// commits code is read at (`headSha`, `mergeCommitSha`), nothing else.
    #[test]
    fn every_pr_view_keeps_source_target_and_merge_commits() {
        let raw = json!({"number":1,"title":"t","user":{"login":"a"},"state":"closed",
            "merged_at":"2026-01-04T00:00:00Z","merge_commit_sha":"m1",
            "head":{"sha":"h1","ref":"feat"},"base":{"sha":"b1","ref":"main"},
            "created_at":"2026-01-01T00:00:00Z","changed_files":3,"additions":5,"deletions":1,
            "commits":4,"review_threads":2});
        let row = summary(raw.clone(), false);
        assert_eq!(
            (&row["headSha"], &row["baseSha"], &row["mergeCommitSha"]),
            (&json!("h1"), &json!("b1"), &json!("m1")),
            "{row}"
        );
        assert_eq!(row["commitsCount"], 4, "{row}");
        assert_eq!(row["reviewThreadsCount"], 2, "{row}");
        for fields in [
            json!({"sections":["patches"]}),
            json!({"sections":["files"]}),
            json!({"sections":["patches"],"matchString":"x"}),
            json!({"sections":["patches"],"page":2}),
        ] {
            let query = HistoryItemRequest::from_row(merge(
                json!({"operation":"pullRequest","owner":"o","repo":"r","number":1}),
                fields.clone(),
            ))
            .expect("query");
            let mut row = pr_metadata(&raw, &query);
            slim_row(&mut row, &query);
            let mut expected =
                json!({"number":1,"state":"merged","headSha":"h1","mergeCommitSha":"m1"});
            // Only the first page of a file inventory keeps the count the
            // list it opens is measured against.
            if fields == json!({"sections":["files"]}) {
                expected["changedFilesCount"] = json!(3);
            }
            assert_eq!(row, expected, "{fields}");
        }
        // An open PR has no merge commit; REST has no review-thread total.
        let open = summary(
            json!({"number":1,"state":"open","head":{"sha":"h1"},"base":{"sha":"b1"},
                "merge_commit_sha":"test-merge","review_comments":9}),
            false,
        );
        assert!(open.get("mergeCommitSha").is_none(), "{open}");
        assert!(open.get("reviewThreadsCount").is_none(), "{open}");
        assert_eq!(open["baseSha"], "b1", "{open}");
    }
}

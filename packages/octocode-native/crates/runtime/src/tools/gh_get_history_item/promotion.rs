//! Promotion of a shaped page's cursors (`contentPagination`) to `next.*`
//! for pull requests and issues, with the note of what each page leaves.
use super::patch_hop::*;
use super::pr_menu::*;
use super::rest::Rest;
use super::{HistoryItemRequest, ItemOperation, Section, Sections};
use crate::response::pages::Remaining;
use serde_json::{Map, Value, json};

/// A pull-request `contentPagination` axis: its `next.*` name, the page field
/// holding the cursor, and the query key the cursor continues.
pub(super) fn pr_axis(axis: &str) -> Option<(&'static str, &'static str, &'static str)> {
    Some(match axis {
        "body" => ("continueBody", "nextOffset", "offset"),
        "reviewBody" => ("continueReviewBody", "nextOffset", "offset"),
        "patches" => ("continuePatch", "nextOffset", "offset"),
        "commentBody" => ("continueCommentBody", "nextOffset", "offset"),
        "files" => ("nextFilePage", "nextPage", "page"),
        "comments" => ("nextCommentPage", "nextPage", "page"),
        "reviewComments" => ("nextReviewCommentPage", "nextPage", "page"),
        "reviews" => ("nextReviewPage", "nextPage", "page"),
        "commits" => ("nextCommitPage", "nextPage", "page"),
        _ => return None,
    })
}

/// A provider limit an item read's section hit (GitHub lists at most 3,000
/// PR files), stated on the row: section cursors are an opt-in stats
/// extra, the limit is evidence.
fn hoist_provider_limit(out: &mut Value, row: &str) {
    let limit = out
        .pointer(&format!("{row}/contentPagination"))
        .and_then(Value::as_object)
        .and_then(|pages| pages.values().find_map(|page| page.get("providerLimit")))
        .cloned();
    // A provider limit names its reason (the contract requires it).
    let Some((limit, reason)) = limit.and_then(|limit| {
        let reason = limit.get("reason")?.as_str()?.to_owned();
        Some((limit, reason))
    }) else {
        return;
    };
    crate::tools::paging::terminal_limit(out, &reason, &[]);
    out["providerLimit"] = limit;
}

/// Page blocks state where the page stands; the cursor rides the `next`
/// continuation it was read into, never the block.
const CURSOR_FIELDS: [&str; 2] = ["nextPage", "nextOffset"];

fn strip_cursors(pages: &mut Map<String, Value>) {
    for page in pages.values_mut().filter_map(Value::as_object_mut) {
        for field in CURSOR_FIELDS {
            page.remove(field);
        }
    }
}

/// `next.*` for every unfinished axis of the pull request's page, and the
/// note of what each leaves ([`Rest`]). `isPartial` is set only for an axis
/// with more to read that no continuation reaches: `hasMore` beside a
/// `next.*` page already says the rest is unread.
pub(super) fn promote_pr_continuations(
    out: &mut Value,
    q: &HistoryItemRequest,
    rest: &Rest,
) -> Vec<Remaining> {
    hoist_provider_limit(out, "/pullRequests/0");
    let Some(pages) = out
        .pointer_mut("/pullRequests/0/contentPagination")
        .and_then(Value::as_object_mut)
    else {
        return Vec::new();
    };
    // A file page with unread patches continues them first: its window
    // that finishes the patches offers the next file page.
    let patches_open = pages
        .get("patches")
        .is_some_and(|entry| entry.get("hasMore").and_then(Value::as_bool) == Some(true));
    let mut next = Map::new();
    let mut notes = Vec::new();
    let mut unreached = false;
    for (axis, entry) in pages.iter() {
        if entry.get("hasMore").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        // The patch window that finishes the page offers the next file page.
        if axis == "files" && patches_open {
            continue;
        }
        let Some((name, key, cursor)) = pr_axis(axis)
            .and_then(|(name, field, key)| Some((name, key, entry.get(field)?.clone())))
        else {
            unreached = true;
            continue;
        };
        let mut nq = base_public_query(q, ItemOperation::PullRequest);
        nq[key] = cursor;
        let call = if axis == "patches" {
            patch_continuation(nq, entry, q)
        } else {
            narrow_to_axis(&mut nq, axis, q);
            if axis == "files" {
                pin_file_page_size(&mut nq, q, q.sections().has(Section::Patches));
            }
            continuation(nq)
        };
        next.insert(name.into(), call);
        notes.extend(rest.note(name, axis, entry));
    }
    strip_cursors(pages);
    if unreached {
        out["isPartial"] = json!(true);
    }
    if !next.is_empty() {
        out["next"] = Value::Object(next);
    }
    notes
}

/// A pull-request continuation of `axis` reads that surface alone. `offset`
/// is a single field shared by the body, review-body, comment-body and patch
/// windows: a char-window continuation narrows content to the surface it
/// continues, and a page continuation restarts every char window, so one
/// surface's offset never skews another's.
fn narrow_to_axis(nq: &mut Value, axis: &str, q: &HistoryItemRequest) {
    match axis {
        "body" => {
            // The body has no page: a section page cursor would be inert.
            Sections::of([Section::Body]).set_on(nq);
            remove_key(nq, "page");
        }
        "reviewBody" => Sections::of([Section::Reviews]).set_on(nq),
        "commentBody" => {
            let read = q.sections();
            let comments = Sections::of(
                [Section::Comments, Section::ReviewComments]
                    .into_iter()
                    .filter(|section| read.has(*section)),
            );
            let comments = if comments.is_empty() {
                Sections::of([Section::Comments])
            } else {
                comments
            };
            comments.set_on(nq);
        }
        _ => {
            remove_key(nq, "offset");
            // A collection page continues only its own surface; the other
            // surfaces were already delivered on this call. The discussion
            // and the inline review comments page apart.
            let read = q.sections();
            let own: &[Section] = match axis {
                "files" => &[Section::Files, Section::Patches],
                "comments" => &[Section::Comments],
                "reviewComments" => &[Section::ReviewComments],
                "reviews" => &[Section::Reviews],
                "commits" => &[Section::Commits, Section::CommitFiles],
                _ => return,
            };
            // A page of patches lists their files.
            let read = if read.has(Section::Patches) {
                read.with(Section::Files)
            } else {
                read
            };
            Sections::of(own.iter().copied().filter(|section| read.has(*section))).set_on(nq);
        }
    }
}

/// `next.*` for every unfinished axis of the issue's page, and the note of
/// what each leaves ([`Rest`]); `isPartial` as for a pull request
/// ([`promote_pr_continuations`]).
pub(super) fn promote_issue_continuations(
    out: &mut Value,
    q: &HistoryItemRequest,
    rest: &Rest,
) -> Vec<Remaining> {
    let Some(pages) = out
        .pointer_mut("/issues/0/contentPagination")
        .and_then(Value::as_object_mut)
    else {
        return Vec::new();
    };
    let comments = Sections::of([Section::Comments]);
    // A comment-body hop keeps the body section its first window read: the
    // hop does not show the body again, but sizes its page like that window.
    let comment_bodies = if q.sections().has(Section::Body) {
        comments.with(Section::Body)
    } else {
        comments
    };
    let mut next = Map::new();
    let mut notes = Vec::new();
    let mut unreached = false;
    for (axis, entry) in pages.iter() {
        if entry.get("hasMore").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let (name, key, field, sections) = match axis.as_str() {
            "body" => (
                "continueBody",
                "offset",
                "nextOffset",
                Sections::of([Section::Body]),
            ),
            "commentBody" => (
                "continueCommentBody",
                "offset",
                "nextOffset",
                comment_bodies,
            ),
            "comments" => ("nextCommentPage", "page", "nextPage", comments),
            _ => {
                unreached = true;
                continue;
            }
        };
        let Some(cursor) = entry.get(field) else {
            unreached = true;
            continue;
        };
        let mut nq = base_public_query(q, ItemOperation::Issue);
        nq[key] = cursor.clone();
        sections.set_on(&mut nq);
        if axis == "comments" {
            // A comment page cut to the response budget resumes with the
            // page size that starts a page at its first unshown comment.
            if let Some(size) = rest.next_page_size() {
                nq["pageSize"] = json!(size);
            }
            // A page restarts every body window: the default offset.
            remove_key(&mut nq, "offset");
        }
        next.insert(name.into(), continuation(nq));
        notes.extend(rest.note(name, axis, entry));
    }
    strip_cursors(pages);
    if unreached {
        out["isPartial"] = json!(true);
    }
    if !next.is_empty() {
        out["next"] = Value::Object(next);
    }
    notes
}

#[cfg(test)]
mod tests;

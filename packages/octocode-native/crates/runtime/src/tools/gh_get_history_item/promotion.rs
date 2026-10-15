//! Promotion of a shaped page's cursors (`contentPagination`) to `next.*`
//! for pull requests and issues, with the note of what each page leaves.
use super::patch_hop::*;
use super::pr_menu::*;
use super::rest::Rest;
use super::{HistoryItemRequest, ItemOperation};
use crate::response::pages::Remaining;
use crate::tools::gh_shared::ensure_next;
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

/// `next.*` for every unfinished axis of the pull request's page, and the
/// note of what each leaves ([`Rest`]).
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
    let mut partial = false;
    for (axis, entry) in pages.iter() {
        if entry.get("hasMore").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        partial = true;
        if axis == "files" && patches_open {
            continue;
        }
        let Some((name, field, key)) = pr_axis(axis) else {
            continue;
        };
        let Some(cursor) = entry.get(field).cloned() else {
            continue;
        };
        let mut nq = base_public_query(q, ItemOperation::PullRequest);
        nq[key] = cursor;
        let call = if axis == "patches" {
            patch_continuation(nq, entry, q)
        } else {
            narrow_to_axis(&mut nq, axis, q);
            menu_read(nq)
        };
        next.insert(name.into(), call);
        notes.extend(rest.note(name, axis, entry));
    }
    if partial {
        out["isPartial"] = json!(true);
        if !next.is_empty() {
            out["next"] = Value::Object(next);
        }
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
            nq["content"] = json!({"body":true});
            remove_key(nq, "page");
        }
        "reviewBody" => nq["content"] = json!({"reviews":true}),
        "commentBody" => {
            nq["content"] = json!({"comments": q
                .content_value()
                .and_then(|content| content.get("comments").cloned())
                .unwrap_or(json!({"discussion":true}))});
        }
        _ => {
            remove_key(nq, "offset");
            // A collection page continues only its own surface; the other
            // surfaces were already delivered on this call. The discussion
            // and the inline review comments page apart.
            let (keep, comments): (&[&str], _) = match axis {
                "files" => (&["files", "patches"], None),
                "comments" => (&["comments"], Some(json!({"discussion": true}))),
                "reviewComments" => (&["comments"], Some(json!({"reviewInline": true}))),
                "reviews" => (&["reviews"], None),
                "commits" => (&["commits"], None),
                _ => (&[], None),
            };
            if let Some(content) = nq.get_mut("content").and_then(Value::as_object_mut) {
                if !keep.is_empty() {
                    content.retain(|key, _| keep.contains(&key.as_str()));
                }
                if let Some(comments) = comments {
                    content.insert("comments".into(), comments);
                }
            }
        }
    }
}

/// `next.readRawBody`: the PR text surfaces whose minified view dropped text
/// (the row says `bodyView:"minified"`), re-read with `minify:"none"` from
/// their first character, on the same comment and review pages.
pub(super) fn attach_raw_body_read(out: &mut Value, q: &HistoryItemRequest, surfaces: &[&str]) {
    if surfaces.is_empty() {
        return;
    }
    let mut nq = base_public_query(q, ItemOperation::PullRequest);
    for key in ["offset", "include", "status", "minChanges"] {
        remove_key(&mut nq, key);
    }
    let requested = q.content_value().unwrap_or_default();
    let mut content = Map::new();
    for surface in surfaces {
        let value = match *surface {
            "comments" => requested
                .get("comments")
                .cloned()
                .unwrap_or(json!({"discussion":true})),
            _ => json!(true),
        };
        content.insert((*surface).to_owned(), value);
    }
    nq["content"] = Value::Object(content);
    nq["minify"] = json!("none");
    ensure_next(out);
    out["next"]["readRawBody"] = menu_read(nq);
}

/// `next.*` for every unfinished axis of the issue's page, and the note of
/// what each leaves ([`Rest`]).
pub(super) fn promote_issue_continuations(
    out: &mut Value,
    q: &HistoryItemRequest,
    rest: &Rest,
) -> Vec<Remaining> {
    let Some(pages) = out
        .pointer("/issues/0/contentPagination")
        .and_then(Value::as_object)
    else {
        return Vec::new();
    };
    let content_value = q.content_value();
    let comments = || json!({"comments":content_value.as_ref().and_then(|v|v.get("comments").cloned()).unwrap_or(json!({"discussion":true}))});
    // A comment-body hop keeps the body section its first window read: the
    // hop does not show the body again, but sizes its page like that window.
    let comment_bodies = || {
        let mut content = comments();
        if content_value
            .as_ref()
            .and_then(|v| v.get("body"))
            .and_then(Value::as_bool)
            == Some(true)
        {
            content["body"] = json!(true);
        }
        content
    };
    let mut next = Map::new();
    let mut notes = Vec::new();
    for (axis, entry) in pages {
        if entry.get("hasMore").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let (name, key, field, content) = match axis.as_str() {
            "body" => ("continueBody", "offset", "nextOffset", json!({"body":true})),
            "commentBody" => (
                "continueCommentBody",
                "offset",
                "nextOffset",
                comment_bodies(),
            ),
            "comments" => ("nextCommentPage", "page", "nextPage", comments()),
            _ => continue,
        };
        let Some(cursor) = entry.get(field) else {
            continue;
        };
        let mut nq = base_public_query(q, ItemOperation::Issue);
        nq[key] = cursor.clone();
        nq["content"] = content;
        if axis == "comments" {
            // A comment page cut to the response budget resumes with the
            // page size that starts a page at its first unshown comment.
            if let Some(size) = rest.next_page_size() {
                nq["pageSize"] = json!(size);
            }
            nq["offset"] = json!(0);
        }
        next.insert(name.into(), menu_read(nq));
        notes.extend(rest.note(name, axis, entry));
    }
    if !next.is_empty() {
        out["isPartial"] = json!(true);
        out["next"] = Value::Object(next);
    }
    notes
}

#[cfg(test)]
mod tests;

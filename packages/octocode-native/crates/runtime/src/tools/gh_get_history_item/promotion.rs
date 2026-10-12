//! Promotion of a shaped page's cursors (`contentPagination`) to `next.*`
//! for pull requests and issues.
use super::patch_hop::*;
use super::pr_menu::*;
use super::{HistoryItemRequest, ItemOperation};
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
    let Some(limit) = limit else {
        return;
    };
    if let Some(reason) = limit.get("reason").cloned() {
        match out.get_mut("partialReasons").and_then(Value::as_array_mut) {
            Some(reasons) if !reasons.contains(&reason) => reasons.push(reason),
            Some(_) => {}
            None => out["partialReasons"] = json!([reason]),
        }
    }
    out["isPartial"] = json!(true);
    out["terminalLimit"] = json!(true);
    out["providerLimit"] = limit;
}

pub(super) fn promote_pr_continuations(out: &mut Value, q: &HistoryItemRequest) {
    hoist_provider_limit(out, "/pullRequests/0");
    let Some(pages) = out
        .pointer_mut("/pullRequests/0/contentPagination")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    // A file page with unread patches continues them first: its window
    // that finishes the patches offers the next file page.
    let patches_open = pages
        .get("patches")
        .is_some_and(|entry| entry.get("hasMore").and_then(Value::as_bool) == Some(true));
    let mut next = Map::new();
    let mut partial = false;
    for (axis, entry) in pages.iter_mut() {
        if entry.get("hasMore").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        if axis == "files" && patches_open {
            partial = true;
            continue;
        }
        partial = true;
        let Some((name, field, key)) = pr_axis(axis) else {
            continue;
        };
        let Some(cursor) = entry.get(field).cloned() else {
            continue;
        };
        let mut nq = base_public_query(q, ItemOperation::PullRequest);
        nq[key] = cursor;
        // `offset` is a single field shared by the body, review-body,
        // comment-body and patch windows. A char-window continuation
        // therefore narrows content to the surface it continues, and page
        // continuations restart every char window, so one surface's offset
        // never skews another's.
        match axis.as_str() {
            "body" => {
                // The body has no page: a section page cursor would be inert.
                nq["content"] = json!({"body":true});
                remove_key(&mut nq, "page");
            }
            "reviewBody" => nq["content"] = json!({"reviews":true}),
            "commentBody" => {
                nq["content"] = json!({"comments": q
                    .content_value()
                    .and_then(|content| content.get("comments").cloned())
                    .unwrap_or(json!({"discussion":true}))});
            }
            "patches" => {
                next.insert(name.into(), patch_continuation(nq, entry, q));
                continue;
            }
            _ => {
                remove_key(&mut nq, "offset");
                // A collection page continues only its own surface; the other
                // surfaces were already delivered on this call.
                let keep: &[&str] = match axis.as_str() {
                    "files" => &["files", "patches"],
                    "comments" => &["comments"],
                    "reviews" => &["reviews"],
                    "commits" => &["commits"],
                    _ => &[],
                };
                if !keep.is_empty()
                    && let Some(content) = nq.get_mut("content").and_then(Value::as_object_mut)
                {
                    content.retain(|key, _| keep.contains(&key.as_str()));
                }
            }
        }
        next.insert(name.into(), menu_read(nq));
    }
    if partial {
        out["isPartial"] = json!(true);
        if !next.is_empty() {
            out["next"] = Value::Object(next);
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

pub(super) fn promote_issue_continuations(out: &mut Value, q: &HistoryItemRequest) {
    let Some(pages) = out
        .pointer("/issues/0/contentPagination")
        .and_then(Value::as_object)
    else {
        return;
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
        // A comment page cut to the response budget resumes with the page
        // size that starts a page at its first unshown comment.
        if let Some(size) = entry.get("nextPageSize") {
            nq["pageSize"] = size.clone();
        }
        if axis == "comments" {
            nq["offset"] = json!(0);
        }
        next.insert(name.into(), menu_read(nq));
    }
    if !next.is_empty() {
        out["isPartial"] = json!(true);
        out["next"] = Value::Object(next);
    }
}

#[cfg(test)]
mod tests;

//! Text views of history items: the body view and its char windows, and the
//! `matchString` needle every content filter matches.
use super::util::string;
use super::{HistoryItemRequest, ItemOperation};
use crate::tools::id::ToolId;
use serde_json::{Value, json};

/// One char window of `value` and its page row.
pub(super) fn paginate_text(
    value: &str,
    offset: Option<usize>,
    length: Option<usize>,
) -> (String, Value) {
    let total = value.chars().count();
    let start = offset.unwrap_or(0).min(total);
    let len = length.unwrap_or(super::DEFAULT_TEXT_WINDOW).clamp(
        1,
        crate::contracts::query_schema_max(ToolId::GhGetHistoryItem, None, "length"),
    );
    let end = (start + len).min(total);
    let text = value.chars().skip(start).take(end - start).collect();
    (
        text,
        json!({"unit":"chars","offset":start,"length":end-start,"total":total,"hasMore":end<total,"nextOffset":(end<total).then_some(end)}),
    )
}

/// Lower-cased `matchString`, the needle every content filter matches.
pub(super) fn needle(query: &HistoryItemRequest) -> Option<String> {
    query.match_string().map(str::to_lowercase)
}

/// Whether an item's `body` contains `needle` (always true without one).
pub(super) fn body_matches(value: &Value, needle: Option<&str>) -> bool {
    needle.is_none_or(|n| string(value.get("body")).to_lowercase().contains(n))
}

/// Pull-request text is minified unless `minify:"none"` or a `matchString`
/// asks for the verbatim text.
pub(super) fn minified_view(query: &HistoryItemRequest) -> bool {
    matches!(query.operation(), ItemOperation::PullRequest)
        && query.minify().as_deref() != Some("none")
        && query.match_string().is_none()
}

/// The text view of a PR/issue body, comment or review. A minified view
/// that only reflows whitespace keeps the source text, so offsets stay
/// GitHub's own; a view that drops text is marked (`bodyView`) and has a raw
/// re-read.
pub(super) fn history_body_view(value: &str, query: &HistoryItemRequest) -> String {
    if !minified_view(query) {
        return value.to_owned();
    }
    let view = octocode_engine::portable::apply_content_view_minification(value, "history.md");
    if view_dropped_text(value, &view) {
        view
    } else {
        value.to_owned()
    }
}

/// Whether a body view dropped text: any non-whitespace character differs
/// from the raw body (whitespace-only normalization keeps every word).
pub(super) fn view_dropped_text(raw: &str, view: &str) -> bool {
    let words = |text: &str| {
        text.chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
    };
    raw != view && words(raw) != words(view)
}

/// A body window a continuation hop (`offset` > 0) finds empty: an earlier
/// window of the same page delivered the whole body (an empty one
/// included), so the hop does not list its item again.
pub(super) fn delivered_earlier(offset: Option<usize>, body_page: &Value) -> bool {
    offset.is_some_and(|offset| offset > 0)
        && body_page["length"].as_u64() == Some(0)
        && body_page["hasMore"] != true
}

/// Window one item body through the body view, remembering the first window
/// that has more text (the surface's body continuation) and whether the view
/// dropped text (`bodyView` + `next.readRawBody`).
pub(super) fn window_body(
    body: &str,
    offset: Option<usize>,
    query: &HistoryItemRequest,
    first_more: &mut Option<Value>,
    dropped: &mut bool,
) -> (String, Value) {
    let view = history_body_view(body, query);
    *dropped |= view_dropped_text(body, &view);
    let (text, page) = paginate_text(&view, offset, query.char_length());
    if page["hasMore"] == true {
        // One shared `offset` continues every cut body of the page: the
        // first cut body's page carries the chars left in all of them.
        let left = page["total"]
            .as_u64()
            .zip(page["nextOffset"].as_u64())
            .map_or(0, |(total, next)| total.saturating_sub(next));
        let first = first_more.get_or_insert_with(|| page.clone());
        let so_far = first["remainingChars"].as_u64().unwrap_or(0);
        first["remainingChars"] = json!(so_far + left);
    }
    (text, page)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_windows_are_unicode_safe() {
        let (value, page) = paginate_text("a🦀b", Some(1), Some(1));
        assert_eq!(value, "🦀");
        assert_eq!(page["nextOffset"], 2);
    }

    #[test]
    fn text_window_honours_the_contract_char_length_maximum() {
        // Contract length maximum is 100000; a valid request up to it is
        // served whole rather than silently cut to a smaller native cap.
        let body = "x".repeat(120_000);
        let (value, page) = paginate_text(&body, None, Some(100_000));
        assert_eq!(value.chars().count(), 100_000);
        assert_eq!(page["length"], 100_000);
        assert_eq!(page["nextOffset"], 100_000);
        let (clamped, _) = paginate_text(&body, None, Some(110_000));
        assert_eq!(clamped.chars().count(), 100_000);
    }

    /// Whitespace normalization is not a dropped-text view; a removed HTML
    /// comment or badge is.
    #[test]
    fn body_views_that_drop_words_are_detected() {
        assert!(!view_dropped_text("a\r\n\n\n b  ", "a\n\nb"));
        assert!(view_dropped_text("a <!-- hidden --> b", "a b"));
        let raw = "Fixes #1\n<!-- checklist: tests added -->\n[![ci](https://x/badge.svg)](https://x)\nBody";
        let pr = HistoryItemRequest::from_row(json!({
            "operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","number":1
        }))
        .expect("pr query");
        let mut first_more = None;
        let mut dropped = false;
        let (text, _) = window_body(raw, None, &pr, &mut first_more, &mut dropped);
        assert!(dropped, "{text}");
        assert!(!text.contains("checklist"), "{text}");
        let raw_pr = HistoryItemRequest::from_row(json!({
            "operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","number":1,
            "minify":"none"
        }))
        .expect("raw pr query");
        let mut dropped = false;
        let (text, _) = window_body(raw, None, &raw_pr, &mut first_more, &mut dropped);
        assert!(!dropped);
        assert_eq!(text, raw);
    }

    /// (microsoft/TypeScript#57465: seven 26–37k-char comments on one
    /// page): one shared `offset` continues every cut body of a page, so
    /// the page's body entry counts the chars left in all of them, not only
    /// in the first cut one.
    #[test]
    fn cut_bodies_of_one_page_count_every_remaining_char() {
        let pr = HistoryItemRequest::from_row(json!({
            "operation":"pullRequest","owner":"o","repo":"r","number":1,"minify":"none","length":10
        }))
        .expect("pr query");
        let mut first_more = None;
        let mut dropped = false;
        for body in ["a".repeat(25), "b".repeat(5), "c".repeat(40)] {
            window_body(&body, None, &pr, &mut first_more, &mut dropped);
        }
        let page = first_more.expect("a cut body");
        assert_eq!(page["nextOffset"], 10, "{page}");
        assert_eq!(page["remainingChars"], 15 + 30, "{page}");
    }

    /// A view that only reflows whitespace keeps the body verbatim, so body    /// A view that only reflows whitespace keeps the body verbatim, so body
    /// offsets are GitHub's own character offsets.
    #[test]
    fn whitespace_only_views_keep_the_source_text() {
        let pr = HistoryItemRequest::from_row(json!({
            "operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","number":1
        }))
        .expect("pr query");
        let raw = "Intro  \r\n\n\n\nDetails\n\n\n- item\n";
        assert_eq!(history_body_view(raw, &pr), raw);
        let mut first_more = None;
        let mut dropped = false;
        let (text, page) = window_body(raw, None, &pr, &mut first_more, &mut dropped);
        assert_eq!(text, raw);
        assert_eq!(page["total"], raw.chars().count());
        assert!(!dropped);
    }
}

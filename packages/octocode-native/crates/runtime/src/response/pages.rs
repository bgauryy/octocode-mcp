//! The page contract every tool shares: one pagination block shape, the
//! unfinished-result disclosure, the stale-snapshot restart, and the facts
//! that tell whether a row has more to read.
//!
//! A row whose `next` holds pages that leave a counted rest shows no
//! warning for it: its `pagination` blocks and `next` already say where it
//! stands and what continues. The one exception is a split row whose pages
//! moved to the response pager, which a part names once in `warnings`
//! (`7 more changed files (next.nextFilePage on the row's last part)`) because its own `next`
//! no longer carries them. The counts come from the row's pagination facts,
//! noted as data ([`Remaining`]) before extras pruning ([`note_remaining`]);
//! the stage takes them off the rows ([`take_remaining_notes`]) and the
//! pager words the moved ones ([`redisclose`]). `partialReasons` say why a
//! row is partial, never how much is left.

use serde_json::{Map, Value, json};

use super::channels::PAGES_KEY;
use crate::tools::id::ToolId;

const WARNINGS: &str = "warnings";

/// The row key that carries the engine's [`Remaining`] notes until the
/// stage renders them; never public.
const REMAINING: &str = "remaining";

/// A page of a row that leaves a counted rest to read: the page's `next`
/// name and what is left (`17 more files`), as data.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Remaining {
    pub page: String,
    pub left: String,
}

/// Notes on `row` every page of its data that `tool` leaves remaining with
/// a counted rest. Runs before extras pruning, while the pagination facts
/// are still on the row.
pub(crate) fn note_remaining(row: &mut Value, tool: ToolId) {
    let notes = remaining_notes(row, tool);
    if let Some(data) = row.get_mut("data") {
        strip_working_counts(data);
    }
    if !notes.is_empty()
        && let Some(object) = row.as_object_mut()
    {
        object.insert(
            REMAINING.to_owned(),
            serde_json::to_value(notes).unwrap_or_default(),
        );
    }
}

/// Counts a tool keeps on a `pagination`/`contentPagination` entry only for
/// the notes above: the contract's strict windows do not declare them.
const WORKING_COUNTS: [&str; 4] = [
    "remainingChars",
    "remainingItems",
    "nextPageSize",
    "unfinishedFiles",
];

/// Drops [`WORKING_COUNTS`] from every pagination entry of `value`, once the
/// notes have read them.
fn strip_working_counts(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                match (key.as_str(), child) {
                    ("pagination", Value::Object(entry)) => {
                        WORKING_COUNTS.iter().for_each(|name| {
                            entry.remove(*name);
                        });
                    }
                    ("contentPagination", Value::Object(axes)) => {
                        for entry in axes.values_mut().filter_map(Value::as_object_mut) {
                            WORKING_COUNTS.iter().for_each(|name| {
                                entry.remove(*name);
                            });
                        }
                    }
                    (_, child) => strip_working_counts(child),
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(strip_working_counts),
        _ => {}
    }
}

fn remaining_notes(row: &Value, tool: ToolId) -> Vec<Remaining> {
    match row.get("data").and_then(Value::as_object) {
        Some(data) if !is_complete(&row["data"]) => {
            remaining_pages(data, |name| crate::tools::id::is_remaining(tool, name))
        }
        _ => Vec::new(),
    }
}

/// Every page of `data` that `remains` and counts its rest.
fn remaining_pages(data: &Map<String, Value>, remains: impl Fn(&str) -> bool) -> Vec<Remaining> {
    let Some(Value::Object(pages)) = data.get(PAGES_KEY) else {
        return Vec::new();
    };
    pages
        .iter()
        .filter(|(name, _)| remains(name))
        .filter_map(|(name, call)| match remaining(data, name, call) {
            Left::Counted(left) => Some(Remaining {
                page: name.clone(),
                left,
            }),
            Left::Done | Left::Unknown => None,
        })
        .collect()
}

/// Takes every result row's notes off the rows, returned by row position
/// for the pager. A whole row renders nothing: its visible `pagination` and
/// `next` already carry what is left. Only a split row's moved pages are
/// worded ([`redisclose`]).
pub(crate) fn take_remaining_notes(structured: &mut Value) -> Vec<Vec<Remaining>> {
    structured
        .get_mut("results")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
        .map(|row| {
            row.as_object_mut()
                .and_then(|object| object.remove(REMAINING))
                .and_then(|notes| serde_json::from_value(notes).ok())
                .unwrap_or_default()
        })
        .collect()
}

/// The one `warnings` entry for the pages a split moved to the response
/// pager: `17 more files (next.nextPage on the row's last part)`. A moved continuation is
/// the one thing the part's own `pagination` and `next` cannot say. Lines
/// that read the same appear once.
fn render_moved(notes: &[Remaining], moved: &[String]) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    for note in notes.iter().filter(|note| moved.contains(&note.page)) {
        let part = format!(
            "{} ({PAGES_KEY}.{} on the row's last part)",
            note.left, note.page
        );
        if !parts.contains(&part) {
            parts.push(part);
        }
    }
    (!parts.is_empty()).then(|| parts.join("; "))
}

/// Appends `entry` to the row's warnings and moves them to the front.
fn lead_with(data: &mut Map<String, Value>, entry: String) {
    let warnings = match data.shift_remove(WARNINGS) {
        Some(Value::Array(mut warnings)) => {
            warnings.push(Value::String(entry));
            warnings
        }
        _ => vec![Value::String(entry)],
    };
    data.shift_insert(0, WARNINGS.to_owned(), Value::Array(warnings));
}

/// One part of a split row: names the response page for every page the
/// split `moved` to another part, so a part never points at a continuation
/// it does not carry.
pub(crate) fn redisclose(data: &mut Map<String, Value>, notes: &[Remaining], moved: &[String]) {
    if let Some(entry) = render_moved(notes, moved) {
        lead_with(data, entry);
    }
}

/// The content axis (`contentPagination.<axis>` of an item read) a page
/// continues. On an item read `nextFilePage` pages the changed files. The
/// contract classifies page names into channels only and declares the
/// `contentPagination` axes as output fields with no link to the page that
/// continues them, so this is the one table of that link.
fn content_axis(page: &str, data: &Map<String, Value>) -> Option<&'static str> {
    Some(match page {
        "continueBody" => "body",
        "continueReviewBody" => "reviewBody",
        "continueCommentBody" => "commentBody",
        "continuePatch" => "patches",
        "nextFilePage" if content_entry(data, "files").is_some() => "files",
        "nextCommentPage" => "comments",
        "nextReviewPage" => "reviews",
        "nextCommitPage" => "commits",
        _ => return None,
    })
}

/// What a page has left to show.
enum Left {
    /// Its pagination counts what is left.
    Counted(String),
    /// More is left, by an unknown amount.
    Unknown,
    /// Its pagination says nothing is left.
    Done,
}

impl Left {
    fn of(entry: &Value, count: Option<String>) -> Self {
        match count {
            Some(count) => Self::Counted(count),
            None if has_more(entry) => Self::Unknown,
            None => Self::Done,
        }
    }
}

/// What page `name` (continuation `call`) has left to show, from the row's
/// pagination facts.
fn remaining(data: &Map<String, Value>, name: &str, call: &Value) -> Left {
    if let Some(axis) = content_axis(name, data) {
        let Some(entry) = content_entry(data, axis) else {
            return Left::Unknown;
        };
        if !has_more(entry) {
            return Left::Done;
        }
        let count = if axis == "patches" {
            patches_left(entry)
        } else {
            axis_left(axis, entry)
        };
        return Left::of(entry, count);
    }
    match name {
        // A commit or comparison pages its changed files apart from its
        // commit `pagination`.
        "nextFilePage" if data.contains_key("filePagination") => {
            let entry = &data["filePagination"];
            Left::of(entry, axis_left("files", entry))
        }
        "nextMatchPage" => matches_left(data).map_or(Left::Unknown, |left| {
            Left::Counted(more(left, "match", "matches"))
        }),
        "nextPage" | "nextFilePage" | "continueWindow" => {
            let Some(pagination) = data.get("pagination") else {
                return Left::Unknown;
            };
            let facts = with_page_facts(pagination, call);
            Left::of(pagination, row_left(&facts, data, call))
        }
        _ => Left::Unknown,
    }
}

/// Matches left after the shown match page of every file on the page, from
/// each file's own `pagination`.
fn matches_left(data: &Map<String, Value>) -> Option<u64> {
    let left: u64 = data
        .values()
        .filter_map(Value::as_array)
        .flatten()
        .filter_map(|item| item.get("pagination"))
        .filter(|pagination| has_more(pagination))
        .filter_map(items_left)
        .sum();
    (left > 0).then_some(left)
}

/// `contentPagination.<axis>` of the row, or of the first item that carries
/// one (a read returns its item in a one-element list).
fn content_entry<'a>(data: &'a Map<String, Value>, axis: &str) -> Option<&'a Value> {
    let entry = |value: &'a Value| value.get("contentPagination")?.get(axis);
    data.get("contentPagination")
        .and_then(|pages| pages.get(axis))
        .or_else(|| {
            data.values()
                .filter_map(Value::as_array)
                .flatten()
                .find_map(entry)
        })
}

fn has_more(entry: &Value) -> bool {
    entry.get("hasMore").and_then(Value::as_bool) == Some(true)
}

fn number(entry: &Value, keys: &[&str]) -> Option<(u64, usize)> {
    keys.iter()
        .enumerate()
        .find_map(|(index, key)| entry.get(*key)?.as_u64().map(|value| (value, index)))
}

pub(crate) fn counted(count: u64, singular: &str, plural: &str) -> String {
    format!("{count} {}", if count == 1 { singular } else { plural })
}

/// The first `limit` of `names` joined with `, `, then the count of the
/// rest: `a, b, +3 more`.
pub(crate) fn first_named(names: impl IntoIterator<Item = String>, limit: usize) -> String {
    let mut names = names.into_iter();
    let mut shown = names.by_ref().take(limit).collect::<Vec<_>>();
    let rest = names.count();
    if rest > 0 {
        shown.push(format!("+{rest} more"));
    }
    shown.join(", ")
}

pub(crate) fn more(count: u64, singular: &str, plural: &str) -> String {
    format!(
        "{count} more {}",
        if count == 1 { singular } else { plural }
    )
}

/// Items left after the current page: the page's own `remainingItems`
/// (a page that does not tile `currentPage × pageSize`), else
/// `totalItems - currentPage * pageSize`.
fn items_left(entry: &Value) -> Option<u64> {
    if let Some((left, _)) = number(entry, &["remainingItems"]) {
        return (left > 0).then_some(left);
    }
    let (total, _) = number(entry, &["totalItems"])?;
    let (per, _) = number(entry, &["pageSize"])?;
    let (current, _) = number(entry, &["currentPage"])?;
    let left = total.checked_sub(current.checked_mul(per)?)?;
    (left > 0).then_some(left)
}

/// Chars left after the shown window: the entry's own `remainingChars`
/// (one window over several bodies), else `total - nextOffset`.
fn chars_left(entry: &Value) -> Option<u64> {
    if let Some((left, _)) = number(entry, &["remainingChars"]) {
        return (left > 0).then_some(left);
    }
    let (total, _) = number(entry, &["total"])?;
    let (offset, _) = number(entry, &["nextOffset"])?;
    total.checked_sub(offset).filter(|left| *left > 0)
}

/// A pull request's unfinished patches: `continuePatch` reads every
/// unfinished file of the page (the cut one first), so it counts them all.
fn patches_left(entry: &Value) -> Option<String> {
    if !has_more(entry) {
        return None;
    }
    match number(entry, &["unfinishedFiles"]).filter(|(n, _)| *n > 0) {
        Some((files, _)) => Some(counted(files, "unfinished patch", "unfinished patches")),
        None => chars_left(entry).map(|left| format!("{left} more patch chars")),
    }
}

fn axis_left(axis: &str, entry: &Value) -> Option<String> {
    if !has_more(entry) {
        return None;
    }
    match axis {
        "body" | "reviewBody" | "commentBody" => {
            let label = match axis {
                "body" => "body",
                "reviewBody" => "review body",
                _ => "comment body",
            };
            chars_left(entry).map(|left| format!("{left} more {label} chars"))
        }
        _ => {
            let (singular, plural) = match axis {
                "files" => ("changed file", "changed files"),
                "comments" => ("comment", "comments"),
                "reviews" => ("review", "reviews"),
                _ => ("commit", "commits"),
            };
            items_left(entry).map(|left| more(left, singular, plural))
        }
    }
}

/// A row `pagination` with the facts a tool left only in its page call
/// (deduplicated): the shown page is the queried page minus one, and the
/// page size is the queried one, else the contract default the call omits.
fn with_page_facts(pagination: &Value, call: &Value) -> Value {
    let mut facts = pagination.clone();
    let (Some(object), Some(query)) = (
        facts.as_object_mut(),
        crate::tools::result::continuation_row(call),
    ) else {
        return facts;
    };
    if !object.contains_key("currentPage")
        && let Some(page) = query.get("page").and_then(Value::as_u64)
    {
        object.insert("currentPage".into(), Value::from(page.saturating_sub(1)));
    }
    if !object.contains_key("pageSize")
        && let Some(size) = query
            .get("pageSize")
            .and_then(Value::as_u64)
            .or_else(|| default_page_size(call, query))
    {
        object.insert("pageSize".into(), Value::from(size));
    }
    facts
}

/// What one item of a listing is, by its list key.
const NOUNS: [(&str, (&str, &str)); 8] = [
    ("files", ("file", "files")),
    ("matches", ("match", "matches")),
    ("symbols", ("symbol", "symbols")),
    ("repositories", ("repository", "repositories")),
    ("pullRequests", ("pull request", "pull requests")),
    ("issues", ("issue", "issues")),
    ("commits", ("commit", "commits")),
    ("artifacts", ("artifact", "artifacts")),
];

/// The contract's default `pageSize` for the continued tool and operation.
fn default_page_size(call: &Value, query: &Value) -> Option<u64> {
    let tool = ToolId::from_name(call.get("tool")?.as_str()?)?;
    let operation = query.get("operation").and_then(Value::as_str);
    crate::contracts::query_schema_number(tool, operation, "pageSize", "default")
}

/// A row-level `pagination`: lines or chars left in a read (its total from
/// the pagination, else from the row), items left in a listing, or else whole
/// pages left.
fn row_left(pagination: &Value, data: &Map<String, Value>, call: &Value) -> Option<String> {
    if !has_more(pagination) {
        return None;
    }
    if let Some((offset, _)) = number(pagination, &["nextOffset"]) {
        // A window states its view's `total` in its unit; a line window omits
        // it when the view is the whole file, which `data.totalLines` sizes.
        let (fallback, singular, plural) = match pagination.get("unit").and_then(Value::as_str) {
            Some("bytes") => (None, "byte", "bytes"),
            Some("chars") => (None, "char", "chars"),
            // A symbols view pages its outline, not the source.
            _ if data.get("contentView").and_then(Value::as_str) == Some("symbols") => {
                (Some("totalLines"), "outline line", "outline lines")
            }
            _ => (Some("totalLines"), "line", "lines"),
        };
        let total = pagination
            .get("total")
            .or_else(|| data.get(fallback?))
            .and_then(Value::as_u64)?;
        let left = total.checked_sub(offset).filter(|left| *left > 0)?;
        return Some(more(left, singular, plural));
    }
    if let Some(left) = items_left(pagination) {
        // The continued operation, else the row's list, names what a page
        // holds.
        let operation = crate::tools::result::continuation_row(call)
            .and_then(|query| query.get("operation"))
            .and_then(Value::as_str);
        let (singular, plural) = NOUNS
            .into_iter()
            .find(|(key, _)| operation == Some(*key))
            .or_else(|| NOUNS.into_iter().find(|(key, _)| data.contains_key(*key)))
            .map_or(("item", "items"), |(_, nouns)| nouns);
        return Some(more(left, singular, plural));
    }
    let (pages, _) = number(pagination, &["totalPages"])?;
    let (current, _) = number(pagination, &["currentPage"])?;
    let left = pages.checked_sub(current).filter(|left| *left > 0)?;
    Some(more(left, "page", "pages"))
}

/// The one text of a stale snapshot, whichever tool's cursor went stale.
pub const STALE_SNAPSHOT_ERROR: &str = "The source or the query changed since the earlier pages; nothing shown remains valid, start over.";

/// A stale-snapshot row ends the page: the shared text, no `isPartial` and no
/// `hasMore` (nothing of the shown result remains to read), no continuation
/// but `next.restart`, which the tool built or is page 1 of the same query
/// without its snapshot and page cursors.
pub(super) fn restart_stale(tool: ToolId, query: &Value, data: &mut Value) {
    let Some(object) = data.as_object_mut() else {
        return;
    };
    object.insert("error".into(), json!(STALE_SNAPSHOT_ERROR));
    object.remove("isPartial");
    for (key, block) in object.iter_mut() {
        if is_pagination_key(key)
            && let Some(block) = block.as_object_mut()
            && block.contains_key("hasMore")
        {
            block.insert("hasMore".into(), json!(false));
        }
    }
    if let Some(next) = object.get_mut("next").and_then(Value::as_object_mut) {
        next.retain(|kind, _| kind == "restart");
    }
    ensure_restart(tool, query, object);
}

/// `next.restart` when the tool built none: page 1 of the same query,
/// without its snapshot and page cursors.
fn ensure_restart(tool: ToolId, query: &Value, object: &mut Map<String, Value>) {
    if object
        .get("next")
        .and_then(Value::as_object)
        .is_some_and(|next| next.keys().any(|name| crate::tools::id::is_restart(name)))
    {
        return;
    }
    let Some(row) = query.as_object() else {
        return;
    };
    let is_cursor = |key: &str| {
        matches!(key, "snapshot" | "page" | "offset")
            || ["Snapshot", "Page", "Offset"]
                .iter()
                .any(|suffix| key.ends_with(suffix))
    };
    let row: Map<String, Value> = row
        .iter()
        .filter(|(key, _)| !is_cursor(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    let restart = crate::tools::result::Continuation::new(tool, Value::Object(row)).build();
    match object.entry("next").or_insert_with(|| json!({})) {
        Value::Object(next) => {
            next.insert("restart".into(), restart);
        }
        other => *other = json!({ "restart": restart }),
    }
}

/// A page past the end is one outcome on every tool: the row is empty, its
/// `reason` names the page and the page count (`page 99 of 4`), and
/// `next.restart` re-asks the query from page 1. A tool flags it with
/// `outOfRange` on its `pagination` block or a named one
/// (`filePagination`). Returns whether `data` was such a page.
pub(super) fn settle_out_of_range(tool: ToolId, query: &Value, data: &mut Value) -> bool {
    let Some(object) = data.as_object_mut() else {
        return false;
    };
    let Some(pagination) = object
        .iter()
        .find(|(key, block)| is_pagination_key(key) && block["outOfRange"] == true)
        .map(|(_, block)| block)
    else {
        return false;
    };
    let reason = match (
        pagination.get("currentPage").and_then(Value::as_u64),
        pagination.get("totalPages").and_then(Value::as_u64),
    ) {
        (Some(page), Some(pages)) => format!("page {page} of {pages}"),
        (Some(page), None) => format!("page {page} is past the last page"),
        _ => "page is past the last page".to_owned(),
    };
    object.entry("reason").or_insert(json!(reason));
    // No page is left to read: a tool's partial signals would only restate
    // the outcome `reason` and `next.restart` already carry.
    for signal in ["isPartial", "terminalLimit", "partialReasons"] {
        object.remove(signal);
    }
    ensure_restart(tool, query, object);
    true
}

/// One page's facts. Every tool builds its `pagination` block from these
/// (never a hand-written JSON block), so the key set and order are the same
/// on every tool and every page: `currentPage`, `totalPages` and
/// `totalItems` when the total is known, `pageSize` when pages are cut by
/// count, `hasMore`, and `outOfRange` on a page past the end. `totalItems`
/// counts the paged unit only (the rows the pages split), never another
/// count of the same result. Tool-specific facts (`countScope`, cursors the
/// stage moves to `next`) follow on the block the caller extends.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PageFacts {
    page: usize,
    page_size: Option<usize>,
    total_items: Option<usize>,
    total_pages: Option<usize>,
    has_more: bool,
    out_of_range: bool,
}

impl PageFacts {
    /// A count-cut page of a known total: the page count and `hasMore`
    /// follow from it.
    pub(crate) fn counted(page: usize, page_size: usize, total_items: usize) -> Self {
        let page = page.max(1);
        let size = page_size.max(1);
        Self {
            page,
            page_size: Some(size),
            total_items: Some(total_items),
            total_pages: Some(total_items.div_ceil(size).max(1)),
            has_more: page.saturating_mul(size) < total_items,
            out_of_range: false,
        }
    }

    /// A page whose total is unknown (a provider that does not count, or a
    /// walk that stops early): only the cursor facts.
    pub(crate) fn open(page: usize, page_size: Option<usize>, has_more: bool) -> Self {
        Self {
            page: page.max(1),
            page_size,
            total_items: None,
            total_pages: None,
            has_more,
            out_of_range: false,
        }
    }

    /// A page cut by size (bytes, a response budget), not by count: the
    /// pager states the page count and the total of the paged unit.
    pub(crate) fn sized(
        page: usize,
        total_pages: usize,
        total_items: usize,
        has_more: bool,
    ) -> Self {
        Self {
            page: page.max(1),
            page_size: None,
            total_items: Some(total_items),
            total_pages: Some(total_pages.max(1)),
            has_more,
            out_of_range: false,
        }
    }

    /// The same page with a known total of the paged unit.
    pub(crate) fn with_total(mut self, total_items: usize) -> Self {
        self.total_items = Some(total_items);
        if let Some(size) = self.page_size {
            self.total_pages = Some(total_items.div_ceil(size.max(1)).max(1));
        }
        self
    }

    /// The same page with a partial count of the paged unit (items loaded
    /// so far, a provider's capped total): no page count follows from it.
    pub(crate) fn with_items(mut self, total_items: usize) -> Self {
        self.total_items = Some(total_items);
        self
    }

    /// The same size-cut page with the caller's requested page size.
    pub(crate) fn with_page_size(mut self, page_size: usize) -> Self {
        self.page_size = Some(page_size);
        self
    }

    /// The same page, flagged as requested past the end (`outOfRange`).
    pub(crate) fn out_of_range(mut self, past_end: bool) -> Self {
        self.out_of_range = past_end;
        self
    }

    /// Whether a later page holds more.
    pub(crate) fn has_more(self) -> bool {
        self.has_more
    }

    /// The `pagination` block.
    pub(crate) fn to_value(self) -> Value {
        let mut block = Map::new();
        block.insert("currentPage".into(), json!(self.page));
        if let Some(pages) = self.total_pages {
            block.insert("totalPages".into(), json!(pages));
        }
        if let Some(size) = self.page_size {
            block.insert("pageSize".into(), json!(size));
        }
        if let Some(total) = self.total_items {
            block.insert("totalItems".into(), json!(total));
        }
        block.insert("hasMore".into(), json!(self.has_more));
        if self.out_of_range {
            block.insert("outOfRange".into(), json!(true));
        }
        Value::Object(block)
    }
}

/// One count-cut page of an in-memory list. A page past the end is empty,
/// terminal and flagged `outOfRange`, never clamped to the last page, which
/// would repeat rows the caller already has.
pub(crate) fn slice_page<T: Clone>(
    items: &[T],
    page: usize,
    page_size: usize,
) -> (Vec<T>, PageFacts) {
    let (window, facts) = page_window(items.len(), page, page_size);
    (items[window].to_vec(), facts)
}

/// The index range of one count-cut page over `len` items, and its facts
/// (see [`slice_page`]); a page past the end is an empty range.
pub(crate) fn page_window(
    len: usize,
    page: usize,
    page_size: usize,
) -> (std::ops::Range<usize>, PageFacts) {
    let page = page.max(1);
    let size = page_size.max(1);
    let facts = PageFacts::counted(page, size, len);
    let past_end = facts.total_pages.is_some_and(|pages| page > pages);
    let start = (page - 1).saturating_mul(size).min(len);
    let end = start.saturating_add(size).min(len);
    (start..end, facts.out_of_range(past_end))
}

/// Cursor keys a tool's pagination block carries to the response stage,
/// which moves them onto `next` (see [`slim_pagination`]).
const CURSOR_KEYS: [&str; 3] = ["nextPage", "snapshot", "resultId"];

/// One pagination block, one shape for every tool and page: where the page
/// stands, its size, what is known of the total and whether more exists.
/// The cursor (`nextPage`, `snapshot`, `resultId`) rides `next`; a false
/// cap flag asserts nothing, and a true one repeats `providerLimit`.
pub(super) fn slim_pagination(block: &mut Map<String, Value>, limited: bool) {
    for key in CURSOR_KEYS {
        block.remove(key);
    }
    match block.get("totalItemsCapped").and_then(Value::as_bool) {
        Some(false) => {
            block.remove("totalItemsCapped");
        }
        Some(true) if limited => {
            block.remove("totalItemsCapped");
        }
        _ => {}
    }
}

/// Whether `key` is a pagination block: the shared output fields
/// `pagination`, `contentPagination` and `responsePagination` share the
/// suffix by the contract's naming convention; the contract lists no such
/// keys, so the convention is the rule.
pub(super) fn is_pagination_key(key: &str) -> bool {
    key == "pagination" || key.ends_with("Pagination")
}

/// A row that states `coverage.state: "complete"` lists everything in its scope: any
/// `next.*` it carries is a drill-down, not unread rest.
#[must_use]
pub fn is_complete(data: &Value) -> bool {
    data.pointer("/coverage/state").and_then(Value::as_str) == Some("complete")
}

pub fn is_partial(data: &Value) -> bool {
    tree_some(data, &|map| {
        map.get("isPartial") == Some(&Value::Bool(true))
            || map.get("hasMore") == Some(&Value::Bool(true))
            || bounded(map)
    })
}

/// Whether `value` offers, under any `next` (never inside a call), a page
/// that leaves more of this result to read ([`crate::tools::id::is_remaining`]).
#[must_use]
pub fn has_remaining_page(tool: ToolId, value: &Value) -> bool {
    has_call(value, &|name| crate::tools::id::is_remaining(tool, name))
}

/// Whether `value` holds, at any depth, an executable `{tool, query}` call
/// under a key `name_matches` accepts.
fn has_call(value: &Value, name_matches: &impl Fn(&str) -> bool) -> bool {
    match value {
        Value::Object(map) => {
            if super::rows::has_executable_call(value) {
                return false;
            }
            map.iter().any(|(key, child)| {
                (name_matches(key) && super::rows::has_executable_call(child))
                    || has_call(child, name_matches)
            })
        }
        Value::Array(array) => array.iter().any(|v| has_call(v, name_matches)),
        _ => false,
    }
}

/// Codes of a partial row: a terminal limit, or a continuation missing.
pub(super) fn pagination_codes(data: &Value) -> Vec<String> {
    if tree_some(data, &|m| {
        m.get("terminalLimit") == Some(&Value::Bool(true))
    }) {
        return vec!["terminalLimitReached".into()];
    }
    let pageable = tree_some(data, &|m| m.get("hasMore") == Some(&Value::Bool(true)));
    let partial = tree_some(data, &|m| m.get("isPartial") == Some(&Value::Bool(true)));
    let page = has_call(data, &crate::tools::id::resumes_after_shown);
    let expansion = has_call(data, &|name| !crate::tools::id::resumes_after_shown(name));
    if (pageable && !page)
        || ((tree_some(data, &bounded) || partial) && !page && !expansion)
        || clipped_value_unreached(data)
    {
        vec!["continuationMissing".into()]
    } else {
        vec![]
    }
}

/// Whether a value clipped inside a file row (`truncated:true` under a row
/// with a `path`) has no continuation reaching it: neither a read or
/// expansion of that file nor one that widens values (`matchContentLength`).
/// Page continuations (`next*`, `continue*`) list more rows and never widen a
/// shown one.
fn clipped_value_unreached(data: &Value) -> bool {
    fn clipped_paths<'a>(value: &'a Value, path: Option<&'a str>, out: &mut Vec<&'a str>) {
        match value {
            Value::Object(map) => {
                let path = map.get("path").and_then(Value::as_str).or(path);
                if map.get("truncated") == Some(&Value::Bool(true))
                    && let Some(path) = path
                {
                    out.push(path);
                }
                for (key, child) in map {
                    if key != "next" {
                        clipped_paths(child, path, out);
                    }
                }
            }
            Value::Array(items) => items.iter().for_each(|item| clipped_paths(item, path, out)),
            _ => {}
        }
    }
    fn reaching<'a>(value: &'a Value, paths: &mut Vec<&'a str>, widened: &mut bool) {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    if let Some(query) =
                        crate::tools::result::continuation_row(child).and_then(Value::as_object)
                        && child.get("tool").is_some_and(Value::is_string)
                        && !crate::tools::id::resumes_after_shown(key)
                    {
                        *widened |= query.contains_key("matchContentLength");
                        if let Some(path) = query.get("path").and_then(Value::as_str) {
                            paths.push(path);
                        }
                    }
                    reaching(child, paths, widened);
                }
            }
            Value::Array(items) => items.iter().for_each(|item| reaching(item, paths, widened)),
            _ => {}
        }
    }
    let mut clipped = Vec::new();
    clipped_paths(data, None, &mut clipped);
    if clipped.is_empty() {
        return false;
    }
    let (mut targets, mut widened) = (Vec::new(), false);
    reaching(data, &mut targets, &mut widened);
    // Rows name files absolutely here; a continuation keeps the caller's
    // (workspace-relative) spelling of the same file.
    let same_file = |row: &str, target: &str| {
        let target = target.trim_start_matches("./");
        row == target
            || row
                .strip_suffix(target)
                .is_some_and(|prefix| prefix.ends_with('/'))
    };
    !widened
        && clipped
            .iter()
            .any(|path| !targets.iter().any(|target| same_file(path, target)))
}

fn tree_some(value: &Value, predicate: &impl Fn(&Map<String, Value>) -> bool) -> bool {
    match value {
        Value::Object(map) => predicate(map) || map.values().any(|v| tree_some(v, predicate)),
        Value::Array(array) => array.iter().any(|v| tree_some(v, predicate)),
        _ => false,
    }
}

fn bounded(record: &Map<String, Value>) -> bool {
    [
        "truncated",
        "capReached",
        "capped",
        "capturesTruncated",
        "totalItemsCapped",
        "incompleteTree",
        "possiblyTruncated",
        "truncatedByDepth",
        "truncatedByBudget",
    ]
    .iter()
    .any(|key| record.get(*key) == Some(&Value::Bool(true)))
        || record
            .get("partialTreeFailures")
            .and_then(Value::as_array)
            .is_some_and(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{PageFacts, Remaining, note_remaining, redisclose, take_remaining_notes};
    use crate::tools::id::ToolId;
    use serde_json::{Value, json};

    fn page(tool: &str) -> Value {
        json!({"tool": tool, "query": {"queries":[{"page": 2}]}})
    }

    /// The row as the engine notes it and the stage takes it: no warning is
    /// added (the visible pagination and `next` carry the counts), and the
    /// returned data leads with one `warnings` entry that words each note as
    /// `<left> (next.<page>)`, so the counting rules stay asserted.
    fn disclosed(data: Value) -> Value {
        let mut row = json!({"index": 0, "data": data});
        note_remaining(&mut row, ToolId::LocalSearch);
        let before = row["data"].clone();
        let mut structured = json!({"results": [row]});
        let notes = take_remaining_notes(&mut structured);
        let row = &structured["results"][0];
        assert!(row.get(super::REMAINING).is_none(), "{row}");
        assert_eq!(row["data"], before, "a whole row words no remaining note");
        let mut data = structured["results"][0]["data"].clone();
        if !notes[0].is_empty() {
            let entry = notes[0]
                .iter()
                .map(|note| format!("{} (next.{})", note.left, note.page))
                .collect::<Vec<_>>()
                .join("; ");
            let mut warnings = data["warnings"].as_array().cloned().unwrap_or_default();
            warnings.push(json!(entry));
            data["warnings"] = json!(warnings);
        }
        data
    }

    #[test]
    fn a_pull_request_page_counts_every_remaining_page() {
        let data = disclosed(json!({
            "pullRequests": [{"number": 1, "contentPagination": {
                "patches": {"hasMore": true, "unfinishedFiles": 12},
                "files": {"currentPage": 1, "pageSize": 30, "totalItems": 37,
                    "hasMore": true, "nextPage": 2}
            }}],
            "isPartial": true,
            "next": {
                "continuePatch": page("ghGetHistoryItem"),
                "nextFilePage": page("ghGetHistoryItem")
            }
        }));
        assert_eq!(
            data["warnings"],
            json!([
                "12 unfinished patches (next.continuePatch); 7 more changed files (next.nextFilePage)"
            ]),
            "{data}"
        );
        assert!(
            data["next"]["continuePatch"].is_object(),
            "pages stay: {data}"
        );
    }

    #[test]
    fn one_patch_page_counts_every_unfinished_file() {
        let warnings = disclosed(json!({
            "pullRequests": [{"number": 1, "contentPagination": {
                "patches": {"hasMore": true, "unfinishedFiles": 1}}}],
            "next": {"continuePatch": page("ghGetHistoryItem")}
        }))["warnings"]
            .clone();
        assert_eq!(warnings, json!(["1 unfinished patch (next.continuePatch)"]));
    }

    #[test]
    fn listings_reads_and_bodies_count_what_is_left() {
        let listing = disclosed(json!({
            "files": [{"path": "a"}],
            "pagination": {"currentPage": 1, "totalPages": 2, "totalItems": 2, "hasMore": true},
            "warnings": ["Regex trap."],
            "next": {"nextPage": page("localSearch")}
        }));
        assert_eq!(
            listing["warnings"],
            json!(["Regex trap.", "1 more page (next.nextPage)"]),
            "{listing}"
        );
        let files = disclosed(json!({
            "files": [{"path": "a"}],
            "pagination": {"currentPage": 1, "totalPages": 7, "pageSize": 3,
                "totalItems": 20, "hasMore": true},
            "next": {"nextPage": page("localSearch")}
        }));
        assert_eq!(files["warnings"], json!(["17 more files (next.nextPage)"]));
        let deduplicated = disclosed(json!({
            "commits": [{"sha": "a"}],
            "pagination": {"totalItems": 99, "totalPages": 20, "hasMore": true},
            "next": {"nextPage": {"tool": "ghSearchHistory",
                "query": {"queries":[{"keywords": ["miri"], "page": 2, "pageSize": 5}]}}}
        }));
        assert_eq!(
            deduplicated["warnings"],
            json!(["94 more commits (next.nextPage)"])
        );
        assert!(deduplicated["pagination"].get("currentPage").is_none());
        let search = disclosed(json!({
            "pullRequests": [{"number": 1}],
            "pagination": {"currentPage": 1, "pageSize": 10, "totalItems": 25, "hasMore": true},
            "next": {"nextPage": page("ghSearchHistory")}
        }));
        assert_eq!(
            search["warnings"],
            json!(["15 more pull requests (next.nextPage)"])
        );
        let read = disclosed(json!({
            "content": "1\tx",
            "pagination": {"unit": "lines", "offset": 0, "length": 381,
                "total": 386, "hasMore": true, "nextOffset": 381},
            "next": {"continueWindow": page("localFetch")}
        }));
        assert_eq!(
            read["warnings"],
            json!(["5 more lines (next.continueWindow)"])
        );
        let whole = disclosed(json!({
            "path": "a.py",
            "totalLines": 3137,
            "next": {"continueWindow": page("localFetch")},
            "pagination": {"unit": "lines", "offset": 0, "length": 471,
                "hasMore": true, "nextOffset": 471},
            "isPartial": true
        }));
        assert_eq!(
            whole["warnings"],
            json!(["2666 more lines (next.continueWindow)"])
        );
        // A symbols view pages outline lines, not source lines.
        let outline = disclosed(json!({
            "path": "a.rs",
            "contentView": "symbols",
            "content": "1\tfn a()",
            "pagination": {"unit": "lines", "offset": 0, "length": 40,
                "total": 52, "hasMore": true, "nextOffset": 40},
            "next": {"continueWindow": page("localFetch")}
        }));
        assert_eq!(
            outline["warnings"],
            json!(["12 more outline lines (next.continueWindow)"])
        );
        let bytes = disclosed(json!({
            "content": "x",
            "pagination": {"unit": "bytes", "offset": 0, "length": 100,
                "total": 250, "hasMore": true, "nextOffset": 100},
            "next": {"continueWindow": page("localFetch")}
        }));
        assert_eq!(
            bytes["warnings"],
            json!(["150 more bytes (next.continueWindow)"])
        );
        let issue = disclosed(json!({
            "issues": [{"number": 3, "contentPagination": {"body": {"offset": 0,
                "unit": "chars", "length": 12000, "total": 14366, "hasMore": true,
                "nextOffset": 12000}}}],
            "next": {"continueBody": page("ghGetHistoryItem")}
        }));
        assert_eq!(
            issue["warnings"],
            json!(["2366 more body chars (next.continueBody)"])
        );
        // One offset continues every cut comment of the page; the
        // count is all of their remaining chars.
        let comments = disclosed(json!({
            "pullRequests": [{"number": 3, "contentPagination": {"commentBody": {"offset": 0,
                "unit": "chars", "length": 12000, "total": 26574, "hasMore": true,
                "nextOffset": 12000, "remainingChars": 101000}}}],
            "next": {"continueCommentBody": page("ghGetHistoryItem")}
        }));
        assert_eq!(
            comments["warnings"],
            json!(["101000 more comment body chars (next.continueCommentBody)"])
        );
    }

    #[test]
    fn restarts_and_finished_pages_add_nothing() {
        let restart = json!({
            "warnings": ["Snapshot changed."],
            "pagination": {"currentPage": 1, "totalPages": 1, "hasMore": false},
            "next": {"restart": page("localSearch")}
        });
        assert_eq!(disclosed(restart.clone()), restart);
        let finished = json!({
            "pagination": {"currentPage": 2, "totalPages": 2, "hasMore": false},
            "next": {"nextPage": page("localSearch")}
        });
        assert_eq!(disclosed(finished.clone()), finished);
        let bare = json!({"files": []});
        assert_eq!(disclosed(bare.clone()), bare);
    }

    /// A page whose count is unknown gets no line: `next.<name>` already
    /// says more is left (the instructions say next.* is the unread rest).
    /// A restart page starts over and gets none either.
    #[test]
    fn a_page_without_a_count_adds_no_line() {
        let commits = json!({
            "commits": [{"sha": "a"}],
            "pagination": {"hasMore": true},
            "next": {"nextPage": page("ghSearchHistory"),
                "continueMaterialize": page("ghStructure")}
        });
        assert_eq!(disclosed(commits.clone()), commits);
        let bytes = json!({
            "content": "x",
            "pagination": {"unit": "bytes", "offset": 0, "length": 100,
                "hasMore": true, "nextOffset": 100},
            "next": {"continueWindow": page("localFetch")}
        });
        assert_eq!(disclosed(bytes.clone()), bytes);
        let restart = json!({"next": {"restart": page("localSearch")}});
        assert_eq!(disclosed(restart.clone()), restart);
    }

    /// A whole row shows no remaining-page warning; a split part
    /// words only the pages its split moved to the response pager.
    #[test]
    fn only_moved_pages_are_worded_on_a_split_part() {
        let notes = vec![
            Remaining {
                page: "nextPage".into(),
                left: "17 more files".into(),
            },
            Remaining {
                page: "nextMatchPage".into(),
                left: "26 more matches".into(),
            },
        ];
        let mut part = json!({"files": [], "next": {"nextPage": page("localSearch")}});
        redisclose(part.as_object_mut().unwrap(), &notes, &[]);
        assert!(part.get("warnings").is_none(), "{part}");
        redisclose(
            part.as_object_mut().unwrap(),
            &notes,
            &["nextMatchPage".to_owned()],
        );
        assert_eq!(
            part["warnings"],
            json!(["26 more matches (next.nextMatchPage on the row's last part)"]),
            "{part}"
        );
    }

    /// A page size the continuation leaves at its contract default still
    /// counts: the default is the page size.
    #[test]
    fn a_default_page_size_comes_from_the_contract() {
        let repos = disclosed(json!({
            "repositories": [{"repo": "a"}],
            "pagination": {"totalItems": 38, "hasMore": true},
            "next": {"nextPage": {"tool": "ghSearchRepo",
                "query": {"queries": [{"keywords": ["mcp"], "page": 2}]}}}
        }));
        assert_eq!(
            repos["warnings"],
            json!(["18 more repositories (next.nextPage)"])
        );
        // A directory outline groups its symbols by file: the continued
        // operation names what a page holds.
        let symbols = disclosed(json!({
            "files": [{"path": "a.ts", "symbols": ["fn a"]}],
            "pagination": {"currentPage": 1, "totalPages": 15, "pageSize": 500, "totalItems": 7194, "hasMore": true},
            "next": {"nextPage": {"tool": "astSearch",
                "query": {"queries": [{"operation": "symbols", "path": "src", "page": 2}]}}}
        }));
        assert_eq!(
            symbols["warnings"],
            json!(["6694 more symbols (next.nextPage)"])
        );
    }

    /// `nextMatchPage` continues the matches of the page's files, counted by
    /// each file's own pagination, never the row's file pagination.
    #[test]
    fn match_pages_count_the_matches_left_in_the_page_files() {
        let data = disclosed(json!({
            "files": [
                {"path": "a", "matches": ["x"], "pagination": {"currentPage": 1,
                    "pageSize": 20, "totalItems": 45, "hasMore": true}},
                {"path": "b", "matches": ["y"]},
                {"path": "c", "matches": ["z"], "pagination": {"currentPage": 1,
                    "pageSize": 20, "totalItems": 21, "hasMore": true}}
            ],
            "pagination": {"currentPage": 1, "pageSize": 5, "totalItems": 79, "hasMore": true},
            "next": {"nextPage": {"tool": "astSearch",
                    "query": {"queries": [{"operation": "match", "page": 2, "pageSize": 5}]}},
                "nextMatchPage": {"tool": "astSearch",
                    "query": {"queries": [{"operation": "match", "matchPage": 2, "pageSize": 5}]}}}
        }));
        assert_eq!(
            data["warnings"],
            json!(["74 more files (next.nextPage); 26 more matches (next.nextMatchPage)"])
        );
    }

    /// The first part of a split row words the pages that moved to the
    /// response pager (once per line) after the tool's own warnings; a row
    /// without moved pages gains nothing.
    #[test]
    fn split_parts_word_only_the_pages_that_moved() {
        let note = |page: &str, left: &str| Remaining {
            page: page.into(),
            left: left.into(),
        };
        let notes = [
            note("nextPage", "4 more pages"),
            note("nextFilePage", "7 more changed files"),
            note("continuePatch", "3 unfinished patches"),
        ];
        let mut first = json!({"warnings": ["Regex trap."]});
        let moved = ["nextPage", "nextFilePage"].map(String::from);
        super::redisclose(first.as_object_mut().expect("object"), &notes, &moved);
        assert_eq!(
            first["warnings"],
            json!([
                "Regex trap.",
                "4 more pages (next.nextPage on the row's last part); 7 more changed files (next.nextFilePage on the row's last part)"
            ])
        );
        let mut kept = json!({"warnings": ["Regex trap."]});
        super::redisclose(kept.as_object_mut().expect("object"), &notes, &[]);
        assert_eq!(kept["warnings"], json!(["Regex trap."]));
        let mut bare = json!({"files": [], "next": {"nextPage": page("astSearch")}});
        super::redisclose(bare.as_object_mut().expect("object"), &notes, &[]);
        assert!(bare.get("warnings").is_none(), "{bare}");
    }

    /// A tool's own warning is data the stage never reads: the count line
    /// follows it whatever it says.
    #[test]
    fn a_tool_warning_never_hides_the_count() {
        let data = disclosed(json!({
            "warnings": ["Some match values were truncated."],
            "files": [{"path": "a"}],
            "pagination": {"currentPage": 1, "pageSize": 5, "totalItems": 7, "hasMore": true},
            "next": {"nextPage": page("localSearch"), "expandValues": page("localSearch")}
        }));
        assert_eq!(
            data["warnings"],
            json!([
                "Some match values were truncated.",
                "2 more files (next.nextPage)"
            ]),
            "{data}"
        );
    }

    /// `partialReasons` name why a row is partial (a provider cap, a size
    /// limit, content paging), not how much a page has left: the count still
    /// leads the row.
    #[test]
    fn partial_reasons_do_not_hide_the_remaining_count() {
        let repos = disclosed(json!({
            "repositories": [{"repo": "a"}],
            "pagination": {"totalItems": 1000, "hasMore": true},
            "next": {"nextPage": {"tool": "ghSearchRepo",
                "query": {"queries":[{"keywords": ["mcp"], "page": 2, "pageSize": 3}]}}},
            "providerLimit": {"maxResults": 1000},
            "isPartial": true,
            "partialReasons": ["providerResultCap"]
        }));
        assert_eq!(
            repos["warnings"],
            json!(["997 more repositories (next.nextPage)"])
        );
        let read = disclosed(json!({
            "path": "a.rs",
            "totalLines": 2270,
            "pagination": {"unit": "lines", "offset": 0, "length": 490,
                "hasMore": true, "nextOffset": 490},
            "isPartial": true,
            "partialReasons": ["full-content-size-limit"],
            "next": {"continueWindow": page("ghGetFileContent")}
        }));
        assert_eq!(
            read["warnings"],
            json!(["1780 more lines (next.continueWindow)"])
        );
        let patches = disclosed(json!({
            "pullRequests": [{"number": 1, "contentPagination": {
                "patches": {"hasMore": true, "unfinishedFiles": 3}}}],
            "isPartial": true,
            "partialReasons": ["contentPagination"],
            "next": {"continuePatch": page("ghGetHistoryItem")}
        }));
        assert_eq!(
            patches["warnings"],
            json!(["3 unfinished patches (next.continuePatch)"])
        );
    }

    /// A stale snapshot names both causes: the source or the query.
    #[test]
    fn stale_snapshot_names_source_or_query() {
        assert!(
            crate::response::pages::STALE_SNAPSHOT_ERROR.contains("source or the query changed")
        );
        assert!(!crate::response::pages::STALE_SNAPSHOT_ERROR.contains("next."));
    }

    #[test]
    fn page_facts_count_only_the_paged_unit() {
        // One key order on every page; the total is the paged unit's.
        assert_eq!(
            PageFacts::counted(2, 10, 25).to_value().to_string(),
            r#"{"currentPage":2,"totalPages":3,"pageSize":10,"totalItems":25,"hasMore":true}"#
        );
        assert_eq!(
            PageFacts::counted(3, 10, 25).to_value()["hasMore"],
            json!(false)
        );
        // A page past the end is a page, not more.
        assert_eq!(
            PageFacts::counted(4, 10, 25).to_value()["hasMore"],
            json!(false)
        );
        // Unknown totals state only the cursor facts, in the same order.
        assert_eq!(
            PageFacts::open(1, Some(30), true).to_value().to_string(),
            r#"{"currentPage":1,"pageSize":30,"hasMore":true}"#
        );
        assert_eq!(
            PageFacts::open(1, Some(30), true).with_total(31).to_value(),
            json!({"currentPage":1,"totalPages":2,"pageSize":30,"totalItems":31,"hasMore":true})
        );
        // Size-cut pages have no page size.
        assert_eq!(
            PageFacts::sized(1, 4, 90, true).to_value().to_string(),
            r#"{"currentPage":1,"totalPages":4,"totalItems":90,"hasMore":true}"#
        );
    }

    /// Keys any branch of the shared output `pagination` schema declares,
    /// for every tool, plus the cursor keys the stage moves onto `next`.
    fn declared_pagination_keys() -> std::collections::BTreeMap<&'static str, Vec<String>> {
        ToolId::ALL
            .iter()
            .filter_map(|tool| {
                let contract = crate::contracts::tool_contract(*tool).expect("tool contract");
                let pagination = contract["outputSchema"]["$defs"].get("OutputPagination")?;
                let mut keys = pagination["anyOf"]
                    .as_array()
                    .map_or_else(|| vec![pagination], |branches| branches.iter().collect())
                    .into_iter()
                    .flat_map(|branch| branch["properties"].as_object().into_iter().flatten())
                    .map(|(key, _)| key.clone())
                    .collect::<Vec<_>>();
                assert!(
                    !keys.is_empty(),
                    "{} declares output pagination",
                    tool.as_str()
                );
                keys.extend(super::CURSOR_KEYS.map(str::to_owned));
                Some((tool.as_str(), keys))
            })
            .collect()
    }

    /// Every key native writes into a response `pagination` block is one the
    /// contract declares for every tool (the block is one shared schema): a
    /// `PageFacts` block with every fact set, and every literal write
    /// `…["pagination"]["key"] =` or through a `get_mut("pagination")`
    /// binding in the runtime's non-test sources.
    #[test]
    fn every_emitted_pagination_key_is_declared_by_the_contract() {
        let declared = declared_pagination_keys();
        assert!(
            declared.len() > 10,
            "tools with output pagination: {declared:?}"
        );
        let mut emitted = PageFacts::counted(2, 5, 40)
            .out_of_range(true)
            .to_value()
            .as_object()
            .expect("block")
            .keys()
            .map(|key| (key.clone(), "PageFacts".to_owned()))
            .collect::<Vec<_>>();
        let direct = regex::Regex::new(r#"\["pagination"\]\["(\w+)"\]\s*=[^=]"#).expect("regex");
        let binding = regex::Regex::new(r#"let Some\((\w+)\) = [^;{]*get_mut\("pagination"\)"#)
            .expect("regex");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut dirs = vec![src];
        while let Some(dir) = dirs.pop() {
            for entry in std::fs::read_dir(&dir).expect("src dir") {
                let path = entry.expect("entry").path();
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                if path.is_dir() {
                    if name != "tests" {
                        dirs.push(path);
                    }
                    continue;
                }
                if !name.ends_with(".rs") || name == "tests.rs" || name.ends_with("_tests.rs") {
                    continue;
                }
                let text = std::fs::read_to_string(&path).expect("source");
                let text = text.split("#[cfg(test)]").next().unwrap_or_default();
                let at = path.display().to_string();
                emitted.extend(
                    direct
                        .captures_iter(text)
                        .map(|capture| (capture[1].to_owned(), at.clone())),
                );
                for bound in binding.captures_iter(text) {
                    let write =
                        regex::Regex::new(&format!(r#"\b{}\["(\w+)"\]\s*=[^=]"#, &bound[1]))
                            .expect("regex");
                    emitted.extend(
                        write
                            .captures_iter(text)
                            .map(|capture| (capture[1].to_owned(), at.clone())),
                    );
                }
            }
        }
        let undeclared = emitted
            .iter()
            .flat_map(|(key, at)| {
                declared
                    .iter()
                    .filter(move |(_, keys)| !keys.contains(key))
                    .map(move |(tool, _)| format!("{at}: pagination.{key} ({tool})"))
            })
            .collect::<Vec<_>>();
        assert!(
            undeclared.is_empty(),
            "undeclared pagination keys: {undeclared:#?}"
        );
        assert!(emitted.len() > 5, "the scan finds the writes: {emitted:?}");
    }
}

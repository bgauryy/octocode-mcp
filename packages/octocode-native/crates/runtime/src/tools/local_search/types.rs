use crate::tools::num::{u32_of, u32_of_signed};
use serde::Serialize;
use std::path::PathBuf;

pub use crate::contracts::tool_types::{
    LocalSearchQuery, LocalSearchQueryCaseMode, LocalSearchQueryMultiline, LocalSearchQueryRegex,
    LocalSearchQueryResultView, LocalSearchQuerySort, LocalSearchQueryUnique,
};

/// The engine counts in `u32`; the wire contract owns the field set and its
/// JSON integer types.
impl LocalSearchQuery {
    /// Context lines per hit; the contract bounds the request.
    pub(crate) fn context_lines(&self) -> Option<u32> {
        self.context_lines.map(u32_of_signed)
    }
    pub(crate) fn match_content_length(&self) -> Option<u32> {
        self.match_content_length.map(|n| u32_of(n.get()))
    }
    /// The caller's per-file row cap; `None` lets the result size decide.
    pub(crate) fn match_page_size(&self) -> Option<u32> {
        self.match_page_size.map(|n| u32_of(n.get()))
    }
    /// The walk depth below `path` in engine terms (0 = files directly in
    /// `path`): the wire `maxDepth` counts levels, 1 = its children.
    pub(crate) fn max_depth(&self) -> Option<u32> {
        self.max_depth
            .map(|depth| u32_of(depth.get()).saturating_sub(1))
    }
    pub(crate) fn page(&self) -> u32 {
        u32_of(self.page.get())
    }
    pub(crate) fn match_page(&self) -> u32 {
        u32_of(self.match_page.get())
    }
    pub(crate) fn page_size(&self) -> Option<u32> {
        self.page_size.map(|n| u32_of(n.get()))
    }
    pub(crate) fn snapshot(&self) -> Option<&str> {
        self.snapshot.as_deref().map(String::as_str)
    }
    /// The search mode: the caller's `regex`, else literal text in every tool
    /// (`a|b` finds that text; `regex:"rust"` runs it as a pattern).
    pub(crate) fn regex_mode(&self) -> LocalSearchQueryRegex {
        self.regex.unwrap_or(LocalSearchQueryRegex::Literal)
    }
}

/// Characters that give a text a regex reading besides its literal one.
pub(super) const REGEX_METACHARACTERS: [char; 11] =
    ['.', '(', '|', '[', '*', '+', '?', '^', '$', '{', '\\'];

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum SearchStatus {
    #[default]
    Success,
    Empty,
    Partial,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u32,
    /// Start of the span on its line; only span rows (`matchOnly`) carry it,
    /// since several spans can share a line. A line row's value shows it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    pub value: String,
    /// Byte offset of the hit in its line: where a byte-window read of a long
    /// line starts at the match. Read by leads, never shown.
    #[serde(skip)]
    pub byte_offset: u32,
    /// Every matched line inside a merged context block, in order; present
    /// only when overlapping/adjacent windows were merged into this one.
    #[serde(rename = "matchedLines", skip_serializing_if = "Option::is_none")]
    pub match_lines: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    /// The value is clipped (`originalChars`, `returnedChars` say by how much).
    /// Clipping a value leaves no row out, so it is not a partial result.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub clipped: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_chars: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub returned_chars: Option<usize>,
    /// The innermost declaration around the hit (its name, kind, name line
    /// and last line: an lspSearch anchor and a localFetch span), on the
    /// first row of this file inside it; later rows inside it carry
    /// `enclosing_line` instead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enclosing: Option<Enclosing>,
    /// The name line of the declaration enclosing this hit: the `enclosing`
    /// of the nearest earlier row of this file whose `enclosing.line` is it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enclosing_line: Option<u32>,
    /// `true` on a row whose hit line declares a name (the lspSearch
    /// anchor among same-name hits); absent on every other row.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declaration: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPagination {
    /// Match-page position; a streamed page has no per-file match pages.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
    #[serde(rename = "totalItems")]
    pub total_matches: u32,
    pub has_more: bool,
    /// Lines of this file's hits on later pages, ascending (numbers,
    /// not a packed list): read them directly or page on.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub more_lines: Option<Vec<u32>>,
    /// Later-page hit lines past the listed `moreLines` (the match pages
    /// still hold them).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub more_lines_unlisted: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub out_of_range: bool,
}

/// A declaration enclosing a hit, named like the inputs that take it
/// (`symbolName` + `line` = `line`, `ranges` = `line-endLine`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enclosing {
    pub symbol_name: String,
    pub kind: String,
    pub line: u32,
    pub end_line: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFile {
    pub path: String,
    /// JSON and TOML files: each hit line's key path (`matchKeys`).
    #[serde(
        rename = "matchKeys",
        skip_serializing_if = "Vec::is_empty",
        serialize_with = "crate::tools::match_keys::serialize"
    )]
    pub match_keys: Vec<(usize, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matches: Option<Vec<SearchMatch>>,
    #[serde(rename = "matchCount", skip_serializing_if = "Option::is_none")]
    pub total_occurrences: Option<u32>,
    #[serde(rename = "matchedLineCount", skip_serializing_if = "Option::is_none")]
    pub total_matched_lines: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination: Option<ItemPagination>,
}

/// The response's totals. They serialize flat into the row (`matchCount`,
/// `matchedLineCount`, `filesScanned`, `bytesSearched`, `binarySkipped`,
/// `fileErrors`, `partialReasons`); the fields marked `skip` are what the
/// runtime reads and the row never carries.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStats {
    /// Occurrences; absent when the view did not count them.
    #[serde(rename = "matchCount", skip_serializing_if = "Option::is_none")]
    pub total_occurrences: Option<u32>,
    /// Matched lines; absent when the view did not count them.
    #[serde(rename = "matchedLineCount", skip_serializing_if = "Option::is_none")]
    pub matched_lines: Option<u32>,
    #[serde(skip)]
    pub files_matched: u32,
    #[serde(rename = "filesScanned")]
    pub files_searched: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_searched: Option<i64>,
    #[serde(skip)]
    pub capped: Option<bool>,
    #[serde(skip)]
    pub cap_reason: Option<String>,
    /// The limits that ended the scan early, one per reason (the engine's
    /// `capReason` words).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub partial_reasons: Vec<String>,
    #[serde(skip)]
    pub error_count: Option<u32>,
    #[serde(skip)]
    pub first_error: Option<String>,
    /// Files the search could not read, and the first of them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_errors: Option<FileErrors>,
    /// Files skipped as binary from their leading bytes, on a first page
    /// with hits (an empty page states it in `warnings`).
    #[serde(rename = "binarySkipped", skip_serializing_if = "Option::is_none")]
    pub binary_skipped: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FileErrors {
    pub count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePagination {
    pub current_page: u32,
    /// The match page this file page shows, past the first.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_page: Option<u32>,
    pub total_pages: u32,
    /// Grid pages only; streamed pages are cut by the response budget.
    #[serde(rename = "pageSize", skip_serializing_if = "Option::is_none")]
    pub files_per_page: Option<u32>,
    /// In the pages' unit: files on grid pages, hit rows on streamed pages.
    pub total_items: u32,
    pub has_more: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub out_of_range: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSearchResult {
    #[serde(skip)]
    pub status: SearchStatus,
    #[serde(flatten)]
    pub stats: SearchStats,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<SearchFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination: Option<FilePagination>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranking: Option<crate::contracts::tool_types::Ranking>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub hints: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<serde_json::Value>,
    /// Some candidate content was not searched (unreadable paths, or a binary
    /// file cut at its first NUL), so the returned matches are not the full set
    /// and zero matches do not prove absence.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_partial: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub terminal_limit: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
    #[serde(skip)]
    pub source_snapshot: Option<String>,
    #[serde(skip)]
    pub source_root: PathBuf,
}

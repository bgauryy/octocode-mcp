//! Bounded line windows over sources above the in-memory ceiling.
//!
//! `localFetch` normally reads the whole source (≤ `MAX_SOURCE_BYTES`) so it
//! can hash it, count lines, and redact private-key blocks across the entire
//! file before cutting a window. A larger source (logs, dumps, generated
//! code) is instead streamed once: the whole-file SHA-256 and line count are
//! computed on the fly, only the requested line window is kept (byte-capped,
//! so even one multi-GB line cannot allocate unbounded), and every window
//! line inside a private-key block is replaced before the window reaches the
//! regular sanitizer, whichever side of the window the block's markers fall
//! on. The window then goes through the normal pipeline, and its positions,
//! totals, digest, and continuations are mapped back to the whole file.

use super::executor::process_fetched_content;
use super::types::*;
use crate::security::scan::ContentScan;
use crate::security::{BlockLine, KeyBlockState, LineShape, LineShapeScan, is_key_header_prefix};
use crate::tools::cancel::CancellationCheck;
use std::path::Path;

/// Largest source a window may be streamed from.
pub(super) const MAX_STREAM_SOURCE_BYTES: u64 = 1024 * 1024 * 1024;
/// Lines held by one streamed window; response pages are sized separately.
const WINDOW_LINES: usize = 5_000;
/// Lines the first bare read previews before continuing through bounded windows.
const STREAMED_HEAD_LINES: usize = 100;
/// Bytes one streamed window holds; a longer window is cut at a line end or,
/// for a single giant line, mid-line with a warning.
const WINDOW_BYTES: usize = 4 * 1024 * 1024;
/// Line prefix kept for private-key marker detection outside the window.
const MARKER_PREFIX_BYTES: usize = 256;

struct Streamed {
    digest: String,
    total_lines: usize,
    window: Vec<u8>,
    /// First and last (1-based) lines actually held in `window`.
    first: usize,
    last: usize,
    key_lines: usize,
    clipped_line: Option<usize>,
}

fn is_marker(head: &[u8], edge: &str) -> bool {
    let text = String::from_utf8_lossy(head);
    let text = text.trim_start();
    text.contains(edge) && text.contains("PRIVATE KEY")
}

/// The requested lines kept while a source streams past: byte-capped, with
/// every line inside a private-key block replaced, whichever side of the
/// window its markers fall on.
struct WindowLines {
    first: usize,
    last: usize,
    window: Vec<u8>,
    /// Offset of the current line in `window`.
    line_start: usize,
    /// The current line's leading bytes, for private-key marker detection.
    head: Vec<u8>,
    /// Private-key block state over the lines closed so far.
    block: KeyBlockState,
    /// The current line's shape, scanned only while a block is open.
    shape: LineShapeScan,
    held_last: usize,
    key_lines: usize,
    clipped_line: Option<usize>,
    full: bool,
}

impl WindowLines {
    fn new(first: usize, last: usize) -> Self {
        Self {
            first,
            last,
            window: Vec::new(),
            line_start: 0,
            head: Vec::new(),
            block: KeyBlockState::default(),
            shape: LineShapeScan::default(),
            held_last: first.saturating_sub(1),
            key_lines: 0,
            clipped_line: None,
            full: false,
        }
    }

    /// Take one piece of `line` (up to and including its newline, if any).
    fn push(&mut self, piece: &[u8], line: usize) {
        if self.head.len() < MARKER_PREFIX_BYTES {
            let take = (MARKER_PREFIX_BYTES - self.head.len()).min(piece.len());
            self.head.extend_from_slice(&piece[..take]);
        }
        if self.block.is_open() {
            self.shape.feed(piece);
        }
        if !(self.first..=self.last).contains(&line) || self.full {
            return;
        }
        let room = WINDOW_BYTES.saturating_sub(self.window.len());
        if piece.len() <= room {
            self.window.extend_from_slice(piece);
            return;
        }
        self.window.extend_from_slice(&piece[..room]);
        if self.line_start == 0 {
            // One line larger than the whole window: keep its head and say so.
            self.clipped_line = Some(line);
            if let Err(error) = std::str::from_utf8(&self.window)
                && error.error_len().is_none()
            {
                self.window.truncate(error.valid_up_to());
            }
        } else {
            // Drop the partial line; the window ends before it.
            self.window.truncate(self.line_start);
        }
        self.full = true;
    }

    /// Close `line`: replace it when it sits in a private-key block, and
    /// track the block's markers.
    fn finish(&mut self, line: usize) {
        let begins = is_marker(&self.head, "-----BEGIN ");
        let ends = is_marker(&self.head, "-----END ");
        let (head, shape) = (&self.head, self.shape);
        let inside = self.block.advance(begins, ends, || match shape.finish() {
            LineShape::Other if is_key_header_prefix(head) => BlockLine::Header,
            shape => BlockLine::Shape(shape),
        });
        let held = self.full && self.clipped_line != Some(line);
        if (self.first..=self.last).contains(&line) && !held {
            if inside {
                self.window.truncate(self.line_start);
                self.window
                    .extend_from_slice(crate::security::key_fragment_placeholder().as_bytes());
                self.window.push(b'\n');
                self.key_lines += 1;
                if self.clipped_line == Some(line) {
                    self.clipped_line = None;
                }
            }
            self.held_last = line;
        }
        self.head.clear();
        self.shape = LineShapeScan::default();
        if self.clipped_line == Some(line) {
            self.held_last = line;
        }
        self.line_start = self.window.len();
    }
}

/// The streamed source as [`octocode_engine::digest::copy_hashed`] copies
/// it: every piece is split at its newlines into [`WindowLines`], and a
/// cancel ends the copy.
struct LineSink<'a, C: CancellationCheck> {
    lines: WindowLines,
    /// The 1-based line the next byte belongs to.
    line: usize,
    /// Bytes seen on the current (unterminated) line.
    pending: bool,
    cancel: &'a C,
}

impl<C: CancellationCheck> std::io::Write for LineSink<'_, C> {
    fn write(&mut self, chunk: &[u8]) -> std::io::Result<usize> {
        self.cancel.check().map_err(std::io::Error::other)?;
        let mut rest = chunk;
        while !rest.is_empty() {
            let (piece, newline) = match rest.iter().position(|byte| *byte == b'\n') {
                Some(index) => (&rest[..=index], true),
                None => (rest, false),
            };
            rest = &rest[piece.len()..];
            self.pending = !newline;
            self.lines.push(piece, self.line);
            if newline {
                self.lines.finish(self.line);
                self.line += 1;
            }
        }
        Ok(chunk.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Stream `path`: hash all bytes, count lines like `line_count`, and keep
/// lines `first..=last` (1-based) of the requested window.
fn stream(
    path: &Path,
    first: usize,
    last: usize,
    cancel: &impl CancellationCheck,
) -> Result<Streamed, String> {
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut sink = LineSink {
        lines: WindowLines::new(first, last),
        line: 1,
        pending: false,
        cancel,
    };
    let (_, digest) =
        octocode_engine::digest::copy_hashed(file, &mut sink).map_err(|error| error.to_string())?;
    let LineSink {
        mut lines,
        line,
        pending,
        ..
    } = sink;
    if pending {
        lines.finish(line);
    }
    let total_lines = if pending { line } else { line - 1 };
    Ok(Streamed {
        digest,
        total_lines,
        window: lines.window,
        first,
        last: lines.held_last.min(total_lines),
        key_lines: lines.key_lines,
        clipped_line: lines.clipped_line,
    })
}

/// A repair for a request a streamed window cannot serve.
fn unsupported(q: &LocalFetchQuery, len: u64, reason: &str, next: NextCalls) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        "largeSourceWindowOnly",
        format!(
            "This source is {}MB, above the {}MB whole-file read limit, so only bounded line windows are served: {reason}",
            len / (1024 * 1024),
            super::executor::MAX_SOURCE_BYTES / (1024 * 1024)
        ),
    );
    result.source_bytes = usize::try_from(len).ok();
    result.is_partial = Some(true);
    result.next = Some(next);
    result
}

fn line_chunk_query(q: &LocalFetchQuery, offset: usize) -> LocalFetchQuery {
    let mut query = q.clone();
    query.full_content = None;
    query.minify = None;
    query.match_string = None;
    query.regex = None;
    query.case_mode = None;
    query.context_lines = None;
    query.clear_block_selectors();
    query.unit = Some(WindowUnit::Lines);
    query.offset = if offset == 0 {
        None
    } else {
        Some(wire_count(offset))
    };
    query.snapshot = None;
    query
}

/// Serve `q` from a source larger than the whole-file ceiling.
pub(super) fn fetch_window(
    q: &LocalFetchQuery,
    path: &Path,
    len: u64,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    if !q.match_strings().is_empty() {
        return match_needs_whole_file(q, len);
    }
    if q.full_content == Some(true)
        || q.minify_mode() != MinifyMode::None
        || (q.unit == Some(WindowUnit::Bytes) && q.start_line().is_none())
        || q.block()
    {
        return unsupported(
            q,
            len,
            "fullContent, minify, block, and whole-source byte chunks need the whole file. Read line windows, or byte pages within one line range.",
            read_bounded(q),
        );
    }
    if q.has_ranges() && q.start_line().is_none() {
        return fetch_ranges(q, path, len, modified, security, cancel, regex);
    }
    let (mut result, window) = stream_window(q, path, len, modified, security, cancel, regex);
    if let Some((first, last)) = window {
        let total = result.total_lines.unwrap_or_default();
        result
            .warnings
            .insert(0, streamed_warning(len, &format!("{first}-{last}"), total));
    }
    result
}

/// The one warning a streamed read carries: the size past the whole-file
/// ceiling and the lines it served.
fn streamed_warning(len: u64, served: &str, total: usize) -> String {
    format!(
        "Large source ({}MB): served lines {served} of {total} from streamed windows.",
        len / (1024 * 1024)
    )
}

/// One streamed line window (a range or a chunk) with the `first-last` lines
/// it held, so the caller states them once for every window it joins.
fn stream_window(
    q: &LocalFetchQuery,
    path: &Path,
    len: u64,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> (LocalFetchResult, Option<(usize, usize)>) {
    let (first, requested_last, chunked) = match (q.start_line(), q.end_line()) {
        (Some(start), end) => (start, end.unwrap_or(start), false),
        _ => {
            let offset = q.offset().unwrap_or(0);
            (
                offset + 1,
                offset
                    + q.window_length()
                        .unwrap_or(if offset == 0 && q.snapshot.is_none() {
                            STREAMED_HEAD_LINES
                        } else {
                            WINDOW_LINES
                        }),
                true,
            )
        }
    };
    let last = requested_last.min(first + WINDOW_LINES - 1);
    let streamed = match stream(path, first, last, cancel) {
        Ok(streamed) => streamed,
        Err(error) => {
            return (
                LocalFetchResult::error(q.path.to_string(), "fileReadFailed", error),
                None,
            );
        }
    };
    if let Some(expected) = q.snapshot.as_deref()
        && **expected != streamed.digest
    {
        return (super::executor::stale_snapshot(q), None);
    }
    let total = streamed.total_lines;
    if first > total.max(1) || (total == 0 && first > 1) {
        let mut result = restart_error(
            q,
            "invalidPagination",
            format!("Line {first} is past the end of the file ({total} lines)."),
        );
        result.total_lines = Some(total);
        return (result, None);
    }
    let held_last = streamed.last.max(streamed.first);
    let mut window_query = q.clone();
    // The outer streamed fetch rejects selection and exposes an unfiltered recovery.
    // This internal bounded read addresses only a temporary window digest.
    window_query.clasify_context = None;
    window_query.selection = None;
    window_query.set_line_span(1, held_last + 1 - streamed.first);
    window_query.snapshot = None;
    if chunked {
        // The chunk's file offset selected the window itself.
        window_query.offset = None;
        window_query.length = None;
        window_query.unit = None;
    }
    // An explicit line range keeps its offset: it pages *within* the
    // window (the in-window continuation below carries it).
    let mut result = process_fetched_content(
        &window_query,
        &streamed.window,
        path,
        &super::types::SourceFacts {
            modified,
            window: None,
            first_page_bytes: None,
        },
        security,
        cancel,
        regex,
    );
    if result.status == "error" {
        return (result, None);
    }
    map_to_file(&mut result, &streamed, len);
    let more = if chunked {
        held_last < total
    } else {
        held_last < requested_last.min(total)
    };
    continue_window(
        q,
        &mut result,
        &streamed,
        chunked,
        more.then_some(requested_last),
    );
    // The lines the page returned, which the window's page budget may have
    // cut short of the window it held.
    let served = result
        .source_line_ranges
        .first()
        .map(|range| range.start)
        .zip(result.source_line_ranges.last().map(|range| range.end))
        .or(result.start_line.zip(result.end_line))
        .unwrap_or((streamed.first, held_last));
    // A line chunk pages the file: its pagination is in file lines, as a
    // whole-file read's is.
    if chunked
        && let Some(page) = result.pagination.as_mut()
        && page.unit == WindowUnit::Lines
    {
        let (start, end) = served;
        page.unit = WindowUnit::Lines;
        page.offset = start - 1;
        page.length = end + 1 - start;
        page.total_lines = total;
        page.total_bytes = usize::try_from(len).unwrap_or(usize::MAX);
        page.has_more = end < total;
        page.next_offset = page.has_more.then_some(end);
        page.resume_line = None;
    }
    (result, Some(served))
}

/// Several `ranges`: each (overlaps and neighbours merged, in line order) is
/// one streamed window read, joined with an omission marker between
/// non-adjacent spans, as a whole-file read joins them. A span that does not
/// fit one window page is read on its own, so the rejection names it and
/// leads to that span's read.
fn fetch_ranges(
    q: &LocalFetchQuery,
    path: &Path,
    len: u64,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let merged = crate::tools::line_spans::merge_spans(
        q.line_ranges()
            .into_iter()
            .map(|range| (range.start, range.end)),
    );
    let mut parts = Vec::with_capacity(merged.len());
    for &(start, end) in &merged {
        let mut one = q.clone();
        one.set_line_span(start, end);
        let (part, _) = stream_window(&one, path, len, modified.clone(), security, cancel, regex);
        if part.status == "error" {
            return part;
        }
        if part.next.is_some() {
            return unsupported(
                q,
                len,
                &format!(
                    "lines {start}-{end} need more than one streamed window page, so these ranges cannot be served in one read. Read that span on its own (its pages continue it), and the other ranges in their own rows."
                ),
                NextCalls {
                    read_bounded_lines: Some(FetchCall { query: one }),
                    ..NextCalls::default()
                },
            );
        }
        parts.push(part);
    }
    let digest = parts.first().and_then(|part| part.source_sha256.clone());
    if parts.iter().any(|part| part.source_sha256 != digest) {
        return super::executor::stale_snapshot(q);
    }
    let mut parts = parts.into_iter();
    let Some(mut result) = parts.next() else {
        return unsupported(q, len, "no line range was requested.", read_bounded(q));
    };
    let served = |result: &LocalFetchResult| {
        result
            .source_line_ranges
            .first()
            .map(|range| range.start)
            .zip(result.source_line_ranges.last().map(|range| range.end))
            .or(result.start_line.zip(result.end_line))
    };
    let mut spans_served = served(&result).into_iter().collect::<Vec<_>>();
    for mut part in parts {
        let span = served(&part);
        let (Some(content), Some(next_content)) = (result.content.as_mut(), part.content.take())
        else {
            continue;
        };
        let previous_end = spans_served.last().map_or(0, |span| span.1);
        if let Some((start, _)) = span
            && start > previous_end + 1
        {
            if !content.ends_with('\n') {
                content.push('\n');
            }
            content.push_str(&super::extraction::omission_marker(
                previous_end + 1,
                start - 1,
            ));
        }
        content.push_str(&next_content);
        spans_served.extend(span);
        result.source_line_ranges.extend(part.source_line_ranges);
        for warning in part.warnings {
            if !result.warnings.contains(&warning) {
                result.warnings.push(warning);
            }
        }
        for hint in part.hints {
            if !result.hints.contains(&hint) {
                result.hints.push(hint);
            }
        }
        result.end_line = part.end_line.or(result.end_line);
        result.is_partial =
            (result.is_partial == Some(true) || part.is_partial == Some(true)).then_some(true);
        let add = |a: Option<usize>, b: Option<usize>| match (a, b) {
            (Some(a), Some(b)) => Some(a + b),
            (a, b) => a.or(b),
        };
        result.returned_chars = add(result.returned_chars, part.returned_chars);
        result.returned_bytes = add(result.returned_bytes, part.returned_bytes);
        result.returned_lines = add(result.returned_lines, part.returned_lines);
    }
    let listed = spans_served
        .iter()
        .map(|(start, end)| {
            if start == end {
                start.to_string()
            } else {
                format!("{start}-{end}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    // Each window held its lines; one line says it for all.
    result.warnings.insert(
        0,
        streamed_warning(len, &listed, result.total_lines.unwrap_or_default()),
    );
    result.pagination = None;
    result
}

/// A match read needs the whole file: lead to localSearch, which streams
/// it, and to bounded line windows.
fn match_needs_whole_file(q: &LocalFetchQuery, len: u64) -> LocalFetchResult {
    let needles = q.match_strings();
    let is_regex = q.is_regex();
    let engine = if q.is_pcre2() { "pcre2" } else { "rust" };
    // A list matches any entry: one alternation for localSearch.
    let (needle, is_regex) = match needles.as_slice() {
        [one] => ((*one).to_owned(), is_regex),
        many => (
            many.iter()
                .map(|n| {
                    if is_regex {
                        (*n).to_owned()
                    } else {
                        ::regex::escape(n)
                    }
                })
                .collect::<Vec<_>>()
                .join("|"),
            true,
        ),
    };
    let mut search = serde_json::json!({
        "path": q.path.to_string(),
        "matchString": needle,
        "regex": if is_regex { engine } else { "literal" },
    });
    if let Some(mode) = q.case_mode {
        search["caseMode"] = serde_json::json!(match mode {
            crate::contracts::tool_types::ReadCaseMode::Sensitive => "sensitive",
            crate::contracts::tool_types::ReadCaseMode::Smart => "smart",
            crate::contracts::tool_types::ReadCaseMode::Insensitive => "insensitive",
        });
    }
    if q.whole_word() {
        search["wholeWord"] = serde_json::json!(true);
    }
    let mut next = read_bounded(q);
    next.text_search = Some(
        crate::tools::result::Continuation::new(crate::tools::id::ToolId::LocalSearch, search)
            .build(),
    );
    unsupported(q, len, "matchString needs the whole file.", next)
}

/// Bounded line windows from the first line.
fn read_bounded(q: &LocalFetchQuery) -> NextCalls {
    NextCalls {
        read_bounded_lines: Some(FetchCall {
            query: line_chunk_query(q, 0),
        }),
        ..NextCalls::default()
    }
}

/// An error row whose recovery restarts from the first line window.
fn restart_error(q: &LocalFetchQuery, code: &str, message: String) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(q.path.to_string(), code, message);
    let mut restart = line_chunk_query(q, 0);
    restart.selection = None;
    result.next = Some(NextCalls {
        restart: Some(FetchCall { query: restart }),
        ..NextCalls::default()
    });
    result
}

/// Map a window's positions, totals and digest back to the whole file.
fn map_to_file(result: &mut LocalFetchResult, streamed: &Streamed, len: u64) {
    let shift = streamed.first - 1;
    for range in &mut result.source_line_ranges {
        range.start += shift;
        range.end += shift;
    }
    result.start_line = result.source_line_ranges.first().map(|range| range.start);
    result.end_line = result.source_line_ranges.last().map(|range| range.end);
    let total = streamed.total_lines;
    result.total_lines = Some(total);
    result.source_bytes = usize::try_from(len).ok();
    result.source_chars = None;
    result.source_sha256 = Some(streamed.digest.clone());
    if streamed.key_lines > 0 {
        result.warnings.push(format!(
            "redactedContent: {} line(s) inside private-key blocks were replaced; this content is not verbatim source.",
            streamed.key_lines
        ));
    }
    if let Some(line) = streamed.clipped_line {
        result.warnings.push(format!(
            "Line {line} exceeds {}MB; only a prefix up to {}MB is retained. The suffix is beyond this read limit; split the line outside localFetch to read it.",
            WINDOW_BYTES / (1024 * 1024),
            WINDOW_BYTES / (1024 * 1024)
        ));
        result.terminal_limit(PartialReason::StreamedLineSizeLimit);
    }
}

/// A page inside the window continues within the same absolute window;
/// after the window, `more` (the requested last line) continues the request
/// with the next window. A `chunked` read (line offset + length, no
/// `ranges`) continues as a chunk from its first unread line, so paging
/// inside a chunk never ends the walk at the chunk's last line.
fn continue_window(
    q: &LocalFetchQuery,
    result: &mut LocalFetchResult,
    streamed: &Streamed,
    chunked: bool,
    more: Option<usize>,
) {
    let held_last = streamed.last.max(streamed.first);
    let snapshot = streamed.digest.parse().ok();
    let inner = result
        .next
        .as_mut()
        .and_then(|next| next.continue_window.as_mut());
    if let Some(inner) = inner {
        if inner.query.unit == Some(WindowUnit::Bytes) {
            inner.query.path = q.path.clone();
            inner.query.set_line_span(
                streamed.first,
                q.end_line()
                    .unwrap_or(streamed.total_lines)
                    .min(streamed.total_lines),
            );
            inner.query.snapshot = snapshot;
            return;
        }
        if chunked {
            // The page's window offset counts the window lines already served.
            let served = inner.query.offset().unwrap_or(0);
            let mut query = line_chunk_query(q, streamed.first - 1 + served);
            query.snapshot = snapshot;
            inner.query = query;
            return;
        }
        inner.query.path = q.path.clone();
        inner.query.set_line_span(
            streamed.first,
            q.end_line().unwrap_or(held_last).min(streamed.total_lines),
        );
        inner.query.unit = Some(WindowUnit::Lines);
        inner.query.snapshot = snapshot;
        return;
    }
    result.next = more.map(|requested_last| {
        let mut query = if chunked {
            line_chunk_query(q, held_last)
        } else {
            let mut query = q.clone();
            query.set_line_span(held_last + 1, requested_last);
            query.unit = None;
            query.offset = None;
            query.length = None;
            query
        };
        query.snapshot = snapshot;
        NextCalls {
            continue_window: Some(FetchCall { query }),
            ..NextCalls::default()
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::cancel::NeverCancel;
    use sha2::{Digest, Sha256};

    fn temp(content: &[u8]) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().expect("temp");
        std::io::Write::write_all(&mut file, content).expect("write");
        file
    }

    #[test]
    fn a_copied_streamed_head_continuation_fills_its_bounded_window() {
        let mut source = "x\n".repeat(1_200).into_bytes();
        source.extend(std::iter::repeat_n(b'z', 11 * 1024 * 1024));
        let file = temp(&source);
        let query: LocalFetchQuery =
            serde_json::from_value(serde_json::json!({"path":file.path()})).expect("query");
        let read = |query: &LocalFetchQuery| {
            fetch_window(
                query,
                file.path(),
                source.len() as u64,
                None,
                &crate::security::ContentSecurity::new(),
                &NeverCancel,
                &LocalFetchRegex,
            )
        };
        let first = read(&query);
        assert_eq!(first.content.as_deref(), Some("x\n".repeat(100).as_str()));
        let next = first
            .next
            .and_then(|next| next.continue_window)
            .expect("head continuation");
        crate::contracts::prepare_many_and_validate(
            "localFetch",
            serde_json::json!({"queries":[&next.query]}),
        )
        .expect("canonical continuation");
        let second = read(&next.query);
        assert_eq!(
            second.content.as_deref(),
            Some("x\n".repeat(1_100).as_str())
        );
        assert_eq!(second.start_line, Some(101));
        assert_eq!(second.end_line, Some(1_200));
        let rest = second
            .next
            .and_then(|next| next.continue_window)
            .expect("unread last line");
        assert_eq!(rest.query.offset(), Some(1_200));
        crate::contracts::prepare_many_and_validate(
            "localFetch",
            serde_json::json!({"queries":[&rest.query]}),
        )
        .expect("canonical unread boundary");
        let mut explicit = next.query;
        explicit.length = wire_positive(7);
        assert_eq!(read(&explicit).returned_lines, Some(7));
    }

    #[test]
    fn streams_hash_totals_and_window() {
        let file = temp(b"a\nb\nc\nd");
        let streamed = stream(file.path(), 2, 3, &NeverCancel).expect("stream");
        assert_eq!(streamed.total_lines, 4);
        assert_eq!(streamed.window, b"b\nc\n");
        assert_eq!((streamed.first, streamed.last), (2, 3));
        assert_eq!(streamed.digest, hex::encode(Sha256::digest(b"a\nb\nc\nd")));
    }

    /// A cancel ends the hashing copy with the cancel's own reason.
    #[test]
    fn a_cancelled_stream_stops_with_the_cancel_reason() {
        struct Cancelled;
        impl CancellationCheck for Cancelled {
            fn check(&self) -> Result<(), String> {
                Err("deadline reached".into())
            }
        }
        let file = temp(b"a\nb\n");
        assert_eq!(
            stream(file.path(), 1, 2, &Cancelled).err().as_deref(),
            Some("deadline reached")
        );
    }

    /// Lines split across copy blocks count once, and an unterminated last
    /// line is a line: the totals agree with the whole-text line count.
    #[test]
    fn lines_across_copy_blocks_count_like_the_whole_text() {
        let mut text = "x".repeat(70 * 1024);
        text.push('\n');
        text.push_str("tail without newline");
        let file = temp(text.as_bytes());
        let streamed = stream(file.path(), 2, 2, &NeverCancel).expect("stream");
        assert_eq!(streamed.total_lines, 2);
        assert_eq!(streamed.window, b"tail without newline");
        assert_eq!(
            streamed.digest,
            hex::encode(Sha256::digest(text.as_bytes()))
        );
    }

    #[test]
    fn key_block_lines_are_replaced_even_when_markers_are_outside_the_window() {
        let file = temp(b"x\n-----BEGIN RSA PRIVATE KEY-----\nSECRET1\nSECRET2\n-----END RSA PRIVATE KEY-----\ny\n");
        let streamed = stream(file.path(), 3, 4, &NeverCancel).expect("stream");
        let window = String::from_utf8(streamed.window).expect("utf8");
        assert!(!window.contains("SECRET"), "{window}");
        assert_eq!(streamed.key_lines, 2);
        let after = stream(file.path(), 6, 6, &NeverCancel).expect("stream");
        assert_eq!(after.window, b"y\n");
    }

    #[test]
    fn unterminated_key_redacts_its_body_run_and_leaves_later_code_readable() {
        let file = temp(
            b"let a = 1;\nconst PEM = \"-----BEGIN RSA PRIVATE KEY-----\";\nlet b = compute(a);\nfn main() {}\n-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET1\nSECRET2\nfn tail() {}\n",
        );
        let streamed = stream(file.path(), 1, 8, &NeverCancel).expect("stream");
        let window = String::from_utf8(streamed.window).expect("utf8");
        assert!(
            !window.contains("SECRET") && !window.contains("BEGIN"),
            "{window}"
        );
        assert!(window.contains("let b = compute(a);"), "{window}");
        assert!(
            window.contains("fn main() {}") && window.contains("fn tail() {}"),
            "{window}"
        );
        assert_eq!(streamed.key_lines, 4);
    }

    #[test]
    fn a_giant_single_line_is_clipped_not_buffered() {
        let big = vec![b'z'; WINDOW_BYTES + 10];
        let file = temp(&big);
        let streamed = stream(file.path(), 1, 1, &NeverCancel).expect("stream");
        assert_eq!(streamed.total_lines, 1);
        assert_eq!(streamed.clipped_line, Some(1));
        assert!(streamed.window.len() <= WINDOW_BYTES + 1);
    }

    #[test]
    fn clipping_a_utf8_line_keeps_only_complete_source_characters() {
        let text = format!("€{}", "🙂".repeat(WINDOW_BYTES / 4 + 1));
        let file = temp(text.as_bytes());
        let streamed = stream(file.path(), 1, 1, &NeverCancel).expect("stream");
        let prefix = std::str::from_utf8(&streamed.window).expect("complete UTF-8");
        assert!(text.starts_with(prefix));
        assert_eq!(prefix.len(), WINDOW_BYTES - 1);
        assert_eq!(streamed.clipped_line, Some(1));
    }
}

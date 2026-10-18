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
use crate::tools::num::usize_of;
use std::path::Path;

/// Largest source a window may be streamed from.
pub(super) const MAX_STREAM_SOURCE_BYTES: u64 = 1024 * 1024 * 1024;
/// Lines held by one streamed window; response pages are sized separately.
const WINDOW_LINES: usize = 5_000;
/// Lines the first bare read previews before continuing through bounded
/// windows (contract `localFetch.semanticPolicy.streamedHeadLines`).
const STREAMED_HEAD_LINES: usize = crate::tools::id::local_fetch_policy::STREAMED_HEAD_LINES;
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
    /// The source holds a NUL byte: binary, whatever its head showed.
    binary: bool,
}

fn is_marker(head: &[u8], edge: &str) -> bool {
    let text = String::from_utf8_lossy(head);
    let text = text.trim_start();
    text.contains(edge) && text.contains("PRIVATE KEY")
}

/// The requested lines of one window kept while a source streams past:
/// byte-capped, with every line inside a private-key block replaced.
struct Held {
    first: usize,
    last: usize,
    window: Vec<u8>,
    /// Offset of the current line in `window`.
    line_start: usize,
    held_last: usize,
    key_lines: usize,
    clipped_line: Option<usize>,
    full: bool,
}

impl Held {
    fn new(first: usize, last: usize) -> Self {
        Self {
            first,
            last,
            window: Vec::new(),
            line_start: 0,
            held_last: first.saturating_sub(1),
            key_lines: 0,
            clipped_line: None,
            full: false,
        }
    }

    /// Take one piece of `line` (up to and including its newline, if any).
    fn push(&mut self, piece: &[u8], line: usize) {
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

    /// Close `line`, replacing it when it sits `inside` a private-key block.
    fn finish(&mut self, line: usize, inside: bool) {
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
        if self.clipped_line == Some(line) {
            self.held_last = line;
        }
        self.line_start = self.window.len();
    }
}

/// The requested windows kept while a source streams past once, with the
/// private-key block state over the whole source, whichever side of a
/// window a block's markers fall on.
struct WindowLines {
    held: Vec<Held>,
    /// The current line's leading bytes, for private-key marker detection.
    head: Vec<u8>,
    /// Private-key block state over the lines closed so far.
    block: KeyBlockState,
    /// The current line's shape, scanned only while a block is open.
    shape: LineShapeScan,
}

impl WindowLines {
    /// The windows of `spans`, streamed from a line start where the
    /// private-key block state is `block`.
    fn new(spans: &[(usize, usize)], block: KeyBlockState) -> Self {
        Self {
            held: spans
                .iter()
                .map(|&(first, last)| Held::new(first, last))
                .collect(),
            head: Vec::new(),
            block,
            shape: LineShapeScan::default(),
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
        for held in &mut self.held {
            held.push(piece, line);
        }
    }

    /// Close `line`: track the private-key block's markers, and replace the
    /// line in every window it sits in when it is inside a block.
    fn finish(&mut self, line: usize) {
        let begins = is_marker(&self.head, "-----BEGIN ");
        let ends = is_marker(&self.head, "-----END ");
        let (head, shape) = (&self.head, self.shape);
        let inside = self.block.advance(begins, ends, || match shape.finish() {
            LineShape::Other if is_key_header_prefix(head) => BlockLine::Header,
            shape => BlockLine::Shape(shape),
        });
        for held in &mut self.held {
            held.finish(line, inside);
        }
        self.head.clear();
        self.shape = LineShapeScan::default();
    }
}

/// Lines between two checkpoints of a [`StreamIndex`]: a later page streams
/// at most this many lines before its window.
const CHECKPOINT_LINES: usize = 4_096;

/// Where a line starts in the source, and the private-key block state the
/// lines before it leave.
#[derive(Clone, Copy, Debug)]
struct Checkpoint {
    line: usize,
    offset: u64,
    block: KeyBlockState,
}

/// What one whole pass over a streamed source learned: its digest, line
/// count, whether it holds a NUL byte, and a [`Checkpoint`] at every
/// [`CHECKPOINT_LINES`]-th line from line 1. While the file keeps the
/// settled stamp the pass was made under, a later page of the same version
/// streams from the checkpoint before its window instead of the whole file.
#[derive(Debug)]
struct StreamIndex {
    stamp: octocode_engine::graph::SourceStamp,
    digest: String,
    total_lines: usize,
    binary: bool,
    checkpoints: Vec<Checkpoint>,
}

/// Indexes of streamed sources by canonical path. The stamp (size, times,
/// inode) recorded only for a file untouched for
/// [`octocode_engine::graph::SourceStamp::SETTLE`] is the proof that the
/// bytes, and so the digest, are unchanged, as the graph and LSP memos use
/// it.
static INDEXES: octocode_io::memo::Memo<std::path::PathBuf, StreamIndex> =
    octocode_io::memo::Memo::new(octocode_io::memo::MemoLimits {
        max_entries: 16,
        max_weight: 8 * 1024 * 1024,
        keep_newest: false,
    });

/// The streamed source as it is copied: every piece is split at its
/// newlines into [`WindowLines`], and a cancel ends the copy.
struct LineSink<'a, C: CancellationCheck> {
    lines: WindowLines,
    /// The 1-based line the next byte belongs to.
    line: usize,
    /// Bytes seen on the current (unterminated) line.
    pending: bool,
    /// Source offset of the next byte.
    offset: u64,
    /// The checkpoints a whole pass records ([`StreamIndex`]).
    checkpoints: Option<Vec<Checkpoint>>,
    binary: bool,
    cancel: &'a C,
}

impl<C: CancellationCheck> std::io::Write for LineSink<'_, C> {
    fn write(&mut self, chunk: &[u8]) -> std::io::Result<usize> {
        self.cancel.check().map_err(std::io::Error::other)?;
        self.binary |= chunk.contains(&0);
        let mut rest = chunk;
        while !rest.is_empty() {
            if !self.pending
                && (self.line - 1).is_multiple_of(CHECKPOINT_LINES)
                && let Some(points) = self.checkpoints.as_mut()
            {
                points.push(Checkpoint {
                    line: self.line,
                    offset: self.offset,
                    block: self.lines.block,
                });
            }
            let (piece, newline) = match rest.iter().position(|byte| *byte == b'\n') {
                Some(index) => (&rest[..=index], true),
                None => (rest, false),
            };
            rest = &rest[piece.len()..];
            self.offset += piece.len() as u64;
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

impl<C: CancellationCheck> LineSink<'_, C> {
    /// The held windows once the stream ends, with the source's totals.
    fn windows(self, digest: &str, total_lines: usize, binary: bool) -> Vec<Streamed> {
        self.lines
            .held
            .into_iter()
            .map(|held| Streamed {
                digest: digest.to_owned(),
                total_lines,
                window: held.window,
                first: held.first,
                last: held.held_last.min(total_lines),
                key_lines: held.key_lines,
                clipped_line: held.clipped_line,
                binary,
            })
            .collect()
    }
}

fn seek(mut file: &std::fs::File, offset: u64) -> Result<(), String> {
    std::io::Seek::seek(&mut file, std::io::SeekFrom::Start(offset))
        .map(drop)
        .map_err(|error| error.to_string())
}

/// Stream the opened source once from its start: hash all bytes, count
/// lines like `line_count`, and keep lines `first..=last` (1-based) of every
/// requested window. The handle is the one the read opened and stat'ed (never
/// a reopen by path, which a swapped path could turn into a FIFO).
fn stream(
    source: &std::fs::File,
    spans: &[(usize, usize)],
    cancel: &impl CancellationCheck,
) -> Result<(Vec<Streamed>, StreamIndex), String> {
    seek(source, 0)?;
    let mut sink = LineSink {
        lines: WindowLines::new(spans, KeyBlockState::default()),
        line: 1,
        pending: false,
        offset: 0,
        checkpoints: Some(Vec::new()),
        binary: false,
        cancel,
    };
    let (_, digest) = octocode_engine::digest::copy_hashed(source, &mut sink)
        .map_err(|error| error.to_string())?;
    if sink.pending {
        sink.lines.finish(sink.line);
    }
    let total_lines = if sink.pending {
        sink.line
    } else {
        sink.line - 1
    };
    let index = StreamIndex {
        stamp: octocode_engine::graph::SourceStamp::default(),
        digest,
        total_lines,
        binary: sink.binary,
        checkpoints: sink.checkpoints.take().unwrap_or_default(),
    };
    Ok((
        sink.windows(&index.digest, total_lines, index.binary),
        index,
    ))
}

/// The windows of `spans` from the source `index` describes: streamed from
/// the checkpoint before the first window through the last, with the
/// index's digest and totals (the source is not hashed again).
fn stream_indexed(
    source: &std::fs::File,
    spans: &[(usize, usize)],
    cancel: &impl CancellationCheck,
    index: &StreamIndex,
) -> Result<Vec<Streamed>, String> {
    let first = spans.iter().map(|span| span.0).min().unwrap_or(1);
    let last = spans.iter().map(|span| span.1).max().unwrap_or(0);
    let at = index
        .checkpoints
        .partition_point(|point| point.line <= first)
        .saturating_sub(1);
    let point = index.checkpoints.get(at).copied().unwrap_or(Checkpoint {
        line: 1,
        offset: 0,
        block: KeyBlockState::default(),
    });
    seek(source, point.offset)?;
    let mut sink = LineSink {
        lines: WindowLines::new(spans, point.block),
        line: point.line,
        pending: false,
        offset: point.offset,
        checkpoints: None,
        binary: false,
        cancel,
    };
    let mut block = vec![0_u8; 64 * 1024];
    let mut reader = source;
    while sink.line <= last {
        let read = match std::io::Read::read(&mut reader, &mut block) {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error.to_string()),
        };
        std::io::Write::write_all(&mut sink, &block[..read]).map_err(|error| error.to_string())?;
    }
    if sink.pending && sink.line <= last {
        sink.lines.finish(sink.line);
    }
    Ok(sink.windows(&index.digest, index.total_lines, index.binary))
}

/// The windows of `spans` from `source` at `path`: from the source's index
/// while `stamp` (the handle's settled stamp, taken before the read) still
/// matches it, else by one whole pass, which indexes a source whose stamp
/// held through the pass.
fn read_windows(
    source: &std::fs::File,
    path: &Path,
    stamp: Option<octocode_engine::graph::SourceStamp>,
    spans: &[(usize, usize)],
    cancel: &impl CancellationCheck,
) -> Result<Vec<Streamed>, String> {
    if let Some(stamp) = stamp
        && let Some(hit) = INDEXES.get(path)
        && hit.value.stamp == stamp
    {
        return stream_indexed(source, spans, cancel, &hit.value);
    }
    let (windows, mut index) = stream(source, spans, cancel)?;
    let unchanged = source
        .metadata()
        .ok()
        .as_ref()
        .and_then(crate::tools::source::cache_stamp);
    if let Some(stamp) = stamp.filter(|stamp| unchanged == Some(*stamp)) {
        index.stamp = stamp;
        let weight =
            index.checkpoints.len() * std::mem::size_of::<Checkpoint>() + index.digest.len();
        INDEXES.insert(path.to_path_buf(), index, weight, None);
    }
    Ok(windows)
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

/// Serve `q` from a source larger than the whole-file ceiling, streamed
/// from `source`, the read's open handle on `path`.
pub(super) fn fetch_window(
    q: &LocalFetchQuery,
    path: &Path,
    source: &std::fs::File,
    meta: &std::fs::Metadata,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let len = meta.len();
    // Taken before any byte is read: a write during the pass changes it.
    let stamp = crate::tools::source::cache_stamp(meta).filter(|_| {
        octocode_engine::graph::SourceStamp::settled(meta, std::time::SystemTime::now()).is_some()
    });
    let source = Opened {
        file: source,
        path,
        stamp,
        len,
    };
    if !q.match_strings().is_empty() {
        return match_needs_whole_file(q, len);
    }
    if q.full_content == Some(true)
        || q.minify_mode().is_some()
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
        return fetch_ranges(q, &source, modified, security, cancel, regex);
    }
    let mut result = stream_window(q, &source, modified, security, cancel, regex);
    // The note is the same on every page: the read's first page states it.
    if result.status != "error" && q.offset().unwrap_or(0) == 0 {
        result.warnings.insert(0, streamed_warning(len));
    }
    result
}

/// The note a streamed read's first page carries: the size past the
/// whole-file ceiling. The served lines are the row's own line anchors.
fn streamed_warning(len: u64) -> String {
    format!(
        "Large source ({}MB): served from streamed line windows.",
        len / (1024 * 1024)
    )
}

/// The file lines one streamed window of `q` holds.
#[derive(Clone, Copy)]
struct WindowSpan {
    first: usize,
    /// The window's last line: the request's, capped at [`WINDOW_LINES`].
    last: usize,
    /// The request's last line.
    requested_last: usize,
    /// The line a line `offset` of the read counts from: the range's first
    /// line, or line 1 for a chunk.
    origin: usize,
    /// A line chunk (offset + length, no `ranges`) rather than a range.
    chunked: bool,
}

fn window_span(q: &LocalFetchQuery) -> WindowSpan {
    let (first, requested_last, chunked) = match (q.start_line(), q.end_line()) {
        // A range pages in its own lines: a line offset starts the window
        // there, so every window holds a full page past the offset (a byte
        // offset pages inside the range's first line instead).
        (Some(start), end) => {
            let skip = match q.unit {
                Some(WindowUnit::Bytes) => 0,
                _ => q.offset().unwrap_or(0),
            };
            (start + skip, end.unwrap_or(start), false)
        }
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
    WindowSpan {
        first,
        last: requested_last.min(first + WINDOW_LINES - 1),
        requested_last,
        origin: if chunked {
            1
        } else {
            q.start_line().unwrap_or(first)
        },
        chunked,
    }
}

/// The streamed source a read opened: its handle, canonical path, settled
/// stamp (see [`read_windows`]) and length.
struct Opened<'a> {
    file: &'a std::fs::File,
    path: &'a Path,
    stamp: Option<octocode_engine::graph::SourceStamp>,
    len: u64,
}

impl Opened<'_> {
    fn windows(
        &self,
        spans: &[(usize, usize)],
        cancel: &impl CancellationCheck,
    ) -> Result<Vec<Streamed>, String> {
        read_windows(self.file, self.path, self.stamp, spans, cancel)
    }
}

/// One streamed line window (a range or a chunk).
fn stream_window(
    q: &LocalFetchQuery,
    source: &Opened<'_>,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let span = window_span(q);
    let (path, len) = (source.path, source.len);
    // One span streams exactly one window.
    let streamed = source
        .windows(&[(span.first, span.last)], cancel)
        .and_then(|mut windows| windows.pop().ok_or_else(|| "no window streamed".to_owned()));
    match streamed {
        Ok(streamed) => serve_window(
            q, streamed, span, path, len, modified, security, cancel, regex,
        ),
        Err(error) => LocalFetchResult::error(q.path.to_string(), "fileReadFailed", error),
    }
}

/// The page of one streamed window, mapped back to the whole file.
fn serve_window(
    q: &LocalFetchQuery,
    streamed: Streamed,
    span: WindowSpan,
    path: &Path,
    len: u64,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let WindowSpan {
        first,
        requested_last,
        origin,
        chunked,
        ..
    } = span;
    if let Some(expected) = q.snapshot.as_deref()
        && **expected != streamed.digest
    {
        return super::executor::stale_snapshot(q);
    }
    if streamed.binary {
        return super::executor::refuse_binary(q, q.path.as_str());
    }
    let total = streamed.total_lines;
    if !chunked && origin > total {
        // A range starting past the file end, as an in-memory read refuses it.
        return super::executor::extraction_error(
            q,
            ExtractionError::new(
                ExtractionErrorKind::InvalidInput,
                format!("Requested lines start past the file end ({total} lines)"),
            ),
            total,
        );
    }
    // A line offset past the read's last line (the range's, or the file's
    // for a chunk) is the in-memory read's out-of-range page.
    let read_total = if chunked {
        total
    } else {
        requested_last.min(total) + 1 - origin
    };
    if (!chunked && first > requested_last.min(total))
        || (chunked && (first > total.max(1) || (total == 0 && first > 1)))
    {
        return past_end_row(q, &streamed, read_total, len);
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
    } else if q.unit != Some(WindowUnit::Bytes) {
        // A range's line offset started the window; a byte offset pages
        // *within* it (the in-window continuation below carries it).
        window_query.offset = None;
    }
    let mut result = process_fetched_content(
        &window_query,
        &streamed.window,
        path,
        &super::types::SourceFacts {
            modified,
            window: None,
            first_page_bytes: None,
            interior: streamed.first > 1,
        },
        security,
        cancel,
        regex,
    );
    if result.status == "error" {
        return result;
    }
    map_to_file(&mut result, &streamed, len);
    if !chunked && requested_last > total {
        // The in-memory read states the same clamp.
        result.warnings.push(format!(
            "Range {first}-{requested_last} adjusted to end at {total} (file end)."
        ));
    }
    // The read's last line: the file's for a chunk, the range's otherwise.
    let last = if chunked {
        total
    } else {
        requested_last.min(total)
    };
    // The lines the page returned, which the window's page budget may have
    // cut short of the window it held.
    let served = result
        .source_line_ranges
        .first()
        .map(|range| range.start)
        .zip(result.source_line_ranges.last().map(|range| range.end))
        .or(result.start_line.zip(result.end_line))
        .unwrap_or((streamed.first, held_last));
    continue_window(
        q,
        &mut result,
        &streamed,
        chunked,
        (served.1 < last).then_some(served.1 + 1 - origin),
    );
    // A line page pages the read's own lines (the file's for a chunk, the
    // range's otherwise) whatever window held it, as an in-memory read's
    // pagination does.
    if let Some(page) = result.pagination.as_mut()
        && page.unit == WindowUnit::Lines
    {
        let (start, end) = served;
        page.offset = start - origin;
        page.length = end + 1 - start;
        page.total_lines = last + 1 - origin;
        if chunked {
            page.total_bytes = usize_of(len);
        }
        page.has_more = end < last;
        page.next_offset = page.has_more.then_some(end + 1 - origin);
        page.resume_line = None;
    }
    result
}

/// Several `ranges`: each (overlaps and neighbours merged, in line order) is
/// one streamed window read, joined with an omission marker between
/// non-adjacent spans, as a whole-file read joins them. A span that does not
/// fit one window page is read on its own, so the rejection names it and
/// leads to that span's read (`readBoundedLines`) and to one read of every
/// other requested range (`readOtherRanges`).
fn fetch_ranges(
    q: &LocalFetchQuery,
    source: &Opened<'_>,
    modified: Option<String>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let (path, len) = (source.path, source.len);
    let merged = crate::tools::line_spans::merge_spans(
        q.line_ranges()
            .into_iter()
            .map(|range| (range.start, range.end)),
    );
    let ones = merged
        .iter()
        .map(|&(start, end)| {
            let mut one = q.clone();
            one.set_line_span(start, end);
            let span = window_span(&one);
            (one, span)
        })
        .collect::<Vec<_>>();
    // One pass over the file holds every range's window: the digest and
    // line count are the file's, not the range's.
    let spans = ones
        .iter()
        .map(|(_, span)| (span.first, span.last))
        .collect::<Vec<_>>();
    let streamed = match source.windows(&spans, cancel) {
        Ok(streamed) => streamed,
        Err(error) => return LocalFetchResult::error(q.path.to_string(), "fileReadFailed", error),
    };
    let mut parts = Vec::with_capacity(merged.len());
    for (index, ((one, span), streamed)) in ones.into_iter().zip(streamed).enumerate() {
        let (start, end) = (span.first, span.requested_last);
        let part = serve_window(
            &one,
            streamed,
            span,
            path,
            len,
            modified.clone(),
            security,
            cancel,
            regex,
        );
        if part.status == "error" {
            return part;
        }
        if part.next.is_some() {
            let others = merged
                .iter()
                .enumerate()
                .filter(|(other, _)| *other != index)
                .map(|(_, span)| *span)
                .collect::<Vec<_>>();
            let read_other_ranges = (!others.is_empty()).then(|| {
                let mut rest = q.clone();
                rest.set_line_spans(&others);
                FetchCall { query: rest }
            });
            return unsupported(
                q,
                len,
                &format!(
                    "lines {start}-{end} need more than one streamed window page, so these ranges cannot be served in one read. Read that span on its own (its pages continue it), and the other ranges in their own read."
                ),
                NextCalls {
                    read_bounded_lines: Some(FetchCall { query: one }),
                    read_other_ranges,
                    ..NextCalls::default()
                },
            );
        }
        parts.push(part);
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
    // Each window held its lines; one line says it for all.
    result.warnings.insert(0, streamed_warning(len));
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

/// A line offset past the end of the read's `read_total` lines: nothing
/// returned, in the shape an in-memory read gives the same offset
/// ([`super::executor::past_end`]), with the file's own facts.
fn past_end_row(
    q: &LocalFetchQuery,
    streamed: &Streamed,
    read_total: usize,
    len: u64,
) -> LocalFetchResult {
    let mut warnings = Vec::new();
    let next = super::executor::past_end(q, read_total, WindowUnit::Lines, &mut warnings);
    let offset = q.offset().unwrap_or(0);
    LocalFetchResult {
        path: q.path.to_string(),
        source_sha256: Some(streamed.digest.clone()),
        content: Some(String::new()),
        warnings,
        total_lines: Some(streamed.total_lines),
        source_bytes: usize::try_from(len).ok(),
        returned_chars: Some(0),
        returned_bytes: Some(0),
        returned_lines: Some(0),
        pagination: Some(Pagination {
            unit: WindowUnit::Lines,
            offset,
            length: 0,
            window: q.window_length().unwrap_or(WINDOW_LINES),
            total_lines: read_total,
            total_bytes: usize_of(len),
            has_more: false,
            next_offset: None,
            resume_line: None,
        }),
        out_of_range: true,
        next: Some(next),
        ..LocalFetchResult::blank("success")
    }
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

/// The read's next page. A line page continues the read itself at
/// `next_offset` (counted in the read's own lines: the file's for a
/// `chunked` read, the range's otherwise), so the next window starts where
/// the page ended and the offset never resets at a window boundary. A byte
/// page inside one long line continues within the window it was cut from.
fn continue_window(
    q: &LocalFetchQuery,
    result: &mut LocalFetchResult,
    streamed: &Streamed,
    chunked: bool,
    next_offset: Option<usize>,
) {
    let snapshot = streamed.digest.parse().ok();
    let inner = result
        .next
        .as_mut()
        .and_then(|next| next.continue_window.as_mut());
    if let Some(inner) = inner
        && inner.query.unit == Some(WindowUnit::Bytes)
    {
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
    let read = next_offset.map(|offset| {
        let mut query = if chunked {
            line_chunk_query(q, offset)
        } else {
            let mut query = q.clone();
            if query.unit == Some(WindowUnit::Bytes) {
                // The long line is done: line pages resume after it.
                query.unit = None;
                query.length = None;
            }
            query.offset = Some(wire_count(offset));
            query
        };
        query.snapshot = snapshot;
        FetchCall { query }
    });
    match (result.next.as_mut(), read) {
        (Some(next), read) => next.continue_window = read,
        (None, Some(read)) => {
            result.next = Some(NextCalls {
                continue_window: Some(read),
                ..NextCalls::default()
            });
        }
        (None, None) => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::cancel::NeverCancel;
    use sha2::{Digest, Sha256};

    fn opened(path: &Path) -> std::fs::File {
        std::fs::File::open(path).expect("open")
    }

    /// One stream re-reads its handle from the start, wherever an earlier
    /// read left it.
    #[test]
    fn a_stream_reads_its_handle_from_the_start() {
        let file = temp(b"a\nb\n");
        let source = opened(file.path());
        std::io::Read::read(&mut &source, &mut [0_u8; 3]).expect("sample");
        let (windows, _) = stream(&source, &[(1, 2)], &NeverCancel).expect("stream");
        assert_eq!(windows[0].window, b"a\nb\n");
    }

    fn stream_one(path: &Path, first: usize, last: usize) -> Streamed {
        stream(&opened(path), &[(first, last)], &NeverCancel)
            .expect("stream")
            .0
            .pop()
            .expect("window")
    }

    /// One pass holds every window, each with the file's digest and totals,
    /// and key-block lines replaced in each window they reach.
    #[test]
    fn one_stream_holds_every_requested_window() {
        let file = temp(
            b"a\n-----BEGIN RSA PRIVATE KEY-----\nSECRET\n-----END RSA PRIVATE KEY-----\nb\nc\n",
        );
        let (windows, _) = stream(
            &opened(file.path()),
            &[(1, 1), (3, 3), (5, 6)],
            &NeverCancel,
        )
        .expect("stream");
        let held = windows
            .iter()
            .map(|window| String::from_utf8(window.window.clone()).expect("utf8"))
            .collect::<Vec<_>>();
        assert_eq!(held[0], "a\n");
        assert!(!held[1].contains("SECRET"), "{}", held[1]);
        assert_eq!(held[2], "b\nc\n");
        assert_eq!(windows[1].key_lines, 1);
        assert!(
            windows
                .iter()
                .all(|window| window.total_lines == 6 && window.digest == windows[0].digest)
        );
        assert_eq!(
            windows
                .iter()
                .map(|w| (w.first, w.last))
                .collect::<Vec<_>>(),
            vec![(1, 1), (3, 3), (5, 6)]
        );
    }

    fn temp(content: &[u8]) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().expect("temp");
        std::io::Write::write_all(&mut file, content).expect("write");
        file
    }

    /// A streamed source shows line 1 without its leading BOM, as an
    /// in-memory read does.
    #[test]
    fn a_streamed_source_hides_its_leading_bom() {
        let mut source = "\u{feff}alpha\nbeta\n".to_owned().into_bytes();
        source.extend(std::iter::repeat_n(b'z', 11 * 1024 * 1024));
        let file = temp(&source);
        let query: LocalFetchQuery =
            serde_json::from_value(serde_json::json!({"path":file.path(),"ranges":["1-2"]}))
                .expect("query");
        let read = fetch_window(
            &query,
            file.path(),
            &opened(file.path()),
            &std::fs::metadata(file.path()).expect("meta"),
            None,
            &crate::security::ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
        );
        assert_eq!(read.content.as_deref(), Some("alpha\nbeta\n"), "{read:?}");
    }

    /// A streamed window that starts after line 1 keeps a U+FEFF its first
    /// line begins with: only the file's first bytes hold its byte-order
    /// mark.
    #[test]
    fn a_streamed_window_past_line_one_keeps_a_leading_feff() {
        let mut source = "alpha\nbeta\n\u{feff}gamma\n".to_owned().into_bytes();
        source.extend(std::iter::repeat_n(b'z', 11 * 1024 * 1024));
        let file = temp(&source);
        let query: LocalFetchQuery =
            serde_json::from_value(serde_json::json!({"path":file.path(),"ranges":["3-3"]}))
                .expect("query");
        let read = fetch_window(
            &query,
            file.path(),
            &opened(file.path()),
            &std::fs::metadata(file.path()).expect("meta"),
            None,
            &crate::security::ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
        );
        assert_eq!(read.content.as_deref(), Some("\u{feff}gamma\n"), "{read:?}");
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
                &opened(file.path()),
                &std::fs::metadata(file.path()).expect("meta"),
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
        let streamed = stream_one(file.path(), 2, 3);
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
            stream(&opened(file.path()), &[(1, 2)], &Cancelled)
                .map(drop)
                .err()
                .as_deref(),
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
        let streamed = stream_one(file.path(), 2, 2);
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
        let streamed = stream_one(file.path(), 3, 4);
        let window = String::from_utf8(streamed.window).expect("utf8");
        assert!(!window.contains("SECRET"), "{window}");
        assert_eq!(streamed.key_lines, 2);
        let after = stream_one(file.path(), 6, 6);
        assert_eq!(after.window, b"y\n");
    }

    #[test]
    fn unterminated_key_redacts_its_body_run_and_leaves_later_code_readable() {
        let file = temp(
            b"let a = 1;\nconst PEM = \"-----BEGIN RSA PRIVATE KEY-----\";\nlet b = compute(a);\nfn main() {}\n-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET1\nSECRET2\nfn tail() {}\n",
        );
        let streamed = stream_one(file.path(), 1, 8);
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

    /// Counts the copy blocks a stream writes (one check each).
    struct Blocks(std::sync::atomic::AtomicUsize);
    impl CancellationCheck for Blocks {
        fn check(&self) -> Result<(), String> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }
    }

    /// A later page of an indexed source streams from the checkpoint before
    /// its window, not the whole file, and holds the same window: the
    /// digest and totals of the whole pass, and a private-key block open
    /// across the checkpoint still redacted.
    #[test]
    fn an_indexed_source_streams_a_later_window_from_its_checkpoint() {
        let mut text = String::new();
        for line in 1..=40_000 {
            match line {
                4_090 => text.push_str("-----BEGIN RSA PRIVATE KEY-----\n"),
                4_091..=4_110 => text.push_str("SECRETSECRETSECRET\n"),
                4_111 => text.push_str("-----END RSA PRIVATE KEY-----\n"),
                _ => text.push_str(&format!("line {line}\n")),
            }
        }
        let file = temp(text.as_bytes());
        let source = opened(file.path());
        let meta = source.metadata().expect("meta");
        let stamp = crate::tools::source::cache_stamp(&meta);
        assert!(stamp.is_some(), "the platform stamps files");
        let path = file.path().canonicalize().expect("canonical");
        let spans = [(4_100, 4_120), (39_990, 40_000)];
        let whole = Blocks(Default::default());
        let first = read_windows(&source, &path, stamp, &spans, &whole).expect("first");
        let indexed = Blocks(Default::default());
        let again = read_windows(&source, &path, stamp, &spans, &indexed).expect("again");
        let full = whole.0.into_inner();
        let partial = indexed.0.into_inner();
        assert!(partial < full, "indexed {partial} blocks vs whole {full}");
        for (a, b) in first.iter().zip(&again) {
            assert_eq!(a.window, b.window);
            assert_eq!(
                (a.first, a.last, a.key_lines),
                (b.first, b.last, b.key_lines)
            );
            assert_eq!((&a.digest, a.total_lines), (&b.digest, b.total_lines));
        }
        let held = String::from_utf8(again[0].window.clone()).expect("utf8");
        assert!(!held.contains("SECRET"), "{held}");
        assert!(held.contains("line 4112\n"), "{held}");
        // The body lines in the window and the END marker.
        assert_eq!(again[0].key_lines, 12);
        // Another stamp is another version: the whole file streams again.
        let other = Blocks(Default::default());
        let moved = stamp.map(|stamp| octocode_engine::graph::SourceStamp {
            size: stamp.size + 1,
            ..stamp
        });
        read_windows(&source, &path, moved, &spans, &other).expect("other");
        assert_eq!(other.0.into_inner(), full);
    }

    /// An offset past the end of a streamed read is the in-memory read's
    /// out-of-range page (nothing returned, a restart), not an error.
    #[test]
    fn a_streamed_offset_past_the_end_is_an_out_of_range_page() {
        let text = "x\n".repeat(50);
        let file = temp(text.as_bytes());
        let read = |query: serde_json::Value| {
            let query: LocalFetchQuery = serde_json::from_value(query).expect("query");
            fetch_window(
                &query,
                file.path(),
                &opened(file.path()),
                &std::fs::metadata(file.path()).expect("meta"),
                None,
                &crate::security::ContentSecurity::new(),
                &NeverCancel,
                &LocalFetchRegex,
            )
        };
        for query in [
            serde_json::json!({"path":file.path(),"offset":80}),
            serde_json::json!({"path":file.path(),"ranges":["10-20"],"offset":30}),
        ] {
            let result = read(query);
            assert_eq!(result.status, "success", "{result:?}");
            assert!(result.out_of_range, "{result:?}");
            assert_eq!(result.content.as_deref(), Some(""));
            let restart = result.next.and_then(|next| next.restart).expect("restart");
            assert_eq!(restart.query.offset, Some(0));
            assert!(
                result
                    .warnings
                    .iter()
                    .any(|w| w.contains("is past the end"))
            );
        }
        let past = read(serde_json::json!({"path":file.path(),"ranges":["90-95"]}));
        assert_eq!(past.error_code.as_deref(), Some("invalidInput"), "{past:?}");
    }

    /// A NUL byte past the head sample makes a streamed source binary.
    #[test]
    fn a_streamed_source_with_a_late_nul_is_binary() {
        let mut bytes = "x\n".repeat(20_000).into_bytes();
        bytes.extend_from_slice(b"\0\x01tail\n");
        let file = temp(&bytes);
        let query: LocalFetchQuery =
            serde_json::from_value(serde_json::json!({"path":file.path()})).expect("query");
        let result = fetch_window(
            &query,
            file.path(),
            &opened(file.path()),
            &std::fs::metadata(file.path()).expect("meta"),
            None,
            &crate::security::ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
        );
        assert_eq!(result.error_code.as_deref(), Some("binaryFileUnsupported"));
    }

    #[test]
    fn a_giant_single_line_is_clipped_not_buffered() {
        let big = vec![b'z'; WINDOW_BYTES + 10];
        let file = temp(&big);
        let streamed = stream_one(file.path(), 1, 1);
        assert_eq!(streamed.total_lines, 1);
        assert_eq!(streamed.clipped_line, Some(1));
        assert!(streamed.window.len() <= WINDOW_BYTES + 1);
    }

    #[test]
    fn clipping_a_utf8_line_keeps_only_complete_source_characters() {
        let text = format!("€{}", "🙂".repeat(WINDOW_BYTES / 4 + 1));
        let file = temp(text.as_bytes());
        let streamed = stream_one(file.path(), 1, 1);
        let prefix = std::str::from_utf8(&streamed.window).expect("complete UTF-8");
        assert!(text.starts_with(prefix));
        assert_eq!(prefix.len(), WINDOW_BYTES - 1);
        assert_eq!(streamed.clipped_line, Some(1));
    }
}

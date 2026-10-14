use super::extraction::line_count;
use super::types::*;
use crate::security::scan::ContentScan;
use octocode_engine::security::REDACTION_PREFIX;
pub struct Page {
    pub text: String,
    pub pagination: Pagination,
    pub view_lines: (usize, usize),
    /// The requested offset is at or past the end of a non-empty view (or any
    /// positive offset into an empty one): the page is empty by construction,
    /// not because the view ended here.
    pub out_of_range: bool,
}
/// Bytes one line page may hold; a single longer line is read in byte
/// chunks of this size.
pub(crate) const LINE_PAGE_BYTES: usize = 16_384;

/// Where a byte page that reaches past the end of an oversized line (one
/// over [`LINE_PAGE_BYTES`], the only reason a line read pages by bytes)
/// stops instead: that line's end, and the 0-based line line paging resumes
/// at. `None` when the line fits a line page, the page ends inside it, or
/// it is the last line.
fn oversized_line_end(content: &str, offset: usize, end: usize) -> Option<(usize, usize)> {
    let line_start = content[..offset].rfind('\n').map_or(0, |at| at + 1);
    let line_end = content[offset..]
        .find('\n')
        .map_or(content.len(), |at| offset + at + 1);
    (line_end - line_start > LINE_PAGE_BYTES && end >= line_end && line_end < content.len())
        .then(|| (line_end, content[..line_end].matches('\n').count()))
}

pub fn page(content: &str, q: &LocalFetchQuery) -> Result<Page, String> {
    page_within(content, q, LINE_PAGE_BYTES, None)
}

/// The raw source lines behind a transformed whole-file view (the standard
/// view drops blank and comment lines): each view line's 1-based source
/// line, ascending, and the source's line count.
pub(super) struct SourceLines {
    pub(super) lines: Vec<usize>,
    pub(super) total: usize,
}

impl SourceLines {
    /// The source line of every line of a gutter-numbered view (`N\t…`);
    /// `None` when a line carries no number or the numbers do not ascend.
    pub(super) fn of_gutter(view: &str, total: usize) -> Option<Self> {
        let mut lines = Vec::new();
        for record in view.split_inclusive('\n') {
            let (number, _) = record.split_once(crate::tools::numbered::SEPARATOR)?;
            let line = number.parse::<usize>().ok()?;
            if lines.last().is_some_and(|last| *last >= line) || line > total {
                return None;
            }
            lines.push(line);
        }
        Some(Self { lines, total })
    }
}

/// [`page`] with a line page of at most `line_page_bytes`. With `source`, a
/// line window counts raw source lines: `offset` and `length` name a span
/// of the source, the page shows the view lines inside it, and the
/// pagination states the raw span it covers, so the pages reach every
/// source line exactly once whatever the view dropped.
pub(super) fn page_within(
    content: &str,
    q: &LocalFetchQuery,
    line_page_bytes: usize,
    source: Option<&SourceLines>,
) -> Result<Page, String> {
    if let Some(source) = source
        && q.unit.unwrap_or(if q.full_content == Some(true) {
            WindowUnit::Bytes
        } else {
            WindowUnit::Lines
        }) == WindowUnit::Lines
    {
        return raw_line_page(content, q, line_page_bytes, source);
    }
    view_page(content, q, line_page_bytes)
}

/// A line page over raw source lines (see [`page_within`]): the view page
/// of the view lines whose source lines fall in the requested raw window,
/// restated as the raw span from the requested offset to the next unshown
/// view line's source line (or the source end).
fn raw_line_page(
    content: &str,
    q: &LocalFetchQuery,
    line_page_bytes: usize,
    source: &SourceLines,
) -> Result<Page, String> {
    let offset = q.offset().unwrap_or(0);
    let window = q.window_length().unwrap_or(DEFAULT_LINE_CHUNK);
    let lines = &source.lines;
    // View lines with source line <= raw offset are before the page.
    let first = lines.partition_point(|line| *line <= offset);
    let inside = lines.partition_point(|line| *line <= offset.saturating_add(window));
    // A raw window holding no kept line still shows the next kept one, so
    // every page advances.
    let count = inside
        .saturating_sub(first)
        .max(usize::from(first < lines.len()));
    let mut view_q = q.clone();
    view_q.full_content = None;
    view_q.unit = Some(WindowUnit::Lines);
    view_q.offset = Some(wire_count(first));
    view_q.length = wire_positive(count.max(1));
    let mut page = view_page(content, &view_q, line_page_bytes)?;
    page.out_of_range = offset > 0 && offset >= source.total;
    let raw_of = |view_index: usize| lines.get(view_index).map(|line| line - 1);
    let pagination = &mut page.pagination;
    if pagination.unit == WindowUnit::Bytes {
        // One oversized view line pages by view bytes; line paging resumes
        // at the raw line after it.
        pagination.resume_line = pagination.resume_line.and_then(raw_of);
        return Ok(page);
    }
    let end = page.view_lines.1.max(first);
    let next = raw_of(end).unwrap_or(source.total).max(offset);
    let has_more = end < lines.len();
    *pagination = Pagination {
        unit: WindowUnit::Lines,
        offset: offset.min(source.total),
        length: next.saturating_sub(offset.min(source.total)),
        window: q.window_length().unwrap_or(next.saturating_sub(offset)),
        total_lines: source.total,
        total_bytes: content.len(),
        has_more,
        next_offset: has_more.then_some(next),
        resume_line: None,
    };
    Ok(page)
}

/// A window of the view itself, in view lines or bytes.
fn view_page(content: &str, q: &LocalFetchQuery, line_page_bytes: usize) -> Result<Page, String> {
    let kind = q.unit.unwrap_or(if q.full_content == Some(true) {
        WindowUnit::Bytes
    } else {
        WindowUnit::Lines
    });
    let offset = q.offset().unwrap_or(0);
    match kind {
        WindowUnit::Bytes => {
            let out_of_range = offset > 0 && offset >= content.len();
            let offset = offset.min(content.len());
            if !content.is_char_boundary(offset) {
                return Err(
                    "byte offset must be a UTF-8 code-point boundary within the selected view"
                        .into(),
                );
            }
            let chunk_size = q
                .window_length()
                .unwrap_or(if q.full_content == Some(true) {
                    content.len()
                } else {
                    LINE_PAGE_BYTES
                });
            let mut end = (offset + chunk_size).min(content.len());
            while end < content.len() && !content.is_char_boundary(end) {
                end += 1
            }
            let resume = (q.full_content != Some(true))
                .then(|| oversized_line_end(content, offset, end))
                .flatten();
            if let Some((line_end, _)) = resume {
                end = line_end;
            }
            let text = content[offset..end].to_owned();
            let first = content[..offset].bytes().filter(|b| *b == b'\n').count() + 1;
            let last = first + line_count(&text).saturating_sub(1);
            Ok(Page {
                text,
                pagination: Pagination {
                    unit: kind,
                    offset,
                    length: end - offset,
                    window: chunk_size,
                    total_lines: line_count(content),
                    total_bytes: content.len(),
                    has_more: end < content.len(),
                    next_offset: (end < content.len()).then_some(end),
                    resume_line: resume.map(|(_, line)| line),
                },
                view_lines: (first, last),
                out_of_range,
            })
        }
        WindowUnit::Lines => {
            let lines = content.split_inclusive('\n').collect::<Vec<_>>();
            let out_of_range = offset > 0 && offset >= lines.len();
            let offset = offset.min(lines.len());
            let selected = q.match_string.is_some()
                || q.has_ranges()
                || (q.start_line().is_some() && q.end_line().is_some());
            let requested_limit = q.window_length().unwrap_or(if selected {
                // A selected view pages whole, up to the contract's
                // `length` maximum; the byte budget still bounds the page.
                lines.len().clamp(
                    1,
                    crate::tools::id::query_limits::local_fetch::LENGTH_MAXIMUM,
                )
            } else {
                DEFAULT_LINE_CHUNK
            });
            let mut end = (offset + requested_limit).min(lines.len());
            let mut bytes: usize = lines[offset..end].iter().map(|s| s.len()).sum();
            while bytes > line_page_bytes && end > offset {
                end -= 1;
                bytes -= lines[end].len()
            }
            if end == offset && offset < lines.len() {
                let byte_offset: usize = lines[..offset].iter().map(|line| line.len()).sum();
                let mut byte_query = q.clone();
                byte_query.unit = Some(WindowUnit::Bytes);
                byte_query.offset = Some(wire_count(byte_offset));
                byte_query.length = wire_positive(LINE_PAGE_BYTES);
                return page(content, &byte_query);
            }
            let text = lines[offset..end].concat();
            Ok(Page {
                text,
                pagination: Pagination {
                    unit: kind,
                    offset,
                    length: end - offset,
                    window: q.window_length().unwrap_or(end.saturating_sub(offset)),
                    total_lines: lines.len(),
                    total_bytes: content.len(),
                    has_more: end < lines.len(),
                    next_offset: (end < lines.len()).then_some(end),
                    resume_line: None,
                },
                view_lines: (offset + 1, end),
                out_of_range,
            })
        }
    }
}
/// Context kept on each side of a line page when it is scanned alone, so a
/// multi-line secret straddling the page boundary is still matched whole. Same
/// bound as the engine's chunk overlap (bounded token patterns top out at a few
/// hundred chars; PEM blocks are redacted over the full file before selection).
pub(super) const PAGE_SCAN_MARGIN_BYTES: usize = 8_192;

/// Secret-scan only a line page (plus [`PAGE_SCAN_MARGIN_BYTES`] of
/// whole lines on each side) instead of the whole selected view, so paging a
/// large file costs one page scan rather than one full-file scan per page.
///
/// Sound because redaction preserves line structure: the redacted window has
/// the same line count, so the page's lines are cut from it by index. Returns
/// `None` when a redaction changed the line count (callers fall back to the
/// whole-view scan). The boolean reports whether the returned page changed.
pub fn sanitize_line_page(
    view: &str,
    raw: Page,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> Result<Option<(Page, bool)>, (String, String)> {
    let lines = view.split_inclusive('\n').collect::<Vec<_>>();
    let (first, last) = (raw.view_lines.0.saturating_sub(1), raw.view_lines.1);
    if raw.out_of_range || first >= last || last > lines.len() {
        return Ok(Some((raw, false)));
    }
    let mut start = first;
    let mut margin = 0;
    while start > 0 && margin < PAGE_SCAN_MARGIN_BYTES {
        start -= 1;
        margin += lines[start].len();
    }
    let mut end = last;
    margin = 0;
    while end < lines.len() && margin < PAGE_SCAN_MARGIN_BYTES {
        margin += lines[end].len();
        end += 1;
    }
    let window = lines[start..end].concat();
    let (clean, _) = security.sanitize(&window, source_path)?;
    if clean == window {
        return Ok(Some((raw, false)));
    }
    let clean_lines = clean.split_inclusive('\n').collect::<Vec<_>>();
    if clean_lines.len() != end - start {
        return Ok(None);
    }
    let text = clean_lines[first - start..last - start].concat();
    let changed = text != raw.text;
    Ok(Some((Page { text, ..raw }, changed)))
}
/// LOC-byte: secret-scan only a byte page's window instead of the whole
/// selected view. The window is the page's whole lines plus at least
/// [`PAGE_SCAN_MARGIN_BYTES`] of whole lines on each side, so every
/// single-line secret touching the page is scanned whole (token patterns never
/// span a newline, whatever their length), multi-line patterns get the same
/// margin as line pages and the engine's chunk overlap, and PEM/key blocks
/// were already redacted over the full file before selection.
///
/// Offsets stay in raw-view coordinates. A redacted line is sliced to the
/// page's raw range on its sanitized text: a secret cut by a page boundary
/// shows its placeholder on the page its span ends in, never raw bytes, and
/// the page keeps the offset and length it states. Returns
/// `Ok(None)` when redaction changes the line structure even over the whole
/// view; the caller then falls back to the whole-view scan.
pub fn sanitize_byte_page(
    view: &str,
    raw: Page,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> Result<Option<(Page, bool)>, (String, String)> {
    if raw.out_of_range || raw.text.is_empty() {
        return Ok(Some((raw, false)));
    }
    let bytes = view.as_bytes();
    let start = raw.pagination.offset;
    let end = start + raw.pagination.length;
    let line_start = |at: usize| {
        bytes[..at]
            .iter()
            .rposition(|byte| *byte == b'\n')
            .map_or(0, |index| index + 1)
    };
    let line_end = |at: usize| {
        bytes[at..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(bytes.len(), |index| at + index + 1)
    };
    let window_start = line_start(start.saturating_sub(PAGE_SCAN_MARGIN_BYTES));
    let window_end = line_end((end + PAGE_SCAN_MARGIN_BYTES).min(bytes.len()));
    for (from, to) in [(window_start, window_end), (0, bytes.len())] {
        let window = &view[from..to];
        let (clean, _) = security.sanitize(window, source_path)?;
        if clean == window {
            return Ok(Some((raw, false)));
        }
        if let Some(page) = map_clean_window(view, from, window, &clean, &raw) {
            return Ok(Some((page, true)));
        }
    }
    Ok(None)
}

/// Unchanged text after a placeholder used to find where its span ends.
const ANCHOR_BYTES: usize = 32;

/// Offset in `clean` (a sanitized copy of `raw` whose secrets became
/// `[REDACTED…]` placeholders) that corresponds to byte `raw_at` of `raw`.
/// Text between placeholders is identical in both, so the walk advances in
/// lockstep there and re-synchronizes after each placeholder on the unchanged
/// text that follows it. A position inside a redacted span maps to that
/// span's placeholder, so a slice never contains secret bytes.
fn clean_offset(raw: &str, clean: &str, raw_at: usize) -> usize {
    let (mut i, mut j) = (0usize, 0usize);
    while i < raw_at && j < clean.len() {
        if clean[j..].starts_with(REDACTION_PREFIX) {
            let placeholder_end = clean[j..].find(']').map_or(clean.len(), |at| j + at + 1);
            let anchor_end = clean[placeholder_end..]
                .find(REDACTION_PREFIX)
                .map_or(clean.len(), |at| placeholder_end + at)
                .min(placeholder_end + ANCHOR_BYTES);
            let mut anchor_end = anchor_end;
            while !clean.is_char_boundary(anchor_end) {
                anchor_end -= 1;
            }
            let anchor = &clean[placeholder_end..anchor_end];
            let resumes = if anchor.is_empty() {
                raw.len()
            } else {
                raw[i..].find(anchor).map_or(raw.len(), |at| i + at)
            };
            if resumes > raw_at {
                return j;
            }
            i = resumes;
            j = placeholder_end;
            continue;
        }
        let step = clean[j..].chars().next().map_or(1, char::len_utf8);
        i += step;
        j += step;
    }
    let mut j = j.min(clean.len());
    while !clean.is_char_boundary(j) {
        j -= 1;
    }
    j
}

/// Rebuild a raw-coordinate byte page from a sanitized window with the same
/// line count: unchanged lines keep their raw slice, redacted lines give the
/// slice of their sanitized text that maps onto the page's raw range.
fn map_clean_window(
    view: &str,
    from: usize,
    window: &str,
    clean: &str,
    raw: &Page,
) -> Option<Page> {
    let raw_lines = window.split_inclusive('\n').collect::<Vec<_>>();
    let clean_lines = clean.split_inclusive('\n').collect::<Vec<_>>();
    if raw_lines.len() != clean_lines.len() {
        return None;
    }
    let start = raw.pagination.offset;
    let end = start + raw.pagination.length;
    let mut text = String::with_capacity(raw.text.len());
    let mut position = from;
    for (raw_line, clean_line) in raw_lines.iter().zip(&clean_lines) {
        let line_start = position;
        let line_end = position + raw_line.len();
        position = line_end;
        if line_end <= start || line_start >= end {
            continue;
        }
        if raw_line == clean_line {
            text.push_str(&view[line_start.max(start)..line_end.min(end)]);
        } else {
            // Map the page's raw range onto the sanitized line, so the page
            // stays the window it states.
            let from = clean_offset(raw_line, clean_line, start.saturating_sub(line_start));
            let to = if end >= line_end {
                clean_line.len()
            } else {
                clean_offset(raw_line, clean_line, end - line_start)
            };
            text.push_str(&clean_line[from..to.max(from)]);
        }
    }
    let total = view.len();
    let first = raw.view_lines.0;
    let last = first + line_count(&view[start..end]).saturating_sub(1);
    Some(Page {
        text,
        pagination: Pagination {
            length: end - start,
            has_more: end < total,
            next_offset: (end < total).then_some(end),
            ..raw.pagination.clone()
        },
        view_lines: (first, last),
        out_of_range: false,
    })
}

pub fn continuation(q: &LocalFetchQuery, p: &Pagination) -> Option<NextCalls> {
    p.next_offset.map(|offset| {
        let mut query = q.clone();
        // Line pages are the default unit; a line page the caller did not
        // size takes the line page budget again.
        let default_lines =
            |unit: WindowUnit| unit == WindowUnit::Lines && q.full_content != Some(true);
        if let Some(line) = p.resume_line {
            // Past the oversized line, paging is by lines again.
            query.offset = Some(wire_count(line));
            query.unit = (!default_lines(WindowUnit::Lines)).then_some(WindowUnit::Lines);
            query.length = None;
        } else {
            query.offset = Some(wire_count(offset));
            query.unit = (!default_lines(p.unit)).then_some(p.unit);
            query.length = if default_lines(p.unit) {
                q.length
            } else {
                wire_positive(p.window)
            };
        }
        NextCalls {
            continue_window: Some(Continuation { query }),
            read_bounded_lines: None,
            restart: None,
            ..NextCalls::default()
        }
    })
}
pub fn result_counts(s: &str) -> (usize, usize, usize) {
    (s.encode_utf16().count(), s.len(), line_count(s))
}

#[cfg(test)]
mod long_redacted_line_tests {
    use super::clean_offset;

    #[test]
    fn offsets_track_unchanged_text_and_snap_into_placeholders() {
        let raw = "aaaa SECRETSECRET bbbb SECRET2 cccc";
        let clean = "aaaa [REDACTED-X] bbbb [REDACTED-Y] cccc";
        assert_eq!(clean_offset(raw, clean, 0), 0);
        assert_eq!(clean_offset(raw, clean, 4), 4);
        // Inside the first secret: the placeholder start, never secret bytes.
        assert_eq!(clean_offset(raw, clean, 8), 5);
        // After it, raw and clean realign on " bbbb".
        let raw_b = raw.find("bbbb").expect("b");
        assert_eq!(&clean[clean_offset(raw, clean, raw_b)..][..4], "bbbb");
        let raw_c = raw.find("cccc").expect("c");
        assert_eq!(&clean[clean_offset(raw, clean, raw_c)..], "cccc");
        assert_eq!(clean_offset(raw, clean, raw.len()), clean.len());
    }
}

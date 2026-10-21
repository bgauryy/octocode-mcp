use super::extraction::{extract, line_count};
use super::pagination::{
    SourceLines, continuation, page_within, result_counts, sanitize_byte_page, sanitize_line_page,
};
use super::types::*;
use crate::security::scan::ContentScan;
use crate::tools::cancel::CancellationCheck;
use crate::tools::id::ToolId;
use octocode_engine::signatures::OutlineUnavailable;
use std::fs;
use std::io::Read;
use std::path::Path;

/// In-memory read guard. Larger sources use bounded streaming windows up to
/// `MAX_STREAM_SOURCE_BYTES`; a growing small-file read stops at this guard.
pub(crate) const MAX_SOURCE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Clone, Copy)]
enum SourceSizeLimit {
    Streaming,
    InMemoryGrowth,
}

fn source_too_large(path: &str, len: u64, limit: SourceSizeLimit) -> LocalFetchResult {
    let (message, hint) = match limit {
        SourceSizeLimit::Streaming => (
            format!(
                "File too large: {len} bytes (streaming ceiling: {} bytes / 1 GiB). localFetch cannot read this path, even in ranges.",
                super::large_source::MAX_STREAM_SOURCE_BYTES
            ),
            "No ranges, matchString, or fullContent lift this ceiling; choose a smaller text source or split it outside localFetch.",
        ),
        SourceSizeLimit::InMemoryGrowth => (
            format!(
                "Source grew past the in-memory read guard: at least {len} bytes (guard: {MAX_SOURCE_BYTES} bytes / 10 MiB); the read stopped."
            ),
            "Retry a bounded line window once the source stops changing; sources over 10 MiB stream, up to the 1 GiB ceiling.",
        ),
    };
    let mut result = LocalFetchResult::error(path.to_owned(), "fileTooLarge", message);
    result.source_bytes = Some(len as usize);
    result.terminal_limit(PartialReason::FullContentSource);
    result.hints = vec![hint.into()];
    result
}

/// Read the rest of `reader` after the `bytes` already read from its start,
/// up to the in-memory guard plus one sentinel byte.
fn read_in_memory_source(reader: impl Read, mut bytes: Vec<u8>) -> std::io::Result<Vec<u8>> {
    let left = (MAX_SOURCE_BYTES + 1).saturating_sub(bytes.len() as u64);
    reader.take(left).read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Bytes of the binary sniff: one read from the start of the file.
const BINARY_SAMPLE_BYTES: usize = 8192;

/// One localFetch row; `selection` judges it under `clasifyContext`.
pub fn execute_local_fetch(
    q: &LocalFetchQuery,
    paths: &impl PathAccess,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    window: Option<usize>,
    selection: Option<&crate::tools::selection::Runtime>,
) -> LocalFetchResult {
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(q.path.to_string(), "cancelled", e);
    }
    let (validated, file, meta) = match resolve_file(q, paths) {
        Ok(resolved) => resolved,
        Err(result) => return *result,
    };
    let path = &validated.canonical;
    let display_path = &validated.display;
    // Past the whole-file ceiling, only a streamed line window is served
    // (see `large_source`); past the streaming ceiling nothing is read.
    if meta.len() > super::large_source::MAX_STREAM_SOURCE_BYTES {
        return source_too_large(&q.path, meta.len(), SourceSizeLimit::Streaming);
    }
    let in_memory = meta.len() <= MAX_SOURCE_BYTES;
    let (file, sample) = match read_sample(file, meta.len(), in_memory) {
        Ok(opened) => opened,
        Err(error) => {
            return LocalFetchResult::error(
                q.path.to_string(),
                "fileReadFailed",
                error.to_string(),
            );
        }
    };
    if octocode_engine::text::sniff(&sample) == octocode_engine::text::BinaryVerdict::Binary {
        return refuse_binary(q, display_path);
    }
    if !in_memory && octocode_engine::text::has_utf16_bom(&sample) {
        let mut result = LocalFetchResult::error(
            q.path.to_string(),
            "fileTooLarge",
            format!(
                "BOM-marked UTF-16 sources require a bounded whole-file decode (limit: {MAX_SOURCE_BYTES} bytes); this source is {} bytes.",
                meta.len()
            ),
        );
        result.source_bytes = Some(meta.len() as usize);
        result.terminal_limit(PartialReason::FullContentSource);
        result.hints = vec!["Convert a copy to UTF-8 or split the source into smaller text files; line ranges do not lift this decoding limit.".into()];
        return result;
    }
    if !in_memory {
        return fetch_streamed(q, &validated, &file, &meta, security, cancel, regex);
    }
    // Read at most the cap (+1 sentinel byte). Re-check the length in case the
    // file grew past the ceiling between the stat above and this read (TOCTOU).
    let bytes = match read_in_memory_source(file, sample) {
        Ok(b) if b.len() as u64 > MAX_SOURCE_BYTES => {
            return source_too_large(&q.path, b.len() as u64, SourceSizeLimit::InMemoryGrowth);
        }
        Ok(b) => b,
        Err(e) => {
            return LocalFetchResult::error(q.path.to_string(), "fileReadFailed", e.to_string());
        }
    };
    if octocode_engine::text::sniff_complete(&bytes) == octocode_engine::text::BinaryVerdict::Binary
    {
        return refuse_binary(q, display_path);
    }
    let mut result = process_fetched_content_selected(
        q,
        &bytes,
        path,
        display_path,
        &SourceFacts {
            modified: meta.modified().ok().and_then(system_time_iso),
            window,
            first_page_bytes: None,
            interior: false,
            byte_origin: None,
        },
        security,
        cancel,
        regex,
        selection,
    );
    bind_continuation_to_source(&mut result);
    name_read_file(&mut result, q, &validated);
    result
}

/// Name the read file as [`ValidatedRead::named`] does: by the canonical
/// path the read resolved (`.`/`..` folded), relative to the workspace when
/// inside it, or by the requested path when it was read through a symlink;
/// in the row, and in every read that continues the same file, so a
/// continuation names the file its row names. The first page says where a
/// symlink led. Whole-file and streamed reads name it the same way.
fn name_read_file(result: &mut LocalFetchResult, q: &LocalFetchQuery, read: &ValidatedRead) {
    let named = read.named.as_str();
    if result.path == q.path.as_str() {
        named.clone_into(&mut result.path);
    }
    if let Some(target) = &read.target
        && result
            .pagination
            .as_ref()
            .is_none_or(|page| page.offset == 0)
    {
        result
            .warnings
            .push(format!("{named} resolves through a symlink to {target}."));
    }
    let (Some(next), Ok(path)) = (result.next.as_mut(), named.parse()) else {
        return;
    };
    for read in next.reads_mut() {
        if read.query.path == q.path {
            read.query.path.clone_from(&path);
        }
    }
}

/// The validated path, opened, and the handle's stat; a refused path, a
/// directory, a non-regular file or a failed open ends the read.
pub(super) fn resolve_file(
    q: &LocalFetchQuery,
    paths: &impl PathAccess,
) -> Result<(ValidatedRead, fs::File, fs::Metadata), Box<LocalFetchResult>> {
    let validated = paths
        .validate_read(Path::new(q.path.as_str()))
        .map_err(|failure| Box::new(path_failure(q, *failure)))?;
    // Open first, then stat the handle: a path swapped for a FIFO or a
    // directory after the policy check is refused, never blocked on. A failed
    // open is named by a plain stat of the path.
    match octocode_engine::text::open_regular(&validated.canonical) {
        Ok((file, meta)) => Ok((validated, file, meta)),
        Err(error) => Err(Box::new(match fs::metadata(&validated.canonical) {
            Ok(meta) if meta.is_dir() => not_a_file(q, NotAFile::Directory),
            Ok(meta) if !meta.is_file() => not_a_file(q, NotAFile::Special),
            _ => LocalFetchResult::error(q.path.to_string(), "fileAccessFailed", error.to_string()),
        })),
    }
}

/// The opened file's binary-sniff sample, which starts the buffer of the
/// whole read (sized from the handle's stat).
fn read_sample(
    mut file: fs::File,
    len: u64,
    in_memory: bool,
) -> std::io::Result<(fs::File, Vec<u8>)> {
    let capacity = if in_memory {
        usize::try_from(len).map_or(BINARY_SAMPLE_BYTES, |len| len + 1)
    } else {
        BINARY_SAMPLE_BYTES
    };
    let mut bytes = Vec::with_capacity(capacity.max(BINARY_SAMPLE_BYTES));
    let mut sample = [0_u8; BINARY_SAMPLE_BYTES];
    let read = file.read(&mut sample)?;
    bytes.extend_from_slice(&sample[..read]);
    Ok((file, bytes))
}

/// A source over the in-memory guard: its streamed line window, ranked
/// when the read has goals.
fn fetch_streamed(
    q: &LocalFetchQuery,
    file: &ValidatedRead,
    source: &fs::File,
    meta: &fs::Metadata,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    if q.clasify_context.is_some() {
        return unsupported_selection(
            q,
            "Streamed files cannot use inline selection, even with ranges. Read the unfiltered window, then use clasify with bounded state or source ranges.",
            None,
        );
    }
    if q.selection.is_some() {
        return stale_snapshot(q);
    }
    let path = &file.canonical;
    let mut result = super::large_source::fetch_window(
        q,
        path,
        source,
        meta,
        meta.modified().ok().and_then(system_time_iso),
        security,
        cancel,
        regex,
    );
    name_read_file(&mut result, q, file);
    result
}

/// The row for a selection that could not order the source.
fn selection_failure(
    q: &LocalFetchQuery,
    failure: crate::tools::selection::Failure,
) -> LocalFetchResult {
    match failure {
        crate::tools::selection::Failure::Stale => stale_snapshot(q),
        crate::tools::selection::Failure::Cancelled => LocalFetchResult::error(
            q.path.to_string(),
            "cancelled",
            "Selection was cancelled".into(),
        ),
        crate::tools::selection::Failure::Provider(failure) => {
            let crate::tools::selection::ProviderFailure { error, outcome } = *failure;
            let mut result =
                LocalFetchResult::error(q.path.to_string(), &error.code, error.message);
            result.hints = error.hints;
            result.selection = Some(outcome.receipt);
            result.next = Some(NextCalls {
                unfiltered: unfiltered_read(q),
                ..NextCalls::default()
            });
            result
        }
    }
}

/// A path that names no regular file: a directory leads to its tree; a
/// FIFO, socket or device has no file text to read, so nothing retries it.
fn not_a_file(q: &LocalFetchQuery, kind: NotAFile) -> LocalFetchResult {
    if kind == NotAFile::Special {
        return LocalFetchResult::error(
            q.path.to_string(),
            "notAFile",
            format!(
                "{} is not a regular file (a FIFO, socket or device); localFetch reads regular files only.",
                q.path
            ),
        );
    }
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        "notAFile",
        format!(
            "{} is a directory, not a file; list it with structureSearch, then read a file in it.",
            q.path
        ),
    );
    result.next = Some(NextCalls {
        view_tree: Some(
            crate::tools::result::Continuation::new(
                ToolId::StructureSearch,
                serde_json::json!({"operation": "tree", "path": q.path.as_str()}),
            )
            .build(),
        ),
        ..NextCalls::default()
    });
    result
}

/// The row for a path the policy refused or could not resolve.
fn path_failure(q: &LocalFetchQuery, failure: PathFailure) -> LocalFetchResult {
    if let Some(kind) = failure.not_a_file {
        return not_a_file(q, kind);
    }
    let display = failure.safe_path.as_deref().unwrap_or(&q.path);
    let message = if failure.sparse_checkout {
        format!(
            "Path does not exist: {display}. It lies in a sparse checkout, so it may exist outside the checked-out paths: re-clone with a path that covers it, or read it with ghGetFileContent."
        )
    } else if failure.resource_missing {
        format!("Path does not exist: {display}")
    } else {
        failure.message
    };
    let mut result = LocalFetchResult::error(q.path.to_string(), &failure.code, message);
    result.resource_missing = failure.resource_missing;
    if failure.resource_missing {
        // The parent's tree shows a mistyped name's siblings; the listing
        // finds a file moved elsewhere or under another extension; the read
        // of the one close sibling fixes a mistyped name in one call.
        let next = NextCalls {
            view_tree: failure.view_tree,
            find_file: failure
                .search_root
                .as_deref()
                .and_then(|root| crate::tools::leads::find_file::find_file(root, q.path.as_str())),
            read: failure
                .corrected
                .and_then(|path| path.parse().ok())
                .map(|path| FetchCall {
                    query: LocalFetchQuery { path, ..q.clone() },
                }),
            ..NextCalls::default()
        };
        result.next = Some(next).filter(|next| !next.is_empty());
    }
    result
}

/// The refusal for a binary file: a NUL byte, or a binary head.
pub(super) fn refuse_binary(q: &LocalFetchQuery, display_path: &str) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        "binaryFileUnsupported",
        format!(
            "Binary file unsupported: {display_path}. Read a text source file, or use structureSearch operation:\"files\" for file metadata."
        ),
    );
    // No range or matchString can make binary bytes readable; say so
    // instead of the generic "remove matchString" recovery.
    result.hints =
        vec!["Do not retry this path with other ranges; choose a text source file instead.".into()];
    result
}

/// Bind pages and recovery of unread or unfiltered evidence to the captured
/// file version, so they cannot silently read a different source.
/// (Remote reads pin a commit SHA in their continuation instead.)
fn bind_continuation_to_source(result: &mut LocalFetchResult) {
    let snapshot = result
        .source_sha256
        .as_deref()
        .and_then(|digest| digest.parse().ok());
    if let Some(next) = result.next.as_mut() {
        for read in [
            &mut next.continue_window,
            &mut next.continue_block,
            &mut next.whole_lines,
            &mut next.unfiltered,
            &mut next.unfiltered_unknown,
            &mut next.next_candidate_page,
        ]
        .into_iter()
        .flatten()
        {
            read.query.snapshot = snapshot.clone();
        }
        if let Some(digest) = result.source_sha256.as_deref() {
            for rows in next
                .unfiltered_unknown_rest
                .values_mut()
                .filter_map(|call| call.pointer_mut("/query/queries"))
                .filter_map(serde_json::Value::as_array_mut)
            {
                for row in rows {
                    row["snapshot"] = serde_json::json!(digest);
                }
            }
        }
    }
}

/// Shared post-acquisition content processing. Performs no filesystem access;
/// callers own source authorization, binary/transport limits and provenance.
pub fn process_fetched_content(
    q: &LocalFetchQuery,
    bytes: &[u8],
    source_path: &std::path::Path,
    facts: &SourceFacts,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> LocalFetchResult {
    let provider_path = source_path.file_name().map_or_else(
        || ".".to_owned(),
        |name| name.to_string_lossy().into_owned(),
    );
    process_fetched_content_selected(
        q,
        bytes,
        source_path,
        &provider_path,
        facts,
        security,
        cancel,
        regex,
        None,
    )
}

pub(crate) fn process_fetched_content_selected(
    q: &LocalFetchQuery,
    bytes: &[u8],
    source_path: &std::path::Path,
    provider_path: &str,
    facts: &SourceFacts,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    selection: Option<&crate::tools::selection::Runtime>,
) -> LocalFetchResult {
    let sha256 = crate::digest::sha256(bytes);
    // Refused on its input alone: no decode, redaction or extraction runs;
    // the digest binds the unfiltered lead to the version the refusal saw.
    if let Some(refused) = refused_selection_input(q, &sha256) {
        return refused;
    }
    let mut source = match prepare_source(q, bytes, sha256, facts, source_path, security, cancel) {
        Ok(source) => source,
        Err(result) => return *result,
    };
    // A whole-text read moves the source into its view instead of copying
    // it: nothing after the extraction reads the source text of such a read.
    let extracted = if super::extraction::selects_whole(q) {
        Ok(super::extraction::Extraction::whole(
            std::sync::Arc::unwrap_or_clone(std::mem::take(&mut source.text)),
        ))
    } else {
        extract(q, &source.text, regex)
    };
    let mut ext = match extracted {
        Ok(extraction) => extraction,
        Err(error) => return extraction_error(q, error, source.total_lines),
    };
    let selection_input = SelectionInput {
        q,
        source_path,
        provider_path,
        sha256: &source.sha256,
        runtime: selection,
    };
    if ext.count == Some(0) {
        return select_no_match(&selection_input, no_match(q, &source, regex));
    }
    let mut view = select_view(
        q,
        &mut ext,
        &mut source.redacted_lines,
        source_path,
        security,
    );
    let selection_outcome = match select_view_chunks(
        &selection_input,
        &source.text,
        &mut view,
        &mut ext,
        security,
    ) {
        Ok(outcome) => outcome,
        Err(result) => return *result,
    };
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(q.path.to_string(), "cancelled", e);
    }
    // A classified page's plan token, receipt and unfiltered leads ride the
    // same row: the text window leaves room for them.
    let classified_facts;
    let facts = match &selection_outcome {
        Some(chosen) if facts.window.is_some() || facts.first_page_bytes.is_some() => {
            let beside = chosen.row_chars(&crate::tools::result::query_value(q));
            classified_facts = SourceFacts {
                window: facts
                    .window
                    .map(|window| window.saturating_sub(beside).max(1)),
                first_page_bytes: facts
                    .first_page_bytes
                    .map(|bytes| bytes.saturating_sub(beside).max(1)),
                ..facts.clone()
            };
            &classified_facts
        }
        _ => facts,
    };
    let cut = match cut_page(q, &view, &ext, &source, facts, source_path, security) {
        Ok(cut) => cut,
        Err(result) => return *result,
    };
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(cut.q.path.to_string(), "cancelled", e);
    }
    page_result(
        cut,
        source,
        ext,
        view,
        selection_outcome,
        source_path,
        facts,
    )
}

/// Source and runtime needed to select evidence before paging.
struct SelectionInput<'a> {
    q: &'a LocalFetchQuery,
    source_path: &'a std::path::Path,
    provider_path: &'a str,
    sha256: &'a str,
    runtime: Option<&'a crate::tools::selection::Runtime>,
}

impl SelectionInput<'_> {
    /// The selection's source key: the path and the digest of its bytes.
    fn source_key(&self) -> String {
        format!(
            "fetch-chunks-v2:{}:{}",
            self.source_path.display(),
            self.sha256
        )
    }
}

/// A read that selected nothing carries the selection receipt of its goals; a
/// ranked replay without goals is stale.
fn select_no_match(input: &SelectionInput, mut result: LocalFetchResult) -> LocalFetchResult {
    let q = input.q;
    if q.clasify_context.is_none() {
        return if q.selection.is_some() {
            stale_snapshot(q)
        } else {
            result
        };
    }
    let query_json = crate::tools::result::query_value(q);
    match crate::tools::selection::select(
        input.runtime,
        &query_json,
        &input.source_key(),
        q.selection.as_ref().map(|token| token.as_str()),
        &[],
        None,
        crate::contracts::tool_types::SelectionUnit::Chunks,
    ) {
        Ok(outcome) => result.selection = Some(outcome.receipt),
        Err(failure) => return selection_failure(q, failure),
    }
    result
}

/// A classified read its input alone rules out, refused before the source
/// is decoded, redacted or extracted: selection judges raw text in line
/// units, and pages only through its own selection token.
fn refused_selection_input(q: &LocalFetchQuery, digest: &str) -> Option<LocalFetchResult> {
    q.clasify_context.as_ref()?;
    // A first call with an offset is a request, not a stale cursor.
    if q.offset().is_some_and(|offset| offset > 0) && q.selection.is_none() {
        return Some(unsupported_selection(
            q,
            "A classified read pages only through its continueWindow selection token; drop offset or clasifyContext.",
            Some(digest),
        ));
    }
    // A match read is verbatim whatever its minify (see `select_view`).
    let transformed = q.minify_mode().is_some() && q.match_string.is_none();
    if transformed || (q.unit == Some(WindowUnit::Bytes) && q.selection.is_none()) {
        return Some(unsupported_selection(
            q,
            "clasifyContext requires raw text in line units; omit minify, and omit unit or use unit:lines.",
            Some(digest),
        ));
    }
    None
}

/// Select complete source windows before response paging.
fn select_view_chunks(
    input: &SelectionInput,
    source_text: &str,
    view: &mut View,
    ext: &mut super::extraction::Extraction,
    security: &impl ContentScan,
) -> Result<Option<super::selection::Chosen>, Box<LocalFetchResult>> {
    let q = input.q;
    if q.clasify_context.is_none() {
        if q.selection.is_some() {
            return Err(Box::new(stale_snapshot(q)));
        }
        return Ok(None);
    }
    let unsupported = None;
    let (candidates, chunks) = super::selection::chunks(
        &view.text,
        ext.source_lines.as_deref(),
        Some(source_text),
        input.source_path,
        input.provider_path,
        security,
        input.runtime,
        q.selection.as_ref().map(|token| token.as_str()),
        unsupported,
    );
    let query_json = crate::tools::result::query_value(q);
    let (outcome, provider) =
        crate::tools::selection::unless_transient(crate::tools::selection::select(
            input.runtime,
            &query_json,
            &input.source_key(),
            q.selection.as_ref().map(|s| s.as_str()),
            &candidates,
            unsupported,
            crate::contracts::tool_types::SelectionUnit::Chunks,
        ))
        .map_err(|failure| Box::new(selection_failure(q, failure)))?;
    let shown = outcome.shown(chunks.len());
    let (text, source_lines) = super::selection::project(&view.text, &chunks, &shown);
    view.text = text;
    ext.source_lines = Some(source_lines);
    Ok(Some(super::selection::Chosen::new(
        outcome, provider, &chunks,
    )))
}

/// The scanned page of a view, and the query it was cut for.
struct CutPage<'a> {
    /// The read's query; bounded when a complete view was over the window.
    q: std::borrow::Cow<'a, LocalFetchQuery>,
    /// The read as asked: classified routes (the whole view, the next
    /// candidate page) repeat it, not its bounded first page.
    asked: &'a LocalFetchQuery,
    view_limited: bool,
    /// The page is the head of an unanchored read.
    head: bool,
    scanned: ScannedPage,
}

/// Cut the returned page from the view. A complete view over the limit
/// returns its first bounded page inline.
fn cut_page<'a>(
    q: &'a LocalFetchQuery,
    view: &View,
    ext: &super::extraction::Extraction,
    source: &Source,
    facts: &SourceFacts,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> Result<CutPage<'a>, Box<LocalFetchResult>> {
    let asked = q;
    let view_limited =
        q.full_content == Some(true) && facts.window.is_some_and(|window| view.text.len() > window);
    let q = if view_limited {
        std::borrow::Cow::Owned(bounded_query(q))
    } else {
        std::borrow::Cow::Borrowed(q)
    };
    // A configured response window owns the page budget. Keep the smaller
    // fallback for direct callers without one and any explicit preview.
    let line_page_bytes = facts
        .first_page_bytes
        .filter(|_| (q.match_string.is_some() || q.has_ranges()) && q.offset().is_none())
        .unwrap_or_else(|| {
            facts
                .window
                .map_or(super::pagination::LINE_PAGE_BYTES, |window| {
                    crate::tools::page_windows::page_budget(
                        Some(window),
                        &crate::tools::result::query_row(q.as_ref(), &[]),
                    )
                })
        });
    let head_view = head_query(&q, view.mode, view.text.len());
    let head = head_view.is_some();
    let page_q = head_view.as_ref().unwrap_or(&q);
    // A byte page of a streamed window is cut at its offset in the window.
    let in_window = facts.byte_origin.map(|origin| origin.within(page_q));
    let page_q = in_window.as_ref().unwrap_or(page_q);
    // A transformed view pages in the lines a raw read of the same
    // selection pages in: raw source lines for a whole file (the unit of
    // `totalLines`, the gutter and `ranges`), the extracted lines for
    // `ranges`; an outline pages its own lines.
    let source_lines = (view.mode == Some(MinifyMode::Standard))
        .then(|| match ext.source_lines.as_deref() {
            None => SourceLines::of_gutter(&view.text, source.total_lines),
            Some(selected) => SourceLines::of_selected_gutter(&view.text, selected),
        })
        .flatten();
    let window = PageWindow {
        query: page_q,
        view: &view.text,
        line_page_bytes,
        source_lines: source_lines.as_ref(),
    };
    let mut scanned = scan_page(&q, &window, source_path, security, source, ext.start)?;
    if let Some(origin) = facts.byte_origin
        && scanned.page.pagination.unit == WindowUnit::Bytes
    {
        origin.place(&mut scanned.page.pagination);
    }
    Ok(CutPage {
        q,
        asked,
        view_limited,
        head,
        scanned,
    })
}

/// The success row for a scanned page: its warnings, continuations and
/// source anchors.
fn page_result(
    cut: CutPage,
    mut source: Source,
    mut ext: super::extraction::Extraction,
    view: View,
    selection_outcome: Option<super::selection::Chosen>,
    source_path: &std::path::Path,
    facts: &SourceFacts,
) -> LocalFetchResult {
    let CutPage {
        q,
        asked,
        view_limited,
        head,
        scanned,
    } = cut;
    let q = q.as_ref();
    let mut warnings = std::mem::take(&mut source.warnings);
    warnings.extend(std::mem::take(&mut ext.warnings));
    warnings.extend(scanned.warnings);
    let pg = scanned.page;
    let source_redactions = if source.redacted_lines.is_empty() {
        0
    } else {
        source.redactions_on(page_lines(&pg, ext.source_lines.as_deref(), view.mode))
    };
    // The page shows a key block the source-wide pass redacted.
    if source.key_blocks_redacted
        && source_redactions > 0
        && pg
            .text
            .contains(&crate::security::key_fragment_placeholder())
    {
        warnings.push(KEY_BLOCK_NOTE.into());
    }
    warn_redacted(
        &pg.text,
        scanned.redacted,
        scanned.redactions + source_redactions,
        &mut warnings,
    );
    if pg.pagination.offset == 0 {
        warn_unmatchable(q, &source, &ext, &mut warnings);
        warnings.extend(
            selection_outcome
                .as_ref()
                .and_then(super::selection::Chosen::disclosure),
        );
    }
    let out_of_range = pg.out_of_range;
    let token = selection_outcome
        .as_ref()
        .map(|chosen| chosen.outcome.token.as_str());
    let mut next = continue_calls(q, &pg, head, token, &mut ext, &mut warnings);
    if let Some(chosen) = &selection_outcome
        && chosen.outcome.leaves_out()
    {
        attach_unfiltered(next.get_or_insert_with(NextCalls::default), asked, chosen);
    }
    read_scope_warnings(q, &pg, &mut warnings);
    // Redaction (source-wide for matchString, or on the page) replaces text
    // within lines; the anchors stay and the warning above says the text is
    // not verbatim.
    let source_ranges =
        if !out_of_range && !scanned.empty && view.mode.is_none() && scanned.lines_kept {
            page_source_ranges(ext.source_lines.as_deref(), pg.view_lines)
        } else {
            vec![]
        };
    let blocks = if out_of_range {
        vec![]
    } else {
        std::mem::take(&mut ext.blocks)
    };
    let mut matched_lines = std::mem::take(&mut ext.matched_lines);
    matched_lines.retain(|n| source_ranges.iter().any(|r| *n >= r.start && *n <= r.end));
    let match_keys =
        crate::tools::match_keys::line_key_paths(source_path, &source.text, &matched_lines);
    let (chars, ret_bytes, ret_lines) = result_counts(&pg.text);
    LocalFetchResult {
        path: q.path.to_string(),
        source_sha256: Some(source.sha256),
        content: Some(pg.text),
        content_view: view.mode,
        minify_fallback: view.fallback,
        warnings,
        total_lines: Some(source.total_lines),
        start_line: ext.start,
        end_line: ext.end,
        source_line_ranges: source_ranges,
        match_ranges: ext.match_ranges,
        matched_lines,
        match_keys,
        blocks,
        selected_match_count: ext.count,
        modified: (view.mode != Some(MinifyMode::Symbols))
            .then(|| facts.modified.clone())
            .flatten(),
        source_chars: Some(source.chars),
        source_bytes: Some(source.bytes),
        returned_chars: Some(chars),
        returned_bytes: Some(ret_bytes),
        returned_lines: Some(ret_lines),
        pagination: Some(pg.pagination),
        // A capped regex scan selected a prefix of the matches.
        is_partial: ((next.as_ref().is_some_and(NextCalls::leaves_more) && !out_of_range)
            || ext.match_limited)
            .then_some(true),
        partial_reasons: [
            (view_limited, PartialReason::FullContent),
            (ext.match_limited, PartialReason::RegexMatchLimit),
        ]
        .into_iter()
        .filter_map(|(applies, reason)| applies.then_some(reason))
        .collect(),
        out_of_range,
        next,
        selection: selection_outcome.map(|chosen| chosen.outcome.receipt),
        ..LocalFetchResult::blank("success")
    }
}

/// A classified page's routes to what it left out: `unfiltered` reads the
/// whole unfiltered view and, when the unknown chunks are narrower,
/// `unfilteredUnknown` reads exactly them (`unfilteredUnknown2`, … the rest
/// of their ranges, as many rows per call as a call takes).
/// `nextCandidatePage` judges what the
/// candidate budget left unjudged.
fn attach_unfiltered(
    calls: &mut NextCalls,
    q: &LocalFetchQuery,
    chosen: &super::selection::Chosen,
) {
    let query = crate::tools::result::query_value(q);
    let mut reads = chosen.unknown_reads(&query).into_iter();
    let first = reads
        .next()
        .and_then(|row| serde_json::from_value(row).ok())
        .map(|query| FetchCall { query });
    calls.unfiltered = unfiltered_read(q);
    calls.unfiltered_unknown = first;
    let rest = reads.collect::<Vec<_>>();
    for (index, batch) in rest
        .chunks(crate::tools::result::rows_per_call(ToolId::LocalFetch))
        .enumerate()
    {
        calls.unfiltered_unknown_rest.insert(
            format!("unfilteredUnknown{}", index + 2),
            crate::tools::result::Continuation::input(
                ToolId::LocalFetch,
                serde_json::json!({ "queries": batch }),
            )
            .build(),
        );
    }
    if let Some(token) = chosen.next_candidates() {
        let mut page = q.clone();
        page.offset = None;
        page.selection = token.parse().ok();
        calls.next_candidate_page = Some(FetchCall { query: page });
    }
}

/// The classified read as an ordinary read ([`crate::tools::selection::unfiltered_row`]).
fn unfiltered_read(q: &LocalFetchQuery) -> Option<FetchCall> {
    let row = crate::tools::selection::unfiltered_row(&serde_json::to_value(q).ok()?, &[]);
    serde_json::from_value(row)
        .ok()
        .map(|query| FetchCall { query })
}

/// A classified read refused before any selection ran: its unfiltered lead
/// is the caller's own read without `clasifyContext`, window and view kept
/// (`unit`, `offset`, `length`, `ranges`, `minify`), so dropping the
/// classifier is the only change. `digest` binds the lead to the source
/// version the refusal saw.
fn unsupported_selection(
    q: &LocalFetchQuery,
    message: &str,
    digest: Option<&str>,
) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(q.path.to_string(), "invalidInput", message.into());
    result.source_sha256 = digest.map(str::to_owned);
    let mut query = q.clone();
    query.clasify_context = None;
    query.selection = None;
    result.next = Some(NextCalls {
        unfiltered: Some(FetchCall { query }),
        ..NextCalls::default()
    });
    result
}

/// The page's continuations: its next page bound to the selection token, plus
/// follow-ups to data the extraction selected but did not return.
fn continue_calls(
    q: &LocalFetchQuery,
    pg: &super::pagination::Page,
    head: bool,
    token: Option<&str>,
    ext: &mut super::extraction::Extraction,
    warnings: &mut Vec<String>,
) -> Option<NextCalls> {
    let mut next = page_next(q, pg, head, warnings);
    if let Some(token) = token
        && let Some(read) = next.as_mut().and_then(|next| next.continue_window.as_mut())
    {
        read.query.selection = token.parse().ok();
    }
    let follow_ups = std::mem::take(&mut ext.next);
    if !pg.out_of_range && !follow_ups.is_empty() {
        next.get_or_insert_with(NextCalls::default)
            .absorb(follow_ups);
    }
    next
}

/// The head page of an untargeted first read whose view would not fit one
/// line page: paging through it is rarely what an unanchored read needs, and
/// the head plus a locate (or an anchored read) costs a fraction of a page.
/// An outline (`symbols`) is already the orientation view and is never cut.
fn head_query(
    q: &LocalFetchQuery,
    mode: Option<MinifyMode>,
    view_bytes: usize,
) -> Option<LocalFetchQuery> {
    (unanchored_first_read(q)
        && mode != Some(MinifyMode::Symbols)
        && view_bytes > super::pagination::LINE_PAGE_BYTES)
        .then(|| LocalFetchQuery {
            unit: Some(WindowUnit::Lines),
            length: wire_positive(HEAD_LINES),
            ..q.clone()
        })
}

/// A returned window shows a private-key block redacted over the whole
/// source before the window was cut.
const KEY_BLOCK_NOTE: &str =
    "Redacted private-key block(s) found in the source before selecting the window.";

/// The decoded source, redacted before any window is cut from it.
struct Source {
    sha256: String,
    /// The redacted text; a non-match read shares its preparation's copy.
    text: std::sync::Arc<String>,
    chars: usize,
    bytes: usize,
    total_lines: usize,
    key_blocks_redacted: bool,
    match_redacted: bool,
    /// The source lines the source-wide redactions changed (1-based,
    /// ascending), with the placeholders each introduced: literal
    /// `[REDACTED…]` text in the source is not a redaction.
    redacted_lines: Vec<(usize, usize)>,
    warnings: Vec<String>,
}

impl Source {
    /// Placeholders the source-wide redactions put on `lines` (1-based).
    fn redactions_on(&self, lines: impl IntoIterator<Item = usize>) -> usize {
        lines
            .into_iter()
            .filter_map(|line| {
                self.redacted_lines
                    .binary_search_by_key(&line, |(redacted, _)| *redacted)
                    .ok()
            })
            .map(|index| self.redacted_lines[index].1)
            .sum()
    }
}

/// Count `lines` (the placeholders a view's own redaction put on source
/// lines) with the source-wide `redacted` ones.
fn add_redacted_lines(redacted: &mut Vec<(usize, usize)>, lines: &[(usize, usize)]) {
    if lines.is_empty() {
        return;
    }
    redacted.extend_from_slice(lines);
    redacted.sort_unstable_by_key(|(line, _)| *line);
    redacted.dedup_by(|later, kept| {
        let same = later.0 == kept.0;
        if same {
            kept.1 += later.1;
        }
        same
    });
}

/// The `[REDACTED…]` placeholders `text` shows.
fn placeholders(text: &str) -> usize {
    text.matches(octocode_engine::security::REDACTION_PREFIX)
        .count()
}

/// Placeholders `redacted` holds beyond the literal ones of `raw`.
fn placeholders_added(raw: &str, redacted: &str) -> usize {
    placeholders(redacted).saturating_sub(placeholders(raw))
}

/// The lines a line-preserving redaction of `raw` into `redacted` changed,
/// with the placeholders each gained.
fn redacted_lines(raw: &str, redacted: &str) -> Vec<(usize, usize)> {
    raw.lines()
        .zip(redacted.lines())
        .enumerate()
        .filter(|(_, (raw, redacted))| raw != redacted)
        .map(|(index, (raw, redacted))| (index + 1, placeholders_added(raw, redacted).max(1)))
        .collect()
}

/// A decoded source with its whole-file private-key blocks redacted, and
/// the facts every page of it states. It never holds the key material: the
/// memo keeps it across calls.
struct Prepared {
    /// The decoded text, private-key blocks redacted.
    keyed: std::sync::Arc<String>,
    /// The lines the key-block pass changed, with the placeholders each
    /// gained (empty when it changed nothing).
    key_block_lines: Vec<(usize, usize)>,
    key_blocks_redacted: bool,
    /// Bytes of the source as read (a leading BOM and the encoding
    /// fallback change the decoded text, not the file's size).
    raw_bytes: usize,
    chars: usize,
    total_lines: usize,
    warning: Option<&'static str>,
}

impl Prepared {
    fn of(bytes: &[u8], interior: bool, security: &impl ContentScan) -> Self {
        // Binary detection is a separate heuristic; text that is not UTF-8
        // is decoded (Latin-1 or lossy UTF-8) with a warning, never refused.
        let decoded = if interior {
            octocode_engine::text::Decoded::interior(bytes)
        } else {
            octocode_engine::text::decode(bytes)
        };
        let raw = decoded.text;
        // Redact whole private-key blocks across the full file BEFORE any
        // window/extraction, so a bounded read of an interior body line
        // cannot leak a key whose BEGIN/END markers fall outside the
        // selected window (the anchored built-in patterns only match a
        // complete block in a single view).
        let (keyed, changed) = security.redact_key_blocks(&raw);
        Self {
            chars: raw.encode_utf16().count(),
            total_lines: line_count(&raw),
            raw_bytes: bytes.len(),
            // The pass keeps the line count, so its changes map onto lines.
            key_block_lines: if changed {
                redacted_lines(&raw, &keyed)
            } else {
                Vec::new()
            },
            key_blocks_redacted: changed,
            keyed: std::sync::Arc::new(keyed),
            warning: decoded.warning,
        }
    }
}

/// Sources at least this large are prepared once per version for every
/// page a runtime serves; smaller ones are cheap to prepare again.
const PREPARED_MIN_BYTES: usize = 256 * 1024;

/// A prepared source's key: its path, byte digest and whether the bytes
/// begin inside the file ([`SourceFacts::interior`]).
type PreparedKey = (std::path::PathBuf, String, bool);

/// Prepared sources by [`PreparedKey`] (the digest names the bytes, so an
/// entry never goes stale). One process holds one content scanner.
static PREPARED: octocode_io::memo::Memo<PreparedKey, Prepared> =
    octocode_io::memo::Memo::new(octocode_io::memo::MemoLimits {
        max_entries: 4,
        max_weight: 96 * 1024 * 1024,
        keep_newest: false,
    });

/// One preparation per large version at a time: rows of a batch reading it
/// concurrently wait for the first and take its value from the slot.
static PREPARING: octocode_io::flight::KeyedFlight<PreparedKey, Option<std::sync::Arc<Prepared>>> =
    octocode_io::flight::KeyedFlight::transient();

/// The prepared source of `bytes` (digest `sha256`) at `source_path`: from
/// the memo when an earlier page (or a concurrent row) prepared the same
/// version. A row waiting for a concurrent row's preparation stops when
/// `cancel` fails.
fn prepared(
    bytes: &[u8],
    sha256: &str,
    interior: bool,
    source_path: &std::path::Path,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
) -> Result<std::sync::Arc<Prepared>, String> {
    if bytes.len() < PREPARED_MIN_BYTES {
        return Ok(std::sync::Arc::new(Prepared::of(bytes, interior, security)));
    }
    // Rows prepare in blocking row workers, never on an async worker.
    PREPARING.memoized_blocking(
        (source_path.to_path_buf(), sha256.to_owned(), interior),
        |key| PREPARED.get(key).map(|hit| hit.value),
        |key| {
            let prepared = Prepared::of(bytes, interior, security);
            let weight = prepared.keyed.len()
                + prepared.key_block_lines.len() * 2 * std::mem::size_of::<usize>();
            PREPARED.insert(key, prepared, weight, None)
        },
        || cancel.check(),
    )
}

/// Decode and redact the source; a stale snapshot, a cancel or a failed
/// redaction ends the read. The decoded, key-redacted text of a large source
/// is prepared once per version (see [`prepared`]).
fn prepare_source(
    q: &LocalFetchQuery,
    bytes: &[u8],
    sha256: String,
    facts: &SourceFacts,
    source_path: &std::path::Path,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
) -> Result<Source, Box<LocalFetchResult>> {
    if let Some(expected) = q.snapshot.as_deref()
        && **expected != sha256
    {
        return Err(Box::new(stale_snapshot(q)));
    }
    let cancelled = |e| Box::new(LocalFetchResult::error(q.path.to_string(), "cancelled", e));
    cancel.check().map_err(cancelled)?;
    let prepared = prepared(
        bytes,
        &sha256,
        facts.interior,
        source_path,
        security,
        cancel,
    )
    .map_err(cancelled)?;
    let key_blocks_redacted = prepared.key_blocks_redacted;
    // matchString runs on redacted text: sanitize the whole source (line-count
    // preserving) before matching so a probe cannot confirm a secret that the
    // returned window would redact (exact-prefix oracle).
    let (text, match_redacted) = if q.match_string.is_some() {
        let (text, redacted) = security
            .redact_source_lines(&prepared.keyed, source_path, &sha256)
            .map_err(|(code, message)| {
                Box::new(LocalFetchResult::error(q.path.to_string(), &code, message))
            })?;
        (std::sync::Arc::new(text), redacted)
    } else {
        (std::sync::Arc::clone(&prepared.keyed), false)
    };
    // Both passes keep the line count, so their changes map onto lines.
    let mut redacted = prepared.key_block_lines.clone();
    if match_redacted {
        add_redacted_lines(&mut redacted, &redacted_lines(&prepared.keyed, &text));
    }
    Ok(Source {
        sha256,
        text,
        chars: prepared.chars,
        bytes: prepared.raw_bytes,
        total_lines: prepared.total_lines,
        key_blocks_redacted,
        match_redacted,
        redacted_lines: redacted,
        warnings: prepared.warning.map(str::to_owned).into_iter().collect(),
    })
}

/// A failed selection; an invalid regex carries its repaired read (the
/// message names the item and the parser's reason), and ranges that all start
/// past the file end carry the same read of the file's last window.
pub(super) fn extraction_error(
    q: &LocalFetchQuery,
    error: ExtractionError,
    total_lines: usize,
) -> LocalFetchResult {
    let mut result =
        LocalFetchResult::error(q.path.to_string(), error.kind.error_code(), error.message());
    let repair = match error.kind {
        ExtractionErrorKind::InvalidPattern => super::pattern_repair::repair(q),
        ExtractionErrorKind::InvalidInput => q.last_window_span(total_lines).map(|(start, end)| {
            let mut query = q.clone();
            query.set_line_span(start, end);
            FetchCall { query }
        }),
        ExtractionErrorKind::ExecutionFailed => None,
    };
    result.next = repair.map(|repair| NextCalls {
        repair: Some(repair),
        ..NextCalls::default()
    });
    result
}

/// A matchString that selected no line: an empty row with its facts.
fn no_match(q: &LocalFetchQuery, source: &Source, regex: &impl RegexMatch) -> LocalFetchResult {
    // In a file with redactions the text may sit behind a placeholder; that
    // fact depends only on the file, never on the guess (no oracle), and
    // reveals no more than a plain fetch (which shows the placeholders).
    // Every lead below counts lines of the redacted text, so it is the same
    // for a right and a wrong guess at a secret: the leads stay, and the
    // redaction is one more fact beside them.
    let redacted = source.match_redacted || source.key_blocks_redacted;
    let mut warnings = Vec::new();
    // A case-sensitive miss reruns as the same read, case-insensitive, only
    // when that read selects lines; the count is the fact beside the lead.
    let insensitive =
        Some(insensitive_match_count(q, &source.text, regex)).filter(|count| *count > 0);
    let ignore_case = insensitive.map(|count| {
        warnings.push(format!(
            "{count} {} ignoring case.",
            if count == 1 {
                "line matches"
            } else {
                "lines match"
            }
        ));
        let mut query = q.clone();
        query.case_mode = Some(ReadCaseMode::Insensitive);
        FetchCall { query }
    });
    // A `ranges` read that missed while this file has hits outside its
    // ranges: the same read without them selects those lines.
    let outside = q
        .has_ranges()
        .then(|| {
            let mut whole = q.clone();
            whole.ranges.clear();
            let count = super::extraction::extract(&whole, &source.text, regex)
                .ok()
                .and_then(|extraction| extraction.count)
                .unwrap_or(0);
            (count > 0).then_some((count, whole))
        })
        .flatten();
    let read = outside.map(|(count, query)| {
        warnings.push(format!(
            "{count} {} outside the requested ranges.",
            if count == 1 {
                "line matches"
            } else {
                "lines match"
            }
        ));
        FetchCall { query }
    });
    // A literal `|` read as alternation: the same read with each side as
    // its own matchString, when that selects lines here.
    let alternatives = bar_alternatives(q);
    let repair = alternatives
        .as_ref()
        .filter(|_| read.is_none())
        .and_then(|query| {
            let count = super::extraction::extract(query, &source.text, regex)
                .ok()
                .and_then(|extraction| extraction.count)
                .unwrap_or(0);
            (count > 0).then(|| {
                warnings.push(format!(
                    "{count} {} with each `|`-separated part as its own matchString.",
                    if count == 1 {
                        "line matches"
                    } else {
                        "lines match"
                    }
                ));
                FetchCall {
                    query: query.clone(),
                }
            })
        });
    // The text may live in another file of this directory: one localSearch
    // there finds it (not offered when this file holds it outside the
    // ranges); a literal `|` searches for each of its parts.
    let search = (read.is_none() && repair.is_none())
        .then(|| {
            let dir = Path::new(q.path.as_str())
                .parent()
                .map(|dir| dir.to_string_lossy().into_owned())
                .filter(|dir| !dir.is_empty())
                .unwrap_or_else(|| ".".to_owned());
            let searched = alternatives.as_ref().unwrap_or(q);
            super::extraction::search_lead(searched, &dir, &searched.match_strings())
        })
        .flatten();
    LocalFetchResult {
        path: q.path.to_string(),
        source_sha256: Some(source.sha256.clone()),
        content: Some(String::new()),
        content_view: None,
        next: Some(NextCalls {
            text_search: search,
            ignore_case,
            read,
            repair,
            ..NextCalls::default()
        })
        .filter(|next| !next.is_empty()),
        warnings,
        hints: no_match_hints(q, redacted),
        total_lines: Some(source.total_lines),
        selected_match_count: Some(0),
        source_chars: Some(source.chars),
        source_bytes: Some(source.bytes),
        returned_chars: Some(0),
        returned_bytes: Some(0),
        returned_lines: Some(0),
        ..LocalFetchResult::blank("empty")
    }
}

/// The selected text in the view it is returned in (`mode` `None`: as is).
struct View {
    text: String,
    mode: Option<MinifyMode>,
    fallback: Option<MinifyFallback>,
}

/// Apply the requested `minify` view to the extracted text. A match read
/// stays verbatim evidence; an outline the file type cannot give falls
/// back to the standard view.
fn select_view(
    q: &LocalFetchQuery,
    ext: &mut super::extraction::Extraction,
    source_redactions: &mut Vec<(usize, usize)>,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> View {
    let requested = q.minify_mode();
    let selected = std::mem::take(&mut ext.text);
    // matchString reads are verbatim source; the tool description says so,
    // so the row carries no fallback notice. Byte windows address the
    // selected view (a numbered walk pages an oversized line by view bytes),
    // so they take no view of their own here.
    if q.match_string.is_some() {
        return View {
            text: selected,
            mode: None,
            fallback: None,
        };
    }
    // Every transformed view keeps the citation gutter (`N\t`): the standard
    // view numbers each kept line with its source line, the outline uses the
    // same separator in every language.
    let standard_view = |selected: &str| {
        let view =
            octocode_engine::minify::apply::apply_content_view_minification(selected, &q.path);
        let lines = ext.source_lines.as_deref();
        // A compaction that joins lines would cite them wrong: keep lines whole.
        crate::tools::numbered::number_view(selected, lines, &view)
            .unwrap_or_else(|| crate::tools::numbered::line_faithful_view(selected, lines))
    };
    let view = |text, mode| View {
        text,
        mode,
        fallback: None,
    };
    match requested {
        None => view(selected, None),
        Some(MinifyMode::Standard) => view(standard_view(&selected), Some(MinifyMode::Standard)),
        Some(MinifyMode::Symbols) => {
            match symbols_view(
                crate::tools::declarations_cache::symbols_store(),
                &selected,
                &q.path,
                source_path,
                security,
            )
            .as_ref()
            {
                crate::tools::declarations_cache::SymbolsView {
                    outline: Ok(outline),
                    warning,
                    redacted_lines,
                } => {
                    // An outline from a recovered parse says where it is blind,
                    // once: on the outline's first page.
                    if q.offset().unwrap_or(0) == 0 {
                        ext.warnings.extend(warning.clone());
                    }
                    // The outline shows the placeholders its render put in: the
                    // page counts them as source-wide redactions.
                    add_redacted_lines(source_redactions, redacted_lines);
                    view(outline.clone(), Some(MinifyMode::Symbols))
                }
                // `minifyFallback` is the typed notice of the applied view.
                crate::tools::declarations_cache::SymbolsView {
                    outline: Err(reason),
                    ..
                } => View {
                    text: standard_view(&selected),
                    mode: Some(MinifyMode::Standard),
                    fallback: Some(MinifyFallback {
                        requested: MinifyMode::Symbols,
                        applied: MinifyMode::Standard,
                        reason: reason.as_str().into(),
                    }),
                },
            }
        }
    }
}

/// The outline of `source` with its declaration spans, or why it has none,
/// and the recovered-parse note: one render per source version, shared by
/// every page of the outline (across processes under persistent storage).
/// The outline's lines are the source's own: no whitespace pass, which
/// would join tokens (`boolean{`, `string,...args`).
///
/// The view is kept (in memory and on disk), so it renders from the source
/// redacted line by line first: no kept outline ever holds a secret, and a
/// kept one is served without scanning the source again. A source the
/// scanner refuses renders unredacted for this page only (each page scans
/// what it returns) and is never kept.
pub(super) fn symbols_view(
    store: &crate::cache::Store<crate::tools::declarations_cache::SymbolsView>,
    source: &str,
    path: &str,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> std::sync::Arc<crate::tools::declarations_cache::SymbolsView> {
    crate::tools::declarations_cache::symbols_view(store, source, path, || {
        match crate::security::scan::redact_lines(security, source, source_path) {
            Ok((redacted, changed)) => {
                let redacted_lines = if changed {
                    redacted_lines(source, &redacted)
                } else {
                    Vec::new()
                };
                Ok(render_symbols_view(&redacted, path, redacted_lines))
            }
            Err(_) => Err(render_symbols_view(source, path, Vec::new())),
        }
    })
}

/// The symbols view of `source`, which the caller has redacted.
fn render_symbols_view(
    source: &str,
    path: &str,
    redacted_lines: Vec<(usize, usize)>,
) -> crate::tools::declarations_cache::SymbolsView {
    let code = |outline: String| {
        let outline =
            declaration_ranges(crate::tools::numbered::tab_gutter(&outline), source, path);
        (
            Ok(outline),
            super::block::outline_recovery_warning(source, path),
        )
    };
    // One parse serves the outline and the declarations its spans and
    // recovery note read: the declarations seed the shared cache those
    // readers take them from.
    let (signatures, declarations) =
        octocode_engine::signatures::extract_signatures_with_declarations(source, path);
    if let Some(declarations) = declarations {
        let _ =
            crate::tools::declarations_cache::document(source, path, None, || Some(declarations));
    }
    let (outline, warning) = match signatures {
        Ok(outline) => code(outline),
        Err(reason) => match crate::content::markdown_heading_outline(source, path) {
            Some(headings) => code(headings),
            // A data document lists its keys, gutters and spans included.
            None => match super::key_outline::key_outline(source, path) {
                Some(keys) if keys.text.len() < source.len() => (
                    Ok(keys.text),
                    keys.unparsed.map(|lines| {
                        let noun = if lines.contains([',', '-']) { "lines" } else { "line" };
                        format!(
                            "The parser could not parse {noun} {lines} of this file and resumed after them, so this outline may miss keys or tables there."
                        )
                    }),
                ),
                Some(_) => (Err(OutlineUnavailable::NotSmaller), None),
                None => (Err(reason), None),
            },
        },
    };
    crate::tools::declarations_cache::SymbolsView {
        outline,
        warning,
        redacted_lines,
    }
}

/// An outline whose declaration heads carry their line span: the gutter
/// of a multi-line declaration's head row reads `head-end`, so a body is one
/// `ranges` read away. The head row is the one holding the declaration's
/// name (a class, method or field line, not the annotation or decorator
/// rows a declaration may start with: those stay plain rows above it, in
/// every grammar), else its first shown row. The gutter is metadata, not
/// source text; the TAB still separates the source.
fn declaration_ranges(outline: String, source: &str, path: &str) -> String {
    let Some(declared) = super::block::declarations(source, path) else {
        return outline;
    };
    let row_line = |record: &str| {
        record
            .split_once(crate::tools::numbered::SEPARATOR)
            .and_then(|(number, _)| number.parse::<usize>().ok())
    };
    let mut rows: Vec<usize> = outline.lines().filter_map(row_line).collect();
    rows.sort_unstable();
    let mut ends = std::collections::HashMap::<usize, usize>::new();
    for declaration in declared {
        let head = if rows.binary_search(&declaration.line).is_ok() {
            Some(declaration.line)
        } else {
            rows.get(rows.partition_point(|row| *row < declaration.start))
                .copied()
                .filter(|row| *row <= declaration.end)
        };
        if let Some(head) = head.filter(|head| *head < declaration.end) {
            let entry = ends.entry(head).or_insert(declaration.end);
            *entry = (*entry).max(declaration.end);
        }
    }
    let mut out = String::with_capacity(outline.len() + ends.len() * 6);
    for record in outline.split_inclusive('\n') {
        match row_line(record).and_then(|line| Some((line, ends.remove(&line)?))) {
            Some((line, end)) => {
                out.push_str(&format!("{line}-{end}"));
                out.push_str(&record[line.to_string().len()..]);
            }
            None => out.push_str(record),
        }
    }
    out
}

/// One returned page after the secret scan.
struct ScannedPage {
    page: super::pagination::Page,
    /// The scan changed the page.
    redacted: bool,
    /// Placeholders the scan put on the page.
    redactions: usize,
    /// The scanned view is empty.
    empty: bool,
    /// The scan kept the view's line count, so the page maps onto source lines.
    lines_kept: bool,
    warnings: Vec<String>,
}

/// How a page is cut from a view: the page's query, the view text, the
/// bytes one line page may hold, and the raw source lines a transformed
/// view pages in (see [`page_within`]).
#[derive(Clone, Copy)]
struct PageWindow<'a> {
    query: &'a LocalFetchQuery,
    view: &'a str,
    line_page_bytes: usize,
    source_lines: Option<&'a SourceLines>,
}

/// Cut the page and scan it for secrets. A line or byte page is scanned on
/// its own window (see `sanitize_line_page` / `sanitize_byte_page`); a
/// complete view, or a window whose scan fails, takes the whole-view scan,
/// which owns the typed security-limit recovery.
fn scan_page(
    q: &LocalFetchQuery,
    cut: &PageWindow<'_>,
    source_path: &std::path::Path,
    security: &impl ContentScan,
    source: &Source,
    first_line: Option<usize>,
) -> Result<ScannedPage, Box<LocalFetchResult>> {
    let PageWindow {
        query: page_q,
        view: selected,
        line_page_bytes,
        source_lines,
    } = *cut;
    if q.full_content != Some(true) {
        let raw = page_within(selected, page_q, line_page_bytes, source_lines);
        let literal = placeholders(&raw.text);
        let windowed = if raw.pagination.unit == WindowUnit::Lines {
            sanitize_line_page(selected, raw, source_path, security).unwrap_or(None)
        } else {
            sanitize_byte_page(selected, raw, source_path, security).unwrap_or(None)
        };
        // Page sanitizers keep line counts, so a redacted page still maps
        // onto source lines.
        if let Some((page, redacted)) = windowed {
            let redactions = if redacted {
                placeholders(&page.text).saturating_sub(literal)
            } else {
                0
            };
            return Ok(ScannedPage {
                page,
                redacted,
                redactions,
                empty: selected.is_empty(),
                lines_kept: true,
                warnings: vec![],
            });
        }
    }
    let (safe, warnings) = match security.sanitize(selected, source_path) {
        Ok(scanned) => scanned,
        Err((code, _)) if code == "contentSecurityLimit" => {
            return Err(Box::new(security_limit(q, &code, source, first_line)));
        }
        Err((code, message)) => {
            return Err(Box::new(LocalFetchResult::error(
                q.path.to_string(),
                &code,
                message,
            )));
        }
    };
    // A whole-view scan maps onto source lines only when it kept the count.
    let lines_kept = safe == selected || line_count(&safe) == line_count(selected);
    let page = page_within(
        &safe,
        page_q,
        line_page_bytes,
        source_lines.filter(|_| lines_kept),
    );
    let redacted = safe != selected;
    // The same page of the unscanned view, when the scan kept its lines;
    // otherwise every placeholder past the view's literal ones counts.
    let redactions = match redacted {
        false => 0,
        true if lines_kept => placeholders_added(
            &page_within(selected, page_q, line_page_bytes, source_lines).text,
            &page.text,
        ),
        true => placeholders_added(selected, &safe),
    };
    Ok(ScannedPage {
        page,
        redacted,
        redactions,
        empty: safe.is_empty(),
        lines_kept,
        warnings,
    })
}

/// The selected view is too large to scan: a terminal row that offers one
/// source line instead.
fn security_limit(
    q: &LocalFetchQuery,
    code: &str,
    source: &Source,
    first_line: Option<usize>,
) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        code,
        "The selected content view exceeds the secret scanner size limit. Byte windows cannot safely split unscanned content. Select a smaller source-line range.".into(),
    );
    result.total_lines = Some(source.total_lines);
    result.source_chars = Some(source.chars);
    result.source_bytes = Some(source.bytes);
    result.terminal_limit(PartialReason::SecuritySelectedView);
    if source.total_lines > 1 && (q.start_line().is_none() || q.start_line() != q.end_line()) {
        let line = first_line.or(q.start_line()).unwrap_or(1);
        result.next = Some(NextCalls {
            read_bounded_lines: Some(FetchCall {
                query: single_line_query(q, line),
            }),
            ..NextCalls::default()
        });
    }
    result
}

/// Redacted text is not the source: say so, as localSearch does. Only the
/// placeholders this read put on the page count (a byte page may show part
/// of a redacted line, so never more than the page holds): literal
/// `[REDACTED…]` text in the source is verbatim.
fn warn_redacted(text: &str, view_redacted: bool, redactions: usize, warnings: &mut Vec<String>) {
    let redactions = redactions.min(placeholders(text));
    if redactions > 0 {
        warnings.push(format!(
            "redactedContent: {redactions} secret-shaped value(s) in the returned text were replaced by [REDACTED…] placeholders; this content is not verbatim source."
        ));
    } else if view_redacted {
        warnings.push(
            "redactedContent: secret-shaped text in the requested view was redacted; this content is not verbatim source.".into(),
        );
    }
}

/// matchString runs on redacted text, so a match inside a redacted value is
/// not selected: name how many redacted lines the selection does not show
/// (as a hit or as context), so they are not dropped silently. The count
/// depends only on the file and the selection (a plain read shows the same
/// placeholders), never on the guess. It is the same on every page, so the
/// first page states it. A `ranges` read counts hits inside its ranges only,
/// so it is left out.
fn warn_unmatchable(
    q: &LocalFetchQuery,
    source: &Source,
    ext: &super::extraction::Extraction,
    warnings: &mut Vec<String>,
) {
    if !source.match_redacted || q.match_string.is_none() || q.has_ranges() {
        return;
    }
    let mut shown = match (&ext.source_lines, ext.start, ext.end) {
        (Some(lines), _, _) => lines.clone(),
        (None, Some(start), Some(end)) => (start..=end).collect(),
        _ => ext.matched_lines.clone(),
    };
    shown.sort_unstable();
    let unseen = source
        .redacted_lines
        .iter()
        .filter(|(line, _)| shown.binary_search(line).is_err())
        .count();
    if unseen > 0 {
        let lines = if unseen == 1 { "line" } else { "lines" };
        warnings.push(format!(
            "{unseen} redacted {lines} outside this result: matchString cannot see text behind a [REDACTED…] placeholder; a plain read shows where they are."
        ));
    }
}

/// The page's own continuation: the next page, or a restart for an offset
/// past the end of the view.
fn page_next(
    q: &LocalFetchQuery,
    pg: &super::pagination::Page,
    head: bool,
    warnings: &mut Vec<String>,
) -> Option<NextCalls> {
    if !pg.out_of_range {
        let mut next = continuation(q, &pg.pagination);
        // Paging on from a line head uses the default line page size. A head
        // that fell back to a byte page (one oversized line) keeps its unit
        // and window: they give `offset` its meaning.
        if head
            && pg.pagination.unit == WindowUnit::Lines
            && let Some(read) = next.as_mut().and_then(|next| next.continue_window.as_mut())
        {
            read.query.length = None;
            read.query.unit = None;
        }
        return next;
    }
    let total = match pg.pagination.unit {
        WindowUnit::Lines => pg.pagination.total_lines,
        WindowUnit::Bytes => pg.pagination.total_bytes,
    };
    Some(past_end(q, total, pg.pagination.unit, warnings))
}

/// The one shape of a page asked past the end of its view, whatever reads
/// the source (whole or streamed): nothing returned, a warning naming the
/// view's `total` in `unit`, and the restart at offset 0.
pub(super) fn past_end(
    q: &LocalFetchQuery,
    total: usize,
    unit: WindowUnit,
    warnings: &mut Vec<String>,
) -> NextCalls {
    let unit = match unit {
        WindowUnit::Lines => "lines",
        WindowUnit::Bytes => "bytes",
    };
    warnings.push(format!(
        "offset {} is past the end of the selected view ({total} {unit}); nothing was returned.",
        q.offset().unwrap_or(0),
    ));
    let mut query = q.clone();
    query.offset = Some(0);
    NextCalls {
        restart: Some(FetchCall { query }),
        ..NextCalls::default()
    }
}

/// Notes for a read's scope: a reversed range and a long-line byte walk.
/// A large file's head needs none: the description states the head size and
/// the row carries `totalLines` and `continueWindow`.
fn read_scope_warnings(
    q: &LocalFetchQuery,
    pg: &super::pagination::Page,
    warnings: &mut Vec<String>,
) {
    warnings.extend(reversed_range_warnings(q));
    let page = &pg.pagination;
    if let Some(requested) = q.offset()
        && q.unit == Some(WindowUnit::Bytes)
        && page.unit == WindowUnit::Bytes
        && !pg.out_of_range
        && page.offset < requested
    {
        warnings.push(format!(
            "Byte offset {requested} falls inside a UTF-8 character; the page starts at its first byte, {}.",
            page.offset
        ));
    }
    if let Some(pages) = long_line_pages(q, pg) {
        warnings.push(long_line_warning(pages));
    }
}

/// A line read fell back to byte pages inside one line this long (a
/// minified bundle, a one-line JSON dump) takes this many pages or more
/// before its first page names the faster routes.
const LONG_LINE_PAGES: usize = 8;

/// The byte pages a file's first page opens, when a line read had to page by
/// bytes (one line over a line page) and there are [`LONG_LINE_PAGES`] or
/// more of them.
fn long_line_pages(q: &LocalFetchQuery, pg: &super::pagination::Page) -> Option<usize> {
    let asked_bytes = q.unit == Some(WindowUnit::Bytes) || q.full_content == Some(true);
    let page = &pg.pagination;
    let pages = page.total_bytes.checked_div(page.length)?;
    (!asked_bytes
        && page.unit == WindowUnit::Bytes
        && page.offset == 0
        && page.has_more
        && pages >= LONG_LINE_PAGES)
        .then(|| page.total_bytes.div_ceil(page.length))
}

fn long_line_warning(pages: usize) -> String {
    use crate::tools::id::query_limits::local_fetch::LENGTH_MAXIMUM;
    format!(
        "One line fills this file: {pages} byte pages to read it through. Faster: matchString returns byte windows around each hit \
         (not with `contextLines:0`), or unit:\"bytes\" with length:{LENGTH_MAXIMUM} walks it in fewer, larger pages."
    )
}

/// A reversed range (`"50-10"`) reads the same span low end first; the row
/// says so, so the caller sees how its range was read.
fn reversed_range_warnings(q: &LocalFetchQuery) -> Vec<String> {
    q.ranges
        .iter()
        .filter_map(|range| {
            let (start, end) = crate::tools::line_spans::parse_span_raw::<u64>(range)?;
            (end < start)
                .then(|| format!("Range \"{range}\" is reversed: read as lines {end}-{start}."))
        })
        .collect()
}

/// The source lines a page touches: a raw page's through the view-to-source
/// line map (or its own lines), a transformed view's from its gutter.
fn page_lines(
    pg: &super::pagination::Page,
    source_lines: Option<&[usize]>,
    mode: Option<MinifyMode>,
) -> Vec<usize> {
    if mode.is_some() {
        return pg
            .text
            .lines()
            .filter_map(|line| {
                let (number, _) = line.split_once(crate::tools::numbered::SEPARATOR)?;
                number.split('-').next()?.parse().ok()
            })
            .collect();
    }
    let (first, last) = pg.view_lines;
    match source_lines {
        Some(lines) => lines
            .get(first.saturating_sub(1)..last.min(lines.len()))
            .unwrap_or_default()
            .to_vec(),
        None => (first..=last).collect(),
    }
}

/// The source lines a page shows: through the view-to-source line map when
/// the extraction kept one, else the page's own line span.
fn page_source_ranges(
    source_lines: Option<&[usize]>,
    view_lines: (usize, usize),
) -> Vec<LineRange> {
    let Some(lines) = source_lines else {
        return vec![LineRange {
            start: view_lines.0,
            end: view_lines.1,
        }];
    };
    let mut page_lines: Vec<usize> = lines
        [view_lines.0.saturating_sub(1)..view_lines.1.min(lines.len())]
        .iter()
        .copied()
        .filter(|line| *line != super::extraction::OMISSION_LINE)
        .collect();
    page_lines.dedup();
    compress_ranges(&page_lines)
}

/// A first read with nothing selecting what to return: no match, range,
/// block, page cursor, page size, or whole-file request.
fn unanchored_first_read(q: &LocalFetchQuery) -> bool {
    q.match_string.is_none()
        && !q.has_ranges()
        && q.start_line().is_none()
        && q.end_line().is_none()
        && !q.block()
        && q.full_content != Some(true)
        && q.offset().is_none()
        && q.window_length().is_none()
        && q.unit.is_none()
}

/// Same file and caller metadata, every extraction selector reset to one raw line.
fn single_line_query(q: &LocalFetchQuery, line: usize) -> LocalFetchQuery {
    let mut query = LocalFetchQuery {
        minify: None,
        full_content: None,
        match_string: None,
        regex: None,
        case_mode: None,
        whole_word: None,
        context_lines: None,
        unit: None,
        offset: None,
        length: None,
        ..q.clone()
    };
    query.set_line_span(line, line);
    query
}

/// The continued source changed since its page was cut. Pages of two file
/// versions must not be combined. The row names no restart of its own: the
/// runtime's one restart owner (`response::pages::restart_stale`, through
/// [`crate::tools::result::restart_query`]) adds the caller's whole query
/// without its cursors, so a streamed range read restarts every range.
pub(super) fn stale_snapshot(q: &LocalFetchQuery) -> LocalFetchResult {
    LocalFetchResult::error(
        q.path.to_string(),
        "staleSnapshot",
        crate::response::pages::STALE_SNAPSHOT_ERROR.into(),
    )
}

/// The first bounded line page of the same view as a complete read.
fn bounded_query(q: &LocalFetchQuery) -> LocalFetchQuery {
    let mut query = q.clone();
    query.full_content = None;
    query.unit = Some(WindowUnit::Lines);
    query.offset = Some(0);
    query.length = wire_positive(DEFAULT_LINE_CHUNK);
    query
}

pub(crate) fn compress_ranges(lines: &[usize]) -> Vec<LineRange> {
    crate::tools::line_spans::runs(lines.iter().copied())
        .into_iter()
        .map(|(start, end)| LineRange { start, end })
        .collect()
}
fn system_time_iso(t: std::time::SystemTime) -> Option<String> {
    let elapsed = t.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(crate::civil_date::iso8601_millis(
        i64::try_from(elapsed.as_millis()).ok()?,
    ))
}

/// Why a matchString can miss text that is in the file: it ran on the
/// redacted text, whose secrets are placeholders. A fact of the file, stated
/// beside the miss's leads, not as its cause.
pub(super) const REDACTED_MATCH_HINT: &str = "matchString ran on redacted text: text behind this file's [REDACTED…] placeholders cannot match.";

/// The per-call facts of a matchString that selected no line: redaction
/// (the text may sit behind a placeholder) and a literal `|` (read as
/// alternation by most agents; it is not one). The leads beside the row
/// (`ignoreCase`, `findText`) are its next steps.
fn no_match_hints(q: &LocalFetchQuery, redacted: bool) -> Vec<String> {
    let mut hints = Vec::new();
    if redacted {
        hints.push(REDACTED_MATCH_HINT.to_owned());
    }
    if !q.is_regex()
        && q.match_strings()
            .iter()
            .any(|pattern| pattern.contains('|'))
    {
        hints.push("`|` in matchString matched literally, not as alternation.".to_owned());
    }
    hints
}

/// A literal read whose matchString holds `|`: the same read with every
/// `|`-separated part as its own matchString (a list matches any entry),
/// as alternation would; `None` without a `|` or past the list limit.
fn bar_alternatives(q: &LocalFetchQuery) -> Option<LocalFetchQuery> {
    use crate::tools::id::query_limits::local_fetch::MATCH_STRING_MAX_ITEMS;
    let patterns = q.match_strings();
    if q.is_regex() || !patterns.iter().any(|pattern| pattern.contains('|')) {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in patterns.iter().flat_map(|pattern| pattern.split('|')) {
        if !part.is_empty() && !parts.contains(&part) {
            parts.push(part);
        }
    }
    if parts.is_empty() || parts.len() > MATCH_STRING_MAX_ITEMS {
        return None;
    }
    let mut query = q.clone();
    query.match_string = serde_json::from_value(serde_json::json!(parts)).ok();
    query.match_string.is_some().then_some(query)
}

/// Lines the same read selects when every pattern matches case-insensitively;
/// 0 when the patterns do not compile that way either, or already matched so.
fn insensitive_match_count(q: &LocalFetchQuery, text: &str, regex: &impl RegexMatch) -> usize {
    // A read that matched every pattern ignoring case already ran this one.
    if !q
        .match_strings()
        .iter()
        .any(|pattern| q.case_sensitive_for(pattern))
    {
        return 0;
    }
    let mut insensitive = q.clone();
    insensitive.case_mode = Some(ReadCaseMode::Insensitive);
    super::extraction::extract(&insensitive, text, regex)
        .ok()
        .and_then(|extraction| extraction.count)
        .unwrap_or(0)
}

#[cfg(test)]
mod timestamp_tests {
    use super::system_time_iso;
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn preserves_millisecond_precision() {
        assert_eq!(
            system_time_iso(UNIX_EPOCH + Duration::from_millis(1_600_000_000_443)),
            Some("2020-09-13T12:26:40.443Z".into())
        );
    }
}

#[cfg(test)]
mod source_size_tests {
    use super::*;
    use crate::tools::cancel::NeverCancel;
    use std::fs;

    use super::super::tests::{Paths, q};
    use crate::security::scan::Passthrough;
    use crate::tools::test_support::Fixture;

    /// Read `req` under `dir` with a passthrough scan.
    fn fetch(req: &LocalFetchQuery, paths: &Paths) -> LocalFetchResult {
        execute_local_fetch(
            req,
            paths,
            &Passthrough,
            &NeverCancel,
            &LocalFetchRegex,
            None,
            None,
        )
    }

    #[test]
    fn utf16_fetch_reads_lines_and_keeps_raw_digest() {
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("source.txt");
        let paths = Paths(root.path().into());
        let source = format!("{}😀\r\nsecond\n", "a".repeat(5000));
        for little in [true, false] {
            let mut bytes = if little {
                vec![0xff, 0xfe]
            } else {
                vec![0xfe, 0xff]
            };
            for unit in source.encode_utf16() {
                bytes.extend(if little {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                });
            }
            fs::write(&file, &bytes).expect("write");
            let mut query = q(&file);
            query.ranges = vec!["2-2".parse().expect("range")];
            let result = fetch(&query, &paths);
            assert_ne!(result.status, "error", "{result:?}");
            assert!(
                result
                    .content
                    .as_deref()
                    .is_some_and(|text| text.contains("second"))
            );
            assert_eq!(
                result.source_sha256.as_deref(),
                Some(crate::digest::sha256(&bytes).as_str())
            );
            bytes.extend([0, 0]);
            fs::write(&file, &bytes).expect("binary");
            assert_eq!(
                fetch(&query, &paths).error_code.as_deref(),
                Some("binaryFileUnsupported")
            );
        }
    }

    #[test]
    fn utf16_past_whole_file_limit_reports_decoding_limit_not_binary() {
        let root = tempfile::tempdir().expect("root");
        let path = root.path().join("large.txt");
        let mut head = vec![0xff, 0xfe];
        for unit in "a".repeat(BINARY_SAMPLE_BYTES).encode_utf16() {
            head.extend(unit.to_le_bytes());
        }
        fs::write(&path, head).expect("head");
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .expect("open")
            .set_len(MAX_SOURCE_BYTES + 2)
            .expect("length");
        let result = fetch(&q(&path), &Paths(root.path().into()));
        assert_eq!(result.error_code.as_deref(), Some("fileTooLarge"));
        assert_eq!(result.terminal_limit, Some(true));
        assert!(
            result
                .error
                .as_deref()
                .is_some_and(|error| error.contains("UTF-16"))
        );
        assert!(result.next.is_none());
    }

    /// A cancelled row stops waiting for another row's preparation of the
    /// same large source instead of waiting until it lands.
    #[test]
    fn a_cancelled_row_stops_waiting_for_another_rows_preparation() {
        struct Cancelled;
        impl CancellationCheck for Cancelled {
            fn check(&self) -> Result<(), String> {
                Err("cancelled".into())
            }
        }
        let bytes = vec![b'x'; PREPARED_MIN_BYTES];
        let path = std::path::Path::new("/flight/cancelled-row.txt");
        let sha256 = crate::digest::sha256(&bytes);
        let holder = PREPARING.join((path.to_path_buf(), sha256.clone(), false));
        let held = holder.blocking_turn();
        let started = std::time::Instant::now();
        let waited = prepared(&bytes, &sha256, false, path, &Passthrough, &Cancelled);
        assert_eq!(waited.err().as_deref(), Some("cancelled"));
        assert!(
            started.elapsed() < std::time::Duration::from_secs(1),
            "{:?}",
            started.elapsed()
        );
        drop(held);
        drop(holder);
    }

    #[test]
    fn source_above_the_streaming_ceiling_returns_file_too_large() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("huge.txt");
        // Sparse file just past the streaming ceiling — the size guard fires
        // before any bytes are read, so this stays cheap.
        let file = fs::File::create(&path).expect("create file");
        let len = super::super::large_source::MAX_STREAM_SOURCE_BYTES + 1;
        file.set_len(len).expect("grow file");
        drop(file);

        let req = q(&path);
        let result = fetch(&req, &Paths(dir.clone()));

        assert_eq!(result.status, "error");
        assert_eq!(result.error_code.as_deref(), Some("fileTooLarge"));
        assert_eq!(result.source_bytes, Some(len as usize));
        assert_eq!(result.terminal_limit, Some(true));
        assert!(
            result
                .error
                .as_deref()
                .expect("error")
                .contains("1073741824 bytes / 1 GiB")
        );
        assert!(!result.error.as_deref().expect("error").contains("10 MiB"));
        assert!(!result.hints.is_empty());
        assert!(!result.hints.join(" ").contains("remove matchString"));
        assert!(result.next.is_none());
    }

    #[test]
    fn growing_in_memory_source_stops_at_guard_with_specific_recovery() {
        let source = vec![b'x'; (MAX_SOURCE_BYTES + 100) as usize];
        let bytes =
            read_in_memory_source(std::io::Cursor::new(source), Vec::new()).expect("bounded read");
        assert_eq!(bytes.len() as u64, MAX_SOURCE_BYTES + 1);
        let result = source_too_large(
            "growing.txt",
            bytes.len() as u64,
            SourceSizeLimit::InMemoryGrowth,
        );
        assert_eq!(result.error_code.as_deref(), Some("fileTooLarge"));
        assert!(
            result
                .error
                .as_deref()
                .expect("error")
                .contains("in-memory read guard")
        );
        assert!(result.hints.join(" ").contains("bounded line window"));
        assert!(!result.hints.join(" ").contains("remove matchString"));
        assert_eq!(result.terminal_limit, Some(true));
    }

    /// A bare read of a source past the whole-file ceiling states the span it
    /// returned (not the window it held) and a line pagination in file lines.
    #[test]
    fn a_streamed_bare_read_states_the_span_it_returned() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("big.log");
        let mut text = String::new();
        let mut lines = 0usize;
        while text.len() as u64 <= MAX_SOURCE_BYTES {
            lines += 1;
            text.push_str(&format!("line {lines} payload payload payload payload\n"));
        }
        fs::write(&path, &text).expect("write");
        let first = fetch(&q(&path), &Paths(dir.clone()));
        assert_eq!(first.status, "success", "{first:?}");
        let returned = first.returned_lines.expect("returned lines");
        assert_eq!(first.end_line, Some(returned), "{first:?}");
        assert!(
            first
                .warnings
                .iter()
                .any(|warning| warning.starts_with("Large source (")),
            "{:?}",
            first.warnings
        );
        let page = first.pagination.as_ref().expect("pagination");
        assert_eq!(page.unit, WindowUnit::Lines, "{page:?}");
        assert_eq!(page.offset, 0, "{page:?}");
        assert_eq!(page.length, returned, "{page:?}");
        assert_eq!(page.total_lines, lines, "{page:?}");
        assert!(page.has_more, "{page:?}");
        assert_eq!(page.next_offset, Some(returned), "{page:?}");
    }

    // Past the whole-file ceiling a plain read streams a bounded line window:
    // exact whole-file totals, a digest-bound continuation that advances,
    // and matchString redirected to localSearch.
    #[test]
    fn oversized_text_source_is_served_as_streamed_line_windows() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("big.log");
        let mut text = String::new();
        let mut lines = 0usize;
        while text.len() as u64 <= MAX_SOURCE_BYTES {
            lines += 1;
            text.push_str(&format!("line {lines} payload payload payload payload\n"));
        }
        fs::write(&path, &text).expect("write");
        let query = |q: LocalFetchQuery| fetch(&q, &Paths(dir.clone()));
        let first = query(q(&path));
        assert_eq!(first.status, "success", "{first:?}");
        assert_eq!(first.total_lines, Some(lines));
        assert_eq!(first.start_line, Some(1));
        assert!(
            first
                .content
                .as_deref()
                .is_some_and(|c| c.starts_with("line 1 "))
        );
        let next = first
            .next
            .as_ref()
            .and_then(|n| n.continue_window.clone())
            .expect("continueWindow");
        assert!(next.query.snapshot.is_some());
        let second = query(next.query);
        assert_eq!(second.status, "success", "{second:?}");
        assert_eq!(second.start_line, first.end_line.map(|line| line + 1));

        // A wide explicit window pages within itself and advances.
        let wide = query(LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ranges: vec![format!("{}-{}", 1, 3_000).parse().expect("range")],
            ..LocalFetchQuery::test_default()
        });
        let inner = wide
            .next
            .as_ref()
            .and_then(|n| n.continue_window.clone())
            .expect("inner continue");
        let wide_two = query(inner.query);
        let page_end = |r: &LocalFetchResult| r.source_line_ranges.last().map(|range| range.end);
        let page_start =
            |r: &LocalFetchResult| r.source_line_ranges.first().map(|range| range.start);
        assert_eq!(
            page_start(&wide_two),
            page_end(&wide).map(|line| line + 1),
            "pages advance"
        );

        let tail = query(LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ranges: vec![format!("{}-{}", lines, lines).parse().expect("range")],
            ..LocalFetchQuery::test_default()
        });
        assert_eq!(tail.start_line, Some(lines), "{tail:?}");
        assert!(
            tail.content
                .as_deref()
                .is_some_and(|c| c.starts_with(&format!("line {lines} ")))
        );
        assert!(tail.next.is_none());

        let matched = query(LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            match_string: Some("line 7 ".parse().expect("match")),
            ..LocalFetchQuery::test_default()
        });
        assert_eq!(matched.error_code.as_deref(), Some("largeSourceWindowOnly"));
        // The localSearch is an executable lead, and the tip stays short.
        let search = matched
            .next
            .as_ref()
            .and_then(|next| next.text_search.clone())
            .expect("findText lead");
        assert_eq!(search["tool"], "localSearch", "{search}");
        assert_eq!(search["query"]["queries"][0]["matchString"], "line 7 ");
        assert!(
            matched.hints.iter().all(|hint| hint.len() <= 120),
            "{matched:?}"
        );
    }

    // Several `ranges` on an oversized source are each streamed window reads:
    // one response holds every requested line once, with an omission marker
    // between non-adjacent ranges, instead of a rejection whose repair
    // restarts at line 1.
    #[test]
    fn oversized_source_serves_several_ranges_in_one_read() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("big.log");
        let mut text = String::new();
        let mut lines = 0usize;
        while text.len() as u64 <= MAX_SOURCE_BYTES {
            lines += 1;
            text.push_str(&format!("line {lines} payload payload payload payload\n"));
        }
        fs::write(&path, &text).expect("write");
        let far = lines - 2;
        let result = fetch(
            &LocalFetchQuery {
                path: path.to_string_lossy().parse().expect("path"),
                ranges: vec![
                    format!("{far}-{}", far + 1).parse().expect("range"),
                    "1-2".parse().expect("range"),
                    "2-3".parse().expect("range"),
                ],
                ..LocalFetchQuery::test_default()
            },
            &Paths(dir.clone()),
        );
        assert_eq!(result.status, "success", "{result:?}");
        assert_eq!(result.total_lines, Some(lines));
        assert_eq!(
            result.content.as_deref(),
            Some(
                format!(
                    "line 1 payload payload payload payload\nline 2 payload payload payload payload\nline 3 payload payload payload payload\n... [lines 4-{} not requested] ...\nline {far} payload payload payload payload\nline {} payload payload payload payload\n",
                    far - 1,
                    far + 1
                )
                .as_str()
            )
        );
        let spans: Vec<(usize, usize)> = result
            .source_line_ranges
            .iter()
            .map(|range| (range.start, range.end))
            .collect();
        assert_eq!(spans, [(1, 3), (far, far + 1)]);
        assert!(result.next.is_none(), "{result:?}");
        assert_eq!(result.error_code, None);
    }

    /// A streamed range pages in its own lines: every page continues where
    /// the last one ended (no stub page at a window boundary), the page
    /// offset counts from the range's start without resetting, every line
    /// is reached once, and the streamed note is stated by the first page.
    #[test]
    fn a_streamed_range_pages_evenly_across_window_boundaries() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("big.log");
        let mut text = String::new();
        let mut lines = 0usize;
        while text.len() as u64 <= MAX_SOURCE_BYTES {
            lines += 1;
            text.push_str(&format!("{:08} payload payload payload payload\n", lines));
        }
        fs::write(&path, &text).expect("write");
        let (start, end) = (100usize, 6_000usize);
        let mut query = LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ranges: vec![format!("{start}-{end}").parse().expect("range")],
            ..LocalFetchQuery::test_default()
        };
        let mut next_line = start;
        let mut sizes = Vec::new();
        for page_index in 0.. {
            let page = fetch(&query, &Paths(dir.clone()));
            assert_eq!(page.status, "success", "{page:?}");
            let pagination = page.pagination.as_ref().expect("pagination");
            assert_eq!(pagination.offset, next_line - start, "page {page_index}");
            assert_eq!(pagination.total_lines, end + 1 - start, "page {page_index}");
            assert_eq!(
                page.warnings.iter().any(|w| w.starts_with("Large source")),
                page_index == 0,
                "page {page_index}: {:?}",
                page.warnings
            );
            let rows = page.content.as_deref().unwrap_or_default().lines().count();
            for row in page.content.as_deref().unwrap_or_default().lines() {
                assert_eq!(
                    row,
                    format!("{next_line:08} payload payload payload payload")
                );
                next_line += 1;
            }
            sizes.push(rows);
            match page.next.and_then(|next| next.continue_window) {
                Some(read) => query = read.query,
                None => break,
            }
        }
        assert_eq!(next_line, end + 1, "every line once");
        // Equal lines: every page but the last is a full page.
        let full = sizes[0];
        assert!(sizes.len() > 2, "{sizes:?}");
        assert!(
            sizes[..sizes.len() - 1].iter().all(|size| *size == full),
            "{sizes:?}"
        );
    }

    // A line chunk of an oversized source larger than one response page
    // pages inside the chunk and then goes on past it: every line from the
    // first is reached once, in order, across the chunk boundary.
    #[test]
    fn oversized_source_line_chunks_continue_past_a_paged_chunk() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("big.log");
        let mut text = String::new();
        let mut lines = 0usize;
        while text.len() as u64 <= MAX_SOURCE_BYTES {
            lines += 1;
            text.push_str(&format!("line {lines} payload payload payload payload\n"));
        }
        fs::write(&path, &text).expect("write");
        let mut query = LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            unit: Some(WindowUnit::Lines),
            length: super::super::types::wire_positive(1_000),
            ..LocalFetchQuery::test_default()
        };
        let mut next_line = 1usize;
        for _ in 0..12 {
            let page = fetch(&query, &Paths(dir.clone()));
            assert_eq!(page.status, "success", "{page:?}");
            for row in page.content.as_deref().unwrap_or_default().lines() {
                assert_eq!(
                    row,
                    format!("line {next_line} payload payload payload payload")
                );
                next_line += 1;
            }
            query = page
                .next
                .as_ref()
                .and_then(|next| next.continue_window.clone())
                .unwrap_or_else(|| panic!("no continuation after line {}", next_line - 1))
                .query;
        }
        assert!(next_line > 2_001, "walked past two chunks: {next_line}");
    }

    #[test]
    fn at_limit_plain_read_is_allowed() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("ok.txt");
        fs::write(&path, "hello\nworld\n").expect("write file");

        let req = q(&path);
        let result = fetch(&req, &Paths(dir.clone()));

        assert_eq!(result.status, "success");
        assert_eq!(result.error_code, None);
    }

    // A bounded read of an interior body line of a private key must not
    // leak the key, even when the file is NOT key-named and the selected window
    // contains no BEGIN/END marker (so the anchored full-block patterns cannot
    // fire). The `Passthrough` scan, proving the full-file block guard
    // — not the window sanitizer — closes the leak.
    #[test]
    fn interior_private_key_window_does_not_leak_in_non_key_named_file() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("notes.txt"); // deliberately NOT a *.pem/id_rsa path
        let body = "MIIEpQIBAAKCAQEAsplitKeyBodyLineOneAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        let body2 = "c3BsaXRLZXlCb2R5TGluZVR3b0JBQkFCQUJBQkFCQUJBQkFCQUJBQkFCQUJBQkFC";
        let file = format!(
            "fn main() {{}}\nlet config = load();\n-----BEGIN RSA PRIVATE KEY-----\n{body}\n{body2}\n-----END RSA PRIVATE KEY-----\nlet done = true;\n"
        );
        fs::write(&path, &file).expect("write file");

        // Select only the interior body lines (4..=5) — no BEGIN/END in view.
        let req = LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ranges: vec![format!("{}-{}", 4, 5).parse().expect("range")],
            ..LocalFetchQuery::test_default()
        };
        let result = fetch(&req, &Paths(dir.clone()));

        let content = result.content.clone().unwrap_or_default();
        assert!(
            !content.contains(body) && !content.contains(body2),
            "private key body leaked from an interior window: {content}"
        );
    }

    // matchString must run on redacted text: a line-level secret that the
    // window sanitizer redacts must not be confirmable by probing matchString
    // (an exact-prefix oracle). Matching the true secret and a wrong guess must
    // be indistinguishable, and line numbers must stay source-accurate.
    #[test]
    fn match_string_cannot_probe_line_level_secrets() {
        use crate::security::ContentSecurity;
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("config.txt");
        let secret = "AKIAIOSFODNN7EXAMPLE";
        fs::write(
            &path,
            format!("header\naws_access_key_id = {secret}\nneedle after\n"),
        )
        .expect("write file");
        let security = ContentSecurity::new();
        let probe = |needle: &str| {
            let req = LocalFetchQuery {
                path: path.to_string_lossy().parse().expect("path"),
                match_string: Some(needle.parse().expect("match string")),
                context_lines: Some(0),
                ..LocalFetchQuery::test_default()
            };
            execute_local_fetch(
                &req,
                &Paths(dir.clone()),
                &security,
                &NeverCancel,
                &LocalFetchRegex,
                None,
                None,
            )
        };
        let right = probe("AKIAIOSFODNN7EXAMPL");
        let wrong = probe("AKIAIOSFODNN7EXAMPQ");
        assert_eq!(right.selected_match_count, wrong.selected_match_count);
        assert_eq!(right.error_code, wrong.error_code);
        assert_eq!(right.selected_match_count, Some(0), "{right:?}");
        // Same hints, and the same leads but for the guess they repeat,
        // either way (no oracle); the hints explain the miss.
        assert_eq!(right.hints, wrong.hints);
        assert_eq!(
            serde_json::to_string(&right.next)
                .expect("json")
                .replace("AKIAIOSFODNN7EXAMPL", "AKIAIOSFODNN7EXAMPQ"),
            serde_json::to_string(&wrong.next).expect("json")
        );
        assert!(
            right.hints.iter().any(|hint| hint == REDACTED_MATCH_HINT),
            "{right:?}"
        );
        let clean = dir.join("clean.txt");
        fs::write(&clean, "nothing secret\n").expect("write clean");
        let miss = execute_local_fetch(
            &LocalFetchQuery {
                path: clean.to_string_lossy().parse().expect("path"),
                match_string: Some("absent".parse().expect("match string")),
                ..LocalFetchQuery::test_default()
            },
            &Paths(dir.clone()),
            &security,
            &NeverCancel,
            &LocalFetchRegex,
            None,
            None,
        );
        assert!(
            !miss.hints.iter().any(|hint| hint == REDACTED_MATCH_HINT),
            "{miss:?}"
        );
        let after = probe("needle");
        assert_eq!(after.match_ranges, vec![LineRange { start: 3, end: 3 }]);
        assert_eq!(after.total_lines, Some(3));
    }

    // Over-redaction guard: an ordinary long base64 line (config blob,
    // hash, minified asset) with NO private-key markers anywhere in the file
    // must pass through byte-identical — the guard keys off BEGIN/END markers,
    // never bare base64.
    #[test]
    fn innocent_base64_window_is_returned_byte_identical() {
        let temp = Fixture::new();
        let dir = temp.0.clone();
        let path = dir.join("data.txt");
        let blob = "aGVsbG8gd29ybGQgdGhpcyBpcyBqdXN0IGEgbG9uZyBiYXNlNjQgYmxvYg==";
        let file = format!("header\n{blob}\nfooter\n");
        fs::write(&path, &file).expect("write file");

        let req = LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ranges: vec![format!("{}-{}", 2, 2).parse().expect("range")],
            ..LocalFetchQuery::test_default()
        };
        let result = fetch(&req, &Paths(dir.clone()));

        let content = result.content.clone().unwrap_or_default();
        assert!(
            content.contains(blob),
            "innocent base64 was wrongly redacted: {content}"
        );
    }
}

#[cfg(test)]
mod line_page_scan_tests {
    use super::*;
    use crate::security::ContentSecurity;
    use crate::tools::cancel::NeverCancel;
    use std::path::Path;

    fn security() -> ContentSecurity {
        ContentSecurity::new()
    }
    fn fetch(source: &str, q: &LocalFetchQuery) -> LocalFetchResult {
        process_fetched_content(
            q,
            source.as_bytes(),
            Path::new("/fixture/app.ts"),
            &SourceFacts::default(),
            &security(),
            &NeverCancel,
            &LocalFetchRegex,
        )
    }
    fn lines_query(offset: usize, chunk: usize) -> LocalFetchQuery {
        LocalFetchQuery {
            path: "/fixture/app.ts".parse().expect("path"),
            unit: Some(WindowUnit::Lines),
            offset: Some(wire_count(offset)),
            length: wire_positive(chunk),
            ..LocalFetchQuery::test_default()
        }
    }
    fn filler(n: usize) -> String {
        (1..=n)
            .map(|i| format!("const filler_{i} = {i};\n"))
            .collect()
    }

    #[test]
    fn fetch_partition_binding_rejects_same_count_legacy_replay() {
        use crate::contracts::tool_types::SelectionUnit;
        use crate::runtime::SelectionLimits;
        use crate::tools::selection::{Candidate, Decision, JudgeCall, Runtime, SelectionJudge};
        use serde_json::json;
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        use std::time::{Duration, Instant};

        struct FirstCandidate(Arc<AtomicUsize>);
        impl SelectionJudge for FirstCandidate {
            fn identity(&self) -> serde_json::Value {
                json!({"test":"fetch-partition"})
            }
            fn select(&self, call: JudgeCall<'_>) -> crate::tools::selection::Judgments {
                self.0.fetch_add(1, Ordering::SeqCst);
                Ok(call
                    .admitted
                    .iter()
                    .map(|&ordinal| {
                        (
                            ordinal,
                            if ordinal == 0 {
                                Decision::Selected
                            } else {
                                Decision::Excluded
                            },
                        )
                    })
                    .collect())
            }
        }

        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = Arc::new(AtomicUsize::new(0));
        let runtime = Runtime {
            limits: SelectionLimits {
                max_candidates: 64,
                max_chars: 20_000,
                timeout: Duration::from_secs(5),
            },
            available: true,
            judge: Arc::new(FirstCandidate(calls.clone())),
            handle: executor.handle().clone(),
            context: crate::runtime::ExecutionContext {
                cancellation: tokio_util::sync::CancellationToken::new(),
                deadline: Instant::now() + Duration::from_secs(5),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
        };
        let first = format!("{}\n", "a".repeat(999));
        let second = format!("{}\n", "b".repeat(999));
        let third = format!("{}\n", "c".repeat(2_047));
        let source = (1..=20)
            .map(|line| match line {
                1 => first.as_str(),
                10 => second.as_str(),
                20 => third.as_str(),
                _ => "gap\n",
            })
            .collect::<String>();
        let query: LocalFetchQuery = serde_json::from_value(json!({
            "path":"/fixture/source.txt", "ranges":["1-1","10-10","20-20"], "clasifyContext":{"classifiers":["Find the first evidence"]}
        }))
        .expect("query");
        let path = Path::new("/fixture/source.txt");
        let sha256 = crate::digest::sha256(source.as_bytes());
        let input = SelectionInput {
            q: &query,
            source_path: path,
            provider_path: "/fixture/source.txt",
            sha256: &sha256,
            runtime: Some(&runtime),
        };
        let extracted = extract(&query, &source, &LocalFetchRegex)
            .unwrap_or_else(|_| panic!("source extraction"));
        let (current, _) = super::super::selection::chunks(
            &extracted.text,
            extracted.source_lines.as_deref(),
            Some(&source),
            path,
            input.provider_path,
            &security(),
            Some(&runtime),
            None,
            None,
        );
        let legacy = [
            Candidate::new(Some(
                json!({"content":format!("{first}{}{second}", super::super::extraction::omission_marker(2, 9))}),
            )),
            Candidate::new(Some(
                json!({"content":super::super::extraction::omission_marker(11, 19)}),
            )),
            Candidate::new(Some(json!({"content":third}))),
        ];
        assert_eq!(current.len(), legacy.len());
        assert_eq!(current[0].state.as_ref().unwrap()["content"], first);
        assert!(
            legacy[0].state.as_ref().unwrap()["content"]
                .as_str()
                .unwrap()
                .contains(&second)
        );
        let query_json = serde_json::to_value(&query).expect("query JSON");
        let select = |source: &str, prior: Option<&str>, candidates: &[Candidate]| {
            crate::tools::selection::select(
                Some(&runtime),
                &query_json,
                source,
                prior,
                candidates,
                None,
                SelectionUnit::Chunks,
            )
        };
        let old = select(&format!("{}:{sha256}", path.display()), None, &legacy)
            .unwrap_or_else(|_| panic!("legacy plan"));
        let replay = (0..current.len())
            .map(|_| Candidate::new(None))
            .collect::<Vec<_>>();
        assert!(matches!(
            select(&input.source_key(), Some(&old.token), &replay),
            Err(crate::tools::selection::Failure::Stale)
        ));
        let fresh =
            select(&input.source_key(), None, &current).unwrap_or_else(|_| panic!("fresh plan"));
        let resumed = select(&input.source_key(), Some(&fresh.token), &replay)
            .unwrap_or_else(|_| panic!("fresh replay"));
        assert_eq!(resumed.selected, [0]);
        assert_eq!(resumed.token, fresh.token);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn selected_reads_fill_the_configured_window_and_keep_explicit_lengths() {
        let source = filler(1_200);
        let mut query = LocalFetchQuery {
            path: "/fixture/app.ts".parse().expect("path"),
            ranges: vec!["1-1200".parse().expect("range")],
            ..LocalFetchQuery::test_default()
        };
        let read = |query: &LocalFetchQuery| {
            process_fetched_content(
                query,
                source.as_bytes(),
                Path::new("/fixture/app.ts"),
                &SourceFacts {
                    window: Some(50_000),
                    ..SourceFacts::default()
                },
                &security(),
                &NeverCancel,
                &LocalFetchRegex,
            )
        };
        let complete = read(&query);
        assert_eq!(complete.status, "success");
        assert!(
            complete
                .content
                .as_deref()
                .expect("content")
                .contains("filler_1200")
        );
        assert!(!complete.pagination.as_ref().expect("pagination").has_more);

        query.unit = Some(WindowUnit::Lines);
        query.length = wire_positive(17);
        let explicit = read(&query);
        assert_eq!(explicit.pagination.as_ref().expect("pagination").length, 17);
        assert!(explicit.pagination.as_ref().expect("pagination").has_more);
    }

    /// A read with no anchor whose view would not fit one page returns a
    /// short head instead of the page: the read is not targeted yet. Paging
    /// on, whole-file reads and anchored reads are unchanged; a file that
    /// fits one page is returned whole, with no note.
    #[test]
    fn an_unanchored_read_over_one_page_returns_a_head() {
        // 1,000 short lines: far below any line-count ceiling, over 16 KiB.
        let source = filler(1_000);
        assert!(source.len() > 16 * 1024);
        let plain = LocalFetchQuery {
            path: "/fixture/app.ts".parse().expect("path"),
            ..LocalFetchQuery::test_default()
        };
        let head = fetch(&source, &plain);
        assert_eq!(head.returned_lines, Some(HEAD_LINES), "{head:?}");
        // The head's facts are data (totalLines, continueWindow), not a note.
        assert!(head.warnings.is_empty(), "{:?}", head.warnings);
        assert_eq!(head.total_lines, Some(1_000), "{head:?}");
        let next = head
            .next
            .and_then(|next| next.continue_window)
            .expect("continueWindow");
        assert_eq!(next.query.offset(), Some(HEAD_LINES));
        assert_eq!(next.query.window_length(), None);
        let page = fetch(&source, &next.query);
        assert!(page.returned_lines.expect("lines") > HEAD_LINES, "{page:?}");
        // Whole-file, anchored and symbol reads are unchanged.
        let whole = fetch(
            &source,
            &LocalFetchQuery {
                full_content: Some(true),
                ..plain.clone()
            },
        );
        assert!(whole.returned_lines.expect("lines") > HEAD_LINES);
        let ranged = fetch(
            &source,
            &LocalFetchQuery {
                ranges: vec![format!("{}-{}", 10, 200).parse().expect("range")],
                ..plain.clone()
            },
        );
        assert_eq!(ranged.returned_lines, Some(191));
        // A standard view is guarded the same way (ghGetFileContent's default).
        let standard = fetch(
            &source,
            &LocalFetchQuery {
                minify: Some(MinifyMode::Standard),
                ..plain.clone()
            },
        );
        assert_eq!(standard.returned_lines, Some(HEAD_LINES), "{standard:?}");
        // A file that fits one page is read whole, with no note.
        let small = fetch(&filler(500), &plain);
        assert_eq!(small.returned_lines, Some(500), "{small:?}");
        assert!(small.warnings.is_empty(), "{:?}", small.warnings);
        assert!(small.next.is_none(), "{small:?}");
    }

    /// The private-key note is a fact about the returned window: a page
    /// that shows a redacted key block says so, a page elsewhere in the
    /// same file does not.
    #[test]
    fn the_key_block_note_rides_only_on_pages_that_show_the_block() {
        let body = "MIIEpAIBAAKCAQEAsplitKeyBodyLineABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let source = format!(
            "{}-----BEGIN RSA PRIVATE KEY-----\n{body}\n-----END RSA PRIVATE KEY-----\n{}",
            filler(10),
            filler(100)
        );
        let note = "Redacted private-key block(s) found in the source before selecting the window.";
        let shows = fetch(&source, &lines_query(0, 20));
        assert!(
            shows.warnings.iter().any(|w| w == note),
            "{:?}",
            shows.warnings
        );
        let elsewhere = fetch(&source, &lines_query(50, 20));
        assert!(
            !elsewhere.warnings.iter().any(|w| w == note),
            "{:?}",
            elsewhere.warnings
        );
    }

    #[test]
    fn pem_block_split_across_a_line_page_is_redacted_on_both_pages() {
        let body = "MIIEpAIBAAKCAQEAsplitKeyBodyLineABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let source = format!(
            "{}-----BEGIN RSA PRIVATE KEY-----\n{body}\n{body}\n-----END RSA PRIVATE KEY-----\n{}",
            filler(98),
            filler(20)
        );
        // Page 1 ends on line 100 (first body line); page 2 starts on line 101.
        for offset in [0, 100] {
            let result = fetch(&source, &lines_query(offset, 100));
            let content = result.content.expect("content");
            assert!(
                !content.contains("splitKeyBody"),
                "offset {offset}: {content}"
            );
        }
    }

    #[test]
    fn multi_line_secret_straddling_a_page_boundary_is_redacted() {
        let value = "\"s3cr3tValueThatIsLongEnough42\"";
        let source = format!("{}jwt_secret =\n{value}\n{}", filler(9), filler(5));
        let full = security()
            .sanitize(&source, Path::new("/fixture/app.ts"))
            .expect("scan")
            .0;
        assert!(
            !full.contains("s3cr3t"),
            "fixture must be a real multi-line secret"
        );
        // Line 10 holds the key, line 11 the value; page 2 starts on the value.
        let result = fetch(&source, &lines_query(10, 5));
        let content = result.content.expect("content");
        assert!(!content.contains("s3cr3t"), "{content}");
        // The page scan kept line counts, so the page still anchors to 11-15.
        assert_eq!(
            result.source_line_ranges,
            vec![LineRange { start: 11, end: 15 }]
        );
    }

    #[test]
    fn paged_union_equals_the_whole_view_scan() {
        let source = format!(
            "{}token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n{}password =\n\"another-long-secret-value-0001\"\n{}",
            filler(40),
            filler(37),
            filler(60)
        );
        let expected = security()
            .sanitize(&source, Path::new("/fixture/app.ts"))
            .expect("scan")
            .0;
        let mut q = lines_query(0, 13);
        let mut union = String::new();
        loop {
            let result = fetch(&source, &q);
            union.push_str(result.content.as_deref().expect("content"));
            let Some(next) = result.next.and_then(|next| next.continue_window) else {
                break;
            };
            q = next.query;
        }
        assert_eq!(union, expected);
    }

    fn bytes_query(offset: usize, chunk: usize) -> LocalFetchQuery {
        LocalFetchQuery {
            unit: Some(WindowUnit::Bytes),
            ..lines_query(offset, chunk)
        }
    }

    /// Byte pages walked by `next.continueWindow` reproduce the whole-view scan:
    /// every secret is redacted, including ones a raw byte boundary would cut.
    #[test]
    fn byte_pages_redact_secrets_straddling_the_boundary() {
        let token = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let source = format!(
            "{}token: {token}\n{}password =\n\"another-long-secret-value-0001\"\n{}",
            filler(40),
            filler(37),
            filler(60)
        );
        let expected = security()
            .sanitize(&source, Path::new("/fixture/app.ts"))
            .expect("scan")
            .0;
        assert!(
            !expected.contains("ghp_aaaa"),
            "fixture holds a real secret"
        );
        let cut = source.find(token).expect("token") + 10;
        for chunk in [cut, 97, 500] {
            let mut q = bytes_query(0, chunk);
            let mut union = String::new();
            let mut pages = 0;
            loop {
                let result = fetch(&source, &q);
                let content = result.content.as_deref().expect("content");
                assert!(!content.contains("ghp_aaaa"), "chunk {chunk}: {content}");
                assert!(
                    !content.contains("another-long"),
                    "chunk {chunk}: {content}"
                );
                union.push_str(content);
                pages += 1;
                let Some(next) = result.next.and_then(|next| next.continue_window) else {
                    break;
                };
                q = next.query;
            }
            assert!(pages > 1, "chunk {chunk}");
            assert_eq!(union, expected, "chunk {chunk}");
        }
    }

    /// A byte window inside one long line that holds secrets returns that
    /// window (redacted), not the whole line from column 0: the text starts
    /// where `pagination.offset` says and stays near the asked length.
    #[test]
    fn a_byte_window_in_a_redacted_long_line_stays_in_its_window() {
        let token = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let pad = "x".repeat(30_000);
        let source = format!(
            "{pad} aws_secret_access_key = \"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd\" {token} needle {pad}\n"
        );
        let expected = security()
            .sanitize(&source, Path::new("/fixture/app.ts"))
            .expect("scan")
            .0;
        assert_ne!(expected, source, "fixture holds a real secret");
        let needle = source.find("needle").expect("needle");
        for offset in [0, needle - 20] {
            let result = fetch(&source, &bytes_query(offset, 100));
            let content = result.content.as_deref().expect("content");
            assert!(!content.contains("ghp_aaaa"), "{offset}: {content}");
            assert!(content.len() < 200, "{offset}: {} bytes", content.len());
            let page = result.pagination.as_ref().expect("pagination");
            assert_eq!(page.offset, offset, "{page:?}");
            assert!(page.has_more, "{page:?}");
            assert!(
                source[offset..].starts_with(&content[..content.len().min(10)])
                    || content.starts_with(octocode_engine::security::REDACTION_PREFIX),
                "{offset}: {content}"
            );
        }
        let near = fetch(&source, &bytes_query(needle - 20, 100));
        assert!(
            near.content
                .as_deref()
                .is_some_and(|c| c.contains("needle")),
            "{near:?}"
        );
    }

    #[test]
    fn byte_page_split_inside_a_pem_block_leaks_nothing() {
        let body = "MIIEpAIBAAKCAQEAsplitKeyBodyLineABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let source = format!(
            "{}-----BEGIN RSA PRIVATE KEY-----\n{body}\n{body}\n-----END RSA PRIVATE KEY-----\n{}",
            filler(98),
            filler(20)
        );
        let cut = source.find(body).expect("body") + 20;
        for offset in [0, cut] {
            let result = fetch(&source, &bytes_query(offset, 64));
            let content = result.content.expect("content");
            assert!(
                !content.contains("splitKeyBody"),
                "offset {offset}: {content}"
            );
        }
    }

    /// The byte page scans a bounded window, not the whole view: the secret
    /// scanner sees the page plus its line-aligned margins only.
    #[test]
    fn byte_page_scans_a_window_not_the_whole_view() {
        struct Counting(ContentSecurity, std::cell::Cell<usize>);
        impl ContentScan for Counting {
            fn sanitize(
                &self,
                text: &str,
                path: &Path,
            ) -> Result<(String, Vec<String>), (String, String)> {
                self.1.set(self.1.get() + text.len());
                self.0.sanitize(text, path)
            }
        }
        let source = (0..120_000)
            .map(|i| format!("const value_{i} = compute('abcdefghij', {i}); // key line {i}\n"))
            .collect::<String>();
        let scanner = Counting(security(), std::cell::Cell::new(0));
        let started = std::time::Instant::now();
        let paged = process_fetched_content(
            &bytes_query(source.len() / 2, 8_000),
            source.as_bytes(),
            Path::new("/fixture/app.ts"),
            &SourceFacts::default(),
            &scanner,
            &NeverCancel,
            &LocalFetchRegex,
        );
        let page_time = started.elapsed();
        assert!(paged.content.is_some_and(|content| content.len() >= 8_000));
        let scanned = scanner.1.get();
        assert!(
            scanned < 8_000 + 4 * super::super::pagination::PAGE_SCAN_MARGIN_BYTES,
            "scanned {scanned} of {} bytes",
            source.len()
        );
        let started = std::time::Instant::now();
        let _ = security().sanitize(&source, Path::new("/fixture/app.ts"));
        eprintln!(
            "byte page {page_time:?} (scanned {scanned} B) vs whole-view scan {:?} ({} B)",
            started.elapsed(),
            source.len()
        );
    }

    #[test]
    fn offset_past_the_end_is_empty_out_of_range_with_restart() {
        let source = filler(487);
        let result = fetch(&source, &lines_query(487, 100));
        assert_eq!(result.content.as_deref(), Some(""));
        assert!(
            result.source_line_ranges.is_empty(),
            "{:?}",
            result.source_line_ranges
        );
        assert!(result.out_of_range);
        assert_eq!(result.is_partial, None);
        let next = result.next.clone().expect("next");
        assert!(next.continue_window.is_none());
        assert_eq!(next.restart.expect("restart").query.offset, Some(0));
        let wire = serde_json::to_value(&result).expect("wire");
        assert_eq!(wire["pagination"]["outOfRange"], true, "{wire}");
        assert!(wire.get("sourceLineRanges").is_none(), "{wire}");

        let bytes = LocalFetchQuery {
            unit: Some(WindowUnit::Bytes),
            ..lines_query(source.len(), 100)
        };
        let result = fetch(&source, &bytes);
        assert!(result.out_of_range && result.source_line_ranges.is_empty());
        // The last real page is not out of range.
        assert!(!fetch(&source, &lines_query(400, 100)).out_of_range);
    }
}

#[cfg(all(test, unix))]
mod open_tests {
    use super::*;

    /// A FIFO is opened without blocking and refused by the handle's own
    /// stat, so a path swapped for one after the policy check cannot hang
    /// the read; a regular file resolves with the opened handle.
    #[test]
    fn a_fifo_is_refused_without_blocking_and_a_file_opens() {
        let root = tempfile::tempdir().expect("root");
        let fifo = root.path().join("pipe.txt");
        crate::tools::test_support::make_fifo(&fifo);
        std::fs::write(root.path().join("a.txt"), "x\n").expect("file");
        let (paths, _) = crate::tools::test_support::simple_policy(root.path());
        let query = |path: &std::path::Path| LocalFetchQuery {
            path: path.to_string_lossy().parse().expect("path"),
            ..LocalFetchQuery::test_default()
        };
        let refused = resolve_file(&query(&fifo), &paths).expect_err("a FIFO is no file");
        assert_eq!(refused.error_code.as_deref(), Some("notAFile"));
        let (_, _, meta) =
            resolve_file(&query(&root.path().join("a.txt")), &paths).expect("regular file");
        assert_eq!(meta.len(), 2);
    }

    /// A FIFO is `notAFile`, named by the requested path, with nothing to
    /// retry: no lead and no "retry the exact path" tip.
    #[test]
    fn a_fifo_is_not_a_file_named_by_its_path_with_nothing_to_retry() {
        let root = tempfile::tempdir().expect("root");
        let fifo = root.path().join("pipe1");
        crate::tools::test_support::make_fifo(&fifo);
        let paths = crate::policy::path::PathPolicy::new(crate::policy::path::PathPolicyConfig {
            workspace_root: Some(root.path().to_path_buf()),
            ..Default::default()
        })
        .expect("policy");
        let requested = fifo.to_string_lossy().into_owned();
        let result = execute_local_fetch(
            &LocalFetchQuery {
                path: requested.parse().expect("path"),
                ..LocalFetchQuery::test_default()
            },
            &paths,
            &crate::security::ContentSecurity::new(),
            &crate::tools::cancel::NeverCancel,
            &LocalFetchRegex,
            None,
            None,
        );
        assert_eq!(result.error_code.as_deref(), Some("notAFile"), "{result:?}");
        let message = result.error.as_deref().unwrap_or_default();
        assert!(message.starts_with(&requested), "{message}");
        assert!(
            result.next.is_none() && result.hints.is_empty(),
            "{result:?}"
        );
        use crate::tools::output::ToolOutput;
        assert_eq!(
            super::super::output::Output.error_hint("notAFile"),
            Some(crate::tools::output::NO_HINT)
        );
    }
}

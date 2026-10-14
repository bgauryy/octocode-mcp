use super::extraction::{extract, line_count};
use super::pagination::{
    SourceLines, continuation, page_within, result_counts, sanitize_byte_page, sanitize_line_page,
};
use super::types::*;
use crate::security::scan::ContentScan;
use crate::tools::cancel::CancellationCheck;
use crate::tools::id::ToolId;
use std::fs;
use std::io::Read;
use std::path::Path;

/// In-memory read guard. Larger sources use bounded streaming windows up to
/// `MAX_STREAM_SOURCE_BYTES`; a growing small-file read stops at this guard.
pub(super) const MAX_SOURCE_BYTES: u64 = 10 * 1024 * 1024;

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
    result.is_partial = Some(true);
    result.terminal_limit = Some(true);
    result.partial_reasons = vec![PartialReason::FullContentSource];
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

pub fn execute_local_fetch(
    q: &LocalFetchQuery,
    paths: &impl PathAccess,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    window: Option<usize>,
) -> LocalFetchResult {
    execute_local_fetch_ranked(q, paths, security, cancel, regex, window, None)
}

pub(crate) fn execute_local_fetch_ranked(
    q: &LocalFetchQuery,
    paths: &impl PathAccess,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    window: Option<usize>,
    ranking: Option<&crate::tools::ranking::Runtime>,
) -> LocalFetchResult {
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(q.path.to_string(), "cancelled", e);
    }
    // A complete read is an unsupported first-view for ranking. Its own
    // bounded continuation clears fullContent, while a caller must not replay
    // an existing ranked line plan as a new complete read. `unit` is not
    // bound here: an oversized line may legitimately continue in byte units.
    if !q.goals.is_empty() && q.ranking.is_some() && q.full_content == Some(true) {
        return stale_snapshot(q);
    }
    if let Some(refused) = context_without_match(q) {
        return refused;
    }
    let (validated, meta) = match resolve_file(q, paths) {
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
    let (file, sample) = match open_with_sample(path, meta.len(), in_memory) {
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
    if !in_memory {
        return fetch_streamed(q, &validated, &meta, security, cancel, regex, ranking);
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
    let mut result = process_fetched_content_ranked(
        q,
        &bytes,
        path,
        display_path,
        &SourceFacts {
            modified: meta.modified().ok().and_then(system_time_iso),
            window,
            first_page_bytes: None,
        },
        security,
        cancel,
        regex,
        ranking,
    );
    bind_continuation_to_source(&mut result);
    name_read_file(&mut result, q, &validated.named);
    result
}

/// Name the read file by the canonical path the read resolved (symlinks
/// followed, `.`/`..` folded), relative to the workspace when inside it
/// ([`ValidatedRead::named`]): in the row, and in every read that continues
/// the same file, so a continuation names the file its row names.
/// Whole-file and streamed reads name it the same way.
fn name_read_file(result: &mut LocalFetchResult, q: &LocalFetchQuery, named: &str) {
    if result.path == q.path.as_str() {
        named.clone_into(&mut result.path);
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

/// The validated path and its stat; a refused path, a directory, a
/// non-regular file or a failed stat ends the read.
fn resolve_file(
    q: &LocalFetchQuery,
    paths: &impl PathAccess,
) -> Result<(ValidatedRead, fs::Metadata), Box<LocalFetchResult>> {
    let validated = paths
        .validate_read(Path::new(q.path.as_str()))
        .map_err(|failure| Box::new(path_failure(q, failure)))?;
    let meta = match fs::metadata(&validated.canonical) {
        Ok(m) if m.is_file() => m,
        Ok(m) if m.is_dir() => return Err(Box::new(not_a_file(q))),
        Ok(_) => {
            return Err(Box::new(LocalFetchResult::error(
                q.path.to_string(),
                "fileAccessFailed",
                "Path is not a regular file".into(),
            )));
        }
        Err(e) => {
            return Err(Box::new(LocalFetchResult::error(
                q.path.to_string(),
                "fileAccessFailed",
                e.to_string(),
            )));
        }
    };
    Ok((validated, meta))
}

/// One open serves the binary sniff and the whole read: the sniffed bytes
/// start the buffer, sized from the stat.
fn open_with_sample(
    path: &Path,
    len: u64,
    in_memory: bool,
) -> std::io::Result<(fs::File, Vec<u8>)> {
    let mut file = fs::File::open(path)?;
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
    meta: &fs::Metadata,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    ranking: Option<&crate::tools::ranking::Runtime>,
) -> LocalFetchResult {
    let path = &file.canonical;
    let mut result = super::large_source::fetch_window(
        q,
        path,
        meta.len(),
        meta.modified().ok().and_then(system_time_iso),
        security,
        cancel,
        regex,
    );
    if result.status == "error" {
        return result;
    }
    result.path = q.path.to_string();
    name_read_file(&mut result, q, &file.named);
    if q.goals.is_empty() {
        return if q.ranking.is_some() {
            stale_snapshot(q)
        } else {
            result
        };
    }
    if q.snapshot.is_some() && q.ranking.is_none() {
        return stale_snapshot(q);
    }
    let source = format!(
        "{}:{}",
        path.display(),
        result.source_sha256.as_deref().unwrap_or("")
    );
    let mut query_json = serde_json::to_value(q).unwrap_or_default();
    // Streamed range heads advance their `ranges` selector as
    // part of pagination. The skipped plan is source-wide.
    if let Some(query) = query_json.as_object_mut() {
        query.remove("ranges");
    }
    let outcome = match crate::tools::ranking::order(
        ranking,
        &query_json,
        &source,
        q.ranking.as_ref().map(|s| s.as_str()),
        &[],
        Some("streamingSource"),
    ) {
        Ok(outcome) => outcome,
        Err(failure) => return ranking_failure(q, failure),
    };
    if let Some(read) = result
        .next
        .as_mut()
        .and_then(|next| next.continue_window.as_mut())
    {
        read.query.ranking = outcome.token.parse().ok();
    }
    result.ranking = Some(outcome.receipt);
    result
}

/// The row for a ranking that could not order the source.
fn ranking_failure(
    q: &LocalFetchQuery,
    failure: crate::tools::ranking::Failure,
) -> LocalFetchResult {
    match failure {
        crate::tools::ranking::Failure::Stale => stale_snapshot(q),
        crate::tools::ranking::Failure::Cancelled => LocalFetchResult::error(
            q.path.to_string(),
            "cancelled",
            "Ranking was cancelled".into(),
        ),
    }
}

/// A directory named as a file: say so, and lead to its tree.
fn not_a_file(q: &LocalFetchQuery) -> LocalFetchResult {
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

/// A missing file's listing by its stem (the name without its
/// extension) from `root` (see [`PathFailure::search_root`]): a moved file
/// or a changed extension shows at any depth.
fn missing_file_listing(q: &LocalFetchQuery, root: &str) -> Option<serde_json::Value> {
    let name = Path::new(q.path.as_str()).file_name()?.to_string_lossy();
    // `stem.*`: the same name under any extension (a file moved from `.rs`
    // to `.ts` is still found), never every name merely containing the stem.
    // A name without an extension is matched as written.
    let include = match name.split_once('.') {
        Some((stem, _)) if !stem.is_empty() => format!("{}.*", escape_glob(stem)),
        _ => name.to_string(),
    };
    (!include.is_empty()).then(|| {
        crate::tools::result::Continuation::new(
            ToolId::StructureSearch,
            serde_json::json!({"operation": "files", "path": root, "include": [include]}),
        )
        .build()
    })
}

/// `text` as a glob that matches only itself.
fn escape_glob(text: &str) -> String {
    text.chars()
        .flat_map(|c| match c {
            '*' | '?' | '[' | ']' | '{' | '}' => vec!['[', c, ']'],
            _ => vec![c],
        })
        .collect()
}

/// The row for a path the policy refused or could not resolve.
fn path_failure(q: &LocalFetchQuery, failure: PathFailure) -> LocalFetchResult {
    if failure.directory {
        return not_a_file(q);
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
    let code = if matches!(
        failure.code.as_str(),
        "outsideAllowedRoots"
            | "symlinkEscape"
            | "permissionDenied"
            | crate::policy::PATH_POLICY_DENIED
    ) {
        failure.code.as_str()
    } else if failure.resource_missing {
        // The not-found code every local tool reports.
        "pathNotFound"
    } else {
        "fileAccessFailed"
    };
    let mut result = LocalFetchResult::error(q.path.to_string(), code, message);
    result.resource_missing = failure.resource_missing;
    if failure.resource_missing
        && let Some(listing) = failure
            .search_root
            .as_deref()
            .and_then(|root| missing_file_listing(q, root))
    {
        result.next = Some(NextCalls {
            find_file: Some(listing),
            ..NextCalls::default()
        });
    }
    result
}

/// The refusal for a file whose leading bytes are binary.
fn refuse_binary(q: &LocalFetchQuery, display_path: &str) -> LocalFetchResult {
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

/// Bind the next page of a local view to the file version it was cut from, so
/// a replay against a changed file is rejected instead of mixing versions.
/// (Remote reads pin a commit SHA in their continuation instead.)
fn bind_continuation_to_source(result: &mut LocalFetchResult) {
    let snapshot = result
        .source_sha256
        .as_deref()
        .and_then(|digest| digest.parse().ok());
    if let Some(next) = result
        .next
        .as_mut()
        .and_then(|next| next.continue_window.as_mut())
    {
        next.query.snapshot = snapshot;
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
    process_fetched_content_ranked(
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

pub(crate) fn process_fetched_content_ranked(
    q: &LocalFetchQuery,
    bytes: &[u8],
    source_path: &std::path::Path,
    provider_path: &str,
    facts: &SourceFacts,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
    ranking: Option<&crate::tools::ranking::Runtime>,
) -> LocalFetchResult {
    if let Some(refused) = context_without_match(q) {
        return refused;
    }
    let source = match prepare_source(q, bytes, source_path, security, cancel) {
        Ok(source) => source,
        Err(result) => return *result,
    };
    let mut ext = match extract(q, &source.text, regex) {
        Ok(extraction) => extraction,
        Err(error) => return extraction_error(q, error),
    };
    let rank = RankInput {
        q,
        source_path,
        provider_path,
        sha256: &source.sha256,
        runtime: ranking,
    };
    if ext.count == Some(0) {
        return rank_no_match(&rank, no_match(q, &source, regex));
    }
    let mut view = select_view(q, &mut ext);
    let rank_outcome = match rank_view(&rank, &mut view, &mut ext, security) {
        Ok(outcome) => outcome,
        Err(result) => return *result,
    };
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(q.path.to_string(), "cancelled", e);
    }
    let cut = match cut_page(q, &view, &ext, &source, facts, source_path, security) {
        Ok(cut) => cut,
        Err(result) => return *result,
    };
    if let Err(e) = cancel.check() {
        return LocalFetchResult::error(cut.q.path.to_string(), "cancelled", e);
    }
    page_result(cut, source, ext, view, rank_outcome, source_path, facts)
}

/// `contextLines` widens matchString hits; a read without matchString has
/// none, so it is refused with the same read without `contextLines`.
fn context_without_match(q: &LocalFetchQuery) -> Option<LocalFetchResult> {
    if q.context_lines.is_none() || !q.match_strings().is_empty() {
        return None;
    }
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        "invalidInput",
        "contextLines widens matchString hits; this read has no matchString.".into(),
    );
    let mut query = q.clone();
    query.context_lines = None;
    result.next = Some(NextCalls {
        repair: Some(Continuation { query }),
        ..NextCalls::default()
    });
    Some(result)
}

/// What a goal ranking of one source reads.
struct RankInput<'a> {
    q: &'a LocalFetchQuery,
    source_path: &'a std::path::Path,
    provider_path: &'a str,
    sha256: &'a str,
    runtime: Option<&'a crate::tools::ranking::Runtime>,
}

impl RankInput<'_> {
    /// The ranking's source key: the path and the digest of its bytes.
    fn source_key(&self) -> String {
        format!("{}:{}", self.source_path.display(), self.sha256)
    }
}

/// A read that selected nothing carries the ranking receipt of its goals; a
/// ranked replay without goals is stale.
fn rank_no_match(rank: &RankInput, mut result: LocalFetchResult) -> LocalFetchResult {
    let q = rank.q;
    if q.goals.is_empty() {
        return if q.ranking.is_some() {
            stale_snapshot(q)
        } else {
            result
        };
    }
    let query_json = serde_json::to_value(q).unwrap_or_default();
    match crate::tools::ranking::order(
        rank.runtime,
        &query_json,
        &rank.source_key(),
        q.ranking.as_ref().map(|token| token.as_str()),
        &[],
        None,
    ) {
        Ok(outcome) => result.ranking = Some(outcome.receipt),
        Err(failure) => return ranking_failure(q, failure),
    }
    result
}

/// Order the view's chunks by the read's goals. A read without goals, or a
/// paged read without its ranking token, is not ranked here.
fn rank_view(
    rank: &RankInput,
    view: &mut View,
    ext: &mut super::extraction::Extraction,
    security: &impl ContentScan,
) -> Result<Option<crate::tools::ranking::Outcome>, Box<LocalFetchResult>> {
    let q = rank.q;
    if q.goals.is_empty() {
        if q.ranking.is_some() {
            return Err(Box::new(stale_snapshot(q)));
        }
        return Ok(None);
    }
    if q.offset().is_some_and(|offset| offset > 0) && q.ranking.is_none() {
        return Err(Box::new(stale_snapshot(q)));
    }
    let unsupported = if view.mode != MinifyMode::None
        || q.full_content == Some(true)
        || q.unit == Some(WindowUnit::Bytes)
    {
        Some("unsupportedView")
    } else {
        None
    };
    let (candidates, chunks) = super::ranking::chunks(
        &view.text,
        ext.source_lines.as_deref(),
        rank.source_path,
        rank.provider_path,
        security,
        rank.runtime,
        q.ranking.as_ref().map(|token| token.as_str()),
        unsupported,
    );
    let query_json = serde_json::to_value(q).unwrap_or_default();
    let outcome = crate::tools::ranking::order(
        rank.runtime,
        &query_json,
        &rank.source_key(),
        q.ranking.as_ref().map(|s| s.as_str()),
        &candidates,
        unsupported,
    )
    .map_err(|failure| Box::new(ranking_failure(q, failure)))?;
    if matches!(
        outcome.receipt.status,
        crate::contracts::tool_types::RankingStatus::Ranked
            | crate::contracts::tool_types::RankingStatus::Partial
    ) {
        let (text, source_lines) = super::ranking::reorder(&view.text, &chunks, &outcome.order);
        view.text = text;
        ext.source_lines = Some(source_lines);
    }
    Ok(Some(outcome))
}

/// The scanned page of a view, and the query it was cut for.
struct CutPage<'a> {
    /// The read's query; bounded when a complete view was over the window.
    q: std::borrow::Cow<'a, LocalFetchQuery>,
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
    let view_limited =
        q.full_content == Some(true) && facts.window.is_some_and(|window| view.text.len() > window);
    let q = if view_limited {
        std::borrow::Cow::Owned(bounded_query(q))
    } else {
        std::borrow::Cow::Borrowed(q)
    };
    let head_view = head_query(&q, view.mode, view.text.len());
    let head = head_view.is_some();
    let page_q = head_view.as_ref().unwrap_or(&q);
    // A selected view's first page may be held to the caller's preview
    // budget; its continuations page at the line page budget.
    let line_page_bytes = facts
        .first_page_bytes
        .filter(|_| (q.match_string.is_some() || q.has_ranges()) && q.offset().is_none())
        .unwrap_or(super::pagination::LINE_PAGE_BYTES);
    // A transformed whole-file view pages in raw source lines (the unit of
    // `totalLines`, the gutter and `ranges`); an outline pages its own lines.
    let source_lines = (view.mode == MinifyMode::Standard && ext.source_lines.is_none())
        .then(|| SourceLines::of_gutter(&view.text, source.total_lines))
        .flatten();
    let scanned = scan_page(
        &q,
        page_q,
        &view.text,
        line_page_bytes,
        source_path,
        security,
        source,
        ext.start,
        source_lines.as_ref(),
    )?;
    Ok(CutPage {
        q,
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
    rank_outcome: Option<crate::tools::ranking::Outcome>,
    source_path: &std::path::Path,
    facts: &SourceFacts,
) -> LocalFetchResult {
    let CutPage {
        q,
        view_limited,
        head,
        scanned,
    } = cut;
    let q = q.as_ref();
    let mut warnings = std::mem::take(&mut source.warnings);
    warnings.extend(std::mem::take(&mut ext.warnings));
    warnings.extend(scanned.warnings);
    let pg = scanned.page;
    // The page shows a key block the source-wide pass redacted.
    if source.key_blocks_redacted
        && pg
            .text
            .contains(&crate::security::key_fragment_placeholder())
    {
        warnings.push(KEY_BLOCK_NOTE.into());
    }
    warn_redacted(&pg.text, scanned.redacted, &source, &mut warnings);
    warn_unmatchable(q, &source, &ext.matched_lines, &mut warnings);
    let out_of_range = pg.out_of_range;
    let token = rank_outcome.as_ref().map(|outcome| outcome.token.as_str());
    let next = continue_calls(q, &pg, head, token, &mut ext, &mut warnings);
    read_scope_warnings(q, &pg, head, source.total_lines, &mut warnings);
    // Redaction (source-wide for matchString, or on the page) replaces text
    // within lines; the anchors stay and the warning above says the text is
    // not verbatim.
    let source_ranges =
        if !out_of_range && !scanned.empty && view.mode == MinifyMode::None && scanned.lines_kept {
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
        content_view: Some(view.mode),
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
        modified: (view.mode != MinifyMode::Symbols)
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
        ranking: rank_outcome.map(|outcome| outcome.receipt),
        ..LocalFetchResult::blank("success")
    }
}

/// The page's continuations: its next page bound to the ranking token, plus
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
        read.query.ranking = token.parse().ok();
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
fn head_query(q: &LocalFetchQuery, mode: MinifyMode, view_bytes: usize) -> Option<LocalFetchQuery> {
    (unanchored_first_read(q)
        && mode != MinifyMode::Symbols
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
    text: String,
    chars: usize,
    bytes: usize,
    total_lines: usize,
    key_blocks_redacted: bool,
    match_redacted: bool,
    warnings: Vec<String>,
}

/// Decode and redact the source; a stale snapshot, a cancel or a failed
/// redaction ends the read.
fn prepare_source(
    q: &LocalFetchQuery,
    bytes: &[u8],
    source_path: &std::path::Path,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
) -> Result<Source, Box<LocalFetchResult>> {
    let sha256 = crate::digest::sha256(bytes);
    if let Some(expected) = q.snapshot.as_deref()
        && **expected != sha256
    {
        return Err(Box::new(stale_snapshot(q)));
    }
    cancel
        .check()
        .map_err(|e| Box::new(LocalFetchResult::error(q.path.to_string(), "cancelled", e)))?;
    // Binary detection is a separate heuristic; text that is not UTF-8 is
    // decoded (Latin-1 or lossy UTF-8) with a warning, never refused.
    let decoded = octocode_engine::text::decode(bytes);
    let (raw, decode_warning) = (decoded.text.into_owned(), decoded.warning);
    let chars = raw.encode_utf16().count();
    let source_bytes = raw.len();
    let total_lines = line_count(&raw);
    let warnings: Vec<String> = decode_warning.map(str::to_owned).into_iter().collect();
    // Redact whole private-key blocks across the full file BEFORE any
    // window/extraction, so a bounded read of an interior body line cannot leak a
    // key whose BEGIN/END markers fall outside the selected window (the anchored
    // built-in patterns only match a complete block in a single view).
    let (raw, key_blocks_redacted) = security.redact_key_blocks(&raw);
    // matchString runs on redacted text: sanitize the whole source (line-count
    // preserving) before matching so a probe cannot confirm a secret that the
    // returned window would redact (exact-prefix oracle).
    let (text, match_redacted) = if q.match_string.is_some() {
        redact_source_lines(&raw, source_path, security).map_err(|(code, message)| {
            Box::new(LocalFetchResult::error(q.path.to_string(), &code, message))
        })?
    } else {
        (raw, false)
    };
    Ok(Source {
        sha256,
        text,
        chars,
        bytes: source_bytes,
        total_lines,
        key_blocks_redacted,
        match_redacted,
        warnings,
    })
}

/// A failed selection; an invalid regex carries its repaired read (the
/// message names the item and the parser's reason).
fn extraction_error(q: &LocalFetchQuery, error: ExtractionError) -> LocalFetchResult {
    let mut result =
        LocalFetchResult::error(q.path.to_string(), error.kind.error_code(), error.message());
    if error.kind == ExtractionErrorKind::InvalidPattern {
        result.next = super::pattern_repair::repair(q).map(|repair| NextCalls {
            repair: Some(repair),
            ..NextCalls::default()
        });
    }
    result
}

/// A matchString that selected no line: an empty row with its facts.
fn no_match(q: &LocalFetchQuery, source: &Source, regex: &impl RegexMatch) -> LocalFetchResult {
    // In a file with redactions the text may sit behind a placeholder; that
    // fact depends only on the file, never on the guess (no oracle), and
    // reveals no more than a plain fetch (which shows the placeholders).
    let redacted = source.match_redacted || source.key_blocks_redacted;
    let mut warnings = Vec::new();
    // A case-sensitive miss reruns as the same read, case-insensitive, only
    // when that read selects lines; the count is the fact beside the lead.
    let insensitive = (!redacted)
        .then(|| insensitive_match_count(q, &source.text, regex))
        .filter(|count| *count > 0);
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
        Continuation { query }
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
        Continuation { query }
    });
    // The text may live in another file of this directory: one localSearch
    // there finds it (not offered when redactions hide the text, or when
    // this file holds it outside the ranges).
    let search = (read.is_none() && !(source.match_redacted || source.key_blocks_redacted))
        .then(|| {
            let dir = Path::new(q.path.as_str())
                .parent()
                .map(|dir| dir.to_string_lossy().into_owned())
                .filter(|dir| !dir.is_empty())
                .unwrap_or_else(|| ".".to_owned());
            super::extraction::search_lead(q, &dir, &q.match_strings())
        })
        .flatten();
    LocalFetchResult {
        path: q.path.to_string(),
        source_sha256: Some(source.sha256.clone()),
        content: Some(String::new()),
        content_view: Some(MinifyMode::None),
        next: Some(NextCalls {
            text_search: search,
            ignore_case,
            read,
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

/// The selected text in the view it is returned in.
struct View {
    text: String,
    mode: MinifyMode,
    fallback: Option<MinifyFallback>,
}

/// Apply the requested `minify` view to the extracted text. A match read
/// stays verbatim evidence; an outline the file type cannot give falls
/// back to the standard view.
fn select_view(q: &LocalFetchQuery, ext: &mut super::extraction::Extraction) -> View {
    let requested = q.minify_mode();
    let selected = std::mem::take(&mut ext.text);
    // matchString reads are verbatim source; the tool description says so,
    // so the row carries no fallback notice. Byte windows address the
    // selected view (a numbered walk pages an oversized line by view bytes),
    // so they take no view of their own here.
    if q.match_string.is_some() {
        return View {
            text: selected,
            mode: MinifyMode::None,
            fallback: None,
        };
    }
    // Every transformed view keeps the citation gutter (`N\t`): the standard
    // view numbers each kept line with its source line, the outline uses the
    // same separator in every language.
    let standard_view = |selected: &str| {
        let view = octocode_engine::portable::apply_content_view_minification(selected, &q.path);
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
        MinifyMode::None => view(selected, MinifyMode::None),
        MinifyMode::Standard => view(standard_view(&selected), MinifyMode::Standard),
        MinifyMode::Symbols => {
            // The outline's lines are the source's own: no whitespace pass,
            // which would join tokens (`boolean{`, `string,...args`).
            let outline = octocode_engine::portable::extract_signatures(&selected, &q.path)
                .or_else(|| crate::content::markdown_heading_outline(&selected, &q.path));
            if let Some(outline) = outline {
                view(
                    declaration_ranges(
                        crate::tools::numbered::tab_gutter(&outline),
                        &selected,
                        &q.path,
                    ),
                    MinifyMode::Symbols,
                )
            } else {
                // `minifyFallback` is the typed notice of the applied view.
                View {
                    text: standard_view(&selected),
                    mode: MinifyMode::Standard,
                    fallback: Some(MinifyFallback {
                        requested: MinifyMode::Symbols,
                        applied: MinifyMode::Standard,
                        reason: "outline-unavailable".into(),
                    }),
                }
            }
        }
    }
}

/// An outline whose declaration heads carry their line span: the gutter
/// of a multi-line declaration's first shown line reads `start-end`, so a
/// body is one `ranges` read away. The gutter is metadata, not source text;
/// the TAB still separates the source.
fn declaration_ranges(outline: String, source: &str, path: &str) -> String {
    let Some(spans) = super::block::declaration_spans(source, path) else {
        return outline;
    };
    let mut ends = std::collections::HashMap::<usize, usize>::new();
    for (start, end) in spans {
        let entry = ends.entry(start).or_insert(end);
        *entry = (*entry).max(end);
    }
    let mut out = String::with_capacity(outline.len() + ends.len() * 6);
    for record in outline.split_inclusive('\n') {
        let head = record
            .split_once(crate::tools::numbered::SEPARATOR)
            .and_then(|(number, _)| number.parse::<usize>().ok())
            .and_then(|line| Some((line, ends.remove(&line)?)));
        match head {
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
    redacted: bool,
    /// The scanned view is empty.
    empty: bool,
    /// The scan kept the view's line count, so the page maps onto source lines.
    lines_kept: bool,
    warnings: Vec<String>,
}

/// Cut the page and scan it for secrets. A line or byte page is scanned on
/// its own window (see `sanitize_line_page` / `sanitize_byte_page`); a
/// complete view, or a window whose scan fails, takes the whole-view scan,
/// which owns the typed security-limit recovery.
#[allow(clippy::too_many_arguments)]
fn scan_page(
    q: &LocalFetchQuery,
    page_q: &LocalFetchQuery,
    selected: &str,
    line_page_bytes: usize,
    source_path: &std::path::Path,
    security: &impl ContentScan,
    source: &Source,
    first_line: Option<usize>,
    source_lines: Option<&SourceLines>,
) -> Result<ScannedPage, Box<LocalFetchResult>> {
    let pagination_error = |e| {
        Box::new(LocalFetchResult::error(
            q.path.to_string(),
            "invalidPagination",
            e,
        ))
    };
    if q.full_content != Some(true) {
        let windowed = match page_within(selected, page_q, line_page_bytes, source_lines)
            .map_err(pagination_error)?
        {
            raw if raw.pagination.unit == WindowUnit::Lines => {
                sanitize_line_page(selected, raw, source_path, security).unwrap_or(None)
            }
            raw => sanitize_byte_page(selected, raw, source_path, security).unwrap_or(None),
        };
        // Page sanitizers keep line counts, so a redacted page still maps
        // onto source lines.
        if let Some((page, redacted)) = windowed {
            return Ok(ScannedPage {
                page,
                redacted,
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
    )
    .map_err(pagination_error)?;
    Ok(ScannedPage {
        page,
        redacted: safe != selected,
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
    result.path = q.path.to_string();
    result.total_lines = Some(source.total_lines);
    result.source_chars = Some(source.chars);
    result.source_bytes = Some(source.bytes);
    result.is_partial = Some(true);
    result.terminal_limit = Some(true);
    result.partial_reasons = vec![PartialReason::SecuritySelectedView];
    if source.total_lines > 1 && (q.start_line().is_none() || q.start_line() != q.end_line()) {
        let line = first_line.or(q.start_line()).unwrap_or(1);
        result.next = Some(NextCalls {
            read_bounded_lines: Some(Continuation {
                query: single_line_query(q, line),
            }),
            ..NextCalls::default()
        });
    }
    result
}

/// Redacted text is not the source: say so, as localSearch does. Count only
/// when a redaction pass ran, so literal placeholder text in a clean file is
/// not misreported.
fn warn_redacted(text: &str, view_redacted: bool, source: &Source, warnings: &mut Vec<String>) {
    let redactions = if view_redacted || source.match_redacted || source.key_blocks_redacted {
        text.matches(octocode_engine::security::REDACTION_PREFIX)
            .count()
    } else {
        0
    };
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
/// not selected: name how many redacted lines no hit selected, so they are
/// not dropped silently. The count depends only on the file (a plain read
/// shows the same placeholders), never on the guess. A `ranges` read counts
/// hits inside its ranges only, so it is left out.
fn warn_unmatchable(
    q: &LocalFetchQuery,
    source: &Source,
    hits: &[usize],
    warnings: &mut Vec<String>,
) {
    if !source.match_redacted || q.match_string.is_none() || q.has_ranges() {
        return;
    }
    let unseen = source
        .text
        .lines()
        .enumerate()
        // Hits are ascending line numbers.
        .filter(|(index, line)| {
            line.contains(octocode_engine::security::REDACTION_PREFIX) && hits.binary_search(&(index + 1)).is_err()
        })
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
    let (total, unit) = match pg.pagination.unit {
        WindowUnit::Lines => (pg.pagination.total_lines, "lines"),
        WindowUnit::Bytes => (pg.pagination.total_bytes, "bytes"),
    };
    warnings.push(format!(
        "offset {} is past the end of the selected view ({total} {unit}); nothing was returned.",
        q.offset().unwrap_or(0),
    ));
    let mut query = q.clone();
    query.offset = Some(0);
    Some(NextCalls {
        restart: Some(Continuation { query }),
        ..NextCalls::default()
    })
}

/// Notes for a read with no anchor: a large file's head, and a reversed
/// range. Rows with content keep no prose hint, so these are warnings.
fn read_scope_warnings(
    q: &LocalFetchQuery,
    pg: &super::pagination::Page,
    head: bool,
    total_lines: usize,
    warnings: &mut Vec<String>,
) {
    warnings.extend(reversed_range_warnings(q));
    if let Some(pages) = long_line_pages(q, pg) {
        warnings.push(long_line_warning(pages));
    } else if head && pg.pagination.has_more {
        // A line page states its source span; a byte fallback its view lines.
        let shown = match pg.pagination.unit {
            WindowUnit::Lines => pg.pagination.offset + pg.pagination.length,
            WindowUnit::Bytes => pg.view_lines.1,
        };
        warnings.push(format!(
            "Large file ({total_lines} lines) read without an anchor: returned its first {shown} lines."
        ));
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
         (add contextLines for more), or unit:\"bytes\" with length:{LENGTH_MAXIMUM} walks it in fewer, larger pages."
    )
}

/// A reversed range (`"50-10"`) reads the same span low end first; the row
/// says so, so the caller sees how its range was read.
fn reversed_range_warnings(q: &LocalFetchQuery) -> Vec<String> {
    q.ranges
        .iter()
        .filter_map(|range| {
            let (start, end) = range.split_once('-')?;
            let (start, end) = (start.parse::<u64>().ok()?, end.parse::<u64>().ok()?);
            (end < start)
                .then(|| format!("Range \"{range}\" is reversed: read as lines {end}-{start}."))
        })
        .collect()
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
    let page_lines: Vec<usize> = lines
        [view_lines.0.saturating_sub(1)..view_lines.1.min(lines.len())]
        .iter()
        .copied()
        .filter(|line| *line != super::extraction::OMISSION_LINE)
        .collect();
    compress_ranges(&page_lines)
}

/// A first read with nothing selecting what to return: no match, range,
/// block, page cursor, page size, or whole-file request.
pub(crate) fn unanchored_first_read(q: &LocalFetchQuery) -> bool {
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

/// Sanitize the full source while preserving its line structure so match line
/// numbers stay source-accurate. Falls back to per-line sanitization when a
/// whole-source redaction would change the line count (multi-line pattern) or
/// the whole source exceeds the scanner size limit.
fn redact_source_lines(
    raw: &str,
    source_path: &std::path::Path,
    security: &impl ContentScan,
) -> Result<(String, bool), (String, String)> {
    if let Ok((whole, _)) = security.sanitize(raw, source_path) {
        if whole == raw {
            return Ok((whole, false));
        }
        if line_count(&whole) == line_count(raw) {
            return Ok((whole, true));
        }
    }
    let mut out = String::with_capacity(raw.len());
    for segment in raw.split_inclusive('\n') {
        let (body, newline) = segment
            .strip_suffix('\n')
            .map_or((segment, ""), |body| (body, "\n"));
        let (clean, _) = security.sanitize(body, source_path)?;
        out.push_str(&clean.replace('\n', " "));
        out.push_str(newline);
    }
    let changed = out != raw;
    Ok((out, changed))
}
/// Same file and caller metadata, every extraction selector reset to one raw line.
fn single_line_query(q: &LocalFetchQuery, line: usize) -> LocalFetchQuery {
    let mut query = LocalFetchQuery {
        minify: Some(MinifyMode::None),
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
/// versions must not be combined; restart the same view from the start.
fn stale_snapshot(q: &LocalFetchQuery) -> LocalFetchResult {
    let mut result = LocalFetchResult::error(
        q.path.to_string(),
        "staleSnapshot",
        crate::response::pages::STALE_SNAPSHOT_ERROR.into(),
    );
    let mut query = q.clone();
    query.snapshot = None;
    query.ranking = None;
    query.offset = None;
    result.next = Some(NextCalls {
        continue_window: None,
        read_bounded_lines: None,
        restart: Some(Continuation { query }),
        ..NextCalls::default()
    });
    result
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

/// Why a matchString can miss text that is visibly in the file: it ran on
/// the redacted text, whose secrets are placeholders.
const REDACTED_MATCH_HINT: &str = "No visible line matches; this file's secrets were redacted to [REDACTED…] placeholders before matching.";

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

/// Lines the same read selects when every pattern matches case-insensitively;
/// 0 when the patterns do not compile that way either.
fn insensitive_match_count(q: &LocalFetchQuery, text: &str, regex: &impl RegexMatch) -> usize {
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
    use crate::tools::test_support::Fixture;
    use crate::security::scan::Passthrough;

    /// Read `req` under `dir` with a passthrough scan.
    fn fetch(req: &LocalFetchQuery, paths: &Paths) -> LocalFetchResult {
        execute_local_fetch(
            req,
            paths,
            &Passthrough,
            &NeverCancel,
            &LocalFetchRegex,
            None,
        )
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
        let served = format!("served lines 1-{returned} of {lines}");
        assert!(
            first
                .warnings
                .iter()
                .any(|warning| warning.contains(&served)),
            "{served}: {:?}",
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
            )
        };
        let right = probe("AKIAIOSFODNN7EXAMPL");
        let wrong = probe("AKIAIOSFODNN7EXAMPQ");
        assert_eq!(right.selected_match_count, wrong.selected_match_count);
        assert_eq!(right.error_code, wrong.error_code);
        assert_eq!(right.selected_match_count, Some(0), "{right:?}");
        // Same hints either way (no oracle), and they explain the miss.
        assert_eq!(right.hints, wrong.hints);
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
        assert_eq!(
            head.warnings,
            vec!["Large file (1000 lines) read without an anchor: returned its first 50 lines."]
        );
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

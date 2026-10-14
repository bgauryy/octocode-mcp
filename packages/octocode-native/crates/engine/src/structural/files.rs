use std::collections::BTreeMap;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use rayon::prelude::*;

use super::language::AgLanguage;
use super::octo::{ExecutionError, OctoCompiledMatcher, compile_diagnostic, compile_matcher};
use super::query::{Prefilter, StructuralQuery, invalid_query_explanation};
use super::types::{
    StructuralDetailedMatch, StructuralDiagnostic, StructuralSearchDetailedFileResult,
    StructuralSearchFilesDetailedResult, StructuralSearchFilesOptions,
};
use crate::error::{Error, Result as EngineResult};
use crate::search::glob::Globs;
use crate::search::walk::{IgnorePolicy, Prune, Stop, pruned_walk_builder};
use crate::signatures::languages;
use crate::text::file_extension::extension_of;

/// Test helper: [`search_files`] with no path policy and each file's own
/// extension.
#[cfg(test)]
pub(crate) fn search_files_detailed(
    options: StructuralSearchFilesOptions,
) -> EngineResult<StructuralSearchFilesDetailedResult> {
    search_files(
        options,
        &|_| true,
        &|path| extension_for_path(path).unwrap_or_default(),
        &|| false,
    )
}

/// Detailed structural search with caller-owned descendant policy and a
/// caller-selected parser for ambiguous paths. `admit` decides each walked
/// entry before candidate accounting, literal prefilter reads, metadata
/// reads, and source reads; file paths remain unchanged in diagnostics and
/// match IDs. `stop` cancels the walk and the scan
/// ([`crate::error::ErrorKind::Cancelled`]).
///
/// An unset `max_files` caps nothing but the time: the scan evaluates
/// candidates in chunks and stops at the first chunk boundary past
/// [`crate::scan_budget::SCAN_TIME_BUDGET`], reporting where it resumes
/// ([`StructuralSearchFilesDetailedResult::scan_resume`]). An explicit
/// `max_files` is the caller's window and is never cut by time.
pub fn search_files(
    options: StructuralSearchFilesOptions,
    admit: &(dyn Fn(&Path) -> bool + Sync),
    select_extension: &(dyn Fn(&Path) -> String + Sync),
    stop: &Stop<'_>,
) -> EngineResult<StructuralSearchFilesDetailedResult> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        search_files_with_budget(
            options,
            admit,
            select_extension,
            stop,
            Some(crate::scan_budget::SCAN_TIME_BUDGET),
        )
    }))
    .unwrap_or_else(|_| {
        Err(Error::new(
            "structural detailed file search failed on pathological input",
        ))
    })
}

/// [`search_files`] with its time budget (`None` evaluates every candidate).
pub(crate) fn search_files_with_budget(
    options: StructuralSearchFilesOptions,
    admit: &(dyn Fn(&Path) -> bool + Sync),
    select_extension: &(dyn Fn(&Path) -> String + Sync),
    stop: &Stop<'_>,
    budget: Option<std::time::Duration>,
) -> EngineResult<StructuralSearchFilesDetailedResult> {
    let StructuralSearchFilesOptions {
        path,
        pattern,
        rule,
        include,
        exclude,
        exclude_dir,
        ignore,
        max_depth,
        max_files,
        skip_files,
        max_file_bytes,
    } = options;
    let pattern_ref = pattern.as_deref();
    let rule_ref = rule.as_deref();
    let query = match StructuralQuery::new(pattern_ref, rule_ref) {
        Ok(query) => query,
        Err(message) => return Ok(invalid_query_result(path, pattern_ref, rule_ref, message)),
    };

    let root = PathBuf::from(&path);
    if !admit(&root) {
        return Err(Error::new(
            "Structural search root is denied by path policy",
        ));
    }
    check_root_exists(&root)?;
    let timed = max_files.is_none();
    let max_files = max_files.map_or(crate::scan_budget::SCAN_WALK_FILES, |n| n as usize);
    let max_file_bytes = max_file_bytes
        .map(|n| n as u64)
        .unwrap_or(crate::signatures::MAX_PARSE_SIZE as u64);
    let prefilter = query.prefilter();
    let query_explanation = query.explanation_with_prefilter(&prefilter);

    let globs = crate::search::glob::compile(
        &root,
        &include.unwrap_or_default(),
        &exclude.unwrap_or_default(),
    )?;
    let mut candidate_files = collect_files(
        &root,
        &Walked {
            globs: &globs,
            prune: Prune::new(exclude_dir.iter().flatten()),
            ignore,
            max_depth,
            max_files: max_files.saturating_add(1),
        },
        admit,
        &|_| true,
        stop,
    )?;
    let scan_truncated = candidate_files.len() > max_files;
    candidate_files.truncate(max_files);
    // Walk order is stable, so the leading candidates an earlier window
    // evaluated are exactly these.
    let skip = skip_files
        .map_or(0, |n| n as usize)
        .min(candidate_files.len());
    candidate_files.drain(..skip);
    // Compile one matcher per extension up front (cheap, serial), then read,
    // prefilter, parse and match files in parallel. `collect` keeps candidate
    // order, and the serial fold below rebuilds the same counters.
    let scan = FileScan {
        admit,
        stop,
        select_extension,
        anchors: AnchorFilter::new(&prefilter).map_err(Error::new)?,
        matchers: compile_matchers(&candidate_files, select_extension, &query),
        max_file_bytes,
    };
    let started = std::time::Instant::now();
    let mut outcomes = Vec::with_capacity(candidate_files.len());
    let mut scan_resume = None;
    for chunk in candidate_files.chunks(crate::scan_budget::SCAN_CHUNK_FILES) {
        let evaluated = outcomes.len();
        if timed && evaluated > 0 && budget.is_some_and(|budget| started.elapsed() >= budget) {
            scan_resume = Some(u32::try_from(skip + evaluated).unwrap_or(u32::MAX));
            break;
        }
        outcomes.extend(
            chunk
                .par_iter()
                .map(|file_path| scan.file(file_path))
                .collect::<EngineResult<Vec<_>>>()?,
        );
    }
    let scan_truncated = scan_truncated || scan_resume.is_some();
    // The walk cap of an unset `max_files` resumes where the walk stopped.
    if timed && scan_resume.is_none() && scan_truncated {
        scan_resume = Some(u32::try_from(skip + candidate_files.len()).unwrap_or(u32::MAX));
    }

    let mut counts = ScanCounts::default();
    let mut files = Vec::with_capacity(outcomes.len());
    for (tally, file) in outcomes.into_iter().flatten() {
        counts.record(tally);
        files.push(file);
    }
    let warnings = counts.warnings(&prefilter, query.is_rule(), max_file_bytes);
    let status = counts.status(&files);
    let diagnostics = files
        .iter()
        .filter(|file| file.status == "truncated")
        .flat_map(|file| file.diagnostics.iter().cloned())
        .collect();
    Ok(StructuralSearchFilesDetailedResult {
        scan_truncated,
        scan_resume,
        files,
        total_matches: counts.total_matches,
        parsed_files: counts.parsed_files,
        skipped_by_pre_filter: counts.skipped_by_pre_filter,
        skipped_unsupported: counts.skipped_unsupported,
        skipped_unreadable: counts.skipped_unreadable,
        skipped_large: counts.skipped_large,
        status: status.to_owned(),
        query: query_explanation,
        diagnostics,
        warnings,
    })
}

type CompiledMatchers = BTreeMap<String, Result<OctoCompiledMatcher, String>>;

fn invalid_query_result(
    path: String,
    pattern: Option<&str>,
    rule: Option<&str>,
    message: String,
) -> StructuralSearchFilesDetailedResult {
    let diagnostic = StructuralDiagnostic::new(
        "structural.query.invalid",
        "error",
        "match",
        message.clone(),
    )
    .with_path(path)
    .with_recovery("Provide exactly one non-empty structural pattern or YAML rule.");
    StructuralSearchFilesDetailedResult {
        scan_truncated: false,
        scan_resume: None,
        files: Vec::new(),
        total_matches: 0,
        parsed_files: 0,
        skipped_by_pre_filter: 0,
        skipped_unsupported: 0,
        skipped_unreadable: 0,
        skipped_large: 0,
        status: "parserFailed".to_owned(),
        query: invalid_query_explanation(pattern, rule, &message),
        diagnostics: vec![diagnostic],
        warnings: Vec::new(),
    }
}

fn compile_matchers(
    candidate_files: &[PathBuf],
    select_extension: &(dyn Fn(&Path) -> String + Sync),
    query: &StructuralQuery,
) -> CompiledMatchers {
    let mut matchers = CompiledMatchers::new();
    for file_path in candidate_files {
        let ext = select_extension(file_path);
        if matchers.contains_key(&ext) {
            continue;
        }
        if let Some(entry) = languages::find_entry(&ext) {
            let lang = AgLanguage::new(&ext, entry);
            let compiled = compile_matcher(&lang, query);
            matchers.insert(ext, compiled);
        }
    }
    matchers
}

/// How one candidate file counts toward the scan totals.
enum Tally {
    None,
    PreFilter,
    Unsupported,
    Unreadable,
    Large,
    CompileFailure,
    Parsed(u32),
}

type FileOutcome = Option<(Tally, StructuralSearchDetailedFileResult)>;

/// Shared, read-only state of the parallel per-file scan.
struct FileScan<'a> {
    admit: &'a (dyn Fn(&Path) -> bool + Sync),
    stop: &'a Stop<'a>,
    select_extension: &'a (dyn Fn(&Path) -> String + Sync),
    anchors: Option<AnchorFilter>,
    matchers: CompiledMatchers,
    max_file_bytes: u64,
}

impl FileScan<'_> {
    /// Gate, read, and match one candidate. `None` when path policy denies it.
    fn file(&self, file_path: &Path) -> EngineResult<FileOutcome> {
        if (self.stop)() {
            return Err(Error::cancelled());
        }
        if !(self.admit)(file_path) {
            return Ok(None);
        }
        let path_string = file_path.to_string_lossy().to_string();
        // One read serves both the anchor check and the parse.
        let prefiltered = self
            .anchors
            .as_ref()
            .map(|anchors| anchors.check(file_path, self.max_file_bytes));
        if matches!(prefiltered, Some(Anchored::Miss)) {
            return Ok(Some((Tally::PreFilter, skipped_file(
                path_string,
                "skippedByPreFilter",
                "preFilter",
                StructuralDiagnostic::new(
                    "structural.prefilter.skipped",
                    "info",
                    "scan",
                    "File excluded by the text pre-filter (it does not contain the pattern's anchor literal), so AST parsing was skipped.",
                )
                .with_recovery("Remove the literal prefilter by using a rule with no safe anchor if every file must be parsed."),
            ))));
        }

        let ext = (self.select_extension)(file_path);
        let Some(entry) = languages::find_entry(&ext) else {
            return Ok(Some((
                Tally::Unsupported,
                skipped_file(
                    path_string.clone(),
                    "unsupported",
                    "unsupportedExtension",
                    unsupported_language(&path_string),
                ),
            )));
        };

        let content = match prefiltered {
            None | Some(Anchored::Miss) => read_source(file_path, self.max_file_bytes),
            Some(Anchored::Hit(bytes)) => source_text(bytes),
            Some(Anchored::Large(len)) => Err(SourceSkip::Large(len)),
        };
        let content = match content {
            Ok(content) => content,
            Err(skip) => {
                return Ok(Some(source_skipped(
                    path_string,
                    &skip,
                    self.max_file_bytes,
                )));
            }
        };
        Ok(Some(self.match_source(
            path_string,
            &ext,
            entry.language_id,
            &content,
        )))
    }

    fn match_source(
        &self,
        path_string: String,
        ext: &str,
        language_id: Option<&str>,
        content: &str,
    ) -> (Tally, StructuralSearchDetailedFileResult) {
        let Some(compiled) = self.matchers.get(ext) else {
            return (
                Tally::CompileFailure,
                skipped_file(
                    path_string.clone(),
                    "parserFailed",
                    "queryCompile",
                    StructuralDiagnostic::new(
                        "structural.matcher.missing",
                        "error",
                        "match",
                        "Structural matcher was unavailable after compilation.",
                    )
                    .with_path(path_string)
                    .with_recovery(
                        "Retry the search; this indicates an internal matcher lifecycle issue.",
                    ),
                ),
            );
        };
        let run = match compiled {
            Ok(run) => run,
            Err(message) => {
                if let Some(error) = ExecutionError::from_compile_message(message) {
                    let diagnostic = error.diagnostic(&path_string);
                    return (
                        Tally::None,
                        skipped_file(path_string, "truncated", "queryCompile", diagnostic),
                    );
                }
                return (
                    Tally::CompileFailure,
                    skipped_file(
                        path_string.clone(),
                        "parserFailed",
                        "queryCompile",
                        compile_diagnostic(message).with_path(path_string),
                    ),
                );
            }
        };

        let matches: Vec<StructuralDetailedMatch> = match run(content) {
            Ok(matches) => matches,
            Err(error) => {
                let diagnostic = error.diagnostic(&path_string);
                return (
                    Tally::None,
                    skipped_file(path_string, "truncated", "executionLimit", diagnostic),
                );
            }
        }
        .into_iter()
        .map(|m| StructuralDetailedMatch::from_match(m.matched, m.node_kind))
        .collect();
        (
            Tally::Parsed(matches.len() as u32),
            StructuralSearchDetailedFileResult {
                path: path_string,
                status: "ok".to_owned(),
                language_id: language_id.map(str::to_owned),
                skipped_reason: None,
                matches,
                diagnostics: Vec::new(),
            },
        )
    }
}

/// The diagnostic of a file whose extension selects no grammar, naming the
/// extension it has (or that it has none).
pub(super) fn unsupported_language(file_path: &str) -> StructuralDiagnostic {
    let extension = match extension_of(file_path, true, "").as_str() {
        "" => "files with no extension".to_owned(),
        extension => format!(".{extension} files"),
    };
    StructuralDiagnostic::new(
        "structural.language.unsupported",
        "warning",
        "parse",
        format!("Structural search has no grammar for {extension}."),
    )
    .with_path(file_path)
}

/// The skipped-file row and tally for a source that failed its read gates.
fn source_skipped(
    path_string: String,
    skip: &SourceSkip,
    max_file_bytes: u64,
) -> (Tally, StructuralSearchDetailedFileResult) {
    let (tally, status, reason, diagnostic) = match skip {
        SourceSkip::Metadata(err) => (
            Tally::Unreadable,
            "unreadable",
            "metadata",
            StructuralDiagnostic::new(
                "structural.file.unreadable",
                "warning",
                "scan",
                format!("Could not read file metadata: {err}."),
            )
            .with_recovery("Retry if the file still exists and permissions allow reading it."),
        ),
        SourceSkip::Large(len) => (
            Tally::Large,
            "truncated",
            "maxFileBytes",
            StructuralDiagnostic::new(
                "structural.file.tooLarge",
                "warning",
                "scan",
                format!(
                    "File is {len} bytes, above the structural search limit of {max_file_bytes} bytes."
                ),
            ),
        ),
        SourceSkip::Unreadable(err) | SourceSkip::NotUtf8(err) => (
            Tally::Unreadable,
            "unreadable",
            "read",
            StructuralDiagnostic::new(
                "structural.file.unreadable",
                "warning",
                "scan",
                format!("Could not read file content as UTF-8: {err}."),
            )
            .with_recovery("Use binary inspection or text search for non-UTF-8 content."),
        ),
    };
    let diagnostic = diagnostic.with_path(path_string.clone());
    (tally, skipped_file(path_string, status, reason, diagnostic))
}

/// Why a candidate's source was not read.
enum SourceSkip {
    Metadata(std::io::Error),
    Large(u64),
    Unreadable(std::io::Error),
    NotUtf8(std::io::Error),
}

/// Read a candidate's UTF-8 source through the one bounded reader: an
/// oversized file is refused from its handle's size, never read whole.
fn read_source(path: &Path, max_file_bytes: u64) -> Result<String, SourceSkip> {
    match crate::text::read_source(path, max_file_bytes) {
        Ok(source) => source_text(source.bytes),
        Err(crate::text::ReadError::TooLarge(len)) => Err(SourceSkip::Large(len)),
        Err(crate::text::ReadError::Io(err)) => Err(SourceSkip::Unreadable(err)),
        Err(crate::text::ReadError::NotRegular) => Err(SourceSkip::Metadata(
            std::io::Error::other("not a regular file"),
        )),
    }
}

#[derive(Default)]
struct ScanCounts {
    total_matches: u32,
    parsed_files: u32,
    skipped_by_pre_filter: u32,
    skipped_unsupported: u32,
    skipped_unreadable: u32,
    skipped_large: u32,
    compile_failures: u32,
}

impl ScanCounts {
    fn record(&mut self, tally: Tally) {
        match tally {
            Tally::None => {}
            Tally::PreFilter => self.skipped_by_pre_filter += 1,
            Tally::Unsupported => self.skipped_unsupported += 1,
            Tally::Unreadable => self.skipped_unreadable += 1,
            Tally::Large => self.skipped_large += 1,
            Tally::CompileFailure => self.compile_failures += 1,
            Tally::Parsed(count) => {
                self.parsed_files += 1;
                self.total_matches = self.total_matches.saturating_add(count);
            }
        }
    }

    fn warnings(&self, prefilter: &Prefilter, is_rule: bool, max_file_bytes: u64) -> Vec<String> {
        let Self {
            parsed_files,
            skipped_by_pre_filter,
            skipped_unsupported,
            skipped_unreadable,
            skipped_large,
            ..
        } = self;
        let mut warnings = Vec::new();
        match prefilter {
            Prefilter::None => {
                warnings.push(format!(
                    "No literal anchor in the {} — parsed all {parsed_files} supported candidate file(s) with no text pre-filter.",
                    if is_rule { "rule" } else { "pattern" }
                ));
            }
            Prefilter::Single(_) if *skipped_by_pre_filter > 0 => {
                warnings.push(format!(
                    "Pre-filter skipped parsing {skipped_by_pre_filter} file(s); parsed {parsed_files}."
                ));
            }
            Prefilter::Union(anchors) if *skipped_by_pre_filter > 0 => {
                warnings.push(format!(
                    "Union pre-filter ({} anchors: {}) skipped {skipped_by_pre_filter} file(s); parsed {parsed_files}.",
                    anchors.len(),
                    anchors.join("|")
                ));
            }
            _ => {}
        }
        if *skipped_unsupported > 0 {
            warnings.push(format!(
                "Skipped {skipped_unsupported} candidate file(s) with unsupported extensions."
            ));
        }
        if *skipped_unreadable > 0 {
            warnings.push(format!(
                "Skipped {skipped_unreadable} unreadable or vanished candidate file(s)."
            ));
        }
        if *skipped_large > 0 {
            warnings.push(format!(
                "Skipped {skipped_large} candidate file(s) larger than {max_file_bytes} bytes."
            ));
        }
        warnings
    }

    fn status(&self, files: &[StructuralSearchDetailedFileResult]) -> &'static str {
        if files.iter().any(|file| file.status == "truncated") {
            "truncated"
        } else if self.compile_failures > 0 {
            "parserFailed"
        } else if self.parsed_files == 0
            && self.skipped_unsupported > 0
            && self.skipped_by_pre_filter == 0
            && self.skipped_unreadable == 0
            && self.skipped_large == 0
        {
            "unsupported"
        } else if self.skipped_unsupported > 0
            || self.skipped_unreadable > 0
            || self.skipped_large > 0
        {
            "partial"
        } else {
            "ok"
        }
    }
}

/// The literal prefilter: a file that holds none of the pattern's anchors
/// cannot match, so it is skipped unparsed.
struct AnchorFilter {
    /// `None` when an anchor is empty: every readable file holds it.
    automaton: Option<aho_corasick::AhoCorasick>,
}

/// What the prefilter learned about one candidate.
enum Anchored {
    /// No anchor in the file, or the file could not be read.
    Miss,
    /// An anchor is present; the bytes read for the check, kept for the parse.
    Hit(Vec<u8>),
    /// An anchor is present in a file over the parse cap (its length).
    Large(u64),
}

impl AnchorFilter {
    fn new(prefilter: &Prefilter) -> Result<Option<Self>, String> {
        let anchors = match prefilter {
            Prefilter::None => return Ok(None),
            Prefilter::Single(anchor) => std::slice::from_ref(anchor),
            Prefilter::Union(anchors) => anchors.as_slice(),
        };
        // An empty anchor matches every file; short-circuit those instead of
        // feeding an empty pattern to Aho-Corasick. Otherwise build one
        // automaton for all anchors and scan each file in a single linear pass.
        let automaton = if anchors.iter().any(String::is_empty) {
            None
        } else {
            Some(aho_corasick::AhoCorasick::new(anchors).map_err(|error| error.to_string())?)
        };
        Ok(Some(Self { automaton }))
    }

    /// Read `path` once. A file within `max_file_bytes` is read whole and its
    /// bytes kept for the parse; a larger one is streamed only until the first
    /// anchor, never held in memory, since the parse skips it anyway.
    fn check(&self, path: &Path, max_file_bytes: u64) -> Anchored {
        let bytes = match crate::text::read_source(path, max_file_bytes) {
            Ok(source) => source.bytes,
            Err(crate::text::ReadError::TooLarge(len)) => {
                let hit = match &self.automaton {
                    None => true,
                    Some(automaton) => crate::text::source::open_regular(path)
                        .ok()
                        .and_then(|(mut file, _)| {
                            automaton.try_stream_find_iter(&mut file).ok()?.next()
                        })
                        .is_some_and(|found| found.is_ok()),
                };
                return if hit {
                    Anchored::Large(len)
                } else {
                    Anchored::Miss
                };
            }
            Err(_) => return Anchored::Miss,
        };
        if self
            .automaton
            .as_ref()
            .is_some_and(|automaton| !automaton.is_match(&bytes))
        {
            return Anchored::Miss;
        }
        Anchored::Hit(bytes)
    }
}

/// The UTF-8 text of bytes the prefilter read, failing as
/// `fs::read_to_string` does on invalid UTF-8.
fn source_text(bytes: Vec<u8>) -> Result<String, SourceSkip> {
    String::from_utf8(bytes).map_err(|_| {
        SourceSkip::NotUtf8(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "stream did not contain valid UTF-8",
        ))
    })
}

/// Loud existence check shared by every entry point.
fn check_root_exists(root: &Path) -> EngineResult<std::fs::Metadata> {
    fs::metadata(root).map_err(|err| {
        Error::io(
            &err,
            format!(
                "Cannot access structural search path '{}': {err}",
                root.display()
            ),
        )
    })
}

/// What a structural walk takes: its globs, pruned directory names, ignore
/// policy, depth (the root's entries are depth 1), and how many files it
/// collects.
struct Walked<'a> {
    globs: &'a Globs,
    prune: Prune,
    ignore: IgnorePolicy,
    max_depth: Option<u32>,
    max_files: usize,
}

/// The candidate files under `root`, in path order. A file root is its own
/// candidate when the globs and `accept_file` admit it.
fn collect_files(
    root: &Path,
    walked: &Walked<'_>,
    admit: &(dyn Fn(&Path) -> bool + Sync),
    accept_file: &dyn Fn(&Path) -> bool,
    stop: &Stop<'_>,
) -> EngineResult<Vec<PathBuf>> {
    let metadata = check_root_exists(root)?;
    if metadata.is_file() {
        let admitted = !walked.globs.overrides().matched(root, false).is_ignore();
        return Ok(if admitted && accept_file(root) {
            vec![root.to_path_buf()]
        } else {
            Vec::new()
        });
    }
    if !metadata.is_dir() {
        return Ok(Vec::new());
    }
    let mut builder = pruned_walk_builder(
        root,
        walked.ignore,
        walked.max_depth.map(|n| n as usize),
        walked.prune.clone(),
    );
    builder
        .overrides(walked.globs.overrides())
        .sort_by_file_path(Ord::cmp);
    let mut out = Vec::new();
    for result in builder.build() {
        if out.len() >= walked.max_files {
            break;
        }
        if stop() {
            return Err(Error::cancelled());
        }
        let Ok(entry) = result else { continue };
        if !entry.file_type().is_some_and(|ft| ft.is_file()) || !admit(entry.path()) {
            continue;
        }
        let path = entry.into_path();
        if accept_file(&path) {
            out.push(path);
        }
    }
    Ok(out)
}

fn extension_for_path(path: &Path) -> Option<String> {
    let extension = extension_of(&path.to_string_lossy(), true, "");
    (!extension.is_empty()).then_some(extension)
}

fn skipped_file(
    path: String,
    status: &str,
    skipped_reason: &str,
    diagnostic: StructuralDiagnostic,
) -> StructuralSearchDetailedFileResult {
    StructuralSearchDetailedFileResult {
        path,
        status: status.to_owned(),
        language_id: None,
        skipped_reason: Some(skipped_reason.to_owned()),
        matches: Vec::new(),
        diagnostics: vec![diagnostic],
    }
}

// ── Structural rewrite file walker ──────────────────────────────────────────

/// Result for a single file from a structural rewrite file-tree scan.
pub struct StructuralRewriteFileResult {
    pub path: String,
    pub matches: Vec<super::rewrite::StructuralRewriteMatch>,
    /// ERROR/MISSING nodes in the scanned source, from the same parse that
    /// produced `matches` (the pre-rewrite side of the syntax-regression check).
    pub syntax_errors: u32,
    /// Whole-word mentions of a renamed symbol that no match covers.
    pub unmatched: Vec<super::rewrite::UnmatchedMention>,
}

/// Aggregate result of a structural rewrite file-tree scan, including coverage
/// accounting. The counters let `astRewrite` report how much of the corpus the
/// rewrite actually covered.
#[derive(Default)]
pub struct StructuralRewriteFilesResult {
    /// Files that produced a rewrite match or an unmatched mention.
    pub files: Vec<StructuralRewriteFileResult>,
    /// Candidate scan hit `max_files`; files beyond it were not evaluated.
    pub scan_truncated: bool,
    /// Candidate files that could not be read (vanished, permission, IO).
    pub skipped_unreadable: u32,
    /// Candidate files larger than `max_file_bytes`.
    pub skipped_large: u32,
    /// Candidate files whose bytes are not valid UTF-8.
    pub skipped_binary: u32,
    /// Candidate files the rewrite engine rejected (parse/apply error, or the
    /// per-file match cap).
    pub skipped_errored: u32,
    /// Candidate files read and evaluated, with or without a match.
    pub files_scanned: u32,
}

/// Walk a file tree and apply an ast-grep inline-rule rewrite to every
/// candidate file in parallel. Files that produce no matches are omitted from
/// `files`; files that error, exceed the byte limit, are non-UTF8, or cannot be
/// read are counted in the coverage fields instead of being dropped silently.
///
/// The rule config must be a complete ast-grep inline-rule object (language,
/// rule, fix, etc.), as accepted by ast-grep's `--inline-rules`.
pub fn rewrite_files(
    options: super::types::StructuralRewriteFilesOptions,
) -> EngineResult<StructuralRewriteFilesResult> {
    let root = std::path::PathBuf::from(&options.path);
    check_root_exists(&root)?;

    let rule_config: serde_json::Value = serde_json::from_str(&options.rule_config_json)
        .map_err(|e| Error::new(format!("[structural.rewrite.json] {e}")))?;
    let selector = rule_config
        .get("language")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| Error::new("[structural.rewrite.invalid] language is required"))?
        .to_owned();
    let extensions = languages::family_extensions(&selector).ok_or_else(|| {
        Error::new(format!(
            "[structural.rewrite.invalid] {selector} is not supported"
        ))
    })?;

    let include = options.include.unwrap_or_default();
    let exclude = options.exclude.unwrap_or_default();
    let exclude_dir = options.exclude_dir.unwrap_or_default();
    let max_files = options.max_files.map(|n| n as usize).unwrap_or(2_000);
    let max_file_bytes = options
        .max_file_bytes
        .map_or(crate::signatures::MAX_PARSE_SIZE as u64, u64::from);

    let globs = crate::search::glob::compile(&root, &include, &exclude)?;
    let is_single_file = root.is_file();
    let candidate_files = collect_files(
        &root,
        &Walked {
            globs: &globs,
            prune: Prune::new(&exclude_dir),
            ignore: options.ignore,
            max_depth: options.max_depth,
            max_files: max_files.saturating_add(1),
        },
        &|_| true,
        &|path| {
            is_single_file
                || extension_for_path(path).is_some_and(|extension| extensions.contains(&extension))
        },
        &|| false,
    )?;
    // `collect_files` was asked for `max_files + 1`; if it returned more than
    // `max_files` the candidate scan was truncated and files beyond the cap were
    // never evaluated.
    let scan_truncated = candidate_files.len() > max_files;
    let candidate_files: Vec<_> = candidate_files.into_iter().take(max_files).collect();

    // The parser language varies per file (e.g. `.tsx` under `typescript`, `.h`
    // under `cpp`), so compile the rule once per distinct parser language before
    // the parallel scan instead of once per file.
    let parser_for = |path: &std::path::Path| -> String {
        languages::parser_for_path(&selector, &path.to_string_lossy())
    };
    let mut compiled: HashMap<String, Result<super::rewrite::CompiledRewrite, String>> =
        HashMap::new();
    for path in &candidate_files {
        compiled
            .entry(parser_for(path))
            .or_insert_with_key(|parser| {
                let mut file_rule = rule_config.clone();
                if let Some(config) = file_rule.as_object_mut() {
                    config.insert("language".to_owned(), serde_json::json!(parser));
                }
                super::rewrite::compile_rewrite(file_rule)
            });
    }

    // Per-thread skip accounting, mirroring the search path's coverage counters.
    use std::sync::atomic::{AtomicU32, Ordering};
    let skipped_unreadable = AtomicU32::new(0);
    let skipped_large = AtomicU32::new(0);
    let skipped_binary = AtomicU32::new(0);
    let skipped_errored = AtomicU32::new(0);
    let files_scanned = AtomicU32::new(0);

    let files: Vec<StructuralRewriteFileResult> = candidate_files
        .par_iter()
        .filter_map(|path| {
            let content = match read_source(path, max_file_bytes) {
                Ok(content) => content,
                Err(skip) => {
                    match skip {
                        SourceSkip::Metadata(_) | SourceSkip::Unreadable(_) => &skipped_unreadable,
                        SourceSkip::Large(_) => &skipped_large,
                        SourceSkip::NotUtf8(_) => &skipped_binary,
                    }
                    .fetch_add(1, Ordering::Relaxed);
                    return None;
                }
            };
            let result = match compiled.get(&parser_for(path)) {
                Some(Ok(rewrite)) => {
                    rewrite.scan_with(&content, super::rewrite::CountErrors::WhenMatched)
                }
                Some(Err(error)) => Err(error.clone()),
                None => Err("[structural.rewrite.invalid] no compiled rule".to_owned()),
            };
            if result.is_ok() {
                files_scanned.fetch_add(1, Ordering::Relaxed);
            }
            match result {
                Ok(scan) if scan.matches.is_empty() && scan.unmatched.is_empty() => None,
                Ok(scan) => Some(StructuralRewriteFileResult {
                    path: path.to_string_lossy().into_owned(),
                    matches: scan.matches,
                    syntax_errors: scan.syntax_errors,
                    unmatched: scan.unmatched,
                }),
                Err(_) => {
                    skipped_errored.fetch_add(1, Ordering::Relaxed);
                    None
                }
            }
        })
        .collect();

    Ok(StructuralRewriteFilesResult {
        files,
        scan_truncated,
        skipped_unreadable: skipped_unreadable.into_inner(),
        skipped_large: skipped_large.into_inner(),
        skipped_binary: skipped_binary.into_inner(),
        skipped_errored: skipped_errored.into_inner(),
        files_scanned: files_scanned.into_inner(),
    })
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod rewrite_coverage_tests {
    use super::*;

    #[test]
    fn cpp_rewrite_scans_h_headers_without_touching_c_sources() {
        let root = std::env::temp_dir().join(format!(
            "octocode-rewrite-cpp-header-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&root).expect("fixture root");
        fs::write(root.join("widget.h"), "void widget() { oldCall(); }\n").expect("C++ header");
        fs::write(root.join("legacy.c"), "void legacy() { oldCall(); }\n").expect("C source");
        let options = crate::structural::StructuralRewriteFilesOptions {
            path: root.to_string_lossy().into_owned(),
            rule_config_json: serde_json::json!({
                "id":"octocode-inline-rewrite",
                "language":"cpp",
                "rule":{"pattern":"oldCall()"},
                "fix":"newCall()"
            })
            .to_string(),
            include: None,
            exclude: None,
            exclude_dir: None,
            ignore: crate::search::walk::IgnorePolicy::default(),
            max_depth: None,
            max_files: Some(1),
            max_file_bytes: Some(1_000_000),
        };
        let result = rewrite_files(options).expect("rewrite files");
        let _ = fs::remove_dir_all(&root);
        assert!(
            !result.scan_truncated,
            "unrelated C files must not consume the scan cap"
        );
        assert_eq!(result.files.len(), 1);
        assert!(result.files[0].path.ends_with("widget.h"));
    }

    #[test]
    fn family_rewrite_uses_each_files_registered_parser() {
        let root = std::env::temp_dir().join(format!(
            "octocode-rewrite-tsx-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&root).expect("fixture root");
        fs::write(root.join("widget.tsx"), "const widget = <Old />;\n").expect("TSX source");
        let options = crate::structural::StructuralRewriteFilesOptions {
            path: root.to_string_lossy().into_owned(),
            rule_config_json: serde_json::json!({
                "id":"octocode-inline-rewrite",
                "language":"typescript",
                "rule":{"pattern":"<Old />"},
                "fix":"<New />"
            })
            .to_string(),
            include: None,
            exclude: None,
            exclude_dir: None,
            ignore: crate::search::walk::IgnorePolicy::default(),
            max_depth: None,
            max_files: Some(10),
            max_file_bytes: Some(1_000_000),
        };
        let result = rewrite_files(options).expect("rewrite files");
        let _ = fs::remove_dir_all(&root);
        assert_eq!(result.files.len(), 1);
        assert!(result.files[0].path.ends_with("widget.tsx"));
    }

    // Regression: a rewrite over a dir containing a non-UTF8 candidate file must
    // account for the skip in the coverage counters, not drop it silently.
    #[test]
    fn rewrite_files_reports_skipped_non_utf8_and_oversized_files() {
        let root = std::env::temp_dir().join(format!(
            "octocode-rewrite-skip-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("fixture root");
        // A matchable, valid file.
        fs::write(root.join("good.rs"), "fn main() { oldCall(); }\n").expect("good file");
        // A non-UTF8 file with a supported extension.
        fs::write(root.join("bad.rs"), [0xff_u8, 0xfe, 0xfd, 0x00]).expect("bad file");
        // An oversized file (exceeds the tiny max_file_bytes below).
        fs::write(root.join("big.rs"), "fn main() { oldCall(); }\n".repeat(64)).expect("big file");

        let options = crate::structural::StructuralRewriteFilesOptions {
            path: root.to_string_lossy().into_owned(),
            rule_config_json: serde_json::json!({
                "id":"octocode-inline-rewrite",
                "language":"rust",
                "rule":{"pattern":"oldCall()"},
                "fix":"newCall()"
            })
            .to_string(),
            include: None,
            exclude: None,
            exclude_dir: None,
            ignore: crate::search::walk::IgnorePolicy::default(),
            max_depth: None,
            max_files: Some(2_000),
            max_file_bytes: Some(64),
        };

        let result = rewrite_files(options).expect("rewrite files");
        let _ = fs::remove_dir_all(&root);

        assert_eq!(
            result.skipped_binary, 1,
            "the non-UTF8 file must be reported as a skip, not silently dropped"
        );
        assert_eq!(
            result.skipped_large, 1,
            "the oversized file must be reported as a skip, not silently dropped"
        );
        assert_eq!(
            result.files.len(),
            1,
            "only the small valid file should produce matches"
        );
    }
}

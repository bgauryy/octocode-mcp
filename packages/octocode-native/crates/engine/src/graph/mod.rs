mod algorithms;
mod diff;
mod model;

pub use algorithms::{
    Condensed, CycleWitnesses, FileEdge, FileGraphNode, condense, reachable, reverse, scc,
    scc_unsorted, shortest_path, strongly_connected_components, transitive_edges, traverse,
};
pub use diff::{GraphDiff, diff_across_roots, diff_graphs};
pub use model::{
    CodeGraphBuilder, CodeGraphSnapshot, EdgeKind, GraphFactCall, GraphFactCommonJs,
    GraphFactDeclaration, GraphFactEdge, GraphFactExport, GraphFactImport, GraphFactPath,
    GraphFactRustModule, GraphFactsDocument, GraphFactsTypedEntry, GraphPosition, GraphRange,
    IMPORT_USE_MODULE, NodeKind, SourceStamp,
};

use std::{fs, path::Path, sync::Arc};

use ignore::gitignore::Gitignore;
use rayon::prelude::*;

use crate::error::ErrorKind;
use crate::search::walk::Stop;
use crate::types::{FileSystemQueryOptions, GraphFactsScanDiagnostic, GraphFactsScanOptions};

/// Largest source the graph-facts scan parses; a larger file stays an
/// unparsed (skipped) node. One bound for astTopology, ingest, and reuse.
pub const MAX_GRAPH_SOURCE_BYTES: u32 = 1_000_000;

enum GraphFactsScanOutcome<T> {
    /// A parsed file and what the caller's map kept of it (`None`: nothing).
    Entry(String, Option<T>),
    Skipped(GraphFactsScanDiagnostic),
}

/// One parsed file, borrowed from the scan's cache: a caller reduces it to
/// what it keeps before the next file is read.
pub struct GraphFactsView<'a> {
    pub relative_path: &'a str,
    /// The source the facts were parsed from (the one read of the file).
    pub content: &'a str,
    pub content_digest: &'a str,
    pub source_stamp: Option<SourceStamp>,
    pub facts: &'a GraphFactsDocument,
    pub reference_counts: &'a [crate::types::GraphReferenceCount],
}

impl GraphFactsView<'_> {
    /// The whole parsed file, owned.
    pub fn to_entry(&self) -> GraphFactsTypedEntry {
        GraphFactsTypedEntry {
            relative_path: self.relative_path.to_owned(),
            content_digest: self.content_digest.to_owned(),
            source_stamp: self.source_stamp,
            facts: self.facts.clone(),
            reference_counts: self.reference_counts.to_vec(),
        }
    }
}

/// The result of [`scan_walked_graph_facts`]: only what the map kept.
#[derive(Debug)]
pub struct GraphFactsMappedScan<T> {
    /// `(relative path, kept value)` per file the map kept, sorted by path.
    pub kept: Vec<(String, T)>,
    /// Files read and parsed (kept or not); skipped files are separate.
    pub parsed: usize,
    pub skipped: Vec<GraphFactsScanDiagnostic>,
    pub files_skipped: u32,
    pub truncated: bool,
    pub scan_resume: Option<u32>,
    /// The first candidate (absolute path, walk order) the walk cap left
    /// out: it and every later candidate are unread.
    pub scan_frontier: Option<String>,
    pub pruned_dirs: Vec<String>,
}

/// Why a graph scan failed. The two `languageGlobs` refusals are typed so the
/// runtime maps them to their `errorCode` without reading message text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GraphScanError {
    /// A `languageGlobs` pattern is malformed or over its limits.
    InvalidGlob(String),
    /// A `languageGlobs` key selects no single registered grammar.
    UnsupportedLanguage(String),
    /// Walking or reading the tree failed, including a caller's path check.
    Failed(String),
}

impl std::fmt::Display for GraphScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidGlob(message) => write!(f, "[ast.language.invalidGlob] {message}"),
            Self::UnsupportedLanguage(message) => write!(f, "[ast.language.unsupported] {message}"),
            Self::Failed(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for GraphScanError {}

impl From<String> for GraphScanError {
    fn from(message: String) -> Self {
        Self::Failed(message)
    }
}

/// One `languageGlobs` rule: the parser extension it selects, and its glob
/// (see [`crate::search::glob`]).
pub type ParserOverride = (String, Gitignore);

/// Compiles `languageGlobs` rules against `root`; astSearch `match` selects
/// its parsers with the same rules.
pub fn parser_overrides(
    root: &Path,
    rules: Option<&[crate::types::GraphLanguageGlob]>,
) -> Result<Vec<ParserOverride>, GraphScanError> {
    if rules.unwrap_or_default().len() > 400 {
        return Err(GraphScanError::InvalidGlob(
            "languageGlobs exceeds 400 patterns".into(),
        ));
    }
    rules
        .unwrap_or_default()
        .iter()
        .map(|rule| {
            if rule.glob.len() > 256 || rule.glob.is_empty() {
                return Err(GraphScanError::InvalidGlob(
                    "glob must contain 1-256 characters".into(),
                ));
            }
            let extension = crate::signatures::languages::select_one(&rule.language)
                .and_then(|entry| entry.extensions.first())
                .ok_or_else(|| {
                    GraphScanError::UnsupportedLanguage(format!(
                        "languageGlobs key {:?} must select one registered grammar",
                        rule.language
                    ))
                })?;
            let matcher =
                crate::search::glob::set(root, [rule.glob.as_str()].into_iter(), "languageGlobs")
                    .map_err(|error| GraphScanError::InvalidGlob(error.reason))?
                    .unwrap_or_else(Gitignore::empty);
            Ok(((*extension).to_owned(), matcher))
        })
        .collect()
}

fn skipped<T>(relative_path: String, code: &str, message: &str) -> GraphFactsScanOutcome<T> {
    GraphFactsScanOutcome::Skipped(GraphFactsScanDiagnostic {
        relative_path,
        code: code.to_owned(),
        message: message.to_owned(),
    })
}

/// Graph facts of one parsed file.
struct ParsedFacts {
    facts: GraphFactsDocument,
    reference_counts: Vec<crate::types::GraphReferenceCount>,
    /// Estimated heap bytes of the facts, the cache weight.
    weight: u32,
}

/// Estimated heap bytes of one file's facts: every row's own size plus its
/// strings. A file's facts outweigh its source several times (ids, ranges,
/// edge and call rows), so the source size would let the cache hold far more
/// than its capacity names.
fn facts_heap_bytes(
    facts: &GraphFactsDocument,
    reference_counts: &[crate::types::GraphReferenceCount],
) -> usize {
    use std::mem::size_of;
    let text = |value: &str| value.len();
    let option = |value: &Option<String>| value.as_deref().map_or(0, str::len);
    let list = |values: &[String]| {
        values
            .iter()
            .map(|value| size_of::<String>() + value.len())
            .sum::<usize>()
    };
    let option_list = |values: &Option<Vec<String>>| values.as_deref().map_or(0, list);
    let mut bytes =
        text(&facts.kind) + text(&facts.source) + text(&facts.language) + text(&facts.file);
    bytes += facts
        .declarations
        .iter()
        .map(|d| {
            size_of::<GraphFactDeclaration>()
                + text(&d.id)
                + text(&d.name)
                + text(&d.kind)
                + list(&d.exported_as)
                + option(&d.parent)
        })
        .sum::<usize>();
    bytes += facts
        .imports
        .iter()
        .map(|i| {
            size_of::<GraphFactImport>()
                + text(&i.id)
                + text(&i.specifier)
                + text(&i.import_kind)
                + option(&i.local_name)
                + option(&i.imported_name)
                + option(&i.resolution_hint)
                + option_list(&i.module_scope)
                + option_list(&i.used_in)
        })
        .sum::<usize>();
    bytes += facts
        .exports
        .iter()
        .map(|e| {
            size_of::<GraphFactExport>()
                + text(&e.id)
                + text(&e.name)
                + text(&e.export_kind)
                + option(&e.local_name)
                + option(&e.source)
        })
        .sum::<usize>();
    bytes += facts
        .calls
        .iter()
        .map(|c| {
            size_of::<GraphFactCall>()
                + text(&c.id)
                + text(&c.caller)
                + option(&c.caller_id)
                + text(&c.callee)
                + text(&c.kind)
                + option(&c.receiver_type)
        })
        .sum::<usize>();
    bytes += facts
        .common_js
        .iter()
        .map(|c| {
            size_of::<GraphFactCommonJs>()
                + option(&c.specifier)
                + text(&c.kind)
                + text(&c.binding)
                + option(&c.reason)
        })
        .sum::<usize>();
    bytes += facts
        .edges
        .iter()
        .map(|e| {
            size_of::<GraphFactEdge>()
                + text(&e.id)
                + text(&e.from)
                + text(&e.to)
                + text(&e.relation)
                + text(&e.source)
                + text(&e.resolution)
        })
        .sum::<usize>();
    bytes += facts
        .modules
        .iter()
        .map(|m| {
            size_of::<GraphFactRustModule>() + text(&m.name) + list(&m.scope) + option(&m.path)
        })
        .sum::<usize>();
    bytes += facts
        .paths
        .iter()
        .map(|p| size_of::<GraphFactPath>() + text(&p.path) + option(&p.caller_id))
        .sum::<usize>();
    bytes += list(&facts.diagnostics);
    bytes += facts.error_lines.len() * size_of::<[u32; 2]>();
    bytes += reference_counts
        .iter()
        .map(|r| size_of::<crate::types::GraphReferenceCount>() + text(&r.declaration_id))
        .sum::<usize>();
    bytes
}

/// Parsed facts keyed by (content digest, relative path, parser override):
/// a rescan re-reads and hashes every file but re-parses only changed ones.
/// Content-addressed, so an edited file can never hit a stale entry.
static FACTS_MEMO: std::sync::LazyLock<moka::sync::Cache<String, Arc<ParsedFacts>>> =
    std::sync::LazyLock::new(|| {
        moka::sync::Cache::builder()
            .max_capacity(FACTS_MEMO_BYTES)
            .weigher(|_: &String, parsed: &Arc<ParsedFacts>| parsed.weight)
            .time_to_idle(std::time::Duration::from_secs(1800))
            .build()
    });

/// Estimated heap bytes the parsed-facts cache may hold.
const FACTS_MEMO_BYTES: u64 = 128 * 1024 * 1024;

/// Where a scan takes each file's facts from.
#[derive(Clone, Copy)]
pub enum FactsSource<'a> {
    /// Full graph facts (declarations, calls, paths, references), parsed
    /// once per content version and kept in the scan's own memo.
    Graph,
    /// Declarations only, from the caller's [`DeclarationsExtraction`] and
    /// its cache. The scan keeps no copy, so one cache holds a file's
    /// declarations; the view's reference counts are empty.
    Declarations(&'a DeclarationsExtraction),
}

/// A caller's declarations extraction: `(content, absolute path, parser
/// override)` to the file's declarations facts (`None`: no extractor, a
/// timeout).
pub type DeclarationsExtraction =
    dyn Fn(&str, &Path, Option<&str>) -> Option<Arc<GraphFactsDocument>> + Sync;

/// The candidate files a graph-facts scan of `options` reads, in walk order:
/// files of an outlined grammar (or mapped by `languageGlobs`) that `admit`
/// passes, up to `max_files` (unset: the walk budget). A caller that needs
/// the file list first (to count or fingerprint a scope) walks once with
/// this and hands the walk to [`scan_walked_graph_facts`].
pub fn walk_graph_fact_files(
    options: &GraphFactsScanOptions,
    admit: &(dyn Fn(&Path, Option<fs::FileType>) -> bool + Sync),
    stop: &Stop<'_>,
) -> Result<crate::types::FileSystemQueryResult, GraphScanError> {
    let root = std::path::PathBuf::from(&options.path);
    let overrides = parser_overrides(&root, options.language_globs.as_deref())?;
    let max_files = options
        .max_files
        .unwrap_or(u32::try_from(crate::scan_budget::walk_ceiling()).unwrap_or(u32::MAX));
    let extensions = crate::signatures::graph_facts::graph_fact_extensions();
    // A file only `languageGlobs` map to a grammar has an extension no grammar
    // claims, so with overrides the walk admits it by glob as well.
    let admitted = crate::search::fs_query::normalize_extensions(extensions.clone());
    let walk_filter = |path: &Path, file_type: Option<fs::FileType>, _| -> bool {
        if !admit(path, file_type) {
            return false;
        }
        let is_file = file_type.map_or_else(|| path.is_file(), |kind| kind.is_file());
        if overrides.is_empty() || !is_file {
            return true;
        }
        let name = path.file_name().map(|name| name.to_string_lossy());
        name.is_some_and(|name| crate::search::fs_query::has_extension(&name, &admitted))
            || overrides
                .iter()
                .any(|(_, matcher)| crate::search::glob::matches(matcher, path, false))
    };
    crate::search::fs_query::query_file_system(
        FileSystemQueryOptions {
            path: options.path.clone(),
            recursive: Some(true),
            ignore: options.ignore,
            entry_type: Some("f".to_owned()),
            extensions: overrides.is_empty().then_some(extensions),
            exclude_dir: options.exclude_dir.clone(),
            exclude: options.exclude.clone(),
            stop_at_limit: Some(true),
            limit: Some(max_files),
            ..Default::default()
        },
        &walk_filter,
        stop,
    )
    .map_err(|error| match error.kind() {
        ErrorKind::InvalidGlob => GraphScanError::InvalidGlob(error.reason),
        _ => GraphScanError::Failed(error.reason),
    })
}

/// Scans the graph facts of `walked`, a [`walk_graph_fact_files`] walk of
/// these same `options` (so `max_files` and the filters agree), handing each
/// parsed file to `map` as soon as it is parsed and keeping only what `map`
/// returns, so the scan holds what the caller needs rather than every file's
/// facts at once. A file whose source `keep` rejects (a byte prefilter, e.g.
/// a name the caller looks for) is read once and neither parsed nor mapped.
/// `stop` cancels the scan.
///
/// An unset `max_files` caps nothing but the time (see
/// [`crate::scan_budget`]): files are read in chunks and the scan stops at the
/// first chunk boundary past the budget, reporting `scan_resume`.
pub fn scan_walked_graph_facts<T: Send>(
    options: GraphFactsScanOptions,
    walked: crate::types::FileSystemQueryResult,
    source: FactsSource<'_>,
    keep: &(dyn Fn(&str) -> bool + Sync),
    map: &(dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
    stop: &Stop<'_>,
) -> Result<GraphFactsMappedScan<T>, GraphScanError> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        evaluate_walk(
            options,
            walked,
            source,
            keep,
            map,
            stop,
            Some(crate::scan_budget::SCAN_TIME_BUDGET),
        )
    }))
    .unwrap_or_else(|_| {
        Err(GraphScanError::Failed(
            "graph-facts scan failed on pathological input".to_owned(),
        ))
    })
}

/// Read, parse and map the walked candidates of a scan, within its time
/// budget when `max_files` is unset.
fn evaluate_walk<T: Send>(
    options: GraphFactsScanOptions,
    query: crate::types::FileSystemQueryResult,
    source: FactsSource<'_>,
    keep: &(dyn Fn(&str) -> bool + Sync),
    map: &(dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
    stop: &Stop<'_>,
    budget: Option<std::time::Duration>,
) -> Result<GraphFactsMappedScan<T>, GraphScanError> {
    let root = std::path::PathBuf::from(&options.path);
    let overrides = parser_overrides(&root, options.language_globs.as_deref())?;
    let timed = options.max_files.is_none();
    let max_file_bytes = options.max_file_bytes.unwrap_or(MAX_GRAPH_SOURCE_BYTES);
    let truncated = query.was_capped;
    let mut entries = query.entries;
    // Walk order is stable, so the leading files an earlier window read are
    // exactly these.
    let skip = options
        .skip_files
        .map_or(0, |n| n as usize)
        .min(entries.len());
    entries.drain(..skip);
    let evaluator = EntryEvaluator {
        overrides: &overrides,
        max_file_bytes,
        source,
        keep,
        map,
        stop,
    };
    let mut pacer = crate::scan_budget::ScanPacer::new(budget.filter(|_| timed));
    let mut kept: Vec<(String, T)> = Vec::new();
    let mut skipped = Vec::new();
    let (mut evaluated, mut parsed) = (0, 0);
    let mut scan_resume = None;
    let mut rest = entries.as_slice();
    while !rest.is_empty() {
        if pacer.spent() {
            scan_resume = Some(u32::try_from(skip + evaluated).unwrap_or(u32::MAX));
            break;
        }
        let (chunk, tail) = rest.split_at(pacer.next_chunk().min(rest.len()));
        rest = tail;
        evaluated += chunk.len();
        pacer.record(chunk.len());
        for outcome in chunk
            .par_iter()
            .map(|entry| evaluator.evaluate(entry))
            .collect::<Result<Vec<_>, GraphScanError>>()?
            .into_iter()
            .flatten()
        {
            match outcome {
                GraphFactsScanOutcome::Entry(path, value) => {
                    parsed += 1;
                    kept.extend(value.map(|value| (path, value)));
                }
                GraphFactsScanOutcome::Skipped(diagnostic) => skipped.push(diagnostic),
            }
        }
    }
    // The walk cap of an unset `max_files` resumes where the walk stopped.
    if timed && scan_resume.is_none() && truncated {
        scan_resume = Some(u32::try_from(skip + evaluated).unwrap_or(u32::MAX));
    }
    let truncated = truncated || scan_resume.is_some();
    kept.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    skipped.sort_unstable_by(|left, right| left.relative_path.cmp(&right.relative_path));
    let files_skipped = skipped.len() as u32;

    Ok(GraphFactsMappedScan {
        kept,
        parsed,
        skipped,
        files_skipped,
        truncated,
        scan_resume,
        scan_frontier: query.first_unlisted,
        pruned_dirs: query.pruned_dirs,
    })
}

/// What evaluating one walked file needs: the byte limit, the parser
/// overrides, and the caller's prefilter, map and stop.
struct EntryEvaluator<'s, T> {
    overrides: &'s [ParserOverride],
    max_file_bytes: u32,
    source: FactsSource<'s>,
    keep: &'s (dyn Fn(&str) -> bool + Sync),
    map: &'s (dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
    stop: &'s Stop<'s>,
}

impl<T> EntryEvaluator<'_, T> {
    /// Reads one walked file and maps its facts, parsed or reused from the
    /// memo: `None` when `keep` rejects its source, a skip diagnostic when it
    /// cannot be read, matches several parsers, or yields no facts.
    fn evaluate(
        &self,
        entry: &crate::types::FileSystemEntry,
    ) -> Result<Option<GraphFactsScanOutcome<T>>, GraphScanError> {
        if (self.stop)() {
            return Err(GraphScanError::Failed("cancelled".to_owned()));
        }
        let path = Path::new(&entry.path);
        let relative_path = entry.relative_path.replace('\\', "/");
        let outcome =
            |code: &str, message: &str| Ok(Some(skipped(relative_path.clone(), code, message)));
        let too_large = || {
            outcome(
                "graph.scan.fileTooLarge",
                "file exceeds the graph scan byte limit",
            )
        };
        // The walk's size is advisory: the read is bounded on its own.
        if entry.size.unwrap_or_default() > i64::from(self.max_file_bytes) {
            return too_large();
        }
        let source = match crate::text::read_source(path, u64::from(self.max_file_bytes)) {
            Ok(source) => source,
            Err(crate::text::ReadError::TooLarge(_)) => return too_large(),
            Err(_) => return outcome("graph.scan.readFailed", "file could not be opened"),
        };
        let metadata = source.metadata;
        let Ok(content) = String::from_utf8(source.bytes) else {
            return outcome(
                "graph.scan.readFailed",
                "file could not be read as UTF-8 text",
            );
        };
        if !(self.keep)(&content) {
            return Ok(None);
        }
        let selected = self
            .overrides
            .iter()
            .filter(|(_, matcher)| crate::search::glob::matches(matcher, path, false))
            .map(|(extension, _)| extension.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        if selected.len() > 1 {
            return outcome(
                "graph.scan.ambiguousParser",
                "languageGlobs matched this path with more than one parser",
            );
        }
        let content_digest = crate::digest::sha256(content.as_bytes());
        // A file written while it was read is not settled.
        let source_stamp = Some(&metadata)
            .filter(|meta| meta.len() == content.len() as u64)
            .and_then(|meta| SourceStamp::settled(meta, std::time::SystemTime::now()));
        let parser = selected.iter().next().copied();
        if let FactsSource::Declarations(extract) = self.source {
            let Some(facts) = extract(&content, path, parser) else {
                return outcome(
                    "graph.scan.extractFailed",
                    "native graph-fact extraction returned no result",
                );
            };
            let kept = (self.map)(&GraphFactsView {
                relative_path: &relative_path,
                content: &content,
                content_digest: &content_digest,
                source_stamp,
                facts: &facts,
                reference_counts: &[],
            });
            return Ok(Some(GraphFactsScanOutcome::Entry(relative_path, kept)));
        }
        let memo_key = format!(
            "{content_digest}\u{0}{relative_path}\u{0}{}",
            parser.unwrap_or("")
        );
        let parsed = if let Some(hit) = FACTS_MEMO.get(&memo_key) {
            hit
        } else {
            let extraction = if let Some(extension) = parser {
                crate::signatures::graph_facts::extract_graph_facts_with_metadata_with_extension(
                    &content,
                    &relative_path,
                    extension,
                )
            } else {
                crate::signatures::extract_graph_facts_with_metadata_inner(&content, &relative_path)
            };
            let Some(extraction) = extraction else {
                return outcome(
                    "graph.scan.extractFailed",
                    "native graph-fact extraction returned no result",
                );
            };
            let weight = facts_heap_bytes(&extraction.facts, &extraction.reference_counts);
            let parsed = Arc::new(ParsedFacts {
                facts: extraction.facts,
                reference_counts: extraction.reference_counts,
                weight: u32::try_from(weight).unwrap_or(u32::MAX),
            });
            FACTS_MEMO.insert(memo_key, Arc::clone(&parsed));
            parsed
        };
        let kept = (self.map)(&GraphFactsView {
            relative_path: &relative_path,
            content: &content,
            content_digest: &content_digest,
            source_stamp,
            facts: &parsed.facts,
            reference_counts: &parsed.reference_counts,
        });
        Ok(Some(GraphFactsScanOutcome::Entry(relative_path, kept)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::Path;

    /// Walks `options` and scans what the walk finds, with the time budget
    /// `budget` (`None` reads every candidate).
    fn scan_with_budget<T: Send>(
        options: GraphFactsScanOptions,
        admit: &(dyn Fn(&Path, Option<fs::FileType>) -> bool + Sync),
        keep: &(dyn Fn(&str) -> bool + Sync),
        map: &(dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
        stop: &Stop<'_>,
        budget: Option<std::time::Duration>,
    ) -> Result<GraphFactsMappedScan<T>, GraphScanError> {
        let walked = walk_graph_fact_files(&options, admit, stop)?;
        evaluate_walk(options, walked, FactsSource::Graph, keep, map, stop, budget)
    }

    /// A scan keeping every parsed file whole.
    #[derive(Debug)]
    struct Scanned {
        entries: Vec<GraphFactsTypedEntry>,
        skipped: Vec<GraphFactsScanDiagnostic>,
        files_skipped: u32,
        truncated: bool,
    }

    /// Every file the scan read or skipped, sorted.
    fn scanned_paths(result: &Scanned) -> Vec<String> {
        let mut paths: Vec<String> = result
            .entries
            .iter()
            .map(|entry| entry.relative_path.clone())
            .chain(result.skipped.iter().map(|skip| skip.relative_path.clone()))
            .collect();
        paths.sort_unstable();
        paths
    }

    fn scan_admitted(
        options: GraphFactsScanOptions,
        admit: &(dyn Fn(&Path, Option<fs::FileType>) -> bool + Sync),
    ) -> Result<Scanned, GraphScanError> {
        let scan = scan_with_budget(
            options,
            admit,
            &|_| true,
            &|view| Some(view.to_entry()),
            &|| false,
            Some(crate::scan_budget::SCAN_TIME_BUDGET),
        )?;
        Ok(Scanned {
            entries: scan.kept.into_iter().map(|(_, entry)| entry).collect(),
            skipped: scan.skipped,
            files_skipped: scan.files_skipped,
            truncated: scan.truncated,
        })
    }

    fn scan_graph_facts(options: GraphFactsScanOptions) -> Result<Scanned, GraphScanError> {
        scan_admitted(options, &|_, _| true)
    }

    fn create_supported_files(root: &Path, count: usize) {
        fs::create_dir_all(root).expect("create fixture");
        for index in 0..count {
            fs::write(
                root.join(format!("entry-{index}.ts")),
                format!("export const value{index} = {index};"),
            )
            .expect("write fixture file");
        }
    }

    /// A stamp stands in for content only once the file has been untouched
    /// for the settle window; a fresh write keeps the hash as the proof.
    #[test]
    fn a_source_stamp_settles_two_seconds_after_the_last_write() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(&root).expect("create fixture");
        let file = root.join("a.ts");
        fs::write(&file, "export const a = 1;").expect("write fixture");
        let meta = fs::metadata(&file).expect("meta");
        let stamp = SourceStamp::of(&meta).expect("stamp");
        assert_eq!(stamp.size, 19);
        let last_write = stamp.modified_ns.max(stamp.changed_ns);
        let at = |nanos: u64| std::time::UNIX_EPOCH + std::time::Duration::from_nanos(nanos);
        let settle = SourceStamp::SETTLE.as_nanos() as u64;
        assert_eq!(
            SourceStamp::settled(&meta, at(last_write + settle - 1)),
            None
        );
        assert_eq!(SourceStamp::settled(&meta, at(last_write)), None);
        assert_eq!(
            SourceStamp::settled(&meta, at(last_write + settle)),
            Some(stamp)
        );
        // A just-written file scans with no stamp: its digest stays the proof.
        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(10),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan graph facts");
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].source_stamp, None);
    }

    /// A walk cut at its file cap names the first candidate it left out, and
    /// every file before it is in the walk: a lowered walk ceiling cuts an
    /// unbounded scan the same way an explicit `max_files` does.
    #[test]
    fn a_capped_walk_names_the_first_candidate_it_left_out() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        create_supported_files(&root, 5);
        let walk = |options: GraphFactsScanOptions| {
            walk_graph_fact_files(&options, &|_, _| true, &|| false).expect("walk")
        };
        let options = |max_files| GraphFactsScanOptions {
            path: path_string(&root),
            max_files,
            ..Default::default()
        };
        let capped = walk(options(Some(3)));
        let names = |paths: &[String]| {
            paths
                .iter()
                .map(|path| path.rsplit('/').next().unwrap_or(path).to_owned())
                .collect::<Vec<_>>()
        };
        let listed: Vec<String> = capped.entries.iter().map(|e| e.path.clone()).collect();
        assert_eq!(names(&listed), ["entry-0.ts", "entry-1.ts", "entry-2.ts"]);
        let frontier = capped.first_unlisted.expect("a cut walk has a frontier");
        assert_eq!(names(&[frontier]), ["entry-3.ts"]);
        assert_eq!(walk(options(Some(5))).first_unlisted, None);
        let _ceiling = crate::scan_budget::lower_walk_ceiling(2);
        let unbounded = walk(options(None));
        assert_eq!(unbounded.entries.len(), 2);
        assert_eq!(
            names(&[unbounded.first_unlisted.expect("frontier")]),
            ["entry-2.ts"]
        );
        let scanned = scan_with_budget(
            options(None),
            &|_, _| true,
            &|_| true,
            &|view| Some(view.relative_path.to_owned()),
            &|| false,
            None,
        )
        .expect("scan");
        assert!(scanned.truncated);
        assert_eq!(scanned.scan_resume, Some(2));
        assert_eq!(
            names(&[scanned.scan_frontier.expect("scan frontier")]),
            ["entry-2.ts"]
        );
    }

    /// An unset `max_files` caps nothing but the time: a tree past the old
    /// 20,000-file default is read whole; a scan past its budget stops at a
    /// chunk boundary and the resumes reach every file exactly once.
    #[test]
    fn an_unbounded_scan_resumes_exactly_once_past_its_time_budget() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        create_supported_files(&root, 1_300);
        let scan = |skip: u32, budget: Option<std::time::Duration>| {
            scan_with_budget(
                GraphFactsScanOptions {
                    path: path_string(&root),
                    max_files: None,
                    skip_files: Some(skip),
                    ..Default::default()
                },
                &|_, _| true,
                &|_| true,
                &|view| Some(view.relative_path.to_owned()),
                &|| false,
                budget,
            )
            .expect("scan graph facts")
        };
        let whole = scan(0, None);
        assert!(!whole.truncated);
        assert_eq!(whole.scan_resume, None);
        assert_eq!(whole.kept.len(), 1_300);

        let mut seen = std::collections::BTreeSet::new();
        let (mut skip, mut calls) = (0, 0);
        loop {
            calls += 1;
            let result = scan(skip, Some(std::time::Duration::ZERO));
            for (path, _) in &result.kept {
                assert!(seen.insert(path.clone()), "{path} twice");
            }
            let Some(resume) = result.scan_resume else {
                assert!(!result.truncated);
                break;
            };
            assert!(result.truncated && resume > skip);
            skip = resume;
        }
        assert_eq!(seen.len(), 1_300);
        assert!(calls > 1);
    }

    /// A mapped scan keeps only what its map returns, so a scan over a huge
    /// tree holds the few rows the caller wants, not every file's facts.
    #[test]
    fn a_mapped_scan_keeps_only_what_the_map_returns() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        create_supported_files(&root, 40);
        let scan = scan_with_budget(
            GraphFactsScanOptions {
                path: path_string(&root),
                ..Default::default()
            },
            &|_, _| true,
            &|_| true,
            &|view| {
                view.facts
                    .declarations
                    .iter()
                    .find(|declaration| declaration.name == "value7")
                    .map(|declaration| declaration.name.clone())
            },
            &|| false,
            Some(crate::scan_budget::SCAN_TIME_BUDGET),
        )
        .expect("mapped scan");
        assert_eq!(scan.parsed, 40, "every file is parsed and counted");
        assert_eq!(scan.kept, [("entry-7.ts".to_owned(), "value7".to_owned())]);
        assert!(!scan.truncated);
    }

    /// The facts cache weighs estimated heap, not source bytes: facts of a
    /// small file with many declarations outweigh the file several times.
    #[test]
    fn cached_facts_are_weighed_by_their_heap_not_their_source() {
        let source: String = (0..200)
            .map(|index| format!("export const v{index} = {index};\n"))
            .collect();
        let extraction =
            crate::signatures::extract_graph_facts_with_metadata_inner(&source, "a.ts")
                .expect("extract facts");
        let weight = facts_heap_bytes(&extraction.facts, &extraction.reference_counts);
        assert!(
            weight > source.len() * 4,
            "{weight} bytes for {} source bytes",
            source.len()
        );
    }

    #[test]
    fn scans_supported_files_and_counts_export_references() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(root.join("src")).expect("create fixture");
        fs::write(
            root.join("src/entry.ts"),
            "export const answer = 1; console.log(answer);",
        )
        .expect("write fixture");
        fs::write(root.join("src/large.ts"), "x".repeat(64)).expect("write oversized fixture");
        fs::write(root.join("README.md"), "# ignored").expect("write ignored file");

        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(10),
            skip_files: None,
            max_file_bytes: Some(48),
            ..Default::default()
        })
        .expect("scan graph facts");

        assert_eq!(result.entries.len(), 1);
        assert_eq!(scanned_paths(&result), ["src/entry.ts", "src/large.ts"]);
        assert_eq!(result.files_skipped, 1);
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].relative_path, "src/large.ts");
        assert_eq!(result.skipped[0].code, "graph.scan.fileTooLarge");
        assert_eq!(result.entries[0].relative_path, "src/entry.ts");
        assert!(
            result.entries[0].reference_counts[0]
                .declaration_id
                .contains("#answer@")
        );
        assert_eq!(result.entries[0].reference_counts[0].count, 1);
        assert!(!result.truncated);
    }

    #[cfg(feature = "tree-sitter-cpp")]
    #[test]
    fn path_scoped_cpp_header_override_changes_only_matching_headers() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(root.join("include")).expect("create include fixture");
        fs::create_dir_all(root.join("legacy")).expect("create legacy fixture");
        fs::write(
            root.join("include/widget.h"),
            "namespace Space { class Widget {}; }\n",
        )
        .expect("write C++ header");
        fs::write(root.join("legacy/plain.h"), "struct Plain { int x; };\n")
            .expect("write C header");
        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            language_globs: Some(vec![crate::types::GraphLanguageGlob {
                language: "cpp".into(),
                glob: "include/**/*.h".into(),
            }]),
            ..Default::default()
        })
        .expect("scan with parser map");
        assert_eq!(result.entries.len(), 2);
        let declares = |path: &str, name: &str| {
            result
                .entries
                .iter()
                .find(|entry| entry.relative_path == path)
                .is_some_and(|entry| entry.facts.declarations.iter().any(|row| row.name == name))
        };
        assert!(declares("include/widget.h", "Widget"));
        assert!(declares("legacy/plain.h", "Plain"));
    }

    #[test]
    fn malformed_exclude_glob_fails_before_scanning_files() {
        let error = scan_graph_facts(GraphFactsScanOptions {
            path: "/nonexistent".into(),
            exclude: Some(vec!["**/dist/**".into(), "[bad".into()]),
            ..Default::default()
        })
        .expect_err("malformed exclude glob");
        assert!(matches!(error, GraphScanError::InvalidGlob(_)), "{error:?}");
        assert!(
            error
                .to_string()
                .starts_with("[ast.language.invalidGlob] invalid exclude glob '[bad': "),
            "{error}"
        );
    }

    #[test]
    fn malformed_parser_glob_fails_before_scanning_files() {
        let error = scan_graph_facts(GraphFactsScanOptions {
            path: "/nonexistent".into(),
            language_globs: Some(vec![crate::types::GraphLanguageGlob {
                language: "cpp".into(),
                glob: "[".into(),
            }]),
            ..Default::default()
        })
        .expect_err("malformed glob");
        assert!(matches!(error, GraphScanError::InvalidGlob(_)), "{error:?}");
        assert!(
            error
                .to_string()
                .starts_with("[ast.language.invalidGlob] invalid languageGlobs glob '[': "),
            "{error}"
        );
        let unsupported = scan_graph_facts(GraphFactsScanOptions {
            path: "/nonexistent".into(),
            language_globs: Some(vec![crate::types::GraphLanguageGlob {
                language: "no-such-grammar".into(),
                glob: "*.x".into(),
            }]),
            ..Default::default()
        })
        .expect_err("unknown grammar");
        assert!(
            matches!(unsupported, GraphScanError::UnsupportedLanguage(_)),
            "{unsupported:?}"
        );
    }

    #[test]
    fn reports_stable_read_and_extraction_failures() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(&root).expect("create fixture");
        fs::write(root.join("invalid.js"), [0xff, 0xfe]).expect("write invalid utf8 fixture");
        let extraction_size = crate::signatures::MAX_PARSE_SIZE + 1;
        fs::write(root.join("extract.ts"), vec![b'x'; extraction_size])
            .expect("write extraction fixture");

        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(10),
            skip_files: None,
            max_file_bytes: Some(extraction_size as u32),
            ..Default::default()
        })
        .expect("scan graph facts");

        assert_eq!(result.files_skipped as usize, result.skipped.len());
        assert_eq!(
            result
                .skipped
                .iter()
                .map(|diagnostic| (diagnostic.relative_path.as_str(), diagnostic.code.as_str()))
                .collect::<Vec<_>>(),
            [
                ("extract.ts", "graph.scan.extractFailed"),
                ("invalid.js", "graph.scan.readFailed"),
            ]
        );
    }

    #[test]
    fn preserves_reference_counts_from_both_fact_producers() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(&root).expect("create fixture");
        fs::write(
            root.join("main.ts"),
            "export function alpha() { return alpha; }",
        )
        .expect("write TypeScript fixture");
        fs::write(root.join("lib.rs"), "pub fn beta() { let _ = beta; }")
            .expect("write Rust fixture");

        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            ..Default::default()
        })
        .expect("scan graph facts");

        assert_eq!(
            result
                .entries
                .iter()
                .map(|entry| (
                    entry.relative_path.as_str(),
                    entry.reference_counts[0]
                        .declaration_id
                        .split(['#', '@'])
                        .nth(1)
                        .unwrap_or_default(),
                    entry.reference_counts[0].count,
                ))
                .collect::<Vec<_>>(),
            // The declaration name token is not a reference; the value use is.
            [("lib.rs", "beta", 1), ("main.ts", "alpha", 1)]
        );
    }

    #[test]
    fn typed_scan_preserves_structural_ids_ranges_edges_and_content_receipt() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(&root).expect("create fixture");
        fs::write(
            root.join("lib.rs"),
            "pub fn alpha() { beta(); }\nfn beta() {}",
        )
        .expect("write fixture");

        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            ..Default::default()
        })
        .expect("typed scan");
        let entry = result.entries.first().expect("entry");
        assert_eq!(entry.facts.file, "lib.rs");
        assert!(!entry.content_digest.is_empty());
        assert!(
            entry
                .facts
                .declarations
                .iter()
                .all(|decl| !decl.id.is_empty())
        );
        assert!(
            entry
                .facts
                .declarations
                .iter()
                .all(|decl| decl.range.end >= decl.range.start)
        );
        assert!(entry.facts.edges.iter().all(|edge| !edge.id.is_empty()));
    }

    #[test]
    fn reports_truncation_only_when_graph_scan_exceeds_the_file_cap() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        create_supported_files(&root, 3);

        let below_cap = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(4),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan below cap");
        assert_eq!(below_cap.entries.len(), 3);
        assert!(!below_cap.truncated);

        let exact_cap = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(3),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan at cap");
        assert_eq!(exact_cap.entries.len(), 3);
        assert!(!exact_cap.truncated);

        let over_cap = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(2),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan over cap");
        assert_eq!(over_cap.entries.len(), 2);
        assert!(over_cap.truncated);
    }

    #[test]
    fn detects_graph_scan_overflow_across_directory_boundaries() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        // Each child ends exactly at the initial cap, whichever is visited first.
        create_supported_files(&root.join("left"), 1);
        create_supported_files(&root.join("right"), 1);

        let capped = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(1),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan nested graph at cap");
        assert_eq!(capped.entries.len(), 1);
        assert!(
            capped.truncated,
            "the sibling subtree still has a graph file"
        );

        let expanded = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(2),
            skip_files: None,
            ..Default::default()
        })
        .expect("expand nested graph scan");
        assert_eq!(
            scanned_paths(&expanded),
            ["left/entry-0.ts", "right/entry-0.ts"]
        );
        assert!(
            !expanded.truncated,
            "an exactly full complete scan has no overflow"
        );
    }

    #[test]
    fn ignored_files_do_not_make_an_exact_graph_cap_partial() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        create_supported_files(&root, 1);
        fs::write(root.join("ignored.txt"), "not graph input").expect("write ignored file");
        fs::create_dir_all(root.join("ignored-directory")).expect("create ignored subtree");
        fs::write(
            root.join("ignored-directory/ignored.txt"),
            "not graph input",
        )
        .expect("write ignored child");

        let result = scan_graph_facts(GraphFactsScanOptions {
            path: path_string(&root),
            max_files: Some(1),
            skip_files: None,
            ..Default::default()
        })
        .expect("scan exactly one matching graph file");
        assert_eq!(scanned_paths(&result), ["entry-0.ts"]);
        assert!(
            !result.truncated,
            "nonmatching entries are not graph overflow"
        );
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn policy_denied_graph_files_do_not_consume_the_scan_budget() {
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(root.join("private")).expect("fixture");
        fs::write(root.join("private/hidden.rs"), "pub fn hidden() {}").expect("hidden");
        fs::write(root.join("visible.rs"), "pub fn visible() {}").expect("visible");
        let result = scan_admitted(
            GraphFactsScanOptions {
                path: path_string(&root),
                max_files: Some(1),
                skip_files: None,
                ..Default::default()
            },
            &|path, _| !path.starts_with(root.join("private")),
        )
        .expect("filtered scan");
        assert_eq!(scanned_paths(&result), ["visible.rs"]);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.files_skipped, 0);
        assert!(!result.truncated);
    }

    #[test]
    fn graph_read_enforces_limit_when_file_grows_after_discovery() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let fixture = tempfile::tempdir().expect("fixture");
        let root = fixture.path().to_path_buf();
        fs::create_dir_all(&root).expect("fixture");
        let file = root.join("growing.rs");
        fs::write(&file, "pub fn initial() {}").expect("initial");
        // Walked after `growing.rs` (name order): it grows once listed.
        let later = root.join("z.rs");
        fs::write(&later, "pub fn later() {}").expect("later");
        let visits = AtomicUsize::new(0);
        let result = scan_admitted(
            GraphFactsScanOptions {
                path: path_string(&root),
                max_file_bytes: Some(32),
                ..Default::default()
            },
            &|path, _| {
                if path == later && visits.fetch_add(1, Ordering::SeqCst) == 0 {
                    fs::write(&file, "x".repeat(65_536)).expect("concurrent growth");
                }
                true
            },
        )
        .expect("bounded scan");
        assert_eq!(scanned_paths(&result), ["growing.rs", "z.rs"]);
        assert_eq!(result.skipped[0].relative_path, "growing.rs");
        assert_eq!(result.skipped[0].code, "graph.scan.fileTooLarge");
    }
}

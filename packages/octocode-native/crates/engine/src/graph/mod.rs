mod algorithms;
mod diff;
mod model;

pub use algorithms::{
    Condensed, CycleWitnesses, FileEdge, FileGraphNode, condense, reachable, reverse, scc,
    scc_unsorted, shortest_path, strongly_connected_components, transitive_edges, traverse,
};
pub use diff::{GraphDiff, diff_graphs};
pub use model::{
    CodeGraphBuilder, CodeGraphSnapshot, EdgeKind, GraphFactCall, GraphFactCommonJs,
    GraphFactDeclaration, GraphFactEdge, GraphFactExport, GraphFactImport, GraphFactRustModule,
    GraphFactsDocument, GraphFactsTypedEntry, GraphFactsTypedScanResult, GraphPosition, GraphRange,
    IMPORT_USE_MODULE, NodeKind, SourceStamp,
};

use std::{fs, io::Read, path::Path, sync::Arc};

use globset::Glob;
use rayon::prelude::*;

use crate::types::{FileSystemQueryOptions, GraphFactsScanDiagnostic, GraphFactsScanOptions};

const DEFAULT_MAX_FILE_BYTES: u32 = 1_000_000;

enum GraphFactsScanOutcome<T> {
    /// A parsed file and what the caller's map kept of it (`None`: nothing).
    Entry(String, Option<T>),
    Skipped(GraphFactsScanDiagnostic),
}

/// One parsed file, borrowed from the scan's cache: a caller reduces it to
/// what it keeps before the next file is read.
pub struct GraphFactsView<'a> {
    pub relative_path: &'a str,
    pub content_digest: &'a str,
    pub source_stamp: Option<SourceStamp>,
    pub facts: &'a GraphFactsDocument,
    pub reference_counts: &'a [crate::types::GraphReferenceCount],
}

/// The result of [`scan_graph_facts_mapped`]: only what the map kept.
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
    pub pruned_dirs: Vec<String>,
}

fn parser_overrides(
    rules: Option<&[crate::types::GraphLanguageGlob]>,
) -> Result<Vec<(String, globset::GlobMatcher)>, String> {
    if rules.unwrap_or_default().len() > 400 {
        return Err("[ast.language.invalidGlob] languageGlobs exceeds 400 patterns".into());
    }
    rules.unwrap_or_default().iter().map(|rule| {
        if rule.glob.len() > 256 || rule.glob.is_empty() {
            return Err("[ast.language.invalidGlob] glob must contain 1-256 characters".into());
        }
        let selector = rule.language.to_ascii_lowercase();
        let entries: Vec<_> = crate::signatures::languages::all_entries().iter().filter(|entry| {
            entry.name.eq_ignore_ascii_case(&selector)
                || entry.language_id.is_some_and(|id| id.eq_ignore_ascii_case(&selector))
                || entry.extensions.iter().any(|ext| ext.eq_ignore_ascii_case(&selector))
        }).collect();
        if entries.len() != 1 {
            return Err(format!("[ast.language.unsupported] languageGlobs key {:?} must select one registered grammar", rule.language));
        }
        let extension = entries[0].extensions.first().ok_or_else(||
            format!("[ast.language.unsupported] {:?} has no source extension", rule.language)
        )?;
        let matcher = Glob::new(&rule.glob).map_err(|error|
            format!("[ast.language.invalidGlob] {:?}: {error}", rule.glob)
        )?.compile_matcher();
        Ok(((*extension).to_owned(), matcher))
    }).collect()
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

pub(crate) fn scan_graph_facts_typed_filtered(
    options: GraphFactsScanOptions,
    allow_path: &(dyn Fn(&Path) -> Result<bool, String> + Sync),
) -> Result<GraphFactsTypedScanResult, String> {
    scan_graph_facts_typed_selected(options, allow_path, &|_| true)
}

/// [`scan_graph_facts_mapped`] that keeps every parsed file whole.
pub fn scan_graph_facts_typed_selected(
    options: GraphFactsScanOptions,
    allow_path: &(dyn Fn(&Path) -> Result<bool, String> + Sync),
    keep: &(dyn Fn(&str) -> bool + Sync),
) -> Result<GraphFactsTypedScanResult, String> {
    let scan = scan_graph_facts_mapped(options, allow_path, keep, &|view| {
        Some(GraphFactsTypedEntry {
            relative_path: view.relative_path.to_owned(),
            content_digest: view.content_digest.to_owned(),
            source_stamp: view.source_stamp,
            facts: view.facts.clone(),
            reference_counts: view.reference_counts.to_vec(),
        })
    })?;
    Ok(GraphFactsTypedScanResult {
        schema_version: crate::signatures::GRAPH_FACTS_SCHEMA_VERSION,
        entries: scan.kept.into_iter().map(|(_, entry)| entry).collect(),
        skipped: scan.skipped,
        files_skipped: scan.files_skipped,
        truncated: scan.truncated,
        scan_resume: scan.scan_resume,
        pruned_dirs: scan.pruned_dirs,
    })
}

/// Scans the graph facts of a tree, handing each parsed file to `map` as soon
/// as it is parsed and keeping only what `map` returns, so the scan holds
/// what the caller needs rather than every file's facts at once. A file whose
/// source `keep` rejects (a byte prefilter, e.g. a name the caller looks for)
/// is read once and neither parsed nor mapped.
///
/// An unset `max_files` caps nothing but the time (see
/// [`crate::scan_budget`]): files are read in chunks and the scan stops at the
/// first chunk boundary past the budget, reporting `scan_resume`.
pub fn scan_graph_facts_mapped<T: Send>(
    options: GraphFactsScanOptions,
    allow_path: &(dyn Fn(&Path) -> Result<bool, String> + Sync),
    keep: &(dyn Fn(&str) -> bool + Sync),
    map: &(dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
) -> Result<GraphFactsMappedScan<T>, String> {
    scan_graph_facts_with_budget(
        options,
        allow_path,
        keep,
        map,
        Some(crate::scan_budget::SCAN_TIME_BUDGET),
    )
}

/// [`scan_graph_facts_mapped`] with its time budget (`None` reads every
/// candidate).
pub(crate) fn scan_graph_facts_with_budget<T: Send>(
    options: GraphFactsScanOptions,
    allow_path: &(dyn Fn(&Path) -> Result<bool, String> + Sync),
    keep: &(dyn Fn(&str) -> bool + Sync),
    map: &(dyn Fn(&GraphFactsView<'_>) -> Option<T> + Sync),
    budget: Option<std::time::Duration>,
) -> Result<GraphFactsMappedScan<T>, String> {
    let overrides = parser_overrides(options.language_globs.as_deref())?;
    let timed = options.max_files.is_none();
    let max_files = options
        .max_files
        .unwrap_or(crate::scan_budget::SCAN_WALK_FILES as u32);
    let max_file_bytes = options.max_file_bytes.unwrap_or(DEFAULT_MAX_FILE_BYTES) as i64;
    let query = crate::search::fs_query::query_file_system_filtered_inner(
        FileSystemQueryOptions {
            path: options.path,
            recursive: Some(true),
            show_hidden: Some(options.show_hidden.unwrap_or(false)),
            entry_type: Some("f".to_owned()),
            extensions: Some(crate::signatures::graph_facts::graph_fact_extensions()),
            exclude_dir: options.exclude_dir,
            exclude: options.exclude,
            stop_at_limit: Some(true),
            limit: Some(max_files),
            ..Default::default()
        },
        allow_path,
    )
    .map_err(|error| error.reason)?;

    let truncated = query.was_capped;
    let mut entries = query.entries;
    // Walk order is stable, so the leading files an earlier window read are
    // exactly these.
    let skip = options
        .skip_files
        .map_or(0, |n| n as usize)
        .min(entries.len());
    entries.drain(..skip);
    let evaluate =
        |entry: &crate::types::FileSystemEntry| -> Result<Option<GraphFactsScanOutcome<T>>, String> {
            let path = Path::new(&entry.path);
            if !allow_path(path)? {
                return Ok(None);
            }
            let relative_path = entry.relative_path.replace('\\', "/");
            let outcome =
                |code: &str, message: &str| Ok(Some(skipped(relative_path.clone(), code, message)));
            if entry.size.unwrap_or_default() > max_file_bytes {
                return outcome(
                    "graph.scan.fileTooLarge",
                    "file exceeds the graph scan byte limit",
                );
            }
            let Ok(mut file) = fs::File::open(path) else {
                return outcome("graph.scan.readFailed", "file could not be opened");
            };
            // Metadata is advisory: a file can grow between discovery and open.
            // The read itself has a strict bound, including one overflow byte.
            let mut content = String::new();
            if (&mut file)
                .take(max_file_bytes as u64 + 1)
                .read_to_string(&mut content)
                .is_err()
            {
                return outcome(
                    "graph.scan.readFailed",
                    "file could not be read as UTF-8 text",
                );
            }
            if content.len() > max_file_bytes as usize {
                return outcome(
                    "graph.scan.fileTooLarge",
                    "file exceeds the graph scan byte limit",
                );
            }
            if !keep(&content) {
                return Ok(None);
            }
            if !allow_path(path)? {
                return Ok(None);
            }
            let selected = overrides
                .iter()
                .filter(|(_, matcher)| matcher.is_match(&relative_path))
                .map(|(extension, _)| extension.as_str())
                .collect::<std::collections::BTreeSet<_>>();
            if selected.len() > 1 {
                return outcome(
                    "graph.scan.ambiguousParser",
                    "languageGlobs matched this path with more than one parser",
                );
            }
            let content_digest = crate::digest::sha256(content.as_bytes());
            // Taken from the open handle after the read, so it describes the
            // bytes just hashed; a file written meanwhile is not settled.
            let source_stamp = file
                .metadata()
                .ok()
                .filter(|meta| meta.len() == content.len() as u64)
                .and_then(|meta| SourceStamp::settled(&meta, std::time::SystemTime::now()));
            let parser = selected.iter().next().copied();
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
                    crate::signatures::extract_graph_facts_with_metadata_inner(
                        &content,
                        &relative_path,
                    )
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
            if !allow_path(path)? {
                return Ok(None);
            }
            let kept = map(&GraphFactsView {
                relative_path: &relative_path,
                content_digest: &content_digest,
                source_stamp,
                facts: &parsed.facts,
                reference_counts: &parsed.reference_counts,
            });
            Ok(Some(GraphFactsScanOutcome::Entry(relative_path, kept)))
        };
    let started = std::time::Instant::now();
    let mut kept: Vec<(String, T)> = Vec::new();
    let mut skipped = Vec::new();
    let (mut evaluated, mut parsed) = (0, 0);
    let mut scan_resume = None;
    for chunk in entries.chunks(crate::scan_budget::SCAN_CHUNK_FILES) {
        if timed && evaluated > 0 && budget.is_some_and(|budget| started.elapsed() >= budget) {
            scan_resume = Some(u32::try_from(skip + evaluated).unwrap_or(u32::MAX));
            break;
        }
        evaluated += chunk.len();
        for outcome in chunk
            .par_iter()
            .map(&evaluate)
            .collect::<Result<Vec<_>, String>>()?
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
        pruned_dirs: query.pruned_dirs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::Path;

    /// Every file the scan read or skipped, sorted.
    fn scanned_paths(result: &GraphFactsTypedScanResult) -> Vec<String> {
        let mut paths: Vec<String> = result
            .entries
            .iter()
            .map(|entry| entry.relative_path.clone())
            .chain(result.skipped.iter().map(|skip| skip.relative_path.clone()))
            .collect();
        paths.sort_unstable();
        paths
    }

    fn scan_graph_facts(
        options: GraphFactsScanOptions,
    ) -> Result<GraphFactsTypedScanResult, String> {
        scan_graph_facts_typed_filtered(options, &|_| Ok(true))
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
        let root = std::env::temp_dir().join(format!("octocode-stamp-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    /// An unset `max_files` caps nothing but the time: a tree past the old
    /// 20,000-file default is read whole; a scan past its budget stops at a
    /// chunk boundary and the resumes reach every file exactly once.
    #[test]
    fn an_unbounded_scan_resumes_exactly_once_past_its_time_budget() {
        let root =
            std::env::temp_dir().join(format!("octocode-graph-budget-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_supported_files(&root, 1_300);
        let scan = |skip: u32, budget: Option<std::time::Duration>| {
            scan_graph_facts_with_budget(
                GraphFactsScanOptions {
                    path: path_string(&root),
                    max_files: None,
                    skip_files: Some(skip),
                    ..Default::default()
                },
                &|_| Ok(true),
                &|_| true,
                &|view| Some(view.relative_path.to_owned()),
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    /// A mapped scan keeps only what its map returns, so a scan over a huge
    /// tree holds the few rows the caller wants, not every file's facts.
    #[test]
    fn a_mapped_scan_keeps_only_what_the_map_returns() {
        let root =
            std::env::temp_dir().join(format!("octocode-graph-mapped-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_supported_files(&root, 40);
        let scan = scan_graph_facts_mapped(
            GraphFactsScanOptions {
                path: path_string(&root),
                ..Default::default()
            },
            &|_| Ok(true),
            &|_| true,
            &|view| {
                view.facts
                    .declarations
                    .iter()
                    .find(|declaration| declaration.name == "value7")
                    .map(|declaration| declaration.name.clone())
            },
        )
        .expect("mapped scan");
        assert_eq!(scan.parsed, 40, "every file is parsed and counted");
        assert_eq!(scan.kept, [("entry-7.ts".to_owned(), "value7".to_owned())]);
        assert!(!scan.truncated);
        fs::remove_dir_all(root).expect("cleanup fixture");
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
        let root = std::env::temp_dir().join(format!("octocode-graph-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
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
        assert_eq!(result.schema_version, 1);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[cfg(feature = "tree-sitter-cpp")]
    #[test]
    fn path_scoped_cpp_header_override_changes_only_matching_headers() {
        let root =
            std::env::temp_dir().join(format!("octocode-header-globs-{}", std::process::id()));
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
        assert!(error.starts_with("[ast.language.invalidGlob]"), "{error}");
    }

    #[test]
    fn reports_stable_read_and_extraction_failures() {
        let root = std::env::temp_dir().join(format!(
            "octocode-graph-scan-diagnostics-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn preserves_reference_counts_from_both_fact_producers() {
        let root = std::env::temp_dir().join(format!(
            "octocode-graph-scan-reference-metadata-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn typed_scan_preserves_structural_ids_ranges_edges_and_content_receipt() {
        let root =
            std::env::temp_dir().join(format!("octocode-graph-typed-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create fixture");
        fs::write(
            root.join("lib.rs"),
            "pub fn alpha() { beta(); }\nfn beta() {}",
        )
        .expect("write fixture");

        let result = scan_graph_facts_typed_filtered(
            GraphFactsScanOptions {
                path: path_string(&root),
                ..Default::default()
            },
            &|_| Ok(true),
        )
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn reports_truncation_only_when_graph_scan_exceeds_the_file_cap() {
        let root =
            std::env::temp_dir().join(format!("octocode-graph-scan-cap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
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

        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn detects_graph_scan_overflow_across_directory_boundaries() {
        let root = std::env::temp_dir().join(format!(
            "octocode-graph-scan-nested-cap-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn ignored_files_do_not_make_an_exact_graph_cap_partial() {
        let root = std::env::temp_dir().join(format!(
            "octocode-graph-scan-filtered-cap-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
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
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn policy_denied_graph_files_do_not_consume_the_scan_budget() {
        let root =
            std::env::temp_dir().join(format!("octocode-graph-policy-{}", std::process::id()));
        fs::create_dir_all(root.join("private")).expect("fixture");
        fs::write(root.join("private/hidden.rs"), "pub fn hidden() {}").expect("hidden");
        fs::write(root.join("visible.rs"), "pub fn visible() {}").expect("visible");
        let result = scan_graph_facts_typed_filtered(
            GraphFactsScanOptions {
                path: path_string(&root),
                max_files: Some(1),
                skip_files: None,
                ..Default::default()
            },
            &|path| Ok(!path.starts_with(root.join("private"))),
        )
        .expect("filtered scan");
        assert_eq!(scanned_paths(&result), ["visible.rs"]);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.files_skipped, 0);
        assert!(!result.truncated);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn graph_read_enforces_limit_when_file_grows_after_discovery() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let root =
            std::env::temp_dir().join(format!("octocode-graph-growth-{}", std::process::id()));
        fs::create_dir_all(&root).expect("fixture");
        let file = root.join("growing.rs");
        fs::write(&file, "pub fn initial() {}").expect("initial");
        let visits = AtomicUsize::new(0);
        let result = scan_graph_facts_typed_filtered(
            GraphFactsScanOptions {
                path: path_string(&root),
                max_file_bytes: Some(32),
                ..Default::default()
            },
            &|path| {
                if path == file && visits.fetch_add(1, Ordering::SeqCst) == 1 {
                    fs::write(&file, "x".repeat(65_536)).expect("concurrent growth");
                }
                Ok(true)
            },
        )
        .expect("bounded scan");
        assert!(result.entries.is_empty());
        assert_eq!(result.skipped[0].code, "graph.scan.fileTooLarge");
        fs::remove_dir_all(root).expect("cleanup");
    }
}

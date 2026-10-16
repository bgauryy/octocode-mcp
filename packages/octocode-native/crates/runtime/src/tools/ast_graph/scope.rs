//! The coverage gaps that can change one astTopology answer. A traversal or
//! path reads part of the graph: a skipped file or an unlinked import outside
//! it changes none of its rows, so it leaves the answer complete. Cycles,
//! dead code and drift answer for the whole root and keep every gap. The
//! scan's own tallies (`coverage.imports`, `diagnosticCounts`, diagnostic
//! rows) stay scan-wide.

use super::algorithms::reachable;
use super::analysis::{is_js_ts, module_stem, node_key};
use super::linking::Linker;
use super::types::{AstTopologyQuery, BuiltGraph, Diagnostic, GraphAnalysis};
use serde_json::Value;
use std::collections::BTreeSet;

/// Files whose gaps an answer reads.
pub(super) enum Reach {
    /// The whole root: every gap counts.
    Graph,
    /// An outgoing edge of these files can change the answer.
    From(BTreeSet<String>),
    /// An edge into these files, from any file, can change the answer.
    Into(BTreeSet<String>),
}

/// Codes of a file the scan could not read: its imports are unknown.
const UNREAD: [&str; 2] = ["scan-skip", "facts-schema-unsupported"];

impl Reach {
    pub(super) fn of(b: &BuiltGraph, q: &AstTopologyQuery, items: &[Value]) -> Self {
        let source = || q.source().map(|raw| node_key(raw, &b.root, &b.nodes));
        // A traversal expands each row closer than its depth.
        let expanded = || {
            let depth = u64::from(q.depth().unwrap_or(1));
            source()
                .into_iter()
                .chain(
                    items
                        .iter()
                        .filter(|item| item["distance"].as_u64().is_some_and(|d| d < depth))
                        .filter_map(|item| item["file"].as_str().map(str::to_owned)),
                )
                .collect::<BTreeSet<_>>()
        };
        match q.analysis() {
            GraphAnalysis::Dependencies => Self::From(expanded()),
            GraphAnalysis::Dependents => Self::Into(expanded()),
            GraphAnalysis::Path => Self::From(source().map_or_else(BTreeSet::new, |source| {
                match found_hops(items) {
                    // A found path is proven: an unlinked edge can only add
                    // a shorter one, and only out of a file nearer the source
                    // than the path's next-to-last step.
                    Some(hops) => near(b, &source, hops.checked_sub(2)),
                    None => reachable(&b.nodes, &[source], false),
                }
            })),
            // The live files: an edge out of an unreached file reaches
            // nothing new.
            GraphAnalysis::Reachability => Self::From(
                items
                    .iter()
                    .filter(|item| item["reachable"] == true)
                    .filter_map(|item| item["files"].as_array())
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
            ),
            GraphAnalysis::Cycles | GraphAnalysis::DeadCode | GraphAnalysis::Drift => Self::Graph,
        }
    }

    /// The scan's diagnostics that can change this answer.
    pub(super) fn diagnostics<'a>(&self, b: &'a BuiltGraph) -> Vec<&'a Diagnostic> {
        b.diagnostics
            .iter()
            .filter(|d| self.reaches(b, d))
            .collect()
    }

    /// Whether a file the scan could not read can change this answer. Every
    /// skipped file has a diagnostic; an unnamed one counts.
    pub(super) fn reaches_skipped(&self, b: &BuiltGraph, relevant: &[&Diagnostic]) -> bool {
        let named = b
            .diagnostics
            .iter()
            .filter(|d| d.code == "scan-skip")
            .count();
        usize::try_from(b.files_skipped).is_ok_and(|skipped| skipped > named)
            || relevant.iter().any(|d| UNREAD.contains(&d.code.as_str()))
    }

    fn reaches(&self, b: &BuiltGraph, d: &Diagnostic) -> bool {
        // A scan-level fact (no go.mod, Cargo metadata) touches every file.
        if d.file == "." {
            return true;
        }
        match self {
            Self::Graph => true,
            // An unread file is missing from the graph: an answer reads it
            // only through an import that may name it.
            Self::From(files) if UNREAD.contains(&d.code.as_str()) => files
                .iter()
                .any(|file| unlinked(b, file, None).any(|spec| may_name(file, spec, &d.file))),
            Self::From(files) => files.contains(&d.file),
            Self::Into(targets) => {
                targets.iter().any(|target| same_language(&d.file, target))
                    && (d.code != "unresolved-internal"
                        || unlinked(b, &d.file, d.line)
                            .any(|spec| targets.iter().any(|t| may_name(&d.file, spec, t))))
            }
        }
    }
}

/// Edges of the path a path answer found; `None` when it found none.
fn found_hops(items: &[Value]) -> Option<usize> {
    let found = items.first().filter(|item| item["found"] == true)?;
    Some(found["files"].as_array()?.len().saturating_sub(1))
}

/// `source` and the files at most `depth` edges from it; nothing when
/// `depth` is `None` (a direct edge: no shorter path exists).
fn near(b: &BuiltGraph, source: &str, depth: Option<usize>) -> BTreeSet<String> {
    let Some(depth) = depth else {
        return BTreeSet::new();
    };
    let mut files = BTreeSet::from([source.to_owned()]);
    if let Ok(depth @ 1..) = u32::try_from(depth) {
        files.extend(
            super::algorithms::traverse(&b.nodes, source, depth)
                .iter()
                .filter_map(|row| row["file"].as_str().map(str::to_owned)),
        );
    }
    files
}

/// Specifiers of `file`'s imports no resolver linked to a scanned file nor
/// to a package (at `line`, when given). A file without facts yields one
/// unknown specifier, so it is never ruled out.
fn unlinked<'a>(
    b: &'a BuiltGraph,
    file: &str,
    line: Option<u32>,
) -> Box<dyn Iterator<Item = &'a str> + 'a> {
    let Some(facts) = b.facts.get(file) else {
        return Box::new(std::iter::once(""));
    };
    let specs = facts
        .imports
        .iter()
        .filter(move |import| {
            import.target.is_none()
                && !import.external
                && line.is_none_or(|line| import.line == line)
        })
        .map(|import| import.specifier.as_str())
        .collect::<Vec<_>>();
    // A diagnostic whose import the facts do not hold is never ruled out.
    if specs.is_empty() && line.is_some() {
        return Box::new(std::iter::once(""));
    }
    Box::new(specs.into_iter())
}

/// Whether `spec`, imported by `importer`, may name `file`. Only a JS/TS
/// relative specifier is ruled out: by the path it spells. Any other may
/// resolve through configuration this scan did not link.
fn may_name(importer: &str, spec: &str, file: &str) -> bool {
    if !is_js_ts(importer) || !spec.starts_with('.') {
        return true;
    }
    let Some(joined) = join(importer, spec.trim_end_matches('/')) else {
        // It leaves the scan root: no scanned file.
        return false;
    };
    let named = module_stem(&joined);
    let stem = module_stem(file);
    stem == named || stem.strip_suffix("/index") == Some(named)
}

/// `spec` resolved against `importer`'s directory, relative to the root;
/// `None` when it climbs above the root.
fn join(importer: &str, spec: &str) -> Option<String> {
    let mut parts = importer.split('/').collect::<Vec<_>>();
    parts.pop();
    for part in spec.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

/// Whether files `a` and `b` can import one another: the same linker, or
/// either one unlinked (never ruled out).
fn same_language(a: &str, b: &str) -> bool {
    match (Linker::of(a), Linker::of(b)) {
        (Linker::Unsupported, _) | (_, Linker::Unsupported) => true,
        (a, b) => a == b,
    }
}

#[cfg(test)]
mod tests {
    use super::{join, may_name, same_language};

    #[test]
    fn a_relative_specifier_names_only_the_file_it_spells() {
        assert_eq!(join("src/a.ts", "../b").as_deref(), Some("b"));
        assert_eq!(join("src/a.ts", "../../b"), None);
        assert!(may_name("src/a.ts", "./util.js", "src/util.ts"));
        assert!(may_name("src/a.ts", "./util", "src/util/index.ts"));
        assert!(!may_name("src/a.ts", "./generated", "src/util.ts"));
        assert!(!may_name("tests/a.ts", "../../x.js", "src/x.ts"));
        // A bare or non-JS specifier may resolve through configuration.
        assert!(may_name("src/a.ts", "@/util", "src/util.ts"));
        assert!(may_name("a.py", ".util", "util.py"));
        assert!(!same_language("big.rs", "util.ts"));
        assert!(same_language("a.mjs", "b.ts"));
        assert!(same_language("Makefile", "b.ts"));
    }
}

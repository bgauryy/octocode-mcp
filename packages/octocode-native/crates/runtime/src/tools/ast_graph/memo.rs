//! The linked graph of one scan, kept for the pages that follow it. A
//! result or diagnostic page re-asks the same graph; rebuilding it (scan,
//! parse, link) is the whole cost of a call. An entry is reused only while
//! every scanned file and the directories holding them are unchanged.
use super::types::BuiltGraph;
use octocode_io::memo::{Memo, MemoLimits};
use std::collections::BTreeSet;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::Arc;

/// Graphs kept at once: a walk pages one graph; a second covers an
/// interleaved query. Graph elements (nodes and file edges) kept across
/// entries equal the edge cap, so a graph that reaches the cap is kept
/// alone; the newest is kept whatever its weight.
const LIMITS: MemoLimits = MemoLimits {
    max_entries: 2,
    max_weight: super::graph::MAX_GRAPH_EDGES as usize,
    keep_newest: true,
};

/// The graph's size in elements, the unit of [`LIMITS`]' weight.
fn weight(graph: &BuiltGraph) -> usize {
    graph.nodes.len() + graph.edge_count as usize
}

/// Built graphs by key, each with the stamp of what it scanned.
type GraphMemo = Memo<String, BuiltGraph, u64>;

#[cfg(not(test))]
static MEMO: GraphMemo = Memo::new(LIMITS);

/// Runs `f` on the process memo. Unit tests run in parallel threads, so each
/// test thread keeps its own memo and no test evicts another's graph.
fn with_memo<T>(f: impl FnOnce(&GraphMemo) -> T) -> T {
    #[cfg(not(test))]
    {
        f(&MEMO)
    }
    #[cfg(test)]
    {
        thread_local! {
            static MEMO: GraphMemo = const { Memo::new(LIMITS) };
        }
        MEMO.with(f)
    }
}

/// The graph built for `key` when nothing it scanned changed since.
pub(super) fn get(key: &str) -> Option<Arc<BuiltGraph>> {
    let hit = with_memo(|memo| memo.get(key))?;
    (file_stamp(&hit.value)? == hit.meta).then_some(hit.value)
}

pub(super) fn put(key: String, graph: Arc<BuiltGraph>) {
    let Some(stamp) = file_stamp(&graph) else {
        return;
    };
    let weight = weight(&graph);
    with_memo(|memo| memo.insert_full(key, graph, stamp, weight, None, std::time::Instant::now()));
}

/// Name, size and modification time of every entry of each directory
/// that holds a scanned file (and of the root's ancestors inside its
/// repository): this covers the
/// scanned files, files added or removed beside them, and the manifests,
/// tsconfig and ignore files linking reads.
fn file_stamp(graph: &BuiltGraph) -> Option<u64> {
    let mut dirs = BTreeSet::from([graph.root.clone()]);
    let files = graph.nodes.keys().map(String::as_str).chain(
        graph
            .diagnostics
            .iter()
            .filter(|d| d.code == "scan-skip")
            .map(|d| d.file.as_str()),
    );
    for file in files {
        let mut rest = file;
        while let Some((dir, _)) = rest.rsplit_once('/') {
            if !dirs.insert(graph.root.join(dir)) {
                break;
            }
            rest = dir;
        }
    }
    // Outer manifests and ignore files are read up to the repository root.
    if let Some(repository) = graph.root.ancestors().find(|dir| dir.join(".git").exists()) {
        dirs.extend(
            graph
                .root
                .ancestors()
                .skip(1)
                .take_while(|dir| dir.starts_with(repository))
                .map(Path::to_path_buf),
        );
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for dir in dirs {
        dir.hash(&mut hasher);
        let entries = std::fs::read_dir(&dir).ok()?;
        let mut stats = entries
            .collect::<Result<Vec<_>, _>>()
            .ok()?
            .into_iter()
            // Git's own bookkeeping changes on every git command.
            .filter(|entry| entry.file_name() != ".git")
            .map(|entry| {
                let meta = entry.metadata().ok()?;
                Some((entry.file_name(), crate::tools::source::cache_stamp(&meta)?))
            })
            .collect::<Option<Vec<_>>>()?;
        stats.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, stamp) in stats {
            name.hash(&mut hasher);
            stamp.size.hash(&mut hasher);
            stamp.modified_ns.hash(&mut hasher);
            stamp.changed_ns.hash(&mut hasher);
            stamp.inode.hash(&mut hasher);
        }
    }
    Some(hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_size_restored_mtime_invalidates_graph() {
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("a.js");
        std::fs::write(&file, "import './b.js';\n").expect("source");
        let graph = BuiltGraph {
            root: root.path().to_path_buf(),
            ..BuiltGraph::default()
        };
        put("restored-mtime".into(), Arc::new(graph));
        assert!(get("restored-mtime").is_some());
        let old_time = std::fs::metadata(&file)
            .expect("metadata")
            .modified()
            .expect("mtime");
        std::fs::write(&file, "import './c.js';\n").expect("same-size edit");
        std::fs::File::open(&file)
            .expect("file")
            .set_times(std::fs::FileTimes::new().set_modified(old_time))
            .expect("restore mtime");
        assert!(get("restored-mtime").is_none());
    }

    /// Graphs are kept while their elements fit one budget: a graph near the
    /// edge cap is kept alone, two ordinary ones side by side.
    #[test]
    fn a_heavy_graph_evicts_the_others_and_light_ones_pair() {
        let root = tempfile::tempdir().expect("root");
        let graph = |edges: u32| {
            Arc::new(BuiltGraph {
                root: root.path().to_path_buf(),
                edge_count: edges,
                ..BuiltGraph::default()
            })
        };
        let heavy = u32::try_from(LIMITS.max_weight * 3 / 4).expect("fits");
        put("light".into(), graph(10));
        put("heavy".into(), graph(heavy));
        assert!(get("light").is_some() && get("heavy").is_some());
        put("heavy-2".into(), graph(heavy));
        assert!(get("heavy").is_none(), "two heavy graphs never coexist");
        assert!(get("light").is_none(), "only the two newest are kept");
        assert!(
            get("heavy-2").is_some(),
            "the newest is kept whatever its weight"
        );
        put("light-2".into(), graph(10));
        assert!(get("heavy-2").is_some() && get("light-2").is_some());
    }
}

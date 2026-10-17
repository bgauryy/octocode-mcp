//! The linked graph of one scan, kept for the pages that follow it. A
//! result or diagnostic page re-asks the same graph; rebuilding it (scan,
//! parse, link) is the whole cost of a call. An entry is reused only while
//! discovery finds the same candidates, and every scanned file and the
//! directories holding them are unchanged.
//!
//! When the runtime supplies a persistent cache directory a built graph is kept on
//! disk too, with the same stamp: a one-shot CLI call paging a topology
//! answer reads the graph its first page built instead of scanning again,
//! while nothing it scanned changed.
use super::types::BuiltGraph;
use octocode_io::memo::{Memo, MemoLimits};
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

/// Candidate identity and scan bounds from the graph scanner's own walk.
/// Directory stamps alone miss a first source file added deep inside an
/// existing subtree that held no scanned files.
pub(super) fn discovery_key(walk: &octocode_engine::types::FileSystemQueryResult) -> String {
    let files = walk
        .entries
        .iter()
        .map(|entry| &entry.relative_path)
        .collect::<Vec<_>>();
    crate::digest::json_sha256(&serde_json::json!([
        files,
        walk.was_capped,
        walk.pruned_dirs,
    ]))
}

/// Built graphs by key, each with the stamp of what it scanned.
type GraphMemo = Memo<(String, Option<std::path::PathBuf>), BuiltGraph, u64>;

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

/// The graph built for `key` while its inputs are unchanged, from this
/// process or this runtime's optional disk cache.
pub(super) fn get(key: &str, disk: Option<&Path>) -> Option<Arc<BuiltGraph>> {
    let cache_key = (key.to_owned(), disk.map(Path::to_owned));
    if let Some(hit) = with_memo(|memo| memo.get(&cache_key)) {
        return (file_stamp(&hit.value)? == hit.meta).then_some(hit.value);
    }
    let (graph, stamp) = disk::read(disk?, key)?;
    let graph = Arc::new(graph);
    // Served only while what it scanned is as it was when it was stored.
    (file_stamp(&graph)? == stamp).then_some(())?;
    let weight = weight(&graph);
    Some(with_memo(|memo| {
        memo.insert_full(
            cache_key,
            graph,
            stamp,
            weight,
            None,
            std::time::Instant::now(),
        )
    }))
}

/// The JSON text of a stored graph file (tests).
#[cfg(test)]
pub(super) fn stored_text(path: &Path) -> String {
    use std::io::Read;
    let packed = std::fs::read(path).expect("stored graph");
    let mut text = String::new();
    flate2::read::DeflateDecoder::new(packed.as_slice())
        .read_to_string(&mut text)
        .expect("deflated JSON");
    text
}

pub(super) fn put(key: String, graph: Arc<BuiltGraph>, disk: Option<&Path>) {
    let Some(stamp) = file_stamp(&graph) else {
        return;
    };
    if let Some(dir) = disk {
        disk::write(dir, &key, &graph, stamp);
    }
    let weight = weight(&graph);
    let cache_key = (key, disk.map(Path::to_owned));
    with_memo(|memo| {
        memo.insert_full(
            cache_key,
            graph,
            stamp,
            weight,
            None,
            std::time::Instant::now(),
        )
    });
}

/// The disk tier: one deflated JSON file per graph key, the newest few
/// kept. Graph JSON repeats paths and names on every fact, so it deflates
/// about tenfold.
mod disk {
    use super::BuiltGraph;
    use std::path::{Path, PathBuf};

    /// Graphs kept on disk; the oldest go first.
    const KEPT: usize = 4;
    /// Largest stored graph read back, inflated (a graph near the edge cap).
    const MAX_BYTES: usize = 256 << 20;

    /// One stored graph. The build names the shape it was written with, so
    /// another release reads none of it.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Stored<G> {
        build: String,
        key: String,
        stamp: u64,
        graph: G,
    }

    fn build() -> String {
        format!(
            "{}/{}",
            env!("CARGO_PKG_VERSION"),
            super::super::GRAPH_SHAPE
        )
    }

    fn file(dir: &Path, key: &str) -> PathBuf {
        dir.join(format!("{}.json.z", crate::digest::sha256(key.as_bytes())))
    }

    pub(super) fn read(dir: &Path, key: &str) -> Option<(BuiltGraph, u64)> {
        use std::io::Read;
        let packed = crate::tools::source::read_bounded(&file(dir, key), MAX_BYTES).ok()?;
        let mut bytes = Vec::new();
        flate2::read::DeflateDecoder::new(packed.as_slice())
            .take(MAX_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .ok()?;
        if bytes.len() > MAX_BYTES {
            return None;
        }
        let stored = serde_json::from_slice::<Stored<BuiltGraph>>(&bytes).ok()?;
        (stored.build == build() && stored.key == key).then_some((stored.graph, stored.stamp))
    }

    /// Store `graph` and keep the newest [`KEPT`] files. A failed write
    /// only costs the next process a scan.
    pub(super) fn write(dir: &Path, key: &str, graph: &BuiltGraph, stamp: u64) {
        let stored = Stored {
            build: build(),
            key: key.to_owned(),
            stamp,
            graph,
        };
        let Ok(bytes) = serde_json::to_vec(&stored) else {
            return;
        };
        // Graph facts are names, paths and line numbers, but they derive
        // from unredacted source: a graph whose text holds anything the
        // secret scanner flags stays in memory only (and an older file of
        // its key goes), so no secret of the source reaches the disk.
        if bytes.len() > MAX_BYTES || holds_secret(&bytes) {
            let _ = std::fs::remove_file(file(dir, key));
            return;
        }
        let packed = {
            use std::io::Write;
            let mut encoder =
                flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
            match encoder.write_all(&bytes).and_then(|()| encoder.finish()) {
                Ok(packed) => packed,
                Err(_) => return,
            }
        };
        if std::fs::create_dir_all(dir).is_err() {
            return;
        }
        if octocode_io::atomic::write_atomic(&file(dir, key), &packed, false).is_err() {
            return;
        }
        prune(dir);
    }

    /// The distinct string values of serialized JSON `bytes`, still
    /// escaped, one per line. Every graph fact is a string (a name, path,
    /// specifier or call label), so whatever a source held sits inside one
    /// of them, and a path repeated across thousands of facts is kept once.
    fn distinct_strings(bytes: &[u8]) -> String {
        let mut seen = std::collections::HashSet::new();
        let mut text = String::new();
        let mut at = 0;
        while let Some(open) = bytes[at..].iter().position(|byte| *byte == b'"') {
            let start = at + open + 1;
            let mut end = start;
            while end < bytes.len() && bytes[end] != b'"' {
                end += if bytes[end] == b'\\' { 2 } else { 1 };
            }
            let end = end.min(bytes.len());
            if let Ok(value) = std::str::from_utf8(&bytes[start..end])
                && seen.insert(value)
            {
                text.push_str(value);
                text.push('\n');
            }
            at = (end + 1).min(bytes.len());
        }
        text
    }

    /// Whether the secret scanner flags any distinct string of `bytes`, or
    /// one holds a private-key marker (a block whose newlines JSON escaped).
    /// The scanner takes bounded text, so the strings are scanned in windows
    /// that overlap by more than any secret it matches spans.
    pub(super) fn holds_secret(bytes: &[u8]) -> bool {
        const WINDOW: usize = 1 << 20;
        const OVERLAP: usize = 8 << 10;
        let text = distinct_strings(bytes);
        if text.contains("PRIVATE KEY") {
            return true;
        }
        let security = crate::security::ContentSecurity::new();
        let mut start = 0;
        loop {
            let mut end = (start + WINDOW).min(text.len());
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            if security.sanitize_text(&text[start..end], None).has_secrets {
                return true;
            }
            if end == text.len() {
                return false;
            }
            start = end - OVERLAP;
            while !text.is_char_boundary(start) {
                start -= 1;
            }
        }
    }

    fn prune(dir: &Path) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut files = entries
            .filter_map(Result::ok)
            // Every visible regular file here is a stored graph (an older
            // release's `.json` too); hidden ones are in-flight atomic writes.
            .filter(|entry| {
                entry.file_type().is_ok_and(|kind| kind.is_file())
                    && !entry.file_name().to_string_lossy().starts_with('.')
            })
            .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
            .collect::<Vec<_>>();
        files.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
        for (_, path) in files.into_iter().skip(KEPT) {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// The stamp of every directory the graph's build read (see
/// [`super::freshness::scope_dirs`]): the scanned files, files added or
/// removed beside them, and the manifests, tsconfig and ignore files linking
/// reads.
fn file_stamp(graph: &BuiltGraph) -> Option<u64> {
    let files = graph.nodes.keys().map(String::as_str).chain(
        graph
            .diagnostics
            .iter()
            .filter(|d| d.code == "scan-skip")
            .map(|d| d.file.as_str()),
    );
    super::freshness::dir_stamp(
        &graph.root,
        &super::freshness::scope_dirs(&graph.root, files),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn discovery_fixture() -> tempfile::TempDir {
        let root = tempfile::tempdir().expect("root");
        for dir in ["empty/deep", "excluded/deep"] {
            std::fs::create_dir_all(root.path().join(dir)).expect("existing subtree");
        }
        std::fs::write(root.path().join("a.ts"), "export const a = 1;\n").expect("source");
        root
    }

    fn discovered_graph(
        root: &Path,
        disk: Option<&Path>,
        max_files: Option<u32>,
    ) -> Arc<BuiltGraph> {
        let (paths, security) = crate::tools::test_support::simple_policy(root);
        let mut value = serde_json::json!({
            "operation": "reachability", "path": root, "entrypoints": ["a.ts"],
            "exclude": ["excluded/**"]
        });
        if let Some(max_files) = max_files {
            value["maxFiles"] = serde_json::json!(max_files);
        }
        let query = serde_json::from_value(value).expect("query");
        super::super::graph::build_graph_shared_with(
            &query,
            &paths,
            &security,
            &crate::tools::cancel::NeverCancel,
            &super::super::graph::BuildExtras {
                cache_dir: disk.map(Path::to_owned),
                ..Default::default()
            },
        )
        .expect("graph")
        .0
    }

    #[test]
    fn nested_first_source_invalidates_memory_without_admitting_excluded_files() {
        for max_files in [None, Some(10)] {
            let root = discovery_fixture();
            let first = discovered_graph(root.path(), None, max_files);
            assert_eq!(first.nodes.len(), 1);
            let same = discovered_graph(root.path(), None, max_files);
            assert!(Arc::ptr_eq(&first, &same), "unchanged graph stays cached");
            std::fs::write(
                root.path().join("excluded/deep/hidden.ts"),
                "export const x = 1;\n",
            )
            .expect("excluded source");
            let excluded = discovered_graph(root.path(), None, max_files);
            assert!(
                Arc::ptr_eq(&first, &excluded),
                "excluded subtree stays outside discovery"
            );
            let added = root.path().join("empty/deep/new.ts");
            std::fs::write(&added, "export const added = 2;\n").expect("nested source");
            let changed = discovered_graph(root.path(), None, max_files);
            assert_eq!(changed.nodes.len(), 2);
            assert!(changed.nodes.contains_key("empty/deep/new.ts"));
            std::fs::remove_file(added).expect("remove nested source");
            assert_eq!(
                discovered_graph(root.path(), None, max_files).nodes.len(),
                1
            );
        }
    }

    #[test]
    fn nested_first_source_invalidates_a_disk_graph_in_another_process() {
        let root = discovery_fixture();
        let disk = tempfile::tempdir().expect("cache");
        assert_eq!(
            discovered_graph(root.path(), Some(disk.path()), Some(10))
                .nodes
                .len(),
            1
        );
        let another_process = || {
            std::thread::scope(|scope| {
                scope
                    .spawn(|| {
                        let graph = discovered_graph(root.path(), Some(disk.path()), Some(10));
                        (graph, super::super::graph::fresh_builds())
                    })
                    .join()
                    .expect("thread")
            })
        };
        let (unchanged, builds) = another_process();
        assert_eq!(unchanged.nodes.len(), 1);
        assert_eq!(builds, 0, "unchanged discovery reuses the disk graph");
        std::fs::write(
            root.path().join("empty/deep/new.ts"),
            "export const added = 2;\n",
        )
        .expect("nested source");
        let (changed, builds) = another_process();
        assert_eq!(changed.nodes.len(), 2);
        assert!(changed.nodes.contains_key("empty/deep/new.ts"));
        assert_eq!(builds, 1, "changed discovery rebuilds the graph");
    }

    #[cfg(unix)]
    #[test]
    fn discovery_freshness_does_not_follow_an_outside_symlink() {
        let root = discovery_fixture();
        let outside = tempfile::tempdir().expect("outside policy");
        std::os::unix::fs::symlink(outside.path(), root.path().join("linked"))
            .expect("outside symlink");
        let first = discovered_graph(root.path(), None, None);
        std::fs::write(outside.path().join("new.ts"), "export const outside = 1;\n")
            .expect("outside source");
        let same = discovered_graph(root.path(), None, None);
        assert_eq!(same.nodes.len(), 1);
        assert!(Arc::ptr_eq(&first, &same));
    }

    #[test]
    fn same_size_restored_mtime_invalidates_graph() {
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("a.js");
        std::fs::write(&file, "import './b.js';\n").expect("source");
        let graph = BuiltGraph {
            root: root.path().to_path_buf(),
            ..BuiltGraph::default()
        };
        put("restored-mtime".into(), Arc::new(graph), None);
        assert!(get("restored-mtime", None).is_some());
        let old_time = std::fs::metadata(&file)
            .expect("metadata")
            .modified()
            .expect("mtime");
        std::fs::write(&file, "import './c.js';\n").expect("same-size edit");
        std::fs::File::open(&file)
            .expect("file")
            .set_times(std::fs::FileTimes::new().set_modified(old_time))
            .expect("restore mtime");
        assert!(get("restored-mtime", None).is_none());
    }

    /// A graph stored on disk serves another process (a thread with an
    /// empty memo) while what it scanned is unchanged; an edit beside a
    /// scanned file makes it unservable.
    #[test]
    fn a_disk_graph_serves_another_process_until_its_scan_changes() {
        let root = tempfile::tempdir().expect("root");
        let disk = tempfile::tempdir().expect("disk");
        std::fs::write(root.path().join("a.ts"), "export const a = 1;\n").expect("source");
        let mut graph = BuiltGraph {
            root: root.path().to_path_buf(),
            ..BuiltGraph::default()
        };
        graph.nodes.insert("a.ts".into(), Default::default());
        put("k".into(), Arc::new(graph), Some(disk.path()));
        let other_process = |disk: std::path::PathBuf| {
            std::thread::spawn(move || get("k", Some(&disk)).map(|g| g.nodes.len()))
                .join()
                .expect("thread")
        };
        assert_eq!(other_process(disk.path().to_path_buf()), Some(1));
        std::fs::write(root.path().join("b.ts"), "export const b = 1;\n").expect("sibling");
        assert_eq!(other_process(disk.path().to_path_buf()), None);
    }

    /// The secret check reads each distinct string once, escaped as stored:
    /// a token anywhere, even in a repeated or escaped value, keeps the
    /// graph off the disk; ordinary facts pass.
    #[test]
    fn the_stored_secret_check_reads_every_distinct_string() {
        const TOKEN: &str = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
        let clean = serde_json::to_vec(&serde_json::json!({
            "facts": [{"file": "src/a.ts", "name": "save"}, {"file": "src/a.ts", "name": "load"}],
        }))
        .expect("json");
        assert!(!disk::holds_secret(&clean));
        let token = serde_json::to_vec(&serde_json::json!({
            "facts": [{"specifier": format!("x\"{TOKEN}")}, {"specifier": format!("x\"{TOKEN}")}],
        }))
        .expect("json");
        assert!(disk::holds_secret(&token));
        let key = serde_json::to_vec(&serde_json::json!({
            "text": "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"
        }))
        .expect("json");
        assert!(disk::holds_secret(&key));
    }

    /// A stored graph is deflated JSON that reads back whole.
    #[test]
    fn a_stored_graph_is_deflated_and_reads_back() {
        let root = tempfile::tempdir().expect("root");
        let disk = tempfile::tempdir().expect("disk");
        std::fs::write(root.path().join("a.ts"), "export const a = 1;\n").expect("source");
        let mut graph = BuiltGraph {
            root: root.path().to_path_buf(),
            ..BuiltGraph::default()
        };
        for index in 0..200 {
            graph.nodes.insert(
                format!("a_module_with_a_long_name_{index}.ts"),
                Default::default(),
            );
        }
        put("deflated".into(), Arc::new(graph), Some(disk.path()));
        let files = std::fs::read_dir(disk.path())
            .expect("disk")
            .map(|entry| entry.expect("entry").path())
            .collect::<Vec<_>>();
        assert_eq!(files.len(), 1);
        let text = stored_text(&files[0]);
        let packed = std::fs::metadata(&files[0]).expect("meta").len() as usize;
        assert!(packed * 4 < text.len(), "{packed} vs {}", text.len());
        let (read, _) = disk::read(disk.path(), "deflated").expect("reads back");
        assert_eq!(read.nodes.len(), 200);
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
        put("light".into(), graph(10), None);
        put("heavy".into(), graph(heavy), None);
        assert!(get("light", None).is_some() && get("heavy", None).is_some());
        put("heavy-2".into(), graph(heavy), None);
        assert!(
            get("heavy", None).is_none(),
            "two heavy graphs never coexist"
        );
        assert!(get("light", None).is_none(), "only the two newest are kept");
        assert!(
            get("heavy-2", None).is_some(),
            "the newest is kept whatever its weight"
        );
        put("light-2".into(), graph(10), None);
        assert!(get("heavy-2", None).is_some() && get("light-2", None).is_some());
    }
}

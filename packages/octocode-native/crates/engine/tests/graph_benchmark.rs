#![allow(clippy::expect_used)]

use octocode_engine::graph::{CodeGraphBuilder, reachable, scc, shortest_path};

#[path = "../benches/support/frozen_graph.rs"]
mod frozen;
use frozen::frozen_graph;

#[test]
fn frozen_graph_correctness_receipt_is_stable() {
    let graph = frozen_graph(500, 3);
    assert_eq!(
        reachable(&graph, &["src/file-00000.rs".to_owned()], false).len(),
        500
    );
    assert_eq!(scc(&graph, false).len(), 500);
    let path = shortest_path(&graph, "src/file-00000.rs", "src/file-00499.rs");
    assert!(path.is_some());

    let mut builder = CodeGraphBuilder::new("/fixture", 1);
    for index in (0..500).rev() {
        builder
            .add_file(format!("src/file-{index:05}.rs"), format!("digest-{index}"))
            .expect("file");
    }
    for (source, node) in &graph {
        for target in node.edges.keys() {
            builder
                .add_file_relation(source, target, "rust-use", 1)
                .expect("relation");
        }
    }
    let snapshot = builder.finish();
    assert_eq!(snapshot.snapshot.files.len(), 500);
    assert_eq!(snapshot.edges.len(), 1_494);
    assert_eq!(snapshot.evidence.len(), 1_494);
}

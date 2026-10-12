//! astSearch pages by bytes: with no count asked, a page fills the response
//! window (never past it, so the response layer never splits it), a walk
//! reaches every item exactly once, and totals agree on every page. An
//! explicit count is honored exactly.
use super::{AstSearchQuery, execute_ast};
use crate::tools::cancel::NeverCancel;
use crate::tools::stream_page::json_chars;
use crate::tools::test_support::{Fixture, simple_policy};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const WINDOW: usize = 16_384;

/// Runs `row` with a response window, then follows `next.nextPage` and
/// `next.nextMatchPage` until neither is offered. Every distinct call runs
/// once; returns the outputs in the order reached.
fn walk(root: &std::path::Path, row: Value) -> Vec<Value> {
    let (paths, security) = simple_policy(root);
    let mut pending = vec![row];
    let mut seen = BTreeSet::new();
    let mut outputs = Vec::new();
    while let Some(row) = pending.pop() {
        assert!(seen.insert(row.to_string()), "a lead ran twice: {row}");
        assert!(outputs.len() < 400, "a walk of {} calls", outputs.len());
        crate::contracts::validate("astSearch", json!({"queries": [row.clone()]}))
            .unwrap_or_else(|error| panic!("lead invalid {row}: {:?}", error.issues));
        let query: AstSearchQuery = serde_json::from_value(row.clone()).expect("typed row");
        let out = execute_ast(&query, &paths, &security, &NeverCancel, Some(WINDOW))
            .unwrap_or_else(|error| panic!("{row} failed: {error:?}"));
        assert_valid_output(&out);
        for name in ["nextPage", "nextMatchPage"] {
            if let Some(next) = out["next"].get(name) {
                pending.push(next["query"]["queries"][0].clone());
            }
        }
        outputs.push(out);
    }
    outputs
}

/// Every page states `pagination.hasMore`: the response layer and clasify
/// read the raw page before any shaping.
fn assert_valid_output(out: &Value) {
    if let Some(pagination) = out.get("pagination") {
        assert!(pagination["hasMore"].is_boolean(), "{out}");
    }
}

/// A single complete page carries a valid `pagination`.
#[test]
fn a_single_symbols_page_states_its_pagination() {
    let root = Fixture::new();
    std::fs::write(root.0.join("a.ts"), numbered_functions(3)).expect("source");
    let outputs = walk(
        &root.0,
        json!({"operation":"symbols","path":root.0.to_string_lossy()}),
    );
    assert_eq!(outputs.len(), 1);
    assert_eq!(outputs[0]["pagination"]["hasMore"], false, "{}", outputs[0]);
}

fn numbered_functions(count: usize) -> String {
    (0..count)
        .map(|index| format!("export function declaredName{index}(value: number): number {{ return value + {index}; }}\n"))
        .collect()
}

/// Every symbol row of a symbols page, in the shape the page carries them.
fn symbol_rows(out: &Value) -> Vec<String> {
    let rows = |symbols: &Value| {
        symbols
            .as_array()
            .into_iter()
            .flatten()
            .map(|row| row.to_string())
            .collect::<Vec<_>>()
    };
    match out.get("files").and_then(Value::as_array) {
        Some(files) => files
            .iter()
            .flat_map(|file| {
                let path = file["path"].to_string();
                rows(&file["symbols"])
                    .into_iter()
                    .map(move |row| format!("{path} {row}"))
            })
            .collect(),
        None => rows(&out["symbols"]),
    }
}

#[test]
fn symbol_pages_fill_the_window_and_walk_every_symbol_once() {
    let root = Fixture::new();
    std::fs::write(root.0.join("big.ts"), numbered_functions(1_500)).expect("source");
    let outputs = walk(
        &root.0,
        json!({"operation":"symbols","path":root.0.join("big.ts")}),
    );
    let mut all = Vec::new();
    for (index, out) in outputs.iter().enumerate() {
        let chars = json_chars(out);
        assert!(chars <= WINDOW, "page {index} is {chars} chars");
        // Every page but the last is filled: a count cut leaves most of it empty.
        if out["pagination"]["hasMore"] == true {
            assert!(
                chars * 10 >= WINDOW * 6,
                "page {index} holds only {chars} chars"
            );
        }
        all.extend(symbol_rows(out));
    }
    let unique = all.iter().collect::<BTreeSet<_>>();
    assert_eq!(all.len(), 1_500, "{} rows", all.len());
    assert_eq!(unique.len(), 1_500, "a symbol was repeated");
    let totals = outputs
        .iter()
        .map(|out| out["pagination"]["totalItems"].as_u64())
        .collect::<BTreeSet<_>>()
        .len();
    assert_eq!(totals, 1, "totals differ across pages");
    assert!(outputs.len() <= 12, "{} calls", outputs.len());
}

#[test]
fn an_explicit_symbol_page_size_is_exact() {
    let root = Fixture::new();
    std::fs::write(root.0.join("big.ts"), numbered_functions(25)).expect("source");
    let outputs = walk(
        &root.0,
        json!({"operation":"symbols","path":root.0.join("big.ts"),"pageSize":10}),
    );
    let sizes = outputs
        .iter()
        .map(|out| symbol_rows(out).len())
        .collect::<Vec<_>>();
    assert_eq!(sizes, [10, 10, 5]);
}

/// Match rows of one page: `(path, line, column)` of each.
fn match_cells(out: &Value) -> Vec<(String, u64, u64)> {
    out["files"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|file| {
            let path = file["path"].as_str().unwrap_or_default().to_owned();
            file["matches"]
                .as_array()
                .into_iter()
                .flatten()
                .map(move |hit| {
                    (
                        path.clone(),
                        hit["line"].as_u64().unwrap_or(0),
                        hit["column"].as_u64().unwrap_or(0),
                    )
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

#[test]
fn a_file_of_three_thousand_matches_pages_by_bytes_and_reaches_each_once() {
    let root = Fixture::new();
    let source = (0..3_000)
        .map(|index| format!("hit({index});\n"))
        .collect::<String>();
    std::fs::write(root.0.join("many.ts"), source).expect("source");
    let outputs = walk(
        &root.0,
        json!({"operation":"match","pattern":"hit($A)","path":root.0.join("many.ts"),"language":"typescript"}),
    );
    let mut cells = Vec::new();
    for (index, out) in outputs.iter().enumerate() {
        let chars = json_chars(out);
        assert!(chars <= WINDOW, "page {index} is {chars} chars");
        cells.extend(match_cells(out));
    }
    assert_eq!(cells.len(), 3_000, "{} matches", cells.len());
    assert_eq!(
        cells.iter().collect::<BTreeSet<_>>().len(),
        3_000,
        "a match was repeated"
    );
    // 100 rows a page was 30 calls; a filled window is about a dozen.
    assert!(outputs.len() <= 14, "{} calls", outputs.len());
    for out in &outputs[..outputs.len() - 1] {
        let chars = json_chars(out);
        assert!(
            chars * 10 >= WINDOW * 5,
            "a page of {chars} chars left the window half empty"
        );
    }
}

#[test]
fn many_files_page_by_bytes_with_one_total() {
    let root = Fixture::new();
    for index in 0..300 {
        std::fs::write(
            root.0.join(format!("file{index:03}.ts")),
            format!("export const value{index} = hit({index});\n"),
        )
        .expect("source");
    }
    let outputs = walk(
        &root.0,
        json!({"operation":"match","pattern":"hit($A)","path":root.0,"language":"typescript"}),
    );
    let mut cells = Vec::new();
    for (index, out) in outputs.iter().enumerate() {
        let chars = json_chars(out);
        assert!(chars <= WINDOW, "page {index} is {chars} chars");
        cells.extend(match_cells(out));
    }
    assert_eq!(cells.iter().collect::<BTreeSet<_>>().len(), 300);
    assert_eq!(cells.len(), 300);
    let totals = outputs
        .iter()
        .filter_map(|out| out["pagination"]["totalItems"].as_u64())
        .collect::<BTreeSet<_>>();
    assert_eq!(totals.len(), 1, "{totals:?}");
    assert!(outputs.len() <= 8, "{} calls", outputs.len());
}

#[test]
fn an_explicit_file_page_size_is_exact() {
    let root = Fixture::new();
    for index in 0..7 {
        std::fs::write(
            root.0.join(format!("f{index}.ts")),
            format!("hit({index});\n"),
        )
        .expect("source");
    }
    let outputs = walk(
        &root.0,
        json!({"operation":"match","pattern":"hit($A)","path":root.0,"language":"typescript","pageSize":3}),
    );
    let sizes = outputs
        .iter()
        .map(|out| out["files"].as_array().map_or(0, Vec::len))
        .collect::<Vec<_>>();
    assert_eq!(sizes, [3, 3, 1]);
}

#[test]
fn a_syntax_tree_pages_by_bytes_and_reaches_every_node_once() {
    let root = Fixture::new();
    std::fs::write(root.0.join("tree.ts"), numbered_functions(300)).expect("source");
    let outputs = walk(
        &root.0,
        json!({"operation":"syntaxTree","path":root.0.join("tree.ts")}),
    );
    let mut ids = Vec::new();
    for (index, out) in outputs.iter().enumerate() {
        let chars = json_chars(out);
        assert!(chars <= WINDOW, "page {index} is {chars} chars");
        ids.extend(
            out["nodes"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|node| node.to_string()),
        );
    }
    let total = outputs[0]["pagination"]["totalItems"]
        .as_u64()
        .expect("total") as usize;
    assert_eq!(ids.len(), total);
    assert_eq!(ids.iter().collect::<BTreeSet<_>>().len(), total);
    assert!(
        outputs.len() < total / 100 + 2,
        "{} calls for {total} nodes",
        outputs.len()
    );
}

//! A listing walk is bounded by time: a walk out of budget returns what it
//! scanned, names where it stopped, and leads to narrower scopes, never an
//! empty or whole-looking page.
use super::super::{StructureSearchQuery, execute_structure_within};
use super::run;
use crate::tools::cancel::NeverCancel;
use crate::tools::id::ToolId;
use crate::tools::test_support::{Fixture, assert_row_contract, simple_policy};
use serde_json::{Value, json};
use std::time::Duration;

fn tree() -> Fixture {
    let root = Fixture::new();
    for path in ["a/one.rs", "b/two.rs", "b/deep/three.rs", "top.rs"] {
        root.write(path, "fn f() {}\n");
    }
    root
}

fn within(root: &std::path::Path, query: Value, budget: Duration) -> Value {
    let (paths, security) = simple_policy(root);
    let query: StructureSearchQuery = serde_json::from_value(query).expect("typed row");
    execute_structure_within(&query, &paths, &security, &NeverCancel, None, budget)
        .expect("listing")
}

fn rows(operation: &str, root: &std::path::Path) -> Value {
    json!({"operation": operation, "path": root, "include": ["*.rs"]})
}

#[test]
fn a_listing_out_of_time_is_partial_names_where_it_stopped_and_leads_narrower() {
    for operation in ["files", "tree"] {
        let root = tree();
        let query = rows(operation, &root.0);
        let out = within(&root.0, query.clone(), Duration::ZERO);
        assert_row_contract(ToolId::StructureSearch, &query, &out);
        assert_eq!(out["isPartial"], true, "{operation}: {out}");
        assert_eq!(out["partialReasons"], json!(["walkDeadline"]), "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        // Nothing was scanned: absence is unproven, so never `empty`.
        assert!(out.get("status").is_none(), "{operation}: {out}");
        let warning = out["warnings"]
            .as_array()
            .and_then(|w| {
                w.iter()
                    .filter_map(Value::as_str)
                    .find(|w| w.contains("time budget"))
            })
            .unwrap_or_else(|| panic!("{operation} warns of the time budget: {out}"));
        assert!(warning.starts_with("terminalLimit:"), "{warning}");
        assert!(
            warning.contains("before `a`"),
            "names the first unscanned entry: {warning}"
        );
        let narrow = &out["next"]["narrowScope"]["query"]["queries"][0];
        assert_eq!(narrow["operation"], "tree", "{out}");
        assert_eq!(narrow["maxDepth"], 1, "{out}");
        assert!(out["next"].get("expandScan").is_none(), "{out}");
    }
}

#[test]
fn a_listing_within_its_time_is_whole() {
    for operation in ["files", "tree"] {
        let root = tree();
        let out = within(&root.0, rows(operation, &root.0), Duration::from_secs(3600));
        assert!(out.get("isPartial").is_none(), "{operation}: {out}");
        assert!(out.get("terminalLimit").is_none(), "{out}");
        assert!(out.get("status").is_none(), "{out}");
        assert!(
            !out["files"].as_array().is_some_and(Vec::is_empty),
            "{operation}: {out}"
        );
    }
}

/// The production entry runs under a real budget, far above a fixture walk.
#[test]
fn the_default_entry_is_not_cut_on_a_small_tree() {
    let root = tree();
    let out = run(&root.0, rows("files", &root.0)).expect("listing");
    assert!(out.get("isPartial").is_none(), "{out}");
}

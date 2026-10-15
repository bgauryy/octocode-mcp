//! astTopology drift: the diff of two roots, its pages, cuts and
//! continuations; and Rust dead-code crediting.
use super::test_support::*;
use super::*;
use crate::tools::test_support::checks;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[test]
fn rust_dead_code_credits_module_declarations_and_qualified_path_calls() {
    let root = Fixture::new();
    let write = |path: &str, text: &str| {
        root.write(path, text);
    };
    write(CARGO_APP.0, CARGO_APP.1);
    // Only a live caller credits a qualified-path callee, so the root
    // calls `handle`, which calls the two items by path.
    write(
        "src/lib.rs",
        "pub mod tools;\npub mod portable;\npub mod api;\npub fn start() { api::handle(); }\n",
    );
    write("src/tools/mod.rs", "pub mod inner;\n");
    write("src/tools/inner.rs", "pub fn used() {}\n");
    write("src/portable.rs", "pub fn sanitize() {}\n");
    write(
        "src/api.rs",
        "pub fn handle() {\n    crate::portable::sanitize();\n    crate::tools::inner::used();\n}\n",
    );
    let query = json!({"mainGoal":"find dead code","reasoning":"test","operation":"deadCode","path":root.0.as_path(),"rustWorkspace":"cargo"});
    let out = run(query, root.0.as_path()).expect("dead code");
    let names = out["nodes"]
        .as_array()
        .expect("rows")
        .iter()
        .map(|row| row["name"].as_str().unwrap_or_default().to_owned())
        .collect::<Vec<_>>();
    assert!(
        !names.contains(&"inner".to_owned()),
        "a `mod` declaration is not an export: {names:?}"
    );
    assert!(
        !names.contains(&"sanitize".to_owned()),
        "called by qualified path: {names:?}"
    );
    assert!(
        !names.contains(&"used".to_owned()),
        "called by qualified path: {names:?}"
    );
}

#[test]
fn oversized_implicit_scan_is_refused_with_narrower_roots() {
    let root = Fixture::new();
    let over = graph::SCOPE_ADMISSION_FILES as usize + 1;
    for (package, count) in [("big", over - 10), ("small", 10)] {
        let dir = root.0.as_path().join("packages").join(package);
        std::fs::create_dir_all(&dir).expect("package dir");
        for i in 0..count {
            std::fs::write(dir.join(format!("f{i}.ts")), "export const x = 1;\n")
                .expect("fixture file");
        }
    }
    let query = json!({"mainGoal": "test", "reasoning":"test","operation":"cycles","path":root.0.as_path()});
    let error = run(query.clone(), root.0.as_path()).expect_err("scope refused");
    assert_eq!(error.code, "scopeTooBroad");
    assert!(
        error
            .message
            .contains("packages/big (4991), packages/small (10)"),
        "{}",
        error.message
    );
    // The leads are the next step; no prose repeats them.
    assert!(error.hints.is_empty(), "{:?}", error.hints);
    let next = error.next.expect("continuations");
    let narrow = &next["narrowScope"]["query"]["queries"][0];
    assert!(
        narrow["path"].as_str().unwrap().ends_with("packages/big"),
        "{next}"
    );
    assert_eq!(
        next["expandScan"]["query"]["queries"][0]["maxFiles"],
        20_000
    );

    let mut explicit = query;
    explicit["maxFiles"] = json!(20_000);
    assert!(
        run(explicit, root.0.as_path()).is_ok(),
        "explicit maxFiles opts in"
    );
}

/// A file-anchored query (`source`, `target`) narrows to the widest
/// admissible directory that holds its files, with them re-rooted, so
/// the emitted narrowScope runs instead of failing on a source outside
/// the suggested root.
#[test]
fn oversized_scan_narrows_file_queries_to_a_root_holding_their_files() {
    let root = Fixture::new();
    let over = graph::SCOPE_ADMISSION_FILES as usize + 1;
    for (package, count) in [("big", over - 10), ("small", 10)] {
        let dir = root.0.as_path().join("packages").join(package);
        std::fs::create_dir_all(&dir).expect("package dir");
        for i in 0..count {
            std::fs::write(dir.join(format!("f{i}.ts")), "export const x = 1;\n")
                .expect("fixture file");
        }
    }
    root.write(
        "packages/small/f1.ts",
        "import { x } from './f0';\nexport const y = x;\n",
    );
    let query =
        json!({"operation":"dependents","path":root.0.as_path(),"source":"packages/small/f0.ts"});
    let error = run(query, root.0.as_path()).expect_err("scope refused");
    assert_eq!(error.code, "scopeTooBroad");
    let next = error.next.expect("continuations");
    let narrow = &next["narrowScope"]["query"]["queries"][0];
    assert!(
        narrow["path"].as_str().unwrap().ends_with("packages/small"),
        "{next}"
    );
    assert_eq!(narrow["source"], "f0.ts", "{next}");
    let out = run(narrow.clone(), root.0.as_path()).expect("narrowScope runs");
    assert!(
        out["nodes"]
            .as_array()
            .is_some_and(|nodes| nodes.iter().any(|node| node["file"] == "f1.ts")),
        "{out}"
    );
}

#[test]
fn topology_passes_path_scoped_header_parser_to_the_shared_scan() {
    let root_dir = crate::tools::test_support::Fixture::new();
    let root = root_dir.0.clone();
    std::fs::create_dir_all(root.join("include")).expect("fixture directory");
    std::fs::write(
        root.join("include/widget.h"),
        "namespace Space { class Widget {}; }\n",
    )
    .expect("fixture header");
    let (paths, security) = crate::tools::test_support::simple_policy(&root);
    let query: AstTopologyQuery = serde_json::from_value(json!({"mainGoal": "test", "reasoning":"test","operation":"dependencies","path":root,"source":"include/widget.h","languageGlobs":{"cpp":["include/**/*.h"]}})).expect("query");
    let built = graph::build_graph_with(
        &query,
        &paths,
        &security,
        &crate::tools::cancel::NeverCancel,
        &Default::default(),
    )
    .expect("graph");
    assert!(
        built
            .facts
            .get("include/widget.h")
            .is_some_and(|facts| facts
                .declarations
                .iter()
                .any(|declaration| declaration.name == "Widget")),
        "{built:?}"
    );
    let public = execute_topology(
        &query,
        &paths,
        &security,
        &crate::tools::cancel::NeverCancel,
        None,
    )
    .expect("public topology");
    assert!(public.is_object());
}

#[test]
fn topology_snapshots_bind_page_cuts_and_disclose_page_ceiling() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    for i in 0..1001 {
        temp.write(&format!("f{i:04}.ts"), "export const value = 1;\n");
    }
    let first = run(json!({"operation":"reachability","path":root,"entrypoints":["f0000.ts"],"pageSize":1,"mainGoal":"test","reasoning":"test"}), root).expect("first");
    let mut resized = first["next"]["nextPage"]["query"]["queries"][0].clone();
    resized["pageSize"] = json!(2);
    let rejected = run(resized, root).expect("resized cursor");
    assert_eq!(rejected["errorCode"], "staleSnapshot", "{rejected}");
    let restarted = run(
        rejected["next"]["restart"]["query"]["queries"][0].clone(),
        root,
    )
    .expect("restart");
    assert_eq!(restarted["pagination"]["currentPage"], 1, "{restarted}");
    let mut last = first["next"]["nextPage"]["query"]["queries"][0].clone();
    last["page"] = json!(1000);
    let page = run(last, root).expect("ceiling");
    assert_eq!(page["nodes"].as_array().expect("nodes").len(), 1, "{page}");
    assert!(page["next"].get("nextPage").is_none(), "{page}");
    assert_eq!(page["terminalLimit"], true, "{page}");
    assert_eq!(page["coverage"]["parts"]["nodes"], "truncated", "{page}");
}

#[test]
fn drift_reports_resolved_cycle_and_removed_relation_between_two_roots() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    // Baseline: a <-> b import cycle.
    std::fs::create_dir_all(root.join("base")).unwrap();
    temp.write(
        "base/a.ts",
        "import { b } from './b';\nexport const a = () => b();\n",
    );
    temp.write(
        "base/b.ts",
        "import { a } from './a';\nexport const b = () => a();\n",
    );
    // Head: cycle resolved — b no longer imports a.
    std::fs::create_dir_all(root.join("head")).unwrap();
    temp.write(
        "head/a.ts",
        "import { b } from './b';\nexport const a = () => b();\n",
    );
    temp.write("head/b.ts", "export const b = () => 1;\n");

    let head = root.join("head");
    let base = root.join("base");
    let out = run(
        json!({
            "mainGoal": "test", "reasoning":"test","operation":"drift",
            "path": head.to_string_lossy(),
            "baseline": base.to_string_lossy()
        }),
        root,
    )
    .expect("drift result");

    assert_eq!(out["operation"], "drift");
    assert_eq!(out["graphSummary"]["comparable"], json!(true));
    assert_eq!(out["graphSummary"]["cyclesResolved"], json!(1));
    assert!(
        out["graphSummary"]["relationsRemoved"]
            .as_u64()
            .unwrap_or(0)
            >= 1,
        "the removed b->a import is a removed relation: {out}"
    );
    let resolved = out["nodes"]
        .as_array()
        .expect("nodes")
        .iter()
        .any(|row| row["category"] == "cycle" && row["change"] == "resolved");
    assert!(resolved, "a resolved-cycle row is present: {out}");
}

#[test]
fn drift_rejects_baseline_on_non_drift_and_requires_it_on_drift() {
    let temp = fixture(&[("a.ts", "export const a = 1;\n")]);
    let root = temp.0.as_path();

    // The wire contract scopes baseline to drift and requires it there.
    let parse = |query: Value| serde_json::from_value::<AstTopologyQuery>(query);
    assert!(
        parse(json!({"mainGoal": "test", "reasoning":"test","operation":"cycles","path":root.to_string_lossy(),"baseline":root.to_string_lossy()}))
            .is_err(),
        "baseline rejected on cycles"
    );
    assert!(
        parse(json!({"mainGoal": "test", "reasoning":"test","operation":"drift","path":root.to_string_lossy()}))
            .is_err(),
        "drift requires baseline"
    );
}

#[test]
fn cycles_on_unresolvable_rust_crate_imports_degrades_instead_of_a_confident_zero() {
    // A Rust source tree whose `crate::` imports cannot be resolved (no
    // Cargo.toml, syntax mode). Before the fix this returned `cycleCount:0`
    // with no confidence marker — a confident-looking zero on a graph with
    // zero resolved edges. It must now degrade honestly.
    let temp = fixture(&[
        (
            "foo.rs",
            "use crate::bar::thing;\npub fn foo() { thing(); }\n",
        ),
        ("bar.rs", "pub fn thing() {}\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(root, json!({"operation":"cycles"}));

    // The zero is still reported, but no longer as a confident answer.
    assert_eq!(out["graphSummary"]["cycleCount"], json!(0));
    assert_eq!(
        out["confidence"], "low",
        "unresolved edges must lower confidence: {out}"
    );
    assert_eq!(
        out["graphSummary"]["importResolution"]["status"], "failed",
        "zero resolved imports is a failed resolution: {out}"
    );
    assert_eq!(
        out["graphSummary"]["importResolution"]["resolved"],
        json!(0)
    );
    assert!(
        out["coverage"]["imports"]["unresolvedInternal"]
            .as_u64()
            .is_some_and(|count| count > 0),
        "unresolved crate:: imports must be counted: {out}"
    );
    assert_eq!(
        out["coverage"]["parts"]["graph"], "coverage-incomplete",
        "{out}"
    );
    // A coverage gap is not truncation: nothing more is reachable by paging.
    assert!(out.get("truncated").is_none(), "{out}");
    assert!(out.get("terminalLimit").is_none(), "{out}");
}

#[test]
fn coverage_diagnostics_default_to_counts_with_rows_behind_next() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    for (name, text) in [
        (
            "a.ts",
            "import { x } from '#missing/x';\nimport { b } from './b';\nexport const a = b;\n",
        ),
        (
            "c.ts",
            "import { x } from '#missing/x';\nexport const c = x;\n",
        ),
        ("b.ts", "export const b = 1;\n"),
    ] {
        temp.write(name, text);
    }
    let out = topology(root, json!({"operation":"dependents","source":"b.ts"}));
    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 2, "{out}");
    assert!(out["coverage"].get("diagnostics").is_none(), "{out}");
    // Withheld rows are an opt-in lead, not a page: the answer is complete.
    assert!(out.get("isPartial").is_none(), "{out}");
    assert!(out["next"].get("nextDiagnosticPage").is_none(), "{out}");
    assert!(
        out.pointer("/coverage/parts/diagnostics").is_none(),
        "{out}"
    );
    let lead = &out["next"]["readDiagnostics"];
    assert_eq!(
        crate::tools::id::channel(crate::tools::id::ToolId::AstTopology, "readDiagnostics"),
        crate::tools::id::Channel::Lead
    );
    let next = lead["query"]["queries"][0].clone();
    assert_eq!(next["diagnosticPage"], 1, "{out}");
    let rows = run(next, root).expect("diagnostic rows");
    // Both files fail on the same specifier: one grouped row.
    let diagnostics = rows["coverage"]["diagnostics"].as_array().expect("rows");
    assert_eq!(diagnostics.len(), 1, "{rows}");
    assert_eq!(
        diagnostics[0]["files"],
        json!(["a.ts:1", "c.ts:1"]),
        "{rows}"
    );
    // The diagnostics page carries diagnostics only: the results were
    // already delivered by the page that offered the lead.
    assert_eq!(rows["nodes"], json!([]), "{rows}");
    assert!(rows.get("pagination").is_none(), "{rows}");
    assert!(rows.get("graphSummary").is_none(), "{rows}");
    assert!(
        rows.pointer("/coverage/parts/diagnostics").is_none(),
        "{rows}"
    );
    assert!(rows["next"].get("nextDiagnosticPage").is_none(), "{rows}");
    assert!(rows["next"].get("readDiagnostics").is_none(), "{rows}");
}

#[test]
fn later_pages_reuse_the_graph_until_a_scanned_file_changes() {
    let temp = fixture(&[
        ("a.ts", "import { b } from './b';\nexport const a = b;\n"),
        ("b.ts", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();
    let query = |page: u32| json!({"mainGoal":"test","reasoning":"test","operation":"dependents","path":root.to_string_lossy(),"source":"b.ts","page":page});
    let builds = || graph::fresh_builds();
    run(query(1), root).expect("page 1");
    let after_first = builds();
    run(query(2), root).expect("page 2");
    assert_eq!(builds(), after_first, "a later page reuses the graph");
    temp.write("c.ts", "import { b } from './b';\n");
    let out = run(query(1), root).expect("after a new file");
    assert_eq!(builds(), after_first + 1, "a new file rebuilds the graph");
    assert_eq!(out["nodes"].as_array().map(Vec::len), Some(2), "{out}");
}

#[test]
fn repeated_topology_pages_share_the_graph_allocation() {
    let temp = fixture(&[("a.ts", "export const a = 1;\n")]);
    let root = temp.0.as_path();
    let (paths, security) = crate::tools::test_support::simple_policy(root);
    let q: AstTopologyQuery =
        serde_json::from_value(json!({"operation":"cycles","path":root})).unwrap();
    let first = graph::build_graph_shared_with(
        &q,
        &paths,
        &security,
        &crate::tools::cancel::NeverCancel,
        &Default::default(),
    )
    .expect("first");
    let second = graph::build_graph_shared_with(
        &q,
        &paths,
        &security,
        &crate::tools::cancel::NeverCancel,
        &Default::default(),
    )
    .expect("second");
    assert!(std::sync::Arc::ptr_eq(&first.0, &second.0));
}

#[test]
fn invalid_graph_query_gets_a_tool_owned_repair_hint() {
    use crate::tools::output::ToolOutput;
    let hint = Output.error_hint("invalidGraphQuery").expect("hint");
    assert!(hint.contains("relative to path"), "{hint}");
    assert!(Output.error_hint("cancelled").is_none());
}

#[test]
fn completeness_names_only_the_states_that_are_not_complete() {
    let temp = fixture(&[
        (
            "a.ts",
            "import { x } from '#missing/x';\nimport { b } from './b';\nexport const a = b;\n",
        ),
        ("b.ts", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();
    let out = topology(root, json!({"operation":"dependents","source":"b.ts"}));
    assert_eq!(
        out["coverage"]["parts"],
        json!({"graph":"coverage-incomplete"}),
        "the gap's count is in coverage, not restated: {out}"
    );
    assert!(
        out["graphSummary"].get("source").is_none() && out["graphSummary"].get("depth").is_none(),
        "the summary does not echo the query: {out}"
    );
    // One copy of each count: import-linking problems are counted by
    // `coverage.imports`, the diagnostic codes count only other gaps.
    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 1, "{out}");
    assert!(
        out.pointer("/coverage/diagnosticCounts/unresolved-internal")
            .is_none(),
        "{out}"
    );
}

#[test]
fn dependents_offer_a_read_of_the_top_import_line() {
    let temp = fixture(&[
        (
            "a.ts",
            "// a\nimport { b } from './b';\nexport const a = b;\n",
        ),
        ("b.ts", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();
    let out = topology(root, json!({"operation":"dependents","source":"b.ts"}));
    let read = &out["next"]["read"];
    assert_eq!(read["tool"], "localFetch", "{out}");
    let row = &read["query"]["queries"][0];
    let real = root.canonicalize().expect("root");
    assert_eq!(
        row["path"],
        json!(real.join("a.ts").to_string_lossy()),
        "{out}"
    );
    assert_eq!(row["ranges"], json!(["2-2"]), "{out}");
}

#[test]
fn rust_module_tree_loops_are_not_cycles_but_use_cycles_are() {
    let temp = fixture(&[
        CARGO_APP,
        // `tools` is a module tree only: the parent declares the child and
        // the child uses an item of its parent.
        (
            "src/lib.rs",
            "pub mod tools;\npub mod a;\npub mod b;\npub fn root() {}\n",
        ),
        ("src/tools/mod.rs", "pub mod inner;\npub fn shared() {}\n"),
        (
            "src/tools/inner.rs",
            "use super::shared;\npub fn run() { shared(); }\n",
        ),
        // `a` and `b` use each other: a real dependency cycle.
        ("src/a.rs", "use crate::b::bee;\npub fn ay() { bee(); }\n"),
        ("src/b.rs", "use crate::a::ay;\npub fn bee() { ay(); }\n"),
    ]);
    let root = temp.0.as_path();
    let out = topology(
        root,
        json!({"operation":"cycles","path":root.join("src").to_string_lossy()}),
    );
    let cycles = out["nodes"].as_array().expect("rows");
    assert_eq!(cycles.len(), 1, "{out}");
    assert_eq!(cycles[0]["files"], json!(["a.rs", "b.rs"]), "{out}");
    assert_eq!(out["graphSummary"]["cycleCount"], 1, "{out}");
    assert!(
        out["graphSummary"]["moduleTreeCycleCount"].as_u64() >= Some(1),
        "{out}"
    );
    // Empty runtime lists say nothing.
    assert!(cycles[0].get("runtimeGroups").is_none(), "{out}");
    assert!(cycles[0].get("runtimeCycleEdges").is_none(), "{out}");
}

/// A cycle item leads with its small facts (counts, runtime cycles,
/// edges) and ends with its `files`, so a split item shows them first.
#[test]
fn cycle_items_put_counts_before_files() {
    let temp = fixture(&[
        (
            "a.ts",
            "import { b } from './b';\nexport const a = () => b();\n",
        ),
        (
            "b.ts",
            "import { a } from './a';\nexport const b = () => a();\n",
        ),
    ]);
    let root = temp.0.as_path();
    let out = topology(root, json!({"operation":"cycles"}));
    let cycle = out["nodes"][0].as_object().expect("cycle item");
    let keys = cycle.keys().map(String::as_str).collect::<Vec<_>>();
    assert_eq!(keys.last(), Some(&"files"), "{out}");
    assert_eq!(cycle["fileCount"], json!(2), "{out}");
    let at = |key: &str| keys.iter().position(|k| *k == key);
    assert!(at("fileCount") < at("files"), "{keys:?}");
    assert!(at("runtimeGroups") < at("cycleEdges"), "{keys:?}");
}

#[test]
fn rust_qualified_path_calls_are_dependencies_that_close_cycles() {
    let temp = fixture(&[
        CARGO_APP,
        ("src/lib.rs", "pub mod a;\npub mod b;\n"),
        // `a` names `b` only through a path in a body; `b` imports `a`.
        ("src/a.rs", "pub fn ay() { crate::b::bee(); }\n"),
        (
            "src/b.rs",
            "use crate::a::ay;\npub fn bee() {}\npub fn other() { ay(); }\n",
        ),
    ]);
    let root = temp.0.as_path();
    let out = topology(
        root,
        json!({"operation":"cycles","path":root.join("src").to_string_lossy()}),
    );
    let cycles = out["nodes"].as_array().expect("rows");
    assert_eq!(cycles.len(), 1, "{out}");
    assert_eq!(cycles[0]["files"], json!(["a.rs", "b.rs"]), "{out}");
    // The dependency cites the path's line as its evidence.
    let out = topology(
        root,
        json!({"operation":"dependencies","path":root.join("src").to_string_lossy(),"source":"a.rs"}),
    );
    let row = out["nodes"]
        .as_array()
        .expect("rows")
        .iter()
        .find(|row| row["file"] == "b.rs")
        .cloned()
        .expect("b.rs row");
    assert_eq!(row["importLine"], 1, "{out}");
}

#[test]
fn rust_super_past_an_inline_module_climbs_from_the_enclosing_module() {
    let temp = fixture(&[
        CARGO_APP,
        ("src/lib.rs", "pub mod x;\npub mod z;\n"),
        ("src/z.rs", "pub fn top() {}\n"),
        ("src/x/mod.rs", "pub mod y;\npub mod z;\n"),
        ("src/x/z.rs", "pub fn near() {}\n"),
        // Inside `mod tests` (one inline level), `super::super` is the
        // parent of the file's module: `crate::x`, so `z` is `x/z.rs`.
        (
            "src/x/y.rs",
            "pub fn y() {}\n#[cfg(test)]\nmod tests {\n    use super::super::z::near;\n}\n",
        ),
    ]);
    let root = temp.0.as_path();
    let out = topology(
        root,
        json!({"operation":"dependencies","path":root.join("src").to_string_lossy(),"source":"x/y.rs"}),
    );
    let files = result_files(&out);
    assert!(files.contains(&"x/z.rs"), "{out}");
    assert!(!files.contains(&"z.rs"), "{out}");
}

#[test]
fn subtree_scan_resolves_package_imports_through_the_outer_manifest() {
    let temp = Fixture::new();
    let package = temp.0.as_path().join("pkg");
    std::fs::create_dir_all(package.join("src/enums")).unwrap();
    std::fs::write(
        package.join("package.json"),
        r##"{"name":"pkg","imports":{"#enums/*":"./src/enums/*.ts","#outside":"./lib/x.js"}}"##,
    )
    .unwrap();
    std::fs::write(package.join("src/enums/flags.ts"), "export const F = 1;\n").unwrap();
    std::fs::write(
        package.join("src/main.ts"),
        "import { F } from '#enums/flags';\nexport const m = F;\n",
    )
    .unwrap();
    let src = package.join("src");
    let out = topology(
        temp.0.as_path(),
        json!({"operation":"dependents","path":src.to_string_lossy(),"source":"enums/flags.ts"}),
    );
    assert_eq!(out["nodes"][0]["file"], "main.ts", "{out}");
    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 0, "{out}");
}

#[test]
fn outer_manifest_lookup_stops_at_the_repository_boundary() {
    let temp = Fixture::new();
    temp.write(
        "package.json",
        r##"{"name":"outer","imports":{"#enums/*":"./repo/src/enums/*.ts"}}"##,
    );
    let repo = temp.0.as_path().join("repo");
    std::fs::create_dir_all(repo.join(".git")).unwrap();
    std::fs::create_dir_all(repo.join("src/enums")).unwrap();
    std::fs::write(repo.join("src/enums/flags.ts"), "export const F = 1;\n").unwrap();
    std::fs::write(
        repo.join("src/main.ts"),
        "import { F } from '#enums/flags';\nexport const m = F;\n",
    )
    .unwrap();
    let src = repo.join("src");
    let out = topology(
        temp.0.as_path(),
        json!({"operation":"dependents","path":src.to_string_lossy(),"source":"enums/flags.ts"}),
    );
    assert_eq!(out["nodes"], json!([]), "{out}");
    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 1, "{out}");
}

fn dependents_by_file(out: &Value) -> BTreeMap<String, Value> {
    out["nodes"]
        .as_array()
        .expect("rows")
        .iter()
        .map(|row| {
            (
                row["file"].as_str().unwrap_or_default().to_owned(),
                row["reexportVia"].clone(),
            )
        })
        .collect()
}

#[test]
fn dependents_follow_typescript_reexports_of_the_named_items_only() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    for (name, text) in [
        ("t.ts", "export const x = 1;\nexport const y = 2;\n"),
        (
            "index.ts",
            "export { x } from './t';\nexport const other = 3;\n",
        ),
        ("star.ts", "export * from './t';\n"),
        (
            "a.ts",
            "import { x } from './index';\nexport const a = x;\n",
        ),
        (
            "b.ts",
            "import { other } from './index';\nexport const b = other;\n",
        ),
        ("c.ts", "import { y } from './star';\nexport const c = y;\n"),
        (
            "d.ts",
            "import { other } from './index';\nconst z = 1;\nimport { x } from './index';\nexport const d = x + other + z;\n",
        ),
    ] {
        temp.write(name, text);
    }
    let out = topology(root, json!({"operation":"dependents","source":"t.ts"}));
    assert_eq!(
        dependents_by_file(&out),
        BTreeMap::from([
            ("a.ts".to_owned(), json!("index.ts")),
            ("c.ts".to_owned(), json!("star.ts")),
            ("d.ts".to_owned(), json!("index.ts")),
            ("index.ts".to_owned(), Value::Null),
            ("star.ts".to_owned(), Value::Null),
        ]),
        "{out}"
    );
    let a = out["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["file"] == "a.ts")
        .unwrap();
    assert_eq!(a["importLine"], 1, "{out}");
    // The line importing the re-exported item, not the first import
    // from the re-exporting module.
    let d = out["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["file"] == "d.ts")
        .unwrap();
    assert_eq!(d["importLine"], 3, "{out}");
    // A re-export is the dependent's import statement too.
    for file in ["index.ts", "star.ts"] {
        let row = out["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["file"] == file)
            .unwrap();
        assert_eq!(row["importLine"], 1, "{file}: {out}");
    }
}

#[test]
fn dependents_follow_rust_pub_use_reexports() {
    let temp = fixture(&[
        CARGO_APP,
        ("src/lib.rs", "pub mod sync;\npub mod task;\n"),
        (
            "src/sync/mod.rs",
            "mod notify;\npub use notify::Notify;\nmod broadcast;\nmod other;\npub struct Other;\n",
        ),
        ("src/sync/notify.rs", "pub struct Notify;\n"),
        (
            "src/sync/broadcast.rs",
            "use super::Notify;\npub fn b(_: Notify) {}\n",
        ),
        (
            "src/sync/other.rs",
            "use super::Other;\npub fn o(_: Other) {}\n",
        ),
        ("src/task/mod.rs", "pub mod local;\n"),
        (
            "src/task/local.rs",
            "use crate::sync::Notify;\npub fn l(_: Notify) {}\n",
        ),
    ]);
    let root = temp.0.as_path();
    let out = topology(
        root,
        json!({"operation":"dependents","source":"src/sync/notify.rs","rustWorkspace":"cargo"}),
    );
    assert_eq!(
        dependents_by_file(&out),
        BTreeMap::from([
            ("src/sync/broadcast.rs".to_owned(), json!("src/sync/mod.rs")),
            ("src/sync/mod.rs".to_owned(), Value::Null),
            ("src/task/local.rs".to_owned(), json!("src/sync/mod.rs")),
        ]),
        "{out}"
    );
}

#[test]
fn non_code_imports_are_not_unresolved_coverage_gaps() {
    let temp = fixture(&[
        (
            "a.ts",
            "import pkg from './package.json';\nimport './a.css';\nimport logo from './logo.svg?url';\nimport { b } from './b';\nexport const a = b;\n",
        ),
        ("b.ts", "import { a } from './a';\nexport const b = 1;\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(root, json!({"operation":"cycles"}));

    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 0, "{out}");
    assert_eq!(out["coverage"]["imports"]["nonCode"], 3, "{out}");
    assert!(out.get("confidence").is_none(), "{out}");
    assert!(out.get("truncated").is_none(), "{out}");
    assert!(out.get("terminalLimit").is_none(), "{out}");
    assert!(
        out["coverage"]["parts"].get("coverageGapReasons").is_none(),
        "{out}"
    );
    // Empty diagnostics and a single diagnostic page carry no envelope.
    assert!(out["coverage"].get("diagnostics").is_none(), "{out}");
    assert!(out["coverage"].get("diagnosticCounts").is_none(), "{out}");
    assert!(
        out["coverage"].get("diagnosticPagination").is_none(),
        "{out}"
    );
    let row = &out["nodes"][0];
    assert_eq!(row["files"], json!(["a.ts", "b.ts"]), "{out}");
    assert!(row.get("size").is_none(), "size duplicates files: {out}");
    assert!(row.get("outgoingComponentCount").is_none(), "{out}");
}

#[test]
fn go_package_imports_link_every_package_file_with_its_import_line() {
    let temp = fixture(&[("go.mod", "module example.com/app\n")]);
    let root = temp.0.as_path();
    std::fs::create_dir_all(root.join("tsdb")).unwrap();
    temp.write("main.go", "package main\n\nimport (\n\t\"fmt\"\n\t\"example.com/app/tsdb\"\n)\n\nfunc main() { fmt.Println(tsdb.Open()) }\n");
    temp.write(
        "tsdb/db.go",
        "package tsdb\n\nfunc Open() int { return 1 }\n",
    );
    temp.write("tsdb/head.go", "package tsdb\n\ntype Head struct{}\n");
    temp.write("tsdb/db_test.go", "package tsdb\n");

    let out = topology(root, json!({"operation":"dependencies","source":"main.go"}));
    let rows = out["nodes"].as_array().expect("rows");
    let files = rows
        .iter()
        .map(|r| r["file"].as_str().unwrap_or_default())
        .collect::<Vec<_>>();
    assert_eq!(files, vec!["tsdb/db.go", "tsdb/head.go"], "{out}");
    assert!(rows.iter().all(|r| r["importLine"] == 5), "{out}");

    let dependents = topology(
        root,
        json!({"operation":"dependents","source":"tsdb/head.go"}),
    );
    assert_eq!(dependents["nodes"][0]["file"], "main.go", "{dependents}");
}

/// A scan rooted below the module root still reads the enclosing
/// `go.mod`, so module-path imports into the scanned subtree link.
#[test]
fn go_subdirectory_roots_resolve_through_the_enclosing_go_mod() {
    let temp = fixture(&[("go.mod", "module example.com/app\n")]);
    let root = temp.0.as_path();
    std::fs::create_dir_all(root.join("tsdb/chunkenc")).unwrap();
    temp.write(
        "tsdb/chunkenc/chunk.go",
        "package chunkenc\n\nfunc New() int { return 1 }\n",
    );
    temp.write("tsdb/db.go", "package tsdb\n\nimport \"example.com/app/tsdb/chunkenc\"\n\nfunc Open() int { return chunkenc.New() }\n");
    let out = topology(
        root,
        json!({"operation":"dependents","path":root.join("tsdb").to_string_lossy(),"source":"chunkenc/chunk.go"}),
    );
    assert_eq!(out["nodes"][0]["file"], "db.go", "{out}");
}

/// A scan rooted at a Python package resolves absolute imports that name
/// that package (`from pkg.utils.text import x` under root `pkg/`).
#[test]
fn python_package_roots_resolve_imports_through_their_package_name() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    std::fs::create_dir_all(root.join("pkg/utils")).unwrap();
    temp.write("pkg/__init__.py", "");
    temp.write("pkg/utils/__init__.py", "");
    temp.write("pkg/utils/text.py", "def slug(x):\n    return x\n");
    temp.write(
        "pkg/admin.py",
        "from pkg.utils.text import slug\n\nprint(slug('a'))\n",
    );
    let out = topology(
        root,
        json!({"operation":"dependents","path":root.join("pkg").to_string_lossy(),"source":"utils/text.py"}),
    );
    assert_eq!(out["nodes"][0]["file"], "admin.py", "{out}");
}

/// Java classes of one package use each other without an import.
#[test]
fn java_same_package_uses_link_without_an_import() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    let dir = root.join("src/com/acme");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("Lists.java"),
        "package com.acme;\n\npublic final class Lists {\n  public static int transform(int x) { return x; }\n}\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("Multimaps.java"),
        "package com.acme;\n\nfinal class Multimaps {\n  int run() { return Lists.transform(1); }\n}\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("Other.java"),
        "package com.acme;\n\nfinal class Other {\n  int run() { return 2; }\n}\n",
    )
    .unwrap();
    let out = topology(
        root,
        json!({"operation":"dependents","source":"src/com/acme/Lists.java"}),
    );
    let files = result_files(&out);
    assert_eq!(files, ["src/com/acme/Multimaps.java"], "{out}");
}

#[test]
fn java_same_package_edges_are_not_labeled_imports_and_carry_no_import_line() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    let dir = root.join("src/com/acme");
    std::fs::create_dir_all(dir.join("util")).unwrap();
    std::fs::write(
        dir.join("Lists.java"),
        "package com.acme;\n\npublic final class Lists {\n  public static int transform(int x) { return x; }\n}\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("util/Strings.java"),
        "package com.acme.util;\n\npublic class Strings {}\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("Multimaps.java"),
        "package com.acme;\n\nimport com.acme.util.Strings;\n\nfinal class Multimaps {\n  int run() { return Lists.transform(1); }\n}\n",
    )
    .unwrap();
    let out = topology(
        root,
        json!({"operation":"dependencies","source":"src/com/acme/Multimaps.java"}),
    );
    let rows = out["nodes"].as_array().expect("rows");
    let row = |file: &str| {
        rows.iter()
            .find(|row| row["file"] == file)
            .unwrap_or_else(|| panic!("missing {file}: {out}"))
    };
    let same = row("src/com/acme/Lists.java");
    assert_eq!(same["edgeKinds"], json!(["java-same-package"]), "{out}");
    assert!(same.get("importLine").is_none(), "{out}");
    let imported = row("src/com/acme/util/Strings.java");
    assert_eq!(imported["edgeKinds"], json!(["java-import"]), "{out}");
    assert_eq!(imported["importLine"], 3, "{out}");
}

#[test]
fn result_page_past_the_end_is_empty_and_flagged_out_of_range() {
    let temp = fixture(&[
        ("a.ts", "import { b } from './b';\nexport const a = b;\n"),
        ("b.ts", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();
    let out = topology(
        root,
        json!({"operation":"dependencies","source":"a.ts","page":2,"pageSize":100}),
    );
    assert_eq!(out["nodes"], json!([]), "{out}");
    assert_eq!(out["pagination"]["currentPage"], 2, "{out}");
    assert_eq!(out["pagination"]["totalPages"], 1, "{out}");
    assert_eq!(out["pagination"]["outOfRange"], true, "{out}");
    assert_eq!(out["pagination"]["hasMore"], false, "{out}");
    // Flipped: the page position is the shared row outcome
    // (`reason: "page 2 of 1"`, set by the response stage), not a
    // per-tool warning that said it twice.
    assert!(out.get("warnings").is_none(), "{out}");
}

#[test]
fn relative_file_without_path_is_an_invalid_input_error() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    let error = run(
        json!({"mainGoal":"test","reasoning":"test","operation":"dependencies","source":"src/a.ts"}),
        root,
    )
    .expect_err("relative file without path");
    assert_eq!(error.code, "invalidInput", "{}", error.message);
    assert!(
        crate::response::rows::is_invalid_input_code(&error.code),
        "{}",
        error.code
    );
    assert!(error.message.contains("src/a.ts"), "{}", error.message);
    assert!(error.message.contains("path"), "{}", error.message);
}

#[test]
fn java_class_imports_link_to_the_class_file() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    let dir = root.join("src/com/acme");
    std::fs::create_dir_all(dir.join("util")).unwrap();
    std::fs::write(
        dir.join("App.java"),
        "package com.acme;\n\nimport com.acme.util.Strings;\nimport java.util.List;\n\nclass App {}\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("util/Strings.java"),
        "package com.acme.util;\n\npublic class Strings {}\n",
    )
    .unwrap();

    let out = topology(
        root,
        json!({"operation":"dependencies","source":"src/com/acme/App.java"}),
    );
    assert_eq!(
        out["nodes"][0]["file"], "src/com/acme/util/Strings.java",
        "{out}"
    );
    assert_eq!(out["nodes"][0]["importLine"], 3, "{out}");
}

#[test]
fn path_edges_carry_import_lines() {
    let temp = fixture(&[
        (
            "a.ts",
            "// head\nimport { b } from './b';\nexport const a = b;\n",
        ),
        ("b.ts", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(
        root,
        json!({"operation":"path","source":"a.ts","target":"b.ts"}),
    );

    assert_eq!(out["nodes"][0]["edges"][0]["importLine"], 2, "{out}");
}

#[test]
fn resolved_entrypoints_are_emitted_on_the_first_page_only() {
    let temp = fixture(&[("package.json", r#"{"name":"x","main":"a.js"}"#)]);
    let root = temp.0.as_path();
    for i in 0..3 {
        temp.write(&format!("f{i}.js"), "export const x = 1;\n");
    }
    temp.write("a.js", "export const a = 1;\n");
    let query = |page: u32| json!({"mainGoal": "test", "reasoning":"test","operation":"reachability","path":root.to_string_lossy(),"pageSize":2,"page":page});

    let first = run(query(1), root).expect("page 1");
    let second = run(query(2), root).expect("page 2");

    assert_eq!(
        first["graphSummary"]["entrypointsResolved"],
        json!(["a.js"]),
        "{first}"
    );
    assert!(
        second["graphSummary"].get("entrypointsResolved").is_none(),
        "{second}"
    );
    assert_eq!(
        second["graphSummary"]["entrypointsResolvedCount"], 1,
        "{second}"
    );
}

#[test]
fn reachability_packs_reachable_files_and_lists_every_file_once() {
    let temp = fixture(&[
        ("package.json", r#"{"name":"x","main":"a.js"}"#),
        ("a.js", "import './b';\nimport './c';\n"),
        ("b.js", "export const b = 1;\n"),
        ("c.js", "export const c = 1;\n"),
        ("dead.js", "export const d = 1;\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(root, json!({"operation":"reachability"}));
    let rows = out["nodes"].as_array().expect("rows");

    assert_eq!(rows.len(), 2, "{out}");
    assert_eq!(rows[0]["file"], "dead.js", "{out}");
    assert_eq!(rows[0]["reachable"], false, "{out}");
    assert_eq!(rows[1]["files"], json!(["a.js", "b.js", "c.js"]), "{out}");
    assert_eq!(out["graphSummary"]["reachableCount"], 3, "{out}");
    assert_eq!(out["graphSummary"]["unreachableCount"], 1, "{out}");
}

#[test]
fn explicit_entrypoints_are_not_echoed_and_complete_state_is_implicit() {
    let temp = fixture(&[
        ("a.js", "import './b';\n"),
        ("b.js", "export const b = 1;\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(
        root,
        json!({"operation":"reachability","entrypoints":["a.js"]}),
    );

    assert!(
        out["graphSummary"].get("entrypointsResolved").is_none(),
        "{out}"
    );
    assert_eq!(out["graphSummary"]["entrypointsResolvedCount"], 1, "{out}");
    assert_eq!(out["coverage"]["state"], "complete", "{out}");
}

#[test]
fn skipped_import_target_is_not_reported_as_a_resolved_dependency() {
    let temp = fixture(&[("entry.ts", "import './unread';\n")]);
    let root = temp.0.as_path();
    temp.write("unread.ts", [0xff]);

    let out = topology(
        root,
        json!({"operation":"dependencies","source":"entry.ts"}),
    );

    // One skipped file is named once: the partial reason (the coverage
    // diagnostics name the file).
    assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
    assert!(out.get("filesSkipped").is_none(), "{out}");
    checks::assert_absent(&out["warnings"], "could not be read");
    assert_eq!(out["coverage"]["imports"]["resolved"], 0);
    assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 1);
    assert!(out["nodes"].as_array().unwrap().is_empty(), "{out}");
}

#[test]
fn nested_workspace_package_import_resolves_to_scanned_source() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    std::fs::create_dir_all(root.join("packages/lib/src")).unwrap();
    temp.write(
        "packages/lib/package.json",
        r#"{"name":"@fixture/lib","exports":"./src/index.ts"}"#,
    );
    temp.write("packages/lib/src/index.ts", "export const value = 1;\n");
    temp.write(
        "entry.ts",
        "import { value } from '@fixture/lib';\nconsole.log(value);\n",
    );

    let out = topology(
        root,
        json!({"operation":"dependencies","source":"entry.ts"}),
    );

    assert!(
        out["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["file"] == "packages/lib/src/index.ts"),
        "workspace package manifest should resolve its source: {out}"
    );
}

#[test]
fn syntax_basis_is_not_repeated_as_a_diagnostic_for_every_file() {
    let temp = fixture(&[
        ("one.py", "def one(): pass\n"),
        ("two.py", "def two(): pass\n"),
    ]);
    let root = temp.0.as_path();

    let out = topology(root, json!({"operation":"cycles"}));

    assert_eq!(out["coverage"]["basis"], "syntactic");
    assert!(
        out["coverage"]["diagnosticCounts"]["syntax-only"].is_null(),
        "{out}"
    );
    assert!(out["coverage"].get("diagnostics").is_none(), "{out}");
}

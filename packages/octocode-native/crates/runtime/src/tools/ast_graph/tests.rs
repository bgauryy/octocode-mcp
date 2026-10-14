//! astTopology tests: drift and dead-code root inference.

mod drift_tests {
    use super::super::test_support::*;
    use super::super::*;
    use serde_json::{Value, json};
    use std::collections::BTreeMap;

    #[test]
    fn rust_dead_code_credits_module_declarations_and_qualified_path_calls() {
        let root = tempfile::tempdir().expect("fixture directory");
        let write = |path: &str, text: &str| write_files(root.path(), &[(path, text)]);
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
        let query = json!({"mainGoal":"find dead code","reasoning":"test","operation":"deadCode","path":root.path(),"rustWorkspace":"cargo"});
        let out = run(query, root.path()).expect("dead code");
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
        let root = tempfile::tempdir().expect("fixture directory");
        let over = graph::SCOPE_ADMISSION_FILES as usize + 1;
        for (package, count) in [("big", over - 10), ("small", 10)] {
            let dir = root.path().join("packages").join(package);
            std::fs::create_dir_all(&dir).expect("package dir");
            for i in 0..count {
                std::fs::write(dir.join(format!("f{i}.ts")), "export const x = 1;\n")
                    .expect("fixture file");
            }
        }
        let query =
            json!({"mainGoal": "test", "reasoning":"test","operation":"cycles","path":root.path()});
        let error = run(query.clone(), root.path()).expect_err("scope refused");
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
            run(explicit, root.path()).is_ok(),
            "explicit maxFiles opts in"
        );
    }

    /// A file-anchored query (`source`, `target`) narrows to the widest
    /// admissible directory that holds its files, with them re-rooted, so
    /// the emitted narrowScope runs instead of failing on a source outside
    /// the suggested root.
    #[test]
    fn oversized_scan_narrows_file_queries_to_a_root_holding_their_files() {
        let root = tempfile::tempdir().expect("fixture directory");
        let over = graph::SCOPE_ADMISSION_FILES as usize + 1;
        for (package, count) in [("big", over - 10), ("small", 10)] {
            let dir = root.path().join("packages").join(package);
            std::fs::create_dir_all(&dir).expect("package dir");
            for i in 0..count {
                std::fs::write(dir.join(format!("f{i}.ts")), "export const x = 1;\n")
                    .expect("fixture file");
            }
        }
        std::fs::write(
            root.path().join("packages/small/f1.ts"),
            "import { x } from './f0';\nexport const y = x;\n",
        )
        .expect("importer");
        let query =
            json!({"operation":"dependents","path":root.path(),"source":"packages/small/f0.ts"});
        let error = run(query, root.path()).expect_err("scope refused");
        assert_eq!(error.code, "scopeTooBroad");
        let next = error.next.expect("continuations");
        let narrow = &next["narrowScope"]["query"]["queries"][0];
        assert!(
            narrow["path"].as_str().unwrap().ends_with("packages/small"),
            "{next}"
        );
        assert_eq!(narrow["source"], "f0.ts", "{next}");
        let out = run(narrow.clone(), root.path()).expect("narrowScope runs");
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
        let temp = tempfile::tempdir().expect("fixture");
        let root = temp.path();
        for i in 0..1001 {
            std::fs::write(
                root.join(format!("f{i:04}.ts")),
                "export const value = 1;\n",
            )
            .expect("file");
        }
        let first = run(json!({"operation":"reachability","path":root,"entrypoints":["f0000.ts"],"pageSize":1,"mainGoal":"test","reasoning":"test"}), root).expect("first");
        let mut resized = first["next"]["nextPage"]["query"]["queries"][0].clone();
        resized["pageSize"] = json!(2);
        let rejected = run(resized, root).expect("resized cursor");
        assert_eq!(rejected["errorCode"], "staleSnapshot", "{rejected}");
        let restarted = run(
            rejected["next"]["restartDiagnostics"]["query"]["queries"][0].clone(),
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
        // Baseline: a <-> b import cycle.
        std::fs::create_dir_all(root.join("base")).unwrap();
        std::fs::write(
            root.join("base/a.ts"),
            "import { b } from './b';\nexport const a = () => b();\n",
        )
        .unwrap();
        std::fs::write(
            root.join("base/b.ts"),
            "import { a } from './a';\nexport const b = () => a();\n",
        )
        .unwrap();
        // Head: cycle resolved — b no longer imports a.
        std::fs::create_dir_all(root.join("head")).unwrap();
        std::fs::write(
            root.join("head/a.ts"),
            "import { b } from './b';\nexport const a = () => b();\n",
        )
        .unwrap();
        std::fs::write(root.join("head/b.ts"), "export const b = () => 1;\n").unwrap();

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
        let root = temp.path();

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
        let root = temp.path();

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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
            std::fs::write(root.join(name), text).unwrap();
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
        let root = temp.path();
        let query = |page: u32| json!({"mainGoal":"test","reasoning":"test","operation":"dependents","path":root.to_string_lossy(),"source":"b.ts","page":page});
        let builds = || graph::fresh_builds();
        run(query(1), root).expect("page 1");
        let after_first = builds();
        run(query(2), root).expect("page 2");
        assert_eq!(builds(), after_first, "a later page reuses the graph");
        std::fs::write(root.join("c.ts"), "import { b } from './b';\n").unwrap();
        let out = run(query(1), root).expect("after a new file");
        assert_eq!(builds(), after_first + 1, "a new file rebuilds the graph");
        assert_eq!(out["nodes"].as_array().map(Vec::len), Some(2), "{out}");
    }

    #[test]
    fn repeated_topology_pages_share_the_graph_allocation() {
        let temp = fixture(&[("a.ts", "export const a = 1;\n")]);
        let root = temp.path();
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
        let root = temp.path();
        let out = topology(root, json!({"operation":"dependents","source":"b.ts"}));
        assert_eq!(
            out["coverage"]["parts"],
            json!({"graph":"coverage-incomplete"}),
            "the gap's count is in coverage, not restated: {out}"
        );
        assert!(
            out["graphSummary"].get("source").is_none()
                && out["graphSummary"].get("depth").is_none(),
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
        let root = temp.path();
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
        let root = temp.path();
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
        let root = temp.path();
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
        let root = temp.path();
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
        let root = temp.path();
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
        let temp = tempfile::TempDir::new().expect("temp");
        let package = temp.path().join("pkg");
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
            temp.path(),
            json!({"operation":"dependents","path":src.to_string_lossy(),"source":"enums/flags.ts"}),
        );
        assert_eq!(out["nodes"][0]["file"], "main.ts", "{out}");
        assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 0, "{out}");
    }

    #[test]
    fn outer_manifest_lookup_stops_at_the_repository_boundary() {
        let temp = tempfile::TempDir::new().expect("temp");
        std::fs::write(
            temp.path().join("package.json"),
            r##"{"name":"outer","imports":{"#enums/*":"./repo/src/enums/*.ts"}}"##,
        )
        .unwrap();
        let repo = temp.path().join("repo");
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
            temp.path(),
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
            std::fs::write(root.join(name), text).unwrap();
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
        let root = temp.path();
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
        let root = temp.path();

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
        let root = temp.path();
        std::fs::create_dir_all(root.join("tsdb")).unwrap();
        std::fs::write(
            root.join("main.go"),
            "package main\n\nimport (\n\t\"fmt\"\n\t\"example.com/app/tsdb\"\n)\n\nfunc main() { fmt.Println(tsdb.Open()) }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("tsdb/db.go"),
            "package tsdb\n\nfunc Open() int { return 1 }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("tsdb/head.go"),
            "package tsdb\n\ntype Head struct{}\n",
        )
        .unwrap();
        std::fs::write(root.join("tsdb/db_test.go"), "package tsdb\n").unwrap();

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
        let root = temp.path();
        std::fs::create_dir_all(root.join("tsdb/chunkenc")).unwrap();
        std::fs::write(
            root.join("tsdb/chunkenc/chunk.go"),
            "package chunkenc\n\nfunc New() int { return 1 }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("tsdb/db.go"),
            "package tsdb\n\nimport \"example.com/app/tsdb/chunkenc\"\n\nfunc Open() int { return chunkenc.New() }\n",
        )
        .unwrap();
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
        std::fs::create_dir_all(root.join("pkg/utils")).unwrap();
        std::fs::write(root.join("pkg/__init__.py"), "").unwrap();
        std::fs::write(root.join("pkg/utils/__init__.py"), "").unwrap();
        std::fs::write(
            root.join("pkg/utils/text.py"),
            "def slug(x):\n    return x\n",
        )
        .unwrap();
        std::fs::write(
            root.join("pkg/admin.py"),
            "from pkg.utils.text import slug\n\nprint(slug('a'))\n",
        )
        .unwrap();
        let out = topology(
            root,
            json!({"operation":"dependents","path":root.join("pkg").to_string_lossy(),"source":"utils/text.py"}),
        );
        assert_eq!(out["nodes"][0]["file"], "admin.py", "{out}");
    }

    /// Java classes of one package use each other without an import.
    #[test]
    fn java_same_package_uses_link_without_an_import() {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
        let root = temp.path();
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
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
        let root = temp.path();

        let out = topology(
            root,
            json!({"operation":"path","source":"a.ts","target":"b.ts"}),
        );

        assert_eq!(out["nodes"][0]["edges"][0]["importLine"], 2, "{out}");
    }

    #[test]
    fn resolved_entrypoints_are_emitted_on_the_first_page_only() {
        let temp = fixture(&[("package.json", r#"{"name":"x","main":"a.js"}"#)]);
        let root = temp.path();
        for i in 0..3 {
            std::fs::write(root.join(format!("f{i}.js")), "export const x = 1;\n").unwrap();
        }
        std::fs::write(root.join("a.js"), "export const a = 1;\n").unwrap();
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
        let root = temp.path();

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
        let root = temp.path();

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
        let root = temp.path();
        std::fs::write(root.join("unread.ts"), [0xff]).unwrap();

        let out = topology(
            root,
            json!({"operation":"dependencies","source":"entry.ts"}),
        );

        // One skipped file is named once: the partial reason (the coverage
        // diagnostics name the file).
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
        assert!(out.get("filesSkipped").is_none(), "{out}");
        assert!(
            !out["warnings"].to_string().contains("could not be read"),
            "{out}"
        );
        assert_eq!(out["coverage"]["imports"]["resolved"], 0);
        assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 1);
        assert!(out["nodes"].as_array().unwrap().is_empty(), "{out}");
    }

    #[test]
    fn nested_workspace_package_import_resolves_to_scanned_source() {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
        std::fs::create_dir_all(root.join("packages/lib/src")).unwrap();
        std::fs::write(
            root.join("packages/lib/package.json"),
            r#"{"name":"@fixture/lib","exports":"./src/index.ts"}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("packages/lib/src/index.ts"),
            "export const value = 1;\n",
        )
        .unwrap();
        std::fs::write(
            root.join("entry.ts"),
            "import { value } from '@fixture/lib';\nconsole.log(value);\n",
        )
        .unwrap();

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
        let root = temp.path();

        let out = topology(root, json!({"operation":"cycles"}));

        assert_eq!(out["coverage"]["basis"], "syntactic");
        assert!(
            out["coverage"]["diagnosticCounts"]["syntax-only"].is_null(),
            "{out}"
        );
        assert!(out["coverage"].get("diagnostics").is_none(), "{out}");
    }
}

mod dead_code_root_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};

    // Regression: dead-code root inference must not be package.json-only. A Rust
    // crate must infer `src/main.rs` as a root so the helper it calls reads as
    // reachable rather than dead.
    #[test]
    fn rust_dead_code_infers_main_root_and_keeps_helper_reachable() {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(
            root.join("src/main.rs"),
            "use crate::helper;\nfn main() { helper::run(); }\n",
        )
        .unwrap();
        std::fs::write(root.join("src/helper.rs"), "pub fn run() {}\n").unwrap();

        let out = topology(root, json!({"operation":"deadCode"}));

        assert!(
            out["graphSummary"]["entrypointsResolvedCount"]
                .as_u64()
                .unwrap_or(0)
                >= 1,
            "src/main.rs must be inferred as a root: {out}"
        );
        let dead = out["nodes"].as_array().cloned().unwrap_or_default();
        // The reachability defect: with a real root the helper is reached
        // through main's `use crate::helper`, so no file may be reported as an
        // unreachable file or dead cluster. (Export-level name-usage heuristics
        // are a separate, lower-confidence signal outside this fix's scope.)
        assert!(
            !dead
                .iter()
                .any(|r| r["reason"] == "unreachable-file" || r["reason"] == "dead-cluster"),
            "no file should be unreachable/dead-clustered when main is a root: {out}"
        );
        assert_eq!(
            out["graphSummary"]["deadClusterCount"],
            json!(0),
            "a reachable helper must not form a dead cluster: {out}"
        );
    }

    // Regression: when no roots resolve for the detected languages the dead-code
    // verdict must be hard-gated (empty dead list + low confidence), not report
    // every export in the tree as dead.
    #[test]
    fn dead_code_hard_gates_when_no_roots_resolve() {
        let temp = fixture(&[
            // A Rust source file with no main.rs/lib.rs/bin and no Cargo.toml: no
            // entrypoint can be inferred.
            ("util.rs", "pub fn util() {}\n"),
        ]);
        let root = temp.path();

        let out = topology(root, json!({"operation":"deadCode"}));

        assert_eq!(
            out["graphSummary"]["deadExportCount"],
            json!(0),
            "with no resolvable roots the dead list must be suppressed, not everything flagged: {out}"
        );
        assert_eq!(
            out["confidence"], "low",
            "an ungated dead-code verdict without roots must degrade to low confidence: {out}"
        );
    }

    /// A suppressed verdict proves nothing either way: the row is partial
    /// with `entrypointsUnresolved`, never an empty "no dead export".
    #[test]
    fn a_suppressed_dead_code_verdict_is_partial_not_empty() {
        let temp = fixture(&[("util.rs", "pub fn util() {}\n")]);
        let out = topology(temp.path(), json!({"operation":"deadCode"}));
        assert_ne!(out["status"], "empty", "{out}");
        assert_eq!(out["isPartial"], true, "{out}");
        assert_eq!(
            out["partialReasons"],
            json!(["entrypointsUnresolved"]),
            "{out}"
        );
        assert_eq!(out["coverage"]["state"], "partial", "{out}");
    }

    /// Unreferenced-export rows for a TS fixture rooted at `main.ts`, as
    /// `(name, exportedAs)` pairs.
    fn dead_exports(files: &[(&str, &str)]) -> Vec<(String, Value)> {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path();
        for (name, content) in files {
            std::fs::write(root.join(name), content).unwrap();
        }
        let out = topology(
            root,
            json!({"operation":"deadCode","entrypoints":["main.ts"]}),
        );
        let rows = out["nodes"].as_array().cloned().unwrap_or_default();
        assert_eq!(
            out["graphSummary"]["deadExportCount"].as_u64(),
            Some(rows.len() as u64),
            "{out}"
        );
        rows.iter()
            .map(|r| {
                assert_eq!(r["reason"], "unreferenced-export", "{out}");
                (
                    r["name"].as_str().unwrap().to_owned(),
                    r.get("exportedAs").cloned().unwrap_or(Value::Null),
                )
            })
            .collect()
    }

    #[test]
    fn renamed_export_is_reported_under_its_local_name_with_the_public_alias() {
        // `bar` (a different local function) is not exported; the
        // unused renamed export `foo` is dead and says it is public `bar`.
        let dead = dead_exports(&[
            (
                "mod.ts",
                "export function kept() { return 1 }\nfunction foo() { return 2 }\nfunction bar() { return 3 }\nexport { foo as bar }\n",
            ),
            ("main.ts", "import { kept } from './mod'\nkept()\n"),
        ]);
        assert_eq!(dead, vec![("foo".to_owned(), json!(["bar"]))]);
    }

    #[test]
    fn importing_the_public_alias_keeps_the_local_declaration_live() {
        // `export { foo as bar }`: importing `bar` consumes `foo`, and the
        // unrelated local `bar` is not exported.
        let dead = dead_exports(&[
            (
                "mod.ts",
                "export function kept() { return 1 }\nfunction foo() { return 2 }\nfunction bar() { return 3 }\nexport { foo as bar }\n",
            ),
            ("main.ts", "import { bar } from './mod'\nbar()\n"),
        ]);
        assert_eq!(dead, vec![("kept".to_owned(), Value::Null)]);
    }

    /// Rows of a Cargo fixture as `(file, name, viaHeuristic)`.
    fn rust_dead_rows(files: &[(&str, &str)]) -> Vec<(String, String, Value)> {
        let temp = fixture(&[(
            "Cargo.toml",
            "[package]\nname = \"app\"\nversion = \"0.1.0\"\n",
        )]);
        let root = temp.path();
        for (name, content) in files {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, content).unwrap();
        }
        let out = topology(
            root,
            json!({"operation":"deadCode","rustWorkspace":"cargo"}),
        );
        out["nodes"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .map(|r| {
                (
                    r["file"].as_str().unwrap().to_owned(),
                    r["name"].as_str().unwrap().to_owned(),
                    r.get("viaHeuristic").cloned().unwrap_or(Value::Null),
                )
            })
            .collect()
    }

    #[test]
    fn rust_unreachable_caller_does_not_keep_its_qualified_path_callee_live() {
        // `buried` is never called, so `crate::portable::secret()` inside it
        // credits nothing; `used` is called from the live `handle`.
        let rows = rust_dead_rows(&[
            (
                "src/lib.rs",
                "pub mod api;\npub mod portable;\npub fn start() { api::handle(); }\n",
            ),
            (
                "src/api.rs",
                "pub fn handle() { crate::portable::used(); }\nfn buried() { crate::portable::secret(); }\n",
            ),
            ("src/portable.rs", "pub fn used() {}\npub fn secret() {}\n"),
        ]);
        assert_eq!(
            rows,
            vec![(
                "src/portable.rs".to_owned(),
                "secret".to_owned(),
                json!("syntax-references")
            )]
        );
    }

    #[test]
    fn rust_qualified_calls_resolve_through_the_imported_binding() {
        // `h::run()` names `run` in the file `use crate::helper as h` binds;
        // the same-named `run` elsewhere is not credited by it.
        let rows = rust_dead_rows(&[
            (
                "src/main.rs",
                "mod helper;\nmod other;\nuse crate::helper as h;\nfn main() { h::run(); }\n",
            ),
            ("src/helper.rs", "pub fn run() {}\npub fn idle() {}\n"),
            ("src/other.rs", "pub fn run() {}\n"),
        ]);
        let names = rows
            .iter()
            .map(|(file, name, _)| format!("{file}:{name}"))
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["src/helper.rs:idle", "src/other.rs:run"]);
    }

    #[test]
    fn rust_unresolved_qualified_name_credit_is_only_a_heuristic() {
        // `unknown::sanitize()` cannot be resolved to a file: the name match
        // no longer proves `sanitize` live, it labels the candidate.
        let rows = rust_dead_rows(&[
            (
                "src/lib.rs",
                "pub mod portable;\npub fn start() { unknown::sanitize(); }\n",
            ),
            ("src/portable.rs", "pub fn sanitize() {}\n"),
        ]);
        assert_eq!(
            rows,
            vec![(
                "src/portable.rs".to_owned(),
                "sanitize".to_owned(),
                json!("qualified-path-name")
            )]
        );
    }

    #[test]
    fn default_import_keeps_the_default_export_declaration_live() {
        // `import foo from` consumes the module's default export.
        let def =
            "export default function foo() { return 1 }\nexport function other() { return 2 }\n";
        let dead = dead_exports(&[
            ("def.ts", def),
            (
                "main.ts",
                "import foo from './def'\nimport { other } from './def'\nfoo(); other()\n",
            ),
        ]);
        assert!(dead.is_empty(), "{dead:?}");
        let dead = dead_exports(&[
            ("def.ts", def),
            ("main.ts", "import { other } from './def'\nother()\n"),
        ]);
        assert_eq!(dead, vec![("foo".to_owned(), json!(["default"]))]);
    }

    #[test]
    fn same_named_method_does_not_share_liveness_with_a_live_function() {
        // The live exported `run` and the unreachable method
        // `Calls.run` are different callers, so `secret` is dead.
        let dead = dead_exports(&[
            (
                "calls.ts",
                "export function publicA() { return 1 }\nexport function secret() { return 2 }\nexport function run() { return publicA() }\nclass Calls { run() { return secret() } }\n",
            ),
            ("main.ts", "import { run } from './calls'\nrun()\n"),
        ]);
        assert_eq!(dead, vec![("secret".to_owned(), Value::Null)]);
    }

    #[test]
    fn unreachable_caller_does_not_keep_its_exported_callee_live() {
        // `buried` is never called, so its callee `secret` is dead;
        // `publicA` stays live through the imported `start`.
        let dead = dead_exports(&[
            (
                "calls.ts",
                "export function publicA() { return 1 }\nexport function secret() { return 2 }\nexport function start() { return publicA() }\nfunction buried() { return secret() }\n",
            ),
            ("main.ts", "import { start } from './calls'\nstart()\n"),
        ]);
        assert_eq!(dead, vec![("secret".to_owned(), Value::Null)]);
    }

    #[test]
    fn names_only_in_comments_or_strings_do_not_keep_exports_live() {
        let dead = dead_exports(&[
            (
                "lib.ts",
                "export function inComment() { return 1 }\nexport function inString() { return 2 }\nexport function passed() { return 3 }\nexport function assigned() { return 4 }\nexport function shadowed() { return 5 }\n// inComment is only documented here\nexport const label = 'inString'\nregister(passed)\nconst slot = assigned\nexport function make() { const shadowed = () => 0; return [shadowed, slot] }\n",
            ),
            (
                "main.ts",
                "import { make, label } from './lib'\nmake(); label\n",
            ),
        ]);
        assert_eq!(
            dead,
            vec![
                ("inComment".to_owned(), Value::Null),
                ("inString".to_owned(), Value::Null),
                ("shadowed".to_owned(), Value::Null),
            ]
        );
    }

    #[test]
    fn unreferenced_export_rows_name_their_reference_basis() {
        let temp = fixture(&[
            ("mod.ts", "export function unused() {}\n"),
            ("main.ts", "import './mod'\n"),
        ]);
        let root = temp.path();
        let out = topology(
            root,
            json!({"operation":"deadCode","entrypoints":["main.ts"]}),
        );
        assert_eq!(out["nodes"][0]["name"], "unused", "{out}");
        assert_eq!(
            out["nodes"][0]["viaHeuristic"], "semantic-references",
            "{out}"
        );
    }

    #[test]
    fn import_used_only_in_an_unreachable_function_does_not_keep_its_target_live() {
        // `buried` is never called: its `helper()` is the only use of the
        // import, so the import credits nothing.
        let helper = "export function helper() { return 1 }\n";
        let dead = dead_exports(&[
            ("helper.ts", helper),
            (
                "app.ts",
                "import { helper } from './helper'\nexport function start() { return 1 }\nfunction buried() { return helper() }\n",
            ),
            ("main.ts", "import { start } from './app'\nstart()\n"),
        ]);
        assert_eq!(dead, vec![("helper".to_owned(), Value::Null)]);
        // The same import used from the live `start` keeps `helper` live.
        let dead = dead_exports(&[
            ("helper.ts", helper),
            (
                "app.ts",
                "import { helper } from './helper'\nexport function start() { return helper() }\nfunction buried() { return helper() }\n",
            ),
            ("main.ts", "import { start } from './app'\nstart()\n"),
        ]);
        assert!(dead.is_empty(), "{dead:?}");
    }

    #[test]
    fn import_used_as_a_value_by_a_live_declaration_keeps_its_target_live() {
        // Value, type and export-clause uses credit the import too.
        let dead = dead_exports(&[
            (
                "helper.ts",
                "export function cb() { return 1 }\nexport interface Shape {}\nexport function passed() { return 2 }\n",
            ),
            (
                "app.ts",
                "import { cb, Shape, passed } from './helper'\nexport function start(s: Shape) { return register(cb) }\nexport { passed }\n",
            ),
            (
                "main.ts",
                "import { start, passed } from './app'\nstart(passed)\n",
            ),
        ]);
        assert!(dead.is_empty(), "{dead:?}");
    }

    #[test]
    fn namespace_default_and_reexported_imports_stay_live() {
        let dead = dead_exports(&[
            (
                "lib.ts",
                "export default function run() { return 1 }\nexport function viaNs() { return 2 }\nexport function viaChain() { return 3 }\nexport function viaClause() { return 4 }\n",
            ),
            ("barrel.ts", "export { viaChain } from './lib'\n"),
            (
                "clause.ts",
                "import { viaClause } from './lib'\nexport { viaClause }\n",
            ),
            (
                "app.ts",
                "import run from './lib'\nimport * as ns from './lib'\nexport function start() { run(); return ns.viaNs() }\n",
            ),
            (
                "main.ts",
                "import { start } from './app'\nimport { viaChain } from './barrel'\nimport { viaClause } from './clause'\nstart(); viaChain(); viaClause()\n",
            ),
        ]);
        assert!(dead.is_empty(), "{dead:?}");
        // A namespace import cannot be resolved to one member: even from an
        // unreachable function it keeps the whole module public.
        let dead = dead_exports(&[
            ("lib.ts", "export function viaNs() { return 2 }\n"),
            (
                "app.ts",
                "import * as ns from './lib'\nexport function start() { return 1 }\nfunction buried() { return ns.viaNs() }\n",
            ),
            ("main.ts", "import { start } from './app'\nstart()\n"),
        ]);
        assert!(dead.is_empty(), "{dead:?}");
    }

    #[test]
    fn rust_use_binding_only_in_an_unreachable_fn_does_not_keep_its_target_live() {
        let main = "mod app;\nmod util;\nfn main() { app::start(); }\n";
        let rows = rust_dead_rows(&[
            ("src/main.rs", main),
            (
                "src/app.rs",
                "use crate::util::run;\npub fn start() {}\nfn buried() { run(); }\n",
            ),
            ("src/util.rs", "pub fn run() {}\n"),
        ]);
        assert_eq!(
            rows,
            vec![(
                "src/util.rs".to_owned(),
                "run".to_owned(),
                json!("syntax-references")
            )]
        );
        // Used from the live `start`, or straight from `main`: live.
        let rows = rust_dead_rows(&[
            ("src/main.rs", main),
            (
                "src/app.rs",
                "use crate::util::run;\npub fn start() { run(); }\nfn buried() { run(); }\n",
            ),
            ("src/util.rs", "pub fn run() {}\n"),
        ]);
        assert!(rows.is_empty(), "{rows:?}");
        let rows = rust_dead_rows(&[
            (
                "src/main.rs",
                "mod util;\nuse crate::util::run;\nfn main() { run(); }\n",
            ),
            ("src/util.rs", "pub fn run() {}\n"),
        ]);
        assert!(rows.is_empty(), "{rows:?}");
    }

    #[test]
    fn rust_uses_that_cannot_be_ordered_by_liveness_stay_conservative() {
        // A `pub use` re-exports, a trait impl method and a test run without
        // a by-name caller: each use keeps its target live.
        let rows = rust_dead_rows(&[
            (
                "src/lib.rs",
                "pub mod app;\nmod util;\npub use crate::util::exported;\n",
            ),
            (
                "src/app.rs",
                "use crate::util::{fmt_helper, test_helper};\nstruct Shown;\nimpl std::fmt::Display for Shown {\n    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { fmt_helper(f) }\n}\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn t() { test_helper(); }\n}\n#[test]\nfn direct() { test_helper(); }\n",
            ),
            (
                "src/util.rs",
                "pub fn exported() {}\npub fn fmt_helper(_: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }\npub fn test_helper() {}\n",
            ),
        ]);
        assert!(rows.is_empty(), "{rows:?}");
    }

    #[test]
    fn value_escapes_and_module_level_calls_keep_callees_live() {
        // Reachability stays conservative: a function passed as a value, a
        // module-level call and a method of a used class all keep callees live.
        let dead = dead_exports(&[
            (
                "lib.ts",
                "export function a() { return 1 }\nexport function b() { return 2 }\nexport function c() { return 3 }\nexport function d() { return 4 }\nfunction handler() { return a() }\nregister(handler)\nfunction boot() { return b() }\nboot()\nclass Svc { go() { return c() } }\nexport function make() { return new Svc() }\n",
            ),
            ("main.ts", "import { make } from './lib'\nmake()\n"),
        ]);
        assert_eq!(dead, vec![("d".to_owned(), Value::Null)]);
    }
}

mod expand_scan_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};

    /// The rows of one call, as `name` (dead exports) or `file`.
    fn row_keys(out: &Value) -> Vec<String> {
        out["nodes"]
            .as_array()
            .expect("rows")
            .iter()
            .map(|row| {
                row["name"]
                    .as_str()
                    .or_else(|| row["file"].as_str())
                    .unwrap_or_default()
                    .to_owned()
            })
            .collect()
    }

    /// A widened scan cannot resume after the narrower scan's rows: more
    /// files retract a row the narrower graph listed (`used` gains its
    /// importer). So `next.expandScan` rides only the last result page and
    /// its page 1 says `supersedes`; a walker that drops the rows collected
    /// before a `supersedes` page ends with exactly the uncut answer, once.
    #[test]
    fn expand_scan_restarts_explicitly_and_a_walk_counts_each_row_once() {
        let temp = fixture(&[
            ("a.ts", "import { keep } from './b'\nkeep()\n"),
            (
                "b.ts",
                "export function keep() {}\nexport function used() {}\nexport function unused() {}\n",
            ),
            ("z.ts", "import { used } from './b'\nused()\n"),
        ]);
        let root = temp.path();
        let base = json!({"operation":"deadCode","entrypoints":["a.ts","z.ts"],"pageSize":1});
        let mut uncut_query = base.clone();
        uncut_query["maxFiles"] = json!(100);
        let uncut = row_keys(&topology(root, uncut_query));
        assert_eq!(uncut, vec!["unused".to_owned()]);

        let mut query = base;
        query["maxFiles"] = json!(2);
        let mut collected: Vec<String> = Vec::new();
        let mut narrow_rows: Vec<String> = Vec::new();
        let (mut calls, mut widened) = (0, 0);
        loop {
            calls += 1;
            assert!(calls < 20, "walk does not end");
            let out = topology(root, query.clone());
            if let Some(narrower) = out.get("supersedes") {
                widened += 1;
                assert_eq!(out["pagination"]["currentPage"], 1, "{out}");
                assert!(
                    out["warnings"]
                        .to_string()
                        .contains(&format!("maxFiles:{narrower}")),
                    "{out}"
                );
                narrow_rows.append(&mut collected);
            }
            collected.extend(row_keys(&out));
            let next = &out["next"];
            if next.get("nextPage").is_some() {
                assert!(
                    next.get("expandScan").is_none(),
                    "expandScan before the last page: {out}"
                );
            }
            let follow = ["nextPage", "expandScan"]
                .into_iter()
                .find_map(|name| next.get(name))
                .map(|call| call["query"]["queries"][0].clone());
            let Some(follow) = follow else { break };
            assert!(
                next.get("nextPage")
                    .is_none_or(|page| page["query"]["queries"][0].get("supersedes").is_none()),
                "a result page never re-announces the restart: {out}"
            );
            query = follow;
        }
        assert_eq!(widened, 1);
        // The narrower graph listed a row the wider one retracts: its rows
        // cannot be partitioned exactly once without changing their meaning.
        assert!(narrow_rows.contains(&"used".to_owned()), "{narrow_rows:?}");
        assert!(!uncut.contains(&"used".to_owned()));
        assert_eq!(collected, uncut, "the walk ends with the uncut rows, once");
    }

    /// Restores the default edge cap when a test that lowered it ends.
    struct EdgeCap;
    impl EdgeCap {
        fn lower(cap: u32) -> Self {
            super::super::graph::EDGE_CAP.with(|edges| edges.set(cap));
            Self
        }
    }
    impl Drop for EdgeCap {
        fn drop(&mut self) {
            super::super::graph::EDGE_CAP.with(|edges| edges.set(2_000_000));
        }
    }

    /// More files cannot lift the edge cap: a capped graph is a terminal
    /// limit named in a warning, never an `expandScan`, even when the file
    /// scan was cut too.
    #[test]
    fn an_edge_cap_cut_is_terminal_and_never_offers_expand_scan() {
        let temp = fixture(&[
            ("a.ts", "import { b } from './b'\nexport const a = b\n"),
            ("b.ts", "export const b = 1\n"),
            ("c.ts", "export const c = 1\n"),
        ]);
        let root = temp.path();
        let _cap = EdgeCap::lower(0);
        for (max_files, reasons) in [
            (2, json!(["maxFiles", "edgeCap"])),
            (100, json!(["edgeCap"])),
        ] {
            let out = topology(root, json!({"operation":"cycles","maxFiles":max_files}));
            assert!(out["next"].get("expandScan").is_none(), "{out}");
            assert_eq!(out["terminalLimit"], true, "{out}");
            assert_eq!(out["isPartial"], true, "{out}");
            assert_eq!(out["partialReasons"], reasons, "{out}");
            let warnings = out["warnings"].to_string();
            assert!(warnings.contains("edge cap"), "{out}");
            assert_eq!(warnings.contains("maxFiles ("), max_files == 2, "{out}");
        }
    }

    fn drift_fixture() -> tempfile::TempDir {
        fixture(&[
            ("base/a.ts", "export const a = 1\n"),
            ("base/b.ts", "export const b = 1\n"),
            ("base/c.ts", "export const c = 1\n"),
            ("head/a.ts", "import { b } from './b'\nexport const a = b\n"),
            ("head/b.ts", "export const b = 1\n"),
            ("head/c.ts", "import { a } from './a'\nexport const c = a\n"),
        ])
    }

    fn drift_query(root: &std::path::Path, max_files: u32) -> Value {
        json!({
            "operation":"drift",
            "path": root.join("head"),
            "baseline": root.join("base"),
            "maxFiles": max_files,
        })
    }

    /// A drift cut at `maxFiles` is a diff of two partial graphs: its last
    /// page offers the widened rebuild, whose page 1 replaces it.
    #[test]
    fn a_truncated_drift_offers_the_widened_rebuild() {
        let temp = drift_fixture();
        let root = temp.path();
        let cut = topology(root, drift_query(root, 2));
        assert_eq!(cut["isPartial"], true, "{cut}");
        let widen = cut["next"]["expandScan"]["query"]["queries"][0].clone();
        assert_eq!(widen["maxFiles"], 4, "{cut}");
        assert_eq!(widen["supersedes"], 2, "{cut}");
        let widened = topology(root, widen);
        assert_eq!(widened["supersedes"], 2, "{widened}");
        assert!(widened.get("isPartial").is_none(), "{widened}");
        assert!(widened["next"].get("expandScan").is_none(), "{widened}");
        let uncut = topology(root, drift_query(root, 100));
        assert_eq!(widened["nodes"], uncut["nodes"]);
    }

    /// A drift that skipped a file or hit the edge cap has no continuation
    /// that reaches the rest: it is a terminal limit, never complete.
    #[test]
    fn a_drift_cut_without_a_continuation_is_terminal() {
        let temp = drift_fixture();
        let root = temp.path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        write_file(root, "head/big.ts", &big);
        let skipped = topology(root, drift_query(root, 100));
        assert_eq!(skipped["isPartial"], true, "{skipped}");
        assert_eq!(skipped["terminalLimit"], true, "{skipped}");
        assert!(skipped["next"].get("expandScan").is_none(), "{skipped}");

        std::fs::remove_file(root.join("head/big.ts")).expect("remove");
        let _cap = EdgeCap::lower(0);
        let capped = topology(root, drift_query(root, 100));
        assert_eq!(capped["terminalLimit"], true, "{capped}");
        assert_eq!(capped["partialReasons"], json!(["edgeCap"]), "{capped}");
        assert!(capped["next"].get("expandScan").is_none(), "{capped}");
    }

    /// A diagnostic page is the coverage dimension; the widened scan rides
    /// the result walk only.
    #[test]
    fn diagnostic_pages_do_not_offer_expand_scan() {
        let temp = fixture(&[
            ("a.ts", "import { x } from './missing'\nx()\n"),
            ("b.ts", "export const b = 1\n"),
            ("c.ts", "export const c = 1\n"),
        ]);
        let root = temp.path();
        let first = topology(root, json!({"operation":"cycles","maxFiles":2}));
        assert!(first["next"].get("expandScan").is_some(), "{first}");
        let lead = first["next"]["readDiagnostics"]["query"]["queries"][0].clone();
        assert!(lead.is_object(), "{first}");
        let diagnostics = run(lead, root).expect("diagnostic page");
        assert!(
            diagnostics["next"].get("expandScan").is_none(),
            "{diagnostics}"
        );
    }

    /// `coverage.state` and `isPartial` are one fact: a payload is never
    /// `isPartial` beside a `complete` coverage. The skipped-file limit is
    /// the `filesSkipped` reason plus `terminalLimit`; the tool description
    /// explains it once, so no row repeats it as a warning.
    #[test]
    fn a_skipped_file_is_partial_in_coverage_and_flagged_terminal() {
        let temp = fixture(&[("entry.ts", "export const entry = 1;\n")]);
        let root = temp.path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        std::fs::write(root.join("big.ts"), big).unwrap();

        // Cycles answer for the whole root, so any skipped file cuts them.
        let out = topology(root, json!({"operation":"cycles"}));

        assert_eq!(out["isPartial"], true, "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        assert_eq!(out["coverage"]["state"], "partial", "{out}");
        assert_eq!(out["coverage"]["parts"]["graph"], "files-skipped", "{out}");
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
        assert!(out.get("warnings").is_none(), "{out}");
    }

    #[test]
    fn a_drift_with_a_skipped_file_is_partial_in_coverage() {
        let temp = drift_fixture();
        let root = temp.path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        write_file(root, "head/big.ts", &big);
        let out = topology(root, drift_query(root, 100));
        assert_eq!(out["isPartial"], true, "{out}");
        assert_eq!(out["coverage"]["state"], "partial", "{out}");
        assert_eq!(out["coverage"]["parts"]["graph"], "files-skipped", "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
    }

    #[test]
    fn the_result_page_ceiling_is_explained_as_terminal() {
        let temp = tempfile::tempdir().expect("fixture");
        let root = temp.path();
        for i in 0..1001 {
            std::fs::write(
                root.join(format!("f{i:04}.ts")),
                "export const value = 1;\n",
            )
            .expect("file");
        }
        let first = run(json!({"operation":"reachability","path":root,"entrypoints":["f0000.ts"],"pageSize":1,"mainGoal":"test","reasoning":"test"}), root).expect("first");
        let mut last = first["next"]["nextPage"]["query"]["queries"][0].clone();
        last["page"] = json!(1000);
        let page = run(last, root).expect("ceiling");
        assert_eq!(page["terminalLimit"], true, "{page}");
        let warnings = page["warnings"].to_string();
        assert!(
            warnings.contains("page ceiling") && warnings.contains("terminal"),
            "{page}"
        );
    }
}

/// Evidence the graph cannot link stays visible: an importer the resolver
/// could not link is named, never silently absent from the answer.
mod unlinked_evidence_tests {
    use super::super::test_support::*;
    use super::super::*;
    use serde_json::{Value, json};

    fn warnings(out: &Value) -> String {
        out["warnings"].to_string()
    }

    /// A fixture importing `vs/base/common/marshalling` by a bare specifier
    /// no tsconfig covers is not a linked dependent, but its specifier names
    /// the source by path: the answer says so instead of omitting it.
    #[test]
    fn dependents_name_unlinked_bare_imports_that_path_match_the_source() {
        let temp = fixture(&[
            (
                "src/vs/base/common/marshalling.ts",
                "export function revive() {}\n",
            ),
            (
                "src/vs/user.ts",
                "import { revive } from './base/common/marshalling';\nrevive();\n",
            ),
            (
                "fixtures/editing/a.ts",
                "import { revive } from 'vs/base/common/marshalling';\nrevive();\n",
            ),
            (
                "fixtures/editing/b.ts",
                "import { get } from 'lodash/get';\nimport React from 'react';\n",
            ),
            ("src/vs/lib/index.ts", "export const lib = 1;\n"),
            ("fixtures/editing/c.ts", "import { lib } from 'vs/lib';\n"),
        ]);
        let root = temp.path();
        let out = topology(
            root,
            json!({"operation":"dependents","source":"src/vs/base/common/marshalling.ts"}),
        );
        assert_eq!(result_files(&out), vec!["src/vs/user.ts"], "{out}");
        let text = warnings(&out);
        assert!(
            text.contains("fixtures/editing/a.ts:1") && text.contains("vs/base/common/marshalling"),
            "{out}"
        );
        assert!(
            !text.contains("b.ts") && !text.contains("lodash"),
            "unrelated bare specifiers stay quiet: {out}"
        );
        // A directory import names the index file it would load.
        let index = topology(
            root,
            json!({"operation":"dependents","source":"src/vs/lib/index.ts"}),
        );
        assert!(
            warnings(&index).contains("fixtures/editing/c.ts:1"),
            "{index}"
        );
        // A source nothing names by path carries no such warning.
        let quiet = topology(
            root,
            json!({"operation":"dependents","source":"src/vs/user.ts"}),
        );
        assert!(quiet.get("warnings").is_none(), "{quiet}");
    }

    /// Skipped files change the answer, so their diagnostic rows lead the
    /// coverage list: `next.readDiagnostics` page 1 names them.
    #[test]
    fn skipped_file_diagnostics_lead_the_grouped_list() {
        let diagnostic = |file: &str, code: &str, message: &str| types::Diagnostic {
            file: file.into(),
            line: None,
            code: code.into(),
            message: message.into(),
        };
        let rows = page::group_diagnostics(&[
            diagnostic("a.ts", "parse-recovery", "recovered"),
            diagnostic("b.ts", "unresolved-internal", "cannot link"),
            diagnostic(
                "z.ts",
                "scan-skip",
                "file exceeds the graph scan byte limit",
            ),
        ]);
        let codes: Vec<&str> = rows
            .iter()
            .map(|row| row["code"].as_str().expect("code"))
            .collect();
        assert_eq!(
            codes,
            ["scan-skip", "parse-recovery", "unresolved-internal"]
        );
    }
}

/// Refusing a broad scan keeps the complete route first: only a raised
/// `maxFiles` keeps an answer that spans the repository whole; re-rooting
/// changes the answer, and the refusal says so.
mod scope_refusal_tests {
    use super::super::test_support::*;
    use super::super::*;
    use serde_json::json;

    #[test]
    fn the_complete_route_leads_and_narrowing_is_labelled_as_a_scope_change() {
        let root = tempfile::tempdir().expect("fixture directory");
        let over = graph::SCOPE_ADMISSION_FILES as usize + 1;
        for (package, count) in [("big", over - 10), ("small", 10)] {
            let dir = root.path().join("packages").join(package);
            std::fs::create_dir_all(&dir).expect("package dir");
            for i in 0..count {
                std::fs::write(dir.join(format!("f{i}.ts")), "export const x = 1;\n")
                    .expect("fixture file");
            }
        }
        for query in [
            json!({"operation":"cycles","path":root.path()}),
            json!({"operation":"deadCode","path":root.path(),"entrypoints":["packages/small/f0.ts"]}),
        ] {
            let operation = query["operation"].clone();
            let error = run(query, root.path()).expect_err("scope refused");
            assert_eq!(error.code, "scopeTooBroad");
            let message = &error.message;
            let complete = message.find("keeps the answer complete").expect(message);
            let narrow = message.find("narrower directory").expect(message);
            assert!(complete < narrow, "complete route first: {message}");
            assert!(
                message.contains("changes the answer"),
                "narrowing is labelled: {message}"
            );
            let next = error.next.expect("continuations");
            let order: Vec<&str> = next
                .as_object()
                .expect("leads")
                .keys()
                .map(String::as_str)
                .collect();
            assert_eq!(order, ["expandScan", "narrowScope"], "{operation}");
        }
    }
}

/// An operation whose answer rows are empty is an empty result (like grep
/// with no match): `status:"empty"`, so every interface exits 1, and the row
/// carries a recovery that names the operation.
mod empty_answer_tests {
    use super::super::test_support::*;
    use super::super::*;
    use crate::tools::output::ToolOutput;
    use serde_json::json;

    fn leaf_fixture() -> tempfile::TempDir {
        fixture(&[
            ("a.ts", "export const a = 1;\n"),
            ("b.ts", "export const b = 2;\n"),
        ])
    }

    #[test]
    fn every_operation_with_no_answer_rows_is_empty() {
        let temp = leaf_fixture();
        let root = temp.path();
        for query in [
            json!({"operation":"cycles"}),
            json!({"operation":"dependents","source":"a.ts"}),
            json!({"operation":"dependencies","source":"a.ts"}),
            json!({"operation":"deadCode","entrypoints":["a.ts","b.ts"]}),
            json!({"operation":"path","source":"a.ts","target":"b.ts"}),
        ] {
            let out = topology(root, query.clone());
            assert_eq!(out["status"], "empty", "{query}: {out}");
        }
    }

    /// Reachability lists every file it classifies, so a graph with files is
    /// an answer even when all are reachable.
    #[test]
    fn reachability_rows_are_an_answer() {
        let temp = leaf_fixture();
        let out = topology(
            temp.path(),
            json!({"operation":"reachability","entrypoints":["a.ts","b.ts"]}),
        );
        assert!(out.get("status").is_none(), "{out}");
    }

    #[test]
    fn an_answered_operation_is_not_empty() {
        let temp = fixture(&[
            ("a.ts", "import { b } from './b';\nexport const a = b;\n"),
            (
                "b.ts",
                "import { a } from './a';\nexport const b = 1;\nexport const c = a;\n",
            ),
        ]);
        let root = temp.path();
        for query in [
            json!({"operation":"cycles"}),
            json!({"operation":"dependents","source":"a.ts"}),
            json!({"operation":"path","source":"a.ts","target":"b.ts"}),
        ] {
            let out = topology(root, query.clone());
            assert!(out.get("status").is_none(), "{query}: {out}");
        }
    }

    /// A diagnostics-only page lists no result rows by design: it is not an
    /// empty answer.
    #[test]
    fn a_diagnostic_page_is_not_an_empty_answer() {
        let temp = fixture(&[
            ("a.ts", "import x from './missing';\nexport const a = x;\n"),
            (
                "b.ts",
                "import { a } from './a';\nimport { b2 } from './b2';\nexport const b = a;\n",
            ),
            ("b2.ts", "import { b } from './b';\nexport const b2 = b;\n"),
        ]);
        let root = temp.path();
        let first = topology(root, json!({"operation":"dependents","source":"a.ts"}));
        assert!(first.get("status").is_none(), "{first}");
        let read = first["next"]["readDiagnostics"]["query"]["queries"][0].clone();
        let page = topology(root, read);
        assert!(
            page["nodes"].as_array().is_some_and(Vec::is_empty),
            "a diagnostics page carries no result rows: {page}"
        );
        assert!(page.get("status").is_none(), "{page}");
    }

    #[test]
    fn the_empty_recovery_names_the_operation() {
        let hint = |operation: &str| Output.fallback_hint(&json!({"operation":operation}));
        let operations = [
            "dependents",
            "dependencies",
            "cycles",
            "deadCode",
            "reachability",
            "path",
            "drift",
        ];
        let hints: std::collections::BTreeSet<&str> =
            operations.iter().map(|operation| hint(operation)).collect();
        assert_eq!(hints.len(), operations.len(), "one recovery per operation");
        assert!(hint("cycles").contains("cycle"), "{}", hint("cycles"));
        assert!(
            hint("dependents").contains("import"),
            "{}",
            hint("dependents")
        );
        assert!(
            hint("deadCode").contains("entrypoints"),
            "{}",
            hint("deadCode")
        );
    }
}

/// Import resolution and coverage accounting a review found wrong: a path
/// that leaves and re-enters the scan root, TypeScript declaration siblings,
/// one unit across counters and diagnostics, and confidence scoped to the rows
/// an unresolved import can change.
mod resolution_scope_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};
    use std::path::Path;

    /// Dependents/dependencies rows of one `file`.
    fn row<'a>(out: &'a Value, file: &str) -> Option<&'a Value> {
        out["nodes"]
            .as_array()
            .expect("rows")
            .iter()
            .find(|row| row["file"] == file)
    }

    fn diagnostic_rows(root: &Path, scan: &str, query: Value) -> Vec<Value> {
        let mut first = query.clone();
        first["path"] = json!(scan);
        first["extras"] = json!(["diagnostics"]);
        let out = topology(root, first.clone());
        let lead = out["next"]["readDiagnostics"]["query"]["queries"][0].clone();
        let mut page = lead;
        page["path"] = json!(scan);
        let rows = topology(root, page);
        rows["coverage"]["diagnostics"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    }

    #[test]
    fn a_relative_path_that_leaves_and_reenters_the_scan_root_links_by_normalised_path() {
        let temp = fixture(&[
            ("packages/config/src/home.ts", "export const home = 1;\n"),
            (
                "packages/agents/tests/native.test.mjs",
                "import { home } from '../../../packages/config/src/home.ts';\nexport const t = home;\n",
            ),
            // Leaves the scan root and enters a directory that is not in it.
            (
                "packages/agents/tests/outside.test.mjs",
                "import { x } from '../../../other/x.ts';\nexport const o = x;\n",
            ),
            ("other/x.ts", "export const x = 1;\n"),
        ]);
        let scan = temp.path().join("packages");
        let out = topology(
            temp.path(),
            json!({"operation":"dependents","path":scan,"source":"config/src/home.ts"}),
        );
        let importer = row(&out, "agents/tests/native.test.mjs");
        assert!(
            importer.is_some(),
            "re-entering importer is a dependent: {out}"
        );
        // Only the path that never re-enters the root stays an unresolved gap.
        assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 1, "{out}");
    }

    #[test]
    fn declaration_siblings_resolve_like_the_typescript_extension_swap() {
        let temp = fixture(&[
            (
                "src/main.ts",
                "import { a } from './a.js';\nimport { b } from './b.mjs';\nimport { c } from './c.cjs';\nimport { d } from './d.js';\nimport { e } from './e';\nexport const all = [a, b, c, d, e];\n",
            ),
            ("src/a.d.ts", "export declare const a: number;\n"),
            ("src/b.d.mts", "export declare const b: number;\n"),
            ("src/c.d.cts", "export declare const c: number;\n"),
            ("src/d.tsx", "export const d = 1;\n"),
            ("src/e.d.ts", "export declare const e: number;\n"),
        ]);
        let out = topology(
            temp.path(),
            json!({"operation":"dependencies","source":"src/main.ts"}),
        );
        let files = result_files(&out);
        for file in [
            "src/a.d.ts",
            "src/b.d.mts",
            "src/c.d.cts",
            "src/d.tsx",
            "src/e.d.ts",
        ] {
            assert!(
                files.contains(&file),
                "{file} missing from {files:?}: {out}"
            );
        }
        assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 0, "{out}");
        assert!(out.get("confidence").is_none(), "{out}");
    }

    #[test]
    fn import_counters_count_statements_like_the_diagnostics_and_name_the_unit() {
        let temp = fixture(&[
            (
                "src/main.ts",
                "import { a, b, c } from './missing';\nimport d from './also-missing';\nimport { x, y } from './ok';\nexport const all = [a, b, c, d, x, y];\n",
            ),
            ("src/ok.ts", "export const x = 1;\nexport const y = 2;\n"),
        ]);
        let query = json!({"operation":"dependents","source":"src/ok.ts"});
        let out = topology(temp.path(), query.clone());
        let imports = &out["coverage"]["imports"];
        assert_eq!(imports["unresolvedInternal"], 2, "{out}");
        assert_eq!(imports["resolved"], 1, "{out}");
        assert_eq!(imports["unit"], "statements", "{out}");
        let rows = diagnostic_rows(temp.path(), &temp.path().to_string_lossy(), query);
        let statements: usize = rows
            .iter()
            .filter(|row| row["code"] == "unresolved-internal")
            .map(|row| row["files"].as_array().map_or(0, Vec::len))
            .sum();
        assert_eq!(statements, 2, "{rows:?}");
    }

    #[test]
    fn every_diagnostic_row_has_the_one_files_shape() {
        let temp = fixture(&[(
            "src/main.ts",
            "import { a } from './missing';\nexport const all = a;\n",
        )]);
        let rows = diagnostic_rows(
            temp.path(),
            &temp.path().to_string_lossy(),
            json!({"operation":"dependents","source":"src/main.ts"}),
        );
        assert_eq!(rows.len(), 1, "{rows:?}");
        assert_eq!(rows[0]["files"], json!(["src/main.ts:1"]), "{rows:?}");
        assert!(
            rows[0].get("file").is_none() && rows[0].get("line").is_none(),
            "{rows:?}"
        );
    }

    #[test]
    fn dependency_confidence_is_scoped_to_the_files_whose_imports_were_read() {
        let temp = fixture(&[
            (
                "src/index.ts",
                "import { u } from './util';\nexport const i = u;\n",
            ),
            ("src/util.ts", "export const u = 1;\n"),
            (
                "examples/user-cli.ts",
                "import { g } from './generated';\nexport const c = g;\n",
            ),
        ]);
        let unrelated = topology(
            temp.path(),
            json!({"operation":"dependencies","source":"src/index.ts"}),
        );
        assert!(unrelated.get("confidence").is_none(), "{unrelated}");
        assert!(
            unrelated["graphSummary"].get("importResolution").is_none(),
            "{unrelated}"
        );
        // The scan's own gap is still reported, as coverage.
        assert_eq!(
            unrelated["coverage"]["imports"]["unresolvedInternal"], 1,
            "{unrelated}"
        );
        let affected = topology(
            temp.path(),
            json!({"operation":"dependencies","source":"examples/user-cli.ts"}),
        );
        assert_eq!(affected["confidence"], "low", "{affected}");
        // `./generated` from examples/ cannot name src/util.ts: no importer
        // of it is lost. A whole-graph answer keeps the gap.
        let dependents = topology(
            temp.path(),
            json!({"operation":"dependents","source":"src/util.ts"}),
        );
        assert!(dependents.get("confidence").is_none(), "{dependents}");
        let cycles = topology(temp.path(), json!({"operation":"cycles"}));
        assert_eq!(cycles["confidence"], "low", "{cycles}");
    }

    #[test]
    fn a_cycle_row_labels_its_group_and_says_its_edges_are_one_witness() {
        let temp = fixture(&[
            (
                "a.ts",
                "import { b } from './b';\nimport { c } from './c';\nexport const a = [b, c];\n",
            ),
            ("b.ts", "import { a } from './a';\nexport const b = a;\n"),
            ("c.ts", "import { a } from './a';\nexport const c = a;\n"),
        ]);
        let out = topology(temp.path(), json!({"operation":"cycles"}));
        let group = &out["nodes"][0];
        assert_eq!(group["fileCount"], 3, "{out}");
        assert_eq!(
            group["runtimeGroups"],
            json!([{"fileCount":3,"files":["a.ts","b.ts","c.ts"]}]),
            "{out}"
        );
        assert!(group.get("runtimeCycles").is_none(), "{out}");
        assert_eq!(
            group["cycleEdgesShown"],
            json!({"kind":"witness","files":2,"of":3}),
            "{out}"
        );
        assert_eq!(
            group["cycleEdges"].as_array().map(Vec::len),
            Some(2),
            "{out}"
        );
    }
}

mod review_fix_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};

    fn unreachable_files(out: &Value) -> Vec<String> {
        out["nodes"]
            .as_array()
            .expect("rows")
            .iter()
            .filter(|row| row["reachable"] == false)
            .filter_map(|row| row["file"].as_str().map(str::to_owned))
            .collect()
    }

    /// `types`/`typings`/`module` name published entry files as much as
    /// `main` does: a declaration entry is never unreachable.
    #[test]
    fn package_types_typings_and_module_entries_are_roots() {
        let temp = fixture(&[
            (
                "package.json",
                r#"{"name":"x","types":"index.d.ts","typings":"legacy.d.ts","module":"esm.js"}"#,
            ),
            ("index.d.ts", "export declare const a: number;\n"),
            ("legacy.d.ts", "export declare const b: number;\n"),
            ("esm.js", "export const c = 1;\n"),
            ("dead.js", "export const d = 1;\n"),
        ]);
        let out = topology(temp.path(), json!({"operation":"reachability"}));
        assert_eq!(unreachable_files(&out), vec!["dead.js"], "{out}");
        assert_eq!(out["graphSummary"]["reachableCount"], 3, "{out}");
    }

    /// A multi-package root without its own manifest still resolves each
    /// scanned package's entrypoints, package-relative.
    #[test]
    fn every_scanned_package_manifest_contributes_entrypoints() {
        let temp = fixture(&[
            ("package.json", r#"{"name":"root","private":true}"#),
            (
                "packages/a/package.json",
                r#"{"name":"a","main":"./index.js"}"#,
            ),
            ("packages/a/index.js", "import './lib.js';\n"),
            ("packages/a/lib.js", "export const lib = 1;\n"),
            (
                "packages/b/package.json",
                r#"{"name":"b","bin":{"b":"cli.js"}}"#,
            ),
            ("packages/b/cli.js", "console.log(1);\n"),
            ("packages/b/dead.js", "export const d = 1;\n"),
        ]);
        let out = topology(temp.path(), json!({"operation":"reachability"}));
        assert_eq!(unreachable_files(&out), vec!["packages/b/dead.js"], "{out}");
        assert_eq!(out["graphSummary"]["reachableCount"], 3, "{out}");
    }

    fn drift_between(root: &std::path::Path, head: &str, baseline: &str) -> Value {
        run(
            json!({
                "mainGoal": "test", "reasoning":"test","operation":"drift",
                "path": head, "baseline": baseline
            }),
            root,
        )
        .expect("drift result")
    }

    /// File-level rows lead (file → cycle → transition → relation), edge
    /// kinds read as plain names, and a relative baseline displays
    /// workspace-relative like `path`.
    #[test]
    fn drift_rows_lead_with_files_and_name_edge_kinds_plainly() {
        let temp = fixture(&[
            (
                "snap/base/a.ts",
                "import { b } from './b';\nexport const a = () => b();\n",
            ),
            (
                "snap/base/b.ts",
                "import { a } from './a';\nexport const b = () => a();\n",
            ),
            (
                "head/a.ts",
                "import { b } from './b';\nexport const a = () => b();\n",
            ),
            ("head/b.ts", "export const b = () => 1;\n"),
            ("head/c.ts", "export const c = 1;\n"),
        ]);
        let root = temp.path();
        let head = root.join("head");
        let out = drift_between(root, &head.to_string_lossy(), "snap/base");
        assert_eq!(out["baseline"], "snap/base", "{out}");
        let rows = out["nodes"].as_array().expect("nodes");
        let rank = |category: &str| match category {
            "file" => 0,
            "cycle" => 1,
            "transition" => 2,
            _ => 3,
        };
        let order = rows
            .iter()
            .map(|row| rank(row["category"].as_str().expect("category")))
            .collect::<Vec<_>>();
        let mut sorted = order.clone();
        sorted.sort_unstable();
        assert_eq!(order, sorted, "{out}");
        assert_eq!(rows[0]["category"], "file", "{out}");
        assert!(order.contains(&1) && order.contains(&3), "{out}");
        for row in rows.iter().filter(|row| row["category"] == "relation") {
            let kind = row["edgeKind"].as_str().expect("edgeKind");
            assert!(
                !kind.contains(['(', '"']) && !kind.is_empty(),
                "plain kind: {kind}"
            );
        }
        assert!(rows.iter().any(|row| row["edgeKind"] == "imports"), "{out}");
    }

    /// A drift with no change lists nothing to truncate: a skipped file
    /// marks the graph, not the (empty) rows.
    #[test]
    fn unchanged_drift_with_a_skipped_file_does_not_truncate_rows() {
        let temp = fixture(&[
            ("base/a.ts", "export const a = 1;\n"),
            ("head/a.ts", "export const a = 1;\n"),
        ]);
        let root = temp.path();
        std::fs::write(root.join("base/bad.ts"), [0xff]).unwrap();
        std::fs::write(root.join("head/bad.ts"), [0xff]).unwrap();
        let out = drift_between(
            root,
            &root.join("head").to_string_lossy(),
            &root.join("base").to_string_lossy(),
        );
        assert!(out["nodes"].as_array().is_some_and(Vec::is_empty), "{out}");
        assert!(out.pointer("/coverage/parts/nodes").is_none(), "{out}");
        assert_eq!(out["coverage"]["parts"]["graph"], "files-skipped", "{out}");
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        // The skipped-file limit is a flag, not a repeated sentence.
        let warnings = out["warnings"].as_array().cloned().unwrap_or_default();
        assert!(
            !warnings
                .iter()
                .any(|w| w.as_str().is_some_and(|w| w.contains("skipped files"))),
            "{out}"
        );
    }

    fn refusal(
        root: &std::path::Path,
        query: Value,
        entries: &[String],
        capped: bool,
    ) -> crate::tools::result::ToolError {
        let (paths, _) = crate::tools::test_support::simple_policy(root);
        let mut query = query;
        query["mainGoal"] = "test".into();
        query["reasoning"] = "test".into();
        query["path"] = root.to_string_lossy().into();
        let q: super::super::AstTopologyQuery = serde_json::from_value(query).expect("query");
        super::super::graph::scope_too_broad(&q, root, &paths, entries, capped)
    }

    fn files(dir: &str, count: usize) -> impl Iterator<Item = String> + '_ {
        (0..count).map(move |i| format!("{dir}/f{i:05}.ts"))
    }

    /// Past the `maxFiles` maximum no raised bound completes the scan:
    /// re-rooting is the only lead, named workspace-relative.
    #[test]
    fn a_root_over_the_max_files_maximum_offers_only_re_rooting() {
        let temp = tempfile::tempdir().expect("root");
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 50_000))
            .collect::<Vec<_>>();
        let error = refusal(temp.path(), json!({"operation":"cycles"}), &entries, false);
        assert_eq!(error.code, "scopeTooBroad");
        assert!(error.message.contains("re-root"), "{}", error.message);
        assert!(
            error.message.contains("packages/a (3000)") && !error.message.contains("packages/b"),
            "{}",
            error.message
        );
        let next = error.next.expect("continuations");
        assert!(next.get("expandScan").is_none(), "{next}");
        assert_eq!(
            next["narrowScope"]["query"]["queries"][0]["path"], "packages/a",
            "{next}"
        );
    }

    /// Under the maximum the complete route covers every discovered file
    /// and names the root as `.`.
    #[test]
    fn expand_scan_raises_max_files_to_cover_every_discovered_file() {
        let temp = tempfile::tempdir().expect("root");
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 27_000))
            .collect::<Vec<_>>();
        let error = refusal(temp.path(), json!({"operation":"cycles"}), &entries, false);
        let next = error.next.expect("continuations");
        let expand = &next["expandScan"]["query"]["queries"][0];
        assert_eq!(expand["maxFiles"], 30_000, "{next}");
        assert_eq!(expand["path"], ".", "{next}");
    }

    /// A count cut short lists only directories the walk finished: never
    /// the one it stopped in, nor an anchor directory it never reached.
    #[test]
    fn a_capped_count_never_offers_unwalked_directories() {
        let temp = tempfile::tempdir().expect("root");
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 2_500))
            .collect::<Vec<_>>();
        let error = refusal(temp.path(), json!({"operation":"cycles"}), &entries, true);
        assert!(
            error.message.contains("packages/a (3000)") && !error.message.contains("packages/b"),
            "{}",
            error.message
        );
        assert!(error.next.expect("next").get("expandScan").is_none());
        let anchored = refusal(
            temp.path(),
            json!({"operation":"dependents","source":"packages/c/x.ts"}),
            &entries,
            true,
        );
        assert!(
            anchored.message.contains("none below the bound") && !anchored.message.contains("(0)"),
            "{}",
            anchored.message
        );
        assert!(anchored.next.is_none(), "{:?}", anchored.next);
    }

    /// A malformed `exclude` glob is refused like a malformed
    /// `languageGlobs` entry, never silently matched as nothing.
    #[test]
    fn a_malformed_exclude_glob_is_an_invalid_glob_error() {
        let temp = fixture(&[("a.ts", "export const a = 1;\n")]);
        let root = temp.path();
        let error = run(
            json!({"mainGoal":"test","reasoning":"test","operation":"cycles",
                "path":root,"exclude":["[bad"]}),
            root,
        )
        .expect_err("invalid glob");
        assert_eq!(error.code, "invalidGlob", "{}", error.message);
        assert!(error.message.contains("[bad"), "{}", error.message);
    }

    /// The read lead covers the whole import statement, not its first line.
    #[test]
    fn the_read_lead_spans_a_multi_line_import() {
        let temp = fixture(&[
            (
                "a.ts",
                "// a\nimport {\n  b,\n  c,\n} from './b';\nexport const a = b + c;\n",
            ),
            ("b.ts", "export const b = 1;\nexport const c = 2;\n"),
        ]);
        let out = topology(
            temp.path(),
            json!({"operation":"dependents","source":"b.ts"}),
        );
        let row = &out["next"]["read"]["query"]["queries"][0];
        assert_eq!(row["ranges"], json!(["2-5"]), "{out}");
    }

    /// A `path` query names the endpoint missing from the graph, by its
    /// field name (`source`/`target`).
    #[test]
    fn a_path_query_names_the_missing_endpoint() {
        let temp = fixture(&[("a.ts", "export const a = 1;\n")]);
        let root = temp.path();
        let error = run(
            json!({"mainGoal":"test","reasoning":"test","operation":"path",
                "path":root,"source":"a.ts","target":"nope.ts"}),
            root,
        )
        .expect_err("missing target");
        assert_eq!(error.code, "invalidGraphQuery");
        assert!(
            error
                .message
                .starts_with("target is not in the scanned graph: nope.ts"),
            "{}",
            error.message
        );
        assert!(
            !error.message.contains("file and target"),
            "{}",
            error.message
        );
    }
}

/// Coverage that can change an answer, not every gap of the scan: a
/// traversal or path reads part of the graph, so a skipped file or an
/// unlinked import it cannot reach leaves it complete. Cycles and dead code
/// answer for the whole root and keep every gap.
mod answer_scope_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};

    fn big(extension: &str) -> (String, String) {
        let line = if extension == "rs" {
            "pub const BIG: u32 = 1;\n"
        } else {
            "export const big = 1;\n"
        };
        (
            format!("big.{extension}"),
            format!("{line}{}", "// pad\n".repeat(160_000)),
        )
    }

    fn complete(out: &Value) {
        assert!(out.get("isPartial").is_none(), "{out}");
        assert!(out.get("partialReasons").is_none(), "{out}");
        assert!(out.get("terminalLimit").is_none(), "{out}");
        assert!(out.get("confidence").is_none(), "{out}");
        assert_eq!(out["coverage"]["state"], "complete", "{out}");
        assert!(out["coverage"].get("parts").is_none(), "{out}");
    }

    fn skipped(out: &Value) {
        assert_eq!(out["isPartial"], true, "{out}");
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        assert_eq!(out["coverage"]["parts"]["graph"], "files-skipped", "{out}");
    }

    const ENTRY: [(&str, &str); 2] = [
        (
            "entry.ts",
            "import { u } from './util';\nexport const e = u;\n",
        ),
        ("util.ts", "export const u = 1;\n"),
    ];

    #[test]
    fn a_skipped_file_no_traversal_reaches_leaves_it_complete() {
        let temp = fixture(&ENTRY);
        let root = temp.path();
        let (name, text) = big("rs");
        write_file(root, &name, &text);
        for query in [
            json!({"operation":"dependencies","source":"entry.ts"}),
            json!({"operation":"dependents","source":"util.ts"}),
            json!({"operation":"path","source":"entry.ts","target":"util.ts"}),
            json!({"operation":"reachability","entrypoints":["entry.ts"]}),
        ] {
            complete(&topology(root, query));
        }
        // The scan still counts it, and whole-root answers keep the cut.
        let cycles = topology(root, json!({"operation":"cycles"}));
        skipped(&cycles);
        assert_eq!(cycles["coverage"]["diagnosticCounts"]["scan-skip"], 1);
    }

    /// A skipped file of the target's language may import it: dependents
    /// stay partial, while dependencies of a file that does not import it are
    /// complete.
    #[test]
    fn a_skipped_file_that_may_import_the_target_keeps_dependents_partial() {
        let temp = fixture(&ENTRY);
        let root = temp.path();
        let (name, text) = big("ts");
        write_file(root, &name, &text);
        skipped(&topology(
            root,
            json!({"operation":"dependents","source":"util.ts"}),
        ));
        complete(&topology(
            root,
            json!({"operation":"dependencies","source":"entry.ts"}),
        ));
    }

    #[test]
    fn unlinked_imports_no_answer_reaches_leave_it_complete() {
        let temp = fixture(&[
            (
                "src/index.ts",
                "import { u } from './util';\nexport const i = u;\n",
            ),
            ("src/util.ts", "export const u = 1;\n"),
            // Leaves the scan root: it can name no scanned file.
            (
                "tests/a.test.ts",
                "import { g } from '../../test-utils/guard.js';\nexport const t = g;\n",
            ),
            // Names a missing sibling, never src/util.ts.
            (
                "examples/cli.ts",
                "import { x } from './generated';\nexport const c = x;\n",
            ),
        ]);
        let root = temp.path();
        for query in [
            json!({"operation":"dependencies","source":"src/index.ts","graphDepth":3}),
            json!({"operation":"dependents","source":"src/util.ts","graphDepth":3}),
            json!({"operation":"path","source":"src/index.ts","target":"src/util.ts"}),
            // Test files are no roots here, so tests/ and examples/ are
            // unreached: an edge out of them reaches nothing new.
            json!({"operation":"reachability","entrypoints":["src/index.ts"],"includeTests":false}),
        ] {
            let out = topology(root, query);
            complete(&out);
            // The scan's own tallies are unchanged.
            assert_eq!(out["coverage"]["imports"]["unresolvedInternal"], 2, "{out}");
        }
        let cycles = topology(root, json!({"operation":"cycles"}));
        assert_eq!(cycles["confidence"], "low", "{cycles}");
        assert_eq!(
            cycles["coverage"]["parts"]["graph"], "coverage-incomplete",
            "{cycles}"
        );
    }

    /// An unlinked import whose specifier spells the target, or one inside
    /// the files a path walks, still lowers the answer.
    #[test]
    fn unlinked_imports_the_answer_reaches_lower_it() {
        let temp = fixture(&[
            (
                "src/index.ts",
                "import { u } from './util';\nimport { m } from './missing';\nexport const i = [u, m];\n",
            ),
            ("src/util.ts", "export const u = 1;\n"),
            (
                "src/other.ts",
                "import { u } from './util.mjs';\nexport const o = u;\n",
            ),
        ]);
        let root = temp.path();
        for query in [
            json!({"operation":"dependents","source":"src/util.ts"}),
            json!({"operation":"path","source":"src/index.ts","target":"src/util.ts"}),
            json!({"operation":"dependencies","source":"src/index.ts"}),
        ] {
            let out = topology(root, query);
            assert_eq!(out["confidence"], "low", "{out}");
            assert_eq!(
                out["coverage"]["parts"]["graph"], "coverage-incomplete",
                "{out}"
            );
        }
    }
}

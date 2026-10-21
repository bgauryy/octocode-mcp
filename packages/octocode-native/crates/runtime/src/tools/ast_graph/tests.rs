//! astTopology tests: scan widening, unlinked evidence, scope refusal,
//! empty answers, resolution and answer scope.

mod expand_scan_tests {
    use super::super::test_support::*;
    use serde_json::{Value, json};

    #[test]
    fn capped_unscanned_query_endpoints_keep_coverage_and_executable_expansion() {
        let temp = fixture(&[
            (
                "a.ts",
                "import { value } from './z'; export const a = value;\n",
            ),
            ("b.ts", "export const b = 1;\n"),
            ("z.ts", "import { b } from './b'; export const value = b;\n"),
        ]);
        for base in [
            json!({"operation":"dependencies","source":"z.ts"}),
            json!({"operation":"dependents","source":"z.ts"}),
            json!({"operation":"path","source":"a.ts","target":"z.ts"}),
            json!({"operation":"path","source":"z.ts","target":"b.ts"}),
        ] {
            let mut query = base.clone();
            query["maxFiles"] = json!(1);
            let first = topology(&temp.0, query);
            assert_eq!(first["coverage"]["state"], "partial", "{first}");
            assert_eq!(first["isPartial"], true, "{first}");
            assert_ne!(first["status"], "empty", "unscanned is not absent: {first}");
            let mut out = first;
            for _ in 0..5 {
                let Some(next) = out["next"].get("expandScan") else {
                    break;
                };
                out = topology(&temp.0, next["query"]["queries"][0].clone());
            }
            assert!(out["next"].get("expandScan").is_none(), "{out}");
            assert_eq!(out["coverage"]["state"], "complete", "{out}");
            let nodes = out["nodes"].as_array().expect("nodes");
            match base["operation"].as_str().expect("operation") {
                "dependencies" => assert_eq!(nodes[0]["file"], "b.ts", "{out}"),
                "dependents" => assert_eq!(nodes[0]["file"], "a.ts", "{out}"),
                "path" => assert_eq!(nodes[0]["found"], true, "{out}"),
                _ => unreachable!(),
            }
        }
    }

    #[test]
    fn capped_graph_keeps_nonexistent_and_outside_scope_endpoints_invalid() {
        let temp = fixture(&[
            ("scope/a.ts", "export const a = 1;\n"),
            ("scope/b.ts", "export const b = 1;\n"),
            ("outside.ts", "export const outside = 1;\n"),
        ]);
        for source in ["missing.ts", "../outside.ts"] {
            let error = run(
                json!({"operation":"dependencies", "path":temp.0.join("scope"),
                "source":source, "maxFiles":1}),
                &temp.0,
            )
            .expect_err("invalid endpoint");
            assert_eq!(error.code, "invalidGraphQuery", "{error:?}");
        }
    }

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
        let root = temp.0.as_path();
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
        let root = temp.0.as_path();
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

    /// Restores the contract `maxFiles` maximum when a test that lowered it ends.
    struct MaxFilesMaximum;
    impl MaxFilesMaximum {
        fn lower(maximum: u32) -> Self {
            super::super::page::MAX_FILES_MAXIMUM.with(|cell| cell.set(Some(maximum)));
            Self
        }
    }
    impl Drop for MaxFilesMaximum {
        fn drop(&mut self) {
            super::super::page::MAX_FILES_MAXIMUM.with(|cell| cell.set(None));
        }
    }

    /// A scan cut at `maxFiles` is a partial graph, never an empty answer:
    /// the files it did not read may hold the cycle. At the maximum the cut
    /// is terminal and says so; below it `expandScan` reaches the rest.
    #[test]
    fn a_scan_cut_graph_is_partial_never_empty() {
        let temp = fixture(&[
            ("a.ts", "export const a = 1;\n"),
            ("b.ts", "export const b = 1;\n"),
            ("c.ts", "export const c = 1;\n"),
        ]);
        let root = temp.0.as_path();
        let _maximum = MaxFilesMaximum::lower(2);
        let widenable = topology(root, json!({"operation":"cycles","maxFiles":1}));
        let terminal = topology(root, json!({"operation":"cycles","maxFiles":2}));
        for (out, is_terminal) in [(&widenable, false), (&terminal, true)] {
            assert!(out.get("status").is_none(), "{out}");
            assert_eq!(out["isPartial"], true, "{out}");
            assert_eq!(out["partialReasons"], json!(["maxFiles"]), "{out}");
            assert_eq!(out["coverage"]["state"], "partial", "{out}");
            assert_eq!(out["terminalLimit"] == true, is_terminal, "{out}");
            assert_eq!(
                out["next"].get("expandScan").is_some(),
                !is_terminal,
                "{out}"
            );
        }
        assert!(
            terminal["warnings"].to_string().contains("terminal"),
            "the terminal cut is named: {terminal}"
        );
    }

    fn drift_fixture() -> Fixture {
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
        let root = temp.0.as_path();
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

    /// A diff of two scan-cut graphs proves nothing about the files neither
    /// read: it is partial, never an empty answer. Identical trees give an
    /// empty diff, so only the cut can tell the two apart.
    #[test]
    fn a_scan_cut_drift_is_partial_never_empty() {
        let same = [
            ("a.ts", "export const a = 1;\n"),
            ("b.ts", "export const b = 1;\n"),
            ("c.ts", "export const c = 1;\n"),
        ];
        let files: Vec<(String, &str)> = ["base", "head"]
            .iter()
            .flat_map(|dir| {
                same.iter()
                    .map(move |(name, body)| (format!("{dir}/{name}"), *body))
            })
            .collect();
        let borrowed: Vec<(&str, &str)> = files.iter().map(|(n, b)| (n.as_str(), *b)).collect();
        let temp = fixture(&borrowed);
        let root = temp.0.as_path();
        let uncut = topology(root, drift_query(root, 100));
        assert_eq!(
            uncut["status"], "empty",
            "an uncut equal diff is empty: {uncut}"
        );
        let _maximum = MaxFilesMaximum::lower(2);
        for (max_files, is_terminal) in [(1, false), (2, true)] {
            let out = topology(root, drift_query(root, max_files));
            assert!(out.get("status").is_none(), "{out}");
            assert_eq!(out["isPartial"], true, "{out}");
            assert_eq!(out["terminalLimit"] == true, is_terminal, "{out}");
        }
    }

    /// A drift that skipped a file or hit the edge cap has no continuation
    /// that reaches the rest: it is a terminal limit, never complete.
    #[test]
    fn a_drift_cut_without_a_continuation_is_terminal() {
        let temp = drift_fixture();
        let root = temp.0.as_path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        temp.write("head/big.ts", &big);
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
        let root = temp.0.as_path();
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

    /// A scan note holds for the whole answer: the first page states it,
    /// and later pages carry only the cut in their coverage.
    #[test]
    fn a_scan_cut_note_is_stated_on_the_first_page_only() {
        let temp = fixture(&[
            ("a.ts", "export const a = 1\n"),
            ("b.ts", "export const b = 1\n"),
            ("c.ts", "export const c = 1\n"),
            ("d.ts", "export const d = 1\n"),
        ]);
        let root = temp.0.as_path();
        let first = topology(
            root,
            json!({"operation":"reachability","entrypoints":["a.ts"],"maxFiles":3,"pageSize":1}),
        );
        let note = |page: &Value| {
            page["warnings"].as_array().is_some_and(|notes| {
                notes
                    .iter()
                    .any(|note| note.as_str().is_some_and(|note| note.contains("maxFiles")))
            })
        };
        assert!(note(&first), "{first}");
        let next = first["next"]["nextPage"]["query"]["queries"][0].clone();
        let second = run(next, root).expect("page 2");
        assert!(!note(&second), "{second}");
        assert_eq!(second["coverage"]["state"], "partial", "{second}");
    }

    /// `coverage.state` and `isPartial` are one fact: a payload is never
    /// `isPartial` beside a `complete` coverage. The skipped-file limit is
    /// the `filesSkipped` reason plus `terminalLimit`; the tool description
    /// explains it once, so no row repeats it as a warning.
    #[test]
    fn a_skipped_file_is_partial_in_coverage_and_flagged_terminal() {
        let temp = fixture(&[("entry.ts", "export const entry = 1;\n")]);
        let root = temp.0.as_path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        temp.write("big.ts", big);

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
        let root = temp.0.as_path();
        let big = format!("export const big = 1\n{}", "// pad\n".repeat(160_000));
        temp.write("head/big.ts", &big);
        let out = topology(root, drift_query(root, 100));
        assert_eq!(out["isPartial"], true, "{out}");
        assert_eq!(out["coverage"]["state"], "partial", "{out}");
        assert_eq!(out["coverage"]["parts"]["graph"], "files-skipped", "{out}");
        assert_eq!(out["terminalLimit"], true, "{out}");
        assert_eq!(out["partialReasons"], json!(["filesSkipped"]), "{out}");
    }

    #[test]
    fn the_result_page_ceiling_is_explained_as_terminal() {
        let temp = Fixture::new();
        let root = temp.0.as_path();
        for i in 0..1001 {
            temp.write(&format!("f{i:04}.ts"), "export const value = 1;\n");
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

    /// A diagnostic page past the end is the shared out-of-range outcome:
    /// empty, flagged `outOfRange` at the requested page (never moved back
    /// to the last page, which would repeat rows the caller has), with a
    /// restart that rereads from the first diagnostic page.
    #[test]
    fn a_diagnostic_page_past_the_end_is_empty_and_restarts() {
        let temp = fixture(&[
            ("a.ts", "import './missing-a';\nexport const a = 1;\n"),
            ("b.ts", "import './missing-b';\nexport const b = 1;\n"),
        ]);
        let root = temp.0.as_path();
        let query =
            |page: u32| json!({"operation":"cycles","diagnosticPage":page,"diagnosticPageSize":1});
        let first = topology(root, query(1));
        let rows = first["coverage"]["diagnostics"].as_array().expect("rows");
        assert_eq!(rows.len(), 1, "{first}");
        let pages = first["coverage"]["diagnosticPagination"]["totalPages"]
            .as_u64()
            .expect("more than one diagnostic page");
        assert!(pages >= 2, "{first}");

        let past = topology(root, query(pages as u32 + 1));
        assert!(past["coverage"].get("diagnostics").is_none(), "{past}");
        let block = &past["coverage"]["diagnosticPagination"];
        assert_eq!(block["currentPage"], pages + 1, "{past}");
        assert_eq!(block["totalPages"], pages, "{past}");
        assert_eq!(block["outOfRange"], true, "{past}");
        let restart = &past["next"]["restartDiagnostics"]["query"]["queries"][0];
        assert_eq!(restart["diagnosticPage"], 1, "{past}");
        let warnings = past["warnings"].to_string();
        assert!(
            warnings.contains(&format!("page {} of {pages}", pages + 1)),
            "{past}"
        );
        assert!(!warnings.contains("returned diagnostic page"), "{past}");
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
        let root = temp.0.as_path();
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
        // An unanchored query re-roots at either admissible package; one
        // anchored on a file only at the directory that holds it.
        for (query, narrowing) in [
            (
                json!({"operation":"cycles","path":root.0.as_path()}),
                vec!["narrowScope", "narrowScope2"],
            ),
            (
                json!({"operation":"deadCode","path":root.0.as_path(),"entrypoints":["packages/small/f0.ts"]}),
                vec!["narrowScope"],
            ),
        ] {
            let operation = query["operation"].clone();
            let error = run(query, root.0.as_path()).expect_err("scope refused");
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
            let expected: Vec<&str> = ["expandScan"].into_iter().chain(narrowing).collect();
            assert_eq!(order, expected, "{operation}");
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

    fn leaf_fixture() -> Fixture {
        fixture(&[
            ("a.ts", "export const a = 1;\n"),
            ("b.ts", "export const b = 2;\n"),
        ])
    }

    #[test]
    fn every_operation_with_no_answer_rows_is_empty() {
        let temp = leaf_fixture();
        let root = temp.0.as_path();
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
            temp.0.as_path(),
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
        let root = temp.0.as_path();
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
        let root = temp.0.as_path();
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
        let scan = temp.0.as_path().join("packages");
        let out = topology(
            temp.0.as_path(),
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
            temp.0.as_path(),
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
        let out = topology(temp.0.as_path(), query.clone());
        let imports = &out["coverage"]["imports"];
        assert_eq!(imports["unresolvedInternal"], 2, "{out}");
        assert_eq!(imports["resolved"], 1, "{out}");
        assert_eq!(imports["unit"], "statements", "{out}");
        let rows = diagnostic_rows(temp.0.as_path(), &temp.0.as_path().to_string_lossy(), query);
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
            temp.0.as_path(),
            &temp.0.as_path().to_string_lossy(),
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
            temp.0.as_path(),
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
            temp.0.as_path(),
            json!({"operation":"dependencies","source":"examples/user-cli.ts"}),
        );
        assert_eq!(affected["confidence"], "low", "{affected}");
        // `./generated` from examples/ cannot name src/util.ts: no importer
        // of it is lost. A whole-graph answer keeps the gap.
        let dependents = topology(
            temp.0.as_path(),
            json!({"operation":"dependents","source":"src/util.ts"}),
        );
        assert!(dependents.get("confidence").is_none(), "{dependents}");
        let cycles = topology(temp.0.as_path(), json!({"operation":"cycles"}));
        assert_eq!(cycles["confidence"], "low", "{cycles}");
    }

    /// A found path is proven: only an unlinked import out of a file nearer
    /// the source than the path's next-to-last step could make a shorter
    /// one. A direct edge, or a path whose near files linked every import,
    /// is not low; a path not found keeps every reachable gap.
    #[test]
    fn a_found_path_is_low_only_when_a_gap_could_shorten_it() {
        let temp = fixture(&[
            (
                "a.ts",
                "import { b } from './b';\nimport { g } from './gone';\nexport const a = b + g;\n",
            ),
            (
                "b.ts",
                "import { c } from './c';\nimport { h } from './lost';\nexport const b = c + h;\n",
            ),
            ("c.ts", "import { d } from './d';\nexport const c = d;\n"),
            ("d.ts", "export const d = 1;\n"),
            ("e.ts", "export const e = 1;\n"),
        ]);
        let root = temp.0.as_path();
        let path = |source: &str, target: &str| {
            topology(
                root,
                json!({"operation":"path","source":source,"target":target}),
            )
        };
        let direct = path("a.ts", "b.ts");
        assert_eq!(direct["nodes"][0]["found"], true, "{direct}");
        assert!(direct.get("confidence").is_none(), "{direct}");
        // b.ts -> c.ts -> d.ts: only b.ts could shortcut it, and b.ts has a
        // gap; c.ts -> d.ts from c.ts is direct.
        assert_eq!(path("b.ts", "d.ts")["confidence"], "low");
        assert!(path("c.ts", "d.ts").get("confidence").is_none());
        // a.ts -> b.ts -> c.ts: a.ts's unlinked import could name c.ts.
        assert_eq!(path("a.ts", "c.ts")["confidence"], "low");
        let missing = path("a.ts", "e.ts");
        assert_eq!(missing["nodes"][0]["found"], false, "{missing}");
        assert_eq!(missing["confidence"], "low", "{missing}");
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
        let out = topology(temp.0.as_path(), json!({"operation":"cycles"}));
        let group = &out["nodes"][0];
        assert_eq!(group["fileCount"], 3, "{out}");
        // The runtime cycle is this static group with the same witness: it
        // is stated once, by `sameAsStatic`, not copied.
        assert_eq!(group["sameAsStatic"], true, "{out}");
        assert!(group.get("runtimeGroups").is_none(), "{out}");
        assert!(group.get("runtimeCycleEdges").is_none(), "{out}");
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
        let out = topology(temp.0.as_path(), json!({"operation":"reachability"}));
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
        let out = topology(temp.0.as_path(), json!({"operation":"reachability"}));
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
        let root = temp.0.as_path();
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
        let root = temp.0.as_path();
        temp.write("base/bad.ts", [0xff]);
        temp.write("head/bad.ts", [0xff]);
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
        let temp = Fixture::new();
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 50_000))
            .collect::<Vec<_>>();
        let error = refusal(
            temp.0.as_path(),
            json!({"operation":"cycles"}),
            &entries,
            false,
        );
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
        let temp = Fixture::new();
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 27_000))
            .collect::<Vec<_>>();
        let error = refusal(
            temp.0.as_path(),
            json!({"operation":"cycles"}),
            &entries,
            false,
        );
        let next = error.next.expect("continuations");
        let expand = &next["expandScan"]["query"]["queries"][0];
        assert_eq!(expand["maxFiles"], 30_000, "{next}");
        assert_eq!(expand["path"], ".", "{next}");
    }

    /// Every admissible root the refusal names is one executable re-rooting,
    /// in the message's order (largest first), bounded like the message; a
    /// directory over the admission bound is neither named nor offered.
    #[test]
    fn scope_too_broad_offers_one_re_rooting_per_admissible_directory() {
        let temp = Fixture::new();
        let dirs = [("d0", 2_000), ("d1", 3_000), ("d2", 2_500), ("big", 30_000)];
        let entries = dirs
            .iter()
            .flat_map(|(dir, count)| files(dir, *count))
            .chain(files("d3", 1_000))
            .chain(files("d4", 900))
            .chain(files("d5", 800))
            .chain(files("d6", 700))
            .collect::<Vec<_>>();
        let error = refusal(
            temp.0.as_path(),
            json!({"operation":"cycles"}),
            &entries,
            false,
        );
        let next = error.next.expect("continuations");
        let offered: Vec<(String, String)> = next
            .as_object()
            .expect("next map")
            .iter()
            .filter(|(name, _)| name.starts_with("narrowScope"))
            .map(|(name, call)| {
                (
                    name.clone(),
                    call["query"]["queries"][0]["path"]
                        .as_str()
                        .expect("path")
                        .to_owned(),
                )
            })
            .collect();
        let expected = ["d1", "d2", "d0", "d3", "d4"];
        assert_eq!(
            offered
                .iter()
                .map(|(_, path)| path.as_str())
                .collect::<Vec<_>>(),
            expected,
            "{next}"
        );
        assert_eq!(
            offered
                .iter()
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>(),
            [
                "narrowScope",
                "narrowScope2",
                "narrowScope3",
                "narrowScope4",
                "narrowScope5"
            ],
        );
        for dir in expected {
            assert!(
                error.message.contains(&format!("{dir} (")),
                "{}",
                error.message
            );
        }
        assert!(!error.message.contains("big") && !error.message.contains("d5"));
    }

    /// A count cut short lists only directories the walk finished: never
    /// the one it stopped in, nor an anchor directory it never reached.
    #[test]
    fn a_capped_count_never_offers_unwalked_directories() {
        let temp = Fixture::new();
        let entries = files("packages/a", 3_000)
            .chain(files("packages/b", 2_500))
            .collect::<Vec<_>>();
        let error = refusal(
            temp.0.as_path(),
            json!({"operation":"cycles"}),
            &entries,
            true,
        );
        assert!(
            error.message.contains("packages/a (3000)") && !error.message.contains("packages/b"),
            "{}",
            error.message
        );
        assert!(error.next.expect("next").get("expandScan").is_none());
        let anchored = refusal(
            temp.0.as_path(),
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
        let root = temp.0.as_path();
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
            temp.0.as_path(),
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
        let root = temp.0.as_path();
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
        let root = temp.0.as_path();
        let (name, text) = big("rs");
        temp.write(&name, &text);
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
        let root = temp.0.as_path();
        let (name, text) = big("ts");
        temp.write(&name, &text);
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
        let root = temp.0.as_path();
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
    /// the files a traversal reads, still lowers the answer. (A found path
    /// is lowered only by a gap that could shorten it:
    /// `a_found_path_is_low_only_when_a_gap_could_shorten_it`.)
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
        let root = temp.0.as_path();
        for query in [
            json!({"operation":"dependents","source":"src/util.ts"}),
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

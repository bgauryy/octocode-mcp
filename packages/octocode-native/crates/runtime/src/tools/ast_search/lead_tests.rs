//! Every lead astSearch hands out validates against the contract and runs
//! without an error: a hint that loops into another error is a bug.
use super::{AstSearchQuery, execute_ast};
use crate::tools::cancel::NeverCancel;
use crate::tools::test_support::{Fixture, simple_policy};
use serde_json::{Value, json};

/// The astSearch calls a result's (or error's) `next` leads name. A lead
/// for another tool must still validate against that tool's contract.
fn leads(next: Option<&Value>) -> Vec<(String, Value)> {
    let mut found = Vec::new();
    for (name, call) in next.and_then(Value::as_object).into_iter().flatten() {
        let tool = call["tool"].as_str().expect("a lead names its tool");
        if tool == "astSearch" {
            found.push((name.clone(), call["query"].clone()));
        } else {
            crate::contracts::validate(tool, call["query"].clone()).unwrap_or_else(|error| {
                panic!(
                    "lead {name} for {tool} invalid {}: {:?}",
                    call["query"], error.issues
                )
            });
        }
    }
    found
}

/// Runs `row`, then follows every lead it names (and theirs) to `depth`,
/// asserting each validates and succeeds. Returns the calls it ran.
fn follow(root: &std::path::Path, row: Value, depth: usize) -> usize {
    let (paths, security) = simple_policy(root);
    let mut pending = vec![("start".to_owned(), json!({"queries": [row]}))];
    let mut ran = 0;
    for _ in 0..=depth {
        let mut next_pending = Vec::new();
        for (name, input) in pending.drain(..) {
            crate::contracts::validate("astSearch", input.clone())
                .unwrap_or_else(|error| panic!("lead {name} invalid {input}: {:?}", error.issues));
            for row in input["queries"].as_array().expect("rows") {
                let query: AstSearchQuery = serde_json::from_value(row.clone()).expect("typed row");
                ran += 1;
                match execute_ast(&query, &paths, &security, &NeverCancel, None) {
                    Ok(out) => {
                        assert!(out.get("errorCode").is_none(), "{name} -> {out}");
                        next_pending.extend(leads(out.get("next")));
                    }
                    Err(error) => {
                        panic!("lead {name} {row} failed: {error:?}")
                    }
                }
            }
        }
        pending = next_pending;
    }
    ran
}

/// A directory with no file of the requested language leads to a query that
/// runs; removing a language a directory needs is not that.
#[test]
fn empty_language_lead_runs() {
    let root = Fixture::new();
    std::fs::write(root.0.join("a.rs"), "fn a() { hit(1); }\n").expect("a");
    std::fs::write(root.0.join("b.ts"), "hit(2);\n").expect("b");
    let ran = follow(
        &root.0,
        json!({"operation":"match","path":root.0,"language":"python","pattern":"hit($A)"}),
        2,
    );
    assert!(ran >= 1);
}

/// More candidate grammars than a batch may hold still give a repair that
/// validates and runs, and the message names every candidate.
#[test]
fn language_repair_stays_within_the_batch_limit() {
    let root = Fixture::new();
    for (name, source) in [
        ("a.rs", "fn a() { hit(1); }\n"),
        ("b.ts", "hit(2);\n"),
        ("c.py", "hit(3)\n"),
        ("d.js", "hit(4);\n"),
        ("e.java", "class E { void e() { hit(5); } }\n"),
        ("f.go", "package f\nfunc f() { hit(6) }\n"),
        ("g.cs", "class G { void G() { hit(7); } }\n"),
        ("h.cpp", "void h() { hit(8); }\n"),
    ] {
        std::fs::write(root.0.join(name), source).expect("source");
    }
    let (paths, security) = simple_policy(&root.0);
    let query: AstSearchQuery =
        serde_json::from_value(json!({"operation":"match","path":root.0,"pattern":"hit($A)"}))
            .expect("row");
    let error = execute_ast(&query, &paths, &security, &NeverCancel, None).expect_err("several");
    assert_eq!(error.code, "languageRequired", "{error:?}");
    let repair = leads(error.next.as_deref());
    assert_eq!(repair.len(), 1, "{error:?}");
    let rows = repair[0].1["queries"].as_array().expect("rows").len();
    assert!(rows >= 1, "{error:?}");
    crate::contracts::validate("astSearch", repair[0].1.clone()).expect("repair validates");
    follow(&root.0, repair[0].1["queries"][0].clone(), 1);
}

/// A battery of real astSearch calls: every lead any of them hands out (page,
/// scan, capture, syntax-tree and text leads, to three hops) validates and
/// runs without error.
#[test]
fn every_lead_of_a_battery_of_calls_validates_and_runs() {
    let root = Fixture::new();
    for index in 0..6 {
        let calls = (0..4)
            .map(|call| format!("hit({index}{call});\n"))
            .collect::<String>();
        std::fs::write(
            root.0.join(format!("f{index}.ts")),
            format!("export class C{index} extends Base {{ run() {{ {calls} }} }}\n{calls}"),
        )
        .expect("source");
    }
    let dir = root.0.to_string_lossy().into_owned();
    let file = root.0.join("f0.ts").to_string_lossy().into_owned();
    let rows = [
        json!({"operation":"match","path":dir,"language":"typescript","pattern":"hit($A)","pageSize":2,"matchPageSize":3}),
        json!({"operation":"match","path":dir,"language":"typescript","pattern":"hit($A)","maxFiles":2}),
        json!({"operation":"match","path":dir,"language":"typescript","pattern":"hit($A)","captureText":false,"matchContentLength":4}),
        json!({"operation":"match","path":dir,"language":"typescript","pattern":"nothing($A)"}),
        json!({"operation":"match","path":dir,"language":"typescript","rule":{"pattern":"hit($A)"},"pageSize":1}),
        json!({"operation":"symbols","path":dir,"pageSize":3}),
        json!({"operation":"symbols","path":dir,"symbolName":"C1","maxFiles":2}),
        json!({"operation":"symbols","path":file}),
        json!({"operation":"syntaxTree","path":file,"pageSize":5}),
    ];
    for row in rows {
        follow(&root.0, row, 3);
    }
}

/// Files an empty scan skipped (ignored, hidden, default-excluded) lead to a
/// query that finds them.
#[test]
fn leads_over_skipped_files_validate_and_find_them() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".git")).expect("git dir");
    std::fs::write(root.0.join(".gitignore"), "gen/\n").expect("gitignore");
    for dir in ["gen", ".cfg", "node_modules/pkg"] {
        std::fs::create_dir_all(root.0.join(dir)).expect("dir");
        std::fs::write(
            root.0.join(dir).join("a.py"),
            "def skipped():\n    hit(1)\n",
        )
        .expect("source");
    }
    let row = json!({"operation":"match","path":root.0,"language":"python","pattern":"hit($A)"});
    let ran = follow(&root.0, row, 2);
    assert!(ran >= 2, "the empty call and its lead both ran");
}

/// Runs one astSearch row and returns its (first) result value.
fn run(root: &std::path::Path, row: Value) -> Value {
    let (paths, security) = simple_policy(root);
    let query: AstSearchQuery = serde_json::from_value(row).expect("typed row");
    execute_ast(&query, &paths, &security, &NeverCancel, None).expect("runs")
}

/// A diagnosis respects the query's `include`: `.spin/` holds python too, but
/// the filter is `.github/**`, so the hint names `.github/` alone, and the
/// repair does not offer languages that occur only outside the filter.
#[test]
fn skipped_hint_respects_the_query_include() {
    let root = Fixture::new();
    for dir in [".spin", ".github"] {
        std::fs::create_dir_all(root.0.join(dir)).expect("dir");
        std::fs::write(root.0.join(dir).join("a.py"), "class E(Exception): pass\n")
            .expect("source");
    }
    std::fs::write(root.0.join("lib.cpp"), "void f() {}\n").expect("cpp");
    std::fs::write(root.0.join("app.js"), "function f() {}\n").expect("js");
    let out = run(
        &root.0,
        json!({"operation":"match","path":root.0,"include":[".github/**"],"language":"python",
               "pattern":"class $N(Exception): $$$B"}),
    );
    let hint = out["hints"][0].as_str().expect("hint");
    assert!(hint.contains("hidden .github/"), "{hint}");
    assert!(!hint.contains(".spin"), "{hint}");
    assert!(out["next"].get("repair").is_none(), "{out}");
    let lead = &out["next"]["includeSkipped"]["query"]["queries"][0];
    assert_eq!(lead["includeHidden"], json!(true), "{out}");
    assert_eq!(lead["include"], json!([".github/**"]), "{out}");
}

/// Hidden files outside the query's `include` are not a reason for an empty
/// result: no lead, no hidden claim.
#[test]
fn skipped_files_outside_the_include_are_not_named() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".spin")).expect("dir");
    std::fs::create_dir_all(root.0.join("src")).expect("dir");
    std::fs::write(root.0.join(".spin/a.py"), "def a(): pass\n").expect("source");
    std::fs::write(root.0.join("src/b.js"), "function b() {}\n").expect("source");
    let out = run(
        &root.0,
        json!({"operation":"match","path":root.0,"include":["src/**"],"language":"python","pattern":"def $N(): pass"}),
    );
    let hint = out["hints"][0].as_str().expect("hint");
    assert!(!hint.contains("skipped as"), "{hint}");
    assert!(out["next"].get("includeSkipped").is_none(), "{out}");
}

/// An empty match names what it searched: the files parsed and the grammar,
/// as `filesScanned` and in the hint, for a pattern and for a rule alike.
#[test]
fn an_empty_match_reports_the_files_it_parsed_and_the_grammar() {
    let root = Fixture::new();
    for name in ["a.ts", "b.ts", "c.ts"] {
        std::fs::write(root.0.join(name), "export const a = 1;\n").expect("source");
    }
    for (query, shape) in [
        (json!({"pattern":"zzNoSuch($$$A)"}), "whole nodes"),
        (
            json!({"rule":{"pattern":"zzNoSuch($$$A)"}}),
            "astSearch operation:\"syntaxTree\"",
        ),
    ] {
        let mut row = json!({"operation":"match","path":root.0,"language":"typescript"});
        row.as_object_mut()
            .expect("object")
            .extend(query.as_object().expect("object").clone());
        let out = run(&root.0, row);
        assert_eq!(out["status"], "empty", "{out}");
        assert_eq!(out["filesScanned"], json!(3), "{out}");
        let hint = out["hints"][0].as_str().expect("hint");
        assert!(
            hint.starts_with("0 matches in 3 typescript files."),
            "{hint}"
        );
        assert!(hint.contains(shape), "{hint}");
    }
}

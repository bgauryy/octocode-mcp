//! astSearch patterns and rules: compile errors, relaxed retries, rule
//! spellings, and syntax-tree error rows.
use super::test_rows::*;
use crate::tools::cancel::NeverCancel;
use crate::tools::test_support::{Fixture, checks, simple_policy};
use serde_json::json;
use std::path::PathBuf;

#[test]
fn structural_zero_is_empty_with_actionable_pattern_guidance() {
    let root = Fixture::new();
    let source = root.0.join("source.ts");
    std::fs::write(&source, "const answer = 42;\n").expect("source");
    let (paths, security) = simple_policy(&root.0);

    let missing = execute_row(
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source,"pattern":"let $A = $B"}),
        &paths,
        &security,
        &NeverCancel,
    )
    .expect("structural zero");
    assert_eq!(missing["status"], "empty", "{missing}");
    assert!(
        !missing["isPartial"].as_bool().unwrap_or(false),
        "{missing}"
    );
    // The per-call fact only; the node shape is the viewTree lead.
    assert_eq!(
        missing["hints"],
        json!(["0 matches in 1 typescript file."]),
        "{missing}"
    );
    assert_eq!(
        missing["next"]["viewTree"]["query"]["queries"][0]["operation"], "syntaxTree",
        "{missing}"
    );

    // Trailing punctuation the pattern omits is not required (ast-grep
    // smart strictness, as astRewrite matches).
    for pattern in ["const $A = $B;", "const $A = $B"] {
        let found = execute_row(
            json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source,"pattern":pattern}),
            &paths,
            &security,
            &NeverCancel,
        )
        .expect("structural match");
        assert_eq!(found["matchCount"], 1, "{found}");
        assert!(found.get("status").is_none(), "{found}");
    }
}

#[test]
fn an_unparseable_pattern_reports_untagged_text() {
    let root = Fixture::new();
    let source = root.0.join("a.rs");
    std::fs::write(&source, "fn a() {}\n").expect("a");
    for path in [source.clone(), root.0.clone()] {
        let error = run(
            &root.0,
            json!({"operation":"match","mainGoal":"test","reasoning":"test","path":path,"language":"rust","pattern":"neu("}),
        )
        .expect_err("invalid pattern");
        assert_eq!(error.code, "invalidPattern");
        assert!(!error.message.starts_with('['), "{}", error.message);
    }
}

/// A syntax tree of a file with no registered grammar is a failed row
/// (`status: "error"`, a declared code, the engine's message), not a partial
/// payload that exits 0.
#[test]
fn syntax_tree_of_an_unsupported_file_is_an_error_row() {
    let root = Fixture::new();
    let file = root.0.join("data.json");
    std::fs::write(&file, "{\"a\":1}\n").expect("file");
    let out = run(&root.0, json!({"operation":"syntaxTree","path":file})).expect("row");
    assert_eq!(out["status"], "error", "{out}");
    assert_eq!(out["errorCode"], "languageUnsupported", "{out}");
    assert!(
        out["error"]
            .as_str()
            .is_some_and(|message| message.contains(".json")),
        "{out}"
    );
    assert!(out.get("isPartial").is_none(), "{out}");
}

/// A failed inspection states its error once: the row carries no empty
/// page, no snapshot, no single-page block and no diagnostics that repeat
/// `error`, and no recovery text about paging.
#[test]
fn syntax_tree_error_row_states_the_error_once() {
    let root = Fixture::new();
    let file = root.0.join("data.json");
    std::fs::write(&file, "{\"a\":1}\n").expect("file");
    let out = run(&root.0, json!({"operation":"syntaxTree","path":file})).expect("row");
    let mut keys: Vec<&str> = out
        .as_object()
        .expect("row")
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        ["error", "errorCode", "operation", "path", "status"],
        "{out}"
    );
    checks::assert_absent(&out, "next page");
}

#[test]
fn directory_pattern_that_compiles_in_no_file_is_an_error_not_empty() {
    let root = Fixture::new();
    for name in ["a.rs", "b.rs"] {
        std::fs::write(root.0.join(name), "fn main() {}\n").expect("file");
    }
    let error = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":root.0,"language":"rust","pattern":"fn ???"}),
    )
    .expect_err("uncompilable pattern must fail loudly");
    assert_eq!(error.code, "invalidPattern");
}

#[test]
fn patterns_without_metavariables_offer_no_capture_expansion() {
    let root = Fixture::new();
    let source = root.0.join("calls.ts");
    std::fs::write(&source, "oldCall(one);\n").expect("source");
    let out = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source,"pattern":"oldCall(one)"}),
    )
    .expect("match");
    assert_eq!(
        out["files"][0]["matches"][0],
        json!({"line":1,"column":1,"value":"oldCall(one)"}),
        "{out}"
    );
    assert!(
        out.get("next")
            .is_none_or(|next| next.get("expandCaptures").is_none()),
        "{out}"
    );
}

#[test]
fn rust_item_pattern_without_visibility_also_matches_pub_items() {
    let root = Fixture::new();
    let source = root.0.join("lib.rs");
    std::fs::write(
        &source,
        "pub fn a() -> Result<u8, String> { Ok(1) }\nfn b() -> Result<u8, String> { Ok(2) }\n",
    )
    .expect("source");
    let relaxed = |out: &serde_json::Value| {
        out["diagnostics"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|d| d["code"] == "structural.pattern.relaxed" && d["severity"] == "warning")
    };
    // ast-grep reads the visibility modifier as a named child, so `fn` alone
    // skips `pub fn`; the result also runs the visible spelling and says so.
    let out = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source,
            "pattern":"fn $N() -> Result<$T, String> { $$$B }"}),
    )
    .expect("match");
    assert_eq!(out["matchCount"], 2, "{out}");
    assert!(relaxed(&out), "{out}");
    checks::assert_absent(&out, "visibilityExact");
    // A pattern that already names the visibility is run as written.
    let out = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source,
            "pattern":"pub fn $N() -> Result<$T, String> { $$$B }"}),
    )
    .expect("match");
    assert_eq!(out["matchCount"], 1, "{out}");
    assert!(!relaxed(&out), "{out}");
}

/// A rule that does not parse as a rule (an unknown key, malformed YAML) is
/// `invalidPattern` with no lead: the message names the key, and no syntax
/// tree shows a rule's keys. A rule naming a kind this grammar lacks, or a
/// pattern that does not compile, still leads to the file's syntax tree,
/// where its node shapes are read.
#[test]
fn rule_parse_errors_carry_no_tree_lead() {
    let root = Fixture::new();
    let source = root.0.join("lib.rs");
    std::fs::write(&source, "fn a() {}\n").expect("source");
    for rule in ["rule:\n  kindx: function_item\n", "pattern: [\nnot: yaml"] {
        for path in [&source, &root.0] {
            let error = run(
                &root.0,
                json!({"operation":"match","mainGoal":"test","reasoning":"test","path":path,
                    "language":"rust","rule":rule}),
            )
            .expect_err("invalid rule");
            assert_eq!(error.code, "invalidPattern", "{rule}: {error:?}");
            assert!(error.message.contains("invalid rule YAML"), "{error:?}");
            assert!(!error.message.starts_with('['), "{error:?}");
            assert!(error.hints.is_empty(), "{error:?}");
            assert!(error.next.is_none(), "{rule}: {error:?}");
        }
    }
    // Without language, a rule no grammar parses is the rule's error, never
    // a choice between the directory's grammars.
    root.write("b.py", "def b(): pass\n");
    let error = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":root.0,
            "rule":"kindx: function_item"}),
    )
    .expect_err("invalid rule");
    assert_eq!(error.code, "invalidPattern", "{error:?}");
    assert!(error.message.contains("unknown field `kindx`"), "{error:?}");
    assert!(error.next.is_none(), "{error:?}");
    for query in [
        json!({"rule":"kind: not_a_real_kind"}),
        json!({"pattern":"fn ???"}),
    ] {
        let mut row =
            json!({"operation":"match","mainGoal":"test","reasoning":"test","path":source});
        row.as_object_mut()
            .expect("object")
            .extend(query.as_object().expect("object").clone());
        let error = run(&root.0, row).expect_err("does not compile");
        assert_eq!(error.code, "invalidPattern", "{error:?}");
        let next = error.next.as_ref().expect("viewTree");
        assert_eq!(
            next["viewTree"]["query"]["queries"][0]["path"],
            json!(source.canonicalize().expect("source").to_string_lossy()),
            "{next}"
        );
    }
}

/// A pattern the grammar cannot parse fails before any prefilter: a
/// directory where no file holds the anchor must not report `complete` and
/// empty for `foo(`.
#[test]
fn invalid_pattern_is_an_error_even_when_every_file_is_prefiltered() {
    let root = Fixture::new();
    root.write("a.ts", "const value = 1;\n");
    let error = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":root.0,"language":"typescript","pattern":"foo("}),
    )
    .expect_err("an unparseable pattern must fail loudly");
    // The response stage attaches the repair hint for this code.
    assert_eq!(error.code, "invalidPattern", "{error:?}");
}

/// A continuation copies an object rule exactly as written, and it parses
/// as a typed row.
#[test]
fn a_rule_object_continues_as_written() {
    let root = Fixture::new();
    root.write("lib.rs", "fn a() { unsafe { Pin::new_unchecked(&mut x); } }\nfn b() { Pin::new_unchecked(&mut y); }\n");
    let rule = json!({"pattern":"Pin::new_unchecked($A)","not":{"inside":{"kind":"unsafe_block","stopBy":"end"}}});
    // A short value cut hides the capture, so the page offers expandCaptures.
    let object = run(
        &root.0,
        json!({"operation":"match","mainGoal":"test","reasoning":"test","path":root.0,"language":"rust","matchContentLength":12,"rule":rule}),
    )
    .expect("object rule");
    let continuation = object["next"]["expandCaptures"]["query"]["queries"][0].clone();
    assert_eq!(continuation["rule"], rule, "{object}");
    assert!(
        serde_json::from_value::<super::AstSearchQuery>(continuation).is_ok(),
        "the continuation parses as a typed row"
    );
}

/// Matches inside a `macro_rules!` template body are listed (no
/// silent omission behind `complete:true`).
#[test]
fn macro_rules_template_bodies_are_listed() {
    let root = Fixture::new();
    root.write("m.rs", "macro_rules! get {\n    ($e:expr) => {\n        config.value.unwrap()\n    };\n}\nfn main() {\n    other.unwrap();\n}\n");
    let out = run(
        &root.0,
        json!({"operation":"match","path":root.0,"language":"rust","pattern":"$X.unwrap()"}),
    )
    .expect("match");
    let lines = out["files"][0]["matches"]
        .as_array()
        .map(|rows| rows.iter().map(|row| lean_row(row).0).collect::<Vec<_>>())
        .unwrap_or_default();
    assert_eq!(lines, [3, 7], "{out}");
}

/// Every spelling of one rule selects the nodes the bare rule object does:
/// its YAML text, the rule-file YAML (`rule:` wrapper), the rule-file object
/// `{rule: …}`, and the JSON text of that object (valid YAML).
#[test]
fn every_rule_spelling_matches_like_the_bare_rule() {
    let root = Fixture::new();
    root.write("lib.rs", "fn a() { unsafe { Pin::new_unchecked(&mut x); } }\nfn b() { Pin::new_unchecked(&mut y); }\n");
    let bare = json!({"pattern":"Pin::new_unchecked($A)","not":{"inside":{"kind":"unsafe_block","stopBy":"end"}}});
    let run_rule = |rule: serde_json::Value| {
        run(
            &root.0,
            json!({"operation":"match","path":root.0,"language":"rust","rule":rule}),
        )
        .expect("the rule runs")
    };
    let expected = run_rule(bare.clone());
    assert_eq!(
        expected["files"][0]["matches"].as_array().map(Vec::len),
        Some(1),
        "{expected}"
    );
    assert_eq!(
        lean_row(&expected["files"][0]["matches"][0]).0,
        2,
        "{expected}"
    );
    for (spelling, rule) in [
        (
            "YAML text",
            json!(
                "pattern: Pin::new_unchecked($A)\nnot:\n  inside:\n    kind: unsafe_block\n    stopBy: end"
            ),
        ),
        (
            "rule-file YAML",
            json!(
                "id: pin\nlanguage: rust\nrule:\n  pattern: Pin::new_unchecked($A)\n  not:\n    inside:\n      kind: unsafe_block\n      stopBy: end"
            ),
        ),
        ("rule-file object", json!({ "rule": bare })),
        (
            "rule-file JSON text",
            json!(json!({ "rule": bare }).to_string()),
        ),
    ] {
        let out = run_rule(rule);
        assert_eq!(out["files"], expected["files"], "{spelling}: {out}");
    }
}

#[test]
fn an_empty_declaration_pattern_retries_with_the_parts_it_omitted() {
    let root = Fixture::new();
    let typed = root.0.join("typed.ts");
    std::fs::write(
        &typed,
        "export function typed(a: number): number { return a; }\nfunction local(): void {}\n",
    )
    .expect("typed");
    let mixed = root.0.join("mixed.ts");
    std::fs::write(
        &mixed,
        "export function typed(a: number): number { return a; }\nexport function untyped(b) { return b; }\n",
    )
    .expect("mixed");
    let rust = root.0.join("items.rs");
    std::fs::write(
        &rust,
        "pub fn a() -> u8 { 1 }\npub(crate) fn b() {}\nfn c() {}\n",
    )
    .expect("rust");
    let python = root.0.join("defs.py");
    std::fs::write(&python, "def f(x) -> int:\n    return x\n").expect("python");
    let matched = |path: &PathBuf, pattern: &str| {
        run(
            &root.0,
            json!({"operation":"match","mainGoal":"test","reasoning":"test","path":path,"pattern":pattern}),
        )
        .expect("match")
    };
    let relaxed = |out: &serde_json::Value| {
        out["diagnostics"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|d| d["code"] == "structural.pattern.relaxed")
    };

    // Every function has a return type: the pattern as written matches
    // nothing, so the retry spells the return type it omitted.
    let out = matched(&typed, "export function $N($$$A) { $$$B }");
    assert_eq!(out["matchCount"], 1, "{out}");
    assert!(out.get("status").is_none(), "{out}");
    assert!(relaxed(&out), "{out}");
    let out = matched(&typed, "function $N($$$A) { $$$B }");
    assert_eq!(out["matchCount"], 2, "{out}");

    // A pattern that matches as written still gains the spellings it
    // omitted: the untyped function and the typed one.
    let out = matched(&mixed, "export function $N($$$A) { $$$B }");
    assert_eq!(out["matchCount"], 2, "{out}");
    assert!(relaxed(&out), "{out}");

    // Rust: visibility and the return type; Python: the return annotation.
    let out = matched(&rust, "fn $N() { $$$B }");
    assert_eq!(out["matchCount"], 3, "{out}");
    assert!(relaxed(&out), "c as written, a and b relaxed: {out}");
    let only_pub = root.0.join("pub.rs");
    std::fs::write(&only_pub, "pub fn a() -> u8 { 1 }\npub(crate) fn b() {}\n").expect("pub");
    let out = matched(&only_pub, "fn $N() { $$$B }");
    assert_eq!(out["matchCount"], 2, "{out}");
    assert!(relaxed(&out), "{out}");
    let out = matched(&python, "def $F($$$A): $$$B");
    assert_eq!(out["matchCount"], 1, "{out}");
    assert!(relaxed(&out), "{out}");

    // Nothing to add, or nothing found either way: the plain empty result.
    let out = matched(&typed, "class $C { $$$B }");
    assert_eq!(out["status"], "empty", "{out}");
    assert!(!relaxed(&out), "{out}");
}

/// An empty match counts the files it parsed and leads to the syntax
/// tree of the first, where the pattern's node shape can be compared.
#[test]
fn empty_match_hint_leads_to_syntax_tree() {
    let root = Fixture::new();
    root.write("a.rs", "fn alpha() { beta(1); }\n");
    let out = run(
        &root.0,
        json!({"operation":"match","path":root.0,"language":"rust","pattern":"beta($A, $B)"}),
    )
    .expect("match");
    assert_eq!(out["status"], "empty", "{out}");
    assert!(
        out["hints"][0]
            .as_str()
            .is_some_and(|text| text.starts_with("0 matches in 1 rust file.")),
        "{out}"
    );
    let lead = &out["next"]["viewTree"];
    assert_eq!(lead["tool"], "astSearch", "{out}");
    let row = &lead["query"]["queries"][0];
    assert_eq!(row["operation"], "syntaxTree", "{out}");
    assert!(
        row["path"]
            .as_str()
            .is_some_and(|path| path.ends_with("a.rs")),
        "{out}"
    );
    crate::contracts::validate_query("astSearch", row.clone()).expect("a valid syntaxTree row");
}

/// Repairable failures carry their one lead and no advice text: a rule
/// that does not compile against a file leads to its syntax tree; a
/// language no file under a directory has leads to the query in the grammar
/// the directory does hold (a repair never removes a field the run needs).
#[test]
fn repairable_failures_carry_one_lead() {
    let root = Fixture::new();
    let file = root.0.join("a.rs");
    std::fs::write(&file, "fn a() {}\n").expect("a");
    let error = run(
        &root.0,
        json!({"operation":"match","path":file,"rule":"kind: not_a_real_kind"}),
    )
    .expect_err("unknown kind");
    assert_eq!(error.code, "invalidPattern", "{error:?}");
    assert!(error.hints.is_empty(), "{error:?}");
    let next = error.next.as_ref().expect("lead");
    assert_eq!(
        next["viewTree"]["query"]["queries"][0]["operation"], "syntaxTree",
        "{next}"
    );

    let out = run(
        &root.0,
        json!({"operation":"match","path":root.0,"language":"python","pattern":"print($A)"}),
    )
    .expect("no python file");
    let repair = &out["next"]["repair"]["query"]["queries"][0];
    assert_eq!(repair["language"], "rust", "{out}");
    assert_eq!(repair["pattern"], "print($A)", "{out}");
    assert_eq!(
        out["hints"],
        json!(["No python file under this path was parsed."]),
        "{out}"
    );
}

/// A relaxed pattern carries the relaxed rule its continuations replay, and
/// states the counts as written and relaxed.
#[test]
fn a_relaxed_pattern_carries_its_rule_and_both_counts() {
    let root = Fixture::new();
    let source = root.0.join("lib.rs");
    std::fs::write(&source, "pub fn a() { x(); }\nfn b() { y(); }\n").expect("source");
    let out = run(
        &root.0,
        json!({"operation":"match","path":source,"pattern":"fn $N() { $$$B }"}),
    )
    .expect("match");
    assert_eq!(out["matchCount"], 2, "{out}");
    let note = out["diagnostics"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|d| d["code"] == "structural.pattern.relaxed")
        .expect("relaxed note");
    let message = note["message"].as_str().expect("message");
    // Per-call facts only: the counts, beside the relaxed `rule`. Why
    // continuations replay it is the tool description's.
    assert_eq!(
        message, "1 match as written; 2 match the relaxed rule.",
        "{message}"
    );
    let any = note["rule"]["any"].as_array().expect("relaxed rule");
    assert_eq!(any[0], json!({"pattern":"fn $N() { $$$B }"}), "{out}");
    assert!(
        any.contains(&json!({"pattern":"pub fn $N() { $$$B }"})),
        "{out}"
    );
}

/// A syntax tree whose parse recovered from errors is the whole recovered
/// tree: no page reaches more, so the row ends at a terminal limit that
/// names its cut.
#[test]
fn a_recovered_syntax_tree_names_its_terminal_cut() {
    let root = Fixture::new();
    let file = root.write("broken.ts", "function f( {\n");
    let out = run(&root.0, json!({"operation":"syntaxTree","path":file})).expect("tree");
    assert_eq!(out["isPartial"], true, "{out}");
    assert_eq!(out["terminalLimit"], true, "{out}");
    assert_eq!(out["partialReasons"], json!(["parseRecovered"]), "{out}");
}

//! astTopology dead-code root inference: which files a scan treats as
//! entrypoints, per ecosystem.
use super::test_support::*;
use serde_json::{Value, json};

// Regression: dead-code root inference must not be package.json-only. A Rust
// crate must infer `src/main.rs` as a root so the helper it calls reads as
// reachable rather than dead.
#[test]
fn rust_dead_code_infers_main_root_and_keeps_helper_reachable() {
    let temp = Fixture::new();
    let root = temp.0.as_path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    temp.write(
        "src/main.rs",
        "use crate::helper;\nfn main() { helper::run(); }\n",
    );
    temp.write("src/helper.rs", "pub fn run() {}\n");

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
    let root = temp.0.as_path();

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
    let out = topology(temp.0.as_path(), json!({"operation":"deadCode"}));
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
    let temp = Fixture::new();
    let root = temp.0.as_path();
    for (name, content) in files {
        temp.write(name, content);
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
    let root = temp.0.as_path();
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
    let def = "export default function foo() { return 1 }\nexport function other() { return 2 }\n";
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
    let root = temp.0.as_path();
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

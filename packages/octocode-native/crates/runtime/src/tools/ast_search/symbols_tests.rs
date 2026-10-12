//! A directory symbols scan holds what its filters keep, not every file's
//! declarations: peak memory follows the answer, not the repository.
use super::symbols::{AstSearchQuerySymbols, Outline, outline_directory};
use crate::tools::cancel::NeverCancel;
use crate::tools::test_support::{Fixture, simple_policy};
use serde_json::json;

fn query(root: &std::path::Path, extra: serde_json::Value) -> AstSearchQuerySymbols {
    let mut row = json!({"operation":"symbols","path":root.to_string_lossy()});
    row.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());
    serde_json::from_value(row).expect("symbols query")
}

fn scan(q: &AstSearchQuerySymbols, root: &std::path::Path) -> Outline {
    let (paths, _) = simple_policy(root);
    outline_directory(q, &root.canonicalize().expect("root"), &paths, &NeverCancel).expect("scan")
}

fn rows(outline: &Outline) -> usize {
    outline.files.iter().map(|file| file.1.len()).sum()
}

fn files(root: &std::path::Path, count: usize) {
    for index in 0..count {
        let mut source = format!(
            "export function helper{index}() {{ return {index}; }}\nexport class Widget{index} {{}}\n"
        );
        if index == 3 {
            source.push_str("export class Disposable {}\n");
        }
        std::fs::write(root.join(format!("file{index}.ts")), source).expect("source");
    }
}

/// Only declarations whose name can match `symbolName` leave the scan; every
/// parsed file is still counted as scanned.
#[test]
fn a_name_search_retains_only_matching_declarations() {
    let root = Fixture::new();
    files(&root.0, 30);
    let held = scan(&query(&root.0, json!({"symbolName":"Disposable"})), &root.0);
    assert_eq!(rows(&held), 1, "rows held while scanning");
    assert_eq!(held.files.len(), 1, "files held while scanning");
    assert_eq!(held.scanned, 30, "every parsed file is counted");
}

/// A `kinds` filter drops other kinds before they are held.
#[test]
fn a_kind_search_retains_only_the_asked_kinds() {
    let root = Fixture::new();
    files(&root.0, 30);
    let held = scan(&query(&root.0, json!({"kinds":["class"]})), &root.0);
    assert_eq!(rows(&held), 31, "30 Widget classes and Disposable");
    assert_eq!(held.scanned, 30);
}

fn empty_outline(root: &std::path::Path, extra: serde_json::Value) -> serde_json::Value {
    let (paths, security) = simple_policy(root);
    let query: crate::contracts::tool_types::AstSearchQuery = {
        let mut row = json!({"operation":"symbols","path":root.to_string_lossy()});
        row.as_object_mut()
            .expect("object")
            .extend(extra.as_object().expect("object").clone());
        serde_json::from_value(row).expect("typed row")
    };
    super::execute_ast(&query, &paths, &security, &NeverCancel, None).expect("runs")
}

/// An empty outline whose files the walk reached claims nothing hides behind
/// skipped paths: the scanned files are not "behind" anything.
#[test]
fn an_empty_name_search_does_not_blame_files_it_scanned() {
    let root = Fixture::new();
    files(&root.0, 5);
    let out = empty_outline(&root.0, json!({"symbolName":"zzNoSuchSymbol"}));
    assert_eq!(out["status"], "empty", "{out}");
    assert_eq!(out["filesScanned"], 5, "{out}");
    let hints = out["hints"].to_string();
    assert!(!hints.contains("skipped paths"), "{hints}");
    assert!(out["next"].get("includeSkipped").is_none(), "{out}");
}

/// Files behind a hidden directory are counted by themselves, not with the
/// files the scan reached.
#[test]
fn an_empty_name_search_counts_only_the_hidden_files() {
    let root = Fixture::new();
    files(&root.0, 5);
    std::fs::create_dir_all(root.0.join(".cfg")).expect("dir");
    std::fs::write(
        root.0.join(".cfg/hidden.ts"),
        "export const zzNeedle = 1;\n",
    )
    .expect("hidden");
    let out = empty_outline(&root.0, json!({"symbolName":"zzNeedle"}));
    assert_eq!(out["status"], "empty", "{out}");
    let hints = out["hints"].to_string();
    assert!(hints.contains("1 file(s)"), "{hints}");
    assert!(hints.contains("hidden .cfg/"), "{hints}");
}

/// The astSearch row of a result's `includeSkipped` lead: the same scope
/// with the walk flags that reach the skipped files.
fn skipped_lead(out: &serde_json::Value) -> serde_json::Value {
    let lead = out["next"]["includeSkipped"]["query"]["queries"][0].clone();
    assert!(lead.is_object(), "no includeSkipped lead: {out}");
    lead
}

fn run_lead(root: &std::path::Path, lead: serde_json::Value) -> serde_json::Value {
    let (paths, security) = simple_policy(root);
    let query: crate::contracts::tool_types::AstSearchQuery =
        serde_json::from_value(lead).expect("the lead is a typed row");
    super::execute_ast(&query, &paths, &security, &NeverCancel, None).expect("the lead runs")
}

fn found_files(out: &serde_json::Value) -> Vec<String> {
    out["files"]
        .as_array()
        .map(|files| {
            files
                .iter()
                .filter_map(|file| file["path"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

/// The hidden-path lead keeps the scope, so a root-anchored `exclude` keeps
/// its meaning: the lead finds what the hint counted.
#[test]
fn the_hidden_lead_keeps_the_exclude_anchored_to_the_scan_root() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".cfg/skip")).expect("dirs");
    for file in [".cfg/keep.ts", ".cfg/skip/gone.ts"] {
        std::fs::write(root.0.join(file), "export function dup() {}\n").expect("source");
    }
    let out = empty_outline(
        &root.0,
        json!({"symbolName":"dup","exclude":[".cfg/skip/**"]}),
    );
    assert_eq!(out["status"], "empty", "{out}");
    assert!(out["hints"].to_string().contains("1 file(s)"), "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["exclude"], json!([".cfg/skip/**"]), "{lead}");
    assert_eq!(lead["includeHidden"], json!(true), "{lead}");
    let ran = run_lead(&root.0, lead);
    assert_eq!(found_files(&ran).len(), 1, "{ran}");
    assert!(found_files(&ran)[0].ends_with("keep.ts"), "{ran}");
}

/// `languageGlobs` map a hidden header to a grammar: the probe counts it
/// as outlinable (as the scan does), and the lead parses it with the mapped
/// grammar.
#[test]
fn the_hidden_lead_keeps_the_language_globs_anchored_to_the_scan_root() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".cfg/include")).expect("dirs");
    std::fs::write(
        root.0.join(".cfg/include/widget.h"),
        "namespace Space { class Widget {}; }\n",
    )
    .expect("header");
    let out = empty_outline(
        &root.0,
        json!({"symbolName":"Widget","languageGlobs":{"cpp":[".cfg/include/**/*.h"]}}),
    );
    assert_eq!(out["status"], "empty", "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(
        lead["languageGlobs"],
        json!({"cpp":[".cfg/include/**/*.h"]}),
        "{lead}"
    );
    let ran = run_lead(&root.0, lead);
    assert_eq!(found_files(&ran).len(), 1, "{ran}");
    assert!(ran["files"].to_string().contains("Widget"), "{ran}");
}

/// A file only `languageGlobs` map to a grammar (an extension no outlined
/// language has) behind a `.gitignore` rule is counted and offered.
#[test]
fn a_language_globs_file_behind_an_ignore_rule_gets_a_lead() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".git")).expect("git dir");
    std::fs::write(root.0.join(".gitignore"), "gen/\n").expect("gitignore");
    std::fs::create_dir_all(root.0.join("gen")).expect("dir");
    std::fs::write(
        root.0.join("gen/api.tsx.in"),
        "export function zzMapped() {}\n",
    )
    .expect("mapped source");
    std::fs::write(root.0.join("main.ts"), "export const kept = 1;\n").expect("source");
    let out = empty_outline(
        &root.0,
        json!({"symbolName":"zzMapped","languageGlobs":{"typescript":["**/*.tsx.in"]}}),
    );
    assert_eq!(out["status"], "empty", "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["includeIgnored"], json!(true), "{lead}");
    let ran = run_lead(&root.0, lead);
    assert!(ran.to_string().contains("zzMapped"), "{ran}");
}

/// A hidden *file* is reached the same way: the lead keeps the scope and its
/// filters and lifts `includeHidden`.
#[test]
fn the_hidden_file_lead_keeps_the_scope_and_its_filters() {
    let root = Fixture::new();
    std::fs::write(root.0.join(".hidden.ts"), "export function hf() {}\n").expect("hidden");
    std::fs::write(root.0.join("plain.ts"), "export function other() {}\n").expect("plain");
    let out = empty_outline(
        &root.0,
        json!({"symbolName":"hf","languageGlobs":{"typescript":["**/*.ts"]},"exclude":["**/none/**"]}),
    );
    assert_eq!(out["status"], "empty", "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(
        lead["languageGlobs"],
        json!({"typescript":["**/*.ts"]}),
        "{lead}"
    );
    assert_eq!(lead["exclude"], json!(["**/none/**"]), "{lead}");
    assert_eq!(lead["includeHidden"], json!(true), "{lead}");
    let ran = run_lead(&root.0, lead);
    assert!(ran.get("errorCode").is_none(), "{ran}");
    assert!(ran["files"].to_string().contains("hf"), "{ran}");
}

/// The fixture of a lead-replay defect: the name sits in a
/// `.gitignore`d, default-excluded `build/`, next to a hidden directory that
/// holds another symbol and a pruned `node_modules/`.
fn skipped_workspace(hidden_name: &str, ignored_name: &str) -> Fixture {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".git")).expect("git dir");
    std::fs::write(root.0.join(".gitignore"), "build/\n").expect("gitignore");
    for (file, name) in [
        (".hidden/h.ts", hidden_name),
        ("build/out.ts", ignored_name),
        ("node_modules/pkg/i.ts", "defaultExcludedSym"),
        ("src/a.ts", "visibleSym"),
    ] {
        let at = root.0.join(file);
        std::fs::create_dir_all(at.parent().expect("parent")).expect("dirs");
        std::fs::write(at, format!("export function {name}() {{ return 1; }}\n")).expect("source");
    }
    root
}

/// A name that sits only in the ignored `build/` leads to the same scope
/// with the walk flags that reach it, and not `includeHidden`: the hidden
/// directory holds another symbol.
#[test]
fn an_ignored_symbol_leads_to_its_own_scope_with_the_ignore_flags_lifted() {
    let root = skipped_workspace("hiddenSym", "ignoredSym");
    let out = empty_outline(&root.0, json!({"symbolName":"ignoredSym"}));
    assert_eq!(out["status"], "empty", "{out}");
    assert!(out["next"].get("narrowScope").is_none(), "{out}");
    let hints = out["hints"].to_string();
    assert!(hints.contains("1 file(s)"), "{hints}");
    assert!(!hints.contains(".hidden"), "{hints}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["path"], json!(root.0.to_string_lossy()), "{out}");
    assert_eq!(lead["includeIgnored"], json!(true), "{out}");
    assert_eq!(lead["defaultExcludes"], json!(false), "{out}");
    assert!(lead.get("includeHidden").is_none(), "{out}");
    let found = run_lead(&root.0, lead);
    assert_eq!(found_files(&found).len(), 1, "{found}");
    assert!(found.to_string().contains("ignoredSym"), "{found}");
}

/// A name only a hidden directory holds lifts `includeHidden` alone.
#[test]
fn a_hidden_symbol_lead_lifts_only_the_hidden_flag() {
    let root = skipped_workspace("hiddenSym", "ignoredSym");
    let out = empty_outline(&root.0, json!({"symbolName":"hiddenSym"}));
    assert_eq!(out["status"], "empty", "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["includeHidden"], json!(true), "{lead}");
    assert!(lead.get("includeIgnored").is_none(), "{lead}");
    assert!(lead.get("defaultExcludes").is_none(), "{lead}");
    let found = run_lead(&root.0, lead);
    assert!(found.to_string().contains("hiddenSym"), "{found}");
}

/// A name held both by a hidden directory and by an ignored one: one lead
/// lifts both causes and reaches every file, and the hint names both.
#[test]
fn a_symbol_behind_hidden_and_ignored_paths_gets_one_lead_lifting_both() {
    let root = skipped_workspace("sharedSym", "sharedSym");
    let out = empty_outline(&root.0, json!({"symbolName":"sharedSym"}));
    assert_eq!(out["status"], "empty", "{out}");
    // The text fallback gives way to the skip lead.
    let channels: Vec<&str> = out["next"]
        .as_object()
        .expect("next")
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(channels.last().copied(), Some("findText"), "{out}");
    let hints = out["hints"].to_string();
    assert!(hints.contains("hidden .hidden/"), "{hints}");
    assert!(hints.contains(".gitignore:1 'build/'"), "{hints}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["path"], json!(root.0.to_string_lossy()), "{out}");
    assert_eq!(lead["includeIgnored"], json!(true), "{out}");
    assert_eq!(lead["includeHidden"], json!(true), "{out}");
    let found = run_lead(&root.0, lead);
    let files = found_files(&found);
    assert_eq!(files.len(), 2, "{found}");
    assert!(files.iter().any(|f| f.ends_with("out.ts")), "{found}");
    assert!(files.iter().any(|f| f.ends_with("h.ts")), "{found}");
}

/// With `includeIgnored` already on, the lead lifts only what is left.
#[test]
fn a_symbol_lead_never_repeats_a_flag_the_request_already_set() {
    let root = skipped_workspace("hiddenSym", "ignoredSym");
    let out = empty_outline(
        &root.0,
        json!({"symbolName":"hiddenSym","includeIgnored":true}),
    );
    assert_eq!(out["status"], "empty", "{out}");
    let lead = skipped_lead(&out);
    assert_eq!(lead["includeIgnored"], json!(true), "{lead}");
    assert_eq!(lead["includeHidden"], json!(true), "{lead}");
    assert!(run_lead(&root.0, lead).to_string().contains("hiddenSym"));
}

/// Several hidden directories holding the name are all reached by the one
/// lead, so no hidden file stays unreachable behind the first one.
#[test]
fn every_hidden_directory_holding_the_name_is_reached() {
    let root = Fixture::new();
    for dir in [".alpha", ".beta"] {
        std::fs::create_dir_all(root.0.join(dir)).expect("dir");
        std::fs::write(
            root.0.join(dir).join("x.ts"),
            "export function twinSym() {}\n",
        )
        .expect("source");
    }
    std::fs::write(root.0.join("main.ts"), "export const kept = 1;\n").expect("source");
    let out = empty_outline(&root.0, json!({"symbolName":"twinSym"}));
    let found = run_lead(&root.0, skipped_lead(&out));
    let files = found_files(&found);
    assert_eq!(files.len(), 2, "{found}");
    assert!(files.iter().any(|p| p.contains(".alpha")), "{found}");
    assert!(files.iter().any(|p| p.contains(".beta")), "{found}");
}

/// A `symbols` page for a scan the time budget cut at `resume`.
fn cut_page(resume: u32) -> serde_json::Value {
    let root = Fixture::new();
    let q = query(&root.0, json!({}));
    let set: super::symbols::SymbolSet = serde_json::from_value(json!({
        "path": root.0.to_string_lossy(),
        "snapshot": "s",
        "declarations": [],
        "diagnostics": [],
        "files_scanned": resume,
        "skipped": 0,
        "truncated": true,
        "scan_resume": resume,
        "recovered": false,
        "directory": true,
    }))
    .expect("symbol set");
    super::symbols::render_page(&q, &set, None)
}

/// A time-budget cut resumes with `next.expandScan` only while the offset is
/// a valid `scanOffset` and below the walk ceiling; anywhere else the page
/// states the terminal limit instead of offering a call the contract rejects
/// (or one that skips the whole walk again).
#[test]
fn a_scan_cut_past_the_scan_offset_bound_is_terminal() {
    use crate::tools::id::query_limits::ast_search::symbols::SCAN_OFFSET_MAXIMUM;
    let ceiling = octocode_engine::scan_budget::SCAN_WALK_FILES;
    for resume in [
        1_000,
        SCAN_OFFSET_MAXIMUM,
        SCAN_OFFSET_MAXIMUM + 1,
        ceiling - 1,
        ceiling,
    ] {
        let page = cut_page(u32::try_from(resume).expect("offset"));
        let offered = resume <= SCAN_OFFSET_MAXIMUM && resume < ceiling;
        assert_eq!(
            page["next"].get("expandScan").is_some(),
            offered,
            "resume {resume}: {page}"
        );
        assert_eq!(
            page.get("terminalLimit") == Some(&json!(true)),
            !offered,
            "resume {resume}: {page}"
        );
        if !offered {
            let diagnostics = page["diagnostics"].to_string();
            assert!(diagnostics.contains("narrow"), "resume {resume}: {page}");
        }
    }
}

/// One gitignore policy for both operations: a directory outline leaves
/// `.gitignore`d files out as `match` does, and an empty one names them and
/// leads to the outline with `includeIgnored` on.
#[test]
fn an_outline_leaves_out_gitignored_files_and_leads_to_them() {
    let root = Fixture::new();
    std::fs::create_dir_all(root.0.join(".git")).expect("git dir");
    std::fs::write(root.0.join(".gitignore"), "gen/\n").expect("gitignore");
    std::fs::create_dir_all(root.0.join("gen")).expect("dir");
    std::fs::write(root.0.join("gen/out.ts"), "export const zzGenerated = 1;\n")
        .expect("ignored source");
    std::fs::write(root.0.join("main.ts"), "export const kept = 1;\n").expect("source");
    let kept = empty_outline(&root.0, json!({}));
    assert_eq!(found_files(&kept).len(), 1, "{kept}");
    assert_eq!(kept["filesScanned"], 1, "{kept}");
    let out = empty_outline(&root.0, json!({"symbolName":"zzGenerated"}));
    assert_eq!(out["status"], "empty", "{out}");
    let hints = out["hints"].to_string();
    assert!(hints.contains(".gitignore:1 'gen/'"), "{hints}");
    let lead = out["next"]["includeSkipped"]["query"]["queries"][0].clone();
    assert_eq!(lead["includeIgnored"], json!(true), "{out}");
    assert_eq!(lead["path"], json!(root.0.to_string_lossy()), "{out}");
    let found = run_lead(&root.0, lead);
    assert_eq!(found_files(&found).len(), 1, "{found}");
    assert!(found.to_string().contains("zzGenerated"), "{found}");
    let direct = empty_outline(
        &root.0,
        json!({"symbolName":"zzGenerated","includeIgnored":true}),
    );
    assert!(direct.to_string().contains("zzGenerated"), "{direct}");
}

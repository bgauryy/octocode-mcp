//! Coverage signals where the protocol or server cannot establish
//! project-wide completeness.
//!
//! A Python server resolves a call only through a receiver whose type it
//! infers, so calls through untyped or dynamic receivers are missing:
//! reason `dynamicDispatch`. rust-analyzer analyzes one feature set, so code
//! under disabled `cfg(feature)` gates is compiled out: reason
//! `cfgGatedFiles` when files that mention the name carry such gates, with
//! an `expandFeatures` rerun page. An all-features run compiles out
//! `cfg(not(feature …))` code instead: reason `cfgNegatedFeatures`. Every
//! such row gets the lexical `findText` lead. Gate scans cover the
//! request's search scope (the repository), not the member crate.

use super::LspSearchQuery;
use super::failure::{FILE_LEVEL_REASONS, TEXT_CHECK, flag_partial, flagged_with};
use super::inferred_project::is_incoming;
use super::scope::Scope;
use crate::tools::id::ToolId;
use serde_json::{Value, json};
use std::path::Path;

pub(super) const DYNAMIC_REASON: &str = "dynamicDispatch";
pub(super) const CFG_REASON: &str = "cfgGatedFiles";
pub(super) const CFG_NEGATED_REASON: &str = "cfgNegatedFeatures";
const PYTHON_WARNING: &str = "The Python language server resolves a use only through a receiver whose type it infers; uses through untyped or dynamic receivers (managers, mixins, getattr, duck typing) are missing. Confirm with a localSearch of the name.";
/// Bound of the Rust gate scan; a larger workspace counts what it reached.
const MAX_SCANNED_FILES: usize = 20_000;
/// Largest file the gate scan reads; generated sources (a 2.4 MB
/// `tool_types.rs`) fit, so they never make every answer partial.
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const GATE_SCAN_BUDGET: std::time::Duration = std::time::Duration::from_millis(250);

/// The lexical `findText` check, named by its search.
fn text_check() -> String {
    TEXT_CHECK.to_owned()
}

pub(super) fn annotate(
    row: &mut Value,
    query: &LspSearchQuery,
    language_id: Option<&str>,
    scope: &Scope,
) {
    if !is_incoming(&query.operation())
        || !row.is_object()
        || row.get("status").and_then(Value::as_str) == Some("error")
        || flagged_with(row, &FILE_LEVEL_REASONS)
    {
        return;
    }
    match language_id {
        Some("python") => flag_partial(row, query, DYNAMIC_REASON, Some(PYTHON_WARNING), scope),
        Some("rust") => annotate_rust(row, query, scope),
        _ => {}
    }
}

/// Workspace-symbol arrays have no total, cursor, or completeness marker.
/// Native pagination covers the returned array; it cannot establish that
/// the provider returned every matching declaration in its project.
/// `capped_at` is the server's own result limit when its answer reached it
/// (only tsgo has one), which is said outright.
pub(super) fn workspace_symbols(row: &mut Value, anchor: Option<&str>, capped_at: Option<usize>) {
    if row.get("status").and_then(Value::as_str) == Some("error") {
        return;
    }
    let mut warnings = vec!["workspace/symbol supplies no completeness marker or provider continuation; native pages cover only returned symbols. Empty is not workspace absence. documentSymbols inspects one file with different matching semantics.".to_owned()];
    if let Some(limit) = capped_at {
        warnings.push(format!(
            "tsgo returns at most {limit} workspace symbols; this list is capped by the server: narrow symbolName, or route .ts to typescript-language-server in lsp-servers.json."
        ));
    }
    crate::tools::paging::mark_partial(row, "workspaceSymbolCoverageUnknown", &warnings);
    if let Some(path) = anchor {
        // This is an optional lead, moved to hints by continuation shaping;
        // it is not a page that recovers an exhaustive workspace result.
        row["next"]["inspectDocumentSymbols"] = crate::tools::result::Continuation::new(
            ToolId::LspSearch,
            json!({"operation": "documentSymbols", "path": path}),
        )
        .confidence("medium")
        .build();
    }
}

fn annotate_rust(row: &mut Value, query: &LspSearchQuery, scope: &Scope) {
    let context = query.rust_context().unwrap_or_else(|| json!({}));
    let Some(name) = query.symbol_name().filter(|name| !name.trim().is_empty()) else {
        return;
    };
    let root = Path::new(&scope.root);
    if context["features"] == "all" {
        let negated = gated_files_mentioning(root, name, has_negated_feature_gate);
        if negated.matches > 0 || negated.incomplete() {
            let warning = format!(
                "{} Rust files that mention `{name}` carry cfg(not(feature …)) gates; an all-features build compiles that code out. {}Compare with the default-features run, or confirm with {}.",
                negated.matches,
                negated.incomplete_warning(),
                text_check()
            );
            flag_partial(row, query, CFG_NEGATED_REASON, Some(&warning), scope);
        }
        return;
    }
    let gated = gated_files_mentioning(root, name, has_feature_gate);
    if gated.matches == 0 && !gated.incomplete() {
        return;
    }
    // Gated files found: the rerun page and the partial reason say it all.
    // Only an incomplete scan that found none needs the prose.
    if gated.matches > 0 {
        flag_partial(row, query, CFG_REASON, None, scope);
    } else {
        let warning = format!(
            "{}Uses under features rust-analyzer left off may be missing: {}.",
            gated.incomplete_warning(),
            text_check()
        );
        flag_partial(row, query, CFG_REASON, Some(&warning), scope);
        return;
    }
    // The rerun repeats the whole walk under every feature: offered once,
    // on the walk's first page.
    if query.page().unwrap_or(1) > 1 || query.importer_page() > 1 {
        return;
    }
    let mut rerun = query.to_row();
    if let Some(fields) = rerun.as_object_mut() {
        fields
            .retain(|key, value| !value.is_null() && !matches!(key.as_str(), "page" | "snapshot"));
    }
    let mut context = context;
    context["features"] = json!("all");
    rerun["rustContext"] = context;
    row["next"]["expandFeatures"] =
        crate::tools::result::Continuation::new(ToolId::LspSearch, rerun)
            .confidence("medium")
            .build();
}

/// Rust files under `root` (ignore-aware) that spell `name` as a word and
/// carry a gate `gate` detects.
#[derive(Default)]
struct GateScan {
    matches: usize,
    has_more: bool,
    unreadable: usize,
}

impl GateScan {
    fn incomplete(&self) -> bool {
        self.has_more || self.unreadable > 0
    }

    fn incomplete_warning(&self) -> String {
        if self.incomplete() {
            format!(
                "The gate scan was incomplete (unvisited files: {}, unreadable or oversized files: {}); the count is a lower bound. ",
                if self.has_more {
                    "at least one"
                } else {
                    "none"
                },
                self.unreadable
            )
        } else {
            String::new()
        }
    }
}

fn gated_files_mentioning(root: &Path, name: &str, gate: fn(&str) -> bool) -> GateScan {
    gated_files_mentioning_limit(root, name, gate, MAX_SCANNED_FILES)
}

fn gated_files_mentioning_limit(
    root: &Path,
    name: &str,
    gate: fn(&str) -> bool,
    limit: usize,
) -> GateScan {
    let walker = crate::tools::pruned_walk(root, crate::tools::syntax_prune([])).build();
    let mut scan = GateScan::default();
    let mut visited = 0;
    let started = std::time::Instant::now();
    for entry in walker {
        if started.elapsed() >= GATE_SCAN_BUDGET {
            scan.has_more = true;
            break;
        }
        let Ok(entry) = entry else {
            scan.unreadable += 1;
            continue;
        };
        if !entry.file_type().is_some_and(|kind| kind.is_file())
            || entry.path().extension().is_none_or(|ext| ext != "rs")
        {
            continue;
        }
        if visited >= limit {
            scan.has_more = true;
            break;
        }
        visited += 1;
        // Only a file past the read cap leaves the scan incomplete.
        if !entry
            .metadata()
            .is_ok_and(|meta| meta.len() <= MAX_FILE_BYTES)
        {
            scan.unreadable += 1;
            continue;
        }
        match crate::tools::source::read_bounded(entry.path(), MAX_FILE_BYTES as usize)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
        {
            Some(text) if gate(&text) && mentions_word(&text, name) => scan.matches += 1,
            Some(_) => {}
            None => scan.unreadable += 1,
        }
    }
    scan
}

fn has_feature_gate(text: &str) -> bool {
    text.match_indices("cfg").any(|(at, _)| {
        let rest = &text[at + 3..];
        rest.trim_start().starts_with('(')
            && rest
                .split(')')
                .next()
                .is_some_and(|gate| gate.contains("feature"))
    })
}

/// A `cfg(not(feature …))` gate (also nested, `cfg(all(not(feature …)))`).
fn has_negated_feature_gate(text: &str) -> bool {
    text.match_indices("cfg").any(|(at, _)| {
        let rest = text[at + 3..].trim_start();
        rest.starts_with('(')
            && rest
                .split(']')
                .next()
                .is_some_and(|gate| gate.replace(' ', "").contains("not(feature"))
    })
}

fn mentions_word(text: &str, name: &str) -> bool {
    let is_ident = |c: char| c.is_alphanumeric() || c == '_';
    text.match_indices(name).any(|(at, _)| {
        !text[..at].chars().next_back().is_some_and(is_ident)
            && !text[at + name.len()..].chars().next().is_some_and(is_ident)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_coverage_preserves_errors_and_avoids_a_directory_document_hint() {
        let mut stale = json!({"status":"error","errorCode":"staleSnapshot"});
        let before = stale.clone();
        workspace_symbols(&mut stale, Some("/w/a.ts"), None);
        assert_eq!(stale, before);
        let mut empty = json!({"kind":"empty"});
        workspace_symbols(&mut empty, None, None);
        assert_eq!(empty["isPartial"], true);
        assert_eq!(
            empty["partialReasons"],
            json!(["workspaceSymbolCoverageUnknown"])
        );
        assert!(empty.get("next").is_none(), "a directory is not a document");
        assert!(empty.get("terminalLimit").is_none());
    }

    #[test]
    fn gate_scan_reports_unvisited_files_after_its_cap() {
        let root = tempfile::tempdir().expect("root");
        std::fs::write(root.path().join("a.rs"), "pub fn other() {}\n").expect("first");
        std::fs::write(
            root.path().join("z.rs"),
            "#[cfg(feature = \"extra\")] pub fn wanted() {}\n",
        )
        .expect("second");
        let scan = gated_files_mentioning_limit(root.path(), "wanted", has_feature_gate, 1);
        assert_eq!(scan.matches, 0);
        assert!(scan.has_more);
    }

    fn query(value: Value) -> LspSearchQuery {
        serde_json::from_value(value).expect("query")
    }

    #[test]
    fn python_incoming_rows_name_dynamic_dispatch_and_offer_text_search() {
        let mut row = json!({"kind":"callers","matches":[{"path":"a.py"}]});
        let q = query(
            json!({"path":"/w/a.py","operation":"callers","symbolName":"get_or_create","line":3}),
        );
        let scope = Scope::new("/w".into(), vec!["*.py".into()]);
        annotate(&mut row, &q, Some("python"), &scope);
        // The reason is stated once, in partialReasons.
        assert_eq!(row["partialReasons"], json!([DYNAMIC_REASON]), "{row}");
        assert!(row["coverage"].get("reason").is_none(), "{row}");
        assert_eq!(row["isPartial"], true, "{row}");
        let warning = row["warnings"][0].as_str().expect("warning");
        assert!(!warning.contains("hints.findText"), "{warning}");
        assert_eq!(row["next"]["findText"]["tool"], "localSearch", "{row}");
        // Outgoing questions are not affected.
        let mut definition = json!({"kind":"definition","matches":[]});
        let q = query(json!({"path":"/w/a.py","operation":"definition","symbolName":"x","line":3}));
        annotate(&mut definition, &q, Some("python"), &scope);
        assert!(definition.get("isPartial").is_none(), "{definition}");
    }

    #[test]
    fn rust_rows_flag_feature_gated_mentions_and_offer_an_all_features_rerun() {
        let dir = tempfile::tempdir().expect("dir");
        std::fs::write(dir.path().join("lib.rs"), "pub fn spawn_blocking() {}\n").expect("lib");
        std::fs::write(
            dir.path().join("gated.rs"),
            "#![cfg(feature = \"full\")]\nfn t() { spawn_blocking(); }\n",
        )
        .expect("gated");
        std::fs::write(
            dir.path().join("other.rs"),
            "#[cfg(feature = \"x\")]\nfn spawn_blocking_extra() {}\n",
        )
        .expect("other");
        let root = dir.path().to_string_lossy().into_owned();
        let scope = Scope::new(root.clone(), vec!["*.rs".into()]);
        let row_query = json!({"path":format!("{root}/lib.rs"),"operation":"references","symbolName":"spawn_blocking","line":1});
        let mut row = json!({"kind":"references","matches":[{"path":"lib.rs"}]});
        annotate(&mut row, &query(row_query.clone()), Some("rust"), &scope);
        // Gated files found: the rerun page and one reason, no prose.
        assert_eq!(row["partialReasons"], json!([CFG_REASON]), "{row}");
        assert!(
            row.get("coverage")
                .is_none_or(|c| c.get("reason").is_none()),
            "{row}"
        );
        assert!(row.get("warnings").is_none(), "{row}");
        let rerun = &row["next"]["expandFeatures"]["query"]["queries"][0];
        assert_eq!(rerun["rustContext"]["features"], "all", "{row}");
        assert_eq!(rerun["symbolName"], "spawn_blocking", "{row}");
        // A later page of the same walk keeps the reason; the rerun lead
        // was offered once, on the first page.
        for later in [
            json!({"page": 2, "snapshot": "lsp-v3:abc"}),
            json!({"importerPage": 2, "snapshot": "lsp-v3:abc"}),
        ] {
            let mut later_query = row_query.clone();
            later_query
                .as_object_mut()
                .expect("query")
                .extend(later.as_object().expect("fields").clone());
            let mut page = json!({"kind":"references","matches":[{"path":"lib.rs"}]});
            annotate(&mut page, &query(later_query), Some("rust"), &scope);
            assert_eq!(page["partialReasons"], json!([CFG_REASON]), "{page}");
            assert!(page.pointer("/next/expandFeatures").is_none(), "{page}");
        }
        // An all-features run is not flagged again.
        let mut all = json!({"kind":"references","matches":[]});
        let mut all_query = row_query;
        all_query["rustContext"] = json!({"features":"all"});
        annotate(&mut all, &query(all_query), Some("rust"), &scope);
        assert!(all.get("isPartial").is_none(), "{all}");
    }

    #[test]
    fn all_features_run_flags_negated_feature_gates() {
        let dir = tempfile::tempdir().expect("dir");
        std::fs::write(dir.path().join("lib.rs"), "pub fn spawn_blocking() {}\n").expect("lib");
        std::fs::write(
            dir.path().join("fallback.rs"),
            "#[cfg(not(feature = \"rt\"))]\nfn t() { spawn_blocking(); }\n",
        )
        .expect("negated");
        let root = dir.path().to_string_lossy().into_owned();
        let scope = Scope::new(root.clone(), vec!["*.rs".into()]);
        let mut row = json!({"kind":"references","matches":[]});
        let q = query(
            json!({"path":format!("{root}/lib.rs"),"operation":"references",
            "symbolName":"spawn_blocking","line":1,"rustContext":{"features":"all"}}),
        );
        annotate(&mut row, &q, Some("rust"), &scope);
        assert_eq!(row["partialReasons"], json!([CFG_NEGATED_REASON]), "{row}");
        assert_eq!(row["next"]["findText"]["tool"], "localSearch", "{row}");
        assert!(row["next"].get("expandFeatures").is_none(), "{row}");
        assert!(has_negated_feature_gate(
            "#[cfg(all(unix, not( feature = \"x\")))]"
        ));
        assert!(!has_negated_feature_gate("#[cfg(feature = \"x\")]"));
    }

    #[test]
    fn text_search_lead_targets_repo_scope_with_language_include() {
        let mut row = json!({"kind":"references","matches":[{"path":"a.py"}]});
        let q = query(
            json!({"path":"/repo/pkg/a.py","operation":"references","symbolName":"get","line":3}),
        );
        let scope = Scope::new("/repo".into(), vec!["*.py".into(), "*.pyi".into()]);
        annotate(&mut row, &q, Some("python"), &scope);
        let lead = &row["next"]["findText"]["query"]["queries"][0];
        assert_eq!(lead["path"], "/repo", "{row}");
        assert_eq!(lead["include"], json!(["*.py", "*.pyi"]), "{row}");
    }

    #[test]
    fn gate_and_word_detection() {
        assert!(has_feature_gate("#[cfg(all(test, feature = \"x\"))]"));
        assert!(has_feature_gate("#![cfg(feature=\"full\")]"));
        assert!(!has_feature_gate("#[cfg(test)]\nlet feature = 1;"));
        assert!(mentions_word("a(spawn_blocking)", "spawn_blocking"));
        assert!(!mentions_word("spawn_blocking_extra", "spawn_blocking"));
    }
}

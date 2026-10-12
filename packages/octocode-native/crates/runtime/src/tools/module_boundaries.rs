//! Module-boundary guard: a tool module (every `tools/` entry not listed in
//! [`SHARED_MODULES`]) reaches shared code, never another tool's internals. Two tools that import each other's
//! modules form a cycle and cannot be changed or tested apart; a primitive
//! two tools need lives in a shared module both import.
//!
//! The guard reads the production source of every tool module (test files and
//! everything from an inline `#[cfg(test)] mod` on are skipped: tests may drive
//! several tools together) and fails on any `crate::tools::<other_tool>`
//! import not listed in [`ALLOWED_EDGES`]. It also fails on a listed edge that
//! no longer exists, so the list only shrinks.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// Modules under `tools/` that are not tools: primitives any tool may import.
/// A new `tools/` entry is a tool unless it is listed here, with its reason.
const SHARED_MODULES: &[(&str, &str)] = &[
    ("ast_rule", "AST rule parsing shared by the ast tools"),
    ("bounded_process", "bounded subprocess runner"),
    ("cancel", "cancellation checks"),
    (
        "declarations_cache",
        "single-file declaration extraction cache",
    ),
    (
        "empty_walk",
        "why an empty local walk is empty: the skip causes that held matches, the rules that named them, the flags that lift them",
    ),
    ("gh_shared", "GitHub failure, paging and history helpers"),
    ("id", "tool identity and generated query limits"),
    ("leads", "follow-up queries one tool offers into another"),
    ("line_spans", "line-span arithmetic"),
    ("match_keys", "JSON/TOML key matching"),
    ("module_boundaries", "this guard"),
    ("num", "numeric conversions"),
    ("numbered", "numbered-line rendering"),
    ("output", "output channel shaping"),
    ("page_memo", "page memoization"),
    ("page_windows", "page window sizing"),
    (
        "paging",
        "contract-bounded continuation cursors and the terminal-limit writer",
    ),
    ("result", "result, error and continuation types"),
    (
        "root_read",
        "the file a directory listing leads to first, ranked once for remote and local listings",
    ),
    ("source", "bounded source reads"),
    ("stream_page", "streamed paging"),
    ("symbol_outline", "declaration outline rows"),
    ("test_support", "test fixtures"),
];

/// Tool-to-tool imports that stay, `(importer, imported, why)`. Each is one-way
/// (the imported tool never imports back). Remove the entry when the edge is
/// removed (the guard fails on a stale entry).
const ALLOWED_EDGES: &[(&str, &str, &str)] = &[
    ("artifact_search", "clasify", CLASIFY_ITEMS),
    ("ast_search", "clasify", CLASIFY_ITEMS),
    ("gh_search_history", "clasify", CLASIFY_ITEMS),
    ("gh_search_repo", "clasify", CLASIFY_ITEMS),
    ("lsp_search", "clasify", CLASIFY_ITEMS),
    (
        "clasify",
        "local_fetch",
        "clasify hydrates a candidate through localFetch's declaration spans",
    ),
    (
        "gh_get_file_content",
        "local_fetch",
        "one view engine: ghGetFileContent renders fetched text through localFetch's view pipeline and result type",
    ),
    (
        "local_search",
        "local_fetch",
        "local_search leads size the localFetch reads they offer by its block and page limits",
    ),
];

const CLASIFY_ITEMS: &str =
    "the tool implements clasify's item index (`items`, `resource`) for its own rows";

fn is_test_file(path: &Path) -> bool {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    stem == "tests"
        || stem == "test_support"
        || stem.ends_with("_tests")
        || path
            .components()
            .any(|part| part.as_os_str() == "tests" || part.as_os_str() == "test_support")
}

fn rust_files(path: &Path, out: &mut Vec<PathBuf>) {
    if path.is_file() {
        if path.extension().is_some_and(|ext| ext == "rs") && !is_test_file(path) {
            out.push(path.to_owned());
        }
        return;
    }
    let mut entries: Vec<_> = std::fs::read_dir(path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    entries.sort();
    for entry in entries {
        rust_files(&entry, out);
    }
}

/// The production lines of a source file: no comments, nothing from an inline
/// `#[cfg(test)] mod … {` on (tests close the file), and no `#[cfg(test)] mod …;`
/// declaration. A `#[cfg(test)]` item before them still counts.
fn production_source(source: &str) -> String {
    let mut out = String::new();
    let mut lines = source.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("#[cfg(test)]")
            && let Some(next) = lines.peek().map(|next| next.trim())
            && (next.starts_with("mod ") || next.starts_with("pub(crate) mod "))
        {
            if next.ends_with('{') {
                break;
            }
            lines.next();
            continue;
        }
        if trimmed.starts_with("//") {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// Names `crate::tools::` is followed by: `crate::tools::x::…` and the
/// top-level items of `crate::tools::{x::…, y, …}`.
fn imported_modules(source: &str) -> Vec<String> {
    const PREFIX: &str = "crate::tools::";
    let ident_end = |text: &str| {
        text.find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
            .unwrap_or(text.len())
    };
    let mut found = Vec::new();
    let mut rest = source;
    while let Some(at) = rest.find(PREFIX) {
        rest = &rest[at + PREFIX.len()..];
        if let Some(group) = rest.strip_prefix('{') {
            let mut depth = 1;
            let mut item_start = true;
            for (index, ch) in group.char_indices() {
                match ch {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    ',' if depth == 1 => item_start = true,
                    ch if item_start && depth == 1 && !ch.is_whitespace() => {
                        let name = &group[index..];
                        found.push(name[..ident_end(name)].to_owned());
                        item_start = false;
                    }
                    _ => {}
                }
            }
        } else {
            found.push(rest[..ident_end(rest)].to_owned());
        }
    }
    found
}

/// Every `(importer, imported)` tool-module pair with one example file.
fn tool_edges(tools_dir: &Path) -> BTreeMap<(String, String), String> {
    let shared: BTreeSet<&str> = SHARED_MODULES.iter().map(|(name, _)| *name).collect();
    let tool_modules: BTreeSet<String> = std::fs::read_dir(tools_dir)
        .expect("read tools/")
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_stem()?.to_str()?.to_owned();
            (name != "mod" && !shared.contains(name.as_str())).then_some(name)
        })
        .collect();
    for (name, _) in SHARED_MODULES {
        assert!(
            tools_dir.join(name).exists() || tools_dir.join(format!("{name}.rs")).exists(),
            "SHARED_MODULES lists `{name}`, which is not under tools/: remove it"
        );
    }
    let mut edges = BTreeMap::new();
    for importer in &tool_modules {
        let dir = tools_dir.join(importer);
        let file = tools_dir.join(format!("{importer}.rs"));
        let root = if dir.is_dir() { dir } else { file };
        let mut files = Vec::new();
        rust_files(&root, &mut files);
        for path in files {
            let source = std::fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
            for imported in imported_modules(&production_source(&source)) {
                if &imported != importer && tool_modules.contains(&imported) {
                    let shown = path
                        .strip_prefix(tools_dir)
                        .unwrap_or(&path)
                        .display()
                        .to_string();
                    edges.entry((importer.clone(), imported)).or_insert(shown);
                }
            }
        }
    }
    edges
}

#[test]
fn tool_modules_import_only_shared_modules() {
    let tools_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/tools");
    let edges = tool_edges(&tools_dir);
    let allowed: BTreeSet<(String, String)> = ALLOWED_EDGES
        .iter()
        .map(|(from, to, _)| ((*from).to_owned(), (*to).to_owned()))
        .collect();
    let new: Vec<String> = edges
        .iter()
        .filter(|(edge, _)| !allowed.contains(*edge))
        .map(|((from, to), file)| format!("{from} -> {to} (e.g. tools/{file})"))
        .collect();
    assert!(
        new.is_empty(),
        "a tool module imports another tool's internals; move the shared piece to a neutral module (gh_shared, leads, result, …) both import:\n  {}",
        new.join("\n  ")
    );
    let stale: Vec<String> = allowed
        .iter()
        .filter(|edge| !edges.contains_key(*edge))
        .map(|(from, to)| format!("{from} -> {to}"))
        .collect();
    assert!(
        stale.is_empty(),
        "ALLOWED_EDGES lists an edge that no longer exists; remove it:\n  {}",
        stale.join("\n  ")
    );
}

#[test]
fn the_scanner_reads_path_and_group_imports() {
    let source = "use crate::tools::{id::ToolId, local_fetch::{A, B}, result};\n\
                  fn f() { crate::tools::gh_shared::x(); }\n\
                  // crate::tools::lsp_search::ignored\n\
                  #[cfg(test)]\nmod tests { use crate::tools::clasify::t; }\n";
    assert_eq!(
        imported_modules(&production_source(source)),
        ["id", "local_fetch", "result", "gh_shared"]
    );
}

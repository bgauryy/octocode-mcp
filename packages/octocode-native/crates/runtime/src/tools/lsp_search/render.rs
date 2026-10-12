//! Pure presentation helpers for `lspSearch`.
//!
//! Document-symbol flattening, LSP symbol-kind naming, generic result
//! pagination, and URI/path coercion. All functions are pure over
//! `serde_json::Value`; no request state, path policy, or client lives here.

use octocode_engine::lsp::uri::uri_to_path as engine_uri_to_path;
use serde_json::{Value, json};

/// One flattened document symbol: `name`, `kind`, one-based `line` (the
/// name line, a usable `line`) and `endLine` (the full extent), the
/// one-based name `character`, and `parent`/`parentLine` for a nested
/// symbol (a member, or a function's local). Every symbol is listed.
pub(super) fn flatten_document_symbol(
    value: &Value,
    output: &mut Vec<Value>,
    parent: Option<(&str, u64)>,
) {
    let Some(symbol) = value.as_object() else {
        return;
    };
    let kind = symbol_kind_name(symbol.get("kind"));
    let range = symbol
        .get("range")
        .or_else(|| symbol.get("location")?.get("range"));
    let name = symbol.get("name").and_then(Value::as_str);
    let children = symbol
        .get("children")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut line = None;
    if let (Some(name), Some(range)) = (name, range) {
        let anchor = symbol.get("selectionRange").unwrap_or(range);
        let start = anchor
            .pointer("/start/line")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            + 1;
        let mut compact = json!({
            "name": name,
            "kind": kind,
            "line": start,
            // 1-based, like every public column.
            "character": anchor.pointer("/start/character").and_then(Value::as_u64).unwrap_or(0) + 1,
            "endLine": range.pointer("/end/line").and_then(Value::as_u64).unwrap_or(0) + 1,
        });
        if let Some((parent, parent_line)) = parent {
            compact["parent"] = json!(parent);
            compact["parentLine"] = json!(parent_line);
        }
        output.push(compact);
        line = Some(start);
    }
    let parent = match (name, line) {
        (Some(name), Some(line)) => Some((name, line)),
        _ => parent,
    };
    for child in children {
        flatten_document_symbol(child, output, parent);
    }
}

/// Outline rows (`tools::symbol_outline`) for a page of flattened
/// document symbols: `endLine` only when it differs, and the column only
/// when another listed symbol starts on the same line.
pub(super) fn document_symbol_rows(page: &[Value], all: &[Value]) -> Vec<Value> {
    let mut lines = std::collections::HashMap::<u64, usize>::new();
    for symbol in all {
        *lines
            .entry(symbol["line"].as_u64().unwrap_or(0))
            .or_default() += 1;
    }
    let objects = page
        .iter()
        .map(|symbol| {
            let line = symbol["line"].as_u64().unwrap_or(0);
            let mut row = json!({"name": symbol["name"], "kind": symbol["kind"], "line": line});
            if symbol["endLine"].as_u64().is_some_and(|end| end != line) {
                row["endLine"] = symbol["endLine"].clone();
            }
            if lines.get(&line).is_some_and(|count| *count > 1) {
                row["character"] = symbol["character"].clone();
            }
            for key in ["parent", "parentLine"] {
                if let Some(value) = symbol.get(key) {
                    row[key] = value.clone();
                }
            }
            row
        })
        .collect::<Vec<_>>();
    crate::tools::symbol_outline::declaration_rows(&objects)
}

/// typescript-language-server reports a `type X = …` alias as a variable
/// (LSP has no alias kind). Name each such symbol `type` when its declaring
/// line says so; nested symbols are walked too.
pub(super) fn name_type_aliases(symbols: &mut Value, content: &str) {
    let lines: Vec<&str> = content.lines().collect();
    fn walk(symbols: &mut Value, lines: &[&str]) {
        let Some(items) = symbols.as_array_mut() else {
            return;
        };
        for symbol in items {
            if symbol["kind"].as_u64() == Some(13)
                && let Some(name) = symbol["name"].as_str()
                && let Some(line) = symbol
                    .pointer("/selectionRange/start/line")
                    .or_else(|| symbol.pointer("/range/start/line"))
                    .and_then(Value::as_u64)
                    .and_then(|line| lines.get(usize::try_from(line).ok()?))
                && declares_type_alias(line, name)
            {
                symbol["kind"] = json!("type");
            }
            if let Some(children) = symbol.get_mut("children") {
                walk(children, lines);
            }
        }
    }
    walk(symbols, &lines);
}

/// `[export] [declare] type <name>` at the start of a line.
fn declares_type_alias(line: &str, name: &str) -> bool {
    let mut rest = line.trim_start();
    for keyword in ["export ", "declare "] {
        if let Some(after) = rest.strip_prefix(keyword) {
            rest = after.trim_start();
        }
    }
    rest.strip_prefix("type ")
        .map(str::trim_start)
        .and_then(|after| after.strip_prefix(name))
        .is_some_and(|after| {
            after
                .chars()
                .next()
                .is_none_or(|c| !(c.is_alphanumeric() || c == '_' || c == '$'))
        })
}

pub(super) fn symbol_kind_name(kind: Option<&Value>) -> String {
    if let Some(kind) = kind.and_then(Value::as_str) {
        return kind.to_owned();
    }
    match kind.and_then(Value::as_u64) {
        Some(1) => "file",
        Some(2) => "module",
        Some(3) => "namespace",
        Some(4) => "package",
        Some(5) => "class",
        Some(6) => "method",
        Some(7) => "property",
        Some(8) => "field",
        Some(9) => "constructor",
        Some(10) => "enum",
        Some(11) => "interface",
        Some(12) => "function",
        Some(13) => "variable",
        Some(14) => "constant",
        Some(15) => "string",
        Some(16) => "number",
        Some(17) => "boolean",
        Some(18) => "array",
        Some(19) => "object",
        Some(20) => "key",
        Some(21) => "null",
        Some(22) => "enumMember",
        Some(23) => "struct",
        Some(24) => "event",
        Some(25) => "operator",
        Some(26) => "typeParameter",
        _ => "unknown",
    }
    .to_owned()
}

/// How one page is cut: the caller's explicit `pageSize` (a row count), else
/// as many rows as fit `budget` characters, each row costing its `sizes`
/// entry.
pub(super) struct PageCut<'a> {
    pub(super) page_size: Option<u32>,
    pub(super) budget: usize,
    pub(super) sizes: &'a [usize],
}

/// One page of `items` with the `nextPage` cursor the response stage moves to
/// `next`. A page past the end is empty, terminal and flagged `outOfRange`,
/// never clamped to the last page, which would repeat rows the caller has.
pub(super) fn paginate(items: &[Value], page: u32, cut: &PageCut<'_>) -> (Vec<Value>, Value) {
    let (range, pagination) = page_window(page, cut);
    (items[range].to_vec(), pagination)
}

/// The item range of one page over the `cut.sizes` items, with its
/// pagination (see [`paginate`]).
pub(super) fn page_window(page: u32, cut: &PageCut<'_>) -> (std::ops::Range<usize>, Value) {
    use crate::response::pages::PageFacts;
    use crate::tools::page_windows::Paging;
    let total = cut.sizes.len();
    let page = (page.max(1)) as usize;
    let paging = Paging::of(cut.page_size.map(|size| size as usize), cut.budget);
    let windows = paging.windows(cut.sizes);
    let range = windows.get(page - 1).cloned().unwrap_or(total..total);
    let more = page < windows.len();
    let facts = match paging {
        Paging::Count(size) => PageFacts::counted(page, size, total),
        Paging::Chars(_) => PageFacts::sized(page, windows.len(), total, more),
    };
    let mut pagination = facts.out_of_range(page > windows.len().max(1)).to_value();
    if more {
        pagination["nextPage"] = json!(page + 1);
    }
    (range, pagination)
}

/// Characters each row costs a page when it prints as its own JSON.
pub(super) fn plain_sizes(items: &[Value]) -> Vec<usize> {
    items
        .iter()
        .map(|item| crate::tools::stream_page::json_chars(item) + 1)
        .collect()
}

pub(super) fn as_array(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(values) => values.clone(),
        Value::Null => vec![],
        other => vec![other.clone()],
    }
}

pub(super) fn decode_uri_path(uri: &str) -> Result<String, String> {
    if uri.starts_with("file:") {
        engine_uri_to_path(uri).map_err(|error| error.to_string())
    } else {
        Ok(uri.to_owned())
    }
}

pub(super) fn uri_to_path(uri: &str) -> String {
    decode_uri_path(uri).unwrap_or_else(|_| uri.to_owned())
}

/// Language ids served by the TypeScript server.
pub(super) const TS_LANGUAGE_IDS: [&str; 4] = [
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
];

/// A word-bounded literal regex for `name` in the default (`rust`) engine.
pub(super) fn word_pattern(name: &str) -> String {
    let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let mut pattern = regex::escape(name);
    if word(name.chars().next()) {
        pattern.insert_str(0, "\\b");
    }
    if word(name.chars().last()) {
        pattern.push_str("\\b");
    }
    pattern
}

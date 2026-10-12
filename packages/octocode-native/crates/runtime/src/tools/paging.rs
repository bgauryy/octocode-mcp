//! The one owner of numeric continuation cursors (`page`, `matchPage`,
//! `importerPage`, `scanOffset`, …): a continuation names a cursor value only
//! when the tool's query schema admits it. Past the schema `maximum` the row
//! ends at a terminal limit instead, written by [`terminal_limit`], the one
//! writer of `terminalLimit`, so the rest is stated as unreachable rather
//! than offered by a lead the tool would reject.
use serde_json::{Value, json};

use crate::tools::id::ToolId;

/// The `partialReasons` entry of a row whose next cursor is past the
/// contract maximum of its field.
pub(crate) const CURSOR_MAXIMUM: &str = "cursorMaximum";

/// `next` when `tool`'s query schema (the variant admitting `operation`)
/// admits it as the value of the cursor `field`: at most its `maximum`.
pub(crate) fn admitted(
    tool: ToolId,
    operation: Option<&str>,
    field: &str,
    next: usize,
) -> Option<usize> {
    (next <= crate::contracts::query_schema_max(tool, operation, field)).then_some(next)
}

/// The cursor value `next` of `field` when [`admitted`]. Otherwise marks `row` as ending
/// at a terminal limit, with a warning naming the field and its maximum, and
/// returns `None`: the caller offers no continuation.
pub(crate) fn next_cursor(
    row: &mut Value,
    tool: ToolId,
    operation: Option<&str>,
    field: &str,
    next: usize,
) -> Option<usize> {
    if let Some(next) = admitted(tool, operation, field, next) {
        return Some(next);
    }
    let maximum = crate::contracts::query_schema_max(tool, operation, field);
    terminal_limit(
        row,
        CURSOR_MAXIMUM,
        &[format!(
            "terminalLimit: {field}:{maximum} is the last a continuation may request; the rest is on no page."
        )],
    );
    None
}

/// Marks `row` partial for `reason`: `isPartial`, the reason once in
/// `partialReasons`, and each warning once in `warnings`.
pub(crate) fn mark_partial(row: &mut Value, reason: &str, warnings: &[String]) {
    let Some(object) = row.as_object_mut() else {
        return;
    };
    object.insert("isPartial".into(), json!(true));
    if let Some(reasons) = object
        .entry("partialReasons")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        && !reasons.iter().any(|known| known == reason)
    {
        reasons.push(json!(reason));
    }
    if warnings.is_empty() {
        return;
    }
    if let Some(existing) = object
        .entry("warnings")
        .or_insert_with(|| json!([]))
        .as_array_mut()
    {
        for warning in warnings {
            if !existing.iter().any(|known| known == warning) {
                existing.push(json!(warning));
            }
        }
    }
}

/// Appends `warnings` to the row's `warnings`, creating the list only for a
/// first warning; a non-object row is left alone.
pub(crate) fn push_warnings(row: &mut Value, warnings: impl IntoIterator<Item = String>) {
    let Some(object) = row.as_object_mut() else {
        return;
    };
    for warning in warnings {
        if let Some(existing) = object
            .entry("warnings")
            .or_insert_with(|| json!([]))
            .as_array_mut()
        {
            existing.push(json!(warning));
        }
    }
}

/// Marks `row` as ending at a limit no continuation lifts: [`mark_partial`]
/// plus `terminalLimit:true`.
pub(crate) fn terminal_limit(row: &mut Value, reason: &str, warnings: &[String]) {
    mark_partial(row, reason, warnings);
    if let Some(object) = row.as_object_mut() {
        object.insert("terminalLimit".into(), json!(true));
    }
}

#[cfg(test)]
mod tests {
    use super::{CURSOR_MAXIMUM, next_cursor};
    use crate::tools::id::ToolId;
    use serde_json::{Value, json};

    /// Every bounded numeric cursor field of every tool's query schema, per
    /// variant: `(tool, operation, field, maximum)`. Cursor fields are the
    /// ones a continuation advances: pages and scan or materialize offsets.
    fn bounded_cursors() -> Vec<(ToolId, Option<String>, String, u64)> {
        let mut found = Vec::new();
        for tool in ToolId::ALL {
            let contract = crate::contracts::tool_contract(tool).expect("tool contract");
            let schema = &contract["querySchema"];
            let defs = &schema["$defs"];
            let branches = ["oneOf", "anyOf"]
                .iter()
                .find_map(|key| schema.get(*key).and_then(Value::as_array))
                .map_or_else(|| vec![schema], |branches| branches.iter().collect());
            for branch in branches {
                let branch = crate::contracts::resolve_ref(branch, defs);
                let fields = branch["properties"].as_object().into_iter().flatten();
                let operation = branch["properties"]["operation"]["const"]
                    .as_str()
                    .map(str::to_owned);
                for (field, field_schema) in fields {
                    let field_schema = crate::contracts::resolve_ref(field_schema, defs);
                    let cursor = field == "page"
                        || (field.ends_with("Page") && !field.ends_with("PerPage"))
                        || field == "scanOffset"
                        || field == "materializeOffset";
                    if let Some(maximum) = field_schema["maximum"].as_u64().filter(|_| cursor) {
                        found.push((tool, operation.clone(), field.clone(), maximum));
                    }
                }
            }
        }
        found
    }

    /// Each bounded cursor: its maximum is the last value a continuation
    /// names; one past it is a terminal limit naming the field, never a lead.
    #[test]
    fn every_bounded_cursor_ends_at_its_contract_maximum() {
        let cursors = bounded_cursors();
        for (tool, field) in [
            (ToolId::LspSearch, "page"),
            (ToolId::LspSearch, "importerPage"),
            (ToolId::GhStructure, "materializeOffset"),
            (ToolId::StructureSearch, "scanOffset"),
            (ToolId::AstTopology, "diagnosticPage"),
            (ToolId::LocalSearch, "matchPage"),
        ] {
            assert!(
                cursors.iter().any(|(t, _, f, _)| *t == tool && f == field),
                "{tool:?} {field} is found: {cursors:?}"
            );
        }
        for (tool, operation, field, maximum) in cursors {
            let maximum = usize::try_from(maximum).expect("usize maximum");
            let mut row = json!({});
            assert_eq!(
                next_cursor(&mut row, tool, operation.as_deref(), &field, maximum),
                Some(maximum),
                "{tool:?} {operation:?} {field}"
            );
            assert_eq!(row, json!({}), "an admitted cursor marks nothing");
            if maximum == usize::MAX {
                continue;
            }
            assert_eq!(
                next_cursor(&mut row, tool, operation.as_deref(), &field, maximum + 1),
                None,
                "{tool:?} {operation:?} {field}"
            );
            assert_eq!(row["terminalLimit"], true, "{row}");
            assert_eq!(row["isPartial"], true, "{row}");
            assert_eq!(row["partialReasons"], json!([CURSOR_MAXIMUM]), "{row}");
            let warning = row["warnings"][0].as_str().expect("warning");
            assert!(warning.contains(&format!("{field}:{maximum}")), "{warning}");
            assert!(warning.len() <= 120, "{warning}");
        }
    }

    /// No tool advances a contract cursor field by hand: every
    /// `field: value + 1` write of a bounded cursor field (a JSON key, an
    /// index or an insert) in the runtime's non-test sources goes through
    /// [`next_cursor`] or [`admitted`].
    #[test]
    fn no_cursor_is_advanced_outside_the_paging_helper() {
        let mut fields = bounded_cursors()
            .into_iter()
            .map(|(_, _, field, _)| field)
            .collect::<Vec<_>>();
        fields.sort();
        fields.dedup();
        let names = fields.join("|");
        let advanced = regex::Regex::new(&format!(
            r#"(\[|insert\()"({names})"(\]\s*=|\.into\(\),)\s*json!\([^;]*\+\s*1\)|"({names})"\s*:\s*[\w.()]+\s*\+\s*1\b"#
        ))
        .expect("regex");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut dirs = vec![src];
        let mut found = Vec::new();
        while let Some(dir) = dirs.pop() {
            for entry in std::fs::read_dir(&dir).expect("src dir") {
                let path = entry.expect("entry").path();
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                if path.is_dir() {
                    if name != "tests" {
                        dirs.push(path);
                    }
                    continue;
                }
                if !name.ends_with(".rs") || name == "tests.rs" || name.ends_with("_tests.rs") {
                    continue;
                }
                let text = std::fs::read_to_string(&path).expect("source");
                let text = text.split("#[cfg(test)]").next().unwrap_or_default();
                found.extend(
                    advanced
                        .find_iter(text)
                        .map(|hit| format!("{}: {}", path.display(), hit.as_str())),
                );
            }
        }
        assert!(found.is_empty(), "cursor advanced by hand: {found:#?}");
    }
}

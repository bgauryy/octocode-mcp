//! The one owner of numeric continuation cursors (`page`, `matchPage`,
//! `importerPage`, `scanOffset`, …): a continuation names a cursor value only
//! when the tool's query schema admits it. Past the schema `maximum` the row
//! ends at a terminal limit instead, written by [`terminal_limit`], the one
//! writer of `terminalLimit`, so the rest is stated as unreachable rather
//! than offered by a lead the tool would reject.
use serde_json::{Map, Value, json};

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

/// Clone a continuation query with one admitted cursor advance and any
/// numeric cursors that must restart when that outer axis advances.
pub(crate) fn admitted_query(
    tool: ToolId,
    operation: Option<&str>,
    base: &Value,
    field: &str,
    current: u32,
    resets: &[(&str, u64)],
) -> Option<Value> {
    let next = admitted(tool, operation, field, current.checked_add(1)? as usize)?;
    let mut query = base.clone();
    let row = query.as_object_mut()?;
    row.insert(field.into(), json!(next));
    for (field, value) in resets {
        row.insert((*field).into(), json!(value));
    }
    Some(query)
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

/// A row the partial owners write: a JSON row, or its object a tool is
/// still building. A non-object row is left alone.
pub(crate) trait RowFields {
    fn fields(&mut self) -> Option<&mut Map<String, Value>>;
}

impl RowFields for Value {
    fn fields(&mut self) -> Option<&mut Map<String, Value>> {
        self.as_object_mut()
    }
}

impl RowFields for Map<String, Value> {
    fn fields(&mut self) -> Option<&mut Map<String, Value>> {
        Some(self)
    }
}

impl<T: RowFields + ?Sized> RowFields for &mut T {
    fn fields(&mut self) -> Option<&mut Map<String, Value>> {
        (**self).fields()
    }
}

/// Appends each of `values` not already in the list under `key`, creating
/// the list (or replacing a non-list) for a first value.
fn append_once<'a>(
    object: &mut Map<String, Value>,
    key: &str,
    values: impl IntoIterator<Item = &'a str>,
) {
    let mut values = values.into_iter().peekable();
    if values.peek().is_none() {
        return;
    }
    let entry = object.entry(key).or_insert_with(|| json!([]));
    if !entry.is_array() {
        *entry = json!([]);
    }
    if let Some(list) = entry.as_array_mut() {
        for value in values {
            if !list.iter().any(|known| known == value) {
                list.push(json!(value));
            }
        }
    }
}

/// Marks `row` partial for `reason`: `isPartial`, the reason once after the
/// row's own `partialReasons`, and each warning once in `warnings`.
pub(crate) fn mark_partial(row: &mut impl RowFields, reason: &str, warnings: &[String]) {
    let Some(object) = row.fields() else {
        return;
    };
    object.insert("isPartial".into(), json!(true));
    append_once(object, "partialReasons", [reason]);
    append_once(object, "warnings", warnings.iter().map(String::as_str));
}

/// Appends each of `warnings` once to the row's `warnings`, creating the
/// list only for a first warning.
pub(crate) fn push_warnings(row: &mut impl RowFields, warnings: impl IntoIterator<Item = String>) {
    let Some(object) = row.fields() else {
        return;
    };
    let warnings = warnings.into_iter().collect::<Vec<_>>();
    append_once(object, "warnings", warnings.iter().map(String::as_str));
}

/// Marks `row` as ending at a limit no continuation lifts: [`mark_partial`]
/// plus `terminalLimit:true`.
pub(crate) fn terminal_limit(row: &mut impl RowFields, reason: &str, warnings: &[String]) {
    mark_partial(row, reason, warnings);
    if let Some(object) = row.fields() {
        object.insert("terminalLimit".into(), json!(true));
    }
}

#[cfg(test)]
mod tests {
    use super::{CURSOR_MAXIMUM, mark_partial, next_cursor, push_warnings, terminal_limit};
    use crate::tools::id::ToolId;
    use serde_json::{Map, Value, json};

    /// The partial owners write a row or its object alike: a reason is
    /// appended after the row's own once, a warning is appended once.
    #[test]
    fn partial_marks_append_once_on_a_row_or_its_object() {
        let mut object: Map<String, Value> = json!({
            "isPartial": true,
            "partialReasons": ["scopeCut"],
            "warnings": ["first"]
        })
        .as_object()
        .cloned()
        .expect("object");
        mark_partial(&mut object, "pageCeiling", &["ceiling".to_owned()]);
        mark_partial(&mut object, "pageCeiling", &["ceiling".to_owned()]);
        push_warnings(&mut object, ["first".to_owned(), "second".to_owned()]);
        assert_eq!(
            Value::Object(object.clone()),
            json!({"isPartial": true, "partialReasons": ["scopeCut", "pageCeiling"],
                "warnings": ["first", "ceiling", "second"]})
        );
        terminal_limit(&mut object, "pageCeiling", &[]);
        assert_eq!(object["terminalLimit"], true);
        assert_eq!(object["partialReasons"], json!(["scopeCut", "pageCeiling"]));
        let mut row = json!({"partialReasons": "malformed"});
        mark_partial(&mut row, "cap", &[]);
        assert_eq!(row, json!({"partialReasons": ["cap"], "isPartial": true}));
        let mut scalar = json!(1);
        push_warnings(&mut scalar, ["x".to_owned()]);
        assert_eq!(scalar, json!(1), "a non-object row is left alone");
    }

    /// Every bounded numeric cursor field of every tool's query schema, per
    /// variant: `(tool, operation, field, maximum)`. Cursor fields are the
    /// one list ([`crate::tools::result::CURSOR_FIELDS`]) less a content
    /// `offset`, which advances by its window, not by one.
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
                    let cursor = field != "offset"
                        && crate::tools::result::CURSOR_FIELDS.contains(&field.as_str());
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
        // Hand-advanced cursors the guard found once it read past each file's
        // first `#[cfg(test)]`, each owed to its tool module's migration onto
        // `admitted`; the list only shrinks.
        const PENDING: &[&str] = &[];
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut dirs = vec![src.clone()];
        let (mut found, mut pending) = (Vec::new(), Vec::new());
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
                let relative = path
                    .strip_prefix(&src)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                let text = crate::tools::test_support::production_source(&path);
                let hits = advanced
                    .find_iter(&text)
                    .map(|hit| format!("{relative}: {}", hit.as_str()));
                if PENDING.contains(&relative.as_str()) {
                    if hits.count() > 0 {
                        pending.push(relative);
                    }
                } else {
                    found.extend(hits);
                }
            }
        }
        assert!(found.is_empty(), "cursor advanced by hand: {found:#?}");
        for file in PENDING {
            assert!(
                pending.iter().any(|seen| seen == file),
                "{file} no longer advances a cursor by hand: drop it from PENDING"
            );
        }
    }
}

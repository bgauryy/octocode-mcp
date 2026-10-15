//! Shape facts the validator's repair hints read. Admission never repairs a
//! value: input the canonical schema rejects is rejected, and these facts
//! only decide which fix the message names.

use serde_json::Value;

/// The canonical line-range item pattern (`95-105`).
pub(super) const LINE_RANGE_PATTERN: &str = r"^[1-9]\d*-[1-9]\d*$";
const MAX_REF_DEPTH: usize = 32;

/// A schema and the root its `$ref`s resolve against.
type Typed<'a> = (&'a Value, &'a Value);

/// Double quotes rich-text hosts substitute for `"`.
const CURLY_DOUBLE_QUOTES: [char; 5] = ['\u{201c}', '\u{201d}', '\u{201e}', '\u{201f}', '\u{2033}'];

/// Whether `schema` (an array schema at any `$ref`/union depth) has items
/// that accept `value`, so wrapping the scalar is sound advice.
pub(super) fn items_accept(root: &Value, schema: &Value, value: &Value) -> bool {
    let schemas = flatten_all(&[(root, schema)]);
    let arrays = schemas
        .iter()
        .filter(|(_, schema)| types(schema).is_some_and(|names| names.contains(&"array")))
        .collect::<Vec<_>>();
    !arrays.is_empty()
        && arrays.iter().all(|&&(root, schema)| {
            schema.get("items").is_none_or(|items| {
                flatten_all(&[(root, items)])
                    .iter()
                    .any(|(_, item)| accepts(item, value))
            })
        })
}

/// `["…`, `[{…`, `[[…` or `[\"…`: the text is an attempted JSON array, not a
/// literal. A curly double quote, or an HTML reference to `"`, counts as `"`.
pub(super) fn looks_like_json_array(text: &str) -> bool {
    let Some(rest) = text.trim_start().strip_prefix('[') else {
        return false;
    };
    let rest = rest.trim_start();
    rest.chars()
        .next()
        .is_some_and(|c| matches!(c, '"' | '{' | '[' | '\\') || CURLY_DOUBLE_QUOTES.contains(&c))
        || rest.starts_with("&quot;")
        || rest.starts_with("&#34;")
        || rest.to_ascii_lowercase().starts_with("&#x22;")
}

/// Whether a flattened item schema's declared type admits `value`; an untyped
/// schema admits anything.
fn accepts(schema: &Value, value: &Value) -> bool {
    types(schema).is_none_or(|names| {
        names.iter().any(|name| match *name {
            "string" => value.is_string(),
            "boolean" => value.is_boolean(),
            "number" => value.is_number(),
            "integer" => value.is_i64() || value.is_u64(),
            "null" => value.is_null(),
            _ => false,
        })
    })
}

fn types(schema: &Value) -> Option<Vec<&str>> {
    match schema.get("type") {
        Some(Value::String(name)) => Some(vec![name.as_str()]),
        Some(Value::Array(names)) => Some(names.iter().filter_map(Value::as_str).collect()),
        _ => None,
    }
}

fn flatten_all<'a>(candidates: &[Typed<'a>]) -> Vec<Typed<'a>> {
    let mut schemas = Vec::new();
    for &(root, schema) in candidates {
        flatten(root, schema, 0, &mut schemas);
    }
    schemas
}

/// Resolve `$ref`s and expand union branches into the concrete schemas a
/// value may be checked against. `{"not":{}}` forbids the field in that
/// branch, so it cannot hold the value and is dropped.
fn flatten<'a>(root: &'a Value, schema: &'a Value, depth: usize, out: &mut Vec<Typed<'a>>) {
    if depth > MAX_REF_DEPTH {
        out.push((root, &Value::Null));
        return;
    }
    let schema = super::super::resolve_ref(schema, &root["$defs"]);
    if schema.get("$ref").is_some() {
        out.push((root, &Value::Null));
        return;
    }
    let branches = ["oneOf", "anyOf", "allOf"]
        .iter()
        .filter_map(|key| schema.get(key).and_then(Value::as_array))
        .flatten()
        .collect::<Vec<_>>();
    if !branches.is_empty() {
        for branch in branches {
            flatten(root, branch, depth + 1, out);
        }
        return;
    }
    let forbidden = schema.as_object().is_some_and(|object| {
        object.len() == 1
            && object
                .get("not")
                .is_some_and(|not| not == &Value::Object(Default::default()))
    });
    if !forbidden {
        out.push((root, schema));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn encoded_lists_are_recognized_and_glob_classes_are_not() {
        for encoded in [
            r#"["*.go"]"#,
            r#"[{"a":1}]"#,
            "[[1,2]]",
            r#"[\"a\"]"#,
            "[\u{201c}a\u{201d}]",
            "[&quot;a&quot;]",
        ] {
            assert!(looks_like_json_array(encoded), "{encoded}");
        }
        for literal in ["[ab]*.ts", "*.go", "[", ""] {
            assert!(!looks_like_json_array(literal), "{literal}");
        }
    }

    #[test]
    fn wrapping_is_advised_only_when_every_array_accepts_the_item() {
        let strings = json!({"type":"array","items":{"type":"string"}});
        assert!(items_accept(&strings, &strings, &json!("x")));
        assert!(!items_accept(&strings, &strings, &json!(1)));
        let not_array = json!({"type":"string"});
        assert!(!items_accept(&not_array, &not_array, &json!("x")));
    }
}

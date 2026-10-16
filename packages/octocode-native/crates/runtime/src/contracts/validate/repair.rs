//! The corrected call of a rejected input: the one `repair` hint of a
//! validation error. It is derived from the issues alone, so no tool or field
//! name appears here. Exact fixes keep what the caller asked:
//!
//! - an array value the schema's enum does not list is dropped (the field
//!   goes with its last value);
//! - a scalar that differs from one listed enum value only by case or edge
//!   whitespace becomes that value;
//! - a number outside its bounds is clamped to the nearest bound;
//! - a typed value sent as JSON text becomes that value, after validation;
//! - a literal string becomes a single-item array only when that array
//!   satisfies the field schema;
//! - a field that applies only with a sibling the row lacks is dropped (it
//!   had no effect);
//! - a `start…`/`end…` pair of line numbers becomes the one span of the
//!   row's span field (`startLine:5, endLine:9` → `ranges:["5-9"]`);
//! - an envelope field the rows declare moves into every row that lacks it;
//! - a bare array of rows becomes the `{"queries":[...]}` envelope;
//! - a row that is itself an envelope (`{"queries":[...], ...}`) is replaced
//!   by its rows: its envelope fields (`responseLength`, …) move beside
//!   `queries` and its other fields into each of its rows.
//!
//! The issues those edits reveal (the lifted rows are validated for the
//! first time) are repaired in a further pass, so one lead fixes all.
//!
//! Dropping any other unknown field, or a scalar the enum does not list,
//! loses a constraint the caller set, so that repair is lossy: it names the
//! dropped fields and the lead must say so. An unknown field whose name, or
//! an unlisted scalar that is a near miss of a listed one, is never dropped
//! (the caller may have meant that one). Any other issue (a missing field,
//! such as a required field whose unlisted value was dropped) needs a value
//! only the caller knows, so the call has no lead and the issue's message
//! names the fix. The
//! repaired input must also pass the caller's admission, so a lead never
//! names a call that is rejected again.

use serde_json::Value;

use super::ValidationIssue;

/// One edit at a path (object keys and array indices).
enum Edit {
    Set(Vec<String>, Value),
    Remove(Vec<String>),
    /// A constraint the caller set, removed: the repair is lossy.
    Drop(Vec<String>),
    /// An envelope field moved into every row that lacks it.
    IntoRows(String),
    /// A bare array of rows wrapped as the `queries` envelope.
    Wrap,
    /// Row `index` replaced by its own rows; its `envelope` fields move
    /// beside `queries`, its other fields into each lifted row.
    Flatten {
        index: usize,
        envelope: Vec<String>,
    },
    /// A field removed and the field that says it set beside it.
    Respell {
        remove: Vec<String>,
        set: Vec<String>,
        value: Value,
    },
}

/// Further passes for issues a pass's edits reveal.
const PASSES: usize = 3;

/// A repaired input and the caller's fields it dropped (empty: exact).
#[derive(Debug, PartialEq)]
pub(crate) struct Repair {
    pub input: Value,
    pub dropped: Vec<String>,
}

/// `input` with every issue fixed, or `None` when any issue has no fix or
/// `check` refuses the result with no issue left to fix. `check` returns
/// the issues of a candidate (empty: refused for a reason no edit fixes);
/// the issues a pass reveals are fixed by the next. A relocation the rows
/// do not accept falls back to dropping the field (lossy).
pub(crate) fn repair_input(
    input: &Value,
    issues: &[ValidationIssue],
    check: impl Fn(&Value) -> Result<(), Vec<ValidationIssue>>,
) -> Option<Repair> {
    repair_pass(input, issues, &check, PASSES)
}

fn repair_pass(
    input: &Value,
    issues: &[ValidationIssue],
    check: &dyn Fn(&Value) -> Result<(), Vec<ValidationIssue>>,
    passes: usize,
) -> Option<Repair> {
    if issues.is_empty() || passes == 0 {
        return None;
    }
    let edits = issues
        .iter()
        .map(|issue| fix(input, issue))
        .collect::<Option<Vec<_>>>()?;
    let relocates = edits.iter().any(|edit| matches!(edit, Edit::IntoRows(_)));
    let attempt = |relocate: bool| {
        let repair = apply(input, &edits, relocate)?;
        match check(&repair.input) {
            Ok(()) => Some(repair),
            Err(revealed) => {
                let mut rest = repair_pass(&repair.input, &revealed, check, passes - 1)?;
                rest.dropped.extend(repair.dropped);
                rest.dropped.sort();
                rest.dropped.dedup();
                Some(rest)
            }
        }
    };
    attempt(true).or_else(|| relocates.then(|| attempt(false)).flatten())
}

fn apply(input: &Value, edits: &[Edit], relocate: bool) -> Option<Repair> {
    let mut repaired = input.clone();
    let mut removals = Vec::new();
    let mut dropped = Vec::new();
    // Shape edits stand alone: they change the row indices other edits name,
    // so a pass with one has only shape edits (later rows first).
    if edits.iter().any(|edit| matches!(edit, Edit::Wrap)) {
        repaired = serde_json::json!({ "queries": repaired });
    }
    let mut flattens = edits
        .iter()
        .filter_map(|edit| match edit {
            Edit::Flatten { index, envelope } => Some((*index, envelope)),
            _ => None,
        })
        .collect::<Vec<_>>();
    flattens.sort_by_key(|(index, _)| std::cmp::Reverse(*index));
    for (index, envelope) in flattens {
        flatten(&mut repaired, index, envelope)?;
    }
    for edit in edits {
        match edit {
            Edit::Set(path, value) => *pointer_mut(&mut repaired, path)? = value.clone(),
            Edit::Remove(path) => removals.push(path.clone()),
            Edit::Drop(path) => {
                dropped.push(path.join("."));
                removals.push(path.clone());
            }
            Edit::IntoRows(field) if relocate => {
                let value = repaired.get(field)?.clone();
                for row in repaired.get_mut("queries")?.as_array_mut()? {
                    let row = row.as_object_mut()?;
                    if !row.contains_key(field) {
                        row.insert(field.clone(), value.clone());
                    }
                }
                removals.push(vec![field.clone()]);
            }
            Edit::IntoRows(field) => {
                dropped.push(field.clone());
                removals.push(vec![field.clone()]);
            }
            Edit::Respell { remove, set, value } => {
                let (field, parent) = set.split_last()?;
                pointer_mut(&mut repaired, parent)?
                    .as_object_mut()?
                    .insert(field.clone(), value.clone());
                removals.push(remove.clone());
            }
            Edit::Wrap | Edit::Flatten { .. } => {}
        }
    }
    remove_all(&mut repaired, removals)?;
    dropped.sort();
    dropped.dedup();
    Some(Repair {
        input: repaired,
        dropped,
    })
}

/// Replaces row `index` of `input.queries` with its own rows: a field of the
/// row that `envelope` names moves beside `queries` (unless the caller set
/// it there), any other field into each lifted row that lacks it.
fn flatten(input: &mut Value, index: usize, envelope: &[String]) -> Option<()> {
    let rows = input.get_mut("queries")?.as_array_mut()?;
    let mut row = match rows.get(index)? {
        Value::Object(row) => row.clone(),
        Value::Array(inner) => {
            let mut row = serde_json::Map::new();
            row.insert("queries".into(), Value::Array(inner.clone()));
            row
        }
        _ => return None,
    };
    let Value::Array(mut inner) = row.shift_remove("queries")? else {
        return None;
    };
    let mut lifted_envelope = Vec::new();
    for (field, value) in row {
        if envelope.contains(&field) {
            lifted_envelope.push((field, value));
            continue;
        }
        for inner_row in &mut inner {
            let inner_row = inner_row.as_object_mut()?;
            if !inner_row.contains_key(&field) {
                inner_row.insert(field.clone(), value.clone());
            }
        }
    }
    rows.splice(index..=index, inner);
    let object = input.as_object_mut()?;
    for (field, value) in lifted_envelope {
        object.entry(field).or_insert(value);
    }
    Some(())
}

/// The edit that clears `issue`, when there is one.
fn fix(input: &Value, issue: &ValidationIssue) -> Option<Edit> {
    let path = issue.path.clone();
    // A field that conflicts with a sibling the caller set: removing it
    // keeps every constraint the sibling states.
    if issue
        .schema
        .as_ref()
        .is_some_and(|schema| schema.get("conflictsWith").is_some())
    {
        return Some(Edit::Remove(path));
    }
    match issue.rule_id.as_str() {
        super::super::ENVELOPE_ARRAY => input.is_array().then_some(Edit::Wrap),
        super::super::ENVELOPE_NESTED => {
            let [queries, index, ..] = path.as_slice() else {
                return None;
            };
            (queries == "queries").then_some(())?;
            let envelope = issue
                .schema
                .as_ref()
                .and_then(|schema| schema.get("envelopeFields")?.as_array())
                .map(|fields| {
                    fields
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            Some(Edit::Flatten {
                index: index.parse().ok()?,
                envelope,
            })
        }
        "schema.unknown-field" => {
            let known = issue
                .schema
                .as_ref()
                .and_then(|schema| schema.get("knownFields")?.as_array())
                .map(|fields| fields.iter().filter_map(Value::as_str).collect::<Vec<_>>())
                .unwrap_or_default();
            let field = path.last()?;
            if let Some(edit) = span_respelling(input, issue) {
                return Some(edit);
            }
            // A field another form of the row declares had no effect here:
            // removing it is exact, whatever spelling it resembles.
            if super::sibling_requirement(issue).is_some() {
                return Some(Edit::Remove(path));
            }
            if super::suggest_field(field, &known).is_some() {
                return None;
            }
            if let [field] = path.as_slice()
                && input.get("queries").is_some_and(Value::is_array)
            {
                return Some(Edit::IntoRows(field.clone()));
            }
            Some(Edit::Drop(path))
        }
        "schema.enum" => {
            let allowed = issue.schema.as_ref()?.get("enum")?.as_array()?;
            let (_, parent) = path.split_last()?;
            if pointer(input, parent)?.is_array() {
                return Some(Edit::Remove(path));
            }
            let received = issue.received.as_ref()?.as_str()?.trim();
            let mut matches = allowed.iter().filter(|value| {
                value
                    .as_str()
                    .is_some_and(|v| v.eq_ignore_ascii_case(received))
            });
            if let Some(only) = matches.next() {
                return matches
                    .next()
                    .is_none()
                    .then(|| Edit::Set(path, only.clone()));
            }
            // A near miss of a listed value names what the caller meant, which
            // only the caller can confirm. Any other unlisted value is
            // dropped like an unknown field (lossy, named): the field's
            // default applies, and a field the row requires is revealed and
            // refused by the next pass.
            let listed = allowed.iter().filter_map(Value::as_str).collect::<Vec<_>>();
            super::suggest_field(received, &listed)
                .is_none()
                .then_some(Edit::Drop(path))
        }
        "schema.range" => {
            let schema = issue.schema.as_ref()?;
            let number = issue.received.as_ref()?.as_f64()?;
            let limit = |key: &str| schema.get(key).and_then(Value::as_f64);
            let bound = match (
                limit("minimum").filter(|minimum| number < *minimum),
                limit("maximum").filter(|maximum| number > *maximum),
            ) {
                (Some(bound), _) | (None, Some(bound)) => bound,
                (None, None) => return None,
            };
            Some(Edit::Set(path, bound_value(bound)))
        }
        "schema.type" => {
            let text = issue.received.as_ref()?.as_str()?.trim();
            let value = match issue.schema.as_ref()?.get("type")?.as_str()? {
                "integer" => Value::from(text.parse::<i64>().ok()?),
                "number" => {
                    serde_json::Number::from_f64(text.parse::<f64>().ok()?).map(Value::Number)?
                }
                "boolean" => Value::Bool(text.parse::<bool>().ok()?),
                kind @ ("array" | "object") => {
                    let parsed: Value = match serde_json::from_str(text) {
                        Ok(parsed) => parsed,
                        Err(_) if kind == "array" && !super::shape::looks_like_json_array(text) => {
                            let schema = issue.schema.as_ref()?;
                            let mut wrapped = Value::Array(vec![issue.received.as_ref()?.clone()]);
                            super::validate_input_schema(
                                schema,
                                schema,
                                &mut wrapped,
                                &mut Vec::new(),
                            )
                            .ok()?;
                            wrapped
                        }
                        Err(_) => return None,
                    };
                    if (kind == "array" && !parsed.is_array())
                        || (kind == "object" && !parsed.is_object())
                    {
                        return None;
                    }
                    parsed
                }
                _ => return None,
            };
            Some(Edit::Set(path, value))
        }
        _ => None,
    }
}

/// A `start…`/`end…` pair of line numbers (`startLine`/`endLine`,
/// `lineStart`/`lineEnd`) the row's span field (`ranges`) spells exactly:
/// the start becomes that field's one span, the end goes. `None` when the
/// pair is incomplete or not an ascending pair of positive integers, or the
/// row already sets the span field.
fn span_respelling(input: &Value, issue: &ValidationIssue) -> Option<Edit> {
    let span = issue.schema.as_ref()?.get("spanField")?.as_str()?;
    let (field, parent) = issue.path.split_last()?;
    let row = pointer(input, parent)?.as_object()?;
    if row.contains_key(span) {
        return None;
    }
    let side = |name: &str| {
        let lower = name.to_ascii_lowercase();
        [("start", true), ("end", false)]
            .into_iter()
            .find_map(|(word, start)| {
                let stem = lower
                    .strip_prefix(word)
                    .or_else(|| lower.strip_suffix(word))?;
                Some((start, stem.to_owned()))
            })
    };
    let (is_start, stem) = side(field)?;
    let (other, other_value) = row.iter().find(|(name, _)| {
        name.as_str() != field.as_str()
            && side(name).is_some_and(|(start, other)| start != is_start && other == stem)
    })?;
    let line = |value: &Value| value.as_u64().filter(|line| *line > 0);
    let (start, end) = if is_start {
        (line(&row[field.as_str()])?, line(other_value)?)
    } else {
        (line(other_value)?, line(&row[field.as_str()])?)
    };
    if start > end {
        return None;
    }
    let _ = other;
    Some(if is_start {
        let mut set = parent.to_vec();
        set.push(span.to_owned());
        Edit::Respell {
            remove: issue.path.clone(),
            set,
            value: serde_json::json!([format!("{start}-{end}")]),
        }
    } else {
        Edit::Remove(issue.path.clone())
    })
}

/// A bound as the number the schema wrote: integral bounds stay integers.
fn bound_value(bound: f64) -> Value {
    if bound.fract() == 0.0 && bound.abs() < 9.0e15 {
        Value::from(bound as i64)
    } else {
        Value::from(bound)
    }
}

/// Remove every path, later array elements first so earlier indices stay
/// valid, then every array the removals emptied, which leaves its field.
fn remove_all(input: &mut Value, mut paths: Vec<Vec<String>>) -> Option<()> {
    paths.sort_by(|a, b| compare(b, a));
    paths.dedup();
    let mut emptied = Vec::new();
    for path in &paths {
        let (last, parent_path) = path.split_last()?;
        let parent = pointer_mut(input, parent_path)?;
        match parent {
            Value::Object(object) => {
                object.shift_remove(last)?;
            }
            Value::Array(items) => {
                let index = last.parse::<usize>().ok().filter(|i| *i < items.len())?;
                items.remove(index);
                if items.is_empty() {
                    emptied.push(parent_path.to_vec());
                }
            }
            _ => return None,
        }
    }
    emptied.sort_by(|a, b| compare(b, a));
    emptied.dedup();
    for path in emptied {
        let (field, parent_path) = path.split_last()?;
        if let Value::Object(object) = pointer_mut(input, parent_path)? {
            object.shift_remove(field);
        }
    }
    Some(())
}

/// Paths in order, indices by number: `queries.10` follows `queries.2`.
fn compare(a: &[String], b: &[String]) -> std::cmp::Ordering {
    for (x, y) in a.iter().zip(b) {
        let order = match (x.parse::<usize>(), y.parse::<usize>()) {
            (Ok(x), Ok(y)) => x.cmp(&y),
            _ => x.cmp(y),
        };
        if order.is_ne() {
            return order;
        }
    }
    a.len().cmp(&b.len())
}

fn pointer<'a>(input: &'a Value, path: &[String]) -> Option<&'a Value> {
    path.iter().try_fold(input, |value, segment| match value {
        Value::Object(object) => object.get(segment),
        Value::Array(items) => items.get(segment.parse::<usize>().ok()?),
        _ => None,
    })
}

fn pointer_mut<'a>(input: &'a mut Value, path: &[String]) -> Option<&'a mut Value> {
    path.iter().try_fold(input, |value, segment| match value {
        Value::Object(object) => object.get_mut(segment),
        Value::Array(items) => items.get_mut(segment.parse::<usize>().ok()?),
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn issue(
        rule: &str,
        path: &[&str],
        schema: Option<Value>,
        received: Option<Value>,
    ) -> ValidationIssue {
        ValidationIssue {
            rule_id: rule.into(),
            path: path.iter().map(|s| (*s).to_owned()).collect(),
            message: String::new(),
            schema,
            received,
        }
    }

    fn always(_: &Value) -> Result<(), Vec<ValidationIssue>> {
        Ok(())
    }

    /// `accepts` as a check that refuses with nothing left to fix.
    fn only(
        accepts: impl Fn(&Value) -> bool,
    ) -> impl Fn(&Value) -> Result<(), Vec<ValidationIssue>> {
        move |candidate| accepts(candidate).then_some(()).ok_or_else(Vec::new)
    }

    #[test]
    fn unlisted_array_values_drop_and_the_emptied_field_goes() {
        let input = json!({"queries":[{"sections":["files","x","patches","y"],"only":["z"]}]});
        let allowed = json!({"enum":["files","patches"]});
        let issues = [
            issue(
                "schema.enum",
                &["queries", "0", "sections", "1"],
                Some(allowed.clone()),
                Some(json!("x")),
            ),
            issue(
                "schema.enum",
                &["queries", "0", "sections", "3"],
                Some(allowed.clone()),
                Some(json!("y")),
            ),
            issue(
                "schema.enum",
                &["queries", "0", "only", "0"],
                Some(allowed),
                Some(json!("z")),
            ),
        ];
        let repaired = repair_input(&input, &issues, always).expect("exact fix");
        assert_eq!(
            repaired.input,
            json!({"queries":[{"sections":["files","patches"]}]})
        );
        assert!(repaired.dropped.is_empty());
    }

    #[test]
    fn row_indices_past_nine_remove_in_numeric_order() {
        let rows = (0..12).map(|i| json!({"extra": i})).collect::<Vec<_>>();
        let input = json!({"queries": rows});
        let issues = [2, 10, 11].map(|i| {
            let index = i.to_string();
            issue(
                "schema.unknown-field",
                &["queries", &index, "extra"],
                None,
                None,
            )
        });
        let repaired = repair_input(&input, &issues, always).expect("lossy fix");
        assert_eq!(
            repaired.dropped,
            ["queries.10.extra", "queries.11.extra", "queries.2.extra"]
        );
        let repaired = repaired.input;
        assert!(
            repaired["queries"]
                .as_array()
                .expect("rows")
                .iter()
                .enumerate()
                .all(|(i, row)| { matches!(i, 2 | 10 | 11) == row.get("extra").is_none() })
        );
    }

    #[test]
    fn scalar_enum_case_and_number_bounds_have_one_exact_fix() {
        let input = json!({"queries":[{"view":" Files ","n":500,"m":0.5}]});
        let allowed = json!({"enum":["files","paths"]});
        let issues = [
            issue(
                "schema.enum",
                &["queries", "0", "view"],
                Some(allowed),
                Some(json!(" Files ")),
            ),
            issue(
                "schema.range",
                &["queries", "0", "n"],
                Some(json!({"minimum":1,"maximum":100})),
                Some(json!(500)),
            ),
            issue(
                "schema.range",
                &["queries", "0", "m"],
                Some(json!({"minimum":1})),
                Some(json!(0.5)),
            ),
        ];
        let repaired = repair_input(&input, &issues, always).expect("exact fix");
        assert_eq!(
            repaired.input,
            json!({"queries":[{"view":"files","n":100,"m":1}]})
        );
        assert!(repaired.dropped.is_empty());
    }

    #[test]
    fn a_fix_that_needs_the_caller_has_no_lead() {
        let input = json!({"queries":[{"view":"file"}]});
        let allowed = json!({"enum":["files","paths"]});
        let near_miss = issue(
            "schema.enum",
            &["queries", "0", "view"],
            Some(allowed.clone()),
            Some(json!("file")),
        );
        assert!(repair_input(&input, &[near_miss], always).is_none());
        // An unlisted value of a required field: dropping it reveals the
        // missing field, which no edit fixes.
        let input = json!({"queries":[{"view":"none"}]});
        let unlisted = issue(
            "schema.enum",
            &["queries", "0", "view"],
            Some(allowed),
            Some(json!("none")),
        );
        let required = |candidate: &Value| match candidate.pointer("/queries/0/view") {
            Some(_) => Ok(()),
            None => Err(vec![issue(
                "schema.required",
                &["queries", "0", "view"],
                None,
                None,
            )]),
        };
        assert!(repair_input(&input, &[unlisted], required).is_none());
        let missing = issue("schema.required", &["queries", "0", "path"], None, None);
        let unknown = issue(
            "schema.unknown-field",
            &["queries", "0", "view"],
            None,
            None,
        );
        assert!(repair_input(&input, &[unknown, missing], always).is_none());
        assert!(repair_input(&input, &[], always).is_none());
    }

    /// An unlisted value of an optional field is dropped, named as lossy:
    /// the field's default applies.
    #[test]
    fn an_unlisted_optional_value_drops_and_is_named_as_lossy() {
        let input = json!({"queries":[{"path":"a.ts","minify":"none"}]});
        let unlisted = issue(
            "schema.enum",
            &["queries", "0", "minify"],
            Some(json!({"enum":["standard","symbols"]})),
            Some(json!("none")),
        );
        let repaired = repair_input(&input, &[unlisted], always).expect("lossy repair");
        assert_eq!(repaired.input, json!({"queries":[{"path":"a.ts"}]}));
        assert_eq!(repaired.dropped, ["queries.0.minify"]);
    }

    #[test]
    fn dropping_an_unmapped_caller_field_is_named_as_lossy() {
        let input = json!({"queries":[{"matchString":"x","glob":"*.ts"}]});
        let unknown = issue(
            "schema.unknown-field",
            &["queries", "0", "glob"],
            Some(json!({"knownFields":["matchString","include","path"]})),
            None,
        );
        let repaired = repair_input(&input, &[unknown], always).expect("lossy repair");
        assert_eq!(repaired.input, json!({"queries":[{"matchString":"x"}]}));
        assert_eq!(repaired.dropped, ["queries.0.glob"]);
    }

    #[test]
    fn a_field_inert_without_its_sibling_drops_exactly() {
        let input = json!({"queries":[{"path":"a","contextLines":2}]});
        let inert = issue(
            "schema.unknown-field",
            &["queries", "0", "contextLines"],
            Some(json!({"knownFields":["path"],"siblingRequires":["matchString"]})),
            None,
        );
        let repaired = repair_input(&input, &[inert], always).expect("exact repair");
        assert!(repaired.dropped.is_empty());
    }

    #[test]
    fn an_envelope_field_the_rows_accept_moves_into_each_row() {
        let input = json!({"mainGoal":"g","queries":[{"path":"a"},{"path":"b","mainGoal":"own"}]});
        let root = issue("schema.unknown-field", &["mainGoal"], None, None);
        let rows_accept = |candidate: &Value| candidate.get("mainGoal").is_none();
        let repaired = repair_input(&input, std::slice::from_ref(&root), only(rows_accept))
            .expect("relocation");
        assert_eq!(
            repaired.input,
            json!({"queries":[{"path":"a","mainGoal":"g"},{"path":"b","mainGoal":"own"}]})
        );
        assert!(repaired.dropped.is_empty());
        // Rows that refuse the field: the relocation falls back to a drop.
        let rows_refuse = |candidate: &Value| {
            candidate["queries"].as_array().is_some_and(|rows| {
                rows.iter()
                    .all(|row| row.get("mainGoal") != Some(&json!("g")))
            })
        };
        let dropped = repair_input(&input, &[root], only(rows_refuse)).expect("lossy fallback");
        assert_eq!(dropped.dropped, ["mainGoal"]);
    }

    #[test]
    fn a_number_or_boolean_sent_as_text_becomes_the_value() {
        let input = json!({"queries":[{"n":"3","b":" true ","x":"three"}]});
        let typed = |field: &str, kind: &str, text: &str| {
            issue(
                "schema.type",
                &["queries", "0", field],
                Some(json!({"type":kind})),
                Some(json!(text)),
            )
        };
        let repaired = repair_input(
            &input,
            &[typed("n", "integer", "3"), typed("b", "boolean", " true ")],
            always,
        )
        .expect("exact coercion");
        assert_eq!(
            repaired.input,
            json!({"queries":[{"n":3,"b":true,"x":"three"}]})
        );
        assert!(repair_input(&input, &[typed("x", "integer", "three")], always).is_none());
    }

    #[test]
    fn an_encoded_object_repairs_against_the_actual_tool_schema() {
        let questions = json!({"present":{"type":"noul","instructions":"Is the word present?"}});
        let input = json!({"queries":[{"state":"word","questions":questions.to_string()}]});
        let check = |value: &Value| {
            crate::contracts::prepare_many_and_validate("clasify", value.clone())
                .map(|_| ())
                .map_err(|error| error.issues)
        };
        let issues = check(&input).expect_err("object must not be a string");
        let repaired = repair_input(&input, &issues, check).expect("validated object repair");
        assert_eq!(repaired.input["queries"][0]["questions"], questions);
        assert!(repaired.dropped.is_empty());
    }

    #[test]
    fn singleton_repair_preserves_literals_and_requires_the_whole_array_schema() {
        for (schema, text, expected) in [
            (
                json!({"type":"array","items":{"type":"string"}}),
                " [ab]*.ts ",
                true,
            ),
            (
                json!({"type":"array","items":{"enum":["allowed"]}}),
                "different",
                false,
            ),
            (
                json!({"type":"array","minItems":2,"items":{"type":"string"}}),
                "one",
                false,
            ),
            (
                json!({"type":"array","items":{"type":"number"}}),
                "one",
                false,
            ),
            (
                json!({"type":"array","items":{"type":"string"}}),
                "[\"unfinished",
                false,
            ),
        ] {
            let input = json!({"value":text});
            let problem = issue("schema.type", &["value"], Some(schema), Some(json!(text)));
            let repair = repair_input(&input, &[problem], always);
            assert_eq!(repair.is_some(), expected, "{text}");
            if let Some(repair) = repair {
                assert_eq!(repair.input, json!({"value":[text]}));
                assert!(repair.dropped.is_empty());
            }
        }
    }

    /// A bare array of rows becomes the envelope, exactly.
    #[test]
    fn a_bare_array_becomes_the_envelope() {
        let input = json!([{"path":"a"},{"path":"b"}]);
        let wrap = issue(crate::contracts::ENVELOPE_ARRAY, &[], None, None);
        let repaired = repair_input(&input, &[wrap], always).expect("exact");
        assert_eq!(
            repaired.input,
            json!({"queries":[{"path":"a"},{"path":"b"}]})
        );
        assert!(repaired.dropped.is_empty());
    }

    /// A nested envelope's rows replace it; its envelope fields move beside
    /// `queries` and its row fields into each lifted row; the issues the
    /// lifted rows then show are repaired in the next pass (an unknown
    /// field is dropped, named).
    #[test]
    fn a_nested_envelope_is_lifted_and_its_fields_kept_or_named() {
        let input = json!({"queries":[
            {"path":"z"},
            {"bogus":1,"responseLength":3000,"extras":["stats"],
                "queries":[{"path":"a"},{"path":"b","extras":["hints"]}]}
        ]});
        let nested = issue(
            crate::contracts::ENVELOPE_NESTED,
            &["queries", "1", "queries"],
            Some(json!({"envelopeFields":["responseLength"]})),
            None,
        );
        let check = |candidate: &Value| -> Result<(), Vec<ValidationIssue>> {
            let rows = candidate["queries"].as_array().cloned().unwrap_or_default();
            let unknown = rows
                .iter()
                .enumerate()
                .filter(|(_, row)| row.get("bogus").is_some())
                .map(|(i, _)| {
                    let index = i.to_string();
                    issue(
                        "schema.unknown-field",
                        &["queries", &index, "bogus"],
                        None,
                        None,
                    )
                })
                .collect::<Vec<_>>();
            if unknown.is_empty() {
                Ok(())
            } else {
                Err(unknown)
            }
        };
        let repaired = repair_input(&input, &[nested], check).expect("lifted");
        assert_eq!(
            repaired.input,
            json!({"queries":[
                {"path":"z"},
                {"path":"a","extras":["stats"]},
                {"path":"b","extras":["hints"]}
            ],"responseLength":3000})
        );
        assert_eq!(repaired.dropped, ["queries.1.bogus", "queries.2.bogus"]);
    }

    #[test]
    fn a_repair_the_caller_refuses_is_not_offered() {
        let input = json!({"queries":[{"extra":1}]});
        let unknown = issue(
            "schema.unknown-field",
            &["queries", "0", "extra"],
            None,
            None,
        );
        assert!(repair_input(&input, &[unknown], only(|_| false)).is_none());
    }
}

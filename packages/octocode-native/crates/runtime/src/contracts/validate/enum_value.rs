//! The listed enum value an unlisted scalar means, when exactly one does:
//! the value a repair sets and an enum error names (`did you mean`). The
//! rules apply in order, and each must single out one listed value; a rule
//! that fits several stops the search (the caller must choose):
//!
//! 1. case and edge whitespace (`" Files "` → `files`);
//! 2. separators and case (`type-definition` → `typeDefinition`);
//! 3. an on/off word, or the field's own name (`regex:"regex"`), as the
//!    boolean it says (`regex:true` → `"rust"`);
//! 4. an abbreviation: the same first letter, the shorter spelling a
//!    subsequence of the longer (`file` → `f`, `refs` → `references`,
//!    `pr` → `pullRequest`);
//! 5. the one nearest spelling within `max(1, len/4)` edits.
//!
//! An array member never maps: a value one list item lacks is another
//! item's (`comments` is no misspelled `commits`).

use serde_json::Value;

/// The listed value `received` means for `field`, if exactly one.
pub(super) fn enum_value<'a>(
    allowed: &'a [Value],
    received: &Value,
    field: &str,
) -> Option<&'a str> {
    if received.is_boolean() {
        return super::schema::boolean_enum_value(allowed, received);
    }
    let text = received.as_str()?.trim();
    let listed = allowed.iter().filter_map(Value::as_str).collect::<Vec<_>>();
    let lower = text.to_lowercase();
    let squash = |value: &str| {
        value
            .chars()
            .filter(|c| !matches!(c, '-' | '_' | ' '))
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    let squashed = squash(text);
    let boolean = match lower.as_str() {
        "true" | "on" | "yes" => Some(true),
        "false" | "off" | "no" => Some(false),
        _ if lower == field.to_lowercase() => Some(true),
        _ => None,
    };
    let rules: [&dyn Fn(&str) -> bool; 4] = [
        &|value| value.eq_ignore_ascii_case(text),
        &|value| squash(value) == squashed,
        &|value| {
            boolean.is_some_and(|on| {
                super::schema::boolean_enum_value(allowed, &Value::Bool(on)) == Some(value)
            })
        },
        &|value| abbreviates(&lower, &value.to_lowercase()),
    ];
    for rule in rules {
        let mut fits = listed.iter().copied().filter(|value| rule(value));
        if let Some(only) = fits.next() {
            return fits.next().is_none().then_some(only);
        }
    }
    let budget = (text.chars().count() / 4).max(1);
    let mut nearest = listed
        .iter()
        .map(|value| (super::levenshtein(&lower, &value.to_lowercase()), *value))
        .filter(|(distance, _)| *distance <= budget)
        .collect::<Vec<_>>();
    nearest.sort_by_key(|(distance, _)| *distance);
    match nearest.as_slice() {
        [(_, only)] => Some(only),
        [(first, only), (second, _), ..] if first < second => Some(only),
        _ => None,
    }
}

/// The enum error's suffix naming the value a scalar means: the boolean
/// note (`booleans are not accepted; use "rust"`) or `(did you mean 'f'?)`.
/// An array member (an index last in `path`) gets only the boolean note.
pub(super) fn enum_hint(allowed: &[Value], received: &Value, path: &[String]) -> String {
    if let Some(hint) = super::schema::boolean_enum_hint(allowed, received) {
        return hint;
    }
    match path.last() {
        Some(field) if field.parse::<usize>().is_err() => enum_value(allowed, received, field)
            .map(|value| format!(" (did you mean '{value}'?)"))
            .unwrap_or_default(),
        _ => String::new(),
    }
}

/// Whether one spelling abbreviates the other: distinct, the same first
/// letter, and the shorter's letters appear in order in the longer.
fn abbreviates(a: &str, b: &str) -> bool {
    let (short, long) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    if short.is_empty() || short == long || short.chars().next() != long.chars().next() {
        return false;
    }
    let mut letters = long.chars();
    short.chars().all(|c| letters.any(|l| l == c))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn listed(values: &[&str]) -> Vec<Value> {
        values.iter().map(|value| json!(value)).collect()
    }

    #[test]
    fn each_rule_maps_a_scalar_to_its_one_listed_value() {
        let lsp = listed(&[
            "definition",
            "references",
            "callers",
            "callees",
            "hover",
            "typeDefinition",
        ]);
        let regex = listed(&["literal", "rust", "pcre2"]);
        for (allowed, field, received, expected) in [
            (
                listed(&["files", "paths"]),
                "view",
                json!(" Files "),
                Some("files"),
            ),
            (
                lsp.clone(),
                "operation",
                json!("type-definition"),
                Some("typeDefinition"),
            ),
            (regex.clone(), "regex", json!("regex"), Some("rust")),
            (regex.clone(), "regex", json!("off"), Some("literal")),
            (regex.clone(), "regex", json!(true), Some("rust")),
            (listed(&["f", "d"]), "entryType", json!("file"), Some("f")),
            (
                listed(&["f", "d"]),
                "entryType",
                json!("directory"),
                Some("d"),
            ),
            (lsp.clone(), "operation", json!("refs"), Some("references")),
            (lsp.clone(), "operation", json!("ref"), Some("references")),
            (
                lsp.clone(),
                "operation",
                json!("reference"),
                Some("references"),
            ),
            (
                listed(&["pullRequest", "issue", "commit"]),
                "operation",
                json!("pr"),
                Some("pullRequest"),
            ),
            (lsp.clone(), "operation", json!("jover"), Some("hover")),
            // No listed value, or several, fits: the caller chooses.
            (
                listed(&["smart", "sensitive", "insensitive"]),
                "caseMode",
                json!("ignore"),
                None,
            ),
            (lsp, "operation", json!("c"), None),
            (
                listed(&["standard", "symbols"]),
                "minify",
                json!("none"),
                None,
            ),
            (regex, "regex", json!(3), None),
        ] {
            assert_eq!(
                enum_value(&allowed, &received, field),
                expected,
                "{received}"
            );
        }
    }

    #[test]
    fn the_enum_hint_names_the_value_only_for_a_scalar_field() {
        let allowed = listed(&["f", "d"]);
        let scalar = ["queries".to_owned(), "0".to_owned(), "entryType".to_owned()];
        assert_eq!(
            enum_hint(&allowed, &json!("file"), &scalar),
            " (did you mean 'f'?)"
        );
        assert_eq!(enum_hint(&allowed, &json!("x"), &scalar), "");
        let member = ["queries".to_owned(), "0".to_owned(), "1".to_owned()];
        assert_eq!(enum_hint(&allowed, &json!("file"), &member), "");
        assert!(
            enum_hint(&listed(&["literal", "rust"]), &json!(true), &member).contains("\"rust\"")
        );
    }
}

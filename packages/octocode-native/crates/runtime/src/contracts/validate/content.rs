//! Interpreter for the canonical content extraction and controls opcodes.
use super::{ContractValidationError, issue};
use serde_json::Value;

pub(super) fn validate(input: &Value, extraction: bool) -> Result<(), ContractValidationError> {
    let mut issues = Vec::new();
    for (index, query) in input
        .get("queries")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        let full = query.get("fullContent") == Some(&Value::Bool(true));
        let matched = query.get("matchString").is_some();
        let ranged = query.get("ranges").is_some();
        let mut add = |condition: bool, rule: &str, field: &str, message: &str| {
            if condition {
                issues.extend(
                    issue(
                        rule,
                        vec!["queries".into(), index.to_string(), field.into()],
                        message,
                    )
                    .issues,
                );
            }
        };
        if extraction {
            add(
                full && (matched || ranged),
                "content.extraction-mode",
                "fullContent",
                "fullContent reads the whole file; drop it to select lines.",
            );
            add(
                query.get("block") == Some(&Value::Bool(true)) && !(matched || ranged),
                "content.block-selector",
                "block",
                "block widens ranges or matchString; set one.",
            );
        } else {
            add(
                query.get("contextLines").is_some() && !matched,
                "content.context-selector",
                "contextLines",
                "contextLines requires matchString; omit it for other reads.",
            );
            add(
                full && ["offset", "length", "unit"]
                    .iter()
                    .any(|field| query.get(field).is_some()),
                "content.full-controls",
                "fullContent",
                "Remove unit, offset, and length when fullContent is true.",
            );
            add(
                query.get("minify").and_then(Value::as_str) == Some("symbols")
                    && (matched || ranged),
                "content.symbol-selector",
                "minify",
                "minify:\"symbols\" cannot accompany matchString or ranges. Read the outline, then select source lines.",
            );
        }
    }
    if issues.is_empty() {
        Ok(())
    } else {
        Err(ContractValidationError { issues })
    }
}

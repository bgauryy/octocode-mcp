//! Interpreters for the `ast_rewrite_rule` and `ast_rewrite_apply` opcodes.
use super::{ContractValidationError, issue, query_values};
use serde_json::Value;

pub(super) fn validate_ast_rewrite_rules(input: &Value) -> Result<(), ContractValidationError> {
    const RULE_FIELDS: [&str; 12] = [
        "pattern", "kind", "regex", "inside", "has", "precedes", "follows", "all", "any", "not",
        "matches", "stopBy",
    ];
    fn check_rule(rule: &Value, path: &mut Vec<String>) -> Result<(), ContractValidationError> {
        let Some(object) = rule.as_object() else {
            return Ok(());
        };
        if object.keys().all(|key| key == "stopBy") {
            return Err(issue(
                "ast-rewrite.rule-matcher",
                path.clone(),
                "rule must contain at least one matcher",
            ));
        }
        for field in ["inside", "has", "precedes", "follows", "not"] {
            if let Some(child) = object.get(field) {
                path.push(field.into());
                let result = check_rule(child, path);
                path.pop();
                result?;
            }
        }
        for field in ["all", "any"] {
            if let Some(children) = object.get(field).and_then(Value::as_array) {
                for (index, child) in children.iter().enumerate() {
                    path.extend([field.into(), index.to_string()]);
                    let result = check_rule(child, path);
                    path.truncate(path.len() - 2);
                    result?;
                }
            }
        }
        if let Some(child) = object.get("stopBy").filter(|v| v.is_object()) {
            path.push("stopBy".into());
            let result = check_rule(child, path);
            path.pop();
            result?;
        }
        Ok(())
    }
    for (index, query) in query_values(input) {
        let mut roots: Vec<(&str, &Value)> = Vec::new();
        if let Some(rule) = query.get("rule").filter(|v| v.is_object()) {
            roots.push(("rule", rule));
        }
        for field in ["constraints", "utils"] {
            if let Some(values) = query.get(field).and_then(Value::as_object) {
                roots.extend(values.values().map(|v| (field, v)));
            }
        }
        for (field, rule) in roots {
            if rule
                .as_object()
                .is_some_and(|o| o.keys().all(|k| RULE_FIELDS.contains(&k.as_str())))
            {
                check_rule(
                    rule,
                    &mut vec!["queries".into(), index.to_string(), field.into()],
                )?;
            }
        }
    }
    Ok(())
}

/// Batch-level half of the `ast_rewrite_apply` opcode: one request commits at
/// most one transaction, so a batch carries at most one `apply` row. Per-row
/// rules see a one-row batch, so this runs on the whole request.
pub(super) fn validate_ast_rewrite_batch(input: &Value) -> Result<(), ContractValidationError> {
    let applies = input["queries"].as_array().map_or(0, |queries| {
        queries
            .iter()
            .filter(|query| query.get("apply") == Some(&Value::Bool(true)))
            .count()
    });
    if applies > 1 {
        return Err(issue(
            "ast-rewrite.apply-bulk",
            vec!["queries".into()],
            "a bulk request may contain at most one apply transaction",
        ));
    }
    Ok(())
}

pub(super) fn validate_ast_rewrite_queries(input: &Value) -> Result<(), ContractValidationError> {
    let Some(queries) = input["queries"].as_array() else {
        return Ok(());
    };
    for (index, query) in queries.iter().enumerate() {
        let prefix = vec!["queries".into(), index.to_string()];
        let apply = query.get("apply") == Some(&Value::Bool(true));
        let hashes_empty = query
            .get("expectedHashes")
            .and_then(Value::as_object)
            .is_none_or(serde_json::Map::is_empty);
        if apply && hashes_empty {
            return Err(issue(
                "ast-rewrite.apply-hashes",
                prefix,
                "apply requires non-empty expectedHashes copied from preview",
            ));
        }
        if apply && query.get("snapshot").is_none() {
            return Err(issue(
                "ast-rewrite.apply-snapshot",
                prefix,
                "apply requires the snapshot copied from preview",
            ));
        }
        if !apply && query.get("selectedMatchIds").is_some() {
            return Err(issue(
                "ast-rewrite.selected-apply-only",
                prefix,
                "selectedMatchIds is apply-only",
            ));
        }
        if !apply && query.get("postconditions").is_some() {
            return Err(issue(
                "ast-rewrite.postconditions-apply-only",
                prefix,
                "postconditions are apply-only",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::contracts::validate::validate;
    use serde_json::{Value, json};

    fn apply_row(path: &str) -> Value {
        let hash = "a".repeat(64);
        json!({
            "path": path,
            "language": "typescript",
            "pattern": "old($A)",
            "rewrite": "neu($A)",
            "apply": true,
            "expectedHashes": {path: hash},
            "snapshot": hash,
        })
    }

    #[test]
    fn a_batch_carries_at_most_one_apply() {
        validate("astRewrite", json!({"queries":[apply_row("a.ts")]})).expect("one apply passes");
        let error = validate(
            "astRewrite",
            json!({"queries":[apply_row("a.ts"), apply_row("b.ts")]}),
        )
        .expect_err("two applies are rejected");
        assert!(
            error
                .issues
                .iter()
                .any(|issue| issue.rule_id == "ast-rewrite.apply-bulk"
                    && issue.path == ["queries"]
                    && issue.message == "a bulk request may contain at most one apply transaction"),
            "{error:?}"
        );
    }
}

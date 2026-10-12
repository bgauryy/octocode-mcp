//! Interpreters for the `operation_controls` and `lsp_rust_context` opcodes.
use super::{ContractValidationError, internal, issue, query_values};
use serde_json::Value;

pub(super) fn validate_operation_controls(
    input: &Value,
    rule_id: &str,
    args: &Value,
) -> Result<(), ContractValidationError> {
    let fields = args["fields"]
        .as_object()
        .ok_or_else(|| internal("operation_controls requires fields".into()))?;
    for (index, query) in query_values(input) {
        let operation = query["operation"]
            .as_str()
            .or_else(|| args["defaultOperation"].as_str())
            .unwrap_or("");
        for (field, operations) in fields {
            let operations = operations
                .as_array()
                .ok_or_else(|| internal("operation_controls requires operation arrays".into()))?;
            if query.get(field).is_some()
                && !operations
                    .iter()
                    .any(|value| value.as_str() == Some(operation))
            {
                let allowed = operations
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(issue(
                    rule_id,
                    vec!["queries".into(), index.to_string(), field.clone()],
                    format!("{field} only applies to {allowed}; remove it from {operation}."),
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn validate_lsp_queries(input: &Value) -> Result<(), ContractValidationError> {
    for (index, query) in query_values(input) {
        let prefix = |field: &str| vec!["queries".into(), index.to_string(), field.into()];
        if let Some(context) = query.get("rustContext").and_then(Value::as_object) {
            if context.get("procMacros") == Some(&Value::Bool(true))
                && context.get("buildScripts") != Some(&Value::Bool(true))
            {
                return Err(issue(
                    "lsp.proc-macros",
                    vec![
                        "queries".into(),
                        index.to_string(),
                        "rustContext".into(),
                        "procMacros".into(),
                    ],
                    "procMacros requires buildScripts:true because rust-analyzer builds procedural macros through Cargo.",
                ));
            }
            if !query
                .get("path")
                .and_then(Value::as_str)
                .is_some_and(|path| path.to_lowercase().ends_with(".rs"))
            {
                return Err(issue(
                    "lsp.rust-path",
                    prefix("rustContext"),
                    "rustContext requires a Rust .rs path, including for workspaceSymbol.",
                ));
            }
        }
    }
    Ok(())
}

//! Interpreter for the `local_search_mode` opcode.
use super::{ContractValidationError, issue, query_values};
use serde_json::Value;

pub(super) fn validate_local_search_queries(input: &Value) -> Result<(), ContractValidationError> {
    for (index, query) in query_values(input) {
        let prefix = |field: &str| vec!["queries".into(), index.to_string(), field.into()];
        let view = query.get("resultView").and_then(Value::as_str);
        // clasifyContext judges hit snippets, which only these views show;
        // dropping the conflicting view is the one exact repair.
        if query.get("clasifyContext").is_some()
            && view.is_some_and(|view| !matches!(view, "paginated" | "matchOnly"))
        {
            let mut error = issue(
                "local-search.selection-view",
                prefix("resultView"),
                "clasifyContext classifies hit snippets: resultView \"paginated\" or \"matchOnly\" only.",
            );
            error.issues[0].schema = Some(serde_json::json!({"conflictsWith": ["clasifyContext"]}));
            return Err(error);
        }
        let is_match_only = view == Some("matchOnly");
        if let Some(unique @ ("list" | "count")) = query.get("unique").and_then(Value::as_str)
            && !is_match_only
        {
            return Err(issue(
                "local-search.unique",
                prefix("unique"),
                format!("unique:\"{unique}\" requires resultView:\"matchOnly\""),
            ));
        }
    }
    Ok(())
}

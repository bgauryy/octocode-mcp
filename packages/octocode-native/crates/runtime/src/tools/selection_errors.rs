//! Coverage receipts for classified rows that fail before evidence selection.
//!
//! Source acquisition can fail before a reader knows how many candidates its
//! selected view contains. The caller still needs an explicit unavailable
//! receipt, but there is no omitted body to recover and therefore no synthetic
//! unfiltered retry is added here.

use crate::contracts::tool_types::{Selection, SelectionScope, SelectionStatus, SelectionUnit};
use crate::tools::id::ToolId;
use serde_json::Value;

/// Add an unavailable selection receipt to classified error rows that failed
/// before their adapter produced one.
///
/// `response_query` contains only admitted rows. Contract-rejected siblings
/// are skipped while pairing those rows with the indexed result envelope.
pub(crate) fn decorate(tool: ToolId, structured: &mut Value, response_query: &Value) {
    let Some((scope, unit)) = receipt_kind(tool) else {
        return;
    };
    let queries: Vec<&Value> = match response_query.get("queries").and_then(Value::as_array) {
        Some(queries) => queries.iter().collect(),
        None => vec![response_query],
    };
    let Some(rows) = structured.get_mut("results").and_then(Value::as_array_mut) else {
        return;
    };
    let mut queries = queries.into_iter();
    for row in rows {
        if contract_rejection(row) {
            continue;
        }
        let Some(query) = queries.next() else {
            break;
        };
        if query.get("clasifyContext").is_none()
            || row.get("status") != Some(&Value::String("error".into()))
        {
            continue;
        }
        let Some(data) = row.get_mut("data").and_then(Value::as_object_mut) else {
            continue;
        };
        data.entry("selection").or_insert_with(|| {
            serde_json::to_value(Selection {
                status: SelectionStatus::Unavailable,
                scope,
                unit,
                total_items: 0,
                selected_items: 0,
                excluded_items: 0,
                unknown_items: 0,
                reason: Some("sourceUnavailable".into()),
            })
            .unwrap_or(Value::Null)
        });
    }
}

fn receipt_kind(tool: ToolId) -> Option<(SelectionScope, SelectionUnit)> {
    match tool {
        ToolId::LocalSearch => Some((SelectionScope::SelectedView, SelectionUnit::Files)),
        ToolId::LocalFetch | ToolId::GhGetFileContent => {
            Some((SelectionScope::SelectedView, SelectionUnit::Chunks))
        }
        ToolId::GhSearchCode => Some((SelectionScope::ProviderPage, SelectionUnit::Files)),
        _ => None,
    }
}

/// Isolated contract failures are not admitted and therefore have no entry in
/// `response_query`. Adapter-level invalid-input failures carry a repair call
/// and remain paired with their admitted query.
fn contract_rejection(row: &Value) -> bool {
    row.get("status") == Some(&Value::String("error".into()))
        && row.pointer("/data/errorCode").and_then(Value::as_str) == Some("invalidInput")
        && row.pointer("/data/next").is_none()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classified_source_failure_gets_reconciled_unavailable_receipt() {
        let mut structured = json!({"results":[{"index":0,"status":"error","data":{
            "path":"missing.rs","errorCode":"pathNotFound","error":"missing"
        }}]});
        decorate(
            ToolId::LocalFetch,
            &mut structured,
            &json!({"path":"missing.rs","clasifyContext":{"classifiers":["Relevant?"]}}),
        );
        let data = &structured["results"][0]["data"];
        assert_eq!(data["error"], "missing");
        assert_eq!(data["selection"]["status"], "unavailable");
        assert_eq!(data["selection"]["scope"], "selectedView");
        assert_eq!(data["selection"]["unit"], "chunks");
        assert_eq!(data["selection"]["totalItems"], 0);
        assert_eq!(data["selection"]["selectedItems"], 0);
        assert_eq!(data["selection"]["excludedItems"], 0);
        assert_eq!(data["selection"]["unknownItems"], 0);
        assert_eq!(data["selection"]["reason"], "sourceUnavailable");
        assert!(data.pointer("/next/unfiltered").is_none());
    }

    #[test]
    fn mixed_batch_pairs_only_admitted_queries_and_preserves_existing_receipts() {
        let existing = json!({
            "status":"partial","scope":"providerPage","unit":"files",
            "totalItems":2,"selectedItems":1,"excludedItems":0,"unknownItems":1
        });
        let mut structured = json!({"results":[
            {"index":0,"status":"error","data":{"errorCode":"invalidInput","error":"rejected"}},
            {"index":1,"status":"error","data":{"errorCode":"server","error":"plain failed"}},
            {"index":2,"status":"error","data":{"errorCode":"server","error":"classified failed"}},
            {"index":3,"status":"error","data":{"errorCode":"server","error":"already shaped","selection":existing}}
        ]});
        decorate(
            ToolId::GhSearchCode,
            &mut structured,
            &json!({"queries":[
                {"owner":"o","keywords":["plain"]},
                {"owner":"o","keywords":["selected"],"clasifyContext":{"classifiers":["Relevant?"]}},
                {"owner":"o","keywords":["existing"],"clasifyContext":{"classifiers":["Relevant?"]}}
            ]}),
        );
        let rows = structured["results"].as_array().unwrap();
        assert!(rows[0]["data"].get("selection").is_none());
        assert!(rows[1]["data"].get("selection").is_none());
        assert_eq!(rows[2]["data"]["selection"]["scope"], "providerPage");
        assert_eq!(rows[2]["data"]["selection"]["unit"], "files");
        assert_eq!(rows[3]["data"]["selection"], existing);
    }

    #[test]
    fn ordinary_and_unrelated_failures_are_unchanged() {
        for (tool, query) in [
            (ToolId::LocalSearch, json!({"path":".","matchString":"x"})),
            (ToolId::GhSearchRepo, json!({"keywords":["x"]})),
        ] {
            let mut structured = json!({"results":[{"index":0,"status":"error","data":{
                "errorCode":"server","error":"failed"
            }}]});
            let original = structured.clone();
            decorate(tool, &mut structured, &query);
            assert_eq!(structured, original);
        }
    }

    #[test]
    fn admitted_invalid_view_with_recovery_still_gets_a_receipt() {
        let mut structured = json!({"results":[{"index":0,"status":"error","data":{
            "errorCode":"invalidInput","error":"unsupported view",
            "next":{"unfiltered":{"tool":"localSearch","query":{"queries":[{"path":".","matchString":"x"}]}}}
        }}]});
        decorate(
            ToolId::LocalSearch,
            &mut structured,
            &json!({"path":".","matchString":"x","clasifyContext":{"classifiers":["Relevant?"]}}),
        );
        assert_eq!(
            structured["results"][0]["data"]["selection"]["unit"],
            "files"
        );
        assert!(structured["results"][0]["data"]["next"]["unfiltered"].is_object());
    }
}

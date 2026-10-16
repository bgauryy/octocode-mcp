//! Coverage receipts and inspection guidance for unresolved classified rows.
//!
//! Source acquisition can fail before a reader knows how many candidates its
//! selected view contains. The caller still needs an explicit unavailable
//! receipt, but there is no omitted body to recover and therefore no synthetic
//! unfiltered retry is added here.

use crate::contracts::tool_types::{Selection, SelectionScope, SelectionStatus, SelectionUnit};
use crate::tools::id::ToolId;
use serde_json::Value;

/// Add missing failure receipts and guidance for inspecting unresolved evidence.
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
        // A refused request ran no selection: its repair, not unresolved
        // evidence, is the way on.
        if row.pointer("/data/errorCode").and_then(Value::as_str) == Some("invalidInput") {
            continue;
        }
        if query.get("clasifyContext").is_some()
            && row.get("status") == Some(&Value::String("error".into()))
            && let Some(data) = row.get_mut("data").and_then(Value::as_object_mut)
        {
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
        if !crate::tools::paging::continues_a_page(query) {
            inspection_hint(row);
        }
    }
}

/// The static reminder that unknown is not irrelevant, on a row that
/// judged evidence and left some unknown. A failed row judged nothing (its
/// error and the unfiltered lead are the way on). Said once per response,
/// on the first page ([`crate::tools::paging::push_notice`]).
fn inspection_hint(row: &mut Value) {
    if row["status"] == "error" {
        return;
    }
    let data = &mut row["data"];
    if !data["next"]["unfiltered"].is_object()
        || !(data["selection"]["unknownItems"]
            .as_u64()
            .is_some_and(|n| n > 0)
            || data["selection"]["status"] == "unavailable")
    {
        return;
    }
    crate::tools::paging::push_notice(data, crate::contracts::classification_notice("unresolved"));
}

fn receipt_kind(tool: ToolId) -> Option<(SelectionScope, SelectionUnit)> {
    match tool {
        ToolId::LocalSearch | ToolId::LocalFetch | ToolId::GhGetFileContent => {
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
    fn unresolved_selection_keeps_a_conditional_inspection_hint() {
        for tool in [
            ToolId::LocalSearch,
            ToolId::LocalFetch,
            ToolId::GhSearchCode,
            ToolId::GhGetFileContent,
        ] {
            let mut structured = json!({"results":[{"index":0,"data":{
                "selection":{"status":"partial","selectedItems":1,"unknownItems":1},
                "next":{"unfiltered":{"tool":tool.as_str(),"query":{"queries":[{"path":"a.rs"}]}}}
            }}]});
            let query =
                json!({"path":"a.rs","clasifyContext":{"classifiers":["States the rule?"]}});
            let original_lead = structured["results"][0]["data"]["next"]["unfiltered"].clone();
            settle(tool, &mut structured, &query);
            let data = &structured["results"][0]["data"];
            let text = data["warnings"][0]
                .as_str()
                .expect("unresolved recovery guidance on a successful row");
            assert!(
                text.contains("unfiltered lead") && text.contains("if needed"),
                "{text}"
            );
            assert_eq!(data["next"]["unfiltered"], original_lead);
            let once = structured.clone();
            settle(tool, &mut structured, &query);
            assert_eq!(structured, once, "no duplicate recovery tips");
            // A continuation page repeats no static reminder.
            let mut later = json!({"results":[{"index":0,"data":{
                "selection":{"status":"partial","selectedItems":1,"unknownItems":1},
                "next":{"unfiltered":{"tool":tool.as_str(),"query":{"queries":[{"path":"a.rs"}]}}}
            }}]});
            let mut page = query.clone();
            page["snapshot"] = json!("s");
            settle(tool, &mut later, &page);
            assert!(
                later["results"][0]["data"].get("warnings").is_none(),
                "{later}"
            );
        }
    }

    #[test]
    fn complete_selection_does_not_prompt_more_reading() {
        let mut structured = json!({"results":[{"index":0,"data":{
            "selection":{"status":"complete","selectedItems":1,"unknownItems":0},
            "next":{"unfiltered":{"tool":"localFetch","query":{"queries":[{"path":"a.rs"}]}}}
        }}]});
        let before = structured.clone();
        decorate(
            ToolId::LocalFetch,
            &mut structured,
            &json!({"path":"a.rs","clasifyContext":{"classifiers":["States the rule?"]}}),
        );
        assert_eq!(structured, before);
    }

    /// [`decorate`] and the stage's notice placement.
    fn settle(tool: ToolId, structured: &mut Value, query: &Value) {
        decorate(tool, structured, query);
        crate::response::notices::place(structured, "results");
    }

    /// An empty row gets the reminder after its own tips; a failed row
    /// judged nothing, so it gets none. Two rows say it once.
    #[test]
    fn empty_rows_get_the_reminder_once_and_failed_rows_none() {
        for hints in [
            json!(["Existing tip."]),
            json!({"text":["Existing tip."],"read":{"tool":"localFetch","query":{"queries":[{"path":"a.rs"}]}}}),
        ] {
            let row = |index: usize, status: &str| {
                json!({"index":index,"status":status,"data":{
                    "selection":{"status":"partial","selectedItems":0,"unknownItems":1},
                    "hints":hints.clone(),
                    "next":{"unfiltered":{"tool":"localFetch","query":{"queries":[{"path":"a.rs"}]}}}
                }})
            };
            let mut structured =
                json!({"results":[row(0, "error"), row(1, "empty"), row(2, "empty")]});
            let query = json!({"path":"a.rs"});
            settle(
                ToolId::LocalFetch,
                &mut structured,
                &json!({"queries":[query.clone(), query.clone(), query]}),
            );
            let text = |index: usize| structured["results"][index]["data"]["hints"]["text"].clone();
            assert_eq!(
                structured["results"][0]["data"]["hints"], hints,
                "failed: no reminder"
            );
            assert_eq!(text(1)[0], "Existing tip.", "{structured}");
            assert!(
                text(1)[1]
                    .as_str()
                    .is_some_and(|t| t.contains("unfiltered lead")),
                "{structured}"
            );
            assert_eq!(
                structured["results"][2]["data"]["hints"], hints,
                "said once: {structured}"
            );
            for index in 0..3 {
                let data = &structured["results"][index]["data"];
                assert!(data.get("warnings").is_none() && data.get("notices").is_none());
                if hints.is_object() {
                    assert_eq!(data["hints"]["read"], hints["read"]);
                }
            }
        }
    }

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
    fn a_refused_view_gets_no_unknown_receipt_or_unresolved_evidence_hint() {
        let mut structured = json!({"results":[{"index":0,"status":"error","data":{
            "errorCode":"invalidInput","error":"unsupported view",
            "next":{"unfiltered":{"tool":"localSearch","query":{"queries":[{"path":".","matchString":"x"}]}}}
        }}]});
        let before = structured.clone();
        decorate(
            ToolId::LocalSearch,
            &mut structured,
            &json!({"path":".","matchString":"x","clasifyContext":{"classifiers":["Relevant?"]}}),
        );
        assert_eq!(structured, before);
    }
}

//! A rejected call's `repair` hint: the corrected call when every issue has
//! one exact fix, on the whole-call envelope and on an isolated batch row.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use crate::support::{self, Run as _};

use octocode_native::contracts;
use serde_json::{Value, json};
use support::Workspace;

const COMMIT: &str = "commit";

fn commit_row(sections: Value) -> Value {
    json!({
        "owner": "o", "repo": "r", "operation": COMMIT, "ref": "main",
        "sections": sections,
        "mainGoal": "Read the commit.", "reasoning": "Exercise repair leads."
    })
}

/// The repair a lead carries is a call its own tool admits unchanged.
fn assert_executable(tool: &str, repair: &Value) {
    assert_eq!(repair["tool"], tool, "{repair}");
    let admitted = contracts::prepare_many_and_validate(tool, repair["query"].clone());
    assert!(admitted.is_ok(), "lead rejected: {admitted:?}: {repair}");
}

#[tokio::test]
async fn an_enum_value_the_operation_lacks_leads_to_the_call_without_it() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    let input = json!({"queries":[commit_row(json!(["files", "comments"]))]});
    let error = runtime
        .run("enum".into(), "ghGetHistoryItem".into(), input)
        .await
        .expect_err("comments is a pull-request section");
    assert_eq!(error.code, "invalidInput");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("ghGetHistoryItem", repair);
    assert_eq!(
        repair["query"],
        json!({"queries":[commit_row(json!(["files"]))]}),
        "{payload}"
    );

    // A text-only MCP client reads the same lead in the error line.
    let mcp = runtime
        .run_mcp(
            "enum-mcp".into(),
            "ghGetHistoryItem".into(),
            json!({"queries":[commit_row(json!(["comments"]))]}),
        )
        .await
        .expect("MCP reports the rejection in-band");
    let text = mcp["content"][0]["text"].as_str().unwrap();
    assert!(
        text.contains("; repair: ghGetHistoryItem {\"queries\":["),
        "{text}"
    );
    // Dropping the only value drops the field: the default sections.
    let query =
        &crate::support::checks::hint(&mcp["structuredContent"], "repair")["query"]["queries"][0];
    assert!(query.get("sections").is_none(), "{query}");
    runtime.close().await;
}

/// clasifyContext judges hit snippets: a path-list or count view is refused
/// at admission, before any scan, and the repair drops only the view.
#[tokio::test]
async fn a_selection_with_a_list_view_leads_to_the_snippet_view() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    let row = json!({
        "path": ".", "matchString": "x",
        "clasifyContext": {"classifiers": ["Relevant?"]},
        "mainGoal": "Find x.", "reasoning": "Exercise repair leads."
    });
    let mut listed = row.clone();
    listed["resultView"] = json!("files");
    let error = runtime
        .run(
            "view".into(),
            "localSearch".into(),
            json!({"queries":[listed]}),
        )
        .await
        .expect_err("a files view has no snippets to classify");
    assert_eq!(error.code, "invalidInput");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localSearch", repair);
    assert_eq!(repair["query"], json!({"queries":[row]}), "{payload}");
    runtime.close().await;
}

#[tokio::test]
async fn a_field_the_operation_ignores_leads_to_the_call_without_it() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[("OCTOCODE_BETA", "1".into())]);
    let input = json!({"queries":[{
        "operation": "cycles", "path": ".", "source": "a.ts",
        "mainGoal": "Find cycles.", "reasoning": "Exercise repair leads."
    }]});
    let error = runtime
        .run("sibling".into(), "astTopology".into(), input)
        .await
        .expect_err("source belongs to other operations");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("astTopology", repair);
    assert!(
        repair["query"]["queries"][0].get("source").is_none(),
        "{repair}"
    );
    assert_eq!(repair["query"]["queries"][0]["operation"], "cycles");
    runtime.close().await;
}

#[tokio::test]
async fn a_fix_only_the_caller_knows_carries_no_lead() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[("OCTOCODE_BETA", "1".into())]);
    // A missing field, a near miss of an enum value, and a near-miss field
    // name each need the caller; the message names the fix.
    for (tool, row) in [
        (
            "astTopology",
            json!({"operation":"dependents","mainGoal":"g","reasoning":"r"}),
        ),
        (
            "localSearch",
            json!({"path":".","matchString":"x","regex":"pcre","mainGoal":"g","reasoning":"r"}),
        ),
        (
            "localSearch",
            json!({"path":".","matchstring":"x","mainGoal":"g","reasoning":"r"}),
        ),
    ] {
        let error = runtime
            .run("none".into(), tool.into(), json!({"queries":[row]}))
            .await
            .expect_err("invalid");
        let payload = error.payload.as_deref().expect("payload");
        assert!(payload.get("hints").is_none(), "{tool}: {payload}");
    }
    runtime.close().await;
}

#[tokio::test]
async fn dropping_a_constraint_the_caller_set_is_a_named_low_confidence_repair() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    let input = json!({"queries":[{
        "path":".","matchString":"x","glob":"*.ts","mainGoal":"g","reasoning":"r"
    }]});
    let error = runtime
        .run("lossy".into(), "localSearch".into(), input)
        .await
        .expect_err("glob is not a localSearch field");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localSearch", repair);
    assert_eq!(repair["confidence"], "low", "{payload}");
    assert!(
        crate::support::checks::hint(payload, "text")[0]
            .as_str()
            .is_some_and(|note| note.contains("queries.0.glob")),
        "{payload}"
    );
    runtime.close().await;
}

/// A value an optional field's enum does not list (and no listed value is
/// near) is dropped like an unknown field: the field's default applies, and
/// the lead is low confidence and names the drop.
#[tokio::test]
async fn an_unlisted_optional_value_is_a_named_low_confidence_drop() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    let input =
        json!({"queries":[{"path":"README.md","minify":"none","mainGoal":"g","reasoning":"r"}]});
    let error = runtime
        .run("unlisted".into(), "localFetch".into(), input)
        .await
        .expect_err("none is not a minify value");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localFetch", repair);
    assert_eq!(repair["confidence"], "low", "{payload}");
    assert!(
        repair["query"]["queries"][0].get("minify").is_none(),
        "{payload}"
    );
    assert!(
        crate::support::checks::hint(payload, "text")[0]
            .as_str()
            .is_some_and(|note| note.contains("queries.0.minify")),
        "{payload}"
    );
    runtime.close().await;
}

#[tokio::test]
async fn exact_repairs_relocate_a_root_brief_and_parse_a_numeric_string() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    let input = json!({"mainGoal":"g","queries":[
        {"path":".","matchString":"x","reasoning":"r"},
        {"path":".","matchString":"y","contextLines":"3","mainGoal":"own","reasoning":"r"}
    ]});
    let error = runtime
        .run("exact".into(), "localSearch".into(), input)
        .await
        .expect_err("root mainGoal and a string number");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localSearch", repair);
    assert!(
        repair.get("confidence").is_none(),
        "exact repair is unqualified: {payload}"
    );
    let rows = &repair["query"]["queries"];
    assert_eq!(rows[0]["mainGoal"], "g");
    assert_eq!(rows[1]["mainGoal"], "own", "a row's own brief wins");
    assert_eq!(rows[1]["contextLines"], 3);
    assert!(repair["query"].get("mainGoal").is_none());
    runtime.close().await;
}

/// A whole-file read with a window control: the repair drops exactly the
/// controls, keeping the whole read.
#[tokio::test]
async fn a_full_read_with_window_controls_leads_to_the_whole_read() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", "one\ntwo\n");
    let runtime = workspace.runtime(&[]);
    let input =
        json!({"queries":[{"path": file, "fullContent": true, "length": 100, "unit": "lines"}]});
    let error = runtime
        .run("full".into(), "localFetch".into(), input)
        .await
        .expect_err("fullContent takes no window");
    let payload = error.payload.as_deref().expect("payload");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localFetch", repair);
    assert!(
        repair.get("confidence").is_none(),
        "exact repair is unqualified: {payload}"
    );
    assert_eq!(
        repair["query"],
        json!({"queries":[{"path": file, "fullContent": true}]}),
        "{payload}"
    );
    runtime.close().await;
}

/// A row that is itself an envelope is refused, never unwrapped: the
/// repair lifts its rows and keeps its envelope fields beside them.
#[tokio::test]
async fn a_nested_envelope_leads_to_the_flat_call() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", "one\n");
    let runtime = workspace.runtime(&[]);
    let input = json!({"queries":[{"responseLength": 3000, "queries":[{"path": file}]}]});
    let error = runtime
        .run("nested".into(), "localFetch".into(), input)
        .await
        .expect_err("nested envelope");
    let payload = error.payload.as_deref().expect("payload");
    assert!(!payload.to_string().contains("prepare_many"), "{payload}");
    let repair = &crate::support::checks::hint(payload, "repair");
    assert_executable("localFetch", repair);
    assert_eq!(
        repair["query"],
        json!({"queries":[{"path": file}], "responseLength": 3000}),
        "{payload}"
    );
    runtime.close().await;
}

#[tokio::test]
async fn encoded_containers_are_rejected_and_offer_only_schema_valid_repairs() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    for (tool, input, decoded) in [
        (
            "ghSearchCode",
            json!({"queries":[{"owner":"o","repo":"r","keywords":"[\"one\",\"two\"]"}]}),
            json!({"queries":[{"owner":"o","repo":"r","keywords":["one","two"]}]}),
        ),
        (
            "localFetch",
            json!({"queries":"[{\"path\":\"a.rs\",\"ranges\":[\"1-2\"]}]"}),
            json!({"queries":[{"path":"a.rs","ranges":["1-2"]}]}),
        ),
    ] {
        let error = runtime
            .run("encoded".into(), tool.into(), input.clone())
            .await
            .expect_err("strict admission rejects JSON text");
        assert_eq!(error.code, "invalidInput");
        let repair = support::checks::hint(error.payload.as_deref().expect("payload"), "repair");
        assert_executable(tool, &repair);
        assert_eq!(repair["query"], decoded);
        assert!(
            contracts::prepare_many_and_validate(tool, input).is_err(),
            "repair never changes admission"
        );
    }
    for encoded in ["[\"unfinished", "{}", "[null]"] {
        let input = json!({"queries":[{"owner":"o","repo":"r","keywords":encoded}]});
        let error = runtime
            .run("invalid-encoded".into(), "ghSearchCode".into(), input)
            .await
            .expect_err("invalid input");
        assert!(
            support::checks::hint(error.payload.as_deref().expect("payload"), "repair").is_null()
        );
    }
    runtime.close().await;
}

#[tokio::test]
async fn scalar_array_items_offer_a_complete_repair_without_changing_admission() {
    let workspace = Workspace::new();
    let file = workspace.write("source.txt", "one\ntwo\n");
    let runtime = workspace.runtime(&[]);
    for (tool, input, expected) in [
        (
            "ghSearchCode",
            json!({"queries":[{"owner":"owner","repo":"repo","keywords":"a phrase","pageSize":"10"}]}),
            json!({"queries":[{"owner":"owner","repo":"repo","keywords":["a phrase"],"pageSize":10}]}),
        ),
        (
            "ghSearchHistory",
            json!({"queries":[{"operation":"issue","owner":"owner","repo":"repo","keywords":"exact phrase"}]}),
            json!({"queries":[{"operation":"issue","owner":"owner","repo":"repo","keywords":["exact phrase"]}]}),
        ),
        (
            "localFetch",
            json!({"queries":[{"path":file,"ranges":"1-2"}]}),
            json!({"queries":[{"path":file,"ranges":["1-2"]}]}),
        ),
    ] {
        let error = runtime
            .run("scalar-array".into(), tool.into(), input.clone())
            .await
            .expect_err("strict admission rejects scalar array fields");
        assert_eq!(error.code, "invalidInput");
        let repair = support::checks::hint(error.payload.as_deref().expect("payload"), "repair");
        assert_executable(tool, &repair);
        assert_eq!(repair["query"], expected);
        assert!(contracts::prepare_many_and_validate(tool, input).is_err());
        if tool == "localFetch" {
            runtime
                .run("repaired".into(), tool.into(), repair["query"].clone())
                .await
                .expect("repair executes against the real local file");
        }
    }
    runtime.close().await;
}

/// A row's `path` that only another operation declares is removed (it had
/// no effect), even though it resembles `page`; a `startLine`/`endLine`
/// pair becomes the exact `ranges` span; and an artifactSearch page past
/// the deepest page its search reaches repairs to that page in one hop.
#[tokio::test]
async fn exact_repairs_drop_a_foreign_field_spell_spans_and_reach_the_last_page() {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[]);
    for (tool, row, check) in [
        (
            "ghSearchHistory",
            json!({"owner":"o","repo":"r","operation":"pullRequest","path":"src/a.rs",
                "mainGoal":"g","reasoning":"r"}),
            ("path", Value::Null),
        ),
        (
            "localFetch",
            json!({"path":"README.md","startLine":5,"endLine":9,"mainGoal":"g","reasoning":"r"}),
            ("ranges", json!(["5-9"])),
        ),
        (
            "artifactSearch",
            json!({"ecosystem":"npm","keywords":["react"],"page":1001,
                "mainGoal":"g","reasoning":"r"}),
            ("page", json!(101)),
        ),
    ] {
        let error = runtime
            .run(tool.into(), tool.into(), json!({"queries":[row]}))
            .await
            .expect_err("invalid");
        let payload = error.payload.as_deref().expect("payload");
        let repair = &crate::support::checks::hint(payload, "repair");
        assert_executable(tool, repair);
        assert_ne!(repair["confidence"], "low", "{tool}: {payload}");
        let fixed = &repair["query"]["queries"][0];
        assert_eq!(
            fixed.get(check.0).cloned().unwrap_or(Value::Null),
            check.1,
            "{tool}: {payload}"
        );
        assert!(fixed.get("startLine").is_none() && fixed.get("endLine").is_none());
    }
    runtime.close().await;
}

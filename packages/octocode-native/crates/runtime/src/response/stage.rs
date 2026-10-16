//! Public response stage: the one boundary between executed rows and the
//! envelope a caller receives. Execution (dispatch, selection inference)
//! finishes first; this stage owns the order of output-row isolation,
//! continuation shaping, text rendering, paging, and final
//! contract validation, identically for CLI JSON and MCP.

use super::pager::{
    ResponseError, ResponseInput, ResponsePageOptions, ResponsePager, ResponsePagerConfig,
};
use crate::contracts::{self, ContractValidationError};
use crate::runtime::ToolOutcome;
use crate::runtime::{ExecutionContext, ExecutionError};
use crate::tools::id::ToolId;
use crate::tools::result::FailureKind;
use serde_json::Value;

pub(crate) struct StageInput {
    pub tool: ToolId,
    /// Sanitized `{results}` envelope after evidence selection.
    pub structured: Value,
    /// Normalized input; the pager builds `responsePagination.next` from it.
    pub response_query: Value,
    pub options: ResponsePageOptions,
    pub mcp: bool,
    pub failure: Option<FailureKind>,
    pub auto_page_chars: usize,
    /// Encoding of the rendered text channel (`output.format`).
    pub text_format: super::render::TextFormat,
    /// False when a replay would not reproduce the page: clasify, whose
    /// replay would re-run inference.
    pub allow_auto_paging: bool,
    pub source_digest: Option<String>,
}

/// Turn executed rows into the public envelope. An envelope-level contract
/// violation is returned as `Ok(Err(_))`; isolated row violations become
/// explicit error rows and mark the outcome failed.
pub(crate) fn finish(
    mut input: StageInput,
    context: &ExecutionContext,
) -> Result<Result<ToolOutcome, ContractValidationError>, ExecutionError> {
    let remaining = match settle(
        input.tool,
        &mut input.structured,
        &input.response_query,
        &mut input.failure,
    ) {
        Ok(remaining) => remaining,
        Err(error) => return Ok(Err(error)),
    };
    respond(input, remaining, None, context)
}

/// The page-independent half of the stage: selection receipts, line
/// numbers, output validation (row violations isolated, marking `failure`)
/// and continuation shaping. Returns the remaining-notes the pager words.
/// A settled envelope is what a page replay stores, so its later pages are
/// neither validated nor shaped again.
pub(crate) fn settle(
    tool: ToolId,
    structured: &mut Value,
    response_query: &Value,
    failure: &mut Option<FailureKind>,
) -> Result<Vec<Vec<super::pages::Remaining>>, ContractValidationError> {
    crate::tools::selection_errors::decorate(tool, structured, response_query);
    super::notices::place(structured, tool.output().rows_key());
    super::channels::publish_hints(structured, tool);
    // The notes stay with the pager for the pages a split row moves.
    let remaining = super::pages::take_remaining_notes(structured);
    // Hosts show agents this JSON: source reads carry their line numbers in
    // `content` itself, and both text encodings render from it. Numbering
    // precedes validation so an unpaged response is exactly what was checked.
    crate::tools::numbered::number_read_rows(tool, structured);
    // Validate the complete, sanitized rows before deriving text, error state,
    // or a pagination snapshot from them.
    if isolate_output_rows(tool.as_str(), structured)? && failure.is_none() {
        *failure = Some(FailureKind::Execution);
    }
    super::channels::lead_continuations(structured, tool);
    Ok(remaining)
}

/// Rendered text a replayed envelope keeps for its later pages: the text of
/// the envelope with or without transient telemetry (`stripped`).
#[derive(Default)]
pub(crate) struct TextCache(std::sync::Mutex<Option<(bool, String)>>);

impl TextCache {
    fn get_or_render(&self, stripped: bool, render: impl FnOnce() -> String) -> String {
        let mut cached = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match cached.as_ref() {
            Some((was_stripped, text)) if *was_stripped == stripped => text.clone(),
            _ => {
                let text = render();
                *cached = Some((stripped, text.clone()));
                text
            }
        }
    }
}

/// The page-dependent half of the stage over a [`settle`]d envelope: text,
/// paging and the paged shape's contract check. `text` reuses a replay's
/// rendered text.
pub(crate) fn respond(
    input: StageInput,
    remaining: Vec<Vec<super::pages::Remaining>>,
    text: Option<&TextCache>,
    context: &ExecutionContext,
) -> Result<Result<ToolOutcome, ContractValidationError>, ExecutionError> {
    let StageInput {
        tool,
        mut structured,
        mut response_query,
        mut options,
        mcp,
        failure,
        auto_page_chars,
        text_format,
        allow_auto_paging,
        source_digest,
    } = input;
    let all_failed = response_all_failed(&structured);
    // An explicitly paged text response hashes and windows the rendered
    // text, so transient telemetry must leave before rendering (row pages
    // keep per-call facts outside their snapshot; the pager handles both).
    let stripped = options.explicit() && !options.rows_scope();
    if stripped && let Some(envelope) = structured.as_object_mut() {
        super::pager::strip_transient_telemetry(envelope);
    }
    context.check()?;
    let render = options.render_text.unwrap_or(mcp)
        || failure.is_some()
        || options.response_length.is_some()
        || options.response_offset.is_some()
        || options.response_snapshot.is_some();
    let rendered_text = render.then(|| {
        let draw = || super::render::render_tool(tool, &structured, &response_query, text_format);
        match text {
            Some(cache) => cache.get_or_render(stripped, draw),
            None => draw(),
        }
    });
    context.check()?;
    if allow_auto_paging {
        options.auto_paginate(rendered_text.as_deref(), &structured, auto_page_chars);
    }
    super::continuations::compact_input(tool.as_str(), &mut response_query);
    // Row and envelope windows reshape the rows; a text page only adds its
    // window and pagination, and an unpaged envelope leaves unchanged.
    let reshaped = options.rows_scope() || options.structured_scope();
    let prepared = ResponsePager::new(ResponsePagerConfig::default())
        .prepare(
            ResponseInput {
                tool: tool.as_str().into(),
                query: response_query,
                structured,
                rendered_text,
                is_error: all_failed,
                options,
                remaining,
            },
            &context.cancellation,
        )
        .map_err(response_failure)?;
    let mut structured_content = prepared.structured_content;
    context.check()?;
    // Page shaping crosses the public contract as well; rows validated
    // above and left unpaged are not validated twice.
    let paged = reshaped
        || structured_content.get("responsePagination").is_some()
        || structured_content.get("responseWindow").is_some();
    if paged
        && let Err(error) =
            contracts::validate_output_in_place(tool.as_str(), &mut structured_content)
    {
        return Ok(Err(error));
    }
    Ok(Ok(ToolOutcome {
        structured_content,
        content: prepared.content,
        source_digest,
        failure,
        all_failed,
    }))
}

fn response_failure(error: ResponseError) -> ExecutionError {
    match error {
        ResponseError::Cancelled => ExecutionError::Cancelled,
        ResponseError::StructuredContentMustBeObject | ResponseError::Unserializable => {
            ExecutionError::WorkerFailed
        }
    }
}

/// Repair malformed result rows before either response channel is rendered.
/// Envelope violations remain fatal so pagination never snapshots invalid data.
pub(crate) fn isolate_output_rows(
    tool: &str,
    structured: &mut Value,
) -> Result<bool, ContractValidationError> {
    let Err(error) = contracts::validate_output_in_place(tool, structured) else {
        return Ok(false);
    };
    let Some(patched) = contracts::isolate_row_violations(tool, structured, &error) else {
        return Err(error);
    };
    *structured = patched;
    Ok(true)
}

pub(crate) fn response_all_failed(structured: &Value) -> bool {
    if let Some(rows) = structured.get("results").and_then(Value::as_array) {
        return rows.iter().all(|row| row["status"] == "error");
    }
    structured
        .get("queries")
        .and_then(Value::as_array)
        .is_some_and(|queries| {
            // A clasify row failed when it carries an error and no answers.
            !queries.is_empty()
                && queries
                    .iter()
                    .all(|query| query.get("error").is_some() && query.get("answers").is_none())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::response::pager::ResponsePageOptions;
    use serde_json::{Value, json};
    use std::time::{Duration, Instant};
    use tokio_util::sync::CancellationToken;

    fn context() -> ExecutionContext {
        ExecutionContext {
            cancellation: CancellationToken::new(),
            deadline: Instant::now() + Duration::from_secs(30),
            walk_threads: None,
            response_window: None,
            github_credential: None,
        }
    }

    /// The engine's continuation stage, then this stage.
    fn stage(tool: &str, structured: Value, mcp: bool) -> ToolOutcome {
        stage_from(tool, structured, mcp, None)
    }

    /// [`stage`] with the source query of row 0.
    fn stage_from(
        tool: &str,
        mut structured: Value,
        mcp: bool,
        source: Option<&Value>,
    ) -> ToolOutcome {
        let id = ToolId::from_name(tool).expect("known tool");
        super::super::continuations::finalize(
            &mut structured,
            id,
            &super::super::continuations::Sources::Rows(&[source]),
            &super::super::continuations::Scope::everything(),
        )
        .expect("valid continuations");
        finish(
            StageInput {
                tool: id,
                structured,
                response_query: json!({"path":"/tmp/a.txt","mainGoal": "test", "reasoning":"r"}),
                options: ResponsePageOptions::default(),
                mcp,
                failure: None,
                auto_page_chars: 20_000,
                text_format: super::super::render::TextFormat::Yaml,
                allow_auto_paging: true,
                source_digest: None,
            },
            &context(),
        )
        .expect("stage runs")
        .expect("valid envelope")
    }

    fn fetch_row(index: usize) -> Value {
        json!({"index":index,"data":{"path":"a.txt","content":"one\n","totalLines":1,
            "next":{"continueWindow":{"tool":"localFetch","confidence":"exact",
                "query":{"queries":[{"path":"/tmp/a.txt","mainGoal": "test", "reasoning":"r","offset":1}]}}}}})
    }

    /// A rendered response past the 8 MiB ceiling pages (rows, else
    /// envelope windows) with an executable continuation instead of failing.
    #[test]
    fn oversized_responses_page_by_rows_instead_of_failing() {
        let content = "x".repeat(9 * 1024 * 1024);
        let structured = json!({"results":[{"index":0,"data":{"path":"a.txt","content":content,"totalLines":1}}]});
        let outcome = finish(
            StageInput {
                tool: ToolId::LocalFetch,
                structured,
                response_query: json!({"path":"/tmp/a.txt"}),
                options: ResponsePageOptions::default(),
                mcp: true,
                failure: None,
                auto_page_chars: 0,
                text_format: super::super::render::TextFormat::Yaml,
                allow_auto_paging: false,
                source_digest: None,
            },
            &context(),
        )
        .expect("execution")
        .expect("contract-valid page");
        let page = &outcome.structured_content;
        // One 9 MiB string row cannot split into row pages: it windows.
        assert_eq!(page["responsePagination"]["scope"], "structuredContent");
        assert_eq!(
            page["responsePagination"]["next"]["query"]["responseScope"],
            "structured"
        );
        let text: usize = outcome.content.iter().map(|c| c.text.len()).sum();
        assert!(text <= 9 * 1024 * 1024, "page text is bounded: {text}");
    }

    /// A page that continues keeps every other lead its row carries when
    /// the row asked for `hints`; by default a successful row's optional
    /// search lead goes and its page stays.
    fn suggested_input(data: &Value, action: &str, tool: &str) -> Value {
        let prefix = format!("{action}: {tool} ");
        let text = data["hints"]
            .as_array()
            .expect("string guidance")
            .iter()
            .filter_map(Value::as_str)
            .find_map(|text| text.strip_prefix(&prefix))
            .expect("suggested tool call");
        let input: Value = serde_json::from_str(text).expect("complete JSON input");
        crate::contracts::prepare_many_and_validate(tool, input.clone())
            .expect("suggestion validates");
        input
    }

    #[test]
    fn a_continuing_row_keeps_its_search_lead() {
        let mut row = fetch_row(0);
        row["data"]["next"]["findText"] = json!({"tool":"localSearch",
            "query":{"queries":[{"path":"/tmp/a.txt","matchString":"hit"}]}});
        let hinted = json!({"path":"/tmp/a.txt","extras":["hints"]});
        for mcp in [false, true] {
            let outcome = stage_from(
                "localFetch",
                json!({"results":[row.clone()]}),
                mcp,
                Some(&hinted),
            );
            let data = &outcome.structured_content["results"][0]["data"];
            let input = suggested_input(data, "findText", "localSearch");
            assert_eq!(input["queries"][0]["matchString"], "hit");
            assert!(data["next"].get("findText").is_none());
            assert_eq!(
                data["next"]["continueWindow"]["tool"], "localFetch",
                "{data}"
            );
            let outcome = stage("localFetch", json!({"results":[row.clone()]}), mcp);
            let data = &outcome.structured_content["results"][0]["data"];
            assert!(data.get("hints").is_none(), "mcp={mcp}: {data}");
            assert_eq!(
                data["next"]["continueWindow"]["tool"], "localFetch",
                "{data}"
            );
        }
    }

    fn lsp_partial_row(paged: bool) -> Value {
        let rows: Vec<Value> = (1..=5)
            .map(|n| json!({"path":format!("/tmp/f{n}.ts"),"matchString":"\\bname\\b"}))
            .collect();
        let mut data = json!({"path":"a.ts","kind":"callers","files":[],
            "isPartial":true,"partialReasons":["importerScanFailed"],
            "next":{"findText":{"tool":"localSearch","query":{"queries":rows}}}});
        if paged {
            data["next"]["nextImporterPage"] = json!({"tool":"lspSearch","query":{"queries":[
                {"operation":"callers","path":"/tmp/a.ts","symbolName":"name","line":1,"page":2}]}});
        }
        json!({"results":[{"index":0,"data":data}]})
    }

    /// A partial row with no page has no other route to what it withholds:
    /// its lead stays in the default output with every row.
    #[test]
    fn a_partial_row_without_a_page_keeps_its_lead_whole() {
        for mcp in [false, true] {
            let outcome = stage("lspSearch", lsp_partial_row(false), mcp);
            let data = &outcome.structured_content["results"][0]["data"];
            let input = suggested_input(data, "findText", "localSearch");
            let rows = input["queries"]
                .as_array()
                .unwrap_or_else(|| panic!("mcp={mcp}: lead stays: {data}"));
            let paths: Vec<_> = rows.iter().filter_map(|row| row["path"].as_str()).collect();
            assert_eq!(
                paths,
                [
                    "/tmp/f1.ts",
                    "/tmp/f2.ts",
                    "/tmp/f3.ts",
                    "/tmp/f4.ts",
                    "/tmp/f5.ts"
                ],
                "mcp={mcp}: {data}"
            );
        }
    }

    /// A partial row whose `next` pages on reaches the rest by that page,
    /// so its optional lead is opt-in like any successful row's.
    #[test]
    fn a_partial_row_with_a_page_drops_its_optional_lead_by_default() {
        for mcp in [false, true] {
            let outcome = stage("lspSearch", lsp_partial_row(true), mcp);
            let data = &outcome.structured_content["results"][0]["data"];
            assert_eq!(
                data["next"]["nextImporterPage"]["tool"], "lspSearch",
                "mcp={mcp}: {data}"
            );
            assert!(data.get("hints").is_none(), "mcp={mcp}: {data}");
        }
    }

    #[test]
    fn pager_failures_keep_their_kind() {
        assert_eq!(
            response_failure(ResponseError::Cancelled),
            ExecutionError::Cancelled
        );
    }

    #[test]
    fn clasify_all_failed_needs_every_row_to_fail() {
        let failed = json!({"id":"a","error":{"errorCode":"pathNotFound","error":"gone"}});
        let answered = json!({"id":"b","answers":{"q":{"type":"noul","noul":0.9}}});
        assert!(response_all_failed(&json!({"queries":[failed.clone()]})));
        assert!(response_all_failed(
            &json!({"queries":[failed.clone(), failed.clone()]})
        ));
        assert!(!response_all_failed(
            &json!({"queries":[failed, answered.clone()]})
        ));
        assert!(!response_all_failed(&json!({"queries":[answered]})));
        assert!(!response_all_failed(&json!({"queries":[]})));
    }

    #[test]
    fn cli_and_mcp_carry_the_same_rows_and_compact_continuations() {
        let rows = json!({"results":[fetch_row(0)]});
        let cli = stage("localFetch", rows.clone(), false);
        let mcp = stage("localFetch", rows, true);
        assert_eq!(
            cli.structured_content["results"],
            mcp.structured_content["results"]
        );
        let next = &cli.structured_content["results"][0]["data"]["next"]["continueWindow"]["query"]
            ["queries"][0];
        assert_eq!(
            next,
            &json!({"path":"/tmp/a.txt","offset":1}),
            "no default is injected into a continuation"
        );
        assert!(cli.content.is_empty() && !mcp.content.is_empty());
        assert!(!cli.all_failed);
    }

    /// Hosts show agents structuredContent, so source reads carry their
    /// line numbers there on both surfaces; text renders the same numbers.
    #[test]
    fn source_reads_carry_line_numbers_in_structured_content() {
        let row = json!({"index":0,"data":{"path":"a.txt","content":"one\ntwo\n","totalLines":9,
            "sourceLineRanges":[{"line":4,"endLine":5}]}});
        for mcp in [false, true] {
            let outcome = stage("localFetch", json!({"results":[row.clone()]}), mcp);
            let data = &outcome.structured_content["results"][0]["data"];
            assert_eq!(data["content"], "4\tone\n5\ttwo\n", "{data}");
            assert!(data.get("sourceLineRanges").is_none(), "{data}");
            if mcp {
                let text = serde_json::to_string(&outcome.content).expect("text");
                assert!(text.contains(r"4\tone\n5\ttwo"), "{text}");
            }
        }
        let gh = json!({"results":[{"index":0,"data":{"owner":"o","repo":"r",
            "path":"a.py","content":"x\n","totalLines":3,"commitSha":"abc",
             "sourceLineRanges":[{"line":2,"endLine":2}]}}]});
        let outcome = stage("ghGetFileContent", gh, false);
        assert_eq!(
            outcome.structured_content["results"][0]["data"]["content"],
            "2\tx\n"
        );
    }

    /// A classified row's two unfiltered routes (the unknown evidence only,
    /// and the whole view) reach different scopes: after channel shaping
    /// they are still two separately callable pages with their rows intact.
    #[test]
    fn the_unknown_and_whole_unfiltered_routes_stay_two_calls() {
        let call = |tool: &str, row: Value| json!({"tool":tool,"query":{"queries":[row]}});
        let cases = [
            (
                "localSearch",
                json!({"path":"/tmp/src","matchString":"fn","include":["/a.rs"]}),
                json!({"path":"/tmp/src","matchString":"fn","snapshot":"s1"}),
                json!({"files":[{"path":"a.rs","matches":[{"line":1,"value":"fn a()"}]}],
                    "matchCount":1,"matchedLineCount":1,"filesScanned":2}),
            ),
            (
                "localFetch",
                json!({"path":"/tmp/a.txt","ranges":["9-20","30-31"]}),
                json!({"path":"/tmp/a.txt","fullContent":true}),
                json!({"path":"a.txt","content":"one\n","totalLines":40}),
            ),
        ];
        for (tool, unknown, whole, mut data) in cases {
            data["next"] = json!({"unfiltered": call(tool, unknown.clone()),
                "unfiltered2": call(tool, whole.clone())});
            for mcp in [false, true] {
                let outcome = stage(
                    tool,
                    json!({"results":[{"index":0,"data":data.clone()}]}),
                    mcp,
                );
                let next = &outcome.structured_content["results"][0]["data"]["next"];
                assert_eq!(
                    next["unfiltered"]["query"]["queries"],
                    json!([unknown]),
                    "{tool} mcp={mcp}: {next}"
                );
                assert_eq!(
                    next["unfiltered2"]["query"]["queries"],
                    json!([whole]),
                    "{tool} mcp={mcp}: {next}"
                );
            }
        }
    }

    #[test]
    fn rejected_batch_rows_stay_explicit_errors_on_both_channels() {
        let rejected = json!({"index":1,"status":"error","data":{"error":"Check the query fields.","errorCode":"invalidInput"}});
        let rows = json!({"results":[fetch_row(0), rejected.clone()]});
        for mcp in [false, true] {
            let outcome = stage("localFetch", rows.clone(), mcp);
            assert_eq!(outcome.structured_content["results"][1]["status"], "error");
            assert!(!outcome.all_failed);
        }
    }

    #[test]
    fn a_malformed_row_becomes_an_error_row_and_marks_failure() {
        let malformed = json!({"index":0,"data":{"path":7}});
        let outcome = stage("localFetch", json!({"results":[malformed]}), true);
        assert_eq!(outcome.structured_content["results"][0]["status"], "error");
        assert!(outcome.failure.is_some());
        assert!(outcome.all_failed);
    }

    #[test]
    fn an_invalid_envelope_is_a_contract_error_not_a_repair() {
        let result = finish(
            StageInput {
                tool: ToolId::LocalFetch,
                structured: json!({"results":"not-an-array"}),
                response_query: json!({}),
                options: ResponsePageOptions::default(),
                mcp: true,
                failure: None,
                auto_page_chars: 20_000,
                text_format: super::super::render::TextFormat::Yaml,
                allow_auto_paging: true,
                source_digest: None,
            },
            &context(),
        )
        .expect("stage runs");
        assert!(result.is_err());
    }

    /// An explicitly paged text response hashes the rendered text; a
    /// GitHub error row's request id must not change that snapshot.
    #[test]
    fn text_pages_ignore_provider_request_ids() {
        let snapshot = |request_id: &str| {
            let rows = json!({"results":[
                {"index":0,"data":{"path":"a.txt","content":"one\n".repeat(200),"totalLines":200}},
                {"index":1,"status":"error","data":{"error":"Not found","errorCode":"notFound",
                    "httpStatus":404,"requestId":request_id,
                    "rateLimit":{"remaining":4999,"resetEpochSeconds":1_700_000_000}}}]});
            let outcome = finish(
                StageInput {
                    tool: ToolId::GhGetFileContent,
                    structured: rows,
                    response_query: json!({"queries":[{"owner":"o","repo":"r","path":"a.txt","mainGoal":"g","reasoning":"r"}]}),
                    options: ResponsePageOptions {
                        response_length: Some(300),
                        ..Default::default()
                    },
                    mcp: true,
                    failure: None,
                    auto_page_chars: 20_000,
                    text_format: super::super::render::TextFormat::Yaml,
                    allow_auto_paging: true,
                    source_digest: None,
                },
                &context(),
            )
            .expect("stage runs")
            .expect("valid envelope");
            outcome.structured_content["responsePagination"]["snapshot"].clone()
        };
        let first = snapshot("360F:376635:800998:A22B33:6ABD2D5E");
        assert!(first.is_string(), "{first}");
        assert_eq!(first, snapshot("47F4:376635:800A3C:A22BF9:6ABD2D60"));
    }

    #[test]
    fn clasify_receipts_keep_their_read_lead_executable() {
        let receipt = json!({"queries":[{"id":"q","model":"jev-1.13.0",
            "answers":{"a":{"type":"noul","noul":0.5}},
            "usage":{"input_tokens":3,"output_tokens":1},
            "hints":{"read":{"tool":"localFetch","query":{"queries":[
                {"path":"/tmp/a","ranges":["1-2"]}]}}}}]});
        let mut structured = receipt.clone();
        super::super::continuations::finalize(
            &mut structured,
            ToolId::Clasify,
            &super::super::continuations::Sources::Matrices(&json!({"queries":[]})),
            &super::super::continuations::Scope::everything(),
        )
        .expect("valid continuations");
        let outcome = finish(
            StageInput {
                tool: ToolId::Clasify,
                structured,
                response_query: json!({"queries":[]}),
                options: ResponsePageOptions::default(),
                mcp: false,
                failure: None,
                auto_page_chars: 20_000,
                text_format: super::super::render::TextFormat::Yaml,
                allow_auto_paging: false,
                source_digest: None,
            },
            &context(),
        )
        .expect("stage runs")
        .expect("valid envelope");
        // The read of exactly what was judged survives the stage unchanged.
        let returned = &outcome.structured_content["queries"][0];
        assert_eq!(
            suggested_input(returned, "read", "localFetch"),
            receipt["queries"][0]["hints"]["read"]["query"]
        );
        for key in ["id", "model", "answers", "usage"] {
            assert_eq!(returned[key], receipt["queries"][0][key]);
        }
        assert!(
            outcome.content.is_empty(),
            "non-MCP receipts are not rendered"
        );
    }

    #[test]
    fn mcp_clasify_receipts_render_in_the_configured_text_format() {
        let receipt = json!({"queries":[{"id":"q","model":"jev-1.13.0",
            "answers":{"a":{"type":"noul","noul":0.5}},
            "usage":{"input_tokens":3,"output_tokens":1}}]});
        let render = |format| {
            finish(
                StageInput {
                    tool: ToolId::Clasify,
                    structured: receipt.clone(),
                    response_query: json!({"queries":[]}),
                    options: ResponsePageOptions::default(),
                    mcp: true,
                    failure: None,
                    auto_page_chars: 20_000,
                    text_format: format,
                    allow_auto_paging: false,
                    source_digest: None,
                },
                &context(),
            )
            .expect("stage runs")
            .expect("valid envelope")
        };
        let yaml = render(super::super::render::TextFormat::Yaml);
        assert_eq!(yaml.content.len(), 1);
        let text = &yaml.content[0].text;
        assert!(text.contains("id: q"), "{text}");
        assert!(!text.trim_start().starts_with('{'), "{text}");
        assert_eq!(yaml.structured_content["queries"], receipt["queries"]);
        let json_text = render(super::super::render::TextFormat::Json);
        let parsed: Value = serde_json::from_str(&json_text.content[0].text).expect("json text");
        assert_eq!(parsed["queries"], receipt["queries"]);
    }
}

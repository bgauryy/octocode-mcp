//! Optional search/read → clasify leads for an explicit target.
//! Multiple candidates or unfinished raw coverage can offer another way to
//! inspect evidence. These structural conditions do not establish a saving;
//! the caller chooses whether to follow the lead and verifies source evidence.
//! Existing pages remain intact. Availability is handled by the shared lead
//! filter, and explicit local ranking never receives a second semantic offer.
use crate::tools::id::ToolId;
use crate::tools::id::query_limits::clasify::MAIN_GOAL_MAX_LENGTH;
use serde_json::{Map, Value, json};

/// Result views whose files are not evidence-bearing hits.
const NON_HIT_VIEWS: [&str; 4] = ["filesWithout", "countLines", "countMatches", "matchOnly"];

/// One entry per output row: the valid query that produced it, or `None` for a
/// row rejected at input. Output rows keep their original input position while
/// `queries` holds only the valid ones, so a plain index would misalign every
/// query after a rejection.
pub(crate) fn row_queries<'a>(queries: &'a [Value], rejected: &[usize]) -> Vec<Option<&'a Value>> {
    let mut valid = queries.iter();
    (0..queries.len() + rejected.len())
        .map(|position| {
            if rejected.contains(&position) {
                None
            } else {
                valid.next()
            }
        })
        .collect()
}

pub(crate) fn attach(structured: &mut Value, tool: &str, queries: &[Option<&Value>]) {
    let Some(id) = ToolId::from_name(tool) else {
        return;
    };
    let search = crate::tools::clasify::is_candidate_search_tool(id);
    if !search && !crate::tools::clasify::is_file_read_tool(id) {
        return;
    }
    let Some(rows) = structured.get_mut("results").and_then(Value::as_array_mut) else {
        return;
    };
    for (position, row) in rows.iter_mut().enumerate() {
        let index = row
            .get("index")
            .and_then(Value::as_u64)
            .and_then(|index| usize::try_from(index).ok())
            .unwrap_or(position);
        let Some(Some(query)) = queries.get(index) else {
            continue;
        };
        // A local goal or ranked continuation already chose a semantic stage.
        // Do not suggest a second pass or copy ranking into a matrix resource.
        if matches!(id, ToolId::LocalSearch | ToolId::LocalFetch)
            && (query.get("goals").is_some() || query.get("ranking").is_some())
        {
            continue;
        }
        let Some(data) = row.get_mut("data").and_then(Value::as_object_mut) else {
            continue;
        };
        if !search {
            if let Some((name, lead)) = file_read_lead(tool, query, data)
                && data.get("next").is_none_or(|next| next.get(name).is_none())
                && let Some(next) = data
                    .entry("next")
                    .or_insert_with(|| json!({}))
                    .as_object_mut()
            {
                next.insert(name.into(), lead);
            }
            continue;
        }
        if let Some(request) = request(tool, query, data) {
            let next = data.entry("next").or_insert_with(|| json!({}));
            if let Some(next) = next.as_object_mut() {
                next.insert(
                    ToolId::Clasify.as_str().into(),
                    crate::tools::result::Continuation::new(ToolId::Clasify, request)
                        .confidence("medium")
                        .build(),
                );
            }
        }
    }
}

/// Only a caller-supplied brief defines the target. Search text is lexical
/// evidence, not an implicit request for a semantic judgment.
fn target(query: &Value) -> Option<String> {
    ["mainGoal", "reasoning"]
        .iter()
        .filter_map(|key| query.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .find(|text| !text.is_empty())
        .map(|text| text.chars().take(MAIN_GOAL_MAX_LENGTH).collect())
}

/// Preserve explicit exact-identifier searches instead of proposing a second
/// semantic interpretation of their hits. Reuse Locate's literal parser.
fn exact_search(tool: &str, query: &Value) -> bool {
    if query.get("wholeWord") == Some(&Value::Bool(true)) {
        return true;
    }
    let literal = |text: &str| crate::tools::clasify::locate::identifier_target(text).is_some();
    if tool == ToolId::GhSearchCode.as_str() {
        query
            .get("keywords")
            .and_then(Value::as_array)
            .is_some_and(|keywords| keywords.iter().filter_map(Value::as_str).any(literal))
    } else {
        query
            .get("matchString")
            .and_then(Value::as_str)
            .is_some_and(literal)
    }
}

/// A source continuation or partial receipt establishes unfinished coverage;
/// line count and the wording/language of a target do not.
fn unfinished(data: &Map<String, Value>) -> bool {
    data.get("pagination").and_then(|page| page.get("hasMore")) == Some(&Value::Bool(true))
        || data.get("isPartial") == Some(&Value::Bool(true))
        || data
            .get("next")
            .and_then(Value::as_object)
            .is_some_and(|next| next.keys().any(|name| name.starts_with("nextMatchPage")))
}

/// Do not broaden an explicitly bounded, exhaustive, or transformed read.
/// A raw unfinished file or match walk may offer Locate for the caller's target.
fn file_read_lead(
    tool: &str,
    query: &Value,
    data: &Map<String, Value>,
) -> Option<(&'static str, Value)> {
    if query.get("fullContent") == Some(&Value::Bool(true))
        || query.get("ranges").is_some()
        || query.get("block") == Some(&Value::Bool(true))
        || query.get("unit").and_then(Value::as_str) == Some("bytes")
        || query
            .get("minify")
            .and_then(Value::as_str)
            .is_some_and(|minify| minify != "none")
        || !unfinished(data)
    {
        return None;
    }
    let goal = target(query)?;
    let path = query.get("path")?.as_str()?;
    if let Some(literal) = crate::tools::clasify::locate::identifier_target(&goal) {
        // A match walk already supplies the cheap exact route.
        return (tool == ToolId::LocalFetch.as_str() && query.get("matchString").is_none())
            .then(|| crate::tools::clasify::locate::literal_file_search(path, literal))
            .flatten()
            .map(|search| ("findText", search));
    }
    let mut matrix = json!({
        "resources": [{"id": "file", "tool": tool, "query": file_coordinates(query)}],
        "questions": [{"id": "target", "type": "locate", "ask": goal}],
    });
    if let Some(main_goal) = query.get("mainGoal").filter(|value| value.is_string()) {
        matrix["mainGoal"] = main_goal.clone();
    }
    if let Some(reasoning) = query.get("reasoning").filter(|value| value.is_string()) {
        matrix["reasoning"] = reasoning.clone();
    }
    Some((
        ToolId::Clasify.as_str(),
        crate::tools::result::Continuation::new(ToolId::Clasify, matrix)
            .confidence("medium")
            .build(),
    ))
}

/// Coordinates of the file behind a raw read; explicit bounded reads never
/// enter this handoff. Preserve a supplied snapshot as well as a remote ref.
fn file_coordinates(query: &Value) -> Value {
    let read: Map<String, Value> = ["path", "owner", "repo", "ref", "snapshot"]
        .iter()
        .filter_map(|key| {
            query
                .get(*key)
                .map(|value| ((*key).to_owned(), value.clone()))
        })
        .collect();
    Value::Object(read)
}

fn request(tool: &str, query: &Value, data: &Map<String, Value>) -> Option<Value> {
    if query.get("invertMatch") == Some(&Value::Bool(true))
        || query
            .get("resultView")
            .and_then(Value::as_str)
            .is_some_and(|view| NON_HIT_VIEWS.contains(&view))
    {
        return None;
    }
    let files = data.get("files")?.as_array()?;
    if files.len() < 2 {
        return None;
    }
    let goal = target(query)?;
    if exact_search(tool, query)
        || crate::tools::clasify::locate::identifier_target(&goal).is_some()
    {
        return None;
    }
    let brief = query.get("mainGoal").and_then(Value::as_str);
    // The search reruns as sent, less what the matrix states for it: the
    // brief (a resource read inherits the matrix brief) and the search's own
    // output opt-ins (clasify's output has its own `extras`).
    let mut search = query.clone();
    if let Some(fields) = search.as_object_mut() {
        fields.remove("extras");
        if brief.is_some() {
            fields.remove("mainGoal");
        }
        fields.remove("reasoning");
    }
    let metadata_only = query.get("resultView").and_then(Value::as_str) == Some("files")
        // A `fields` pick without `lines` returns paths, not file text.
        || query
            .get("fields")
            .and_then(Value::as_array)
            .is_some_and(|fields| !fields.is_empty() && !fields.iter().any(|field| field == "lines"))
        || query.get("matchIn").and_then(Value::as_str) == Some("path");
    let relevance = if metadata_only {
        json!({
            "id":"relevant", "type":"yesno",
            "ask": format!(
                "Does this candidate's path or metadata suggest it likely contains evidence for: {goal}? This is a routing judgment; missing file bodies are not negative evidence."
            ),
        })
    } else {
        json!({"id":"relevant", "type":"relevant", "ask":goal})
    };
    let mut resource = json!({"id": "candidates", "tool": tool, "query": search});
    // Metadata routing must not implicitly hydrate unseen file bodies.
    if metadata_only {
        resource["candidateEvidence"] =
            json!(crate::tools::clasify::CandidateEvidence::Search.to_string());
    } else if tool == ToolId::LocalSearch.as_str() {
        resource["candidateEvidence"] =
            json!(crate::tools::clasify::CandidateEvidence::FileChunks.to_string());
    }
    // The handoff carries only the brief the caller sent.
    let mut matrix = json!({
        "resources": [resource],
        "questions": [
            relevance,
            {"id": "sufficient", "type": "sufficient", "ask": goal},
        ],
    });
    if brief.is_some() {
        matrix["mainGoal"] = json!(goal);
    }
    if let Some(reasoning) = query.get("reasoning").filter(|value| value.is_string()) {
        matrix["reasoning"] = reasoning.clone();
    }
    Some(matrix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(structured: &mut Value, tool: &str, queries: &[Value]) {
        let by_row = row_queries(queries, &[]);
        attach(structured, tool, &by_row);
    }

    fn local_rows(count: usize) -> Value {
        let files: Vec<Value> = (0..count)
            .map(|n| json!({"path": format!("src/f{n}.rs")}))
            .collect();
        json!({"root":"/repo","results":[{"index":0,"data":{"files":files}}]})
    }

    fn handoff(structured: &Value) -> Option<&Value> {
        structured["results"][0]["data"]["next"].get("clasify")
    }

    fn file_offer(query: &Value, data: &Value) -> Option<Value> {
        file_read_lead("localFetch", query, data.as_object().expect("data")).map(|(_, offer)| offer)
    }

    #[test]
    fn search_requires_an_explicit_target_and_multiple_candidates() {
        for query in [
            json!({"matchString":"retry delay"}),
            json!({"matchString":"retry delay","mainGoal":" ","reasoning":""}),
        ] {
            let mut out = local_rows(12);
            run(&mut out, "localSearch", &[query]);
            assert!(handoff(&out).is_none());
        }
        let query = json!({"matchString":"retry","mainGoal":"Locate the retry backoff condition"});
        for count in [0, 1, 2] {
            let mut out = local_rows(count);
            run(&mut out, "localSearch", std::slice::from_ref(&query));
            assert_eq!(handoff(&out).is_some(), count > 1);
        }
    }

    #[test]
    fn explicit_targets_do_not_depend_on_english_or_question_punctuation() {
        for goal in [
            "Capacity released when a queued operation is cancelled",
            "La condition qui libère la capacité réservée",
            "排队任务取消时释放预留容量",
        ] {
            let mut out = local_rows(2);
            run(
                &mut out,
                "localSearch",
                &[json!({"matchString":"cancel","mainGoal":goal})],
            );
            let query = &handoff(&out).expect("explicit target")["query"]["queries"][0];
            assert_eq!(query["questions"][0]["ask"], goal);
            let offer = file_offer(
                &json!({"path":"src/queue.rs","mainGoal":goal}),
                &json!({"pagination":{"hasMore":true}}),
            )
            .expect("unfinished raw file");
            assert_eq!(offer["query"]["queries"][0]["questions"][0]["ask"], goal);
        }
    }

    #[test]
    fn reasoning_can_supply_the_target_without_inventing_main_goal() {
        let query = json!({"path":"src/queue.rs","reasoning":"Locate the cancellation guard"});
        let offer = file_offer(&query, &json!({"isPartial":true})).expect("target");
        let matrix = &offer["query"]["queries"][0];
        assert!(matrix.get("mainGoal").is_none());
        assert_eq!(matrix["reasoning"], query["reasoning"]);
        assert_eq!(matrix["questions"][0]["ask"], query["reasoning"]);
        assert_eq!(
            target(&json!({"mainGoal":" ","reasoning":" cible explicite "})).as_deref(),
            Some("cible explicite")
        );
    }

    #[test]
    fn file_lead_requires_unfinished_coverage_not_a_size_threshold() {
        let query = json!({"path":"src/queue.rs","mainGoal":"Locate the cancellation guard"});
        for data in [
            json!({"totalLines":12,"pagination":{"hasMore":true}}),
            json!({"totalLines":12,"isPartial":true}),
        ] {
            assert!(file_offer(&query, &data).is_some());
        }
        for data in [
            json!({"totalLines":4000,"pagination":{"hasMore":false}}),
            json!({"totalLines":4000,"content":"complete"}),
        ] {
            assert!(file_offer(&query, &data).is_none());
        }
        assert!(file_offer(&json!({"path":"src/queue.rs"}), &json!({"isPartial":true})).is_none());
    }

    #[test]
    fn match_lead_preserves_the_source_continuation_and_requires_more_coverage() {
        let query = json!({"path":"src/queue.rs","matchString":"cancel","mainGoal":"Locate the cancellation guard"});
        let continuation = json!({"tool":"localFetch","query":{"queries":[{"path":"src/queue.rs","matchString":"cancel","offset":1}]}});
        let mut out = json!({"results":[{"index":0,"data":{
            "content":"cancel", "next":{"nextMatchPage":continuation.clone()}
        }}]});
        run(&mut out, "localFetch", std::slice::from_ref(&query));
        assert!(handoff(&out).is_some());
        assert_eq!(
            out["results"][0]["data"]["next"]["nextMatchPage"],
            continuation
        );
        assert_eq!(out["results"][0]["data"]["content"], "cancel");
        assert!(file_offer(&query, &json!({"content":"cancel\n".repeat(100)})).is_none());
    }

    #[test]
    fn selected_exhaustive_or_transformed_reads_do_not_offer_broader_classification() {
        for extra in [
            json!({"fullContent":true}),
            json!({"ranges":["1-50"]}),
            json!({"block":true}),
            json!({"unit":"bytes"}),
            json!({"minify":"symbols"}),
            json!({"minify":"standard"}),
        ] {
            let mut query =
                json!({"path":"src/queue.rs","mainGoal":"Locate the cancellation guard"});
            query
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            for matched in [false, true] {
                if matched {
                    query["matchString"] = json!("cancel");
                }
                assert!(
                    file_offer(&query, &json!({"isPartial":true})).is_none(),
                    "{query}"
                );
            }
        }
    }

    #[test]
    fn explicit_local_goals_or_ranking_do_not_suggest_a_second_semantic_stage() {
        for tool in ["localSearch", "localFetch"] {
            for semantic in [
                json!({"goals":["Locate the cancellation guard"]}),
                json!({"ranking":"saved-order"}),
            ] {
                let mut query = json!({"path":"src/queue.rs","matchString":"cancel","mainGoal":"Locate the cancellation guard"});
                query
                    .as_object_mut()
                    .unwrap()
                    .extend(semantic.as_object().unwrap().clone());
                let mut out = if tool == "localSearch" {
                    local_rows(12)
                } else {
                    json!({"results":[{"index":0,"data":{"isPartial":true,"content":"cancel"}}]})
                };
                let unchanged = out.clone();
                run(&mut out, tool, &[query]);
                assert_eq!(out, unchanged, "{tool}");
            }
        }
    }

    #[test]
    fn exact_identifiers_keep_the_existing_cheap_routes() {
        for query in [
            json!({"matchString":"newElementWith"}),
            json!({"matchString":"spawn_blocking"}),
            json!({"matchString":"get object","wholeWord":true}),
            json!({"matchString":"\"retry delay\""}),
        ] {
            let mut query = query;
            query["mainGoal"] = json!("Locate the cancellation guard");
            let mut out = local_rows(12);
            run(&mut out, "localSearch", &[query]);
            assert!(handoff(&out).is_none());
        }
        let mut out = local_rows(12);
        run(
            &mut out,
            "ghSearchCode",
            &[
                json!({"keywords":["spawn_blocking","tokio"],"mainGoal":"Locate the cancellation guard"}),
            ],
        );
        assert!(handoff(&out).is_none());
        let data = json!({"pagination":{"hasMore":true}});
        let query = json!({"path":"src/queue.rs","mainGoal":"find bulk_update"});
        let (name, offer) = file_read_lead("localFetch", &query, data.as_object().unwrap())
            .expect("literal search");
        assert_eq!(name, "findText");
        assert_eq!(offer["tool"], "localSearch");
        assert_eq!(offer["query"]["queries"][0]["matchString"], "bulk_update");
        assert!(file_read_lead("ghGetFileContent", &query, data.as_object().unwrap()).is_none());
        let mut matched = query;
        matched["matchString"] = json!("bulk_update");
        assert!(file_offer(&matched, &data).is_none());
    }

    #[test]
    fn search_handoff_preserves_scope_but_keeps_briefs_on_the_matrix() {
        let search = json!({
            "mainGoal":"Locate the retry condition", "reasoning":"Read the production retry policy",
            "path":"/repo", "matchString":"retry", "page":2,
            "pageSize":2, "include":["src/**"], "snapshot":"search-snapshot", "extras":["stats"]
        });
        let mut out = local_rows(2);
        run(&mut out, "localSearch", std::slice::from_ref(&search));
        let matrix = &handoff(&out).expect("handoff")["query"]["queries"][0];
        let mut rerun = search.clone();
        for key in ["mainGoal", "reasoning", "extras"] {
            rerun.as_object_mut().unwrap().remove(key);
        }
        assert_eq!(matrix["resources"][0]["query"], rerun);
        assert_eq!(matrix["resources"][0]["candidateEvidence"], "fileChunks");
        assert_eq!(matrix["mainGoal"], search["mainGoal"]);
        assert_eq!(matrix["reasoning"], search["reasoning"]);
    }

    #[test]
    fn file_handoff_preserves_revision_coordinates() {
        let query = json!({"owner":"o","repo":"r","ref":"sha","path":"a.rs","snapshot":"snapshot",
            "mainGoal":"Locate the cancellation guard"});
        let (_, offer) = file_read_lead(
            "ghGetFileContent",
            &query,
            json!({"isPartial":true}).as_object().unwrap(),
        )
        .expect("offer");
        assert_eq!(
            offer["query"]["queries"][0]["resources"][0]["query"],
            json!({"owner":"o","repo":"r","ref":"sha","path":"a.rs","snapshot":"snapshot"})
        );
    }

    #[test]
    fn non_hit_views_and_inverted_searches_do_not_offer_classification() {
        for view in NON_HIT_VIEWS {
            let mut out = local_rows(12);
            run(
                &mut out,
                "localSearch",
                &[
                    json!({"matchString":"retry","mainGoal":"Locate the retry condition","resultView":view}),
                ],
            );
            assert!(handoff(&out).is_none());
        }
        let mut out = local_rows(12);
        run(
            &mut out,
            "localSearch",
            &[
                json!({"matchString":"retry","mainGoal":"Locate the retry condition","invertMatch":true}),
            ],
        );
        assert!(handoff(&out).is_none());
    }

    #[test]
    fn metadata_candidates_get_a_routing_question() {
        for (tool, selection) in [
            (
                "localSearch",
                json!({"matchString":"retry","resultView":"files"}),
            ),
            (
                "ghSearchCode",
                json!({"keywords":["retry"],"fields":["path"]}),
            ),
            (
                "ghSearchCode",
                json!({"keywords":["retry"],"matchIn":"path"}),
            ),
        ] {
            let mut query = selection;
            query["mainGoal"] = json!("Locate the retry condition");
            let mut out = local_rows(2);
            run(&mut out, tool, &[query]);
            let matrix = &handoff(&out).expect("metadata routing")["query"]["queries"][0];
            assert_eq!(matrix["resources"][0]["candidateEvidence"], "search");
            assert_eq!(matrix["questions"][0]["type"], "yesno");
            assert!(
                matrix["questions"][0]["ask"]
                    .as_str()
                    .unwrap()
                    .contains("missing file bodies are not negative evidence")
            );
        }
    }

    #[test]
    fn generated_handoffs_validate_for_local_and_remote_tools() {
        for (tool, query) in [
            (
                "localSearch",
                json!({"path":"/repo","matchString":"retry","mainGoal":"Locate the retry condition"}),
            ),
            (
                "ghSearchCode",
                json!({"owner":"o","repo":"r","keywords":["retry"],"reasoning":"Locate the retry condition"}),
            ),
        ] {
            let mut out = local_rows(2);
            run(&mut out, tool, std::slice::from_ref(&query));
            let matrix = &handoff(&out).expect("handoff")["query"];
            crate::contracts::prepare_many_and_validate("clasify", matrix.clone())
                .expect("valid input");
            crate::contracts::validate_output(tool, &out).expect("valid output");
        }
        let query = json!({"path":"src/queue.rs","mainGoal":"Locate the cancellation guard"});
        let offer = file_offer(&query, &json!({"isPartial":true})).unwrap();
        crate::contracts::prepare_many_and_validate("clasify", offer["query"].clone())
            .expect("valid Locate");
    }

    #[test]
    fn rows_after_rejection_keep_their_own_target_and_coverage() {
        let queries = [
            json!({"mainGoal":"target zero","matchString":"retry"}),
            json!({"mainGoal":"target two","matchString":"retry"}),
        ];
        let files = local_rows(2)["results"][0]["data"]["files"].clone();
        let mut out = json!({"results":[
            {"index":0,"data":{"files":files.clone()}},
            {"index":1,"status":"error","data":{}},
            {"index":2,"data":{"files":files,"pagination":{"hasMore":true}}}
        ]});
        let by_row = row_queries(&queries, &[1]);
        assert!(by_row[1].is_none());
        attach(&mut out, "localSearch", &by_row);
        for (row, target) in [(0, "target zero"), (2, "target two")] {
            assert_eq!(
                out["results"][row]["data"]["next"]["clasify"]["query"]["queries"][0]["mainGoal"],
                target
            );
        }
        assert!(out["results"][1]["data"].get("next").is_none());
        assert_eq!(out["results"][2]["data"]["pagination"]["hasMore"], true);
    }
}

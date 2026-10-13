#![allow(clippy::expect_used, clippy::unwrap_used)]

use crate::support;

use serde_json::{Value, json};
use std::collections::BTreeSet;
use support::{LocateTopPassage, Workspace};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

#[derive(Clone)]
struct CandidateJudgment;

impl Respond for CandidateJudgment {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let body: Value = serde_json::from_slice(&request.body).expect("provider request");
        let relevant = body["state"]
            .to_string()
            .contains("retries stop after three failed attempts");
        let answers = body["questions"]
            .as_object()
            .expect("grouped questions")
            .keys()
            .map(|id| {
                (
                    id.clone(),
                    json!({"type":"noul", "noul": if relevant { 0.98 } else { 0.05 }}),
                )
            })
            .collect::<serde_json::Map<_, _>>();
        ResponseTemplate::new(200).set_body_json(json!({
            "model":"fixture", "answers":answers,
            "usage":{"input_tokens":2,"output_tokens":1}
        }))
    }
}

/// Choose only among the passage labels in each request. A bounded line
/// window may present fewer labels than the broader source payload.
#[derive(Clone)]
struct FirstOfferedPassage;

impl Respond for FirstOfferedPassage {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let body: Value = serde_json::from_slice(&request.body).expect("provider request");
        let answers = body["questions"]
            .as_object()
            .expect("grouped questions")
            .iter()
            .map(|(id, question)| {
                let answer = if question["type"] == "choice" {
                    let labels = question["criteria"]
                        .as_object()
                        .expect("choice labels")
                        .keys()
                        .collect::<Vec<_>>();
                    let rest = if labels.len() > 1 {
                        0.01 / (labels.len() - 1) as f64
                    } else {
                        0.0
                    };
                    let probabilities = labels
                        .iter()
                        .enumerate()
                        .map(|(index, label)| {
                            (
                                (*label).clone(),
                                json!(if index == 0 { 0.99 } else { rest }),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>();
                    json!({"type":"choice","choice":labels[0],"confidence":0.99,
                        "probabilities":probabilities})
                } else {
                    json!({"type":"noul","noul":0.99})
                };
                (id.clone(), answer)
            })
            .collect::<serde_json::Map<_, _>>();
        ResponseTemplate::new(200).set_body_json(json!({
            "model":"fixture","answers":answers,
            "usage":{"input_tokens":5,"output_tokens":2}
        }))
    }
}

async fn assert_candidate_walk(total: usize, page: u64, page_size: u64, expected: u64) {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/v1/systemone"))
        .respond_with(CandidateJudgment)
        .expect(expected)
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    for index in 0..total {
        let content = if index + 1 == total {
            "retry delay policy\nretries stop after three failed attempts\n"
        } else {
            "retry delay example\nunrelated logging example\n"
        };
        workspace.write(&format!("src/file{index:02}.txt"), content);
    }
    let root = workspace.write("src/root.txt", "no match\n");
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
        ("REQUEST_TIMEOUT", "30000".into()),
    ]);
    let search = json!({
        "mainGoal":"How does the retry policy stop repeated failed attempts?",
        "reasoning":"Select the deciding source among candidates and preserve exceptions.",
        "path":root.parent().unwrap(), "matchString":"retry delay",
        "sort":"path", "page":page, "pageSize":page_size, "contextLines":1,
        "extras":["hints"]
    });
    let outcome = runtime
        .execute(
            "search-handoff".into(),
            "localSearch".into(),
            json!({"queries":[search.clone()]}),
        )
        .await
        .expect("search");
    let mut matrix = outcome.structured_content["results"][0]["data"]["hints"]["clasify"]["query"]
        ["queries"][0]
        .clone();
    assert_eq!(matrix["reasoning"], search["reasoning"]);
    assert_eq!(matrix["resources"][0]["tool"], "localSearch");
    assert_eq!(matrix["resources"][0]["candidateEvidence"], "fileChunks");
    assert_eq!(matrix["questions"][1]["type"], "sufficient");
    let mut visited = BTreeSet::new();
    let mut deciding_read = None;
    let mut complete = false;
    // Every call screens at least one candidate.
    for _ in 0..expected {
        let outcome = runtime
            .execute(
                "classify-handoff".into(),
                "clasify".into(),
                json!({"queries":[matrix]}),
            )
            .await
            .expect("emitted matrix replays");
        octocode_native::contracts::validate_output("clasify", &outcome.structured_content)
            .expect("output contract");
        let query = &outcome.structured_content["queries"][0];
        for page in query["resources"][0]["pages"].as_array().unwrap() {
            let path = page["path"]
                .as_str()
                .or_else(|| query["resources"][0]["path"].as_str())
                .expect("candidate path");
            assert!(
                visited.insert(path.to_owned()),
                "repeated candidate: {path}"
            );
            assert!(page["answers"]["relevant"].is_number(), "{page}");
            assert!(page["answers"]["sufficient"].is_number(), "{page}");
            if page["answers"]["relevant"].as_f64().unwrap() > 0.9 {
                assert!(
                    path.ends_with(&format!("file{:02}.txt", total - 1)),
                    "{page}"
                );
                assert_eq!(page["answers"]["sufficient"], 0.98);
                // A page whose read is just its path and span implies it.
                deciding_read = Some(page.pointer("/hints/read").cloned().unwrap_or_else(|| {
                    json!({"tool":"localFetch","query":{"queries":[{
                        "path":path,
                        "ranges":[format!("{}-{}", page["line"], page["endLine"])]
                    }]}})
                }));
            }
        }
        let Some(next) = query.pointer("/next/clasify/queries/0") else {
            assert!(query["resources"][0].get("coverage").is_none(), "{query}");
            complete = true;
            break;
        };
        matrix = next.clone();
    }
    assert!(complete, "the candidate walk must terminate");
    assert_eq!(
        visited.len() as u64,
        expected,
        "every candidate remains reachable"
    );
    let read = deciding_read.expect("the last file must be screened");
    let verified = runtime
        .execute(
            "verify-source".into(),
            read["tool"].as_str().unwrap().into(),
            read["query"].clone(),
        )
        .await
        .expect("exact read replays");
    assert!(
        verified.structured_content["results"][0]["data"]["content"]
            .as_str()
            .unwrap()
            .contains("retries stop after three failed attempts")
    );
    runtime.close().await;
}

#[tokio::test]
async fn search_handoff_screens_late_candidates_and_replays_their_exact_read() {
    assert_candidate_walk(15, 1, 20, 15).await;
}

#[tokio::test]
async fn later_search_handoff_preserves_the_starting_candidate_when_bounded() {
    assert_candidate_walk(31, 2, 16, 15).await;
}

#[tokio::test]
async fn metadata_handoff_keeps_unseen_file_bodies_out_of_provider_evidence() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/v1/systemone"))
        .respond_with(CandidateJudgment)
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    let body = "retry delay policy\nBODY_ONLY_SENTINEL\n";
    workspace.write("src/a.txt", body);
    let file = workspace.write("src/b.txt", body);
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
    ]);
    let search = runtime
        .execute(
            "metadata-search".into(),
            "localSearch".into(),
            json!({"queries":[{
                "mainGoal":"Locate the retry condition", "path":file.parent().unwrap(),
                "matchString":"retry delay", "resultView":"files", "extras":["hints"]
            }]}),
        )
        .await
        .expect("metadata search");
    let matrix =
        search.structured_content["results"][0]["data"]["hints"]["clasify"]["query"].clone();
    assert_eq!(
        matrix["queries"][0]["resources"][0]["candidateEvidence"],
        "search"
    );
    assert!(server.received_requests().await.unwrap().is_empty());
    let screened = runtime
        .execute("metadata-classify".into(), "clasify".into(), matrix)
        .await
        .expect("metadata handoff replays");
    octocode_native::contracts::validate_output("clasify", &screened.structured_content)
        .expect("metadata output contract");
    let requests = server.received_requests().await.unwrap();
    assert!(!requests.is_empty());
    for request in requests {
        let sent: Value = serde_json::from_slice(&request.body).unwrap();
        let evidence = sent["state"].to_string();
        assert!(
            evidence.contains("a.txt") || evidence.contains("b.txt"),
            "{evidence}"
        );
        assert!(!evidence.contains("BODY_ONLY_SENTINEL"), "{evidence}");
    }
    runtime.close().await;
}

/// An explicit target and unfinished source coverage may offer Locate without
/// consulting a provider. The original source continuation remains executable.
#[tokio::test]
async fn unfinished_local_read_offers_optional_locate_and_preserves_source_coverage() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    let file = workspace.write("src/server.c", "one\nhousekeeping timer\nthree\n");
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
    ]);
    let read = |query: Value| {
        let runtime = &runtime;
        async move {
            runtime
                .execute(
                    "read".into(),
                    "localFetch".into(),
                    json!({"queries":[query]}),
                )
                .await
                .expect("read")
                .structured_content["results"][0]["data"]
                .clone()
        }
    };
    let brief = |extra: Value| {
        let mut query = json!({"mainGoal":"find the housekeeping timer","reasoning":"read the file","path":file,"extras":["hints"]});
        query
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        query
    };
    let paged = read(brief(json!({"unit":"lines","length":1}))).await;
    assert_eq!(paged["content"], "1\tone\n");
    let offer = &paged["hints"]["clasify"];
    assert_eq!(offer["tool"], "clasify", "{paged}");
    let matrix = &offer["query"]["queries"][0];
    assert_eq!(matrix["resources"][0]["tool"], "localFetch");
    assert_eq!(
        matrix["questions"][0],
        json!({"id":"target","type":"locate","ask":"find the housekeeping timer"})
    );
    octocode_native::contracts::prepare_many_and_validate(
        "clasify",
        json!({"queries":[matrix.clone()]}),
    )
    .expect("the offered matrix validates");
    let next = paged["next"]["continueWindow"]["query"]["queries"][0].clone();
    assert!(next.is_object(), "{paged}");
    let second = read(next).await;
    assert_eq!(second["content"], "2\thousekeeping timer\n");
    let next = second["next"]["continueWindow"]["query"]["queries"][0].clone();
    let third = read(next).await;
    assert_eq!(third["content"], "3\tthree\n");
    assert!(third["next"].get("continueWindow").is_none(), "{third}");
    for targeted in [
        read(brief(json!({"matchString":"housekeeping timer"}))).await,
        read(brief(json!({"ranges":["1-2"]}))).await,
        read(brief(json!({"fullContent":true}))).await,
        read(brief(json!({}))).await,
        read(json!({"path":file,"length":1,"extras":["hints"]})).await,
    ] {
        assert!(targeted["hints"].get("clasify").is_none(), "{targeted}");
    }
    runtime.close().await;
}

/// A source above the in-memory ranking limit has no judged source scope.
/// Its advertised goals may become an optional Locate over the same pinned
/// bytes. The initial read must not call JEV, and the copied matrix and its
/// deciding-source read must both execute without changing the source scope.
#[tokio::test]
async fn skipped_stream_goals_offer_executable_snapshot_bound_locate() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/v1/systemone"))
        .respond_with(LocateTopPassage {
            top: 0.99,
            exists: 0.99,
        })
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    let filler = "ordinary queue accounting without the deciding guard\n";
    let mut body = filler.repeat(100);
    body.push_str("the queued cancellation guard releases capacity\n");
    body.push_str(&filler.repeat(220_000));
    assert!(body.len() > 10 * 1024 * 1024);
    let file = workspace.write("src/large-queue.txt", &body);
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
        ("OCTOCODE_RANKING_ENABLED", "true".into()),
        ("REQUEST_TIMEOUT", "30000".into()),
    ]);
    let read = runtime
        .execute(
            "stream-goals".into(),
            "localFetch".into(),
            json!({"queries":[{"path":file,
                "goals":["Where a queued cancellation releases capacity"],
                "extras":["hints"]}]}),
        )
        .await
        .expect("streamed source read");
    let data = &read.structured_content["results"][0]["data"];
    assert_eq!(data["ranking"]["status"], "skipped", "{data}");
    assert_eq!(data["ranking"]["reason"], "streamingSource", "{data}");
    assert_eq!(data["isPartial"], true, "{data}");
    assert!(server.received_requests().await.unwrap().is_empty());
    let digest = data
        .pointer("/next/continueWindow/query/queries/0/snapshot")
        .and_then(Value::as_str)
        .expect("emitted source snapshot");
    assert!(
        !data["content"]
            .as_str()
            .unwrap()
            .contains("releases capacity")
    );
    let lead = &data["hints"]["clasify"];
    assert_eq!(lead["tool"], "clasify", "{data}");
    let matrix = &lead["query"]["queries"][0];
    assert_eq!(matrix["resources"][0]["query"]["snapshot"], digest);
    assert_eq!(matrix["resources"][0]["query"]["unit"], "lines");
    assert_eq!(matrix["resources"][0]["query"]["offset"], 100);
    assert_eq!(
        matrix["questions"][0]["ask"],
        "Where a queued cancellation releases capacity"
    );
    assert!(matrix["resources"][0]["query"].get("goals").is_none());
    let located = runtime
        .execute(
            "locate-stream".into(),
            "clasify".into(),
            lead["query"].clone(),
        )
        .await
        .expect("copyable Locate executes");
    octocode_native::contracts::validate_output("clasify", &located.structured_content)
        .expect("Locate output contract");
    let response = &located.structured_content["queries"][0];
    let best = &response["best"]["target"][0];
    assert_eq!(best["line"], 101, "{response}");
    let verify = &response["hints"]["read"];
    assert_eq!(verify["tool"], "localFetch", "{response}");
    assert_eq!(verify["query"]["queries"][0]["snapshot"], digest);
    let source = runtime
        .execute(
            "verify-stream".into(),
            "localFetch".into(),
            verify["query"].clone(),
        )
        .await
        .expect("source read executes");
    assert!(
        source.structured_content["results"][0]["data"]["content"]
            .as_str()
            .unwrap()
            .contains("queued cancellation guard releases capacity")
    );
    assert!(!server.received_requests().await.unwrap().is_empty());
    runtime.close().await;
}

#[tokio::test]
async fn streamed_brief_without_goals_offers_executable_snapshot_bound_locate() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/v1/systemone"))
        .respond_with(LocateTopPassage {
            top: 0.99,
            exists: 0.99,
        })
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    let filler = "ordinary queue accounting without the deciding guard\n";
    let mut body = filler.repeat(100);
    body.push_str("the queued cancellation guard releases capacity\n");
    body.push_str(&filler.repeat(220_000));
    assert!(body.len() > 10 * 1024 * 1024);
    let file = workspace.write("src/large-queue.txt", &body);
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
        ("OCTOCODE_RANKING_ENABLED", "true".into()),
        ("REQUEST_TIMEOUT", "30000".into()),
    ]);
    let first = runtime
        .execute(
            "stream-brief".into(),
            "localFetch".into(),
            json!({"queries":[{"path":file,
                "mainGoal":"Where a queued cancellation releases capacity",
                "extras":["hints"]}]}),
        )
        .await
        .expect("streamed brief read");
    let data = &first.structured_content["results"][0]["data"];
    assert_eq!(data["isPartial"], true, "{data}");
    assert!(
        data.get("ranking").is_none(),
        "brief did not request ranking"
    );
    assert!(server.received_requests().await.unwrap().is_empty());
    let source_window = &data["next"]["continueWindow"]["query"]["queries"][0];
    let lead = &data["hints"]["clasify"];
    assert_eq!(lead["tool"], "clasify", "{data}");
    let matrix = &lead["query"]["queries"][0];
    let resource = &matrix["resources"][0]["query"];
    assert_eq!(resource["path"], source_window["path"]);
    assert_eq!(resource["snapshot"], source_window["snapshot"]);
    assert_eq!(resource["unit"], "lines");
    assert_eq!(resource["offset"], 100);
    let located = runtime
        .execute(
            "locate-brief".into(),
            "clasify".into(),
            lead["query"].clone(),
        )
        .await
        .expect("brief Locate executes");
    let response = &located.structured_content["queries"][0];
    assert_eq!(response["best"]["target"][0]["line"], 101, "{response}");
    let verify = &response["hints"]["read"];
    assert_eq!(
        verify["query"]["queries"][0]["snapshot"],
        source_window["snapshot"]
    );
    let checked = runtime
        .execute(
            "verify-brief".into(),
            verify["tool"].as_str().unwrap().into(),
            verify["query"].clone(),
        )
        .await
        .expect("brief source verification executes");
    assert!(
        checked.structured_content["results"][0]["data"]["content"]
            .as_str()
            .unwrap()
            .contains("queued cancellation guard releases capacity")
    );
    assert!(!server.received_requests().await.unwrap().is_empty());
    runtime.close().await;
}

#[tokio::test]
async fn implicit_line_unit_brief_handoff_executes_its_copied_window() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/v1/systemone"))
        .respond_with(FirstOfferedPassage)
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    let file = workspace.write("src/server.c", "one\nhousekeeping timer\nthree\n");
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
    ]);
    let first = runtime
        .execute(
            "brief-line-page".into(),
            "localFetch".into(),
            json!({"queries":[{"path":file,"unit":"lines","length":1,
                "mainGoal":"Where the housekeeping timer is configured",
                "extras":["hints"]}]}),
        )
        .await
        .expect("bounded line read");
    let data = &first.structured_content["results"][0]["data"];
    let source_window = &data["next"]["continueWindow"]["query"]["queries"][0];
    assert!(source_window.get("unit").is_none(), "{source_window}");
    assert_eq!(data["pagination"]["unit"], "lines");
    assert!(server.received_requests().await.unwrap().is_empty());
    let lead = &data["hints"]["clasify"];
    assert_eq!(lead["tool"], "clasify", "{data}");
    let resource = &lead["query"]["queries"][0]["resources"][0]["query"];
    assert_eq!(resource["snapshot"], source_window["snapshot"]);
    assert_eq!(resource["offset"], source_window["offset"]);
    assert!(resource.get("unit").is_none(), "copy actual wire query");
    let located = runtime
        .execute(
            "locate-implicit-lines".into(),
            "clasify".into(),
            lead["query"].clone(),
        )
        .await
        .expect("copied implicit-line Locate executes");
    let response = &located.structured_content["queries"][0];
    assert_eq!(response["best"]["target"][0]["line"], 2, "{response}");
    let verify = &response["hints"]["read"];
    let checked = runtime
        .execute(
            "verify-implicit-lines".into(),
            verify["tool"].as_str().unwrap().into(),
            verify["query"].clone(),
        )
        .await
        .expect("deciding source read");
    assert!(
        checked.structured_content["results"][0]["data"]["content"]
            .as_str()
            .unwrap()
            .contains("housekeeping timer")
    );
    runtime.close().await;
}

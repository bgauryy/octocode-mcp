#![allow(clippy::expect_used, clippy::unwrap_used)]

use crate::support;

use serde_json::{Value, json};
use std::collections::BTreeSet;
use support::Workspace;
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

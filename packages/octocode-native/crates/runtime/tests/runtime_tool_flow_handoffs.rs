#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Search and fetch never hand off to public clasify: relevance runs inside
//! retrieval (`classifiers`), so no response offers a second relevance pass,
//! and none makes a provider request without classifiers.

use crate::support::{Run as _, Workspace};

use serde_json::json;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn wide_searches_and_unfinished_reads_offer_no_clasify_handoff() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&server)
        .await;
    let workspace = Workspace::new();
    for index in 0..40 {
        workspace.write(
            &format!("src/file_{index}.c"),
            (0..80)
                .map(|line| format!("housekeeping timer {line}\n"))
                .collect::<String>(),
        );
    }
    let runtime = workspace.runtime(&[
        ("OCTOCODE_BETA", "true".into()),
        ("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()),
        ("OCTOCODE_CLASSIFICATION_API_HOST", server.uri()),
    ]);
    for (tool, row) in [
        (
            "localSearch",
            json!({"path":"src","matchString":"housekeeping","mainGoal":"Where does housekeeping run?",
                "extras":["hints"]}),
        ),
        (
            "localFetch",
            json!({"path":"src/file_0.c","mainGoal":"Where does housekeeping run?","length":3,
                "extras":["hints"]}),
        ),
    ] {
        let out = runtime
            .run("handoff".into(), tool.into(), json!({"queries":[row]}))
            .await
            .expect("result")
            .structured_content;
        let data = &out["results"][0]["data"];
        assert!(
            crate::support::checks::hint(data, "clasify").is_null(),
            "{tool}: {data}"
        );
        assert!(data["next"].get("clasify").is_none(), "{tool}: {data}");
        assert!(
            crate::support::checks::hint(data, "readBlock").is_null(),
            "{tool}: {data}"
        );
    }
    runtime.close().await;
}

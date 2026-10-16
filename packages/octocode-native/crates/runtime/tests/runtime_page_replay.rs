#![allow(clippy::expect_used)]

use crate::support::{self, Run as _};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
#[cfg(unix)]
use serde_json::Value;
use serde_json::json;
use support::Workspace;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn lines(word: &str) -> String {
    (0..200)
        .map(|index| format!("needle {word} {index}\n"))
        .collect()
}

#[tokio::test]
async fn symbol_row_fragments_preserve_every_alias_and_member_once() {
    let workspace = Workspace::new();
    let aliases = (0..80)
        .map(|index| format!("Alias{index:03}_{}", "exported_name_".repeat(10)))
        .collect::<Vec<_>>();
    let methods = (0..5)
        .map(|index| format!("  method{index}(): string {{ return \"member {index}\"; }}\n"))
        .collect::<String>();
    let exports = aliases
        .iter()
        .map(|name| format!("  Container as {name},\n"))
        .collect::<String>();
    let file = workspace.write(
        "class.ts",
        format!("export class Container {{\n{methods}}}\nexport {{\n{exports}}};\n"),
    );
    let runtime = workspace.runtime(&[]);
    let mut pending = Some(json!({
        "queries":[{"operation":"symbols","path":file,"pageSize":1000}],
        "responseScope":"rows","responseLength":1000
    }));
    let mut seen_aliases = Vec::new();
    let mut seen_members = Vec::new();
    let mut pages = 0;
    while let Some(query) = pending.take() {
        assert!(pages < 100, "symbol row continuation did not terminate");
        let outcome = runtime
            .run(
                format!("symbol-fragment-{pages}"),
                "astSearch".into(),
                query,
            )
            .await
            .expect("every symbol fragment satisfies the output contract");
        let output = &outcome.structured_content;
        for row in output["results"].as_array().expect("result rows") {
            for symbol in row["data"]["symbols"].as_array().expect("symbols") {
                assert_eq!(symbol["symbolName"], "Container");
                for alias in symbol["exportedAs"].as_array().into_iter().flatten() {
                    seen_aliases.push(alias.as_str().expect("export alias").to_owned());
                }
                for member in symbol["members"].as_array().into_iter().flatten() {
                    seen_members.push((
                        member["symbolName"]
                            .as_str()
                            .expect("member name")
                            .to_owned(),
                        member["line"].as_u64().expect("member source line"),
                    ));
                }
            }
        }
        let page = &output["responsePagination"];
        if page["hasMore"] == true {
            assert_eq!(page["next"]["tool"], "astSearch");
            pending = Some(page["next"]["query"].clone());
        }
        pages += 1;
    }
    assert!(pages > 2, "the fixture must exercise later row fragments");
    let mut public_names = aliases;
    public_names.push("Container".to_owned());
    assert_eq!(seen_aliases, public_names);
    assert_eq!(
        seen_members,
        (0..5)
            .map(|index| (format!("method{index}"), index + 2))
            .collect::<Vec<_>>()
    );
    runtime.close().await;
}

/// Unreadable but otherwise unchanged (same size and modification time):
/// a re-execution could no longer read the file, a replay still serves it.
#[cfg(unix)]
fn unreadable(path: &std::path::Path, locked: bool) {
    use std::os::unix::fs::PermissionsExt;
    let mode = if locked { 0o000 } else { 0o644 };
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).expect("chmod");
}

#[cfg(unix)]
#[tokio::test]
async fn a_matching_snapshot_pages_the_stored_envelope_without_re_executing() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", lines("original"));
    settle(&workspace.workspace);
    let root = file.parent().unwrap().to_string_lossy().into_owned();
    let runtime = workspace.runtime(&[]);
    let first = runtime
        .run(
            "page-1".into(),
            "localSearch".into(),
            json!({
                "queries":[{"path":root,"matchString":"needle","pageSize":50,
                    "mainGoal":"Find needles.","reasoning":"Exercise page replay."}],
                "responseLength": 800
            }),
        )
        .await
        .expect("first page");
    let pagination = first.structured_content["responsePagination"].clone();
    assert_eq!(pagination["hasMore"], true, "{pagination}");
    let snapshot = pagination["snapshot"].clone();
    let next = pagination["next"]["query"].clone();
    assert_eq!(next["responseSnapshot"], snapshot, "{pagination}");

    // A re-execution could no longer read the file and would demand a
    // restart; the stored envelope keeps serving the same response.
    unreadable(&file, true);
    let second = runtime
        .run("page-2".into(), "localSearch".into(), next.clone())
        .await
        .expect("second page");
    unreadable(&file, false);
    let page = &second.structured_content["responsePagination"];
    assert_eq!(page["snapshot"], snapshot, "{page}");
    assert_ne!(page["restart"], true, "{page}");
    assert!(page["offset"].as_u64().unwrap_or(0) > 0, "{page}");
    assert!(text(&second).contains("original"), "page 2 re-executed");

    let mut stale: Value = next;
    stale["responseSnapshot"] = json!(format!("{}0", snapshot.as_str().unwrap()));
    let third = runtime
        .run("page-stale".into(), "localSearch".into(), stale)
        .await
        .expect("stale page");
    let page = &third.structured_content["responsePagination"];
    assert_eq!(page["restart"], true, "{page}");
    assert_eq!(
        page["snapshot"], snapshot,
        "re-executing the unchanged source reproduces the response"
    );
    runtime.close().await;
}

const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

/// Dispatch counter: the content endpoint is hit `content_hits` times.
async fn github_file_server(content_hits: u64) -> MockServer {
    let server = MockServer::builder().start().await;
    let sha = SHA;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/main"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"sha": sha})))
        .mount(&server)
        .await;
    let body = lines("remote");
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/src%2Flib.rs"))
        .and(query_param("ref", sha))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "type": "file",
            "encoding": "base64",
            "content": STANDARD.encode(&body),
            "size": body.len(),
            "sha": "f".repeat(40),
            "path": "src/lib.rs"
        })))
        .expect(content_hits)
        .mount(&server)
        .await;
    server
}

/// At a commit SHA the source cannot change: a matching snapshot replays
/// (the content is fetched once for page 1, once more for the mismatched
/// snapshot). A branch can move, so each of its pages re-dispatches, as a
/// fresh runtime's would.
#[tokio::test]
async fn a_matching_snapshot_does_not_re_dispatch_and_a_mismatch_does() {
    for (reference, content_hits) in [(SHA, 2), ("main", 4)] {
        let server = github_file_server(content_hits).await;
        pages_at(&server, reference).await;
        drop(server);
    }
}

async fn pages_at(server: &MockServer, reference: &str) {
    let workspace = Workspace::new();
    let runtime = workspace.runtime(&[("GITHUB_API_URL", format!("{}/api/v3", server.uri()))]);
    let first = runtime
        .run(
            "gh-page-1".into(),
            "ghGetFileContent".into(),
            json!({
                "queries":[{"owner":"a","repo":"b","path":"src/lib.rs","ref":reference,
                    "forceRefresh":true,"fullContent":true,
                    "mainGoal":"Read the file.","reasoning":"Exercise page replay."}],
                "responseLength": 800
            }),
        )
        .await
        .expect("first page");
    let pagination = first.structured_content["responsePagination"].clone();
    assert_eq!(pagination["hasMore"], true, "{pagination}");
    let next = pagination["next"]["query"].clone();
    assert_eq!(next["queries"][0]["forceRefresh"], true, "{next}");

    for page in ["gh-page-2", "gh-page-2-again"] {
        let replayed = runtime
            .run(page.into(), "ghGetFileContent".into(), next.clone())
            .await
            .expect("replayed page");
        let page = &replayed.structured_content["responsePagination"];
        assert_eq!(page["snapshot"], pagination["snapshot"], "{page}");
        assert_ne!(page["restart"], true, "{page}");
    }

    let mut stale = next;
    stale["responseSnapshot"] = json!("response-rows-v2:stale");
    runtime
        .run("gh-page-stale".into(), "ghGetFileContent".into(), stale)
        .await
        .expect("a mismatched snapshot re-executes");
    runtime.close().await;
}

#[cfg(unix)]
#[tokio::test]
async fn rows_scope_pages_replay_the_stored_envelope() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", lines("original"));
    settle(&workspace.workspace);
    let root = file.parent().unwrap().to_string_lossy().into_owned();
    let runtime = workspace.runtime(&[]);
    let row = |word: &str| json!({"path":root,"matchString":word,"mainGoal":"Find needles.","reasoning":"Exercise page replay."});
    let first = runtime
        .run(
            "rows-1".into(),
            "localSearch".into(),
            json!({"queries":[row("needle"), row("original")],
                "responseScope":"rows","responseLength": 1200}),
        )
        .await
        .expect("first rows page");
    let pagination = first.structured_content["responsePagination"].clone();
    assert_eq!(pagination["hasMore"], true, "{pagination}");
    let snapshot = pagination["snapshot"].as_str().unwrap().to_owned();
    assert!(snapshot.starts_with("response-rows-v4:1200:"), "{snapshot}");
    let next = pagination["next"]["query"].clone();
    assert_eq!(next["responseSnapshot"], snapshot.as_str(), "{pagination}");

    let mut changed_window = next.clone();
    changed_window["responseLength"] = json!(2400);
    let restart = runtime
        .run(
            "rows-changed-window".into(),
            "localSearch".into(),
            changed_window,
        )
        .await
        .expect("changed row plan requests a restart");
    assert_eq!(
        restart.structured_content["responsePagination"]["restart"],
        true
    );
    assert_eq!(restart.structured_content["results"], json!([]));
    assert_eq!(
        restart.structured_content["responsePagination"]["next"]["query"]["responseOffset"],
        0
    );

    unreadable(&file, true);
    let second = runtime
        .run("rows-2".into(), "localSearch".into(), next)
        .await
        .expect("second rows page");
    unreadable(&file, false);
    let page = &second.structured_content["responsePagination"];
    assert_eq!(page["snapshot"], snapshot.as_str(), "{page}");
    assert_ne!(page["restart"], true, "{page}");
    runtime.close().await;
}

/// A continuation replays its origin even when the caller spelled a default
/// field in a different key position than the validated continuation does.
#[cfg(unix)]
#[tokio::test]
async fn a_continuation_replays_regardless_of_the_callers_key_order() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", lines("original"));
    settle(&workspace.workspace);
    let runtime = workspace.runtime(&[]);
    let first = runtime
        .run(
            "order-1".into(),
            "localFetch".into(),
            json!({
                "queries":[{"reasoning":"Exercise page replay.",
                    "path":file.to_string_lossy()}],
                "responseLength": 800
            }),
        )
        .await
        .expect("first page");
    let pagination = first.structured_content["responsePagination"].clone();
    assert_eq!(pagination["hasMore"], true, "{pagination}");
    unreadable(&file, true);
    let second = runtime
        .run(
            "order-2".into(),
            "localFetch".into(),
            pagination["next"]["query"].clone(),
        )
        .await
        .expect("second page");
    unreadable(&file, false);
    let page = &second.structured_content["responsePagination"];
    assert_eq!(page["snapshot"], pagination["snapshot"], "{page}");
    assert_ne!(page["restart"], true, "{page}");
    runtime.close().await;
}

/// Every file and directory under `root`, ten seconds older: settled sources
/// whose later edits a replay can tell apart.
fn settle(root: &std::path::Path) {
    let then = std::time::SystemTime::now() - std::time::Duration::from_secs(10);
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        if path.is_dir() {
            stack.extend(
                std::fs::read_dir(&path)
                    .expect("dir")
                    .map(|e| e.expect("entry").path()),
            );
        }
        std::fs::File::open(&path)
            .expect("open")
            .set_modified(then)
            .expect("backdate");
    }
}

fn text(outcome: &octocode_native::runtime::ToolOutcome) -> String {
    outcome
        .content
        .iter()
        .map(|content| content.text.as_str())
        .collect()
}

/// After the sources change, a persistent runtime answers a later page
/// exactly as a fresh runtime does (restart on the current source), and
/// never with evidence from before the edit.
#[tokio::test]
async fn an_edit_between_pages_answers_like_a_fresh_runtime() {
    let workspace = Workspace::new();
    let file = workspace.write("src/a.txt", lines("original"));
    workspace.write("src/b.txt", lines("second"));
    settle(&workspace.workspace);
    let root = file.parent().unwrap().to_string_lossy().into_owned();
    let persistent = workspace.runtime(&[]);
    let first = persistent
        .run(
            "fresh-1".into(),
            "localSearch".into(),
            json!({
                "queries":[{"path":root,"matchString":"needle","pageSize":50,
                    "mainGoal":"Find needles.","reasoning":"Exercise page replay."}],
                "responseLength": 800
            }),
        )
        .await
        .expect("first page");
    let pagination = first.structured_content["responsePagination"].clone();
    assert_eq!(pagination["hasMore"], true, "{pagination}");
    let next = pagination["next"]["query"].clone();

    workspace.write("src/a.txt", lines("rewritten"));
    workspace.write("src/b.txt", lines("changed"));
    let replayed = persistent
        .run("fresh-2".into(), "localSearch".into(), next.clone())
        .await
        .expect("persistent page");
    let fresh_runtime = workspace.runtime(&[]);
    let fresh = fresh_runtime
        .run("fresh-2".into(), "localSearch".into(), next)
        .await
        .expect("fresh page");
    let page = &replayed.structured_content["responsePagination"];
    assert_eq!(page["restart"], true, "{page}");
    assert_eq!(
        replayed.structured_content, fresh.structured_content,
        "persistent and fresh runtimes disagree"
    );
    assert_eq!(text(&replayed), text(&fresh));
    assert!(
        !text(&replayed).contains("original"),
        "stale evidence served"
    );
    persistent.close().await;
    fresh_runtime.close().await;
}

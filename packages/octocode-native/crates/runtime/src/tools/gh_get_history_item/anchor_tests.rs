//! Happy-path anchors: each operation's row carries the values the next hop
//! reads (`number`, `headSha`/`baseSha`/`mergeCommitSha`, `commitSha`,
//! changed files as path+stat, patch lines numbered on their own side).
#![allow(clippy::expect_used)]
use super::{HistoryItemRequest, execute};
use crate::providers::github::RetryPolicy;
use crate::security::scan::ContentScan;
use crate::tools::gh_shared::test_support::{fixture_context, mock_provider, mount_json};
use serde_json::{Value, json};
use std::path::Path;
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const BASE: &str = "1111111111111111111111111111111111111111";
const HEAD: &str = "2222222222222222222222222222222222222222";
const MERGE_BASE: &str = "3333333333333333333333333333333333333333";

struct Passthrough;
impl ContentScan for Passthrough {
    fn sanitize(
        &self,
        text: &str,
        _path: &Path,
    ) -> Result<(String, Vec<String>), (String, String)> {
        Ok((text.to_owned(), Vec::new()))
    }
}

async fn read(server: &MockServer, row: Value) -> Value {
    let provider = mock_provider(server, RetryPolicy::default());
    let context = fixture_context(Duration::from_secs(10), 4 << 20);
    let request = HistoryItemRequest::from_row(row).expect("valid row");
    execute(&provider.transport, &request, &context, &Passthrough)
        .await
        .expect("history item")
}

fn changed_file(name: &str) -> Value {
    json!({"filename":name,"status":"modified","additions":1,"deletions":1,
        "patch":"@@ -10,2 +10,2 @@\n keep\n-old\n+new"})
}

fn commit_raw(sha: &str, message: &str) -> Value {
    json!({"sha":sha,"commit":{"message":message,
        "author":{"name":"Ada","email":"a@x","date":"2024-01-01T00:00:00Z"}},
        "author":{"login":"ada"}})
}

#[tokio::test]
async fn commit_row_carries_its_sha_and_path_stat_files() {
    let server = MockServer::start().await;
    let mut raw = commit_raw(HEAD, "Fix parser");
    raw["parents"] = json!([{"sha":BASE}]);
    raw["stats"] = json!({"additions":1,"deletions":1});
    raw["files"] = json!([changed_file("src/a.rs")]);
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/commits/{HEAD}"),
        200,
        raw,
    )
    .await;
    let row = json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD});
    let out = read(&server, row.clone()).await;
    assert_eq!(out["commitSha"], HEAD, "{out}");
    assert_eq!(out["files"], json!(["M +1 -1 src/a.rs"]), "{out}");
    // A caller's SHA is not restated as its ref; a page listing every file
    // restates no count.
    assert!(out.get("ref").is_none(), "{out}");
    assert!(out.get("changedFilesCount").is_none(), "{out}");
    // Patches: each line numbered on its own side.
    let mut patched = row;
    patched["sections"] = json!(["patches"]);
    let out = read(&server, patched).await;
    let file = &out["files"][0];
    assert_eq!(file["path"], "src/a.rs", "{out}");
    let patch = file["patch"].as_str().expect("patch");
    assert!(patch.contains("10\t keep"), "{patch}");
    assert!(patch.contains("11\t-old"), "{patch}");
    assert!(patch.contains("11\t+new"), "{patch}");
}

/// `matchString` with no section named searches the patches (as on a pull
/// request): it is never silently ignored.
#[tokio::test]
async fn commit_match_string_without_sections_reads_its_patches() {
    let server = MockServer::start().await;
    let mut raw = commit_raw(HEAD, "Fix parser");
    raw["files"] = json!([changed_file("src/a.rs"), {
        "filename":"src/b.rs","status":"modified","additions":1,"deletions":1,
        "patch":"@@ -1 +1 @@\n-x\n+y"}]);
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/commits/{HEAD}"),
        200,
        raw,
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,"matchString":"new"}),
    )
    .await;
    let files = out["files"].as_array().expect("files");
    assert_eq!(files.len(), 1, "{out}");
    assert_eq!(files[0]["path"], "src/a.rs", "{out}");
    assert!(
        files[0]["patch"]
            .as_str()
            .is_some_and(|patch| patch.contains("+new"))
    );
    assert!(out["next"].get("readPatches").is_none(), "{out}");
}

/// A `matchString` that removes every changed file of the page says so
/// (how many files, what it searches) and leads to the same read without it;
/// it is not the silent `"files":[]` of a file the commit never touched. A
/// match inside a hunk header (the function context after `@@`) keeps the
/// file: the header is part of the diff that is shown.
#[tokio::test]
async fn commit_match_string_that_removes_every_file_says_so() {
    let server = MockServer::start().await;
    let mut raw = commit_raw(HEAD, "Fix parser");
    raw["files"] = json!([changed_file("src/a.rs"), {
        "filename":"src/b.rs","status":"modified","additions":1,"deletions":1,
        "patch":"@@ -40,2 +40,2 @@ def url_for(\n keep\n-x\n+y"}]);
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/commits/{HEAD}"),
        200,
        raw,
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,
            "include":["src/"],"matchString":"zzqx"}),
    )
    .await;
    assert_eq!(out["files"], json!([]), "{out}");
    assert_eq!(out["status"], "empty", "{out}");
    let warnings = out["warnings"].to_string();
    assert!(
        warnings.contains("matchString matched 0 of 2 changed files")
            && warnings.contains("hunk-header"),
        "{out}"
    );
    assert!(warnings.contains("drop matchString"), "{out}");
    let lead = &out["next"]["withoutMatchString"];
    assert_eq!(lead["tool"], "ghGetHistoryItem", "{out}");
    let query = &lead["query"]["queries"][0];
    assert!(query.get("matchString").is_none(), "{query}");
    assert_eq!(query["include"], json!(["src/"]), "{query}");
    assert_eq!(query["ref"], HEAD, "{query}");

    let out = read(
        &server,
        json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,"matchString":"url_for"}),
    )
    .await;
    let files = out["files"].as_array().expect("files");
    assert_eq!(files.len(), 1, "{out}");
    assert_eq!(files[0]["path"], "src/b.rs", "{out}");
    // Only a filter that removes every file is an empty answer.
    assert!(out.get("status").is_none(), "{out}");
    assert!(out.get("warnings").is_none(), "{out}");
    assert!(out["next"].get("withoutMatchString").is_none(), "{out}");
}

#[tokio::test]
async fn compare_row_names_both_resolved_commits_and_each_commit_sha() {
    let server = MockServer::start().await;
    // The `application/vnd.github.sha` read answers the bare SHA.
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/commits/feature"))
        .respond_with(ResponseTemplate::new(200).set_body_string(HEAD))
        .mount(&server)
        .await;
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/compare/v1...{HEAD}"),
        200,
        json!({"ahead_by":1,"behind_by":0,"total_commits":1,
            "permalink_url":"https://github.com/o/r/compare/o:1111111...o:2222222",
            "base_commit":{"sha":BASE},"merge_base_commit":{"sha":MERGE_BASE},
            "commits":[commit_raw(HEAD, "Add feature")],
            "files":[changed_file("src/a.rs")]}),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"compare","owner":"o","repo":"r","base":"v1","head":"feature"}),
    )
    .await;
    // `base`/`head` carry the resolved SHAs, never the query's ref names.
    assert_eq!(out["baseSha"], BASE, "{out}");
    assert_eq!(out["headSha"], HEAD, "{out}");
    assert!(out.get("commitsScope").is_none(), "{out}");
    assert_eq!(out["commits"][0]["commitSha"], HEAD, "{out}");
    assert_eq!(out["files"], json!(["M +1 -1 src/a.rs"]), "{out}");
}

#[tokio::test]
async fn issue_row_carries_number_state_author_and_discussion_size() {
    let server = MockServer::start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/issues/7",
        200,
        json!({"number":7,"title":"Crash","state":"open","user":{"login":"bob"},
            "body":"It crashes.","comments":3,"created_at":"2024-01-01T00:00:00Z",
            "updated_at":"2024-01-02T00:00:00Z"}),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"issue","owner":"o","repo":"r","number":7}),
    )
    .await;
    let issue = &out["issues"][0];
    assert_eq!(issue["number"], 7, "{out}");
    assert_eq!(issue["state"], "open", "{out}");
    assert_eq!(issue["author"], "bob", "{out}");
    assert_eq!(issue["commentsCount"], 3, "{out}");
    assert_eq!(issue["body"], "It crashes.", "{out}");
}

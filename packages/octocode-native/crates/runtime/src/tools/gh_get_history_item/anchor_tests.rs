//! Happy-path anchors: each operation's row carries the values the next hop
//! reads (`number`, `headSha`/`baseSha`/`mergeCommitSha`, `commitSha`,
//! changed files as path+stat, patch lines numbered on their own side).
#![allow(clippy::expect_used)]
use super::{HistoryItemRequest, execute};
use crate::security::scan::ContentScan;
use crate::tools::gh_shared::test_support::{fixture_context, mock_provider, mount_json};
use octocode_github::RetryPolicy;
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
        .data
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
    let server = MockServer::builder().start().await;
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
    let server = MockServer::builder().start().await;
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
    let server = MockServer::builder().start().await;
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
    // Only a filter that removes every file is an empty answer; one that
    // removes some counts them.
    assert!(out.get("status").is_none(), "{out}");
    assert_eq!(
        out["warnings"],
        json!(["matchString dropped 1 of 2 changed files: no patch line holds it."]),
        "{out}"
    );
    assert!(out["next"].get("withoutMatchString").is_none(), "{out}");
}

#[tokio::test]
async fn compare_row_names_both_resolved_commits_and_each_commit_sha() {
    let server = MockServer::builder().start().await;
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

/// A compare of identical refs changes nothing: an empty answer (exit 1),
/// as a commit or PR whose scope holds nothing is.
#[tokio::test]
async fn compare_of_identical_refs_is_an_empty_answer() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/compare/{HEAD}...{HEAD}"),
        200,
        json!({"ahead_by":0,"behind_by":0,"total_commits":0,
            "base_commit":{"sha":HEAD},"merge_base_commit":{"sha":HEAD},
            "commits":[],"files":[]}),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"compare","owner":"o","repo":"r","base":HEAD,"head":HEAD}),
    )
    .await;
    assert_eq!(out["status"], "empty", "{out}");
    assert_eq!(out["aheadBy"], 0, "{out}");
}

#[tokio::test]
async fn issue_row_carries_number_state_author_and_discussion_size() {
    let server = MockServer::builder().start().await;
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

async fn mount_pr(server: &MockServer, files: Value) {
    mount_json(
        server,
        "/api/v3/repos/o/r/pulls/1",
        200,
        json!({"number":1,"title":"Fix","state":"open","user":{"login":"ada"},
            "head":{"sha":HEAD,"ref":"fix"},"base":{"sha":BASE,"ref":"main"},
            "changed_files":files.as_array().map_or(0, Vec::len),
            "additions":1,"deletions":1,"created_at":"2024-01-01T00:00:00Z"}),
    )
    .await;
    mount_json(server, "/api/v3/repos/o/r/pulls/1/files", 200, files).await;
}

/// `matchString` matches patch lines only: a file whose path alone holds
/// it is not kept (its whole patch would answer nothing), and the files the
/// filter dropped are counted on the call.
#[tokio::test]
async fn pr_match_string_keeps_patch_hits_only_and_counts_dropped_files() {
    let server = MockServer::builder().start().await;
    mount_pr(
        &server,
        json!([
            {"filename":"src/a.rs","status":"modified","additions":1,"deletions":1,"sha":"1",
                "patch":"@@ -1,2 +1,2 @@\n keep\n-old\n+new Needle"},
            {"filename":"src/needle.rs","status":"modified","additions":1,"deletions":1,"sha":"2",
                "patch":"@@ -1 +1 @@\n-x\n+y"},
            {"filename":"src/b.rs","status":"modified","additions":1,"deletions":1,"sha":"3",
                "patch":"@@ -1 +1 @@\n-p\n+q"}
        ]),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"pullRequest","owner":"o","repo":"r","number":1,
            "sections":["patches"],"matchString":"needle"}),
    )
    .await;
    let paths = out["pullRequests"][0]["files"]
        .as_array()
        .expect("files")
        .iter()
        .map(|file| file["path"].clone())
        .collect::<Vec<_>>();
    assert_eq!(paths, [json!("src/a.rs")], "{out}");
    let warnings = out["warnings"].to_string();
    assert!(
        warnings.contains("matchString dropped 2 of 3 changed files"),
        "{out}"
    );
}

/// A patchless file a `matchString` could not search is read at the side
/// that holds it: a removed file at the base, never at the head (a 404).
/// Its path holding the literal does not make it searched.
#[tokio::test]
async fn pr_unpatched_removed_file_is_searched_at_the_base() {
    let server = MockServer::builder().start().await;
    mount_pr(
        &server,
        json!([
            {"filename":"src/needle_gone.rs","status":"removed","additions":0,"deletions":900,
                "sha":"1"},
            {"filename":"src/a.rs","status":"modified","additions":1,"deletions":1,"sha":"2",
                "patch":"@@ -1,2 +1,2 @@\n keep\n-old\n+new needle"}
        ]),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"pullRequest","owner":"o","repo":"r","number":1,
            "sections":["patches"],"matchString":"needle"}),
    )
    .await;
    assert_eq!(
        out["pullRequests"][0]["unsearchedFiles"],
        json!(["!tooLarge src/needle_gone.rs"]),
        "{out}"
    );
    let search = &out["next"]["searchUnpatchedFile"]["query"]["queries"][0];
    assert_eq!(search["path"], "src/needle_gone.rs", "{out}");
    assert_eq!(search["ref"], BASE, "{out}");
}

/// A commit's `matchString` keeps the files whose patch holds it (not a
/// path-only hit) and counts the files it dropped.
#[tokio::test]
async fn commit_match_string_drops_path_only_hits_and_counts_them() {
    let server = MockServer::builder().start().await;
    let mut raw = commit_raw(HEAD, "Fix parser");
    raw["files"] = json!([changed_file("src/a.rs"), {
        "filename":"src/new_thing.rs","status":"modified","additions":1,"deletions":1,
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
        json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,"matchString":"NEW"}),
    )
    .await;
    let files = out["files"].as_array().expect("files");
    assert_eq!(files.len(), 1, "{out}");
    assert_eq!(files[0]["path"], "src/a.rs", "{out}");
    assert!(
        out["warnings"]
            .to_string()
            .contains("matchString dropped 1 of 2 changed files"),
        "{out}"
    );
}

/// A changed file GitHub sent without a patch (too large to diff) was never
/// searched by `matchString`: it is listed as unsearched, never counted as
/// a file no patch line holds the literal in, and the row is partial with
/// the read that searches its source at the side that holds it.
#[tokio::test]
async fn commit_match_string_lists_patchless_files_as_unsearched() {
    let server = MockServer::builder().start().await;
    let mut raw = commit_raw(HEAD, "Fix parser");
    raw["parents"] = json!([{"sha":BASE}]);
    raw["files"] = json!([changed_file("src/a.rs"), {
        "filename":"src/b.rs","status":"modified","additions":1,"deletions":1,
        "patch":"@@ -1 +1 @@\n-x\n+y"}, {
        "filename":"src/big.rs","status":"modified","additions":900,"deletions":3,"sha":"9"}]);
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
    let paths = out["files"]
        .as_array()
        .expect("files")
        .iter()
        .map(|file| file["path"].clone())
        .collect::<Vec<_>>();
    assert_eq!(paths, [json!("src/a.rs")], "{out}");
    assert_eq!(
        out["warnings"],
        json!(["matchString dropped 1 of 3 changed files: no patch line holds it."]),
        "{out}"
    );
    assert_eq!(
        out["unsearchedFiles"],
        json!(["!tooLarge src/big.rs"]),
        "{out}"
    );
    assert_eq!(out["isPartial"], true, "{out}");
    assert_eq!(out["partialReasons"], json!(["patchUnavailable"]), "{out}");
    let search = &out["next"]["searchUnpatchedFile"]["query"]["queries"][0];
    assert_eq!(search["path"], "src/big.rs", "{out}");
    assert_eq!(search["ref"], HEAD, "{out}");
    assert_eq!(search["matchString"], "new", "{out}");

    // A literal no searched patch holds, beside an unsearched file, is no
    // empty answer: the unsearched file may hold it.
    let out = read(
        &server,
        json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,"matchString":"zzqx"}),
    )
    .await;
    assert_eq!(out["files"], json!([]), "{out}");
    assert!(out.get("status").is_none(), "{out}");
    assert_eq!(
        out["warnings"],
        json!(["matchString dropped 2 of 3 changed files: no patch line holds it."]),
        "{out}"
    );
    assert_eq!(
        out["unsearchedFiles"],
        json!(["!tooLarge src/big.rs"]),
        "{out}"
    );
    assert_eq!(out["partialReasons"], json!(["patchUnavailable"]), "{out}");
}

/// A comparison's `matchString` lists patchless files as unsearched too; a
/// removed one is searched at the merge base, where its text is.
#[tokio::test]
async fn compare_match_string_lists_patchless_files_as_unsearched() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/compare/{BASE}...{HEAD}"),
        200,
        json!({"ahead_by":1,"behind_by":0,"total_commits":1,
            "base_commit":{"sha":BASE},"merge_base_commit":{"sha":MERGE_BASE},
            "commits":[commit_raw(HEAD, "Add feature")],
            "files":[changed_file("src/a.rs"), changed_file("src/c.rs"), {
                "filename":"src/gone.rs","status":"removed","additions":0,"deletions":700,
                "sha":"9"}]}),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"compare","owner":"o","repo":"r","base":BASE,"head":HEAD,
            "matchString":"new"}),
    )
    .await;
    assert!(out.get("warnings").is_none(), "{out}");
    assert_eq!(
        out["unsearchedFiles"],
        json!(["!tooLarge src/gone.rs"]),
        "{out}"
    );
    assert_eq!(out["isPartial"], true, "{out}");
    assert_eq!(out["partialReasons"], json!(["patchUnavailable"]), "{out}");
    let search = &out["next"]["searchUnpatchedFile"]["query"]["queries"][0];
    assert_eq!(search["path"], "src/gone.rs", "{out}");
    assert_eq!(search["ref"], MERGE_BASE, "{out}");
}

/// A comment page whose minified view dropped text offers the raw re-read
/// of the same comment kinds: running it lists the comments again.
#[tokio::test]
async fn pr_raw_body_read_keeps_the_comment_sections() {
    let server = MockServer::builder().start().await;
    mount_pr(&server, json!([])).await;
    let comment = |id: u64| {
        json!({"id":id,"user":{"login":"rev"},"body":"See <!-- hidden note --> this",
            "created_at":"2024-01-01T00:00:00Z"})
    };
    mount_json(
        &server,
        "/api/v3/repos/o/r/issues/1/comments",
        200,
        json!([comment(1)]),
    )
    .await;
    let mut inline = comment(2);
    inline["path"] = json!("src/a.rs");
    inline["line"] = json!(3);
    inline["side"] = json!("RIGHT");
    inline["commit_id"] = json!(HEAD);
    mount_json(
        &server,
        "/api/v3/repos/o/r/pulls/1/comments",
        200,
        json!([inline]),
    )
    .await;
    let out = read(
        &server,
        json!({"operation":"pullRequest","owner":"o","repo":"r","number":1,
            "sections":["comments","reviewComments"]}),
    )
    .await;
    let raw = &out["next"]["readRawBody"]["query"]["queries"][0];
    assert_eq!(raw["minify"], "none", "{out}");
    assert_eq!(
        raw["sections"],
        json!(["comments", "reviewComments"]),
        "{out}"
    );
    let again = read(&server, raw.clone()).await;
    // Both sections are re-read: the discussion and the inline review
    // comments, each under its own key.
    for section in ["comments", "reviewComments"] {
        assert_eq!(
            again["pullRequests"][0][section]
                .as_array()
                .map_or(0, Vec::len),
            1,
            "{section}: {again}"
        );
    }
}

fn assert_history_page_contract(query: &Value, data: &Value) {
    let shaped = crate::response::rows::result_row(
        crate::tools::id::ToolId::GhGetHistoryItem,
        0,
        query,
        data.clone(),
        None,
    );
    crate::contracts::validate_output("ghGetHistoryItem", &json!({"results": [shaped]}))
        .expect("actual normalized history row satisfies the canonical output contract");
}

#[tokio::test]
async fn commit_path_scope_keeps_the_unfiltered_observed_count_separate() {
    let server = MockServer::builder().start().await;
    let mut raw = commit_raw(HEAD, "scoped files");
    raw["files"] = json!([
        changed_file("src/a.rs"),
        changed_file("docs/b.md"),
        changed_file("tests/c.rs")
    ]);
    mount_json(
        &server,
        format!("/api/v3/repos/o/r/commits/{HEAD}"),
        200,
        raw,
    )
    .await;
    let query = json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,
        "sections":["files"],"include":["src/**"]});
    let data = read(&server, query.clone()).await;
    assert_history_page_contract(&query, &data);
    assert_eq!(data["files"], json!(["M +1 -1 src/a.rs"]), "{data}");
    assert_eq!(data["changedFilesCount"], 3, "unfiltered observed files");
    assert!(data.get("changedFilesCountScope").is_none(), "{data}");
    assert_eq!(data["filePagination"]["totalItems"], 1, "scoped files");
    assert_eq!(data["filePagination"]["countScope"], "complete", "{data}");
}

#[tokio::test]
async fn pr_commit_last_short_batch_discloses_the_unreachable_reported_total() {
    for total in [250, 260] {
        let server = MockServer::builder().start().await;
        mount_json(
            &server,
            "/api/v3/repos/o/r/pulls/1",
            200,
            json!({
                "number":1,"title":"commits","state":"open","user":{"login":"ada"},
                "head":{"sha":HEAD},"base":{"sha":BASE},"commits":total,"changed_files":0
            }),
        )
        .await;
        for page in 1..=3 {
            let start = (page - 1) * 100;
            let rows = (start..(start + 100).min(250))
                .map(|i| commit_raw(&format!("{i:040x}"), &format!("commit {i}")))
                .collect::<Vec<_>>();
            let mut response = ResponseTemplate::new(200).set_body_json(rows);
            if page < 3 {
                response = response.insert_header(
                    "Link",
                    format!(
                        "<{}/api/v3/repos/o/r/pulls/1/commits?page={}&per_page=100>; rel=\"next\"",
                        server.uri(),
                        page + 1,
                    ),
                );
            }
            Mock::given(method("GET"))
                .and(path("/api/v3/repos/o/r/pulls/1/commits"))
                .and(wiremock::matchers::query_param("page", page.to_string()))
                .respond_with(response)
                .mount(&server)
                .await;
        }
        let mut query = json!({"operation":"pullRequest","owner":"o","repo":"r",
            "number":1,"sections":["commits"],"pageSize":100});
        let mut all = Vec::new();
        let mut pages = 0;
        let last = loop {
            pages += 1;
            assert!(pages <= 3);
            let data = read(&server, query.clone()).await;
            assert_history_page_contract(&query, &data);
            all.extend(
                data["pullRequests"][0]["commits"]
                    .as_array()
                    .expect("commits")
                    .iter()
                    .map(|c| c["commitSha"].as_str().expect("sha").to_owned()),
            );
            let Some(next) = data.pointer("/next/nextCommitPage/query") else {
                break data;
            };
            let normalized = crate::contracts::validate("ghGetHistoryItem", next.clone())
                .expect("executable copied commit page");
            query = normalized["queries"][0].clone();
        };
        assert_eq!(
            all,
            (0..250).map(|i| format!("{i:040x}")).collect::<Vec<_>>()
        );
        assert_eq!(
            all.iter().collect::<std::collections::HashSet<_>>().len(),
            250
        );
        let page = &last["pullRequests"][0]["contentPagination"]["commits"];
        assert_eq!(page["hasMore"], false);
        if total > 250 {
            assert_eq!(last["terminalLimit"], true, "{last}");
            assert_eq!(last["isPartial"], true, "{last}");
            assert_eq!(last["pullRequests"][0]["commitsCount"], total, "{last}");
            assert_eq!(page["countScope"], "partial", "{last}");
            assert_eq!(
                last["providerLimit"]["reason"], "providerCommitListLimit",
                "{last}"
            );
            assert!(last["next"].get("nextCommitPage").is_none(), "{last}");
        } else {
            assert_ne!(last["terminalLimit"], true, "{last}");
            assert_eq!(page["countScope"], "complete", "{last}");
        }
    }
}

#[tokio::test]
async fn commit_file_boundary_is_a_lower_bound_with_or_without_a_final_link() {
    for (listed, final_link, bounded) in [
        (2999, false, false),
        (3000, false, true),
        (3000, true, true),
    ] {
        let server = MockServer::builder().start().await;
        for page in 1..=30 {
            let start = (page - 1) * 100;
            let files = (start..(start + 100).min(listed)).map(|i| {
                json!({"filename":format!("file{i:04}.ts"),"status":"added","additions":1,"deletions":0})
            }).collect::<Vec<_>>();
            let mut raw = commit_raw(HEAD, "files");
            raw["parents"] = json!([{"sha":BASE}]);
            raw["files"] = json!(files);
            let mut response = ResponseTemplate::new(200).set_body_json(raw);
            if page < 30 || final_link {
                response = response.insert_header(
                    "Link",
                    format!(
                        "<{}/api/v3/repos/o/r/commits/{HEAD}?page={}&per_page=100>; rel=\"next\"",
                        server.uri(),
                        page + 1,
                    ),
                );
            }
            Mock::given(method("GET"))
                .and(path(format!("/api/v3/repos/o/r/commits/{HEAD}")))
                .and(wiremock::matchers::query_param("page", page.to_string()))
                .respond_with(response)
                .mount(&server)
                .await;
        }
        let mut query = json!({"operation":"commit","owner":"o","repo":"r","ref":HEAD,
            "sections":["files"],"pageSize":100});
        let mut all = Vec::new();
        let mut pages = 0;
        let last = loop {
            pages += 1;
            assert!(
                pages <= 30,
                "no phantom page past the hard provider boundary"
            );
            let data = read(&server, query.clone()).await;
            assert_history_page_contract(&query, &data);
            all.extend(data["files"].as_array().expect("files").iter().map(|file| {
                file.as_str()
                    .expect("root-file inventory row")
                    .split_whitespace()
                    .last()
                    .expect("path")
                    .to_owned()
            }));
            let Some(next) = data.pointer("/next/nextFilePage/query") else {
                break data;
            };
            let normalized = crate::contracts::validate("ghGetHistoryItem", next.clone())
                .expect("executable copied file page");
            query = normalized["queries"][0].clone();
        };
        assert_eq!(
            all,
            (0..listed)
                .map(|i| format!("file{i:04}.ts"))
                .collect::<Vec<_>>()
        );
        assert_eq!(
            all.iter().collect::<std::collections::HashSet<_>>().len(),
            listed
        );
        assert_eq!(last["filePagination"]["hasMore"], false, "{last}");
        if bounded {
            assert_eq!(last["terminalLimit"], true, "{last}");
            assert_eq!(last["isPartial"], true, "{last}");
            assert_eq!(last["filePagination"]["countScope"], "partial", "{last}");
            assert_eq!(last["changedFilesCountScope"], "partial", "{last}");
            assert_eq!(
                last["changedFilesCount"], 3000,
                "only observed files, never an invented total"
            );
        } else {
            assert_ne!(last["terminalLimit"], true, "{last}");
            assert_eq!(last["filePagination"]["countScope"], "complete", "{last}");
        }
        assert!(last["next"].get("nextFilePage").is_none(), "{last}");
    }
}

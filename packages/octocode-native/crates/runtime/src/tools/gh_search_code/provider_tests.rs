//! Provider-backed ghSearchCode tests: line resolution latency.
use super::{GhSearchCodeQuery, execute};
use crate::security::scan::Passthrough;
use crate::tools::gh_shared::test_support::{
    Delayed, MemoryCache, default_context, one_shot_provider,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::json;
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

/// The head commit hit lines are pinned to resolves while the index search
/// runs: one round trip, not two in series, before the file reads.
#[tokio::test]
async fn the_head_commit_resolves_while_the_search_runs() {
    let server = MockServer::builder().start().await;
    let delay = Duration::from_millis(300);
    let search = Delayed::new(
        delay,
        ResponseTemplate::new(200).set_body_json(json!({
            "total_count":1,"incomplete_results":false,"items":[
                {"name":"app.rs","path":"app.rs","sha":"1","html_url":"https://x",
                 "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
                 "text_matches":[{"fragment":"fn wrap_app() {}","matches":[{"text":"wrap_app","indices":[3,11]}]}]}
            ]
        })),
    );
    let commit = Delayed::new(delay, ResponseTemplate::new(200).set_body_string(SHA));
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(search.clone())
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/HEAD"))
        .respond_with(commit.clone())
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/app.rs"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "type":"file","encoding":"base64","content":STANDARD.encode("fn wrap_app() {}\n")
        })))
        .mount(&server)
        .await;
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery =
        serde_json::from_value(json!({"owner":"a","repo":"b","keywords":["wrap_app"]}))
            .expect("query");
    let context = default_context();
    let out = execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("search");
    assert_eq!(out.data["commitSha"], SHA, "{}", out.data);
    assert_eq!(
        out.data["files"][0]["lines"],
        json!(["1\tfn wrap_app() {}"])
    );
    let first = |slow: &Delayed| *slow.arrivals.times().first().expect("requested");
    let (searched, resolved) = (first(&search), first(&commit));
    let gap = if resolved > searched {
        resolved - searched
    } else {
        searched - resolved
    };
    assert!(
        gap < delay / 2,
        "the commit lookup waited {gap:?} for the search"
    );
}

/// A path-only search, or a `fields` pick without `lines`, reads no lines,
/// so it resolves no commit.
#[tokio::test]
async fn searches_without_line_reads_resolve_no_commit() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":1,"incomplete_results":false,"items":[
                {"name":"app.rs","path":"app.rs","sha":"1","html_url":"https://x",
                 "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"}}
            ]
        })))
        .mount(&server)
        .await;
    let provider = one_shot_provider(&server);
    let context = default_context();
    for row in [
        json!({"owner":"a","repo":"b","keywords":["app"],"matchIn":"path"}),
        json!({"owner":"a","repo":"b","keywords":["app"],"fields":["path"]}),
    ] {
        let query: GhSearchCodeQuery = serde_json::from_value(row).expect("query");
        execute(&provider, &query, &context, &Passthrough)
            .await
            .expect("search");
    }
    let requests = server.received_requests().await.expect("requests");
    assert!(
        requests
            .iter()
            .all(|request| request.url.path() == "/api/v3/search/code"),
        "{:?}",
        requests.iter().map(|r| r.url.path()).collect::<Vec<_>>()
    );
}

/// Two owner-wide hits in different repositories, indexed at `SHA`.
async fn mount_owner_wide_search(server: &MockServer) {
    let item = |repo: &str| {
        json!({"name":"x.py","path":"src/x.py","sha":"1",
         "html_url": format!("https://github.com/o/{repo}/blob/{SHA}/src/x.py"),
         "repository":{"full_name":format!("o/{repo}"),"html_url":"https://x","url":"https://x"},
         "text_matches":[{"fragment":"class HTTPAdapter(BaseAdapter):\n    pass","matches":[{"text":"HTTPAdapter","indices":[6,17]}]}]})
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":2,"incomplete_results":false,"items":[item("a"), item("b")]
        })))
        .mount(server)
        .await;
}

async fn run_owner_wide(server: &MockServer) -> crate::tools::result::ToolData {
    let provider = one_shot_provider(server);
    let query: GhSearchCodeQuery =
        serde_json::from_value(json!({"owner":"o","keywords":["HTTPAdapter"]})).expect("query");
    let context = default_context();
    execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("search")
}

/// Owner-wide rows are read at the commit each hit was indexed at
/// (`html_url`): numbered `lines` replace fragments, and the top read is
/// pinned to that commit instead of a `contextLines` fragment read.
#[tokio::test]
async fn owner_wide_rows_list_numbered_lines_at_the_indexed_commit() {
    let server = MockServer::builder().start().await;
    mount_owner_wide_search(&server).await;
    for repo in ["a", "b"] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/o/{repo}/contents/src%2Fx.py")))
            .and(wiremock::matchers::query_param("ref", SHA))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "type":"file","encoding":"base64",
                "content":STANDARD.encode("import x\n\nclass HTTPAdapter(BaseAdapter):\n    pass\n")
            })))
            .expect(1)
            .mount(&server)
            .await;
    }
    let out = run_owner_wide(&server).await;
    let files = out.data["files"].as_array().expect("files");
    assert_eq!(files.len(), 2, "{}", out.data);
    for row in files {
        assert_eq!(
            row["lines"],
            json!(["3\tclass HTTPAdapter(BaseAdapter):"]),
            "{}",
            out.data
        );
        assert!(row.get("matches").is_none(), "{}", out.data);
        assert!(row["repo"].is_string(), "{}", out.data);
        assert!(row.get("owner").is_none(), "{}", out.data);
    }
    // What every row shares (owner, one commit) is stated once.
    assert_eq!(out.data["owner"], "o", "{}", out.data);
    assert_eq!(out.data["commitSha"], SHA, "{}", out.data);
    let read = &out.data["next"]["read"]["query"]["queries"][0];
    assert_eq!(read["ref"], SHA, "{}", out.data);
    assert_eq!(read["owner"], "o", "{}", out.data);
    assert_eq!(read["repo"], "a", "{}", out.data);
    assert!(read.get("contextLines").is_none(), "{}", out.data);
}

/// A row whose file is gone at its indexed commit keeps its fragment
/// and says its lines were not read.
#[tokio::test]
async fn owner_wide_row_missing_at_its_commit_keeps_fragments() {
    let server = MockServer::builder().start().await;
    mount_owner_wide_search(&server).await;
    Mock::given(method("GET"))
        .and(wiremock::matchers::path_regex(
            "^/api/v3/repos/o/[ab]/contents/",
        ))
        .respond_with(ResponseTemplate::new(404).set_body_json(json!({"message":"Not Found"})))
        .mount(&server)
        .await;
    let out = run_owner_wide(&server).await;
    let row = &out.data["files"][0];
    assert_eq!(row["lineResolved"], false, "{}", out.data);
    assert!(row["matches"][0]["value"].is_string(), "{}", out.data);
    assert!(row.get("lines").is_none(), "{}", out.data);
}

/// Anchors: a repo-scoped page states the commit its lines were read at once
/// (`commitSha`); each file row is its `path` and numbered `lines`
/// ("N\ttext"), with no owner/repo/ref echo of the query.
#[tokio::test]
async fn a_repo_scoped_row_is_path_and_numbered_lines_at_one_commit() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":1,"incomplete_results":false,"items":[
                {"name":"app.rs","path":"src/app.rs","sha":"1","html_url":"https://x",
                 "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
                 "text_matches":[{"fragment":"fn wrap_app() {}","matches":[{"text":"wrap_app","indices":[3,11]}]}]}
            ]
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/HEAD"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/src%2Fapp.rs"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "type":"file","encoding":"base64",
            "content":STANDARD.encode("// app\nfn wrap_app() {}\n")
        })))
        .mount(&server)
        .await;
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery =
        serde_json::from_value(json!({"owner":"a","repo":"b","keywords":["wrap_app"]}))
            .expect("query");
    let context = default_context();
    let out = execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("search");
    assert_eq!(out.data["commitSha"], SHA, "{}", out.data);
    assert_eq!(
        out.data["files"],
        json!([{"path":"src/app.rs","lines":["2\tfn wrap_app() {}"]}]),
        "{}",
        out.data
    );
    for echo in ["owner", "repo", "ref", "indexRef", "keywords"] {
        assert!(out.data.get(echo).is_none(), "{echo}: {}", out.data);
    }
}

/// The default empty-result hint fits the query: it names only tools every
/// surface runs (the CLI also gets the executable `cloneRepo` lead), a
/// repository it can list only when the search had one, and fewer keywords
/// only when there is one to drop.
#[test]
fn the_default_empty_hint_fits_the_query() {
    use crate::tools::output::ToolOutput;
    let tools_named = |hint: &str| {
        let mut named = hint
            .split(|c: char| !c.is_ascii_alphanumeric())
            .filter(|word| word.starts_with("gh") && word.len() > 2)
            .map(str::to_owned)
            .collect::<Vec<_>>();
        named.sort();
        named.dedup();
        named
    };
    for (query, tools, fewer) in [
        (
            json!({"owner":"a","keywords":["qzxNotARealSymbol"]}),
            vec!["ghSearchRepo", "ghStructure"],
            false,
        ),
        (
            json!({"owner":"a","repo":"r","keywords":["qzxNotARealSymbol"]}),
            vec!["ghGetFileContent", "ghStructure"],
            false,
        ),
        (
            json!({"owner":"a","keywords":["alpha","beta"]}),
            vec!["ghGetFileContent"],
            true,
        ),
    ] {
        let hint = super::Output.fallback_hint(&query);
        assert!(
            hint.starts_with("An empty index result is unproven absence"),
            "{hint}"
        );
        assert_eq!(tools_named(hint), tools, "{query}: {hint}");
        assert_eq!(hint.contains("fewer keywords"), fewer, "{query}: {hint}");
    }
}

/// An empty code search for `row` against `a/b`: no index hit, a live repo.
async fn run_empty(row: serde_json::Value) -> crate::tools::result::ToolData {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"total_count":0,"incomplete_results":false,"items":[]})),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"full_name":"a/b","default_branch":"main","archived":false})),
        )
        .mount(&server)
        .await;
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery = serde_json::from_value(row).expect("query");
    let context = default_context();
    execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("empty search")
}

/// An empty repo-scoped search is unproven absence; the default hint says
/// so in plain words and `next.cloneRepo` is the runnable way to verify it,
/// scoped to the same ref as the search.
#[tokio::test]
async fn an_empty_repo_search_leads_to_a_runnable_clone() {
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["zzqq"]})).await;
    let clone = &out.data["next"]["cloneRepo"];
    assert_eq!(clone["tool"], "ghCloneRepo", "{}", out.data);
    assert_eq!(
        clone["query"]["queries"][0],
        json!({"owner":"a","repo":"b"}),
        "{}",
        out.data
    );
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["zzqq"],"ref":"v1"})).await;
    assert_eq!(
        out.data["next"]["cloneRepo"]["query"]["queries"][0],
        json!({"owner":"a","repo":"b","ref":"v1"}),
        "{}",
        out.data
    );
    // A path scope leads to its listing instead; a row shows two leads at most.
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["zzqq"],"path":"src"})).await;
    assert!(out.data["next"].get("cloneRepo").is_none(), "{}", out.data);
    assert!(out.data["next"].get("viewTree").is_some(), "{}", out.data);
}

/// `cloneRepo` runs only where clone is available, so an empty repo-wide
/// search also lists the root at the searched ref, a route every surface
/// runs. A search with a narrowing to drop keeps its second lead slot for
/// `broadenSearch` instead.
#[tokio::test]
async fn an_empty_repo_search_also_lists_the_root_on_every_surface() {
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["zzqq"],"ref":"v1"})).await;
    let tree = &out.data["next"]["viewTree"];
    assert_eq!(tree["tool"], "ghStructure", "{}", out.data);
    assert_eq!(
        tree["query"]["queries"][0],
        json!({"owner":"a","repo":"b","ref":"v1"}),
        "{}",
        out.data
    );
    assert!(out.data["next"].get("cloneRepo").is_some(), "{}", out.data);
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["zzqq","yyrr"]})).await;
    assert!(out.data["next"].get("viewTree").is_none(), "{}", out.data);
    assert!(
        out.data["next"].get("broadenSearch").is_some(),
        "{}",
        out.data
    );
}

/// `path` is a directory prefix, so a file path matches nothing. The
/// empty names the mistake, lists the file's parent directory, and reads the
/// file itself for the keywords.
#[tokio::test]
async fn a_file_path_scope_leads_to_filename_and_the_parent_listing() {
    let out = run_empty(json!({
        "owner":"a","repo":"b","keywords":["ppr"],"path":"packages/next/src/config-shared.ts"
    }))
    .await;
    let data = &out.data;
    assert_eq!(
        data["hints"],
        json!([
            "`path` is a directory prefix and `packages/next/src/config-shared.ts` looks like a file: search it by `filename:\"config-shared.ts\"` with `path:\"packages/next/src\"`, or read it with matchString."
        ]),
        "{data}"
    );
    let tree = &data["next"]["viewTree"]["query"]["queries"][0];
    assert_eq!(tree["path"], "packages/next/src", "{data}");
    let read = &data["next"]["read"]["query"]["queries"][0];
    assert_eq!(read["path"], "packages/next/src/config-shared.ts", "{data}");
    assert_eq!(read["matchString"], "ppr", "{data}");
    // A bare file name has the repository root as its parent.
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["x"],"path":"Cargo.toml"})).await;
    assert_eq!(
        out.data["next"]["viewTree"]["query"]["queries"][0]["path"], "",
        "{}",
        out.data
    );
    // A dotted directory is not a file.
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["x"],"path":"docs/v1.2"})).await;
    assert!(out.data["next"].get("read").is_none(), "{}", out.data);
    let out = run_empty(json!({"owner":"a","repo":"b","keywords":["x"],"path":".github"})).await;
    assert!(out.data["next"].get("read").is_none(), "{}", out.data);
}

/// A path-scoped empty states why it proves nothing in the default
/// hint, not only under `extras:["diagnostics"]`.
#[tokio::test]
async fn a_path_scoped_empty_says_why_it_proves_nothing() {
    let out = run_empty(json!({
        "owner":"a","repo":"b","keywords":["zzqq"],"path":"packages/next/src"
    }))
    .await;
    // It names only tools every surface runs; the CLI also gets the
    // executable `cloneRepo` lead.
    assert_eq!(
        out.data["hints"],
        json!([
            "No indexed match under `packages/next/src`: unproven absence (the index can lag); ghStructure the path, ghGetFileContent its files."
        ]),
        "{}",
        out.data
    );
    // A requested ref is still named: the index covers only the default branch.
    let out = run_empty(json!({
        "owner":"a","repo":"b","keywords":["zzqq"],"path":"src","ref":"v1"
    }))
    .await;
    assert_eq!(
        out.data["hints"],
        json!([
            "Code search indexes only the default branch; `v1` was not searched. No indexed match under `src`: unproven absence (the index can lag); ghStructure the path, ghGetFileContent its files."
        ]),
        "{}",
        out.data
    );
}

/// A page past the last one is out of range, not an empty search: the index
/// holds matches (`totalItems`), so the page says so and names no absence
/// hint, no broader search and no rename lookup.
#[tokio::test]
async fn a_page_past_the_end_is_out_of_range_not_an_empty_search() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"total_count":74,"incomplete_results":false,"items":[]})),
        )
        .mount(&server)
        .await;
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery = serde_json::from_value(json!({
        "owner":"a","repo":"b","keywords":["needle"],"pageSize":5,"page":99
    }))
    .expect("query");
    let context = default_context();
    let output = execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("page past the end");
    let page = &output.data["pagination"];
    assert_eq!(page["outOfRange"], true, "{}", output.data);
    assert_eq!(page["totalPages"], 15, "{}", output.data);
    assert_eq!(page["totalItems"], 74, "{}", output.data);
    for lead in ["hints", "next"] {
        assert!(output.data.get(lead).is_none(), "{lead}: {}", output.data);
    }
}

/// A single complete page whose file lists fewer hit lines than it has
/// is partial because of those unlisted lines, and the row says so; its
/// `next.readHits` reaches them. A page with another page behind it states
/// its remainder through `pagination` instead.
#[tokio::test]
async fn a_complete_page_with_unlisted_hit_lines_names_why_it_is_partial() {
    let server = MockServer::builder().start().await;
    let item = |name: &str| {
        json!({"name":name,"path":format!("src/{name}"),"sha":"1","html_url":"https://x",
            "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"}})
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":2,"incomplete_results":false,"items":[item("busy.rs"), item("calm.rs")]
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/HEAD"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
        .mount(&server)
        .await;
    for (name, body) in [
        ("busy.rs", "wrap_app();\n".repeat(8)),
        ("calm.rs", "fn wrap_app() {}\n".to_owned()),
    ] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/a/b/contents/src%2F{name}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "type":"file","encoding":"base64","content":STANDARD.encode(body)
            })))
            .mount(&server)
            .await;
    }
    let provider = one_shot_provider(&server);
    let search = |keywords: serde_json::Value| {
        serde_json::from_value::<GhSearchCodeQuery>(
            json!({"owner":"a","repo":"b","keywords":keywords}),
        )
        .expect("query")
    };
    let context = default_context();
    let out = execute(
        &provider,
        &search(json!(["wrap_app"])),
        &context,
        &Passthrough,
    )
    .await
    .expect("search");
    assert_eq!(out.data["isPartial"], true, "{}", out.data);
    assert_eq!(
        out.data["partialReasons"],
        json!(["hitLinesNotListed"]),
        "{}",
        out.data
    );
    assert!(out.data["next"]["readHits"].is_object(), "{}", out.data);
}

/// `pageSize` counts files: a page of two files states the search's file
/// total in its pagination, a file with more keyword lines than the five it
/// lists states its `matchCount`, and `next.readHits` reads the rest of
/// exactly that file; a file whose hits all show states no count.
#[tokio::test]
async fn a_page_counts_files_and_a_file_with_more_hits_says_how_many_and_leads_to_them() {
    let server = MockServer::builder().start().await;
    let item = |name: &str| {
        json!({"name":name,"path":format!("src/{name}"),"sha":"1","html_url":"https://x",
            "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"}})
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":40,"incomplete_results":false,"items":[item("busy.rs"), item("calm.rs")]
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/HEAD"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
        .mount(&server)
        .await;
    for (name, body) in [
        ("busy.rs", "wrap_app();\n".repeat(8)),
        ("calm.rs", "fn wrap_app() {}\n".to_owned()),
    ] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/a/b/contents/src%2F{name}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "type":"file","encoding":"base64","content":STANDARD.encode(body)
            })))
            .mount(&server)
            .await;
    }
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery = serde_json::from_value(
        json!({"owner":"a","repo":"b","keywords":["wrap_app"],"pageSize":2}),
    )
    .expect("query");
    let context = default_context();
    let out = execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("search");
    let (busy, calm) = (&out.data["files"][0], &out.data["files"][1]);
    assert_eq!(
        busy["lines"].as_array().map(Vec::len),
        Some(5),
        "{}",
        out.data
    );
    assert_eq!(busy["matchCount"], 8, "{}", out.data);
    assert!(calm.get("matchCount").is_none(), "{}", out.data);
    // The page's total counts files (GitHub's `total_count`), not lines.
    assert_eq!(out.data["pagination"]["totalItems"], 40, "{}", out.data);
    assert_eq!(out.data["pagination"]["pageSize"], 2, "{}", out.data);
    let reads = &out.data["next"]["readHits"]["query"]["queries"];
    assert_eq!(reads.as_array().map(Vec::len), Some(1), "{}", out.data);
    assert_eq!(reads[0]["path"], "src/busy.rs", "{}", out.data);
    assert_eq!(reads[0]["ref"], SHA, "{}", out.data);
    // `ranges` are 1-based line numbers, never byte offsets: from the line
    // after the last shown hit (5) to the file's last line (8), so the read
    // returns exactly the hits the listing did not (lines 6-8).
    assert_eq!(reads[0]["ranges"], json!(["6-8"]), "{}", out.data);
    assert_eq!(reads[0]["matchString"], "wrap_app", "{}", out.data);
}

/// A path-mode search whose keywords read as code leads to the same search
/// over file contents; that targeted lead is not pushed out of the two lead
/// slots by the generic clone and root listing of an empty repo search.
#[tokio::test]
async fn a_path_mode_search_of_code_leads_to_the_content_search_alone() {
    let out =
        run_empty(json!({"owner":"a","repo":"b","keywords":["res.send("],"matchIn":"path"})).await;
    let next = &out.data["next"];
    assert_eq!(next["findCode"]["tool"], "ghSearchCode", "{}", out.data);
    assert_eq!(
        next["findCode"]["query"]["queries"][0]["matchIn"], "file",
        "{}",
        out.data
    );
    assert!(next.get("cloneRepo").is_none(), "{}", out.data);
    assert!(next.get("viewTree").is_none(), "{}", out.data);
}

/// A search of `pages` total results at 20 a page: GitHub answers every
/// page with the same `total_count`.
async fn mount_counted_search(server: &MockServer, total: usize) {
    let item = |name: &str| {
        json!({"name":name,"path":format!("src/{name}"),"sha":"1","html_url":"https://x",
            "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"}})
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":total,"incomplete_results":false,"items":[item("busy.rs"), item("calm.rs")]
        })))
        .mount(server)
        .await;
}

/// A page past GitHub's 1,000-result window repairs to the search's last
/// real page, not to the window's last page (an empty page past the end).
#[tokio::test]
async fn a_page_past_the_window_repairs_to_the_last_real_page() {
    let server = MockServer::builder().start().await;
    mount_counted_search(&server, 150).await;
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery = serde_json::from_value(json!({
        "owner":"a","repo":"b","keywords":["needle"],"pageSize":20,"page":60,"fields":["path"]
    }))
    .expect("query");
    let context = default_context();
    let Err(failure) = super::run(&provider, &query, Ok(&context), &Passthrough).await else {
        panic!("a page past the window is a failure");
    };
    let next = failure.next.expect("repair");
    assert_eq!(next["repair"]["query"]["queries"][0]["page"], 8, "{next}");
}

/// `fields:["path","matchCount"]` states each file's hit count without
/// listing its lines, and no warning says the count is missing.
#[tokio::test]
async fn a_match_count_pick_counts_every_file_without_lines() {
    let server = MockServer::builder().start().await;
    mount_counted_search(&server, 2).await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/HEAD"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
        .mount(&server)
        .await;
    for (name, body) in [
        ("busy.rs", "wrap_app();\n".repeat(8)),
        ("calm.rs", "fn wrap_app() {}\n".to_owned()),
    ] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/a/b/contents/src%2F{name}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "type":"file","encoding":"base64","content":STANDARD.encode(body)
            })))
            .mount(&server)
            .await;
    }
    let provider = one_shot_provider(&server);
    let query: GhSearchCodeQuery = serde_json::from_value(json!({
        "owner":"a","repo":"b","keywords":["wrap_app"],"fields":["path","matchCount"]
    }))
    .expect("query");
    let context = default_context();
    let out = execute(&provider, &query, &context, &Passthrough)
        .await
        .expect("search");
    let files = &out.data["files"];
    assert_eq!(files[0]["path"], "src/busy.rs", "{}", out.data);
    assert_eq!(files[0]["matchCount"], 8, "{}", out.data);
    assert_eq!(files[1]["matchCount"], 1, "{}", out.data);
    assert!(files[0].get("lines").is_none(), "{}", out.data);
    assert!(out.data.get("warnings").is_none(), "{}", out.data);
}

/// A search page of `names` (paths in `a/b`), GitHub reporting `total` matches.
async fn mount_search_page(server: &MockServer, page: usize, total: usize, names: &[&str]) {
    let items = names
        .iter()
        .map(|name| {
            json!({"name":name,"path":name,"sha":"1","html_url":"https://x",
             "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"}})
        })
        .collect::<Vec<_>>();
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .and(wiremock::matchers::query_param("page", page.to_string()))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count":total,"incomplete_results":false,"items":items
        })))
        .mount(server)
        .await;
}

async fn search_page_of(
    provider: &octocode_github::GitHubProvider<octocode_github::NoCache>,
    page: usize,
) -> crate::tools::result::ToolData {
    let query: GhSearchCodeQuery = serde_json::from_value(json!({
        "owner":"a","repo":"b","keywords":["needle"],"matchIn":"path","pageSize":2,"page":page
    }))
    .expect("query");
    execute(provider, &query, &default_context(), &Passthrough)
        .await
        .expect("search")
}

fn paths_of(out: &crate::tools::result::ToolData) -> Vec<String> {
    out.data["files"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| row["path"].as_str().unwrap_or_default().to_owned())
        .collect()
}

fn warnings_of(out: &crate::tools::result::ToolData) -> &serde_json::Value {
    &out.data["warnings"]
}

/// A paged search page states the repeats it found: a later page drops a
/// file an earlier cached page listed, and counts the earlier pages it could
/// check (an uncached one is named, not assumed, and its repeats stay
/// listed). A clean first page carries no note: that totals are estimates is
/// static and lives in the tool description.
#[tokio::test]
async fn paged_pages_state_estimates_and_the_repeats_they_dropped() {
    let checked =
        "Repeat check read 1 of 1 earlier page; pages no longer cached were not compared.";
    let unchecked =
        "Repeat check read 0 of 1 earlier page; pages no longer cached were not compared.";
    let dropped = "Dropped 1 file GitHub listed again (already on an earlier page or this one).";
    for (cached, page, paths, warnings) in [
        (true, 1, vec!["a.rs", "b.rs"], serde_json::Value::Null),
        (true, 2, vec!["c.rs"], json!([dropped, checked])),
        (false, 2, vec!["b.rs", "c.rs"], json!([unchecked])),
    ] {
        let server = MockServer::builder().start().await;
        mount_search_page(&server, 1, 4, &["a.rs", "b.rs"]).await;
        mount_search_page(&server, 2, 4, &["b.rs", "c.rs"]).await;
        let mut provider = one_shot_provider(&server);
        if cached {
            provider.transport.cache = std::sync::Arc::new(MemoryCache::default());
        }
        let mut out = search_page_of(&provider, 1).await;
        if page == 2 {
            out = search_page_of(&provider, 2).await;
        }
        assert_eq!(out.data["pagination"]["totalItems"], 4, "{}", out.data);
        assert_eq!(paths_of(&out), paths, "cached {cached}: {}", out.data);
        assert_eq!(
            warnings_of(&out),
            &warnings,
            "cached {cached}: {}",
            out.data
        );
    }
}

/// A page made only of repeats is not an empty search: it keeps its
/// pagination and `next.nextPage`, and claims no absence.
#[tokio::test]
async fn a_page_of_only_repeats_is_not_an_empty_search() {
    let server = MockServer::builder().start().await;
    mount_search_page(&server, 1, 6, &["a.rs", "b.rs"]).await;
    mount_search_page(&server, 2, 6, &["a.rs", "b.rs"]).await;
    let mut provider = one_shot_provider(&server);
    provider.transport.cache = std::sync::Arc::new(MemoryCache::default());
    search_page_of(&provider, 1).await;
    let second = search_page_of(&provider, 2).await;
    assert!(paths_of(&second).is_empty(), "{}", second.data);
    assert_ne!(second.status, Some("empty"), "{}", second.data);
    assert_eq!(
        second.data["pagination"]["hasMore"], true,
        "{}",
        second.data
    );
    assert!(
        second.data["next"]["nextPage"].is_object(),
        "{}",
        second.data
    );
    assert_eq!(
        warnings_of(&second),
        &json!([
            "Dropped 2 files GitHub listed again (already on an earlier page or this one).",
            "Repeat check read 1 of 1 earlier page; pages no longer cached were not compared."
        ]),
        "{}",
        second.data
    );
    let requests = server.received_requests().await.expect("requests");
    assert!(
        requests
            .iter()
            .all(|request| request.url.path() == "/api/v3/search/code"),
        "{:?}",
        requests.iter().map(|r| r.url.path()).collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn empty_index_pages_keep_the_collection_when_partial_normalization_answers() {
    for incomplete in [false, true] {
        for fields in [json!([]), json!(["path"])] {
            let server = MockServer::builder().start().await;
            Mock::given(method("GET"))
                .and(path("/api/v3/search/code"))
                .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                    "total_count": 0, "incomplete_results": incomplete, "items": []
                })))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/api/v3/repos/a/b/commits/HEAD"))
                .respond_with(ResponseTemplate::new(200).set_body_string(SHA))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/api/v3/repos/a/b"))
                .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                    "full_name": "a/b", "default_branch": "main", "archived": false
                })))
                .mount(&server)
                .await;
            let mut row = json!({"owner": "a", "repo": "b", "keywords": ["marker"]});
            if fields != json!([]) {
                row["fields"] = fields;
            }
            let query: GhSearchCodeQuery = serde_json::from_value(row.clone()).expect("query");
            let provider = one_shot_provider(&server);
            let context = default_context();
            let out = execute(&provider, &query, &context, &Passthrough)
                .await
                .expect("provider search");
            if incomplete {
                assert_eq!(out.data["files"], json!([]), "{}", out.data);
                assert_eq!(out.data["isPartial"], true, "{}", out.data);
                assert!(
                    out.data["partialReasons"]
                        .as_array()
                        .expect("reasons")
                        .contains(&json!("providerIncompleteResults")),
                    "{}",
                    out.data
                );
                let retry = &out.data["next"]["retry"];
                assert_eq!(retry["tool"], "ghSearchCode", "{retry}");
                let prepared = crate::contracts::validate("ghSearchCode", retry["query"].clone())
                    .expect("executable retry");
                let continued = &prepared["queries"][0];
                for field in ["owner", "repo", "keywords", "fields"] {
                    assert_eq!(
                        continued[field], row[field],
                        "retry changed {field}: {retry}"
                    );
                }
                assert_eq!(continued["page"], 1, "{retry}");
            } else {
                assert_eq!(out.status, Some("empty"), "{}", out.data);
                assert!(out.data["next"].get("retry").is_none(), "{}", out.data);
                assert_ne!(out.data["isPartial"], true, "{}", out.data);
            }
            let shaped = crate::response::rows::result_row(
                crate::tools::id::ToolId::GhSearchCode,
                0,
                &row,
                out.data,
                out.status,
            );
            assert_eq!(shaped["status"] == "empty", !incomplete, "{shaped}");
            crate::contracts::validate_output("ghSearchCode", &json!({"results": [shaped]}))
                .expect("the actual normalized row satisfies the canonical output contract");
        }
    }
}

//! Provider-backed tests of the GitHub search tools against one mock server:
//! ghSearchCode ([`code`]), ghSearchRepo ([`repositories`]) and ghStructure
//! ([`tree`]), with the fixtures they share.
use crate::security::scan::Passthrough;
use crate::tools::gh_shared::test_support::{
    MemoryCache, default_context, mount_json, one_shot_provider,
};
use crate::tools::result::ToolData;
use crate::tools::{gh_search_code, gh_search_repo, gh_structure};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use octocode_github::{GitHubProvider, NoCache};
use octocode_github::{ProviderError, ProviderErrorKind};
use serde_json::{Value, json};
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path, query_param, query_param_contains},
};

/// One attempt per request: a mock answer is final.
fn provider(server: &MockServer) -> GitHubProvider<NoCache> {
    one_shot_provider(server)
}

/// Fixtures name their tool with a test-only `operation` key:
/// code → ghSearchCode, repositories → ghSearchRepo, tree → ghStructure.
/// A materialized listing's files live under a home removed when the call
/// returns; [`run_at`] keeps them for the caller.
async fn run(server: &MockServer, query: Value) -> Result<ToolData, ProviderError> {
    let home = crate::tools::test_support::Fixture::new();
    run_at(server, query, &home.0).await
}

/// [`run`] with the Octocode `home` a materialized listing writes under.
async fn run_at(
    server: &MockServer,
    mut query: Value,
    home: &std::path::Path,
) -> Result<ToolData, ProviderError> {
    let operation = query
        .as_object_mut()
        .and_then(|object| object.remove("operation"))
        .expect("fixture operation");
    let provider = provider(server);
    let context = default_context();
    match operation.as_str() {
        Some("code") => {
            let query = serde_json::from_value(query).expect("code query");
            gh_search_code::execute(&provider, &query, &context, &Passthrough).await
        }
        Some("repositories") => {
            let query = serde_json::from_value(query).expect("repositories query");
            gh_search_repo::execute(&provider, &query, &context).await
        }
        Some("tree") => {
            let query = serde_json::from_value(query).expect("tree query");
            gh_structure::execute(&provider, &query, &context, home).await
        }
        other => panic!("unknown fixture operation {other:?}"),
    }
}

/// An empty code search result, `incomplete` or not.
async fn empty_code_search(server: &MockServer, incomplete: bool) {
    mount_json(
        server,
        "/api/v3/search/code",
        200,
        json!({"total_count":0,"incomplete_results":incomplete,"items":[]}),
    )
    .await;
}

/// Repository `a/b` now lives at `c/d`.
async fn renamed_to_c_d(server: &MockServer) {
    mount_json(
        server,
        "/api/v3/repos/a/b",
        200,
        json!({"default_branch":"main","full_name":"c/d"}),
    )
    .await;
}

/// A code search with one `wrap_app` hit in each `src/<name>.rs`.
async fn wrap_app_hits(server: &MockServer, names: &[&str]) {
    let items = names
        .iter()
        .map(|name| {
            json!({"name":format!("{name}.rs"),"path":format!("src/{name}.rs"),"sha":"1",
                    "html_url":"https://x",
                    "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
                    "text_matches":[{"fragment":"fn wrap_app() {}",
                        "matches":[{"text":"wrap_app","indices":[3,11]}]}]})
        })
        .collect::<Vec<_>>();
    mount_json(
        server,
        "/api/v3/search/code",
        200,
        json!({
            "total_count":items.len(),"incomplete_results":false,"items":items
        }),
    )
    .await;
}

/// A code search whose one hit is `fn wrap_app() {}` in `app.rs`.
async fn app_rs_hit(server: &MockServer) {
    mount_json(server, "/api/v3/search/code", 200, json!({
        "total_count":1,"incomplete_results":false,"items":[
            {"name":"app.rs","path":"app.rs","sha":"1","html_url":"https://x",
             "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
             "text_matches":[{"fragment":"fn wrap_app() {}","matches":[{"text":"wrap_app","indices":[3,11]}]}]}
        ]
    }))
    .await;
}

/// Org `o`'s repositories, most recently pushed first.
async fn recently_pushed_org_repos(server: &MockServer, repos: Value) {
    Mock::given(method("GET"))
        .and(path("/api/v3/orgs/o/repos"))
        .and(query_param("sort", "pushed"))
        .and(query_param("direction", "desc"))
        .respond_with(ResponseTemplate::new(200).set_body_json(repos))
        .mount(server)
        .await;
}

const TREE_SHA: &str = "0123456789abcdef0123456789abcdef01234567";

/// Resolve `reference` to [`TREE_SHA`], as GitHub's commits endpoint does.
async fn mount_ref(server: &MockServer, reference: &str) {
    Mock::given(method("GET"))
        .and(path(format!("/api/v3/repos/a/b/commits/{reference}")))
        .respond_with(ResponseTemplate::new(200).set_body_string(TREE_SHA))
        .mount(server)
        .await;
}

fn repo_item(name: &str, archived: bool) -> Value {
    json!({
        "full_name": format!("o/{name}"), "name": name,
        "html_url": "https://x", "default_branch": "main",
        "archived": archived
    })
}

/// Search items for `a/b` with one GitHub fragment each (GitHub caps
/// fragments, so routing.py's second call is not in the index text).
async fn mount_code_search(server: &MockServer) {
    mount_json(server, "/api/v3/search/code", 200, json!({
                "total_count":2,"incomplete_results":false,"items":[
                    {"name":"handler.py","path":"src/handler.py","sha":"1","html_url":"https://x",
                     "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
                     "text_matches":[{"fragment":"def wrap_app(app):","matches":[{"text":"wrap_app","indices":[4,12]}]}]},
                    {"name":"routing.py","path":"src/routing.py","sha":"2","html_url":"https://x",
                     "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
                     "text_matches":[{"fragment":"    await wrap_app(app)(scope)","matches":[{"text":"wrap_app","indices":[10,18]}]}]}
                ]
            })).await;
}

async fn mount_content(server: &MockServer, file: &str, body: &str) {
    Mock::given(method("GET"))
            // The contents route encodes the path as one segment.
            .and(path(format!(
                "/api/v3/repos/a/b/contents/{}",
                file.replace('/', "%2F")
            )))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "type":"file","encoding":"base64","content":STANDARD.encode(body)
            })))
            .mount(server)
            .await;
}

const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

async fn mount_listing(server: &MockServer, dir: &str, entries: Value) {
    let route = if dir.is_empty() {
        "/api/v3/repos/a/b/contents".to_owned()
    } else {
        format!("/api/v3/repos/a/b/contents/{}", dir.replace('/', "%2F"))
    };
    mount_json(server, route, 200, entries).await;
}

fn code_item(name: &str) -> Value {
    json!({"name":name,"path":name,"sha":"1","html_url":"https://x",
        "repository":{"full_name":"a/b","html_url":"https://x","url":"https://x"},
        "text_matches":[{"fragment":"needle","matches":[{"text":"needle","indices":[0,6]}]}]})
}

mod code;
mod pages;
mod repositories;
mod tree;

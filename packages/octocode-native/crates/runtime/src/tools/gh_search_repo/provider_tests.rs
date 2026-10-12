//! Provider-backed ghSearchRepo tests: typed filters, archived disclosure,
//! and row facts.
use super::{GhSearchRepoQuery, execute};
use crate::providers::github::RetryPolicy;
use crate::tools::gh_shared::test_support::{mock_provider, mount_json};
use crate::tools::result::ToolData;
use serde_json::{Value, json};
use std::time::Duration;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

async fn run(server: &MockServer, query: Value) -> ToolData {
    let provider = mock_provider(
        server,
        RetryPolicy {
            max_attempts: 1,
            ..Default::default()
        },
    );
    let query: GhSearchRepoQuery = serde_json::from_value(query).expect("query");
    let context =
        crate::tools::gh_shared::test_support::fixture_context(Duration::from_secs(5), 1 << 20);
    execute(&provider, &query, &context).await.expect("search")
}

fn repo_item(name: &str, archived: bool) -> Value {
    json!({
        "full_name": format!("o/{name}"), "name": name,
        "html_url": "https://x", "default_branch": "main",
        "archived": archived
    })
}

fn page(items: Vec<Value>) -> Value {
    json!({"total_count": items.len(), "incomplete_results": false, "items": items})
}

/// Typed date filters reach GitHub as `pushed:`/`created:` qualifiers; a
/// relative window resolves to an absolute lower bound.
#[tokio::test]
async fn typed_date_filters_reach_the_search_query() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .and(query_param(
            "q",
            "x stars:>100 pushed:>2025-01-01 created:2020-01-01..2021-01-01 archived:false",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(page(vec![repo_item("r", false)])))
        .mount(&server)
        .await;
    let out = run(
        &server,
        json!({"keywords":["x"],"stars":"> 100","pushed":">2025-01-01",
               "created":"2020-01-01 .. 2021-01-01"}),
    )
    .await;
    assert_eq!(out.data["repositories"][0]["repo"], "r", "{}", out.data);

    let relative = MockServer::builder().start().await;
    mount_json(
        &relative,
        "/api/v3/search/repositories",
        200,
        page(vec![repo_item("r", false)]),
    )
    .await;
    run(&relative, json!({"pushed":"30d"})).await;
    let requests = relative.received_requests().await.expect("requests");
    let q = requests[0]
        .url
        .query_pairs()
        .find(|(key, _)| key == "q")
        .map(|(_, value)| value.into_owned())
        .expect("q");
    let pushed = q
        .split(' ')
        .find(|term| term.starts_with("pushed:"))
        .expect("pushed");
    assert!(pushed.starts_with("pushed:>="), "{q}");
    assert_eq!(pushed.len(), "pushed:>=2026-01-01".len(), "{q}");
}

/// The default search excludes archived repositories (`archived:false`) and,
/// knowing no skipped count, offers no `includeArchived` lead (the tool
/// description states the default once); an explicit `archived:true` search
/// drops the qualifier and flags archived rows.
#[tokio::test]
async fn default_archived_search_exclusion_offers_no_lead() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .and(query_param("q", "x"))
        .respond_with(ResponseTemplate::new(200).set_body_json(page(vec![repo_item("old", true)])))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .and(query_param("q", "x archived:false"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count": 40, "incomplete_results": false,
            "items": [repo_item("live", false)]
        })))
        .mount(&server)
        .await;

    let first = run(&server, json!({"keywords":["x"]})).await;
    assert!(
        first.data["repositories"][0].get("archived").is_none(),
        "{}",
        first.data
    );
    assert!(
        first.data["next"].get("includeArchived").is_none(),
        "only an owner listing that skipped archived repositories leads to them: {}",
        first.data
    );
    // Repo-discovery words are not code keywords: no code-search lead.
    assert!(
        first.data["next"].get("findCode").is_none(),
        "{}",
        first.data
    );

    // Later pages state nothing more; an explicit filter needs no lead.
    let second = run(&server, json!({"keywords":["x"],"page":2})).await;
    assert!(
        second.data["next"].get("includeArchived").is_none(),
        "{}",
        second.data
    );
    assert!(
        second.data["next"].get("findCode").is_none(),
        "{}",
        second.data
    );
    assert_eq!(
        second.data["next"]["viewRepo"]["tool"], "ghStructure",
        "{}",
        second.data
    );
    let excluded = run(&server, json!({"keywords":["x"],"includeArchived":false})).await;
    assert!(
        excluded.data["next"].get("includeArchived").is_none(),
        "{}",
        excluded.data
    );

    let archived = run(&server, json!({"keywords":["x"],"includeArchived":true})).await;
    assert_eq!(
        archived.data["repositories"][0]["archived"], true,
        "{}",
        archived.data
    );
    assert!(
        archived.data["next"].get("includeArchived").is_none(),
        "{}",
        archived.data
    );
}

/// An owner listing knows how many archived repositories it skipped: it
/// says so and leads to them.
#[tokio::test]
async fn owner_listing_counts_skipped_archived_repositories() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/orgs/o/repos"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            repo_item("live", false),
            repo_item("old", true),
            repo_item("older", true)
        ])))
        .mount(&server)
        .await;
    let out = run(&server, json!({"owner":"o"})).await;
    assert_eq!(out.data["repositories"].as_array().map(Vec::len), Some(1));
    let warnings = out.data["warnings"].to_string();
    assert!(warnings.contains("2 archived repositories"), "{}", out.data);
    assert_eq!(
        out.data["next"]["includeArchived"]["query"]["queries"][0],
        json!({"owner":"o","includeArchived":true}),
        "{}",
        out.data
    );

    let clean = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/orgs/o/repos"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([repo_item("live", false)])))
        .mount(&clean)
        .await;
    let out = run(&clean, json!({"owner":"o"})).await;
    assert!(out.data.get("warnings").is_none(), "{}", out.data);
    assert!(
        out.data["next"].get("includeArchived").is_none(),
        "{}",
        out.data
    );
}

/// Rows carry the facts that decide a repository choice: the last push by
/// default, the creation date as a `details` extra; forks and the
/// metadata-update date are `stats` extras.
#[tokio::test]
async fn rows_carry_creation_date_as_a_detail_and_counts_as_stats() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/repositories",
        200,
        page(vec![json!({
            "full_name":"o/r","name":"r","html_url":"h","default_branch":"main",
            "stargazers_count":5,"forks_count":0,"open_issues_count":3,
            "pushed_at":"2026-01-02T00:00:00Z","created_at":"2019-05-06T00:00:00Z",
            "updated_at":"2026-01-03T00:00:00Z","homepage":""
        })]),
    )
    .await;
    let out = run(&server, json!({"keywords":["x"]})).await;
    let row = &out.data["repositories"][0];
    assert_eq!(row["createdAt"], "2019-05-06", "{row}");
    assert_eq!(row["pushedAt"], "2026-01-02", "{row}");
    for absent in ["homepage", "openIssuesCount"] {
        assert!(row.get(absent).is_none(), "{absent}: {row}");
    }
    let kind_of = |field: &str| {
        let path = format!("results[].data.repositories[].{field}");
        crate::tools::id::ToolId::GhSearchRepo
            .extra_paths()
            .iter()
            .find(|(_, paths)| paths.contains(&path.as_str()))
            .map(|(kind, _)| *kind)
    };
    assert_eq!(kind_of("createdAt"), Some("details"));
    assert_eq!(kind_of("pushedAt"), None, "the last push is default output");
    for field in ["forks", "updatedAt"] {
        assert_eq!(kind_of(field), Some("stats"), "{field}");
    }
}

/// An owner listing marks forks (`fork:true`) so they do not read as the
/// owner's own source; other rows carry no `fork` key.
#[tokio::test]
async fn owner_listing_marks_forks_only() {
    let server = MockServer::builder().start().await;
    let mut fork = repo_item("forked", false);
    fork["fork"] = json!(true);
    Mock::given(method("GET"))
        .and(path("/api/v3/orgs/o/repos"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!([repo_item("own", false), fork])),
        )
        .mount(&server)
        .await;
    let out = run(&server, json!({"owner":"o"})).await;
    let rows = out.data["repositories"].as_array().expect("rows");
    assert_eq!(rows.len(), 2, "{}", out.data);
    assert!(rows[0].get("fork").is_none(), "{}", out.data);
    assert_eq!(rows[1]["fork"], true, "{}", out.data);
}

/// GitHub matched more repositories than search reaches (1,000): the
/// first page states the provider's full count, not only the reachable
/// `totalItems`, so an org count is never silently 1,000.
#[tokio::test]
async fn capped_search_states_the_full_match_count() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/repositories",
        200,
        json!({"total_count": 4156, "incomplete_results": false, "items": [repo_item("r", false)]}),
    )
    .await;
    let out = run(
        &server,
        json!({"owner":"o","sort":"stars:desc","pageSize":1}),
    )
    .await;
    assert_eq!(
        out.data["partialReasons"],
        json!(["providerResultCap"]),
        "{}",
        out.data
    );
    let warnings = out.data["warnings"].to_string();
    assert!(warnings.contains("4156"), "{}", out.data);
    // Later pages do not repeat it.
    let second = run(
        &server,
        json!({"owner":"o","sort":"stars:desc","pageSize":1,"page":2}),
    )
    .await;
    assert!(
        !second.data["warnings"].to_string().contains("4156"),
        "{}",
        second.data
    );
}

/// owner+repo reads that one repository from the repository endpoint: one
/// row with its language and default branch, no search request, no page.
#[tokio::test]
async fn owner_and_repo_return_that_repository_without_searching() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/sindresorhus/is",
        200,
        json!({
            "full_name": "sindresorhus/is", "name": "is", "html_url": "https://x",
            "url": "https://x", "default_branch": "main", "language": "TypeScript",
            "stargazers_count": 1700, "description": "Type check values",
            "pushed_at": "2026-09-01T00:00:00Z"
        }),
    )
    .await;
    let out = run(&server, json!({"owner":"sindresorhus","repo":"is"})).await;
    assert_eq!(
        out.data["repositories"],
        json!([{
            "owner": "sindresorhus", "repo": "is", "stars": 1700,
            "language": "TypeScript", "pushedAt": "2026-09-01",
            "description": "Type check values", "forks": 0,
            "defaultBranch": "main"
        }]),
        "{}",
        out.data
    );
    assert!(out.data.get("pagination").is_none(), "{}", out.data);
    assert!(out.data.get("next").is_none(), "{}", out.data);
    let requests = server.received_requests().await.expect("requests");
    assert_eq!(requests.len(), 1, "{requests:?}");
    assert_eq!(requests[0].url.path(), "/api/v3/repos/sindresorhus/is");
}

/// Anchors: a search row carries exactly the next hop's coordinates
/// (`owner`, `repo`, `defaultBranch`) beside its decision facts, and no
/// query echo.
#[tokio::test]
async fn a_search_row_carries_owner_repo_and_default_branch() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/repositories",
        200,
        page(vec![repo_item("r", false)]),
    )
    .await;
    let out = run(&server, json!({"keywords":["x"]})).await;
    let row = &out.data["repositories"][0];
    assert_eq!(
        row,
        &json!({"owner":"o","repo":"r","defaultBranch":"main","stars":0,"forks":0}),
        "{}",
        out.data
    );
    for echo in ["keywords", "page", "sort"] {
        assert!(out.data.get(echo).is_none(), "{echo}: {}", out.data);
    }
}

/// GitHub silently drops a `language:` it does not know and returns
/// unfiltered rows. A page where no row is that language says so when the
/// rows mix languages, or when they share one and the same search without
/// the qualifier counts the same; an alias GitHub honors (`js` → JavaScript
/// rows, a smaller total) does not trip it.
#[tokio::test]
async fn an_ignored_language_filter_is_named() {
    let item = |name: &str, language: &str| {
        let mut item = repo_item(name, false);
        item["language"] = json!(language);
        item
    };
    let ignored = MockServer::builder().start().await;
    mount_json(
        &ignored,
        "/api/v3/search/repositories",
        200,
        page(vec![item("a", "Python"), item("b", "Rust")]),
    )
    .await;
    let out = run(&ignored, json!({"keywords":["x"],"language":"zz-nolang"})).await;
    let warnings = out.data["warnings"].to_string();
    assert!(
        warnings.contains("language") && warnings.contains("zz-nolang"),
        "{}",
        out.data
    );

    // Ignored, but the unfiltered rows share one language (the live case):
    // the probe without the qualifier counts the same.
    let agreeing = MockServer::builder().start().await;
    mount_json(
        &agreeing,
        "/api/v3/search/repositories",
        200,
        page(vec![item("a", "TypeScript"), item("b", "TypeScript")]),
    )
    .await;
    let out = run(&agreeing, json!({"keywords":["x"],"language":"zz-nolang"})).await;
    assert!(
        out.data["warnings"].to_string().contains("zz-nolang"),
        "{}",
        out.data
    );

    let alias = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .and(wiremock::matchers::query_param_contains("q", "language:"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(page(vec![item("a", "JavaScript"), item("b", "JavaScript")])),
        )
        .with_priority(1)
        .mount(&alias)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                json!({"total_count": 99, "incomplete_results": false, "items": []}),
            ),
        )
        .mount(&alias)
        .await;
    let out = run(&alias, json!({"keywords":["x"],"language":"js"})).await;
    assert!(out.data.get("warnings").is_none(), "{}", out.data);
}

/// A failure's one repair is a lead, not prose: a page past the search
/// window leads to the last reachable page; an owner+repo that does not
/// resolve leads to a search for the repository's name.
#[tokio::test]
async fn search_failures_lead_to_their_repair() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/missing",
        404,
        json!({"message":"Not Found"}),
    )
    .await;
    let provider = mock_provider(
        &server,
        RetryPolicy {
            max_attempts: 1,
            ..Default::default()
        },
    );
    let context =
        crate::tools::gh_shared::test_support::fixture_context(Duration::from_secs(5), 1 << 20);
    let fail = |query: Value| {
        let query: GhSearchRepoQuery = serde_json::from_value(query).expect("query");
        let provider = &provider;
        let context = &context;
        async move {
            super::run(provider, &query, Ok(context))
                .await
                .expect_err("failure")
        }
    };
    let window = fail(json!({"keywords":["x"],"page":51,"pageSize":20})).await;
    assert!(window.hints.is_empty(), "{:?}", window.hints);
    let next = window.next.expect("repair");
    assert_eq!(next["repair"]["tool"], "ghSearchRepo", "{next}");
    let repair = &next["repair"]["query"]["queries"][0];
    assert_eq!(repair["page"], 50, "{next}");
    assert_eq!(repair["keywords"], json!(["x"]), "{next}");
    let missing = fail(json!({"owner":"o","repo":"missing"})).await;
    assert!(missing.hints.is_empty(), "{:?}", missing.hints);
    let next = missing.next.expect("find");
    assert_eq!(
        next["findRepository"]["query"]["queries"][0],
        json!({"keywords":["missing"]}),
        "{next}"
    );
}

/// A page past the last of a search that has results is out of range, not an
/// empty search: no "use fewer keywords" hint, and the shared response stage
/// leads back to page 1.
#[tokio::test]
async fn a_page_past_the_end_is_out_of_range_not_an_empty_search() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/repositories"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                json!({"total_count": 12, "incomplete_results": false, "items": []}),
            ),
        )
        .mount(&server)
        .await;
    let out = run(&server, json!({"keywords":["x"],"pageSize":5,"page":9})).await;
    assert_eq!(out.data["pagination"]["outOfRange"], true, "{}", out.data);
    assert_eq!(out.data["pagination"]["totalItems"], 12, "{}", out.data);
    assert!(out.data.get("hints").is_none(), "{}", out.data);
    assert!(out.data.get("isPartial").is_none(), "{}", out.data);
}

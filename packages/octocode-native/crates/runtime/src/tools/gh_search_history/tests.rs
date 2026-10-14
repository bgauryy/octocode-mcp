use super::filters::Filters;
use super::leads::{issue_links_read, issue_read_query, pr_read_query};
use super::query::{build_query_with_warnings, resolve_commit_window};
use super::rows::{
    is_completed, is_merged, item_number, map_commit, map_commit_list, map_issue, map_pr,
    read_target,
};
use super::shape::mark_empty;
use super::*;
use crate::tools::gh_shared::pick_fields;
use crate::tools::gh_shared::test_support::{default_context, mount_json, one_shot_provider};
use octocode_github::{GitHubTransport, ProviderError};
use serde_json::{Value, json};

use crate::security::scan::Passthrough;

fn search(q: &GhSearchHistoryQuery) -> Result<HistorySearch, ProviderError> {
    HistorySearch::new(q.clone())
}
fn build_query(q: &GhSearchHistoryQuery) -> Result<String, ProviderError> {
    build_query_with_warnings(&search(q)?).map(|(terms, _)| terms)
}
fn should_use_search_for_prs(q: &GhSearchHistoryQuery) -> bool {
    query::should_use_search_for_prs(&search(q).expect("qualifiers"))
}
fn needs_issue_search_qualifiers(q: &GhSearchHistoryQuery) -> bool {
    query::needs_issue_search_qualifiers(&search(q).expect("qualifiers"))
}

async fn execute(
    transport: &GitHubTransport,
    query: &GhSearchHistoryQuery,
    context: &RequestContext,
    security: &impl ContentScan,
) -> Result<Value, ProviderError> {
    super::execute(transport, query.clone(), context, security)
        .await
        .map_err(|failure| *failure.error)
}

#[test]
fn canonical_issue_qualifier_order() {
    let q: GhSearchHistoryQuery=serde_json::from_str(r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["x"],"state":"closed","qualifiers":"in:title label:bug"}"#).expect("GitHub history search test data should be valid");
    assert_eq!(
        build_query(&q).expect("GitHub history search test data should be valid"),
        "x in:title is:issue repo:a/b is:closed label:\"bug\""
    );
    let archived: GhSearchHistoryQuery = serde_json::from_str(
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["x"],"qualifiers":"archived:true"}"#,
    )
    .expect("valid");
    assert!(
        build_query(&archived)
            .expect("valid")
            .ends_with("archived:true")
    );
}
/// The `linked:pr` (issues with a linked PR) and `linked:issue` reach the
/// search query on issues and pull requests.
#[test]
fn linked_qualifier_reaches_the_search_query() {
    for (operation, linked) in [("issue", "pr"), ("pullRequest", "issue")] {
        let row = json!({"operation":operation,"mainGoal":"g","reasoning":"r","owner":"o","repo":"r",
            "qualifiers":format!("linked:{linked}")});
        let query = build_query(&serde_json::from_value(row).expect("typed")).expect("query");
        assert!(
            query.contains(&format!("linked:{linked}")),
            "{operation}: {query}"
        );
    }
}

#[test]
fn report_probes_cannot_rewrite_the_history_scope() {
    // A leading-quote keyword, an owner carrying operators,
    // and a label with an interior quote.
    let q = parse(
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"octocat","repo":"Hello-World","keywords":["\"hello\" NOT"]}"#,
    );
    assert_eq!(
        build_query(&q).expect("valid"),
        "\"hello NOT\" is:issue repo:octocat/Hello-World"
    );
    let q = parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","keywords":["repo:evil/x","-y"]}"#,
    );
    assert_eq!(
        build_query(&q).expect("valid"),
        "\"repo:evil/x\" \"-y\" is:pr user:a"
    );
    for raw in [
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"octocat OR is:public","repo":"b","keywords":["hello"]}"#,
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b:c","keywords":["hello"]}"#,
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","qualifiers":"author:\"x OR is:public\""}"#,
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","qualifiers":"label:x\" OR is:public\""}"#,
        r#"{"operation":"issue","mainGoal": "test", "reasoning":"test","owner":"a","repo":"b","qualifiers":"created:\"x OR is:public\""}"#,
        r#"{"operation":"commit","mainGoal": "test", "reasoning":"test","owner":"a","repo":"b","keywords":["x"],"qualifiers":"committer:\"a b\""}"#,
    ] {
        // Rejected by the published pattern or by native validation.
        if let Ok(query) = serde_json::from_str::<GhSearchHistoryQuery>(raw) {
            let error = build_query(&query).expect_err(raw);
            assert_eq!(error.kind, ProviderErrorKind::Validation, "{raw}");
        }
    }
    let q = parse(
        r#"{"operation":"issue","mainGoal": "test", "reasoning":"test","owner":"a","repo":"b","qualifiers":"label:\"good first issue\" comments:>5 author:dependabot[bot]"}"#,
    );
    let built = build_query(&q).expect("valid");
    assert!(built.contains("label:\"good first issue\""), "{built}");
    assert!(built.contains("comments:>5"), "{built}");
    assert!(built.contains("author:dependabot[bot]"), "{built}");
}

/// `archived` means the same with or without keywords: only search
/// filters on repository archive state, so it always routes there.
#[test]
fn archived_pull_request_filter_always_routes_to_search() {
    let parse = |extra: &str| -> GhSearchHistoryQuery {
        serde_json::from_str(&format!(
            r#"{{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","repo":"b"{extra}}}"#
        ))
        .expect("GitHub history search test data should be valid")
    };
    assert!(!should_use_search_for_prs(&parse("")));
    for extra in [
        r#","qualifiers":"archived:true""#,
        r#","qualifiers":"archived:false""#,
        r#","qualifiers":"archived:true","keywords":["README"]"#,
    ] {
        let query = parse(extra);
        assert!(should_use_search_for_prs(&query), "{extra}");
        let built = build_query(&query).expect("query");
        assert!(built.contains("archived:"), "{extra}: {built}");
    }
}

#[test]
fn quotes_multiword_history_keywords() {
    let q: GhSearchHistoryQuery = serde_json::from_str(
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["fix login"]}"#,
    )
    .expect("GitHub history search test data should be valid");
    assert!(
        build_query(&q)
            .expect("GitHub history search test data should be valid")
            .starts_with("\"fix login\"")
    );
    assert!(needs_issue_search_qualifiers(&q));
    let listed: GhSearchHistoryQuery = serde_json::from_str(
        r#"{"operation":"issue","mainGoal":"test","reasoning":"test","owner":"a","repo":"b"}"#,
    )
    .expect("GitHub history search test data should be valid");
    assert!(!needs_issue_search_qualifiers(&listed));
}
#[test]
fn commit_search_uses_email_and_committer_date() {
    let q: GhSearchHistoryQuery = serde_json::from_str(
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["fix"],"qualifiers":"author:dev@example.com committer:web-flow","since":"2026-01-01T00:00:00Z"}"#,
    )
    .expect("GitHub history search test data should be valid");
    let query = build_query(&q).expect("GitHub history search test data should be valid");
    assert!(query.contains("author-email:dev@example.com"), "{query}");
    assert!(query.contains("committer:web-flow"), "{query}");
    assert!(query.contains("committer-date:>=2026-01-01T00:00:00Z"));
}

/// Commit people filters ride `qualifiers` (one name per purpose);
/// issue/PR keys are refused on commits, and `committer:` on PR/issue.
#[test]
fn commit_qualifiers_take_author_and_committer_only() {
    // The contract types each operation's keys: other operations' keys
    // never reach a filter.
    for raw in [
        r#"{"operation":"commit","owner":"a","repo":"b","qualifiers":"label:bug"}"#,
        r#"{"operation":"issue","owner":"a","repo":"b","qualifiers":"committer:x"}"#,
        r#"{"operation":"commit","owner":"a","repo":"b","qualifiers":"reviewed-by:x"}"#,
    ] {
        assert!(
            serde_json::from_str::<GhSearchHistoryQuery>(raw).is_err(),
            "{raw}"
        );
    }
    // The native key table agrees (its errors name where a key applies).
    let commit: GhSearchHistoryQuery = serde_json::from_str(
        r#"{"operation":"commit","owner":"a","repo":"b","qualifiers":"committer:web-flow author:dev"}"#,
    )
    .expect("commit qualifiers");
    let built = build_query(&commit).expect("valid");
    assert!(
        built.contains("author:dev") && built.contains("committer:web-flow"),
        "{built}"
    );
    for field in ["author", "committer"] {
        let raw = format!(r#"{{"operation":"commit","owner":"a","repo":"b","{field}":"x"}}"#);
        assert!(
            serde_json::from_str::<GhSearchHistoryQuery>(&raw).is_err(),
            "typed {field} is gone"
        );
    }
}
#[test]
fn rejects_unscoped_commit() {
    // Commit history is repository-scoped by the wire contract.
    assert!(
        serde_json::from_str::<GhSearchHistoryQuery>(
            r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a"}"#
        )
        .is_err()
    );
}

#[test]
fn pull_request_rows_normalize_merged_state_from_list_and_search_shapes() {
    let listed = map_pr(json!({
        "number":1,
        "title":"listed",
        "state":"closed",
        "merged_at":"2026-09-20T10:00:00Z",
        "user":{"login":"dev"},
        "labels":[],
        "created_at":"2026-09-19T10:00:00Z",
        "comments":2
    }));
    assert_eq!(listed["state"], "merged");
    assert_eq!(listed["mergedAt"], "2026-09-20T10:00:00Z");
    assert_eq!(listed["author"], "dev");
    assert_eq!(listed["commentsCount"], 2);

    let searched = map_pr(json!({
        "number":2,
        "title":"searched",
        "state":"closed",
        "pull_request":{"merged_at":"2026-09-20T11:00:00Z"},
        "user":{"login":"dev"},
        "labels":[],
        "created_at":"2026-09-19T11:00:00Z",
        "comments":0
    }));
    assert_eq!(searched["state"], "merged");
    assert_eq!(searched["mergedAt"], "2026-09-20T11:00:00Z");

    let closed = map_pr(json!({
        "number":3,
        "title":"closed",
        "state":"closed",
        "merged_at":null,
        "user":{"login":"dev"},
        "labels":[],
        "created_at":"2026-09-19T12:00:00Z",
        "comments":0
    }));
    assert_eq!(closed["state"], "closed");
    assert!(closed.get("mergedAt").is_none());
}

/// The default PR read targets the merged fix, not the first
/// (unmerged) search row; the rows already name the others.
#[test]
fn read_pr_prefers_the_first_merged_row() {
    let rows = [
        json!({"number":13794,"state":"closed","pull_request":{"merged_at":null}}),
        json!({"number":13825,"state":"closed","pull_request":{"merged_at":"2026-09-25T00:29:36Z"}}),
        json!({"number":13787,"state":"open"}),
    ];
    let target = read_target(&rows, is_merged).expect("rows");
    assert_eq!(item_number(&rows[target]), Some(13825));
    // No merged row: the first row, unchanged.
    let open = [
        json!({"number":5,"state":"open"}),
        json!({"number":6,"state":"closed"}),
    ];
    assert_eq!(read_target(&open, is_merged), Some(0));
    assert_eq!(read_target(&[], is_merged), None);
    let read = pr_read_query("o", "r", 13825);
    assert_eq!(read["number"], 13825);
    assert_eq!(read["sections"], json!(["body", "files"]));
    assert!(read.get("pageSize").is_none(), "{read}");
}

/// The issue read prefers an issue closed as completed (its fix landed).
#[test]
fn read_issue_prefers_a_completed_issue() {
    let rows = [
        json!({"number":1,"state":"open"}),
        json!({"number":2,"state":"closed","state_reason":"not_planned"}),
        json!({"number":3,"state":"closed","state_reason":"completed"}),
    ];
    let target = read_target(&rows, is_completed).expect("rows");
    assert_eq!(item_number(&rows[target]), Some(3));
    let read = issue_read_query("o", "r", 3);
    assert_eq!(read["sections"], json!(["body", "comments"]), "{read}");
}

/// A bare issue number in the keywords links straight to that issue's
/// closing pull requests.
#[test]
fn bare_issue_number_keywords_offer_the_issue_links_read() {
    let q = parse(
        r##"{"operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","keywords":["#13786"]}"##,
    );
    let read = issue_links_read(&q).expect("bare number");
    assert_eq!(read["query"]["queries"][0]["operation"], "issue");
    assert_eq!(read["query"]["queries"][0]["number"], 13786);
    let words = parse(
        r#"{"operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","keywords":["fix 13786"]}"#,
    );
    assert!(issue_links_read(&words).is_none());
}

/// Row diet: commit authors are a login (else name) without email, list
/// rows drop the message body, issue rows drop updatedAt and empty
/// labels, PR rows drop empty labels and zero comment counts.
#[test]
fn history_rows_carry_no_emails_or_empty_fields() {
    let raw = json!({"sha":"abc","commit":{"message":"Fix (#1)\n\nlong body",
        "author":{"name":"Dev","email":"dev@example.com","date":"2026-01-01T00:00:00Z"},
        "committer":{"name":"GitHub","email":"noreply@github.com"}},
        "author":{"login":"dev"},"committer":{"login":"web-flow"}});
    for row in [map_commit(raw.clone()), map_commit_list(raw.clone())] {
        assert_eq!(row["author"], "dev", "{row}");
        assert!(!row.to_string().contains('@'), "{row}");
        assert!(row.get("messageBody").is_none(), "{row}");
        assert!(row.get("committer").is_none(), "{row}");
    }
    let nameless =
        json!({"sha":"abc","commit":{"message":"x","author":{"name":"Dev","email":"d@e.f"}}});
    assert_eq!(map_commit_list(nameless)["author"], "Dev");
    let other = json!({"sha":"abc","commit":{"message":"x","author":{"name":"A"},"committer":{"name":"B"}},
        "author":{"login":"a"},"committer":{"login":"b"}});
    assert_eq!(map_commit_list(other)["committer"], "b");
    let issue = map_issue(
        json!({"number":1,"title":"t","state":"open","user":{"login":"u"},
        "labels":[],"created_at":"c","updated_at":"u"}),
        false,
    );
    assert!(
        issue.get("updatedAt").is_none() && issue.get("labels").is_none(),
        "{issue}"
    );
    let by_update = map_issue(
        json!({"number":1,"updated_at":"u","labels":[{"name":"bug"}]}),
        true,
    );
    assert_eq!(by_update["updatedAt"], "u");
    assert_eq!(by_update["labels"], json!(["bug"]));
    let pr = map_pr(
        json!({"number":1,"title":"t","state":"open","user":{"login":"u"},
        "labels":[],"created_at":"c","comments":0}),
    );
    assert!(
        pr.get("labels").is_none() && pr.get("commentsCount").is_none(),
        "{pr}"
    );
}

/// The `qualifiers` string sets the search filters; scope and unknown
/// keys are rejected.
#[test]
fn qualifiers_set_the_search_filters() {
    let built = |row: Value| build_query(&serde_json::from_value(row).expect("typed"));
    let base = json!({"operation":"pullRequest","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","keywords":["x"]});
    let mut flat = base.clone();
    flat["qualifiers"] = json!(
        r#"reviewed-by:dev review:approved comments:>5 label:"good first issue" -is:draft merged:>2026-01-01"#
    );
    let query = built(flat).expect("flat");
    for term in [
        "reviewed-by:dev",
        "review:approved",
        "comments:>5",
        "label:\"good first issue\"",
        "-is:draft",
        "merged:>2026-01-01",
    ] {
        assert!(query.contains(term), "{term}: {query}");
    }
    // Scope, unknown keys and free text fail the published pattern.
    for bad in ["repo:evil/x", "reviewd-by:dev", "loose words"] {
        let mut row = base.clone();
        row["qualifiers"] = json!(bad);
        assert!(
            serde_json::from_value::<GhSearchHistoryQuery>(row).is_err(),
            "{bad}"
        );
    }
    for (bad, needle) in [("is:pr", "operation"), ("author:a author:b", "set it once")] {
        let mut row = base.clone();
        row["qualifiers"] = json!(bad);
        let error = built(row).expect_err(bad);
        assert!(error.message.contains(needle), "{bad}: {}", error.message);
    }
    assert!(
        serde_json::from_value::<GhSearchHistoryQuery>(json!({"operation":"issue","mainGoal":"g","reasoning":"r","owner":"o","repo":"r","qualifiers":"review:approved"})).is_err(),
        "a PR-only key is no issue qualifier"
    );
}

/// A leading `-` excludes on any pull-request or issue key: the schema
/// admits it, native runs it on the search route, and a typed flag keeps
/// its own spelling (`-is:draft`); commit qualifiers take no negation.
#[test]
fn negated_qualifiers_exclude_on_the_search_route() {
    let row = |operation: &str, qualifiers: &str| {
        json!({"operation":operation,"mainGoal":"g","reasoning":"r","owner":"o","repo":"r",
            "qualifiers":qualifiers})
    };
    let parse = |operation: &str, qualifiers: &str| {
        let prepared =
            crate::contracts::validate_query("ghSearchHistory", row(operation, qualifiers))
                .expect(qualifiers);
        Filters::parse(&serde_json::from_value(prepared).expect("typed"))
    };
    let draft = parse("pullRequest", "-is:draft").expect("native runs -is:draft");
    assert_eq!(draft.draft, Some(false));
    let excluded = parse(
        "pullRequest",
        "label:bug -label:wontfix -author:dependabot[bot]",
    )
    .expect("negated labels and people run");
    assert_eq!(excluded.label, vec!["bug".to_owned()]);
    assert_eq!(
        excluded.excluded,
        vec![
            ("label".to_owned(), "wontfix".to_owned()),
            ("author".to_owned(), "dependabot[bot]".to_owned())
        ]
    );
    let issue = parse("issue", "-label:bug").expect("issue negation runs");
    assert_eq!(issue.excluded, vec![("label".to_owned(), "bug".to_owned())]);
    let state = parse("pullRequest", "-is:open").expect_err("state is the field's");
    assert!(state.message.contains("set state instead"), "{state:?}");
    for (operation, qualifiers, message) in [
        ("commit", "-author:x", "negation is not supported"),
        (
            "issue",
            r#"label:"good first issue" repo:x/y"#,
            "\"repo:x/y\" is not an allowed key:value filter",
        ),
    ] {
        let error = crate::contracts::validate_query("ghSearchHistory", row(operation, qualifiers))
            .expect_err(qualifiers);
        assert!(
            error
                .issues
                .iter()
                .any(|issue| issue.message.contains(message)),
            "{operation} {qualifiers}: {error:?}"
        );
    }
}

#[test]
fn empty_history_rows_are_marked_empty() {
    for key in ["pullRequests", "issues", "commits"] {
        let mut value = json!({ key: [] });
        mark_empty(&mut value, false);
        assert_eq!(value["status"], "empty", "{key}");
    }
    let mut more = json!({"commits": []});
    mark_empty(&mut more, true);
    assert!(more.get("status").is_none());
    let mut rows = json!({"issues": [{"number": 1}]});
    mark_empty(&mut rows, false);
    assert!(rows.get("status").is_none());
}

#[tokio::test]
async fn cap_is_terminal_only_after_the_last_reachable_page() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({
            "total_count": 1001, "incomplete_results": false,
            "items": [{"number": 3, "title": "Fix", "state": "open", "user": {"login": "dev"},
                "repository_url": "https://api.github.com/repos/acme/widget"}]
        }),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    for page in [1, 1000] {
        let query = serde_json::from_value(json!({"operation":"pullRequest","mainGoal": "test", "reasoning":"test","keywords":["fix"],"pageSize":1,"page":page})).expect("query");
        let data = execute(&transport, &query, &default_context(), &Passthrough)
            .await
            .expect("history search");
        assert_eq!(data["isPartial"], true, "{data}");
        assert_eq!(
            data["partialReasons"],
            json!(["providerResultCap"]),
            "{data}"
        );
        assert_eq!(
            data["terminalLimit"].as_bool().unwrap_or(false),
            page == 1000,
            "{data}"
        );
        assert_eq!(data["next"]["nextPage"].is_object(), page < 1000, "{data}");
        // A capped page states GitHub's full match count.
        assert!(
            data["warnings"].as_array().is_some_and(|warnings| warnings
                .iter()
                .any(|warning| warning.as_str().is_some_and(|w| w.contains("1001")))),
            "{data}"
        );
        // A search beyond one repository names each row's owner and repo
        // (the read's own inputs), and the read targets it.
        assert_eq!(
            (
                &data["pullRequests"][0]["owner"],
                &data["pullRequests"][0]["repo"]
            ),
            (&json!("acme"), &json!("widget")),
            "{data}"
        );
        let read = &data["next"]["readPullRequest"]["query"]["queries"][0];
        assert_eq!(
            (&read["owner"], &read["repo"], &read["number"]),
            (&json!("acme"), &json!("widget"), &json!(3)),
            "{data}"
        );
    }
}

/// Commit rows are an index of headlines: the commit read targets the
/// first sha and takes any other row's sha; the rows already name them,
/// so the read carries no second list.
/// GitHub answers a search scoped to a missing or hidden repository with
/// a 422 "cannot be searched": that is `notFound`, not invalid input.
#[tokio::test]
async fn search_of_a_missing_repository_is_not_found() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    let unsearchable = json!({
        "message": "Validation Failed",
        "errors": [{"message": "The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them.",
            "resource": "Search", "field": "q", "code": "invalid"}]
    });
    for route in ["/api/v3/search/issues", "/api/v3/search/commits"] {
        mount_json(&server, route, 422, unsearchable.clone()).await;
    }
    let transport = one_shot_provider(&server).transport;
    for row in [
        json!({"operation":"pullRequest","owner":"o","repo":"missing","keywords":["fix"]}),
        json!({"operation":"commit","owner":"o","repo":"missing","keywords":["fix"]}),
    ] {
        let query = serde_json::from_value(row.clone()).expect("query");
        let error = execute(&transport, &query, &default_context(), &Passthrough)
            .await
            .expect_err("missing repository");
        assert_eq!(error.kind, ProviderErrorKind::NotFound, "{row}: {error:?}");
    }
}

/// GitHub answers a search naming a missing user (`author:ghost`) with a
/// 422 "The listed users cannot be searched…", without "repositories": the
/// repository is fine. That is a missing user, with the same query minus its
/// person qualifiers as the way on; a repository 422 stays a repository.
#[tokio::test]
async fn search_naming_a_missing_user_is_not_a_missing_repository() {
    use octocode_github::ProviderErrorReason;
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        422,
        json!({
            "message": "Validation Failed",
            "errors": [{"message": "The listed users cannot be searched either because the users do not exist or you do not have permission to view the users.",
                "resource": "Search", "field": "q", "code": "invalid"}]
        }),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let query: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"pullRequest","owner":"o","repo":"r",
        "qualifiers":"author:ghost -reviewed-by:bot label:bug"
    }))
    .expect("query");
    let failure = super::execute(&transport, query, &default_context(), &Passthrough)
        .await
        .expect_err("missing user");
    assert_eq!(failure.error.kind, ProviderErrorKind::NotFound);
    assert_eq!(
        failure.error.reason,
        Some(ProviderErrorReason::UserNotFound)
    );
    let (message, hint) = history_failure(&failure.error, true);
    assert!(
        message.contains("user") && !message.contains("Repository"),
        "{message}"
    );
    assert!(
        message.contains("cannot be searched"),
        "GitHub's words stay: {message}"
    );
    // The `withoutUsers` lead is the repair; no hint restates the message.
    assert_eq!(hint, None);
    let lead = failure
        .next
        .expect("a lead")
        .pointer("/withoutUsers/query/queries/0")
        .cloned();
    let lead = lead.expect("withoutUsers is a ghSearchHistory query");
    assert_eq!(lead["qualifiers"], "label:bug", "{lead}");
    assert_eq!(
        (lead["owner"].as_str(), lead["repo"].as_str()),
        (Some("o"), Some("r"))
    );

    // Person qualifiers only: the lead drops `qualifiers` altogether.
    let only: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"pullRequest","owner":"o","repo":"r","qualifiers":"author:ghost"
    }))
    .expect("query");
    let failure = super::execute(&transport, only, &default_context(), &Passthrough)
        .await
        .expect_err("missing user");
    let lead = failure.next.expect("a lead");
    assert!(
        lead["withoutUsers"]["query"]["queries"][0]
            .get("qualifiers")
            .is_none(),
        "{lead}"
    );
}

/// A commit list (no keywords) answers an unknown author with no rows, which
/// reads as a true empty. Only an empty list confirms the login: a missing
/// one is the typed missing-user failure with its `withoutUsers` lead, and a
/// list with rows never pays for the lookup.
#[tokio::test]
async fn an_empty_commit_list_naming_a_missing_author_is_the_missing_user_failure() {
    use octocode_github::ProviderErrorReason;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/ghost"))
        .respond_with(ResponseTemplate::new(404).set_body_json(json!({"message": "Not Found"})))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/dev"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"login": "dev"})))
        .expect(0)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/commits"))
        .and(query_param("author", "ghost"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/commits"))
        .and(query_param("author", "dev"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([{
            "sha": "aaa", "commit": {"message": "Fix cache",
            "committer": {"date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}
        }])))
        .mount(&server)
        .await;
    let transport = one_shot_provider(&server).transport;
    let list = |login: &str| -> GhSearchHistoryQuery {
        serde_json::from_value(json!({
            "operation":"commit","owner":"o","repo":"r","qualifiers": format!("author:{login}")
        }))
        .expect("query")
    };
    let failure = super::execute(&transport, list("ghost"), &default_context(), &Passthrough)
        .await
        .expect_err("missing user");
    assert_eq!(
        failure.error.reason,
        Some(ProviderErrorReason::UserNotFound),
        "{:?}",
        failure.error
    );
    assert!(
        failure
            .next
            .as_ref()
            .and_then(|next| next.pointer("/withoutUsers/query/queries/0"))
            .is_some_and(|lead| lead.get("qualifiers").is_none()),
        "{:?}",
        failure.next
    );
    assert!(
        super::execute(&transport, list("dev"), &default_context(), &Passthrough)
            .await
            .is_ok(),
        "a list with rows"
    );
}

/// GitHub's commit search drops an unknown `author:`/`committer:` login
/// without error and answers the unfiltered total. A named login is
/// confirmed once per call (`GET /users/{login}`): a missing one is the same
/// typed missing-user failure and `withoutUsers` lead that issue and PR
/// search return, and the search never runs.
#[tokio::test]
async fn commit_search_naming_a_missing_user_fails_before_the_search() {
    use octocode_github::ProviderErrorReason;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/ghost"))
        .respond_with(ResponseTemplate::new(404).set_body_json(json!({"message": "Not Found"})))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/dev"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"login": "dev"})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/commits"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                json!({"total_count": 1498, "incomplete_results": false, "items": []}),
            ),
        )
        .expect(0)
        .mount(&server)
        .await;
    let transport = one_shot_provider(&server).transport;
    // The missing login may be the author or the committer, next to a real one.
    for qualifiers in ["author:ghost", "author:dev committer:ghost"] {
        let query: GhSearchHistoryQuery = serde_json::from_value(json!({
            "operation":"commit","owner":"o","repo":"r","keywords":["fix"],
            "qualifiers": qualifiers
        }))
        .expect("query");
        let failure = super::execute(&transport, query, &default_context(), &Passthrough)
            .await
            .expect_err("missing user");
        assert_eq!(
            failure.error.kind,
            ProviderErrorKind::NotFound,
            "{qualifiers}"
        );
        assert_eq!(
            failure.error.reason,
            Some(ProviderErrorReason::UserNotFound),
            "{qualifiers}"
        );
        let (message, hint) = history_failure(&failure.error, true);
        assert!(
            message.contains("user")
                && message.contains("ghost")
                && !message.contains("Repository"),
            "{message}"
        );
        assert_eq!(hint, None, "{qualifiers}");
        let lead = failure
            .next
            .expect("a lead")
            .pointer("/withoutUsers/query/queries/0")
            .cloned()
            .expect("withoutUsers is a ghSearchHistory query");
        assert!(lead.get("qualifiers").is_none(), "{lead}");
        assert_eq!(lead["keywords"], json!(["fix"]), "{lead}");
    }
}

/// A login is confirmed once per call however many qualifiers name it, and
/// not at all when no qualifier (or only an email, which has no profile)
/// names a user. A failed confirmation never blocks the search.
#[tokio::test]
async fn commit_search_confirms_each_named_login_once_and_only_then() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/Dev"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"login": "dev"})))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/flaky"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({"message": "boom"})))
        .mount(&server)
        .await;
    mount_json(
        &server,
        "/api/v3/search/commits",
        200,
        json!({"total_count": 0, "incomplete_results": false, "items": []}),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let run = |qualifiers: Option<&str>| {
        let mut row = json!({"operation":"commit","owner":"o","repo":"r","keywords":["fix"]});
        if let Some(qualifiers) = qualifiers {
            row["qualifiers"] = json!(qualifiers);
        }
        let query: GhSearchHistoryQuery = serde_json::from_value(row).expect("query");
        let transport = &transport;
        async move {
            super::execute(transport, query, &default_context(), &Passthrough)
                .await
                .expect("search runs")
        }
    };
    // One login named as author and committer (case aside): one request.
    run(Some("author:Dev committer:dev")).await;
    // No user qualifier, or an email: no /users request (an unmounted route
    // would 404 as a missing user and fail the search).
    run(None).await;
    run(Some("author:dev@example.com")).await;
    // Any failure but 404 does not block; the search says it was unchecked.
    let data = run(Some("author:flaky")).await;
    let warnings = data["warnings"].to_string();
    assert!(warnings.contains("flaky"), "{data}");
}

#[tokio::test]
async fn commit_search_read_targets_the_first_sha_without_a_candidate_list() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    let commit = |sha: &str| {
        json!({"sha": sha, "commit": {"message": format!("Fix {sha}\n\nWhy: the body names the cache"),
            "author": {"name": "Dev", "date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}})
    };
    mount_json(
        &server,
        "/api/v3/search/commits",
        200,
        json!({
            "total_count": 3, "incomplete_results": false,
            "items": [commit("aaa"), commit("bbb"), commit("ccc")]
        }),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let query = serde_json::from_value(
        json!({"operation":"commit","mainGoal":"test","reasoning":"test",
        "owner":"o","repo":"r","keywords":["cache"]}),
    )
    .expect("query");
    let data = execute(&transport, &query, &default_context(), &Passthrough)
        .await
        .expect("history search");
    let read = &data["next"]["readCommit"];
    assert_eq!(read["query"]["queries"][0]["ref"], "aaa", "{data}");
    assert_eq!(
        read["query"]["queries"][0]["sections"],
        json!(["patches"]),
        "{data}"
    );
    assert!(read.get("candidates").is_none(), "{data}");
    assert_eq!(data["commits"].as_array().map(Vec::len), Some(3), "{data}");
    // Commit search pages use the shared `currentPage` key, so the
    // default projection drops page one like every other history page.
    assert_eq!(data["pagination"]["currentPage"], 1, "{data}");
    assert!(data["pagination"].get("page").is_none(), "{data}");
}

/// A commit listing names its row kind like commit search: `type` is
/// `commits`, whether `path` names a file, a directory, or nothing.
#[tokio::test]
async fn commit_listing_rows_are_typed_commits() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        200,
        json!([{
            "sha": "aaa", "commit": {"message": "Fix cache",
            "committer": {"date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}
        }]),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    for scope in [json!("src/lib.rs"), json!("src/"), Value::Null] {
        let mut query = json!({"operation":"commit","owner":"o","repo":"r"});
        if !scope.is_null() {
            query["path"] = scope.clone();
        }
        let query = serde_json::from_value(query).expect("query");
        let data = execute(&transport, &query, &default_context(), &Passthrough)
            .await
            .expect("commit listing");
        assert!(data.get("type").is_none(), "{scope}: {data}");
        assert_eq!(data["commits"][0]["commitSha"], "aaa", "{data}");
        // The listed path is the caller's own input: not restated.
        assert!(data.get("path").is_none(), "{scope}: {data}");
        // The commit read scopes its patches with the published `include`.
        let read = &data["next"]["readCommit"]["query"]["queries"][0];
        assert!(read.get("path").is_none(), "{read}");
        if scope.is_null() {
            assert!(read.get("include").is_none(), "{read}");
        } else {
            assert_eq!(read["include"], json!([scope]), "{read}");
        }
    }
}

/// A plain issue listing pages `is:issue` search results, so every
/// page holds up to pageSize real issues (the REST /issues list
/// interleaves PRs) and page numbers advance by one. An empty or PR-only
/// repository is a clean empty row.
#[tokio::test]
async fn plain_issue_listing_pages_issue_search_without_pr_gaps() {
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param},
    };

    let issue = |n: u64| json!({"number": n, "title": format!("issue {n}"), "state": "open", "user": {"login": "dev"}});
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/issues"))
        .and(query_param("q", "is:issue repo:o/full"))
        .and(query_param("page", "2"))
        .and(query_param("per_page", "5"))
        .and(query_param("sort", "created"))
        .and(query_param("order", "desc"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count": 11, "incomplete_results": false,
            "items": [issue(6), issue(7), issue(8), issue(9), issue(10)]
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/issues"))
        .and(query_param("q", "is:issue repo:o/prs-only"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "total_count": 0, "incomplete_results": false, "items": []
        })))
        .mount(&server)
        .await;
    let transport = one_shot_provider(&server).transport;
    let run = |query: Value| {
        let transport = &transport;
        async move {
            execute(
                transport,
                &serde_json::from_value(query).expect("query"),
                &default_context(),
                &Passthrough,
            )
            .await
            .expect("issue listing")
        }
    };
    let data = run(json!({"operation":"issue","mainGoal":"g","reasoning":"r","owner":"o","repo":"full","pageSize":5,"page":2})).await;
    assert_eq!(data["issues"].as_array().map(Vec::len), Some(5), "{data}");
    assert_eq!(data["pagination"]["currentPage"], 2, "{data}");
    assert_eq!(data["pagination"]["nextPage"], 3, "{data}");
    assert_eq!(
        data["next"]["nextPage"]["query"]["queries"][0]["page"], 3,
        "{data}"
    );
    assert_eq!(data["pagination"]["totalItems"], 11, "{data}");
    assert!(data.get("skippedPullRequestPages").is_none(), "{data}");

    let empty = run(json!({"operation":"issue","mainGoal":"g","reasoning":"r","owner":"o","repo":"prs-only","pageSize":5})).await;
    assert_eq!(empty["issues"], json!([]), "{empty}");
    assert_eq!(empty["status"], "empty", "{empty}");
    assert!(empty.get("pagination").is_none(), "{empty}");
    assert!(empty["next"].get("nextPage").is_none(), "{empty}");
}

fn parse(json: &str) -> GhSearchHistoryQuery {
    serde_json::from_str(json).expect("GitHub history search test data should be valid")
}

#[test]
fn pull_request_search_allows_cross_repo_and_owner_scopes() {
    let both = build_query(&parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["x"]}"#,
    ))
    .expect("scoped");
    assert!(both.contains("repo:a/b"), "{both}");
    let owner = build_query(&parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","keywords":["x"]}"#,
    ))
    .expect("owner-scoped PR search");
    assert!(
        owner.contains("user:a") && !owner.contains("repo:"),
        "{owner}"
    );
    let global = build_query(&parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","keywords":["x"]}"#,
    ))
    .expect("cross-repo PR search");
    assert!(
        !global.contains("repo:") && !global.contains("user:"),
        "{global}"
    );
    assert!(!global.contains("archived:"), "{global}");
    // Without a full repo scope the REST list endpoint is unusable, so the
    // PR path must route through search.
    assert!(should_use_search_for_prs(&parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a"}"#
    )));
    assert!(!should_use_search_for_prs(&parse(
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","owner":"a","repo":"b"}"#
    )));
    // Issues still require the repository scope.
    assert!(
        serde_json::from_str::<GhSearchHistoryQuery>(
            r#"{"operation":"issue","mainGoal":"test","reasoning":"test","keywords":["x"]}"#
        )
        .is_err()
    );
}

/// An unparseable `since`/`until` is invalid input, never a silently
/// unfiltered listing (search or REST list).
#[test]
fn commit_window_with_an_invalid_date_is_rejected() {
    for row in [
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["fix"],"since":"yesterday-ish"}"#,
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","since":"zz"}"#,
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","until":"2026-13-01"}"#,
    ] {
        let q = parse(row);
        let error = resolve_commit_window(&q, &mut Vec::new()).expect_err(row);
        assert_eq!(error.kind, ProviderErrorKind::Validation, "{row}");
        assert!(
            error.message.contains("since") || error.message.contains("until"),
            "{}",
            error.message
        );
        assert!(error.message.contains("30d"), "{}", error.message);
        assert!(!error.message.contains("skipped"), "{}", error.message);
    }
}

#[test]
fn inverted_since_until_is_a_validation_error() {
    let q = parse(
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","keywords":["fix"],"since":"2026-05-01","until":"2026-01-01"}"#,
    );
    let error = build_query(&q).expect_err("since after until");
    assert_eq!(error.kind, ProviderErrorKind::Validation);
    assert!(error.message.contains("since"), "{}", error.message);
    let listed = parse(
        r#"{"operation":"commit","mainGoal":"test","reasoning":"test","owner":"a","repo":"b","since":"2026-05-01","until":"2026-01-01"}"#,
    );
    assert!(build_query(&listed).is_err());
}

/// GitHub search does not follow renames, but a search that finds rows
/// needs no rename lookup: the `/repos` request runs only when the search
/// comes back empty, and then the search re-runs against the new name.
#[tokio::test]
async fn rename_lookup_runs_only_when_the_search_finds_nothing() {
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param},
    };
    let row = json!({"number": 7, "title": "Fix", "state": "open", "user": {"login": "dev"}});
    let found = MockServer::builder().start().await;
    mount_json(
        &found,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 1, "incomplete_results": false, "items": [row.clone()]}),
    )
    .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"default_branch": "main", "full_name": "o/r"})),
        )
        .expect(0)
        .mount(&found)
        .await;
    let query = serde_json::from_value(
        json!({"operation":"pullRequest","owner":"o","repo":"r","keywords":["fix"]}),
    )
    .expect("query");
    let data = execute(
        &one_shot_provider(&found).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("search");
    assert_eq!(data["pullRequests"][0]["number"], 7, "{data}");

    let renamed = MockServer::builder().start().await;
    for (scope, items) in [("old/r", json!([])), ("new/r", json!([row]))] {
        Mock::given(method("GET"))
            .and(path("/api/v3/search/issues"))
            .and(query_param("q", format!("fix is:pr repo:{scope}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "total_count": items.as_array().map_or(0, Vec::len),
                "incomplete_results": false, "items": items
            })))
            .mount(&renamed)
            .await;
    }
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/old/r"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"default_branch": "main", "full_name": "new/r"})),
        )
        .expect(1)
        .mount(&renamed)
        .await;
    let query = serde_json::from_value(
        json!({"operation":"pullRequest","owner":"old","repo":"r","keywords":["fix"]}),
    )
    .expect("query");
    let data = execute(
        &one_shot_provider(&renamed).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("renamed search");
    assert_eq!(data["pullRequests"][0]["number"], 7, "{data}");
    assert_eq!(
        data["warnings"][0],
        crate::tools::gh_shared::renamed_warning("old", "r", &("new".into(), "r".into())),
        "one shared rename wording: {data}"
    );
    let read = &data["next"]["readPullRequest"]["query"]["queries"][0];
    assert_eq!(
        (&read["owner"], &read["repo"]),
        (&json!("new"), &json!("r")),
        "{data}"
    );
}

/// Every row date is UTC `Z`: commit search reports the committer's own
/// offset, the REST listings already use `Z`.
#[test]
fn row_dates_are_utc() {
    let commit = json!({"sha":"abc","commit":{"message":"Fix",
        "author":{"name":"Dev","date":"2024-03-01T01:30:00.000+02:00"}}});
    assert_eq!(map_commit(commit.clone())["date"], "2024-02-29T23:30:00Z");
    assert_eq!(map_commit_list(commit)["date"], "2024-02-29T23:30:00Z");
    let pr = map_pr(json!({"number":1,"state":"closed","user":{"login":"u"},
        "created_at":"2024-01-01T10:00:00-01:00","merged_at":"2024-01-02T00:00:00+00:30"}));
    assert_eq!(pr["createdAt"], "2024-01-01T11:00:00Z", "{pr}");
    assert_eq!(pr["mergedAt"], "2024-01-01T23:30:00Z", "{pr}");
    let issue = map_issue(
        json!({"number":1,"created_at":"2024-01-01T10:00:00Z","updated_at":"2024-01-01T10:00:00+01:00"}),
        true,
    );
    assert_eq!(issue["createdAt"], "2024-01-01T10:00:00Z", "{issue}");
    assert_eq!(issue["updatedAt"], "2024-01-01T09:00:00Z", "{issue}");
}

/// An empty search offers one runnable batch: the same search once without
/// each narrowing filter (keywords, qualifiers, the date window; commits,
/// pull requests and issues all take `since`/`until`).
#[test]
fn empty_searches_offer_a_broader_search() {
    let broadened = |row: Value| {
        let query: GhSearchHistoryQuery = serde_json::from_value(row).expect("query");
        super::leads::broaden_search(&query).map(|lead| lead["query"]["queries"][0].clone())
    };
    let keywords = broadened(json!({"operation":"pullRequest","owner":"o","repo":"r",
        "keywords":["fix"],"qualifiers":"author:x","page":2}))
    .expect("keywords dropped");
    assert!(keywords.get("keywords").is_none(), "{keywords}");
    assert!(keywords.get("page").is_none(), "{keywords}");
    assert_eq!(keywords["qualifiers"], "author:x", "{keywords}");
    // Every narrowing filter gets its own variant: a scoped keyword search
    // that is empty because of its date window is recoverable too.
    let both: GhSearchHistoryQuery = serde_json::from_value(json!({"operation":"pullRequest",
        "owner":"o","repo":"r","keywords":["fix"],"since":"2030-01-01"}))
    .expect("query");
    let both = super::leads::broaden_search(&both).expect("lead")["query"]["queries"].clone();
    assert_eq!(both.as_array().map(Vec::len), Some(2), "{both}");
    assert!(
        both[1].get("since").is_none() && both[1]["keywords"] == json!(["fix"]),
        "{both}"
    );
    let qualifiers = broadened(json!({"operation":"issue","owner":"o","repo":"r",
        "qualifiers":"label:bug"}))
    .expect("qualifiers dropped");
    assert!(qualifiers.get("qualifiers").is_none(), "{qualifiers}");
    let window = broadened(json!({"operation":"commit","owner":"o","repo":"r",
        "path":"src","since":"30d"}))
    .expect("window dropped");
    assert!(window.get("since").is_none(), "{window}");
    assert_eq!(window["path"], "src", "{window}");
    for operation in ["pullRequest", "issue"] {
        let window = broadened(json!({"operation":operation,"owner":"o","repo":"r",
            "since":"2026-10-01","until":"2026-10-03"}))
        .expect("window dropped");
        assert!(window.get("since").is_none(), "{operation}: {window}");
        assert!(window.get("until").is_none(), "{operation}: {window}");
    }
    assert!(broadened(json!({"operation":"commit","owner":"o","repo":"r"})).is_none());
}

/// Branch and label filters are qualifiers: `head:`/`base:` route a pull
/// request search through search, labels add up, and issues reject the
/// pull-request-only branch keys.
#[test]
fn branch_and_label_filters_come_from_qualifiers() {
    let pr = parse(
        r#"{"operation":"pullRequest","owner":"o","repo":"r","qualifiers":"head:feature base:main label:bug label:ui"}"#,
    );
    assert!(should_use_search_for_prs(&pr));
    let built = build_query(&pr).expect("query");
    for term in ["head:feature", "base:main", "label:\"bug\"", "label:\"ui\""] {
        assert!(built.contains(term), "{term}: {built}");
    }
    // Issue qualifiers are typed by the issue key list: a PR-only key is
    // refused before any filter runs.
    assert!(
        serde_json::from_str::<GhSearchHistoryQuery>(
            r#"{"operation":"issue","owner":"o","repo":"r","qualifiers":"head:x"}"#
        )
        .is_err()
    );
    for hidden in ["label", "sourceBranch", "targetBranch"] {
        let mut row = json!({"operation":"pullRequest","owner":"o","repo":"r"});
        row[hidden] = json!(if hidden == "label" {
            json!(["bug"])
        } else {
            json!("x")
        });
        assert!(
            serde_json::from_value::<GhSearchHistoryQuery>(row).is_err(),
            "{hidden} is a qualifier now"
        );
    }
}

/// A commit row whose headline ends in `(#N)` names the PR; only the
/// trailing suffix counts (a revert names the reverting PR).
#[test]
fn a_squash_headline_names_its_pull_request_once() {
    let commit =
        |message: &str| json!({"sha":"abc","commit":{"message":message,"author":{"name":"Dev"}}});
    for (message, number) in [
        ("x (#123)", Some(123)),
        ("Revert \"y (#1)\" (#2)\n\nbody", Some(2)),
        ("(#12) prefix", None),
        ("fix (#abc)", None),
    ] {
        for row in [
            map_commit(commit(message)),
            map_commit_list(commit(message)),
        ] {
            // The headline states the number; the row adds no copy of it.
            assert!(row.get("prNumber").is_none(), "{row}");
            let headline = row["messageHeadline"].as_str().unwrap_or_default();
            assert_eq!(
                crate::tools::gh_shared::commit::headline_pull_request(headline),
                number,
                "{message}: {row}"
            );
        }
    }
}

/// Issue rows carry the discussion size like PR rows; zero stays out.
#[test]
fn issue_rows_carry_a_non_zero_comment_count() {
    let issue = |comments: u64| {
        map_issue(
            json!({"number":1,"title":"t","state":"open","comments":comments}),
            false,
        )
    };
    assert_eq!(issue(105)["commentsCount"], 105);
    assert!(issue(0).get("commentsCount").is_none());
}

/// An empty search with several keywords offers one drop-one variant
/// per keyword (at most 5, the last keyword dropped first) instead of
/// dropping them all.
#[test]
fn empty_multi_keyword_search_broadens_one_keyword_at_a_time() {
    let variants = |keywords: Value| {
        let query: GhSearchHistoryQuery = serde_json::from_value(json!({"operation":"pullRequest",
            "owner":"o","repo":"r","keywords":keywords,"pageSize":7}))
        .expect("query");
        super::leads::broaden_search(&query).expect("lead")["query"]["queries"].clone()
    };
    let three = variants(json!(["a", "b", "c"]));
    let kept = three
        .as_array()
        .expect("queries")
        .iter()
        .map(|row| row["keywords"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        kept,
        vec![json!(["a", "b"]), json!(["a", "c"]), json!(["b", "c"])]
    );
    assert!(
        three
            .as_array()
            .expect("queries")
            .iter()
            .all(|row| row["pageSize"] == 7)
    );
    let one = variants(json!(["a"]));
    assert_eq!(one.as_array().map(Vec::len), Some(1), "{one}");
    assert!(one[0].get("keywords").is_none(), "{one}");
    let seven = variants(json!(["a", "b", "c", "d", "e", "f", "g"]));
    assert_eq!(seven.as_array().map(Vec::len), Some(5), "{seven}");
    assert_eq!(seven[0]["keywords"], json!(["a", "b", "c", "d", "e", "f"]));
    assert_eq!(seven[4]["keywords"], json!(["a", "b", "d", "e", "f", "g"]));
}

/// The PR read of a relevance-ordered search targets row 0 (the best
/// match), not the first merged row; a sorted page keeps merged-first.
#[test]
fn pull_request_read_targets_the_best_match_unless_sorted() {
    let rows = [
        json!({"number":10,"state":"open"}),
        json!({"number":11,"state":"closed","pull_request":{"merged_at":"2026-01-01T00:00:00Z"}}),
    ];
    let read = |query: Value| {
        let query: GhSearchHistoryQuery = serde_json::from_value(query).expect("query");
        super::leads::read_pull_request(&query, &rows).expect("read")["query"]["queries"][0]["number"].clone()
    };
    assert_eq!(
        read(json!({"operation":"pullRequest","owner":"o","repo":"r","keywords":["x"]})),
        10
    );
    assert_eq!(
        read(
            json!({"operation":"pullRequest","owner":"o","repo":"r","keywords":["x"],"sort":"updated:desc"})
        ),
        11
    );
    assert_eq!(
        read(json!({"operation":"pullRequest","owner":"o","repo":"r"})),
        11
    );
}

/// A path commit listing leads to the first `(#N)` row's PR
/// scoped to that path, and the envelope neither echoes owner/repo nor
/// restates totalPages.
#[tokio::test]
async fn commit_listing_leads_to_the_squash_pull_request() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    let commit = |sha: &str, message: &str| {
        json!({"sha": sha, "commit": {"message": message,
            "author": {"name": "Dev", "date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}})
    };
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        200,
        json!([commit("aaa", "Bump deps"), commit("bbb", "Fix cache (#9)")]),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 1, "incomplete_results": false,
            "items": [{"number": 3, "title": "Bug", "state": "open", "comments": 4}]}),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let query = serde_json::from_value(
        json!({"operation":"commit","owner":"o","repo":"r","path":"src/lib.rs"}),
    )
    .expect("query");
    let data = execute(&transport, &query, &default_context(), &Passthrough)
        .await
        .expect("commit listing");
    assert!(data["commits"][1].get("prNumber").is_none(), "{data}");
    let read = &data["next"]["readPullRequest"]["query"]["queries"][0];
    assert_eq!(read["number"], 9, "{data}");
    assert_eq!(read["include"], json!(["src/lib.rs"]), "{data}");
    assert!(
        data.get("owner").is_none() && data.get("repo").is_none(),
        "{data}"
    );

    let query = serde_json::from_value(
        json!({"operation":"issue","owner":"o","repo":"r","keywords":["bug"]}),
    )
    .expect("query");
    let data = execute(&transport, &query, &default_context(), &Passthrough)
        .await
        .expect("issue search");
    assert!(
        data.get("owner").is_none() && data.get("repo").is_none(),
        "{data}"
    );
    assert_eq!(data["issues"][0]["commentsCount"], 4, "{data}");
    assert!(data["pagination"].get("totalPages").is_none(), "{data}");
}

/// A resolved window is one range value: both bounds `a..b`, one bound
/// `>=a` / `<=b` (commit `committer-date:` and PR/issue `created:` alike).
#[test]
fn date_windows_render_as_one_search_range() {
    use super::query::window_range;
    assert_eq!(
        window_range(Some("2026-09-01"), Some("2026-09-30")).as_deref(),
        Some("2026-09-01..2026-09-30")
    );
    assert_eq!(
        window_range(Some("2026-09-01"), None).as_deref(),
        Some(">=2026-09-01")
    );
    assert_eq!(
        window_range(None, Some("2026-09-30")).as_deref(),
        Some("<=2026-09-30")
    );
    assert_eq!(window_range(None, None), None);
}

/// A row drops what its query already says: the filtered `state`, and a
/// merged row's `createdAt` unless the rows are sorted by creation.
#[test]
fn rows_drop_the_filtered_state_and_a_merged_rows_created_at() {
    let merged = || {
        map_pr(json!({
            "number":1,"title":"t","state":"closed","merged_at":"2026-09-20T10:00:00Z",
            "user":{"login":"dev"},"created_at":"2026-09-19T10:00:00Z"
        }))
    };
    let mut row = merged();
    super::rows::drop_implied(&mut row, Some("merged"), false, &[]);
    assert!(row.get("state").is_none(), "{row}");
    assert!(row.get("createdAt").is_none(), "{row}");
    assert_eq!(row["mergedAt"], "2026-09-20T10:00:00Z");
    // A key the caller picked is what they asked for: it stays.
    let mut row = merged();
    let picked = ["state", "createdAt"].map(String::from);
    super::rows::drop_implied(&mut row, Some("merged"), false, &picked);
    assert_eq!(row["state"], "merged");
    assert_eq!(row["createdAt"], "2026-09-19T10:00:00Z");
    // `closed` also lists merged PRs: their state stays.
    let mut row = merged();
    super::rows::drop_implied(&mut row, Some("closed"), true, &[]);
    assert_eq!(row["state"], "merged");
    assert_eq!(row["createdAt"], "2026-09-19T10:00:00Z");
}

#[test]
fn fields_keep_the_row_id_then_the_picked_keys_in_request_order() {
    let row = json!({"number": 1, "title": "t", "state": "open", "author": "a"});
    let keys = ["title", "state", "missing"].map(String::from);
    let picked = pick_fields(row.clone(), &["number"], &keys);
    assert_eq!(picked, json!({"number": 1, "title": "t", "state": "open"}));
    assert_eq!(
        picked
            .as_object()
            .map(|row| row.keys().cloned().collect::<Vec<_>>()),
        Some(vec![
            "number".to_owned(),
            "title".to_owned(),
            "state".to_owned()
        ])
    );
    // No pick keeps the row whole.
    assert_eq!(
        pick_fields(row, &["number"], &[]),
        json!({"number": 1, "title": "t", "state": "open", "author": "a"})
    );
}

#[test]
fn fields_reach_the_query_without_changing_the_search() {
    let plain =
        r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","keywords":["x"]}"#;
    let picked = r#"{"operation":"pullRequest","mainGoal":"test","reasoning":"test","keywords":["x"],"fields":["number","title"]}"#;
    assert_eq!(
        search(&parse(picked)).expect("search").fields(),
        vec!["number".to_string(), "title".to_string()]
    );
    assert!(search(&parse(plain)).expect("search").fields().is_empty());
    assert_eq!(
        build_query(&parse(picked)).expect("query"),
        build_query(&parse(plain)).expect("query")
    );
}

#[tokio::test]
async fn fields_project_listed_commits_end_to_end() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        200,
        json!([{
            "sha": "aaa", "commit": {"message": "Fix cache",
            "committer": {"date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}
        }]),
    )
    .await;
    let query = serde_json::from_value(
        json!({"operation":"commit","owner":"o","repo":"r","fields":["commitSha"]}),
    )
    .expect("query");
    let data = execute(
        &one_shot_provider(&server).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("commit listing");
    // The pick keeps the commit's id (commitSha) beside the picked keys.
    assert_eq!(data["commits"][0], json!({"commitSha": "aaa"}), "{data}");
}

/// PR and issue `since`/`until` reach the search as a `created:` window
/// (they were accepted and silently ignored).
#[test]
fn pull_request_and_issue_windows_reach_the_search() {
    for operation in ["pullRequest", "issue"] {
        let terms = build_query(&parse(&format!(
            r#"{{"operation":"{operation}","owner":"a","repo":"b","since":"2026-10-01","until":"2026-10-03"}}"#
        )))
        .expect("query");
        assert!(
            terms.contains("created:2026-10-01..2026-10-03"),
            "{operation}: {terms}"
        );
    }
}

/// `since`/`until` filter pull requests on their created date, so the rows
/// show it beside `mergedAt`: otherwise a merged row dated outside the window
/// looks like a filter bug.
#[test]
fn rows_filtered_on_the_created_window_keep_created_at() {
    let window = parse(
        r#"{"operation":"pullRequest","owner":"a","repo":"b","state":"merged","since":"2026-09-01"}"#,
    );
    assert!(super::shape::keeps_created(
        &search(&window).expect("query")
    ));
    let plain = parse(r#"{"operation":"pullRequest","owner":"a","repo":"b","state":"merged"}"#);
    assert!(!super::shape::keeps_created(
        &search(&plain).expect("query")
    ));
    let qualifier = parse(
        r#"{"operation":"pullRequest","owner":"a","repo":"b","qualifiers":"created:>2026-01-01"}"#,
    );
    assert!(super::shape::keeps_created(
        &search(&qualifier).expect("query")
    ));
}

/// A picked key no row carries (here a typo) still answers, with one
/// per-call warning instead of rows that silently lack the key.
#[tokio::test]
async fn an_absent_picked_key_is_named_once() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        200,
        json!([{
            "sha": "aaa", "commit": {"message": "Fix cache",
            "committer": {"date": "2026-01-01T00:00:00Z"}}, "author": {"login": "dev"}
        }]),
    )
    .await;
    let query = serde_json::from_value(
        json!({"operation":"commit","owner":"o","repo":"r","fields":["messageHedline"]}),
    )
    .expect("query");
    let data = execute(
        &one_shot_provider(&server).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("commit listing");
    assert_eq!(data["commits"][0], json!({"commitSha": "aaa"}), "{data}");
    assert_eq!(
        data["warnings"],
        json!(["No row has messageHedline."]),
        "{data}"
    );
}

/// `fields:["state","createdAt"]` on merged rows of a `state:"merged"`
/// search returns both keys: the pick names what the query implies, so it
/// is not dropped as implied (and no "No row has" warning fires).
#[tokio::test]
async fn picked_keys_survive_the_implied_drop() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 1, "incomplete_results": false, "items": [{
            "number": 7, "title": "t", "state": "closed",
            "pull_request": {"merged_at": "2026-09-20T10:00:00Z"},
            "user": {"login": "dev"}, "created_at": "2026-09-19T10:00:00Z",
            "repository_url": "https://api.github.com/repos/o/r"
        }]}),
    )
    .await;
    let query = serde_json::from_value(json!({
        "operation":"pullRequest","owner":"o","repo":"r","keywords":["x"],
        "state":"merged","fields":["state","createdAt"]
    }))
    .expect("query");
    let data = execute(
        &one_shot_provider(&server).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("pull request search");
    assert_eq!(
        data["pullRequests"][0],
        json!({"number": 7, "state": "merged", "createdAt": "2026-09-19T10:00:00Z"}),
        "{data}"
    );
    assert!(data.get("warnings").is_none(), "{data}");
}

/// `since`/`until` reach the provider request on every operation and
/// route: PR and issue searches as a `created:` window (a PR window routes
/// a REST-listable query to search), commit search as `committer-date:`,
/// and the REST commit listing (with `path`) as `since`/`until` params,
/// a date-only `until` covering its whole day.
#[tokio::test]
async fn since_until_reach_the_request_of_every_operation() {
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param, query_param_contains},
    };

    let server = MockServer::builder().start().await;
    let empty = json!({"total_count": 0, "incomplete_results": false, "items": []});
    for (route, scope) in [
        ("/api/v3/search/issues", "is:pr repo:o/r"),
        ("/api/v3/search/issues", "is:issue repo:o/r"),
    ] {
        Mock::given(method("GET"))
            .and(path(route))
            .and(query_param_contains("q", scope))
            .and(query_param_contains("q", "created:2026-10-01..2026-10-03"))
            .respond_with(ResponseTemplate::new(200).set_body_json(empty.clone()))
            .expect(1)
            .mount(&server)
            .await;
    }
    Mock::given(method("GET"))
        .and(path("/api/v3/search/commits"))
        .and(query_param_contains(
            "q",
            "committer-date:2026-10-01..2026-10-03",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(empty.clone()))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/commits"))
        .and(query_param("since", "2026-10-01"))
        .and(query_param("until", "2026-10-03T23:59:59Z"))
        .and(query_param("path", "src"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .expect(1)
        .mount(&server)
        .await;
    let transport = one_shot_provider(&server).transport;
    for row in [
        json!({"operation":"pullRequest","owner":"o","repo":"r"}),
        json!({"operation":"issue","owner":"o","repo":"r"}),
        json!({"operation":"commit","owner":"o","repo":"r","keywords":["fix"]}),
        json!({"operation":"commit","owner":"o","repo":"r","path":"src"}),
    ] {
        let mut row = row;
        row["since"] = json!("2026-10-01");
        row["until"] = json!("2026-10-03");
        let query = serde_json::from_value(row.clone()).expect("query");
        let data = execute(&transport, &query, &default_context(), &Passthrough)
            .await
            .unwrap_or_else(|error| panic!("{row}: the window missed the request: {error:?}"));
        assert_eq!(data["status"], "empty", "{row}: {data}");
        // An empty window states no static note; the broadened search
        // without the window is the per-call repair.
        assert!(data.get("warnings").is_none(), "{row}: {data}");
        let broader = &data["next"]["broadenSearch"]["query"]["queries"];
        assert!(
            broader
                .as_array()
                .is_some_and(|rows| rows.iter().any(|row| row.get("since").is_none())),
            "{row}: {data}"
        );
    }
}

/// The happy-path anchors of each operation's row: the id the next hop
/// reads (`number`, or `commitSha` as its `ref`), `state` (absent only when
/// the query fixes it), `author`, and exactly one date.
#[tokio::test]
async fn happy_path_rows_carry_the_next_hop_anchors() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/pulls",
        200,
        json!([
            {"number": 1, "title": "a", "state": "closed", "merged_at": "2026-09-02T00:00:00Z",
                "created_at": "2026-09-01T00:00:00Z", "user": {"login": "dev"}},
            {"number": 2, "title": "b", "state": "open",
                "created_at": "2026-09-03T00:00:00Z", "user": {"login": "dev"}}
        ]),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 1, "incomplete_results": false, "items": [
            {"number": 9, "title": "bug", "state": "open", "created_at": "2026-09-04T00:00:00Z",
                "user": {"login": "dev"}}
        ]}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        200,
        json!([{"sha": "c0ffee", "author": {"login": "dev"},
            "commit": {"message": "fix (#1)\n\nbody", "author": {"name": "Dev", "date": "2026-09-05T00:00:00Z"}}}]),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/search/commits",
        200,
        json!({"total_count": 1, "incomplete_results": false, "items": [
            {"sha": "beef", "author": {"login": "dev"},
                "commit": {"message": "fix", "author": {"name": "Dev", "date": "2026-09-06T00:00:00Z"}}}
        ]}),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let run = |row: Value| {
        let transport = &transport;
        async move {
            let query = serde_json::from_value(row.clone()).expect("query");
            execute(transport, &query, &default_context(), &Passthrough)
                .await
                .unwrap_or_else(|error| panic!("{row}: {error:?}"))
        }
    };
    let keys = |row: &Value| {
        row.as_object()
            .expect("row")
            .keys()
            .cloned()
            .collect::<Vec<_>>()
    };

    let prs = run(json!({"operation":"pullRequest","owner":"o","repo":"r"})).await;
    assert_eq!(
        keys(&prs["pullRequests"][0]),
        ["number", "title", "state", "mergedAt", "author"],
        "{prs}"
    );
    assert_eq!(
        keys(&prs["pullRequests"][1]),
        ["number", "title", "state", "author", "createdAt"],
        "{prs}"
    );
    // A state the query fixes is not restated per row.
    let open = run(json!({"operation":"pullRequest","owner":"o","repo":"r","state":"open"})).await;
    assert!(open["pullRequests"][1].get("state").is_none(), "{open}");

    let issues = run(json!({"operation":"issue","owner":"o","repo":"r"})).await;
    assert_eq!(
        keys(&issues["issues"][0]),
        ["number", "title", "state", "author", "createdAt"],
        "{issues}"
    );

    let listed = run(json!({"operation":"commit","owner":"o","repo":"r"})).await;
    let searched =
        run(json!({"operation":"commit","owner":"o","repo":"r","keywords":["fix"]})).await;
    for data in [&listed, &searched] {
        assert_eq!(
            keys(&data["commits"][0]),
            ["commitSha", "date", "messageHeadline", "author"],
            "{data}"
        );
        // The commit-search window is the default branch (the description
        // says so once): no per-response scope label.
        assert!(data.get("scope").is_none(), "{data}");
    }
    // A complete list states it (`hasMore:false`) as a search does; the
    // response stage hides a finished single page unless `echo` asks.
    for data in [&listed, &searched] {
        assert_eq!(data["pagination"]["hasMore"], false, "{data}");
        assert!(data["next"].get("nextPage").is_none(), "{data}");
    }
}

/// A commit listing pages by the provider's Link header: page 2's request
/// is the provider's page 2 at the same size, so it shares no row with
/// page 1, and the continuation carries the whole query.
#[tokio::test]
async fn commit_listing_page_two_is_the_providers_next_page() {
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param},
    };

    let server = MockServer::builder().start().await;
    let commit = |sha: &str| json!({"sha": sha, "commit": {"message": sha, "author": {"date": "2026-09-01T00:00:00Z"}}});
    for (page, shas, link) in [
        (
            "1",
            ["a1", "a2"],
            Some(format!(
                "<{}/api/v3/repos/o/r/commits?page=2&per_page=2>; rel=\"next\"",
                server.uri()
            )),
        ),
        ("2", ["b1", "b2"], None),
    ] {
        let mut response = ResponseTemplate::new(200).set_body_json(json!(
            shas.iter().map(|sha| commit(sha)).collect::<Vec<_>>()
        ));
        if let Some(link) = link {
            response = response.insert_header("link", link.as_str());
        }
        Mock::given(method("GET"))
            .and(path("/api/v3/repos/o/r/commits"))
            .and(query_param("page", page))
            .and(query_param("per_page", "2"))
            .and(query_param("path", "src"))
            .respond_with(response)
            .mount(&server)
            .await;
    }
    let transport = one_shot_provider(&server).transport;
    let first: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"commit","owner":"o","repo":"r","path":"src","pageSize":2,"since":"2026-01-01"
    }))
    .expect("query");
    let one = execute(&transport, &first, &default_context(), &Passthrough)
        .await
        .expect("page 1");
    let next = one["next"]["nextPage"]["query"]["queries"][0].clone();
    for key in ["owner", "repo", "path", "pageSize", "since"] {
        assert_eq!(
            next[key],
            serde_json::to_value(&first).expect("wire")[key],
            "{key}: {next}"
        );
    }
    assert_eq!(next["page"], 2, "{next}");
    let two = execute(
        &transport,
        &serde_json::from_value(next).expect("next query"),
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("page 2");
    let shas = |data: &Value| {
        data["commits"]
            .as_array()
            .expect("commits")
            .iter()
            .map(|row| row["commitSha"].as_str().unwrap_or_default().to_owned())
            .collect::<Vec<_>>()
    };
    assert_eq!(shas(&one), ["a1", "a2"]);
    assert_eq!(shas(&two), ["b1", "b2"]);
    assert!(two["next"].get("nextPage").is_none(), "{two}");
}

/// A cross-repository PR search names each row's repository as the
/// ghGetHistoryItem inputs (`owner`, `repo`); an owner-scoped search names
/// only `repo` (the owner is the query's own).
#[test]
fn cross_repository_rows_name_owner_and_repo() {
    let item = json!({"number": 3, "repository_url": "https://api.github.com/repos/acme/widget"});
    for ((owner, repo), expected) in [
        ((None, None), json!({"owner":"acme","repo":"widget"})),
        ((Some("Acme"), None), json!({"repo":"widget"})),
        (
            (Some("other"), None),
            json!({"owner":"acme","repo":"widget"}),
        ),
        ((Some("acme"), Some("widget")), json!({})),
    ] {
        let mut row = json!({});
        rows::name_repository(&mut row, &item, owner, repo);
        assert_eq!(row, expected, "{owner:?}/{repo:?}");
    }
}

/// A commit listing's bare 404 at a `ref` leads to the refs listing (the
/// one repair); without a ref the repository did not resolve.
#[tokio::test]
async fn a_missing_listing_scope_names_its_repair() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits",
        404,
        json!({"message": "Not Found"}),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let at_ref: GhSearchHistoryQuery =
        serde_json::from_value(json!({"operation":"commit","owner":"o","repo":"r","ref":"nope"}))
            .expect("query");
    let failure = super::execute(&transport, at_ref, &default_context(), &Passthrough)
        .await
        .expect_err("missing ref");
    assert!(failure.error.message.contains("\"nope\""), "{failure:?}");
    let next = failure.next.expect("refs lead");
    assert_eq!(next["viewRefs"]["tool"], "ghStructure", "{next}");
    assert_eq!(
        next["viewRefs"]["query"]["queries"][0]["operation"], "refs",
        "{next}"
    );

    let plain: GhSearchHistoryQuery =
        serde_json::from_value(json!({"operation":"commit","owner":"o","repo":"r"}))
            .expect("query");
    let failure = super::execute(&transport, plain, &default_context(), &Passthrough)
        .await
        .expect_err("missing repository");
    assert!(failure.next.is_none(), "{failure:?}");
    assert!(failure.error.message.contains("o/r"), "{failure:?}");
}

/// A page past the last one is out of range on a search (rows exist on
/// earlier pages: `totalItems` says so, and no rename lookup runs) and on a
/// REST list (an empty page after the first); the first page of a search with
/// no results is still just empty.
#[tokio::test]
async fn a_page_past_the_end_is_out_of_range_not_an_empty_search() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 12, "incomplete_results": false, "items": []}),
    )
    .await;
    mount_json(&server, "/api/v3/repos/o/r/commits", 200, json!([])).await;
    for (row, rows_key) in [
        (
            json!({"operation":"pullRequest","owner":"o","repo":"r","keywords":["fix"],
                "page":9,"pageSize":5}),
            "pullRequests",
        ),
        (
            json!({"operation":"issue","owner":"o","repo":"r","keywords":["fix"],
                "page":9,"pageSize":5}),
            "issues",
        ),
        (
            json!({"operation":"commit","owner":"o","repo":"r","page":9,"pageSize":5}),
            "commits",
        ),
    ] {
        let query = serde_json::from_value(row).expect("query");
        let data = execute(
            &one_shot_provider(&server).transport,
            &query,
            &default_context(),
            &Passthrough,
        )
        .await
        .expect("page past the end");
        assert_eq!(data["pagination"]["outOfRange"], true, "{data}");
        assert_eq!(data["status"], "empty", "{data}");
        assert_eq!(data[rows_key], json!([]), "{data}");
        assert!(data["next"].get("broadenSearch").is_none(), "{data}");
        assert!(data.get("warnings").is_none(), "no rename lookup: {data}");
    }
}

/// `totalPages` appears only beside an exact total: an uncapped search
/// count states it; a count past GitHub's 1,000-result window states the
/// reachable `totalItems` and `partialReasons:["providerResultCap"]`, no
/// page count.
#[tokio::test]
async fn total_pages_appear_only_beside_an_exact_total() {
    use wiremock::MockServer;
    for (total_count, total_pages) in [(30, Some(3)), (5_000, None)] {
        let server = MockServer::builder().start().await;
        let items = (1..=10)
            .map(|number| {
                json!({"number": number, "title": "t", "state": "open",
                "pull_request": {"merged_at": null}})
            })
            .collect::<Vec<_>>();
        mount_json(
            &server,
            "/api/v3/search/issues",
            200,
            json!({"total_count": total_count, "incomplete_results": false, "items": items}),
        )
        .await;
        let transport = one_shot_provider(&server).transport;
        let query =
            serde_json::from_value(json!({"operation":"pullRequest","owner":"o","repo":"r",
            "keywords":["x"],"pageSize":10}))
            .expect("query");
        let data = execute(&transport, &query, &default_context(), &Passthrough)
            .await
            .expect("pull request search");
        assert_eq!(
            data["pagination"].get("totalPages").and_then(Value::as_u64),
            total_pages,
            "{data}"
        );
        if total_pages.is_none() {
            assert_eq!(data["pagination"]["totalItems"], 1000, "{data}");
            assert_eq!(
                data["partialReasons"],
                json!(["providerResultCap"]),
                "{data}"
            );
        }
    }
}

/// Closed-but-unmerged pull requests are a GitHub search filter
/// (`is:unmerged`, or `-is:merged`): both run on the search route as
/// `is:unmerged`, beside a `state`; issues have no merge state.
#[test]
fn unmerged_pull_requests_are_a_search_filter() {
    let typed = |operation: &str, state: Option<&str>, qualifiers: &str| {
        let mut row = json!({"operation":operation,"owner":"o","repo":"r","qualifiers":qualifiers});
        if let Some(state) = state {
            row["state"] = json!(state);
        }
        let prepared = crate::contracts::validate_query("ghSearchHistory", row).expect(qualifiers);
        serde_json::from_value::<GhSearchHistoryQuery>(prepared).expect("typed")
    };
    for (state, qualifiers) in [(Some("closed"), "is:unmerged"), (None, "-is:merged")] {
        let query = typed("pullRequest", state, qualifiers);
        let filters = Filters::parse(&query).expect(qualifiers);
        assert_eq!(filters.unmerged, Some(true), "{qualifiers}");
        let terms = build_query(&query).expect(qualifiers);
        assert!(terms.contains("is:unmerged"), "{qualifiers}: {terms}");
        assert_eq!(
            terms.contains("is:closed"),
            state.is_some(),
            "{qualifiers}: {terms}"
        );
        assert!(!terms.contains("-is:merged"), "{qualifiers}: {terms}");
        assert!(should_use_search_for_prs(&query), "{qualifiers}");
    }
    let issue = Filters::parse(&typed("issue", None, "is:unmerged")).expect_err("issues");
    assert!(issue.message.contains("is not supported"), "{issue:?}");
}

/// A REST list page states no total and says nothing more about it: the
/// missing `totalItems` beside `hasMore` is the per-call fact.
#[tokio::test]
async fn a_rest_list_page_with_more_carries_no_static_total_warning() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::builder().start().await;
    let link = |route: &str| {
        format!(
            "<{}/api/v3/repos/o/r/{route}?per_page=1&page=2>; rel=\"next\"",
            server.uri()
        )
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/commits"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("link", link("commits").as_str())
                .set_body_json(json!([{"sha": "aaa", "commit": {"message": "Fix",
                    "author": {"name": "Dev", "date": "2026-01-01T00:00:00Z"}}}])),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/pulls"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("link", link("pulls").as_str())
                .set_body_json(json!([{"number": 4, "title": "Fix", "state": "open",
                    "user": {"login": "dev"}, "created_at": "2026-01-01T00:00:00Z"}])),
        )
        .mount(&server)
        .await;
    for row in [
        json!({"operation":"commit","owner":"o","repo":"r","pageSize":1}),
        json!({"operation":"pullRequest","owner":"o","repo":"r","pageSize":1}),
    ] {
        let query = serde_json::from_value(row.clone()).expect("query");
        let data = execute(
            &one_shot_provider(&server).transport,
            &query,
            &default_context(),
            &Passthrough,
        )
        .await
        .expect("listing");
        assert_eq!(data["pagination"]["hasMore"], true, "{data}");
        assert!(data["pagination"].get("totalItems").is_none(), "{data}");
        assert!(data.get("warnings").is_none(), "{row}: {data}");
    }
}

/// A page past GitHub's 1,000-result window leads to the last reachable
/// page (`repair`), so the row never falls back to a generic hint.
#[tokio::test]
async fn a_page_past_the_search_window_leads_to_the_last_reachable_page() {
    use octocode_github::ProviderErrorReason;
    let server = wiremock::MockServer::builder().start().await;
    let query: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"pullRequest","owner":"o","repo":"r","keywords":["fix"],
        "page":11,"pageSize":100
    }))
    .expect("query");
    let failure = super::execute(
        &one_shot_provider(&server).transport,
        query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect_err("past the window");
    assert_eq!(
        failure.error.reason,
        Some(ProviderErrorReason::SearchWindowExceeded)
    );
    let next = failure.next.expect("a repair lead");
    let repair = &next["repair"];
    assert_eq!(repair["tool"], "ghSearchHistory", "{next}");
    let row = &repair["query"]["queries"][0];
    assert_eq!(row["page"], 10, "{next}");
    assert_eq!(row["keywords"], json!(["fix"]), "{next}");
}

/// A capped search names one narrowing lead per call: a newest-first
/// result continues past the window from its last row's date (`until`);
/// any other order is first re-sorted newest-first, which that keyset
/// continuation then follows.
#[tokio::test]
async fn a_capped_search_names_one_narrowing_lead() {
    use wiremock::MockServer;

    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/search/issues",
        200,
        json!({"total_count": 4000, "incomplete_results": false, "items": [
            {"number": 9, "title": "a", "state": "open", "user": {"login": "dev"},
                "created_at": "2026-03-02T10:00:00Z"},
            {"number": 8, "title": "b", "state": "open", "user": {"login": "dev"},
                "created_at": "2026-03-01T09:30:00+02:00"}
        ]}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/search/commits",
        200,
        json!({"total_count": 4000, "incomplete_results": false, "items": [
            {"sha": "c1", "commit": {"message": "fix a",
                "committer": {"date": "2026-02-02T00:00:00Z"}}},
            {"sha": "c2", "commit": {"message": "fix b",
                "committer": {"date": "2026-02-01T12:00:00Z"}}}
        ]}),
    )
    .await;
    let transport = one_shot_provider(&server).transport;
    let lead = |row: Value| {
        let transport = &transport;
        async move {
            let query: GhSearchHistoryQuery = serde_json::from_value(row).expect("query");
            let data = execute(transport, &query, &default_context(), &Passthrough)
                .await
                .expect("capped search");
            assert_eq!(
                data["partialReasons"],
                json!(["providerResultCap"]),
                "{data}"
            );
            let lead = data["next"]["narrowScope"].clone();
            assert_eq!(lead["tool"], "ghSearchHistory", "{data}");
            let rows = lead["query"]["queries"].as_array().expect("rows").clone();
            assert_eq!(rows.len(), 1, "{lead}");
            crate::contracts::validate("ghSearchHistory", json!({"queries": rows.clone()}))
                .expect("the lead is a valid call");
            rows[0].clone()
        }
    };
    // Newest first: the window continues before the page's last row.
    let row = lead(json!({"operation":"pullRequest","owner":"o","repo":"r",
        "keywords":["fix"],"sort":"created:desc","since":"2025-01-01","pageSize":2,"page":3}))
    .await;
    assert_eq!(row["until"], "2026-03-01T07:30:00Z", "{row}");
    assert_eq!(row["since"], "2025-01-01", "{row}");
    assert!(row.get("page").is_none(), "{row}");
    let row = lead(json!({"operation":"commit","owner":"o","repo":"r",
        "keywords":["fix"],"pageSize":2}))
    .await;
    assert_eq!(row["until"], "2026-02-01T12:00:00Z", "{row}");
    // Best match: re-sort newest first.
    let row = lead(json!({"operation":"issue","owner":"o","repo":"r",
        "keywords":["fix"],"pageSize":2}))
    .await;
    assert_eq!(row["sort"], "created:desc", "{row}");
    assert!(row.get("until").is_none(), "{row}");
}

/// Without its person qualifiers a search may name nothing else: no lead
/// then, never an all-of-GitHub search.
#[test]
fn without_users_never_leads_to_an_unscoped_search() {
    let unscoped: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"pullRequest","qualifiers":"author:ghost","pageSize":2
    }))
    .expect("query");
    assert!(super::leads::without_users(&unscoped).is_none());
    let scoped: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"pullRequest","owner":"o","qualifiers":"author:ghost"
    }))
    .expect("query");
    let lead = super::leads::without_users(&scoped).expect("an owner-scoped lead");
    assert_eq!(lead["query"]["queries"][0]["owner"], "o", "{lead}");
}

/// A missing login's failure states GitHub's words and the `withoutUsers`
/// repair; no hint restates that the login does not resolve.
#[test]
fn a_missing_login_has_no_restating_hint() {
    use octocode_github::ProviderErrorReason;
    let error = ProviderError::new(ProviderErrorKind::NotFound, "no user named \"ghost\"")
        .with_reason(ProviderErrorReason::UserNotFound);
    let (message, hint) = history_failure(&error, true);
    assert!(message.contains("ghost"), "{message}");
    assert_eq!(hint, None);
}

/// A commit listing of a renamed repository (GitHub answers the old name
/// with a redirect) warns once and continues under the canonical name, as
/// the pull-request search does.
#[tokio::test]
async fn a_commit_listing_of_a_renamed_repository_names_the_canonical_repository() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/old/r/commits"))
        .respond_with(ResponseTemplate::new(301).insert_header(
            "location",
            format!(
                "{}/api/v3/repositories/1/commits?per_page=1&page=1",
                server.uri()
            ),
        ))
        .mount(&server)
        .await;
    let next = format!(
        "{}/api/v3/repositories/1/commits?per_page=1&page=2",
        server.uri()
    );
    Mock::given(method("GET"))
        .and(path("/api/v3/repositories/1/commits"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("link", format!("<{next}>; rel=\"next\"").as_str())
                .set_body_json(json!([{"sha": "aaa", "commit": {"message": "Fix",
                    "committer": {"date": "2026-01-01T00:00:00Z"}}}])),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/old/r"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"default_branch": "main", "full_name": "new/r"})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let query: GhSearchHistoryQuery = serde_json::from_value(json!({
        "operation":"commit","owner":"old","repo":"r","pageSize":1
    }))
    .expect("query");
    let data = execute(
        &one_shot_provider(&server).transport,
        &query,
        &default_context(),
        &Passthrough,
    )
    .await
    .expect("renamed listing");
    assert_eq!(data["commits"][0]["commitSha"], "aaa", "{data}");
    assert_eq!(
        data["warnings"],
        json!([crate::tools::gh_shared::renamed_warning(
            "old",
            "r",
            &("new".into(), "r".into())
        )]),
        "{data}"
    );
    let next = &data["next"]["nextPage"]["query"]["queries"][0];
    assert_eq!(
        (&next["owner"], &next["repo"]),
        (&json!("new"), &json!("r")),
        "{data}"
    );
    let read = &data["next"]["readCommit"]["query"]["queries"][0];
    assert_eq!(read["owner"], "new", "{data}");
}

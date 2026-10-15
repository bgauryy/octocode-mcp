//! Provider-backed tests of the GitHub search tools (ghSearchCode,
//! ghSearchRepo, ghStructure) against one mock server, plus the shared
//! paging helpers.
use super::*;
use crate::contracts::tool_types::{GhSearchCodeQuery, GhSearchRepoQuery};

#[test]
fn owner_listing_page_ceiling_keeps_rows_and_discloses_remaining_results() {
    let query: GhSearchRepoQuery = serde_json::from_value(
        json!({"owner":"o","page":1000,"mainGoal":"test","reasoning":"test"}),
    )
    .expect("query");
    let mut page = json!({"repositories":[{"repo":"o/r"}],"pagination":{"hasMore":true}});
    add_next(&mut page, ToolId::GhSearchRepo, &query, 1000, true);
    assert_eq!(page["repositories"].as_array().expect("rows").len(), 1);
    assert!(page.get("next").is_none(), "{page}");
    assert_eq!(page["terminalLimit"], true, "{page}");
    let mut earlier = json!({"repositories":[],"pagination":{"hasMore":true}});
    add_next(&mut earlier, ToolId::GhSearchRepo, &query, 999, true);
    assert_eq!(
        earlier["next"]["nextPage"]["query"]["queries"][0]["page"],
        1000
    );
    assert!(earlier.get("terminalLimit").is_none());
}

#[test]
fn search_window_is_rejected_past_the_thousandth_result() {
    assert!(reject_window(11, 100).is_err());
    assert!(reject_window(10, 100).is_ok());
}

#[test]
fn incomplete_and_cap_are_losslessly_typed() {
    let query = serde_json::from_str::<GhSearchCodeQuery>(
            r#"{"mainGoal":"test","reasoning":"test","owner":"o","keywords":["x"],"page":10,"pageSize":100}"#,
        )
        .expect("GitHub search test data should be valid");
    let mut value = json!({"pagination":{"hasMore":false}});
    apply_partial(
        &mut value,
        &query,
        &SearchCompleteness {
            tool: ToolId::GhSearchCode,
            matched: 5_000,
            incomplete: true,
            page: 10,
            has_more: false,
            subject: "code",
        },
    );
    assert_eq!(value["terminalLimit"], true);
    // `partialReasons` names the cap and `pagination.totalItems` its
    // size: no `providerLimit` restates them.
    assert!(value.get("providerLimit").is_none(), "{value}");
    assert_eq!(
        value["partialReasons"],
        json!(["providerResultCap", "providerIncompleteResults"])
    );
    assert_eq!(value["next"]["retry"]["query"]["queries"][0]["page"], 10);
}

mod provider_backed;

/// Recovery leads never repeat a traversal the caller sent: `.` and `..`
/// resolve lexically and clamp at the repository root.
#[test]
fn recovery_paths_resolve_traversal_inside_the_repository() {
    assert_eq!(super::repo_path("../../../../user"), "user");
    assert_eq!(super::repo_path("src/./a/../b.rs"), "src/b.rs");
    assert_eq!(super::repo_path("../.."), ".");
    assert_eq!(super::repo_path("/docs/"), "docs");
    assert_eq!(super::parent_dir("../../../../user"), ".");
    assert_eq!(super::parent_dir("a/../b/c.md"), "b");
}

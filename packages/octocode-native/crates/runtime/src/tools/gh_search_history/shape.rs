//! The response for one page: rows, pagination, leads, warnings and the
//! partial state.
use super::{HistoryOperation, HistorySearch, leads, rows};
use crate::providers::github::HistoryPage;
use crate::tools::gh_shared::{SEARCH_RESULT_CAP, SearchReach, pick_rows};
use crate::tools::paging::push_warnings;
use crate::tools::result::remove_null_fields;
use serde_json::{Value, json};

/// Where a page sits in the result.
pub(super) struct Paging {
    page: usize,
    per: usize,
    /// The page the provider answered (a REST list may differ).
    current: usize,
    more: bool,
    /// The reachable total (search caps it).
    total: usize,
    /// The provider total exceeds the reachable total.
    capped: bool,
    /// The provider's own match count (a search's `total_count`).
    matched: usize,
    /// A complete one-page REST list counts its rows exactly.
    exact_list_total: Option<usize>,
    listed: bool,
    incomplete: bool,
    /// The page lies past the last one: no rows, though the search has some
    /// (or the list has an earlier page).
    past_end: bool,
}

impl Paging {
    pub(super) fn new(result: &HistoryPage, page: usize, per: usize) -> Self {
        // A REST list has no search window and states no total.
        let reach = if result.listed {
            SearchReach::new(0, per)
        } else {
            SearchReach::new(result.total_count, per)
        };
        let current = if result.listed {
            result.provider_page
        } else {
            page
        };
        let more = if result.listed {
            result.has_more
        } else {
            current < reach.pages
        };
        Self {
            page,
            per,
            current,
            more,
            total: reach.total,
            capped: reach.capped,
            matched: result.total_count,
            exact_list_total: (result.listed && current == 1 && !more)
                .then_some(result.items.len()),
            listed: result.listed,
            incomplete: result.incomplete_results,
            past_end: result.items.is_empty()
                && page > 1
                && (result.listed || reach.past_last(page)),
        }
    }
    /// The total a page reports: the search total, or an exact list count.
    fn reported_total(&self) -> Option<usize> {
        if self.listed {
            self.exact_list_total
        } else {
            Some(self.total)
        }
    }
    /// The total when it is exact: an uncapped, complete search count or an
    /// exact list count. A capped or incomplete count is no page count.
    fn exact_total(&self) -> Option<usize> {
        if self.listed {
            self.exact_list_total
        } else {
            (!self.capped && !self.incomplete).then_some(self.total)
        }
    }
    /// The page facts; `totalPages` only beside an exact total (a capped
    /// one states `partialReasons:["providerResultCap"]` instead).
    fn pagination(&self, current: usize) -> Value {
        let facts = crate::response::pages::PageFacts::open(current, Some(self.per), self.more)
            .out_of_range(self.past_end);
        let facts = match self.exact_total() {
            Some(total) => facts.with_total(total),
            None => facts,
        };
        let mut page = facts.to_value();
        if self.more {
            page["nextPage"] = json!(current + 1);
        }
        page
    }
}

/// The response for one page.
pub(super) fn shape(
    query: &HistorySearch,
    result: HistoryPage,
    paging: &Paging,
    terms: String,
) -> Value {
    let HistoryPage {
        items, warnings, ..
    } = result;
    let mut value = match query.operation() {
        HistoryOperation::PullRequest => pull_requests(query, &items, paging, terms),
        HistoryOperation::Issue => issues(query, &items, paging, terms),
        HistoryOperation::Commit => commits(query, items, paging),
    };
    if query.operation() == HistoryOperation::Commit
        && let Some(sha) = value
            .pointer("/commits/0/commitSha")
            .and_then(Value::as_str)
        && let Some(read) = leads::read_commit(query, sha)
    {
        value["next"]["readCommit"] = read;
    }
    if let Some(rows) = value.get("commits").and_then(Value::as_array)
        && let Some(read) = leads::read_commit_pull_request(query, rows)
    {
        value["next"]["readPullRequest"] = read;
    }
    if !warnings.is_empty() {
        value["warnings"] = json!(warnings);
    }
    // A REST list has no total (a search has): say why the first page of a
    // longer list shows none, so a caller pages on instead of waiting for one.
    if paging.listed && paging.more && paging.current == 1 {
        push_warnings(
            &mut value,
            ["GitHub's commit list gives no total, so pagination has no totalItems: page until hasMore is false.".to_owned()],
        );
    }
    if query.operation() == HistoryOperation::Issue
        && !paging.more
        && !paging.past_end
        && let Some(map) = value.as_object_mut()
    {
        map.remove("pagination");
    }
    let next_page = paging.more.then(|| {
        crate::tools::paging::next_cursor(
            &mut value,
            crate::tools::id::ToolId::GhSearchHistory,
            None,
            "page",
            paging.current + 1,
        )
    });
    if let Some(next_page) = next_page.flatten() {
        if query.operation() == HistoryOperation::Commit {
            value["pagination"]["nextPage"] = json!(next_page);
        }
        value["next"]["nextPage"] = leads::next_page(query, next_page, paging.per);
    }
    remove_null_fields(&mut value);
    mark_empty(&mut value, paging.more);
    // A page past the end is restarted by the shared response stage, not
    // broadened: the search has results.
    if value["status"] == "empty"
        && !paging.past_end
        && let Some(lead) = leads::broaden_search(query)
    {
        value["next"]["broadenSearch"] = lead;
    }
    mark_partial(&mut value, paging);
    value
}

/// Whether pull-request rows keep `createdAt` beside `mergedAt`: when they
/// are sorted by creation, or filtered on it (`since`/`until` set the
/// `created:` window, or a `created:` qualifier).
pub(super) fn keeps_created(query: &HistorySearch) -> bool {
    query.sort().as_deref() == Some("created")
        || query.since().is_some()
        || query.until().is_some()
        || query
            .qualifiers()
            .is_some_and(|qualifiers| qualifiers.contains("created:"))
}

fn pull_requests(query: &HistorySearch, items: &[Value], paging: &Paging, terms: String) -> Value {
    let fields = query.fields();
    let state = query.state();
    let keep_created = keeps_created(query);
    let rows = items
        .iter()
        .map(|item| {
            let mut row = rows::map_pr(item.clone());
            rows::drop_implied(&mut row, state.as_deref(), keep_created, &fields);
            rows::name_repository(&mut row, item, query.owner(), query.repo());
            row
        })
        .collect::<Vec<_>>();
    let mut v = json!({"pullRequests":rows,"effectiveQuery":terms,
        "pagination":paging.pagination(paging.current)});
    pick_rows(
        &mut v,
        "pullRequests",
        &["number", "owner", "repo"],
        &fields,
    );
    // An exact total states totalPages (see `Paging::pagination`); a capped
    // total is `partialReasons:["providerResultCap"]`, not a second flag.
    if !paging.listed {
        v["pagination"]["totalItems"] = json!(paging.total);
    } else if let Some(total) = paging.exact_list_total {
        v["pagination"]["totalItems"] = json!(total);
    }
    // List mode runs the REST endpoint, not the search terms.
    if paging.listed
        && let Some(map) = v.as_object_mut()
    {
        map.remove("effectiveQuery");
    }
    if let Some(read) = leads::read_pull_request(query, items) {
        v["next"]["readPullRequest"] = read;
    }
    if let Some(read) = leads::issue_links_read(query) {
        v["next"]["readIssueLinks"] = read;
    }
    v
}

fn issues(query: &HistorySearch, items: &[Value], paging: &Paging, terms: String) -> Value {
    let by_update = query.sort().as_deref() == Some("updated");
    let fields = query.fields();
    let state = query.state();
    let issues = items
        .iter()
        .map(|item| {
            let mut row = rows::map_issue(item.clone(), by_update);
            rows::drop_implied(&mut row, state.as_deref(), true, &fields);
            row
        })
        .collect::<Vec<_>>();
    // The rows' repository is the query's own owner/repo: not echoed.
    let mut v = json!({"issues":issues,
        "effectiveQuery":terms,"pagination":paging.pagination(paging.current)});
    pick_rows(&mut v, "issues", &["number"], &fields);
    if let Some(total) = paging.reported_total() {
        v["pagination"]["totalItems"] = json!(total);
    }
    // List mode runs the REST endpoint, not the search terms.
    if paging.listed
        && let Some(map) = v.as_object_mut()
    {
        map.remove("effectiveQuery");
    }
    if let Some(read) = leads::read_issue(query, items) {
        v["next"]["readIssue"] = read;
    }
    v
}

fn commits(query: &HistorySearch, items: Vec<Value>, paging: &Paging) -> Value {
    let fields = query.fields();
    if query.keywords().is_empty() {
        let commits = items
            .into_iter()
            .map(rows::map_commit_list)
            .collect::<Vec<_>>();
        let mut v = json!({"commits":commits});
        pick_rows(&mut v, "commits", &["commitSha"], &fields);
        // `shape` adds the reachable `nextPage`. A complete list says so too
        // (`hasMore:false`): the REST list has no total, so a missing block
        // would leave the end of the history unstated.
        v["pagination"] =
            crate::response::pages::PageFacts::open(paging.page, Some(paging.per), paging.more)
                .out_of_range(paging.past_end)
                .to_value();
        return v;
    }
    let commits = items.into_iter().map(rows::map_commit).collect::<Vec<_>>();
    let mut facts =
        crate::response::pages::PageFacts::open(paging.page, Some(paging.per), paging.more)
            .out_of_range(paging.past_end);
    if let Some(total) = paging.reported_total() {
        facts = facts.with_items(total);
    }
    let mut v = json!({"commits":commits,"pagination":facts.to_value()});
    pick_rows(&mut v, "commits", &["commitSha"], &fields);
    v
}

/// A complete page with no rows is empty, so the shared fallback hint fires.
pub(super) fn mark_empty(value: &mut Value, more: bool) {
    let rows = ["pullRequests", "issues", "commits"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array));
    if !more && rows.is_some_and(Vec::is_empty) {
        value["status"] = json!("empty");
    }
}

/// A capped or incomplete search is partial; the cap gets a partition tip
/// (success rows keep warnings; hints are reserved for empty/error rows).
fn mark_partial(value: &mut Value, paging: &Paging) {
    if !paging.incomplete && !paging.capped {
        return;
    }
    let reason = if paging.capped {
        "providerResultCap"
    } else {
        "providerIncompleteResults"
    };
    if paging.more {
        crate::tools::paging::mark_partial(value, reason, &[]);
    } else {
        crate::tools::paging::terminal_limit(value, reason, &[]);
    }
    if paging.capped {
        // The reachable `totalItems` is not the match count: state GitHub's.
        push_warnings(
            value,
            [format!(
                "GitHub matched {} results; the first {SEARCH_RESULT_CAP} are reachable.",
                paging.matched
            )],
        );
    }
}

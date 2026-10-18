//! Continuations: the read of a likely row, the next page, and the
//! recovery from an empty search.
use super::rows::{is_completed, is_merged, item_number, item_repo, read_target};
use super::{GhSearchHistoryQuery, HistorySearch};
use crate::tools::gh_shared::{Broaden, broaden};
use crate::tools::id::ToolId;
use crate::tools::result::{Continuation, query_row};
use serde_json::{Value, json};

/// The default PR read: body and the patch-free file inventory.
pub(super) fn pr_read_query(owner: &str, repo: &str, number: u64) -> Value {
    json!({"operation":"pullRequest","owner":owner,"repo":repo,"number":number,
        "sections":["body","files"]})
}

/// The issue body and discussion.
pub(super) fn issue_read_query(owner: &str, repo: &str, number: u64) -> Value {
    json!({"operation":"issue","owner":owner,"repo":repo,"number":number,
        "sections":["body","comments"]})
}

/// Rows in GitHub's relevance order: a keyword search without an explicit
/// sort. Any other order (a sort, a REST listing) says nothing about fit.
fn best_match_order(q: &GhSearchHistoryQuery) -> bool {
    !q.keywords().is_empty() && q.sort().is_none_or(|sort| sort == "best-match")
}

/// The PR read: the best match (row 0) of a relevance-ordered search, else
/// a merged row as the likely fix (the rows name every other readable
/// number; the read takes any).
pub(super) fn read_pull_request(q: &GhSearchHistoryQuery, items: &[Value]) -> Option<Value> {
    let prefer: fn(&Value) -> bool = if best_match_order(q) {
        |_| true
    } else {
        is_merged
    };
    let target = read_target(items, prefer)?;
    let (owner, repo) = q
        .owner()
        .zip(q.repo())
        .map(|(owner, repo)| (owner.to_owned(), repo.to_owned()))
        .or_else(|| item_repo(&items[target]))?;
    let number = item_number(&items[target])?;
    Some(
        Continuation::new(
            ToolId::GhGetHistoryItem,
            pr_read_query(&owner, &repo, number),
        )
        .confidence(if is_merged(&items[target]) {
            "medium"
        } else {
            "low"
        })
        .build(),
    )
}

/// The PR a commit row's `(#N)` headline names: the first such row's read,
/// scoped to the listed path (any other row's `(#N)` runs the same read).
pub(super) fn read_commit_pull_request(q: &GhSearchHistoryQuery, rows: &[Value]) -> Option<Value> {
    let (owner, repo) = q.owner().zip(q.repo())?;
    let number = rows.iter().find_map(|row| {
        row.get("messageHeadline")
            .and_then(Value::as_str)
            .and_then(crate::tools::gh_shared::commit::headline_pull_request)
    })?;
    let mut read = pr_read_query(owner, repo, number);
    if let Some(path) = q.path() {
        read["include"] = json!([path]);
    }
    Some(
        Continuation::new(ToolId::GhGetHistoryItem, read)
            .confidence("high")
            .build(),
    )
}

/// The issue read: a completed issue first.
pub(super) fn read_issue(q: &GhSearchHistoryQuery, items: &[Value]) -> Option<Value> {
    let target = read_target(items, is_completed)?;
    let (owner, repo) = q.owner().zip(q.repo())?;
    let number = item_number(&items[target])?;
    Some(
        Continuation::new(
            ToolId::GhGetHistoryItem,
            issue_read_query(owner, repo, number),
        )
        .confidence("low")
        .build(),
    )
}

/// The first commit's patches, scoped to the listed path in the read's
/// published `include`; the read takes any row's sha as `ref`.
pub(super) fn read_commit(q: &GhSearchHistoryQuery, sha: &str) -> Option<Value> {
    let (owner, repo) = q.owner().zip(q.repo())?;
    let mut read = json!({
        "operation":"commit","owner":owner,"repo":repo,"ref":sha,"sections":["patches"]
    });
    if let Some(path) = q.path() {
        read["include"] = json!([path]);
    }
    Some(
        Continuation::new(ToolId::GhGetHistoryItem, read)
            .confidence("low")
            .build(),
    )
}

/// A PR search whose keywords are one bare issue number (`13786`, `#13786`)
/// is an issue → fix-PR hop: the issue read lists the PRs that closed it.
pub(super) fn issue_links_read(q: &GhSearchHistoryQuery) -> Option<Value> {
    let (owner, repo) = q.owner().zip(q.repo())?;
    let [keyword] = q.keywords()[..] else {
        return None;
    };
    let number = keyword
        .trim()
        .trim_start_matches('#')
        .parse::<u64>()
        .ok()
        .filter(|n| *n > 0)?;
    Some(
        Continuation::new(
            ToolId::GhGetHistoryItem,
            json!({"operation":"issue","owner":owner,"repo":repo,"number":number}),
        )
        .confidence("high")
        .build(),
    )
}

/// The same query as a wire row without `page`, the base of every
/// same-tool continuation.
fn same_query(q: &GhSearchHistoryQuery) -> Value {
    query_row(q, &["page"])
}

/// The search again without its person qualifiers: the way on when GitHub
/// cannot find a login they name (`None` when the query names none, or
/// when nothing would scope the search without them: no owner, repository,
/// keyword or other qualifier).
pub(super) fn without_users(q: &GhSearchHistoryQuery) -> Option<Value> {
    let qualifiers = q.qualifiers()?;
    let kept = super::filters::without_person_terms(qualifiers);
    if kept == qualifiers.split_whitespace().collect::<Vec<_>>().join(" ") {
        return None;
    }
    if kept.is_empty() && q.owner().is_none() && q.repo().is_none() && q.keywords().is_empty() {
        return None;
    }
    let mut row = same_query(q);
    if kept.is_empty() {
        row.as_object_mut()?.remove("qualifiers");
    } else {
        row["qualifiers"] = json!(kept);
    }
    Some(
        Continuation::new(ToolId::GhSearchHistory, row)
            .confidence("medium")
            .build(),
    )
}

/// Result page `page` (the cursor [`crate::tools::paging::next_cursor`]
/// admitted), at the page size this one used.
pub(super) fn next_page(q: &GhSearchHistoryQuery, page: usize, page_size: usize) -> Value {
    let mut next = same_query(q);
    next["page"] = json!(page);
    next["pageSize"] = json!(page_size);
    Continuation::new(ToolId::GhSearchHistory, next)
        .confidence("exact")
        .build()
}

/// Broadened variants at most: one call's batch.
const BROADEN_VARIANTS: usize = 5;

/// An empty search, broadened ([`broaden`]): `qualifiers` and the
/// `since`/`until` window drop whole, then the keywords one at a time.
pub(super) fn broaden_search(q: &GhSearchHistoryQuery) -> Option<Value> {
    broaden(
        ToolId::GhSearchHistory,
        &query_row(q, &[]),
        &Broaden {
            strip: &[],
            groups: &[&["qualifiers"], &["since", "until"]],
        },
        BROADEN_VARIANTS,
    )
}

/// A capped search's narrowing (`narrowScope`), one call. Rows in a date
/// order continue past GitHub's 1,000-result window from this page's last
/// row: creation order through the query's own window (newest first sets
/// `until`, oldest first `since`), update order through an `updated:`
/// qualifier. A row at that instant may show again; none is skipped. An
/// order with no date to resume from (best match, comments, reactions), or
/// an update order whose `updated:` qualifier owns the window, is re-sorted
/// newest first, whose pages end in that continuation. `None` when a
/// `created:` qualifier owns a creation-ordered window or no row is dated.
pub(super) fn narrow_capped(q: &HistorySearch, items: &[Value]) -> Option<Value> {
    let (sort, order) = super::query::search_order(q);
    let newest_first = order.as_deref() != Some("asc");
    let last = |pointers: &[&str]| {
        items.iter().rev().find_map(|item| {
            pointers
                .iter()
                .find_map(|pointer| item.pointer(pointer))
                .and_then(Value::as_str)
                .map(|date| crate::tools::gh_shared::commit::utc_date(Some(date)))
        })
    };
    let mut row = same_query(q);
    let resumed = match sort.as_deref() {
        Some("committer-date") => {
            row["until"] = json!(last(&["/commit/committer/date", "/commit/author/date"])?);
            true
        }
        Some("created") => {
            if q.filters().created.is_some() {
                return None;
            }
            let bound = if newest_first { "until" } else { "since" };
            row[bound] = json!(last(&["/created_at"])?);
            true
        }
        Some("updated") if q.filters().updated.is_none() => {
            let date = last(&["/updated_at"])?;
            let bound = if newest_first { "<=" } else { ">=" };
            let term = format!("updated:{bound}{date}");
            row["qualifiers"] = json!(match q.qualifiers() {
                Some(qualifiers) => format!("{} {term}", qualifiers.trim()),
                None => term,
            });
            true
        }
        _ => {
            row["sort"] = json!("created:desc");
            false
        }
    };
    crate::contracts::validate(
        ToolId::GhSearchHistory.as_str(),
        json!({ "queries": [row] }),
    )
    .ok()?;
    Some(
        Continuation::new(ToolId::GhSearchHistory, row)
            .confidence(if resumed { "exact" } else { "medium" })
            .build(),
    )
}

//! Continuations: the read of a likely row, the next page, and the
//! recovery from an empty search.
use super::GhSearchHistoryQuery;
use super::rows::{is_completed, is_merged, item_number, item_repo, read_target};
use crate::tools::id::ToolId;
use crate::tools::result::{Continuation, remove_null_fields};
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
    let mut row = serde_json::to_value(q).unwrap_or_default();
    remove_null_fields(&mut row);
    if let Some(row) = row.as_object_mut() {
        row.remove("page");
    }
    row
}

/// The search again without its person qualifiers: the way on when GitHub
/// cannot find a login they name (`None` when the query names none).
pub(super) fn without_users(q: &GhSearchHistoryQuery) -> Option<Value> {
    let qualifiers = q.qualifiers()?;
    let kept = super::filters::without_person_terms(qualifiers);
    if kept == qualifiers.split_whitespace().collect::<Vec<_>>().join(" ") {
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

/// The next result page, at the page size this one used.
pub(super) fn next_page(q: &GhSearchHistoryQuery, page: usize, page_size: usize) -> Value {
    let mut next = same_query(q);
    next["page"] = json!(page + 1);
    next["pageSize"] = json!(page_size);
    Continuation::new(ToolId::GhSearchHistory, next)
        .confidence("exact")
        .build()
}

/// Broadened variants at most: one call's batch.
const BROADEN_VARIANTS: usize = 5;

/// An empty search, broadened: one variant per narrowing filter, run as one
/// batch, so the variant that returns rows names the filter that emptied
/// the search. Several keywords drop one at a time (the last first: the
/// first usually names the subject); a repository-scoped search drops a
/// lone keyword; `qualifiers` and the `since`/`until` window drop whole.
pub(super) fn broaden_search(q: &GhSearchHistoryQuery) -> Option<Value> {
    let base = same_query(q);
    let without = |keys: &[&str]| {
        let mut row = base.clone();
        if let Some(object) = row.as_object_mut() {
            for key in keys {
                object.remove(*key);
            }
        }
        row
    };
    let keywords = q.keywords();
    let mut variants = Vec::new();
    if keywords.len() >= 2 {
        variants.extend((0..keywords.len()).rev().map(|dropped| {
            let mut row = base.clone();
            row["keywords"] = json!(
                keywords
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| *index != dropped)
                    .map(|(_, keyword)| *keyword)
                    .collect::<Vec<_>>()
            );
            row
        }));
    } else if !keywords.is_empty() && q.owner().is_some() && q.repo().is_some() {
        variants.push(without(&["keywords"]));
    }
    if q.qualifiers().is_some() {
        variants.push(without(&["qualifiers"]));
    }
    if q.since().is_some() || q.until().is_some() {
        variants.push(without(&["since", "until"]));
    }
    variants.truncate(BROADEN_VARIANTS);
    (!variants.is_empty()).then(|| {
        Continuation::input(ToolId::GhSearchHistory, json!({ "queries": variants }))
            .confidence("low")
            .build()
    })
}

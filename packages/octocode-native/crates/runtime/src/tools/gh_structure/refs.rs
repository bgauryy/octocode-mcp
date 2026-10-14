//! `operation:"refs"` (branches and tags) and `operation:"languages"`.
use super::*;
use crate::contracts::tool_types::ExtraKind;
use crate::contracts::tool_types::GhStructureQueryOperation;
use crate::tools::paging::push_warnings;
use octocode_github::MAX_PER_PAGE;
use octocode_github::{NamedRef, RefKind, RefMatch};

/// Refs per page when `pageSize` is omitted (a tree page is 300 entries).
const DEFAULT_REFS_PER_PAGE: usize = 30;

/// Run a non-tree operation; `None` for the tree listing.
pub(super) async fn execute_operation<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
) -> Option<Result<ToolData, ProviderError>> {
    match query.operation? {
        GhStructureQueryOperation::Tree => None,
        GhStructureQueryOperation::Refs => Some(refs(provider, query, context).await),
        GhStructureQueryOperation::Languages => Some(languages(provider, query, context).await),
    }
}

/// The default branch and its head commit, and one page of tag names; with
/// `extras: ["details"]` also the same page of branches (`{name: sha}`),
/// read only when asked. A page continues while a listed kind has more, so
/// every listed tag (and branch) is named exactly once. A tag name is
/// itself a ref, so tags carry no SHA. With `ref`: that ref's commit and its `refKind` only.
async fn refs<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let (owner, repo) = (query.owner.as_str(), query.repo.as_str());
    // One named ref resolves to its commit (gh `api git/ref/tags/X`), not a
    // page of every tag.
    if let Some(reference) = query.ref_.as_deref() {
        let sha = provider
            .resolve_reference(owner, repo, Some(reference), false, context)
            .await
            .map_err(|error| super::traverse::missing_ref(error, owner, repo, reference))?;
        // A full SHA names itself: a commit, no ref lookup needed.
        let kind = if sha.eq_ignore_ascii_case(reference) {
            RefMatch::Commit
        } else {
            provider
                .transport
                .reference_kind(owner, repo, reference, &sha, context)
                .await?
        };
        return Ok(ToolData::from(
            json!({ "commitSha": sha, "refKind": kind.as_str() }),
        ));
    }
    let page = crate::tools::num::usize_of(query.page);
    let requested = query.page_size.map_or(DEFAULT_REFS_PER_PAGE, |size| {
        crate::tools::num::usize_of(size.get())
    });
    let per_page = requested.clamp(1, MAX_PER_PAGE);
    let with_branches = query.extras.contains(&ExtraKind::Details);
    let transport = &provider.transport;
    let branches = async {
        if with_branches {
            transport
                .repository_refs(owner, repo, RefKind::Branches, page, per_page, context)
                .await
                .map(Some)
        } else {
            Ok(None)
        }
    };
    let (default_branch, head, branches, tags) = tokio::try_join!(
        default_branch(provider, owner, repo, context),
        provider.resolve_reference(owner, repo, None, false, context),
        branches,
        transport.repository_refs(owner, repo, RefKind::Tags, page, per_page, context),
    )?;
    let mut value = json!({
        "defaultBranch": default_branch,
        "commitSha": head,
        "tags": tags.refs.iter().map(|named| named.name.as_str()).collect::<Vec<_>>(),
    });
    if requested > per_page {
        push_warnings(
            &mut value,
            [format!(
                "pageSize {requested} reads as {MAX_PER_PAGE}, GitHub's ref page."
            )],
        );
    }
    if !with_branches {
        // Branches are read only when asked: the lead asks for them.
        let mut listed = query_row(query, &[]);
        listed["extras"] = json!([ExtraKind::Details.to_string()]);
        value["next"]["viewRefs"] = continuation(listed, "exact");
    }
    if let Some(branches) = &branches {
        // `{name: sha}`: one key per branch instead of repeated `name`/`sha` keys.
        value["branches"] = Value::Object(
            branches
                .refs
                .iter()
                .map(|named: &NamedRef| (named.name.clone(), json!(named.sha)))
                .collect(),
        );
    }
    let more = tags.has_more || branches.as_ref().is_some_and(|branches| branches.has_more);
    // A page past the last lists no ref of any listed kind: the shared
    // response stage words it and restarts from page 1.
    let past_end = page > 1
        && tags.refs.is_empty()
        && branches
            .as_ref()
            .is_none_or(|branches| branches.refs.is_empty());
    if past_end {
        value["pagination"] = crate::response::pages::PageFacts::open(page, Some(per_page), false)
            .out_of_range(true)
            .to_value();
    }
    if more {
        value["pagination"] =
            crate::response::pages::PageFacts::open(page, Some(per_page), true).to_value();
        if let Some(next_page) = crate::tools::paging::next_cursor(
            &mut value,
            crate::tools::id::ToolId::GhStructure,
            None,
            "page",
            page + 1,
        ) {
            let mut next = query_row(query, &[]);
            // `pageSize` rides along only when the caller set it.
            next["page"] = json!(next_page);
            value["next"]["nextPage"] = continuation(next, "exact");
        }
    }
    Ok(ToolData::from(value))
}

/// Bytes of code per language on the default branch, largest first.
async fn languages<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let languages = provider
        .transport
        .repository_languages(query.owner.as_str(), query.repo.as_str(), context)
        .await?;
    let languages: Map<String, Value> = languages
        .into_iter()
        .map(|(name, bytes)| (name, json!(bytes)))
        .collect();
    Ok(ToolData::from(json!({ "languages": languages })))
}

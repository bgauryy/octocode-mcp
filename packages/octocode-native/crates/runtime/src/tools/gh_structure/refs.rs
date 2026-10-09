//! `operation:"refs"` (branches and tags) and `operation:"languages"`.
use super::*;
use crate::contracts::tool_types::ExtraKind;
use crate::contracts::tool_types::GhStructureQueryOperation;
use crate::providers::github::{NamedRef, RefKind};

/// GitHub's largest `per_page` for branches and tags.
const MAX_REFS_PER_PAGE: usize = 100;
/// Refs per page when `pageSize` is omitted (a tree page is 300 entries).
const DEFAULT_REFS_PER_PAGE: usize = 30;

/// Run a non-tree operation; `None` for the tree listing.
pub(super) async fn execute_operation<C: crate::providers::github::ConditionalCache>(
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
/// itself a ref, so tags carry no SHA.
async fn refs<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
) -> Result<ToolData, ProviderError> {
    let (owner, repo) = (query.owner.as_str(), query.repo.as_str());
    let page = crate::tools::num::usize_of(query.page);
    let per_page = query
        .page_size
        .map_or(DEFAULT_REFS_PER_PAGE, |size| {
            crate::tools::num::usize_of(size.get())
        })
        .clamp(1, MAX_REFS_PER_PAGE);
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
    if more {
        value["pagination"] =
            crate::response::pages::PageFacts::open(page, Some(per_page), true).to_value();
        if page >= crate::tools::id::query_limits::gh_structure::PAGE_MAXIMUM {
            value["terminalLimit"] = json!(true);
        } else {
            let mut next = public_query(query)?;
            // `pageSize` rides along only when the caller set it.
            next["page"] = json!(page + 1);
            let listed = if with_branches {
                "branches and tags"
            } else {
                "tags"
            };
            value["next"]["nextPage"] = continuation(
                next,
                format!("Continue {listed} on page {}.", page + 1),
                "exact",
            );
        }
    }
    Ok(ToolData::from(value))
}

/// Bytes of code per language on the default branch, largest first.
async fn languages<C: crate::providers::github::ConditionalCache>(
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

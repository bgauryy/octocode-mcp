//! A failed ghGetFileContent read: one message, one hint and one recovery
//! per row, chosen from the provider error and the missing-path walk.
use super::GhGetFileContentQuery;
use crate::tools::gh_shared::{
    GITHUB_AUTH_RECOVERY_HINT, GhFailure, PathRecovery, RepoPath, parent_dir, provider_message,
    repository_not_found, repository_search, tree_recovery, validation_message, with_ref_recovery,
};
use crate::tools::id::ToolId;
use crate::tools::result::{Continuation, query_row};
use octocode_github::{ProviderError, ProviderErrorKind, ProviderErrorReason};
use serde_json::{Value, json};

pub(super) fn repo_path(query: &GhGetFileContentQuery) -> RepoPath<'_> {
    RepoPath {
        owner: query.owner.as_str(),
        repo: query.repo.as_str(),
        path: query.path.as_str(),
        reference: query.ref_.as_ref().map(|value| value.as_str()),
    }
}

/// The failure row of a read. `found` is the missing-path walk's answer
/// (only for a path that did not resolve).
pub(crate) fn failure(
    error: ProviderError,
    query: &GhGetFileContentQuery,
    found: Option<PathRecovery>,
) -> GhFailure {
    let at = repo_path(query);
    let (owner, repo, requested) = (at.owner, at.repo, at.path);
    let identity = |mut failure: GhFailure| {
        failure.fields = vec![
            ("owner", json!(owner)),
            ("repo", json!(repo)),
            ("path", json!(requested)),
        ];
        failure
    };
    // The requested branch/tag/SHA does not exist (the transport types
    // GitHub's "No commit found"): name it and list the refs it could name.
    if let Some(reference) = at.reference.filter(|value| !value.is_empty())
        && error.reason == Some(ProviderErrorReason::RefNotFound)
    {
        let failure = GhFailure::new(
            error,
            format!("Branch, tag, or SHA not found for {owner}/{repo}: \"{reference}\""),
        );
        return identity(with_ref_recovery(failure, owner, repo));
    }
    let message = match error.kind {
        ProviderErrorKind::NotFound if repository_not_found(&error) => {
            format!(
                "Repository {owner}/{repo} not found, or private and not accessible to this token"
            )
        }
        ProviderErrorKind::NotFound if found.is_some() => {
            format!("Path not found in {owner}/{repo}: {requested}")
        }
        // Provider-local validation (no HTTP status) carries a specific,
        // actionable message (directory/symlink/submodule path, bad name).
        ProviderErrorKind::Validation if error.status.is_none() => error.message.to_string(),
        // A read is not a search: GitHub's 422 detail names the bad field.
        ProviderErrorKind::Validation => validation_message(&error, "Invalid request parameters"),
        _ => provider_message(&error),
    };
    let (hint, next): (Option<&str>, Option<Value>) = if error.reason
        == Some(ProviderErrorReason::BinaryFile)
    {
        (
            Some(
                "Binary content cannot be returned as text; retrying will not help. ghStructure lists its path and size.",
            ),
            None,
        )
    } else if error.kind == ProviderErrorKind::Validation
        && error.status.is_none()
        && error.reason == Some(ProviderErrorReason::PathIsDirectory)
    {
        // The provider confirmed this path is a directory: listing it is
        // exact, and the lead is the whole repair.
        (
            None,
            Some(json!({ "viewTree": tree_recovery(&at, None, "exact") })),
        )
    } else if repository_not_found(&error) {
        // Listing a tree of the same repository cannot recover; a search
        // for its name names the owner that holds it (as on the search
        // tools).
        (
            None,
            Some(json!({ "findRepository": repository_search(repo) })),
        )
    } else if error.kind == ProviderErrorKind::NotFound {
        path_recovery(query, &at, found)
    } else if error.kind == ProviderErrorKind::Authentication {
        (Some(GITHUB_AUTH_RECOVERY_HINT), None)
    } else {
        (None, None)
    };
    let mut failure = GhFailure::new(error, message);
    if let Some(hint) = hint {
        failure = failure.hint(hint);
    }
    failure.next = next.map(Box::new);
    identity(failure)
}

/// The clone URL a submodule-path error names (`is a git submodule (URL)`).
pub(super) fn submodule_url(error: &ProviderError) -> Option<&str> {
    if error.kind != ProviderErrorKind::Validation || error.status.is_some() {
        return None;
    }
    let (_, rest) = error.message.split_once("is a git submodule (")?;
    rest.split_once(')').map(|(url, _)| url)
}

/// `owner`/`repo` of a github.com clone URL (https, ssh or git scheme).
pub(super) fn github_repository(url: &str) -> Option<(String, String)> {
    let rest = [
        "https://github.com/",
        "http://github.com/",
        "git://github.com/",
        "ssh://git@github.com/",
        "git@github.com:",
    ]
    .iter()
    .find_map(|prefix| url.strip_prefix(prefix))?;
    let mut parts = rest.trim_end_matches('/').splitn(2, '/');
    let owner = parts.next().filter(|part| !part.is_empty())?;
    let repo = parts.next()?;
    let repo = repo.strip_suffix(".git").unwrap_or(repo);
    (!repo.is_empty() && !repo.contains('/')).then(|| (owner.to_owned(), repo.to_owned()))
}

/// The recovery of a submodule path: the submodule's GitHub repository at
/// the commit the parent pins (when the listing named it), else, for a
/// submodule hosted elsewhere, the fact that it is not on GitHub.
pub(super) fn submodule_recovery(
    mut failure: GhFailure,
    repository: Option<(String, String)>,
    pinned: Option<&str>,
) -> GhFailure {
    let Some((owner, repo)) = repository else {
        return failure.hint("The submodule's repository is not on GitHub.");
    };
    let at = RepoPath {
        owner: &owner,
        repo: &repo,
        path: "",
        reference: pinned,
    };
    let confidence = if pinned.is_some() { "high" } else { "low" };
    failure.hints.clear();
    failure.next = Some(Box::new(
        json!({ "viewTree": tree_recovery(&at, None, confidence) }),
    ));
    failure
}

/// A path that did not resolve: the case-corrected file, the nearest
/// existing directory, or (without a walk answer) the parent directory.
fn path_recovery(
    query: &GhGetFileContentQuery,
    at: &RepoPath<'_>,
    found: Option<PathRecovery>,
) -> (Option<&'static str>, Option<Value>) {
    let Some(found) = found else {
        let parent = parent_dir(at.path);
        let listing = RepoPath {
            path: &parent,
            ..*at
        };
        return (
            None,
            Some(json!({ "viewTree": tree_recovery(&listing, None, "low") })),
        );
    };
    let directory = if found.directory.is_empty() {
        "."
    } else {
        found.directory.as_str()
    };
    let listing = RepoPath {
        path: directory,
        ..*at
    };
    // One repair: the case-corrected file's read, else the listing of the
    // deepest existing directory (the lead's path is the fact).
    match found.file {
        Some(path) => {
            let mut read = query_row(query, &[]);
            read["path"] = json!(path);
            let read = Continuation::new(ToolId::GhGetFileContent, read)
                .confidence("high")
                .build();
            (
                Some("Only the path's case differs."),
                Some(json!({ "read": read })),
            )
        }
        None => (
            None,
            Some(json!({ "viewTree": tree_recovery(&listing, None, "exact") })),
        ),
    }
}

//! The tree walk: the recursive git tree, else a bounded Contents walk.
use super::*;

/// Deepest level a listing may reach (contract `maxDepth` maximum).
pub(super) fn max_listing_depth() -> usize {
    crate::contracts::query_schema_max(ToolId::GhStructure, None, "maxDepth")
}

/// One `include` glob: a case-insensitive glob over repo-relative paths. Without a
/// `/` it matches entry names at any depth; a bare word (no glob
/// metacharacters) matches names containing it.
pub(super) struct PathFilter {
    pub(super) matcher: globset::GlobMatcher,
    pub(super) by_name: bool,
}

impl PathFilter {
    pub(super) fn new(pattern: &str) -> Result<Self, ProviderError> {
        // The shared `include` coercion: a bare word matches names containing
        // it; anything else is a glob as written.
        let glob = crate::policy::include::include_glob(pattern.trim().trim_start_matches('/'));
        let pattern = glob.as_str();
        let by_name = !pattern.contains('/');
        let matcher = globset::GlobBuilder::new(pattern)
            .literal_separator(true)
            .case_insensitive(true)
            .build()
            .map_err(|error| {
                ProviderError::new(
                    ProviderErrorKind::Validation,
                    format!("Invalid include glob \"{pattern}\": {error}"),
                )
            })?
            .compile_matcher();
        Ok(Self { matcher, by_name })
    }

    pub(super) fn matches(&self, path: &str) -> bool {
        if self.by_name {
            self.matcher
                .is_match(path.rsplit('/').next().unwrap_or(path))
        } else {
            self.matcher.is_match(path)
        }
    }
}

/// The tree one listing walks: `root` of `owner/repo` at `branch`, `max_depth` levels deep.
#[derive(Clone, Copy)]
pub(super) struct Listing<'a> {
    pub(super) owner: &'a str,
    pub(super) repo: &'a str,
    pub(super) branch: &'a str,
    pub(super) root: &'a str,
    pub(super) max_depth: usize,
}

/// `prefix:owner/repo`; owner and repository are case-insensitive cache keys.
pub(super) fn repo_key(prefix: &str, owner: &str, repo: &str) -> String {
    format!(
        "{prefix}:{}/{}",
        owner.to_ascii_lowercase(),
        repo.to_ascii_lowercase()
    )
}

/// A failure no fallback read can recover: credentials, access, or rate.
pub(super) fn access_failure(error: &ProviderError) -> bool {
    matches!(
        error.kind,
        ProviderErrorKind::Authentication
            | ProviderErrorKind::Permission
            | ProviderErrorKind::RateLimited
    )
}

pub(super) async fn traverse<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    listing: &Listing<'_>,
    context: &RequestContext,
) -> Result<Traversal, ProviderError> {
    let mut split = false;
    if listing.max_depth > 1 {
        match recursive_tree(provider, listing, context).await? {
            DeepTree::Read(traversal) => return Ok(traversal),
            DeepTree::Truncated => split = true,
            DeepTree::Unavailable => {}
        }
    }
    walk_contents(provider, listing, split, context).await
}

/// What one recursive git tree read answered.
pub(super) enum DeepTree {
    Read(Traversal),
    /// Past GitHub's recursive-tree limit: smaller subtrees still read whole.
    Truncated,
    Unavailable,
}

/// A deep listing from one recursive git tree (cached by commit); a
/// truncated or unavailable tree leaves the walk to the Contents API.
pub(super) async fn recursive_tree<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    listing: &Listing<'_>,
    context: &RequestContext,
) -> Result<DeepTree, ProviderError> {
    let Listing {
        owner,
        repo,
        branch,
        root,
        max_depth,
    } = *listing;
    let resource = format!("{}:{branch}", repo_key("git-tree", owner, repo));
    if let Ok(partition) = provider.transport.cache_partition(context, None)
        && let Some(cached) = provider.cache.get(&partition, &resource).await
        && let Ok(tree) =
            serde_json::from_slice::<crate::providers::github::TreeResponse>(&cached.bytes)
    {
        root_is_directory(&tree, root)?;
        return Ok(DeepTree::Read(traversal_from_git_tree(
            tree, root, max_depth,
        )));
    }
    match provider
        .transport
        .get_tree(
            &TreeRequest {
                owner: owner.into(),
                repo: repo.into(),
                reference: branch.into(),
                recursive: true,
            },
            context,
        )
        .await
    {
        Ok(tree) if !tree.truncated => {
            root_is_directory(&tree, root)?;
            cache_tree(provider, context, resource, branch, &tree).await;
            Ok(DeepTree::Read(traversal_from_git_tree(
                tree, root, max_depth,
            )))
        }
        Ok(_) => Ok(DeepTree::Truncated),
        Err(error) if access_failure(&error) => Err(error),
        Err(_) => Ok(DeepTree::Unavailable),
    }
}

/// One subdirectory's whole subtree from a recursive git tree read by its
/// tree SHA (content-addressed, so cached like a commit's tree), with
/// repo-relative paths; `None` when that subtree is truncated too or
/// unreadable, so the Contents walk descends into it instead.
async fn subtree<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    listing: &Listing<'_>,
    dir: &str,
    sha: &str,
    context: &RequestContext,
) -> Result<Option<crate::providers::github::TreeResponse>, ProviderError> {
    let resource = format!(
        "{}:{sha}",
        repo_key("git-tree", listing.owner, listing.repo)
    );
    let cached = match provider.transport.cache_partition(context, None) {
        Ok(partition) => provider.cache.get(&partition, &resource).await,
        Err(_) => None,
    };
    let tree = match cached.and_then(|cached| {
        serde_json::from_slice::<crate::providers::github::TreeResponse>(&cached.bytes).ok()
    }) {
        Some(tree) => tree,
        None => match provider
            .transport
            .get_tree(
                &TreeRequest {
                    owner: listing.owner.into(),
                    repo: listing.repo.into(),
                    reference: sha.into(),
                    recursive: true,
                },
                context,
            )
            .await
        {
            Ok(tree) if !tree.truncated => {
                cache_tree(provider, context, resource, sha, &tree).await;
                tree
            }
            Ok(_) => return Ok(None),
            Err(error) if access_failure(&error) => return Err(error),
            Err(_) => return Ok(None),
        },
    };
    let mut tree = tree;
    for entry in &mut tree.tree {
        entry.path = format!("{dir}/{}", entry.path);
    }
    Ok(Some(tree))
}

/// The Contents API walk, one directory read per folder up to
/// [`MAX_DIRECTORY_FETCHES`]; a complete walk is reused for the cache TTL.
/// After a truncated recursive tree (`split`), a folder with more than one
/// level left to list is read whole from its own recursive subtree, so a
/// large repository costs one read per subtree instead of per folder.
pub(super) async fn walk_contents<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    listing: &Listing<'_>,
    split: bool,
    context: &RequestContext,
) -> Result<Traversal, ProviderError> {
    let at = *listing;
    let Listing {
        owner,
        repo,
        branch,
        root,
        max_depth,
    } = *listing;
    // Every tree page re-runs the walk; reuse a complete one for the cache TTL.
    let walk_key = format!(
        "{}:{branch}:{root}:{max_depth}",
        repo_key("git-tree-walk", owner, repo)
    );
    let partition = provider.transport.cache_partition(context, None).ok();
    if let Some(partition) = &partition
        && let Some(cached) = provider.cache.get(partition, &walk_key).await
        && let Ok(walk) = serde_json::from_slice::<Traversal>(&cached.bytes)
    {
        return Ok(walk);
    }
    let mut traversal = Traversal::default();
    // Each pending directory: path, depth, whether it is the requested
    // root, and its tree SHA when its parent listing named it.
    let mut pending = vec![(root.to_owned(), 1usize, true, None::<String>)];
    let mut visited = HashSet::new();
    let mut fetches = 0usize;
    while let Some((path, depth, required, sha)) = pending.pop() {
        if !visited.insert(path.clone()) {
            continue;
        }
        if fetches >= MAX_DIRECTORY_FETCHES {
            traversal.fetch_limit = true;
            break;
        }
        fetches += 1;
        let mut listing = match provider
            .repository_contents(owner, repo, &path, branch, context)
            .await
        {
            Ok(listing) => listing,
            Err(error) if !required && !access_failure(&error) => {
                traversal.failed_subtrees += 1;
                continue;
            }
            Err(error) => return Err(error),
        };
        // The Contents API answers a file path with a single object whose
        // path is the requested path itself; a tree cannot list a file.
        if required
            && !path.is_empty()
            && let [entry] = listing.entries.as_slice()
            && entry.path == path
            && entry.kind != "dir"
        {
            return Err(not_a_directory(&path, &entry.kind));
        }
        // The Contents API lists 1,000 entries of a directory at most; its
        // git tree lists them all.
        if listing.raw_entry_count >= CONTENTS_LIMIT {
            let whole = if fetches < MAX_DIRECTORY_FETCHES {
                fetches += 1;
                whole_directory(provider, &at, &path, sha.as_deref(), context).await?
            } else {
                None
            };
            match whole {
                Some(entries) => listing.entries = entries,
                None => traversal.contents_limit = true,
            }
        }
        for entry in listing.entries {
            let Some(kind) = entry_kind(&entry) else {
                note_unlisted(&mut traversal, &entry.name, unlisted_kind(&entry));
                continue;
            };
            if ignored_entry(&entry.name, kind) {
                *traversal.omitted.entry(entry.name.clone()).or_default() += 1;
                continue;
            }
            let child_path = entry.path.clone();
            traversal.entries.push(TreeEntry {
                path: child_path.clone(),
                kind,
                size: entry.size,
            });
            if kind != EntryKind::Dir || depth >= max_depth {
                continue;
            }
            if split
                && max_depth - depth >= 2
                && fetches < MAX_DIRECTORY_FETCHES
                && let Some(sha) = entry.sha.as_deref()
            {
                fetches += 1;
                if let Some(tree) = subtree(provider, &at, &child_path, sha, context).await? {
                    let below = traversal_from_git_tree(tree, root, max_depth);
                    traversal.entries.extend(below.entries);
                    for (name, count) in below.omitted {
                        *traversal.omitted.entry(name).or_default() += count;
                    }
                    continue;
                }
            }
            pending.push((child_path, depth + 1, false, entry.sha.clone()));
        }
    }
    if traversal.failed_subtrees == 0
        && let Some(partition) = &partition
        && let Ok(bytes) = serde_json::to_vec(&traversal)
    {
        provider
            .cache
            .put(
                partition,
                walk_key,
                crate::providers::github::CachedContent {
                    etag: None,
                    bytes: bytes.into(),
                    resolved_ref: branch.to_owned(),
                },
            )
            .await;
    }
    Ok(traversal)
}

/// A directory past the Contents API's entry cap, read whole from its own
/// (non-recursive) git tree as Contents entries. The root's tree is the
/// listed commit's; another directory's SHA is the one its parent listing
/// names, read from the parent when the walk started at it. `None` when the
/// tree is truncated or unreadable: the cap stays disclosed.
async fn whole_directory<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    listing: &Listing<'_>,
    dir: &str,
    sha: Option<&str>,
    context: &RequestContext,
) -> Result<Option<Vec<ContentsEntry>>, ProviderError> {
    let reference = match sha {
        Some(sha) => sha.to_owned(),
        None if dir.is_empty() => listing.branch.to_owned(),
        None => {
            let parent = dir.rsplit_once('/').map_or("", |(parent, _)| parent);
            let siblings = match provider
                .repository_contents(listing.owner, listing.repo, parent, listing.branch, context)
                .await
            {
                Ok(siblings) => siblings,
                Err(error) if access_failure(&error) => return Err(error),
                Err(_) => return Ok(None),
            };
            match siblings
                .entries
                .into_iter()
                .find(|entry| entry.path == dir && entry.kind == "dir")
                .and_then(|entry| entry.sha)
            {
                Some(sha) => sha,
                None => return Ok(None),
            }
        }
    };
    let tree = match provider
        .transport
        .get_tree(
            &TreeRequest {
                owner: listing.owner.into(),
                repo: listing.repo.into(),
                reference,
                recursive: false,
            },
            context,
        )
        .await
    {
        Ok(tree) if !tree.truncated => tree,
        Ok(_) => return Ok(None),
        Err(error) if access_failure(&error) => return Err(error),
        Err(_) => return Ok(None),
    };
    Ok(Some(
        tree.tree
            .into_iter()
            .map(|entry| ContentsEntry {
                path: if dir.is_empty() {
                    entry.path.clone()
                } else {
                    format!("{dir}/{}", entry.path)
                },
                kind: match entry.kind.as_str() {
                    "blob" => "file".to_owned(),
                    "tree" => "dir".to_owned(),
                    "commit" => "submodule".to_owned(),
                    other => other.to_owned(),
                },
                name: entry.path,
                size: entry.size,
                sha: entry.sha,
                git_url: None,
            })
            .collect(),
    ))
}

/// Keep a complete recursive tree for the cache TTL under its commit.
pub(super) async fn cache_tree<C: crate::providers::github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    context: &RequestContext,
    resource: String,
    commit: &str,
    tree: &crate::providers::github::TreeResponse,
) {
    if let Ok(partition) = provider.transport.cache_partition(context, None)
        && let Ok(bytes) = serde_json::to_vec(tree)
    {
        provider
            .cache
            .put(
                &partition,
                resource,
                crate::providers::github::CachedContent {
                    etag: None,
                    bytes: bytes.into(),
                    resolved_ref: commit.to_owned(),
                },
            )
            .await;
    }
}

/// A ref that did not resolve names the ref, like ghGetFileContent does.
pub(super) fn missing_ref(
    error: ProviderError,
    owner: &str,
    repo: &str,
    reference: &str,
) -> ProviderError {
    if error.reason != Some(ProviderErrorReason::RefNotFound) {
        return error;
    }
    let mut missing = ProviderError::new(
        ProviderErrorKind::NotFound,
        format!("Branch, tag, or SHA not found for {owner}/{repo}: \"{reference}\""),
    )
    .with_reason(ProviderErrorReason::RefNotFound);
    missing.status = error.status;
    missing.request_id = error.request_id;
    missing
}

pub(super) fn root_is_directory(
    tree: &crate::providers::github::TreeResponse,
    root: &str,
) -> Result<(), ProviderError> {
    if root.is_empty() {
        return Ok(());
    }
    match tree.tree.iter().find(|entry| entry.path == root) {
        Some(entry) if entry.kind != "tree" => Err(not_a_directory(root, &entry.kind)),
        Some(_) => Ok(()),
        // A complete tree without the root: the path does not exist at this
        // commit, as the contents API would answer (404).
        None => Err(ProviderError::new(
            ProviderErrorKind::NotFound,
            format!("Path \"{root}\" not found"),
        )),
    }
}

/// A tree listing of a path that is not a directory. A file is typed
/// ([`ProviderErrorReason::PathIsFile`]): its read is the repair.
pub(super) fn not_a_directory(path: &str, kind: &str) -> ProviderError {
    let (kind, reason) = match kind {
        "blob" | "file" => ("a file", Some(ProviderErrorReason::PathIsFile)),
        "commit" | "submodule" => ("a git submodule", None),
        "symlink" => ("a symlink", None),
        _ => ("an unsupported entry", None),
    };
    let error = ProviderError::new(
        ProviderErrorKind::Validation,
        format!("Path \"{path}\" is {kind}, not a directory"),
    );
    match reason {
        Some(reason) => error.with_reason(reason),
        None => error,
    }
}

pub(super) fn traversal_from_git_tree(
    tree: crate::providers::github::TreeResponse,
    root: &str,
    max_depth: usize,
) -> Traversal {
    let prefix = if root.is_empty() {
        String::new()
    } else {
        format!("{root}/")
    };
    let mut traversal = Traversal::default();
    for entry in tree.tree {
        let relative = if root.is_empty() {
            entry.path.clone()
        } else if entry.path == root {
            continue;
        } else if let Some(stripped) = entry.path.strip_prefix(&prefix) {
            stripped.to_owned()
        } else {
            continue;
        };
        let depth = relative.split('/').filter(|part| !part.is_empty()).count();
        if depth == 0 || depth > max_depth {
            continue;
        }
        let kind = match entry.kind.as_str() {
            "blob" => EntryKind::File,
            "tree" => EntryKind::Dir,
            other => {
                note_unlisted(&mut traversal, name_of(&relative), other);
                continue;
            }
        };
        // Beneath an ignored directory nothing is listed, sized, or
        // materialized, as the Contents walk never descends into one; only
        // the ignored entry itself is counted.
        let (ancestors, name) = relative.rsplit_once('/').unwrap_or(("", &relative));
        if ancestors
            .split('/')
            .any(|part| ignored_entry(part, EntryKind::Dir))
        {
            continue;
        }
        if ignored_entry(name, kind) {
            *traversal.omitted.entry(name.to_owned()).or_default() += 1;
            continue;
        }
        traversal.entries.push(TreeEntry {
            path: if root.is_empty() {
                relative
            } else {
                format!("{root}/{relative}")
            },
            kind,
            size: entry.size,
        });
    }
    traversal
}

/// The last segment of a repository-relative path.
fn name_of(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, name)| name)
}

/// A symlink or submodule has no listable content: name it beside the
/// skipped directories instead of dropping it silently.
fn note_unlisted(traversal: &mut Traversal, name: &str, kind: &str) {
    let label = match kind {
        "symlink" => "symlink",
        "submodule" | "commit" => "submodule",
        _ => return,
    };
    *traversal
        .omitted
        .entry(format!("{name} ({label})"))
        .or_default() += 1;
}

/// The entry kind [`note_unlisted`] names: the listing's own type, or a
/// submodule the listing types `file`.
fn unlisted_kind(entry: &ContentsEntry) -> &str {
    if entry.is_submodule() {
        "submodule"
    } else {
        &entry.kind
    }
}

pub(super) fn entry_kind(entry: &ContentsEntry) -> Option<EntryKind> {
    if entry.is_submodule() {
        return None;
    }
    match entry.kind.as_str() {
        "file" => Some(EntryKind::File),
        "dir" => Some(EntryKind::Dir),
        _ => None,
    }
}

pub(super) fn ignored_entry(name: &str, kind: EntryKind) -> bool {
    if kind == EntryKind::Dir {
        matches!(
            name,
            ".git" | ".hg" | ".svn" | "node_modules" | "target" | "vendor"
        )
    } else {
        matches!(name, ".DS_Store")
    }
}

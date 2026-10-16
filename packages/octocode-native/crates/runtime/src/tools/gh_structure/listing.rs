//! One listing page: the pinned ref, the page window, the entries and
//! their continuations.
use super::*;
use crate::tools::root_read::read_rank;

/// Pin the listing to one commit: an explicit ref that does not resolve is
/// an error (like ghGetFileContent), never a silent default-branch listing,
/// and every page of one listing reads the same tree. The recursive tree is
/// fetched by the resolved commit SHA, never by the ref name.
pub(super) async fn resolve_listing_ref<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhStructureQuery,
    context: &RequestContext,
) -> Result<(String, String), ProviderError> {
    let (owner, repo) = (query.owner.as_str(), query.repo.as_str());
    match query.ref_.as_deref() {
        Some(branch) => {
            let sha = provider
                .resolve_reference(owner, repo, Some(branch), false, context)
                .await
                .map_err(|error| missing_ref(error, owner, repo, branch))?;
            Ok((branch.to_owned(), sha))
        }
        None => Ok(tokio::try_join!(
            default_branch(provider, owner, repo, context),
            provider.resolve_reference(owner, repo, None, false, context),
        )?),
    }
}

/// The default branch's name, memoized per repository for the cache's
/// volatile lifetime (like the HEAD commit memo beside it).
pub(super) async fn default_branch<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    repo: &str,
    context: &RequestContext,
) -> Result<String, ProviderError> {
    let key = repo_key("repo-default-branch", owner, repo);
    let partition = provider.transport.cache_partition(context, None).ok();
    if let Some(partition) = &partition
        && let Some(cached) = provider.cache.get(partition, &key).await
        && let Ok(branch) = std::str::from_utf8(&cached.bytes)
    {
        return Ok(branch.to_owned());
    }
    let metadata = provider
        .transport
        .repository_metadata(owner, repo, context)
        .await?;
    // The same read names the repository's canonical name: a renamed
    // repository costs no further request.
    if let Some(full_name) = metadata.full_name.as_deref() {
        crate::tools::gh_shared::remember_canonical(provider, owner, repo, full_name, context)
            .await;
    }
    let branch = metadata.default_branch;
    if let Some(partition) = &partition {
        provider
            .cache
            .put(
                partition,
                key,
                octocode_github::CachedContent {
                    etag: None,
                    bytes: branch.as_bytes().to_vec().into(),
                    resolved_ref: branch.clone(),
                },
                octocode_github::Retention::Revalidate,
            )
            .await;
    }
    Ok(branch)
}

/// One page of a sorted listing.
pub(super) struct ListingPage<'a> {
    pub(super) current: usize,
    pub(super) per_page: usize,
    pub(super) total_entries: usize,
    pub(super) total_pages: usize,
    pub(super) entries: &'a [TreeEntry],
}

impl<'a> ListingPage<'a> {
    pub(super) fn of(query: &GhStructureQuery, all: &'a [TreeEntry]) -> Self {
        let current = query.page.map_or(1, crate::tools::num::usize_of);
        let per_page = crate::tools::num::usize_of(
            query
                .page_size
                .map_or(DEFAULT_ENTRIES_PER_PAGE, std::num::NonZeroU64::get),
        )
        .clamp(1, max_entries_per_page());
        let total_entries = all.len();
        let total_pages = total_entries.div_ceil(per_page).max(1);
        let start = current
            .saturating_sub(1)
            .saturating_mul(per_page)
            .min(total_entries);
        let end = start.saturating_add(per_page).min(total_entries);
        Self {
            current,
            per_page,
            total_entries,
            total_pages,
            entries: &all[start..end],
        }
    }

    pub(super) fn has_more(&self) -> bool {
        self.current < self.total_pages
    }

    /// The requested page lies past the last page of the listing.
    pub(super) fn past_end(&self) -> bool {
        self.current > self.total_pages
    }

    /// The `pagination` block: shown when the listing has more than one page,
    /// and on a page past the end of any listing (the response layer words
    /// the page count and leads back to page 1).
    pub(super) fn paginate(&self, value: &mut Value) {
        if self.total_pages > 1 || self.past_end() {
            value["pagination"] = crate::response::pages::PageFacts::counted(
                self.current,
                self.per_page,
                self.total_entries,
            )
            .out_of_range(self.past_end())
            .to_value();
        }
    }
}

/// File and folder counts of the whole listing (never one page's share), and
/// the bytes of the files whose size the provider states.
pub(super) fn summary(entries: &[TreeEntry]) -> Value {
    let files = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::File)
        .count();
    let mut summary = json!({"files": files, "dirs": entries.len() - files});
    let bytes = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::File)
        .map(|entry| entry.size)
        .collect::<Option<Vec<_>>>();
    if let Some(sizes) = bytes {
        summary["bytes"] = json!(sizes.iter().sum::<u64>());
    }
    summary
}

/// Provider limits and skipped entries of the walk, stated on the page. A
/// limit's `terminalLimitReached` code is the shared coverage code
/// (`response::pages::coverage_codes`), never restated here.
pub(super) fn disclose_limits(
    traversal: &Traversal,
    page: &ListingPage<'_>,
    value: &mut Value,
    output: &mut ToolData,
) {
    use crate::tools::paging::{mark_partial, terminal_limit};
    if traversal.contents_limit {
        terminal_limit(value, "providerContentsLimit", &[]);
        value["providerLimit"] = json!({
            "reason": "providerContentsLimit",
            "maxEntriesPerDirectory": CONTENTS_LIMIT
        });
    }
    if traversal.fetch_limit {
        terminal_limit(value, "treeFetchLimit", &[]);
        value["providerLimit"] = json!({
            "reason": "treeFetchLimit",
            "maxDirectoryFetches": MAX_DIRECTORY_FETCHES
        });
    }
    if !traversal.omitted.is_empty() && page.current == 1 {
        // Symlinks and submodules have no listable content: name each with
        // its count instead of silently dropping them, once per listing.
        value["omitted"] = json!(traversal.omitted);
    }
    if traversal.failed_subtrees > 0 {
        mark_partial(value, "partialTreeFailures", &[]);
        output.diagnostics.add(
            "partialTreeFailures",
            "One or more repository subdirectories could not be read; retry the same page or narrow the path/depth.",
            true,
        );
    }
}

/// A directory past GitHub's Contents listing limit is complete only in a
/// checkout: the clone of the listed path at the listed commit.
pub(super) fn clone_lead(query: &GhStructureQuery, scope: &Scope, commit_sha: &str) -> Value {
    let mut clone = json!({
        "owner": query.owner.as_str(),
        "repo": query.repo.as_str(),
        "ref": commit_sha,
    });
    if !scope.path.is_empty() {
        clone["path"] = json!(scope.path);
    }
    crate::tools::result::Continuation::new(ToolId::GhCloneRepo, clone)
        .confidence("exact")
        .build()
}

/// The read a listing leads to on its first page: the best-ranked listed
/// file ([`read_rank`](crate::tools::root_read::read_rank), the ranking
/// structureSearch shares): a source file a bare-word `include` names, else
/// the shallowest code entry file, a manifest, a README, a guide, then other
/// source. A small listing falls back to its first file. Source and docs are outlined
/// (`minify:"symbols"`).
pub(super) fn entry_read(
    query: &GhStructureQuery,
    entries: &[TreeEntry],
    commit_sha: &str,
) -> Option<Value> {
    let files = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::File)
        .collect::<Vec<_>>();
    let words = bare_words(query.include.iter().map(|word| word.as_str()));
    let base_depth = query.path.as_deref().map_or(0, |path| {
        path.split('/').filter(|part| !part.is_empty()).count()
    });
    let small = files.len() <= crate::tools::OUTLINE_LEAD_MAX_FILES;
    let path = files
        .iter()
        .filter_map(|entry| {
            let depth = entry.path.matches('/').count().saturating_sub(base_depth);
            let rank = read_rank(&entry.path, depth, &words).or(small.then_some(RANK_ANY))?;
            Some(((rank, depth, entry.path.as_str()), entry))
        })
        .min_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, entry)| entry.path.clone())?;
    let mut read = json!({
        "owner": query.owner.as_str(),
        "repo": query.repo.as_str(),
        "path": path,
        "ref": commit_sha,
    });
    if crate::tools::outlines(&path) {
        read["minify"] = json!("symbols");
    }
    Some(
        crate::tools::result::Continuation::new(ToolId::GhGetFileContent, read)
            .confidence("high")
            .build(),
    )
}

/// Rank of a file no tier names; only a small listing reads it.
const RANK_ANY: u8 = 6;

/// `include` entries that are bare words (no glob metacharacter or `/`),
/// lowercased: a file whose stem equals one is the file the caller named.
fn bare_words<'a>(include: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    include
        .into_iter()
        .map(str::trim)
        .filter(|word| !word.is_empty() && !word.contains(['/', '*', '?', '[', '{']))
        .map(str::to_lowercase)
        .collect()
}

/// Listing rows grouped by directory. `dir` is repo-relative (the same base
/// as `path` and `include`), `"."` only for the repository root.
/// Each listed entry carries its facts in the structureSearch entry
/// form, `"<name> (<fields>)"` (the last `" ("` opens them): a file its
/// size in bytes, then the day of its last commit; a folder that day. The
/// row's `updated` map ([`super::dates::attach`], keyed by bare name) folds
/// into the entries, so no name is written twice.
pub(super) fn attach_fields(value: &mut Value, entries: &[TreeEntry]) {
    let sizes = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::File)
        .filter_map(|entry| Some((entry.path.as_str(), entry.size?)))
        .collect::<std::collections::HashMap<_, _>>();
    let Some(rows) = value.get_mut("files").and_then(Value::as_array_mut) else {
        return;
    };
    for row in rows {
        let dir = row["dir"].as_str().unwrap_or(".").to_owned();
        let mut updated = match row
            .as_object_mut()
            .and_then(|fields| fields.shift_remove("updated"))
        {
            Some(Value::Object(updated)) => updated,
            _ => Map::new(),
        };
        for key in ["files", "folders"] {
            let Some(names) = row.get_mut(key).and_then(Value::as_array_mut) else {
                continue;
            };
            for entry in names {
                let Some(name) = entry.as_str() else { continue };
                let path = if dir == "." {
                    name.to_owned()
                } else {
                    format!("{dir}/{name}")
                };
                let mut fields = Vec::new();
                if key == "files"
                    && let Some(size) = sizes.get(path.as_str())
                {
                    fields.push(size.to_string());
                }
                if let Some(Value::String(day)) = updated.shift_remove(name) {
                    fields.push(day);
                }
                if !fields.is_empty() {
                    *entry = json!(format!("{name} ({})", fields.join(", ")));
                }
            }
        }
    }
}

pub(super) fn build_structure(entries: &[TreeEntry]) -> Vec<Value> {
    let mut dirs = Map::<String, Value>::new();
    for entry in entries {
        let path = entry.path.as_str();
        let (parent, name) = path.rsplit_once('/').unwrap_or((".", path));
        let bucket = dirs
            .entry(parent.to_owned())
            .or_insert_with(|| json!({"files": [], "folders": []}));
        let key = if entry.kind == EntryKind::File {
            "files"
        } else {
            "folders"
        };
        if let Some(values) = bucket[key].as_array_mut() {
            values.push(json!(name));
        }
    }
    for bucket in dirs.values_mut() {
        for key in ["files", "folders"] {
            if let Some(values) = bucket[key].as_array_mut() {
                values.sort_by(|left, right| left.as_str().cmp(&right.as_str()));
            }
        }
    }
    let mut rows = dirs
        .into_iter()
        .map(|(dir, entry)| {
            let mut row = json!({"dir": dir});
            if entry["files"]
                .as_array()
                .is_some_and(|values| !values.is_empty())
            {
                row["files"] = entry["files"].clone();
            }
            if entry["folders"]
                .as_array()
                .is_some_and(|values| !values.is_empty())
            {
                row["folders"] = entry["folders"].clone();
            }
            row
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        let left = left["dir"].as_str().unwrap_or("");
        let right = right["dir"].as_str().unwrap_or("");
        if left == "." {
            std::cmp::Ordering::Less
        } else if right == "." {
            std::cmp::Ordering::Greater
        } else {
            left.cmp(right)
        }
    });
    rows
}

pub(super) fn relative(path: &str, root: &str) -> String {
    if root.is_empty() {
        path.to_owned()
    } else {
        path.strip_prefix(root)
            .unwrap_or(path)
            .trim_start_matches('/')
            .to_owned()
    }
}

pub(super) fn attach_continuations(
    value: &mut Value,
    query: &GhStructureQuery,
    page: &ListingPage<'_>,
    retry_tree: bool,
    materialize: bool,
    materialize_resume: Option<MaterializeResume>,
) -> Result<(), ProviderError> {
    let (current, has_more) = (page.current, page.has_more());
    let materialize_resume = materialize_resume.or_else(|| {
        (has_more && materialize).then_some(MaterializeResume {
            page: current + 1,
            offset: 0,
        })
    });
    let cursor = |value: &mut Value, field: &str, next: usize| {
        crate::tools::paging::next_cursor(value, ToolId::GhStructure, None, field, next)
    };
    if let Some(resume) = materialize_resume {
        let page_cursor = cursor(value, "page", resume.page);
        let offset_cursor = cursor(value, "materializeOffset", resume.offset);
        if let (Some(next_page), Some(offset)) = (page_cursor, offset_cursor) {
            let mut next_query = query_row(query, &[]);
            next_query["page"] = json!(next_page);
            next_query["pageSize"] = json!(page.per_page);
            next_query["materialize"] = json!(true);
            next_query["materializeOffset"] = json!(offset);
            value["next"]["continueMaterialize"] = continuation(next_query, "exact");
        }
        mark_materialize_partial(value);
    } else if has_more
        && !materialize
        && let Some(next_page) = cursor(value, "page", current + 1)
    {
        let mut next_query = query_row(query, &[]);
        next_query["page"] = json!(next_page);
        next_query["pageSize"] = json!(page.per_page);
        value["next"]["nextPage"] = continuation(next_query, "exact");
    }
    if retry_tree {
        let mut retry = query_row(query, &[]);
        retry["page"] = json!(current);
        retry["pageSize"] = json!(page.per_page);
        value["next"]["retry"] = continuation(retry, "exact");
    }
    Ok(())
}

pub(super) fn continuation(query: Value, confidence: &'static str) -> Value {
    crate::tools::result::Continuation::new(ToolId::GhStructure, query)
        .confidence(confidence)
        .build()
}

pub(super) fn structure_is_empty(value: &Value) -> bool {
    value
        .get("files")
        .and_then(Value::as_array)
        .is_none_or(Vec::is_empty)
}

#[cfg(test)]
mod read_lead_tests {
    use super::*;

    fn lead(paths: &[&str], include: &[&str]) -> Option<String> {
        let query: GhStructureQuery = serde_json::from_value(json!({
            "owner": "o", "repo": "r", "include": include
        }))
        .expect("query");
        let entries = paths
            .iter()
            .map(|path| TreeEntry {
                path: (*path).to_owned(),
                kind: EntryKind::File,
                size: Some(1),
            })
            .collect::<Vec<_>>();
        entry_read(&query, &entries, "s").map(|read| {
            read["query"]["queries"][0]["path"]
                .as_str()
                .unwrap_or_default()
                .to_owned()
        })
    }

    /// The read lead lands on source: the file a bare-word `include`
    /// names over its test, and a code entry over README and other files.
    #[test]
    fn the_read_lead_prefers_source_over_tests_and_docs() {
        assert_eq!(
            lead(
                &["__tests__/X-test.js", "client/X.js", "client/XFB.js"],
                &["X"]
            )
            .as_deref(),
            Some("client/X.js")
        );
        assert_eq!(
            lead(&["README.md", "benches/b.rs", "src/lib.rs"], &[]).as_deref(),
            Some("src/lib.rs")
        );
        // Without source, a manifest before a README.
        assert_eq!(
            lead(&["README.md", "Cargo.toml"], &[]).as_deref(),
            Some("Cargo.toml")
        );
        // A root with loose scripts reads its manifest, not a script (zod's
        // `mm.mjs`); a nested README does not outrank source.
        assert_eq!(
            lead(&["README.md", "AGENTS.md", "mm.mjs", "package.json"], &[]).as_deref(),
            Some("package.json")
        );
        assert_eq!(
            lead(&["README.md", "download-latest.sh"], &[]).as_deref(),
            Some("README.md")
        );
        assert_eq!(
            lead(&["examples/a/README.md", "src/util.ts"], &[]).as_deref(),
            Some("src/util.ts")
        );
        // A large listing never leads to a file no tier names.
        let data = (0..8).map(|n| format!("data/{n}.csv")).collect::<Vec<_>>();
        let data = data.iter().map(String::as_str).collect::<Vec<_>>();
        assert_eq!(lead(&data, &[]), None);
        assert_eq!(lead(&data[..2], &[]).as_deref(), Some("data/0.csv"));
    }
}

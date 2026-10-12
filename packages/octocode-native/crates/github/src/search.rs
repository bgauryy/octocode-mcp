use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use super::{GitHubTransport, ProviderError, ProviderErrorKind, RequestContext, RequestSpec};

#[derive(Clone, Debug)]
pub struct CodeSearchRequest {
    pub include_fragments: bool,
    pub query: String,
    pub page: usize,
    pub per_page: usize,
}
#[derive(Clone, Debug)]
pub struct RepositorySearchRequest {
    pub query: String,
    pub sort: Option<String>,
    pub page: usize,
    pub per_page: usize,
}
#[derive(Clone, Debug)]
pub struct TreeRequest {
    pub owner: String,
    pub repo: String,
    pub reference: String,
    pub recursive: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CodeSearchPage {
    pub total_count: usize,
    #[serde(default)]
    pub incomplete_results: bool,
    pub items: Vec<CodeSearchItem>,
    /// Organizations whose results GitHub withheld because the token is not
    /// SAML-authorized for them (`x-github-sso: partial-results`). A page
    /// with any is never cached.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sso_partial_organizations: Vec<u64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CodeSearchItem {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub html_url: String,
    pub repository: SearchRepository,
    #[serde(default)]
    pub text_matches: Vec<TextMatch>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TextMatch {
    #[serde(default)]
    pub fragment: String,
    #[serde(default)]
    pub matches: Vec<TextMatchPosition>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TextMatchPosition {
    #[serde(default)]
    pub indices: Vec<i64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SearchRepository {
    pub full_name: String,
    pub html_url: String,
    pub url: String,
    #[serde(default)]
    pub default_branch: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RepositorySearchPage {
    pub total_count: usize,
    #[serde(default)]
    pub incomplete_results: bool,
    pub items: Vec<RepositorySearchItem>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RepositorySearchItem {
    pub full_name: String,
    pub name: String,
    pub html_url: String,
    pub default_branch: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub stargazers_count: usize,
    #[serde(default)]
    pub forks_count: usize,
    #[serde(default)]
    pub open_issues_count: usize,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub topics: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub pushed_at: Option<String>,
    pub language: Option<String>,
    pub homepage: Option<String>,
    pub license: Option<License>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub fork: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct License {
    pub spdx_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TreeResponse {
    pub sha: String,
    #[serde(default)]
    pub truncated: bool,
    pub tree: Vec<TreeEntry>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub size: Option<u64>,
    pub sha: Option<String>,
    pub url: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RepositoryMetadata {
    pub default_branch: String,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub archived: bool,
}

impl GitHubTransport {
    pub async fn search_code(
        &self,
        request: &CodeSearchRequest,
        context: &RequestContext,
    ) -> Result<CodeSearchPage, ProviderError> {
        let mut url = self.endpoint().rest(&["search", "code"])?;
        url.query_pairs_mut()
            .append_pair("q", &request.query)
            .append_pair("page", &request.page.to_string())
            .append_pair("per_page", &request.per_page.to_string());
        let mut spec = RequestSpec::get(url);
        spec.headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static(if request.include_fragments {
                "application/vnd.github.v3.text-match+json"
            } else {
                "application/vnd.github+json"
            }),
        );
        let (mut page, withheld) = self
            .cached_search(
                "github-code-search",
                spec,
                context,
                "invalid GitHub code search response",
                |page: &CodeSearchPage| !page.incomplete_results,
            )
            .await?;
        page.sso_partial_organizations = withheld;
        Ok(page)
    }
    pub async fn search_repositories(
        &self,
        request: &RepositorySearchRequest,
        context: &RequestContext,
    ) -> Result<RepositorySearchPage, ProviderError> {
        let mut url = self.endpoint().rest(&["search", "repositories"])?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs
                .append_pair("q", &request.query)
                .append_pair("page", &request.page.to_string())
                .append_pair("per_page", &request.per_page.to_string());
            // The wire `sort` is `field:direction`; the API takes two params.
            if let Some((field, order)) = request.sort.as_deref().and_then(|s| s.split_once(':')) {
                pairs.append_pair("sort", field).append_pair("order", order);
            }
        }
        let mut spec = RequestSpec::get(url);
        spec.headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static("application/vnd.github.v3+json"),
        );
        self.cached_search(
            "github-repo-search",
            spec,
            context,
            "invalid GitHub repository search response",
            |page: &RepositorySearchPage| !page.incomplete_results,
        )
        .await
        .map(|(page, _)| page)
    }

    /// A search-API read through the response cache. Search answers come
    /// from GitHub's search index, which already trails writes, so an
    /// identical search (same URL, `Accept`, endpoint and credential) is
    /// served from the cache until the store's volatile TTL ends: no request,
    /// so no search spacing wait and no search rate-limit spend. A page
    /// `complete` rejects (GitHub's `incomplete_results`) is not stored: that
    /// is exactly what a retry must not get back.
    pub(crate) async fn cached_search<T: Serialize + for<'de> Deserialize<'de>>(
        &self,
        namespace: &str,
        spec: RequestSpec,
        context: &RequestContext,
        invalid: &'static str,
        complete: impl Fn(&T) -> bool,
    ) -> Result<(T, Vec<u64>), ProviderError> {
        // The partition carries the endpoint and credential.
        let partition = self.cache_partition(context, None)?;
        let key = {
            use sha2::{Digest, Sha256};
            let mut digest = Sha256::new();
            digest.update(spec.url.as_str().as_bytes());
            digest.update([0]);
            if let Some(accept) = spec.headers.get(reqwest::header::ACCEPT) {
                digest.update(accept.as_bytes());
            }
            format!("{namespace}:{}", hex::encode(digest.finalize()))
        };
        if let Some(cached) = self.cache.get(&partition, &key).await
            && let Ok(page) = serde_json::from_slice::<T>(&cached.bytes)
        {
            return Ok((page, Vec::new()));
        }
        let response = self
            .execute(spec, context)
            .await
            .map_err(unsearchable_repository)?;
        let page: T = decode(response.body.as_ref(), invalid)?;
        let withheld = response.sso_partial_organizations();
        if withheld.is_empty()
            && complete(&page)
            && let Ok(bytes) = serde_json::to_vec(&page)
        {
            self.cache
                .put(
                    &partition,
                    key,
                    super::CachedContent {
                        etag: None,
                        bytes: bytes.into(),
                        resolved_ref: String::new(),
                    },
                )
                .await;
        }
        Ok((page, withheld))
    }
    /// List an owner's repositories. `sort` is a list-API sort key
    /// (`created`, `updated`, `pushed`, `full_name`); when set, results are
    /// ordered descending (newest first) like the search API's date sorts.
    pub async fn list_owner_repositories(
        &self,
        owner: &str,
        sort: &str,
        page: usize,
        per_page: usize,
        context: &RequestContext,
    ) -> Result<(Vec<RepositorySearchItem>, bool), ProviderError> {
        let fetch = |kind: &str, name: &str| -> Result<RequestSpec, ProviderError> {
            let mut url = self.endpoint().rest(&["users", name, "repos"])?;
            if kind == "orgs" {
                url = self.endpoint().rest(&["orgs", name, "repos"])?;
            }
            {
                let mut pairs = url.query_pairs_mut();
                pairs
                    .append_pair("page", &page.to_string())
                    .append_pair("per_page", &per_page.to_string())
                    .append_pair("sort", sort)
                    .append_pair("direction", "desc");
            }
            Ok(RequestSpec::get(url))
        };
        let response = match self.execute(fetch("orgs", owner)?, context).await {
            Ok(v) => v,
            Err(e) if e.status == Some(404) => {
                self.execute(fetch("users", owner)?, context).await?
            }
            Err(e) => return Err(e),
        };
        let has_more = response.next.is_some();
        Ok((
            decode(
                response.body.as_ref(),
                "invalid GitHub owner repositories response",
            )?,
            has_more,
        ))
    }
    pub async fn get_tree(
        &self,
        request: &TreeRequest,
        context: &RequestContext,
    ) -> Result<TreeResponse, ProviderError> {
        let mut url = self.endpoint().rest(&[
            "repos",
            &request.owner,
            &request.repo,
            "git",
            "trees",
            &request.reference,
        ])?;
        if request.recursive {
            url.query_pairs_mut().append_pair("recursive", "1");
        }
        decode(
            self.execute(RequestSpec::get(url), context)
                .await?
                .body
                .as_ref(),
            "invalid GitHub tree response",
        )
    }
    pub async fn repository_metadata(
        &self,
        owner: &str,
        repo: &str,
        context: &RequestContext,
    ) -> Result<RepositoryMetadata, ProviderError> {
        self.repository_as(owner, repo, context).await
    }

    /// One repository's search-row facts from `repos/{owner}/{repo}`: an
    /// exact lookup that spends no search request.
    pub async fn repository(
        &self,
        owner: &str,
        repo: &str,
        context: &RequestContext,
    ) -> Result<RepositorySearchItem, ProviderError> {
        self.repository_as(owner, repo, context).await
    }

    /// `repos/{owner}/{repo}` decoded as `T`, read once for a batch: rows
    /// that ask about the same repository (a renamed-scope check and an
    /// empty-scope check, or sibling rows) share one request while it is
    /// in flight and for [`REPOSITORY_MEMO_TTL`] after. Failures are not
    /// kept, so each caller of a failing lookup sees the failure itself.
    async fn repository_as<T: for<'de> Deserialize<'de>>(
        &self,
        owner: &str,
        repo: &str,
        context: &RequestContext,
    ) -> Result<T, ProviderError> {
        let url = self.endpoint().rest(&["repos", owner, repo])?;
        let key = (
            self.cache_partition(context, None)?,
            format!(
                "{}/{}",
                owner.to_ascii_lowercase(),
                repo.to_ascii_lowercase()
            ),
        );
        let slot = self.repositories.slot(key);
        let mut held = context.budget.wait(slot.lock()).await?;
        if let Some((at, body)) = held.as_ref()
            && at.elapsed() < REPOSITORY_MEMO_TTL
        {
            return decode(body, "invalid GitHub repository metadata response");
        }
        let page = self
            .execute(RequestSpec::get(url), context)
            .await
            .map_err(|error| {
                if error.status == Some(404) {
                    error.with_reason(super::ProviderErrorReason::RepositoryNotFound)
                } else {
                    error
                }
            })?;
        let decoded = decode(
            page.body.as_ref(),
            "invalid GitHub repository metadata response",
        )?;
        *held = Some((Instant::now(), page.body));
        Ok(decoded)
    }
}

/// How long a read repository stays shared: long enough for one batch.
const REPOSITORY_MEMO_TTL: Duration = Duration::from_secs(30);

/// One repository's slot: when its body was read, and the body.
type RepositorySlot = Arc<tokio::sync::Mutex<Option<(Instant, bytes::Bytes)>>>;

/// The latest body of each `(credential, owner/repo)` read, one slot per
/// repository: the slot's lock is the single flight.
#[derive(Default)]
pub(crate) struct RepositoryMemo {
    slots: std::sync::Mutex<
        std::collections::HashMap<(super::CachePartition, String), RepositorySlot>,
    >,
}

impl RepositoryMemo {
    fn slot(&self, key: (super::CachePartition, String)) -> RepositorySlot {
        let mut slots = self
            .slots
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        // Drop idle entries so a long session does not grow the map unbounded.
        if slots.len() > 256 {
            slots.retain(|_, slot| Arc::strong_count(slot) > 1);
        }
        slots.entry(key).or_default().clone()
    }
}
/// A 422 "cannot be searched" names what GitHub could not search: "users and
/// repositories" is the `repo:`/`user:` scope (the repository was not found,
/// not a bad query); "users" alone is a person qualifier (`author:`,
/// `assignee:`, …) whose login does not exist or is not visible.
fn unsearchable_repository(mut error: ProviderError) -> ProviderError {
    if error.status == Some(422) && error.message.contains("cannot be searched") {
        error.kind = ProviderErrorKind::NotFound;
        let reason = if error.message.contains("repositories") {
            super::ProviderErrorReason::RepositoryNotFound
        } else {
            super::ProviderErrorReason::UserNotFound
        };
        error = error.with_reason(reason);
    }
    error
}

fn decode<T: for<'de> Deserialize<'de>>(
    bytes: &[u8],
    message: &'static str,
) -> Result<T, ProviderError> {
    serde_json::from_slice(bytes)
        .map_err(|_| ProviderError::new(ProviderErrorKind::Decode, message))
}

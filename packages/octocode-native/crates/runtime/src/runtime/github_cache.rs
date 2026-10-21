//! The GitHub conditional cache on the shared [`Store`]. Provider cache
//! partitions are minted by the transport after credential pinning.
use crate::cache::{CacheClass, CacheConfig, CacheKey, Store};
use octocode_github::{CachedContent, ConditionalCache, Partition, Retention};
use std::{future::Future, path::PathBuf, pin::Pin, sync::Arc, time::Duration};

#[derive(Clone)]
pub(super) struct GitHubContentCache {
    store: Arc<Store<CachedContent>>,
}

impl GitHubContentCache {
    pub fn new(config: CacheConfig, disk: Option<PathBuf>) -> Self {
        Self {
            store: Arc::new(Store::new(config, disk)),
        }
    }

    pub fn clear_memory(&self) {
        self.store.clear_memory();
    }

    fn key(partition: &Partition, resource: &str) -> CacheKey {
        CacheKey {
            namespace: "github-content".into(),
            scope: partition.identity().to_owned(),
            resource: resource.into(),
        }
    }
}

/// How long an ETag'd read is served without asking GitHub.
const FRESH: Duration = Duration::from_secs(60);
/// Lifetime of a read GitHub sent no ETag for.
const TTL: Duration = Duration::from_secs(60);

/// The store class of a read the provider retains as `retention`.
fn class(retention: Retention, value: &CachedContent) -> CacheClass {
    let revalidate = |fresh| match value.etag {
        Some(_) => CacheClass::Revalidate { fresh },
        None => CacheClass::Volatile { ttl: TTL },
    };
    match retention {
        Retention::Pinned => CacheClass::Immutable,
        Retention::Revalidate => revalidate(FRESH),
        // Never fresh: every read is confirmed (a 304 is free).
        Retention::AlwaysRevalidate => revalidate(Duration::ZERO),
        Retention::Expires(ttl) => CacheClass::Volatile { ttl },
    }
}

fn entry_bytes(key: &CacheKey, value: &CachedContent) -> usize {
    value
        .bytes
        .len()
        .saturating_add(value.resolved_ref.len())
        .saturating_add(value.etag.as_ref().map_or(0, String::len))
        .saturating_add(key.resource.len())
        .saturating_add(key.scope.len())
        .saturating_add(std::mem::size_of::<CachedContent>())
}

impl ConditionalCache for GitHubContentCache {
    /// A fresh hit comes back without its ETag, so the provider serves it as
    /// is; a stale `Revalidate` hit (an always-revalidated history read is
    /// never fresh) keeps it for one conditional request. The body is shared
    /// with the entry.
    fn get<'a>(
        &'a self,
        partition: &'a Partition,
        key: &'a str,
    ) -> Pin<Box<dyn Future<Output = Option<CachedContent>> + Send + 'a>> {
        Box::pin(async move {
            let cached = self.store.get(&Self::key(partition, key))?;
            let mut value = (*cached.value).clone();
            if cached.fresh {
                value.etag = None;
            }
            Some(value)
        })
    }

    fn put<'a>(
        &'a self,
        partition: &'a Partition,
        key: String,
        value: CachedContent,
        retention: Retention,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            let class = class(retention, &value);
            let key = Self::key(partition, &key);
            let bytes = entry_bytes(&key, &value);
            self.store.put(key, value, bytes, class);
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::tests::json_files;
    use std::{fs, path::Path, time::Duration};

    async fn partition(identity: &str) -> Partition {
        use octocode_github::RequestBudget;
        use octocode_github::{
            CredentialSource, GitHubEndpoint, GitHubTransport, RequestContext, ResolvedCredential,
            RetryPolicy,
        };
        let (endpoint, credential) = identity.split_once('/').unwrap_or(("fixture", identity));
        let transport = GitHubTransport::new(
            GitHubEndpoint::new(
                format!("https://{endpoint}.example/api/v3")
                    .parse()
                    .unwrap(),
            )
            .unwrap(),
            RetryPolicy::default(),
        )
        .unwrap();
        transport
            .cache_partition(
                &RequestContext::new(
                    RequestBudget::with_timeout(Duration::from_secs(1), 1),
                    Some(ResolvedCredential::new(
                        credential,
                        CredentialSource::Override,
                    )),
                ),
                None,
            )
            .unwrap()
    }

    fn content(etag: Option<&str>) -> CachedContent {
        CachedContent {
            bytes: b"private source".to_vec().into(),
            etag: etag.map(str::to_owned),
            resolved_ref: "sha".into(),
        }
    }

    /// Rewind every disk entry by `seconds`, as if a later process read it.
    fn age_disk(dir: &Path, seconds: u64) {
        for file in json_files(dir) {
            let mut entry: serde_json::Value =
                serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
            let stored = entry["storedAtUnix"].as_u64().unwrap();
            entry["storedAtUnix"] = serde_json::json!(stored - seconds);
            fs::write(&file, serde_json::to_vec(&entry).unwrap()).unwrap();
        }
    }

    #[tokio::test]
    async fn disk_cache_isolates_endpoint_and_credential_partitions() {
        let dir = tempfile::tempdir().unwrap();
        let cache = || GitHubContentCache::new(CacheConfig::default(), Some(dir.path().into()));
        let first = partition("endpoint-a/credential-a").await;
        let other_credential = partition("endpoint-a/credential-b").await;
        let other_endpoint = partition("endpoint-b/credential-a").await;
        cache()
            .put(
                &first,
                "github-content:file".into(),
                content(None),
                Retention::Pinned,
            )
            .await;
        assert_eq!(
            cache().get(&first, "github-content:file").await,
            Some(content(None))
        );
        assert_eq!(
            cache().get(&other_credential, "github-content:file").await,
            None
        );
        assert_eq!(
            cache().get(&other_endpoint, "github-content:file").await,
            None
        );
    }

    /// SHA-pinned entries never expire and never revalidate, in memory or on
    /// disk; ETag listings are kept and revalidated after the fresh window;
    /// unpinned entries without an ETag expire.
    #[tokio::test]
    async fn commit_pinned_entries_outlive_the_ttl_and_listings_revalidate() {
        let dir = tempfile::tempdir().unwrap();
        let config = CacheConfig::default();
        let part = partition("endpoint/credential").await;
        let writer = GitHubContentCache::new(config.clone(), Some(dir.path().into()));
        for key in ["github-content:a", "git-tree:o/r:sha", "github-commit:a"] {
            writer
                .put(&part, key.into(), content(Some("v1")), Retention::Pinned)
                .await;
        }
        writer
            .put(
                &part,
                "github-tree:a".into(),
                content(Some("v1")),
                Retention::Revalidate,
            )
            .await;
        writer
            .put(
                &part,
                "github-ref:a".into(),
                content(None),
                Retention::Expires(Duration::from_secs(60)),
            )
            .await;
        // Inside the fresh window the listing is served without a request.
        assert_eq!(writer.get(&part, "github-tree:a").await.unwrap().etag, None);
        writer
            .put(
                &part,
                "github-history:a".into(),
                content(Some("v1")),
                Retention::AlwaysRevalidate,
            )
            .await;
        assert_eq!(
            writer.get(&part, "github-history:a").await.unwrap().etag,
            Some("v1".into()),
            "history is confirmed on every read"
        );

        age_disk(dir.path(), 3_600);
        let reader = GitHubContentCache::new(config, Some(dir.path().into()));
        for key in ["github-content:a", "git-tree:o/r:sha", "github-commit:a"] {
            let hit = reader.get(&part, key).await.expect(key);
            assert_eq!(hit.etag, None, "{key} is served without revalidation");
            assert_eq!(hit.bytes, &b"private source"[..]);
        }
        assert_eq!(
            reader.get(&part, "github-tree:a").await.unwrap().etag,
            Some("v1".into()),
            "a stale listing keeps its ETag for one conditional request"
        );
        assert_eq!(reader.get(&part, "github-ref:a").await, None);
    }

    /// A hit hands out the stored body, not a copy of it.
    #[tokio::test]
    async fn memory_hits_share_the_stored_body() {
        let part = partition("endpoint/credential").await;
        let cache = GitHubContentCache::new(CacheConfig::default(), None);
        cache
            .put(
                &part,
                "github-content:big".into(),
                CachedContent {
                    bytes: vec![b'x'; 4 << 20].into(),
                    etag: None,
                    resolved_ref: "sha".into(),
                },
                Retention::Pinned,
            )
            .await;
        let first = cache.get(&part, "github-content:big").await.unwrap();
        let second = cache.get(&part, "github-content:big").await.unwrap();
        assert_eq!(first.bytes.len(), 4 << 20);
        assert_eq!(first.bytes.as_ptr(), second.bytes.as_ptr());
    }

    #[tokio::test]
    async fn disk_bodies_are_base64_and_retired_arrays_are_discarded() {
        let dir = tempfile::tempdir().unwrap();
        let part = partition("endpoint/credential").await;
        let body = vec![b'a'; 3000];
        GitHubContentCache::new(CacheConfig::default(), Some(dir.path().into()))
            .put(
                &part,
                "github-content:k".into(),
                CachedContent {
                    bytes: body.clone().into(),
                    etag: None,
                    resolved_ref: "sha".into(),
                },
                Retention::Pinned,
            )
            .await;
        let file = json_files(dir.path()).pop().unwrap();
        let size = fs::metadata(&file).unwrap().len() as usize;
        // base64 is 4/3 of the body; a number array was ~3.5-4x.
        assert!(size < body.len() * 3 / 2, "disk entry is {size} bytes");
        let mut entry: serde_json::Value =
            serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        entry["value"]["bytes"] = serde_json::json!(b"legacy".to_vec());
        fs::write(&file, serde_json::to_vec(&entry).unwrap()).unwrap();
        let reader = GitHubContentCache::new(CacheConfig::default(), Some(dir.path().into()));
        // Derived data: an entry from the retired array format is a miss, and
        // the file is removed so the next read refetches it.
        assert!(reader.get(&part, "github-content:k").await.is_none());
        assert!(!file.exists());
    }
}

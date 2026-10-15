//! Test doubles shared by the GitHub tool tests: a provider aimed at a mock
//! server, the request context the runtime attaches, and the shared wiremock
//! mounts and responders.
use octocode_github::RequestBudget;
use octocode_github::{
    CredentialSource, GitHubBudget, GitHubEndpoint, GitHubProvider, GitHubTransport, NoCache,
    RequestContext, ResolvedCredential, RetryPolicy,
};
use std::time::Duration;
use wiremock::MockServer;

// The wiremock mounts and responders the github crate's tests use, by path.
#[path = "../../../../github/src/tests/mock_http.rs"]
#[allow(dead_code, reason = "the unit tests use a subset of the shared mocks")]
mod mock_http;
pub(crate) use mock_http::{Delayed, mount_json};

/// A provider whose GitHub API is `server`, with its own unthrottled budget: tests in one process never wait on each
/// other's search spacing (the process-wide budget is the github crate's
/// subject).
pub(crate) fn mock_provider(server: &MockServer, retry: RetryPolicy) -> GitHubProvider<NoCache> {
    let endpoint =
        GitHubEndpoint::new(url::Url::parse(&format!("{}/api/v3", server.uri())).expect("URL"))
            .expect("endpoint");
    GitHubProvider {
        transport: GitHubTransport::with_budget(endpoint, retry, GitHubBudget::relaxed())
            .expect("transport"),
        cache: NoCache,
    }
}

/// [`mock_provider`] that sends each request once: a failure surfaces as it
/// happened instead of after retries.
pub(crate) fn one_shot_provider(server: &MockServer) -> GitHubProvider<NoCache> {
    mock_provider(
        server,
        RetryPolicy {
            max_attempts: 1,
            ..Default::default()
        },
    )
}

/// A request carrying the fixed `fixture` credential, as the runtime
/// attaches the credential it resolved for each request.
pub(crate) fn fixture_context(timeout: Duration, max_body_bytes: usize) -> RequestContext {
    RequestContext::new(
        RequestBudget::with_timeout(timeout, max_body_bytes),
        Some(ResolvedCredential::new(
            "fixture",
            CredentialSource::Override,
        )),
    )
}

/// [`fixture_context`] with the budget most tests need: 5 s and a 1 MiB body.
pub(crate) fn default_context() -> RequestContext {
    fixture_context(Duration::from_secs(5), 1 << 20)
}

/// A response cache that keeps every entry in memory, across partitions, as
/// the runtime's does for its volatile window.
#[derive(Default)]
pub(crate) struct MemoryCache(
    std::sync::Mutex<std::collections::HashMap<String, octocode_github::CachedContent>>,
);

impl MemoryCache {
    /// The map, recovered when a panicking test poisoned the lock.
    fn entries(
        &self,
    ) -> std::sync::MutexGuard<'_, std::collections::HashMap<String, octocode_github::CachedContent>>
    {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

impl octocode_github::ConditionalCache for MemoryCache {
    fn get<'a>(
        &'a self,
        _: &'a octocode_github::Partition,
        key: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Option<octocode_github::CachedContent>> + Send + 'a>,
    > {
        let hit = self.entries().get(key).cloned();
        Box::pin(async move { hit })
    }
    fn put<'a>(
        &'a self,
        _: &'a octocode_github::Partition,
        key: String,
        value: octocode_github::CachedContent,
        _: octocode_github::Retention,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        self.entries().insert(key, value);
        Box::pin(async {})
    }
}

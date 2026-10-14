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

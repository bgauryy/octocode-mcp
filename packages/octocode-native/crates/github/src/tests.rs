use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path, query_param},
};

use super::*;

mod mock_http;
use mock_http::{Arrivals, Delayed, Sequence, mount_json};

fn api_github_com() -> GitHubEndpoint {
    GitHubEndpoint::new(url::Url::parse("https://api.github.com/").expect("URL")).expect("endpoint")
}

/// A request with a `timeout` budget carrying `token`.
fn with_token(token: &str, timeout: Duration, max_body_bytes: usize) -> RequestContext {
    RequestContext::new(
        RequestBudget::with_timeout(timeout, max_body_bytes),
        Some(ResolvedCredential::new(
            token,
            CredentialSource::Environment,
        )),
    )
}
#[derive(Default)]
struct MemoryCache(Mutex<Option<CachedContent>>);

/// A 403 secondary rate limit, with `retry-after` when given.
fn secondary_limit(retry_after: Option<&str>) -> ResponseTemplate {
    let response = ResponseTemplate::new(403)
        .insert_header("x-ratelimit-remaining", "21")
        .set_body_json(serde_json::json!({
            "message": "You have exceeded a secondary rate limit. Please wait a few minutes before you try again."
        }));
    match retry_after {
        Some(retry_after) => response.insert_header("retry-after", retry_after),
        None => response,
    }
}

fn ok_json() -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(serde_json::json!({"ok": true}))
}

impl ConditionalCache for MemoryCache {
    // Single-slot body cache: ref memo entries (`github-ref:`) are not stored
    // so each test controls ref resolution through its mocks.
    fn get<'a>(
        &'a self,
        _: &'a Partition,
        key: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<CachedContent>> + Send + 'a>>
    {
        Box::pin(async move {
            if key.starts_with("github-ref:") {
                return None;
            }
            self.0.lock().expect("cache lock").clone()
        })
    }
    fn put<'a>(
        &'a self,
        _: &'a Partition,
        key: String,
        value: CachedContent,
        _: Retention,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            if !key.starts_with("github-ref:") {
                *self.0.lock().expect("cache lock") = Some(value);
            }
        })
    }
}

/// A keyed in-memory cache that honors partitions, for transport-level reads.
#[derive(Default)]
struct PartitionedCache(Mutex<std::collections::HashMap<(String, String), CachedContent>>);
impl ConditionalCache for PartitionedCache {
    fn get<'a>(
        &'a self,
        partition: &'a Partition,
        key: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<CachedContent>> + Send + 'a>>
    {
        Box::pin(async move {
            let mut value = self
                .0
                .lock()
                .expect("cache lock")
                .get(&(partition.identity().to_owned(), key.to_owned()))
                .cloned()?;
            // Pinned commits are fresh; everything else revalidates.
            if key.starts_with("github-commit:") {
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
        _: Retention,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            self.0
                .lock()
                .expect("cache lock")
                .insert((partition.identity().to_owned(), key), value);
        })
    }
}

/// The GitHub endpoint `server` serves.
fn mock_endpoint(server: &MockServer) -> GitHubEndpoint {
    GitHubEndpoint::new(url::Url::parse(&format!("{}/api/v3", server.uri())).expect("URL"))
        .expect("endpoint")
}

/// An anonymous transport to `endpoint` with the default retry policy.
fn anonymous_transport(endpoint: &GitHubEndpoint) -> GitHubTransport {
    GitHubTransport::new(endpoint.clone(), RetryPolicy::default()).expect("transport")
}

/// A read of `path` in `a/b` at `main`.
fn main_file(path: &str, force_refresh: bool) -> ContentRequest {
    ContentRequest {
        owner: "a".into(),
        repo: "b".into(),
        path: path.into(),
        reference: Some("main".into()),
        force_refresh,
    }
}

/// `GET x` through `transport`, with a 2 s deadline and a `max_bytes` body cap.
async fn get_x(
    transport: &GitHubTransport,
    endpoint: &GitHubEndpoint,
    max_bytes: usize,
) -> Result<ResponsePage, ProviderError> {
    transport
        .execute(
            RequestSpec::get(endpoint.rest(&["x"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(2), max_bytes),
        )
        .await
}

/// Requests to it carry the `"secret"` token through [`with_token`].
async fn provider(server: &MockServer) -> GitHubProvider<MemoryCache> {
    let endpoint = mock_endpoint(server);
    let transport = GitHubTransport::new(
        endpoint,
        RetryPolicy {
            max_attempts: 2,
            base_delay: Duration::from_millis(1),
            max_retry_after: Duration::from_secs(1),
            max_rate_limit_wait: Duration::from_secs(1),
        },
    )
    .expect("transport");
    GitHubProvider {
        transport,
        cache: MemoryCache::default(),
    }
}

#[tokio::test]
async fn ghes_content_route_auth_and_decode() {
    let server = MockServer::builder().start().await;
    let sha = "0123456789abcdef0123456789abcdef01234567";
    mount_json(
        &server,
        "/api/v3/repos/acme/repo/commits/main",
        200,
        serde_json::json!({"sha":sha}),
    )
    .await;
    Mock::given(method("GET")).and(path("/api/v3/repos/acme/repo/contents/src%2Flib.rs")).and(query_param("ref",sha)).and(header("authorization","Bearer secret"))
        .respond_with(ResponseTemplate::new(200).insert_header("etag","\"v1\"").set_body_json(serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode("hello\n")}))).mount(&server).await;
    let result = provider(&server)
        .await
        .get_file_content(
            &ContentRequest {
                owner: "acme".into(),
                repo: "repo".into(),
                path: "src/lib.rs".into(),
                reference: Some("main".into()),
                force_refresh: false,
            },
            &with_token("secret", Duration::from_secs(2), 1024),
        )
        .await
        .expect("content");
    assert_eq!(result.bytes, &b"hello\n"[..]);
    assert_eq!(result.etag.as_deref(), Some("\"v1\""));
    assert!(!result.from_cache);
}

async fn keyed_provider(server: &MockServer) -> GitHubProvider<KeyedCache> {
    let GitHubProvider { transport, .. } = provider(server).await;
    GitHubProvider {
        transport,
        cache: KeyedCache::default(),
    }
}

fn file_at(path: &str, reference: &str) -> ContentRequest {
    ContentRequest {
        owner: "a".into(),
        repo: "b".into(),
        path: path.into(),
        reference: Some(reference.into()),
        force_refresh: false,
    }
}

async fn mount_file(server: &MockServer, path_pattern: &str, delay: Duration) {
    Mock::given(method("GET"))
        .and(path(path_pattern))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("etag", "\"v1\"")
                .set_delay(delay)
                .set_body_json(serde_json::json!({
                    "type":"file","encoding":"base64","content":STANDARD.encode("body\n")})),
        )
        .mount(server)
        .await;
}

async fn requests_to(server: &MockServer, route: &str) -> usize {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|request| request.url.path().starts_with(route))
        .count()
}

/// Identical concurrent reads take turns on one flight: the first fetches,
/// the others read what it cached.
#[tokio::test]
async fn concurrent_identical_reads_send_one_request() {
    let server = MockServer::builder().start().await;
    let sha = "1111111111111111111111111111111111111111";
    mount_file(
        &server,
        "/api/v3/repos/a/b/contents/flight.rs",
        Duration::from_millis(150),
    )
    .await;
    let provider = keyed_provider(&server).await;
    let context = with_token("secret", Duration::from_secs(5), 1024);
    let request = file_at("flight.rs", sha);
    let (first, second) = tokio::join!(
        provider.get_file_content(&request, &context),
        provider.get_file_content(&request, &context),
    );
    let (first, second) = (first.expect("first"), second.expect("second"));
    assert_eq!(first.bytes, second.bytes);
    assert!(
        first.from_cache != second.from_cache,
        "one read is the cached one"
    );
    assert_eq!(requests_to(&server, "/api/v3/repos/a/b/contents").await, 1);
}

/// A waiter on an identical read's or ref resolution's flight stops on its
/// own cancellation, while the first request is still in flight.
#[tokio::test]
async fn a_cancelled_flight_waiter_stops_before_the_holder_finishes() {
    // The holders' answers outlast any runner's stall: each waiter must
    // answer while its holder's request is still at the server, and the
    // test then cancels the holder instead of waiting for the answer.
    const HELD: Duration = Duration::from_secs(60);
    let server = MockServer::builder().start().await;
    let sha = "4444444444444444444444444444444444444444";
    let arrived = Arc::new(tokio::sync::Notify::new());
    let held = |template: ResponseTemplate| Delayed {
        arrived: Some(Arc::clone(&arrived)),
        ..Delayed::new(HELD, template)
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/held.rs"))
        .respond_with(held(
            ResponseTemplate::new(200)
                .insert_header("etag", "\"v1\"")
                .set_body_json(serde_json::json!({
                    "type":"file","encoding":"base64","content":STANDARD.encode("body\n")})),
        ))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/held-ref"))
        .respond_with(held(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({"sha":sha})),
        ))
        .mount(&server)
        .await;
    let provider = keyed_provider(&server).await;
    let request = file_at("held.rs", sha);
    let call = |call: &'static str, context: RequestContext| {
        let (provider, request) = (&provider, &request);
        async move {
            match call {
                "content" => provider.get_file_content(request, &context).await.map(drop),
                _ => provider
                    .resolve_reference("a", "b", Some("held-ref"), false, &context)
                    .await
                    .map(drop),
            }
        }
    };
    for name in ["content", "ref"] {
        let holder = with_token("secret", Duration::from_secs(10), 1024);
        let release_holder = holder.budget.cancellation.clone();
        let mut holding = std::pin::pin!(call(name, holder));
        // The waiter joins once the holder's request reached the server,
        // so the holder has the turn; then it is cancelled while waiting.
        let waiting = async {
            arrived.notified().await;
            let context = with_token("secret", Duration::from_secs(10), 1024);
            let cancellation = context.budget.cancellation.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(100)).await;
                cancellation.cancel();
            });
            call(name, context).await.expect_err("cancelled").kind
        };
        let waited = tokio::select! {
            kind = waiting => kind,
            answered = &mut holding => panic!("the {name} holder answered first: {answered:?}"),
        };
        assert_eq!(waited, ProviderErrorKind::Cancelled, "{name}");
        release_holder.cancel();
        assert_eq!(
            holding.await.expect_err("the holder is cancelled").kind,
            ProviderErrorKind::Cancelled,
            "{name}"
        );
    }
    // Neither waiter sent a request of its own.
    assert_eq!(requests_to(&server, "/api/v3/repos/a/b/contents").await, 1);
    assert_eq!(requests_to(&server, "/api/v3/repos/a/b/commits").await, 1);
}

/// Content at a commit SHA never changes: a cached read is served without
/// asking GitHub again, whether the caller named the SHA or a branch that
/// resolved to it (the ref resolution decides freshness).
#[tokio::test]
async fn a_cached_read_at_a_resolved_sha_is_not_revalidated() {
    let server = MockServer::builder().start().await;
    let sha = "2222222222222222222222222222222222222222";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":sha}),
    )
    .await;
    mount_file(
        &server,
        "/api/v3/repos/a/b/contents/pinned.rs",
        Duration::ZERO,
    )
    .await;
    mount_file(
        &server,
        "/api/v3/repos/a/b/contents/branch.rs",
        Duration::ZERO,
    )
    .await;
    let provider = keyed_provider(&server).await;
    let context = with_token("secret", Duration::from_secs(5), 1024);
    for _ in 0..2 {
        provider
            .get_file_content(&file_at("pinned.rs", sha), &context)
            .await
            .expect("pinned read");
    }
    assert_eq!(
        server.received_requests().await.unwrap_or_default().len(),
        1
    );
    for _ in 0..2 {
        provider
            .get_file_content(&file_at("branch.rs", "main"), &context)
            .await
            .expect("branch read");
    }
    // One ref resolution (memoized) and one content read.
    assert_eq!(requests_to(&server, "/api/v3/repos/a/b/commits").await, 1);
    assert_eq!(
        requests_to(&server, "/api/v3/repos/a/b/contents/branch.rs").await,
        1
    );
}

/// A cached body at the resolved commit is served as is: no conditional
/// request, no 304 round trip.
#[tokio::test]
async fn a_cached_body_is_served_without_a_request() {
    let server = MockServer::builder().start().await;
    let provider = provider(&server).await;
    let sha = "0123456789abcdef0123456789abcdef01234567";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":sha}),
    )
    .await;
    *provider.cache.0.lock().expect("cache lock") = Some(CachedContent {
        etag: Some("\"v1\"".into()),
        bytes: b"cached".to_vec().into(),
        resolved_ref: sha.into(),
    });
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/x"))
        .respond_with(ResponseTemplate::new(304))
        .expect(0)
        .mount(&server)
        .await;
    let result = provider
        .get_file_content(
            &main_file("x", false),
            &with_token("secret", Duration::from_secs(2), 1024),
        )
        .await
        .expect("cached");
    assert_eq!(result.bytes, &b"cached"[..]);
    assert!(result.from_cache);
    assert_eq!(result.raw_response_bytes, 0);
    assert_eq!(result.resolved_ref, sha);
}

#[tokio::test]
async fn distinguishes_permission_from_rate_limit_and_bounds_body() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(403)
                .insert_header("x-github-request-id", "R1")
                .insert_header("x-ratelimit-remaining", "1")
                .set_body_json(serde_json::json!({"message":"forbidden"})),
        )
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let error = get_x(&anonymous_transport(&endpoint), &endpoint, 1024)
        .await
        .expect_err("permission");
    assert_eq!(error.kind, ProviderErrorKind::Permission);
    assert_eq!(error.request_id.as_deref(), Some("R1"));

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![0; 17]))
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let error = get_x(&anonymous_transport(&endpoint), &endpoint, 16)
        .await
        .expect_err("limit");
    assert_eq!(error.kind, ProviderErrorKind::ResponseTooLarge);
}

#[tokio::test]
async fn pagination_respects_last_page_only_for_matching_numbered_links() {
    for (next_query, last_route, has_next) in [
        ("page=4", "items?page=3", false),
        ("page=3", "items?page=3", true),
        ("after=opaque", "items?page=3", true),
        ("page=4&per_page=1", "items?page=3&per_page=2", true),
        ("page=4", "other?page=3", true),
    ] {
        let server = MockServer::builder().start().await;
        let next = format!("{}/api/v3/items?{next_query}", server.uri());
        let last = format!("{}/api/v3/{last_route}", server.uri());
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header(
                        "link",
                        format!("<{next}>; rel=\"next\", <{last}>; rel=\"last\""),
                    )
                    .set_body_bytes(b"[]"),
            )
            .mount(&server)
            .await;
        let endpoint = mock_endpoint(&server);
        let transport = anonymous_transport(&endpoint);
        let response = transport
            .execute(
                RequestSpec::get(endpoint.rest(&["items"]).expect("route")),
                &RequestContext::with_timeout(Duration::from_secs(5), 16),
            )
            .await
            .expect("page");
        assert_eq!(
            response.next.is_some(),
            has_next,
            "{next_query}, {last_route}"
        );
        if let Some(actual) = response.next {
            assert_eq!(actual.as_str(), next);
        }
    }
}

#[tokio::test]
async fn returns_same_origin_next_page_and_rejects_redirects() {
    let server = MockServer::builder().start().await;
    let next = format!("{}/api/v3/items?page=2", server.uri());
    Mock::given(method("GET"))
        .and(path("/api/v3/items"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("link", format!("<{next}>; rel=\"next\""))
                .set_body_bytes(b"[]"),
        )
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = anonymous_transport(&endpoint);
    let page = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["items"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(2), 16),
        )
        .await
        .expect("page");
    assert_eq!(page.next.expect("next").as_str(), next);

    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "https://example.com"))
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let error = get_x(&anonymous_transport(&endpoint), &endpoint, 16)
        .await
        .expect_err("redirect");
    assert_eq!(error.kind, ProviderErrorKind::RedirectDenied);
}

#[tokio::test]
async fn retries_secondary_rate_limit_without_remaining_zero() {
    let server = MockServer::builder().start().await;
    let limited = Sequence::new(vec![secondary_limit(Some("1")), ok_json()]);
    let hits = limited.arrivals.clone();
    Mock::given(method("GET"))
        .respond_with(limited)
        .expect(2)
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = GitHubTransport::with_budget(
        endpoint.clone(),
        RetryPolicy {
            max_attempts: 3,
            base_delay: Duration::from_millis(1),
            max_retry_after: Duration::from_secs(5),
            max_rate_limit_wait: Duration::from_secs(5),
        },
        GitHubBudget::relaxed(),
    )
    .expect("transport");
    let page = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["search", "issues"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(5), 1024),
        )
        .await
        .expect("retried");
    assert_eq!(page.status, 200);
    assert_eq!(hits.count(), 2);
}

#[tokio::test]
async fn projects_rate_limit_metadata_without_retrying_long_delays() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(429)
                .insert_header("retry-after", "60")
                .insert_header("x-ratelimit-remaining", "0")
                .insert_header("x-ratelimit-reset", "1900000000")
                .set_body_json(serde_json::json!({"message":"rate limited"})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = anonymous_transport(&endpoint);
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["rate"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(2), 1024),
        )
        .await
        .expect_err("rate limit");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    assert_eq!(
        error.rate_limit,
        Some(Box::new(RateLimit {
            remaining: Some(0),
            reset_epoch_seconds: Some(1_900_000_000),
            retry_after_seconds: Some(60),
            resource: Some("core".into()),
        }))
    );
}

#[tokio::test]
async fn cancellation_interrupts_an_inflight_response() {
    let server = MockServer::builder().start().await;
    // The server signals once the request arrives, so the cancel lands while
    // the delayed response is in flight rather than after a guessed sleep.
    let arrived = Arc::new(tokio::sync::Notify::new());
    Mock::given(method("GET"))
        .respond_with(Delayed {
            arrived: Some(arrived.clone()),
            ..Delayed::new(Duration::from_secs(2), ResponseTemplate::new(200))
        })
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = anonymous_transport(&endpoint);
    let context = RequestContext::with_timeout(Duration::from_secs(3), 16);
    let cancellation = context.budget.cancellation.clone();
    tokio::spawn(async move {
        arrived.notified().await;
        cancellation.cancel();
    });
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["slow"]).expect("route")),
            &context,
        )
        .await
        .expect_err("cancelled");
    assert_eq!(error.kind, ProviderErrorKind::Cancelled);
}

#[tokio::test]
async fn rejects_cross_origin_pagination() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("link", "<https://evil.example/items?page=2>; rel=\"next\"")
                .set_body_bytes(b"[]"),
        )
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = anonymous_transport(&endpoint);
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["items"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(2), 16),
        )
        .await
        .expect_err("origin");
    assert_eq!(error.kind, ProviderErrorKind::RedirectDenied);
}

#[tokio::test]
async fn preserves_graphql_partial_data_and_errors() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/api/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data":{"repository":{"name":"repo"}},
            "errors":[{"message":"field denied","path":["repository","secret"],"extensions":{"type":"FORBIDDEN"}}]
        })))
        .mount(&server)
        .await;
    let transport = anonymous_transport(&mock_endpoint(&server));
    let page = transport
        .execute_graphql(
            "query Q { repository { name } }",
            serde_json::json!({}),
            &RequestContext::with_timeout(Duration::from_secs(2), 1024),
        )
        .await
        .expect("graphql");
    assert_eq!(page.data.expect("data")["repository"]["name"], "repo");
    assert_eq!(page.errors[0].message, "field denied");
    assert_eq!(page.errors[0].extensions["type"], "FORBIDDEN");
}

#[tokio::test]
async fn cache_partition_covers_endpoint_credential_and_session() {
    let server = MockServer::builder().start().await;
    let endpoint = mock_endpoint(&server);
    let transport = GitHubTransport::new(endpoint, RetryPolicy::default()).expect("transport");
    let context = with_token("one", Duration::from_secs(2), 16);
    let a = transport
        .cache_partition(&context, Some("a"))
        .expect("partition");
    let b = transport
        .cache_partition(&context, Some("b"))
        .expect("partition");
    assert_ne!(a, b);
    let other = transport
        .cache_partition(&with_token("two", Duration::from_secs(2), 16), Some("a"))
        .expect("partition");
    assert_ne!(a, other);
    let anonymous = transport
        .cache_partition(
            &RequestContext::with_timeout(Duration::from_secs(2), 16),
            Some("a"),
        )
        .expect("partition");
    assert_ne!(a, anonymous);
}

/// One transport serves many requests; each carries its own context's
/// credential (a credential rotated between requests is used at once).
#[tokio::test]
async fn each_request_carries_its_own_context_credential() {
    let server = MockServer::builder().start().await;
    for token in ["one", "two"] {
        Mock::given(method("GET"))
            .and(header("authorization", format!("Bearer {token}").as_str()))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(token.as_bytes()))
            .expect(1)
            .mount(&server)
            .await;
    }
    let endpoint = mock_endpoint(&server);
    let transport =
        GitHubTransport::new(endpoint.clone(), RetryPolicy::default()).expect("transport");
    for token in ["one", "two"] {
        let page = transport
            .execute(
                RequestSpec::get(endpoint.rest(&["x"]).expect("route")),
                &with_token(token, Duration::from_secs(2), 16),
            )
            .await
            .expect("request");
        assert_eq!(page.body.as_ref(), token.as_bytes());
    }
}

#[test]
fn canonicalizes_github_dot_com_credential_host() {
    assert_eq!(api_github_com().credential_host(), "github.com");
    let ghes = GitHubEndpoint::new(url::Url::parse("https://ghe.example/api/v3").expect("URL"))
        .expect("endpoint");
    assert_eq!(ghes.credential_host(), "ghe.example");
}

#[tokio::test]
async fn content_413_falls_back_to_parent_directory_and_blob() {
    let server = MockServer::builder().start().await;
    let commit = "0123456789abcdef0123456789abcdef01234567";
    let blob = "89abcdef0123456789abcdef0123456789abcdef";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":commit}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/a/b/contents/dir%2Flarge.txt",
        413,
        serde_json::json!({"message":"too large"}),
    )
    .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/contents/dir"))
        .and(query_param("ref", commit))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!([{"name":"large.txt","sha":blob,"type":"file"}])),
        )
        .mount(&server)
        .await;
    // The blob is read raw: its bytes, no base64 JSON body.
    Mock::given(method("GET"))
        .and(path(format!("/api/v3/repos/a/b/git/blobs/{blob}")))
        .and(header("accept", "application/vnd.github.raw"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes("large body"))
        .mount(&server)
        .await;
    let result = provider(&server)
        .await
        .get_file_content(
            &main_file("dir/large.txt", false),
            &with_token("secret", Duration::from_secs(2), 4096),
        )
        .await
        .expect("fallback");
    assert_eq!(result.bytes, &b"large body"[..]);
    assert_eq!(result.resolved_ref, commit);
}

#[tokio::test]
async fn content_encoding_none_for_large_file_fetches_blob() {
    // GitHub returns 200 with `encoding:"none"` and empty content for files
    // between 1 MB and 100 MB; the bytes must come from git/blobs/{sha}.
    let server = MockServer::builder().start().await;
    let commit = "0123456789abcdef0123456789abcdef01234567";
    let blob = "89abcdef0123456789abcdef0123456789abcdef";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":commit}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/a/b/contents/big.txt",
        200,
        serde_json::json!({
            "type":"file","encoding":"none","content":"","size":2_000_000,"sha":blob
        }),
    )
    .await;
    // The blob is read raw: its bytes, no base64 JSON body.
    Mock::given(method("GET"))
        .and(path(format!("/api/v3/repos/a/b/git/blobs/{blob}")))
        .and(header("accept", "application/vnd.github.raw"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes("large body"))
        .mount(&server)
        .await;
    let result = provider(&server)
        .await
        .get_file_content(
            &main_file("big.txt", true),
            &with_token("secret", Duration::from_secs(2), 4096),
        )
        .await
        .expect("blob fallback");
    assert_eq!(result.bytes, &b"large body"[..]);
}

/// A file read asks for the raw media type: GitHub answers a file of any
/// size up to 100 MB with its own bytes (no base64 body, no second blob
/// read), and a binary one is refused with the blob SHA its ETag names.
#[tokio::test]
async fn a_file_read_takes_the_raw_bytes_in_one_request() {
    let server = MockServer::builder().start().await;
    let commit = "0123456789abcdef0123456789abcdef01234567";
    let blob = "89abcdef0123456789abcdef0123456789abcdef";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":commit}),
    )
    .await;
    for (file, body) in [
        ("big.txt", &b"large body"[..]),
        ("image.bin", &b"\0binary"[..]),
    ] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/a/b/contents/{file}")))
            .and(header("accept", "application/vnd.github.raw"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/vnd.github.raw; charset=utf-8")
                    .insert_header("etag", format!("\"{blob}\"").as_str())
                    .set_body_bytes(body),
            )
            .expect(1)
            .mount(&server)
            .await;
    }
    Mock::given(method("GET"))
        .and(wiremock::matchers::path_regex("/git/blobs/"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&server)
        .await;
    let provider = provider(&server).await;
    let context = with_token("secret", Duration::from_secs(2), 4096);
    let result = provider
        .get_file_content(&main_file("big.txt", true), &context)
        .await
        .expect("raw read");
    assert_eq!(result.bytes, &b"large body"[..]);
    let binary = provider
        .get_file_content(&main_file("image.bin", true), &context)
        .await
        .expect_err("binary text read");
    assert_eq!(binary.reason, Some(crate::ProviderErrorReason::BinaryFile));
    assert!(binary.message.contains(blob), "{}", binary.message);
}

#[tokio::test]
async fn raw_content_keeps_binary_bytes_through_every_acquisition_and_cache_path() {
    let commit = "0123456789abcdef0123456789abcdef01234567";
    let blob = "89abcdef0123456789abcdef0123456789abcdef";
    let bytes = b"\x89PNG\r\n\x1a\n\0binary";
    for route in ["inline", "blob", "directory"] {
        let server = MockServer::builder().start().await;
        let payload = match route {
            "inline" => {
                serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(bytes),"sha":blob})
            }
            "blob" => {
                serde_json::json!({"type":"file","encoding":"none","content":"","size":bytes.len(),"sha":blob})
            }
            _ => serde_json::json!({"message":"too large"}),
        };
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/dir%2Fimage.png",
            if route == "directory" { 413 } else { 200 },
            payload,
        )
        .await;
        if route == "directory" {
            mount_json(
                &server,
                "/api/v3/repos/a/b/contents/dir",
                200,
                serde_json::json!([{"name":"image.png","type":"file","sha":blob}]),
            )
            .await;
        }
        if route != "inline" {
            Mock::given(method("GET"))
                .and(path(format!("/api/v3/repos/a/b/git/blobs/{blob}")))
                .and(header("accept", "application/vnd.github.raw"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(&bytes[..]))
                .mount(&server)
                .await;
        }
        let provider = provider(&server).await;
        let request = file_at("dir/image.png", commit);
        let context = with_token("secret", Duration::from_secs(2), 4096);
        let response = provider
            .get_file_bytes(&request, &context)
            .await
            .expect(route);
        assert_eq!(response.bytes, &bytes[..], "{route}");
        assert_eq!(response.resolved_ref, commit);
        assert!(!response.from_cache);
        let cached = provider
            .get_file_bytes(&request, &context)
            .await
            .expect("cached bytes");
        assert_eq!(cached.bytes, response.bytes);
        assert!(cached.from_cache);
        let error = provider
            .get_file_content(&request, &context)
            .await
            .expect_err("text reader refuses cached binary");
        assert_eq!(error.reason, Some(ProviderErrorReason::BinaryFile));
        assert_eq!(
            server.received_requests().await.unwrap().len(),
            match route {
                "inline" => 1,
                "blob" => 2,
                _ => 3,
            }
        );
    }
}

#[tokio::test]
async fn content_directory_symlink_and_submodule_get_clear_errors() {
    let server = MockServer::builder().start().await;
    let commit = "0123456789abcdef0123456789abcdef01234567";
    mount_json(
        &server,
        "/api/v3/repos/a/b/commits/main",
        200,
        serde_json::json!({"sha":commit}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/a/b/contents/src",
        200,
        serde_json::json!([
            {"name":"lib.rs","path":"src/lib.rs","type":"file"}
        ]),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/a/b/contents/link",
        200,
        serde_json::json!({"type":"symlink","target":"src/lib.rs"}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/a/b/contents/vendor",
        200,
        serde_json::json!({"type":"submodule","submodule_git_url":"https://x/y.git"}),
    )
    .await;
    let provider = provider(&server).await;
    let read = |p: &'static str| {
        let provider = &provider;
        async move {
            provider
                .get_file_content(
                    &main_file(p, true),
                    &with_token("secret", Duration::from_secs(2), 4096),
                )
                .await
                .expect_err("not a file")
        }
    };
    let dir = read("src").await;
    assert_eq!(dir.kind, ProviderErrorKind::Validation);
    assert!(dir.message.contains("is a directory"), "{}", dir.message);
    assert_eq!(
        dir.reason,
        Some(super::ProviderErrorReason::PathIsDirectory)
    );
    let link = read("link").await;
    assert!(link.message.contains("symlink"), "{}", link.message);
    assert!(link.message.contains("src/lib.rs"), "{}", link.message);
    let module = read("vendor").await;
    assert!(module.message.contains("submodule"), "{}", module.message);
}

#[tokio::test]
async fn retries_transient_server_failure_once() {
    let server = MockServer::builder().start().await;
    let flaky = Sequence::new(vec![
        ResponseTemplate::new(500),
        ResponseTemplate::new(200).set_body_bytes(b"ok"),
    ]);
    let attempts = flaky.arrivals.clone();
    Mock::given(method("GET"))
        .respond_with(flaky)
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = GitHubTransport::new(
        endpoint.clone(),
        RetryPolicy {
            max_attempts: 2,
            base_delay: Duration::from_millis(1),
            max_retry_after: Duration::from_secs(1),
            max_rate_limit_wait: Duration::from_secs(1),
        },
    )
    .expect("transport");
    let page = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["flaky"]).expect("route")),
            &RequestContext::with_timeout(Duration::from_secs(2), 16),
        )
        .await
        .expect("retry");
    assert_eq!(page.body, b"ok".as_slice());
    assert_eq!(attempts.count(), 2);
}

#[test]
fn routes_graphql_and_escapes_content_path_as_one_segment() {
    let endpoint = GitHubEndpoint::new(url::Url::parse("https://ghe.example/api/v3").expect("URL"))
        .expect("endpoint");
    assert_eq!(
        endpoint.graphql().as_str(),
        "https://ghe.example/api/graphql"
    );
    assert_eq!(
        endpoint
            .rest(&["repos", "a", "b", "contents", "dir/a b.rs"])
            .expect("route")
            .as_str(),
        "https://ghe.example/api/v3/repos/a/b/contents/dir%2Fa%20b.rs"
    );
}

// ── Keyed executor: Octokit throttling/retry parity ─────────────────────────

fn executor_transport(
    server: &MockServer,
    budget: Arc<GitHubBudget>,
    retry: RetryPolicy,
) -> (GitHubTransport, GitHubEndpoint) {
    let endpoint = mock_endpoint(server);
    let transport =
        GitHubTransport::with_budget(endpoint.clone(), retry, budget).expect("transport");
    (transport, endpoint)
}

fn short_retry() -> RetryPolicy {
    RetryPolicy {
        max_attempts: 3,
        base_delay: Duration::from_millis(1),
        max_retry_after: Duration::from_secs(5),
        max_rate_limit_wait: Duration::from_secs(5),
    }
}

fn epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs()
}

/// A 403 primary (core) rate limit that resets at epoch second `reset`.
fn primary_limit(reset: u64) -> ResponseTemplate {
    ResponseTemplate::new(403)
        .insert_header("x-ratelimit-remaining", "0")
        .insert_header("x-ratelimit-reset", reset.to_string().as_str())
        .insert_header("x-ratelimit-resource", "core")
        .set_body_json(serde_json::json!({"message": "API rate limit exceeded"}))
}

#[tokio::test]
async fn primary_limit_waits_for_a_short_reset_then_retries() {
    let server = MockServer::builder().start().await;
    let reset = epoch_secs() + 1;
    Mock::given(method("GET"))
        .respond_with(Sequence::new(vec![primary_limit(reset), ok_json()]))
        .expect(2)
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let page = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "b"]).expect("route")),
            &with_token("t", Duration::from_secs(5), 1024),
        )
        .await
        .expect("retried after reset");
    assert_eq!(page.status, 200);
    assert!(epoch_secs() >= reset, "retried before the reset");
}

/// A rate-limit wait runs on the call's time, not the request's: a 1.5 s
/// request budget survives a 2–3 s reset wait, and the retried request still
/// gets its own time. Without a call deadline past the request's, the same
/// wait fails fast.
#[tokio::test]
async fn rate_limit_waits_do_not_spend_the_request_timeout() {
    let server = MockServer::builder().start().await;
    let reset = epoch_secs() + 3;
    Mock::given(method("GET"))
        .respond_with(Sequence::new(vec![primary_limit(reset), ok_json()]))
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let mut context = with_token("t", Duration::from_millis(1_500), 1024);
    context.budget.wait_until = std::time::Instant::now() + Duration::from_secs(10);
    let page = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "b"]).expect("route")),
            &context,
        )
        .await
        .expect("waited for the reset on the call's time");
    assert_eq!(page.status, 200);
    assert!(context.budget.effective_deadline() > context.budget.deadline);

    let reset = epoch_secs() + 3;
    let other = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(Sequence::new(vec![primary_limit(reset), ok_json()]))
        .mount(&other)
        .await;
    let (transport, endpoint) = executor_transport(&other, GitHubBudget::relaxed(), short_retry());
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "b"]).expect("route")),
            &with_token("t", Duration::from_millis(1_500), 1024),
        )
        .await
        .expect_err("no call time past the request's");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
}

#[tokio::test]
async fn primary_limit_fails_fast_and_blocks_later_sends_until_reset() {
    let server = MockServer::builder().start().await;
    let reset = epoch_secs() + 3600;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(403)
                .insert_header("x-ratelimit-remaining", "0")
                .insert_header("x-ratelimit-reset", reset.to_string().as_str())
                .insert_header("x-ratelimit-resource", "core")
                .set_body_json(serde_json::json!({"message": "API rate limit exceeded"})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let context = with_token("t", Duration::from_secs(5), 1024);
    let first = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "b"]).expect("route")),
            &context,
        )
        .await
        .expect_err("primary limit");
    assert_eq!(first.kind, ProviderErrorKind::RateLimited);
    let rate = first.rate_limit.expect("metadata");
    assert_eq!(rate.remaining, Some(0));
    assert_eq!(rate.reset_epoch_seconds, Some(reset));
    assert_eq!(rate.resource.as_deref(), Some("core"));
    assert!(rate.retry_after_seconds.unwrap_or_default() > 3000);
    // The exhausted bucket is known: the next core call is not sent at all.
    let second = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "c"]).expect("route")),
            &context,
        )
        .await
        .expect_err("blocked before send");
    assert_eq!(second.kind, ProviderErrorKind::RateLimited);
    assert_eq!(
        second.rate_limit.and_then(|r| r.reset_epoch_seconds),
        Some(reset)
    );
}

#[tokio::test]
async fn secondary_limit_without_retry_after_waits_sixty_seconds_or_fails_fast() {
    let server = MockServer::builder().start().await;
    let limited = Sequence::new(vec![secondary_limit(None), ok_json()]);
    let hits = limited.arrivals.clone();
    Mock::given(method("GET"))
        .respond_with(limited)
        .expect(1)
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let context = RequestContext::with_timeout(Duration::from_secs(5), 1024);
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["search", "issues"]).expect("route")),
            &context,
        )
        .await
        .expect_err("60s fallback exceeds the 5s cap");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    assert!(error.retryable);
    assert_eq!(error.status, Some(403));
    // A 403 secondary limit keeps its rate-limit metadata.
    let rate = error.rate_limit.expect("secondary metadata");
    assert_eq!(rate.retry_after_seconds, Some(60));
    assert_eq!(rate.remaining, Some(21));
    // The cooldown is shared by the key: a core call is not sent either.
    let blocked = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["repos", "a", "b"]).expect("route")),
            &context,
        )
        .await
        .expect_err("cooldown");
    assert_eq!(blocked.kind, ProviderErrorKind::RateLimited);
    assert_eq!(hits.count(), 1);
}

#[tokio::test]
async fn do_not_retry_statuses_are_sent_once() {
    for status in [400_u16, 401, 403, 404, 410, 422, 451] {
        let server = MockServer::builder().start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(status)
                    .insert_header("x-ratelimit-remaining", "10")
                    .set_body_json(serde_json::json!({"message": "nope"})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let (transport, endpoint) =
            executor_transport(&server, GitHubBudget::relaxed(), short_retry());
        let error = get_x(&transport, &endpoint, 1024)
            .await
            .expect_err("final status");
        assert_ne!(error.kind, ProviderErrorKind::RateLimited, "{status}");
        assert_eq!(error.status, Some(status));
        server.verify().await;
    }
}

#[tokio::test]
async fn graphql_top_level_rate_limited_type_is_a_primary_limit() {
    let server = MockServer::builder().start().await;
    let reset = epoch_secs() + 3600;
    Mock::given(method("POST"))
        .and(path("/api/graphql"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("x-ratelimit-reset", reset.to_string().as_str())
                .set_body_json(serde_json::json!({
                    "data": null,
                    "errors": [{"type": "RATE_LIMITED", "message": "API rate limit exceeded for user ID 1."}]
                })),
        )
        .expect(1)
        .mount(&server)
        .await;
    let (transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let context = with_token("t", Duration::from_secs(5), 1024);
    assert!(transport.graphql_available(&context));
    let error = transport
        .execute_graphql(
            "query { viewer { login } }",
            serde_json::json!({}),
            &context,
        )
        .await
        .expect_err("rate limited");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    let rate = error.rate_limit.expect("metadata");
    assert_eq!(rate.resource.as_deref(), Some("graphql"));
    assert_eq!(rate.reset_epoch_seconds, Some(reset));
    // Cooldown-until-reset for this key only (not a permanent host skip).
    assert!(!transport.graphql_available(&context));
    assert!(transport.graphql_available(&with_token("other", Duration::from_secs(5), 1024)));
}

#[tokio::test]
async fn graphql_something_went_wrong_is_retried_like_a_500() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/api/graphql"))
        .respond_with(Sequence::new(vec![
            ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": null,
                "errors": [{"message": "Something went wrong while executing your query. This may be the result of a timeout."}]
            })),
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({"data": {"viewer": {"login": "me"}}})),
        ]))
        .expect(2)
        .mount(&server)
        .await;
    let (transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let page = transport
        .execute_graphql(
            "query { viewer { login } }",
            serde_json::json!({}),
            &with_token("t", Duration::from_secs(5), 1024),
        )
        .await
        .expect("retried");
    assert!(page.errors.is_empty());
    assert_eq!(page.data.expect("data")["viewer"]["login"], "me");
}

#[tokio::test]
async fn permits_are_released_while_backing_off() {
    let server = MockServer::builder().start().await;
    let flaky = Sequence::new(vec![
        ResponseTemplate::new(503).insert_header("retry-after", "1"),
        ResponseTemplate::new(200).set_body_bytes(b"ok"),
    ]);
    let hits = flaky.arrivals.clone();
    Mock::given(method("GET"))
        .and(path("/api/v3/flaky"))
        .respond_with(flaky)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/fast"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(b"fast"))
        .mount(&server)
        .await;
    // One global slot per key: a request sleeping on retry-after must not
    // hold it.
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        global_concurrency: 1,
        ..ExecutorConfig::relaxed()
    }));
    let (transport, endpoint) = executor_transport(&server, budget, short_retry());
    let slow = {
        let transport = transport.clone();
        let url = endpoint.rest(&["flaky"]).expect("route");
        tokio::spawn(async move {
            transport
                .execute(
                    RequestSpec::get(url),
                    &with_token("t", Duration::from_secs(5), 1024),
                )
                .await
        })
    };
    while hits.count() == 0 {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    tokio::time::sleep(Duration::from_millis(50)).await;
    let started = std::time::Instant::now();
    let fast = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["fast"]).expect("route")),
            &with_token("t", Duration::from_secs(5), 1024),
        )
        .await
        .expect("fast");
    assert_eq!(fast.body, b"fast".as_slice());
    assert!(
        started.elapsed() < Duration::from_millis(700),
        "fast request waited for the backing-off request's permit"
    );
    let slow = slow.await.expect("join").expect("slow retried");
    assert_eq!(slow.body, b"ok".as_slice());
    assert_eq!(hits.count(), 2);
}

#[tokio::test]
async fn search_requests_are_spaced_per_key() {
    let server = MockServer::builder().start().await;
    let search = Sequence::new(vec![
        ResponseTemplate::new(200).set_body_json(serde_json::json!({"items": []})),
    ]);
    let arrivals = search.arrivals.clone();
    Mock::given(method("GET"))
        .and(path("/api/v3/search/issues"))
        .respond_with(search)
        .mount(&server)
        .await;
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        search_spacing: Duration::from_millis(150),
        ..ExecutorConfig::relaxed()
    }));
    let (transport, endpoint) = executor_transport(&server, budget, short_retry());
    let calls = (0..3).map(|_| {
        let transport = transport.clone();
        let url = endpoint.rest(&["search", "issues"]).expect("route");
        async move {
            transport
                .execute(
                    RequestSpec::get(url),
                    &with_token("t", Duration::from_secs(5), 1024),
                )
                .await
                .expect("search")
        }
    });
    futures_util::future::join_all(calls).await;
    let arrivals = arrivals.times();
    assert_eq!(arrivals.len(), 3);
    for pair in arrivals.windows(2) {
        assert!(
            pair[1].duration_since(pair[0]) >= Duration::from_millis(120),
            "search starts not spaced: {arrivals:?}"
        );
    }
}

#[tokio::test]
async fn limiter_keys_isolate_tokens() {
    let server = MockServer::builder().start().await;
    let reset = epoch_secs() + 3600;
    Mock::given(method("GET"))
        .and(header("authorization", "Bearer exhausted"))
        .respond_with(
            ResponseTemplate::new(403)
                .insert_header("x-ratelimit-remaining", "0")
                .insert_header("x-ratelimit-reset", reset.to_string().as_str())
                .set_body_json(serde_json::json!({"message": "API rate limit exceeded"})),
        )
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(header("authorization", "Bearer fresh"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(b"ok"))
        .expect(2)
        .mount(&server)
        .await;
    let budget = GitHubBudget::relaxed();
    let (transport, endpoint) = executor_transport(&server, budget, short_retry());
    let exhausted = || with_token("exhausted", Duration::from_secs(5), 1024);
    let fresh = || with_token("fresh", Duration::from_secs(5), 1024);
    let url = endpoint.rest(&["repos", "a", "b"]).expect("route");
    transport
        .execute(RequestSpec::get(url.clone()), &exhausted())
        .await
        .expect_err("exhausted");
    transport
        .execute(RequestSpec::get(url.clone()), &exhausted())
        .await
        .expect_err("still exhausted, not sent");
    for _ in 0..2 {
        transport
            .execute(RequestSpec::get(url.clone()), &fresh())
            .await
            .expect("other token unaffected");
    }
}

/// Key-aware cache so ref memo and body entries coexist.
#[derive(Default)]
struct KeyedCache(Mutex<std::collections::HashMap<String, CachedContent>>);
impl ConditionalCache for KeyedCache {
    fn get<'a>(
        &'a self,
        _: &'a Partition,
        key: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<CachedContent>> + Send + 'a>>
    {
        Box::pin(async move { self.0.lock().expect("cache lock").get(key).cloned() })
    }
    fn put<'a>(
        &'a self,
        _: &'a Partition,
        key: String,
        value: CachedContent,
        _: Retention,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            self.0.lock().expect("cache lock").insert(key, value);
        })
    }
}

#[tokio::test]
async fn default_branch_resolves_with_one_sha_request_and_is_memoized_per_batch() {
    let server = MockServer::builder().start().await;
    let sha = "0123456789abcdef0123456789abcdef01234567";
    // No repository-metadata round trip: HEAD resolves the default branch.
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/acme/repo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .expect(0)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/acme/repo/commits/HEAD"))
        .and(header("accept", "application/vnd.github.sha"))
        .respond_with(ResponseTemplate::new(200).set_body_string(sha))
        .expect(1)
        .mount(&server)
        .await;
    for name in ["a.rs", "b.rs"] {
        Mock::given(method("GET"))
            .and(path(format!("/api/v3/repos/acme/repo/contents/{name}")))
            .and(query_param("ref", sha))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "type":"file","encoding":"base64","content":STANDARD.encode("x\n")
            })))
            .expect(1)
            .mount(&server)
            .await;
    }
    let base = provider(&server).await;
    let provider = GitHubProvider {
        transport: base.transport,
        cache: KeyedCache::default(),
    };
    let context = with_token("secret", Duration::from_secs(2), 1024);
    for name in ["a.rs", "b.rs", "a.rs"] {
        let result = provider
            .get_file_content(
                &ContentRequest {
                    owner: "acme".into(),
                    repo: "repo".into(),
                    path: name.into(),
                    reference: None,
                    force_refresh: false,
                },
                &context,
            )
            .await
            .expect("content");
        assert_eq!(result.resolved_ref, sha);
        assert_eq!(result.bytes, &b"x\n"[..]);
    }
}

#[tokio::test]
async fn legal_block_and_unmapped_statuses_are_not_network_failures() {
    for (status, kind, needle) in [
        (
            451_u16,
            ProviderErrorKind::Unavailable,
            "legal reasons (HTTP 451)",
        ),
        (418, ProviderErrorKind::HttpStatus, "HTTP 418"),
    ] {
        let server = MockServer::builder().start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(status)
                    .set_body_json(serde_json::json!({"message": "blocked"})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let (transport, endpoint) =
            executor_transport(&server, GitHubBudget::relaxed(), short_retry());
        let error = get_x(&transport, &endpoint, 1024)
            .await
            .expect_err("status error");
        assert_eq!(error.kind, kind, "{status}");
        assert!(!error.retryable, "{status}");
        assert_eq!(error.status, Some(status));
        assert!(error.message.contains(needle), "{}", error.message);
        server.verify().await;
    }
}

#[tokio::test]
async fn oversized_error_body_keeps_status_and_says_the_body_was_not_read() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(404).set_body_bytes(vec![b'x'; 4096]))
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let error = get_x(&transport, &endpoint, 64)
        .await
        .expect_err("not found");
    assert_eq!(error.kind, ProviderErrorKind::NotFound);
    assert!(
        error.message.contains("error body exceeded limit"),
        "{}",
        error.message
    );
}

#[tokio::test]
async fn cancel_while_reading_an_error_body_is_cancelled() {
    use std::io::{Read, Write};
    // Headers and part of a 404 body arrive, then the server stalls.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("address");
    let (sent, partial_sent) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let Ok((mut socket, _)) = listener.accept() else {
            return;
        };
        let mut request = [0_u8; 4096];
        let _ = socket.read(&mut request);
        let _ = socket.write_all(
            b"HTTP/1.1 404 Not Found\r\ncontent-type: application/json\r\ncontent-length: 100000\r\n\r\n{\"message\":\"par",
        );
        let _ = socket.flush();
        let _ = sent.send(());
        std::thread::sleep(Duration::from_secs(3));
    });
    let endpoint =
        GitHubEndpoint::new(url::Url::parse(&format!("http://{address}/api/v3")).expect("URL"))
            .expect("endpoint");
    let transport =
        GitHubTransport::with_budget(endpoint.clone(), short_retry(), GitHubBudget::relaxed())
            .expect("transport");
    let context = RequestContext::with_timeout(Duration::from_secs(4), 1 << 20);
    let cancellation = context.budget.cancellation.clone();
    // Cancel once the headers and partial body are on the wire.
    tokio::spawn(async move {
        let _ = partial_sent.await;
        cancellation.cancel();
    });
    let error = transport
        .execute(
            RequestSpec::get(endpoint.rest(&["x"]).expect("route")),
            &context,
        )
        .await
        .expect_err("cancelled");
    assert_eq!(error.kind, ProviderErrorKind::Cancelled, "{error:?}");
}

fn code_search_request() -> CodeSearchRequest {
    CodeSearchRequest {
        include_fragments: false,
        query: "secret org:acme".into(),
        page: 1,
        per_page: 10,
    }
}

/// Production shape: one process-wide transport with an anonymous resolver,
/// the credential resolved per request. A cached search page fetched with
/// one token must never answer a request made with another.
#[tokio::test]
async fn code_search_cache_is_scoped_to_the_request_credential() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "total_count": 0, "incomplete_results": false, "items": []
        })))
        .expect(3)
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = |token: Option<&str>| {
        RequestContext::new(
            RequestBudget::with_timeout(Duration::from_secs(5), 1 << 20),
            token.map(|token| ResolvedCredential::new(token, CredentialSource::Storage)),
        )
    };
    for token in [Some("alice"), Some("alice"), Some("bob"), None] {
        transport
            .search_code(&code_search_request(), &context(token))
            .await
            .expect("search");
    }
}

/// `confirm_user` reads `/users/{login}` through the response cache: one
/// request per credential and login; a 404 is the typed missing user, and a
/// failure of any other kind keeps its own kind.
#[tokio::test]
async fn confirm_user_is_cached_per_credential_and_types_a_missing_login() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/dev"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"login": "dev"})))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/ghost"))
        .respond_with(
            ResponseTemplate::new(404).set_body_json(serde_json::json!({"message": "Not Found"})),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/users/flaky"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = |token: &str| {
        RequestContext::new(
            RequestBudget::with_timeout(Duration::from_secs(5), 1 << 20),
            Some(ResolvedCredential::new(token, CredentialSource::Storage)),
        )
    };
    // alice twice (one request), bob once (his own partition): two requests.
    for token in ["alice", "alice", "bob"] {
        transport
            .confirm_user("dev", &context(token))
            .await
            .expect("user exists");
    }
    let missing = transport
        .confirm_user("ghost", &context("alice"))
        .await
        .expect_err("missing user");
    assert_eq!(missing.kind, ProviderErrorKind::NotFound);
    assert_eq!(missing.reason, Some(ProviderErrorReason::UserNotFound));
    assert!(missing.message.contains("ghost"), "{missing:?}");
    let flaky = transport
        .confirm_user("flaky", &context("alice"))
        .await
        .expect_err("server failure");
    assert_eq!(flaky.reason, None, "{flaky:?}");
    assert_ne!(flaky.kind, ProviderErrorKind::NotFound);
}

#[tokio::test]
async fn a_resolved_full_sha_is_cached_per_credential() {
    let server = MockServer::builder().start().await;
    let sha = "0123456789abcdef0123456789abcdef01234567";
    Mock::given(method("GET"))
        .and(path(format!("/api/v3/repos/o/r/commits/{sha}")))
        .respond_with(ResponseTemplate::new(200).set_body_string(sha))
        .expect(2)
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = |token: &str| {
        RequestContext::new(
            RequestBudget::with_timeout(Duration::from_secs(5), 1 << 20),
            Some(ResolvedCredential::new(token, CredentialSource::Storage)),
        )
    };
    // alice twice (one request), bob once (his own partition): two requests.
    for token in ["alice", "alice", "bob"] {
        let resolved = transport
            .commit_sha("o", "r", sha, &context(token))
            .await
            .expect("resolved");
        assert_eq!(resolved, sha);
    }
}

#[tokio::test]
async fn incomplete_code_search_pages_are_not_cached() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "total_count": 0, "incomplete_results": true, "items": []
        })))
        .expect(2)
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = || with_token("t", Duration::from_secs(5), 1 << 20);
    for _ in 0..2 {
        let page = transport
            .search_code(&code_search_request(), &context())
            .await
            .expect("search");
        assert!(page.incomplete_results);
    }
}

/// Repository, issue and commit searches use the code-search cache policy:
/// an identical repeat is a cache hit, so it sends no request and does not
/// wait out the search spacing the first request reserved.
#[tokio::test]
async fn repeated_searches_are_served_from_cache_without_spacing() {
    let server = MockServer::builder().start().await;
    let page = serde_json::json!({"total_count": 0, "incomplete_results": false, "items": []});
    for route in [
        "/api/v3/search/code",
        "/api/v3/search/repositories",
        "/api/v3/search/issues",
        "/api/v3/search/commits",
    ] {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_json(page.clone()))
            .expect(1)
            .mount(&server)
            .await;
    }
    let spacing = Duration::from_secs(2);
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        search_spacing: spacing,
        ..ExecutorConfig::relaxed()
    }));
    let (mut transport, _) = executor_transport(&server, budget, short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = || with_token("t", Duration::from_secs(30), 1 << 20);
    let repositories = RepositorySearchRequest {
        query: "ripgrep".into(),
        sort: None,
        page: 1,
        per_page: 5,
    };
    let history = HistoryRequest {
        query: "repo:o/r is:pr is:merged".into(),
        page: 1,
        per_page: 10,
        sort: None,
        order: None,
    };
    // Cold: the four searches share one spacing lane, so three of them wait.
    transport
        .search_code(&code_search_request(), &context())
        .await
        .expect("code");
    transport
        .search_repositories(&repositories, &context())
        .await
        .expect("repositories");
    transport
        .search_issues(&history, &context())
        .await
        .expect("issues");
    transport
        .search_commits(&history, &context())
        .await
        .expect("commits");
    let started = std::time::Instant::now();
    for _ in 0..3 {
        transport
            .search_code(&code_search_request(), &context())
            .await
            .expect("code");
        transport
            .search_repositories(&repositories, &context())
            .await
            .expect("repositories");
        transport
            .search_issues(&history, &context())
            .await
            .expect("issues");
        transport
            .search_commits(&history, &context())
            .await
            .expect("commits");
    }
    let elapsed = started.elapsed();
    assert!(
        elapsed < spacing / 4,
        "cache hits must not wait for search spacing: {elapsed:?}"
    );
}

#[tokio::test]
async fn incomplete_repository_and_history_search_pages_are_not_cached() {
    let server = MockServer::builder().start().await;
    for route in ["/api/v3/search/repositories", "/api/v3/search/issues"] {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "total_count": 0, "incomplete_results": true, "items": []
            })))
            .expect(2)
            .mount(&server)
            .await;
    }
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = || with_token("t", Duration::from_secs(5), 1 << 20);
    for _ in 0..2 {
        let repositories = transport
            .search_repositories(
                &RepositorySearchRequest {
                    query: "ripgrep".into(),
                    sort: None,
                    page: 1,
                    per_page: 5,
                },
                &context(),
            )
            .await
            .expect("repositories");
        assert!(repositories.incomplete_results);
        let issues = transport
            .search_issues(
                &HistoryRequest {
                    query: "repo:o/r".into(),
                    page: 1,
                    per_page: 10,
                    sort: None,
                    order: None,
                },
                &context(),
            )
            .await
            .expect("issues");
        assert!(issues.incomplete_results);
    }
}

#[test]
fn rest_routes_reject_dot_segments() {
    let endpoint = api_github_com();
    for bad in [".", ".."] {
        let error = endpoint
            .rest(&["repos", bad, "r", "pulls"])
            .expect_err("dot segment must not rewrite the route");
        assert_eq!(error.kind, ProviderErrorKind::Validation);
    }
    assert_eq!(
        endpoint
            .rest(&["repos", "o", "r", "contents", "a/../b"])
            .expect("encoded path segment")
            .path(),
        "/repos/o/r/contents/a%2F..%2Fb"
    );
}

#[test]
fn plain_http_api_base_is_limited_to_loopback() {
    let parse = |raw: &str| GitHubEndpoint::new(url::Url::parse(raw).expect("URL"));
    for allowed in [
        "https://ghe.example.com/api/v3",
        "http://127.0.0.1:8080/api/v3",
        "http://localhost:3000/",
        "http://[::1]:9000/",
    ] {
        assert!(parse(allowed).is_ok(), "{allowed}");
    }
    let error = parse("http://ghe.example.com/api/v3").expect_err("cleartext token");
    assert_eq!(error.kind, ProviderErrorKind::Configuration);
}

#[tokio::test]
async fn history_reads_revalidate_and_pinned_commits_are_served_from_cache() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/pulls/1"))
        .and(header("if-none-match", "\"v1\""))
        .respond_with(ResponseTemplate::new(304))
        .with_priority(1)
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r/pulls/1"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("etag", "\"v1\"")
                .set_body_json(serde_json::json!({"number": 1})),
        )
        .with_priority(2)
        .expect(1)
        .mount(&server)
        .await;
    let sha = "a".repeat(40);
    Mock::given(method("GET"))
        .and(path(format!("/api/v3/repos/o/r/commits/{sha}")))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("etag", "\"c1\"")
                .set_body_json(serde_json::json!({"sha": sha})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = || with_token("t", Duration::from_secs(5), 1 << 20);
    for _ in 0..3 {
        let item = transport
            .history_item(&["repos", "o", "r", "pulls", "1"], &[], &context())
            .await
            .expect("pull request");
        assert_eq!(item.value["number"], 1);
        let commit = transport
            .history_item(&["repos", "o", "r", "commits", &sha], &[], &context())
            .await
            .expect("commit");
        assert_eq!(commit.value["sha"], sha.as_str());
    }
}

/// A ref GitHub cannot resolve (422 "No commit found") is not-found input
/// with a typed reason, not a malformed request; a 404 stays the repository.
#[tokio::test]
async fn missing_ref_is_not_found_with_a_ref_reason() {
    let server = MockServer::builder().start().await;
    mount_json(
        &server,
        "/api/v3/repos/o/r/commits/nope",
        422,
        serde_json::json!({"message": "No commit found for SHA: nope"}),
    )
    .await;
    mount_json(
        &server,
        "/api/v3/repos/o/gone/commits/main",
        404,
        serde_json::json!({"message": "Not Found"}),
    )
    .await;
    let provider = provider(&server).await;
    let context = with_token("secret", Duration::from_secs(5), 1 << 20);
    let error = provider
        .transport
        .commit_sha("o", "r", "nope", &context)
        .await
        .expect_err("missing ref");
    assert_eq!(error.kind, ProviderErrorKind::NotFound, "{error:?}");
    assert_eq!(error.reason, Some(ProviderErrorReason::RefNotFound));
    assert_eq!(error.status, Some(422));
    let error = provider
        .transport
        .commit_sha("o", "gone", "main", &context)
        .await
        .expect_err("missing repository");
    assert_eq!(error.reason, Some(ProviderErrorReason::RepositoryNotFound));
}

/// A followed `/repos/a/b/…` → `/repositories/<id>/…` redirect marks
/// `a/b` renamed; other repositories and plain reads stay unmarked.
#[tokio::test]
async fn a_followed_repository_redirect_marks_the_name_renamed() {
    let server = MockServer::builder().start().await;
    let moved = format!("{}/api/v3/repositories/7/commits/main", server.uri());
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/a/b/commits/main"))
        .respond_with(ResponseTemplate::new(301).insert_header("location", moved.as_str()))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repositories/7/commits/main"))
        .respond_with(ResponseTemplate::new(200).set_body_string("f".repeat(40)))
        .mount(&server)
        .await;
    mount_json(
        &server,
        "/api/v3/repos/x/y/commits/main",
        422,
        serde_json::json!({"message":"No commit found for SHA: main"}),
    )
    .await;
    let provider = provider(&server).await;
    let context = with_token("secret", Duration::from_secs(5), 1 << 20);
    assert!(!provider.transport.followed_rename("a", "b"));
    let sha = provider
        .transport
        .commit_sha("a", "b", "main", &context)
        .await
        .expect("followed");
    assert_eq!(sha, "f".repeat(40));
    assert!(provider.transport.followed_rename("A", "b"));
    let _ = provider
        .transport
        .commit_sha("x", "y", "main", &context)
        .await;
    assert!(!provider.transport.followed_rename("x", "y"));
    // Clones share what was learned.
    assert!(provider.transport.clone().followed_rename("a", "b"));
}

// ── Throttling fixes (docs: .octocode/octocode-roast/2026-10-10-github-throttling.md) ──

fn secondary_limit_response(retry_after: Option<&str>) -> ResponseTemplate {
    let mut response = ResponseTemplate::new(403)
        .insert_header("x-ratelimit-remaining", "4000")
        .insert_header("x-ratelimit-reset", (epoch_secs() + 3600).to_string().as_str())
        .insert_header("x-ratelimit-resource", "search")
        .set_body_json(serde_json::json!({
            "message": "You have exceeded a secondary rate limit. Please wait a few minutes before you try again."
        }));
    if let Some(retry_after) = retry_after {
        response = response.insert_header("retry-after", retry_after);
    }
    response
}

async fn get_status(
    transport: &GitHubTransport,
    endpoint: &GitHubEndpoint,
    segments: &[&str],
) -> Result<ResponsePage, ProviderError> {
    transport
        .execute(
            RequestSpec::get(endpoint.rest(segments).expect("route")),
            &with_token("t", Duration::from_secs(5), 1024),
        )
        .await
}

/// A row queued behind the search spacing must re-check the block
/// that landed while it slept, not send into a 120 s secondary cooldown.
#[tokio::test]
async fn a_queued_request_is_not_sent_after_a_cooldown_lands_while_it_waits() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/issues"))
        .respond_with(secondary_limit_response(Some("120")))
        .mount(&server)
        .await;
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        search_spacing: Duration::from_millis(300),
        ..ExecutorConfig::relaxed()
    }));
    let (transport, endpoint) = executor_transport(&server, budget, short_retry());
    let rows = futures_util::future::join_all((0..2).map(|_| {
        let transport = transport.clone();
        let endpoint = endpoint.clone();
        async move { get_status(&transport, &endpoint, &["search", "issues"]).await }
    }))
    .await;
    for row in &rows {
        let error = row.as_ref().expect_err("cooldown");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert_eq!(
            error
                .rate_limit
                .as_ref()
                .and_then(|r| r.retry_after_seconds)
                .map(|s| s >= 100),
            Some(true)
        );
    }
    assert_eq!(
        server.received_requests().await.expect("requests").len(),
        1,
        "the queued row was sent into the cooldown"
    );
}

/// Answers every GET with 502; the returned log counts the requests.
async fn mount_bad_gateway(server: &MockServer) -> Arrivals {
    let bad_gateway = Sequence::new(vec![
        ResponseTemplate::new(502).set_body_json(serde_json::json!({"message": "Server Error"})),
    ]);
    let hits = bad_gateway.arrivals.clone();
    Mock::given(method("GET"))
        .respond_with(bad_gateway)
        .mount(server)
        .await;
    hits
}

fn breaker_budget(circuit_failures: u32) -> Arc<GitHubBudget> {
    Arc::new(GitHubBudget::with_config(ExecutorConfig {
        circuit_failures,
        circuit_open: Duration::from_secs(30),
        ..ExecutorConfig::relaxed()
    }))
}

/// An outage trips the breaker, and the open breaker names the real
/// cause (a server failure) rather than a rate limit.
#[tokio::test]
async fn an_open_circuit_reports_a_server_outage_not_a_rate_limit() {
    let server = MockServer::builder().start().await;
    let hits = mount_bad_gateway(&server).await;
    let (transport, endpoint) = executor_transport(&server, breaker_budget(2), short_retry());
    for _ in 0..2 {
        let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
            .await
            .expect_err("502");
        assert_eq!(error.kind, ProviderErrorKind::Server);
    }
    let sent = hits.count();
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("circuit open");
    assert_eq!(hits.count(), sent, "an open circuit must not send");
    assert_eq!(error.kind, ProviderErrorKind::Server, "{error:?}");
    assert!(error.retryable);
    assert!(error.message.contains("unavailable"), "{}", error.message);
    assert!(
        error
            .rate_limit
            .as_ref()
            .and_then(|r| r.retry_after_seconds)
            .is_some(),
        "the wait is still reported"
    );
}

/// Retries of one logical request are one failure, not one each.
#[tokio::test]
async fn the_circuit_counts_one_failure_per_logical_request() {
    let server = MockServer::builder().start().await;
    let hits = mount_bad_gateway(&server).await;
    // 3 attempts per request: per-attempt counting opens at the first
    // request's third attempt; per-request counting needs 3 requests.
    let (transport, endpoint) = executor_transport(&server, breaker_budget(3), short_retry());
    for _ in 0..2 {
        let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
            .await
            .expect_err("502");
        assert_eq!(error.kind, ProviderErrorKind::Server, "{error:?}");
    }
    assert_eq!(hits.count(), 6, "both requests ran all their attempts");
}

/// A success closes the breaker's count.
#[tokio::test]
async fn a_success_resets_the_circuit_count() {
    let server = MockServer::builder().start().await;
    // 502 for requests 1 and 3 (single attempts), 200 for the rest.
    let ok = || ResponseTemplate::new(200).set_body_bytes(b"ok");
    Mock::given(method("GET"))
        .respond_with(Sequence::new(vec![
            ResponseTemplate::new(502),
            ok(),
            ResponseTemplate::new(502),
            ok(),
        ]))
        .mount(&server)
        .await;
    let single = RetryPolicy {
        max_attempts: 1,
        ..short_retry()
    };
    let (transport, endpoint) = executor_transport(&server, breaker_budget(2), single);
    for expected in [false, true, false, true, true] {
        let result = get_status(&transport, &endpoint, &["repos", "a", "b"]).await;
        assert_eq!(result.is_ok(), expected, "{result:?}");
    }
}

/// Transport outages carry their own cause too.
#[tokio::test]
async fn an_open_circuit_after_connection_failures_reports_transport() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("addr").port();
    drop(listener);
    let endpoint = GitHubEndpoint::new(
        url::Url::parse(&format!("http://127.0.0.1:{port}/api/v3")).expect("URL"),
    )
    .expect("endpoint");
    let transport = GitHubTransport::with_budget(
        endpoint.clone(),
        RetryPolicy {
            max_attempts: 1,
            ..short_retry()
        },
        breaker_budget(1),
    )
    .expect("transport");
    let first = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("refused");
    assert_eq!(first.kind, ProviderErrorKind::Transport);
    let second = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("circuit open");
    assert_eq!(second.kind, ProviderErrorKind::Transport, "{second:?}");
    assert!(second.retryable);
    assert!(second.message.contains("unavailable"), "{}", second.message);
}

/// Dropped connections are retried by the transport's own budgeted policy and
/// by nothing underneath it: exactly `max_attempts` connections, no more.
#[tokio::test]
async fn a_dropped_connection_takes_exactly_the_policy_attempts() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let accepts = Arc::new(AtomicUsize::new(0));
    let seen = Arc::clone(&accepts);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            seen.fetch_add(1, Ordering::SeqCst);
            drop(stream);
        }
    });
    let endpoint = GitHubEndpoint::new(
        url::Url::parse(&format!("http://127.0.0.1:{port}/api/v3")).expect("URL"),
    )
    .expect("endpoint");
    let transport = GitHubTransport::with_budget(
        endpoint.clone(),
        RetryPolicy {
            max_attempts: 3,
            ..short_retry()
        },
        breaker_budget(10),
    )
    .expect("transport");
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("every attempt is dropped");
    assert_eq!(error.kind, ProviderErrorKind::Transport);
    assert_eq!(accepts.load(Ordering::SeqCst), 3);
}

/// Repeated secondary limits still report a rate limit.
#[tokio::test]
async fn an_open_circuit_after_secondary_limits_reports_a_rate_limit() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(secondary_limit_response(Some("1")))
        .mount(&server)
        .await;
    let single = RetryPolicy {
        max_attempts: 1,
        ..short_retry()
    };
    let (transport, endpoint) = executor_transport(&server, breaker_budget(1), single);
    let first = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("secondary");
    assert_eq!(first.kind, ProviderErrorKind::RateLimited);
    let second = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("blocked");
    assert_eq!(second.kind, ProviderErrorKind::RateLimited);
}

/// A secondary limit's `resetEpochSeconds` is the cooldown end, not
/// the unrelated primary window reset an hour away.
#[tokio::test]
async fn secondary_limit_reset_is_the_cooldown_end() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(secondary_limit_response(Some("120")))
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let before = epoch_secs();
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("secondary");
    let rate = error.rate_limit.expect("rate limit");
    assert_eq!(rate.retry_after_seconds, Some(120));
    let reset = rate.reset_epoch_seconds.expect("reset");
    assert!(
        (before + 119..=before + 123).contains(&reset),
        "reset {reset} is not the cooldown end near {}",
        before + 120
    );
}

/// A 5xx `Retry-After` beyond the retry cap is surfaced, not dropped.
#[tokio::test]
async fn a_long_server_retry_after_is_surfaced() {
    let server = MockServer::builder().start().await;
    let unavailable = Sequence::new(vec![
        ResponseTemplate::new(503).insert_header("retry-after", "30"),
    ]);
    let hits = unavailable.arrivals.clone();
    Mock::given(method("GET"))
        .respond_with(unavailable)
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("503");
    assert_eq!(error.kind, ProviderErrorKind::Server);
    assert_eq!(hits.count(), 1, "a long retry-after fails fast");
    assert_eq!(
        error.rate_limit.and_then(|rate| rate.retry_after_seconds),
        Some(30)
    );
}

/// The SAML SSO authorization URL travels with the failure.
#[tokio::test]
async fn a_saml_sso_403_carries_the_authorization_url() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(403)
                .insert_header(
                    "x-github-sso",
                    "required; url=https://github.com/orgs/acme/sso?authorization_request=ABC",
                )
                .set_body_json(serde_json::json!({
                    "message": "Resource protected by organization SAML enforcement."
                })),
        )
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("sso");
    assert_eq!(error.kind, ProviderErrorKind::Permission);
    assert_eq!(
        error.sso_url.as_deref(),
        Some("https://github.com/orgs/acme/sso?authorization_request=ABC")
    );
}

/// `partial-results` names the organizations that withheld results.
#[tokio::test]
async fn partial_sso_results_name_the_withheld_organizations() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header(
                    "x-github-sso",
                    "partial-results; organizations=21955855,20582480",
                )
                .set_body_json(serde_json::json!({"items": []})),
        )
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let page = get_status(&transport, &endpoint, &["search", "issues"])
        .await
        .expect("ok");
    assert_eq!(page.sso_partial_organizations(), vec![21955855, 20582480]);
    let plain = ResponsePage {
        status: 200,
        headers: reqwest::header::HeaderMap::new(),
        body: bytes::Bytes::new(),
        next: None,
    };
    assert!(plain.sso_partial_organizations().is_empty());
}

/// Rate-limit bodies without `x-ratelimit-*` headers (proxies, GHES).
#[tokio::test]
async fn a_headerless_rate_limit_body_is_a_primary_limit() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(403).set_body_json(
            serde_json::json!({"message": "API rate limit exceeded for user ID 1."}),
        ))
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("limited");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    assert!(error.retryable);
    // No headers: a primary core limit with GitHub's one-minute fallback wait.
    let rate = error.rate_limit.expect("rate limit");
    assert_eq!(rate.remaining, Some(0));
    assert_eq!(rate.resource.as_deref(), Some("core"));
    assert_eq!(rate.retry_after_seconds, Some(60));
    let reset = rate.reset_epoch_seconds.expect("reset");
    assert!(
        (epoch_secs() + 55..=epoch_secs() + 61).contains(&reset),
        "reset {reset} is not about a minute out"
    );
}

/// The legacy abuse-detection 403 is a secondary limit.
#[tokio::test]
async fn an_abuse_detection_403_is_a_secondary_limit() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(403).set_body_json(serde_json::json!({
            "message": "You have triggered an abuse detection mechanism. Please wait a few minutes before you try again."
        })))
        .mount(&server)
        .await;
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("limited");
    assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    assert_eq!(
        error.message.as_ref(),
        "GitHub secondary rate limit exceeded"
    );
}

/// An HTTP-date `Retry-After` is honored instead of the 60 s default.
#[tokio::test]
async fn an_http_date_retry_after_is_honored() {
    let server = MockServer::builder().start().await;
    let date = httpdate_after(3);
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(429)
                .insert_header("retry-after", date.as_str())
                .set_body_json(serde_json::json!({"message": "Too Many Requests"})),
        )
        .mount(&server)
        .await;
    let single = RetryPolicy {
        max_attempts: 1,
        ..short_retry()
    };
    let (transport, endpoint) = executor_transport(&server, GitHubBudget::relaxed(), single);
    let error = get_status(&transport, &endpoint, &["repos", "a", "b"])
        .await
        .expect_err("limited");
    let seconds = error
        .rate_limit
        .and_then(|rate| rate.retry_after_seconds)
        .expect("retry after");
    assert!((1..=4).contains(&seconds), "{seconds} is not ~3 s");
}

/// An RFC 9110 IMF-fixdate `seconds` from now.
fn httpdate_after(seconds: u64) -> String {
    let at = epoch_secs() + seconds;
    let days = (at / 86_400) as i64;
    let (year, month, day) = civil_from_days(days);
    let rem = at % 86_400;
    let weekday = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][(days % 7) as usize];
    let month_name = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][(month - 1) as usize];
    format!(
        "{weekday}, {day:02} {month_name} {year} {:02}:{:02}:{:02} GMT",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[tokio::test]
async fn concurrent_repository_metadata_reads_share_one_request() {
    let server = MockServer::builder().start().await;
    let repository = Delayed::new(
        Duration::from_millis(150),
        ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "full_name": "o/r", "name": "r", "html_url": "https://github.com/o/r",
            "default_branch": "main"
        })),
    );
    let hits = repository.arrivals.clone();
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r"))
        .respond_with(repository)
        .mount(&server)
        .await;
    let endpoint = mock_endpoint(&server);
    let transport = anonymous_transport(&endpoint);
    let context = with_token("t", Duration::from_secs(5), 1 << 20);
    let (a, b, c) = tokio::join!(
        transport.repository_metadata("o", "r", &context),
        transport.repository_metadata("o", "r", &context),
        transport.repository("o", "r", &context),
    );
    assert_eq!(a.expect("metadata").default_branch, "main");
    assert_eq!(b.expect("metadata").full_name.as_deref(), Some("o/r"));
    assert_eq!(c.expect("repository").full_name, "o/r");
    assert_eq!(hits.count(), 1, "one GET /repos/o/r");
    // A later read in the same batch window is served from the memo.
    transport
        .repository_metadata("o", "r", &context)
        .await
        .expect("memo");
    assert_eq!(hits.count(), 1, "memoized");
    // Another credential never reads this one's answer.
    let other = with_token("other", Duration::from_secs(5), 1 << 20);
    transport
        .repository_metadata("o", "r", &other)
        .await
        .expect("other credential");
    assert_eq!(hits.count(), 2, "memo is per credential");
}

#[tokio::test]
async fn a_failed_repository_read_is_not_memoized() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/o/r"))
        .respond_with(
            ResponseTemplate::new(404).set_body_json(serde_json::json!({"message":"Not Found"})),
        )
        .expect(2)
        .mount(&server)
        .await;
    let transport = anonymous_transport(&mock_endpoint(&server));
    let context = with_token("t", Duration::from_secs(5), 1 << 20);
    for _ in 0..2 {
        let error = transport
            .repository_metadata("o", "r", &context)
            .await
            .expect_err("missing");
        assert_eq!(error.reason, Some(ProviderErrorReason::RepositoryNotFound));
    }
}

#[tokio::test]
async fn code_search_room_counts_the_searches_the_window_has_left() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            serde_json::json!({"total_count":0,"incomplete_results":false,"items":[]}),
        ))
        .mount(&server)
        .await;
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        code_search_per_minute: 3,
        ..ExecutorConfig::relaxed()
    }));
    let (transport, _) = executor_transport(&server, budget, short_retry());
    let context = with_token("t", Duration::from_secs(5), 1 << 20);
    assert_eq!(transport.code_search_room(&context), 3);
    for keyword in ["one", "two"] {
        transport
            .search_code(
                &CodeSearchRequest {
                    query: keyword.into(),
                    page: 1,
                    per_page: 5,
                    include_fragments: false,
                },
                &context,
            )
            .await
            .expect("search");
    }
    assert_eq!(transport.code_search_room(&context), 1);
    assert_eq!(
        transport.code_search_room(&with_token("fresh", Duration::from_secs(5), 1 << 20)),
        3,
        "another credential has its own window"
    );
}

/// Four transports with their own budgets share one state directory,
/// as four processes on one `OCTOCODE_HOME` do. Eight concurrent code
/// searches against a 2/min window send at most 2, and every refused search
/// returns well before its deadline instead of queueing toward it.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn processes_sharing_a_state_dir_never_exceed_the_window_and_refuse_promptly() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(
                    serde_json::json!({"total_count":0,"incomplete_results":false,"items":[]}),
                )
                .set_delay(Duration::from_millis(200)),
        )
        .mount(&server)
        .await;
    let state = tempfile::tempdir().expect("state directory");
    let transports = (0..4)
        .map(|_| {
            let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
                code_search_per_minute: 2,
                ..ExecutorConfig::relaxed()
            }));
            let (mut transport, _) = executor_transport(
                &server,
                budget,
                RetryPolicy {
                    max_rate_limit_wait: Duration::from_secs(1),
                    ..short_retry()
                },
            );
            transport.set_rate_limit_state_dir(Some(state.path().to_path_buf()));
            Arc::new(transport)
        })
        .collect::<Vec<_>>();
    let mut searches = tokio::task::JoinSet::new();
    for (index, transport) in transports.iter().cycle().take(8).enumerate() {
        let transport = Arc::clone(transport);
        searches.spawn(async move {
            let started = std::time::Instant::now();
            let result = transport
                .search_code(
                    &CodeSearchRequest {
                        query: format!("q{index}"),
                        page: 1,
                        per_page: 5,
                        include_fragments: false,
                    },
                    &with_token("t", Duration::from_secs(10), 1 << 20),
                )
                .await;
            (result.map(|_| ()), started.elapsed())
        });
    }
    let mut sent = 0;
    while let Some(joined) = searches.join_next().await {
        let (result, elapsed) = joined.expect("search task");
        match result {
            Ok(()) => sent += 1,
            Err(error) => {
                assert_eq!(error.kind, ProviderErrorKind::RateLimited, "{error:?}");
                assert!(
                    elapsed < Duration::from_secs(3),
                    "refused after {elapsed:?}: a refusal must not queue toward the deadline"
                );
            }
        }
    }
    let received = server.received_requests().await.expect("recorded").len();
    assert_eq!(received, sent);
    assert!(received <= 2, "{received} searches reached a 2/min window");
    assert!(sent >= 1);
}

/// A row of several code searches is refused before the first is
/// sent when they cannot all start within the cap; the refusal reserves no
/// slot and claims no provider counters. A search the cache answers needs no
/// slot, so callers can count only the searches they will send.
#[tokio::test]
async fn a_code_search_batch_that_cannot_fit_is_refused_before_any_send() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .and(path("/api/v3/search/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            serde_json::json!({"total_count":0,"incomplete_results":false,"items":[]}),
        ))
        .expect(1)
        .mount(&server)
        .await;
    let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
        code_search_per_minute: 2,
        ..ExecutorConfig::relaxed()
    }));
    let (mut transport, _) = executor_transport(&server, budget, short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = with_token("t", Duration::from_secs(5), 1 << 20);
    let request = |query: &str| CodeSearchRequest {
        query: query.into(),
        page: 1,
        per_page: 5,
        include_fragments: false,
    };
    transport
        .search_code(&request("one"), &context)
        .await
        .expect("search");
    assert_eq!(transport.code_search_room(&context), 1);

    assert!(transport.code_search_batch_refusal(1, &context).is_none());
    let refusal = transport
        .code_search_batch_refusal(2, &context)
        .expect("two searches cannot fit one slot within the cap");
    assert_eq!(refusal.kind, ProviderErrorKind::RateLimited);
    assert!(
        refusal.message.contains("2 searches"),
        "{}",
        refusal.message
    );
    let rate = refusal.rate_limit.expect("rate limit");
    assert_eq!(rate.remaining, None);
    assert_eq!(rate.resource.as_deref(), Some("code_search"));
    // The wait is what is left of the one-minute code-search window.
    assert!(
        matches!(rate.retry_after_seconds, Some(1..=60)),
        "{:?}",
        rate.retry_after_seconds
    );
    assert_eq!(
        transport.code_search_room(&context),
        1,
        "a refusal reserves nothing"
    );

    assert!(
        transport
            .cached_code_search(&request("one"), &context)
            .await
            .expect("lookup")
            .is_some(),
        "a cached search is visible without a send"
    );
    assert!(
        transport
            .cached_code_search(&request("two"), &context)
            .await
            .expect("lookup")
            .is_none()
    );
}

/// A search the token only partly covered says so, and is not
/// cached (a cached copy would hide the authorization that fixes it).
#[tokio::test]
async fn a_search_partly_withheld_by_saml_names_the_organizations_and_is_not_cached() {
    let server = MockServer::builder().start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header(
                    "x-github-sso",
                    "partial-results; organizations=21955855,20582480",
                )
                .set_body_json(serde_json::json!({
                    "total_count": 0, "incomplete_results": false, "items": []
                })),
        )
        .expect(4)
        .mount(&server)
        .await;
    let (mut transport, _) = executor_transport(&server, GitHubBudget::relaxed(), short_retry());
    transport.cache = Arc::new(PartitionedCache::default());
    let context = with_token("t", Duration::from_secs(5), 1 << 20);
    for _ in 0..2 {
        let page = transport
            .search_code(&code_search_request(), &context)
            .await
            .expect("code search");
        assert_eq!(page.sso_partial_organizations, vec![21955855, 20582480]);
    }
    for _ in 0..2 {
        let history = transport
            .search_issues(
                &HistoryRequest {
                    query: "repo:o/r".into(),
                    page: 1,
                    per_page: 10,
                    sort: None,
                    order: None,
                },
                &context,
            )
            .await
            .expect("issues");
        assert!(
            history
                .warnings
                .iter()
                .any(|warning| warning.contains("SAML")),
            "{:?}",
            history.warnings
        );
    }
}

/// One logical GraphQL operation spends one physical-attempt budget: HTTP
/// retries and GraphQL semantic retries draw from the same count, so mixed
/// failures never send more than `max_attempts` requests.
#[tokio::test]
async fn graphql_semantic_and_http_retries_share_one_attempt_budget() {
    let transient = || {
        ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": null,
            "errors": [{"message": "Something went wrong while executing your query. This may be the result of a timeout."}]
        }))
    };
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/api/graphql"))
        .respond_with(Sequence::new(vec![
            ResponseTemplate::new(503),
            transient(),
            ResponseTemplate::new(503),
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({"data": {"viewer": {"login": "me"}}})),
        ]))
        .mount(&server)
        .await;
    let retry = RetryPolicy {
        max_attempts: 2,
        ..short_retry()
    };
    let (transport, _) = executor_transport(&server, GitHubBudget::relaxed(), retry);
    let page = transport
        .execute_graphql(
            "query { viewer { login } }",
            serde_json::json!({}),
            &with_token("t", Duration::from_secs(5), 1024),
        )
        .await
        .expect("the last answer is returned");
    assert!(
        !page.errors.is_empty(),
        "the budget ran out on the transient error"
    );
    assert_eq!(
        server.received_requests().await.unwrap_or_default().len(),
        2,
        "two physical sends for max_attempts = 2"
    );
}

/// A cancel during a GraphQL semantic-retry backoff stops the operation
/// without another send.
#[tokio::test]
async fn graphql_semantic_retry_backoff_honors_cancellation() {
    let server = MockServer::builder().start().await;
    Mock::given(method("POST"))
        .and(path("/api/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": null,
            "errors": [{"message": "Something went wrong while executing your query. This may be the result of a timeout."}]
        })))
        .mount(&server)
        .await;
    let retry = RetryPolicy {
        max_attempts: 3,
        base_delay: Duration::from_secs(30),
        ..short_retry()
    };
    let (transport, _) = executor_transport(&server, GitHubBudget::relaxed(), retry);
    let context = with_token("t", Duration::from_secs(60), 1024);
    let cancel = context.budget.cancellation.clone();
    let canceller = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(200)).await;
        cancel.cancel();
    });
    let started = std::time::Instant::now();
    let result = transport
        .execute_graphql(
            "query { viewer { login } }",
            serde_json::json!({}),
            &context,
        )
        .await;
    canceller.await.expect("canceller");
    // A zero full-jitter draw may retry at once; every later wait is cancelled.
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(server.received_requests().await.unwrap_or_default().len() <= 3);
    assert_eq!(
        result.err().map(|error| error.kind),
        Some(ProviderErrorKind::Cancelled)
    );
}

/// A directory listing at a full commit SHA is immutable: a second read is
/// served from the cache with no request, while a listing at a branch name
/// revalidates with its ETag.
#[tokio::test]
async fn listings_at_a_commit_sha_are_served_from_the_cache() {
    let server = MockServer::builder().start().await;
    let sha = "0123456789abcdef0123456789abcdef01234567";
    let listing = || {
        ResponseTemplate::new(200)
            .insert_header("etag", "\"tree\"")
            .set_body_json(serde_json::json!([
                {"name":"a.rs","path":"src/a.rs","type":"file","size":1}
            ]))
    };
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/acme/repo/contents/src"))
        .and(query_param("ref", sha))
        .respond_with(listing())
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v3/repos/acme/repo/contents/src"))
        .and(query_param("ref", "main"))
        .respond_with(listing())
        .expect(2)
        .mount(&server)
        .await;
    let base = provider(&server).await;
    let provider = GitHubProvider {
        transport: base.transport,
        cache: KeyedCache::default(),
    };
    let context = with_token("secret", Duration::from_secs(2), 1 << 16);
    for reference in [sha, sha, "main", "main"] {
        let listed = provider
            .repository_contents("acme", "repo", "src", reference, &context)
            .await
            .expect("listing");
        assert_eq!(listed.entries.len(), 1, "{reference}");
    }
}

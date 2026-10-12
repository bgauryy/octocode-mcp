//! Typed artifact registry discovery and exact metadata lookup.
mod leads;
mod output;

pub(crate) use output::Output;

use crate::providers::RequestBudget;
use crate::providers::artifact::{
    ArtifactCache, ArtifactError, ArtifactProviderContext, ArtifactProviderPage, ReleaseTags,
    SystemArtifactHttp, execute_artifact, github_repository, github_slug,
};
use crate::tools::id::ToolId;
use crate::tools::result::Continuation;
use serde_json::{Value, json};
use std::time::Instant;
use tokio_util::sync::CancellationToken;

pub use crate::providers::artifact::{
    ArtifactItem, ArtifactSearchQuery, ArtifactType, ResolvedNpmRegistry,
};

/// What one call takes from the runtime besides its query.
pub struct ArtifactCall<'a> {
    pub deadline: Instant,
    pub cancellation: CancellationToken,
    /// Opt-in escape hatch for the npm registry SSRF guard (`network`).
    pub allow_private_registry: bool,
    /// The runtime's registry cache; `None` (non-persistent storage)
    /// bypasses it.
    pub cache: Option<&'a ArtifactCache>,
    /// `network.timeout`: each call's request budget, within its deadline.
    pub timeout: std::time::Duration,
    /// `network.maxRetries`: retries of a 5xx or 429 registry answer.
    pub max_retries: u8,
    /// Upstream release-tag checks through the GitHub API.
    pub tags: Option<&'a dyn ReleaseTags>,
    /// The runtime's resolved environment: the npm userconfig and its
    /// `${NAME}` credential values come from it, never from the process.
    pub env: &'a std::collections::BTreeMap<String, String>,
}

pub async fn execute(
    query: ArtifactSearchQuery,
    call: ArtifactCall<'_>,
) -> Result<Value, ArtifactError> {
    let http = SystemArtifactHttp::shared()?.with_retries(call.max_retries);
    let budget = RequestBudget::new(
        call.deadline.min(Instant::now() + call.timeout),
        call.cancellation,
        16 * 1024 * 1024,
    );
    let npm_registry = npm_registry(&query, call.env)?;
    let page = execute_artifact(
        &query,
        &ArtifactProviderContext {
            http: &http,
            budget: &budget,
            npm_registry: npm_registry.as_ref(),
            allow_private_registry: call.allow_private_registry,
            cache: call.cache,
            tags: call.tags,
        },
    )
    .await
    .map_err(|error| leads::with_repair(error, &query))?;
    respond(&query, page).map_err(|error| leads::with_repair(error, &query))
}

/// The npm registry a query reads: only the query names it (default
/// npmjs); credentials come only from the user npmrc `env` names and only
/// when scoped to that origin. Other ecosystems have none.
fn npm_registry(
    query: &ArtifactSearchQuery,
    env: &std::collections::BTreeMap<String, String>,
) -> Result<Option<ResolvedNpmRegistry>, ArtifactError> {
    if query.artifact_type() != ArtifactType::Npm {
        return Ok(None);
    }
    let (raw, cache_identity) = match query.registry_url() {
        Some(raw) => (raw, None),
        None => ("https://registry.npmjs.org/", Some("npmjs")),
    };
    let base = url::Url::parse(raw).map_err(|_| {
        ArtifactError::new(
            "invalidInput",
            "Invalid npm registry URL: use HTTP(S) without credentials, query or fragment.",
        )
    })?;
    let cache_identity = cache_identity
        .or_else(|| base.host_str())
        .unwrap_or("npm")
        .to_owned();
    let authorization = crate::providers::artifact::npm_authorization(&base, env);
    Ok(Some(ResolvedNpmRegistry {
        base,
        authorization,
        cache_identity,
    }))
}

/// The response for one provider page. Rows are typed until here: a
/// homepage that restates the repository page is cleared before rows are
/// encoded, so every row keeps its field order (`name` first). An exact
/// lookup has no pagination; a discovery page states whether more exist and
/// the registry's total, and a later page names itself.
fn respond(
    query: &ArtifactSearchQuery,
    page: ArtifactProviderPage,
) -> Result<Value, ArtifactError> {
    let ArtifactProviderPage {
        mut artifacts,
        next_state,
        total,
        terminal_limit,
        ..
    } = page;
    if artifacts.is_empty()
        && let Some(name) = query.package_name()
        && terminal_limit.is_none()
    {
        // An exact coordinate the registry does not know is not-found, like
        // a GitHub 404; only a keyword discovery can be empty.
        return Err(ArtifactError::new(
            "notFound",
            format!(
                "Package {name} not found in the {} registry",
                query.artifact_type()
            ),
        )
        .with_status(404));
    }
    shape_rows(query, &mut artifacts);
    let mut rows = serde_json::to_value(&artifacts)
        .map_err(|_| ArtifactError::new("providerError", "Failed to encode artifacts."))?;
    for row in rows.as_array_mut().into_iter().flatten() {
        name_github_repository(row);
    }
    let mut data = json!({ "artifacts": rows });
    let mut terminal_limit = terminal_limit;
    match query.package_name() {
        None => {
            let page_cap = discovery_page(query, &mut data, next_state.is_some(), total);
            terminal_limit = terminal_limit.or(page_cap);
        }
        // An exact lookup whose source lives on GitHub continues to its
        // tree. Registry metadata can point at a fork or stale repo, so
        // these are leads, not proof.
        Some(_) => {
            for (name, lead) in artifacts
                .first()
                .map(leads::source_leads)
                .unwrap_or_default()
            {
                data["next"][name] = lead;
            }
        }
    }
    let missing = missing_ref_warnings(&artifacts);
    if !missing.is_empty() {
        data["warnings"] = json!(missing);
    }
    if let Some(limit) = terminal_limit {
        data["isPartial"] = json!(true);
        data["terminalLimit"] = json!(true);
        data["partialReasons"] = json!([limit]);
    }
    if artifacts.is_empty() {
        data["status"] = json!("empty");
        if let Some(broader) = leads::broaden_keywords(query) {
            data["next"]["broadenSearch"] = broader;
        }
    }
    Ok(data)
}

/// Typed row shaping before encoding: a row whose registry names no
/// repository but whose homepage is a GitHub repository points at it; a
/// homepage restating the repository is cleared (kept with `details`); the
/// release source is labeled; a complete dependency list drops its count.
fn shape_rows(query: &ArtifactSearchQuery, artifacts: &mut [ArtifactItem]) {
    let exact = query.package_name().is_some();
    let details = query.wants(crate::contracts::tool_types::ExtraKind::Details);
    for artifact in artifacts {
        if artifact.repository.is_none() {
            artifact.repository = artifact.homepage.as_deref().and_then(github_repository);
        }
        if !details {
            drop_repository_homepage(artifact);
        }
        leads::label_release_source(artifact, exact);
    }
}

/// A discovery page's facts: whether more exist and the registry's total
/// (a stats extra), and the next page, which carries the whole query. When
/// the contract rejects the next page (past its page maximum), the rest is
/// unreachable by paging: the returned reason states that terminal limit.
fn discovery_page(
    query: &ArtifactSearchQuery,
    data: &mut Value,
    more: bool,
    total: Option<u64>,
) -> Option<String> {
    let current = query.page();
    data["pagination"] = json!({"hasMore": more, "totalItems": total});
    if current > 1 {
        data["pagination"]["currentPage"] = json!(current);
    }
    if !more {
        return None;
    }
    let mut next = query.clone();
    next.set_page(current + 1);
    let next_query = serde_json::to_value(next).ok()?;
    if crate::contracts::validate_query(ToolId::ArtifactSearch.as_str(), next_query.clone())
        .is_err()
    {
        return Some(format!(
            "Page {current} is the last page artifactSearch can request; narrow the keywords to reach the remaining results."
        ));
    }
    data["next"]["nextPage"] = Continuation::new(ToolId::ArtifactSearch, next_query).build();
    None
}

/// One warning per row whose registry release commit GitHub does not have.
fn missing_ref_warnings(artifacts: &[ArtifactItem]) -> Vec<String> {
    artifacts
        .iter()
        .filter_map(|artifact| {
            let reference = artifact.missing_ref.as_deref()?;
            let repository = artifact.repository.as_deref().unwrap_or("its repository");
            let repository = repository
                .strip_prefix("https://github.com/")
                .unwrap_or(repository);
            Some(format!(
                "{} {}: release commit {reference} is not in {repository} (unpushed or rewritten).",
                artifact.name,
                artifact.version.as_deref().unwrap_or("")
            ))
        })
        .collect()
}

/// A row whose `repository` URL is a GitHub repository names its `owner` and
/// `repo` right after it: the coordinates every GitHub tool takes.
fn name_github_repository(row: &mut Value) {
    let Some(fields) = row.as_object_mut() else {
        return;
    };
    let Some((owner, repo)) = fields
        .get("repository")
        .and_then(Value::as_str)
        .and_then(github_slug)
    else {
        return;
    };
    let after = fields
        .keys()
        .position(|key| key == "repository")
        .map_or(fields.len(), |index| index + 1);
    fields.shift_insert(after, "owner".to_owned(), json!(owner));
    fields.shift_insert(after + 1, "repo".to_owned(), json!(repo));
}

/// Clears a homepage that is the repository page, or a `/tree/<ref>/…`
/// page inside it (it adds nothing). The registry URL is verbose (core
/// field class); every other field is evidence.
fn drop_repository_homepage(artifact: &mut ArtifactItem) {
    let bare = |url: &str| {
        url.split(['#', '?'])
            .next()
            .unwrap_or(url)
            .trim_end_matches('/')
            .trim_end_matches(".git")
            .to_ascii_lowercase()
    };
    let duplicate = match (artifact.homepage.as_deref(), artifact.repository.as_deref()) {
        (Some(homepage), Some(repository)) => {
            let (page, repository) = (bare(homepage), bare(repository));
            page == repository || page.starts_with(&format!("{repository}/tree/"))
        }
        _ => false,
    };
    if duplicate {
        artifact.homepage = None;
    }
}

#[cfg(test)]
mod row_tests {
    use super::{ArtifactItem, ArtifactType, drop_repository_homepage, name_github_repository};
    use serde_json::json;

    /// A GitHub repository URL names its owner and repo beside itself; any
    /// other host, or no repository, adds nothing.
    #[test]
    fn github_rows_name_owner_and_repo_after_the_repository_url() {
        let mut row = json!({"name":"ajv","repository":"https://github.com/ajv-validator/ajv.git","version":"8.0.0"});
        name_github_repository(&mut row);
        assert_eq!(
            row.as_object().unwrap().keys().collect::<Vec<_>>(),
            ["name", "repository", "owner", "repo", "version"]
        );
        assert_eq!(row["owner"], "ajv-validator");
        assert_eq!(row["repo"], "ajv");
        let mut other = json!({"name":"x","repository":"https://gitlab.com/g/x"});
        name_github_repository(&mut other);
        assert!(other.get("owner").is_none() && other.get("repo").is_none());
        let mut none = json!({"name":"x"});
        name_github_repository(&mut none);
        assert_eq!(none, json!({"name":"x"}));
    }

    fn row(homepage: &str, repository: &str) -> ArtifactItem {
        let mut item = ArtifactItem::new(ArtifactType::Npm, "x".into(), "https://r/x".into());
        item.homepage = Some(homepage.into());
        item.repository = Some(repository.into());
        item.description = Some("d".into());
        item
    }

    #[test]
    fn only_a_homepage_that_is_the_repository_page_is_dropped() {
        let mut same = row("https://github.com/o/x#readme", "https://github.com/o/x");
        drop_repository_homepage(&mut same);
        assert_eq!(same.homepage, None);
        // A tree page of the repository, or a `.git` repository URL, is the
        // repository too.
        for (homepage, repository) in [
            (
                "https://github.com/DT/DT/tree/master/types/node",
                "https://github.com/DT/DT",
            ),
            (
                "https://github.com/Seldaek/monolog",
                "https://github.com/Seldaek/monolog.git",
            ),
        ] {
            let mut same = row(homepage, repository);
            drop_repository_homepage(&mut same);
            assert_eq!(same.homepage, None, "{homepage}");
        }
        let mut distinct = row("https://zod.dev", "https://github.com/o/x");
        drop_repository_homepage(&mut distinct);
        assert_eq!(distinct.homepage.as_deref(), Some("https://zod.dev"));
        // The registry URL is verbose: the verbose stage drops it by default.
        assert!(
            crate::response::extras::all_paths(crate::tools::id::ToolId::ArtifactSearch)
                .contains(&"results[].data.artifacts[].registryUrl")
        );
    }

    #[test]
    fn rows_carry_no_type_and_start_with_the_name() {
        let encoded =
            serde_json::to_value(row("https://zod.dev", "https://github.com/o/x")).expect("row");
        let keys = encoded.as_object().expect("row").keys().collect::<Vec<_>>();
        assert_eq!(
            keys.first().map(|key| key.as_str()),
            Some("name"),
            "{encoded}"
        );
        assert!(!keys.iter().any(|key| *key == "type"), "{encoded}");
    }
}

#[cfg(test)]
mod anchor_tests {
    use super::*;
    use crate::providers::artifact::ArtifactProviderPage;

    fn exact_row() -> ArtifactItem {
        let mut item = ArtifactItem::new(
            ArtifactType::Npm,
            "zod".into(),
            "https://www.npmjs.com/package/zod".into(),
        );
        item.version = Some("4.6.5".into());
        item.repository = Some("https://github.com/colinhacks/zod".into());
        item.source_ref = Some("59bbc03e10c636b9eb3c393dfeb552819774ec21".into());
        item.source_attested = true;
        item
    }

    /// An exact row carries what the next hop takes: the package's name
    /// and version, its repository as `owner`/`repo` for ghStructure, and
    /// the release ref with how it was checked. No query field is echoed.
    #[test]
    fn an_exact_row_carries_the_release_source_anchors() {
        let query = typed(&json!({"ecosystem":"npm","packageName":"zod"}));
        let data = respond(&query, ArtifactProviderPage::single(exact_row())).expect("row");
        let row = data["artifacts"][0].as_object().expect("row");
        for anchor in [
            "name",
            "version",
            "repository",
            "owner",
            "repo",
            "sourceRef",
            "verification",
        ] {
            assert!(row.contains_key(anchor), "{anchor}: {data}");
        }
        assert_eq!(row["owner"], "colinhacks");
        assert_eq!(row["repo"], "zod");
        assert_eq!(row["verification"], "provenance");
        assert!(
            !row.contains_key("ecosystem") && !row.contains_key("type"),
            "{data}"
        );
        let tree = &data["next"]["viewReleaseSource"]["query"]["queries"][0];
        assert_eq!(tree["ref"], row["sourceRef"], "{data}");
    }

    /// A discovery row whose registry names no repository but whose
    /// homepage is a GitHub repository carries it, as `owner`/`repo`; the
    /// homepage that restated it is gone.
    #[test]
    fn a_github_homepage_is_a_discovery_rows_repository() {
        let query = typed(&json!({"ecosystem":"rubygems","keywords":["jwt"]}));
        let mut gem = ArtifactItem::new(
            ArtifactType::Rubygems,
            "json-jwt".into(),
            "https://rubygems.org/gems/json-jwt".into(),
        );
        gem.homepage = Some("https://github.com/nov/json-jwt".into());
        let data = respond(
            &query,
            ArtifactProviderPage {
                artifacts: vec![gem],
                next_state: None,
                total: None,
                terminal_limit: None,
                registry: None,
            },
        )
        .expect("rows");
        let row = &data["artifacts"][0];
        assert_eq!(
            row["repository"], "https://github.com/nov/json-jwt",
            "{data}"
        );
        assert_eq!(
            (&row["owner"], &row["repo"]),
            (&json!("nov"), &json!("json-jwt"))
        );
        assert!(row.get("homepage").is_none(), "{data}");
    }

    /// An empty discovery states no advice: its one lead re-runs the
    /// search without each keyword, as one batch.
    #[test]
    fn an_empty_discovery_broadens_by_dropping_each_keyword() {
        let query = typed(&json!({"ecosystem":"crates","keywords":["zzz","async","runtime"]}));
        let data = respond(&query, ArtifactProviderPage::empty(Some(0))).expect("empty");
        assert_eq!(data["status"], "empty");
        assert!(data.get("hints").is_none(), "{data}");
        let variants = data["next"]["broadenSearch"]["query"]["queries"]
            .as_array()
            .expect("batch");
        assert_eq!(variants.len(), 3, "{data}");
        assert_eq!(variants[0]["keywords"], json!(["zzz", "async"]), "{data}");
        assert_eq!(variants[0]["ecosystem"], "crates", "{data}");
        let single = typed(&json!({"ecosystem":"crates","keywords":["zzz"]}));
        let data = respond(&single, ArtifactProviderPage::empty(Some(0))).expect("empty");
        assert!(data.get("next").is_none(), "{data}");
    }

    /// A failure a call repairs carries exactly that one lead and no text.
    #[test]
    fn failures_carry_one_repair_lead() {
        let unknown = typed(&json!({"ecosystem":"crates","packageName":"no-such-crate@1.0.0"}));
        let error = respond(&unknown, ArtifactProviderPage::empty(Some(0))).expect_err("missing");
        let error = leads::with_repair(error, &unknown);
        let next = error.next.expect("lead");
        assert_eq!(next.as_object().map(|next| next.len()), Some(1), "{next}");
        assert_eq!(
            next["broadenSearch"]["query"]["queries"][0],
            json!({"ecosystem":"crates","keywords":["no-such-crate"]})
        );
        assert!(error.hints.is_empty());

        let pinned = typed(&json!({"ecosystem":"npm","packageName":"zod","version":"3.22.9"}));
        let mut missing = ArtifactError::new("versionNotFound", "no 3.22.9");
        missing.nearest = vec!["3.22.4".into(), "3.22.0".into()];
        let next = leads::with_repair(missing, &pinned).next.expect("lead");
        let versions = next["repair"]["query"]["queries"]
            .as_array()
            .expect("batch")
            .iter()
            .map(|row| row["version"].clone())
            .collect::<Vec<_>>();
        assert_eq!(versions, [json!("3.22.4"), json!("3.22.0")], "{next}");

        let latest = leads::with_repair(ArtifactError::new("capabilityUnavailable", "x"), &pinned)
            .next
            .expect("lead");
        assert_eq!(
            latest["repair"]["query"]["queries"][0],
            json!({"ecosystem":"npm","packageName":"zod"})
        );
        // PyPI has no keyword search: an unknown package has no repair.
        let pypi = typed(&json!({"ecosystem":"pypi","packageName":"nope"}));
        let error = ArtifactError::new("notFound", "x");
        assert!(leads::with_repair(error, &pypi).next.is_none());
    }
}

/// The generated query for a test's JSON row.
#[cfg(test)]
fn typed(query: &Value) -> ArtifactSearchQuery {
    serde_json::from_value(query.clone()).expect("valid artifactSearch query")
}

/// A test call: no cache, no tag checks, the default network settings.
#[cfg(test)]
fn call(deadline: Instant, allow_private_registry: bool) -> ArtifactCall<'static> {
    ArtifactCall {
        deadline,
        cancellation: CancellationToken::new(),
        allow_private_registry,
        cache: None,
        timeout: std::time::Duration::from_secs(300),
        max_retries: 1,
        tags: None,
        env: &NO_ENV,
    }
}

/// A test runtime environment with no npm userconfig or home.
#[cfg(test)]
static NO_ENV: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();

#[cfg(test)]
mod page_tests {
    use super::*;
    use std::time::Duration;

    /// An expired deadline separates page validation (runs first) from
    /// provider execution: a page past the paging range fails as
    /// `invalid_query` before any request budget is consulted, while an
    /// in-range page reaches the provider and fails on the dead budget.
    #[tokio::test]
    async fn a_page_past_the_paging_range_is_rejected_before_provider_work() {
        let dead = Instant::now() - Duration::from_secs(1);
        let run = |page: u64| {
            let query = json!({
                "ecosystem": "npm",
                "keywords": ["http"],
                "page": page,
                "mainGoal": "test", "reasoning": "test",
            });
            async move {
                execute(typed(&query), call(dead, false))
                    .await
                    .expect_err("dead budget or rejection")
            }
        };
        assert_eq!(run(5_000).await.code, "invalidInput");
        assert_ne!(run(2).await.code, "invalidInput");
    }
}

#[cfg(test)]
mod npm_auth_tests {
    use super::*;

    /// Loopback npm registry recording each request's Authorization header.
    async fn registry() -> (u16, wiremock::MockServer) {
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(json!({"name": "audit-package", "version": "1.0.0"})),
            )
            .mount(&server)
            .await;
        (server.address().port(), server)
    }

    async fn authorizations(server: &wiremock::MockServer) -> Vec<Option<String>> {
        server
            .received_requests()
            .await
            .unwrap_or_default()
            .iter()
            .map(|request| {
                request
                    .headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_owned)
            })
            .collect()
    }

    async fn lookup(port: u16, npmrc: &std::path::Path) {
        let query = json!({
            "ecosystem": "npm",
            "packageName": "audit-package",
            "registryUrl": format!("http://127.0.0.1:{port}"),
            "mainGoal": "test", "reasoning": "test",
        });
        // Generous: building the system HTTP client (native root certs) can
        // be slow in sandboxed test environments.
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        let env = std::collections::BTreeMap::from([(
            "NPM_CONFIG_USERCONFIG".to_owned(),
            npmrc.to_string_lossy().into_owned(),
        )]);
        execute(
            typed(&query),
            ArtifactCall {
                env: &env,
                ..call(deadline, true)
            },
        )
        .await
        .expect("lookup succeeds");
    }

    /// A missing exact package is notFound (like the GitHub tools), not
    /// an empty discovery.
    #[tokio::test]
    async fn missing_exact_package_is_not_found() {
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(404))
            .mount(&server)
            .await;
        let query = json!({
            "ecosystem": "npm",
            "packageName": "no-such-package-zz",
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
            "mainGoal": "test", "reasoning": "test",
        });
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        let error = execute(typed(&query), call(deadline, true))
            .await
            .expect_err("missing package");
        assert_eq!(error.code, "notFound", "{error:?}");
        assert_eq!(error.status, Some(404));
        assert!(error.message.contains("no-such-package-zz"), "{error:?}");
    }

    /// An exact lookup offers one source lead: the commit the version was
    /// published from (`gitHead`), at the package directory. The default
    /// branch is that lead without `branch`, so no second lead restates it.
    #[tokio::test]
    async fn exact_lookup_offers_one_release_lead_at_the_package_directory() {
        let sha = "4b0051f400219f8d8855f9a5433c6df35f15a639";
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "name": "audit-package", "version": "1.31.0", "gitHead": sha,
                "repository": {"url": "git+https://github.com/o/r.git", "directory": "packages/x"}
            })))
            .mount(&server)
            .await;
        let query = json!({
            "ecosystem": "npm",
            "packageName": "audit-package",
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
        });
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        for version in [None, Some("1.31.0")] {
            let mut query = query.clone();
            if let Some(version) = version {
                query["version"] = json!(version);
            }
            let data = execute(typed(&query), call(deadline, true))
                .await
                .expect("lookup succeeds");
            let next = data["next"].as_object().expect("next");
            // An exact row is a single hit: one lead, the release tree.
            assert_eq!(
                next.keys().collect::<Vec<_>>(),
                vec!["viewReleaseSource"],
                "{data}"
            );
            // An exact lookup has one row: no pagination, no request echo.
            assert!(data.get("pagination").is_none(), "{data}");
            assert!(data.get("type").is_none(), "{data}");
            let release = &next["viewReleaseSource"];
            assert_eq!(release["tool"], "ghStructure", "{data}");
            assert_eq!(
                release["query"]["queries"][0],
                json!({"owner": "o", "repo": "r", "path": "packages/x", "ref": sha}),
                "{data}"
            );
            // An unchecked registry ref is labeled as the registry's
            // claim on the row (the one source); leads do not repeat it.
            assert!(release.get("source").is_none(), "{data}");
            assert!(release.get("verification").is_none(), "{data}");
            let row = data["artifacts"][0].as_object().expect("row");
            assert_eq!(row["sourceRef"], sha, "{data}");
            assert_eq!(row["verification"], "registryRef", "{data}");
            assert!(row.keys().all(|key| key != "gitHead"), "{data}");
            assert_eq!(
                row.keys().next().map(String::as_str),
                Some("name"),
                "{data}"
            );
        }
    }

    /// GitHub answers every ref check with `exists`.
    struct Refs {
        exists: Option<bool>,
    }

    impl crate::providers::artifact::ReleaseTags for Refs {
        fn exists<'a>(
            &'a self,
            _owner: &'a str,
            _repo: &'a str,
            _reference: &'a str,
        ) -> crate::providers::artifact::TagFuture<'a> {
            let exists = self.exists;
            Box::pin(async move { exists })
        }
    }

    /// An npm `gitHead` GitHub does not have (an unpushed or rewritten
    /// commit) is no release source: the row offers the default branch
    /// (`viewRepo`, `verification:"defaultBranch"`) and its warning names the
    /// registry's dead ref, instead of a `viewReleaseSource` that fails. A
    /// ref GitHub has, or a check that could not run, keeps the registry's
    /// claim (`registryRef`).
    #[tokio::test]
    async fn an_npm_git_head_missing_upstream_is_no_release_lead() {
        let sha = "2bd066d87f5bafd315be9f40889d0a60b9e58e0b";
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "name": "typescript", "version": "7.0.2", "gitHead": sha,
                "repository": {"url": "git+https://github.com/microsoft/TypeScript.git"}
            })))
            .mount(&server)
            .await;
        let query = typed(&json!({
            "ecosystem": "npm",
            "packageName": "typescript",
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
        }));
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        let missing = Refs {
            exists: Some(false),
        };
        let checked = ArtifactCall {
            tags: Some(&missing),
            ..call(deadline, true)
        };
        let data = execute(query.clone(), checked).await.expect("lookup");
        let next = data["next"].as_object().expect("next");
        assert_eq!(next.keys().collect::<Vec<_>>(), vec!["viewRepo"], "{data}");
        let row = &data["artifacts"][0];
        assert!(row.get("sourceRef").is_none(), "{data}");
        assert_eq!(row["verification"], "defaultBranch", "{data}");
        let warnings = data["warnings"].to_string();
        assert!(warnings.contains(sha), "{data}");
        assert!(warnings.contains("microsoft/TypeScript"), "{data}");

        for exists in [Some(true), None] {
            let refs = Refs { exists };
            let checked = ArtifactCall {
                tags: Some(&refs),
                ..call(deadline, true)
            };
            let data = execute(query.clone(), checked).await.expect("lookup");
            assert_eq!(data["artifacts"][0]["sourceRef"], sha, "{data}");
            assert_eq!(
                data["artifacts"][0]["verification"], "registryRef",
                "{data}"
            );
            assert!(data["next"]["viewReleaseSource"].is_object(), "{data}");
            assert!(data.get("warnings").is_none(), "{data}");
        }
    }

    /// An npm search window: rows `p{n}` from `from` (or from 0 once `from`
    /// passes `reachable`, as npm silently restarts a deep window), `size`
    /// rows at most, out of `total`.
    struct NpmWindow {
        total: u64,
        reachable: u64,
    }

    impl wiremock::Respond for NpmWindow {
        fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
            let param = |name: &str| {
                request
                    .url
                    .query_pairs()
                    .find(|(key, _)| key == name)
                    .and_then(|(_, value)| value.parse::<u64>().ok())
            };
            let from = param("from").unwrap_or(0);
            let from = if from > self.reachable { 0 } else { from };
            let end = (from + param("size").unwrap_or(20)).min(self.total);
            let objects: Vec<Value> = (from..end)
                .map(|n| json!({"package": {"name": format!("p{n}"), "version": "1.0.0"}}))
                .collect();
            wiremock::ResponseTemplate::new(200)
                .set_body_json(json!({"objects": objects, "total": self.total}))
        }
    }

    async fn npm_window(total: u64, reachable: u64) -> wiremock::MockServer {
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(NpmWindow { total, reachable })
            .mount(&server)
            .await;
        server
    }

    fn npm_page(server: &wiremock::MockServer, page: u64, page_size: u64) -> ArtifactSearchQuery {
        typed(&json!({
            "ecosystem": "npm",
            "keywords": ["x"],
            "pageSize": page_size,
            "page": page,
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
        }))
    }

    /// npm restarts a window whose `from` passes its undocumented reach,
    /// serving earlier rows as if they were the page. A page of repeated
    /// rows lists none of them: it keeps the registry's total and states
    /// how many rows are reachable, with no next page.
    #[tokio::test]
    async fn a_repeated_npm_window_is_a_terminal_limit_with_the_reachable_count() {
        let server = npm_window(100_000, 50).await;
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        // Pages inside the reach are their own rows and continue.
        for page in [1, 3, 6] {
            let data = execute(npm_page(&server, page, 10), call(deadline, true))
                .await
                .expect("discovery succeeds");
            let first = (page - 1) * 10;
            assert_eq!(data["artifacts"][0]["name"], format!("p{first}"), "{data}");
            assert!(data["next"]["nextPage"].is_object(), "{data}");
            assert!(data.get("terminalLimit").is_none(), "{data}");
        }
        // Past the reach, the window repeats from the first row.
        let data = execute(npm_page(&server, 7, 10), call(deadline, true))
            .await
            .expect("discovery succeeds");
        assert_eq!(data["artifacts"], json!([]), "{data}");
        assert_eq!(data["terminalLimit"], true, "{data}");
        assert_eq!(data["pagination"]["totalItems"], 100_000, "{data}");
        assert!(data["next"].get("nextPage").is_none(), "{data}");
        let reason = data["partialReasons"][0].as_str().unwrap_or_default();
        assert!(reason.contains("at most 60 of 100000"), "{data}");
        // The boundary page: its probe is still honored, the page is not.
        let server = npm_window(100_000, 59).await;
        let data = execute(npm_page(&server, 7, 10), call(deadline, true))
            .await
            .expect("discovery succeeds");
        assert_eq!(data["artifacts"], json!([]), "{data}");
        assert_eq!(data["terminalLimit"], true, "{data}");
    }

    /// The last page the contract accepts offers no next page: it states
    /// the terminal limit instead of a lead the tool would reject.
    #[tokio::test]
    async fn the_last_requestable_page_states_a_terminal_limit_not_a_next_page() {
        let server = npm_window(100_000, 100_000).await;
        let query = json!({
            "ecosystem": "npm",
            "keywords": ["x"],
            "pageSize": 1,
            "page": 1000,
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
        });
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        let data = execute(typed(&query), call(deadline, true))
            .await
            .expect("discovery succeeds");
        assert!(data["next"].get("nextPage").is_none(), "{data}");
        assert_eq!(data["terminalLimit"], true, "{data}");
        assert!(
            data["partialReasons"][0]
                .as_str()
                .is_some_and(|reason| reason.contains("Page 1000 is the last page")),
            "{data}"
        );
    }

    /// A discovery page states only what the rows do not: whether more
    /// exist and the registry's total.
    #[tokio::test]
    async fn discovery_pagination_states_more_and_the_total_only() {
        let server = wiremock::MockServer::builder().start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "objects": [{"package": {"name": "a", "version": "1.0.0"}},
                            {"package": {"name": "b", "version": "1.0.0"}}],
                "total": 9
            })))
            .mount(&server)
            .await;
        let query = json!({
            "ecosystem": "npm",
            "keywords": ["x"],
            "pageSize": 2,
            "registryUrl": format!("http://127.0.0.1:{}", server.address().port()),
        });
        let deadline = Instant::now() + std::time::Duration::from_secs(300);
        let data = execute(typed(&query), call(deadline, true))
            .await
            .expect("discovery succeeds");
        assert_eq!(
            data["pagination"],
            json!({"hasMore": true, "totalItems": 9}),
            "{data}"
        );
        assert_eq!(
            data["next"]["nextPage"]["query"]["queries"][0]["pageSize"], 2,
            "{data}"
        );
    }

    #[tokio::test]
    async fn user_npmrc_token_reaches_only_its_scoped_registry() {
        let (port, seen) = registry().await;
        let dir = tempfile::tempdir().unwrap();
        let scoped = dir.path().join("scoped.npmrc");
        std::fs::write(
            &scoped,
            format!("//127.0.0.1:{port}/:_authToken=synthetic\n"),
        )
        .unwrap();
        lookup(port, &scoped).await;
        let other = dir.path().join("other.npmrc");
        std::fs::write(
            &other,
            format!(
                "//127.0.0.1:{}/:_authToken=elsewhere\n",
                port.wrapping_add(1)
            ),
        )
        .unwrap();
        lookup(port, &other).await;
        assert_eq!(
            authorizations(&seen).await,
            vec![Some("Bearer synthetic".to_owned()), None]
        );
    }
}

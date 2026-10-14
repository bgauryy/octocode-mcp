use super::http::{DnsPin, JSON, NPM_INSTALL_JSON, RegistryClient};
use super::util::{
    canonical_repository, commit_sha, date_from_millis, encode_component, endpoint, object_for,
    required, safe_url, string, total,
};
use super::versions::{VersionSpec, nearest, npm_resolve};
use super::{
    ArtifactError, ArtifactItem, ArtifactProviderPage, ArtifactProviderState, ArtifactSearchQuery,
    ArtifactType, ResolvedNpmRegistry,
};
use serde_json::Value;
use std::collections::BTreeMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use url::{Host, Url};

pub(crate) async fn npm(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    allow_private_registry: bool,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let dns_pin = validate_registry(query, registry, allow_private_registry)?;
    if let Some(name) = query.bare_package_name() {
        exact(name, query.version(), registry, client, dns_pin).await
    } else {
        search(query, state, registry, client, dns_pin).await
    }
}

fn validate_registry(
    query: &ArtifactSearchQuery,
    registry: &ResolvedNpmRegistry,
    allow_private_registry: bool,
) -> Result<Option<DnsPin>, ArtifactError> {
    let base = &registry.base;
    if !matches!(base.scheme(), "http" | "https")
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
    {
        return Err(ArtifactError::new(
            "invalidInput",
            "Invalid npm registry URL: use HTTP(S) without credentials, query or fragment.",
        ));
    }
    if let Some(requested) = query.registry_url() {
        let requested = Url::parse(requested).map_err(|_| {
            ArtifactError::new(
                "invalidInput",
                "Invalid npm registry URL: use HTTP(S) without credentials, query or fragment.",
            )
        })?;
        if trim_registry(&requested) != trim_registry(base) {
            return Err(ArtifactError::new(
                "invalidInput",
                "Resolved npm registry does not match the query registry.",
            ));
        }
    }
    if allow_private_registry {
        return Ok(None);
    }
    validate_registry_target(base)
}

fn trim_registry(url: &Url) -> String {
    url.as_str().trim_end_matches('/').to_owned()
}

fn registry_target_error() -> ArtifactError {
    ArtifactError::new(
        "invalidInput",
        "Invalid npm registry URL: loopback, link-local, and private hosts are not allowed \
         (set network.allowPrivateRegistry / OCTOCODE_ALLOW_PRIVATE_REGISTRY to permit).",
    )
}

/// Validate a custom registry target and return the exact public DNS answers
/// that the HTTP transport must use. The official npm registry is the sole
/// hostname allowlist entry; every other domain is resolved once, rejects a
/// mixed public/private answer, and is pinned through connect.
fn validate_registry_target(base: &Url) -> Result<Option<DnsPin>, ArtifactError> {
    match base.host() {
        Some(Host::Ipv4(ip)) if is_blocked_v4(&ip) => Err(registry_target_error()),
        Some(Host::Ipv6(ip)) if is_blocked_v6(&ip) => Err(registry_target_error()),
        Some(Host::Ipv4(_) | Host::Ipv6(_)) => Ok(None),
        Some(Host::Domain(name)) => {
            let dns_host = name.to_ascii_lowercase();
            let host = dns_host.trim_end_matches('.');
            if host.is_empty() || host == "localhost" || host.ends_with(".localhost") {
                return Err(registry_target_error());
            }
            if base.scheme() == "https"
                && host == "registry.npmjs.org"
                && base.port_or_known_default() == Some(443)
            {
                return Ok(None);
            }
            let port = base
                .port_or_known_default()
                .ok_or_else(registry_target_error)?;
            let addresses: Vec<SocketAddr> = (dns_host.as_str(), port)
                .to_socket_addrs()
                .map_err(|_| {
                    ArtifactError::new(
                        "providerError",
                        "Custom npm registry hostname could not be resolved safely.",
                    )
                })?
                .collect();
            validate_resolved_addresses(&addresses)?;
            Ok(Some(DnsPin {
                host: dns_host,
                addresses,
            }))
        }
        None => Err(registry_target_error()),
    }
}

fn validate_resolved_addresses(addresses: &[SocketAddr]) -> Result<(), ArtifactError> {
    if addresses.is_empty() {
        return Err(ArtifactError::new(
            "providerError",
            "Custom npm registry hostname resolved without any usable address.",
        ));
    }
    if addresses.iter().any(|address| is_blocked_ip(&address.ip())) {
        return Err(registry_target_error());
    }
    Ok(())
}

fn is_blocked_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_v4(v4),
        IpAddr::V6(v6) => is_blocked_v6(v6),
    }
}

fn is_blocked_v4(ip: &Ipv4Addr) -> bool {
    let octets = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        // CGNAT / shared address space 100.64.0.0/10
        || (octets[0] == 100 && (octets[1] & 0xc0) == 64)
}

fn is_blocked_v6(ip: &Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_loopback()
        || ip.is_unspecified()
        // link-local fe80::/10
        || (segments[0] & 0xffc0) == 0xfe80
        // unique local (ULA) fc00::/7
        || (segments[0] & 0xfe00) == 0xfc00
        // IPv4-mapped/compatible addresses embedding a blocked v4
        || matches!(ip.to_ipv4_mapped(), Some(v4) if is_blocked_v4(&v4))
        || matches!(ip.to_ipv4(), Some(v4) if is_blocked_v4(&v4))
}

pub(crate) fn split_npm_coordinate(package_name: &str) -> (&str, Option<&str>) {
    if let Some(rest) = package_name.strip_prefix('@') {
        if let Some((name, version)) = rest.rsplit_once('@')
            && !version.is_empty()
            && name.contains('/')
        {
            let name_len = package_name.len() - version.len() - 1;
            return (&package_name[..name_len], Some(version));
        }
        return (package_name, None);
    }
    if let Some((name, version)) = package_name.rsplit_once('@')
        && !name.is_empty()
        && !version.is_empty()
        && !name.contains('/')
    {
        return (name, Some(version));
    }
    (package_name, None)
}

async fn exact(
    name: &str,
    version: Option<&str>,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    dns_pin: Option<DnsPin>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let encoded = if let Some(scoped) = name.strip_prefix('@') {
        format!("@{}", encode_component(scoped))
    } else {
        encode_component(name)
    };
    // Exact versions and tags are one manifest request; a range resolves
    // against the abbreviated packument first, as `npm install` would.
    let spec = match version.map(VersionSpec::parse) {
        None => "latest".to_owned(),
        Some(VersionSpec::Exact(version) | VersionSpec::Tag(version)) => version,
        Some(VersionSpec::Range(range)) => {
            let Some(packument) = packument(&encoded, registry, client, dns_pin.clone()).await?
            else {
                return Ok(not_found_page(registry));
            };
            let (versions, latest) = published_versions(&packument);
            match npm_resolve(
                &range,
                versions.iter().map(String::as_str),
                latest.as_deref(),
            ) {
                Some(resolved) => resolved,
                None => return Err(version_not_found(name, &range, &versions)),
            }
        }
    };
    // Percent-encode the version/spec as its own path segment so ranges or
    // tags cannot alter the request path.
    let request_url = registry_url(
        &registry.base,
        &format!("{encoded}/{}", encode_component(&spec)),
    )?;
    let authorization = registry.authorization_for(&request_url);
    let response = client
        .json(
            ArtifactType::Npm,
            request_url,
            true,
            authorization,
            dns_pin.clone(),
            JSON,
        )
        .await?;
    let Some(response) = response else {
        // The package may exist without this version or tag: say which.
        if version.is_some()
            && let Some(packument) = packument(&encoded, registry, client, dns_pin).await?
        {
            let (versions, _) = published_versions(&packument);
            return Err(version_not_found(name, &spec, &versions));
        }
        return Ok(not_found_page(registry));
    };
    let row = object_for(&response, ArtifactType::Npm)?;
    let returned = required(row.get("name"), ArtifactType::Npm)?;
    if returned != name {
        return Err(ArtifactError::new(
            "providerError",
            "npm registry returned a different package name.",
        ));
    }
    let version = required(row.get("version"), ArtifactType::Npm)?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Npm,
        returned.clone(),
        format!(
            "{}/{}",
            trim_registry(&registry.base),
            encode_component(&returned)
        ),
    );
    artifact.description = string(row.get("description"));
    artifact.license = match row.get("license") {
        Some(Value::Object(value)) => string(value.get("type")),
        value => string(value),
    };
    artifact.homepage = string(row.get("homepage"));
    artifact.source_ref = commit_sha(row.get("gitHead"));
    match row.get("repository") {
        Some(Value::String(value)) => artifact.repository = canonical_repository(value),
        Some(Value::Object(value)) => {
            artifact.repository = value
                .get("url")
                .and_then(Value::as_str)
                .and_then(canonical_repository);
            artifact.repository_directory = string(value.get("directory")).map(|value| {
                value
                    .trim_start_matches("./")
                    .trim_start_matches('/')
                    .to_owned()
            });
        }
        _ => {}
    }
    release_facts(&mut artifact, row);
    if let Some(attested) =
        attested_commit(&artifact, &version, row, registry, client, dns_pin).await
    {
        artifact.source_ref = Some(attested);
        artifact.source_attested = true;
    } else if let (Some(repository), Some(head)) =
        (artifact.repository.clone(), artifact.source_ref.clone())
        && super::release_ref::github_ref_missing(&repository, &head, client).await
    {
        // A `gitHead` GitHub does not have pins no lead: the default branch
        // is read instead, and the response names the dead ref.
        artifact.source_ref = None;
        artifact.missing_ref = Some(head);
    }
    artifact.version = Some(version);
    Ok(ArtifactProviderPage {
        registry: Some(trim_registry(&registry.base)),
        ..ArtifactProviderPage::single(artifact)
    })
}

fn not_found_page(registry: &ResolvedNpmRegistry) -> ArtifactProviderPage {
    let mut page = ArtifactProviderPage::empty(Some(0));
    page.registry = Some(trim_registry(&registry.base));
    page
}

/// The abbreviated packument (versions and dist-tags only); `None` when the
/// package does not exist.
async fn packument(
    encoded: &str,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    dns_pin: Option<DnsPin>,
) -> Result<Option<Value>, ArtifactError> {
    let url = registry_url(&registry.base, encoded)?;
    let authorization = registry.authorization_for(&url);
    client
        .json(
            ArtifactType::Npm,
            url,
            true,
            authorization,
            dns_pin,
            NPM_INSTALL_JSON,
        )
        .await
}

fn published_versions(packument: &Value) -> (Vec<String>, Option<String>) {
    let versions = packument
        .get("versions")
        .and_then(Value::as_object)
        .map(|versions| versions.keys().cloned().collect())
        .unwrap_or_default();
    let latest = string(packument.pointer("/dist-tags/latest"));
    (versions, latest)
}

/// A known package without the requested version: typed, with the nearest
/// published versions as the recovery.
pub(crate) fn version_not_found(name: &str, requested: &str, versions: &[String]) -> ArtifactError {
    let close = nearest(requested, versions.iter().map(String::as_str));
    let error = ArtifactError::new(
        "versionNotFound",
        format!("{name} has no published version matching \"{requested}\""),
    )
    .with_status(404);
    ArtifactError {
        nearest: close,
        ..error
    }
}

/// Release facts the version manifest already carries.
fn release_facts(artifact: &mut ArtifactItem, row: &serde_json::Map<String, Value>) {
    // A manifest without `dependencies` declares none.
    let declared = |field: &str| -> Vec<String> {
        row.get(field)
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
            .map(|(name, range)| match range.as_str() {
                Some(range) => format!("{name}@{range}"),
                None => name.clone(),
            })
            .collect()
    };
    artifact.dependencies = Some(declared("dependencies"));
    artifact.peer_dependencies = Some(declared("peerDependencies"));
    artifact.deprecated = string(row.get("deprecated"));
    artifact.engines = row
        .get("engines")
        .and_then(Value::as_object)
        .map(|engines| {
            engines
                .iter()
                .filter_map(|(name, range)| Some((name.clone(), range.as_str()?.to_owned())))
                .collect::<BTreeMap<_, _>>()
        })
        .filter(|engines| !engines.is_empty());
    artifact.published_at = published_at(row);
}

/// npm's version manifest has no publish time, but its upload record does:
/// `_npmOperationalInternal.tmp` is `tmp/<name>_<version>_<epoch-ms>_<rand>`,
/// stamped at publish (the packument `time` field agrees to the second).
fn published_at(row: &serde_json::Map<String, Value>) -> Option<String> {
    let tmp = row.get("_npmOperationalInternal")?.get("tmp")?.as_str()?;
    tmp.rsplit('_')
        .find(|part| part.len() == 13 && part.bytes().all(|b| b.is_ascii_digit()))
        .and_then(|millis| millis.parse::<i64>().ok())
        .map(date_from_millis)
}

/// The source commit of an npm provenance attestation, accepted only when the
/// attestation binds this exact tarball (subject digest = `dist.integrity`)
/// and its source repository is the manifest's repository. The registry
/// verifies the Sigstore bundle at publish; this does not re-verify
/// signatures. Any failure leaves the unverified `gitHead` lead.
async fn attested_commit(
    artifact: &ArtifactItem,
    version: &str,
    row: &serde_json::Map<String, Value>,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    dns_pin: Option<DnsPin>,
) -> Option<String> {
    let dist = row.get("dist")?;
    let url = Url::parse(dist.pointer("/attestations/url")?.as_str()?).ok()?;
    // Attestations must stay on the registry origin; credential path scope is checked below.
    if url.origin() != registry.base.origin()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    let integrity = dist.get("integrity")?.as_str()?;
    let authorization = registry.authorization_for(&url);
    let bundle = client
        .json(ArtifactType::Npm, url, true, authorization, dns_pin, JSON)
        .await
        .ok()??;
    provenance_commit(
        &bundle,
        &artifact.name,
        version,
        integrity,
        artifact.repository.as_deref()?,
    )
}

pub(crate) fn provenance_commit(
    bundle: &Value,
    name: &str,
    version: &str,
    integrity: &str,
    repository: &str,
) -> Option<String> {
    use base64::Engine as _;
    let engine = base64::engine::general_purpose::STANDARD;
    let tarball_sha512 = hex::encode(engine.decode(integrity.strip_prefix("sha512-")?).ok()?);
    let purl = format!("pkg:npm/{}@{version}", name.replacen('@', "%40", 1));
    let same_repo = |uri: &str| {
        let uri = uri.strip_prefix("git+").unwrap_or(uri);
        let uri = uri.split_once('@').map_or(uri, |(repo, _)| repo);
        canonical_repository(uri).is_some_and(|uri| {
            uri.trim_end_matches('/')
                .eq_ignore_ascii_case(repository.trim_end_matches('/'))
        })
    };
    bundle
        .get("attestations")?
        .as_array()?
        .iter()
        .filter(|attestation| {
            attestation.get("predicateType").and_then(Value::as_str)
                == Some("https://slsa.dev/provenance/v1")
        })
        .find_map(|attestation| {
            let payload = attestation
                .pointer("/bundle/dsseEnvelope/payload")?
                .as_str()?;
            let statement: Value = serde_json::from_slice(&engine.decode(payload).ok()?).ok()?;
            let bound = statement.get("subject")?.as_array()?.iter().any(|subject| {
                subject.get("name").and_then(Value::as_str) == Some(purl.as_str())
                    && subject
                        .pointer("/digest/sha512")
                        .and_then(Value::as_str)
                        .is_some_and(|digest| digest.eq_ignore_ascii_case(&tarball_sha512))
            });
            if !bound {
                return None;
            }
            let source = statement
                .pointer("/predicate/buildDefinition/resolvedDependencies")?
                .as_array()?
                .first()?;
            if !same_repo(source.get("uri")?.as_str()?) {
                return None;
            }
            commit_sha(source.pointer("/digest/gitCommit")).filter(|sha| sha.len() == 40)
        })
}

async fn search(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    dns_pin: Option<DnsPin>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let offset = state.offset.unwrap_or(0);
    let size = query.page_size();
    let window = |from: u64, size: usize| {
        search_window(query, registry, client, dns_pin.clone(), from, size)
    };
    let (total_found, objects) = window(offset, size).await?;
    // npm serves a deep window from an undocumented reach on and answers a
    // `from` past it with earlier rows instead of an error. The page is its
    // own rows only when the two rows ending just before it are the row
    // before its first and its first: a restarted or clamped window fails
    // that either way.
    if offset > 0
        && let Some(first) = objects.first()
    {
        let (_, probe) = window(offset - 1, 2).await?;
        let name = |entry: Option<&Value>| {
            entry
                .and_then(|entry| entry.pointer("/package/name"))
                .cloned()
        };
        let first = name(Some(first));
        if name(probe.first()) == first || name(probe.get(1)) != first {
            return Ok(ArtifactProviderPage {
                artifacts: Vec::new(),
                next_state: None,
                total: Some(total_found),
                terminal_limit: Some(unreachable_rows(offset, total_found)),
                registry: Some(trim_registry(&registry.base)),
            });
        }
    }
    let mut artifacts = Vec::with_capacity(objects.len().min(size));
    for entry in objects.iter().take(size) {
        let package = object_for(
            object_for(entry, ArtifactType::Npm)?
                .get("package")
                .ok_or_else(|| super::util::invalid(ArtifactType::Npm))?,
            ArtifactType::Npm,
        )?;
        let name = required(package.get("name"), ArtifactType::Npm).map_err(|_| {
            ArtifactError::new(
                "providerError",
                "npm registry search returned an unnamed package; refusing to skip a result.",
            )
        })?;
        let mut artifact = ArtifactItem::new(
            ArtifactType::Npm,
            name.clone(),
            format!(
                "{}/{}",
                trim_registry(&registry.base),
                encode_component(&name)
            ),
        );
        artifact.version = string(package.get("version")).filter(|value| value != "unknown");
        artifact.downloads_monthly = entry.pointer("/downloads/monthly").and_then(Value::as_u64);
        artifact.description = string(package.get("description"));
        artifact.license = string(package.get("license"));
        if let Some(Value::Object(links)) = package.get("links") {
            artifact.homepage = safe_url(links.get("homepage"));
            artifact.repository = links
                .get("repository")
                .and_then(Value::as_str)
                .and_then(canonical_repository);
        }
        artifacts.push(artifact);
    }
    let has_more = offset.saturating_add(artifacts.len() as u64) < total_found;
    let terminal_limit =
        (has_more && artifacts.is_empty()).then(|| unreachable_rows(offset, total_found));
    Ok(ArtifactProviderPage {
        next_state: (has_more && !artifacts.is_empty()).then(|| ArtifactProviderState {
            offset: Some(offset + artifacts.len() as u64),
            ..Default::default()
        }),
        artifacts,
        total: Some(total_found),
        terminal_limit,
        registry: Some(trim_registry(&registry.base)),
    })
}

/// One npm search window: the registry's total and its result objects.
async fn search_window(
    query: &ArtifactSearchQuery,
    registry: &ResolvedNpmRegistry,
    client: &RegistryClient<'_>,
    dns_pin: Option<DnsPin>,
    from: u64,
    size: usize,
) -> Result<(u64, Vec<Value>), ArtifactError> {
    let url = endpoint(
        &format!("{}/-/v1/search", trim_registry(&registry.base)),
        &[
            ("text", Some(query.terms())),
            ("size", Some(size.to_string())),
            ("from", (from > 0).then(|| from.to_string())),
        ],
    )?;
    let authorization = registry.authorization_for(&url);
    let mut response = client
        .json(ArtifactType::Npm, url, false, authorization, dns_pin, JSON)
        .await?
        .ok_or_else(|| ArtifactError::new("providerError", "npm registry search failed."))?;
    let data = object_for(&response, ArtifactType::Npm)?;
    let total_found = total(data.get("total")).ok_or_else(|| {
        ArtifactError::new(
            "providerError",
            "npm registry search omitted a valid total; pagination cannot be determined.",
        )
    })?;
    match response.get_mut("objects").map(Value::take) {
        Some(Value::Array(objects)) => Ok((total_found, objects)),
        _ => Err(ArtifactError::new(
            "providerError",
            "Invalid npm registry search response; expected an object with results and a total.",
        )),
    }
}

/// The terminal limit of a page npm does not serve: the rows before it are
/// the most this search reaches.
fn unreachable_rows(offset: u64, total: u64) -> String {
    format!(
        "npm serves no rows past the first {offset} for this search: at most {offset} of {total} are reachable; narrow the keywords."
    )
}

fn registry_url(base: &Url, path: &str) -> Result<Url, ArtifactError> {
    Url::parse(&format!("{}/{}", trim_registry(base), path))
        .map_err(|_| ArtifactError::new("invalidInput", "Invalid npm registry URL."))
}

#[cfg(test)]
mod tests {
    use super::super::types::artifact_query;
    use super::{
        ArtifactSearchQuery, ArtifactType, ResolvedNpmRegistry, is_blocked_v4, is_blocked_v6,
        validate_registry, validate_resolved_addresses,
    };
    use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
    use url::Url;

    fn npm_registry(url: &str) -> ResolvedNpmRegistry {
        ResolvedNpmRegistry {
            base: Url::parse(url).expect("valid url"),
            authorization: None,
            cache_identity: "test".into(),
        }
    }

    fn npm_query(registry: Option<&str>) -> ArtifactSearchQuery {
        artifact_query(
            serde_json::json!({"ecosystem": ArtifactType::Npm, "packageName": "left-pad".to_string(), "registryUrl": registry.map(str::to_owned)}),
            None,
        )
    }

    #[test]
    fn rejects_link_local_metadata_registry() {
        let registry = npm_registry("http://169.254.169.254");
        let query = npm_query(Some("http://169.254.169.254"));
        let err =
            validate_registry(&query, &registry, false).expect_err("must reject link-local host");
        // The opt-in escape hatch permits the same host.
        assert!(validate_registry(&query, &registry, true).is_ok());
        assert_eq!(err.code, "invalidInput");
    }

    #[test]
    fn blocks_private_and_loopback_addresses() {
        assert!(is_blocked_v4(&Ipv4Addr::new(127, 0, 0, 1)));
        assert!(is_blocked_v4(&Ipv4Addr::new(10, 0, 0, 5)));
        assert!(is_blocked_v4(&Ipv4Addr::new(192, 168, 1, 1)));
        assert!(is_blocked_v4(&Ipv4Addr::new(169, 254, 169, 254)));
        assert!(is_blocked_v4(&Ipv4Addr::new(100, 64, 0, 1)));
        assert!(!is_blocked_v4(&Ipv4Addr::new(104, 16, 0, 1)));
        assert!(is_blocked_v6(&Ipv6Addr::LOCALHOST));
        assert!(is_blocked_v6(&Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1)));
        assert!(is_blocked_v6(&Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 1)));
    }

    #[test]
    fn rejects_mixed_public_private_dns_answers() {
        let addresses = [
            SocketAddr::from(([104, 16, 0, 1], 443)),
            SocketAddr::from(([127, 0, 0, 1], 443)),
        ];
        let error = validate_resolved_addresses(&addresses)
            .expect_err("one blocked answer must reject the complete DNS result");
        assert_eq!(error.code, "invalidInput");
        assert!(validate_resolved_addresses(&[addresses[0]]).is_ok());
    }

    use super::super::http::{
        ArtifactHttp, ArtifactHttpFuture, ArtifactHttpRequest, ArtifactHttpResponse, RegistryClient,
    };
    use base64::Engine as _;
    use octocode_github::RequestBudget;
    use serde_json::{Value, json};

    /// Answers by URL path and Accept type; anything else is a 404.
    struct RouteHttp {
        routes: Vec<(&'static str, &'static str, Value)>,
        seen: std::sync::Mutex<Vec<String>>,
        requests: std::sync::Mutex<Vec<(String, bool)>>,
    }

    impl ArtifactHttp for RouteHttp {
        fn get<'a>(
            &'a self,
            req: ArtifactHttpRequest,
            _budget: &'a RequestBudget,
        ) -> ArtifactHttpFuture<'a> {
            self.requests
                .lock()
                .expect("requests")
                .push((req.url.to_string(), req.authorization.is_some()));
            let path = req.url.path().to_owned();
            self.seen
                .lock()
                .expect("seen")
                .push(format!("{} {path}", req.accept));
            let found = self
                .routes
                .iter()
                .find(|(route, accept, _)| *route == path && *accept == req.accept)
                .map(|(_, _, body)| serde_json::to_vec(body).expect("body"));
            Box::pin(async move {
                Ok(match found {
                    Some(body) => ArtifactHttpResponse { status: 200, body },
                    None => ArtifactHttpResponse {
                        status: 404,
                        body: b"{}".to_vec(),
                    },
                })
            })
        }
    }

    const JSON: &str = "application/json";
    const INSTALL: &str = super::NPM_INSTALL_JSON;
    const COMMIT: &str = "59bbc03e10c636b9eb3c393dfeb552819774ec21";
    const TARBALL: &[u8] = b"zod tarball bytes";

    /// A registry at `url` whose authorization comes from `npmrc` text.
    fn npmrc_registry(url: &str, npmrc: &str) -> ResolvedNpmRegistry {
        let mut registry = npm_registry(url);
        registry.authorization =
            super::super::npmrc::authorization_for(&registry.base, npmrc, |_| None);
        registry
    }

    fn sha512(bytes: &[u8]) -> Vec<u8> {
        use sha2::Digest as _;
        sha2::Sha512::digest(bytes).to_vec()
    }

    fn manifest(version: &str, attested: bool) -> Value {
        let integrity = format!(
            "sha512-{}",
            base64::engine::general_purpose::STANDARD.encode(sha512(TARBALL))
        );
        let mut dist = json!({"integrity": integrity});
        if attested {
            dist["attestations"] = json!({
                "url": format!("https://registry.npmjs.org/-/npm/v1/attestations/zod@{version}"),
                "provenance": {"predicateType": "https://slsa.dev/provenance/v1"}
            });
        }
        json!({
            "name": "zod", "version": version, "license": "MIT",
            "description": "schemas", "homepage": "https://github.com/colinhacks/zod#readme",
            "repository": {"type": "git", "url": "git+https://github.com/colinhacks/zod.git"},
            "gitHead": "aaaaaaa1",
            "dependencies": {}, "peerDependencies": {"typescript": "*"},
            "engines": {"node": ">=18", "npm": ">=9", "pnpm": ">=8"},
            "deprecated": (version == "3.22.0").then_some("Use 3.22.4"),
            "_npmOperationalInternal": {"tmp": format!("tmp/zod_{version}_1789341914484_0.59")},
            "dist": dist
        })
    }

    fn bundle(version: &str, repo: &str, digest: &[u8]) -> Value {
        let statement = json!({
            "subject": [{"name": format!("pkg:npm/zod@{version}"), "digest": {"sha512": hex::encode(digest)}}],
            "predicateType": "https://slsa.dev/provenance/v1",
            "predicate": {"buildDefinition": {"resolvedDependencies": [
                {"uri": format!("git+{repo}@refs/heads/main"), "digest": {"gitCommit": COMMIT}}
            ]}}
        });
        let payload = base64::engine::general_purpose::STANDARD
            .encode(serde_json::to_vec(&statement).expect("statement"));
        json!({"attestations": [
            {"predicateType": "https://github.com/npm/attestation/tree/main/specs/publish/v0.1", "bundle": {}},
            {"predicateType": "https://slsa.dev/provenance/v1", "bundle": {"dsseEnvelope": {"payload": payload}}}
        ]})
    }

    async fn lookup(
        http: &RouteHttp,
        fields: Value,
    ) -> Result<super::ArtifactProviderPage, super::ArtifactError> {
        let budget = super::super::types::test_budget();
        let client = RegistryClient::uncached(http, &budget);
        let mut query = json!({"ecosystem": "npm"});
        for (key, value) in fields.as_object().expect("fields") {
            query[key] = value.clone();
        }
        let query = artifact_query(query, None);
        super::npm(
            &query,
            &Default::default(),
            &npm_registry("https://registry.npmjs.org/"),
            &client,
            false,
        )
        .await
    }

    fn routes(extra: Vec<(&'static str, &'static str, Value)>) -> RouteHttp {
        let mut routes = vec![
            (
                "/zod",
                INSTALL,
                json!({"name":"zod","dist-tags":{"latest":"4.6.5"},
                "versions":{"3.22.0":{},"3.25.76":{},"4.6.5":{}}}),
            ),
            ("/zod/3.25.76", JSON, manifest("3.25.76", false)),
            ("/zod/3.22.0", JSON, manifest("3.22.0", false)),
        ];
        routes.extend(extra);
        RouteHttp {
            routes,
            seen: std::sync::Mutex::new(vec![]),
            requests: std::sync::Mutex::new(vec![]),
        }
    }

    #[tokio::test]
    async fn npm_versions_resolve_exact_range_tag_and_coordinate() {
        let http = routes(vec![("/zod/latest", JSON, manifest("4.6.5", false))]);
        let range = lookup(&http, json!({"packageName": "zod", "version": "^3"}))
            .await
            .expect("range");
        let item = &range.artifacts[0];
        assert_eq!(item.version.as_deref(), Some("3.25.76"));
        assert_eq!(item.published_at.as_deref(), Some("2026-09-13"));
        assert_eq!(item.dependencies, Some(Vec::new()));
        assert_eq!(
            item.peer_dependencies.as_ref().map(Vec::len),
            Some(1),
            "{:?}",
            item.peer_dependencies
        );
        // Every declared engine stays: not only `node`.
        assert_eq!(
            item.engines,
            Some(std::collections::BTreeMap::from([
                ("node".to_owned(), ">=18".to_owned()),
                ("npm".to_owned(), ">=9".to_owned()),
                ("pnpm".to_owned(), ">=8".to_owned()),
            ]))
        );
        let coordinate = lookup(&http, json!({"packageName": "zod@3.22.0"}))
            .await
            .expect("coordinate");
        assert_eq!(coordinate.artifacts[0].version.as_deref(), Some("3.22.0"));
        assert_eq!(
            coordinate.artifacts[0].deprecated.as_deref(),
            Some("Use 3.22.4")
        );
        let tag = lookup(&http, json!({"packageName": "zod", "version": "latest"}))
            .await
            .expect("tag");
        assert_eq!(tag.artifacts[0].version.as_deref(), Some("4.6.5"));
        let missing = lookup(&http, json!({"packageName": "zod", "version": "3.22.9"}))
            .await
            .expect_err("missing version");
        assert_eq!(missing.code, "versionNotFound");
        assert_eq!(missing.status, Some(404));
        assert!(
            missing.nearest.iter().any(|version| version == "3.22.0"),
            "{missing:?}"
        );
        let unmatched = lookup(&http, json!({"packageName": "zod", "version": "^9"}))
            .await
            .expect_err("no match");
        assert_eq!(unmatched.code, "versionNotFound");
        let beyond = lookup(&http, json!({"packageName": "zod", "version": "99.0.0"}))
            .await
            .expect_err("beyond every release");
        assert_eq!(beyond.code, "versionNotFound");
        assert_eq!(beyond.nearest, ["4.6.5", "3.25.76", "3.22.0"], "{beyond:?}");
        let seen = http.seen.lock().expect("seen").clone();
        assert_eq!(
            seen[..2],
            [format!("{INSTALL} /zod"), format!("{JSON} /zod/3.25.76")],
            "a range reads the abbreviated packument, then one manifest"
        );
    }

    #[tokio::test]
    async fn npm_provenance_pins_the_attested_commit_only_when_bound() {
        let good = routes(vec![
            ("/zod/4.6.5", JSON, manifest("4.6.5", true)),
            (
                "/-/npm/v1/attestations/zod@4.6.5",
                JSON,
                bundle(
                    "4.6.5",
                    "https://github.com/colinhacks/zod",
                    &sha512(TARBALL),
                ),
            ),
        ]);
        let page = lookup(&good, json!({"packageName": "zod", "version": "4.6.5"}))
            .await
            .expect("attested");
        let item = &page.artifacts[0];
        assert_eq!(item.source_ref.as_deref(), Some(COMMIT));
        assert!(item.source_attested);

        for (repo, digest) in [
            ("https://github.com/evil/zod", sha512(TARBALL)),
            (
                "https://github.com/colinhacks/zod",
                sha512(b"other tarball"),
            ),
        ] {
            let spoofed = routes(vec![
                ("/zod/4.6.5", JSON, manifest("4.6.5", true)),
                (
                    "/-/npm/v1/attestations/zod@4.6.5",
                    JSON,
                    bundle("4.6.5", repo, &digest),
                ),
            ]);
            let page = lookup(&spoofed, json!({"packageName": "zod", "version": "4.6.5"}))
                .await
                .expect("unbound attestation");
            let item = &page.artifacts[0];
            assert!(!item.source_attested, "{repo}");
            assert_eq!(
                item.source_ref.as_deref(),
                Some("aaaaaaa1"),
                "gitHead lead stays"
            );
        }
    }

    #[tokio::test]
    async fn attestation_requests_keep_fake_credentials_on_the_registry_origin() {
        for (url, allowed) in [
            ("https://registry.npmjs.org:444/attestation", false),
            ("https://fake:secret@registry.npmjs.org/attestation", false),
            ("https://registry.npmjs.org:443/attestation", true),
        ] {
            let http = routes(vec![(
                "/attestation",
                JSON,
                bundle(
                    "4.6.5",
                    "https://github.com/colinhacks/zod",
                    &sha512(TARBALL),
                ),
            )]);
            let budget = super::super::types::test_budget();
            let client = RegistryClient::uncached(&http, &budget);
            let registry = npmrc_registry(
                "https://registry.npmjs.org/",
                "//registry.npmjs.org/:_authToken=fake-test-token",
            );
            let mut item = super::ArtifactItem::new(
                ArtifactType::Npm,
                "zod".into(),
                registry.base.to_string(),
            );
            item.repository = Some("https://github.com/colinhacks/zod".into());
            let mut row = manifest("4.6.5", true);
            row["dist"]["attestations"]["url"] = json!(url);
            let commit = super::attested_commit(
                &item,
                "4.6.5",
                row.as_object().expect("manifest"),
                &registry,
                &client,
                None,
            )
            .await;
            let requests = http.requests.lock().expect("requests");
            if allowed {
                assert_eq!(commit.as_deref(), Some(COMMIT));
                assert_eq!(requests.len(), 1);
                assert_eq!(
                    requests[0],
                    ("https://registry.npmjs.org/attestation".into(), true)
                );
            } else {
                assert!(
                    requests.is_empty(),
                    "off-origin or userinfo URL reached authenticated transport: {url}"
                );
                assert!(commit.is_none());
            }
        }
    }

    #[tokio::test]
    async fn npm_path_scoped_credentials_do_not_reach_sibling_attestations() {
        for (scope, target, authenticated) in [
            ("/api/npm/", "/api/npm/attestation", true),
            ("/api/npm/", "/other-service/attestation", false),
            ("/api/npm/", "/api/npm-extra/attestation", false),
            ("/", "/other-service/attestation", true),
        ] {
            let http = routes(vec![(
                target,
                JSON,
                bundle(
                    "4.6.5",
                    "https://github.com/colinhacks/zod",
                    &sha512(TARBALL),
                ),
            )]);
            let budget = super::super::types::test_budget();
            let client = RegistryClient::uncached(&http, &budget);
            let registry = npmrc_registry(
                "https://registry.npmjs.org/api/npm/",
                &format!("//registry.npmjs.org{scope}:_authToken=fake-path-test-token"),
            );
            assert!(registry.authorization.is_some());
            let mut item = super::ArtifactItem::new(
                ArtifactType::Npm,
                "zod".into(),
                registry.base.to_string(),
            );
            item.repository = Some("https://github.com/colinhacks/zod".into());
            let mut row = manifest("4.6.5", true);
            let url = format!("https://registry.npmjs.org{target}");
            row["dist"]["attestations"]["url"] = json!(url);
            let commit = super::attested_commit(
                &item,
                "4.6.5",
                row.as_object().expect("manifest"),
                &registry,
                &client,
                None,
            )
            .await;
            assert_eq!(
                commit.as_deref(),
                Some(COMMIT),
                "anonymous optional attestations remain usable"
            );
            assert_eq!(
                *http.requests.lock().expect("requests"),
                [(url, authenticated)],
                "credential scope {scope}, target {target}"
            );
        }
    }

    #[tokio::test]
    async fn npm_path_scoped_credentials_authorize_metadata_requests() {
        let http = routes(vec![
            (
                "/api/npm/zod",
                INSTALL,
                json!({"name":"zod","dist-tags":{"latest":"4.6.5"},"versions":{"4.6.5":{}}}),
            ),
            ("/api/npm/zod/4.6.5", JSON, manifest("4.6.5", false)),
            (
                "/api/npm/-/v1/search",
                JSON,
                json!({"objects":[],"total":0}),
            ),
        ]);
        let budget = super::super::types::test_budget();
        let client = RegistryClient::uncached(&http, &budget);
        let registry = npmrc_registry(
            "https://registry.npmjs.org/api/npm/",
            "//registry.npmjs.org/api/npm/:_authToken=fake-metadata-token",
        );
        super::exact("zod", Some("^4"), &registry, &client, None)
            .await
            .expect("packument and manifest");
        let query = artifact_query(json!({"ecosystem":"npm","keywords":["schema"]}), None);
        super::search(&query, &Default::default(), &registry, &client, None)
            .await
            .expect("discovery");
        let requests = http.requests.lock().expect("requests");
        assert_eq!(requests.len(), 3);
        assert!(
            requests
                .iter()
                .all(|(url, auth)| url.starts_with("https://registry.npmjs.org/api/npm/") && *auth),
            "{requests:?}"
        );
    }

    #[test]
    fn splits_versioned_and_scoped_coordinates() {
        assert_eq!(
            super::split_npm_coordinate("leftpad@1.2.3"),
            ("leftpad", Some("1.2.3"))
        );
        assert_eq!(
            super::split_npm_coordinate("@scope/pkg@9.0.0"),
            ("@scope/pkg", Some("9.0.0"))
        );
        assert_eq!(
            super::split_npm_coordinate("@scope/pkg"),
            ("@scope/pkg", None)
        );
    }
}

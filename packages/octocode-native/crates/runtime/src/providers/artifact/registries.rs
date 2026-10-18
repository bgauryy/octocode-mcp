use super::http::{JSON, RegistryClient};
use super::util::{
    commit_sha, coordinate_path, date_prefix, endpoint, github_slug, license, object_for,
    parse_url, repository_url, required, rows, safe_url, string, total,
};
use super::versions::{VersionSpec, cargo_resolve, pypi_resolve};
use super::{
    ArtifactError, ArtifactItem, ArtifactProviderPage, ArtifactProviderState, ArtifactSearchQuery,
    ArtifactType, TerminalLimit,
};
use serde_json::Value;

pub(crate) async fn pypi(
    query: &ArtifactSearchQuery,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let Some(package_name) = query.bare_package_name() else {
        return Err(ArtifactError::new(
            "capabilityUnavailable",
            "PyPI has no keyword search; look up an exact packageName.",
        ));
    };
    let Some(response) = pypi_release_json(package_name, query.version(), client).await? else {
        return Ok(ArtifactProviderPage::empty(Some(0)));
    };
    let body = object_for(&response, ArtifactType::Pypi)?;
    let info = object_for(
        body.get("info")
            .ok_or_else(|| super::util::invalid(ArtifactType::Pypi))?,
        ArtifactType::Pypi,
    )?;
    let name = required(info.get("name"), ArtifactType::Pypi)?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Pypi,
        name.clone(),
        format!(
            "https://pypi.org/project/{}/",
            super::util::encode_component(&name)
        ),
    );
    artifact.version = string(info.get("version"));
    artifact.description = string(info.get("summary"));
    artifact.license = pypi_license(info);
    let links = info.get("project_urls").and_then(Value::as_object);
    artifact.homepage = safe_url(info.get("home_page"))
        .or_else(|| links.and_then(|value| safe_url(value.get("Homepage"))));
    // A labeled source link first; else the first project link or the
    // homepage that names a GitHub repository (attrs labels it "GitHub",
    // rich and six give only a GitHub homepage).
    artifact.repository = links
        .and_then(|links| {
            links.iter().find_map(|(label, value)| {
                matches!(
                    label.to_ascii_lowercase().as_str(),
                    "source"
                        | "source code"
                        | "sourcecode"
                        | "repository"
                        | "repo"
                        | "code"
                        | "github"
                        | "gitlab"
                )
                .then(|| repository_url(Some(value)))
                .flatten()
            })
        })
        .or_else(|| {
            links
                .into_iter()
                .flat_map(|links| links.values())
                .chain(info.get("home_page"))
                .find_map(|value| github_slug(value.as_str()?))
                .map(|(owner, repo)| format!("https://github.com/{owner}/{repo}"))
        });
    artifact.published_at = body
        .get("urls")
        .and_then(Value::as_array)
        .and_then(|files| files.first())
        .and_then(|file| date_prefix(file.get("upload_time_iso_8601")));
    artifact.yanked = (info.get("yanked") == Some(&Value::Bool(true))).then_some(true);
    artifact.requires_python = string(info.get("requires_python"));
    // A requirement gated by an extra is optional, not required.
    let (optional, required): (Vec<String>, Vec<String>) = info
        .get("requires_dist")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .partition(|requirement| names_an_extra(requirement));
    artifact.dependencies = Some(required);
    artifact.optional_dependencies = (!optional.is_empty()).then_some(optional);
    // PyPI names no commit; an upstream tag for this release pins the lead.
    if let Some(version) = artifact.version.clone() {
        let name = artifact.name.clone();
        super::release_ref::pin_release_tag(&mut artifact, &name, &version, client).await;
    }
    Ok(ArtifactProviderPage::single(artifact))
}

/// Whether a PEP 508 requirement applies only with an extra
/// (`PySocks; extra == "socks"`, `x ; python_version<"4" and extra=='y'`):
/// an optional dependency, not a required one.
fn names_an_extra(requirement: &str) -> bool {
    let Some((_, marker)) = requirement.split_once(';') else {
        return false;
    };
    marker.match_indices("extra").any(|(at, word)| {
        let standalone = marker[..at]
            .chars()
            .next_back()
            .is_none_or(|before| !(before.is_ascii_alphanumeric() || before == '_'));
        standalone && marker[at + word.len()..].trim_start().starts_with("==")
    })
}

/// A PyPI release's license as a short name: the SPDX `license_expression`,
/// else a one-line `license` field, else the last `License :: …`
/// classifier's name. Many projects put the full license text in `license`
/// (numpy: 46 KB); that is no license name and is never the row's license.
fn pypi_license(info: &serde_json::Map<String, Value>) -> Option<String> {
    const SHORT: usize = 100;
    string(info.get("license_expression"))
        .or_else(|| {
            string(info.get("license"))
                .map(|license| license.trim().to_owned())
                .filter(|license| {
                    !license.is_empty() && license.len() < SHORT && !license.contains('\n')
                })
        })
        .or_else(|| {
            info.get("classifiers")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .filter_map(|classifier| classifier.strip_prefix("License :: "))
                .filter_map(|path| path.rsplit(" :: ").next())
                .map(str::trim)
                .rfind(|name| !name.is_empty())
                .map(str::to_owned)
        })
}

/// The release a PEP 440 `==`/`===` pin names (no wildcard, one clause):
/// such a pin selects a yanked release too (PEP 592), so it is an exact
/// lookup, not a specifier pip resolves.
fn pypi_pin(specifier: &str) -> Option<&str> {
    let specifier = specifier.trim();
    let pinned = specifier
        .strip_prefix("===")
        .or_else(|| specifier.strip_prefix("=="))?
        .trim();
    (!pinned.is_empty() && !pinned.contains(['<', '>', '=', '!', '~', ',', '*', ' ']))
        .then_some(pinned)
}

/// The PyPI release document for `version` (none: the latest release; a
/// bare number is exact; operators make a PEP 440 specifier), or `None`
/// when the project or the resolved release is unknown.
async fn pypi_release_json(
    package_name: &str,
    version: Option<&str>,
    client: &RegistryClient<'_>,
) -> Result<Option<Value>, ArtifactError> {
    let project = |suffix: &str| {
        parse_url(&format!(
            "https://pypi.org/pypi/{}/{suffix}json",
            super::util::encode_component(package_name)
        ))
    };
    // A bare release number or an `==`/`===` pin is exact; other operators
    // make a PEP 440 specifier.
    let requested = version.filter(|value| *value != "latest");
    let exact = requested.and_then(|value| {
        pypi_pin(value).or_else(|| {
            (!value.contains(['<', '>', '=', '!', '~', ',', '*'])
                && !matches!(VersionSpec::parse(value), VersionSpec::Tag(_)))
            .then_some(value)
        })
    });
    let response = match (requested, exact) {
        (None, _) => {
            client
                .json(ArtifactType::Pypi, project("")?, true, None, None, JSON)
                .await?
        }
        (Some(_), Some(version)) => {
            let found = client
                .json(
                    ArtifactType::Pypi,
                    project(&format!("{}/", super::util::encode_component(version)))?,
                    true,
                    None,
                    None,
                    JSON,
                )
                .await?;
            if found.is_none()
                && let Some(project) = client
                    .json(ArtifactType::Pypi, project("")?, true, None, None, JSON)
                    .await?
            {
                return Err(super::npm::version_not_found(
                    package_name,
                    version,
                    &pypi_releases(&project, true),
                ));
            }
            found
        }
        (Some(specifier), None) => {
            let Some(project_json) = client
                .json(ArtifactType::Pypi, project("")?, true, None, None, JSON)
                .await?
            else {
                return Ok(None);
            };
            let releases = pypi_releases(&project_json, false);
            let Some(resolved) = pypi_resolve(specifier, releases.iter().map(String::as_str))
            else {
                let all = pypi_releases(&project_json, true);
                // Only yanked releases match: name the newest (a pin selects it).
                if let Some(yanked) = pypi_resolve(specifier, all.iter().map(String::as_str)) {
                    let mut error = ArtifactError::new(
                        "versionNotFound",
                        format!(
                            "{package_name} has no unyanked version matching \"{specifier}\"; yanked {yanked} matches"
                        ),
                    )
                    .with_status(404);
                    error.nearest = vec![yanked];
                    return Err(error);
                }
                return Err(super::npm::version_not_found(package_name, specifier, &all));
            };
            client
                .json(
                    ArtifactType::Pypi,
                    project(&format!("{}/", super::util::encode_component(&resolved)))?,
                    true,
                    None,
                    None,
                    JSON,
                )
                .await?
        }
    };
    Ok(response)
}

/// Release numbers of a PyPI project; `include_yanked` false drops releases
/// whose every file is yanked (pip skips them for specifiers).
fn pypi_releases(project: &Value, include_yanked: bool) -> Vec<String> {
    project
        .get("releases")
        .and_then(Value::as_object)
        .map(|releases| {
            releases
                .iter()
                .filter(|(_, files)| {
                    include_yanked
                        || files.as_array().is_some_and(|files| {
                            files.is_empty()
                                || files
                                    .iter()
                                    .any(|file| file.get("yanked") != Some(&Value::Bool(true)))
                        })
                })
                .map(|(version, _)| version.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn crate_item(row: &serde_json::Map<String, Value>) -> Result<ArtifactItem, ArtifactError> {
    let name = required(
        row.get("name").or_else(|| row.get("id")),
        ArtifactType::Crates,
    )?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Crates,
        name.clone(),
        format!(
            "https://crates.io/crates/{}",
            super::util::encode_component(&name)
        ),
    );
    artifact.version =
        string(row.get("max_stable_version")).or_else(|| string(row.get("max_version")));
    artifact.description = string(row.get("description"));
    artifact.license = license(row.get("license"));
    artifact.homepage = safe_url(row.get("homepage"));
    artifact.repository = repository_url(row.get("repository"));
    Ok(artifact)
}

/// One version's facts on its crate row.
fn apply_crate_version(artifact: &mut ArtifactItem, entry: &Value) {
    artifact.version = string(entry.get("num"));
    artifact.published_at = date_prefix(entry.get("created_at"));
    artifact.yanked = (entry.get("yanked") == Some(&Value::Bool(true))).then_some(true);
    artifact.rust_version = string(entry.get("rust_version"));
    artifact.license = license(entry.get("license")).or(artifact.license.take());
}

/// An exact crate version from its own record plus the crate's metadata
/// without its version list (`include=`): the same row the crate document
/// gives, without downloading every version. `None` when either is unknown,
/// so the crate-document read reports not-found or the nearest versions.
async fn crate_release(
    name: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Result<Option<ArtifactItem>, ArtifactError> {
    let encoded = super::util::encode_component(name);
    let metadata = parse_url(&format!(
        "https://crates.io/api/v1/crates/{encoded}?include="
    ))?;
    let record = parse_url(&format!(
        "https://crates.io/api/v1/crates/{encoded}/{}",
        super::util::encode_component(version)
    ))?;
    let (metadata, record) = tokio::join!(
        client.json(ArtifactType::Crates, metadata, true, None, None, JSON),
        client.json(ArtifactType::Crates, record, true, None, None, JSON)
    );
    let (Some(metadata), Some(record)) = (metadata?, record?) else {
        return Ok(None);
    };
    let row = object_for(
        object_for(&metadata, ArtifactType::Crates)?
            .get("crate")
            .ok_or_else(|| super::util::invalid(ArtifactType::Crates))?,
        ArtifactType::Crates,
    )?;
    let entry = record
        .get("version")
        .filter(|entry| entry.get("num").and_then(Value::as_str) == Some(version))
        .ok_or_else(|| super::util::invalid(ArtifactType::Crates))?;
    let mut artifact = crate_item(row)?;
    apply_crate_version(&mut artifact, entry);
    Ok(Some(artifact))
}

/// A crate's latest release from its metadata plus the one version record
/// crates.io names its default (`include=default_version`): the highest
/// stable version, else the highest prerelease, else the highest yanked
/// one, which the row then marks yanked. The same row the crate document
/// gives, without downloading every version. `None` when the crate is
/// unknown or names no default, so the crate-document read decides.
async fn crate_default_release(
    name: &str,
    client: &RegistryClient<'_>,
) -> Result<Option<ArtifactItem>, ArtifactError> {
    let url = parse_url(&format!(
        "https://crates.io/api/v1/crates/{}?include=default_version",
        super::util::encode_component(name)
    ))?;
    let Some(response) = client
        .json(ArtifactType::Crates, url, true, None, None, JSON)
        .await?
    else {
        return Ok(None);
    };
    let body = object_for(&response, ArtifactType::Crates)?;
    let row = object_for(
        body.get("crate")
            .ok_or_else(|| super::util::invalid(ArtifactType::Crates))?,
        ArtifactType::Crates,
    )?;
    let default = row.get("default_version").and_then(Value::as_str);
    let Some(entry) = body
        .get("versions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|entry| default.is_some() && entry.get("num").and_then(Value::as_str) == default)
    else {
        return Ok(None);
    };
    // This view counts no versions (`max_version` is "0.0.0"): the
    // version is the default entry's.
    let mut artifact = crate_item(row)?;
    apply_crate_version(&mut artifact, entry);
    Ok(Some(artifact))
}

/// The commit a GitHub-hosted crate version was packaged from (cargo's VCS
/// info, with the crate's directory in the repository), else its upstream
/// release tag.
async fn crate_source_ref(artifact: &mut ArtifactItem, client: &RegistryClient<'_>) {
    let (Some(repository), Some(version)) = (artifact.repository.clone(), artifact.version.clone())
    else {
        return;
    };
    if !repository.contains("github.com") {
        return;
    }
    if let Some((sha, directory)) =
        super::release_ref::crate_vcs(&artifact.name, &version, client).await
    {
        artifact.source_ref = Some(sha);
        artifact.repository_directory = directory.filter(|directory| !directory.is_empty());
        return;
    }
    let name = artifact.name.clone();
    super::release_ref::pin_release_tag(artifact, &name, &version, client).await;
}

/// A crate version's normal dependencies as `name req`: the required ones,
/// and the optional ones (features, like PyPI extras) apart. A failed read
/// leaves both unknown; it never fails the lookup.
async fn crate_dependencies(
    name: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Option<(Vec<String>, Vec<String>)> {
    let url = parse_url(&format!(
        "https://crates.io/api/v1/crates/{}/{}/dependencies",
        super::util::encode_component(name),
        super::util::encode_component(version)
    ))
    .ok()?;
    let listing = client
        .json(ArtifactType::Crates, url, true, None, None, JSON)
        .await
        .ok()??;
    let (optional, required): (Vec<_>, Vec<_>) = listing
        .get("dependencies")?
        .as_array()?
        .iter()
        .filter(|dependency| dependency.get("kind").and_then(Value::as_str) == Some("normal"))
        .filter_map(|dependency| {
            let name = dependency.get("crate_id").and_then(Value::as_str)?;
            let entry = match dependency.get("req").and_then(Value::as_str) {
                Some(req) => format!("{name} {req}"),
                None => name.to_owned(),
            };
            Some((
                dependency.get("optional") == Some(&Value::Bool(true)),
                entry,
            ))
        })
        .partition(|(optional, _)| *optional);
    let entries = |rows: Vec<(bool, String)>| rows.into_iter().map(|(_, entry)| entry).collect();
    Some((entries(required), entries(optional)))
}

/// Release facts of a resolved crate version that need their own reads:
/// the source ref and the dependency lists, read concurrently.
async fn crate_release_facts(artifact: &mut ArtifactItem, client: &RegistryClient<'_>) {
    let Some(version) = artifact.version.clone() else {
        return;
    };
    let name = artifact.name.clone();
    let (dependencies, ()) = tokio::join!(
        crate_dependencies(&name, &version, client),
        crate_source_ref(artifact, client)
    );
    if let Some((required, optional)) = dependencies {
        artifact.dependencies = Some(required);
        artifact.optional_dependencies = (!optional.is_empty()).then_some(optional);
    }
}

pub(crate) async fn crates(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    if let Some(name) = query.bare_package_name() {
        let release = match query.version().map(VersionSpec::parse) {
            Some(VersionSpec::Exact(version)) => crate_release(name, &version, client).await?,
            None => crate_default_release(name, client).await?,
            Some(VersionSpec::Tag(tag)) if tag == "latest" => {
                crate_default_release(name, client).await?
            }
            Some(_) => None,
        };
        if let Some(mut artifact) = release {
            crate_release_facts(&mut artifact, client).await;
            return Ok(ArtifactProviderPage::single(artifact));
        }
        let url = parse_url(&format!(
            "https://crates.io/api/v1/crates/{}",
            super::util::encode_component(name)
        ))?;
        let Some(response) = client
            .json(ArtifactType::Crates, url, true, None, None, JSON)
            .await?
        else {
            return Ok(ArtifactProviderPage::empty(Some(0)));
        };
        let body = object_for(&response, ArtifactType::Crates)?;
        let row = object_for(
            body.get("crate")
                .ok_or_else(|| super::util::invalid(ArtifactType::Crates))?,
            ArtifactType::Crates,
        )?;
        let mut artifact = crate_item(row)?;
        // The crate response lists every version: exact, tag, and range
        // lookups resolve here without another request.
        let versions = body
            .get("versions")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or_default();
        let num = |entry: &Value| entry.get("num").and_then(Value::as_str).map(str::to_owned);
        let all = versions.iter().filter_map(num).collect::<Vec<_>>();
        let wanted = match query.version().map(VersionSpec::parse) {
            None => artifact.version.clone(),
            Some(VersionSpec::Tag(tag)) if tag == "latest" => artifact.version.clone(),
            Some(VersionSpec::Exact(version)) => {
                if !all.contains(&version) {
                    return Err(super::npm::version_not_found(
                        &artifact.name,
                        &version,
                        &all,
                    ));
                }
                Some(version)
            }
            Some(VersionSpec::Tag(spec) | VersionSpec::Range(spec)) => {
                let releases = versions
                    .iter()
                    .filter(|entry| entry.get("yanked") != Some(&Value::Bool(true)))
                    .filter_map(num)
                    .collect::<Vec<_>>();
                Some(
                    cargo_resolve(&spec, releases.iter().map(String::as_str)).ok_or_else(|| {
                        super::npm::version_not_found(&artifact.name, &spec, &all)
                    })?,
                )
            }
        };
        if let Some(entry) = wanted.as_deref().and_then(|wanted| {
            versions
                .iter()
                .find(|entry| entry.get("num").and_then(Value::as_str) == Some(wanted))
        }) {
            apply_crate_version(&mut artifact, entry);
        }
        crate_release_facts(&mut artifact, client).await;
        return Ok(ArtifactProviderPage::single(artifact));
    }
    let page = state.page.unwrap_or(1);
    let size = query.page_size();
    let url = keyword_url("https://crates.io/api/v1/crates", query, page, size)?;
    let (data, artifacts) =
        keyword_rows(client, ArtifactType::Crates, url, "crates", crate_item).await?;
    let count = data
        .get("meta")
        .and_then(Value::as_object)
        .and_then(|meta| total(meta.get("total")));
    paged(artifacts, count, page, size, ArtifactType::Crates)
}

/// crates.io serves a relevance-sorted keyword search only below this many
/// results (`RELEVANCE_CANDIDATE_LIMIT`; a page starting at or past it is
/// HTTP 400): the shared page bounds end discovery there.
pub(super) const CRATES_RELEVANCE_LIMIT: u64 = 1000;

/// An exact Go module or package lookup on pkg.go.dev, pinned to
/// `query.version()` when one is given.
async fn go_exact(
    name: &str,
    query: &ArtifactSearchQuery,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let path = coordinate_path(name);
    let version = go_version(query.version())?;
    let lookup = |kind: &str| {
        endpoint(
            &format!("https://pkg.go.dev/v1/{kind}/{path}"),
            &[("version", version.clone())],
        )
    };
    // pkg.go.dev answers a package path on the module endpoint with HTTP 400
    // ("is a package, not a module") rather than 404; either sends the
    // lookup to the package endpoint.
    let (mut response, rejected) = match client
        .json(ArtifactType::Go, lookup("module")?, true, None, None, JSON)
        .await
    {
        Ok(response) => (response, None),
        Err(error) if error.status == Some(400) => (None, Some(error)),
        Err(error) => return Err(error),
    };
    let mut is_package = false;
    if response.is_none() {
        response = client
            .json(ArtifactType::Go, lookup("package")?, true, None, None, JSON)
            .await?;
        is_package = true;
        // Neither endpoint knows the path: the module rejection names why.
        if response.is_none()
            && let Some(rejected) = rejected
        {
            return Err(rejected);
        }
    }
    // A pinned lookup answers with that version or not at all.
    let response = response.filter(|row| {
        version
            .as_deref()
            .is_none_or(|version| row.get("version").and_then(Value::as_str) == Some(version))
    });
    let Some(response) = response else {
        // A pinned version the module does not publish is not an
        // unknown module: name the nearest published versions.
        if let Some(version) = version.as_deref() {
            let versions_url = parse_url(&format!("https://pkg.go.dev/v1/versions/{path}"))?;
            if let Some(listing) = client
                .json(ArtifactType::Go, versions_url, true, None, None, JSON)
                .await?
            {
                let published = listing
                    .get("items")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|item| string(item.get("version")))
                    .map(|published| published.trim_start_matches('v').to_owned())
                    .collect::<Vec<_>>();
                if !published.is_empty() {
                    return Err(super::npm::version_not_found(
                        name,
                        version.trim_start_matches('v'),
                        &published,
                    ));
                }
            }
        }
        return Ok(ArtifactProviderPage::empty(Some(0)));
    };
    let row = object_for(&response, ArtifactType::Go)?;
    let returned = required(row.get("path"), ArtifactType::Go)?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Go,
        returned.clone(),
        format!("https://pkg.go.dev/{}", coordinate_path(&returned)),
    );
    artifact.version = string(row.get("version"));
    artifact.description = string(row.get("synopsis"));
    // The version's commit time is its release date on pkg.go.dev.
    artifact.published_at = date_prefix(row.get("commitTime"));
    artifact.repository = repository_url(row.get("repoUrl"));
    artifact.module_path = if is_package {
        string(row.get("modulePath"))
    } else {
        Some(returned.clone())
    };
    artifact.package_path = is_package.then_some(returned);
    artifact.source_ref = go_source_ref(&artifact);
    if artifact.repository_directory.is_none() {
        artifact.repository_directory =
            go_module_directory(&artifact).filter(|directory| !directory.is_empty());
    }
    // A vanity module path (`go.opentelemetry.io/otel`) does not name its
    // repository directory or tag; the module proxy records the commit
    // the version was built from, and the directory inside the repo.
    if artifact.source_ref.is_none()
        && let (Some(module), Some(version)) =
            (artifact.module_path.clone(), artifact.version.clone())
    {
        let info = parse_url(&format!(
            "https://proxy.golang.org/{}/@v/{}.info",
            go_proxy_escape(&module),
            super::util::encode_component(&version)
        ))?;
        // The proxy is a lead source only: its failure leaves the lookup.
        if let Some(origin) = client
            .json(ArtifactType::Go, info, true, None, None, JSON)
            .await
            .ok()
            .flatten()
            .as_ref()
            .and_then(|info| info.get("Origin"))
        {
            artifact.source_ref = commit_sha(origin.get("Hash"));
            if artifact.repository_directory.is_none() {
                artifact.repository_directory =
                    string(origin.get("Subdir")).filter(|dir| !dir.is_empty());
            }
        }
    }
    artifact.dependencies = go_dependencies(&artifact, client).await;
    drop_restated_go_paths(&mut artifact);
    Ok(ArtifactProviderPage::single(artifact))
}

/// The module version's direct requirements from its `go.mod` on the
/// module proxy. Best-effort: `None` (unknown) when the proxy has none.
async fn go_dependencies(
    artifact: &ArtifactItem,
    client: &RegistryClient<'_>,
) -> Option<Vec<String>> {
    let (module, version) = (
        artifact.module_path.as_deref()?,
        artifact.version.as_deref()?,
    );
    let url = parse_url(&format!(
        "https://proxy.golang.org/{}/@v/{}.mod",
        go_proxy_escape(module),
        super::util::encode_component(version)
    ))
    .ok()?;
    let go_mod = client.text(ArtifactType::Go, url, true).await.ok()??;
    Some(go_requirements(&go_mod))
}

/// `require` directives of a `go.mod` as `module version`, in file order:
/// the module's own imports, so `// indirect` requirements are left out.
fn go_requirements(go_mod: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut in_block = false;
    for line in go_mod.lines() {
        let (code, comment) = line.split_once("//").unwrap_or((line, ""));
        let code = code.trim();
        let requirement = if in_block {
            if code == ")" {
                in_block = false;
                continue;
            }
            code
        } else {
            let Some(rest) = code
                .strip_prefix("require")
                .filter(|rest| rest.starts_with([' ', '\t', '(']))
            else {
                continue;
            };
            let rest = rest.trim();
            if rest == "(" {
                in_block = true;
                continue;
            }
            rest
        };
        let mut fields = requirement.split_whitespace();
        if let (Some(module), Some(version), None) = (fields.next(), fields.next(), fields.next())
            && !comment.trim_start().starts_with("indirect")
        {
            found.push(format!("{module} {version}"));
        }
    }
    found
}

/// A Go module or package path equal to the row's name restates it; a
/// package inside a module keeps its module path. Dropped once the row is
/// built (the source-ref lookups read the module path).
fn drop_restated_go_paths(artifact: &mut ArtifactItem) {
    if artifact.package_path.as_deref() == Some(artifact.name.as_str()) {
        artifact.package_path = None;
    }
    if artifact.module_path.as_deref() == Some(artifact.name.as_str()) {
        artifact.module_path = None;
    }
}

pub(crate) async fn go(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    if let Some(name) = query.package_name() {
        return go_exact(name, query, client).await;
    }
    // pkg.go.dev pages by opaque token only: page N follows the tokens of
    // the N-1 pages before it, each the same size, so pages tile the list.
    // Each next page's `cursor` carries the token that starts it, so
    // following `nextPage` reads one page with no server-side state. A page
    // without a usable cursor walks from the deepest page whose start the
    // registry cache remembers.
    let page = state.page.unwrap_or(1);
    let supplied = state
        .token
        .as_deref()
        .and_then(|cursor| go_token(&go_page_key(query, page), cursor))
        .filter(|_| page > 1);
    let served = match supplied {
        // A token the registry no longer honors (`invalidInput`, a 4xx)
        // falls back to the walk, which reaches the same rows.
        Some(token) => match go_search(query, Some(token.to_owned()), client).await {
            Err(error) if error.code == "invalidInput" => None,
            other => Some(other?),
        },
        None => None,
    };
    let data = match served {
        Some(data) => data,
        None => match go_walk(query, page, client).await? {
            (data, true) => data,
            (end, false) => return Ok(ArtifactProviderPage::empty(total(end.get("total")))),
        },
    };
    if let Some(next) = string(data.get("nextPageToken")) {
        client.remember_cursor(&go_page_key(query, page + 1), &next);
    }
    let data = &data;
    let artifacts = rows(
        data.get("items")
            .ok_or_else(|| super::util::invalid(ArtifactType::Go))?,
        ArtifactType::Go,
    )?
    .iter()
    .map(|value| {
        let row = object_for(value, ArtifactType::Go)?;
        let name = required(row.get("packagePath"), ArtifactType::Go)?;
        let mut artifact = ArtifactItem::new(
            ArtifactType::Go,
            name.clone(),
            format!("https://pkg.go.dev/{}", coordinate_path(&name)),
        );
        artifact.module_path = string(row.get("modulePath"));
        // Search names no repository; a module on GitHub is its own.
        artifact.repository = artifact
            .module_path
            .as_deref()
            .and_then(super::util::github_repository);
        artifact.package_path = Some(name);
        artifact.version = string(row.get("version"));
        artifact.description = string(row.get("synopsis"));
        drop_restated_go_paths(&mut artifact);
        Ok(artifact)
    })
    .collect::<Result<Vec<_>, ArtifactError>>()?;
    Ok(ArtifactProviderPage {
        artifacts,
        next_state: string(data.get("nextPageToken")).map(|token| ArtifactProviderState {
            page: Some(page + 1),
            token: Some(go_cursor(&go_page_key(query, page + 1), &token)),
            ..Default::default()
        }),
        total: total(data.get("total")),
        terminal_limit: None,
        registry: None,
    })
}

/// The identity of one Go discovery page's start: its terms, page size and
/// page. The cache remembers each start's token under it, and a cursor is
/// bound to it.
fn go_page_key(query: &ArtifactSearchQuery, page: u64) -> String {
    format!("go:search:{}:{}:{page}", query.page_size(), terms(query))
}

/// A pkg.go.dev token as the wire cursor of the page `key` names: the token
/// behind a digest of that page's identity, so a cursor copied onto another
/// query or page is ignored (that page walks) instead of serving rows that
/// are not its own.
fn go_cursor(key: &str, token: &str) -> String {
    format!("{}.{token}", go_cursor_binding(key))
}

/// The token of a cursor bound to the page `key` names; `None` for a cursor
/// bound to any other page.
fn go_token<'a>(key: &str, cursor: &'a str) -> Option<&'a str> {
    cursor
        .strip_prefix(go_cursor_binding(key).as_str())?
        .strip_prefix('.')
        .filter(|token| !token.is_empty())
}

fn go_cursor_binding(key: &str) -> String {
    // The first 8 bytes of the digest, as hex.
    crate::digest::sha256(key.as_bytes())[..16].to_owned()
}

/// One pkg.go.dev search page: the first, or the one `token` starts.
async fn go_search(
    query: &ArtifactSearchQuery,
    token: Option<String>,
    client: &RegistryClient<'_>,
) -> Result<serde_json::Map<String, Value>, ArtifactError> {
    let url = endpoint(
        "https://pkg.go.dev/v1/search",
        &[
            ("q", Some(terms(query))),
            ("limit", Some(query.page_size().to_string())),
            ("token", token),
        ],
    )?;
    let response = client
        .json(ArtifactType::Go, url, false, None, None, JSON)
        .await?
        .ok_or_else(|| super::util::invalid(ArtifactType::Go))?;
    Ok(object_for(&response, ArtifactType::Go)?.clone())
}

/// Search page `page` reached by following tokens from the deepest page
/// whose start the cache remembers (else page 1), remembering each start
/// on the way, and whether it was reached: the results can end before it
/// (then the last page read, for its total).
async fn go_walk(
    query: &ArtifactSearchQuery,
    page: u64,
    client: &RegistryClient<'_>,
) -> Result<(serde_json::Map<String, Value>, bool), ArtifactError> {
    let (mut hop, mut token) = (2..=page)
        .rev()
        .find_map(|hop| Some((hop, Some(client.cursor(&go_page_key(query, hop))?))))
        .unwrap_or((1, None));
    loop {
        let data = go_search(query, token, client).await?;
        if hop >= page {
            return Ok((data, true));
        }
        let Some(next) = string(data.get("nextPageToken")) else {
            return Ok((data, false));
        };
        client.remember_cursor(&go_page_key(query, hop + 1), &next);
        token = Some(next);
        hop += 1;
    }
}

/// A module path in the module proxy's case encoding: each upper-case letter
/// becomes `!` plus its lower-case form; segments are URL-encoded.
fn go_proxy_escape(module: &str) -> String {
    let folded = module
        .chars()
        .flat_map(|c| {
            if c.is_ascii_uppercase() {
                vec!['!', c.to_ascii_lowercase()]
            } else {
                vec![c]
            }
        })
        .collect::<String>();
    coordinate_path(&folded)
}

/// The pkg.go.dev `version` of a Go lookup: `None` for the latest release
/// (no version, or `latest`), the `v`-prefixed exact version otherwise.
/// Ranges and other tags need a module version list: not supported.
fn go_version(requested: Option<&str>) -> Result<Option<String>, ArtifactError> {
    match requested.map(VersionSpec::parse) {
        None => Ok(None),
        Some(VersionSpec::Tag(tag)) if tag == "latest" => Ok(None),
        Some(VersionSpec::Exact(version)) => Ok(Some(format!("v{version}"))),
        Some(VersionSpec::Tag(spec) | VersionSpec::Range(spec)) => Err(ArtifactError::new(
            "capabilityUnavailable",
            format!("Go lookups take an exact version or latest, not \"{spec}\"."),
        )),
    }
}

/// The VCS ref a Go module version names: a pseudo-version's commit, or the
/// release tag (prefixed by the module's directory inside its repository;
/// a major-version suffix is never part of that prefix).
fn go_source_ref(artifact: &ArtifactItem) -> Option<String> {
    let version = artifact.version.as_deref()?;
    let version = version.strip_suffix("+incompatible").unwrap_or(version);
    // vX.Y.Z-yyyymmddhhmmss-abcdefabcdef (also with a .0./-0. base).
    if let Some(commit) = version
        .rsplit_once('-')
        .map(|(_, tail)| tail)
        .filter(|tail| tail.len() == 12 && version.matches('-').count() >= 2)
        .and_then(|tail| commit_sha(Some(&Value::String(tail.to_owned()))))
    {
        return Some(commit);
    }
    let directory = go_module_directory(artifact)?;
    Some(if directory.is_empty() {
        version.to_owned()
    } else {
        format!("{directory}/{version}")
    })
}

/// The module's directory inside its repository, from its path under the
/// repository root: `service/s3` for `github.com/aws/aws-sdk-go-v2/service/s3`
/// (empty at the root; a major-version suffix is never part of it). `None`
/// for a vanity path that does not start with the repository.
fn go_module_directory(artifact: &ArtifactItem) -> Option<String> {
    let module = artifact.module_path.as_deref()?;
    let repository = artifact.repository.as_deref()?;
    let root = repository
        .split_once("://")
        .map_or(repository, |(_, rest)| rest)
        .trim_end_matches('/')
        .trim_end_matches(".git");
    let dir = module.strip_prefix(root)?;
    if !(dir.is_empty() || dir.starts_with('/')) {
        return None;
    }
    let mut segments: Vec<&str> = dir.split('/').filter(|part| !part.is_empty()).collect();
    if segments.last().is_some_and(|last| {
        last.strip_prefix('v')
            .is_some_and(|major| !major.is_empty() && major.bytes().all(|b| b.is_ascii_digit()))
    }) {
        segments.pop();
    }
    Some(segments.join("/"))
}

fn composer(row: &serde_json::Map<String, Value>) -> Result<ArtifactItem, ArtifactError> {
    let name = required(row.get("name"), ArtifactType::Packagist)?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Packagist,
        name.clone(),
        format!("https://packagist.org/packages/{}", coordinate_path(&name)),
    );
    artifact.version = string(row.get("version"));
    artifact.description = string(row.get("description"));
    artifact.license = license(row.get("license"));
    artifact.repository = row
        .get("source")
        .and_then(Value::as_object)
        .and_then(|value| repository_url(value.get("url")))
        .or_else(|| repository_url(row.get("repository")));
    artifact.source_ref = row
        .get("source")
        .and_then(Value::as_object)
        .and_then(|source| commit_sha(source.get("reference")));
    artifact.homepage = safe_url(row.get("homepage"));
    Ok(artifact)
}

/// An exact Packagist release: its row, the day it was tagged (`time`), and
/// its `require` entries as `name constraint` (platform ones such as `php`
/// included, as declared). The p2 document's first entry is complete, so a
/// missing `require` declares none.
fn composer_release(row: &serde_json::Map<String, Value>) -> Result<ArtifactItem, ArtifactError> {
    let mut artifact = composer(row)?;
    artifact.published_at = date_prefix(row.get("time"));
    artifact.dependencies = Some(
        row.get("require")
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
            .map(|(name, constraint)| match constraint.as_str() {
                Some(constraint) => format!("{name} {constraint}"),
                None => name.clone(),
            })
            .collect(),
    );
    Ok(artifact)
}

pub(crate) async fn packagist(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    if let Some(package_name) = query.package_name() {
        let name = package_name.to_ascii_lowercase();
        let tagged_url = parse_url(&format!(
            "https://repo.packagist.org/p2/{}.json",
            coordinate_path(&name)
        ))?;
        let mut response = client
            .json(ArtifactType::Packagist, tagged_url, true, None, None, JSON)
            .await?;
        let mut entries = packagist_entries(response.as_ref(), &name)?;
        if entries.is_empty() {
            let dev_url = parse_url(&format!(
                "https://repo.packagist.org/p2/{}~dev.json",
                coordinate_path(&name)
            ))?;
            response = client
                .json(ArtifactType::Packagist, dev_url, true, None, None, JSON)
                .await?;
            entries = packagist_entries(response.as_ref(), &name)?;
        }
        return if let Some(first) = entries.first() {
            Ok(ArtifactProviderPage::single(composer_release(object_for(
                first,
                ArtifactType::Packagist,
            )?)?))
        } else {
            Ok(ArtifactProviderPage::empty(Some(0)))
        };
    }
    let page = state.page.unwrap_or(1);
    let size = query.page_size();
    let url = keyword_url("https://packagist.org/search.json", query, page, size)?;
    let (data, artifacts) =
        keyword_rows(client, ArtifactType::Packagist, url, "results", composer).await?;
    Ok(ArtifactProviderPage {
        next_state: string(data.get("next")).map(|_| ArtifactProviderState {
            page: Some(page + 1),
            ..Default::default()
        }),
        artifacts,
        total: total(data.get("total")),
        terminal_limit: None,
        registry: None,
    })
}

fn packagist_entries<'a>(
    response: Option<&'a Value>,
    name: &str,
) -> Result<&'a [Value], ArtifactError> {
    let Some(response) = response else {
        return Ok(&[]);
    };
    let packages = object_for(response, ArtifactType::Packagist)?
        .get("packages")
        .ok_or_else(|| super::util::invalid(ArtifactType::Packagist))?;
    Ok(packages
        .as_object()
        .and_then(|value| value.get(name))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]))
}

/// A gem row. The exact (`gems/<name>.json`) document also states the
/// release day and the runtime dependencies (`name requirement`); a search
/// row names neither, so both stay unknown there. A source link into a
/// GitHub tree (`…/tree/v8.1.4`) is split into the repository, its
/// directory, and the release ref it names (the registry's claim).
fn gem(row: &serde_json::Map<String, Value>) -> Result<ArtifactItem, ArtifactError> {
    let name = required(row.get("name"), ArtifactType::Rubygems)?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Rubygems,
        name.clone(),
        format!(
            "https://rubygems.org/gems/{}",
            super::util::encode_component(&name)
        ),
    );
    artifact.version = string(row.get("version"));
    artifact.description = string(row.get("info"));
    artifact.license = license(row.get("licenses"));
    artifact.homepage = safe_url(row.get("homepage_uri"));
    let link = string(row.get("source_code_uri")).or_else(|| {
        row.get("metadata")
            .and_then(Value::as_object)
            .and_then(|value| string(value.get("source_code_uri")))
    });
    if let Some(link) = link {
        artifact.repository = super::util::github_repository(&link)
            .or_else(|| super::util::canonical_repository(&link));
        artifact.repository_directory = super::util::github_repo_dir(&link);
        artifact.source_ref = artifact
            .version
            .as_deref()
            .and_then(|version| super::util::release_ref_in(&link, version));
    }
    artifact.published_at = date_prefix(row.get("version_created_at"));
    artifact.dependencies = row
        .get("dependencies")
        .and_then(|dependencies| dependencies.get("runtime"))
        .and_then(Value::as_array)
        .map(|runtime| {
            runtime
                .iter()
                .filter_map(|dependency| {
                    let name = string(dependency.get("name"))?;
                    Some(match string(dependency.get("requirements")) {
                        Some(requirement) => format!("{name} {requirement}"),
                        None => name,
                    })
                })
                .collect()
        });
    Ok(artifact)
}

/// Rows rubygems.org serves per search page: fixed, whatever `per_page`
/// asks (its API docs; 30 measured 2026-10-16). A discovery page's offset
/// names its API page and the rows within it directly.
const RUBYGEMS_PAGE_ROWS: usize = 30;

pub(crate) async fn rubygems(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    if let Some(name) = query.package_name() {
        let url = parse_url(&format!(
            "https://rubygems.org/api/v1/gems/{}.json",
            super::util::encode_component(name)
        ))?;
        let Some(response) = client
            .json(ArtifactType::Rubygems, url, true, None, None, JSON)
            .await?
        else {
            return Ok(ArtifactProviderPage::empty(Some(0)));
        };
        return Ok(ArtifactProviderPage::single(gem(object_for(
            &response,
            ArtifactType::Rubygems,
        )?)?));
    }
    // A page that crosses an API page boundary reads the next one; a short
    // API page is the last.
    let size = query.page_size();
    let offset = state.offset.unwrap_or(0) as usize;
    let mut api_page = offset / RUBYGEMS_PAGE_ROWS + 1;
    let mut skip = offset % RUBYGEMS_PAGE_ROWS;
    let mut artifacts = Vec::new();
    let mut more = false;
    loop {
        let url = endpoint(
            "https://rubygems.org/api/v1/search.json",
            &[
                ("query", Some(terms(query))),
                ("page", Some(api_page.to_string())),
            ],
        )?;
        let response = client
            .json(ArtifactType::Rubygems, url, false, None, None, JSON)
            .await?
            .ok_or_else(|| super::util::invalid(ArtifactType::Rubygems))?;
        let fetched = rows(&response, ArtifactType::Rubygems)?;
        if fetched.len() > RUBYGEMS_PAGE_ROWS {
            // Offsets would name the wrong rows: fail loudly, never skip.
            return Err(ArtifactError::new(
                "providerError",
                format!(
                    "rubygems answered {} rows on one search page, more than the {RUBYGEMS_PAGE_ROWS} its paging is computed from.",
                    fetched.len()
                ),
            ));
        }
        let wanted = size - artifacts.len();
        for row in fetched.iter().skip(skip).take(wanted) {
            artifacts.push(gem(object_for(row, ArtifactType::Rubygems)?)?);
        }
        let last = fetched.len() < RUBYGEMS_PAGE_ROWS;
        if artifacts.len() == size {
            // Rows left on this API page, or a full one, may continue.
            more = fetched.len() > skip + wanted || !last;
            break;
        }
        if last {
            break;
        }
        skip = 0;
        api_page += 1;
    }
    let next_state = (more && !artifacts.is_empty()).then(|| ArtifactProviderState {
        offset: Some((offset + artifacts.len()) as u64),
        ..Default::default()
    });
    Ok(ArtifactProviderPage {
        next_state,
        artifacts,
        total: None,
        terminal_limit: None,
        registry: None,
    })
}

/// A `q`/`page`/`per_page` keyword search URL on `base`.
fn keyword_url(
    base: &str,
    query: &ArtifactSearchQuery,
    page: u64,
    size: usize,
) -> Result<url::Url, ArtifactError> {
    endpoint(
        base,
        &[
            ("q", Some(terms(query))),
            ("page", Some(page.to_string())),
            ("per_page", Some(size.to_string())),
        ],
    )
}

/// A keyword search response object and its rows under `key`, each mapped
/// by `item`.
async fn keyword_rows(
    client: &RegistryClient<'_>,
    artifact_type: ArtifactType,
    url: url::Url,
    key: &str,
    item: fn(&serde_json::Map<String, Value>) -> Result<ArtifactItem, ArtifactError>,
) -> Result<(serde_json::Map<String, Value>, Vec<ArtifactItem>), ArtifactError> {
    let invalid = || super::util::invalid(artifact_type);
    let Some(Value::Object(data)) = client
        .json(artifact_type, url, false, None, None, JSON)
        .await?
    else {
        return Err(invalid());
    };
    let artifacts = rows(data.get(key).ok_or_else(invalid)?, artifact_type)?
        .iter()
        .map(|row| item(object_for(row, artifact_type)?))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((data, artifacts))
}

fn terms(query: &ArtifactSearchQuery) -> String {
    query.terms()
}

fn paged(
    artifacts: Vec<ArtifactItem>,
    total: Option<u64>,
    page: u64,
    size: usize,
    artifact_type: ArtifactType,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let more = total
        .map(|count| page.saturating_mul(size as u64) < count)
        .unwrap_or(artifacts.len() == size);
    let terminal_limit = (more && artifacts.is_empty()).then(|| {
        TerminalLimit::short_page(if artifact_type == ArtifactType::Crates {
            "crates.io"
        } else {
            artifact_type.as_str()
        })
    });
    Ok(ArtifactProviderPage {
        next_state: (more && !artifacts.is_empty()).then(|| ArtifactProviderState {
            page: Some(page + 1),
            ..Default::default()
        }),
        artifacts,
        total,
        terminal_limit,
        registry: None,
    })
}

#[cfg(test)]
mod tests {
    use super::super::test_http::{KnownTags, RouteHttp};
    use super::super::types::{artifact_query, test_budget};
    use super::*;
    use octocode_github::RequestBudget;
    use serde_json::json;

    fn versioned(artifact_type: ArtifactType, name: &str, version: &str) -> ArtifactSearchQuery {
        artifact_query(
            json!({"ecosystem": artifact_type, "packageName": name, "version": version}),
            None,
        )
    }

    fn pypi_release(version: &str) -> serde_json::Value {
        json!({
            "info": {"name": "requests", "version": version, "summary": "HTTP",
                "requires_python": ">=3.7", "yanked": false,
                "requires_dist": ["idna<4,>=2.5", "urllib3<3", "PySocks!=1.5.7; extra == \"socks\""],
                "project_urls": {"Source": "https://github.com/psf/requests"}},
            "urls": [{"upload_time_iso_8601": "2023-05-22T15:12:42.313790Z"}]
        })
    }

    fn pypi_project() -> serde_json::Value {
        let mut project = pypi_release("2.32.3");
        project["releases"] = json!({
            "2.30.0": [{"yanked": false}], "2.31.0": [{"yanked": false}],
            "2.32.0": [{"yanked": true}], "2.32.3": [{"yanked": false}], "3.0.0rc1": [{"yanked": false}]
        });
        project
    }

    #[tokio::test]
    async fn pypi_version_lookups_pin_exact_specifier_and_coordinate_forms() {
        let http = RouteHttp::routes(vec![
            ("/pypi/requests/json", pypi_project()),
            ("/pypi/requests/2.31.0/json", pypi_release("2.31.0")),
            ("/pypi/requests/2.32.3/json", pypi_release("2.32.3")),
        ]);
        let tags = KnownTags::new(vec!["psf/requests@v2.31.0"]);
        let b = test_budget();
        let client = RegistryClient {
            http: &http,
            budget: &b,
            cache: None,
            tags: Some(&tags),
        };
        let exact = pypi(
            &versioned(ArtifactType::Pypi, "requests", "2.31.0"),
            &client,
        )
        .await
        .expect("exact");
        let item = &exact.artifacts[0];
        assert_eq!(item.version.as_deref(), Some("2.31.0"));
        assert_eq!(item.published_at.as_deref(), Some("2023-05-22"));
        assert_eq!(item.requires_python.as_deref(), Some(">=3.7"));
        assert_eq!(
            item.dependencies.as_ref().map(Vec::len),
            Some(2),
            "extras are not dependencies: {:?}",
            item.dependencies
        );
        assert_eq!(
            item.optional_dependencies,
            Some(vec!["PySocks!=1.5.7; extra == \"socks\"".to_owned()]),
            "extras are optional dependencies"
        );
        assert_eq!(item.yanked, None);
        // The upstream release tag pins the source lead.
        assert_eq!(item.source_ref.as_deref(), Some("v2.31.0"));
        let coordinate = pypi(
            &exact_query(ArtifactType::Pypi, "requests==2.31.0"),
            &client,
        )
        .await
        .expect("== coordinate");
        assert_eq!(coordinate.artifacts[0].version.as_deref(), Some("2.31.0"));
        let range = pypi(
            &versioned(ArtifactType::Pypi, "requests", ">=2.31,<3"),
            &client,
        )
        .await
        .expect("specifier");
        assert_eq!(range.artifacts[0].version.as_deref(), Some("2.32.3"));
        // Neither `v2.32.3` nor `2.32.3` exists upstream: no release ref.
        assert_eq!(range.artifacts[0].source_ref, None);
        let missing = pypi(
            &versioned(ArtifactType::Pypi, "requests", "2.31.9"),
            &client,
        )
        .await
        .expect_err("missing version");
        assert_eq!(missing.code, "versionNotFound");
        assert!(
            missing.nearest.iter().any(|version| version == "2.31.0"),
            "{missing:?}"
        );
        let registry: Vec<String> = http
            .targets()
            .into_iter()
            .filter(|path| path.starts_with("/pypi/"))
            .collect();
        assert_eq!(
            registry[..2],
            ["/pypi/requests/2.31.0/json", "/pypi/requests/2.31.0/json"],
            "exact versions are one registry request"
        );
        assert_eq!(
            tags.seen()[0],
            "psf/requests@v2.31.0",
            "the `v` tag is checked first and ends the check"
        );
        assert_eq!(tags.seen()[1], "psf/requests@v2.31.0");
    }

    /// PEP 592: an `==`/`===` pin selects a yanked release; a range that
    /// only yanked releases match says so and offers the newest one.
    #[tokio::test]
    async fn pypi_pins_select_yanked_releases_and_ranges_name_them() {
        let mut yanked = pypi_release("2.32.0");
        yanked["info"]["yanked"] = json!(true);
        let http = RouteHttp::routes(vec![
            ("/pypi/requests/json", pypi_project()),
            ("/pypi/requests/2.32.0/json", yanked),
        ]);
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        for pin in ["==2.32.0", "===2.32.0", "== 2.32.0"] {
            let page = pypi(&versioned(ArtifactType::Pypi, "requests", pin), &client)
                .await
                .unwrap_or_else(|error| panic!("{pin}: {error:?}"));
            assert_eq!(
                page.artifacts[0].version.as_deref(),
                Some("2.32.0"),
                "{pin}"
            );
            assert_eq!(page.artifacts[0].yanked, Some(true), "{pin}");
        }
        let only_yanked = pypi(
            &versioned(ArtifactType::Pypi, "requests", ">=2.32.0,<2.32.2"),
            &client,
        )
        .await
        .expect_err("only a yanked release matches");
        assert_eq!(only_yanked.code, "versionNotFound");
        assert!(
            only_yanked.message.contains("yanked 2.32.0"),
            "{only_yanked:?}"
        );
        assert_eq!(only_yanked.nearest, ["2.32.0"]);
    }

    /// The row's license is a short identifier: the SPDX expression, a
    /// one-line license field, else the license classifier; never the full
    /// license text some projects put in `license`.
    #[tokio::test]
    async fn pypi_license_is_short_never_the_license_text() {
        let text = format!(
            "Copyright (c) 2005-2024, NumPy Developers.\nAll rights reserved.\n{}",
            "Redistribution and use in source and binary forms. ".repeat(40)
        );
        let cases = [
            (
                json!({"license_expression": "BSD-3-Clause", "license": text}),
                Some("BSD-3-Clause"),
            ),
            (json!({"license": "Apache 2.0"}), Some("Apache 2.0")),
            (
                json!({"license": text, "classifiers": [
                    "Programming Language :: Python",
                    "License :: OSI Approved :: BSD License"
                ]}),
                Some("BSD License"),
            ),
            (json!({"license": text}), None),
        ];
        for (fields, expected) in cases {
            let mut release = pypi_release("2.31.0");
            for (key, value) in fields.as_object().expect("fields") {
                release["info"][key] = value.clone();
            }
            let http = RouteHttp::routes(vec![("/pypi/requests/2.31.0/json", release)]);
            let b = test_budget();
            let client = RegistryClient::uncached(&http, &b);
            let page = pypi(
                &versioned(ArtifactType::Pypi, "requests", "2.31.0"),
                &client,
            )
            .await
            .expect("release");
            assert_eq!(page.artifacts[0].license.as_deref(), expected, "{fields}");
        }
    }

    fn serde_crate_document() -> Value {
        json!({
            "crate": {"name": "serde", "max_stable_version": "1.0.228",
                "default_version": "1.0.228", "description": "serialization", "homepage": "https://serde.rs",
                "repository": "https://github.com/serde-rs/serde"},
            "versions": [
                {"num": "1.0.228", "created_at": "2025-09-27T00:00:00Z", "yanked": false, "license": "MIT OR Apache-2.0", "rust_version": "1.61"},
                {"num": "1.0.200", "created_at": "2024-05-01T00:00:00Z", "yanked": true, "license": "MIT OR Apache-2.0", "rust_version": "1.31"},
                {"num": "1.0.100", "created_at": "2019-09-08T01:56:06Z", "yanked": false, "license": "MIT OR Apache-2.0"},
                {"num": "1.0.99", "created_at": "2019-08-01T00:00:00Z", "yanked": false}
            ]
        })
    }

    /// A crate version's source ref is the commit cargo packaged it from,
    /// with its directory in the repository; without VCS info it is the
    /// upstream release tag, when one exists.
    /// A monorepo package whose release tag carries a prefix other than its
    /// full name (pydantic-core: `core-v2.50.1` in pydantic/pydantic) still
    /// pins the release lead to that tag.
    #[tokio::test]
    async fn a_monorepo_pypi_release_is_pinned_to_its_prefixed_tag() {
        let mut release = pypi_release("2.50.1");
        release["info"]["name"] = json!("pydantic_core");
        release["info"]["project_urls"] = json!({
            "Source": "https://github.com/pydantic/pydantic/tree/main/pydantic-core"
        });
        let http = RouteHttp::routes(vec![("/pypi/pydantic-core/2.50.1/json", release)]);
        let tags = KnownTags::new(vec!["pydantic/pydantic@core-v2.50.1"]);
        let b = test_budget();
        let client = RegistryClient {
            http: &http,
            budget: &b,
            cache: None,
            tags: Some(&tags),
        };
        let page = pypi(
            &versioned(ArtifactType::Pypi, "pydantic-core", "2.50.1"),
            &client,
        )
        .await
        .expect("exact");
        assert_eq!(
            page.artifacts[0].source_ref.as_deref(),
            Some("core-v2.50.1")
        );
        assert!(page.artifacts[0].source_tag);
    }

    #[tokio::test]
    async fn crates_exact_versions_carry_the_packaging_commit_or_release_tag() {
        let info =
            br#"{"git":{"sha1":"b6a77c4413f902523646be0d7f5520631df53ff6"},"path_in_vcs":"serde"}"#;
        let http = RouteHttp::routes(vec![("/api/v1/crates/serde", serde_crate_document())]).bytes(
            "/crates/serde/serde-1.0.100.crate",
            super::super::release_ref::test_archive(&[
                ("serde-1.0.100/Cargo.toml", b"[package]", b'0'),
                ("serde-1.0.100/.cargo_vcs_info.json", info, b'0'),
            ]),
        );
        let tags = KnownTags::new(vec!["serde-rs/serde@v1.0.228"]);
        let b = test_budget();
        let client = RegistryClient {
            http: &http,
            budget: &b,
            cache: None,
            tags: Some(&tags),
        };
        let state = ArtifactProviderState::default();
        let pinned = crates(
            &versioned(ArtifactType::Crates, "serde", "1.0.100"),
            &state,
            &client,
        )
        .await
        .expect("pinned")
        .artifacts
        .remove(0);
        assert_eq!(
            pinned.source_ref.as_deref(),
            Some("b6a77c4413f902523646be0d7f5520631df53ff6")
        );
        assert_eq!(pinned.repository_directory.as_deref(), Some("serde"));
        let latest = crates(&exact_query(ArtifactType::Crates, "serde"), &state, &client)
            .await
            .expect("latest")
            .artifacts
            .remove(0);
        assert_eq!(latest.source_ref.as_deref(), Some("v1.0.228"));
        assert!(latest.source_tag, "an upstream tag is checked to exist");
        assert!(!pinned.source_tag, "cargo VCS info is not a tag");
        assert_eq!(latest.repository_directory, None);
    }

    /// A crate row lists its runtime dependencies like the other
    /// ecosystems: normal ones, required apart from optional, on both
    /// exact-version paths.
    #[tokio::test]
    async fn crates_rows_list_runtime_dependencies() {
        let dependencies = json!({"dependencies": [
            {"crate_id": "a", "kind": "normal", "optional": false, "req": "^1.0"},
            {"crate_id": "b", "kind": "normal", "optional": true},
            {"crate_id": "c", "kind": "dev", "optional": false},
            {"crate_id": "d", "kind": "build", "optional": false},
            {"crate_id": "e", "kind": "normal", "optional": false}
        ]});
        let document = serde_crate_document();
        let mut metadata = json!({"crate": document["crate"].clone(), "versions": null});
        metadata["crate"]["max_stable_version"] = Value::Null;
        let record = json!({"version": document["versions"][2].clone()});
        let small = RouteHttp::routes(vec![
            ("/api/v1/crates/serde?include=", metadata),
            ("/api/v1/crates/serde/1.0.100", record),
            (
                "/api/v1/crates/serde/1.0.100/dependencies",
                dependencies.clone(),
            ),
        ]);
        let whole = RouteHttp::routes(vec![
            ("/api/v1/crates/serde", document),
            ("/api/v1/crates/serde/1.0.228/dependencies", dependencies),
        ]);
        let b = test_budget();
        let pinned = crate_lookup(
            &small,
            &b,
            &versioned(ArtifactType::Crates, "serde", "1.0.100"),
        )
        .await
        .expect("pinned")
        .artifacts
        .remove(0);
        assert_eq!(pinned.dependencies.as_ref().map(Vec::len), Some(2));
        let latest = crate_lookup(&whole, &b, &exact_query(ArtifactType::Crates, "serde"))
            .await
            .expect("latest")
            .artifacts
            .remove(0);
        // The names ride the row; the list is the one dependency field.
        let row = serde_json::to_value(&latest).expect("row");
        assert_eq!(row["dependencies"], json!(["a ^1.0", "e"]));
        assert_eq!(row["optionalDependencies"], json!(["b"]));
    }

    #[tokio::test]
    async fn crates_versions_resolve_from_the_crate_response() {
        let http = RouteHttp::routes(vec![("/api/v1/crates/serde", serde_crate_document())]);
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let state = ArtifactProviderState::default();
        let lookup = |query: ArtifactSearchQuery| {
            let client = &client;
            let state = &state;
            async move { crates(&query, state, client).await }
        };
        let latest = lookup(exact_query(ArtifactType::Crates, "serde"))
            .await
            .expect("latest");
        assert_eq!(latest.artifacts[0].rust_version.as_deref(), Some("1.61"));
        let range = lookup(versioned(
            ArtifactType::Crates,
            "serde",
            ">=1.0.100, <1.0.228",
        ))
        .await
        .expect("range");
        assert_eq!(
            range.artifacts[0].version.as_deref(),
            Some("1.0.100"),
            "yanked 1.0.200 is skipped"
        );
        // The latest reads the default version's view and the range the
        // crate document; only the resolved version's dependency list is a
        // second read.
        assert!(
            http.targets()
                .iter()
                .filter(|path| path.starts_with("/api/"))
                .all(|path| path == "/api/v1/crates/serde"
                    || path == "/api/v1/crates/serde?include=default_version"
                    || path.ends_with("/dependencies")),
            "{:?}",
            http.targets()
        );
        // A version the registry does not know reads the crate document for
        // its nearest versions.
        let missing = lookup(versioned(ArtifactType::Crates, "serde", "1.0.101"))
            .await
            .expect_err("missing");
        assert_eq!(missing.code, "versionNotFound");
        assert!(
            missing.nearest.iter().any(|version| version == "1.0.100"),
            "{missing:?}"
        );
    }

    async fn crate_lookup(
        http: &RouteHttp,
        budget: &RequestBudget,
        query: &ArtifactSearchQuery,
    ) -> Result<ArtifactProviderPage, ArtifactError> {
        let client = RegistryClient::uncached(http, budget);
        crates(query, &ArtifactProviderState::default(), &client).await
    }

    /// An unpinned or `latest` lookup reads the crate's default version
    /// view, never the document listing every version, and returns the row
    /// that document gives. The default is crates.io's: the highest stable
    /// version, else the highest prerelease, else a yanked one, marked.
    #[tokio::test]
    async fn an_unpinned_crate_reads_only_its_default_version() {
        let slim = |default: &str, entry: Value| {
            json!({
                "crate": {"name": "serde", "max_stable_version": null, "max_version": "0.0.0",
                    "default_version": default, "description": "serialization",
                    "homepage": "https://serde.rs", "repository": "https://github.com/serde-rs/serde"},
                "versions": [entry]
            })
        };
        let document = serde_crate_document();
        let stable = slim("1.0.228", document["versions"][0].clone());
        let b = test_budget();
        let whole = RouteHttp::routes(vec![("/api/v1/crates/serde", document.clone())]);
        let from_document =
            crate_lookup(&whole, &b, &versioned(ArtifactType::Crates, "serde", "*"))
                .await
                .expect("document row")
                .artifacts
                .remove(0);
        for query in [
            exact_query(ArtifactType::Crates, "serde"),
            versioned(ArtifactType::Crates, "serde", "latest"),
        ] {
            let http = RouteHttp::routes(vec![(
                "/api/v1/crates/serde?include=default_version",
                stable.clone(),
            )]);
            let row = crate_lookup(&http, &b, &query)
                .await
                .expect("latest")
                .artifacts
                .remove(0);
            assert_eq!(row, from_document);
            assert!(
                !http
                    .targets()
                    .iter()
                    .any(|target| target == "/api/v1/crates/serde"),
                "{:?}",
                http.targets()
            );
        }
        for (default, entry, yanked) in [
            (
                "2.0.0-rc.1",
                json!({"num": "2.0.0-rc.1", "created_at": "2026-01-02T00:00:00Z", "yanked": false}),
                None,
            ),
            (
                "0.3.0",
                json!({"num": "0.3.0", "created_at": "2020-01-02T00:00:00Z", "yanked": true}),
                Some(true),
            ),
        ] {
            let http = RouteHttp::routes(vec![(
                "/api/v1/crates/serde?include=default_version",
                slim(default, entry),
            )]);
            let row = crate_lookup(&http, &b, &exact_query(ArtifactType::Crates, "serde"))
                .await
                .expect("default")
                .artifacts
                .remove(0);
            assert_eq!(
                (row.version.as_deref(), row.yanked),
                (Some(default), yanked)
            );
        }
    }

    /// An exact version reads its own record and the crate's metadata, not
    /// the crate document that lists every version, and returns the same
    /// row the document would.
    #[tokio::test]
    async fn crates_exact_versions_read_the_version_record_with_the_same_fields() {
        let document = serde_crate_document();
        let record = |num: &str| {
            json!({"version": document["versions"].as_array().expect("versions").iter()
                .find(|entry| entry["num"] == num).expect("entry")})
        };
        // `include=` leaves the version-derived fields empty, as crates.io does.
        let mut metadata = json!({"crate": document["crate"].clone(), "versions": null});
        metadata["crate"]["max_stable_version"] = Value::Null;
        metadata["crate"]["max_version"] = json!("0.0.0");
        let small = RouteHttp::routes(vec![
            ("/api/v1/crates/serde?include=", metadata),
            ("/api/v1/crates/serde/1.0.100", record("1.0.100")),
            ("/api/v1/crates/serde/1.0.200", record("1.0.200")),
        ]);
        let whole = RouteHttp::routes(vec![("/api/v1/crates/serde", document.clone())]);
        let b = test_budget();
        for (query, version) in [
            (
                versioned(ArtifactType::Crates, "serde", "1.0.100"),
                "1.0.100",
            ),
            (
                exact_query(ArtifactType::Crates, "serde@1.0.100"),
                "1.0.100",
            ),
            (
                versioned(ArtifactType::Crates, "serde", "1.0.200"),
                "1.0.200",
            ),
        ] {
            let item = crate_lookup(&small, &b, &query)
                .await
                .expect("exact")
                .artifacts
                .remove(0);
            assert_eq!(item.version.as_deref(), Some(version));
            let via_document = crate_lookup(&whole, &b, &query)
                .await
                .expect("document")
                .artifacts
                .remove(0);
            assert_eq!(
                serde_json::to_value(&item).expect("item"),
                serde_json::to_value(&via_document).expect("item"),
                "{version}"
            );
        }
        // Registry reads only (dependency lists aside); the release-ref
        // reads are lead sources.
        let mut seen: Vec<String> = small
            .targets()
            .into_iter()
            .filter(|path| path.starts_with("/api/") && !path.ends_with("/dependencies"))
            .collect();
        seen.sort();
        seen.dedup();
        assert_eq!(
            seen,
            [
                "/api/v1/crates/serde/1.0.100",
                "/api/v1/crates/serde/1.0.200",
                "/api/v1/crates/serde?include=",
            ]
        );
    }

    fn exact_query(artifact_type: ArtifactType, name: &str) -> ArtifactSearchQuery {
        artifact_query(
            serde_json::json!({"ecosystem": artifact_type, "packageName": name.to_string()}),
            None,
        )
    }

    #[test]
    fn go_source_ref_names_the_tag_or_pseudo_version_commit() {
        let item = |module: &str, version: &str| {
            let mut item = ArtifactItem::new(ArtifactType::Go, module.into(), String::new());
            item.module_path = Some(module.into());
            item.version = Some(version.into());
            item.repository = Some("https://github.com/o/r".into());
            go_source_ref(&item)
        };
        assert_eq!(
            item("github.com/o/r", "v1.10.2").as_deref(),
            Some("v1.10.2")
        );
        assert_eq!(
            item("github.com/o/r/v2", "v2.3.0").as_deref(),
            Some("v2.3.0")
        );
        assert_eq!(
            item("github.com/o/r/sub/mod", "v0.4.1").as_deref(),
            Some("sub/mod/v0.4.1")
        );
        assert_eq!(
            item("github.com/o/r", "v2.0.0+incompatible").as_deref(),
            Some("v2.0.0")
        );
        assert_eq!(
            item("github.com/o/r", "v0.0.0-20240101120000-abcdef123456").as_deref(),
            Some("abcdef123456")
        );
        assert_eq!(item("github.com/o/rx", "v1.0.0"), None);
    }

    /// A module inside a repository keeps its directory, so the release
    /// lead lists the module and not the repository root.
    #[test]
    fn go_module_directory_is_the_path_under_the_repository_root() {
        let directory = |module: &str| {
            let mut item = ArtifactItem::new(ArtifactType::Go, module.into(), String::new());
            item.module_path = Some(module.into());
            item.repository = Some("https://github.com/aws/aws-sdk-go-v2".into());
            go_module_directory(&item)
        };
        assert_eq!(
            directory("github.com/aws/aws-sdk-go-v2/service/s3").as_deref(),
            Some("service/s3")
        );
        assert_eq!(
            directory("github.com/aws/aws-sdk-go-v2/v2").as_deref(),
            Some("")
        );
        assert_eq!(directory("go.example.com/x"), None);
    }

    /// Only requirements an extra gates are optional; an environment
    /// marker alone keeps a requirement required.
    #[test]
    fn pypi_requirements_gated_by_an_extra_are_optional() {
        for optional in [
            "PySocks!=1.5.7; extra == \"socks\"",
            "x; extra=='y'",
            "x ; python_version < \"4\" and extra == \"y\"",
        ] {
            assert!(names_an_extra(optional), "{optional}");
        }
        for required in [
            "idna<4,>=2.5",
            "tzdata; sys_platform == \"win32\"",
            "x; my_extra == \"y\"",
        ] {
            assert!(!names_an_extra(required), "{required}");
        }
    }

    #[test]
    fn composer_source_reference_is_the_release_commit() {
        let row = json!({"name": "o/r", "version": "v1.0.0",
            "source": {"type": "git", "url": "https://github.com/o/r.git",
                       "reference": "0a2e291c0d9c0c7675d445703e51750363a549ef"}});
        let item = composer(row.as_object().unwrap()).unwrap();
        assert_eq!(
            item.source_ref.as_deref(),
            Some("0a2e291c0d9c0c7675d445703e51750363a549ef")
        );
    }

    /// An exact lookup on each registry parses one row with its name,
    /// version and registry page.
    #[tokio::test]
    async fn exact_lookups_parse_one_row_per_registry() {
        let cases = [
            (
                ArtifactType::Pypi,
                "requests",
                json!({
                    "info": {
                        "name": "requests",
                        "version": "2.31.0",
                        "summary": "Python HTTP for Humans.",
                        "license": "Apache-2.0",
                        "home_page": "https://requests.readthedocs.io",
                        "project_urls": {"Source": "https://github.com/psf/requests"}
                    }
                }),
                "2.31.0",
                "https://pypi.org/project/requests/",
            ),
            (
                ArtifactType::Crates,
                "serde",
                json!({
                    "crate": {
                        "id": "serde",
                        "name": "serde",
                        "max_stable_version": "1.0.200",
                        "description": "A generic serialization/deserialization framework",
                        "license": "MIT OR Apache-2.0",
                        "repository": "https://github.com/serde-rs/serde"
                    }
                }),
                "1.0.200",
                "https://crates.io/crates/serde",
            ),
            (
                ArtifactType::Packagist,
                "laravel/framework",
                // p2/{name}.json response with entries for the tagged URL
                json!({
                    "packages": {
                        "laravel/framework": [
                            {
                                "name": "laravel/framework",
                                "version": "10.0.0",
                                "description": "The Laravel Framework.",
                                "license": ["MIT"]
                            }
                        ]
                    }
                }),
                "10.0.0",
                "https://packagist.org/packages/laravel/framework",
            ),
            (
                ArtifactType::Rubygems,
                "rails",
                json!({
                    "name": "rails",
                    "version": "7.0.6",
                    "info": "Full-stack web application framework.",
                    "homepage_uri": "https://rubyonrails.org",
                    "source_code_uri": "https://github.com/rails/rails"
                }),
                "7.0.6",
                "https://rubygems.org/gems/rails",
            ),
        ];
        for (ecosystem, name, body, version, registry_url) in cases {
            let http = RouteHttp::always(body);
            let b = test_budget();
            let client = RegistryClient::uncached(&http, &b);
            let q = exact_query(ecosystem, name);
            let state = ArtifactProviderState::default();
            let page = match ecosystem {
                ArtifactType::Pypi => pypi(&q, &client).await,
                ArtifactType::Crates => crates(&q, &state, &client).await,
                ArtifactType::Packagist => packagist(&q, &state, &client).await,
                ArtifactType::Rubygems => rubygems(&q, &state, &client).await,
                other => unreachable!("no exact-lookup case for {other:?}"),
            }
            .unwrap_or_else(|error| panic!("{name}: {error:?}"));
            assert_eq!(page.artifacts.len(), 1, "{name}");
            let item = &page.artifacts[0];
            assert_eq!(item.name, name);
            assert_eq!(item.version.as_deref(), Some(version), "{name}");
            assert_eq!(item.registry_url, registry_url, "{name}");
        }
    }

    /// An exact Go module row: its release day from the module record, and
    /// its direct requirements from the version's `go.mod` on the module
    /// proxy (`// indirect` ones left out); without that file the
    /// dependencies are unknown, not none.
    #[tokio::test]
    async fn go_parses_exact_module_lookup() {
        let module = json!({
            "path": "github.com/gin-gonic/gin",
            "version": "v1.9.1",
            "synopsis": "HTTP web framework for Go",
            "commitTime": "2023-06-12T08:50:28Z"
        });
        let go_mod = "module github.com/gin-gonic/gin\n\ngo 1.20\n\nrequire github.com/bytedance/sonic v1.9.1\n\
            require (\n\tgithub.com/gin-contrib/sse v0.1.0 // pinned\n\tgolang.org/x/net v0.10.0 // indirect\n)\n\
            replace example.com/x => ../x\n";
        let b = test_budget();
        let q = exact_query(ArtifactType::Go, "github.com/gin-gonic/gin");
        let http = RouteHttp::routes(vec![(
            "/v1/module/github.com/gin-gonic/gin",
            module.clone(),
        )])
        .bytes("/github.com/gin-gonic/gin/@v/v1.9.1.mod", go_mod);
        let client = RegistryClient::uncached(&http, &b);
        let page = go(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect("go");
        assert_eq!(page.artifacts.len(), 1);
        let item = &page.artifacts[0];
        assert_eq!(item.name, "github.com/gin-gonic/gin");
        assert_eq!(item.version.as_deref(), Some("v1.9.1"));
        assert_eq!(item.published_at.as_deref(), Some("2023-06-12"));
        assert_eq!(
            item.registry_url,
            "https://pkg.go.dev/github.com/gin-gonic/gin"
        );
        assert_eq!(
            item.dependencies,
            Some(vec![
                "github.com/bytedance/sonic v1.9.1".to_owned(),
                "github.com/gin-contrib/sse v0.1.0".to_owned(),
            ])
        );
        let http = RouteHttp::routes(vec![("/v1/module/github.com/gin-gonic/gin", module)]);
        let client = RegistryClient::uncached(&http, &b);
        let page = go(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect("go without go.mod");
        assert_eq!(page.artifacts[0].dependencies, None);
    }

    /// pkg.go.dev rejects a package path on the module endpoint (HTTP 400,
    /// not 404): the lookup still reads the package endpoint and returns the
    /// package row with its containing module; a path neither endpoint knows
    /// keeps the module rejection.
    #[tokio::test]
    async fn go_package_paths_rejected_as_modules_read_the_package_endpoint() {
        let rejection = json!({"code": 400,
            "message": "golang.org/x/net/http2 is a package, not a module"});
        let http = RouteHttp::new()
            .status("/v1/module/golang.org/x/net/http2", 400, rejection.clone())
            .json(
                "/v1/package/golang.org/x/net/http2",
                json!({"path": "golang.org/x/net/http2", "modulePath": "golang.org/x/net",
                    "version": "v0.61.0", "synopsis": "Package http2 implements the HTTP/2 protocol."}),
            );
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let q = exact_query(ArtifactType::Go, "golang.org/x/net/http2");
        let page = go(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect("package fallback");
        let item = &page.artifacts[0];
        assert_eq!(item.name, "golang.org/x/net/http2");
        assert_eq!(item.module_path.as_deref(), Some("golang.org/x/net"));
        assert_eq!(item.version.as_deref(), Some("v0.61.0"));
        let paths = |http: &RouteHttp| {
            http.seen()
                .iter()
                .map(|seen| seen.url.path().to_owned())
                .collect::<Vec<_>>()
        };
        let lookups = [
            "/v1/module/golang.org/x/net/http2",
            "/v1/package/golang.org/x/net/http2",
        ];
        assert_eq!(paths(&http)[..2], lookups, "{:?}", paths(&http));
        let unknown = RouteHttp::new().status("/v1/module/golang.org/x/net/http2", 400, rejection);
        let client = RegistryClient::uncached(&unknown, &b);
        let error = go(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect_err("rejected by both endpoints");
        assert_eq!(error.status, Some(400));
        assert!(
            error.message.contains("is a package, not a module"),
            "{error:?}"
        );
        assert_eq!(paths(&unknown), lookups);
    }

    /// An exact Packagist row states the release day (`time`) and the
    /// version's `require` entries as declared; a version entry without
    /// `require` declares none.
    #[tokio::test]
    async fn packagist_exact_rows_state_the_release_day_and_requirements() {
        let entry = json!({"name": "monolog/monolog", "version": "3.12.1",
            "time": "2026-09-29T19:21:12+00:00",
            "require": {"php": ">=8.1", "psr/log": "^2.0 || ^3.0"},
            "require-dev": {"phpunit/phpunit": "^10"}});
        let http = RouteHttp::always(json!({"packages": {"monolog/monolog": [entry]}}));
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let q = exact_query(ArtifactType::Packagist, "monolog/monolog");
        let state = ArtifactProviderState::default();
        let page = packagist(&q, &state, &client).await.expect("packagist");
        let item = &page.artifacts[0];
        assert_eq!(item.published_at.as_deref(), Some("2026-09-29"));
        assert_eq!(
            item.dependencies,
            Some(vec![
                "php >=8.1".to_owned(),
                "psr/log ^2.0 || ^3.0".to_owned()
            ])
        );
        let bare = RouteHttp::always(
            json!({"packages": {"monolog/monolog": [{"name": "monolog/monolog", "version": "1.0.0"}]}}),
        );
        let client = RegistryClient::uncached(&bare, &b);
        let page = packagist(&q, &state, &client).await.expect("packagist");
        assert_eq!(page.artifacts[0].dependencies, Some(Vec::new()));
        assert_eq!(page.artifacts[0].published_at, None);
    }

    /// A pinned Go module version is looked up as that version, so its
    /// release ref names the pinned tag, not the latest one; an unpublished
    /// version names the nearest published ones, and ranges are refused.
    #[tokio::test]
    async fn go_pinned_versions_resolve_the_pinned_release() {
        let module = "/v1/module/github.com/open-telemetry/opentelemetry-go";
        let http = RouteHttp::routes(vec![
            (
                "/v1/module/github.com/open-telemetry/opentelemetry-go?version=v0.71.0",
                json!({"path":"github.com/open-telemetry/opentelemetry-go","version":"v0.71.0",
                    "repoUrl":"https://github.com/open-telemetry/opentelemetry-go"}),
            ),
            (
                module,
                json!({"path":"github.com/open-telemetry/opentelemetry-go","version":"v0.72.0",
                    "repoUrl":"https://github.com/open-telemetry/opentelemetry-go"}),
            ),
            (
                "/v1/versions/github.com/open-telemetry/opentelemetry-go",
                json!({"items":[{"version":"v0.72.0"},{"version":"v0.71.0"},{"version":"v0.70.0"}]}),
            ),
        ]);
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let lookup = |version: Option<&str>| {
            let mut fields = json!({"ecosystem":"go","packageName":"github.com/open-telemetry/opentelemetry-go"});
            if let Some(version) = version {
                fields["version"] = json!(version);
            }
            artifact_query(fields, None)
        };
        let state = ArtifactProviderState::default();
        for pinned in ["v0.71.0", "0.71.0"] {
            let page = go(&lookup(Some(pinned)), &state, &client)
                .await
                .expect("pinned");
            let item = &page.artifacts[0];
            assert_eq!(item.version.as_deref(), Some("v0.71.0"));
            assert_eq!(item.source_ref.as_deref(), Some("v0.71.0"));
        }
        let latest = go(&lookup(Some("latest")), &state, &client)
            .await
            .expect("latest");
        assert_eq!(latest.artifacts[0].version.as_deref(), Some("v0.72.0"));
        let missing = go(&lookup(Some("v0.69.9")), &state, &client)
            .await
            .expect_err("unpublished");
        assert_eq!(missing.code, "versionNotFound");
        assert!(
            missing.nearest.iter().any(|version| version == "0.70.0"),
            "{missing:?}"
        );
        let range = go(&lookup(Some("^0.71")), &state, &client)
            .await
            .expect_err("range");
        assert_eq!(range.code, "capabilityUnavailable");
    }

    /// A vanity module path names neither its repository directory nor its
    /// tag: the release commit and directory come from the module proxy.
    #[tokio::test]
    async fn go_vanity_modules_take_the_release_commit_from_the_proxy() {
        let http = RouteHttp::routes(vec![
            (
                "/v1/module/go.opentelemetry.io/otel/sdk?version=v1.30.0",
                json!({"path":"go.opentelemetry.io/otel/sdk","version":"v1.30.0",
                    "repoUrl":"https://github.com/open-telemetry/opentelemetry-go"}),
            ),
            (
                "/go.opentelemetry.io/otel/sdk/@v/v1.30.0.info",
                json!({"Version":"v1.30.0","Origin":{"VCS":"git",
                    "URL":"https://github.com/open-telemetry/opentelemetry-go","Subdir":"sdk",
                    "Hash":"ed4fc757583a88b4da51b1fe1c3f0703ac27a487","Ref":"refs/tags/sdk/v1.30.0"}}),
            ),
        ]);
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let query = artifact_query(
            json!({"ecosystem":"go","packageName":"go.opentelemetry.io/otel/sdk","version":"v1.30.0"}),
            None,
        );
        let page = go(&query, &ArtifactProviderState::default(), &client)
            .await
            .expect("vanity");
        let item = &page.artifacts[0];
        assert_eq!(
            item.source_ref.as_deref(),
            Some("ed4fc757583a88b4da51b1fe1c3f0703ac27a487")
        );
        assert_eq!(item.repository_directory.as_deref(), Some("sdk"));
        assert_eq!(
            go_proxy_escape("github.com/BurntSushi/toml"),
            "github.com/!burnt!sushi/toml"
        );
    }

    fn discovery(artifact_type: ArtifactType, fields: Value) -> ArtifactSearchQuery {
        let mut query = json!({"ecosystem": artifact_type, "keywords": ["json"]});
        for (key, value) in fields.as_object().into_iter().flatten() {
            query[key] = value.clone();
        }
        artifact_query(query, None)
    }

    /// `count` rubygems search rows named `gem<first>`…
    fn gem_rows(first: usize, count: usize) -> Value {
        Value::Array(
            (first..first + count)
                .map(|n| json!({"name": format!("gem{n}"), "version": "1.0.0"}))
                .collect(),
        )
    }

    /// A rubygems discovery page reads the API pages its offset names
    /// directly (30 rows each): page 3 of 50 starts at row 100, API page 4
    /// row 10, and never re-reads pages 1–3. An API page with more rows
    /// than that fails loudly instead of misplacing every later page.
    #[tokio::test]
    async fn rubygems_pages_read_only_the_api_pages_their_offset_names() {
        let search = |page: usize| format!("/api/v1/search.json?query=json&page={page}");
        let http = RouteHttp::new()
            .json(&search(4), gem_rows(90, 30))
            .json(&search(5), gem_rows(120, 30))
            .json(&search(6), gem_rows(150, 12));
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let query = discovery(ArtifactType::Rubygems, json!({"page": 3}));
        let state = super::super::ArtifactProviderState {
            offset: Some(100),
            ..Default::default()
        };
        let page = rubygems(&query, &state, &client).await.expect("page 3");
        assert_eq!(http.targets(), [search(4), search(5)]);
        let names = page
            .artifacts
            .iter()
            .map(|row| row.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names.len(), 50);
        assert_eq!((names[0], names[49]), ("gem100", "gem149"));
        assert_eq!(page.next_state.and_then(|next| next.offset), Some(150));
        // The short last API page ends the results.
        let state = super::super::ArtifactProviderState {
            offset: Some(150),
            ..Default::default()
        };
        let last = rubygems(&query, &state, &client).await.expect("last page");
        assert_eq!(http.targets()[2..], [search(6)]);
        assert_eq!(last.artifacts.len(), 12);
        assert_eq!(last.next_state, None);
        let oversized = RouteHttp::always(gem_rows(0, 31));
        let client = RegistryClient::uncached(&oversized, &b);
        let error = rubygems(&query, &Default::default(), &client)
            .await
            .expect_err("31 rows");
        assert_eq!(error.code, "providerError");
        assert!(error.message.contains("31 rows"), "{}", error.message);
    }

    /// An exact gem row states its release day and runtime dependencies;
    /// a source link into a GitHub tree is the repository root, with the
    /// release ref it names.
    #[tokio::test]
    async fn rubygems_exact_rows_state_the_release_day_dependencies_and_repository() {
        let http = RouteHttp::always(json!({
            "name": "rails", "version": "8.1.4", "info": "Full-stack web framework",
            "licenses": ["MIT"], "version_created_at": "2026-09-24T14:22:14.180Z",
            "source_code_uri": "https://github.com/rails/rails/tree/v8.1.4",
            "dependencies": {"development": [{"name": "dev", "requirements": ">= 0"}],
                "runtime": [{"name": "actioncable", "requirements": "= 8.1.4"},
                    {"name": "bundler", "requirements": ">= 1.15.0"}]}
        }));
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let page = rubygems(
            &exact_query(ArtifactType::Rubygems, "rails"),
            &Default::default(),
            &client,
        )
        .await
        .expect("rails");
        let item = &page.artifacts[0];
        assert_eq!(item.published_at.as_deref(), Some("2026-09-24"));
        assert_eq!(
            item.dependencies,
            Some(vec![
                "actioncable = 8.1.4".to_owned(),
                "bundler >= 1.15.0".to_owned()
            ])
        );
        assert_eq!(
            item.repository.as_deref(),
            Some("https://github.com/rails/rails")
        );
        assert_eq!(item.source_ref.as_deref(), Some("v8.1.4"));
        assert_eq!(item.repository_directory, None);
        // A search row names neither: both stay unknown.
        let row = gem(json!({"name": "x", "version": "1"})
            .as_object()
            .expect("row"))
        .expect("row");
        assert_eq!((row.dependencies, row.published_at), (None, None));
        let monorepo = gem(json!({"name": "x", "version": "1",
            "source_code_uri": "https://github.com/o/r/tree/main/gems/x"})
        .as_object()
        .expect("row"))
        .expect("row");
        assert_eq!(
            monorepo.repository.as_deref(),
            Some("https://github.com/o/r")
        );
        assert_eq!(monorepo.repository_directory.as_deref(), Some("gems/x"));
        assert_eq!(monorepo.source_ref, None, "a branch is no release ref");
    }

    /// Go pages by opaque token: each served page remembers the token that
    /// starts the next, so following `nextPage` reads one page (not every
    /// page before it), and a deeper jump walks from the deepest page known.
    #[tokio::test]
    async fn go_next_pages_start_from_the_remembered_token() {
        let item = |n: usize| json!({"packagePath": format!("example.com/p{n}")});
        let search = |token: Option<&str>| match token {
            None => "/v1/search?q=json&limit=2".to_owned(),
            Some(token) => format!("/v1/search?q=json&limit=2&token={token}"),
        };
        let http = RouteHttp::new()
            .json(
                &search(None),
                json!({"items": [item(1), item(2)], "nextPageToken": "t2", "total": 9}),
            )
            .json(
                &search(Some("t2")),
                json!({"items": [item(3), item(4)], "nextPageToken": "t3", "total": 9}),
            )
            .json(
                &search(Some("t3")),
                json!({"items": [item(5), item(6)], "nextPageToken": "t4", "total": 9}),
            )
            .json(
                &search(Some("t4")),
                json!({"items": [item(7), item(8)], "total": 9}),
            );
        let cache = super::super::ArtifactCache::new(None);
        let b = test_budget();
        let client = RegistryClient {
            cache: Some(&cache),
            ..RegistryClient::uncached(&http, &b)
        };
        let page_of = |page: u64| {
            (
                discovery(ArtifactType::Go, json!({"page": page, "pageSize": 2})),
                ArtifactProviderState {
                    page: Some(page),
                    ..Default::default()
                },
            )
        };
        let (query, state) = page_of(1);
        let first = go(&query, &state, &client).await.expect("page 1");
        let cursor = first.next_state.and_then(|next| next.token);
        assert_eq!(
            cursor
                .as_deref()
                .and_then(|cursor| go_token(&go_page_key(&query, 2), cursor)),
            Some("t2")
        );
        let seen = http.targets().len();
        let (query, state) = page_of(2);
        let second = go(&query, &state, &client).await.expect("page 2");
        assert_eq!(second.artifacts[0].name, "example.com/p3");
        assert_eq!(http.targets()[seen..], [search(Some("t2"))], "one request");
        // Page 4 walks from page 3, the deepest page whose start is known.
        let seen = http.targets().len();
        let (query, state) = page_of(4);
        let fourth = go(&query, &state, &client).await.expect("page 4");
        assert_eq!(fourth.artifacts[0].name, "example.com/p7");
        assert_eq!(fourth.next_state, None);
        assert_eq!(
            http.targets()[seen..],
            [search(Some("t3")), search(Some("t4"))]
        );
    }

    /// pkg.go.dev search pages of two rows (`p1`…`p8`), tokens `t2`…`t4`.
    fn go_pages() -> RouteHttp {
        let item = |n: usize| json!({"packagePath": format!("example.com/p{n}")});
        let search = |token: &str| format!("/v1/search?q=json&limit=2&token={token}");
        RouteHttp::new()
            .json(
                "/v1/search?q=json&limit=2",
                json!({"items": [item(1), item(2)], "nextPageToken": "t2", "total": 8}),
            )
            .json(
                &search("t2"),
                json!({"items": [item(3), item(4)], "nextPageToken": "t3", "total": 8}),
            )
            .json(
                &search("t3"),
                json!({"items": [item(5), item(6)], "nextPageToken": "t4", "total": 8}),
            )
            .json(
                &search("t4"),
                json!({"items": [item(7), item(8)], "total": 8}),
            )
    }

    fn go_page(page: u64, cursor: Option<String>) -> (ArtifactSearchQuery, ArtifactProviderState) {
        (
            discovery(ArtifactType::Go, json!({"page": page, "pageSize": 2})),
            ArtifactProviderState {
                page: Some(page),
                token: cursor,
                ..Default::default()
            },
        )
    }

    /// The cursor a page hands its next page is all that page needs: with no
    /// registry cache (memory mode, a new daemon, a gap past the cache's
    /// lifetime), page 4 is one request, not a walk from page 1.
    #[tokio::test]
    async fn a_go_cursor_serves_its_page_in_one_request_without_a_cache() {
        let http = go_pages();
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let (query, state) = go_page(3, None);
        let third = go(&query, &state, &client).await.expect("page 3 walks");
        assert_eq!(third.artifacts[0].name, "example.com/p5");
        let cursor = third.next_state.and_then(|next| next.token);
        assert!(
            cursor.as_deref().is_some_and(|cursor| cursor != "t4"),
            "{cursor:?}"
        );
        let seen = http.targets().len();
        let (query, state) = go_page(4, cursor);
        let fourth = go(&query, &state, &client).await.expect("page 4");
        assert_eq!(fourth.artifacts[0].name, "example.com/p7");
        assert_eq!(
            http.targets()[seen..],
            ["/v1/search?q=json&limit=2&token=t4"],
            "one request"
        );
        assert_eq!(fourth.next_state, None);
    }

    /// A cursor that is not its page's, or one the registry rejects, is no
    /// shortcut: the page walks and serves exactly the rows it owns.
    #[tokio::test]
    async fn a_foreign_or_rejected_go_cursor_walks_to_the_same_rows() {
        let other = discovery(
            ArtifactType::Go,
            json!({"keywords": ["yaml"], "pageSize": 2}),
        );
        for cursor in [
            // Bound to another query's page 3.
            go_cursor(&go_page_key(&other, 3), "t2"),
            // Bound to page 2 of this query, copied onto page 3.
            go_cursor(&go_page_key(&go_page(2, None).0, 2), "t2"),
            // This page's, but the registry no longer honors it (404).
            go_cursor(&go_page_key(&go_page(3, None).0, 3), "expired"),
            "not-a-cursor".to_owned(),
        ] {
            let http = go_pages();
            let b = test_budget();
            let client = RegistryClient::uncached(&http, &b);
            let (query, state) = go_page(3, Some(cursor.clone()));
            let third = go(&query, &state, &client).await.expect("page 3");
            let names = third
                .artifacts
                .iter()
                .map(|row| row.name.as_str())
                .collect::<Vec<_>>();
            assert_eq!(names, ["example.com/p5", "example.com/p6"], "{cursor}");
            assert!(
                http.targets()
                    .iter()
                    .any(|target| target == "/v1/search?q=json&limit=2&token=t2"),
                "walked: {cursor}"
            );
        }
    }

    /// A found release tag is a release fact: the same release looked up
    /// again checks no tag on GitHub.
    #[tokio::test]
    async fn found_release_tags_are_remembered() {
        let http = RouteHttp::routes(vec![
            ("/pypi/requests/json", pypi_project()),
            ("/pypi/requests/2.31.0/json", pypi_release("2.31.0")),
        ]);
        let tags = KnownTags::new(vec!["psf/requests@v2.31.0"]);
        let cache = super::super::ArtifactCache::new(None);
        let b = test_budget();
        let client = RegistryClient {
            http: &http,
            budget: &b,
            cache: Some(&cache),
            tags: Some(&tags),
        };
        let query = versioned(ArtifactType::Pypi, "requests", "2.31.0");
        for _ in 0..2 {
            let page = pypi(&query, &client).await.expect("exact");
            assert_eq!(page.artifacts[0].source_ref.as_deref(), Some("v2.31.0"));
            assert!(page.artifacts[0].source_tag);
        }
        assert_eq!(tags.seen(), ["psf/requests@v2.31.0"], "one tag check");
    }
}

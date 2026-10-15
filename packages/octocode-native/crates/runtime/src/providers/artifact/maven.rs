use super::http::{JSON, RegistryClient};
use super::util::{endpoint, object_for, parse_url, required, rows, string, total};
use super::{
    ArtifactError, ArtifactItem, ArtifactProviderPage, ArtifactProviderState, ArtifactSearchQuery,
    ArtifactType, TerminalLimit,
};
/// Compile-once XML/coordinate patterns. `maven-metadata.xml` and POM parsing
/// run per lookup; compiling these constant patterns on every call (and once
/// per extracted tag in the old `field` closure) was pure waste.
mod patterns {
    use regex::Regex;
    use std::sync::LazyLock;

    macro_rules! pattern {
        ($name:ident, $src:expr) => {
            pub(super) fn $name() -> &'static Regex {
                static RE: LazyLock<Regex> = LazyLock::new(|| {
                    Regex::new($src).expect(concat!("static maven pattern: ", stringify!($name)))
                });
                &RE
            }
        };
    }

    pattern!(valid_coordinate, r"^[A-Za-z0-9_][A-Za-z0-9_.-]*$");
    pattern!(doctype, r"(?i)<!DOCTYPE|<!ENTITY");
    pattern!(comment, r"(?s)<!--.*?-->");
    pattern!(url_tag, r"<url>\s*([^<]+?)\s*</url>");
    pattern!(scm, r"(?s)<scm>(.*?)</scm>");
    pattern!(group_id, r"<groupId>\s*([^<]+?)\s*</groupId>");
    pattern!(artifact_id, r"<artifactId>\s*([^<]+?)\s*</artifactId>");
    pattern!(release, r"<release>\s*([^<]+?)\s*</release>");
    pattern!(latest, r"<latest>\s*([^<]+?)\s*</latest>");
    pattern!(version, r"<version>\s*([^<]+?)\s*</version>");
    pattern!(
        inherited_blocks,
        r"(?s)<(dependencyManagement|build|profiles|reporting)>.*?</(dependencyManagement|build|profiles|reporting)>"
    );
    pattern!(dependencies, r"(?s)<dependencies>(.*?)</dependencies>");
    pattern!(dependency, r"(?s)<dependency>(.*?)</dependency>");
    pattern!(exclusions, r"(?s)<exclusions>.*?</exclusions>");
    pattern!(scope, r"<scope>\s*([^<]+?)\s*</scope>");
    pattern!(optional, r"<optional>\s*([^<]+?)\s*</optional>");

    /// The bounded set of `<tag>value</tag>` fields extracted from
    /// `maven-metadata.xml`. Unknown tags return `None` (the `regex` crate has
    /// no backreferences, so a single generic `<(\w+)>…</\1>` is unavailable).
    pub(super) fn field(tag: &str) -> Option<&'static Regex> {
        Some(match tag {
            "groupId" => group_id(),
            "artifactId" => artifact_id(),
            "release" => release(),
            "latest" => latest(),
            _ => return None,
        })
    }
}

pub(crate) async fn maven(
    query: &ArtifactSearchQuery,
    state: &ArtifactProviderState,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    if let Some(package_name) = query.package_name() {
        return exact(package_name, query.version(), client).await;
    }
    let offset = state.offset.unwrap_or(0);
    let size = query.page_size();
    let url = endpoint(
        "https://central.sonatype.com/solrsearch/select",
        &[
            ("q", Some(solr_terms(&query.terms()))),
            ("rows", Some(size.to_string())),
            ("start", Some(offset.to_string())),
            ("wt", Some("json".into())),
        ],
    )?;
    let response = client
        .json(ArtifactType::Maven, url, false, None, None, JSON)
        .await?
        .ok_or_else(|| super::util::invalid(ArtifactType::Maven))?;
    let data = object_for(
        object_for(&response, ArtifactType::Maven)?
            .get("response")
            .ok_or_else(|| super::util::invalid(ArtifactType::Maven))?,
        ArtifactType::Maven,
    )?;
    let mut artifacts = rows(
        data.get("docs")
            .ok_or_else(|| super::util::invalid(ArtifactType::Maven))?,
        ArtifactType::Maven,
    )?
    .iter()
    .map(|value| {
        let row = object_for(value, ArtifactType::Maven)?;
        let group = required(row.get("g"), ArtifactType::Maven)?;
        let name = required(row.get("a"), ArtifactType::Maven)?;
        let mut artifact = ArtifactItem::new(
            ArtifactType::Maven,
            format!("{group}:{name}"),
            format!(
                "https://central.sonatype.com/artifact/{}/{}",
                super::util::encode_component(&group),
                super::util::encode_component(&name)
            ),
        );
        artifact.version = string(row.get("latestVersion")).or_else(|| string(row.get("v")));
        Ok(artifact)
    })
    .collect::<Result<Vec<_>, ArtifactError>>()?;
    discovery_repositories(&mut artifacts, client).await;
    let count = total(data.get("numFound"));
    let more = count
        .map(|count| offset.saturating_add(artifacts.len() as u64) < count)
        .unwrap_or(artifacts.len() == size);
    Ok(ArtifactProviderPage {
        next_state: (more && !artifacts.is_empty()).then(|| ArtifactProviderState {
            offset: Some(offset + artifacts.len() as u64),
            ..Default::default()
        }),
        terminal_limit: (more && artifacts.is_empty()).then(|| TerminalLimit::short_page("Maven")),
        artifacts,
        total: count,
        registry: None,
    })
}

/// Keyword terms as a Central search query: the words ANDed, or the
/// artifactId they spell hyphen-joined (`jackson databind` finds
/// `jackson-databind`, which Central indexes as one token). The endpoint
/// rejects bare whitespace with HTTP 400, and a single word stays bare (a
/// one-word group answers 404). Query-syntax characters (field `:`, quotes,
/// groups, wildcards, operators) separate words rather than reach the
/// endpoint; `-`, `.` and `_` stay, as artifact names use them.
fn solr_terms(terms: &str) -> String {
    let words = terms
        .split(|c: char| c.is_whitespace() || "+&|!(){}[]^\"~*?:\\/".contains(c))
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    match words.as_slice() {
        [] | [_] => words.concat(),
        _ => format!("({}) OR a:{}", words.join(" AND "), words.join("-")),
    }
}

async fn exact(
    package_name: &str,
    version: Option<&str>,
    client: &RegistryClient<'_>,
) -> Result<ArtifactProviderPage, ArtifactError> {
    let parts = package_name.split(':').collect::<Vec<_>>();
    let valid = patterns::valid_coordinate();
    if parts.len() != 2 || parts.iter().any(|part| !valid.is_match(part)) {
        return Err(ArtifactError::new(
            "invalidInput",
            format!("packageName \"{package_name}\" is not a Maven groupId:artifactId."),
        ));
    }
    let group = parts[0];
    let name = parts[1];
    let group_path = group_path(group);
    let url = parse_url(&format!(
        "https://repo.maven.apache.org/maven2/{group_path}/{}/maven-metadata.xml",
        super::util::encode_component(name)
    ))?;
    let Some(xml) = client.text(ArtifactType::Maven, url, true).await? else {
        return Ok(ArtifactProviderPage::empty(Some(0)));
    };
    if patterns::doctype().is_match(&xml) {
        return Err(super::util::invalid(ArtifactType::Maven));
    }
    let clean = patterns::comment().replace_all(&xml, "");
    let field = |tag: &str| -> Option<String> {
        patterns::field(tag)?
            .captures(&clean)
            .and_then(|capture| capture.get(1))
            .map(|value| value.as_str().trim().to_owned())
    };
    let returned_group =
        field("groupId").ok_or_else(|| super::util::invalid(ArtifactType::Maven))?;
    let returned_name =
        field("artifactId").ok_or_else(|| super::util::invalid(ArtifactType::Maven))?;
    let mut artifact = ArtifactItem::new(
        ArtifactType::Maven,
        format!("{returned_group}:{returned_name}"),
        format!(
            "https://central.sonatype.com/artifact/{}/{}",
            super::util::encode_component(&returned_group),
            super::util::encode_component(&returned_name)
        ),
    );
    artifact.version = match version.filter(|version| *version != "latest") {
        // An exact version is one the metadata lists (Maven has no ranges
        // here: a bracketed range is not a published version).
        Some(wanted) => {
            let published = patterns::version()
                .captures_iter(&clean)
                .filter_map(|capture| capture.get(1))
                .map(|value| value.as_str().trim().to_owned())
                .collect::<Vec<_>>();
            if !published.iter().any(|version| version == wanted) {
                return Err(super::npm::version_not_found(
                    &artifact.name,
                    wanted,
                    &published,
                ));
            }
            Some(wanted.to_owned())
        }
        None => field("release").or_else(|| field("latest")),
    };
    if let Some(version) = artifact.version.clone() {
        let (pom, published_at) = futures_util::join!(
            read_pom(&group_path, name, &version, client),
            published_day(&returned_group, &returned_name, &version, client)
        );
        if let Some(pom) = pom? {
            artifact.repository = pom.repository;
            artifact.dependencies = Some(pom.dependencies);
        }
        artifact.published_at = published_at;
        // Maven names no commit; an upstream tag of this release pins the
        // lead (a `-jre`/`-android` classifier is not part of the tag).
        if let Some(repository) = artifact.repository.as_deref() {
            artifact.source_ref = super::release_ref::github_release_tag(
                repository,
                name,
                release_version(&version),
                client,
            )
            .await;
            artifact.source_tag = artifact.source_ref.is_some();
        }
    }
    Ok(ArtifactProviderPage::single(artifact))
}

/// A groupId as its repository directory (`com.google.guava` →
/// `com/google/guava`).
fn group_path(group: &str) -> String {
    group
        .split('.')
        .map(super::util::encode_component)
        .collect::<Vec<_>>()
        .join("/")
}

/// Central search names no source repository, so each discovery row reads
/// its listed version's POM (concurrently, like an exact lookup does): a
/// row on GitHub then carries the `owner`/`repo` every GitHub tool takes.
/// A POM that is missing or names no SCM leaves the row without one.
async fn discovery_repositories(artifacts: &mut [ArtifactItem], client: &RegistryClient<'_>) {
    let found = futures_util::future::join_all(artifacts.iter().map(|artifact| async move {
        let (group, name) = artifact.name.split_once(':')?;
        let version = artifact.version.as_deref()?;
        read_pom(&group_path(group), name, version, client)
            .await
            .ok()
            .flatten()?
            .repository
    }))
    .await;
    for (artifact, repository) in artifacts.iter_mut().zip(found) {
        artifact.repository = repository;
    }
}

/// The release a Maven version names without its variant classifier:
/// `33.0.0-jre` and `33.0.0-android` are both release `33.0.0`. A
/// pre-release qualifier (`2.0.0-rc1`, `1.0-SNAPSHOT`) stays.
fn release_version(version: &str) -> &str {
    version
        .rsplit_once('-')
        .filter(|(_, classifier)| matches!(*classifier, "jre" | "android"))
        .map_or(version, |(release, _)| release)
}

/// What a version's own POM declares.
struct Pom {
    /// Upstream source link: `<scm><url>`, else the project-level `<url>`.
    repository: Option<String>,
    /// Required runtime dependencies (see [`required_dependencies`]).
    dependencies: Vec<String>,
}

/// The versioned POM's facts. Enrichment is best-effort: a missing POM or
/// suspicious XML (a DOCTYPE or entity) is `None` instead of failing a
/// lookup that already resolved.
async fn read_pom(
    group_path: &str,
    name: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Result<Option<Pom>, ArtifactError> {
    let encoded_name = super::util::encode_component(name);
    let encoded_version = super::util::encode_component(version);
    let url = parse_url(&format!(
        "https://repo1.maven.org/maven2/{group_path}/{encoded_name}/{encoded_version}/{encoded_name}-{encoded_version}.pom"
    ))?;
    let Some(xml) = client.text(ArtifactType::Maven, url, true).await? else {
        return Ok(None);
    };
    if patterns::doctype().is_match(&xml) {
        return Ok(None);
    }
    let clean = patterns::comment().replace_all(&xml, "");
    let first_url = |text: &str| -> Option<String> {
        patterns::url_tag()
            .captures(text)
            .and_then(|capture| capture.get(1))
            .map(|value| value.as_str().trim().to_owned())
    };
    let scm_url = patterns::scm()
        .captures(&clean)
        .and_then(|capture| capture.get(1))
        .and_then(|block| first_url(block.as_str()));
    Ok(Some(Pom {
        repository: scm_url
            .or_else(|| first_url(&clean))
            .and_then(|value| super::util::canonical_repository(&value)),
        dependencies: required_dependencies(&clean),
    }))
}

/// The project's own `<dependencies>` as `groupId:artifactId[:version]`
/// (the version as written, absent when a parent or BOM manages it):
/// compile and runtime scope only, never `<optional>true</optional>`.
/// Managed, build-plugin, profile and reporting dependencies are not the
/// project's requirements.
fn required_dependencies(pom: &str) -> Vec<String> {
    let project = patterns::inherited_blocks().replace_all(pom, "");
    let Some(block) = patterns::dependencies()
        .captures(&project)
        .and_then(|capture| capture.get(1))
    else {
        return Vec::new();
    };
    let tag = |pattern: &regex::Regex, text: &str| {
        pattern
            .captures(text)
            .and_then(|capture| capture.get(1))
            .map(|value| value.as_str().trim().to_owned())
    };
    patterns::dependency()
        .captures_iter(block.as_str())
        .filter_map(|capture| {
            let entry = patterns::exclusions().replace_all(capture.get(1)?.as_str(), "");
            let scope = tag(patterns::scope(), &entry).unwrap_or_else(|| "compile".into());
            let optional = tag(patterns::optional(), &entry).is_some_and(|value| value == "true");
            if optional || !matches!(scope.as_str(), "compile" | "runtime") {
                return None;
            }
            let coordinate = format!(
                "{}:{}",
                tag(patterns::group_id(), &entry)?,
                tag(patterns::artifact_id(), &entry)?
            );
            Some(match tag(patterns::version(), &entry) {
                Some(version) => format!("{coordinate}:{version}"),
                None => coordinate,
            })
        })
        .collect()
}

/// The day Central received `group:name:version`, from its version search
/// (`timestamp`, epoch milliseconds). Best-effort: `None` when the search
/// fails or does not list the version.
async fn published_day(
    group: &str,
    name: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Option<String> {
    let url = endpoint(
        "https://central.sonatype.com/solrsearch/select",
        &[
            (
                "q",
                Some(format!(
                    "g:\"{group}\" AND a:\"{name}\" AND v:\"{version}\""
                )),
            ),
            ("core", Some("gav".into())),
            ("rows", Some("1".into())),
            ("wt", Some("json".into())),
        ],
    )
    .ok()?;
    let response = client
        .json(ArtifactType::Maven, url, true, None, None, JSON)
        .await
        .ok()??;
    let doc = response.pointer("/response/docs/0")?;
    (doc.get("v").and_then(serde_json::Value::as_str) == Some(version))
        .then(|| doc.get("timestamp")?.as_i64())
        .flatten()
        .map(super::util::date_from_millis)
}

#[cfg(test)]
mod tests {
    use super::super::test_http::{KnownTags, RouteHttp};
    use super::super::types::{artifact_query, test_budget};
    use super::*;
    use serde_json::json;

    const METADATA: &str = "/maven2/com/google/guava/guava/maven-metadata.xml";
    const GUAVA_METADATA: &str = concat!(
        r#"<?xml version="1.0" encoding="UTF-8"?>"#,
        "<metadata>",
        "<groupId>com.google.guava</groupId>",
        "<artifactId>guava</artifactId>",
        "<versioning><release>33.7.1-jre</release></versioning>",
        "</metadata>"
    );

    /// The guava POM path of `version`.
    fn pom_path(version: &str) -> String {
        format!("/maven2/com/google/guava/guava/{version}/guava-{version}.pom")
    }

    fn guava_query() -> ArtifactSearchQuery {
        artifact_query(
            json!({"ecosystem": ArtifactType::Maven, "packageName": "com.google.guava:guava"}),
            None,
        )
    }

    async fn exact_with(http: &RouteHttp) -> ArtifactItem {
        let b = test_budget();
        let client = RegistryClient::uncached(http, &b);
        let page = maven(&guava_query(), &ArtifactProviderState::default(), &client)
            .await
            .expect("maven exact");
        assert_eq!(page.artifacts.len(), 1);
        page.artifacts.into_iter().next().expect("one artifact")
    }

    /// The guava metadata and the latest release's POM.
    fn guava(pom: &str) -> RouteHttp {
        RouteHttp::new()
            .bytes(METADATA, GUAVA_METADATA)
            .bytes(&pom_path("33.7.1-jre"), pom)
    }

    /// Maven Central's Solr search answers HTTP 400 to whitespace-
    /// separated terms ("markdown parser"), which surfaced as an
    /// `invalidInput` row for a schema-valid query. Words are ANDed, or
    /// name the artifactId they spell hyphen-joined (Central indexes
    /// `jackson-databind` as one token, so `jackson AND databind` alone
    /// misses it); query-syntax characters split words.
    #[tokio::test]
    async fn maven_discovery_ands_terms_and_splits_query_syntax() {
        for (keywords, expected) in [
            (
                json!(["markdown parser"]),
                "(markdown AND parser) OR a:markdown-parser",
            ),
            (
                json!(["jackson", "databind"]),
                "(jackson AND databind) OR a:jackson-databind",
            ),
            (json!(["a:b (c)"]), "(a AND b AND c) OR a:a-b-c"),
            (json!(["spring-boot"]), "spring-boot"),
            (json!(["guava"]), "guava"),
        ] {
            let http = RouteHttp::always(json!({"response":{"numFound":0,"docs":[]}}));
            let b = test_budget();
            let client = RegistryClient::uncached(&http, &b);
            let query = artifact_query(
                json!({"ecosystem": ArtifactType::Maven, "keywords": keywords}),
                None,
            );
            maven(&query, &ArtifactProviderState::default(), &client)
                .await
                .expect("maven search");
            let q = http.seen()[0]
                .url
                .query_pairs()
                .find(|(key, _)| key == "q")
                .map(|(_, value)| value.into_owned());
            assert_eq!(q.as_deref(), Some(expected), "{keywords}");
        }
    }

    #[tokio::test]
    async fn maven_exact_maps_scm_url_from_pom() {
        let pom = concat!(
            "<project>",
            "<url>https://guava.dev</url>",
            "<scm><connection>scm:git:git://github.com/google/guava.git</connection>",
            "<url>https://github.com/google/guava.git</url></scm>",
            "</project>"
        );
        let item = exact_with(&guava(pom)).await;
        assert_eq!(item.version.as_deref(), Some("33.7.1-jre"));
        assert_eq!(
            item.repository.as_deref(),
            Some("https://github.com/google/guava")
        );
    }

    #[tokio::test]
    async fn maven_exact_falls_back_to_project_url_without_scm() {
        // Live guava POMs carry no <scm> in the artifact POM (it lives in the
        // parent); the project-level <url> is the upstream link.
        let pom = concat!(
            "<project>",
            "<artifactId>guava</artifactId>",
            "<url>https://github.com/google/guava</url>",
            "</project>"
        );
        let item = exact_with(&guava(pom)).await;
        assert_eq!(
            item.repository.as_deref(),
            Some("https://github.com/google/guava")
        );
    }

    /// Without the POM nothing it declares is known: no repository and no
    /// dependency list (absent, not empty).
    #[tokio::test]
    async fn maven_exact_survives_missing_pom() {
        let item = exact_with(&RouteHttp::new().bytes(METADATA, GUAVA_METADATA)).await;
        assert_eq!(item.version.as_deref(), Some("33.7.1-jre"));
        assert_eq!(item.repository, None);
        assert_eq!(item.dependencies, None);
        assert_eq!(item.published_at, None);
    }

    /// An exact row lists the POM's required runtime dependencies as
    /// declared (`groupId:artifactId[:version]`): compile and runtime scope,
    /// never optional, test, provided or managed ones, nor a dependency's
    /// exclusions. Its release day is the one Central's version search
    /// records; a POM without dependencies declares none.
    #[tokio::test]
    async fn maven_exact_lists_required_dependencies_and_the_release_day() {
        let pom = r#"<project>
            <parent><groupId>com.google.guava</groupId><artifactId>guava-parent</artifactId><version>33.7.1-jre</version></parent>
            <dependencyManagement><dependencies>
              <dependency><groupId>managed</groupId><artifactId>only</artifactId><version>1</version></dependency>
            </dependencies></dependencyManagement>
            <dependencies>
              <dependency><groupId>com.google.guava</groupId><artifactId>failureaccess</artifactId><version>1.0.2</version>
                <exclusions><exclusion><groupId>x</groupId><artifactId>excluded</artifactId></exclusion></exclusions>
              </dependency>
              <dependency><groupId>com.google.code.findbugs</groupId><artifactId>jsr305</artifactId></dependency>
              <dependency><groupId>org.runtime</groupId><artifactId>rt</artifactId><version>2</version><scope>runtime</scope></dependency>
              <dependency><groupId>org.opt</groupId><artifactId>opt</artifactId><version>3</version><optional>true</optional></dependency>
              <dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4</version><scope>test</scope></dependency>
              <dependency><groupId>javax</groupId><artifactId>servlet</artifactId><scope>provided</scope></dependency>
              <!-- <dependency><groupId>commented</groupId><artifactId>out</artifactId></dependency> -->
            </dependencies>
            <build><plugins><plugin><dependencies>
              <dependency><groupId>plugin</groupId><artifactId>dep</artifactId></dependency>
            </dependencies></plugin></plugins></build>
        </project>"#;
        let http = guava(pom).json(
            "/solrsearch/select",
            json!({"response": {"docs": [{"v": "33.7.1-jre", "timestamp": 1_734_386_196_686_i64}]}}),
        );
        let item = exact_with(&http).await;
        assert_eq!(
            item.dependencies,
            Some(vec![
                "com.google.guava:failureaccess:1.0.2".to_owned(),
                "com.google.code.findbugs:jsr305".to_owned(),
                "org.runtime:rt:2".to_owned(),
            ])
        );
        assert_eq!(item.published_at.as_deref(), Some("2024-12-16"));
        let version = http
            .seen()
            .into_iter()
            .find(|seen| seen.url.path() == "/solrsearch/select")
            .and_then(|seen| {
                seen.url
                    .query_pairs()
                    .find(|(key, _)| key == "q")
                    .map(|(_, value)| value.into_owned())
            });
        assert_eq!(
            version.as_deref(),
            Some(r#"g:"com.google.guava" AND a:"guava" AND v:"33.7.1-jre""#)
        );

        let bare = exact_with(&guava(
            "<project><url>https://github.com/google/guava</url></project>",
        ))
        .await;
        assert_eq!(bare.dependencies, Some(Vec::new()));
        // A search row for another version is not this release's day.
        let other = guava("<project/>").json(
            "/solrsearch/select",
            json!({"response": {"docs": [{"v": "1.0", "timestamp": 1_734_386_196_686_i64}]}}),
        );
        assert_eq!(exact_with(&other).await.published_at, None);
    }

    #[tokio::test]
    async fn maven_parses_exact_xml_lookup() {
        let xml = concat!(
            r#"<?xml version="1.0" encoding="UTF-8"?>"#,
            "<metadata>",
            "<groupId>com.fasterxml.jackson.core</groupId>",
            "<artifactId>jackson-databind</artifactId>",
            "<versioning><release>2.15.2</release></versioning>",
            "</metadata>"
        );
        let http = RouteHttp::new().bytes(
            "/maven2/com/fasterxml/jackson/core/jackson-databind/maven-metadata.xml",
            xml,
        );
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let q = artifact_query(
            json!({"ecosystem": ArtifactType::Maven, "packageName": "com.fasterxml.jackson.core:jackson-databind"}),
            None,
        );
        let page = maven(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect("maven exact");
        assert_eq!(page.artifacts.len(), 1);
        let item = &page.artifacts[0];
        assert_eq!(item.name, "com.fasterxml.jackson.core:jackson-databind");
        assert_eq!(item.version.as_deref(), Some("2.15.2"));
        assert_eq!(
            item.registry_url,
            "https://central.sonatype.com/artifact/com.fasterxml.jackson.core/jackson-databind"
        );
    }

    /// An exact Maven version reads that version's POM and pins the
    /// upstream tag without the `-jre` classifier; an unlisted version is
    /// `versionNotFound` with the nearest published versions.
    #[tokio::test]
    async fn maven_exact_version_reads_that_release_and_its_tag() {
        let metadata = concat!(
            "<metadata><groupId>com.google.guava</groupId><artifactId>guava</artifactId>",
            "<versioning><release>33.7.1-jre</release><versions>",
            "<version>32.1.3-jre</version><version>33.0.0-jre</version><version>33.7.1-jre</version>",
            "</versions></versioning></metadata>"
        );
        let pom = "<project><url>https://github.com/google/guava</url></project>";
        let query = |version: &str| {
            artifact_query(
                json!({"ecosystem": ArtifactType::Maven,
                    "packageName": "com.google.guava:guava", "version": version}),
                None,
            )
        };
        let http = RouteHttp::new()
            .bytes(METADATA, metadata)
            .bytes(&pom_path("33.0.0-jre"), pom);
        let b = test_budget();
        let tags = KnownTags::new(vec!["google/guava@v33.0.0"]);
        let client = RegistryClient {
            http: &http,
            budget: &b,
            cache: None,
            tags: Some(&tags),
        };
        let page = maven(
            &query("33.0.0-jre"),
            &ArtifactProviderState::default(),
            &client,
        )
        .await
        .expect("exact version");
        let item = &page.artifacts[0];
        assert_eq!(item.version.as_deref(), Some("33.0.0-jre"));
        assert_eq!(item.source_ref.as_deref(), Some("v33.0.0"));
        assert!(item.source_tag);

        let error = maven(
            &query("33.0.1-jre"),
            &ArtifactProviderState::default(),
            &client,
        )
        .await
        .expect_err("unlisted version");
        assert_eq!(error.code, "versionNotFound");
        assert!(
            error.nearest.iter().any(|version| version == "33.0.0-jre"),
            "{error:?}"
        );
        assert_eq!(release_version("33.0.0-android"), "33.0.0");
        assert_eq!(release_version("2.0.0-rc1"), "2.0.0-rc1");
    }

    /// A coordinate that is not `groupId:artifactId` is rejected before any
    /// request, naming the field.
    #[tokio::test]
    async fn maven_rejects_invalid_coordinate() {
        let http = RouteHttp::new();
        let b = test_budget();
        let client = RegistryClient::uncached(&http, &b);
        let q = artifact_query(
            json!({"ecosystem": ArtifactType::Maven, "packageName": "not-a-maven-coordinate"}),
            None,
        );
        let err = maven(&q, &ArtifactProviderState::default(), &client)
            .await
            .expect_err("invalid maven coordinate");
        assert_eq!(err.code, "invalidInput");
        assert!(err.message.starts_with("packageName "), "{err:?}");
        assert!(http.seen().is_empty());
    }
}

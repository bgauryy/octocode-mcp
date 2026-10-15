//! Release refs for registries whose metadata names no commit. Each is a
//! lead source only: any failure leaves the lookup without a release ref.
use super::ArtifactType;
use super::http::RegistryClient;
use super::util::{commit_sha, encode_component, github_repo_dir, github_slug, parse_url, string};
use serde_json::Value;
use std::io::Read;

/// Decompressed bytes read while looking for one archive entry.
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
/// Largest entry (the wanted file or a GNU long name) held in memory; a
/// `.cargo_vcs_info.json` is a few hundred bytes.
const MAX_ENTRY_BYTES: u64 = 64 * 1024;

/// The commit cargo recorded when it packaged `name@version`
/// (`.cargo_vcs_info.json` inside the `.crate` archive) and the crate's
/// directory inside its repository (`path_in_vcs`, empty at the root).
pub(crate) async fn crate_vcs(
    name: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Option<(String, Option<String>)> {
    // A published crate never changes: its VCS info (or its absence) is
    // read from the archive once.
    let resource = format!("crates:{name}@{version}:vcs");
    let info = match client.fact(&resource) {
        Some(info) => info,
        None => {
            let info = archive_vcs_info(name, version, client).await?;
            client.remember_fact(&resource, &info);
            info
        }
    };
    let sha = commit_sha(info.pointer("/git/sha1"))?;
    Some((sha, string(info.get("path_in_vcs"))))
}

/// `.cargo_vcs_info.json` of `name@version` (`{}` when the archive has
/// none); `None` when the archive cannot be read.
async fn archive_vcs_info(name: &str, version: &str, client: &RegistryClient<'_>) -> Option<Value> {
    let url = parse_url(&format!(
        "https://static.crates.io/crates/{name}/{name}-{version}.crate",
        name = encode_component(name),
        version = encode_component(version),
    ))
    .ok()?;
    let archive = client
        .bytes(ArtifactType::Crates, url)
        .await
        .ok()
        .flatten()?;
    Some(
        archive_entry(&archive, &format!("{name}-{version}/.cargo_vcs_info.json"))
            .and_then(|info| serde_json::from_slice(&info).ok())
            .unwrap_or_else(|| Value::Object(serde_json::Map::new())),
    )
}

/// One file's bytes from a gzip-compressed tar archive (POSIX ustar names
/// with prefixes, GNU long names).
fn archive_entry(archive: &[u8], wanted: &str) -> Option<Vec<u8>> {
    let mut tar = flate2::read::GzDecoder::new(archive).take(MAX_ARCHIVE_BYTES);
    let mut long_name: Option<String> = None;
    loop {
        let mut header = [0u8; 512];
        tar.read_exact(&mut header).ok()?;
        if header.iter().all(|byte| *byte == 0) {
            return None;
        }
        let field = |range: std::ops::Range<usize>| {
            let bytes = &header[range];
            let end = bytes
                .iter()
                .position(|byte| *byte == 0)
                .unwrap_or(bytes.len());
            String::from_utf8_lossy(&bytes[..end]).into_owned()
        };
        let size = u64::from_str_radix(field(124..136).trim(), 8).ok()?;
        let kind = header[156];
        let name = long_name.take().unwrap_or_else(|| {
            let prefix = field(345..500);
            let name = field(0..100);
            if &header[257..263] == b"ustar\0" && !prefix.is_empty() {
                format!("{prefix}/{name}")
            } else {
                name
            }
        });
        let mut body = Vec::new();
        let padded = size.div_ceil(512) * 512;
        let wanted_body = kind == b'L' || (name == wanted && matches!(kind, b'0' | 0));
        if wanted_body && size > MAX_ENTRY_BYTES {
            return None;
        }
        if wanted_body {
            (&mut tar).take(size).read_to_end(&mut body).ok()?;
            std::io::copy(&mut (&mut tar).take(padded - size), &mut std::io::sink()).ok()?;
        } else {
            std::io::copy(&mut (&mut tar).take(padded), &mut std::io::sink()).ok()?;
        }
        match kind {
            b'L' => {
                let end = body
                    .iter()
                    .position(|byte| *byte == 0)
                    .unwrap_or(body.len());
                long_name = Some(String::from_utf8_lossy(&body[..end]).into_owned());
            }
            _ if wanted_body => return Some(body),
            _ => {}
        }
    }
}

/// A pending release-tag check.
pub type TagFuture<'a> = std::pin::Pin<Box<dyn std::future::Future<Output = Option<bool>> + 'a>>;

/// Checks that a ref (a tag or a commit SHA) exists in a GitHub repository,
/// through the configured GitHub API (its URL, the caller's credential and
/// request budget).
pub trait ReleaseTags: Send + Sync {
    /// `Some(true)` when `tag` names a commit of `owner/repo`, `Some(false)`
    /// when the repository has no such ref, `None` when the check failed.
    fn exists<'a>(&'a self, owner: &'a str, repo: &'a str, tag: &'a str) -> TagFuture<'a>;
}

/// The release tag of `version` in a GitHub repository, when one exists
/// upstream: `v<version>`, `<version>`, then the shapes a monorepo uses for
/// one package's releases ([`tag_candidates`]). Without a GitHub check, or
/// when the check fails (rate limit, missing repository), there is no tag.
pub(crate) async fn github_release_tag(
    repository: &str,
    package: &str,
    version: &str,
    client: &RegistryClient<'_>,
) -> Option<String> {
    let tags = client.tags?;
    let (owner, repo) = github_slug(repository)?;
    let directory = github_repo_dir(repository);
    for tag in tag_candidates(&repo, package, directory.as_deref(), version) {
        if tags.exists(&owner, &repo, &tag).await? {
            return Some(tag);
        }
    }
    None
}

/// Tags a package's release may carry, most common first: `v<version>` and
/// `<version>`, then `<stem>-v<version>` and `<stem>@<version>` for each name
/// the package goes by inside its repository: the package name (scoped or
/// not), its directory, and either without the repository name's prefix
/// (`pydantic_core` in `pydantic` is tagged `core-v2.50.1`). A package that
/// is its repository, with no directory of its own, is tagged without a stem.
fn tag_candidates(
    repo: &str,
    package: &str,
    directory: Option<&str>,
    version: &str,
) -> Vec<String> {
    let mut tags = vec![format!("v{version}"), version.to_owned()];
    for stem in tag_stems(repo, package, directory) {
        for tag in [format!("{stem}-v{version}"), format!("{stem}@{version}")] {
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags
}

fn tag_stems(repo: &str, package: &str, directory: Option<&str>) -> Vec<String> {
    let key = |name: &str| name.to_ascii_lowercase().replace('_', "-");
    let repo_key = key(repo);
    let unscoped = package.rsplit('/').next().unwrap_or(package);
    let directory = directory
        .and_then(|directory| directory.rsplit('/').next())
        .filter(|leaf| !leaf.is_empty());
    if directory.is_none() && key(unscoped) == repo_key {
        return Vec::new();
    }
    let without_repo = |name: &str| {
        key(name)
            .strip_prefix(&repo_key)
            .and_then(|rest| rest.strip_prefix('-'))
            .filter(|rest| !rest.is_empty())
            .map(str::to_owned)
    };
    let mut stems: Vec<String> = Vec::new();
    for stem in [
        Some(package.to_owned()),
        Some(unscoped.to_owned()),
        directory.map(str::to_owned),
        Some(key(unscoped)),
        without_repo(unscoped),
        directory.and_then(without_repo),
    ]
    .into_iter()
    .flatten()
    {
        if !stem.is_empty() && !stems.contains(&stem) {
            stems.push(stem);
        }
    }
    stems
}

/// Whether GitHub says `repository` has no commit `reference`: `false` when
/// it has one, when the repository is not on GitHub, or when no check could
/// run (no GitHub access, rate limit), so only a definite answer drops a ref.
pub(crate) async fn github_ref_missing(
    repository: &str,
    reference: &str,
    client: &RegistryClient<'_>,
) -> bool {
    let (Some(tags), Some((owner, repo))) = (client.tags, github_slug(repository)) else {
        return false;
    };
    tags.exists(&owner, &repo, reference).await == Some(false)
}

#[cfg(test)]
fn test_header(name: &str, size: usize, kind: u8) -> [u8; 512] {
    let mut header = [0u8; 512];
    let bytes = name.as_bytes();
    header[..bytes.len().min(100)].copy_from_slice(&bytes[..bytes.len().min(100)]);
    header[124..135].copy_from_slice(format!("{size:011o}").as_bytes());
    header[156] = kind;
    header[257..262].copy_from_slice(b"ustar");
    header
}

/// A gzip-compressed ustar archive of `(name, body, typeflag)` entries.
#[cfg(test)]
pub(crate) fn test_archive(entries: &[(&str, &[u8], u8)]) -> Vec<u8> {
    let mut tar = Vec::new();
    for (name, body, kind) in entries {
        tar.extend_from_slice(&test_header(name, body.len(), *kind));
        tar.extend_from_slice(body);
        tar.resize(tar.len().div_ceil(512) * 512, 0);
    }
    tar.extend_from_slice(&[0u8; 1024]);
    use std::io::Write;
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    gz.write_all(&tar).expect("gzip");
    gz.finish().expect("gzip")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_monorepo_package_is_tagged_by_the_names_it_goes_by() {
        // pydantic-core is released from pydantic/pydantic as `core-v<version>`.
        let tags = tag_candidates("pydantic", "pydantic_core", Some("pydantic-core"), "2.50.1");
        assert_eq!(&tags[..2], ["v2.50.1", "2.50.1"]);
        assert!(tags.contains(&"core-v2.50.1".to_owned()), "{tags:?}");
        assert!(
            tags.contains(&"pydantic-core-v2.50.1".to_owned()),
            "{tags:?}"
        );
        // A scoped package keeps its scope in the `@` form changesets writes.
        let tags = tag_candidates("changesets", "@changesets/cli", None, "2.29.0");
        assert!(
            tags.contains(&"@changesets/cli@2.29.0".to_owned()),
            "{tags:?}"
        );
        assert!(tags.contains(&"cli@2.29.0".to_owned()), "{tags:?}");
        // A package that is its repository takes only the plain tags.
        assert_eq!(
            tag_candidates("requests", "requests", None, "2.32.3"),
            ["v2.32.3", "2.32.3"]
        );
        assert_eq!(
            tag_candidates("serde_json", "serde-json", None, "1.0.1"),
            ["v1.0.1", "1.0.1"]
        );
    }

    #[test]
    fn reads_the_vcs_info_entry_wherever_it_sits() {
        let info =
            br#"{"git":{"sha1":"EA6D652A102DEE3F22B490DB70545B7F66A23FB7"},"path_in_vcs":"tokio"}"#;
        let first = test_archive(&[
            ("tokio-1.40.0/.cargo_vcs_info.json", info, b'0'),
            ("tokio-1.40.0/Cargo.toml", b"[package]", b'0'),
        ]);
        let last = test_archive(&[
            ("tokio-1.40.0/Cargo.toml", &[b'x'; 700], b'0'),
            ("tokio-1.40.0/.cargo_vcs_info.json", info, b'0'),
        ]);
        for bytes in [first, last] {
            assert_eq!(
                archive_entry(&bytes, "tokio-1.40.0/.cargo_vcs_info.json").as_deref(),
                Some(&info[..])
            );
        }
        // A GNU long name names the entry that follows it.
        let long = "x".repeat(120);
        let wanted = format!("{long}/.cargo_vcs_info.json");
        let bytes = test_archive(&[
            ("././@LongLink", format!("{wanted}\0").as_bytes(), b'L'),
            ("truncated", info, b'0'),
        ]);
        assert_eq!(archive_entry(&bytes, &wanted).as_deref(), Some(&info[..]));
        assert_eq!(archive_entry(&bytes, "absent"), None);
        assert_eq!(archive_entry(b"not gzip", "absent"), None);
    }

    #[test]
    fn an_oversized_wanted_or_long_name_entry_is_never_buffered() {
        let big = vec![b'x'; MAX_ENTRY_BYTES as usize + 1];
        let bytes = test_archive(&[("c-1/.cargo_vcs_info.json", &big, b'0')]);
        assert_eq!(archive_entry(&bytes, "c-1/.cargo_vcs_info.json"), None);
        let bytes = test_archive(&[("././@LongLink", &big, b'L'), ("x", b"{}", b'0')]);
        assert_eq!(archive_entry(&bytes, "x"), None);
    }

    /// A published crate's VCS info is read from its archive once.
    #[tokio::test]
    async fn crate_vcs_info_is_downloaded_once() {
        let name = "vcs-once";
        let info =
            br#"{"git":{"sha1":"b6a77c4413f902523646be0d7f5520631df53ff6"},"path_in_vcs":"x"}"#;
        let entry = format!("{name}-1.0.0/.cargo_vcs_info.json");
        let http = super::super::test_http::SequenceHttp::new(vec![test_archive(&[(
            entry.as_str(),
            &info[..],
            b'0',
        )])]);
        let budget = super::super::types::test_budget();
        let cache = super::super::ArtifactCache::new(None);
        let client = RegistryClient {
            http: &http,
            budget: &budget,
            cache: Some(&cache),
            tags: None,
        };
        let expected = Some((
            "b6a77c4413f902523646be0d7f5520631df53ff6".to_owned(),
            Some("x".to_owned()),
        ));
        assert_eq!(crate_vcs(name, "1.0.0", &client).await, expected);
        assert_eq!(crate_vcs(name, "1.0.0", &client).await, expected);
        assert_eq!(http.calls(), 1);
    }
}

use super::{ArtifactError, ArtifactType};
use serde_json::{Map, Value};
use url::Url;

pub(crate) fn object_for(
    value: &Value,
    artifact_type: ArtifactType,
) -> Result<&Map<String, Value>, ArtifactError> {
    value.as_object().ok_or_else(|| invalid(artifact_type))
}

pub(crate) fn rows(
    value: &Value,
    artifact_type: ArtifactType,
) -> Result<&Vec<Value>, ArtifactError> {
    value.as_array().ok_or_else(|| invalid(artifact_type))
}

pub(crate) fn string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// A registry-recorded git commit (7–40 hex digits), lowercased.
pub(crate) fn commit_sha(value: Option<&Value>) -> Option<String> {
    string(value)
        .filter(|sha| (7..=40).contains(&sha.len()) && sha.bytes().all(|b| b.is_ascii_hexdigit()))
        .map(|sha| sha.to_ascii_lowercase())
}

pub(crate) fn required(
    value: Option<&Value>,
    artifact_type: ArtifactType,
) -> Result<String, ArtifactError> {
    string(value).ok_or_else(|| invalid(artifact_type))
}

pub(crate) fn total(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_str()?.parse::<u64>().ok())
    })
}

pub(crate) fn safe_url(value: Option<&Value>) -> Option<String> {
    let value = string(value)?;
    let cleaned = value.strip_prefix("git+").unwrap_or(&value);
    let url = Url::parse(cleaned).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    Some(url.into())
}

/// The one repository-link normalizer every registry's `repository` passes:
/// the link as a canonical `https://host/path` without `git+`, a trailing
/// `/` or `.git`. It reads `git+https://…`, scp (`git@host:o/r.git`),
/// `ssh://`/`git://`, Maven `scm:git:…`, and npm's `github:`/`gitlab:`/
/// `bitbucket:` and `owner/repo` shorthands. A link with credentials or
/// another scheme is no repository.
pub(crate) fn repository_url(value: Option<&Value>) -> Option<String> {
    canonical_repository(&string(value)?)
}

/// [`repository_url`] of one link text.
pub(crate) fn canonical_repository(link: &str) -> Option<String> {
    let link = link.trim();
    let link = link.strip_prefix("git+").unwrap_or(link);
    // `scm:git:<url>` (Maven SCM): the provider tag before the link.
    let link = link.strip_prefix("scm:").map_or(link, |rest| {
        rest.split_once(':').map_or(rest, |(_, tail)| tail)
    });
    let lower = link.to_ascii_lowercase();
    let shorthand = [
        ("github:", "github.com"),
        ("gitlab:", "gitlab.com"),
        ("bitbucket:", "bitbucket.org"),
    ]
    .into_iter()
    .find(|(prefix, _)| lower.starts_with(prefix));
    let https = if let Some((prefix, host)) = shorthand {
        format!("https://{host}/{}", &link[prefix.len()..])
    } else if let Some((scheme, rest)) = link.split_once("://") {
        match scheme.to_ascii_lowercase().as_str() {
            "http" | "https" => link.to_owned(),
            // `ssh://git@host[:port]/o/r`: the host serves the same
            // repository over HTTPS; user and port are transport details.
            "ssh" | "git" => {
                let rest = rest.split_once('@').map_or(rest, |(_, tail)| tail);
                let (authority, path) = rest.split_once('/')?;
                let host = authority
                    .split_once(':')
                    .map_or(authority, |(host, _)| host);
                format!("https://{host}/{path}")
            }
            _ => return None,
        }
    } else if let Some((user_host, path)) = link.split_once(':')
        && let Some((_, host)) = user_host.split_once('@')
    {
        // scp form `git@host:o/r.git`.
        format!("https://{host}/{path}")
    } else {
        let first = link.split('/').next().unwrap_or_default();
        match link.matches('/').count() {
            // npm `owner/repo` is a GitHub repository.
            1 if !first.contains('.') && !link.contains(':') => {
                format!("https://github.com/{link}")
            }
            // `host.tld/o/r` without a scheme.
            count if count >= 2 && first.contains('.') => format!("https://{link}"),
            _ => return None,
        }
    };
    let url = Url::parse(&https).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none_or(str::is_empty)
    {
        return None;
    }
    let text: String = url.into();
    let text = text.trim_end_matches('/');
    let text = text.strip_suffix(".git").unwrap_or(text);
    Some(text.trim_end_matches('/').to_owned())
}

/// `https://github.com/<owner>/<repo>` of a link into a GitHub repository
/// (a homepage or module path that names one), the repository a registry
/// row without its own `repository` still points at.
pub(crate) fn github_repository(link: &str) -> Option<String> {
    github_slug(link).map(|(owner, repo)| format!("https://github.com/{owner}/{repo}"))
}

pub(crate) fn license(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Array(values) => {
            let joined = values
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" OR ");
            (!joined.is_empty()).then_some(joined)
        }
        value => string(Some(value)),
    }
}

pub(crate) fn endpoint(
    base: &str,
    params: &[(&str, Option<String>)],
) -> Result<Url, ArtifactError> {
    let mut url = parse_url(base)?;
    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in params {
            if let Some(value) = value {
                pairs.append_pair(key, value);
            }
        }
    }
    Ok(url)
}

pub(crate) fn parse_url(value: &str) -> Result<Url, ArtifactError> {
    Url::parse(value).map_err(|_| {
        ArtifactError::new(
            "providerError",
            "Artifact registry endpoint could not be constructed.",
        )
    })
}

pub(crate) fn encode_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(char::from(*byte));
        } else {
            use std::fmt::Write;
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

pub(crate) fn coordinate_path(value: &str) -> String {
    value
        .split('/')
        .map(encode_component)
        .collect::<Vec<_>>()
        .join("/")
}

pub(crate) fn invalid(artifact_type: ArtifactType) -> ArtifactError {
    ArtifactError::new(
        "providerError",
        format!(
            "{} returned an invalid registry response.",
            artifact_type.as_str()
        ),
    )
}

/// `YYYY-MM-DD` (UTC) of a Unix timestamp in milliseconds.
pub(crate) fn date_from_millis(millis: i64) -> String {
    let (year, month, day) = crate::civil_date::civil_from_days(millis.div_euclid(86_400_000));
    format!("{year:04}-{month:02}-{day:02}")
}

/// The `YYYY-MM-DD` prefix of an RFC 3339 / ISO 8601 timestamp.
pub(crate) fn date_prefix(value: Option<&Value>) -> Option<String> {
    let value = string(value)?;
    let date = value.get(..10)?;
    (date.as_bytes()[4] == b'-' && date.as_bytes()[7] == b'-').then(|| date.to_owned())
}

/// `(owner, repo)` of a link into a GitHub repository, in any form
/// [`canonical_repository`] reads (`https://github.com/o/r`,
/// `git+https://github.com/o/r.git`, `git@github.com:o/r`, `github:o/r`,
/// `github.com/o/r/tree/…`, a file or tree page).
/// `None` for another host and for an account-level page such as
/// `github.com/sponsors/<user>`.
pub(crate) fn github_slug(link: &str) -> Option<(String, String)> {
    let url = Url::parse(&canonical_repository(link)?).ok()?;
    if !url
        .host_str()
        .is_some_and(|host| matches!(host, "github.com" | "www.github.com"))
    {
        return None;
    }
    let mut segments = url.path_segments()?.filter(|part| !part.is_empty());
    let owner = segments.next()?;
    let repo = segments.next()?.trim_end_matches(".git");
    (!repo.is_empty() && !matches!(owner, "sponsors" | "orgs" | "users" | "apps"))
        .then(|| (owner.to_owned(), repo.to_owned()))
}

/// Monorepo subdirectory from a `/tree/<ref>/<dir>` or `/blob/<ref>/<file>`
/// repository URL. The ref is dropped: refs may contain slashes, and URL refs
/// are often stale; only viewReleaseSource pins the registry's source ref.
pub(crate) fn github_repo_dir(url: &str) -> Option<String> {
    let rest = url.split_once("github.com/")?.1;
    let rest = rest.split(['#', '?']).next()?;
    let mut parts = rest.split('/').filter(|part| !part.is_empty());
    let (_owner, _repo, kind, _ref) = (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    let mut segments: Vec<&str> = parts.collect();
    match kind {
        "tree" => {}
        "blob" => {
            segments.pop();
        }
        _ => return None,
    }
    (!segments.is_empty()).then(|| segments.join("/"))
}

/// The ref of a `/tree/<ref>` or `/blob/<ref>` repository URL when it names
/// `version`'s release (`v8.1.4` for 8.1.4) and nothing after it: a branch
/// or a monorepo directory URL is not release evidence.
pub(crate) fn release_ref_in(url: &str, version: &str) -> Option<String> {
    let rest = url.split_once("github.com/")?.1;
    let rest = rest.split(['#', '?']).next()?;
    let mut parts = rest.split('/').filter(|part| !part.is_empty());
    let (_owner, _repo, kind, reference) =
        (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    let tagged = !version.is_empty()
        && reference
            .strip_suffix(version)
            .is_some_and(|prefix| prefix.is_empty() || prefix.ends_with(['v', '-', '/', '@']));
    (matches!(kind, "tree" | "blob") && parts.next().is_none() && tagged)
        .then(|| reference.to_owned())
}

#[cfg(test)]
mod github_slug_tests {
    use super::github_slug;

    #[test]
    fn github_slugs_come_only_from_repository_links() {
        let slug = |owner: &str, repo: &str| Some((owner.to_owned(), repo.to_owned()));
        for (link, expected) in [
            ("https://github.com/o/r", slug("o", "r")),
            ("git+https://github.com/o/r.git", slug("o", "r")),
            ("git@github.com:o/r.git", slug("o", "r")),
            ("ssh://git@github.com/o/r.git", slug("o", "r")),
            (
                "https://github.com/o/r/tree/main/packages/x",
                slug("o", "r"),
            ),
            ("https://github.com/o/r.git/tree/main", slug("o", "r")),
            ("github.com/o/r#readme", slug("o", "r")),
            ("https://www.GitHub.com/o/r?tab=readme", slug("o", "r")),
            (
                "https://github.com/Textualize/rich/blob/master/CHANGELOG.md",
                slug("Textualize", "rich"),
            ),
            ("https://github.com/sponsors/hynek", None),
            ("https://github.com/orgs/o/r", None),
            ("https://github.com/hynek", None),
            ("https://github.com/o", None),
            ("https://gitlab.com/o/r", None),
            ("https://gist.github.com/o/r", None),
            ("https://notgithub.com/o/r", None),
        ] {
            assert_eq!(github_slug(link), expected, "{link}");
        }
    }
}

#[cfg(test)]
mod repository_tests {
    use super::{canonical_repository, github_slug};

    /// Every registry link form normalizes to one canonical URL, and that
    /// URL names the same owner/repo the GitHub tools take.
    #[test]
    fn every_repository_link_form_is_one_canonical_url() {
        for (input, expected) in [
            (
                "github:octokit/rest.js",
                Some("https://github.com/octokit/rest.js"),
            ),
            (
                "git+https://github.com/a/b.git",
                Some("https://github.com/a/b"),
            ),
            ("git@github.com:a/b.git", Some("https://github.com/a/b")),
            (
                "ssh://git@github.com/a/b.git",
                Some("https://github.com/a/b"),
            ),
            (
                "ssh://git@github.com:22/a/b",
                Some("https://github.com/a/b"),
            ),
            ("git://github.com/a/b.git", Some("https://github.com/a/b")),
            (
                "scm:git:git@github.com:a/b.git",
                Some("https://github.com/a/b"),
            ),
            (
                "scm:git:https://github.com/a/b",
                Some("https://github.com/a/b"),
            ),
            ("https://github.com/a/b/", Some("https://github.com/a/b")),
            (
                "https://github.com/a/b.git/",
                Some("https://github.com/a/b"),
            ),
            ("a/b", Some("https://github.com/a/b")),
            ("github.com/a/b", Some("https://github.com/a/b")),
            (
                "https://github.com/rails/rails/tree/v8.1.4",
                Some("https://github.com/rails/rails/tree/v8.1.4"),
            ),
            ("https://gitlab.com/g/x", Some("https://gitlab.com/g/x")),
            ("https://user:secret@github.com/a/b", None),
            ("ftp://github.com/a/b", None),
            ("", None),
            ("not a link", None),
        ] {
            assert_eq!(canonical_repository(input).as_deref(), expected, "{input}");
            if let Some(expected) = expected.filter(|url| url.contains("github.com/a/b")) {
                assert_eq!(
                    github_slug(expected),
                    Some(("a".to_owned(), "b".to_owned()))
                );
            }
        }
    }
}

#[cfg(test)]
mod date_tests {
    use super::*;

    #[test]
    fn dates_from_millis_and_timestamps() {
        assert_eq!(date_from_millis(1_789_341_914_484), "2026-09-13");
        assert_eq!(
            date_prefix(Some(&Value::from("2019-09-08T01:56:06.955881Z"))).as_deref(),
            Some("2019-09-08")
        );
        assert_eq!(date_prefix(Some(&Value::from("soon"))), None);
    }
}

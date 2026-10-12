//! Commit facts every GitHub history tool reads the same way: who made a
//! commit, which pull request a squash-merge headline names, and a history
//! date in UTC.
use serde_json::{Value, json};

/// A commit person as one string: the GitHub login, else the git name
/// (emails stay out of default rows).
pub(crate) fn person(v: &Value, kind: &str) -> Value {
    v.pointer(&format!("/{kind}/login"))
        .and_then(Value::as_str)
        .filter(|login| !login.is_empty())
        .or_else(|| {
            v.pointer(&format!("/commit/{kind}/name"))
                .and_then(Value::as_str)
        })
        .map_or(Value::Null, |name| json!(name))
}

/// The pull request a squash-merge headline ends with: `subject (#123)`.
/// Only the trailing suffix counts, so a revert names the reverting PR.
pub(crate) fn headline_pull_request(headline: &str) -> Option<u64> {
    let digits = headline.trim_end().strip_suffix(')')?.rsplit_once("(#")?.1;
    digits.parse().ok().filter(|number| *number > 0)
}

/// The pull request a commit message names, in the order of how directly it
/// says so: a squash headline's `(#123)` suffix, a merge commit's
/// `Merge pull request #123`, then a `PR-URL:` trailer that points at this
/// repository (`owner/repo`, any case). A trailer naming another repository
/// is not this repository's pull request.
pub(crate) fn commit_pull_request(message: &str, owner: &str, repo: &str) -> Option<u64> {
    let headline = message.lines().next().unwrap_or("");
    headline_pull_request(headline)
        .or_else(|| merge_pull_request(headline))
        .or_else(|| trailer_pull_request(message, owner, repo))
}

fn merge_pull_request(headline: &str) -> Option<u64> {
    let rest = headline.strip_prefix("Merge pull request #")?;
    let digits = rest.split(|c: char| !c.is_ascii_digit()).next()?;
    digits.parse().ok().filter(|number| *number > 0)
}

fn trailer_pull_request(message: &str, owner: &str, repo: &str) -> Option<u64> {
    message.lines().rev().find_map(|line| {
        let (key, url) = line.split_once(':')?;
        if !key.trim().eq_ignore_ascii_case("PR-URL") {
            return None;
        }
        let url = url.trim();
        let path = url
            .strip_prefix("https://github.com/")
            .or_else(|| url.strip_prefix("http://github.com/"))?;
        let mut parts = path.trim_end_matches('/').split('/');
        let (url_owner, url_repo, kind, number) =
            (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
        (kind == "pull"
            && parts.next().is_none()
            && url_owner.eq_ignore_ascii_case(owner)
            && url_repo.eq_ignore_ascii_case(repo))
        .then(|| number.parse().ok())
        .flatten()
        .filter(|number| *number > 0)
    })
}

/// A history date in UTC (`…Z`); text that is not a full timestamp passes
/// through, and no value is empty text.
pub(crate) fn utc_date(value: Option<&str>) -> String {
    let value = value.unwrap_or("");
    crate::providers::github::utc_timestamp(value).unwrap_or_else(|| value.to_owned())
}

/// The date a commit row shows: the committer date, the one `since` and
/// `until` filter on and history orders by; the author date only when the
/// commit carries no committer date.
pub(crate) fn commit_date(commit: &Value) -> String {
    utc_date(
        commit
            .pointer("/commit/committer/date")
            .or_else(|| commit.pointer("/commit/author/date"))
            .and_then(Value::as_str),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_commit_shows_the_date_its_range_filter_uses() {
        let rebased = json!({"commit": {
            "author": {"date": "2023-01-01T00:00:00Z"},
            "committer": {"date": "2024-06-01T00:00:00Z"}
        }});
        assert_eq!(commit_date(&rebased), "2024-06-01T00:00:00Z");
        let bare = json!({"commit": {"author": {"date": "2023-01-01T00:00:00Z"}}});
        assert_eq!(commit_date(&bare), "2023-01-01T00:00:00Z");
    }

    #[test]
    fn history_dates_are_utc() {
        assert_eq!(
            utc_date(Some("2024-01-01T02:30:00+02:00")),
            "2024-01-01T00:30:00Z"
        );
        assert_eq!(
            utc_date(Some("2024-01-01T00:00:00Z")),
            "2024-01-01T00:00:00Z"
        );
        assert_eq!(utc_date(Some("not a date")), "not a date");
        assert_eq!(utc_date(None), "");
    }

    #[test]
    fn squash_headline_names_its_pull_request() {
        assert_eq!(
            headline_pull_request("io: use `spawn_mandatory_blocking` (#8506)"),
            Some(8506)
        );
        assert_eq!(headline_pull_request("Merge branch main"), None);
        assert_eq!(headline_pull_request("fix (#abc)"), None);
        assert_eq!(headline_pull_request("revert (#12) partially"), None);
    }

    #[test]
    fn a_commit_message_names_its_pull_request_by_headline_merge_or_trailer() {
        let named = |message: &str| commit_pull_request(message, "nodejs", "node");
        assert_eq!(
            named("fix (#12)\n\nPR-URL: https://github.com/nodejs/node/pull/99"),
            Some(12)
        );
        assert_eq!(named("Merge pull request #34 from a/b\n\nbody"), Some(34));
        assert_eq!(
            named("url: fix\n\nPR-URL: https://github.com/nodejs/node/pull/65801\nReviewed-By: x"),
            Some(65801)
        );
        assert_eq!(
            named("url: fix\n\npr-url: https://github.com/NodeJS/Node/pull/7/"),
            Some(7)
        );
        // Another repository's pull request is not this one's.
        assert_eq!(
            named("x\n\nPR-URL: https://github.com/other/node/pull/5"),
            None
        );
        assert_eq!(
            named("x\n\nPR-URL: https://github.com/nodejs/node/issues/5"),
            None
        );
        assert_eq!(named("x\n\nRefs: #5"), None);
    }

    #[test]
    fn a_person_is_the_login_else_the_git_name() {
        let linked = json!({"author": {"login": "octo"}, "commit": {"author": {"name": "Ada"}}});
        assert_eq!(person(&linked, "author"), "octo");
        let unlinked = json!({"author": null, "commit": {"author": {"name": "Ada"}}});
        assert_eq!(person(&unlinked, "author"), "Ada");
        let empty_login = json!({"author": {"login": ""}, "commit": {"author": {"name": "Ada"}}});
        assert_eq!(person(&empty_login, "author"), "Ada");
        assert_eq!(person(&json!({}), "committer"), Value::Null);
    }
}

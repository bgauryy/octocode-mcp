//! ghSearchCode query syntax.
use super::GhSearchCodeQuery;
use crate::providers::github::{
    ProviderError, qualifier_value, quote_search_keyword, search_phrase,
};
use crate::tools::gh_shared::query::{push, validate_scope};

/// Owner and repository names become `repo:`/`user:` scopes; reject any value
/// that is not a GitHub name before it can rewrite the scope.
pub(super) fn validate_code_scope(query: &GhSearchCodeQuery) -> Result<(), ProviderError> {
    validate_scope(
        Some(query.owner.as_str()),
        query.repo.as_deref().map(String::as_str),
    )
}

/// The search query; `extension` narrows a multi-extension query to one of
/// them (GitHub ANDs repeated `extension:` qualifiers).
pub(super) fn code(query: &GhSearchCodeQuery, extension: Option<&str>) -> String {
    let GhSearchCodeQuery {
        keywords,
        owner,
        repo,
        path,
        extensions,
        filename,
        match_in,
        ..
    } = query;
    let mut parts: Vec<String> = keywords
        .iter()
        .map(|v| quote_search_keyword(v))
        .filter(|v| !v.is_empty())
        .collect();
    // `path` is a repository path prefix (schema contract); a dotted segment
    // such as `types/lodash.merge` is a directory, so never split it into a
    // `filename:` qualifier.
    push(&mut parts, "filename", filename.as_deref());
    match extension {
        Some(extension) => push(&mut parts, "extension", Some(extension)),
        None => {
            for extension in extensions {
                push(&mut parts, "extension", Some(extension.as_str()));
            }
        }
    }
    if let Some(path) = path.as_deref() {
        let path = if path.contains('/') || path.contains('@') {
            search_phrase(path)
        } else {
            qualifier_value(path)
        };
        if !path.is_empty() {
            parts.push(format!("path:{path}"));
        }
    }
    if let Some(repo) = repo {
        push(&mut parts, "repo", Some(&format!("{owner}/{repo}")));
    } else {
        push(&mut parts, "user", Some(owner));
    }
    push(&mut parts, "in", Some(&match_in.to_string()));
    parts.join(" ").trim().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::gh_shared::query::parse;

    #[test]
    fn dotted_directory_path_stays_a_path_prefix() {
        let q = code(
            &parse(
                serde_json::json!({"mainGoal": "test", "reasoning":"test","owner":"o","keywords":["merge"],"path":"types/lodash.merge"}),
            ),
            None,
        );
        assert!(q.contains("path:\"types/lodash.merge\""), "{q}");
        assert!(!q.contains("filename:"), "{q}");
    }

    #[test]
    fn qualifier_values_with_whitespace_are_quoted() {
        let q = code(
            &parse(
                serde_json::json!({"mainGoal": "test", "reasoning":"test","owner":"o","keywords":["x"],"path":"my dir/src","filename":"my file.txt"}),
            ),
            None,
        );
        assert!(q.contains("path:\"my dir/src\""), "{q}");
        assert!(q.contains("filename:\"my file.txt\""), "{q}");
    }

    #[test]
    fn reserved_boolean_keywords_are_quoted() {
        let q = code(
            &parse(
                serde_json::json!({"mainGoal": "test", "reasoning":"test","owner":"o","keywords":["foo","OR","bar","NOT","and"]}),
            ),
            None,
        );
        assert!(q.starts_with("foo \"OR\" bar \"NOT\" \"and\""), "{q}");
    }

    #[test]
    fn leading_quote_keyword_cannot_negate_the_repo_scope() {
        // A raw `"hello" NOT` would bind NOT to the repo: qualifier.
        let q = code(
            &parse(serde_json::json!({
                "mainGoal": "test", "reasoning":"test","owner":"octocat","repo":"Hello-World",
                "keywords":["\"hello\" NOT", "x\" OR repo:evil/x"]
            })),
            None,
        );
        assert_eq!(
            q, "\"hello NOT\" \"x OR repo:evil/x\" repo:octocat/Hello-World in:file",
            "{q}"
        );
    }

    #[test]
    fn scope_names_that_are_not_github_names_are_rejected() {
        for (owner, repo) in [("octocat OR is:public", None), ("a", Some("b\" OR x"))] {
            let mut raw = serde_json::json!({"mainGoal": "test", "reasoning":"test","owner":owner,"keywords":["x"]});
            if let Some(repo) = repo {
                raw["repo"] = serde_json::json!(repo);
            }
            let error = validate_code_scope(&parse(raw)).expect_err("rejected");
            assert_eq!(
                error.kind,
                crate::providers::github::ProviderErrorKind::Validation
            );
        }
        assert!(
            validate_code_scope(&parse(
                serde_json::json!({"mainGoal": "test", "reasoning":"test","owner":"octocat","repo":"Hello-World","keywords":["x"]})
            ))
            .is_ok()
        );
    }

    /// The contract rejects a search with nothing to bound it (owner or
    /// owner/repo alone, blank keywords); native trusts admission.
    #[test]
    fn the_contract_rejects_empty_and_unreachable_searches() {
        let admitted = |row: &str| {
            let row: serde_json::Value = serde_json::from_str(row).expect("row");
            crate::contracts::validate("ghSearchCode", serde_json::json!({"queries":[row]})).is_ok()
        };
        for raw in [
            r#"{"owner":"o"}"#,
            r#"{"owner":"o","keywords":[]}"#,
            r#"{"owner":"o","keywords":["   "]}"#,
            r#"{"owner":"o","repo":"r"}"#,
        ] {
            assert!(!admitted(raw), "{raw}");
        }
        for raw in [
            r#"{"owner":"o","keywords":["needle"]}"#,
            r#"{"owner":"o","path":"src"}"#,
            r#"{"owner":"o","extensions":["rs"]}"#,
            r#"{"owner":"o","filename":"Cargo.toml"}"#,
        ] {
            assert!(admitted(raw), "{raw}");
        }
    }
}

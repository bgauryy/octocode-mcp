//! Interpreter for the `github_code_search_runnable` and
//! `github_repo_search_runnable` opcodes.
use super::{ContractValidationError, issue};
use serde_json::Value;

/// Repository-search filters with a text value: each changes which
/// repositories match.
const REPO_SEARCH_FILTERS: [&str; 6] = [
    "language",
    "stars",
    "pushed",
    "created",
    "license",
    "qualifiers",
];

#[derive(Clone, Copy)]
pub(super) enum GithubSearchKind {
    Code,
    Repositories,
}

pub(super) fn validate_github_search_queries(
    input: &Value,
    kind: GithubSearchKind,
) -> Result<(), ContractValidationError> {
    let Some(queries) = input["queries"].as_array() else {
        return Ok(());
    };
    for (index, query) in queries.iter().enumerate() {
        let has_text = |field: &str| {
            query
                .get(field)
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
        };
        let has_terms = |field: &str| {
            query
                .get(field)
                .and_then(Value::as_array)
                .is_some_and(|values| {
                    values
                        .iter()
                        .any(|value| value.as_str().is_some_and(|text| !text.trim().is_empty()))
                })
        };
        let (runnable, message) = match kind {
            GithubSearchKind::Code => (
                has_terms("keywords")
                    || has_terms("extensions")
                    || ["path", "filename", "language"]
                        .iter()
                        .any(|field| has_text(field)),
                "ghSearchCode needs keywords or a path, extensions, filename, or language filter",
            ),
            GithubSearchKind::Repositories => (
                has_terms("keywords")
                    || has_terms("topics")
                    || has_text("owner")
                    || REPO_SEARCH_FILTERS.iter().any(|field| has_text(field))
                    || query.get("archived").is_some_and(Value::is_boolean),
                "ghSearchRepo needs keywords, topics, owner, or a filter",
            ),
        };
        // owner+repo names one repository; filters beside it search inside it.
        if matches!(kind, GithubSearchKind::Repositories) && has_text("repo") && !has_text("owner")
        {
            return Err(issue(
                "gh-search.repo-lookup",
                vec!["queries".into(), index.to_string(), "owner".into()],
                "repo needs owner: owner+repo looks up one repository".to_owned(),
            ));
        }
        if !runnable {
            return Err(issue(
                "gh-search.runnable-constraint",
                vec!["queries".into(), index.to_string(), "keywords".into()],
                message.to_owned(),
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::contracts::validate::validate;
    use serde_json::json;

    #[test]
    fn rejects_repo_scoped_code_wildcards_before_provider_io() {
        let error = validate(
            "ghSearchCode",
            json!({"queries":[{
                "owner":"octocode",
                "repo":"octocode",
                "mainGoal": "test", "reasoning":"Reject a repo-wide wildcard."
            }]}),
        )
        .expect_err("owner/repo alone is not a runnable code search");
        assert!(
            error
                .issues
                .iter()
                .any(|issue| issue.rule_id == "gh-search.runnable-constraint")
        );

        validate(
            "ghSearchCode",
            json!({"queries":[{
                "owner":"octocode",
                "repo":"octocode",
                "path":"src",
                "mainGoal": "test", "reasoning":"Run a path-bounded code search."
            }]}),
        )
        .expect("path is an explicit code-search narrowing filter");
    }

    /// owner+repo is an exact lookup that needs owner; filters beside it
    /// search inside that repository instead of failing.
    #[test]
    fn repo_lookup_needs_owner_and_filters_search_inside_it() {
        validate(
            "ghSearchRepo",
            json!({"queries":[{"owner":"sindresorhus","repo":"is"}]}),
        )
        .expect("owner+repo is an exact lookup");
        let error =
            validate("ghSearchRepo", json!({"queries":[{"repo":"is"}]})).expect_err("repo alone");
        assert!(
            error
                .issues
                .iter()
                .any(|issue| issue.message.contains("repo needs owner")),
            "{error:?}"
        );
        validate(
            "ghSearchRepo",
            json!({"queries":[{"owner":"o","repo":"r","keywords":["x"],"language":"rust"}]}),
        )
        .expect("filters beside owner+repo search inside it");
    }

    /// A malformed repository date or count names the accepted forms (the
    /// field's own note), not the regex.
    #[test]
    fn malformed_repository_ranges_name_the_accepted_forms() {
        for (field, value, form) in [
            ("pushed", "yesterday", "\"30d\""),
            ("created", "2024/01/01", "\">2025-01-01\""),
            ("stars", "lots", "\"10..50\""),
        ] {
            let error = validate(
                "ghSearchRepo",
                json!({"queries":[{"keywords":["x"], field: value}]}),
            )
            .expect_err(value);
            let message = &error.issues[0].message;
            assert!(message.contains(form), "{field}={value}: {message}");
            assert!(message.contains(value), "{field}={value}: {message}");
        }
    }

    #[test]
    fn rejects_unscoped_code_search_that_would_wildcard_all_of_github() {
        let error = validate(
            "ghSearchCode",
            json!({"queries":[{
                "keywords":["isEmptyArray"],
                "mainGoal": "test", "reasoning":"A keyword-only code search must not run globally."
            }]}),
        )
        .expect_err("code search without an owner is a global wildcard");
        // The schema requires owner.
        assert!(error.issues.iter().any(|issue| {
            issue.path.last().is_some_and(|field| field == "owner")
                && issue.rule_id == "schema.required"
        }));
        // owner alone (no repo) is a legitimate org-wide code search.
        validate(
            "ghSearchCode",
            json!({"queries":[{
                "owner":"sindresorhus",
                "keywords":["isEmptyArray"],
                "mainGoal": "test", "reasoning":"Owner-scoped code search is allowed."
            }]}),
        )
        .expect("owner-scoped code search is runnable");
    }
}

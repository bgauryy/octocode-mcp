//! Interpreter for the `artifact_registry_url` opcode: a registry URL is a
//! plain HTTP(S) URL, and a package name is no URL. The query schema's
//! branches enforce `artifact_mode` (one of packageName or keywords, version
//! and page per mode, registryUrl for npm only) before any rule runs.
use super::{ContractValidationError, issue};
use serde_json::Value;
use url::Url;

pub(super) fn validate_artifact_registry_url(input: &Value) -> Result<(), ContractValidationError> {
    let queries = input["queries"].as_array().ok_or_else(|| {
        issue(
            "schema.queries",
            vec!["queries".into()],
            "Expected queries array",
        )
    })?;
    for (index, query) in queries.iter().enumerate() {
        let prefix = vec!["queries".into(), index.to_string()];
        // A registry page or repository URL is no name any registry looks
        // up: name the fix instead of sending a request that cannot match.
        if let Some(name) = query
            .get("packageName")
            .and_then(Value::as_str)
            .filter(|name| name.contains("://"))
        {
            let shown: String = name.chars().take(80).collect();
            let mut path = prefix.clone();
            path.push("packageName".into());
            return Err(issue(
                "artifact.package-url",
                path,
                format!(
                    "packageName \"{shown}\" is a URL; send the name its manifest uses \
                     (npm @scope/name, Maven group:artifact, a Go module path without the scheme)."
                ),
            ));
        }
        if let Some(registry) = query.get("registryUrl").and_then(Value::as_str) {
            let parsed = Url::parse(registry).map_err(|_| {
                issue(
                    "artifact.registry-url",
                    prefix.clone(),
                    "Use an HTTP(S) registry URL without credentials, query, or fragment",
                )
            })?;
            if !matches!(parsed.scheme(), "http" | "https")
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.query().is_some()
                || parsed.fragment().is_some()
            {
                return Err(issue(
                    "artifact.registry-url",
                    prefix,
                    "Use an HTTP(S) registry URL without credentials, query, or fragment",
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::contracts::validate::validate;
    use serde_json::json;

    /// A URL sent as the package name is refused before any request, with
    /// the fix named and no repair (only the caller knows the name).
    #[test]
    fn a_url_package_name_is_refused_with_the_fix_named() {
        let input = json!({"queries":[{"ecosystem":"npm",
            "packageName":"https://www.npmjs.com/package/react"}]});
        let error = validate("artifactSearch", input.clone()).expect_err("a URL is no name");
        assert_eq!(error.issues[0].path, ["queries", "0", "packageName"]);
        assert!(
            error.issues[0]
                .message
                .contains("send the name its manifest uses")
        );
        assert!(
            crate::contracts::validate::repair_input(&input, &error.issues, |_| Ok(())).is_none()
        );
        validate(
            "artifactSearch",
            json!({"queries":[{"ecosystem":"go","packageName":"github.com/spf13/cobra"}]}),
        )
        .expect("a Go module path has no scheme");
    }
}

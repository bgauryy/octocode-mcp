//! ghSearchCode query syntax.
use super::GhSearchCodeQuery;
use crate::providers::github::{qualifier_value, quote_search_keyword, search_phrase};
use crate::tools::gh_shared::query::push;

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

    /// Rendered qualifiers keep paths as path prefixes and quote what the
    /// search syntax would otherwise read as operators or separators.
    #[test]
    fn rendered_qualifiers_keep_paths_and_quote_reserved_text() {
        // (case, row, present, absent, prefix)
        type Case = (
            &'static str,
            serde_json::Value,
            &'static [&'static str],
            &'static [&'static str],
            &'static str,
        );
        let cases: [Case; 3] = [
            (
                "dotted directory path stays a path prefix",
                serde_json::json!({"keywords":["merge"],"path":"types/lodash.merge"}),
                &["path:\"types/lodash.merge\""],
                &["filename:"],
                "",
            ),
            (
                "qualifier values with whitespace are quoted",
                serde_json::json!({"keywords":["x"],"path":"my dir/src","filename":"my file.txt"}),
                &["path:\"my dir/src\"", "filename:\"my file.txt\""],
                &[],
                "",
            ),
            (
                "reserved boolean keywords are quoted",
                serde_json::json!({"keywords":["foo","OR","bar","NOT","and"]}),
                &[],
                &[],
                "foo \"OR\" bar \"NOT\" \"and\"",
            ),
        ];
        for (case, mut row, present, absent, prefix) in cases {
            for (key, value) in [("mainGoal", "test"), ("reasoning", "test"), ("owner", "o")] {
                row[key] = value.into();
            }
            let q = code(&parse(row), None);
            for text in present {
                assert!(q.contains(text), "{case}: {q}");
            }
            for text in absent {
                assert!(!q.contains(text), "{case}: {q}");
            }
            assert!(q.starts_with(prefix), "{case}: {q}");
        }
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

//! Repository coordinates a row spells another way. A row field whose
//! schema declares `x-joinedWith: <partner>` (core metadata: the GitHub
//! `owner` field, joined with `repo`) is the first half of a
//! `first/second` pair. Input validation turns three spellings into issues
//! whose schema carries the exact fix as `setFields` (field → value; `null`
//! removes the field), which the repair applies as written:
//!
//! - one half holding the whole pair (`owner:"a/b"`, or `repo:"a/b"`): the
//!   halves, when each is a valid value of its field and the other field is
//!   absent or already equal to its half;
//! - the second half ending in a clone URL's `.git` (`repo:"is.git"`): the
//!   name without it, which is what the repository is called;
//! - a repository web URL as the whole value of a pair field or of the
//!   row's `path` (`https://github.com/o/r/blob/<ref>/<path>`,
//!   `https://raw.githubusercontent.com/o/r/<ref>/<path>`): the pair, and the
//!   ref and file path in the fields GitHub's own API names `ref` and `path`
//!   (when the row declares them). A ref may hold `/`, so a URL with a file
//!   path after a ref that is no full commit SHA (or with a `?query` or
//!   `#fragment` the fields cannot carry) is read approximately: the issue
//!   names those fields in `approximateFields`.
//!
//! A required or pattern issue at a field another issue's fix sets is
//! settled by that fix and dropped, so the error names one fix.

use super::schema::{ValidationMode, validate_with_mode};
use super::{ValidationIssue, union};
use serde_json::{Map, Value, json};

/// The row fields a web URL's ref and file path go to: GitHub's names.
const REF_FIELD: &str = "ref";
const PATH_FIELD: &str = "path";
/// A clone URL's suffix, never part of a repository's name.
const CLONE_SUFFIX: &str = ".git";

/// A declared `first/second` pair of row fields, with their schemas.
struct Pair<'a> {
    first: &'a str,
    second: &'a str,
    first_schema: &'a Value,
    second_schema: &'a Value,
}

/// Adds the coordinate issues of the row `object` at `path` and settles
/// what their fixes cover (see the module note).
pub(super) fn settle(
    root: &Value,
    properties: &Map<String, Value>,
    object: &Map<String, Value>,
    path: &[String],
    issues: &mut Vec<ValidationIssue>,
) {
    let pairs = pairs(root, properties);
    if pairs.is_empty() {
        return;
    }
    let speculative = union::speculative();
    for pair in &pairs {
        for field in [pair.first, pair.second, PATH_FIELD] {
            let Some(text) = object
                .get(field)
                .filter(|_| properties.contains_key(field))
                .and_then(Value::as_str)
            else {
                continue;
            };
            // A pair field never holds a `/`, so a URL there needs no scheme;
            // a file path may begin with a host-like directory, so it does.
            let Some(url) = WebUrl::parse(text, field != PATH_FIELD) else {
                continue;
            };
            issues.push(url.issue(pair, properties, object, path, field, speculative));
        }
        if let Some(text) = object.get(pair.second).and_then(Value::as_str)
            && !text.contains('/')
            && let Some(name) = text.strip_suffix(CLONE_SUFFIX)
            && accepts(root, pair.second_schema, name)
        {
            issues.push(fixed_issue(
                "schema.clone-suffix",
                field_path(path, pair.second),
                format!(
                    "\"{text}\" ends with a clone URL's {CLONE_SUFFIX}; send {}:\"{name}\"",
                    pair.second
                ),
                vec![(pair.second.to_owned(), Some(json!(name)))],
                Vec::new(),
                &json!(text),
                speculative,
            ));
        }
    }
    if speculative {
        return;
    }
    for issue in issues.iter_mut() {
        for pair in &pairs {
            split_pair(root, pair, object, path, issue);
        }
    }
    let covered = issues
        .iter()
        .flat_map(|issue| {
            let parent = &issue.path[..issue.path.len().saturating_sub(1)];
            set_fields(issue)
                .into_iter()
                .flat_map(Map::keys)
                .map(move |field| field_path(parent, field))
        })
        .collect::<Vec<_>>();
    issues.retain(|issue| {
        !(matches!(issue.rule_id.as_str(), "schema.required" | "schema.pattern")
            && set_fields(issue).is_none()
            && covered.contains(&issue.path))
    });
}

/// The fix an issue carries: the row fields to set (`null`: remove).
pub(super) fn set_fields(issue: &ValidationIssue) -> Option<&Map<String, Value>> {
    issue.schema.as_ref()?.get("setFields")?.as_object()
}

/// The pairs `properties` declares: a field naming its partner field.
fn pairs<'a>(root: &'a Value, properties: &'a Map<String, Value>) -> Vec<Pair<'a>> {
    properties
        .iter()
        .filter_map(|(first, schema)| {
            let first_schema = super::super::resolve_ref(schema, &root["$defs"]);
            let (second, second_schema) =
                properties.get_key_value(first_schema.get("x-joinedWith")?.as_str()?)?;
            Some(Pair {
                first,
                second,
                first_schema,
                second_schema: super::super::resolve_ref(second_schema, &root["$defs"]),
            })
        })
        .collect()
}

/// A pattern issue of one pair field holding `a/b`: carries the split.
fn split_pair(
    root: &Value,
    pair: &Pair,
    object: &Map<String, Value>,
    path: &[String],
    issue: &mut ValidationIssue,
) {
    let Some(field) = issue.path.last() else {
        return;
    };
    let other = match field.as_str() {
        _ if issue.rule_id != "schema.pattern" || issue.path[..issue.path.len() - 1] != *path => {
            return;
        }
        name if name == pair.first => pair.second,
        name if name == pair.second => pair.first,
        _ => return,
    };
    let Some((first, second)) = object
        .get(field)
        .and_then(Value::as_str)
        .and_then(|text| text.split_once('/'))
        .filter(|(first, second)| !first.is_empty() && !second.contains('/'))
    else {
        return;
    };
    let second = second.strip_suffix(CLONE_SUFFIX).unwrap_or(second);
    let half = if other == pair.first { first } else { second };
    if !accepts(root, pair.first_schema, first)
        || !accepts(root, pair.second_schema, second)
        || object
            .get(other)
            .is_some_and(|value| value.as_str() != Some(half))
    {
        return;
    }
    let fields = json!({ pair.first: first, pair.second: second });
    if let Some(schema) = issue.schema.as_mut().and_then(Value::as_object_mut) {
        schema.insert("setFields".into(), fields);
        issue.message = format!(
            "{}; send {}:\"{first}\", {}:\"{second}\"",
            issue.message, pair.first, pair.second
        );
    }
}

/// Whether `schema` accepts the string `text`.
fn accepts(root: &Value, schema: &Value, text: &str) -> bool {
    let _speculation = union::Speculation::enter();
    validate_with_mode(
        root,
        schema,
        &mut json!(text),
        &mut Vec::new(),
        ValidationMode::Input,
    )
    .is_ok()
}

fn field_path(parent: &[String], field: &str) -> Vec<String> {
    let mut path = parent.to_vec();
    path.push(field.to_owned());
    path
}

/// An issue whose schema carries its fix (`setFields`), unless speculative.
fn fixed_issue(
    rule_id: &str,
    path: Vec<String>,
    message: String,
    fields: Vec<(String, Option<Value>)>,
    approximate: Vec<String>,
    received: &Value,
    speculative: bool,
) -> ValidationIssue {
    let fix = (!speculative && !fields.is_empty()).then(|| {
        let set = fields
            .into_iter()
            .map(|(field, value)| (field, value.unwrap_or(Value::Null)))
            .collect::<Map<_, _>>();
        json!({"setFields": set, "approximateFields": approximate})
    });
    ValidationIssue {
        rule_id: rule_id.to_owned(),
        path,
        message,
        received: (!speculative).then(|| received.clone()),
        schema: fix,
    }
}

/// A repository web URL's parts.
struct WebUrl<'a> {
    text: &'a str,
    owner: String,
    repo: String,
    git_ref: Option<String>,
    file: Option<String>,
    /// The ref may end inside the file path, or the URL selects more than
    /// the fields carry.
    approximate: bool,
}

impl<'a> WebUrl<'a> {
    fn parse(text: &'a str, bare_host: bool) -> Option<Self> {
        let trimmed = text.trim();
        let url = match url::Url::parse(trimmed) {
            Ok(url) => url,
            Err(_) if bare_host => url::Url::parse(&format!("https://{trimmed}")).ok()?,
            Err(_) => return None,
        };
        if !matches!(url.scheme(), "http" | "https") {
            return None;
        }
        let segments = url
            .path_segments()?
            .filter(|segment| !segment.is_empty())
            .collect::<Vec<_>>();
        // An encoded segment would need decoding to name the file exactly.
        if segments.iter().any(|segment| segment.contains('%')) {
            return None;
        }
        let host = url.host_str()?.to_ascii_lowercase();
        let (owner, repo, git_ref, file) = match (host.as_str(), segments.as_slice()) {
            ("github.com" | "www.github.com", [owner, repo]) => (*owner, *repo, None, &[][..]),
            (
                "github.com" | "www.github.com",
                [owner, repo, "blob" | "tree", git_ref, file @ ..],
            )
            | ("raw.githubusercontent.com", [owner, repo, git_ref, file @ ..])
                if !file.is_empty() || !host.starts_with("raw.") =>
            {
                (*owner, *repo, Some(*git_ref), file)
            }
            _ => return None,
        };
        let full_sha = git_ref.is_some_and(|git_ref| {
            git_ref.len() == 40 && git_ref.chars().all(|c| c.is_ascii_hexdigit())
        });
        Some(Self {
            text,
            owner: owner.to_owned(),
            repo: repo.strip_suffix(CLONE_SUFFIX).unwrap_or(repo).to_owned(),
            git_ref: git_ref.map(str::to_owned),
            file: (!file.is_empty()).then(|| file.join("/")),
            approximate: (!file.is_empty() && !full_sha)
                || url.query().is_some()
                || url.fragment().is_some(),
        })
    }

    /// The issue at `field` (holding the URL): its fix sets the pair, ref
    /// and path, unless the row declares no field for a part or already
    /// sets one to another value.
    fn issue(
        &self,
        pair: &Pair,
        properties: &Map<String, Value>,
        object: &Map<String, Value>,
        path: &[String],
        field: &str,
        speculative: bool,
    ) -> ValidationIssue {
        let mut fields = vec![
            (pair.first.to_owned(), Some(json!(self.owner))),
            (pair.second.to_owned(), Some(json!(self.repo))),
        ];
        let mut complete = true;
        for (target, part) in [(REF_FIELD, &self.git_ref), (PATH_FIELD, &self.file)] {
            match part {
                Some(value) if properties.contains_key(target) => {
                    fields.push((target.to_owned(), Some(json!(value))));
                }
                Some(_) => complete = false,
                // The URL names no file: the path that held it goes.
                None if target == field => fields.push((target.to_owned(), None)),
                None => {}
            }
        }
        complete &= fields.iter().all(|(target, value)| {
            target == field
                || object
                    .get(target)
                    .is_none_or(|current| Some(current) == value.as_ref())
        });
        let shown = fields
            .iter()
            .filter_map(|(target, value)| Some(format!("{target}:{}", value.as_ref()?)))
            .collect::<Vec<_>>()
            .join(", ");
        let approximate = if self.approximate {
            vec![REF_FIELD.to_owned(), PATH_FIELD.to_owned()]
        } else {
            Vec::new()
        };
        fixed_issue(
            "schema.repository-url",
            field_path(path, field),
            format!("\"{}\" is a repository web URL; send {shown}", self.text),
            if complete { fields } else { Vec::new() },
            approximate,
            &json!(self.text),
            speculative,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::{repair_input, validate_input_schema};
    use serde_json::{Value, json};

    /// A row schema with a joined `owner`/`repo` pair (the core metadata),
    /// a `ref` and a required file `path`.
    fn schema(required: &[&str]) -> Value {
        let name = json!({"type":"string","pattern":"^[\\w.][\\w.-]*$"});
        let mut owner = name.clone();
        owner["x-joinedWith"] = json!("repo");
        json!({"type":"object","additionalProperties":false,"required":required,
            "properties":{"owner":owner,"repo":name,
                "ref":{"type":"string","pattern":"\\S"},
                "path":{"type":"string","pattern":"\\S"}}})
    }

    fn issues(schema: &Value, row: &Value) -> Vec<super::ValidationIssue> {
        validate_input_schema(schema, schema, &mut row.clone(), &mut Vec::new())
            .err()
            .map(|error| error.issues)
            .unwrap_or_default()
    }

    /// The repaired row, checked against the same schema; `None`: no lead.
    fn repaired(schema: &Value, row: Value) -> Option<(Value, Vec<String>)> {
        let found = issues(schema, &row);
        assert!(!found.is_empty(), "{row} is rejected");
        let check = |candidate: &Value| match issues(schema, candidate) {
            found if found.is_empty() => Ok(()),
            found => Err(found),
        };
        repair_input(&row, &found, check).map(|repair| {
            assert!(repair.dropped.is_empty(), "coordinate repairs drop nothing");
            (repair.input, repair.approximate)
        })
    }

    #[test]
    fn a_joined_pair_in_one_half_splits_into_both() {
        let required = schema(&["owner", "repo"]);
        let optional = schema(&[]);
        for (schema, row, expected) in [
            (
                &required,
                json!({"owner":"a/b"}),
                Some(json!({"owner":"a","repo":"b"})),
            ),
            (
                &optional,
                json!({"repo":"a/b"}),
                Some(json!({"repo":"b","owner":"a"})),
            ),
            (
                &required,
                json!({"owner":"a/b","repo":"b"}),
                Some(json!({"owner":"a","repo":"b"})),
            ),
            (
                &required,
                json!({"owner":"a/b.git"}),
                Some(json!({"owner":"a","repo":"b"})),
            ),
            (&required, json!({"owner":"a/b","repo":"c"}), None),
            (&required, json!({"owner":"a/b/c"}), None),
        ] {
            let repair = repaired(schema, row.clone());
            assert_eq!(
                repair.as_ref().map(|(input, _)| input),
                expected.as_ref(),
                "{row}"
            );
            assert!(repair.is_none_or(|(_, approximate)| approximate.is_empty()));
        }
        // The error names the split once: the missing repo is settled by it.
        let found = issues(&required, &json!({"owner":"a/b"}));
        assert_eq!(found.len(), 1, "{found:?}");
        assert!(
            found[0].message.ends_with("send owner:\"a\", repo:\"b\""),
            "{found:?}"
        );
    }

    #[test]
    fn a_clone_suffix_on_the_second_half_is_dropped_exactly() {
        let schema = schema(&["owner", "repo"]);
        let (input, approximate) =
            repaired(&schema, json!({"owner":"o","repo":"is.git"})).expect("exact");
        assert_eq!(input, json!({"owner":"o","repo":"is"}));
        assert!(approximate.is_empty());
        assert!(issues(&schema, &json!({"owner":"o","repo":"gitlab"})).is_empty());
        assert!(issues(&schema, &json!({"owner":"o.git","repo":"r"})).is_empty());
    }

    #[test]
    fn a_web_url_becomes_the_rows_coordinates() {
        let schema = schema(&["owner", "repo", "path"]);
        let sha = "0123456789abcdef0123456789abcdef01234567";
        for (row, expected, approximate) in [
            (
                json!({"path": format!("https://github.com/o/r/blob/{sha}/src/a.rs")}),
                json!({"path":"src/a.rs","owner":"o","repo":"r","ref":sha}),
                false,
            ),
            (
                json!({"path":"https://github.com/o/r/blob/main/src/a.rs#L3"}),
                json!({"path":"src/a.rs","owner":"o","repo":"r","ref":"main"}),
                true,
            ),
            (
                json!({"owner":"o","path":"https://raw.githubusercontent.com/o/r.git/v1/a.md"}),
                json!({"owner":"o","path":"a.md","repo":"r","ref":"v1"}),
                true,
            ),
            (
                json!({"owner":"github.com/o/r","path":"a.md"}),
                json!({"owner":"o","path":"a.md","repo":"r"}),
                false,
            ),
        ] {
            let (input, named) = repaired(&schema, row.clone()).expect("a lead");
            assert_eq!(input, expected, "{row}");
            assert_eq!(!named.is_empty(), approximate, "{row}: {named:?}");
        }
        // Another owner than the URL's, or no scheme on a file path: no fix.
        assert!(
            repaired(
                &schema,
                json!({"owner":"x","path":"https://github.com/o/r/blob/m/a"})
            )
            .is_none()
        );
        assert!(
            issues(
                &schema,
                &json!({"owner":"o","repo":"r","path":"github.com/o/r/blob/m/a"})
            )
            .is_empty()
        );
    }
}

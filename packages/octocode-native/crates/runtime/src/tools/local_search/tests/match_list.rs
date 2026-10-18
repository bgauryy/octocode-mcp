use super::*;

/// `matchString` is `string | string[]` in localSearch as in localFetch: a
/// list matches a line holding any of its entries.
fn lines(body: &serde_json::Value) -> Vec<String> {
    body["files"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|file| file["matches"].as_array().into_iter().flatten())
        .map(|row| row["value"].as_str().unwrap_or_default().trim().to_owned())
        .collect()
}

fn sorted(mut lines: Vec<String>) -> Vec<String> {
    lines.sort();
    lines
}

fn run(files: &[(&str, &str)], fields: serde_json::Value) -> serde_json::Value {
    search_fixture(files, ls_query(fields, None))
}

#[test]
fn a_list_matches_a_line_holding_any_of_its_entries() {
    let files = [("a.txt", "alpha\nbeta\ngamma\ndelta\n")];
    let body = run(
        &files,
        serde_json::json!({"matchString": ["alpha", "gamma"]}),
    );
    assert_eq!(sorted(lines(&body)), ["alpha", "gamma"], "{body}");
    assert_eq!(body["matchedLineCount"], 2, "{body}");
}

/// Without `regex` every entry is literal text, `|` and `.` included; the
/// entries are not joined into a pattern the caller can see.
#[test]
fn list_entries_are_literal_unless_regex_is_set() {
    let files = [("a.txt", "abc\na.c\nx|y\nx\ny\n")];
    let literal = run(&files, serde_json::json!({"matchString": ["a.c", "x|y"]}));
    assert_eq!(sorted(lines(&literal)), ["a.c", "x|y"], "{literal}");
    let named = run(
        &files,
        serde_json::json!({"matchString": ["a.c", "x|y"], "regex": "literal"}),
    );
    assert_eq!(sorted(lines(&named)), ["a.c", "x|y"], "{named}");
    // `regex:"rust"` makes every entry a pattern of its own.
    let regex = run(
        &files,
        serde_json::json!({"matchString": ["a.c", "x|y"], "regex": "rust"}),
    );
    assert_eq!(
        sorted(lines(&regex)),
        ["a.c", "abc", "x", "x|y", "y"],
        "{regex}"
    );
}

/// `caseMode:"smart"` judges each entry on its own, as localFetch does: an
/// uppercase letter makes that entry sensitive, the others stay insensitive.
#[test]
fn a_list_applies_the_case_rule_to_each_entry() {
    let files = [("a.txt", "alpha\nAlpha\nBETA\nbeta\n")];
    let smart = run(
        &files,
        serde_json::json!({"matchString": ["Alpha", "beta"]}),
    );
    assert_eq!(sorted(lines(&smart)), ["Alpha", "BETA", "beta"], "{smart}");
    let sensitive = run(
        &files,
        serde_json::json!({"matchString": ["alpha", "beta"], "caseMode": "sensitive"}),
    );
    assert_eq!(sorted(lines(&sensitive)), ["alpha", "beta"], "{sensitive}");
    let insensitive = run(
        &files,
        serde_json::json!({"matchString": ["Alpha", "BETA"], "caseMode": "insensitive"}),
    );
    assert_eq!(
        sorted(lines(&insensitive)),
        ["Alpha", "BETA", "alpha", "beta"],
        "{insensitive}"
    );
}

#[test]
fn a_list_honors_whole_word_and_reports_a_miss_as_empty() {
    let files = [("a.txt", "concat\ncat\ndogma\ndog\n")];
    let words = run(
        &files,
        serde_json::json!({"matchString": ["cat", "dog"], "wholeWord": true}),
    );
    assert_eq!(sorted(lines(&words)), ["cat", "dog"], "{words}");
    let miss = run(&files, serde_json::json!({"matchString": ["zzz", "yyy"]}));
    assert_eq!(miss["matchCount"], 0, "{miss}");
}

/// A continuation of a list search is a runnable query: following it reaches
/// the next page of the same list search.
#[test]
fn a_list_search_pages_through_its_continuation() {
    let root = tempfile::tempdir().expect("fixture");
    for (name, body) in [
        ("a.txt", "alpha\n"),
        ("b.txt", "beta\n"),
        ("c.txt", "alpha beta\n"),
    ] {
        fs::write(root.path().join(name), body).expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path(), "matchString": ["alpha", "beta"], "pageSize": 1, "sort": "path"}),
        None,
    );
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
        .expect("page 1");
    let first = serde_json::to_value(&first).expect("result");
    assert_eq!(first["pagination"]["totalItems"], 3, "{first}");
    let next = first["next"]["nextPage"]["query"]["queries"][0].clone();
    let second = execute_local_search(
        &ls_query(next, None),
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
        None,
    )
    .expect("page 2");
    let second = serde_json::to_value(&second).expect("result");
    assert_eq!(second["files"][0]["path"], "b.txt", "{second}");
}

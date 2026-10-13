use super::*;

#[test]
fn goal_search_replays_skipped_order_and_rejects_changed_goals() {
    let root = tempfile::tempdir().expect("fixture");
    std::fs::write(root.path().join("a.txt"), "needle\n").expect("fixture");
    std::fs::write(root.path().join("b.txt"), "needle\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path":root.path(),"matchString":"needle","pageSize":1,"goals":["find needle"]}),
        None,
    );
    let first =
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None).expect("page");
    assert_eq!(
        first.ranking.as_ref().map(|r| r.status),
        Some(crate::contracts::tool_types::RankingStatus::Skipped)
    );
    let continued: LocalSearchQuery = serde_json::from_value(
        first.next.expect("next")["nextPage"]["query"]["queries"][0].clone(),
    )
    .expect("continuation");
    assert!(continued.ranking.is_some());
    let second = execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
        .expect("page");
    assert_eq!(second.files.len(), 1);
    let changed = ls_query(
        serde_json::json!({"goals":["another goal"]}),
        Some(&continued),
    );
    assert_eq!(
        execute_local_search(&changed, &policy, &security, &NeverCancel, None, None)
            .expect_err("stale")
            .code,
        "staleSnapshot"
    );
}

/// Test query from wire JSON over a base query (or a minimal valid one);
/// `null` removes a field so its contract default applies.
fn ls_query(fields: serde_json::Value, base: Option<&LocalSearchQuery>) -> LocalSearchQuery {
    let mut value = base.map_or_else(
            || serde_json::json!({"path": "_", "matchString": "_", "mainGoal": "test", "reasoning": "test"}),
            |base| serde_json::to_value(base).expect("query serializes"),
        );
    let object = value.as_object_mut().expect("query object");
    for (key, field) in fields.as_object().expect("fields object") {
        if field.is_null() {
            object.remove(key);
        } else {
            object.insert(key.clone(), field.clone());
        }
    }
    serde_json::from_value(value).expect("valid localSearch query")
}
use crate::{policy::path::PathPolicy, security::ContentSecurity, tools::cancel::NeverCancel};
use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

fn context_fixture() -> (tempfile::TempDir, PathPolicy, ContentSecurity) {
    let root = tempfile::tempdir().expect("fixture directory");
    // Nine ~37-char lines around one hit: a ±4 window is ~334 chars.
    let lines: Vec<String> = (1..=9)
        .map(|i| {
            if i == 5 {
                format!("let needle_{i} = compute_value_number_{i}();")
            } else {
                format!("let other_{i} = compute_value_number_{i}();")
            }
        })
        .collect();
    fs::write(root.path().join("ctx.rs"), lines.join("\n") + "\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    (root, policy, security)
}

#[test]
fn match_page_ceiling_preserves_evidence_and_discloses_terminal_suffix() {
    let root = tempfile::tempdir().expect("fixture");
    fs::write(root.path().join("a.txt"), "CEILING\n".repeat(1001)).expect("matches");
    fs::write(root.path().join("b.txt"), "CEILING\n").expect("other file page");
    let policy = crate::tools::test_support::workspace_policy(root.path());
    let request = ls_query(
        serde_json::json!({"path":root.path(),"matchString":"CEILING","regex":"literal","pageSize":1,"matchPageSize":1,"matchPage":1000}),
        None,
    );
    let result = execute_local_search(
        &request,
        &policy,
        &ContentSecurity::new(),
        &NeverCancel,
        None,
        None,
    )
    .expect("search");
    let body = serde_json::to_value(result).expect("output");
    assert_eq!(body["files"][0]["matches"][0]["line"], 1000, "{body}");
    assert!(body["next"].get("nextMatchPage").is_none(), "{body}");
    assert!(body["next"].get("nextPage").is_some(), "{body}");
    assert_eq!(body["terminalLimit"], true, "{body}");
}

#[test]
fn context_lines_scale_the_default_match_content_length() {
    let (root, policy, security) = context_fixture();
    let base = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle".to_string(), "contextLines": 4}),
        None,
    );
    let run = |request: &LocalSearchQuery| {
        let result = execute_local_search(request, &policy, &security, &NeverCancel, None, None)
            .expect("search");
        serde_json::to_value(result).expect("serialize")
    };
    let scaled = run(&base);
    let matched = &scaled["files"][0]["matches"][0];
    assert!(matched.get("originalChars").is_none(), "{scaled}");
    assert!(matched["value"].as_str().expect("value").chars().count() > 300);

    let explicit = run(&ls_query(
        serde_json::json!({"matchContentLength": 200}),
        Some(&base.clone()),
    ));
    assert!(explicit["files"][0]["matches"][0]["originalChars"].is_u64());

    let detailed = run(&ls_query(
        serde_json::json!({"contextLines": 3, "resultView": LocalSearchQueryResultView::Paginated}),
        Some(&base.clone()),
    ));
    assert!(
        detailed["files"][0]["matches"][0]
            .get("originalChars")
            .is_none(),
        "{detailed}"
    );
}

#[test]
fn match_only_caps_display_after_unique_grouping_and_preserves_continuations() {
    let root = tempfile::tempdir().expect("fixture directory");
    let prefix = format!("needle{}", "界".repeat(4096));
    fs::write(
        root.path().join("giant.txt"),
        format!("{prefix}END\n{prefix}END\n{prefix}OTHER\n"),
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle.*".to_string(), "regex": "rust", "resultView": LocalSearchQueryResultView::MatchOnly, "matchContentLength": 30, "matchPageSize": 1, "unique": LocalSearchQueryUnique::Count}),
        None,
    );
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("first page");
    let body = serde_json::to_value(&first).expect("serialize");
    let matched = &body["files"][0]["matches"][0];
    assert_eq!(
        matched["value"].as_str().expect("value").chars().count(),
        30
    );
    assert_eq!(matched["originalChars"], 4105);
    assert_eq!(matched["returnedChars"], 30);
    assert_eq!(matched["count"], 2);
    assert_eq!(body["matchCount"], 3);
    assert_eq!(body["matchedLineCount"], 3);
    assert!(body.get("partialReasons").is_none(), "{body}");
    assert_eq!(body["files"][0]["pagination"]["totalItems"], 2);
    assert!(
        !first
            .warnings
            .iter()
            .any(|warning| warning.contains("matchContentLength")),
        "{:?}",
        first.warnings
    );
    let next = &body["next"]["nextMatchPage"]["query"]["queries"][0];
    assert_eq!(next["matchContentLength"], 30);
    assert_eq!(next["unique"], "count");
    assert_eq!(next["matchPage"], 2);
    let continued = ls_query(
        serde_json::json!({"matchPage": 2, "snapshot": first.source_snapshot}),
        Some(&request),
    );
    let second = execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
        .expect("second page");
    let body = serde_json::to_value(second).expect("serialize");
    let matched = &body["files"][0]["matches"][0];
    assert_eq!(matched["originalChars"], 4107);
    assert_eq!(matched["returnedChars"], 30);
    assert_eq!(matched["count"], 1);
    // The last match page has nowhere further to route: no per-file
    // paging; its clipped value is read whole by `expandValues` only.
    assert!(body["files"][0].get("pagination").is_none(), "{body}");
    let names = body["next"]
        .as_object()
        .map(|next| next.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    assert_eq!(names, ["expandValues"], "{body}");

    for (limit, expected_chars) in [(None, 200), (Some(1), 1), (Some(4105), 4105)] {
        let bounded = ls_query(
            serde_json::json!({"matchPage": 1, "snapshot": null, "matchContentLength": limit}),
            Some(&continued.clone()),
        );
        let result = execute_local_search(&bounded, &policy, &security, &NeverCancel, None, None)
            .expect("default, minimal and exact-boundary caps");
        let body = serde_json::to_value(result).expect("serialize");
        let matched = &body["files"][0]["matches"][0];
        assert_eq!(
            matched["value"].as_str().expect("value").chars().count(),
            expected_chars
        );
        assert_eq!(
            matched.get("originalChars").is_some(),
            expected_chars < 4105
        );
        assert_eq!(matched["count"], 2);
    }
}

// A search that matches an interior base64 body line of a private key
// must not return the key body, even though the match view holds no BEGIN/END
// marker. The full-file block scan (triggered by the base64-shaped snippet)
// redacts it; the window sanitizer alone cannot.
#[test]
fn interior_private_key_match_is_redacted_without_markers_in_view() {
    let root = tempfile::tempdir().expect("fixture directory");
    // 64-char base64 body line carrying a distinctive, searchable fragment.
    let body = "MIIEpQIBAAKCAQEAinteriorKeyBodyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let file = format!(
        "fn main() {{}}\n-----BEGIN RSA PRIVATE KEY-----\nZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ\n{body}\nYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY\n-----END RSA PRIVATE KEY-----\nlet done = true;\n"
    );
    fs::write(root.path().join("app.rs"), file).expect("fixture");
    // Content view returns the whole matched line (not just the match span),
    // so a hit inside the base64 body would surface the key material.
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "MIIEpQIB".to_string(), "resultView": LocalSearchQueryResultView::Paginated, "contextLines": 0}),
    );
    let body_json = serde_json::to_value(&result).expect("serialize");
    let value = body_json["files"][0]["matches"][0]["value"]
        .as_str()
        .unwrap_or_default();
    assert!(
        !value.contains("interiorKeyBody"),
        "private key body leaked via a localSearch match: {value}"
    );
}

#[test]
fn redacted_match_values_are_flagged_as_not_verbatim() {
    let body = search_fixture(
        &[(
            "db.ts",
            "const url = \"postgres://admin:hunter2secretpw@db.example.com/app\";\n",
        )],
        ls_query(
            serde_json::json!({"matchString": "postgres".to_string()}),
            None,
        ),
    );
    let value = body["files"][0]["matches"][0]["value"]
        .as_str()
        .unwrap_or_default();
    assert!(!value.contains("hunter2secretpw"), "{body}");
    assert!(
        body["warnings"].as_array().is_some_and(|warnings| warnings
            .iter()
            .any(|w| w.as_str().is_some_and(|w| w.starts_with("redactedMatches")))),
        "redaction must be flagged: {body}"
    );
    let clean = search_fixture(
        &[("a.txt", "plain needle\n")],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string()}),
            None,
        ),
    );
    assert!(!clean.to_string().contains("redactedMatches"), "{clean}");
}

// Over-redaction guard: a base64-shaped line with no private-key block
// anywhere in the file must be returned intact — the snippet triggers a
// full-file scan that finds no block and redacts nothing.
#[test]
fn innocent_base64_match_is_not_redacted() {
    let root = tempfile::tempdir().expect("fixture directory");
    let blob = "aGVsbG8gd29ybGRfaW5ub2NlbnRfYmFzZTY0X2Jsb2JfaGVyZQ==";
    fs::write(
        root.path().join("data.txt"),
        format!("prefix\n{blob}\nsuffix\n"),
    )
    .expect("fixture");
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "aGVsbG8".to_string(), "resultView": LocalSearchQueryResultView::Paginated, "contextLines": 0}),
    );
    let body_json = serde_json::to_value(&result).expect("serialize");
    let value = body_json["files"][0]["matches"][0]["value"]
        .as_str()
        .unwrap_or_default();
    assert!(
        value.contains(blob),
        "innocent base64 was wrongly redacted: {value}"
    );
}

// A pathological single giant line (generated/minified file) must not
// emit a multi-MB body. The total-response budget clips each match value —
// every match row and its line anchor is preserved (no silent drop, no
// continuation cursor needed); the clip is reported by `originalChars`.
#[test]
fn oversized_match_is_clipped_to_response_budget_without_dropping_rows() {
    let root = tempfile::tempdir().expect("fixture directory");
    let line = format!("needle {}", "x".repeat(3_000_000));
    fs::write(root.path().join("giant.txt"), format!("{line}\n")).expect("fixture");
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "needle".to_string(), "resultView": LocalSearchQueryResultView::Paginated, "matchContentLength": 5_000_000, "contextLines": 0}),
    );
    let matches = result.files[0].matches.as_ref().expect("matches");
    assert_eq!(
        matches.len(),
        1,
        "the match row must be preserved, not dropped"
    );
    assert_eq!(
        matches[0].line, 1,
        "line anchor preserved for localFetch follow-up"
    );
    assert!(
        matches[0].value.chars().count() <= 1_100_000,
        "value not clipped to budget: {} chars",
        matches[0].value.chars().count()
    );
    assert!(matches[0].clipped, "clip must be flagged clipped");
    let body = serde_json::to_string(&result).expect("serialize");
    assert!(
        body.len() <= 2_000_000,
        "response body exceeded the byte budget: {} bytes",
        body.len()
    );
}

#[test]
fn content_view_snippet_carries_truncation_indicator() {
    // A content-view match on a line longer than matchContentLength is
    // clipped by the engine; the runtime must surface originalChars
    // plus the truncation warning.
    let root = tempfile::tempdir().expect("fixture directory");
    let long_line = format!("needle {}", "x".repeat(600));
    fs::write(root.path().join("big.txt"), format!("{long_line}\n")).expect("fixture");
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "needle".to_string()}),
    );
    let body = serde_json::to_value(&result).expect("serialize");
    let matched = &body["files"][0]["matches"][0];
    assert!(
        matched["originalChars"].as_u64().expect("originalChars") >= 606,
        "{matched:?}"
    );
    assert!(matched["returnedChars"].as_u64().expect("returnedChars") <= 500);
    // The row's flags and its `expandValues` lead say it; no warning repeats them.
    assert!(
        !result
            .warnings
            .iter()
            .any(|warning| warning.contains("matchContentLength")),
        "{:?}",
        result.warnings
    );
    assert!(body["next"].get("expandValues").is_some(), "{body}");
}

#[test]
fn excludes_sensitive_and_symlink_descendants_before_projection() {
    let root = std::env::temp_dir().join(format!(
        "local-search-security-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    fs::create_dir_all(root.join(".aws")).expect("fixture dirs");
    fs::write(root.join("safe.txt"), "needle\n").expect("safe fixture");
    fs::write(root.join(".aws/credentials"), "needle secret\n").expect("secret fixture");
    fs::write(root.join("private-key.pem"), "needle private\n").expect("key fixture");
    fs::write(root.join("binary.dat"), b"needle\0binary").expect("binary fixture");
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/etc/passwd", root.join("escape")).expect("symlink fixture");
    }
    let policy = crate::tools::test_support::workspace_policy(&root);
    let security = ContentSecurity::new();
    let request = ls_query(
        serde_json::json!({"path": root.to_string_lossy().into_owned(), "matchString": "needle".to_string(), "includeHidden": true, "includeIgnored": true, "sort": LocalSearchQuerySort::Path}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert_eq!(
        result
            .files
            .iter()
            .map(|f| f.path.as_str())
            .collect::<Vec<_>>(),
        // A binary file keeps the matches before its first NUL.
        vec!["binary.dat", "safe.txt"]
    );
    assert_eq!(result.stats.files_searched, 2);
    assert_eq!(result.stats.cap_reason.as_deref(), Some("binaryQuit"));
    assert_eq!(
        result.source_root,
        root.canonicalize().expect("canonical root")
    );
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_changed_and_forged_snapshots_even_on_empty_or_final_pages() {
    let root = std::env::temp_dir().join(format!(
        "local-search-snapshot-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("fixture dir");
    let source = root.join("source.txt");
    fs::write(&source, "needle one\n").expect("fixture");
    let policy = crate::tools::test_support::workspace_policy(&root);
    let security = ContentSecurity::new();
    let request = ls_query(
        serde_json::json!({"path": root.to_string_lossy().into_owned(), "matchString": "needle".to_string()}),
        None,
    );
    let initial = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("initial search");
    let snapshot = initial.source_snapshot.expect("identity on final page");
    let mut continued = request.clone();
    continued.snapshot = Some(snapshot.parse().expect("snapshot"));
    execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
        .expect("unchanged snapshot");

    fs::write(&source, "needle two\n").expect("same-size mutation");
    let stale = execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
        .expect_err("changed results must reject snapshot");
    assert_eq!(stale.code, "staleSnapshot");
    assert_eq!(stale.message, crate::response::pages::STALE_SNAPSHOT_ERROR);
    let restart = stale.next.expect("restart");
    assert_eq!(restart["restart"]["tool"], "localSearch");
    assert!(
        restart["restart"]["query"]["queries"][0]
            .get("snapshot")
            .is_none()
    );
    assert_eq!(restart["restart"]["query"]["queries"][0]["page"], 1);
    assert_eq!(restart["restart"]["query"]["queries"][0]["matchPage"], 1);

    let mut empty = request.clone();
    empty.match_string = "absent".parse().expect("matchString");
    empty.snapshot = Some(snapshot.parse().expect("snapshot"));
    assert_eq!(
        execute_local_search(&empty, &policy, &security, &NeverCancel, None, None)
            .expect_err("query-scope/empty mismatch")
            .code,
        "staleSnapshot"
    );
    // A snapshot no search ever issued is malformed input, not a dead
    // snapshot; a well-formed one from another version or query is stale.
    for malformed in ["forged", "lexical-live-v4:nothex", "lexical-live-v4:"] {
        continued.snapshot = Some(malformed.parse().expect("snapshot"));
        let error = execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
            .expect_err("malformed snapshot");
        assert_eq!(error.code, "invalidInput", "{malformed}");
        assert!(error.message.contains("snapshot"), "{}", error.message);
        assert!(error.next.is_none(), "an input error has no restart");
    }
    let (_, digest) = snapshot.split_once(':').expect("versioned snapshot");
    for foreign in [
        format!("lexical-live-v3:{digest}"),
        format!("lexical-live-v4:{}", "0".repeat(64)),
    ] {
        continued.snapshot = Some(foreign.parse().expect("snapshot"));
        assert_eq!(
            execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
                .expect_err("foreign snapshot")
                .code,
            "staleSnapshot",
            "{foreign}"
        );
    }
    fs::remove_dir_all(root).expect("cleanup");
}

/// A continuation's stored scan is bound to the query that produced
/// it: changing any search-semantic field while keeping the cursor must
/// reject, whether the stored scan is still cached or was evicted.
#[test]
fn frozen_snapshot_rejects_changed_search_semantics_on_cache_hit_and_miss() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(
            root.path().join("sample.ts"),
            "export function alpha(x: number): number {\n  return x + 1;\n}\nexport const b = alpha(2);\n",
        )
        .expect("fixture");
    fs::write(
        root.path().join("other.ts"),
        "import { alpha } from \"./sample\";\nexport const value = alpha(3);\n",
    )
    .expect("fixture");
    fs::write(root.path().join("notes.md"), "alpha in prose\n").expect("fixture");
    fs::create_dir(root.path().join("node_modules")).expect("dir");
    fs::write(
        root.path().join("node_modules/dep.ts"),
        "export const alpha = 1;\n",
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha", "include": ["*.ts"], "includeIgnored": true, "pageSize": 1, "matchPageSize": 1, "sort": "path"}),
        None,
    );
    let initial = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("initial search");
    let snapshot = initial.source_snapshot.clone().expect("frozen identity");
    let continued = ls_query(
        serde_json::json!({"snapshot": snapshot, "page": 2}),
        Some(&request),
    );
    let changes = [
        (
            "matchString",
            serde_json::json!({"matchString": "nonexistent_literal_control"}),
        ),
        ("include", serde_json::json!({"include": ["*.md"]})),
        (
            "defaultExcludes",
            serde_json::json!({"defaultExcludes": false}),
        ),
        // `alpha` alone reads as literal text, so a regex mode changes it.
        ("regex", serde_json::json!({"regex": "rust"})),
        ("caseMode", serde_json::json!({"caseMode": "insensitive"})),
        ("includeHidden", serde_json::json!({"includeHidden": true})),
        ("wholeWord", serde_json::json!({"wholeWord": true})),
        (
            "path",
            serde_json::json!({"path": root.path().join("other.ts").to_string_lossy().into_owned()}),
        ),
    ];
    for cached in [true, false] {
        if !cached {
            super::manifest::evict(&snapshot);
        }
        let page_two =
            execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
                .unwrap_or_else(|e| {
                    panic!("unchanged continuation (cached={cached}): {}", e.message)
                });
        assert_eq!(
            page_two
                .files
                .iter()
                .map(|f| f.path.as_str())
                .collect::<Vec<_>>(),
            vec!["sample.ts"],
            "cached={cached}"
        );
        assert_eq!(page_two.source_snapshot.as_deref(), Some(snapshot.as_str()));
        for (field, change) in &changes {
            if !cached {
                super::manifest::evict(&snapshot);
            }
            let changed = ls_query(change.clone(), Some(&continued));
            match execute_local_search(&changed, &policy, &security, &NeverCancel, None, None) {
                Ok(result) => panic!(
                    "{field} change reused the old cursor (cached={cached}): {:?}",
                    result.files.iter().map(|f| &f.path).collect::<Vec<_>>()
                ),
                Err(error) => {
                    assert_eq!(error.code, "staleSnapshot", "{field} cached={cached}");
                    let restart = error.next.expect("restart");
                    assert!(
                        restart["restart"]["query"]["queries"][0]
                            .get("snapshot")
                            .is_none()
                    );
                }
            }
        }
    }
    let control = ls_query(
        serde_json::json!({"matchString": "nonexistent_literal_control"}),
        Some(&request),
    );
    let control = execute_local_search(&control, &policy, &security, &NeverCancel, None, None)
        .expect("control search");
    assert!(control.files.is_empty());
}

/// Continuations reuse the page-1 scan whatever `includeIgnored` says, so pages
/// stay consistent; a matched file that changed since the scan, or a
/// scan that expired, falls back to a rescan that restarts a changed
/// result.
#[test]
fn continuations_reuse_their_scan_until_a_matched_file_changes() {
    let root = tempfile::tempdir().expect("fixture directory");
    for name in ["a.txt", "b.txt", "c.txt"] {
        fs::write(root.path().join(name), "needle\n").expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "pageSize": 1, "sort": "path"}),
        None,
    );
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("page 1");
    let snapshot = first
        .source_snapshot
        .clone()
        .expect("continuation identity");
    let page = |n: u32| {
        ls_query(
            serde_json::json!({"snapshot": snapshot, "page": n}),
            Some(&request),
        )
    };
    // A new matching file is not part of the stored scan.
    fs::write(root.path().join("a0.txt"), "needle\n").expect("new file");
    let second = execute_local_search(&page(2), &policy, &security, &NeverCancel, None, None)
        .expect("page 2 from the stored scan");
    assert_eq!(second.files[0].path, "b.txt");
    // Once the scan is gone, the rescan sees the new file and restarts.
    super::manifest::evict(&snapshot);
    assert_eq!(
        execute_local_search(&page(2), &policy, &security, &NeverCancel, None, None)
            .expect_err("changed result")
            .code,
        "staleSnapshot"
    );
    fs::remove_file(root.path().join("a0.txt")).expect("cleanup");
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("page 1 again");
    assert_eq!(first.source_snapshot.as_deref(), Some(snapshot.as_str()));
    // A matched file that changed invalidates the stored scan.
    fs::write(root.path().join("c.txt"), "needle\nneedle\n").expect("edit");
    assert_eq!(
        execute_local_search(&page(3), &policy, &security, &NeverCancel, None, None)
            .expect_err("edited matched file")
            .code,
        "staleSnapshot"
    );
}

/// Replace `path`'s bytes with `content` of the same length and restore
/// its nanosecond modification time, so size and time cannot reveal the
/// edit.
fn rewrite_keeping_stamp(path: &std::path::Path, content: &str) {
    let before = fs::metadata(path).expect("fixture metadata");
    assert_eq!(before.len(), content.len() as u64, "same-size rewrite");
    let modified = before.modified().expect("mtime");
    fs::write(path, content).expect("rewrite");
    fs::File::options()
        .write(true)
        .open(path)
        .and_then(|file| file.set_modified(modified))
        .expect("restore mtime");
    let after = fs::metadata(path).expect("fixture metadata");
    assert_eq!(
        (after.len(), after.modified().expect("mtime")),
        (before.len(), modified)
    );
}

fn values(result: &LocalSearchResult) -> String {
    serde_json::to_string(&result.files).expect("files serialize")
}

/// A continuation never serves stored values from a file edited since
/// the scan, even when the edit keeps its size and modification time.
#[test]
fn a_same_size_same_mtime_edit_restarts_instead_of_serving_old_values() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(root.path().join("a.ts"), "const needle = \"OLD_A\";\n").expect("fixture");
    let b = root.path().join("b.ts");
    fs::write(&b, "const needle = \"OLD_B\";\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "regex": "literal", "sort": "path", "include": ["*.ts"], "includeIgnored": true, "pageSize": 1}),
        None,
    );
    let (_, _, page_two) = first_page(&request, &policy, &security);
    rewrite_keeping_stamp(&b, "const needle = \"NEW_B\";\n");
    match execute_local_search(&page_two, &policy, &security, &NeverCancel, None, None) {
        Ok(result) => panic!("stale page served: {}", values(&result)),
        Err(error) => {
            assert_eq!(error.code, "staleSnapshot");
            let restart = error.next.expect("restart");
            assert!(
                restart["restart"]["query"]["queries"][0]
                    .get("snapshot")
                    .is_none()
            );
        }
    }
    for view in ["files", "countMatches"] {
        fs::write(&b, "const needle = \"OLD_B\";\n").expect("fixture");
        let listed = ls_query(serde_json::json!({"resultView": view}), Some(&request));
        let first = execute_local_search(&listed, &policy, &security, &NeverCancel, None, None)
            .expect("list page 1");
        let next = ls_query(
            serde_json::json!({"snapshot": first.source_snapshot.clone().expect("identity"), "page": 2}),
            Some(&listed),
        );
        rewrite_keeping_stamp(&b, "const nEEdle = \"NEW_B\";\n");
        match execute_local_search(&next, &policy, &security, &NeverCancel, None, None) {
            Ok(result) => panic!("{view}: stale page served: {}", values(&result)),
            Err(error) => assert_eq!(error.code, "staleSnapshot", "{view}"),
        }
    }
    fs::write(&b, "const needle = \"NEW_B\";\n").expect("fixture");
    let fresh = execute_local_search(
        &ls_query(serde_json::json!({"pageSize": 10}), Some(&request)),
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
    )
    .expect("fresh search");
    assert!(values(&fresh).contains("NEW_B"), "{}", values(&fresh));
}

/// Every view's values are present in the bytes they were scanned from,
/// so unchanged files keep reusing the stored scan: a matching file added
/// after page 1 stays unseen on page 2 instead of restarting the search.
#[test]
fn every_view_keeps_reusing_its_scan_while_files_are_unchanged() {
    let root = tempfile::tempdir().expect("fixture directory");
    let long = format!("{} needle tail {}", "x".repeat(300), "y".repeat(300));
    for name in ["a.txt", "b.txt", "c.txt"] {
        fs::write(
            root.path().join(name),
            format!("head\r\nlet needle = 1;\r\n{long}\nneedle\nmid ✓ line\nneedle again ✓\nend\n"),
        )
        .expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let views = [
        serde_json::json!({}),
        serde_json::json!({"contextLines": 2}),
        serde_json::json!({"matchContentLength": 20}),
        serde_json::json!({"resultView": "paginated", "contextLines": 3}),
        serde_json::json!({"resultView": "matchOnly", "matchContentLength": 5}),
        serde_json::json!({"resultView": "matchOnly", "unique": "count", "matchString": "needle[ a-z]*", "regex": "rust"}),
        serde_json::json!({"resultView": "files"}),
        serde_json::json!({"resultView": "countMatches"}),
        serde_json::json!({"multiline": "on", "matchString": "needle\\nmid", "regex": "rust"}),
    ];
    for (index, view) in views.iter().enumerate() {
        let request = ls_query(
            serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "pageSize": 1, "sort": "path"}),
            None,
        );
        let request = ls_query(view.clone(), Some(&request));
        let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .unwrap_or_else(|e| panic!("{view}: {}", e.message));
        let snapshot = first
            .source_snapshot
            .clone()
            .unwrap_or_else(|| panic!("{view}: no continuation"));
        let added = root.path().join(format!("a{index}.txt"));
        fs::write(&added, "needle\n").expect("new file");
        let second = execute_local_search(
            &ls_query(
                serde_json::json!({"snapshot": snapshot, "page": 2}),
                Some(&request),
            ),
            &policy,
            &security,
            &NeverCancel,
            None,
            None,
        )
        .unwrap_or_else(|e| panic!("{view}: stored scan not reused: {}", e.message));
        assert_eq!(second.files[0].path, "b.txt", "{view}");
        fs::remove_file(added).expect("cleanup");
    }
}

/// A stored key-shaped value is redacted on its first page; after the
/// source is swapped for innocuous text of the same size and time, the
/// stored value must not be checked against the new text and shown.
#[test]
fn a_stored_key_fragment_never_surfaces_after_a_stamp_preserving_swap() {
    let root = tempfile::tempdir().expect("fixture directory");
    let body = "QUJD".repeat(24);
    fs::write(
        root.path().join("a.ts"),
        "// QUJD visible harmless marker\n",
    )
    .expect("fixture");
    let key = root.path().join("b.ts");
    let old = format!("-----BEGIN PRIVATE KEY-----\n{body}\n-----END PRIVATE KEY-----\n");
    fs::write(&key, &old).expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "QUJD", "regex": "literal", "sort": "path", "include": ["*.ts"], "includeIgnored": true, "pageSize": 1}),
        None,
    );
    let (_, _, page_two) = first_page(&request, &policy, &security);
    let before = execute_local_search(&page_two, &policy, &security, &NeverCancel, None, None)
        .expect("page 2 from the stored scan");
    assert!(!values(&before).contains(&body), "{}", values(&before));
    assert!(values(&before).contains("REDACTED"), "{}", values(&before));
    let clean = format!(
        "// clean source replacement\n{}\n{}\n",
        "Z".repeat(body.len()),
        "// clean trailer".to_owned() + &" ".repeat("-----END PRIVATE KEY-----".len() - 16)
    );
    rewrite_keeping_stamp(&key, &clean);
    match execute_local_search(&page_two, &policy, &security, &NeverCancel, None, None) {
        Ok(result) => assert!(
            !values(&result).contains(&body),
            "old key body surfaced: {}",
            values(&result)
        ),
        Err(error) => assert_eq!(error.code, "staleSnapshot"),
    }
}

#[test]
fn capped_or_bound_results_are_partial_and_terminal_when_next_is_impossible() {
    use super::executor::classify_search;
    assert_eq!(
        classify_search(true, false, false, false, false, true),
        (SearchStatus::Empty, false)
    );
    assert_eq!(
        classify_search(true, false, false, false, true, true),
        (SearchStatus::Partial, true),
        "an empty result with unsearched content is partial, not empty"
    );
    assert_eq!(
        classify_search(false, true, false, false, false, true),
        (SearchStatus::Partial, true)
    );
    assert_eq!(
        classify_search(false, false, true, false, false, false),
        (SearchStatus::Partial, false)
    );
    assert_eq!(
        classify_search(false, false, true, false, false, true),
        (SearchStatus::Partial, true)
    );
    assert_eq!(
        classify_search(false, false, false, false, false, true),
        (SearchStatus::Success, false)
    );
}

/// Source directories with build-ish names are searched like any other;
/// only dependency/build caches are pruned.
#[test]
fn source_dirs_named_output_cache_vendor_are_searched_but_node_modules_is_not() {
    let root = tempfile::tempdir().expect("fixture directory");
    for dir in [
        "detail/output",
        "core/cache",
        "vendor/lib",
        "node_modules/pkg",
    ] {
        fs::create_dir_all(root.path().join(dir)).expect("dir");
        fs::write(root.path().join(dir).join("x.txt"), "needle\n").expect("file");
    }
    let policy = crate::tools::test_support::workspace_policy(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "resultView": "files"}),
        None,
    );
    let result = execute_local_search(
        &request,
        &policy,
        &ContentSecurity::new(),
        &NeverCancel,
        None,
        None,
    )
    .expect("search");
    let body = serde_json::to_string(&serde_json::to_value(&result).expect("json")).expect("text");
    for found in [
        "detail/output/x.txt",
        "core/cache/x.txt",
        "vendor/lib/x.txt",
    ] {
        assert!(body.contains(found), "{found} missing: {body}");
    }
    assert!(
        result
            .files
            .iter()
            .all(|file| !file.path.contains("node_modules")),
        "{body}"
    );
    // Not searched, but never silently: named with the escape flag.
    assert!(
        result.warnings.iter().any(|warning| warning
            == "Default excludes skipped 1 dir (node_modules/); the same search with defaultExcludes:false covers them."),
        "{body}"
    );
    // The lead that searches them is the one skipped-paths lead.
    let lead = &result.next.as_ref().expect("next")["includeSkipped"]["query"]["queries"][0];
    assert_eq!(lead["defaultExcludes"], false, "{body}");
}

/// Explicitly targeting a single file that the engine skips (over the
/// per-file byte ceiling → capped:true, capReason:"maxFileSize",
/// filesScanned:0) must explain the skip instead of returning a silent
/// "no matches" false negative.
#[test]
fn skipped_single_file_target_explains_the_cap_instead_of_silent_empty() {
    let root = tempfile::tempdir().expect("fixture directory");
    let oversized = root.path().join("huge.txt");
    // Sparse file over the engine's 512 MiB line-search ceiling: the skip
    // is decided on metadata length, so no bytes need to be written.
    let file = fs::File::create(&oversized).expect("fixture");
    file.set_len(512 * 1024 * 1024 + 1).expect("sparse length");
    drop(file);
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": oversized.to_string_lossy().into_owned(), "matchString": "needle".to_string()}),
        None,
    );

    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let body = serde_json::to_value(&result).expect("serialize");

    assert_eq!(body["filesScanned"], 0, "{body}");
    assert!(
        body["partialReasons"]
            .as_array()
            .is_some_and(|reasons| reasons.iter().any(|reason| reason == "maxFileSize")),
        "{body}"
    );
    let hint = body["hints"][0].as_str().expect("skip hint");
    assert!(hint.contains("skipped"), "{hint}");
    assert!(hint.contains("maxFileSize"), "{hint}");
    assert!(hint.contains("localFetch"), "{hint}");
}

fn search_fixture(files: &[(&str, &str)], request: LocalSearchQuery) -> serde_json::Value {
    let root = tempfile::tempdir().expect("fixture directory");
    for (name, body) in files {
        let path = root.path().join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("fixture dir");
        }
        fs::write(path, body).expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned()}),
        Some(&request),
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    serde_json::to_value(&result).expect("serialize")
}

/// The declaration row `index` of `file` sits in: its own `enclosing`, or
/// the nearest earlier row whose `enclosing.line` is its `enclosingLine`.
fn owner_of(file: &serde_json::Value, index: usize) -> Option<serde_json::Value> {
    let rows = file["matches"].as_array().expect("rows");
    if let Some(own) = rows[index].get("enclosing") {
        return Some(own.clone());
    }
    let line = rows[index].get("enclosingLine")?;
    let owner = rows[..index]
        .iter()
        .rev()
        .filter_map(|row| row.get("enclosing"))
        .find(|enclosing| enclosing["line"] == *line);
    Some(
        owner
            .unwrap_or_else(|| panic!("row {index} refs line {line} no earlier row names: {file}"))
            .clone(),
    )
}

/// Rows in one declaration name it once: the first carries `enclosing`,
/// the rest `enclosingLine` (its name line), and every row still resolves
/// to its owner. The page is smaller than naming it on every row.
#[test]
fn rows_in_one_declaration_name_it_once_and_the_rest_reference_it() {
    let source = "fn f() {\n    helper();\n    helper();\n    helper();\n}\n\nfn g() {\n    helper();\n}\n\nfn h() {\n    helper();\n    helper();\n}\n";
    let body = search_fixture(
        &[("src/a.rs", source)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let file = &body["files"][0];
    let rows = file["matches"].as_array().expect("rows");
    assert_eq!(rows.len(), 6, "{body}");
    let named: Vec<bool> = rows
        .iter()
        .map(|row| row.get("enclosing").is_some())
        .collect();
    assert_eq!(named, [true, false, false, true, true, false], "{body}");
    assert_eq!(rows[1]["enclosingLine"], 1, "{body}");
    assert_eq!(rows[2]["enclosingLine"], 1, "{body}");
    assert_eq!(rows[5]["enclosingLine"], 11, "{body}");
    assert!(rows[0].get("enclosingLine").is_none(), "{body}");
    let owners: Vec<String> = (0..rows.len())
        .map(|i| {
            owner_of(file, i).expect("owner")["symbolName"]
                .as_str()
                .expect("name")
                .to_owned()
        })
        .collect();
    assert_eq!(owners, ["f", "f", "f", "g", "h", "h"], "{body}");
    // Bytes: one full object per declaration, a number for each repeat.
    let full = r#""enclosing":{"symbolName":"f","kind":"function","line":1,"endLine":5}"#.len();
    let bare: usize = rows
        .iter()
        .map(|row| {
            let mut row = row.clone();
            row.as_object_mut()
                .expect("row")
                .retain(|key, _| !key.starts_with("enclosing"));
            row.to_string().len()
        })
        .sum();
    let shown: usize = rows.iter().map(|row| row.to_string().len()).sum();
    // Naming it on every row would add 6 full objects; 3 repeats are a
    // number instead (about 50 bytes each).
    let every_row = bare + 6 * (full + 1);
    assert!(shown + 100 < every_row, "{shown} vs {every_row}: {body}");
    // A sweep names its owner once, then references it 59 times.
    let sweep = format!("fn many() {{\n{}}}\n", "    helper();\n".repeat(60));
    let wide = search_fixture(
        &[("src/b.rs", &sweep)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let text = wide["files"][0]["matches"].to_string();
    assert_eq!(text.matches("\"enclosing\":").count(), 1, "{wide}");
    assert_eq!(text.matches("\"enclosingLine\":1").count(), 59, "{wide}");
}

/// Two declarations sharing a name line (an impl and its first method)
/// stay distinguishable: a reference means the nearest earlier row naming
/// that line, so a row whose owner is not that one names its own.
#[test]
fn enclosing_references_stay_unambiguous_when_name_lines_collide() {
    let source = "impl X { fn a() {\n    helper();\n}\n    const C: u8 = helper();\n    const D: u8 = helper();\n}\n";
    let body = search_fixture(
        &[("src/c.rs", source)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let file = &body["files"][0];
    let rows = file["matches"].as_array().expect("rows");
    assert_eq!(rows.len(), 3, "{body}");
    let owners: Vec<serde_json::Value> =
        (0..3).map(|i| owner_of(file, i).expect("owner")).collect();
    assert_eq!(owners[0]["symbolName"], "a", "{body}");
    assert_eq!(owners[1]["symbolName"], "X", "{body}");
    assert_eq!(owners[2]["symbolName"], "X", "{body}");
    // Row 1 shares name line 1 with row 0's owner but is another declaration.
    assert!(rows[1].get("enclosing").is_some(), "{body}");
    assert_eq!(rows[2]["enclosingLine"], 1, "{body}");
}

/// `include` naming a directory path scopes the search to its files
/// (it used to match nothing: filesScanned 0 read as "no text match").
#[test]
fn a_directory_path_include_searches_its_files() {
    let body = search_fixture(
        &[("pkg/src/a.ts", "needle\n"), ("pkg/test/b.ts", "needle\n")],
        ls_query(
            serde_json::json!({"matchString": "needle", "include": ["pkg/src"]}),
            None,
        ),
    );
    let text = body.to_string();
    assert!(text.contains("pkg/src/a.ts"), "{body}");
    assert!(!text.contains("pkg/test/b.ts"), "{body}");
}

/// Globs match paths under `path`, so a `..` segment never matches: an
/// include that reaches up searches nothing, and an exclude that does
/// excludes nothing. Both name the glob.
#[test]
fn a_glob_that_reaches_above_path_is_named() {
    for (glob, key) in [("../src/*.ts", "include"), ("../pkg/**", "exclude")] {
        let body = search_fixture(
            &[("pkg/src/a.ts", "needle\n")],
            ls_query(
                serde_json::json!({"matchString": "needle", key: [glob]}),
                None,
            ),
        );
        let warnings = body["warnings"].to_string();
        assert!(
            warnings.contains(glob) && warnings.contains(".."),
            "{key} {glob}: {body}"
        );
    }
}

/// The listing lead after a `..` include leaves the glob out: re-sending it
/// to structureSearch would list nothing again.
#[test]
fn the_listing_lead_leaves_out_a_glob_that_reaches_above_path() {
    let body = search_fixture(
        &[("pkg/src/a.ts", "needle\n")],
        ls_query(
            serde_json::json!({"matchString": "needle", "include": ["../src/*.ts", "*.md"]}),
            None,
        ),
    );
    let listing = &body["next"]["viewTree"]["query"]["queries"][0];
    assert_eq!(listing["include"], serde_json::json!(["*.md"]), "{body}");
}

/// When include/exclude leave no file to search, the row says the scope
/// matched nothing instead of suggesting a different spelling of the text.
#[test]
fn an_include_that_matches_no_file_says_so() {
    let body = search_fixture(
        &[("pkg/src/a.ts", "needle\n")],
        ls_query(
            serde_json::json!({"matchString": "Needle", "include": ["nowhere/dir"]}),
            None,
        ),
    );
    assert_eq!(body["filesScanned"], 0, "{body}");
    let hint = body["hints"][0].as_str().expect("scope hint");
    assert!(hint.contains("include/exclude matched no file"), "{hint}");
    assert!(
        hint.chars().count() <= 120,
        "clipped by the response stage: {hint}"
    );
    assert!(
        !body["hints"].to_string().contains("all-lowercase"),
        "{body}"
    );
}

/// A small page names each hit's enclosing declaration (a definition hit
/// names the one around it), and a searched symbol declared on a hit
/// line yields an lspSearch lead anchored on that line (`callers` for a
/// function) when a language server would start for the file. A sweep of
/// more hits than one small page stays plain lines.
#[test]
fn small_pages_name_enclosing_declarations_and_lead_to_callers() {
    let source = "struct Harness;\nimpl Harness {\n    fn try_read_output(&self) {\n        helper();\n    }\n}\n\nfn helper() {}\n\nfn caller() {\n    helper();\n}\n";
    let body = search_fixture(
        &[("src/a.rs", source)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let rows = &body["files"][0]["matches"];
    assert_eq!(rows[0]["line"], 4, "{body}");
    assert_eq!(
        rows[0]["enclosing"],
        serde_json::json!({"symbolName":"try_read_output","kind":"method","line":3,"endLine":5}),
        "{body}"
    );
    assert_eq!(rows[1]["line"], 8, "{body}");
    assert!(rows[1].get("enclosing").is_none(), "{body}");
    assert_eq!(
        rows[2]["enclosing"],
        serde_json::json!({"symbolName":"caller","kind":"function","line":10,"endLine":12}),
        "{body}"
    );
    let lead = &body["next"]["findCallers"];
    let declared_at = body["files"][0]["path"].as_str().expect("path").to_owned();
    let server = crate::tools::leads::lsp::verify_query(
        &declared_at,
        "helper",
        8,
        crate::tools::leads::lsp::Verify::Callers,
    );
    if server.is_none() {
        assert!(lead.is_null(), "no language server, no lead: {body}");
        return;
    }
    assert_eq!(lead["tool"], "lspSearch", "{body}");
    assert_eq!(
        lead["query"]["queries"][0]["operation"], "callers",
        "{body}"
    );
    assert_eq!(
        lead["query"]["queries"][0]["symbolName"], "helper",
        "{body}"
    );
    assert_eq!(lead["query"]["queries"][0]["line"], 8, "{body}");
    let uri = lead["query"]["queries"][0]["path"].as_str().expect("path");
    assert!(
        std::path::Path::new(uri).is_absolute() && uri.ends_with("src/a.rs"),
        "{uri}"
    );

    let keyword = search_fixture(
        &[("src/a.rs", source)],
        ls_query(serde_json::json!({"matchString": "fn helper"}), None),
    );
    assert_eq!(
        keyword["next"]["findCallers"]["query"]["queries"][0]["line"], 8,
        "{keyword}"
    );
    let insensitive = search_fixture(
        &[("src/a.rs", source)],
        ls_query(
            serde_json::json!({"matchString": "helper", "caseMode": "insensitive"}),
            None,
        ),
    );
    assert!(
        insensitive["next"].get("callers").is_none(),
        "{insensitive}"
    );

    // Every hit in one declaration names it (a later row without it
    // read as "no enclosing function"); a hit outside any has none.
    let run =
        "fn f() {\n    helper();\n    helper();\n    helper();\n}\nstatic H: fn() = helper;\n";
    let body = search_fixture(
        &[("src/r.rs", run)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let rows = &body["files"][0]["matches"];
    for row in 0..3 {
        assert_eq!(
            owner_of(&body["files"][0], row),
            Some(serde_json::json!({"symbolName":"f","kind":"function","line":1,"endLine":5})),
            "{body}"
        );
    }
    assert_eq!(rows[3]["line"], 6, "{body}");
    assert!(rows[3].get("enclosing").is_none(), "{body}");

    // A declaration search names the owner of declaring hits only: the
    // other hits are text that merely mentions the declaration.
    let mentions = "impl Harness {\n    fn try_read_output(&self) {}\n}\nfn caller() {\n    let s = \"fn try_read_output\";\n}\n";
    let body = search_fixture(
        &[("src/m.rs", mentions)],
        ls_query(
            serde_json::json!({"matchString": "fn try_read_output"}),
            None,
        ),
    );
    let rows = &body["files"][0]["matches"];
    assert_eq!(
        rows[0]["enclosing"],
        serde_json::json!({"symbolName":"Harness","kind":"impl","line":1,"endLine":3}),
        "{body}"
    );
    assert_eq!(rows[1]["line"], 5, "{body}");
    assert!(rows[1].get("enclosing").is_none(), "{body}");

    let sweep = format!("fn many() {{\n{}}}\n", "    helper();\n".repeat(60));
    let wide = search_fixture(
        &[("src/b.rs", &sweep)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    // A sweep names its owner on every row.
    let rows = wide["files"][0]["matches"].as_array().expect("rows");
    assert_eq!(rows.len(), 60, "{wide}");
    assert!(
        (0..rows.len()).all(|row| owner_of(&wide["files"][0], row)
            == Some(
                serde_json::json!({"symbolName":"many","kind":"function","line":1,"endLine":62})
            )),
        "{wide}"
    );
}

/// A result within the page budget and one page of files is shown whole
/// with no paging metadata, however many hits it has; a larger one opens
/// with 10 rows per file, more files than a page walk by page (see
/// `a_small_result_over_one_page_of_files_still_pages_by_file_count`), and
/// a caller cap always wins.
#[test]
fn a_small_result_shows_every_hit_without_paging() {
    let small = "needle\n".repeat(13);
    let body = search_fixture(
        &[("a.txt", &small)],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    let file = &body["files"][0];
    assert_eq!(file["matches"].as_array().map(Vec::len), Some(13), "{body}");
    assert!(file.get("pagination").is_none(), "{body}");
    assert!(body.get("pagination").is_none(), "{body}");
    assert!(body["next"].get("nextMatchPage").is_none(), "{body}");
    let many_files: Vec<(String, String)> = (0..20)
        .map(|n| (format!("f{n:02}.txt"), "needle\n".to_owned()))
        .collect();
    let refs: Vec<(&str, &str)> = many_files
        .iter()
        .map(|(name, body)| (name.as_str(), body.as_str()))
        .collect();
    let spread = search_fixture(
        &refs,
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert_eq!(
        spread["files"].as_array().map(Vec::len),
        Some(20),
        "a page of files is shown whole"
    );
    assert!(spread.get("pagination").is_none(), "{spread}");
    // Far more than one old match page, still well within the budget.
    let moderate = "needle\n".repeat(150);
    let body = search_fixture(
        &[("a.txt", &moderate)],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert_eq!(
        body["files"][0]["matches"].as_array().map(Vec::len),
        Some(150),
        "{body}"
    );
    assert!(body.get("next").is_none(), "{body}");
    let large = "needle\n".repeat(1200);
    let body = search_fixture(
        &[("a.txt", &large)],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert_eq!(
        body["files"][0]["matches"].as_array().map(Vec::len),
        Some(10)
    );
    assert!(body["next"]["nextPage"].is_object(), "{body}");
    assert!(body["next"].get("nextMatchPage").is_none(), "{body}");
    assert_eq!(body["files"][0]["pagination"]["hasMore"], true, "{body}");
    let capped = search_fixture(
        &[("a.txt", &small)],
        ls_query(
            serde_json::json!({"matchString": "needle", "matchPageSize": 10}),
            None,
        ),
    );
    assert_eq!(
        capped["files"][0]["matches"].as_array().map(Vec::len),
        Some(10)
    );
}

/// The first page of a complete result hands off one localFetch read: the
/// searched symbol's shown declaration whole, else the top file's hits
/// (±6-line ranges), so the next call reads instead of re-searching;
/// already-contextual results do not.
#[test]
fn a_small_complete_result_hands_off_a_read_of_its_top_file() {
    let body = search_fixture(
        &[("src/a.py", "x = 1\ny = needle\nprint(needle)\n")],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    let read = &body["next"]["read"];
    assert_eq!(read["tool"], "localFetch", "{body}");
    let query = &read["query"]["queries"][0];
    assert!(
        query["path"]
            .as_str()
            .is_some_and(|path| path.ends_with("src/a.py")),
        "{body}"
    );
    // The read names the hits' ±6-line windows as ranges: exactly the
    // shown hits, whatever localFetch's matchString dialect would match.
    assert_eq!(query["ranges"], serde_json::json!(["1-9"]), "{body}");
    assert!(query.get("matchString").is_none(), "{body}");
    let mut runnable = query.clone();
    runnable["mainGoal"] = serde_json::json!("g");
    runnable["reasoning"] = serde_json::json!("r");
    crate::contracts::validate_query("localFetch", runnable).expect("valid localFetch read");
    let apart: String = (1..=40)
        .map(|line| {
            if line == 3 || line == 30 {
                "needle\n".to_owned()
            } else {
                "x\n".to_owned()
            }
        })
        .collect();
    let apart = search_fixture(
        &[("a.py", &apart)],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert_eq!(
        apart["next"]["read"]["query"]["queries"][0]["ranges"],
        serde_json::json!(["1-9", "24-36"]),
        "{apart}"
    );
    // A declaration search reads the declaring file, wherever its
    // hit count ranks it.
    let mention = "s = 'def needle'\nt = 'def needle'\nu = 'def needle'\n";
    let declared = search_fixture(
        &[
            ("a.py", mention),
            ("b.py", "x = 1\ndef needle():\n    pass\n"),
        ],
        ls_query(serde_json::json!({"matchString": "def needle"}), None),
    );
    assert_eq!(declared["files"][0]["path"], "a.py", "{declared}");
    let read = &declared["next"]["read"]["query"]["queries"][0];
    assert!(
        read["path"]
            .as_str()
            .is_some_and(|path| path.ends_with("b.py")),
        "{declared}"
    );
    // The declaration itself, whole.
    assert_eq!(read["ranges"], serde_json::json!(["2-3"]), "{declared}");
    // A declaration longer than one block read (a large class) is not read
    // whole: the read takes its hit in context, and localFetch offers the
    // member that window cuts.
    let long = format!("x = 1\ndef needle():\n{}", "    pass\n".repeat(450));
    let large = search_fixture(
        &[("b.py", &long)],
        ls_query(serde_json::json!({"matchString": "def needle"}), None),
    );
    assert_eq!(
        large["next"]["read"]["query"]["queries"][0]["ranges"],
        serde_json::json!(["1-8"]),
        "{large}"
    );
    // More windows than one ranges read holds: the read matches the text.
    let scattered: String = (1..=11)
        .map(|_| "needle_a\n".to_owned() + &"x\n".repeat(13))
        .collect();
    let regex = search_fixture(
        &[("a.py", &scattered)],
        ls_query(
            serde_json::json!({"matchString": "needle_(a|b)", "regex": "rust"}),
            None,
        ),
    );
    let read = &regex["next"]["read"]["query"]["queries"][0];
    assert_eq!(read["matchString"], "needle_(a|b)", "{regex}");
    assert_eq!(read["contextLines"], 6, "{regex}");
    assert_eq!(read["regex"], "rust", "{regex}");
    let wide = search_fixture(
        &[
            ("a.py", "needle\n"),
            ("b.py", "needle\n"),
            ("c.py", "needle\n"),
            ("d.py", "needle\n"),
        ],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    // A wider result still reads its top file: the natural next step.
    assert!(
        wide["next"]["read"]["query"]["queries"][0]["path"]
            .as_str()
            .is_some_and(|path| path.ends_with("a.py")),
        "{wide}"
    );
    let context = search_fixture(
        &[("a.py", "x\nneedle\ny\n")],
        ls_query(
            serde_json::json!({"matchString": "needle", "contextLines": 1}),
            None,
        ),
    );
    assert!(
        context
            .get("next")
            .is_none_or(|next| next.get("read").is_none()),
        "{context}"
    );
}

fn all_values(body: &serde_json::Value) -> String {
    body["files"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|f| f["matches"].as_array().cloned().unwrap_or_default())
        .map(|m| m["value"].as_str().unwrap_or_default().to_owned())
        .collect::<Vec<_>>()
        .join("\n")
}

// A clipped value (matchOnly span, matchContentLength) must not
// leak a partial secret that no longer matches the secret patterns.
#[test]
fn clipped_values_never_leak_partial_secrets() {
    let token = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
    let file = format!("token: {token} end\n");
    let cases = [
        ls_query(
            serde_json::json!({"matchString": "ghp_[0-9a-z]{20}".to_string(), "regex": "rust", "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
        ls_query(
            serde_json::json!({"matchString": "token".to_string(), "resultView": LocalSearchQueryResultView::MatchOnly, "matchContentLength": 4}),
            None,
        ),
        ls_query(
            serde_json::json!({"matchString": "end".to_string(), "resultView": LocalSearchQueryResultView::MatchOnly, "matchContentLength": 2}),
            None,
        ),
        ls_query(
            serde_json::json!({"matchString": "token".to_string(), "matchContentLength": 30}),
            None,
        ),
    ];
    for request in cases {
        let body = search_fixture(&[("sec.txt", &file)], request);
        let values = all_values(&body);
        assert!(!values.is_empty());
        for fragment in ["1234567890", "klmnopqrstuvwxyz"] {
            assert!(!values.contains(fragment), "leaked {fragment}: {values}");
        }
    }
    // Clean lines in the same file keep their exact values.
    let body = search_fixture(
        &[("sec.txt", &format!("{file}plain needle line\n"))],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    assert_eq!(all_values(&body), "needle");
}

#[test]
fn short_spans_inside_private_key_bodies_are_redacted() {
    let file = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpQIBAAKCAQEAinteriorKeyBodyQWERTYAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END RSA PRIVATE KEY-----\n";
    let body = search_fixture(
        &[("key.rs", file)],
        ls_query(
            serde_json::json!({"matchString": "interior".to_string(), "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    assert!(!all_values(&body).contains("interior"), "{body}");
}

/// A literal marker string in ordinary source opens a block that never
/// closes; the code after it must stay readable, while a real key's body
/// (here also unterminated) stays redacted.
#[test]
fn code_after_a_literal_key_marker_stays_readable() {
    let literal = "const PEM = \"-----BEGIN RSA PRIVATE KEY-----\";\nlet needle_one = compute();\nfn needle_two() {}\n";
    let body = search_fixture(
        &[("src.rs", literal)],
        ls_query(
            serde_json::json!({"matchString": "needle_", "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    assert_eq!(all_values(&body), "needle_\nneedle_", "{body}");
    assert!(!all_values(&body).contains("REDACTED"), "{body}");
    let key = "-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEpQIBAAKCAQEAinteriorKeyBodyQWERTYAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nfn needle_after() {}\n";
    let body = search_fixture(
        &[("key.rs", key)],
        ls_query(
            serde_json::json!({"matchString": "interior|needle_after", "regex": "rust", "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    let values = all_values(&body);
    assert!(!values.contains("interior"), "{body}");
    assert!(values.contains("needle_after"), "{body}");
}

/// Sources above the whole-file key-scan cap are verified by the streamed
/// prefix pass: late interior key bodies stay redacted (terminated or
/// not), while innocent base64 outside any block stays readable.
#[test]
fn late_key_bodies_in_large_sources_stay_redacted() {
    let filler = "let filler_value = 0;\n".repeat(560_000);
    let body = "MIIEpQIBAAKCAQEAinteriorKeyBodyQWERTYAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let innocent = "QUJDREVGR0hJSktMTU5PUFFSU1RVinnocentB64VldYWVowMTIzNDU2Nzg5";
    let terminated = format!(
        "{innocent}\n{filler}-----BEGIN RSA PRIVATE KEY-----\n{body}\n-----END RSA PRIVATE KEY-----\n"
    );
    let unterminated =
        format!("{innocent}\n{filler}-----BEGIN OPENSSH PRIVATE KEY-----\n{body}\n{body}\n");
    for content in [&terminated, &unterminated] {
        assert!(content.len() as u64 > 10 * 1024 * 1024);
        for view in ["matchOnly", "paginated"] {
            let found = search_fixture(
                &[("big.txt", content.as_str())],
                ls_query(
                    serde_json::json!({"matchString": "interior", "resultView": view, "contextLines": 0}),
                    None,
                ),
            );
            assert_eq!(found["files"][0]["matches"][0]["line"], 560_003, "{found}");
            assert!(!all_values(&found).contains("interior"), "{found}");
        }
        let readable = search_fixture(
            &[("big.txt", content.as_str())],
            ls_query(
                serde_json::json!({"matchString": "innocentB64", "resultView": "paginated", "contextLines": 0}),
                None,
            ),
        );
        assert!(all_values(&readable).contains(innocent), "{readable}");
    }
}

#[test]
fn next_page_restarts_match_rows_and_next_match_page_tracks_shown_files() {
    let many = "foo\n".repeat(5);
    let files = [
        ("a.txt", many.as_str()),
        ("b.txt", "foo\n"),
        ("c.txt", many.as_str()),
    ];
    let body = search_fixture(
        &files,
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "pageSize": 2, "matchPage": 3, "matchPageSize": 2, "contextLines": 0, "sort": LocalSearchQuerySort::Path}),
            None,
        ),
    );
    // Page 1 at matchPage 3: a.txt's 5th row is shown, nothing is left over.
    assert!(
        body["next"].get("nextMatchPage").is_none(),
        "{}",
        body["next"]
    );
    assert_eq!(
        body["next"]["nextPage"]["query"]["queries"][0]["matchPage"],
        1
    );
    let body = search_fixture(
        &files,
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "pageSize": 2, "page": 2, "matchPageSize": 2, "contextLines": 0, "sort": LocalSearchQuerySort::Path}),
            None,
        ),
    );
    assert_eq!(
        body["next"]["nextMatchPage"]["query"]["queries"][0]["matchPage"],
        2
    );
}

#[test]
fn two_axis_pages_form_one_exact_once_continuation_chain() {
    let root = tempfile::tempdir().expect("fixture");
    for (name, count) in [("a.txt", 3), ("b.txt", 2), ("c.txt", 2)] {
        std::fs::write(root.path().join(name), "foo\n".repeat(count)).expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let mut request = ls_query(
        serde_json::json!({
            "path":root.path(), "matchString":"foo", "pageSize":2,
            "matchPageSize":2, "sort":"path", "contextLines":0,
            "goals":["find every foo row"]
        }),
        None,
    );
    let mut seen = std::collections::HashSet::new();
    let mut queries = std::collections::HashSet::new();
    let mut pages = 0;
    loop {
        let key = serde_json::to_string(&request).expect("query");
        assert!(
            queries.insert(key),
            "continuation repeated an executable query"
        );
        let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .expect("page");
        pages += 1;
        for file in &result.files {
            for row in file.matches.iter().flatten() {
                assert!(
                    seen.insert((file.path.clone(), row.line)),
                    "repeated evidence"
                );
            }
        }
        let Some(next) = result.next else {
            break;
        };
        let match_page = next.get("nextMatchPage");
        let file_page = next.get("nextPage");
        assert!(
            match_page.is_none() || file_page.is_none(),
            "duplicate page route: {next}"
        );
        let continuation = match_page.or(file_page).expect("one page route");
        request = serde_json::from_value(continuation["query"]["queries"][0].clone())
            .expect("continuation query");
        assert!(pages < 10, "pagination must terminate");
    }
    assert_eq!(pages, 3);
    assert_eq!(seen.len(), 7);
}

/// A grid page names `nextMatchPage` while rows remain in its files, then
/// `nextPage` for later files. Row totals live once, as `matchedLineCount`
/// beside the occurrence
/// count, and a later match page says which match page it shows.
#[test]
fn grid_pages_count_the_rows_a_match_page_reaches_and_name_the_match_page() {
    let many = "foo\n".repeat(5);
    let files = [
        ("a.txt", many.as_str()),
        ("b.txt", "foo foo\n"),
        ("c.txt", many.as_str()),
    ];
    let request = |match_page: u32| {
        ls_query(
            serde_json::json!({"matchString": "foo", "pageSize": 2, "matchPage": match_page, "matchPageSize": 2, "sort": LocalSearchQuerySort::Path}),
            None,
        )
    };
    let body = search_fixture(&files, request(1));
    // The shared page stage says how many rows `nextMatchPage` reaches.
    assert!(body.get("warnings").is_none(), "{body}");
    assert!(body["next"].get("nextMatchPage").is_some(), "{body}");
    assert!(body["pagination"].get("matchCount").is_none(), "{body}");
    assert!(body["pagination"].get("matchPage").is_none(), "{body}");
    assert_eq!(body["matchedLineCount"], 11, "{body}");
    assert_eq!(body["matchCount"], 12, "{body}");
    let second = search_fixture(&files, request(2));
    assert_eq!(second["pagination"]["currentPage"], 1, "{second}");
    assert_eq!(second["pagination"]["matchPage"], 2, "{second}");
    assert!(second["next"].get("nextMatchPage").is_some(), "{second}");
}

#[test]
fn a_clipped_file_shows_its_deciding_hits_first_and_lists_the_rest() {
    // Comment and call hits come first by line; the assignment and the
    // branch that decide behaviour sit past the per-file cap.
    let mut file = String::new();
    for _ in 0..4 {
        file.push_str(" * maximumSize doc\n");
    }
    for _ in 0..3 {
        file.push_str("check(maximumSize);\n");
    }
    file.push_str("this.maximumSize = maximumSize;\n"); // line 8
    file.push_str("if (maximumSize > 0) {\n"); // line 9
    let request = |match_page| {
        ls_query(
            serde_json::json!({"matchString": "maximumSize", "matchPageSize": 3, "matchPage": match_page, "contextLines": 0}),
            None,
        )
    };
    let lines = |body: &serde_json::Value| -> Vec<u64> {
        body["files"][0]["matches"]
            .as_array()
            .expect("matches")
            .iter()
            .filter_map(|m| m["line"].as_u64())
            .collect()
    };
    let first = search_fixture(&[("CacheBuilder.java", &file)], request(1));
    // Page 1 holds the best-ranked rows, shown in source order.
    assert_eq!(lines(&first), [5, 8, 9], "{first}");
    // The rows still unseen are named, cheap to read at their lines.
    assert_eq!(
        first["files"][0]["pagination"]["moreLines"],
        serde_json::json!([1, 2, 3, 4, 6, 7]),
        "{first}"
    );
    let second = search_fixture(&[("CacheBuilder.java", &file)], request(2));
    assert_eq!(lines(&second), [1, 6, 7], "{second}");
    assert_eq!(
        second["files"][0]["pagination"]["moreLines"],
        serde_json::json!([2, 3, 4])
    );
    let last = search_fixture(&[("CacheBuilder.java", &file)], request(3));
    assert_eq!(lines(&last), [2, 3, 4], "{last}");
    assert!(last["files"][0].get("pagination").is_none(), "{last}");
}

#[test]
fn a_repeated_row_follows_every_distinct_row_of_a_clipped_file() {
    // Identical impls of one trait method rank as declarations, but the
    // second copy adds nothing over the distinct call site.
    let file = "fn needle() {\nfn needle() {\ncall(needle);\n";
    let body = search_fixture(
        &[("a.rs", file)],
        ls_query(
            serde_json::json!({"matchString": "needle", "matchPageSize": 2, "contextLines": 0}),
            None,
        ),
    );
    let lines: Vec<u64> = body["files"][0]["matches"]
        .as_array()
        .expect("matches")
        .iter()
        .filter_map(|m| m["line"].as_u64())
        .collect();
    assert_eq!(lines, [1, 3], "{body}");
    assert_eq!(
        body["files"][0]["pagination"]["moreLines"],
        serde_json::json!([2])
    );
}

#[test]
fn line_rows_omit_the_column_that_span_rows_need() {
    let files = [("a.txt", "x needle needle\n")];
    let lines = search_fixture(
        &files,
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert!(
        lines["files"][0]["matches"][0].get("column").is_none(),
        "{lines}"
    );
    let spans = search_fixture(
        &files,
        ls_query(
            serde_json::json!({"matchString": "needle", "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    let columns: Vec<u64> = spans["files"][0]["matches"]
        .as_array()
        .expect("spans")
        .iter()
        .filter_map(|m| m["column"].as_u64())
        .collect();
    assert_eq!(columns, [3, 10], "{spans}");
}

#[test]
fn later_match_pages_omit_files_exhausted_on_earlier_pages() {
    let many = "foo\n".repeat(5);
    let files = [("a.txt", many.as_str()), ("b.txt", "foo\n")];
    let request = |match_page| {
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "matchPage": match_page, "matchPageSize": 2, "contextLines": 0, "sort": LocalSearchQuerySort::Path}),
            None,
        )
    };
    let body = search_fixture(&files, request(2));
    let paths: Vec<&str> = body["files"]
        .as_array()
        .expect("files")
        .iter()
        .filter_map(|file| file["path"].as_str())
        .collect();
    assert_eq!(paths, ["a.txt"], "{body}");
    // Every file exhausted: keep the out-of-range diagnostic rows.
    let body = search_fixture(&files, request(9));
    assert_eq!(body["files"][0]["pagination"]["outOfRange"], true, "{body}");
}

#[test]
fn list_views_have_no_match_rows_to_page() {
    let body = search_fixture(
        &[("a.txt", &"foo\n".repeat(15))],
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "resultView": LocalSearchQueryResultView::Files}),
            None,
        ),
    );
    assert!(body.get("next").is_none(), "{}", body["next"]);
    assert_ne!(body["status"], "partial", "{body}");
}

#[test]
fn binary_prefix_matches_mark_a_search_partial_and_terminal() {
    // Matches before the NUL do not prove the rest of the file was
    // searched: the cut is a coverage limit no continuation can lift.
    let body = search_fixture(
        &[("bin.dat", "foo\u{0}foo\n"), ("a.txt", "foo\n")],
        ls_query(serde_json::json!({"matchString": "foo".to_string()}), None),
    );
    assert_eq!(body["isPartial"], true, "{body}");
    assert_eq!(body["terminalLimit"], true, "{body}");
    assert!(body["next"].get("nextPage").is_none(), "{body}");
    assert_eq!(
        body["partialReasons"],
        serde_json::json!(["binaryQuit"]),
        "{body}"
    );
    // localFetch rejects binary files, so a binary file is never the read:
    // the read takes the shown text hit.
    let read = &body["next"]["read"];
    assert_eq!(read["tool"], "localFetch", "{body}");
    assert_eq!(
        read["query"]["queries"][0]["path"]
            .as_str()
            .map(|path| path.ends_with("a.txt")),
        Some(true),
        "{body}"
    );
    assert!(!body.to_string().contains("bin.dat\",\"ranges"), "{body}");
}

#[test]
fn reverse_applies_to_default_relevance_order() {
    let files = [("a.txt", "foo\nfoo\nfoo\n"), ("b.txt", "foo\n")];
    let order = |reverse| {
        let body = search_fixture(
            &files,
            ls_query(
                serde_json::json!({"matchString": "foo".to_string(), "reverse": reverse}),
                None,
            ),
        );
        body["files"]
            .as_array()
            .expect("files")
            .iter()
            .map(|f| f["path"].as_str().unwrap_or_default().to_owned())
            .collect::<Vec<_>>()
    };
    assert_eq!(order(None), ["a.txt", "b.txt"]);
    assert_eq!(order(Some(true)), ["b.txt", "a.txt"]);
}

fn ranked_paths(files: &[(&str, &str)], fields: serde_json::Value) -> Vec<String> {
    let body = search_fixture(files, ls_query(fields, None));
    body["files"]
        .as_array()
        .expect("files")
        .iter()
        .map(|f| f["path"].as_str().unwrap_or_default().to_owned())
        .collect()
}

#[test]
fn relevance_ranks_a_declaration_hit_above_a_comment_or_string_hit_at_equal_count() {
    // Path order alone would put the comment and string hits first.
    let files = [
        ("a_comment.rs", "// parse_config reads the file\n"),
        ("b_string.rs", "let label = \"parse_config\";\n"),
        ("c_call.rs", "let cfg = parse_config(path);\n"),
        ("d_decl.rs", "pub fn parse_config(path: &str) -> Config {\n"),
    ];
    for view in ["paginated", "countMatches", "countLines", "matchOnly"] {
        assert_eq!(
            ranked_paths(
                &files,
                serde_json::json!({"matchString": "parse_config", "resultView": view}),
            ),
            ["d_decl.rs", "c_call.rs", "a_comment.rs", "b_string.rs"],
            "view {view}"
        );
    }
}

#[test]
fn relevance_ranks_a_source_file_above_test_and_generated_files_at_equal_count() {
    let hit = "let cfg = parse_config(path);\n";
    let files = [
        ("a/tests/config.rs", hit),
        ("b/config_test.go", hit),
        ("c/config.test.ts", hit),
        ("d/generated/config.rs", hit),
        ("e/vendor/config.go", hit),
        ("z/src/config.rs", hit),
    ];
    let ranked = ranked_paths(&files, serde_json::json!({"matchString": "parse_config"}));
    assert_eq!(ranked[0], "z/src/config.rs", "{ranked:?}");
    // The demoted rest keeps a total order: path breaks the tie, and a
    // generated file follows every hand-written one.
    assert_eq!(
        &ranked[1..],
        [
            "a/tests/config.rs",
            "b/config_test.go",
            "c/config.test.ts",
            "e/vendor/config.go",
            "d/generated/config.rs",
        ]
    );
    // Match count still dominates: two test hits beat one source hit.
    let ranked = ranked_paths(
        &[
            ("a/tests/config.rs", "parse_config();\nparse_config();\n"),
            ("z/src/config.rs", hit),
        ],
        serde_json::json!({"matchString": "parse_config"}),
    );
    assert_eq!(ranked, ["a/tests/config.rs", "z/src/config.rs"]);
}

#[test]
fn relevance_on_path_list_views_demotes_test_paths_and_path_sort_does_not() {
    let hit = "parse_config();\n";
    let files = [("a/tests/config.rs", hit), ("z/src/config.rs", hit)];
    let relevance = ranked_paths(
        &files,
        serde_json::json!({"matchString": "parse_config", "resultView": "files"}),
    );
    assert_eq!(relevance, ["z/src/config.rs", "a/tests/config.rs"]);
    let by_path = ranked_paths(
        &files,
        serde_json::json!({"matchString": "parse_config", "resultView": "files", "sort": "path"}),
    );
    assert_eq!(by_path, ["a/tests/config.rs", "z/src/config.rs"]);
    let without = ranked_paths(
        &[("a/tests/other.rs", "x\n"), ("z/src/other.rs", "x\n")],
        serde_json::json!({"matchString": "parse_config", "resultView": "filesWithout"}),
    );
    assert_eq!(without, ["z/src/other.rs", "a/tests/other.rs"]);
}

// Lean defaults: the paginated view returns only the hit line, 10 rows per
// file page and 20 files per page; `detailed` keeps a ±3 context window.
#[test]
fn default_paginated_view_is_lean_and_detailed_keeps_context() {
    let file = numbered(30, &(1..=12).collect::<Vec<_>>());
    let many: Vec<(String, String)> = (0..25)
        .map(|i| {
            (
                format!("f{i:02}.txt"),
                "line 1 needle\nline 2 needle\n".to_owned(),
            )
        })
        .collect();
    // A hot last file puts the result over one page budget.
    let hot = "needle\n".repeat(1200);
    let mut fixtures: Vec<(&str, &str)> = vec![("a.txt", file.as_str()), ("z.txt", &hot)];
    fixtures.extend(many.iter().map(|(p, c)| (p.as_str(), c.as_str())));
    let body = search_fixture(
        &fixtures,
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "sort": LocalSearchQuerySort::Path}),
            None,
        ),
    );
    let files = body["files"].as_array().expect("files");
    assert_eq!(files.len(), 20, "{body}");
    let a = &files[0];
    assert_eq!(a["matches"].as_array().expect("rows").len(), 10, "{body}");
    assert_eq!(a["matches"][0]["value"], "line 1 needle");
    assert_eq!(a["pagination"]["totalItems"], 12);
    let detailed = search_fixture(
        &[("a.txt", &numbered(30, &[20]))],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "contextLines": 3}),
            None,
        ),
    );
    assert_eq!(
        detailed["files"][0]["matches"][0]["value"],
        "17\tline 17\n18\tline 18\n19\tline 19\n20\tline 20 needle\n21\tline 21\n22\tline 22\n23\tline 23"
    );
}

/// Following `nextPage` from a default search walks every row exactly
/// once in pages cut by the response budget: a hot file is not paged ten
/// rows at a time, and each continuation runs unchanged.
#[test]
fn a_default_walk_reaches_every_row_once_in_budget_sized_pages() {
    let root = tempfile::tempdir().expect("fixture directory");
    let rows_per_file = 60;
    for n in 0..30 {
        let body = (1..=rows_per_file)
            .map(|line| format!("needle {n} {line} {}\n", "x".repeat(60)))
            .collect::<String>();
        fs::write(root.path().join(format!("f{n:02}.txt")), body).expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let mut request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let mut seen = std::collections::BTreeSet::new();
    let mut pages = 0;
    loop {
        let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .expect("page");
        let body = serde_json::to_value(&result).expect("serialize");
        pages += 1;
        let chars = crate::tools::stream_page::json_chars(&body["files"]);
        assert!(
            chars <= crate::tools::stream_page::MAX_PAGE_CHARS,
            "page {pages}: {chars} chars"
        );
        for file in body["files"].as_array().expect("files") {
            for row in file["matches"].as_array().expect("rows") {
                let key = (
                    file["path"].as_str().expect("path").to_owned(),
                    row["line"].as_u64().expect("line"),
                );
                assert!(seen.insert(key), "row shown twice on page {pages}");
            }
        }
        assert!(
            body["next"].get("nextMatchPage").is_none(),
            "{}",
            body["next"]
        );
        let Some(next) = body["next"].get("nextPage") else {
            break;
        };
        assert!(
            next["query"]["queries"][0].get("pageSize").is_none(),
            "{next}"
        );
        request = serde_json::from_value(next["query"]["queries"][0].clone())
            .expect("continuation query");
    }
    assert_eq!(seen.len(), 30 * rows_per_file);
    // About 30 × 60 rows of ~100 bytes: the overview page plus
    // total/budget pages, not one page per ten rows of each file.
    assert!((7..=11).contains(&pages), "{pages} pages");
}

fn numbered(lines: u32, needles: &[u32]) -> String {
    (1..=lines)
        .map(|n| {
            if needles.contains(&n) {
                format!("line {n} needle\n")
            } else {
                format!("line {n}\n")
            }
        })
        .collect()
}

// Overlapping/adjacent ±contextLines windows are emitted once: every source
// line appears exactly once, in order, and every matched line is recorded.
#[test]
fn overlapping_context_windows_merge_into_one_block() {
    let file = numbered(30, &[5, 7, 12, 25]);
    let body = search_fixture(
        &[("a.txt", &file)],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "contextLines": 2}),
            None,
        ),
    );
    let matches = body["files"][0]["matches"].as_array().expect("matches");
    // 5 and 7 overlap (3..=9), 12 is adjacent (10..=14 follows 9), 25 is apart.
    assert_eq!(matches.len(), 2, "{body}");
    assert_eq!(matches[0]["line"], 5);
    assert_eq!(matches[0]["matchedLines"], serde_json::json!([5, 7, 12]));
    let expected: String = (3..=14)
        .map(|n| {
            if [5, 7, 12].contains(&n) {
                format!("{n}\tline {n} needle")
            } else {
                format!("{n}\tline {n}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(matches[0]["value"], expected);
    assert_eq!(matches[1]["line"], 25);
    assert!(matches[1].get("matchedLines").is_none(), "{body}");
    assert_eq!(
        matches[1]["value"],
        "23\tline 23\n24\tline 24\n25\tline 25 needle\n26\tline 26\n27\tline 27"
    );
    // Counts stay per matched line.
    assert_eq!(body["matchedLineCount"], 4);
}

#[test]
fn windows_merge_at_file_edges_and_stay_apart_when_disjoint() {
    let file = numbered(6, &[1, 2, 6]);
    let body = search_fixture(
        &[("a.txt", &file)],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "contextLines": 1}),
            None,
        ),
    );
    let matches = body["files"][0]["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 2, "{body}");
    assert_eq!(
        matches[0]["value"],
        "1\tline 1 needle\n2\tline 2 needle\n3\tline 3"
    );
    assert_eq!(matches[0]["matchedLines"], serde_json::json!([1, 2]));
    assert_eq!(matches[1]["value"], "5\tline 5\n6\tline 6 needle");
    // matchOnly never merges: it carries spans, not windows.
    let body = search_fixture(
        &[("a.txt", &file)],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "resultView": LocalSearchQueryResultView::MatchOnly}),
            None,
        ),
    );
    let matches = body["files"][0]["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 3, "{body}");
    assert!(matches.iter().all(|m| m.get("matchedLines").is_none()));
}

// A truncated window must never be merged (its line structure is unknown).
#[test]
fn truncated_windows_are_not_merged() {
    let long = "x".repeat(200);
    let file = format!("{long}\nneedle a\n{long}\nneedle b\n{long}\n");
    let body = search_fixture(
        &[("a.txt", &file)],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string(), "matchContentLength": 100}),
            None,
        ),
    );
    let matches = body["files"][0]["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 2, "{body}");
    assert!(matches.iter().all(|m| m.get("matchedLines").is_none()));
}

// Single-page results carry no redundant accounting: no engine constant,
// no pagination block, no per-file row counters or per-file pagination
// unless that file has more match pages.
#[test]
fn single_page_results_omit_redundant_accounting() {
    let body = search_fixture(
        &[("a.txt", "foo\n"), ("b.txt", &"foo\n".repeat(3))],
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "matchPageSize": 2, "contextLines": 0}),
            None,
        ),
    );
    assert!(body.get("searchEngine").is_none(), "{body}");
    assert!(body.get("pagination").is_none(), "{body}");
    let files = body["files"].as_array().expect("files");
    for file in files {
        assert!(file.get("totalMatchRows").is_none(), "{file}");
        assert!(file.get("returnedMatchRows").is_none(), "{file}");
    }
    let b = files.iter().find(|f| f["path"] == "b.txt").expect("b");
    let a = files.iter().find(|f| f["path"] == "a.txt").expect("a");
    assert!(a.get("pagination").is_none(), "{a}");
    assert_eq!(b["pagination"]["hasMore"], true);
    assert_eq!(b["pagination"]["totalItems"], 3);
    assert!(b["pagination"].get("pageSize").is_none(), "{b}");
    let next = &body["next"]["nextMatchPage"]["query"]["queries"][0];
    assert!(next["snapshot"].is_string(), "{body}");
    // Multi-page file results still carry file pagination.
    let body = search_fixture(
        &[("a.txt", "foo\n"), ("b.txt", "foo\n")],
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "pageSize": 1}),
            None,
        ),
    );
    assert_eq!(body["pagination"]["totalPages"], 2, "{body}");
    assert!(
        body["next"]["nextPage"]["query"]["queries"][0]["snapshot"].is_string(),
        "{body}"
    );
}

// Continuations carry only the caller's window fields; the next call
// derives the view's defaults (the default context lines, the page size) the
// same way, so its snapshot still matches.
#[test]
fn continuations_derive_the_view_window_defaults() {
    let file = "foo\n".repeat(3);
    let make = |view| {
        ls_query(
            serde_json::json!({"matchString": "foo".to_string(), "resultView": view, "matchPageSize": 1}),
            None,
        )
    };
    let body = search_fixture(
        &[("a.txt", &file)],
        make(LocalSearchQueryResultView::MatchOnly),
    );
    let next = &body["next"]["nextMatchPage"]["query"]["queries"][0];
    assert!(next.get("contextLines").is_none(), "{next}");
    let sent = search_fixture(
        &[("a.txt", &file)],
        ls_query(
            serde_json::json!({"matchString": "foo", "matchPageSize": 1, "contextLines": 0, "matchContentLength": 300}),
            None,
        ),
    );
    let next = &sent["next"]["nextMatchPage"]["query"]["queries"][0];
    assert_eq!(next["contextLines"], 0, "{next}");
    assert_eq!(next["matchContentLength"], 300, "{next}");

    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(root.path().join("a.txt"), &file).expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned()}),
        Some(&make(LocalSearchQueryResultView::Paginated)),
    );
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("first page");
    let body = serde_json::to_value(&first).expect("serialize");
    let next = body["next"]["nextMatchPage"]["query"]["queries"][0].clone();
    // The continuation re-derives the view's defaults: neither the
    // context window nor the value width is repeated in it.
    assert!(next.get("contextLines").is_none(), "{next}");
    assert!(next.get("matchContentLength").is_none(), "{next}");
    let mut continued: LocalSearchQuery =
        serde_json::from_value(next).expect("continuation parses");
    continued.path = request.path.clone();
    execute_local_search(&continued, &policy, &security, &NeverCancel, None, None)
        .expect("detailed continuation is not stale");
}

/// A malformed `include` glob is caller input, coded by the engine's typed
/// kind: a pattern that spells "glob" is not.
#[test]
fn a_bad_include_glob_is_invalid_input() {
    let t = tempfile::tempdir().expect("tempdir");
    fs::write(t.path().join("a.rs"), "glob\n").expect("fixture");
    let (policy, security) = policy_for(t.path());
    let mut fields = serde_json::json!({"matchString": "glob", "include": ["src/{a"]});
    fields["path"] = t.path().to_string_lossy().into_owned().into();
    let error = execute_local_search(
        &ls_query(fields, None),
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
    )
    .expect_err("bad glob");
    assert_eq!(error.code, "invalidInput", "{error:?}");
}

/// Search `root` with `fields` (path set to `root`), default security and
/// no cancellation.
fn search_root(root: &std::path::Path, fields: serde_json::Value) -> LocalSearchResult {
    let (policy, security) = policy_for(root);
    let mut fields = fields;
    fields["path"] = root.to_string_lossy().into_owned().into();
    let request = ls_query(fields, None);
    execute_local_search(&request, &policy, &security, &NeverCancel, None, None).expect("search")
}

/// Run a structureSearch row (a lead's query) and return its JSON text.
fn list_structure(
    mut query: serde_json::Value,
    policy: &PathPolicy,
    security: &ContentSecurity,
) -> String {
    query["mainGoal"] = serde_json::json!("test");
    query["reasoning"] = serde_json::json!("test");
    let query: crate::tools::structure_search::StructureSearchQuery =
        serde_json::from_value(query).expect("structureSearch query");
    crate::tools::structure_search::execute_structure(&query, policy, security, &NeverCancel, None)
        .expect("listing runs")
        .to_string()
}

/// Page 1 of `request`, its snapshot, and the page-2 query that resumes it.
fn first_page(
    request: &LocalSearchQuery,
    policy: &PathPolicy,
    security: &ContentSecurity,
) -> (LocalSearchResult, String, LocalSearchQuery) {
    let first =
        execute_local_search(request, policy, security, &NeverCancel, None, None).expect("page 1");
    let snapshot = first
        .source_snapshot
        .clone()
        .expect("continuation identity");
    let page_two = ls_query(
        serde_json::json!({"snapshot": snapshot, "page": 2}),
        Some(request),
    );
    (first, snapshot, page_two)
}

fn policy_for(root: &std::path::Path) -> (PathPolicy, ContentSecurity) {
    let policy = crate::tools::test_support::workspace_policy(root);
    (policy, ContentSecurity::new())
}

/// Make `dir` unreadable; returns false when the process can still read it
/// (e.g. running as root), so the caller skips.
#[cfg(unix)]
fn lock_dir(dir: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o000)).expect("chmod 000");
    if fs::read_dir(dir).is_ok() {
        fs::set_permissions(dir, fs::Permissions::from_mode(0o755)).expect("restore");
        return false;
    }
    true
}

/// `root/hidden/secret.txt` holding the only `needle-only-here`, with
/// `hidden` made unreadable; `None` when the process can still read it.
#[cfg(unix)]
fn locked_secret(root: &std::path::Path) -> Option<std::path::PathBuf> {
    let hidden = root.join("includeHidden");
    fs::create_dir(&hidden).expect("dir");
    fs::write(hidden.join("secret.txt"), "needle-only-here\n").expect("fixture");
    lock_dir(&hidden).then_some(hidden)
}

#[cfg(unix)]
fn unlock_dir(dir: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o755));
}

#[cfg(unix)]
#[test]
fn a_scope_where_every_path_is_unreadable_is_an_access_error_not_empty() {
    let root = tempfile::tempdir().expect("fixture directory");
    let Some(hidden) = locked_secret(root.path()) else {
        return;
    };
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle-only-here".to_string(), "regex": LocalSearchQueryRegex::Literal, "includeIgnored": true}),
        None,
    );
    let outcome = execute_local_search(&request, &policy, &security, &NeverCancel, None, None);
    unlock_dir(&hidden);
    let error = outcome.expect_err("every candidate failed");
    assert_eq!(error.code, "fileAccessFailed");
    assert!(
        error.message.contains("Permission denied"),
        "{}",
        error.message
    );
    // The message names the count and first failure; no advice rides along.
    assert!(error.hints.is_empty(), "{:?}", error.hints);
}

#[cfg(unix)]
#[test]
fn unreadable_paths_beside_readable_misses_make_the_result_partial() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(root.path().join("open.txt"), "nothing here\n").expect("fixture");
    let Some(hidden) = locked_secret(root.path()) else {
        return;
    };
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle-only-here".to_string(), "regex": LocalSearchQueryRegex::Literal, "includeIgnored": true}),
        None,
    );
    let outcome = execute_local_search(&request, &policy, &security, &NeverCancel, None, None);
    unlock_dir(&hidden);
    let result = outcome.expect("readable file searched");
    assert_eq!(result.status, SearchStatus::Partial);
    let body = serde_json::to_value(&result).expect("serialize");
    assert_eq!(body["isPartial"], true, "{body}");
    assert_eq!(body["terminalLimit"], true, "{body}");
    assert_eq!(body["fileErrors"]["count"], 1, "{body}");
    // The count is stated once, as a warning; no advice.
    assert!(
        body["warnings"].to_string().contains("1 path unreadable"),
        "{body}"
    );
    assert!(!body["hints"].to_string().contains("unreadable"), "{body}");
}

#[test]
fn a_nul_keeps_the_matches_before_it_and_warns() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(
        root.path().join("mixed.txt"),
        b"alpha before\0alpha after\nalpha before\n",
    )
    .expect("fixture");
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "alpha".to_string(), "regex": LocalSearchQueryRegex::Literal}),
    );
    assert_ne!(result.status, SearchStatus::Empty);
    let body = serde_json::to_value(&result).expect("serialize");
    assert_eq!(body["files"][0]["matches"][0]["line"], 1, "{body}");
    assert_eq!(body["matchCount"], 1, "{body}");
    // The warning names the file it could not search past the NUL.
    assert!(
        result
            .warnings
            .iter()
            .any(|w| w.starts_with("binaryFileSkipped: mixed.txt was searched")),
        "{:?}",
        result.warnings
    );
}

/// Run each `expandValues*` read of a search result and return the
/// concatenated content it fetched.
fn follow_expansions(result: &LocalSearchResult, policy: &PathPolicy) -> (usize, String) {
    let next = result.next.clone().unwrap_or_default();
    let mut reads = 0;
    let mut content = String::new();
    for (name, read) in next.as_object().into_iter().flatten() {
        if !name.starts_with("expandValues") {
            continue;
        }
        reads += 1;
        assert_eq!(read["tool"], "localFetch", "{read}");
        let mut query = read["query"]["queries"][0].clone();
        query["mainGoal"] = serde_json::json!("test");
        query["reasoning"] = serde_json::json!("test");
        let query: crate::tools::local_fetch::LocalFetchQuery =
            serde_json::from_value(query).expect("localFetch query");
        let fetched = crate::tools::local_fetch::execute_local_fetch(
            &query,
            policy,
            &ContentSecurity::new(),
            &NeverCancel,
            &crate::tools::local_fetch::LocalFetchRegex,
            None,
        );
        assert_eq!(fetched.error, None, "{read}");
        content.push_str(fetched.content.as_deref().unwrap_or(""));
    }
    (reads, content)
}

/// A value clipped to matchContentLength carries `next.expandValues`:
/// a read of its source lines that returns it whole, one per file.
#[test]
fn clipped_values_carry_reads_that_return_them_whole() {
    let root = tempfile::tempdir().expect("fixture directory");
    let long = format!("{} alpha {}", "x".repeat(3000), "y".repeat(3000));
    fs::write(
        root.path().join("long.txt"),
        format!("short alpha\n{long}\nalpha z\n"),
    )
    .expect("fixture");
    let other = format!("alpha {}", "q".repeat(900));
    fs::write(root.path().join("other.txt"), format!("{other}\n")).expect("fixture");
    fs::write(root.path().join("plain.txt"), "alpha\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha", "regex": LocalSearchQueryRegex::Literal}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let body = serde_json::to_value(&result).expect("serialize");
    assert!(body.to_string().contains("\"originalChars\""), "{body}");
    let (reads, content) = follow_expansions(&result, &policy);
    assert_eq!(reads, 2, "{body}");
    assert!(content.contains(&long), "{content:.300}");
    assert!(content.contains(&other), "{content:.300}");
    // An unclipped file needs no read.
    assert!(!content.contains("plain"), "{content:.300}");
    let next = result.next.clone().unwrap_or_default();
    let ranges = next
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(name, _)| name.starts_with("expandValues"))
        .map(|(_, read)| read["query"]["queries"][0]["ranges"].clone())
        .collect::<Vec<_>>();
    assert!(ranges.contains(&serde_json::json!(["2-2"])), "{ranges:?}");
    assert!(ranges.contains(&serde_json::json!(["1-1"])), "{ranges:?}");
}

/// Clipped rows with context read their whole windows; overlapping
/// windows merge, and more than ten ranges continue in a second read.
#[test]
fn clipped_context_windows_merge_and_split_across_reads() {
    let root = tempfile::tempdir().expect("fixture directory");
    let mut text = String::new();
    for line in 1..=200 {
        if line % 10 == 0 {
            text.push_str(&format!("alpha {}\n", "w".repeat(400)));
        } else {
            text.push_str(&format!("line {line}\n"));
        }
    }
    fs::write(root.path().join("many.txt"), &text).expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha",
                "regex": LocalSearchQueryRegex::Literal, "contextLines": 1, "matchContentLength": 100}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let next = result.next.clone().unwrap_or_default();
    assert_eq!(
        next["expandValues"]["query"]["queries"][0]["ranges"][0], "9-11",
        "{next}"
    );
    assert_eq!(
        next["expandValues"]["query"]["queries"][0]["ranges"]
            .as_array()
            .map(Vec::len),
        Some(10),
        "{next}"
    );
    assert_eq!(
        next["expandValues2"]["query"]["queries"][0]["ranges"],
        serde_json::json!([
            "109-111", "119-121", "129-131", "139-141", "149-151", "159-161", "169-171", "179-181",
            "189-191", "199-201"
        ]),
        "{next}"
    );
    let (_, content) = follow_expansions(&result, &policy);
    let hit = format!("alpha {}", "w".repeat(400));
    assert_eq!(content.matches(hit.as_str()).count(), 20, "{content:.300}");
    for line in (10..=190).step_by(10) {
        assert!(content.contains(&format!("line {}\n", line + 1)), "{line}");
    }
}

/// A caller-sized page keeps its rows at any value width: one widened
/// copy of the query returns every clipped value of the page whole.
#[test]
fn clipped_values_on_a_grid_page_widen_the_same_page() {
    let root = tempfile::tempdir().expect("fixture directory");
    for index in 0..4 {
        fs::write(
            root.path().join(format!("f{index}.txt")),
            format!("alpha {}\n", "v".repeat(300 + index)),
        )
        .expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha",
                "regex": LocalSearchQueryRegex::Literal, "pageSize": 2, "matchContentLength": 50}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let body = serde_json::to_value(&result).expect("serialize");
    let next = result.next.clone().unwrap_or_default();
    let mut names = next
        .as_object()
        .map(|next| next.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    names.sort();
    // The first page also reads its top file (the natural next step).
    assert_eq!(names, ["expandValues", "nextPage", "read"], "{next}");
    // The snapshot names the value width: the widened page runs fresh.
    assert!(
        next["expandValues"]["query"]["queries"][0]
            .get("snapshot")
            .is_none(),
        "{next}"
    );
    let widened = &next["expandValues"]["query"]["queries"][0];
    assert_eq!(next["expandValues"]["tool"], "localSearch", "{next}");
    assert_eq!(widened["page"], 1, "{widened}");
    let longest = body["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|file| file["matches"][0]["originalChars"].as_u64())
        .max()
        .expect("clipped");
    assert_eq!(widened["matchContentLength"], longest, "{widened}");
    let mut widened = widened.clone();
    widened["mainGoal"] = serde_json::json!("test");
    widened["reasoning"] = serde_json::json!("test");
    let again = execute_local_search(
        &serde_json::from_value(widened).expect("widened query"),
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
    )
    .expect("widened search");
    let again = serde_json::to_value(&again).expect("serialize");
    assert!(!again.to_string().contains("\"originalChars\""), "{again}");
    let paths = |value: &serde_json::Value| {
        value["files"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|file| file["path"].clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(paths(&again), paths(&body), "the same rows, whole");
}

/// A clipped multiline value hides its line span: its file is searched
/// again alone with room for the longest clipped value.
#[test]
fn clipped_multiline_values_widen_a_file_scoped_search() {
    let root = tempfile::tempdir().expect("fixture directory");
    let body = (0..60).map(|n| format!("  item{n},\n")).collect::<String>();
    fs::write(
        root.path().join("list.js"),
        format!("const list = [\n{body}];\n"),
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(),
                "matchString": "const list = \\[[^\\]]*\\]", "regex": "rust", "multiline": "on"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let body_json = serde_json::to_value(&result).expect("serialize");
    assert!(
        body_json.to_string().contains("\"originalChars\""),
        "{body_json}"
    );
    let next = result.next.clone().unwrap_or_default();
    let widened = &next["expandValues"]["query"]["queries"][0];
    assert_eq!(next["expandValues"]["tool"], "localSearch", "{next}");
    assert_eq!(widened["path"], "list.js", "{next}");
    let original = body_json["files"][0]["matches"][0]["originalChars"]
        .as_u64()
        .expect("originalChars");
    assert_eq!(widened["matchContentLength"], original, "{next}");
    for key in ["page", "matchPage", "snapshot", "pageSize"] {
        assert!(widened.get(key).is_none(), "{key}: {widened}");
    }
    let mut widened = widened.clone();
    widened["path"] = serde_json::json!(root.path().join("list.js").to_string_lossy());
    let again = execute_local_search(
        &ls_query(widened, None),
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
    )
    .expect("widened search");
    let again = serde_json::to_value(&again).expect("serialize");
    assert!(!again.to_string().contains("\"originalChars\""), "{again}");
    assert!(again.to_string().contains("item59"), "{again}");
}

/// Every file cut at a NUL after real text is a coverage gap: the
/// warning names each one, files sharing a directory grouped under it,
/// and none summarized as a count.
#[test]
fn every_text_cut_file_is_named_grouped_by_directory() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir_all(root.path().join("deep/dir")).expect("fixture dir");
    for index in 0..8 {
        fs::write(
            root.path().join(format!("deep/dir/mixed{index}.txt")),
            b"alpha before\0alpha after\n",
        )
        .expect("fixture");
    }
    fs::write(root.path().join("top.txt"), b"alpha before\0alpha after\n").expect("fixture");
    let result = search_root(
        root.path(),
        serde_json::json!({"matchString": "alpha".to_string(), "regex": LocalSearchQueryRegex::Literal}),
    );
    assert!(result.is_partial);
    let warning = result
        .warnings
        .iter()
        .find(|w| w.starts_with("binaryFileSkipped:"))
        .expect("binary warning");
    let names = (0..8)
        .map(|index| format!("mixed{index}.txt"))
        .collect::<Vec<_>>()
        .join(",");
    assert!(
        warning.starts_with(&format!(
            "binaryFileSkipped: top.txt, deep/dir/{{{names}}} were searched"
        )),
        "{warning}"
    );
    assert!(!warning.contains("more"), "{warning}");
}

/// Past a handful, text-cut binary files are a count by extension with a
/// listing that names every one (`binarySkipped`), not an unbounded
/// inline warning: a build tree of `.rlib`s stays a short row.
#[test]
fn many_text_cut_files_are_a_count_with_a_lossless_listing() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir_all(root.path().join("deps")).expect("fixture dir");
    for index in 0..300 {
        fs::write(
            root.path()
                .join(format!("deps/libcrate_with_a_long_name_{index:03}.rlib")),
            b"alpha before\0alpha after\n",
        )
        .expect("fixture");
    }
    let request = ls_query(
        serde_json::json!({"path": root.path(), "matchString": "alpha", "regex": "literal", "resultView": "files", "defaultExcludes": false}),
        None,
    );
    let (policy, security) = policy_for(root.path());
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let warning = result
        .warnings
        .iter()
        .find(|w| w.starts_with("binaryFileSkipped:"))
        .expect("binary warning");
    assert!(
        warning.starts_with("binaryFileSkipped: 300 files (.rlib 300) were"),
        "{warning}"
    );
    assert!(!warning.contains("libcrate"), "{warning}");
    let listing = result
        .next
        .as_ref()
        .and_then(|next| next.get("binarySkipped"))
        .expect("listing lead");
    assert_eq!(
        listing["query"]["queries"][0]["extensions"],
        serde_json::json!(["rlib"])
    );
    assert!(warning.len() < 200, "{warning}");
}

/// Files binary from their leading bytes (a font's magic, then a NUL)
/// are outside a text search: no partial result, a
/// count grouped by extension instead of every path, and an exact
/// structureSearch continuation that lists them all.
#[test]
fn leading_nul_binaries_are_counted_with_a_listing_continuation() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir_all(root.path().join("fonts/a")).expect("fixture dir");
    for index in 0..30 {
        fs::write(
            root.path()
                .join(format!("fonts/a/Font-{index}-0123456789abcdef.woff2")),
            b"wOF2\0\x01\0\0alpha",
        )
        .expect("fixture");
    }
    fs::write(
        root.path().join("logo.png"),
        b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR",
    )
    .expect("fixture");
    fs::write(root.path().join("a.txt"), "alpha\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha".to_string(), "regex": LocalSearchQueryRegex::Literal}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let body = serde_json::to_value(&result).expect("serialize");
    assert!(!result.is_partial, "{body}");
    assert!(!result.terminal_limit, "{body}");
    assert_eq!(result.status, SearchStatus::Success, "{body}");
    assert_eq!(result.stats.cap_reason, None, "{body}");
    // A row with hits states the count in stats, not as a warning.
    assert!(result.warnings.is_empty(), "{body}");
    assert_eq!(body["binarySkipped"], 31, "{body}");
    let text = body.to_string();
    assert!(!text.contains("Font-0"), "{text}");

    let listing = &body["next"]["binarySkipped"];
    assert_eq!(listing["tool"], "structureSearch", "{body}");
    let query = listing["query"]["queries"][0].clone();
    assert_eq!(query["operation"], "files", "{listing}");
    assert_eq!(
        query["extensions"],
        serde_json::json!(["woff2", "png"]),
        "{listing}"
    );
    let listed = list_structure(query, &policy, &security);
    for index in 0..30 {
        assert!(
            listed.contains(&format!("Font-{index}-0123456789abcdef.woff2")),
            "{listed}"
        );
    }
    assert!(listed.contains("logo.png"), "{listed}");
    assert!(!listed.contains("a.txt"), "{listed}");
}

/// An extensionless binary cannot be named by `extensions`, so the
/// listing continuation matches basenames instead and still reaches it.
#[test]
fn an_extensionless_leading_nul_binary_is_listed_by_basename() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(root.path().join("store"), b"SQLite format 3\0alpha").expect("fixture");
    fs::write(root.path().join("x.woff2"), b"wOF2\0\x01\0\0alpha").expect("fixture");
    fs::write(root.path().join("README"), "plain text\n").expect("fixture");
    fs::write(root.path().join("a.txt"), "alpha\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "alpha".to_string(), "regex": LocalSearchQueryRegex::Literal}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(!result.is_partial);
    assert_eq!(
        result.stats.binary_skipped,
        Some(2),
        "{:?}",
        result.warnings
    );
    let query = result.next.as_ref().expect("next")["binarySkipped"]["query"]["queries"][0].clone();
    assert!(query.get("extensions").is_none(), "{query}");
    let listed = list_structure(query, &policy, &security);
    assert!(listed.contains("store"), "{listed}");
    assert!(listed.contains("x.woff2"), "{listed}");
    assert!(!listed.contains("a.txt"), "{listed}");
}

#[test]
fn opaque_binary_files_in_scope_do_not_make_a_search_partial() {
    // An object-file header puts a NUL before any text: such files are
    // skipped and nothing text-searchable is lost, so only their count is
    // disclosed.
    let body = search_fixture(
        &[
            ("addon.node", "\u{7f}ELF\u{2}\u{1}\u{1}\u{0}needle\n"),
            ("a.txt", "needle\n"),
        ],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string()}),
            None,
        ),
    );
    assert_ne!(body["isPartial"], true, "{body}");
    assert_ne!(body["terminalLimit"], true, "{body}");
    assert_ne!(body["status"], "partial", "{body}");
    assert!(body.get("warnings").is_none(), "{body}");
    assert_eq!(body["binarySkipped"], 1, "{body}");
    // An empty row says it in warnings, where the count may explain the miss.
    let empty = search_fixture(
        &[
            ("addon.node", "\u{7f}ELF\u{2}\u{1}\u{1}\u{0}needle\n"),
            ("a.txt", "other\n"),
        ],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string()}),
            None,
        ),
    );
    assert!(
        empty["warnings"]
            .to_string()
            .contains("binarySkipped: 1 binary file not searched (.node 1)."),
        "{empty}"
    );
    assert!(empty.get("binarySkipped").is_none(), "{empty}");
    assert!(body.get("partialReasons").is_none(), "{body}");

    // Targeted directly, the empty result still says why.
    let root = tempfile::tempdir().expect("fixture directory");
    let target = root.path().join("addon.node");
    fs::write(&target, b"\x7fELF\x02\x01\x01\0needle\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": target.to_string_lossy().into_owned(), "matchString": "needle".to_string()}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(
        result.hints.iter().any(|h| h.contains("binary")),
        "{:?}",
        result.hints
    );
}

#[test]
fn an_empty_result_with_a_binary_cut_is_partial_not_empty() {
    let body = search_fixture(
        &[(
            "blob.dat",
            "a text line\nanother\n\u{0}needle after the nul\n",
        )],
        ls_query(
            serde_json::json!({"matchString": "needle".to_string()}),
            None,
        ),
    );
    assert_eq!(body["isPartial"], true, "{body}");
    // The binary cut is stated once, as a warning.
    assert!(
        body["warnings"].as_array().is_some_and(|warnings| warnings
            .iter()
            .any(|w| w.as_str().is_some_and(|w| w.contains("NUL byte")))),
        "{body}"
    );
    assert!(!body["hints"].to_string().contains("NUL byte"), "{body}");
}

/// A NUL byte in one visible file cuts that file's content, not the walk:
/// the empty row still names the match under an ignored path and leads to
/// it, and a row with that retry is not a terminal limit.
#[test]
fn a_binary_cut_keeps_the_ignored_path_disclosure_and_is_not_terminal() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "ign/\n").expect("gitignore");
    fs::create_dir_all(root.path().join("ign")).expect("ignored dir");
    fs::write(root.path().join("ign/secret.ts"), "needleIgnored\n").expect("fixture");
    fs::write(root.path().join("nul.txt"), "needle one\n\u{0}needle two\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needleIgnored"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty());
    assert!(result.is_partial, "the binary cut leaves a gap: {result:?}");
    let next = result.next.as_ref().expect("lead");
    assert_eq!(
        next["includeSkipped"]["query"]["queries"][0]["includeIgnored"], true,
        "{next}"
    );
    assert!(
        result
            .hints
            .iter()
            .any(|hint| hint.contains("match in skipped paths")),
        "{:?}",
        result.hints
    );
    assert!(!result.terminal_limit, "{result:?}");
}

#[test]
fn relevance_cap_keeps_hot_file_and_marks_first_and_final_pages_partial() {
    let root = tempfile::tempdir().expect("fixture directory");
    for i in 0..=10_000 {
        fs::write(root.path().join(format!("a{i:05}.txt")), "hit\n").expect("fixture");
    }
    fs::write(root.path().join("zzz-hot.txt"), "hit\n".repeat(40)).expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "hit".to_string(), "regex": LocalSearchQueryRegex::Literal}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert_eq!(result.files[0].path, "zzz-hot.txt");
    let stats = &result.stats;
    assert_eq!(stats.files_searched, 10_002);
    assert_eq!(stats.files_matched, 10_002);
    assert_eq!(stats.total_occurrences, 10_001 + 40);
    assert!(result.is_partial);
    assert_eq!(result.status, SearchStatus::Partial);
    assert!(
        stats
            .cap_reason
            .as_deref()
            .is_some_and(|r| r.contains("maxCollectedFiles")),
        "{stats:?}"
    );
    let last_page = result.pagination.as_ref().expect("file pages").total_pages;
    let last_request = ls_query(
        serde_json::json!({"page": last_page, "snapshot": result.source_snapshot.as_ref().expect("snapshot")}),
        Some(&request),
    );
    let last = execute_local_search(&last_request, &policy, &security, &NeverCancel, None, None)
        .expect("last collected page");
    assert!(last.is_partial);
    assert!(last.terminal_limit);
    // No page continues past the cap; the only lead lists the scope to split.
    let next = last.next.as_ref().expect("split lead");
    assert_eq!(
        next.as_object()
            .map(|map| map.keys().cloned().collect::<Vec<_>>()),
        Some(vec!["viewTree".to_owned()]),
        "{next}"
    );
    assert!(
        last.warnings
            .iter()
            .any(|w| w.contains("2 of 10002 matched files")),
        "{:?}",
        last.warnings
    );
    assert_eq!(last.stats.cap_reason.as_deref(), Some("maxCollectedFiles"));
}

#[test]
fn cancellation_during_the_walk_reports_cancelled() {
    use crate::tools::cancel::CancellationCheck;
    use std::sync::atomic::{AtomicU32, Ordering};
    struct CancelAfter(AtomicU32, u32);
    impl CancellationCheck for CancelAfter {
        fn check(&self) -> Result<(), String> {
            if self.0.fetch_add(1, Ordering::SeqCst) >= self.1 {
                Err("cancelled".into())
            } else {
                Ok(())
            }
        }
    }
    let root = tempfile::tempdir().expect("fixture directory");
    for i in 0..40 {
        fs::write(root.path().join(format!("f{i:02}.txt")), "needle\n").expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle".to_string()}),
        None,
    );
    // The first check (before the walk) passes; the walk's polls cancel.
    let cancel = CancelAfter(AtomicU32::new(0), 3);
    let error = execute_local_search(&request, &policy, &security, &cancel, None, None)
        .expect_err("cancelled mid-walk");
    assert_eq!(error.code, "cancelled");
    assert!(
        cancel.0.load(Ordering::SeqCst) < 40,
        "walk polled every file"
    );
}

#[test]
fn clipped_secret_guard_fails_closed_when_the_source_cannot_be_reread() {
    let security = ContentSecurity::new();
    let mut file = octocode_engine::types::TextSearchFile {
        path: "gone.txt".into(),
        match_count: 1,
        matches: vec![octocode_engine::types::TextSearchMatch {
            line: 1,
            column: 0,
            byte_offset: 0,
            value: "…token = ghp_abcdefghijklmnop".into(),
            count: None,
            kind: None,
            score_hint: None,
            rank: None,
            original_chars: Some(400),
        }],
        source: None,
    };
    let missing = tempfile::tempdir()
        .expect("fixture directory")
        .path()
        .join("gone.txt");
    let verified = verify::guard_clipped_secrets(
        &mut file,
        &missing,
        None,
        0..10,
        &security,
        false,
        &NeverCancel,
    )
    .expect("not cancelled");
    assert_eq!(verified, verify::Verification::Unverified);
    assert!(!file.matches[0].value.contains("ghp_"));
    assert!(file.matches[0].value.contains("REDACTED"));
}

/// A source that shrank or was replaced after the search no longer holds
/// the matched line, so the clipped value cannot be verified.
#[test]
fn clipped_secret_guard_fails_closed_when_the_match_line_is_gone() {
    let security = ContentSecurity::new();
    let root = tempfile::tempdir().expect("fixture directory");
    let source = root.path().join("shrunk.txt");
    fs::write(&source, "one line now\n").expect("fixture");
    let mut file = octocode_engine::types::TextSearchFile {
        path: "shrunk.txt".into(),
        match_count: 1,
        matches: vec![octocode_engine::types::TextSearchMatch {
            line: 40,
            column: 0,
            byte_offset: 0,
            value: "…token = ghp_abcdefghijklmnop".into(),
            count: None,
            kind: None,
            score_hint: None,
            rank: None,
            original_chars: Some(400),
        }],
        source: None,
    };
    let verified = verify::guard_clipped_secrets(
        &mut file,
        &source,
        None,
        0..10,
        &security,
        false,
        &NeverCancel,
    )
    .expect("not cancelled");
    assert_eq!(verified, verify::Verification::Unverified);
    assert!(
        !file.matches[0].value.contains("ghp_"),
        "{}",
        file.matches[0].value
    );
}

/// Without `regex`, text is literal, so `.unwrap()`, an empty group `()`,
/// `x[0]`, `.get(0)?` and `a|b` find only that text, and an explicit `regex`
/// always wins. Only an empty literal search mentions the regex reading.
#[test]
fn an_unset_regex_reads_every_text_literally() {
    let files = [("a.rs", "x.unwrap();\nunwrap_or(1);\nfoo_unwrap()\n")];
    let run = |fields: serde_json::Value| search_fixture(&files, ls_query(fields, None));
    let lines = |body: &serde_json::Value| body["matchedLineCount"].as_u64().unwrap_or(0);
    let warned = |body: &serde_json::Value, text: &str| {
        body["warnings"].as_array().is_some_and(|all| {
            all.iter()
                .any(|w| w.as_str().is_some_and(|w| w.contains(text)))
        })
    };
    let literal = run(serde_json::json!({"matchString": ".unwrap()"}));
    assert_eq!(lines(&literal), 1, "{literal}");
    assert!(!warned(&literal, "ran as literal text"), "{literal}");
    let missed = run(serde_json::json!({"matchString": ".unwrap_or(2)"}));
    assert!(warned(&missed, "ran as literal text"), "{missed}");
    // Code punctuation is not a regex: indexing and `?` find their text.
    let code = [(
        "b.rs",
        "let a = matches[0];\nlet b = v.get(0)?;\nlet c = x;\n",
    )];
    for text in ["matches[0]", ".get(0)?"] {
        let body = search_fixture(
            &code,
            ls_query(serde_json::json!({"matchString": text}), None),
        );
        assert_eq!(lines(&body), 1, "{text}: {body}");
    }
    assert!(literal["next"].get("searchLiteral").is_none(), "{literal}");
    let group = run(serde_json::json!({"matchString": "()"}));
    assert_eq!(lines(&group), 2, "{group}");
    // `a|b` is no exception: without `regex` it is literal text too.
    let alternation = run(serde_json::json!({"matchString": "unwrap_or|foo_"}));
    assert_eq!(lines(&alternation), 0, "{alternation}");
    assert!(warned(&alternation, "ran as literal text"), "{alternation}");
    let alternation = run(serde_json::json!({"matchString": "unwrap_or|foo_", "regex": "rust"}));
    assert_eq!(lines(&alternation), 2, "{alternation}");
    let explicit = run(serde_json::json!({"matchString": ".unwrap()", "regex": "rust"}));
    assert_eq!(lines(&explicit), 2, "{explicit}");
    let exact = run(serde_json::json!({"matchString": "unwrap_or|foo_", "regex": "literal"}));
    assert_eq!(lines(&exact), 0, "{exact}");
    for quiet in [
        &explicit,
        &exact,
        &run(serde_json::json!({"matchString": "unwrap"})),
    ] {
        assert!(
            !warned(quiet, "ran as literal text") && !warned(quiet, "ran as a regex"),
            "{quiet}"
        );
    }
}

/// An include whose files all sit in ignored paths is not a scope miss: the
/// row names the skip cause and its lifting lead, and neither claims that
/// include/exclude matched no file nor leads to a listing that skips them too.
#[test]
fn an_include_matching_only_ignored_files_names_the_skip_not_the_scope() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "repos/\n").expect("gitignore");
    fs::create_dir_all(root.path().join("repos/go")).expect("ignored dir");
    fs::write(root.path().join("repos/go/a.go"), "func (s *T) Run() {}\n").expect("go");
    fs::write(root.path().join("notes.txt"), "other\n").expect("text");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(),
            "matchString": "func (s *T)", "include": ["*.go"]}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty());
    let hints = result.hints.join(" | ");
    assert!(hints.contains("match in skipped paths"), "{hints}");
    assert!(
        !hints.contains("include/exclude matched no file"),
        "{hints}"
    );
    let next = result.next.as_ref().expect("lead");
    assert_eq!(
        next["includeSkipped"]["query"]["queries"][0]["includeIgnored"], true,
        "{next}"
    );
    assert!(next.get("viewTree").is_none(), "{next}");
}

/// An empty search whose text lives only in ignored or hidden files says
/// so, and its lead finds them.
#[test]
fn an_empty_search_names_matches_under_ignored_and_hidden_paths() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "logs/\n").expect("gitignore");
    fs::create_dir_all(root.path().join("logs")).expect("ignored dir");
    fs::create_dir_all(root.path().join(".notes")).expect("hidden dir");
    fs::write(root.path().join("logs/log.txt"), "needle-here\n").expect("fixture");
    fs::write(root.path().join(".notes/x.txt"), "needle-here\n").expect("fixture");
    fs::write(root.path().join("src.txt"), "other\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle-here"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty());
    // The probe's finding is the row's first hint (rows keep one).
    let hint = &result.hints[0];
    assert!(
        hint.starts_with("2 file(s) match in skipped paths (")
            && hint.contains(".gitignore:1 'logs/'")
            && hint.contains("hidden .notes/"),
        "{hint}"
    );
    assert!(hint.len() <= 120, "{hint}");
    let next = result.next.as_ref().expect("lead");
    let lead = &next["includeSkipped"];
    assert_eq!(
        lead["query"]["queries"][0]["includeIgnored"], true,
        "{lead}"
    );
    assert_eq!(lead["query"]["queries"][0]["includeHidden"], true, "{lead}");
    let retried: LocalSearchQuery =
        serde_json::from_value(lead["query"]["queries"][0].clone()).expect("lead query");
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None)
        .expect("retry");
    assert_eq!(found.files.len(), 2, "{found:?}");
    // Nothing to find elsewhere: no probe hint and no lead.
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "absent-everywhere"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.next.is_none(), "{:?}", result.next);
    assert_eq!(result.hints.len(), 1, "{:?}", result.hints);
}

/// An empty search whose text lives only in a default-excluded directory
/// (`build/`) is not a proven absence: the hint names the directory and the
/// lead searches it with `defaultExcludes:false`.
#[test]
fn an_empty_search_names_default_excluded_directories_that_match() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir_all(root.path().join("build")).expect("build dir");
    fs::write(root.path().join("build/out.js"), "getElectronVersion()\n").expect("fixture");
    fs::write(root.path().join("src.js"), "other\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "getElectronVersion"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty());
    let hint = &result.hints[0];
    assert!(
        hint.starts_with("1 file(s) match in skipped paths") && hint.contains("(build/)"),
        "{hint}"
    );
    let lead = &result.next.as_ref().expect("lead")["includeSkipped"]["query"]["queries"][0];
    assert_eq!(lead["defaultExcludes"], false, "{lead}");
    let retried: LocalSearchQuery = serde_json::from_value(lead.clone()).expect("lead query");
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None)
        .expect("retry");
    assert_eq!(found.files.len(), 1, "{found:?}");
}

/// A probe that runs out of time proves nothing about the ignored paths it
/// could not search: the row still names them and its lead lifts exactly the
/// ignore rules, under the key that says so. It is not a scope miss either.
#[test]
fn an_unproven_probe_names_the_ignored_paths_and_leads_with_include_ignored() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "repos/*\n").expect("gitignore");
    fs::create_dir_all(root.path().join("repos/go")).expect("ignored dir");
    fs::write(root.path().join("repos/go/a.go"), "func Run() {}\n").expect("go");
    fs::create_dir_all(root.path().join("build")).expect("build dir");
    fs::write(root.path().join("build/out.go"), "func Out() {}\n").expect("built");
    fs::write(root.path().join("notes.txt"), "other\n").expect("text");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(),
            "matchString": "func", "include": ["*.go"]}),
        None,
    );
    let result = super::leads::with_probe_budget(std::time::Duration::ZERO, || {
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .expect("search")
    });
    assert!(result.files.is_empty());
    let hints = result.hints.join(" | ");
    assert!(
        hints.contains("repos/go/") && hints.contains(".gitignore:1 'repos/*'"),
        "{hints}"
    );
    assert!(!hints.contains("matched no file"), "{hints}");
    assert!(!hints.contains("No matches in"), "{hints}");
    let next = result.next.as_ref().expect("lead");
    let lead = &next["includeSkipped"]["query"]["queries"][0];
    assert_eq!(lead["includeIgnored"], true, "{next}");
    assert!(next.get("viewTree").is_none(), "{next}");
    let retried: LocalSearchQuery = serde_json::from_value(lead.clone()).expect("lead query");
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None)
        .expect("retry");
    assert!(
        found.files.iter().any(|file| file.path.ends_with("a.go")),
        "{found:?}"
    );
    // No ignored path to name: an unproven probe says nothing about them.
    let plain = tempfile::tempdir().expect("fixture directory");
    fs::write(plain.path().join("notes.txt"), "other\n").expect("text");
    let (policy, security) = policy_for(plain.path());
    let request = ls_query(
        serde_json::json!({"path": plain.path().to_string_lossy().into_owned(), "matchString": "absent"}),
        None,
    );
    let result = super::leads::with_probe_budget(std::time::Duration::ZERO, || {
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .expect("search")
    });
    assert!(result.next.is_none(), "{:?}", result.next);
}

/// Once the hint names the skipped paths that hold a match, the generic count
/// of searched files does not follow it: the cause leads the row alone.
#[test]
fn a_skipped_match_replaces_the_generic_empty_count() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "repos/\n").expect("gitignore");
    fs::create_dir_all(root.path().join("repos")).expect("ignored dir");
    fs::write(root.path().join("repos/a.go"), "func Run() {}\n").expect("go");
    fs::write(root.path().join("b.ts"), "export {}\n").expect("ts");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(),
            "matchString": "func", "include": ["*.go", "*.ts"]}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let hints = result.hints.join(" | ");
    assert!(hints.contains("match in skipped paths"), "{hints}");
    assert!(!hints.contains("No matches in"), "{hints}");
}

/// Skipped binaries are disclosed once, on the first page: a later page
/// repeats neither the warning nor the listing lead.
#[test]
fn skipped_binaries_are_disclosed_on_the_first_page_only() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(
        root.path().join("logo.png"),
        b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR",
    )
    .expect("png");
    fs::write(root.path().join("a.txt"), "needle\n").expect("fixture");
    fs::write(root.path().join("b.txt"), "needle\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let first = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "pageSize": 1, "sort": "path"}),
        None,
    );
    let page1 =
        execute_local_search(&first, &policy, &security, &NeverCancel, None, None).expect("page 1");
    assert_eq!(page1.stats.binary_skipped, Some(1), "{:?}", page1.warnings);
    assert!(
        page1
            .next
            .as_ref()
            .is_some_and(|next| next.get("binarySkipped").is_some())
    );
    let next = page1.next.as_ref().expect("next")["nextPage"]["query"]["queries"][0].clone();
    let second: LocalSearchQuery = serde_json::from_value(next).expect("page 2 query");
    let page2 = execute_local_search(&second, &policy, &security, &NeverCancel, None, None)
        .expect("page 2");
    assert_eq!(page2.stats.binary_skipped, None, "{:?}", page2.warnings);
    assert!(
        !page2
            .warnings
            .iter()
            .any(|w| w.starts_with("binarySkipped")),
        "{:?}",
        page2.warnings
    );
    assert!(
        page2
            .next
            .as_ref()
            .is_none_or(|next| next.get("binarySkipped").is_none())
    );
}

/// Bytes of a binary header that happen to match are not hits: no row and
/// no read lead a text read would fail on.
#[test]
fn a_match_inside_a_binary_header_yields_no_row_and_no_read() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(
        root.path().join("logo.png"),
        b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR",
    )
    .expect("png");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "PNG"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty(), "{:?}", result.files);
    assert!(
        result
            .next
            .as_ref()
            .is_none_or(|next| next.get("read").is_none())
    );
}

/// The file-page number and snapshot travel once, in `next.*.query`.
#[test]
fn paged_results_keep_cursor_fields_only_in_their_continuations() {
    let body = search_fixture(
        &[("a.txt", "foo\nfoo\nfoo\n"), ("b.txt", "foo\n")],
        ls_query(
            serde_json::json!({"matchString": "foo", "pageSize": 1, "matchPageSize": 1, "contextLines": 0}),
            None,
        ),
    );
    let pagination = &body["pagination"];
    assert_eq!(pagination["totalPages"], 2, "{body}");
    assert!(pagination.get("snapshot").is_none(), "{body}");
    assert!(pagination.get("nextPage").is_none(), "{body}");
    assert!(body["next"].get("nextPage").is_none(), "{body}");
    let last_match_page = search_fixture(
        &[("a.txt", "foo\nfoo\nfoo\n"), ("b.txt", "foo\n")],
        ls_query(
            serde_json::json!({"matchString": "foo", "pageSize": 1, "matchPage": 3, "matchPageSize": 1, "contextLines": 0}),
            None,
        ),
    );
    assert_eq!(
        last_match_page["next"]["nextPage"]["query"]["queries"][0]["page"], 2,
        "{last_match_page}"
    );
    assert!(
        last_match_page["next"]["nextPage"]["query"]["queries"][0]["snapshot"].is_string(),
        "{last_match_page}"
    );
    let file = &body["files"][0]["pagination"];
    assert_eq!(file["hasMore"], true, "{body}");
    assert!(file.get("nextMatchPage").is_none(), "{body}");
    assert_eq!(
        body["next"]["nextMatchPage"]["query"]["queries"][0]["matchPage"], 2,
        "{body}"
    );
}

/// An absolute-path search walked through continuations that name the
/// root relative to the workspace (as the response envelope spells them)
/// reaches every row exactly once: the snapshot and page cuts bind the
/// canonical root, not its spelling.
#[test]
fn a_workspace_relative_replay_of_an_absolute_search_walks_every_page_once() {
    let root = tempfile::tempdir().expect("fixture directory");
    let canonical = fs::canonicalize(root.path()).expect("canonical");
    let body = (1..=400)
        .map(|n| format!("function f{n}() {{ return {n}; }}\n"))
        .collect::<String>();
    fs::write(canonical.join("checker.ts"), &body).expect("fixture");
    fs::write(canonical.join("other.ts"), "function other() {}\n").expect("fixture");
    let (policy, security) = policy_for(&canonical);
    for (path, relative) in [
        (canonical.join("checker.ts"), "checker.ts"),
        (canonical.clone(), "."),
    ] {
        let mut request = ls_query(
            serde_json::json!({"path": path.to_string_lossy().into_owned(), "matchString": "function ", "matchPageSize": 100}),
            None,
        );
        let mut seen = std::collections::BTreeSet::new();
        let mut pages = 0;
        loop {
            pages += 1;
            assert!(pages < 50, "walk does not end");
            let result = execute_local_search(
                &request,
                &policy,
                &security,
                &NeverCancel,
                None,
                Some(20_000),
            )
            .unwrap_or_else(|error| panic!("page {pages} of {relative}: {error:?}"));
            for file in &result.files {
                for row in file.matches.iter().flatten() {
                    assert!(
                        seen.insert((file.path.clone(), row.line)),
                        "{}:{} twice",
                        file.path,
                        row.line
                    );
                }
            }
            let Some(next) = result.next.as_ref().and_then(|next| {
                next.get("nextMatchPage")
                    .or_else(|| next.get("nextPage"))
                    .cloned()
            }) else {
                break;
            };
            let mut query = next["query"]["queries"][0].clone();
            query["path"] = serde_json::json!(relative);
            request = serde_json::from_value(query).expect("continuation query");
        }
        assert!(pages > 1, "{relative}: expected several pages");
        let expected = if relative == "." { 401 } else { 400 };
        assert_eq!(seen.len(), expected, "{relative}");
    }
}

/// A page cut by a binary file (`binaryQuit`) is partial, but its shown
/// text hits stay one read away.
#[test]
fn partial_binary_cut_page_keeps_read_lead() {
    let body = search_fixture(
        &[
            (
                "a.rs",
                "fn a() {}\nlet needle = 1;\nlet needle2 = needle;\n",
            ),
            ("blob.dat", "needle\u{0}needle\n"),
        ],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert_eq!(body["isPartial"], true, "{body}");
    assert_eq!(body["next"]["read"]["tool"], "localFetch", "{body}");
    assert!(
        body["next"]["read"]["query"]["queries"][0]["path"]
            .as_str()
            .is_some_and(|path| path.ends_with("a.rs")),
        "{body}"
    );
}

/// A search that found nothing in the readable text but was cut by a
/// binary file (`binaryQuit`) is partial and terminal, so the bare
/// `No matches` fact cannot stand alone: it leads to the scope's tree to
/// narrow the search.
#[test]
fn zero_match_binary_cut_search_leads_to_narrow_the_scope() {
    // The NUL sits past the file's leading bytes, as in a text file with one
    // stray NUL: the scan quits there instead of skipping the file.
    let blob = format!("{}\u{0}tail\n", "line of text\n".repeat(2000));
    let body = search_fixture(
        &[("a.rs", "fn a() {}\n"), ("blob.dat", blob.as_str())],
        ls_query(serde_json::json!({"matchString": "zzqqxxnotthere"}), None),
    );
    assert_eq!(
        body["partialReasons"],
        serde_json::json!(["binaryQuit"]),
        "{body}"
    );
    assert_eq!(body["terminalLimit"], true, "{body}");
    assert_eq!(
        body["next"]["viewTree"]["tool"], "structureSearch",
        "{body}"
    );
}

/// A warning never names a lead the lead cap may drop.
#[test]
fn binary_warning_never_names_a_capped_lead() {
    let body = search_fixture(
        &[
            ("a.rs", "fn needle() {}\nneedle();\n"),
            ("img.png", "\u{0}\u{1}needle"),
        ],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert!(
        !body["warnings"].to_string().contains("hints.binarySkipped"),
        "{body}"
    );
}

/// An unset `regex` is literal for every text, regex-shaped or not, and
/// an empty literal search names the `regex` field that would run it as one.
#[test]
fn an_unset_regex_is_literal_even_for_regex_shaped_text() {
    for text in [
        "register.*Tool",
        "a|b",
        "\\bfoo",
        "x.+y",
        "pub fn [a-z_]+\\(",
        "^use ",
        "id_[0-9]",
    ] {
        let body = search_fixture(
            &[("a.rs", "register_x_Tool\nfn read\n")],
            ls_query(serde_json::json!({"matchString": text}), None),
        );
        assert_eq!(body["matchCount"], 0, "{text}: {body}");
        assert!(
            body["warnings"].to_string().contains("ran as literal text"),
            "{text}: {body}"
        );
    }
    let pattern = search_fixture(
        &[("a.rs", "register_x_Tool\n")],
        ls_query(
            serde_json::json!({"matchString": "register.*Tool", "regex": "rust"}),
            None,
        ),
    );
    assert_eq!(pattern["matchCount"], 1, "{pattern}");
}

/// The withheld notice lives once, in warnings; the empty hint does
/// not repeat it and gives no spelling advice.
#[test]
fn withheld_notice_appears_once_on_empty_rows() {
    let body = search_fixture(
        &[
            ("src/credentials.json", "{\"ISecretX\": 1}\n"),
            ("src/b.ts", "export const other = 1;\n"),
        ],
        ls_query(serde_json::json!({"matchString": "ISecretX"}), None),
    );
    assert_eq!(body["matchCount"], 0, "{body}");
    let text = body.to_string();
    assert_eq!(text.matches("withheld by path policy").count(), 1, "{body}");
    let hint = body["hints"][0].as_str().expect("empty hint");
    assert!(hint.starts_with("No matches"), "{hint}");
    assert!(!hint.contains("shorter term"), "{hint}");
    assert!(hint.chars().count() <= 120, "{hint}");
}

/// A missing path leads to a tree of its nearest existing parent.
#[test]
fn missing_path_leads_to_nearest_parent_tree() {
    let root = tempfile::tempdir().expect("fixture");
    fs::create_dir_all(root.path().join("src/native")).expect("dirs");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().join("src/nativ").to_string_lossy(), "matchString": "x"}),
        None,
    );
    let error = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect_err("missing path");
    assert_eq!(error.code, "pathNotFound");
    let next = error.next.expect("viewTree lead");
    assert_eq!(next["viewTree"]["tool"], "structureSearch", "{next}");
    assert_eq!(
        next["viewTree"]["query"]["queries"][0]["path"], "src",
        "{next}"
    );
}

/// A scope-miss row leads to a listing with the same globs.
#[test]
fn scope_miss_leads_to_files_listing_with_same_globs() {
    let body = search_fixture(
        &[("a.rs", "needle\n")],
        ls_query(
            serde_json::json!({"matchString": "needle", "include": ["*.zzz"]}),
            None,
        ),
    );
    assert_eq!(body["filesScanned"], 0, "{body}");
    let lead = &body["next"]["viewTree"];
    assert_eq!(lead["tool"], "structureSearch", "{body}");
    let listing = &lead["query"]["queries"][0];
    assert_eq!(listing["operation"], "files", "{body}");
    assert_eq!(listing["include"], serde_json::json!(["*.zzz"]), "{body}");
}

/// A bare word include also searches inside directories named by it.
#[test]
fn bare_word_include_searches_inside_named_dir() {
    let body = search_fixture(
        &[
            ("tools/local_fetch/a.rs", "needle\n"),
            ("tools/other/b.rs", "needle\n"),
        ],
        ls_query(
            serde_json::json!({"matchString": "needle", "include": ["local_fetch"]}),
            None,
        ),
    );
    let text = body["files"].to_string();
    assert!(text.contains("local_fetch/a.rs"), "{body}");
    assert!(!text.contains("other/b.rs"), "{body}");
}

/// A large page keeps every run's owner, with its last line.
#[test]
fn large_page_keeps_enclosing_labels() {
    let source: String = (0..6)
        .map(|f| format!("fn f{f}() {{\n{}}}\n", "    helper();\n".repeat(10)))
        .collect();
    let body = search_fixture(
        &[("src/m.rs", &source)],
        ls_query(serde_json::json!({"matchString": "helper"}), None),
    );
    let rows = body["files"][0]["matches"].as_array().expect("rows");
    assert_eq!(rows.len(), 60, "{body}");
    for index in 0..rows.len() {
        let enclosing = &owner_of(&body["files"][0], index).expect("owner");
        assert_eq!(
            enclosing["symbolName"],
            format!("f{}", index / 10),
            "row {index}: {body}"
        );
        assert_eq!(enclosing["kind"], "function", "row {index}: {body}");
        assert!(
            enclosing["endLine"].as_u64() > enclosing["line"].as_u64(),
            "row {index}: {body}"
        );
    }
}

/// Declaration rows carry `declaration:true`; other rows carry nothing.
#[test]
fn declaration_rows_are_marked_sparsely() {
    let body = search_fixture(
        &[(
            "m.rs",
            "fn target() {}\n// target in prose\nfn caller() { target(); }\n",
        )],
        ls_query(serde_json::json!({"matchString": "target"}), None),
    );
    let rows = body["files"][0]["matches"].as_array().expect("rows");
    let by_line = |line: u64| {
        rows.iter()
            .find(|row| row["line"] == line)
            .unwrap_or_else(|| panic!("line {line}: {body}"))
    };
    assert_eq!(by_line(1)["declaration"], true, "{body}");
    assert!(by_line(2).get("declaration").is_none(), "{body}");
    assert!(by_line(3).get("declaration").is_none(), "{body}");
}

/// Thirty TS files of needle hits (every third also holds a token on a hit
/// line), a key file whose hit sits inside a private-key block, and an
/// innocent base64 hit: enough rows for several pages, with values that
/// redaction replaces and files whose key-block scans read their bytes.
fn paged_fixture(root: &std::path::Path) {
    for file in 0..30 {
        let mut body = (0..15)
            .map(|n| {
                format!(
                    "export function compute_{file}_{n}(value: number): number {{\n  const needle_{n} = value * {n};\n  return needle_{n} + {file};\n}}\n"
                )
            })
            .collect::<String>();
        if file % 3 == 0 {
            body.push_str(&format!(
                "const needle_token = \"ghp_{file:02}ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567\";\n"
            ));
        }
        fs::write(root.join(format!("m{file:02}.ts")), body).expect("fixture");
    }
    fs::write(
        root.join("zkey.ts"),
        "export const pem = `\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpQIBAAKCAQEAneedleKeyBodyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END RSA PRIVATE KEY-----\n`;\n",
    )
    .expect("key fixture");
    fs::write(
        root.join("zbase64.ts"),
        "export const blob = `\nneedleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n`;\n",
    )
    .expect("base64 fixture");
}

/// A later page served from the stored scan (whose digests the search took
/// in the read it searched with, whose snapshot it derives from the stored
/// query key, and whose redaction it replays) is byte-identical to the same
/// page cut from a fresh rescan, enclosing names and redacted values
/// included; so is a repeated page 1.
#[test]
fn a_stored_page_is_byte_identical_to_the_page_a_rescan_cuts() {
    let root = tempfile::tempdir().expect("fixture directory");
    paged_fixture(root.path());
    let (policy, security) = policy_for(root.path());
    let search = |request: &LocalSearchQuery| {
        execute_local_search(request, &policy, &security, &NeverCancel, None, Some(6_000))
            .expect("search")
    };
    let run = |request: &LocalSearchQuery| {
        let result = search(request);
        format!(
            "{}\n{:?}",
            serde_json::to_string(&result).expect("serialize"),
            result.source_snapshot
        )
    };
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let first = run(&request);
    assert_eq!(first, run(&request), "page 1 is deterministic");
    let page_one = search(&request);
    let snapshot = page_one.source_snapshot.clone().expect("snapshot");
    let pages = page_one.pagination.as_ref().expect("paged").total_pages;
    assert!(pages >= 4, "{pages}");
    let stored = super::manifest::get(&snapshot, &policy.identity()).expect("stored scan");
    let record = stored
        .redaction
        .expect("the page-1 redaction is replayable");
    assert!(!record.changes.is_empty(), "{record:?}");
    assert_eq!(record.key_files.len(), 2, "{record:?}");
    let mut every_page = first;
    for page in 2..=pages {
        let next = ls_query(
            serde_json::json!({"snapshot": snapshot, "page": page}),
            Some(&request),
        );
        assert!(
            super::manifest::get(&snapshot, &policy.identity())
                .is_some_and(|stored| stored.redaction.is_some()),
            "page {page} replays the stored scan's redaction"
        );
        let stored = run(&next);
        assert!(stored.contains("\"enclosing\""), "{stored}");
        super::manifest::evict(&snapshot);
        let rescanned = run(&next);
        assert_eq!(stored, rescanned, "page {page}");
        every_page.push_str(&stored);
    }
    assert!(every_page.contains("zkey.ts") && every_page.contains("zbase64.ts"));
    assert!(!every_page.contains("ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567"));
    assert!(!every_page.contains("KeyBody"));
    assert!(every_page.contains(&crate::security::key_fragment_placeholder()));
}

/// The files a page of the stored scan shows (`path` list).
fn page_paths(
    request: &LocalSearchQuery,
    policy: &PathPolicy,
    security: &ContentSecurity,
) -> Vec<String> {
    execute_local_search(request, policy, security, &NeverCancel, None, Some(6_000))
        .expect("page")
        .files
        .into_iter()
        .map(|file| file.path)
        .collect()
}

/// Swap `path` for a symlink to a copy outside the allowed root with the
/// same bytes and modification time: size, time and digest all match the
/// stored scan, and only the read policy sees the change.
#[cfg(unix)]
fn swap_for_outside_copy(path: &std::path::Path, outside: &std::path::Path) {
    let copy = outside.join(path.file_name().expect("file name"));
    fs::copy(path, &copy).expect("copy outside");
    let modified = fs::metadata(path)
        .and_then(|m| m.modified())
        .expect("mtime");
    fs::File::options()
        .write(true)
        .open(&copy)
        .and_then(|file| file.set_modified(modified))
        .expect("restore mtime");
    fs::remove_file(path).expect("remove");
    std::os::unix::fs::symlink(&copy, path).expect("symlink");
}

/// A stored page checks the read policy of every file it shows: a shown
/// file swapped for a symlink out of the root, under its stored stamp and
/// digest, fails the page. A swapped file the page neither reads nor shows
/// leaves the page as it was; the page that shows it fails.
#[cfg(unix)]
#[test]
fn a_stored_page_checks_the_read_policy_of_the_files_it_shows() {
    let root = tempfile::tempdir().expect("fixture directory");
    let outside = tempfile::tempdir().expect("outside directory");
    paged_fixture(root.path());
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let page_one = execute_local_search(
        &request,
        &policy,
        &security,
        &NeverCancel,
        None,
        Some(6_000),
    )
    .expect("page 1");
    let snapshot = page_one.source_snapshot.clone().expect("snapshot");
    let page = |page: u32| {
        ls_query(
            serde_json::json!({"snapshot": snapshot, "page": page}),
            Some(&request),
        )
    };
    let run = |page: &LocalSearchQuery| {
        execute_local_search(page, &policy, &security, &NeverCancel, None, Some(6_000))
    };
    let second = serde_json::to_string(&run(&page(2)).expect("page 2")).expect("json");
    let on_two = page_paths(&page(2), &policy, &security);
    let on_three = page_paths(&page(3), &policy, &security);
    let later = on_three
        .iter()
        .find(|path| !on_two.contains(path))
        .expect("a page-3 file");
    swap_for_outside_copy(&root.path().join(later), outside.path());
    assert!(super::manifest::get(&snapshot, &policy.identity()).is_some());
    let unchanged =
        serde_json::to_string(&run(&page(2)).expect("page 2 neither reads nor shows it"))
            .expect("json");
    assert_eq!(unchanged, second);
    let denied = run(&page(3)).expect_err("page 3 shows the swapped file");
    assert_eq!(denied.code, "symlinkEscape", "{}", denied.message);
    assert!(
        denied.message.contains("denied by the active path policy"),
        "{}",
        denied.message
    );
    swap_for_outside_copy(&root.path().join(&on_two[0]), outside.path());
    let denied = run(&page(2)).expect_err("page 2 shows the swapped file");
    assert_eq!(denied.code, "symlinkEscape", "{}", denied.message);
    assert!(
        denied.message.contains("denied by the active path policy"),
        "{}",
        denied.message
    );
}

/// A key file the stored redaction scanned, rewritten in place under its
/// stored size and time, restarts the snapshot on a page that does not even
/// show it: the replay reads the key file again and binds it to the stored
/// digest, as a fresh redaction does.
#[test]
fn a_key_file_rewritten_under_its_stamp_restarts_a_replayed_page() {
    let root = tempfile::tempdir().expect("fixture directory");
    paged_fixture(root.path());
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let snapshot = execute_local_search(
        &request,
        &policy,
        &security,
        &NeverCancel,
        None,
        Some(6_000),
    )
    .expect("page 1")
    .source_snapshot
    .expect("snapshot");
    let page_two = ls_query(
        serde_json::json!({"snapshot": snapshot, "page": 2}),
        Some(&request),
    );
    assert!(
        !page_paths(&page_two, &policy, &security)
            .iter()
            .any(|path| path == "zkey.ts")
    );
    let key = root.path().join("zkey.ts");
    let text = fs::read_to_string(&key).expect("key fixture");
    rewrite_keeping_stamp(&key, &text.replace("export const pem", "export const pex"));
    assert!(
        super::manifest::get(&snapshot, &policy.identity())
            .is_some_and(|stored| stored.redaction.is_some())
    );
    let error = execute_local_search(
        &page_two,
        &policy,
        &security,
        &NeverCancel,
        None,
        Some(6_000),
    )
    .expect_err("changed key file");
    assert_eq!(error.code, "staleSnapshot");
}

/// Count views rank the most hits first under the default sort; equal
/// counts keep relevance order. Other views keep relevance.
#[test]
fn count_views_order_by_count_under_the_default_sort() {
    use super::executor::order_files;
    let file = |path: &str, match_count| octocode_engine::types::TextSearchFile {
        path: path.into(),
        match_count,
        matches: Vec::new(),
        source: None,
    };
    // Engine relevance order: the declaring files first.
    let relevance = || {
        vec![
            file("decl.rs", 3),
            file("tie_b.rs", 38),
            file("big.rs", 155),
            file("tie_a.rs", 38),
        ]
    };
    for view in ["countMatches", "countLines"] {
        let mut files = relevance();
        order_files(
            &ls_query(serde_json::json!({"resultView": view}), None),
            &mut files,
        );
        let order: Vec<_> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            order,
            ["big.rs", "tie_b.rs", "tie_a.rs", "decl.rs"],
            "{view}"
        );
    }
    let mut files = relevance();
    order_files(&ls_query(serde_json::json!({}), None), &mut files);
    assert_eq!(files[0].path, "decl.rs", "a line view keeps relevance");
}

/// `includeIgnored` is the one "search everything" switch: it
/// also walks hidden files. An explicit `hidden:false` still wins.
#[test]
fn no_ignore_also_walks_hidden_files() {
    use super::executor::search_options;
    let root = std::path::Path::new(".");
    let all = search_options(
        &ls_query(serde_json::json!({"includeIgnored": true}), None),
        root,
        None,
    );
    assert_eq!((all.no_ignore, all.hidden), (Some(true), Some(true)));
    let plain = search_options(&ls_query(serde_json::json!({}), None), root, None);
    assert_ne!(plain.hidden, Some(true));
    let kept = search_options(
        &ls_query(
            serde_json::json!({"includeIgnored": true, "includeHidden": false}),
            None,
        ),
        root,
        None,
    );
    assert_eq!(kept.hidden, Some(false));
}

/// A line view with thousands of hits leads to the per-file counts first: one
/// call ranks the files instead of paging every hit. Small results, later
/// pages, and count views get no such lead.
#[test]
fn a_large_line_result_leads_to_per_file_counts() {
    let many = "needle\n".repeat(1_200);
    let body = search_fixture(
        &[("big.txt", &many), ("small.txt", "needle\n")],
        ls_query(serde_json::json!({"matchString":"needle"}), None),
    );
    let lead = &body["next"]["viewFileCount"];
    assert_eq!(lead["tool"], "localSearch", "{body}");
    let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
    assert_eq!(row["resultView"], "countMatches", "{lead}");
    assert!(
        row.get("page").is_none() && row.get("snapshot").is_none(),
        "{lead}"
    );
    let hints = body["hints"].to_string();
    assert!(
        hints.contains("matches.") && !hints.contains("hints."),
        "{body}"
    );
    let small = search_fixture(
        &[("a.txt", "needle\n")],
        ls_query(serde_json::json!({"matchString":"needle"}), None),
    );
    assert!(small["next"].get("viewFileCount").is_none(), "{small}");
    let counts = search_fixture(
        &[("big.txt", &many)],
        ls_query(
            serde_json::json!({"matchString":"needle","resultView":"countMatches"}),
            None,
        ),
    );
    assert!(counts["next"].get("viewFileCount").is_none(), "{counts}");
}

/// A compound identifier that matches nothing is probed in its other case
/// styles: when `parse_config` exists, `parseConfig` leads to it instead of
/// reading as absent. Single words and hits get no such lead.
#[test]
fn a_missed_identifier_leads_to_its_spelling_variants() {
    let files = [("src/cfg.py", "def parse_config(path):\n    return path\n")];
    let body = search_fixture(
        &files,
        ls_query(serde_json::json!({"matchString":"parseConfig"}), None),
    );
    let lead = &body["next"]["findSimilar"];
    assert_eq!(lead["tool"], "localSearch", "{body}");
    let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
    let pattern = row["matchString"].as_str().unwrap_or_default();
    assert!(pattern.contains("parse_config"), "{row}");
    assert_eq!(row["regex"], "rust", "{row}");
    let hints = body["hints"].to_string();
    assert!(
        hints.contains("other spellings match in 1 file") && !hints.contains("hints."),
        "{body}"
    );
    // The variant lead runs and finds the file.
    let run = search_fixture(&files, ls_query(row.clone(), None));
    assert_eq!(run["files"][0]["path"], "src/cfg.py", "{run}");
    for miss in ["zzzqqq", "parse_config_missing_entirely"] {
        let none = search_fixture(
            &files,
            ls_query(serde_json::json!({"matchString": miss}), None),
        );
        assert!(none["next"].get("findSimilar").is_none(), "{miss}: {none}");
    }
}

/// Case-style variants of a compound identifier, excluding the term itself.
#[test]
fn identifier_variants_cover_the_common_case_styles() {
    let variants = super::leads::identifier_variants("parseConfig").expect("compound");
    for expected in [
        "parse_config",
        "ParseConfig",
        "PARSE_CONFIG",
        "parse-config",
    ] {
        assert!(
            variants.iter().any(|v| v == expected),
            "{expected}: {variants:?}"
        );
    }
    assert!(!variants.iter().any(|v| v == "parseConfig"));
    assert!(
        super::leads::identifier_variants("needle").is_none(),
        "one word"
    );
    assert!(
        super::leads::identifier_variants("a.b").is_none(),
        "not an identifier"
    );
    let from_snake = super::leads::identifier_variants("HTTP_server_error").expect("snake");
    assert!(
        from_snake.iter().any(|v| v == "httpServerError"),
        "{from_snake:?}"
    );
}

/// `fileHas`/`fileLacks` filter matched files by other terms they
/// hold anywhere, not on the hit line: "uses X and Y but not Z".
#[test]
fn file_terms_keep_files_with_every_term_and_none_excluded() {
    let files = [
        ("src/a.rs", "fn handler() {}\nuse tokio;\n"),
        ("src/b.rs", "fn handler() {}\nuse tokio;\nuse async_std;\n"),
        ("src/c.rs", "fn handler() {}\n"),
    ];
    let body = search_fixture(
        &files,
        ls_query(
            serde_json::json!({"matchString":"handler","fileHas":["tokio"],"fileLacks":["async_std"]}),
            None,
        ),
    );
    let paths: Vec<&str> = body["files"]
        .as_array()
        .expect("files")
        .iter()
        .filter_map(|file| file["path"].as_str())
        .collect();
    assert_eq!(paths, ["src/a.rs"], "{body}");
}

/// The ignored-path hint names why files were skipped: the deciding ignore
/// file, line and pattern (`gen/.gitignore:2 '*'`), or `hidden`.
#[test]
fn an_empty_search_names_the_rule_that_skipped_its_matches() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    fs::write(root.path().join(".gitignore"), "logs/\n").expect("gitignore");
    for dir in ["logs", "gen", ".notes"] {
        fs::create_dir_all(root.path().join(dir)).expect("dir");
    }
    fs::write(root.path().join("gen/.gitignore"), "# generated\n*\n").expect("nested");
    fs::write(root.path().join("logs/log.txt"), "needle-here\n").expect("fixture");
    fs::write(root.path().join("gen/api.ts"), "needle-here\n").expect("fixture");
    fs::write(root.path().join(".notes/x.txt"), "needle-here\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle-here"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let hint = &result.hints[0];
    assert!(
        hint.starts_with("3 file(s) match in skipped paths"),
        "{hint}"
    );
    for why in [
        ".gitignore:1 'logs/'",
        "gen/.gitignore:2 '*'",
        "hidden .notes/",
    ] {
        assert!(hint.contains(why), "{why}: {hint}");
    }
    assert!(hint.len() <= 120, "{hint}");
}

/// Enclosing names fill only the room the rendered page leaves: rows render
/// with the root's workspace-relative prefix, which the page cut charges, so
/// the names must too, or a deep root overflows the response window.
#[test]
fn enclosing_names_leave_room_for_the_rendered_path_prefix() {
    let workspace = tempfile::tempdir().expect("fixture directory");
    let deep = format!(
        "{}/src",
        ["a-rather-long-directory-name-for-paths"; 5].join("/")
    );
    let root = workspace.path().join(&deep);
    fs::create_dir_all(&root).expect("deep root");
    for index in 0..40 {
        fs::write(
            root.join(format!("module_{index:02}.rs")),
            format!("fn handler_{index:02}_with_a_long_name() {{\n    needle();\n}}\n\nfn other_{index:02}() {{\n    needle();\n}}\n"),
        )
        .expect("fixture");
    }
    let (policy, security) = policy_for(workspace.path());
    // The row reserve exceeds half this window, so the page budget is its
    // floor: half the window.
    let window = 4_000;
    let budget = window / 2;
    let prefix = deep.len() + 1;
    let mut page = 1;
    loop {
        let request = ls_query(
            serde_json::json!({"path": root.to_string_lossy().into_owned(), "matchString": "needle", "page": page}),
            None,
        );
        let result = execute_local_search(
            &request,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(window),
        )
        .expect("search");
        let files = serde_json::to_string(&result.files).expect("files").len();
        let rendered = files + prefix * result.files.len();
        assert!(rendered <= budget, "page {page}: {rendered} > {budget}");
        let more = result.pagination.as_ref().is_some_and(|p| p.has_more);
        if !more || page > 20 {
            break;
        }
        page += 1;
    }
}

/// A hit in a JSON or TOML file names its key path, one
/// `matchKeys` map per file row; other files carry none.
#[test]
fn json_and_toml_hits_name_their_key_paths() {
    let package = "{\n  \"scripts\": {\n    \"typescript\": \"tsc --noEmit\"\n  },\n  \"devDependencies\": {\n    \"typescript\": \"6.0.2\"\n  }\n}\n";
    let cargo = "[package]\nname = \"demo\"\n\n[workspace]\nmembers = [\n    \"typescript-x\",\n]\n\n[dependencies]\ntypescript = \"1\"\n";
    let body = search_fixture(
        &[
            ("package.json", package),
            ("Cargo.toml", cargo),
            ("notes.md", "typescript\n"),
        ],
        ls_query(
            serde_json::json!({"matchString": "typescript", "sort": "path"}),
            None,
        ),
    );
    let file = |name: &str| {
        body["files"]
            .as_array()
            .and_then(|files| files.iter().find(|file| file["path"] == name))
            .unwrap_or_else(|| panic!("{name}: {body}"))
            .clone()
    };
    assert_eq!(
        file("package.json")["matchKeys"],
        serde_json::json!({"3": "scripts.typescript", "6": "devDependencies.typescript"}),
        "{body}"
    );
    assert_eq!(
        file("Cargo.toml")["matchKeys"],
        serde_json::json!({"6": "workspace.members[0]", "10": "dependencies.typescript"}),
        "{body}"
    );
    assert!(file("notes.md").get("matchKeys").is_none(), "{body}");
}

/// The over-1 MiB note counts only files whose language has
/// declarations (a lockfile never had any), and says `1 hit row`.
#[test]
fn oversized_enclosing_note_skips_files_without_declarations() {
    let filler = "// padding line for an oversized source file\n".repeat(25_000);
    let body = search_fixture(
        &[
            ("uv.lock", &format!("needle = 1\n{filler}")),
            ("big.rs", &format!("fn f() {{ needle(); }}\n{filler}")),
        ],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    let warnings = body["warnings"].to_string();
    assert!(
        warnings.contains("are not named in files over 1 MiB; 1 hit row there has none."),
        "{body}"
    );
    let lock_only = search_fixture(
        &[("uv.lock", &format!("needle = 1\n{filler}"))],
        ls_query(serde_json::json!({"matchString": "needle"}), None),
    );
    assert!(
        !lock_only["warnings"].to_string().contains("1 MiB"),
        "{lock_only}"
    );
}

/// Files past the collection cap are named with their count on every
/// page, never only in `stats`.
#[test]
fn files_past_the_collection_cap_are_disclosed() {
    let scanned = octocode_engine::types::TextSearchStats {
        files_matched: Some(10_851),
        capped: Some(true),
        cap_reason: Some("maxCollectedFiles".into()),
        ..Default::default()
    };
    let stats = executor::search_stats(&scanned, executor::MAX_COLLECTED_FILES);
    let warning =
        leads::uncollected_warning(&stats, executor::MAX_COLLECTED_FILES).expect("disclosed");
    assert!(warning.contains("851 of 10851"), "{warning}");
    let uncapped = executor::search_stats(
        &octocode_engine::types::TextSearchStats {
            files_matched: Some(10),
            ..Default::default()
        },
        10,
    );
    assert!(leads::uncollected_warning(&uncapped, 10).is_none());
}

/// A PCRE2 matching limit on a readable file is the pattern's failure,
/// not an unreadable scope, and the error names the file root-relative.
#[test]
fn a_pcre2_matching_limit_is_a_pattern_failure_not_an_unreadable_file() {
    let root = tempfile::tempdir().expect("fixture directory");
    let mut text = "a".repeat(50_000);
    text.push_str("b\n");
    fs::write(root.path().join("patho.txt"), &text).expect("fixture");
    let (policy, security) = policy_for(root.path());
    let file = root.path().join("patho.txt");
    let request = ls_query(
        serde_json::json!({"path": file.to_string_lossy().into_owned(), "matchString": "(a+)+$", "regex": "pcre2"}),
        None,
    );
    let error = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect_err("every file failed in the matcher");
    assert_eq!(error.code, "invalidPattern", "{error:?}");
    assert!(error.message.contains("first: patho.txt:"), "{error:?}");
    assert!(
        !error
            .message
            .contains(&root.path().to_string_lossy().into_owned()),
        "{error:?}"
    );
    // In a folder with a matching file the limit is disclosed per call.
    fs::write(root.path().join("ok.txt"), "aaa\n").expect("fixture");
    let folder = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "(a+)+$", "regex": "pcre2"}),
        None,
    );
    let result = execute_local_search(&folder, &policy, &security, &NeverCancel, None, None)
        .expect("one file searched");
    assert!(
        result
            .warnings
            .iter()
            .any(|w| w
                .starts_with("patternLimit: the regex hit the engine's matching limit in 1 file")),
        "{:?}",
        result.warnings
    );
}

/// The scope listing a localSearch lead offers walks the same scope the
/// search did: `includeIgnored` and `defaultExcludes:false` carry over.
#[test]
fn scope_listing_keeps_the_search_walk_scope() {
    let request = ls_query(
        serde_json::json!({"path": "/repo", "matchString": "x", "includeIgnored": true, "defaultExcludes": false, "include": ["*.ts"]}),
        None,
    );
    let listing = leads::scope_listing(&request);
    let query = &listing["query"]["queries"][0];
    assert_eq!(query["operation"], "files", "{listing}");
    assert_eq!(query["includeIgnored"], true, "{listing}");
    assert_eq!(query["defaultExcludes"], false, "{listing}");
    assert_eq!(query["include"], serde_json::json!(["*.ts"]), "{listing}");
    let plain = leads::scope_listing(&ls_query(
        serde_json::json!({"path": "/repo", "matchString": "x"}),
        None,
    ));
    let plain = &plain["query"]["queries"][0];
    assert!(
        plain.get("includeIgnored").is_none() && plain.get("defaultExcludes").is_none(),
        "{plain}"
    );
}

/// An ignore rule above the search root is named relative to it,
/// never by an absolute path.
#[test]
fn a_skip_reason_above_the_root_is_root_relative() {
    let top = tempfile::tempdir().expect("top");
    fs::create_dir_all(top.path().join(".git")).expect("git");
    fs::write(top.path().join(".gitignore"), "*.log\n").expect("ignore");
    let root = top.path().join("sub");
    fs::create_dir_all(&root).expect("root");
    let reason =
        crate::tools::empty_walk::ignore_rule(&root, &root.join("x.log"), false).expect("ignored");
    assert_eq!(reason, "../.gitignore:1 '*.log'");
}

/// Every page of a walk, from `request`: runs page 1, then each later page
/// pinned to the first page's snapshot, until the page count it reported.
fn walk_pages(files: &[(&str, &str)], request: &LocalSearchQuery) -> Vec<serde_json::Value> {
    let root = tempfile::tempdir().expect("fixture directory");
    for (name, body) in files {
        fs::write(root.path().join(name), body).expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned()}),
        Some(request),
    );
    let first = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("first page");
    let total = first.pagination.as_ref().map_or(1, |p| p.total_pages);
    let snapshot = first.source_snapshot.clone();
    let mut pages = vec![serde_json::to_value(&first).expect("serialize")];
    for page in 2..=total {
        let next = ls_query(
            serde_json::json!({"page": page, "snapshot": snapshot}),
            Some(&request),
        );
        let result = execute_local_search(&next, &policy, &security, &NeverCancel, None, None)
            .expect("later page");
        pages.push(serde_json::to_value(&result).expect("serialize"));
    }
    pages
}

/// A page holds at most the default page size of files in every view, so
/// the enclosing names it promises (and its warning) describe that page:
/// a result of more files than a page opens with a full page and walks the
/// rest, never one oversized page with unnamed rows.
#[test]
fn a_small_result_over_one_page_of_files_still_pages_by_file_count() {
    let sources: Vec<(String, String)> = (0..25)
        .map(|i| {
            (
                format!("f{i:02}.rs"),
                format!("fn f{i}() {{\n    needle();\n}}\n"),
            )
        })
        .collect();
    let fixtures: Vec<(&str, &str)> = sources
        .iter()
        .map(|(name, body)| (name.as_str(), body.as_str()))
        .collect();
    for view in ["matchOnly", "paginated"] {
        let request = ls_query(
            serde_json::json!({"matchString": "needle", "resultView": view}),
            None,
        );
        let pages = walk_pages(&fixtures, &request);
        assert_eq!(pages.len(), 2, "{view}: {pages:?}");
        let counts: Vec<usize> = pages
            .iter()
            .map(|page| page["files"].as_array().expect("files").len())
            .collect();
        assert_eq!(counts, [20, 5], "{view}: {pages:?}");
        for page in &pages {
            assert!(page.get("warnings").is_none(), "{view}: {page}");
            for file in page["files"].as_array().expect("files") {
                assert!(file["matches"][0].get("enclosing").is_some(), "{page}");
            }
        }
        assert_eq!(pages[0]["pagination"]["hasMore"], true, "{view}: {pages:?}");
    }
}

/// Streamed pages are cut by the response budget, so a file can ride
/// several pages: `totalItems` counts the hit rows the pages walk (each
/// shown exactly once), never the files, and `totalPages` counts those
/// same pages.
#[test]
fn streamed_pagination_counts_pages_and_items_in_one_unit() {
    let hot = "needle\n".repeat(1200);
    let fixtures = [("a.txt", "needle\n"), ("hot.txt", hot.as_str())];
    let request = ls_query(serde_json::json!({"matchString": "needle"}), None);
    let pages = walk_pages(&fixtures, &request);
    assert!(pages.len() > 2, "{} pages", pages.len());
    let shown: usize = pages
        .iter()
        .flat_map(|page| page["files"].as_array().expect("files"))
        .map(|file| file["matches"].as_array().expect("rows").len())
        .sum();
    assert_eq!(shown, 1201);
    for page in &pages {
        let pagination = &page["pagination"];
        assert_eq!(pagination["totalPages"], pages.len(), "{page}");
        assert_eq!(pagination["totalItems"], shown, "{page}");
        assert!(pagination.get("pageSize").is_none(), "{page}");
    }
}

/// Every `next.*` lead of a body is a call its own tool accepts.
fn assert_leads_validate(body: &serde_json::Value, label: &str) {
    for (name, lead) in body["next"].as_object().into_iter().flatten() {
        let tool = lead["tool"].as_str().expect("lead tool");
        if let Err(error) = crate::contracts::validate(tool, lead["query"].clone()) {
            panic!(
                "{label}: next.{name} is invalid: {:?}\n{lead}",
                error.issues
            );
        }
    }
}

/// A result large enough to lead to per-file counts, read as matchOnly
/// with `unique`, leads to a call the schema accepts, for every view and
/// uniqueness mode: a lead never fails validation.
#[test]
fn every_lead_of_every_view_validates_against_the_schema() {
    let root = tempfile::tempdir().expect("fixture");
    fs::write(root.path().join("a.txt"), "needle one\n".repeat(900)).expect("a");
    fs::write(root.path().join("b.txt"), "needle two\n".repeat(900)).expect("b");
    let (policy, security) = policy_for(root.path());
    let views = [
        LocalSearchQueryResultView::Paginated,
        LocalSearchQueryResultView::MatchOnly,
        LocalSearchQueryResultView::Files,
        LocalSearchQueryResultView::CountMatches,
    ];
    let uniques = [
        LocalSearchQueryUnique::Off,
        LocalSearchQueryUnique::Count,
        LocalSearchQueryUnique::List,
    ];
    for view in views {
        for unique in uniques {
            let only = view == LocalSearchQueryResultView::MatchOnly;
            if !only && unique != LocalSearchQueryUnique::Off {
                continue;
            }
            for page_size in [None, Some(1)] {
                let request = ls_query(
                    serde_json::json!({
                        "path": root.path().to_string_lossy().into_owned(),
                        "matchString": "needle",
                        "resultView": view,
                        "unique": unique,
                        "pageSize": page_size,
                    }),
                    None,
                );
                let result =
                    execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
                        .expect("search");
                let body = serde_json::to_value(result).expect("serialize");
                assert_leads_validate(&body, &format!("{view:?}/{unique:?}/{page_size:?}"));
            }
        }
    }
}

/// Local eval (a): children of the search root that are ignored by the
/// enclosing repository's `.gitignore` are named as ignored, even when each
/// child is a repository of its own (a nested `.git` ends the child's own
/// rules, never the outer rule that skipped the whole child).
#[test]
fn an_empty_search_over_ignored_nested_repositories_names_the_ignore_rule() {
    let top = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(top.path().join(".git")).expect("outer repository");
    fs::write(top.path().join(".gitignore"), "repos/*\n").expect("gitignore");
    let root = top.path().join("repos");
    for child in ["a", "b"] {
        fs::create_dir_all(root.join(child).join(".git")).expect("nested repository");
        fs::create_dir_all(root.join(child).join(".github")).expect("hidden dir");
        fs::write(root.join(child).join(".github/x.py"), "needle\n").expect("fixture");
        fs::write(root.join(child).join("y.py"), "needle\n").expect("fixture");
    }
    let reason = crate::tools::empty_walk::ignore_rule(&root, &root.join("a/.github/x.py"), false)
        .expect("skipped");
    assert_eq!(reason, "../.gitignore:1 'repos/*'");
    let (policy, security) = policy_for(top.path());
    let request = ls_query(
        serde_json::json!({"path": root.to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    assert!(result.files.is_empty());
    let hint = &result.hints[0];
    assert!(hint.contains("../.gitignore:1 'repos/*'"), "{hint}");
    assert!(!hint.contains("hidden a/.github"), "{hint}");
    let lead = &result.next.as_ref().expect("lead")["includeSkipped"];
    assert_eq!(
        lead["query"]["queries"][0]["includeIgnored"], true,
        "{lead}"
    );
}

/// The flat totals of a search row (`matchCount`, `filesScanned`, …) satisfy
/// the strict output contract: no `stats` object, `fileCount`, `capped` or
/// `capReason`, and an unreadable path or a limit surfaces as
/// `fileErrors` / `partialReasons`.
#[test]
fn a_search_row_serializes_flat_totals_that_satisfy_the_output_contract() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::write(root.path().join("a.txt"), "needle one\nneedle two\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("search");
    let mut wire = serde_json::to_value(&result).expect("serialize");
    assert_eq!(wire["matchCount"], 2, "{wire}");
    assert_eq!(wire["filesScanned"], 1, "{wire}");
    for gone in ["stats", "fileCount", "capped", "capReason", "searchTime"] {
        assert!(wire.get(gone).is_none(), "{gone}: {wire}");
    }
    crate::contracts::validate_output(
        "localSearch",
        &serde_json::json!({"results":[{"index":0,"data":wire.take()}]}),
    )
    .expect("flat totals satisfy the output contract");

    let stats = SearchStats {
        total_occurrences: 0,
        matched_lines: 0,
        files_matched: 0,
        files_searched: 3,
        bytes_searched: None,
        capped: Some(true),
        cap_reason: Some("maxFiles, maxOnlyMatchingPerLine".into()),
        partial_reasons: vec!["maxFiles".into(), "maxOnlyMatchingPerLine".into()],
        error_count: Some(1),
        first_error: Some("x.bin: denied".into()),
        file_errors: Some(FileErrors {
            count: 1,
            first: Some("x.bin: denied".into()),
        }),
        binary_skipped: None,
    };
    let wire = serde_json::to_value(&stats).expect("serialize");
    assert_eq!(
        wire["fileErrors"],
        serde_json::json!({"count":1,"first":"x.bin: denied"})
    );
    assert_eq!(
        wire["partialReasons"],
        serde_json::json!(["maxFiles", "maxOnlyMatchingPerLine"])
    );
}

/// A line holding more matches than one page (or the old per-line cap of
/// 1000) still reaches every match: `next.nextMatchPage` walks them all.
#[test]
fn match_only_pages_every_match_of_a_line_with_thousands_of_hits() {
    let root = tempfile::tempdir().expect("fixture directory");
    let hits = 2_500;
    fs::write(
        root.path().join("min.js"),
        format!("{}\n", "needle ".repeat(hits)),
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let mut request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle", "resultView": LocalSearchQueryResultView::MatchOnly, "matchPageSize": 400}),
        None,
    );
    let mut seen = Vec::new();
    for _ in 0..20 {
        let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
            .expect("page");
        let body = serde_json::to_value(&result).expect("serialize");
        assert!(body.get("partialReasons").is_none(), "{body}");
        for matched in body["files"][0]["matches"].as_array().expect("matches") {
            seen.push(matched["column"].as_u64().expect("column"));
        }
        let Some(next) = body["next"].get("nextMatchPage") else {
            break;
        };
        request = ls_query(next["query"]["queries"][0].clone(), Some(&request));
    }
    let expected: Vec<u64> = (0..hits as u64).map(|n| n * 7 + 1).collect();
    assert_eq!(seen, expected);
}

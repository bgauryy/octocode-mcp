use super::*;

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

fn goal_search_replay_with_window(response_window: Option<usize>) {
    let root = tempfile::tempdir().expect("fixture");
    std::fs::write(root.path().join("a.txt"), "needle\n").expect("fixture");
    std::fs::write(root.path().join("b.txt"), "needle\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path":root.path(),"matchString":"needle","pageSize":1,"clasifyContext":{"classifiers":["find needle"]}}),
        None,
    );
    let first = select_all_search(
        &request,
        &policy,
        &security,
        &NeverCancel,
        None,
        response_window,
    )
    .expect("page");
    assert_eq!(
        first.selection.as_ref().map(|r| r.status),
        Some(crate::contracts::tool_types::SelectionStatus::Complete)
    );
    let continued: LocalSearchQuery = serde_json::from_value(
        first.next.expect("next")["nextPage"]["query"]["queries"][0].clone(),
    )
    .expect("continuation");
    assert!(continued.selection.is_some());
    let second = select_all_search(
        &continued,
        &policy,
        &security,
        &NeverCancel,
        None,
        response_window,
    )
    .expect("page");
    assert_eq!(second.files.len(), 1);
    let changed = ls_query(
        serde_json::json!({"clasifyContext":{"classifiers":["another goal"]}}),
        Some(&continued),
    );
    assert_eq!(
        select_all_search(
            &changed,
            &policy,
            &security,
            &NeverCancel,
            None,
            response_window
        )
        .expect_err("stale")
        .code,
        "staleSnapshot"
    );
}

#[test]
fn goal_search_replays_skipped_order_and_rejects_changed_goals() {
    for response_window in [None, Some(20_000)] {
        goal_search_replay_with_window(response_window);
    }
}

#[test]
fn selection_recovery_keeps_search_snapshot_and_rejects_source_or_window_drift() {
    let root = tempfile::tempdir().expect("fixture");
    let path = root.path().join("evidence.txt");
    fs::write(&path, "needle before\n").expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path":root.path(),"matchString":"needle",
            "clasifyContext":{"classifiers":["Does this evidence explain the current resource lifecycle?"],"longContext":true}}),
        None,
    );
    let first = execute_local_search_selected(
        &request,
        &policy,
        &security,
        &NeverCancel,
        None,
        Some(20_000),
        None,
    )
    .expect("unavailable classifier still provides recovery");
    assert!(first.files.is_empty());
    let snapshot = first.source_snapshot.expect("captured search identity");
    let recovery: LocalSearchQuery = serde_json::from_value(
        first.next.expect("next")["unfiltered"]["query"]["queries"][0].clone(),
    )
    .expect("executable recovery");
    assert!(recovery.clasify_context.is_none());
    assert!(recovery.selection.is_none());
    assert_eq!(recovery.snapshot(), Some(snapshot.as_str()));
    for cached in [true, false] {
        if !cached {
            super::manifest::evict(&snapshot);
        }
        let recovered = execute_local_search(
            &recovery,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(20_000),
        )
        .expect("unchanged captured evidence is recoverable");
        assert!(values(&recovered).contains("needle before"));
        assert_eq!(
            recovered.source_snapshot.as_deref(),
            Some(snapshot.as_str())
        );
        assert_eq!(
            execute_local_search(
                &recovery,
                &policy,
                &security,
                &NeverCancel,
                None,
                Some(24_000),
            )
            .expect_err("real response-window change must restart")
            .code,
            "staleSnapshot"
        );
    }
    rewrite_keeping_stamp(&path, "needle after!\n");
    assert_eq!(
        execute_local_search(
            &recovery,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(20_000),
        )
        .expect_err("changed source must restart")
        .code,
        "staleSnapshot"
    );
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
fn file_page_ceiling_keeps_later_files_partial_and_terminal() {
    let root = tempfile::tempdir().expect("fixture");
    for index in 0..1001 {
        fs::write(root.path().join(format!("a{index:04}.txt")), "hit\n").expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({
            "path":root.path(), "matchString":"hit", "sort":"path", "pageSize":1,
            "page":1000
        }),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None)
        .expect("last admitted file page");
    assert_eq!(result.status, SearchStatus::Partial, "{result:?}");
    assert!(result.terminal_limit, "{result:?}");
    assert_eq!(result.files[0].path, "a0999.txt");
    assert_eq!(result.files[0].matches.as_ref().expect("match")[0].line, 1);
    let body = serde_json::to_value(result).expect("output");
    assert_eq!(body["pagination"]["hasMore"], true, "{body}");
    assert!(body["next"].get("nextPage").is_none(), "{body}");
    assert!(
        body["warnings"]
            .as_array()
            .expect("ceiling disclosure")
            .iter()
            .any(|warning| warning
                .as_str()
                .is_some_and(|text| text.contains("1 later file pages"))),
        "{body}"
    );
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
    crate::tools::test_support::checks::assert_absent(&clean, "redactedMatches");
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
    let root_dir = crate::tools::test_support::Fixture::new();
    let root = root_dir.0.clone();
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
    let root_dir = crate::tools::test_support::Fixture::new();
    let root = root_dir.0.clone();
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
    // The restart is the first page: every cursor field is omitted.
    let restart_row = &restart["restart"]["query"]["queries"][0];
    for cursor in crate::tools::result::CURSOR_FIELDS {
        assert!(restart_row.get(cursor).is_none(), "{cursor}: {restart_row}");
    }
    assert_eq!(restart_row["matchString"], "needle");

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
        (SearchStatus::Partial, false),
        "later files keep global coverage partial without capping an exhausted branch"
    );
    assert_eq!(
        classify_search(false, true, true, false, false, true),
        (SearchStatus::Partial, true),
        "a collection cap stays terminal even when sibling file pages remain"
    );
    assert_eq!(
        classify_search(false, false, true, false, true, true),
        (SearchStatus::Partial, true),
        "unsearched content stays terminal even when sibling file pages remain"
    );
    assert_eq!(
        classify_search(false, false, false, true, false, true),
        (SearchStatus::Partial, true),
        "unreachable match rows are still a terminal limit"
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
        result
            .warnings
            .iter()
            .any(|warning| warning == "Default excludes skipped 1 dir."),
        "{body}"
    );
    let disclosed = serde_json::to_value(&result).expect("result");
    assert_eq!(
        disclosed["skippedPaths"]["entries"],
        serde_json::json!([{"path":skipped_source_path(root.path(),"node_modules"),"cause":"default-excluded"}]),
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
    crate::tools::test_support::checks::assert_absent(&body["hints"], "all-lowercase");
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
/// with no paging metadata, however many hits it has; larger results fill
/// their page budget, more files than a page walk by page (see
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
    let shown = body["files"][0]["matches"]
        .as_array()
        .expect("matches")
        .len();
    assert!((100..1200).contains(&shown), "{shown} rows");
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

#[test]
fn default_search_pages_fill_the_window_instead_of_stopping_at_an_overview() {
    let root = tempfile::tempdir().expect("fixture");
    fs::write(root.path().join("hot.txt"), "needle\n".repeat(1_200)).expect("fixture");
    let start = serde_json::to_value(ls_query(
        serde_json::json!({"path":root.path(),"matchString":"needle"}),
        None,
    ))
    .expect("query");
    let (walk, bodies) = walk_search(root.path(), start, None);
    let first = bodies[0]["files"][0]["matches"]
        .as_array()
        .expect("matches");
    assert!(
        first.len() > 100,
        "first page stopped before filling budget: {}",
        first.len()
    );
    // The walk delivered each row once and checked every continuation
    // against the input contract.
    assert_eq!(walk.rows.len(), 1_200);
    assert!(walk.queries.len() < 5, "{} pages", walk.queries.len());
}

/// A generated Rust file of `functions` functions with five `let ` lines
/// each: an engine-like hot file whose hits all sit inside declarations.
fn let_heavy_rust(prefix: &str, functions: usize) -> String {
    (0..functions)
        .map(|n| {
            format!(
                "pub fn {prefix}_{n:03}(input: &Request) -> Result<Response, Error> {{\n    let header = input.header();\n    let body = parse_body(&header)?;\n    let validated = validate(body)?;\n    let mapped = map_fields(&validated);\n    let response = Response::new(mapped);\n    Ok(response)\n}}\n\n"
            )
        })
        .collect()
}

/// Rows page 1 of `let_heavy_rust("handle_request", 200)` held when every
/// hit row reserved a flat 93 chars for its `enclosing` name.
const FLAT_RESERVE_FIRST_PAGE_ROWS: usize = 154;

/// A default page charges each hit row the `enclosing` name it carries (the
/// full name on a declaration's first row of the page, `enclosingLine` on
/// its later rows) instead of a flat reserve, so a page of a hot file fills
/// the window and still stays within the page budget.
#[test]
fn default_pages_fill_the_window_with_enclosing_names() {
    let root = tempfile::tempdir().expect("fixture");
    fs::write(
        root.path().join("engine.rs"),
        let_heavy_rust("handle_request", 200),
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let query = ls_query(
        serde_json::json!({"path": root.path(), "matchString": "let "}),
        None,
    );
    let budget =
        crate::tools::local_search::executor::scan_query(&query, &policy, &NeverCancel, None, None)
            .expect("scan")
            .page_budget;
    let result =
        execute_local_search(&query, &policy, &security, &NeverCancel, None, None).expect("page 1");
    let rows = result.files[0].matches.as_ref().expect("rows");
    assert!(
        rows.len() * 10 >= FLAT_RESERVE_FIRST_PAGE_ROWS * 13,
        "{} rows on page 1, flat reserve held {FLAT_RESERVE_FIRST_PAGE_ROWS}",
        rows.len()
    );
    let chars = crate::tools::stream_page::json_chars(&result.files);
    assert!(chars <= budget, "page 1: {chars} chars > {budget}");
    assert!(
        rows.iter()
            .all(|row| row.enclosing.is_some() || row.enclosing_line.is_some()),
        "every row is named"
    );
}

/// Page cuts are a pure function of the collected files and their outlines:
/// page k asked for directly shows the rows the walk's page k showed, the
/// walk shows every hit row once, and every page stays within its budget,
/// past the files the cut outlines too.
#[test]
fn pages_are_identical_across_calls() {
    let root = tempfile::tempdir().expect("fixture");
    fs::write(
        root.path().join("engine.rs"),
        let_heavy_rust("handle_request", 120),
    )
    .expect("fixture");
    for n in 0..70 {
        fs::write(
            root.path().join(format!("module_{n:02}.rs")),
            let_heavy_rust(&format!("module_{n:02}_handler"), 2),
        )
        .expect("fixture");
    }
    let fields = serde_json::json!({"path": root.path(), "matchString": "let "});
    let start = serde_json::to_value(ls_query(fields.clone(), None)).expect("query");
    let (walk, bodies) = walk_search(root.path(), start, None);
    assert_eq!(walk.rows.len(), 120 * 5 + 70 * 2 * 5);
    assert!(bodies.len() > 2, "{} pages", bodies.len());
    let (policy, security) = policy_for(root.path());
    for (index, walked) in bodies.iter().enumerate() {
        let page = ls_query(
            serde_json::json!({"page": index + 1}),
            Some(&ls_query(fields.clone(), None)),
        );
        let budget = crate::tools::local_search::executor::scan_query(
            &page,
            &policy,
            &NeverCancel,
            None,
            None,
        )
        .expect("scan")
        .page_budget;
        let direct = execute_local_search(&page, &policy, &security, &NeverCancel, None, None)
            .expect("direct page");
        let direct = serde_json::to_value(&direct).expect("result");
        assert_eq!(direct["files"], walked["files"], "page {}", index + 1);
        let chars = crate::tools::stream_page::json_chars(&walked["files"]);
        assert!(chars <= budget, "page {}: {chars} > {budget}", index + 1);
    }
}

/// A page's cut prices the names of earlier pages' files from their current
/// outlines, so a stamp-preserving edit to a file that only an earlier page
/// shows restarts the walk instead of cutting other pages.
#[test]
fn an_edit_to_an_earlier_pages_file_restarts_the_walk() {
    let root = tempfile::tempdir().expect("fixture");
    let small = root.path().join("small.rs");
    fs::write(&small, let_heavy_rust("alpha", 1)).expect("fixture");
    fs::write(
        root.path().join("engine.rs"),
        let_heavy_rust("handle_request", 200),
    )
    .expect("fixture");
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path(), "matchString": "let "}),
        None,
    );
    let (first, _, page_two) = first_page(&request, &policy, &security);
    assert!(first.files.iter().any(|file| file.path == "small.rs"));
    let served = execute_local_search(&page_two, &policy, &security, &NeverCancel, None, None)
        .expect("page 2");
    assert!(served.files.iter().all(|file| file.path != "small.rs"));
    rewrite_keeping_stamp(&small, &let_heavy_rust("omega", 1));
    match execute_local_search(&page_two, &policy, &security, &NeverCancel, None, None) {
        Ok(result) => panic!("page cut from changed outlines: {}", values(&result)),
        Err(error) => assert_eq!(error.code, "staleSnapshot"),
    }
}

#[test]
fn default_path_views_page_by_cost_and_explicit_counts_still_win() {
    let root = tempfile::tempdir().expect("fixture");
    for index in 0..300 {
        fs::write(root.path().join(format!("f{index:03}.txt")), "needle\n").expect("fixture");
    }
    let (policy, security) = policy_for(root.path());
    for view in ["files", "filesWithout", "countLines", "countMatches"] {
        let term = if view == "filesWithout" {
            "absent"
        } else {
            "needle"
        };
        let query = ls_query(
            serde_json::json!({"path":root.path(),"matchString":term,"resultView":view}),
            None,
        );
        let result = execute_local_search(&query, &policy, &security, &NeverCancel, None, None)
            .expect("default");
        assert_eq!(result.files.len(), 300, "{view}");
        assert!(result.next.is_none(), "{view}");
        let explicit = ls_query(serde_json::json!({"pageSize":7}), Some(&query));
        let result = execute_local_search(&explicit, &policy, &security, &NeverCancel, None, None)
            .expect("explicit");
        assert_eq!(result.files.len(), 7, "{view}");
        assert!(result.next.is_some(), "{view}");
    }
}

#[test]
fn adaptive_path_pages_copy_their_query_and_cover_each_count_once() {
    let root = tempfile::tempdir().expect("fixture");
    for index in 0..300 {
        fs::write(
            root.path().join(format!("f{index:03}.txt")),
            "needle\nneedle\n",
        )
        .expect("fixture");
    }
    let start = serde_json::to_value(ls_query(
        serde_json::json!({"path":root.path(),"matchString":"needle","resultView":"countLines"}),
        None,
    ))
    .expect("query");
    let (walk, bodies) = walk_search(root.path(), start, Some(6_000));
    for body in &bodies {
        for file in body["files"].as_array().expect("files") {
            assert_eq!(file["matchedLineCount"], 2);
        }
        if let Some(next) = body["next"].get("nextPage") {
            assert!(next["query"]["queries"][0].get("pageSize").is_none());
        }
    }
    // Each path once, every continuation within the input contract.
    assert_eq!(walk.rows.len(), 300);
    assert!(bodies.len() > 1);
}

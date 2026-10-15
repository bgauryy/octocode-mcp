use super::*;

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
    crate::tools::test_support::checks::assert_absent(&body["hints"], "NUL byte");
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
    assert_eq!(stats.total_occurrences, Some(10_001 + 40));
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
        &verify::ValueCheck {
            security: &security,
            match_only: false,
            cancel: &NeverCancel,
        },
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
        &verify::ValueCheck {
            security: &security,
            match_only: false,
            cancel: &NeverCancel,
        },
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
        hint == "2 file(s) match in skipped paths (ignored, hidden).",
        "{hint}"
    );
    assert!(hint.len() <= 120, "{hint}");
    let body = serde_json::to_value(&result).expect("result");
    let entries = body["skippedPaths"]["entries"].as_array().expect("skips");
    for (path, cause, reason) in [
        ("logs", "ignored", ".gitignore:1 'logs/'"),
        (".notes", "hidden", "hidden .notes/"),
    ] {
        assert!(
            entries.iter().any(
                |entry| entry["path"] == skipped_source_path(root.path(), path)
                    && entry["cause"] == cause
                    && entry["reason"] == reason
            ),
            "{body}"
        );
    }
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
/// (`build/`) is not a proven absence: the disclosure names the directory and the
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
        hint == "1 file(s) match in skipped paths (default-excluded).",
        "{hint}"
    );
    let body = serde_json::to_value(&result).expect("result");
    assert_eq!(
        body["skippedPaths"]["entries"],
        serde_json::json!([{"path":skipped_source_path(root.path(),"build"),"cause":"default-excluded","reason":"build/"}]),
        "{body}"
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
    let body = serde_json::to_value(&result).expect("result");
    assert_eq!(
        body["skippedPaths"]["entries"],
        serde_json::json!([{"path":skipped_source_path(root.path(),"build"),"cause":"default-excluded"},{"path":skipped_source_path(root.path(),"repos/go"),"cause":"ignored","reason":".gitignore:1 'repos/*'"}]),
        "{body}"
    );
    assert!(
        result.hints.iter().all(|hint| hint.chars().count() <= 120),
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
    // Rows left in a.txt and a later file: both routes, each a full row.
    assert_eq!(
        body["next"]["nextPage"]["query"]["queries"][0]["page"], 2,
        "{body}"
    );
    assert_eq!(
        body["next"]["nextPage"]["query"]["queries"][0]["matchPage"], 1,
        "{body}"
    );
    assert_eq!(
        body["next"]["nextMatchPage"]["query"]["queries"][0]["matchPage"], 2,
        "{body}"
    );
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
    crate::tools::test_support::checks::assert_absent(&body["warnings"], "hints.binarySkipped");
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
    assert_eq!(all.ignore, octocode_engine::search::walk::IgnorePolicy::ALL);
    let plain = search_options(&ls_query(serde_json::json!({}), None), root, None);
    assert!(!plain.ignore.include_hidden);
    let kept = search_options(
        &ls_query(
            serde_json::json!({"includeIgnored": true, "includeHidden": false}),
            None,
        ),
        root,
        None,
    );
    assert!(kept.ignore.include_ignored && !kept.ignore.include_hidden);
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

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
    execute_local_search(
        request,
        policy,
        security,
        &NeverCancel,
        None,
        Some(6_000),
        None,
    )
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let last = execute_local_search(
        &last_request,
        &policy,
        &security,
        &NeverCancel,
        None,
        None,
        None,
    )
    .expect("last collected page");
    assert!(last.is_partial);
    assert!(last.terminal_limit);
    // No page continues past the cap; the only lead lists the scope's top
    // directories to split the search by.
    let next = last.next.as_ref().expect("split lead");
    assert_eq!(
        next.as_object()
            .map(|map| map.keys().cloned().collect::<Vec<_>>()),
        Some(vec!["narrowScope".to_owned()]),
        "{next}"
    );
    assert_eq!(next["narrowScope"]["query"]["queries"][0]["maxDepth"], 1);
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
    let error = execute_local_search(&request, &policy, &security, &cancel, None, None, None)
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
            deferred: None,
            line: 1,
            column: 0,
            byte_offset: 0,
            value: "…token = ghp_abcdefghijklmnop".into(),
            value_digest: <sha2::Sha256 as sha2::Digest>::digest(
                "…token = ghp_abcdefghijklmnop".as_bytes(),
            )
            .into(),
            count: None,
            rank: None,
            original_chars: Some(400),

            original_bytes: Some(400),
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
            deferred: None,
            line: 40,
            column: 0,
            byte_offset: 0,
            value: "…token = ghp_abcdefghijklmnop".into(),
            value_digest: <sha2::Sha256 as sha2::Digest>::digest(
                "…token = ghp_abcdefghijklmnop".as_bytes(),
            )
            .into(),
            count: None,
            rank: None,
            original_chars: Some(400),

            original_bytes: Some(400),
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
/// always wins. An empty literal search mentions the regex reading; a page
/// with hits does only for an alternation that matches more lines
/// ([`a_literal_alternation_with_hits_names_a_wider_regex_reading`]).
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
    // The regex reading is an executable retry, not only prose.
    let retry = &alternation["next"]["findSimilar"];
    let row = retry.pointer("/query/queries/0").unwrap_or(&retry["query"]);
    assert_eq!(row["regex"], "rust", "{alternation}");
    assert_eq!(row["matchString"], "unwrap_or|foo_", "{alternation}");
    let retried = run(row.clone());
    assert_eq!(lines(&retried), 2, "{retried}");
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

/// A literal page with hits whose text reads as an alternation (`a|b`)
/// warns, with the regex reading as an executable lead, only when one count
/// of that reading finds more matched lines; an explicit `regex:"literal"`
/// and an alternation with an empty side are taken as written.
#[test]
fn a_literal_alternation_with_hits_names_a_wider_regex_reading() {
    let warned = |body: &serde_json::Value| {
        body["warnings"].as_array().into_iter().flatten().any(|w| {
            w.as_str()
                .is_some_and(|w| w.contains("it matches") && w.contains("with regex:"))
        })
    };
    let wider = [("a.txt", "alpha\nbeta\nalpha|beta\n")];
    let body = search_fixture(
        &wider,
        ls_query(serde_json::json!({"matchString": "alpha|beta"}), None),
    );
    assert_eq!(body["matchedLineCount"], 1, "{body}");
    assert!(
        body["warnings"].as_array().into_iter().flatten().any(|w| w
            == "matchString ran as literal text (1 matched line); with regex:\"rust\" it matches 3."),
        "{body}"
    );
    let lead = &body["next"]["findSimilar"];
    assert_eq!(lead["query"]["queries"][0]["regex"], "rust", "{body}");
    let retried = search_fixture(&wider, ls_query(lead["query"]["queries"][0].clone(), None));
    assert_eq!(retried["matchedLineCount"], 3, "{retried}");
    for (files, fields) in [
        // The regex reading matches no more lines.
        (
            [("b.txt", "alpha|beta\nother\n")],
            serde_json::json!({"matchString": "alpha|beta"}),
        ),
        // Literal on purpose.
        (
            [("c.txt", "alpha\nalpha|beta\n")],
            serde_json::json!({"matchString": "alpha|beta", "regex": "literal"}),
        ),
        // An empty alternative is not an alternation of terms.
        (
            [("d.txt", "alpha|\nalpha\nother\n")],
            serde_json::json!({"matchString": "alpha|"}),
        ),
    ] {
        let body = search_fixture(&files, ls_query(fields, None));
        assert!(!warned(&body), "{body}");
        assert!(body["next"].get("findSimilar").is_none(), "{body}");
    }
}

/// An empty literal search offers the regex reading under the engine the
/// text compiles in (lookaround: pcre2), across lines when it matches a line
/// break, and every such lead runs and finds the line.
#[test]
fn a_literal_miss_leads_to_the_regex_reading_that_runs() {
    let files = [(
        "p.txt",
        "price 100 dollars\nprice 200 euros\nstart\nmiddle\n",
    )];
    let run = |fields: serde_json::Value| search_fixture(&files, ls_query(fields, None));
    for (text, engine, across_lines) in [
        ("price (?=\\d+ euros)", "pcre2", false),
        ("(?<=price )200", "pcre2", false),
        ("start\\nmiddle", "rust", true),
    ] {
        let missed = run(serde_json::json!({"matchString": text}));
        assert_eq!(
            missed["matchedLineCount"].as_u64().unwrap_or(0),
            0,
            "{missed}"
        );
        let retry = &missed["next"]["findSimilar"];
        let row = retry.pointer("/query/queries/0").unwrap_or(&retry["query"]);
        assert_eq!(row["regex"], engine, "{text}: {missed}");
        assert_eq!(row["multiline"] == "on", across_lines, "{text}: {missed}");
        let retried = run(row.clone());
        assert_eq!(retried["matchedLineCount"], 1, "{text}: {retried}");
    }
}

/// An empty page the `fileHas`/`fileLacks` terms caused says so, and its
/// `broadenSearch` lead (the same search without them) finds the matches.
#[test]
fn an_empty_page_the_file_terms_caused_names_them() {
    let files = [("a.txt", "needle\n"), ("b.txt", "needle\nother\n")];
    let run = |fields: serde_json::Value| search_fixture(&files, ls_query(fields, None));
    for filter in [
        serde_json::json!({"fileHas": ["absent"]}),
        serde_json::json!({"fileLacks": ["needle"]}),
    ] {
        let mut fields = serde_json::json!({"matchString": "needle"});
        fields
            .as_object_mut()
            .unwrap()
            .extend(filter.as_object().unwrap().clone());
        let empty = run(fields);
        assert_eq!(
            empty["matchedLineCount"].as_u64().unwrap_or(0),
            0,
            "{empty}"
        );
        assert!(
            empty["warnings"]
                .to_string()
                .contains("2 file(s) matched matchString but fileHas/fileLacks removed them"),
            "{empty}"
        );
        let lead = &empty["next"]["broadenSearch"];
        let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
        assert!(
            row.get("fileHas").is_none() && row.get("fileLacks").is_none(),
            "{row}"
        );
        assert_eq!(run(row.clone())["matchedLineCount"], 2, "{row}");
    }
    let kept = run(serde_json::json!({"matchString": "needle", "fileHas": ["other"]}));
    assert_eq!(kept["matchedLineCount"], 1, "{kept}");
    assert!(kept["next"].get("broadenSearch").is_none(), "{kept}");
}

/// A case-sensitive miss (smart case on uppercase text, or `sensitive`)
/// whose text matches in another case says so, and its `ignoreCase` lead
/// finds it.
#[test]
fn a_case_only_miss_leads_to_ignore_case() {
    let files = [("a.ts", "const structuredContent = 1;\n")];
    let run = |fields: serde_json::Value| search_fixture(&files, ls_query(fields, None));
    for fields in [
        serde_json::json!({"matchString": "STRUCTUREDCONTENT"}),
        serde_json::json!({"matchString": "StructuredContent", "caseMode": "sensitive"}),
    ] {
        let empty = run(fields);
        assert_eq!(
            empty["matchedLineCount"].as_u64().unwrap_or(0),
            0,
            "{empty}"
        );
        assert!(
            empty["hints"]
                .to_string()
                .contains("matches ignoring case in 1 file(s)"),
            "{empty}"
        );
        let lead = &empty["next"]["ignoreCase"];
        let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
        assert_eq!(row["caseMode"], "insensitive", "{empty}");
        assert_eq!(run(row.clone())["matchedLineCount"], 1, "{row}");
    }
}

/// A `maxDepth` cut is disclosed once with the same search at every depth;
/// an empty directory at the limit hides nothing and is not counted.
#[test]
fn a_max_depth_cut_is_disclosed_with_a_deeper_lead() {
    let files = [
        ("top.txt", "needle\n"),
        ("a/b/deep.txt", "needle\n"),
        ("a/c/x.txt", "other\n"),
    ];
    let run = |fields: serde_json::Value| search_fixture(&files, ls_query(fields, None));
    let cut = run(serde_json::json!({"matchString": "needle", "maxDepth": 1}));
    assert_eq!(cut["matchedLineCount"], 1, "{cut}");
    assert!(
        cut["warnings"]
            .to_string()
            .contains("1 dir(s) at maxDepth were not entered"),
        "{cut}"
    );
    let lead = &cut["next"]["expandDepth"];
    let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
    assert!(row.get("maxDepth").is_none(), "{row}");
    assert_eq!(run(row.clone())["matchedLineCount"], 2, "{row}");
    let whole = run(serde_json::json!({"matchString": "needle", "maxDepth": 3}));
    assert!(whole["next"].get("expandDepth").is_none(), "{whole}");
}

/// An empty `filesWithout` row (every searched file matches) names skipped
/// paths only for files there that lack a match, never the matching files
/// it already searched.
#[test]
fn an_empty_files_without_row_probes_for_files_without_a_match() {
    let root = tempfile::tempdir().expect("fixture directory");
    fs::create_dir(root.path().join(".git")).expect("repository marker");
    // Every file the default walk skips matches too (the hidden `.gitignore`).
    fs::write(root.path().join(".gitignore"), "# the\nskip/\n").expect("gitignore");
    fs::write(root.path().join("a.txt"), "the\n").expect("a");
    let (policy, security) = policy_for(root.path());
    let path = root.path().to_string_lossy().into_owned();
    let run = |fields: serde_json::Value| {
        let request = ls_query(fields, None);
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
            .expect("search")
    };
    let row = serde_json::json!({"path": path, "matchString": "the", "resultView": "filesWithout"});
    let plain = run(row.clone());
    assert!(plain.files.is_empty());
    assert!(
        !plain.hints.join(" | ").contains("skipped paths"),
        "{:?}",
        plain.hints
    );
    assert!(
        plain
            .next
            .as_ref()
            .is_none_or(|next| next.get("includeSkipped").is_none())
    );
    fs::create_dir(root.path().join("skip")).expect("ignored dir");
    fs::write(root.path().join("skip/b.txt"), "zzz\n").expect("b");
    let found = run(row);
    let hints = found.hints.join(" | ");
    assert!(
        hints.contains("1 file(s) lack a match in skipped paths (ignored)"),
        "{hints}"
    );
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None, None)
        .expect("retry");
    assert_eq!(found.files.len(), 2, "{found:?}");
    // Nothing to find elsewhere: no probe hint and no lead.
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "absent-everywhere"}),
        None,
    );
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None, None)
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
    // In a git work tree a default-excluded name is pruned where git
    // ignores it.
    fs::write(root.path().join(".gitignore"), "repos/*\nbuild/\n").expect("gitignore");
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
    let result = crate::tools::empty_walk::with_probe_budget(std::time::Duration::ZERO, || {
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
            .expect("search")
    });
    assert!(result.files.is_empty());
    let hints = result.hints.join(" | ");
    let body = serde_json::to_value(&result).expect("result");
    assert_eq!(
        body["skippedPaths"]["entries"],
        serde_json::json!([{"path":skipped_source_path(root.path(),"repos/go"),"cause":"ignored","reason":".gitignore:1 'repos/*'"}]),
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
    let found = execute_local_search(&retried, &policy, &security, &NeverCancel, None, None, None)
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
    let result = crate::tools::empty_walk::with_probe_budget(std::time::Duration::ZERO, || {
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
            .expect("search")
    });
    assert!(result.next.is_none(), "{:?}", result.next);
    // A hidden path is named too, and the lead lifts it.
    fs::create_dir(plain.path().join(".hid")).expect("hidden dir");
    fs::write(plain.path().join(".hid/a.txt"), "absent\n").expect("hidden");
    let result = crate::tools::empty_walk::with_probe_budget(std::time::Duration::ZERO, || {
        execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
            .expect("search")
    });
    let hints = result.hints.join(" | ");
    assert!(
        hints.contains("1 hidden path(s) were not searched"),
        "{hints}"
    );
    let next = result.next.as_ref().expect("lead");
    let lead = &next["includeSkipped"]["query"]["queries"][0];
    assert_eq!(lead["includeHidden"], true, "{next}");
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
    let page1 = execute_local_search(&first, &policy, &security, &NeverCancel, None, None, None)
        .expect("page 1");
    assert_eq!(page1.stats.binary_skipped, Some(1), "{:?}", page1.warnings);
    assert!(
        page1
            .next
            .as_ref()
            .is_some_and(|next| next.get("binarySkipped").is_some())
    );
    let next = page1.next.as_ref().expect("next")["nextPage"]["query"]["queries"][0].clone();
    let second: LocalSearchQuery = serde_json::from_value(next).expect("page 2 query");
    let page2 = execute_local_search(&second, &policy, &security, &NeverCancel, None, None, None)
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
    let result = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
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
        let start = serde_json::to_value(ls_query(
            serde_json::json!({"path": path.to_string_lossy().into_owned(), "matchString": "function ", "matchPageSize": 100}),
            None,
        ))
        .expect("query");
        // Every continuation replays with the workspace-relative path.
        let mut calls = 0;
        let walk = crate::tools::test_support::checks::walk(
            "localSearch",
            serde_json::json!({"queries": [start]}),
            |call| {
                let mut row = call["queries"][0].clone();
                if calls > 0 {
                    row["path"] = serde_json::json!(relative);
                }
                calls += 1;
                let request: LocalSearchQuery =
                    serde_json::from_value(row.clone()).expect("continuation query");
                let result = execute_local_search(
                    &request,
                    &policy,
                    &security,
                    &NeverCancel,
                    None,
                    Some(20_000),
                    None,
                )
                .unwrap_or_else(|error| panic!("{row} of {relative}: {error:?}"));
                let body = serde_json::to_value(&result).expect("result");
                crate::tools::test_support::checks::Page {
                    output: crate::tools::test_support::published(
                        crate::tools::id::ToolId::LocalSearch,
                        &row,
                        &body,
                    ),
                    rows: row_ids(&body),
                }
            },
        );
        assert!(walk.queries.len() > 1, "{relative}: expected several pages");
        let expected = if relative == "." { 401 } else { 400 };
        assert_eq!(walk.rows.len(), expected, "{relative}");
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
    let error = execute_local_search(&request, &policy, &security, &NeverCancel, None, None, None)
        .expect_err("missing path");
    assert_eq!(error.code, "pathNotFound");
    let next = error.next.expect("viewTree lead");
    assert_eq!(next["viewTree"]["tool"], "structureSearch", "{next}");
    assert_eq!(
        next["viewTree"]["query"]["queries"][0]["path"], "src",
        "{next}"
    );
}

/// A scope-miss row leads to the scope's listing without the globs that
/// matched nothing, so it shows the names that exist.
#[test]
fn scope_miss_leads_to_the_files_listing_without_its_globs() {
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
    assert!(listing.get("include").is_none(), "{body}");
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
    settle();
    let (policy, security) = policy_for(root.path());
    let search = |request: &LocalSearchQuery| {
        execute_local_search(
            request,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(6_000),
            None,
        )
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

/// A matched file swapped for a symlink out of the root, under its stored
/// modification time and digest, drops the stored scan (its directory and
/// its own stamp changed). The page that would show it rescans, and the
/// rescan's walk, which follows no link, no longer finds the file: the
/// snapshot restarts.
#[cfg(unix)]
#[test]
fn a_swapped_matched_file_drops_the_stored_scan_and_restarts_its_page() {
    let root = tempfile::tempdir().expect("fixture directory");
    let outside = tempfile::tempdir().expect("outside directory");
    paged_fixture(root.path());
    settle();
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
        None,
    )
    .expect("page 1")
    .source_snapshot
    .expect("snapshot");
    let page = |page: u32| {
        ls_query(
            serde_json::json!({"snapshot": snapshot, "page": page}),
            Some(&request),
        )
    };
    assert!(super::manifest::get(&snapshot, &policy.identity()).is_some());
    let on_three = page_paths(&page(3), &policy, &security);
    swap_for_outside_copy(&root.path().join(&on_three[0]), outside.path());
    assert!(
        super::manifest::get(&snapshot, &policy.identity()).is_none(),
        "the swap drops the stored scan"
    );
    let failed = execute_local_search(
        &page(3),
        &policy,
        &security,
        &NeverCancel,
        None,
        Some(6_000),
        None,
    )
    .expect_err("page 3 would show the swapped file");
    assert_eq!(failed.code, "staleSnapshot", "{}", failed.message);
}

/// A stored page checks the read policy of every file it shows, even for a
/// swap that lands after the page took its stored scan (when the stored
/// walk's proof still held): a shown file swapped for a symlink out of the
/// root, under its stored stamp and digest, fails the page. A swapped file
/// the page neither reads nor shows leaves the page as it was; the page
/// that shows it fails.
#[cfg(unix)]
#[test]
fn a_stored_page_checks_the_read_policy_of_the_files_it_shows() {
    // One settled fixture per swap: a swap drops its own stored scan.
    let roots = [(); 3].map(|()| {
        let root = tempfile::tempdir().expect("fixture directory");
        paged_fixture(root.path());
        root
    });
    settle();
    let stored = |root: &std::path::Path| {
        let (policy, security) = policy_for(root);
        let request = ls_query(
            serde_json::json!({"path": root.to_string_lossy().into_owned(), "matchString": "needle"}),
            None,
        );
        let snapshot = execute_local_search(
            &request,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(6_000),
            None,
        )
        .expect("page 1")
        .source_snapshot
        .expect("snapshot");
        assert!(super::manifest::get(&snapshot, &policy.identity()).is_some());
        let page = move |page: u32| {
            ls_query(
                serde_json::json!({"snapshot": snapshot, "page": page}),
                Some(&request),
            )
        };
        (policy, security, page)
    };
    let swapped_page = |root: &std::path::Path, file: &str, shown: u32| {
        let (policy, security, page) = stored(root);
        let outside = tempfile::tempdir().expect("outside directory");
        stored_page_after(&page(shown), &policy, &security, Some(6_000), || {
            swap_for_outside_copy(&root.join(file), outside.path());
        })
    };
    let (policy, security, page) = stored(roots[0].path());
    let second = serde_json::to_string(
        &execute_local_search(
            &page(2),
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(6_000),
            None,
        )
        .expect("page 2"),
    )
    .expect("json");
    let on_two = page_paths(&page(2), &policy, &security);
    let on_three = page_paths(&page(3), &policy, &security);
    let later = on_three
        .iter()
        .find(|path| !on_two.contains(path))
        .expect("a page-3 file");
    let unchanged =
        swapped_page(roots[0].path(), later, 2).expect("page 2 neither reads nor shows it");
    assert_eq!(serde_json::to_string(&unchanged).expect("json"), second);
    for (root, file, shown) in [(&roots[1], later, 3), (&roots[2], &on_two[0], 2)] {
        let denied =
            swapped_page(root.path(), file, shown).expect_err("the page shows the swapped file");
        assert_eq!(denied.code, "symlinkEscape", "{}", denied.message);
        assert!(
            denied.message.contains("denied by the active path policy"),
            "{}",
            denied.message
        );
    }
}

/// A key file the stored redaction scanned, rewritten in place under its
/// stored size and time after the page took the stored scan, restarts a
/// page that does not even show it: the replay reads the key file again and
/// binds it to the stored digest, as a fresh redaction does.
#[test]
fn a_key_file_rewritten_under_its_stamp_restarts_a_replayed_page() {
    let root = tempfile::tempdir().expect("fixture directory");
    paged_fixture(root.path());
    settle();
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
        None,
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
    assert!(
        super::manifest::get(&snapshot, &policy.identity())
            .is_some_and(|stored| stored.redaction.is_some())
    );
    let page = stored_page_after(&page_two, &policy, &security, Some(6_000), || {
        rewrite_keeping_stamp(&key, &text.replace("export const pem", "export const pex"));
    });
    assert_eq!(page.expect_err("changed key file").code, "staleSnapshot");
}

/// The same rewrite made before a continuation takes the stored scan
/// restarts it too. On Unix it moved the key file's change time, so the
/// walk's proof drops the stored scan before any replay.
#[test]
fn a_key_file_rewritten_before_a_continuation_restarts_it() {
    let root = tempfile::tempdir().expect("fixture directory");
    paged_fixture(root.path());
    settle();
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path": root.path().to_string_lossy().into_owned(), "matchString": "needle"}),
        None,
    );
    let run = |query: &LocalSearchQuery| {
        execute_local_search(
            query,
            &policy,
            &security,
            &NeverCancel,
            None,
            Some(6_000),
            None,
        )
    };
    let snapshot = run(&request)
        .expect("page 1")
        .source_snapshot
        .expect("snapshot");
    let page_two = ls_query(
        serde_json::json!({"snapshot": snapshot, "page": 2}),
        Some(&request),
    );
    assert!(super::manifest::get(&snapshot, &policy.identity()).is_some());
    let key = root.path().join("zkey.ts");
    let text = fs::read_to_string(&key).expect("key fixture");
    rewrite_keeping_stamp(&key, &text.replace("export const pem", "export const pex"));
    if cfg!(unix) {
        assert!(super::manifest::get(&snapshot, &policy.identity()).is_none());
    }
    assert_eq!(
        run(&page_two).expect_err("changed key file").code,
        "staleSnapshot"
    );
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

/// Each walk flag lifts its own cause, as in every local walk:
/// `includeIgnored` walks `.gitignore`d paths, `includeHidden` dot entries.
#[test]
fn each_walk_flag_lifts_only_its_own_cause() {
    use super::executor::search_options;
    use octocode_engine::search::walk::IgnorePolicy;
    let root = std::path::Path::new(".");
    let policy =
        |fields: serde_json::Value| search_options(&ls_query(fields, None), root, None).ignore;
    assert_eq!(policy(serde_json::json!({})), IgnorePolicy::default());
    assert_eq!(
        policy(serde_json::json!({"includeIgnored": true})),
        IgnorePolicy {
            include_ignored: true,
            include_hidden: false
        }
    );
    assert_eq!(
        policy(serde_json::json!({"includeHidden": true})),
        IgnorePolicy {
            include_ignored: false,
            include_hidden: true
        }
    );
    assert_eq!(
        policy(serde_json::json!({"includeIgnored": true, "includeHidden": true})),
        IgnorePolicy::ALL
    );
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

/// The spelling probe walks what the query (and its lead) walks: a variant
/// only in a default-excluded file is no reason to offer a lead that finds
/// nothing.
#[test]
fn spelling_variants_in_default_excluded_files_are_not_counted() {
    let files = [("dist.min.js", "parse_config()\n"), ("src/a.py", "x = 1\n")];
    let body = search_fixture(
        &files,
        ls_query(serde_json::json!({"matchString":"parseConfig"}), None),
    );
    assert!(body["next"].get("findSimilar").is_none(), "{body}");
    assert!(
        !body["hints"].to_string().contains("other spellings"),
        "{body}"
    );
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

/// An identifier that matches nothing because of a typo (a swap, a
/// missing, extra or wrong char) leads to the spellings one edit away that
/// exist, named in the hint and searched as whole words by the lead: a
/// longer name holding the typo's text is not one of them.
#[test]
fn a_typo_leads_to_the_spelling_one_edit_away() {
    let files = [(
        "src/run.rs",
        "pub fn execute_local_search() {}\nfn fingerprint() {}\nlet xexecute_local_search_all = 1;\n",
    )];
    for (typo, found) in [
        ("exeucte_local_search", "execute_local_search"),
        ("fingerprnt", "fingerprint"),
        ("fingerprints", "fingerprint"),
        ("fingerpront", "fingerprint"),
    ] {
        let body = search_fixture(
            &files,
            ls_query(serde_json::json!({"matchString": typo}), None),
        );
        let hints = body["hints"].to_string();
        assert!(
            hints.contains(&format!("near spellings match in 1 file(s): {found}.")),
            "{typo}: {body}"
        );
        let lead = &body["next"]["findSimilar"];
        let row = lead.pointer("/query/queries/0").unwrap_or(&lead["query"]);
        assert_eq!(row["matchString"], found, "{row}");
        assert_eq!(row["wholeWord"], true, "{row}");
        let run = search_fixture(&files, ls_query(row.clone(), None));
        assert_eq!(run["files"][0]["path"], "src/run.rs", "{run}");
        assert_eq!(
            run["files"][0]["matches"].as_array().map(Vec::len),
            Some(1),
            "{run}"
        );
    }
    // Two edits away, or too short to probe: no lead.
    for miss in ["exeuctelocal_search", "fngrprint", "fnx"] {
        let none = search_fixture(
            &files,
            ls_query(serde_json::json!({"matchString": miss}), None),
        );
        assert!(none["next"].get("findSimilar").is_none(), "{miss}: {none}");
    }
}

/// One-edit spellings: deletions, swaps, substitutions and insertions,
/// sorted and distinct, never the term, always identifiers.
#[test]
fn one_edit_spellings_cover_each_edit_once() {
    let spellings = super::leads::one_edit_spellings("abcd").expect("identifier");
    for expected in ["acd", "bacd", "abdd", "abxcd", "abcde", "_abcd"] {
        assert!(
            spellings.iter().any(|s| s == expected),
            "{expected}: {spellings:?}"
        );
    }
    assert!(!spellings.iter().any(|s| s == "abcd"));
    assert!(
        !spellings
            .iter()
            .any(|s| s.starts_with(|c: char| c.is_ascii_digit()))
    );
    assert!(spellings.windows(2).all(|pair| pair[0] < pair[1]));
    // Uppercase is substituted only into a term that has some.
    assert!(!spellings.iter().any(|s| s == "aBcd"));
    let camel = super::leads::one_edit_spellings("abCd").expect("identifier");
    assert!(camel.iter().any(|s| s == "aBCd"), "{camel:?}");
    for none in ["abc", "a.bcd", "9abc", "ab-cd"] {
        assert!(super::leads::one_edit_spellings(none).is_none(), "{none}");
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

/// A localFetch line page counts bytes, and so does the long-line test: a
/// clipped hit on a line of 6000 three-byte characters (18 KB, under the
/// page in characters) is read by a byte window at the hit, and a long
/// ASCII line under the page in bytes by its line.
#[test]
fn a_line_past_the_byte_page_is_read_at_the_hit_whatever_its_characters() {
    let read_of = |line: String| {
        let body = search_fixture(
            &[("a.txt", &format!("{line} needle\n"))],
            ls_query(serde_json::json!({"matchString": "needle"}), None),
        );
        let read = &body["next"]["read"];
        read.pointer("/query/queries/0")
            .unwrap_or(&read["query"])
            .clone()
    };
    let wide = read_of("中".repeat(6_000));
    assert_eq!(wide["unit"], "bytes", "{wide}");
    assert_eq!(wide["offset"], 18_001, "{wide}");
    let ascii = read_of("x".repeat(10_000));
    assert!(ascii.get("unit").is_none(), "{ascii}");
}

#[test]
fn deferred_hit_before_a_large_binary_tail_remains_readable_and_binds_the_tail() {
    use std::io::{Seek, SeekFrom, Write};
    use std::sync::atomic::{AtomicUsize, Ordering};

    let root = tempfile::tempdir().expect("fixture");
    let path = root.path().join("binary-tail.txt");
    let mut source = fs::File::create(&path).expect("create");
    source
        .write_all(b"needle before binary\n\0")
        .expect("prefix");
    let chunk = [b'x'; 64 * 1024];
    for _ in 0..(65 * 16) {
        source.write_all(&chunk).expect("newline-free tail");
    }
    drop(source);
    let (policy, security) = policy_for(root.path());
    let request = ls_query(
        serde_json::json!({"path":path,"matchString":"needle"}),
        None,
    );
    let scan = super::super::executor::scan_query(&request, &policy, &NeverCancel, Some(1), None)
        .expect("engine accepts the binary prefix");
    assert_eq!(scan.parsed.files.len(), 1);
    assert_eq!(scan.parsed.files[0].matches.len(), 1);
    assert!(scan.parsed.files[0].matches[0].deferred.is_some());
    assert!(
        scan.parsed
            .stats
            .cap_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("binaryQuit"))
    );
    let original = scan.parsed.files[0].clone();
    let expected = |_: &std::path::Path| None;
    let scope = super::super::verify::PageScope {
        query: &request,
        paths: &policy,
        output_root: root.path(),
        expected_digest: &expected,
        security: &security,
        cancel: &NeverCancel,
        walk_threads: Some(1),
    };
    let mut reconstructed = original.clone();
    super::super::verify::materialize(&scope, &mut reconstructed, 0..1)
        .expect("unchanged binary tail does not prevent reconstructing the earlier hit");
    assert_eq!(reconstructed.matches[0].value, "needle before binary");

    let result = super::super::executor::page_of(
        &request,
        &policy,
        &security,
        &NeverCancel,
        Some(1),
        scan,
        None,
    )
    .expect("unchanged binary tail is hashed without buffering it as a line");
    let mut owned_scan =
        super::super::executor::scan_query(&request, &policy, &NeverCancel, Some(1), None)
            .expect("baseline scan plan");
    let mut options = owned_scan.search_options.clone();
    options.defer_values = false;
    owned_scan.parsed =
        super::super::executor::scan(&request, &policy, options, &policy.identity(), &NeverCancel)
            .expect("owned engine baseline")
            .parsed;
    assert_eq!(owned_scan.parsed.files[0].matches[0].deferred, None);
    assert_eq!(
        owned_scan.parsed.files[0].matches[0].value,
        "needle before binary"
    );
    owned_scan.reusable = None;
    let owned = super::super::executor::page_of(
        &request,
        &policy,
        &security,
        &NeverCancel,
        Some(1),
        owned_scan,
        None,
    )
    .expect("owned page preserves the existing conservative secret guard");
    assert_eq!(
        result, owned,
        "deferred reconstruction preserves the complete owned page, including redaction"
    );

    struct CancelDuringDrain(AtomicUsize);
    impl crate::tools::cancel::CancellationCheck for CancelDuringDrain {
        fn check(&self) -> Result<(), String> {
            if self.0.fetch_add(1, Ordering::Relaxed) >= 32 {
                Err("tail-drain-cancel".into())
            } else {
                Ok(())
            }
        }
    }
    let cancel = CancelDuringDrain(AtomicUsize::new(0));
    let expected = |_: &std::path::Path| None;
    let scope = super::super::verify::PageScope {
        query: &request,
        paths: &policy,
        output_root: root.path(),
        expected_digest: &expected,
        security: &security,
        cancel: &cancel,
        walk_threads: Some(1),
    };
    let error = super::super::verify::materialize(&scope, &mut original.clone(), 0..1)
        .expect_err("digest-only drain remains cancellable");
    assert!(format!("{error:?}").contains("tail-drain-cancel"));

    let mut source = fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .expect("open tail");
    source.seek(SeekFrom::End(-1)).expect("last byte");
    source.write_all(b"z").expect("same-size tail edit");
    drop(source);
    let scope = super::super::verify::PageScope {
        query: &request,
        paths: &policy,
        output_root: root.path(),
        expected_digest: &expected,
        security: &security,
        cancel: &NeverCancel,
        walk_threads: Some(1),
    };
    assert!(
        super::super::verify::materialize(&scope, &mut original.clone(), 0..1).is_err(),
        "even unshown tail bytes remain bound by the source digest"
    );
}

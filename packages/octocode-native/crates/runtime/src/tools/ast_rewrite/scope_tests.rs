use super::*;

fn scan_control_fixture(directory: &str) -> (Fixture, PathPolicy, ContentSecurity, PathBuf) {
    let dir = Fixture::new();
    fs::create_dir(dir.0.join(".git")).expect("git directory");
    dir.write(".gitignore", "gen/\n");
    let source = dir.write(
        &format!("selected/{directory}/main.ts"),
        "oldCall(1);\noldCall(2);\n",
    );
    dir.write(
        &format!("selected/{directory}/excluded.ts"),
        "oldCall(3);\n",
    );
    dir.write("outside.ts", "oldCall(4);\n");
    let policy = crate::tools::test_support::workspace_policy(&dir.0);
    (dir, policy, ContentSecurity::new(), source)
}

fn scan_control_replays(directory: &str, flag: &str, enabled: bool) {
    let (dir, policy, security, source) = scan_control_fixture(directory);
    let mut row = query(&dir.0);
    row[flag] = json!(enabled);
    row["include"] = json!(["selected"]);
    row["exclude"] = json!(["**/excluded.ts"]);
    row["extras"] = json!(["hints", "diagnostics"]);
    let first = rewrite_row(
        row.clone(),
        &policy,
        &security,
        &NeverCancel,
        &Default::default(),
    );
    assert_eq!(first["matchCount"], 2, "{first}");
    let before = fs::read(&source).expect("source");
    let second_row = first["next"]["nextPage"]["query"]["queries"][0].clone();
    assert_eq!(second_row[flag], row[flag], "{second_row}");
    let second = rewrite_row(
        second_row,
        &policy,
        &security,
        &NeverCancel,
        &Default::default(),
    );
    assert_eq!(second["snapshot"], first["snapshot"], "{second}");
    assert_ne!(first["matches"][0]["id"], second["matches"][0]["id"]);
    assert_eq!(fs::read(&source).expect("unchanged preview"), before);

    let mut apply = second["next"]["apply"]["query"]["queries"][0].clone();
    assert_eq!(apply[flag], row[flag], "{apply}");
    apply["selectedMatchIds"] = json!([first["matches"][0]["id"]]);
    apply["postconditions"] = json!([{"kind":"remainingMatches","equals":1}]);
    let applied = rewrite_row(
        apply.clone(),
        &policy,
        &security,
        &NeverCancel,
        &apply_options(),
    );
    assert_eq!(applied["transaction"]["committed"], true, "{applied}");
    assert_eq!(
        fs::read_to_string(&source).expect("selected edit"),
        "newCall(1);\noldCall(2);\n"
    );
    assert_eq!(
        fs::read_to_string(dir.0.join("outside.ts")).expect("outside"),
        "oldCall(4);\n"
    );

    let verify = &applied["next"]["verify"]["query"]["queries"][0];
    assert_eq!(verify[flag], row[flag], "{verify}");
    assert_eq!(verify["include"], row["include"], "{verify}");
    assert_eq!(verify["exclude"], row["exclude"], "{verify}");
    let search = serde_json::from_value(verify.clone()).expect("typed verification query");
    let remaining =
        crate::tools::ast_search::execute_ast(&search, &policy, &security, &NeverCancel, None)
            .expect("verification executes");
    assert_eq!(remaining["matchCount"], 1, "{remaining}");

    let stale = rewrite_row(apply, &policy, &security, &NeverCancel, &apply_options());
    assert_eq!(stale["errorCode"], "staleSnapshot", "{stale}");
    let restart = &stale["next"]["restart"]["query"]["queries"][0];
    assert_eq!(restart[flag], row[flag], "{restart}");
    assert!(restart.get("selectedMatchIds").is_none(), "{restart}");
    assert!(restart.get("postconditions").is_none(), "{restart}");
    let restarted = rewrite_row(
        restart.clone(),
        &policy,
        &security,
        &NeverCancel,
        &Default::default(),
    );
    assert_eq!(restarted["matchCount"], 1, "{restarted}");
}

#[test]
fn copied_pages_apply_verify_and_restart_preserve_hidden_scope() {
    scan_control_replays(".cfg", "includeHidden", true);
}

#[test]
fn copied_pages_apply_verify_and_restart_preserve_ignored_scope() {
    scan_control_replays("gen", "includeIgnored", true);
}

#[test]
fn copied_pages_apply_verify_and_restart_preserve_default_excluded_scope() {
    scan_control_replays("dist", "defaultExcludes", false);
}

#[test]
fn changed_scan_flags_do_not_reuse_another_previews_memo() {
    for (directory, flag) in [(".cfg", "includeHidden"), ("gen", "includeIgnored")] {
        let (dir, policy, security, _) = scan_control_fixture(directory);
        let mut row = query(&dir.0);
        row[flag] = json!(true);
        let first = rewrite_row(row, &policy, &security, &NeverCancel, &Default::default());
        assert_eq!(first["matchCount"], 4, "{first}");
        let mut changed = first["next"]["nextPage"]["query"]["queries"][0].clone();
        changed[flag] = json!(false);
        let refused = rewrite_row(
            changed,
            &policy,
            &security,
            &NeverCancel,
            &Default::default(),
        );
        assert_eq!(refused["errorCode"], "staleSnapshot", "{flag}: {refused}");
    }
}

#[test]
fn rule_replay_keeps_sections_and_inferred_language() {
    let (dir, policy, security) = fixture();
    let row = json!({
        "path":dir.0,
        "rule":"rule:\n  pattern: oldCall($A)\nconstraints:\n  A:\n    regex: ^[12]$\ntransform:\n  B:\n    substring:\n      source: $A\n",
        "fix":"newCall($B)","pageSize":1,
        "utils":{"calls":{"kind":"call_expression"}},
        "extras":["hints","details"]
    });
    let first = rewrite_row(row, &policy, &security, &NeverCancel, &Default::default());
    assert_eq!(first["matchCount"], 2, "{first}");
    let next = first["next"]["nextPage"]["query"]["queries"][0].clone();
    assert_eq!(next["language"], "typescript", "{next}");
    assert_eq!(next["constraints"]["A"]["regex"], "^[12]$", "{next}");
    assert_eq!(
        next["transform"]["B"]["substring"]["source"], "$A",
        "{next}"
    );
    assert_eq!(next["utils"]["calls"]["kind"], "call_expression", "{next}");
    assert_eq!(next["extras"], json!(["hints", "details"]), "{next}");
    let second = rewrite_row(next, &policy, &security, &NeverCancel, &Default::default());
    assert_eq!(second["snapshot"], first["snapshot"], "{second}");
    let applied = rewrite_row(
        second["next"]["apply"]["query"]["queries"][0].clone(),
        &policy,
        &security,
        &NeverCancel,
        &apply_options(),
    );
    assert_eq!(applied["transaction"]["committed"], true, "{applied}");
    assert_eq!(
        fs::read_to_string(dir.0.join("a.ts")).expect("rewritten rule matches"),
        "const first = newCall(1);\nconst second = newCall(2);\n"
    );
}

#[test]
fn match_limit_recovery_narrows_the_scope() {
    let (dir, policy, security) = fixture();
    let mut row = query(&dir.0);
    row["maxMatches"] = json!(1);
    let refused = rewrite_row(row, &policy, &security, &NeverCancel, &Default::default());
    assert_eq!(refused["errorCode"], "matchLimit", "{refused}");
    let hint = refused["hints"][0].as_str().expect("limit recovery hint");
    assert!(
        hint.contains("maxMatches") && hint.contains("Narrow"),
        "{hint}"
    );
    assert!(!hint.contains("Broaden"), "{hint}");
}

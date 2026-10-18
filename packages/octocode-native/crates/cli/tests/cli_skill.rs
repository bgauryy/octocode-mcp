//! Standalone skill commands run without any launchers on PATH.

use crate::support::Workspace;
use serde_json::Value;
use std::{fs, path::Path, process::Output};

const SKILL: &str = "octocode-workflows";
const ARCHITECT: &str = "octocode-architect";
fn run(workspace: &Workspace, args: &[&str]) -> Output {
    workspace
        .cli()
        .env("PATH", workspace.home.join("no-executables"))
        .env("USERPROFILE", &workspace.home)
        .arg("skill")
        .args(args)
        .arg("--json")
        .output()
        .expect("native skill")
}
fn report(output: &Output, code: i32) -> Value {
    assert_eq!(
        output.status.code(),
        Some(code),
        "stdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("JSON report")
}
fn local_skill(directory: &Path, name: &str, version: &str) {
    fs::create_dir_all(directory.join("references")).unwrap();
    fs::write(
        directory.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: Local fixture\n---\n{version}\n"),
    )
    .unwrap();
    fs::write(directory.join("references/guide.md"), version).unwrap();
}
#[test]
fn embedded_catalog_and_workflows_need_no_node_or_installed_skills() {
    let workspace = Workspace::new();
    let catalog = report(&run(&workspace, &["list"]), 0);
    assert!(catalog["count"].as_u64().unwrap() > 10);
    assert_eq!(catalog["installedCount"], 0);
    let info = report(&run(&workspace, &["info", SKILL]), 0);
    assert_eq!(info["skill"]["name"], SKILL);
    let instructions = info["skill"]["skillMd"].as_str().unwrap();
    for reference in [
        "runtime-surgery.md",
        "single-actor-traversal.md",
        "ast-lsp-workflows.md",
        "verification.md",
    ] {
        assert!(instructions.contains(reference));
    }
    let architect = report(&run(&workspace, &["info", ARCHITECT]), 0);
    assert_eq!(architect["skill"]["name"], ARCHITECT);
    let architect_instructions = architect["skill"]["skillMd"].as_str().unwrap();
    for reference in [
        "../octocode-workflows/references/runtime-surgery.md",
        "../octocode-workflows/references/single-actor-traversal.md",
        "../octocode-workflows/references/ast-lsp-workflows.md",
        "../octocode-workflows/references/verification.md",
    ] {
        assert!(architect_instructions.contains(reference));
    }
    assert!(!workspace.home.join("skills").exists());
}
#[test]
fn install_check_repair_and_remove_use_the_embedded_bundle() {
    let workspace = Workspace::new();
    let installed = report(
        &run(
            &workspace,
            &[
                "install",
                SKILL,
                "--platform",
                "codex",
                "--global",
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    assert_eq!(installed["summary"]["installed"], 1);
    assert_eq!(installed["summary"]["copied"], 1);
    let canonical = workspace.home.join("skills").join(SKILL);
    let destination = workspace.home.join(".agents/skills").join(SKILL);
    for reference in [
        "runtime-surgery.md",
        "single-actor-traversal.md",
        "ast-lsp-workflows.md",
        "verification.md",
    ] {
        assert_eq!(
            fs::read(canonical.join("references").join(reference)).unwrap(),
            fs::read(destination.join("references").join(reference)).unwrap()
        );
    }
    let repeated = report(
        &run(
            &workspace,
            &[
                "install",
                SKILL,
                "--platform",
                "codex",
                "--global",
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    assert_eq!(repeated["summary"]["unchanged"], 2);
    fs::write(
        destination.join("references/single-actor-traversal.md"),
        "old",
    )
    .unwrap();
    let stale = report(
        &run(
            &workspace,
            &["check", SKILL, "--platform", "codex", "--no-env"],
        ),
        1,
    );
    assert_eq!(stale["skills"][0]["installStatus"], "stale");
    report(
        &run(
            &workspace,
            &["check", SKILL, "--platform", "codex", "--no-env", "--fix"],
        ),
        0,
    );
    assert_eq!(
        fs::read(canonical.join("references/single-actor-traversal.md")).unwrap(),
        fs::read(destination.join("references/single-actor-traversal.md")).unwrap()
    );
    report(&run(&workspace, &["remove", SKILL]), 0);
    assert!(!canonical.exists());
    assert!(!destination.exists());
}
#[test]
fn installed_architect_delegates_moved_procedures_to_workflows() {
    let workspace = Workspace::new();
    report(
        &run(
            &workspace,
            &[
                "install",
                ARCHITECT,
                "--platform",
                "codex",
                "--global",
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    for root in [
        workspace.home.join("skills").join(ARCHITECT),
        workspace.home.join(".agents/skills").join(ARCHITECT),
    ] {
        for reference in [
            "runtime-surgery.md",
            "solo-traversal.md",
            "ast-lsp-workflows.md",
            "verification.md",
        ] {
            assert!(!root.join("references").join(reference).exists());
        }
    }
}
#[test]
fn dry_run_and_invalid_requests_do_not_install_anything() {
    let workspace = Workspace::new();
    report(
        &run(
            &workspace,
            &[
                "install",
                "--all",
                "--platform",
                "all",
                "--global",
                "--dry-run",
            ],
        ),
        0,
    );
    assert!(!workspace.home.join("skills").exists());
    assert!(!workspace.home.join(".agents").exists());
    for args in [
        vec!["install", SKILL, "missing-skill"],
        vec!["install", SKILL, "--platform", "claude"],
        vec!["install", SKILL, "--global"],
        vec!["install", SKILL, "--platform", "not-a-platform", "--global"],
        vec!["install", SKILL, "--all"],
        vec!["remove", "../escape", "--force"],
        vec!["list", "--force"],
    ] {
        report(&run(&workspace, &args), 2);
        assert!(!workspace.home.join("skills").exists(), "{args:?}");
    }
}
#[test]
fn local_add_upgrades_managed_copies_and_preserves_edited_copies() {
    let workspace = Workspace::new();
    let local = workspace.workspace.join("custom");
    local_skill(&local, "custom", "v1");
    let args = [
        "install",
        "--add",
        local.to_str().unwrap(),
        "--platform",
        "claude,cursor",
        "--global",
        "--mode",
        "copy",
    ];
    report(&run(&workspace, &args), 0);
    let edited = workspace
        .home
        .join(".cursor/skills/custom/references/guide.md");
    fs::write(&edited, "user edit").unwrap();
    local_skill(&local, "custom", "v2");
    let mut upgrade = args.to_vec();
    upgrade.push("--upgrade");
    let result = report(&run(&workspace, &upgrade), 1);
    assert_eq!(result["summary"]["conflicts"], 1);
    assert_eq!(fs::read_to_string(&edited).unwrap(), "user edit");
    assert_eq!(
        fs::read_to_string(
            workspace
                .home
                .join(".claude/skills/custom/references/guide.md")
        )
        .unwrap(),
        "v2"
    );
    let failed_remove = report(&run(&workspace, &["remove", "custom"]), 1);
    assert_eq!(failed_remove["summary"]["failed"], 1);
    assert!(edited.exists());
    report(&run(&workspace, &["remove", "custom", "--force"]), 0);
    assert!(!edited.exists());
}
#[test]
fn project_install_and_custom_path_keep_their_scopes() {
    let workspace = Workspace::new();
    report(
        &run(
            &workspace,
            &[
                "install",
                SKILL,
                "--platform",
                "claude",
                "--project-dir",
                workspace.workspace.to_str().unwrap(),
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    assert!(
        workspace
            .workspace
            .join(".claude/skills")
            .join(SKILL)
            .join("SKILL.md")
            .is_file()
    );
    assert!(!workspace.home.join(".claude").exists());
    let destination = workspace.workspace.join("custom-skills");
    report(
        &run(
            &workspace,
            &["install", SKILL, "--path", destination.to_str().unwrap()],
        ),
        0,
    );
    assert!(destination.join(SKILL).join("SKILL.md").is_file());
}
#[test]
fn every_platform_uses_its_declared_destination() {
    let workspace = Workspace::new();
    let result = report(
        &run(
            &workspace,
            &[
                "install",
                SKILL,
                "--platform",
                "all",
                "--global",
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    assert_eq!(result["summary"]["copied"], 7);
    for relative in [
        ".pi/agent/skills",
        ".cursor/skills",
        ".claude/skills",
        ".agents/skills",
        ".config/opencode/skills",
        ".copilot/skills",
        ".gemini/skills",
    ] {
        assert!(
            workspace
                .home
                .join(relative)
                .join(SKILL)
                .join("SKILL.md")
                .is_file(),
            "{relative}"
        );
    }
}
#[cfg(unix)]
#[test]
fn links_target_durable_home_and_external_development_links_are_not_repaired() {
    let workspace = Workspace::new();
    report(
        &run(
            &workspace,
            &["install", SKILL, "--platform", "codex", "--global"],
        ),
        0,
    );
    let destination = workspace.home.join(".agents/skills").join(SKILL);
    assert_eq!(
        fs::read_link(&destination).unwrap(),
        workspace.home.join("skills").join(SKILL)
    );
    fs::remove_file(&destination).unwrap();
    let checkout = workspace.workspace.join("checkout");
    local_skill(&checkout, SKILL, "development");
    std::os::unix::fs::symlink(&checkout, &destination).unwrap();
    report(
        &run(
            &workspace,
            &["check", SKILL, "--platform", "codex", "--fix", "--no-env"],
        ),
        0,
    );
    assert_eq!(fs::read_link(&destination).unwrap(), checkout);
    assert_eq!(
        fs::read_to_string(checkout.join("references/guide.md")).unwrap(),
        "development"
    );
    report(&run(&workspace, &["remove", SKILL]), 0);
    assert!(checkout.join("SKILL.md").exists());
}
#[test]
fn environment_readiness_uses_native_config_without_disclosing_values() {
    let workspace = Workspace::new();
    let output = workspace
        .cli()
        .env("PATH", workspace.home.join("empty"))
        .env("USERPROFILE", &workspace.home)
        .env("GH_TOKEN", "skill-test-secret")
        .args(["skill", "check", "octocode-research", "--json"])
        .output()
        .unwrap();
    let value = report(&output, 0);
    assert_eq!(value["skills"][0]["env"]["readiness"], "ready");
    assert!(!String::from_utf8_lossy(&output.stdout).contains("skill-test-secret"));
}

#[test]
fn remove_dry_run_keeps_installed_files_and_platform_removal_keeps_the_store() {
    let workspace = Workspace::new();
    report(
        &run(
            &workspace,
            &[
                "install",
                SKILL,
                "--platform",
                "claude",
                "--global",
                "--mode",
                "copy",
            ],
        ),
        0,
    );
    let canonical = workspace.home.join("skills").join(SKILL);
    let copy = workspace.home.join(".claude/skills").join(SKILL);
    report(&run(&workspace, &["remove", SKILL, "--dry-run"]), 0);
    assert!(canonical.join("SKILL.md").is_file());
    assert!(copy.join("SKILL.md").is_file());
    report(
        &run(&workspace, &["remove", SKILL, "--platform", "claude"]),
        0,
    );
    assert!(canonical.join("SKILL.md").is_file());
    assert!(!copy.exists());
}

#[cfg(unix)]
#[test]
fn local_source_cannot_install_inside_itself_through_a_directory_alias() {
    let workspace = Workspace::new();
    let local = workspace.workspace.join("custom");
    local_skill(&local, "custom", "v1");
    let alias = workspace.workspace.join("alias");
    std::os::unix::fs::symlink(&local, &alias).unwrap();
    for dry_run in [true, false] {
        let mut args = vec![
            "install",
            "--add",
            local.to_str().unwrap(),
            "--path",
            alias.to_str().unwrap(),
        ];
        if dry_run {
            args.push("--dry-run");
        }
        let result = report(&run(&workspace, &args), 1);
        assert!(
            result["skills"][0]["canonicalError"]
                .as_str()
                .unwrap()
                .contains("inside its source")
        );
        assert!(!local.join("custom").exists());
    }
}

#[cfg(unix)]
#[test]
fn add_rejects_a_symlinked_manifest_even_when_the_manifest_is_the_argument() {
    let workspace = Workspace::new();
    let local = workspace.workspace.join("custom");
    local_skill(&local, "custom", "v1");
    fs::rename(local.join("SKILL.md"), local.join("actual.md")).unwrap();
    std::os::unix::fs::symlink("actual.md", local.join("SKILL.md")).unwrap();
    report(
        &run(
            &workspace,
            &["install", "--add", local.join("SKILL.md").to_str().unwrap()],
        ),
        2,
    );
    assert!(!workspace.home.join("skills").exists());
}

#[test]
fn managed_links_are_idempotent_and_broken_targets_are_repaired() {
    let workspace = Workspace::new();
    let args = ["install", SKILL, "--platform", "codex", "--global"];
    report(&run(&workspace, &args), 0);
    let canonical = workspace.home.join("skills").join(SKILL);
    let destination = workspace.home.join(".agents/skills").join(SKILL);
    #[cfg(windows)]
    assert!(junction::exists(&destination).unwrap());
    let repeat = report(&run(&workspace, &args), 0);
    assert_eq!(repeat["summary"]["unchanged"], 2);
    fs::remove_dir_all(&canonical).unwrap();
    report(
        &run(
            &workspace,
            &["check", SKILL, "--platform", "codex", "--no-env", "--fix"],
        ),
        0,
    );
    assert_eq!(
        destination.canonicalize().unwrap(),
        canonical.canonicalize().unwrap()
    );
    report(
        &run(&workspace, &["remove", SKILL, "--platform", "codex"]),
        0,
    );
    assert!(!destination.exists());
    assert!(canonical.join("SKILL.md").is_file());
}

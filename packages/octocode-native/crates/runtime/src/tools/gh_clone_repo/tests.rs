use super::*;
use crate::contracts::tool_types::{GhCloneRepoQueryPathArrayItem, GhCloneRepoQueryRef};
use crate::policy::path::PathPolicyConfig;
use crate::tools::cancel::NeverCancel;
use crate::tools::gh_shared::test_support as gh_shared_support;
use crate::tools::test_support;
use octocode_github::CredentialSource;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Barrier, Mutex};
use std::time::{Duration, Instant};

fn api_github_endpoint() -> GitHubEndpoint {
    GitHubEndpoint::new("https://api.github.com/".parse().expect("static URL"))
        .expect("static endpoint")
}

struct RewriteRunner {
    system: SystemGit,
    from: OsString,
    to: OsString,
    seen: Mutex<Vec<String>>,
}

impl RewriteRunner {
    fn new(from: &str, to: &str) -> Self {
        Self {
            system: SystemGit::default(),
            from: from.into(),
            to: to.into(),
            seen: Mutex::new(vec![]),
        }
    }
}

impl GitRunner for RewriteRunner {
    fn run(
        &self,
        request: &GitRunRequest<'_>,
        control: &GitRunControl<'_>,
    ) -> Result<GitOutput, CloneError> {
        self.seen
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(format!("{request:?}"));
        let args = request
            .args
            .iter()
            .map(|argument| {
                if argument == &self.from {
                    self.to.clone()
                } else {
                    argument.clone()
                }
            })
            .collect();
        let request = request.with_args(args);
        // Hermetic guard: the rewrite must leave no network remote for git.
        for argument in &request.args {
            let argument = argument.to_string_lossy();
            assert!(
                !["https://", "http://", "ssh://", "git@"]
                    .iter()
                    .any(|scheme| argument.starts_with(scheme)),
                "git would reach the network: {argument}"
            );
        }
        self.system.run(&request, control)
    }
}

/// A runner for paths that must refuse before git runs: invoking it fails
/// the test instead of reaching the network.
struct UnreachableGit;

impl GitRunner for UnreachableGit {
    fn run(
        &self,
        request: &GitRunRequest<'_>,
        _control: &GitRunControl<'_>,
    ) -> Result<GitOutput, CloneError> {
        panic!("git must not run here: {request:?}")
    }
}

struct Fixture {
    _temp: test_support::Fixture,
    work: PathBuf,
    bare_url: String,
    first_commit: String,
}

impl Fixture {
    fn new() -> Self {
        let temp = test_support::Fixture::new();
        let work = temp.0.join("work");
        let bare = temp.0.join("origin.git");
        git(
            &temp.0,
            &[
                "init",
                "--initial-branch=main",
                work.to_str().expect("utf8"),
            ],
        );
        git(&work, &["config", "user.name", "Octocode Test"]);
        git(&work, &["config", "user.email", "test@example.invalid"]);
        fs::create_dir_all(work.join("src/nested")).expect("src");
        fs::create_dir_all(work.join("other")).expect("other");
        fs::write(work.join("README.md"), "fixture\n").expect("readme");
        fs::write(work.join("src/lib.rs"), "pub fn one() {}\n").expect("source");
        fs::write(work.join("src/nested/data.txt"), "data\n").expect("data");
        fs::write(work.join("other/skip.txt"), "skip\n").expect("skip");
        git(&work, &["add", "."]);
        git(&work, &["commit", "-m", "first"]);
        let first_commit = git_output(&work, &["rev-parse", "HEAD"]).trim().to_owned();
        git(&work, &["tag", "v1"]);
        git(
            &temp.0,
            &[
                "clone",
                "--bare",
                work.to_str().expect("utf8"),
                bare.to_str().expect("utf8"),
            ],
        );
        git(
            &work,
            &["remote", "add", "origin", bare.to_str().expect("utf8")],
        );
        let bare_url = url::Url::from_file_path(&bare)
            .expect("file URL")
            .to_string();
        Self {
            _temp: temp,
            work,
            bare_url,
            first_commit,
        }
    }

    fn push_second(&self) -> String {
        fs::write(self.work.join("README.md"), "fixture two\n").expect("update");
        git(&self.work, &["add", "README.md"]);
        git(&self.work, &["commit", "-m", "second"]);
        git(&self.work, &["push", "origin", "main"]);
        git_output(&self.work, &["rev-parse", "HEAD"])
            .trim()
            .to_owned()
    }
}

fn git(directory: &Path, args: &[&str]) {
    let output = fixture_git(directory, args);
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn git_output(directory: &Path, args: &[&str]) -> String {
    let output = fixture_git(directory, args);
    assert!(output.status.success(), "git {args:?}");
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn fixture_git(directory: &Path, args: &[&str]) -> std::process::Output {
    let mut command = Command::new("git");
    command
        .current_dir(directory)
        .env_clear()
        .env("HOME", directory)
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env(
            "GIT_CONFIG_SYSTEM",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .arg("-c")
        .arg(format!(
            "core.hooksPath={}",
            if cfg!(windows) { "NUL" } else { "/dev/null" }
        ))
        .args(args);
    if let Some(path) = std::env::var_os("PATH") {
        command.env("PATH", path);
    }
    command.output().expect("run fixture git")
}

fn setup<'a>(
    runner: &'a dyn GitRunner,
    config: &'a CloneConfig,
    endpoint: &'a GitHubEndpoint,
    policy: &'a PathPolicy,
    cancellation: &'a dyn CancellationCheck,
    credential: Option<&'a ResolvedCredential>,
) -> CloneContext<'a> {
    CloneContext {
        config,
        endpoint,
        credential,
        resolved_default_branch: Some("main"),
        cancellation,
        deadline: Instant::now() + Duration::from_secs(30),
        path_policy: policy,
        git: runner,
    }
}

/// A runner that clones the fixture's local bare repository in place of
/// its GitHub URL.
fn fixture_runner(fixture: &Fixture) -> RewriteRunner {
    RewriteRunner::new(
        "https://github.com/fixture-owner/fixture-repo.git",
        &fixture.bare_url,
    )
}

/// Cache metadata for the fixture's shallow `main` checkout.
fn fixture_main_meta() -> cache::CacheMeta {
    cache::CacheMeta::new(
        &cache::Identity {
            owner: "fixture-owner",
            repo: "fixture-repo",
            branch: "main",
            sparse_key: None,
            depth: 1,
        },
        &"1".repeat(40),
        Duration::from_secs(60),
    )
}

/// A temp root and the existing clone-cache `home` inside it.
fn home_root() -> (test_support::Fixture, PathBuf) {
    let root = test_support::Fixture::new();
    let cache_home = root.0.join("home");
    fs::create_dir_all(&cache_home).expect("home");
    (root, cache_home)
}

fn query() -> GhCloneRepoQuery {
    parse_query(serde_json::json!({
        "owner": "fixture-owner", "repo": "fixture-repo", "ref": "main",
        "mainGoal": "test", "reasoning": "clone fixture"
    }))
}

/// One sparse path, as a single-string `path`.
fn one(path: &str) -> GhCloneRepoQueryPath {
    GhCloneRepoQueryPath::String(path.parse().expect("valid sparse fixture path"))
}

fn many(paths: &[&str]) -> GhCloneRepoQueryPath {
    GhCloneRepoQueryPath::Array(
        paths
            .iter()
            .map(|path| {
                (*path)
                    .parse::<GhCloneRepoQueryPathArrayItem>()
                    .expect("valid sparse fixture path")
            })
            .collect(),
    )
}

fn reference(value: &str) -> GhCloneRepoQueryRef {
    value.parse().expect("valid fixture branch or commit")
}

fn rejects_sparse_path(path: &str) -> bool {
    let mut row = serde_json::to_value(query()).expect("fixture query JSON");
    row["path"] = serde_json::json!(path);
    serde_json::from_value::<GhCloneRepoQuery>(row).is_err()
}

fn parse_query(value: serde_json::Value) -> GhCloneRepoQuery {
    serde_json::from_value(value).expect("valid ghCloneRepo query")
}

#[test]
fn missing_repository_names_the_repository_with_a_recovery_hint() {
    let error = repository_not_found(&query());
    assert_eq!(error.code, "notFound");
    assert_eq!(
        error.message,
        "Repository not found: fixture-owner/fixture-repo"
    );
    assert_eq!(error.hints.len(), 1);
    // The hint fits the 120-char guidance cap whole (the message names
    // the repository), so the response stage never cuts it mid-sentence.
    let long = repository_not_found(&parse_query(serde_json::json!({
        "owner": "o".repeat(39), "repo": "r".repeat(100),
        "mainGoal": "test", "reasoning": "long names"
    })));
    for hint in [&error.hints[0], &long.hints[0]] {
        assert!(hint.chars().count() <= 120, "{hint}");
        assert!(hint.ends_with('.'), "{hint}");
        assert!(hint.contains("token"), "{hint}");
    }
    // Beside the hint, a runnable search for the name finds who holds it.
    let find = &error.next.as_ref().expect("search lead")["findRepository"];
    assert_eq!(find["tool"], "ghSearchRepo", "{find}");
    assert_eq!(
        find["query"]["queries"][0]["keywords"],
        serde_json::json!(["fixture-repo"]),
        "{find}"
    );
    // Errors without recovery serialize exactly as before.
    let plain = CloneError::new("gitFailed", "failed");
    assert_eq!(
        serde_json::to_value(plain).expect("serialize"),
        serde_json::json!({"code": "gitFailed", "message": "failed"})
    );
}

/// A clone row continues into the local tools on its checkout (the
/// sparse subtree when one was requested), and a cache hit names its age.
#[test]
fn clone_rows_continue_into_local_tools_and_name_the_cache_age() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let row = |result: &CloneResult| {
        let data = serde_json::to_value(result).expect("serialize");
        // The runtime gives every continuation its row's brief.
        let mut briefed = data.clone();
        for call in briefed["next"]
            .as_object_mut()
            .into_iter()
            .flat_map(|next| next.values_mut())
        {
            call["query"]["queries"][0]["mainGoal"] = serde_json::json!("test");
            call["query"]["queries"][0]["reasoning"] = serde_json::json!("clone fixture");
        }
        crate::contracts::validate_output(
            "ghCloneRepo",
            &serde_json::json!({"results":[{"index":0,"data":briefed}]}),
        )
        .expect("clone row satisfies the output contract");
        data
    };
    let fresh = row(&execute_clone(&query(), &context).expect("fresh clone"));
    let explore = &fresh["next"]["exploreClone"];
    assert_eq!(explore["tool"], "structureSearch", "{fresh}");
    assert_eq!(
        explore["query"]["queries"][0]["path"],
        fresh["location"]["localPath"]
    );
    // A fresh clone states its age like a hit, and drops what the caller
    // already knows (owner/repo) or what is constant (source, true flags).
    assert!(fresh["location"]["clonedAt"].is_string(), "{fresh}");
    assert!(fresh["location"]["expiresAt"].is_string(), "{fresh}");
    for absent in ["owner", "repo"] {
        assert!(fresh.get(absent).is_none(), "{fresh}");
    }
    for absent in ["source", "verified", "complete"] {
        assert!(fresh["location"].get(absent).is_none(), "{fresh}");
    }

    let cached = row(&execute_clone(&query(), &context).expect("cached clone"));
    assert_eq!(cached["location"]["cached"], true);
    let cloned_at = cached["location"]["clonedAt"].as_str().expect("clonedAt");
    let expires_at = cached["location"]["expiresAt"].as_str().expect("expiresAt");
    assert!(
        cloned_at.ends_with('Z') && expires_at > cloned_at,
        "{cached}"
    );

    let sparse = row(&execute_clone(
        &GhCloneRepoQuery {
            path: Some(one("src")),
            ..query()
        },
        &context,
    )
    .expect("sparse clone"));
    let local = sparse["location"]["localPath"].as_str().expect("localPath");
    let path = sparse["next"]["exploreClone"]["query"]["queries"][0]["path"]
        .as_str()
        .expect("path");
    assert_eq!(Path::new(path), Path::new(local).join("src"), "{sparse}");
    assert_eq!(sparse["next"]["exploreClone"]["tool"], "structureSearch");

    // A single checked-out file is read, not listed as a directory.
    let file = row(&execute_clone(
        &GhCloneRepoQuery {
            path: Some(one("src/lib.rs")),
            ..query()
        },
        &context,
    )
    .expect("sparse file clone"));
    let local = file["location"]["localPath"].as_str().expect("localPath");
    let explore = &file["next"]["exploreClone"];
    assert_eq!(explore["tool"], "localFetch", "{file}");
    let path = explore["query"]["queries"][0]["path"]
        .as_str()
        .expect("path");
    assert_eq!(
        Path::new(path),
        Path::new(local).join("src/lib.rs"),
        "{file}"
    );
    assert!(Path::new(path).is_file(), "{file}");
}

#[test]
fn creates_a_new_configured_home_before_authorizing_the_clone_target() {
    let fixture = Fixture::new();
    let root = test_support::Fixture::new();
    let cache_home = root.0.join("new").join("home");
    let policy = PathPolicy::new(PathPolicyConfig {
        workspace_root: Some(fixture.work.clone()),
        additional_roots: vec![cache_home.clone()],
        ..Default::default()
    })
    .expect("policy");
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);

    assert!(!cache_home.exists());
    let result = execute_clone(&query(), &context).expect("new home clone");
    assert!(cache_home.is_dir());
    assert_eq!(result.location.commit_sha, fixture.first_commit);
    assert!(Path::new(&result.location.local_path).starts_with(cache_home));
}

/// The runtime allows only the checkout trees under the Octocode home
/// (`<home>/tmp/clone`), never the home itself (credentials, logs): a clone
/// must authorize its clones root, not the whole home.
#[test]
fn clones_with_only_the_clones_root_allowed_under_an_existing_home() {
    let fixture = Fixture::new();
    let (_root, cache_home) = home_root();
    let policy = PathPolicy::new(PathPolicyConfig {
        workspace_root: Some(fixture.work.clone()),
        additional_roots: vec![cache::clones_root(&cache_home)],
        ..Default::default()
    })
    .expect("policy");
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);

    let result = execute_clone(&query(), &context).expect("clone under the clones root");
    assert_eq!(result.location.commit_sha, fixture.first_commit);
    assert!(
        Path::new(&result.location.local_path).starts_with(cache::clones_root(&cache_home)),
        "{}",
        result.location.local_path
    );
}

#[test]
fn denied_cache_home_is_not_created() {
    let root = test_support::Fixture::new();
    let outside = test_support::Fixture::new();
    let cache_home = outside.0.join("home");
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = UnreachableGit;
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);

    let error = execute_clone(&query(), &context).expect_err("deny cache home");
    // The policy's own flat code, as the local tools report it.
    assert_eq!(error.code, "outsideAllowedRoots");
    assert!(!cache_home.exists(), "denied home must not be created");
}

#[test]
fn policy_denials_use_the_codes_the_local_tools_share() {
    use crate::policy::PolicyErrorCode;
    for (code, expected) in [
        (
            PolicyErrorCode::IgnoredPath,
            crate::policy::PATH_POLICY_DENIED,
        ),
        (PolicyErrorCode::NotFound, crate::policy::PATH_NOT_FOUND),
        (PolicyErrorCode::InputTooLarge, "fileTooLarge"),
        (PolicyErrorCode::OutsideAllowedRoots, "outsideAllowedRoots"),
        (PolicyErrorCode::SymlinkLoop, "pathValidationFailed"),
    ] {
        let error = policy_denied(PolicyError::new(code, "denied"));
        assert_eq!(error.code, expected, "{code:?}");
        assert_eq!(error.message, "denied");
    }
}

#[test]
fn withheld_cache_home_is_denied_as_path_policy() {
    let root = test_support::Fixture::new();
    let cache_home = root.0.join(".ssh").join("home");
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = UnreachableGit;
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);

    let error = execute_clone(&query(), &context).expect_err("withheld cache home");
    assert_eq!(error.code, crate::policy::PATH_POLICY_DENIED, "{error:?}");
    assert!(!cache_home.exists(), "a withheld home must not be created");
}

#[test]
fn clones_caches_refreshes_sparse_tag_and_commit_without_token_argv() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let derived = "https://github.com/fixture-owner/fixture-repo.git";
    let runner = RewriteRunner::new(derived, &fixture.bare_url);
    let mut config = CloneConfig::persistent(&cache_home);
    config.cache_ttl = Duration::from_secs(60);
    let credential = ResolvedCredential::new("fixture-token", CredentialSource::Override);
    let context = setup(
        &runner,
        &config,
        &endpoint,
        &policy,
        &NeverCancel,
        Some(&credential),
    );

    let fresh = execute_clone(&query(), &context).expect("fresh clone");
    assert!(!fresh.location.cached);
    assert!(fresh.location.verified);
    assert_eq!(fresh.location.commit_sha, fixture.first_commit);
    assert_eq!(
        fs::read_to_string(Path::new(&fresh.location.local_path).join("README.md"))
            .expect("read clone"),
        "fixture\n"
    );
    assert!(fresh.bytes > 0);
    let cached = execute_clone(&query(), &context).expect("cached clone");
    assert!(cached.location.cached);
    // A cache hit reports the verification state persisted at clone time, not a
    // bare false: this checkout was verified when created, so the warm read
    // surfaces verified:true rather than a false negative.
    assert!(cached.location.verified);
    assert_eq!(cached.location.local_path, fresh.location.local_path);
    // Editing the cached working tree must not replace the user's bytes.
    let readme = Path::new(&cached.location.local_path).join("README.md");
    fs::write(&readme, "tampered\n").expect("tamper cached checkout");
    let error = execute_clone(&query(), &context).expect_err("preserve dirty checkout");
    assert_eq!(error.code, "checkoutDirty");
    assert_eq!(
        fs::read_to_string(&readme).expect("read preserved checkout"),
        "tampered\n"
    );
    fs::write(&readme, "fixture\n").expect("restore owned fixture");
    let defaulted = execute_clone(
        &GhCloneRepoQuery {
            ref_: None,
            ..query()
        },
        &context,
    )
    .expect("provider-resolved default branch");
    assert_eq!(defaulted.location.resolved_ref, "main");
    assert!(defaulted.location.cached);

    let second = fixture.push_second();
    let refreshed = execute_clone(
        &GhCloneRepoQuery {
            force_refresh: Some(true),
            ..query()
        },
        &context,
    )
    .expect("refresh");
    assert_eq!(refreshed.location.commit_sha, second);
    assert_eq!(
        fs::read_to_string(Path::new(&refreshed.location.local_path).join("README.md"))
            .expect("read refreshed clone"),
        "fixture two\n"
    );

    let sparse = execute_clone(
        &GhCloneRepoQuery {
            path: Some(one("src")),
            ..query()
        },
        &context,
    )
    .expect("sparse clone");
    assert_eq!(sparse.location.kind, "tree");
    assert!(
        Path::new(&sparse.location.local_path)
            .join("src/lib.rs")
            .is_file()
    );
    assert!(
        !Path::new(&sparse.location.local_path)
            .join("other/skip.txt")
            .exists()
    );

    for branch in ["v1".to_owned(), fixture.first_commit.clone()] {
        let pinned = execute_clone(
            &GhCloneRepoQuery {
                ref_: Some(reference(&branch)),
                ..query()
            },
            &context,
        )
        .expect("pinned clone");
        assert_eq!(pinned.location.commit_sha, fixture.first_commit);
    }
    let pinned_sparse = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference(&fixture.first_commit)),
            path: Some(one("src")),
            ..query()
        },
        &context,
    )
    .expect("pinned sparse clone");
    assert_eq!(pinned_sparse.location.commit_sha, fixture.first_commit);
    assert!(
        Path::new(&pinned_sparse.location.local_path)
            .join("src/lib.rs")
            .is_file()
    );
    assert!(
        !Path::new(&pinned_sparse.location.local_path)
            .join("other/skip.txt")
            .exists()
    );

    let seen = runner
        .seen
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    test_support::checks::assert_absent(&serde_json::json!(*seen), "fixture-token");
    assert!(seen.iter().any(|value| value.contains("[REDACTED]")));
}

#[test]
fn dirty_checkout_preserves_tracked_untracked_ignored_and_user_metadata_names() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let fresh = execute_clone(&query(), &context).expect("fresh clone");
    let checkout = Path::new(&fresh.location.local_path);
    for (name, ignored) in [
        ("README.md", false),
        ("untracked.txt", false),
        ("ignored.txt", true),
        (".octocode-user-notes", false),
        ("nested/.octocode-clone-meta.json", false),
        ("notes\n中.txt", false),
    ] {
        let file = checkout.join(name);
        fs::create_dir_all(file.parent().expect("file parent")).expect("marker parent");
        if ignored {
            fs::write(
                checkout.join(".git/info/exclude"),
                format!("ignored.txt\n/{}\n", cache::META_FILE),
            )
            .expect("ignore fixture file");
        }
        fs::write(&file, "user evidence\n").expect("edit owned fixture");
        for force_refresh in [false, true] {
            let request = GhCloneRepoQuery {
                force_refresh: Some(force_refresh),
                ..query()
            };
            // Ignored bytes do not change the verified revision, but replacing
            // its checkout must still preserve them.
            if ignored && !force_refresh {
                assert!(
                    execute_clone(&request, &context)
                        .expect("ignored reuse")
                        .location
                        .cached
                );
            } else {
                let error = execute_clone(&request, &context).expect_err("preserve user file");
                assert_eq!(
                    error.code, "checkoutDirty",
                    "{name}, refresh={force_refresh}"
                );
                assert!(!error.hints.is_empty(), "actionable recovery");
            }
            assert_eq!(
                fs::read_to_string(&file).expect("preserved file"),
                "user evidence\n"
            );
            assert_eq!(
                git_output(checkout, &["rev-parse", "HEAD"]).trim(),
                fixture.first_commit
            );
        }
        if name == "README.md" {
            fs::write(&file, "fixture\n").expect("restore owned tracked file");
        } else {
            fs::remove_file(&file).expect("remove owned marker");
        }
    }
}

#[test]
fn refresh_rechecks_user_changes_written_while_fetching() {
    struct LateWriteRunner {
        inner: RewriteRunner,
        target: Mutex<Option<PathBuf>>,
    }
    impl GitRunner for LateWriteRunner {
        fn run(
            &self,
            request: &GitRunRequest<'_>,
            control: &GitRunControl<'_>,
        ) -> Result<GitOutput, CloneError> {
            let output = self.inner.run(request, control)?;
            if request.label == "read checkout HEAD"
                && let Some(target) = self.target.lock().expect("target lock").take()
            {
                fs::write(
                    target.join("during-fetch.txt"),
                    "concurrent user evidence\n",
                )
                .expect("write owned late marker");
            }
            Ok(output)
        }
    }
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = LateWriteRunner {
        inner: fixture_runner(&fixture),
        target: Mutex::new(None),
    };
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let fresh = execute_clone(&query(), &context).expect("fresh clone");
    let checkout = PathBuf::from(fresh.location.local_path);
    *runner.target.lock().expect("target lock") = Some(checkout.clone());
    let error = execute_clone(
        &GhCloneRepoQuery {
            force_refresh: Some(true),
            ..query()
        },
        &context,
    )
    .expect_err("preserve late write");
    assert_eq!(error.code, "checkoutDirty");
    assert_eq!(
        fs::read_to_string(checkout.join("during-fetch.txt")).expect("late marker"),
        "concurrent user evidence\n"
    );
    assert_eq!(
        git_output(&checkout, &["rev-parse", "HEAD"]).trim(),
        fixture.first_commit
    );
}

#[test]
fn clone_eviction_preserves_dirty_expired_and_over_budget_checkouts() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let mut config = CloneConfig::persistent(&cache_home);
    config.max_clone_count = 1;
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let fresh = execute_clone(&query(), &context).expect("fresh clone");
    let checkout = PathBuf::from(fresh.location.local_path);
    fs::write(checkout.join(".git/info/exclude"), "ignored-evidence.txt\n").expect("exclude");
    let evidence = checkout.join("ignored-evidence.txt");
    fs::write(&evidence, "preserve through eviction\n").expect("owned evidence");
    execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference("v1")),
            ..query()
        },
        &context,
    )
    .expect("budget clone");
    assert_eq!(
        fs::read_to_string(&evidence).expect("budget preserved"),
        "preserve through eviction\n"
    );
    let meta_path = checkout.join(cache::META_FILE);
    let mut meta: serde_json::Value =
        serde_json::from_slice(&fs::read(&meta_path).expect("metadata")).expect("parse meta");
    meta["expiresAt"] = "1970-01-01T00:00:00.000Z".into();
    fs::write(
        &meta_path,
        serde_json::to_vec(&meta).expect("serialize meta"),
    )
    .expect("expire");
    execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference(&fixture.first_commit)),
            ..query()
        },
        &context,
    )
    .expect("expiry cleanup clone");
    assert_eq!(
        fs::read_to_string(&evidence).expect("expired preserved"),
        "preserve through eviction\n"
    );
}

#[test]
fn metadata_write_preserves_repository_pid_temp_filename() {
    let stage = test_support::Fixture::new();
    let evidence = stage
        .0
        .join(format!("{}.tmp-{}", cache::META_FILE, std::process::id()));
    fs::write(&evidence, "repository temp-name evidence\n").expect("source evidence");
    let meta = fixture_main_meta();
    cache::write_meta(&stage.0, &meta).expect("new stage metadata");
    assert_eq!(
        fs::read_to_string(&evidence).expect("source filename still exists"),
        "repository temp-name evidence\n"
    );
    let written: cache::CacheMeta =
        serde_json::from_slice(&fs::read(stage.0.join(cache::META_FILE)).expect("metadata"))
            .expect("complete metadata");
    assert_eq!(written.commit_sha, meta.commit_sha);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(stage.0.join(cache::META_FILE))
                .expect("metadata permissions")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn metadata_write_rejects_existing_source_without_overwrite() {
    let stage = test_support::Fixture::new();
    let destination = stage.0.join(cache::META_FILE);
    fs::write(&destination, "source arrived after inspection\n").expect("source evidence");
    let meta = fixture_main_meta();
    let error = cache::write_meta(&stage.0, &meta).expect_err("exclusive metadata creation");
    assert_eq!(error.code, "cacheUnavailable");
    assert!(error.message.contains(cache::META_FILE));
    assert!(
        error
            .hints
            .iter()
            .any(|hint| hint.contains("ghGetFileContent"))
    );
    assert_eq!(
        fs::read_to_string(destination).expect("preserved source"),
        "source arrived after inspection\n"
    );
}

#[test]
fn repository_metadata_filename_conflict_never_replaces_an_existing_checkout() {
    struct CollisionRunner {
        inner: RewriteRunner,
        collide: AtomicBool,
        stages: Mutex<Vec<PathBuf>>,
    }
    impl GitRunner for CollisionRunner {
        fn run(
            &self,
            request: &GitRunRequest<'_>,
            control: &GitRunControl<'_>,
        ) -> Result<GitOutput, CloneError> {
            let output = self.inner.run(request, control)?;
            if request.label == "full clone" && self.collide.load(Ordering::SeqCst) {
                let stage = PathBuf::from(request.args.last().expect("clone stage argument"));
                fs::write(
                    stage.join(cache::META_FILE),
                    "reserved repository evidence\n",
                )
                .expect("write owned source fixture");
                self.stages.lock().expect("stage lock").push(stage);
            }
            Ok(output)
        }
    }
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = CollisionRunner {
        inner: fixture_runner(&fixture),
        collide: AtomicBool::new(true),
        stages: Mutex::new(Vec::new()),
    };
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let fresh_error = execute_clone(&query(), &context).expect_err("reject fresh reserved source");
    assert_eq!(fresh_error.code, "cacheUnavailable");
    assert!(fresh_error.message.contains(cache::META_FILE));
    assert!(fresh_error.message.contains(&fixture.first_commit));
    assert!(
        fresh_error
            .hints
            .iter()
            .any(|hint| hint.contains("ghGetFileContent") && hint.contains(cache::META_FILE))
    );
    assert!(
        runner
            .stages
            .lock()
            .expect("stage lock")
            .iter()
            .all(|stage| !stage.exists()),
        "failed tool-owned staging is cleaned up"
    );
    runner.collide.store(false, Ordering::SeqCst);
    let initial = execute_clone(&query(), &context).expect("clean initial checkout");
    let checkout = PathBuf::from(initial.location.local_path);
    let original_meta = fs::read(checkout.join(cache::META_FILE)).expect("original metadata");
    runner.collide.store(true, Ordering::SeqCst);
    let refresh_error = execute_clone(
        &GhCloneRepoQuery {
            force_refresh: Some(true),
            ..query()
        },
        &context,
    )
    .expect_err("reject reserved source before refresh");
    assert_eq!(refresh_error.code, "cacheUnavailable");
    assert_eq!(
        fs::read(checkout.join(cache::META_FILE)).expect("unchanged metadata"),
        original_meta
    );
    assert_eq!(
        fs::read_to_string(checkout.join("README.md")).expect("unchanged source"),
        "fixture\n"
    );
    assert_eq!(
        git_output(&checkout, &["rev-parse", "HEAD"]).trim(),
        fixture.first_commit
    );
}

#[test]
fn sparse_file_path_checks_out_only_that_file() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    for branch in [Some("main".to_owned()), Some(fixture.first_commit.clone())] {
        for (file, absent) in [
            ("README.md", ["src/lib.rs", "other/skip.txt"]),
            ("src/lib.rs", ["README.md", "src/nested/data.txt"]),
        ] {
            let clone = execute_clone(
                &GhCloneRepoQuery {
                    ref_: branch.as_deref().map(reference),
                    path: Some(one(file)),
                    ..query()
                },
                &context,
            )
            .expect("sparse file clone");
            let local = Path::new(&clone.location.local_path);
            assert!(local.join(file).is_file(), "{file} missing ({branch:?})");
            for sibling in absent {
                assert!(
                    !local.join(sibling).exists(),
                    "{sibling} checked out beside {file} ({branch:?})"
                );
            }
        }
    }
}

#[test]
fn corruption_expiry_stale_lock_and_failed_publication_preserve_cache() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let mut config = CloneConfig::persistent(&cache_home);
    config.cache_ttl = Duration::from_secs(60);
    config.lock_wait = Duration::from_secs(1);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let first = execute_clone(&query(), &context).expect("first clone");
    let clone_path = PathBuf::from(&first.location.local_path);
    fs::write(clone_path.join(cache::META_FILE), "bad").expect("corrupt meta");
    assert!(
        !execute_clone(&query(), &context)
            .expect("rebuild corrupt")
            .location
            .cached
    );

    let mut expired: serde_json::Value = serde_json::from_slice(
        &fs::read(clone_path.join(cache::META_FILE)).expect("read metadata"),
    )
    .expect("parse metadata");
    expired["expiresAt"] = serde_json::Value::String("1970-01-01T00:00:00.000Z".into());
    fs::write(
        clone_path.join(cache::META_FILE),
        serde_json::to_vec(&expired).expect("encode metadata"),
    )
    .expect("expire metadata");
    assert!(
        !execute_clone(&query(), &context)
            .expect("rebuild expired")
            .location
            .cached
    );

    let lock = cache::lock_dir(&cache_home, &clone_path);
    fs::create_dir_all(&lock).expect("stale lock");
    fs::write(
        lock.join(cache::LOCK_META_FILE),
        r#"{"pid":4294967295,"createdAt":0}"#,
    )
    .expect("lock meta");
    assert!(
        execute_clone(&query(), &context)
            .expect("recover stale")
            .location
            .cached
    );

    let destination = root.0.join("publication");
    fs::create_dir_all(&destination).expect("old destination");
    fs::write(destination.join("old"), "preserved").expect("old content");
    let missing_stage = root.0.join("missing-stage");
    assert!(cache::promote(&cache_home, &missing_stage, &destination).is_err());
    assert_eq!(
        fs::read_to_string(destination.join("old")).expect("restored"),
        "preserved"
    );
}

#[test]
fn cache_limits_live_lock_and_failed_sparse_refresh_are_bounded() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let mut config = CloneConfig::persistent(&cache_home);
    config.max_clone_count = 1;
    config.lock_wait = Duration::from_millis(120);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let main = execute_clone(&query(), &context).expect("main clone");
    let main_path = PathBuf::from(&main.location.local_path);
    let tag = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference("v1")),
            ..query()
        },
        &context,
    )
    .expect("tag clone");
    assert!(!main_path.exists(), "oldest clone should be evicted");
    assert!(Path::new(&tag.location.local_path).is_dir());

    // The eviction must be attributable: one JSONL line in the trail.
    let (evictions, log_bytes) = crate::cache::evictions::recent_evictions(&cache_home, 10);
    let size_limit = evictions
        .iter()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find(|value| value["reason"] == "size-limit")
        .expect("size-limit eviction recorded in evictions.jsonl");
    assert_eq!(size_limit["path"], main.location.local_path.as_str());
    assert!(size_limit["bytes"].as_u64().is_some());
    assert_eq!(
        size_limit["pid"].as_u64(),
        Some(u64::from(std::process::id()))
    );
    assert!(log_bytes > 0);

    let live_lock = cache::lock_dir(&cache_home, Path::new(&tag.location.local_path));
    fs::create_dir_all(&live_lock).expect("live lock");
    fs::write(
        live_lock.join(cache::LOCK_META_FILE),
        serde_json::json!({"pid": std::process::id(), "createdAt": 0}).to_string(),
    )
    .expect("live lock metadata");
    let error = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference("v1")),
            ..query()
        },
        &context,
    )
    .expect_err("live lock must time out");
    assert_eq!(error.code, "timeout");
    fs::remove_dir_all(live_lock).expect("remove live lock");

    let missing = execute_clone(
        &GhCloneRepoQuery {
            path: Some(one("missing/path")),
            ..query()
        },
        &context,
    )
    .expect_err("missing sparse path");
    assert_eq!(missing.code, "pathNotFound");
    assert!(missing.message.contains("\"missing/path\""), "{missing:?}");
    assert_eq!(missing.hints.len(), 1, "{missing:?}");
    // The hint, not the message, names the recovery.
    test_support::checks::assert_absent(&serde_json::json!(missing.message), "ghStructure");
    assert!(Path::new(&tag.location.local_path).is_dir());
}

#[test]
fn missing_branch_endpoint_git_and_portable_paths_fail_closed() {
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let config = CloneConfig::persistent(&cache_home);
    let missing_git = SystemGit::new(root.0.join("does-not-exist/git"));
    let mut context = setup(
        &missing_git,
        &config,
        &endpoint,
        &policy,
        &NeverCancel,
        None,
    );
    context.resolved_default_branch = None;
    let error = execute_clone(
        &GhCloneRepoQuery {
            ref_: None,
            ..query()
        },
        &context,
    )
    .expect_err("missing git");
    // An unresolved default branch is git's to resolve; without git the
    // request fails as git-unavailable, never as an unresolved branch.
    assert_eq!(error.code, "gitUnavailable");
    context.resolved_default_branch = Some("main");
    let error = execute_clone(&query(), &context).expect_err("missing git");
    assert_eq!(error.code, "gitUnavailable");

    // Plain http is a valid API base, and clone source, on loopback only.
    let loopback = GitHubEndpoint::new(url::Url::parse("http://127.0.0.1/api/v3").expect("URL"))
        .expect("provider endpoint");
    assert_eq!(
        repository_url(&loopback, "owner", "repo").expect("loopback clone URL"),
        "http://127.0.0.1/owner/repo.git"
    );
    assert!(
        GitHubEndpoint::new(url::Url::parse("http://ghe.example.com/api/v3").expect("URL"))
            .is_err(),
        "non-loopback http is rejected before any clone URL exists"
    );
    let encoded =
        GitHubEndpoint::new(url::Url::parse("https://example.test/prefix/api/v3").expect("URL"))
            .expect("GHES endpoint");
    assert_eq!(
        repository_url(&encoded, "owner name", "repo#name").expect("encoded URL"),
        "https://example.test/prefix/owner%20name/repo%23name.git"
    );
    for sparse_path in [r"..\escape", r"src\portable"] {
        assert!(
            rejects_sparse_path(sparse_path),
            "contract must reject portable sparse path: {sparse_path}"
        );
    }
}

#[cfg(unix)]
struct FlagCancel(AtomicBool);
#[cfg(unix)]
impl CancellationCheck for FlagCancel {
    fn check(&self) -> Result<(), String> {
        if self.0.load(Ordering::SeqCst) {
            Err("cancelled by test".into())
        } else {
            Ok(())
        }
    }
}

#[cfg(unix)]
#[test]
fn system_git_cancellation_kills_and_reaps_process_group() {
    use std::os::unix::fs::PermissionsExt;
    let root = test_support::Fixture::new();
    let script = root.0.join("git-fixture.sh");
    let pid_file = root.0.join("child.pid");
    fs::write(
        &script,
        "#!/bin/sh\nfor pid_file do :; done\nsleep 30 &\nchild=$!\nprintf '%s' \"$child\" > \"$pid_file\"\nwait \"$child\"\n",
    )
    .expect("script");
    let mut permissions = fs::metadata(&script).expect("metadata").permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(&script, permissions).expect("permissions");
    let cancellation = Arc::new(FlagCancel(AtomicBool::new(false)));
    let trigger = cancellation.clone();
    let trigger_pid_file = pid_file.clone();
    let deadline = Instant::now() + Duration::from_secs(10);
    let join = std::thread::spawn(move || {
        while Instant::now() < deadline {
            if let Some(pid) = fs::read_to_string(&trigger_pid_file)
                .ok()
                .and_then(|text| text.parse::<i32>().ok())
                .filter(|pid| *pid > 0)
            {
                let cancelled_at = Instant::now();
                trigger.0.store(true, Ordering::SeqCst);
                return Some((pid, cancelled_at));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        None
    });
    let runner = SystemGit::new(&script);
    let result = runner.run(
        &GitRunRequest {
            args: vec![pid_file.as_os_str().to_owned()],
            timeout: Duration::from_secs(10),
            label: "cancellation fixture".into(),
            authorization: None,
            authorization_url: None,
        },
        &GitRunControl {
            cancellation: cancellation.as_ref(),
            deadline,
            cache_home: &root.0,
        },
    );
    let (pid, cancelled_at) = join
        .join()
        .expect("trigger")
        .expect("fixture must publish its child pid within the unchanged execution deadline");
    assert_eq!(result.expect_err("cancel").code, "cancelled");
    assert!(
        cancelled_at.elapsed() < Duration::from_secs(1),
        "ready process-group cancellation must finish promptly"
    );
    // A killed grandchild can remain briefly visible as a zombie until the OS
    // reaper runs. Poll only for that bounded reaping window; a live sleep would
    // remain for 30 seconds and fail this check.
    let child_gone = (0..100).any(|_| {
        // SAFETY: signal zero only checks whether the fixture child still exists.
        let gone = unsafe { libc::kill(pid, 0) } == -1;
        if !gone {
            std::thread::sleep(Duration::from_millis(10));
        }
        gone
    });
    assert!(
        child_gone,
        "fixture child survived process-group cancellation"
    );
}

#[cfg(unix)]
#[test]
fn system_git_timeout_and_failure_output_are_bounded_and_redacted() {
    let root = test_support::Fixture::new();
    // Installed Git avoids measuring cold loading of a freshly created
    // executable. Test-only aliases still exercise real subprocess stderr,
    // credential scrubbing, deadlines and process-group cleanup.
    let runner = SystemGit::default();
    let control = GitRunControl {
        cancellation: &NeverCancel,
        deadline: Instant::now() + Duration::from_secs(15),
        cache_home: &root.0,
    };
    let token = "highly-sensitive-token";
    let failed = runner
        .run(
            &GitRunRequest {
                args: vec![
                    "-c".into(),
                    "alias.octocode-fixture=!env >&2; printf 'arg:%s\\n' \"$@\" >&2; exit 1".into(),
                    "octocode-fixture".into(),
                ],
                timeout: Duration::from_secs(10),
                label: "redaction fixture".into(),
                authorization: Some(token),
                authorization_url: Some("https://github.com/owner/repo.git"),
            },
            &control,
        )
        .expect_err("failure fixture");
    assert_eq!(failed.code, "gitFailed");
    // The child's environment dump names the helper, never the credential:
    // nothing is left to redact.
    test_support::checks::assert_absent(&serde_json::json!(failed.message), token);
    assert!(
        failed.message.contains("GIT_ASKPASS="),
        "{}",
        failed.message
    );
    test_support::checks::assert_absent(&serde_json::json!(failed.message), "Authorization");

    // A git error names no checkout stage under the Octocode home.
    let stage = root
        .0
        .join("tmp")
        .join("clone-tmp")
        .join("stage-1")
        .join("repo");
    let staged = runner
        .run(
            &GitRunRequest {
                args: vec![
                    "-c".into(),
                    format!(
                        "alias.octocode-fixture=!printf \"fatal: could not create work tree dir '%s'\\n\" '{}' >&2; exit 128",
                        stage.display()
                    )
                    .into(),
                    "octocode-fixture".into(),
                ],
                timeout: Duration::from_secs(10),
                label: "stage fixture".into(),
                authorization: None,
                authorization_url: None,
            },
            &control,
        )
        .expect_err("stage fixture");
    test_support::checks::assert_absent(&serde_json::json!(staged.message), "clone-tmp");
    assert!(
        staged.message.contains("work tree dir"),
        "{}",
        staged.message
    );

    let started = Instant::now();
    let timed_out = runner
        .run(
            &GitRunRequest {
                args: vec![
                    "-c".into(),
                    "alias.octocode-fixture=!sleep 30".into(),
                    "octocode-fixture".into(),
                ],
                timeout: Duration::from_millis(60),
                label: "timeout fixture".into(),
                authorization: None,
                authorization_url: None,
            },
            &control,
        )
        .expect_err("timeout fixture");
    assert_eq!(timed_out.code, "timeout");
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[test]
fn concurrent_requests_publish_once_and_validation_fails_closed() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = Arc::new(test_support::workspace_policy(&root.0));
    let endpoint = Arc::new(api_github_endpoint());
    let runner = Arc::new(fixture_runner(&fixture));
    let config = Arc::new(CloneConfig::persistent(&cache_home));
    let barrier = Arc::new(Barrier::new(2));
    let mut workers = vec![];
    for _ in 0..2 {
        let policy = policy.clone();
        let endpoint = endpoint.clone();
        let runner = runner.clone();
        let config = config.clone();
        let barrier = barrier.clone();
        workers.push(std::thread::spawn(move || {
            barrier.wait();
            execute_clone(
                &query(),
                &CloneContext {
                    config: &config,
                    endpoint: &endpoint,
                    credential: None,
                    resolved_default_branch: Some("main"),
                    cancellation: &NeverCancel,
                    deadline: Instant::now() + Duration::from_secs(30),
                    path_policy: &policy,
                    git: runner.as_ref(),
                },
            )
            .expect("race clone")
        }));
    }
    let values = workers
        .into_iter()
        .map(|worker| worker.join().expect("worker"))
        .collect::<Vec<_>>();
    assert_eq!(
        values.iter().filter(|value| value.location.cached).count(),
        1
    );
    assert_eq!(values[0].location.commit_sha, values[1].location.commit_sha);

    // A traversal owner never reaches the clone: the contract rejects it.
    assert!(
        "../escape"
            .parse::<crate::contracts::tool_types::GhCloneRepoQueryOwner>()
            .is_err(),
        "the contract rejects a traversal owner"
    );
    assert!(
        rejects_sparse_path("../escape"),
        "contract must reject sparse parent traversal before clone"
    );
}

#[cfg(unix)]
#[test]
fn repository_symlinks_are_checked_out_as_plain_files() {
    // A repo symlink pointing at another ~/.octocode file would otherwise be
    // readable through localFetch inside the clone root.
    let fixture = Fixture::new();
    std::os::unix::fs::symlink("../../secret.json", fixture.work.join("escape")).expect("symlink");
    git(&fixture.work, &["add", "escape"]);
    git(&fixture.work, &["commit", "-m", "symlink"]);
    git(&fixture.work, &["push", "origin", "main"]);
    let head = git_output(&fixture.work, &["rev-parse", "HEAD"])
        .trim()
        .to_owned();

    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let mut config = CloneConfig::persistent(&cache_home);
    config.cache_ttl = Duration::from_secs(60);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    for (branch, sparse) in [("main", None), (head.as_str(), None), ("main", Some("src"))] {
        let clone = execute_clone(
            &GhCloneRepoQuery {
                ref_: Some(reference(branch)),
                path: sparse.map(one),
                ..query()
            },
            &context,
        )
        .expect("clone");
        let link = Path::new(&clone.location.local_path).join("escape");
        if sparse.is_none() {
            let meta = fs::symlink_metadata(&link).expect("escape entry");
            assert!(
                !meta.file_type().is_symlink(),
                "{branch}: symlink materialized"
            );
        }
    }
    let seen = runner
        .seen
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for step in [
        "full clone",
        "sparse clone",
        "fetch requested commit",
        "check out requested commit",
        "set sparse checkout paths",
    ] {
        let request = seen
            .iter()
            .find(|value| value.contains(step))
            .unwrap_or_else(|| panic!("{step} not run: {seen:?}"));
        assert!(
            request.contains("core.symlinks=false"),
            "{step} lacks core.symlinks=false: {request}"
        );
    }
}

#[test]
fn uppercase_commit_refs_share_the_cache_and_mismatched_meta_is_a_miss() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let mut config = CloneConfig::persistent(&cache_home);
    config.cache_ttl = Duration::from_secs(60);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let lower = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference(&fixture.first_commit)),
            ..query()
        },
        &context,
    )
    .expect("lowercase sha clone");
    let upper = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference(&fixture.first_commit.to_ascii_uppercase())),
            ..query()
        },
        &context,
    )
    .expect("uppercase sha clone");
    assert!(upper.location.cached, "uppercase SHA missed the cache");
    assert_eq!(upper.location.local_path, lower.location.local_path);

    // Tamper the persisted meta so it describes a different checkout: the
    // next request must re-clone rather than trust the directory.
    let meta_path = Path::new(&lower.location.local_path).join(cache::META_FILE);
    let mut meta: serde_json::Value =
        serde_json::from_slice(&fs::read(&meta_path).expect("meta")).expect("meta json");
    meta["repo"] = serde_json::json!("some-other-repo");
    fs::write(&meta_path, serde_json::to_vec(&meta).expect("json")).expect("write meta");
    let again = execute_clone(
        &GhCloneRepoQuery {
            ref_: Some(reference(&fixture.first_commit)),
            ..query()
        },
        &context,
    )
    .expect("re-clone");
    assert!(!again.location.cached, "mismatched meta served from cache");
}

/// A fixture context whose caller did not resolve a default branch, as the
/// runtime now calls it (no GitHub API before cloning).
struct Bench {
    fixture: Fixture,
    /// Holds the temp directory for the bench's lifetime.
    _root: test_support::Fixture,
    policy: PathPolicy,
    endpoint: GitHubEndpoint,
    runner: RewriteRunner,
    config: CloneConfig,
}

impl Bench {
    fn new() -> Self {
        Self::at(api_github_endpoint())
    }

    /// A bench whose GitHub API is `endpoint`; git clones the fixture in
    /// place of the repository URL that endpoint derives.
    fn at(endpoint: GitHubEndpoint) -> Self {
        let fixture = Fixture::new();
        let (root, cache_home) = home_root();
        let policy = test_support::workspace_policy(&root.0);
        let url = repository_url(&endpoint, "fixture-owner", "fixture-repo").expect("clone URL");
        let runner = RewriteRunner::new(&url, &fixture.bare_url);
        let mut config = CloneConfig::persistent(&cache_home);
        config.cache_ttl = Duration::from_secs(60);
        Self {
            fixture,
            _root: root,
            policy,
            endpoint,
            runner,
            config,
        }
    }

    fn context(&self) -> CloneContext<'_> {
        self.context_as(None)
    }

    /// [`Self::context`] for the caller holding `credential`.
    fn context_as<'a>(&'a self, credential: Option<&'a ResolvedCredential>) -> CloneContext<'a> {
        CloneContext {
            resolved_default_branch: None,
            ..setup(
                &self.runner,
                &self.config,
                &self.endpoint,
                &self.policy,
                &NeverCancel,
                credential,
            )
        }
    }

    fn clones_seen(&self) -> usize {
        self.runner
            .seen
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .filter(|call| call.contains("\"clone\"") || call.contains("\"fetch\""))
            .count()
    }
}

fn unbranched() -> GhCloneRepoQuery {
    GhCloneRepoQuery {
        ref_: None,
        ..query()
    }
}

/// An unbranched clone lets git resolve the default branch, and the
/// next unbranched call is a cache hit through the recorded alias — neither
/// needs the repository metadata API.
#[test]
fn unbranched_clone_resolves_the_default_branch_with_git_and_hits_by_alias() {
    let bench = Bench::new();
    let context = bench.context();
    let fresh = execute_clone(&unbranched(), &context).expect("default-branch clone");
    assert_eq!(fresh.location.resolved_ref, "main");
    assert!(!fresh.location.cached);
    assert_eq!(fresh.location.commit_sha, bench.fixture.first_commit);
    let network = bench.clones_seen();
    assert_eq!(network, 1, "one git clone");

    let hit = execute_clone(&unbranched(), &context).expect("aliased hit");
    assert!(
        hit.location.cached,
        "the alias finds the default-branch entry"
    );
    assert_eq!(hit.location.local_path, fresh.location.local_path);
    assert_eq!(bench.clones_seen(), network, "a hit runs no network git");

    // The explicit branch shares the entry.
    let named = execute_clone(&query(), &context).expect("named hit");
    assert!(named.location.cached);
    assert_eq!(named.location.local_path, fresh.location.local_path);

    // forceRefresh ignores the alias and re-resolves through git.
    let second = bench.fixture.push_second();
    let refreshed = execute_clone(
        &GhCloneRepoQuery {
            force_refresh: Some(true),
            ..unbranched()
        },
        &context,
    )
    .expect("refresh");
    assert!(!refreshed.location.cached);
    assert_eq!(refreshed.location.commit_sha, second);
}

/// Several sparse paths check out together; a file among them switches
/// to exact non-cone patterns so nothing else is included.
#[test]
fn multiple_sparse_paths_check_out_every_path() {
    let bench = Bench::new();
    let context = bench.context();
    let both = execute_clone(
        &GhCloneRepoQuery {
            path: Some(many(&["src/nested", "other"])),
            ..query()
        },
        &context,
    )
    .expect("multi-directory sparse clone");
    let local = Path::new(&both.location.local_path);
    assert!(local.join("src/nested/data.txt").is_file());
    assert!(local.join("other/skip.txt").is_file());
    assert_eq!(
        both.location.requested_paths.as_deref(),
        Some(&["src/nested".to_owned(), "other".to_owned()][..])
    );
    let row = serde_json::to_value(&both).expect("serialize");
    assert_eq!(
        Path::new(
            row["next"]["exploreClone"]["query"]["queries"][0]["path"]
                .as_str()
                .expect("path")
        ),
        local,
        "several paths explore the checkout root"
    );

    let reordered = execute_clone(
        &GhCloneRepoQuery {
            path: Some(many(&["other", "src/nested"])),
            ..query()
        },
        &context,
    )
    .expect("same set, other order");
    assert!(
        reordered.location.cached,
        "request order does not split the cache"
    );

    let mixed = execute_clone(
        &GhCloneRepoQuery {
            path: Some(many(&["README.md", "src/nested"])),
            ..query()
        },
        &context,
    )
    .expect("file plus directory sparse clone");
    let local = Path::new(&mixed.location.local_path);
    assert!(local.join("README.md").is_file());
    assert!(local.join("src/nested/data.txt").is_file());
    assert!(!local.join("src/lib.rs").exists());
    assert!(!local.join("other/skip.txt").exists());

    let missing = execute_clone(
        &GhCloneRepoQuery {
            path: Some(many(&["src", "nope"])),
            ..query()
        },
        &context,
    )
    .expect_err("one missing path fails the clone");
    assert_eq!(missing.code, "pathNotFound");
    assert!(missing.message.contains("\"nope\""), "{missing:?}");
    test_support::checks::assert_absent(&serde_json::json!(missing.message), "\"src\"");
}

/// `depth` fetches that many commits and keys its own cache entry.
#[test]
fn history_depth_fetches_that_many_commits() {
    let bench = Bench::new();
    let context = bench.context();
    bench.fixture.push_second();
    let shallow = execute_clone(&query(), &context).expect("shallow");
    let deep = execute_clone(
        &GhCloneRepoQuery {
            history_depth: std::num::NonZeroU64::new(2),
            ..query()
        },
        &context,
    )
    .expect("depth 2");
    assert_ne!(shallow.location.local_path, deep.location.local_path);
    assert_eq!(deep.location.history_depth, Some(2));
    assert_eq!(shallow.location.history_depth, None);
    let count = |path: &str| {
        git_output(Path::new(path), &["rev-list", "--count", "HEAD"])
            .trim()
            .to_owned()
    };
    assert_eq!(count(&shallow.location.local_path), "1");
    assert_eq!(count(&deep.location.local_path), "2");
}

/// After git failed, the one `commits/{ref}` answer explains why: a missing
/// ref or repository is not-found input (exit 3) naming what is missing, a
/// rejected credential keeps its provider error, and an API failure or an
/// existing ref leaves the git error with the API answer as a hint.
#[test]
fn git_failures_are_explained_by_the_ref_answer() {
    use octocode_github::{ProviderError, ProviderErrorKind, ProviderErrorReason};
    let git = || CloneError {
        code: "gitFailed".into(),
        message: "git clone failed: fatal: Remote branch nope not found".into(),
        hints: vec!["Check network access to the git remote.".into()],
        next: None,
    };
    let tagged = parse_query(serde_json::json!({
        "owner": "o", "repo": "r", "ref": "nope", "mainGoal": "test", "reasoning": "r"
    }));
    let api = |kind, status: u16, message: &str| ProviderError {
        status: Some(status),
        ..ProviderError::new(kind, message.to_owned())
    };
    let missing_ref = api(
        ProviderErrorKind::Validation,
        422,
        "No commit found for SHA: nope",
    )
    .with_reason(ProviderErrorReason::RefNotFound);
    match explain_git_failure(&tagged, git(), Err(missing_ref)) {
        CloneFailure::Clone(error) => {
            assert_eq!(error.code, "notFound", "{error:?}");
            assert!(error.message.contains("\"nope\""), "{error:?}");
            assert!(error.hints[0].contains("ghStructure"), "{error:?}");
            let refs = &error.next.as_ref().expect("refs lead")["viewRefs"];
            assert_eq!(refs["tool"], "ghStructure", "{error:?}");
            assert_eq!(
                refs["query"]["queries"][0],
                serde_json::json!({"owner": "o", "repo": "r", "operation": "refs"}),
                "{error:?}"
            );
        }
        CloneFailure::Provider(error) => panic!("a missing ref is input: {error:?}"),
    }
    let missing_repo = api(ProviderErrorKind::NotFound, 404, "Not Found")
        .with_reason(ProviderErrorReason::RepositoryNotFound);
    match explain_git_failure(&tagged, git(), Err(missing_repo)) {
        CloneFailure::Clone(error) => {
            assert_eq!(error.code, "notFound");
            assert_eq!(error.message, "Repository not found: o/r");
            assert_eq!(
                error.next.as_ref().expect("search lead")["findRepository"]["tool"],
                "ghSearchRepo",
                "{error:?}"
            );
        }
        CloneFailure::Provider(error) => panic!("a missing repository is input: {error:?}"),
    }
    for kind in [
        ProviderErrorKind::Authentication,
        ProviderErrorKind::Permission,
    ] {
        assert!(matches!(
            explain_git_failure(&tagged, git(), Err(api(kind, 401, "denied"))),
            CloneFailure::Provider(_)
        ));
    }
    match explain_git_failure(
        &tagged,
        git(),
        Err(api(ProviderErrorKind::Server, 503, "unavailable")),
    ) {
        CloneFailure::Clone(error) => {
            assert_eq!(error.code, "gitFailed");
            assert!(error.hints.iter().any(|hint| hint.contains("unavailable")));
        }
        CloneFailure::Provider(error) => panic!("an outage never masks git: {error:?}"),
    }
    match explain_git_failure(&tagged, git(), Ok("0".repeat(40))) {
        CloneFailure::Clone(error) => assert_eq!(error.code, "gitFailed"),
        CloneFailure::Provider(error) => panic!("{error:?}"),
    }
}

/// A cache hit costs no git availability probe and no checkout walk: a
/// failing `rev-parse` already diagnoses a missing git, and the size was
/// recorded when the checkout was published.
#[test]
fn cache_hits_skip_the_git_probe_and_report_the_recorded_size() {
    let fixture = Fixture::new();
    let (root, cache_home) = home_root();
    let policy = test_support::workspace_policy(&root.0);
    let endpoint = api_github_endpoint();
    let runner = fixture_runner(&fixture);
    let config = CloneConfig::persistent(&cache_home);
    let context = setup(&runner, &config, &endpoint, &policy, &NeverCancel, None);
    let fresh = execute_clone(&query(), &context).expect("fresh clone");
    runner
        .seen
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clear();
    let cached = execute_clone(&query(), &context).expect("cached clone");
    assert!(cached.location.cached);
    assert_eq!(cached.bytes, fresh.bytes);
    assert!(fresh.bytes > 0);
    let seen = runner
        .seen
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    // A cache hit never probes git.
    test_support::checks::assert_absent(&serde_json::json!(seen), "--version");
}

/// The native sparse-path rule holds on its own, whatever the contract
/// pattern admits: no root, drive, backslash, `.`/`..` segment or blank.
#[test]
fn sparse_path_validation_rejects_traversal_absolute_and_backslash() {
    for path in [
        "../escape",
        "a/../b",
        "a/..",
        "./a",
        "a/./b",
        ".",
        "..",
        "/abs",
        "/",
        "C:/x",
        "c:x",
        "a\\b",
        "\\\\server\\share",
        "",
        "  ",
    ] {
        assert!(!is_sparse_path(path), "{path:?} must be rejected");
    }
    for path in [
        "src",
        "a/b",
        "src/",
        ".github/workflows",
        "a..b",
        "...",
        "docs/C:x",
    ] {
        assert!(is_sparse_path(path), "{path:?} must be accepted");
        // The contract's lookaround-free `path` pattern admits every path
        // the native rule accepts: no valid path is refused at the edge.
        assert!(
            !rejects_sparse_path(path),
            "{path:?} rejected by the contract"
        );
    }
    // The pattern alone already refuses traversal, roots and backslashes.
    for path in ["../escape", "a/../b", "./a", ".", "..", "/abs", "a\\b"] {
        assert!(
            rejects_sparse_path(path),
            "{path:?} admitted by the contract"
        );
    }
}

/// A default-branch clone that resolves to a branch already cached by an
/// explicit `ref` reuses that entry instead of replacing it.
#[test]
fn unbranched_clone_reuses_the_entry_an_explicit_ref_cached() {
    let bench = Bench::new();
    let context = bench.context();
    let named = execute_clone(&query(), &context).expect("named clone");
    assert!(!named.location.cached);
    let marker = Path::new(&named.location.local_path).join(".git/octocode-entry-marker");
    fs::write(&marker, "kept").expect("marker");

    let default = execute_clone(&unbranched(), &context).expect("default-branch clone");
    assert!(default.location.cached, "{default:?}");
    assert_eq!(default.location.resolved_ref, "main");
    assert_eq!(default.location.local_path, named.location.local_path);
    assert_eq!(default.location.commit_sha, named.location.commit_sha);
    assert!(marker.is_file(), "the cached entry was not replaced");

    // The alias is recorded, so the next default-branch call runs no git.
    let network = bench.clones_seen();
    let again = execute_clone(&unbranched(), &context).expect("aliased hit");
    assert!(again.location.cached);
    assert_eq!(bench.clones_seen(), network);
}

/// An abbreviated SHA is input git cannot clone: when `commits/{ref}`
/// resolves it, the error names the full SHA and offers the clone at it.
#[test]
fn a_short_sha_ref_is_invalid_input_naming_the_full_sha() {
    let full = "666df7c1234567890abcdef1234567890abcdef0";
    let short = parse_query(serde_json::json!({
        "owner": "o", "repo": "r", "ref": "666DF7C", "mainGoal": "test", "reasoning": "r"
    }));
    let git = CloneError::new(
        "gitFailed",
        "git clone failed: fatal: Remote branch 666DF7C not found",
    );
    match explain_git_failure(&short, git, Ok(full.to_owned())) {
        CloneFailure::Clone(error) => {
            assert_eq!(error.code, "invalidInput", "{error:?}");
            assert!(error.message.contains(full), "{error:?}");
            assert!(error.message.contains("\"666DF7C\""), "{error:?}");
            let retry = &error.next.as_ref().expect("retry lead")["cloneFullSha"];
            assert_eq!(retry["tool"], "ghCloneRepo", "{error:?}");
            assert_eq!(retry["query"]["queries"][0]["ref"], full, "{error:?}");
            assert_eq!(retry["query"]["queries"][0]["repo"], "r", "{error:?}");
        }
        CloneFailure::Provider(error) => panic!("{error:?}"),
    }
    // A branch the API resolves still leaves the git error standing.
    let branch = parse_query(serde_json::json!({
        "owner": "o", "repo": "r", "ref": "feature", "mainGoal": "test", "reasoning": "r"
    }));
    match explain_git_failure(
        &branch,
        CloneError::new("gitFailed", "x"),
        Ok(full.to_owned()),
    ) {
        CloneFailure::Clone(error) => assert_eq!(error.code, "gitFailed"),
        CloneFailure::Provider(error) => panic!("{error:?}"),
    }
}

/// Callers of one runtime that share its clone cache: each holds its own
/// token, as the API and git see it.
const ALICE: &str = "clone-token-alice";
const BOB: &str = "clone-token-bob";

fn credential(token: &str) -> ResolvedCredential {
    ResolvedCredential::new(token, CredentialSource::Override)
}

/// One ghCloneRepo row run as the holder of `token`, through the runtime's
/// entry point (`run`), with that token for both the API and git.
async fn clone_as<C: ConditionalCache>(
    bench: &Bench,
    provider: &GitHubProvider<C>,
    query: &GhCloneRepoQuery,
    token: &str,
) -> Result<CloneResult, CloneFailure> {
    let credential = credential(token);
    let request = RequestContext::new(
        octocode_github::RequestBudget::with_timeout(Duration::from_secs(5), 1 << 20),
        Some(credential.clone()),
    );
    run(
        provider,
        query,
        Ok(&request),
        &bench.context_as(Some(&credential)),
    )
    .await
}

/// `commits/{reference}` of the fixture repository answers `token` with
/// `response`.
async fn answer_commit(
    server: &wiremock::MockServer,
    reference: &str,
    token: &str,
    response: wiremock::ResponseTemplate,
) {
    use wiremock::matchers::{header, method, path};
    wiremock::Mock::given(method("GET"))
        .and(path(format!(
            "/api/v3/repos/fixture-owner/fixture-repo/commits/{reference}"
        )))
        .and(header("authorization", format!("Bearer {token}").as_str()))
        .respond_with(response)
        .mount(server)
        .await;
}

fn not_found() -> wiremock::ResponseTemplate {
    wiremock::ResponseTemplate::new(404).set_body_json(serde_json::json!({"message": "Not Found"}))
}

/// The API paths `server` was asked for, in order.
async fn api_calls(server: &wiremock::MockServer) -> Vec<String> {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .map(|request| request.url.path().to_owned())
        .collect()
}

/// A checkout Alice's token cloned is never handed to Bob's token when
/// GitHub denies Bob the repository: Bob gets the not-found a fresh clone
/// would give him, no checkout path, and Alice's checkout stays.
#[tokio::test]
async fn cache_hit_is_not_served_to_a_caller_without_access() {
    let server = wiremock::MockServer::builder().start().await;
    let bench = Bench::at(gh_shared_support::mock_endpoint(&server));
    let provider = gh_shared_support::one_shot_provider(&server);
    answer_commit(&server, "main", BOB, not_found()).await;

    let alice = clone_as(&bench, &provider, &query(), ALICE)
        .await
        .unwrap_or_else(|_| panic!("Alice clones"));
    assert!(!alice.location.cached);
    let clones = bench.clones_seen();

    match clone_as(&bench, &provider, &query(), BOB).await {
        Ok(served) => panic!("Bob was served Alice's checkout: {served:?}"),
        Err(CloneFailure::Clone(error)) => {
            assert_eq!(error.code, "notFound", "{error:?}");
            assert_eq!(
                error.message,
                "Repository not found: fixture-owner/fixture-repo"
            );
            test_support::checks::assert_absent(
                &serde_json::json!(error),
                &alice.location.local_path,
            );
        }
        Err(CloneFailure::Provider(error)) => panic!("a denied repository is notFound: {error:?}"),
    }
    assert_eq!(bench.clones_seen(), clones, "Bob ran no git");
    assert!(
        Path::new(&alice.location.local_path)
            .join("README.md")
            .is_file(),
        "Alice's checkout is kept"
    );
    // Alice's fresh clone made no API call; Bob's refusal made exactly one.
    assert_eq!(
        api_calls(&server).await,
        ["/api/v3/repos/fixture-owner/fixture-repo/commits/main"]
    );
}

/// A caller GitHub grants the repository is served the hit after one
/// `commits/{ref}` check with their own token, with no re-clone.
#[tokio::test]
async fn cache_hit_is_served_after_the_callers_access_check() {
    let server = wiremock::MockServer::builder().start().await;
    let bench = Bench::at(gh_shared_support::mock_endpoint(&server));
    let provider = gh_shared_support::one_shot_provider(&server);
    let sha = bench.fixture.first_commit.clone();
    answer_commit(
        &server,
        "main",
        BOB,
        wiremock::ResponseTemplate::new(200).set_body_string(sha.as_str()),
    )
    .await;

    let alice = clone_as(&bench, &provider, &query(), ALICE)
        .await
        .unwrap_or_else(|_| panic!("Alice clones"));
    let clones = bench.clones_seen();
    let bob = clone_as(&bench, &provider, &query(), BOB)
        .await
        .unwrap_or_else(|_| panic!("Bob may read the repository"));
    assert!(bob.location.cached, "{bob:?}");
    assert_eq!(bob.location.local_path, alice.location.local_path);
    assert_eq!(bob.location.commit_sha, sha);
    assert_eq!(
        bench.clones_seen(),
        clones,
        "an allowed hit is not re-cloned"
    );
    assert_eq!(
        api_calls(&server).await,
        ["/api/v3/repos/fixture-owner/fixture-repo/commits/main"]
    );
}

/// An unbranched request resolved through the default-branch alias checks
/// access to the branch it would serve.
#[tokio::test]
async fn default_branch_alias_requires_access() {
    let server = wiremock::MockServer::builder().start().await;
    let bench = Bench::at(gh_shared_support::mock_endpoint(&server));
    let provider = gh_shared_support::one_shot_provider(&server);
    answer_commit(&server, "main", BOB, not_found()).await;

    let alice = clone_as(&bench, &provider, &unbranched(), ALICE)
        .await
        .unwrap_or_else(|_| panic!("Alice clones the default branch"));
    assert_eq!(alice.location.resolved_ref, "main");
    match clone_as(&bench, &provider, &unbranched(), BOB).await {
        Ok(served) => panic!("Bob was served Alice's checkout: {served:?}"),
        Err(CloneFailure::Clone(error)) => assert_eq!(error.code, "notFound", "{error:?}"),
        Err(CloneFailure::Provider(error)) => panic!("a denied repository is notFound: {error:?}"),
    }
    assert_eq!(
        api_calls(&server).await,
        ["/api/v3/repos/fixture-owner/fixture-repo/commits/main"]
    );
}

/// A check that cannot pass refuses the hit: a caller's spent rate limit
/// never unlocks another caller's checkout.
#[tokio::test]
async fn access_check_failure_fails_closed() {
    let server = wiremock::MockServer::builder().start().await;
    let bench = Bench::at(gh_shared_support::mock_endpoint(&server));
    let provider = gh_shared_support::one_shot_provider(&server);
    let reset = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs()
        + 3600;
    answer_commit(
        &server,
        "main",
        BOB,
        wiremock::ResponseTemplate::new(403)
            .insert_header("x-ratelimit-remaining", "0")
            .insert_header("x-ratelimit-reset", reset.to_string().as_str())
            .insert_header("x-ratelimit-resource", "core")
            .set_body_json(serde_json::json!({"message": "API rate limit exceeded"})),
    )
    .await;

    clone_as(&bench, &provider, &query(), ALICE)
        .await
        .unwrap_or_else(|_| panic!("Alice clones"));
    match clone_as(&bench, &provider, &query(), BOB).await {
        Ok(served) => panic!("a rate-limited check served the hit: {served:?}"),
        Err(CloneFailure::Provider(error)) => {
            assert_eq!(error.kind, octocode_github::ProviderErrorKind::RateLimited);
        }
        Err(CloneFailure::Clone(error)) => {
            panic!("a rate limit keeps its provider error: {error:?}")
        }
    }
}

/// A check that never reaches GitHub refuses the hit too.
#[tokio::test]
async fn access_check_network_failure_refuses_the_hit() {
    // An API endpoint nothing listens on: the port is released before use.
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .expect("free port")
        .port();
    let endpoint = GitHubEndpoint::new(
        url::Url::parse(&format!("http://127.0.0.1:{port}/api/v3")).expect("URL"),
    )
    .expect("endpoint");
    let bench = Bench::at(endpoint.clone());
    let provider = gh_shared_support::one_shot_provider_at(endpoint);

    let alice = clone_as(&bench, &provider, &query(), ALICE)
        .await
        .unwrap_or_else(|_| panic!("a fresh clone needs no API call"));
    assert!(!alice.location.cached);
    match clone_as(&bench, &provider, &query(), BOB).await {
        Ok(served) => panic!("an unreachable check served the hit: {served:?}"),
        Err(CloneFailure::Provider(error)) => assert!(
            matches!(
                error.kind,
                octocode_github::ProviderErrorKind::Transport
                    | octocode_github::ProviderErrorKind::Timeout
            ),
            "{error:?}"
        ),
        Err(CloneFailure::Clone(error)) => {
            panic!("a network failure is a provider error: {error:?}")
        }
    }
    assert!(
        Path::new(&alice.location.local_path)
            .join("README.md")
            .is_file()
    );
}

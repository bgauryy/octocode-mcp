use super::CloneError;
use crate::tools::bounded_process::{BoundedError, run_bounded};
use crate::tools::cancel::CancellationCheck;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::ffi::OsString;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const MAX_OUTPUT_BYTES: usize = 5 * 1024 * 1024;

pub struct GitRunRequest<'a> {
    pub args: Vec<OsString>,
    pub timeout: Duration,
    pub label: String,
    pub(crate) authorization: Option<&'a str>,
    pub(crate) authorization_url: Option<&'a str>,
}

impl fmt::Debug for GitRunRequest<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("GitRunRequest")
            .field("args", &self.args)
            .field("timeout", &self.timeout)
            .field("label", &self.label)
            .field("authorization", &self.authorization.map(|_| "[REDACTED]"))
            .field("authorization_url", &self.authorization_url)
            .finish()
    }
}

#[cfg(test)]
impl GitRunRequest<'_> {
    /// Preserve private auth transport while allowing an injected runner to
    /// rewrite only argv for a hermetic fixture.
    pub(crate) fn with_args(&self, args: Vec<OsString>) -> Self {
        Self {
            args,
            timeout: self.timeout,
            label: self.label.clone(),
            authorization: self.authorization,
            authorization_url: self.authorization_url,
        }
    }
}

pub struct GitRunControl<'a> {
    pub cancellation: &'a dyn CancellationCheck,
    pub deadline: Instant,
    pub cache_home: &'a Path,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
}

pub trait GitRunner: Send + Sync {
    fn run(
        &self,
        request: &GitRunRequest<'_>,
        control: &GitRunControl<'_>,
    ) -> Result<GitOutput, CloneError>;

    fn assert_available(&self, control: &GitRunControl<'_>) -> Result<(), CloneError> {
        match self.run(
            &GitRunRequest {
                args: vec![OsString::from("--version")],
                timeout: Duration::from_secs(5),
                label: "check Git availability".into(),
                authorization: None,
                authorization_url: None,
            },
            control,
        ) {
            Ok(_) => Ok(()),
            Err(error) if matches!(error.code.as_str(), "cancelled" | "timeout") => Err(error),
            Err(_) => Err(CloneError::new(
                "gitUnavailable",
                "git is not installed or not on PATH. The ghCloneRepo tool requires git to be available.",
            )),
        }
    }
}

/// Runtime environment names the isolated git keeps: its PATH plus the proxy
/// and trust-store settings a corporate network needs. Nothing that weakens
/// TLS (`GIT_SSL_NO_VERIFY`) or carries a credential passes.
const PASSTHROUGH_ENV: &[&str] = &[
    "PATH",
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "ALL_PROXY",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "GIT_SSL_CAINFO",
    "GIT_SSL_CAPATH",
    "CURL_CA_BUNDLE",
    #[cfg(windows)]
    "SystemRoot",
];

#[derive(Clone, Debug)]
pub struct SystemGit {
    executable: PathBuf,
    /// [`PASSTHROUGH_ENV`] values, read once from the runtime environment.
    passthrough: Vec<(String, OsString)>,
}

impl Default for SystemGit {
    /// The process environment, for callers without a runtime env map.
    fn default() -> Self {
        Self {
            executable: PathBuf::from("git"),
            passthrough: PASSTHROUGH_ENV
                .iter()
                .filter_map(|name| Some(((*name).to_owned(), std::env::var_os(name)?)))
                .collect(),
        }
    }
}

impl SystemGit {
    /// Git with the [`PASSTHROUGH_ENV`] subset of the runtime `env` (the
    /// resolved config env, not the process's). PATH falls back to the
    /// process's when `env` has none, so git can still be found.
    pub fn with_env(env: &std::collections::BTreeMap<String, String>) -> Self {
        let mut passthrough: Vec<(String, OsString)> = PASSTHROUGH_ENV
            .iter()
            .filter_map(|name| {
                let value = env.get(*name).filter(|value| !value.is_empty())?;
                Some(((*name).to_owned(), OsString::from(value)))
            })
            .collect();
        if !passthrough.iter().any(|(name, _)| name == "PATH")
            && let Some(path) = std::env::var_os("PATH")
        {
            passthrough.push(("PATH".to_owned(), path));
        }
        Self {
            executable: PathBuf::from("git"),
            passthrough,
        }
    }

    #[cfg(test)]
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            ..Self::default()
        }
    }
}

/// The header value git builds from the helper's answers: HTTP Basic with the
/// `x-access-token` user.
fn basic_credential(token: &str) -> String {
    STANDARD.encode(format!("x-access-token:{token}"))
}

impl SystemGit {
    /// An isolated git invocation: no user or system config, no prompts or
    /// hooks, and the credential (when any) answered by `askpass` alone.
    fn command(
        &self,
        request: &GitRunRequest<'_>,
        git_home: &Path,
        askpass: Option<&AskPass>,
    ) -> Command {
        let mut command = Command::new(&self.executable);
        command
            .env_clear()
            .env("HOME", git_home)
            .env("XDG_CONFIG_HOME", git_home)
            .env("GIT_CONFIG_GLOBAL", null_device())
            .env("GIT_CONFIG_SYSTEM", null_device())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("LC_ALL", "C")
            .env("LANG", "C")
            .arg("-c")
            .arg(format!("core.hooksPath={}", null_device()))
            .args(&request.args);
        command.envs(self.passthrough.iter().map(|(name, value)| (name, value)));
        if let Some(askpass) = askpass {
            // The path to a helper, never the token: the child's environment
            // and argv are readable by other processes of the same user.
            command.env("GIT_ASKPASS", &askpass.script);
        }
        command
    }
}

/// An owner-only GIT_ASKPASS helper for one git run, removed on drop. Git
/// asks it only after the server challenges; it answers with the
/// `x-access-token` user and the token for the authorized origin, and with
/// nothing (a failure) for any other prompt, so a redirect to another host
/// never receives the credential.
struct AskPass {
    directory: PathBuf,
    script: PathBuf,
}

impl AskPass {
    fn create(parent: &Path, token: &str, url: &str) -> Result<Self, CloneError> {
        let failed = |reason: String| {
            CloneError::new(
                "gitFailed",
                format!("Failed to create the Git credential helper: {reason}"),
            )
        };
        let url = url::Url::parse(url).map_err(|error| failed(error.to_string()))?;
        let host = url
            .host_str()
            .ok_or_else(|| failed("the authorized URL names no host".into()))?;
        let authority = match url.port() {
            Some(port) => format!("{host}:{port}"),
            None => host.to_owned(),
        };
        let scheme = url.scheme();
        let mut nonce = [0_u8; 16];
        getrandom::fill(&mut nonce).map_err(|error| failed(error.to_string()))?;
        let directory = parent.join(format!("askpass-{}", hex::encode(nonce)));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
        builder
            .create(&directory)
            .map_err(|error| failed(error.to_string()))?;
        let helper = Self {
            script: directory.join("askpass"),
            directory,
        };
        let body = format!(
            "#!/bin/sh\ncase \"$1\" in\n\
             {user}*) printf '%s\\n' x-access-token ;;\n\
             {password}*) printf '%s\\n' {token} ;;\n\
             *) exit 1 ;;\n\
             esac\n",
            user = shell_quote(&format!("Username for '{scheme}://{authority}'")),
            password = shell_quote(&format!(
                "Password for '{scheme}://x-access-token@{authority}'"
            )),
            token = shell_quote(token),
        );
        let mut file = crate::private_file::create_new(&helper.script, 0o700)
            .map_err(|error| failed(error.to_string()))?;
        std::io::Write::write_all(&mut file, body.as_bytes())
            .map_err(|error| failed(error.to_string()))?;
        drop(file);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&helper.script, std::fs::Permissions::from_mode(0o700))
                .map_err(|error| failed(error.to_string()))?;
        }
        Ok(helper)
    }
}

impl Drop for AskPass {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

/// `text` as one single-quoted POSIX shell word.
fn shell_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

impl GitRunner for SystemGit {
    fn run(
        &self,
        request: &GitRunRequest<'_>,
        control: &GitRunControl<'_>,
    ) -> Result<GitOutput, CloneError> {
        control
            .cancellation
            .check()
            .map_err(|message| CloneError::new("cancelled", message))?;
        if Instant::now() >= control.deadline {
            return Err(CloneError::new(
                "timeout",
                "Clone request deadline elapsed before Git execution.",
            ));
        }
        let git_tmp = control.cache_home.join("tmp");
        let git_home = git_tmp.join("git-home");
        std::fs::create_dir_all(&git_home).map_err(|error| {
            CloneError::new(
                "gitFailed",
                format!("Failed to create isolated Git home: {error}"),
            )
        })?;
        let askpass = match (request.authorization, request.authorization_url) {
            (Some(token), Some(url)) => Some(AskPass::create(&git_tmp, token, url)?),
            _ => None,
        };
        let timeout = request
            .timeout
            .min(control.deadline.saturating_duration_since(Instant::now()));
        let output = run_bounded(
            self.command(request, &git_home, askpass.as_ref()),
            &format!("git {}", request.label),
            timeout,
            MAX_OUTPUT_BYTES,
            control.cancellation,
        )
        .map_err(|error| match error {
            BoundedError::Cancelled(message) => CloneError::new("cancelled", message),
            BoundedError::TimedOut(_) => CloneError::new(
                "timeout",
                format!("git {} exceeded its execution deadline", request.label),
            ),
            BoundedError::Failed(message) => CloneError::new("gitFailed", message),
        })?;
        drop(askpass);
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = scrub(
            &String::from_utf8_lossy(&output.stderr),
            request.authorization,
            control.cache_home,
        );
        if !output.status.success() {
            let suffix = if stderr.trim().is_empty() {
                String::new()
            } else {
                format!(": {}", stderr.trim())
            };
            return Err(CloneError::new(
                "gitFailed",
                format!("git {} failed{suffix}", request.label),
            ));
        }
        Ok(GitOutput { stdout, stderr })
    }
}

fn scrub(text: &str, token: Option<&str>, home: &Path) -> String {
    let mut result = text.to_owned();
    if let Some(token) = token {
        // The base64 header value git builds first: it does not contain the
        // token, and git can echo it without the `Authorization:` prefix.
        result = result
            .replace(&basic_credential(token), "[REDACTED]")
            .replace(token, "[REDACTED]");
    }
    // A checkout stage is an internal path under the Octocode home; the
    // error names what failed, not where it was staged.
    let stages = [Some(home.to_path_buf()), home.canonicalize().ok()];
    for home in stages.into_iter().flatten() {
        let stage = home.join("tmp").join("clone-tmp");
        let pattern = format!(r"{}[^\s'\x22]*", regex::escape(&stage.to_string_lossy()));
        if let Ok(stage) = regex::Regex::new(&pattern) {
            result = stage.replace_all(&result, "<checkout>").into_owned();
        }
    }
    // Redact any authorization header regardless of scheme. Git sends the
    // helper's answers as `Authorization: Basic <base64(x-access-token:…)>`;
    // the base64 form does NOT contain the plaintext token, so this header
    // pattern — not the token replace above — stops a reversible credential
    // from leaking if git echoes a request.
    static AUTH: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        #[allow(clippy::expect_used)]
        regex::Regex::new(r"(?i)Authorization:\s*(Bearer|token|Basic)\s+\S+")
            .expect("static authorization regex")
    });
    AUTH.replace_all(&result, "Authorization: [REDACTED]")
        .into_owned()
}

#[cfg(windows)]
fn null_device() -> &'static str {
    "NUL"
}

#[cfg(not(windows))]
fn null_device() -> &'static str {
    "/dev/null"
}

#[cfg(test)]
mod env_and_scrub_tests {
    use super::*;
    use std::collections::BTreeMap;

    fn envs(command: &Command) -> BTreeMap<String, Option<String>> {
        command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|value| value.to_string_lossy().into_owned()),
                )
            })
            .collect()
    }

    fn request() -> GitRunRequest<'static> {
        GitRunRequest {
            args: vec![OsString::from("--version")],
            timeout: Duration::from_secs(1),
            label: "test".into(),
            authorization: None,
            authorization_url: None,
        }
    }

    /// The isolated git keeps the runtime's proxy and CA settings (a
    /// corporate network needs them) and its PATH, but nothing else.
    #[test]
    fn isolated_git_keeps_runtime_proxy_ca_and_path_only() {
        let runtime_env = BTreeMap::from(
            [
                ("HTTPS_PROXY", "http://proxy.corp:3128"),
                ("no_proxy", "internal.corp"),
                ("SSL_CERT_FILE", "/etc/corp-ca.pem"),
                ("GIT_SSL_CAINFO", "/etc/corp-ca.pem"),
                ("PATH", "/runtime/bin"),
                ("GIT_SSL_NO_VERIFY", "1"),
                ("GITHUB_TOKEN", "ghp_secret"),
            ]
            .map(|(key, value)| (key.to_owned(), value.to_owned())),
        );
        let git = SystemGit::with_env(&runtime_env);
        let envs = envs(&git.command(&request(), Path::new("/tmp/git-home"), None));
        let get = |key: &str| envs.get(key).cloned().flatten();
        assert_eq!(
            get("HTTPS_PROXY").as_deref(),
            Some("http://proxy.corp:3128")
        );
        assert_eq!(get("no_proxy").as_deref(), Some("internal.corp"));
        assert_eq!(get("SSL_CERT_FILE").as_deref(), Some("/etc/corp-ca.pem"));
        assert_eq!(get("GIT_SSL_CAINFO").as_deref(), Some("/etc/corp-ca.pem"));
        assert_eq!(get("PATH").as_deref(), Some("/runtime/bin"));
        assert_eq!(get("GIT_SSL_NO_VERIFY"), None);
        assert_eq!(get("GITHUB_TOKEN"), None);
    }

    /// The token reaches git only through an owner-only GIT_ASKPASS
    /// helper that answers for the authorized origin alone. It is in neither
    /// the child's environment nor its argv, and the helper is gone once git
    /// exits.
    #[cfg(unix)]
    #[test]
    fn the_token_reaches_git_only_through_an_owner_only_askpass_helper() {
        use std::os::unix::fs::PermissionsExt;
        let home = tempfile::tempdir().expect("home");
        let dump = home.path().join("dump");
        let script = home.path().join("git");
        std::fs::write(
            &script,
            format!(
                concat!(
                    "#!/bin/sh\n{{\n",
                    "env; printf 'arg:%s\\n' \"$@\"\n",
                    "printf 'askpass:%s\\n' \"$GIT_ASKPASS\"\n",
                    "ls -ld \"$GIT_ASKPASS\" \"$(dirname \"$GIT_ASKPASS\")\" | sed 's/^/mode:/'\n",
                    "printf 'user:%s\\n' \"$(\"$GIT_ASKPASS\" \"Username for 'https://github.com': \")\"\n",
                    "printf 'pass:%s\\n' \"$(\"$GIT_ASKPASS\" \"Password for 'https://x-access-token@github.com': \")\"\n",
                    "printf 'other:%s\\n' \"$(\"$GIT_ASKPASS\" \"Password for 'https://x-access-token@evil.example': \")\"\n",
                    "}} > '{}'\n"
                ),
                dump.display()
            ),
        )
        .expect("fixture git");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).expect("chmod");
        let token = "ghp_secretToken123";
        SystemGit::new(&script)
            .run(
                &GitRunRequest {
                    args: vec!["clone".into(), "https://github.com/owner/repo.git".into()],
                    timeout: Duration::from_secs(10),
                    label: "askpass fixture".into(),
                    authorization: Some(token),
                    authorization_url: Some("https://github.com/owner/repo.git"),
                },
                &GitRunControl {
                    cancellation: &crate::tools::cancel::NeverCancel,
                    deadline: Instant::now() + Duration::from_secs(15),
                    cache_home: home.path(),
                },
            )
            .expect("fixture runs");
        let dump = std::fs::read_to_string(&dump).expect("dump");
        let (answers, child): (Vec<&str>, Vec<&str>) = dump.lines().partition(|line| {
            line.starts_with("user:") || line.starts_with("pass:") || line.starts_with("other:")
        });
        let child = child.join("\n");
        assert!(!child.contains(token), "{child}");
        assert!(!child.contains(&basic_credential(token)), "{child}");
        assert!(!child.contains("GIT_CONFIG_VALUE"), "{child}");
        assert_eq!(
            answers,
            ["user:x-access-token", &format!("pass:{token}"), "other:"],
            "the helper answers only for the authorized origin"
        );
        let modes: Vec<&str> = child
            .lines()
            .filter_map(|line| line.strip_prefix("mode:"))
            .collect();
        assert_eq!(modes.len(), 2, "{child}");
        assert!(
            modes
                .iter()
                .all(|mode| mode.get(1..10) == Some("rwx------")),
            "{modes:?}"
        );
        let helper = child
            .lines()
            .find_map(|line| line.strip_prefix("askpass:"))
            .expect("GIT_ASKPASS set");
        assert!(
            !Path::new(helper).exists(),
            "helper removed after git exits"
        );
    }

    /// Git may echo the injected header value without its
    /// `Authorization:` prefix; the bare base64 form is reversible.
    #[test]
    fn scrub_redacts_the_bare_basic_credential() {
        let basic = basic_credential("ghp_token123");
        let text = format!("fatal: config value {basic} rejected; token ghp_token123");
        let scrubbed = scrub(&text, Some("ghp_token123"), Path::new("/nonexistent-home"));
        assert!(!scrubbed.contains(&basic), "{scrubbed}");
        assert!(!scrubbed.contains("ghp_token123"), "{scrubbed}");
    }
}

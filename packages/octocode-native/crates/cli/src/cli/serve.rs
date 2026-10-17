//! Warm CLI tool calls: `octocode serve`.
//!
//! What a user sees (which calls run on a server, what keys it, the
//! limits, the fallbacks) is the crate README's "Warm tool server"
//! section. This module keeps those promises:
//!
//! - A socket name hashes [`exe_identity`], [`workspace_of`] and
//!   [`call_identity`], so any change of them reaches a fresh server and no
//!   secret appears in a name. The engine's [`PROCESS_ENV`] lists what it
//!   reads from the server's own process, which a call cannot bring.
//! - A request carries the client's working directory, environment
//!   ([`served_env`]) and call identity. [`Daemon::runtime_for`] keeps a
//!   runtime per directory and [`env_digest`] ([`MAX_RUNTIMES`], least
//!   recently used out), built off the socket thread, one build per key,
//!   all on one language-server pool. A runtime whose identity differs is
//!   rebuilt; a call that still cannot match gets a `fallback` reply.
//!   `octocode auth login`/`logout` stop every server ([`stop_all`]).
//! - Only [`runs_on_server`] tools are sent. The reply is the call as
//!   printed in process ([`Printed`]) plus the notices raised in the call's
//!   own [`octocode_io::notice::Scope`], which its row work carries to
//!   other threads; the client prints its own configuration warnings.
//! - [`MAX_SERVERS`] per socket directory, least recently asked ([`touch`])
//!   stopped first; a [`STOP`] request drains the calls taken. The server
//!   exits after [`IDLE_EXIT`] without a request.
//! - A failed exchange falls back to an in-process call and says so; no
//!   reply within [`REPLY_DEADLINE`] answers `timeout`, never a second run.
//!   Ctrl-C half-closes the client's side, which cancels the call on the
//!   server; the client drains, and a second Ctrl-C stops waiting.
//!
//! [`PROCESS_ENV`]: octocode_engine::process_env::PROCESS_ENV

#[cfg(unix)]
use super::Printed;
use octocode_native::tools::id::ToolId;
use serde_json::Value;
#[cfg(unix)]
use serde_json::json;
#[cfg(unix)]
use std::collections::BTreeMap;
#[cfg(unix)]
use std::path::{Path, PathBuf};

/// The server exits after this long without a request.
#[cfg(unix)]
const IDLE_EXIT: std::time::Duration = std::time::Duration::from_secs(600);
/// Largest request line a client may send; longer lines are refused unbuffered.
#[cfg(unix)]
const MAX_REQUEST_BYTES: u64 = 16 * 1024 * 1024;
/// Largest reply the client accepts from a server; a longer one falls back to
/// running the tool in this process, like any other failed exchange.
#[cfg(unix)]
const MAX_RESPONSE_BYTES: u64 = 64 * 1024 * 1024;
/// Connections served at once; a connection over the cap is closed at accept.
#[cfg(unix)]
const MAX_CONNECTIONS: usize = 64;
/// Working directories (by environment) a server keeps a runtime for.
#[cfg(unix)]
const MAX_RUNTIMES: usize = 8;
/// Servers one user keeps running in one socket directory.
#[cfg(unix)]
const MAX_SERVERS: usize = 4;
/// The request line that asks a server to stop.
#[cfg(unix)]
const STOP: &[u8] = b"{\"stop\":true}\n";
/// Pause after a failed accept (for example EMFILE) so the loop cannot spin.
#[cfg(unix)]
const ACCEPT_BACKOFF: std::time::Duration = std::time::Duration::from_millis(100);
/// How long a client waits for the reply: the server's own request budget
/// plus a margin, so a server that ran out of time has said so first. Past
/// it the call is over; running it again in process would double the wait.
#[cfg(unix)]
const REPLY_DEADLINE: std::time::Duration =
    octocode_native::runtime::DEFAULT_TIMEOUT.saturating_add(std::time::Duration::from_secs(15));

/// Whether `tool` runs on the warm server: every read-only tool. A tool
/// that writes the clone cache or the user's files runs in process.
pub(super) const fn runs_on_server(tool: ToolId) -> bool {
    match tool {
        ToolId::GhCloneRepo | ToolId::AstRewrite => false,
        ToolId::Clasify
        | ToolId::GhSearchRepo
        | ToolId::GhSearchCode
        | ToolId::GhStructure
        | ToolId::GhGetFileContent
        | ToolId::GhSearchHistory
        | ToolId::GhGetHistoryItem
        | ToolId::ArtifactSearch
        | ToolId::LocalSearch
        | ToolId::StructureSearch
        | ToolId::AstSearch
        | ToolId::AstTopology
        | ToolId::LocalFetch
        | ToolId::LspSearch => true,
    }
}

/// Why an exchange with a server produced no printed call.
#[cfg(unix)]
#[derive(Debug, PartialEq, Eq)]
enum Failed {
    /// The server closed, refused, or sent no reply line: the call has not
    /// run here, so it runs in process.
    Fallback(String),
    /// No reply within the deadline.
    Deadline,
    /// Ctrl-C: the server was told to cancel, then drained or abandoned.
    Interrupted(super::Interrupted),
}

/// Read one request line of at most `limit` bytes from `reader`, leaving the
/// rest buffered; `None` at end of stream, on error, or when the line is longer
/// than the limit.
#[cfg(unix)]
async fn read_line_bounded<R>(reader: &mut R, limit: u64) -> Option<String>
where
    R: tokio::io::AsyncBufRead + Unpin,
{
    use tokio::io::{AsyncBufReadExt, AsyncReadExt};
    let mut bounded = (&mut *reader).take(limit + 1);
    let mut line = String::new();
    let read = bounded.read_line(&mut line).await.ok()?;
    (read > 0 && read as u64 <= limit).then_some(line)
}

/// Run `tool` through the workspace's server when one is reachable or can
/// be started, and print it: the exit code. `None` means the caller runs it
/// in process.
#[cfg(unix)]
pub(super) async fn call(tool: &str, input: &Value, json_out: bool) -> Option<u8> {
    let target = target()?;
    let mut stream = match connect(&target.socket).await {
        Some(stream) => stream,
        None => {
            spawn_server(&target.socket, &target.workspace)?;
            wait_for(&target.socket).await?
        }
    };
    let request = Request {
        tool,
        input,
        json_out,
        cwd: &target.cwd,
        env: &target.env,
        identity: &target.identity,
    };
    // An in-process call prints its configuration warnings at start.
    let warn = || octocode_native::runtime::ToolRuntime::print_startup_diagnostics(&target.config);
    let interrupted = || {
        warn();
        eprintln!("{}", super::CANCELLING);
    };
    let first = async {
        if tokio::signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    };
    let exchanged = exchange(
        &mut stream,
        &request,
        REPLY_DEADLINE,
        first,
        tokio::signal::ctrl_c(),
        interrupted,
    )
    .await;
    let (printed, notices) = match exchanged {
        Ok(reply) => (reply.printed, reply.notices),
        Err(Failed::Fallback(reason)) => {
            eprintln!("octocode: warm server failed ({reason}); running {tool} in process.");
            return None;
        }
        Err(Failed::Interrupted(_)) => return Some(130),
        Err(Failed::Deadline) => (
            Printed::finish(
                tool,
                Err(octocode_native::runtime::RuntimeError {
                    code: "timeout".into(),
                    message: format!(
                        "The warm server sent no {tool} reply within {} s; the call was not run again in process.",
                        REPLY_DEADLINE.as_secs()
                    ),
                    payload: None,
                    validation_issues: None,
                }),
                json_out,
            ),
            Vec::new(),
        ),
    };
    warn();
    // What the call said on stderr while it ran, as in process.
    for notice in notices {
        eprintln!("{notice}");
    }
    Some(printed.print())
}

/// A server's answer: the call as printed, and the notices it raised
/// ([`octocode_io::notice`]), which an in-process call prints on stderr.
#[cfg(unix)]
#[derive(Debug, PartialEq, Eq)]
struct Reply {
    printed: Printed,
    notices: Vec<String>,
}

#[cfg(not(unix))]
pub(super) async fn call(_tool: &str, _input: &Value, _json_out: bool) -> Option<u8> {
    None
}

/// One call as sent to a server.
#[cfg(unix)]
struct Request<'a> {
    tool: &'a str,
    input: &'a Value,
    /// The output mode the server renders in.
    json_out: bool,
    /// The client's working directory: the server runs the call as a CLI
    /// started there.
    cwd: &'a Path,
    /// The client's environment ([`served_env`]): the call runs with it.
    /// The socket is the owner's only, so its secrets stay with the user.
    env: &'a BTreeMap<String, String>,
    /// The client's [`call_identity`]: the server answers only under it.
    identity: &'a str,
}

/// Where and as what a call goes to a server.
#[cfg(unix)]
struct Target {
    socket: PathBuf,
    /// The working directory, in its symlink-resolved form.
    cwd: PathBuf,
    /// The directory a newly started server runs in.
    workspace: PathBuf,
    env: BTreeMap<String, String>,
    identity: String,
    /// The configuration this call resolved, for its warnings.
    config: octocode_native::config::ConfigOutput,
}

/// The server for this call, or `None` when it must not be used: memory
/// storage (by choice, silent), or a location that is unsafe or too long
/// for a socket (stated on stderr, then in process).
#[cfg(unix)]
fn target() -> Option<Target> {
    use octocode_native::config::{
        RuntimeSurface, acquire_config_input, is_persistent_storage_enabled, resolve_config,
    };
    let cwd = same_dir_form(&std::env::current_dir().ok()?);
    let os_home = std::env::home_dir()?;
    let env = served_env(octocode_io::env::vars_lossy());
    let input = acquire_config_input(env.clone(), cwd.clone(), os_home, RuntimeSurface::Cli);
    let config = resolve_config(&input);
    if !is_persistent_storage_enabled(&config.resolved) {
        return None;
    }
    let identity = call_identity(&config, &env);
    let workspace = workspace_of(&cwd);
    let key = server_key(&exe_identity()?, &workspace, &identity);
    let socket = socket_in(&std::env::temp_dir(), &key)
        .map_err(|reason| {
            eprintln!("octocode: warm server unavailable ({reason}); running in process.");
        })
        .ok()?;
    Some(Target {
        socket,
        cwd,
        workspace,
        env,
        identity,
        config,
    })
}

/// The variables a shell's `cd` sets to name its working directories
/// (POSIX `cd`: `PWD`, `OLDPWD`). A server answers for many directories, a
/// call's own travels as its `cwd`, and no setting or tool reads them.
#[cfg(unix)]
const SHELL_DIRECTORY_ENV: &[&str] = &["PWD", "OLDPWD"];

/// The environment a call runs with on a server, and the one its identity
/// and runtime are keyed by: `env` without [`SHELL_DIRECTORY_ENV`]. The
/// config identity covers `PWD`, so with it two directories of one
/// repository would never share a server; and `OLDPWD` changes after every
/// `cd`, so with it one directory would get a new runtime (a config
/// resolve, an empty credential memo) per `cd`.
#[cfg(unix)]
fn served_env(mut env: BTreeMap<String, String>) -> BTreeMap<String, String> {
    env.retain(|name, _| !SHELL_DIRECTORY_ENV.contains(&name.as_str()));
    env
}

/// A digest of what a server shares between the calls it answers: the
/// config module's identity, every `OCTOCODE_*` variable, and the variables
/// the engine reads from the server's own process instead of the call's
/// environment ([`PROCESS_ENV`], [`octocode_io::http::NETWORK_ENV`]).
///
/// [`PROCESS_ENV`]: octocode_engine::process_env::PROCESS_ENV
#[cfg(unix)]
fn call_identity(
    config: &octocode_native::config::ConfigOutput,
    env: &BTreeMap<String, String>,
) -> String {
    use std::fmt::Write as _;
    let mut identity = config.identity_digest();
    for (name, value) in env {
        let name = name.as_str();
        if octocode_io::http::NETWORK_ENV.contains(&name)
            || octocode_engine::process_env::declares(name)
            || name.starts_with("OCTOCODE_")
        {
            let _ = write!(identity, "\n{name}={value}");
        }
    }
    octocode_engine::digest::sha256(identity.as_bytes())
}

/// A digest of a whole environment: the runtimes a server keeps are told
/// apart by it, so a call never runs with another call's environment.
#[cfg(unix)]
fn env_digest(env: &BTreeMap<String, String>) -> String {
    let mut text = String::new();
    for (name, value) in env {
        text.push_str(name);
        text.push('\0');
        text.push_str(value);
        text.push('\0');
    }
    octocode_engine::digest::sha256(text.as_bytes())
}

/// The workspace `cwd` belongs to: its nearest ancestor holding `.git`, else
/// `cwd` itself.
#[cfg(unix)]
fn workspace_of(cwd: &Path) -> PathBuf {
    cwd.ancestors()
        .find(|dir| dir.join(".git").exists())
        .unwrap_or(cwd)
        .to_path_buf()
}

/// This binary by path, size and modification time: a rebuild is another
/// build.
#[cfg(unix)]
fn exe_identity() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let meta = std::fs::metadata(&exe).ok()?;
    let built = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |age| age.as_nanos());
    Some(format!("{}|{}|{built}", exe.display(), meta.len()))
}

/// 16 hex digits over the build, the workspace and the call identity.
#[cfg(unix)]
fn server_key(exe: &str, workspace: &Path, identity: &str) -> String {
    let key = format!("{exe}\n{}\n{identity}", workspace.display());
    octocode_engine::digest::sha256(key.as_bytes())[..16].to_owned()
}

/// Send one request and read the printed call back within `deadline`.
/// `first` is the first interrupt: it calls `interrupted`, closes the
/// request side (the server cancels), then waits for the server to finish
/// unless `second` arrives first.
#[cfg(unix)]
async fn exchange(
    stream: &mut tokio::net::UnixStream,
    request: &Request<'_>,
    deadline: std::time::Duration,
    first: impl std::future::Future<Output = ()>,
    second: impl std::future::Future,
    interrupted: impl FnOnce(),
) -> Result<Reply, Failed> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
    let fallback = |reason: &str| Failed::Fallback(reason.to_owned());
    let mut line = json!({
        "tool": request.tool,
        "input": request.input,
        "json": request.json_out,
        "cwd": request.cwd,
        "env": request.env,
        "identity": request.identity,
    })
    .to_string();
    line.push('\n');
    let (read, mut write) = stream.split();
    write
        .write_all(line.as_bytes())
        .await
        .map_err(|error| Failed::Fallback(format!("request not sent: {error}")))?;
    let mut reader = BufReader::new(read);
    let response = tokio::select! {
        response = tokio::time::timeout(
            deadline,
            read_line_bounded(&mut reader, MAX_RESPONSE_BYTES),
        ) => response.map_err(|_| Failed::Deadline)?.ok_or_else(|| {
            fallback("it closed without a reply, or the reply was over the size limit")
        })?,
        () = first => {
            interrupted();
            let _ = write.shutdown().await;
            let finished = async {
                let mut rest = (&mut reader).take(MAX_RESPONSE_BYTES);
                let _ = tokio::io::copy(&mut rest, &mut tokio::io::sink()).await;
            };
            return Err(Failed::Interrupted(
                super::drain_after_interrupt(finished, second).await,
            ));
        }
    };
    let reply =
        serde_json::from_str::<Value>(&response).map_err(|_| fallback("the reply was not JSON"))?;
    if let Some(reason) = reply.get("fallback").and_then(Value::as_str) {
        return Err(fallback(reason));
    }
    let notices = reply["notices"]
        .as_array()
        .map(|notices| {
            notices
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let printed =
        Printed::from_json(reply).ok_or_else(|| fallback("the reply was not a printed call"))?;
    Ok(Reply { printed, notices })
}

#[cfg(unix)]
async fn connect(socket: &Path) -> Option<tokio::net::UnixStream> {
    tokio::net::UnixStream::connect(socket).await.ok()
}

/// Wait up to two seconds for a just-started server to bind its socket.
#[cfg(unix)]
async fn wait_for(socket: &Path) -> Option<tokio::net::UnixStream> {
    for _ in 0..400 {
        if let Some(stream) = connect(socket).await {
            return Some(stream);
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    None
}

/// Start `octocode serve --socket <path>` in `workspace`, detached from this
/// process: its own session, no inherited stdio (a caller capturing our
/// output must not wait for the server). It inherits this process's
/// environment, as the in-process call would have run with.
#[cfg(unix)]
fn spawn_server(socket: &Path, workspace: &Path) -> Option<()> {
    use std::os::unix::process::CommandExt;
    let exe = std::env::current_exe().ok()?;
    let mut command = std::process::Command::new(exe);
    command
        .arg("serve")
        .arg("--socket")
        .arg(socket)
        .current_dir(workspace)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    // SAFETY: setsid is async-signal-safe and touches only the child.
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    command.spawn().ok().map(|_| ())
}

/// This user's socket directory under `temp`, and the user.
#[cfg(unix)]
fn socket_dir(temp: &Path) -> (PathBuf, u32) {
    // SAFETY: getuid has no preconditions.
    let uid = unsafe { libc::getuid() };
    (temp.join(format!("octocode-{uid}")), uid)
}

/// The socket for `key` in this user's private directory under `temp`, or
/// why it cannot be used. The length limit is the platform's own
/// (`sockaddr_un`, 104 bytes on macOS, 108 on Linux).
#[cfg(unix)]
fn socket_in(temp: &Path, key: &str) -> Result<PathBuf, String> {
    let (dir, uid) = socket_dir(temp);
    let socket = dir.join(format!("serve-{key}.sock"));
    if std::os::unix::net::SocketAddr::from_pathname(&socket).is_err() {
        return Err(format!("socket path too long: {}", socket.display()));
    }
    private_dir(&dir, uid)
        .ok_or_else(|| format!("{} is not a private directory of this user", dir.display()))?;
    Ok(socket)
}

/// A directory only user `uid` can enter, created when missing.
#[cfg(unix)]
fn private_dir(dir: &Path, uid: u32) -> Option<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
    if !dir.exists() {
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .ok()?;
    }
    let meta = std::fs::symlink_metadata(dir).ok()?;
    (meta.is_dir() && meta.uid() == uid && meta.permissions().mode() & 0o077 == 0).then_some(())
}

/// Ask every server of this user to stop: a login or logout changes the
/// credential a server may still remember, so the next call starts a fresh
/// one. Each server finishes the calls it has.
#[cfg(unix)]
pub(super) fn stop_all() {
    let (dir, uid) = socket_dir(&std::env::temp_dir());
    if dir.exists() && private_dir(&dir, uid).is_some() {
        stop_in(&dir);
    }
}

/// Ask every live server with a socket in `dir` to stop.
#[cfg(unix)]
fn stop_in(dir: &Path) {
    for (_, stream) in live_servers(dir, None) {
        ask_to_stop(stream);
    }
}

#[cfg(not(unix))]
pub(super) fn stop_all() {}

/// The server sockets in `dir` other than `own`, each with a connection to
/// the server answering on it. A socket nobody answers on (its server was
/// killed before its idle exit) is removed.
#[cfg(unix)]
fn live_servers(dir: &Path, own: Option<&Path>) -> Vec<(PathBuf, std::os::unix::net::UnixStream)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut live = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_socket = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("serve-") && name.ends_with(".sock"));
        if !is_socket || own == Some(path.as_path()) {
            continue;
        }
        match std::os::unix::net::UnixStream::connect(&path) {
            Ok(stream) => live.push((path, stream)),
            Err(_) => {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    live
}

/// Ask the server on `stream` to stop.
#[cfg(unix)]
fn ask_to_stop(mut stream: std::os::unix::net::UnixStream) {
    use std::io::Write as _;
    let _ = stream.write_all(STOP);
}

/// When a server starts: remove the sibling sockets nobody answers on, and
/// ask the least recently asked live servers past [`MAX_SERVERS`] (this one
/// counted) to stop.
#[cfg(unix)]
fn prune_siblings(own: &Path) {
    let Some(dir) = own.parent() else { return };
    let mut live = live_servers(dir, Some(own));
    live.sort_by_cached_key(|(path, _)| std::cmp::Reverse(last_asked(path)));
    for (_, stream) in live.into_iter().skip(MAX_SERVERS.saturating_sub(1)) {
        ask_to_stop(stream);
    }
}

/// When the server on `socket` was last asked anything ([`touch`]).
#[cfg(unix)]
fn last_asked(socket: &Path) -> Option<std::time::SystemTime> {
    std::fs::symlink_metadata(socket)
        .and_then(|meta| meta.modified())
        .ok()
}

/// Mark `socket` as just asked: its modification time orders servers for
/// [`prune_siblings`].
#[cfg(unix)]
fn touch(socket: &Path) {
    use std::os::unix::ffi::OsStrExt;
    let Ok(path) = std::ffi::CString::new(socket.as_os_str().as_bytes()) else {
        return;
    };
    // SAFETY: `path` is NUL-terminated and outlives the call; null times
    // set both times to now.
    unsafe {
        libc::utimes(path.as_ptr(), std::ptr::null());
    }
}

/// `octocode serve --socket <path>`: answer requests until idle.
#[cfg(unix)]
pub(super) async fn run(socket: &Path) -> u8 {
    tokio::task::LocalSet::new()
        .run_until(serve(socket.to_owned()))
        .await
}

#[cfg(not(unix))]
pub(super) async fn run(_socket: &std::path::Path) -> u8 {
    super::emit_error(
        "toolUnavailable",
        "octocode serve needs Unix sockets.",
        false,
    );
    2
}

/// A runtime a server keeps for one working directory and environment,
/// with the identity it was built under.
#[cfg(unix)]
struct Served {
    runtime: octocode_native::runtime::ToolRuntime,
    identity: String,
}

/// Values by key, at most `cap` of them; the least recently used leaves
/// first.
#[cfg(unix)]
struct Recent<K, V> {
    cap: usize,
    /// Least recently used first.
    entries: Vec<(K, V)>,
}

#[cfg(unix)]
impl<K: PartialEq, V> Recent<K, V> {
    fn new(cap: usize) -> Self {
        Self {
            cap,
            entries: Vec::new(),
        }
    }

    /// The value at `key`, now the most recently used.
    fn get(&mut self, key: &K) -> Option<&V> {
        let at = self.entries.iter().position(|(k, _)| k == key)?;
        let entry = self.entries.remove(at);
        self.entries.push(entry);
        self.entries.last().map(|(_, value)| value)
    }

    /// Put `value` at `key`, replacing any value there; the evicted value
    /// when the cap is passed.
    fn insert(&mut self, key: K, value: V) -> Option<V> {
        self.entries.retain(|(k, _)| *k != key);
        self.entries.push((key, value));
        (self.entries.len() > self.cap).then(|| self.entries.remove(0).1)
    }

    fn drain(&mut self) -> Vec<V> {
        self.entries.drain(..).map(|(_, value)| value).collect()
    }
}

/// How a server builds a runtime:
/// `ToolRuntime::from_host_with_lsp_pool`, which a test slows down.
#[cfg(unix)]
type Build =
    fn(
        octocode_native::runtime::HostOptions,
        std::sync::Arc<octocode_engine::lsp::pool::LspClientPool>,
    )
        -> Result<octocode_native::runtime::ToolRuntime, octocode_native::runtime::RuntimeError>;

/// A kept runtime's working directory and the [`env_digest`] of the
/// environment it runs with.
#[cfg(unix)]
type RuntimeKey = (PathBuf, String);

/// A server's state: its socket, one language-server pool, and the
/// runtimes of the directories and environments it serves.
#[cfg(unix)]
struct Daemon {
    /// The socket this server answers on; its modification time is the
    /// last request ([`touch`]).
    socket: PathBuf,
    lsp_pool: std::sync::Arc<octocode_engine::lsp::pool::LspClientPool>,
    runtimes: std::cell::RefCell<Recent<RuntimeKey, std::rc::Rc<Served>>>,
    /// One build per key at a time: a call that waited finds it built.
    building: octocode_io::flight::KeyedFlight<RuntimeKey, ()>,
    build: Build,
    /// A [`STOP`] request arrived.
    stop: tokio::sync::Notify,
}

#[cfg(unix)]
impl Daemon {
    fn new(socket: PathBuf) -> Self {
        Self::with_build(
            socket,
            octocode_native::runtime::ToolRuntime::from_host_with_lsp_pool,
        )
    }

    fn with_build(socket: PathBuf, build: Build) -> Self {
        Self {
            socket,
            lsp_pool: std::sync::Arc::default(),
            runtimes: std::cell::RefCell::new(Recent::new(MAX_RUNTIMES)),
            building: octocode_io::flight::KeyedFlight::transient(),
            build,
            stop: tokio::sync::Notify::new(),
        }
    }

    /// The runtime for a call from `cwd` with `env` under `identity`: the
    /// kept one when its identity is the call's, else a new one built as a
    /// CLI started in `cwd` with `env` would be. `Err` (the reason) when
    /// even that one differs.
    async fn runtime_for(
        &self,
        cwd: &Path,
        env: BTreeMap<String, String>,
        identity: &str,
    ) -> Result<std::rc::Rc<Served>, String> {
        let key = (same_dir_form(cwd), env_digest(&env));
        let ticket = self.building.join(key.clone());
        let _turn = ticket.turn().await;
        if let Some(served) = self.runtimes.borrow_mut().get(&key)
            && served.identity == identity
        {
            return Ok(std::rc::Rc::clone(served));
        }
        let host = octocode_native::runtime::HostOptions {
            cwd: Some(key.0.clone()),
            env: Some(env.clone()),
            ..super::cli_host()
        };
        let (build, pool) = (self.build, std::sync::Arc::clone(&self.lsp_pool));
        // Off this thread, which serves every connection: a build reads the
        // config files and may run the daily cache sweep.
        let not_started = "its runtime for this directory did not start";
        let runtime = tokio::task::spawn_blocking(move || build(host, pool))
            .await
            .map_err(|_| not_started.to_owned())?
            .map_err(|error| format!("{not_started}: {}", error.message))?;
        let built = call_identity(runtime.config(), &env);
        if built != identity {
            return Err("it runs under another configuration than this call".into());
        }
        let served = std::rc::Rc::new(Served {
            runtime,
            identity: built,
        });
        // An evicted runtime ends when its last call returns; the servers
        // it used stay in the shared pool.
        drop(
            self.runtimes
                .borrow_mut()
                .insert(key, std::rc::Rc::clone(&served)),
        );
        Ok(served)
    }
}

#[cfg(unix)]
async fn serve(socket: PathBuf) -> u8 {
    use std::os::unix::fs::PermissionsExt;
    let Some(listener) = bind(&socket) else {
        return 0;
    };
    let ours = socket_identity(&socket);
    let _ = std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600));
    prune_siblings(&socket);
    let daemon = std::rc::Rc::new(Daemon::new(socket.clone()));
    // Remove the socket only while it is still ours.
    serve_on(listener, &daemon, IDLE_EXIT, || {
        remove_if_ours(&socket, ours)
    })
    .await;
    shut_down(&daemon).await;
    0
}

/// Stop every runtime, then the servers they shared.
#[cfg(unix)]
async fn shut_down(daemon: &Daemon) {
    let runtimes = daemon.runtimes.borrow_mut().drain();
    for served in runtimes {
        served.runtime.close().await;
    }
    daemon.lsp_pool.clear_all().await;
}

/// Accept connections until nothing has been asked for `idle`, or a
/// [`STOP`] request arrives. Then `leave` runs (the socket goes, so the next
/// call starts another server) and the calls taken finish.
#[cfg(unix)]
async fn serve_on(
    listener: tokio::net::UnixListener,
    daemon: &std::rc::Rc<Daemon>,
    idle: std::time::Duration,
    leave: impl FnOnce(),
) {
    use std::rc::Rc;
    use std::sync::Arc;
    let state = Rc::new(std::cell::Cell::new((0usize, std::time::Instant::now())));
    let slots = Arc::new(tokio::sync::Semaphore::new(MAX_CONNECTIONS));
    let poll = idle.min(std::time::Duration::from_secs(15));
    let mut next_id = 0u64;
    loop {
        let accepted = tokio::select! {
            accepted = listener.accept() => accepted,
            () = daemon.stop.notified() => break,
            () = tokio::time::sleep(poll) => {
                let (active, last) = state.get();
                if active == 0 && last.elapsed() >= idle {
                    break;
                }
                continue;
            }
        };
        let Ok((stream, _)) = accepted else {
            tokio::time::sleep(ACCEPT_BACKOFF).await;
            continue;
        };
        // Over the cap the connection is dropped here, so its client sees EOF.
        let Ok(permit) = Arc::clone(&slots).try_acquire_owned() else {
            continue;
        };
        next_id += 1;
        let id = format!("serve-{next_id}");
        let (daemon, state) = (Rc::clone(daemon), Rc::clone(&state));
        tokio::task::spawn_local(async move {
            let _permit = permit;
            let (active, _) = state.get();
            state.set((active + 1, std::time::Instant::now()));
            handle(&daemon, stream, id).await;
            let (active, _) = state.get();
            state.set((active.saturating_sub(1), std::time::Instant::now()));
        });
    }
    // A connection not yet accepted is refused, so its client runs in
    // process; the ones taken finish first.
    drop(listener);
    leave();
    let all = u32::try_from(MAX_CONNECTIONS).unwrap_or(u32::MAX);
    let _ = slots.acquire_many(all).await;
}

/// The socket file's identity, `(device, inode)`, taken right after bind.
#[cfg(unix)]
fn socket_identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    std::fs::symlink_metadata(path)
        .ok()
        .map(|meta| (meta.dev(), meta.ino()))
}

/// Remove `path` only while it is still the socket this server bound: a
/// successor that rebound the path keeps its live socket.
#[cfg(unix)]
fn remove_if_ours(path: &Path, ours: Option<(u64, u64)>) {
    if ours.is_some() && socket_identity(path) == ours {
        let _ = std::fs::remove_file(path);
    }
}

/// Bind the socket, replacing a stale file no server answers on. `None`
/// when another server already owns it.
#[cfg(unix)]
fn bind(socket: &Path) -> Option<tokio::net::UnixListener> {
    match tokio::net::UnixListener::bind(socket) {
        Ok(listener) => Some(listener),
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            if std::os::unix::net::UnixStream::connect(socket).is_ok() {
                return None;
            }
            std::fs::remove_file(socket).ok()?;
            tokio::net::UnixListener::bind(socket).ok()
        }
        Err(_) => None,
    }
}

/// The form two spellings of one directory share (symlinks resolved), or
/// the path as given when it cannot be resolved.
#[cfg(unix)]
fn same_dir_form(dir: &Path) -> PathBuf {
    std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf())
}

/// Await `execution` unless the client leaves first: it never writes after
/// its request, so a read that returns (end of stream on Ctrl-C or exit)
/// means it left. Then `cancel` runs, the cancelled work drains, and the
/// result is `None`.
#[cfg(unix)]
async fn unless_left<T>(
    execution: impl std::future::Future<Output = T>,
    client: &mut (impl tokio::io::AsyncRead + Unpin),
    cancel: impl FnOnce(),
) -> Option<T> {
    use tokio::io::AsyncReadExt;
    tokio::pin!(execution);
    let mut probe = [0u8; 1];
    tokio::select! {
        result = &mut execution => Some(result),
        _ = client.read(&mut probe) => {
            cancel();
            let _ = execution.await;
            None
        }
    }
}

/// One connection: read the request line, run it on the runtime of the
/// client's directory and environment in the client's output mode, and
/// write the printed call back. A request this server cannot answer as the
/// client would run it gets a `fallback` reply, so the client runs it in
/// process. A [`STOP`] request stops the server.
#[cfg(unix)]
async fn handle(daemon: &Daemon, stream: tokio::net::UnixStream, id: String) {
    use tokio::io::{AsyncWriteExt, BufReader};
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read);
    let Some(line) = read_line_bounded(&mut reader, MAX_REQUEST_BYTES).await else {
        return;
    };
    touch(&daemon.socket);
    let reply = match serde_json::from_str::<Value>(&line) {
        Ok(request) if request["stop"] == true => {
            daemon.stop.notify_one();
            return;
        }
        Ok(mut request) => match served(daemon, &mut request).await {
            Ok((served, tool, json_out, input)) => {
                let runtime = &served.runtime;
                // What this call raises, and only that, goes in its reply.
                let notices = octocode_io::notice::Scope::default();
                let printed = match runtime.admit(id.clone()) {
                    Err(error) => Printed::finish(&tool, Err(error), json_out),
                    Ok(admission) => {
                        let execution = notices.run(runtime.execute(
                            admission,
                            tool.clone(),
                            input,
                            super::channel(json_out),
                        ));
                        let cancel = || {
                            runtime.requests.cancel(&id);
                        };
                        let Some(result) = unless_left(execution, &mut reader, cancel).await else {
                            return;
                        };
                        Printed::finish(&tool, result, json_out)
                    }
                };
                let mut reply = printed.to_json();
                reply["notices"] = json!(notices.notices());
                reply
            }
            Err(reason) => json!({ "fallback": reason }),
        },
        Err(_) => json!({ "fallback": "the request was not JSON" }),
    };
    let mut line = reply.to_string();
    line.push('\n');
    let _ = write.write_all(line.as_bytes()).await;
}

/// The runtime, tool, output mode and input of `request`, or why this
/// server does not run it.
#[cfg(unix)]
async fn served(
    daemon: &Daemon,
    request: &mut Value,
) -> Result<(std::rc::Rc<Served>, String, bool, Value), String> {
    let (Some(tool), Some(json_out), Some(cwd), Some(identity), Ok(env)) = (
        request["tool"].as_str().map(str::to_owned),
        request["json"].as_bool(),
        request["cwd"].as_str().map(PathBuf::from),
        request["identity"].as_str().map(str::to_owned),
        serde_json::from_value::<BTreeMap<String, String>>(request["env"].take()),
    ) else {
        return Err("the request was not one this server reads".into());
    };
    if !ToolId::from_name(&tool).is_some_and(runs_on_server) {
        return Err(format!("it does not run {tool}"));
    }
    let served = daemon.runtime_for(&cwd, env, &identity).await?;
    Ok((served, tool, json_out, request["input"].take()))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn exit_removes_only_the_socket_this_server_bound() {
        // A successor that rebound the path keeps its socket when we exit.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("s.sock");
        let first = std::os::unix::net::UnixListener::bind(&path).expect("bind");
        let ours = socket_identity(&path);
        drop(first);
        std::fs::remove_file(&path).expect("unlink");
        let _successor = std::os::unix::net::UnixListener::bind(&path).expect("rebind");
        remove_if_ours(&path, ours);
        assert!(path.exists(), "the successor's socket must survive");
        let theirs = socket_identity(&path);
        remove_if_ours(&path, theirs);
        assert!(!path.exists());
        // An unknown identity removes nothing.
        let _again = std::os::unix::net::UnixListener::bind(&path).expect("bind again");
        remove_if_ours(&path, None);
        assert!(path.exists());
    }

    #[tokio::test]
    async fn request_line_is_read_only_up_to_its_limit() {
        // Served from a slice; the handler passes the socket's buffered reader.
        let mut ok = tokio::io::BufReader::new(&b"{\"tool\":\"x\"}\n"[..]);
        assert_eq!(
            read_line_bounded(&mut ok, 64).await,
            Some("{\"tool\":\"x\"}\n".to_owned())
        );
        // Exactly at the limit, with its newline, is still a request.
        let mut at_limit = [b'a'; 64];
        at_limit[63] = b'\n';
        let mut at_limit = tokio::io::BufReader::new(&at_limit[..]);
        assert!(read_line_bounded(&mut at_limit, 64).await.is_some());
        // A line with no newline inside the limit is refused, not buffered whole.
        let long_line = [b'a'; 100];
        let mut long = tokio::io::BufReader::new(&long_line[..]);
        assert_eq!(read_line_bounded(&mut long, 64).await, None);
        let mut empty = tokio::io::BufReader::new(&b""[..]);
        assert_eq!(read_line_bounded(&mut empty, 64).await, None);
    }

    static NO_ENV: BTreeMap<String, String> = BTreeMap::new();

    fn request<'a>(input: &'a Value, cwd: &'a Path) -> Request<'a> {
        Request {
            tool: "localSearch",
            input,
            json_out: true,
            cwd,
            env: &NO_ENV,
            identity: "id",
        }
    }

    /// An exchange no interrupt reaches.
    async fn exchange_plain(
        client: &mut tokio::net::UnixStream,
        request: &Request<'_>,
        deadline: Duration,
    ) -> Result<Printed, Failed> {
        exchange_reply(client, request, deadline)
            .await
            .map(|reply| reply.printed)
    }

    async fn exchange_reply(
        client: &mut tokio::net::UnixStream,
        request: &Request<'_>,
        deadline: Duration,
    ) -> Result<Reply, Failed> {
        exchange(
            client,
            request,
            deadline,
            std::future::pending(),
            std::future::pending::<()>(),
            || {},
        )
        .await
    }

    #[tokio::test]
    async fn client_reads_one_reply_line_and_treats_a_silent_close_as_no_reply() {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        let (mut client, server) = tokio::net::UnixStream::pair().expect("pair");
        let peer = tokio::spawn(async move {
            let mut server = BufReader::new(server);
            let mut request = String::new();
            server.read_line(&mut request).await.expect("request");
            server
                .get_mut()
                .write_all(b"{\"exit\":1,\"stderr\":false,\"body\":\"{}\"}\n")
                .await
                .expect("reply");
            request
        });
        let input = json!({"q": 1});
        let request = request(&input, Path::new("/work/here"));
        let reply = exchange_plain(&mut client, &request, REPLY_DEADLINE).await;
        assert_eq!(
            reply,
            Ok(Printed {
                exit: 1,
                stream: crate::cli::Stream::Stdout,
                body: "{}".into(),
            })
        );
        let sent: Value = serde_json::from_str(&peer.await.expect("peer")).expect("json");
        assert_eq!(sent["tool"], "localSearch");
        // The server renders in the caller's output mode: one channel.
        assert_eq!(sent["json"], true);
        // ...runs it as a CLI in the caller's directory, under its identity.
        assert_eq!(sent["cwd"], "/work/here");
        assert_eq!(sent["identity"], "id");
        // ...with the caller's environment.
        assert_eq!(sent["env"], json!({}));

        // A server that closes without replying sends the caller to the
        // in-process path, with a reason to state.
        let (mut client, server) = tokio::net::UnixStream::pair().expect("pair");
        drop(server);
        assert!(matches!(
            exchange_plain(&mut client, &request, REPLY_DEADLINE).await,
            Err(Failed::Fallback(_))
        ));
    }

    /// A server that refuses sends the caller in process with its reason;
    /// one that never replies ends the call at the deadline instead of
    /// running it twice.
    #[tokio::test]
    async fn a_refusal_falls_back_and_a_silent_server_ends_at_the_deadline() {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        let input = json!({});
        let request = request(&input, Path::new("/w"));
        let (mut client, server) = tokio::net::UnixStream::pair().expect("pair");
        let peer = tokio::spawn(async move {
            let mut server = BufReader::new(server);
            let mut line = String::new();
            server.read_line(&mut line).await.expect("request");
            server
                .get_mut()
                .write_all(b"{\"fallback\":\"it runs under another configuration\"}\n")
                .await
                .expect("reply");
        });
        assert_eq!(
            exchange_plain(&mut client, &request, REPLY_DEADLINE).await,
            Err(Failed::Fallback(
                "it runs under another configuration".into()
            ))
        );
        peer.await.expect("peer");

        let (mut client, _silent) = tokio::net::UnixStream::pair().expect("pair");
        assert_eq!(
            exchange_plain(&mut client, &request, Duration::from_millis(50)).await,
            Err(Failed::Deadline)
        );
        // The deadline outlasts the server's own request budget.
        assert!(REPLY_DEADLINE > octocode_native::runtime::DEFAULT_TIMEOUT);
    }

    /// Ctrl-C on the client closes its side, which the server reads as a
    /// cancel; the client then waits for the server to finish, or stops
    /// waiting at a second Ctrl-C.
    #[tokio::test]
    async fn ctrl_c_closes_the_request_side_and_drains_the_server() {
        use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
        let input = json!({});
        let request = request(&input, Path::new("/w"));
        let (mut client, server) = tokio::net::UnixStream::pair().expect("pair");
        let peer = tokio::spawn(async move {
            let mut server = BufReader::new(server);
            let mut line = String::new();
            server.read_line(&mut line).await.expect("request");
            // The client's close reaches the server as end of stream.
            let mut rest = Vec::new();
            server.read_to_end(&mut rest).await.expect("read");
            rest.is_empty()
        });
        let noticed = std::cell::Cell::new(false);
        let drained = exchange(
            &mut client,
            &request,
            REPLY_DEADLINE,
            std::future::ready(()),
            std::future::pending::<()>(),
            || noticed.set(true),
        )
        .await;
        assert_eq!(
            drained,
            Err(Failed::Interrupted(crate::cli::Interrupted::Drained))
        );
        assert!(noticed.get(), "the cancel notice is printed");
        assert!(peer.await.expect("peer"), "the server saw only the close");

        // A server that keeps working is abandoned at the second Ctrl-C.
        let (mut client, _busy) = tokio::net::UnixStream::pair().expect("pair");
        let forced = exchange(
            &mut client,
            &request,
            REPLY_DEADLINE,
            std::future::ready(()),
            std::future::ready(()),
            || {},
        )
        .await;
        assert_eq!(
            forced,
            Err(Failed::Interrupted(crate::cli::Interrupted::Forced))
        );
    }

    /// The server cancels a call whose client left, waits for the cancelled
    /// work, and replies nothing; a client that stays gets the result.
    #[tokio::test]
    async fn a_client_that_leaves_cancels_its_call() {
        let (cancel, cancelled) = tokio::sync::oneshot::channel::<()>();
        let execution = async {
            let _ = cancelled.await;
            "drained"
        };
        let mut gone = &b""[..];
        let mut cancel = Some(cancel);
        let result = unless_left(execution, &mut gone, || {
            let _ = cancel.take().expect("once").send(());
        })
        .await;
        assert_eq!(result, None);
        assert!(cancel.is_none(), "the call was cancelled");

        let (_client, mut server) = tokio::io::duplex(8);
        let result = unless_left(async { "done" }, &mut server, || panic!("not cancelled")).await;
        assert_eq!(result, Some("done"));
    }

    #[test]
    fn every_read_only_tool_runs_on_the_server() {
        for tool in ToolId::ALL {
            let mutates = matches!(tool, ToolId::GhCloneRepo | ToolId::AstRewrite);
            assert_eq!(runs_on_server(tool), !mutates, "{tool}");
        }
    }

    /// A synthetic configuration: `env` (with `OCTOCODE_HOME` = `home`) for
    /// a CLI in `cwd`.
    fn identity(
        home: &Path,
        cwd: &Path,
        env: &[(&str, &str)],
    ) -> (octocode_native::config::ConfigOutput, String) {
        use octocode_native::config::{RuntimeSurface, acquire_config_input, resolve_config};
        let mut vars: BTreeMap<String, String> = env
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect();
        vars.entry("OCTOCODE_HOME".into())
            .or_insert_with(|| home.to_string_lossy().into_owned());
        let vars = served_env(vars);
        let input = acquire_config_input(
            vars.clone(),
            cwd.to_path_buf(),
            home.to_path_buf(),
            RuntimeSurface::Cli,
        );
        let config = resolve_config(&input);
        let identity = call_identity(&config, &vars);
        (config, identity)
    }

    /// A `cd` changes the shell's directory variables only: the call keeps
    /// its runtime. Any other variable is another runtime.
    #[test]
    fn a_cd_keeps_the_runtime_of_a_directory() {
        let runtime = |env: &[(&str, &str)]| {
            let env = env
                .iter()
                .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
                .collect();
            env_digest(&served_env(env))
        };
        let base = runtime(&[("GH_CONFIG_DIR", "/a"), ("PWD", "/w"), ("OLDPWD", "/x")]);
        assert_eq!(
            runtime(&[("GH_CONFIG_DIR", "/a"), ("PWD", "/w/sub"), ("OLDPWD", "/w")]),
            base
        );
        assert_eq!(runtime(&[("GH_CONFIG_DIR", "/a")]), base);
        assert_ne!(runtime(&[("GH_CONFIG_DIR", "/b"), ("PWD", "/w")]), base);
    }

    /// Every input that changes what a call does changes the server key;
    /// the shell's `PWD` and unrelated variables do not, and two
    /// directories of one repository share a server.
    #[test]
    fn the_server_key_covers_every_identity_input() {
        let home = tempfile::tempdir().expect("home");
        let repo = tempfile::tempdir().expect("repo");
        std::fs::create_dir_all(repo.path().join(".git")).expect("git");
        let (a, b) = (repo.path().join("a"), repo.path().join("b"));
        std::fs::create_dir_all(&a).expect("a");
        std::fs::create_dir_all(&b).expect("b");
        let key = |cwd: &Path, env: &[(&str, &str)]| {
            server_key(
                "exe|1|2",
                &workspace_of(cwd),
                &identity(home.path(), cwd, env).1,
            )
        };
        let base = key(&a, &[("GITHUB_TOKEN", "t1")]);
        assert_eq!(base.len(), 16);
        assert!(!base.contains("t1"));
        assert_eq!(key(&a, &[("GITHUB_TOKEN", "t1")]), base);
        // One server for two directories of one repository.
        assert_eq!(key(&b, &[("GITHUB_TOKEN", "t1")]), base);
        assert_eq!(workspace_of(&a), repo.path());
        for (what, env) in [
            ("PWD", vec![("GITHUB_TOKEN", "t1"), ("PWD", "/elsewhere")]),
            (
                "an unrelated variable",
                vec![("GITHUB_TOKEN", "t1"), ("TERM_SESSION_ID", "x")],
            ),
        ] {
            assert_eq!(key(&a, &env), base, "{what}");
        }
        let other_home = tempfile::tempdir().expect("other home");
        let other_home = other_home.path().to_string_lossy().into_owned();
        for (what, env) in [
            ("token", vec![("GITHUB_TOKEN", "t2")]),
            ("token source", vec![("GH_TOKEN", "t1")]),
            ("no token", vec![]),
            (
                "OCTOCODE_BETA",
                vec![("GITHUB_TOKEN", "t1"), ("OCTOCODE_BETA", "true")],
            ),
            (
                "OCTOCODE_HOME",
                vec![("GITHUB_TOKEN", "t1"), ("OCTOCODE_HOME", &other_home)],
            ),
            (
                "an undeclared OCTOCODE_ variable",
                vec![("GITHUB_TOKEN", "t1"), ("OCTOCODE_X", "1")],
            ),
            (
                "proxy",
                vec![("GITHUB_TOKEN", "t1"), ("HTTPS_PROXY", "http://proxy:3128")],
            ),
            (
                "trust store",
                vec![("GITHUB_TOKEN", "t1"), ("SSL_CERT_FILE", "/ca.pem")],
            ),
            ("PATH", vec![("GITHUB_TOKEN", "t1"), ("PATH", "/opt/bin")]),
        ] {
            assert_ne!(key(&a, &env), base, "{what}");
        }
        // Every variable the engine reads from the server's own process: a
        // call cannot bring its own value, so another value is another server.
        for name in octocode_engine::process_env::PROCESS_ENV
            .iter()
            .chain(octocode_io::http::NETWORK_ENV)
        {
            assert_ne!(
                key(&a, &[("GITHUB_TOKEN", "t1"), (name, "/elsewhere")]),
                base,
                "{name}"
            );
        }
        // The home `.env`, the home and workspace `.octocoderc` files.
        let env = [("GITHUB_TOKEN", "t1")];
        std::fs::write(home.path().join(".env"), "OCTOCODE_REDACT_EMAILS=true\n").expect(".env");
        let with_env = key(&a, &env);
        assert_ne!(with_env, base, "home .env");
        std::fs::write(
            home.path().join(".octocoderc"),
            "{\"local\":{\"enabled\":false}}",
        )
        .expect("rc");
        let with_rc = key(&a, &env);
        assert_ne!(with_rc, with_env, "home .octocoderc");
        std::fs::create_dir_all(a.join(".octocode")).expect("ws");
        std::fs::write(
            a.join(".octocode/.octocoderc"),
            "{\"lsp\":{\"prewarm\":\"off\"}}",
        )
        .expect("ws rc");
        assert_ne!(key(&a, &env), with_rc, "workspace .octocoderc");
        // Another repository, another build.
        let elsewhere = tempfile::tempdir().expect("elsewhere");
        assert_ne!(key(elsewhere.path(), &env), key(&b, &env), "workspace");
        let identity = identity(home.path(), &b, &env).1;
        assert_ne!(
            server_key("exe|1|3", &workspace_of(&b), &identity),
            server_key("exe|1|2", &workspace_of(&b), &identity),
            "build"
        );
    }

    #[test]
    fn the_least_recently_used_runtime_leaves_at_the_cap() {
        let mut recent = Recent::new(2);
        assert_eq!(recent.insert("a", 1), None);
        assert_eq!(recent.insert("b", 2), None);
        assert_eq!(recent.get(&"a"), Some(&1));
        // `b` is now the least recently used.
        assert_eq!(recent.insert("c", 3), Some(2));
        assert_eq!(recent.get(&"b"), None);
        // Replacing a key keeps one entry for it.
        assert_eq!(recent.insert("a", 4), None);
        assert_eq!(recent.get(&"a"), Some(&4));
        assert_eq!(recent.drain(), vec![3, 4]);
    }

    #[test]
    fn stale_sockets_are_pruned_and_live_ones_kept() {
        let dir = tempfile::tempdir().expect("dir");
        let own = dir.path().join("serve-own.sock");
        let live = dir.path().join("serve-live.sock");
        let _listener = std::os::unix::net::UnixListener::bind(&live).expect("bind");
        let stale = dir.path().join("serve-stale.sock");
        drop(std::os::unix::net::UnixListener::bind(&stale).expect("bind"));
        let other = dir.path().join("notes.txt");
        std::fs::write(&other, "x").expect("write");
        prune_siblings(&own);
        assert!(live.exists() && other.exists());
        assert!(!stale.exists());
    }

    /// What a server listening on `listener` was sent by one connection.
    fn received(listener: &std::os::unix::net::UnixListener) -> Vec<u8> {
        use std::io::Read as _;
        let (mut stream, _) = listener.accept().expect("accept");
        let mut sent = Vec::new();
        stream.read_to_end(&mut sent).expect("read");
        sent
    }

    /// A starting server keeps [`MAX_SERVERS`] in all: the least recently
    /// asked live ones past the cap are asked to stop, the others are left
    /// alone.
    #[test]
    fn a_starting_server_stops_the_least_recently_asked_past_the_cap() {
        let dir = tempfile::tempdir().expect("dir");
        let own = dir.path().join("serve-own.sock");
        let servers: Vec<_> = (0..=MAX_SERVERS)
            .map(|at| {
                let path = dir.path().join(format!("serve-{at}.sock"));
                let listener = std::os::unix::net::UnixListener::bind(&path).expect("bind");
                std::thread::sleep(Duration::from_millis(20));
                (path, listener)
            })
            .collect();
        // The first one bound was asked last, so it is the most recent.
        touch(&servers[0].0);
        prune_siblings(&own);
        // Kept: the first, then the newest bound, up to the cap with `own`;
        // asked to stop: the oldest bound after the first.
        let stopped = servers.len() - (MAX_SERVERS - 1);
        for (at, (path, listener)) in servers.iter().enumerate() {
            let asked_to_stop = (1..=stopped).contains(&at);
            assert_eq!(
                received(listener) == STOP,
                asked_to_stop,
                "{}",
                path.display()
            );
        }
        // Stop requests go to every live server, and none is removed.
        stop_in(dir.path());
        for (path, listener) in &servers {
            assert_eq!(received(listener), STOP, "{}", path.display());
            assert!(path.exists());
        }
    }

    /// The socket's place does not depend on the Octocode home, so a
    /// long home (a macOS `$TMPDIR` one) still gets a warm server; a
    /// location too long for a socket says so instead of being skipped.
    #[test]
    fn the_socket_lives_under_the_temp_dir_whatever_the_home() {
        let temp = tempfile::tempdir().expect("temp");
        let socket = socket_in(temp.path(), "0123456789abcdef").expect("socket");
        assert!(socket.starts_with(temp.path()), "{}", socket.display());
        assert!(
            std::os::unix::net::SocketAddr::from_pathname(&socket).is_ok(),
            "{}",
            socket.display()
        );
        let deep = temp.path().join("d".repeat(120));
        std::fs::create_dir_all(&deep).expect("deep");
        let refused = socket_in(&deep, "0123456789abcdef").expect_err("too long");
        assert!(refused.contains("too long"), "{refused}");
    }

    #[test]
    fn socket_directory_must_be_private() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let temp = tempfile::tempdir().expect("temp");
        let uid = std::fs::metadata(temp.path()).expect("meta").uid();
        let sockets = temp.path().join(format!("octocode-{uid}"));
        assert!(private_dir(&sockets, uid).is_some());
        assert!(private_dir(&sockets, uid + 1).is_none());
        std::fs::set_permissions(&sockets, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        assert!(private_dir(&sockets, uid).is_none());
    }

    /// A workspace with one source file, a private home, and the
    /// environment both the server and the in-process call run with.
    struct Fixture {
        home: tempfile::TempDir,
        repo: tempfile::TempDir,
        env: BTreeMap<String, String>,
    }

    impl Fixture {
        fn new() -> Self {
            let home = tempfile::tempdir().expect("home");
            let repo = tempfile::tempdir().expect("repo");
            std::fs::create_dir_all(repo.path().join(".git")).expect("git");
            for dir in ["a", "b"] {
                let dir = repo.path().join(dir);
                std::fs::create_dir_all(&dir).expect("dir");
                std::fs::write(
                    dir.join("lib.rs"),
                    "fn alpha() {}\nfn beta() { alpha(); }\nfn gamma() { alpha(); }\n",
                )
                .expect("source");
            }
            let env = BTreeMap::from([
                (
                    "OCTOCODE_HOME".to_owned(),
                    home.path().to_string_lossy().into_owned(),
                ),
                ("OCTOCODE_ENABLE_LOCAL".to_owned(), "true".to_owned()),
                ("PATH".to_owned(), "/usr/bin:/bin".to_owned()),
            ]);
            Self { home, repo, env }
        }

        fn dir(&self, name: &str) -> PathBuf {
            same_dir_form(&self.repo.path().join(name))
        }

        /// A directory, with the same source, whose runtime builds slowly
        /// ([`slow_build`]).
        fn slow_dir(&self) -> PathBuf {
            let slow = self.repo.path().join("slow");
            std::fs::create_dir_all(&slow).expect("slow");
            std::fs::copy(self.repo.path().join("a/lib.rs"), slow.join("lib.rs")).expect("source");
            same_dir_form(&slow)
        }

        /// The identity a client in `cwd` sends.
        fn identity(&self, cwd: &Path) -> String {
            use octocode_native::config::{RuntimeSurface, acquire_config_input, resolve_config};
            let os_home = std::env::home_dir().expect("home");
            let env = served_env(self.env.clone());
            let input =
                acquire_config_input(env.clone(), cwd.to_path_buf(), os_home, RuntimeSurface::Cli);
            call_identity(&resolve_config(&input), &env)
        }

        /// Send one call from `cwd`, with this fixture's environment and
        /// the identity a client there sends.
        async fn ask(
            &self,
            socket: &Path,
            cwd: &Path,
            tool: &str,
            input: &Value,
            json_out: bool,
        ) -> Result<Reply, Failed> {
            self.ask_as(socket, cwd, tool, input, json_out, &self.identity(cwd))
                .await
        }

        async fn ask_as(
            &self,
            socket: &Path,
            cwd: &Path,
            tool: &str,
            input: &Value,
            json_out: bool,
            identity: &str,
        ) -> Result<Reply, Failed> {
            let mut stream = connect(socket).await.expect("connect");
            let env = served_env(self.env.clone());
            let request = Request {
                tool,
                input,
                json_out,
                cwd,
                env: &env,
                identity,
            };
            exchange_reply(&mut stream, &request, REPLY_DEADLINE).await
        }

        /// The call as an in-process CLI in `cwd` prints it.
        async fn in_process(
            &self,
            cwd: &Path,
            tool: &str,
            input: Value,
            json_out: bool,
        ) -> Printed {
            let runtime = octocode_native::runtime::ToolRuntime::from_host(
                octocode_native::runtime::HostOptions {
                    cwd: Some(cwd.to_path_buf()),
                    env: Some(served_env(self.env.clone())),
                    ..crate::cli::cli_host()
                },
            )
            .expect("runtime");
            let admission = runtime.admit("cli-1".into()).expect("admit");
            let result = runtime
                .execute(admission, tool.into(), input, crate::cli::channel(json_out))
                .await;
            runtime.close().await;
            Printed::finish(tool, result, json_out)
        }
    }

    /// A warning a call says on stderr outside its result (here: the shared
    /// GitHub rate-limit directory cannot be created) reaches the client of
    /// every call that raises it, as an in-process call prints it, though
    /// the server's process says it on its own stderr only once. A call in
    /// flight that raised nothing relays nothing, though the raising rows
    /// ran on other threads.
    #[tokio::test]
    async fn notices_reach_the_client_as_an_in_process_call_says_them() {
        use wiremock::{Mock, MockServer, ResponseTemplate, matchers::method};
        let github = MockServer::builder().start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404).set_body_json(json!({"message": "Not Found"})))
            .mount(&github)
            .await;
        let mut fixture = Fixture::new();
        fixture
            .env
            .insert("GITHUB_API_URL".into(), format!("{}/api/v3", github.uri()));
        fixture
            .env
            .insert("GITHUB_TOKEN".into(), "fixture-token".into());
        // A file where the shared rate-limit directory goes.
        std::fs::create_dir_all(fixture.home.path().join("tmp")).expect("tmp");
        std::fs::write(fixture.home.path().join("tmp/ratelimit"), "").expect("blocker");
        let cwd = fixture.dir("a");
        // Two rows: they run on threads of their own.
        let row = json!({"owner": "o", "repo": "r", "path": "README", "forceRefresh": true});
        let input = json!({"queries": [row, row]});
        // A call in flight the whole time, such as a localSearch, that
        // raises nothing itself.
        let bystander = octocode_io::notice::Scope::default();
        let scope = octocode_io::notice::Scope::default();
        let expected = scope
            .run(fixture.in_process(&cwd, "ghGetFileContent", input.clone(), true))
            .await;
        let said = scope.notices();
        assert!(
            said.iter()
                .any(|notice| notice.contains("rate-limit state")),
            "{said:?}"
        );

        let socket = fixture.home.path().join("n.sock");
        let listener = tokio::net::UnixListener::bind(&socket).expect("bind");
        let daemon = std::rc::Rc::new(Daemon::new(socket.clone()));
        tokio::task::LocalSet::new()
            .run_until(async {
                let server_daemon = std::rc::Rc::clone(&daemon);
                let server = tokio::task::spawn_local(async move {
                    serve_on(listener, &server_daemon, Duration::from_millis(300), || {}).await;
                });
                for _ in 0..2 {
                    let reply = fixture
                        .ask(&socket, &cwd, "ghGetFileContent", &input, true)
                        .await
                        .expect("served");
                    assert_eq!(reply.printed, expected);
                    assert_eq!(reply.notices, said, "every call relays what it said");
                }
                server.await.expect("server");
            })
            .await;
        shut_down(&daemon).await;
        let home = fixture.home.path().display().to_string();
        let relayed: Vec<_> = bystander
            .notices()
            .into_iter()
            .filter(|notice| notice.contains(&home))
            .collect();
        assert!(relayed.is_empty(), "never another call's: {relayed:?}");
    }

    /// A server on a temporary socket answers as an in-process call would,
    /// keeps one runtime per directory and environment on one pool, and
    /// refuses a call it cannot run as the client would.
    #[tokio::test]
    async fn the_server_answers_byte_for_byte_like_an_in_process_call() {
        let mut fixture = Fixture::new();
        let socket = fixture.home.path().join("s.sock");
        let listener = tokio::net::UnixListener::bind(&socket).expect("bind");
        let daemon = std::rc::Rc::new(Daemon::new(socket.clone()));
        let local = tokio::task::LocalSet::new();
        local
            .run_until(async {
                let server_daemon = std::rc::Rc::clone(&daemon);
                let server = tokio::task::spawn_local(async move {
                    serve_on(listener, &server_daemon, Duration::from_millis(300), || {}).await;
                });
                let input = json!({"queries": [{"matchString": "alpha", "path": "."}]});
                for (dir, json_out) in [("a", true), ("a", false), ("b", true)] {
                    let cwd = fixture.dir(dir);
                    let expected = fixture.in_process(&cwd, "localSearch", input.clone(), json_out).await;
                    let served = fixture
                        .ask(&socket, &cwd, "localSearch", &input, json_out)
                        .await
                        .expect("served")
                        .printed;
                    assert_eq!(served, expected, "{dir} json={json_out}");
                    assert_eq!(served.exit, 0, "{}", served.body);
                }
                {
                    let runtimes = daemon.runtimes.borrow();
                    assert_eq!(runtimes.entries.len(), 2, "one runtime per directory");
                    // Each runtime holds the server's one pool.
                    assert!(std::sync::Arc::strong_count(&daemon.lsp_pool) > 2);
                }
                // Another environment (one no identity covers) is another
                // runtime, built with that environment, as in process.
                let cwd = fixture.dir("a");
                fixture.env.insert("GH_CONFIG_DIR".into(), "/accounts/b".into());
                fixture
                    .ask(&socket, &cwd, "localSearch", &input, true)
                    .await
                    .expect("served");
                {
                    let runtimes = daemon.runtimes.borrow();
                    assert_eq!(runtimes.entries.len(), 3, "one runtime per environment");
                    let newest = &runtimes.entries.last().expect("runtime").1;
                    assert_eq!(
                        newest.runtime.config().env_value("GH_CONFIG_DIR"),
                        Some("/accounts/b")
                    );
                }
                // A call under another identity (a config the call's
                // environment does not give) is refused, not run.
                let refused = fixture
                    .ask_as(&socket, &cwd, "localSearch", &json!({}), true, "other")
                    .await;
                assert!(
                    matches!(&refused, Err(Failed::Fallback(reason)) if reason.contains("another configuration")),
                    "{refused:?}"
                );
                // So is a tool that changes files.
                let refused = fixture.ask(&socket, &cwd, "astRewrite", &json!({}), true).await;
                assert!(
                    matches!(&refused, Err(Failed::Fallback(reason)) if reason.contains("astRewrite")),
                    "{refused:?}"
                );
                // Idle, the server stops serving.
                server.await.expect("server");
            })
            .await;
        shut_down(&daemon).await;
        assert!(daemon.runtimes.borrow().entries.is_empty());
    }

    /// The `slow` directories [`slow_build`] started a runtime build for.
    static SLOW_BUILDS: std::sync::Mutex<Vec<PathBuf>> = std::sync::Mutex::new(Vec::new());

    /// The `slow` directories whose builds a test let finish
    /// ([`finish_slow_builds`]), and the signal that wakes those builds.
    static FINISHED_SLOW_BUILDS: (std::sync::Mutex<Vec<PathBuf>>, std::sync::Condvar) =
        (std::sync::Mutex::new(Vec::new()), std::sync::Condvar::new());

    /// How long a slow build, or a test, waits for an event only a broken
    /// server never brings, so the test fails instead of hanging.
    const SLOW_BUILD_BOUND: Duration = Duration::from_secs(60);

    fn slow_builds(dir: &Path) -> usize {
        let built = SLOW_BUILDS.lock().expect("builds");
        built.iter().filter(|built| *built == dir).count()
    }

    /// Let the builds of `dir` finish.
    fn finish_slow_builds(dir: &Path) {
        let (finished, signal) = &FINISHED_SLOW_BUILDS;
        finished.lock().expect("finished").push(dir.to_path_buf());
        signal.notify_all();
    }

    /// Wait until `ready` holds, polling; panics past [`SLOW_BUILD_BOUND`].
    async fn until(what: &str, ready: impl Fn() -> bool) {
        let started = std::time::Instant::now();
        while !ready() {
            assert!(started.elapsed() < SLOW_BUILD_BOUND, "never {what}");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// A build that, in a directory named `slow`, runs until the test lets
    /// it finish ([`finish_slow_builds`]).
    fn slow_build(
        host: octocode_native::runtime::HostOptions,
        pool: std::sync::Arc<octocode_engine::lsp::pool::LspClientPool>,
    ) -> Result<octocode_native::runtime::ToolRuntime, octocode_native::runtime::RuntimeError> {
        if let Some(cwd) = host.cwd.as_ref().filter(|cwd| cwd.ends_with("slow")) {
            SLOW_BUILDS.lock().expect("builds").push(cwd.clone());
            let (finished, signal) = &FINISHED_SLOW_BUILDS;
            let finished = finished.lock().expect("finished");
            let (_finished, waited) = signal
                .wait_timeout_while(finished, SLOW_BUILD_BOUND, |finished| {
                    !finished.contains(cwd)
                })
                .expect("finished");
            assert!(!waited.timed_out(), "no test let the {cwd:?} build finish");
        }
        octocode_native::runtime::ToolRuntime::from_host_with_lsp_pool(host, pool)
    }

    /// A runtime builds off the thread that serves every connection: a call
    /// whose runtime is ready answers while another directory's build (its
    /// config, a due cache sweep) is still running, and two first calls of
    /// one directory share one build. The build runs until the ready call
    /// has answered, so the order holds however slow the runner is.
    #[tokio::test]
    async fn a_slow_runtime_build_holds_up_no_other_call() {
        let fixture = Fixture::new();
        let slow = fixture.slow_dir();
        let socket = fixture.home.path().join("b.sock");
        let listener = tokio::net::UnixListener::bind(&socket).expect("bind");
        let daemon = std::rc::Rc::new(Daemon::with_build(socket.clone(), slow_build));
        tokio::task::LocalSet::new()
            .run_until(async {
                let server_daemon = std::rc::Rc::clone(&daemon);
                let server = tokio::task::spawn_local(async move {
                    serve_on(listener, &server_daemon, Duration::from_millis(300), || {}).await;
                });
                let input = json!({"queries": [{"matchString": "alpha", "path": "."}]});
                let warm = fixture.dir("a");
                fixture
                    .ask(&socket, &warm, "localSearch", &input, true)
                    .await
                    .expect("warm");
                let (first, second, ready) = tokio::join!(
                    fixture.ask(&socket, &slow, "localSearch", &input, true),
                    fixture.ask(&socket, &slow, "localSearch", &input, true),
                    // A ready call that waited for the build would hold the
                    // build past its bound: the slow calls then fail.
                    async {
                        until("started the slow build", || slow_builds(&slow) == 1).await;
                        let reply = fixture
                            .ask(&socket, &warm, "localSearch", &input, true)
                            .await;
                        finish_slow_builds(&slow);
                        reply
                    },
                );
                ready.expect("ready directory");
                first.expect("slow first");
                second.expect("slow second");
                assert_eq!(slow_builds(&slow), 1, "one build for both first calls");
                server.await.expect("server");
            })
            .await;
        shut_down(&daemon).await;
    }

    /// A stop request ends the accept loop: the socket goes at once (the
    /// next call starts another server), and a call already taken finishes
    /// with its reply.
    #[tokio::test]
    async fn a_stopped_server_finishes_the_calls_it_took() {
        let fixture = Fixture::new();
        let slow = fixture.slow_dir();
        // Named as a server's socket, so a stop request reaches it.
        let socket = fixture.home.path().join("serve-t.sock");
        let listener = tokio::net::UnixListener::bind(&socket).expect("bind");
        let daemon = std::rc::Rc::new(Daemon::with_build(socket.clone(), slow_build));
        let left = std::rc::Rc::new(std::cell::Cell::new(false));
        tokio::task::LocalSet::new()
            .run_until(async {
                let (server_daemon, server_left) =
                    (std::rc::Rc::clone(&daemon), std::rc::Rc::clone(&left));
                let server = tokio::task::spawn_local(async move {
                    serve_on(listener, &server_daemon, IDLE_EXIT, || {
                        server_left.set(true)
                    })
                    .await;
                });
                let input = json!({"queries": [{"matchString": "alpha", "path": "."}]});
                let (taken, ()) = tokio::join!(
                    fixture.ask(&socket, &slow, "localSearch", &input, true),
                    async {
                        // The call is taken (its build runs) before the stop.
                        until("started the slow build", || slow_builds(&slow) == 1).await;
                        stop_in(socket.parent().expect("dir"));
                        until("left while its call was running", || left.get()).await;
                        finish_slow_builds(&slow);
                    },
                );
                assert_eq!(taken.expect("taken call").printed.exit, 0);
                server.await.expect("server");
            })
            .await;
        shut_down(&daemon).await;
    }
}

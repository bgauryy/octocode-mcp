//! Warm `lspSearch` across CLI calls.
//!
//! A language server answers in milliseconds once it has loaded a project,
//! but every CLI process used to start one cold (3–6 s for TypeScript). The
//! first `lspSearch` call of a workspace therefore starts `octocode serve`: a
//! detached process that owns one [`ToolRuntime`] (and its servers) behind a
//! private Unix socket. Later calls send their query there.
//!
//! - One server per binary build, working directory, and configuration
//!   identity (`ConfigOutput::identity_digest`: home, resolved settings,
//!   credential, and every variable the config contract declares): the
//!   socket name hashes all of them, so a rebuild, config edit or settings
//!   change gets a fresh server.
//! - The socket lives in `<temp dir>/octocode-<uid>` (mode 0700); only the
//!   owner can connect. Its name carries the home through the key, so its
//!   length does not depend on the home's (a long home once skipped the
//!   server silently). With `storage.mode = memory`, or on Windows, calls
//!   run in process as before; an unusable socket location is stated.
//! - Any failure to reach the server falls back to an in-process call.
//! - The server exits after [`IDLE_EXIT`] without a request; a client that
//!   disconnects mid-call cancels its request.

use super::Printed;
use serde_json::Value;
#[cfg(unix)]
use serde_json::json;

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
/// Pause after a failed accept (for example EMFILE) so the loop cannot spin.
#[cfg(unix)]
const ACCEPT_BACKOFF: std::time::Duration = std::time::Duration::from_millis(100);

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

/// Run `tool` through a workspace server when one is reachable or can be
/// started: the call as printed, in the caller's output mode. `None` means
/// the caller runs it in process.
#[cfg(unix)]
pub(super) async fn call(tool: &str, input: &Value, json_out: bool) -> Option<Printed> {
    let socket = socket_path()?;
    let mut stream = match connect(&socket).await {
        Some(stream) => stream,
        None => {
            spawn_server(&socket)?;
            wait_for(&socket).await?
        }
    };
    exchange(&mut stream, tool, input, json_out).await
}

#[cfg(not(unix))]
pub(super) async fn call(_tool: &str, _input: &Value, _json_out: bool) -> Option<Printed> {
    None
}

/// Send one request (the tool, its input, and the output mode the server
/// renders in) and read the printed call back.
#[cfg(unix)]
async fn exchange(
    stream: &mut tokio::net::UnixStream,
    tool: &str,
    input: &Value,
    json_out: bool,
) -> Option<Printed> {
    use tokio::io::{AsyncWriteExt, BufReader};
    let mut line = json!({"tool": tool, "input": input, "json": json_out}).to_string();
    line.push('\n');
    stream.write_all(line.as_bytes()).await.ok()?;
    let mut reader = BufReader::new(stream);
    let response = tokio::select! {
        response = read_line_bounded(&mut reader, MAX_RESPONSE_BYTES) => response?,
        // Dropping the connection cancels the request on the server.
        _ = tokio::signal::ctrl_c() => std::process::exit(130),
    };
    Printed::from_json(serde_json::from_str(&response).ok()?)
}

#[cfg(unix)]
async fn connect(socket: &std::path::Path) -> Option<tokio::net::UnixStream> {
    tokio::net::UnixStream::connect(socket).await.ok()
}

/// Wait up to two seconds for a just-started server to bind its socket.
#[cfg(unix)]
async fn wait_for(socket: &std::path::Path) -> Option<tokio::net::UnixStream> {
    for _ in 0..80 {
        if let Some(stream) = connect(socket).await {
            return Some(stream);
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    None
}

/// Start `octocode serve --socket <path>` detached from this process: its own
/// session, no inherited stdio (a caller capturing our output must not wait
/// for the server).
#[cfg(unix)]
fn spawn_server(socket: &std::path::Path) -> Option<()> {
    use std::os::unix::process::CommandExt;
    let exe = std::env::current_exe().ok()?;
    let mut command = std::process::Command::new(exe);
    command
        .arg("serve")
        .arg("--socket")
        .arg(socket)
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

/// `<temp>/octocode-<uid>/lsp-<key>.sock`, or `None` when the server must
/// not be used: memory storage (by choice, silent), or a location that is
/// unsafe or too long for a socket (stated on stderr, then in process).
#[cfg(unix)]
fn socket_path() -> Option<std::path::PathBuf> {
    use octocode_native::config::{
        RuntimeSurface, acquire_config_input, is_persistent_storage_enabled, resolve_config,
    };
    let cwd = std::env::current_dir().ok()?;
    let os_home = std::env::home_dir()?;
    let input = acquire_config_input(
        octocode_io::env::vars_lossy(),
        cwd.clone(),
        os_home,
        RuntimeSurface::Cli,
    );
    let config = resolve_config(&input);
    if !is_persistent_storage_enabled(&config.resolved) {
        return None;
    }
    let key = server_key(&cwd, &config.identity_digest())?;
    socket_in(&std::env::temp_dir(), &key)
        .map_err(|reason| {
            eprintln!(
                "octocode: warm lspSearch server unavailable ({reason}); running in process."
            );
        })
        .ok()
}

/// The socket for `key` in this user's private directory under `temp`, or
/// why it cannot be used. The length limit is the platform's own
/// (`sockaddr_un`, 104 bytes on macOS, 108 on Linux).
#[cfg(unix)]
fn socket_in(temp: &std::path::Path, key: &str) -> Result<std::path::PathBuf, String> {
    // SAFETY: getuid has no preconditions.
    let uid = unsafe { libc::getuid() };
    let dir = temp.join(format!("octocode-{uid}"));
    let socket = dir.join(format!("lsp-{key}.sock"));
    if std::os::unix::net::SocketAddr::from_pathname(&socket).is_err() {
        return Err(format!("socket path too long: {}", socket.display()));
    }
    private_dir(&dir, uid)
        .ok_or_else(|| format!("{} is not a private directory of this user", dir.display()))?;
    Ok(socket)
}

/// A directory only user `uid` can enter, created when missing.
#[cfg(unix)]
fn private_dir(dir: &std::path::Path, uid: u32) -> Option<()> {
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

/// 16 hex digits over everything that changes what the runtime would do:
/// this binary, the working directory, and the configuration identity.
#[cfg(unix)]
fn server_key(cwd: &std::path::Path, config_identity: &str) -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let meta = std::fs::metadata(&exe).ok()?;
    let built = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |age| age.as_nanos());
    let identity = format!(
        "{}|{}|{built}\n{}\n{config_identity}",
        exe.display(),
        meta.len(),
        cwd.display()
    );
    Some(octocode_engine::digest::sha256(identity.as_bytes())[..16].to_owned())
}

/// `octocode serve --socket <path>`: answer requests until idle.
#[cfg(unix)]
pub(super) async fn run(socket: &std::path::Path) -> u8 {
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

#[cfg(unix)]
async fn serve(socket: std::path::PathBuf) -> u8 {
    use octocode_native::runtime::ToolRuntime;
    use std::os::unix::fs::PermissionsExt;
    use std::rc::Rc;
    use std::sync::Arc;
    let Some(listener) = bind(&socket) else {
        return 0;
    };
    let ours = socket_identity(&socket);
    prune_stale(&socket);
    let _ = std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600));
    let Ok(runtime) = ToolRuntime::from_host(super::cli_host()) else {
        remove_if_ours(&socket, ours);
        return 5;
    };
    let runtime = Rc::new(runtime);
    let state = Rc::new(std::cell::Cell::new((0usize, std::time::Instant::now())));
    let slots = Arc::new(tokio::sync::Semaphore::new(MAX_CONNECTIONS));
    let mut next_id = 0u64;
    loop {
        let accepted = tokio::select! {
            accepted = listener.accept() => accepted,
            () = tokio::time::sleep(std::time::Duration::from_secs(15)) => {
                let (active, last) = state.get();
                if active == 0 && last.elapsed() >= IDLE_EXIT {
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
        let (runtime, state) = (Rc::clone(&runtime), Rc::clone(&state));
        tokio::task::spawn_local(async move {
            let _permit = permit;
            let (active, _) = state.get();
            state.set((active + 1, std::time::Instant::now()));
            handle(&runtime, stream, id).await;
            let (active, _) = state.get();
            state.set((active.saturating_sub(1), std::time::Instant::now()));
        });
    }
    // Remove the socket only while it is still ours.
    remove_if_ours(&socket, ours);
    runtime.close().await;
    0
}

/// Remove sibling sockets no server answers on: servers of an older build or
/// configuration that were killed before their idle exit.
#[cfg(unix)]
fn prune_stale(own: &std::path::Path) {
    let Some(dir) = own.parent() else { return };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_socket = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("lsp-") && name.ends_with(".sock"));
        if is_socket && path != own && std::os::unix::net::UnixStream::connect(&path).is_err() {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Bind the socket, replacing a stale file no server answers on. `None`
/// when another server already owns it.
/// The socket file's identity, `(device, inode)`, taken right after bind.
#[cfg(unix)]
fn socket_identity(path: &std::path::Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    std::fs::symlink_metadata(path)
        .ok()
        .map(|meta| (meta.dev(), meta.ino()))
}

/// Remove `path` only while it is still the socket this server bound: a
/// successor that rebound the path keeps its live socket.
#[cfg(unix)]
fn remove_if_ours(path: &std::path::Path, ours: Option<(u64, u64)>) {
    if ours.is_some() && socket_identity(path) == ours {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(unix)]
fn bind(socket: &std::path::Path) -> Option<tokio::net::UnixListener> {
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

/// One connection: read the request line, run it in the client's output
/// mode, and write the printed call back. A client that disconnects first
/// cancels the request.
#[cfg(unix)]
async fn handle(
    runtime: &octocode_native::runtime::ToolRuntime,
    stream: tokio::net::UnixStream,
    id: String,
) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read);
    let Some(line) = read_line_bounded(&mut reader, MAX_REQUEST_BYTES).await else {
        return;
    };
    let Ok(mut request) = serde_json::from_str::<Value>(&line) else {
        return;
    };
    let (Some(tool), Some(json_out), input) = (
        request["tool"].as_str().map(str::to_owned),
        request["json"].as_bool(),
        request["input"].take(),
    ) else {
        return;
    };
    let printed = match runtime.admit(id.clone()) {
        Err(error) => Printed::finish(&tool, Err(error), json_out),
        Ok(admission) => {
            let execution =
                runtime.execute(admission, tool.clone(), input, super::channel(json_out));
            tokio::pin!(execution);
            let mut probe = [0u8; 1];
            let result = tokio::select! {
                result = &mut execution => result,
                // The client never writes again; a read returning means it left.
                _ = reader.read(&mut probe) => {
                    runtime.requests.cancel(&id);
                    let _ = execution.await;
                    return;
                }
            };
            Printed::finish(&tool, result, json_out)
        }
    };
    let mut line = printed.to_json().to_string();
    line.push('\n');
    let _ = write.write_all(line.as_bytes()).await;
}

#[cfg(all(test, unix))]
mod tests {
    #[test]
    fn exit_removes_only_the_socket_this_server_bound() {
        // A successor that rebound the path keeps its socket when we exit.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("s.sock");
        let first = std::os::unix::net::UnixListener::bind(&path).expect("bind");
        let ours = super::socket_identity(&path);
        drop(first);
        std::fs::remove_file(&path).expect("unlink");
        let _successor = std::os::unix::net::UnixListener::bind(&path).expect("rebind");
        super::remove_if_ours(&path, ours);
        assert!(path.exists(), "the successor's socket must survive");
        let theirs = super::socket_identity(&path);
        super::remove_if_ours(&path, theirs);
        assert!(!path.exists());
        // An unknown identity removes nothing.
        let _again = std::os::unix::net::UnixListener::bind(&path).expect("bind again");
        super::remove_if_ours(&path, None);
        assert!(path.exists());
    }

    #[tokio::test]
    async fn request_line_is_read_only_up_to_its_limit() {
        // Served from a slice; the handler passes the socket's buffered reader.
        let mut ok = tokio::io::BufReader::new(&b"{\"tool\":\"x\"}\n"[..]);
        assert_eq!(
            super::read_line_bounded(&mut ok, 64).await,
            Some("{\"tool\":\"x\"}\n".to_owned())
        );
        // Exactly at the limit, with its newline, is still a request.
        let mut at_limit = [b'a'; 64];
        at_limit[63] = b'\n';
        let mut at_limit = tokio::io::BufReader::new(&at_limit[..]);
        assert!(super::read_line_bounded(&mut at_limit, 64).await.is_some());
        // A line with no newline inside the limit is refused, not buffered whole.
        let long_line = [b'a'; 100];
        let mut long = tokio::io::BufReader::new(&long_line[..]);
        assert_eq!(super::read_line_bounded(&mut long, 64).await, None);
        let mut empty = tokio::io::BufReader::new(&b""[..]);
        assert_eq!(super::read_line_bounded(&mut empty, 64).await, None);
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
        let reply = super::exchange(
            &mut client,
            "localSearch",
            &serde_json::json!({"q": 1}),
            true,
        )
        .await;
        assert_eq!(
            reply,
            Some(super::Printed {
                exit: 1,
                stream: crate::cli::Stream::Stdout,
                body: "{}".into(),
            })
        );
        let request: serde_json::Value =
            serde_json::from_str(&peer.await.expect("peer")).expect("json");
        assert_eq!(request["tool"], "localSearch");
        // The server renders in the caller's output mode: one channel.
        assert_eq!(request["json"], true);

        // A server that closes without replying sends the caller to the in-process path.
        let (mut client, server) = tokio::net::UnixStream::pair().expect("pair");
        drop(server);
        assert_eq!(
            super::exchange(&mut client, "localSearch", &serde_json::json!({}), false).await,
            None
        );
    }

    /// The key follows the working directory and the configuration
    /// identity; what the identity covers is the config module's test.
    #[test]
    fn server_key_tracks_the_working_directory_and_config_identity() {
        let home = tempfile::tempdir().expect("home");
        let cwd = home.path().join("w");
        let key = super::server_key(&cwd, "a").expect("key");
        assert_eq!(key.len(), 16);
        assert_eq!(super::server_key(&cwd, "a"), Some(key.clone()));
        assert_ne!(super::server_key(&cwd, "b"), Some(key.clone()));
        assert_ne!(
            super::server_key(&home.path().join("other"), "a"),
            Some(key)
        );
    }

    #[test]
    fn stale_sockets_are_pruned_and_live_ones_kept() {
        let dir = tempfile::tempdir().expect("dir");
        let own = dir.path().join("lsp-own.sock");
        let live = dir.path().join("lsp-live.sock");
        let _listener = std::os::unix::net::UnixListener::bind(&live).expect("bind");
        let stale = dir.path().join("lsp-stale.sock");
        drop(std::os::unix::net::UnixListener::bind(&stale).expect("bind"));
        let other = dir.path().join("notes.txt");
        std::fs::write(&other, "x").expect("write");
        super::prune_stale(&own);
        assert!(live.exists() && other.exists());
        assert!(!stale.exists());
    }

    /// The socket's place does not depend on the Octocode home, so a
    /// long home (a macOS `$TMPDIR` one) still gets a warm server; a
    /// location too long for a socket says so instead of being skipped.
    #[test]
    fn the_socket_lives_under_the_temp_dir_whatever_the_home() {
        let temp = tempfile::tempdir().expect("temp");
        let socket = super::socket_in(temp.path(), "0123456789abcdef").expect("socket");
        assert!(socket.starts_with(temp.path()), "{}", socket.display());
        assert!(
            std::os::unix::net::SocketAddr::from_pathname(&socket).is_ok(),
            "{}",
            socket.display()
        );
        let deep = temp.path().join("d".repeat(120));
        std::fs::create_dir_all(&deep).expect("deep");
        let refused = super::socket_in(&deep, "0123456789abcdef").expect_err("too long");
        assert!(refused.contains("too long"), "{refused}");
    }

    #[test]
    fn socket_directory_must_be_private() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let temp = tempfile::tempdir().expect("temp");
        let uid = std::fs::metadata(temp.path()).expect("meta").uid();
        let sockets = temp.path().join(format!("octocode-{uid}"));
        assert!(super::private_dir(&sockets, uid).is_some());
        assert!(super::private_dir(&sockets, uid + 1).is_none());
        std::fs::set_permissions(&sockets, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        assert!(super::private_dir(&sockets, uid).is_none());
    }
}

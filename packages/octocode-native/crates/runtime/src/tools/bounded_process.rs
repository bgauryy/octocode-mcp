//! A bounded helper subprocess: no stdin, capped stdout, a wall-clock limit,
//! cooperative cancellation, and (on Unix) its own process group so a
//! timeout or cancel also kills any grandchildren it started.
//!
//! A descendant that left the group (`setsid`) and kept the output pipes open
//! cannot be found by a tree walk once its parent is gone. It never holds the
//! call: after the command ends, reads drain what is pending, stop at the next
//! quiet moment and drop the pipes (see [`Gated`]).
use super::cancel::CancellationCheck;
use std::{
    io::Read,
    process::{Command, ExitStatus, Stdio},
    sync::{Arc, OnceLock},
    thread,
    time::{Duration, Instant},
};

/// Why a bounded run produced no output. The message names the command.
#[derive(Debug, Eq, PartialEq)]
pub(crate) enum BoundedError {
    /// The cancellation check fired, before the spawn or while waiting.
    Cancelled(String),
    /// The wall-clock limit passed; the process group was killed.
    TimedOut(String),
    /// The command could not start or be reaped, or overflowed its output.
    Failed(String),
}

impl From<BoundedError> for String {
    fn from(error: BoundedError) -> Self {
        match error {
            BoundedError::Cancelled(message)
            | BoundedError::TimedOut(message)
            | BoundedError::Failed(message) => message,
        }
    }
}

pub(crate) struct BoundedOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    /// The first [`STDERR_BYTES`] of stderr, for an error message. When
    /// stderr was cut short, a closing `[stderr …]` line says so (see
    /// [`with_cut_note`]), so any message that quotes it carries the note.
    pub stderr: Vec<u8>,
}

const STDERR_BYTES: usize = 64 * 1024;
const POLL: Duration = Duration::from_millis(20);

/// Runs `command` to completion. `label` names it in errors.
pub(crate) fn run_bounded(
    command: Command,
    label: &str,
    timeout: Duration,
    max_stdout: usize,
    cancel: &dyn CancellationCheck,
) -> Result<BoundedOutput, BoundedError> {
    run_bounded_draining(command, label, timeout, max_stdout, DRAIN_GRACE, cancel)
}

/// [`run_bounded`] with the drain grace named, so a test can end it at once.
fn run_bounded_draining(
    command: Command,
    label: &str,
    timeout: Duration,
    max_stdout: usize,
    grace: Duration,
    cancel: &dyn CancellationCheck,
) -> Result<BoundedOutput, BoundedError> {
    let (status, (stdout, exceeded), stderr) =
        run_bounded_with_stdout(command, label, timeout, grace, cancel, move |stdout| {
            read_capped(stdout, max_stdout)
        })?;
    if exceeded {
        return Err(BoundedError::Failed(format!(
            "{label} exceeded the {} MiB output limit",
            max_stdout / (1024 * 1024)
        )));
    }
    Ok(BoundedOutput {
        status,
        stdout,
        stderr,
    })
}

fn run_bounded_with_stdout<T: Send, F>(
    mut command: Command,
    label: &str,
    timeout: Duration,
    grace: Duration,
    cancel: &dyn CancellationCheck,
    reader: F,
) -> Result<(ExitStatus, T, Vec<u8>), BoundedError>
where
    F: FnOnce(Option<Gated<std::process::ChildStdout>>) -> Result<T, String> + Send,
{
    cancel.check().map_err(BoundedError::Cancelled)?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    octocode_engine::process::contain(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| BoundedError::Failed(format!("cannot run {label}: {error}")))?;
    let mut tree = match octocode_engine::process::Job::attach(&child, None) {
        Ok(tree) => tree,
        Err(message) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(BoundedError::Failed(format!(
                "cannot contain {label}: {message}"
            )));
        }
    };
    // Set once the command has ended: readers then drain what is pending and stop.
    let finished: Arc<OnceLock<Instant>> = Arc::new(OnceLock::new());
    let stdout = child
        .stdout
        .take()
        .map(|pipe| Gated::new(pipe, Arc::clone(&finished)));
    let stderr = child
        .stderr
        .take()
        .map(|pipe| Gated::new(pipe, Arc::clone(&finished)));
    let started = Instant::now();
    let (outcome, status, stdout, stderr) = thread::scope(|scope| {
        let stdout_reader = scope.spawn(|| reader(stdout));
        let stderr_reader = scope.spawn(|| read_stderr(stderr));
        let outcome = loop {
            #[cfg(unix)]
            let completed = octocode_engine::process::exited_without_reaping(child.id());
            #[cfg(not(unix))]
            let completed = child.try_wait().map(|status| status.is_some());
            match completed {
                Ok(true) => break Ok(()),
                Err(error) => {
                    break Err(BoundedError::Failed(format!(
                        "{label} could not be reaped: {error}"
                    )));
                }
                Ok(false) => {}
            }
            if let Err(reason) = cancel.check() {
                break Err(BoundedError::Cancelled(reason));
            }
            if started.elapsed() >= timeout {
                break Err(BoundedError::TimedOut(format!(
                    "{label} timed out after {}s",
                    timeout.as_secs_f64()
                )));
            }
            thread::sleep(POLL);
        };
        // Sweep while the leader is still unreaped: its pid cannot be reused.
        octocode_engine::process::kill_tree(child.id());
        tree.terminate();
        let _ = child.kill();
        let status = child.wait();
        let _ = finished.set(Instant::now() + grace);
        let reader_failed =
            |stream: &str| BoundedError::Failed(format!("{label} {stream} reader failed"));
        let stdout = stdout_reader
            .join()
            .map_err(|_| reader_failed("output"))
            .and_then(|value| {
                value.map_err(|message| BoundedError::Failed(format!("{label}: {message}")))
            });
        let stderr = stderr_reader.join().map_err(|_| reader_failed("error"));
        (outcome, status, stdout, stderr)
    });
    outcome?;
    let status = status
        .map_err(|error| BoundedError::Failed(format!("{label} could not be reaped: {error}")))?;
    Ok((status, stdout?, stderr?))
}

/// Runs `command` while delivering NUL-delimited stdout records to `record`.
///
/// The record cap deliberately reuses the caller's collected-output cap: a
/// malformed individual record remains bounded, while a legitimate index with
/// many records is not rejected for its aggregate size.
pub(crate) fn run_bounded_records(
    command: Command,
    label: &str,
    timeout: Duration,
    max_record: usize,
    cancel: &dyn CancellationCheck,
    record: &mut (dyn FnMut(&[u8]) -> Result<(), String> + Send),
) -> Result<BoundedOutput, BoundedError> {
    let (status, (), stderr) = run_bounded_with_stdout(
        command,
        label,
        timeout,
        DRAIN_GRACE,
        cancel,
        move |stdout| read_nul_records(stdout, max_record, record),
    )?;
    Ok(BoundedOutput {
        status,
        stdout: Vec::new(),
        stderr,
    })
}

/// How long readers may keep draining after the command ended. Only bytes the
/// command already wrote (at most one pipe buffer) are pending by then; a
/// detached descendant that keeps writing past this bound fails a read. That
/// fails the command when it is stdout; stderr ends there and says so (see
/// [`with_cut_note`]).
const DRAIN_GRACE: Duration = Duration::from_secs(1);

/// A command's output pipe whose reads stop at the end of the command.
///
/// On Unix a read polls the descriptor, so it wakes to see that the command
/// ended. Once it did, a read returns what is pending and then end of input,
/// even if a detached descendant still holds the write end; past
/// [`DRAIN_GRACE`] a read fails. The reader drops the pipe on return, so no
/// thread or descriptor outlives the call. Elsewhere the `Job` closes the
/// pipes when it terminates, and a read blocks until then.
struct Gated<R> {
    inner: R,
    #[cfg(unix)]
    finished: Arc<OnceLock<Instant>>,
}

impl<R> Gated<R> {
    #[cfg_attr(not(unix), allow(unused_variables))] // Only Unix reads gate on the end marker.
    fn new(inner: R, finished: Arc<OnceLock<Instant>>) -> Self {
        Self {
            inner,
            #[cfg(unix)]
            finished,
        }
    }
}

#[cfg(unix)]
impl<R: Read + std::os::fd::AsRawFd> Read for Gated<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            // Read the end marker before polling: when it was already set,
            // every byte the command wrote is in the pipe, so a quiet poll is final.
            let end = self.finished.get().copied();
            if let Some(end) = end
                && Instant::now() >= end
            {
                return Err(std::io::Error::other(
                    "output kept streaming after the command ended",
                ));
            }
            let wait = if end.is_some() { Duration::ZERO } else { POLL };
            if poll_readable(self.inner.as_raw_fd(), wait)? {
                return self.inner.read(buf);
            }
            if end.is_some() {
                return Ok(0);
            }
        }
    }
}

#[cfg(not(unix))]
impl<R: Read> Read for Gated<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.inner.read(buf)
    }
}

#[cfg(unix)]
fn poll_readable(fd: std::os::fd::RawFd, wait: Duration) -> std::io::Result<bool> {
    let mut entry = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    let millis = i32::try_from(wait.as_millis()).unwrap_or(i32::MAX);
    // SAFETY: one live pollfd entry; the count is 1.
    let ready = unsafe { libc::poll(&raw mut entry, 1, millis) };
    if ready >= 0 {
        return Ok(ready > 0);
    }
    let error = std::io::Error::last_os_error();
    if error.kind() == std::io::ErrorKind::Interrupted {
        Ok(false)
    } else {
        Err(error)
    }
}

/// What a capped read kept, whether more arrived, and why it stopped early.
struct Capped {
    bytes: Vec<u8>,
    exceeded: bool,
    failure: Option<String>,
}

/// Reads to EOF or the first read error, keeping at most `cap` bytes.
fn read_to_cap(source: Option<impl Read>, cap: usize) -> Capped {
    let mut capped = Capped {
        bytes: Vec::new(),
        exceeded: false,
        failure: None,
    };
    let Some(mut source) = source else {
        return capped;
    };
    let mut chunk = [0_u8; 16 * 1024];
    loop {
        match source.read(&mut chunk) {
            Ok(0) => return capped,
            Ok(read) => {
                let room = cap.saturating_sub(capped.bytes.len());
                capped.bytes.extend_from_slice(&chunk[..read.min(room)]);
                capped.exceeded |= read > room;
            }
            Err(error) => {
                capped.failure = Some(error.to_string());
                return capped;
            }
        }
    }
}

/// Reads to EOF, keeping at most `cap` bytes; `true` when more arrived. A
/// read error fails the read: the caller has no use for partial output.
fn read_capped(source: Option<impl Read>, cap: usize) -> Result<(Vec<u8>, bool), String> {
    let capped = read_to_cap(source, cap);
    match capped.failure {
        Some(error) => Err(error),
        None => Ok((capped.bytes, capped.exceeded)),
    }
}

/// Stderr only quotes an error message, so what was read stands whether or
/// not the pipe reached its end; a cut says so in the text itself.
fn read_stderr(source: Option<impl Read>) -> Vec<u8> {
    with_cut_note(read_to_cap(source, STDERR_BYTES))
}

/// Appends a closing `[stderr …]` line for each way `capped` fell short, so no
/// message that quotes it hides a cut.
fn with_cut_note(capped: Capped) -> Vec<u8> {
    let Capped {
        mut bytes,
        exceeded,
        failure,
    } = capped;
    let notes = [
        exceeded.then(|| format!("[stderr truncated at {STDERR_BYTES} bytes]")),
        failure.map(|error| format!("[stderr cut: {error}]")),
    ];
    for note in notes.into_iter().flatten() {
        if !bytes.is_empty() && !bytes.ends_with(b"\n") {
            bytes.push(b'\n');
        }
        bytes.extend_from_slice(note.as_bytes());
    }
    bytes
}

fn read_nul_records(
    source: Option<impl Read>,
    cap: usize,
    record: &mut (dyn FnMut(&[u8]) -> Result<(), String> + Send),
) -> Result<(), String> {
    let Some(mut source) = source else {
        return Ok(());
    };
    let mut pending = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        let count = source.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        for byte in &chunk[..count] {
            if *byte == 0 {
                record(&pending)?;
                pending.clear();
            } else {
                pending.push(*byte);
                if pending.len() > cap {
                    return Err(format!("record exceeded the {cap} byte output limit"));
                }
            }
        }
    }
    if !pending.is_empty() {
        return Err("unterminated NUL-delimited output record".into());
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::tools::cancel::NeverCancel;

    struct Cancelled;
    impl CancellationCheck for Cancelled {
        fn check(&self) -> Result<(), String> {
            Err("cancelled".into())
        }
    }

    fn sh(script: &str) -> Command {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", script]);
        command
    }

    #[test]
    fn timeout_kills_the_whole_process_group() {
        let dir = tempfile::tempdir().expect("dir");
        let pidfile = dir.path().join("grandchild.pid");
        let script = format!("sleep 30 & echo $! > '{}'; wait", pidfile.display());
        let started = Instant::now();
        let error = run_bounded(
            sh(&script),
            "sh",
            Duration::from_millis(300),
            1024,
            &NeverCancel,
        )
        .err()
        .expect("timeout");
        assert!(
            matches!(&error, BoundedError::TimedOut(message) if message.contains("timed out")),
            "{error:?}"
        );
        assert!(started.elapsed() < Duration::from_secs(5));
        let pid: u32 = std::fs::read_to_string(&pidfile)
            .expect("pid")
            .trim()
            .parse()
            .expect("pid number");
        thread::sleep(Duration::from_millis(100));
        assert!(
            !crate::process_status::is_alive(pid),
            "grandchild {pid} survived"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn timeout_kills_a_setsid_descendant() {
        let dir = tempfile::tempdir().expect("dir");
        let pidfile = dir.path().join("escaped.pid");
        let mut command = Command::new("python3");
        command.args(["-c", "import os,sys,time\nif os.fork()==0:\n os.setsid()\n os.close(1); os.close(2)\n open(sys.argv[1],'w').write(str(os.getpid()))\n time.sleep(60)\nelse:\n time.sleep(60)\n"]);
        command.arg(&pidfile);
        let result = run_bounded(
            command,
            "python3",
            Duration::from_millis(500),
            1024,
            &NeverCancel,
        );
        let pid: u32 = std::fs::read_to_string(pidfile)
            .expect("escaped pid")
            .trim()
            .parse()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        while crate::process_status::is_alive(pid) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        let survived = crate::process_status::is_alive(pid);
        if survived {
            // SAFETY: this fixture recorded the pid of its own live child.
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
        assert!(matches!(result, Err(BoundedError::TimedOut(_))));
        assert!(!survived, "setsid descendant {pid} survived timeout");
    }

    /// The leader prints `boom` to stderr and `hi` to stdout, then exits with
    /// `code`. A detached grandchild with stdout closed keeps stderr open
    /// until the read end closes.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn stderr_holder(code: i32) -> Command {
        let mut command = Command::new("python3");
        command.args([
            "-c",
            "import os,sys,time\nsys.stderr.write('boom\\n'); sys.stderr.flush()\nmiddle=os.fork()\nif middle==0:\n if os.fork()==0:\n  os.setsid(); os.close(1)\n  try:\n   while True: os.write(2,b'.'); time.sleep(0.05)\n  except OSError: pass\n os._exit(0)\nos.waitpid(middle,0)\nsys.stdout.write('hi'); sys.stdout.flush()\nos._exit(int(sys.argv[1]))\n",
        ]);
        command.arg(code.to_string());
        command
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn run_with_held_stderr(code: i32) -> (BoundedOutput, Duration) {
        let started = Instant::now();
        let output = run_bounded_draining(
            stderr_holder(code),
            "python3",
            Duration::from_secs(5),
            1024,
            Duration::ZERO,
            &NeverCancel,
        )
        .expect("stdout is complete, so the command's own result stands");
        (output, started.elapsed())
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn a_success_is_not_failed_by_stderr_still_open_at_the_grace() {
        let (output, elapsed) = run_with_held_stderr(0);
        assert!(
            elapsed < Duration::from_secs(5),
            "returned after {elapsed:?}"
        );
        assert!(output.status.success());
        assert_eq!(output.stdout, b"hi");
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn a_failure_quotes_the_stderr_it_has_and_says_it_was_cut() {
        let (output, _) = run_with_held_stderr(3);
        assert_eq!(output.status.code(), Some(3));
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.starts_with("boom\n"), "{stderr}");
        assert!(
            stderr
                .trim_end()
                .ends_with("[stderr cut: output kept streaming after the command ended]"),
            "{stderr}"
        );
    }

    #[test]
    fn stderr_over_its_cap_says_it_was_truncated() {
        let output = run_bounded(
            sh("head -c 100000 /dev/zero >&2; exit 2"),
            "sh",
            Duration::from_secs(5),
            1024,
            &NeverCancel,
        )
        .expect("runs");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            stderr
                .trim_end()
                .ends_with("[stderr truncated at 65536 bytes]"),
            "{}",
            &stderr[stderr.len().saturating_sub(80)..]
        );
    }

    #[test]
    fn output_over_the_cap_is_an_error_not_a_silent_cut() {
        let error = run_bounded(
            sh("head -c 4096 /dev/zero"),
            "sh",
            Duration::from_secs(5),
            1024,
            &NeverCancel,
        )
        .err()
        .expect("over cap");
        assert!(
            matches!(&error, BoundedError::Failed(message) if message.contains("output limit")),
            "{error:?}"
        );
        let ok = run_bounded(
            sh("printf hi"),
            "sh",
            Duration::from_secs(5),
            1024,
            &NeverCancel,
        )
        .expect("runs");
        assert_eq!(ok.stdout, b"hi");
        assert!(ok.status.success());
    }

    #[test]
    fn nul_records_can_exceed_the_collected_output_cap_in_total() {
        let mut records = 0_usize;
        let output = run_bounded_records(
            sh("i=0; while [ $i -lt 300000 ]; do printf '120000 blob\\tlink-%04d\\0' $i; i=$((i + 1)); done"),
            "sh",
            Duration::from_secs(15),
            1024,
            &NeverCancel,
            &mut |line| {
                assert!(line.starts_with(b"120000 blob"));
                records += 1;
                Ok(())
            },
        ).expect("streams records");
        assert_eq!(records, 300000);
        assert!(output.status.success());
    }

    #[test]
    fn cancellation_stops_before_spawn() {
        let error = run_bounded(
            sh("sleep 30"),
            "sh",
            Duration::from_secs(30),
            1024,
            &Cancelled,
        )
        .err()
        .expect("cancelled");
        assert_eq!(error, BoundedError::Cancelled("cancelled".into()));
    }
}

/// A detached descendant that keeps the output pipes open must not hold the
/// call (the fixture is described in `process_fixture`).
#[cfg(test)]
mod held_pipe_tests {
    use super::*;
    use crate::{
        process_fixture::{Holder, Leader, Tree, gone_within, kill},
        tools::cancel::NeverCancel,
    };

    const RETURN_WITHIN: Duration = Duration::from_secs(5);

    fn run(
        leader: Leader,
        holder: Holder,
        detach: bool,
    ) -> (Result<BoundedOutput, BoundedError>, Duration, u32) {
        let (command, tree) = Tree::new(leader, holder, detach);
        let started = Instant::now();
        let result = run_bounded(
            command,
            "fixture",
            Duration::from_secs(2),
            4 * 1024 * 1024,
            &NeverCancel,
        );
        (result, started.elapsed(), tree.holder_pid())
    }

    /// A holder that left the process group outlives the call by design: no
    /// parent walk or group kill can reach it. It must not hold the call.
    #[cfg(unix)]
    #[test]
    fn a_detached_descendant_holding_the_pipes_does_not_delay_a_finished_command() {
        let (result, elapsed, pid) = run(Leader::Exit, Holder::Silent, true);
        let alive = crate::process_status::is_alive(pid);
        kill(pid);
        let output = result.expect("the command itself succeeded");
        assert!(elapsed < RETURN_WITHIN, "returned after {elapsed:?}");
        assert!(alive, "the fixture must still hold the pipes at return");
        assert!(output.status.success());
        // The libtest harness prints its own banner around the fixture's text.
        assert!(
            output.stdout.windows(5).any(|window| window == b"hello"),
            "stdout lost what the command wrote before it ended"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_detached_descendant_holding_the_pipes_does_not_delay_a_timeout() {
        let (result, elapsed, pid) = run(Leader::Sleep, Holder::Silent, true);
        kill(pid);
        let error = result.err().expect("the leader outlived the timeout");
        assert!(matches!(error, BoundedError::TimedOut(_)), "{error:?}");
        assert!(elapsed < RETURN_WITHIN, "returned after {elapsed:?}");
    }

    #[test]
    fn a_streaming_descendant_is_released_when_the_call_returns() {
        let (result, elapsed, pid) = run(Leader::Exit, Holder::Streaming, true);
        let released = gone_within(pid, RETURN_WITHIN);
        kill(pid);
        // Whether the stream outran the cap or went quiet first is a race; the
        // call must return either way, and must not keep its read ends open.
        drop(result);
        assert!(elapsed < RETURN_WITHIN, "returned after {elapsed:?}");
        assert!(released, "the call kept its read end open after returning");
    }

    /// Containment, not escape: on Unix the group kill, on Windows the job,
    /// takes the holder down with the command.
    #[test]
    fn a_timeout_leaves_no_descendant_holding_the_pipes() {
        let (result, elapsed, pid) = run(Leader::Sleep, Holder::Silent, false);
        let gone = gone_within(pid, RETURN_WITHIN);
        kill(pid);
        let error = result.err().expect("the leader outlived the timeout");
        assert!(matches!(error, BoundedError::TimedOut(_)), "{error:?}");
        assert!(elapsed < RETURN_WITHIN, "returned after {elapsed:?}");
        assert!(gone, "descendant {pid} survived the timeout");
    }

    #[test]
    fn a_finished_command_leaves_no_descendant_holding_the_pipes() {
        let (result, elapsed, pid) = run(Leader::Exit, Holder::Silent, false);
        let gone = gone_within(pid, RETURN_WITHIN);
        kill(pid);
        let output = result.expect("the command itself succeeded");
        assert!(output.status.success());
        assert!(elapsed < RETURN_WITHIN, "returned after {elapsed:?}");
        assert!(gone, "descendant {pid} survived the command");
    }
}

/// The pipe gate on Unix, where reads poll the descriptor.
#[cfg(all(test, unix))]
mod gated_tests {
    use super::*;
    use std::io::Write;

    fn gated(finished: Option<Instant>) -> (Gated<std::io::PipeReader>, std::io::PipeWriter) {
        let (reader, writer) = std::io::pipe().expect("pipe");
        let cell = Arc::new(OnceLock::new());
        if let Some(end) = finished {
            cell.set(end).expect("fresh cell");
        }
        (Gated::new(reader, cell), writer)
    }

    #[test]
    fn a_gated_read_drains_pending_bytes_then_ends_while_the_writer_stays_open() {
        let (mut reader, mut writer) = gated(Some(Instant::now() + DRAIN_GRACE));
        writer.write_all(b"pending").expect("write");
        let mut chunk = [0_u8; 64];
        let count = reader.read(&mut chunk).expect("pending bytes");
        assert_eq!(&chunk[..count], b"pending");
        assert_eq!(reader.read(&mut chunk).expect("quiet pipe"), 0);
        drop(writer);
    }

    #[test]
    fn a_gated_read_past_the_grace_fails_instead_of_cutting_silently() {
        let (mut reader, mut writer) = gated(Some(Instant::now()));
        writer.write_all(b"still arriving").expect("write");
        let error = reader.read(&mut [0_u8; 64]).expect_err("past the grace");
        assert!(error.to_string().contains("kept streaming"), "{error}");
    }

    #[test]
    fn a_gated_read_before_the_end_blocks_for_data_not_for_the_writer() {
        let (mut reader, writer) = gated(None);
        let late = thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            let mut writer = writer;
            writer.write_all(b"late").expect("write");
        });
        let mut chunk = [0_u8; 64];
        let count = reader.read(&mut chunk).expect("data arrives");
        assert_eq!(&chunk[..count], b"late");
        late.join().expect("writer thread");
        assert_eq!(reader.read(&mut chunk).expect("closed pipe"), 0);
    }
}

#[cfg(test)]
mod record_tests {
    use super::read_nul_records;
    use std::io::Cursor;

    #[test]
    fn record_boundaries_preserve_tabs_newlines_and_chunks() {
        let first = b"one\tline\n".to_vec();
        let second = vec![b'x'; 16 * 1024 + 7];
        let input = [first.as_slice(), &[0], second.as_slice(), &[0]].concat();
        let mut records = Vec::new();
        read_nul_records(Some(Cursor::new(input)), second.len(), &mut |record| {
            records.push(record.to_vec());
            Ok(())
        })
        .expect("complete records across reader chunks");
        assert_eq!(records, [first, second]);
    }

    #[test]
    fn incomplete_and_oversized_records_fail_instead_of_becoming_partial_evidence() {
        let mut record = |_: &[u8]| Ok(());
        let incomplete = read_nul_records(Some(Cursor::new(b"no delimiter")), 100, &mut record)
            .expect_err("unterminated record");
        assert!(incomplete.contains("unterminated"));
        let oversized = read_nul_records(Some(Cursor::new(b"long\0")), 3, &mut record)
            .expect_err("per-record cap");
        assert!(oversized.contains("3 byte"), "{oversized}");
    }
}

//! A bounded helper subprocess: no stdin, capped stdout, a wall-clock limit,
//! cooperative cancellation, and (on Unix) its own process group so a
//! timeout or cancel also kills any grandchildren it started.
use super::cancel::CancellationCheck;
use std::{
    io::Read,
    process::{Child, Command, ExitStatus, Stdio},
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
    /// The first [`STDERR_BYTES`] of stderr, for an error message.
    pub stderr: Vec<u8>,
}

const STDERR_BYTES: usize = 64 * 1024;
const POLL: Duration = Duration::from_millis(20);

/// Runs `command` to completion. `label` names it in errors.
pub(crate) fn run_bounded(
    mut command: Command,
    label: &str,
    timeout: Duration,
    max_stdout: usize,
    cancel: &dyn CancellationCheck,
) -> Result<BoundedOutput, BoundedError> {
    cancel.check().map_err(BoundedError::Cancelled)?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_process_group(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| BoundedError::Failed(format!("cannot run {label}: {error}")))?;
    let mut tree = match ProcessTree::attach(&child) {
        Ok(tree) => tree,
        Err(message) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(BoundedError::Failed(format!(
                "cannot contain {label}: {message}"
            )));
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_reader = thread::spawn(move || read_capped(stdout, max_stdout));
    let stderr_reader = thread::spawn(move || read_capped(stderr, STDERR_BYTES));
    let started = Instant::now();
    let outcome = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Err(error) => {
                break Err(BoundedError::Failed(format!(
                    "{label} could not be reaped: {error}"
                )));
            }
            Ok(None) => {}
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
    let status = match outcome {
        Ok(status) => {
            // The leader exited; a grandchild holding a pipe open must not
            // keep the readers (and this call) waiting.
            kill_group(&mut child, &mut tree);
            status
        }
        Err(error) => {
            kill_group(&mut child, &mut tree);
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(error);
        }
    };
    let reader_failed =
        |stream: &str| BoundedError::Failed(format!("{label} {stream} reader failed"));
    let (stdout, exceeded) = stdout_reader
        .join()
        .map_err(|_| reader_failed("output"))?
        .map_err(BoundedError::Failed)?;
    let (stderr, _) = stderr_reader
        .join()
        .map_err(|_| reader_failed("error"))?
        .map_err(BoundedError::Failed)?;
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

/// Reads to EOF, keeping at most `cap` bytes; `true` when more arrived.
fn read_capped(source: Option<impl Read>, cap: usize) -> Result<(Vec<u8>, bool), String> {
    let Some(mut source) = source else {
        return Ok((Vec::new(), false));
    };
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 16 * 1024];
    let mut exceeded = false;
    loop {
        let read = source.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            return Ok((bytes, exceeded));
        }
        let room = cap.saturating_sub(bytes.len());
        bytes.extend_from_slice(&chunk[..read.min(room)]);
        exceeded |= read > room;
    }
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(not(unix))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(unix)]
fn kill_group(child: &mut Child, _tree: &mut ProcessTree) {
    if let Ok(pid) = i32::try_from(child.id()) {
        // SAFETY: the child leads its own process group (configure_process_group);
        // a negative pid signals that group only.
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }
    let _ = child.kill();
}

#[cfg(not(unix))]
fn kill_group(child: &mut Child, tree: &mut ProcessTree) {
    tree.terminate();
    let _ = child.kill();
}

/// Unix contains the tree with the process group; nothing to hold.
#[cfg(not(windows))]
struct ProcessTree;

#[cfg(not(windows))]
impl ProcessTree {
    fn attach(_child: &Child) -> Result<Self, String> {
        Ok(Self)
    }
}

/// Windows has no process groups to signal: a kill-on-close job object
/// holds the child and every descendant it starts.
#[cfg(windows)]
struct ProcessTree(Option<windows_sys::Win32::Foundation::HANDLE>);

#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::mem::{size_of, zeroed};
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };

        // SAFETY: null security/name creates an unnamed job owned by the returned handle.
        let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if job.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        // SAFETY: the Windows structure is plain data and zero is its documented baseline.
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: job is valid and info points to the correct structure for this information class.
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&raw const info).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        } != 0;
        // SAFETY: child owns a valid process handle while Child is alive.
        let assigned =
            configured && unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as _) } != 0;
        if !assigned {
            let error = std::io::Error::last_os_error().to_string();
            // SAFETY: job is owned by this function.
            unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
            return Err(error);
        }
        Ok(Self(Some(job)))
    }

    fn terminate(&mut self) {
        if let Some(job) = self.0.take() {
            // Closing a kill-on-close job terminates every descendant before pipe readers join.
            // SAFETY: the job handle is owned by this guard and closed once.
            unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        self.terminate();
    }
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

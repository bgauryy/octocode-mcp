//! Process-tree inspection for spawned language servers and probes: the
//! descendants of a pid (following parent links, so a child that called
//! `setsid` and left the process group is still found), their resident
//! memory and CPU time, and a freeze-then-kill teardown of the whole tree.
//!
//! Implemented on macOS (`libproc`) and Linux (`/proc`); Windows reads the
//! server process's own CPU time. Elsewhere the tree walk finds nothing,
//! there is no RSS or CPU reader, and teardown falls back to the process
//! group.

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

/// Upper bound on the processes one tree walk visits, so a fork bomb cannot
/// make the walk itself unbounded.
const MAX_TREE_PROCESSES: usize = 4_096;

/// Every descendant of `root` (not `root` itself), breadth-first. Parent links
/// are followed, not the process group or session, so descendants that
/// called `setsid` are included. A child whose parent already exited has
/// been re-parented away and cannot be found this way; callers snapshot the
/// tree before killing any of it.
#[cfg(unix)]
pub(crate) fn descendants(root: u32) -> Vec<u32> {
    walk_descendants(root, children_lookup())
}

/// The one tree walk shared by every platform: `children_of(pid)` yields
/// the direct children of `pid` (from `libproc` on macOS, from a `/proc`
/// snapshot on Linux). Pure over the lookup, so cycles (a self-parented or
/// looping table), duplicates, and the [`MAX_TREE_PROCESSES`] bound are
/// covered by tests on every host. `root` is never reported.
#[cfg_attr(not(unix), allow(dead_code))] // No process-tree reader off Unix.
fn walk_descendants(root: u32, mut children_of: impl FnMut(u32) -> Vec<u32>) -> Vec<u32> {
    let mut seen = HashSet::from([root]);
    let mut found = Vec::new();
    let mut frontier = std::collections::VecDeque::from([root]);
    while let Some(parent) = frontier.pop_front() {
        for child in children_of(parent) {
            if !seen.insert(child) {
                continue;
            }
            if found.len() >= MAX_TREE_PROCESSES {
                return found;
            }
            found.push(child);
            frontier.push_back(child);
        }
    }
    found
}

/// `(pid, ppid)` from one `/proc/<pid>/stat` line: `pid (comm) state ppid …`.
/// `comm` is the executable name and may itself hold spaces, `(` and `)`, so
/// the fields after it are located from the *last* `)`.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn parse_proc_stat(stat: &str) -> Option<(u32, u32)> {
    let open = stat.find(" (")?;
    let pid = stat[..open].trim().parse().ok()?;
    let close = stat.rfind(')')?;
    if close < open {
        return None;
    }
    let mut fields = stat[close + 1..].split_whitespace();
    let _state = fields.next()?;
    let ppid = fields.next()?.parse().ok()?;
    Some((pid, ppid))
}

/// Resident bytes from one `/proc/<pid>/statm` line (`size resident …`, in
/// pages). A zombie reports `0` resident pages, which is correct.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn parse_proc_statm_rss(statm: &str, page_size: u64) -> Option<u64> {
    let pages = statm.split_whitespace().nth(1)?.parse::<u64>().ok()?;
    Some(pages.saturating_mul(page_size))
}

/// CPU clock ticks from one `/proc/<pid>/stat` line: `utime + stime` of the
/// process plus `cutime + cstime` of the children it has reaped, so a
/// finished `cargo` or proc-macro helper stays counted. Fields are located
/// after the last `)`, as in [`parse_proc_stat`].
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn parse_proc_stat_cpu_ticks(stat: &str) -> Option<u64> {
    /// Fields after `comm`, counting from `state`: `utime stime cutime cstime`
    /// are fields 14-17 of proc(5), i.e. offsets 11-14 here.
    const FIRST_CPU_FIELD: usize = 11;
    let close = stat.rfind(')')?;
    let mut fields = stat[close + 1..].split_whitespace().skip(FIRST_CPU_FIELD);
    let mut ticks = 0u64;
    for _ in 0..4 {
        ticks = ticks.saturating_add(fields.next()?.parse::<u64>().ok()?);
    }
    Some(ticks)
}

/// CPU clock ticks of `pid` under a `/proc`-layout directory.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn read_proc_cpu_ticks(proc_root: &Path, pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(proc_root.join(pid.to_string()).join("stat")).ok()?;
    parse_proc_stat_cpu_ticks(&stat)
}

/// `(pid, ppid)` of every process under a `/proc`-layout directory, read in
/// one pass. Entries that are not numeric, vanish mid-scan, or whose `stat`
/// is unreadable or names another pid are skipped. Plain file I/O, so the
/// Linux reader runs against a synthetic tree on any host.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn read_proc_table(proc_root: &Path) -> Vec<(u32, u32)> {
    std::fs::read_dir(proc_root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().to_str()?.parse::<u32>().ok())
        .filter_map(|pid| {
            let stat =
                std::fs::read_to_string(proc_root.join(pid.to_string()).join("stat")).ok()?;
            let (stat_pid, ppid) = parse_proc_stat(&stat)?;
            (stat_pid == pid).then_some((pid, ppid))
        })
        .collect()
}

/// `pid → direct children` over a `(pid, ppid)` snapshot.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn children_from_table(table: Vec<(u32, u32)>) -> impl Fn(u32) -> Vec<u32> {
    move |parent| {
        table
            .iter()
            .filter(|&&(pid, ppid)| ppid == parent && pid != parent)
            .map(|&(pid, _)| pid)
            .collect()
    }
}

/// Resident bytes of `pid` under a `/proc`-layout directory.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // Linux reader; the synthetic-tree tests run it on every host.
fn read_proc_rss(proc_root: &Path, pid: u32, page_size: u64) -> Option<u64> {
    let statm = std::fs::read_to_string(proc_root.join(pid.to_string()).join("statm")).ok()?;
    parse_proc_statm_rss(&statm, page_size)
}

/// Kernel task info of `pid`; `None` when the process is gone.
#[cfg(target_os = "macos")]
fn task_info(pid: u32) -> Option<libc::proc_taskinfo> {
    let pid = libc::c_int::try_from(pid).ok()?;
    // SAFETY: `proc_taskinfo` is plain data; zero is a valid initial value.
    let mut info: libc::proc_taskinfo = unsafe { std::mem::zeroed() };
    let size = libc::c_int::try_from(std::mem::size_of::<libc::proc_taskinfo>()).ok()?;
    // SAFETY: the buffer is a live `proc_taskinfo` of exactly `size` bytes,
    // the layout `PROC_PIDTASKINFO` writes.
    let written =
        unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTASKINFO, 0, (&raw mut info).cast(), size) };
    (written == size).then_some(info)
}

/// Resident set size of `pid` in bytes; `None` when the process is gone.
#[cfg(target_os = "macos")]
pub(crate) fn rss_bytes(pid: u32) -> Option<u64> {
    task_info(pid).map(|info| info.pti_resident_size)
}

/// `mach_timebase_info_data_t` from `<mach/mach_time.h>`.
#[cfg(target_os = "macos")]
#[repr(C)]
struct MachTimebase {
    numer: u32,
    denom: u32,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    // `libc` deprecates its binding in favour of the `mach2` crate, which
    // this one call does not justify as a dependency.
    fn mach_timebase_info(info: *mut MachTimebase) -> libc::c_int;
}

/// User plus system CPU time of `pid`, `None` when the process is gone.
/// `proc_taskinfo` reports mach absolute-time ticks, which are nanoseconds
/// only on Intel; the timebase converts them everywhere.
#[cfg(target_os = "macos")]
fn cpu_time(pid: u32) -> Option<Duration> {
    use std::sync::OnceLock;
    static TIMEBASE: OnceLock<Option<(u32, u32)>> = OnceLock::new();
    let (numer, denom) = (*TIMEBASE.get_or_init(|| {
        let mut base = MachTimebase { numer: 0, denom: 0 };
        // SAFETY: `base` is a live out-parameter of the C struct's layout.
        let status = unsafe { mach_timebase_info(&raw mut base) };
        (status == 0 && base.denom != 0).then_some((base.numer, base.denom))
    }))?;
    let info = task_info(pid)?;
    let ticks = u128::from(info.pti_total_user) + u128::from(info.pti_total_system);
    let nanos = ticks * u128::from(numer) / u128::from(denom);
    Some(Duration::from_nanos(
        u64::try_from(nanos).unwrap_or(u64::MAX),
    ))
}

#[cfg(target_os = "linux")]
pub(crate) fn rss_bytes(pid: u32) -> Option<u64> {
    // SAFETY: `sysconf` has no preconditions.
    let page_size = u64::try_from(unsafe { libc::sysconf(libc::_SC_PAGESIZE) }).ok()?;
    read_proc_rss(Path::new("/proc"), pid, page_size)
}

#[cfg(target_os = "linux")]
fn cpu_time(pid: u32) -> Option<Duration> {
    // SAFETY: `sysconf` has no preconditions.
    let ticks_per_second = u64::try_from(unsafe { libc::sysconf(libc::_SC_CLK_TCK) })
        .ok()
        .filter(|&ticks| ticks > 0)?;
    let ticks = read_proc_cpu_ticks(Path::new("/proc"), pid)?;
    Some(Duration::from_nanos(
        ticks.saturating_mul(1_000_000_000 / ticks_per_second),
    ))
}

/// Cumulative CPU time of a server's process tree (off macOS and Linux, of
/// the server process alone), comparable between reads of the same clock.
///
/// A process that exits takes its own counters with it, so the clock keeps
/// the last CPU time it saw of every process that disappeared: the total
/// never falls when a busy helper (`cargo`, a proc-macro server) finishes.
/// On Linux a reaped child's time also reaches its parent's `cutime`, so it
/// can be counted twice, once; the clock only has to grow when work was done.
#[cfg(any(target_os = "macos", target_os = "linux", windows))]
pub(crate) struct TreeCpuClock {
    root: u32,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    seen: std::sync::Mutex<SeenCpu>,
}

/// The CPU time last seen per live process, and the sum of what the
/// processes that have exited used.
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[derive(Default)]
struct SeenCpu {
    live: std::collections::HashMap<u32, Duration>,
    exited: Duration,
}

#[cfg(any(target_os = "macos", target_os = "linux", windows))]
impl TreeCpuClock {
    pub(crate) fn new(root: u32) -> Self {
        Self {
            root,
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            seen: std::sync::Mutex::default(),
        }
    }

    /// `None` when the root process itself cannot be read (it exited).
    #[cfg(windows)]
    pub(crate) fn read(&self) -> Option<Duration> {
        cpu_time(self.root)
    }

    /// `None` when the root process itself cannot be read (it exited).
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub(crate) fn read(&self) -> Option<Duration> {
        let mut now = std::collections::HashMap::from([(self.root, cpu_time(self.root)?)]);
        for pid in descendants(self.root) {
            if let Some(time) = cpu_time(pid) {
                now.insert(pid, time);
            }
        }
        let mut seen = self
            .seen
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let gone = seen
            .live
            .iter()
            .filter(|(pid, _)| !now.contains_key(pid))
            .map(|(_, time)| *time)
            .fold(Duration::ZERO, Duration::saturating_add);
        seen.exited = seen.exited.saturating_add(gone);
        seen.live = now;
        Some(
            seen.live
                .values()
                .fold(seen.exited, |total, time| total.saturating_add(*time)),
        )
    }
}

/// CPU time used by the process `root` (no tree walk off macOS and Linux);
/// `None` when it cannot be opened.
#[cfg(windows)]
fn cpu_time(root: u32) -> Option<Duration> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    let filetime_100ns =
        |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    // SAFETY: a plain open by pid; the handle is closed below.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, root) };
    if process.is_null() {
        return None;
    }
    let zero = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
    // SAFETY: `process` is a live handle and the four out-parameters are
    // live `FILETIME`s.
    let read = unsafe {
        GetProcessTimes(
            process,
            &raw mut created,
            &raw mut exited,
            &raw mut kernel,
            &raw mut user,
        )
    } != 0;
    // SAFETY: `process` was opened above and is closed exactly once.
    unsafe { CloseHandle(process) };
    read.then(|| {
        Duration::from_nanos(
            filetime_100ns(kernel)
                .saturating_add(filetime_100ns(user))
                .saturating_mul(100),
        )
    })
}

/// Resident memory of `root` plus every descendant, in bytes; `None` when
/// `root` itself cannot be read (it exited).
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) fn tree_rss_bytes(root: u32) -> Option<u64> {
    let own = rss_bytes(root)?;
    Some(
        descendants(root)
            .into_iter()
            .filter_map(rss_bytes)
            .fold(own, u64::saturating_add),
    )
}

/// SIGKILL `root`, its process group, and every descendant — including
/// ones that left the group with `setsid`. The tree is frozen with SIGSTOP
/// first (a few rounds, so children forked mid-walk are caught), then killed
/// while the parent links still hold. `root` must not have been reaped yet,
/// so neither its pid nor its group id can have been recycled.
#[cfg(unix)]
pub(crate) fn kill_tree(root: u32) {
    let Ok(root_pid) = i32::try_from(root) else {
        return;
    };
    let mut tree = Vec::new();
    for _ in 0..3 {
        let snapshot = descendants(root);
        let grew = snapshot.iter().any(|pid| !tree.contains(pid));
        for &pid in &snapshot {
            if !tree.contains(&pid) {
                signal(pid, libc::SIGSTOP);
                tree.push(pid);
            }
        }
        if !grew {
            break;
        }
    }
    signal(root, libc::SIGSTOP);
    // SAFETY: `root` leads its own process group (spawned with
    // `process_group(0)`) and is not reaped, so `-root` names exactly it.
    unsafe {
        libc::kill(-root_pid, libc::SIGKILL);
    }
    signal(root, libc::SIGKILL);
    for pid in tree {
        signal(pid, libc::SIGKILL);
    }
}

#[cfg(unix)]
fn signal(pid: u32, signal: libc::c_int) {
    if let Ok(pid) = i32::try_from(pid)
        && pid > 1
    {
        // SAFETY: plain signal delivery to a positive pid.
        unsafe {
            libc::kill(pid, signal);
        }
    }
}

/// `pid → direct children` for the current platform.
#[cfg(target_os = "macos")]
fn children_lookup() -> impl Fn(u32) -> Vec<u32> {
    |parent| {
        /// `PROC_PPID_ONLY` from `<libproc.h>` (not exported by `libc`).
        const PROC_PPID_ONLY: u32 = 6;
        let mut pids = vec![0 as libc::pid_t; 256];
        loop {
            let Ok(bytes) = libc::c_int::try_from(pids.len() * std::mem::size_of::<libc::pid_t>())
            else {
                return Vec::new();
            };
            // SAFETY: the buffer holds `bytes` writable bytes of `pid_t`s.
            let written = unsafe {
                libc::proc_listpids(PROC_PPID_ONLY, parent, pids.as_mut_ptr().cast(), bytes)
            };
            let Ok(written) = usize::try_from(written) else {
                return Vec::new();
            };
            let count = written / std::mem::size_of::<libc::pid_t>();
            if count < pids.len() || pids.len() >= MAX_TREE_PROCESSES {
                return pids[..count.min(pids.len())]
                    .iter()
                    .filter_map(|&pid| u32::try_from(pid).ok())
                    .filter(|&pid| pid != 0)
                    .collect();
            }
            pids.resize(pids.len() * 2, 0);
        }
    }
}

#[cfg(target_os = "linux")]
fn children_lookup() -> impl Fn(u32) -> Vec<u32> {
    // One `/proc` scan per walk.
    children_from_table(read_proc_table(Path::new("/proc")))
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
fn children_lookup() -> impl Fn(u32) -> Vec<u32> {
    |_| Vec::new()
}

/// Platform-independent tests of the tree walk and the Linux `/proc`
/// readers, run against synthetic tables and a synthetic `/proc` directory so
/// the Linux-only parsing is exercised on every host.
#[cfg(test)]
mod pure_tests {
    use super::*;
    use std::path::PathBuf;

    /// A synthetic `/proc` root (`.0`), removed with its temporary
    /// directory on drop.
    struct FakeProc(
        PathBuf,
        #[expect(dead_code, reason = "held to remove the directory on drop")] tempfile::TempDir,
    );

    impl FakeProc {
        fn new(name: &str) -> Self {
            let dir = tempfile::Builder::new()
                .prefix(&format!("octocode-fake-proc-{name}-"))
                .tempdir()
                .expect("fake proc dir");
            Self(dir.path().to_path_buf(), dir)
        }

        /// A process whose `stat` is `pid (comm) S ppid …` and whose
        /// `statm` reports `resident` pages.
        fn process(&self, pid: u32, comm: &str, ppid: u32, resident: u64) -> &Self {
            let dir = self.0.join(pid.to_string());
            std::fs::create_dir_all(&dir).expect("pid dir");
            std::fs::write(
                dir.join("stat"),
                format!("{pid} ({comm}) S {ppid} {pid} {pid} 0 -1 4194560 100 0 0 0\n"),
            )
            .expect("stat");
            std::fs::write(
                dir.join("statm"),
                format!("1000 {resident} 50 10 0 200 0\n"),
            )
            .expect("statm");
            self
        }

        fn descendants(&self, root: u32) -> Vec<u32> {
            let mut found = walk_descendants(root, children_from_table(read_proc_table(&self.0)));
            found.sort_unstable();
            found
        }
    }

    #[test]
    fn stat_cpu_ticks_sum_own_and_reaped_children_time() {
        // utime 10, stime 5, cutime 3, cstime 2 are fields 14-17.
        let line = "42 (node) S 7 42 42 0 -1 4194560 100 0 0 0 10 5 3 2 20 0 4 0 1";
        assert_eq!(parse_proc_stat_cpu_ticks(line), Some(20));
        // `comm` with spaces and parentheses must not shift the fields.
        let hostile = "42 (a) S 9 (b)) S 7 42 42 0 -1 4194560 100 0 0 0 10 5 3 2 20";
        assert_eq!(parse_proc_stat_cpu_ticks(hostile), Some(20));
        // Truncated lines yield nothing rather than a partial sum.
        assert_eq!(
            parse_proc_stat_cpu_ticks("42 (node) S 7 42 42 0 -1 0 1 0 0 0 10 5"),
            None
        );
        assert_eq!(parse_proc_stat_cpu_ticks("42 (node"), None);
    }

    #[test]
    fn proc_cpu_ticks_are_read_per_pid() {
        let proc = FakeProc::new("cpu");
        let dir = proc.0.join("42");
        std::fs::create_dir_all(&dir).expect("pid dir");
        std::fs::write(
            dir.join("stat"),
            "42 (srv) S 1 42 42 0 -1 4194560 100 0 0 0 7 1 0 0 20 0 1 0 5\n",
        )
        .expect("stat");
        assert_eq!(read_proc_cpu_ticks(&proc.0, 42), Some(8));
        assert_eq!(read_proc_cpu_ticks(&proc.0, 43), None, "unknown pid");
    }

    #[test]
    fn stat_parsing_survives_hostile_comm_fields() {
        assert_eq!(parse_proc_stat("42 (node) S 7 42 42 0"), Some((42, 7)));
        assert_eq!(parse_proc_stat("42 (my server) R 7 1 1"), Some((42, 7)));
        // `comm` holding `)`, `(`, and digits must not shift the fields.
        assert_eq!(parse_proc_stat("42 (a) S 99 (b)) S 7 1 1"), Some((42, 7)));
        assert_eq!(parse_proc_stat("42 ((x) 1 2) Z 7 1 1"), Some((42, 7)));
        assert_eq!(parse_proc_stat("42 () S 7"), Some((42, 7)));
        // Truncated or malformed lines yield nothing rather than a bogus ppid.
        assert_eq!(parse_proc_stat("42 (node) S"), None);
        assert_eq!(parse_proc_stat("42 (node"), None);
        assert_eq!(parse_proc_stat("x (node) S 7"), None);
        assert_eq!(parse_proc_stat("42 (node) S -1"), None);
        assert_eq!(parse_proc_stat(""), None);
    }

    #[test]
    fn statm_parsing_scales_resident_pages() {
        assert_eq!(
            parse_proc_statm_rss("1000 25 3 1 0 9 0\n", 4096),
            Some(25 * 4096)
        );
        assert_eq!(parse_proc_statm_rss("0 0 0 0 0 0 0", 16_384), Some(0));
        assert_eq!(parse_proc_statm_rss("1000", 4096), None);
        assert_eq!(parse_proc_statm_rss("", 4096), None);
        assert_eq!(
            parse_proc_statm_rss("1 18446744073709551615", 4096),
            Some(u64::MAX)
        );
    }

    #[test]
    fn synthetic_proc_tree_finds_setsid_style_descendants_with_hostile_names() {
        let proc = FakeProc::new("tree");
        proc.process(1, "init", 0, 10)
            .process(100, "language server", 1, 10)
            .process(101, "node) S 1 (evil", 100, 10)
            .process(102, "rust-analyzer-proc-macro-srv", 101, 10)
            .process(200, "unrelated", 1, 10)
            .process(201, "unrelated child", 200, 10);
        // Non-pid entries in /proc are ignored.
        std::fs::create_dir_all(proc.0.join("self")).expect("self");
        std::fs::write(proc.0.join("uptime"), "1.0 2.0").expect("uptime");
        assert_eq!(proc.descendants(100), vec![101, 102]);
        assert_eq!(proc.descendants(102), Vec::<u32>::new());
        assert_eq!(proc.descendants(999), Vec::<u32>::new());
    }

    #[test]
    fn synthetic_proc_tree_skips_vanished_zombie_and_mismatched_entries() {
        let proc = FakeProc::new("vanished");
        proc.process(10, "leader", 1, 5)
            .process(11, "zombie", 10, 0)
            .process(12, "child", 10, 5);
        // A pid directory whose process exited mid-scan (no `stat`).
        std::fs::create_dir_all(proc.0.join("13")).expect("vanished dir");
        // A `stat` naming another pid (recycled/garbage) is not trusted.
        let bogus = proc.0.join("14");
        std::fs::create_dir_all(&bogus).expect("bogus dir");
        std::fs::write(bogus.join("stat"), "99 (x) S 10 0 0").expect("stat");
        assert_eq!(proc.descendants(10), vec![11, 12]);
        assert_eq!(read_proc_rss(&proc.0, 11, 4096), Some(0), "zombie");
        assert_eq!(read_proc_rss(&proc.0, 12, 4096), Some(5 * 4096));
        assert_eq!(read_proc_rss(&proc.0, 13, 4096), None, "vanished");
        assert_eq!(read_proc_table(&proc.0.join("missing")), Vec::new());
    }

    #[test]
    fn walk_terminates_on_cycles_self_parents_and_duplicates() {
        // 1 → 2 → 3 → 1 cycle, 4 parented to itself, 2 listed twice.
        let table = vec![(2, 1), (3, 2), (1, 3), (4, 4), (5, 4), (2, 1)];
        let mut found = walk_descendants(1, children_from_table(table.clone()));
        found.sort_unstable();
        assert_eq!(found, vec![2, 3], "root is never reported, cycle ends");
        let mut from_self = walk_descendants(4, children_from_table(table));
        from_self.sort_unstable();
        assert_eq!(from_self, vec![5]);
        // A lookup that reports a node as its own child still terminates.
        assert_eq!(
            walk_descendants(7, |pid| vec![pid, pid + 1]
                .into_iter()
                .filter(|&p| p < 10)
                .collect()),
            vec![8, 9]
        );
    }

    #[test]
    fn walk_handles_deep_trees_and_stops_at_the_process_bound() {
        // A 3 000-deep chain: iterative, so no stack overflow.
        let chain: Vec<(u32, u32)> = (1..=3_000).map(|pid| (pid + 1, pid)).collect();
        assert_eq!(walk_descendants(1, children_from_table(chain)).len(), 3_000);
        // A fan-out beyond the bound is truncated at exactly the bound.
        let fan: Vec<(u32, u32)> = (2..=10_000).map(|pid| (pid, 1)).collect();
        assert_eq!(
            walk_descendants(1, children_from_table(fan)).len(),
            MAX_TREE_PROCESSES
        );
        // Breadth-first order: every child before any grandchild.
        let tree = vec![(2, 1), (3, 1), (4, 2), (5, 3)];
        let order = walk_descendants(1, children_from_table(tree));
        assert_eq!(&order[..2], &[2, 3]);
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn python_available() -> bool {
        std::process::Command::new("python3")
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    }

    fn wait_for_pid_file(path: &std::path::Path) -> u32 {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(pid) = std::fs::read_to_string(path)
                .ok()
                .and_then(|text| text.trim().parse().ok())
            {
                return pid;
            }
            assert!(Instant::now() < deadline, "pid file never written");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn process_gone(pid: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            // SAFETY: signal 0 only checks existence.
            let alive = unsafe { libc::kill(pid as i32, 0) } == 0;
            if !alive || rss_bytes(pid).is_none() {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn spawn_shell(script: &str) -> std::process::Child {
        use std::os::unix::process::CommandExt;
        std::process::Command::new("sh")
            .args(["-c", script])
            .process_group(0)
            .spawn()
            .expect("spawn sh")
    }

    /// CPU growth of `pid`'s tree over `window` of wall time.
    fn cpu_growth(pid: u32, window: Duration) -> Duration {
        let clock = TreeCpuClock::new(pid);
        let before = clock.read().expect("readable");
        std::thread::sleep(window);
        clock.read().expect("readable").saturating_sub(before)
    }

    #[test]
    fn tree_cpu_clock_grows_for_a_busy_server_and_not_an_idle_one() {
        let mut busy = spawn_shell("while :; do :; done");
        let mut idle = spawn_shell("sleep 60");
        let window = Duration::from_millis(400);
        let busy_growth = cpu_growth(busy.id(), window);
        let idle_growth = cpu_growth(idle.id(), window);
        kill_tree(busy.id());
        kill_tree(idle.id());
        let _ = busy.wait();
        let _ = idle.wait();
        assert!(
            busy_growth >= window / 10,
            "a spinning process burns CPU: {busy_growth:?}"
        );
        assert!(
            idle_growth < window / 20,
            "a sleeping process does not: {idle_growth:?}"
        );
    }

    #[test]
    fn tree_cpu_clock_counts_descendants() {
        // The shell only waits; the CPU is burned by its child.
        let mut parent = spawn_shell("(while :; do :; done) & wait");
        std::thread::sleep(Duration::from_millis(200));
        let window = Duration::from_millis(400);
        let growth = cpu_growth(parent.id(), window);
        kill_tree(parent.id());
        let _ = parent.wait();
        assert!(growth >= window / 10, "child CPU is the tree's: {growth:?}");
    }

    /// A helper that burns CPU and exits must not make the tree's total
    /// fall: a falling total would read as "no progress" to the request wait.
    #[test]
    fn tree_cpu_clock_never_falls_when_a_busy_descendant_exits() {
        let mut parent =
            spawn_shell("(while :; do :; done) & busy=$!; sleep 1; kill $busy; wait; sleep 60");
        let clock = TreeCpuClock::new(parent.id());
        std::thread::sleep(Duration::from_millis(700));
        let while_busy = clock.read().expect("readable");
        std::thread::sleep(Duration::from_millis(1_000));
        let after_exit = clock.read().expect("readable");
        kill_tree(parent.id());
        let _ = parent.wait();
        assert!(
            after_exit >= while_busy,
            "{after_exit:?} fell below {while_busy:?}"
        );
    }

    #[test]
    fn tree_cpu_clock_is_none_for_a_gone_process() {
        let mut child = spawn_shell("exit 0");
        let pid = child.id();
        let _ = child.wait();
        assert!(TreeCpuClock::new(pid).read().is_none());
    }

    #[test]
    fn tree_walk_and_kill_reach_a_setsid_grandchild() {
        if !python_available() {
            return;
        }
        let dir = tempfile::tempdir().expect("dir");
        let pid_file = dir.path().join("grandchild.pid");
        let script = "import os,sys,time\nif os.fork()==0:\n    os.setsid()\n    open(sys.argv[1],'w').write(str(os.getpid()))\n    time.sleep(60)\nelse:\n    time.sleep(60)\n";
        let mut child = {
            use std::os::unix::process::CommandExt;
            std::process::Command::new("python3")
                .args(["-c", script])
                .arg(&pid_file)
                .process_group(0)
                .spawn()
                .expect("spawn python")
        };
        let grandchild = wait_for_pid_file(&pid_file);
        assert!(descendants(child.id()).contains(&grandchild));
        assert!(tree_rss_bytes(child.id()).is_some_and(|rss| rss > 0));
        kill_tree(child.id());
        let _ = child.wait();
        assert!(
            process_gone(grandchild),
            "the setsid grandchild must die with the tree"
        );
    }
}

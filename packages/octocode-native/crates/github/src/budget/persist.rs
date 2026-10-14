//! Optional on-disk mirror of a key's blocking facts, so short-lived CLI
//! processes honor each other's limits.
use super::{KeyFacts, KeyState, now_ms, pause};
use crate::ProviderError;
use std::{
    fs::TryLockError,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};
use tokio_util::sync::CancellationToken;

/// How often a held state lock is retried.
const LOCK_POLL: Duration = Duration::from_millis(5);
/// The longest a write that cannot be cancelled waits for a peer's lock
/// before it goes ahead unlocked, as on a filesystem without lock support.
const WRITE_LOCK_WAIT: Duration = Duration::from_secs(1);

pub(super) struct Persist {
    pub(super) path: PathBuf,
    pub(super) seen: Option<FileStamp>,
}

/// What tells one write of the state file from the next: every write renames
/// a fresh file, so its inode changes even when two writes share an mtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct FileStamp {
    modified: Option<SystemTime>,
    len: u64,
    #[cfg(unix)]
    inode: (u64, u64),
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some(FileStamp {
        modified: meta.modified().ok(),
        len: meta.len(),
        #[cfg(unix)]
        inode: {
            use std::os::unix::fs::MetadataExt;
            (meta.dev(), meta.ino())
        },
    })
}

impl KeyFacts {
    /// Keep the most restrictive of two views (memory vs. disk).
    pub(super) fn merge(&mut self, other: KeyFacts, now_ms: u64) {
        for (name, bucket) in other.buckets {
            if bucket.remaining != 0 || bucket.reset.saturating_mul(1000) <= now_ms {
                continue;
            }
            let replace = self
                .buckets
                .get(&name)
                .is_none_or(|current| current.reset < bucket.reset || current.remaining > 0);
            if replace {
                self.buckets.insert(name, bucket);
            }
        }
        self.cooldown_until_ms = self.cooldown_until_ms.max(other.cooldown_until_ms);
        for (group, stamp) in other.last_start_ms {
            let entry = self.last_start_ms.entry(group).or_default();
            *entry = (*entry).max(stamp);
        }
        let mut window: Vec<u64> = self
            .code_search_ms
            .iter()
            .chain(other.code_search_ms.iter())
            .copied()
            .filter(|stamp| stamp.saturating_add(60_000) > now_ms)
            .collect();
        window.sort_unstable();
        window.dedup();
        self.code_search_ms = window.into();
    }

    /// Only facts that can block a future request are persisted.
    pub(super) fn blocking_view(&self, now_ms: u64) -> KeyFacts {
        KeyFacts {
            buckets: self
                .buckets
                .iter()
                .filter(|(_, b)| b.remaining == 0 && b.reset.saturating_mul(1000) > now_ms)
                .map(|(name, b)| (name.clone(), *b))
                .collect(),
            cooldown_until_ms: if self.cooldown_until_ms > now_ms {
                self.cooldown_until_ms
            } else {
                0
            },
            last_start_ms: self
                .last_start_ms
                .iter()
                .filter(|(_, stamp)| stamp.saturating_add(60_000) > now_ms)
                .map(|(group, stamp)| (group.clone(), *stamp))
                .collect(),
            code_search_ms: self
                .code_search_ms
                .iter()
                .copied()
                .filter(|stamp| stamp.saturating_add(60_000) > now_ms)
                .collect(),
            circuit_failures: 0,
            circuit_open_until_ms: 0,
            circuit_cause: None,
        }
    }
}

impl KeyState {
    pub(super) fn attach_dir(&self, dir: &Path) {
        let mut persist = self
            .persist
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if persist.is_none() {
            *persist = Some(Persist {
                path: dir.join(self.key.file_name()),
                seen: None,
            });
        }
    }

    /// Merge the on-disk view when another process has written it since we
    /// last looked (one `stat` per logical request; see [`FileStamp`]).
    pub fn refresh_from_disk(&self) {
        let mut persist = self
            .persist
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(persist) = persist.as_mut() else {
            return;
        };
        let Some(stamp) = file_stamp(&persist.path) else {
            return;
        };
        if persist.seen == Some(stamp) {
            return;
        }
        persist.seen = Some(stamp);
        let Some(disk) = std::fs::read(&persist.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<KeyFacts>(&bytes).ok())
        else {
            return;
        };
        self.facts().merge(disk, now_ms());
    }

    /// Run `reserve` on this key's facts with the on-disk facts of every
    /// other process merged in, and write the result, all under the file
    /// lock: a slot one process takes is visible to the next before it
    /// reserves. Without a mirror it runs on the in-memory facts alone. A lock
    /// a peer process holds is waited for without blocking the runtime, until
    /// the request's `deadline` or `cancellation`.
    pub(super) async fn reserve_shared<R>(
        &self,
        deadline: Instant,
        cancellation: &CancellationToken,
        reserve: impl FnOnce(&mut KeyFacts) -> R,
    ) -> Result<R, ProviderError> {
        let path = self
            .persist
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .map(|persist| persist.path.clone());
        let Some(path) = path.and_then(|path| {
            std::fs::create_dir_all(path.parent()?).ok()?;
            Some(path)
        }) else {
            return Ok(reserve(&mut self.facts()));
        };
        let _lock = lock_file(&path, deadline, cancellation).await?;
        let on_disk = std::fs::read(&path).ok();
        let (result, view) = {
            let mut facts = self.facts();
            if let Some(disk) = on_disk
                .as_deref()
                .and_then(|bytes| serde_json::from_slice::<KeyFacts>(bytes).ok())
            {
                facts.merge(disk, now_ms());
            }
            let result = reserve(&mut facts);
            (result, facts.blocking_view(now_ms()))
        };
        self.write_view(&path, on_disk.as_deref(), &view);
        Ok(result)
    }

    /// Load-merge-write via a unique temp file + atomic rename.
    /// Mirror the blocking facts to disk. On an async worker the write runs on
    /// the blocking pool: it takes the peer lock and may wait for it up to
    /// `WRITE_LOCK_WAIT`. Each write merges the current view into the file, so
    /// two writes finishing out of order still leave the latest facts. Runtime
    /// shutdown waits for pending blocking writes, so none is lost at exit.
    pub(super) fn persist(self: &Arc<Self>) {
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                let state = Arc::clone(self);
                drop(handle.spawn_blocking(move || state.persist_with(|_| {})));
            }
            Err(_) => self.persist_with(|_| {}),
        }
    }

    /// [`Self::persist`] with `adjust` applied to the merged view before the
    /// write. A merged view equal to the file is not written again (a repeat
    /// exhaust or cooldown with the same reset); a new start reservation
    /// always changes it, and it must reach the file, because it is what
    /// spaces the next process's search.
    pub(super) fn persist_with(&self, adjust: impl FnOnce(&mut KeyFacts)) {
        let path = {
            let persist = self
                .persist
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            match persist.as_ref() {
                Some(persist) => persist.path.clone(),
                None => return,
            }
        };
        let Some(parent) = path.parent() else {
            return;
        };
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
        // Serialize read-merge-write across processes: without it, two CLI
        // processes read the same file and the later rename drops the other's
        // start stamps and window slots. Released on drop. A
        // filesystem without lock support, or a peer that holds the lock
        // past `WRITE_LOCK_WAIT`, degrades to the unlocked write.
        let _lock = lock_file_blocking(&path, Instant::now() + WRITE_LOCK_WAIT);
        let now = now_ms();
        let mut view = self.facts().blocking_view(now);
        let on_disk = std::fs::read(&path).ok();
        if let Some(disk) = on_disk
            .as_deref()
            .and_then(|bytes| serde_json::from_slice::<KeyFacts>(bytes).ok())
        {
            view.merge(disk, now);
        }
        adjust(&mut view);
        self.write_view(&path, on_disk.as_deref(), &view);
    }

    /// Write `view` unless the file already holds it, through a unique temp
    /// file and an atomic rename; the caller holds the file lock.
    fn write_view(&self, path: &Path, on_disk: Option<&[u8]>, view: &KeyFacts) {
        let Ok(bytes) = serde_json::to_vec(view) else {
            return;
        };
        if on_disk == Some(bytes.as_slice()) {
            return;
        }
        // No fsync: this is a rebuildable cache, and a flush here would hold the
        // peer lock for a disk write (see `WRITE_LOCK_WAIT`). The rename keeps it whole.
        let _ = octocode_io::atomic::write_atomic(path, &bytes, false);
        if let Some(stamp) = file_stamp(path)
            && let Some(persist) = self
                .persist
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .as_mut()
        {
            persist.seen = Some(stamp);
        }
    }
}

/// The `<state>.lock` sidecar, opened for locking; `None` when it cannot be.
fn open_lock_file(path: &Path) -> Option<std::fs::File> {
    let mut name = path.as_os_str().to_os_string();
    name.push(".lock");
    std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(PathBuf::from(name))
        .ok()
}

/// One non-blocking attempt at the exclusive advisory lock: `Some(true)` when
/// taken, `Some(false)` when a peer holds it, `None` when the filesystem does
/// not support locking.
fn try_lock_once(file: &std::fs::File) -> Option<bool> {
    match file.try_lock() {
        Ok(()) => Some(true),
        Err(TryLockError::WouldBlock) => Some(false),
        Err(TryLockError::Error(_)) => None,
    }
}

/// Exclusive advisory lock on the `<state>.lock` sidecar, polled so that the
/// wait yields to the runtime and ends at the `deadline` or on cancellation.
/// `Ok(None)` when the file cannot be opened or the filesystem does not
/// support locking.
async fn lock_file(
    path: &Path,
    deadline: Instant,
    cancellation: &CancellationToken,
) -> Result<Option<std::fs::File>, ProviderError> {
    let Some(file) = open_lock_file(path) else {
        return Ok(None);
    };
    loop {
        match try_lock_once(&file) {
            Some(true) => return Ok(Some(file)),
            None => return Ok(None),
            Some(false) => pause(LOCK_POLL, deadline, cancellation).await?,
        }
    }
}

/// [`lock_file`] for synchronous writers: `None` when the lock is not taken by
/// `deadline`, so a stalled peer cannot hold the caller indefinitely.
fn lock_file_blocking(path: &Path, deadline: Instant) -> Option<octocode_io::lock::LockedFile> {
    let file = open_lock_file(path)?;
    octocode_io::lock::lock_within(
        file,
        deadline.saturating_duration_since(Instant::now()),
        LOCK_POLL,
    )
    .ok()
}

#[cfg(test)]
mod tests {
    use super::super::*;

    /// A rate-limit fact learned on an async worker never waits for the peer
    /// lock there; it still reaches the file once the peer lets go.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_cooldown_on_an_async_worker_does_not_wait_for_the_peer_lock() {
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        let budget = GitHubBudget::relaxed();
        let state = budget.key_state(&key, Some(dir.path()));
        let file = dir.path().join(key.file_name());
        let mut lock_name = file.as_os_str().to_os_string();
        lock_name.push(".lock");
        let peer = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(std::path::PathBuf::from(lock_name))
            .expect("lock file");
        let held = octocode_io::lock::lock_within(peer, Duration::ZERO, Duration::from_millis(10))
            .expect("peer holds the lock");
        let until = now_ms() + 60_000;
        let started = Instant::now();
        state.cool_down(until);
        assert!(
            started.elapsed() < Duration::from_millis(200),
            "cool_down blocked the worker for {:?}",
            started.elapsed()
        );
        drop(held);
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let written = std::fs::read(&file)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<KeyFacts>(&bytes).ok())
                .is_some_and(|facts| facts.cooldown_until_ms >= until);
            if written {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "the cooldown never reached the file"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_persisted_budget_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        {
            let budget = GitHubBudget::relaxed();
            let state = budget.key_state(&key, Some(dir.path()));
            state.cool_down(now_ms() + 30_000);
        }
        let mode = std::fs::metadata(dir.path().join(key.file_name()))
            .expect("state file")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn disk_state_round_trips_blocking_facts_only() {
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        let reset = now_ms() / 1000 + 300;
        {
            let budget = GitHubBudget::relaxed();
            let state = budget.key_state(&key, Some(dir.path()));
            let mut headers = HeaderMap::new();
            headers.insert("x-ratelimit-remaining", "42".parse().expect("header"));
            headers.insert(
                "x-ratelimit-reset",
                reset.to_string().parse().expect("header"),
            );
            headers.insert("x-ratelimit-resource", "core".parse().expect("header"));
            state.observe(&headers, "core");
            state.exhaust("search", reset);
            state.cool_down(now_ms() + 30_000);
        }
        let file = dir.path().join(key.file_name());
        let raw: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&file).expect("state file")).expect("json");
        assert!(raw["buckets"].get("core").is_none(), "{raw}");
        assert_eq!(raw["buckets"]["search"]["remaining"], 0);
        // A fresh process (new registry) sees the other process's facts.
        let budget = GitHubBudget::relaxed();
        let state = budget.key_state(&key, Some(dir.path()));
        let search = state.blocked("search", budget.config()).expect("search");
        assert_eq!(search.reset, Some(reset));
        let core = state.blocked("core", budget.config()).expect("cooldown");
        assert_eq!(core.reset, None);
        let leftovers = std::fs::read_dir(dir.path())
            .expect("dir")
            .filter(|entry| {
                entry
                    .as_ref()
                    .is_ok_and(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            })
            .count();
        assert_eq!(leftovers, 0);
    }

    /// Concurrent writers that do not share memory (separate
    /// processes; here separate registries) never drop each other's facts.
    #[test]
    fn concurrent_writers_keep_every_fact() {
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        let now = now_ms();
        std::thread::scope(|scope| {
            for writer in 0..8 {
                let (dir, key) = (dir.path(), &key);
                scope.spawn(move || {
                    let budget = GitHubBudget::relaxed();
                    let state = budget.key_state(key, Some(dir));
                    for round in 0..25 {
                        state.persist_with(|view| {
                            view.last_start_ms.insert(format!("w{writer}-{round}"), now);
                        });
                    }
                });
            }
        });
        let disk: KeyFacts =
            serde_json::from_slice(&std::fs::read(dir.path().join(key.file_name())).expect("file"))
                .expect("json");
        assert_eq!(disk.last_start_ms.len(), 8 * 25);
    }

    /// A peer's write in the same clock tick as the last one seen is still
    /// merged: every write renames a fresh file, so its identity changes even
    /// when its mtime does not.
    #[test]
    fn a_peer_write_with_an_unchanged_mtime_is_still_merged() {
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        let file = dir.path().join(key.file_name());
        let (peer_budget, budget) = (GitHubBudget::relaxed(), GitHubBudget::relaxed());
        let peer = peer_budget.key_state(&key, Some(dir.path()));
        let first = now_ms() + 30_000;
        peer.cool_down(first);
        let mtime = std::fs::metadata(&file)
            .and_then(|meta| meta.modified())
            .expect("mtime");
        let state = budget.key_state(&key, Some(dir.path()));
        state.refresh_from_disk();
        assert_eq!(state.facts().cooldown_until_ms, first);

        let second = first + 30_000;
        peer.cool_down(second);
        std::fs::File::options()
            .write(true)
            .open(&file)
            .and_then(|file| file.set_modified(mtime))
            .expect("same tick");
        state.refresh_from_disk();
        assert_eq!(state.facts().cooldown_until_ms, second);
    }

    /// A repeat of the same blocking fact leaves the file in place; a new
    /// fact replaces it.
    #[cfg(unix)]
    #[test]
    fn an_unchanged_view_is_not_rewritten() {
        use std::os::unix::fs::MetadataExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let key = LimiterKey::new("ghe.example", Some("tok"));
        let budget = GitHubBudget::relaxed();
        let state = budget.key_state(&key, Some(dir.path()));
        let file = dir.path().join(key.file_name());
        let inode = || std::fs::metadata(&file).expect("state file").ino();
        let reset = now_ms() / 1000 + 300;
        state.exhaust("search", reset);
        let first = inode();
        state.exhaust("search", reset);
        assert_eq!(inode(), first, "same view, no rewrite");
        state.cool_down(now_ms() + 30_000);
        assert_ne!(inode(), first, "a new cooldown is written");
    }
}

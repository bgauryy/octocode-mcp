//! One cache store for the runtime: the shared in-process
//! [`octocode_io::memo::Memo`] as its memory tier plus an optional
//! byte-bounded disk tier. The writer picks a [`CacheClass`] per entry, so
//! pinned facts never expire while movable ones age out or revalidate.
pub mod evictions;

use octocode_io::memo::{Memo, MemoLimits};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// An entry's identity. `scope` is opaque to the store: a provider passes
/// its credential [`octocode_github::Partition::identity`], a local memo
/// whatever separates its entries (a path, a parser, a files digest).
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CacheKey {
    pub namespace: String,
    pub scope: String,
    pub resource: String,
}

/// How an entry ages; the writer chooses it, with its window, at `put`.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CacheClass {
    /// Keyed by a content digest or a commit SHA: never expires and is always
    /// fresh. Only the byte budget evicts it.
    Immutable,
    /// Fresh for `fresh`, then returned stale so the caller revalidates it
    /// (ETag; a 304 costs no rate limit). Only the byte budget evicts it.
    Revalidate { fresh: Duration },
    /// Expires `ttl` after it is stored.
    Volatile { ttl: Duration },
}

impl CacheClass {
    fn ttl(self) -> Option<Duration> {
        match self {
            Self::Volatile { ttl } => Some(ttl),
            Self::Immutable | Self::Revalidate { .. } => None,
        }
    }

    /// Freshness of an entry `age` old, or `None` once it expired.
    fn freshness(self, age: Duration) -> Option<bool> {
        match self {
            Self::Immutable => Some(true),
            Self::Revalidate { fresh } => Some(age < fresh),
            Self::Volatile { ttl } => (age < ttl).then_some(true),
        }
    }
}

#[derive(Clone, Debug)]
pub struct CacheConfig {
    pub max_entries: usize,
    /// Memory budget; also the largest single entry either tier accepts.
    pub max_bytes: usize,
    /// Disk budget, pruned oldest-first by modification time.
    pub disk_bytes: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_entries: 4_096,
            max_bytes: 64 * 1024 * 1024,
            disk_bytes: 512 * 1024 * 1024,
        }
    }
}

/// A hit. `fresh` is false only for a [`CacheClass::Revalidate`] entry past
/// its fresh window: the caller must revalidate before serving it.
#[derive(Clone, Debug)]
pub struct Cached<V> {
    pub value: Arc<V>,
    pub fresh: bool,
}

/// The serialized length of `value`, counted without building the text: the
/// weight of a JSON entry.
pub(crate) fn json_len(value: &impl Serialize) -> usize {
    struct Count(usize);
    impl std::io::Write for Count {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 += bytes.len();
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut count = Count(0);
    let _ = serde_json::to_writer(&mut count, value);
    count.0
}

/// [`Memo`] (memory) plus [`Disk`] (optional, across processes).
pub struct Store<V> {
    config: CacheConfig,
    memory: Memo<CacheKey, V, CacheClass>,
    disk: Option<Disk>,
}

impl<V: Serialize + DeserializeOwned> Store<V> {
    /// `disk: None` keeps the store in this process only.
    pub fn new(config: CacheConfig, disk: Option<PathBuf>) -> Self {
        Self {
            disk: disk.map(Disk::new),
            memory: Memo::new(MemoLimits {
                max_entries: config.max_entries,
                max_weight: config.max_bytes,
                keep_newest: false,
            }),
            config,
        }
    }

    pub fn get(&self, key: &CacheKey) -> Option<Cached<V>> {
        if let Some(hit) = self.memory.get(key) {
            // The memo already dropped an expired `Volatile` entry.
            if let Some(fresh) = hit.meta.freshness(hit.age) {
                return Some(Cached {
                    value: hit.value,
                    fresh,
                });
            }
            self.memory.remove(key);
        }
        self.read_disk(key)
    }

    /// Mutable retained work is read under its owner's transaction lock.
    /// Persistent state must observe another process's latest write, including
    /// eviction or expiry, rather than revive an older memory entry.
    pub(crate) fn get_current(&self, key: &CacheKey) -> Option<Cached<V>> {
        if self.disk.is_none() {
            return self.get(key);
        }
        self.memory.remove(key);
        self.read_disk(key)
    }

    fn read_disk(&self, key: &CacheKey) -> Option<Cached<V>> {
        let (value, class, age, bytes) = self.disk.as_ref()?.read::<V>(key, &self.config)?;
        let fresh = class.freshness(age)?;
        let now = Instant::now();
        let stored_at = now.checked_sub(age).unwrap_or(now);
        let value =
            self.memory
                .insert_full(key.clone(), value, class, bytes, class.ttl(), stored_at);
        Some(Cached { value, fresh })
    }

    /// Store `value` (about `bytes` large) in memory and, when configured, on
    /// disk. An entry larger than the memory budget is not stored at all.
    /// The stored value is returned, shared with the entry.
    pub fn put(&self, key: CacheKey, value: V, bytes: usize, class: CacheClass) -> Arc<V> {
        self.put_confirmed(key, value, bytes, class).0
    }

    /// Whether the value was retained in every configured tier. A result
    /// continuation must check this before advertising saved pages.
    pub fn put_confirmed(
        &self,
        key: CacheKey,
        value: V,
        bytes: usize,
        class: CacheClass,
    ) -> (Arc<V>, bool) {
        if self.config.max_entries == 0 || bytes > self.config.max_bytes {
            return (Arc::new(value), false);
        }
        let saved = self
            .disk
            .as_ref()
            .is_none_or(|disk| disk.write(&key, &value, class, &self.config));
        let value = self
            .memory
            .insert_full(key, value, class, bytes, class.ttl(), Instant::now());
        (value, saved)
    }

    /// Drop `key` from both tiers.
    pub fn remove(&self, key: &CacheKey) {
        self.memory.remove(key);
        if let Some(disk) = &self.disk {
            let _ = fs::remove_file(disk.file(key));
        }
    }

    pub fn clear_memory(&self) {
        self.memory.clear();
    }

    pub fn clear(&self) {
        self.clear_memory();
        if let Some(disk) = &self.disk {
            disk.clear();
        }
    }
}

/// Disk scans are O(files); amortize them across writes.
const PRUNE_EVERY_WRITES: usize = 64;
/// Cross-process throttle: one-shot CLI processes each write a few entries, so
/// a marker file bounds pruning to once per interval across processes.
const PRUNE_INTERVAL: Duration = Duration::from_secs(60);
const PRUNE_MARKER: &str = ".last-prune";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskEntryRef<'a, V> {
    class: CacheClass,
    stored_at_unix: u64,
    value: &'a V,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskEntry<V> {
    class: CacheClass,
    stored_at_unix: u64,
    value: V,
}

/// Age past which a `.tmp` file in the store is a crash leftover; a live
/// write holds its temp file for milliseconds.
const ORPHAN_TEMP_AGE: Duration = Duration::from_secs(10 * 60);

/// Whether a failed read means the entry itself is unusable (a symlink, a
/// non-regular file, or past the entry bound), not that reading it failed for
/// an environmental reason such as permissions or open-file limits.
fn entry_is_invalid(error: &std::io::Error) -> bool {
    if error.kind() == std::io::ErrorKind::InvalidInput {
        return true;
    }
    // `O_NOFOLLOW` reports a symlink swapped in after the type check as ELOOP.
    #[cfg(unix)]
    if error.raw_os_error() == Some(libc::ELOOP) {
        return true;
    }
    false
}

/// How much of an entry file [`expired`] reads: its class and store time
/// lead the file ([`DiskEntryRef`] writes `value` last).
const HEADER_BYTES: usize = 512;

/// Whether the entry file at `path` is past its class's lifetime, read from
/// its leading `class` and `storedAtUnix` fields alone, never its value. A
/// file whose header does not parse is not judged here (its read evicts it).
fn expired(path: &std::path::Path, now: u64) -> bool {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Header {
        class: CacheClass,
        stored_at_unix: u64,
    }
    let Ok(file) = crate::private_file::open_no_follow(path, false) else {
        return false;
    };
    let mut head = Vec::with_capacity(HEADER_BYTES);
    if std::io::Read::read_to_end(
        &mut std::io::Read::take(&file, HEADER_BYTES as u64),
        &mut head,
    )
    .is_err()
    {
        return false;
    }
    let Some(end) = head
        .windows(b",\"value\":".len())
        .position(|window| window == b",\"value\":")
    else {
        return false;
    };
    let mut header = head[..end].to_vec();
    header.push(b'}');
    serde_json::from_slice::<Header>(&header).is_ok_and(|header| {
        let age = Duration::from_secs(now.saturating_sub(header.stored_at_unix));
        header.class.freshness(age).is_none()
    })
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

struct Disk {
    dir: PathBuf,
    /// Writes by this process: pruning runs on the first and then every
    /// [`PRUNE_EVERY_WRITES`] writes instead of scanning per write.
    writes: AtomicUsize,
}

impl Disk {
    fn new(dir: PathBuf) -> Self {
        let _ = octocode_io::atomic::create_private_dir_all(&dir);
        Self {
            dir,
            writes: AtomicUsize::new(0),
        }
    }

    fn file(&self, key: &CacheKey) -> PathBuf {
        let mut digest = Sha256::new();
        // Domain separation: files of an older layout are never read.
        // v2: bodies are base64 only (the number-array form was retired).
        // v3: one opaque scope replaced the endpoint/credential pair.
        digest.update(b"octocode-cache-store-v3");
        for value in [&key.namespace, &key.scope, &key.resource] {
            digest.update((value.len() as u64).to_le_bytes());
            digest.update(value.as_bytes());
        }
        self.dir
            .join(format!("{}.json", hex::encode(digest.finalize())))
    }

    fn read<V: DeserializeOwned>(
        &self,
        key: &CacheKey,
        config: &CacheConfig,
    ) -> Option<(V, CacheClass, Duration, usize)> {
        let path = self.file(key);
        // An entry is only a regular file this store could have written: a
        // FIFO, device, symlink, or file past the entry bound is evicted.
        let read = crate::private_file::open_no_follow(&path, false).and_then(|file| {
            let bytes = crate::private_file::read_limited(&file, config.max_bytes as u64)?;
            Ok((file, bytes))
        });
        let (file, bytes) = match read {
            Ok(read) => read,
            Err(error) => {
                if entry_is_invalid(&error) {
                    let _ = fs::remove_file(&path);
                }
                return None;
            }
        };
        let Ok(entry) = serde_json::from_slice::<DiskEntry<V>>(&bytes) else {
            let _ = fs::remove_file(&path);
            return None;
        };
        let age = Duration::from_secs(now_unix().saturating_sub(entry.stored_at_unix));
        if entry.class.freshness(age).is_none() {
            let _ = fs::remove_file(&path);
            return None;
        }
        // A read counts as use for the oldest-first pruning. A read-only
        // handle may not set times (Windows), so a writer is the fallback.
        let now = SystemTime::now();
        if file.set_modified(now).is_err()
            && let Ok(writer) = fs::File::options().write(true).open(&path)
        {
            let _ = writer.set_modified(now);
        }
        Some((entry.value, entry.class, age, bytes.len()))
    }

    fn write<V: Serialize>(
        &self,
        key: &CacheKey,
        value: &V,
        class: CacheClass,
        config: &CacheConfig,
    ) -> bool {
        let path = self.file(key);
        let entry = DiskEntryRef {
            class,
            stored_at_unix: now_unix(),
            value,
        };
        let Ok(bytes) = serde_json::to_vec(&entry) else {
            return false;
        };
        if bytes.len() > config.max_bytes {
            return false;
        }
        // Owner-only replacement: values may be private source, and an
        // in-place rewrite would keep a pre-existing file's loose mode.
        if octocode_io::atomic::write_atomic(&path, &bytes, false).is_err() {
            return false;
        }
        if self
            .writes
            .fetch_add(1, Ordering::Relaxed)
            .is_multiple_of(PRUNE_EVERY_WRITES)
            && self.prune_due()
        {
            self.prune(config.disk_bytes);
        }
        path.is_file()
    }

    /// True when no process pruned within [`PRUNE_INTERVAL`]; claims the slot
    /// by touching the marker.
    fn prune_due(&self) -> bool {
        let marker = self.dir.join(PRUNE_MARKER);
        let recent = fs::metadata(&marker)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|elapsed| elapsed < PRUNE_INTERVAL);
        if recent {
            return false;
        }
        let _ = fs::write(&marker, b"");
        true
    }

    /// Remove expired entries, then keep the directory within `budget`
    /// bytes, removing the least recently used files first.
    fn prune(&self, budget: u64) {
        let Ok(read_dir) = fs::read_dir(&self.dir) else {
            return;
        };
        let now = SystemTime::now();
        let unix_now = now_unix();
        let mut files: Vec<(SystemTime, u64, PathBuf)> = read_dir
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                let meta = entry.metadata().ok()?;
                let modified = meta.modified().ok()?;
                match path.extension().and_then(|ext| ext.to_str()) {
                    // An entry past its `Volatile` TTL is dead weight a read
                    // would delete anyway: it goes before any live one.
                    Some("json") if expired(&path, unix_now) => {
                        let _ = fs::remove_file(&path);
                        None
                    }
                    Some("json") => Some((modified, meta.len(), path)),
                    // A temp file older than any write could take is a crash
                    // leftover from between the temp write and the rename.
                    Some("tmp") => {
                        if now
                            .duration_since(modified)
                            .is_ok_and(|age| age > ORPHAN_TEMP_AGE)
                        {
                            let _ = fs::remove_file(&path);
                        }
                        None
                    }
                    _ => None,
                }
            })
            .collect();
        let mut total: u64 = files.iter().map(|(_, len, _)| len).sum();
        if total <= budget {
            return;
        }
        files.sort_by_key(|(mtime, _, _)| *mtime);
        for (_, len, path) in files {
            if total <= budget {
                break;
            }
            if fs::remove_file(path).is_ok() {
                total = total.saturating_sub(len);
            }
        }
    }

    fn clear(&self) {
        let _ = fs::remove_dir_all(&self.dir);
        let _ = octocode_io::atomic::create_private_dir_all(&self.dir);
    }
}

#[cfg(test)]
pub(crate) mod tests;

#[cfg(test)]
mod current_tests {
    use super::*;

    #[test]
    fn current_reads_other_process_progress_and_does_not_revive_evicted_memory() {
        let directory = tempfile::tempdir().expect("cache directory");
        let first = Store::<String>::new(CacheConfig::default(), Some(directory.path().to_owned()));
        let second =
            Store::<String>::new(CacheConfig::default(), Some(directory.path().to_owned()));
        let key = CacheKey {
            namespace: "assessment".into(),
            scope: "same-access".into(),
            resource: "plan".into(),
        };
        first.put(key.clone(), "pending".into(), 16, CacheClass::Immutable);
        second.put(key.clone(), "complete".into(), 16, CacheClass::Immutable);
        assert_eq!(
            first.get(&key).expect("old memory receipt").value.as_str(),
            "pending"
        );
        assert_eq!(
            first
                .get_current(&key)
                .expect("latest committed progress")
                .value
                .as_str(),
            "complete"
        );
        second.remove(&key);
        assert!(
            first.get_current(&key).is_none(),
            "disk eviction is authoritative"
        );
        assert!(first.get(&key).is_none(), "stale memory was removed");
    }

    #[test]
    fn current_memory_reads_keep_the_memory_only_policy() {
        let store = Store::<String>::new(CacheConfig::default(), None);
        let key = CacheKey {
            namespace: "assessment".into(),
            scope: "session".into(),
            resource: "plan".into(),
        };
        store.put(key.clone(), "retained".into(), 16, CacheClass::Immutable);
        assert_eq!(
            store
                .get_current(&key)
                .expect("in-process progress")
                .value
                .as_str(),
            "retained"
        );
    }
}

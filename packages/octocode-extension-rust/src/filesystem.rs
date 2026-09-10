use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock, Weak,
};

#[cfg(unix)]
#[path = "unix.rs"]
pub(crate) mod platform;
#[cfg(windows)]
#[path = "windows.rs"]
pub(crate) mod platform;

#[derive(Debug)]
pub struct Snapshot {
    pub exists: bool,
    pub kind: String,
    pub version: String,
    pub digest: Option<String>,
    pub content: Option<Vec<u8>>,
    pub mode: Option<u32>,
    pub size: u64,
}

#[derive(Debug)]
pub struct Receipt {
    pub committed: bool,
    pub durable: bool,
    pub warnings: Vec<String>,
    pub bytes: u64,
}

pub type FsResult<T> = Result<T, String>;

pub fn check_cancelled(cancelled: &AtomicBool) -> FsResult<()> {
    if cancelled.load(Ordering::Acquire) {
        Err("CANCELLED: File operation cancelled before commit".into())
    } else {
        Ok(())
    }
}

type PathLocks = Mutex<HashMap<String, Weak<Mutex<()>>>>;
static LOCKS: OnceLock<PathLocks> = OnceLock::new();

fn path_lock(path: &str) -> FsResult<Arc<Mutex<()>>> {
    // Windows opens use the conventional case-insensitive namespace. Namespace
    // prefixes and spelling aliases must share the same cooperative queue.
    #[cfg(windows)]
    let key = windows_path_key(path);
    #[cfg(windows)]
    let path = key.as_str();
    let mut locks = LOCKS
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|_| "IO_FAILURE: File queue is unavailable")?;
    locks.retain(|_, value| value.strong_count() > 0);
    if let Some(lock) = locks.get(path).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(path.to_owned(), Arc::downgrade(&lock));
    Ok(lock)
}

#[cfg(windows)]
fn windows_path_key(path: &str) -> String {
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}").to_lowercase()
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(path).to_lowercase()
    }
}

pub fn snapshot(path: &str, maximum: usize, content: bool, symlink: bool) -> FsResult<Snapshot> {
    snapshot_cancellable(path, maximum, content, symlink, &AtomicBool::new(false))
}

pub fn snapshot_cancellable(
    path: &str,
    maximum: usize,
    content: bool,
    symlink: bool,
    cancelled: &AtomicBool,
) -> FsResult<Snapshot> {
    #[cfg(any(unix, windows))]
    {
        platform::snapshot(path, maximum, content, symlink, cancelled)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (path, maximum, content, symlink);
        Err("UNSUPPORTED_PLATFORM: Native contained file operations require Unix or Windows".into())
    }
}

pub fn replace(
    path: &str,
    bytes: &[u8],
    expected: &str,
    maximum: usize,
    mode: Option<u32>,
    cancelled: &AtomicBool,
    parent_mode: Option<u32>,
) -> FsResult<Receipt> {
    if parent_mode.is_some_and(|mode| mode != 0o700) {
        return Err("INVALID_MODE: Parent mode supports only 0700".into());
    }
    let lock = path_lock(path)?;
    let _guard = lock
        .lock()
        .map_err(|_| "IO_FAILURE: File queue is unavailable")?;
    check_cancelled(cancelled)?;
    #[cfg(any(unix, windows))]
    {
        platform::replace(path, bytes, expected, maximum, mode, cancelled, parent_mode)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (bytes, expected, maximum, mode, parent_mode);
        Err("UNSUPPORTED_PLATFORM: Native contained file operations require Unix or Windows".into())
    }
}

pub fn delete(
    path: &str,
    expected: &str,
    maximum: usize,
    cancelled: &AtomicBool,
) -> FsResult<Receipt> {
    let lock = path_lock(path)?;
    let _guard = lock
        .lock()
        .map_err(|_| "IO_FAILURE: File queue is unavailable")?;
    check_cancelled(cancelled)?;
    #[cfg(any(unix, windows))]
    {
        platform::delete(path, expected, maximum, cancelled)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (expected, maximum);
        Err("UNSUPPORTED_PLATFORM: Native contained file operations require Unix or Windows".into())
    }
}

#[cfg(all(test, any(unix, windows)))]
mod tests {
    use super::*;
    #[test]
    fn invalid_parent_mode_fails_at_native_boundary_before_filesystem_side_effects() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .canonicalize()
            .unwrap()
            .join("missing")
            .join("file");
        let error = replace(
            path.to_str().unwrap(),
            b"wrong",
            "unused",
            100,
            None,
            &AtomicBool::new(false),
            Some(0o777),
        )
        .unwrap_err();
        assert!(error.starts_with("INVALID_MODE:"));
        assert!(!path.parent().unwrap().exists());
    }

    #[test]
    fn bounded_snapshot_reads_exact_content_and_stable_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().canonicalize().unwrap().join("file");
        std::fs::write(&path, b"hello").unwrap();
        let first = snapshot(path.to_str().unwrap(), 5, true, false).unwrap();
        assert_eq!(first.content.unwrap(), b"hello");
        let second = snapshot(path.to_str().unwrap(), 5, false, false).unwrap();
        assert_eq!(first.version, second.version);
        assert!(second.content.is_none());
        assert!(snapshot(path.to_str().unwrap(), 4, true, false).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_namespace_and_case_aliases_share_queue() {
        let plain = path_lock(r"C:\repo\file").unwrap();
        let prefixed = path_lock(r"\\?\c:\REPO\FILE").unwrap();
        assert!(Arc::ptr_eq(&plain, &prefixed));
        let unc = path_lock(r"\\server\share\file").unwrap();
        let prefixed_unc = path_lock(r"\\?\UNC\SERVER\SHARE\FILE").unwrap();
        assert!(Arc::ptr_eq(&unc, &prefixed_unc));
    }
}

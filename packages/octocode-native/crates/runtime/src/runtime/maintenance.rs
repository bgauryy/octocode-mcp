//! Shared 24-hour sweep of native tmp caches.
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

const INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const MARKER: &str = ".last-cache-maintenance";

/// Sweeps only an existing `<home>/tmp`: when no cache dir was ever created
/// (e.g. `storage.mode=memory` on a fresh home) there is nothing to sweep and
/// nothing is written. `capture_ttl` is the URL capture retention, the same
/// value each capture publishes as its `expiresAt`.
pub fn run_if_due(home: &Path, capture_ttl: Duration) -> bool {
    let tmp = home.join("tmp");
    if !tmp.is_dir() {
        return false;
    }
    let marker = tmp.join(MARKER);
    if let Ok(text) = fs::read_to_string(&marker)
        && let Ok(epoch) = text.trim().parse::<u64>()
    {
        let last = SystemTime::UNIX_EPOCH + Duration::from_secs(epoch);
        if last.elapsed().is_ok_and(|elapsed| elapsed < INTERVAL) {
            return false;
        }
    }
    // Clone entries may contain local edits. Their lock/status-aware eviction
    // runs through ghCloneRepo; a directory-age sweep cannot safely remove them.
    // The response and registry caches (`tmp/response`, `tmp/artifact`) age
    // by entry class and byte budget in their own store, which alone evicts
    // them: an age sweep would drop entries the store keeps.
    // `tmp/tree` is written by octocode-mcp 19.x, which shares this home;
    // native never reads it, so aged entries are cleared here.
    sweep_dir(&tmp.join("tree"), INTERVAL);
    sweep_dir(&tmp.join("materialize").join("v2"), INTERVAL);
    // Rate-limit mirrors only hold facts that expire within ~1h.
    sweep_dir(&tmp.join("ratelimit"), INTERVAL);
    // URL captures are content-addressed directories, rewritten on every
    // recapture of the same text, so their age is their last capture.
    sweep_dir(
        &crate::tools::source_capture::url::capture_root(home),
        capture_ttl,
    );
    let epoch = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let _ = fs::write(marker, epoch.to_string());
    true
}

fn sweep_dir(path: &PathBuf, max_age: Duration) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let stale = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > max_age);
        if stale {
            if metadata.is_dir() {
                let _ = fs::remove_dir_all(path);
            } else {
                let _ = fs::remove_file(path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_home_without_tmp_writes_nothing() {
        let home = tempfile::tempdir().unwrap();
        assert!(!run_if_due(home.path(), INTERVAL));
        assert!(!home.path().join("tmp").exists());
    }

    #[test]
    fn automatic_maintenance_preserves_clone_evidence_under_an_old_owner_directory() {
        let home = tempfile::tempdir().unwrap();
        let owner = home.path().join("tmp/clone/owner");
        let checkout = owner.join("repo/main");
        fs::create_dir_all(&checkout).unwrap();
        let evidence = checkout.join("local-notes.txt");
        fs::write(&evidence, "uncommitted evidence").unwrap();
        let old = SystemTime::now() - INTERVAL * 2;
        fs::File::open(&owner)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(old))
            .unwrap();
        assert!(run_if_due(home.path(), INTERVAL));
        assert_eq!(
            fs::read_to_string(evidence).unwrap(),
            "uncommitted evidence"
        );
    }

    /// Response and registry caches age by their own entry class and byte
    /// budget (`cache::Disk::prune`); the daily sweep never removes an
    /// entry the store keeps, however old its file.
    #[test]
    fn maintenance_leaves_store_owned_cache_entries_to_the_store() {
        let home = tempfile::tempdir().unwrap();
        let old = SystemTime::now() - INTERVAL * 2;
        let mut kept = Vec::new();
        for dir in ["response", "artifact"] {
            let dir = home.path().join("tmp").join(dir);
            fs::create_dir_all(&dir).unwrap();
            let pinned = dir.join("pinned.json");
            fs::write(&pinned, "{}").unwrap();
            fs::File::options()
                .write(true)
                .open(&pinned)
                .unwrap()
                .set_times(fs::FileTimes::new().set_modified(old))
                .unwrap();
            kept.push(pinned);
        }
        let stale_tree = home.path().join("tmp/tree/old");
        fs::create_dir_all(&stale_tree).unwrap();
        fs::File::open(&stale_tree)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(old))
            .unwrap();
        assert!(run_if_due(home.path(), INTERVAL));
        for pinned in kept {
            assert!(pinned.exists(), "{}", pinned.display());
        }
        assert!(!stale_tree.exists(), "tmp/tree still ages out");
    }

    fn age(path: &Path, by: Duration) {
        fs::File::open(path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(SystemTime::now() - by))
            .unwrap();
    }

    /// A URL capture outlives its published `expiresAt` by at most one sweep
    /// interval; a capture still inside its retention is kept.
    #[test]
    fn url_captures_past_their_retention_are_removed() {
        let home = tempfile::tempdir().unwrap();
        let retention = Duration::from_secs(60 * 60);
        let root = crate::tools::source_capture::url::capture_root(home.path());
        let expired = root.join("expired");
        let live = root.join("live");
        for capture in [&expired, &live] {
            fs::create_dir_all(capture).unwrap();
            fs::write(capture.join("source.txt"), "captured text").unwrap();
        }
        age(&expired, retention * 2);
        age(&live, retention / 2);
        assert!(run_if_due(home.path(), retention));
        assert!(!expired.exists(), "an expired capture is removed");
        assert_eq!(
            fs::read_to_string(live.join("source.txt")).unwrap(),
            "captured text"
        );
    }

    #[test]
    fn existing_tmp_is_swept_once_and_writes_only_the_marker() {
        let home = tempfile::tempdir().unwrap();
        let tmp = home.path().join("tmp");
        fs::create_dir_all(&tmp).unwrap();
        assert!(run_if_due(home.path(), INTERVAL));
        assert!(tmp.join(MARKER).is_file());
        assert!(!tmp.join("session-stats.json").exists());
        assert!(!run_if_due(home.path(), INTERVAL));
    }
}

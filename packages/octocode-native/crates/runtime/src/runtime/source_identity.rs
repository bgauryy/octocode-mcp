//! Whether a stored page's sources are still what they were when it ran, so
//! its replay equals a re-execution. A source that cannot be proven unchanged
//! is never replayed: the call re-executes, exactly as a fresh runtime does.
use crate::policy::path::PathPolicy;
use crate::tools::id::{ToolFamily, ToolId};
use serde_json::Value;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, SystemTime};

/// Entries one check may stat; a larger source re-executes every page.
const MAX_ENTRIES: usize = 20_000;
/// Entries a walk visits on the calling thread before it goes parallel.
const SERIAL_ENTRIES: usize = 1_024;
/// An entry modified this close to the original call may have changed while
/// it ran (or within the file system's timestamp granularity).
const SETTLE: Duration = Duration::from_secs(2);

/// True when the sources `queries` read provably did not change since the
/// call that started at `started`. Local rows: no entry under their `path`
/// that the row could read (the root included; symlinks unfollowed; hidden
/// and gitignored entries only when the row asks for them, as its walk does)
/// was modified, created, renamed, or removed since `started` minus
/// [`SETTLE`]: a creation, rename, or removal touches its directory. VCS
/// metadata and build output churn therefore never force a re-execution.
/// GitHub rows: each pins a commit SHA, which never moves. Other sources:
/// never.
pub(super) fn unchanged_since(
    tool: ToolId,
    queries: &[Value],
    paths: &PathPolicy,
    started: SystemTime,
) -> bool {
    match tool.family() {
        ToolFamily::Local => {
            let settled = started
                .checked_sub(SETTLE)
                .unwrap_or(SystemTime::UNIX_EPOCH);
            queries.iter().all(|row| {
                let root = row["path"].as_str().unwrap_or(".");
                settled_tree(
                    &paths.expand_and_resolve(Path::new(root)),
                    Reach::of(row),
                    settled,
                )
            })
        }
        ToolFamily::GitHub => queries
            .iter()
            .all(|row| row["ref"].as_str().is_some_and(super::git_head::is_sha)),
        ToolFamily::Remote => false,
    }
}

/// Every entry under `root` exists, is readable, and was last modified
/// before `settled`, within [`MAX_ENTRIES`].
///
/// A walk of at most [`SERIAL_ENTRIES`] entries runs on the calling thread:
/// the parallel walker spawns a worker pool and its idle workers poll in 1 ms
/// sleeps, which costs milliseconds on a small tree. A larger tree restarts as
/// a parallel walk, which stats its entries concurrently.
fn settled_tree(root: &Path, reach: Reach, settled: SystemTime) -> bool {
    let walk = walker(root, reach);
    for (seen, entry) in walk.build().enumerate() {
        if seen == SERIAL_ENTRIES {
            return settled_parallel(root, reach, settled);
        }
        if !entry_settled(entry, settled) {
            return false;
        }
    }
    true
}

fn settled_parallel(root: &Path, reach: Reach, settled: SystemTime) -> bool {
    let fresh = AtomicBool::new(true);
    let count = AtomicUsize::new(0);
    walker(root, reach).build_parallel().run(|| {
        Box::new(|entry| {
            if count.fetch_add(1, Ordering::Relaxed) < MAX_ENTRIES && entry_settled(entry, settled)
            {
                ignore::WalkState::Continue
            } else {
                fresh.store(false, Ordering::Relaxed);
                ignore::WalkState::Quit
            }
        })
    });
    fresh.into_inner()
}

/// What a row's own walk can read: hidden entries, and gitignored ones.
#[derive(Clone, Copy)]
struct Reach {
    hidden: bool,
    ignored: bool,
}

impl Reach {
    /// `includeIgnored` reads everything; `includeHidden` reads hidden
    /// entries (and defaults to `includeIgnored`).
    fn of(row: &Value) -> Self {
        let ignored = row["includeIgnored"].as_bool() == Some(true);
        Self {
            hidden: row["includeHidden"].as_bool().unwrap_or(ignored),
            ignored,
        }
    }
}

fn walker(root: &Path, reach: Reach) -> ignore::WalkBuilder {
    let mut walk = ignore::WalkBuilder::new(root);
    walk.standard_filters(!reach.ignored)
        .hidden(!reach.hidden)
        .follow_links(false);
    walk
}

fn entry_settled(entry: Result<ignore::DirEntry, ignore::Error>, settled: SystemTime) -> bool {
    entry
        .ok()
        .and_then(|entry| entry.metadata().ok())
        .and_then(|metadata| metadata.modified().ok())
        .is_some_and(|modified| modified < settled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::test_support::workspace_policy as policy;

    fn age(path: &Path) {
        let then = SystemTime::now() - Duration::from_secs(10);
        std::fs::File::open(path)
            .unwrap()
            .set_modified(then)
            .unwrap();
    }

    #[test]
    fn local_sources_are_unchanged_until_any_entry_moves() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let src = root.join("src");
        std::fs::create_dir(&src).unwrap();
        std::fs::write(src.join("a.txt"), "one").unwrap();
        let paths = policy(&root);
        let rows = [serde_json::json!({"path": "src"})];
        let check = || unchanged_since(ToolId::LocalSearch, &rows, &paths, SystemTime::now());
        assert!(!check(), "just written: not yet settled");
        age(&src.join("a.txt"));
        age(&src);
        assert!(check());
        std::fs::write(src.join("a.txt"), "two").unwrap();
        assert!(!check(), "edit");
        age(&src.join("a.txt"));
        assert!(check());
        std::fs::write(src.join("new.txt"), "").unwrap();
        std::fs::remove_file(src.join("new.txt")).unwrap();
        assert!(!check(), "a created and removed file touches its directory");
        age(&src);
        std::fs::remove_dir_all(&src).unwrap();
        assert!(!check(), "a missing root is never unchanged");
    }

    #[test]
    fn a_tree_past_the_serial_walk_is_checked_in_parallel() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let files: Vec<_> = (0..=SERIAL_ENTRIES)
            .map(|index| {
                let file = root.join(format!("dir{}/file{index}.txt", index % 7));
                std::fs::create_dir_all(file.parent().unwrap()).unwrap();
                std::fs::write(&file, "x").unwrap();
                file
            })
            .collect();
        let settled = SystemTime::now() - Duration::from_secs(5);
        let age_all = || {
            for entry in ignore::WalkBuilder::new(&root).build().flatten() {
                age(entry.path());
            }
        };
        age_all();
        let reach = Reach {
            hidden: false,
            ignored: false,
        };
        assert!(settled_tree(&root, reach, settled));
        std::fs::write(&files[SERIAL_ENTRIES], "y").unwrap();
        assert!(
            !settled_tree(&root, reach, settled),
            "edit past the serial walk"
        );
    }

    #[test]
    fn vcs_and_ignored_churn_does_not_force_a_re_execution() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("target")).unwrap();
        std::fs::write(root.join(".gitignore"), "target/\n").unwrap();
        std::fs::write(root.join("a.txt"), "one").unwrap();
        for entry in ignore::WalkBuilder::new(&root)
            .standard_filters(false)
            .build()
            .flatten()
        {
            age(entry.path());
        }
        let paths = policy(&root);
        // Aged entries predate the call; the churn below follows it.
        let started = SystemTime::now() - Duration::from_secs(5);
        std::fs::write(root.join(".git/index"), "churn").unwrap();
        std::fs::write(root.join("target/out.o"), "build").unwrap();
        let rows = [serde_json::json!({"path": "."})];
        let fresh = |rows: &[Value]| unchanged_since(ToolId::LocalSearch, rows, &paths, started);
        assert!(fresh(&rows), "VCS metadata and ignored build output");
        let everything = [serde_json::json!({"path": ".", "includeIgnored": true})];
        assert!(!fresh(&everything), "a row reading ignored files sees them");
    }

    #[test]
    fn github_rows_are_unchanged_only_at_commit_shas() {
        let dir = tempfile::tempdir().unwrap();
        let paths = policy(dir.path());
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let check = |tool, rows: &[Value]| unchanged_since(tool, rows, &paths, SystemTime::now());
        assert!(check(
            ToolId::GhGetFileContent,
            &[serde_json::json!({"ref": sha})]
        ));
        assert!(!check(
            ToolId::GhGetFileContent,
            &[
                serde_json::json!({"ref": sha}),
                serde_json::json!({"ref": "main"})
            ]
        ));
        assert!(!check(ToolId::GhSearchCode, &[serde_json::json!({})]));
        assert!(!check(ToolId::ArtifactSearch, &[serde_json::json!({})]));
    }
}

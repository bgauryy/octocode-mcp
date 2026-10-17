//! What makes a directory a repository root: the one rule the walk's
//! `.gitignore` scope, graph freshness and workspace boundaries share.

use std::path::Path;

/// The entries whose presence makes a directory a repository root: a git
/// checkout (a `.git` directory, or a worktree's `.git` file) or a Jujutsu
/// one (`.jj`), whose `.gitignore` files apply like git's.
pub const MARKERS: [&str; 2] = [".git", ".jj"];

/// Whether `dir` is a repository root ([`MARKERS`]).
#[must_use]
pub fn is_root(dir: &Path) -> bool {
    MARKERS.iter().any(|marker| dir.join(marker).exists())
}

/// The nearest repository root at or above `path`.
#[must_use]
pub fn nearest(path: &Path) -> Option<&Path> {
    path.ancestors().find(|dir| is_root(dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_git_or_jujutsu_marker_makes_a_repository_root() {
        let base = tempfile::tempdir().expect("tempdir");
        let nested = base.path().join("a/b");
        std::fs::create_dir_all(&nested).expect("dirs");
        assert!(!is_root(base.path()));
        assert_eq!(nearest(&nested), None);
        for marker in MARKERS {
            let checkout = base.path().join(marker.trim_start_matches('.'));
            let inner = checkout.join("src");
            std::fs::create_dir_all(&inner).expect("dirs");
            std::fs::create_dir(checkout.join(marker)).expect("marker");
            assert!(is_root(&checkout), "{marker}");
            assert_eq!(nearest(&inner), Some(checkout.as_path()), "{marker}");
        }
        // A worktree's `.git` is a file naming its git directory.
        std::fs::write(base.path().join("a/.git"), "gitdir: ../x\n").expect("gitfile");
        assert_eq!(nearest(&nested), Some(base.path().join("a").as_path()));
    }
}

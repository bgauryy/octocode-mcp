//! The one walk policy every local tool shares: which ignore rules apply,
//! which dot entries and directory names are skipped, and how a walk is
//! cancelled.
//!
//! Ignore rules are standard gitignore semantics as the `ignore` crate
//! implements them: `.gitignore` files (inside a git repository only),
//! `.ignore` files, the global gitignore, `.git/info/exclude`, and the ignore
//! files of the directories above the walked root. `includeIgnored` lifts
//! every source at once. [`walk_builder`] applies the rules inside a walk;
//! [`IgnoreRules`] answers the same question for one path, and says which
//! rule decided it.

use std::collections::{HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use ignore::{Match, WalkBuilder};

/// Which paths a walk leaves out, derived once from a request's
/// `includeIgnored` and `includeHidden` flags.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct IgnorePolicy {
    /// `includeIgnored`: walk what ignore files exclude. Lifts every source:
    /// `.gitignore`, `.ignore`, the global gitignore, `.git/info/exclude`,
    /// and the ignore files above the root.
    pub include_ignored: bool,
    /// `includeHidden`: walk dot files and dot directories.
    pub include_hidden: bool,
}

impl IgnorePolicy {
    /// The policy of a request's optional flags (both default off).
    pub fn new(include_ignored: Option<bool>, include_hidden: Option<bool>) -> Self {
        Self {
            include_ignored: include_ignored == Some(true),
            include_hidden: include_hidden == Some(true),
        }
    }

    /// Everything walked: no ignore rule and no dot entry left out.
    pub const ALL: Self = Self {
        include_ignored: true,
        include_hidden: true,
    };
}

/// A walk's cancellation: polled between entries; `true` ends the walk.
pub type Stop<'a> = dyn Fn() -> bool + Sync + 'a;

/// A walker over `root` under `policy`, with symlinks unfollowed.
/// `max_depth` is in `ignore` terms: the root is depth 0, its entries depth 1.
/// Callers add overrides, file types, ordering, and pruning.
pub fn walk_builder(root: &Path, policy: IgnorePolicy, max_depth: Option<usize>) -> WalkBuilder {
    let rules = !policy.include_ignored;
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(!policy.include_hidden)
        .ignore(rules)
        .git_ignore(rules)
        .git_global(rules)
        .git_exclude(rules)
        .parents(rules)
        .require_git(true)
        .follow_links(false)
        .max_depth(max_depth);
    builder
}

/// [`walk_builder`] that never descends into a directory `prune` names (the
/// root itself is always walked).
pub fn pruned_walk_builder(
    root: &Path,
    policy: IgnorePolicy,
    max_depth: Option<usize>,
    prune: Prune,
) -> WalkBuilder {
    let mut builder = walk_builder(root, policy, max_depth);
    builder.filter_entry(move |entry| !prune.prunes_entry(entry));
    builder
}

/// Directory names a walk never descends into, at any depth below its root.
/// The engine has no default list: the runtime prune policy names them.
#[derive(Clone, Debug, Default)]
pub struct Prune(Arc<HashSet<OsString>>);

impl Prune {
    pub fn new<S: AsRef<OsStr>>(names: impl IntoIterator<Item = S>) -> Self {
        Self(Arc::new(
            names
                .into_iter()
                .map(|name| name.as_ref().to_os_string())
                .collect(),
        ))
    }

    /// Whether a directory named `name` is pruned.
    pub fn names(&self, name: &OsStr) -> bool {
        self.0.contains(name)
    }

    /// Whether a walked entry is a pruned directory below the root.
    pub fn prunes_entry(&self, entry: &ignore::DirEntry) -> bool {
        entry.depth() > 0
            && entry.file_type().is_some_and(|kind| kind.is_dir())
            && self.names(entry.file_name())
    }
}

/// The ignore rule that keeps a path out of a walk.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IgnoreReason {
    /// The topmost entry on the way to the path that the rule leaves out (a
    /// walk never enters an ignored directory).
    pub entry: PathBuf,
    /// The ignore file the rule is in, spelled under the walk root's own
    /// path; `None` for a rule with no file.
    pub source: Option<PathBuf>,
    /// The rule's 1-based line in `source`, when it can be found.
    pub line: Option<usize>,
    /// The rule as written.
    pub pattern: String,
}

/// The ignore rules of one directory.
struct Level {
    /// `.ignore`: applies with or without a repository.
    dot_ignore: Gitignore,
    /// `.gitignore`: applies inside a git repository only.
    gitignore: Gitignore,
    /// The repository's `info/exclude`, for a directory holding `.git`.
    exclude: Gitignore,
    /// The directory holds `.git` (or `.jj`): a repository root.
    has_git: bool,
}

impl Level {
    fn load(dir: &Path) -> Self {
        let has_git = dir.join(".git").exists() || dir.join(".jj").exists();
        Self {
            dot_ignore: rules_file(dir, &dir.join(".ignore")),
            gitignore: rules_file(dir, &dir.join(".gitignore")),
            exclude: git_exclude_file(dir)
                .map_or_else(Gitignore::empty, |file| rules_file(dir, &file)),
            has_git,
        }
    }
}

/// The rules of `file`, rooted at `dir`; empty when it is absent. A
/// malformed line is skipped and the remaining rules still apply.
fn rules_file(dir: &Path, file: &Path) -> Gitignore {
    if !file.is_file() {
        return Gitignore::empty();
    }
    let mut builder = GitignoreBuilder::new(dir);
    let _ = builder.add(file);
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

/// `info/exclude` of the repository whose `.git` sits in `dir`: a `.git`
/// directory, or a `.git` file pointing at a worktree's git directory (and
/// through its `commondir` at the shared one).
fn git_exclude_file(dir: &Path) -> Option<PathBuf> {
    let dot_git = dir.join(".git");
    let metadata = std::fs::metadata(&dot_git).ok()?;
    let git_dir = if metadata.is_dir() {
        dot_git
    } else {
        let pointer = std::fs::read_to_string(&dot_git).ok()?;
        let target = pointer
            .lines()
            .find_map(|line| line.strip_prefix("gitdir:"))?
            .trim();
        let git_dir = dir.join(target);
        match std::fs::read_to_string(git_dir.join("commondir")) {
            Ok(common) => git_dir.join(common.trim()),
            Err(_) => git_dir,
        }
    };
    Some(git_dir.join("info").join("exclude"))
}

/// [`walk_builder`]'s ignore rules for one path below a walk root: whether
/// the walk leaves the entry out, and which rule decides it. Directory rules
/// load lazily and are cached for the life of the value.
pub struct IgnoreRules {
    root: PathBuf,
    /// `root` with symlinks resolved: the directories above it are read along
    /// its real path, as the walker reads them.
    real_root: Option<PathBuf>,
    /// The directories above the root, nearest first.
    outer: Vec<Level>,
    global: Gitignore,
    /// Rules of directories at or below the root, by path.
    inner: Mutex<HashMap<PathBuf, Arc<Level>>>,
}

impl IgnoreRules {
    pub fn new(root: &Path) -> Self {
        let real_root = std::fs::canonicalize(root).ok();
        let outer = real_root
            .iter()
            .flat_map(|real| real.ancestors().skip(1))
            .map(Level::load)
            .collect();
        let (global, _) = Gitignore::global();
        Self {
            root: root.to_path_buf(),
            real_root,
            outer,
            global,
            inner: Mutex::default(),
        }
    }

    fn level(&self, dir: &Path) -> Arc<Level> {
        let mut inner = self.inner.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(level) = inner.get(dir) {
            return Arc::clone(level);
        }
        let level = Arc::new(Level::load(dir));
        inner.insert(dir.to_path_buf(), Arc::clone(&level));
        level
    }

    /// Whether a walk under the rules leaves out the entry `path` itself
    /// (its directories above are taken as walked). The root is never left
    /// out, and neither is a path outside it.
    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.decide(path, is_dir, |_| ()).is_ignore()
    }

    /// The rule that keeps `path` out of a walk: the rule for the topmost
    /// entry on the way to it that a walk leaves out (a walk never enters an
    /// ignored directory). `None` when a walk reaches it.
    pub fn why(&self, path: &Path, is_dir: bool) -> Option<IgnoreReason> {
        let relative = path.strip_prefix(&self.root).ok()?;
        let parts = relative.components().count();
        let mut prefix = self.root.clone();
        for (index, part) in relative.components().enumerate() {
            prefix.push(part);
            let prefix_is_dir = index + 1 < parts || is_dir;
            let decided = self.decide(&prefix, prefix_is_dir, |glob| {
                (
                    glob.from().map(Path::to_path_buf),
                    glob.original().to_owned(),
                )
            });
            if let Match::Ignore((source, pattern)) = decided {
                return Some(IgnoreReason {
                    entry: prefix,
                    line: source.as_deref().and_then(|file| rule_line(file, &pattern)),
                    source: source.map(|file| self.lexical(&file)),
                    pattern,
                });
            }
        }
        None
    }

    /// `file` spelled under the root's own path: an ignore file above the
    /// root is read along the root's real path (`/private/var/…` for a root
    /// under `/var/…`), and named along the root's.
    fn lexical(&self, file: &Path) -> PathBuf {
        if file.starts_with(&self.root) {
            return file.to_path_buf();
        }
        let Some(real) = &self.real_root else {
            return file.to_path_buf();
        };
        real.ancestors()
            .zip(self.root.ancestors())
            .find_map(|(real, lexical)| Some(lexical.join(file.strip_prefix(real).ok()?)))
            .unwrap_or_else(|| file.to_path_buf())
    }

    /// The deciding rule for one entry, with the walker's precedence: the
    /// nearest `.ignore` rule, else the nearest `.gitignore` rule up to the
    /// repository root, else the repository's exclude file, else the global
    /// gitignore. Git rules apply only inside a repository.
    fn decide<T>(
        &self,
        path: &Path,
        is_dir: bool,
        rule: impl Fn(&ignore::gitignore::Glob) -> T,
    ) -> Match<T> {
        let Ok(relative) = path.strip_prefix(&self.root) else {
            return Match::None;
        };
        if relative.as_os_str().is_empty() {
            return Match::None;
        }
        let inner: Vec<Arc<Level>> = path
            .ancestors()
            .skip(1)
            .take_while(|dir| dir.starts_with(&self.root))
            .map(|dir| self.level(dir))
            .collect();
        let outer_path = self.real_root.as_ref().map(|real| real.join(relative));
        let levels = inner.iter().map(|level| (level.as_ref(), path)).chain(
            outer_path
                .iter()
                .flat_map(|outer| self.outer.iter().map(move |level| (level, outer.as_path()))),
        );
        let any_git =
            inner.iter().any(|level| level.has_git) || self.outer.iter().any(|level| level.has_git);
        let (mut dot_ignore, mut gitignore, mut exclude) = (Match::None, Match::None, Match::None);
        let mut saw_git = false;
        for (level, matched) in levels {
            if dot_ignore.is_none() {
                dot_ignore = level.dot_ignore.matched(matched, is_dir);
            }
            if any_git && !saw_git {
                if gitignore.is_none() {
                    gitignore = level.gitignore.matched(matched, is_dir);
                }
                if exclude.is_none() {
                    exclude = level.exclude.matched(matched, is_dir);
                }
            }
            saw_git |= level.has_git;
        }
        let global = if any_git {
            self.global.matched(path, is_dir)
        } else {
            Match::None
        };
        dot_ignore.or(gitignore).or(exclude).or(global).map(rule)
    }
}

/// The last line of `file` that spells `pattern` (later rules win).
fn rule_line(file: &Path, pattern: &str) -> Option<usize> {
    let text = std::fs::read_to_string(file).ok()?;
    text.lines()
        .enumerate()
        .filter(|(_, line)| line.trim_end() == pattern)
        .last()
        .map(|(index, _)| index + 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::fs;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        fs::write(path, text).expect("write");
    }

    /// Every entry `walk_builder` yields under `root` (hidden entries walked).
    fn walked(root: &Path, policy: IgnorePolicy) -> BTreeSet<String> {
        walk_builder(root, policy, None)
            .build()
            .filter_map(Result::ok)
            .filter(|entry| entry.depth() > 0)
            .map(|entry| relative(root, entry.path()))
            .collect()
    }

    /// Every entry a plain recursive walk reaches when [`IgnoreRules`] decides
    /// each entry and ignored directories are not entered.
    fn decided(root: &Path) -> BTreeSet<String> {
        let rules = IgnoreRules::new(root);
        let mut out = BTreeSet::new();
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).expect("read dir").flatten() {
                let path = entry.path();
                let is_dir = entry.file_type().is_ok_and(|kind| kind.is_dir());
                if rules.is_ignored(&path, is_dir) {
                    continue;
                }
                out.insert(relative(root, &path));
                if is_dir {
                    stack.push(path);
                }
            }
        }
        out
    }

    fn relative(root: &Path, path: &Path) -> String {
        path.strip_prefix(root)
            .expect("under root")
            .to_string_lossy()
            .replace('\\', "/")
    }

    fn fixture() -> tempfile::TempDir {
        let repo = tempfile::tempdir().expect("repo");
        let root = repo.path();
        fs::create_dir_all(root.join(".git/info")).expect("git dir");
        write(&root.join(".git/info/exclude"), "excluded.txt\n");
        write(&root.join(".gitignore"), "*.log\nbuild/\n!keep.log\n");
        write(&root.join("app/.gitignore"), "gen/\n");
        write(&root.join("app/.ignore"), "!gen/\nlocal.txt\n");
        for file in [
            "a.rs",
            "a.log",
            "keep.log",
            "excluded.txt",
            "build/out.rs",
            "app/main.rs",
            "app/gen/x.rs",
            "app/local.txt",
            "app/nested/deep.log",
            "app/nested/ok.rs",
        ] {
            write(&root.join(file), "x\n");
        }
        repo
    }

    /// The per-path rules leave out exactly what the walker leaves out: nested
    /// `.gitignore` files, a `!` re-include, `.ignore` beating `.gitignore`,
    /// and `.git/info/exclude`.
    #[test]
    fn ignore_rules_decide_what_the_walker_walks() {
        let repo = fixture();
        let root = repo.path();
        let policy = IgnorePolicy {
            include_ignored: false,
            include_hidden: true,
        };
        let walked = walked(root, policy);
        assert_eq!(walked, decided(root));
        for left_out in [
            "a.log",
            "excluded.txt",
            "build",
            "app/local.txt",
            "app/nested/deep.log",
        ] {
            assert!(!walked.contains(left_out), "{left_out}: {walked:?}");
        }
        for kept in ["keep.log", "app/gen/x.rs", "app/nested/ok.rs", "a.rs"] {
            assert!(walked.contains(kept), "{kept}: {walked:?}");
        }
    }

    /// A subdirectory root still honors the ignore files above it, up to the
    /// repository root.
    #[test]
    fn a_root_below_the_repository_honors_the_ignore_files_above_it() {
        let repo = fixture();
        let root = repo.path().join("app");
        let policy = IgnorePolicy {
            include_ignored: false,
            include_hidden: true,
        };
        let walked = walked(&root, policy);
        assert_eq!(walked, decided(&root));
        assert!(!walked.contains("nested/deep.log"), "{walked:?}");
    }

    /// Outside a repository `.gitignore` files do not apply; `.ignore` files do.
    #[test]
    fn gitignore_needs_a_repository_and_dot_ignore_does_not() {
        let dir = tempfile::tempdir().expect("dir");
        let root = dir.path();
        write(&root.join(".gitignore"), "a.txt\n");
        write(&root.join(".ignore"), "b.txt\n");
        write(&root.join("a.txt"), "x");
        write(&root.join("b.txt"), "x");
        let rules = IgnoreRules::new(root);
        assert!(!rules.is_ignored(&root.join("a.txt"), false));
        assert!(rules.is_ignored(&root.join("b.txt"), false));
        let policy = IgnorePolicy {
            include_ignored: false,
            include_hidden: true,
        };
        assert_eq!(walked(root, policy), decided(root));
    }

    /// `includeIgnored` lifts every source.
    #[test]
    fn include_ignored_lifts_every_source() {
        let repo = fixture();
        let all = walked(repo.path(), IgnorePolicy::ALL);
        for file in [
            "a.log",
            "excluded.txt",
            "build/out.rs",
            "app/local.txt",
            ".gitignore",
        ] {
            assert!(all.contains(file), "{file}: {all:?}");
        }
        assert!(!walked(repo.path(), IgnorePolicy::default()).contains(".gitignore"));
    }

    /// `why` names the rule of the topmost ignored entry on the way to a path,
    /// with its file and line.
    #[test]
    fn why_names_the_deciding_rule_and_its_line() {
        let repo = fixture();
        let root = repo.path();
        let rules = IgnoreRules::new(root);
        let reason = rules
            .why(&root.join("build/out.rs"), false)
            .expect("ignored");
        assert_eq!(reason.entry, root.join("build"));
        assert_eq!(reason.pattern, "build/");
        assert_eq!(reason.line, Some(2));
        assert_eq!(
            reason.source.as_deref(),
            Some(root.join(".gitignore").as_path())
        );
        let excluded = rules
            .why(&root.join("excluded.txt"), false)
            .expect("excluded");
        assert_eq!(excluded.pattern, "excluded.txt");
        assert!(rules.why(&root.join("keep.log"), false).is_none());
        assert!(rules.why(&root.join("app/gen/x.rs"), false).is_none());
        assert!(rules.why(root, true).is_none());
        // A rule above the root is named along the root's own path.
        let app = root.join("app");
        let above = IgnoreRules::new(&app)
            .why(&app.join("nested/deep.log"), false)
            .expect("ignored from above");
        assert_eq!(
            above.source.as_deref(),
            Some(root.join(".gitignore").as_path())
        );
    }

    #[test]
    fn prune_skips_named_directories_below_the_root_only() {
        let dir = tempfile::tempdir().expect("dir");
        let root = dir.path().join("target");
        write(&root.join("src/a.rs"), "x");
        write(&root.join("target/b.rs"), "x");
        write(&root.join("node_modules/c.rs"), "x");
        let files: BTreeSet<String> = pruned_walk_builder(
            &root,
            IgnorePolicy::default(),
            None,
            Prune::new(["target", "node_modules"]),
        )
        .build()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_some_and(|kind| kind.is_file()))
        .map(|entry| relative(&root, entry.path()))
        .collect();
        assert_eq!(files, BTreeSet::from(["src/a.rs".to_owned()]));
    }
}

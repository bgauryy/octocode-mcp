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

use std::collections::{BTreeSet, HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock};

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

    /// This list as a default prune of a walk of `root` (one a caller's own
    /// exclusions never go through): a directory with a listed name is
    /// pruned outside a git work tree, and inside one only when git ignores
    /// it (it or a directory on the way below `root`) or it is a
    /// repository's own `.git`, which git never tracks. A listed name git
    /// does not ignore is source the repository keeps (a crate's `build/`
    /// scripts, rustc's `coverage/` pass), so the walk enters it.
    pub fn at(self, root: &Path) -> RootedPrune {
        RootedPrune {
            names: self,
            root: Arc::from(root),
            repository: Arc::default(),
        }
    }
}

/// A [`Prune`] list bound to the root of one walk ([`Prune::at`]). The
/// repository's ignore rules load when the walk first meets a listed name.
#[derive(Clone)]
pub struct RootedPrune {
    names: Prune,
    root: Arc<Path>,
    /// `None` outside a git work tree.
    repository: Arc<std::sync::OnceLock<Option<IgnoreRules>>>,
}

impl std::fmt::Debug for RootedPrune {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RootedPrune")
            .field("names", &self.names)
            .field("root", &self.root)
            .finish_non_exhaustive()
    }
}

impl RootedPrune {
    /// Whether the walk prunes `path`, an entry below its root.
    pub fn prunes(&self, path: &Path, is_dir: bool) -> bool {
        let Some(name) = path
            .file_name()
            .filter(|name| is_dir && self.names.names(name))
        else {
            return false;
        };
        name == ".git"
            || self
                .repository
                .get_or_init(|| {
                    let rules = IgnoreRules::new(&self.root);
                    rules.in_repository().then_some(rules)
                })
                .as_ref()
                .is_none_or(|rules| rules.why(path, true).is_some())
    }
}

/// The nested repositories a walk that lifts ignore rules leaves out, and
/// records: a directory below the walk's root holding its own `.git` (a
/// clone's directory, or the file a submodule or linked worktree keeps).
/// Lifting the rules finds what they hide in this repository; a nested one
/// is another repository (git itself never enters it), and a gitignored
/// checkout of others can hold more than the rest of the tree.
#[derive(Debug, Default)]
pub struct NestedRepositories {
    root: PathBuf,
    skipped: std::sync::Mutex<BTreeSet<PathBuf>>,
}

impl NestedRepositories {
    pub fn new(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            skipped: std::sync::Mutex::default(),
        }
    }

    /// Whether the walk skips `path`: a directory below the root that is a
    /// nested repository. A skipped one is recorded.
    pub fn skips(&self, path: &Path, is_dir: bool) -> bool {
        let nested = is_dir
            && path != self.root
            && path.starts_with(&self.root)
            && std::fs::symlink_metadata(path.join(".git")).is_ok();
        if nested {
            self.skipped
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .insert(path.to_path_buf());
        }
        nested
    }

    /// The skipped repositories, root-relative with `/` separators, sorted.
    pub fn skipped(&self) -> Vec<String> {
        self.skipped
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .map(|path| crate::text::slash_path(path.strip_prefix(&self.root).unwrap_or(path)))
            .collect()
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

/// The ignore files a directory may hold: `.gitignore`, which applies inside
/// a repository only, and `.ignore`, which applies with or without one.
pub const IGNORE_FILES: [&str; 2] = [".gitignore", ".ignore"];

/// The ignore rules of one directory.
struct Level {
    /// `.ignore`: applies with or without a repository.
    dot_ignore: Gitignore,
    /// `.gitignore`: applies inside a git repository only.
    gitignore: Gitignore,
    /// The repository's `info/exclude`, for a directory holding `.git`.
    exclude: Gitignore,
    /// The directory is a repository root ([`super::repository`]).
    has_git: bool,
}

impl Level {
    fn load(dir: &Path) -> Self {
        let [gitignore, dot_ignore] = IGNORE_FILES.map(|name| rules_file(dir, &dir.join(name)));
        Self {
            dot_ignore,
            gitignore,
            exclude: git_exclude_file(dir)
                .map_or_else(Gitignore::empty, |file| rules_file(dir, &file)),
            has_git: super::repository::is_root(dir),
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

/// The files outside a walk of `root` whose contents decide its ignore rules
/// ([`walk_builder`], [`IgnoreRules`]): the [`IGNORE_FILES`] of each
/// directory above `root`, the `info/exclude` of a repository whose `.git`
/// sits at or above `root` (through a worktree's `gitdir:` pointer and
/// `commondir`), the global excludes file, and the git config files that may
/// name it. A listed path may not exist: creating it changes the rules too.
/// Ignore files at or below `root` are walked entries, and a repository
/// nested below it keeps its exclude file in its own `.git`, which a walk
/// meets; a caller stamps those from its walk.
pub fn external_ignore_inputs(root: &Path) -> Vec<PathBuf> {
    let real = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let mut inputs = Vec::new();
    for dir in real.ancestors().skip(1) {
        inputs.extend(IGNORE_FILES.map(|name| dir.join(name)));
    }
    inputs.extend(real.ancestors().filter_map(git_exclude_file));
    inputs.extend(ignore::gitignore::gitconfig_excludes_path());
    let config_home = crate::process_env::var_os("XDG_CONFIG_HOME")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::home_dir().map(|home| home.join(".config")));
    let system = crate::process_env::var_os("GIT_CONFIG_SYSTEM")
        .filter(|path| !path.is_empty())
        .map_or_else(|| PathBuf::from("/etc/gitconfig"), PathBuf::from);
    inputs.extend(
        crate::process_env::var_os("GIT_CONFIG_GLOBAL")
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .into_iter()
            .chain(std::env::home_dir().map(|home| home.join(".gitconfig")))
            .chain(config_home.map(|dir| dir.join("git/config")))
            .chain(Some(system)),
    );
    let mut seen = HashSet::new();
    inputs.retain(|path| seen.insert(path.clone()));
    inputs
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
    /// Some directory above the root holds `.git`.
    outer_git: bool,
    global: Gitignore,
    /// The rules in force in each directory at or below the root, by path.
    inner: RwLock<HashMap<PathBuf, Arc<Chain>>>,
}

/// The rules of one directory at or below the root and of each directory
/// between it and the root, nearest first: what decides its entries.
struct Chain {
    levels: Vec<Arc<Level>>,
    /// A directory on the chain or above the root holds `.git`: git rules
    /// apply.
    any_git: bool,
}

impl IgnoreRules {
    pub fn new(root: &Path) -> Self {
        let real_root = std::fs::canonicalize(root).ok();
        let outer: Vec<Level> = real_root
            .iter()
            .flat_map(|real| real.ancestors().skip(1))
            .map(Level::load)
            .collect();
        let (global, _) = Gitignore::global();
        Self {
            root: root.to_path_buf(),
            real_root,
            outer_git: outer.iter().any(|level| level.has_git),
            outer,
            global,
            inner: RwLock::default(),
        }
    }

    /// The rule chain of `dir` (the root or a directory below it), built
    /// once per directory: a parallel walk reads it for every entry, so the
    /// cache is read-locked on the hot path.
    fn chain(&self, dir: &Path) -> Arc<Chain> {
        if let Some(chain) = self
            .inner
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .get(dir)
        {
            return Arc::clone(chain);
        }
        let mut levels = vec![Arc::new(Level::load(dir))];
        if let Some(parent) = dir
            .parent()
            .filter(|parent| dir != self.root && parent.starts_with(&self.root))
        {
            levels.extend(self.chain(parent).levels.iter().cloned());
        }
        let any_git = self.outer_git || levels.iter().any(|level| level.has_git);
        Arc::clone(
            self.inner
                .write()
                .unwrap_or_else(PoisonError::into_inner)
                .entry(dir.to_path_buf())
                .or_insert_with(|| Arc::new(Chain { levels, any_git })),
        )
    }

    /// Whether the root lies in a git work tree (it or a directory above it
    /// holds `.git`): only there do `.gitignore` rules apply.
    pub(crate) fn in_repository(&self) -> bool {
        self.chain(&self.root).any_git
    }

    /// Whether a walk under the rules leaves out the entry `path` itself
    /// (its directories above are taken as walked). The root is never left
    /// out, and neither is a path outside it.
    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.decide_entry(path, is_dir).is_ignore()
    }

    /// The walker's ignore verdict on the entry `path` itself (its
    /// directories above taken as walked): left out, re-included by a `!`
    /// rule (which also keeps a dot entry), or no rule.
    pub(crate) fn decide_entry(&self, path: &Path, is_dir: bool) -> Match<()> {
        self.decide(path, is_dir, |_| ())
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
        let Some(chain) = path
            .parent()
            .filter(|dir| dir.starts_with(&self.root))
            .map(|dir| self.chain(dir))
        else {
            return Match::None;
        };
        let any_git = chain.any_git;
        let mut verdicts = Verdicts::NONE;
        let mut saw_git = false;
        for level in &chain.levels {
            verdicts.consult(level, path, is_dir, any_git && !saw_git);
            saw_git |= level.has_git;
        }
        // The rules above the root match the path along the root's real
        // path; it is spelled only when a rule there is still consulted.
        let mut outer_path = None;
        for level in &self.outer {
            let git = any_git && !saw_git;
            let consulted = !level.dot_ignore.is_empty()
                || (git && !(level.gitignore.is_empty() && level.exclude.is_empty()));
            if consulted
                && let Some(matched) = outer_path
                    .get_or_insert_with(|| self.real_root.as_ref().map(|real| real.join(relative)))
                    .as_deref()
            {
                verdicts.consult(level, matched, is_dir, git);
            }
            saw_git |= level.has_git;
        }
        let Verdicts {
            dot_ignore,
            gitignore,
            exclude,
        } = verdicts;
        let global = if any_git {
            self.global.matched(path, is_dir)
        } else {
            Match::None
        };
        dot_ignore.or(gitignore).or(exclude).or(global).map(rule)
    }
}

/// The nearest rule of each kind met so far on the way up from an entry.
struct Verdicts<'a> {
    dot_ignore: Match<&'a ignore::gitignore::Glob>,
    gitignore: Match<&'a ignore::gitignore::Glob>,
    exclude: Match<&'a ignore::gitignore::Glob>,
}

impl<'a> Verdicts<'a> {
    const NONE: Self = Self {
        dot_ignore: Match::None,
        gitignore: Match::None,
        exclude: Match::None,
    };

    /// Consult `level`'s rules for `path` where no nearer rule decided;
    /// its git rules only when `git` (inside a repository, up to its root).
    fn consult(&mut self, level: &'a Level, path: &Path, is_dir: bool, git: bool) {
        if self.dot_ignore.is_none() {
            self.dot_ignore = level.dot_ignore.matched(path, is_dir);
        }
        if git {
            if self.gitignore.is_none() {
                self.gitignore = level.gitignore.matched(path, is_dir);
            }
            if self.exclude.is_none() {
                self.exclude = level.exclude.matched(path, is_dir);
            }
        }
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
        crate::text::slash_path(path.strip_prefix(root).expect("under root"))
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

    /// As a default prune ([`Prune::at`]), inside a git work tree a listed
    /// name is pruned only where git ignores it (it or a directory on the
    /// way) or it is `.git`; outside one, by its name alone.
    #[test]
    fn a_default_prune_inside_a_repository_skips_only_ignored_directories() {
        let dir = tempfile::tempdir().expect("dir");
        let root = dir.path();
        fs::create_dir_all(root.join(".git")).expect("git dir");
        write(&root.join(".gitignore"), "/target/\nout/\n");
        let prune = || Prune::new([".git", "build", "target", "coverage"]);
        let rooted = prune().at(root);
        for (path, pruned) in [
            (".git", true),
            ("build", false),
            ("src/coverage", false),
            ("target", true),
            ("out/build", true),
        ] {
            assert_eq!(rooted.prunes(&root.join(path), true), pruned, "{path}");
        }
        assert!(
            !rooted.prunes(&root.join("target"), false),
            "files are not pruned"
        );
        let outside = tempfile::tempdir().expect("dir");
        let rooted = prune().at(outside.path());
        assert!(rooted.prunes(&outside.path().join("build"), true));
        assert!(rooted.prunes(&outside.path().join("src/coverage"), true));
    }

    /// A root's external ignore inputs: the ignore files of the directories
    /// above it and the repository's exclude file, never its own walked
    /// `.gitignore`.
    #[test]
    fn external_ignore_inputs_name_the_files_above_the_root() {
        let repo = fixture();
        let real = fs::canonicalize(repo.path()).expect("real");
        let inputs = external_ignore_inputs(&repo.path().join("app"));
        for expected in [
            real.join(".gitignore"),
            real.join(".ignore"),
            real.join(".git/info/exclude"),
        ] {
            assert!(inputs.contains(&expected), "{expected:?}: {inputs:?}");
        }
        assert!(!inputs.contains(&real.join("app/.gitignore")), "{inputs:?}");
        let unique = inputs.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(unique.len(), inputs.len(), "{inputs:?}");
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

    /// A lifted walk enters neither a clone nor a submodule below its root
    /// (a `.git` directory or file), records both, and still walks the
    /// root's own repository and its gitignored directories.
    #[test]
    fn a_lifted_walk_skips_and_records_nested_repositories() {
        let dir = tempfile::tempdir().expect("dir");
        let root = dir.path();
        write(&root.join(".git/HEAD"), "ref: refs/heads/main\n");
        write(&root.join(".gitignore"), "repos/\ngen/\n");
        write(&root.join("src/a.rs"), "x");
        write(&root.join("gen/b.rs"), "x");
        write(
            &root.join("repos/clone/.git/HEAD"),
            "ref: refs/heads/main\n",
        );
        write(&root.join("repos/clone/c.rs"), "x");
        write(
            &root.join("repos/module/.git"),
            "gitdir: ../../.git/modules/m\n",
        );
        write(&root.join("repos/module/d.rs"), "x");
        write(&root.join("repos/plain/e.rs"), "x");
        let nested = std::sync::Arc::new(NestedRepositories::new(root));
        let skips = std::sync::Arc::clone(&nested);
        let mut builder = walk_builder(root, IgnorePolicy::ALL, None);
        builder.filter_entry(move |entry| {
            !skips.skips(
                entry.path(),
                entry.file_type().is_some_and(|kind| kind.is_dir()),
            )
        });
        let files: BTreeSet<String> = builder
            .build()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_some_and(|kind| kind.is_file()))
            .map(|entry| relative(root, entry.path()))
            .filter(|path| !path.starts_with(".git"))
            .collect();
        assert_eq!(
            files,
            BTreeSet::from(["gen/b.rs", "repos/plain/e.rs", "src/a.rs"].map(str::to_owned))
        );
        assert_eq!(nested.skipped(), ["repos/clone", "repos/module"]);
    }
}

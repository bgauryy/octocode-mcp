//! Why a local walk came back empty: the one diagnosis `localSearch`,
//! `structureSearch`, `astSearch` and `astRewrite` share.
//!
//! A walk skips three kinds of path: `.gitignore`d ones, hidden (dot) ones and
//! default-excluded ones (`node_modules/`, `build/`, …). An empty result may
//! only mean the thing sits behind one of them. [`diagnose`] asks a
//! tool-supplied probe (the tool's own walk, files only, relaxed) which of the
//! three held matches, and returns the *minimal* set to relax: a cause is in
//! the answer only when relaxing it finds something, never all three because
//! one did. The [`Diagnosis`] names the deciding ignore rule, hidden entry or
//! excluded directory, and sets exactly those flags on the tool's lead query.
//! Each tool builds the lead itself through its own continuation builder.

use crate::policy::prune::PruneMode;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tool_tests;

/// Files of a probe's finding kept to name skip reasons.
pub(crate) const SAMPLE_FILES: usize = 8;
/// Distinct skip reasons one hint names; the rest is a count.
const NAMED_REASONS: usize = 3;

/// Why a path is out of a walk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Cause {
    /// A `.gitignore`, `.ignore` or git exclude rule.
    Ignored,
    /// A dot entry, walked only with `includeHidden`.
    Hidden,
    /// A directory (or generated file) the default excludes prune.
    DefaultExcluded,
}

impl Cause {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Ignored => "ignored",
            Self::Hidden => "hidden",
            Self::DefaultExcluded => "default-excluded",
        }
    }

    /// The query field that lifts this cause, and its value.
    pub(crate) fn flag(self) -> (&'static str, Value) {
        match self {
            Self::Ignored => ("includeIgnored", json!(true)),
            Self::Hidden => ("includeHidden", json!(true)),
            Self::DefaultExcluded => ("defaultExcludes", json!(false)),
        }
    }
}

/// Which paths a walk takes: the request's flags, or a relaxed copy of them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Walk {
    /// `includeIgnored`: `.gitignore`d paths are walked.
    pub(crate) ignored: bool,
    /// `includeHidden`: dot paths are walked.
    pub(crate) hidden: bool,
    /// `defaultExcludes`: the default directory prune applies.
    pub(crate) default_excludes: bool,
}

impl Walk {
    /// The causes this walk skips by.
    pub(crate) fn skipping(self) -> Vec<Cause> {
        [
            (!self.ignored, Cause::Ignored),
            (!self.hidden, Cause::Hidden),
            (self.default_excludes, Cause::DefaultExcluded),
        ]
        .into_iter()
        .filter_map(|(skips, cause)| skips.then_some(cause))
        .collect()
    }

    /// The `ignore` walk of this scope that never descends into a `prune`d
    /// directory: ignore files and hidden entries follow the flags, and
    /// `globs` scope it like the tool's own scan.
    pub(crate) fn walker(
        self,
        root: &Path,
        prune: &[String],
        globs: Globs<'_>,
    ) -> Result<ignore::Walk, String> {
        let mut builder = crate::tools::pruned_walk(root, prune.iter().cloned().collect());
        builder
            .hidden(!self.hidden)
            .git_ignore(!self.ignored)
            .git_exclude(!self.ignored)
            .ignore(!self.ignored)
            .parents(!self.ignored)
            .overrides(globs.overrides(root)?);
        Ok(builder.build())
    }

    /// This walk with `causes` lifted.
    pub(crate) fn lifting(mut self, causes: &[Cause]) -> Self {
        for cause in causes {
            match cause {
                Cause::Ignored => self.ignored = true,
                Cause::Hidden => self.hidden = true,
                Cause::DefaultExcluded => self.default_excludes = false,
            }
        }
        self
    }
}

/// A request's `include` and `exclude` globs: the scope its own scan applies,
/// so a probe never reports files the request filtered out.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Globs<'a> {
    pub(crate) include: &'a [String],
    pub(crate) exclude: &'a [String],
}

impl Globs<'_> {
    /// The gitignore-style override set the engine's walks apply, rooted at
    /// `root`.
    fn overrides(self, root: &Path) -> Result<ignore::overrides::Override, String> {
        octocode_engine::search::walk::build_overrides(root, self.include, self.exclude)
    }
}

/// Sets the lifting flag of each of `causes` on a lead query that spells walk
/// flags like the contract does (`includeIgnored`, `includeHidden`,
/// `defaultExcludes`), and nothing else.
pub(crate) fn lift(query: &mut Value, causes: &[Cause]) {
    if let Some(fields) = query.as_object_mut() {
        for cause in causes {
            let (field, value) = cause.flag();
            fields.insert(field.to_owned(), value);
        }
    }
}

/// What a probe's relaxed walk found.
#[derive(Clone, Debug, Default)]
pub(crate) struct Hits {
    /// Files (or matches) found.
    pub(crate) count: usize,
    /// The first of them, absolute, at most [`SAMPLE_FILES`]: what names the
    /// skip reasons.
    pub(crate) sample: Vec<PathBuf>,
    /// The probe stopped early (deadline or cap): there may be more, or some.
    pub(crate) cut: bool,
}

/// One skipped path's reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Skip {
    pub(crate) cause: Cause,
    /// The topmost skipped entry on the way to the file: the directory (or
    /// file) whose own scope shows what the walk left out.
    pub(crate) entry: PathBuf,
    /// The deciding ignore rule (`gen/.gitignore:2 '*'`), the hidden entry
    /// (`hidden .notes/`) or the excluded directory (`build/`).
    pub(crate) reason: String,
}

/// The skip causes whose relaxation found matches.
#[derive(Clone, Debug)]
pub(crate) struct Diagnosis {
    causes: Vec<Cause>,
    found: Hits,
    skips: Vec<Skip>,
}

impl Diagnosis {
    /// The minimal causes to lift, in [`Cause`] order.
    pub(crate) fn causes(&self) -> &[Cause] {
        &self.causes
    }

    /// What the probe found with exactly [`Self::causes`] lifted.
    pub(crate) fn found(&self) -> &Hits {
        &self.found
    }

    /// The distinct skipped entries behind the sampled files, first-found first.
    #[cfg(test)]
    pub(crate) fn skips(&self) -> &[Skip] {
        &self.skips
    }

    /// The hint's reason: the named rules, entries and directories (the first
    /// few, then a count), else the causes.
    pub(crate) fn because(&self) -> String {
        if self.skips.is_empty() {
            return self.labels();
        }
        let shown = crate::response::pages::first_named(
            self.skips.iter().map(|skip| skip.reason.clone()),
            NAMED_REASONS,
        );
        // Every lifted cause is named: one no sampled file's reason states
        // (a file behind two causes, past the sample) by its label.
        let unnamed = self
            .causes
            .iter()
            .filter(|cause| !self.skips.iter().any(|skip| skip.cause == **cause))
            .map(|cause| cause.label())
            .collect::<Vec<_>>();
        if unnamed.is_empty() {
            shown
        } else {
            format!("{shown}; also {}", unnamed.join(", "))
        }
    }

    /// The causes, `ignored, hidden`.
    pub(crate) fn labels(&self) -> String {
        self.causes
            .iter()
            .map(|cause| cause.label())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// What an empty walk's probes concluded.
#[derive(Debug)]
pub(crate) enum Verdict {
    /// Nothing sits behind the skipped paths (or nothing was skipped).
    Absent,
    /// The probe was cut before it found anything: absence is unproven.
    Unproven,
    /// These causes held matches.
    Skipped(Diagnosis),
}

/// Finds which of the causes `walk` skips by held matches. `probe` runs the
/// tool's own walk (files only) with the given relaxed [`Walk`] and says what
/// it found; it is called with everything lifted first (one call when
/// nothing is found), then with each smaller set of lifted causes by size
/// until one finds matches, so the answer is the smallest sets that do (the
/// union of those that reach different files).
pub(crate) fn diagnose<E>(
    root: &Path,
    mode: PruneMode,
    walk: Walk,
    mut probe: impl FnMut(Walk) -> Result<Hits, E>,
) -> Result<Verdict, E> {
    let off = walk.skipping();
    if off.is_empty() {
        return Ok(Verdict::Absent);
    }
    let subset = |mask: usize| -> Vec<Cause> {
        off.iter()
            .enumerate()
            .filter(|(index, _)| mask >> index & 1 == 1)
            .map(|(_, cause)| *cause)
            .collect()
    };
    let full = (1_usize << off.len()) - 1;
    let everything = probe(walk.lifting(&off))?;
    if everything.count == 0 {
        return Ok(if everything.cut {
            Verdict::Unproven
        } else {
            Verdict::Absent
        });
    }
    // Smallest sets first; a larger set is probed only while the sets found
    // so far reach fewer files than lifting everything does, and kept only
    // when it reaches more than the found sets inside it (a file behind two
    // causes, beside files behind one of them).
    let mut revealed: Vec<(usize, Hits)> = Vec::new();
    let within = |revealed: &[(usize, Hits)], mask: usize| -> usize {
        revealed
            .iter()
            .filter(|(known, _)| known & mask == *known)
            .map(|(_, found)| found.count)
            .sum()
    };
    for size in 1..off.len() {
        if within(&revealed, full) >= everything.count {
            break;
        }
        let mut level = Vec::new();
        for mask in (1..full).filter(|mask| mask.count_ones() as usize == size) {
            let found = probe(walk.lifting(&subset(mask)))?;
            if found.count > within(&revealed, mask) {
                level.push((mask, found));
            }
        }
        revealed.extend(level);
    }
    if revealed.is_empty() {
        revealed.push((full, everything));
    }
    // Causes that reach the same files are alternatives (a walk that couples
    // two flags): the first of them in cause order is enough.
    // A larger set kept above reaches files its subsets do not, whatever its
    // sample shows.
    let mut covered = std::collections::BTreeSet::new();
    let mut kept: Vec<(usize, Hits)> = Vec::new();
    for (mask, found) in revealed {
        let new = found.sample.iter().any(|file| !covered.contains(file))
            || (kept.iter().any(|(known, _)| known & mask == *known)
                && found.count > within(&kept, mask));
        covered.extend(found.sample.iter().cloned());
        if new {
            kept.push((mask, found));
        }
    }
    let revealed = kept;
    let union = revealed.iter().fold(0, |union, (mask, _)| union | mask);
    let found = match revealed.iter().find(|(mask, _)| *mask == union) {
        Some((_, found)) => found.clone(),
        None => {
            let found = probe(walk.lifting(&subset(union)))?;
            if found.count > 0 {
                found
            } else {
                revealed[0].1.clone()
            }
        }
    };
    let mut skips: Vec<Skip> = Vec::new();
    for (mask, found) in &revealed {
        let causes = subset(*mask);
        for file in found.sample.iter().take(SAMPLE_FILES) {
            if let Some(skip) = skip_of(root, mode, file, &causes)
                && !skips.iter().any(|known| known.reason == skip.reason)
            {
                skips.push(skip);
            }
        }
    }
    Ok(Verdict::Skipped(Diagnosis {
        causes: subset(union),
        found,
        skips,
    }))
}

/// The files a walk reached, or why it could not be walked.
type Reached = std::cell::OnceCell<Result<HashSet<PathBuf>, String>>;

/// A file probe for a tool without a text engine of its own: the files under
/// `root` that `keep` admits, within `budget` walked files, under a relaxed
/// [`Walk`]. The walk is the discovery policy's (`permits`), `globs`, ignore
/// files and prune list the tool's scan honors.
pub(crate) struct FileProbe<'a> {
    root: PathBuf,
    mode: PruneMode,
    budget: usize,
    globs: Globs<'a>,
    permits: &'a dyn Fn(&Path) -> Result<bool, String>,
    keep: &'a dyn Fn(&Path) -> bool,
    /// The request's own walk and the files it reached, walked on first use:
    /// those files are not behind anything, whatever they are.
    reached_by: Option<(Walk, Reached)>,
}

impl<'a> FileProbe<'a> {
    pub(crate) fn new(
        root: &Path,
        mode: PruneMode,
        budget: usize,
        permits: &'a dyn Fn(&Path) -> Result<bool, String>,
        keep: &'a dyn Fn(&Path) -> bool,
    ) -> Self {
        Self {
            root: root.to_path_buf(),
            mode,
            budget,
            globs: Globs::default(),
            permits,
            keep,
            reached_by: None,
        }
    }

    /// Scopes the probe to the request's `include`/`exclude` globs.
    pub(crate) fn within(mut self, globs: Globs<'a>) -> Self {
        self.globs = globs;
        self
    }

    /// Counts only files the request's own `walk` did not reach: the probe's
    /// finding is then what relaxing skipped paths adds, not what the scan
    /// already saw (an empty result with other causes, such as a name filter).
    pub(crate) fn beyond(mut self, walk: Walk) -> Self {
        self.reached_by = Some((walk, std::cell::OnceCell::new()));
        self
    }

    /// The files `keep` admits under `walk`, in walk order, and whether the
    /// walk hit the budget.
    fn kept(&self, walk: Walk) -> Result<(Vec<PathBuf>, bool), String> {
        let walker = walk.walker(
            &self.root,
            &self.mode.directories(walk.default_excludes),
            self.globs,
        )?;
        let (mut kept, mut walked) = (Vec::new(), 0_usize);
        for entry in walker {
            let Ok(entry) = entry else { continue };
            if !entry.file_type().is_some_and(|kind| kind.is_file())
                || !(self.permits)(entry.path())?
            {
                continue;
            }
            walked += 1;
            if walked > self.budget {
                return Ok((kept, true));
            }
            if (self.keep)(entry.path()) {
                kept.push(entry.path().to_path_buf());
            }
        }
        Ok((kept, false))
    }

    /// What the relaxed `walk` finds.
    pub(crate) fn find(&self, walk: Walk) -> Result<Hits, String> {
        let (mut files, cut) = self.kept(walk)?;
        if let Some((requested, reached)) = &self.reached_by {
            let reached = reached
                .get_or_init(|| Ok(self.kept(*requested)?.0.into_iter().collect()))
                .as_ref()
                .map_err(Clone::clone)?;
            files.retain(|file| !reached.contains(file));
        }
        Ok(Hits {
            count: files.len(),
            sample: files.into_iter().take(SAMPLE_FILES).collect(),
            cut,
        })
    }
}

/// Why the walk skipped `file`, by the first of `causes` that applies.
fn skip_of(root: &Path, mode: PruneMode, file: &Path, causes: &[Cause]) -> Option<Skip> {
    [Cause::Ignored, Cause::Hidden, Cause::DefaultExcluded]
        .into_iter()
        .filter(|cause| causes.contains(cause))
        .find_map(|cause| {
            let (entry, reason) = match cause {
                Cause::Ignored => ignored_entry(root, file),
                Cause::Hidden => hidden_entry(root, file),
                Cause::DefaultExcluded => excluded_entry(root, mode, file),
            }?;
            Some(Skip {
                cause,
                entry,
                reason,
            })
        })
}

/// The topmost directories under `root` that ignore rules keep `walk` out of:
/// a probe that ran out of time can still name what it could not search.
/// Directories only, found as the children the ignore-aware walk did not
/// enter, within `stop`.
pub(crate) fn ignored_directories(
    root: &Path,
    mode: PruneMode,
    walk: Walk,
    stop: &dyn Fn() -> bool,
) -> Vec<Skip> {
    if walk.ignored {
        return Vec::new();
    }
    let pruned = mode.directories(walk.default_excludes);
    let Ok(walker) = walk.walker(root, &pruned, Globs::default()) else {
        return Vec::new();
    };
    let mut walked = HashSet::new();
    for entry in walker {
        if stop() {
            break;
        }
        if let Ok(entry) = entry
            && entry.file_type().is_some_and(|kind| kind.is_dir())
        {
            walked.insert(entry.into_path());
        }
    }
    let mut dirs: Vec<&PathBuf> = walked.iter().collect();
    dirs.sort();
    let mut skips = Vec::new();
    for dir in dirs {
        let Ok(children) = std::fs::read_dir(dir) else {
            continue;
        };
        let mut children: Vec<_> = children.flatten().collect();
        children.sort_by_key(std::fs::DirEntry::file_name);
        for child in children {
            if stop() {
                return skips;
            }
            let path = child.path();
            let name = child.file_name().to_string_lossy().into_owned();
            let candidate = child.file_type().is_ok_and(|kind| kind.is_dir())
                && !walked.contains(&path)
                && !pruned.contains(&name)
                && (walk.hidden || !name.starts_with('.'));
            if candidate && let Some(reason) = ignore_rule(root, &path, true) {
                skips.push(Skip {
                    cause: Cause::Ignored,
                    entry: path,
                    reason,
                });
            }
        }
    }
    skips
}

/// The path's ancestors below `root` and itself, shortest first, each with
/// whether it is a directory on the way to `file`.
fn prefixes(root: &Path, file: &Path) -> Vec<(PathBuf, bool)> {
    let Ok(relative) = file.strip_prefix(root) else {
        return Vec::new();
    };
    let count = relative.components().count();
    let mut prefix = root.to_path_buf();
    relative
        .components()
        .enumerate()
        .map(|(index, part)| {
            prefix.push(part);
            (prefix.clone(), index + 1 < count)
        })
        .collect()
}

fn ignored_entry(root: &Path, file: &Path) -> Option<(PathBuf, String)> {
    let reason = ignore_rule(root, file, false)?;
    let entry = prefixes(root, file)
        .into_iter()
        .find(|(prefix, is_dir)| ignore_rule(root, prefix, *is_dir).is_some())
        .map_or_else(|| file.to_path_buf(), |(prefix, _)| prefix);
    Some((entry, reason))
}

fn hidden_entry(root: &Path, file: &Path) -> Option<(PathBuf, String)> {
    prefixes(root, file)
        .into_iter()
        .find_map(|(prefix, is_dir)| {
            let name = prefix.file_name()?.to_string_lossy();
            let relative = prefix.strip_prefix(root).ok()?.to_string_lossy();
            let slash = if is_dir { "/" } else { "" };
            name.starts_with('.')
                .then(|| (prefix.clone(), format!("hidden {relative}{slash}")))
        })
}

/// The first pruned directory on the way to `file`, else the file itself
/// when it is a generated one the default excludes skip (`*.lock`).
fn excluded_entry(root: &Path, mode: PruneMode, file: &Path) -> Option<(PathBuf, String)> {
    let pruned = mode.directories(true);
    let directory = prefixes(root, file)
        .into_iter()
        .filter(|(_, is_dir)| *is_dir)
        .find_map(|(prefix, _)| {
            let name = prefix.file_name()?.to_string_lossy();
            let relative = prefix.strip_prefix(root).ok()?.to_string_lossy();
            pruned
                .iter()
                .any(|pruned| *pruned == name)
                .then(|| (prefix.clone(), format!("{relative}/")))
        });
    directory.or_else(|| {
        let name = file.file_name()?.to_string_lossy();
        let pattern = crate::policy::discovery::generated_file_pattern(&name)?;
        Some((file.to_path_buf(), pattern))
    })
}

/// The ignore rule that skips `path` under `root`: the deciding ignore file,
/// line and pattern (deepest ignore file first; a `!` re-include there ends
/// the search), relative to `root` through `../` for a file above it. `None`
/// when no rule applies.
pub(crate) fn ignore_rule(root: &Path, path: &Path, is_dir: bool) -> Option<String> {
    use ignore::Match;
    use ignore::gitignore::GitignoreBuilder;
    // The row never prints an absolute path.
    let shown = |path: &Path| {
        let relative = root
            .ancestors()
            .enumerate()
            .find_map(|(up, base)| {
                let rest = path.strip_prefix(base).ok()?;
                Some("../".repeat(up) + &rest.to_string_lossy())
            })
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        relative.replace('\\', "/")
    };
    let in_git = path.ancestors().any(|dir| dir.join(".git").exists());
    for dir in path.ancestors().skip(1) {
        let mut candidates = vec![dir.join(".ignore")];
        if in_git {
            candidates.push(dir.join(".gitignore"));
            candidates.push(dir.join(".git/info/exclude"));
        }
        for source in candidates.into_iter().filter(|path| path.is_file()) {
            let mut builder = GitignoreBuilder::new(dir);
            if builder.add(&source).is_some() {
                continue;
            }
            let Ok(rules) = builder.build() else {
                continue;
            };
            match rules.matched_path_or_any_parents(path, is_dir) {
                Match::Ignore(glob) => {
                    let pattern = glob.original();
                    let line = std::fs::read_to_string(&source)
                        .ok()
                        .and_then(|text| {
                            text.lines()
                                .enumerate()
                                .filter(|(_, line)| line.trim_end() == pattern)
                                .last()
                                .map(|(index, _)| index + 1)
                        })
                        .map(|line| format!(":{line}"))
                        .unwrap_or_default();
                    return Some(format!("{}{line} '{pattern}'", shown(&source)));
                }
                Match::Whitelist(_) => return None,
                Match::None => {}
            }
        }
        // Ignore files stop at the repository that holds the search root. A
        // repository nested under the root ends only its own rules: the
        // outer ones decided whether the walk entered it at all.
        if dir.join(".git").exists() && root.starts_with(dir) {
            break;
        }
    }
    None
}

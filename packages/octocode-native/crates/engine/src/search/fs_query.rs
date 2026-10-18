use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use ignore::gitignore::Gitignore;
use regex::Regex;

use std::sync::Arc;

use super::fs_resume::{Child, Frame, WalkCursor, WalkTally};
use super::glob;
use super::walk::{IgnorePolicy, IgnoreRules, Prune, Stop};
use crate::error::{Error, ErrorKind};
use crate::text::file_extension::extension_of;
use crate::types::{FileSystemEntry, FileSystemQueryOptions, FileSystemQueryResult};

/// Whether the walk inspects an entry now or replays one an earlier window
/// of a resumed walk (`skip_entries`) already inspected. A policy callback
/// that counts what it leaves out counts only a [`Visit::Fresh`] entry: the
/// earlier window counted a replayed one. A fresh entry names its walk
/// position, so a window that ends at an earlier entry can drop the counts of
/// the ones after it (the window that resumes there counts them).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Visit {
    Fresh { position: u32 },
    Replayed,
}

impl Visit {
    /// The walk position of a fresh entry; `None` for a replayed one.
    #[must_use]
    pub fn fresh_at(self) -> Option<u32> {
        match self {
            Self::Fresh { position } => Some(position),
            Self::Replayed => None,
        }
    }
}

/// A walk's policy callback: the path, its directory-entry type (`None`
/// for the root, or when the platform did not report it) and whether the
/// entry is [`Visit::Fresh`]. `false` leaves the entry out, and a directory
/// with everything under it.
pub type EntryFilter<'a> = dyn Fn(&Path, Option<fs::FileType>, Visit) -> bool + 'a;

const DEFAULT_LIMIT: usize = 10_000;
/// Hard ceiling on directory-recursion depth. Symlink cycles are already
/// avoided (symlink_metadata never reports a symlink as a dir), so this only
/// guards against pathologically deep real trees overflowing the stack when no
/// `max_depth` was supplied. Far deeper than any realistic project layout.
const MAX_RECURSION_DEPTH: u32 = 100;

struct CompiledQuery {
    root: PathBuf,
    include_root: bool,
    recursive: bool,
    stop_at_limit: bool,
    max_depth: Option<u32>,
    min_depth: u32,
    show_hidden: bool,
    /// The ignore rules the walk honors; `None` with `includeIgnored`.
    ignore_rules: Option<IgnoreRules>,
    /// `names`: an entry is listed when one of them matches it (see
    /// [`glob`]).
    names: Option<Gitignore>,
    extensions: Vec<String>,
    regex: Option<Regex>,
    entry_type: Option<EntryType>,
    empty: bool,
    modified_within_secs: Option<u64>,
    modified_before_secs: Option<u64>,
    accessed_within_secs: Option<u64>,
    size_greater: Option<u64>,
    size_less: Option<u64>,
    permissions: Option<String>,
    executable: bool,
    readable: bool,
    writable: bool,
    prune: Prune,
    /// Caller exclusions (see [`glob`]): a matching directory is skipped with
    /// everything under it.
    exclude: Option<Gitignore>,
    limit: usize,
    /// How long the walk may inspect new entries (see `skip_entries`).
    time_budget: Option<std::time::Duration>,
    /// Leading entries (walk order) an earlier walk inspected: replayed.
    skip_entries: u32,
    /// Which walk a [`WalkCursor`] belongs to: everything here that decides
    /// the order and the directories of the walk.
    shape: u64,
    /// Keep a window checkpoint at this listed entry.
    window_rows: Option<u32>,
    warnings: Vec<String>,
}

#[derive(Default)]
struct QueryState {
    /// When the walk stops at its next entry; set when the first new entry
    /// is reached, so replayed entries spend none of the budget.
    deadline: Option<Instant>,
    /// Entries inspected so far, replayed ones included.
    position: u32,
    entries: Vec<FileSystemEntry>,
    /// Entries listed (stored, the root excepted) so far.
    listed: u32,
    total_discovered: u32,
    tally: WalkTally,
    time_cut: Option<String>,
    /// The directories the walk is inside, outermost first.
    stack: Vec<Frame>,
    /// Where the walk stood when it was cut by time.
    cursor: Option<WalkCursor>,
    /// Where the walk stood at the `window_rows`-th listed entry.
    window_cursor: Option<WalkCursor>,
}

impl QueryState {
    /// Count an entry or directory that could not be read.
    fn unreadable(&mut self, err: &std::io::Error) {
        let denied = err.kind() == std::io::ErrorKind::PermissionDenied;
        self.tally.unreadable(self.position, denied);
    }

    /// Where the walk stands: the directories it is inside and, when the
    /// walk is about to enter one, that directory.
    fn cursor(&self, shape: u64, entering: Option<Frame>) -> WalkCursor {
        let mut frames = self.stack.clone();
        frames.extend(entering);
        WalkCursor {
            position: self.position,
            shape,
            frames,
        }
    }

    /// The walk has nothing more to inspect: out of time or past the limit.
    fn finished(&self, query: &CompiledQuery) -> bool {
        self.time_cut.is_some()
            || (query.stop_at_limit && self.total_discovered as usize > query.limit)
    }
}

/// Walk `options.path` in name order, listing the entries its filters
/// match. `admit` decides each descendant before it is inspected or counted
/// (a denied directory is not entered); ignore rules and caller exclusions
/// decide it before that.
/// `stop` cancels the walk ([`ErrorKind::Cancelled`]).
pub(crate) fn query_file_system(
    options: FileSystemQueryOptions,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<FileSystemQueryResult, Error> {
    let resume = options.resume.clone();
    let query = CompiledQuery::new(options)?;
    let mut state = QueryState::default();
    // A resumed walk's root was listed (and counted) by the walk it resumes.
    let root_visit = if query.skip_entries == 0 {
        Visit::Fresh { position: 0 }
    } else {
        Visit::Replayed
    };
    if !admit(&query.root, None, root_visit) {
        return Err(Error::new("Filesystem query root is denied by path policy"));
    }
    let root_metadata = fs::symlink_metadata(&query.root).map_err(|err| {
        Error::io(
            &err,
            format!(
                "Cannot access filesystem query root '{}': {err}",
                query.root.display()
            ),
        )
    })?;

    if query.include_root && query.skip_entries == 0 {
        let mut metadata = Some(root_metadata.clone());
        let kind = EntryKind::of(root_metadata.file_type());
        let name = file_name(&query.root);
        // The root's metadata is in hand, so the visit cannot fail to stat it.
        let _ = visit_path(
            &query.root,
            &name,
            0,
            kind,
            &mut metadata,
            &query,
            &mut state,
        );
    }

    if root_metadata.is_dir() && (query.recursive || !query.include_root) {
        // A cursor made by this walk's shape at the resume position continues
        // it without replaying a single entry.
        let frames = resume
            .filter(|cursor| cursor.shape == query.shape && cursor.position == query.skip_entries)
            .map(|cursor| cursor.frames);
        if let Some((first, inner)) = frames.as_deref().and_then(<[Frame]>::split_first) {
            state.position = query.skip_entries;
            walk_frame(first.clone(), inner, &query, &mut state, admit, stop)?;
        } else {
            walk_children(&query.root, 1, &query, &mut state, admit, stop)?;
        }
    } else if !root_metadata.is_dir() && !query.include_root {
        return Err(Error::new(format!(
            "Filesystem query root is not a directory: {}",
            query.root.display()
        )));
    }

    let was_capped = state.total_discovered as usize > query.limit;
    let totals = state.tally.through(u32::MAX);
    Ok(FileSystemQueryResult {
        entries: state.entries,
        total_discovered: state.total_discovered,
        was_capped,
        skipped: totals.skipped,
        permission_denied: totals.permission_denied,
        ignored: totals.ignored,
        warnings: query.warnings,
        pruned_dirs: totals.pruned_dirs,
        time_cut: state.time_cut,
        walk_position: state.position,
        tally: state.tally,
        cursor: state.cursor,
        window_cursor: state.window_cursor,
    })
}

impl CompiledQuery {
    fn new(options: FileSystemQueryOptions) -> Result<Self, Error> {
        let shape = walk_shape(&options);
        let root = PathBuf::from(options.path);
        let mut warnings = Vec::new();
        let names = options.names.unwrap_or_default();
        let names = glob::set(&root, names.iter().map(String::as_str), "names")?;
        let exclude = options.exclude.unwrap_or_default();
        let exclude = glob::set(
            &root,
            exclude
                .iter()
                .map(|glob| glob.strip_prefix('!').unwrap_or(glob)),
            "exclude",
        )?;
        let extensions = normalize_extensions(options.extensions.unwrap_or_default());
        let regex = match options.regex {
            Some(pattern) => Some(Regex::new(&pattern).map_err(|err| {
                Error::with_kind(
                    ErrorKind::InvalidPattern,
                    format!("Invalid regex for local filesystem query: {err}"),
                )
            })?),
            None => None,
        };

        let min_depth = options.min_depth.unwrap_or(0);
        if options
            .max_depth
            .is_some_and(|max_depth| min_depth > max_depth)
        {
            return Err(Error::with_kind(
                ErrorKind::InvalidInput,
                "minDepth must be less than or equal to maxDepth",
            ));
        }

        let IgnorePolicy {
            include_ignored,
            include_hidden,
        } = options.ignore;
        Ok(Self {
            ignore_rules: (!include_ignored).then(|| IgnoreRules::new(&root)),
            root,
            include_root: options.include_root.unwrap_or(false),
            recursive: options.recursive.unwrap_or(true),
            stop_at_limit: options.stop_at_limit.unwrap_or(true),
            max_depth: options.max_depth,
            min_depth,
            show_hidden: include_hidden,
            names,
            extensions,
            regex,
            entry_type: options
                .entry_type
                .as_deref()
                .map(EntryType::parse)
                .transpose()?,
            empty: options.empty.unwrap_or(false),
            modified_within_secs: parse_duration_option(
                options.modified_within.as_deref(),
                "modifiedWithin",
                &mut warnings,
            ),
            modified_before_secs: parse_duration_option(
                options.modified_before.as_deref(),
                "modifiedBefore",
                &mut warnings,
            ),
            accessed_within_secs: parse_duration_option(
                options.accessed_within.as_deref(),
                "accessedWithin",
                &mut warnings,
            ),
            size_greater: parse_size_option(options.size_greater.as_deref(), "sizeGreater")?,
            size_less: parse_size_option(options.size_less.as_deref(), "sizeLess")?,
            permissions: options.permissions,
            executable: options.executable.unwrap_or(false),
            readable: options.readable.unwrap_or(false),
            writable: options.writable.unwrap_or(false),
            prune: Prune::new(options.exclude_dir.iter().flatten()),
            exclude,
            limit: options.limit.map(|n| n as usize).unwrap_or(DEFAULT_LIMIT),
            time_budget: options.time_budget,
            skip_entries: options.skip_entries.unwrap_or(0),
            shape,
            window_rows: options.window_rows,
            warnings,
        })
    }
}

/// A digest of what decides the order and the directories of a walk (never
/// which entries it lists): a [`WalkCursor`] continues only a walk of the
/// same shape.
fn walk_shape(options: &FileSystemQueryOptions) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    (
        &options.path,
        options.include_root,
        options.recursive,
        options.max_depth,
        options.ignore.include_ignored,
        options.ignore.include_hidden,
        &options.exclude,
        &options.exclude_dir,
    )
        .hash(&mut hasher);
    hasher.finish()
}

/// The `entry_type` filter: `f` lists files, `d` directories.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryType {
    File,
    Directory,
}

impl EntryType {
    fn parse(raw: &str) -> Result<Self, Error> {
        match raw {
            "f" => Ok(Self::File),
            "d" => Ok(Self::Directory),
            _ => Err(Error::with_kind(
                ErrorKind::InvalidInput,
                format!("Invalid entryType for local filesystem query: {raw} (f or d)"),
            )),
        }
    }

    fn matches(self, kind: EntryKind) -> bool {
        match self {
            Self::File => kind.is_file,
            Self::Directory => kind.is_dir,
        }
    }
}

impl CompiledQuery {
    /// Whether a caller `exclude` glob matches this entry.
    fn excludes(&self, path: &Path, is_dir: bool) -> bool {
        self.exclude
            .as_ref()
            .is_some_and(|exclude| glob::matches(exclude, path, is_dir))
    }

    /// What the walk does with a directory entry before it is matched:
    /// the ignore rules, caller exclusions, the policy callback, dot entries
    /// and pruned names decide, in that order. An entry the caller excluded
    /// never reaches the callback, so nothing it counts (withheld, hidden or
    /// pruned entries) includes one. One verdict for a live and a replayed
    /// entry, so a resumed walk recurses where the first did.
    fn verdict(
        &self,
        path: &Path,
        file_name: &std::ffi::OsStr,
        is_dir: bool,
        (file_type, visit): (Option<fs::FileType>, Visit),
        admit: &EntryFilter<'_>,
    ) -> Verdict {
        let name = file_name.to_string_lossy();
        if self
            .ignore_rules
            .as_ref()
            .is_some_and(|rules| rules.is_ignored(path, is_dir))
        {
            // A dot entry out of view is not counted as ignored.
            return Verdict::Ignored {
                counted: self.show_hidden || !name.starts_with('.'),
            };
        }
        // A caller exclusion is a path match: it reads no metadata.
        if self.excludes(path, is_dir) {
            return Verdict::Left;
        }
        // Authorize before metadata, matching (which can inspect empty
        // directories), discovery counters, or recursive traversal.
        if !admit(path, file_type, visit) {
            return Verdict::Left;
        }
        if !self.show_hidden && name.starts_with('.') {
            return Verdict::Left;
        }
        if is_dir && self.prune.names(file_name) {
            return Verdict::Pruned;
        }
        Verdict::Enters
    }
}

/// [`CompiledQuery::verdict`]: whether an entry is matched and entered, or
/// left out (and how a live walk counts it).
enum Verdict {
    Ignored { counted: bool },
    Pruned,
    Left,
    Enters,
}

/// Walk the directory `base` (a fresh one: read now) and everything under it.
fn walk_children(
    base: &Path,
    depth: u32,
    query: &CompiledQuery,
    state: &mut QueryState,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<(), Error> {
    let frame = Frame {
        base: base.to_path_buf(),
        depth,
        children: None,
        read_at: None,
        next: 0,
    };
    walk_frame(frame, &[], query, state, admit, stop)
}

/// A directory's entries in walk order, or `None` when it is too deep, past
/// `max_depth`, or unreadable (counted, unless the walk this one resumes
/// counted it).
fn read_children(
    base: &Path,
    depth: u32,
    query: &CompiledQuery,
    state: &mut QueryState,
) -> Option<(Vec<Child>, Option<std::time::SystemTime>)> {
    // The walk this one resumes read this directory when it inspected the
    // entry that led here (the root: before its first entry), and counted
    // what failed to read: counted again, a failure would show twice.
    let reread = query.skip_entries > 0 && state.position <= query.skip_entries;
    if depth > MAX_RECURSION_DEPTH {
        if !reread {
            state.tally.unreadable(state.position, false);
        }
        return None;
    }
    if query.max_depth.is_some_and(|max_depth| depth > max_depth) {
        return None;
    }

    // Taken before the listing: a change after it moves the time on.
    let read_at = fs::symlink_metadata(base)
        .and_then(|metadata| metadata.modified())
        .ok();
    let read_dir = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(err) => {
            if !reread {
                state.unreadable(&err);
            }
            return None;
        }
    };

    // `fs::read_dir` yields entries in raw OS order (hash order on APFS, etc.),
    // so without sorting the result set — and its silent truncation at the limit
    // — would vary run-to-run. Collect and sort by file name for deterministic,
    // stable output (names are unique in a directory, and each is taken once:
    // a comparison that asked the entry for its name would allocate it every
    // time). Read errors are still surfaced as skips. The entry type comes
    // with the directory listing on common platforms.
    let mut children: Vec<Child> = Vec::new();
    for dir_entry in read_dir {
        match dir_entry {
            Ok(entry) => children.push(Child {
                name: entry.file_name(),
                file_type: entry.file_type().ok(),
            }),
            Err(err) => {
                if !reread {
                    state.unreadable(&err);
                }
            }
        }
    }
    children.sort_unstable_by(|a, b| a.name.cmp(&b.name));
    Some((children, read_at))
}

/// Walk one directory of the walk: `frame` from its `next` entry on, the
/// directories `inner` (a cursor's deeper ones, outermost first) before it.
fn walk_frame(
    mut frame: Frame,
    inner: &[Frame],
    query: &CompiledQuery,
    state: &mut QueryState,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<(), Error> {
    let children = match frame.children.clone() {
        Some(children) => children,
        None => match read_children(&frame.base, frame.depth, query, state) {
            Some((children, read_at)) => {
                frame.read_at = read_at;
                Arc::new(children)
            }
            None => return Ok(()),
        },
    };
    frame.children = Some(children);
    state.stack.push(frame);
    let level = state.stack.len() - 1;
    let walked = walk_level(level, inner, query, state, admit, stop);
    state.stack.pop();
    walked
}

fn walk_level(
    level: usize,
    inner: &[Frame],
    query: &CompiledQuery,
    state: &mut QueryState,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<(), Error> {
    if let Some((first, rest)) = inner.split_first() {
        walk_frame(first.clone(), rest, query, state, admit, stop)?;
        if state.finished(query) {
            return Ok(());
        }
    }
    let frame = &state.stack[level];
    let (base, depth, start) = (frame.base.clone(), frame.depth, frame.next);
    let children = frame.children.clone().unwrap_or_default();

    for (index, child) in children.iter().enumerate().skip(start) {
        // The next entry of this directory a resume inspects.
        state.stack[level].next = index;
        // Look ahead to one additional matching entry before declaring overflow.
        // Reaching the stored-entry cap alone does not prove the scan is partial.
        if query.stop_at_limit && state.total_discovered as usize > query.limit {
            return Ok(());
        }
        if stop() {
            return Err(Error::cancelled());
        }
        let file_name = child.name.as_os_str();
        // The leading `skip_entries` entries were inspected by the walk this
        // one resumes: replayed below, they spend none of the time budget.
        let replaying = state.position < query.skip_entries;
        if !replaying && let Some(budget) = query.time_budget {
            let deadline = *state
                .deadline
                .get_or_insert_with(|| Instant::now() + budget);
            if Instant::now() >= deadline {
                let path = base.join(file_name);
                let relative = path.strip_prefix(&query.root).unwrap_or(&path);
                state.time_cut = Some(crate::text::slash_path(relative));
                state.cursor = Some(state.cursor(query.shape, None));
                return Ok(());
            }
        }
        state.position += 1;
        state.stack[level].next = index + 1;

        let path = base.join(file_name);
        let file_type = child.file_type;
        let mut metadata = None;
        let kind = match file_type {
            Some(file_type) => EntryKind::of(file_type),
            // A replayed entry was counted by the walk it resumes.
            None if replaying => match fs::symlink_metadata(&path) {
                Ok(meta) => meta.file_type().into(),
                Err(_) => continue,
            },
            None => match lstat(&path, state) {
                Some(meta) => metadata.insert(meta).file_type().into(),
                None => continue,
            },
        };
        let is_directory = kind.is_dir;
        // A replayed entry only counts: the walk it resumes listed it or
        // not, and entered it or not by this same verdict, which only a
        // directory's entry needs again.
        if replaying && !(query.recursive && is_directory) {
            continue;
        }
        let visit = if replaying {
            Visit::Replayed
        } else {
            Visit::Fresh {
                position: state.position,
            }
        };
        match query.verdict(&path, file_name, is_directory, (file_type, visit), admit) {
            Verdict::Ignored { counted } => {
                if counted && !replaying {
                    state.tally.ignored(state.position);
                }
                continue;
            }
            Verdict::Pruned => {
                if !replaying {
                    let relative = path.strip_prefix(&query.root).unwrap_or(&path);
                    state
                        .tally
                        .pruned(state.position, crate::text::slash_path(relative));
                }
                continue;
            }
            Verdict::Left => continue,
            Verdict::Enters => {}
        }

        if !replaying {
            let listed = state.entries.len();
            if visit_path(
                &path,
                &file_name.to_string_lossy(),
                depth,
                kind,
                &mut metadata,
                query,
                state,
            )
            .is_err()
            {
                continue;
            }
            if state.entries.len() > listed && state.position > 0 {
                state.listed += 1;
                if query.window_rows == Some(state.listed) {
                    let entering = (query.recursive && is_directory).then(|| Frame {
                        base: path.clone(),
                        depth: depth + 1,
                        children: None,
                        read_at: None,
                        next: 0,
                    });
                    state.window_cursor = Some(state.cursor(query.shape, entering));
                }
            }
        }

        if query.recursive && is_directory {
            walk_children(&path, depth + 1, query, state, admit, stop)?;
            if state.finished(query) {
                return Ok(());
            }
        }
    }
    Ok(())
}

/// An entry's type, from its directory listing or its `symlink_metadata`.
#[derive(Clone, Copy)]
struct EntryKind {
    is_dir: bool,
    is_file: bool,
}

impl EntryKind {
    fn of(file_type: fs::FileType) -> Self {
        Self {
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
        }
    }
}

impl From<fs::FileType> for EntryKind {
    fn from(file_type: fs::FileType) -> Self {
        Self::of(file_type)
    }
}

/// `symlink_metadata`, counting a failure as a skipped entry.
fn lstat(path: &Path, state: &mut QueryState) -> Option<fs::Metadata> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Some(metadata),
        Err(err) => {
            state.unreadable(&err);
            None
        }
    }
}

/// Count and record `path` when it matches. Name and type filters run
/// first; the entry is stat'ed (into `metadata`) only when they pass. `Err`
/// when that stat failed: the entry is skipped like an unreadable one.
fn visit_path(
    path: &Path,
    name: &str,
    depth: u32,
    kind: EntryKind,
    metadata: &mut Option<fs::Metadata>,
    query: &CompiledQuery,
    state: &mut QueryState,
) -> Result<(), ()> {
    if depth < query.min_depth {
        return Ok(());
    }
    if query.max_depth.is_some_and(|max_depth| depth > max_depth) {
        return Ok(());
    }
    if !matches_names(path, name, kind, query) {
        return Ok(());
    }
    let metadata = match metadata {
        Some(metadata) => metadata,
        None => metadata.insert(lstat(path, state).ok_or(())?),
    };
    if !matches_metadata(path, metadata, query) {
        return Ok(());
    }

    state.total_discovered += 1;
    if state.entries.len() >= query.limit {
        return Ok(());
    }

    state.entries.push(to_entry(
        path,
        depth.saturating_sub(1),
        state.position,
        metadata,
        query,
    ));
    Ok(())
}

/// The filters an entry's name, path and type decide.
fn matches_names(path: &Path, name: &str, kind: EntryKind, query: &CompiledQuery) -> bool {
    if let Some(names) = &query.names
        && !glob::matches(names, path, kind.is_dir)
    {
        return false;
    }
    if let Some(regex) = &query.regex
        && !regex.is_match(name)
    {
        return false;
    }
    if !query.extensions.is_empty() && !matches_extension(name, kind, &query.extensions) {
        return false;
    }
    query
        .entry_type
        .is_none_or(|entry_type| entry_type.matches(kind))
}

/// The filters that need the entry's metadata.
fn matches_metadata(path: &Path, metadata: &fs::Metadata, query: &CompiledQuery) -> bool {
    if query.empty && !is_empty(path, metadata) {
        return false;
    }
    // A size filter is about content: a directory's own length (its entry
    // table) is none, so a directory never matches one.
    let sized = query.size_greater.is_some() || query.size_less.is_some();
    if sized && metadata.is_dir() {
        return false;
    }
    if let Some(min_size) = query.size_greater
        && metadata.len() <= min_size
    {
        return false;
    }
    if let Some(max_size) = query.size_less
        && metadata.len() >= max_size
    {
        return false;
    }
    if !matches_time_filters(metadata, query) {
        return false;
    }
    if !matches_permissions(metadata, query) {
        return false;
    }

    true
}

fn matches_extension(name: &str, kind: EntryKind, extensions: &[String]) -> bool {
    if extensions.is_empty() {
        return true;
    }
    // Directories are traversal state, not extension matches. `walk_children`
    // recurses independently after this predicate, so excluding them from the
    // result set does not prune descendants that may have an allowed extension.
    kind.is_file && has_extension(name, extensions)
}

/// Whether `name` ends in one of `extensions`, normalized as a query's are
/// (lowercase, no leading dot).
pub(crate) fn has_extension(name: &str, extensions: &[String]) -> bool {
    let extension = extension_of(name, true, "");
    !extension.is_empty() && extensions.iter().any(|allowed| allowed == &extension)
}

fn matches_time_filters(metadata: &fs::Metadata, query: &CompiledQuery) -> bool {
    if let Some(duration) = query.modified_within_secs
        && !system_time_within(metadata.modified().ok(), duration)
    {
        return false;
    }
    if let Some(duration) = query.modified_before_secs
        && !system_time_before(metadata.modified().ok(), duration)
    {
        return false;
    }
    if let Some(duration) = query.accessed_within_secs
        && !system_time_within(metadata.accessed().ok(), duration)
    {
        return false;
    }
    true
}

fn system_time_within(time: Option<SystemTime>, seconds: u64) -> bool {
    time.and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|elapsed| elapsed.as_secs() <= seconds)
}

fn system_time_before(time: Option<SystemTime>, seconds: u64) -> bool {
    time.and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|elapsed| elapsed.as_secs() > seconds)
}

#[cfg(unix)]
fn matches_permissions(metadata: &fs::Metadata, query: &CompiledQuery) -> bool {
    use std::os::unix::fs::PermissionsExt;

    let mode = metadata.permissions().mode() & 0o777;
    if let Some(expected) = query.permissions.as_ref() {
        // Compare octal *values*, not strings. The old `trim_start_matches('0')`
        // turned "000" into "" (so a real 000 file could never match) and also
        // mishandled forms like "0644"/"0o644". Parse both and compare numbers.
        let expected_mode = u32::from_str_radix(expected.trim().trim_start_matches("0o"), 8).ok();
        if expected_mode != Some(mode) {
            return false;
        }
    }
    if query.executable && mode & 0o111 == 0 {
        return false;
    }
    if query.readable && mode & 0o444 == 0 {
        return false;
    }
    if query.writable && mode & 0o222 == 0 {
        return false;
    }
    true
}

#[cfg(not(unix))]
fn matches_permissions(metadata: &fs::Metadata, query: &CompiledQuery) -> bool {
    if query.permissions.is_some() || query.executable || query.readable {
        return true;
    }
    if query.writable {
        return !metadata.permissions().readonly();
    }
    true
}

fn is_empty(path: &Path, metadata: &fs::Metadata) -> bool {
    if metadata.is_file() {
        return metadata.len() == 0;
    }
    if metadata.is_dir() {
        return fs::read_dir(path)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
    }
    false
}

fn to_entry(
    path: &Path,
    output_depth: u32,
    walk_position: u32,
    metadata: &fs::Metadata,
    query: &CompiledQuery,
) -> FileSystemEntry {
    let path_string = path.to_string_lossy().to_string();
    let relative_path = path
        .strip_prefix(&query.root)
        .ok()
        .map(crate::text::slash_path)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| file_name(path));
    let name = file_name(path);
    let entry_type = if metadata.is_file() {
        "file"
    } else if metadata.is_dir() {
        "directory"
    } else if metadata.file_type().is_symlink() {
        "symlink"
    } else {
        "other"
    }
    .to_owned();

    FileSystemEntry {
        path: path_string,
        relative_path,
        name: name.clone(),
        entry_type,
        size: Some(metadata.len() as i64),
        modified_ms: metadata.modified().ok().and_then(system_time_to_ms),
        modified_time: metadata.modified().ok(),
        accessed_ms: metadata.accessed().ok().and_then(system_time_to_ms),
        permissions: permission_string(metadata),
        extension: Some(extension_of(&name, false, "")),
        depth: output_depth,
        walk_position,
    }
}

fn system_time_to_ms(time: SystemTime) -> Option<f64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as f64)
}

#[cfg(unix)]
fn permission_string(metadata: &fs::Metadata) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;
    Some(format!("{:03o}", metadata.permissions().mode() & 0o777))
}

#[cfg(not(unix))]
fn permission_string(_metadata: &fs::Metadata) -> Option<String> {
    None
}

fn parse_duration_option(
    value: Option<&str>,
    label: &str,
    warnings: &mut Vec<String>,
) -> Option<u64> {
    match value {
        None => None,
        Some(raw) => match parse_duration(raw) {
            Some(seconds) => Some(seconds),
            None => {
                warnings.push(format!("{label} skipped: invalid duration format '{raw}'"));
                None
            }
        },
    }
}

fn parse_duration(raw: &str) -> Option<u64> {
    // Split on the first non-digit at a char boundary. `split_at(len - 1)` would
    // panic on a multibyte trailing char (e.g. "7€") and only ever read a
    // single-byte unit.
    let unit_start = raw.char_indices().find(|(_, c)| !c.is_ascii_digit())?.0;
    let (number, unit) = raw.split_at(unit_start);
    let value = number.parse::<u64>().ok()?;
    // `checked_mul` returns None on overflow (release builds have no overflow
    // checks), routing absurd-but-valid numerics into the invalid-duration path
    // rather than wrapping silently.
    match unit {
        "m" => value.checked_mul(60),
        "h" => value.checked_mul(60 * 60),
        "d" => value.checked_mul(24 * 60 * 60),
        "w" => value.checked_mul(7 * 24 * 60 * 60),
        _ => None,
    }
}

fn parse_size_option(value: Option<&str>, label: &str) -> Result<Option<u64>, Error> {
    value
        .map(|raw| {
            parse_size(raw).ok_or_else(|| {
                Error::with_kind(
                    ErrorKind::InvalidInput,
                    format!("Invalid {label} value for local filesystem query: {raw}"),
                )
            })
        })
        .transpose()
}

fn parse_size(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let split_at = trimmed
        .char_indices()
        .find(|(_, ch)| !ch.is_ascii_digit() && *ch != '.')
        .map(|(idx, _)| idx)
        .unwrap_or(trimmed.len());
    let (number, unit) = trimmed.split_at(split_at);
    let value = number.parse::<f64>().ok()?;
    let multiplier = match unit.to_ascii_lowercase().as_str() {
        "" | "b" | "c" => 1.0,
        "k" | "kb" => 1024.0,
        "m" | "mb" => 1024.0 * 1024.0,
        "g" | "gb" => 1024.0 * 1024.0 * 1024.0,
        "t" | "tb" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((value * multiplier).round() as u64)
}

pub(crate) fn normalize_extensions(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().trim_start_matches('.').to_lowercase())
        .filter(|value| !value.is_empty())
        .collect()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TmpDir;
    use std::fs::{self, File};

    fn query_file_system_inner(
        options: FileSystemQueryOptions,
    ) -> Result<FileSystemQueryResult, String> {
        query_file_system(options, &|_, _, _| true, &|| false).map_err(|err| err.reason)
    }

    #[test]
    fn deep_recursion_terminates_and_finds_leaf() {
        // Recursion past several levels must complete (and stay bounded by the
        // depth ceiling) rather than risk a stack overflow.
        let root = TmpDir::new();
        let mut p = root.0.clone();
        for i in 0..12 {
            p = p.join(format!("d{i}"));
        }
        fs::create_dir_all(&p).expect("deep dirs");
        File::create(p.join("leaf.ts")).expect("leaf");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            names: Some(vec!["leaf.ts".to_owned()]),
            recursive: Some(true),
            ..Default::default()
        })
        .expect("query");

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].name, "leaf.ts");
    }

    #[test]
    fn a_spent_time_budget_stops_at_the_first_unread_entry_and_names_it() {
        let root = TmpDir::new();
        for dir in ["a", "b"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
            File::create(root.join(dir).join("f.ts")).expect("file");
        }
        let run = |time_budget| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                time_budget,
                ..Default::default()
            })
            .expect("query")
        };
        let cut = run(Some(std::time::Duration::ZERO));
        assert_eq!(cut.time_cut.as_deref(), Some("a"));
        assert!(cut.entries.is_empty(), "nothing before the cut was read");
        let whole = run(Some(std::time::Duration::from_secs(3600)));
        assert_eq!(whole.time_cut, None);
        assert_eq!(whole.entries.len(), 4);
        assert_eq!(run(None).time_cut, None);
    }

    #[test]
    fn a_walk_resumed_at_any_position_lists_exactly_the_entries_after_it() {
        let root = TmpDir::new();
        for dir in ["a", "a/inner", "b", "c/deep/er"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
        }
        // Unlisted entries (`.md`, directories) are visited all the same.
        for file in [
            "a/1.ts",
            "a/2.md",
            "a/inner/3.ts",
            "b/4.ts",
            "c/deep/er/5.ts",
            "c/deep/6.md",
            "7.ts",
        ] {
            File::create(root.join(file)).expect("file");
        }
        let run = |skip_entries: u32, time_budget| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                extensions: Some(vec!["ts".to_owned()]),
                skip_entries: Some(skip_entries),
                time_budget,
                ..Default::default()
            })
            .expect("query")
        };
        let names = |result: &FileSystemQueryResult| {
            result
                .entries
                .iter()
                .map(|entry| entry.relative_path.clone())
                .collect::<Vec<_>>()
        };
        let whole = run(0, None);
        let all = names(&whole);
        assert_eq!(all.len(), 5, "{all:?}");
        // 6 directories and 7 files: every entry is visited.
        let visited = whole.walk_position;
        assert_eq!(visited, 13);
        let mut resumed_from_everywhere = 0;
        for skip in 0..=visited {
            // A walk that stops at its first new entry names where it
            // resumes: the position it was resumed at.
            let cut = run(skip, Some(std::time::Duration::ZERO));
            assert_eq!(cut.time_cut.is_some(), skip < visited, "skip {skip}");
            assert_eq!(cut.walk_position, skip, "skip {skip}");
            // Resumed to the end, it lists what the whole walk lists past
            // the skipped entries, once each.
            let rest = run(skip, None);
            assert_eq!(rest.walk_position, visited, "skip {skip}");
            let before = all
                .iter()
                .filter(|path| {
                    let position = |p: &str| {
                        whole_position(&root, p).expect("every listed entry has a position")
                    };
                    position(path) <= skip
                })
                .cloned()
                .collect::<Vec<_>>();
            let mut joined = before.clone();
            joined.extend(names(&rest));
            assert_eq!(joined, all, "skip {skip}");
            resumed_from_everywhere += 1;
        }
        assert_eq!(resumed_from_everywhere, visited + 1);
    }

    #[test]
    fn a_listed_entry_names_its_walk_position_and_a_walk_resumed_there_starts_after_it() {
        let root = TmpDir::new();
        for dir in ["a", "b/inner"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
        }
        for file in ["a/1.ts", "b/inner/2.ts", "b/3.md", "4.ts"] {
            File::create(root.join(file)).expect("file");
        }
        let run = |skip_entries| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                skip_entries: Some(skip_entries),
                ..Default::default()
            })
            .expect("query")
        };
        let whole = run(0);
        assert!(!whole.entries.is_empty());
        for entry in &whole.entries {
            assert_eq!(
                whole_position(&root, &entry.relative_path),
                Some(entry.walk_position),
                "{}",
                entry.relative_path
            );
        }
        for entry in &whole.entries {
            let rest = run(entry.walk_position);
            let expected = whole
                .entries
                .iter()
                .filter(|other| other.walk_position > entry.walk_position)
                .map(|other| other.relative_path.clone())
                .collect::<Vec<_>>();
            let found = rest
                .entries
                .iter()
                .map(|other| other.relative_path.clone())
                .collect::<Vec<_>>();
            assert_eq!(found, expected, "after {}", entry.relative_path);
        }
    }

    /// The policy callback sees every entry as a fresh one exactly once over
    /// the windows of a resumed walk, and a replayed entry only as a
    /// directory (the only entry a replay needs a verdict on).
    #[test]
    fn a_resumed_walk_shows_its_policy_callback_each_entry_fresh_once() {
        let root = TmpDir::new();
        for dir in ["a", "a/inner", "b", "c/deep"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
        }
        for file in ["a/1.ts", "a/inner/2.ts", "b/3.ts", "c/deep/4.ts", "5.ts"] {
            File::create(root.join(file)).expect("file");
        }
        let calls = |skip_entries: u32| {
            let seen = std::sync::Mutex::new(Vec::new());
            let result = query_file_system(
                FileSystemQueryOptions {
                    path: root.to_string_lossy().to_string(),
                    skip_entries: Some(skip_entries),
                    ..Default::default()
                },
                &|path, file_type, visit| {
                    if path != &*root {
                        seen.lock().expect("lock").push((
                            path.strip_prefix(&root).expect("under root").to_owned(),
                            file_type.is_some_and(|kind| kind.is_dir()),
                            visit,
                        ));
                    }
                    true
                },
                &|| false,
            )
            .expect("query");
            (seen.into_inner().expect("calls"), result.walk_position)
        };
        let (whole, visited) = calls(0);
        assert_eq!(visited, 10);
        assert!(whole.iter().all(|(_, _, visit)| visit.fresh_at().is_some()));
        for skip in 0..=visited {
            let (seen, _) = calls(skip);
            let fresh = seen
                .iter()
                .filter(|(_, _, visit)| visit.fresh_at().is_some())
                .map(|(path, _, _)| path.clone())
                .collect::<Vec<_>>();
            let first_new = whole.len() - fresh.len();
            let expected = whole[first_new..]
                .iter()
                .map(|(path, _, _)| path.clone())
                .collect::<Vec<_>>();
            assert_eq!(
                fresh, expected,
                "skip {skip}: the fresh entries are the new ones"
            );
            assert!(
                seen.iter()
                    .filter(|(_, _, visit)| *visit == Visit::Replayed)
                    .all(|(_, is_dir, _)| *is_dir),
                "skip {skip}: a replay judges directories only"
            );
        }
    }

    /// An unreadable directory is counted by the window that entered it; a
    /// window that replays past it does not count it again.
    #[cfg(unix)]
    #[test]
    fn a_resumed_walk_does_not_count_an_unreadable_directory_again() {
        use std::os::unix::fs::PermissionsExt;
        let root = TmpDir::new();
        for dir in ["a", "b", "c"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
            File::create(root.join(dir).join("f.ts")).expect("file");
        }
        let locked = root.join("a");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("lock");
        // Root users read it anyway: nothing to prove then.
        let readable = fs::read_dir(&locked).is_ok();
        let run = |skip_entries: u32| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                skip_entries: Some(skip_entries),
                ..Default::default()
            })
            .expect("query")
        };
        let whole = run(0);
        // `a` is the first entry: a walk resumed past it replays its read.
        let rest = run(1);
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).expect("unlock");
        if !readable {
            assert_eq!(whole.skipped, 1);
            assert_eq!(whole.permission_denied, 1);
            assert_eq!(rest.skipped, 0, "the window that entered `a` counted it");
            assert_eq!(rest.permission_denied, 0);
        }
    }

    /// 1-based position of `relative` in the name-sorted depth-first walk of
    /// `root` (every entry counted, directories before their children).
    fn whole_position(root: &Path, relative: &str) -> Option<u32> {
        fn visit(dir: &Path, target: &Path, count: &mut u32) -> bool {
            let mut children = fs::read_dir(dir)
                .expect("read")
                .map(|entry| entry.expect("entry").path())
                .collect::<Vec<_>>();
            children.sort();
            for child in children {
                *count += 1;
                if child == target || (child.is_dir() && visit(&child, target, count)) {
                    return true;
                }
            }
            false
        }
        let mut count = 0;
        visit(root, &root.join(relative), &mut count).then_some(count)
    }

    #[test]
    fn walk_children_yields_deterministic_sorted_order() {
        // `fs::read_dir` yields entries in raw OS order; the walk must sort
        // them so output is deterministic across runs and sorted within a dir.
        let root = TmpDir::new();
        for name in ["z.txt", "a.txt", "m.txt", "b.txt"] {
            File::create(root.join(name)).expect("create root file");
        }
        fs::create_dir_all(root.join("sub")).expect("create sub");
        for name in ["y.txt", "c.txt"] {
            File::create(root.join("sub").join(name)).expect("create sub file");
        }
        let run = || {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                recursive: Some(true),
                entry_type: Some("f".to_owned()),
                ..Default::default()
            })
            .expect("query")
            .entries
            .into_iter()
            .map(|entry| entry.relative_path)
            .collect::<Vec<_>>()
        };
        let first = run();
        for _ in 0..5 {
            assert_eq!(run(), first, "fs query order must be deterministic");
        }
        // Files directly under the root are emitted in sorted order.
        let root_files: Vec<&str> = first
            .iter()
            .filter(|p| !p.contains('/') && !p.contains('\\'))
            .map(String::as_str)
            .collect();
        let mut sorted = root_files.clone();
        sorted.sort_unstable();
        assert_eq!(root_files, sorted);
    }

    #[test]
    fn parse_duration_handles_units_and_rejects_garbage() {
        assert_eq!(parse_duration("7d"), Some(7 * 24 * 60 * 60));
        assert_eq!(parse_duration("30m"), Some(30 * 60));
        assert_eq!(parse_duration("2h"), Some(2 * 60 * 60));
        assert_eq!(parse_duration("1w"), Some(7 * 24 * 60 * 60));
        assert_eq!(parse_duration("7"), None); // no unit
        assert_eq!(parse_duration("d"), None); // no number
        assert_eq!(parse_duration("30min"), None); // multi-char unit unsupported
        assert_eq!(parse_duration(""), None);
        // Regression: a multibyte unit must return None, not panic on a non-char
        // boundary split.
        assert_eq!(parse_duration("7€"), None);
        // Regression: an absurd-but-valid numeric must not silently overflow u64
        // (release builds have no overflow checks). It must return None via the
        // invalid-duration path.
        let huge = u64::MAX.to_string();
        assert_eq!(parse_duration(&format!("{huge}m")), None);
        assert_eq!(parse_duration(&format!("{huge}h")), None);
        assert_eq!(parse_duration(&format!("{huge}d")), None);
        assert_eq!(parse_duration(&format!("{huge}w")), None);
    }

    #[test]
    fn query_errors_carry_their_kind() {
        let kind = |options: FileSystemQueryOptions| {
            query_file_system(options, &|_, _, _| true, &|| false)
                .expect_err("rejected")
                .kind()
                .clone()
        };
        assert_eq!(
            kind(FileSystemQueryOptions {
                path: ".".to_owned(),
                regex: Some("(".to_owned()),
                ..Default::default()
            }),
            ErrorKind::InvalidPattern
        );
        assert_eq!(
            kind(FileSystemQueryOptions {
                path: ".".to_owned(),
                size_greater: Some("lots".to_owned()),
                ..Default::default()
            }),
            ErrorKind::InvalidInput
        );
        assert_eq!(
            kind(FileSystemQueryOptions {
                path: ".".to_owned(),
                entry_type: Some("l".to_owned()),
                ..Default::default()
            }),
            ErrorKind::InvalidInput
        );
        assert_eq!(
            kind(FileSystemQueryOptions {
                path: "/definitely/missing/octocode-root".to_owned(),
                ..Default::default()
            }),
            ErrorKind::NotFound
        );
        for (names, exclude) in [
            (Some(vec!["[.ts".to_owned()]), None),
            (None, Some(vec!["{a,b".to_owned()])),
        ] {
            assert_eq!(
                kind(FileSystemQueryOptions {
                    path: ".".to_owned(),
                    names,
                    exclude,
                    ..Default::default()
                }),
                ErrorKind::InvalidGlob
            );
        }
    }

    #[test]
    fn a_stopped_walk_is_cancelled() {
        let root = TmpDir::new();
        File::create(root.join("a.ts")).expect("a");
        let error = query_file_system(
            FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                ..Default::default()
            },
            &|_, _, _| true,
            &|| true,
        )
        .expect_err("stopped");
        assert_eq!(*error.kind(), ErrorKind::Cancelled);
    }

    /// The walk leaves out what the ignore rules leave out, counts it, and
    /// walks it with `includeIgnored`.
    #[test]
    fn ignore_rules_are_honored_counted_and_lifted() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join(".git")).expect("repository marker");
        fs::create_dir_all(root.join("gen")).expect("gen");
        fs::write(
            root.join(".gitignore"),
            "gen/
*.log
.cache
",
        )
        .expect("gitignore");
        for file in ["a.rs", "b.log", "gen/x.rs", ".cache"] {
            File::create(root.join(file)).expect("file");
        }
        let files = |ignore: IgnorePolicy| {
            let found = query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                entry_type: Some("f".to_owned()),
                ignore,
                ..Default::default()
            })
            .expect("query");
            let mut paths = found
                .entries
                .iter()
                .map(|entry| entry.relative_path.replace('\\', "/"))
                .collect::<Vec<_>>();
            paths.sort();
            (paths, found.ignored)
        };
        // A dot entry out of view is not counted as ignored.
        assert_eq!(files(IgnorePolicy::default()), (vec!["a.rs".to_owned()], 2));
        let shown = IgnorePolicy {
            include_ignored: false,
            include_hidden: true,
        };
        assert_eq!(
            files(shown),
            (vec![".gitignore".to_owned(), "a.rs".to_owned()], 3)
        );
        let (all, ignored) = files(IgnorePolicy::ALL);
        assert_eq!(all, [".cache", ".gitignore", "a.rs", "b.log", "gen/x.rs"]);
        assert_eq!(ignored, 0);
    }

    #[test]
    fn rejects_min_depth_greater_than_max_depth() {
        let err = query_file_system_inner(FileSystemQueryOptions {
            path: ".".to_owned(),
            min_depth: Some(2),
            max_depth: Some(1),
            ..Default::default()
        })
        .expect_err("min_depth greater than max_depth must be rejected");

        assert!(err.contains("minDepth must be less than or equal to maxDepth"));
    }

    #[test]
    fn finds_files_by_name_glob() {
        let root = TmpDir::new();
        File::create(root.join("a.ts")).expect("create a.ts");
        File::create(root.join("b.js")).expect("create b.js");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            names: Some(vec!["*.ts".to_owned()]),
            ..Default::default()
        })
        .expect("query");

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].name, "a.ts");
    }

    #[test]
    fn filters_files_by_extension_without_returning_traversal_directories() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("src")).expect("create src");
        File::create(root.join("src/a.TS")).expect("create ts");
        File::create(root.join("src/b.rs")).expect("create rs");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            recursive: Some(true),
            extensions: Some(vec![".ts".to_owned()]),
            ..Default::default()
        })
        .expect("query");

        let mut names = result
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        names.sort_unstable();
        assert_eq!(names, vec!["a.TS"]);
    }

    #[test]
    fn respects_depth_and_exclude_dir() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("src/nested")).expect("create src");
        fs::create_dir_all(root.join("node_modules/pkg")).expect("create node_modules");
        File::create(root.join("src/nested/a.ts")).expect("create nested");
        File::create(root.join("node_modules/pkg/index.js")).expect("create ignored");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            max_depth: Some(3),
            exclude_dir: Some(vec!["node_modules".to_owned()]),
            names: Some(vec!["*.ts".to_owned()]),
            ..Default::default()
        })
        .expect("query");

        assert_eq!(result.entries.len(), 1);
        assert!(result.entries[0].path.ends_with("src/nested/a.ts"));
        assert_eq!(result.pruned_dirs, ["node_modules"]);
    }

    #[test]
    fn exclude_globs_skip_matching_files_and_whole_directories() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("src/gen/deep")).expect("create gen");
        fs::create_dir_all(root.join("vendor/lib")).expect("create vendor");
        File::create(root.join("src/a.ts")).expect("a");
        File::create(root.join("src/a.min.js")).expect("min");
        File::create(root.join("src/gen/deep/b.ts")).expect("b");
        File::create(root.join("vendor/lib/c.ts")).expect("c");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            entry_type: Some("f".to_owned()),
            exclude: Some(vec![
                "vendor".to_owned(),
                "src/gen/**".to_owned(),
                "*.min.js".to_owned(),
            ]),
            ..Default::default()
        })
        .expect("query");

        let paths = result
            .entries
            .iter()
            .map(|entry| entry.relative_path.replace('\\', "/"))
            .collect::<Vec<_>>();
        assert_eq!(paths, ["src/a.ts"]);
        // Caller exclusions are the caller's own filter, not a default prune.
        assert!(result.pruned_dirs.is_empty());
    }

    #[test]
    fn omitted_exclusions_prune_no_directory() {
        // The engine carries no default prune list: the runtime prune policy
        // (`octocode_native::policy::prune`) hands every walk its names.
        let root = TmpDir::new();
        fs::create_dir_all(root.join("src")).expect("create src");
        fs::create_dir_all(root.join("target/debug")).expect("create target");
        File::create(root.join("src/lib.rs")).expect("create source");
        File::create(root.join("target/debug/generated.rs")).expect("create generated source");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            recursive: Some(true),
            entry_type: Some("f".to_owned()),
            ..Default::default()
        })
        .expect("query");

        let mut paths = result
            .entries
            .iter()
            .map(|entry| entry.relative_path.replace('\\', "/"))
            .collect::<Vec<_>>();
        paths.sort();
        assert_eq!(paths, ["src/lib.rs", "target/debug/generated.rs"]);
    }

    #[test]
    fn names_with_a_slash_match_the_root_relative_path_ored_with_basenames() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("scrape/deep")).expect("dirs");
        fs::create_dir_all(root.join("other")).expect("dirs");
        for file in [
            "scrape/a.go",
            "scrape/deep/b.go",
            "other/c.go",
            "other/d_test.go",
        ] {
            File::create(root.join(file)).expect("file");
        }
        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            names: Some(vec!["scrape/**/*.go".to_owned(), "*_test.go".to_owned()]),
            ..Default::default()
        })
        .expect("query");
        let mut paths = result
            .entries
            .iter()
            .map(|entry| entry.relative_path.replace('\\', "/"))
            .collect::<Vec<_>>();
        paths.sort();
        assert_eq!(
            paths,
            ["other/d_test.go", "scrape/a.go", "scrape/deep/b.go"]
        );
    }

    #[test]
    fn filters_by_size_and_empty() {
        let root = TmpDir::new();
        File::create(root.join("empty.txt")).expect("create empty");
        fs::write(root.join("full.txt"), "hello").expect("write full");

        let empty = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            empty: Some(true),
            names: Some(vec!["*.txt".to_owned()]),
            ..Default::default()
        })
        .expect("query empty");
        assert_eq!(empty.entries.len(), 1);
        assert_eq!(empty.entries[0].name, "empty.txt");

        let full = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            size_greater: Some("1b".to_owned()),
            names: Some(vec!["*.txt".to_owned()]),
            ..Default::default()
        })
        .expect("query full");
        assert_eq!(full.entries.len(), 1);
        assert_eq!(full.entries[0].name, "full.txt");
    }

    #[test]
    fn filters_by_entry_type() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("src")).expect("create src");
        File::create(root.join("src/file.rs")).expect("create file");

        let result = query_file_system_inner(FileSystemQueryOptions {
            path: root.to_string_lossy().to_string(),
            entry_type: Some("d".to_owned()),
            ..Default::default()
        })
        .expect("query dirs");

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].name, "src");
        assert_eq!(result.entries[0].entry_type, "directory");
    }

    /// A directory's own length is its entry table, not content: no size
    /// filter lists a directory, however many entries it holds.
    #[test]
    fn size_filters_list_no_directory() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("crowded")).expect("create dir");
        for index in 0..64 {
            File::create(root.join(format!("crowded/entry-with-a-long-name-{index:03}")))
                .expect("create entry");
        }
        fs::write(root.join("full.txt"), "hello").expect("write full");
        assert!(fs::metadata(root.join("crowded")).expect("dir").len() > 5);

        for (size_greater, size_less) in [(Some("1b"), None), (None, Some("1m"))] {
            let result = query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                size_greater: size_greater.map(str::to_owned),
                size_less: size_less.map(str::to_owned),
                ..Default::default()
            })
            .expect("query");
            assert!(
                result
                    .entries
                    .iter()
                    .all(|entry| entry.entry_type == "file"),
                "{size_greater:?}/{size_less:?}: {:?}",
                result
                    .entries
                    .iter()
                    .map(|entry| &entry.relative_path)
                    .collect::<Vec<_>>()
            );
            assert!(result.entries.iter().any(|entry| entry.name == "full.txt"));
        }
    }

    /// A caller exclusion decides before the policy callback: the callback
    /// never sees (or counts) an excluded entry or anything under it.
    #[test]
    fn excluded_entries_never_reach_the_policy_callback() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("vendor/lib")).expect("create vendor");
        File::create(root.join("vendor/lib/c.ts")).expect("c");
        File::create(root.join("secret.key")).expect("key");
        File::create(root.join("a.ts")).expect("a");

        let seen = std::sync::Mutex::new(Vec::new());
        let result = query_file_system(
            FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                exclude: Some(vec!["vendor".to_owned(), "*.key".to_owned()]),
                ..Default::default()
            },
            &|path, _, _| {
                if path != &*root {
                    let relative = path.strip_prefix(&root).expect("under root");
                    seen.lock()
                        .expect("lock")
                        .push(relative.to_string_lossy().replace('\\', "/"));
                }
                true
            },
            &|| false,
        )
        .expect("query");

        assert_eq!(seen.into_inner().expect("calls"), ["a.ts"]);
        assert_eq!(result.entries.len(), 1);
    }

    #[test]
    fn slash_names_match_paths_below_the_root_with_braces_and_never_cross_a_slash_with_star() {
        let root = TmpDir::new();
        fs::create_dir_all(root.join("packages/react/src")).expect("react dir");
        fs::create_dir_all(root.join("packages/react-dom/src/deep")).expect("react-dom dir");
        fs::create_dir_all(root.join("packages/scheduler/src")).expect("scheduler dir");
        File::create(root.join("packages/react/src/ReactHooks.js")).expect("react hooks");
        File::create(root.join("packages/react-dom/src/deep/ReactDOMHooks.js"))
            .expect("react-dom hooks");
        File::create(root.join("packages/scheduler/src/Scheduler.js")).expect("scheduler file");
        let names = |glob: &str| {
            let mut names = query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                names: Some(vec![glob.to_owned()]),
                entry_type: Some("f".to_owned()),
                ..Default::default()
            })
            .expect("query")
            .entries
            .into_iter()
            .map(|entry| entry.name)
            .collect::<Vec<_>>();
            names.sort_unstable();
            names
        };
        assert_eq!(
            names("packages/{react,react-dom}/src/**"),
            ["ReactDOMHooks.js", "ReactHooks.js"]
        );
        assert_eq!(
            names("packages/*/src/*.js"),
            ["ReactHooks.js", "Scheduler.js"]
        );
        assert_eq!(names("*.[jt]s").len(), 3);
        assert_eq!(names("[!R]*.js"), ["Scheduler.js"]);
    }

    /// A tree whose walk is deep, with unlisted entries (`.md`, directories).
    fn resume_tree() -> TmpDir {
        let root = TmpDir::new();
        for dir in ["a", "a/inner", "b", "c/deep/er"] {
            fs::create_dir_all(root.join(dir)).expect("dir");
        }
        for file in [
            "a/1.ts",
            "a/2.md",
            "a/inner/3.ts",
            "b/4.ts",
            "c/deep/er/5.ts",
            "c/deep/6.md",
            "7.ts",
        ] {
            File::create(root.join(file)).expect("file");
        }
        root
    }

    /// A walk of `resume_tree` resumed at `skip`, with how many entries its
    /// policy callback saw replayed and fresh.
    fn resumed(
        root: &TmpDir,
        skip: u32,
        resume: Option<WalkCursor>,
        time_budget: Option<std::time::Duration>,
    ) -> (FileSystemQueryResult, usize, usize) {
        let replayed = std::sync::atomic::AtomicUsize::new(0);
        let fresh = std::sync::atomic::AtomicUsize::new(0);
        let result = query_file_system(
            FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                extensions: Some(vec!["ts".to_owned()]),
                skip_entries: Some(skip),
                resume,
                time_budget,
                window_rows: Some(2),
                ..Default::default()
            },
            &|path, _, visit| {
                // The root is judged once per walk, never an entry of it.
                if path == Path::new(&*root.to_string_lossy()) {
                    return true;
                }
                let counter = if visit.fresh_at().is_some() {
                    &fresh
                } else {
                    &replayed
                };
                counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                true
            },
            &|| false,
        )
        .expect("query");
        (result, replayed.into_inner(), fresh.into_inner())
    }

    fn relative_paths(result: &FileSystemQueryResult) -> Vec<String> {
        result
            .entries
            .iter()
            .map(|entry| entry.relative_path.clone())
            .collect()
    }

    /// A walk resumed from the cursor of the walk it resumes continues
    /// there: nothing is replayed, and it lists and counts what a replaying
    /// resume does, from every position a walk stops at.
    #[test]
    fn a_walk_resumed_from_its_cursor_replays_nothing_and_matches_a_replay() {
        let root = resume_tree();
        let (whole, _, _) = resumed(&root, 0, None, None);
        let visited = whole.walk_position;
        let mut replays_saved = 0;
        for skip in 0..visited {
            // A walk stopped by its time budget at its first new entry.
            let (cut, _, _) = resumed(&root, skip, None, Some(std::time::Duration::ZERO));
            let cursor = cut
                .cursor
                .clone()
                .expect("a walk cut by time keeps its cursor");
            assert_eq!(cursor.position(), skip, "skip {skip}");
            let (replay, replayed, _) = resumed(&root, skip, None, None);
            let (continued, none_replayed, fresh) = resumed(&root, skip, Some(cursor), None);
            assert_eq!(none_replayed, 0, "skip {skip}: nothing replayed");
            assert_eq!(
                relative_paths(&continued),
                relative_paths(&replay),
                "skip {skip}"
            );
            assert_eq!(continued.walk_position, visited, "skip {skip}");
            assert_eq!(
                fresh as u32,
                visited - skip,
                "skip {skip}: only new entries"
            );
            replays_saved += replayed;
        }
        assert!(
            replays_saved > 0,
            "the replaying resume replays directories"
        );
    }

    /// The window that ends at its `window_rows`-th listed entry keeps a
    /// cursor there: a walk resumed from it lists the rest, and the two
    /// windows hold every entry once.
    #[test]
    fn a_window_ended_at_a_listed_entry_resumes_from_there_without_a_gap_or_repeat() {
        let root = resume_tree();
        let (whole, _, _) = resumed(&root, 0, None, None);
        let all = relative_paths(&whole);
        for rows in 1..=all.len() as u32 {
            let mut first = query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                extensions: Some(vec!["ts".to_owned()]),
                window_rows: Some(rows),
                ..Default::default()
            })
            .expect("window");
            let last = first.entries[rows as usize - 1].walk_position;
            first.end_at(last);
            let cursor = first.cursor.clone().expect("a cursor at the window's end");
            assert_eq!(cursor.position(), last);
            let (rest, replayed, _) = resumed(&root, last, Some(cursor), None);
            assert_eq!(replayed, 0, "rows {rows}");
            let mut joined = relative_paths(&first);
            joined.extend(relative_paths(&rest));
            assert_eq!(joined, all, "rows {rows}");
        }
    }

    /// A cursor of another walk shape is not trusted: the walk replays.
    #[test]
    fn a_cursor_of_another_walk_is_ignored_and_the_walk_replays() {
        let root = resume_tree();
        let (cut, _, _) = resumed(&root, 3, None, Some(std::time::Duration::ZERO));
        let cursor = cut.cursor.expect("cursor");
        let shallow = |resume| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                skip_entries: Some(3),
                max_depth: Some(1),
                resume,
                ..Default::default()
            })
            .expect("query")
        };
        assert_eq!(
            relative_paths(&shallow(Some(cursor))),
            relative_paths(&shallow(None))
        );
    }

    /// A resume reads the directories it holds as the walk it resumes read
    /// them: an entry removed since is skipped, the rest is listed once.
    #[test]
    fn a_cursor_resume_survives_an_entry_removed_since() {
        let root = resume_tree();
        // The walk order is `7.ts`, `a`, `a/1.ts`, `a/2.md`, `a/inner`, ...:
        // after the 3rd entry, `a/2.md` and everything past it remain.
        let (cut, _, _) = resumed(&root, 3, None, Some(std::time::Duration::ZERO));
        let cursor = cut.cursor.expect("cursor");
        fs::remove_file(root.join("a/inner/3.ts")).expect("remove");
        let (rest, replayed, _) = resumed(&root, 3, Some(cursor), None);
        assert_eq!(replayed, 0);
        assert_eq!(relative_paths(&rest), ["b/4.ts", "c/deep/er/5.ts"]);
        let (replay, _, _) = resumed(&root, 3, None, None);
        assert_eq!(relative_paths(&rest), relative_paths(&replay));
    }

    /// Counts are the walk's own through the window's end: the window that
    /// ends at an earlier entry leaves the rest to the walk that resumes
    /// there, so the two count each entry once.
    #[test]
    fn a_window_counts_only_the_entries_it_covers() {
        let root = TmpDir::new();
        fs::create_dir(root.join(".git")).expect("marker");
        fs::write(root.join(".gitignore"), "*.log\n").expect("rules");
        for name in ["a.ts", "b.log", "c.ts", "d.log", "e.ts"] {
            File::create(root.join(name)).expect("file");
        }
        let walk = |skip| {
            query_file_system_inner(FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                extensions: Some(vec!["ts".to_owned()]),
                skip_entries: Some(skip),
                ..Default::default()
            })
            .expect("query")
        };
        let whole = walk(0);
        assert_eq!(whole.ignored, 2);
        let a = whole.entries[0].walk_position;
        let c = whole.entries[1].walk_position;
        let mut window = walk(0);
        window.end_at(c);
        assert_eq!((window.ignored, window.entries.len()), (1, 2));
        assert_eq!(window.walk_position, c);
        let rest = walk(c);
        assert_eq!(window.ignored + rest.ignored, whole.ignored);
        let mut early = walk(0);
        early.end_at(a);
        assert_eq!((early.ignored, early.entries.len()), (0, 1));
    }
}

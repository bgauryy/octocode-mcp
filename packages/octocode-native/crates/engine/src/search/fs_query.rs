use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use ignore::gitignore::Gitignore;
use regex::Regex;

use super::glob;
use super::walk::{IgnorePolicy, IgnoreRules, Prune, Stop};
use crate::error::{Error, ErrorKind};
use crate::text::file_extension::extension_of;
use crate::types::{FileSystemEntry, FileSystemQueryOptions, FileSystemQueryResult};

/// A walk's policy callback: the path and its directory-entry type (`None`
/// for the root, or when the platform did not report it). `false` leaves the
/// entry out, and a directory with everything under it.
pub type EntryFilter<'a> = dyn Fn(&Path, Option<fs::FileType>) -> bool + 'a;

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
    entry_type: Option<String>,
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
    warnings: Vec<String>,
}

#[derive(Default)]
struct QueryState {
    entries: Vec<FileSystemEntry>,
    total_discovered: u32,
    skipped: u32,
    permission_denied: u32,
    ignored: u32,
    pruned_dirs: Vec<String>,
}

/// Walk `options.path` in name order, listing the entries its filters
/// match. `admit` decides each descendant before it is inspected or counted
/// (a denied directory is not entered); ignore rules decide it before that.
/// `stop` cancels the walk ([`ErrorKind::Cancelled`]).
pub(crate) fn query_file_system(
    options: FileSystemQueryOptions,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<FileSystemQueryResult, Error> {
    let query = CompiledQuery::new(options)?;
    let mut state = QueryState::default();
    if !admit(&query.root, None) {
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

    if query.include_root {
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
        walk_children(&query.root, 1, &query, &mut state, admit, stop)?;
    } else if !root_metadata.is_dir() && !query.include_root {
        return Err(Error::new(format!(
            "Filesystem query root is not a directory: {}",
            query.root.display()
        )));
    }

    let was_capped = state.total_discovered as usize > query.limit;
    Ok(FileSystemQueryResult {
        entries: state.entries,
        total_discovered: state.total_discovered,
        was_capped,
        skipped: state.skipped,
        permission_denied: state.permission_denied,
        ignored: state.ignored,
        warnings: query.warnings,
        pruned_dirs: state.pruned_dirs,
    })
}

impl CompiledQuery {
    fn new(options: FileSystemQueryOptions) -> Result<Self, Error> {
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
            entry_type: options.entry_type,
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
            warnings,
        })
    }
}

impl CompiledQuery {
    /// Whether a caller `exclude` glob matches this entry.
    fn excludes(&self, path: &Path, is_dir: bool) -> bool {
        self.exclude
            .as_ref()
            .is_some_and(|exclude| glob::matches(exclude, path, is_dir))
    }

    /// Whether the ignore rules leave this entry out; counted as ignored
    /// unless it is a dot entry out of view.
    fn ignores(&self, path: &Path, name: &str, is_dir: bool, state: &mut QueryState) -> bool {
        let ignored = self
            .ignore_rules
            .as_ref()
            .is_some_and(|rules| rules.is_ignored(path, is_dir));
        if ignored && (self.show_hidden || !name.starts_with('.')) {
            state.ignored += 1;
        }
        ignored
    }
}

fn walk_children(
    base: &Path,
    depth: u32,
    query: &CompiledQuery,
    state: &mut QueryState,
    admit: &EntryFilter<'_>,
    stop: &Stop<'_>,
) -> Result<(), Error> {
    if depth > MAX_RECURSION_DEPTH {
        state.skipped += 1;
        return Ok(());
    }
    if query.max_depth.is_some_and(|max_depth| depth > max_depth) {
        return Ok(());
    }

    let read_dir = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(err) => {
            state.skipped += 1;
            if err.kind() == std::io::ErrorKind::PermissionDenied {
                state.permission_denied += 1;
            }
            return Ok(());
        }
    };

    // `fs::read_dir` yields entries in raw OS order (hash order on APFS, etc.),
    // so without sorting the result set — and its silent truncation at the limit
    // — would vary run-to-run. Collect and sort by file name for deterministic,
    // stable output. Read errors are still surfaced as skips.
    let mut children: Vec<fs::DirEntry> = Vec::new();
    for dir_entry in read_dir {
        match dir_entry {
            Ok(entry) => children.push(entry),
            Err(err) => {
                state.skipped += 1;
                if err.kind() == std::io::ErrorKind::PermissionDenied {
                    state.permission_denied += 1;
                }
            }
        }
    }
    children.sort_by_key(fs::DirEntry::file_name);

    for dir_entry in children {
        // Look ahead to one additional matching entry before declaring overflow.
        // Reaching the stored-entry cap alone does not prove the scan is partial.
        if query.stop_at_limit && state.total_discovered as usize > query.limit {
            return Ok(());
        }
        if stop() {
            return Err(Error::cancelled());
        }

        let path = dir_entry.path();
        // The entry type comes with the directory listing on common
        // platforms; the policy check and the name filters use it, and only
        // an entry those admit is stat'ed for its size and times.
        let file_type = dir_entry.file_type().ok();
        let file_name = dir_entry.file_name();
        let name = file_name.to_string_lossy();
        let mut metadata = None;
        let kind = match file_type {
            Some(file_type) => EntryKind::of(file_type),
            None => match lstat(&path, state) {
                Some(meta) => metadata.insert(meta).file_type().into(),
                None => continue,
            },
        };
        let is_directory = kind.is_dir;
        if query.ignores(&path, &name, is_directory, state) {
            continue;
        }
        // Authorize before metadata, matching (which can inspect empty
        // directories), discovery counters, or recursive traversal.
        if !admit(&path, file_type) {
            continue;
        }
        if !query.show_hidden && name.starts_with('.') {
            continue;
        }
        if is_directory && query.prune.names(&file_name) {
            let relative = path.strip_prefix(&query.root).unwrap_or(&path);
            state.pruned_dirs.push(normalize_path(relative));
            continue;
        }
        if query.excludes(&path, is_directory) {
            continue;
        }

        if visit_path(&path, &name, depth, kind, &mut metadata, query, state).is_err() {
            continue;
        }

        if query.recursive && is_directory {
            walk_children(&path, depth + 1, query, state, admit, stop)?;
            if query.stop_at_limit && state.total_discovered as usize > query.limit {
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
    is_symlink: bool,
}

impl EntryKind {
    fn of(file_type: fs::FileType) -> Self {
        Self {
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
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
            state.skipped += 1;
            if err.kind() == std::io::ErrorKind::PermissionDenied {
                state.permission_denied += 1;
            }
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

    state
        .entries
        .push(to_entry(path, depth.saturating_sub(1), metadata, query));
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
    if let Some(entry_type) = &query.entry_type {
        let matches_type = match entry_type.as_str() {
            "f" => kind.is_file,
            "d" => kind.is_dir,
            "l" => kind.is_symlink,
            _ => true,
        };
        if !matches_type {
            return false;
        }
    }
    true
}

/// The filters that need the entry's metadata.
fn matches_metadata(path: &Path, metadata: &fs::Metadata, query: &CompiledQuery) -> bool {
    if query.empty && !is_empty(path, metadata) {
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
    metadata: &fs::Metadata,
    query: &CompiledQuery,
) -> FileSystemEntry {
    let path_string = path.to_string_lossy().to_string();
    let relative_path = path
        .strip_prefix(&query.root)
        .ok()
        .map(normalize_path)
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

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};

    fn query_file_system_inner(
        options: FileSystemQueryOptions,
    ) -> Result<FileSystemQueryResult, String> {
        query_file_system(options, &|_, _| true, &|| false).map_err(|err| err.reason)
    }

    fn temp_root(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("octocode_fs_query_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    #[test]
    fn deep_recursion_terminates_and_finds_leaf() {
        // Recursion past several levels must complete (and stay bounded by the
        // depth ceiling) rather than risk a stack overflow.
        let root = temp_root("deep");
        let mut p = root.clone();
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn walk_children_yields_deterministic_sorted_order() {
        // `fs::read_dir` yields entries in raw OS order; the walk must sort
        // them so output is deterministic across runs and sorted within a dir.
        let root = temp_root("sorted_order");
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
        fs::remove_dir_all(root).expect("cleanup");
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
            query_file_system(options, &|_, _| true, &|| false)
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
        let root = temp_root("stopped");
        File::create(root.join("a.ts")).expect("a");
        let error = query_file_system(
            FileSystemQueryOptions {
                path: root.to_string_lossy().to_string(),
                ..Default::default()
            },
            &|_, _| true,
            &|| true,
        )
        .expect_err("stopped");
        assert_eq!(*error.kind(), ErrorKind::Cancelled);
        fs::remove_dir_all(root).expect("cleanup");
    }

    /// The walk leaves out what the ignore rules leave out, counts it, and
    /// walks it with `includeIgnored`.
    #[test]
    fn ignore_rules_are_honored_counted_and_lifted() {
        let root = temp_root("ignore_rules");
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
        fs::remove_dir_all(root).expect("cleanup");
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
        let root = temp_root("glob");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn filters_files_by_extension_without_returning_traversal_directories() {
        let root = temp_root("extension");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn respects_depth_and_exclude_dir() {
        let root = temp_root("depth");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn exclude_globs_skip_matching_files_and_whole_directories() {
        let root = temp_root("exclude_globs");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn omitted_exclusions_prune_no_directory() {
        // The engine carries no default prune list: the runtime prune policy
        // (`octocode_native::policy::prune`) hands every walk its names.
        let root = temp_root("no_default_excludes");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn names_with_a_slash_match_the_root_relative_path_ored_with_basenames() {
        let root = temp_root("path_names");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn filters_by_size_and_empty() {
        let root = temp_root("size");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn filters_by_entry_type() {
        let root = temp_root("entry_type");
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
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn slash_names_match_paths_below_the_root_with_braces_and_never_cross_a_slash_with_star() {
        let root = temp_root("path_names_brace");
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
        fs::remove_dir_all(root).expect("cleanup");
    }
}

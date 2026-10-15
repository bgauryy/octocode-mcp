use super::Walking;
use crate::contracts::tool_types::DefaultExcludes;
use crate::policy::prune::DefaultsFlag;
use crate::tools::empty_walk::Walk;
use crate::tools::result::ToolError;
use crate::{
    policy::{path::PathPolicy, prune::PruneMode},
    security::ContentSecurity,
    tools::cancel::CancellationCheck,
};
use octocode_engine::types::{FileSystemEntry, FileSystemQueryOptions};
use serde_json::{Value, json};

use crate::contracts::tool_types::{StructureSearchQueryFiles, StructureSearchQueryFilesTime};

/// Engine-unit views over the generated `files` query.
impl StructureSearchQueryFiles {
    /// Levels below `path` (1 = its children), as `tree` and the engine
    /// count them.
    fn depth(value: Option<std::num::NonZeroU64>) -> Option<u32> {
        value.map(|depth| u32::try_from(depth.get()).unwrap_or(u32::MAX))
    }
    pub(crate) fn max_depth(&self) -> Option<u32> {
        Self::depth(self.max_depth)
    }
    pub(crate) fn min_depth(&self) -> Option<u32> {
        Self::depth(self.min_depth)
    }
    fn non_empty(values: &[String]) -> Option<Vec<String>> {
        (!values.is_empty()).then(|| values.to_vec())
    }
    pub(crate) fn include(&self) -> Option<Vec<String>> {
        Self::non_empty(&self.include).map(|globs| crate::policy::include::include_globs(&globs))
    }
    pub(crate) fn extensions(&self) -> Option<Vec<String>> {
        Self::non_empty(&self.extensions)
    }
    pub(crate) fn exclude(&self) -> Option<Vec<String>> {
        Self::non_empty(&self.exclude)
    }
    pub(crate) fn entry_type(&self) -> Option<String> {
        self.entry_type.map(|kind| kind.to_string())
    }
    pub(crate) fn permissions(&self) -> Option<String> {
        self.permissions.as_ref().map(ToString::to_string)
    }
    pub(crate) fn access(&self) -> Option<String> {
        self.access.map(|access| access.to_string())
    }
    /// `full` (line counts and modified times in each entry) is what
    /// `extras: ["details"]` asks for; otherwise entries carry sizes only.
    pub(crate) fn detail(&self) -> String {
        if self
            .extras
            .contains(&crate::contracts::tool_types::ExtraKind::Details)
        {
            "full".to_owned()
        } else {
            "basic".to_owned()
        }
    }
    pub(crate) fn sort(&self) -> String {
        self.sort.to_string()
    }
    pub(crate) fn max_entries(&self) -> Option<u32> {
        self.max_entries
            .map(|limit| u32::try_from(limit.get()).unwrap_or(u32::MAX))
    }
    pub(crate) fn page(&self) -> u32 {
        u32::try_from(self.page.get()).unwrap_or(u32::MAX)
    }
    /// The caller's page size; `None` pages by the response budget.
    pub(crate) fn page_size(&self) -> Option<usize> {
        self.page_size
            .map(|size| usize::try_from(size.get()).unwrap_or(usize::MAX))
    }
    pub(crate) fn snapshot(&self) -> Option<&str> {
        self.snapshot.as_deref().map(String::as_str)
    }
    /// Listing rows (in walk or sort order) earlier windows listed.
    pub(crate) fn scan_offset(&self) -> usize {
        self.scan_offset.map_or(0, |offset| {
            usize::try_from(offset.get()).unwrap_or(usize::MAX)
        })
    }
}

struct Row {
    /// Directory the entry is listed under, named like `path`.
    dir: String,
    /// The entry text inside its directory group ([`entry_text`]).
    entry: String,
    display_name: String,
    kind: &'static str,
    path: String,
    name: String,
    size: i64,
    modified: f64,
    lines: usize,
    /// The walked entry, for the continuation pages' change check.
    source: std::path::PathBuf,
    /// Its size and time as the walk read them (the stored walk's stamp).
    seen: (u64, Option<std::time::SystemTime>),
}

impl super::Sourced for Row {
    fn kind(&self) -> &'static str {
        self.kind
    }
    fn seen(&self) -> super::memo::Seen<'_> {
        super::memo::Seen {
            path: &self.source,
            size: self.seen.0,
            modified: self.seen.1,
        }
    }
}

/// Snapshot fingerprint over the query shape, the page cut, and the
/// ordered result set, so a continuation cursor (page>1) can be rejected
/// with `staleSnapshot` when the corpus or query drifted between pages, or a
/// different response window would cut other pages. The page budget is
/// measured on it, so every page of one snapshot cuts at the same rows.
fn snapshot_identity(
    q: &StructureSearchQueryFiles,
    root: &std::path::Path,
    requested: usize,
) -> Value {
    json!([
        root.to_string_lossy(),
        q.max_depth(),
        q.min_depth(),
        q.include(),
        q.extensions(),
        q.name_regex,
        q.entry_type(),
        q.empty,
        q.permissions(),
        q.access(),
        q.exclude(),
        // Effective (not raw) values: the nextPage continuation injects these
        // defaults, so the digest must match what the follow-up request carries.
        q.sort(),
        q.detail(),
        requested,
        q.scan_offset(),
        q.page_size(),
        q.include_ignored,
        q.default_excludes,
        q.time,
        q.size,
    ])
}

pub fn execute_files(
    q: &StructureSearchQueryFiles,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
    budget: std::time::Duration,
) -> super::StructureResult {
    let validated = super::validated_root(q.path.as_str(), paths, cancel)?;
    validate_time(q.time.as_ref())?;
    let requested = q
        .max_entries()
        .unwrap_or_else(super::max_walk)
        .min(super::max_walk()) as usize;
    let identity = snapshot_identity(q, &validated.canonical, requested);
    let policy = paths.identity();
    let page = q.page().max(1) as usize;
    let (walk, stored) = super::walked(page, q.snapshot(), &policy, || {
        walk_files(
            q,
            &validated.canonical,
            paths,
            security,
            cancel,
            requested,
            Walking::Listing(budget),
        )
    })?;
    let budget = crate::tools::page_windows::page_budget(response_window, &identity);
    // The row layout cuts pages too, so it is part of the snapshot.
    let snapshot = crate::digest::json_sha256(&json!([
        identity,
        budget,
        ROW_LAYOUT,
        walk.rows
            .iter()
            .map(|r| (&r.dir, &r.entry, &r.path))
            .collect::<Vec<_>>()
    ]));
    if let Some(restart) = super::restart_if_stale(q, page, q.snapshot(), &snapshot) {
        return Ok(restart);
    }
    let page_size = q
        .page_size()
        .map(|size| size.clamp(1, super::structure_max("pageSize") as usize));
    let prefix = super::listing_prefix(paths, &validated.canonical);
    let deferred_detail = q.detail() == "full" && q.sort() != "lines";
    let pages = super::page_ranges(
        &files_costs(&walk.rows, &prefix, deferred_detail),
        page_size,
        budget,
    );
    if !stored && pages.len() > 1 {
        super::memo::put(snapshot.clone(), policy, &validated.canonical, &walk);
    }
    let mut out = files_page(
        q,
        &walk,
        &pages,
        snapshot,
        (&validated.canonical, &prefix),
        requested,
        paths,
        cancel,
    )?;
    let shown = Walk {
        ignored: q.include_ignored == Some(true),
        hidden: true,
        default_excludes: q.default_excludes.defaults(),
    };
    super::probe_empty(
        &mut out,
        q,
        (&validated.canonical, paths),
        &walk.meta.uncovered,
        shown,
        |relaxed, walking| {
            let mut relaxed_query = q.clone();
            relaxed_query.include_ignored = Some(relaxed.ignored);
            relaxed_query.default_excludes = Some(DefaultExcludes(relaxed.default_excludes));
            relaxed_query.scan_offset = None;
            walk_files(
                &relaxed_query,
                &validated.canonical,
                paths,
                security,
                cancel,
                super::PROBE_HITS,
                walking,
            )
        },
    )?;
    Ok(out)
}

/// Path order is the walk order (name-sorted, depth-first), so the first
/// `limit` matches are final once found: the walk stops there. Other sorts
/// rank the whole walk.
fn early_exit(q: &StructureSearchQueryFiles) -> bool {
    q.sort() == "path"
}

/// The engine walk a files listing runs: the query's filters over `root`,
/// stopping at `walk_limit` entries.
fn query_options(
    q: &StructureSearchQueryFiles,
    root: &std::path::Path,
    walk_limit: u32,
) -> FileSystemQueryOptions {
    let time = &q.time;
    let access = q.access();
    let access = access.as_deref();
    FileSystemQueryOptions {
        path: root.to_string_lossy().into_owned(),
        include_root: Some(true),
        recursive: Some(true),
        max_depth: q.max_depth(),
        min_depth: q.min_depth(),
        ignore: octocode_engine::search::walk::IgnorePolicy::new(q.include_ignored, Some(true)),
        names: q.include(),
        extensions: q.extensions(),
        regex: q.name_regex.clone(),
        entry_type: q.entry_type(),
        empty: q.empty,
        modified_within: time
            .as_ref()
            .and_then(|t| t.modified_within.as_deref())
            .cloned(),
        modified_before: time
            .as_ref()
            .and_then(|t| t.modified_before.as_deref())
            .cloned(),
        accessed_within: time
            .as_ref()
            .and_then(|t| t.accessed_within.as_deref())
            .cloned(),
        size_greater: q
            .size
            .as_ref()
            .and_then(|s| s.greater.as_ref())
            .map(ToString::to_string),
        size_less: q
            .size
            .as_ref()
            .and_then(|s| s.less.as_ref())
            .map(ToString::to_string),
        permissions: q.permissions(),
        executable: Some(access == Some("executable")),
        readable: Some(access == Some("readable")),
        writable: Some(access == Some("writable")),
        exclude_dir: Some(PruneMode::SyntaxVisible.directories(q.default_excludes.defaults())),
        exclude: q.exclude(),
        stop_at_limit: Some(true),
        limit: Some(walk_limit),
        ..Default::default()
    }
}

/// Walk once: rows sorted and cut to `requested`, path-ordered rows grouped
/// like `tree`, directories with their own group not also listed bare. A
/// probe walk stops at its first `requested` entries, whatever the sort, and
/// admits nothing past its deadline; a listing walk stops at its time budget.
fn walk_files(
    q: &StructureSearchQueryFiles,
    root: &std::path::Path,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    requested: usize,
    walking: Walking<'_>,
) -> Result<super::Walked<Row>, ToolError> {
    let bound = walking.probe();
    // Leave out what the tree and localSearch leave out: ignored entries,
    // pruned during the walk (and counted by it) unless `includeIgnored`.
    let probe = super::FilterProbe::new(
        root,
        &q.include().unwrap_or_default(),
        &q.extensions,
        q.name_regex.as_deref(),
    )?;
    let withheld = std::sync::Mutex::new(crate::policy::discovery::Withheld::default());
    let detail = q.detail();
    let sort = q.sort();
    let walk_limit = if early_exit(q) || bound.is_some() {
        requested as u32
    } else {
        super::max_walk()
    };
    let discovery = paths.discovery_walk();
    let native = octocode_engine::portable::query_file_system(
        FileSystemQueryOptions {
            time_budget: walking.budget(),
            ..query_options(q, root, walk_limit)
        },
        &|path, file_type| {
            // The root itself stays admitted: a probe out of time lists
            // nothing under it, never fails.
            if path != root && bound.is_some_and(|bound| !bound.admits(path, file_type)) {
                return false;
            }
            let allowed = discovery.permits_entry(path, file_type);
            // Only an entry these filters could list makes absence unproven.
            if !allowed && probe.could_list(path) && super::reports_withheld(path) {
                withheld
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .record(path, path.is_dir());
            }
            allowed
        },
        &|| cancel.check().is_err(),
    )
    .map_err(|error| super::walk_error(error, q.path.as_str(), cancel))?;
    cancel.check().map_err(ToolError::cancelled)?;
    let count_lines = sort == "lines";
    // A directory root is the listing itself, never one of its rows.
    let mut rows = native
        .entries
        .iter()
        .filter(|e| {
            !(e.entry_type == "directory"
                && (e.relative_path.is_empty() || std::path::Path::new(&e.path) == root))
        })
        .map(|e| make_row(e, root, security, &detail, count_lines, paths, cancel))
        .collect::<Result<Vec<_>, ToolError>>()?;
    sort_rows(&mut rows, &sort);
    let mut walk = super::Walked::finish(
        native,
        rows,
        requested,
        q.scan_offset(),
        withheld,
        0,
        security,
    );
    // Path order groups like `tree`: `path`'s own entries first, then each
    // directory once, in walk order (the sort is stable). Other sorts keep
    // their order, so a directory may open several groups.
    if sort == "path" {
        // The root's own `.` entry leads its bare entries.
        walk.rows.sort_by_key(|row| {
            (
                std::path::PathBuf::from(&row.dir),
                !row.entry.starts_with("./"),
            )
        });
    }
    drop_grouped_dirs(&mut walk.rows);
    Ok(walk)
}

/// A directory with its own `{dir, files}` group is named by that group; a
/// bare `"name/"` entry for it under its parent would show it twice, even
/// across pages. One with fields (`modifiedMs`) keeps them.
fn drop_grouped_dirs(rows: &mut Vec<Row>) {
    super::drop_grouped_dirs(
        rows,
        |row| row.dir.as_str(),
        |row| {
            row.entry
                .strip_suffix('/')
                .is_some_and(|name| name != ".")
                .then(|| row.path.clone())
        },
    );
}

/// A row costs its serialized entry, plus its group's header with the
/// directory rendered as the response shows it whenever it opens a group
/// (a page repeats the header of a group it continues). Costs are bound
/// by the snapshot, so every page of it cuts at the same rows.
fn files_costs(rows: &[Row], prefix: &str, deferred_detail: bool) -> Vec<super::RowCost> {
    let mut headers = std::collections::HashMap::<&str, usize>::new();
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let header = *headers.entry(row.dir.as_str()).or_insert_with(|| {
                crate::tools::stream_page::json_chars(
                    &json!({"dir":super::group_dir(prefix, &row.dir),"files":[]}),
                ) + 1
            });
            super::RowCost {
                // Reserve the deferred detail fields before paging so
                // they cannot overflow the window.
                entry: crate::tools::stream_page::json_chars(&row.entry)
                    + 1
                    + usize::from(deferred_detail && row.kind != "directory")
                        * DETAIL_FIELDS_RESERVE,
                header,
                continues: index > 0 && rows[index - 1].dir == row.dir,
            }
        })
        .collect()
}

/// The response for this page of a walk.
fn files_page(
    q: &StructureSearchQueryFiles,
    walk: &super::Walked<Row>,
    pages: &[std::ops::Range<usize>],
    snapshot: String,
    (root, prefix): (&std::path::Path, &str),
    requested: usize,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<Value, ToolError> {
    let page = q.page().max(1) as usize;
    let total = walk.rows.len();
    let cut = walk.cut(
        page,
        pages.len(),
        requested,
        early_exit(q),
        q.scan_offset(),
        snapshot.clone(),
    );
    let shown = pages.get(page - 1).cloned().unwrap_or(total..total);
    let deferred_detail = q.detail() == "full" && q.sort() != "lines";
    let shown_rows = walk.rows[shown.clone()]
        .iter()
        .map(|row| {
            let entry = if deferred_detail && row.kind != "directory" {
                let lines = line_count(&row.source, paths, cancel)?;
                entry_text(
                    &row.display_name,
                    row.kind,
                    Some(row.size),
                    (lines > 0).then_some(lines),
                    Some(row.modified.round() as i64),
                )
            } else {
                row.entry.clone()
            };
            Ok((row.dir.clone(), entry))
        })
        .collect::<Result<Vec<_>, ToolError>>()?;
    let files = super::dir_groups(&shown_rows, |row| (&row.0, &row.1), prefix);
    let mut facts =
        crate::response::pages::PageFacts::sized(page, cut.total_pages, total, cut.has_more())
            .out_of_range(cut.out_of_range());
    if let Some(size) = q.page_size() {
        facts = facts.with_page_size(size.clamp(1, super::structure_max("pageSize") as usize));
    }
    let mut out = json!({"path":super::display_name(root),"snapshot":snapshot,"files":files,"pagination":facts.to_value()});
    // A walk cut by time proved nothing about what it did not scan.
    if total == 0 && walk.meta.time_cut.is_none() {
        out["status"] = json!("empty")
    }
    let mut warnings = walk.meta.warnings.clone();
    warnings.extend(crate::policy::include::parent_glob_warning(
        &q.include, &q.exclude,
    ));
    cut.finish(&mut out, q, &mut warnings);
    if page == 1 {
        out["summary"] = walk.meta.summary();
        super::lead_to_ignored(&mut out, q, &walk.meta.uncovered);
    }
    if page == 1
        && let Some(read) = outline_read(&walk.rows[shown], root)
    {
        out["next"]["read"] = read;
    }
    walk.meta.warn(&mut out, warnings);
    Ok(out)
}

/// `next.read` on a listing's first page: the outline (localFetch
/// `minify:"symbols"`) of a source or doc file, evidence the listing itself
/// does not hold: the first hand-written one of at most
/// [`READ_LEAD_MAX_BYTES`], else the first one of at most
/// [`READ_LEAD_FALLBACK_MAX_BYTES`] in listing order. Rows name paths
/// relative to the root.
fn outline_read(rows: &[Row], root: &std::path::Path) -> Option<Value> {
    let candidates = || {
        rows.iter()
            .filter(|row| row.kind == "file" && crate::tools::outlines(&row.path))
    };
    let row = candidates()
        .find(|row| row.size <= READ_LEAD_MAX_BYTES && !generated_or_fixture(&row.path))
        .or_else(|| candidates().find(|row| row.size <= READ_LEAD_FALLBACK_MAX_BYTES))?;
    let path = if row.path.is_empty() || root.is_file() {
        root.to_path_buf()
    } else {
        root.join(&row.path)
    };
    Some(
        crate::tools::result::Continuation::new(
            crate::tools::id::ToolId::LocalFetch,
            json!({"path": path.to_string_lossy(), "minify": "symbols"}),
        )
        .build(),
    )
}

/// Largest file a listing's read lead points at by preference: a lead
/// over a multi-megabyte generated file would page for many calls.
pub(super) const READ_LEAD_MAX_BYTES: i64 = 64 * 1024;

/// Largest file a listing's read lead points at at all: past it, the
/// outline itself would page for many calls, so no lead is offered.
const READ_LEAD_FALLBACK_MAX_BYTES: i64 = 1024 * 1024;

/// A generated, minified, declaration, or lock file, or one under a test
/// or fixture directory: a poor first read of an unfamiliar tree.
pub(super) fn generated_or_fixture(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    let generated = name.contains(".generated.")
        || name.contains("_generated")
        || name.contains(".min.")
        || name.ends_with(".d.ts")
        || name.ends_with(".lock");
    let fixture_dir = path.split('/').rev().skip(1).any(|dir| {
        matches!(
            dir,
            "test" | "tests" | "fixtures" | "__fixtures__" | "__snapshots__"
        )
    });
    generated || fixture_dir
}

fn make_row(
    e: &FileSystemEntry,
    root: &std::path::Path,
    security: &ContentSecurity,
    detail: &str,
    count_lines: bool,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<Row, ToolError> {
    let full = detail == "full";
    // Rows name paths relative to the walked root, like `tree`: `""` is the
    // root itself, which a directory root lists as `.`.
    let is_root = e.relative_path.is_empty() || std::path::Path::new(&e.path) == root;
    let kind = match e.entry_type.as_str() {
        "directory" => "directory",
        "symlink" => "symlink",
        _ => "file",
    };
    let relative = if is_root && kind != "directory" {
        root.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned()
    } else {
        e.relative_path.clone()
    };
    let path = security.sanitize_text(&relative, None).content;
    let (dir, name) = if is_root && kind == "directory" {
        ("", ".")
    } else {
        path.rsplit_once('/').unwrap_or(("", path.as_str()))
    };
    let dir = dir.to_owned();
    let modified = e.modified_ms.unwrap_or(0.0);
    let lines = if count_lines && kind != "directory" {
        line_count(std::path::Path::new(&e.path), paths, cancel)?
    } else {
        0
    };
    let entry = entry_text(
        name,
        kind,
        e.size.filter(|_| kind != "directory"),
        // The line sort's own key, counted for every file it ranks, shows
        // whatever the detail.
        (count_lines && kind != "directory").then_some(lines),
        // Whole epoch milliseconds: a float would print as `…737.0`.
        e.modified_ms
            .filter(|_| full)
            .map(|modified| modified.round() as i64),
    );
    Ok(Row {
        dir,
        entry,
        display_name: name.to_owned(),
        kind,
        path,
        name: e.name.clone(),
        size: e.size.unwrap_or(0),
        modified,
        lines,
        source: std::path::PathBuf::from(&e.path),
        seen: {
            let seen = super::memo::Seen::walked(std::path::Path::new(&e.path), e);
            (seen.size, seen.modified)
        },
    })
}
/// Characters the deferred detail fields add to one entry at most:
/// `, totalLines=<usize>` and `, modifiedMs=<i64>`, 33 each.
pub(super) const DETAIL_FIELDS_RESERVE: usize = 66;

/// Page layout tag folded into the snapshot: rows grouped by directory.
const ROW_LAYOUT: &str = "workspaceRelativeDirGroups";

/// One listed entry inside its directory group: the name, `/` after a
/// directory, then ` (<fields>)` naming the size in bytes (every non-directory
/// entry), `symlink`, `totalLines=N` and `modifiedMs=N` as they apply. The
/// fields never contain ` (`, so the last ` (` of an entry ending in `)`
/// opens them, whatever the name holds.
pub(super) fn entry_text(
    name: &str,
    kind: &str,
    size: Option<i64>,
    line_count: Option<usize>,
    modified_ms: Option<i64>,
) -> String {
    let mut text = name.to_owned();
    if kind == "directory" {
        text.push('/');
    }
    let mut fields = Vec::new();
    if let Some(size) = size {
        fields.push(size.to_string());
    }
    if kind == "symlink" {
        fields.push("symlink".to_owned());
    }
    if let Some(lines) = line_count {
        fields.push(format!("totalLines={lines}"));
    }
    if let Some(modified) = modified_ms {
        fields.push(format!("modifiedMs={modified}"));
    }
    if !fields.is_empty() {
        text.push_str(&format!(" ({})", fields.join(", ")));
    }
    text
}

fn sort_rows(r: &mut [Row], sort: &str) {
    r.sort_by(|a, b| match sort {
        "lines" => b.lines.cmp(&a.lines),
        "size" => b.size.cmp(&a.size),
        "name" => a.name.cmp(&b.name),
        // Component-wise, the walk order: `a/x` before `a-b/x`.
        "path" => std::path::Path::new(&a.path).cmp(std::path::Path::new(&b.path)),
        "modified" => b.modified.total_cmp(&a.modified),
        _ => std::path::Path::new(&a.path).cmp(std::path::Path::new(&b.path)),
    })
}
pub(super) fn line_count(
    path: &std::path::Path,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<usize, ToolError> {
    use std::io::Read;
    #[cfg(test)]
    LINE_COUNT_READS.with(|reads| reads.set(reads.get() + 1));
    cancel.check().map_err(ToolError::cancelled)?;
    // Revalidate immediately before reading: discovery authorization is not
    // permission to follow a subsequently changed link or open a special file.
    let Ok(validated) = paths.validate_read(path) else {
        return Ok(0);
    };
    let Ok(mut file) = std::fs::File::open(validated.canonical) else {
        return Ok(0);
    };
    let mut buffer = [0_u8; 16 * 1024];
    // Newlines terminate lines; a non-empty final line without one still counts.
    let mut lines = 0_usize;
    let mut last_byte = None;
    loop {
        cancel.check().map_err(ToolError::cancelled)?;
        match file.read(&mut buffer) {
            Ok(0) => return Ok(lines + usize::from(last_byte.is_some_and(|b| b != b'\n'))),
            Ok(bytes) => {
                lines += buffer[..bytes]
                    .iter()
                    .filter(|byte| **byte == b'\n')
                    .count();
                last_byte = buffer[..bytes].last().copied();
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return Ok(0),
        }
    }
}

#[cfg(test)]
thread_local! {
    static LINE_COUNT_READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[cfg(test)]
pub(super) fn line_count_reads() -> usize {
    LINE_COUNT_READS.with(std::cell::Cell::get)
}
fn validate_time(time: Option<&StructureSearchQueryFilesTime>) -> Result<(), ToolError> {
    let Some(t) = time else {
        return Ok(());
    };
    for (key, value) in [
        ("modifiedWithin", t.modified_within.as_deref()),
        ("modifiedBefore", t.modified_before.as_deref()),
        ("accessedWithin", t.accessed_within.as_deref()),
    ] {
        if let Some(value) = value.filter(|value| !valid_duration(value)) {
            return Err(ToolError::new(
                "invalidInput",
                format!(
                    "time.{key}=\"{value}\" has an unsupported format. Use a relative duration like \"7d\", \"2h\", \"1w\", or \"3m\"."
                ),
            ));
        }
    }
    Ok(())
}
fn valid_duration(v: &str) -> bool {
    v.len() > 1
        && matches!(v.chars().last(), Some('h' | 'd' | 'w' | 'm'))
        && v[..v.len() - 1].chars().all(|c| c.is_ascii_digit())
}
#[cfg(test)]
mod tests {
    use super::*;

    /// A probe walk past its deadline admits nothing and says it was cut.
    #[test]
    fn a_probe_walk_past_its_deadline_admits_nothing() {
        let root = tempfile::tempdir().expect("root");
        std::fs::create_dir_all(root.path().join("build")).expect("build");
        std::fs::write(root.path().join("build/a.ts"), "x\n").expect("ts");
        let paths = crate::tools::test_support::workspace_policy(root.path());
        let q: StructureSearchQueryFiles = serde_json::from_value(json!({
            "operation": "files", "path": root.path(), "extensions": ["ts"], "defaultExcludes": false
        }))
        .expect("files query");
        let bound = super::super::ProbeBound::new(std::time::Duration::ZERO);
        let walk = walk_files(
            &q,
            root.path(),
            &paths,
            &ContentSecurity::new(),
            &crate::tools::cancel::NeverCancel,
            super::super::PROBE_HITS,
            Walking::Probe(&bound),
        )
        .expect("walk");
        assert!(walk.rows.is_empty());
        assert!(bound.cut());
        // Unbounded, the same walk lists the file.
        let walk = walk_files(
            &q,
            root.path(),
            &paths,
            &ContentSecurity::new(),
            &crate::tools::cancel::NeverCancel,
            super::super::PROBE_HITS,
            Walking::Listing(super::super::WALK_BUDGET),
        )
        .expect("walk");
        assert_eq!(walk.rows.len(), 1);
    }

    /// An empty listing whose probe ran out of time before it found
    /// anything proved nothing about what its walk skipped: it still leads
    /// to the listing over the skipped paths and says absence there is
    /// unproven.
    #[test]
    fn an_empty_listing_whose_probe_timed_out_still_leads_to_skipped_paths() {
        let root = tempfile::tempdir().expect("root");
        std::fs::create_dir_all(root.path().join("build")).expect("build");
        std::fs::write(root.path().join("build/a.ts"), "x\n").expect("ts");
        let paths = crate::tools::test_support::workspace_policy(root.path());
        let q: StructureSearchQueryFiles = serde_json::from_value(json!({
            "operation": "files", "path": root.path(), "extensions": ["ts"]
        }))
        .expect("files query");
        let seen = super::super::Uncovered {
            pruned: vec!["build".to_owned()],
            ..Default::default()
        };
        let walk = Walk {
            ignored: false,
            hidden: true,
            default_excludes: true,
        };
        let bound = super::super::ProbeBound::new(std::time::Duration::ZERO);
        let mut out = json!({"status": "empty"});
        super::super::note_empty(
            &mut out,
            &q,
            (root.path(), &paths),
            &seen,
            walk,
            |relaxed| {
                let mut relaxed_query = q.clone();
                relaxed_query.include_ignored = Some(relaxed.ignored);
                relaxed_query.default_excludes = Some(DefaultExcludes(relaxed.default_excludes));
                let found = walk_files(
                    &relaxed_query,
                    root.path(),
                    &paths,
                    &ContentSecurity::new(),
                    &crate::tools::cancel::NeverCancel,
                    super::super::PROBE_HITS,
                    Walking::Probe(&bound),
                )?;
                Ok(super::super::found_entries(
                    found.rows.into_iter().map(|row| row.source),
                    found.meta.was_capped || bound.cut(),
                ))
            },
        )
        .expect("note");
        assert!(bound.cut(), "the zero budget cut the probe");
        assert_eq!(
            out["hints"],
            json!([
                "Skipped paths (build/) were not checked in time; absence there is unproven: the lead lists them."
            ]),
            "{out}"
        );
        let retry = &out["next"]["includeSkipped"]["query"]["queries"][0];
        assert_eq!(retry["defaultExcludes"], false, "{out}");
        assert_eq!(retry["page"], 1, "{out}");
        assert!(retry.get("includeIgnored").is_none(), "{out}");
        assert!(retry.get("snapshot").is_none(), "{out}");
    }

    #[test]
    fn line_count_can_be_cancelled_between_bounded_reads() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        struct Cancel(AtomicUsize);
        impl CancellationCheck for Cancel {
            fn check(&self) -> Result<(), String> {
                if self.0.fetch_add(1, Ordering::SeqCst) >= 3 {
                    Err("stop line count".into())
                } else {
                    Ok(())
                }
            }
        }
        let root_dir = crate::tools::test_support::Fixture::new();
        let root = root_dir.0.clone();
        std::fs::create_dir_all(&root).expect("fixture");
        let file = root.join("large.rs");
        std::fs::write(&file, "line\n".repeat(20_000)).expect("large source");
        let paths = crate::tools::test_support::workspace_policy(&root);
        let error = line_count(&file, &paths, &Cancel(AtomicUsize::new(0)))
            .expect_err("cancel while reading");
        assert_eq!(error.code, "cancelled");
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

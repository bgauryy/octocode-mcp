use super::{Listing, Walking};
use crate::policy::prune::DefaultsFlag;
use crate::tools::empty_walk::Walk;
use crate::tools::num::{u32_of, usize_of};
use crate::tools::result::ToolError;
use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};
use octocode_engine::types::{FileSystemEntry, FileSystemQueryOptions};
use serde_json::{Value, json};

use crate::contracts::tool_types::{StructureSearchQueryFiles, StructureSearchQueryFilesTime};

super::impl_listing!(StructureSearchQueryFiles);

/// Engine-unit views over the generated `files` query.
impl StructureSearchQueryFiles {
    /// Levels below `path` (1 = its children), as `tree` and the engine
    /// count them.
    fn depth(value: Option<std::num::NonZeroU64>) -> Option<u32> {
        value.map(|depth| u32_of(depth.get()))
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
        self.max_entries.map(|limit| u32_of(limit.get()))
    }
    pub(crate) fn page(&self) -> u32 {
        u32_of(self.page.get())
    }
    pub(crate) fn snapshot(&self) -> Option<&str> {
        self.snapshot.as_deref().map(String::as_str)
    }
    /// A name, type or metadata filter narrows the listing, so what it
    /// skipped may hold the entries asked for.
    fn filtered(&self) -> bool {
        !self.include.is_empty()
            || !self.extensions.is_empty()
            || self.name_regex.is_some()
            || self.entry_type.is_some()
            || self.empty.is_some()
            || self.size.is_some()
            || self.time.is_some()
            || self.permissions.is_some()
            || self.access.is_some()
    }
    /// Walk entries (walk order) an earlier, time-cut walk inspected.
    pub(crate) fn walk_offset(&self) -> u32 {
        self.walk_offset.map_or(0, |offset| u32_of(offset.get()))
    }
    /// Listing rows (in walk or sort order) earlier windows listed.
    pub(crate) fn scan_offset(&self) -> usize {
        self.scan_offset.map_or(0, |offset| usize_of(offset.get()))
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
    /// Its line count, under `sort:lines` only.
    lines: Option<Lines>,
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
        walk_identity(q, root),
        // Effective (not raw) values: the nextPage continuation injects these
        // defaults, so the digest must match what the follow-up request carries.
        q.sort(),
        q.detail(),
        requested,
        q.scan_offset(),
        q.walk_offset(),
        q.page_size(),
    ])
}

/// What decides the walk a listing runs and what it enters, whatever the
/// window it cuts (the offsets, the rows and their layout): the walk a
/// cursor continues.
fn walk_identity(q: &StructureSearchQueryFiles, root: &std::path::Path) -> Value {
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
        q.include_ignored,
        q.include_hidden,
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
    let page_size = q.page_size();
    let prefix = super::listing_prefix(paths, &validated.canonical);
    let deferred_detail = q.detail() == "full" && q.sort() != "lines";
    let pages = super::page_ranges(
        &files_costs(&walk.rows, &prefix, deferred_detail),
        page_size,
        budget,
    );
    if !stored && pages.len() > 1 {
        super::memo::put(snapshot.clone(), policy, paths, &validated.canonical, &walk);
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
    super::probe_listing(
        &mut out,
        q,
        (&validated.canonical, paths),
        &walk.meta.uncovered,
        |relaxed, walking| {
            walk_files(
                relaxed,
                &validated.canonical,
                paths,
                security,
                cancel,
                super::PROBE_HITS,
                walking,
            )
        },
    )?;
    super::broaden_empty(&mut out, q, &validated.canonical, |relaxed, walking| {
        walk_files(
            relaxed,
            &validated.canonical,
            paths,
            security,
            cancel,
            super::PROBE_HITS,
            walking,
        )
    })?;
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
        ignore: octocode_engine::search::walk::IgnorePolicy::new(
            q.include_ignored,
            q.include_hidden,
        ),
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
        // The walk's callback applies the default prune (`WalkLeft`).
        exclude_dir: None,
        exclude: q.exclude(),
        stop_at_limit: Some(true),
        skip_entries: Some(q.walk_offset()),
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
    let left = super::WalkLeft::new(root, q.default_excludes.defaults());
    let policy = super::WalkPolicy {
        bound,
        discovery: paths.discovery_walk(),
        probe: super::FilterProbe::new(
            root,
            &q.include().unwrap_or_default(),
            &q.extensions,
            q.name_regex.as_deref(),
        )?,
        show_hidden: q.include_hidden == Some(true),
        filtered: q.filtered(),
    };
    let detail = q.detail();
    let sort = q.sort();
    let walk_limit = if early_exit(q) || bound.is_some() {
        requested as u32
    } else {
        super::max_walk()
    };
    let resumes = super::Resumes {
        identity: walk_identity(q, root),
        paths,
        root,
    };
    let (resume, window_rows) = resumes.options(walking, q.walk_offset(), requested);
    let mut native = octocode_engine::search::fs_query::query_file_system(
        FileSystemQueryOptions {
            time_budget: walking.budget(),
            resume,
            window_rows,
            ..query_options(q, root, walk_limit)
        },
        &|path, file_type, visit| left.admit(&policy, path, file_type, visit),
        &|| cancel.check().is_err(),
    )
    .map_err(|error| super::walk_error(error, q.path.as_str(), cancel))?;
    cancel.check().map_err(ToolError::cancelled)?;
    // The line sort's key, counted for every file it ranks (a probe only
    // counts entries and ranks none) within the walk's time budget, measured
    // from the count's start so a walk that spent its own budget still ranks
    // what it walked. Counting is part of the walk: a budget spent before
    // every file is counted cuts the walk at the first uncounted one
    // ([`cut_walk_before`]), and `next.continueWalk` resumes there.
    let lines = if sort == "lines" && bound.is_none() {
        let (lines, cut) = count_lines(
            &native
                .entries
                .iter()
                .map(|e| (e.entry_type != "directory").then(|| std::path::Path::new(&e.path)))
                .collect::<Vec<_>>(),
            paths,
            cancel,
            walking
                .budget()
                .map(|budget| std::time::Instant::now() + budget),
        )?;
        if let Some(at) = cut {
            cut_walk_before(&mut native, at);
        }
        lines
    } else {
        vec![None; native.entries.len()]
    };
    let mut lines = lines;
    let window = super::end_window(&mut native, requested, q.scan_offset(), sort == "path");
    resumes.keep(&mut native, walking);
    // `end_window` keeps a walk-order prefix: the counts of its entries.
    lines.truncate(native.entries.len());
    // A directory root is the listing itself, never one of its rows.
    let mut rows = native
        .entries
        .iter()
        .zip(lines)
        .filter(|(e, _)| {
            !(e.entry_type == "directory"
                && (e.relative_path.is_empty() || std::path::Path::new(&e.path) == root))
        })
        .map(|(e, lines)| {
            // The modified sort's own key shows whatever the detail.
            let modified_shown = detail == "full" || sort == "modified";
            make_row(e, root, security, modified_shown, lines)
        })
        .collect::<Vec<_>>();
    sort_rows(&mut rows, &sort);
    let mut walk = super::Walked::finish(native, rows, requested, q.scan_offset(), left, security);
    walk.meta.time_window = window;
    walk.meta.ranked = sort != "path";
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
                octocode_engine::json_size::utf16_units(
                    &json!({"dir":super::group_dir(prefix, &row.dir),"files":[]}),
                )
                .unwrap_or(0)
                    + 1
            });
            super::RowCost {
                // Reserve the deferred detail fields before paging so
                // they cannot overflow the window.
                entry: octocode_engine::json_size::utf16_units(&row.entry).unwrap_or(0)
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
        (q.scan_offset(), q.walk_offset()),
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
                    lines.shown_in_details(),
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
        facts = facts.with_page_size(size);
    }
    let mut out = json!({"path":super::display_name(root),"snapshot":snapshot,"files":files,"pagination":facts.to_value()});
    // A walk cut by time proved nothing about what it did not scan, and a
    // resumed window past every entry of its filters is no empty listing.
    if total == 0 && walk.meta.time_cut.is_none() && q.walk_offset() == 0 {
        out["status"] = json!("empty")
    }
    let mut warnings = Vec::new();
    cut.finish(&mut out, q, &mut warnings);
    if page == 1 {
        out["summary"] = walk.meta.summary();
        super::lead_to_skipped(&mut out, q, &walk.meta.uncovered, q.walk(), q.filtered());
    }
    if page == 1
        && let Some(read) = outline_read(&walk.rows[shown], root)
    {
        out["next"]["read"] = read;
    }
    let query_notes = crate::policy::include::parent_glob_warning(&q.include, &q.exclude)
        .into_iter()
        .collect();
    walk.meta.warn(&mut out, query_notes, warnings, page);
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
    modified_shown: bool,
    lines: Option<Lines>,
) -> Row {
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
    // A directory's own length is its entry table, not content: it is
    // neither shown nor ranked (`sort:size` puts directories last).
    let size = e.size.filter(|_| kind != "directory");
    let entry = entry_text(
        name,
        kind,
        size,
        // The line sort's own key, counted for every file it ranks, shows
        // whatever the detail.
        lines,
        // Whole epoch milliseconds: a float would print as `…737.0`.
        e.modified_ms
            .filter(|_| modified_shown)
            .map(|modified| modified.round() as i64),
    );
    Row {
        dir,
        entry,
        display_name: name.to_owned(),
        kind,
        path,
        name: e.name.clone(),
        size: size.unwrap_or(0),
        modified,
        lines,
        source: std::path::PathBuf::from(&e.path),
        seen: {
            let seen = super::memo::Seen::walked(std::path::Path::new(&e.path), e);
            (seen.size, seen.modified)
        },
    }
}
/// Characters the deferred detail fields add to one entry at most:
/// `, totalLines=<usize>` and `, modifiedMs=<i64>`, 33 each.
pub(super) const DETAIL_FIELDS_RESERVE: usize = 66;

/// Page layout tag folded into the snapshot: rows grouped by directory.
const ROW_LAYOUT: &str = "workspaceRelativeDirGroups";

/// One listed entry inside its directory group: the name, `/` after a
/// directory, then ` (<fields>)` naming the size in bytes (every non-directory
/// entry), `symlink`, the line count ([`Lines::field`]) and `modifiedMs=N` as
/// they apply. The
/// fields never contain ` (`, so the last ` (` of an entry ending in `)`
/// opens them, whatever the name holds.
pub(super) fn entry_text(
    name: &str,
    kind: &str,
    size: Option<i64>,
    line_count: Option<Lines>,
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
        fields.push(lines.field());
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
        "lines" => Lines::rank(a.lines).cmp(&Lines::rank(b.lines)),
        "size" => b.size.cmp(&a.size),
        "name" => a.name.cmp(&b.name),
        // Component-wise, the walk order: `a/x` before `a-b/x`.
        "path" => std::path::Path::new(&a.path).cmp(std::path::Path::new(&b.path)),
        "modified" => b.modified.total_cmp(&a.modified),
        _ => std::path::Path::new(&a.path).cmp(std::path::Path::new(&b.path)),
    })
}
/// A file's line count as a listing shows it: counted, or why not.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Lines {
    Counted(usize),
    /// Binary content (the one binary definition: the leading-byte sniff, or
    /// a NUL anywhere) has no lines to count.
    Binary,
    /// The file could not be read (gone, denied, a read error): its count
    /// is unknown, not zero.
    Unreadable,
}

impl Lines {
    /// The entry field: `totalLines=N`, or the reason there is none.
    fn field(self) -> String {
        match self {
            Self::Counted(lines) => format!("totalLines={lines}"),
            Self::Binary => "binary".to_owned(),
            Self::Unreadable => "unreadable".to_owned(),
        }
    }

    /// The field a details listing shows: none for a file without lines.
    pub(super) fn shown_in_details(self) -> Option<Self> {
        (self != Self::Counted(0)).then_some(self)
    }

    /// The line sort's key: counted files by count, most first, then the
    /// files without a count, then directories.
    fn rank(lines: Option<Self>) -> (u8, std::cmp::Reverse<usize>) {
        match lines {
            Some(Self::Counted(lines)) => (0, std::cmp::Reverse(lines)),
            Some(Self::Binary) => (1, std::cmp::Reverse(0)),
            Some(Self::Unreadable) => (2, std::cmp::Reverse(0)),
            None => (3, std::cmp::Reverse(0)),
        }
    }
}

/// Line-count workers opening files at once. Each validates, opens and
/// reads files, and kernel time grows with concurrent openers while wall
/// time levels off: over 2,280 files (warm cache, 12 cores, macOS) 4 workers
/// took 38-42 ms wall and 0.13 s sys, 12 workers 54-57 ms and 0.55-0.62 s.
const FILE_OPEN_WORKERS: usize = 4;

/// Workers for counting `entries` files ([`crate::tools::workers::workers`]),
/// at most [`FILE_OPEN_WORKERS`].
fn line_count_workers(entries: usize) -> usize {
    crate::tools::workers::workers(None, entries, Some(FILE_OPEN_WORKERS))
}

/// The line counts of `files` (`None`: a directory, never counted), on
/// [`line_count_workers`]: each worker takes the next file until none is
/// left or `deadline` passes (the first file is always counted, so a cut
/// walk still advances). With the deadline passed first, also the index of
/// the first file left uncounted: the counts are a prefix of `files` up to
/// it.
fn count_lines(
    files: &[Option<&std::path::Path>],
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
    deadline: Option<std::time::Instant>,
) -> Result<(Vec<Option<Lines>>, Option<usize>), ToolError> {
    let workers = line_count_workers(files.len());
    let next = std::sync::atomic::AtomicUsize::new(0);
    let first_file = files.iter().position(Option::is_some);
    let counted = std::thread::scope(|scope| {
        let tasks = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let mut counted = Vec::new();
                    loop {
                        let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        let Some(file) = files.get(index) else {
                            return Ok(counted);
                        };
                        let Some(path) = file else { continue };
                        let late = Some(index) != first_file
                            && deadline.is_some_and(|at| std::time::Instant::now() >= at);
                        let lines = if late {
                            None
                        } else {
                            Some(line_count(path, paths, cancel)?)
                        };
                        counted.push((index, lines));
                    }
                })
            })
            .collect::<Vec<_>>();
        tasks
            .into_iter()
            .map(|task| {
                task.join().unwrap_or_else(|_| {
                    Err(ToolError::new(
                        "executionFailed",
                        "A line-count worker failed.",
                    ))
                })
            })
            .collect::<Result<Vec<_>, ToolError>>()
    })?;
    let mut lines = vec![None; files.len()];
    let mut cut = None::<usize>;
    for (index, count) in counted.into_iter().flatten() {
        match count {
            Some(count) => lines[index] = Some(count),
            None => cut = Some(cut.map_or(index, |at| at.min(index))),
        }
    }
    if let Some(at) = cut {
        lines.truncate(at);
    }
    Ok((lines, cut))
}

/// End the walk before `native.entries[at]`, as its time budget does: the
/// entry and every one after it in walk order are uninspected, and
/// `next.continueWalk` resumes there.
fn cut_walk_before(native: &mut octocode_engine::types::FileSystemQueryResult, at: usize) {
    let Some(first) = native.entries.get(at) else {
        return;
    };
    let (relative, before) = (
        first.relative_path.clone(),
        first.walk_position.saturating_sub(1),
    );
    // The window ends before the walk's own end, so not at its ceiling, and
    // counts only what it covers.
    native.end_at(before);
    native.time_cut = Some(relative);
}

pub(super) fn line_count(
    path: &std::path::Path,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<Lines, ToolError> {
    use std::io::Read;
    #[cfg(test)]
    LINE_COUNT_READS.with(|reads| reads.set(reads.get() + 1));
    cancel.check().map_err(ToolError::cancelled)?;
    // Revalidate immediately before reading: discovery authorization is not
    // permission to follow a subsequently changed link or open a special file.
    let Ok(validated) = paths.validate_read(path) else {
        return Ok(Lines::Unreadable);
    };
    let Ok(mut file) = std::fs::File::open(validated.canonical) else {
        return Ok(Lines::Unreadable);
    };
    let mut buffer = [0_u8; 16 * 1024];
    // Newlines terminate lines; a non-empty final line without one still counts.
    let mut lines = 0_usize;
    let mut last_byte = None;
    loop {
        cancel.check().map_err(ToolError::cancelled)?;
        match file.read(&mut buffer) {
            Ok(0) => {
                return Ok(Lines::Counted(
                    lines + usize::from(last_byte.is_some_and(|b| b != b'\n')),
                ));
            }
            Ok(bytes) => {
                let read = &buffer[..bytes];
                if (last_byte.is_none()
                    && octocode_engine::text::sniff(read)
                        == octocode_engine::text::BinaryVerdict::Binary)
                    || read.contains(&0)
                {
                    return Ok(Lines::Binary);
                }
                lines += read.iter().filter(|byte| **byte == b'\n').count();
                last_byte = read.last().copied();
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return Ok(Lines::Unreadable),
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
                let found = walk_files(
                    &q.relaxed(relaxed),
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

    /// Line counting has the walk's time budget: past the deadline no file
    /// but the first is counted, and the counts are the prefix before the
    /// first uncounted file (the walk is cut there); a directory is never
    /// counted.
    #[test]
    fn line_counts_stop_at_the_deadline_as_a_prefix() {
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("a.rs");
        std::fs::write(&file, "x\ny\n").expect("file");
        let paths = crate::tools::test_support::workspace_policy(root.path());
        let files = [None, Some(file.as_path()), None, Some(file.as_path())];
        let never = &crate::tools::cancel::NeverCancel;
        let (counted, cut) = count_lines(&files, &paths, never, None).expect("count");
        assert_eq!(
            counted,
            [None, Some(Lines::Counted(2)), None, Some(Lines::Counted(2))]
        );
        assert_eq!(cut, None);
        // The first file is counted whatever the deadline: a cut walk
        // still advances.
        let (late, cut) =
            count_lines(&files, &paths, never, Some(std::time::Instant::now())).expect("count");
        assert_eq!(late, [None, Some(Lines::Counted(2)), None]);
        assert_eq!(cut, Some(3));
    }

    /// Line counting opens files on a bounded pool: at most
    /// [`FILE_OPEN_WORKERS`] at once whatever the core count, never more
    /// than there are entries, and always one.
    #[test]
    fn line_count_workers_are_bounded() {
        assert_eq!(line_count_workers(0), 1);
        assert_eq!(line_count_workers(1), 1);
        let many = line_count_workers(10_000);
        assert!((1..=FILE_OPEN_WORKERS).contains(&many), "{many}");
    }

    /// A count cut ends the walk before the first uncounted entry, as the
    /// walk's own time budget does: the window keeps the entries before it,
    /// names it as the time cut, and resumes the walk right there.
    #[test]
    fn a_count_cut_ends_the_walk_before_the_first_uncounted_entry() {
        let entry = |name: &str, position: u32| FileSystemEntry {
            path: name.to_owned(),
            relative_path: name.to_owned(),
            name: name.to_owned(),
            entry_type: "file".to_owned(),
            size: Some(1),
            modified_ms: None,
            modified_time: None,
            accessed_ms: None,
            permissions: None,
            extension: None,
            depth: 0,
            walk_position: position,
        };
        let mut native = octocode_engine::types::FileSystemQueryResult {
            entries: vec![entry("a.rs", 3), entry("b.rs", 5), entry("c.rs", 9)],
            total_discovered: 3,
            was_capped: true,
            skipped: 0,
            permission_denied: 0,
            ignored: 0,
            warnings: Vec::new(),
            pruned_dirs: Vec::new(),
            time_cut: None,
            walk_position: 9,
            ..Default::default()
        };
        cut_walk_before(&mut native, 1);
        assert_eq!(native.entries.len(), 1);
        assert_eq!(native.time_cut.as_deref(), Some("b.rs"));
        assert_eq!(native.walk_position, 4, "the resume inspects b.rs first");
        assert!(!native.was_capped);
        assert_eq!(native.total_discovered, 1);
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

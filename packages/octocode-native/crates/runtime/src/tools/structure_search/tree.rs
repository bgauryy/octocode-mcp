use crate::contracts::tool_types::DefaultExcludes;
use crate::policy::prune::DefaultsFlag;
use crate::tools::empty_walk::Walk;
use crate::tools::id::ToolId;
use crate::tools::num::{u32_of, u32_of_usize, usize_of};
use crate::tools::paging::clamp_page_size;
use crate::tools::result::ToolError;
use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};
use octocode_engine::search::walk::IgnorePolicy;
use octocode_engine::types::FileSystemQueryOptions;
use serde_json::{Value, json};

use super::Walking;
use crate::contracts::tool_types::StructureSearchQueryTree;

/// Engine-unit views over the generated `tree` query.
impl StructureSearchQueryTree {
    /// Levels below `path` (1 = its children), as the engine counts them.
    /// Omitted, a listing shows `path`'s children; a filter (`include`,
    /// `extensions`, `entryType`) searches every level, like ghStructure.
    fn walk_depth(&self) -> u32 {
        self.max_depth.map_or_else(
            || {
                if self.filtered() {
                    u32_of_usize(
                        crate::tools::id::query_limits::structure_search::MAX_DEPTH_MAXIMUM,
                    )
                } else {
                    1
                }
            },
            |depth| u32_of(depth.get()),
        )
    }
    fn max_entries(&self) -> usize {
        self.max_entries
            .map_or(super::max_walk() as usize, |limit| usize_of(limit.get()))
            .min(super::max_walk() as usize)
    }
    fn page(&self) -> usize {
        usize_of(self.page.get())
    }
    /// Outline rows (walk order) earlier windows listed.
    fn scan_offset(&self) -> usize {
        self.scan_offset.map_or(0, |offset| usize_of(offset.get()))
    }
    /// Walk entries (walk order) an earlier, time-cut walk inspected.
    fn walk_offset(&self) -> u32 {
        self.walk_offset.map_or(0, |offset| u32_of(offset.get()))
    }
    /// The caller's page size; `None` pages by the response budget.
    fn page_size(&self) -> Option<usize> {
        self.page_size
            .map(|size| clamp_page_size(ToolId::StructureSearch, None, usize_of(size.get())))
    }
    /// A name or type filter narrows the listing, so what it skipped may
    /// hold the entries asked for.
    fn filtered(&self) -> bool {
        !self.include.is_empty() || !self.extensions.is_empty() || self.entry_type.is_some()
    }
}

/// One outline row: its directory relative to `path` (`""` is `path`) and
/// its entry there, in the listing-entry shape `files` uses
/// (`super::files::entry_text`).
struct TreeRow {
    dir: String,
    entry: String,
    /// The entry's name and kind, to render it with details on its page.
    name: String,
    kind: &'static str,
    /// The walked entry, for the continuation pages' change check.
    source: std::path::PathBuf,
    /// Its size and time as the walk read them (the stored walk's stamp).
    seen: (u64, Option<std::time::SystemTime>),
}

impl super::Sourced for TreeRow {
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

/// Page layout tag folded into the snapshot: rows grouped by directory.
const TREE_LAYOUT: &str = "workspaceRelativeTreeGroups";

/// Bounded directory outline. The engine walk visits children name-sorted,
/// depth-first; `limit` cuts that walk, then rows regroup by directory.
pub fn execute_tree(
    q: &StructureSearchQueryTree,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
    budget: std::time::Duration,
) -> super::StructureResult {
    let validated = super::validated_root(q.path.as_str(), paths, cancel)?;
    if validated.canonical.is_file() {
        return Err(super::file_root(&validated.canonical, paths));
    }
    let requested = q.max_entries();
    // The canonical root, not the spelling: a continuation may name the same
    // directory relative to the workspace.
    let identity = json!([
        validated.canonical.to_string_lossy(),
        q.walk_depth(),
        q.include_hidden,
        q.include_ignored,
        q.include,
        q.extensions,
        q.entry_type.map(|kind| kind.to_string()),
        q.exclude,
        q.default_excludes,
        requested,
        q.scan_offset(),
        q.walk_offset(),
        q.page_size(),
        q.extras
            .contains(&crate::contracts::tool_types::ExtraKind::Details),
    ]);
    let policy = paths.identity();
    let snapshot_in = q.snapshot.as_deref().map(String::as_str);
    let (walk, stored) = super::walked(q.page(), snapshot_in, &policy, || {
        walk_tree(
            q,
            &validated.canonical,
            paths,
            security,
            cancel,
            requested,
            Walking::Listing(budget),
        )
    })?;
    // The page cut is part of the snapshot: a continuation under a
    // different response window restarts instead of skipping entries.
    let budget = crate::tools::page_windows::page_budget(response_window, &identity);
    let snapshot = crate::digest::json_sha256(&json!([
        identity,
        budget,
        TREE_LAYOUT,
        walk.rows
            .iter()
            .map(|row| (&row.dir, &row.entry))
            .collect::<Vec<_>>()
    ]));
    if let Some(restart) = super::restart_if_stale(q, q.page(), snapshot_in, &snapshot) {
        return Ok(restart);
    }
    let prefix = super::listing_prefix(paths, &validated.canonical);
    let detail = q
        .extras
        .contains(&crate::contracts::tool_types::ExtraKind::Details);
    let pages = super::page_ranges(
        &tree_costs(&walk.rows, &prefix, detail),
        q.page_size(),
        budget,
    );
    if !stored && pages.len() > 1 {
        super::memo::put(snapshot.clone(), policy, paths, &validated.canonical, &walk);
    }
    let mut out = tree_page(
        q,
        &walk,
        &pages,
        snapshot,
        (&validated.canonical, &prefix),
        requested,
        (detail.then_some(paths), cancel),
    )?;
    let shown = Walk {
        ignored: q.include_ignored == Some(true),
        hidden: q.include_hidden == Some(true),
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
            relaxed_query.include_hidden = Some(relaxed.hidden);
            relaxed_query.default_excludes = Some(DefaultExcludes(relaxed.default_excludes));
            relaxed_query.scan_offset = None;
            relaxed_query.walk_offset = None;
            walk_tree(
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
    // Without its name filters an unbounded tree would list one level: the
    // broadened listing keeps the depth this one walked.
    let mut walked_depth = q.clone();
    walked_depth.max_depth = std::num::NonZeroU64::new(u64::from(q.walk_depth()));
    super::broaden_empty(
        &mut out,
        &walked_depth,
        &validated.canonical,
        |relaxed, walking| {
            walk_tree(
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
    Ok(out)
}

/// Walk the tree once: rows in listing order, cut to `requested`, with
/// directories that have their own group not also listed bare. A probe walk
/// (`bound`) stops at its first `requested` entries and admits nothing past
/// its deadline.
fn walk_tree(
    q: &StructureSearchQueryTree,
    root: &std::path::Path,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    requested: usize,
    walking: Walking<'_>,
) -> Result<super::Walked<TreeRow>, ToolError> {
    let bound = walking.probe();
    // Leave out what localSearch leaves out: ignored entries (unless
    // includeIgnored, counted by the walk) and paths the path policy denies
    // (sensitive names, and symlinks out of the allowed roots). Denied
    // entries the listing would otherwise show are counted and reported,
    // never silently dropped.
    let show_hidden = q.include_hidden.unwrap_or(false);
    let include = crate::policy::include::include_globs(&q.include);
    let left = super::WalkLeft::new(root, q.default_excludes.defaults());
    let policy = super::WalkPolicy {
        bound,
        discovery: paths.discovery_walk(),
        probe: super::FilterProbe::new(root, &include, &q.extensions, None)?,
        show_hidden,
        filtered: q.filtered(),
    };
    let mut native = octocode_engine::portable::query_file_system(
        FileSystemQueryOptions {
            path: root.to_string_lossy().into_owned(),
            include_root: Some(false),
            recursive: Some(true),
            max_depth: Some(q.walk_depth()),
            ignore: IgnorePolicy::new(q.include_ignored, Some(show_hidden)),
            names: (!include.is_empty()).then(|| include.clone()),
            extensions: (!q.extensions.is_empty()).then(|| q.extensions.clone()),
            entry_type: q.entry_type.map(|kind| kind.to_string()),
            // The callback applies the default prune (`WalkLeft`).
            exclude_dir: None,
            exclude: (!q.exclude.is_empty()).then(|| q.exclude.clone()),
            stop_at_limit: Some(true),
            time_budget: walking.budget(),
            skip_entries: Some(q.walk_offset()),
            limit: Some(bound.map_or(super::max_walk(), |_| u32_of_usize(requested))),
            ..Default::default()
        },
        &|path, file_type, visit| left.admit(&policy, path, file_type, visit),
        &|| cancel.check().is_err(),
    )
    .map_err(|error| super::walk_error(error, q.path.as_str(), cancel))?;
    cancel.check().map_err(ToolError::cancelled)?;
    let window = super::end_window(&mut native, requested, q.scan_offset(), true);
    let rows = tree_rows(&native.entries, security);
    let mut walk = super::Walked::finish(native, rows, requested, q.scan_offset(), left, security);
    walk.meta.time_window = window;
    // One group per directory: `path`'s own entries first, then each
    // directory in walk order (component-wise path order), entries in walk
    // order within it. The sort is stable.
    walk.rows
        .sort_by(|a, b| std::path::Path::new(&a.dir).cmp(std::path::Path::new(&b.dir)));
    drop_grouped_dirs(&mut walk.rows);
    Ok(walk)
}

/// Outline rows in walk order.
fn tree_rows(
    entries: &[octocode_engine::types::FileSystemEntry],
    security: &ContentSecurity,
) -> Vec<TreeRow> {
    entries
        .iter()
        .map(|entry| {
            let relative = security.sanitize_text(&entry.relative_path, None).content;
            let (dir, name) = relative.rsplit_once('/').unwrap_or(("", &relative));
            // A symlink counts as a non-directory entry, as `files` counts
            // it; its size is the link's own.
            let kind = match entry.entry_type.as_str() {
                "directory" => "directory",
                "symlink" => "symlink",
                _ => "file",
            };
            // Every non-directory entry names its size, a symlink its own.
            let size = (kind != "directory").then(|| entry.size.unwrap_or(0));
            let text = super::files::entry_text(name, kind, size, None, None);
            TreeRow {
                dir: dir.to_owned(),
                entry: text,
                name: name.to_owned(),
                kind,
                source: std::path::PathBuf::from(&entry.path),
                seen: {
                    let seen = super::memo::Seen::walked(std::path::Path::new(&entry.path), entry);
                    (seen.size, seen.modified)
                },
            }
        })
        .collect()
}

/// A directory with its own `{dir, entries}` group is named by that group;
/// listing it bare (`"name/"`) under its parent too would show it twice,
/// even when the two land on different pages.
fn drop_grouped_dirs(rows: &mut Vec<TreeRow>) {
    super::drop_grouped_dirs(
        rows,
        |row| row.dir.as_str(),
        |row| {
            let name = row.entry.strip_suffix('/')?;
            Some(if row.dir.is_empty() {
                name.to_owned()
            } else {
                format!("{}/{name}", row.dir)
            })
        },
    );
}

/// A row costs its quoted entry, plus its group's `{dir, files}` header
/// (the workspace-relative directory) whenever it opens one.
fn tree_costs(rows: &[TreeRow], prefix: &str, detail: bool) -> Vec<super::RowCost> {
    rows.iter()
        .enumerate()
        .map(|(index, row)| super::RowCost {
            entry: crate::tools::stream_page::json_chars(&row.entry)
                + 1
                + usize::from(detail && row.kind != "directory")
                    * super::files::DETAIL_FIELDS_RESERVE,
            header: crate::tools::stream_page::json_chars(
                &json!({"dir":super::group_dir(prefix, &row.dir),"files":[]}),
            ) + 1,
            continues: index > 0 && rows[index - 1].dir == row.dir,
        })
        .collect()
}

/// The response for this page of a walk.
fn tree_page(
    q: &StructureSearchQueryTree,
    walk: &super::Walked<TreeRow>,
    pages: &[std::ops::Range<usize>],
    snapshot: String,
    (root, prefix): (&std::path::Path, &str),
    requested: usize,
    (detail, cancel): (Option<&PathPolicy>, &dyn CancellationCheck),
) -> Result<Value, ToolError> {
    let page = q.page().max(1);
    let total = walk.rows.len();
    let cut = walk.cut(
        page,
        pages.len(),
        requested,
        false,
        (q.scan_offset(), q.walk_offset()),
        snapshot.clone(),
    );
    // Details are read for this page's files only, like `files` does.
    let shown_rows = pages
        .get(page - 1)
        .map_or(&walk.rows[..0], |shown| &walk.rows[shown.clone()])
        .iter()
        .map(|row| {
            let entry = match detail {
                Some(paths) if row.kind != "directory" => {
                    let lines = super::files::line_count(&row.source, paths, cancel)?;
                    let modified = row
                        .seen
                        .1
                        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                        .and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok());
                    super::files::entry_text(
                        &row.name,
                        row.kind,
                        Some(i64::try_from(row.seen.0).unwrap_or(i64::MAX)),
                        lines.shown_in_details(),
                        modified,
                    )
                }
                _ => row.entry.clone(),
            };
            Ok((row.dir.clone(), entry))
        })
        .collect::<Result<Vec<_>, ToolError>>()?;
    let files = super::dir_groups(&shown_rows, |row| (&row.0, &row.1), prefix);
    let mut out = json!({
        "path": super::display_name(root),
        "files": files,
        "snapshot": snapshot,
    });
    // A walk cut by time proved nothing about what it did not scan, and a
    // resumed window past every entry of its filters is no empty listing.
    if total == 0 && walk.meta.time_cut.is_none() && q.walk_offset() == 0 {
        out["status"] = json!("empty");
    }
    // The walk's summary and its retries describe the whole listing: page 1
    // states them once.
    if page == 1 {
        out["summary"] = walk.meta.summary();
        super::lead_to_skipped(
            &mut out,
            q,
            &walk.meta.uncovered,
            Walk {
                ignored: q.include_ignored == Some(true),
                hidden: q.include_hidden == Some(true),
                default_excludes: q.default_excludes.defaults(),
            },
            q.filtered(),
        );
        if !q.filtered()
            && let Some(read) = tree_read(&walk.rows, root)
        {
            out["next"]["read"] = read;
        }
    }
    if cut.total_pages > 1 || page > cut.total_pages {
        let mut facts =
            crate::response::pages::PageFacts::sized(page, cut.total_pages, total, cut.has_more())
                .out_of_range(cut.out_of_range());
        if let Some(size) = q.page_size() {
            facts = facts.with_page_size(size);
        }
        out["pagination"] = facts.to_value();
    }
    let mut warnings = Vec::new();
    cut.finish(&mut out, q, &mut warnings);
    let query_notes = crate::policy::include::parent_glob_warning(&q.include, &q.exclude)
        .into_iter()
        .collect();
    walk.meta.warn(&mut out, query_notes, warnings, page);
    Ok(out)
}

/// `next.read` on a tree's first page: the best-ranked listed file that is
/// small and not generated ([`read_rank`](crate::tools::root_read::read_rank),
/// the ranking ghStructure shares), outlined (`minify:"symbols"`) when it has
/// an outline.
fn tree_read(rows: &[TreeRow], root: &std::path::Path) -> Option<Value> {
    let (relative, _) = rows
        .iter()
        .filter(|row| {
            row.kind == "file"
                && i64::try_from(row.seen.0)
                    .is_ok_and(|size| size <= super::files::READ_LEAD_MAX_BYTES)
        })
        .filter_map(|row| {
            let name = super::display_name(&row.source);
            let (relative, depth) = if row.dir.is_empty() {
                (name, 0)
            } else {
                let depth = row.dir.matches('/').count() + 1;
                (format!("{}/{name}", row.dir), depth)
            };
            if super::files::generated_or_fixture(&relative) {
                return None;
            }
            let rank = crate::tools::root_read::read_rank(&relative, depth, &[])?;
            Some((relative, (rank, depth)))
        })
        .min_by(|left, right| (left.1, &left.0).cmp(&(right.1, &right.0)))?;
    let mut query = json!({"path": root.join(&relative).to_string_lossy()});
    if crate::tools::outlines(&relative) {
        query["minify"] = json!("symbols");
    }
    Some(
        crate::tools::result::Continuation::new(crate::tools::id::ToolId::LocalFetch, query)
            .build(),
    )
}

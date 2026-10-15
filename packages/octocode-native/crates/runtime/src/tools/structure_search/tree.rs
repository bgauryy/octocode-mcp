use crate::contracts::tool_types::DefaultExcludes;
use crate::policy::prune::DefaultsFlag;
use crate::tools::empty_walk::Walk;
use crate::tools::result::ToolError;
use crate::{
    policy::{path::PathPolicy, prune::PruneMode},
    security::ContentSecurity,
    tools::cancel::CancellationCheck,
};
use octocode_engine::search::walk::IgnorePolicy;
use octocode_engine::types::FileSystemQueryOptions;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};

use super::Walking;
use super::files::walk_warnings;
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
                    super::structure_max("maxDepth")
                } else {
                    1
                }
            },
            |depth| u32::try_from(depth.get()).unwrap_or(u32::MAX),
        )
    }
    fn max_entries(&self) -> usize {
        self.max_entries
            .map_or(super::max_walk() as usize, |limit| {
                usize::try_from(limit.get()).unwrap_or(usize::MAX)
            })
            .min(super::max_walk() as usize)
    }
    fn page(&self) -> usize {
        usize::try_from(self.page.get()).unwrap_or(usize::MAX)
    }
    /// Outline rows (walk order) earlier windows listed.
    fn scan_offset(&self) -> usize {
        self.scan_offset.map_or(0, |offset| {
            usize::try_from(offset.get()).unwrap_or(usize::MAX)
        })
    }
    /// The caller's page size; `None` pages by the response budget.
    fn page_size(&self) -> Option<usize> {
        self.page_size.map(|size| {
            usize::try_from(size.get())
                .unwrap_or(usize::MAX)
                .clamp(1, super::structure_max("pageSize") as usize)
        })
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
    /// A regular file's size in bytes; `None` for directories and symlinks.
    size: Option<i64>,
    /// The walked entry, for the continuation pages' change check.
    source: std::path::PathBuf,
    /// Its size and time as the walk read them (the stored walk's stamp).
    seen: (u64, Option<std::time::SystemTime>),
}

/// A tree walk: its rows in listing order (cut to `maxEntries`) and what
/// the walk left out.
struct TreeWalk {
    rows: Vec<TreeRow>,
    /// Walk-order rows before this window's end: where `next.expandScan`
    /// resumes.
    covered: usize,
    available: usize,
    total_discovered: usize,
    was_capped: bool,
    /// The walk ran out of time before this root-relative entry.
    time_cut: Option<String>,
    files: usize,
    dirs: usize,
    bytes: i64,
    uncovered: super::Uncovered,
    warnings: Vec<String>,
}

impl super::memo::Listed for TreeWalk {
    fn sources(&self) -> Vec<super::memo::Seen<'_>> {
        self.rows
            .iter()
            .map(|row| super::memo::Seen {
                path: row.source.as_path(),
                size: row.seen.0,
                modified: row.seen.1,
            })
            .collect()
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
        super::memo::put(snapshot.clone(), policy, &validated.canonical, &walk);
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
    let bound = super::ProbeBound::new(super::PROBE_BUDGET);
    super::note_empty(
        &mut out,
        q,
        (&validated.canonical, paths),
        &walk.uncovered,
        shown,
        |relaxed| {
            let mut relaxed_query = q.clone();
            relaxed_query.include_ignored = Some(relaxed.ignored);
            relaxed_query.include_hidden = Some(relaxed.hidden);
            relaxed_query.default_excludes = Some(DefaultExcludes(relaxed.default_excludes));
            relaxed_query.scan_offset = None;
            let found = walk_tree(
                &relaxed_query,
                &validated.canonical,
                paths,
                security,
                cancel,
                super::PROBE_HITS,
                Walking::Probe(&bound),
            )?;
            let cut = found.was_capped || bound.cut();
            Ok(super::found_entries(
                found.rows.into_iter().map(|row| row.source),
                cut,
            ))
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
) -> Result<TreeWalk, ToolError> {
    let bound = walking.probe();
    // Leave out what localSearch leaves out: ignored entries (unless
    // includeIgnored, counted by the walk) and paths the path policy denies
    // (sensitive names, and symlinks out of the allowed roots). Denied
    // entries the listing would otherwise show are counted and reported,
    // never silently dropped.
    let show_hidden = q.include_hidden.unwrap_or(false);
    let include = crate::policy::include::include_globs(&q.include);
    let probe = super::FilterProbe::new(root, &include, &q.extensions, None)?;
    let withheld = std::sync::Mutex::new(crate::policy::discovery::Withheld::default());
    let hidden = AtomicUsize::new(0);
    let pruned = PruneMode::SyntaxVisible.directories(q.default_excludes.defaults());
    let discovery = paths.discovery_walk();
    let native = octocode_engine::portable::query_file_system(
        FileSystemQueryOptions {
            path: root.to_string_lossy().into_owned(),
            include_root: Some(false),
            recursive: Some(true),
            max_depth: Some(q.walk_depth()),
            ignore: IgnorePolicy::new(q.include_ignored, Some(show_hidden)),
            names: (!include.is_empty()).then(|| include.clone()),
            extensions: (!q.extensions.is_empty()).then(|| q.extensions.clone()),
            entry_type: q.entry_type.map(|kind| kind.to_string()),
            exclude_dir: Some(pruned.clone()),
            exclude: (!q.exclude.is_empty()).then(|| q.exclude.clone()),
            stop_at_limit: Some(true),
            time_budget: walking.budget(),
            limit: Some(bound.map_or(super::max_walk(), |_| {
                u32::try_from(requested).unwrap_or(u32::MAX)
            })),
            ..Default::default()
        },
        &|path, file_type| {
            // The root itself stays admitted: a probe out of time lists
            // nothing under it, never fails.
            if path != root && bound.is_some_and(|bound| !bound.admits(path, file_type)) {
                return false;
            }
            // Dot entries out of view (no `hidden`) are neither listed nor
            // counted as withheld or ignored; the ones `includeHidden:true` would
            // walk (permitted, not ignored, not a pruned directory) are
            // counted as hidden.
            let name = crate::tools::display_name(path);
            let dot = name.starts_with('.');
            let allowed = discovery.permits_entry(path, file_type);
            if !allowed
                && (show_hidden || !dot)
                && probe.could_list(path)
                && super::reports_withheld(path)
            {
                withheld
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .record(path, path.is_dir());
            }
            if allowed && dot && !show_hidden && !(pruned.contains(&name) && path.is_dir()) {
                hidden.fetch_add(1, Relaxed);
            }
            allowed
        },
        &|| cancel.check().is_err(),
    )
    .map_err(|error| super::walk_error(error, q.path.as_str(), cancel))?;
    cancel.check().map_err(ToolError::cancelled)?;
    let mut rows = tree_rows(&native.entries, security);
    let available = rows.len();
    rows.truncate(requested);
    // An expanded scan lists only the walk-order rows past the window
    // earlier pages listed.
    let offset = q.scan_offset().min(rows.len());
    rows.drain(..offset);
    let covered = offset + rows.len();
    // The summary totals this listing's rows, like `files`; bytes are
    // regular files' (a symlink's own length is no content).
    let (files, dirs, bytes) = rows.iter().fold((0, 0, 0), |(f, d, b), row| {
        if row.kind == "directory" {
            (f, d + 1, b)
        } else {
            (f + 1, d, b + row.size.unwrap_or(0))
        }
    });
    // One group per directory: `path`'s own entries first, then each
    // directory in walk order (component-wise path order), entries in walk
    // order within it. The sort is stable.
    rows.sort_by(|a, b| std::path::Path::new(&a.dir).cmp(std::path::Path::new(&b.dir)));
    drop_grouped_dirs(&mut rows);
    let mut warnings = walk_warnings(native.skipped, native.permission_denied);
    warnings.extend(native.warnings);
    Ok(TreeWalk {
        rows,
        covered,
        available,
        total_discovered: native.total_discovered as usize,
        was_capped: native.was_capped,
        time_cut: native
            .time_cut
            .map(|at| security.sanitize_text(&at, None).content),
        files,
        dirs,
        bytes,
        uncovered: super::Uncovered {
            ignored: native.ignored as usize,
            withheld: withheld
                .into_inner()
                .unwrap_or_else(|error| error.into_inner()),
            hidden: hidden.into_inner(),
            pruned: native.pruned_dirs,
        },
        warnings,
    })
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
            let mut file_size = None;
            // A symlink counts as a non-directory entry, as `files` counts
            // it; its size is the link's own.
            let kind = match entry.entry_type.as_str() {
                "directory" => "directory",
                "symlink" => "symlink",
                _ => {
                    file_size = Some(entry.size.unwrap_or(0));
                    "file"
                }
            };
            // Every non-directory entry names its size, a symlink its own.
            let size = (kind != "directory").then(|| entry.size.unwrap_or(0));
            let text = super::files::entry_text(name, kind, size, None, None);
            TreeRow {
                dir: dir.to_owned(),
                entry: text,
                name: name.to_owned(),
                kind,
                size: file_size,
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
    walk: &TreeWalk,
    pages: &[std::ops::Range<usize>],
    snapshot: String,
    (root, prefix): (&std::path::Path, &str),
    requested: usize,
    (detail, cancel): (Option<&PathPolicy>, &dyn CancellationCheck),
) -> Result<Value, ToolError> {
    let page = q.page().max(1);
    let total = walk.rows.len();
    let cut = super::Cut {
        page,
        total_pages: pages.len().max(1),
        total,
        requested,
        available: walk.available,
        limit_cut: walk.available > requested,
        scan_cut: walk.was_capped,
        time_cut: walk.time_cut.clone(),
        early_exit: false,
        total_discovered: walk.total_discovered,
        scan_offset: q.scan_offset(),
        covered: walk.covered,
        snapshot: snapshot.clone(),
    };
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
                        (lines > 0).then_some(lines),
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
    // A walk cut by time proved nothing about what it did not scan.
    if total == 0 && walk.time_cut.is_none() {
        out["status"] = json!("empty");
    }
    // The walk's summary and its retries describe the whole listing: page 1
    // states them once.
    if page == 1 {
        // Skipped dot entries matter when the listing is filtered or empty;
        // an unfiltered outline names their count in the summary.
        let report_hidden = walk.uncovered.hidden > 0 && total > 0 && q.filtered();
        out["summary"] = summary(walk);
        super::lead_to_ignored(&mut out, q, &walk.uncovered);
        if report_hidden {
            out["next"]["includeHidden"] =
                super::continuation(q, json!({"includeHidden":true,"page":1,"snapshot":null}));
        }
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
    let mut warnings = walk.warnings.clone();
    warnings.extend(crate::policy::include::parent_glob_warning(
        &q.include, &q.exclude,
    ));
    cut.finish(&mut out, q, &mut warnings);
    warnings.extend(walk.uncovered.withheld.notice());
    if !warnings.is_empty() {
        out["warnings"] = json!(warnings);
    }
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
            row.size
                .is_some_and(|size| size <= super::files::READ_LEAD_MAX_BYTES)
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

/// The walk's counts, plus how many entries `.gitignore` hid (the path
/// policy's withheld entries are a warning on every page), how many dot
/// entries were skipped without `includeHidden` (reported when the listing
/// is filtered or empty), and which directories the default prune skipped:
/// their names stay out of the listing, but their absence is not silent.
fn summary(walk: &TreeWalk) -> Value {
    let uncovered = &walk.uncovered;
    let mut summary = json!({"files": walk.files, "dirs": walk.dirs, "bytes": walk.bytes});
    if uncovered.ignored > 0 {
        summary["ignored"] = json!(uncovered.ignored);
    }
    if uncovered.hidden > 0 {
        summary["hidden"] = json!(uncovered.hidden);
    }
    if let Some(pruned) = uncovered.pruned_names() {
        summary["pruned"] = json!(pruned);
    }
    summary
}

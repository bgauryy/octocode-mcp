//! Filesystem layout: `tree` outlines directories, `files` finds paths by name
//! or metadata. Walk-only by construction — this module never loads a grammar.
mod files;
mod memo;
mod output;
pub(crate) use output::Output;
mod resume;
#[cfg(test)]
mod tests;
mod tree;

/// Entries one walk may visit: the contract `maxEntries` maximum.
fn max_walk() -> u32 {
    u32_of_usize(crate::tools::id::query_limits::structure_search::MAX_ENTRIES_MAXIMUM)
}

/// Wall time one listing walk may spend: the budget every unbounded local
/// scan shares. A filter that matches little makes the walk visit the whole
/// tree, which no entry count bounds; past this budget the walk stops at its
/// next entry and the page says where ([`Cut::time_cut`]).
const WALK_BUDGET: std::time::Duration = octocode_engine::scan_budget::SCAN_TIME_BUDGET;

use crate::policy::prune::PruneMode;
use crate::tools::display_name;
use crate::tools::empty_walk::{Cause, Hits, Verdict, Walk, diagnose_shown, lift};
use crate::tools::num::u32_of_usize;
use crate::tools::result::ToolError;
use serde_json::{Value, json};

/// Serialized chars one row adds to a page: `entry` always, plus `header`
/// when the row opens a group: it starts the page, or `continues` is false
/// (it follows a row of another group). A page repeats the header of a group
/// it continues, so every page reads on its own.
#[derive(Clone, Copy, Debug)]
struct RowCost {
    entry: usize,
    header: usize,
    continues: bool,
}

/// Row ranges of each page: `page_size` rows each when the caller sets it,
/// else as many rows as fit `budget` serialized chars (at least one per
/// page). Costs come from snapshot-bound data, so every page of one snapshot
/// cuts at the same rows. An empty listing has no pages.
fn page_ranges(
    costs: &[RowCost],
    page_size: Option<usize>,
    budget: usize,
) -> Vec<std::ops::Range<usize>> {
    let total = costs.len();
    if total == 0 {
        return Vec::new();
    }
    if let Some(size) = page_size {
        let size = size.max(1);
        return (0..total)
            .step_by(size)
            .map(|start| start..start.saturating_add(size).min(total))
            .collect();
    }
    let mut pages = Vec::new();
    let mut start = 0;
    let mut used = 0usize;
    for (index, cost) in costs.iter().enumerate() {
        let opening = cost.entry.saturating_add(cost.header);
        let added = if cost.continues { cost.entry } else { opening };
        if index > start && used.saturating_add(added) > budget {
            pages.push(start..index);
            start = index;
            used = 0;
        }
        used = used.saturating_add(if index == start { opening } else { added });
    }
    pages.push(start..total);
    pages
}

pub use crate::contracts::tool_types::StructureSearchQuery;

/// The policy error for `requested`; a missing path also leads to a tree of
/// its nearest existing parent, so the agent sees what is there instead.
/// The listed root once the call is live and the policy admits `requested`;
/// a missing root leads to its nearest admitted parent.
fn validated_root(
    requested: &str,
    paths: &crate::policy::path::PathPolicy,
    cancel: &dyn crate::tools::cancel::CancellationCheck,
) -> Result<crate::policy::path::ValidatedPath, ToolError> {
    cancel.check().map_err(ToolError::cancelled)?;
    paths
        .validate(requested)
        .map_err(|error| ToolError::root_policy(error, requested, paths, "pathValidationFailed"))
}

/// A file named as a tree root (`files` lists a file root as itself): say
/// so with its workspace-relative name and lead to its outline, the read an
/// agent wanted from it.
fn file_root(file: &std::path::Path, paths: &crate::policy::path::PathPolicy) -> ToolError {
    let name = paths
        .workspace_relative(file)
        .unwrap_or_else(|| file.to_string_lossy().into_owned());
    let mut out = ToolError::new(
        "notADirectory",
        format!("{name} is a file, not a directory; read it with localFetch or list its parent."),
    );
    let lead = crate::tools::result::Continuation::new(
        crate::tools::id::ToolId::LocalFetch,
        json!({"path": name, "minify": "symbols"}),
    )
    .build();
    out.next = Some(Box::new(json!({ "read": lead })));
    out
}

pub type StructureResult = Result<Value, ToolError>;

/// A failed walk of `requested`, coded by the engine's typed kind: a
/// vanished root reads like any other missing path, and a walk the policy
/// callback stopped because the call was cancelled says so.
fn walk_error(
    error: octocode_engine::error::Error,
    requested: &str,
    cancel: &dyn crate::tools::cancel::CancellationCheck,
) -> ToolError {
    use octocode_engine::error::ErrorKind;
    if let Err(message) = cancel.check() {
        return ToolError::cancelled(message);
    }
    let code = match error.kind() {
        ErrorKind::NotFound => {
            return ToolError::new(
                crate::policy::PATH_NOT_FOUND,
                format!("Path does not exist: {requested}"),
            );
        }
        ErrorKind::PermissionDenied => "permissionDenied",
        ErrorKind::InvalidPattern => "invalidPattern",
        ErrorKind::InvalidGlob => "invalidGlob",
        // A malformed filter value (`size`, ...) is rejected before the
        // walk: caller input, like the typed time-filter checks.
        ErrorKind::InvalidInput => "invalidInput",
        _ => "executionFailed",
    };
    ToolError::new(code, error.to_string())
}

/// Whether a withheld entry is worth a warning: the repository's own `.git`
/// is withheld from every walk of a repository, so naming it says nothing
/// about this call.
fn reports_withheld(path: &std::path::Path) -> bool {
    display_name(path) != ".git"
}

/// A continuation page whose walk no longer hashes to its `snapshot`: the
/// stale stored walk is dropped and the listing restarts from its first
/// page and window. A page without a snapshot pins nothing: it pages the
/// current walk.
fn restart_if_stale(
    query: &impl serde::Serialize,
    page: usize,
    snapshot: Option<&str>,
    current: &str,
) -> Option<Value> {
    let stale = snapshot.filter(|snapshot| page > 1 && *snapshot != current)?;
    memo::evict(stale);
    let row = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    Some(crate::tools::result::stale_snapshot(
        crate::tools::result::restart_query(crate::tools::id::ToolId::StructureSearch, &row),
    ))
}

/// Copy the query with `changes` applied as a `structureSearch` continuation;
/// a `null` change drops that field.
fn continuation(query: &impl serde::Serialize, changes: Value) -> Value {
    let query = crate::tools::result::with_changes(
        serde_json::to_value(query).unwrap_or_else(|_| json!({})),
        &changes,
    );
    crate::tools::result::Continuation::new(crate::tools::id::ToolId::StructureSearch, query)
        .confidence("exact")
        .build()
}

/// One level of the listed directory's tree: the subdirectories a listing
/// cut at a terminal limit can be re-listed under, each within the limits.
fn narrow_scope(query: &impl serde::Serialize) -> Value {
    let path = serde_json::to_value(query)
        .ok()
        .and_then(|query| query.get("path").cloned())
        .unwrap_or(Value::Null);
    crate::tools::result::Continuation::new(
        crate::tools::id::ToolId::StructureSearch,
        json!({"operation": "tree", "path": path, "maxDepth": 1}),
    )
    .build()
}

/// What a walk left out of a listing: `.gitignore`d entries, entries the
/// path policy withheld, dot entries skipped without `hidden`, and the
/// directories the default prune skipped (root-relative).
#[derive(Clone, Debug, Default)]
struct Uncovered {
    ignored: usize,
    withheld: crate::policy::discovery::Withheld,
    hidden: usize,
    pruned: Vec<String>,
}

impl Uncovered {
    /// The distinct names of the default-pruned directories, sorted.
    fn pruned_names(&self) -> Option<Vec<String>> {
        if self.pruned.is_empty() {
            return None;
        }
        let mut names = self
            .pruned
            .iter()
            .map(|dir| dir.rsplit('/').next().unwrap_or(dir).to_owned())
            .collect::<Vec<_>>();
        names.sort_unstable();
        names.dedup();
        Some(names)
    }

    /// Whether the walk skipped anything a relaxed walk could list.
    fn saw_skips(&self) -> bool {
        self.ignored > 0 || self.hidden > 0 || !self.pruned.is_empty()
    }

    /// The causes of `walk` this walk skipped entries by, in [`Cause`] order.
    fn skipped(&self, walk: Walk) -> Vec<Cause> {
        walk.skipping()
            .into_iter()
            .filter(|cause| match cause {
                Cause::Ignored => self.ignored > 0,
                Cause::Hidden => self.hidden > 0,
                Cause::DefaultExcluded => !self.pruned.is_empty(),
            })
            .collect()
    }

    /// `causes` as a hint names them: the pruned directories by name, the
    /// rest by label.
    fn named(&self, causes: &[Cause]) -> String {
        causes
            .iter()
            .map(|cause| match (cause, self.pruned_names()) {
                (Cause::DefaultExcluded, Some(names)) => names
                    .iter()
                    .map(|name| format!("{name}/"))
                    .collect::<Vec<_>>()
                    .join(", "),
                _ => cause.label().to_owned(),
            })
            .collect::<Vec<_>>()
            .join("; ")
    }
}

/// Entries one probe lists before it stops: enough to name the skip
/// reasons and to tell "some" from "none".
const PROBE_HITS: usize = crate::tools::empty_walk::SAMPLE_FILES + 1;

/// Size of a directory's own listing (its entry table) past which a probe
/// leaves it unread: one such directory (`target/debug/deps`, ~255k
/// entries, ~8 MB) takes seconds to list, past any budget.
const PROBE_MAX_DIR_BYTES: u64 = 1024 * 1024;

/// The bound of an empty listing's relaxed probe walks: past `deadline`
/// they admit nothing more, and a directory too large to list in time is
/// left unread. Either makes the probe's finding a lower bound (`cut`).
struct ProbeBound {
    deadline: std::time::Instant,
    cut: std::sync::atomic::AtomicBool,
}

impl ProbeBound {
    fn new(budget: std::time::Duration) -> Self {
        Self {
            deadline: std::time::Instant::now() + budget,
            cut: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Whether a probe walk may admit `path`: not once its deadline passed,
    /// nor a directory whose listing is too large to read in time.
    fn admits(&self, path: &std::path::Path, file_type: Option<std::fs::FileType>) -> bool {
        use std::sync::atomic::Ordering::Relaxed;
        let refused = std::time::Instant::now() >= self.deadline
            || (file_type.is_some_and(|kind| kind.is_dir())
                && std::fs::symlink_metadata(path)
                    .is_ok_and(|meta| meta.len() > PROBE_MAX_DIR_BYTES));
        if refused {
            self.cut.store(true, Relaxed);
        }
        !refused
    }

    /// Whether the probe left something unread.
    fn cut(&self) -> bool {
        self.cut.load(std::sync::atomic::Ordering::Relaxed)
    }
}

/// What bounds a walk: a listing walk by time ([`WALK_BUDGET`]), a probe
/// walk by its own entry cap and deadline.
#[derive(Clone, Copy)]
enum Walking<'a> {
    Listing(std::time::Duration),
    Probe(&'a ProbeBound),
}

impl<'a> Walking<'a> {
    fn probe(self) -> Option<&'a ProbeBound> {
        match self {
            Self::Probe(bound) => Some(bound),
            Self::Listing(_) => None,
        }
    }

    fn budget(self) -> Option<std::time::Duration> {
        match self {
            Self::Listing(budget) => Some(budget),
            Self::Probe(_) => None,
        }
    }
}

/// How a listing walk keeps and uses its cursor ([`resume`]): the walk's
/// identity and the path policy it ran under, and its root.
struct Resumes<'a> {
    identity: Value,
    paths: &'a crate::policy::path::PathPolicy,
    root: &'a std::path::Path,
}

impl Resumes<'_> {
    /// The engine options for a listing walk of `walking`: the cursor of the
    /// window it resumes at `walk_offset` (when one is kept and nothing it
    /// depends on changed), and a checkpoint at the window's `requested`-th
    /// row, where a window cut at its rows ends.
    fn options(
        &self,
        walking: Walking<'_>,
        walk_offset: u32,
        requested: usize,
    ) -> (
        Option<octocode_engine::search::fs_resume::WalkCursor>,
        Option<u32>,
    ) {
        if walking.budget().is_none() {
            return (None, None);
        }
        let resume = (walk_offset > 0)
            .then(|| resume::take(&self.identity, &self.paths.identity(), walk_offset))
            .flatten();
        (resume, Some(u32_of_usize(requested)))
    }

    /// Keep where the walk stands at the end of its window, for the window
    /// that resumes there.
    fn keep(
        &self,
        native: &mut octocode_engine::types::FileSystemQueryResult,
        walking: Walking<'_>,
    ) {
        if walking.budget().is_none() || native.time_cut.is_none() {
            return;
        }
        if let Some(cursor) = native
            .cursor
            .take()
            .filter(|cursor| cursor.position() == native.walk_position)
        {
            resume::keep(
                &self.identity,
                &self.paths.identity(),
                self.paths,
                self.root,
                cursor,
            );
        }
    }
}

/// What a relaxed listing probe found: the walked entries, `cut` when the
/// probe stopped at its hit cap or deadline (there may be more, or some).
fn found_entries(entries: impl Iterator<Item = std::path::PathBuf>, cut: bool) -> Hits {
    let mut count = 0;
    let mut sample = Vec::new();
    for entry in entries {
        count += 1;
        if sample.len() < crate::tools::empty_walk::SAMPLE_FILES {
            sample.push(entry);
        }
    }
    Hits { count, sample, cut }
}

/// An empty listing cannot prove absence in what its walk skipped: when the
/// same listing over some of it (`probe` re-walks with the given flags)
/// finds entries, name the rule, entry or directory in a hint and lead to
/// the listing with exactly those causes lifted. A probe cut before it found
/// anything proves nothing: the lead lifts every cause the walk skipped by
/// and the hint says absence there is unproven.
fn note_empty(
    out: &mut Value,
    query: &impl serde::Serialize,
    (root, paths): (&std::path::Path, &crate::policy::path::PathPolicy),
    seen: &Uncovered,
    walk: Walk,
    probe: impl FnMut(Walk) -> Result<Hits, ToolError>,
) -> Result<(), ToolError> {
    if out["status"] != "empty" || !seen.saw_skips() {
        return Ok(());
    }
    // Rules and entries are named like the rows: workspace-relative.
    let shown = |path: &std::path::Path| {
        paths
            .workspace_relative(path)
            .unwrap_or_else(|| path.to_string_lossy().into_owned())
    };
    let (causes, hint) = match diagnose_shown(root, PruneMode::SyntaxVisible, walk, &shown, probe)?
    {
        Verdict::Skipped(diagnosis) => {
            let found = diagnosis.found();
            let hint = format!(
                "{}{} {} behind skipped paths ({}); the lead lists them.",
                if found.cut { "At least " } else { "" },
                found.count,
                if found.count == 1 {
                    "entry sits"
                } else {
                    "entries sit"
                },
                diagnosis.because()
            );
            (diagnosis.causes().to_vec(), hint)
        }
        // The probe was cut before it found anything: it proved nothing
        // about what the walk skipped, so the lead lists the paths this
        // walk did skip and the hint says absence there is unproven.
        Verdict::Unproven => {
            let causes = seen.skipped(walk);
            if causes.is_empty() {
                return Ok(());
            }
            let hint = format!(
                "Skipped paths ({}) were not checked in time; absence there is unproven: the lead lists them.",
                seen.named(&causes)
            );
            (causes, hint)
        }
        Verdict::Absent => return Ok(()),
    };
    let mut retry = json!({"page": 1, "snapshot": null, "walkOffset": null});
    lift(&mut retry, &causes);
    out["next"]["includeSkipped"] = continuation(query, retry);
    match out["hints"].as_array_mut() {
        Some(hints) => hints.push(json!(hint)),
        None => out["hints"] = json!([hint]),
    }
    Ok(())
}

/// A non-empty first page whose walk left out entries leads to the same
/// listing with the causes it skipped by lifted, in one call: every
/// ignored or dot entry its summary counts is reachable. Default-pruned
/// directories (dependencies, build output), which the summary names
/// rather than counts, are lifted only for a `filtered` listing (one looking
/// for names, types or metadata), where more of what it looks for may sit.
/// An empty page gets its lead from [`note_empty`], which proves the
/// skipped paths hold entries.
fn lead_to_skipped(
    out: &mut Value,
    query: &impl serde::Serialize,
    seen: &Uncovered,
    walk: Walk,
    filtered: bool,
) {
    if out["status"] == "empty" || out["next"].get("includeSkipped").is_some() {
        return;
    }
    let mut causes = seen.skipped(walk);
    if !filtered {
        causes.retain(|cause| *cause != Cause::DefaultExcluded);
    }
    if causes.is_empty() {
        return;
    }
    let mut retry = json!({"page": 1, "snapshot": null, "walkOffset": null});
    lift(&mut retry, &causes);
    out["next"]["includeSkipped"] = continuation(query, retry);
}

/// Where a listing's rows were cut, for the continuation tail both
/// operations share.
struct Cut {
    page: usize,
    total_pages: usize,
    /// Rows in the listing after `maxEntries`.
    total: usize,
    requested: usize,
    /// Rows the walk returned before `maxEntries` cut them.
    available: usize,
    limit_cut: bool,
    scan_cut: bool,
    /// The walk ran out of time before this root-relative entry: it and
    /// everything after it in walk order is unscanned.
    time_cut: Option<String>,
    /// How the window's rows end at a time cut.
    time_window: TimeWindow,
    /// Walk entries inspected, `walkOffset` ones included: where
    /// `next.continueWalk` resumes a time-cut walk.
    walk_position: usize,
    /// Walk entries earlier windows inspected (`walkOffset`).
    walk_offset: usize,
    /// The walk stopped at the first match past the limit, so only a lower
    /// bound of the total is known.
    early_exit: bool,
    total_discovered: usize,
    /// Listing rows earlier windows listed (`scanOffset`).
    scan_offset: usize,
    /// Listing rows before this window's end: the next window's
    /// `scanOffset`.
    covered: usize,
    /// The listing ranks rows by something other than walk order.
    ranked: bool,
    snapshot: String,
}

/// How a window cut by time ends: whether `next.continueWalk` can resume it
/// without a gap or a repeat, and where.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum TimeWindow {
    /// The window lists every row its walk found (past `scanOffset`): the
    /// walk resumes at its last inspected entry.
    #[default]
    Whole,
    /// The walk found more rows than `maxEntries`: the window ends at the
    /// last row it lists, in walk order, and the walk resumes there. The
    /// rows after it in walk order are not dropped, the resume walks them.
    EndedAtRows,
    /// A listing sorted by something other than walk order resumed with
    /// `scanOffset` skips rows of an earlier window's sort order, which a
    /// walk cut short ranks differently: no row of the window is listed,
    /// and none resumes it.
    SortedPastScanOffset,
}

impl Cut {
    fn has_more(&self) -> bool {
        self.page < self.total_pages
    }
    /// More of the walk's own rows fit a wider `maxEntries`.
    fn can_expand(&self) -> bool {
        self.limit_cut && self.requested < max_walk() as usize
    }
    /// The `walkOffset` that resumes a walk cut by time after the last entry
    /// its window covers, when no row of this window was dropped (a window
    /// cut at the walk ceiling lost rows no resume re-lists), the listing
    /// is in walk order wherever `scanOffset` skips rows, and the walk
    /// advanced past its own resume point and within the contract.
    fn resume_at(&self) -> Option<usize> {
        if self.time_cut.is_none()
            || self.limit_cut
            || self.scan_cut
            || self.time_window == TimeWindow::SortedPastScanOffset
            || self.walk_position <= self.walk_offset
        {
            return None;
        }
        crate::tools::paging::admitted(
            crate::tools::id::ToolId::StructureSearch,
            None,
            "walkOffset",
            self.walk_position,
        )
    }
    /// The listing rows `scanOffset` skipped that this window's walk did
    /// not reach: the resumed walk skips them before it lists.
    fn rows_left_to_skip(&self) -> usize {
        self.scan_offset.saturating_sub(self.available)
    }
    /// The time cut has no continuation: no resume reaches the entries past
    /// it.
    fn time_terminal(&self) -> bool {
        self.time_cut.is_some() && self.resume_at().is_none()
    }
    /// More pages exist, but the next page number is past the contract's
    /// `page` maximum.
    fn page_ceiling(&self) -> bool {
        self.has_more() && self.next_page().is_none()
    }
    /// The page a continuation names after this one, when the contract
    /// admits it.
    fn next_page(&self) -> Option<usize> {
        crate::tools::paging::admitted(
            crate::tools::id::ToolId::StructureSearch,
            None,
            "page",
            self.page + 1,
        )
    }
    /// The walk stopped at the largest `maxEntries`: entries past it are
    /// on no page.
    fn walk_ceiling(&self) -> bool {
        (self.limit_cut || self.scan_cut) && !self.can_expand()
    }
    fn terminal(&self) -> bool {
        self.page_ceiling() || self.walk_ceiling() || self.time_terminal()
    }
    fn out_of_range(&self) -> bool {
        self.total > 0 && self.page > self.total_pages
    }

    /// The page, scan-expansion and partial-coverage continuations.
    fn finish(&self, out: &mut Value, query: &impl serde::Serialize, warnings: &mut Vec<String>) {
        // Every listed row stays reachable: a walk ceiling ends the listing,
        // never the pages over the rows it did list.
        if self.has_more()
            && let Some(next_page) = self.next_page()
        {
            out["next"]["nextPage"] =
                continuation(query, json!({"page": next_page, "snapshot": self.snapshot}));
        }
        if self.terminal() {
            let past = if self.page_ceiling() {
                format!(
                    "page {} is the last page a continuation may request; later rows of this listing",
                    self.page
                )
            } else if self.walk_ceiling() {
                if self.early_exit {
                    format!(
                        "the walk stopped at maxEntries {}; entries past it",
                        self.requested
                    )
                } else if self.scan_cut {
                    // The walk stopped at its ceiling: what it found is a
                    // lower bound, and a sort ranks only what it walked.
                    let ranking = if self.ranked {
                        ", so this sort ranks only the entries walked first (walk order: name-sorted, depth-first)"
                    } else {
                        ""
                    };
                    format!(
                        "the walk stopped at its {}-entry ceiling with at least {} entries matched{ranking}; entries past it",
                        max_walk(),
                        self.matched()
                    )
                } else {
                    format!(
                        "{} entries matched, past maxEntries {}; the rest",
                        self.matched(),
                        self.requested
                    )
                }
            } else if self.time_window == TimeWindow::SortedPastScanOffset {
                format!(
                    "the walk stopped at its time budget before `{}` and this listing's sort order cannot skip the rows of an earlier window across a cut walk, so this window lists none; its rows and entries from there on in walk order (name-sorted, depth-first)",
                    self.time_cut.as_deref().unwrap_or_default()
                )
            } else {
                format!(
                    "the walk stopped at its time budget before `{}`; entries from there on in walk order (name-sorted, depth-first)",
                    self.time_cut.as_deref().unwrap_or_default()
                )
            };
            warnings.push(format!("terminalLimit: {past} are on no page."));
            out["next"]["narrowScope"] = narrow_scope(query);
        }
        // The widened walk resumes after this window: offered on its last
        // page, it lists only rows no page of this window showed.
        if self.can_expand() && !self.has_more() {
            let wider = self
                .requested
                .saturating_mul(2)
                .max(self.requested + 1)
                .min(max_walk() as usize);
            out["next"]["expandScan"] = continuation(
                query,
                json!({"maxEntries": wider, "scanOffset": (self.covered > 0).then_some(self.covered), "page": 1, "snapshot": null}),
            );
        }
        // A time cut something continues is no terminal limit: the page
        // names the entry and the continuation that reaches the rest.
        if let Some(at) = self.time_cut.as_deref().filter(|_| !self.time_terminal()) {
            warnings.push(match self.time_window {
                TimeWindow::EndedAtRows => format!(
                    "the walk stopped at its time budget before `{at}` and found more rows than maxEntries {}: this window lists the first rows in walk order (name-sorted, depth-first), and entries after the last listed one are not yet listed: the page's continuation resumes the walk there.",
                    self.requested
                ),
                _ => format!(
                    "the walk stopped at its time budget before `{at}`; entries from there on in walk order (name-sorted, depth-first) are not yet listed: the page's continuation resumes the walk there."
                ),
            });
        }
        // The walk resumes where this one stopped: offered on the last page,
        // it inspects only entries this window did not.
        if let Some(position) = self.resume_at().filter(|_| !self.has_more()) {
            let skip = self.rows_left_to_skip();
            out["next"]["continueWalk"] = continuation(
                query,
                json!({"walkOffset": position, "page": 1, "snapshot": null, "scanOffset": (skip > 0).then_some(skip)}),
            );
        }
        for (cut, reason) in [
            (self.limit_cut, "maxEntries"),
            (self.scan_cut, "walkLimit"),
            (self.time_cut.is_some(), "walkDeadline"),
        ] {
            if cut {
                crate::tools::paging::mark_partial(out, reason, &[]);
            }
        }
        if self.page_ceiling() {
            crate::tools::paging::terminal_limit(out, crate::tools::paging::CURSOR_MAXIMUM, &[]);
        } else if self.walk_ceiling() {
            // The walk's own cut reason is already listed above.
            let reason = if self.limit_cut {
                "maxEntries"
            } else {
                "walkLimit"
            };
            crate::tools::paging::terminal_limit(out, reason, &[]);
        } else if self.time_terminal() {
            crate::tools::paging::terminal_limit(out, "walkDeadline", &[]);
        }
        if self.limit_cut || self.scan_cut {
            out["clipped"] = json!(true);
            if self.early_exit {
                out["atLeast"] = json!(self.scan_offset + self.total + 1);
            } else if self.scan_cut {
                out["atLeast"] = json!(self.matched());
            } else {
                out["totalAvailable"] = json!(self.matched());
            }
        }
    }

    /// Entries the walk matched: every one when it walked the whole tree,
    /// a lower bound when it stopped at its ceiling (`scan_cut`).
    fn matched(&self) -> usize {
        self.total_discovered.max(self.available)
    }
}

/// Names each directory once: by its own `{dir, …}` group when the group
/// lists an entry, else by its `name/` stub. A stub is dropped only when the
/// directory's group survives, so a directory whose subdirectories all have
/// groups of their own keeps its stub instead of vanishing from the listing.
/// `dir_of` is the group a row sits in; `stub_path_of` is the directory path
/// a bare `name/` row stands for (`None` for any other row).
fn drop_grouped_dirs<R>(
    rows: &mut Vec<R>,
    dir_of: impl Fn(&R) -> &str,
    stub_path_of: impl Fn(&R) -> Option<String>,
) {
    let mut grouped = rows
        .iter()
        .filter(|row| stub_path_of(row).is_none())
        .map(|row| dir_of(row).to_owned())
        .collect::<std::collections::HashSet<_>>();
    // A group's rows sit deeper than the stub naming it, so the deepest
    // groups settle first and decide the stubs above them.
    let depth = |dir: &str| {
        if dir.is_empty() {
            0
        } else {
            dir.matches('/').count() + 1
        }
    };
    let mut stubs = (0..rows.len())
        .filter(|&index| stub_path_of(&rows[index]).is_some())
        .collect::<Vec<_>>();
    stubs.sort_by_key(|&index| std::cmp::Reverse(depth(dir_of(&rows[index]))));
    let mut dropped = std::collections::HashSet::new();
    for index in stubs {
        let path = stub_path_of(&rows[index]).unwrap_or_default();
        if grouped.contains(&path) {
            dropped.insert(index);
        } else {
            grouped.insert(dir_of(&rows[index]).to_owned());
        }
    }
    let mut index = 0;
    rows.retain(|_| {
        index += 1;
        !dropped.contains(&(index - 1))
    });
}

/// The directory of a listed row as the response names it: relative to the
/// workspace root, `prefix` being the listed path's own spelling.
pub(super) fn group_dir(prefix: &str, dir: &str) -> String {
    match (prefix, dir) {
        (_, "") => prefix.to_owned(),
        (".", _) => dir.to_owned(),
        _ => format!("{prefix}/{dir}"),
    }
}

/// The listed directory (a file root: its directory) spelled like a row path: workspace-relative inside
/// the workspace, absolute outside it.
pub(super) fn listing_prefix(
    paths: &crate::policy::path::PathPolicy,
    root: &std::path::Path,
) -> String {
    // A file root lists itself under its directory.
    let dir = if root.is_file() {
        root.parent().unwrap_or(root)
    } else {
        root
    };
    paths
        .workspace_relative(dir)
        .unwrap_or_else(|| dir.to_string_lossy().into_owned())
}

/// One listing shape for `tree` and `files`: consecutive entries
/// of one directory become a `{dir, files}` group, `dir` workspace-relative
/// (the listed path's own entries included), so `dir + "/" + name` is a
/// path a local tool takes.
fn dir_groups<R>(
    rows: &[R],
    dir_entry: impl Fn(&R) -> (&String, &String),
    prefix: &str,
) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for row in rows {
        let (dir, entry) = dir_entry(row);
        let dir = group_dir(prefix, dir);
        match out.last_mut() {
            Some(group) if group.get("dir").and_then(Value::as_str) == Some(dir.as_str()) => {
                if let Some(items) = group["files"].as_array_mut() {
                    items.push(json!(entry));
                }
            }
            _ => out.push(json!({"dir": dir, "files": [entry]})),
        }
    }
    out
}

/// The walk for this page: a continuation reuses the walk its first page
/// stored when the listed entries are unchanged; otherwise walk now.
fn walked<T: std::any::Any + Send + Sync>(
    page: usize,
    snapshot: Option<&str>,
    policy: &str,
    walk: impl FnOnce() -> Result<T, ToolError>,
) -> Result<(std::sync::Arc<T>, bool), ToolError> {
    if page > 1
        && let Some(snapshot) = snapshot
        && let Some(stored) = memo::get::<T>(snapshot, policy)
    {
        return Ok((stored, true));
    }
    walk().map(|walk| (std::sync::Arc::new(walk), false))
}

/// A listed row as its walk read it: its kind, and the entry with the size
/// and time the continuation pages' change check compares.
trait Sourced {
    fn kind(&self) -> &'static str;
    fn seen(&self) -> memo::Seen<'_>;
}

/// A walk cut by time lists at most `requested` rows, the first ones in walk
/// order: the window ends at the last of them (`walk_position`), and the walk
/// resumed there reaches the rows after it. Cut anywhere else (the best rows
/// by a sort of a walk that timing cut short) the window could not tell the
/// resume which rows it dropped, and two windows would overlap or leave a gap.
/// Entries are in walk order; the root entry (position 0) is no row. A
/// listing that is not in walk order (`in_walk_order`) cannot skip the
/// `scan_offset` rows an earlier window listed over a walk cut short: the
/// window lists nothing.
fn end_window(
    native: &mut octocode_engine::types::FileSystemQueryResult,
    requested: usize,
    scan_offset: usize,
    in_walk_order: bool,
) -> TimeWindow {
    if native.time_cut.is_none() {
        return TimeWindow::Whole;
    }
    if scan_offset > 0 && !in_walk_order {
        native.entries.clear();
        return TimeWindow::SortedPastScanOffset;
    }
    let mut rows = native
        .entries
        .iter()
        .map(|entry| entry.walk_position)
        .filter(|position| *position > 0);
    // Fewer rows than `requested`, or exactly that many: nothing to end early.
    let Some(last) = rows.nth(requested.saturating_sub(1)) else {
        return TimeWindow::Whole;
    };
    if rows.next().is_none() {
        return TimeWindow::Whole;
    }
    // The window ends at `last`: the entries and the counts through it, the
    // rest is the resume's.
    native.end_at(last);
    TimeWindow::EndedAtRows
}

/// One listing walk: its rows in listing order (cut to `maxEntries`) and
/// what the walk saw beside them.
struct Walked<R> {
    rows: Vec<R>,
    meta: WalkMeta,
}

/// What a listing walk saw beside its rows.
struct WalkMeta {
    /// Listing rows before this window's end (`scanOffset` plus the rows
    /// this window took): where `next.expandScan` resumes.
    covered: usize,
    available: usize,
    total_discovered: usize,
    was_capped: bool,
    /// The walk ran out of time before this root-relative entry.
    time_cut: Option<String>,
    time_window: TimeWindow,
    /// Walk entries the window covers, `walkOffset` ones included.
    walk_position: usize,
    /// Files, directories and file bytes of this window's rows, counted
    /// before directories with their own group fold into its header.
    files: usize,
    dirs: usize,
    bytes: u64,
    uncovered: Uncovered,
    warnings: Vec<String>,
    /// The listing is ranked by something other than walk order (`files`
    /// sorted by size, lines, name or time): a walk cut at its ceiling ranks
    /// only the entries it walked first.
    ranked: bool,
}

impl<R: Sourced + Send + Sync + 'static> memo::Listed for Walked<R> {
    fn sources(&self) -> Vec<memo::Seen<'_>> {
        self.rows.iter().map(Sourced::seen).collect()
    }
}

/// What a listing walk's policy callback leaves out, counted as the walk
/// runs: entries the path policy withheld, dot entries skipped without
/// `includeHidden`, and the default-pruned directories. The callback applies
/// the default prune itself ([`Prune::at`]), so a directory with a pruned
/// name that git tracks stays listed.
///
/// [`Prune::at`]: octocode_engine::search::walk::Prune::at
struct WalkLeft {
    /// Entries the path policy withheld, by the walk position of the entry
    /// (and whether it is a directory).
    withheld: std::sync::Mutex<Vec<(u32, std::path::PathBuf, bool)>>,
    /// Walk positions of the dot entries skipped without `includeHidden`.
    hidden: std::sync::Mutex<Vec<u32>>,
    root: std::path::PathBuf,
    /// The default prune; `None` with `defaultExcludes:false`.
    prune: Option<octocode_engine::search::walk::RootedPrune>,
    /// Pruned directories, root-relative, in walk order, by walk position.
    pruned: std::sync::Mutex<Vec<(u32, String)>>,
}

impl WalkLeft {
    fn new(root: &std::path::Path, defaults: bool) -> Self {
        Self {
            withheld: std::sync::Mutex::default(),
            hidden: std::sync::Mutex::default(),
            root: root.to_path_buf(),
            prune: defaults.then(|| {
                octocode_engine::search::walk::Prune::new(
                    PruneMode::SyntaxVisible.directories(true),
                )
                .at(root)
            }),
            pruned: std::sync::Mutex::default(),
        }
    }

    /// Whether the default prune leaves out `path`, a directory below the
    /// root.
    fn excludes(&self, path: &std::path::Path, file_type: Option<std::fs::FileType>) -> bool {
        let is_dir = file_type.map_or_else(|| path.is_dir(), |kind| kind.is_dir());
        path != self.root
            && self
                .prune
                .as_ref()
                .is_some_and(|prune| prune.prunes(path, is_dir))
    }

    /// [`Self::excludes`], recording a fresh visit (a replayed one was
    /// recorded by the window it resumes).
    fn prunes(
        &self,
        path: &std::path::Path,
        file_type: Option<std::fs::FileType>,
        visit: octocode_engine::portable::Visit,
    ) -> bool {
        let pruned = self.excludes(path, file_type);
        if let Some(position) = visit.fresh_at().filter(|_| pruned) {
            let relative = path.strip_prefix(&self.root).unwrap_or(path);
            self.pruned
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .push((position, relative.to_string_lossy().replace('\\', "/")));
        }
        pruned
    }

    /// The policy callback of a listing walk (`tree` and `files` alike):
    /// whether the walk may enter or list `path`, counting what it leaves
    /// out. The root itself stays admitted: a probe out of time lists
    /// nothing under it, never fails. Dot entries out of view (no
    /// `includeHidden`) are neither listed nor counted as withheld; the ones
    /// `includeHidden:true` would walk (permitted, not ignored, not a pruned
    /// directory) are counted as hidden, and the walk's own dot rule skips
    /// them. Only an entry the filters could list makes a withheld one worth
    /// naming, and a replayed entry was counted by the window this one
    /// resumes.
    fn admit(
        &self,
        policy: &WalkPolicy<'_>,
        path: &std::path::Path,
        file_type: Option<std::fs::FileType>,
        visit: octocode_engine::portable::Visit,
    ) -> bool {
        if path != self.root
            && policy
                .bound
                .is_some_and(|bound| !bound.admits(path, file_type))
        {
            return false;
        }
        let dot = display_name(path).starts_with('.');
        let allowed = policy.discovery.permits_entry(path, file_type);
        let fresh = visit.fresh_at();
        let unseen = if allowed {
            Self::unfollowed(path, file_type, policy.filtered)
        } else {
            policy.probe.could_list(path)
        };
        if let Some(position) = fresh
            && unseen
            && (policy.show_hidden || !dot)
            && reports_withheld(path)
        {
            self.record_withheld(position, path);
        }
        if !allowed {
            return false;
        }
        if dot && !policy.show_hidden {
            if let Some(position) = fresh
                && !self.excludes(path, file_type)
            {
                self.count_hidden(position);
            }
            return true;
        }
        !self.prunes(path, file_type, visit)
    }

    fn count_hidden(&self, position: u32) {
        self.hidden
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(position);
    }

    fn record_withheld(&self, position: u32, path: &std::path::Path) {
        self.withheld
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push((position, path.to_path_buf(), path.is_dir()));
    }

    /// Whether a `filtered` listing walked past an admitted link to a
    /// directory: the walk follows no link, so the entries there are on no
    /// page, and a filter hides the link row too. It is disclosed like a
    /// withheld entry (`N symlinks not followed`).
    fn unfollowed(
        path: &std::path::Path,
        file_type: Option<std::fs::FileType>,
        filtered: bool,
    ) -> bool {
        filtered
            && file_type.map_or_else(|| path.is_symlink(), |kind| kind.is_symlink())
            && path.is_dir()
    }

    /// What the walk left out through the entry at walk position `through`:
    /// the window ends there, and the window that resumes after it counts
    /// the rest.
    fn into_uncovered(self, ignored: usize, through: u32) -> Uncovered {
        let covered = |position: &u32| *position <= through;
        let mut withheld = crate::policy::discovery::Withheld::default();
        for (_, path, is_dir) in self
            .withheld
            .into_inner()
            .unwrap_or_else(|error| error.into_inner())
            .iter()
            .filter(|(position, ..)| covered(position))
        {
            withheld.record(path, *is_dir);
        }
        Uncovered {
            ignored,
            withheld,
            hidden: self
                .hidden
                .into_inner()
                .unwrap_or_else(|error| error.into_inner())
                .iter()
                .filter(|position| covered(position))
                .count(),
            pruned: self
                .pruned
                .into_inner()
                .unwrap_or_else(|error| error.into_inner())
                .into_iter()
                .filter(|(position, _)| covered(position))
                .map(|(_, relative)| relative)
                .collect(),
        }
    }
}

/// What one listing walk's policy callback ([`WalkLeft::admit`]) decides
/// by: the probe bound (a probe walk only), the path policy, the filters a
/// withheld entry is weighed against, and the hidden and filtered flags.
struct WalkPolicy<'a> {
    bound: Option<&'a ProbeBound>,
    discovery: crate::policy::path::DiscoveryWalk<'a>,
    probe: FilterProbe,
    show_hidden: bool,
    filtered: bool,
}

impl<R: Sourced> Walked<R> {
    /// The walk's `rows` (listing order) cut to `requested`, less the
    /// `scan_offset` rows earlier windows listed (listing order is stable,
    /// so those are the ones they showed), with what the walk left out.
    fn finish(
        native: octocode_engine::types::FileSystemQueryResult,
        mut rows: Vec<R>,
        requested: usize,
        scan_offset: usize,
        left: WalkLeft,
        security: &crate::security::ContentSecurity,
    ) -> Self {
        let available = rows.len();
        rows.truncate(requested);
        let offset = scan_offset.min(rows.len());
        rows.drain(..offset);
        // A non-directory row is a file; bytes are regular files' (a
        // symlink's own length is no content).
        let (mut files, mut dirs, mut bytes) = (0, 0, 0);
        for row in &rows {
            match row.kind() {
                "directory" => dirs += 1,
                kind => {
                    files += 1;
                    if kind == "file" {
                        bytes += row.seen().size;
                    }
                }
            }
        }
        let mut warnings = walk_warnings(native.skipped, native.permission_denied);
        warnings.extend(native.warnings);
        let meta = WalkMeta {
            covered: offset + rows.len(),
            available,
            total_discovered: native.total_discovered as usize,
            was_capped: native.was_capped,
            time_cut: native
                .time_cut
                .map(|at| security.sanitize_text(&at, None).content),
            time_window: TimeWindow::Whole,
            walk_position: native.walk_position as usize,
            files,
            dirs,
            bytes,
            uncovered: left.into_uncovered(native.ignored as usize, native.walk_position),
            warnings,
            ranked: false,
        };
        Self { rows, meta }
    }

    /// Where this page cuts the listing. An early-exit walk that found one
    /// more match than the limit has more; only a full walk knows the total.
    fn cut(
        &self,
        page: usize,
        pages: usize,
        requested: usize,
        early_exit: bool,
        (scan_offset, walk_offset): (usize, u32),
        snapshot: String,
    ) -> Cut {
        let meta = &self.meta;
        let (limit_cut, scan_cut) = if early_exit {
            (meta.was_capped, false)
        } else {
            (meta.available > requested, meta.was_capped)
        };
        Cut {
            page,
            total_pages: pages.max(1),
            total: self.rows.len(),
            requested,
            available: meta.available,
            limit_cut,
            scan_cut,
            time_cut: meta.time_cut.clone(),
            time_window: meta.time_window,
            walk_position: meta.walk_position,
            walk_offset: walk_offset as usize,
            early_exit,
            total_discovered: meta.total_discovered,
            scan_offset,
            covered: meta.covered,
            ranked: meta.ranked,
            snapshot,
        }
    }
}

impl WalkMeta {
    /// The walk's counts, plus how many entries `.gitignore` hid (the path
    /// policy's withheld entries are a warning on every page), how many dot
    /// entries were skipped without `includeHidden`, and which directories
    /// the default prune skipped: their names stay out of the listing, but
    /// their absence is not silent.
    fn summary(&self) -> Value {
        let uncovered = &self.uncovered;
        let mut summary = json!({"files": self.files, "dirs": self.dirs, "bytes": self.bytes});
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

    /// The page's warnings: `cut`'s own (`warnings`), and on the walk's
    /// first page its own (unreadable entries, the path policy's withheld
    /// entries), stated once per walk like the summary: a resumed walk
    /// (`walkOffset`) reports the entries it read. The query's notes read
    /// the same for the whole result: they are notices, said once
    /// ([`crate::tools::paging::push_notice`]).
    fn warn(&self, out: &mut Value, query_notes: Vec<String>, cut: Vec<String>, page: usize) {
        let mut warnings = Vec::new();
        if page == 1 {
            warnings.extend(self.warnings.iter().cloned());
        }
        warnings.extend(cut);
        if page == 1 {
            warnings.extend(self.uncovered.withheld.notice());
        }
        if !warnings.is_empty() {
            out["warnings"] = json!(warnings);
        }
        for note in query_notes {
            crate::tools::paging::push_notice(out, note);
        }
    }
}

/// The walk's skipped-entry warning: how many entries it could not read,
/// and how many of those for want of permission.
fn walk_warnings(s: u32, d: u32) -> Vec<String> {
    if s == 0 {
        return vec![];
    }
    let o = s.saturating_sub(d);
    vec![if d > 0 && o > 0 {
        format!("{s} entries skipped ({d} permission denied, {o} other errors)")
    } else if d > 0 {
        format!(
            "{d} {} skipped due to permission denied",
            if d == 1 { "entry" } else { "entries" }
        )
    } else {
        format!(
            "{s} {} skipped due to access errors",
            if s == 1 { "entry" } else { "entries" }
        )
    }]
}

/// [`note_empty`] for an empty listing: `walk` re-walks the same filters
/// with the skipped paths `relaxed` lets in, within the probe budget.
fn probe_empty<R: Sourced>(
    out: &mut Value,
    query: &impl serde::Serialize,
    at: (&std::path::Path, &crate::policy::path::PathPolicy),
    seen: &Uncovered,
    shown: Walk,
    walk: impl Fn(Walk, Walking<'_>) -> Result<Walked<R>, ToolError>,
) -> Result<(), ToolError> {
    // Every probe of one empty listing shares the one probe budget: an empty
    // listing costs about what a listing does, never a walk of every
    // dependency and build directory.
    let bound = ProbeBound::new(crate::tools::empty_walk::probe_budget());
    note_empty(out, query, at, seen, shown, |relaxed| {
        let found = walk(relaxed, Walking::Probe(&bound))?;
        let cut = found.meta.was_capped || bound.cut();
        Ok(found_entries(
            found.rows.iter().map(|row| row.seen().path.to_path_buf()),
            cut,
        ))
    })
}

/// Query fields that filter by an entry's name or path (both operations'):
/// an empty listing they alone emptied is broadened by dropping them.
const NAME_FILTERS: [&str; 3] = ["include", "extensions", "nameRegex"];

/// An empty listing that skipped nothing worth lifting (no
/// `includeSkipped`) and filtered by name: when the same listing without its
/// name filters (`walk` of the relaxed query, within the probe budget) finds
/// entries below `root` (the listed directory itself is no find), lead to
/// it (`next.broadenSearch`) and say how many it lists, so a name miss gets
/// a runnable next step, never prose alone. `query` names every default the
/// relaxed listing must keep (the walked depth).
fn broaden_empty<Q, R>(
    out: &mut Value,
    query: &Q,
    root: &std::path::Path,
    walk: impl FnOnce(&Q, Walking<'_>) -> Result<Walked<R>, ToolError>,
) -> Result<(), ToolError>
where
    Q: serde::Serialize + serde::de::DeserializeOwned,
    R: Sourced,
{
    if out["status"] != "empty" || out["next"].get("includeSkipped").is_some() {
        return Ok(());
    }
    let row = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    let dropped = NAME_FILTERS
        .into_iter()
        .filter(|field| crate::tools::output::has_value(&row, field))
        .collect::<Vec<_>>();
    if dropped.is_empty() {
        return Ok(());
    }
    let mut changes = json!({"page": 1, "snapshot": null, "walkOffset": null, "scanOffset": null});
    for field in &dropped {
        changes[*field] = Value::Null;
    }
    let lead = continuation(query, changes);
    let Ok(relaxed) = serde_json::from_value::<Q>(lead["query"]["queries"][0].clone()) else {
        return Ok(());
    };
    let bound = ProbeBound::new(crate::tools::empty_walk::probe_budget());
    let found = walk(&relaxed, Walking::Probe(&bound))?;
    let count = found
        .rows
        .iter()
        .filter(|row| row.seen().path != root)
        .count();
    if count == 0 {
        return Ok(());
    }
    let cut = found.meta.was_capped || bound.cut();
    let hint = format!(
        "No entry matches {}; {}{count} {} without {}: the lead lists {}.",
        dropped.join("/"),
        if cut { "at least " } else { "" },
        if count == 1 {
            "entry matches"
        } else {
            "entries match"
        },
        if dropped.len() == 1 { "it" } else { "them" },
        if count == 1 { "it" } else { "them" },
    );
    out["next"]["broadenSearch"] = lead;
    match out["hints"].as_array_mut() {
        Some(hints) => hints.push(json!(hint)),
        None => out["hints"] = json!([hint]),
    }
    Ok(())
}

/// Whether a filtered listing could have listed `path` had the policy
/// admitted it: a directory may hold matches; a file must pass the name
/// filters (include globs, extensions, basename regex) as the walk applies
/// them, in the walk's one glob dialect.
struct FilterProbe {
    names: Option<ignore::gitignore::Gitignore>,
    extensions: Vec<String>,
    regex: Option<regex::Regex>,
}

impl FilterProbe {
    /// The probe of a walk rooted at `root`. A glob or regex that does not
    /// compile fails the call (`invalidGlob`, `invalidPattern`), as the
    /// walk itself does: a filter is never silently dropped.
    fn new(
        root: &std::path::Path,
        include: &[String],
        extensions: &[String],
        name_regex: Option<&str>,
    ) -> Result<Self, ToolError> {
        use octocode_engine::search::glob;
        let names = glob::set(root, include.iter().map(String::as_str), "names")
            .map_err(|error| ToolError::new("invalidGlob", error.to_string()))?;
        let regex = name_regex
            .map(regex::Regex::new)
            .transpose()
            .map_err(|error| {
                ToolError::new(
                    "invalidPattern",
                    format!("Invalid regex for local filesystem query: {error}"),
                )
            })?;
        Ok(Self {
            names,
            extensions: extensions
                .iter()
                .map(|ext| ext.trim().trim_start_matches('.').to_lowercase())
                .filter(|ext| !ext.is_empty())
                .collect(),
            regex,
        })
    }

    /// A directory, or a link to one (the walk follows none), may hold
    /// matches.
    fn could_list(&self, path: &std::path::Path) -> bool {
        if path.is_dir() {
            return true;
        }
        let name = crate::tools::display_name(path);
        let extension = octocode_engine::text::extension_of(&name, true, "");
        self.names
            .as_ref()
            .is_none_or(|names| octocode_engine::search::glob::matches(names, path, false))
            && (self.extensions.is_empty()
                || (!extension.is_empty() && self.extensions.contains(&extension)))
            && self
                .regex
                .as_ref()
                .is_none_or(|regex| regex.is_match(&name))
    }
}

/// Execute one typed row. The runtime parses the validated row with its
/// shared `parse_query`, so a shape mismatch has one code across tools.
pub fn execute_structure(
    query: &StructureSearchQuery,
    paths: &crate::policy::path::PathPolicy,
    security: &crate::security::ContentSecurity,
    cancellation: &dyn crate::tools::cancel::CancellationCheck,
    response_window: Option<usize>,
) -> StructureResult {
    execute_structure_within(
        query,
        paths,
        security,
        cancellation,
        response_window,
        WALK_BUDGET,
    )
}

/// [`execute_structure`] with the listing walk's time budget named.
fn execute_structure_within(
    query: &StructureSearchQuery,
    paths: &crate::policy::path::PathPolicy,
    security: &crate::security::ContentSecurity,
    cancellation: &dyn crate::tools::cancel::CancellationCheck,
    response_window: Option<usize>,
    budget: std::time::Duration,
) -> StructureResult {
    match query {
        StructureSearchQuery::Tree(query) => tree::execute_tree(
            query,
            paths,
            security,
            cancellation,
            response_window,
            budget,
        ),
        StructureSearchQuery::Files(query) => files::execute_files(
            query,
            paths,
            security,
            cancellation,
            response_window,
            budget,
        ),
    }
}

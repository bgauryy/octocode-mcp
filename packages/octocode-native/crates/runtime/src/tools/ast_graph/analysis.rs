use super::{algorithms::*, graph::normalize, liveness::*, page::*, types::*};
use crate::tools::id::ToolId;
use crate::tools::id::query_limits::ast_topology::{DIAGNOSTIC_PAGE_MAXIMUM, PAGE_MAXIMUM};
use crate::tools::leads::find_file::find_file;
use crate::tools::result::Continuation;
use crate::tools::result::ToolError;
use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};
use octocode_engine::graph::FileEdge;
use serde_json::{Map, Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

pub(crate) fn analyze(
    b: &BuiltGraph,
    display_path: &str,
    q: &AstTopologyQuery,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
) -> AstGraphResult {
    let read = |path: &std::path::Path| super::aliases::read_config_text(paths, security, path);
    cancel.check().map_err(ToolError::cancelled)?;
    let mut cuts = ScanCuts::of(b);
    let mut warnings = cuts.warnings(q);
    let mut base = Map::new();
    base.insert("operation".into(), json!("topology"));
    base.insert("path".into(), json!(display_path));
    base.insert("filesScanned".into(), json!(b.facts.len()));
    insert_supersedes(&mut base, q, &mut warnings);
    let pending_endpoint = unscanned_endpoint(b, q, paths);
    let (items, mut summary, extra_warnings, mut low) = if let Some(field) = pending_endpoint {
        (
            vec![],
            json!({}),
            vec![format!(
                "{field} exists under path but was not parsed before maxFiles; this bounded graph cannot answer the query yet."
            )],
            true,
        )
    } else {
        match q.analysis() {
            GraphAnalysis::Dependencies | GraphAnalysis::Dependents => traversal(b, q)?,
            GraphAnalysis::Path => path_analysis(b, q)?,
            GraphAnalysis::Cycles => cycles(b),
            GraphAnalysis::Reachability => reachability(b, q, &read),
            GraphAnalysis::DeadCode => dead_code(b, q, &read),
            GraphAnalysis::Drift => {
                return Err(ToolError::new(
                    "invalidGraphQuery",
                    "drift is dispatched before analyze",
                ));
            }
        }
    };
    warnings.extend(extra_warnings);
    drop_repeated_summary_lists(&mut summary, q);
    // Only the gaps that can change this answer mark it; the scan's tallies
    // stay in `coverage`.
    let reach = super::scope::Reach::of(b, q, &items);
    let relevant = reach.diagnostics(b);
    cuts.files_skipped = cuts.files_skipped && reach.reaches_skipped(b, &relevant);
    let gaps = CoverageGaps::of(&relevant);
    // Import-resolution health drives whether an edge-derived answer can be
    // trusted, so an incomplete import graph never presents as a confident
    // zero (e.g. `cycleCount:0` when no `crate::` import could be resolved).
    // It only ever escalates to low.
    if gaps.unresolved || gaps.unsupported {
        low = true;
        if let Some(obj) = summary.as_object_mut() {
            let resolved = b.imports[0];
            obj.insert(
                "importResolution".into(),
                json!({
                    "status": if resolved == 0 { "failed" } else { "partial" },
                    "resolved": resolved,
                    "unresolvedInternal": b.imports[2],
                    "unsupported": b.imports[3],
                }),
            );
        }
    }
    let results_digest = crate::digest::json_sha256(&items);
    // A suppressed verdict (no entrypoint resolved) proves nothing either
    // way: a partial answer that names why, never an empty one.
    let suppressed = summary["suppressed"] == true;
    let answer_empty = pending_endpoint.is_none() && !suppressed && answer_is_empty(&items);
    let (page, pagination) = paginate(items, q);
    base.insert("nodes".into(), Value::Array(page));
    base.insert("pagination".into(), pagination);
    base.insert("graphSummary".into(), summary);
    if !warnings.is_empty() {
        base.insert("warnings".into(), json!(warnings));
    }
    if low {
        base.insert("confidence".into(), json!("low"));
    }
    let coverage_state = add_coverage(&mut base, b, q, &results_digest);
    let result_page_limit = mark_scope_cuts(&mut base, cuts, q, coverage_state.changed);
    if suppressed {
        crate::tools::paging::mark_partial(&mut base, "entrypointsUnresolved", &[]);
    }
    // A diagnostic page reached from a lead (it carries the snapshot) shows
    // the diagnostics only: its results were delivered by the offering page.
    let diagnostics_only = q.diagnostic_rows_requested() && q.diagnostic_snapshot().is_some();
    if diagnostics_only && !coverage_state.changed {
        keep_diagnostics_only(&mut base);
    }
    if answer_empty && !diagnostics_only {
        mark_empty(&mut base);
    }
    if !coverage_state.changed {
        add_next(
            &mut base,
            q,
            &b.root,
            cuts.widenable() && !diagnostics_only,
            &coverage_state,
        );
        if let Some(read) = read_lead(b, q, &base) {
            let mut next = Map::new();
            next.insert("read".into(), read);
            if let Some(Value::Object(rest)) = base.shift_remove("next") {
                next.extend(rest);
            }
            base.insert("next".into(), Value::Object(next));
        }
    }
    let result_state = if diagnostics_only {
        "complete"
    } else if suppressed {
        "entrypoints-unresolved"
    } else if result_page_limit {
        "truncated"
    } else if base["pagination"]["hasMore"] == true {
        "pageable"
    } else if cuts.graph_cut() {
        "truncated"
    } else {
        "complete"
    };
    add_completeness(&mut base, cuts, result_state, &gaps.reasons());
    base.insert("operation".into(), json!(q.analysis().as_str()));
    Ok(Value::Object(base))
}

fn unscanned_endpoint(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    paths: &PathPolicy,
) -> Option<&'static str> {
    if !b.truncated {
        return None;
    }
    for (field, raw) in [("source", q.source()), ("target", q.target())] {
        let Some(raw) = raw else { continue };
        let key = node_key(raw, &b.root, &b.nodes);
        if !b.nodes.contains_key(&key)
            && paths
                .validate(b.root.join(key))
                .is_ok_and(|path| path.canonical.starts_with(&b.root) && path.canonical.is_file())
        {
            return Some(field);
        }
    }
    None
}

/// The resolved root and dynamic-only lists are page-invariant: emit them
/// with the first result page only; later pages keep the counts. Explicit
/// entrypoints that all resolved are an echo of the request: the count
/// stays, the list is kept only when it adds information (inferred roots,
/// or some explicit root did not resolve).
pub(super) fn drop_repeated_summary_lists(summary: &mut Value, q: &AstTopologyQuery) {
    let Some(obj) = summary.as_object_mut() else {
        return;
    };
    if q.page() > 1 {
        obj.remove("entrypointsResolved");
        obj.remove("dynamicOnlyFiles");
    }
    // The traversal's resolved source echoes the query's when spelled alike.
    if q.source().is_some() && obj.get("source").and_then(Value::as_str) == q.source() {
        obj.remove("source");
    }

    if let Some(explicit) = q.entrypoints().filter(|x| !x.is_empty())
        && obj.get("entrypointsResolvedCount").and_then(Value::as_u64)
            == Some(explicit.len() as u64)
    {
        obj.remove("entrypointsResolved");
    }
}

/// Coverage gaps of the linked graph that reach the answer. They are not
/// truncation: every page
/// is still reachable, so they surface only as `coverage.parts.graph` plus
/// `confidence`; each gap's count is in `coverage`.
pub(super) struct CoverageGaps {
    parse: bool,
    unresolved: bool,
    unsupported: bool,
}

impl CoverageGaps {
    fn of(diagnostics: &[&Diagnostic]) -> Self {
        let has = |code: &str| diagnostics.iter().any(|d| d.code == code);
        Self {
            parse: has("parse-recovery"),
            unresolved: has("unresolved-internal"),
            unsupported: has("unsupported-linking"),
        }
    }
    fn reasons(&self) -> Vec<&'static str> {
        [
            (self.parse, "parseRecovery"),
            (self.unresolved, "unresolvedImports"),
            (self.unsupported, "unsupportedLinking"),
        ]
        .into_iter()
        .filter_map(|(present, reason)| present.then_some(reason))
        .collect()
    }
}

/// Real scope cuts (result page ceiling, file-scan bound, edge cap, skipped
/// files):
/// `isPartial` with `partialReasons`, and `terminalLimit` when no
/// continuation can reach the rest. Returns whether the result page
/// ceiling was hit.
pub(super) fn mark_scope_cuts(
    base: &mut Map<String, Value>,
    cuts: ScanCuts,
    q: &AstTopologyQuery,
    snapshot_changed: bool,
) -> bool {
    let mut reasons = cuts.reasons();
    let mut warnings = Vec::new();
    let past = |field: &str, current: u32| {
        crate::tools::paging::admitted(ToolId::AstTopology, None, field, current as usize + 1)
            .is_none()
    };
    let result_page_limit =
        !snapshot_changed && base["pagination"]["hasMore"] == true && past("page", q.page());
    let diagnostic_page_limit = !snapshot_changed
        && base["coverage"]["diagnosticPagination"]["hasMore"] == true
        && past("diagnosticPage", q.diagnostic_page());
    if result_page_limit {
        reasons.push("pageLimit");
        warnings.push(page_ceiling_warning("result", PAGE_MAXIMUM));
    }
    if diagnostic_page_limit {
        base["coverage"]["diagnosticPagination"]["terminalLimit"] = json!(true);
        reasons.push("diagnosticPageLimit");
        warnings.push(page_ceiling_warning("diagnostic", DIAGNOSTIC_PAGE_MAXIMUM));
    }
    let terminal = result_page_limit || diagnostic_page_limit || cuts.terminal(q);
    mark_cuts(base, &reasons, warnings, terminal);
    result_page_limit
}

/// Marks `base` partial for each cut in `reasons` (a skipped file is named
/// once: the reason says the scan is partial and the coverage diagnostics
/// name the file and why), adds each warning once, and ends the row at a
/// terminal limit when no continuation reaches the rest.
pub(super) fn mark_cuts(
    base: &mut Map<String, Value>,
    reasons: &[&str],
    warnings: Vec<String>,
    terminal: bool,
) {
    for reason in reasons {
        crate::tools::paging::mark_partial(&mut *base, reason, &[]);
    }
    crate::tools::paging::push_warnings(&mut *base, warnings);
    if terminal && let Some(reason) = reasons.last() {
        crate::tools::paging::terminal_limit(base, reason, &[]);
    }
}

/// A diagnostic page keeps its diagnostics and their pagination only.
pub(super) fn keep_diagnostics_only(base: &mut Map<String, Value>) {
    base.insert("nodes".into(), json!([]));
    base.shift_remove("pagination");
    base.shift_remove("graphSummary");
    if let Some(coverage) = base.get_mut("coverage").and_then(Value::as_object_mut) {
        coverage.retain(|key, _| matches!(key.as_str(), "diagnostics" | "diagnosticPagination"));
    }
}

/// Complete is the default: the block names only the states that are not,
/// plus the coverage gaps. Withheld diagnostic rows are an opt-in lead, not
/// a remaining page.
pub(super) fn add_completeness(
    base: &mut Map<String, Value>,
    cuts: ScanCuts,
    result_state: &str,
    gaps: &[&str],
) {
    let graph_state = if let Some(state) = cuts.graph_state() {
        state
    } else if !gaps.is_empty() {
        "coverage-incomplete"
    } else {
        "complete"
    };
    let diag_state = if base["coverage"]["diagnosticPagination"]["terminalLimit"] == true {
        "truncated"
    } else if base["coverage"]["diagnosticPagination"]["hasMore"] == true {
        "pageable"
    } else {
        "complete"
    };
    let mut completeness = Map::new();
    for (key, state) in [
        ("nodes", result_state),
        ("graph", graph_state),
        ("diagnostics", diag_state),
    ] {
        if state != "complete" {
            completeness.insert(key.into(), json!(state));
        }
    }
    state_coverage(base, completeness);
}

/// Stamps the one coverage vocabulary on the row: `coverage.state` is
/// `complete` or `partial`; `parts` names each part (results, graph,
/// diagnostics) that is not complete, with its state, and `reason` says it
/// in one line.
pub(super) fn state_coverage(base: &mut Map<String, Value>, parts: Map<String, Value>) {
    let coverage = base.entry("coverage").or_insert_with(|| json!({}));
    let Some(coverage) = coverage.as_object_mut() else {
        return;
    };
    if parts.is_empty() {
        coverage.insert("state".into(), json!("complete"));
        return;
    }
    let reason = parts
        .iter()
        .map(|(part, state)| format!("{part}: {}", state.as_str().unwrap_or_default()))
        .collect::<Vec<_>>()
        .join("; ");
    coverage.insert("state".into(), json!("partial"));
    coverage.insert("reason".into(), json!(reason));
    coverage.insert("parts".into(), Value::Object(parts));
}

/// Whether an operation's answer rows say nothing was found: no rows, or only
/// rows that report a miss (`found:false`, a path that does not exist).
pub(super) fn answer_is_empty(items: &[Value]) -> bool {
    items.iter().all(|row| row["found"] == json!(false))
}

/// An empty answer is an empty result, as a search with no match is: every
/// interface reports it as such (CLI exit 1) and the row carries a recovery
/// that names the operation.
pub(super) fn mark_empty(base: &mut Map<String, Value>) {
    base.insert("status".into(), json!("empty"));
}

pub(super) fn traversal(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
) -> Result<(Vec<Value>, Value, Vec<String>, bool), ToolError> {
    let raw = q.source().ok_or_else(|| {
        ToolError::new(
            "invalidGraphQuery",
            format!("{} requires source", q.analysis().as_str()),
        )
    })?;
    let file = node_key(raw, &b.root, &b.nodes);
    if !b.nodes.contains_key(&file) {
        return Err(missing_file_error(q, "source", &file, &b.nodes));
    }
    let graph = if q.analysis() == GraphAnalysis::Dependencies {
        b.nodes.clone()
    } else {
        reverse(&b.nodes)
    };
    let c = condense(&graph);
    let layers = layer_map(&c);
    let trans = find_transitive(&c);
    let indegree = in_degree(&b.nodes);
    let depth = q.depth().unwrap_or(1);
    let idoms = (depth > 1).then(|| dominators(&graph, &file));
    let mut items = traverse(&graph, &file, depth);
    if q.analysis() == GraphAnalysis::Dependents {
        let listed = items
            .iter()
            .filter_map(|item| item["file"].as_str().map(str::to_owned))
            .collect::<BTreeSet<_>>();
        for (importer, module, line) in reexport_dependents(b, &file) {
            if importer == file || listed.contains(&importer) {
                continue;
            }
            let kinds = b
                .nodes
                .get(&importer)
                .and_then(|node| node.edges.get(&module))
                .cloned()
                .unwrap_or_default();
            // The import naming the re-exported item, not the first import
            // from the re-exporting module.
            items.push(json!({"file":importer,"distance":1,"via":module,"reexportVia":module,"edgeKinds":kinds,"importLine":line,"confidence":"syntactic"}));
        }
    }
    for item in &mut items {
        let Some(f) = item["file"].as_str().map(str::to_owned) else {
            continue;
        };
        let Some(via) = item["via"].as_str().map(str::to_owned) else {
            continue;
        };
        let (importer, imported) = if q.analysis() == GraphAnalysis::Dependencies {
            (via.as_str(), f.as_str())
        } else {
            (f.as_str(), via.as_str())
        };
        if item.get("importLine").is_none()
            && let Some(line) = first_import_line(b, importer, imported)
        {
            item["importLine"] = json!(line)
        }
        item["inboundCount"] = json!(indegree.get(&f).copied().unwrap_or(0));
        item["immediateDominator"] = json!(if depth == 1 {
            Some(file.clone())
        } else {
            idoms.as_ref().and_then(|d| d.get(&f).cloned().flatten())
        });
        let a = c.component.get(&via).copied();
        let z = c.component.get(&f).copied();
        if let Some(z) = z {
            item["topologicalLayer"] = json!(layers.get(&z));
        }
        item["transitiveEdge"] = json!(a.zip(z).is_some_and(|e| trans.contains(&e)));
    }
    let summary = json!({"source":file,"condensationComponentCount":c.components.len(),"topologicalLayerCount":c.layers.len(),"transitiveEdgeCount":trans.len()});
    let warnings = if q.analysis() == GraphAnalysis::Dependents {
        unlinked_importer_warning(b, &file).into_iter().collect()
    } else {
        vec![]
    };
    Ok((items, summary, warnings, false))
}

/// A bare import no resolver linked (it needs a tsconfig `paths`/`baseUrl`
/// that does not cover the importer) is not a dependent edge, yet its
/// specifier can name `target` by path: `vs/base/common/x` for
/// `src/vs/base/common/x.ts`. Those importers are stated, not omitted, so the
/// answer never silently lacks a file a text search finds.
fn unlinked_importer_warning(b: &BuiltGraph, target: &str) -> Option<String> {
    let mut named = Vec::new();
    for (importer, facts) in &b.facts {
        if !is_js_ts(importer) {
            continue;
        }
        for import in &facts.imports {
            if import.target.is_none() && specifier_names_file(&import.specifier, target) {
                named.push(format!(
                    "{importer}:{} ({:?})",
                    import.line, import.specifier
                ));
            }
        }
    }
    (!named.is_empty()).then(|| {
        format!(
            "{} import(s) name {target} by a bare path no tsconfig paths/baseUrl links, so they are not dependents above: {}",
            named.len(),
            named.join(", ")
        )
    })
}

pub(super) fn is_js_ts(file: &str) -> bool {
    octocode_engine::text::JS_TS_EXTENSIONS
        .contains(&octocode_engine::text::extension_of(file, true, "").as_str())
}

/// `path` without its JS/TS extension.
pub(super) fn module_stem(path: &str) -> &str {
    let extension = octocode_engine::text::extension_of(path, false, "");
    if octocode_engine::text::JS_TS_EXTENSIONS.contains(&extension.to_lowercase().as_str()) {
        path.strip_suffix(extension.as_str())
            .and_then(|stem| stem.strip_suffix('.'))
            .unwrap_or(path)
    } else {
        path
    }
}

/// Whether a bare, multi-segment specifier is a trailing path of `file`
/// (the file itself, or the directory whose `index` it is).
fn specifier_names_file(specifier: &str, file: &str) -> bool {
    if specifier.starts_with(['.', '/']) || !specifier.contains('/') {
        return false;
    }
    let specifier = module_stem(specifier.trim_end_matches('/'));
    let stem = module_stem(file);
    [Some(stem), stem.strip_suffix("/index")]
        .into_iter()
        .flatten()
        .any(|module| {
            module == specifier
                || module
                    .strip_suffix(specifier)
                    .is_some_and(|rest| rest.ends_with('/'))
        })
}

/// Files that use `target`'s items through a module re-exporting them:
/// `sync/mod.rs` has `pub use notify::Notify` and `sync/broadcast.rs` has
/// `use super::Notify`. A module re-exports what it imports or re-exports
/// from `target` (`export * from` and `pub use x::*` re-export every public
/// name); an importer of that module counts only when it names one of those
/// items, so importers of other items of a hub module are not dependents.
/// Returns `(importer, re-exporting module, line of the import naming the
/// item)` in file order.
pub(super) fn reexport_dependents(b: &BuiltGraph, target: &str) -> Vec<(String, String, u32)> {
    let public = || {
        b.facts
            .get(target)
            .into_iter()
            .flat_map(|facts| &facts.declarations)
            .filter(|declaration| declaration.exported)
            .flat_map(|declaration| declaration.public_names().iter().cloned())
            .collect::<BTreeSet<_>>()
    };
    let mut modules = BTreeMap::<&str, BTreeSet<String>>::new();
    for (module, facts) in &b.facts {
        if module == target {
            continue;
        }
        for import in facts
            .imports
            .iter()
            .filter(|import| import.target.as_deref() == Some(target))
        {
            let names = modules.entry(module).or_default();
            if import.imported_name == "*" {
                names.extend(public());
            } else if !import.imported_name.is_empty() {
                names.insert(
                    import
                        .local_name
                        .clone()
                        .unwrap_or_else(|| import.imported_name.clone()),
                );
            }
        }
        for reexport in facts
            .reexports
            .iter()
            .filter(|reexport| reexport.target.as_deref() == Some(target))
        {
            modules
                .entry(module)
                .or_default()
                .insert(reexport.local_name.clone());
        }
    }
    for module in b.star_reexporters.get(target).into_iter().flatten() {
        if module != target {
            modules.entry(module).or_default().extend(public());
        }
    }
    let mut out = Vec::new();
    for (importer, facts) in &b.facts {
        if importer == target {
            continue;
        }
        let module = facts.imports.iter().find_map(|import| {
            let module = import.target.as_deref()?;
            (module != importer.as_str()
                && modules
                    .get(module)
                    .is_some_and(|names| names.contains(&import.imported_name)))
            .then_some((module, import.line))
        });
        if let Some((module, line)) = module {
            out.push((importer.clone(), module.to_owned(), line));
        }
    }
    out
}

pub(super) fn path_analysis(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
) -> Result<(Vec<Value>, Value, Vec<String>, bool), ToolError> {
    let required = || ToolError::new("invalidGraphQuery", "path requires source and target");
    let file = node_key(q.source().ok_or_else(required)?, &b.root, &b.nodes);
    let target = node_key(q.target().ok_or_else(required)?, &b.root, &b.nodes);
    for (field, key) in [("source", &file), ("target", &target)] {
        if !b.nodes.contains_key(key) {
            return Err(missing_file_error(q, field, key, &b.nodes));
        }
    }
    let mut found = shortest_path(&b.nodes, &file, &target);
    if let Some(edges) = found["edges"].as_array_mut() {
        for edge in edges {
            if let (Some(from), Some(to)) = (edge["from"].as_str(), edge["to"].as_str())
                && let Some(line) = first_import_line(b, from, to)
            {
                edge["importLine"] = json!(line);
            }
        }
    }
    Ok((
        vec![found],
        json!({"source":file,"target":target}),
        vec![],
        false,
    ))
}

/// What a witness is: one cycle through a strongly connected group, naming
/// how many of the group's `of` files it passes, not every edge of the group.
fn witness_label(witness: &[FileEdge], of: usize) -> Value {
    let files = witness
        .iter()
        .flat_map(|edge| [edge.from.as_str(), edge.to.as_str()])
        .collect::<BTreeSet<_>>()
        .len();
    json!({"kind":"witness","files":files,"of":of})
}

pub(super) fn cycles(b: &BuiltGraph) -> (Vec<Value>, Value, Vec<String>, bool) {
    // A module tree is not a dependency cycle: `mod x;` plus the child's use
    // of its ancestor (`use super::…`) loop by construction. Cycles are found
    // on the use graph without those edges; the loops they alone close are
    // counted, not listed.
    let uses = dependency_graph(&b.nodes);
    let c = condense(&uses);
    let layers = layer_map(&c);
    let trans = find_transitive(&c);
    let runtime = runtime_graph(&uses);
    let runtime_cycles = scc(&runtime, true);
    let file_witnesses = CycleWitnesses::new(&uses);
    let runtime_witnesses = CycleWitnesses::new(&runtime);
    let mut items = Vec::new();
    for (id, files) in c.components.iter().enumerate() {
        if files.len() == 1 && !uses[&files[0]].edges.contains_key(&files[0]) {
            continue;
        }
        let members = files.iter().cloned().collect::<BTreeSet<_>>();
        let contained = runtime_cycles
            .iter()
            .filter(|x| x.iter().all(|f| members.contains(f)))
            .cloned()
            .collect::<Vec<_>>();
        let outgoing = c
            .edges
            .get(&id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .collect::<Vec<_>>();
        // Small facts first and `files` last: a cycle too large for one
        // response page shows its counts and runtime cycles before its files.
        let mut item = json!({"componentId":id,"fileCount":files.len(),"runtimeCycleCount":contained.len(),"runtimeCycle":!contained.is_empty()});
        if !contained.is_empty() {
            item["runtimeGroups"] = json!(
                contained
                    .iter()
                    .map(|group| json!({"fileCount":group.len(),"files":group}))
                    .collect::<Vec<_>>()
            );
            let witness = runtime_witnesses.witness(&members);
            let largest = contained.iter().map(Vec::len).max().unwrap_or_default();
            item["runtimeCycleEdgesShown"] = witness_label(&witness, largest);
            item["runtimeCycleEdges"] = json!(witness_edges(witness));
        }
        let witness = file_witnesses.witness(&members);
        item["cycleEdgesShown"] = witness_label(&witness, files.len());
        item["cycleEdges"] = json!(witness_edges(witness));
        item["edgeKinds"] = json!(collect_kinds(&uses, files));
        item["topologicalLayer"] = json!(layers.get(&id));
        item["outgoingComponents"] = json!(outgoing);
        item["confidence"] = json!("syntactic");
        item["files"] = json!(files);
        items.push(item);
    }
    let rc = items.iter().filter(|x| x["runtimeCycle"] == true).count();
    let ce = c.edges.values().map(BTreeSet::len).sum::<usize>();
    let count = items.len();
    let mut summary = json!({"cycleCount":count,"runtimeCycleCount":rc,"condensationComponentCount":c.components.len(),"condensationEdgeCount":ce,"topologicalLayerCount":c.layers.len(),"transitiveEdgeCount":trans.len()});
    let in_use_cycle = items
        .iter()
        .filter_map(|item| item["files"].as_array())
        .flatten()
        .filter_map(Value::as_str)
        .collect::<BTreeSet<_>>();
    let module_tree = scc(&b.nodes, true)
        .iter()
        .filter(|files| !files.iter().any(|f| in_use_cycle.contains(f.as_str())))
        .count();
    if module_tree > 0 {
        summary["moduleTreeCycleCount"] = json!(module_tree);
    }
    (items, summary, vec![], false)
}

/// `file` (the query's `field`: `source` or `target`) resolves relative to
/// the scanned `path`; name that rule and, when a scanned file shares the
/// requested suffix, the spelling that would match.
pub(super) fn missing_file_message(
    field: &str,
    file: &str,
    nodes: &BTreeMap<String, Node>,
) -> String {
    let mut message = format!(
        "{field} is not in the scanned graph: {file}. `{field}` is relative to `path` \
         (or absolute under it), and must be a scanned source file"
    );
    if let Some(candidate) = suffix_candidate(file, nodes) {
        message.push_str(&format!("; did you mean `{candidate}`?"));
    }
    message
}

pub(super) fn suffix_candidate<'a>(
    file: &str,
    nodes: &'a BTreeMap<String, Node>,
) -> Option<&'a String> {
    let suffix = format!("/{file}");
    nodes
        .keys()
        .find(|key| key.ends_with(&suffix) || file.ends_with(&format!("/{key}")))
}

/// The missing-file error, with an executable `hints.retrySuffixMatch` on
/// the suffix candidate when one exists, else a `hints.findFile` listing of
/// files named like the one asked for (another query: a lead, not a page).
pub(super) fn missing_file_error(
    q: &AstTopologyQuery,
    field: &str,
    file: &str,
    nodes: &BTreeMap<String, Node>,
) -> ToolError {
    let mut error = ToolError::new(
        "invalidGraphQuery",
        missing_file_message(field, file, nodes),
    );
    if let Some(candidate) = suffix_candidate(file, nodes) {
        let mut query = clean_query(q);
        query[field] = json!(candidate);
        error.next = Some(Box::new(json!({
            "retrySuffixMatch": Continuation::new(ToolId::AstTopology, query)
                .confidence("medium")
                .build()
        })));
    } else if let Some(listing) = find_file(q.path().unwrap_or("."), file) {
        error.next = Some(Box::new(json!({ "findFile": listing })));
    }
    error
}

/// A graph key for `raw`: relative to the scanned root, or absolute under it.
/// A workspace-relative spelling of a file under the root (leading components
/// that name the root's own tail) resolves to the same key.
pub(super) fn node_key(raw: &str, root: &Path, nodes: &BTreeMap<String, Node>) -> String {
    let key = graph_file(raw, root);
    if nodes.contains_key(&key) || Path::new(raw).is_absolute() {
        return key;
    }
    let parts = key.split('/').collect::<Vec<_>>();
    (1..parts.len())
        .find_map(|split| {
            let (prefix, rest) = parts.split_at(split);
            let rest = rest.join("/");
            (root.ends_with(prefix.join("/")) && nodes.contains_key(&rest)).then_some(rest)
        })
        .unwrap_or(key)
}

pub(super) fn graph_file(f: &str, root: &Path) -> String {
    let p = Path::new(f);
    if p.is_absolute() {
        let canonical = fs::canonicalize(p).ok();
        canonical
            .as_deref()
            .unwrap_or(p)
            .strip_prefix(root)
            .ok()
            .map(|x| normalize(&x.to_string_lossy()))
            .unwrap_or_else(|| normalize(f))
    } else {
        normalize(f)
    }
}
/// The first import (or, failing one, re-export) statement in `importer`
/// that links `target`.
pub(super) fn first_import_line(b: &BuiltGraph, importer: &str, target: &str) -> Option<u32> {
    let facts = b.facts.get(importer)?;
    facts
        .imports
        .iter()
        .find(|i| i.target.as_deref() == Some(target))
        .map(|i| i.line)
        .or_else(|| {
            facts
                .reexport_lines
                .iter()
                .filter(|(linked, _)| linked == target)
                .map(|(_, line)| *line)
                .min()
        })
        // A qualified path (`crate::b::f()`) is its own evidence line.
        .or_else(|| {
            facts
                .calls
                .iter()
                .filter(|call| call.target.as_deref() == Some(target))
                .map(|call| call.line)
                .min()
        })
}
#[cfg(test)]
mod tests {
    use super::*;

    fn node(edges: &[&str]) -> Node {
        Node {
            edges: edges
                .iter()
                .map(|target| {
                    (
                        (*target).to_owned(),
                        BTreeSet::from(["static-import".to_owned()]),
                    )
                })
                .collect(),
            dynamic_only: BTreeSet::new(),
        }
    }

    #[cfg(unix)]
    #[test]
    fn graph_file_resolves_absolute_paths_through_symlinked_roots() {
        let temp = tempfile::tempdir().expect("temporary workspace");
        let root = temp.path().join("actual");
        fs::create_dir(&root).expect("source directory");
        fs::write(root.join("entry.ts"), "export const entry = 1;").expect("source file");
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&root, &alias).expect("workspace alias");
        let canonical_root = fs::canonicalize(&root).expect("canonical root");

        assert_eq!(
            graph_file(&alias.join("entry.ts").to_string_lossy(), &canonical_root),
            "entry.ts"
        );
        assert_eq!(
            graph_file(&root.join("entry.ts").to_string_lossy(), &canonical_root),
            "entry.ts"
        );
        assert_eq!(graph_file("entry.ts", &canonical_root), "entry.ts");
        assert_eq!(
            graph_file(
                &canonical_root.join("missing.ts").to_string_lossy(),
                &canonical_root
            ),
            "missing.ts"
        );
    }

    #[test]
    fn diagnostic_continuation_stays_on_ast_topology() {
        let query: AstTopologyQuery = serde_json::from_value(json!({
            "mainGoal": "test", "reasoning":"test",
            "operation":"dependencies",
            "path":".",
            "source":"src/index.ts",
            "diagnosticPageSize":2
        }))
        .expect("graph query");
        let mut result = json!({
            "pagination":{"hasMore":false},
            "coverage":{"diagnosticPagination":{
                "hasMore":true,
                "outOfRange":false,
                "resultId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            }},
            "nodes":[]
        })
        .as_object()
        .cloned()
        .expect("result object");

        add_next(
            &mut result,
            &query,
            Path::new("/repo"),
            false,
            &CoverageState::default(),
        );

        assert_eq!(result["next"]["nextDiagnosticPage"]["tool"], "astTopology");
        assert_eq!(
            result["next"]["nextDiagnosticPage"]["query"]["queries"][0]["operation"],
            "dependencies"
        );
        assert_eq!(
            result["next"]["nextDiagnosticPage"]["query"]["queries"][0]["diagnosticSnapshot"],
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );

        // Counts-only default: withheld rows are an opt-in lead to page 1 of
        // the same snapshot.
        let mut counts_only = json!({"pagination":{"hasMore":false},"coverage":{},"nodes":[]})
            .as_object()
            .cloned()
            .expect("result object");
        add_next(
            &mut counts_only,
            &query,
            Path::new("/repo"),
            false,
            &CoverageState {
                withheld: Some(
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                ),
                ..CoverageState::default()
            },
        );
        assert!(counts_only["next"].get("nextDiagnosticPage").is_none());
        let offered = &counts_only["next"]["readDiagnostics"]["query"]["queries"][0];
        assert_eq!(offered["diagnosticPage"], 1);
        assert_eq!(offered["diagnosticPageSize"], 2);
        assert_eq!(
            offered["diagnosticSnapshot"],
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        );
    }

    #[test]
    fn every_diagnostic_row_lists_its_occurrences_as_files() {
        let diagnostic = |file: &str, line: Option<u32>, message: &str| Diagnostic {
            file: file.into(),
            line,
            code: "unsupported-linking".into(),
            message: message.into(),
        };
        let rows = group_diagnostics(&[
            diagnostic("a.rs", Some(3), "macro"),
            diagnostic("b.rs", None, "macro"),
            diagnostic("c.rs", Some(9), "other"),
        ]);
        assert_eq!(
            rows,
            vec![
                json!({"code":"unsupported-linking","message":"macro","files":["a.rs:3","b.rs"]}),
                json!({"code":"unsupported-linking","message":"other","files":["c.rs:9"]}),
            ]
        );
    }

    #[test]
    fn immediate_dominators_use_the_complete_reachable_diamond() {
        let graph = BTreeMap::from([
            ("entry.ts".into(), node(&["left.ts", "right.ts"])),
            ("left.ts".into(), node(&["shared.ts"])),
            ("right.ts".into(), node(&["shared.ts"])),
            ("shared.ts".into(), node(&["deep.ts"])),
            ("deep.ts".into(), node(&[])),
        ]);
        let actual = dominators(&graph, "entry.ts");
        assert_eq!(actual["left.ts"].as_deref(), Some("entry.ts"));
        assert_eq!(actual["right.ts"].as_deref(), Some("entry.ts"));
        assert_eq!(actual["shared.ts"].as_deref(), Some("entry.ts"));
        assert_eq!(actual["deep.ts"].as_deref(), Some("shared.ts"));
    }

    #[test]
    fn workspace_relative_files_under_path_resolve_and_misses_get_a_repair() {
        let root = Path::new("/ws/packages/pkg");
        let nodes = BTreeMap::from([("src/index.ts".into(), node(&[]))]);
        for spelling in [
            "src/index.ts",
            "pkg/src/index.ts",
            "packages/pkg/src/index.ts",
        ] {
            assert_eq!(
                node_key(spelling, root, &nodes),
                "src/index.ts",
                "{spelling}"
            );
        }
        assert_eq!(
            node_key("other/src/index.ts", root, &nodes),
            "other/src/index.ts"
        );

        let query: AstTopologyQuery = serde_json::from_value(json!({
            "mainGoal": "test", "reasoning":"test",
            "operation":"dependencies",
            "path":"packages/pkg",
            "source":"lib/src/index.ts"
        }))
        .expect("graph query");
        let error = missing_file_error(&query, "source", "lib/src/index.ts", &nodes);
        let next = error.next.expect("repair continuation");
        assert_eq!(next["retrySuffixMatch"]["tool"], "astTopology", "{next}");
        assert_eq!(
            next["retrySuffixMatch"]["query"]["queries"][0]["source"], "src/index.ts",
            "{next}"
        );
        assert_eq!(
            next["retrySuffixMatch"]["query"]["queries"][0]["path"], "packages/pkg",
            "{next}"
        );
    }

    /// Without a suffix match the error still carries a runnable lead: the
    /// scanned directory's files named like the one asked for.
    #[test]
    fn a_missing_file_without_a_suffix_match_leads_to_a_listing() {
        let nodes = BTreeMap::from([("src/index.ts".into(), node(&[]))]);
        let query: AstTopologyQuery = serde_json::from_value(json!({
            "mainGoal": "test", "reasoning":"test",
            "operation":"dependents",
            "path":"packages/pkg",
            "source":"lib/missing.ts"
        }))
        .expect("graph query");
        let error = missing_file_error(&query, "source", "lib/missing.ts", &nodes);
        let next = error.next.expect("listing lead");
        assert!(next.get("retrySuffixMatch").is_none(), "{next}");
        let row = &next["findFile"]["query"]["queries"][0];
        assert_eq!(next["findFile"]["tool"], "structureSearch", "{next}");
        assert_eq!(row["operation"], "files", "{next}");
        assert_eq!(row["path"], "packages/pkg", "{next}");
        assert_eq!(row["include"], json!(["missing.*"]), "{next}");
    }

    #[test]
    fn missing_file_names_the_path_relative_rule_and_a_suffix_match() {
        let graph = BTreeMap::from([("src/index.ts".into(), node(&[]))]);
        let message = missing_file_message("source", "index.ts", &graph);
        assert!(message.contains("relative to `path`"), "{message}");
        assert!(message.contains("did you mean `src/index.ts`"), "{message}");
        let message = missing_file_message("source", "pkg/src/index.ts", &graph);
        assert!(message.contains("did you mean `src/index.ts`"), "{message}");
        assert!(!missing_file_message("source", "other.ts", &graph).contains("did you mean"));
    }
}

//! astTopology drift: the diff between a stored graph and the current one.

use super::{page::*, types::*};
use crate::tools::id::query_limits::ast_topology::PAGE_MAXIMUM;
use crate::tools::result::ToolError;
use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};
use serde_json::{Map, Value, json};

/// Compare the import topology of a baseline root against the head `path` and
/// report typed structural drift. Builds two independent snapshots and diffs
/// them through the shared engine so results stay AST-only and deterministic.
pub(crate) fn drift(
    q: &AstTopologyQuery,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    extras: &super::graph::BuildExtras,
    response_window: Option<usize>,
) -> Result<Value, ToolError> {
    // Both graphs come from the shared graph memo (and its disk tier), so
    // each page after the first reads them back instead of rescanning.
    let (head, head_display) =
        super::graph::build_graph_shared_with(q, paths, security, cancel, extras)?;
    let baseline_root = q
        .baseline()
        .map(str::to_owned)
        .ok_or_else(|| ToolError::new("invalidGraphQuery", "drift requires baseline"))?;
    let mut base_query = q.clone();
    base_query.set_path(baseline_root);
    let (base, base_display) =
        super::graph::build_graph_shared_with(&base_query, paths, security, cancel, extras)?;
    cancel.check().map_err(ToolError::cancelled)?;

    // The native scanner keys every node on a path relative to its own scan
    // root, so two-root drift shares identity across differing absolute
    // roots; the real roots stay visible in `path` / `baseline` below.
    let diff = octocode_engine::graph::diff_across_roots(&base.code_graph, &head.code_graph);

    let items = drift_rows(&diff);
    let summary = drift_summary(&diff);

    let mut base_map = Map::new();
    base_map.insert("operation".into(), json!("drift"));
    base_map.insert("path".into(), json!(head_display));
    base_map.insert("baseline".into(), json!(base_display));
    base_map.insert("filesScanned".into(), json!(head.facts.len()));
    base_map.insert("baselineFilesScanned".into(), json!(base.facts.len()));

    let mut fields = super::analysis::answer_fields(q, &head);
    fields["baseline"] = json!(base.root);
    let budget = crate::tools::page_windows::page_budget(response_window, &fields);
    let snapshot = crate::digest::json_sha256(&json!([
        items,
        fields,
        q.page_size().is_none().then_some(budget)
    ]));
    if q.snapshot().is_some_and(|expected| expected != snapshot) {
        base_map.insert("nodes".into(), json!([]));
        mark_stale(&mut base_map, q);
        return Ok(Value::Object(base_map));
    }
    let cuts = ScanCuts::of(&head).union(ScanCuts::of(&base));
    let answer_empty = super::analysis::answer_is_empty(&items, cuts);
    let (page, pagination) = paginate(items, q, budget);
    let has_more = pagination["hasMore"] == json!(true);
    let mut warnings = cuts.warnings(q);
    insert_supersedes(&mut base_map, q, &mut warnings);
    if !diff.comparable {
        base_map.insert("confidence".into(), json!("low"));
        warnings.push("graphs are not comparable — see summary.incompatibilities".to_owned());
    }
    base_map.insert("nodes".into(), Value::Array(page));
    base_map.insert("pagination".into(), pagination);
    base_map.insert("graphSummary".into(), summary);
    // The scan notes hold for every page: the first page states them once.
    if !warnings.is_empty() && q.page() <= 1 {
        base_map.insert("warnings".into(), json!(warnings));
    }
    if answer_empty {
        super::analysis::mark_empty(&mut base_map);
    }

    close_drift_page(&mut base_map, q, cuts, has_more, &snapshot);
    Ok(Value::Object(base_map))
}

/// The cuts, coverage state and continuations of one drift page. A diff
/// of two cut graphs is never complete: a file-scan cut offers the widened
/// rebuild; any other cut is a terminal limit.
fn close_drift_page(
    base_map: &mut Map<String, Value>,
    q: &AstTopologyQuery,
    cuts: ScanCuts,
    has_more: bool,
    snapshot: &str,
) {
    let page_limit = has_more
        && crate::tools::paging::admitted(
            crate::tools::id::ToolId::AstTopology,
            None,
            "page",
            q.page() as usize + 1,
        )
        .is_none();
    let mut reasons = cuts.reasons();
    let mut ceiling = Vec::new();
    if page_limit {
        reasons.push("pageLimit");
        ceiling.push(super::page::page_ceiling_warning("result", PAGE_MAXIMUM));
    }
    super::analysis::mark_cuts(base_map, &reasons, ceiling, page_limit || cuts.terminal(q));
    // Skipped files mark the graph (`files-skipped`); only a cut graph can
    // hide rows from a fully paged answer.
    let results_state = if page_limit {
        "truncated"
    } else if has_more {
        "pageable"
    } else if cuts.graph_cut() {
        "truncated"
    } else {
        "complete"
    };
    let graph_state = cuts.graph_state().unwrap_or("complete");
    let mut completeness = Map::new();
    for (key, state) in [("nodes", results_state), ("graph", graph_state)] {
        if state != "complete" {
            completeness.insert(key.into(), json!(state));
        }
    }
    super::analysis::state_coverage(base_map, completeness);
    let mut next = Map::new();
    if has_more && !page_limit {
        next.insert(
            "nextPage".into(),
            continuation(q, Some(q.page() + 1), None, Some(json!(snapshot))),
        );
    } else if cuts.widenable()
        && let Some(widen) = expand_scan(q)
    {
        next.insert("expandScan".into(), widen);
    }
    if !next.is_empty() {
        base_map.insert("next".into(), Value::Object(next));
    }
}

/// One row per drift change, file-level first: files, cycles, static/dynamic
/// transitions, then symbol-level relations.
pub(super) fn drift_rows(diff: &octocode_engine::graph::GraphDiff) -> Vec<Value> {
    let mut items: Vec<Value> = Vec::new();
    for (change, files) in [
        ("added", &diff.files.added),
        ("removed", &diff.files.removed),
        ("changed", &diff.files.changed),
    ] {
        for file in files {
            items.push(json!({"category":"file","change":change,"file":file}));
        }
    }
    for (change, cycles) in [
        ("added", &diff.cycles.added),
        ("resolved", &diff.cycles.resolved),
    ] {
        for cycle in cycles {
            items.push(
                json!({"category":"cycle","change":change,"files":cycle,"confidence":"syntactic"}),
            );
        }
    }
    for (change, transitions) in [
        ("staticToDynamic", &diff.relations.static_to_dynamic),
        ("dynamicToStatic", &diff.relations.dynamic_to_static),
    ] {
        for rel in transitions {
            items.push(json!({"category":"transition","change":change,"from":rel.from.0,"to":rel.to.0,"confidence":"syntactic"}));
        }
    }
    for (change, relations) in [
        ("added", &diff.relations.added),
        ("removed", &diff.relations.removed),
    ] {
        for rel in relations {
            items.push(json!({"category":"relation","change":change,"from":rel.from.0,"to":rel.to.0,"edgeKind":rel.kind.label(),"confidence":"syntactic"}));
        }
    }
    items
}

pub(super) fn drift_summary(diff: &octocode_engine::graph::GraphDiff) -> Value {
    json!({
        "comparable": diff.comparable,
        "incompatibilities": serde_json::to_value(&diff.incompatibilities).unwrap_or(Value::Null),
        "relationsAdded": diff.relations.added.len(),
        "relationsRemoved": diff.relations.removed.len(),
        "staticToDynamic": diff.relations.static_to_dynamic.len(),
        "dynamicToStatic": diff.relations.dynamic_to_static.len(),
        "cyclesAdded": diff.cycles.added.len(),
        "cyclesResolved": diff.cycles.resolved.len(),
        "filesAdded": diff.files.added.len(),
        "filesRemoved": diff.files.removed.len(),
        "filesChanged": diff.files.changed.len(),
        "completeness": serde_json::to_value(&diff.completeness).unwrap_or(Value::Null),
        "metrics": serde_json::to_value(&diff.metrics).unwrap_or(Value::Null),
    })
}

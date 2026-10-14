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
) -> Result<Value, ToolError> {
    let head = super::graph::build_graph_with(q, paths, security, cancel, extras)?;
    let baseline_root = q
        .baseline()
        .map(str::to_owned)
        .ok_or_else(|| ToolError::new("invalidGraphQuery", "drift requires baseline"))?;
    let mut base_query = q.clone();
    base_query.set_path(baseline_root);
    let mut base = super::graph::build_graph_with(&base_query, paths, security, cancel, extras)?;
    cancel.check().map_err(ToolError::cancelled)?;

    // The native scanner keys every node on a path relative to its own scan
    // root, so two-root drift shares identity across differing absolute roots.
    // Equalize the root metadata so the engine's root-mismatch gate — which
    // protects consumers that key on absolute paths — does not false-refuse this
    // legitimately comparable pair. The real roots stay visible in `path` /
    // `baseline` below.
    base.code_graph.snapshot.root = head.code_graph.snapshot.root.clone();
    let diff = octocode_engine::graph::diff_graphs(&base.code_graph, &head.code_graph);

    let items = drift_rows(&diff);
    let summary = drift_summary(&diff);

    let mut base_map = Map::new();
    base_map.insert("operation".into(), json!("drift"));
    base_map.insert("path".into(), json!(head.display_path));
    base_map.insert("baseline".into(), json!(base.display_path));
    base_map.insert("filesScanned".into(), json!(head.facts.len()));
    base_map.insert("baselineFilesScanned".into(), json!(base.facts.len()));

    let snapshot = crate::digest::json_sha256(&items);
    if q.diagnostic_snapshot()
        .is_some_and(|expected| expected != snapshot)
    {
        base_map.insert("nodes".into(), json!([]));
        insert_snapshot_changed(&mut base_map);
        base_map.insert(
            "next".into(),
            json!({"restartDiagnostics": restart_continuation(q)}),
        );
        return Ok(Value::Object(base_map));
    }
    let answer_empty = super::analysis::answer_is_empty(&items);
    let (page, pagination) = paginate(items, q);
    let has_more = pagination["hasMore"] == json!(true);
    let cuts = ScanCuts::of(&head).union(ScanCuts::of(&base));
    let mut warnings = cuts.warnings(q);
    insert_supersedes(&mut base_map, q, &mut warnings);
    if !diff.comparable {
        base_map.insert("confidence".into(), json!("low"));
        warnings.push("graphs are not comparable — see summary.incompatibilities".to_owned());
    }
    base_map.insert("nodes".into(), Value::Array(page));
    base_map.insert("pagination".into(), pagination);
    base_map.insert("graphSummary".into(), summary);
    if !warnings.is_empty() {
        base_map.insert("warnings".into(), json!(warnings));
    }
    if answer_empty {
        super::analysis::mark_empty(&mut base_map);
    }

    // A diff of two cut graphs is never complete: a file-scan cut offers
    // the widened rebuild; any other cut is a terminal limit.
    let page_limit = has_more
        && crate::tools::paging::admitted(
            crate::tools::id::ToolId::AstTopology,
            None,
            "page",
            q.page() as usize + 1,
        )
        .is_none();
    let mut reasons = cuts.reasons();
    if page_limit {
        reasons.push("pageLimit");
        super::analysis::push_warning(
            &mut base_map,
            super::page::page_ceiling_warning("result", PAGE_MAXIMUM),
        );
    }
    if !reasons.is_empty() {
        base_map.insert("isPartial".into(), json!(true));
        base_map.insert("partialReasons".into(), json!(reasons));
    }
    if page_limit || cuts.terminal(q) {
        base_map.insert("terminalLimit".into(), json!(true));
    }
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
    super::analysis::state_coverage(&mut base_map, completeness);
    let mut next = Map::new();
    if has_more && !page_limit {
        next.insert(
            "nextPage".into(),
            continuation(q, Some(q.page() + 1), None, Some(json!(snapshot))),
        );
        base_map["pagination"]["resultId"] = json!(snapshot);
    } else if cuts.widenable()
        && let Some(widen) = expand_scan(q)
    {
        next.insert("expandScan".into(), widen);
    }
    if !next.is_empty() {
        base_map.insert("next".into(), Value::Object(next));
    }
    Ok(Value::Object(base_map))
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

//! Bounded, opt-in ordering of read evidence. The continuation carries only
//! the permutation of judged units; every other unit stays in source order.
//! No process cache or provider replay is needed to serve a later page.
use crate::contracts::tool_types::{Ranking, RankingScope, RankingStatus};
use crate::runtime::ExecutionContext;
use crate::tools::id::ToolId;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const VERSION: u8 = 1;

#[derive(Clone, Copy, Debug)]
pub(crate) struct Limits {
    pub enabled: bool,
    pub max_candidates: usize,
    pub max_chars: usize,
    pub timeout: Duration,
}

#[derive(Clone)]
pub(crate) struct Runtime {
    pub limits: Limits,
    pub available: bool,
    pub judge: std::sync::Arc<dyn RankJudge>,
    pub handle: tokio::runtime::Handle,
    pub context: ExecutionContext,
    pub home: PathBuf,
    pub stats_enabled: bool,
}

/// The classification backend is injected so the shared ordering primitive
/// never depends on either public tool's implementation.
pub(crate) trait RankJudge: Send + Sync {
    fn identity(&self) -> Value;
    /// The backend's existing evidence projection removes routing controls
    /// before a candidate is budgeted or sent to its provider.
    fn project(&self, state: Value) -> Value {
        state
    }
    fn score(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, f64)>, String>;
}

pub(crate) struct JudgeCall<'a> {
    pub candidates: &'a [Candidate],
    pub admitted: &'a [usize],
    pub goals: &'a [Value],
    pub limits: Limits,
    pub handle: &'a tokio::runtime::Handle,
    pub context: &'a ExecutionContext,
    pub home: &'a Path,
    pub stats_enabled: bool,
}

/// One complete, already-sanitized unit. `None` means the unit could not be
/// safely sent to the provider; its evidence still remains in the result.
pub(crate) struct Candidate {
    pub state: Option<Value>,
    pub evidence_chars: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Plan {
    version: u8,
    binding: String,
    status: RankingStatus,
    scope: RankingScope,
    ranked: Vec<u32>,
    total: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    checksum: String,
}

pub(crate) struct Outcome {
    pub order: Vec<usize>,
    pub receipt: Ranking,
    pub token: String,
}

pub(crate) enum Failure {
    Stale,
    Cancelled,
}

fn skip_reason(
    runtime: Option<&Runtime>,
    unsupported: Option<&'static str>,
    total: usize,
) -> Option<&'static str> {
    unsupported.or_else(|| {
        if !runtime.is_some_and(|runtime| runtime.limits.enabled) {
            Some("disabled")
        } else if !runtime.is_some_and(|runtime| runtime.available) {
            Some("classificationUnavailable")
        } else if total == 0 {
            Some("noCandidates")
        } else if total == 1 {
            Some("singleCandidate")
        } else {
            None
        }
    })
}

/// Candidate states are needed only when this call can submit new scores.
/// A saved plan needs the candidate count and source binding, not the states.
pub(crate) fn needs_candidate_states(
    runtime: Option<&Runtime>,
    prior: Option<&str>,
    unsupported: Option<&'static str>,
    total: usize,
) -> bool {
    prior.is_none() && skip_reason(runtime, unsupported, total).is_none()
}

/// Rank one already-sanitized result row at the shared response boundary.
/// Remote discovery has fetched exactly one provider page at this point;
/// local tools are admitted only when their complete selected view fits in
/// this row. The source digest covers the *original* item order so a saved
/// plan cannot silently apply to a changed provider page.
pub(crate) fn apply_sanitized_rows(
    tool: ToolId,
    structured: &mut Value,
    queries: &[Value],
    row_indices: &[usize],
    explicit_sort: &[bool],
    response_query: &mut Value,
    runtime: &Runtime,
) -> Result<(), crate::runtime::ExecutionError> {
    let Some(rows) = structured.get_mut("results").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for row in rows {
        let Some(index) = row["index"].as_u64().and_then(|i| usize::try_from(i).ok()) else {
            continue;
        };
        let Some(admitted_index) = row_indices.iter().position(|&original| original == index)
        else {
            continue;
        };
        let Some(query) = queries.get(admitted_index) else {
            continue;
        };
        let has_goals = query["goals"]
            .as_array()
            .is_some_and(|goals| !goals.is_empty());
        if !has_goals && query.get("ranking").is_none() {
            continue;
        }
        // These two tools rank before their own source pagination. Never
        // apply a second pass to the page they returned here.
        if matches!(
            tool,
            ToolId::LocalSearch | ToolId::LocalFetch | ToolId::GhGetFileContent
        ) {
            continue;
        }
        let failed = row["status"] == "error";
        let data = &mut row["data"];
        if !data.is_object() || failed {
            continue;
        }
        let mut selection = selection(
            tool,
            query,
            data,
            explicit_sort.get(admitted_index).copied().unwrap_or(false),
        );
        let values = if tool == ToolId::StructureSearch && selection.key.is_some() {
            match flat_file_units(data) {
                Some(units) => units,
                None => {
                    selection.key = None;
                    selection.skip = Some("unsupportedShape");
                    Vec::new()
                }
            }
        } else {
            selection
                .key
                .and_then(|key| data.get(key))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        };
        let candidates = values
            .iter()
            .map(|item| {
                let state = runtime.judge.project(json!({"evidence":item}));
                Candidate {
                    evidence_chars: serde_json::to_string(&state)
                        .map_or(usize::MAX, |s| s.chars().count()),
                    state: Some(state),
                }
            })
            .collect::<Vec<_>>();
        let source = crate::digest::json_sha256(&crate::canonical_json::canonicalize(json!({
            "tool": tool.as_str(),
            "path": query.get("path"),
            "owner": query.get("owner"),
            "repo": query.get("repo"),
            "page": query.get("page"),
            "items": candidates.iter().map(|candidate| candidate.state.as_ref()).collect::<Vec<_>>(),
        })));
        let outcome = match order_scoped(
            Some(runtime),
            query,
            &source,
            query["ranking"].as_str(),
            &candidates,
            selection.skip,
            selection.scope,
        ) {
            Ok(outcome) => outcome,
            Err(Failure::Cancelled) => return Err(crate::runtime::ExecutionError::Cancelled),
            Err(Failure::Stale) => {
                let mut restart = query.clone();
                if let Some(restart) = restart.as_object_mut() {
                    for field in ["ranking", "snapshot", "page", "matchPage", "scanOffset"] {
                        restart.remove(field);
                    }
                }
                row["data"] = json!({
                    "errorCode":"staleSnapshot",
                    "error":crate::response::pages::STALE_SNAPSHOT_ERROR,
                    "next":{"restart":crate::tools::result::Continuation::new(tool, restart).build()}
                });
                row["status"] = json!("error");
                continue;
            }
        };
        if tool == ToolId::StructureSearch && selection.key.is_some() {
            let ordered = outcome
                .order
                .iter()
                .map(|&i| values[i].clone())
                .collect::<Vec<_>>();
            data["files"] = Value::Array(group_file_units(&ordered));
        } else if let Some(key) = selection.key
            && let Some(array) = data.get_mut(key).and_then(Value::as_array_mut)
        {
            let original = std::mem::take(array);
            *array = outcome.order.iter().map(|&i| original[i].clone()).collect();
        }
        data["ranking"] = serde_json::to_value(&outcome.receipt).unwrap_or(Value::Null);
        // A provider's next page is a different candidate set. A response
        // page over this same row, however, must replay the saved plan.
        strip_plan_from_tool_continuations(
            data,
            tool,
            !explicit_sort.get(admitted_index).copied().unwrap_or(false),
        );
        let response_row = if queries.len() == 1 {
            Some(&mut *response_query)
        } else {
            response_query.pointer_mut(&format!("/queries/{admitted_index}"))
        };
        if let Some(response_row) = response_row.and_then(Value::as_object_mut) {
            if !explicit_sort.get(admitted_index).copied().unwrap_or(false) {
                response_row.remove("sort");
            }
            response_row.insert("ranking".into(), json!(outcome.token));
        }
    }
    Ok(())
}

/// A tool continuation changes the candidate set or view. Only the shared
/// response pager, whose query is set separately above, may replay this plan.
fn strip_plan_from_tool_continuations(value: &mut Value, tool: ToolId, implicit_sort: bool) {
    let Some(fields) = value.as_object_mut() else {
        return;
    };
    for name in ["next", "hints"] {
        if let Some(leads) = fields.get_mut(name).and_then(Value::as_object_mut) {
            for lead in leads.values_mut() {
                scrub_lead(lead, tool, implicit_sort, name == "hints");
            }
        }
    }
    // Descend only through tool-owned result collections. A source payload
    // may itself contain a `next` object or tool-shaped JSON; it is evidence,
    // not a continuation for this response.
    for name in [
        "files",
        "repositories",
        "artifacts",
        "pullRequests",
        "issues",
        "commits",
        "matches",
        "symbols",
        "locations",
        "references",
        "implementations",
        "importers",
        "entries",
        "children",
        "members",
    ] {
        if let Some(items) = fields.get_mut(name).and_then(Value::as_array_mut) {
            for item in items {
                strip_plan_from_tool_continuations(item, tool, implicit_sort);
            }
        }
    }
}

fn scrub_lead(lead: &mut Value, tool: ToolId, implicit_sort: bool, hint: bool) {
    let Some(fields) = lead.as_object_mut() else {
        return;
    };
    let Some(lead_tool) = fields.get("tool").and_then(Value::as_str) else {
        return;
    };
    let same_tool = lead_tool == tool.as_str();
    let Some(rows) = fields
        .get_mut("query")
        .and_then(|query| query.get_mut("queries"))
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for row in rows.iter_mut().filter_map(Value::as_object_mut) {
        row.remove("ranking");
        // A verification hint or a different tool is a new decision, not
        // another pass over this ranking goal.
        if hint || !same_tool {
            row.remove("goals");
        }
        if implicit_sort && same_tool {
            row.remove("sort");
        }
    }
}

fn flat_file_units(data: &Value) -> Option<Vec<Value>> {
    let mut units = Vec::new();
    for group in data["files"].as_array()? {
        let fields = group.as_object()?;
        if fields.len() != 2 || !fields.contains_key("dir") || !fields.contains_key("files") {
            return None;
        }
        let dir = group["dir"].as_str()?;
        for file in group["files"].as_array()? {
            units.push(json!({"dir":dir,"entry":file}));
        }
    }
    Some(units)
}

fn group_file_units(units: &[Value]) -> Vec<Value> {
    let mut groups: Vec<Value> = Vec::new();
    for unit in units {
        let dir = &unit["dir"];
        let entry = &unit["entry"];
        if let Some(group) = groups.last_mut()
            && group["dir"] == *dir
            && let Some(files) = group["files"].as_array_mut()
        {
            files.push(entry.clone());
        } else {
            groups.push(json!({"dir":dir,"files":[entry]}));
        }
    }
    groups
}

struct Selection {
    key: Option<&'static str>,
    skip: Option<&'static str>,
    scope: RankingScope,
}

fn selection(tool: ToolId, query: &Value, data: &Value, explicit_sort: bool) -> Selection {
    let provider = |key| Selection {
        key: Some(key),
        skip: None,
        scope: RankingScope::ProviderPage,
    };
    let selected = |key| Selection {
        key: Some(key),
        skip: None,
        scope: RankingScope::SelectedView,
    };
    let skipped = |reason, scope| Selection {
        key: None,
        skip: Some(reason),
        scope,
    };
    match tool {
        ToolId::GhSearchRepo => {
            if query.get("repo").is_some() && query.get("owner").is_some() {
                skipped("exactLookup", RankingScope::ProviderPage)
            } else if query["sort"]
                .as_str()
                .is_some_and(|sort| sort != "best-match")
            {
                skipped("authoritativeSort", RankingScope::ProviderPage)
            } else {
                provider("repositories")
            }
        }
        ToolId::GhSearchCode => {
            if explicit_sort {
                skipped("authoritativeSort", RankingScope::ProviderPage)
            } else {
                provider("files")
            }
        }
        ToolId::GhSearchHistory => {
            if explicit_sort {
                skipped("authoritativeSort", RankingScope::ProviderPage)
            } else if data.get("pullRequests").is_some() {
                provider("pullRequests")
            } else if data.get("issues").is_some() {
                provider("issues")
            } else {
                provider("commits")
            }
        }
        ToolId::ArtifactSearch => {
            if query.get("packageName").is_some() {
                skipped("exactLookup", RankingScope::ProviderPage)
            } else {
                provider("artifacts")
            }
        }
        ToolId::GhStructure => skipped("hierarchicalOrder", RankingScope::SelectedView),
        ToolId::GhGetHistoryItem => skipped("sectionAndPatchOrder", RankingScope::SelectedView),
        ToolId::AstTopology => skipped("graphOrder", RankingScope::SelectedView),
        ToolId::StructureSearch => {
            if query["operation"] != "files" {
                skipped("hierarchicalOrder", RankingScope::SelectedView)
            } else if explicit_sort {
                skipped("authoritativeSort", RankingScope::SelectedView)
            } else if complete_view(tool, query, data) {
                selected("files")
            } else {
                skipped("incompleteSelection", RankingScope::SelectedView)
            }
        }
        ToolId::AstSearch => {
            if query["operation"] == "syntaxTree" {
                skipped("structuralOrder", RankingScope::SelectedView)
            } else if complete_view(tool, query, data) && data.get("files").is_some() {
                selected("files")
            } else {
                skipped("incompleteSelection", RankingScope::SelectedView)
            }
        }
        ToolId::LspSearch => {
            if matches!(
                query["operation"].as_str(),
                Some("references" | "implementation")
            ) && complete_view(tool, query, data)
                && data.get("files").is_some()
            {
                selected("files")
            } else {
                skipped("identityOrIncompleteSelection", RankingScope::SelectedView)
            }
        }
        ToolId::GhGetFileContent => skipped("unsupportedContentView", RankingScope::SelectedView),
        _ => skipped("unsupportedOperation", RankingScope::SelectedView),
    }
}

fn complete_view(tool: ToolId, query: &Value, data: &Value) -> bool {
    let first = ["page", "matchPage", "importerPage", "filePage"]
        .iter()
        .all(|field| query[*field].as_u64().is_none_or(|page| page <= 1));
    let no_offset = ["scanOffset", "offset"]
        .iter()
        .all(|field| query[*field].as_u64().is_none_or(|offset| offset == 0));
    fn incomplete(tool: ToolId, value: &Value) -> bool {
        match value {
            Value::Object(fields) => {
                if fields.get("isPartial") == Some(&Value::Bool(true))
                    || fields.get("terminalLimit") == Some(&Value::Bool(true))
                    || fields.get("hasMore") == Some(&Value::Bool(true))
                {
                    return true;
                }
                if let Some(next) = fields.get("next").and_then(Value::as_object)
                    && next
                        .keys()
                        .any(|name| crate::tools::id::is_remaining(tool, name))
                {
                    return true;
                }
                fields
                    .iter()
                    .filter(|(key, _)| key.as_str() != "next")
                    .any(|(_, child)| incomplete(tool, child))
            }
            Value::Array(items) => items.iter().any(|child| incomplete(tool, child)),
            _ => false,
        }
    }
    first && no_offset && !incomplete(tool, data)
}

impl Plan {
    fn new(
        binding: String,
        total: usize,
        status: RankingStatus,
        scope: RankingScope,
        reason: Option<&str>,
    ) -> Self {
        Self {
            version: VERSION,
            binding,
            status,
            scope,
            ranked: Vec::new(),
            total: u32::try_from(total).unwrap_or(u32::MAX),
            reason: reason.map(str::to_owned),
            checksum: String::new(),
        }
    }

    fn digest(&self) -> String {
        crate::digest::json_sha256(&json!({
            "version": self.version,
            "binding": self.binding,
            "status": self.status,
            "scope": self.scope,
            "ranked": self.ranked,
            "total": self.total,
            "reason": self.reason,
        }))
    }

    fn seal(&mut self) {
        self.checksum = self.digest();
    }

    fn valid(&self, binding: &str, total: usize, scope: RankingScope) -> bool {
        if self.version != VERSION
            || self.binding != binding
            || self.scope != scope
            || usize::try_from(self.total).ok() != Some(total)
            || self.ranked.len() > total
            || self.checksum != self.digest()
        {
            return false;
        }
        let mut seen = HashSet::with_capacity(self.ranked.len());
        if !self.ranked.iter().all(|ordinal| {
            usize::try_from(*ordinal).is_ok_and(|i| i < total) && seen.insert(*ordinal)
        }) {
            return false;
        }
        match self.status {
            RankingStatus::Ranked => self.ranked.len() == total,
            RankingStatus::Partial => !self.ranked.is_empty() && self.ranked.len() < total,
            RankingStatus::Skipped | RankingStatus::Fallback => self.ranked.is_empty(),
        }
    }

    fn finish(mut self) -> Outcome {
        self.seal();
        let total = self.total as usize;
        let mut included = vec![false; total];
        let mut order = Vec::with_capacity(total);
        for &ordinal in &self.ranked {
            let ordinal = ordinal as usize;
            included[ordinal] = true;
            order.push(ordinal);
        }
        order.extend((0..total).filter(|ordinal| !included[*ordinal]));
        let receipt = Ranking {
            status: self.status,
            scope: self.scope,
            ranked_items: i64::try_from(self.ranked.len()).unwrap_or(i64::MAX),
            total_items: i64::from(self.total),
            reason: self.reason.clone(),
        };
        let token = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&self).unwrap_or_default());
        Outcome {
            order,
            receipt,
            token,
        }
    }
}

/// Bind an ordering to the source, the selected view, goals and effective
/// settings. Paging cursors change between calls and are excluded by name.
pub(crate) fn binding(
    query: &Value,
    source: &str,
    limits: Limits,
    runtime: Option<&Runtime>,
) -> String {
    let mut selected = query.clone();
    if let Some(map) = selected.as_object_mut() {
        for field in [
            "snapshot",
            "ranking",
            "page",
            "matchPage",
            "pageSize",
            "matchPageSize",
            "offset",
            "length",
            "unit",
            "fullContent",
            "extras",
            "mainGoal",
            "reasoning",
            "path",
        ] {
            map.remove(field);
        }
    }
    crate::digest::json_sha256(&crate::canonical_json::canonicalize(json!({
        "version": VERSION,
        "source": source,
        "query": selected,
        "settings": {
            "enabled": limits.enabled,
            "available": runtime.is_some_and(|runtime| runtime.available),
            "maxCandidates": limits.max_candidates,
            "maxChars": limits.max_chars,
            "timeoutMs": limits.timeout.as_millis(),
        },
        "provider": runtime.map(|runtime| runtime.judge.identity()),
    })))
}

/// Replay the exact plan from a continuation or judge bounded new candidates.
/// An invalid plan is a stale page, never a reason to recompute one page.
pub(crate) fn order(
    runtime: Option<&Runtime>,
    query: &Value,
    source: &str,
    prior: Option<&str>,
    candidates: &[Candidate],
    unsupported: Option<&'static str>,
) -> Result<Outcome, Failure> {
    order_scoped(
        runtime,
        query,
        source,
        prior,
        candidates,
        unsupported,
        RankingScope::SelectedView,
    )
}

pub(crate) fn order_scoped(
    runtime: Option<&Runtime>,
    query: &Value,
    source: &str,
    prior: Option<&str>,
    candidates: &[Candidate],
    unsupported: Option<&'static str>,
    scope: RankingScope,
) -> Result<Outcome, Failure> {
    let limits = runtime.map_or(
        Limits {
            enabled: false,
            max_candidates: 0,
            max_chars: 0,
            timeout: Duration::ZERO,
        },
        |runtime| runtime.limits,
    );
    let bound = binding(query, source, limits, runtime);
    if let Some(token) = prior {
        let bytes = URL_SAFE_NO_PAD.decode(token).map_err(|_| Failure::Stale)?;
        let plan: Plan = serde_json::from_slice(&bytes).map_err(|_| Failure::Stale)?;
        return plan
            .valid(&bound, candidates.len(), scope)
            .then(|| plan.finish())
            .ok_or(Failure::Stale);
    }
    let mut plan = Plan::new(bound, candidates.len(), RankingStatus::Skipped, scope, None);
    if let Some(reason) = skip_reason(runtime, unsupported, candidates.len()) {
        plan.reason = Some(reason.into());
        return Ok(plan.finish());
    }
    let mut admitted = Vec::new();
    let mut chars = 0usize;
    for (ordinal, candidate) in candidates.iter().enumerate() {
        if admitted.len() == limits.max_candidates {
            break;
        }
        if candidate.state.is_some()
            && candidate.evidence_chars <= limits.max_chars.saturating_sub(chars)
        {
            chars += candidate.evidence_chars;
            admitted.push(ordinal);
        }
    }
    if admitted.is_empty() {
        plan.reason = Some("candidateBudget".into());
        return Ok(plan.finish());
    }
    let Some(runtime) = runtime else {
        return Ok(plan.finish());
    };
    let goals = query["goals"].as_array().ok_or(Failure::Stale)?;
    let scored = runtime.judge.score(JudgeCall {
        candidates,
        admitted: &admitted,
        goals,
        limits: runtime.limits,
        handle: &runtime.handle,
        context: &runtime.context,
        home: &runtime.home,
        stats_enabled: runtime.stats_enabled,
    });
    if runtime.context.cancellation.is_cancelled() || Instant::now() >= runtime.context.deadline {
        return Err(Failure::Cancelled);
    }
    match scored {
        Ok(mut scores) => {
            scores.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            plan.ranked = scores
                .into_iter()
                .map(|(ordinal, _)| ordinal as u32)
                .collect();
            plan.status = if plan.ranked.len() == candidates.len() {
                RankingStatus::Ranked
            } else {
                RankingStatus::Partial
            };
            if plan.status == RankingStatus::Partial {
                plan.reason = Some("candidateBudget".into());
            }
        }
        Err(reason) => {
            plan.status = RankingStatus::Fallback;
            plan.reason = Some(reason);
        }
    }
    Ok(plan.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct FailedJudge;
    impl RankJudge for FailedJudge {
        fn identity(&self) -> Value {
            json!({"backend":"test"})
        }
        fn score(&self, _call: JudgeCall<'_>) -> Result<Vec<(usize, f64)>, String> {
            Err("providerUnavailable".into())
        }
    }

    struct UncalledJudge;
    impl RankJudge for UncalledJudge {
        fn identity(&self) -> Value {
            json!({"backend":"test"})
        }
        fn score(&self, _call: JudgeCall<'_>) -> Result<Vec<(usize, f64)>, String> {
            panic!("one candidate must not call the provider")
        }
    }

    struct ReverseJudge(std::sync::Arc<AtomicUsize>);
    impl RankJudge for ReverseJudge {
        fn identity(&self) -> Value {
            json!({"backend":"reverse-test"})
        }
        fn score(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, f64)>, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(call
                .admitted
                .iter()
                .map(|&ordinal| (ordinal, ordinal as f64))
                .collect())
        }
    }

    fn test_runtime(
        judge: std::sync::Arc<dyn RankJudge>,
        handle: tokio::runtime::Handle,
    ) -> Runtime {
        Runtime {
            limits: Limits {
                enabled: true,
                max_candidates: 64,
                max_chars: 131_072,
                timeout: Duration::from_secs(5),
            },
            available: true,
            judge,
            handle,
            context: ExecutionContext {
                cancellation: tokio_util::sync::CancellationToken::new(),
                deadline: Instant::now() + Duration::from_secs(5),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
            home: PathBuf::new(),
            stats_enabled: false,
        }
    }

    #[test]
    fn complete_structure_files_reorder_entries_and_replay_without_a_second_judgment() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(ReverseJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query =
            json!({"operation":"files","path":".","sort":"path","goals":["wanted evidence"]});
        let baseline = json!({"results":[{"index":0,"data":{"files":[
            {"dir":"a","files":["one.rs","two.rs"]},
            {"dir":"b","files":["three.rs"]}
        ],"pagination":{"currentPage":1,"hasMore":false}}}]});
        let mut first = baseline.clone();
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::StructureSearch,
            &mut first,
            std::slice::from_ref(&query),
            &[0],
            &[false],
            &mut response_query,
            &runtime,
        )
        .expect("first");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            first["results"][0]["data"]["ranking"]["scope"],
            "selectedView"
        );
        assert_eq!(
            flat_file_units(&first["results"][0]["data"])
                .expect("valid grouped files")
                .iter()
                .map(|unit| unit["entry"].as_str().unwrap_or_default())
                .collect::<Vec<_>>(),
            ["three.rs", "two.rs", "one.rs"]
        );
        assert!(
            response_query.get("sort").is_none(),
            "default sort omission must survive response paging"
        );
        let mut replay = baseline;
        let mut replay_query = response_query.clone();
        let mut validated_replay = response_query;
        validated_replay["sort"] = json!("path");
        apply_sanitized_rows(
            ToolId::StructureSearch,
            &mut replay,
            &[validated_replay],
            &[0],
            &[false],
            &mut replay_query,
            &runtime,
        )
        .expect("replay");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            replay["results"][0]["data"]["files"],
            first["results"][0]["data"]["files"]
        );

        let mut exact_sort = json!({"results":[{"index":0,"data":{"files":[
            {"dir":"a","files":["one.rs","two.rs"]}
        ]}}]});
        let mut explicit_query = query.clone();
        apply_sanitized_rows(
            ToolId::StructureSearch,
            &mut exact_sort,
            &[query],
            &[0],
            &[true],
            &mut explicit_query,
            &runtime,
        )
        .expect("explicit sort");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            exact_sort["results"][0]["data"]["ranking"]["reason"],
            "authoritativeSort"
        );
        assert_eq!(
            exact_sort["results"][0]["data"]["files"][0]["files"],
            json!(["one.rs", "two.rs"])
        );
    }

    #[test]
    fn a_terminal_last_page_or_nested_resume_is_not_a_complete_selected_view() {
        let complete = json!({"files":[{"path":"a.rs"},{"path":"b.rs"}]});
        assert!(complete_view(
            ToolId::AstSearch,
            &json!({"page":1}),
            &complete
        ));
        assert!(!complete_view(
            ToolId::AstSearch,
            &json!({"page":2}),
            &complete
        ));
        assert!(!complete_view(
            ToolId::AstSearch,
            &json!({"scanOffset":5}),
            &complete
        ));
        let nested = json!({"files":[{"path":"a.rs","next":{"nextMatchPage":{"tool":"astSearch","query":{}}}}]});
        assert!(!complete_view(ToolId::AstSearch, &json!({}), &nested));
        let importer = json!({"files":[{"path":"a.rs"}],"next":{"nextImporterPage":{"tool":"lspSearch","query":{}}}});
        assert!(!complete_view(ToolId::LspSearch, &json!({}), &importer));
    }

    #[test]
    fn every_tool_continuation_starts_a_new_candidate_plan() {
        let mut data = json!({"next":{"nextPage":{"tool":"ghSearchCode","query":{"queries":[{"page":2,"sort":"best-match","ranking":"old"}]}},
            "read":{"tool":"ghGetFileContent","query":{"queries":[{"path":"a.rs","goals":["old"],"ranking":"old"}]}}},
            "hints":{"verify":{"tool":"ghGetFileContent","query":{"queries":[{"path":"a.rs","goals":["old"],"ranking":"old"}]}}},
            "files":[{"evidence":{"tool":"ghSearchCode","query":{"queries":[{"goals":["source"],"ranking":"source"}]},"next":{"sourceValue":{"tool":"ghSearchCode","query":{"queries":[{"ranking":"source"}]}}}},"next":{"nextMatchPage":{"tool":"ghSearchCode","query":{"queries":[{"matchPage":2,"goals":["old"],"ranking":"old"}]}}}}]});
        strip_plan_from_tool_continuations(&mut data, ToolId::GhSearchCode, true);
        assert!(
            data["next"]["nextPage"]["query"]["queries"][0]
                .get("ranking")
                .is_none()
        );
        assert!(
            data["next"]["nextPage"]["query"]["queries"][0]
                .get("sort")
                .is_none()
        );
        assert!(
            data["next"]["read"]["query"]["queries"][0]
                .get("ranking")
                .is_none()
        );
        assert!(
            data["next"]["read"]["query"]["queries"][0]
                .get("goals")
                .is_none()
        );
        assert!(
            data["hints"]["verify"]["query"]["queries"][0]
                .get("goals")
                .is_none()
        );
        assert!(
            data["files"][0]["next"]["nextMatchPage"]["query"]["queries"][0]
                .get("ranking")
                .is_none()
        );
        assert_eq!(
            data["files"][0]["next"]["nextMatchPage"]["query"]["queries"][0]["goals"],
            json!(["old"])
        );
        assert_eq!(
            data["files"][0]["evidence"]["query"]["queries"][0]["ranking"],
            "source"
        );
        assert_eq!(
            data["files"][0]["evidence"]["next"]["sourceValue"]["query"]["queries"][0]["ranking"],
            "source"
        );
    }

    #[test]
    fn rejected_rows_do_not_misalign_queries_or_sort_provenance() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(ReverseJudge(calls.clone())),
            executor.handle().clone(),
        );
        let explicit = json!({"operation":"files","path":".","sort":"path","goals":["wanted"]});
        let omitted = explicit.clone();
        let mut structured = json!({"results":[
            {"index":0,"status":"error","data":{"errorCode":"invalidInput"}},
            {"index":1,"data":{"files":[{"dir":"a","files":["one.rs","two.rs"]}]}},
            {"index":2,"data":{"files":[{"dir":"b","files":["three.rs","four.rs"]}]}}
        ]});
        let mut response_query = json!({"queries":[explicit.clone(),omitted.clone()]});
        apply_sanitized_rows(
            ToolId::StructureSearch,
            &mut structured,
            &[explicit, omitted],
            &[1, 2],
            &[true, false],
            &mut response_query,
            &runtime,
        )
        .expect("mixed rows");
        assert_eq!(
            structured["results"][1]["data"]["ranking"]["reason"],
            "authoritativeSort"
        );
        assert_eq!(
            structured["results"][2]["data"]["ranking"]["status"],
            "ranked"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(response_query["queries"][0].get("ranking").is_some());
        assert!(response_query["queries"][1].get("ranking").is_some());
        assert_eq!(response_query["queries"][0]["sort"], "path");
        assert!(response_query["queries"][1].get("sort").is_none());
    }

    #[test]
    fn malformed_structure_group_is_reported_without_dropping_its_evidence() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(ReverseJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"operation":"files","path":".","sort":"path","goals":["wanted"]});
        let files = json!([
            {"dir":"a","files":["one.rs"]},
            {"dir":"b","files":["two.rs"],"note":"retain this group evidence"}
        ]);
        let mut structured = json!({"results":[{"index":0,"data":{"files":files}}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::StructureSearch,
            &mut structured,
            &[query],
            &[0],
            &[false],
            &mut response_query,
            &runtime,
        )
        .expect("malformed group");
        assert_eq!(structured["results"][0]["data"]["files"], files);
        assert_eq!(
            structured["results"][0]["data"]["ranking"]["reason"],
            "unsupportedShape"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn single_candidate_skips_provider_without_changing_evidence() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = Runtime {
            limits: Limits {
                enabled: true,
                max_candidates: 64,
                max_chars: 131_072,
                timeout: Duration::from_secs(1),
            },
            available: true,
            judge: std::sync::Arc::new(UncalledJudge),
            handle: executor.handle().clone(),
            context: ExecutionContext {
                cancellation: tokio_util::sync::CancellationToken::new(),
                deadline: Instant::now() + Duration::from_secs(1),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
            home: PathBuf::new(),
            stats_enabled: false,
        };
        let candidate = [Candidate {
            state: Some(json!({"text":"sole evidence"})),
            evidence_chars: 13,
        }];
        let outcome = order(
            Some(&runtime),
            &json!({"goals":["find evidence"]}),
            "source",
            None,
            &candidate,
            None,
        )
        .unwrap_or_else(|_| panic!("single candidate should skip"));
        assert_eq!(outcome.order, vec![0]);
        assert_eq!(outcome.receipt.status, RankingStatus::Skipped);
        assert_eq!(outcome.receipt.reason.as_deref(), Some("singleCandidate"));
    }

    #[test]
    fn skipped_and_replayed_plans_keep_the_order_without_candidate_states() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(ReverseJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"goals":["find evidence"]});
        let with_states = [
            Candidate {
                state: Some(json!({"text":"first"})),
                evidence_chars: 5,
            },
            Candidate {
                state: Some(json!({"text":"second"})),
                evidence_chars: 6,
            },
        ];
        let without_states = [
            Candidate {
                state: None,
                evidence_chars: 0,
            },
            Candidate {
                state: None,
                evidence_chars: 0,
            },
        ];
        runtime.limits.enabled = false;
        let disabled = order(Some(&runtime), &query, "source", None, &with_states, None)
            .unwrap_or_else(|_| panic!("disabled plan"));
        let skipped = order(
            Some(&runtime),
            &query,
            "source",
            None,
            &without_states,
            None,
        )
        .unwrap_or_else(|_| panic!("same disabled plan"));
        assert_eq!(disabled.token, skipped.token);
        assert_eq!(skipped.order, [0, 1]);
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        runtime.limits.enabled = true;
        let ranked = order(Some(&runtime), &query, "source", None, &with_states, None)
            .unwrap_or_else(|_| panic!("ranked plan"));
        assert_eq!(ranked.order, [1, 0]);
        assert!(!needs_candidate_states(
            Some(&runtime),
            Some(&ranked.token),
            None,
            2
        ));
        let replay = order(
            Some(&runtime),
            &query,
            "source",
            Some(&ranked.token),
            &without_states,
            None,
        )
        .unwrap_or_else(|_| panic!("replay without evidence states"));
        assert_eq!(replay.token, ranked.token);
        assert_eq!(replay.order, ranked.order);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(matches!(
            order(
                Some(&runtime),
                &query,
                "changed source",
                Some(&ranked.token),
                &without_states,
                None
            ),
            Err(Failure::Stale)
        ));
    }

    #[test]
    fn binding_uses_canonical_source_identity_across_path_spellings() {
        let limits = Limits {
            enabled: false,
            max_candidates: 0,
            max_chars: 0,
            timeout: Duration::ZERO,
        };
        let absolute = binding(
            &json!({"path":"/workspace/docs/readme.md","goals":["find evidence"]}),
            "/workspace/docs/readme.md:abc123",
            limits,
            None,
        );
        let relative = binding(
            &json!({"path":"docs/readme.md","goals":["find evidence"]}),
            "/workspace/docs/readme.md:abc123",
            limits,
            None,
        );
        assert_eq!(absolute, relative);
        assert_ne!(
            absolute,
            binding(
                &json!({"path":"docs/readme.md","goals":["find evidence"]}),
                "/workspace/other/readme.md:abc123",
                limits,
                None,
            )
        );
    }

    #[test]
    fn token_preserves_a_bounded_permutation_and_rejects_drift() {
        let limits = Limits {
            enabled: false,
            max_candidates: 2,
            max_chars: 100,
            timeout: Duration::from_secs(1),
        };
        let bound = binding(
            &json!({"goals":["find it"],"page":1}),
            "source",
            limits,
            None,
        );
        let mut plan = Plan::new(
            bound.clone(),
            4,
            RankingStatus::Partial,
            RankingScope::SelectedView,
            Some("candidateBudget"),
        );
        plan.ranked = vec![2, 0];
        plan.seal();
        assert!(plan.valid(&bound, 4, RankingScope::SelectedView));
        let outcome = plan.clone().finish();
        assert_eq!(outcome.order, vec![2, 0, 1, 3]);
        assert_eq!(outcome.receipt.ranked_items, 2);
        let decoded: Plan =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(outcome.token).unwrap()).unwrap();
        assert!(decoded.valid(&bound, 4, RankingScope::SelectedView));
        assert!(!decoded.valid("changed", 4, RankingScope::SelectedView));
        assert!(!decoded.valid(&bound, 4, RankingScope::ProviderPage));
        plan.ranked = vec![2, 2];
        plan.seal();
        assert!(!plan.valid(&bound, 4, RankingScope::SelectedView));
        plan.ranked = vec![2, 4];
        plan.seal();
        assert!(!plan.valid(&bound, 4, RankingScope::SelectedView));
        let mut tampered = decoded;
        tampered.ranked = vec![0, 2];
        assert!(!tampered.valid(&bound, 4, RankingScope::SelectedView));
    }

    #[test]
    fn cancelled_judgment_never_becomes_a_fallback_page() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let cancellation = tokio_util::sync::CancellationToken::new();
        cancellation.cancel();
        let runtime = Runtime {
            limits: Limits {
                enabled: true,
                max_candidates: 2,
                max_chars: 100,
                timeout: Duration::from_secs(1),
            },
            available: true,
            judge: std::sync::Arc::new(FailedJudge),
            handle: executor.handle().clone(),
            context: ExecutionContext {
                cancellation,
                deadline: Instant::now() + Duration::from_secs(1),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
            home: PathBuf::new(),
            stats_enabled: false,
        };
        let candidates = [
            Candidate {
                state: Some(json!({"text":"first evidence"})),
                evidence_chars: 14,
            },
            Candidate {
                state: Some(json!({"text":"second evidence"})),
                evidence_chars: 15,
            },
        ];
        assert!(matches!(
            order(
                Some(&runtime),
                &json!({"goals":["find evidence"]}),
                "source",
                None,
                &candidates,
                None
            ),
            Err(Failure::Cancelled)
        ));
    }
}

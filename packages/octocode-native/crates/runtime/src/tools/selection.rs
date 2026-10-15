//! Bounded classification of sanitized evidence before it reaches the host.
//! The plan records disjoint selected/excluded partitions; unjudged evidence is
//! unknown. Replays need source identity and cardinality, not provider calls.
use crate::contracts::tool_types::{Selection, SelectionScope, SelectionStatus, SelectionUnit};
use crate::runtime::ExecutionContext;
use crate::tools::id::ToolId;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::time::{Duration, Instant};

/// Format 4 replaces complete permutations with source-ordered partitions.
const VERSION: u8 = 4;

#[derive(Clone, Copy, Debug)]
pub(crate) struct Limits {
    pub max_candidates: usize,
    pub max_chars: usize,
    pub timeout: Duration,
}

#[derive(Clone)]
pub(crate) struct Runtime {
    pub limits: Limits,
    pub available: bool,
    pub judge: std::sync::Arc<dyn SelectionJudge>,
    pub handle: tokio::runtime::Handle,
    pub context: ExecutionContext,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Decision {
    Selected,
    Excluded,
    Unknown,
}

/// Shared evaluation is injected; readers never own provider implementations.
pub(crate) trait SelectionJudge: Send + Sync {
    fn identity(&self) -> Value;
    fn project(&self, state: Value) -> Value {
        state
    }
    fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String>;
}

pub(crate) struct JudgeCall<'a> {
    pub candidates: &'a [Candidate],
    pub admitted: &'a [usize],
    pub classifiers: &'a [String],
    pub main_goal: Option<&'a str>,
    pub reasoning: Option<&'a str>,
    pub long_context: bool,
    pub limits: Limits,
    pub handle: &'a tokio::runtime::Handle,
    pub context: &'a ExecutionContext,
}

/// One complete sanitized unit. Missing states are unknown, not irrelevant.
pub(crate) struct Candidate {
    pub state: Option<Value>,
    evidence_chars: usize,
}

impl Candidate {
    /// Admission charges serialized sanitized state, including JSON escaping.
    pub(crate) fn new(state: Option<Value>) -> Self {
        let evidence_chars = state
            .as_ref()
            .map_or(0, |state| state.to_string().chars().count());
        Self {
            state,
            evidence_chars,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Plan {
    version: u8,
    binding: String,
    status: SelectionStatus,
    scope: SelectionScope,
    unit: SelectionUnit,
    selected: Vec<u32>,
    excluded: Vec<u32>,
    total: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    checksum: String,
}

pub(crate) struct Outcome {
    pub selected: Vec<usize>,
    pub receipt: Selection,
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
        if !runtime.is_some_and(|runtime| runtime.available) {
            Some("classificationUnavailable")
        } else if total == 0 {
            Some("noCandidates")
        } else {
            None
        }
    })
}

/// Saved plans need cardinality and source binding, not candidate bodies.
pub(crate) fn needs_candidate_states(
    runtime: Option<&Runtime>,
    prior: Option<&str>,
    unsupported: Option<&'static str>,
    total: usize,
) -> bool {
    prior.is_none() && skip_reason(runtime, unsupported, total).is_none()
}

/// Select the sanitized evidence of one provider page. Never hydrate hidden
/// file bodies here; readers declare the evidence their candidate view contains.
pub(crate) fn apply_sanitized_rows(
    tool: ToolId,
    structured: &mut Value,
    queries: &[Value],
    row_indices: &[usize],
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
        if query.get("clasifyContext").is_none() && query.get("selection").is_none() {
            continue;
        }
        let failed = row["status"] == "error";
        let data = &mut row["data"];
        if failed {
            let total = data["files"].as_array().map_or(0, Vec::len);
            if !data.is_object() {
                *data = json!({});
            }
            if let Some(fields) = data.as_object_mut() {
                fields.remove("files");
            }
            data["selection"] = unavailable_receipt(total, "sourceUnavailable");
            if !data["next"].is_object() {
                data["next"] = json!({});
            }
            data["next"]["unfiltered"] = unfiltered(tool, query);
            continue;
        }
        if !data.is_object() {
            *data = json!({});
        }
        let Some(values) = data["files"].as_array().cloned() else {
            row["status"] = json!("error");
            row["data"] = json!({
                "errorCode":"invalidClassificationView",
                "error":"Classification requires an array of source evidence candidates.",
                "selection": unavailable_receipt(0, "invalidClassificationView"),
                "next":{"unfiltered":unfiltered(tool, query)}
            });
            continue;
        };
        let states = values
            .iter()
            .map(|item| runtime.judge.project(json!({"evidence":item})))
            .collect::<Vec<_>>();
        let source = candidate_source_digest(tool, query, data, &states);
        let candidates = values
            .iter()
            .zip(states)
            .map(|(item, state)| {
                let has_text = item["lines"].as_array().is_some_and(|lines| {
                    lines
                        .iter()
                        .any(|line| line.as_str().is_some_and(|value| !value.trim().is_empty()))
                }) || item["matches"].as_array().is_some_and(|matches| {
                    matches.iter().any(|matched| {
                        matched["value"]
                            .as_str()
                            .is_some_and(|value| !value.trim().is_empty())
                    })
                });
                Candidate::new(has_text.then_some(state))
            })
            .collect::<Vec<_>>();
        let outcome = match select_scoped(
            Some(runtime),
            query,
            &source,
            query["selection"].as_str(),
            &candidates,
            None,
            SelectionScope::ProviderPage,
            SelectionUnit::Files,
        ) {
            Ok(outcome) => outcome,
            Err(Failure::Cancelled) => return Err(crate::runtime::ExecutionError::Cancelled),
            Err(Failure::Stale) => {
                let stale = crate::tools::result::stale_snapshot(
                    crate::tools::result::restart_query(tool, query),
                );
                row["data"] = json!({
                    "errorCode":stale["errorCode"],
                    "error":crate::response::pages::STALE_SNAPSHOT_ERROR,
                    "next":stale["next"],
                });
                row["status"] = stale["status"].clone();
                continue;
            }
        };
        data["files"] = json!(
            outcome
                .selected
                .iter()
                .map(|&i| &values[i])
                .collect::<Vec<_>>()
        );
        data["selection"] = serde_json::to_value(&outcome.receipt).unwrap_or(Value::Null);
        strip_plan_from_tool_continuations(data, tool);
        if !data["next"].is_object() {
            data["next"] = json!({});
        }
        data["next"]["unfiltered"] = unfiltered(tool, query);
        let response_row = if queries.len() == 1 {
            Some(&mut *response_query)
        } else {
            response_query.pointer_mut(&format!("/queries/{admitted_index}"))
        };
        if let Some(response_row) = response_row.and_then(Value::as_object_mut) {
            response_row.insert("selection".into(), json!(outcome.token));
        }
    }
    Ok(())
}

fn unavailable_receipt(total: usize, reason: &str) -> Value {
    let total = i64::try_from(total).unwrap_or(i64::MAX);
    serde_json::to_value(Selection {
        status: SelectionStatus::Unavailable,
        scope: SelectionScope::ProviderPage,
        unit: SelectionUnit::Files,
        total_items: total,
        selected_items: 0,
        excluded_items: 0,
        unknown_items: total,
        reason: Some(reason.into()),
    })
    .unwrap_or(Value::Null)
}

/// The provider page is part of source identity, not response-output paging.
fn unfiltered(tool: ToolId, query: &Value) -> Value {
    let mut query = query.clone();
    if let Some(fields) = query.as_object_mut() {
        for key in [
            "clasifyContext",
            "selection",
            "offset",
            "length",
            "unit",
            "fullContent",
            "matchPage",
        ] {
            fields.remove(key);
        }
    }
    json!({"tool":tool.as_str(), "query":{"queries":[query]}})
}

fn candidate_source_digest(tool: ToolId, query: &Value, data: &Value, states: &[Value]) -> String {
    let mut source = json!({
        "tool":tool.as_str(), "path":query.get("path"),
        "owner":query.get("owner"), "repo":query.get("repo"), "page":query.get("page"),
        "sourceOwner":data.get("owner"), "sourceRepo":data.get("repo"),
        "commitSha":data.get("commitSha"),
        "items":states,
    });
    source.sort_all_objects();
    crate::digest::json_sha256(&source)
}

/// Only the response pager replays this plan; tool continuations change the
/// candidate set. Do not traverse arbitrary tool-shaped JSON inside evidence.
fn strip_plan_from_tool_continuations(value: &mut Value, tool: ToolId) {
    let Some(fields) = value.as_object_mut() else {
        return;
    };
    for name in ["next", "hints"] {
        if let Some(leads) = fields.get_mut(name).and_then(Value::as_object_mut) {
            for lead in leads.values_mut() {
                scrub_lead(lead, tool, name == "hints");
            }
        }
    }
    for name in ["files", "matches"] {
        if let Some(items) = fields.get_mut(name).and_then(Value::as_array_mut) {
            for item in items {
                strip_plan_from_tool_continuations(item, tool);
            }
        }
    }
}

fn scrub_lead(lead: &mut Value, tool: ToolId, hint: bool) {
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
        row.remove("selection");
        if hint || !same_tool {
            row.remove("clasifyContext");
        }
    }
}

impl Plan {
    fn new(
        binding: String,
        total: usize,
        status: SelectionStatus,
        scope: SelectionScope,
        unit: SelectionUnit,
        reason: Option<&str>,
    ) -> Self {
        Self {
            version: VERSION,
            binding,
            status,
            scope,
            unit,
            selected: Vec::new(),
            excluded: Vec::new(),
            total: u32::try_from(total).unwrap_or(u32::MAX),
            reason: reason.map(str::to_owned),
            checksum: String::new(),
        }
    }

    fn digest(&self) -> String {
        crate::digest::json_sha256(&json!({
            "version":self.version, "binding":self.binding, "status":self.status,
            "scope":self.scope, "unit":self.unit, "selected":self.selected,
            "excluded":self.excluded, "total":self.total, "reason":self.reason,
        }))
    }

    fn seal(&mut self) {
        self.checksum = self.digest();
    }

    fn valid(
        &self,
        binding: &str,
        total: usize,
        scope: SelectionScope,
        unit: SelectionUnit,
    ) -> bool {
        if self.version != VERSION
            || self.binding != binding
            || self.scope != scope
            || self.unit != unit
            || usize::try_from(self.total).ok() != Some(total)
            || self.selected.len().saturating_add(self.excluded.len()) > total
            || self.checksum != self.digest()
        {
            return false;
        }
        let mut seen = HashSet::with_capacity(self.selected.len() + self.excluded.len());
        if !self.selected.iter().chain(&self.excluded).all(|ordinal| {
            usize::try_from(*ordinal).is_ok_and(|i| i < total) && seen.insert(*ordinal)
        }) {
            return false;
        }
        let judged = self.selected.len() + self.excluded.len();
        match self.status {
            SelectionStatus::Complete => judged == total,
            SelectionStatus::Partial => judged < total,
            SelectionStatus::Unavailable => judged == 0,
        }
    }

    fn finish(mut self) -> Outcome {
        self.selected.sort_unstable();
        self.excluded.sort_unstable();
        self.seal();
        let selected = self.selected.iter().map(|&i| i as usize).collect();
        let receipt = Selection {
            status: self.status,
            scope: self.scope,
            unit: self.unit,
            selected_items: self.selected.len() as i64,
            excluded_items: self.excluded.len() as i64,
            unknown_items: i64::from(self.total)
                - self.selected.len() as i64
                - self.excluded.len() as i64,
            total_items: i64::from(self.total),
            reason: self.reason.clone(),
        };
        let token = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&self).unwrap_or_default());
        Outcome {
            selected,
            receipt,
            token,
        }
    }
}

/// Bind assessment semantics, including optional research context. Pagination
/// cursors are excluded; canonical source identity owns path spelling.
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
            "selection",
            "page",
            "matchPage",
            "pageSize",
            "matchPageSize",
            "offset",
            "length",
            "unit",
            "fullContent",
            "extras",
            "path",
        ] {
            map.remove(field);
        }
    }
    crate::digest::json_sha256(&octocode_engine::digest::canonicalize_dropping_nulls(
        json!({
            "version":VERSION, "source":source, "query":selected,
            "settings":{
                "available":runtime.is_some_and(|runtime| runtime.available),
                "maxCandidates":limits.max_candidates, "maxChars":limits.max_chars,
                "timeoutMs":limits.timeout.as_millis(),
            },
            "provider":runtime.map(|runtime| runtime.judge.identity()),
        }),
    ))
}

pub(crate) fn select(
    runtime: Option<&Runtime>,
    query: &Value,
    source: &str,
    prior: Option<&str>,
    candidates: &[Candidate],
    unsupported: Option<&'static str>,
    unit: SelectionUnit,
) -> Result<Outcome, Failure> {
    select_scoped(
        runtime,
        query,
        source,
        prior,
        candidates,
        unsupported,
        SelectionScope::SelectedView,
        unit,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn select_scoped(
    runtime: Option<&Runtime>,
    query: &Value,
    source: &str,
    prior: Option<&str>,
    candidates: &[Candidate],
    unsupported: Option<&'static str>,
    scope: SelectionScope,
    unit: SelectionUnit,
) -> Result<Outcome, Failure> {
    let limits = runtime.map_or(
        Limits {
            max_candidates: 0,
            max_chars: 0,
            timeout: Duration::ZERO,
        },
        |r| r.limits,
    );
    let bound = binding(query, source, limits, runtime);
    if let Some(token) = prior {
        let bytes = URL_SAFE_NO_PAD.decode(token).map_err(|_| Failure::Stale)?;
        let plan: Plan = serde_json::from_slice(&bytes).map_err(|_| Failure::Stale)?;
        return plan
            .valid(&bound, candidates.len(), scope, unit)
            .then(|| plan.finish())
            .ok_or(Failure::Stale);
    }
    let mut plan = Plan::new(
        bound,
        candidates.len(),
        SelectionStatus::Partial,
        scope,
        unit,
        None,
    );
    if let Some(reason) = skip_reason(runtime, unsupported, candidates.len()) {
        plan.status = if candidates.is_empty() && reason == "noCandidates" {
            SelectionStatus::Complete
        } else {
            SelectionStatus::Unavailable
        };
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
    let eligible = candidates
        .iter()
        .filter(|candidate| candidate.state.is_some())
        .count();
    let omitted_reason = match (eligible < candidates.len(), admitted.len() < eligible) {
        (true, true) => "candidateEligibilityAndBudget",
        (true, false) => "candidateIneligible",
        _ => "candidateBudget",
    };
    if admitted.is_empty() {
        plan.reason = Some(omitted_reason.into());
        return Ok(plan.finish());
    }
    let Some(runtime) = runtime else {
        return Ok(plan.finish());
    };
    let context = &query["clasifyContext"];
    let classifiers = context["classifiers"]
        .as_array()
        .filter(|v| !v.is_empty())
        .ok_or(Failure::Stale)?
        .iter()
        .map(|classifier| classifier.as_str().map(str::to_owned))
        .collect::<Option<Vec<_>>>()
        .ok_or(Failure::Stale)?;
    let outcomes = runtime.judge.select(JudgeCall {
        candidates,
        admitted: &admitted,
        classifiers: &classifiers,
        main_goal: query["mainGoal"].as_str(),
        reasoning: query["reasoning"].as_str(),
        long_context: context["longContext"].as_bool().unwrap_or(false),
        limits: runtime.limits,
        handle: &runtime.handle,
        context: &runtime.context,
    });
    if runtime.context.cancellation.is_cancelled() || Instant::now() >= runtime.context.deadline {
        return Err(Failure::Cancelled);
    }
    match outcomes {
        Ok(outcomes) => {
            let admitted_set = admitted.iter().copied().collect::<HashSet<_>>();
            let mut seen = HashSet::new();
            let mut decisions = vec![Decision::Unknown; candidates.len()];
            for (ordinal, decision) in outcomes {
                if !admitted_set.contains(&ordinal) {
                    continue;
                }
                if !seen.insert(ordinal) {
                    decisions[ordinal] = Decision::Unknown;
                    continue;
                }
                decisions[ordinal] = decision;
            }
            for (ordinal, decision) in decisions.iter().enumerate() {
                match decision {
                    Decision::Selected => plan.selected.push(ordinal as u32),
                    Decision::Excluded => plan.excluded.push(ordinal as u32),
                    Decision::Unknown => {}
                }
            }
            let known = plan.selected.len() + plan.excluded.len();
            if known == candidates.len() {
                plan.status = SelectionStatus::Complete;
            } else {
                plan.reason = Some(
                    if admitted.len() < candidates.len() {
                        omitted_reason
                    } else {
                        "classificationUnknown"
                    }
                    .into(),
                );
            }
        }
        Err(reason) => {
            plan.status = SelectionStatus::Unavailable;
            plan.reason = Some(reason);
        }
    }
    Ok(plan.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn context_selection_plan_returns_only_selected_ordinals_in_source_order() {
        let mut plan = Plan::new(
            "source-and-context".into(),
            4,
            SelectionStatus::Partial,
            SelectionScope::SelectedView,
            SelectionUnit::Files,
            Some("candidateBudget"),
        );
        plan.selected = vec![2, 0];
        let outcome = plan.finish();

        assert_eq!(
            outcome.selected,
            [0, 2],
            "unjudged units must not be appended or selected evidence reordered"
        );
    }

    #[test]
    fn context_selection_binds_optional_research_context() {
        let limits = Limits {
            max_candidates: 4,
            max_chars: 100,
            timeout: Duration::from_secs(1),
        };
        let query = json!({
            "clasifyContext":{"classifiers":["Does this evidence describe retry termination?"]}
        });
        let ordinary = binding(&query, "source", limits, None);
        for field in ["mainGoal", "reasoning"] {
            let mut contextual = query.clone();
            contextual[field] = json!("Distinguish current behavior from archived behavior");
            assert_ne!(
                ordinary,
                binding(&contextual, "source", limits, None),
                "changing supplied {field} must invalidate the prior judgment"
            );
        }
    }

    #[test]
    fn selected_output_paging_controls_do_not_change_assessment_binding() {
        let limits = Limits {
            max_candidates: 4,
            max_chars: 100,
            timeout: Duration::from_secs(1),
        };
        let query = json!({"clasifyContext":{"classifiers":["Find retry termination"]},
            "ranges":["1-40"],"unit":"lines","length":10});
        let mut continued = query.clone();
        continued["unit"] = json!("bytes");
        continued["fullContent"] = json!(true);
        continued["length"] = json!(20);
        continued["offset"] = json!(10);
        assert_eq!(
            binding(&query, "same-source", limits, None),
            binding(&continued, "same-source", limits, None)
        );
        continued["ranges"] = json!(["41-80"]);
        assert_ne!(
            binding(&query, "same-source", limits, None),
            binding(&continued, "same-source", limits, None)
        );
    }

    #[test]
    fn context_selection_still_assesses_a_single_candidate() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = test_runtime(std::sync::Arc::new(FailedJudge), executor.handle().clone());

        assert!(
            needs_candidate_states(Some(&runtime), None, None, 1),
            "one unread candidate can be irrelevant and must be assessed"
        );
        assert!(!needs_candidate_states(
            Some(&runtime),
            Some("saved-plan"),
            None,
            1
        ));
    }

    #[test]
    fn context_selection_failure_withholds_all_unknown_bodies() {
        let plan = Plan::new(
            "source-and-context".into(),
            3,
            SelectionStatus::Unavailable,
            SelectionScope::SelectedView,
            SelectionUnit::Files,
            Some("providerUnavailable"),
        );
        let outcome = plan.finish();

        assert!(
            outcome.selected.is_empty(),
            "a failed judgment is unknown and must not become an unfiltered body"
        );
        let receipt = serde_json::to_value(outcome.receipt).expect("receipt");
        assert_eq!(receipt["unknownItems"], 3);
        assert_eq!(receipt["excludedItems"], 0);
    }

    #[test]
    fn context_selection_activates_without_optional_research_metadata() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({
            "owner":"a", "repo":"b", "keywords":["retry"],
            "clasifyContext":{"classifiers":["Does this evidence state when retries stop?"]}
        });
        let mut structured = json!({"results":[{"index":0,"data":{"files":[
            {"path":"a.rs","matches":[{"line":1,"value":"stop after three attempts"}]},
            {"path":"b.rs","matches":[{"line":1,"value":"start a new attempt"}]}
        ]}}]});
        let mut response_query = query.clone();

        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut structured,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("classified page without optional metadata");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(structured["results"][0]["data"].get("selection").is_some());
        assert!(structured["results"][0]["data"].get("ranking").is_none());
        assert!(response_query.get("selection").is_some());
        assert!(response_query.get("ranking").is_none());
    }

    struct FailedJudge;
    impl SelectionJudge for FailedJudge {
        fn identity(&self) -> Value {
            json!({"backend":"test"})
        }
        fn select(&self, _call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
            Err("providerUnavailable".into())
        }
    }

    #[test]
    fn empty_selection_preserves_provider_page_and_unfiltered_recovery() {
        struct ExcludingJudge(std::sync::Arc<AtomicUsize>);
        impl SelectionJudge for ExcludingJudge {
            fn identity(&self) -> Value {
                json!({"test":"exclude"})
            }
            fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
                self.0.fetch_add(1, Ordering::SeqCst);
                Ok(call
                    .admitted
                    .iter()
                    .map(|&i| (i, Decision::Excluded))
                    .collect())
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(ExcludingJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"o","repo":"r","page":3,"keywords":["retry"],
            "clasifyContext":{"classifiers":["Does it state the termination condition?"]}});
        let original = json!({"results":[{"index":0,"data":{
            "files":[{"path":"retry.rs","lines":["UNRELATED_SENTINEL"]}],
            "next":{"nextPage":{"tool":"ghSearchCode","query":{"queries":[{
                "owner":"o","repo":"r","page":4,"keywords":["retry"],
                "clasifyContext":{"classifiers":["Does it state the termination condition?"]},
                "selection":"old-plan"
            }]}}}
        }}]});
        let mut selected = original.clone();
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut selected,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("selected provider page");
        let data = &selected["results"][0]["data"];
        assert_eq!(data["files"], json!([]));
        assert_eq!(data["selection"]["excludedItems"], 1);
        assert_eq!(data["selection"]["unknownItems"], 0);
        let provider_next = &data["next"]["nextPage"]["query"]["queries"][0];
        assert_eq!(provider_next["page"], 4);
        assert!(provider_next.get("selection").is_none());
        assert!(provider_next.get("clasifyContext").is_some());
        let recovery = data["next"]["unfiltered"]["query"]["queries"][0].clone();
        assert_eq!(recovery["page"], 3, "recover the same provider page");
        assert!(recovery.get("clasifyContext").is_none());
        assert!(recovery.get("selection").is_none());
        let mut unfiltered_page = original.clone();
        let mut unfiltered_query = recovery.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut unfiltered_page,
            &[recovery],
            &[0],
            &mut unfiltered_query,
            &runtime,
        )
        .expect("explicit ordinary recovery");
        assert_eq!(unfiltered_page, original);
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "recovery makes no judgment"
        );
    }

    #[test]
    fn path_only_candidates_are_unknown_without_provider_work() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"o","repo":"r","keywords":["retry"],
            "clasifyContext":{"classifiers":["Does this show a stopping condition?"]}});
        let mut output = json!({"results":[{"index":0,"data":{"files":[{"path":"retry.rs"}]}}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut output,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("unknown path-only view");
        let data = &output["results"][0]["data"];
        assert_eq!(data["files"], json!([]));
        assert_eq!(data["selection"]["unknownItems"], 1);
        assert_eq!(data["selection"]["excludedItems"], 0);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn source_failure_keeps_selection_coverage_visible_without_returning_partial_bodies() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"clasifyContext":{"classifiers":["Does it describe retries?"]}});
        let mut output = json!({"results":[{"index":0,"status":"error","data":{
            "errorCode":"providerUnavailable","files":[{"path":"a.rs","lines":["UNJUDGED_BODY"]}]
        }}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut output,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("failed source has a selection receipt");
        let data = &output["results"][0]["data"];
        assert_eq!(data["errorCode"], "providerUnavailable");
        assert!(data.get("files").is_none());
        assert_eq!(data["selection"]["status"], "unavailable");
        assert_eq!(data["selection"]["unknownItems"], 1);
        assert!(data["next"].get("unfiltered").is_some());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    struct SelectedJudge(std::sync::Arc<AtomicUsize>);
    impl SelectionJudge for SelectedJudge {
        fn identity(&self) -> Value {
            json!({"backend":"reverse-test"})
        }
        fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(call
                .admitted
                .iter()
                .map(|&ordinal| (ordinal, Decision::Selected))
                .collect())
        }
    }

    fn test_runtime(
        judge: std::sync::Arc<dyn SelectionJudge>,
        handle: tokio::runtime::Handle,
    ) -> Runtime {
        Runtime {
            limits: Limits {
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
        }
    }

    #[test]
    fn candidate_budget_counts_serialized_characters_in_source_order() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let candidates = [
            Candidate::new(Some(json!({"text":"é\n\""}))),
            Candidate::new(Some(json!({"text":"longer than the remaining budget"}))),
            Candidate::new(Some(json!({"text":"é\n\""}))),
        ];
        assert_eq!(candidates[0].evidence_chars, 16);
        runtime.limits.max_chars = 32;
        let outcome = select(
            Some(&runtime),
            &json!({"clasifyContext":{"classifiers":["find evidence"]}}),
            "source",
            None,
            &candidates,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("budgeted order"));
        assert_eq!(outcome.selected, [0, 2]);
        assert_eq!(outcome.receipt.status, SelectionStatus::Partial);
        assert_eq!(outcome.receipt.reason.as_deref(), Some("candidateBudget"));
        assert_eq!(outcome.receipt.selected_items, 2);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn partial_receipts_distinguish_ineligible_evidence_from_budgets() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(std::sync::Arc::new(AtomicUsize::new(0)))),
            executor.handle().clone(),
        );
        let candidates = [
            Candidate::new(Some(json!({"text":"first"}))),
            Candidate::new(Some(json!({"text":"second"}))),
            Candidate::new(None),
        ];
        let query = json!({"clasifyContext":{"classifiers":["find evidence"]}});
        let eligible = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &candidates,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("partial order"));
        assert_eq!(eligible.selected, [0, 1]);
        assert_eq!(
            eligible.receipt.reason.as_deref(),
            Some("candidateIneligible")
        );
        runtime.limits.max_candidates = 1;
        let budgeted = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &candidates,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("budgeted order"));
        assert_eq!(budgeted.selected, [0]);
        assert_eq!(
            budgeted.receipt.reason.as_deref(),
            Some("candidateEligibilityAndBudget")
        );
        runtime.limits.max_candidates = 64;
        let no_states = [Candidate::new(None), Candidate::new(None)];
        let skipped = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &no_states,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("ineligible order"));
        assert_eq!(skipped.receipt.status, SelectionStatus::Partial);
        assert_eq!(
            skipped.receipt.reason.as_deref(),
            Some("candidateIneligible")
        );
    }

    #[test]
    fn code_page_selects_in_source_order_and_replays_without_a_second_judgment() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"a","repo":"b","keywords":["target"],"clasifyContext":{"classifiers":["wanted evidence"]}});
        let baseline = json!({"results":[{"index":0,"data":{"files":[
            {"path":"one.rs","lines":["source evidence"]},{"path":"two.rs","lines":["source evidence"]},{"path":"three.rs","lines":["source evidence"]}
        ],"pagination":{"currentPage":1,"hasMore":true}}}]});
        let mut first = baseline.clone();
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut first,
            std::slice::from_ref(&query),
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("first page");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            first["results"][0]["data"]["selection"]["scope"],
            "providerPage"
        );
        assert_eq!(
            first["results"][0]["data"]["files"],
            json!([{"path":"one.rs","lines":["source evidence"]},{"path":"two.rs","lines":["source evidence"]},{"path":"three.rs","lines":["source evidence"]}])
        );
        assert!(response_query.get("selection").is_some());

        let mut replay = baseline;
        let mut replay_query = response_query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut replay,
            &[response_query],
            &[0],
            &mut replay_query,
            &runtime,
        )
        .expect("replay");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            replay["results"][0]["data"]["files"],
            first["results"][0]["data"]["files"]
        );
    }

    #[test]
    fn every_tool_continuation_starts_a_new_candidate_plan() {
        let mut data = json!({"next":{"nextPage":{"tool":"ghSearchCode","query":{"queries":[{"page":2,"selection":"old"}]}},
            "read":{"tool":"ghGetFileContent","query":{"queries":[{"path":"a.rs","clasifyContext":{"classifiers":["old"]},"selection":"old"}]}}},
            "hints":{"verify":{"tool":"ghGetFileContent","query":{"queries":[{"path":"a.rs","clasifyContext":{"classifiers":["old"]},"selection":"old"}]}}},
            "files":[{"evidence":{"tool":"ghSearchCode","query":{"queries":[{"clasifyContext":{"classifiers":["source"]},"selection":"source"}]},"next":{"sourceValue":{"tool":"ghSearchCode","query":{"queries":[{"selection":"source"}]}}}},"next":{"nextMatchPage":{"tool":"ghSearchCode","query":{"queries":[{"matchPage":2,"clasifyContext":{"classifiers":["old"]},"selection":"old"}]}}}}]});
        strip_plan_from_tool_continuations(&mut data, ToolId::GhSearchCode);
        assert!(
            data["next"]["nextPage"]["query"]["queries"][0]
                .get("selection")
                .is_none()
        );
        assert!(
            data["next"]["read"]["query"]["queries"][0]
                .get("selection")
                .is_none()
        );
        assert!(
            data["next"]["read"]["query"]["queries"][0]
                .get("clasifyContext")
                .is_none()
        );
        assert!(
            data["hints"]["verify"]["query"]["queries"][0]
                .get("clasifyContext")
                .is_none()
        );
        assert!(
            data["files"][0]["next"]["nextMatchPage"]["query"]["queries"][0]
                .get("selection")
                .is_none()
        );
        assert_eq!(
            data["files"][0]["next"]["nextMatchPage"]["query"]["queries"][0]["clasifyContext"]["classifiers"],
            json!(["old"])
        );
        assert_eq!(
            data["files"][0]["evidence"]["query"]["queries"][0]["selection"],
            "source"
        );
        assert_eq!(
            data["files"][0]["evidence"]["next"]["sourceValue"]["query"]["queries"][0]["selection"],
            "source"
        );
    }

    #[test]
    fn rejected_rows_do_not_misalign_goal_queries() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let plain = json!({"owner":"a","repo":"b","keywords":["target"]});
        let goal = json!({"owner":"a","repo":"b","keywords":["target"],"clasifyContext":{"classifiers":["wanted"]}});
        let mut structured = json!({"results":[
            {"index":0,"status":"error","data":{"errorCode":"invalidInput"}},
            {"index":1,"data":{"files":[{"path":"one.rs","lines":["source evidence"]},{"path":"two.rs","lines":["source evidence"]}]}},
            {"index":2,"data":{"files":[{"path":"three.rs","lines":["source evidence"]},{"path":"four.rs","lines":["source evidence"]}]}}
        ]});
        let mut response_query = json!({"queries":[plain.clone(),goal.clone()]});
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut structured,
            &[plain, goal],
            &[1, 2],
            &mut response_query,
            &runtime,
        )
        .expect("mixed rows");
        assert!(structured["results"][1]["data"].get("selection").is_none());
        assert_eq!(
            structured["results"][2]["data"]["selection"]["status"],
            "complete"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(response_query["queries"][0].get("selection").is_none());
        assert!(response_query["queries"][1].get("selection").is_some());
    }

    #[test]
    fn malformed_code_page_fails_clearly_and_skips_judgment() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"a","repo":"b","keywords":["target"],"clasifyContext":{"classifiers":["wanted"]}});
        let files = json!({"unexpected":"shape"});
        let mut structured =
            json!({"results":[{"index":0,"data":{"files":files,"marker":"retain"}}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut structured,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("malformed page");
        assert!(structured["results"][0]["data"].get("files").is_none());
        assert_eq!(structured["results"][0]["status"], "error");
        assert_eq!(
            structured["results"][0]["data"]["selection"]["reason"],
            "invalidClassificationView"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn single_candidate_is_assessed_and_can_be_excluded() {
        struct ExcludingJudge;
        impl SelectionJudge for ExcludingJudge {
            fn identity(&self) -> Value {
                json!({"backend":"exclude"})
            }
            fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
                assert_eq!(call.admitted, [0]);
                Ok(vec![(0, Decision::Excluded)])
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = test_runtime(
            std::sync::Arc::new(ExcludingJudge),
            executor.handle().clone(),
        );
        let candidate = [Candidate::new(Some(json!({"text":"sole evidence"})))];
        let outcome = select(
            Some(&runtime),
            &json!({"clasifyContext":{"classifiers":["find evidence"]}}),
            "source",
            None,
            &candidate,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("single candidate should be judged"));
        assert!(outcome.selected.is_empty());
        assert_eq!(outcome.receipt.status, SelectionStatus::Complete);
        assert_eq!(outcome.receipt.excluded_items, 1);
        assert_eq!(outcome.receipt.unknown_items, 0);
    }

    #[test]
    fn skipped_and_replayed_plans_keep_the_order_without_candidate_states() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"clasifyContext":{"classifiers":["find evidence"]},"mainGoal":"Explain retry policy","reasoning":"Locate stopping conditions"});
        let with_states = [
            Candidate::new(Some(json!({"text":"first"}))),
            Candidate::new(Some(json!({"text":"second"}))),
        ];
        let without_states = [Candidate::new(None), Candidate::new(None)];
        runtime.available = false;
        let disabled = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &with_states,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("disabled plan"));
        let skipped = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &without_states,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("same disabled plan"));
        assert_eq!(disabled.token, skipped.token);
        assert!(skipped.selected.is_empty());
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        runtime.available = true;
        let selected = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &with_states,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("selected plan"));
        assert_eq!(selected.selected, [0, 1]);
        assert!(!needs_candidate_states(
            Some(&runtime),
            Some(&selected.token),
            None,
            2
        ));
        let replay = select(
            Some(&runtime),
            &query,
            "source",
            Some(&selected.token),
            &without_states,
            None,
            SelectionUnit::Files,
        )
        .unwrap_or_else(|_| panic!("replay without evidence states"));
        assert_eq!(replay.token, selected.token);
        assert_eq!(replay.selected, selected.selected);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        for field in ["mainGoal", "reasoning"] {
            let mut changed = query.clone();
            changed[field] = json!("different research context");
            assert!(
                matches!(
                    select(
                        Some(&runtime),
                        &changed,
                        "source",
                        Some(&selected.token),
                        &without_states,
                        None,
                        SelectionUnit::Files
                    ),
                    Err(Failure::Stale)
                ),
                "changing {field} must invalidate a saved selection"
            );
        }
        let mut changed_capability = query.clone();
        changed_capability["clasifyContext"]["longContext"] = json!(true);
        assert!(matches!(
            select(
                Some(&runtime),
                &changed_capability,
                "source",
                Some(&selected.token),
                &without_states,
                None,
                SelectionUnit::Files
            ),
            Err(Failure::Stale)
        ));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "stale context does not rejudge one page"
        );
        assert!(matches!(
            select(
                Some(&runtime),
                &query,
                "changed source",
                Some(&selected.token),
                &without_states,
                None,
                SelectionUnit::Files
            ),
            Err(Failure::Stale)
        ));
    }

    #[test]
    fn only_code_search_selects_at_the_response_boundary() {
        // Local search/fetch and GitHub file reads rank before their own
        // source pagination; the engine calls `apply_sanitized_rows` only for
        // a tool whose output says it ranks one provider page.
        let boundary = ToolId::ALL
            .into_iter()
            .filter(|tool| tool.output().selects_provider_page())
            .collect::<Vec<_>>();
        assert_eq!(boundary, [ToolId::GhSearchCode]);
    }

    #[test]
    fn binding_uses_canonical_source_identity_across_path_spellings() {
        let limits = Limits {
            max_candidates: 0,
            max_chars: 0,
            timeout: Duration::ZERO,
        };
        let absolute = binding(
            &json!({"path":"/workspace/docs/readme.md","clasifyContext":{"classifiers":["find evidence"]}}),
            "/workspace/docs/readme.md:abc123",
            limits,
            None,
        );
        let relative = binding(
            &json!({"path":"docs/readme.md","clasifyContext":{"classifiers":["find evidence"]}}),
            "/workspace/docs/readme.md:abc123",
            limits,
            None,
        );
        assert_eq!(absolute, relative);
        assert_ne!(
            absolute,
            binding(
                &json!({"path":"docs/readme.md","clasifyContext":{"classifiers":["find evidence"]}}),
                "/workspace/other/readme.md:abc123",
                limits,
                None,
            )
        );
    }

    #[test]
    fn selected_page_rejects_null_evidence_drift_but_accepts_key_reordering() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"o","repo":"r","keywords":["queue"],"clasifyContext":{"classifiers":["find queue"]}});
        let original = json!({"results":[{"index":0,"data":{"files":[
            {"path":"a.rs","detail":null,"lines":["source evidence"]},
            {"path":"b.rs","lines":["source evidence"]}
        ]}}]});
        let mut first = original.clone();
        let mut replay_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut first,
            std::slice::from_ref(&query),
            &[0],
            &mut replay_query,
            &runtime,
        )
        .expect("initial selected page");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            first["results"][0]["data"]["selection"]["status"],
            "complete"
        );

        let mut same_evidence = json!({"results":[{"index":0,"data":{"files":[
            {"lines":["source evidence"],"detail":null,"path":"a.rs"},
            {"path":"b.rs","lines":["source evidence"]}
        ]}}]});
        let mut same_response = replay_query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut same_evidence,
            std::slice::from_ref(&replay_query),
            &[0],
            &mut same_response,
            &runtime,
        )
        .expect("same source with reordered object keys");
        assert_eq!(
            same_evidence["results"][0]["data"]["selection"]["status"],
            "complete"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1, "replay does not rescore");

        let mut changed = original;
        changed["results"][0]["data"]["files"][0]
            .as_object_mut()
            .expect("file object")
            .remove("detail");
        let mut changed_response = replay_query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut changed,
            &[replay_query],
            &[0],
            &mut changed_response,
            &runtime,
        )
        .expect("changed source is reported in its row");
        assert_eq!(changed["results"][0]["status"], "error");
        assert_eq!(changed["results"][0]["data"]["errorCode"], "staleSnapshot");
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "stale replay does not rescore"
        );
    }

    #[test]
    fn token_preserves_disjoint_partitions_and_rejects_drift() {
        let limits = Limits {
            max_candidates: 2,
            max_chars: 100,
            timeout: Duration::from_secs(1),
        };
        let bound = binding(
            &json!({"clasifyContext":{"classifiers":["find it"]},"page":1}),
            "source",
            limits,
            None,
        );
        let mut plan = Plan::new(
            bound.clone(),
            4,
            SelectionStatus::Partial,
            SelectionScope::SelectedView,
            SelectionUnit::Files,
            Some("candidateBudget"),
        );
        plan.selected = vec![2, 0];
        plan.seal();
        assert!(plan.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        let outcome = plan.clone().finish();
        assert_eq!(outcome.selected, vec![0, 2]);
        assert_eq!(outcome.receipt.selected_items, 2);
        let decoded: Plan =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(outcome.token).unwrap()).unwrap();
        assert!(decoded.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        assert!(!decoded.valid(
            "changed",
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        assert!(!decoded.valid(
            &bound,
            4,
            SelectionScope::ProviderPage,
            SelectionUnit::Files
        ));
        let mut previous_policy = decoded.clone();
        previous_policy.version = VERSION - 1;
        previous_policy.seal();
        assert!(!previous_policy.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        plan.selected = vec![2, 2];
        plan.seal();
        assert!(!plan.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        plan.selected = vec![2, 4];
        plan.seal();
        assert!(!plan.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
        plan.selected = vec![0];
        plan.excluded = vec![0];
        plan.seal();
        assert!(
            !plan.valid(
                &bound,
                4,
                SelectionScope::SelectedView,
                SelectionUnit::Files
            ),
            "selected and excluded partitions must be disjoint"
        );
        assert!(
            !decoded.valid(
                &bound,
                4,
                SelectionScope::SelectedView,
                SelectionUnit::Chunks
            ),
            "the same ordinals cannot be reinterpreted as another evidence unit"
        );
        let mut tampered = decoded;
        tampered.selected = vec![2, 0];
        assert!(!tampered.valid(
            &bound,
            4,
            SelectionScope::SelectedView,
            SelectionUnit::Files
        ));
    }

    #[test]
    fn cancelled_judgment_never_becomes_a_fallback_page() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let cancellation = tokio_util::sync::CancellationToken::new();
        cancellation.cancel();
        let runtime = Runtime {
            limits: Limits {
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
        };
        let candidates = [
            Candidate::new(Some(json!({"text":"first evidence"}))),
            Candidate::new(Some(json!({"text":"second evidence"}))),
        ];
        assert!(matches!(
            select(
                Some(&runtime),
                &json!({"clasifyContext":{"classifiers":["find evidence"]}}),
                "source",
                None,
                &candidates,
                None,
                SelectionUnit::Files
            ),
            Err(Failure::Cancelled)
        ));
    }
}

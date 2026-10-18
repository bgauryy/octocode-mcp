//! Bounded classification of sanitized evidence before it reaches the host.
//! The plan records disjoint selected/excluded partitions; unjudged evidence is
//! unknown. Replays need source identity and cardinality, not provider calls.
use crate::contracts::tool_types::{Selection, SelectionScope, SelectionStatus, SelectionUnit};
use crate::runtime::{ExecutionContext, SelectionLimits};
use crate::tools::id::ToolId;
use crate::tools::num::u32_of_usize;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::time::{Duration, Instant};

mod admission;

/// Version 7 keeps permanently oversized states out of candidate-page pools.
const VERSION: u8 = 7;

#[derive(Clone)]
pub(crate) struct Runtime {
    pub limits: SelectionLimits,
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
    fn select(&self, call: JudgeCall<'_>) -> Judgments;
}

/// One decision per judged candidate ordinal, or why none was judged.
pub(crate) type Judgments = Result<Vec<(usize, Decision)>, JudgeFailure>;

/// Why a judge decided no candidate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum JudgeFailure {
    /// Judging cannot run here (no credential, no usable policy): the receipt
    /// is `unavailable` with this reason and the evidence stays unfiltered.
    Unavailable(String),
    /// Every admitted candidate failed at the provider with this typed error.
    /// The row fails with it; an unknown answer is never invented for it.
    Provider(ProviderError),
}

/// A provider's typed error as a classified row reports it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProviderError {
    pub code: String,
    pub message: String,
    pub hints: Vec<String>,
}

impl From<&str> for JudgeFailure {
    fn from(reason: &str) -> Self {
        Self::Unavailable(reason.to_owned())
    }
}

pub(crate) struct JudgeCall<'a> {
    pub usage: &'a mut crate::tools::judgment::stats::ClassificationUsage,
    pub candidates: &'a [Candidate],
    pub admitted: &'a [usize],
    pub classifiers: &'a [String],
    pub main_goal: Option<&'a str>,
    pub reasoning: Option<&'a str>,
    pub long_context: bool,
    pub limits: SelectionLimits,
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
        let evidence_chars = state.as_ref().map_or(0, serialized_chars);
        Self {
            state,
            evidence_chars,
        }
    }

    fn fits_budget(&self, limits: SelectionLimits) -> bool {
        self.state.is_some() && limits.max_candidates > 0 && self.evidence_chars <= limits.max_chars
    }
}

/// Unicode scalars of `value` serialized as JSON, counted while writing
/// instead of building the string.
fn serialized_chars(value: &Value) -> usize {
    struct Chars(usize);
    impl std::io::Write for Chars {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            // Every scalar has exactly one non-continuation byte.
            self.0 += bytes.iter().filter(|&&byte| byte & 0xC0 != 0x80).count();
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut chars = Chars(0);
    serde_json::to_writer(&mut chars, value).map_or(0, |()| chars.0)
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
    /// Eligible ordinals the candidate budget left unjudged, as half-open
    /// `[start, end)` runs in source order, independent of admission order.
    #[serde(default, skip_serializing_if = "Vec::is_empty", with = "runs")]
    unjudged: Vec<[u32; 2]>,
    /// The ordinals this candidate page judges from, as runs; empty is every
    /// ordinal (the first candidate page). A later candidate page's pool is
    /// the unjudged rest of the page before it, so a chain of candidate
    /// pages judges each ordinal once.
    #[serde(default, skip_serializing_if = "Vec::is_empty", with = "runs")]
    pool: Vec<[u32; 2]>,
    /// The token opens the candidate page over `pool` (nothing judged yet)
    /// instead of replaying a judged page.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    opens: bool,
    checksum: String,
}

/// Half-open ordinal runs as one flat list of gaps and lengths (each run's
/// start minus the previous run's end, then its length), so a plan stays
/// small however scattered its runs are. Decoded runs are ascending,
/// disjoint and non-empty.
mod runs {
    use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};

    pub(super) fn serialize<S: Serializer>(
        runs: &[[u32; 2]],
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let mut flat = Vec::with_capacity(runs.len() * 2);
        let mut end = 0u32;
        for &[start, stop] in runs {
            flat.push(start.saturating_sub(end));
            flat.push(stop.saturating_sub(start));
            end = stop;
        }
        flat.serialize(serializer)
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<[u32; 2]>, D::Error> {
        let flat = Vec::<u32>::deserialize(deserializer)?;
        if flat.len() % 2 != 0 {
            return Err(D::Error::custom("runs are gap and length pairs"));
        }
        let mut runs = Vec::with_capacity(flat.len() / 2);
        let mut end = 0u32;
        for &[gap, length] in flat.as_chunks::<2>().0 {
            let start = end
                .checked_add(gap)
                .ok_or_else(|| D::Error::custom("run past u32"))?;
            let stop = start
                .checked_add(length)
                .filter(|stop| *stop > start)
                .ok_or_else(|| D::Error::custom("empty run"))?;
            runs.push([start, stop]);
            end = stop;
        }
        Ok(runs)
    }
}

pub(crate) struct Outcome {
    pub selected: Vec<usize>,
    /// Judged irrelevant; every other unselected ordinal is unknown.
    pub excluded: Vec<usize>,
    /// The unknown ordinals no judge saw: eligible candidates past the
    /// candidate budget. The rest of the unknown ones were judged unsure,
    /// or had no state to judge.
    pub unjudged: Vec<usize>,
    pub receipt: Selection,
    pub token: String,
    /// The ordinals this candidate page judged from (empty: all of them);
    /// the others were judged by an earlier candidate page.
    pool: Vec<[u32; 2]>,
    /// The token that opens the next candidate page over the unjudged
    /// ordinals, when the budget left any.
    next_candidates: Option<String>,
}

impl Outcome {
    /// Whether the provider could not answer for this view, on this page or
    /// on the page whose plan this one replays (its receipt is
    /// `unavailable` for a [transient](crate::tools::judgment::transport::is_transient)
    /// code): nothing was judged, and every candidate is shown as found.
    pub(crate) fn provider_unavailable(&self) -> bool {
        self.receipt.status == SelectionStatus::Unavailable
            && self
                .receipt
                .reason
                .as_deref()
                .is_some_and(crate::tools::judgment::transport::is_transient)
    }

    /// The ordinals of `total` candidates the view shows, ascending: the
    /// selected ones, or every one this page considers when the provider
    /// was unavailable.
    pub(crate) fn shown(&self, total: usize) -> Vec<usize> {
        if self.provider_unavailable() {
            (0..total)
                .filter(|&ordinal| self.considers(ordinal))
                .collect()
        } else {
            self.selected.clone()
        }
    }

    /// Whether the view leaves evidence out, so its unfiltered lead reaches
    /// more than the view shows.
    pub(crate) fn leaves_out(&self) -> bool {
        self.receipt.selected_items < self.receipt.total_items && !self.provider_unavailable()
    }

    /// Whether this candidate page judged `ordinal` (or left it unjudged);
    /// an ordinal outside its pool was judged by an earlier candidate page.
    pub(crate) fn considers(&self, ordinal: usize) -> bool {
        u32::try_from(ordinal).is_ok_and(|ordinal| in_runs(&self.pool, ordinal))
    }

    /// The `selection` token of `next.nextCandidatePage`: the same call
    /// judging the ordinals this page's budget left unjudged. `None` when
    /// none were left, or when the token would exceed what `tool`'s
    /// `selection` field accepts (the unjudged rest then stays unknown).
    pub(crate) fn next_candidates(&self, tool: ToolId) -> Option<&str> {
        let max = crate::contracts::query_schema_number(tool, None, "selection", "maxLength")
            .and_then(|n| usize::try_from(n).ok())?;
        self.next_candidates
            .as_deref()
            .filter(|token| token.len() <= max)
    }
}

/// Whether `ordinal` lies in `runs` (empty runs hold every ordinal).
fn in_runs(runs: &[[u32; 2]], ordinal: u32) -> bool {
    if runs.is_empty() {
        return true;
    }
    let at = runs.partition_point(|&[_, end]| end <= ordinal);
    runs.get(at).is_some_and(|&[start, _]| start <= ordinal)
}

fn decode(token: &str) -> Option<Plan> {
    let bytes = URL_SAFE_NO_PAD.decode(token).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub(crate) enum Failure {
    Stale,
    Cancelled,
    /// The provider failed every judged candidate: the row reports this
    /// error, its `unavailable` receipt and an unfiltered lead, unless the
    /// failure is transient ([`unless_transient`]).
    Provider(Box<ProviderFailure>),
}

pub(crate) struct ProviderFailure {
    pub error: ProviderError,
    /// The finished `unavailable` outcome: nothing judged, its plan
    /// recording the provider's code, so a later page replays it without
    /// another provider call.
    pub outcome: Outcome,
}

/// A provider that cannot answer now never withholds evidence the reader
/// already has: [`select`]'s failure for a
/// [transient](crate::tools::judgment::transport::is_transient) code
/// becomes its finished `unavailable` outcome, whose view shows every
/// candidate ([`Outcome::shown`]), with the error the row warns with
/// ([`unclassified_warning`]). A refused credential, quota, content or size
/// error stays the failure: the caller must fix it, so it is never masked as
/// a page.
pub(crate) fn unless_transient(
    selected: Result<Outcome, Failure>,
) -> Result<(Outcome, Option<ProviderError>), Failure> {
    match selected {
        Err(Failure::Provider(failure))
            if crate::tools::judgment::transport::is_transient(&failure.error.code) =>
        {
            let ProviderFailure { error, outcome } = *failure;
            Ok((outcome, Some(error)))
        }
        selected => selected.map(|outcome| (outcome, None)),
    }
}

/// The warning of a view shown unfiltered because the provider could not
/// answer: `subject` names the view ("this search"), `shown` what is shown
/// ("its hits are"); the provider's code, message and hints follow.
pub(crate) fn unclassified_warning(error: &ProviderError, subject: &str, shown: &str) -> String {
    let mut note = format!(
        "clasifyContext could not classify {subject} ({}: {}); {shown} shown unfiltered.",
        error.code, error.message
    );
    for hint in &error.hints {
        note.push(' ');
        note.push_str(hint);
    }
    note
}

impl ProviderFailure {
    /// The failed row's error with its receipt and `unfiltered` lead: the
    /// evidence stays reachable without classification.
    pub(crate) fn tool_error(self, unfiltered: Value) -> crate::tools::result::ToolError {
        let ProviderError {
            code,
            message,
            hints,
        } = self.error;
        crate::tools::result::ToolError {
            hints,
            next: Some(Box::new(json!({ "unfiltered": unfiltered }))),
            selection: Some(Box::new(self.outcome.receipt)),
            ..crate::tools::result::ToolError::new(code, message)
        }
    }

    /// [`Self::tool_error`] as a row's `data`.
    pub(crate) fn row(self, unfiltered: Value) -> Value {
        let error = self.tool_error(unfiltered);
        let mut data = json!({"errorCode":error.code, "error":error.message});
        if !error.hints.is_empty() {
            data["hints"] = json!(error.hints);
        }
        data["selection"] = serde_json::to_value(error.selection).unwrap_or(Value::Null);
        data["next"] = error.next.map_or(Value::Null, |next| *next);
        data
    }
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

/// Saved plans need cardinality and source binding, not candidate bodies;
/// a token opening a candidate page judges, so it needs them.
pub(crate) fn needs_candidate_states(
    runtime: Option<&Runtime>,
    prior: Option<&str>,
    unsupported: Option<&'static str>,
    total: usize,
) -> bool {
    prior.is_none_or(|token| decode(token).is_some_and(|plan| plan.opens))
        && skip_reason(runtime, unsupported, total).is_none()
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
            data["next"]["unfiltered"] = provider_page_unfiltered(tool, query);
            continue;
        }
        if !data.is_object() {
            *data = json!({});
        }
        let Some(Value::Array(values)) = data.get_mut("files").map(Value::take) else {
            row["status"] = json!("error");
            row["data"] = json!({
                "errorCode":"invalidClassificationView",
                "error":"Classification requires an array of source evidence candidates.",
                "selection": unavailable_receipt(0, "invalidClassificationView"),
                "next":{"unfiltered":provider_page_unfiltered(tool, query)}
            });
            continue;
        };
        let states = values
            .iter()
            .map(|item| runtime.judge.project(json!({ "evidence": item })))
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
        let (outcome, provider) = match unless_transient(select_scoped(
            Some(runtime),
            query,
            &source,
            query["selection"].as_str(),
            &candidates,
            None,
            SelectionScope::ProviderPage,
            SelectionUnit::Files,
        )) {
            Ok(selected) => selected,
            Err(Failure::Cancelled) => return Err(crate::runtime::ExecutionError::Cancelled),
            Err(Failure::Provider(failure)) => {
                row["status"] = json!("error");
                row["data"] = failure.row(provider_page_unfiltered(tool, query));
                continue;
            }
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
        let shown = outcome.shown(values.len());
        let mut values = values.into_iter().map(Some).collect::<Vec<_>>();
        data["files"] = Value::Array(
            shown
                .iter()
                .filter_map(|&i| values.get_mut(i).and_then(Option::take))
                .collect(),
        );
        data["selection"] = serde_json::to_value(&outcome.receipt).unwrap_or(Value::Null);
        strip_plan_from_tool_continuations(data, tool);
        // The unfiltered page reaches what selection left out; a page that
        // kept every candidate (or had none, or shows every one because the
        // provider could not answer) leaves nothing out.
        if outcome.leaves_out() {
            if !data["next"].is_object() {
                data["next"] = json!({});
            }
            data["next"]["unfiltered"] = provider_page_unfiltered(tool, query);
        }
        if let Some(token) = outcome.next_candidates(tool) {
            let mut next_query = query.clone();
            next_query["selection"] = json!(token);
            if !data["next"].is_object() {
                data["next"] = json!({});
            }
            data["next"]["nextCandidatePage"] =
                crate::tools::result::Continuation::new(tool, next_query).build();
        }
        tool.output().finish_selection(data, query);
        if let Some(error) = &provider {
            crate::tools::paging::push_warnings(
                data,
                [unclassified_warning(error, "this page", "its files are")],
            );
        }
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
        usage: None,
    })
    .unwrap_or(Value::Null)
}

/// The one unfiltered recovery row: the classified read as an ordinary read
/// from its first window, without `clasifyContext`, any cursor
/// ([`CURSOR_FIELDS`](crate::tools::result::CURSOR_FIELDS)) or window size.
/// `keep` names cursors that are source identity here (a provider `page`).
pub(crate) fn unfiltered_row(query: &Value, keep: &[&str]) -> Value {
    let mut row = query.clone();
    if let Some(fields) = row.as_object_mut() {
        fields.remove("clasifyContext");
        fields.remove("length");
        fields.remove("unit");
        for field in crate::tools::result::CURSOR_FIELDS {
            if !keep.contains(&field) {
                fields.remove(field);
            }
        }
    }
    row
}

/// [`unfiltered_row`] as the `next.unfiltered` lead of `tool`.
pub(crate) fn unfiltered(tool: ToolId, query: &Value, keep: &[&str]) -> Value {
    crate::tools::result::Continuation::new(tool, unfiltered_row(query, keep)).build()
}

/// A provider page keeps its page: it is the judged source.
fn provider_page_unfiltered(tool: ToolId, query: &Value) -> Value {
    unfiltered(tool, query, &["page"])
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
            total: u32_of_usize(total),
            reason: reason.map(str::to_owned),
            unjudged: Vec::new(),
            pool: Vec::new(),
            opens: false,
            checksum: String::new(),
        }
    }

    /// The ordinals this candidate page judges from.
    fn pool_size(&self) -> usize {
        if self.pool.is_empty() {
            return self.total as usize;
        }
        self.pool
            .iter()
            .map(|[start, end]| (end - start) as usize)
            .sum()
    }

    fn in_pool(&self, ordinal: usize) -> bool {
        u32::try_from(ordinal).is_ok_and(|ordinal| in_runs(&self.pool, ordinal))
    }

    fn digest(&self) -> String {
        crate::digest::json_sha256(&json!({
            "version":self.version, "binding":self.binding, "status":self.status,
            "scope":self.scope, "unit":self.unit, "selected":self.selected,
            "excluded":self.excluded, "total":self.total, "reason":self.reason,
            "unjudged":self.unjudged, "pool":self.pool, "opens":self.opens,
        }))
    }

    /// Records deferred ordinals that can fit a fresh page's budget.
    fn mark_unjudged(
        &mut self,
        candidates: &[Candidate],
        admitted: &[usize],
        limits: SelectionLimits,
    ) {
        let admitted = admitted.iter().copied().collect::<HashSet<_>>();
        let mut runs: Vec<[u32; 2]> = Vec::new();
        for (ordinal, candidate) in candidates.iter().enumerate() {
            if !candidate.fits_budget(limits)
                || admitted.contains(&ordinal)
                || !self.in_pool(ordinal)
            {
                continue;
            }
            let ordinal = u32_of_usize(ordinal);
            match runs.last_mut() {
                Some(run) if run[1] == ordinal => run[1] = ordinal.saturating_add(1),
                _ => runs.push([ordinal, ordinal.saturating_add(1)]),
            }
        }
        self.unjudged = runs;
    }

    fn unjudged_ordinals(&self) -> impl Iterator<Item = u32> + '_ {
        self.unjudged.iter().flat_map(|[start, end]| *start..*end)
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
        if self.unjudged.iter().any(|[start, end]| start >= end)
            || self
                .pool
                .last()
                .is_some_and(|&[_, end]| usize::try_from(end).map_or(true, |end| end > total))
        {
            return false;
        }
        let mut seen = HashSet::with_capacity(self.selected.len() + self.excluded.len());
        if !self
            .selected
            .iter()
            .chain(&self.excluded)
            .copied()
            .chain(self.unjudged_ordinals())
            .all(|ordinal| {
                usize::try_from(ordinal).is_ok_and(|i| i < total && self.in_pool(i))
                    && seen.insert(ordinal)
            })
        {
            return false;
        }
        let judged = self.selected.len() + self.excluded.len();
        if self.opens {
            return !self.pool.is_empty()
                && seen.is_empty()
                && self.status == SelectionStatus::Partial;
        }
        let size = self.pool_size();
        match self.status {
            SelectionStatus::Complete => judged == size,
            SelectionStatus::Partial => judged < size,
            SelectionStatus::Unavailable => judged == 0,
        }
    }

    fn finish(mut self) -> Outcome {
        self.selected.sort_unstable();
        self.excluded.sort_unstable();
        self.seal();
        let selected = self.selected.iter().map(|&i| i as usize).collect();
        let excluded = self.excluded.iter().map(|&i| i as usize).collect();
        let unjudged = self.unjudged_ordinals().map(|i| i as usize).collect();
        let size = i64::try_from(self.pool_size()).unwrap_or(i64::MAX);
        let receipt = Selection {
            status: self.status,
            scope: self.scope,
            unit: self.unit,
            selected_items: self.selected.len() as i64,
            excluded_items: self.excluded.len() as i64,
            unknown_items: size - self.selected.len() as i64 - self.excluded.len() as i64,
            total_items: size,
            reason: self.reason.clone(),
            usage: None,
        };
        let encode =
            |plan: &Plan| URL_SAFE_NO_PAD.encode(serde_json::to_vec(plan).unwrap_or_default());
        let next_candidates = (!self.unjudged.is_empty()).then(|| {
            let mut opening = Plan::new(
                self.binding.clone(),
                self.total as usize,
                SelectionStatus::Partial,
                self.scope,
                self.unit,
                None,
            );
            opening.pool = self.unjudged.clone();
            opening.opens = true;
            opening.seal();
            encode(&opening)
        });
        Outcome {
            selected,
            excluded,
            unjudged,
            receipt,
            token: encode(&self),
            pool: self.pool,
            next_candidates,
        }
    }
}

/// Bind assessment semantics, including optional research context. Pagination
/// cursors are excluded; canonical source identity owns path spelling.
pub(crate) fn binding(
    query: &Value,
    source: &str,
    limits: SelectionLimits,
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
    let finish = |plan: Plan, usage: &crate::tools::judgment::stats::ClassificationUsage| {
        let mut outcome = plan.finish();
        if query["extras"]
            .as_array()
            .is_some_and(|extras| extras.iter().any(|extra| extra == "stats"))
        {
            outcome.receipt.usage = Some(usage.output());
        }
        outcome
    };
    let mut usage = crate::tools::judgment::stats::ClassificationUsage::default();
    let limits = runtime.map_or(
        SelectionLimits {
            max_candidates: 0,
            max_chars: 0,
            timeout: Duration::ZERO,
        },
        |r| r.limits,
    );
    let bound = binding(query, source, limits, runtime);
    // A saved plan replays; a token opening a candidate page judges its pool.
    let mut pool = Vec::new();
    if let Some(token) = prior {
        let plan = decode(token)
            .filter(|plan| plan.valid(&bound, candidates.len(), scope, unit))
            .ok_or(Failure::Stale)?;
        if !plan.opens {
            return Ok(finish(plan, &usage));
        }
        pool = plan.pool;
    }
    let mut plan = Plan::new(
        bound,
        candidates.len(),
        SelectionStatus::Partial,
        scope,
        unit,
        None,
    );
    plan.pool = pool;
    let pool_size = plan.pool_size();
    if let Some(reason) = skip_reason(runtime, unsupported, candidates.len()) {
        plan.status = if candidates.is_empty() && reason == "noCandidates" {
            SelectionStatus::Complete
        } else {
            SelectionStatus::Unavailable
        };
        plan.reason = Some(reason.into());
        return Ok(finish(plan, &usage));
    }
    let mut admitted = Vec::new();
    let mut chars = 0usize;
    for ordinal in admission::order(candidates, query, unit)
        .into_iter()
        .filter(|&ordinal| plan.in_pool(ordinal))
    {
        let candidate = &candidates[ordinal];
        if admitted.len() == limits.max_candidates {
            break;
        }
        if candidate.fits_budget(limits)
            && candidate.evidence_chars <= limits.max_chars.saturating_sub(chars)
        {
            chars += candidate.evidence_chars;
            admitted.push(ordinal);
        }
    }
    let eligible = candidates
        .iter()
        .enumerate()
        .filter(|(ordinal, candidate)| candidate.state.is_some() && plan.in_pool(*ordinal))
        .count();
    let oversized = candidates.iter().enumerate().any(|(ordinal, candidate)| {
        plan.in_pool(ordinal)
            && candidate.state.is_some()
            && candidate.evidence_chars > limits.max_chars
    });
    let omitted_reason = if oversized {
        "candidateStateTooLarge"
    } else {
        match (eligible < pool_size, admitted.len() < eligible) {
            (true, true) => "candidateEligibilityAndBudget",
            (true, false) => "candidateIneligible",
            _ => "candidateBudget",
        }
    };
    plan.mark_unjudged(candidates, &admitted, limits);
    if admitted.is_empty() {
        plan.reason = Some(omitted_reason.into());
        return Ok(finish(plan, &usage));
    }
    let Some(runtime) = runtime else {
        return Ok(finish(plan, &usage));
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
        usage: &mut usage,
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
            if known == pool_size {
                plan.status = SelectionStatus::Complete;
            } else {
                plan.reason = Some(
                    if admitted.len() < pool_size {
                        omitted_reason
                    } else {
                        "classificationUnknown"
                    }
                    .into(),
                );
            }
        }
        Err(JudgeFailure::Unavailable(reason)) => {
            plan.status = SelectionStatus::Unavailable;
            plan.reason = Some(reason);
            plan.unjudged.clear();
        }
        Err(JudgeFailure::Provider(error)) => {
            plan.status = SelectionStatus::Unavailable;
            plan.unjudged.clear();
            plan.reason = Some(error.code.clone());
            return Err(Failure::Provider(Box::new(ProviderFailure {
                error,
                outcome: finish(plan, &usage),
            })));
        }
    }
    Ok(finish(plan, &usage))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn bounded_chunk_admission_reaches_relevant_evidence_after_the_prefix() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        runtime.limits.max_candidates = 2;
        let mut candidates = (0..100)
            .map(|_| Candidate::new(Some(json!({"content":"unrelated rendering code"}))))
            .collect::<Vec<_>>();
        candidates[75] = Candidate::new(Some(
            json!({"content":"fn retryConnection() { retry_connection(); }"}),
        ));
        candidates[99] = Candidate::new(Some(
            json!({"content":"fn connectionRetry() { connection_retry(); }"}),
        ));
        let query = json!({"clasifyContext":{"classifiers":["retry connection"]}});
        let outcome = select(
            Some(&runtime),
            &query,
            "source",
            None,
            &candidates,
            None,
            SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("selection failed"));
        assert_eq!(outcome.selected, [75, 99]);
        assert_eq!(outcome.receipt.unknown_items, 98);
        let replay = select(
            Some(&runtime),
            &query,
            "source",
            Some(&outcome.token),
            &candidates,
            None,
            SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("replay failed"));
        assert_eq!(replay.selected, outcome.selected);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

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
        let limits = SelectionLimits {
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
        let limits = SelectionLimits {
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

    /// A plan binds the limits it was judged under: another candidate,
    /// character or deadline budget is a different binding, so its replay is
    /// stale. Replaces the local-ranking harness case that varied the removed
    /// OCTOCODE_CLASSIFICATION_* budget variables per process.
    #[test]
    fn changed_selection_limits_invalidate_the_plan_binding() {
        let limits = crate::runtime::RuntimeLimits::DEFAULT.selection;
        let query = json!({"clasifyContext":{"classifiers":["Find retry termination"]}});
        let base = binding(&query, "source", limits, None);
        assert_eq!(base, binding(&query, "source", limits, None));
        for changed in [
            SelectionLimits {
                max_candidates: 2,
                ..limits
            },
            SelectionLimits {
                max_chars: 4_096,
                ..limits
            },
            SelectionLimits {
                timeout: Duration::from_secs(9),
                ..limits
            },
        ] {
            assert_ne!(
                base,
                binding(&query, "source", changed, None),
                "{changed:?}"
            );
        }
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

    #[test]
    fn provider_candidate_pages_cover_the_same_page_and_refuse_source_drift() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        runtime.limits.max_candidates = 2;
        runtime.limits.max_chars = 1_024;
        let mut files: Vec<Value> = (0..5)
            .map(|i| json!({"path":format!("{i}.rs"),"lines":[format!("1\tfn candidate_{i}() {{}}")]}))
            .collect();
        files.push(json!({"path":"oversized.rs","lines":["x".repeat(2_000)]}));
        let original = json!({"results":[{"index":0,"data":{
            "owner":"o","repo":"r","files":files,
            "next":{"nextPage":{"tool":"ghSearchCode","query":{"queries":[{
                "owner":"o","repo":"r","keywords":["fn"],"page":4
            }]}}}
        }}]});
        let mut query = json!({"owner":"o","repo":"r","page":3,"keywords":["fn"],
            "clasifyContext":{"classifiers":["Does this define a function?"]}});
        let mut seen = HashSet::new();
        let mut first_next = None;
        for page in 0..3 {
            let mut output = original.clone();
            apply_sanitized_rows(
                ToolId::GhSearchCode,
                &mut output,
                std::slice::from_ref(&query),
                &[0],
                &mut query.clone(),
                &runtime,
            )
            .expect("candidate page");
            let data = &output["results"][0]["data"];
            for file in data["files"].as_array().expect("selected files") {
                assert!(seen.insert(file["path"].as_str().unwrap().to_owned()));
            }
            assert_eq!(data["next"]["nextPage"]["query"]["queries"][0]["page"], 4);
            if page == 0 {
                assert_eq!(data["selection"]["totalItems"], 6);
                assert_eq!(data["selection"]["unknownItems"], 4);
                assert_eq!(data["selection"]["reason"], "candidateStateTooLarge");
                assert!(data["next"]["unfiltered"].is_object());
            }
            let next = data["next"]["nextCandidatePage"]["query"]["queries"][0].clone();
            if page < 2 {
                assert_eq!(next["page"], 3);
                assert!(next["selection"].is_string());
                first_next.get_or_insert_with(|| next.clone());
                query = next;
            } else {
                assert!(next.is_null(), "oversized evidence cannot loop forever");
            }
        }
        assert_eq!(seen.len(), 5);
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        let query = first_next.expect("continuation");
        let mut changed = original;
        changed["results"][0]["data"]["files"][0]["lines"] = json!(["1\tchanged"]);
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut changed,
            std::slice::from_ref(&query),
            &[0],
            &mut query.clone(),
            &runtime,
        )
        .expect("typed stale error");
        assert_eq!(changed["results"][0]["data"]["errorCode"], "staleSnapshot");
        assert_eq!(
            calls.load(Ordering::SeqCst),
            3,
            "drift cannot trigger inference"
        );
    }

    #[test]
    fn inline_usage_is_opt_in_and_plan_replay_reports_no_new_spend() {
        struct UsageJudge;
        impl SelectionJudge for UsageJudge {
            fn identity(&self) -> Value {
                json!({"test":"usage"})
            }
            fn select(&self, call: JudgeCall<'_>) -> Judgments {
                call.usage
                    .add_record(&json!({"provider_calls":2,"input_tokens":10,"output_tokens":3}));
                Ok(call
                    .admitted
                    .iter()
                    .map(|&i| (i, Decision::Selected))
                    .collect())
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = test_runtime(std::sync::Arc::new(UsageJudge), executor.handle().clone());
        let query = json!({"extras":["stats"],"clasifyContext":{"classifiers":["Does this state the fact?"]}});
        let candidates = vec![Candidate::new(Some(json!("the fact")))];
        let run = |query: &Value, token: Option<&str>| {
            select(
                Some(&runtime),
                query,
                "source",
                token,
                &candidates,
                None,
                SelectionUnit::Files,
            )
            .ok()
            .expect("selection")
        };
        let fresh = run(&query, None);
        let usage = serde_json::to_value(&fresh.receipt.usage).unwrap();
        assert_eq!(usage["calls"], 2);
        assert_eq!(usage["knownUsageCalls"], 1);
        assert_eq!(usage["unknownUsageCalls"], 1);
        assert_eq!(usage["inputTokens"], 10);
        let replay = run(&query, Some(&fresh.token));
        let usage = serde_json::to_value(&replay.receipt.usage).unwrap();
        assert_eq!(usage["calls"], 0);
        assert_eq!(usage["inputTokens"], 0);
        assert_eq!(replay.selected, fresh.selected);
        let mut compact = query;
        compact.as_object_mut().unwrap().remove("extras");
        assert!(run(&compact, Some(&fresh.token)).receipt.usage.is_none());
    }

    struct FailedJudge;
    impl SelectionJudge for FailedJudge {
        fn identity(&self) -> Value {
            json!({"backend":"test"})
        }
        fn select(&self, _call: JudgeCall<'_>) -> Judgments {
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
            fn select(&self, call: JudgeCall<'_>) -> Judgments {
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

    /// A provider page with no candidates left nothing out: no unfiltered
    /// page re-runs the same empty search.
    #[test]
    fn an_empty_provider_page_offers_no_unfiltered_page() {
        struct NoJudge;
        impl SelectionJudge for NoJudge {
            fn identity(&self) -> Value {
                json!({"test":"none"})
            }
            fn select(&self, _: JudgeCall<'_>) -> Judgments {
                Ok(Vec::new())
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = test_runtime(std::sync::Arc::new(NoJudge), executor.handle().clone());
        let query = json!({"owner":"o","repo":"r","keywords":["nothing"],
            "clasifyContext":{"classifiers":["Relevant?"]}});
        let mut page = json!({"results":[{"index":0,"status":"empty","data":{"files":[]}}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut page,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("empty provider page");
        let data = &page["results"][0]["data"];
        assert_eq!(data["selection"]["totalItems"], 0, "{data}");
        assert!(data["next"].get("unfiltered").is_none(), "{data}");
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
        let query = json!({"owner":"o","keywords":["retry"],
            "clasifyContext":{"classifiers":["Does it describe retries?"]}});
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

    #[test]
    fn a_provider_failing_the_whole_page_fails_the_row_with_its_typed_error() {
        struct Unauthorized;
        impl SelectionJudge for Unauthorized {
            fn identity(&self) -> Value {
                json!({"backend":"unauthorized"})
            }
            fn select(&self, _call: JudgeCall<'_>) -> Judgments {
                Err(JudgeFailure::Provider(ProviderError {
                    code: "classificationProviderError".into(),
                    message: "Classification provider returned HTTP 401 Unauthorized".into(),
                    hints: vec!["Check OCTOCODE_CLASSIFICATION_API and account access.".into()],
                }))
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let runtime = test_runtime(std::sync::Arc::new(Unauthorized), executor.handle().clone());
        let query = json!({"owner":"o","repo":"r","page":2,"keywords":["retry"],
            "clasifyContext":{"classifiers":["Does it state when retries stop?"]}});
        let mut output = json!({"results":[{"index":0,"data":{"files":[
            {"path":"a.rs","matches":[{"line":1,"value":"UNJUDGED_BODY"}]}
        ]}}]});
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut output,
            &[query],
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("a failed judgment is a row outcome");
        let row = &output["results"][0];
        assert_eq!(row["status"], "error");
        let data = &row["data"];
        assert_eq!(data["errorCode"], "classificationProviderError");
        assert!(
            data["hints"]
                .to_string()
                .contains("OCTOCODE_CLASSIFICATION_API")
        );
        assert!(!data.to_string().contains("UNJUDGED_BODY"));
        assert_eq!(data["selection"]["status"], "unavailable");
        assert_eq!(data["selection"]["reason"], "classificationProviderError");
        assert_eq!(data["selection"]["unknownItems"], 1);
        let recovery = &data["next"]["unfiltered"]["query"]["queries"][0];
        assert_eq!(recovery["page"], 2);
        assert!(recovery.get("clasifyContext").is_none());
        assert!(
            response_query.get("selection").is_none(),
            "no plan to replay"
        );
    }

    /// A provider that cannot answer now (down, overloaded, unreachable)
    /// never withholds a provider page that succeeded: every file is shown
    /// under an `unavailable` receipt naming the provider's code, the row
    /// warns with its error and hint, no unfiltered lead repeats the page,
    /// and the response pager's replay of the recorded plan asks no provider.
    #[test]
    fn a_provider_that_is_down_shows_the_whole_page_as_unavailable() {
        struct Down(std::sync::Arc<AtomicUsize>);
        impl SelectionJudge for Down {
            fn identity(&self) -> Value {
                json!({"backend":"down"})
            }
            fn select(&self, _call: JudgeCall<'_>) -> Judgments {
                self.0.fetch_add(1, Ordering::SeqCst);
                Err(JudgeFailure::Provider(ProviderError {
                    code: crate::tools::judgment::transport::CIRCUIT_OPEN.into(),
                    message: "Classification provider returned HTTP 503 Service Unavailable".into(),
                    hints: vec!["Retry later.".into()],
                }))
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(Down(calls.clone())),
            executor.handle().clone(),
        );
        let query = json!({"owner":"o","repo":"r","keywords":["retry"],
            "clasifyContext":{"classifiers":["Does it state when retries stop?"]}});
        let page = || {
            json!({"results":[{"index":0,"data":{"files":[
                {"path":"a.rs","matches":[{"line":1,"value":"FIRST_BODY"}]},
                {"path":"b.rs","matches":[{"line":2,"value":"SECOND_BODY"}]}
            ]}}]})
        };
        let mut output = page();
        let mut response_query = query.clone();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut output,
            std::slice::from_ref(&query),
            &[0],
            &mut response_query,
            &runtime,
        )
        .expect("a provider that is down is a row outcome");
        let row = &output["results"][0];
        assert_ne!(row["status"], "error", "{row}");
        let data = &row["data"];
        let paths = data["files"]
            .as_array()
            .expect("files")
            .iter()
            .map(|file| file["path"].clone())
            .collect::<Vec<_>>();
        assert_eq!(paths, [json!("a.rs"), json!("b.rs")], "{data}");
        assert_eq!(data["selection"]["status"], "unavailable");
        assert_eq!(
            data["selection"]["reason"],
            crate::tools::judgment::transport::CIRCUIT_OPEN
        );
        assert_eq!(data["selection"]["unknownItems"], 2);
        let warnings = data["warnings"].to_string();
        assert!(
            warnings.contains("HTTP 503") && warnings.contains("shown unfiltered"),
            "{data}"
        );
        assert!(data["next"].get("unfiltered").is_none(), "{data}");
        let token = response_query["selection"].clone();
        assert!(token.is_string(), "the plan replays: {response_query}");
        // The response pager replays the recorded plan: no provider call.
        let mut replayed_query = query.clone();
        replayed_query["selection"] = token;
        let mut replay = page();
        apply_sanitized_rows(
            ToolId::GhSearchCode,
            &mut replay,
            std::slice::from_ref(&replayed_query),
            &[0],
            &mut replayed_query.clone(),
            &runtime,
        )
        .expect("replay");
        assert_eq!(calls.load(Ordering::SeqCst), 1, "one provider call");
        let data = &replay["results"][0]["data"];
        assert_eq!(data["selection"]["status"], "unavailable", "{data}");
        assert_eq!(data["files"].as_array().map(Vec::len), Some(2), "{data}");
    }

    struct SelectedJudge(std::sync::Arc<AtomicUsize>);
    impl SelectionJudge for SelectedJudge {
        fn identity(&self) -> Value {
            json!({"backend":"reverse-test"})
        }
        fn select(&self, call: JudgeCall<'_>) -> Judgments {
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
            limits: SelectionLimits {
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
        assert_eq!(
            outcome.receipt.reason.as_deref(),
            Some("candidateStateTooLarge")
        );
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
            fn select(&self, call: JudgeCall<'_>) -> Judgments {
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
        let limits = SelectionLimits {
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
        let limits = SelectionLimits {
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
    fn oversized_candidate_is_terminal_unknown_without_provider_work() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        let candidates = [Candidate::new(Some(json!({
            "content": "x".repeat(runtime.limits.max_chars)
        })))];
        let outcome = select(
            Some(&runtime),
            &json!({"clasifyContext":{"classifiers":["find evidence"]}}),
            "source",
            None,
            &candidates,
            None,
            SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("oversized candidate"));
        assert!(outcome.next_candidates(ToolId::LocalFetch).is_none());
        assert!(outcome.unjudged.is_empty());
        assert_eq!(outcome.receipt.status, SelectionStatus::Partial);
        assert_eq!(
            outcome.receipt.reason.as_deref(),
            Some("candidateStateTooLarge")
        );
        assert_eq!(outcome.receipt.unknown_items, 1);
        assert_eq!(outcome.receipt.excluded_items, 0);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn candidate_pages_skip_oversized_states_but_judge_every_fitting_state_once() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let mut runtime = test_runtime(
            std::sync::Arc::new(SelectedJudge(calls.clone())),
            executor.handle().clone(),
        );
        runtime.limits.max_candidates = 1;
        runtime.limits.max_chars = 64;
        let candidates = [
            Candidate::new(Some(json!({"content":"first"}))),
            Candidate::new(Some(json!({"content":"x".repeat(64)}))),
            Candidate::new(Some(json!({"content":"second"}))),
            Candidate::new(None),
        ];
        let query = json!({"clasifyContext":{"classifiers":["find evidence"]}});
        let run = |prior| {
            select(
                Some(&runtime),
                &query,
                "source",
                prior,
                &candidates,
                None,
                SelectionUnit::Files,
            )
            .unwrap_or_else(|_| panic!("mixed candidate page"))
        };
        let first = run(None);
        assert_eq!(first.selected, [0]);
        assert_eq!(first.unjudged, [2]);
        assert_eq!(
            first.receipt.reason.as_deref(),
            Some("candidateStateTooLarge")
        );
        assert_eq!(first.receipt.unknown_items, 3);
        assert!(first.excluded.is_empty());
        let next = first
            .next_candidates(ToolId::LocalSearch)
            .expect("fitting candidate page");
        let last = run(Some(next));
        assert_eq!(last.selected, [2]);
        assert!(last.next_candidates(ToolId::LocalSearch).is_none());
        assert_eq!(last.receipt.total_items, 1);
        assert_eq!(last.receipt.status, SelectionStatus::Complete);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    /// Candidate pages: each judges the budget's worth of what the page
    /// before left unjudged, so a chain judges every eligible ordinal
    /// exactly once; a later page's plan replays like the first, and a
    /// candidate without state stays unknown on the first page only.
    #[test]
    fn a_chain_of_candidate_pages_judges_every_ordinal_once() {
        struct Recording(std::sync::Mutex<Vec<usize>>);
        impl SelectionJudge for Recording {
            fn identity(&self) -> Value {
                json!({"test":"recording"})
            }
            fn select(&self, call: JudgeCall<'_>) -> Judgments {
                self.0.lock().expect("lock").extend(call.admitted);
                Ok(call
                    .admitted
                    .iter()
                    .map(|&i| {
                        let decision = if i % 2 == 0 {
                            Decision::Selected
                        } else {
                            Decision::Excluded
                        };
                        (i, decision)
                    })
                    .collect())
            }
        }
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let judge = std::sync::Arc::new(Recording(std::sync::Mutex::new(Vec::new())));
        let mut runtime = test_runtime(judge.clone(), executor.handle().clone());
        runtime.limits.max_candidates = 3;
        let mut candidates = (0..8)
            .map(|i| Candidate::new(Some(json!({"content":format!("evidence {i}")}))))
            .collect::<Vec<_>>();
        candidates.push(Candidate::new(None));
        let query = json!({"clasifyContext":{"classifiers":["evidence"]}});
        let run = |prior: Option<&str>| {
            select(
                Some(&runtime),
                &query,
                "source",
                prior,
                &candidates,
                None,
                SelectionUnit::Chunks,
            )
            .unwrap_or_else(|_| panic!("candidate page"))
        };
        let mut prior: Option<String> = None;
        let mut totals = Vec::new();
        let mut shown = Vec::new();
        let mut second_page = None;
        loop {
            assert!(needs_candidate_states(
                Some(&runtime),
                prior.as_deref(),
                None,
                candidates.len()
            ));
            let outcome = run(prior.as_deref());
            totals.push(outcome.receipt.total_items);
            shown.extend(outcome.selected.iter().copied());
            if totals.len() == 2 {
                second_page = Some((outcome.token.clone(), outcome.selected.clone()));
            }
            match outcome.next_candidates(ToolId::LocalSearch) {
                Some(next) => prior = Some(next.to_owned()),
                None => break,
            }
            assert!(totals.len() < 10, "the chain ends");
        }
        assert_eq!(totals, [9, 5, 2], "each page counts its own pool");
        let mut judged = judge.0.lock().expect("lock").clone();
        judged.sort_unstable();
        assert_eq!(judged, (0..8).collect::<Vec<_>>(), "each judged once");
        shown.sort_unstable();
        assert_eq!(shown, [0, 2, 4, 6]);
        let (token, selected) = second_page.expect("second page");
        assert!(!needs_candidate_states(
            Some(&runtime),
            Some(&token),
            None,
            9
        ));
        let replay = run(Some(&token));
        assert_eq!(replay.selected, selected);
        assert_eq!(replay.receipt.total_items, 5);
        assert!(
            (0..9).filter(|&o| replay.considers(o)).count() == 5,
            "the replay keeps its pool"
        );
        assert_eq!(
            judge.0.lock().expect("lock").len(),
            8,
            "a replay never judges"
        );
    }

    /// An opening token carries no decisions: one that claims any is stale.
    #[test]
    fn an_opening_token_with_decisions_is_stale() {
        let limits = crate::runtime::RuntimeLimits::DEFAULT.selection;
        let bound = binding(&json!({}), "source", limits, None);
        let mut plan = Plan::new(
            bound.clone(),
            4,
            SelectionStatus::Partial,
            SelectionScope::SelectedView,
            SelectionUnit::Chunks,
            None,
        );
        plan.pool = vec![[1, 3]];
        plan.opens = true;
        plan.seal();
        let valid = |plan: &Plan| {
            plan.valid(
                &bound,
                4,
                SelectionScope::SelectedView,
                SelectionUnit::Chunks,
            )
        };
        assert!(valid(&plan));
        let decoded = decode(&URL_SAFE_NO_PAD.encode(serde_json::to_vec(&plan).unwrap()))
            .expect("round trip");
        assert_eq!(decoded.pool, [[1, 3]]);
        plan.selected = vec![1];
        plan.seal();
        assert!(!valid(&plan));
        plan.selected = vec![0];
        plan.opens = false;
        plan.seal();
        assert!(!valid(&plan), "a decision outside the pool");
        plan.pool = vec![[3, 5]];
        plan.selected.clear();
        plan.seal();
        assert!(!valid(&plan), "a pool past the candidates");
    }

    #[test]
    fn cancelled_judgment_never_becomes_a_fallback_page() {
        let executor = tokio::runtime::Runtime::new().expect("runtime");
        let cancellation = tokio_util::sync::CancellationToken::new();
        cancellation.cancel();
        let runtime = Runtime {
            limits: SelectionLimits {
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

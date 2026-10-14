//! Tool-owned diagnostics remain separate from public domain data, and the
//! one builder of executable follow-up calls.
use serde::Serialize;
use serde_json::{Map, Value};

use crate::tools::id::ToolId;

/// One executable follow-up call, `{tool, query, confidence?}`. The
/// `query` is always the complete tool input (`{queries:[row]}` plus any
/// response-window field), so MCP and the CLI run it verbatim. Every `next`
/// page and `hints` lead is built here; debug builds and tests validate each
/// one against the strict input contract when it is built.
#[must_use]
pub struct Continuation {
    tool: ToolId,
    input: Value,
    confidence: Option<String>,
}

impl Continuation {
    /// A one-row call.
    pub fn new(tool: ToolId, row: Value) -> Self {
        Self::input(tool, serde_json::json!({ "queries": [row] }))
    }

    /// A complete input: rows plus response-window fields.
    pub fn input(tool: ToolId, input: Value) -> Self {
        Self {
            tool,
            input,
            confidence: None,
        }
    }

    /// `exact` (a replay), or `high`/`medium`/`low` for a judgment.
    pub fn confidence(mut self, confidence: impl Into<String>) -> Self {
        self.confidence = Some(confidence.into());
        self
    }

    pub fn build(self) -> Value {
        #[cfg(any(test, debug_assertions))]
        assert_valid(self.tool, &self.input);
        let mut call = Map::new();
        call.insert("tool".into(), Value::from(self.tool.as_str()));
        call.insert("query".into(), self.input);
        if let Some(confidence) = self.confidence {
            call.insert("confidence".into(), Value::String(confidence));
        }
        Value::Object(call)
    }
}

impl Continuation {
    /// A `{tool, query: row, ...}` call (clasify's resource-read shape) as a
    /// built continuation; other keys ride along. `None` when `call` is not
    /// a one-row call of a known tool.
    pub fn from_row_call(call: &Value) -> Option<Value> {
        let object = call.as_object()?;
        let tool = ToolId::from_name(object.get("tool")?.as_str()?)?;
        let row = object
            .get("query")
            .filter(|row| row.get("queries").is_none())?;
        let mut built = Self::new(tool, row.clone()).build();
        for (key, value) in object {
            if key != "tool" && key != "query" {
                built[key.as_str()] = value.clone();
            }
        }
        Some(built)
    }
}

/// Fails loudly on a continuation the tool it names would reject.
#[cfg(any(test, debug_assertions))]
#[allow(clippy::panic)]
fn assert_valid(tool: ToolId, input: &Value) {
    if let Err(error) = crate::contracts::validate(tool.as_str(), input.clone()) {
        panic!(
            "invalid {} continuation {input}: {:?}",
            tool.as_str(),
            error.issues
        );
    }
}

/// Rows one `tool` call accepts: the contract's `queries.maxItems`, so a
/// lead that batches rows stays within it.
#[must_use]
pub fn rows_per_call(tool: ToolId) -> usize {
    crate::contracts::tool_contract(tool)
        .ok()
        .and_then(|contract| contract.pointer("/inputSchema/properties/queries/maxItems"))
        .and_then(Value::as_u64)
        .and_then(|rows| usize::try_from(rows).ok())
        .unwrap_or(1)
        .max(1)
}

/// The first row of a continuation call (`query.queries[0]`).
#[must_use]
pub fn continuation_row(call: &Value) -> Option<&Value> {
    call.get("query")?.get("queries")?.get(0)
}

/// [`continuation_row`], mutable.
pub fn continuation_row_mut(call: &mut Value) -> Option<&mut Value> {
    call.get_mut("query")?.get_mut("queries")?.get_mut(0)
}

/// How a call failed, for the caller's exit code and error state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FailureKind {
    NotFound,
    Authentication,
    Permission,
    RateLimited,
    Execution,
}

/// A local tool call that failed as a whole. The dispatcher renders it as
/// the one error row: `errorCode`, `error`, then `hints` and `next` when set.
#[derive(Clone, Debug, PartialEq)]
pub struct ToolError {
    pub code: String,
    pub message: String,
    pub hints: Vec<String>,
    /// Leads out of the error, e.g. a missing path's nearest existing parent.
    /// Boxed to keep the error small in `Result`s.
    pub next: Option<Box<Value>>,
}

impl ToolError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            hints: Vec::new(),
            next: None,
        }
    }

    /// A failed graph-facts scan: the engine's typed refusals keep their
    /// declared codes, and a walk stopped by `cancel` is a cancellation.
    pub(crate) fn graph_scan(
        error: &octocode_engine::graph::GraphScanError,
        cancel: &dyn crate::tools::cancel::CancellationCheck,
    ) -> Self {
        use octocode_engine::graph::GraphScanError;
        let code = match error {
            GraphScanError::UnsupportedLanguage(_) => "languageUnsupported",
            GraphScanError::InvalidGlob(_) => "invalidGlob",
            GraphScanError::Failed(_) if cancel.check().is_err() => "cancelled",
            GraphScanError::Failed(_) => "scanFailed",
        };
        Self::new(code, error.to_string())
    }

    /// A continuation whose snapshot no longer describes the source:
    /// `restart` (usually [`restart_query`]) is `next.restart`. The runtime
    /// writes the one shared `error` text and clears `isPartial`
    /// (`response::pages::restart_stale`); a tool never words it.
    pub(crate) fn stale_snapshot(restart: Value) -> Self {
        Self {
            next: Some(Box::new(serde_json::json!({ "restart": restart }))),
            ..Self::new(
                "staleSnapshot",
                crate::response::pages::STALE_SNAPSHOT_ERROR,
            )
        }
    }

    /// The call was cancelled or ran past its deadline.
    pub fn cancelled(message: impl Into<String>) -> Self {
        Self::new("cancelled", message)
    }

    /// A path-policy refusal under the flat code every local tool shares,
    /// else under the tool's own `access_code`
    /// ([`crate::policy::PolicyError::local_error_code`]).
    pub fn policy(error: crate::policy::PolicyError, access_code: &'static str) -> Self {
        Self::new(error.local_error_code(access_code), error.message)
    }

    /// [`Self::policy`] for a search root; a missing root also leads to a
    /// tree of its nearest existing parent (`next.viewTree`), where a typo's
    /// siblings show.
    pub fn root_policy(
        error: crate::policy::PolicyError,
        requested: &str,
        paths: &crate::policy::path::PathPolicy,
        access_code: &'static str,
    ) -> Self {
        let missing = error.code == crate::policy::PolicyErrorCode::NotFound;
        let mut out = Self::policy(error, access_code);
        if missing && let Some(next) = missing_path_lead(paths, requested) {
            out.next = Some(Box::new(next));
        }
        out
    }
}

/// `{ "viewTree": <lead> }` to the tree of `requested`'s nearest existing
/// parent, where a mistyped name's siblings show; the one recovery form every
/// local tool gives a missing path.
pub(crate) fn missing_path_lead(
    paths: &crate::policy::path::PathPolicy,
    requested: &str,
) -> Option<serde_json::Value> {
    let parent = paths.nearest_existing_dir(requested)?;
    let lead = Continuation::new(
        ToolId::StructureSearch,
        serde_json::json!({"operation": "tree", "path": parent}),
    )
    .build();
    Some(serde_json::json!({ "viewTree": lead }))
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ToolError {}

/// Fields that steer how a call reports, never what it reads: a row never
/// echoes them, and a continuation inherits only `extras` from its source
/// row (the brief is request-level).
pub const INTENT_FIELDS: [&str; 3] = ["mainGoal", "reasoning", "extras"];

#[derive(Debug, Default, Serialize)]
pub struct ToolDiagnostics {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub codes: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub hints: Vec<String>,
    pub partial: bool,
}
impl ToolDiagnostics {
    pub fn add(&mut self, code: &str, hint: &str, partial: bool) {
        if !self.codes.iter().any(|value| value == code) {
            self.codes.push(code.into());
        }
        if !self.hints.iter().any(|value| value == hint) {
            self.hints.push(hint.into());
        }
        self.partial |= partial;
    }
}

#[derive(Debug, Serialize)]
#[serde(transparent)]
pub struct ToolData {
    pub data: Value,
    #[serde(skip)]
    pub diagnostics: ToolDiagnostics,
    #[serde(skip)]
    pub status: Option<&'static str>,
}
impl From<Value> for ToolData {
    fn from(data: Value) -> Self {
        Self {
            data,
            diagnostics: ToolDiagnostics::default(),
            status: None,
        }
    }
}

/// Every query field that names where a walk stands: its pages, offsets and
/// snapshots, and the saved `ranking` plan they were ordered by. A restart
/// drops them all; the contract guard keeps the list complete.
pub(crate) const CURSOR_FIELDS: [&str; 10] = [
    "page",
    "matchPage",
    "importerPage",
    "diagnosticPage",
    "offset",
    "scanOffset",
    "materializeOffset",
    "snapshot",
    "diagnosticSnapshot",
    "ranking",
];

/// The one restart of a row query `row` of `tool`: the same query from its
/// first page, without any [`CURSOR_FIELDS`], as a replay (`exact`).
pub(crate) fn restart_query(tool: ToolId, row: &Value) -> Value {
    let mut restart = row.clone();
    if let Some(fields) = restart.as_object_mut() {
        for field in CURSOR_FIELDS {
            fields.remove(field);
        }
    }
    Continuation::new(tool, restart).confidence("exact").build()
}

/// [`ToolError::stale_snapshot`] as a result row, for a tool that returns
/// rows rather than errors.
pub(crate) fn stale_snapshot(restart: Value) -> Value {
    let error = ToolError::stale_snapshot(restart);
    serde_json::json!({
        "status": "error",
        "errorCode": error.code,
        "next": error.next.map_or(Value::Null, |next| *next),
    })
}

/// A typed query as a continuation row: every field it sets, except `omit`.
pub(crate) fn query_row(query: &impl Serialize, omit: &[&str]) -> Value {
    let mut row = serde_json::to_value(query).unwrap_or_default();
    remove_nulls(&mut row);
    if let Some(row) = row.as_object_mut() {
        for key in omit {
            row.remove(*key);
        }
    }
    row
}

/// Drop `null` members from every object in `value`, including objects nested
/// inside arrays.
pub(crate) fn remove_nulls(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.retain(|_, value| !value.is_null());
            map.values_mut().for_each(remove_nulls);
        }
        Value::Array(values) => values.iter_mut().for_each(remove_nulls),
        _ => {}
    }
}

/// Drop `null` members from `value` and its nested objects; arrays are left
/// untouched.
pub(crate) fn remove_null_fields(value: &mut Value) {
    if let Value::Object(map) = value {
        map.retain(|_, value| !value.is_null());
        map.values_mut().for_each(remove_null_fields);
    }
}

#[cfg(test)]
mod tests {
    use super::{CURSOR_FIELDS, ToolError, restart_query, stale_snapshot};
    use crate::tools::id::ToolId;
    use serde_json::{Value, json};

    /// Every query field of every tool that names where a walk stands (a
    /// page, an offset, a snapshot, a saved ranking) is in the one list a
    /// restart drops, and every listed field is some tool's query field.
    #[test]
    fn the_cursor_list_is_every_contract_cursor_field() {
        let mut fields = std::collections::BTreeSet::new();
        for tool in ToolId::ALL {
            let contract = crate::contracts::tool_contract(tool).expect("tool contract");
            let schema = &contract["querySchema"];
            let defs = &schema["$defs"];
            let branches = ["oneOf", "anyOf"]
                .iter()
                .find_map(|key| schema.get(*key).and_then(Value::as_array))
                .map_or_else(|| vec![schema], |branches| branches.iter().collect());
            for branch in branches {
                let branch = crate::contracts::resolve_ref(branch, defs);
                for field in branch["properties"]
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(f, _)| f)
                {
                    fields.insert(field.clone());
                }
            }
        }
        let cursor = |field: &str| {
            matches!(field, "page" | "offset" | "snapshot" | "ranking")
                || ["Page", "Offset", "Snapshot"]
                    .iter()
                    .any(|suffix| field.ends_with(suffix))
        };
        let found: Vec<&String> = fields.iter().filter(|field| cursor(field)).collect();
        let listed: Vec<&str> = CURSOR_FIELDS.to_vec();
        for field in &found {
            assert!(
                listed.contains(&field.as_str()),
                "{field} is a cursor field"
            );
        }
        for field in &listed {
            assert!(fields.contains(*field), "{field} is no query field");
        }
    }

    /// A restart is page 1 of the same query: every cursor and the saved
    /// ranking dropped, a replay (`exact`), executable as built.
    #[test]
    fn a_restart_drops_every_cursor_and_the_saved_ranking() {
        let row = json!({"path":"src","matchString":"f","page":3,"matchPage":2,
            "snapshot":"s1","ranking":"plan","pageSize":5});
        let restart = restart_query(ToolId::LocalSearch, &row);
        assert_eq!(restart["tool"], "localSearch");
        assert_eq!(restart["confidence"], "exact");
        assert_eq!(
            restart["query"]["queries"][0],
            json!({"path":"src","matchString":"f","pageSize":5})
        );
        let topology = restart_query(
            ToolId::AstTopology,
            &json!({"operation":"cycles","path":"src","page":2,"diagnosticPage":3,
                "diagnosticSnapshot":"d"}),
        );
        assert_eq!(
            topology["query"]["queries"][0],
            json!({"operation":"cycles","path":"src"})
        );
    }

    /// The stale row a tool returns, as a row or as a whole-call error,
    /// carries the code and the restart; the runtime owns its text.
    #[test]
    fn a_stale_snapshot_carries_its_restart() {
        let restart = restart_query(
            ToolId::LocalFetch,
            &json!({"path":"a","offset":90,"snapshot":"s"}),
        );
        let row = stale_snapshot(restart.clone());
        assert_eq!(row["errorCode"], "staleSnapshot");
        assert_eq!(row["next"]["restart"], restart);
        let error = ToolError::stale_snapshot(restart.clone());
        assert_eq!(error.code, "staleSnapshot");
        assert_eq!(error.next.as_deref(), Some(&json!({"restart": restart})));
    }
}

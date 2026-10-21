use super::{Cost, ExecutionContext, ExecutionError, RequestLimits, RequestRuntime, RuntimeLimits};
use crate::config::{self, ConfigInput, ConfigOutput, RuntimeSurface};
use crate::contracts;
use crate::policy::path::{PathPolicy, PathPolicyConfig};
use crate::response::pager::{ResponsePageOptions, TextContent};
use crate::response::{continuations, extras, read_share, render, rows, stage};
use crate::security::{ContentSecurity, ValidationResult};
use crate::tools::ast_graph::store as graph_store;
use crate::tools::cancel::CancellationCheck;
use crate::tools::id::{ToolFamily, ToolId};
use crate::tools::local_fetch::LocalFetchRegex;
use crate::tools::num::u32_of_usize;
use crate::tools::result::FailureKind;

use base64::Engine as _;
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostOptions {
    pub cwd: Option<PathBuf>,
    /// Explicit host environment. Embedders use this to keep configuration
    /// injection deterministic; standalone surfaces fall back to process env.
    pub env: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub surface: RuntimeSurface,
    /// Override the per-request execution timeout in seconds (default:
    /// [`super::lifecycle::DEFAULT_TIMEOUT`], the budget of every surface).
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Box<Value>>,
    #[serde(skip)]
    pub validation_issues: Option<Vec<contracts::ValidationIssue>>,
}
impl RuntimeError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            payload: None,
            validation_issues: None,
        }
    }
}

pub struct ToolRuntime {
    pub requests: RequestRuntime,
    input: ConfigInput,
    config: Arc<ConfigOutput>,
    /// Internal limits: code constants ([`RuntimeLimits::DEFAULT`]), never
    /// configuration.
    limits: RuntimeLimits,
    paths: Arc<PathPolicy>,
    security: Arc<ContentSecurity>,
    github_cache: super::github_cache::GitHubContentCache,
    github_services: Arc<
        std::sync::OnceLock<Result<super::github::GitHubServices, octocode_github::ProviderError>>,
    >,
    lsp_pool: Arc<octocode_engine::lsp::pool::LspClientPool>,
    /// Whether this runtime created [`Self::lsp_pool`]: only its creator
    /// stops the servers on close; a runtime given a shared pool leaves them
    /// to the pool's owner and to its other runtimes.
    owns_lsp_pool: bool,
    /// Sanitized full views of recently paged local files (this runtime's
    /// security policy only), so each localFetch page skips a full rescan.
    local_views: Arc<crate::security::scan::SanitizedViewMemo>,
    /// Pre-paging envelopes of recent paged responses (this runtime's config
    /// and workspace only), so a later page skips re-executing the batch.
    page_replays: Arc<PageReplayMemo>,
    section_sessions: Arc<crate::tools::clasify::sections::Sessions>,
    /// Registry answers for artifactSearch; `None` under memory storage.
    artifact_cache: Option<Arc<crate::providers::artifact::ArtifactCache>>,
    /// Resolved once from the immutable config and surface. Provider
    /// failures are request-local and do not remove an advertised tool.
    availability: Arc<super::availability::ToolAvailability>,
    /// Provider settings and selection availability, resolved once.
    evaluator: crate::tools::judgment::Evaluator,
    selection_available: bool,
    lsp_execution_config: Arc<crate::tools::lsp_search::LspExecutionConfig>,
    /// The sandbox workspace root (configured workspaceRoot, else host cwd).
    workspace_root: PathBuf,
    /// The built-in classification provider.
    classification: &'static dyn crate::providers::classification::ClassificationProvider,
}

/// The configuration diagnostics every runtime start prints. A key no
/// setting reads (unknown, or removed by the contract) changes nothing, so
/// `octocode config` reports it instead of every call; an ignored value of a
/// live setting (invalid, protected, an unreadable file) is said each time.
fn startup_diagnostics(
    diagnostics: &[config::ConfigDiagnostic],
) -> impl Iterator<Item = &config::ConfigDiagnostic> {
    diagnostics.iter().filter(|diagnostic| {
        ![config::UNKNOWN_CONFIG_CODE, config::REMOVED_SETTING_CODE]
            .contains(&diagnostic.code.as_str())
    })
}

/// Largest file a [`Cost::Light`] local row reads.
const LIGHT_FILE_BYTES: u64 = 1024 * 1024;

const PAGE_REPLAY_TTL: Duration = Duration::from_secs(120);

/// Immutable settled output. Page reads never consult its original sources.
#[derive(Serialize, Deserialize)]
struct PageReplay {
    access: [u8; 32],
    github_identity: Option<String>,
    structured: Value,
    remaining: Vec<Vec<crate::response::pages::Remaining>>,
    response_query: Value,
    failure: Option<FailureKind>,
    source_digest: Option<String>,
    expires_at: String,
    page_length: usize,
    page_scope: String,
    #[serde(skip)]
    text: stage::TextCache,
}

struct PageReplayMemo {
    store: crate::cache::Store<PageReplay>,
    policy: String,
    persistent: bool,
}

impl PageReplayMemo {
    fn cache_config() -> crate::cache::CacheConfig {
        crate::cache::CacheConfig {
            max_entries: 8,
            max_bytes: 32 * 1024 * 1024,
            disk_bytes: 128 * 1024 * 1024,
        }
    }

    fn new(config: &ConfigOutput, cwd: &std::path::Path) -> Self {
        let persistent = config::is_persistent_storage_enabled(&config.resolved);
        let policy = crate::digest::sha256(
            format!(
                "{}:{}:{}",
                config.identity_digest(),
                cwd.display(),
                contracts::tool_types::TOOL_TYPES_CONTRACT_FINGERPRINT
            )
            .as_bytes(),
        );
        Self {
            store: crate::cache::Store::new(
                Self::cache_config(),
                persistent.then(|| config.home.join("tmp").join("response-pages")),
            ),
            policy,
            persistent,
        }
    }

    fn storage(&self) -> &'static str {
        if self.persistent {
            "persistent"
        } else {
            "memory"
        }
    }

    fn key(&self, key: &[u8; 32], snapshot: &str) -> crate::cache::CacheKey {
        crate::cache::CacheKey {
            namespace: "response-pages-v1".into(),
            scope: format!("{}:{}", self.policy, hex::encode(key)),
            resource: snapshot.into(),
        }
    }

    fn get(&self, key: &[u8; 32], snapshot: &str) -> Option<Arc<PageReplay>> {
        self.store
            .get(&self.key(key, snapshot))
            .map(|hit| hit.value)
    }

    fn insert(
        &self,
        key: &[u8; 32],
        snapshot: &str,
        replay: PageReplay,
    ) -> (Arc<PageReplay>, bool) {
        let weight = octocode_engine::json_size::bytes(&replay).unwrap_or(usize::MAX);
        self.store.put_confirmed(
            self.key(key, snapshot),
            replay,
            weight,
            crate::cache::CacheClass::Volatile {
                ttl: PAGE_REPLAY_TTL,
            },
        )
    }
}

fn page_expiry() -> String {
    crate::civil_date::iso8601_millis_after(PAGE_REPLAY_TTL)
}

fn decode_saved_snapshot(snapshot: &str) -> Option<([u8; 32], String)> {
    let (key, raw) = snapshot.strip_prefix("saved-v1:")?.split_once(':')?;
    let (kind, digest) = raw.rsplit_once(':')?;
    let base64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let key: [u8; 32] = base64.decode(key).ok()?.try_into().ok()?;
    let digest: [u8; 32] = base64.decode(digest).ok()?.try_into().ok()?;
    Some((key, format!("{kind}:{}", hex::encode(digest))))
}

fn snapshot_expired() -> RuntimeError {
    RuntimeError::new(
        "responseSnapshotExpired",
        "The saved response is missing, expired or belongs to another tool, session or configuration. No source or provider was called. Pages expire after 120 seconds or earlier eviction; memory storage lasts only in the current runtime. Use persistent storage across CLI calls, or explicitly rerun without responseSnapshot and responseOffset.",
    )
}

/// Identity of an executed batch: validated rows in canonical key order,
/// original input indices, surface and request credential. The saved handle
/// carries this digest; an independent access digest verifies each replay.
fn page_replay_key(
    tool: &str,
    mcp: bool,
    queries: &[Value],
    indices: &[usize],
    credential: Option<&octocode_github::ResolvedCredential>,
) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    // A request-supplied token partitions replays: one caller's page never
    // answers another caller's continuation.
    let credential =
        credential.map(|credential| crate::digest::sha256(credential.expose_secret().as_bytes()));
    let identity = json!({
        "tool": tool,
        "mcp": mcp,
        "queries": queries,
        "indices": indices,
        "credential": credential,
    });
    Sha256::digest(
        octocode_engine::digest::canonicalize_dropping_nulls(identity)
            .to_string()
            .as_bytes(),
    )
    .into()
}

/// What the caller of one call reads.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Channel {
    /// The structured JSON only (a CLI writing JSON).
    Structured,
    /// The structured JSON and the rendered text (a CLI on a terminal).
    Rendered,
    /// An MCP CallToolResult: both, under MCP admission (no `cliOnly` tool).
    Mcp,
}

#[derive(Debug)]
pub struct ToolOutcome {
    pub structured_content: Value,
    pub content: Vec<TextContent>,
    pub source_digest: Option<String>,
    pub failure: Option<FailureKind>,
    pub all_failed: bool,
}

/// An invalid row of an isolated batch, shaped like any other error row. Its
/// `hints.repair` is the one-row call with every field fixed, when each has
/// an exact fix.
fn rejected_row(
    tool: ToolId,
    index: usize,
    raw: Value,
    error: &contracts::ContractValidationError,
) -> (usize, Value) {
    let formatted = contracts::format_input_error(tool.as_str(), error);
    let mut data = json!({
        "error": formatted["error"],
        "errorCode": "invalidInput",
    });
    let one_row = json!({ "queries": [raw] });
    let issues = error
        .issues
        .iter()
        .map(|issue| {
            let mut issue = issue.clone();
            if issue.path.first().is_some_and(|part| part == "queries") && issue.path.len() > 1 {
                issue.path[1] = "0".to_owned();
            }
            issue
        })
        .collect::<Vec<_>>();
    let mut hints = serde_json::Map::new();
    let mut text = formatted
        .get("details")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(repair) = repair_lead(tool, &one_row, &issues) {
        // The note names the caller's own row, not the one-row repair call.
        text.extend(repair.note(Some(index)).map(Value::String));
        hints.insert("repair".into(), repair.lead);
    }
    if !text.is_empty() {
        hints.insert("text".into(), Value::Array(text));
    }
    if !hints.is_empty() {
        data["hints"] = Value::Object(hints);
    }
    let mut row = rows::result_row(tool, index, &raw, data, Some("error"));
    extras::prune_row(&mut row, tool, &raw);
    (index, row)
}

/// A rejected input's `hints.repair` lead, and what a lossy or approximate
/// one changes.
struct RepairLead {
    lead: Value,
    /// The caller's fields the lead drops (paths); empty for an exact fix.
    dropped: Vec<String>,
    /// The fields the lead sets to a best reading (paths).
    approximate: Vec<String>,
}

impl RepairLead {
    /// The note a lossy or approximate lead needs: what it drops (a field
    /// the contract does not own, or one another form of the row declares)
    /// and which values it guesses. A row field reads `queries[N].field`, as
    /// every repair message names a row; `row` renames the one-row repair
    /// call's `queries.0` to the caller's row.
    fn note(&self, row: Option<usize>) -> Option<String> {
        let rename = |paths: &[String]| {
            paths
                .iter()
                .map(|path| match path.strip_prefix("queries.0.") {
                    Some(rest) => format!("queries[{}].{rest}", row.unwrap_or(0)),
                    None => path.clone(),
                })
                .collect::<Vec<_>>()
                .join(", ")
        };
        let mut notes = Vec::new();
        if !self.dropped.is_empty() {
            notes.push(format!(
                "The repair lead drops {}: without it (or with the field's default) the call may read more broadly than asked. Express that constraint with a supported field if it matters.",
                rename(&self.dropped)
            ));
        }
        if !self.approximate.is_empty() {
            notes.push(format!(
                "The repair lead reads {} from the value as sent; a ref may contain '/', so check them before relying on the result.",
                rename(&self.approximate)
            ));
        }
        (!notes.is_empty()).then(|| notes.join(" "))
    }
}

/// The call that fixes a rejected input, when every issue has a fix and the
/// fixed call is admitted. An exact fix is `high` confidence; one that drops
/// a field the caller set (no contract field owns it) or guesses a value is
/// `low` and named, since it may read other than the call asked.
fn repair_lead(
    tool: ToolId,
    input: &Value,
    issues: &[contracts::ValidationIssue],
) -> Option<RepairLead> {
    // A lead is a continuation: canonical as written, and admitted as a call.
    // A candidate's own issues (rows lifted out of a nested envelope) are
    // repaired in a further pass; a clasify admission refusal is final.
    let repaired = contracts::repair_input(input, issues, |candidate| {
        let rows = contracts::prepare_many_and_validate(tool.as_str(), candidate.clone())
            .map_err(|error| error.issues)?;
        if tool.is_clasify() && crate::tools::clasify::admit(rows.iter()).is_err() {
            return Err(Vec::new());
        }
        Ok(())
    })?;
    let mut repaired = repaired;
    // The tool settles what the schema admits but it would not reach (an
    // artifactSearch page past the last its search reaches).
    if let Some(rows) = repaired.input["queries"].as_array_mut() {
        let output = tool.output();
        for row in rows {
            output.settle_repaired_row(row);
        }
    }
    let exact = repaired.dropped.is_empty() && repaired.approximate.is_empty();
    Some(RepairLead {
        lead: crate::tools::result::Continuation::input(tool, repaired.input)
            .confidence(if exact { "high" } else { "low" })
            .build(),
        dropped: repaired.dropped,
        approximate: repaired.approximate,
    })
}

fn invalid_input_error(
    tool: &str,
    input: &Value,
    error: contracts::ContractValidationError,
) -> RuntimeError {
    let mut payload = contracts::format_input_error(tool, &error);
    payload["errorCode"] = json!("invalidInput");
    if let Some(repair) =
        ToolId::from_name(tool).and_then(|id| repair_lead(id, input, &error.issues))
    {
        if let Some(note) = repair.note(None) {
            payload["hints"] = json!({ "text": [note] });
        }
        payload["hints"]["repair"] = repair.lead;
    }
    if let Some(id) = ToolId::from_name(tool) {
        crate::response::channels::publish_hints(&mut payload, id);
    }
    RuntimeError {
        code: "invalidInput".into(),
        message: error.to_string(),
        payload: Some(Box::new(payload)),
        validation_issues: Some(error.issues),
    }
}

/// Security-gate failures of one row as field issues, so they isolate and
/// render like any other invalid field. Only clasify evidence may be
/// redacted in place: any other rewritten value — including a clasify
/// `source` — would silently change what a tool reads and leak
/// the placeholder into continuations.
fn security_issues(
    checked: &ValidationResult,
    prefix: &[String],
    clasify: bool,
) -> Vec<contracts::ValidationIssue> {
    let issue = |rule_id: &str, field: Option<&str>, message: String| {
        let mut path = prefix.to_vec();
        path.extend(field.map(str::to_owned));
        contracts::ValidationIssue {
            rule_id: rule_id.into(),
            path,
            message,
            schema: None,
            received: None,
        }
    };
    let mut issues = Vec::new();
    if !checked.is_valid {
        issues.extend(
            checked
                .warnings
                .iter()
                .filter(|warning| !warning.starts_with("Secrets detected"))
                .map(|warning| {
                    let hint = if warning.contains("exceeds maximum length") {
                        "; send a shorter, distinctive fragment"
                    } else {
                        ""
                    };
                    issue("security.input", None, format!("{warning}{hint}"))
                }),
        );
    }
    let redactable = |field: &&String| {
        clasify
            && ["state", "questions"].iter().any(|root| {
                field.as_str() == *root
                    || field.starts_with(&format!("{root}."))
                    || field.starts_with(&format!("{root}["))
            })
    };
    issues.extend(
        checked
            .secret_fields
            .iter()
            .filter(|field| !redactable(field))
            .map(|field| {
            issue(
                "security.credential",
                Some(field),
                "Value looks like a credential and was not run (its redacted form would match unrelated text); search a non-secret fragment instead, such as its prefix or the identifier that holds it".into(),
            )
        }),
    );
    issues
}

fn output_contract_error(tool: &str, error: contracts::ContractValidationError) -> RuntimeError {
    let details = error
        .issues
        .iter()
        .map(|issue| format!("{}: {}", issue.path.join("."), issue.message))
        .collect::<Vec<_>>()
        .join("; ");
    RuntimeError {
        code: "outputContractViolation".into(),
        message: format!(
            "{tool} produced a response that violates its canonical output contract: {details}"
        ),
        payload: None,
        validation_issues: Some(error.issues),
    }
}

/// The batch parallelism budget: how many threads one batch runs its
/// queries on, and how many cores each query's parallel directory walk may
/// use. Read-only rows fan out one thread per query; mutating and
/// self-scheduled tools stay ordered. Each localSearch text walk also runs
/// its own worker pool, which defaults to every core, so concurrent walks
/// split the cores instead of stacking full pools. Measured on a 5-query
/// localSearch batch over the native crates (12 cores, optimized build): one
/// thread per query with full pools 114 ms and 86 peak threads, three workers
/// 116 ms / 58, two 118 ms / 44, one walk at a time 130 ms / 29, so the rows
/// stay concurrent and only the per-walk pools shrink. Splitting the cores
/// (2 walkers each) against the same build with full pools: 708 vs 710 ms
/// median, 22 vs 72 peak threads; rounding the share up changed nothing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BatchBudget {
    /// Queries run at once.
    width: usize,
    /// Walk workers per query; `None` keeps the engine default (all cores).
    walk_threads: Option<u32>,
}

impl BatchBudget {
    fn new(id: ToolId, queries: usize, cores: usize) -> Self {
        let width = if id.supports_concurrent_queries() {
            queries.max(1)
        } else {
            1
        };
        let walk_threads = (width > 1).then(|| u32_of_usize((cores / width).max(1)));
        Self {
            width,
            walk_threads,
        }
    }

    fn for_host(id: ToolId, queries: usize) -> Self {
        let cores = std::thread::available_parallelism().map_or(1, usize::from);
        Self::new(id, queries, cores)
    }
}

fn execute_ordinary_queries(
    tool: ToolId,
    queries: &[Value],
    response_page: Option<usize>,
    dispatcher: &super::domain_dispatch::DomainDispatcher,
    context: &ExecutionContext,
) -> Result<Vec<super::dispatch::DomainResult>, ExecutionError> {
    // Each row's share of the response page its output must fit.
    let context = &ExecutionContext {
        response_window: response_page
            .filter(|page| *page > 0)
            .map(|page| page / queries.len().max(1)),
        ..context.clone()
    };
    let budget = BatchBudget::for_host(tool, queries.len());
    if budget.width <= 1 {
        return queries
            .iter()
            .map(|query| dispatcher.execute(tool, query, context))
            .collect();
    }

    let context = &ExecutionContext {
        walk_threads: budget.walk_threads,
        ..context.clone()
    };
    std::thread::scope(|scope| {
        let tasks = queries
            .iter()
            .map(|query| {
                scope.spawn(octocode_io::notice::carried(move || {
                    dispatcher.execute(tool, query, context)
                }))
            })
            .collect::<Vec<_>>();
        tasks
            .into_iter()
            .map(|task| task.join().map_err(|_| ExecutionError::WorkerFailed)?)
            .collect()
    })
}

impl ToolRuntime {
    pub fn from_host(options: HostOptions) -> Result<Self, RuntimeError> {
        Self::from_host_sharing(options, None)
    }

    /// [`Self::from_host`] whose language servers come from `lsp_pool`, a
    /// pool its owner shares across runtimes (the CLI's warm server keeps
    /// one runtime per working directory and one set of servers). Closing
    /// this runtime leaves the pool running; the owner clears it.
    pub fn from_host_with_lsp_pool(
        options: HostOptions,
        lsp_pool: Arc<octocode_engine::lsp::pool::LspClientPool>,
    ) -> Result<Self, RuntimeError> {
        Self::from_host_sharing(options, Some(lsp_pool))
    }

    /// Print the configuration diagnostics every runtime start prints: on
    /// stderr, since stdout carries CLI results and MCP JSON-RPC. A host
    /// that answers a call from another process's runtime (the CLI's warm
    /// server client) prints its own configuration's, as an in-process
    /// start would.
    pub fn print_startup_diagnostics(config: &ConfigOutput) {
        for diagnostic in startup_diagnostics(&config.diagnostics) {
            eprintln!("{diagnostic}");
        }
    }

    fn from_host_sharing(
        options: HostOptions,
        lsp_pool: Option<Arc<octocode_engine::lsp::pool::LspClientPool>>,
    ) -> Result<Self, RuntimeError> {
        // Reject a bad timeout before config acquisition or maintenance run.
        if let Some(secs) = options.timeout_secs {
            let max = super::lifecycle::MAX_TIMEOUT.as_secs();
            if !(1..=max).contains(&secs) {
                return Err(RuntimeError::new(
                    "invalidInput",
                    format!("timeoutSecs must be between 1 and {max}; got {secs}"),
                ));
            }
        }
        let cwd = options
            .cwd
            .or_else(|| std::env::current_dir().ok())
            .ok_or_else(|| RuntimeError::new("config", "Cannot resolve working directory"))?;
        let home = std::env::home_dir()
            .ok_or_else(|| RuntimeError::new("config", "Cannot resolve home directory"))?;
        let input = config::acquire_config_input(
            options.env.unwrap_or_else(octocode_io::env::vars_lossy),
            cwd,
            home,
            options.surface,
        );
        let mut runtime = Self::build(input, RuntimeLimits::DEFAULT, lsp_pool)?;
        // Misconfiguration never fails startup; say what was ignored and
        // where.
        Self::print_startup_diagnostics(&runtime.config);
        // storage.mode=memory must not touch the disk cache at all.
        if config::is_persistent_storage_enabled(&runtime.config.resolved) {
            super::maintenance::run_if_due(&runtime.config.home, runtime.limits.clone.ttl);
        }
        if let Some(secs) = options.timeout_secs {
            // An embedder's budget replaces the surface default.
            runtime.requests = RequestRuntime::new(RequestLimits {
                timeout: std::time::Duration::from_secs(secs),
                ..RequestLimits::default()
            })
            .map_err(runtime_execution_error)?;
        }
        Ok(runtime)
    }

    pub fn new(input: ConfigInput) -> Result<Self, RuntimeError> {
        Self::with_limits(input, RuntimeLimits::DEFAULT)
    }

    /// Tests only; production uses [`Self::new`]. A runtime whose internal
    /// limits are `limits` instead of the code constants. Not configuration:
    /// nothing reads them from the environment or a file.
    pub fn with_limits(input: ConfigInput, limits: RuntimeLimits) -> Result<Self, RuntimeError> {
        Self::build(input, limits, None)
    }

    /// A runtime for `input` whose language servers come from `lsp_pool`
    /// when given, else from a pool of its own.
    fn build(
        input: ConfigInput,
        limits: RuntimeLimits,
        lsp_pool: Option<Arc<octocode_engine::lsp::pool::LspClientPool>>,
    ) -> Result<Self, RuntimeError> {
        let config = Arc::new(config::resolve_config(&input));
        let local = &config.resolved.local;
        let octocode_home = config.home.clone();
        let mut additional_roots: Vec<PathBuf> =
            local.allowed_paths.iter().map(PathBuf::from).collect();
        // Local tools read the GitHub checkouts (clones, materialized trees)
        // and clasify URL captures under the cache home, never the rest of
        // it (credentials, logs).
        additional_roots.extend([
            crate::tools::gh_clone_repo::cache::clones_root(&octocode_home),
            crate::tools::gh_structure::materialize::materialize_root(&octocode_home),
            crate::tools::source_capture::url::capture_root(&octocode_home),
        ]);
        // Default sandbox: the configured workspace, or the process cwd when
        // unconfigured — never all of $HOME. Broad $HOME access is opt-in
        // only, via an explicit workspaceRoot or an allowedPaths entry.
        let workspace_root = local
            .workspace_root
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| input.cwd.clone());
        let paths = PathPolicy::new(PathPolicyConfig {
            workspace_root: Some(workspace_root.clone()),
            additional_roots,
            include_home: false,
            home_dir: Some(input.os_home.clone()),
        })
        .map_err(|error| RuntimeError::new("policy", error.message))?;
        let security = ContentSecurity::new();
        let requests =
            RequestRuntime::new(RequestLimits::default()).map_err(runtime_execution_error)?;
        // Each response cache owns its directory, so one cache's budget or
        // clear never touches the other's entries.
        let persistent = config::is_persistent_storage_enabled(&config.resolved);
        let response_dir = persistent.then(|| octocode_home.join("tmp").join("response"));
        if persistent {
            crate::tools::declarations_cache::persist_symbols_views(
                octocode_home.join("tmp").join("outline"),
            );
        }
        let github_cache = super::github_cache::GitHubContentCache::new(
            crate::cache::CacheConfig::default(),
            response_dir,
        );
        let artifact_cache = persistent.then(|| {
            Arc::new(crate::providers::artifact::ArtifactCache::new(Some(
                octocode_home.join("tmp").join("artifact"),
            )))
        });
        let lsp_execution_config = Arc::new(crate::tools::lsp_search::LspExecutionConfig {
            config_path: config.resolved.lsp.config_path.clone(),
            trust_project_config: config.resolved.lsp.trust_project_config,
            // A resolved setting the engine reads by name: `lsp.cacheDir` may
            // come from `.octocoderc`, not only the environment, and the
            // resolved value wins either way.
            env: config
                .effective_env
                .iter()
                .filter(|(key, _)| key.starts_with("OCTOCODE_"))
                .map(|(key, value)| (key.clone(), value.clone()))
                .chain(
                    config::field::LSP_CACHE_DIR
                        .env_name()
                        .zip(config.resolved.lsp.cache_dir.clone())
                        .map(|(name, dir)| (name.to_owned(), dir)),
                )
                .collect(),
            octocode_home: Some(octocode_home),
            invocation_dir: Some(input.cwd.clone()),
            lead_cache: std::sync::Arc::default(),
            prewarm_state: std::sync::Arc::default(),
        });
        let classification = crate::providers::classification::provider();
        let evaluator = evaluator(&config, &limits, classification, persistent);
        let availability = Arc::new(super::availability::ToolAvailability::resolve(
            &config,
            input.runtime_surface,
        ));
        let selection_available = selection_available(&config, &availability);
        let page_replays = Arc::new(PageReplayMemo::new(&config, &input.cwd));
        let section_sessions = Arc::new(crate::tools::clasify::sections::Sessions::new(
            PageReplayMemo::cache_config(),
            persistent.then(|| config.home.join("tmp").join("section-assessments")),
            page_replays.policy.clone(),
        ));
        Ok(Self {
            requests,
            input,
            config,
            limits,
            classification,
            availability,
            evaluator,
            selection_available,
            paths: Arc::new(paths),
            security: Arc::new(security),
            github_cache,
            github_services: Arc::new(std::sync::OnceLock::new()),
            owns_lsp_pool: lsp_pool.is_none(),
            lsp_pool: lsp_pool.unwrap_or_default(),
            local_views: Arc::default(),
            page_replays,
            section_sessions,
            artifact_cache,
            lsp_execution_config,
            workspace_root,
        })
    }

    pub fn config(&self) -> &ConfigOutput {
        &self.config
    }
    pub fn begin_close(&self) {
        self.requests.begin_close();
    }
    pub async fn close(&self) {
        self.begin_close();
        self.requests.close().await;
        if self.owns_lsp_pool {
            self.lsp_pool.clear_all().await;
        }
        self.github_cache.clear_memory();
        self.page_replays.store.clear_memory();
        self.section_sessions.clear_memory();
    }
    pub fn inspect_config(&self) -> config::ConfigInspectorData {
        config::inspector_data(&self.input, &self.config)
    }

    /// Resolved presentation switches shared by MCP and CLI discovery.
    fn presentation(&self) -> Value {
        let mcp = &self.config.resolved.mcp;
        let deferred: Vec<&str> = ToolId::ALL
            .iter()
            .map(|id| id.as_str())
            .filter(|name| {
                mcp.deferred
                    .as_ref()
                    .is_some_and(|names| names.iter().any(|deferred| deferred == name))
                    && self.is_available(name)
            })
            .collect();
        json!({
            "deferred": deferred,
            "selection": self.selection_available,
        })
    }

    /// CLI `graph ingest`: builds and publishes a code-graph snapshot under
    /// the same path policy and content security as the local tools.
    pub fn graph_ingest(&self, options: &graph_store::IngestOptions) -> graph_store::GraphOutput {
        if !self.config.resolved.local.enabled {
            return graph_local_disabled();
        }
        let options = graph_store::IngestOptions {
            workspace: Some(self.graph_workspace(options.workspace.as_deref())),
            ..options.clone()
        };
        graph_store::ingest(
            &options,
            &self.paths,
            &self.security,
            &crate::tools::cancel::NeverCancel,
            self.config.env_value(config::environment::OCTOCODE_CARGO),
        )
    }

    /// CLI `graph query`: answers one bounded question from a snapshot.
    pub fn graph_query(&self, options: &graph_store::QueryOptions) -> graph_store::GraphOutput {
        if !self.config.resolved.local.enabled {
            return graph_local_disabled();
        }
        let options = graph_store::QueryOptions {
            workspace: Some(self.graph_workspace(options.workspace.as_deref())),
            ..options.clone()
        };
        graph_store::query(&options, &self.paths)
    }

    /// The workspace that owns a graph: `explicit`, else the one this
    /// runtime's working directory belongs to (not the process's).
    fn graph_workspace(&self, explicit: Option<&std::path::Path>) -> PathBuf {
        explicit.map_or_else(
            || graph_store::default_workspace(self.input.cwd.clone(), &self.paths),
            std::path::Path::to_path_buf,
        )
    }

    pub fn is_available(&self, tool: &str) -> bool {
        self.availability.is_available(tool)
    }

    /// Whether `tool` runs on this runtime and why not; `None` for an unknown
    /// tool.
    pub fn availability(&self, tool: &str) -> Option<&super::availability::Availability> {
        self.availability.get(tool)
    }

    /// The resolved language-server settings `lspSearch` discovers with.
    pub fn lsp_execution_config(&self) -> &crate::tools::lsp_search::LspExecutionConfig {
        &self.lsp_execution_config
    }

    /// The root `lspServers` resolve from: the runtime's workspace (host cwd
    /// or configured workspaceRoot), never the process cwd.
    fn lsp_root(&self) -> &std::path::Path {
        &self.workspace_root
    }

    fn lsp_server_languages(&self) -> Vec<&'static str> {
        let config_path = self
            .lsp_execution_config
            .config_path
            .as_deref()
            .and_then(|path| self.paths.validate_read(path).ok())
            .map(|validated| validated.canonical);
        octocode_engine::lsp::config::available_server_languages(
            &self.lsp_root().to_string_lossy(),
            &self.lsp_execution_config.discovery(config_path),
        )
    }

    /// Runtime truth only: tool names, availability, grammar capabilities, and
    /// the enforcement contract fingerprint. Presentation and MCP instructions
    /// are delivered to agents by the JS layers from `@octocodeai/octocode-core`.
    pub fn catalog(&self) -> Value {
        // Generated constants only: the catalog never parses the contract.
        let tools = ToolId::ALL
            .into_iter()
            .map(|id| {
                let name = id.as_str();
                let mut entry = json!({
                    "name": name,
                    "shortDescription": id.short_description(),
                    "available": self.is_available(name),
                });
                if let Some(reason) = self.availability(name).and_then(|a| a.reason_code()) {
                    entry["unavailableReason"] = json!(reason);
                }
                entry
            })
            .collect::<Vec<_>>();
        json!({
            "fingerprint": contracts::tool_types::TOOL_TYPES_CONTRACT_FINGERPRINT,
            "grammarCapabilities": octocode_engine::signatures::languages::grammar_capabilities(),
            // Languages whose lspSearch server resolves here (resolution only);
            // hosts render it into the lspSearch description.
            "lspServers": self.lsp_server_languages(),
            "presentation": self.presentation(),
            "tools": tools,
        })
    }

    pub fn admit(&self, request_id: String) -> Result<super::RequestAdmission, RuntimeError> {
        self.requests
            .admit(request_id)
            .map_err(runtime_execution_error)
    }

    /// [`Self::admit`] with the host's per-request options
    /// (`{githubToken?}`). A supplied token is the request's only GitHub
    /// credential; a request without one resolves credentials as before.
    pub fn admit_with(
        &self,
        request_id: String,
        options: Option<Value>,
    ) -> Result<super::RequestAdmission, RuntimeError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RequestOptions {
            github_token: Option<String>,
        }
        let token = match options {
            None | Some(Value::Null) => None,
            // Never echo the options: they carry a secret.
            Some(value) => serde_json::from_value::<RequestOptions>(value)
                .map_err(|_| RuntimeError::new("invalidInput", "Invalid request options"))?
                .github_token
                .map(|token| {
                    if token.trim().is_empty() {
                        Err(RuntimeError::new(
                            "invalidInput",
                            "Request option githubToken is empty",
                        ))
                    } else {
                        Ok(SecretString::from(token))
                    }
                })
                .transpose()?,
        };
        let admission = self.admit(request_id)?;
        Ok(match token {
            Some(token) => admission.with_github_token(token),
            None => admission,
        })
    }

    /// Run one admitted call and answer in `channel`. Every interface
    /// (CLI, warm server, N-API/MCP) executes through here; a rejected call
    /// projects once through [`super::error::tool_error_result`].
    pub async fn execute(
        &self,
        admission: super::RequestAdmission,
        tool: String,
        input: Value,
        channel: Channel,
    ) -> Result<ToolOutcome, RuntimeError> {
        let input = contracts::normalize_input(&tool, input);
        self.execute_channel(
            admission,
            tool,
            input,
            channel == Channel::Mcp,
            channel != Channel::Structured,
        )
        .await
    }

    async fn execute_channel(
        &self,
        admission: super::RequestAdmission,
        tool: String,
        input: Value,
        mcp: bool,
        render_text: bool,
    ) -> Result<ToolOutcome, RuntimeError> {
        let id = match self.admit_tool(&tool, mcp) {
            Ok(id) => id,
            // A setting the call lacks is reported after its input: an
            // invalid query fails as invalidInput whatever is configured.
            Err(error) => {
                if error.code == "missingConfiguration"
                    && let Some(id) = ToolId::from_name(&tool)
                    && let Err(invalid) = self.admit_queries(id, &input)
                    && invalid.code == "invalidInput"
                {
                    return Err(invalid);
                }
                return Err(error);
            }
        };
        let clasify = id.is_clasify();
        // Parse response-paging options before contract validation.
        let mut options = ResponsePageOptions::deserialize(&input).unwrap_or_default();
        options.render_text = Some(render_text);
        let access = page_replay_key(&tool, mcp, &[], &[], admission.github_credential());
        let (queries, rejected_rows, row_indices, response_query, replay_key, replayed) = if options
            .response_snapshot
            .is_some()
            || options.response_offset.unwrap_or(0) > 0
        {
            if input.get("queries").is_some() {
                return Err(RuntimeError::new(
                    "invalidInput",
                    "Saved response reads accept only responseSnapshot, responseOffset, responseLength and responseScope; remove queries or start a new call without responseSnapshot.",
                ));
            }
            contracts::validate(&tool, input.clone())
                .map_err(|error| invalid_input_error(&tool, &input, error))?;
            let snapshot = options
                .response_snapshot
                .as_deref()
                .ok_or_else(snapshot_expired)?;
            let (key, raw) = decode_saved_snapshot(snapshot).ok_or_else(snapshot_expired)?;
            let replay = self
                .page_replays
                .get(&key, snapshot)
                .filter(|replay| replay.access == access)
                .ok_or_else(snapshot_expired)?;
            if options
                .response_length
                .is_some_and(|length| length != replay.page_length)
                || options
                    .response_scope
                    .as_deref()
                    .is_some_and(|scope| scope != replay.page_scope)
            {
                return Err(RuntimeError::new(
                    "responsePageMismatch",
                    "Keep responseLength and responseScope unchanged when reading a saved response. Copy responsePagination.next; no source or provider was called.",
                ));
            }
            options.response_snapshot = Some(raw);
            options.response_length = Some(replay.page_length);
            options.response_scope = Some(replay.page_scope.clone());
            (
                Vec::new(),
                Vec::new(),
                Vec::new(),
                replay.response_query.clone(),
                key,
                Some(replay),
            )
        } else {
            if clasify && options.response_scope.is_none() {
                options.response_scope = Some("rows".into());
            }
            let AdmittedRows {
                queries,
                rejected: rejected_rows,
            } = self.admit_queries(id, &input)?;
            let response_query = if queries.len() == 1 {
                queries[0].clone()
            } else {
                json!({"queries": queries})
            };
            let rejected_at: Vec<usize> = rejected_rows.iter().map(|(index, _)| *index).collect();
            let row_indices = super::row_indices::admitted_indices(queries.len(), &rejected_at);
            let key = page_replay_key(
                &tool,
                mcp,
                &queries,
                &row_indices,
                admission.github_credential(),
            );
            (
                queries,
                rejected_rows,
                row_indices,
                response_query,
                key,
                None,
            )
        };
        let cost = self.request_cost(id, &queries, replayed.is_some());
        let dispatcher = super::domain_dispatch::DomainDispatcher {
            explicit_window: options.explicit(),
            ..self.dispatcher()
        };
        let run = ChannelRun {
            id,
            mcp,
            options,
            queries,
            rejected_rows,
            row_indices,
            response_query,
            clasify,
            dispatcher,
            output: OutputSettings {
                redact_emails: self.config.resolved.output.redact_emails,
                auto_page_chars: self.limits.auto_page_chars,
                text_format: render::TextFormat::from_config(&self.config.resolved.output.format),
            },
            replayed,
            replays: (self.page_replays.clone(), replay_key),
            section_sessions: self.section_sessions.clone(),
            access,
        };
        self.requests
            .execute_blocking_admitted(admission.with_cost(cost), move |context| {
                if let Err(error) = run.check_replay_access(&context) {
                    return Ok(Err(error));
                }
                run.run(&context)
                    .map(|result| result.map_err(|error| output_contract_error(&tool, error)))
            })
            .await
            .map_err(runtime_execution_error)?
    }

    /// The admission [`Cost`] of `queries`: light for a provider page the
    /// memo serves (no dispatch, no source check) or for local rows the local
    /// runner serves that each read one regular file of at most
    /// [`LIGHT_FILE_BYTES`] and judge nothing. Anything else may walk a tree,
    /// or wait on a provider (a `clasifyContext` or `selection` row asks the
    /// classification provider) or a language server.
    fn request_cost(&self, id: ToolId, queries: &[Value], replayed: bool) -> Cost {
        if replayed {
            return Cost::Light;
        }
        let light_row = |row: &Value| {
            let judged = row.get("clasifyContext").is_some() || row.get("selection").is_some();
            !judged
                && row["path"].as_str().is_some_and(|path| {
                    std::fs::metadata(self.paths.expand_and_resolve(std::path::Path::new(path)))
                        .is_ok_and(|meta| meta.is_file() && meta.len() <= LIGHT_FILE_BYTES)
                })
        };
        let light = match id.family() {
            ToolFamily::GitHub | ToolFamily::Remote => replayed,
            ToolFamily::Local => {
                id != ToolId::LspSearch && !queries.is_empty() && queries.iter().all(light_row)
            }
        };
        if light { Cost::Light } else { Cost::Walk }
    }

    /// The tool behind `tool` when this surface may run it, else the
    /// actionable reason it may not.
    fn admit_tool(&self, tool: &str, mcp: bool) -> Result<ToolId, RuntimeError> {
        // Contract `cliOnly` tools run only from the CLI. MCP never executes
        // them, even if an embedder used a CLI host surface. A parked tool
        // says so on every surface.
        let requested = ToolId::from_name(tool);
        if mcp && requested.is_some_and(|id| id.is_cli_only() && !id.is_disabled()) {
            return Err(RuntimeError::new(
                "toolUnavailable",
                format!("Tool {tool} is not available through MCP; run `octocode {tool}`."),
            ));
        }
        let (Some(id), Some(availability)) = (requested, self.availability(tool)) else {
            return Err(RuntimeError::new(
                "invalidInput",
                format!(
                    "No tool is named {tool}; use one of {}.",
                    self.availability.available().join(", ")
                ),
            ));
        };
        if availability.is_available() {
            return Ok(id);
        }
        let reason = availability.reason_text();
        if !mcp && availability.needs_opt_in() {
            let mut message = format!("Tool {tool} is not available: {reason}");
            if id == ToolId::Clasify
                && super::availability::classification_key(&self.config).is_none()
            {
                message.push_str(&format!(
                    " Provider setup: {}",
                    self.classification.docs_url()
                ));
            }
            return Err(RuntimeError::new("missingConfiguration", message));
        }
        Err(RuntimeError::new(
            "toolUnavailable",
            format!("Tool {tool} is not available in this native runtime: {reason}"),
        ))
    }

    /// Validated, security-checked rows to run, and the rows rejected by
    /// index. A batch isolates invalid rows; clasify (whose matrices share
    /// batch-level rules) and a call with no valid row fail as a whole.
    fn admit_queries(&self, id: ToolId, input: &Value) -> Result<AdmittedRows, RuntimeError> {
        let tool = id.as_str();
        let PreparedRows {
            valid: prepared,
            mut invalid,
        } = prepare_queries(tool, input)?;
        if id.is_clasify() {
            crate::tools::clasify::admit(prepared.iter().map(|(_, query)| query))
                .map_err(|error| invalid_input_error(tool, input, error))?;
        }
        let bulk = input.is_array() || input.get("queries").is_some();
        let mut queries = Vec::with_capacity(prepared.len());
        for (index, query) in prepared {
            let checked = if id.is_clasify() {
                self.security.validate_state_parameters(
                    &query,
                    crate::tools::clasify::max_state_chars(
                        query["longContext"].as_bool() == Some(true),
                    ),
                )
            } else {
                self.security.validate_input_parameters(&query)
            };
            let prefix = if bulk {
                vec!["queries".to_owned(), index.to_string()]
            } else {
                Vec::new()
            };
            let mut issues = security_issues(&checked, &prefix, id.is_clasify());
            if query.get("clasifyContext").is_some() && !self.selection_available {
                let mut path = prefix.clone();
                path.push("clasifyContext".into());
                issues.push(crate::contracts::ValidationIssue {
                    rule_id: "clasifyContext.available".into(),
                    schema: None,
                    received: None,
                    path,
                    message: "clasifyContext requires an available classification provider; configure JEV or omit the context.".into(),
                });
            }
            if id.is_clasify() {
                issues.extend(crate::tools::clasify::unavailable_source_issues(
                    &query,
                    &prefix,
                    &self.availability,
                ));
            }
            if issues.is_empty() {
                queries.push(Value::Object(checked.sanitized_params));
            } else {
                invalid.push((index, contracts::ContractValidationError { issues }));
            }
        }
        invalid.sort_by_key(|(index, _)| *index);
        if !invalid.is_empty() && (queries.is_empty() || id.is_clasify()) {
            let issues = invalid
                .into_iter()
                .flat_map(|(_, error)| error.issues)
                .collect();
            return Err(invalid_input_error(
                tool,
                input,
                contracts::ContractValidationError { issues },
            ));
        }
        let raw_rows = input
            .get("queries")
            .or(Some(input))
            .and_then(Value::as_array);
        let rejected = invalid
            .iter()
            .map(|(index, error)| {
                let raw = raw_rows
                    .and_then(|rows| rows.get(*index))
                    .cloned()
                    .unwrap_or(Value::Null);
                rejected_row(id, *index, raw, error)
            })
            .collect();
        Ok(AdmittedRows { queries, rejected })
    }

    /// The domain execution path for this call's rows.
    fn dispatcher(&self) -> super::domain_dispatch::DomainDispatcher {
        super::domain_dispatch::DomainDispatcher {
            paths: self.paths.clone(),
            security: self.security.clone(),
            regex: LocalFetchRegex,
            github_services: self.github_services.clone(),
            github_cache: self.github_cache.clone(),
            github_access: super::github::ResponseAccess::default(),
            config: self.config.clone(),
            limits: self.limits,
            home: self.config.home.clone(),
            handle: tokio::runtime::Handle::current(),
            lsp_pool: self.lsp_pool.clone(),
            local_views: self.local_views.clone(),
            lsp_execution_config: self.lsp_execution_config.clone(),
            availability: self.availability.clone(),
            selection_available: self.selection_available,
            evaluator: self.evaluator.clone(),
            artifact_cache: self.artifact_cache.clone(),
            explicit_window: false,
        }
    }
}

/// `graph` reads local files, so it runs only where local tools do.
fn graph_local_disabled() -> graph_store::GraphOutput {
    graph_store::GraphOutput::error(
        "missingConfiguration",
        format!(
            "Local tools are disabled; graph commands read local files. Set {}.",
            config::field::LOCAL_ENABLED.display_name()
        ),
    )
}

/// The one classification evaluator of a runtime: public clasify and every
/// ranked read share its client, judgment cache and accounting. Judgments
/// persist across processes only under persistent storage.
fn evaluator(
    config: &ConfigOutput,
    limits: &RuntimeLimits,
    provider: &'static dyn crate::providers::classification::ClassificationProvider,
    persistent: bool,
) -> crate::tools::judgment::Evaluator {
    crate::tools::judgment::Evaluator::new(
        super::availability::classification_key(config)
            .map(|value| SecretString::from(value.to_owned())),
        config::field::CLASSIFICATION_API_HOST
            .env_name()
            .and_then(|env| config.env_value(env))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| provider.default_host().to_owned()),
        config
            .resolved
            .classification
            .model
            .clone()
            .filter(|model| !model.trim().is_empty())
            .unwrap_or_else(|| provider.default_model().to_owned()),
        provider,
        limits.network_timeout,
        u32::from(limits.max_retries),
        limits.classification_concurrency,
        persistent.then(|| config.home.join("tmp").join("judgment")),
        config::is_stats_enabled(&config.resolved).then(|| config.home.clone()),
    )
}

/// A visible read tool may use the provider through its opt-in `clasifyContext`
/// field even when the public clasify tool is hidden; eligibility comes from
/// the embedded contract instead of another tool list.
fn selection_available(
    config: &ConfigOutput,
    availability: &super::availability::ToolAvailability,
) -> bool {
    super::availability::classification_key(config).is_some()
        && availability
            .available()
            .iter()
            .filter_map(|name| ToolId::from_name(name))
            .any(|id| {
                id != ToolId::Clasify
                    && crate::contracts::query_schema_value(id, None, "clasifyContext", "type")
                        .is_some()
            })
}

/// A call's rows that passed admission, and the rejected ones as indexed
/// error rows.
struct AdmittedRows {
    queries: Vec<Value>,
    rejected: Vec<(usize, Value)>,
}

/// A batch's contract-validated rows by input index, and the invalid ones.
struct PreparedRows {
    valid: Vec<(usize, Value)>,
    invalid: Vec<(usize, contracts::ContractValidationError)>,
}

/// Contract-validated rows by input index, and the invalid ones. Row
/// isolation: when only some rows of a batch are invalid, the valid rows
/// still run and the rest become indexed error rows.
fn prepare_queries(tool: &str, input: &Value) -> Result<PreparedRows, RuntimeError> {
    match contracts::prepare_many_and_validate(tool, input.clone()) {
        Ok(prepared) => Ok(PreparedRows {
            valid: prepared.into_iter().enumerate().collect(),
            invalid: Vec::new(),
        }),
        Err(error) => {
            let Some(rows) = contracts::prepare_rows(tool, input) else {
                return Err(invalid_input_error(tool, input, error));
            };
            let mut prepared = Vec::with_capacity(rows.len());
            let mut invalid = Vec::new();
            for (index, row) in rows.into_iter().enumerate() {
                match row {
                    Ok(query) => prepared.push((index, query)),
                    Err(error) => invalid.push((index, error)),
                }
            }
            Ok(PreparedRows {
                valid: prepared,
                invalid,
            })
        }
    }
}

type StageResult = Result<Result<ToolOutcome, contracts::ContractValidationError>, ExecutionError>;

/// Output settings one call reads from the resolved config.
#[derive(Clone, Copy)]
struct OutputSettings {
    redact_emails: bool,
    auto_page_chars: usize,
    text_format: render::TextFormat,
}

/// One admitted call, moved into its blocking worker: admit → run → shape
/// → check → respond.
struct ChannelRun {
    id: ToolId,
    mcp: bool,
    options: ResponsePageOptions,
    queries: Vec<Value>,
    rejected_rows: Vec<(usize, Value)>,
    /// Original input index of each admitted row (`row_indices` module).
    row_indices: Vec<usize>,
    response_query: Value,
    clasify: bool,
    dispatcher: super::domain_dispatch::DomainDispatcher,
    output: OutputSettings,
    replayed: Option<Arc<PageReplay>>,
    replays: (Arc<PageReplayMemo>, [u8; 32]),
    section_sessions: Arc<crate::tools::clasify::sections::Sessions>,
    access: [u8; 32],
}

impl ChannelRun {
    fn check_replay_access(&self, context: &ExecutionContext) -> Result<(), RuntimeError> {
        let Some(expected) = self
            .replayed
            .as_ref()
            .and_then(|saved| saved.github_identity.as_ref())
        else {
            return Ok(());
        };
        context.check().map_err(runtime_execution_error)?;
        let identity = self.dispatcher.github_response_identity(context);
        context.check().map_err(runtime_execution_error)?;
        if identity.as_ref().is_ok_and(|identity| identity == expected) {
            Ok(())
        } else {
            Err(snapshot_expired())
        }
    }

    fn run(mut self, context: &ExecutionContext) -> StageResult {
        if let Some(replay) = self.replayed.take() {
            let mut stage = self.stage(
                replay.structured.clone(),
                replay.response_query.clone(),
                true,
            );
            stage.options.saved = Some(crate::response::pager::SavedResponse {
                key: self.replays.1,
                expires_at: replay.expires_at.clone(),
                storage: self.replays.0.storage(),
                replayed: true,
            });
            return stage::respond(
                stage::StageInput {
                    failure: replay.failure,
                    source_digest: replay.source_digest.clone(),
                    ..stage
                },
                replay.remaining.clone(),
                Some(&replay.text),
                None,
                context,
            );
        }
        let rejected = std::mem::take(&mut self.rejected_rows);
        let mcp = self.mcp;
        let available = |target: &str| {
            // An MCP-mode call can never execute a contract `cliOnly` tool
            // (see the admission check in `execute_channel`).
            !(mcp && ToolId::from_name(target).is_some_and(ToolId::is_cli_only))
                && self.dispatcher.availability.is_available(target)
        };
        let scope = continuations::Scope {
            is_available: &available,
        };
        if self.clasify {
            debug_assert!(rejected.is_empty(), "admission refuses clasify as a whole");
            self.run_clasify(&scope, context)
        } else {
            self.run_rows(rejected, &scope, context)
        }
    }

    /// The shared response-stage input for `structured`; the caller sets the
    /// row facts (failure, source digest).
    fn stage(
        &self,
        structured: Value,
        response_query: Value,
        allow_auto_paging: bool,
    ) -> stage::StageInput {
        stage::StageInput {
            tool: self.id,
            structured,
            response_query,
            options: ResponsePageOptions {
                saved: Some(crate::response::pager::SavedResponse {
                    key: self.replays.1,
                    expires_at: page_expiry(),
                    storage: self.replays.0.storage(),
                    replayed: false,
                }),
                ..self.options.clone()
            },
            mcp: self.mcp,
            failure: None,
            auto_page_chars: self.output.auto_page_chars,
            text_format: self.output.text_format,
            allow_auto_paging,
            source_digest: None,
        }
    }

    /// Clasify evaluates once; its settled answers use the same saved-page store.
    fn run_clasify(
        &self,
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> StageResult {
        let mut receipts = crate::tools::clasify::call(
            &self.dispatcher.evaluator,
            &self.queries,
            &self.dispatcher,
            context,
            crate::tools::clasify::sections::Runtime {
                sessions: &self.section_sessions,
                access: self.access,
                can_resume: self.mcp || self.replays.0.persistent,
            },
        )?;
        if let Err(error) = continuations::finalize(
            &mut receipts.structured,
            self.id,
            &continuations::Sources::Matrices(&self.response_query),
            scope,
        ) {
            debug_assert!(false, "invalid clasify continuation: {:?}", error.issues);
        }
        let mut stage = self.stage(receipts.structured, self.response_query.clone(), true);
        stage.failure = receipts.failure;
        let remaining = match stage::settle(
            self.id,
            &mut stage.structured,
            &stage.response_query,
            &mut stage.failure,
        ) {
            Ok(remaining) => remaining,
            Err(error) => return Ok(Err(error)),
        };
        let expires_at = stage
            .options
            .saved
            .as_ref()
            .map(|saved| saved.expires_at.clone())
            .unwrap_or_default();
        let text = stage::TextCache::default();
        let mut kept = None;
        let mut finished = stage::respond(
            stage,
            remaining.clone(),
            Some(&text),
            Some(&mut kept),
            context,
        )?;
        if let (Ok(outcome), Some(structured)) = (&mut finished, kept) {
            self.remember_page(
                outcome,
                PageReplay {
                    access: self.access,
                    github_identity: None,
                    structured,
                    remaining,
                    response_query: self.response_query.clone(),
                    failure: receipts.failure,
                    source_digest: None,
                    expires_at,
                    page_length: 0,
                    page_scope: String::new(),
                    text,
                },
                context,
            )?;
        }
        Ok(finished)
    }

    /// Ordinary rows: execute, shape each row, envelope, continuations, then
    /// the shared response stage (and a replay seed when the response pages).
    fn run_rows(
        &self,
        rejected: Vec<(usize, Value)>,
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> StageResult {
        let ShapedRows {
            mut structured,
            response_query,
            rejected_at,
            admitted,
            failure: shaped_failure,
            source_digest,
        } = self.shape_rows(rejected, scope, context)?;
        // A paged batch with rejected rows pages only its admitted rows (the
        // body a continuation reproduces); the rejected rows ride page 1.
        // Only a response that can page needs that body: an explicit window,
        // or one near the automatic page size.
        let pageable = self.options.explicit()
            || octocode_engine::json_size::utf16_units(&structured).unwrap_or(0) * 2
                > self.output.auto_page_chars;
        let body = match admitted.filter(|_| pageable) {
            Some(rows) => Some(self.envelope_of(rows, &rejected_at, scope, context)?.0),
            None => None,
        };
        let rejected_rows: Vec<Value> = body
            .as_ref()
            .and_then(|_| structured["results"].as_array())
            .map(|rows| {
                rows.iter()
                    .filter(|row| {
                        row["index"]
                            .as_u64()
                            .and_then(|index| usize::try_from(index).ok())
                            .is_some_and(|index| rejected_at.contains(&index))
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        // Settle (validate, shape) once; a seed stores the settled envelope
        // so a replayed page skips both.
        let settle = |structured: &mut Value| {
            let mut failure = shaped_failure;
            stage::settle(self.id, structured, &response_query, &mut failure)
                .map(|remaining| (remaining, failure))
        };
        // Respond over a settled envelope; the stage keeps a copy of it (the
        // replay seed) only when the response windows.
        let respond = |structured: Value, remaining: Vec<Vec<_>>, failure| {
            let text = stage::TextCache::default();
            let mut kept = None;
            let stage = self.stage(structured, response_query.clone(), true);
            let expires_at = stage
                .options
                .saved
                .as_ref()
                .map(|saved| saved.expires_at.clone())
                .unwrap_or_default();
            let finished = stage::respond(
                stage::StageInput {
                    failure,
                    source_digest: source_digest.clone(),
                    ..stage
                },
                remaining.clone(),
                Some(&text),
                Some(&mut kept),
                context,
            )?;
            let seed = kept.map(|structured| PageReplay {
                access: self.access,
                github_identity: None,
                expires_at,
                page_length: 0,
                page_scope: String::new(),
                structured,
                remaining,
                response_query: response_query.clone(),
                failure,
                source_digest: source_digest.clone(),
                text,
            });
            Ok::<_, ExecutionError>((finished, seed))
        };
        let (remaining, failure) = match settle(&mut structured) {
            Ok(settled) => settled,
            Err(error) => return Ok(Err(error)),
        };
        let (mut finished, seed) = respond(structured, remaining, failure)?;
        if let (Ok(outcome), Some(mut body)) = (&finished, body)
            && super::row_indices::is_paged(outcome)
        {
            let (remaining, failure) = match settle(&mut body) {
                Ok(settled) => settled,
                Err(error) => return Ok(Err(error)),
            };
            let (mut finished, seed) = respond(body, remaining, failure)?;
            if let Ok(outcome) = &mut finished {
                if let Some(seed) = seed {
                    self.remember_page(outcome, seed, context)?;
                }
                if self.options.response_offset.unwrap_or(0) == 0 {
                    super::row_indices::attach_rejected(
                        outcome,
                        rejected_rows,
                        self.id,
                        &self.response_query,
                        self.output.text_format,
                    );
                }
            }
            return Ok(finished);
        }
        if let (Ok(outcome), Some(seed)) = (&mut finished, seed) {
            self.remember_page(outcome, seed, context)?;
        }
        Ok(finished)
    }

    /// Publish a continuation only after its complete result is retained.
    fn remember_page(
        &self,
        outcome: &mut ToolOutcome,
        mut seed: PageReplay,
        context: &ExecutionContext,
    ) -> Result<(), ExecutionError> {
        let pagination = &outcome.structured_content["responsePagination"];
        let Some(snapshot) = pagination["snapshot"].as_str() else {
            return Ok(());
        };
        let next = &pagination["next"]["query"];
        seed.page_length = next["responseLength"]
            .as_u64()
            .and_then(|v| usize::try_from(v).ok())
            .or(self.options.response_length)
            .unwrap_or(self.output.auto_page_chars);
        seed.page_scope = next["responseScope"]
            .as_str()
            .unwrap_or_else(|| match pagination["scope"].as_str() {
                Some("rows") => "rows",
                Some("structuredContent") => "structured",
                _ => "text",
            })
            .into();
        let auth_retained = match self.dispatcher.github_access.identity() {
            Ok(Some(observed)) => {
                let current = self.dispatcher.github_response_identity(context);
                context.check()?;
                if current.as_ref().is_ok_and(|identity| identity == &observed) {
                    seed.github_identity = Some(observed);
                    true
                } else {
                    false
                }
            }
            Ok(None) => true,
            Err(()) => false,
        };
        let (saved, retained) = if auth_retained {
            self.replays.0.insert(&self.replays.1, snapshot, seed)
        } else {
            (Arc::new(seed), false)
        };
        if !retained {
            let mut stage = self.stage(
                saved.structured.clone(),
                saved.response_query.clone(),
                false,
            );
            stage.options = ResponsePageOptions {
                render_text: self.options.render_text,
                ..ResponsePageOptions::default()
            };
            stage.auto_page_chars = 0;
            stage.failure = saved.failure;
            stage.source_digest = saved.source_digest.clone();
            let warnings = stage.structured.as_object_mut().and_then(|map| {
                map.entry("warnings")
                    .or_insert_with(|| json!([]))
                    .as_array_mut()
            });
            if let Some(warnings) = warnings {
                warnings.push(json!("The response could not be retained with a stable access identity or within snapshot storage limits; the complete result is returned without display pagination."));
            }
            *outcome = stage::respond(stage, saved.remaining.clone(), None, None, context)?
                .map_err(|_| ExecutionError::WorkerFailed)?;
        }
        Ok(())
    }

    /// Executes the admitted rows, merges the `rejected` ones back in input
    /// order, and builds the sanitized, ranked envelope with its finalized
    /// continuations.
    fn shape_rows(
        &self,
        rejected: Vec<(usize, Value)>,
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> Result<ShapedRows, ExecutionError> {
        let EvaluatedRows {
            mut rows,
            failure,
            source_digest,
        } = self.evaluate_rows(context)?;
        let rejected_at: Vec<usize> = rejected.iter().map(|(index, _)| *index).collect();
        for (row, index) in rows.iter_mut().zip(&self.row_indices) {
            row["index"] = json!(index);
        }
        // The body a paged continuation reproduces holds the admitted rows
        // only; shaped from them alone, so nothing a rejected row carries (a
        // repair lead's path names `root`) reaches it.
        let admitted = (!rejected.is_empty()).then(|| rows.clone());
        rows.extend(rejected.into_iter().map(|(_, row)| row));
        rows.sort_by_key(|row| row["index"].as_u64());
        let (structured, response_query) = self.envelope_of(rows, &rejected_at, scope, context)?;
        Ok(ShapedRows {
            structured,
            response_query,
            rejected_at,
            admitted,
            failure,
            source_digest,
        })
    }

    /// Rows (input-ordered, `index` set) → the sanitized, ranked envelope
    /// with its finalized continuations, and the response query it answers.
    fn envelope_of(
        &self,
        rows: Vec<Value>,
        rejected_at: &[usize],
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> Result<(Value, Value), ExecutionError> {
        let by_row = super::row_indices::by_position(&self.queries, rejected_at);
        let mut structured = rows::envelope_in(rows, self.id, &by_row, &self.dispatcher.paths);
        rows::sanitize_output(
            &mut structured,
            self.id,
            &self.dispatcher.security,
            context,
            self.output.redact_emails,
        )?;
        let mut response_query = self.response_query.clone();
        if self.id.output().selects_provider_page() {
            crate::tools::selection::apply_sanitized_rows(
                self.id,
                &mut structured,
                &self.queries,
                &self.row_indices,
                &mut response_query,
                &self.dispatcher.selection_runtime(context),
            )?;
        }
        // An invalid continuation is a runtime defect: it fails loudly in
        // debug builds; otherwise finalize dropped it and marked its row,
        // which keeps its evidence.
        if let Err(error) = continuations::finalize(
            &mut structured,
            self.id,
            &continuations::Sources::Rows(&by_row),
            scope,
        ) {
            debug_assert!(
                false,
                "invalid {} continuation: {:?}",
                self.id, error.issues
            );
        }
        Ok((structured, response_query))
    }

    /// Runs every row (sharing the response window) and shapes it: result
    /// row, diagnostics, cache mark, hint policy, verbose prune, minimize.
    fn evaluate_rows(&self, context: &ExecutionContext) -> Result<EvaluatedRows, ExecutionError> {
        let (id, queries, dispatcher) = (self.id, &self.queries, &self.dispatcher);
        let response_page = self
            .options
            .response_length
            .unwrap_or(self.output.auto_page_chars);
        let evaluated =
            execute_ordinary_queries(id, queries, Some(response_page), dispatcher, context)?;
        // Source reads fit the response page, the caller's or the automatic.
        let evaluated =
            read_share::share_window(id, queries, evaluated, response_page, |shortened| {
                execute_ordinary_queries(id, shortened, Some(response_page), dispatcher, context)
            })?;
        let mut rows = Vec::with_capacity(queries.len());
        let mut source_digest = None;
        let mut failure = None;
        let mut evaluated = evaluated.into_iter();
        for (index, query) in queries.iter().enumerate() {
            context.check()?;
            let result = evaluated.next().ok_or(ExecutionError::WorkerFailed)?;
            context.check()?;
            if queries.len() == 1 {
                source_digest = result.source_digest;
            }
            failure = failure.or(result.failure);
            let mut row = rows::result_row(id, index, query, result.data, result.status);
            rows::attach_diagnostics(&mut row, result.diagnostics);
            if result.cache {
                row["cache"] = json!(1);
            }
            rows::apply_hint_policy(&mut row, id, query);
            crate::response::pages::note_remaining(&mut row, id, result.remaining);
            extras::prune_row(&mut row, id, query);
            rows::minimize_row(&mut row, id, query);
            rows.push(row);
        }
        Ok(EvaluatedRows {
            rows,
            failure,
            source_digest,
        })
    }
}

/// One call's public envelope before the response stage, with the input
/// positions of its rejected rows.
struct ShapedRows {
    structured: Value,
    response_query: Value,
    rejected_at: Vec<usize>,
    /// The admitted rows alone, when the batch has rejected rows.
    admitted: Option<Vec<Value>>,
    failure: Option<FailureKind>,
    source_digest: Option<String>,
}

/// Shaped result rows of one call, with the batch's failure kind and the
/// single row's source digest.
struct EvaluatedRows {
    rows: Vec<Value>,
    failure: Option<FailureKind>,
    source_digest: Option<String>,
}

fn runtime_execution_error(error: ExecutionError) -> RuntimeError {
    RuntimeError::new(error.code(), error.to_string())
}

impl CancellationCheck for ExecutionContext {
    fn check(&self) -> Result<(), String> {
        ExecutionContext::check(self).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod output_recovery_tests {
    use super::*;
    use stage::{isolate_output_rows, response_all_failed};

    fn mcp_from_rows(mut structured: Value) -> Value {
        assert!(isolate_output_rows("ghCloneRepo", &mut structured).expect("row isolation"));
        let all_failed = response_all_failed(&structured);
        let text = render::render_tool(
            ToolId::GhCloneRepo,
            &structured,
            &json!({"owner":"a","repo":"b"}),
            render::TextFormat::Yaml,
        );
        super::super::error::mcp_result(
            "ghCloneRepo",
            Ok(ToolOutcome {
                structured_content: structured,
                content: vec![TextContent {
                    r#type: "text".into(),
                    text,
                }],
                source_digest: None,
                failure: Some(FailureKind::Execution),
                all_failed,
            }),
        )
        .expect("MCP response")
    }

    #[test]
    fn malformed_single_row_is_an_error_in_both_mcp_channels() {
        let result = mcp_from_rows(json!({"results":[
            {"index":0,"data":{"owner":"a"}}
        ]}));
        assert_eq!(result["isError"], true);
        assert_eq!(
            result["structuredContent"]["results"][0]["data"]["errorCode"],
            "outputContractViolation"
        );
        assert!(
            result["content"][0]["text"]
                .as_str()
                .is_some_and(|text| text.contains("outputContractViolation")),
            "{result}"
        );
    }

    #[test]
    fn malformed_row_in_mixed_batch_keeps_healthy_row_and_mcp_success_flag() {
        let result = mcp_from_rows(json!({"results":[
            {"index":0,"data":{"owner":"a"}},
            {"index":1,"data":{
                "owner":"a","repo":"b","bytes":0,
                "location":{
                    "kind":"repo","localPath":"/tmp/repo",
                    "cached":false,"commitSha":"abc","verified":true,
                    "resolvedRef":"main"
                }
            }}
        ]}));
        assert_eq!(result["isError"], false);
        assert_eq!(
            result["structuredContent"]["results"][0]["data"]["errorCode"],
            "outputContractViolation"
        );
        assert_eq!(
            result["structuredContent"]["results"][1]["data"]["location"]["commitSha"],
            "abc"
        );
        assert!(
            result["content"][0]["text"]
                .as_str()
                .is_some_and(|text| text.contains("outputContractViolation")),
            "{result}"
        );
    }
}

#[cfg(test)]
mod batch_budget_tests {
    use super::*;

    #[test]
    fn independent_batches_fan_out_one_thread_per_query_and_classification_stays_ordered() {
        for id in ToolId::ALL {
            let ordered = matches!(id, ToolId::Clasify);
            let width = BatchBudget::new(id, 5, 12).width;
            assert_eq!(width, if ordered { 1 } else { 5 }, "{id}");
            assert_eq!(BatchBudget::new(id, 1, 12).width, 1, "{id}");
        }
    }

    #[test]
    fn concurrent_walks_split_the_cores_and_a_single_walk_keeps_the_default() {
        // Serializing walks measured slower, so rows stay concurrent and each
        // walk gets its share of the cores (see `BatchBudget`).
        let five = BatchBudget::new(ToolId::LocalSearch, 5, 12);
        assert_eq!(five.width, 5);
        assert_eq!(five.walk_threads, Some(2));
        assert_eq!(
            BatchBudget::new(ToolId::LocalSearch, 1, 12).walk_threads,
            None
        );
        // Never below one worker, even with more walks than cores.
        assert_eq!(
            BatchBudget::new(ToolId::LocalSearch, 5, 2).walk_threads,
            Some(1)
        );
        // Ordered tools run one row at a time with the full default.
        assert_eq!(BatchBudget::new(ToolId::Clasify, 5, 12).walk_threads, None);
    }
}

#[cfg(test)]
mod security_issue_tests {
    use super::*;

    /// Clasify evidence may be redacted in place; a credential-looking value
    /// in a resource read's `query` would run redacted, so it is rejected.
    #[test]
    fn a_secret_in_a_clasify_source_is_rejected_and_in_state_redacted() {
        let token = format!("ghp_{}", "a".repeat(36));
        let state = crate::security::ContentSecurity::new()
            .validate_input_parameters(&json!({"state":{"held":token}}));
        assert!(
            security_issues(&state, &[], true).is_empty(),
            "held state is redacted in place"
        );
        let checked = crate::security::ContentSecurity::new().validate_input_parameters(
            &json!({"source":{"tool":"localFetch","query":{"path":token}}}),
        );
        let issues = security_issues(&checked, &[], true);
        let paths = issues
            .iter()
            .map(|issue| issue.path.join("."))
            .collect::<Vec<_>>();
        assert_eq!(paths, ["source.query.path"], "{issues:?}");
        assert!(
            issues
                .iter()
                .all(|issue| issue.rule_id == "security.credential"),
            "{issues:?}"
        );
        let asset = crate::security::ContentSecurity::new().validate_input_parameters(
            &json!({"assets":{"image":{"type":"image","source":{"url":format!("https://example.com/{token}.png")}}}}),
        );
        let issues = security_issues(&asset, &[], true);
        assert_eq!(
            issues.len(),
            1,
            "an asset locator cannot be silently redacted"
        );
        assert_eq!(issues[0].path, ["assets.image.source.url"]);
    }
}

#[cfg(test)]
mod construction_tests {
    use super::*;
    use crate::config::FileInput;

    fn runtime(home: &std::path::Path, env: &[(&str, &str)]) -> ToolRuntime {
        let mut vars: BTreeMap<String, String> = env
            .iter()
            .map(|(key, value)| ((*key).into(), (*value).into()))
            .collect();
        vars.insert("OCTOCODE_HOME".into(), home.to_string_lossy().into_owned());
        ToolRuntime::new(crate::config::ConfigInput {
            env: vars,
            cwd: home.to_path_buf(),
            os_home: home.to_path_buf(),
            global_env: FileInput::Missing {
                path: home.join(".env"),
            },
            project_env: FileInput::Missing {
                path: home.join(".octocode/.env"),
            },
            config_file: FileInput::Missing {
                path: home.join(".octocoderc"),
            },
            project_config_file: FileInput::Missing {
                path: home.join(".octocode/.octocoderc"),
            },
            runtime_surface: RuntimeSurface::Mcp,
        })
        .expect("runtime")
    }

    async fn section_call(
        runtime: &ToolRuntime,
        query: Value,
        channel: Channel,
        token: &str,
    ) -> Value {
        let admission = runtime
            .admit("sections".into())
            .expect("admit")
            .with_github_token(SecretString::from(token.to_owned()));
        runtime
            .execute(admission, "clasify".into(), query, channel)
            .await
            .expect("sections response")
            .structured_content
    }

    async fn section_fixture(
        home: &std::path::Path,
        mode: &str,
    ) -> (ToolRuntime, wiremock::MockServer) {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::builder().start().await;
        Mock::given(method("POST")).and(path("/v1/systemone"))
            .respond_with(|request: &wiremock::Request| {
                let body: Value = serde_json::from_slice(&request.body).expect("body");
                let answers: serde_json::Map<String, Value> = body["questions"].as_object().expect("questions")
                    .keys().map(|key| (key.clone(), json!({"type":"noul","noul":0.9}))).collect();
                ResponseTemplate::new(200).set_body_json(json!({"model":"jev-1.13.0","answers":answers,"usage":{"input_tokens":10,"output_tokens":2}}))
            }).mount(&server).await;
        let runtime = runtime(
            home,
            &[
                ("OCTOCODE_BETA", "true"),
                ("OCTOCODE_CLASSIFICATION_API", "secret"),
                ("OCTOCODE_CLASSIFICATION_API_HOST", &server.uri()),
                ("OCTOCODE_STORAGE_MODE", mode),
            ],
        );
        let mut limits = RuntimeLimits::DEFAULT;
        limits.selection.max_candidates = 1;
        let runtime =
            ToolRuntime::with_limits(runtime.input.clone(), limits).expect("bounded runtime");
        (runtime, server)
    }

    fn section_query(home: &std::path::Path) -> Value {
        std::fs::write(
            home.join("first.txt"),
            "First source: restart the service.\n",
        )
        .expect("first");
        std::fs::write(
            home.join("second.txt"),
            "Second source: stop the service.\n",
        )
        .expect("second");
        json!({"queries":[{"id":"sections","operation":"sections","resources":{
            "first":{"tool":"localFetch","query":{"path":home.join("first.txt"),"fullContent":true}},
            "second":{"tool":"localFetch","query":{"path":home.join("second.txt"),"fullContent":true}}
        },"questions":{"restart":{"type":"noul","instructions":"Does this section require a restart?"}}}]})
    }

    #[tokio::test]
    async fn sections_runtime_resumes_replays_and_partitions_access_and_policy() {
        for mode in ["memory", "persistent"] {
            let home = tempfile::tempdir().expect("home");
            let (runtime, server) = section_fixture(home.path(), mode).await;
            let channel = if mode == "memory" {
                Channel::Mcp
            } else {
                Channel::Structured
            };
            let first =
                section_call(&runtime, section_query(home.path()), channel, "caller-a").await;
            let next = first["queries"][0]["next"]["nextSectionPage"]["query"].clone();
            assert!(next.is_object(), "{first}");
            assert_eq!(server.received_requests().await.unwrap().len(), 1);
            let denied = section_call(&runtime, next.clone(), channel, "caller-b").await;
            assert!(
                denied
                    .to_string()
                    .contains("classificationContextUnavailable"),
                "{denied}"
            );
            assert_eq!(server.received_requests().await.unwrap().len(), 1);
            let runtime = if mode == "persistent" {
                let mut changed = runtime.input.clone();
                changed
                    .env
                    .insert("OCTOCODE_ENABLE_LOCAL".into(), "false".into());
                let other =
                    ToolRuntime::with_limits(changed, runtime.limits).expect("other policy");
                let denied = section_call(&other, next.clone(), channel, "caller-a").await;
                assert!(
                    denied
                        .to_string()
                        .contains("classificationContextUnavailable"),
                    "{denied}"
                );
                runtime.close().await;
                ToolRuntime::with_limits(runtime.input.clone(), runtime.limits).expect("reopened")
            } else {
                runtime
            };
            let second = section_call(&runtime, next.clone(), channel, "caller-a").await;
            assert_eq!(
                second["queries"][0]["resources"]["second"]["sections"][0]["answers"]["restart"]["status"],
                "answered",
                "{second}"
            );
            assert_eq!(server.received_requests().await.unwrap().len(), 2);
            let replay = section_call(&runtime, next, channel, "caller-a").await;
            assert_eq!(
                replay["queries"][0]["resources"],
                second["queries"][0]["resources"]
            );
            assert_eq!(replay["queries"][0]["replayed"], true);
            assert_eq!(server.received_requests().await.unwrap().len(), 2);
            runtime.close().await;
            if mode == "memory" {
                assert!(!home.path().join("tmp/section-assessments").exists());
            }
        }
    }

    #[tokio::test]
    async fn sections_runtime_refuses_changed_sources_and_one_shot_memory_continuations() {
        let home = tempfile::tempdir().expect("home");
        let (runtime, server) = section_fixture(home.path(), "memory").await;
        let query = section_query(home.path());
        let one_shot = section_call(&runtime, query.clone(), Channel::Structured, "caller").await;
        assert!(one_shot.to_string().contains("unassessed"), "{one_shot}");
        assert!(one_shot["queries"][0].get("next").is_none());
        assert!(server.received_requests().await.unwrap().is_empty());
        let first = section_call(&runtime, query, Channel::Mcp, "caller").await;
        let next = first["queries"][0]["next"]["nextSectionPage"]["query"].clone();
        assert!(next.is_object(), "{first}");
        std::fs::write(home.path().join("second.txt"), "Changed source.").expect("change");
        let changed = section_call(&runtime, next, Channel::Mcp, "caller").await;
        assert!(changed.to_string().contains("sourceMismatch"), "{changed}");
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
        runtime.close().await;
    }

    #[tokio::test]
    async fn sections_runtime_checks_paths_and_sanitizes_before_inference() {
        let home = tempfile::tempdir().expect("home");
        let outside = tempfile::NamedTempFile::new().expect("outside");
        let (runtime, server) = section_fixture(home.path(), "memory").await;
        let secret = format!("ghp_{}", "A".repeat(36));
        let file = home.path().join("secret.txt");
        std::fs::write(&file, format!("Restart with token {secret}.\n")).expect("source");
        let result = section_call(&runtime, json!({"queries":[{"id":"secure","operation":"sections","resources":{
            "secret":{"tool":"localFetch","query":{"path":file,"fullContent":true}},
            "outside":{"tool":"localFetch","query":{"path":outside.path(),"fullContent":true}}
        },"questions":{"check":{"type":"noul","instructions":"Does this section require a restart?"}}}]}), Channel::Mcp, "caller").await;
        assert_eq!(
            result["queries"][0]["resources"]["outside"]["status"], "error",
            "{result}"
        );
        assert_eq!(
            result["queries"][0]["resources"]["secret"]["sections"][0]["answers"]["check"]["status"],
            "answered",
            "{result}"
        );
        let sent = server.received_requests().await.unwrap();
        assert_eq!(sent.len(), 1);
        let body = String::from_utf8(sent[0].body.clone()).unwrap();
        assert!(!body.contains(&secret), "provider received secret");
        assert!(body.contains("REDACTED"), "{body}");
        assert!(!result.to_string().contains(&secret));
        let mut context = ExecutionContext {
            cancellation: tokio_util::sync::CancellationToken::new(),
            deadline: std::time::Instant::now() - Duration::from_secs(1),
            walk_threads: None,
            response_window: None,
            github_credential: None,
        };
        assert_eq!(
            runtime
                .dispatcher()
                .capture_local_text(&json!({"path":file}), &context)
                .unwrap_err()
                .code,
            "timeout"
        );
        context.deadline = std::time::Instant::now() + Duration::from_secs(30);
        context.cancellation.cancel();
        assert_eq!(
            runtime
                .dispatcher()
                .capture_local_text(&json!({"path":file}), &context)
                .unwrap_err()
                .code,
            "cancelled"
        );
        runtime.close().await;
    }

    /// Keys no setting reads (unknown or removed) are left to `octocode
    /// config`; an ignored value of a live setting prints at every start.
    #[test]
    fn startup_prints_only_ignored_values_of_live_settings() {
        let diagnostic = |code: &str| config::ConfigDiagnostic {
            severity: config::Severity::Warning,
            code: code.into(),
            field_path: None,
            message: code.into(),
            source_path: None,
        };
        let diagnostics = [
            diagnostic(config::UNKNOWN_CONFIG_CODE),
            diagnostic(config::REMOVED_SETTING_CODE),
            diagnostic("invalid_config"),
            diagnostic("config_load_error"),
        ];
        let printed: Vec<&str> = startup_diagnostics(&diagnostics)
            .map(|diagnostic| diagnostic.code.as_str())
            .collect();
        assert_eq!(printed, ["invalid_config", "config_load_error"]);
    }

    /// Reads of small single files and stored provider pages admit as
    /// light; a directory, a large file, a missing path, lspSearch and a
    /// fresh provider call admit as walks.
    #[test]
    fn small_single_file_reads_and_stored_provider_pages_admit_as_light() {
        let home = tempfile::tempdir().expect("home");
        let root = home.path().canonicalize().expect("root");
        std::fs::write(root.join("small.rs"), "fn main() {}\n").expect("small");
        std::fs::write(
            root.join("large.txt"),
            vec![b'x'; usize::try_from(LIGHT_FILE_BYTES).unwrap() + 1],
        )
        .expect("large");
        std::fs::create_dir(root.join("src")).expect("dir");
        let runtime = runtime(&root, &[]);
        let cost = |id, rows: &[Value], replayed| runtime.request_cost(id, rows, replayed);
        let file = |path: &str| json!({"path": path});
        assert_eq!(
            cost(ToolId::LocalSearch, &[file("small.rs")], false),
            Cost::Light
        );
        assert_eq!(
            cost(ToolId::LocalFetch, &[file("small.rs"), file("src")], false),
            Cost::Walk
        );
        for row in [file("large.txt"), file("missing.rs"), json!({})] {
            assert_eq!(cost(ToolId::LocalFetch, &[row], false), Cost::Walk);
        }
        assert_eq!(
            cost(ToolId::LspSearch, &[file("small.rs")], false),
            Cost::Walk
        );
        // A judged row waits on the classification provider, so it walks
        // even on a small file.
        let judged = json!({"path": "small.rs", "clasifyContext": {"classifiers": ["Relevant?"]}});
        let continued = json!({"path": "small.rs", "selection": "token"});
        for id in [ToolId::LocalFetch, ToolId::LocalSearch] {
            for row in [&judged, &continued] {
                assert_eq!(
                    cost(id, std::slice::from_ref(row), false),
                    Cost::Walk,
                    "{id:?}"
                );
            }
            assert_eq!(
                cost(id, &[file("small.rs"), judged.clone()], false),
                Cost::Walk,
                "{id:?}"
            );
        }
        assert_eq!(cost(ToolId::GhSearchCode, &[json!({})], false), Cost::Walk);
        assert_eq!(cost(ToolId::GhSearchCode, &[json!({})], true), Cost::Light);
    }

    /// A runtime given a pool runs its servers there and leaves them to the
    /// pool's owner on close; one built alone owns and stops its own.
    #[tokio::test]
    async fn a_runtime_on_a_shared_pool_leaves_it_to_its_owner() {
        let home = tempfile::tempdir().expect("home");
        let pool = Arc::new(octocode_engine::lsp::pool::LspClientPool::default());
        let shared = ToolRuntime::from_host_with_lsp_pool(
            HostOptions {
                cwd: Some(home.path().to_path_buf()),
                env: Some(BTreeMap::from([(
                    "OCTOCODE_HOME".to_owned(),
                    home.path().to_string_lossy().into_owned(),
                )])),
                ..HostOptions::default()
            },
            Arc::clone(&pool),
        )
        .expect("runtime");
        assert!(Arc::ptr_eq(&shared.lsp_pool, &pool));
        assert!(!shared.owns_lsp_pool);
        shared.close().await;
        assert_eq!(Arc::strong_count(&pool), 2, "the pool outlives the close");
        let alone = runtime(home.path(), &[]);
        assert!(alone.owns_lsp_pool);
        assert!(!Arc::ptr_eq(&alone.lsp_pool, &pool));
    }

    /// The graph workspace and the language-server invocation directory
    /// come from the runtime's working directory, so a host serving several
    /// directories runs each like a CLI started there.
    #[test]
    fn the_graph_workspace_and_lsp_invocation_dir_follow_the_runtime_cwd() {
        let home = tempfile::tempdir().expect("home");
        let repo = home.path().join("repo");
        let cwd = repo.join("sub");
        std::fs::create_dir_all(repo.join(".git")).expect("git");
        std::fs::create_dir_all(&cwd).expect("sub");
        let mut input = runtime(home.path(), &[]).input.clone();
        input.cwd = cwd.clone();
        input
            .env
            .insert("WORKSPACE_ROOT".into(), repo.to_string_lossy().into_owned());
        let runtime = ToolRuntime::new(input).expect("runtime");
        assert_ne!(Some(cwd.clone()), std::env::current_dir().ok());
        assert_eq!(runtime.graph_workspace(None), repo);
        assert_eq!(runtime.graph_workspace(Some(&cwd)), cwd);
        let discovery = runtime.lsp_execution_config().discovery(None);
        assert_eq!(discovery.invocation_dir, Some(cwd));
    }

    /// Catalog `lspServers` resolve against the runtime's workspace
    /// (host cwd or configured workspaceRoot), not the process cwd.
    #[test]
    fn lsp_server_root_is_the_runtime_workspace_not_the_process_cwd() {
        let home = tempfile::tempdir().expect("home");
        let runtime = runtime(home.path(), &[]);
        assert_eq!(runtime.lsp_root(), home.path());
        assert_ne!(
            Some(runtime.lsp_root().to_path_buf()),
            std::env::current_dir().ok()
        );
    }

    #[test]
    fn availability_is_resolved_once_per_runtime() {
        let home = tempfile::tempdir().expect("home");
        let runtime = runtime(
            home.path(),
            &[
                ("OCTOCODE_ENABLE_LOCAL", "false"),
                ("DISABLE_TOOLS", "ghSearchRepo"),
            ],
        );
        let resolved = super::super::availability::ToolAvailability::resolve(
            runtime.config(),
            RuntimeSurface::Mcp,
        );
        for id in ToolId::ALL {
            assert_eq!(
                runtime.is_available(id.as_str()),
                resolved.is_available(id.as_str()),
                "{id}"
            );
        }
        assert!(!runtime.is_available("localSearch"));
        assert!(!runtime.is_available("noSuchTool"));
    }

    #[test]
    fn selection_presentation_requires_provider_and_an_available_goal_tool() {
        let home = tempfile::tempdir().expect("home");
        for (env, expected) in [
            (vec![], false),
            (vec![("OCTOCODE_CLASSIFICATION_API", "fixture-key")], true),
            (vec![("OCTOCODE_CLASSIFICATION_API", "fixture-key")], true),
            (
                vec![
                    ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                    ("DISABLE_TOOLS", "clasify"),
                ],
                true,
            ),
            (
                vec![
                    ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                    ("TOOLS_TO_RUN", "ghSearchHistory"),
                ],
                false,
            ),
            (
                vec![
                    ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                    ("TOOLS_TO_RUN", "ghSearchCode"),
                ],
                true,
            ),
            (
                vec![
                    ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                    ("TOOLS_TO_RUN", "clasify"),
                ],
                false,
            ),
            (
                vec![
                    ("OCTOCODE_CLASSIFICATION_API", "   "),
                    ("DISABLE_TOOLS", "clasify"),
                ],
                false,
            ),
        ] {
            let runtime = runtime(home.path(), &env);
            assert_eq!(runtime.presentation()["selection"], expected, "{env:?}");
        }
    }

    #[tokio::test]
    async fn hidden_public_clasify_keeps_goal_reads_available() {
        let home = tempfile::tempdir().expect("home");
        let runtime = runtime(
            home.path(),
            &[
                ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                ("TOOLS_TO_RUN", "ghSearchCode"),
            ],
        );
        assert!(!runtime.is_available("clasify"));
        assert_eq!(runtime.presentation()["selection"], true);
        assert!(!runtime.is_available("clasify"));
        assert!(runtime.dispatcher().selection_available);
    }

    #[tokio::test]
    async fn hidden_public_clasify_without_goal_surface_has_no_semantic_route() {
        let home = tempfile::tempdir().expect("home");
        let runtime = runtime(
            home.path(),
            &[
                ("OCTOCODE_CLASSIFICATION_API", "fixture-key"),
                ("TOOLS_TO_RUN", "ghSearchHistory"),
            ],
        );
        assert_eq!(runtime.presentation()["selection"], false);
        assert!(!runtime.dispatcher().selection_available);
    }

    #[test]
    fn only_persistent_storage_keeps_a_registry_cache() {
        let home = tempfile::tempdir().expect("home");
        let memory = runtime(home.path(), &[("OCTOCODE_STORAGE_MODE", "memory")]);
        assert!(memory.artifact_cache.is_none());
        let persistent = runtime(home.path(), &[("OCTOCODE_STORAGE_MODE", "persistent")]);
        assert!(persistent.artifact_cache.is_some());
    }

    /// A file-sourced language-server setting reaches the engine exactly as
    /// its environment spelling does (`lsp.cacheDir`).
    #[test]
    fn file_sourced_lsp_settings_reach_the_engine() {
        let home = tempfile::tempdir().expect("home");
        let mut vars = BTreeMap::new();
        vars.insert(
            "OCTOCODE_HOME".to_owned(),
            home.path().to_string_lossy().into_owned(),
        );
        let runtime = ToolRuntime::new(crate::config::ConfigInput {
            env: vars,
            cwd: home.path().to_path_buf(),
            os_home: home.path().to_path_buf(),
            global_env: FileInput::Missing {
                path: home.path().join(".env"),
            },
            project_env: FileInput::Missing {
                path: home.path().join(".octocode/.env"),
            },
            config_file: FileInput::Read {
                path: home.path().join(".octocoderc"),
                text: r#"{"lsp":{"cacheDir":"/tmp/lsp-cache"}}"#.into(),
            },
            project_config_file: FileInput::Missing {
                path: home.path().join(".octocode/.octocoderc"),
            },
            runtime_surface: RuntimeSurface::Mcp,
        })
        .expect("runtime");
        let env = &runtime.lsp_execution_config().env;
        let name = config::field::LSP_CACHE_DIR.env_name().expect("bound");
        assert_eq!(env.get(name).map(String::as_str), Some("/tmp/lsp-cache"));
    }

    /// Local tools reach only the GitHub checkouts (clones, materialized
    /// trees) and URL captures under the cache home, never the rest of it:
    /// credentials and logs stay outside every root.
    #[test]
    fn cache_home_exposes_only_checkout_trees() {
        let workspace = tempfile::tempdir().expect("workspace");
        let os_home = tempfile::tempdir().expect("os home");
        let home = os_home.path().join(".octocode");
        let credentials = home.join("credentials.json");
        let log = home.join("logs").join("x.log");
        let clone = crate::tools::gh_clone_repo::cache::clones_root(&home).join("o/r/main/f.rs");
        let tree =
            crate::tools::gh_structure::materialize::materialize_root(&home).join("o/r/sha/f.rs");
        let capture = crate::tools::source_capture::url::capture_root(&home).join("sha/source.txt");
        for file in [&credentials, &log, &clone, &tree, &capture] {
            std::fs::create_dir_all(file.parent().expect("parent")).expect("dir");
            std::fs::write(file, "x").expect("file");
        }
        let mut vars = BTreeMap::new();
        vars.insert(
            "OCTOCODE_HOME".to_owned(),
            home.to_string_lossy().into_owned(),
        );
        let runtime = ToolRuntime::new(crate::config::ConfigInput {
            env: vars,
            cwd: workspace.path().to_path_buf(),
            os_home: os_home.path().to_path_buf(),
            global_env: FileInput::Missing {
                path: os_home.path().join(".env"),
            },
            project_env: FileInput::Missing {
                path: workspace.path().join(".octocode/.env"),
            },
            config_file: FileInput::Missing {
                path: os_home.path().join(".octocoderc"),
            },
            project_config_file: FileInput::Missing {
                path: workspace.path().join(".octocode/.octocoderc"),
            },
            runtime_surface: RuntimeSurface::Mcp,
        })
        .expect("runtime");
        for denied in [&credentials, &log, &home] {
            assert!(
                runtime.paths.validate(denied).is_err(),
                "{}",
                denied.display()
            );
        }
        for allowed in [&clone, &tree, &capture] {
            assert!(
                runtime.paths.validate(allowed).is_ok(),
                "{}",
                allowed.display()
            );
        }
    }
}

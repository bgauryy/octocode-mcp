use super::{ExecutionContext, ExecutionError, RequestRuntime, RuntimeLimits};
use crate::config::{self, ConfigInput, ConfigOutput, RuntimeSurface};
use crate::contracts;
use crate::policy::path::{PathPolicy, PathPolicyConfig};
use crate::response::pager::{ResponsePageOptions, TextContent};
use crate::response::{continuations, extras, read_share, render, rows, stage};
use crate::security::{ContentSecurity, ValidationResult};
use crate::tools::ast_graph::store as graph_store;
use crate::tools::cancel::CancellationCheck;
use crate::tools::id::ToolId;
use crate::tools::local_fetch::LocalFetchRegex;
use crate::tools::result::FailureKind;

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
    paths: Arc<PathPolicy>,
    security: Arc<ContentSecurity>,
    github_cache: super::github_cache::GitHubContentCache,
    github_services: Arc<
        std::sync::OnceLock<Result<super::github::GitHubServices, octocode_github::ProviderError>>,
    >,
    lsp_pool: Arc<octocode_engine::lsp::pool::LspClientPool>,
    /// Sanitized full views of recently paged local files (this runtime's
    /// security policy only), so each localFetch page skips a full rescan.
    local_views: Arc<crate::security::scan::SanitizedViewMemo>,
    /// Pre-paging envelopes of recent paged responses (this runtime's config
    /// and workspace only), so a later page skips re-executing the batch.
    page_replays: Arc<PageReplayMemo>,
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

/// One paged response's envelope before paging, replayed only for a request
/// that carries the page's `responseSnapshot` while its sources are
/// unchanged since it executed.
#[derive(Clone)]
struct PageReplay {
    key: [u8; 32],
    snapshot: String,
    /// When the rows started executing: the sources must be unchanged since.
    started: std::time::SystemTime,
    stored: std::time::Instant,
    bytes: usize,
    structured: Value,
    response_query: Value,
    failure: Option<FailureKind>,
    source_digest: Option<String>,
}

/// Bounded LRU of [`PageReplay`]s. A page served from it is byte-identical
/// to the one a same-snapshot re-execution would produce, without the
/// dispatch; a mismatched or missing snapshot, or changed sources, always
/// re-execute, so a later page answers as a fresh runtime would.
#[derive(Default)]
struct PageReplayMemo {
    entries: std::sync::Mutex<std::collections::VecDeque<PageReplay>>,
}

impl PageReplayMemo {
    const MAX_ENTRIES: usize = 8;
    const MAX_BYTES: usize = 32 * 1024 * 1024;
    const TTL: Duration = Duration::from_secs(120);

    fn get(&self, key: &[u8; 32], snapshot: &str) -> Option<PageReplay> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        entries.retain(|entry| entry.stored.elapsed() < Self::TTL);
        let position = entries
            .iter()
            .position(|entry| &entry.key == key && entry.snapshot == snapshot)?;
        let entry = entries.remove(position)?;
        entries.push_back(entry.clone());
        Some(entry)
    }

    fn insert(&self, entry: PageReplay) {
        if entry.bytes > Self::MAX_BYTES {
            return;
        }
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        entries.retain(|stored| stored.key != entry.key && stored.stored.elapsed() < Self::TTL);
        entries.push_back(entry);
        let mut bytes: usize = entries.iter().map(|stored| stored.bytes).sum();
        while entries.len() > Self::MAX_ENTRIES || bytes > Self::MAX_BYTES {
            let Some(evicted) = entries.pop_front() else {
                break;
            };
            bytes -= evicted.bytes;
        }
    }
}

/// Identity of an executed batch: the validated (defaulted, sanitized) rows
/// in canonical key order and their original input indices, so a compacted
/// `next.query` replay (which carries only the admitted rows) maps to its
/// origin however the caller ordered its fields.
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

/// An invalid row of an isolated batch, shaped like any other error row.
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
    if let Some(details) = formatted.get("details") {
        data["hints"] = details.clone();
    }
    let mut row = rows::result_row(tool, index, &raw, data, Some("error"));
    extras::prune_row(&mut row, tool, &raw);
    (index, row)
}

fn invalid_input_error(tool: &str, error: contracts::ContractValidationError) -> RuntimeError {
    let mut payload = contracts::format_input_error(tool, &error);
    payload["errorCode"] = json!("invalidInput");
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

/// Put rejected rows back at their input positions and renumber `index`, so
/// rows stay aligned with the caller's queries.
pub(crate) fn merge_rejected_rows(rows: &mut Vec<Value>, rejected: Vec<(usize, Value)>) {
    if rejected.is_empty() {
        return;
    }
    for (index, row) in rejected {
        let position = index.min(rows.len());
        rows.insert(position, row);
    }
    for (index, row) in rows.iter_mut().enumerate() {
        row["index"] = json!(index);
    }
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
        let walk_threads =
            (width > 1).then(|| u32::try_from((cores / width).max(1)).unwrap_or(u32::MAX));
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
            .map(|query| scope.spawn(move || dispatcher.execute(tool, query, context)))
            .collect::<Vec<_>>();
        tasks
            .into_iter()
            .map(|task| task.join().map_err(|_| ExecutionError::WorkerFailed)?)
            .collect()
    })
}

impl ToolRuntime {
    pub fn from_host(options: HostOptions) -> Result<Self, RuntimeError> {
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
        let mut runtime = Self::new(input)?;
        // Misconfiguration never fails startup; say what was ignored and
        // where. stderr only: stdout carries CLI results and MCP JSON-RPC.
        // An unknown key changes nothing, so `octocode config` reports it
        // instead of every call.
        for diagnostic in &runtime.config.diagnostics {
            if diagnostic.code != config::UNKNOWN_CONFIG_CODE {
                eprintln!("{diagnostic}");
            }
        }
        // storage.mode=memory must not touch the disk cache at all.
        if config::is_persistent_storage_enabled(&runtime.config.resolved) {
            super::maintenance::run_if_due(
                &runtime.config.home,
                crate::tools::source_capture::url::capture_ttl(&runtime.config.resolved),
            );
        }
        if let Some(secs) = options.timeout_secs {
            // An embedder's budget replaces the surface default.
            runtime.requests = RequestRuntime::new(RuntimeLimits {
                timeout: std::time::Duration::from_secs(secs),
                ..RuntimeLimits::default()
            })
            .map_err(runtime_execution_error)?;
        }
        Ok(runtime)
    }

    pub fn new(input: ConfigInput) -> Result<Self, RuntimeError> {
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
            RequestRuntime::new(RuntimeLimits::default()).map_err(runtime_execution_error)?;
        // Each response cache owns its directory, so one cache's budget or
        // clear never touches the other's entries.
        let persistent = config::is_persistent_storage_enabled(&config.resolved);
        let response_dir = persistent.then(|| octocode_home.join("tmp").join("response"));
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
            // Resolved settings the engine reads by name: `lsp.cacheDir` and
            // `lsp.maxMemoryMb` may come from `.octocoderc`, not only the
            // environment, and the resolved value wins either way.
            env: config
                .effective_env
                .iter()
                .filter(|(key, _)| key.starts_with("OCTOCODE_"))
                .map(|(key, value)| (key.clone(), value.clone()))
                .chain(
                    [
                        (
                            config::field::LSP_CACHE_DIR,
                            config.resolved.lsp.cache_dir.clone(),
                        ),
                        (
                            config::field::LSP_MAX_MEMORY_MB,
                            config.resolved.lsp.max_memory_mb.map(|mb| mb.to_string()),
                        ),
                    ]
                    .into_iter()
                    .filter_map(|(field, value)| Some((field.env_name()?.to_owned(), value?))),
                )
                .collect(),
            octocode_home: Some(octocode_home),
            lead_cache: std::sync::Arc::default(),
            prewarm_state: std::sync::Arc::default(),
        });
        let classification = crate::providers::classification::provider();
        let evaluator = evaluator(&config, classification, &config.home, persistent);
        let availability = Arc::new(super::availability::ToolAvailability::resolve(
            &config,
            input.runtime_surface,
        ));
        let selection_available = selection_available(&config, &availability);
        Ok(Self {
            requests,
            input,
            config,
            classification,
            availability,
            evaluator,
            selection_available,
            paths: Arc::new(paths),
            security: Arc::new(security),
            github_cache,
            github_services: Arc::new(std::sync::OnceLock::new()),
            lsp_pool: Arc::new(octocode_engine::lsp::pool::LspClientPool::default()),
            local_views: Arc::default(),
            page_replays: Arc::default(),
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
        self.lsp_pool.clear_all().await;
        self.github_cache.clear_memory();
    }
    pub fn inspect_config(&self) -> config::ConfigInspectorData {
        config::inspector_data(&self.input, &self.config)
    }

    /// Delete every cached response: GitHub content and registry answers.
    pub fn clear_response_caches(&self) {
        self.github_cache.clear();
        if let Some(artifact) = &self.artifact_cache {
            artifact.clear();
        }
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
        graph_store::ingest(
            options,
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
        graph_store::query(options, &self.paths)
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
            "grammarCapabilities": octocode_engine::portable::grammar_capabilities(),
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
        if clasify {
            crate::tools::clasify::reject_response_pagination(&input)?;
        }
        // Parse response-paging options before contract validation.
        let mut options = ResponsePageOptions::deserialize(&input).unwrap_or_default();
        options.render_text = Some(render_text);
        let AdmittedRows {
            queries,
            rejected: rejected_rows,
        } = self.admit_queries(id, &input)?;
        let response_query = if queries.len() == 1 {
            queries[0].clone()
        } else {
            json!({"queries":queries})
        };
        // Each admitted row's original input index: from the snapshot mark of
        // a continuation (which carries only admitted rows), else every input
        // position not rejected.
        let rejected_at: Vec<usize> = rejected_rows.iter().map(|(index, _)| *index).collect();
        let marked = options
            .response_snapshot
            .as_deref()
            .filter(|_| rejected_rows.is_empty())
            .and_then(|snapshot| super::row_indices::unmark(snapshot, queries.len()));
        let row_indices = match marked {
            Some((snapshot, indices)) => {
                options.response_snapshot = Some(snapshot);
                indices
            }
            None => super::row_indices::admitted_indices(queries.len(), &rejected_at),
        };
        let replay_key = page_replay_key(
            &tool,
            mcp,
            &queries,
            &row_indices,
            admission.github_credential(),
        );
        let replayed = options
            .response_snapshot
            .as_deref()
            .filter(|_| !clasify)
            .and_then(|snapshot| self.page_replays.get(&replay_key, snapshot));
        let run = ChannelRun {
            id,
            mcp,
            options,
            queries,
            rejected_rows,
            row_indices,
            response_query,
            clasify,
            dispatcher: self.dispatcher(),
            output: OutputSettings {
                redact_emails: self.config.resolved.output.redact_emails,
                auto_page_chars: self.config.resolved.output.pagination.default_char_length
                    as usize,
                text_format: render::TextFormat::from_config(&self.config.resolved.output.format),
            },
            replayed,
            replays: (self.page_replays.clone(), replay_key),
        };
        self.requests
            .execute_blocking_admitted(admission, move |context| run.run(&context))
            .await
            .map_err(runtime_execution_error)?
            .map_err(|error| output_contract_error(&tool, error))
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
                .map_err(|error| invalid_input_error(tool, error))?;
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
            config: self.config.clone(),
            home: self.config.home.clone(),
            handle: tokio::runtime::Handle::current(),
            lsp_pool: self.lsp_pool.clone(),
            local_views: self.local_views.clone(),
            lsp_execution_config: self.lsp_execution_config.clone(),
            availability: self.availability.clone(),
            selection_available: self.selection_available,
            evaluator: self.evaluator.clone(),
            artifact_cache: self.artifact_cache.clone(),
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
    provider: &'static dyn crate::providers::classification::ClassificationProvider,
    octocode_home: &std::path::Path,
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
        Duration::from_millis(u64::from(config.resolved.network.timeout)),
        config.resolved.network.max_retries,
        config.resolved.classification.max_concurrency as usize,
        persistent.then(|| octocode_home.join("tmp").join("judgment")),
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
                return Err(invalid_input_error(tool, error));
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
    replayed: Option<PageReplay>,
    replays: (Arc<PageReplayMemo>, [u8; 32]),
}

impl ChannelRun {
    fn run(self, context: &ExecutionContext) -> StageResult {
        let mark = super::row_indices::mark(&self.row_indices);
        let mut finished = self.run_unmarked(context)?;
        if let (Ok(outcome), Some(mark)) = (&mut finished, mark) {
            super::row_indices::mark_snapshots(outcome, &mark);
        }
        Ok(finished)
    }

    fn run_unmarked(mut self, context: &ExecutionContext) -> StageResult {
        if let Some(replay) = self.replayed.take()
            && super::source_identity::unchanged_since(
                self.id,
                &self.queries,
                &self.dispatcher.paths,
                replay.started,
            )
        {
            let stage = self.stage(replay.structured, replay.response_query, true);
            return stage::finish(
                stage::StageInput {
                    failure: replay.failure,
                    source_digest: replay.source_digest,
                    ..stage
                },
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
            self.run_clasify(rejected, &scope, context)
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
            options: self.options.clone(),
            mcp: self.mcp,
            failure: None,
            auto_page_chars: self.output.auto_page_chars,
            text_format: self.output.text_format,
            allow_auto_paging,
            source_digest: None,
        }
    }

    /// Clasify runs its own rows through the shared evaluator; its answers
    /// are billed per evaluation, so its response never auto-pages.
    fn run_clasify(
        &self,
        rejected: Vec<(usize, Value)>,
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> StageResult {
        let mut receipts = crate::tools::clasify::call(
            &self.dispatcher.evaluator,
            &self.queries,
            rejected,
            &self.dispatcher,
            context,
        )?;
        if let Err(error) = continuations::finalize(
            &mut receipts.structured,
            self.id,
            &continuations::Sources::Matrices(&self.response_query),
            scope,
        ) {
            debug_assert!(false, "invalid clasify continuation: {:?}", error.issues);
        }
        let stage = self.stage(receipts.structured, self.response_query.clone(), false);
        stage::finish(
            stage::StageInput {
                failure: receipts.failure,
                ..stage
            },
            context,
        )
    }

    /// Ordinary rows: execute, shape each row, envelope, continuations, then
    /// the shared response stage (and a replay seed when the response pages).
    fn run_rows(
        &self,
        rejected: Vec<(usize, Value)>,
        scope: &continuations::Scope<'_>,
        context: &ExecutionContext,
    ) -> StageResult {
        let started = std::time::SystemTime::now();
        let ShapedRows {
            structured,
            response_query,
            rejected_at,
            failure,
            source_digest,
        } = self.shape_rows(rejected, scope, context)?;
        // A replay seed only for a response that can page: an explicit
        // window, or one near the automatic page size.
        let pageable = self.options.explicit()
            || crate::tools::stream_page::json_chars(&structured) * 2 > self.output.auto_page_chars;
        let seed_of = |structured: &Value| PageReplay {
            key: self.replays.1,
            snapshot: String::new(),
            started,
            stored: std::time::Instant::now(),
            bytes: 0,
            structured: structured.clone(),
            response_query: response_query.clone(),
            failure,
            source_digest: source_digest.clone(),
        };
        // A paged batch with rejected rows pages only its admitted rows (the
        // body a continuation reproduces); the rejected rows ride page 1.
        let body = (pageable && !rejected_at.is_empty())
            .then(|| super::row_indices::admitted_body(&structured, &rejected_at));
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
        let seed = pageable.then(|| seed_of(&structured));
        let stage = self.stage(structured, response_query.clone(), true);
        let finished = stage::finish(
            stage::StageInput {
                failure,
                source_digest: source_digest.clone(),
                ..stage
            },
            context,
        )?;
        if let (Ok(outcome), Some(body)) = (&finished, body)
            && super::row_indices::is_paged(outcome)
        {
            let seed = seed_of(&body);
            let stage = self.stage(body, response_query.clone(), true);
            let mut finished = stage::finish(
                stage::StageInput {
                    failure,
                    source_digest,
                    ..stage
                },
                context,
            )?;
            if let Ok(outcome) = &mut finished {
                remember_page(&self.replays.0, outcome, seed);
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
        if let (Ok(outcome), Some(seed)) = (&finished, seed) {
            remember_page(&self.replays.0, outcome, seed);
        }
        Ok(finished)
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
        rows.extend(rejected.into_iter().map(|(_, row)| row));
        rows.sort_by_key(|row| row["index"].as_u64());
        let by_row = super::row_indices::by_position(&self.queries, &rejected_at);
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
        Ok(ShapedRows {
            structured,
            response_query,
            rejected_at,
            failure,
            source_digest,
        })
    }

    /// Runs every row (sharing the response window) and shapes it: result
    /// row, diagnostics, cache mark, hint policy, verbose prune, minimize.
    fn evaluate_rows(&self, context: &ExecutionContext) -> Result<EvaluatedRows, ExecutionError> {
        let (id, queries, dispatcher) = (self.id, &self.queries, &self.dispatcher);
        let auto_page_chars = self.output.auto_page_chars;
        let response_page = self.options.response_length.unwrap_or(auto_page_chars);
        let evaluated =
            execute_ordinary_queries(id, queries, Some(response_page), dispatcher, context)?;
        let evaluated = read_share::share_window(
            id,
            queries,
            evaluated,
            (!self.options.explicit()).then_some(auto_page_chars),
            |shortened| {
                execute_ordinary_queries(id, shortened, Some(response_page), dispatcher, context)
            },
        )?;
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

/// Keeps a paged response's pre-paging envelope for its later pages.
fn remember_page(replays: &PageReplayMemo, outcome: &ToolOutcome, mut seed: PageReplay) {
    let pagination = &outcome.structured_content["responsePagination"];
    if pagination["hasMore"] == true
        && let Some(snapshot) = pagination["snapshot"].as_str()
    {
        seed.snapshot = snapshot.to_owned();
        seed.bytes = json_bytes(&seed.structured);
        replays.insert(seed);
    }
}

/// Serialized JSON length of `value` in bytes, without building the string.
fn json_bytes(value: &Value) -> usize {
    struct ByteCounter(usize);
    impl std::io::Write for ByteCounter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 += bytes.len();
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut counter = ByteCounter(0);
    serde_json::to_writer(&mut counter, value).map_or(0, |()| counter.0)
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
                    "kind":"repo","localPath":"/tmp/repo","source":"clone",
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
    fn read_only_batches_fan_out_one_thread_per_query_and_mutations_stay_ordered() {
        for id in ToolId::ALL {
            let ordered = matches!(
                id,
                ToolId::GhCloneRepo | ToolId::AstRewrite | ToolId::Clasify
            );
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
        assert_eq!(
            BatchBudget::new(ToolId::AstRewrite, 5, 12).walk_threads,
            None
        );
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
    /// its environment spelling does (`lsp.cacheDir`, `lsp.maxMemoryMb`).
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
                text: r#"{"lsp":{"maxMemoryMb":512,"cacheDir":"/tmp/lsp-cache"}}"#.into(),
            },
            project_config_file: FileInput::Missing {
                path: home.path().join(".octocode/.octocoderc"),
            },
            runtime_surface: RuntimeSurface::Mcp,
        })
        .expect("runtime");
        let env = &runtime.lsp_execution_config().env;
        for (field, value) in [
            (config::field::LSP_MAX_MEMORY_MB, "512"),
            (config::field::LSP_CACHE_DIR, "/tmp/lsp-cache"),
        ] {
            let name = field.env_name().expect("bound");
            assert_eq!(env.get(name).map(String::as_str), Some(value), "{name}");
        }
    }

    /// `cache clear` empties both response caches, each in its own
    /// directory, and leaves the rest of the home alone.
    #[test]
    fn clearing_response_caches_empties_both_directories() {
        let home = tempfile::tempdir().expect("home");
        let runtime = runtime(home.path(), &[("OCTOCODE_STORAGE_MODE", "persistent")]);
        let tmp = home.path().join("tmp");
        for (dir, file) in [("response", "a.json"), ("artifact", "b.json")] {
            std::fs::create_dir_all(tmp.join(dir)).expect("dir");
            std::fs::write(tmp.join(dir).join(file), "{}").expect("entry");
        }
        std::fs::write(home.path().join("keep.txt"), "x").expect("other");
        runtime.clear_response_caches();
        for dir in ["response", "artifact"] {
            let left = std::fs::read_dir(tmp.join(dir))
                .map(|entries| entries.count())
                .unwrap_or(0);
            assert_eq!(left, 0, "{dir}");
        }
        assert!(home.path().join("keep.txt").exists());
    }

    #[test]
    fn replay_bytes_are_the_serialized_length() {
        let value = json!({"a": "é😀\n\"", "b": [1, 2.5, null]});
        assert_eq!(json_bytes(&value), value.to_string().len());
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

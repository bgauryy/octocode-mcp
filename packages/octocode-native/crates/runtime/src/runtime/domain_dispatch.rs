//! One domain execution path for public tools and Jev's bounded read context.
use super::{ExecutionContext, ExecutionError, dispatch, github, github_cache::GitHubContentCache};
use crate::{
    config::ConfigOutput,
    policy::path::PathPolicy,
    security::ContentSecurity,
    tools::{
        ast_graph::AstTopologyRuntimeOptions,
        ast_rewrite::AstRewriteRuntimeOptions,
        id::{ToolFamily, ToolId},
        local_fetch::LocalFetchRegex,
        lsp_search::{LspExecutionConfig, prewarm},
    },
};
use octocode_github::ProviderError;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, OnceLock},
};

pub(crate) struct DomainDispatcher {
    pub paths: Arc<PathPolicy>,
    pub security: Arc<ContentSecurity>,
    pub regex: LocalFetchRegex,
    pub(super) github_services: Arc<OnceLock<Result<github::GitHubServices, ProviderError>>>,
    pub(super) github_cache: GitHubContentCache,
    pub config: Arc<ConfigOutput>,
    /// Internal limits: the runtime's code constants.
    pub limits: crate::runtime::RuntimeLimits,
    pub home: PathBuf,
    pub handle: tokio::runtime::Handle,
    pub lsp_pool: Arc<octocode_engine::lsp::pool::LspClientPool>,
    pub local_views: Arc<crate::security::scan::SanitizedViewMemo>,
    pub lsp_execution_config: Arc<LspExecutionConfig>,
    pub availability: Arc<super::availability::ToolAvailability>,
    /// Provider readiness and an enabled goals surface, independent of the
    /// public clasify tool's availability.
    pub selection_available: bool,
    pub evaluator: crate::tools::judgment::Evaluator,
    /// Registry answers for artifactSearch; `None` under memory storage.
    pub artifact_cache: Option<Arc<crate::providers::artifact::ArtifactCache>>,
}

impl DomainDispatcher {
    /// Acquire binary evidence through the same GitHub credential, commit
    /// resolution, byte cache and request budget as a file read.
    pub(crate) fn capture_github_asset(
        &self,
        query: &Value,
        context: &ExecutionContext,
        max_bytes: usize,
    ) -> Result<octocode_github::ContentResponse, crate::tools::judgment::ClassificationError> {
        let acquired = self
            .github_services
            .get_or_init(|| {
                github::GitHubServices::new(
                    self.config.clone(),
                    &self.limits,
                    self.home.clone(),
                    self.github_cache.clone(),
                )
            })
            .as_ref()
            .map_err(Clone::clone)
            .and_then(|services| services.capture_content(query, context, &self.handle, max_bytes));
        acquired.map_err(|error| {
            let row = github::provider_error(error);
            crate::tools::judgment::ClassificationError {
                code: row.data["errorCode"]
                    .as_str()
                    .unwrap_or("classificationContextFailed")
                    .into(),
                message: row.data["error"]
                    .as_str()
                    .unwrap_or("The GitHub image could not be acquired.")
                    .into(),
                failure: row.failure,
                hints: row.data["hints"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
                ..Default::default()
            }
        })
    }

    pub(super) fn selection_runtime(
        &self,
        context: &ExecutionContext,
    ) -> crate::tools::selection::Runtime {
        crate::tools::selection::Runtime {
            limits: self.limits.selection,
            available: self.selection_available,
            judge: Arc::new(self.evaluator.clone()),
            handle: self.handle.clone(),
            context: context.clone(),
        }
    }

    /// Every route matches the contract family exhaustively; within a
    /// family only the tools with their own runner are named. The runtime
    /// resolves the wire name once.
    pub fn execute(
        &self,
        tool: ToolId,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<dispatch::DomainResult, ExecutionError> {
        let _enter = self.handle.enter();
        context.check()?;
        match tool.family() {
            ToolFamily::GitHub => self.execute_github(tool, query, context),
            ToolFamily::Local if tool == ToolId::LspSearch => self.execute_lsp(query, context),
            ToolFamily::Local => self.execute_local(tool, query, context),
            // Clasify runs its own batch, never a domain row.
            ToolFamily::Remote if tool.is_clasify() => Err(ExecutionError::UnroutedTool),
            ToolFamily::Remote => self.execute_artifact(query, context),
        }
    }

    fn execute_github(
        &self,
        tool: ToolId,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<dispatch::DomainResult, ExecutionError> {
        let selection = self.selection_runtime(context);
        match self.github_services.get_or_init(|| {
            github::GitHubServices::new(
                self.config.clone(),
                &self.limits,
                self.home.clone(),
                self.github_cache.clone(),
            )
        }) {
            Ok(services) => services.execute_query(
                tool,
                query,
                context,
                &self.security,
                &self.regex,
                &self.handle,
                &self.paths,
                &selection,
            ),
            Err(error) => Ok(github::provider_error(error.clone())),
        }
    }

    fn execute_artifact(
        &self,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<dispatch::DomainResult, ExecutionError> {
        let query = match dispatch::parse_query(query) {
            Ok(query) => query,
            Err(row) => return Ok(*row),
        };
        // Release tags are checked through the GitHub transport; without
        // usable GitHub services a lookup reads no tags.
        let services = self
            .github_services
            .get_or_init(|| {
                github::GitHubServices::new(
                    self.config.clone(),
                    &self.limits,
                    self.home.clone(),
                    self.github_cache.clone(),
                )
            })
            .as_ref()
            .ok();
        let tags = services.map(|services| services.release_tags(context));
        let env = self.config.credential_env();
        let call = crate::tools::artifact_search::ArtifactCall {
            deadline: context.deadline,
            cancellation: context.cancellation.clone(),
            allow_private_registry: self.config.resolved.network.allow_private_registry,
            cache: self.artifact_cache.as_deref(),
            timeout: self.limits.network_timeout,
            max_retries: self.limits.max_retries,
            tags: tags
                .as_ref()
                .map(|tags| tags as &dyn crate::providers::artifact::ReleaseTags),
            env: &env,
        };
        self.handle.block_on(async {
            Ok(
                match crate::tools::artifact_search::execute(query, call).await {
                    Ok(data) => dispatch::data_result(data),
                    Err(error) => {
                        let next = error.next;
                        let mut row = dispatch::provider_failure(
                            error.message,
                            error.code,
                            error.hints,
                            error.status,
                            None,
                        );
                        // A repair lead is the recovery: no code fallback
                        // text beside it.
                        if let Some(next) = next
                            && let Some(data) = row.data.as_object_mut()
                        {
                            data.shift_remove("hints");
                            data.insert("next".into(), *next);
                        }
                        row
                    }
                },
            )
        })
    }

    fn execute_lsp(
        &self,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<dispatch::DomainResult, ExecutionError> {
        let query: crate::tools::lsp_search::LspSearchQuery = match dispatch::parse_query(query) {
            Ok(query) => query,
            Err(row) => return Ok(*row),
        };
        let requested = query.path().map(str::to_owned);
        self.handle.block_on(async {
            match crate::tools::lsp_search::execute(
                query,
                context,
                &self.lsp_pool,
                &self.paths,
                &self.lsp_execution_config,
                context.response_window,
            )
            .await
            {
                Ok(data) => Ok(dispatch::value_result(data)),
                Err(failure) => {
                    // A cancelled/expired request is a runtime outcome,
                    // not a provider failure.
                    context.check()?;
                    let missing = failure.code == crate::policy::PATH_NOT_FOUND;
                    let mut row = dispatch::provider_failure(
                        failure.message,
                        failure.code.into(),
                        vec![failure.hint.into()],
                        None,
                        Some(failure.retryable),
                    );
                    // The same recovery every local tool gives a missing path.
                    if missing
                        && let Some(next) = requested.as_deref().and_then(|requested| {
                            crate::tools::result::missing_path_lead(&self.paths, requested)
                        })
                    {
                        row.data["next"] = next;
                    }
                    Ok(row)
                }
            }
        })
    }

    fn execute_local(
        &self,
        tool: ToolId,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<dispatch::DomainResult, ExecutionError> {
        let query = query.clone();
        let paths = self.paths.clone();
        let security = self.security.clone();
        let regex = self.regex;
        let views = self.local_views.clone();
        // Streamed listing pages are sized to fit one automatic response
        // window, which every call of a walk shares (an explicit
        // `responseLength` is per call, so it never moves a page cut).
        let window = self.limits.auto_page_chars;
        let context = ExecutionContext {
            response_window: (window > 0).then_some(window),
            ..context.clone()
        };
        // OCTOCODE_BETA is the shared gate for beta local tools. For astRewrite,
        // enabling beta permits both preview and hash-guarded apply.
        let rewrite = AstRewriteRuntimeOptions {
            allow_apply: self.config.resolved.local.beta,
            state_dir: self
                .config
                .env_value(crate::config::environment::OCTOCODE_AST_REWRITE_STATE_DIR)
                .filter(|dir| !dir.is_empty())
                .map(PathBuf::from),
            ..Default::default()
        };
        let topology = AstTopologyRuntimeOptions {
            cargo: self
                .config
                .env_value(crate::config::environment::OCTOCODE_CARGO)
                .map(str::to_owned),
            cache_dir: crate::config::is_persistent_storage_enabled(&self.config.resolved)
                .then(|| self.home.join("tmp").join("topology")),
            response_window: context.response_window,
        };
        let selection = self.selection_runtime(&context);
        // `lsp.prewarm`: `targeted` warms the server an offered lspSearch
        // call names; `all` also warms the file a read or search names.
        let prewarm_mode = self.config.resolved.lsp.prewarm;
        let prewarm_query = (prewarm_mode == crate::config::LspPrewarm::All).then(|| query.clone());
        let lsp = self.lsp_execution_config.clone();
        let result = self.handle.block_on(async {
            tokio::task::spawn_blocking(move || {
                // lspSearch leads offered by local tools probe the runtime's
                // resolved server settings, not the bare process env.
                crate::tools::leads::lsp::with_lead_discovery(
                    lsp.lead_discovery(&paths),
                    lsp.lead_cache.clone(),
                    || {
                        dispatch::execute_local(
                            tool,
                            &query,
                            &paths,
                            &security,
                            &context,
                            &regex,
                            &views,
                            &rewrite,
                            &topology,
                            Some(&selection),
                        )
                    },
                )
            })
            .await
            .map_err(|_| ExecutionError::WorkerFailed)?
        })?;
        // Start a language server in the background so a following
        // lspSearch finds a warm pooled client: for the file an offered
        // lspSearch call names, or (opt-in) the file a read or search names.
        let lead = (prewarm_mode != crate::config::LspPrewarm::Off)
            .then(|| prewarm::lead_file(&result.data))
            .flatten();
        if let Some(file) = lead
            .or_else(|| prewarm_query.and_then(|query| prewarm::anchor_file(&query, &result.data)))
        {
            prewarm::schedule(
                &self.handle,
                &self.lsp_pool,
                &self.paths,
                &self.lsp_execution_config,
                &file,
            );
        }
        Ok(result)
    }
}

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
    pub(super) github_access: github::ResponseAccess,
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
    /// The call set `responseLength`: rows fill their share of it, since no
    /// read share fits them into the automatic page.
    pub explicit_window: bool,
}

fn retained_access_error() -> crate::tools::judgment::ClassificationError {
    crate::tools::judgment::ClassificationError::new(
        "classificationContextUnavailable",
        "The saved source access identity changed or could not be verified. No saved evidence was returned.",
        "Check source access, then start a fresh request explicitly.",
    )
}

impl DomainDispatcher {
    pub(crate) fn retained_github_identity(
        &self,
        context: &ExecutionContext,
    ) -> Result<Option<String>, crate::tools::judgment::ClassificationError> {
        let observed = self
            .github_access
            .identity()
            .map_err(|()| retained_access_error())?;
        self.validate_retained_github_identity(observed.as_deref(), context)?;
        Ok(observed)
    }

    pub(crate) fn validate_retained_github_identity(
        &self,
        expected: Option<&str>,
        context: &ExecutionContext,
    ) -> Result<(), crate::tools::judgment::ClassificationError> {
        let check = || {
            context.check().map_err(|error| {
                crate::tools::judgment::ClassificationError::new(
                    error.code(),
                    error.to_string(),
                    "Retry the request explicitly.",
                )
            })
        };
        check()?;
        let Some(expected) = expected else {
            return Ok(());
        };
        let identity = self.github_response_identity(context);
        check()?;
        if identity.as_ref().is_ok_and(|identity| identity == expected) {
            Ok(())
        } else {
            Err(retained_access_error())
        }
    }

    pub(super) fn github_response_identity(
        &self,
        context: &ExecutionContext,
    ) -> Result<String, ProviderError> {
        self.github_services
            .get_or_init(|| {
                github::GitHubServices::new(
                    self.config.clone(),
                    &self.limits,
                    self.home.clone(),
                    self.github_cache.clone(),
                )
            })
            .as_ref()
            .map_err(Clone::clone)?
            .response_identity(context, &self.handle)
    }

    pub(crate) fn text_capture_limit() -> usize {
        crate::tools::local_fetch::MAX_SOURCE_BYTES as usize
    }

    pub(crate) fn capture_local_text(
        &self,
        query: &Value,
        context: &ExecutionContext,
    ) -> Result<(String, PathBuf, String), crate::tools::judgment::ClassificationError> {
        let parsed = serde_json::from_value(query.clone()).map_err(|_| {
            crate::tools::judgment::ClassificationError::new(
                "invalidClassificationContext",
                "The local resource query could not be decoded.",
                "Inspect the localFetch schema.",
            )
        })?;
        let captured =
            crate::tools::local_fetch::capture_text(&parsed, self.paths.as_ref(), context);
        context.check().map_err(|error| {
            crate::tools::judgment::ClassificationError::new(
                error.code(),
                error.to_string(),
                "Retry the request explicitly.",
            )
        })?;
        let captured = captured.map_err(|result| crate::tools::judgment::ClassificationError {
            code: result
                .error_code
                .unwrap_or_else(|| "classificationContextUnavailable".into()),
            message: result
                .error
                .unwrap_or_else(|| "The local source could not be captured.".into()),
            hints: result.hints,
            ..Default::default()
        })?;
        Ok((captured.text, captured.canonical, captured.snapshot))
    }

    /// Acquire source bytes through the same GitHub credential, commit
    /// resolution, byte cache and request budget as a file read.
    pub(crate) fn capture_github_content(
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
            .and_then(|services| {
                services.capture_content(
                    query,
                    context,
                    &self.handle,
                    max_bytes,
                    &self.github_access,
                )
            });
        acquired.map_err(|error| {
            let row = github::provider_error(error);
            crate::tools::judgment::ClassificationError {
                code: row.data["errorCode"]
                    .as_str()
                    .unwrap_or("classificationContextFailed")
                    .into(),
                message: row.data["error"]
                    .as_str()
                    .unwrap_or("The GitHub source could not be acquired.")
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
                github::QueryExecution {
                    context,
                    handle: &self.handle,
                    access: &self.github_access,
                },
                &self.security,
                &self.regex,
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
        let tags = services.map(|services| services.release_tags(context, &self.github_access));
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
        let window = local_page_chars(
            tool,
            self.explicit_window.then_some(context),
            self.limits.auto_page_chars,
        );
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
        let prewarm_query = (prewarm_mode == crate::config::LspPrewarm::All).then_some(query);
        let lsp = &self.lsp_execution_config;
        // The row already runs on a blocking or scoped worker thread inside
        // the runtime context ([`Self::execute`]): no further thread hop.
        // lspSearch leads offered by local tools probe the runtime's resolved
        // server settings, not the bare process env.
        let result = crate::tools::leads::lsp::with_lead_discovery(
            lsp.lead_discovery(&self.paths),
            lsp.lead_cache.clone(),
            || {
                dispatch::execute_local(
                    tool,
                    query,
                    &self.paths,
                    &self.security,
                    &context,
                    &self.regex,
                    &self.local_views,
                    &rewrite,
                    &topology,
                    Some(&selection),
                )
            },
        )?;
        // Start a language server in the background so a following
        // lspSearch finds a warm pooled client: for the file an offered
        // lspSearch call names, or (opt-in) the file a read or search names.
        let lead = (prewarm_mode != crate::config::LspPrewarm::Off)
            .then(|| prewarm::lead_file(&result.data))
            .flatten();
        if let Some(file) = lead
            .or_else(|| prewarm_query.and_then(|query| prewarm::anchor_file(query, &result.data)))
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

/// The characters one local row's own pages fill. Streamed listing and walk
/// pages are cut at the automatic response window, which every call of a
/// walk shares (an explicit `responseLength` is per call, so it never moves
/// a page cut). localFetch continues by offset: under an explicit window
/// (`explicit`, the row's context) its windows fill the row's share of that
/// page ([`ExecutionContext::row_page_chars`]) and page by its own
/// continuation, never re-cut by the response pager. Under the automatic
/// page the read share fits its rows instead.
fn local_page_chars(
    tool: ToolId,
    explicit: Option<&ExecutionContext>,
    auto_page_chars: usize,
) -> usize {
    match explicit {
        Some(context) if tool == ToolId::LocalFetch => context.row_page_chars(auto_page_chars),
        _ => auto_page_chars,
    }
}

#[cfg(test)]
mod page_chars_tests {
    use super::*;

    #[test]
    fn local_fetch_fills_the_rows_share_of_an_explicit_window_only() {
        let context = |response_window| ExecutionContext {
            cancellation: tokio_util::sync::CancellationToken::new(),
            deadline: std::time::Instant::now() + std::time::Duration::from_secs(5),
            walk_threads: None,
            response_window,
            github_credential: None,
        };
        let fetch = |window| local_page_chars(ToolId::LocalFetch, Some(&context(window)), 20_000);
        assert_eq!(fetch(Some(5_000)), 5_000);
        assert_eq!(fetch(Some(50_000)), 50_000);
        assert_eq!(fetch(None), 20_000);
        assert_eq!(local_page_chars(ToolId::LocalFetch, None, 20_000), 20_000);
        for tool in [ToolId::LocalSearch, ToolId::StructureSearch] {
            assert_eq!(
                local_page_chars(tool, Some(&context(Some(5_000))), 20_000),
                20_000
            );
        }
    }
}

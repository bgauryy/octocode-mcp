//! One lazy selection flow for tool requests and read-only auth inspection.
use super::super::login;
use super::{StoredCredentials, configured_credential_host, normalize_host};
use crate::config::ConfigOutput;
use octocode_github::{BudgetStop, RequestBudget};
use octocode_github::{CredentialSource, ProviderError, ProviderErrorKind, ResolvedCredential};
use secrecy::ExposeSecret;
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    sync::{Arc, Mutex, Once},
    time::{Duration, Instant, SystemTime},
};

/// How long "no credential" is remembered, so a login made in another
/// process is picked up without a restart.
const ANONYMOUS_MEMO: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AuthMode {
    Inspect,
    Request,
}

#[derive(Clone)]
pub struct AuthSelection {
    pub credential: ResolvedCredential,
    pub username: Option<String>,
}
impl AuthSelection {
    /// Preserve the CLI's existing public labels independently of internal sources.
    pub fn source_label(&self) -> &'static str {
        match self.credential.source {
            CredentialSource::Override | CredentialSource::Environment => "env",
            CredentialSource::Storage => "platform",
            CredentialSource::Home => "octocode-storage",
            CredentialSource::GhCli => "gh-cli",
        }
    }
    pub fn token(&self) -> &str {
        self.credential.expose_secret()
    }
}

/// A request credential remembered for one host.
struct Remembered {
    selection: Option<AuthSelection>,
    at: Instant,
    /// When a remembered stored credential must be refreshed; past it the
    /// entry is a miss, so the next request reloads and refreshes.
    refresh_due: Option<SystemTime>,
}

pub struct Authentication {
    config: Arc<ConfigOutput>,
    /// Request credentials resolve once per host per process: a `gh` spawn or
    /// a store read per query row is pure overhead.
    memo: Mutex<HashMap<String, Remembered>>,
    /// Host partitions of the tokens GitHub rejected in this process. A
    /// rejected stored or `gh` token is skipped, so the next request falls
    /// back as a fresh selection would instead of sending it again.
    rejected: Mutex<HashSet<octocode_github::Partition>>,
}
impl Authentication {
    pub fn new(config: Arc<ConfigOutput>) -> Self {
        Self {
            config,
            memo: Mutex::default(),
            rejected: Mutex::default(),
        }
    }
    /// GitHub rejected `credential` for `host` (HTTP 401): drop the
    /// remembered selection so the next request selects again, skipping it.
    pub fn reject(&self, host: &str, credential: Option<&ResolvedCredential>) {
        let host = normalize_host(host);
        if let Some(credential) = credential {
            self.rejected
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(octocode_github::Partition::new(
                    host.as_str(),
                    Some(credential.secret()),
                ));
        }
        self.memo
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&host);
    }
    fn is_rejected(&self, host: &str, token: &str) -> bool {
        let token = secrecy::SecretString::from(token);
        self.rejected
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(&octocode_github::Partition::new(host, Some(&token)))
    }
    fn remembered(&self, host: &str) -> Option<Option<AuthSelection>> {
        let memo = self
            .memo
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let entry = memo.get(host)?;
        let live = match entry.selection {
            Some(_) => entry.refresh_due.is_none_or(|due| SystemTime::now() < due),
            None => entry.at.elapsed() < ANONYMOUS_MEMO,
        };
        live.then(|| entry.selection.clone())
    }
    fn remember(&self, host: &str, resolved: &Resolved) {
        self.memo
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(
                host.to_owned(),
                Remembered {
                    selection: resolved.selection.clone(),
                    at: Instant::now(),
                    refresh_due: resolved.refresh_due,
                },
            );
    }
    pub async fn resolve(
        &self,
        host: &str,
        mode: AuthMode,
        budget: &RequestBudget,
    ) -> Result<Option<AuthSelection>, ProviderError> {
        self.resolve_with(
            host,
            mode,
            budget,
            &SystemBackend {
                config: &self.config,
            },
        )
        .await
    }
    async fn resolve_with(
        &self,
        host: &str,
        mode: AuthMode,
        budget: &RequestBudget,
        backend: &impl AuthBackend,
    ) -> Result<Option<AuthSelection>, ProviderError> {
        budget.check().map_err(resolution_stopped)?;
        let host = normalize_host(host);
        if let Some(token) = self.config.token.as_ref()
            && configured_credential_host(&self.config.resolved.github.api_url)
                .is_some_and(|configured| configured == host)
        {
            return Ok(Some(AuthSelection {
                credential: ResolvedCredential::new(token.token(), CredentialSource::Environment),
                username: None,
            }));
        }
        if mode == AuthMode::Request
            && let Some(selection) = self.remembered(&host)
        {
            return Ok(selection);
        }
        let resolved = self.resolve_stored(&host, mode, budget, backend).await?;
        if mode == AuthMode::Request {
            self.remember(&host, &resolved);
        }
        Ok(resolved.selection)
    }
    async fn resolve_stored(
        &self,
        host: &str,
        mode: AuthMode,
        budget: &RequestBudget,
        backend: &impl AuthBackend,
    ) -> Result<Resolved, ProviderError> {
        let host = host.to_owned();
        // Keychain calls are blocking OS operations. Await their worker to completion,
        // then check the budget before starting any further I/O. Expiry is
        // checked before rejection: GitHub rejecting an expired token is a
        // reason to refresh it, not to skip it.
        let stored = match backend.load(&host).await {
            Ok(Some((stored, _)))
                if mode == AuthMode::Request
                    && !login::is_token_expired(&stored)
                    && self.is_rejected(&host, &stored.token.token) =>
            {
                Ok(None)
            }
            stored => stored,
        };
        budget.check().map_err(resolution_stopped)?;
        let mut storage_error = None;
        match stored {
            Ok(Some((stored, source)))
                if mode == AuthMode::Inspect || !login::is_token_expired(&stored) =>
            {
                return Ok(Resolved::stored(stored, source));
            }
            Ok(Some((_, source))) => {
                let client_id = Some(login::client_id_for_host(
                    &host,
                    self.config
                        .env_value(crate::config::environment::OCTOCODE_GITHUB_CLIENT_ID),
                ))
                .filter(|id| !id.is_empty());
                let refreshed = match client_id {
                    Some(client_id) => {
                        bounded(budget, backend.refresh(&host, client_id, source)).await
                    }
                    None => Err(ProviderError::new(
                        ProviderErrorKind::Configuration,
                        format!(
                            "{} is required to refresh GitHub Enterprise credentials",
                            crate::config::environment::OCTOCODE_GITHUB_CLIENT_ID
                        ),
                    )),
                };
                match refreshed {
                    Ok(Some(stored)) => return Ok(Resolved::stored(stored, source)),
                    Ok(None) => {} // Deleted while waiting: never reuse the stale token.
                    Err(error) if is_budget_error(&error) => return Err(error),
                    Err(error) => storage_error = Some(error),
                }
            }
            Ok(None) => {}
            Err(error) => storage_error = Some(error),
        }
        budget.check().map_err(resolution_stopped)?;
        if let Some(token) = backend.gh(&host, budget).await?
            && !(mode == AuthMode::Request && self.is_rejected(&host, token.expose_secret()))
        {
            return Ok(Resolved::untimed(Some(AuthSelection {
                credential: ResolvedCredential::new(token, CredentialSource::GhCli),
                username: None,
            })));
        }
        match storage_error {
            // No token and no usable store (headless, CI, sandboxed home):
            // requests run anonymously instead of failing.
            Some(error)
                if mode == AuthMode::Request
                    && error.kind == ProviderErrorKind::CredentialStoreUnavailable =>
            {
                warn_anonymous(&host);
                Ok(Resolved::untimed(None))
            }
            Some(error) => Err(error),
            None => Ok(Resolved::untimed(None)),
        }
    }
}
/// Once per process on stderr (stdout carries results and JSON-RPC).
fn warn_anonymous(host: &str) {
    static WARNED: Once = Once::new();
    WARNED.call_once(|| {
        eprintln!(
            "[octocode] warning: no GitHub credential for {host} and the secure credential store is unavailable; GitHub tools run unauthenticated (60 requests/hour). Set GITHUB_TOKEN or run octocode auth login for a higher limit."
        );
    });
}
/// A selection and when it must be refreshed.
struct Resolved {
    selection: Option<AuthSelection>,
    refresh_due: Option<SystemTime>,
}
impl Resolved {
    fn untimed(selection: Option<AuthSelection>) -> Self {
        Self {
            selection,
            refresh_due: None,
        }
    }
    fn stored(stored: StoredCredentials, source: CredentialSource) -> Self {
        Self {
            refresh_due: login::refresh_due(&stored),
            selection: Some(AuthSelection {
                credential: ResolvedCredential::new(stored.token.token, source),
                username: (!stored.username.is_empty()).then_some(stored.username),
            }),
        }
    }
}

trait AuthBackend {
    async fn load(
        &self,
        host: &str,
    ) -> Result<Option<(StoredCredentials, CredentialSource)>, ProviderError>;
    async fn refresh(
        &self,
        host: &str,
        client_id: &str,
        source: CredentialSource,
    ) -> Result<Option<StoredCredentials>, ProviderError>;
    async fn gh(
        &self,
        host: &str,
        budget: &RequestBudget,
    ) -> Result<Option<secrecy::SecretString>, ProviderError>;
}
struct SystemBackend<'a> {
    config: &'a ConfigOutput,
}
impl AuthBackend for SystemBackend<'_> {
    async fn load(
        &self,
        host: &str,
    ) -> Result<Option<(StoredCredentials, CredentialSource)>, ProviderError> {
        let host = host.to_owned();
        let store = super::CredentialStore::new(&self.config.home);
        tokio::task::spawn_blocking(move || store.load(&host))
            .await
            .map_err(|_| {
                ProviderError::new(
                    ProviderErrorKind::CredentialStoreUnavailable,
                    "credential resolution worker failed",
                )
            })?
    }
    async fn refresh(
        &self,
        host: &str,
        client_id: &str,
        source: CredentialSource,
    ) -> Result<Option<StoredCredentials>, ProviderError> {
        login::refresh_stored_in_store(
            host,
            client_id,
            &super::CredentialStore::new(&self.config.home),
            source,
        )
        .await
    }
    async fn gh(
        &self,
        host: &str,
        budget: &RequestBudget,
    ) -> Result<Option<secrecy::SecretString>, ProviderError> {
        super::discovery::gh_token(host, self.config.effective_env(), budget).await
    }
}
/// A budget stop met while resolving a credential.
pub(super) fn resolution_stopped(stop: BudgetStop) -> ProviderError {
    match stop {
        BudgetStop::Cancelled => ProviderError::new(
            ProviderErrorKind::Cancelled,
            "GitHub credential resolution cancelled",
        ),
        BudgetStop::Deadline => ProviderError::new(
            ProviderErrorKind::Timeout,
            "GitHub credential resolution exceeded the request budget",
        ),
    }
}
fn is_budget_error(error: &ProviderError) -> bool {
    matches!(
        error.kind,
        ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
    )
}
/// `operation`'s result, unless `budget` stops it first.
pub(super) async fn bounded<T>(
    budget: &RequestBudget,
    operation: impl Future<Output = Result<T, ProviderError>>,
) -> Result<T, ProviderError> {
    budget.wait(operation).await.map_err(resolution_stopped)?
}

#[cfg(test)]
mod tests;

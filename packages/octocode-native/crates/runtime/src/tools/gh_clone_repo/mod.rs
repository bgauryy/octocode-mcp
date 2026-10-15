//! Durable, shallow GitHub checkout materialization through the system Git baseline.
pub(crate) mod cache;
mod git;
mod process;

use crate::policy::{PolicyError, PolicyErrorCode, path::PathPolicy};
use crate::tools::cancel::CancellationCheck;
use octocode_github::{
    ConditionalCache, GitHubEndpoint, GitHubProvider, ProviderError, ProviderErrorKind,
    ProviderErrorReason, RequestContext, ResolvedCredential,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub use process::{GitOutput, GitRunControl, GitRunRequest, GitRunner, SystemGit};

pub use crate::contracts::tool_types::{GhCloneRepoQuery, GhCloneRepoQueryPath};

/// The requested sparse checkout: repo-relative paths in request order,
/// duplicates removed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Sparse {
    paths: Vec<String>,
}

impl Sparse {
    fn of(query: &GhCloneRepoQuery) -> Option<Self> {
        let mut paths = Vec::<String>::new();
        match query.path.as_ref()? {
            GhCloneRepoQueryPath::String(path) => paths.push(path.to_string()),
            GhCloneRepoQueryPath::Array(values) => {
                for path in values {
                    if !paths.iter().any(|known| known == path.as_str()) {
                        paths.push(path.to_string());
                    }
                }
            }
        }
        Some(Self { paths })
    }

    pub(crate) fn paths(&self) -> &[String] {
        &self.paths
    }

    /// Cache identity: one path keys as itself (the layout before multi-path
    /// sparse, so existing entries stay valid); several key as their sorted,
    /// newline-joined set, so request order does not split the cache.
    pub(crate) fn key(&self) -> String {
        if let [path] = self.paths.as_slice() {
            return path.clone();
        }
        let mut sorted = self.paths.clone();
        sorted.sort();
        sorted.join("\n")
    }
}

/// Commits of history to fetch; 1 is a shallow checkout.
fn history_depth(query: &GhCloneRepoQuery) -> u64 {
    query.history_depth.map_or(1, std::num::NonZeroU64::get)
}

#[derive(Clone, Debug)]
pub struct CloneConfig {
    pub cache_home: PathBuf,
    pub persistent: bool,
    pub cache_ttl: Duration,
    pub max_cache_size_bytes: u64,
    pub max_clone_count: usize,
    pub lock_wait: Duration,
    /// The runtime's network timeout: git's network steps are sized from it.
    pub network_timeout: Duration,
}

impl CloneConfig {
    /// A persistent clone cache under `cache_home` with the runtime's
    /// constant clone limits and network timeout.
    pub fn persistent(cache_home: impl Into<PathBuf>) -> Self {
        let defaults = crate::runtime::RuntimeLimits::DEFAULT;
        Self {
            cache_home: cache_home.into(),
            persistent: true,
            cache_ttl: Duration::ZERO,
            max_cache_size_bytes: 0,
            max_clone_count: 0,
            lock_wait: Duration::from_secs(5 * 60),
            network_timeout: Duration::ZERO,
        }
        .with_limits(&defaults.clone)
        .with_network_timeout(defaults.network_timeout)
    }

    /// Apply the runtime's network timeout.
    #[must_use]
    pub fn with_network_timeout(mut self, timeout: Duration) -> Self {
        self.network_timeout = timeout;
        self
    }

    /// Apply the runtime's clone cache limits.
    #[must_use]
    pub fn with_limits(mut self, limits: &crate::runtime::CloneLimits) -> Self {
        self.cache_ttl = limits.ttl;
        self.max_cache_size_bytes = limits.max_bytes;
        self.max_clone_count = limits.max_clones;
        self
    }
}

pub struct CloneContext<'a> {
    pub config: &'a CloneConfig,
    pub endpoint: &'a GitHubEndpoint,
    pub credential: Option<&'a ResolvedCredential>,
    /// Parent/provider-resolved default branch. Required when query.ref_ is absent.
    pub resolved_default_branch: Option<&'a str>,
    pub cancellation: &'a dyn CancellationCheck,
    pub deadline: Instant,
    pub path_policy: &'a PathPolicy,
    pub git: &'a dyn GitRunner,
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_true(value: &bool) -> bool {
    *value
}

/// Where the checkout lives and what it holds. `verified` is stated only
/// when false; owner/repo are the caller's own input.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneLocation {
    pub kind: &'static str,
    pub local_path: String,
    pub cached: bool,
    pub commit_sha: String,
    #[serde(skip_serializing_if = "is_true")]
    pub verified: bool,
    pub resolved_ref: String,
    /// Sparse checkouts name every requested path.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_paths: Option<Vec<String>>,
    /// History depth when more than the shallow single commit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_depth: Option<u64>,
    /// When the checkout was cloned; a cache hit's commit may lag the branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloned_at: Option<String>,
    /// When the checkout stops being reused (`forceRefresh` re-clones now).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneResult {
    pub bytes: u64,
    pub location: CloneLocation,
    /// Continuations into the local tools on the checkout.
    pub next: serde_json::Value,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub hints: Vec<String>,
    /// Runnable recovery calls (`findRepository`, `viewRefs`) beside the hints.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<Box<serde_json::Value>>,
}

impl CloneError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            hints: Vec::new(),
            next: None,
        }
    }
}

/// The repository metadata lookup returned 404: name the repository instead
/// of the internal-sounding `clone.defaultBranchUnavailable` that cloning
/// without metadata would report.
pub fn repository_not_found(query: &GhCloneRepoQuery) -> CloneError {
    let (owner, repo) = (&query.owner, &query.repo);
    CloneError {
        // The message names the repository; the hint stays within the
        // response stage's guidance cap so it is never cut mid-sentence.
        hints: vec![crate::tools::gh_shared::REPOSITORY_ACCESS_HINT.into()],
        next: Some(Box::new(serde_json::json!({
            "findRepository": crate::tools::gh_shared::repository_search(repo.as_str())
        }))),
        ..CloneError::new("notFound", format!("Repository not found: {owner}/{repo}"))
    }
}

/// Why a ghCloneRepo row failed: the clone's own error, or a GitHub
/// credential the API rejected.
#[derive(Debug)]
pub enum CloneFailure {
    Clone(CloneError),
    Provider(ProviderError),
}

/// Run one ghCloneRepo row. A fresh clone runs on git alone, which
/// authenticates with the caller's credential; only after git failed does
/// one `commits/{ref}` call name a missing ref or repository. A cache hit
/// is served only after the same call passes with the caller's credential.
pub async fn run<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhCloneRepoQuery,
    request: Result<&RequestContext, ProviderError>,
    context: &CloneContext<'_>,
) -> Result<CloneResult, CloneFailure> {
    let request = request.map_err(CloneFailure::Provider)?;
    let git = match execute_clone(query, context) {
        Ok(hit) if hit.location.cached => {
            return authorize_hit(provider, query, request, hit).await;
        }
        Ok(result) => return Ok(result),
        Err(error) => error,
    };
    if git.code != GIT_FAILED {
        return Err(CloneFailure::Clone(git));
    }
    let reference = query.ref_.as_ref().map_or("HEAD", |value| value.as_str());
    let answer = provider
        .transport
        .commit_sha(&query.owner, &query.repo, reference, request)
        .await;
    Err(explain_git_failure(query, git, answer))
}

/// Serve a cache hit only to a caller whose own credential reads the
/// repository at the served ref. The cache is shared by every credential of
/// the runtime and its keys name none (a refreshed token must not re-clone),
/// so a checkout another caller's credential fetched is gated here. Any
/// failure refuses the hit, a rate limit or outage included: one caller's
/// spent quota never unlocks another caller's checkout.
async fn authorize_hit<C: ConditionalCache>(
    provider: &GitHubProvider<C>,
    query: &GhCloneRepoQuery,
    request: &RequestContext,
    hit: CloneResult,
) -> Result<CloneResult, CloneFailure> {
    let reference = hit.location.resolved_ref.as_str();
    match provider
        .transport
        .commit_sha(&query.owner, &query.repo, reference, request)
        .await
    {
        Ok(_) => Ok(hit),
        Err(api) => Err(api_refusal(query, reference, api).unwrap_or_else(CloneFailure::Provider)),
    }
}

const GIT_FAILED: &str = "gitFailed";

/// After git failed, the `commits/{ref}` answer explains why: a missing ref
/// or repository is not-found input, a credential the API rejects keeps its
/// provider error. When the ref resolves, or the API itself failed (rate
/// limit, outage, timeout), the answer says nothing about the request, so
/// the git error stands and an API failure is a hint.
pub(crate) fn explain_git_failure(
    query: &GhCloneRepoQuery,
    mut git: CloneError,
    answer: Result<String, ProviderError>,
) -> CloneFailure {
    let api = match answer {
        Ok(sha) => return CloneFailure::Clone(abbreviated_sha(query, &sha).unwrap_or(git)),
        Err(api) => api,
    };
    let reference = query.ref_.as_ref().map_or("HEAD", |value| value.as_str());
    match api_refusal(query, reference, api) {
        Ok(failure) => failure,
        Err(api) => {
            git.hints.push(format!(
                "The GitHub API ref check also failed: {}",
                api.message
            ));
            CloneFailure::Clone(git)
        }
    }
}

/// What a failed `commits/{reference}` answer says about the request: a
/// missing ref or repository is not-found input, a credential the API
/// rejects keeps its provider error. Any other failure (rate limit, outage,
/// timeout) says nothing about the request and is returned unclassified.
fn api_refusal(
    query: &GhCloneRepoQuery,
    reference: &str,
    api: ProviderError,
) -> Result<CloneFailure, ProviderError> {
    match (api.kind, api.reason) {
        (_, Some(ProviderErrorReason::RefNotFound)) => {
            Ok(CloneFailure::Clone(CloneError {
                hints: vec![
                    "Verify the branch, tag, or SHA (ghStructure lists a ref), or omit ref for the default branch.".into(),
                ],
                next: Some(Box::new(serde_json::json!({
                    "viewRefs": crate::tools::gh_shared::ref_recovery(&query.owner, &query.repo)
                }))),
                ..CloneError::new(
                    "notFound",
                    format!(
                        "Branch, tag, or SHA not found for {}/{}: \"{reference}\"",
                        query.owner, query.repo
                    ),
                )
            }))
        }
        (ProviderErrorKind::NotFound, _) => Ok(CloneFailure::Clone(repository_not_found(query))),
        (ProviderErrorKind::Authentication | ProviderErrorKind::Permission, _) => {
            Ok(CloneFailure::Provider(api))
        }
        _ => Err(api),
    }
}

/// A `ref` git cannot clone because it abbreviates the commit `sha` that
/// `commits/{ref}` resolved: invalid input naming the full SHA, with the
/// clone at it as the lead. `None` for any other ref.
fn abbreviated_sha(query: &GhCloneRepoQuery, sha: &str) -> Option<CloneError> {
    let reference = query.ref_.as_deref()?;
    let abbreviated = reference.len() < sha.len()
        && reference.bytes().all(|byte| byte.is_ascii_hexdigit())
        && sha
            .to_ascii_lowercase()
            .starts_with(&reference.to_ascii_lowercase());
    if !abbreviated {
        return None;
    }
    let mut retry = serde_json::to_value(query).ok()?;
    retry["ref"] = serde_json::json!(sha);
    Some(CloneError {
        next: Some(Box::new(serde_json::json!({
            "cloneFullSha": crate::tools::result::Continuation::new(crate::tools::id::ToolId::GhCloneRepo, retry)
                .confidence("exact")
                .build()
        }))),
        ..CloneError::new(
            "invalidInput",
            format!(
                "ref \"{reference}\" abbreviates commit {sha}; git checks out a branch, tag, or full commit SHA"
            ),
        )
    })
}

/// A path the policy denies, under the flat code the local tools share
/// ([`PolicyError::local_error_code`]), so it gets their recovery hints.
fn policy_denied(error: PolicyError) -> CloneError {
    CloneError::new(
        error.local_error_code("pathValidationFailed"),
        error.message,
    )
}

/// One clone request's resolved inputs: what its cache entries are named
/// by, checked out from, and recorded as.
struct Plan<'a> {
    query: &'a GhCloneRepoQuery,
    context: &'a CloneContext<'a>,
    repository_url: String,
    sparse: Option<Sparse>,
    sparse_key: Option<String>,
    depth: u64,
}

impl Plan<'_> {
    /// The cache entry of `branch`, once the path policy admits it.
    fn target(&self, branch: &str) -> Result<PathBuf, CloneError> {
        let clone_dir = cache::clone_dir(
            &self.context.config.cache_home,
            &self.query.owner,
            &self.query.repo,
            branch,
            self.sparse_key.as_deref(),
            self.depth,
            &self.repository_url,
        );
        self.context
            .path_policy
            .validate_output(&clone_dir)
            .map_err(policy_denied)?;
        Ok(clone_dir)
    }

    /// The identity a checkout of `branch` records and a hit must match.
    fn identity<'b>(&'b self, branch: &'b str) -> cache::Identity<'b> {
        cache::Identity {
            owner: &self.query.owner,
            repo: &self.query.repo,
            branch,
            sparse_key: self.sparse_key.as_deref(),
            depth: self.depth,
        }
    }

    fn force_refresh(&self) -> bool {
        self.query.force_refresh.unwrap_or(false)
    }

    /// The row of a checkout of `branch` at `clone_dir`: a served cache hit
    /// (`cached`); a fresh checkout clears the flag.
    fn result(&self, branch: &str, clone_dir: &Path, hit: CacheHit) -> CloneResult {
        let bytes = hit
            .size
            .unwrap_or_else(|| cache::checked_out_size(clone_dir));
        let (cloned_at, expires_at) = hit.age.map_or((None, None), |age| {
            (Some(age.cloned_at), Some(age.expires_at))
        });
        let paths = self.sparse.as_ref().map(Sparse::paths);
        CloneResult {
            bytes,
            next: explore_next(clone_dir, paths),
            location: CloneLocation {
                kind: if paths.is_some() { "tree" } else { "repo" },
                local_path: clone_dir.to_string_lossy().into_owned(),
                cached: true,
                commit_sha: hit.commit_sha,
                verified: hit.verified,
                resolved_ref: branch.to_owned(),
                requested_paths: paths.map(<[String]>::to_vec),
                history_depth: (self.depth > 1).then_some(self.depth),
                cloned_at,
                expires_at,
            },
        }
    }

    /// The branch whose cache entry is looked up before any network call:
    /// the requested ref, else the caller's default branch, else the alias a
    /// default-branch clone recorded. `run` checks the caller's access to it
    /// before serving the hit.
    fn known_branch(&self) -> Option<String> {
        let context = self.context;
        self.query
            .ref_
            .as_ref()
            .map(ToString::to_string)
            .or_else(|| context.resolved_default_branch.map(str::to_owned))
            .or_else(|| {
                (!self.force_refresh())
                    .then(|| {
                        cache::default_branch_alias(
                            &context.config.cache_home,
                            &self.query.owner,
                            &self.query.repo,
                            &self.repository_url,
                            context.config.cache_ttl,
                        )
                    })
                    .flatten()
            })
    }
}

fn execute_clone(
    query: &GhCloneRepoQuery,
    context: &CloneContext<'_>,
) -> Result<CloneResult, CloneError> {
    check_control(context)?;
    if !context.config.persistent {
        return Err(CloneError::new(
            "persistentStorageDisabled",
            "Clone requires persistent local storage. Set storage.mode=\"persistent\" or OCTOCODE_STORAGE_MODE=persistent to use ghCloneRepo.",
        ));
    }
    validate_query(query)?;
    let sparse = Sparse::of(query);
    let plan = Plan {
        query,
        context,
        repository_url: repository_url(context.endpoint, &query.owner, &query.repo)?,
        sparse_key: sparse.as_ref().map(Sparse::key),
        sparse,
        depth: history_depth(query),
    };
    authorize_home(context)?;
    if let Some(branch) = plan.known_branch().as_deref() {
        let clone_dir = plan.target(branch)?;
        let _lock = cache::CloneLock::acquire(&clone_dir, context)?;
        if !plan.force_refresh()
            && let Some(hit) = cache_hit(context, &clone_dir, &plan.identity(branch))?
        {
            return Ok(plan.result(branch, &clone_dir, hit));
        }
        if query.ref_.is_some() || context.resolved_default_branch.is_some() {
            return fresh_clone(&plan, Some(branch), Some(clone_dir.as_path()));
        }
    }
    // Unknown (or stale-aliased) default branch: let git resolve the remote
    // HEAD. One lock serializes concurrent default-branch clones; "HEAD" is
    // never a branch name, so it cannot collide with a branch cache entry.
    let pending = plan.target("HEAD")?;
    let _lock = cache::CloneLock::acquire(&pending, context)?;
    fresh_clone(&plan, None, None)
}

/// The clones root under the cache home passes the path policy, then exists.
/// The runtime allows only the checkout trees under the Octocode home, never
/// the home itself, so the clones root is what must be authorized.
fn authorize_home(context: &CloneContext<'_>) -> Result<(), CloneError> {
    let clones_root = cache::clones_root(&context.config.cache_home);
    // Existing roots and roots below an allowed workspace must pass the
    // ordinary policy check. The one exception is an explicitly configured
    // root that does not exist yet and holds the clones root: its parent lies
    // outside that root until creation. Do not create a cache directory for
    // any other denied path.
    match context.path_policy.validate_output(&clones_root) {
        Ok(_) => {}
        Err(error)
            if error.code == PolicyErrorCode::OutsideAllowedRoots
                && context
                    .path_policy
                    .allowed_roots()
                    .iter()
                    .any(|root| !root.exists() && clones_root.starts_with(root)) => {}
        Err(error) => return Err(policy_denied(error)),
    }
    // Create the clones root before validating a clone target below it:
    // otherwise a fresh root has only an existing parent outside the allowed
    // roots to canonicalize.
    std::fs::create_dir_all(&clones_root).map_err(|error| {
        CloneError::new(
            "cacheUnavailable",
            format!("Could not initialize the configured clone cache home: {error}"),
        )
    })?;
    Ok(())
}

/// A served cache hit: commit and age of a clean checkout that still matches
/// the requested identity.
struct CacheHit {
    commit_sha: String,
    verified: bool,
    age: Option<cache::CacheAge>,
    /// Checked-out bytes recorded at publication (older entries walk).
    size: Option<u64>,
}

fn cache_hit(
    context: &CloneContext<'_>,
    clone_dir: &Path,
    identity: &cache::Identity<'_>,
) -> Result<Option<CacheHit>, CloneError> {
    let Some(meta) = cache::valid_clone(clone_dir, context.config.cache_ttl) else {
        return Ok(None);
    };
    if meta.source != "clone" || !meta.matches(identity) {
        return Ok(None);
    }
    let Ok(commit_sha) = git::read_head(context, clone_dir) else {
        return Ok(None);
    };
    if octocode_github::is_full_sha(identity.branch)
        && commit_sha != identity.branch.to_ascii_lowercase()
    {
        return Ok(None);
    }
    // A modified cache no longer holds the fetched revision. Do not replace
    // the caller's bytes or report them as a verified cache hit.
    if !git::is_clean(context, clone_dir)? {
        return Err(dirty_checkout(clone_dir));
    }
    context
        .path_policy
        .validate(clone_dir)
        .map_err(policy_denied)?;
    Ok(Some(CacheHit {
        commit_sha,
        verified: meta.verified,
        age: cache::CacheAge::of(&meta, context.config.cache_ttl),
        size: meta.checkout_bytes,
    }))
}

/// What publishing a checked-out stage left at its cache entry.
enum Published {
    /// The stage replaced the entry; its recorded metadata.
    Fresh(cache::CacheMeta),
    /// The entry already held a valid checkout; the stage is discarded.
    Cached(CacheHit),
}

/// Check out into a stage, verify it, and publish it. `branch` is `None` for
/// a default-branch clone: git resolves the remote HEAD and the branch it
/// checked out names the cache entry (and the default-branch alias).
/// `locked_dir` is the entry the caller already holds the lock of.
fn fresh_clone(
    plan: &Plan<'_>,
    branch: Option<&str>,
    locked_dir: Option<&Path>,
) -> Result<CloneResult, CloneError> {
    let context = plan.context;
    // Only a fresh clone probes git: a cache hit's failing `rev-parse`
    // already falls through to here.
    context.git.assert_available(&control(context))?;
    cache::cleanup_stale_artifacts(&context.config.cache_home);
    cache::evict(context, None);
    let stage_key = match locked_dir {
        Some(dir) => dir.to_path_buf(),
        None => plan.target("HEAD")?,
    };
    let stage = cache::stage_dir(&context.config.cache_home, &stage_key)?;
    let (resolved, commit_sha) =
        checkout_stage(plan, branch, &stage).inspect_err(|_| discard_stage(context, &stage))?;
    let (clone_dir, meta) =
        match publish_stage(plan, &stage, branch, &resolved, &commit_sha, locked_dir) {
            Ok((clone_dir, Published::Fresh(meta))) => (clone_dir, meta),
            Ok((clone_dir, Published::Cached(hit))) => {
                discard_stage(context, &stage);
                return Ok(plan.result(&resolved, &clone_dir, hit));
            }
            Err(error) => {
                discard_stage(context, &stage);
                return Err(error);
            }
        };
    context
        .path_policy
        .validate(&clone_dir)
        .map_err(policy_denied)?;
    let mut result = plan.result(
        &resolved,
        &clone_dir,
        CacheHit {
            commit_sha,
            verified: true,
            age: cache::CacheAge::of(&meta, context.config.cache_ttl),
            size: meta.checkout_bytes,
        },
    );
    result.location.cached = false;
    cache::evict(context, Some(&clone_dir));
    Ok(result)
}

/// Publish a verified stage as the cache entry of `resolved`, under that
/// entry's lock. The entry may already hold a valid checkout (an
/// explicit-ref clone of the same branch): it is kept and the stage is not
/// published. A default-branch clone records which branch the default
/// resolved to.
fn publish_stage(
    plan: &Plan<'_>,
    stage: &Path,
    branch: Option<&str>,
    resolved: &str,
    commit_sha: &str,
    locked_dir: Option<&Path>,
) -> Result<(PathBuf, Published), CloneError> {
    let context = plan.context;
    let write_alias = || {
        if branch.is_none() {
            cache::write_default_branch_alias(
                &context.config.cache_home,
                &plan.query.owner,
                &plan.query.repo,
                &plan.repository_url,
                resolved,
            );
        }
    };
    let clone_dir = match locked_dir {
        Some(dir) => dir.to_path_buf(),
        None => plan.target(resolved)?,
    };
    // A default-branch clone learns its entry only now; take that entry's
    // lock before replacing it.
    let _lock = match locked_dir {
        Some(_) => None,
        None => Some(cache::CloneLock::acquire(&clone_dir, context)?),
    };
    if locked_dir.is_none()
        && !plan.force_refresh()
        && let Some(hit) = cache_hit(context, &clone_dir, &plan.identity(resolved))?
    {
        write_alias();
        return Ok((clone_dir, Published::Cached(hit)));
    }
    let meta = write_stage_meta(plan, resolved, commit_sha, stage)?;
    // The target lock also covers this final check. forceRefresh bypasses
    // cache_hit, and user writes may arrive while the stage is fetched.
    if clone_dir.exists() && !git::checkout_status(context, &clone_dir)?.safe_to_replace {
        return Err(dirty_checkout(&clone_dir));
    }
    cache::promote(&context.config.cache_home, stage, &clone_dir)?;
    write_alias();
    Ok((clone_dir, Published::Fresh(meta)))
}

/// Check out into `stage` and verify it: every sparse path exists, and a
/// requested commit is the checked-out HEAD. Returns the resolved branch
/// and commit.
fn checkout_stage(
    plan: &Plan<'_>,
    branch: Option<&str>,
    stage: &Path,
) -> Result<(String, String), CloneError> {
    let context = plan.context;
    let sparse_paths = plan.sparse.as_ref().map(Sparse::paths);
    git::checkout(
        context,
        &plan.repository_url,
        branch,
        sparse_paths,
        plan.depth,
        stage,
    )?;
    if let Some(paths) = sparse_paths {
        let missing = paths
            .iter()
            .filter(|path| !stage.join(path).exists())
            .map(String::as_str)
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(sparse_not_found(plan.query, branch, &missing));
        }
    }
    let resolved = match branch {
        Some(branch) => branch.to_owned(),
        None => git::current_branch(context, stage)?,
    };
    let commit_sha = git::read_head(context, stage)?;
    if octocode_github::is_full_sha(&resolved) && commit_sha != resolved.to_ascii_lowercase() {
        return Err(CloneError::new(
            "commitMismatch",
            format!("Checkout HEAD {commit_sha} does not match requested commit {resolved}."),
        ));
    }
    Ok((resolved, commit_sha))
}

/// Record the checkout's identity, commit and size in its stage. Repository
/// evidence is never overwritten by this bookkeeping.
fn write_stage_meta(
    plan: &Plan<'_>,
    resolved: &str,
    commit_sha: &str,
    stage: &Path,
) -> Result<cache::CacheMeta, CloneError> {
    let mut meta = cache::CacheMeta::new(
        &plan.identity(resolved),
        commit_sha,
        plan.context.config.cache_ttl,
    );
    // Repository evidence must never be overwritten by our bookkeeping.
    // This also rejects a directory or symlink at the reserved filename.
    match std::fs::symlink_metadata(stage.join(cache::META_FILE)) {
        Ok(_) => {
            return Err(cache::metadata_conflict(&meta));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(CloneError::new(
                "cacheUnavailable",
                format!("Could not inspect clone metadata destination: {error}"),
            ));
        }
    }
    // The size of a clean checkout cannot change: record it once.
    meta.checkout_bytes = Some(cache::checked_out_size(stage));
    cache::write_meta(stage, &meta)?;
    Ok(meta)
}

fn dirty_checkout(path: &Path) -> CloneError {
    CloneError {
        hints: vec![
            "Move your edits out of this managed checkout, restore it to clean, then retry; forceRefresh never discards local files.".into(),
        ],
        ..CloneError::new(
            "checkoutDirty",
            format!("Clone checkout '{}' contains local files or changes; it was preserved without replacement.", path.display()),
        )
    }
}

fn discard_stage(context: &CloneContext<'_>, stage: &Path) {
    crate::cache::evictions::log_eviction(
        &context.config.cache_home,
        "failed-checkout-stage",
        stage,
        0,
    );
    cache::remove_dir(stage);
}

/// Requested sparse paths absent at the checked-out revision: a not-found
/// input, named per path, with the recovery as its one hint.
fn sparse_not_found(
    query: &GhCloneRepoQuery,
    branch: Option<&str>,
    missing: &[&str],
) -> CloneError {
    let at = branch.map_or_else(String::new, |branch| format!("@{branch}"));
    let paths = missing
        .iter()
        .map(|path| format!("\"{path}\""))
        .collect::<Vec<_>>()
        .join(", ");
    CloneError {
        hints: vec!["Verify the path with ghStructure, or omit path for a full clone.".into()],
        ..CloneError::new(
            "pathNotFound",
            format!(
                "Path does not exist: {paths} in {}/{}{at}; nothing was checked out for it.",
                query.owner, query.repo
            ),
        )
    }
}

/// `next.exploreClone`: list the checkout (the sparse subtree when one was
/// requested) with structureSearch, the local entry into localSearch,
/// astSearch, and lspSearch on it. A single checked-out file is read with
/// localFetch instead: structureSearch lists directories only.
fn explore_next(clone_dir: &Path, sparse_paths: Option<&[String]>) -> serde_json::Value {
    use crate::tools::id::ToolId;
    // One sparse path explores that path; several explore the checkout root.
    let root = match sparse_paths {
        Some([path]) => clone_dir.join(path),
        _ => clone_dir.to_path_buf(),
    };
    let mut query = serde_json::Map::new();
    query.insert(
        "path".into(),
        serde_json::Value::String(root.to_string_lossy().into_owned()),
    );
    let tool = if root.is_file() {
        ToolId::LocalFetch
    } else {
        ToolId::StructureSearch
    };
    serde_json::json!({
        "exploreClone": crate::tools::result::Continuation::new(tool, serde_json::Value::Object(query))
            .confidence("exact")
            .build()
    })
}

fn validate_query(query: &GhCloneRepoQuery) -> Result<(), CloneError> {
    for (name, value) in [
        ("owner", query.owner.as_str()),
        ("repo", query.repo.as_str()),
    ] {
        if value.trim().is_empty()
            || value.contains('/')
            || value.contains('\\')
            || value == "."
            || value == ".."
        {
            return Err(CloneError::new(
                "invalidInput",
                format!("{name} must be a non-empty GitHub path segment"),
            ));
        }
    }
    if query
        .ref_
        .as_deref()
        .is_some_and(|branch| branch.trim().is_empty())
    {
        return Err(CloneError::new("invalidInput", "ref must not be empty"));
    }
    let sparse = Sparse::of(query);
    if sparse
        .as_ref()
        .is_some_and(|sparse| sparse.paths.is_empty())
    {
        return Err(CloneError::new(
            "invalidInput",
            "path must name at least one path",
        ));
    }
    for path in sparse.as_ref().map_or(&[][..], Sparse::paths) {
        if !is_sparse_path(path) {
            return Err(CloneError::new(
                "invalidInput",
                "path must be a non-empty repo-relative path without traversal",
            ));
        }
    }
    Ok(())
}

/// A sparse checkout path that stays inside the repository: not blank, no
/// backslash, no root or drive prefix (`/x`, `C:x`), and no `.` or `..`
/// segment (an interior `a/./b` included, which `Path::components`
/// would silently normalize away). A trailing `/` names a directory.
fn is_sparse_path(path: &str) -> bool {
    let drive = path.as_bytes().get(1) == Some(&b':')
        && path.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    !path.trim().is_empty()
        && !path.contains('\\')
        && !path.starts_with('/')
        && !drive
        && path
            .strip_suffix('/')
            .unwrap_or(path)
            .split('/')
            .all(|segment| !matches!(segment, "." | ".."))
}

fn repository_url(
    endpoint: &GitHubEndpoint,
    owner: &str,
    repo: &str,
) -> Result<String, CloneError> {
    let base = endpoint
        .rest(&[])
        .map_err(|error| CloneError::new("configuration", error.message))?;
    let secure = base.scheme() == "https"
        || (base.scheme() == "http" && octocode_github::is_loopback(&base));
    if !secure
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
    {
        return Err(unsupported_endpoint());
    }
    let path = base.path().trim_end_matches('/');
    if base.host_str() == Some("api.github.com") && path.is_empty() {
        let mut url = url::Url::parse("https://github.com").map_err(|_| unsupported_endpoint())?;
        url.path_segments_mut()
            .map_err(|_| unsupported_endpoint())?
            .push(owner)
            .push(&format!("{repo}.git"));
        return Ok(url.into());
    }
    if !path.ends_with("/api/v3") {
        return Err(unsupported_endpoint());
    }
    let prefix = &path[..path.len() - "/api/v3".len()];
    let mut url = base.clone();
    url.set_path(prefix);
    url.path_segments_mut()
        .map_err(|_| unsupported_endpoint())?
        .pop_if_empty()
        .push(owner)
        .push(&format!("{repo}.git"));
    Ok(url.into())
}

fn unsupported_endpoint() -> CloneError {
    CloneError::new(
        "configuration",
        "ghCloneRepo requires an HTTPS GitHub API endpoint (plain http only on loopback): https://api.github.com or a GitHub Enterprise endpoint ending in /api/v3, without credentials or query parameters. Use ghGetFileContent for other API proxies.",
    )
}

fn control<'a>(context: &'a CloneContext<'a>) -> GitRunControl<'a> {
    GitRunControl {
        cancellation: context.cancellation,
        deadline: context.deadline,
        cache_home: &context.config.cache_home,
    }
}

fn check_control(context: &CloneContext<'_>) -> Result<(), CloneError> {
    if Instant::now() >= context.deadline {
        return Err(CloneError::new(
            "timeout",
            "Clone execution exceeded its deadline",
        ));
    }
    context
        .cancellation
        .check()
        .map_err(|_| CloneError::new("cancelled", "Clone execution was cancelled"))
}

fn hash(value: &str, characters: usize) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    hex::encode(digest.finalize())[..characters].to_owned()
}

/// This tool's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, _query: &serde_json::Value) -> &'static str {
        "Verify owner/repo/ref and path."
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod limit_tests {
    use super::*;

    /// A persistent cache runs under the runtime's constant limits; a test
    /// runtime's limits replace them field for field.
    #[test]
    fn persistent_defaults_are_the_runtime_constants_and_limits_apply() {
        let base = CloneConfig::persistent("/h");
        assert_eq!(base.cache_ttl, Duration::from_secs(24 * 60 * 60));
        assert_eq!(base.max_cache_size_bytes, 2 * 1024 * 1024 * 1024);
        assert_eq!(base.max_clone_count, 50);
        assert_eq!(base.network_timeout, Duration::from_secs(30));
        let config = CloneConfig::persistent("/h").with_limits(&crate::runtime::CloneLimits {
            ttl: Duration::from_secs(120),
            max_bytes: 1024 * 1024,
            max_clones: 7,
        });
        assert_eq!(config.cache_ttl, Duration::from_secs(120));
        assert_eq!(config.max_clone_count, 7);
        assert_eq!(config.max_cache_size_bytes, 1024 * 1024);
    }
}

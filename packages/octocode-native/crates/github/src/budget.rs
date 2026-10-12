//! Keyed GitHub request executor state (Octokit plugin-throttling parity).
//!
//! Every GitHub call — REST, GraphQL, OAuth login, and `git` clone
//! subprocesses — is admitted through a [`KeyState`] keyed by
//! `(api host, short token digest | "anon")`. Per key it owns the Octokit
//! throttling groups (global, search, graphql, write, auth, git), the
//! per-resource primary buckets learned from every response
//! (`x-ratelimit-resource/remaining/reset`), a shared secondary-limit
//! cooldown, and a circuit breaker fed only by secondary limits and 5xx.
//! Blocking facts are optionally mirrored to
//! `~/.octocode/tmp/ratelimit/<host>-<token>.json` so short-lived CLI
//! processes honor each other's limits.
mod circuit;
mod classify;
mod persist;

pub(crate) use circuit::CircuitCause;
pub(crate) use classify::{is_primary_rate_limit, is_secondary_rate_limit};

use super::{
    BudgetStop, ProviderError, ProviderErrorKind, RateLimit, credential_host, retry::header_u64,
};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    path::Path,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;
use url::Url;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GitHubResource {
    Core,
    Search,
    CodeSearch,
    Graphql,
}

impl GitHubResource {
    pub fn classify(url: &Url) -> Self {
        let path = url.path();
        if path.contains("/graphql") {
            Self::Graphql
        } else if path.contains("/search/code") {
            Self::CodeSearch
        } else if path.contains("/search/") {
            Self::Search
        } else {
            Self::Core
        }
    }

    /// GitHub's `x-ratelimit-resource` name for this request family.
    pub fn bucket(self) -> &'static str {
        match self {
            Self::Core => "core",
            Self::Search => "search",
            Self::CodeSearch => "code_search",
            Self::Graphql => "graphql",
        }
    }
}

/// Octokit throttling groups layered under the per-key global group.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Group {
    Search,
    CodeSearch,
    Graphql,
    Write,
    Auth,
}

impl Group {
    fn name(self) -> &'static str {
        match self {
            Self::Search => "search",
            Self::CodeSearch => "code_search",
            Self::Graphql => "graphql",
            Self::Write => "write",
            Self::Auth => "auth",
        }
    }

    /// The GitHub rate-limit bucket this group's requests draw from.
    fn bucket(self) -> &'static str {
        match self {
            Self::Search => GitHubResource::Search.bucket(),
            Self::CodeSearch => GitHubResource::CodeSearch.bucket(),
            Self::Graphql => GitHubResource::Graphql.bucket(),
            Self::Write | Self::Auth => GitHubResource::Core.bucket(),
        }
    }
}

/// Executor tuning. [`ExecutorConfig::octokit`] mirrors
/// `@octokit/plugin-throttling`; tests shrink the timings.
#[derive(Clone, Debug)]
pub struct ExecutorConfig {
    pub global_concurrency: usize,
    pub git_concurrency: usize,
    pub search_spacing: Duration,
    pub graphql_spacing: Duration,
    pub write_spacing: Duration,
    pub code_search_per_minute: usize,
    /// Added to a primary reset before retrying (Octokit waits reset + 1s).
    pub reset_grace: Duration,
    /// Secondary-limit wait when GitHub sends no `retry-after`.
    pub secondary_default: Duration,
    pub circuit_failures: u32,
    pub circuit_open: Duration,
}

impl ExecutorConfig {
    pub fn octokit() -> Self {
        Self {
            global_concurrency: 10,
            git_concurrency: 2,
            search_spacing: Duration::from_millis(2000),
            graphql_spacing: Duration::from_millis(1000),
            write_spacing: Duration::from_millis(1000),
            code_search_per_minute: 10,
            reset_grace: Duration::from_secs(1),
            secondary_default: Duration::from_secs(60),
            circuit_failures: 5,
            circuit_open: Duration::from_secs(30),
        }
    }

    /// No pacing — used by unit tests that do not exercise throttling.
    pub fn relaxed() -> Self {
        Self {
            global_concurrency: 32,
            git_concurrency: 8,
            search_spacing: Duration::ZERO,
            graphql_spacing: Duration::ZERO,
            write_spacing: Duration::ZERO,
            code_search_per_minute: usize::MAX,
            reset_grace: Duration::ZERO,
            ..Self::octokit()
        }
    }

    fn spacing(&self, group: Group) -> Duration {
        match group {
            Group::Search | Group::CodeSearch => self.search_spacing,
            Group::Graphql => self.graphql_spacing,
            Group::Write => self.write_spacing,
            Group::Auth => Duration::ZERO,
        }
    }
}

/// Limiter identity: the API host (`api.github.com` folds to `github.com`,
/// explicit ports kept) and a short SHA-256 digest of the token.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct LimiterKey {
    host: String,
    token: String,
}

impl LimiterKey {
    pub fn new(host: &str, token: Option<&str>) -> Self {
        let host = credential_host(&host.trim().to_ascii_lowercase()).to_owned();
        let token = match token.filter(|value| !value.is_empty()) {
            Some(token) => {
                let digest = Sha256::digest(token.as_bytes());
                hex::encode(&digest[..8])
            }
            None => "anon".to_owned(),
        };
        Self { host, token }
    }

    /// Key for any URL on the host (API, web origin, or git remote).
    pub fn for_url(url: &Url, token: Option<&str>) -> Self {
        let host = url.host_str().unwrap_or_default();
        match url.port() {
            Some(port) => Self::new(&format!("{host}:{port}"), token),
            None => Self::new(host, token),
        }
    }

    fn file_name(&self) -> String {
        let host: String = self
            .host
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        format!("{host}-{}.json", self.token)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub(crate) struct Bucket {
    pub remaining: u64,
    /// Epoch seconds.
    pub reset: u64,
}

/// Blocking facts for one key. Circuit fields are process-local.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyFacts {
    #[serde(default)]
    buckets: BTreeMap<String, Bucket>,
    #[serde(default)]
    cooldown_until_ms: u64,
    #[serde(default)]
    last_start_ms: BTreeMap<String, u64>,
    #[serde(default)]
    code_search_ms: VecDeque<u64>,
    #[serde(skip)]
    circuit_failures: u32,
    #[serde(skip)]
    circuit_open_until_ms: u64,
    /// What the last counted failure was: the open circuit reports it.
    #[serde(skip)]
    circuit_cause: Option<CircuitCause>,
}

impl KeyFacts {
    /// Undo one reservation made by `admit` (its start and window slot) when
    /// the request was never sent.
    fn release(&mut self, group: &str, start: u64, previous: Option<u64>, window: bool) {
        if self.last_start_ms.get(group) == Some(&start) {
            match previous {
                Some(previous) => self.last_start_ms.insert(group.to_owned(), previous),
                None => self.last_start_ms.remove(group),
            };
        }
        if window
            && let Some(index) = self
                .code_search_ms
                .iter()
                .rposition(|stamp| *stamp == start)
        {
            self.code_search_ms.remove(index);
        }
    }
}

/// What currently blocks a request on a key.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Block {
    pub until_ms: u64,
    pub resource: String,
    pub remaining: Option<u64>,
    pub reset: Option<u64>,
    /// Set when the block is an open circuit: the failure that opened it.
    pub circuit: Option<CircuitCause>,
}

impl Block {
    pub fn wait(&self, now_ms: u64) -> Duration {
        Duration::from_millis(self.until_ms.saturating_sub(now_ms))
    }

    pub fn error(&self, now_ms: u64) -> ProviderError {
        let retry_after_seconds = Some(ceil_secs(self.wait(now_ms)));
        if let Some(cause) = self
            .circuit
            .filter(|cause| *cause != CircuitCause::Secondary)
        {
            // An outage is not a rate limit: name the real cause, retryable
            // once the circuit closes.
            let (kind, message) = match cause {
                CircuitCause::Transport => (
                    ProviderErrorKind::Transport,
                    "GitHub is unavailable after repeated connection failures; request not sent until the circuit closes.",
                ),
                _ => (
                    ProviderErrorKind::Server,
                    "GitHub is unavailable after repeated server errors; request not sent until the circuit closes.",
                ),
            };
            let mut error = ProviderError::new(kind, message);
            error.rate_limit = Some(Box::new(RateLimit {
                remaining: None,
                reset_epoch_seconds: None,
                retry_after_seconds,
                resource: None,
            }));
            return error;
        }
        let message = if self.circuit.is_some() {
            "GitHub secondary rate limits repeated; requests are paused, wait and retry."
        } else if self.reset.is_some() {
            "GitHub API rate limit exhausted; request not sent until the limit resets."
        } else {
            "GitHub secondary rate limit cooldown is active; request not sent."
        };
        rate_limited_error(
            message,
            RateLimit {
                remaining: self.remaining,
                reset_epoch_seconds: self.reset,
                retry_after_seconds,
                resource: Some(self.resource.as_str().into()),
            },
        )
    }
}

/// One group's slot rules for an admission: the spacing after its last start,
/// the code-search window, and the one cap and deadline bounding the wait.
struct SlotPlan {
    group: Group,
    spacing: u64,
    window: bool,
    per_minute: usize,
    cap: Duration,
    deadline: Instant,
}

/// When a slot could start, measured from `now`.
#[derive(Clone, Copy)]
struct PlannedStart {
    start: u64,
    now: u64,
}

/// What a refusal is about: one admission, or a row of `n` code searches
/// checked before its first is sent.
#[derive(Clone, Copy)]
enum Subject {
    Request,
    Batch(usize),
}

impl SlotPlan {
    /// `window`: this admission takes a code-search window slot.
    fn new(
        group: Group,
        config: &ExecutorConfig,
        window: bool,
        cap: Duration,
        deadline: Instant,
    ) -> Self {
        Self {
            group,
            spacing: config.spacing(group).as_millis() as u64,
            window: window && config.code_search_per_minute != usize::MAX,
            per_minute: config.code_search_per_minute,
            cap,
            deadline,
        }
    }

    /// Whether admissions under this plan wait for a slot at all.
    fn takes_slot(&self) -> bool {
        self.spacing > 0 || self.window
    }

    /// The earliest start these facts allow for a slot that does (or does
    /// not) take a window slot, without taking it: the peek and the
    /// reservation decide by the same rule.
    fn earliest(&self, facts: &KeyFacts, now: u64, window: bool) -> PlannedStart {
        let mut start = now;
        if let Some(last) = facts.last_start_ms.get(self.group.name()) {
            start = start.max(last.saturating_add(self.spacing));
        }
        if window {
            let live = || {
                facts
                    .code_search_ms
                    .iter()
                    .filter(|stamp| stamp.saturating_add(60_000) > now)
            };
            if live().count() >= self.per_minute
                && let Some(oldest) = live().next()
            {
                start = start.max(oldest.saturating_add(60_000));
            }
        }
        PlannedStart { start, now }
    }

    /// This plan's earliest start.
    fn start(&self, facts: &KeyFacts, now: u64) -> PlannedStart {
        self.earliest(facts, now, self.window)
    }

    /// This plan's start once the slots `ahead` of it are taken, simulated on
    /// a copy of the facts. The order of plain and windowed slots ahead is
    /// not known; plain slots are placed first, so the peek never refuses a
    /// start some queue order could reach (the reservation stays exact).
    fn start_after(&self, facts: &KeyFacts, now: u64, ahead: Ahead) -> PlannedStart {
        if ahead.plain + ahead.windowed == 0 {
            return self.start(facts, now);
        }
        let mut facts = facts.clone();
        let slots = std::iter::repeat_n(false, ahead.plain)
            .chain(std::iter::repeat_n(true, ahead.windowed));
        for window in slots {
            let taken = self.earliest(&facts, now, window).start;
            facts
                .last_start_ms
                .insert(self.group.name().to_owned(), taken);
            if window {
                facts.code_search_ms.push_back(taken);
            }
        }
        self.start(&facts, now)
    }

    /// The refusal for a start past the cap or the deadline, labelled by its
    /// cause and subject. It carries only what the client decided, the wait:
    /// GitHub reported no exhausted bucket, so no `remaining` or reset is
    /// claimed.
    fn refusal(&self, planned: PlannedStart, subject: Subject) -> Option<ProviderError> {
        let wait = Duration::from_millis(planned.start.saturating_sub(planned.now));
        if wait <= self.cap.max(Duration::from_millis(self.spacing))
            && Instant::now() + wait < self.deadline
        {
            return None;
        }
        let group = self.group.name();
        let message = match (self.window, subject) {
            (true, Subject::Request) => {
                "GitHub code search window is full; request not sent.".to_owned()
            }
            (true, Subject::Batch(searches)) => format!(
                "GitHub code search window cannot fit this row's {searches} searches; requests not sent."
            ),
            (false, Subject::Request) => {
                format!("GitHub {group} request spacing exceeds the deadline; request not sent.")
            }
            (false, Subject::Batch(searches)) => format!(
                "GitHub {group} request spacing cannot fit this row's {searches} searches before the deadline; requests not sent."
            ),
        };
        Some(rate_limited_error(
            &message,
            RateLimit {
                remaining: None,
                reset_epoch_seconds: None,
                retry_after_seconds: Some(ceil_secs(wait)),
                resource: Some(self.group.bucket().into()),
            },
        ))
    }
}

pub(crate) fn rate_limited_error(message: &str, rate_limit: RateLimit) -> ProviderError {
    let mut error = ProviderError::new(ProviderErrorKind::RateLimited, message);
    error.rate_limit = Some(Box::new(rate_limit));
    error.retryable = true;
    error
}

/// Permits for one in-flight request; released on drop (before any backoff).
pub(crate) struct Admission {
    _permits: Vec<OwnedSemaphorePermit>,
}

/// Keeps the host's OAuth throttling permits until the request finishes.
#[must_use]
pub struct AuthAdmission {
    _admission: Admission,
}

/// One group's admission lane: the permit that serializes its requests, and
/// the admissions that passed the peek but have not reserved a slot yet.
struct Lane {
    permit: Arc<Semaphore>,
    queued: Arc<QueueCounts>,
}

/// Admissions queued in a [`Lane`], split by whether they take a code-search
/// window slot. Entering and reserving both happen under the key's facts
/// lock, so a peek sees each queued admission either here or as a slot in the
/// facts, never both.
#[derive(Default)]
struct QueueCounts {
    plain: AtomicUsize,
    windowed: AtomicUsize,
}

impl QueueCounts {
    fn counter(&self, window: bool) -> &AtomicUsize {
        if window { &self.windowed } else { &self.plain }
    }

    fn ahead(&self) -> Ahead {
        Ahead {
            plain: self.plain.load(Ordering::SeqCst),
            windowed: self.windowed.load(Ordering::SeqCst),
        }
    }
}

/// Slots that admissions queued ahead will take first.
#[derive(Clone, Copy, Default)]
struct Ahead {
    plain: usize,
    windowed: usize,
}

impl Ahead {
    fn add(&mut self, window: bool, slots: usize) {
        if window {
            self.windowed += slots;
        } else {
            self.plain += slots;
        }
    }
}

/// One admission queued in a [`Lane`]; it leaves the count when dropped
/// (reserved, refused or cancelled).
struct Queued {
    counts: Arc<QueueCounts>,
    window: bool,
}

impl Queued {
    /// Join the lane's queue, returning the slots queued ahead. Call with the
    /// key's facts locked.
    fn enter(lane: &Lane, window: bool) -> (Self, Ahead) {
        let ahead = lane.queued.ahead();
        lane.queued.counter(window).fetch_add(1, Ordering::SeqCst);
        let queued = Self {
            counts: Arc::clone(&lane.queued),
            window,
        };
        (queued, ahead)
    }
}

impl Drop for Queued {
    fn drop(&mut self) {
        self.counts
            .counter(self.window)
            .fetch_sub(1, Ordering::SeqCst);
    }
}

pub(crate) struct KeyState {
    key: LimiterKey,
    global: Arc<Semaphore>,
    groups: HashMap<&'static str, Lane>,
    git: Arc<Semaphore>,
    facts: Mutex<KeyFacts>,
    persist: Mutex<Option<persist::Persist>>,
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn ceil_secs(duration: Duration) -> u64 {
    duration.as_millis().div_ceil(1000) as u64
}

/// Cancellation- and deadline-aware sleep. Fails fast (timeout) instead of
/// sleeping past the deadline.
pub(crate) async fn pause(
    delay: Duration,
    deadline: Instant,
    cancellation: &CancellationToken,
) -> Result<(), ProviderError> {
    if cancellation.is_cancelled() {
        return Err(BudgetStop::Cancelled.into());
    }
    if Instant::now() + delay >= deadline {
        return Err(BudgetStop::Deadline.into());
    }
    if delay.is_zero() {
        return Ok(());
    }
    tokio::select! {
        _ = cancellation.cancelled() => Err(BudgetStop::Cancelled.into()),
        _ = tokio::time::sleep(delay) => Ok(()),
    }
}

async fn acquire(
    semaphore: &Arc<Semaphore>,
    deadline: Instant,
    cancellation: &CancellationToken,
) -> Result<OwnedSemaphorePermit, ProviderError> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    tokio::select! {
        _ = cancellation.cancelled() => Err(BudgetStop::Cancelled.into()),
        _ = tokio::time::sleep(remaining) => Err(BudgetStop::Deadline.into()),
        permit = semaphore.clone().acquire_owned() => permit.map_err(|_| {
            ProviderError::new(ProviderErrorKind::Cancelled, "GitHub concurrency limiter closed")
        }),
    }
}

impl KeyState {
    fn new(key: LimiterKey, config: &ExecutorConfig) -> Self {
        // Code search gets its own lane: GitHub meters it in a separate
        // bucket, and a code-search window wait must not stall repo/issue
        // search behind it.
        let groups = [
            Group::Search,
            Group::CodeSearch,
            Group::Graphql,
            Group::Write,
            Group::Auth,
        ]
        .into_iter()
        .map(|group| {
            let lane = Lane {
                permit: Arc::new(Semaphore::new(1)),
                queued: Arc::default(),
            };
            (group.name(), lane)
        })
        .collect();
        Self {
            key,
            global: Arc::new(Semaphore::new(config.global_concurrency.max(1))),
            groups,
            git: Arc::new(Semaphore::new(config.git_concurrency.max(1))),
            facts: Mutex::new(KeyFacts::default()),
            persist: Mutex::new(None),
        }
    }

    fn facts(&self) -> std::sync::MutexGuard<'_, KeyFacts> {
        self.facts
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Current blocker for `resource`, if any: open circuit, secondary
    /// cooldown, or an exhausted primary bucket (until reset + grace).
    pub fn blocked(&self, resource: &str, config: &ExecutorConfig) -> Option<Block> {
        let now = now_ms();
        let mut facts = self.facts();
        if facts.circuit_open_until_ms > now {
            return Some(Block {
                until_ms: facts.circuit_open_until_ms,
                resource: resource.to_owned(),
                remaining: None,
                reset: None,
                circuit: Some(facts.circuit_cause.unwrap_or(CircuitCause::Server)),
            });
        }
        if facts.circuit_open_until_ms != 0 {
            facts.circuit_open_until_ms = 0;
            facts.circuit_failures = 0;
        }
        let mut block: Option<Block> = None;
        if facts.cooldown_until_ms > now {
            block = Some(Block {
                until_ms: facts.cooldown_until_ms,
                resource: resource.to_owned(),
                remaining: None,
                reset: None,
                circuit: None,
            });
        }
        if let Some(bucket) = facts.buckets.get(resource)
            && bucket.remaining == 0
        {
            let until = bucket
                .reset
                .saturating_mul(1000)
                .saturating_add(config.reset_grace.as_millis() as u64);
            if until > now && block.as_ref().is_none_or(|b| b.until_ms < until) {
                block = Some(Block {
                    until_ms: until,
                    resource: resource.to_owned(),
                    remaining: Some(0),
                    reset: Some(bucket.reset),
                    circuit: None,
                });
            }
        }
        block
    }

    /// Pre-send gate: wait out a short block (≤ `cap` and inside the
    /// deadline) or fail fast without sending.
    pub async fn wait_unblocked(
        &self,
        resource: &str,
        config: &ExecutorConfig,
        cap: Duration,
        deadline: Instant,
        cancellation: &CancellationToken,
    ) -> Result<(), ProviderError> {
        self.refresh_from_disk();
        for _ in 0..4 {
            let Some(block) = self.blocked(resource, config) else {
                return Ok(());
            };
            let now = now_ms();
            let wait = block.wait(now);
            if block.circuit.is_some() || wait > cap || Instant::now() + wait >= deadline {
                return Err(block.error(now));
            }
            pause(wait, deadline, cancellation).await?;
        }
        match self.blocked(resource, config) {
            None => Ok(()),
            Some(block) => Err(block.error(now_ms())),
        }
    }

    /// Admit one attempt: group permit, group spacing (minTime), optional
    /// code-search window slot (counted once per logical request), then the
    /// per-key global permit. A limit that landed while this attempt queued
    /// is re-checked before it is sent: the reservation is handed back and
    /// the attempt waits the block out, or fails fast like the gate before it.
    pub async fn admit(
        &self,
        group: Option<Group>,
        config: &ExecutorConfig,
        count_code_search: bool,
        cap: Duration,
        deadline: Instant,
        cancellation: &CancellationToken,
    ) -> Result<Admission, ProviderError> {
        let resource = match group {
            Some(Group::Auth) => "auth",
            Some(group) => group.bucket(),
            None => "core",
        };
        for _ in 0..4 {
            if let Some(admission) = self
                .try_admit(
                    group,
                    resource,
                    config,
                    count_code_search,
                    cap,
                    deadline,
                    cancellation,
                )
                .await?
            {
                return Ok(admission);
            }
            self.wait_unblocked(resource, config, cap, deadline, cancellation)
                .await?;
        }
        match self.blocked(resource, config) {
            None => Err(ProviderError::new(
                ProviderErrorKind::RateLimited,
                "GitHub request admission kept being blocked; request not sent.",
            )),
            Some(block) => Err(block.error(now_ms())),
        }
    }

    /// One admission pass; `None` when a block landed while it queued, after
    /// the reservation and permits were handed back.
    #[allow(clippy::too_many_arguments)]
    async fn try_admit(
        &self,
        group: Option<Group>,
        resource: &str,
        config: &ExecutorConfig,
        count_code_search: bool,
        cap: Duration,
        deadline: Instant,
        cancellation: &CancellationToken,
    ) -> Result<Option<Admission>, ProviderError> {
        let mut reservation = None;
        let mut permits = Vec::with_capacity(2);
        if let Some(group) = group {
            let plan = SlotPlan::new(group, config, count_code_search, cap, deadline);
            let window = plan.window;
            let persisted = matches!(group, Group::Search | Group::CodeSearch | Group::Graphql);
            let lane = self.groups.get(group.name());
            let mut queued = None;
            if plan.takes_slot() {
                // Peek before the group permit: a wait the current facts
                // already put past the cap is refused now, not after queueing
                // behind another request's permit. The admissions queued
                // ahead in this process take their slots first, so the peek
                // plans past them. Entering the queue and peeking share one
                // facts lock, and an admission leaves the queue under the
                // lock that records its slot, so each one is counted exactly
                // once. The reserve below stays authoritative: a peer process
                // can fill the window meanwhile.
                if persisted {
                    self.refresh_from_disk();
                }
                let facts = self.facts();
                let (entered, ahead) = lane.map(|lane| Queued::enter(lane, window)).unzip();
                queued = entered;
                let peeked = plan.start_after(&facts, now_ms(), ahead.unwrap_or_default());
                drop(facts);
                if let Some(refusal) = plan.refusal(peeked, Subject::Request) {
                    return Err(refusal);
                }
            }
            if let Some(lane) = lane {
                permits.push(acquire(&lane.permit, deadline, cancellation).await?);
            }
            if plan.takes_slot() {
                // Take the start slot (and window slot) from this key's
                // facts: the spacing after the group's last start, and the
                // window's oldest stamp when the window is full. One cap,
                // `cap`, bounds every wait, the code-search window's too.
                let reserve = |facts: &mut KeyFacts| {
                    drop(queued);
                    let now = now_ms();
                    if window {
                        while facts
                            .code_search_ms
                            .front()
                            .is_some_and(|stamp| stamp.saturating_add(60_000) <= now)
                        {
                            facts.code_search_ms.pop_front();
                        }
                    }
                    let planned = plan.start(facts, now);
                    if let Some(refusal) = plan.refusal(planned, Subject::Request) {
                        return Err(refusal);
                    }
                    let start = planned.start;
                    let previous = facts.last_start_ms.insert(group.name().to_owned(), start);
                    if window {
                        facts.code_search_ms.push_back(start);
                    }
                    Ok((start, previous))
                };
                // Mirrored groups reserve under the cross-process file lock,
                // against every process's slots: reserving from each
                // process's own view lets two processes take the same slot.
                let (start, previous) = if persisted {
                    self.reserve_shared(deadline, cancellation, reserve)
                        .await??
                } else {
                    reserve(&mut self.facts())?
                };
                reservation = Some((group, start, previous, window, persisted));
                if let Err(error) = pause(
                    Duration::from_millis(start.saturating_sub(now_ms())),
                    deadline,
                    cancellation,
                )
                .await
                {
                    // Nothing was sent: hand back the reserved start and window
                    // slot so they do not throttle later requests.
                    self.release_reservation(group, start, previous, window, persisted);
                    return Err(error);
                }
            }
        }
        let global = acquire(&self.global, deadline, cancellation).await;
        let global = match global {
            Ok(permit) => permit,
            Err(error) => {
                if let Some((group, start, previous, window, persisted)) = reservation {
                    self.release_reservation(group, start, previous, window, persisted);
                }
                return Err(error);
            }
        };
        // The sleeps above can span a response that set a cooldown or
        // exhausted the bucket: never send into a block learned meanwhile.
        self.refresh_from_disk();
        if self.blocked(resource, config).is_some() {
            if let Some((group, start, previous, window, persisted)) = reservation {
                self.release_reservation(group, start, previous, window, persisted);
            }
            return Ok(None);
        }
        permits.push(global);
        Ok(Some(Admission { _permits: permits }))
    }

    /// Hand back a reservation in memory and, when mirrored, on disk: the
    /// disk copy was written before the wait and a plain merge would restore it.
    fn release_reservation(
        &self,
        group: Group,
        start: u64,
        previous: Option<u64>,
        window: bool,
        persisted: bool,
    ) {
        self.facts().release(group.name(), start, previous, window);
        if persisted {
            self.persist_with(|view| view.release(group.name(), start, previous, window));
        }
    }

    /// Record the primary bucket carried by any response.
    pub fn observe(&self, headers: &HeaderMap, fallback_resource: &str) {
        let (Some(remaining), Some(reset)) = (
            header_u64(headers, "x-ratelimit-remaining"),
            header_u64(headers, "x-ratelimit-reset"),
        ) else {
            return;
        };
        let resource = headers
            .get("x-ratelimit-resource")
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback_resource)
            .to_owned();
        self.facts()
            .buckets
            .insert(resource, Bucket { remaining, reset });
        if remaining == 0 {
            self.persist();
        }
    }

    /// A row that needs `searches` sends (one per extension) is refused
    /// before the first one when the planner puts the last start past the
    /// cap or the deadline; a refusal midway would spend window slots on a
    /// page that is then discarded. The starts are simulated with the rule
    /// the admission uses, on a copy of the facts, so nothing is reserved.
    pub fn code_search_batch_refusal(
        &self,
        searches: usize,
        config: &ExecutorConfig,
        cap: Duration,
        deadline: Instant,
    ) -> Option<ProviderError> {
        if searches < 2 {
            return None;
        }
        self.refresh_from_disk();
        let plan = SlotPlan::new(Group::CodeSearch, config, true, cap, deadline);
        let facts = self.facts();
        let mut ahead = self
            .groups
            .get(Group::CodeSearch.name())
            .map(|lane| lane.queued.ahead())
            .unwrap_or_default();
        ahead.add(plan.window, searches - 1);
        let last = plan.start_after(&facts, now_ms(), ahead);
        drop(facts);
        plan.refusal(last, Subject::Batch(searches))
    }

    /// Code searches the 60 s window still has room for, counting what other
    /// processes on this key reserved.
    pub fn code_search_room(&self, config: &ExecutorConfig) -> usize {
        self.refresh_from_disk();
        let now = now_ms();
        let used = self
            .facts()
            .code_search_ms
            .iter()
            .filter(|stamp| stamp.saturating_add(60_000) > now)
            .count();
        config.code_search_per_minute.saturating_sub(used)
    }

    /// Mark a resource exhausted until `reset` (epoch seconds).
    pub fn exhaust(&self, resource: &str, reset: u64) {
        self.facts().buckets.insert(
            resource.to_owned(),
            Bucket {
                remaining: 0,
                reset,
            },
        );
        self.persist();
    }

    /// Secondary limit: every caller of this key waits until `until_ms`.
    pub fn cool_down(&self, until_ms: u64) {
        {
            let mut facts = self.facts();
            facts.cooldown_until_ms = facts.cooldown_until_ms.max(until_ms);
        }
        self.persist();
    }

    /// Blocking `git` admission for clone subprocesses: honors the key's
    /// secondary cooldown / circuit, then takes a `git` group permit.
    pub fn acquire_git_blocking(
        &self,
        config: &ExecutorConfig,
        cap: Duration,
        deadline: Instant,
        is_cancelled: &dyn Fn() -> bool,
    ) -> Result<OwnedSemaphorePermit, ProviderError> {
        const TICK: Duration = Duration::from_millis(25);
        self.refresh_from_disk();
        loop {
            if is_cancelled() {
                return Err(BudgetStop::Cancelled.into());
            }
            if Instant::now() >= deadline {
                return Err(BudgetStop::Deadline.into());
            }
            // Clone traffic is not metered by an API bucket; only the shared
            // cooldown/circuit apply.
            let block = self
                .blocked("git", config)
                .filter(|block| block.reset.is_none());
            if let Some(block) = block {
                let now = now_ms();
                let wait = block.wait(now);
                if block.circuit.is_some() || wait > cap || Instant::now() + wait >= deadline {
                    return Err(block.error(now));
                }
                std::thread::sleep(wait.min(TICK));
                continue;
            }
            if let Ok(permit) = self.git.clone().try_acquire_owned() {
                return Ok(permit);
            }
            std::thread::sleep(TICK);
        }
    }
}

/// Process-wide registry of per-key executor state.
pub struct GitHubBudget {
    config: ExecutorConfig,
    keys: Mutex<HashMap<LimiterKey, Arc<KeyState>>>,
}

impl GitHubBudget {
    pub fn global() -> Arc<Self> {
        static BUDGET: OnceLock<Arc<GitHubBudget>> = OnceLock::new();
        BUDGET
            .get_or_init(|| Arc::new(Self::with_config(ExecutorConfig::octokit())))
            .clone()
    }

    pub fn relaxed() -> Arc<Self> {
        Arc::new(Self::with_config(ExecutorConfig::relaxed()))
    }

    pub fn with_config(config: ExecutorConfig) -> Self {
        Self {
            config,
            keys: Mutex::new(HashMap::new()),
        }
    }

    pub fn config(&self) -> &ExecutorConfig {
        &self.config
    }

    /// Admit an OAuth attempt under the anonymous host key shared with API traffic.
    /// The returned guard holds the auth and global permits until dropped.
    pub async fn admit_auth(
        &self,
        origin: &Url,
        cap: Duration,
        deadline: Instant,
        cancellation: &CancellationToken,
    ) -> Result<AuthAdmission, ProviderError> {
        let state = self.key_state(&LimiterKey::for_url(origin, None), None);
        state
            .wait_unblocked("auth", &self.config, cap, deadline, cancellation)
            .await?;
        let admission = state
            .admit(
                Some(Group::Auth),
                &self.config,
                false,
                cap,
                deadline,
                cancellation,
            )
            .await?;
        Ok(AuthAdmission {
            _admission: admission,
        })
    }

    /// Admit a clone subprocess under the shared host/token cooldown and circuit.
    /// The optional directory uses the same persisted rate-limit state as HTTP.
    pub fn acquire_git_blocking(
        &self,
        key: &LimiterKey,
        state_dir: Option<&Path>,
        cap: Duration,
        deadline: Instant,
        is_cancelled: &dyn Fn() -> bool,
    ) -> Result<OwnedSemaphorePermit, ProviderError> {
        self.key_state(key, state_dir).acquire_git_blocking(
            &self.config,
            cap,
            deadline,
            is_cancelled,
        )
    }

    /// State for `key`; attaches (and loads) the on-disk mirror when a
    /// state directory is supplied.
    pub(crate) fn key_state(&self, key: &LimiterKey, state_dir: Option<&Path>) -> Arc<KeyState> {
        let state = self
            .keys
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .entry(key.clone())
            .or_insert_with(|| Arc::new(KeyState::new(key.clone(), &self.config)))
            .clone();
        if let Some(dir) = state_dir {
            state.attach_dir(dir);
            state.refresh_from_disk();
        }
        state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_search_resources() {
        assert_eq!(
            GitHubResource::classify(
                &Url::parse("https://api.github.com/search/code")
                    .expect("GitHub test URL should parse")
            ),
            GitHubResource::CodeSearch
        );
        assert_eq!(
            GitHubResource::classify(
                &Url::parse("https://api.github.com/search/issues")
                    .expect("GitHub test URL should parse")
            ),
            GitHubResource::Search
        );
        assert_eq!(
            GitHubResource::classify(
                &Url::parse("https://api.github.com/repos/a/b/issues")
                    .expect("GitHub test URL should parse")
            ),
            GitHubResource::Core
        );
        assert_eq!(
            GitHubResource::classify(
                &Url::parse("https://api.github.com/graphql")
                    .expect("GitHub test URL should parse")
            ),
            GitHubResource::Graphql
        );
    }

    #[test]
    fn limiter_keys_fold_api_host_and_hash_tokens() {
        let api = LimiterKey::for_url(
            &Url::parse("https://api.github.com/").expect("url"),
            Some("t1"),
        );
        let web = LimiterKey::for_url(
            &Url::parse("https://github.com/a/b.git").expect("url"),
            Some("t1"),
        );
        assert_eq!(api, web);
        assert_ne!(api, LimiterKey::new("github.com", Some("t2")));
        assert_eq!(LimiterKey::new("github.com", None).token, "anon");
        assert!(!api.file_name().contains("t1"));
        let ported = LimiterKey::for_url(
            &Url::parse("http://127.0.0.1:8080/api/v3").expect("url"),
            None,
        );
        assert_eq!(ported.file_name(), "127.0.0.1_8080-anon.json");
    }

    #[test]
    fn primary_bucket_blocks_until_reset_and_isolates_keys() {
        let budget = GitHubBudget::relaxed();
        let one = budget.key_state(&LimiterKey::new("github.com", Some("one")), None);
        let two = budget.key_state(&LimiterKey::new("github.com", Some("two")), None);
        let reset = now_ms() / 1000 + 120;
        one.exhaust("core", reset);
        let block = one
            .blocked("core", budget.config())
            .expect("exhausted bucket blocks");
        assert_eq!(block.reset, Some(reset));
        assert!(one.blocked("search", budget.config()).is_none());
        assert!(two.blocked("core", budget.config()).is_none());
        let error = block.error(now_ms());
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        let rate = error.rate_limit.expect("metadata");
        assert_eq!(rate.resource.as_deref(), Some("core"));
        assert!(rate.retry_after_seconds.unwrap_or_default() >= 119);
    }

    /// A budget under `config` and its state for one host key.
    fn limited(config: ExecutorConfig) -> (Arc<GitHubBudget>, Arc<KeyState>) {
        let budget = Arc::new(GitHubBudget::with_config(config));
        let state = budget.key_state(&LimiterKey::new("h", None), None);
        (budget, state)
    }

    /// A spacing rejection names the group's own bucket, not the code-search
    /// window.
    #[tokio::test]
    async fn spacing_rejection_names_its_own_resource() {
        let (budget, state) = limited(ExecutorConfig {
            graphql_spacing: Duration::from_secs(5),
            ..ExecutorConfig::relaxed()
        });
        let token = CancellationToken::new();
        let admit = |deadline| {
            state.admit(
                Some(Group::Graphql),
                budget.config(),
                false,
                Duration::from_secs(10),
                deadline,
                &token,
            )
        };
        drop(
            admit(Instant::now() + Duration::from_secs(30))
                .await
                .expect("first start"),
        );
        let error = admit(Instant::now() + Duration::from_millis(100))
            .await
            .err()
            .expect("spacing exceeds the deadline");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert_eq!(
            error.rate_limit.and_then(|rate| rate.resource).as_deref(),
            Some("graphql")
        );
        assert!(!error.message.contains("code search"), "{}", error.message);
    }

    #[tokio::test]
    async fn search_spacing_orders_starts() {
        let (budget, state) = limited(ExecutorConfig {
            search_spacing: Duration::from_millis(150),
            ..ExecutorConfig::relaxed()
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let token = CancellationToken::new();
        let started = Instant::now();
        for _ in 0..3 {
            let _admission = state
                .admit(
                    Some(Group::Search),
                    budget.config(),
                    false,
                    Duration::from_secs(10),
                    deadline,
                    &token,
                )
                .await
                .expect("admitted");
        }
        assert!(started.elapsed() >= Duration::from_millis(290));
    }

    #[tokio::test]
    async fn a_short_code_search_window_wait_is_taken_inside_the_request() {
        let (budget, state) = limited(ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        });
        // The window is full, and its oldest slot frees in ~1.5 s: inside
        // the 2 s rate-limit cap.
        {
            let now = now_ms();
            let mut facts = state.facts();
            facts.code_search_ms.push_back(now - 58_500);
            facts.code_search_ms.push_back(now - 10_000);
        }
        let started = Instant::now();
        let admitted = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_secs(10),
                &CancellationToken::new(),
            )
            .await;
        assert!(admitted.is_ok(), "{:?}", admitted.err());
        assert!(started.elapsed() >= Duration::from_millis(1_000));
    }

    /// One cap bounds every wait: a window slot that frees after the cap
    /// fails fast with its retry-after, as a rate-limit block would.
    #[tokio::test]
    async fn a_window_wait_past_the_cap_fails_fast() {
        let (budget, state) = full_code_search_window();
        let started = Instant::now();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(1),
                Instant::now() + Duration::from_secs(10),
                &CancellationToken::new(),
            )
            .await
            .err()
            .expect("window wait past the cap");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert_eq!(
            error.rate_limit.and_then(|limit| limit.retry_after_seconds),
            Some(2)
        );
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    /// Two processes sharing the state directory reserve under its lock: the
    /// second sees the first's window slot before it reserves, so the
    /// window never admits more than its limit.
    #[tokio::test]
    async fn processes_reserve_window_slots_against_each_other() {
        let dir = tempfile::tempdir().expect("state directory");
        let config = ExecutorConfig {
            code_search_per_minute: 1,
            ..ExecutorConfig::relaxed()
        };
        let key = LimiterKey::new("h", None);
        let first = GitHubBudget::with_config(config.clone());
        let second = GitHubBudget::with_config(config);
        let (one, two) = (
            first.key_state(&key, Some(dir.path())),
            second.key_state(&key, Some(dir.path())),
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        let token = CancellationToken::new();
        let taken = one
            .admit(
                Some(Group::CodeSearch),
                first.config(),
                true,
                Duration::from_secs(1),
                deadline,
                &token,
            )
            .await;
        assert!(taken.is_ok(), "{:?}", taken.err());
        let error = two
            .admit(
                Some(Group::CodeSearch),
                second.config(),
                true,
                Duration::from_secs(1),
                deadline,
                &token,
            )
            .await
            .err()
            .expect("the other process holds the only slot");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    }

    /// Seed a full 2/min window whose oldest slot frees in ~1.5 s.
    fn full_code_search_window() -> (Arc<GitHubBudget>, Arc<KeyState>) {
        let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        }));
        let state = budget.key_state(&LimiterKey::new("h", None), None);
        {
            let now = now_ms();
            let mut facts = state.facts();
            facts.code_search_ms.push_back(now - 58_500);
            facts.code_search_ms.push_back(now - 10_000);
        }
        (budget, state)
    }

    #[tokio::test]
    async fn a_code_search_window_wait_does_not_block_other_searches() {
        let (budget, state) = full_code_search_window();
        let deadline = Instant::now() + Duration::from_secs(10);
        let token = CancellationToken::new();
        let waiting = {
            let (budget, state, token) = (budget.clone(), state.clone(), token.clone());
            tokio::spawn(async move {
                state
                    .admit(
                        Some(Group::CodeSearch),
                        budget.config(),
                        true,
                        Duration::from_secs(2),
                        deadline,
                        &token,
                    )
                    .await
                    .map(drop)
            })
        };
        tokio::time::sleep(Duration::from_millis(100)).await;
        let started = Instant::now();
        let other = state
            .admit(
                Some(Group::Search),
                budget.config(),
                false,
                Duration::from_secs(1),
                deadline,
                &token,
            )
            .await;
        assert!(other.is_ok(), "{:?}", other.err());
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "repo/issue search waited {:?} behind the code-search window",
            started.elapsed()
        );
        drop(other);
        waiting.await.expect("join").expect("code search admitted");
    }

    #[tokio::test]
    async fn a_cancelled_window_wait_releases_its_reserved_slot() {
        let (budget, state) = full_code_search_window();
        let token = CancellationToken::new();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            canceller.cancel();
        });
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_secs(10),
                &token,
            )
            .await
            .err()
            .expect("cancelled");
        assert_eq!(error.kind, ProviderErrorKind::Cancelled);
        let facts = state.facts();
        assert_eq!(facts.code_search_ms.len(), 2, "no phantom window slot");
        assert!(
            facts
                .last_start_ms
                .get(Group::CodeSearch.name())
                .is_none_or(|start| *start <= now_ms()),
            "no phantom spacing reservation"
        );
    }

    /// A peer process that holds the state file's lock must not hold this
    /// request past its deadline or its cancellation, and the request goes
    /// through as soon as the lock is released.
    #[tokio::test]
    async fn a_held_state_lock_cannot_block_admission_past_its_deadline() {
        let dir = tempfile::tempdir().expect("state directory");
        let config = || ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        };
        let key = LimiterKey::new("h", None);
        let budget = GitHubBudget::with_config(config());
        let state = budget.key_state(&key, Some(dir.path()));
        let mut sidecar = dir.path().join(key.file_name()).into_os_string();
        sidecar.push(".lock");
        let peer = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&sidecar)
            .expect("lock file");
        peer.lock().expect("peer takes the lock");

        let started = Instant::now();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_millis(300),
                &CancellationToken::new(),
            )
            .await
            .err()
            .expect("the held lock times the request out");
        assert_eq!(error.kind, ProviderErrorKind::Timeout);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "waited {:?}",
            started.elapsed()
        );

        let token = CancellationToken::new();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            canceller.cancel();
        });
        let started = Instant::now();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_secs(60),
                &token,
            )
            .await
            .err()
            .expect("cancellation ends the lock wait");
        assert_eq!(error.kind, ProviderErrorKind::Cancelled);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "waited {:?}",
            started.elapsed()
        );

        peer.unlock().expect("peer releases the lock");
        state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_secs(10),
                &CancellationToken::new(),
            )
            .await
            .expect("admitted once the lock is free");
    }

    /// The reservation is mirrored to disk before the wait, so the release
    /// must reach disk too, or other processes (and this one, on its next
    /// refresh) still count the phantom slot.
    #[tokio::test]
    async fn a_cancelled_window_wait_releases_its_persisted_slot() {
        let dir = tempfile::tempdir().expect("state directory");
        let config = || ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        };
        let key = LimiterKey::new("h", None);
        let budget = Arc::new(GitHubBudget::with_config(config()));
        let state = budget.key_state(&key, Some(dir.path()));
        {
            let now = now_ms();
            let mut facts = state.facts();
            facts.code_search_ms.push_back(now - 58_500);
            facts.code_search_ms.push_back(now - 10_000);
        }
        let token = CancellationToken::new();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            canceller.cancel();
        });
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(2),
                Instant::now() + Duration::from_secs(10),
                &token,
            )
            .await
            .err()
            .expect("cancelled");
        assert_eq!(error.kind, ProviderErrorKind::Cancelled);
        let other_process = GitHubBudget::with_config(config());
        let seen = other_process.key_state(&key, Some(dir.path()));
        let facts = seen.facts();
        assert_eq!(facts.code_search_ms.len(), 2, "no phantom slot on disk");
        assert!(
            facts
                .last_start_ms
                .get(Group::CodeSearch.name())
                .is_none_or(|start| *start <= now_ms()),
            "no phantom spacing reservation on disk"
        );
    }

    /// A refusal the window already decides is returned before the group
    /// permit, not after queueing behind another request's permit.
    #[tokio::test]
    async fn a_window_refusal_is_decided_before_the_group_permit() {
        let (budget, state) = full_code_search_window();
        let semaphore = state
            .groups
            .get(Group::CodeSearch.name())
            .expect("code-search group")
            .permit
            .clone();
        let _held = semaphore.acquire_owned().await.expect("held permit");
        let started = Instant::now();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(1),
                Instant::now() + Duration::from_secs(5),
                &CancellationToken::new(),
            )
            .await
            .err()
            .expect("window full");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "refused after {:?}",
            started.elapsed()
        );
    }

    /// The peek counts the admission queued ahead: with one window slot left
    /// and one sibling waiting for it, the next is refused at once instead of
    /// queueing behind the sibling and being refused after the wait.
    #[tokio::test]
    async fn a_peek_counts_the_admissions_queued_ahead_in_this_process() {
        let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        }));
        let state = budget.key_state(&LimiterKey::new("h", None), None);
        state.facts().code_search_ms.push_back(now_ms() - 1_000);
        let permit = state
            .groups
            .get(Group::CodeSearch.name())
            .expect("code-search group")
            .permit
            .clone();
        let held = permit.acquire_owned().await.expect("held permit");
        let token = CancellationToken::new();
        let ahead = {
            let (budget, state, token) = (Arc::clone(&budget), Arc::clone(&state), token.clone());
            tokio::spawn(async move {
                state
                    .admit(
                        Some(Group::CodeSearch),
                        budget.config(),
                        true,
                        Duration::from_secs(1),
                        Instant::now() + Duration::from_secs(10),
                        &token,
                    )
                    .await
                    .map(drop)
            })
        };
        while state.groups[Group::CodeSearch.name()]
            .queued
            .ahead()
            .windowed
            == 0
        {
            tokio::task::yield_now().await;
        }
        let started = Instant::now();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(1),
                Instant::now() + Duration::from_secs(10),
                &token,
            )
            .await
            .err()
            .expect("the last slot is taken by the sibling ahead");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "refused after {:?}",
            started.elapsed()
        );
        drop(held);
        ahead
            .await
            .expect("join")
            .expect("the sibling gets the slot");
    }

    /// A retry queued ahead takes its spacing slot but no window slot: with
    /// one window slot left, a new search queued behind it is still admitted.
    #[tokio::test]
    async fn a_retry_queued_ahead_takes_no_window_slot() {
        let budget = Arc::new(GitHubBudget::with_config(ExecutorConfig {
            code_search_per_minute: 2,
            search_spacing: Duration::from_millis(50),
            ..ExecutorConfig::relaxed()
        }));
        let state = budget.key_state(&LimiterKey::new("h", None), None);
        state.facts().code_search_ms.push_back(now_ms() - 1_000);
        let permit = state.groups[Group::CodeSearch.name()].permit.clone();
        let held = permit.acquire_owned().await.expect("held permit");
        let token = CancellationToken::new();
        let admit = |window: bool| {
            let (budget, state, token) = (Arc::clone(&budget), Arc::clone(&state), token.clone());
            tokio::spawn(async move {
                state
                    .admit(
                        Some(Group::CodeSearch),
                        budget.config(),
                        window,
                        Duration::from_secs(1),
                        Instant::now() + Duration::from_secs(10),
                        &token,
                    )
                    .await
                    .map(drop)
            })
        };
        let retry = admit(false);
        while state.groups[Group::CodeSearch.name()].queued.ahead().plain == 0 {
            tokio::task::yield_now().await;
        }
        let search = admit(true);
        while state.groups[Group::CodeSearch.name()]
            .queued
            .ahead()
            .windowed
            == 0
        {
            tokio::task::yield_now().await;
        }
        drop(held);
        retry.await.expect("join").expect("the retry is admitted");
        search
            .await
            .expect("join")
            .expect("the search takes the last window slot");
        assert_eq!(state.facts().code_search_ms.len(), 2);
    }

    /// A batch refused by spacing alone names the spacing, not the window.
    #[test]
    fn a_batch_refused_by_spacing_names_the_spacing() {
        let (budget, state) = limited(ExecutorConfig {
            search_spacing: Duration::from_secs(2),
            ..ExecutorConfig::relaxed()
        });
        let refusal = state
            .code_search_batch_refusal(
                3,
                budget.config(),
                Duration::from_secs(1),
                Instant::now() + Duration::from_secs(30),
            )
            .expect("three starts 2 s apart exceed the cap");
        assert!(
            refusal
                .message
                .contains("spacing cannot fit this row's 3 searches"),
            "{}",
            refusal.message
        );
        assert!(!refusal.message.contains("window"), "{}", refusal.message);
    }

    /// A client-side refusal reports only what the client knows: the wait.
    /// GitHub's counters were not consulted, so none are claimed.
    #[tokio::test]
    async fn a_client_refusal_claims_no_provider_counters() {
        let (budget, state) = full_code_search_window();
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(1),
                Instant::now() + Duration::from_secs(5),
                &CancellationToken::new(),
            )
            .await
            .err()
            .expect("window full");
        let rate = error.rate_limit.expect("rate-limit metadata");
        assert_eq!(rate.remaining, None);
        assert_eq!(rate.reset_epoch_seconds, None);
        assert!(rate.retry_after_seconds.is_some_and(|secs| secs > 0));
        assert_eq!(rate.resource.as_deref(), Some("code_search"));
    }

    #[tokio::test]
    async fn code_search_window_fails_fast_when_full() {
        let (budget, state) = limited(ExecutorConfig {
            code_search_per_minute: 2,
            ..ExecutorConfig::relaxed()
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let token = CancellationToken::new();
        for _ in 0..2 {
            drop(
                state
                    .admit(
                        Some(Group::CodeSearch),
                        budget.config(),
                        true,
                        Duration::from_secs(1),
                        deadline,
                        &token,
                    )
                    .await
                    .expect("admitted"),
            );
        }
        let error = state
            .admit(
                Some(Group::CodeSearch),
                budget.config(),
                true,
                Duration::from_secs(1),
                deadline,
                &token,
            )
            .await
            .err()
            .expect("window full");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
        assert_eq!(
            error.rate_limit.and_then(|r| r.resource).as_deref(),
            Some("code_search")
        );
    }

    #[tokio::test]
    async fn oauth_admission_holds_permits_and_honors_cancellation_and_shared_cooldown() {
        let budget = GitHubBudget::with_config(ExecutorConfig {
            global_concurrency: 1,
            ..ExecutorConfig::relaxed()
        });
        let origin = Url::parse("https://api.github.com").expect("origin");
        let cap = Duration::from_secs(1);
        let deadline = Instant::now() + Duration::from_secs(5);
        let cancellation = CancellationToken::new();
        let permit = budget
            .admit_auth(&origin, cap, deadline, &cancellation)
            .await
            .expect("first admission");
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        let error = budget
            .admit_auth(&origin, cap, deadline, &cancelled)
            .await
            .err()
            .expect("cancelled while waiting for a permit");
        assert_eq!(error.kind, ProviderErrorKind::Cancelled);
        let error = budget
            .admit_auth(
                &origin,
                cap,
                Instant::now() + Duration::from_millis(20),
                &cancellation,
            )
            .await
            .err()
            .expect("permit stays held");
        assert_eq!(error.kind, ProviderErrorKind::Timeout);
        drop(permit);
        drop(
            budget
                .admit_auth(&origin, cap, deadline, &cancellation)
                .await
                .expect("permit released"),
        );
        budget
            .key_state(&LimiterKey::new("github.com", None), None)
            .cool_down(now_ms() + 60_000);
        let error = budget
            .admit_auth(&origin, cap, deadline, &cancellation)
            .await
            .err()
            .expect("shared anonymous cooldown");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    }

    #[test]
    fn git_gate_fails_fast_on_long_cooldown() {
        let budget = GitHubBudget::relaxed();
        let dir = tempfile::tempdir().expect("state directory");
        let key = LimiterKey::new("github.com", None);
        let state = budget.key_state(&key, Some(dir.path()));
        let deadline = Instant::now() + Duration::from_secs(5);
        let permit = budget
            .acquire_git_blocking(
                &key,
                Some(dir.path()),
                Duration::from_secs(1),
                deadline,
                &|| false,
            )
            .expect("free git slot");
        drop(permit);
        state.cool_down(now_ms() + 60_000);
        let error = GitHubBudget::relaxed()
            .acquire_git_blocking(
                &key,
                Some(dir.path()),
                Duration::from_secs(1),
                deadline,
                &|| false,
            )
            .expect_err("cooldown");
        assert_eq!(error.kind, ProviderErrorKind::RateLimited);
    }
}

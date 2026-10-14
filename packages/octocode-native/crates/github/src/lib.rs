//! GitHub protocol, bounded transport, and provider operations.
//! Hosts own credential acquisition, cache storage, and application policy.
#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used, clippy::panic))]

mod budget;
mod commit_dates;
mod content;
mod credentials;
mod endpoint;
mod error;
mod flight;
mod history;
mod history_item;
mod partition;
mod query_syntax;
mod refs;
mod request_budget;
mod retry;
mod search;
mod transport;
mod tree;

/// GitHub REST's largest `per_page`: one provider batch of a list endpoint
/// (branches, tags, comments, reviews, commits, changed files).
pub const MAX_PER_PAGE: usize = 100;

pub use budget::{AuthAdmission, ExecutorConfig, GitHubBudget, GitHubResource, LimiterKey};
pub use commit_dates::{MAX_PATHS_PER_REQUEST, PathDates};
pub use content::{
    CachedContent, ConditionalCache, ContentRequest, ContentResponse, GitHubProvider, NoCache,
    Retention, is_full_sha,
};
pub use credentials::{CredentialSource, ResolvedCredential};
pub use endpoint::{GitHubEndpoint, credential_host, is_loopback};
pub use error::{ProviderError, ProviderErrorKind, ProviderErrorReason, RateLimit};
pub use flight::{KeyedFlight, Ticket};
pub use history::{CommitListRequest, HistoryPage, HistoryRequest, PullListRequest};
pub use partition::Partition;
pub use query_syntax::{
    qualifier_value, quote_search_keyword, search_phrase, validate_person_name,
    validate_qualifier_value,
};
pub use refs::{NamedRef, RefKind, RefMatch, RefPage};
pub use request_budget::{BudgetStop, RequestBudget};
pub use retry::{
    Backoff, BodyError, StatusClass, civil_from_days, classify_status, days_from_civil,
    full_jitter, is_retryable_send, read_bounded, retry_after_delay,
};
pub use search::{
    CodeSearchItem, CodeSearchPage, CodeSearchRequest, RepositoryMetadata, RepositorySearchItem,
    RepositorySearchPage, RepositorySearchRequest, TextMatch, TreeEntry, TreeRequest, TreeResponse,
};
pub use transport::{
    GitHubTransport, GraphQlError, GraphQlPage, HTTP_USER_AGENT, HttpMethod, RequestContext,
    RequestSpec, ResponsePage, RetryPolicy, sso_partial_warning,
};
pub use tree::{ContentsEntry, ContentsListing};

#[cfg(test)]
mod tests;

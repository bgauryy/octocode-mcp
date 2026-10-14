//! GitHub host integration: credential policy, OAuth, and relative query dates.
mod auth;
mod dates;
pub mod login;

pub use auth::{
    AuthMode, AuthSelection, Authentication, CredentialStore, OAuthToken, StoredCredentials,
    configured_credential_host,
};
pub use dates::{resolve_date_window, utc_timestamp};
/// The public names the CLI (which does not depend on `octocode-github`) and
/// `runtime/engine.rs` still use; runtime code names `octocode_github::`.
pub use octocode_github::{ProviderError, ProviderErrorKind, ResolvedCredential};

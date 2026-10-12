//! Rust-owned secret detection and content sanitization.
//!
//! `patterns.rs` is the canonical ordered pattern set.

pub(crate) mod detector;
pub(crate) mod patterns;
pub(crate) mod sanitizer;
pub mod types;

/// Every redaction placeholder starts here: `[REDACTED-<NAME>]`. Readers that
/// find or count redactions in sanitized text match this prefix.
pub const REDACTION_PREFIX: &str = "[REDACTED";

/// The placeholder that stands in for a secret of kind `name`.
pub fn redaction_placeholder(name: &str) -> String {
    format!("{REDACTION_PREFIX}-{}]", name.to_ascii_uppercase())
}

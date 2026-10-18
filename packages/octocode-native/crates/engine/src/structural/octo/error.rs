//! Why a structural query does not compile. The wire text (`[code] message`)
//! and the diagnostic code are derived from the variant, never parsed back out
//! of a message.

use crate::structural::types::StructuralDiagnostic;

use super::matching::{ExecutionError, PARSE_INTERRUPTED};
use super::rule::RULE_INVALID;

/// The code of a rule or pattern the grammar cannot compile.
pub(in crate::structural) const COMPILE_FAILED: &str = "structural.query.compileFailed";

#[derive(Debug, Clone)]
pub(in crate::structural) enum CompileError {
    /// A rule that does not parse as a rule: malformed YAML, an unknown key,
    /// no matcher, a bad regex.
    Rule(String),
    /// Compiling a pattern needed a parse that failed or was interrupted.
    Parse(ExecutionError),
    /// A rule or pattern this grammar cannot compile.
    Grammar(String),
}

impl CompileError {
    pub(super) fn rule(message: impl Into<String>) -> Self {
        Self::Rule(message.into())
    }

    pub(super) fn grammar(message: impl Into<String>) -> Self {
        Self::Grammar(message.into())
    }

    /// The compile-time parse interruption, which a caller reports as a
    /// truncated file rather than a failed query.
    pub(in crate::structural) fn interruption(&self) -> Option<&ExecutionError> {
        match self {
            Self::Parse(error) if error.code == PARSE_INTERRUPTED => Some(error),
            _ => None,
        }
    }

    /// The diagnostic of a query that does not compile.
    pub(in crate::structural) fn diagnostic(&self) -> StructuralDiagnostic {
        match self {
            Self::Rule(_) => {
                StructuralDiagnostic::new(RULE_INVALID, "error", "match", self.to_string())
                    .with_recovery(
                        "Fix the rule object: the message names the key or value it rejects.",
                    )
            }
            Self::Parse(_) | Self::Grammar(_) => StructuralDiagnostic::new(
                COMPILE_FAILED,
                "error",
                "match",
                self.to_string(),
            )
            .with_recovery(
                "Check the structural pattern or YAML rule against this file's language grammar.",
            ),
        }
    }
}

impl From<ExecutionError> for CompileError {
    fn from(error: ExecutionError) -> Self {
        Self::Parse(error)
    }
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Rule(message) => write!(f, "[{RULE_INVALID}] {message}"),
            Self::Parse(error) => std::fmt::Display::fmt(error, f),
            Self::Grammar(message) => write!(f, "[{COMPILE_FAILED}] {message}"),
        }
    }
}

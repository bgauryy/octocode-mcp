//! Request lifetime and bounded scheduling shared by both native interfaces.

pub mod availability;
pub(crate) mod dispatch;
pub(crate) mod domain_dispatch;
pub(crate) mod engine;
pub mod error;
mod exit;
pub(crate) mod git_head;
mod github;
mod github_cache;
mod lifecycle;
mod maintenance;
mod row_indices;
mod source_identity;
mod tool_output;

pub use crate::tools::result::FailureKind;
pub use engine::{Channel, HostOptions, RuntimeError, ToolOutcome, ToolRuntime};
pub use exit::ExitClass;
pub(crate) use exit::failure_kind;
pub use lifecycle::{
    DEFAULT_TIMEOUT, ExecutionContext, ExecutionError, RequestAdmission, RequestRuntime,
    RuntimeLimits,
};

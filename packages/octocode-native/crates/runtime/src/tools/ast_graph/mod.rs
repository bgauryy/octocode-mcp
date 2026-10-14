mod algorithms;
mod aliases;
mod analysis;
mod cargo;
mod drift;
mod graph;
mod liveness;
mod memo;
mod packages;
mod page;
mod scope;
pub mod store;
mod types;

/// Contract maximum of an astTopology query field; an undeclared bound stays
/// open (validation enforces it).
fn topology_max(field: &str) -> u32 {
    let max =
        crate::contracts::query_schema_max(crate::tools::id::ToolId::AstTopology, None, field);
    u32::try_from(max).unwrap_or(u32::MAX)
}

use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};

pub use types::{AstGraphResult, AstTopologyQuery, GraphAnalysis};

/// astTopology's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, query: &serde_json::Value) -> &'static str {
        match query.get("operation").and_then(serde_json::Value::as_str) {
            Some("dependents") => {
                "No scanned file imports it: scan the repo root, or localSearch its module name for unlinked importers."
            }
            Some("dependencies") => {
                "It imports no scanned file: its imports are external or unlinked; read coverage.imports and diagnostics."
            }
            Some("cycles") => {
                "No import cycle in the scanned files; coverage.imports counts the imports a cycle could pass through unlinked."
            }
            Some("deadCode") => {
                "No dead export found from the resolved entrypoints; pass entrypoints to add roots."
            }
            Some("reachability") => {
                "No files to classify: check that path covers the code and read coverage.diagnostics."
            }
            Some("path") => {
                "No import path from source to target in the scanned files; follow dependencies or dependents one hop at a time."
            }
            Some("drift") => {
                "No graph drift between baseline and path; compare another baseline or widen path."
            }
            _ => "Inspect diagnostics, then broaden the graph scope if needed.",
        }
    }
    fn error_hint(&self, code: &str) -> Option<&'static str> {
        (code == "invalidGraphQuery").then_some(
            "source and target are relative to path (or absolute under it): copy a file from a result row.",
        )
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "syntactic"
    }
    fn path_anchor(&self) -> crate::tools::output::PathAnchor {
        crate::tools::output::PathAnchor::ScannedDir
    }
}

/// Execute public `astTopology` through the portable native
/// fact scanner and Rust-owned graph algorithms.
/// `cargo` is the configured `OCTOCODE_CARGO` for Rust workspace linking.
pub fn execute_topology(
    query: &AstTopologyQuery,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    cargo: Option<&str>,
) -> AstGraphResult {
    // The builder and graph algorithms uphold map-index invariants with
    // `expect()`; a corrupt or adversarial input tripping one must surface as
    // a structured tool error, not tear down the host process.
    let extras = graph::BuildExtras {
        cargo: cargo.map(str::to_owned),
        ..Default::default()
    };
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if query.analysis() == GraphAnalysis::Drift {
            return drift::drift(query, paths, security, cancel, &extras);
        }
        let (built, display_path) =
            graph::build_graph_shared_with(query, paths, security, cancel, &extras)?;
        analysis::analyze(&built, &display_path, query, paths, security, cancel)
    }))
    .unwrap_or_else(|panic| {
        let detail = panic
            .downcast_ref::<&str>()
            .map(|message| (*message).to_owned())
            .or_else(|| panic.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "graph analysis panicked".to_owned());
        Err(crate::tools::result::ToolError::new(
            "executionFailed",
            format!("Graph analysis failed internally: {detail}"),
        ))
    })
}

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

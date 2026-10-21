mod algorithms;
mod aliases;
mod analysis;
mod cargo;
mod drift;
mod edges;
mod freshness;
mod graph;
mod js_paths;
mod linking;
mod liveness;
mod memo;
mod packages;
mod page;
mod scope;
pub mod store;
mod types;

/// Version of the [`types::BuiltGraph`] shape a stored graph was written
/// with: bump it when the shape changes, so no older file is read. 2: call
/// labels elide argument text, and only a graph the secret scanner passes
/// is stored (version 1 files could hold raw call arguments). 3: stored
/// deflated.
const GRAPH_SHAPE: u32 = 3;

/// Host settings for graph linking and optional persistence. Each runtime
/// supplies its own directory; memory-only runtimes never read or write it.
#[derive(Clone, Debug, Default)]
pub struct AstTopologyRuntimeOptions {
    pub cargo: Option<String>,
    pub cache_dir: Option<std::path::PathBuf>,
    pub response_window: Option<usize>,
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
                "No dead export found from the resolved entrypoints; test files count as roots unless includeTests is false."
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
/// Host settings are separate from the public query contract.
pub fn execute_topology(
    query: &AstTopologyQuery,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    options: &AstTopologyRuntimeOptions,
) -> AstGraphResult {
    // The builder and graph algorithms uphold map-index invariants with
    // `expect()`; a corrupt or adversarial input tripping one must surface as
    // a structured tool error, not tear down the host process.
    let extras = graph::BuildExtras {
        cargo: options.cargo.clone(),
        cache_dir: options.cache_dir.clone(),
        ..Default::default()
    };
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if query.analysis() == GraphAnalysis::Drift {
            return drift::drift(
                query,
                paths,
                security,
                cancel,
                &extras,
                options.response_window,
            );
        }
        let (built, display_path) =
            graph::build_graph_shared_with(query, paths, security, cancel, &extras)?;
        analysis::analyze(
            &built,
            &display_path,
            query,
            paths,
            security,
            cancel,
            options.response_window,
        )
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
mod dead_code_root_tests;
#[cfg(test)]
mod drift_tests;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

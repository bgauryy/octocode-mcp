use crate::support;

use octocode_native::tools::id::ToolId;
use support::Workspace;

/// `schema <tool>` carries the runtime's availability: enabled, or the
/// variables of exactly the prerequisites still unset.
#[test]
fn schema_availability_names_the_unset_prerequisites() {
    let workspace = Workspace::new();
    for (beta, key) in [(false, false), (false, true), (true, false), (true, true)] {
        let availability = |tool: &str| {
            let mut command = workspace.cli();
            command.args(["schema", tool]);
            if beta {
                command.env("OCTOCODE_BETA", "true");
            }
            if key {
                command.env("OCTOCODE_CLASSIFICATION_API", "fixture-key");
            }
            let output = command.output().expect("schema command");
            assert!(output.status.success(), "{output:?}");
            let view: serde_json::Value =
                serde_json::from_slice(&output.stdout).expect("schema JSON");
            view["availability"].clone()
        };
        let clasify = availability("clasify");
        assert_eq!(clasify["enabled"], beta && key, "{clasify}");
        let unset: Vec<&str> = [
            (!beta).then_some("OCTOCODE_BETA"),
            (!key).then_some("OCTOCODE_CLASSIFICATION_API"),
        ]
        .into_iter()
        .flatten()
        .collect();
        if !unset.is_empty() {
            assert_eq!(clasify["envVar"], unset.join("|"), "{clasify}");
        }
        for tool in [ToolId::AstRewrite, ToolId::AstTopology] {
            let gated = availability(tool.as_str());
            // A tool the contract parks stays off whatever the beta gate.
            if tool.is_disabled() {
                assert_eq!(gated["enabled"], false, "{tool}: {gated}");
                continue;
            }
            assert_eq!(gated["enabled"], beta, "{tool}: {gated}");
            if !beta {
                assert_eq!(gated["envVar"], "OCTOCODE_BETA", "{tool}: {gated}");
            }
        }
    }
}

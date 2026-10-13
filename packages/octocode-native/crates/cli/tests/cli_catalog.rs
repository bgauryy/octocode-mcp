// Integration test crate — assertions use unwrap/expect/panic freely.
#![allow(clippy::expect_used)]

use crate::support;

use support::Workspace;

#[test]
fn catalog_is_machine_only_with_availability_scoping() {
    let workspace = Workspace::new();
    for (beta, key) in [(false, false), (false, true), (true, false), (true, true)] {
        let enabled = beta && key;
        let mut env = Vec::new();
        if beta {
            env.push(("OCTOCODE_BETA", "true".into()));
        }
        if key {
            env.push(("OCTOCODE_CLASSIFICATION_API", "fixture-key".into()));
        }
        let runtime = workspace.runtime(&env);
        let native_catalog = runtime.catalog().expect("native catalog");
        assert!(
            native_catalog.get("mcpInstructions").is_none(),
            "instructions are core-delivered by the JS layers: {native_catalog}"
        );
        let expected_fingerprint = native_catalog["fingerprint"]
            .as_str()
            .expect("enforcement fingerprint")
            .to_owned();
        drop(runtime);

        let mut command = workspace.cli();
        command.arg("catalog");
        if beta {
            command.env("OCTOCODE_BETA", "true");
        }
        if key {
            command.env("OCTOCODE_CLASSIFICATION_API", "fixture-key");
        }
        let output = command.output().expect("catalog command");
        assert!(output.status.success(), "{output:?}");
        let catalog: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("catalog JSON");
        assert!(catalog.get("instructions").is_none(), "{catalog}");
        assert!(catalog.get("guidance").is_none(), "{catalog}");
        assert_eq!(catalog["fingerprint"], expected_fingerprint, "{catalog}");
        assert_eq!(
            catalog["grammarCapabilities"], native_catalog["grammarCapabilities"],
            "machine catalog must carry the runtime grammar inventory"
        );
        let clasify = catalog["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .find(|tool| tool["name"] == "clasify")
            .expect("clasify entry");
        assert_eq!(clasify["availability"]["enabled"], enabled, "{catalog}");
        if !enabled {
            assert_eq!(
                clasify["availability"]["envVar"], "OCTOCODE_BETA|OCTOCODE_CLASSIFICATION_API",
                "{catalog}"
            );
        }
        let ast_rewrite = catalog["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .find(|tool| tool["name"] == "astRewrite")
            .expect("astRewrite entry");
        assert_eq!(ast_rewrite["availability"]["enabled"], beta, "{catalog}");
        if !beta {
            assert_eq!(
                ast_rewrite["availability"]["envVar"], "OCTOCODE_ENABLE_LOCAL|OCTOCODE_BETA",
                "{catalog}"
            );
        }
        let ast_topology = catalog["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .find(|tool| tool["name"] == "astTopology")
            .expect("astTopology entry");
        assert_eq!(ast_topology["availability"]["enabled"], beta, "{catalog}");
        if !beta {
            assert_eq!(
                ast_topology["availability"]["envVar"], "OCTOCODE_ENABLE_LOCAL|OCTOCODE_BETA",
                "{catalog}"
            );
        }
    }
}

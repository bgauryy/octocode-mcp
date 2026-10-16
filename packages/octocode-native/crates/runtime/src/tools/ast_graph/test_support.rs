//! Fixtures the astTopology test modules share.
use super::*;
pub(super) use crate::tools::test_support::Fixture;
use serde_json::Value;
use std::path::Path;

pub(super) fn run(query: Value, root: &Path) -> AstGraphResult {
    let (paths, security) = crate::tools::test_support::simple_policy(root);
    let parsed: AstTopologyQuery = serde_json::from_value(query).expect("query");
    execute_topology(
        &parsed,
        &paths,
        &security,
        &crate::tools::cancel::NeverCancel,
        &Default::default(),
    )
}

/// Run a successful topology `query` (research fields added; `path`
/// defaults to `root`) under `root`.
pub(super) fn topology(root: &Path, mut query: Value) -> Value {
    if query.get("path").is_none() {
        query["path"] = root.to_string_lossy().into();
    }
    query["mainGoal"] = "test".into();
    query["reasoning"] = "test".into();
    run(query, root).expect("topology result")
}

/// Write each `(path, text)` under `dir` of `root` (`""`: the root itself).
pub(super) fn write_under(root: &Fixture, dir: &str, files: &[(&str, &str)]) {
    for (path, text) in files {
        let relative = if dir.is_empty() {
            (*path).to_owned()
        } else {
            format!("{dir}/{path}")
        };
        root.write(&relative, text);
    }
}

/// The scanned-file set of a fixture.
pub(super) fn known(files: &[&str]) -> std::collections::BTreeSet<String> {
    files.iter().map(|file| (*file).to_owned()).collect()
}

/// A temporary directory holding `files`.
pub(super) fn fixture(files: &[(&str, &str)]) -> Fixture {
    let temp = Fixture::new();
    write_under(&temp, "", files);
    temp
}

/// A Cargo package manifest for a crate named `app`.
pub(super) const CARGO_APP: (&str, &str) = (
    "Cargo.toml",
    "[package]\nname = \"app\"\nversion = \"0.1.0\"\n",
);

/// The `file` of every result row.
pub(super) fn result_files(out: &Value) -> Vec<&str> {
    out["nodes"]
        .as_array()
        .expect("rows")
        .iter()
        .filter_map(|row| row["file"].as_str())
        .collect()
}

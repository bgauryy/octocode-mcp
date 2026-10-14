//! What the shared response stages ask about structureSearch output.

use crate::tools::output::{PathAnchor, ToolOutput};
use serde_json::Value;

pub(crate) struct Output;

/// Query fields that narrow a listing (both operations').
const FILTERS: [&str; 11] = [
    "include",
    "extensions",
    "exclude",
    "entryType",
    "nameRegex",
    "minDepth",
    "empty",
    "permissions",
    "access",
    "size",
    "time",
];

impl ToolOutput for Output {
    fn fallback_hint(&self, query: &Value) -> &'static str {
        use crate::tools::output::has_value;
        if FILTERS.iter().any(|key| has_value(query, key)) {
            "Loosen include/extensions/exclude/nameRegex/size/time, raise maxDepth, or list the parent."
        } else {
            "Check path with its parent tree, or raise maxDepth."
        }
    }
    fn evidence_kind(&self, _query: &Value, _data: &Value) -> &'static str {
        "exact"
    }
    fn path_anchor(&self) -> PathAnchor {
        PathAnchor::QueryParent
    }
    fn reads_worktree(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_filter_field_gets_the_filter_hint() {
        let narrowed = "Loosen include/extensions/exclude/nameRegex/size/time, raise maxDepth, or list the parent.";
        for (key, value) in [
            ("include", json!(["*.rs"])),
            ("nameRegex", json!("^a")),
            ("minDepth", json!(2)),
            ("empty", json!(true)),
            ("permissions", json!("644")),
            ("access", json!("executable")),
            ("size", json!({"greater": "1k"})),
        ] {
            let query = json!({"operation": "files", "path": ".", key: value});
            assert_eq!(Output.fallback_hint(&query), narrowed, "{key}");
        }
        assert_eq!(
            Output.fallback_hint(&json!({"operation": "files", "path": "."})),
            "Check path with its parent tree, or raise maxDepth."
        );
    }
}

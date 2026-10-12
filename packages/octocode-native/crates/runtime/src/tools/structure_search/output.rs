//! What the shared response stages ask about structureSearch output.

use crate::tools::output::{PathAnchor, ToolOutput};
use serde_json::Value;

pub(crate) struct Output;
impl ToolOutput for Output {
    fn fallback_hint(&self, query: &Value) -> &'static str {
        use crate::tools::output::has_value;
        if [
            "include",
            "extensions",
            "exclude",
            "entryType",
            "size",
            "time",
        ]
        .iter()
        .any(|key| has_value(query, key))
        {
            "Loosen include/extensions/exclude, raise maxDepth, or list the parent."
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

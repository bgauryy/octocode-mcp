//! lspSearch output facts for the shared response stages.
use crate::tools::output::{PathAnchor, TextShape, ToolOutput};
use serde_json::Value;

pub(crate) struct Output;

impl ToolOutput for Output {
    fn fallback_hint(&self, _query: &Value) -> &'static str {
        "Refresh path/symbolName/line from a current astSearch or localSearch hit."
    }
    fn evidence_kind(&self, _query: &Value, data: &Value) -> &'static str {
        match data.pointer("/lsp/source").and_then(Value::as_str) {
            Some("native-graph-facts" | "markdown") => "syntactic",
            _ => "semantic",
        }
    }
    fn path_anchor(&self) -> PathAnchor {
        PathAnchor::Workspace
    }
    /// documentSymbols rows print as a compact outline in YAML text; every
    /// other payload renders structured.
    fn text_shape(&self) -> TextShape {
        TextShape::Outline
    }
}

#[cfg(test)]
mod tests {
    use crate::tools::id::ToolId;
    use serde_json::json;

    #[test]
    fn native_language_server_results_are_semantic_evidence() {
        let lsp = ToolId::LspSearch.output();
        let kind =
            |source: &str| lsp.evidence_kind(&json!({}), &json!({"lsp": {"source": source}}));
        assert_eq!(kind("native"), "semantic");
        assert_eq!(kind("native-graph-facts"), "syntactic");
    }
}

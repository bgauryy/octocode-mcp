use crate::tools::id::ToolId;
use crate::tools::num::usize_of;
use crate::tools::result::ToolError;
use crate::{
    policy::path::PathPolicy, security::ContentSecurity, tools::cancel::CancellationCheck,
};
use octocode_engine::structural::SyntaxTreeInspectOptions;
use serde_json::json;
const MAX_SOURCE: usize = super::MAX_PARSE_SOURCE_BYTES;
pub use crate::contracts::tool_types::AstSearchQuerySyntaxTree;

/// Engine-unit views over the generated `syntaxTree` query.
impl AstSearchQuerySyntaxTree {
    pub(crate) fn language(&self) -> Option<String> {
        self.language.as_ref().map(ToString::to_string)
    }
    pub(crate) fn page(&self) -> u32 {
        u32::try_from(self.page.get()).unwrap_or(u32::MAX)
    }
    /// The caller's nodes per page; unset fills the response window.
    pub(crate) fn page_size(&self) -> Option<u32> {
        self.page_size
            .map(|size| u32::try_from(size.get()).unwrap_or(u32::MAX))
    }
    /// The first node of an explicit-size page; a window-sized page starts
    /// where the previous one ended, which only a walk of the nodes knows.
    pub(crate) fn node_offset(&self) -> Option<u32> {
        self.page_size()
            .map(|size| self.page().saturating_sub(1).saturating_mul(size))
    }
    pub(crate) fn snapshot(&self) -> Option<&str> {
        self.snapshot.as_deref().map(String::as_str)
    }
}

pub fn execute_syntax(
    q: &AstSearchQuerySyntaxTree,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
) -> super::AstResult {
    cancel.check().map_err(ToolError::cancelled)?;
    let p = paths
        .validate_read(q.path.as_str())
        .map_err(super::policy_error)?;
    super::validate_file_language(&p.canonical, q.language().as_deref())?;
    let Some(bytes) = super::read_parse_source(&p.canonical)? else {
        return Ok(super::source_limit(&p.canonical.to_string_lossy(), None));
    };
    let sanitized = security
        .validate_text_bytes(&bytes, Some(&p.canonical), MAX_SOURCE)
        .map_err(super::policy_error)?;
    let snapshot = crate::digest::json_sha256(&json!([
        // Node-row shape version (1-based columns).
        "rows-v2",
        p.canonical.to_string_lossy(),
        q.language,
        sanitized.content,
        q.named_only
    ]));
    if q.page() > 1 && q.snapshot() != Some(snapshot.as_str()) {
        let mut restart = serde_json::to_value(q).unwrap_or_default();
        if let Some(map) = restart.as_object_mut() {
            map.remove("snapshot");
            map.remove("page");
        }
        return Ok(crate::tools::result::stale_snapshot(
            crate::tools::result::Continuation::new(ToolId::AstSearch, restart)
                .confidence("exact")
                .build(),
        ));
    }
    cancel.check().map_err(ToolError::cancelled)?;
    let extension =
        super::cpp_header_override(&p.canonical, q.language().as_deref()).then_some("cpp");
    let inspect = |offset: u32, limit: u32| {
        octocode_engine::portable::inspect_syntax_tree_with_extension(
            &sanitized.content,
            &p.canonical.to_string_lossy(),
            extension,
            Some(SyntaxTreeInspectOptions {
                named_only: Some(q.named_only),
                node_offset: Some(offset),
                node_limit: Some(limit),
            }),
        )
        .map_err(super::native_error)
    };
    let page = q.page();
    let budget = crate::tools::page_windows::page_budget(
        response_window,
        &serde_json::to_value(q).unwrap_or_default(),
    );
    // An explicit size asks the engine for exactly its page. Otherwise the
    // page is the nodes that fill the window: each page starts where the one
    // before ended, so the walk reads nodes from the start until the page's
    // window is closed by a node that no longer fits.
    let (r, more) = match q.node_offset().zip(q.page_size()) {
        Some((offset, size)) => {
            let r = inspect(offset, size)?;
            let more = r.next_offset.is_some();
            (r, more)
        }
        None => {
            let mut walked = inspect(0, NODE_CHUNK)?;
            let mut windows;
            loop {
                let sizes = walked.nodes.iter().map(node_page_chars).collect::<Vec<_>>();
                windows = crate::tools::page_windows::Paging::of(None, budget).windows(&sizes);
                let Some(next) = walked
                    .next_offset
                    .filter(|_| windows.len() <= usize_of(page) && walked.status == "ok")
                else {
                    break;
                };
                cancel.check().map_err(ToolError::cancelled)?;
                let rest = inspect(next, NODE_CHUNK)?;
                walked.nodes.extend(rest.nodes);
                walked.next_offset = rest.next_offset;
                walked.status = rest.status;
                walked.diagnostics.extend(rest.diagnostics);
            }
            let window = windows
                .get(usize_of(page).saturating_sub(1))
                .cloned()
                .unwrap_or(walked.nodes.len()..walked.nodes.len());
            let more = windows.len() > usize_of(page);
            walked.nodes = walked.nodes[window].to_vec();
            (walked, more)
        }
    };
    // Line/column locate every node; byte offsets are verbose (core field
    // class): the verbose stage keeps `returnedBytes` for `debug`.
    let node_bytes = r
        .nodes
        .iter()
        .map(|n| format!("{}-{}", n.start_byte, n.end_byte))
        .collect::<Vec<_>>();
    let nodes = r.nodes.iter().map(node_page_row).collect::<Vec<_>>();
    let diagnostics=r.diagnostics.into_iter().map(|d|json!({"code":d.code,"severity":d.severity,"stage":d.stage,"message":d.message,"path":p.canonical.to_string_lossy(),"recovery":d.recovery})).collect::<Vec<_>>();
    let display_path = p.canonical.to_string_lossy();
    // A failed inspection is an error row that states its error once: the
    // declared code and message of the engine's first diagnostic. It has no
    // page, snapshot or diagnostics to add.
    if r.status == "error" {
        let first = diagnostics.first();
        let code = first
            .and_then(|diagnostic| diagnostic["code"].as_str())
            .map_or("executionFailed", super::engine_error_code);
        let message = first
            .and_then(|diagnostic| diagnostic["message"].as_str())
            .unwrap_or("The syntax tree could not be built.");
        return Ok(
            json!({"operation":"syntaxTree","path":display_path,"status":"error","errorCode":code,"error":message}),
        );
    }
    let complete = r.status == "ok" && !more;
    let pagination =
        crate::response::pages::PageFacts::open(usize_of(page), q.page_size().map(usize_of), more)
            .with_total(usize_of(r.total_nodes))
            .to_value();
    let mut out = json!({"operation":"syntaxTree","path":display_path,"nodes":nodes,"returnedBytes":node_bytes,"snapshot":snapshot,"isPartial":!complete,
        "pagination":pagination});
    if more {
        out["pagination"]["nextPage"] = json!(page + 1);
    }
    if !diagnostics.is_empty() {
        out["diagnostics"] = json!(diagnostics);
    }
    if more {
        let mut nq = serde_json::to_value(q).unwrap_or_default();
        if let Some(map) = nq.as_object_mut() {
            map.retain(|_, value| !value.is_null());
        }
        nq["snapshot"] = json!(snapshot);
        nq["page"] = json!(page + 1);
        out["next"] = json!({"nextPage":crate::tools::result::Continuation::new(ToolId::AstSearch, nq).confidence("exact").build()})
    } else if r.status == "partial" {
        out["terminalLimit"] = json!(true)
    }
    Ok(out)
}
/// Nodes read from the engine per call while a window-sized page is cut.
const NODE_CHUNK: u32 = 100_000;

fn node_page_row(n: &octocode_engine::structural::SyntaxTreeNode) -> String {
    node_row(
        n.id,
        &n.kind,
        n.named,
        [n.start_line, n.start_column, n.end_line, n.end_column],
        n.parent_id,
    )
}

/// Characters a node adds to its page: its row and its `returnedBytes` entry.
fn node_page_chars(n: &octocode_engine::structural::SyntaxTreeNode) -> usize {
    crate::tools::stream_page::json_text_chars(&node_page_row(n))
        + crate::tools::stream_page::json_text_chars(&format!("{}-{}", n.start_byte, n.end_byte))
        + 2
}

/// One node as `"<id> <kind> <startLine>:<startColumn>-<endLine>:<endColumn>
/// ^<parentId>"` (1-based lines and columns, end exclusive). An anonymous token's kind
/// is quoted (`"("`), as tree-sitter prints it; the root has no parent.
fn node_row(id: u32, kind: &str, named: bool, span: [u32; 4], parent: Option<u32>) -> String {
    let [start_line, start_column, end_line, end_column] = span;
    let kind = if named {
        kind.to_owned()
    } else {
        format!("\"{kind}\"")
    };
    // 1-based lines and columns; the end stays exclusive.
    let (start_column, end_column) = (
        crate::tools::num::one_based_column(start_column),
        crate::tools::num::one_based_column(end_column),
    );
    let mut row = format!("{id} {kind} {start_line}:{start_column}-{end_line}:{end_column}");
    if let Some(parent) = parent {
        row.push_str(&format!(" ^{parent}"));
    }
    row
}

//! Bounded, paginated tree-sitter syntax-tree inspection.
//!
//! This is deliberately a view over the structural parser's existing grammar
//! registry. It does not retain a parser or source snapshot between pages; the
//! caller supplies the same content and asks for the next preorder offset.

use std::time::Instant;

use tree_sitter::Node;

use crate::signatures::extractor::AST_EXECUTION_TIMEOUT;
use crate::text::file_extension::extension_of;
use crate::text::utf8_offsets::LineIndex;

use super::octo::parse_tree_with_deadline;
use super::types::StructuralDiagnostic;
use crate::signatures::languages;

const MAX_SYNTAX_TREE_NODES: usize = 1_000_000;
const DEFAULT_NODE_LIMIT: usize = 1_000;
const MAX_NODE_LIMIT: usize = 100_000;

#[derive(Clone, Debug, Default)]
pub struct SyntaxTreeInspectOptions {
    pub named_only: Option<bool>,
    pub node_offset: Option<u32>,
    pub node_limit: Option<u32>,
    /// 1-based line: the walk starts at the smallest node (named, with
    /// `named_only`) covering that line's text instead of the file root.
    pub line: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct SyntaxTreeNode {
    pub id: u32,
    pub parent_id: Option<u32>,
    pub kind: String,
    pub named: bool,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub start_byte: u32,
    pub end_byte: u32,
}

#[derive(Clone)]
pub struct SyntaxTreeInspectResult {
    pub nodes: Vec<SyntaxTreeNode>,
    pub total_nodes: u32,
    pub next_offset: Option<u32>,
    pub status: String,
    pub diagnostics: Vec<StructuralDiagnostic>,
}

struct Pending<'tree> {
    node: Node<'tree>,
    included_parent: Option<u32>,
}

fn diagnostic(
    code: &str,
    severity: &str,
    stage: &str,
    message: impl Into<String>,
    path: &str,
) -> StructuralDiagnostic {
    StructuralDiagnostic::new(code, severity, stage, message).with_path(path)
}

/// Inspect a bounded preorder view of the syntax tree, parsed with the
/// grammar of `extension` (default: the path's own). IDs are assigned only to
/// emitted nodes, so `named_only` pages remain contiguous and parent IDs
/// always point to the nearest emitted ancestor.
pub fn inspect_with_extension(
    content: &str,
    file_path: &str,
    extension: Option<&str>,
    options: Option<SyntaxTreeInspectOptions>,
) -> SyntaxTreeInspectResult {
    inspect_bounded(
        content,
        file_path,
        extension,
        options,
        MAX_SYNTAX_TREE_NODES,
    )
}

/// [`inspect_with_extension`] with the walk's node budget as a parameter.
fn inspect_bounded(
    content: &str,
    file_path: &str,
    extension: Option<&str>,
    options: Option<SyntaxTreeInspectOptions>,
    max_nodes: usize,
) -> SyntaxTreeInspectResult {
    let options = options.unwrap_or_default();
    let named_only = options.named_only.unwrap_or(false);
    let offset = options.node_offset.unwrap_or(0) as usize;
    let requested_limit = options.node_limit.unwrap_or(DEFAULT_NODE_LIMIT as u32) as usize;
    if requested_limit == 0 {
        return SyntaxTreeInspectResult {
            nodes: Vec::new(),
            total_nodes: 0,
            next_offset: None,
            status: "error".to_owned(),
            diagnostics: vec![diagnostic(
                "syntaxTree.options.invalidLimit",
                "error",
                "options",
                "nodeLimit must be greater than zero",
                file_path,
            )],
        };
    }
    let limit = requested_limit.min(MAX_NODE_LIMIT);
    let ext = extension
        .map(str::to_owned)
        .unwrap_or_else(|| extension_of(file_path, true, "txt"));

    if content.len() > crate::signatures::MAX_PARSE_SIZE {
        return SyntaxTreeInspectResult {
            nodes: Vec::new(),
            total_nodes: 0,
            next_offset: None,
            status: "error".to_owned(),
            diagnostics: vec![diagnostic(
                "syntaxTree.content.tooLarge",
                "error",
                "parse",
                format!(
                    "Syntax-tree content exceeds {} byte limit",
                    crate::signatures::MAX_PARSE_SIZE
                ),
                file_path,
            )],
        };
    }

    let Some(entry) = languages::find_entry(&ext) else {
        return SyntaxTreeInspectResult {
            nodes: Vec::new(),
            total_nodes: 0,
            next_offset: None,
            status: "error".to_owned(),
            diagnostics: vec![diagnostic(
                "syntaxTree.language.unsupported",
                "error",
                "parse",
                format!("No registered tree-sitter grammar for .{ext} files"),
                file_path,
            )],
        };
    };

    let deadline = Instant::now() + AST_EXECUTION_TIMEOUT;
    let tree = match parse_tree_with_deadline(&entry.language, content, deadline) {
        Ok(tree) => tree,
        Err(error) => {
            return SyntaxTreeInspectResult {
                nodes: Vec::new(),
                total_nodes: 0,
                next_offset: None,
                status: "error".to_owned(),
                diagnostics: vec![diagnostic(
                    error.code,
                    "error",
                    error.stage,
                    error.message,
                    file_path,
                )],
            };
        }
    };

    let line_index = LineIndex::tree_sitter(content);
    let mut line_note = None;
    let root = match options.line {
        None => tree.root_node(),
        Some(line) => match line_node(tree.root_node(), content, line, named_only) {
            Some(LineRoot::Covering(node)) => node,
            Some(LineRoot::Blank { node, note }) => {
                line_note = Some(diagnostic(
                    "syntaxTree.options.lineBlank",
                    "warning",
                    "options",
                    note,
                    file_path,
                ));
                node
            }
            None => {
                return SyntaxTreeInspectResult {
                    nodes: Vec::new(),
                    total_nodes: 0,
                    next_offset: None,
                    status: "error".to_owned(),
                    diagnostics: vec![diagnostic(
                        "syntaxTree.options.lineOutOfRange",
                        "error",
                        "options",
                        format!("line {line} is past the end of the file"),
                        file_path,
                    )],
                };
            }
        },
    };
    let mut pending = vec![Pending {
        node: root,
        included_parent: None,
    }];
    // Only the requested window is materialized; every included node still gets
    // its preorder id so ids, parents and `total_nodes` are page-independent.
    let window_start = offset;
    let window_end = offset.saturating_add(limit);
    let mut page_nodes = Vec::with_capacity(limit.min(1_000));
    let mut next_id: usize = 0;
    let mut cursor = tree.walk();
    let mut children = Vec::new();
    let mut status = if tree.root_node().has_error() {
        "partial".to_owned()
    } else {
        "ok".to_owned()
    };
    let mut diagnostics = if tree.root_node().has_error() {
        vec![diagnostic(
            "syntaxTree.parse.recovered",
            "warning",
            "parse",
            "Tree-sitter recovered from one or more syntax errors",
            file_path,
        )]
    } else {
        Vec::new()
    };
    diagnostics.extend(line_note);

    while let Some(Pending {
        node,
        included_parent,
    }) = pending.pop()
    {
        if Instant::now() >= deadline {
            status = "partial".to_owned();
            diagnostics.push(diagnostic(
                "syntaxTree.budget.deadline",
                "warning",
                "walk",
                "Syntax-tree traversal exceeded its execution deadline",
                file_path,
            ));
            break;
        }
        let included = !named_only || node.is_named();
        let next_parent = if included {
            if next_id >= max_nodes {
                status = "partial".to_owned();
                diagnostics.push(diagnostic(
                    "syntaxTree.budget.nodeLimit",
                    "warning",
                    "walk",
                    format!("Syntax-tree traversal reached the {max_nodes} node limit"),
                    file_path,
                ));
                break;
            }
            let id = next_id as u32;
            if (window_start..window_end).contains(&next_id) {
                let start = line_index.byte_to_position(content, node.start_byte() as u32);
                let end = line_index.byte_to_position(content, node.end_byte() as u32);
                page_nodes.push(SyntaxTreeNode {
                    id,
                    parent_id: included_parent,
                    kind: node.kind().to_owned(),
                    named: node.is_named(),
                    start_line: start.0 + 1,
                    start_column: start.1,
                    end_line: end.0 + 1,
                    end_column: end.1,
                    start_byte: node.start_byte().min(u32::MAX as usize) as u32,
                    end_byte: node.end_byte().min(u32::MAX as usize) as u32,
                });
            }
            next_id += 1;
            Some(id)
        } else {
            included_parent
        };

        // Push children in reverse source order so the stack visits preorder.
        // One reused cursor: `node.child(i)` scans siblings linearly (O(k²)).
        children.clear();
        children.extend(node.children(&mut cursor));
        pending.extend(children.drain(..).rev().map(|child| Pending {
            node: child,
            included_parent: next_parent,
        }));
    }

    let total_nodes = next_id.min(u32::MAX as usize) as u32;
    let end = window_end.min(next_id);
    // Every numbered node pages, whether the walk finished, recovered from
    // syntax errors, or stopped at its deadline or node budget; only nodes
    // past a budget stop are unknown.
    let next_offset = (end < next_id).then_some(end as u32);
    SyntaxTreeInspectResult {
        nodes: page_nodes,
        total_nodes,
        next_offset,
        status,
        diagnostics,
    }
}

/// Where a `line` roots the walk.
enum LineRoot<'tree> {
    /// The smallest node covering the line's text.
    Covering(Node<'tree>),
    /// A blank line has no text to cover: the item after it inside the node
    /// enclosing it (else the item before it, else that node), with a note
    /// that says which node the tree starts at.
    Blank { node: Node<'tree>, note: String },
}

/// The smallest node (named, with `named_only`) covering the text of
/// 1-based `line`, without its surrounding whitespace; for a blank line, the
/// nearest item inside the node enclosing it; `None` past the end.
fn line_node<'tree>(
    root: Node<'tree>,
    content: &str,
    line: u32,
    named_only: bool,
) -> Option<LineRoot<'tree>> {
    let index = usize::try_from(line.checked_sub(1)?).ok()?;
    let start = if index == 0 {
        0
    } else {
        content
            .match_indices('\n')
            .nth(index - 1)
            .map(|(offset, _)| offset + 1)?
    };
    if start > content.len() || (start == content.len() && index > 0) {
        return None;
    }
    let end = content[start..]
        .find('\n')
        .map_or(content.len(), |offset| start + offset);
    let text = &content[start..end];
    if text.trim().is_empty() {
        return Some(blank_line_root(root, start, end, line));
    }
    let from = start + (text.len() - text.trim_start().len());
    let to = (end - (text.len() - text.trim_end().len())).max(from);
    let node = if named_only {
        root.named_descendant_for_byte_range(from, to)
    } else {
        root.descendant_for_byte_range(from, to)
    }?;
    Some(LineRoot::Covering(node))
}

/// The root of a walk asked for blank `line` (bytes `start..end`): the
/// smallest node strictly enclosing the line, then the first named child
/// (comments and annotations aside) starting after it, else the last one
/// ending before it.
fn blank_line_root(root: Node<'_>, start: usize, end: usize, line: u32) -> LineRoot<'_> {
    let mut cursor = root.walk();
    let mut enclosing = root;
    while let Some(inner) = enclosing
        .named_children(&mut cursor)
        .find(|child| child.start_byte() < start && child.end_byte() > end)
    {
        enclosing = inner;
    }
    // Comments are extras, and an attribute or decorator that is a sibling
    // annotates the item after it: neither is an item, so the tree starts at
    // the item itself.
    let children = enclosing
        .named_children(&mut cursor)
        .filter(|child| {
            !child.is_extra() && !crate::signatures::extractor::is_annotation_kind(child.kind())
        })
        .collect::<Vec<_>>();
    let next = children.iter().find(|child| child.start_byte() >= end);
    let previous = children
        .iter()
        .rev()
        .find(|child| child.end_byte() <= start);
    let (node, side) = match (next, previous) {
        (Some(node), _) => (*node, "the next item"),
        (None, Some(node)) => (*node, "the item before it"),
        (None, None) => (enclosing, "the node enclosing it"),
    };
    let note = format!(
        "line {line} is blank; the tree starts at {side}, {} at line {}",
        node.kind(),
        node.start_position().row + 1
    );
    LineRoot::Blank { node, note }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inspect_source(
        source: &str,
        path: &str,
        options: Option<SyntaxTreeInspectOptions>,
    ) -> SyntaxTreeInspectResult {
        inspect_with_extension(source, path, None, options)
    }

    #[test]
    fn full_tree_is_preorder_and_unicode_columns_are_utf16() {
        let result = inspect_source("const 😀 = 1;\n", "x.ts", None);
        assert_eq!(result.status, "ok");
        assert!(result.nodes.windows(2).all(|pair| pair[0].id < pair[1].id));
        let identifier = result
            .nodes
            .iter()
            .find(|node| node.kind == "identifier")
            .expect("identifier");
        assert_eq!(identifier.start_column, 6);
    }

    /// `line` roots the walk at the smallest node covering that line's
    /// text: a statement inside a body, or the declaration its header line
    /// opens; a line past the end is an options error.
    #[test]
    fn a_line_roots_the_tree_at_the_node_covering_it() {
        let source = "const a = 1;\nfunction f(x: number) {\n  return x + a;\n}\n";
        let at = |line| {
            inspect_source(
                source,
                "x.ts",
                Some(SyntaxTreeInspectOptions {
                    named_only: Some(true),
                    line: Some(line),
                    ..Default::default()
                }),
            )
        };
        let body = at(3);
        assert_eq!(body.status, "ok");
        assert_eq!(body.nodes[0].kind, "return_statement");
        assert_eq!(body.nodes[0].parent_id, None);
        assert!(body.nodes.iter().all(|node| node.start_line == 3));
        let header = at(2);
        assert_eq!(header.nodes[0].kind, "function_declaration");
        assert_eq!(header.nodes[0].end_line, 4);
        let past = at(9);
        assert_eq!(past.status, "error");
        assert_eq!(
            past.diagnostics[0].code,
            "syntaxTree.options.lineOutOfRange"
        );
    }

    /// A blank line covers no text: the tree starts at the next item inside
    /// the node enclosing the line (else the item before it), and a warning
    /// names that node instead of silently rooting at the file.
    #[test]
    fn a_blank_line_roots_at_the_nearest_item_and_says_so() {
        let source =
            "const a = 1;\n\n// doc\nfunction f(x: number) {\n  const y = x;\n\n  return y;\n}\n\n";
        let at = |line| {
            inspect_source(
                source,
                "x.ts",
                Some(SyntaxTreeInspectOptions {
                    named_only: Some(true),
                    line: Some(line),
                    ..Default::default()
                }),
            )
        };
        let between = at(2);
        assert_eq!(between.status, "ok");
        assert_eq!(between.nodes[0].kind, "function_declaration");
        assert_eq!(between.nodes[0].start_line, 4);
        let note = &between.diagnostics[0];
        assert_eq!(note.code, "syntaxTree.options.lineBlank");
        assert_eq!(note.severity, "warning");
        assert!(note.message.contains("line 2 is blank"), "{}", note.message);
        let in_body = at(6);
        assert_eq!(in_body.nodes[0].kind, "return_statement");
        let trailing = at(9);
        assert_eq!(trailing.nodes[0].kind, "function_declaration");
        assert!(
            trailing.diagnostics[0]
                .message
                .contains("the item before it")
        );
    }

    /// Attributes are siblings of the Rust item they annotate: a blank line
    /// before them roots at the item, not at its first attribute.
    #[test]
    fn a_blank_line_before_attributes_roots_at_the_annotated_item() {
        let source = "use std::fmt;\n\n/// Doc.\n#[derive(Clone, Copy, Debug)]\n#[non_exhaustive]\npub enum MatchQuery {\n    A,\n}\n";
        let result = inspect_source(
            source,
            "x.rs",
            Some(SyntaxTreeInspectOptions {
                named_only: Some(true),
                line: Some(2),
                ..Default::default()
            }),
        );
        assert_eq!(result.status, "ok");
        assert_eq!(result.nodes[0].kind, "enum_item");
        assert_eq!(result.nodes[0].start_line, 6);
        assert!(
            result.diagnostics[0]
                .message
                .contains("enum_item at line 6"),
            "{}",
            result.diagnostics[0].message
        );
    }

    #[test]
    fn named_only_reparents_around_punctuation() {
        let result = inspect_source(
            "foo(1);",
            "x.ts",
            Some(SyntaxTreeInspectOptions {
                named_only: Some(true),
                node_offset: None,
                line: None,
                node_limit: Some(100),
            }),
        );
        assert_eq!(result.status, "ok");
        assert!(result.nodes.iter().all(|node| node.named));
        assert!(
            result
                .nodes
                .iter()
                .skip(1)
                .all(|node| node.parent_id.is_some())
        );
    }

    #[test]
    fn pages_cover_the_same_fixture() {
        let source = "function f(a) { return a + 1; }";
        let all = inspect_source(
            source,
            "x.ts",
            Some(SyntaxTreeInspectOptions {
                named_only: Some(false),
                node_offset: None,
                line: None,
                node_limit: Some(1000),
            }),
        );
        let mut ids = Vec::new();
        let mut offset = 0;
        loop {
            let page = inspect_source(
                source,
                "x.ts",
                Some(SyntaxTreeInspectOptions {
                    named_only: Some(false),
                    node_offset: Some(offset),
                    line: None,
                    node_limit: Some(2),
                }),
            );
            ids.extend(page.nodes.into_iter().map(|node| node.id));
            match page.next_offset {
                Some(next) => offset = next,
                None => break,
            }
        }
        assert_eq!(ids.len(), all.total_nodes as usize);
        assert_eq!(ids, (0..all.total_nodes).collect::<Vec<_>>());
    }

    #[test]
    fn a_node_budget_stop_still_pages_every_walked_node() {
        // Nodes the walk numbered before the budget stop stay reachable page
        // by page; only nodes past the budget are a terminal limit.
        let source = "const a = 1; const b = 2; const c = 3; const d = 4;";
        let budget = 10;
        let page = |offset| {
            inspect_bounded(
                source,
                "x.ts",
                None,
                Some(SyntaxTreeInspectOptions {
                    named_only: Some(false),
                    node_offset: Some(offset),
                    line: None,
                    node_limit: Some(3),
                }),
                budget,
            )
        };
        let mut ids = Vec::new();
        let mut offset = 0;
        let last = loop {
            let result = page(offset);
            assert_eq!(result.status, "partial");
            assert_eq!(result.total_nodes as usize, budget);
            ids.extend(result.nodes.iter().map(|node| node.id));
            match result.next_offset {
                Some(next) => offset = next,
                None => break result,
            }
        };
        assert_eq!(ids, (0..budget as u32).collect::<Vec<_>>());
        let stop = last
            .diagnostics
            .iter()
            .find(|d| d.code == "syntaxTree.budget.nodeLimit")
            .expect("budget diagnostic");
        // The engine names no tool or contract field: the runtime words
        // the recovery by code.
        assert_eq!(stop.recovery, None);
    }

    /// A diagnostic names a recovery only when it has one that fits it: a
    /// failed or recovered parse is not fixed by paging.
    #[test]
    fn parse_diagnostics_carry_no_paging_recovery() {
        let unsupported = inspect_source("hello", "x.unknown", None);
        let recovered = inspect_source("const b = ;\n", "broken.ts", None);
        let diagnostics = unsupported.diagnostics.iter().chain(&recovered.diagnostics);
        assert_eq!(diagnostics.clone().count(), 2);
        for diagnostic in diagnostics {
            assert!(
                diagnostic.recovery.is_none(),
                "{}: {:?}",
                diagnostic.code,
                diagnostic.recovery
            );
        }
    }

    #[test]
    fn unsupported_extension_is_an_explicit_error() {
        let result = inspect_source("hello", "x.unknown", None);
        assert_eq!(result.status, "error");
        assert_eq!(
            result.diagnostics[0].code,
            "syntaxTree.language.unsupported"
        );
    }

    #[test]
    fn deeply_nested_input_uses_iterative_walk() {
        let source = format!("{}0{}", "[".repeat(2_000), "]".repeat(2_000));
        let result = inspect_source(
            &source,
            "x.ts",
            Some(SyntaxTreeInspectOptions {
                named_only: Some(false),
                node_offset: None,
                line: None,
                node_limit: Some(100_000),
            }),
        );
        assert!(matches!(result.status.as_str(), "ok" | "partial"));
        assert!(!result.nodes.is_empty());
    }

    #[test]
    fn recovered_files_still_paginate() {
        // One syntax error must not freeze paging at page 1: `partial` from
        // recovery is not a budget truncation.
        let source = "const a = 1;\nconst b = ;\nconst c = 3;\nconst d = 4;\n";
        let page = |offset| {
            inspect_source(
                source,
                "broken.ts",
                Some(SyntaxTreeInspectOptions {
                    named_only: Some(true),
                    node_offset: Some(offset),
                    line: None,
                    node_limit: Some(3),
                }),
            )
        };
        let first = page(0);
        assert_eq!(first.status, "partial");
        assert_eq!(first.nodes.len(), 3);
        let next = first.next_offset.expect("continuation for recovered file");
        assert_eq!(next, 3);
        let second = page(next);
        assert_eq!(second.nodes[0].id, 3);
        assert_eq!(second.total_nodes, first.total_nodes);
        // Parent links still point at earlier preorder ids across pages.
        assert!(
            second
                .nodes
                .iter()
                .all(|node| node.parent_id.is_none_or(|p| p < node.id))
        );
    }
}

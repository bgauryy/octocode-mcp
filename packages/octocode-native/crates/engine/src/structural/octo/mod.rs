use std::collections::HashMap;
use std::time::Instant;

use crate::signatures::extractor::AST_EXECUTION_TIMEOUT;

use super::language::AgLanguage;
use super::query::StructuralQuery;
use super::types::StructuralDiagnostic;

mod line_index_support;
mod matching;
mod pattern;
mod rule;

pub(super) use matching::{ExecutionError, named_children, node_text, parse_tree_with_deadline};
pub use rule::EXAMPLE_RULE;
pub(super) use rule::{RawRule, parse_rule};

#[cfg(test)]
pub(super) use matching::INTERRUPT_NEXT_COMPILE_PARSE;

use super::macro_bodies::MacroBodies;
use super::query::Prefilter;
use crate::text::utf8_offsets::LineIndex;
use line_index_support::{to_structural_match, to_structural_match_with_index};
use matching::{
    CandidateVisitor, CaptureEnv, MatchWithKind, collect_kind_matches, visit_named_expanding_macros,
};
use pattern::CompiledPattern;
pub use rule::RULE_INVALID;
use rule::{CompiledRule, Document};

#[cfg(test)]
use matching::{SECONDARY_CAPTURE, parse_tree, visit_named};
#[cfg(test)]
use rule::RULE_PARSE_COUNT;

#[cfg(test)]
use super::types::StructuralMatch;

pub(super) type OctoCompiledMatcher =
    Box<dyn Fn(&str) -> Result<Vec<MatchWithKind>, ExecutionError> + Send + Sync>;

pub(super) fn compile_matcher(
    lang: &AgLanguage,
    query: &StructuralQuery<'_>,
) -> Result<OctoCompiledMatcher, String> {
    compile_matcher_inner(lang, query).map_err(|message| {
        if message.starts_with("[structural.") {
            message
        } else {
            format!("[structural.query.compileFailed] {message}")
        }
    })
}

/// The diagnostic of a query that does not compile: a rule that does not
/// parse as a rule is [`RULE_INVALID`], a rule or pattern this grammar
/// cannot compile is `structural.query.compileFailed`.
pub(super) fn compile_diagnostic(message: &str) -> StructuralDiagnostic {
    if message.starts_with(&format!("[{RULE_INVALID}] ")) {
        StructuralDiagnostic::new(RULE_INVALID, "error", "match", message.to_owned())
            .with_recovery("Fix the rule object: the message names the key or value it rejects.")
    } else {
        StructuralDiagnostic::new(
            "structural.query.compileFailed",
            "error",
            "match",
            message.to_owned(),
        )
        .with_recovery(
            "Check the structural pattern or YAML rule against this file's language grammar.",
        )
    }
}

fn compile_matcher_inner(
    lang: &AgLanguage,
    query: &StructuralQuery<'_>,
) -> Result<OctoCompiledMatcher, String> {
    let language = lang.tree_sitter_language();
    let anchors = match query.prefilter() {
        Prefilter::None => None,
        Prefilter::Single(anchor) => Some(vec![anchor]),
        Prefilter::Union(anchors) => Some(anchors),
    };
    let macros = MacroBodies::for_language(&language, anchors);
    match query.parts() {
        (Some(pattern), None) if is_document_probe(pattern) => Ok(Box::new(move |content| {
            let deadline = match_deadline(content);
            parse_tree_with_deadline(&language, content, deadline).map(|tree| {
                let root = tree.root_node();
                vec![MatchWithKind::new(
                    root,
                    to_structural_match(root, content, HashMap::new(), HashMap::new()),
                )]
            })
        })),
        (Some(pattern), None) => {
            let compiled = CompiledPattern::new(lang, pattern)?;
            Ok(Box::new(move |content| {
                let deadline = match_deadline(content);
                if compiled.is_special() {
                    return compiled.find_special_matches(content, deadline);
                }

                let tree = parse_tree_with_deadline(compiled.language(), content, deadline)?;
                let line_index = LineIndex::tree_sitter(content);
                let mut matches = Vec::new();
                let visit: &mut CandidateVisitor<'_> = &mut |candidate, _, _| {
                    if !compiled.matches_candidate(candidate) {
                        return Ok(());
                    }
                    let mut captures = CaptureEnv::default();
                    if compiled.matches(candidate, content, &mut captures, deadline)? {
                        let (values, ranges) = captures.into_maps();
                        matches.push(MatchWithKind::new(
                            candidate,
                            to_structural_match_with_index(
                                candidate,
                                content,
                                &line_index,
                                values,
                                ranges,
                            ),
                        ));
                    }
                    Ok(())
                };
                visit_named_expanding_macros(
                    tree.root_node(),
                    content,
                    compiled.language(),
                    macros.as_ref(),
                    deadline,
                    visit,
                )?;
                Ok(matches)
            }))
        }
        (None, Some(_)) => {
            let compiled = CompiledRule::compile(lang, query.parsed_rule()?)?;
            let language = lang.tree_sitter_language();
            if let Some(kind) = compiled.simple_kind().map(str::to_owned) {
                return Ok(Box::new(move |content| {
                    let deadline = match_deadline(content);
                    let tree = parse_tree_with_deadline(&language, content, deadline)?;
                    collect_kind_matches(
                        tree.root_node(),
                        &kind,
                        content,
                        &language,
                        macros.as_ref(),
                        deadline,
                    )
                }));
            }
            Ok(Box::new(move |content| {
                let deadline = match_deadline(content);
                let tree = parse_tree_with_deadline(&language, content, deadline)?;
                let line_index = LineIndex::tree_sitter(content);
                let mut matches = Vec::new();
                visit_named_expanding_macros(
                    tree.root_node(),
                    content,
                    &language,
                    macros.as_ref(),
                    deadline,
                    &mut |candidate, ancestors, root| {
                        if !compiled.matches_candidate(candidate) {
                            return Ok(());
                        }
                        let document = Document {
                            content,
                            deadline,
                            root,
                        };
                        let mut captures = CaptureEnv::default();
                        if compiled.matches(candidate, Some(ancestors), &document, &mut captures)? {
                            let (values, ranges) = captures.into_maps();
                            matches.push(MatchWithKind::new(
                                candidate,
                                to_structural_match_with_index(
                                    candidate,
                                    content,
                                    &line_index,
                                    values,
                                    ranges,
                                ),
                            ));
                        }
                        Ok(())
                    },
                )?;
                Ok(matches)
            }))
        }
        _ => unreachable!("StructuralQuery validates the query shape"),
    }
}

/// How long matching may take on a source of `len` bytes: the shared parse
/// budget, plus one more per whole MiB, so a large source (the parse limit
/// is 8 MiB) is not cut nondeterministically by a small file's budget. A cut
/// match discards the file's matches, and no page resumes inside a file.
pub(super) fn match_budget(len: usize) -> std::time::Duration {
    let extra = u32::try_from(len >> 20).unwrap_or(u32::MAX);
    AST_EXECUTION_TIMEOUT.saturating_mul(extra.saturating_add(1))
}

/// The match deadline of `content`, from now (see [`match_budget`]).
pub(super) fn match_deadline(content: &str) -> Instant {
    Instant::now() + match_budget(content.len())
}

fn is_document_probe(pattern: &str) -> bool {
    pattern.trim() == "$$$"
}

#[cfg(test)]
#[path = "../octo_tests.rs"]
mod tests;

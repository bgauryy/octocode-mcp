use std::time::Instant;

use regex::Regex;
use serde::Deserialize;
use serde::de::IgnoredAny;
use tree_sitter::Node;

use crate::structural::kinds::named_kind_id;
use crate::structural::language::AgLanguage;

use super::error::CompileError;
use super::matching::{
    CandidatePlan, CaptureEnv, ExecutionError, SECONDARY_CAPTURE, ancestors_from_root,
    named_children, node_text, raw_range,
};
use super::pattern::CompiledPattern;

/// A wrapped rule document. Besides `rule`, it tolerates the metadata keys
/// of an ast-grep rule file (`id`, `language`, `severity`, …) so a pasted
/// rule file runs as-is; none of them affects matching (`langType` selects
/// the grammar). Any other key, like an unsupported `constraints`/`fix`,
/// still fails with the list of supported fields.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRuleDocument {
    rule: RawRule,
    #[serde(rename = "id")]
    _id: Option<IgnoredAny>,
    #[serde(rename = "language")]
    _language: Option<IgnoredAny>,
    #[serde(rename = "severity")]
    _severity: Option<IgnoredAny>,
    #[serde(rename = "message")]
    _message: Option<IgnoredAny>,
    #[serde(rename = "note")]
    _note: Option<IgnoredAny>,
    #[serde(rename = "url")]
    _url: Option<IgnoredAny>,
    #[serde(rename = "metadata")]
    _metadata: Option<IgnoredAny>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::structural) struct RawRule {
    kind: Option<String>,
    pub(in crate::structural) pattern: Option<String>,
    regex: Option<String>,
    pub(in crate::structural) has: Option<Box<Self>>,
    pub(in crate::structural) inside: Option<Box<Self>>,
    pub(in crate::structural) all: Option<Vec<Self>>,
    pub(in crate::structural) any: Option<Vec<Self>>,
    not: Option<Box<Self>>,
    #[serde(rename = "stopBy")]
    stop_by: Option<RawStopBy>,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum RawStopBy {
    End,
}

pub(super) struct CompiledRule {
    kind: Option<String>,
    pattern: Option<CompiledPattern>,
    regex: Option<Regex>,
    has: Option<Box<Self>>,
    inside: Option<Box<Self>>,
    all: Vec<Self>,
    any: Vec<Self>,
    not: Option<Box<Self>>,
    stop_by_end: bool,
    pub(super) candidate_plan: CandidatePlan,
}

/// The engine tag of a rule that does not parse as a rule (malformed YAML,
/// an unknown key, no matcher, a bad regex); a rule naming what this
/// grammar cannot compile is `structural.query.compileFailed`.
pub const RULE_INVALID: &str = "structural.rule.invalid";

pub(in crate::structural) fn parse_rule(rule: &str) -> Result<RawRule, CompileError> {
    #[cfg(test)]
    RULE_PARSE_COUNT.with(|count| count.set(count.get() + 1));
    if rule.len() > 64_000 {
        return Err(CompileError::rule(
            "structural rule exceeds 64000 byte limit",
        ));
    }
    let value = crate::text::yaml_utils::yaml_to_json(rule).map_err(|err| yaml_error(&err))?;
    let wrapped = value
        .as_object()
        .is_some_and(|mapping| mapping.contains_key("rule"));
    let raw: RawRule = if wrapped {
        serde_json::from_value::<RawRuleDocument>(value)
            .map_err(|err| yaml_error(&err))?
            .rule
    } else {
        serde_json::from_value(value).map_err(|err| yaml_error(&err))?
    };
    validate_rule_depth(&raw, 0)?;
    Ok(raw)
}

/// One valid rule object: how a relational key (`has`, `inside`) combines with
/// `kind` and `stopBy`. Every rule error that lists the accepted keys shows it.
pub const EXAMPLE_RULE: &str =
    r#"{"kind":"class_declaration","has":{"kind":"extends_clause","stopBy":"end"}}"#;

/// A rule that does not deserialize. An unknown key lists the keys the rule
/// takes; the example shows how they combine, since the usual mistake is a
/// key from another matcher (`field`, `constraints`) that has no equivalent.
fn yaml_error(err: &impl std::fmt::Display) -> CompileError {
    let message = format!("invalid rule YAML: {err}");
    // Neither serde-saphyr nor serde_json has a typed accessor for an
    // unknown-field error; serde's own wording is the one thing to match, and
    // this is the only such site.
    if message.contains("unknown field") {
        CompileError::rule(format!("{message}. Example rule: {EXAMPLE_RULE}"))
    } else {
        CompileError::rule(message)
    }
}

#[cfg(test)]
thread_local! {
    pub(super) static RULE_PARSE_COUNT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

fn validate_rule_depth(rule: &RawRule, depth: usize) -> Result<(), CompileError> {
    if depth >= 64 {
        return Err(CompileError::rule(
            "structural rule exceeds 64 nesting levels",
        ));
    }
    for child in rule
        .all
        .iter()
        .flatten()
        .chain(rule.any.iter().flatten())
        .chain(rule.has.iter().map(Box::as_ref))
        .chain(rule.inside.iter().map(Box::as_ref))
        .chain(rule.not.iter().map(Box::as_ref))
    {
        validate_rule_depth(child, depth + 1)?;
    }
    Ok(())
}

/// Every `kind` in `rule` and its sub-rules names a node of `language`.
fn check_kinds(language: &tree_sitter::Language, rule: &RawRule) -> Result<(), CompileError> {
    if let Some(kind) = rule.kind.as_deref()
        && named_kind_id(language, kind).is_none()
    {
        return Err(CompileError::grammar(format!(
            "unknown node kind '{kind}' for this language grammar"
        )));
    }
    rule.all
        .iter()
        .flatten()
        .chain(rule.any.iter().flatten())
        .chain(rule.has.iter().map(Box::as_ref))
        .chain(rule.inside.iter().map(Box::as_ref))
        .chain(rule.not.iter().map(Box::as_ref))
        .try_for_each(|child| check_kinds(language, child))
}

impl CompiledRule {
    /// Accepts both the wrapped document form (`rule:\n  kind: ...`) and a bare
    /// rule (`kind: ...`). A top-level `rule` key is unambiguous: `RawRule` has
    /// no such field, so a bare rule can never contain one.
    #[cfg(test)]
    pub(super) fn new(lang: &AgLanguage, rule: &str) -> Result<Self, CompileError> {
        let raw = parse_rule(rule)?;
        Self::compile(lang, &raw)
    }

    /// Every `kind` of the rule, at any depth, is checked before any
    /// pattern parses: a kind this grammar lacks is named as itself, never
    /// hidden behind an error of a pattern beside it.
    pub(super) fn compile(lang: &AgLanguage, raw: &RawRule) -> Result<Self, CompileError> {
        check_kinds(&lang.tree_sitter_language(), raw)?;
        Self::compile_checked(lang, raw)
    }

    fn compile_checked(lang: &AgLanguage, raw: &RawRule) -> Result<Self, CompileError> {
        let pattern = raw
            .pattern
            .as_deref()
            .map(|pattern| CompiledPattern::new(lang, pattern))
            .transpose()?;
        let regex = raw
            .regex
            .as_deref()
            .map(Regex::new)
            .transpose()
            .map_err(|err| CompileError::rule(format!("invalid rule regex: {err}")))?;
        let has = raw
            .has
            .as_deref()
            .map(|rule| Self::compile_checked(lang, rule).map(Box::new))
            .transpose()?;
        let inside = raw
            .inside
            .as_deref()
            .map(|rule| Self::compile_checked(lang, rule).map(Box::new))
            .transpose()?;
        let all = raw
            .all
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|rule| Self::compile_checked(lang, rule))
            .collect::<Result<Vec<_>, _>>()?;
        let any = raw
            .any
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|rule| Self::compile_checked(lang, rule))
            .collect::<Result<Vec<_>, _>>()?;
        let not = raw
            .not
            .as_deref()
            .map(|rule| Self::compile_checked(lang, rule).map(Box::new))
            .transpose()?;

        let mut compiled = Self {
            kind: raw.kind.clone(),
            pattern,
            regex,
            has,
            inside,
            all,
            any,
            not,
            stop_by_end: raw.stop_by == Some(RawStopBy::End),
            candidate_plan: CandidatePlan::Any,
        };
        if compiled.is_empty() {
            return Err(CompileError::rule(
                "invalid rule: rule must contain at least one matcher",
            ));
        }
        compiled.candidate_plan = compiled.compute_candidate_plan();
        Ok(compiled)
    }

    fn is_empty(&self) -> bool {
        self.kind.is_none() && self.only_kind()
    }

    pub(super) fn simple_kind(&self) -> Option<&str> {
        let kind = self.kind.as_deref()?;
        self.only_kind().then_some(kind)
    }

    /// No matcher besides `kind` is set.
    fn only_kind(&self) -> bool {
        self.pattern.is_none()
            && self.regex.is_none()
            && self.has.is_none()
            && self.inside.is_none()
            && self.all.is_empty()
            && self.any.is_empty()
            && self.not.is_none()
    }

    fn compute_candidate_plan(&self) -> CandidatePlan {
        let mut plan = CandidatePlan::Any;
        if let Some(kind) = &self.kind {
            plan = plan.intersect(CandidatePlan::from_kind(kind.clone()));
        }
        if let Some(pattern) = &self.pattern {
            plan = plan.intersect(pattern.candidate_plan().clone());
        }
        for rule in &self.all {
            plan = plan.intersect(rule.candidate_plan.clone());
        }
        if !self.any.is_empty() {
            let any_plan =
                CandidatePlan::union(self.any.iter().map(|rule| rule.candidate_plan.clone()));
            plan = plan.intersect(any_plan);
        }
        plan
    }

    pub(super) fn matches_candidate(&self, candidate: Node<'_>) -> bool {
        self.candidate_plan.matches(candidate)
    }

    /// `ancestors` is the candidate's ancestor chain (root first, parent
    /// last) when the caller already has it; `None` recomputes it once from
    /// the document root, and only if an `inside` matcher needs it.
    pub(super) fn matches<'t>(
        &self,
        candidate: Node<'t>,
        ancestors: Option<&[Node<'t>]>,
        document: &Document<'_, 't>,
        captures: &mut CaptureEnv,
    ) -> Result<bool, ExecutionError> {
        ExecutionError::check(document.deadline)?;
        if !self.matches_candidate(candidate) {
            return Ok(false);
        }
        if let Some(kind) = &self.kind
            && candidate.kind() != kind
        {
            return Ok(false);
        }
        // Every matcher binds into `captures` directly; on failure everything
        // bound since this checkpoint is rolled back, so a `false` result
        // always leaves the caller's environment unchanged.
        let checkpoint = captures.checkpoint();
        if let Some(pattern) = &self.pattern
            && !pattern.matches(candidate, document.content, captures, document.deadline)?
        {
            captures.rollback(checkpoint);
            return Ok(false);
        }
        if let Some(regex) = &self.regex
            && !regex.is_match(node_text(candidate, document.content))
        {
            captures.rollback(checkpoint);
            return Ok(false);
        }
        if let Some(rule) = &self.has
            && !matches_descendant(rule, candidate, document, captures)?
        {
            captures.rollback(checkpoint);
            return Ok(false);
        }
        if let Some(rule) = &self.inside
            && !matches_ancestor(rule, candidate, ancestors, document, captures)?
        {
            captures.rollback(checkpoint);
            return Ok(false);
        }
        for rule in &self.all {
            if !rule.matches(candidate, ancestors, document, captures)? {
                captures.rollback(checkpoint);
                return Ok(false);
            }
        }
        if !self.any.is_empty() {
            let mut matched = false;
            for rule in &self.any {
                // A failed alternative rolls itself back (see above).
                if rule.matches(candidate, ancestors, document, captures)? {
                    matched = true;
                    break;
                }
            }
            if !matched {
                captures.rollback(checkpoint);
                return Ok(false);
            }
        }
        if let Some(rule) = &self.not {
            // `not` never contributes bindings, matched or not.
            let before_not = captures.checkpoint();
            let negated = rule.matches(candidate, ancestors, document, captures)?;
            captures.rollback(before_not);
            if negated {
                captures.rollback(checkpoint);
                return Ok(false);
            }
        }
        Ok(true)
    }
}

pub(super) struct Document<'a, 't> {
    pub(super) content: &'a str,
    pub(super) deadline: Instant,
    pub(super) root: Node<'t>,
}

fn matches_descendant<'t>(
    rule: &CompiledRule,
    candidate: Node<'t>,
    document: &Document<'_, 't>,
    captures: &mut CaptureEnv,
) -> Result<bool, ExecutionError> {
    let mut stack = named_children(candidate);
    stack.reverse();
    while let Some(child) = stack.pop() {
        ExecutionError::check(document.deadline)?;
        if rule.matches_candidate(child) && rule.matches(child, None, document, captures)? {
            captures.capture_replace(
                SECONDARY_CAPTURE,
                node_text(child, document.content).to_owned(),
                raw_range(child),
            );
            return Ok(true);
        }
        if rule.stop_by_end {
            stack.extend(named_children(child).into_iter().rev());
        }
    }
    Ok(false)
}

fn matches_ancestor<'t>(
    rule: &CompiledRule,
    candidate: Node<'t>,
    ancestors: Option<&[Node<'t>]>,
    document: &Document<'_, 't>,
    captures: &mut CaptureEnv,
) -> Result<bool, ExecutionError> {
    // One chain per candidate: `Node::parent()` searches down from the root on
    // every call, so walking `stopBy: end` with it was O(depth²) per candidate.
    let owned;
    let chain = match ancestors {
        Some(chain) => chain,
        None => {
            owned = ancestors_from_root(document.root, candidate, document.deadline)?;
            owned.as_slice()
        }
    };
    for index in (0..chain.len()).rev() {
        ExecutionError::check(document.deadline)?;
        let node = chain[index];
        if rule.matches_candidate(node)
            && rule.matches(node, Some(&chain[..index]), document, captures)?
        {
            captures.capture_replace(
                SECONDARY_CAPTURE,
                node_text(node, document.content).to_owned(),
                raw_range(node),
            );
            return Ok(true);
        }
        if !rule.stop_by_end {
            return Ok(false);
        }
    }
    Ok(false)
}

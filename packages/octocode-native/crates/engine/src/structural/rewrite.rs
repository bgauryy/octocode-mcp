use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::time::Instant;

use ast_grep_config::{Fixer, GlobalRules, RuleConfig, SerializableRuleConfig};
use ast_grep_core::{
    AstGrep,
    language::Language,
    matcher::{Matcher, Pattern, PatternBuilder, PatternError},
    meta_var::MetaVariable,
    replacer::Replacer,
    tree_sitter::{LanguageExt, StrDoc, TSLanguage},
};
use serde::{Deserialize, Deserializer, Serialize, de};
use serde_json::Value;

use crate::search::classify::{is_comment_kind, is_string_kind};
use crate::signatures::extractor::AST_EXECUTION_TIMEOUT;
use crate::signatures::languages::{LanguageEntry, all_entries};
use crate::text::utf8_offsets::LineIndex;

use super::kinds::named_kind_id;
use super::language::{AgLanguage, primary_expando_for_ext};
use super::layout::Layout;
use super::macro_bodies::{MAX_MACRO_DEPTH, MacroBodies, is_body_candidate, parse_body};
use super::octo::parse_tree_with_deadline;

pub const MAX_REWRITE_CONTENT_BYTES: usize = crate::signatures::MAX_PARSE_SIZE;
const MAX_REWRITE_MATCHES: usize = 100_000;

/// The ast-grep rewrite adapter uses Octocode's canonical grammar registry
/// rather than a second bundled language inventory.
#[derive(Clone)]
struct RewriteLanguage {
    entry: &'static LanguageEntry,
    extension: &'static str,
}

impl RewriteLanguage {
    fn from_selector(selector: &str) -> Option<Self> {
        let entry = all_entries()
            .iter()
            .find(|entry| matches_selector(entry, selector))?;
        let extension = entry
            .extensions
            .iter()
            .copied()
            .find(|ext| ext.eq_ignore_ascii_case(selector))
            .unwrap_or(entry.extensions[0]);
        Some(Self { entry, extension })
    }

    fn octocode_language(&self) -> AgLanguage {
        AgLanguage::new(self.extension, self.entry)
    }
}

fn matches_selector(entry: &LanguageEntry, selector: &str) -> bool {
    entry.name.eq_ignore_ascii_case(selector)
        || entry
            .language_id
            .is_some_and(|id| id.eq_ignore_ascii_case(selector))
        || entry
            .selector_aliases
            .iter()
            .any(|alias| alias.eq_ignore_ascii_case(selector))
        || entry
            .extensions
            .iter()
            .any(|ext| ext.eq_ignore_ascii_case(selector))
}

pub(super) fn rewrite_language_extensions(selector: &str) -> Option<HashSet<&'static str>> {
    let mut extensions: HashSet<&'static str> = all_entries()
        .iter()
        .filter(|entry| matches_selector(entry, selector))
        .flat_map(|entry| entry.extensions.iter().copied())
        .collect();
    if extensions.is_empty() {
        return None;
    }
    if selector.eq_ignore_ascii_case("cpp") || selector.eq_ignore_ascii_case("c++") {
        extensions.insert("h");
    }
    Some(extensions)
}

/// The parser a rewrite uses for `path` under `selector`: the file's own
/// extension when it belongs to the selector's family (`.tsx` under
/// `typescript` needs the TSX grammar), `.h` as C++ under `cpp`, else the
/// selector. Scanning and syntax-regression checks must agree on this, or JSX
/// files are error-counted with a grammar that rejects JSX.
pub fn rewrite_parser_for_path(selector: &str, path: &str) -> String {
    let extension = crate::text::file_extension::extension_of(path, true, "");
    if extension.is_empty() {
        return selector.to_owned();
    }
    let is_cpp = selector.eq_ignore_ascii_case("cpp") || selector.eq_ignore_ascii_case("c++");
    if extension == "h" && is_cpp {
        return "cpp".to_owned();
    }
    match rewrite_language_extensions(selector) {
        Some(extensions) if extensions.contains(extension.as_str()) => extension,
        _ => selector.to_owned(),
    }
}

impl fmt::Debug for RewriteLanguage {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.entry.name)
    }
}

impl<'de> Deserialize<'de> for RewriteLanguage {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let selector = String::deserialize(deserializer)?;
        Self::from_selector(&selector)
            .ok_or_else(|| de::Error::custom(format!("{selector} is not supported")))
    }
}

impl Language for RewriteLanguage {
    fn pre_process_pattern<'query>(&self, query: &'query str) -> Cow<'query, str> {
        self.octocode_language().preprocess_rewrite_pattern(query)
    }

    fn expando_char(&self) -> char {
        primary_expando_for_ext(self.extension)
    }

    /// `0` makes ast-grep reject kinds no parsed node can carry.
    fn kind_to_id(&self, kind: &str) -> u16 {
        named_kind_id(&self.entry.language, kind).unwrap_or(0)
    }

    fn field_to_id(&self, field: &str) -> Option<u16> {
        self.get_ts_language()
            .field_id_for_name(field)
            .map(std::num::NonZero::get)
    }

    fn build_pattern(&self, builder: &PatternBuilder) -> Result<Pattern, PatternError> {
        builder.build(|source| StrDoc::try_new(source, self.clone()))
    }
}

impl LanguageExt for RewriteLanguage {
    fn get_ts_language(&self) -> TSLanguage {
        self.entry.language.clone()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuralRewritePosition {
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuralRewriteRange {
    pub start: StructuralRewritePosition,
    pub end: StructuralRewritePosition,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuralRewriteCapture {
    pub kind: String,
    pub texts: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuralRewriteMatch {
    pub byte_start: u32,
    pub byte_end: u32,
    pub range: StructuralRewriteRange,
    pub text: String,
    pub replaced_text: String,
    pub replacement: String,
    pub captures: HashMap<String, StructuralRewriteCapture>,
}

/// Test helper: compile and run the canonical ast-grep inline-rule contract
/// on one content. `rule_config` is the complete inline rule object,
/// including language, rule, constraints, utils, transforms, fix, and
/// optional rewriters. Production compiles once with [`compile_rewrite`].
#[cfg(test)]
pub(crate) fn rewrite(
    content: &str,
    rule_config: Value,
) -> Result<Vec<StructuralRewriteMatch>, String> {
    compile_rewrite(rule_config)?.run(content)
}

/// A validated inline rule plus its single fixer. Compile once per request and
/// language, then `run` it on every file: deserializing and compiling the rule
/// per file dominated multi-file rewrites.
pub struct CompiledRewrite {
    config: RuleConfig<RewriteLanguage>,
    fixer: Fixer,
    layout: Option<Layout>,
    macros: Option<MacroBodies>,
    /// The symbol a bare-identifier rule renames (see
    /// [`widen_identifier_pattern`]); its word-level mentions are accounted.
    bare_name: Option<String>,
}

pub fn compile_rewrite(mut rule_config: Value) -> Result<CompiledRewrite, String> {
    let anchors = pattern_anchors(&rule_config);
    let layout = Layout::new(&rule_config);
    let bare_name = widen_identifier_pattern(&mut rule_config);
    let serialized: SerializableRuleConfig<RewriteLanguage> =
        serde_json::from_value(rule_config)
            .map_err(|error| format!("[structural.rewrite.invalid] {error}"))?;
    let config = RuleConfig::try_from(serialized, &GlobalRules::default()).map_err(|error| {
        format!(
            "[structural.rewrite.invalid] {}",
            rule_config_message(&error)
        )
    })?;
    let mut fixers = config
        .get_fixer()
        .map_err(|error| format!("[structural.rewrite.invalid] {error}"))?;
    if fixers.len() != 1 {
        return Err("[structural.rewrite.invalid] exactly one fixer is required".to_owned());
    }
    let fixer = fixers
        .pop()
        .ok_or_else(|| "[structural.rewrite.invalid] a fixer is required".to_owned())?;
    let macros = MacroBodies::for_language(&config.language.entry.language, anchors);
    Ok(CompiledRewrite {
        config,
        fixer,
        layout,
        macros,
        bare_name,
    })
}

/// Whether a grammar's node kind names an identifier: `identifier` and the
/// `*_identifier` family (`type_identifier`, `field_identifier`,
/// `property_identifier`…), which grammars keep apart by syntactic position.
fn is_identifier_kind(kind: &str) -> bool {
    kind == "identifier" || kind.ends_with("_identifier")
}

/// A rule that is only a bare-identifier `pattern` names a symbol, not one
/// syntactic position. ast-grep parses `Name` as the grammar's expression
/// identifier, so a rename would skip the same name as a type, field or
/// property (`struct Name`, `impl Name`, `x: Name`). The rule becomes every
/// identifier-family kind of the grammar whose text is exactly the name; kinds
/// that merely contain the name (`Name::new`, strings, comments) stay out.
/// Any other pattern keeps the single shape it names.
fn widen_identifier_pattern(rule_config: &mut Value) -> Option<String> {
    let language = rule_config
        .get("language")
        .and_then(Value::as_str)
        .and_then(RewriteLanguage::from_selector)?;
    let pattern = rule_config
        .get("rule")
        .and_then(Value::as_object)
        .filter(|rule| rule.len() == 1)
        .and_then(|rule| rule.get("pattern"))
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::to_owned)?;
    let pattern = pattern.as_str();
    let Ok(compiled) = Pattern::try_new(pattern, language.clone()) else {
        return None;
    };
    // A single terminal node of an identifier kind, and nothing else.
    let ts_language = &language.entry.language;
    let is_bare_identifier = compiled.fixed_string() == pattern
        && compiled.potential_kinds().is_some_and(|kinds| {
            let mut kinds = kinds.iter();
            matches!(
                (kinds.next(), kinds.next()),
                (Some(id), None) if u16::try_from(id)
                    .ok()
                    .and_then(|id| ts_language.node_kind_for_id(id))
                    .is_some_and(is_identifier_kind)
            )
        });
    if !is_bare_identifier {
        return None;
    }
    let text = format!("^{}$", regex::escape(pattern));
    let mut kinds: Vec<&str> = (0..ts_language.node_kind_count())
        .filter_map(|id| u16::try_from(id).ok())
        .filter(|id| ts_language.node_kind_is_named(*id) && ts_language.node_kind_is_visible(*id))
        .filter_map(|id| ts_language.node_kind_for_id(id))
        .filter(|kind| is_identifier_kind(kind) && named_kind_id(ts_language, kind).is_some())
        .collect();
    kinds.sort_unstable();
    kinds.dedup();
    let any: Vec<Value> = kinds
        .into_iter()
        .map(|kind| serde_json::json!({"kind":kind,"regex":text}))
        .collect();
    rule_config["rule"] = serde_json::json!({"any":any});
    Some(pattern.to_owned())
}

/// Where `name` stands as a whole word in `content`: not part of a longer
/// identifier (letters, digits, `_` or `$` on either side).
fn word_occurrences<'a>(content: &'a str, name: &'a str) -> impl Iterator<Item = usize> + 'a {
    let joins = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    content.match_indices(name).filter_map(move |(start, _)| {
        let before = content[..start].chars().next_back();
        let after = content[start + name.len()..].chars().next();
        (!before.is_some_and(joins) && !after.is_some_and(joins)).then_some(start)
    })
}

/// Literal anchors of a plain `{rule: {pattern}}` rewrite, so only macro
/// bodies that can contain a match are re-parsed; `None` re-parses them all.
fn pattern_anchors(rule_config: &Value) -> Option<Vec<String>> {
    let rule = rule_config.get("rule")?.as_object()?;
    if rule.len() != 1 {
        return None;
    }
    let pattern = rule.get("pattern")?.as_str()?;
    match super::query::StructuralQuery::new(Some(pattern), None)
        .ok()?
        .prefilter()
    {
        super::query::Prefilter::Single(anchor) => Some(vec![anchor]),
        super::query::Prefilter::Union(anchors) => Some(anchors),
        super::query::Prefilter::None => None,
    }
}

/// A rule-compile error with its cause. ast-grep wraps every rule-core error
/// as "Fail to parse yaml as Rule." (even for a plain pattern) and keeps the
/// real reason, such as an undefined metavariable, in the source chain.
fn rule_config_message(error: &ast_grep_config::RuleConfigError) -> String {
    use ast_grep_config::{RuleConfigError, RuleCoreError};
    match error {
        RuleConfigError::Core(RuleCoreError::UndefinedMetaVar(name, section)) => {
            let section = if *section == "fix" {
                "rewrite"
            } else {
                section
            };
            format!(
                "Undefined metavariable `${name}` used in `{section}`: every `$NAME` there must be captured by the pattern or rule."
            )
        }
        RuleConfigError::Core(core) => core.to_string(),
        other => {
            let mut message = other.to_string();
            let mut source = std::error::Error::source(other);
            while let Some(cause) = source {
                message.push_str(": ");
                message.push_str(&cause.to_string());
                source = cause.source();
            }
            message
        }
    }
}

/// Rewrite matches plus the ERROR/MISSING node count of the same parse, so a
/// caller that needs both never parses the content twice.
#[derive(Debug)]
pub struct RewriteScan {
    pub matches: Vec<StructuralRewriteMatch>,
    pub syntax_errors: u32,
    /// For a bare-identifier rule: whole-word mentions of the name that no
    /// match covers (empty for every other rule).
    pub unmatched: Vec<UnmatchedMention>,
}

/// A whole-word mention of a renamed symbol that the rewrite leaves alone.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnmatchedMention {
    /// 0-based line, like [`StructuralRewritePosition::line`].
    pub line: u32,
    /// `false` inside a comment or string, where an identifier rename does
    /// not reach by design; `true` in code, a position the rule missed.
    pub in_code: bool,
}

/// When [`CompiledRewrite`] counts syntax errors on its parse tree.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum CountErrors {
    /// Only when the content matched (a file-tree scan skips non-matches).
    WhenMatched,
    Always,
}

impl CompiledRewrite {
    pub fn run(&self, content: &str) -> Result<Vec<StructuralRewriteMatch>, String> {
        self.scan_before(
            content,
            Instant::now() + AST_EXECUTION_TIMEOUT,
            CountErrors::WhenMatched,
        )
        .map(|scan| scan.matches)
    }

    /// One parse: the rewrite matches and the tree's syntax-error count.
    pub fn scan(&self, content: &str) -> Result<RewriteScan, String> {
        self.scan_before(
            content,
            Instant::now() + AST_EXECUTION_TIMEOUT,
            CountErrors::Always,
        )
    }

    pub(super) fn scan_with(
        &self,
        content: &str,
        count: CountErrors,
    ) -> Result<RewriteScan, String> {
        self.scan_before(content, Instant::now() + AST_EXECUTION_TIMEOUT, count)
    }

    /// Parses with the shared deadline-bound parser (ast-grep's own parse has no
    /// cancellation) and re-checks the deadline between matches.
    fn scan_before(
        &self,
        content: &str,
        deadline: Instant,
        count: CountErrors,
    ) -> Result<RewriteScan, String> {
        if content.len() > MAX_REWRITE_CONTENT_BYTES {
            return Err(format!(
                "[structural.content.tooLarge] structural rewrite content exceeds {MAX_REWRITE_CONTENT_BYTES} byte limit"
            ));
        }
        let config = &self.config;
        let tree = parse_tree_with_deadline(&config.language.entry.language, content, deadline)
            .map_err(|error| format!("[{}] {}", error.code, error.message))?;
        // `Tree::clone` is a reference-counted copy, not a re-parse.
        let error_tree = tree.clone();
        let line_index = LineIndex::tree_sitter(content);
        let mut output = Vec::new();
        let mut bodies = self
            .macros
            .as_ref()
            .map(|macros| macros.token_trees(tree.root_node(), content))
            .unwrap_or_default();
        // Text inside the file's string literals never matches in a body.
        let strings = if bodies.is_empty() {
            Vec::new()
        } else {
            super::macro_bodies::string_literals(tree.root_node())
        };
        self.collect_matches(
            content,
            tree,
            None,
            &strings,
            deadline,
            &line_index,
            &mut output,
        )?;
        // Rust macro arguments re-parsed as code (see `macro_bodies`); each
        // body's own invocations are queued in turn, up to the nesting bound.
        let mut depth_of = vec![1; bodies.len()];
        while let Some(range) = bodies.pop() {
            let depth = depth_of.pop().unwrap_or(MAX_MACRO_DEPTH);
            let language = &config.language.entry.language;
            let Some(body) = parse_body(content, language, range, deadline)
                .map_err(|error| format!("[{}] {}", error.code, error.message))?
            else {
                continue;
            };
            if depth < MAX_MACRO_DEPTH
                && let Some(macros) = &self.macros
            {
                let nested = macros.token_trees(body.root_node(), content);
                depth_of.extend(std::iter::repeat_n(depth + 1, nested.len()));
                bodies.extend(nested);
            }
            self.collect_matches(
                content,
                body,
                Some(&range),
                &strings,
                deadline,
                &line_index,
                &mut output,
            )?;
        }
        output.sort_by_key(|matched| (matched.byte_start, std::cmp::Reverse(matched.byte_end)));
        let syntax_errors = if count == CountErrors::Always || !output.is_empty() {
            count_tree_errors(&error_tree)
        } else {
            0
        };
        let unmatched = self.unmatched_mentions(content, &error_tree, &output, &line_index)?;
        Ok(RewriteScan {
            matches: output,
            syntax_errors,
            unmatched,
        })
    }

    /// Whole-word mentions of a bare-identifier rule's name outside every
    /// match, each told apart as code or comment/string text by the smallest
    /// node of the file's own parse that holds it.
    fn unmatched_mentions(
        &self,
        content: &str,
        tree: &tree_sitter::Tree,
        matches: &[StructuralRewriteMatch],
        line_index: &LineIndex,
    ) -> Result<Vec<UnmatchedMention>, String> {
        let Some(name) = &self.bare_name else {
            return Ok(Vec::new());
        };
        let mut found = Vec::new();
        for start in word_occurrences(content, name) {
            let covered = matches.iter().any(|matched| {
                (matched.byte_start as usize..matched.byte_end as usize).contains(&start)
            });
            if covered {
                continue;
            }
            let in_code = tree
                .root_node()
                .descendant_for_byte_range(start, start + name.len())
                .is_none_or(|node| {
                    let kind = node.kind();
                    !(is_comment_kind(kind) || is_string_kind(kind))
                });
            let (line, _) = u32::try_from(start)
                .map(|byte| line_index.byte_to_position(content, byte))
                .map_err(|_| "[structural.rewrite.range] byte offset overflow".to_owned())?;
            found.push(UnmatchedMention { line, in_code });
        }
        Ok(found)
    }

    /// Rewrite matches of one parse tree of `content` (the file, or one
    /// re-parsed macro body whose wrapper node is excluded) into `output`.
    fn collect_matches(
        &self,
        content: &str,
        tree: tree_sitter::Tree,
        body: Option<&tree_sitter::Range>,
        strings: &[std::ops::Range<usize>],
        deadline: Instant,
        line_index: &LineIndex,
        output: &mut Vec<StructuralRewriteMatch>,
    ) -> Result<(), String> {
        let config = &self.config;
        let fixer = &self.fixer;
        let grep = AstGrep::doc(StrDoc {
            src: content.to_owned(),
            lang: config.language.clone(),
            tree,
        });
        for matched in grep.root().find_all(&config.matcher) {
            if let Some(body) = body
                && !is_body_candidate(matched.get_inner_node(), body, strings)
            {
                continue;
            }
            if Instant::now() >= deadline {
                return Err(
                    "[structural.rewrite.interrupted] structural rewrite exceeded its execution deadline"
                        .to_owned(),
                );
            }
            if output.len() >= MAX_REWRITE_MATCHES {
                return Err(format!(
                    "[structural.rewrite.matchLimit] structural rewrite exceeds {MAX_REWRITE_MATCHES} matches"
                ));
            }
            let replaced = fixer.get_replaced_range(&matched, &config.matcher);
            let replacement = self
                .layout
                .as_ref()
                .and_then(|layout| layout.replacement(&matched, &config.language, content))
                .unwrap_or_else(|| fixer.generate_replacement(&matched));
            // Columns are 0-based UTF-16 code units like astSearch and LSP
            // (ast-grep's `column()` counts Unicode scalars).
            let span = matched.range();
            let position = |byte: usize| {
                u32::try_from(byte)
                    .map(|byte| line_index.byte_to_position(content, byte))
                    .map_err(|_| "[structural.rewrite.range] byte offset overflow".to_owned())
            };
            let (start_line, start_column) = position(span.start)?;
            let (end_line, end_column) = position(span.end)?;
            let mut captures = HashMap::new();
            let env = matched.get_env();
            for variable in env.get_matched_variables() {
                match variable {
                    MetaVariable::Capture(name, _) => {
                        if let Some(node) = env.get_match(&name) {
                            captures.insert(
                                name,
                                StructuralRewriteCapture {
                                    kind: "single".to_owned(),
                                    texts: vec![node.text().into_owned()],
                                },
                            );
                        } else if let Some(bytes) = env.get_transformed(&name) {
                            let text = std::str::from_utf8(bytes).map_err(|_| {
                                format!(
                                    "[structural.rewrite.range] transformed capture {name} is not valid UTF-8"
                                )
                            })?;
                            captures.insert(
                                name,
                                StructuralRewriteCapture {
                                    kind: "transformed".to_owned(),
                                    texts: vec![text.to_owned()],
                                },
                            );
                        }
                    }
                    MetaVariable::MultiCapture(name) => {
                        captures.insert(
                            name.clone(),
                            StructuralRewriteCapture {
                                kind: "multi".to_owned(),
                                texts: env
                                    .get_multiple_matches(&name)
                                    .into_iter()
                                    .map(|node| node.text().into_owned())
                                    .collect(),
                            },
                        );
                    }
                    _ => {}
                }
            }
            output.push(StructuralRewriteMatch {
                byte_start: u32::try_from(replaced.start)
                    .map_err(|_| "[structural.rewrite.range] byte offset overflow".to_owned())?,
                byte_end: u32::try_from(replaced.end)
                    .map_err(|_| "[structural.rewrite.range] byte offset overflow".to_owned())?,
                range: StructuralRewriteRange {
                    start: StructuralRewritePosition {
                        line: start_line,
                        column: start_column,
                    },
                    end: StructuralRewritePosition {
                        line: end_line,
                        column: end_column,
                    },
                },
                text: matched.text().into_owned(),
                replaced_text: content
                    .get(replaced.clone())
                    .ok_or_else(|| {
                        "[structural.rewrite.range] replacement range is not valid UTF-8".to_owned()
                    })?
                    .to_owned(),
                replacement: String::from_utf8(replacement).map_err(|_| {
                    "[structural.rewrite.range] generated replacement is not valid UTF-8".to_owned()
                })?,
                captures,
            });
        }
        Ok(())
    }
}

/// Count tree-sitter ERROR and MISSING nodes in `content` parsed as
/// `language_selector`. Rewrite staging compares the count before and after
/// splicing so a template that produces broken syntax is rejected instead of
/// committed; a boolean `has_error()` cannot distinguish pre-existing damage
/// from net-new damage.
pub fn count_syntax_errors(content: &str, language_selector: &str) -> Result<u32, String> {
    if content.len() > MAX_REWRITE_CONTENT_BYTES {
        return Err(format!(
            "[structural.content.tooLarge] structural rewrite content exceeds {MAX_REWRITE_CONTENT_BYTES} byte limit"
        ));
    }
    let language = RewriteLanguage::from_selector(language_selector).ok_or_else(|| {
        format!("[structural.rewrite.invalid] {language_selector} is not supported")
    })?;
    let deadline = Instant::now() + AST_EXECUTION_TIMEOUT;
    let tree = parse_tree_with_deadline(&language.entry.language, content, deadline)
        .map_err(|error| format!("[{}] {}", error.code, error.message))?;
    Ok(count_tree_errors(&tree))
}

/// ERROR and MISSING nodes in a parsed tree.
fn count_tree_errors(tree: &tree_sitter::Tree) -> u32 {
    // Preorder cursor walk: O(n), no recursion, no per-node child indexing.
    let mut count = 0u32;
    let mut cursor = tree.walk();
    loop {
        let node = cursor.node();
        if node.is_error() || node.is_missing() {
            count = count.saturating_add(1);
        }
        if cursor.goto_first_child() {
            continue;
        }
        while !cursor.goto_next_sibling() {
            if !cursor.goto_parent() {
                return count;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// A template that sets a multi-capture off with spaces keeps the source's
    /// line break there: a class body written on its own lines stays on its
    /// own lines, at the source's indentation, instead of joining the header.
    #[test]
    fn a_multi_capture_keeps_the_line_break_the_source_had_before_it() {
        let rule = |fix: &str| {
            json!({
                "id":"octocode-inline-rewrite","language":"python","severity":"warning",
                "message":"Octocode inline structural rewrite",
                "rule":{"pattern":"class $N(Exception): $$$B"},
                "fix":fix
            })
        };
        let source = "class A(Exception):\n    pass\n\nif x:\n    class B(Exception):\n        a = 1\n        b = 2\n\nclass C(Exception): pass\n";
        let found = rewrite(source, rule("class $N(RuntimeError): $$$B")).expect("rewrite");
        let replacements = found
            .iter()
            .map(|found| found.replacement.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            replacements,
            [
                "class A(RuntimeError):\n    pass",
                // The nested class's body stays at the source's indentation.
                "class B(RuntimeError):\n        a = 1\n        b = 2",
                // A body that shared the header's line still does.
                "class C(RuntimeError): pass",
            ]
        );
        // A template that already breaks the line is the author's layout.
        let found = rewrite(source, rule("class $N(RuntimeError):\n    $$$B")).expect("rewrite");
        assert_eq!(found[0].replacement, "class A(RuntimeError):\n    pass");
    }

    #[test]
    fn pattern_rules_generate_ast_grep_replacements_and_captures() {
        let found = rewrite(
            "const value = oldCall(foo);\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"typescript",
                "severity":"warning",
                "message":"Octocode inline structural rewrite",
                "rule":{"pattern":"oldCall($A)"},
                "fix":"newCall($A)"
            }),
        )
        .expect("rewrite");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].text, "oldCall(foo)");
        assert_eq!(found[0].replacement, "newCall(foo)");
        assert_eq!(found[0].byte_start, 14);
        assert_eq!(found[0].captures["A"].texts, ["foo"]);
    }

    #[test]
    fn rust_rewrites_reach_macro_bodies_in_file_order() {
        let source = "fn t() {\n    assert!(a.unwrap());\n    outer!(inner!(b.unwrap()), 1);\n    c.unwrap();\n}\n";
        let found = rewrite(
            source,
            json!({
                "id":"octocode-inline-rewrite",
                "language":"rust",
                "rule":{"pattern":"$X.unwrap()"},
                "fix":"$X.expect(\"ok\")"
            }),
        )
        .expect("rewrite");
        let texts: Vec<_> = found.iter().map(|m| m.text.as_str()).collect();
        assert_eq!(texts, ["a.unwrap()", "b.unwrap()", "c.unwrap()"]);
        assert_eq!(found[0].replacement, "a.expect(\"ok\")");
        assert_eq!(
            &source[found[1].byte_start as usize..found[1].byte_end as usize],
            "b.unwrap()"
        );
        assert_eq!(found[1].range.start.line, 2, "0-based line");
    }

    /// Columns are UTF-16 code units (astSearch/LSP), not Unicode scalars:
    /// an astral emoji counts 2, a BMP accent 1.
    #[test]
    fn columns_are_utf16_code_units_after_non_ascii_text() {
        let found = rewrite(
            "const s = \"😀é\"; oldCall(foo);\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"typescript",
                "severity":"warning",
                "message":"Octocode inline structural rewrite",
                "rule":{"pattern":"oldCall($A)"},
                "fix":"newCall($A)"
            }),
        )
        .expect("rewrite");
        assert_eq!(found.len(), 1);
        // `const s = "` = 11 units, 😀 = 2, é = 1, `"; ` = 3 → 17.
        assert_eq!(found[0].range.start.line, 0);
        assert_eq!(found[0].range.start.column, 17);
        assert_eq!(found[0].range.end.column, 17 + "oldCall(foo)".len() as u32);
    }

    #[test]
    fn scan_reports_matches_and_syntax_errors_from_one_parse() {
        let compiled = compile_rewrite(json!({
            "id":"octocode-inline-rewrite",
            "language":"typescript",
            "severity":"warning",
            "message":"Octocode inline structural rewrite",
            "rule":{"pattern":"oldCall($A)"},
            "fix":"newCall($A)"
        }))
        .expect("compile");
        let clean = compiled.scan("oldCall(a);\n").expect("scan");
        assert_eq!((clean.matches.len(), clean.syntax_errors), (1, 0));
        let broken = "oldCall(a);\nconst = ;\n";
        let damaged = compiled.scan(broken).expect("scan");
        assert_eq!(damaged.matches.len(), 1);
        assert_eq!(
            damaged.syntax_errors,
            count_syntax_errors(broken, "typescript").expect("count")
        );
        assert!(damaged.syntax_errors > 0);
        // No matches still reports errors when asked to count always.
        assert!(compiled.scan("const = ;\n").expect("scan").syntax_errors > 0);
        let skipped = compiled
            .scan_with("const = ;\n", CountErrors::WhenMatched)
            .expect("scan");
        assert_eq!(skipped.syntax_errors, 0);
    }

    #[test]
    fn undefined_rewrite_metavariable_is_named_not_reported_as_yaml() {
        let error = rewrite(
            "fillGoal(next, goal);\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"typescript",
                "rule":{"pattern":"fillGoal($A, $B)"},
                "fix":"fillGoal($C, $B)"
            }),
        )
        .expect_err("undefined metavariable");
        assert!(error.contains("structural.rewrite.invalid"), "{error}");
        assert!(error.contains("`$C`"), "{error}");
        assert!(!error.contains("yaml"), "{error}");
    }

    fn kind_rule(kind: &str) -> Value {
        json!({
            "id":"octocode-inline-rewrite",
            "language":"typescript",
            "severity":"warning",
            "message":"Octocode inline structural rewrite",
            "rule":{"kind":kind},
            "fix":"x"
        })
    }

    #[test]
    fn kind_names_that_never_occur_are_rejected_not_silently_empty() {
        // `expression` is a hidden supertype: it resolves to a non-zero id that no
        // node carries, so the rule would compile and match nothing.
        let error = rewrite("const a = b + c;\n", kind_rule("expression")).expect_err("supertype");
        assert!(error.contains("structural.rewrite.invalid"), "{error}");
        // Any prefix of "ERROR" resolves to the ERROR symbol inside tree-sitter.
        let error = rewrite("const a = 1;\n", kind_rule("ERR")).expect_err("error prefix");
        assert!(error.contains("structural.rewrite.invalid"), "{error}");
        // Real kinds, including ERROR itself, still compile.
        assert_eq!(
            rewrite("const a = b + c;\n", kind_rule("binary_expression"))
                .expect("kind")
                .len(),
            1
        );
        assert!(rewrite("const a = 1;\n", kind_rule("ERROR")).is_ok());
    }

    #[test]
    fn compiled_rewrite_is_shareable_and_reusable() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<CompiledRewrite>();
        let compiled = compile_rewrite(json!({
            "id":"octocode-inline-rewrite",
            "language":"typescript",
            "severity":"warning",
            "message":"Octocode inline structural rewrite",
            "rule":{"pattern":"oldCall($A)"},
            "fix":"newCall($A)"
        }))
        .expect("compile");
        assert_eq!(compiled.run("oldCall(a);\n").expect("first").len(), 1);
        assert_eq!(
            compiled
                .run("oldCall(b); oldCall(c);\n")
                .expect("second")
                .len(),
            2
        );
    }

    #[test]
    fn rewrite_honors_an_expired_deadline() {
        let compiled = compile_rewrite(kind_rule("identifier")).expect("compile");
        let error = compiled
            .scan_before("const a = b;\n", Instant::now(), CountErrors::WhenMatched)
            .expect_err("expired deadline");
        assert!(error.contains("interrupted"), "{error}");
    }

    #[test]
    #[cfg(feature = "tree-sitter-scala")]
    fn scala_rewrite_uses_the_canonical_parser() {
        let found = rewrite(
            "val value = oldCall(foo)\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"scala",
                "severity":"warning",
                "message":"Octocode inline structural rewrite",
                "rule":{"pattern":"oldCall($A)"},
                "fix":"newCall($A)"
            }),
        )
        .expect("Scala rewrite");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].replacement, "newCall(foo)");
    }

    #[test]
    fn every_first_class_language_family_rewrites_with_its_canonical_parser() {
        let mut cases = vec![
            (
                "javascript",
                "oldCall(foo);\n",
                "oldCall($A)",
                "newCall($A)",
            ),
            (
                "typescript",
                "oldCall(foo);\n",
                "oldCall($A)",
                "newCall($A)",
            ),
            ("python", "old_call(foo)\n", "old_call($A)", "new_call($A)"),
            (
                "rust",
                "fn main() { old_call(foo); }\n",
                "old_call($A)",
                "new_call($A)",
            ),
            (
                "go",
                "package main\nfunc main() { oldCall(foo) }\n",
                "oldCall($A)",
                "newCall($A)",
            ),
            (
                "java",
                "class Demo { void run() { oldCall(foo); } }\n",
                "oldCall($A)",
                "newCall($A)",
            ),
            (
                "c",
                "void run() { old_call(foo); }\n",
                "old_call($A);",
                "new_call($A);",
            ),
        ];
        #[cfg(feature = "tree-sitter-cpp")]
        cases.push((
            "cpp",
            "void run() { old_call(foo); }\n",
            "old_call($A);",
            "new_call($A);",
        ));
        #[cfg(feature = "tree-sitter-c-sharp")]
        cases.push((
            "csharp",
            "class Demo { void Run() { oldCall(foo); } }\n",
            "oldCall($A)",
            "newCall($A)",
        ));
        #[cfg(feature = "tree-sitter-scala")]
        cases.push((
            "scala",
            "object Demo { def run() = oldCall(foo) }\n",
            "oldCall($A)",
            "newCall($A)",
        ));

        for (language, source, pattern, fix) in cases {
            let found = rewrite(
                source,
                json!({
                    "id":"first-class-language-rewrite",
                    "language":language,
                    "rule":{"pattern":pattern},
                    "fix":fix
                }),
            )
            .unwrap_or_else(|error| panic!("{language}: {error}"));
            assert_eq!(found.len(), 1, "{language}");
            assert!(found[0].replacement.starts_with("new"), "{language}");
        }
    }

    #[test]
    fn syntax_error_count_distinguishes_broken_from_clean_source() {
        assert_eq!(
            count_syntax_errors("const value = call(foo);\n", "typescript").expect("clean"),
            0
        );
        assert!(
            count_syntax_errors("const value = call(foo;\n", "typescript").expect("broken") > 0
        );
        let error = count_syntax_errors("x", "ruby").expect_err("unsupported selector");
        assert!(error.contains("ruby is not supported"), "{error}");
    }

    #[test]
    fn removed_ruby_parser_is_rejected() {
        let error = rewrite(
            "old_call(foo)\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"ruby",
                "severity":"warning",
                "message":"Octocode inline structural rewrite",
                "rule":{"pattern":"old_call($A)"},
                "fix":"new_call($A)"
            }),
        )
        .expect_err("Ruby must not resolve through a hidden ast-grep parser");
        assert!(error.contains("ruby is not supported"), "{error}");
    }

    #[test]
    fn transformations_and_rewriters_use_upstream_semantics() {
        let found = rewrite(
            "const value = oldCall(fooBar);\n",
            json!({
                "id":"octocode-inline-rewrite",
                "language":"typescript",
                "rule":{"pattern":"oldCall($A)"},
                "transform":{
                    "OUT":{"rewrite":{"source":"$A","rewriters":["rename"]}}
                },
                "fix":"newCall($OUT)",
                "rewriters":[{
                    "id":"rename",
                    "rule":{"kind":"identifier"},
                    "fix":"renamed"
                }]
            }),
        )
        .expect("rewrite");
        assert_eq!(found[0].replacement, "newCall(renamed)");
        assert_eq!(found[0].captures["OUT"].kind, "transformed");
    }

    #[test]
    fn parser_for_path_follows_the_file_extension_within_the_family() {
        assert_eq!(rewrite_parser_for_path("typescript", "src/App.tsx"), "tsx");
        assert_eq!(rewrite_parser_for_path("typescript", "src/a.ts"), "ts");
        assert_eq!(rewrite_parser_for_path("cpp", "include/w.h"), "cpp");
        assert_eq!(rewrite_parser_for_path("c", "include/w.h"), "h");
        // A nonstandard suffix keeps the explicit selector.
        assert_eq!(
            rewrite_parser_for_path("typescript", "script.foo"),
            "typescript"
        );
        assert_eq!(
            rewrite_parser_for_path("typescript", "Makefile"),
            "typescript"
        );
        // JSX counted with the TSX grammar is clean; with TS it is broken.
        let jsx = "export const App = () => <div>hi</div>;\n";
        let parser = rewrite_parser_for_path("typescript", "App.tsx");
        assert_eq!(count_syntax_errors(jsx, &parser).expect("tsx"), 0);
        assert!(count_syntax_errors(jsx, "typescript").expect("ts") > 0);
    }
    fn rename(language: &str, source: &str, from: &str) -> Vec<StructuralRewriteMatch> {
        rewrite(
            source,
            json!({
                "id":"octocode-inline-rewrite","language":language,
                "rule":{"pattern":from},"fix":"Renamed"
            }),
        )
        .expect("rewrite")
    }

    /// A bare identifier names a symbol, not one syntactic position: ast-grep
    /// parses `Name` as an expression `identifier`, so declarations, impls,
    /// field types and annotations (`type_identifier`, `field_identifier`…)
    /// would be silently left behind. Each hit is a code position; the word
    /// inside a string or comment, and longer names, are not.
    #[test]
    fn a_bare_identifier_pattern_matches_every_identifier_kind_of_the_grammar() {
        let cases = [
            (
                "rust",
                "struct Name { inner: Name }\nimpl Name { fn new() -> Name { Name::default() } }\n\
                 fn f(a: &Name) { let b: Vec<Name> = Vec::new(); let c = Name { inner: x }; }\n\
                 // Name in a comment\nconst S: &str = \"Name\"; struct NameOther;\n",
                8,
            ),
            (
                "typescript",
                "interface Name { f: Name }\nclass C implements Name { io?: Name }\n\
                 function g(a: Name): Name { const x: Name = a; return x; }\n\
                 // Name in a comment\nconst s = \"Name\"; type NameOther = 1;\n",
                7,
            ),
            (
                "go",
                "type Name struct { inner Name }\nfunc f(a *Name) Name { var b Name; return b }\n\
                 // Name in a comment\nvar s = \"Name\"\n",
                5,
            ),
            (
                "java",
                "class Name { Name inner; Name make(Name a) { return new Name(); } }\n\
                 // Name in a comment\nclass NameOther {}\n",
                5,
            ),
            (
                "python",
                "class Name:\n    pass\nx = Name()\ny = \"Name\"  # Name\n",
                2,
            ),
        ];
        for (language, source, expected) in cases {
            let found = rename(language, source, "Name");
            assert_eq!(found.len(), expected, "{language}: {found:#?}");
            for matched in &found {
                assert_eq!(matched.text, "Name", "{language}");
                assert_eq!(matched.replacement, "Renamed", "{language}");
                // Each hit is a code position: the source text under its
                // range is the identifier itself.
                assert_eq!(
                    &source[matched.byte_start as usize..matched.byte_end as usize],
                    "Name"
                );
            }
        }
    }

    fn identifier_scan(language: &str, content: &str) -> RewriteScan {
        compile_rewrite(json!({
            "id":"r","language":language,"rule":{"pattern":"Name"},"fix":"Renamed"
        }))
        .expect("compile")
        .scan(content)
        .expect("scan")
    }

    /// The widened rule covers every identifier node, so what a word-level
    /// search still finds is text: comments and strings, named with their
    /// lines and told apart from code.
    #[test]
    fn a_rename_names_word_mentions_in_comments_and_strings_it_leaves() {
        let scan = identifier_scan(
            "rust",
            "// Name in a comment\nstruct Name;\nconst S: &str = \"Name\";\nstruct NameOther;\n",
        );
        assert_eq!(scan.matches.len(), 1);
        let lines: Vec<(u32, bool)> = scan
            .unmatched
            .iter()
            .map(|mention| (mention.line, mention.in_code))
            .collect();
        assert_eq!(lines, [(0, false), (2, false)]);
    }

    /// A name the identifier kinds miss in code (a Go label is `label_name`)
    /// is reported as code, so the preview cannot call itself complete.
    #[test]
    fn a_rename_names_code_positions_no_identifier_kind_reached() {
        let scan = identifier_scan(
            "go",
            "package p\nvar Name int\nfunc f() {\nName:\n\tfor {\n\t\tgoto Name\n\t}\n}\n",
        );
        assert_eq!(scan.matches.len(), 1, "{:?}", scan.matches);
        let lines: Vec<(u32, bool)> = scan
            .unmatched
            .iter()
            .map(|mention| (mention.line, mention.in_code))
            .collect();
        assert_eq!(lines, [(3, true), (5, true)]);
    }

    /// Only a bare-identifier rule counts word mentions.
    #[test]
    fn a_pattern_that_is_not_a_bare_identifier_reports_no_mentions() {
        let scan = compile_rewrite(json!({
            "id":"r","language":"rust","rule":{"pattern":"Name::new()"},"fix":"x"
        }))
        .expect("compile")
        .scan("// Name::new() Name\nfn f() { Name::new(); }\n")
        .expect("scan");
        assert!(scan.unmatched.is_empty());
    }

    /// Only a bare identifier widens: a metavariable, a member path and a call
    /// keep the one syntactic shape they name.
    #[test]
    fn only_a_bare_identifier_pattern_widens() {
        let source = "struct Name { inner: Name }\nfn f() { let a = Name::new(); Name; }\n";
        let call = rename("rust", source, "Name::new()");
        assert_eq!(call.len(), 1, "{call:#?}");
        // `$A` is a metavariable, not a name: it stays the error it was.
        let error = rewrite(
            source,
            json!({"id":"r","language":"rust","rule":{"pattern":"$A"},"fix":"x"}),
        )
        .expect_err("a lone metavariable names no kind");
        assert!(error.contains("kind"), "{error}");
    }
}

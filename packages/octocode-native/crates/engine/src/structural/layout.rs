//! Keeps the line break a source had before or after a multi-capture.
//!
//! A template such as `class $N(RuntimeError): $$$B` sets `$$$B` off with a
//! space, but a body captured from
//!
//! ```python
//! class A(Exception):
//!     pass
//! ```
//!
//! sits on its own line: ast-grep joins it to the header. The captured nodes
//! carry no layout of their own, so the layout is the gap around them in the
//! source. Where the template separates a multi-capture from its neighbours
//! with spaces or tabs and the source separated them with a line break, the
//! generated replacement uses the source's break and indentation instead. A
//! template that already breaks the line there is left as written, and so is
//! a capture the source kept on the neighbour's line.

use std::ops::Range;

use ast_grep_core::{
    NodeMatch,
    replacer::{Replacer, TemplateFix},
    tree_sitter::{LanguageExt, StrDoc},
};
use serde_json::Value;

/// One `$$$NAME` in a template and the inline whitespace beside it.
struct Slot {
    name: String,
    /// Spaces or tabs between the capture and the text before it.
    before: Option<Range<usize>>,
    /// Spaces or tabs between the capture and the text after it.
    after: Option<Range<usize>>,
}

/// The template of a rewrite and where its multi-captures sit.
pub(super) struct Layout {
    template: String,
    /// Names of the rule's `transform` entries, which the template may use.
    transforms: Vec<String>,
    slots: Vec<Slot>,
}

impl Layout {
    /// The layout of `rule_config`'s `fix`, when it is one template with a
    /// multi-capture that spaces set off from its neighbours.
    pub(super) fn new(rule_config: &Value) -> Option<Self> {
        let fix = rule_config.get("fix")?;
        let template = fix
            .as_str()
            .or_else(|| fix.get("template").and_then(Value::as_str))?;
        let slots = slots(template);
        if slots.is_empty() {
            return None;
        }
        let transforms = rule_config
            .get("transform")
            .and_then(Value::as_object)
            .map(|entries| entries.keys().cloned().collect())
            .unwrap_or_default();
        Some(Self {
            template: template.to_owned(),
            transforms,
            slots,
        })
    }

    /// The replacement for `matched` with the source's line breaks, or
    /// `None` when the source has none to keep.
    pub(super) fn replacement<L: LanguageExt>(
        &self,
        matched: &NodeMatch<'_, StrDoc<L>>,
        lang: &L,
        content: &str,
    ) -> Option<Vec<u8>> {
        let indent = line_indent(content, matched.range().start);
        let mut edits = Vec::<(Range<usize>, String)>::new();
        for slot in &self.slots {
            let nodes = matched.get_env().get_multiple_matches(&slot.name);
            let (Some(first), Some(last)) = (nodes.first(), nodes.last()) else {
                continue;
            };
            let (start, end) = (first.range().start, last.range().end);
            if let Some(run) = &slot.before
                && let Some(gap) = broken_gap(content, start, Side::Before, indent)
            {
                edits.push((run.clone(), gap));
            }
            if let Some(run) = &slot.after
                && let Some(gap) = broken_gap(content, end, Side::After, indent)
            {
                edits.push((run.clone(), gap));
            }
        }
        if edits.is_empty() {
            return None;
        }
        edits.sort_by_key(|(run, _)| run.start);
        // Neighbouring captures can share one run: the first edit keeps it.
        edits.dedup_by(|later, earlier| later.0.start < earlier.0.end);
        let mut template = self.template.clone();
        for (run, gap) in edits.into_iter().rev() {
            template.replace_range(run, &gap);
        }
        let fixer = if self.transforms.is_empty() {
            TemplateFix::try_new(&template, lang).ok()?
        } else {
            TemplateFix::with_transform(&template, lang, &self.transforms)
        };
        Some(fixer.generate_replacement(matched))
    }
}

/// The multi-captures of `template` whose inline whitespace can take the
/// source's line break.
fn slots(template: &str) -> Vec<Slot> {
    let bytes = template.as_bytes();
    let mut slots = vec![];
    let mut at = 0;
    while let Some(found) = template[at..].find("$$$") {
        let start = at + found;
        let name_start = start + 3;
        let name_len = bytes[name_start..]
            .iter()
            .take_while(|byte| byte.is_ascii_uppercase() || **byte == b'_' || byte.is_ascii_digit())
            .count();
        at = name_start + name_len;
        if name_len == 0 || bytes[name_start].is_ascii_digit() {
            continue;
        }
        let blank = |byte: &u8| matches!(byte, b' ' | b'\t');
        let run_start = bytes[..start].iter().rev().take_while(|b| blank(b)).count();
        let before = (run_start > 0
            && start > run_start
            && !bytes[start - run_start - 1].is_ascii_whitespace())
        .then(|| start - run_start..start);
        let run_len = bytes[at..].iter().take_while(|b| blank(b)).count();
        let after = (run_len > 0
            && bytes
                .get(at + run_len)
                .is_some_and(|b| !b.is_ascii_whitespace()))
        .then(|| at..at + run_len);
        if before.is_some() || after.is_some() {
            slots.push(Slot {
                name: template[name_start..at].to_owned(),
                before,
                after,
            });
        }
    }
    slots
}

#[derive(Clone, Copy)]
enum Side {
    Before,
    After,
}

/// The whitespace between `offset` and the nearest text on `side`, when it
/// holds a line break: the break, then the indentation relative to the
/// matched node's own `indent` (the replacement is indented by that again).
fn broken_gap(content: &str, offset: usize, side: Side, indent: &str) -> Option<String> {
    let gap = match side {
        Side::Before => {
            let text = content.get(..offset)?;
            let trimmed = text.trim_end();
            if trimmed.is_empty() {
                return None;
            }
            &text[trimmed.len()..]
        }
        Side::After => {
            let text = content.get(offset..)?;
            let trimmed = text.trim_start();
            if trimmed.is_empty() {
                return None;
            }
            &text[..text.len() - trimmed.len()]
        }
    };
    let (blank_lines, last_line) = gap.rsplit_once('\n')?;
    let relative = last_line.strip_prefix(indent)?;
    Some(format!("{blank_lines}\n{relative}"))
}

/// The whitespace that opens the line holding `offset`.
fn line_indent(content: &str, offset: usize) -> &str {
    let line = &content[content[..offset].rfind('\n').map_or(0, |at| at + 1)..];
    &line[..line.len() - line.trim_start_matches([' ', '\t']).len()]
}

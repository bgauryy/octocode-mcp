use serde::Deserialize;
use tree_sitter::Node;

use super::error::CompileError;
use super::matching::{CaptureEnv, ExecutionError};
use super::rule::{CompiledRule, Document, RawRule};
use crate::structural::language::AgLanguage;

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum Position {
    Number(u32),
    Formula(String),
}

impl Position {
    pub(super) fn compile(&self) -> Result<(i64, i64), CompileError> {
        match self {
            Self::Number(n) => Ok((0, i64::from(*n))),
            Self::Formula(text) => parse_formula(text),
        }
    }
}

pub(super) fn parse_formula(text: &str) -> Result<(i64, i64), CompileError> {
    let text: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    let text = text.to_ascii_lowercase();
    let invalid =
        || CompileError::rule("invalid nthChild position: expected an integer or An+B formula");
    if text == "odd" {
        return Ok((2, 1));
    }
    if text == "even" {
        return Ok((2, 0));
    }
    let integer = |s: &str| -> Result<i64, CompileError> {
        let value = s.parse::<i32>().map_err(|_| invalid())?;
        Ok(i64::from(value))
    };
    if let Some((a, b)) = text.split_once('n') {
        let a = match a {
            "" | "+" => 1,
            "-" => -1,
            other => integer(other)?,
        };
        let b = if b.is_empty() {
            0
        } else if b.starts_with(['+', '-']) {
            integer(b)?
        } else {
            return Err(invalid());
        };
        Ok((a, b))
    } else {
        integer(&text).map(|b| (0, b))
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum RawOrdinal {
    Simple(Position),
    Detailed(OrdinalOptions),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct OrdinalOptions {
    position: Position,
    #[serde(default)]
    reverse: bool,
    of_rule: Option<Box<RawRule>>,
}

impl RawOrdinal {
    pub(super) fn filter(&self) -> Option<&RawRule> {
        match self {
            Self::Simple(_) => None,
            Self::Detailed(v) => v.of_rule.as_deref(),
        }
    }
    pub(super) fn filter_mut(&mut self) -> Option<&mut RawRule> {
        match self {
            Self::Simple(_) => None,
            Self::Detailed(v) => v.of_rule.as_deref_mut(),
        }
    }
    pub(super) fn position(&self) -> &Position {
        match self {
            Self::Simple(p) => p,
            Self::Detailed(v) => &v.position,
        }
    }
}

pub(super) struct Ordinal {
    step: i64,
    offset: i64,
    reverse: bool,
    filter: Option<Box<CompiledRule>>,
}

impl Ordinal {
    pub(super) fn compile(lang: &AgLanguage, raw: &RawOrdinal) -> Result<Self, CompileError> {
        let (step, offset) = raw.position().compile()?;
        Ok(Self {
            step,
            offset,
            reverse: matches!(raw, RawOrdinal::Detailed(v) if v.reverse),
            filter: raw
                .filter()
                .map(|rule| CompiledRule::compile_checked(lang, rule).map(Box::new))
                .transpose()?,
        })
    }

    pub(super) fn matches<'t>(
        &self,
        candidate: Node<'t>,
        ancestors: Option<&[Node<'t>]>,
        document: &Document<'_, 't>,
        captures: &mut CaptureEnv,
    ) -> Result<bool, ExecutionError> {
        let owned;
        let ancestors = match ancestors {
            Some(chain) => chain,
            None => {
                owned = super::matching::ancestors_from_root(
                    document.root,
                    candidate,
                    document.deadline,
                )?;
                &owned
            }
        };
        let Some(parent) = ancestors.last() else {
            return Ok(false);
        };
        let mut count = 0i64;
        let mut index = None;
        for child in parent.named_children(&mut parent.walk()) {
            ExecutionError::check(document.deadline)?;
            let checkpoint = captures.checkpoint();
            let eligible = match &self.filter {
                Some(filter) => filter.matches(child, Some(ancestors), document, captures)?,
                None => true,
            };
            captures.rollback(checkpoint);
            if eligible {
                count += 1;
                if child == candidate {
                    index = Some(count);
                }
            }
        }
        let Some(index) = index else {
            return Ok(false);
        };
        let index = if self.reverse {
            count - index + 1
        } else {
            index
        };
        let delta = index - self.offset;
        let accepted = if self.step == 0 {
            delta == 0
        } else {
            delta % self.step == 0 && delta / self.step >= 0
        };
        if !accepted {
            return Ok(false);
        }
        // Only the selected sibling contributes filter captures.
        match &self.filter {
            Some(filter) => filter.matches(candidate, Some(ancestors), document, captures),
            None => Ok(true),
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SourcePosition {
    line: usize,
    column: Option<usize>,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ExactRange {
    start: SourcePosition,
    end: SourcePosition,
}

impl ExactRange {
    pub(super) fn validate(&self) -> Result<(), CompileError> {
        if self.start.line > self.end.line
            || (self.start.line == self.end.line
                && self
                    .start
                    .column
                    .zip(self.end.column)
                    .is_some_and(|(a, b)| a > b))
        {
            return Err(CompileError::rule("range start must not follow its end"));
        }
        Ok(())
    }
    pub(super) fn matches(&self, node: Node<'_>, document: &Document<'_, '_>) -> bool {
        let start = node.start_position();
        let end = node.end_position();
        if start.row != self.start.line || end.row != self.end.line {
            return false;
        }
        let column = |row, byte| {
            document
                .line_index
                .line_start(row)
                .and_then(|offset| document.content.get(offset..byte))
                .map(|s| s.chars().count())
        };
        self.start
            .column
            .is_none_or(|c| column(start.row, node.start_byte()) == Some(c))
            && self
                .end
                .column
                .is_none_or(|c| column(end.row, node.end_byte()) == Some(c))
    }
}

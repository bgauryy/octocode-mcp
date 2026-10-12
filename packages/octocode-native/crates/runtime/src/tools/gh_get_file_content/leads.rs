//! The runnable next steps of a GitHub file read: its own pages rewritten
//! from the shared localFetch read, and the leads of a match that found
//! nothing.
use serde_json::{Value, json};

use super::GhGetFileContentQuery;
use crate::tools::local_fetch::{LocalFetchQuery, MinifyMode, RegexMatch};

/// Lines from which a missed literal is located semantically (clasify)
/// rather than searched for again: the size where the clasify gate starts.
const LOCATE_FILE_LINES: usize = 1000;

/// The runnable next step of a match that found nothing: in a large file,
/// a clasify locate of the same file at the same commit (the literal was a
/// guess); otherwise a ghSearchCode of the repository for the literal (it
/// may live in another file). A regex has no literal to search.
pub(super) fn empty_match_lead(
    query: &GhGetFileContentQuery,
    local: &LocalFetchQuery,
    total_lines: usize,
    sha: &str,
) -> Option<(&'static str, Value)> {
    let literals = local.match_strings();
    let first = literals.first()?.trim();
    if total_lines >= LOCATE_FILE_LINES {
        let ask = format!(
            "Which lines of {} handle {}?",
            query.path.as_str(),
            literals.join(" or ")
        );
        let goal: String = query
            .main_goal
            .as_ref()
            .map_or(ask.as_str(), |goal| goal.as_str())
            .chars()
            .take(crate::tools::id::query_limits::clasify::MAIN_GOAL_MAX_LENGTH)
            .collect();
        let ask: String = ask
            .chars()
            .take(crate::tools::id::query_limits::clasify::MAIN_GOAL_MAX_LENGTH)
            .collect();
        let resource = json!({
            "id": "file",
            "tool": crate::tools::id::ToolId::GhGetFileContent.as_str(),
            "query": {"owner": query.owner.as_str(), "repo": query.repo.as_str(), "path": query.path.as_str(), "ref": sha},
        });
        return Some((
            "clasify",
            crate::tools::result::Continuation::new(
                crate::tools::id::ToolId::Clasify,
                json!({
                    "mainGoal": goal,
                    "resources": [resource],
                    "questions": [{"id": "target", "type": "locate", "ask": ask}],
                }),
            )
            .confidence("medium")
            .build(),
        ));
    }
    if local.is_regex() || first.is_empty() {
        return None;
    }
    Some((
        "findCode",
        crate::tools::result::Continuation::new(
            crate::tools::id::ToolId::GhSearchCode,
            json!({"owner": query.owner.as_str(), "repo": query.repo.as_str(), "keywords": [first]}),
        )
        .confidence("medium")
        .build(),
    ))
}

/// The same read at the same commit, matched case-insensitively: the
/// runnable recovery of a matchString that selected no line, offered only
/// when that read selects lines (the shared row counts them).
pub(super) fn ignore_case_lead(
    query: &GhGetFileContentQuery,
    local: &LocalFetchQuery,
    acquired: &octocode_github::ContentResponse,
    regex: &impl RegexMatch,
) -> Option<Value> {
    let text = String::from_utf8_lossy(&acquired.bytes);
    if crate::tools::local_fetch::insensitive_match_count(local, &text, regex) == 0 {
        return None;
    }
    let mut row = query.clone();
    row.case_mode = Some(crate::contracts::tool_types::ReadCaseMode::Insensitive);
    row.ref_ = Some(acquired.resolved_ref.clone());
    let mut row = serde_json::to_value(row).ok()?;
    crate::tools::result::remove_null_fields(&mut row);
    Some(
        crate::tools::result::Continuation::new(crate::tools::id::ToolId::GhGetFileContent, row)
            .confidence("high")
            .build(),
    )
}

pub(super) fn rewrite_continuations(
    result: &mut crate::tools::local_fetch::LocalFetchResult,
    source: &GhGetFileContentQuery,
    resolved_ref: &str,
) -> Option<Value> {
    let mut value = serde_json::to_value(result.next.take()?).ok()?;
    let Value::Object(object) = &mut value else {
        return None;
    };
    // Each localFetch call becomes the same read of the GitHub file. A lead
    // to another local tool (the miss's `findText` localSearch of the
    // file's directory) has no GitHub form here and is dropped; the GitHub
    // miss adds its own repository-level lead.
    object.retain(|_, continuation| {
        continuation["tool"] == crate::tools::id::ToolId::LocalFetch.as_str()
    });
    for continuation in object.values_mut() {
        let Some(Value::Object(mut query)) =
            crate::tools::result::continuation_row(continuation).cloned()
        else {
            continue;
        };
        query.insert("owner".into(), Value::String(source.owner.to_string()));
        query.insert("repo".into(), Value::String(source.repo.to_string()));
        query.insert("ref".into(), Value::String(resolved_ref.to_owned()));
        // A continuation reads a window, never the whole file, and keeps
        // the caller's view; the default view is omitted.
        query.remove("fullContent");
        match source.minify {
            mode if mode == default_minify() => {
                query.remove("minify");
            }
            mode => {
                let name = match mode {
                    MinifyMode::None => "none",
                    MinifyMode::Standard => "standard",
                    MinifyMode::Symbols => "symbols",
                };
                query.insert("minify".into(), Value::String(name.to_owned()));
            }
        }
        if let Some(force) = source.force_refresh {
            query.insert("forceRefresh".into(), Value::Bool(force));
        }
        let mut call = crate::tools::result::Continuation::new(
            crate::tools::id::ToolId::GhGetFileContent,
            Value::Object(query),
        );
        if let Some(confidence) = continuation["confidence"].as_str() {
            call = call.confidence(confidence);
        }
        *continuation = call.build();
    }
    (!object.is_empty()).then_some(value)
}

/// The view a read gets when it names no `minify` (contract default).
pub(super) fn default_minify() -> MinifyMode {
    crate::contracts::query_schema_value(
        crate::tools::id::ToolId::GhGetFileContent,
        None,
        "minify",
        "default",
    )
    .and_then(|value| serde_json::from_value(value.clone()).ok())
    .unwrap_or(MinifyMode::None)
}

//! One explicit source selection captured completely as a classification
//! state, through the same authorized readers a direct call runs: contract
//! validation, input security, the reader's own path policy and redaction,
//! and output sanitization. Nothing captured here reaches the host; the
//! caller receives the state and one read lead to exactly what was judged.
//!
//! A selection is captured whole or not at all: every content page the
//! reader returns is followed (each pinned to the first page's file snapshot
//! or commit), and a selection larger than the state limit fails instead of
//! being judged from its first part.
pub(crate) mod assets;
pub(crate) mod url;

use crate::response::rows;
use crate::runtime::{ExecutionContext, domain_dispatch::DomainDispatcher};
use crate::tools::id::ToolId;
use crate::tools::judgment::ClassificationError;
use serde_json::{Value, json};

/// Pages one selection may take; a reader that keeps paging past this is
/// treated as a failed capture, not judged in part.
const MAX_PAGES: usize = 64;

/// A captured selection.
pub(crate) struct Captured {
    /// What the classifier judges: the source's identity and its text.
    pub state: Value,
    /// An executable read of exactly the captured selection, at the same
    /// snapshot or commit.
    pub read: Value,
    /// Provenance a read lead cannot carry (a URL capture).
    pub source: Option<Value>,
}

fn failure(code: &str, message: impl Into<String>, hint: &str) -> ClassificationError {
    ClassificationError::new(code, message, hint)
}

fn too_large(max_chars: usize) -> ClassificationError {
    failure(
        "classificationContextTooLarge",
        format!(
            "The selected source exceeds the {max_chars}-character state limit; nothing was judged."
        ),
        "Select narrower ranges, or split the selection across query rows.",
    )
}

/// Capture `source` (`{tool, query}` or `{url}`) completely, up to
/// `max_chars` characters of text.
pub(crate) fn capture(
    source: &Value,
    dispatcher: &DomainDispatcher,
    context: &ExecutionContext,
    max_chars: usize,
) -> Result<Captured, ClassificationError> {
    if let Some(address) = source.get("url").and_then(Value::as_str) {
        return url::capture(address, dispatcher, context, max_chars);
    }
    let tool = source["tool"].as_str().unwrap_or_default();
    let id = ToolId::from_name(tool)
        .filter(|id| matches!(id, ToolId::LocalFetch | ToolId::GhGetFileContent))
        .ok_or_else(|| {
            failure(
                "invalidClassificationContext",
                "A clasify source reads through localFetch or ghGetFileContent.",
                "Name localFetch or ghGetFileContent, or supply the data as state.",
            )
        })?;
    if !dispatcher.availability.is_available(tool) {
        return Err(failure(
            "classificationContextUnavailable",
            format!("{tool} is not available in this runtime, so its source cannot be read."),
            "Enable the reader, or supply the data as state.",
        ));
    }
    let mut row = source["query"].clone();
    // A captured state is the exact text: a minified view is not the source.
    row["minify"] = json!("none");
    let mut text = String::new();
    let mut pin: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let page = read_page(id, &row, dispatcher, context)?;
        if pin.is_none() {
            pin = page.pin.clone();
        }
        text.push_str(&page.content);
        if text.chars().count() > max_chars {
            return Err(too_large(max_chars));
        }
        let Some(mut next) = page.next else {
            return Ok(Captured {
                state: json!({ "source": identity(id, &source["query"], pin.as_deref()), "text": text }),
                read: read_lead(id, &source["query"], pin.as_deref()),
                source: None,
            });
        };
        next["minify"] = json!("none");
        // Every later page reads the commit the first page resolved.
        if id == ToolId::GhGetFileContent
            && let Some(sha) = &pin
        {
            next["ref"] = json!(sha);
        }
        row = next;
    }
    Err(too_large(max_chars))
}

/// One reader page as the capture needs it.
struct Page {
    content: String,
    /// The local file snapshot or the resolved commit SHA.
    pin: Option<String>,
    /// The reader's own row for the next content page.
    next: Option<Value>,
}

fn read_page(
    id: ToolId,
    row: &Value,
    dispatcher: &DomainDispatcher,
    context: &ExecutionContext,
) -> Result<Page, ClassificationError> {
    let tool = id.as_str();
    let mut prepared = crate::contracts::prepare_many_and_validate(tool, json!({"queries":[row]}))
        .map_err(|error| {
            failure(
                "invalidClassificationContext",
                format!(
                    "The {tool} source does not satisfy its input contract: {}.",
                    error
                        .issues
                        .first()
                        .map_or("invalid row", |issue| issue.message.as_str())
                        .trim_end_matches('.')
                ),
                "Correct the source query; it is the reader's own row.",
            )
        })?;
    let prepared = prepared.pop().unwrap_or(Value::Null);
    let checked = dispatcher.security.validate_input_parameters(&prepared);
    if !checked.is_valid {
        return Err(failure(
            "securityValidationFailed",
            "The source query is blocked by input security policy.",
            "Read an allowed path.",
        ));
    }
    let prepared = Value::Object(checked.sanitized_params);
    context.check().map_err(|stop| {
        failure(
            match stop {
                crate::runtime::ExecutionError::Timeout => "timeout",
                _ => "cancelled",
            },
            "The call stopped before its source was captured.",
            "Retry only if the judgment is still needed.",
        )
    })?;
    let result = dispatcher.execute(id, &prepared, context).map_err(|stop| {
        failure(
            match stop {
                crate::runtime::ExecutionError::Timeout => "timeout",
                crate::runtime::ExecutionError::Cancelled => "cancelled",
                _ => "classificationContextFailed",
            },
            format!("The {tool} source read could not complete."),
            "Run the same read directly to inspect it.",
        )
    })?;
    let source_digest = result.source_digest.clone();
    let row_value = rows::result_row(id, 0, &prepared, result.data, result.status);
    let mut state = rows::envelope_in(vec![row_value], id, &[Some(&prepared)], &dispatcher.paths);
    rows::sanitize_output(
        &mut state,
        id,
        &dispatcher.security,
        context,
        dispatcher.config.resolved.output.redact_emails,
    )
    .map_err(|_| {
        failure(
            "classificationContextFailed",
            "The source read's output could not be sanitized.",
            "Run the same read directly to inspect it.",
        )
    })?;
    let data = &state["results"][0]["data"];
    if state["results"][0]["status"] == "error" || data.get("errorCode").is_some() {
        let code = data["errorCode"]
            .as_str()
            .filter(|code| crate::tools::id::error_codes::class(code).is_some())
            .unwrap_or("classificationContextFailed");
        return Err(ClassificationError {
            code: code.to_owned(),
            message: data["error"]
                .as_str()
                .unwrap_or("The source read failed.")
                .to_owned(),
            hints: vec!["Run the same read directly to inspect it.".into()],
            ..ClassificationError::default()
        });
    }
    let content = data["content"].as_str().unwrap_or_default();
    if content.is_empty() {
        return Err(failure(
            "classificationContextEmpty",
            format!("The {tool} source selected no text; nothing was judged."),
            "Check the ranges and the path.",
        ));
    }
    let pin = match id {
        ToolId::GhGetFileContent => data["commitSha"]
            .as_str()
            .or_else(|| state["shared"]["commitSha"].as_str())
            .map(str::to_owned),
        _ => source_digest,
    };
    let next = data["next"]["continueWindow"]["query"]["queries"][0]
        .as_object()
        .map(|next| Value::Object(next.clone()));
    Ok(Page {
        content: content.to_owned(),
        pin,
        next,
    })
}

/// The selection the state names: path, ranges or whole file, and pin.
fn identity(id: ToolId, query: &Value, pin: Option<&str>) -> Value {
    let mut source = json!({ "path": query["path"] });
    if id == ToolId::GhGetFileContent {
        source["repository"] = json!(format!(
            "{}/{}",
            query["owner"].as_str().unwrap_or_default(),
            query["repo"].as_str().unwrap_or_default()
        ));
        if let Some(sha) = pin {
            source["commitSha"] = json!(sha);
        }
    }
    if let Some(ranges) = query.get("ranges") {
        source["ranges"] = ranges.clone();
    }
    source
}

/// The read of exactly the captured selection: same path and ranges (or
/// whole file), exact text, pinned to the snapshot or commit.
fn read_lead(id: ToolId, query: &Value, pin: Option<&str>) -> Value {
    let mut row = serde_json::Map::new();
    for field in ["owner", "repo", "path", "ranges", "fullContent"] {
        if let Some(value) = query.get(field) {
            row.insert(field.into(), value.clone());
        }
    }
    match (id, pin) {
        (ToolId::GhGetFileContent, Some(sha)) => {
            row.insert("ref".into(), json!(sha));
        }
        (ToolId::GhGetFileContent, None) => {
            if let Some(reference) = query.get("ref") {
                row.insert("ref".into(), reference.clone());
            }
        }
        (_, Some(snapshot)) => {
            row.insert("snapshot".into(), json!(snapshot));
        }
        (_, None) => {}
    }
    row.insert("minify".into(), json!("none"));
    crate::tools::result::Continuation::new(id, Value::Object(row)).build()
}

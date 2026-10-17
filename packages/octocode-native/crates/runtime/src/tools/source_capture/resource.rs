//! Complete authorized text for source-coordinate planning, before redaction.
use super::{ClassificationError, DomainDispatcher, ExecutionContext, ToolId, failure};
use serde_json::{Value, json};
use std::ops::Range;
use std::path::PathBuf;

pub(crate) struct TextResource {
    pub text: String,
    pub path: PathBuf,
    pub metadata: Value,
    pub local_check: Option<Value>,
}

/// Identity of complete acquisition, independent of each resource's ranges.
pub(crate) fn acquisition_key(
    source: &Value,
    dispatcher: &DomainDispatcher,
) -> Result<String, ClassificationError> {
    if let Some(url) = source["url"].as_str() {
        return Ok(format!("url:{url}"));
    }
    let tool = source["tool"]
        .as_str()
        .and_then(ToolId::from_name)
        .ok_or_else(|| {
            failure(
                "invalidClassificationContext",
                "The source reader is invalid.",
                "Use an authorized text reader.",
            )
        })?;
    let mut query = super::prepare_source(tool, &source["query"], dispatcher)?;
    if tool == ToolId::LocalFetch {
        let path = query["path"].as_str().unwrap_or_default();
        let validated = dispatcher
            .paths
            .validate_read(std::path::Path::new(path))
            .map_err(|_| {
                failure(
                    "classificationContextUnavailable",
                    "The local source path is not authorized.",
                    "Use an allowed source path.",
                )
            })?;
        query["path"] = json!(validated.canonical);
    }
    if let Some(query) = query.as_object_mut() {
        query.remove("ranges");
        query.remove("fullContent");
        query.remove("mainGoal");
        query.remove("reasoning");
    }
    Ok(crate::digest::json_sha256(
        &json!({"tool":tool.as_str(),"query":query}),
    ))
}

pub(crate) fn selection_metadata(captured: &TextResource, source: &Value) -> Value {
    let mut metadata = captured.metadata.clone();
    metadata["source"] = source.clone();
    if let Some(tool) = source["tool"].as_str().and_then(ToolId::from_name) {
        metadata["read"] = super::read_lead(tool, &source["query"], metadata["snapshot"].as_str());
    }
    metadata
}

pub(crate) fn capture(
    source: &Value,
    dispatcher: &DomainDispatcher,
    context: &ExecutionContext,
) -> Result<TextResource, ClassificationError> {
    if let Some(url) = source["url"].as_str() {
        let captured = super::url::capture(
            url,
            dispatcher,
            context,
            DomainDispatcher::text_capture_limit(),
        )?;
        let text = captured.state["text"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        let provenance = captured.source.unwrap_or(Value::Null);
        return Ok(TextResource {
            text,
            path: PathBuf::from("capture.txt"),
            metadata: json!({"status":"ready","source":source,"snapshot":provenance["snapshot"],"coordinateSpace":"capture","expiresAt":provenance["expiresAt"],"read":captured.read}),
            local_check: None,
        });
    }
    let tool = source["tool"]
        .as_str()
        .and_then(ToolId::from_name)
        .filter(|tool| matches!(tool, ToolId::LocalFetch | ToolId::GhGetFileContent))
        .ok_or_else(|| {
            failure(
                "invalidClassificationContext",
                "A resource must name an authorized text reader or HTTPS URL.",
                "Use localFetch, ghGetFileContent, or url.",
            )
        })?;
    if !dispatcher.availability.is_available(tool.as_str()) {
        return Err(failure(
            "classificationContextUnavailable",
            "The resource reader is disabled in this runtime.",
            "Enable the reader before assessing this source.",
        ));
    }
    let query = super::prepare_source(tool, &source["query"], dispatcher)?;
    let (text, path, snapshot, local_check) = match tool {
        ToolId::LocalFetch => {
            let (text, canonical, snapshot) = dispatcher.capture_local_text(&query, context)?;
            let check = json!({"tool":"localFetch","query":{"path":query["path"],"snapshot":snapshot,"fullContent":true},"canonical":canonical});
            (text, canonical, snapshot, Some(check))
        }
        ToolId::GhGetFileContent => {
            let captured = dispatcher.capture_github_content(
                &query,
                context,
                DomainDispatcher::text_capture_limit(),
            )?;
            if captured.bytes.contains(&0)
                || octocode_engine::text::sniff(&captured.bytes)
                    == octocode_engine::text::BinaryVerdict::Binary
            {
                return Err(failure(
                    "classificationContextUnavailable",
                    "Section assessment requires text; this resource is binary.",
                    "Use an explicit image asset for image questions.",
                ));
            }
            let text = String::from_utf8(captured.bytes.to_vec()).map_err(|_| {
                failure(
                    "classificationContextUnavailable",
                    "The source is not valid UTF-8 text; no sections were inferred.",
                    "Use a text representation with known encoding.",
                )
            })?;
            (
                text,
                PathBuf::from(query["path"].as_str().unwrap_or_default()),
                captured.resolved_ref,
                None,
            )
        }
        _ => {
            return Err(failure(
                "invalidClassificationContext",
                "The resource reader is unsupported.",
                "Use localFetch, ghGetFileContent, or url.",
            ));
        }
    };
    let read = super::read_lead(tool, &query, Some(&snapshot));
    Ok(TextResource {
        text,
        path,
        metadata: json!({"status":"ready","source":source,"snapshot":snapshot,"coordinateSpace":"source","read":read}),
        local_check,
    })
}

pub(crate) fn validate_local(
    source: &Value,
    dispatcher: &DomainDispatcher,
    context: &ExecutionContext,
) -> Result<(), ClassificationError> {
    let query = super::prepare_source(ToolId::LocalFetch, &source["query"], dispatcher)?;
    dispatcher
        .capture_local_text(&query, context)
        .map_err(|mut error| {
            if error.code == "invalidClassificationContext" {
                return failure(
                    "classificationContextUnavailable",
                    "The retained local source identity is invalid.",
                    "Start a fresh sections request.",
                );
            }
            if matches!(error.code.as_str(), "staleSnapshot" | "sourceMismatch") {
                error.code = "sourceMismatch".into();
            }
            error
        })
        .and_then(|(_, canonical, _)| {
            if source["canonical"] == json!(canonical) {
                Ok(())
            } else {
                Err(failure("sourceMismatch", "The original local source locator now resolves to a different file; no new inference ran.", "Start a fresh sections request to assess the changed source."))
            }
        })
}

pub(crate) fn selected_ranges(
    text: &str,
    query: &Value,
) -> Result<Vec<Range<usize>>, ClassificationError> {
    let requested = query["ranges"]
        .as_array()
        .filter(|ranges| !ranges.is_empty());
    let Some(requested) = requested else {
        return Ok(if text.is_empty() {
            Vec::new()
        } else {
            std::iter::once(0..text.len()).collect()
        });
    };
    let mut starts = vec![0];
    starts.extend(text.bytes().enumerate().filter_map(|(index, byte)| {
        (byte == b'\n' && index + 1 < text.len()).then_some(index + 1)
    }));
    let mut selected = Vec::new();
    for range in requested {
        let (start, end): (usize, usize) = range
            .as_str()
            .and_then(crate::tools::line_spans::parse_span)
            .ok_or_else(|| {
                failure(
                    "invalidClassificationContext",
                    "The source contains an invalid line range.",
                    "Use the reader's canonical ranges field.",
                )
            })?;
        if let Some(&start_byte) = starts.get(start.saturating_sub(1)) {
            let end_byte = starts.get(end).copied().unwrap_or(text.len());
            if start_byte < end_byte {
                selected.push(start_byte..end_byte);
            }
        }
    }
    selected.sort_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::new();
    for range in selected {
        if let Some(previous) = merged.last_mut()
            && previous.end >= range.start
        {
            previous.end = previous.end.max(range.end);
        } else {
            merged.push(range);
        }
    }
    if merged.is_empty() && !text.is_empty() {
        return Err(failure(
            "classificationContextEmpty",
            "The requested resource ranges select no text.",
            "Check the source ranges or use fullContent.",
        ));
    }
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_ranges_merge_overlap_without_repeating_or_inventing_bytes() {
        let text = "α\r\n🙂\n三\nlast";
        let ranges =
            selected_ranges(text, &json!({"ranges":["3-4","1-1","3-3"]})).expect("valid ranges");
        assert_eq!(ranges, vec![0..4, 9..text.len()]);
        assert_eq!(
            ranges
                .iter()
                .map(|range| &text[range.clone()])
                .collect::<String>(),
            "α\r\n三\nlast"
        );
    }
}

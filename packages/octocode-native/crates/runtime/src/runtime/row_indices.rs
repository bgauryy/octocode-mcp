//! Original batch row positions and placement of rejected rows on page one.

use crate::runtime::ToolOutcome;
use crate::tools::id::ToolId;
use serde_json::{Value, json};

/// Original indices of the admitted rows: every input position not rejected.
pub(crate) fn admitted_indices(admitted: usize, rejected: &[usize]) -> Vec<usize> {
    (0..admitted + rejected.len())
        .filter(|position| !rejected.contains(position))
        .take(admitted)
        .collect()
}

/// Each input position's admitted query, `None` at a rejected position.
pub(crate) fn by_position<'a>(queries: &'a [Value], rejected: &[usize]) -> Vec<Option<&'a Value>> {
    let mut admitted = queries.iter();
    (0..queries.len() + rejected.len())
        .map(|position| {
            if rejected.contains(&position) {
                None
            } else {
                admitted.next()
            }
        })
        .collect()
}

/// Whether `outcome` is one page of a longer response.
pub(crate) fn is_paged(outcome: &ToolOutcome) -> bool {
    outcome.structured_content["responsePagination"]["hasMore"] == true
}

/// Show the rejected rows on the first page: in `results` at their indices,
/// and before the page's text.
pub(crate) fn attach_rejected(
    outcome: &mut ToolOutcome,
    rejected: Vec<Value>,
    tool: ToolId,
    query: &Value,
    format: crate::response::render::TextFormat,
) {
    if rejected.is_empty() {
        return;
    }
    let structured = &mut outcome.structured_content;
    let whole_rows = structured.get("responseWindow").is_none();
    let rendered = crate::response::render::render_tool(
        tool,
        &json!({"results": rejected.clone()}),
        query,
        format,
    );
    if !structured.get("results").is_some_and(Value::is_array) {
        structured["results"] = json!([]);
    }
    if let Some(rows) = structured["results"].as_array_mut() {
        rows.extend(rejected);
        rows.sort_by_key(|row| row["index"].as_u64());
    }
    let Some(content) = outcome.content.first_mut() else {
        return;
    };
    // Row pages carry the envelope itself as text; a text window gets the
    // rejected rows' rendering ahead of its window.
    if whole_rows && content.text.starts_with('{') {
        content.text = outcome.structured_content.to_string();
    } else {
        content.text = format!("{rendered}\n{}", content.text);
    }
}

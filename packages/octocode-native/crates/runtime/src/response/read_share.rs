//! Source line pages share one response window. The ordinary read owns source
//! coordinates and security; this boundary accounts for JSON escaping, UTF-16
//! and source gutters before the public response is rendered. Oversized rows
//! are reread as shorter line pages, retaining their executable continuations.
//! A byte page or a completed ranked row without a replay plan remains
//! indivisible; one source line may itself exceed the response target.

use serde_json::{Map, Value};

use super::row_pages::fair_shares;
use crate::runtime::ExecutionError;
use crate::runtime::dispatch::DomainResult;
use crate::tools::id::ToolId;
use crate::tools::id::continuation_channels::PAGES_KEY;
use crate::tools::stream_page::{json_chars, json_text_chars};

/// Room for the envelope around the rows: `base`, `shared`, and the
/// response-level warning that names the partial rows.
const ENVELOPE_CHARS: usize = 512;

/// Room for a shortened row's `next.continueWindow` beyond the query it copies:
/// tool name, offset, unit, and the row's remaining-lines warning.
const CONTINUATION_EXTRA_CHARS: usize = 192;

/// Tools whose rows each carry one source `content` string.
fn reads_source(tool: ToolId) -> bool {
    tool.output().text_shape() == crate::tools::output::TextShape::FileText
}

/// Chars the `<line>\t` gutter adds to each content line once the response
/// numbers it: the line number's digits plus the JSON-escaped tab.
fn gutter_chars(file: &Map<String, Value>) -> usize {
    if file
        .get("contentView")
        .and_then(Value::as_str)
        .is_some_and(|view| view != "none")
        || file
            .get("pagination")
            .and_then(|pagination| pagination.get("unit"))
            .and_then(Value::as_str)
            == Some("bytes")
    {
        return 0;
    }
    let last = file.get("totalLines").and_then(Value::as_u64).unwrap_or(0);
    last.max(1).to_string().len() + 2
}

/// Chars one content line takes in the response.
fn line_chars(line: &str, gutter: usize) -> usize {
    json_text_chars(line) + gutter
}

/// The row's `content`, when the row is a successful read with text.
fn content(row: &DomainResult) -> Option<(&str, usize)> {
    if row.failure.is_some() || row.status.is_some() {
        return None;
    }
    let file = row.data.as_object()?;
    let text = file.get("content")?.as_str()?;
    (!text.is_empty()).then(|| (text, gutter_chars(file)))
}

/// Estimated response chars of a row: its JSON plus the line-number gutter.
fn row_chars(row: &DomainResult) -> usize {
    let gutter = row
        .data
        .as_object()
        .and_then(|file| {
            file.get("content")?
                .as_str()
                .map(|text| (text, gutter_chars(file)))
        })
        .map_or(0, |(text, gutter)| {
            text.split_inclusive('\n').count() * gutter
        });
    json_chars(&row.data) + gutter
}

/// Line windows keep their coordinate; a full read can become a line
/// window only at its start. Byte windows are never reshaped here.
fn pages_by_lines(query: &Value) -> bool {
    match query.get("unit").and_then(Value::as_str) {
        Some("lines") => true,
        Some(_) => false,
        None => {
            query.get("fullContent") != Some(&Value::Bool(true))
                || query.get("offset").and_then(Value::as_u64).unwrap_or(0) == 0
        }
    }
}

/// Lines of `text` that fit `allowance` chars; at least one, so every row
/// shows content.
fn lines_within(text: &str, gutter: usize, allowance: usize) -> usize {
    let mut used = 0;
    let mut lines = 0;
    for line in text.split_inclusive('\n') {
        let chars = line_chars(line, gutter);
        if lines > 0 && used + chars > allowance {
            break;
        }
        used += chars;
        lines += 1;
    }
    lines
}

/// Line-page sizes for the rows of one batch that overflow `window`: row
/// index to the lines its shorter page keeps.
fn plan(
    tool: ToolId,
    queries: &[Value],
    rows: &[DomainResult],
    window: usize,
) -> Vec<(usize, usize)> {
    if !reads_source(tool) || rows.is_empty() || rows.len() != queries.len() {
        return Vec::new();
    }
    let sizes: Vec<usize> = rows.iter().map(row_chars).collect();
    if sizes.iter().sum::<usize>() + ENVELOPE_CHARS <= window {
        return Vec::new();
    }
    let shares = fair_shares(&sizes, window.saturating_sub(ENVELOPE_CHARS));
    let mut cuts = Vec::new();
    for (index, (row, query)) in rows.iter().zip(queries).enumerate() {
        let byte_page =
            row.data.pointer("/pagination/unit").and_then(Value::as_str) == Some("bytes");
        let selected_without_plan = row.data.get("selection").is_some_and(Value::is_object)
            && query.get("selection").is_none()
            && read_continuation(row)
                .and_then(|query| query.get("selection"))
                .is_none();
        if sizes[index] <= shares[index]
            || !pages_by_lines(query)
            || byte_page
            || selected_without_plan
        {
            continue;
        }
        let Some((text, gutter)) = content(row) else {
            continue;
        };
        let text_chars: usize = text
            .split_inclusive('\n')
            .map(|line| line_chars(line, gutter))
            .sum();
        let around =
            sizes[index].saturating_sub(text_chars) + json_chars(query) + CONTINUATION_EXTRA_CHARS;
        let keep = lines_within(text, gutter, shares[index].saturating_sub(around));
        if keep < text.split_inclusive('\n').count() {
            cuts.push((index, keep));
        }
    }
    cuts
}

fn read_continuation(row: &DomainResult) -> Option<&Value> {
    row.data
        .get(PAGES_KEY)?
        .get("continueWindow")
        .and_then(crate::tools::result::continuation_row)
}

/// Restore the caller's line-page maximum rather than the temporary share.
/// Byte continuations retain their own coordinate and page length.
fn restore_page_size(data: &mut Value, original: &Value) {
    let Some(Value::Object(next)) = data.get_mut(PAGES_KEY) else {
        return;
    };
    for call in next.values_mut() {
        if let Some(Value::Object(query)) = crate::tools::result::continuation_row_mut(call)
            && query.get("unit").and_then(Value::as_str) != Some("bytes")
        {
            match original.get("length") {
                Some(length) => {
                    query.insert("length".into(), length.clone());
                }
                None => {
                    query.remove("length");
                }
            }
        }
    }
}

/// Re-read each row of an overflowing `localFetch`/`ghGetFileContent` response
/// that exceeds its fair share of `window` as a shorter line page. `rerun`
/// executes the shortened queries (in order) and returns one row each; a
/// shortened read that fails keeps the row's first result.
pub(crate) fn share_window(
    tool: ToolId,
    queries: &[Value],
    mut rows: Vec<DomainResult>,
    window: Option<usize>,
    rerun: impl FnOnce(&[Value]) -> Result<Vec<DomainResult>, ExecutionError>,
) -> Result<Vec<DomainResult>, ExecutionError> {
    let Some(window) = window.filter(|window| *window > 0) else {
        return Ok(rows);
    };
    let cuts = plan(tool, queries, &rows, window);
    if cuts.is_empty() {
        return Ok(rows);
    }
    let shortened: Vec<Value> = cuts
        .iter()
        .map(|&(index, lines)| {
            let mut query = queries[index].clone();
            if let Some(replay) = read_continuation(&rows[index]) {
                for field in ["snapshot", "selection", "ref"] {
                    if let Some(value) = replay.get(field) {
                        query[field] = value.clone();
                    }
                }
            }
            // A whole-file read pages as the same view without
            // `fullContent`, which window controls cannot accompany.
            // `fullContent` implies the verbatim view, so a read with no
            // named view pins it: a tool whose default view is minified
            // (ghGetFileContent) would otherwise drop lines.
            if let Some(fields) = query.as_object_mut()
                && fields.remove("fullContent") == Some(Value::Bool(true))
            {
                fields.insert("offset".into(), Value::from(0));
                fields
                    .entry("minify")
                    .or_insert_with(|| Value::from("none"));
            }
            query["unit"] = Value::from("lines");
            query["length"] = Value::from(lines);
            query
        })
        .collect();
    let reread = rerun(&shortened)?;
    for (&(index, _), mut row) in cuts.iter().zip(reread) {
        if content(&row).is_none() {
            continue;
        }
        restore_page_size(&mut row.data, &queries[index]);
        rows[index] = row;
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn local_row(lines: usize, width: usize) -> DomainResult {
        let text: String = (1..=lines)
            .map(|line| format!("{line:05}{}\n", "x".repeat(width)))
            .collect();
        DomainResult::payload(
            json!({"path":"a.txt","content":text,"totalLines":lines}),
            None,
        )
    }

    fn query(extra: Value) -> Value {
        let mut query = json!({"path":"a.txt"});
        for (key, value) in extra.as_object().into_iter().flatten() {
            query[key] = value.clone();
        }
        query
    }

    fn read_local(
        query: &Value,
        policy: &crate::policy::path::PathPolicy,
        security: &crate::security::ContentSecurity,
        window: usize,
    ) -> DomainResult {
        let prepared =
            crate::contracts::prepare_many_and_validate("localFetch", json!({"queries":[query]}))
                .expect("canonical query");
        let request = serde_json::from_value(prepared[0].clone()).expect("query");
        let result = crate::tools::local_fetch::execute_local_fetch(
            &request,
            policy,
            security,
            &crate::tools::cancel::NeverCancel,
            &crate::tools::local_fetch::LocalFetchRegex,
            Some(window),
        );
        assert_eq!(result.status, "success", "{result:?}");
        DomainResult::payload(serde_json::to_value(result).expect("result"), None)
    }

    fn walk_local(
        mut query: Value,
        policy: &crate::policy::path::PathPolicy,
        window: usize,
        shared: bool,
    ) -> (Vec<String>, usize) {
        let security = crate::security::ContentSecurity::new();
        let mut records = Vec::new();
        let mut rereads = 0;
        for _ in 0..200 {
            let mut rows = vec![read_local(&query, policy, &security, window)];
            if shared {
                rows = share_window(
                    ToolId::LocalFetch,
                    &[query.clone()],
                    rows,
                    Some(window),
                    |shortened| {
                        rereads += 1;
                        Ok(shortened
                            .iter()
                            .map(|query| read_local(query, policy, &security, window))
                            .collect())
                    },
                )
                .expect("shared read");
            }
            let mut wire =
                crate::tools::test_support::published(ToolId::LocalFetch, &query, &rows[0].data);
            crate::tools::numbered::number_read_rows(ToolId::LocalFetch, &mut wire);
            crate::tools::test_support::checks::assert_output_contract("localFetch", &wire);
            if shared {
                assert!(
                    json_chars(&wire) <= window,
                    "{} > {window}",
                    json_chars(&wire)
                );
            }
            let data = &wire["results"][0]["data"];
            records.extend(
                data["content"]
                    .as_str()
                    .expect("content")
                    .lines()
                    .filter(|line| *line != "--")
                    .map(str::to_owned),
            );
            let Some(next) = data["next"].get("continueWindow") else {
                return (records, rereads);
            };
            let prepared =
                crate::contracts::prepare_many_and_validate("localFetch", next["query"].clone())
                    .expect("canonical continuation");
            query = prepared[0].clone();
        }
        panic!("read failed to terminate");
    }

    #[test]
    fn single_short_line_reads_fit_the_numbered_json_window_and_copy_every_page() {
        let root = crate::tools::test_support::Fixture::new();
        let path = root.write("short.txt", "x\n".repeat(12_000));
        let policy = crate::tools::test_support::workspace_policy(&root.0);
        for window in [20_000, 50_000] {
            for extra in [
                json!({"fullContent":true}),
                json!({"unit":"lines","length":50_000}),
                json!({"ranges":["1-3000","9001-12000"]}),
            ] {
                let mut query = json!({"path":path});
                query
                    .as_object_mut()
                    .expect("object")
                    .extend(extra.as_object().expect("extra").clone());
                let (expected, _) = walk_local(query.clone(), &policy, window, false);
                let (actual, _) = walk_local(query, &policy, window, true);
                assert_eq!(actual, expected);
                assert_eq!(
                    actual
                        .iter()
                        .collect::<std::collections::BTreeSet<_>>()
                        .len(),
                    actual.len()
                );
            }
        }
    }

    #[test]
    fn late_match_and_transformed_line_pages_keep_their_source_coordinates() {
        let root = crate::tools::test_support::Fixture::new();
        let literal = format!("\"{}🙂\"", "\\".repeat(16));
        let source: String = (1..=5_000)
            .map(|line| {
                if line <= 1_000 {
                    format!("// omitted {line}\n")
                } else if line % 3 == 0 {
                    format!("const needle_{line} = {literal};\n")
                } else {
                    format!("const value_{line} = {literal};\n")
                }
            })
            .collect();
        let path = root.write("views.ts", source);
        let policy = crate::tools::test_support::workspace_policy(&root.0);
        for window in [20_000, 50_000] {
            for extra in [
                json!({"matchString":"needle", "contextLines":1}),
                json!({"minify":"standard", "unit":"lines"}),
                json!({"minify":"standard", "ranges":["1100-2800","3500-5000"]}),
            ] {
                let mut query = json!({"path":path});
                query
                    .as_object_mut()
                    .expect("object")
                    .extend(extra.as_object().expect("extra").clone());
                let (expected, _) = walk_local(query.clone(), &policy, window, false);
                let (actual, rereads) = walk_local(query, &policy, window, true);
                assert!(rereads > 0, "view must exercise response resizing: {extra}");
                assert!(!actual.is_empty());
                assert_eq!(actual, expected);
                assert_eq!(
                    actual
                        .iter()
                        .collect::<std::collections::BTreeSet<_>>()
                        .len(),
                    actual.len()
                );
            }
        }
    }

    #[test]
    fn indivisible_rows_keep_their_receipt_and_do_not_rerun_evaluation() {
        for mut row in [local_row(900, 60), local_row(1, 60_000)] {
            if row.data["content"]
                .as_str()
                .expect("content")
                .lines()
                .count()
                > 1
            {
                row.data["selection"] = json!({"status":"complete","scope":"selectedView","selectedItems":2,"totalItems":2});
            }
            let expected = row.data.clone();
            let mut calls = 0;
            let result = share_window(
                ToolId::LocalFetch,
                &[query(json!({}))],
                vec![row],
                Some(20_000),
                |_| {
                    calls += 1;
                    Ok(Vec::new())
                },
            )
            .expect("unchanged");
            assert_eq!(calls, 0);
            assert_eq!(result[0].data, expected);
        }
        let row = local_row(7, 60);
        let expected = row.data.clone();
        let mut calls = 0;
        let result = share_window(
            ToolId::LocalFetch,
            &[query(json!({"length":7}))],
            vec![row],
            Some(20_000),
            |_| {
                calls += 1;
                Ok(Vec::new())
            },
        )
        .expect("explicit fit");
        assert_eq!(calls, 0);
        assert_eq!(result[0].data, expected);
    }

    #[test]
    fn shortened_reads_reuse_native_identity_and_restore_explicit_line_maximums() {
        for tool in [ToolId::LocalFetch, ToolId::GhGetFileContent] {
            let original = query(json!({"unit":"lines", "length":900}));
            let mut row = local_row(900, 60);
            row.data["selection"] = json!({"status":"complete"});
            row.data["next"] = json!({"continueWindow":{"tool":tool.as_str(),"query":{"queries":[{
                "path":"a.txt", "offset":900, "snapshot":"native-snapshot", "selection":"native-plan", "ref":"native-commit"
            }]}}});
            let mut calls = 0;
            let result = share_window(tool, std::slice::from_ref(&original), vec![row], Some(20_000), |shortened| {
                calls += 1;
                assert_eq!(shortened.len(), 1);
                let query = &shortened[0];
                assert_eq!(query["selection"], "native-plan");
                assert_eq!(query["snapshot"], "native-snapshot");
                assert_eq!(query["ref"], "native-commit");
                assert!(query.get("offset").is_none());
                assert!(query["length"].as_u64().is_some_and(|length| length < 900));
                let length = query["length"].as_u64().expect("length") as usize;
                let mut row = local_row(length, 60);
                row.data["next"] = json!({"continueWindow":{"tool":tool.as_str(),"query":{"queries":[{
                    "path":"a.txt", "offset":length, "length":length, "unit":"lines", "selection":"native-plan"
                }]}}});
                Ok(vec![row])
            }).expect("shortened");
            assert_eq!(calls, 1);
            let continued = read_continuation(&result[0]).expect("continuation");
            assert_eq!(continued["length"], 900);
            assert_eq!(continued["selection"], "native-plan");
        }
    }

    #[test]
    fn a_batch_that_fits_is_left_alone() {
        let rows = vec![local_row(10, 20), local_row(10, 20)];
        let queries = vec![query(json!({})), query(json!({}))];
        assert!(plan(ToolId::LocalFetch, &queries, &rows, 20_000).is_empty());
    }

    #[test]
    fn overflowing_rows_get_fair_line_pages_and_small_rows_keep_theirs() {
        let rows = vec![local_row(5, 20), local_row(300, 60), local_row(300, 60)];
        let queries = vec![query(json!({})), query(json!({})), query(json!({}))];
        let cuts = plan(ToolId::LocalFetch, &queries, &rows, 20_000);
        assert_eq!(cuts.iter().map(|cut| cut.0).collect::<Vec<_>>(), vec![1, 2]);
        for (_, lines) in &cuts {
            assert!((100..300).contains(lines), "{cuts:?}");
        }
    }

    #[test]
    fn byte_offsets_are_not_reshaped() {
        let rows = vec![local_row(300, 60), local_row(300, 60), local_row(300, 60)];
        let queries = vec![
            query(json!({"unit": "bytes", "length": 300})),
            query(json!({"fullContent": true, "offset": 4096})),
            query(json!({"unit": "bytes", "offset": 10})),
        ];
        assert!(plan(ToolId::LocalFetch, &queries, &rows, 20_000).is_empty());
    }

    #[test]
    fn single_rows_are_sized_and_other_tools_are_not_reshaped() {
        let rows = vec![local_row(900, 60)];
        assert_eq!(
            plan(ToolId::LocalFetch, &[query(json!({}))], &rows, 20_000).len(),
            1
        );
        let rows = vec![local_row(300, 60), local_row(300, 60)];
        let queries = vec![query(json!({})), query(json!({}))];
        assert!(plan(ToolId::LocalSearch, &queries, &rows, 20_000).is_empty());
    }

    #[test]
    fn shortened_rows_replace_the_first_read_and_continue_at_the_default_page() {
        let rows = vec![local_row(300, 60), local_row(300, 60)];
        let queries = vec![query(json!({})), query(json!({}))];
        let mut seen = Vec::new();
        let shared = share_window(
            ToolId::LocalFetch,
            &queries,
            rows,
            Some(20_000),
            |shortened| {
                seen = shortened.to_vec();
                Ok(shortened
                    .iter()
                    .map(|query| {
                        let lines = query["length"].as_u64().unwrap_or(0) as usize;
                        let mut row = local_row(lines, 60);
                        row.data["next"] = json!({"continueWindow":{"tool":"localFetch","query":{"queries":[{
                        "path":"a.txt","offset":lines,"unit":"lines","length":lines}]}}});
                        row
                    })
                    .collect())
            },
        )
        .expect("shared");
        assert_eq!(seen.len(), 2);
        assert!(seen.iter().all(|query| query["unit"] == "lines"));
        for row in &shared {
            let next = &row.data["next"]["continueWindow"]["query"]["queries"][0];
            assert!(next.get("length").is_none(), "{next}");
            assert!(next["offset"].as_u64().is_some_and(|offset| offset > 0));
        }
        let total: usize = shared.iter().map(row_chars).sum();
        assert!(total + ENVELOPE_CHARS <= 20_000, "{total}");
    }

    #[test]
    fn a_failed_shortened_read_keeps_the_first_result() {
        let rows = vec![local_row(300, 60), local_row(300, 60)];
        let queries = vec![query(json!({})), query(json!({}))];
        let shared = share_window(
            ToolId::LocalFetch,
            &queries,
            rows,
            Some(20_000),
            |shortened| {
                Ok(shortened
                    .iter()
                    .map(|_| DomainResult::payload(json!({"error":"gone"}), Some("error")))
                    .collect())
            },
        )
        .expect("shared");
        assert!(shared.iter().all(|row| row.data["content"].is_string()));
    }

    #[test]
    fn github_rows_are_measured_and_reshaped_through_their_file() {
        let file = |lines: usize| {
            let text: String = (1..=lines)
                .map(|line| format!("{line:05}{}\n", "y".repeat(60)))
                .collect();
            DomainResult::payload(
                json!({"owner":"o","repo":"r","path":"a.rs","content":text,"totalLines":lines}),
                None,
            )
        };
        let rows = vec![file(300), file(300), file(4)];
        let queries = vec![
            json!({"owner":"o","repo":"r","path":"a.rs","fullContent":true}),
            json!({"owner":"o","repo":"r","path":"b.rs","fullContent":true}),
            json!({"owner":"o","repo":"r","path":"c.rs","fullContent":true}),
        ];
        let cuts = plan(ToolId::GhGetFileContent, &queries, &rows, 20_000);
        assert_eq!(cuts.iter().map(|cut| cut.0).collect::<Vec<_>>(), vec![0, 1]);
    }

    /// `fullContent` implies the verbatim view; the shortened read that drops
    /// it keeps that view unless the caller named one.
    #[test]
    fn dropping_full_content_pins_the_verbatim_view() {
        for (tool, minify, expected) in [
            (ToolId::GhGetFileContent, None, "none"),
            (ToolId::GhGetFileContent, Some("standard"), "standard"),
            (ToolId::GhGetFileContent, Some("symbols"), "symbols"),
            (ToolId::LocalFetch, None, "none"),
            (ToolId::LocalFetch, Some("standard"), "standard"),
        ] {
            let mut original = query(json!({"fullContent":true}));
            if let Some(minify) = minify {
                original["minify"] = json!(minify);
            }
            let mut seen = Vec::new();
            share_window(
                tool,
                std::slice::from_ref(&original),
                vec![local_row(900, 60)],
                Some(20_000),
                |shortened| {
                    seen = shortened.to_vec();
                    Ok(Vec::new())
                },
            )
            .expect("shortened");
            assert_eq!(seen.len(), 1, "{tool:?} {minify:?}");
            assert!(seen[0].get("fullContent").is_none(), "{}", seen[0]);
            assert_eq!(seen[0]["minify"], expected, "{tool:?} {}", seen[0]);
        }
    }
}

//! Complete line windows for source-order evidence selection.
//! Windows retain original line anchors and never split a source line.
use crate::security::scan::ContentScan;
use crate::tools::selection::Candidate;
use crate::tools::source_sections::{LineEdges, line_edges};
use serde_json::json;
use std::ops::Range;
use std::path::Path;

const TARGET_CHARS: usize = 2_048;

pub(super) struct Chunk {
    bytes: Range<usize>,
    lines: Vec<usize>,
}

/// The candidate chunks of view `text`. `source_lines` maps each view line
/// to its source line when the view was extracted from `source` (ranges,
/// matches); chunk edges follow the source's declarations either way.
#[allow(clippy::too_many_arguments)]
pub(super) fn chunks(
    text: &str,
    source_lines: Option<&[usize]>,
    source: Option<&str>,
    path: &Path,
    provider_path: &str,
    security: &impl ContentScan,
    runtime: Option<&crate::tools::selection::Runtime>,
    prior: Option<&str>,
    unsupported: Option<&'static str>,
) -> (Vec<Candidate>, Vec<Chunk>) {
    if let Some(source_lines) = source_lines
        && source_lines.len() != text.split_inclusive('\n').count()
    {
        return (
            vec![Candidate::new(None)],
            vec![Chunk {
                bytes: 0..text.len(),
                lines: source_lines.to_vec(),
            }],
        );
    }
    // A candidate keeps a bounded declaration and its documentation whole.
    // Oversized containers leave their nested declarations available; other
    // source keeps complete line windows, which end where a declaration
    // starts or ends once half full.
    let outline = if source_lines.is_none() {
        Some(text)
    } else {
        source
    };
    let edges = outline.map_or_else(LineEdges::default, |outline| {
        line_edges(
            outline,
            path,
            runtime.map_or(
                crate::runtime::RuntimeLimits::DEFAULT.selection.max_chars,
                |runtime| runtime.limits.max_chars,
            ),
        )
    });
    let declarations = &edges.windows;
    let mut declaration_index = 0;
    let mut previous_declaration = None;
    let mut chunks = Vec::new();
    let mut start = 0;
    let mut count = 0usize;
    let mut offset = 0;
    let mut lines = Vec::new();
    let mut last_source_line = None;
    for (index, record) in text.split_inclusive('\n').enumerate() {
        let chars = record.chars().count();
        let line = source_lines.map_or(index + 1, |map| map[index]);
        let contiguous =
            last_source_line.is_none_or(|last: usize| last.checked_add(1) == Some(line));
        while declarations
            .get(declaration_index)
            .is_some_and(|range| range.end <= line)
        {
            declaration_index += 1;
        }
        let declaration = declarations
            .get(declaration_index)
            .filter(|range| range.contains(&line))
            .map(|_| declaration_index);
        let declaration_break = declaration != previous_declaration;
        let outline_edge = declaration.is_none()
            && count >= TARGET_CHARS / 2
            && (edges.starts.contains(&line)
                || last_source_line.is_some_and(|last| edges.ends.contains(&last)));
        if last_source_line.is_some()
            && (line == super::extraction::OMISSION_LINE
                || !contiguous
                || declaration_break
                || outline_edge
                || (declaration.is_none() && count.saturating_add(chars) > TARGET_CHARS))
        {
            chunks.push(Chunk {
                bytes: start..offset,
                lines: std::mem::take(&mut lines),
            });
            start = offset;
            count = 0;
            last_source_line = None;
        }
        count += chars;
        lines.push(line);
        if line != super::extraction::OMISSION_LINE {
            last_source_line = Some(line);
        }
        offset += record.len();
        previous_declaration = declaration;
    }
    if last_source_line.is_some() {
        chunks.push(Chunk {
            bytes: start..text.len(),
            lines,
        });
    } else if let Some(last) = chunks.last_mut() {
        last.bytes.end = text.len();
        last.lines.extend(lines);
    }
    let needs_states =
        crate::tools::selection::needs_candidate_states(runtime, prior, unsupported, chunks.len());
    let candidates = chunks
        .iter()
        .map(|chunk| {
            let record = &text[chunk.bytes.clone()];
            let state = if !needs_states {
                None
            } else {
                security.sanitize(record, path).ok().map(|(safe, _)| {
                    json!({
                        "path": provider_path,
                        "sourceLines": chunk.lines,
                        "content": safe,
                    })
                })
            };
            Candidate::new(state)
        })
        .collect();
    (candidates, chunks)
}

/// A selected view's plan and the source lines of its unknown chunks.
pub(crate) struct Chosen {
    pub(crate) outcome: crate::tools::selection::Outcome,
    /// `ranges` entries (`"a-b"`, merged) covering every unknown chunk.
    unknown_ranges: Vec<String>,
    /// The ranges read fewer source lines than the whole view holds.
    narrower: bool,
    /// The provider's error when it could not answer for this page: the
    /// view is shown unfiltered under an `unavailable` receipt.
    provider: Option<crate::tools::selection::ProviderError>,
}

impl Chosen {
    pub(super) fn new(
        outcome: crate::tools::selection::Outcome,
        provider: Option<crate::tools::selection::ProviderError>,
        chunks: &[Chunk],
    ) -> Self {
        let judged = outcome
            .selected
            .iter()
            .chain(&outcome.excluded)
            .copied()
            .collect::<std::collections::HashSet<_>>();
        let mut view_lines = std::collections::BTreeSet::new();
        let mut unknown = std::collections::BTreeSet::new();
        for (ordinal, chunk) in chunks.iter().enumerate() {
            let lines = chunk
                .lines
                .iter()
                .copied()
                .filter(|&line| line != super::extraction::OMISSION_LINE);
            if !outcome.considers(ordinal) || judged.contains(&ordinal) {
                view_lines.extend(lines);
            } else {
                for line in lines {
                    view_lines.insert(line);
                    unknown.insert(line);
                }
            }
        }
        let unknown_lines = unknown.len();
        Self {
            outcome,
            unknown_ranges: crate::tools::line_spans::runs(unknown)
                .into_iter()
                .map(|(start, end)| format!("{start}-{end}"))
                .collect(),
            narrower: unknown_lines < view_lines.len(),
            provider,
        }
    }

    /// The token of `next.nextCandidatePage`, when the budget left chunks
    /// unjudged.
    pub(super) fn next_candidates(&self) -> Option<&str> {
        self.outcome
            .next_candidates(crate::tools::id::ToolId::LocalFetch)
    }

    /// The first-page note: the provider's error when the view is shown
    /// unfiltered because it could not answer, else the chunks the
    /// candidate budget left unjudged.
    pub(super) fn disclosure(&self) -> Option<String> {
        if let Some(error) = &self.provider {
            return Some(crate::tools::selection::unclassified_warning(
                error,
                "this read",
                "its content is",
            ));
        }
        self.next_candidates()?;
        let total = self.outcome.receipt.total_items;
        let unjudged = self.outcome.unjudged.len();
        let judged = usize::try_from(total).unwrap_or(0).saturating_sub(unjudged);
        Some(format!(
            "clasifyContext judged {judged} of {total} chunks (candidate budget); {unjudged} were not judged: the next candidate page judges them."
        ))
    }

    /// Exactly the unknown chunks as plain `ranges` reads of `query`'s file,
    /// each row as many ranges as a row takes, when some chunks were judged
    /// and the ranges read less than the whole view. Empty otherwise.
    pub(super) fn unknown_reads(&self, query: &serde_json::Value) -> Vec<serde_json::Value> {
        let receipt = &self.outcome.receipt;
        let cap = crate::contracts::query_schema_number(
            crate::tools::id::ToolId::LocalFetch,
            None,
            "ranges",
            "maxItems",
        )
        .and_then(|n| usize::try_from(n).ok())
        .filter(|cap| *cap > 0);
        let Some(cap) = cap else {
            return Vec::new();
        };
        if self.unknown_ranges.is_empty()
            || !self.narrower
            || receipt.unknown_items >= receipt.total_items
        {
            return Vec::new();
        }
        let mut row = crate::tools::selection::unfiltered_row(query, &[]);
        let Some(fields) = row.as_object_mut() else {
            return Vec::new();
        };
        // The unknown chunks are source lines: read them as lines, not as
        // the selection (hits, context, declarations, whole file) they came from.
        for field in [
            "matchString",
            "contextLines",
            "regex",
            "caseMode",
            "block",
            "fullContent",
        ] {
            fields.remove(field);
        }
        self.unknown_ranges
            .chunks(cap)
            .map(|ranges| {
                let mut read = row.clone();
                read["ranges"] = json!(ranges);
                read
            })
            .collect()
    }

    /// Chars a classified page carries beside its text: the plan token its
    /// next page names, the receipt, the unfiltered and candidate-page
    /// leads (each a copy of `query`). The page's text leaves room for
    /// them, so the row stays within the response window it was cut for.
    pub(super) fn row_chars(&self, query: &serde_json::Value) -> usize {
        use crate::tools::stream_page::json_chars;
        let receipt = serde_json::to_value(&self.outcome.receipt)
            .as_ref()
            .map_or(0, json_chars);
        // `"selection":` and the like around the values.
        const KEYS: usize = 100;
        if !self.outcome.leaves_out() {
            // No unfiltered or candidate-page lead: the view leaves nothing out.
            return json_chars(&json!(self.outcome.token)) + receipt + KEYS;
        }
        let whole = crate::tools::selection::unfiltered_row(query, &[]);
        let unknown = self
            .unknown_reads(query)
            .iter()
            .map(json_chars)
            .sum::<usize>();
        let candidates = self
            .next_candidates()
            .map_or(0, |token| json_chars(query) + json_chars(&json!(token)));
        // `"unfiltered":{"tool":…,"query":{"queries":[…]}}` and the like.
        let calls = 2 + usize::from(candidates > 0) + self.unknown_reads(query).len();
        json_chars(&json!(self.outcome.token))
            + receipt
            + unknown
            + candidates
            + json_chars(&whole)
            + KEYS * calls
    }
}

/// The selected chunks in `order` as one view, and the source line of each
/// view line. Selected chunks that are not adjacent in the source are
/// separated by one marker naming the lines between them (mapped to
/// [`super::extraction::OMISSION_LINE`]), as disjoint ranges are; a
/// chunk's own leading marker described a gap beside a chunk not shown, so
/// it gives way to that one.
pub(super) fn project(text: &str, chunks: &[Chunk], order: &[usize]) -> (String, Vec<usize>) {
    use super::extraction::OMISSION_LINE;
    let mut selected = String::with_capacity(text.len());
    let mut lines = Vec::new();
    let mut last: Option<usize> = None;
    let mut previous: Option<usize> = None;
    for &ordinal in order {
        let chunk = &chunks[ordinal];
        let body = &text[chunk.bytes.clone()];
        let mut records = body.split_inclusive('\n').zip(&chunk.lines).peekable();
        // A leading marker names the gap after the chunk before this one:
        // it stays when that chunk is shown too.
        if ordinal > 0 && previous != Some(ordinal - 1) {
            while records
                .next_if(|(_, line)| **line == OMISSION_LINE)
                .is_some()
            {}
        }
        previous = Some(ordinal);
        let first = records.peek().map(|(_, line)| **line);
        let kept_marker = first == Some(OMISSION_LINE);
        let first = first.filter(|_| !kept_marker);
        if let (Some(last), Some(first)) = (last, first)
            && first > last + 1
        {
            if !selected.is_empty() && !selected.ends_with('\n') {
                selected.push('\n');
            }
            selected.push_str(&unselected_marker(last + 1, first - 1));
            lines.push(OMISSION_LINE);
        }
        for (record, &line) in records {
            selected.push_str(record);
            lines.push(line);
            if line != OMISSION_LINE {
                last = Some(line);
            }
        }
    }
    (selected, lines)
}

/// Separates selected chunks that are not adjacent in the source.
fn unselected_marker(start: usize, end: usize) -> String {
    crate::tools::numbered::omission_marker(
        start,
        end,
        crate::tools::numbered::Omitted::NotSelected,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::SelectionLimits;
    use crate::security::ContentSecurity;
    use crate::tools::selection::{Decision, JudgeCall, Runtime, SelectionJudge};
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    use std::time::{Duration, Instant};

    struct BudgetJudge(Arc<AtomicUsize>);

    impl SelectionJudge for BudgetJudge {
        fn identity(&self) -> serde_json::Value {
            json!({"test":"budget"})
        }

        fn select(&self, call: JudgeCall<'_>) -> crate::tools::selection::Judgments {
            self.0.fetch_add(1, Ordering::SeqCst);
            let sent_chars = call
                .admitted
                .iter()
                .map(|&ordinal| {
                    call.candidates[ordinal]
                        .state
                        .as_ref()
                        .unwrap()
                        .to_string()
                        .chars()
                        .count()
                })
                .sum::<usize>();
            assert!(
                sent_chars <= call.limits.max_chars,
                "sent {sent_chars} serialized state characters with budget {}",
                call.limits.max_chars
            );
            Ok(call
                .admitted
                .iter()
                .map(|&ordinal| (ordinal, Decision::Selected))
                .collect())
        }
    }

    fn budget_runtime(handle: tokio::runtime::Handle, calls: Arc<AtomicUsize>) -> Runtime {
        Runtime {
            limits: SelectionLimits {
                max_candidates: 64,
                max_chars: 4_096,
                timeout: Duration::from_secs(5),
            },
            available: true,
            judge: Arc::new(BudgetJudge(calls)),
            handle,
            context: crate::runtime::ExecutionContext {
                cancellation: tokio_util::sync::CancellationToken::new(),
                deadline: Instant::now() + Duration::from_secs(5),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
        }
    }

    #[test]
    fn disjoint_spans_never_spend_candidate_slots_on_omission_markers() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut runtime = budget_runtime(executor.handle().clone(), calls);
        runtime.limits.max_candidates = 2;
        runtime.limits.max_chars = 20_000;
        let query = json!({"clasifyContext":{"classifiers":["Find the selected source"]}});
        for width in [8, 2_047] {
            let text = format!(
                "{}\n{}{}\n",
                "a".repeat(width),
                super::super::extraction::omission_marker(2, 9),
                "b".repeat(width),
            );
            let (candidates, windows) = chunks(
                &text,
                Some(&[1, 0, 10]),
                None,
                Path::new("source.txt"),
                "source.txt",
                &ContentSecurity::new(),
                Some(&runtime),
                None,
                None,
            );
            assert_eq!(
                candidates.len(),
                2,
                "one candidate per disjoint source span"
            );
            for (candidate, expected) in candidates.iter().zip([1, 10]) {
                let state = candidate.state.as_ref().expect("complete source state");
                let lines = state["sourceLines"].as_array().expect("source coordinates");
                let actual = lines
                    .iter()
                    .filter_map(|line| line.as_u64().filter(|line| *line > 0))
                    .collect::<Vec<_>>();
                assert_eq!(actual, [expected]);
            }
            let outcome = crate::tools::selection::select(
                Some(&runtime),
                &query,
                "source",
                None,
                &candidates,
                None,
                crate::contracts::tool_types::SelectionUnit::Chunks,
            )
            .unwrap_or_else(|_| panic!("selected source spans"));
            assert_eq!(outcome.receipt.unknown_items, 0);
            assert_eq!(outcome.receipt.selected_items, 2);
            assert_eq!(project(&text, &windows, &outcome.selected).0, text);
        }
    }

    #[test]
    fn long_line_match_candidates_keep_original_source_coordinates() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.limits.max_chars = 20_000;
        let text = format!(
            "{}needle{}needle{}\n",
            "x".repeat(3_000),
            "x".repeat(3_000),
            "x".repeat(3_000)
        );
        let query: LocalFetchQuery = serde_json::from_value(json!({
            "path":"source.txt", "matchString":"needle",
            "clasifyContext":{"classifiers":["Find needle"]}
        }))
        .unwrap();
        let extracted = super::super::extraction::extract(&query, &text, &LocalFetchRegex)
            .unwrap_or_else(|_| panic!("match extraction"));
        let source_lines = extracted.source_lines.as_ref().unwrap();
        assert_eq!(
            source_lines.len(),
            extracted.text.split_inclusive('\n').count()
        );
        let (candidates, _) = chunks(
            &extracted.text,
            Some(source_lines),
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        for candidate in candidates {
            let state = candidate.state.expect("mapped evidence");
            assert!(
                state["sourceLines"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|line| line.as_u64().is_some_and(|line| line <= 1)),
                "{state}"
            );
        }
        let read = |query: &LocalFetchQuery, runtime: &Runtime| {
            super::super::executor::process_fetched_content_selected(
                query,
                text.as_bytes(),
                Path::new("source.txt"),
                "source.txt",
                &SourceFacts::default(),
                &ContentSecurity::new(),
                &NeverCancel,
                &LocalFetchRegex,
                Some(runtime),
            )
        };
        let result = read(&query, &runtime);
        assert_eq!(result.error_code, None, "{result:?}");
        assert_eq!(result.content.as_deref(), Some(extracted.text.as_str()));
        assert_eq!(result.total_lines, Some(1));
        assert!(
            result
                .source_line_ranges
                .iter()
                .all(|range| range.start == 1 && range.end == 1),
            "{result:?}"
        );
        assert_eq!(
            result.content.as_deref().unwrap().matches("needle").count(),
            2
        );
        runtime.limits.max_candidates = 1;
        let partial = read(&query, &runtime);
        assert_eq!(partial.selection.as_ref().unwrap().unknown_items, 1);
        let recovery = partial.next.unwrap().unfiltered.unwrap().query;
        assert!(recovery.clasify_context.is_none());
        let unfiltered = read(&recovery, &runtime);
        assert_eq!(unfiltered.content.as_deref(), Some(extracted.text.as_str()));
        assert!(
            unfiltered
                .source_line_ranges
                .iter()
                .all(|range| range.start == 1 && range.end == 1)
        );
    }

    #[test]
    fn nested_declarations_in_large_containers_keep_docs_and_every_source_byte() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.limits.max_chars = 4_096;
        let prefix = "  consume();\n".repeat(400);
        let inner = "  /// Retry the connection.\n  fn retry() {\n    connect();\n  }\n";
        let text = format!("fn container() {{\n{prefix}{inner}}}\n");
        let (_, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.rs"),
            "source.rs",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert!(
            windows
                .iter()
                .any(|window| &text[window.bytes.clone()] == inner)
        );
        let ordinals = (0..windows.len()).collect::<Vec<_>>();
        let (recovered, anchors) = project(&text, &windows, &ordinals);
        assert_eq!(recovered, text);
        assert_eq!(anchors, (1..=text.lines().count()).collect::<Vec<_>>());
    }

    #[test]
    fn unsupported_syntax_and_oversized_declarations_keep_complete_line_windows() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        for path in ["source.txt", "source.rs"] {
            let text = format!("fn large() {{\n{}}}\n", "    consume();\n".repeat(600));
            let (_, windows) = chunks(
                &text,
                None,
                None,
                Path::new(path),
                path,
                &ContentSecurity::new(),
                Some(&runtime),
                None,
                None,
            );
            assert!(windows.len() > 2);
            assert!(
                windows
                    .iter()
                    .all(|window| text[window.bytes.clone()].chars().count() <= TARGET_CHARS)
            );
            assert_eq!(
                project(&text, &windows, &(0..windows.len()).collect::<Vec<_>>()).0,
                text
            );
        }
    }

    #[test]
    fn declaration_body_stays_with_its_header_and_neighbor_is_separate() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.limits.max_chars = 16_384;
        let body = "    consume(value);\n".repeat(150);
        let first = format!("fn process(value: u32) {{\n{body}}}\n");
        let text = format!("{first}fn other() {{}}\n");
        let (_, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.rs"),
            "source.rs",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert_eq!(&text[windows[0].bytes.clone()], first);
        assert_eq!(windows.len(), 2);
        assert_eq!(project(&text, &windows, &[0, 1]).0, text);
    }

    #[test]
    fn whole_file_windows_end_before_a_declaration_once_half_full() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        // Two functions of ~1,500 chars each: a 2,048-char window would cut
        // the second one in its middle without snapping.
        let body = |name: &str| {
            let lines = (0..30)
                .map(|i| format!("    let {name}_{i} = {i}; // {}\n", "x".repeat(20)))
                .collect::<String>();
            format!("fn {name}() {{\n{lines}}}\n")
        };
        let text = format!("{}{}", body("first"), body("second"));
        let second_start = text
            .lines()
            .position(|line| line.starts_with("fn second"))
            .unwrap()
            + 1;
        let (_, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.rs"),
            "source.rs",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert!(
            windows
                .iter()
                .any(|window| window.lines.first() == Some(&second_start)),
            "a window starts at the second declaration: {:?}",
            windows.iter().map(|w| w.lines.first()).collect::<Vec<_>>()
        );
    }

    #[test]
    fn incomplete_source_maps_never_invent_candidate_coordinates() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        let (candidates, _) = chunks(
            "first\nsecond\n",
            Some(&[7]),
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert!(candidates.iter().all(|candidate| candidate.state.is_none()));
    }

    #[test]
    fn serialized_state_budget_uses_sanitized_content() {
        struct Redacted;
        impl ContentScan for Redacted {
            fn sanitize(
                &self,
                _: &str,
                _: &Path,
            ) -> Result<(String, Vec<String>), (String, String)> {
                Ok(("é\n\"".into(), vec![]))
            }
        }
        let executor = tokio::runtime::Runtime::new().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut runtime = budget_runtime(executor.handle().clone(), calls.clone());
        runtime.limits.max_chars = 1_024;
        let text = format!("{}\n", "x".repeat(2_047)).repeat(3);
        let (candidates, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.txt"),
            "source.txt",
            &Redacted,
            Some(&runtime),
            None,
            None,
        );
        assert!(
            candidates
                .iter()
                .all(|candidate| candidate.state.as_ref().unwrap()["content"] == "é\n\"")
        );
        let outcome = crate::tools::selection::select(
            Some(&runtime),
            &json!({"clasifyContext":{"classifiers":["Find evidence"]}}),
            "source",
            None,
            &candidates,
            None,
            crate::contracts::tool_types::SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("sanitized order"));
        assert_eq!(
            outcome.receipt.status,
            crate::contracts::tool_types::SelectionStatus::Complete
        );
        assert_eq!(outcome.receipt.selected_items, 3);
        assert_eq!(outcome.selected, [0, 1, 2]);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(project(&text, &windows, &outcome.selected).0, text);
    }

    #[test]
    fn serialized_state_budget_preserves_all_short_lines_and_replay() {
        use crate::contracts::tool_types::SelectionStatus;
        let executor = tokio::runtime::Runtime::new().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut runtime = budget_runtime(executor.handle().clone(), calls.clone());
        let text = "x\n".repeat(4_096);
        let query = json!({"clasifyContext":{"classifiers":["Find x"]}});
        let (candidates, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert_eq!(windows.len(), 4);
        let first_state_chars = candidates[0]
            .state
            .as_ref()
            .unwrap()
            .to_string()
            .chars()
            .count();
        assert!(first_state_chars > runtime.limits.max_chars);
        let skipped = crate::tools::selection::select(
            Some(&runtime),
            &query,
            "source",
            None,
            &candidates,
            None,
            crate::contracts::tool_types::SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("budgeted order"));
        assert_eq!(skipped.receipt.status, SelectionStatus::Partial);
        assert_eq!(
            skipped.receipt.reason.as_deref(),
            Some("candidateStateTooLarge")
        );
        assert_eq!(skipped.receipt.selected_items, 0);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            project(&text, &windows, &skipped.selected),
            (String::new(), Vec::new())
        );

        runtime.limits.max_chars = first_state_chars;
        let partial = crate::tools::selection::select(
            Some(&runtime),
            &query,
            "source",
            None,
            &candidates,
            None,
            crate::contracts::tool_types::SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("partial order"));
        assert_eq!(partial.receipt.status, SelectionStatus::Partial);
        assert_eq!(
            partial.receipt.reason.as_deref(),
            Some("candidateStateTooLarge")
        );
        assert_eq!(partial.receipt.selected_items, 1);
        assert_eq!(partial.receipt.total_items, 4);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            project(&text, &windows, &partial.selected),
            (text[..2_048].to_owned(), (1..=1_024).collect())
        );
        let (replayed_candidates, _) = chunks(
            &text,
            None,
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            Some(&runtime),
            Some(&partial.token),
            None,
        );
        let replay = crate::tools::selection::select(
            Some(&runtime),
            &query,
            "source",
            Some(&partial.token),
            &replayed_candidates,
            None,
            crate::contracts::tool_types::SelectionUnit::Chunks,
        )
        .unwrap_or_else(|_| panic!("replay order"));
        assert_eq!(replay.selected, partial.selected);
        assert_eq!(replay.receipt, partial.receipt);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn exhausted_state_budget_withholds_bodies_and_unfiltered_recovers_every_line() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let runtime = budget_runtime(executor.handle().clone(), calls.clone());
        let text = "x\n".repeat(4_096);
        let query: LocalFetchQuery = serde_json::from_value(json!({
            "path":"source.txt", "ranges":["1-4096"],
            "unit":"lines", "length":333, "clasifyContext":{"classifiers":["Find x"]}
        }))
        .unwrap();
        let read = |query: &LocalFetchQuery| {
            super::super::executor::process_fetched_content_selected(
                query,
                text.as_bytes(),
                Path::new("source.txt"),
                "source.txt",
                &SourceFacts::default(),
                &ContentSecurity::new(),
                &NeverCancel,
                &LocalFetchRegex,
                Some(&runtime),
            )
        };
        let selected = read(&query);
        assert_ne!(selected.status, "error", "{selected:?}");
        let receipt = selected.selection.as_ref().expect("receipt");
        assert_eq!(
            receipt.status,
            crate::contracts::tool_types::SelectionStatus::Partial
        );
        assert_eq!(receipt.reason.as_deref(), Some("candidateStateTooLarge"));
        assert_eq!(receipt.unknown_items, 4);
        assert_eq!(receipt.excluded_items, 0);
        assert!(selected.content.as_deref().unwrap_or_default().is_empty());
        let mut query = selected
            .next
            .expect("recovery")
            .unfiltered
            .expect("unfiltered")
            .query;
        assert!(query.clasify_context.is_none());
        assert!(query.selection.is_none());
        let mut contents = String::new();
        let mut pages = 0;
        loop {
            let result = read(&query);
            assert_ne!(result.status, "error", "{result:?}");
            assert!(result.selection.is_none());
            contents.push_str(result.content.as_deref().unwrap_or_default());
            pages += 1;
            assert!(pages < 50, "unfiltered recovery must make progress");
            let Some(next) = result.next.and_then(|next| next.continue_window) else {
                break;
            };
            query = next.query;
        }
        assert_eq!(contents, text);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn oversized_line_terminates_selection_and_unfiltered_recovers_all_bytes() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        for surrounding in [false, true] {
            let calls = Arc::new(AtomicUsize::new(0));
            let mut runtime = budget_runtime(executor.handle().clone(), calls.clone());
            runtime.limits = crate::runtime::RuntimeLimits::DEFAULT.selection;
            let large_line = format!("{}\n", "x".repeat(140_000));
            let text = if surrounding {
                format!("first evidence\n{large_line}second evidence\n")
            } else {
                large_line
            };
            let query: LocalFetchQuery = serde_json::from_value(json!({
                "path":"source.txt", "fullContent":true,
                "clasifyContext":{"classifiers":["Find evidence"]}
            }))
            .unwrap();
            let read = |query: &LocalFetchQuery| {
                super::super::executor::process_fetched_content_selected(
                    query,
                    text.as_bytes(),
                    Path::new("source.txt"),
                    "source.txt",
                    &SourceFacts::default(),
                    &ContentSecurity::new(),
                    &NeverCancel,
                    &LocalFetchRegex,
                    Some(&runtime),
                )
            };
            let selected = read(&query);
            assert_ne!(selected.status, "error", "{selected:?}");
            let receipt = selected.selection.as_ref().expect("receipt");
            assert_eq!(receipt.unknown_items, 1);
            assert_eq!(receipt.excluded_items, 0);
            assert_eq!(receipt.selected_items, if surrounding { 2 } else { 0 });
            assert_eq!(receipt.reason.as_deref(), Some("candidateStateTooLarge"));
            let next = selected.next.expect("raw recovery");
            assert!(next.next_candidate_page.is_none());
            let mut query = next.unfiltered.expect("whole view").query;
            let mut recovered = String::new();
            let mut pages = 0;
            loop {
                let page = read(&query);
                assert_ne!(page.status, "error", "{page:?}");
                assert!(page.selection.is_none());
                recovered.push_str(page.content.as_deref().unwrap_or_default());
                pages += 1;
                assert!(pages < 50, "raw recovery makes progress");
                let Some(next) = page.next.and_then(|next| next.continue_window) else {
                    break;
                };
                query = next.query;
            }
            assert_eq!(recovered, text);
            assert_eq!(calls.load(Ordering::SeqCst), usize::from(surrounding));
        }
    }

    #[test]
    fn complete_long_lines_and_unterminated_tail_are_eligible_in_source_order() {
        use crate::runtime::SelectionLimits;
        use crate::tools::selection::{JudgeCall, Runtime, SelectionJudge};
        use std::time::{Duration, Instant};
        struct Uncalled;
        impl SelectionJudge for Uncalled {
            fn identity(&self) -> serde_json::Value {
                json!({"test":"chunks"})
            }
            fn select(&self, _: JudgeCall<'_>) -> crate::tools::selection::Judgments {
                panic!("capture only")
            }
        }
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = Runtime {
            limits: SelectionLimits {
                max_candidates: 64,
                max_chars: 131_072,
                timeout: Duration::from_secs(1),
            },
            available: true,
            judge: std::sync::Arc::new(Uncalled),
            handle: executor.handle().clone(),
            context: crate::runtime::ExecutionContext {
                cancellation: tokio_util::sync::CancellationToken::new(),
                deadline: Instant::now() + Duration::from_secs(1),
                walk_threads: None,
                response_window: None,
                github_credential: None,
            },
        };
        let text = format!("{}\nshort\ntail", "a".repeat(4_096));
        let (candidates, windows) = chunks(
            &text,
            None,
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            Some(&runtime),
            None,
            None,
        );
        assert_eq!(windows.len(), 2);
        assert_eq!(
            candidates[0].state.as_ref().unwrap()["content"]
                .as_str()
                .unwrap()
                .len(),
            4_097
        );
        assert!(
            candidates[1].state.is_some(),
            "the final unterminated window is complete evidence"
        );
        assert_eq!(project(&text, &windows, &[0, 1]).0, text);
    }

    #[test]
    fn selected_windows_preserve_original_bytes_and_nonadjacent_line_anchors() {
        let text = format!("{}\n{}\nlast", "a".repeat(2_047), "b".repeat(2_047));
        let (candidates, chunks) = chunks(
            &text,
            None,
            None,
            Path::new("source.txt"),
            "source.txt",
            &ContentSecurity::new(),
            None,
            None,
            None,
        );
        assert_eq!(chunks.len(), 3);
        assert!(candidates[0].state.is_none());
        assert!(candidates[2].state.is_none());
        let (ordered, anchors) = project(&text, &chunks, &[0, 2]);
        assert_eq!(anchors, vec![1, 0, 3], "a marker separates the gap");
        assert_eq!(
            ordered,
            format!("{}\n... [line 2 not selected] ...\nlast", "a".repeat(2_047))
        );
    }
    #[test]
    fn context_selection_omits_unrelated_bodies_and_exposes_recovery() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        struct Relevance;
        impl SelectionJudge for Relevance {
            fn identity(&self) -> serde_json::Value {
                json!({"test":"selection"})
            }
            fn select(&self, call: JudgeCall<'_>) -> crate::tools::selection::Judgments {
                Ok(call
                    .admitted
                    .iter()
                    .map(|&i| {
                        let body = call.candidates[i].state.as_ref().unwrap()["content"]
                            .as_str()
                            .unwrap();
                        (
                            i,
                            if body.contains("REQUIRED_EVIDENCE") {
                                Decision::Selected
                            } else {
                                Decision::Excluded
                            },
                        )
                    })
                    .collect())
            }
        }
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.limits.max_chars = 20_000;
        runtime.judge = Arc::new(Relevance);
        let text = format!(
            "UNRELATED_SENTINEL {}\nREQUIRED_EVIDENCE retry stops after three attempts\n",
            "x".repeat(2_030)
        );
        let query: LocalFetchQuery = serde_json::from_value(json!({
            "path":"source.txt", "length":100,
            "clasifyContext":{"classifiers":["When do retries stop?"]},
            "mainGoal":"Explain retry termination", "reasoning":"Find the stopping condition"
        }))
        .unwrap();
        let result = super::super::executor::process_fetched_content_selected(
            &query,
            text.as_bytes(),
            Path::new("source.txt"),
            "source.txt",
            &SourceFacts::default(),
            &ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
            Some(&runtime),
        );
        let body = result.content.as_deref().unwrap();
        assert!(body.contains("REQUIRED_EVIDENCE"));
        assert!(
            !body.contains("UNRELATED_SENTINEL"),
            "Unrelated bodies must remain outside host context"
        );
        let value = serde_json::to_value(&result).unwrap();
        assert!(
            value.pointer("/next/unfiltered").is_some(),
            "Withheld evidence must be explicitly recoverable"
        );
    }

    /// Judges a chunk by its words: `keep` selected, `drop` excluded, else
    /// unknown; `fail` fails every candidate at the provider with that code:
    /// a refused credential ([`REFUSED`]) or a provider that is down
    /// ([`DOWN`]).
    struct WordJudge {
        fail: Option<&'static str>,
    }

    const REFUSED: Option<&str> = Some("classificationProviderError");
    const DOWN: Option<&str> = Some(crate::tools::judgment::transport::CIRCUIT_OPEN);

    impl SelectionJudge for WordJudge {
        fn identity(&self) -> serde_json::Value {
            json!({"test":"words"})
        }

        fn select(&self, call: JudgeCall<'_>) -> crate::tools::selection::Judgments {
            if let Some(code) = self.fail {
                let status = if Some(code) == REFUSED {
                    "401 Unauthorized"
                } else {
                    "503 Service Unavailable"
                };
                return Err(crate::tools::selection::JudgeFailure::Provider(
                    crate::tools::selection::ProviderError {
                        code: code.into(),
                        message: format!("Classification provider returned HTTP {status}"),
                        hints: vec!["Check OCTOCODE_CLASSIFICATION_API and account access.".into()],
                    },
                ));
            }
            Ok(call
                .admitted
                .iter()
                .map(|&ordinal| {
                    let text = call.candidates[ordinal]
                        .state
                        .as_ref()
                        .map(|state| state["content"].to_string())
                        .unwrap_or_default();
                    let decision = if text.contains("keep") {
                        Decision::Selected
                    } else if text.contains("drop") {
                        Decision::Excluded
                    } else {
                        Decision::Unknown
                    };
                    (ordinal, decision)
                })
                .collect())
        }
    }

    fn word_read(fail: Option<&'static str>) -> crate::tools::local_fetch::LocalFetchResult {
        word_read_with(
            json!({}),
            fail,
            &crate::tools::local_fetch::SourceFacts::default(),
        )
    }

    /// The five-chunk word source read with `extra` query fields under
    /// `facts`.
    fn word_read_with(
        extra: serde_json::Value,
        fail: Option<&'static str>,
        facts: &crate::tools::local_fetch::SourceFacts,
    ) -> crate::tools::local_fetch::LocalFetchResult {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.judge = Arc::new(WordJudge { fail });
        runtime.limits.max_chars = 100_000;
        // One line per chunk: two lines never fit one 2,048-character window.
        let text = ["keep", "drop", "maybe", "maybe", "keep"]
            .iter()
            .map(|word| format!("{word} {}\n", "x".repeat(1_500)))
            .collect::<String>();
        let mut query = json!({
            "path":"source.txt", "fullContent":true,
            "clasifyContext":{"classifiers":["Is it kept?"]}
        });
        for (key, value) in extra.as_object().into_iter().flatten() {
            query[key] = value.clone();
        }
        let query: LocalFetchQuery = serde_json::from_value(query).unwrap();
        super::super::executor::process_fetched_content_selected(
            &query,
            text.as_bytes(),
            Path::new("source.txt"),
            "source.txt",
            facts,
            &ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
            Some(&runtime),
        )
    }

    /// A classified page leaves room in its window for what rides beside
    /// its text (plan token, receipt, both unfiltered leads): the same read
    /// cut for the same window returns less text than an unclassified one,
    /// by at least those chars.
    #[test]
    fn a_classified_page_leaves_room_for_its_selection_fields() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.judge = Arc::new(WordJudge { fail: None });
        runtime.limits.max_chars = 1_000_000;
        let text = (0..400)
            .map(|n| {
                let word = if n % 7 == 3 { "maybe" } else { "keep" };
                format!("{word} {n} {}\n", "y".repeat(60))
            })
            .collect::<String>();
        let facts = SourceFacts {
            window: Some(8_000),
            ..SourceFacts::default()
        };
        let read = |classified: bool| {
            let mut query = json!({"path":"source.txt", "fullContent":true});
            if classified {
                query["clasifyContext"] = json!({"classifiers":["Is it kept?"]});
            }
            let query: LocalFetchQuery = serde_json::from_value(query).unwrap();
            super::super::executor::process_fetched_content_selected(
                &query,
                text.as_bytes(),
                Path::new("source.txt"),
                "source.txt",
                &facts,
                &ContentSecurity::new(),
                &NeverCancel,
                &LocalFetchRegex,
                classified.then_some(&runtime),
            )
        };
        let plain = read(false);
        let classified = read(true);
        assert!(classified.selection.is_some(), "{classified:?}");
        let chars = |result: &crate::tools::local_fetch::LocalFetchResult| {
            result.content.as_deref().map_or(0, str::len)
        };
        let beside = serde_json::to_value(&classified)
            .map(|wire| {
                let mut extras = 0;
                for key in ["selection", "next"] {
                    extras += crate::tools::stream_page::json_chars(&wire[key]);
                }
                extras
            })
            .unwrap_or(0);
        assert!(beside > 0);
        assert!(
            chars(&classified) + beside <= chars(&plain) + 400,
            "classified {} + beside {beside} vs plain {}",
            chars(&classified),
            chars(&plain)
        );
    }

    #[test]
    fn unfiltered_unknown_reads_exactly_the_unknown_chunks_beside_the_whole_view() {
        let result = word_read(None);
        let receipt = result.selection.as_ref().expect("receipt");
        assert_eq!(
            (
                receipt.selected_items,
                receipt.excluded_items,
                receipt.unknown_items
            ),
            (2, 1, 2)
        );
        let next = result.next.expect("recovery");
        let unknown = next.unfiltered_unknown.expect("unknown chunks").query;
        assert_eq!(
            serde_json::to_value(&unknown.ranges).unwrap(),
            json!(["3-4"])
        );
        assert!(unknown.clasify_context.is_none() && unknown.full_content.is_none());
        let whole = next.unfiltered.expect("whole view").query;
        assert!(whole.clasify_context.is_none());
        assert_eq!(whole.full_content, Some(true));
        assert!(whole.ranges.is_empty());
    }

    /// A classified read of `text` under a word judge, `max` candidates
    /// per call.
    fn budgeted_read(
        text: &str,
        query: &serde_json::Value,
        max: usize,
    ) -> crate::tools::local_fetch::LocalFetchResult {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let mut runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        runtime.judge = Arc::new(WordJudge { fail: None });
        runtime.limits.max_chars = 1_000_000;
        runtime.limits.max_candidates = max;
        let query: LocalFetchQuery = serde_json::from_value(query.clone()).unwrap();
        super::super::executor::process_fetched_content_selected(
            &query,
            text.as_bytes(),
            Path::new("source.txt"),
            "source.txt",
            &SourceFacts::default(),
            &ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
            Some(&runtime),
        )
    }

    /// One line per chunk: two lines never fit one 2,048-character window.
    fn word_lines(words: &[&str]) -> String {
        words
            .iter()
            .map(|word| format!("{word} {}\n", "x".repeat(1_500)))
            .collect()
    }

    /// Chunks past the candidate budget are judged by `nextCandidatePage`,
    /// the same classified read; the first page says how many were judged.
    /// Following the chain judges every chunk once and selects exactly what
    /// one unbudgeted read selects.
    #[test]
    fn a_chain_of_candidate_pages_judges_every_chunk_once() {
        let words = [
            "keep", "drop", "maybe", "keep", "drop", "keep", "maybe", "keep",
        ];
        let text = word_lines(&words);
        let query = json!({"path":"source.txt", "fullContent":true,
            "clasifyContext":{"classifiers":["Is it kept?"]}});
        let unbudgeted = budgeted_read(&text, &query, 64);
        let mut result = budgeted_read(&text, &query, 3);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.contains("judged 3 of 8 chunks") && w.contains("5 were not judged")),
            "{:?}",
            result.warnings
        );
        let (mut totals, mut selected) = (Vec::new(), String::new());
        loop {
            assert_eq!(result.error_code, None, "{result:?}");
            let receipt = result.selection.as_ref().expect("receipt");
            totals.push(receipt.total_items);
            selected.push_str(result.content.as_deref().unwrap_or_default());
            let next = result.next.clone().expect("leads");
            let Some(page) = next.next_candidate_page else {
                break;
            };
            assert!(page.query.clasify_context.is_some() && page.query.selection.is_some());
            assert!(totals.len() < 5, "the chain ends");
            result = budgeted_read(&text, &serde_json::to_value(&page.query).unwrap(), 3);
        }
        assert_eq!(totals, [8, 5, 2]);
        let kept = |content: &str| {
            let mut lines = content
                .lines()
                .filter(|line| !line.starts_with("..."))
                .map(str::to_owned)
                .collect::<Vec<_>>();
            lines.sort();
            lines
        };
        assert_eq!(
            kept(&selected),
            kept(unbudgeted.content.as_deref().unwrap()),
            "every selected chunk once"
        );
    }

    /// Unknown chunks past one row's `ranges` are not dropped:
    /// `unfilteredUnknown` reads the first ranges and `unfilteredUnknown2`,
    /// … read the rest.
    #[test]
    fn every_unknown_range_has_a_read_past_one_row() {
        let words = (0..30)
            .map(|i| if i % 2 == 0 { "maybe" } else { "keep" })
            .collect::<Vec<_>>();
        let text = word_lines(&words);
        let query = json!({"path":"source.txt", "fullContent":true,
            "clasifyContext":{"classifiers":["Is it kept?"]}});
        let result = budgeted_read(&text, &query, 64);
        let next = serde_json::to_value(result.next.expect("leads")).unwrap();
        let mut ranges = Vec::new();
        for name in [
            "unfilteredUnknown",
            "unfilteredUnknown2",
            "unfilteredUnknown3",
        ] {
            for row in next[name]["query"]["queries"]
                .as_array()
                .into_iter()
                .flatten()
            {
                ranges.extend(row["ranges"].as_array().unwrap().iter().cloned());
            }
        }
        let expected = (0..30)
            .step_by(2)
            .map(|i| json!(format!("{}-{}", i + 1, i + 1)))
            .collect::<Vec<_>>();
        assert_eq!(ranges, expected, "{next}");
        assert_eq!(
            next["unfiltered"]["query"]["queries"][0]["fullContent"],
            true
        );
    }

    #[test]
    fn a_first_classified_call_with_an_offset_is_refused_input_not_a_stale_cursor() {
        use crate::tools::cancel::NeverCancel;
        use crate::tools::local_fetch::{LocalFetchQuery, LocalFetchRegex, SourceFacts};
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        let query: LocalFetchQuery = serde_json::from_value(json!({
            "path":"source.txt", "offset":3, "length":5, "unit":"lines",
            "clasifyContext":{"classifiers":["Is it kept?"]}
        }))
        .unwrap();
        let result = super::super::executor::process_fetched_content_selected(
            &query,
            "a\nb\nc\nd\ne\nf\n".as_bytes(),
            Path::new("source.txt"),
            "source.txt",
            &SourceFacts::default(),
            &ContentSecurity::new(),
            &NeverCancel,
            &LocalFetchRegex,
            Some(&runtime),
        );
        assert_eq!(
            result.error_code.as_deref(),
            Some("invalidInput"),
            "{result:?}"
        );
        let recovery = result
            .next
            .expect("recovery")
            .unfiltered
            .expect("unfiltered")
            .query;
        // The caller's window stays: only the classifier is dropped.
        assert!(recovery.clasify_context.is_none(), "{recovery:?}");
        assert_eq!((recovery.offset, recovery.unit), (query.offset, query.unit));
    }

    #[test]
    fn a_provider_failing_every_chunk_fails_the_read_with_its_typed_error() {
        let result = word_read(REFUSED);
        assert_eq!(
            result.error_code.as_deref(),
            Some("classificationProviderError")
        );
        assert!(
            result
                .hints
                .iter()
                .any(|hint| hint.contains("OCTOCODE_CLASSIFICATION_API"))
        );
        let receipt = result.selection.as_ref().expect("receipt");
        assert_eq!(
            receipt.status,
            crate::contracts::tool_types::SelectionStatus::Unavailable
        );
        assert_eq!(
            receipt.reason.as_deref(),
            Some("classificationProviderError")
        );
        assert_eq!(receipt.unknown_items, 5);
        assert!(result.content.is_none(), "no unjudged body as a fallback");
        let recovery = result
            .next
            .expect("recovery")
            .unfiltered
            .expect("unfiltered")
            .query;
        assert!(recovery.clasify_context.is_none());
    }

    /// A provider that cannot answer (down, overloaded, unreachable) never
    /// withholds a read that succeeded: the whole view is shown under an
    /// `unavailable` receipt naming the provider's code, the warning states
    /// its error and hint, no unfiltered lead repeats the view, and a later
    /// page replays that plan without another provider call.
    #[test]
    fn a_provider_that_is_down_shows_the_unfiltered_view_as_unavailable() {
        let result = word_read(DOWN);
        assert!(result.error_code.is_none(), "{result:?}");
        let receipt = result.selection.as_ref().expect("receipt");
        assert_eq!(
            receipt.status,
            crate::contracts::tool_types::SelectionStatus::Unavailable
        );
        assert_eq!(receipt.reason.as_deref(), DOWN);
        assert_eq!((receipt.total_items, receipt.unknown_items), (5, 5));
        let content = result.content.as_deref().expect("the view is shown");
        for word in ["keep", "drop", "maybe"] {
            assert!(content.contains(word), "{word} is shown: {content}");
        }
        assert_eq!(content.lines().count(), 5, "every chunk, no marker");
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("HTTP 503")
                    && warning.contains("shown unfiltered")
                    && warning.contains("OCTOCODE_CLASSIFICATION_API")),
            "{:?}",
            result.warnings
        );
        let next = result.next.as_ref();
        assert!(
            next.is_none_or(|next| next.unfiltered.is_none() && next.next_candidate_page.is_none()),
            "the view is the unfiltered read: {next:?}"
        );
        // Paged one chunk at a time, the recorded plan replays on the next
        // page: the provider (now answering) is not asked, so the view stays
        // unavailable and whole.
        let facts = crate::tools::local_fetch::SourceFacts {
            window: Some(2_048),
            ..crate::tools::local_fetch::SourceFacts::default()
        };
        let first = word_read_with(json!({}), DOWN, &facts);
        let next = first
            .next
            .and_then(|next| next.continue_window)
            .expect("a next page")
            .query;
        assert!(next.selection.is_some(), "the plan rides the next page");
        let replay = word_read_with(
            serde_json::to_value(&next).expect("next query"),
            None,
            &facts,
        );
        assert_eq!(
            replay.selection.as_ref().map(|receipt| receipt.status),
            Some(crate::contracts::tool_types::SelectionStatus::Unavailable)
        );
        assert!(
            replay.error_code.is_none() && replay.content.as_deref().is_some_and(|t| !t.is_empty()),
            "the next page is shown: {replay:?}"
        );
    }
}

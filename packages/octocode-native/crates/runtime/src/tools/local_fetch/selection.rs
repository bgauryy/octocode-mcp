//! Complete line windows for source-order evidence selection.
//! Windows retain original line anchors and never split a source line.
use crate::security::scan::ContentScan;
use crate::tools::selection::Candidate;
use serde_json::json;
use std::ops::Range;
use std::path::Path;

const TARGET_CHARS: usize = 2_048;

pub(super) struct Chunk {
    bytes: Range<usize>,
    lines: Vec<usize>,
}

pub(super) fn chunks(
    text: &str,
    source_lines: Option<&[usize]>,
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
        if last_source_line.is_some()
            && (line == super::extraction::OMISSION_LINE
                || !contiguous
                || count.saturating_add(chars) > TARGET_CHARS)
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

pub(super) fn project(text: &str, chunks: &[Chunk], order: &[usize]) -> (String, Vec<usize>) {
    let mut selected = String::with_capacity(text.len());
    let mut lines = Vec::new();
    for &ordinal in order {
        let chunk = &chunks[ordinal];
        selected.push_str(&text[chunk.bytes.clone()]);
        lines.extend_from_slice(&chunk.lines);
    }
    (selected, lines)
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

        fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
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
    fn incomplete_source_maps_never_invent_candidate_coordinates() {
        let executor = tokio::runtime::Runtime::new().unwrap();
        let runtime = budget_runtime(executor.handle().clone(), Arc::new(AtomicUsize::new(0)));
        let (candidates, _) = chunks(
            "first\nsecond\n",
            Some(&[7]),
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
        assert_eq!(skipped.receipt.reason.as_deref(), Some("candidateBudget"));
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
        assert_eq!(partial.receipt.reason.as_deref(), Some("candidateBudget"));
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
            "path":"source.txt", "ranges":["1-4096"], "minify":"none",
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
        assert_eq!(receipt.reason.as_deref(), Some("candidateBudget"));
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
    fn complete_long_lines_and_unterminated_tail_are_eligible_in_source_order() {
        use crate::runtime::SelectionLimits;
        use crate::tools::selection::{Decision, JudgeCall, Runtime, SelectionJudge};
        use std::time::{Duration, Instant};
        struct Uncalled;
        impl SelectionJudge for Uncalled {
            fn identity(&self) -> serde_json::Value {
                json!({"test":"chunks"})
            }
            fn select(&self, _: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
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
        assert_eq!(anchors, vec![1, 3]);
        assert_eq!(ordered, format!("{}\nlast", "a".repeat(2_047)));
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
            fn select(&self, call: JudgeCall<'_>) -> Result<Vec<(usize, Decision)>, String> {
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
            "path":"source.txt", "minify":"none", "length":100,
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
}

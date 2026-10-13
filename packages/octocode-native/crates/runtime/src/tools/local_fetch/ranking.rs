//! Complete, contiguous line windows for ordering a selected raw-text view.
//! Windows never split a source line; an unterminated final line stays last so
//! rejoining a permutation does not change any source bytes.
use crate::security::scan::ContentScan;
use crate::tools::ranking::Candidate;
use serde_json::json;
use std::ops::Range;
use std::path::Path;

const TARGET_CHARS: usize = 2_048;

pub(super) struct Chunk {
    bytes: Range<usize>,
    lines: Vec<usize>,
    chars: usize,
}

pub(super) fn chunks(
    text: &str,
    source_lines: Option<&[usize]>,
    path: &Path,
    provider_path: &str,
    security: &impl ContentScan,
    runtime: Option<&crate::tools::ranking::Runtime>,
    prior: Option<&str>,
    unsupported: Option<&'static str>,
) -> (Vec<Candidate>, Vec<Chunk>) {
    let mut chunks = Vec::new();
    let mut start = 0;
    let mut count = 0usize;
    let mut offset = 0;
    let mut lines = Vec::new();
    for (index, record) in text.split_inclusive('\n').enumerate() {
        let chars = record.chars().count();
        if count > 0 && count.saturating_add(chars) > TARGET_CHARS {
            chunks.push(Chunk {
                bytes: start..offset,
                lines: std::mem::take(&mut lines),
                chars: count,
            });
            start = offset;
            count = 0;
        }
        count += chars;
        lines.push(
            source_lines
                .and_then(|map| map.get(index))
                .copied()
                .unwrap_or(index + 1),
        );
        offset += record.len();
    }
    if !lines.is_empty() {
        chunks.push(Chunk {
            bytes: start..text.len(),
            lines,
            chars: count,
        });
    }
    let needs_states =
        crate::tools::ranking::needs_candidate_states(runtime, prior, unsupported, chunks.len());
    let candidates = chunks
        .iter()
        .map(|chunk| {
            let record = &text[chunk.bytes.clone()];
            let state = if !needs_states || !record.ends_with('\n') || chunk.chars > TARGET_CHARS {
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
            Candidate {
                state,
                evidence_chars: chunk.chars,
            }
        })
        .collect();
    (candidates, chunks)
}

pub(super) fn reorder(text: &str, chunks: &[Chunk], order: &[usize]) -> (String, Vec<usize>) {
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
    use crate::security::ContentSecurity;

    #[test]
    fn reordered_windows_preserve_every_byte_and_line_anchor() {
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
        let (ordered, anchors) = reorder(&text, &chunks, &[1, 0, 2]);
        assert_eq!(anchors, vec![2, 1, 3]);
        assert_eq!(
            ordered,
            format!("{}\n{}\nlast", "b".repeat(2_047), "a".repeat(2_047))
        );
    }
}

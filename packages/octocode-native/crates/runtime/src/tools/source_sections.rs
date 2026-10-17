//! Source geometry shared by section assessment and declaration-aware readers.
use std::ops::Range;
use std::path::Path;

use octocode_engine::text::LineIndex;

/// Where a source's declarations put chunk edges: the windows of bounded
/// declarations (each one chunk), and the lines where any declaration
/// starts (with its documentation) or ends.
#[derive(Default)]
pub(crate) struct LineEdges {
    pub(crate) windows: Vec<Range<usize>>,
    pub(crate) starts: std::collections::HashSet<usize>,
    pub(crate) ends: std::collections::HashSet<usize>,
}

pub(crate) fn line_edges(text: &str, path: &Path, max_chars: usize) -> LineEdges {
    let Some(declarations) =
        crate::tools::declarations_cache::all_declarations(text, &path.to_string_lossy())
    else {
        return LineEdges::default();
    };
    let mut prefix = vec![0usize];
    for line in text.split_inclusive('\n') {
        prefix.push(
            prefix
                .last()
                .copied()
                .unwrap_or_default()
                .saturating_add(line.chars().count()),
        );
    }
    let first_line = |declaration: &crate::tools::declarations_cache::Declared| {
        declaration
            .doc_start
            .unwrap_or(declaration.start)
            .min(declaration.start)
    };
    let starts = declarations.iter().map(first_line).collect();
    let ends = declarations
        .iter()
        .map(|declaration| declaration.end)
        .collect();
    let mut ranges = declarations
        .iter()
        .filter(|declaration| {
            matches!(
                declaration.kind.as_str(),
                "function" | "method" | "constructor" | "property"
            )
        })
        .filter_map(|declaration| {
            let start = first_line(declaration);
            (start > 0
                && declaration.end >= start
                && declaration.end < prefix.len()
                && prefix[declaration.end] - prefix[start - 1] <= max_chars)
                .then_some(start..declaration.end + 1)
        })
        .collect::<Vec<_>>();
    ranges.sort_by(|a, b| a.start.cmp(&b.start).then_with(|| b.end.cmp(&a.end)));
    let mut windows: Vec<Range<usize>> = Vec::new();
    for range in ranges {
        if windows.last().is_none_or(|last| last.end <= range.start) {
            windows.push(range);
        }
    }
    LineEdges {
        windows,
        starts,
        ends,
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Section {
    pub target: Range<usize>,
    pub context: Vec<Range<usize>>,
    pub kind: String,
    pub name: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct Declaration {
    pub bytes: Range<usize>,
    pub heading: Range<usize>,
    pub kind: String,
    pub name: String,
}

/// Parser columns use UTF-16. Convert through the same index as graph/LSP.
pub(crate) fn declarations(source: &str, path: &Path) -> Vec<Declaration> {
    let Some(document) =
        crate::tools::declarations_cache::file_document(source, &path.to_string_lossy())
    else {
        return Vec::new();
    };
    let index = LineIndex::tree_sitter(source);
    let mut declarations = document
        .declarations
        .iter()
        .filter_map(|declaration| {
            let position = |point: &octocode_engine::graph::GraphPosition| {
                index.position_to_byte(source, point.line, point.character) as usize
            };
            let start = position(&declaration.range.start);
            let start = declaration
                .doc_line
                .map_or(start, |line| {
                    index.position_to_byte(source, line, 0) as usize
                })
                .min(start);
            let end = position(&declaration.range.end);
            if start >= end
                || end > source.len()
                || !source.is_char_boundary(start)
                || !source.is_char_boundary(end)
            {
                return None;
            }
            let heading_end = position(&declaration.selection_range.end).clamp(start, end);
            Some(Declaration {
                bytes: start..end,
                heading: start..heading_end,
                kind: declaration.kind.clone(),
                name: declaration.name.clone(),
            })
        })
        .collect::<Vec<_>>();
    declarations.sort_by_key(|declaration| (declaration.bytes.start, declaration.bytes.end));
    declarations
}

/// Every selected byte belongs to exactly one target. A declaration is kept
/// whole when it fits; oversized containers expose nested declarations and
/// their intervening source. Text fallback cuts only at UTF-8 boundaries.
pub(crate) fn visit<E>(
    source: &str,
    path: &Path,
    selected: &[Range<usize>],
    target_chars: usize,
    mut emit: impl FnMut(Section) -> Result<bool, E>,
) -> Result<bool, E> {
    let declarations = declarations(source, path);
    let target_chars = target_chars.max(1);
    let mut cursor = 0;
    let mut active = Vec::new();
    for selection in selected {
        let mut offset = selection.start;
        while offset < selection.end {
            while let Some(declaration) = declarations
                .get(cursor)
                .filter(|declaration| declaration.bytes.start <= offset)
            {
                active.push(declaration);
                cursor += 1;
            }
            active.retain(|declaration| declaration.bytes.end > offset);
            let declaration_start = declarations
                .get(cursor)
                .filter(|declaration| {
                    declaration.bytes.start <= selection.end
                        && whitespace_end(source, offset, declaration.bytes.start, target_chars)
                            == declaration.bytes.start
                })
                .map_or(offset, |declaration| declaration.bytes.start);
            let declaration = active
                .iter()
                .copied()
                .chain(
                    declarations[cursor..]
                        .iter()
                        .take_while(|declaration| declaration.bytes.start == declaration_start),
                )
                .filter(|declaration| {
                    declaration.bytes.start == declaration_start
                        && declaration.bytes.end <= selection.end
                        && source[offset..declaration.bytes.end]
                            .chars()
                            .take(target_chars.saturating_add(1))
                            .count()
                            <= target_chars
                })
                .max_by_key(|declaration| declaration.bytes.end);
            let (end, kind, name) = if let Some(declaration) = declaration {
                let next = declarations[cursor..]
                    .iter()
                    .find(|next| next.bytes.start >= declaration.bytes.end)
                    .map_or(selection.end, |next| next.bytes.start.min(selection.end));
                let used = source[offset..declaration.bytes.end].chars().count();
                (
                    whitespace_end(source, declaration.bytes.end, next, target_chars - used),
                    declaration.kind.clone(),
                    Some(declaration.name.clone()),
                )
            } else {
                let next = declarations
                    .get(cursor)
                    .map_or(selection.end, |declaration| {
                        declaration.bytes.start.min(selection.end)
                    });
                let end = text_end(source, offset, next, target_chars);
                let kind = if end < next { "fragment" } else { "text" };
                (end, kind.to_owned(), None)
            };
            let target = offset..end;
            let context = context_ranges(source, selection, &target, &active, target_chars / 4);
            if !emit(Section {
                target,
                context,
                kind,
                name,
            })? {
                return Ok(false);
            }
            offset = end;
        }
    }
    Ok(true)
}

fn whitespace_end(source: &str, start: usize, end: usize, chars: usize) -> usize {
    source[start..end]
        .char_indices()
        .take(chars)
        .take_while(|(_, character)| character.is_whitespace())
        .fold(start, |_, (byte, character)| {
            start + byte + character.len_utf8()
        })
}

fn text_end(source: &str, start: usize, end: usize, chars: usize) -> usize {
    let text = &source[start..end];
    let maximum = text
        .char_indices()
        .nth(chars)
        .map_or(end, |(byte, _)| start + byte);
    if maximum == end {
        return end;
    }
    // Prefer complete paragraphs, then complete lines, then whitespace.
    let prefix = &source[start..maximum];
    prefix
        .rfind("\n\n")
        .map(|byte| start + byte + 2)
        .or_else(|| prefix.rfind('\n').map(|byte| start + byte + 1))
        .or_else(|| {
            prefix
                .char_indices()
                .rev()
                .find(|(_, c)| c.is_whitespace())
                .map(|(byte, c)| start + byte + c.len_utf8())
        })
        .filter(|&boundary| boundary > start)
        .unwrap_or(maximum)
}

fn context_ranges(
    source: &str,
    selection: &Range<usize>,
    target: &Range<usize>,
    declarations: &[&Declaration],
    mut chars: usize,
) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();
    // Outer headings keep lexical ownership without copying a whole parent.
    for declaration in declarations
        .iter()
        .filter(|declaration| {
            declaration.bytes.start >= selection.start
                && declaration.bytes.start < target.start
                && declaration.bytes.end >= target.end
        })
        .rev()
    {
        let heading = declaration.heading.start..declaration.heading.end.min(target.start);
        let cost = source[heading.clone()].chars().count();
        if cost > 0
            && cost <= chars
            && !ranges.iter().any(|other: &Range<usize>| {
                other.start <= heading.start && other.end >= heading.end
            })
        {
            chars -= cost;
            ranges.push(heading);
        }
    }
    if chars > 0 && target.start > 0 {
        let start = source[selection.start..target.start]
            .char_indices()
            .rev()
            .nth(chars.saturating_sub(1))
            .map_or(selection.start, |(byte, _)| selection.start + byte);
        if start < target.start {
            ranges.push(start..target.start);
        }
    }
    ranges.sort_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::new();
    for range in ranges {
        if let Some(previous) = merged.last_mut()
            && previous.end >= range.start
        {
            previous.end = previous.end.max(range.end);
        } else {
            merged.push(range);
        }
    }
    merged
}

#[cfg(test)]
fn plan(source: &str, path: &Path, selected: &[Range<usize>], target_chars: usize) -> Vec<Section> {
    let mut sections = Vec::new();
    let complete = visit(source, path, selected, target_chars, |section| {
        sections.push(section);
        Ok::<_, ()>(true)
    });
    assert_eq!(complete, Ok(true));
    sections
}

#[cfg(test)]
fn line_range(source: &str, bytes: &Range<usize>) -> [usize; 2] {
    let first = source.as_bytes()[..bytes.start]
        .iter()
        .filter(|&&byte| byte == b'\n')
        .count()
        + 1;
    let last_byte = bytes.end.saturating_sub(1).max(bytes.start);
    let last = source.as_bytes()[..last_byte]
        .iter()
        .filter(|&&byte| byte == b'\n')
        .count()
        + 1;
    [first, last]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partitions_every_selected_byte_across_scripts_and_line_endings() {
        for text in [
            "αβγ🙂中文\r\nمرحبا\nשלום",
            "without whitespace🙂🙂🙂",
            "a\n\nb\n\nlast",
            "\u{feff}a\r\nb\r\n",
        ] {
            for budget in 1..=text.chars().count() {
                let plan = plan(
                    text,
                    Path::new("unknown.xyz"),
                    std::slice::from_ref(&(0..text.len())),
                    budget,
                );
                let mut next = 0;
                for section in plan {
                    assert_eq!(section.target.start, next);
                    assert!(section.target.start < section.target.end);
                    assert!(text.is_char_boundary(section.target.end));
                    assert!(text[section.target.clone()].chars().count() <= budget);
                    assert!(
                        section
                            .context
                            .iter()
                            .all(|context| context.end <= section.target.start
                                || context.start >= section.target.end)
                    );
                    next = section.target.end;
                }
                assert_eq!(next, text.len());
            }
        }
    }

    #[test]
    fn disjoint_selection_keeps_original_offsets_and_no_gap_target() {
        let text = "one\ntwo\nthree\nfour\n";
        let selected = [0..4, 8..text.len()];
        let plan = plan(text, Path::new("text.txt"), &selected, 5);
        let actual: Vec<_> = plan
            .iter()
            .flat_map(|section| section.target.clone())
            .collect();
        let expected: Vec<_> = selected.iter().flat_map(Clone::clone).collect();
        assert_eq!(actual, expected);
        assert_eq!(line_range(text, &(8..14)), [3, 3]);
    }

    #[test]
    fn declaration_documentation_and_utf16_geometry_stay_with_the_target() {
        let source =
            "\u{feff}// 🙂 prefix\r\n/** חוזה 中文 */\r\nfunction checked(){return '🙂';}\r\n";
        let sections = plan(
            source,
            Path::new("documented.ts"),
            std::slice::from_ref(&(0..source.len())),
            100,
        );
        let declaration = sections
            .iter()
            .find(|section| section.name.as_deref() == Some("checked"))
            .expect("documented declaration");
        assert_eq!(
            &source[declaration.target.clone()],
            "/** חוזה 中文 */\r\nfunction checked(){return '🙂';}\r\n"
        );
        assert_eq!(line_range(source, &declaration.target), [2, 3]);
        assert_eq!(
            sections
                .iter()
                .map(|section| &source[section.target.clone()])
                .collect::<String>(),
            source
        );
    }

    #[test]
    fn traversal_stops_before_materializing_unconsumed_sections() {
        let source = (0..500)
            .map(|index| format!("function f{index}(){{return {index};}}\n"))
            .collect::<String>();
        let mut visited = 0;
        let completed = visit(
            &source,
            Path::new("many.ts"),
            std::slice::from_ref(&(0..source.len())),
            50,
            |_| {
                visited += 1;
                Ok::<_, ()>(visited < 3)
            },
        );
        assert_eq!(completed, Ok(false));
        assert_eq!(visited, 3);
    }

    #[test]
    fn whitespace_attaches_without_merging_declarations_or_losing_documentation() {
        let source = " \r\n\tfunction first(){return '🙂';}\r\n \u{2003}\t\n  /** second 中文 */\r\n  function second(){return 'עברית';}\r\n\t ";
        let sections = plan(
            source,
            Path::new("whitespace.ts"),
            std::slice::from_ref(&(0..source.len())),
            200,
        );
        assert_eq!(sections.len(), 2);
        assert_eq!(
            sections
                .iter()
                .filter_map(|s| s.name.as_deref())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert!(sections.iter().all(|s| s.kind == "function"));
        assert!(source[sections[1].target.clone()].contains("/** second 中文 */"));
        assert_eq!(sections[0].target.start, 0);
        assert_eq!(sections[0].target.end, sections[1].target.start);
        assert_eq!(sections[1].target.end, source.len());
        assert_eq!(
            sections
                .iter()
                .map(|s| &source[s.target.clone()])
                .collect::<String>(),
            source
        );
    }

    #[test]
    fn whitespace_attachment_respects_every_target_budget_and_context_boundary() {
        let source =
            " \tfunction alpha(){return '🙂';}\r\n\u{2003}\nfunction beta(){return '中';}\n\t";
        for budget in 1..=source.chars().count() {
            let sections = plan(
                source,
                Path::new("bounded.ts"),
                std::slice::from_ref(&(0..source.len())),
                budget,
            );
            let mut end = 0;
            for section in &sections {
                assert_eq!(section.target.start, end);
                assert!(section.target.end > end);
                assert!(source[section.target.clone()].chars().count() <= budget);
                assert!(section.context.iter().all(|context| {
                    context.end <= section.target.start || context.start >= section.target.end
                }));
                if let Some(name) = section.name.as_deref() {
                    let target = &source[section.target.clone()];
                    assert!(target.contains(&format!("function {name}()")));
                    assert_eq!(target.matches("function ").count(), 1);
                }
                end = section.target.end;
            }
            assert_eq!(end, source.len());
        }
    }

    #[test]
    fn whitespace_attachment_stops_at_substantive_text_and_selection_boundaries() {
        let source = "function one(){return 1;}\n  console.log('substantive');\n function two(){return 2;}\nEXCLUDED\n \tfunction three(){return 3;}\n";
        let gap = source.find("EXCLUDED").expect("excluded marker");
        let resumed = gap + "EXCLUDED\n".len();
        let selected = [0..gap, resumed..source.len()];
        let sections = plan(source, Path::new("selections.ts"), &selected, 200);
        assert_eq!(
            sections
                .iter()
                .filter_map(|s| s.name.as_deref())
                .collect::<Vec<_>>(),
            vec!["one", "two", "three"]
        );
        assert!(
            sections.iter().any(|s| s.name.is_none()
                && source[s.target.clone()].contains("console.log('substantive')"))
        );
        assert!(sections.iter().all(|s| {
            selected
                .iter()
                .any(|range| range.start <= s.target.start && s.target.end <= range.end)
        }));
        assert_eq!(
            sections
                .iter()
                .map(|s| &source[s.target.clone()])
                .collect::<String>(),
            format!("{}{}", &source[..gap], &source[resumed..])
        );
    }

    #[test]
    fn minified_declarations_use_byte_ranges_after_multibyte_text() {
        let text =
            "const title='🙂中文';function first(){return title;}function second(){return 2;}";
        let plan = plan(
            text,
            Path::new("fixture.ts"),
            std::slice::from_ref(&(0..text.len())),
            40,
        );
        let first = plan
            .iter()
            .find(|section| section.name.as_deref() == Some("first"))
            .expect("first declaration");
        assert_eq!(
            &text[first.target.clone()],
            "function first(){return title;}"
        );
        assert_eq!(line_range(text, &first.target), [1, 1]);
        assert_eq!(
            plan.iter()
                .map(|section| &text[section.target.clone()])
                .collect::<String>(),
            text
        );
    }
}

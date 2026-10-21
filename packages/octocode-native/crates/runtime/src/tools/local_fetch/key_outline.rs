//! `minify:"symbols"` for structured data (JSON, YAML, TOML): an outline of
//! the document's keys, as a code outline lists declarations. Each line is
//! the source line that opens a key, with the citation gutter (`N\t`); a key
//! whose value spans lines carries its span (`start-end\t`), so its value is
//! one `ranges` read away. Containers are listed down to [`MAX_DEPTH`] levels
//! of nesting, scalars at the top level only, plus the member that names each
//! object of an array (see [`identity`]).
//!
//! TOML is read with the `toml` parser (its spans place every table; a line
//! it cannot parse is skipped and named, see [`KeyOutline::unparsed`]). JSON and
//! YAML are scanned, never parsed: strings, comments, YAML block scalars and
//! multi-line quoted scalars are skipped, and trailing commas or broken
//! nesting degrade to the nearest container still visible, never to an error.

use crate::tools::line_spans::merge_spans;

use std::collections::HashSet;
use std::path::Path;

/// Nesting levels of containers an outline lists.
const MAX_DEPTH: usize = 3;

/// One outlined key: its 1-based line span and nesting depth (1 = top level).
#[derive(Debug, PartialEq, Eq)]
struct Entry {
    start: usize,
    end: usize,
    depth: usize,
    /// Listed even as a one-line value: the member naming an array element.
    names_element: bool,
}

impl Entry {
    fn at(line: usize, depth: usize) -> Self {
        Self {
            start: line,
            end: line,
            depth,
            names_element: false,
        }
    }
}

/// A document's key outline, and the lines its parser skipped.
pub(super) struct KeyOutline {
    pub(super) text: String,
    /// Why the outline may miss keys: the line spans (`"2, 7-9"`) a parser
    /// could not parse and resynchronized after. Only TOML is parsed.
    pub(super) unparsed: Option<String>,
}

/// The key outline of `content`, a document at `path`; `None` for a file
/// that is not JSON, YAML or TOML, or one with no key to list.
pub(super) fn key_outline(content: &str, path: &str) -> Option<KeyOutline> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    let (entries, unparsed) = match extension.as_str() {
        "json" | "jsonc" | "json5" => (json_entries(content), Vec::new()),
        "yaml" | "yml" => (yaml_entries(content), Vec::new()),
        "toml" => toml_entries(content),
        _ => return None,
    };
    let unparsed = (!unparsed.is_empty()).then(|| {
        unparsed
            .iter()
            .map(|&(start, end)| {
                if start == end {
                    start.to_string()
                } else {
                    format!("{start}-{end}")
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    });
    Some(KeyOutline {
        text: render(content, entries)?,
        unparsed,
    })
}

/// The outline lines: containers within [`MAX_DEPTH`], top-level scalars and
/// element names, each source line once.
fn render(content: &str, mut entries: Vec<Entry>) -> Option<String> {
    entries.retain(|entry| {
        entry.depth <= MAX_DEPTH
            && (entry.end > entry.start || entry.depth == 1 || entry.names_element)
    });
    entries.sort_by_key(|entry| (entry.start, std::cmp::Reverse(entry.end)));
    entries.dedup_by_key(|entry| entry.start);
    if entries.is_empty() {
        return None;
    }
    let lines: Vec<&str> = content.lines().collect();
    let mut out = String::new();
    for entry in entries {
        let Some(text) = lines.get(entry.start - 1) else {
            continue;
        };
        if entry.end > entry.start {
            out.push_str(&format!("{}-{}\t", entry.start, entry.end));
        } else {
            out.push_str(&format!("{}\t", entry.start));
        }
        out.push_str(text);
        out.push('\n');
    }
    (!out.is_empty()).then_some(out)
}

/// A string member of an object that is an array element: its key, its
/// value and its line.
struct Scalar<'a> {
    key: &'a str,
    value: &'a str,
    line: usize,
}

/// The member being read in an object: its entry, key, line, and whether
/// its value is still to come.
struct Member<'a> {
    entry: usize,
    key: &'a str,
    value_pending: bool,
}

/// One open JSON container.
struct Frame<'a> {
    object: bool,
    expect_key: bool,
    member: Option<Member<'a>>,
    /// The entry this container's key (or element slot) opened.
    opened: Option<usize>,
    /// An object that is an array element: its string members.
    scalars: Option<Vec<Scalar<'a>>>,
    /// An array: the string members of each object element, with the
    /// element's depth.
    elements: Vec<(usize, Vec<Scalar<'a>>)>,
}

impl Frame<'_> {
    fn open(object: bool, opened: Option<usize>, element: bool) -> Self {
        Self {
            object,
            expect_key: object,
            member: None,
            opened,
            scalars: element.then(Vec::new),
            elements: Vec::new(),
        }
    }
}

/// Members of JSON objects: each key's line and the span of a container
/// value; each object of an array, with its naming member.
fn json_entries(content: &str) -> Vec<Entry> {
    let bytes = content.as_bytes();
    let mut entries = Vec::new();
    let mut stack: Vec<Frame> = Vec::new();
    let mut line = 1;
    let mut at = 0;
    while at < bytes.len() {
        match bytes[at] {
            b'\n' => line += 1,
            b'/' if bytes.get(at + 1) == Some(&b'/') => {
                at = bytes[at..]
                    .iter()
                    .position(|byte| *byte == b'\n')
                    .map_or(bytes.len(), |end| at + end);
                continue;
            }
            b'/' if bytes.get(at + 1) == Some(&b'*') => {
                let end = content[at + 2..]
                    .find("*/")
                    .map_or(bytes.len(), |end| at + 2 + end + 2);
                line += content[at..end].matches('\n').count();
                at = end;
                continue;
            }
            b'"' | b'\'' => {
                let end = string_end(bytes, at);
                // The token's text without its quotes (to the source end
                // when unterminated).
                let close = if end > at + 1 && bytes[end - 1] == bytes[at] {
                    end - 1
                } else {
                    end
                };
                let token = &content[at + 1..close];
                let token_line = line;
                line += content[at..end].matches('\n').count();
                if let Some(frame) = stack.last_mut()
                    && frame.object
                {
                    if frame.expect_key {
                        frame.expect_key = false;
                        frame.member = Some(Member {
                            entry: entries.len(),
                            key: token,
                            value_pending: true,
                        });
                        entries.push(Entry::at(token_line, stack.len()));
                    } else if let Some(member) = frame.member.as_mut()
                        && member.value_pending
                    {
                        member.value_pending = false;
                        if let Some(scalars) = frame.scalars.as_mut() {
                            scalars.push(Scalar {
                                key: member.key,
                                value: token,
                                line: token_line,
                            });
                        }
                    }
                }
                at = end;
                continue;
            }
            b',' => {
                if let Some(frame) = stack.last_mut() {
                    frame.expect_key = frame.object;
                    frame.member = None;
                }
            }
            open @ (b'{' | b'[') => {
                let depth = stack.len();
                let (opened, element) = match stack.last_mut() {
                    // A container value of a named member spans from its key.
                    Some(frame) if frame.object => (
                        frame.member.as_mut().map(|member| {
                            member.value_pending = false;
                            member.entry
                        }),
                        false,
                    ),
                    // An object element of a listed array spans from its
                    // opening line.
                    Some(_) if open == b'{' && depth <= MAX_DEPTH => {
                        entries.push(Entry::at(line, depth));
                        (Some(entries.len() - 1), true)
                    }
                    _ => (None, false),
                };
                stack.push(Frame::open(open == b'{', opened, element));
            }
            b'}' | b']' => {
                if let Some(frame) = stack.pop() {
                    if let Some(index) = frame.opened {
                        entries[index].end = line;
                    }
                    if let (Some(scalars), Some(index), Some(parent)) =
                        (frame.scalars, frame.opened, stack.last_mut())
                    {
                        parent.elements.push((entries[index].depth, scalars));
                    }
                    for (depth, scalar) in identity(&frame.elements) {
                        entries.push(Entry {
                            names_element: true,
                            ..Entry::at(scalar.line, depth)
                        });
                    }
                }
            }
            _ => {}
        }
        at += 1;
    }
    entries
}

/// The member that names each object of an array: a key every object
/// carries as a string, with a different value in each; of several, the one
/// with the shortest values (a name over a description). An array of fewer
/// than two objects needs no names.
fn identity<'s, 'a>(elements: &'s [(usize, Vec<Scalar<'a>>)]) -> Vec<(usize, &'s Scalar<'a>)> {
    let [(_, first), _, ..] = elements else {
        return Vec::new();
    };
    let named_by = |key: &str| -> Option<(usize, Vec<(usize, &'s Scalar<'a>)>)> {
        let mut seen = HashSet::new();
        let mut names = Vec::with_capacity(elements.len());
        for (depth, scalars) in elements {
            let scalar = scalars.iter().find(|scalar| scalar.key == key)?;
            seen.insert(scalar.value).then_some(())?;
            names.push((*depth, scalar));
        }
        let length = names.iter().map(|(_, scalar)| scalar.value.len()).sum();
        Some((length, names))
    };
    first
        .iter()
        .filter_map(|candidate| named_by(candidate.key))
        .min_by_key(|(length, _)| *length)
        .map(|(_, names)| names)
        .unwrap_or_default()
}

/// The byte after the string token starting at `at`: its closing quote, or
/// the end of the source when unterminated.
fn string_end(bytes: &[u8], at: usize) -> usize {
    let quote = bytes[at];
    let mut end = at + 1;
    while end < bytes.len() {
        match bytes[end] {
            b'\\' => end += 2,
            byte if byte == quote => return end + 1,
            _ => end += 1,
        }
    }
    bytes.len()
}

/// A YAML scalar whose text continues on the lines after its first.
enum Continued {
    /// A block scalar (`|`, `>`): every following line indented past the
    /// node holding it, or blank.
    Block { parent_indent: usize },
    /// A quoted scalar: through the line that closes the quote.
    Quoted(char),
}

/// YAML mapping keys: each key line, its depth by indentation, and the span
/// through its last more-indented line. Lines inside a block scalar or a
/// multi-line quoted scalar are text, never keys.
fn yaml_entries(content: &str) -> Vec<Entry> {
    let mut entries: Vec<Entry> = Vec::new();
    // Open keys: indentation and entry index.
    let mut open: Vec<(usize, usize)> = Vec::new();
    let mut last_content = 0;
    let mut continued: Option<Continued> = None;
    for (index, raw) in content.lines().enumerate() {
        let line = index + 1;
        let body = raw.trim_start();
        let raw_indent = raw.len() - body.len();
        match &continued {
            Some(Continued::Block { parent_indent }) => {
                if body.is_empty() {
                    continue;
                }
                if raw_indent > *parent_indent {
                    last_content = line;
                    continue;
                }
                continued = None;
            }
            Some(Continued::Quoted(quote)) => {
                last_content = line;
                if quote_closes(raw, *quote) {
                    continued = None;
                }
                continue;
            }
            None => {}
        }
        if body.is_empty() || body.starts_with('#') || body.starts_with("---") || body == "..." {
            continue;
        }
        // A list item's key sits past its `- ` markers.
        let mut indent = raw_indent;
        let mut item = body;
        let mut dash_indent = None;
        while let Some(rest) = item.strip_prefix("- ") {
            dash_indent = Some(indent);
            indent += 2 + (rest.len() - rest.trim_start().len());
            item = rest.trim_start();
        }
        while open
            .last()
            .is_some_and(|(depth_indent, _)| *depth_indent >= indent)
        {
            if let Some((_, entry)) = open.pop() {
                entries[entry].end = last_content.max(entries[entry].start);
            }
        }
        last_content = line;
        let value = match yaml_key(item) {
            Some(colon) => {
                open.push((indent, entries.len()));
                entries.push(Entry::at(line, open.len()));
                (Some(item[colon + 1..].trim_start()), indent)
            }
            // A bare list item's own scalar belongs to its dash.
            None => (dash_indent.map(|_| item), dash_indent.unwrap_or(indent)),
        };
        if let (Some(value), parent_indent) = value {
            continued = continues(value, parent_indent);
        }
    }
    for (_, entry) in open {
        entries[entry].end = last_content.max(entries[entry].start);
    }
    entries
}

/// The continuation a value opens on its first line: a block scalar
/// header (`|`, `>`, with indentation and chomping indicators and an
/// optional comment), or a quote left open.
fn continues(value: &str, parent_indent: usize) -> Option<Continued> {
    let head = value.split(" #").next().unwrap_or(value).trim_end();
    if let Some(indicators) = head.strip_prefix(['|', '>'])
        && indicators
            .chars()
            .all(|c| c.is_ascii_digit() || c == '+' || c == '-')
    {
        return Some(Continued::Block { parent_indent });
    }
    let quote = value.chars().next().filter(|c| matches!(c, '"' | '\''))?;
    (!quote_closes(&value[1..], quote)).then_some(Continued::Quoted(quote))
}

/// Whether `text` holds the quote that closes a YAML `quote` scalar: an
/// unescaped `"`, or a `'` not doubled.
fn quote_closes(text: &str, quote: char) -> bool {
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' if quote == '"' => {
                chars.next();
            }
            '\'' if quote == '\'' && chars.peek() == Some(&'\'') => {
                chars.next();
            }
            c if c == quote => return true,
            _ => {}
        }
    }
    false
}

/// The colon of `item` when it opens a mapping key: `key:` followed by a
/// space or the line end, before any comment; a quoted key may hold `: `.
fn yaml_key(item: &str) -> Option<usize> {
    if item.starts_with(['{', '[', '|', '>', '&', '*', '!', '%', '@', '`']) {
        return None;
    }
    let body = item.split(" #").next().unwrap_or(item).trim_end();
    let colon = match body.chars().next() {
        Some(quote @ ('"' | '\'')) => body[1..].find(quote).map(|end| end + 2),
        _ => body
            .find(": ")
            .or_else(|| body.ends_with(':').then(|| body.len() - 1)),
    };
    colon.filter(|at| {
        *at > 0
            && body[*at..].starts_with(':')
            && body[*at + 1..]
                .chars()
                .next()
                .is_none_or(|next| next == ' ')
    })
}

/// Parses a malformed TOML source at most this many times: each retry
/// blanks the lines the last parse failed on.
const TOML_RESYNCS: usize = 8;

/// TOML tables (`[a]`, `[[a]]`) through their last value, and the
/// top-level keys before the first table, read with the `toml` parser: text
/// inside a multi-line string or array is never a table. A line the parser
/// fails on is blanked (offsets kept) and the source parsed again, so one
/// broken header does not swallow the tables after it; the second value
/// lists those lines (1-based spans, ascending).
fn toml_entries(content: &str) -> (Vec<Entry>, Vec<(usize, usize)>) {
    let starts: Vec<usize> = std::iter::once(0)
        .chain(content.match_indices('\n').map(|(at, _)| at + 1))
        .collect();
    let mut text = std::borrow::Cow::Borrowed(content);
    let mut unparsed: Vec<(usize, usize)> = Vec::new();
    for attempt in 0..=TOML_RESYNCS {
        let (root, errors) = toml::de::DeTable::parse_recoverable(&text);
        let lines = Lines {
            content: &text,
            starts: &starts,
        };
        let failed: Vec<(usize, usize)> = errors
            .iter()
            .filter_map(toml::de::Error::span)
            .map(|span| (lines.line(span.start), lines.last_line(span)))
            .filter(|span| !unparsed.contains(span))
            .collect();
        if failed.is_empty() || attempt == TOML_RESYNCS {
            unparsed.extend(failed);
            return (lines.entries(root.get_ref()), merge_spans(unparsed));
        }
        let mut bytes = text.into_owned().into_bytes();
        for &(first, last) in &failed {
            let from = starts[first - 1];
            let to = starts.get(last).copied().unwrap_or(bytes.len());
            for byte in &mut bytes[from..to] {
                if *byte != b'\n' {
                    *byte = b' ';
                }
            }
        }
        unparsed.extend(failed);
        // Whole lines became ASCII spaces: still UTF-8.
        text = std::borrow::Cow::Owned(String::from_utf8(bytes).unwrap_or_default());
    }
    (Vec::new(), merge_spans(unparsed))
}

/// Line numbers of byte offsets in a parsed TOML source.
struct Lines<'a> {
    content: &'a str,
    starts: &'a [usize],
}

type Spanned<'i> = toml::Spanned<toml::de::DeValue<'i>>;

impl Lines<'_> {
    /// The outline entries of a parsed document: its header tables, and
    /// the top-level keys before the first table.
    fn entries(&self, root: &toml::de::DeTable) -> Vec<Entry> {
        let mut entries = Vec::new();
        self.tables(root, &mut entries);
        let first_table = entries.iter().map(|entry| entry.start).min();
        for (key, value) in root {
            let start = self.line(key.span().start);
            if !self.is_header(value) && first_table.is_none_or(|table| start < table) {
                entries.push(Entry {
                    end: self.last_line(value.span()).max(start),
                    ..Entry::at(start, 1)
                });
            }
        }
        entries
    }

    /// The 1-based line holding byte `at`.
    fn line(&self, at: usize) -> usize {
        self.starts.partition_point(|start| *start <= at)
    }

    /// The line of a span's last byte.
    fn last_line(&self, span: std::ops::Range<usize>) -> usize {
        self.line(span.end.saturating_sub(1).max(span.start))
    }

    /// A table opened by a `[header]` (the parser spans such a table by
    /// its header; an implicit or dotted table by its key).
    fn is_header(&self, value: &Spanned) -> bool {
        let header = |value: &Spanned| {
            matches!(value.get_ref(), toml::de::DeValue::Table(_))
                && self.content.as_bytes().get(value.span().start) == Some(&b'[')
        };
        match value.get_ref() {
            toml::de::DeValue::Array(items) => items.first().is_some_and(header),
            _ => header(value),
        }
    }

    /// Every header table under `table`, spanning its header through its
    /// last value.
    fn tables(&self, table: &toml::de::DeTable, entries: &mut Vec<Entry>) {
        for (_, value) in table {
            let items: &[Spanned] = match value.get_ref() {
                toml::de::DeValue::Array(items) => items,
                _ => std::slice::from_ref(value),
            };
            for item in items {
                let toml::de::DeValue::Table(inner) = item.get_ref() else {
                    continue;
                };
                if self.is_header(item) {
                    let start = self.line(item.span().start);
                    entries.push(Entry {
                        end: self.extent(inner).max(start),
                        ..Entry::at(start, 1)
                    });
                }
                self.tables(inner, entries);
            }
        }
    }

    /// The last line of a table's own values (header tables under it are
    /// sections of their own).
    fn extent(&self, table: &toml::de::DeTable) -> usize {
        table
            .iter()
            .filter(|(_, value)| !self.is_header(value))
            .map(|(_, value)| match value.get_ref() {
                toml::de::DeValue::Table(inner) => {
                    self.extent(inner).max(self.last_line(value.span()))
                }
                _ => self.last_line(value.span()),
            })
            .max()
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_outline_merges_touching_and_overlapping_unparsed_spans() {
        let outline = key_outline(
            "title = 'ok'\n[broken\n[also_broken\n[valid]\na = 1\n",
            "bad.toml",
        )
        .expect("outline");
        assert_eq!(outline.unparsed.as_deref(), Some("2-3"));
        assert!(outline.text.contains("[valid]"), "{}", outline.text);
    }

    #[test]
    fn json_outlines_member_keys_with_container_spans() {
        let json = "{\n  \"name\": \"x\",\n  \"scripts\": {\n    \"build\": \"tsc\",\n    \"nested\": {\n      \"deep\": {\n        \"deeper\": [1]\n      }\n    }\n  },\n  \"list\": [\n    {\"a\": 1}\n  ]\n}\n";
        let outline = key_outline(json, "package.json").expect("outline").text;
        assert_eq!(
            outline,
            "2\t  \"name\": \"x\",\n3-10\t  \"scripts\": {\n5-9\t    \"nested\": {\n6-8\t      \"deep\": {\n11-13\t  \"list\": [\n"
        );
    }

    #[test]
    fn json_strings_and_comments_never_open_containers() {
        let json = "// {\n{\n  /* [ */ \"a\": \"{[\",\n  \"b\": {\n    \"c\": 1\n  }\n}\n";
        assert_eq!(
            key_outline(json, "a.jsonc").expect("outline").text,
            "3\t  /* [ */ \"a\": \"{[\",\n4-6\t  \"b\": {\n"
        );
    }

    /// Each object of an array spans from its opening line and shows the
    /// member that tells it apart: `name` is the key every object holds as
    /// a different string (`kind` repeats, `beta` is no string).
    #[test]
    fn json_array_objects_are_named_by_their_distinct_member() {
        let json = "{\n  \"tools\": [\n    {\n      \"beta\": true,\n      \"kind\": \"local\",\n      \"name\": \"fetch\",\n      \"schema\": {\n        \"a\": 1\n      }\n    },\n    {\n      \"beta\": false,\n      \"kind\": \"local\",\n      \"name\": \"search\",\n      \"schema\": {\n        \"a\": 1\n      }\n    }\n  ]\n}\n";
        assert_eq!(
            key_outline(json, "contract.json").expect("outline").text,
            "2-19\t  \"tools\": [\n3-10\t    {\n6\t      \"name\": \"fetch\",\n7-9\t      \"schema\": {\n11-18\t    {\n14\t      \"name\": \"search\",\n15-17\t      \"schema\": {\n"
        );
    }

    /// Of two distinct string members, the shorter values name the objects.
    #[test]
    fn json_array_names_prefer_the_shortest_distinct_values() {
        let json = "[\n  {\n    \"about\": \"the first long description\",\n    \"id\": \"a\",\n    \"n\": [1]\n  },\n  {\n    \"about\": \"the second long description\",\n    \"id\": \"b\",\n    \"n\": [2]\n  }\n]\n";
        assert_eq!(
            key_outline(json, "a.json").expect("outline").text,
            "2-6\t  {\n4\t    \"id\": \"a\",\n7-11\t  {\n9\t    \"id\": \"b\",\n"
        );
    }

    #[test]
    fn yaml_outlines_keys_by_indentation() {
        let yaml = "name: ci\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    steps:\n      - name: test\n        run: |\n          cargo test\n";
        assert_eq!(
            key_outline(yaml, "ci.yml").expect("outline").text,
            "1\tname: ci\n2-4\ton:\n3-4\t  push:\n5-10\tjobs:\n6-10\t  build:\n7-10\t    steps:\n"
        );
    }

    /// Text inside a block scalar or a multi-line quoted scalar is never a
    /// key, however it is shaped.
    #[test]
    fn yaml_block_and_quoted_scalars_are_text() {
        let yaml = "name: demo\nscript: |\n  fake: value\n  other:\n    nested: 1\n\n  more: text\nfolded: >-\n  a: b\nquoted: \"first\n  inner: x\n  end\"\nlist:\n  - |\n    item: text\n  - plain\njobs:\n  build:\n    run: echo\n";
        assert_eq!(
            key_outline(yaml, "k.yaml").expect("outline").text,
            "1\tname: demo\n2-7\tscript: |\n8-9\tfolded: >-\n10-12\tquoted: \"first\n13-16\tlist:\n17-19\tjobs:\n18-19\t  build:\n"
        );
    }

    #[test]
    fn toml_outlines_tables_and_top_level_keys() {
        let toml = "name = \"x\"\n\n[package]\nversion = \"1\"\n\n[[bin]]\nname = \"b\"\n";
        assert_eq!(
            key_outline(toml, "Cargo.toml").expect("outline").text,
            "1\tname = \"x\"\n3-4\t[package]\n6-7\t[[bin]]\n"
        );
    }

    /// The parser places tables: a `[...]` line inside a multi-line string
    /// or array is a value, and a multi-line value spans its lines.
    #[test]
    fn toml_strings_and_arrays_never_open_tables() {
        let toml = "title = \"x\"\nmulti = \"\"\"\n[not.a.table]\nkey = 1\n\"\"\"\nlist = [\n  [1, 2],\n]\n[server]\nport = 80\n# trailing comment\n\n[[servers.list]]\nname = \"a\"\n[[servers.list]]\nname = \"b\"\n";
        assert_eq!(
            key_outline(toml, "k.toml").expect("outline").text,
            "1\ttitle = \"x\"\n2-5\tmulti = \"\"\"\n6-8\tlist = [\n9-10\t[server]\n13-14\t[[servers.list]]\n15-16\t[[servers.list]]\n"
        );
    }

    /// A malformed header is skipped, not read as a table running to the
    /// next one that parses: its keys read as top-level ones, the tables
    /// after it are listed, and the outline names the skipped line.
    #[test]
    fn toml_resumes_after_a_line_it_cannot_parse() {
        let toml = "title = \"x\"\n[server\nport = 80\n[db]\nurl = 'a'\nlit = '''\n[fake.table]\n'''\n[[arr]]\nn = 1\n[[arr]]\nn = 2\n";
        let outline = key_outline(toml, "bad.toml").expect("outline");
        assert_eq!(
            outline.text,
            "1\ttitle = \"x\"\n3\tport = 80\n4-8\t[db]\n9-10\t[[arr]]\n11-12\t[[arr]]\n"
        );
        assert_eq!(outline.unparsed.as_deref(), Some("2"));
        let clean = key_outline("[a]\nb = 1\n", "ok.toml").expect("outline");
        assert_eq!(clean.unparsed, None);
    }

    #[test]
    fn other_files_have_no_key_outline() {
        assert!(key_outline("a: 1\n", "notes.txt").is_none());
        assert!(key_outline("[1, 2]\n", "a.json").is_none());
    }
}

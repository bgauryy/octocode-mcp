//! Enclosing declarations of search hits, from the same declaration outline
//! behind astSearch `symbols` (and its content-keyed cache).
//!
//! A hit row names the innermost declaration around its line as
//! `enclosing: {symbolName, kind, line, endLine}` (`line` is the name line),
//! so a caller can cite or address the function a hit sits in without
//! reading it: `symbolName` + `line` anchor lspSearch, `line`–`endLine` is a
//! localFetch range. A hit on a declaration's own name line names the
//! declaration around that one. Every hit row inside a declaration names
//! it, so no row reads as having none. A declaration search (`fn foo`)
//! names the owners of declaring hits only. A searched symbol whose
//! declaration is among the hits also yields a ready lspSearch references
//! lead.

/// One declaration of a file's outline, 1-based lines.
struct Declaration {
    kind: String,
    name: String,
    /// The name line.
    line: u32,
    start: u32,
    end: u32,
}

pub(super) struct Outline {
    declarations: Vec<Declaration>,
}

impl Outline {
    /// The outline of `source`; `None` when no extractor supports the file.
    /// It reads the typed declarations parse every reader of the file
    /// shares ([`crate::tools::declarations_cache::file_document`]): one
    /// parse per source version, never a JSON round trip.
    pub(super) fn of(source: &str, canonical_path: &str) -> Option<Self> {
        let document = crate::tools::declarations_cache::file_document(source, canonical_path)?;
        let declarations = document
            .declarations
            .iter()
            .filter(|item| !item.name.is_empty())
            .map(|item| {
                let start = item.range.start.line.saturating_add(1);
                Declaration {
                    kind: item.kind.clone(),
                    name: item.name.clone(),
                    line: item.selection_range.start.line.saturating_add(1),
                    start,
                    end: item.range.end.line.saturating_add(1).max(start),
                }
            })
            .collect();
        Some(Self { declarations })
    }

    /// The innermost declaration spanning `line` other than one named on
    /// `line` itself (its index in the outline).
    pub(super) fn owner(&self, line: u32) -> Option<usize> {
        self.declarations
            .iter()
            .enumerate()
            .filter(|(_, d)| d.start <= line && line <= d.end && d.line != line)
            .min_by_key(|(_, d)| (d.end - d.start, std::cmp::Reverse(d.start)))
            .map(|(index, _)| index)
    }

    /// Declaration `owner`: its name, kind, name line and last line, so a
    /// read of it needs no outline first.
    pub(super) fn label(&self, owner: usize) -> Option<super::types::Enclosing> {
        let declaration = self.declarations.get(owner)?;
        Some(super::types::Enclosing {
            symbol_name: declaration.name.clone(),
            kind: declaration.kind.clone(),
            line: declaration.line,
            end_line: declaration.end.max(declaration.line),
        })
    }

    /// The innermost declaration spanning `line` other than one named on
    /// `line` itself.
    #[cfg(test)]
    pub(super) fn enclosing(&self, line: u32) -> Option<super::types::Enclosing> {
        self.label(self.owner(line)?)
    }

    /// Whether `line` is the name line of a declaration named `name`.
    pub(super) fn declares(&self, name: &str, line: u32) -> bool {
        self.declaration(name, line).is_some()
    }

    /// The declaration named `name` on name line `line`: its kind and its
    /// first and last line.
    pub(super) fn declaration(&self, name: &str, line: u32) -> Option<(&str, u32, u32)> {
        self.declarations
            .iter()
            .find(|d| d.line == line && d.name == name)
            .map(|d| (d.kind.as_str(), d.start, d.end))
    }
}

/// Whether the search names a declaration (`fn foo`, `class Foo`) rather
/// than a bare identifier.
pub(super) fn declaration_search(search_text: &str) -> bool {
    searched_symbol(search_text).is_some() && search_text.trim().contains(char::is_whitespace)
}

/// The identifier a search names: a bare identifier, or one after a
/// declaration keyword.
pub(super) fn searched_symbol(search_text: &str) -> Option<&str> {
    let text = search_text.trim();
    let name = match text.split_once(char::is_whitespace) {
        Some((keyword, rest)) if octocode_engine::search::is_declaration_keyword(keyword) => {
            rest.trim()
        }
        Some(_) => return None,
        None => text,
    };
    let mut chars = name.chars();
    let first = chars.next()?;
    ((first.is_alphabetic() || first == '_' || first == '$')
        && chars.all(|c| c.is_alphanumeric() || c == '_' || c == '$'))
    .then_some(name)
}

#[cfg(test)]
mod tests {
    use super::{Outline, declaration_search, searched_symbol};

    const SOURCE: &str = "struct Harness;\n\
impl Harness {\n\
    fn try_read_output(&self) {\n\
        let x = 1;\n\
        x.unwrap();\n\
    }\n\
}\n\
\n\
fn free() {\n\
    try_read_output();\n\
}\n";

    #[test]
    fn hits_name_their_innermost_declaration_and_definitions_the_one_around() {
        let outline = Outline::of(SOURCE, "enclosing-test/a.rs").expect("rust outline");
        let named = |line| {
            outline.enclosing(line).map(|enclosing| {
                (
                    enclosing.kind,
                    enclosing.symbol_name,
                    enclosing.line,
                    enclosing.end_line,
                )
            })
        };
        // The enclosing declaration's full kind, name, name line and
        // last line (a single-line one ends where it starts).
        assert_eq!(
            named(5),
            Some(("method".into(), "try_read_output".into(), 3, 6))
        );
        assert_eq!(named(3), Some(("impl".into(), "Harness".into(), 2, 7)));
        assert_eq!(named(10), Some(("function".into(), "free".into(), 9, 11)));
        assert_eq!(outline.enclosing(8), None);
        assert!(outline.declares("try_read_output", 3));
        assert!(!outline.declares("try_read_output", 10));
    }

    /// A `#define` owns its line terminator; its range still ends on its
    /// own line, so a hit on the next macro is not attributed to it.
    #[test]
    fn consecutive_c_macros_end_on_their_own_line() {
        let source = "#define OBJ_ENCODING_STREAM 10\n#define OBJ_ENCODING_LISTPACK 11\nint use(void) {\n    return OBJ_ENCODING_LISTPACK;\n}\n";
        let outline = Outline::of(source, "enclosing-test/object.h").expect("c outline");
        assert_eq!(outline.enclosing(2), None);
        assert!(outline.declares("OBJ_ENCODING_LISTPACK", 2));
        assert_eq!(
            outline.declaration("OBJ_ENCODING_STREAM", 1),
            Some(("macro", 1, 1))
        );
        assert_eq!(
            outline
                .enclosing(4)
                .map(|e| (e.symbol_name, e.line, e.end_line)),
            Some(("use".into(), 3, 5))
        );
    }

    /// One declaration: kind, name, name line, first and last line.
    type Row = (String, String, u32, u32, u32);

    /// The declarations an outline holds.
    fn rows(outline: &Outline) -> Vec<Row> {
        outline
            .declarations
            .iter()
            .map(|d| (d.kind.clone(), d.name.clone(), d.line, d.start, d.end))
            .collect()
    }

    /// The outline keeps every named declaration with its 1-based name,
    /// first and last line, for the oxc (TS/JS) and tree-sitter paths.
    #[test]
    fn the_outline_keeps_every_declaration_with_its_lines() {
        let ts = "export class Box<T> {\n  private value: T;\n  constructor(v: T) { this.value = v; }\n  get(): T {\n    return this.value;\n  }\n}\nexport function make(): Box<number> {\n  const inner = () => 1;\n  return new Box(inner());\n}\ninterface Shape { area(): number }\nnamespace NS { export const k = 1; }\n";
        let py = "class A:\n    def m(self):\n        return 1\n\ndef f(x):\n    def g():\n        pass\n    return g\n";
        let row = |kind: &str, name: &str, line, start, end| -> Row {
            (kind.into(), name.into(), line, start, end)
        };
        let ts_rows = [
            row("class", "Box", 1, 1, 7),
            row("property", "value", 2, 2, 2),
            row("constructor", "constructor", 3, 3, 3),
            row("method", "get", 4, 4, 6),
            row("function", "make", 8, 8, 11),
            row("function", "inner", 9, 9, 9),
            row("interface", "Shape", 12, 12, 12),
            row("method", "area", 12, 12, 12),
            row("namespace", "NS", 13, 13, 13),
            row("constant", "k", 13, 13, 13),
        ];
        for (source, path, expected) in [
            (
                SOURCE,
                "enclosing-test/a.rs",
                vec![
                    row("struct", "Harness", 1, 1, 1),
                    row("impl", "Harness", 2, 2, 7),
                    row("method", "try_read_output", 3, 3, 6),
                    row("function", "free", 9, 9, 11),
                ],
            ),
            (ts, "enclosing-test/b.ts", ts_rows.to_vec()),
            (ts, "enclosing-test/b.tsx", ts_rows.to_vec()),
            (
                py,
                "enclosing-test/c.py",
                vec![
                    row("class", "A", 1, 1, 3),
                    row("method", "m", 2, 2, 3),
                    row("function", "f", 5, 5, 8),
                    row("function", "g", 6, 6, 7),
                ],
            ),
        ] {
            let outline = rows(&Outline::of(source, path).expect("outline"));
            assert_eq!(outline, expected, "{path}");
        }
    }

    /// An outline reads the shared typed parse: the parse it built is the
    /// one the next reader of the same source version takes, unparsed again.
    #[test]
    fn an_outline_reads_the_shared_declarations_parse() {
        let path = "enclosing-test/shared-parse.rs";
        let source = format!("{SOURCE}\n// shared parse\n");
        assert!(Outline::of(&source, path).is_some());
        let first = crate::tools::declarations_cache::file_document(&source, path).expect("parse");
        let again = crate::tools::declarations_cache::file_document(&source, path).expect("parse");
        assert!(std::sync::Arc::ptr_eq(&first, &again));
        assert!(Outline::of("not a supported file", "enclosing-test/a.unknownext").is_none());
    }

    #[test]
    fn symbols_are_bare_identifiers_or_follow_a_declaration_keyword() {
        assert_eq!(searched_symbol("toValidURL"), Some("toValidURL"));
        assert_eq!(
            searched_symbol("fn merge_near_windows"),
            Some("merge_near_windows")
        );
        assert_eq!(searched_symbol("$scope"), Some("$scope"));
        assert!(declaration_search("def handler"));
        // Every keyword the relevance ranking reads as a declaration counts.
        for text in ["mod walk", "object Cache", "val limit", "macro_rules! row"] {
            assert!(declaration_search(text), "{text}");
        }
        assert!(!declaration_search("toValidURL"));
        assert!(!declaration_search("foo bar"));
        for text in [
            "ctx.Done()",
            ".unwrap()",
            "a|b",
            "let x = 1",
            "foo bar",
            "9lives",
            "",
        ] {
            assert_eq!(searched_symbol(text), None, "{text}");
        }
    }
}

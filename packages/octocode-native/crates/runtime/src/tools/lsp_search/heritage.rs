//! Type hierarchy without `typeHierarchyProvider`.
//!
//! typescript-language-server and tsgo advertise no type hierarchy, so
//! `supertypes` and `subtypes` would always fail there. `subtypes` falls back
//! to `textDocument/implementation`; `supertypes` reads the declaration's
//! heritage clause (`extends` / `implements`, from the syntax facts) and asks
//! the server for each base type's definition. Both rows are labelled with the
//! source they came from, never presented as a server type hierarchy.
//!
//! When the server cannot answer `textDocument/implementation` at all (a
//! timeout on a large project, a crash, a rejected request), `subtypes`
//! reads the heritage clauses of every workspace file that spells the base
//! name instead: a syntax answer, matched by name and labelled unverified.

use super::failure::LspFailure;
use super::source::read_bounded_source;
use octocode_engine::graph::{GraphFactEdge, GraphFactsDocument};
use octocode_engine::lsp::types::{JsCodeSnippet, JsExactPosition, JsRange};
use std::collections::BTreeSet;
use std::future::Future;

/// The LSP capability each fallback needs.
pub(super) fn fallback_provider(operation: &str) -> Option<&'static str> {
    match operation {
        "subtypes" => Some("implementationProvider"),
        "supertypes" => Some("definitionProvider"),
        _ => None,
    }
}

/// One base type named by a declaration's heritage clause.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct BaseType {
    /// The base type as written (`Base`, `ns.Base`).
    pub(super) name: String,
    /// `extends` or `implements`.
    pub(super) relation: String,
    /// Zero-based position of the name's last segment in the source.
    pub(super) line: u32,
    pub(super) character: u32,
}

/// The base types of the innermost type declaration holding `anchor_line`
/// (zero-based), in source order. Empty when the line sits in no type
/// declaration or the declaration names no base.
pub(super) fn base_types(content: &str, file: &str, anchor_line: u32) -> Vec<BaseType> {
    let Some(facts) = octocode_engine::portable::extract_graph_facts(content, file) else {
        return Vec::new();
    };
    let Ok(document) = serde_json::from_str::<GraphFactsDocument>(&facts) else {
        return Vec::new();
    };
    let Some(declaration) = document
        .declarations
        .iter()
        .filter(|declaration| {
            document
                .edges
                .iter()
                .any(|edge| edge.from == declaration.id)
                && declaration.range.start.line <= anchor_line
                && anchor_line <= declaration.range.end.line
        })
        .min_by_key(|declaration| declaration.range.end.line - declaration.range.start.line)
    else {
        return Vec::new();
    };
    let lines = content.lines().collect::<Vec<_>>();
    let mut bases = document
        .edges
        .iter()
        .filter(|edge| edge.from == declaration.id)
        .filter(|edge| matches!(edge.relation.as_str(), "extends" | "implements"))
        .filter_map(|edge| base_type(edge, &lines))
        .collect::<Vec<_>>();
    bases.sort_by_key(|base| (base.line, base.character));
    bases.dedup();
    bases
}

/// Whether the zero-based `line` holds the declaration of the type `name`:
/// the only anchor whose subtypes a heritage scan can list. A member, a
/// function or a variable has no extends/implements clause naming it, so a
/// scan for it would report "no implementations" instead of "unanswered".
pub(super) fn anchors_type_declaration(content: &str, file: &str, line: u32, name: &str) -> bool {
    let Some(facts) = octocode_engine::portable::extract_graph_facts(content, file) else {
        return false;
    };
    let Ok(document) = serde_json::from_str::<GraphFactsDocument>(&facts) else {
        return false;
    };
    document.declarations.iter().any(|declaration| {
        declaration.name == name
            && declaration.selection_range.start.line == line
            && matches!(
                declaration.kind.as_str(),
                "class" | "interface" | "struct" | "trait"
            )
    })
}

fn base_type(edge: &GraphFactEdge, lines: &[&str]) -> Option<BaseType> {
    let line = edge.line.checked_sub(1)?;
    let text = lines.get(usize::try_from(line).ok()?)?;
    let leaf = edge
        .to
        .rsplit(['.', ':'])
        .next()
        .filter(|leaf| !leaf.is_empty())?;
    let character = word_offset(text, leaf)?;
    Some(BaseType {
        name: edge.to.clone(),
        relation: edge.relation.clone(),
        line,
        character,
    })
}

/// UTF-16 column of the first whole-word `word` in `text`.
fn word_offset(text: &str, word: &str) -> Option<u32> {
    let is_word = |ch: char| ch.is_alphanumeric() || ch == '_' || ch == '$';
    let mut from = 0;
    while let Some(found) = text[from..].find(word) {
        let start = from + found;
        let end = start + word.len();
        let before = text[..start].chars().next_back();
        let after = text[end..].chars().next();
        if !before.is_some_and(is_word) && !after.is_some_and(is_word) {
            return u32::try_from(text[..start].encode_utf16().count()).ok();
        }
        from = end;
    }
    None
}

/// The caller-facing note: which clauses were read.
pub(super) fn describe(bases: &[BaseType]) -> String {
    let clauses = bases
        .iter()
        .map(|base| format!("{} {}", base.relation, base.name))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "This server has no type hierarchy: supertypes are the definitions of the heritage clause ({clauses}) read from source. They are direct bases only; run supertypes on a base to climb further."
    )
}

/// The caller-facing note of a subtypes answer taken from
/// `textDocument/implementation`.
pub(super) fn describe_implementation() -> String {
    "This server has no type hierarchy: subtypes are its textDocument/implementation answer, direct and transitive subtypes together; which are direct is not marked.".to_owned()
}

/// Whether a failed `textDocument/implementation` request leaves the syntax
/// scan as a cheaper labelled answer: the server could not answer (timeout,
/// exit, rejected request), as opposed to the caller cancelling or a refused
/// path.
pub(super) fn implementation_failure_has_fallback(failure: &LspFailure) -> bool {
    matches!(
        failure.code,
        "timeout" | "serverCrashed" | "requestFailed" | "capabilityUnavailable"
    )
}

/// What the heritage scan read: the subtypes of `base` among the `files`
/// that spell it, and how many of those `unread` files could not be read.
pub(super) struct HeritageScan {
    pub(super) base: String,
    pub(super) files: usize,
    pub(super) found: Vec<JsCodeSnippet>,
    pub(super) unread: usize,
}

/// How long the server's `textDocument/implementation` answer may still
/// arrive once the syntax scan has finished: its rows are resolved, the
/// scan's are matched by name, so a server that is merely slow keeps the
/// win, but one that has not answered by then costs no further wait.
pub(super) const SERVER_GRACE_AFTER_SCAN: std::time::Duration = std::time::Duration::from_secs(5);

/// Run `primary` (the server's request) and `hedge` (its syntax-scan
/// substitute) at the same time. A primary answer wins and drops the hedge,
/// which stops its blocking work; a failure that `has_fallback` takes the
/// hedge as it stands, finished or not, so the scan's time overlaps the
/// primary's instead of following it. When the hedge finishes first and
/// `grace` names a wait for it, the primary has that long to answer before
/// `overdue` (given the wait) turns into its failure and the hedge is taken.
/// The primary's own timeout still bounds everything else.
pub(super) async fn hedged<T, E, H>(
    primary: impl Future<Output = Result<T, E>>,
    hedge: impl Future<Output = H>,
    has_fallback: impl Fn(&E) -> bool,
    grace: impl Fn(&H) -> Option<std::time::Duration>,
    overdue: impl FnOnce(std::time::Duration) -> E,
) -> Result<T, (E, Option<H>)> {
    let mut primary = std::pin::pin!(primary);
    let mut hedge = std::pin::pin!(hedge);
    let mut hedged = None;
    let mut waiting = std::pin::pin!(tokio::time::sleep(std::time::Duration::MAX));
    let mut allowed = None;
    let failure = loop {
        tokio::select! {
            biased;
            answer = &mut primary => match answer {
                Ok(answer) => return Ok(answer),
                Err(failure) => break failure,
            },
            done = &mut hedge, if hedged.is_none() => {
                if let Some(wait) = grace(&done) {
                    waiting.as_mut().reset(tokio::time::Instant::now() + wait);
                    allowed = Some(wait);
                }
                hedged = Some(done);
            }
            () = &mut waiting, if allowed.is_some() => {
                break overdue(allowed.unwrap_or_default());
            }
        }
    };
    if !has_fallback(&failure) {
        return Err((failure, None));
    }
    let hedged = match hedged {
        Some(done) => done,
        None => hedge.await,
    };
    Err((failure, Some(hedged)))
}

/// The declarations of `content` whose `extends` / `implements` clause names
/// `base` (as written, or as the last segment of a dotted name), located at
/// the declaration's name. Matched by name, not resolved to a declaration.
pub(super) fn subtype_snippets(content: &str, file: &str, base: &str) -> Vec<JsCodeSnippet> {
    let Some(facts) = octocode_engine::portable::extract_graph_facts(content, file) else {
        return Vec::new();
    };
    let Ok(document) = serde_json::from_str::<GraphFactsDocument>(&facts) else {
        return Vec::new();
    };
    let Ok(uri) = octocode_engine::lsp::uri::path_to_uri(file) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    let mut seen = BTreeSet::new();
    for edge in document
        .edges
        .iter()
        .filter(|edge| matches!(edge.relation.as_str(), "extends" | "implements"))
        .filter(|edge| edge.to.rsplit(['.', ':']).next() == Some(base))
    {
        let Some(declaration) = document
            .declarations
            .iter()
            .find(|declaration| declaration.id == edge.from)
        else {
            continue;
        };
        if !seen.insert(declaration.id.as_str()) {
            continue;
        }
        let name = &declaration.selection_range;
        found.push(JsCodeSnippet {
            uri: uri.clone(),
            range: JsRange {
                start: JsExactPosition {
                    line: name.start.line,
                    character: name.start.character,
                },
                end: JsExactPosition {
                    line: name.end.line,
                    character: name.end.character,
                },
            },
            content: declaration.name.clone(),
            symbol_kind: None,
            display_range: None,
        });
    }
    found.sort_by_key(|snippet| (snippet.range.start.line, snippet.range.start.character));
    found
}

/// The subtypes of `base` among `files` (canonical paths of the files that
/// spell it), by file path then position, and the count of files that could
/// not be read. Files are parsed in parallel; `stopped` abandons the scan.
pub(super) fn scan_subtypes(
    files: &BTreeSet<String>,
    base: &str,
    stopped: &(dyn Fn() -> bool + Sync),
) -> (Vec<JsCodeSnippet>, usize) {
    let files = files.iter().collect::<Vec<_>>();
    let workers = std::thread::available_parallelism().map_or(1, usize::from);
    let chunk = files.len().div_ceil(workers).max(1);
    let unread = std::sync::atomic::AtomicUsize::new(0);
    let unread_ref = &unread;
    let mut found = std::thread::scope(|scope| {
        let handles = files
            .chunks(chunk)
            .map(|files| {
                scope.spawn(move || {
                    let mut found = Vec::new();
                    for file in files {
                        if stopped() {
                            break;
                        }
                        match read_bounded_source(std::path::Path::new(file)) {
                            Ok(content) => found.extend(subtype_snippets(&content, file, base)),
                            Err(_) => {
                                unread_ref.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            }
                        }
                    }
                    found
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect::<Vec<_>>()
    });
    found.sort_by(|left, right| {
        (&left.uri, left.range.start.line, left.range.start.character).cmp(&(
            &right.uri,
            right.range.start.line,
            right.range.start.character,
        ))
    });
    (found, unread.into_inner())
}

/// The caller-facing note of a heritage scan that replaced a failed
/// implementation request.
pub(super) fn describe_scan(
    failure: &LspFailure,
    base: &str,
    files: usize,
    unread: usize,
    operation: &str,
) -> String {
    let unread = if unread == 0 {
        String::new()
    } else {
        format!(" {unread} of them could not be read.")
    };
    let noun = if operation == "implementation" {
        "implementations"
    } else {
        "subtypes"
    };
    format!(
        "The language server did not answer textDocument/implementation in time ({}): {noun} are the declarations whose extends/implements clause names `{base}`, read from source in the {files} files that spell it. They are direct {noun} only; run {operation} on each to descend. They are unverified: the base is matched by name, not resolved to this declaration. Retry asks the server again.{unread}",
        failure.message
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bases(content: &str, file: &str, line: u32) -> Vec<(String, String, u32, u32)> {
        base_types(content, file, line)
            .into_iter()
            .map(|b| (b.name, b.relation, b.line, b.character))
            .collect()
    }

    #[test]
    fn a_typescript_class_names_its_extends_and_implements_clauses_with_positions() {
        let source = "interface Run {}\nclass Base {}\nexport class Child extends Base implements Run {\n  go() {}\n}\n";
        let found = bases(source, "a.ts", 3);
        assert_eq!(
            found,
            vec![
                ("Base".into(), "extends".into(), 2, 27),
                ("Run".into(), "implements".into(), 2, 43),
            ]
        );
    }

    #[test]
    fn the_innermost_declaration_holding_the_line_answers() {
        let source = "class A {}\nclass B extends A {\n  m() { return 1; }\n}\n";
        assert_eq!(bases(source, "a.ts", 2).len(), 1);
        assert!(bases(source, "a.ts", 0).is_empty(), "A has no bases");
    }

    #[test]
    fn a_python_class_reads_dotted_bases_at_their_last_segment() {
        let source = "class Child(pkg.Base, Mixin):\n    pass\n";
        assert_eq!(
            bases(source, "a.py", 0),
            vec![
                ("pkg.Base".into(), "extends".into(), 0, 16),
                ("Mixin".into(), "extends".into(), 0, 22),
            ]
        );
    }

    #[test]
    fn a_whole_word_match_skips_longer_identifiers() {
        assert_eq!(word_offset("class XBase extends Base", "Base"), Some(20));
    }

    #[test]
    fn only_subtypes_and_supertypes_have_a_fallback() {
        assert_eq!(
            fallback_provider("subtypes"),
            Some("implementationProvider")
        );
        assert_eq!(fallback_provider("supertypes"), Some("definitionProvider"));
        assert_eq!(fallback_provider("callers"), None);
    }

    /// `(line, start, end, content)` of each declaration a source's heritage
    /// clauses name `base` in, zero-based.
    fn subtypes(content: &str, file: &str, base: &str) -> Vec<(u32, u32, u32, String)> {
        subtype_snippets(content, file, base)
            .into_iter()
            .map(|found| {
                (
                    found.range.start.line,
                    found.range.start.character,
                    found.range.end.character,
                    found.content,
                )
            })
            .collect()
    }

    #[test]
    fn subtypes_are_the_declarations_whose_heritage_names_the_base() {
        let source = "interface Base {}\nclass A extends Base {}\nclass B implements Other, Base {}\ninterface C extends ns.Base {}\nclass D extends Other {}\nclass Base2 extends Base {}\n";
        assert_eq!(
            subtypes(source, "/work/a.ts", "Base"),
            vec![
                (1, 6, 7, "A".into()),
                (2, 6, 7, "B".into()),
                (3, 10, 11, "C".into()),
                (5, 6, 11, "Base2".into()),
            ]
        );
        assert!(subtypes(source, "/work/a.ts", "Missing").is_empty());
    }

    #[test]
    fn only_a_type_declaration_anchors_a_subtype_scan() {
        let source = "export interface IDisposable {\n  dispose(): void;\n}\nexport class Box {\n  run(): void {}\n}\nexport function make(): void {}\n";
        let on = |line: u32, name: &str| anchors_type_declaration(source, "/work/a.ts", line, name);
        assert!(on(0, "IDisposable"), "an interface");
        assert!(on(3, "Box"), "a class");
        assert!(
            !on(1, "dispose"),
            "an interface member has no subtypes to scan"
        );
        assert!(
            !on(4, "run"),
            "a method is implemented per override, not per heritage"
        );
        assert!(!on(6, "make"), "a function");
        assert!(!on(0, "Other"), "another name on the line");
        assert!(!on(8, "Box"), "a line past the file");
    }

    #[test]
    fn a_base_spelled_outside_a_heritage_clause_names_no_subtype() {
        let source = "class Base {}\nconst x: Base = new Base();\n// class Z extends Base {}\n";
        assert!(subtypes(source, "/work/a.ts", "Base").is_empty());
    }

    /// Every no-hierarchy path says which relatives it lists: the clause
    /// reads are direct only, the implementation answer mixes both.
    #[test]
    fn every_fallback_note_says_direct_or_transitive() {
        let bases = vec![BaseType {
            name: "Base".into(),
            relation: "extends".into(),
            line: 0,
            character: 0,
        }];
        assert!(describe(&bases).contains("direct bases only"));
        let failure = LspFailure::invalid_query("x");
        assert!(describe_scan(&failure, "Base", 3, 0, "subtypes").contains("direct subtypes only"));
        let implementations = describe_scan(&failure, "Base", 3, 0, "implementation");
        assert!(
            implementations.contains("direct implementations only")
                && implementations.contains("run implementation on each"),
            "{implementations}"
        );
        let note = describe_implementation();
        assert!(
            note.contains("direct and transitive") && note.contains("not marked"),
            "{note}"
        );
    }

    /// A server that cannot answer (timeout, crash, rejected request) leaves
    /// the syntax scan the cheaper labelled answer; a cancelled request or a
    /// refused path does not.
    #[test]
    fn a_failed_implementation_request_has_the_syntax_scan_as_fallback() {
        use super::super::failure::LspFailure;
        use octocode_engine::error::{Error, ErrorKind};
        let failure = |kind| LspFailure::from_engine(&Error::with_kind(kind, "x"));
        assert!(implementation_failure_has_fallback(&failure(
            ErrorKind::Timeout
        )));
        assert!(implementation_failure_has_fallback(&failure(
            ErrorKind::ConnectionClosed
        )));
        assert!(implementation_failure_has_fallback(&failure(
            ErrorKind::Other
        )));
        assert!(!implementation_failure_has_fallback(
            &LspFailure::invalid_query("x")
        ));
    }

    /// The syntax scan runs while the server request is pending, so a failed
    /// request costs `max(request, scan)`, not their sum; an answer in time
    /// drops the scan; a failure with no fallback never waits for it.
    #[tokio::test]
    async fn the_hedge_overlaps_the_primary_and_yields_to_its_answer() {
        use std::sync::Arc;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::time::{Duration, Instant};
        let sleep = |ms| tokio::time::sleep(Duration::from_millis(ms));

        let started = Instant::now();
        let outcome = hedged(
            async {
                sleep(300).await;
                Err::<u8, _>("timeout")
            },
            async {
                sleep(250).await;
                "scan"
            },
            |_| true,
            |_| None,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Err(("timeout", Some("scan"))));
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "sequential would take 550 ms, took {:?}",
            started.elapsed()
        );

        // A hedge slower than the failure is awaited to its end.
        let outcome = hedged(
            async { Err::<u8, _>("crash") },
            async {
                sleep(50).await;
                "scan"
            },
            |_| true,
            |_| None,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Err(("crash", Some("scan"))));

        // A failure with no fallback does not wait for the hedge.
        let started = Instant::now();
        let outcome = hedged(
            async { Err::<u8, _>("cancelled") },
            async {
                sleep(2_000).await;
                "scan"
            },
            |failure| *failure != "cancelled",
            |_| None,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Err(("cancelled", None)));
        assert!(started.elapsed() < Duration::from_millis(1_000));

        // An answer drops the hedge before it finishes.
        struct Dropped(Arc<AtomicBool>);
        impl Drop for Dropped {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        let dropped = Arc::new(AtomicBool::new(false));
        let guard = Dropped(Arc::clone(&dropped));
        let outcome = hedged(
            async {
                sleep(20).await;
                Ok::<u8, &str>(7)
            },
            async move {
                let _guard = guard;
                sleep(5_000).await;
                "scan"
            },
            |_| true,
            |_| None,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Ok(7));
        assert!(dropped.load(Ordering::SeqCst), "the answer drops the scan");
    }

    /// Once the scan has finished the server has a bounded grace: a primary
    /// answering inside it wins, one still silent after it yields the scan
    /// without waiting for the primary's own timeout.
    #[tokio::test]
    async fn a_server_silent_after_the_scan_loses_only_after_its_grace() {
        use std::time::{Duration, Instant};
        let sleep = |ms| tokio::time::sleep(Duration::from_millis(ms));
        let grace = |_: &&str| Some(Duration::from_millis(200));

        let started = Instant::now();
        let outcome = hedged(
            async {
                sleep(5_000).await;
                Ok::<u8, &str>(1)
            },
            async {
                sleep(50).await;
                "scan"
            },
            |_| true,
            grace,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Err(("overdue", Some("scan"))));
        assert!(
            started.elapsed() < Duration::from_millis(1_500),
            "took {:?}",
            started.elapsed()
        );

        // An answer inside the grace wins over the finished scan.
        let outcome = hedged(
            async {
                sleep(150).await;
                Ok::<u8, &str>(9)
            },
            async {
                sleep(50).await;
                "scan"
            },
            |_| true,
            grace,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Ok(9));

        // A scan with nothing to offer grants no deadline.
        let outcome = hedged(
            async {
                sleep(300).await;
                Ok::<u8, &str>(3)
            },
            async {
                sleep(10).await;
                "empty"
            },
            |_| true,
            |_| None,
            |_| "overdue",
        )
        .await;
        assert_eq!(outcome, Ok(3));
    }
}

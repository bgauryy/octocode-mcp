pub use crate::contracts::tool_types::{AstSearchQueryMatchPattern, AstSearchQueryMatchRule};
use crate::tools::ast_rule::{
    GlobParsers, GrammarChoice, choose_grammar, compile_check, has_extension_in,
    language_extensions, present_grammars,
};
use crate::tools::empty_walk::{FileProbe, Globs, Verdict, Walk, diagnose, lift};
use crate::tools::id::ToolId;
use crate::tools::id::query_limits::ast_search::r#match as limits;
use crate::tools::num::u32_of;
use crate::tools::result::ToolError;
use crate::{
    policy::{path::PathPolicy, prune::PruneMode},
    security::ContentSecurity,
    tools::cancel::CancellationCheck,
};
use octocode_engine::structural::{
    StructuralDetailedMatch, StructuralDiagnostic, StructuralSearchFilesOptions,
};
use serde_json::{Value, json};

/// A `match` query in either of its generated forms (pattern or rule).
#[derive(Clone, Copy, Debug)]
pub enum MatchQuery<'a> {
    Pattern(&'a AstSearchQueryMatchPattern),
    Rule(&'a AstSearchQueryMatchRule),
}

/// Binds `$field` from whichever form `$query` is.
macro_rules! either_form {
    ($query:expr, $field:ident => $value:expr) => {
        match $query {
            MatchQuery::Pattern(AstSearchQueryMatchPattern { $field, .. }) => $value,
            MatchQuery::Rule(AstSearchQueryMatchRule { $field, .. }) => $value,
        }
    };
}

fn non_empty(values: &[String]) -> Option<Vec<String>> {
    (!values.is_empty()).then(|| values.to_vec())
}

/// Form-independent views in the engine's units.
impl<'a> MatchQuery<'a> {
    pub fn path(self) -> String {
        either_form!(self, path => path.to_string())
    }
    pub fn pattern(self) -> Option<String> {
        match self {
            Self::Pattern(query) => Some(query.pattern.to_string()),
            Self::Rule(_) => None,
        }
    }
    pub fn rule(self) -> Option<String> {
        match self {
            Self::Pattern(_) => None,
            // An object rule serializes as JSON, which is valid YAML for the
            // same rule.
            Self::Rule(query) => Some(match serde_json::to_value(&query.rule) {
                Ok(Value::String(text)) => text,
                Ok(mut value) => {
                    crate::tools::result::remove_nulls(&mut value);
                    value.to_string()
                }
                Err(_) => String::new(),
            }),
        }
    }
    pub fn include(self) -> Option<Vec<String>> {
        either_form!(self, include => non_empty(include).map(|globs| crate::policy::include::include_globs(&globs)))
    }
    pub fn exclude(self) -> Option<Vec<String>> {
        either_form!(self, exclude => non_empty(exclude))
    }
    pub fn default_excludes(self) -> bool {
        use crate::policy::prune::DefaultsFlag;
        either_form!(self, default_excludes => default_excludes.defaults())
    }
    pub fn include_hidden(self) -> Option<bool> {
        either_form!(self, include_hidden => *include_hidden)
    }
    pub fn include_ignored(self) -> Option<bool> {
        either_form!(self, include_ignored => *include_ignored)
    }
    pub fn reverse(self) -> Option<bool> {
        either_form!(self, reverse => *reverse)
    }
    pub fn capture_text(self) -> Option<bool> {
        either_form!(self, capture_text => *capture_text)
    }
    /// Levels below `path` (1 = its children), as the wire counts them.
    pub fn max_depth(self) -> Option<u32> {
        either_form!(self, max_depth => max_depth.map(|depth| u32::try_from(depth.get()).unwrap_or(u32::MAX)))
    }
    /// The caller's file scan cap; unset scans the whole scope within the
    /// scan time budget.
    pub fn max_files(self) -> Option<u32> {
        either_form!(self, max_files => max_files.map(|files| u32_of(files.get())))
    }
    /// Leading candidates (walk order) an earlier window evaluated.
    pub fn scan_offset(self) -> u32 {
        either_form!(self, scan_offset => scan_offset.map_or(0, |offset| u32::try_from(offset.get()).unwrap_or(u32::MAX)))
    }
    /// The caller's matches per file page; unset fills the response window.
    pub fn match_page_size(self) -> Option<u32> {
        either_form!(self, match_page_size => match_page_size.map(|size| u32_of(size.get())))
    }
    pub fn match_content_length(self) -> Option<u32> {
        either_form!(self, match_content_length => Some(u32_of(*match_content_length)))
    }
    pub fn language(self) -> Option<String> {
        either_form!(self, language => language.as_ref().map(ToString::to_string))
    }
    pub fn language_globs(self) -> Option<&'a std::collections::BTreeMap<String, Vec<String>>> {
        either_form!(self, language_globs => (!language_globs.is_empty()).then_some(language_globs))
    }
    pub fn sort(self) -> Option<String> {
        either_form!(self, sort => Some(sort.to_string()))
    }
    pub fn result_view(self) -> Option<String> {
        either_form!(self, result_view => Some(result_view.to_string()))
    }
    pub fn page(self) -> u32 {
        either_form!(self, page => u32_of(*page))
    }
    pub fn match_page(self) -> u32 {
        either_form!(self, match_page => u32_of(*match_page))
    }
    /// The caller's files per page; unset fills the response window.
    pub fn page_size(self) -> Option<u32> {
        either_form!(self, page_size => page_size.map(|size| u32_of(size.get())))
    }
    pub fn snapshot(self) -> Option<String> {
        either_form!(self, snapshot => snapshot.as_ref().map(ToString::to_string))
    }
    /// The query as a continuation copies it; an object rule keeps only the
    /// matchers the caller set.
    fn to_value(self) -> Value {
        let mut value = match self {
            Self::Pattern(query) => serde_json::to_value(query),
            Self::Rule(query) => serde_json::to_value(query),
        }
        .unwrap_or_else(|_| json!({}));
        if let Some(rule) = value.get_mut("rule") {
            crate::tools::result::remove_nulls(rule);
        }
        value
    }
}

pub fn execute_match(
    q: MatchQuery<'_>,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
) -> super::AstResult {
    let out = execute_match_inner(q, paths, security, cancel, response_window)?;
    Ok(retry_omitted_parts(
        q,
        out,
        paths,
        security,
        cancel,
        response_window,
    ))
}

/// A declaration pattern matches exactly, so `function $N($$$A) { $$$B }`
/// misses every function with a return type and Rust `fn …` every `pub`
/// item. Re-run it once as a rule over the pattern plus the variants that
/// spell those parts. A union that finds more replaces the result as
/// written, with a warning naming the variants; its continuations replay
/// that rule.
fn retry_omitted_parts(
    q: MatchQuery<'_>,
    out: Value,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
) -> Value {
    let (MatchQuery::Pattern(query), Some(pattern)) = (q, q.pattern()) else {
        return out;
    };
    if out["status"] == "error" {
        return out;
    }
    let language = out["inferredLanguage"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| q.language());
    let extensions = match language.as_deref() {
        Some(language) => language_extensions(language).unwrap_or_default(),
        None => Some(octocode_engine::text::extension_of(&q.path(), true, ""))
            .filter(|extension| !extension.is_empty())
            .into_iter()
            .collect(),
    };
    let variants = omitted_part_variants(&pattern, &extensions);
    if variants.is_empty() {
        return out;
    }
    let mut row = serde_json::to_value(query).unwrap_or_default();
    let Some(fields) = row.as_object_mut() else {
        return out;
    };
    fields.retain(|key, value| key != "pattern" && !value.is_null());
    let any = std::iter::once(&pattern)
        .chain(&variants)
        .map(|variant| json!({"pattern": variant}))
        .collect::<Vec<_>>();
    fields.insert("rule".into(), json!({"any": any.clone()}));
    let Ok(rule) = serde_json::from_value::<AstSearchQueryMatchRule>(row) else {
        return out;
    };
    let Ok(mut retried) = execute_match_inner(
        MatchQuery::Rule(&rule),
        paths,
        security,
        cancel,
        response_window,
    ) else {
        return out;
    };
    let written = out["matchCount"].as_u64().unwrap_or(0);
    if retried["matchCount"].as_u64().unwrap_or(0) <= written {
        return out;
    }
    let note = json!({
        "code":"structural.pattern.relaxed",
        "severity":"warning",
        "stage":"match",
        "message":format!(
            "{written} {} as written; {} match the relaxed rule.",
            if written == 1 { "match" } else { "matches" },
            retried["matchCount"].as_u64().unwrap_or(0)
        ),
        "rule":{"any": any},
    });
    match retried["diagnostics"].as_array_mut() {
        Some(diagnostics) => diagnostics.insert(0, note),
        None => retried["diagnostics"] = json!([note]),
    }
    retried
}

/// Variants of a declaration pattern that spell what it omitted: a return
/// type (TypeScript, Rust, Python, Go) and, for Rust items, `pub`.
fn omitted_part_variants(
    pattern: &str,
    extensions: &std::collections::BTreeSet<String>,
) -> Vec<String> {
    let has = |ext: &str| extensions.contains(ext);
    let (keyword, slot, body) = if has("ts") || has("tsx") {
        ("function", ": $_", '{')
    } else if has("rs") {
        ("fn", " -> $_", '{')
    } else if has("py") {
        ("def", " -> $_", ':')
    } else if has("go") {
        ("func", " $_", '{')
    } else {
        return Vec::new();
    };
    let returned = return_slot(pattern, keyword, slot, body);
    let first = pattern.split_whitespace().next().unwrap_or_default();
    let visible =
        (has("rs") && RUST_VISIBLE_ITEMS.contains(&first)).then(|| format!("pub {pattern}"));
    let both = returned
        .as_ref()
        .filter(|_| visible.is_some())
        .map(|returned| format!("pub {returned}"));
    [returned, visible, both].into_iter().flatten().collect()
}

/// `pattern` with `slot` after the parameter list that `body` directly
/// follows, when the declaration after `keyword` spells no return type.
fn return_slot(pattern: &str, keyword: &str, slot: &str, body: char) -> Option<String> {
    let start = pattern.match_indices(keyword).find_map(|(index, _)| {
        let before = pattern[..index].chars().next_back();
        let after = pattern[index + keyword.len()..].chars().next();
        let boundary = |ch: Option<char>| {
            ch.is_none_or(|ch| !(ch.is_alphanumeric() || ch == '_' || ch == '$'))
        };
        (boundary(before) && boundary(after)).then_some(index + keyword.len())
    })?;
    let mut depth = 0_i32;
    let mut close = None;
    for (offset, ch) in pattern[start..].char_indices() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => {
                depth -= 1;
                if depth == 0 && ch == ')' {
                    close = Some(start + offset);
                }
            }
            _ if depth == 0 && ch == body => {
                let close = close?;
                // Only whitespace between `)` and the body: no return type.
                return pattern[close + 1..start + offset]
                    .trim()
                    .is_empty()
                    .then(|| format!("{}{slot}{}", &pattern[..=close], &pattern[close + 1..]));
            }
            _ => {}
        }
    }
    None
}

/// Rust item keywords a visibility modifier (`pub`, `pub(crate)`) can precede.
const RUST_VISIBLE_ITEMS: &[&str] = &[
    "fn", "async", "unsafe", "const", "static", "struct", "enum", "union", "trait", "type", "mod",
    "extern", "use",
];

/// The validated scope of one `match` query and the grammar it runs with.
struct Scope {
    canonical: std::path::PathBuf,
    is_file: bool,
    /// An explicit parser selector; otherwise each file selects its grammar.
    language: Option<String>,
    /// The grammar observed when the discovery window holds only one.
    inferred: Option<String>,
    extensions: Option<std::collections::BTreeSet<String>>,
    /// `languageGlobs`: the parser of files whose names select none.
    parsers: GlobParsers,
}

/// One scanned file: display path, matches, diagnostics, engine status.
type ScannedFile = (
    String,
    Vec<StructuralDetailedMatch>,
    Vec<StructuralDiagnostic>,
    String,
);

/// The files a scan evaluated plus its corpus-coverage signals. A
/// single-file scan leaves the signals at their complete defaults.
#[derive(Default)]
struct Scan {
    files: Vec<ScannedFile>,
    truncated: bool,
    /// Where a time-budget cut resumes (`scanOffset`), in walk order.
    scan_resume: Option<u32>,
    diagnostics: Vec<StructuralDiagnostic>,
    /// Unsupported, unreadable and over-large files skipped.
    skips: (u32, u32, u32),
    skipped_by_prefilter: u32,
    /// Every file the scan evaluated (absolute), for the memo's stamps.
    sources: Vec<std::path::PathBuf>,
    /// Canonical digest of complete source bytes already read by this scan.
    source_digest: String,
    /// Directory and ignore-file metadata observed during discovery, not source reads.
    discovery_sources: Vec<std::path::PathBuf>,
    /// Ignore dependencies outside observable memo metadata disable reuse.
    untracked_ignore_dependencies: bool,
    /// Candidate entries the security path policy withheld from the walk.
    withheld: crate::policy::discovery::Withheld,
    /// Files the walk passed over because no grammar parses their names.
    unparsed: Unparsed,
}

/// Example paths a skipped-file warning names.
const UNPARSED_EXAMPLES: usize = 3;

/// Files a directory scan left unparsed for want of a grammar: their count
/// and the first [`UNPARSED_EXAMPLES`] display paths in path order.
#[derive(Default)]
struct Unparsed {
    count: u32,
    examples: std::collections::BTreeSet<String>,
}

impl Unparsed {
    fn record(&mut self, path: String) {
        self.count = self.count.saturating_add(1);
        self.examples.insert(path);
        if self.examples.len() > UNPARSED_EXAMPLES {
            self.examples.pop_last();
        }
    }

    /// The warning that names them and the field that parses them.
    fn notice(&self) -> Option<String> {
        let more = if self.count as usize > self.examples.len() {
            ", …"
        } else {
            ""
        };
        let names = self.examples.iter().cloned().collect::<Vec<_>>().join(", ");
        match self.count {
            0 => None,
            1 => Some(format!(
                "1 file skipped: no AST grammar for its name ({names}); set languageGlobs to parse it."
            )),
            count => Some(format!(
                "{count} files skipped: no AST grammar for their names ({names}{more}); set languageGlobs to parse them."
            )),
        }
    }
}

/// Scans kept for the continuation pages of a multi-page result.
static SCANS: super::memo::ScanMemo<Scan> = super::memo::ScanMemo::new();

/// The scan inputs a `match` snapshot does not digest; a stored scan is
/// served only to a page with the same ones.
fn scan_key(q: MatchQuery<'_>, paths: &PathPolicy) -> String {
    crate::digest::json_sha256(&json!([
        paths.identity(),
        q.default_excludes(),
        super::MAX_PARSE_SOURCE_BYTES
    ]))
}

/// Rough heap bytes of a stored scan, its memo weight.
fn scan_bytes(scan: &Scan) -> usize {
    let diagnostic =
        |d: &StructuralDiagnostic| 64 + d.message.len() + d.path.as_ref().map_or(0, String::len);
    scan.files
        .iter()
        .map(|(path, matches, diagnostics, _)| {
            96 + path.len()
                + matches
                    .iter()
                    .map(|m| {
                        128 + m.text.len()
                            + m.header.as_ref().map_or(0, String::len)
                            + m.metavars
                                .values()
                                .flatten()
                                .map(|value| 24 + value.len())
                                .sum::<usize>()
                            + m.metavar_ranges
                                .values()
                                .flatten()
                                .map(|range| 48 + range.text.len())
                                .sum::<usize>()
                    })
                    .sum::<usize>()
                + diagnostics.iter().map(diagnostic).sum::<usize>()
        })
        .sum::<usize>()
        + scan.diagnostics.iter().map(diagnostic).sum::<usize>()
        + scan.source_digest.len()
        + scan
            .sources
            .iter()
            .chain(&scan.discovery_sources)
            .map(|path| 64 + path.as_os_str().len())
            .sum::<usize>()
}

/// One file's row on the result page, with what its match page withheld.
struct Group {
    row: Value,
    /// What the file adds to a file page: its first match page.
    chars: usize,
    /// This match page starts past the file's last match.
    out_of_range: bool,
    more_matches: bool,
    truncated_captures: bool,
    /// The longest value this match page shortened, in characters.
    cut_chars: Option<usize>,
    /// Line spans of this match page's rows whose shown text was cut.
    clipped: Vec<(u64, u64)>,
}

/// How the candidate scan ended early, and where a resume starts.
#[derive(Clone, Copy)]
struct ScanCut {
    truncated: bool,
    resume: Option<u32>,
}

/// Rows per file plus per-file coverage: files that parsed, files whose
/// query failed to compile, and files cut short (execution limit,
/// unreadable, unsupported).
#[derive(Default)]
struct Grouped {
    groups: Vec<Group>,
    /// The first file that parsed (its row path).
    first_parsed: Option<String>,
    /// The first file the scan read, parsed or skipped by the prefilter.
    first_scanned: Option<String>,
    diagnostics: Vec<Value>,
    total_matches: u64,
    parsed_files: u32,
    /// Files the scan read: parsed, or skipped by the literal-anchor prefilter.
    scanned_files: u32,
    compile_error: Option<ToolError>,
    compile_failed_files: u32,
    unevaluated_files: u32,
    /// Files skipped unread: no grammar, unreadable, over the parse limit.
    skipped_files: u32,
}

/// Diagnostic codes of a file the scan skipped unread.
const SKIP_CODES: [&str; 3] = [
    "structural.language.unsupported",
    "structural.file.unreadable",
    "structural.file.tooLarge",
];

fn execute_match_inner(
    q: MatchQuery<'_>,
    paths: &PathPolicy,
    security: &ContentSecurity,
    cancel: &dyn CancellationCheck,
    response_window: Option<usize>,
) -> super::AstResult {
    cancel.check().map_err(ToolError::cancelled)?;
    let scope = resolve_scope(q, paths, cancel)?;
    let continues = q.page() > 1 || q.match_page() > 1;
    let key = scan_key(q, paths);
    let memo_eligible = memo_scope_eligible(q, &scope);
    if !memo_eligible && let Some(snapshot) = q.snapshot() {
        SCANS.evict(&snapshot);
    }
    // A continuation page reuses the scan its first page stored when nothing
    // it read changed; the snapshot below still decides whether it serves.
    let stored = q
        .snapshot()
        .filter(|_| continues && memo_eligible)
        .and_then(|snapshot| SCANS.get(&snapshot, &key))
        .filter(|scan| {
            if !scan.untracked_ignore_dependencies && memo_source_unchanged(&scope, scan) {
                true
            } else {
                if let Some(snapshot) = q.snapshot() {
                    SCANS.evict(&snapshot);
                }
                false
            }
        });
    let fresh = stored.is_none();
    let started = std::time::SystemTime::now();
    let scan = match stored {
        Some(scan) => scan,
        None => {
            let mut scan = if scope.is_file {
                scan_file(q, &scope, security)?
            } else {
                scan_directory(q, &scope, paths, cancel)?
            };
            cancel.check().map_err(ToolError::cancelled)?;
            sort_files(q, &mut scan.files);
            std::sync::Arc::new(scan)
        }
    };
    let snapshot = match_snapshot(q, &scope, &scan);
    // A page number without a snapshot asks for that page of a fresh scan;
    // only a snapshot that no longer matches is stale.
    if continues && q.snapshot().is_some_and(|given| given != snapshot) {
        if !fresh {
            // A stored scan is only a candidate: a page whose query no longer
            // matches it is answered by a fresh scan, exactly as without one.
            if let Some(stale) = q.snapshot() {
                SCANS.evict(&stale);
            }
            return execute_match_inner(q, paths, security, cancel, response_window);
        }
        if let Some(error) = interrupted_rescan(q, &scan) {
            return Err(error);
        }
        return Ok(crate::tools::result::stale_snapshot(
            crate::tools::result::restart_query(ToolId::AstSearch, &q.to_value()),
        ));
    }
    let budget = crate::tools::page_windows::page_budget(response_window, &q.to_value());
    let grouped = group_files(q, &scan.files, budget);
    if !scope.is_file && scope.language.is_none() && !scan.truncated && q.scan_offset() == 0 {
        // Validate even files the literal prefilter left unparsed. Only an
        // initial whole-scope scan can reject the query for the selected set.
        let extensions = scan
            .sources
            .iter()
            .filter_map(|path| match scope.parsers.extension(path) {
                Some(extension) => language_extensions(extension),
                None => {
                    crate::tools::ast_rule::file_grammar(path).map(|(_, extensions)| extensions)
                }
            })
            .flatten()
            .collect::<std::collections::BTreeSet<_>>();
        if !extensions.is_empty() {
            compile_check(&extensions, q.pattern().as_deref(), q.rule().as_deref())
                .map_err(|error| ToolError::new(error.code, error.message))?;
        }
    }
    if grouped.total_matches == 0
        && grouped.parsed_files == 0
        && grouped.compile_failed_files > 0
        && !scan.truncated
        && q.scan_offset() == 0
        && let Some(error) = grouped.compile_error
    {
        // Only a whole-scope scan proves there is no compatible candidate.
        // A capped incompatible window must retain coverage and scan onward.
        return Err(error);
    }
    let empty_scope = if scope.is_file || grouped.total_matches > 0 {
        EmptyScope::default()
    } else if grouped.parsed_files == 0 && q.language().is_some() {
        EmptyScope::of(q, &scope, paths, cancel)
    } else if grouped.parsed_files > 0 {
        // The files it did parse hold no match; files of the grammar behind
        // skipped paths are still a reason, beside the pattern's shape.
        EmptyScope::beside_parsed(q, &scope, paths, cancel)
    } else {
        EmptyScope::default()
    };
    let out = render_match_page(q, &scope, &scan, grouped, &snapshot, empty_scope, budget);
    if fresh
        && !scan.untracked_ignore_dependencies
        && memo_scope_eligible(q, &scope)
        && out["next"]
            .as_object()
            .is_some_and(|next| next.contains_key("nextPage") || next.contains_key("nextMatchPage"))
    {
        let watched = scan
            .sources
            .iter()
            .chain(&scan.discovery_sources)
            .cloned()
            .collect::<Vec<_>>();
        SCANS.put(
            (snapshot, key),
            &scope.canonical,
            &watched,
            started,
            std::sync::Arc::clone(&scan),
            scan_bytes(&scan),
        );
    }
    Ok(out)
}

/// Validate the selector and query without narrowing an inferred directory
/// scan to the grammars visible before its file limit.
fn resolve_scope(
    q: MatchQuery<'_>,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<Scope, ToolError> {
    let requested = q
        .language()
        .as_deref()
        .map(|language| {
            language_extensions(language).ok_or_else(|| {
                ToolError::new(
                    "languageUnsupported",
                    crate::tools::ast_rule::unsupported_language_message(language),
                )
            })
        })
        .transpose()?;
    let p = paths.validate(q.path()).map_err(super::policy_error)?;
    let meta =
        std::fs::metadata(&p.canonical).map_err(|error| super::io_error(&q.path(), error))?;
    if meta.is_file() && q.language_globs().is_some() {
        return Err(ToolError::new(
            "languageDirectoryRequired",
            "languageGlobs is for directory matches. Use language for a single file.",
        ));
    }
    let parsers = GlobParsers::compile(&p.canonical, q.language_globs())
        .map_err(|error| ToolError::graph_scan(&error, cancel))?;
    let extensions = requested.or_else(|| meta.is_dir().then(structural_extensions));
    // Validate against grammar capabilities, not the capped discovery prefix.
    // The literal prefilter may otherwise hide even a globally invalid query.
    if meta.is_dir()
        && let Some(extensions) = &extensions
    {
        compile_check(extensions, q.pattern().as_deref(), q.rule().as_deref())
            .map_err(|error| ToolError::new(error.code, error.message))?;
    }
    let inferred = if meta.is_dir() && q.language().is_none() {
        match directory_choice(q, &p.canonical, &parsers, paths, cancel)? {
            GrammarChoice::One(language) => Some(language),
            GrammarChoice::Several(_) | GrammarChoice::Invalid(_) => None,
            GrammarChoice::Absent => {
                return Err(ToolError::new(
                    "languageRequired",
                    "No source file of a supported structural grammar was found under path; set language.",
                ));
            }
        }
    } else {
        None
    };
    let language = q.language();
    Ok(Scope {
        canonical: p.canonical,
        is_file: meta.is_file(),
        language,
        inferred,
        extensions,
        parsers,
    })
}

/// Every extension a structural grammar parses.
fn structural_extensions() -> std::collections::BTreeSet<String> {
    octocode_engine::portable::grammar_capabilities()
        .iter()
        .filter(|grammar| grammar.structural_search)
        .flat_map(|grammar| grammar.extensions.iter().cloned())
        .collect()
}

fn scan_file(
    q: MatchQuery<'_>,
    scope: &Scope,
    security: &ContentSecurity,
) -> Result<Scan, ToolError> {
    let canonical = &scope.canonical;
    super::validate_file_language(canonical, scope.language.as_deref())?;
    let Some(bytes) = super::read_parse_source(canonical)? else {
        let mut error = ToolError::new(
            "fileTooLarge",
            "Source exceeds the native parser byte limit.",
        );
        if let Some(lead) = q
            .pattern()
            .as_deref()
            .and_then(super::pattern_literal)
            .and_then(|literal| super::text_search(&canonical.to_string_lossy(), literal))
        {
            error.next = Some(Box::new(serde_json::json!({ "findText": lead })));
        }
        return Err(error);
    };
    // Parse the file as the directory scan does: raw. Output strings are
    // redacted by the response stage.
    let source = security
        .decode_source_bytes(&bytes, super::MAX_PARSE_SOURCE_BYTES)
        .map_err(super::policy_error)?;
    let source_path = canonical.to_string_lossy();
    let mut r = octocode_engine::portable::structural_search_detailed(
        &source,
        &source_path,
        super::parser_override(canonical, scope.language.as_deref()).as_deref(),
        q.pattern().as_deref(),
        q.rule().as_deref(),
    )
    .map_err(|error| tree_repair(super::native_error(error), q, scope))?;
    if let Some(diagnostic) = error_diagnostic(&r.diagnostics) {
        let error = diagnostic_error(diagnostic);
        // A rule that does not parse as a rule names its bad key; no syntax
        // tree shows a rule's keys.
        return Err(
            if diagnostic.code == octocode_engine::structural::RULE_INVALID {
                error
            } else {
                tree_repair(error, q, scope)
            },
        );
    }
    if let Some(note) = super::cpp_header_note(canonical, q.language().as_deref(), &source) {
        r.diagnostics.push(StructuralDiagnostic {
            code: super::CPP_HEADER_NOTE.to_owned(),
            severity: "warning".to_owned(),
            stage: "parse".to_owned(),
            message: note,
            path: Some(source_path.into_owned()),
            recovery: None,
        });
    }
    Ok(Scan {
        files: vec![(
            super::display_name(canonical),
            r.matches,
            r.diagnostics,
            r.status,
        )],
        sources: vec![canonical.clone()],
        source_digest: octocode_engine::digest::sha256(&bytes),
        ..Scan::default()
    })
}

/// A query that does not compile against one file leads to that file's
/// syntax tree, where the node shapes a pattern or rule names are read.
fn tree_repair(mut error: ToolError, q: MatchQuery<'_>, scope: &Scope) -> ToolError {
    if error.code == crate::tools::ast_rule::INVALID_PATTERN && error.next.is_none() {
        error.next = Some(Box::new(
            json!({ "viewTree": tree_lead(q, scope, &scope.canonical) }),
        ));
    }
    error
}

/// The syntaxTree read of `file` (its grammar pinned when one was named
/// for a single file).
fn tree_lead(q: MatchQuery<'_>, scope: &Scope, file: &std::path::Path) -> Value {
    let mut tree = json!({"operation":"syntaxTree","path":file.to_string_lossy()});
    if scope.is_file
        && let Some(language) = q.language()
    {
        tree["language"] = json!(language);
    }
    crate::tools::result::Continuation::new(ToolId::AstSearch, tree)
        .confidence("medium")
        .build()
}

fn scan_directory(
    q: MatchQuery<'_>,
    scope: &Scope,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<Scan, ToolError> {
    let extensions = scope.extensions.as_ref();
    // A file parses by its own extension or by the rule that names its parser.
    let parses = |path: &std::path::Path| {
        extensions.is_none_or(|extensions| has_extension_in(path, extensions))
            || scope.parsers.extension(path).is_some()
    };
    let grammars = structural_extensions();
    let unparsed = std::sync::Mutex::new(Unparsed::default());
    let observed = std::sync::Mutex::new(std::collections::BTreeSet::new());
    let untracked_ignore_dependencies = std::sync::atomic::AtomicBool::new(false);
    let withheld = std::sync::Mutex::new(crate::policy::discovery::Withheld::default());
    let discovery = paths.discovery_walk();
    let r = octocode_engine::structural::search_files(
        StructuralSearchFilesOptions {
            path: scope.canonical.to_string_lossy().into_owned(),
            pattern: q.pattern(),
            rule: q.rule(),
            include: q.include(),
            exclude: q.exclude(),
            exclude_dir: Some(
                PruneMode::SyntaxVisible.directories_before_policy(q.default_excludes()),
            ),
            ignore: octocode_engine::search::walk::IgnorePolicy::new(
                q.include_ignored(),
                q.include_hidden(),
            ),
            max_depth: q.max_depth(),
            max_files: q.max_files(),
            skip_files: Some(q.scan_offset()),
            max_file_bytes: u32::try_from(super::MAX_PARSE_SOURCE_BYTES).ok(),
        },
        &|path| {
            let allowed = discovery.permits(path);
            // Only a directory or a file of the scanned grammar could have
            // matched, so only those leave absence unproven.
            // A dot entry out of view (no `hidden`) is neither walked nor
            // disclosed, as structureSearch tree does.
            let is_dir = path.is_dir();
            if allowed && is_dir {
                let mut watched = observed.lock().unwrap_or_else(|error| error.into_inner());
                watched.insert(path.to_path_buf());
                if q.include_ignored() != Some(true) {
                    if repository_marker_present(path) {
                        untracked_ignore_dependencies
                            .store(true, std::sync::atomic::Ordering::Relaxed);
                    }
                    for name in [".gitignore", ".ignore"] {
                        let ignore = path.join(name);
                        match std::fs::symlink_metadata(&ignore) {
                            Ok(metadata) if metadata.is_file() && discovery.permits(&ignore) => {
                                watched.insert(ignore);
                            }
                            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                            _ => untracked_ignore_dependencies
                                .store(true, std::sync::atomic::Ordering::Relaxed),
                        }
                    }
                }
            }
            if !allowed
                && (q.include_hidden() == Some(true) || !super::is_dot_entry(path))
                && (is_dir || parses(path))
            {
                withheld
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .record(path, is_dir);
            }
            let unparsed_file = !parses(path) && path.is_file();
            // A file no grammar parses is disclosed, not silently dropped; one
            // only `language` leaves out has a grammar and is the caller's choice.
            if allowed && unparsed_file && !has_extension_in(path, &grammars) {
                unparsed
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .record(match_display_path(
                        &scope.canonical,
                        &path.to_string_lossy(),
                    ));
            }
            // Grammar filtering is not an explicit include override: ignored
            // source files remain ignored unless the caller overrides them.
            allowed && !unparsed_file
        },
        &|path| {
            if let Some(extension) = scope.parsers.extension(path) {
                extension.to_owned()
            } else if super::cpp_header_override(path, scope.language.as_deref()) {
                "cpp".to_owned()
            } else {
                octocode_engine::text::extension_of(&path.to_string_lossy(), true, "")
            }
        },
        &|| cancel.check().is_err(),
    )
    .map_err(super::native_error)?;
    if let Some(diagnostic) = error_diagnostic(&r.diagnostics) {
        return Err(diagnostic_error(diagnostic));
    }
    let sources = r
        .files
        .iter()
        .map(|f| std::path::PathBuf::from(&f.path))
        .collect();
    // Preserve source identity before the row projection drops internal metadata.
    let source_digest = directory_source_digest(
        r.files
            .iter()
            .map(|file| (file.path.as_str(), file.source_sha256.as_deref())),
    );
    // Preserve the scan-level coverage signals the group projection drops.
    Ok(Scan {
        sources,
        source_digest,
        untracked_ignore_dependencies: untracked_ignore_dependencies.into_inner(),
        discovery_sources: observed
            .into_inner()
            .unwrap_or_else(|error| error.into_inner())
            .into_iter()
            .collect(),
        files: r
            .files
            .into_iter()
            .map(|f| {
                (
                    match_display_path(&scope.canonical, &f.path),
                    f.matches,
                    f.diagnostics,
                    f.status,
                )
            })
            .collect(),
        truncated: r.scan_truncated,
        scan_resume: r.scan_resume,
        diagnostics: r.diagnostics,
        skips: (r.skipped_unsupported, r.skipped_unreadable, r.skipped_large),
        skipped_by_prefilter: r.skipped_by_pre_filter,
        withheld: withheld
            .into_inner()
            .unwrap_or_else(|error| error.into_inner()),
        unparsed: unparsed
            .into_inner()
            .unwrap_or_else(|error| error.into_inner()),
    })
}

fn directory_source_digest<'a>(files: impl Iterator<Item = (&'a str, Option<&'a str>)>) -> String {
    let identities = files.collect::<std::collections::BTreeMap<_, _>>();
    crate::digest::json_sha256(&json!(identities))
}

/// External ignore dependencies are not captured by the walked scope's stamps.
/// Keep their selection fresh by rescanning instead of caching Git/global rules.
fn memo_scope_eligible(q: MatchQuery<'_>, scope: &Scope) -> bool {
    if scope.is_file || q.include_ignored() == Some(true) {
        return true;
    }
    scope.canonical.ancestors().enumerate().all(|(depth, dir)| {
        !repository_marker_present(dir)
            && (depth == 0
                || [".ignore", ".gitignore"]
                    .iter()
                    .all(|name| !memo_dependency_present(&dir.join(name))))
    })
}

fn repository_marker_present(dir: &std::path::Path) -> bool {
    [".git", ".jj"]
        .iter()
        .any(|name| memo_dependency_present(&dir.join(name)))
}

fn memo_dependency_present(path: &std::path::Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        // An unreadable dependency cannot establish that reuse is safe.
        _ => true,
    }
}

#[cfg(unix)]
fn memo_source_unchanged(_: &Scope, _: &Scan) -> bool {
    // StampSet already checked change time and inode as well as size and mtime.
    true
}

#[cfg(not(unix))]
fn memo_source_unchanged(scope: &Scope, scan: &Scan) -> bool {
    // Without Unix change time, restored mtime cannot prove source identity.
    // Reuse parsing only after bounded reads prove the saved source digest.
    let digests = scan
        .sources
        .iter()
        .map(|path| {
            let digest = super::read_parse_source(path)
                .ok()
                .flatten()
                .map(|bytes| octocode_engine::digest::sha256(&bytes));
            (path.to_string_lossy().into_owned(), digest)
        })
        .collect::<Vec<_>>();
    if scope.is_file {
        digests.first().and_then(|(_, digest)| digest.as_deref())
            == Some(scan.source_digest.as_str())
    } else {
        directory_source_digest(
            digests
                .iter()
                .map(|(path, digest)| (path.as_str(), digest.as_deref())),
        ) == scan.source_digest
    }
}

fn sort_files(q: MatchQuery<'_>, files: &mut [ScannedFile]) {
    files.sort_by(|a, b| {
        let ordering = if q.sort().as_deref() == Some("matchCount") {
            b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0))
        } else {
            a.0.cmp(&b.0)
        };
        if q.reverse().unwrap_or(false) {
            ordering.reverse()
        } else {
            ordering
        }
    });
}

/// A continuation page whose fresh rescan stopped at a parse or match
/// deadline differs from its first page because the scan was cut, not
/// because the source changed: a retryable `timeout` with the same page as
/// `next.retry`, never a `staleSnapshot` that discards the pages read.
fn interrupted_rescan(q: MatchQuery<'_>, scan: &Scan) -> Option<ToolError> {
    let interrupted = scan.files.iter().any(|(_, _, diagnostics, _)| {
        diagnostics.iter().any(|diagnostic| {
            matches!(
                diagnostic.code.as_str(),
                "structural.match.deadline" | "structural.parse.interrupted"
            )
        })
    });
    if !interrupted {
        return None;
    }
    let mut error = ToolError::new(
        "timeout",
        "The rescan for this page stopped at the structural match deadline, so it cannot be checked against the earlier pages; the source is unchanged.",
    );
    error.next = Some(Box::new(json!({
        "retry": crate::tools::result::Continuation::new(ToolId::AstSearch, q.to_value())
            .confidence("exact")
            .build()
    })));
    Some(error)
}

/// The match-row shape a snapshot was cut under; bumped by every row rename.
const MATCH_ROWS_VERSION: u32 = 4;

/// Fingerprint over the query shape, ordered result set and scanned source bytes.
/// Continuation cursors (page>1 or matchPage>1) that
/// carry a stale snapshot are rejected with `staleSnapshot`. Fields the
/// continuation normalizes to a default are digested by their effective
/// value so a fresh page matches.
fn match_snapshot(q: MatchQuery<'_>, scope: &Scope, scan: &Scan) -> String {
    let ordered = scan
        .files
        .iter()
        .map(|f| (f.0.clone(), f.1.len()))
        .collect::<Vec<_>>();
    crate::digest::json_sha256(&json!([
        // Row shape version (v4: `matchCount`, object rows, 1-based columns); an older cursor
        // restarts instead of mixing shapes across pages.
        MATCH_ROWS_VERSION,
        scope.canonical.to_string_lossy(),
        q.pattern(),
        q.rule(),
        q.include(),
        q.exclude(),
        q.include_hidden(),
        q.include_ignored(),
        q.max_depth(),
        scope.language,
        q.language_globs(),
        q.reverse(),
        // Always present: validation stamps the contract defaults.
        q.sort().as_deref().unwrap_or_default(),
        q.result_view().as_deref().unwrap_or_default(),
        q.max_files(),
        q.scan_offset(),
        &scan.source_digest,
        ordered
    ]))
}

fn group_files(q: MatchQuery<'_>, files: &[ScannedFile], budget: usize) -> Grouped {
    let mut grouped = Grouped::default();
    let file_list = matches!(q.result_view().as_deref(), Some("files" | "countMatches"));
    let content_length = q
        .match_content_length()
        .map_or(limits::MATCH_CONTENT_LENGTH_DEFAULT, |length| {
            length as usize
        })
        .clamp(1, limits::MATCH_CONTENT_LENGTH_MAXIMUM);
    for (path, matches, diagnostics, status) in files {
        match status.as_str() {
            "ok" => {
                grouped.parsed_files += 1;
                grouped.scanned_files += 1;
                grouped.first_parsed.get_or_insert_with(|| path.clone());
                grouped.first_scanned.get_or_insert_with(|| path.clone());
            }
            "skippedByPreFilter" => {
                grouped.scanned_files += 1;
                grouped.first_scanned.get_or_insert_with(|| path.clone());
            }
            _ => {
                if let Some(diagnostic) = diagnostics.iter().find(|diagnostic| {
                    matches!(
                        diagnostic.code.as_str(),
                        "structural.query.compileFailed"
                            | octocode_engine::structural::RULE_INVALID
                    )
                }) {
                    grouped.compile_failed_files += 1;
                    grouped.compile_error.get_or_insert_with(|| {
                        ToolError::new(
                            crate::tools::ast_rule::INVALID_PATTERN,
                            crate::tools::ast_rule::untagged(&diagnostic.message),
                        )
                    });
                } else if diagnostics
                    .iter()
                    .any(|diagnostic| SKIP_CODES.contains(&diagnostic.code.as_str()))
                {
                    // The scan counts it as a skip (`filesSkipped`).
                    grouped.skipped_files += 1;
                } else {
                    grouped.unevaluated_files += 1;
                }
            }
        }
        let rows = matches
            .iter()
            .map(|value| match_value(value, q.capture_text().unwrap_or(false), content_length))
            .collect::<Vec<_>>();
        if !rows.is_empty() {
            grouped.total_matches += rows.len() as u64;
            grouped.groups.push(if file_list {
                listed_file(q, path.clone(), rows.len())
            } else {
                match_group(q, path.clone(), rows, budget)
            });
        }
        if status != "ok" || !diagnostics.is_empty() {
            // A literal prefilter can skip thousands of files. Preserve the
            // coverage fact once instead of one identical diagnostic for
            // every skipped path.
            grouped.diagnostics.extend(
                diagnostics
                    .iter()
                    .filter(|diagnostic| diagnostic.code != "structural.prefilter.skipped")
                    .map(diag),
            );
        }
    }
    grouped
}

/// A `files`/`countMatches` view row: the file, with its count when asked.
fn listed_file(q: MatchQuery<'_>, path: String, total: usize) -> Group {
    let row = if q.result_view().as_deref() == Some("countMatches") {
        json!({"path":path,"matchCount":total})
    } else {
        json!({"path":path})
    };
    Group {
        chars: crate::tools::stream_page::json_chars(&row) + 1,
        row,
        out_of_range: false,
        more_matches: false,
        truncated_captures: false,
        cut_chars: None,
        clipped: vec![],
    }
}

/// One file's match page, with per-file pagination when it is a subset.
fn match_group(q: MatchQuery<'_>, path: String, rows: Vec<MatchRow>, budget: usize) -> Group {
    let total = rows.len();
    let sizes = rows
        .iter()
        .map(|row| crate::tools::stream_page::json_chars(&row.value) + 1)
        .collect::<Vec<_>>();
    let paging = crate::tools::page_windows::Paging::of(
        q.match_page_size()
            .map(|size| (size as usize).clamp(1, limits::MATCH_PAGE_SIZE_MAXIMUM)),
        budget,
    );
    let windows = paging.windows(&sizes);
    let match_page = q.match_page().max(1) as usize;
    let out_of_range = match_page > windows.len();
    let more_matches = match_page < windows.len();
    let window = crate::tools::page_windows::nth_page(&windows, match_page)
        .cloned()
        .unwrap_or(total..total);
    // The file's place on a file page is its first match page, whichever
    // match page is asked for, so the file pages never move.
    let first_chars = windows.first().map_or(0, |first| {
        sizes[first.clone()].iter().sum::<usize>() + path.len() + 32
    });
    let page_rows = &rows[window];
    // Rows whose text was cut to a header or that hide capture text:
    // `captureText:true` (next.expandCaptures) returns them whole.
    let truncated_captures = page_rows.iter().any(|row| row.withheld);
    let cut_chars = page_rows.iter().filter_map(|row| row.cut).max();
    let clipped = page_rows
        .iter()
        .filter(|row| row.shown_cut)
        .map(|row| row.lines)
        .collect();
    let selected = page_rows
        .iter()
        .map(|row| row.value.clone())
        .collect::<Vec<_>>();
    let mut row = json!({"path":path,"matches":selected});
    // A file whose matches span match pages states its page facts (the
    // page stage counts the matches left from them); `next.nextMatchPage`
    // is the continuation, so the facts do not restate it.
    if windows.len() > 1 || out_of_range {
        let facts = match q.match_page_size() {
            Some(size) => crate::response::pages::PageFacts::counted(
                match_page,
                (size as usize).clamp(1, limits::MATCH_PAGE_SIZE_MAXIMUM),
                total,
            ),
            None => crate::response::pages::PageFacts::sized(
                match_page,
                windows.len(),
                total,
                more_matches,
            ),
        };
        row["pagination"] = facts.out_of_range(out_of_range).to_value();
    }
    Group {
        chars: first_chars,
        row,
        out_of_range,
        more_matches,
        truncated_captures,
        cut_chars,
        clipped,
    }
}

/// Scan-level coverage diagnostics the per-file groups do not carry.
fn scan_diagnostics(q: MatchQuery<'_>, scope: &Scope, scan: &Scan) -> Vec<Value> {
    let mut diagnostics = vec![];
    if scan.skipped_by_prefilter > 0 {
        diagnostics.push(json!({
            "code":"structural.prefilter.skipped",
            "severity":"info",
            "stage":"scan",
            "message":format!("Literal-anchor prefilter skipped AST parsing for {} file(s) that cannot contain the anchor.", scan.skipped_by_prefilter),
        }));
    }
    diagnostics.extend(scan.diagnostics.iter().map(diag));
    if scan.truncated {
        let message = match q.max_files() {
            Some(limit) => format!(
                "Candidate scan hit the maxFiles limit ({limit}); files beyond it were not evaluated."
            ),
            None => super::scan_window::ceiling_note(scan.scan_resume).map_or_else(
                || {
                    "Candidate scan stopped at its time budget; files beyond it were not evaluated."
                        .to_owned()
                },
                |note| {
                    format!("Candidate scan stopped; files beyond it were not evaluated. {note}")
                },
            ),
        };
        diagnostics.push(json!({
            "code":"structural.scan.truncated",
            "severity":"warning",
            "stage":"scan",
            "message":message,
            "path":scope.canonical.to_string_lossy()
        }));
    }
    diagnostics
}

fn render_match_page(
    q: MatchQuery<'_>,
    scope: &Scope,
    scan: &Scan,
    grouped: Grouped,
    snapshot: &str,
    empty_scope: EmptyScope,
    budget: usize,
) -> Value {
    let truncated = scan.truncated;
    let diagnostics = merge_diagnostics(grouped.diagnostics, scan_diagnostics(q, scope, scan));
    let groups = grouped.groups;
    let page = file_page(q, &groups, budget);
    let page_groups = &groups[page.window.clone()];
    let more = page.more;
    let mut out =
        json!({"searchEngine":"structural","snapshot":snapshot,"matchCount":grouped.total_matches});
    if let Some(inferred) = &scope.inferred {
        out["inferredLanguage"] = json!(inferred);
    }
    if !groups.is_empty() {
        out["files"] = Value::Array(listed_rows(page_groups));
        out["pagination"] = page.pagination;
    }
    if !diagnostics.is_empty() {
        out["diagnostics"] = json!(diagnostics)
    }
    // Withheld entries are disclosed once, like localSearch's walk.
    let withheld = scan.withheld.notice();
    crate::tools::paging::push_warnings(&mut out, withheld.clone());
    crate::tools::paging::push_warnings(&mut out, scan.unparsed.notice());
    if groups.is_empty() {
        explain_empty(
            q,
            scope,
            &mut out,
            EmptyFacts {
                parsed: grouped.parsed_files,
                scanned: grouped.scanned_files,
                diagnosed: !diagnostics.is_empty(),
            },
            empty_scope,
        );
    }
    let skips = scan.skips;
    let skipped = skips.0 + skips.1 + skips.2 > 0 || grouped.skipped_files > 0;
    let incomplete =
        truncated || skipped || grouped.compile_failed_files > 0 || grouped.unevaluated_files > 0;
    let more_matches = page_groups.iter().any(|group| group.more_matches);
    // Each coverage cut names itself, so a partial final page (no `next`)
    // still says why it is partial.
    for (cut, reason) in [
        (truncated, super::scan_window::cut_reason(q.max_files())),
        (skipped, "filesSkipped"),
        (grouped.compile_failed_files > 0, "compileFailed"),
        (grouped.unevaluated_files > 0, "filesUnevaluated"),
        // A file's later match pages (`next.nextMatchPage`): the row's own
        // file pagination does not state them.
        (more_matches, "matchPages"),
    ] {
        if cut {
            crate::tools::paging::mark_partial(&mut out, reason, &[]);
        }
    }
    let empty = groups.is_empty() && !more && !incomplete;
    if empty {
        out["status"] = json!("empty");
    }
    // Every file and match is listed and the scan saw its whole scope: the
    // row's expansions and reads are drill-downs, not unread rest.
    if !groups.is_empty() && !more && !incomplete && withheld.is_none() && !more_matches {
        out["complete"] = json!(true);
    }
    attach_match_continuations(
        q,
        scope,
        &mut out,
        page_groups,
        ScanCut {
            truncated,
            resume: scan.scan_resume,
        },
        more,
        snapshot,
    );
    // `complete` tells a reader the row's pages are drill-downs; a row with
    // no page needs no such note.
    let has_page = out["next"].as_object().is_some_and(|next| {
        next.keys().any(|name| {
            crate::tools::id::channel(ToolId::AstSearch, name) == crate::tools::id::Channel::Page
        })
    });
    if !has_page && let Some(fields) = out.as_object_mut() {
        fields.shift_remove("complete");
    }
    // An empty match leads to the syntax tree of a parsed file (else of a
    // file the anchor prefilter read), where the pattern's node shape can be
    // compared with the source.
    if empty
        && let Some(file) = grouped
            .first_parsed
            .or(grouped.first_scanned)
            .and_then(|path| row_file(scope, &json!({"path": path})))
    {
        out["next"]["viewTree"] = tree_lead(q, scope, &file);
    }
    out
}

/// The files' diagnostics plus the scan's: the scan repeats the diagnostics
/// of the files it cut short, and each file keeps one.
fn merge_diagnostics(mut diagnostics: Vec<Value>, scan: Vec<Value>) -> Vec<Value> {
    for diagnostic in scan {
        if !diagnostics.iter().any(|known| {
            known["code"] == diagnostic["code"]
                && known["path"] == diagnostic["path"]
                && known["message"] == diagnostic["message"]
        }) {
            diagnostics.push(diagnostic);
        }
    }
    diagnostics
}

/// The file page a query asks for.
struct FilePage {
    /// Its groups, as a range of every file's groups.
    window: std::ops::Range<usize>,
    /// Files are left after it.
    more: bool,
    /// Its pagination block.
    pagination: Value,
}

/// Cuts `groups` into pages (by `pageSize`, else by the response window)
/// and picks page `q.page()`; a page past the end is empty.
fn file_page(q: MatchQuery<'_>, groups: &[Group], budget: usize) -> FilePage {
    use crate::response::pages::PageFacts;
    use crate::tools::page_windows::Paging;
    let paging = Paging::of(
        q.page_size()
            .map(|size| (size as usize).clamp(1, limits::PAGE_SIZE_MAXIMUM)),
        budget,
    );
    let page = q.page().max(1) as usize;
    let sizes = groups.iter().map(|group| group.chars).collect::<Vec<_>>();
    let windows = paging.windows(&sizes);
    let window = crate::tools::page_windows::nth_page(&windows, page)
        .cloned()
        .unwrap_or(groups.len()..groups.len());
    let more = page < windows.len();
    let facts = match paging {
        Paging::Count(size) => PageFacts::counted(page, size, groups.len()),
        Paging::Chars(_) => PageFacts::sized(page, windows.len(), groups.len(), more),
    };
    FilePage {
        window,
        more,
        pagination: facts.out_of_range(page > windows.len()).to_value(),
    }
}

/// The file rows of a page. A later match page lists only the files it
/// still has matches for: a file whose matches ended on an earlier match
/// page adds no row (unless no file has any left).
fn listed_rows(page_groups: &[Group]) -> Vec<Value> {
    let listed = page_groups
        .iter()
        .filter(|group| !group.out_of_range)
        .collect::<Vec<_>>();
    let rows = if listed.is_empty() {
        page_groups.iter().collect()
    } else {
        listed
    };
    rows.into_iter().map(|group| group.row.clone()).collect()
}

/// What an empty match page read: the files that parsed and the files read
/// (parsed, or skipped by the anchor prefilter), and whether any diagnostic
/// already explains it.
struct EmptyFacts {
    parsed: u32,
    scanned: u32,
    diagnosed: bool,
}

/// The hints and leads of a page without files: no file of the requested
/// grammar parsed (the pattern is not the cause), or the files read hold no
/// match.
fn explain_empty(
    q: MatchQuery<'_>,
    scope: &Scope,
    out: &mut Value,
    facts: EmptyFacts,
    empty_scope: EmptyScope,
) {
    if facts.parsed == 0 && !facts.diagnosed {
        let language = q
            .language()
            .map_or_else(String::new, |language| format!(" {language}"));
        let mut hint = format!("No{language} file under this path was parsed.");
        if let Some(skipped) = empty_scope.skipped {
            let subject = match language.trim_start() {
                "" => "Files".to_owned(),
                language => format!("{language} files"),
            };
            hint.push_str(&format!(
                " {subject} were skipped as {} ({}); the lead includes them.",
                skipped.labels, skipped.because
            ));
            out["next"]["includeSkipped"] = skipped.lead;
        }
        out["hints"] = json!([hint]);
        // The grammars the scope does hold, each a query that runs.
        if let Some(repair) = empty_scope.repair {
            out["next"]["repair"] = repair;
        }
    } else if facts.scanned > 0 {
        // What the empty answer covered: the files read, in which grammar.
        let language = scope.language.clone().or_else(|| {
            crate::tools::ast_rule::file_grammar(&scope.canonical).map(|(grammar, _)| grammar)
        });
        out["filesScanned"] = json!(facts.scanned);
        let mut hints = vec![crate::tools::ast_rule::empty_match_hint(
            facts.scanned,
            language.as_deref(),
        )];
        if let Some(skipped) = empty_scope.skipped {
            let subject = language.as_deref().map_or_else(
                || "Files".to_owned(),
                |language| format!("{language} files"),
            );
            hints.push(format!(
                "{subject} were skipped as {} ({}); the lead includes them.",
                skipped.labels, skipped.because
            ));
            out["next"]["includeSkipped"] = skipped.lead;
        }
        out["hints"] = json!(hints);
    }
}

/// `next` pages, the scan and value expansions, and the read of the top
/// file's hits.
fn attach_match_continuations(
    q: MatchQuery<'_>,
    scope: &Scope,
    out: &mut Value,
    page_groups: &[Group],
    cut: ScanCut,
    more: bool,
    snapshot: &str,
) {
    let truncated = cut.truncated;
    let page = q.page().max(1) as usize;
    let match_page = q.match_page().max(1) as usize;
    let has_more_matches = page_groups.iter().any(|group| group.more_matches);
    let has_truncated_captures = page_groups.iter().any(|group| group.truncated_captures);
    let cut_chars = page_groups.iter().filter_map(|group| group.cut_chars).max();
    let max_content_length = limits::MATCH_CONTENT_LENGTH_MAXIMUM;
    let content_length = q
        .match_content_length()
        .map_or(limits::MATCH_CONTENT_LENGTH_DEFAULT, |length| {
            length as usize
        })
        .clamp(1, limits::MATCH_CONTENT_LENGTH_MAXIMUM);
    // The scan continues after the files this window evaluated
    // (`scanOffset`), so the lead is offered once the window's last file page
    // is reached.
    let expand_scan = super::scan_window::expand_scan(
        truncated,
        q.max_files(),
        cut.resume,
        super::scan_window::ScanLimits::MATCH,
    )
    .map(|window| {
        let mut expand =
            json!({"scanOffset":window.scan_offset,"page":1,"matchPage":1,"snapshot":null});
        if let Some(bound) = window.max_files {
            expand["maxFiles"] = json!(bound);
        }
        expand
    });
    if truncated && !more && expand_scan.is_none() {
        crate::tools::paging::terminal_limit(
            out,
            super::scan_window::cut_reason(q.max_files()),
            &[],
        );
    }
    let cursor = |out: &mut Value, field: &str, next: usize| {
        crate::tools::paging::next_cursor(out, ToolId::AstSearch, Some("match"), field, next)
    };
    // Finish each file page's matches before advancing the file/scan axis.
    // Otherwise every match page reissues the same next file or scan window.
    let next_page = (more && !has_more_matches)
        .then(|| cursor(out, "page", page + 1))
        .flatten();
    let next_match_page = has_more_matches
        .then(|| cursor(out, "matchPage", match_page + 1))
        .flatten();
    let with = |changes: Value| continuation_with(q, changes, snapshot);
    if let Some(next_page) = next_page {
        // A new file page restarts per-file match pagination.
        out["next"] = json!({"nextPage":with(json!({"page":next_page,"matchPage":1}))})
    }
    if let Some(next_match_page) = next_match_page {
        out["next"]["nextMatchPage"] = with(json!({"matchPage":next_match_page}));
    }
    if let Some(expand) = expand_scan.filter(|_| !more && !has_more_matches) {
        out["next"]["expandScan"] = with(expand);
    }
    // A clipped value is display clipping of a listed match, not a coverage
    // gap: expandCaptures re-runs with captures and the whole length when
    // captures are hidden; otherwise (or past the length maximum) the
    // clipped rows' lines are read whole.
    let whole_length = cut_chars.map(|chars| chars.min(max_content_length));
    let expand_captures = has_truncated_captures && !q.capture_text().unwrap_or(false);
    if expand_captures {
        let mut expand = json!({"captureText":true});
        if let Some(length) = whole_length.filter(|length| *length > content_length) {
            expand["matchContentLength"] = json!(length);
        }
        out["next"]["expandCaptures"] = with(expand);
    }
    if !expand_captures || cut_chars.is_some_and(|chars| chars > max_content_length) {
        read_clipped_lines(scope, out, page_groups);
    }
    if let Some(read) = page_groups
        .first()
        .and_then(|top| read_top_hits(scope, &top.row))
    {
        out["next"]["read"] = read;
    }
}

/// One `expandValues` lead whose rows read each file's clipped lines, within
/// localFetch's batch limit; a warning names every range left out.
fn read_clipped_lines(scope: &Scope, out: &mut Value, page_groups: &[Group]) {
    let limit = crate::tools::result::rows_per_call(ToolId::LocalFetch);
    let (mut rows, mut left) = (Vec::new(), Vec::new());
    for group in page_groups {
        let Some(reads) = read_clipped_values(scope, group) else {
            continue;
        };
        let shown = group.row["path"].as_str().unwrap_or_default();
        for row in reads.rows {
            if rows.len() < limit {
                rows.push(row);
            } else {
                left.push(format!("{shown} {}", ranges_text(&row["ranges"])));
            }
        }
        if !reads.long.is_empty() {
            let long = reads
                .long
                .iter()
                .map(|(start, end)| format!("{start}-{end}"))
                .collect::<Vec<_>>();
            left.push(format!("{shown} {}", long.join(", ")));
        }
    }
    if !left.is_empty() {
        crate::tools::paging::push_warnings(
            out,
            [format!(
                "Clipped values past this page's read batch (read them with localFetch): {}.",
                left.join("; ")
            )],
        );
    }
    if !rows.is_empty() {
        out["next"]["expandValues"] = crate::tools::result::Continuation::input(
            ToolId::LocalFetch,
            json!({ "queries": rows }),
        )
        .confidence("high")
        .build();
    }
}

/// Lines of context around each hit in the `read` lead.
const READ_CONTEXT: u64 = 3;
/// Hit windows one `read` lead may name.
const READ_MAX_RANGES: usize = 5;
/// Longest match the top read shows whole.
const READ_MAX_SPAN: u64 = 400;

/// The file a match row names.
fn row_file(scope: &Scope, row: &Value) -> Option<std::path::PathBuf> {
    let shown = row["path"].as_str()?;
    Some(if scope.is_file {
        scope.canonical.clone()
    } else {
        scope
            .canonical
            .parent()
            .unwrap_or(&scope.canonical)
            .join(shown)
    })
}

/// One file's clipped rows: localFetch rows reading their merged line
/// spans, at most
/// [`RANGES_MAX_ITEMS`](crate::tools::id::query_limits::local_fetch::RANGES_MAX_ITEMS)
/// per row, and the spans longer than [`READ_MAX_SPAN`] lines (a whole
/// file's match) left out: whole, they would put the file on the page.
struct ClippedReads {
    rows: Vec<Value>,
    long: Vec<(u64, u64)>,
}

fn read_clipped_values(scope: &Scope, group: &Group) -> Option<ClippedReads> {
    let file = row_file(scope, &group.row).filter(|_| !group.clipped.is_empty())?;
    let (short, long): (Vec<_>, Vec<_>) = group
        .clipped
        .iter()
        .copied()
        .partition(|(start, end)| end.saturating_sub(*start) < READ_MAX_SPAN);
    let rows = crate::tools::line_spans::merge_spans(short)
        .chunks(crate::tools::id::query_limits::local_fetch::RANGES_MAX_ITEMS)
        .map(|chunk| {
            let ranges = chunk
                .iter()
                .map(|(start, end)| format!("{start}-{end}"))
                .collect::<Vec<_>>();
            json!({"path": file.to_string_lossy(), "ranges": ranges})
        })
        .collect();
    Some(ClippedReads {
        rows,
        long: crate::tools::line_spans::merge_spans(long),
    })
}

/// A read row's `ranges` as `a-b, c-d`.
fn ranges_text(ranges: &Value) -> String {
    ranges
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(", ")
}

/// The natural next step after a match: read the top file's hit lines in
/// context. Offered when they fit [`READ_MAX_RANGES`] windows.
fn read_top_hits(scope: &Scope, row: &Value) -> Option<Value> {
    let file = row_file(scope, row)?;
    // A row shows a multi-line match only up to its header, so its window
    // spans the whole match; past READ_MAX_SPAN lines, its first line.
    let mut hits = vec![];
    for hit in row["matches"].as_array()? {
        let line = hit["line"].as_u64()?;
        let end = hit["endLine"]
            .as_u64()
            .filter(|end| *end >= line && end - line < READ_MAX_SPAN)
            .unwrap_or(line);
        hits.push((line, end));
    }
    let windows = crate::tools::line_spans::merge_spans(
        hits.into_iter()
            .map(|(line, end)| (line.saturating_sub(READ_CONTEXT).max(1), end + READ_CONTEXT)),
    );
    if windows.is_empty() || windows.len() > READ_MAX_RANGES {
        return None;
    }
    let ranges = windows
        .iter()
        .map(|(start, end)| format!("{start}-{end}"))
        .collect::<Vec<_>>();
    Some(
        crate::tools::result::Continuation::new(
            ToolId::LocalFetch,
            json!({"path": file.to_string_lossy(), "ranges": ranges}),
        )
        .confidence("high")
        .build(),
    )
}

/// One match row, an object: `line`, `column` (1-based), `endLine` for a
/// multi-line match, and `value` (source text or a marked, bounded prefix). With
/// `captureText` the row also carries `endColumn` for a multi-line span, and each capture once in `metavarRanges` (text plus
/// 1-based position; the engine `metavars` map is a fallback for a capture
/// without a range).
struct MatchRow {
    value: Value,
    /// The lean row withheld something `captureText:true` returns: a
    /// multi-line match cut to its header (signature) followed by `…`, or
    /// capture text the value does not show.
    withheld: bool,
    /// The shown text was cut at `matchContentLength`.
    shown_cut: bool,
    /// The match's 1-based start and end lines.
    lines: (u64, u64),
    /// The whole value's characters when they exceed `matchContentLength`,
    /// so the shown or the `captureText` value is cut.
    cut: Option<usize>,
}

fn match_value(m: &StructuralDetailedMatch, capture_text: bool, content_length: usize) -> MatchRow {
    let lines = (u64::from(m.start_line), u64::from(m.end_line));
    let whole_chars = m.text.chars().count();
    let cut = (whole_chars > content_length).then_some(whole_chars);
    let header = m.header.as_deref().filter(|_| !capture_text);
    let (text, shown_cut) = match header {
        Some(header) => bounded_match(&format!("{header} …"), content_length),
        None => bounded_match(&m.text, content_length),
    };
    if !capture_text {
        let hidden = |capture: &str| !capture.is_empty() && !text.contains(capture);
        let withheld = header.is_some()
            || m.metavar_ranges
                .values()
                .flatten()
                .any(|range| hidden(&range.text))
            || m.metavars.values().flatten().any(|value| hidden(value));
        // A row is an object named like the inputs that take it; a
        // multi-line match states its last line.
        let mut value = json!({
            "line": m.start_line,
            "column": crate::tools::num::one_based_column(m.start_col),
        });
        if m.end_line != m.start_line {
            value["endLine"] = json!(m.end_line);
        }
        value["value"] = json!(text);
        if header.is_some() || shown_cut {
            value["clipped"] = json!(true);
        }
        return MatchRow {
            value,
            withheld,
            shown_cut,
            lines,
            cut,
        };
    }
    use crate::tools::num::one_based_column;
    let mut value =
        json!({"line":m.start_line,"value":text,"column":one_based_column(m.start_col)});
    if shown_cut {
        value["clipped"] = json!(true);
    }
    if m.end_line != m.start_line {
        value["endLine"] = json!(m.end_line);
        value["endColumn"] = json!(one_based_column(m.end_col));
    }
    let mut ranges = serde_json::Map::new();
    for (name, values) in &m.metavar_ranges {
        let rows = values
            .iter()
            .map(|range| {
                let mut row = json!({
                    "text":range.text,
                    "line":range.line,
                    "column":one_based_column(range.column),
                    "endColumn":one_based_column(range.end_column)
                });
                if range.end_line != range.line {
                    row["endLine"] = json!(range.end_line);
                }
                row
            })
            .collect::<Vec<_>>();
        if !rows.is_empty() {
            ranges.insert(name.clone(), Value::Array(rows));
        }
    }
    // Capture maps are unordered; emit names sorted so output is deterministic.
    let mut captures: Vec<_> = m.metavars.iter().collect();
    captures.sort_by(|a, b| a.0.cmp(b.0));
    let mut metavars = serde_json::Map::new();
    for (name, values) in captures {
        if !ranges.contains_key(name) && !values.is_empty() {
            metavars.insert(name.clone(), json!(values));
        }
    }
    if !metavars.is_empty() {
        value["metavars"] = Value::Object(metavars);
    }
    if !ranges.is_empty() {
        value["metavarRanges"] = Value::Object(ranges);
    }
    MatchRow {
        value,
        withheld: false,
        shown_cut,
        lines,
        cut,
    }
}

/// Exact source text bounded to `limit` Unicode scalars
/// (`matchContentLength`), including the trailing ellipsis when cut, and
/// whether it was cut.
fn bounded_match(text: &str, limit: usize) -> (String, bool) {
    if text.chars().count() > limit {
        let mut output = text
            .chars()
            .take(limit.saturating_sub(1))
            .collect::<String>();
        output.push('…');
        (output, true)
    } else {
        (text.to_owned(), false)
    }
}

fn match_display_path(root: &std::path::Path, path: &str) -> String {
    let candidate = std::path::Path::new(path);
    let relative = candidate.strip_prefix(root).unwrap_or(candidate);
    super::rooted_display(root, relative)
}

fn continuation_with(q: MatchQuery<'_>, changes: Value, snapshot: &str) -> Value {
    let mut query = q.to_value();
    query["snapshot"] = json!(snapshot);
    // A `null` change drops that field.
    if let (Some(target), Some(changes)) = (query.as_object_mut(), changes.as_object()) {
        target.extend(changes.clone());
        for (field, _) in changes.iter().filter(|(_, value)| value.is_null()) {
            target.remove(field);
        }
    }
    crate::tools::result::Continuation::new(ToolId::AstSearch, query)
        .confidence("exact")
        .build()
}

/// What an empty directory scan can still offer: the other grammars the scope
/// holds, and the walk flags that were off while files of the requested
/// grammar sat behind them.
#[derive(Default)]
struct EmptyScope {
    repair: Option<Value>,
    skipped: Option<SkippedWalk>,
}

/// The skip causes that hid files of the requested grammar: the rules that
/// name them, with the query that lifts exactly those.
struct SkippedWalk {
    labels: String,
    because: String,
    lead: Value,
}

impl EmptyScope {
    fn of(
        q: MatchQuery<'_>,
        scope: &Scope,
        paths: &PathPolicy,
        cancel: &dyn CancellationCheck,
    ) -> Self {
        Self {
            repair: other_language_repair(q, scope, paths, cancel),
            skipped: skipped_walk(q, scope, paths, cancel),
        }
    }

    /// An empty scan that parsed files: only the skipped walks, no repair.
    fn beside_parsed(
        q: MatchQuery<'_>,
        scope: &Scope,
        paths: &PathPolicy,
        cancel: &dyn CancellationCheck,
    ) -> Self {
        Self {
            repair: None,
            skipped: skipped_walk(q, scope, paths, cancel),
        }
    }
}

/// Asks which of the walks the request left off (ignore files, hidden
/// entries, default-excluded directories) hold files of the requested
/// grammar; the lead lifts exactly those.
fn skipped_walk(
    q: MatchQuery<'_>,
    scope: &Scope,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Option<SkippedWalk> {
    let extensions = scope.extensions.as_ref()?;
    let walk = Walk {
        ignored: q.include_ignored().unwrap_or(false),
        hidden: q.include_hidden().unwrap_or(false),
        default_excludes: q.default_excludes(),
    };
    let budget = q
        .max_files()
        .map_or(octocode_engine::scan_budget::SCAN_WALK_FILES, |files| {
            files as usize
        });
    let (include, exclude) = (
        q.include().unwrap_or_default(),
        q.exclude().unwrap_or_default(),
    );
    let discovery = paths.discovery_walk();
    let permits = |path: &std::path::Path| discovery.permits(path);
    let stop = || cancel.check().is_err();
    let keep = |path: &std::path::Path| {
        has_extension_in(path, extensions) || scope.parsers.extension(path).is_some()
    };
    let probe = FileProbe::new(
        &scope.canonical,
        PruneMode::SyntaxVisible,
        budget,
        &permits,
        &keep,
    )
    .within(Globs {
        include: &include,
        exclude: &exclude,
    })
    .stopping(&stop)
    .beyond(walk);
    let verdict = diagnose(
        &scope.canonical,
        PruneMode::SyntaxVisible,
        walk,
        |relaxed| probe.find(relaxed),
    )
    .ok()?;
    let Verdict::Skipped(diagnosis) = verdict else {
        return None;
    };
    let mut lead = q.to_value();
    lift(&mut lead, diagnosis.causes());
    if let Some(fields) = lead.as_object_mut() {
        for field in ["snapshot", "page", "matchPage", "scanOffset"] {
            fields.remove(field);
        }
    }
    Some(SkippedWalk {
        labels: diagnosis.labels(),
        because: diagnosis.because(),
        lead: crate::tools::result::Continuation::new(ToolId::AstSearch, lead)
            .confidence("exact")
            .build(),
    })
}

/// The grammars of a directory scope that occur in it and compile the query,
/// without `language` in play.
fn directory_choice(
    q: MatchQuery<'_>,
    root: &std::path::Path,
    parsers: &GlobParsers,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Result<GrammarChoice, ToolError> {
    let prune = PruneMode::SyntaxVisible.directories(q.default_excludes());
    let (include, exclude) = (
        q.include().unwrap_or_default(),
        q.exclude().unwrap_or_default(),
    );
    let discovery = paths.discovery_walk();
    let present = present_grammars(
        root,
        &prune,
        Walk {
            ignored: q.include_ignored().unwrap_or(false),
            hidden: q.include_hidden().unwrap_or(false),
            default_excludes: !prune.is_empty(),
        },
        q.max_files()
            .map_or(octocode_engine::scan_budget::SCAN_WALK_FILES, |files| {
                files as usize
            }),
        Globs {
            include: &include,
            exclude: &exclude,
        },
        parsers,
        &|path| discovery.permits(path),
        &|| cancel.check().is_err(),
    )
    .map_err(super::native_error)?;
    let (pattern, rule) = (q.pattern(), q.rule());
    Ok(choose_grammar(present.into_iter(), |_, extensions| {
        compile_check(extensions, pattern.as_deref(), rule.as_deref())
    }))
}

/// One repair lead that runs the query once per candidate grammar, as a
/// batch within the input limit (the most frequent grammars lead).
fn language_repair(q: MatchQuery<'_>, languages: &[String]) -> Value {
    let base = q.to_value();
    let queries = languages
        .iter()
        .take(crate::tools::result::rows_per_call(ToolId::AstSearch))
        .map(|language| {
            let mut row = base.clone();
            row["language"] = json!(language);
            if let Some(fields) = row.as_object_mut() {
                fields.remove("snapshot");
            }
            row
        })
        .collect::<Vec<_>>();
    crate::tools::result::Continuation::input(ToolId::AstSearch, json!({ "queries": queries }))
        .confidence("exact")
        .build()
}

/// The repair of a `language` that parsed no file in a directory: the
/// grammars the scope does hold, when the query compiles in any of them.
fn other_language_repair(
    q: MatchQuery<'_>,
    scope: &Scope,
    paths: &PathPolicy,
    cancel: &dyn CancellationCheck,
) -> Option<Value> {
    let requested = q.language()?;
    let languages =
        match directory_choice(q, &scope.canonical, &scope.parsers, paths, cancel).ok()? {
            GrammarChoice::One(language) => vec![language],
            GrammarChoice::Several(languages) => languages,
            GrammarChoice::Invalid(_) | GrammarChoice::Absent => return None,
        }
        .into_iter()
        .filter(|language| *language != requested)
        .collect::<Vec<_>>();
    (!languages.is_empty()).then(|| language_repair(q, &languages))
}

fn diag(d: &StructuralDiagnostic) -> Value {
    json!({"code":d.code,"severity":d.severity,"stage":d.stage,"message":d.message,"path":d.path,"recovery":crate::tools::ast_rule::diagnostic_recovery(&d.code,d.recovery.as_deref())})
}

fn error_diagnostic(diagnostics: &[StructuralDiagnostic]) -> Option<&StructuralDiagnostic> {
    diagnostics
        .iter()
        .find(|diagnostic| diagnostic.severity == "error")
}

fn diagnostic_error(diagnostic: &StructuralDiagnostic) -> ToolError {
    let code = match diagnostic.code.as_str() {
        "structural.query.compileFailed"
        | "structural.query.invalid"
        | octocode_engine::structural::RULE_INVALID => "invalidPattern",
        other => other,
    };
    ToolError::new(code, crate::tools::ast_rule::untagged(&diagnostic.message))
}

#[cfg(test)]
mod language_glob_tests {
    fn language_include_globs(language: &str) -> Option<Vec<String>> {
        super::language_extensions(language).map(|extensions| {
            extensions
                .into_iter()
                .map(|extension| format!("*.{extension}"))
                .collect()
        })
    }

    #[test]
    fn directory_language_globs_derive_from_the_canonical_grammar_registry() {
        let cuda_enabled = octocode_engine::portable::grammar_capabilities()
            .iter()
            .any(|capability| {
                capability.structural_search && capability.extensions.iter().any(|ext| ext == "cu")
            });
        assert_eq!(
            language_include_globs("cuda"),
            cuda_enabled.then(|| vec!["*.cu".to_owned(), "*.cuh".to_owned()])
        );
        assert_eq!(
            language_include_globs("assembly"),
            Some(vec![
                "*.asm".to_owned(),
                "*.assembly".to_owned(),
                "*.s".to_owned()
            ])
        );
        assert_eq!(
            language_include_globs("typescript"),
            Some(vec![
                "*.cts".to_owned(),
                "*.mts".to_owned(),
                "*.ts".to_owned(),
                "*.tsx".to_owned()
            ])
        );
        assert_eq!(language_include_globs("unsupported"), None);
    }
}

#[cfg(test)]
mod bounded_text_tests {
    use super::bounded_match;

    #[test]
    fn exact_source_keeps_comments_line_breaks_and_indentation() {
        let go = "if err != nil { // The only error can be a bad pattern.\n\treturn fmt.Errorf(\"x\")\n}";
        assert_eq!(
            bounded_match(go, go.chars().count()),
            (go.to_owned(), false)
        );
        let rust = "builder\n    .worker_threads(1) // no timer!\n    .build()\n    .unwrap()";
        assert_eq!(
            bounded_match(rust, rust.chars().count()),
            (rust.to_owned(), false)
        );
        assert_eq!(bounded_match(rust, 12).0.chars().count(), 12);
    }
}

#[cfg(test)]
mod memo_tests {
    use super::*;
    use crate::tools::cancel::NeverCancel;
    use crate::tools::test_support::{Fixture, simple_policy};

    fn run(query: &Value, paths: &PathPolicy, security: &ContentSecurity) -> Value {
        let query: super::super::AstSearchQuery =
            serde_json::from_value(query.clone()).expect("typed astSearch row");
        super::super::execute_ast(&query, paths, security, &NeverCancel, None).expect("astSearch")
    }

    fn next_query(out: &Value, name: &str) -> Value {
        out["next"][name]["query"]["queries"][0].clone()
    }

    /// A continuation page served from the first page's stored scan is
    /// byte-identical to the page a fresh scan gives; an edit drops the
    /// stored scan and the page restarts as before.
    #[test]
    fn continuation_pages_reuse_the_settled_scan_with_identical_output() {
        let root = Fixture::new();
        for (name, calls) in [("a.ts", 3), ("b.ts", 1), ("c.ts", 2)] {
            let body = (0..calls)
                .map(|i| format!("console.log({i});\n"))
                .collect::<String>();
            std::fs::write(root.0.join(name), body).expect("file");
        }
        std::fs::write(root.0.join("d.ts"), "other();\n").expect("prefilter skip");
        let (paths, security) = simple_policy(&root.0);
        std::thread::sleep(
            octocode_engine::graph::SourceStamp::SETTLE + std::time::Duration::from_millis(200),
        );
        let first = run(
            &json!({"operation":"match","path":root.0,"pattern":"console.log($A)","language":"typescript","pageSize":1,"matchPageSize":2}),
            &paths,
            &security,
        );
        let snapshot = first["snapshot"].as_str().expect("snapshot").to_owned();
        assert!(
            SCANS.holds(&snapshot),
            "a multi-page scan is stored: {first}"
        );
        let mut offering = first.clone();
        let mut file_page_query = Value::Null;
        for name in ["nextMatchPage", "nextPage"] {
            let query = next_query(&offering, name);
            assert!(query.is_object(), "{name}: {offering}");
            if name == "nextPage" {
                file_page_query = query.clone();
            }
            let stored = run(&query, &paths, &security);
            SCANS.evict(&snapshot);
            let fresh = run(&query, &paths, &security);
            assert_eq!(
                serde_json::to_string(&stored).expect("json"),
                serde_json::to_string(&fresh).expect("json"),
                "{name}"
            );
            // The rescan stores the scan again for the pages after it.
            assert!(SCANS.holds(&snapshot));
            offering = fresh;
        }
        // An edit drops the stored scan: the page restarts from page 1.
        std::fs::write(root.0.join("c.ts"), "console.log(9);\n").expect("edit");
        let page = run(&file_page_query, &paths, &security);
        assert_eq!(page["errorCode"], "staleSnapshot", "{page}");
        assert!(!SCANS.holds(&snapshot));
    }
}

#[cfg(test)]
mod interrupted_rescan_tests {
    use super::*;

    /// A rescan cut by the match deadline (zero matches, status truncated)
    /// is a retryable timeout for the same page, not a stale snapshot; a
    /// complete rescan that differs stays stale.
    #[test]
    fn a_deadline_cut_rescan_is_a_retryable_timeout() {
        let query: AstSearchQueryMatchPattern = serde_json::from_value(json!({
            "operation":"match","path":"/repo/a.min.js","pattern":"f($A)",
            "matchPage":9,"snapshot":"earlier"
        }))
        .expect("typed row");
        let q = MatchQuery::Pattern(&query);
        let cut = Scan {
            files: vec![(
                "a.min.js".to_owned(),
                vec![],
                vec![StructuralDiagnostic {
                    code: "structural.match.deadline".to_owned(),
                    severity: "warning".to_owned(),
                    stage: "match".to_owned(),
                    message: "Structural matching exceeded its execution deadline".to_owned(),
                    path: None,
                    recovery: None,
                }],
                "truncated".to_owned(),
            )],
            ..Scan::default()
        };
        let error = interrupted_rescan(q, &cut).expect("a deadline cut is a timeout");
        assert_eq!(error.code, "timeout");
        let retry = &error.next.expect("retry")["retry"]["query"]["queries"][0];
        assert_eq!(retry["matchPage"], 9);
        assert_eq!(retry["snapshot"], "earlier");
        let changed = Scan {
            files: vec![("a.min.js".to_owned(), vec![], vec![], "ok".to_owned())],
            ..Scan::default()
        };
        assert!(interrupted_rescan(q, &changed).is_none());
    }
}

#[cfg(test)]
mod source_freshness_tests;

#[cfg(test)]
mod discovery_freshness_tests;

#[cfg(test)]
mod external_ignore_freshness_tests;

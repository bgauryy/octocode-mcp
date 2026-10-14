//! Typed failures, empty rows, partial marking, and executable `next.*`
//! continuations shared by every `lspSearch` operation.

use super::LspSearchQuery;
use super::render::uri_to_path;
use crate::tools::id::ToolId;
use octocode_engine::error::{Error as EngineError, ErrorCode, ErrorKind};
use serde_json::{Value, json};

/// A request-level failure `execute` could not render as a row. The
/// dispatcher emits `code`/`message`/`hint`/`retryable` verbatim, so each
/// cause keeps its own recovery instead of one generic "unavailable" code.
#[derive(Clone, Debug, PartialEq)]
pub struct LspFailure {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
    pub hint: &'static str,
    /// The language server cannot answer this scope at all (it was stopped
    /// for its memory), so the row leads to an unverified text search
    /// instead of a retry.
    pub lexical_fallback: bool,
}

/// A timed-out request: the retry is the row's own query (the server keeps
/// loading between calls); the rest of the tip works without the server.
const TIMEOUT_TIP: &str = "Retry once (the server keeps indexing between calls); if it persists, locate candidates with astSearch or localSearch and read exact lines with localFetch.";

const RETRY_OR_FALL_BACK: &str =
    "Retry once; if it persists, re-anchor from localFetch source or use astSearch/localSearch.";

impl LspFailure {
    pub(super) fn invalid_query(message: impl Into<String>) -> Self {
        Self {
            code: "invalidInput",
            message: message.into(),
            retryable: false,
            hint: "Correct the lspSearch fields (see `octocode schema lspSearch`), then retry.",
            lexical_fallback: false,
        }
    }

    /// A request left unanswered past the time a cheaper labelled answer
    /// was willing to wait for it.
    pub(super) fn overdue(message: String) -> Self {
        Self {
            code: "timeout",
            message,
            retryable: true,
            hint: TIMEOUT_TIP,
            lexical_fallback: false,
        }
    }

    /// The caller cancelled or the deadline expired; the dispatcher reports
    /// the runtime cancellation outcome instead of this row.
    pub(super) fn cancelled(message: String) -> Self {
        Self {
            code: "cancelled",
            message,
            retryable: false,
            hint: "The request was cancelled or exceeded its deadline.",
            lexical_fallback: false,
        }
    }

    /// Path-policy refusal: the same code local reads use, so agents route it
    /// as a sandbox/path problem rather than a missing language server.
    pub(super) fn path_denied(error: crate::policy::PolicyError) -> Self {
        use crate::policy::PolicyErrorCode;
        let hint = match error.code {
            PolicyErrorCode::OutsideAllowedRoots | PolicyErrorCode::SymlinkEscape => {
                crate::tools::output::SANDBOX_HINT
            }
            _ => crate::tools::output::LIST_FILES_HINT,
        };
        Self {
            code: error.local_error_code("fileAccessFailed"),
            message: error.message,
            retryable: false,
            hint,
            lexical_fallback: false,
        }
    }

    /// Classify an engine error by its typed kind (never by message text):
    /// a timeout, a server that exited, an unimplemented method, a stale or
    /// server-cancelled request, and any other request failure each keep
    /// their own code and retry advice.
    pub(super) fn from_engine(error: &EngineError) -> Self {
        let message = error.to_string();
        match error.kind() {
            ErrorKind::Timeout => Self {
                code: "timeout",
                message,
                retryable: true,
                hint: TIMEOUT_TIP,
                lexical_fallback: false,
            },
            ErrorKind::ConnectionClosed => Self {
                code: "serverCrashed",
                message,
                retryable: true,
                hint: "The language server exited or its connection failed; retry once (it restarts), then fall back to astSearch/localSearch.",
                lexical_fallback: false,
            },
            ErrorKind::ResourceExhausted => Self {
                code: "serverCrashed",
                message,
                retryable: false,
                hint: "Server hit its memory limit; a retry repeats it. Use the unverified text lead, or astSearch, then localFetch the lines.",
                lexical_fallback: true,
            },
            ErrorKind::Rpc(rpc) => match rpc.code {
                ErrorCode::MethodNotFound => Self {
                    code: "capabilityUnavailable",
                    message,
                    retryable: false,
                    hint: "Use the advertised LSP operations, or fall back to astSearch/localSearch and exact source reads.",
                    lexical_fallback: false,
                },
                ErrorCode::ContentModified
                | ErrorCode::ServerCancelled
                | ErrorCode::RequestCancelled
                | ErrorCode::ServerNotInitialized => Self {
                    code: "requestFailed",
                    message,
                    retryable: true,
                    hint: RETRY_OR_FALL_BACK,
                    lexical_fallback: false,
                },
                ErrorCode::InvalidParams | ErrorCode::InvalidRequest | ErrorCode::ParseError => {
                    Self {
                        code: "requestFailed",
                        message,
                        retryable: false,
                        hint: "The language server rejected the request; re-anchor from localFetch source or use astSearch/localSearch.",
                        lexical_fallback: false,
                    }
                }
                _ => Self::request_failed(message),
            },
            _ => Self::request_failed(message),
        }
    }

    /// The row a failure the server cannot recover from becomes: the error,
    /// its one hint, and the leads the failed row offers (never a retry).
    pub(super) fn row(&self, query: &LspSearchQuery, canonical_uri: &str) -> Value {
        let mut value = failure(query, canonical_uri, self.code, &self.message, false);
        value["hints"] = json!([self.hint]);
        if query.operation() == "callers" {
            let mut references = query_value(query);
            references["operation"] = json!("references");
            value["next"]["findReferences"] = continuation(references);
        }
        value
    }

    fn request_failed(message: String) -> Self {
        Self {
            code: "requestFailed",
            message,
            retryable: true,
            hint: RETRY_OR_FALL_BACK,
            lexical_fallback: false,
        }
    }
}

impl From<EngineError> for LspFailure {
    fn from(error: EngineError) -> Self {
        Self::from_engine(&error)
    }
}

/// The static tip of a failure code; `None` when the row's leads and
/// per-call notes say it all (`anchorUnresolved`: `findSimilar`/`read`).
pub(super) fn failure_hint(query: &LspSearchQuery, code: &str) -> Option<&'static str> {
    Some(match code {
        "serverUnavailable" if query.operation() == "workspaceSymbol" && query.path().is_none() => {
            "Provide path for a representative workspace source file so Octocode can select its language server."
        }
        // The row's `next.read` (and `next.findText` for a symbol) is the
        // fallback; no static tip repeats it.
        "serverUnavailable" if query.path().is_some() => return None,
        "serverUnavailable" => {
            "Use astSearch symbols/match or localSearch for candidates, then localFetch exact source."
        }
        "capabilityUnavailable"
            if matches!(query.operation().as_str(), "supertypes" | "subtypes") =>
        {
            "This server cannot prove type hierarchy; inspect declarations with astSearch and confirm exact source."
        }
        "capabilityUnavailable" => {
            "Use the advertised LSP operations, or fall back to astSearch/localSearch and exact source reads."
        }
        "timeout" => TIMEOUT_TIP,
        "fileTooLarge" => {
            "Use localSearch or astSearch to locate a bounded region, then read that exact source range."
        }
        "anchorUnresolved" => return None,
        _ => "Use astSearch or localSearch to locate candidates, then localFetch exact source.",
    })
}

/// The static tip of an empty category; `None` when the row's reason says
/// it all.
pub(super) fn empty_hint(category: &str) -> Option<&'static str> {
    Some(match category {
        "noLocations" => {
            "Verify the symbol and anchor; then try references/definition alternatives or exact syntax/text search."
        }
        "noProject" => {
            "Use localSearch or astSearch here, or run lspSearch where its project file (Cargo.toml, package.json) is present."
        }
        "unsupportedOperation" => "Choose an operation advertised by the lspSearch schema.",
        "noDiagnostics" => return None,
        "diagnosticsNotPublished" => {
            "Retry once the server has analyzed the file, or run the project's type-check/build for authoritative errors."
        }
        _ => "Use astSearch or localSearch to locate candidates, then localFetch exact source.",
    })
}

pub(super) fn failure(
    query: &LspSearchQuery,
    canonical_uri: &str,
    code: &str,
    message: &str,
    server_available: bool,
) -> Value {
    let mut value = json!({
        "status": "error",
        "errorCode": code,
        "error": message,
        "lsp": { "serverAvailable": server_available },
        "hints": failure_hint(query, code).into_iter().collect::<Vec<_>>()
    });
    if !canonical_uri.is_empty() {
        value["path"] = json!(super::render::uri_to_path(canonical_uri));
    }
    if code == "timeout" {
        value["next"]["retry"] = continuation(query_value(query));
    }
    if query.path().is_some() {
        attach_recovery_next(&mut value, query);
        match code {
            "serverUnavailable" => attach_text_search(&mut value, query, None),
            // Whatever the server held is lost: the lexical check is all
            // that is left, and no verification stands behind it.
            "serverCrashed" => attach_text_search(&mut value, query, Some("low")),
            _ => {}
        }
    }
    value
}

/// With no language server, the lexical check of a named symbol: a
/// whole-word, case-sensitive localSearch over the workspace (else the
/// file's directory).
fn attach_text_search(value: &mut Value, query: &LspSearchQuery, confidence: Option<&str>) {
    let Some(symbol) = query.symbol_name().filter(|name| !name.trim().is_empty()) else {
        return;
    };
    let path = query.path().map(uri_to_path).unwrap_or_default();
    let file = std::path::Path::new(&path);
    if file.is_dir() {
        return; // `next.read` already searches the directory.
    }
    let Some(scope) = query
        .workspace_root()
        .map(uri_to_path)
        .or_else(|| file.parent().map(|dir| dir.to_string_lossy().into_owned()))
    else {
        return;
    };
    let lead = crate::tools::result::Continuation::new(
        ToolId::LocalSearch,
        json!({"path": scope, "matchString": symbol, "regex": "literal", "wholeWord": true, "caseMode": "sensitive"}),
    );
    value["next"]["findText"] = match confidence {
        Some(confidence) => lead.confidence(confidence),
        None => lead,
    }
    .build();
}

pub(super) fn empty(
    query: &LspSearchQuery,
    category: &str,
    reason: &str,
    server_available: bool,
) -> Value {
    let mut row = json!({
        "status": "empty",
        "kind": "empty",
        "category": category,
        "reason": reason,
        "lsp": { "serverAvailable": server_available },
    });
    if let Some(hint) = empty_hint(category) {
        row["hints"] = json!([hint]);
    }
    // A workspaceRoot-only query has no file: the row names none.
    if let Some(path) = query.path() {
        row["path"] = json!(path);
        if category == "noLocations"
            && path.ends_with(".rs")
            && !runs_build_scripts(query)
            && let Some(hints) = row["hints"].as_array_mut()
        {
            hints.push(json!(BUILD_SCRIPT_TIP));
        }
    }
    row
}

/// rust-analyzer runs without build scripts by default, so a name a build
/// script generates (`include!(concat!(env!("OUT_DIR"), …))`) has no
/// location until they run.
const BUILD_SCRIPT_TIP: &str = "A name a build script generates (include! of OUT_DIR) resolves only with rustContext {buildScripts:true}.";

/// Whether the request already runs build scripts (`rustContext.buildScripts`).
fn runs_build_scripts(query: &LspSearchQuery) -> bool {
    query
        .rust_context()
        .is_some_and(|context| context["buildScripts"] == true)
}

pub(super) fn query_value(query: &LspSearchQuery) -> Value {
    serde_json::to_value(query).unwrap_or_else(|_| json!({}))
}

/// An exact, executable `lspSearch` continuation.
pub(super) fn continuation(query: Value) -> Value {
    crate::tools::result::Continuation::new(ToolId::LspSearch, query)
        .confidence("exact")
        .build()
}

/// Name the row's coverage state where the row reports coverage details
/// (`importerScan`, `textOnlyFiles`, …): `error` for a failure row, `partial`
/// for a row flagged incomplete or carrying a coverage reason, else `complete`.
/// A row without coverage details states no coverage object.
pub(super) fn stamp_coverage(row: &mut Value) {
    let state = if row.get("status").and_then(Value::as_str) == Some("error") {
        "error"
    } else if row.get("isPartial").and_then(Value::as_bool) == Some(true)
        || row.pointer("/coverage/reason").is_some()
    {
        "partial"
    } else {
        "complete"
    };
    if let Some(coverage) = row.get_mut("coverage").and_then(Value::as_object_mut) {
        coverage.entry("state").or_insert_with(|| json!(state));
    }
}

/// An empty diagnostics row whose server pushed nothing within `wait_ms`: the
/// document may still have diagnostics, so the row is partial with a retry.
pub(super) fn mark_diagnostics_unpublished(row: &mut Value, query: &LspSearchQuery, wait_ms: u32) {
    if row.pointer("/kind").and_then(Value::as_str) != Some("empty") {
        return;
    }
    row["category"] = json!("diagnosticsNotPublished");
    row["reason"] = json!(format!(
        "The language server published no diagnostics for this document within {wait_ms} ms."
    ));
    row["hints"] = json!(
        empty_hint("diagnosticsNotPublished")
            .into_iter()
            .collect::<Vec<_>>()
    );
    mark_partial(row, query, "diagnosticsNotPublished", &[]);
}

/// Flag a row as incomplete with a machine-readable reason, human warnings,
/// and an executable `next.retry` of the same query.
pub(super) fn mark_partial(
    row: &mut Value,
    query: &LspSearchQuery,
    reason: &str,
    warnings: &[String],
) {
    if !row.is_object() {
        return;
    }
    crate::tools::paging::mark_partial(row, reason, warnings);
    row["next"]["retry"] = continuation(query_value(query));
}

pub(super) fn with_next(query: &LspSearchQuery, mut value: Value) -> Value {
    if value
        .pointer("/pagination/hasMore")
        .and_then(Value::as_bool)
        == Some(true)
    {
        let next_page = value
            .pointer("/pagination/nextPage")
            .and_then(Value::as_u64)
            .and_then(|page| usize::try_from(page).ok())
            .unwrap_or(2);
        if let Some(page) = crate::tools::paging::next_cursor(
            &mut value,
            ToolId::LspSearch,
            None,
            "page",
            next_page,
        ) {
            let mut next_query = query_value(query);
            if let Some(object) = next_query.as_object_mut() {
                object.insert("page".into(), json!(page));
                if let Some(snapshot) =
                    value.get("snapshot").and_then(Value::as_str).or_else(|| {
                        value
                            .pointer("/pagination/snapshot")
                            .and_then(Value::as_str)
                    })
                {
                    object.insert("snapshot".into(), json!(snapshot));
                }
            }
            value["next"]["nextPage"] = continuation(next_query);
        }
        // The continuation states the next page and the snapshot; `pageSize`
        // stays a page fact, so every page has one key set.
        if let Some(pagination) = value.get_mut("pagination").and_then(Value::as_object_mut) {
            for key in ["nextPage", "snapshot"] {
                pagination.shift_remove(key);
            }
        }
    } else if value.pointer("/kind").and_then(Value::as_str) == Some("empty") {
        value["status"] = json!("empty");
        // A workspaceRoot-only query has no file to fall back to reading, and
        // reading source cannot stand in for missing diagnostics.
        let category = value.pointer("/category").and_then(Value::as_str);
        if query.path().is_some()
            && !matches!(category, Some("noDiagnostics" | "diagnosticsNotPublished"))
        {
            attach_recovery_next(&mut value, query);
        }
    }
    if let Some(context) = &query.rust_context() {
        value["rustContext"] = json!({
            "context": context,
            "fingerprint": super::receipt::rust_fingerprint(context)
        });
    }
    value
}

/// A request whose path did not validate, as a row where its lead says
/// what to do (a directory anchor, a missing path), else the failure.
pub(super) fn path_failure(
    query: &LspSearchQuery,
    paths: &crate::policy::path::PathPolicy,
    failure: LspFailure,
) -> Result<Value, LspFailure> {
    if let Some(row) = directory_anchor(query, paths) {
        return Ok(row);
    }
    if failure.code != crate::policy::PATH_NOT_FOUND {
        return Err(failure);
    }
    let mut row = json!({
        "status": "error",
        "errorCode": failure.code,
        "error": failure.message,
        "lsp": { "serverAvailable": false },
    });
    let requested = query.path().map(uri_to_path).unwrap_or_default();
    if let Some(next) = crate::tools::result::missing_path_lead(paths, &requested) {
        row["next"] = next;
    }
    Ok(row)
}

/// The `notAFile` row of a request whose file anchor names a directory,
/// leading into it: a whole-word search for the named symbol, else the
/// directory's file listing. `None` when the path is no authorized directory.
pub(super) fn directory_anchor(
    query: &LspSearchQuery,
    paths: &crate::policy::path::PathPolicy,
) -> Option<Value> {
    let decoded = super::render::decode_uri_path(query.path()?).ok()?;
    let directory = paths
        .validate(&decoded)
        .ok()
        .filter(|valid| valid.canonical.is_dir())?
        .canonical;
    let name = paths
        .workspace_relative(&directory)
        .unwrap_or_else(|| directory.to_string_lossy().into_owned());
    let mut row = json!({
        "status": "error",
        "errorCode": "notAFile",
        "error": format!("{name} is a directory, not a file."),
        "lsp": { "serverAvailable": false },
    });
    match query
        .symbol_name()
        .filter(|symbol| !symbol.trim().is_empty())
    {
        Some(symbol) => {
            row["next"]["findText"] = crate::tools::result::Continuation::new(
                ToolId::LocalSearch,
                json!({"path": name, "matchString": symbol, "regex": "literal", "wholeWord": true, "caseMode": "sensitive"}),
            )
            .build();
        }
        None => {
            row["next"]["list"] = crate::tools::result::Continuation::new(
                ToolId::StructureSearch,
                json!({"operation": "files", "path": name}),
            )
            .build();
        }
    }
    Some(row)
}

/// `next.read` recovery: the symbol's match windows when a name anchored
/// the request (not the whole file), otherwise the file's default view.
pub(super) fn attach_recovery_next(value: &mut Value, query: &LspSearchQuery) {
    let path = query.path().map(uri_to_path).unwrap_or_default();
    let symbol = query.symbol_name().filter(|name| !name.trim().is_empty());
    // A directory (a workspaceSymbol scope) is searched, not fetched.
    if let Some(symbol) = symbol.filter(|_| std::path::Path::new(&path).is_dir()) {
        value["next"]["read"] = crate::tools::result::Continuation::new(
            ToolId::LocalSearch,
            json!({ "path": path, "matchString": symbol }),
        )
        .confidence("exact")
        .build();
        return;
    }
    let mut read = json!({ "path": path });
    if let Some(symbol) = symbol {
        read["matchString"] = json!(symbol);
        read["caseMode"] = json!("sensitive");
        read["contextLines"] = json!(3);
    }
    value["next"]["read"] = crate::tools::result::Continuation::new(ToolId::LocalFetch, read)
        .confidence("exact")
        .build();
}

/// Lines read on each side of `line` when the symbol is not there.
const ANCHOR_READ_RADIUS: u32 = 5;
/// Lines scanned on each side of `line` for a near-miss name.
const SUGGESTION_RADIUS: usize = 20;

/// Recovery for a `symbolName` that did not resolve: the name elsewhere in
/// the file or the closest identifier near `line` as an executable
/// `next.findSimilar`; without any candidate, a read of the lines around
/// `line` (a `matchString` of the missing name cannot match).
pub(super) fn anchor_recovery(value: &mut Value, query: &LspSearchQuery, source: Option<&str>) {
    let (Some(name), Some(path)) = (query.symbol_name(), query.path().map(uri_to_path)) else {
        return;
    };
    let hint = query.anchor_line().filter(|line| *line > 0);
    // The name itself elsewhere in the file (a stale `line`) first,
    // declarations before uses; then near-miss spellings.
    let exact = source
        .map(|source| name_lines(source, name, hint))
        .unwrap_or_default();
    let near = source
        .map(|source| near_names(source, name, hint))
        .unwrap_or_default();
    let leads = exact
        .iter()
        .map(|line| (name.to_owned(), *line, "high"))
        .chain(
            near.iter()
                .map(|(word, line)| (word.clone(), *line, "medium")),
        )
        .take(MAX_ANCHOR_LEADS)
        .collect::<Vec<_>>();
    if let Some(object) = value["next"].as_object_mut() {
        object.remove("read");
    }
    if leads.is_empty()
        && let Some(line) = hint
    {
        // A `line` past the end reads the file's last lines: a range wholly
        // past the end is an error, not a read.
        let last = source.map_or(u32::MAX, |source| {
            u32::try_from(source.lines().count().max(1)).unwrap_or(u32::MAX)
        });
        let line = line.min(last);
        value["next"]["read"] = crate::tools::result::Continuation::new(
            ToolId::LocalFetch,
            json!({
                "path": path,
                "ranges": [format!(
                    "{}-{}",
                    line.saturating_sub(ANCHOR_READ_RADIUS).max(1),
                    line.saturating_add(ANCHOR_READ_RADIUS).min(last)
                )]
            }),
        )
        .confidence("exact")
        .build();
    }
    for (index, (symbol, line, confidence)) in leads.iter().enumerate() {
        let mut retry = query_value(query);
        if let Some(object) = retry.as_object_mut() {
            object.insert("symbolName".into(), json!(symbol));
            object.insert("line".into(), json!(line));
            object.remove("orderHint");
        }
        let key = match index {
            0 => "findSimilar".to_owned(),
            n => format!("findSimilar{}", n + 1),
        };
        value["next"][key] = crate::tools::result::Continuation::new(ToolId::LspSearch, retry)
            .confidence(*confidence)
            .build();
    }
    // Candidates the leads already carry are not repeated; only lines and
    // names beyond the lead cap are stated.
    let offered = leads.len();
    let mut notes = Vec::new();
    let uncovered_exact = exact.iter().skip(offered).collect::<Vec<_>>();
    if !uncovered_exact.is_empty() {
        let lines = uncovered_exact
            .iter()
            .map(|line| line.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        notes.push(format!("`{name}` appears on line {lines}."));
    }
    let uncovered_near = near
        .iter()
        .skip(offered.saturating_sub(exact.len()))
        .collect::<Vec<_>>();
    if !uncovered_near.is_empty() {
        let listed = uncovered_near
            .iter()
            .map(|(name, line)| format!("`{name}` (line {line})"))
            .collect::<Vec<_>>()
            .join(", ");
        notes.push(format!("Closest names: {listed}."));
    }
    if let Some(hints) = value["hints"].as_array_mut() {
        hints.extend(notes.into_iter().map(Value::from));
    }
}

/// Re-anchor leads one unresolved anchor offers: the hint channel's lead
/// cap, so no offered lead is dropped after the text skipped its line.
const MAX_ANCHOR_LEADS: usize = crate::tools::id::continuation_channels::MAX_HINT_LEADS;

/// Declaration keywords that may precede a declared name on its line.
const DECLARATION_WORDS: &[&str] = &[
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "const",
    "let",
    "var",
    "fn",
    "struct",
    "trait",
    "impl",
    "mod",
    "def",
    "func",
    "static",
    "namespace",
    "module",
];

/// One-based lines that spell `name` as a word: declaration lines first
/// (a declaration keyword just before the name), then the rest, each
/// group nearest `hint` first. The first [`MAX_ANCHOR_LEADS`] become leads;
/// the rest are stated as line numbers.
fn name_lines(source: &str, name: &str, hint: Option<u32>) -> Vec<usize> {
    if name.trim().is_empty() {
        return Vec::new();
    }
    let is_word = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    let hint = hint.map_or(0, |line| line as usize);
    let mut found: Vec<(bool, usize, usize)> = Vec::new();
    for (index, text) in source.lines().enumerate() {
        let declares = text.match_indices(name).any(|(at, _)| {
            let bounded = !text[..at].chars().next_back().is_some_and(is_word)
                && !text[at + name.len()..].chars().next().is_some_and(is_word);
            bounded
                && text[..at]
                    .split(|c: char| !is_word(c))
                    .rfind(|word| !word.is_empty())
                    .is_some_and(|word| DECLARATION_WORDS.contains(&word))
        });
        let mentions = declares
            || text.match_indices(name).any(|(at, _)| {
                !text[..at].chars().next_back().is_some_and(is_word)
                    && !text[at + name.len()..].chars().next().is_some_and(is_word)
            });
        if mentions {
            let line = index + 1;
            found.push((!declares, line.abs_diff(hint), line));
        }
    }
    found.sort_unstable();
    found.into_iter().map(|(_, _, line)| line).collect()
}

/// Up to three distinct identifiers within a small edit distance of `name`,
/// nearest `line` first (the whole file without a hint).
fn near_names(source: &str, name: &str, hint: Option<u32>) -> Vec<(String, usize)> {
    let hint = hint.map(|line| line as usize);
    let limit = (name.chars().count() / 4).max(1);
    let mut found: Vec<(usize, usize, String, usize)> = Vec::new();
    for (index, text) in source.lines().enumerate() {
        let line = index + 1;
        if hint.is_some_and(|hint| line.abs_diff(hint) > SUGGESTION_RADIUS) {
            continue;
        }
        for word in text
            .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'))
            .filter(|word| !word.is_empty() && *word != name && word.len() <= 256)
        {
            let distance = crate::contracts::levenshtein(word, name);
            if distance <= limit && !found.iter().any(|entry| entry.2 == word) {
                let offset = hint.map_or(0, |hint| line.abs_diff(hint));
                found.push((distance, offset, word.to_owned(), line));
            }
        }
    }
    found.sort();
    found
        .into_iter()
        .take(3)
        .map(|(_, _, word, line)| (word, line))
        .collect()
}

/// Partial reasons about *files* the server's project may not see. When
/// every file that spells the name is in the answer (`textOnlyFiles == 0`),
/// such a reason is moot and is not flagged. Site-level reasons (dynamic
/// dispatch, cfg-gated code) can hide sites inside listed files, so file
/// agreement never clears them.
pub(super) const FILE_LEVEL_REASONS: [&str; 5] = [
    "inferredProject",
    "importerScanCapped",
    "importerScanFailed",
    "aliasScanCapped",
    "noCompileDatabase",
];
/// File-level reasons that are fixed per-request caps (a terminal limit).
/// The importer cap is not one: `next.nextImporterPage` verifies the next
/// window of candidates.
const CAPPED_REASONS: [&str; 1] = ["aliasScanCapped"];
/// At most this many text-only files are listed as one bulk lead.
pub(super) const LISTED_TEXT_FILES: usize = 5;

/// Mark an incoming-direction row partial: coverage reason, a warning, and
/// (when the query names its symbol) a lexical `findText` lead over the
/// request's search scope. `coverage.textOnlyFiles` counts the files that
/// spell the name but are not in the answer; up to five are the lead's rows.
pub(super) fn flag_partial(
    row: &mut Value,
    query: &LspSearchQuery,
    reason: &str,
    warning: Option<&str>,
    scope: &super::scope::Scope,
) {
    let name = query.symbol_name().filter(|name| !name.trim().is_empty());
    let text_only = name.and_then(|name| scope.text_only_files(name));
    let agrees = text_only.as_ref().is_some_and(Vec::is_empty);
    if let Some(payload) = row.as_object_mut() {
        if let Some(files) = &text_only {
            payload.entry("coverage").or_insert_with(|| json!({}))["textOnlyFiles"] =
                json!(files.len());
        }
        if agrees && FILE_LEVEL_REASONS.contains(&reason) {
            return;
        }
        // A named row states its reason once, in `partialReasons`.
        if name.is_none() {
            payload.entry("coverage").or_insert_with(|| json!({}))["reason"] = json!(reason);
        }
    }
    let warnings = warning.map(str::to_owned).into_iter().collect::<Vec<_>>();
    // A warning, not a hint: the hint policy keeps hints for empty/error rows
    // only, and this caveat matters most when the row looks complete.
    match name {
        // Partial only with an executable recovery.
        Some(name) => {
            crate::tools::paging::mark_partial(row, reason, &warnings);
            row["next"]["findText"] = text_search_lead(name, scope, text_only.as_deref());
            if CAPPED_REASONS.contains(&reason) {
                // A fixed per-request cap: no page or retry reaches the
                // unchecked files, only the lexical lead above.
                row["terminalLimit"] = json!(true);
            }
        }
        // A position anchor has no name to search for: coverage reason and
        // warning only.
        None => crate::tools::paging::push_warnings(row, warnings),
    }
}

/// Whether [`flag_partial`] already flagged `row` with `reasons`' reason:
/// the coverage reason of an unnamed row, or a `partialReasons` entry.
pub(super) fn flagged_with(row: &Value, reasons: &[&str]) -> bool {
    row.pointer("/coverage/reason").is_some()
        || row
            .get("partialReasons")
            .and_then(Value::as_array)
            .is_some_and(|listed| {
                listed
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|reason| reasons.contains(&reason))
            })
}

/// How a coverage warning names the lexical check: by the search itself (the
/// `findText` lead, which a partial row without a page always keeps, names
/// the files).
pub(super) const TEXT_CHECK: &str = "a localSearch of the name";

/// [`text_search_lead`] over files ignore rules keep out of the lexical
/// scans: each row lifts them with `includeIgnored`.
pub(super) fn ignored_text_lead(
    name: &str,
    scope: &super::scope::Scope,
    files: &[String],
) -> Value {
    let mut lead = text_search_lead(name, scope, Some(files));
    for row in lead["query"]["queries"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        row["includeIgnored"] = json!(true);
    }
    lead
}

/// The lexical lead: one row per listed file when there are a few,
/// otherwise the whole scope with the language family's globs. The
/// word-bounded pattern is a `rust` regex: an unset `regex` would search its
/// `\b` spelling as literal text.
pub(super) fn text_search_lead(
    name: &str,
    scope: &super::scope::Scope,
    text_only: Option<&[String]>,
) -> Value {
    let pattern = super::render::word_pattern(name);
    if let Some(files) = text_only.filter(|files| (1..=LISTED_TEXT_FILES).contains(&files.len())) {
        let rows = files
            .iter()
            .map(|file| json!({ "path": file, "matchString": pattern, "regex": "rust" }))
            .collect::<Vec<_>>();
        return crate::tools::result::Continuation::input(
            ToolId::LocalSearch,
            json!({ "queries": rows }),
        )
        .confidence("high")
        .build();
    }
    let mut search = json!({ "path": scope.root, "matchString": pattern, "regex": "rust" });
    if !scope.include.is_empty() {
        search["include"] = json!(scope.include);
    }
    crate::tools::result::Continuation::new(ToolId::LocalSearch, search)
        .confidence("medium")
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::ContentSecurity;
    use crate::tools::cancel::NeverCancel;
    use crate::tools::local_search::{LocalSearchQuery, execute_local_search};

    /// The lexical lead is a call as given: each of its rows runs through
    /// localSearch and finds the whole word, not the word's `\b` spelling.
    fn run_rows(lead: &Value, root: &std::path::Path) -> Vec<usize> {
        let policy = crate::tools::test_support::workspace_policy(root);
        lead["query"]["queries"]
            .as_array()
            .expect("rows")
            .iter()
            .map(|row| {
                let query: LocalSearchQuery =
                    serde_json::from_value(row.clone()).expect("lead row is a localSearch query");
                execute_local_search(
                    &query,
                    &policy,
                    &ContentSecurity::new(),
                    &NeverCancel,
                    None,
                    None,
                )
                .expect("lead runs")
                .files
                .iter()
                .map(|file| file.matches.as_ref().map_or(0, Vec::len))
                .sum()
            })
            .collect()
    }

    #[test]
    fn the_text_lead_finds_the_word_in_a_scope_and_in_listed_files() {
        let root = tempfile::tempdir().expect("root");
        let file = root.path().join("a.py");
        std::fs::write(&file, "get(1)\ngetter = 2\nx.get\n").expect("source");
        let scope = super::super::scope::Scope::new(
            root.path().to_string_lossy().into_owned(),
            vec!["*.py".into()],
        );
        let wide = text_search_lead("get", &scope, None);
        assert_eq!(run_rows(&wide, root.path()), vec![2], "{wide}");
        let files = vec![file.to_string_lossy().into_owned()];
        let listed = text_search_lead("get", &scope, Some(&files));
        assert_eq!(run_rows(&listed, root.path()), vec![2], "{listed}");
        // A name whose edge is not a word character has no `\b` there.
        std::fs::write(&file, "$store = 1\n$stored = 2\n").expect("source");
        let dollar = text_search_lead("$store", &scope, None);
        assert_eq!(run_rows(&dollar, root.path()), vec![1], "{dollar}");
    }
}

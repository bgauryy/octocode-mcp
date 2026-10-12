#[cfg(test)]
mod lead_tests;
mod matches;
mod memo;
mod output;
#[cfg(test)]
mod paging_tests;
#[cfg(test)]
mod policy_tests;
mod scan_window;
mod symbols;
#[cfg(test)]
mod symbols_tests;
mod syntax;

use serde_json::Value;

pub use crate::contracts::tool_types::AstSearchQuery;
use matches::MatchQuery;

use crate::policy::PolicyError;
#[cfg(test)]
use crate::policy::PolicyErrorCode;
use crate::tools::result::ToolError;

/// A path-policy refusal. Path-shape refusals without a shared code (empty,
/// looping, over-long, not a regular file, binary, unreadable) are one code.
pub(super) fn policy_error(error: PolicyError) -> ToolError {
    ToolError::policy(error, "pathValidationFailed")
}

/// The source astSearch parses, read bounded at [`MAX_PARSE_SOURCE_BYTES`];
/// `None` when the file is larger.
pub(super) fn read_parse_source(path: &std::path::Path) -> Result<Option<Vec<u8>>, ToolError> {
    use crate::tools::source::{BoundedRead, read_bounded};
    match read_bounded(path, MAX_PARSE_SOURCE_BYTES) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(BoundedRead::TooLarge(_)) => Ok(None),
        Err(BoundedRead::NotRegular) => Err(io_error(
            &display_name(path),
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a regular file"),
        )),
        Err(BoundedRead::Io(error)) => Err(io_error(&display_name(path), error)),
    }
}

/// The terminal row of a source larger than [`MAX_PARSE_SOURCE_BYTES`]; a
/// searched literal (a symbol name, a pattern without metavariables) leads
/// to a text search of it in the same file.
pub(super) fn source_limit(path: &str, literal: Option<&str>) -> Value {
    let mut row = serde_json::json!({"status":"error","path":path,"errorCode":"fileTooLarge","error":"Source exceeds the native parser byte limit.","isPartial":true,"terminalLimit":true});
    if let Some(lead) = literal.and_then(|literal| text_search(path, literal)) {
        row["next"] = serde_json::json!({ "findText": lead });
    }
    row
}

/// A localSearch of `literal` in `path`: the reach a parse limit leaves.
pub(super) fn text_search(path: &str, literal: &str) -> Option<Value> {
    let literal = literal.trim();
    if literal.is_empty() || literal.contains('\n') {
        return None;
    }
    let mut row = serde_json::json!({"path": path, "matchString": literal});
    if regex::escape(literal) != literal {
        row["regex"] = serde_json::json!("literal");
    }
    Some(
        crate::tools::result::Continuation::new(crate::tools::id::ToolId::LocalSearch, row)
            .confidence("medium")
            .build(),
    )
}

/// A pattern's text when it names no metavariable: the literal a text
/// search can still find.
pub(super) fn pattern_literal(pattern: &str) -> Option<&str> {
    (!pattern.contains('$')).then_some(pattern)
}

/// An I/O failure on `path` (as the caller wrote it); a missing path says
/// so in the path policy's words.
pub(super) fn io_error(path: &str, error: std::io::Error) -> ToolError {
    match error.kind() {
        std::io::ErrorKind::NotFound => path_not_found(path),
        std::io::ErrorKind::PermissionDenied => {
            ToolError::new("permissionDenied", error.to_string())
        }
        std::io::ErrorKind::InvalidInput => ToolError::new("invalidInput", error.to_string()),
        _ => ToolError::new("fileAccessFailed", error.to_string()),
    }
}

/// `pathNotFound` with the path policy's message.
fn path_not_found(path: &str) -> ToolError {
    ToolError::new(
        crate::policy::PATH_NOT_FOUND,
        format!("Path does not exist: {path}"),
    )
}

/// An engine error as a tool error: a `[structural.…]` or declared tag names
/// its code; otherwise the engine's typed kind does (never the message text).
pub(super) fn native_error(error: octocode_engine::error::Error) -> ToolError {
    use octocode_engine::error::ErrorKind;
    let message = error.to_string();
    if let Some(tagged) = tagged_error(&message) {
        return tagged;
    }
    let code = match error.kind() {
        ErrorKind::NotFound => {
            return ToolError::new(
                crate::policy::PATH_NOT_FOUND,
                format!("Path does not exist ({message})"),
            );
        }
        ErrorKind::PermissionDenied => "permissionDenied",
        ErrorKind::InvalidPattern => "invalidPattern",
        ErrorKind::InvalidInput => "invalidInput",
        ErrorKind::Timeout => "timeout",
        _ => "executionFailed",
    };
    ToolError::new(code, message)
}

/// A scan that failed with a bare message (a grammar walk, a caught panic):
/// a tagged message names its code, anything else is an execution failure.
pub(super) fn scan_error(message: String) -> ToolError {
    tagged_error(&message).unwrap_or_else(|| ToolError::new("executionFailed", message))
}

/// The tool error of a `[tag] …` engine message, when it carries one.
fn tagged_error(message: &str) -> Option<ToolError> {
    let rest = message.strip_prefix('[')?;
    let (tag, _) = rest.split_once(']')?;
    (tag.starts_with("structural.") || crate::tools::id::error_codes::class(tag).is_some()).then(
        || {
            ToolError::new(
                engine_error_code(tag),
                crate::tools::ast_rule::untagged(message),
            )
        },
    )
}

/// The declared `errorCode` of an engine error tag (`[structural.…]` or an
/// already-declared code): the engine's diagnostic names are its own, the
/// public set is the contract's.
pub(super) fn engine_error_code(tag: &str) -> &'static str {
    match tag {
        "structural.query.compileFailed" | "structural.query.invalid" => {
            crate::tools::ast_rule::INVALID_PATTERN
        }
        "structural.language.unsupported" | "syntaxTree.language.unsupported" => {
            "languageUnsupported"
        }
        "structural.content.tooLarge" | "structural.file.tooLarge" => "fileTooLarge",
        "structural.file.unreadable" => "fileReadFailed",
        "structural.parse.interrupted" | "structural.match.deadline" => "timeout",
        declared => crate::tools::id::error_codes::ALL
            .iter()
            .find(|(code, _)| *code == declared)
            .map_or("executionFailed", |(code, _)| code),
    }
}

pub(super) fn allow_discovery(
    path: &std::path::Path,
    paths: &crate::policy::path::PathPolicy,
    cancel: &dyn crate::tools::cancel::CancellationCheck,
) -> Result<bool, String> {
    cancel
        .check()
        .map_err(|message| format!("[cancelled] {message}"))?;
    Ok(paths.permits_discovery(path))
}

pub(super) use crate::tools::display_name;

/// A `.h` suffix is shared by C and C++. Keep C as the default and allow an
/// explicit C++ parser only for a single ambiguous header.
pub(super) fn cpp_header_override(path: &std::path::Path, selector: Option<&str>) -> bool {
    octocode_engine::text::extension_of(&path.to_string_lossy(), true, "") == "h"
        && selector.is_some_and(|language| {
            language.eq_ignore_ascii_case("cpp") || language.eq_ignore_ascii_case("c++")
        })
}

pub(super) fn validate_file_language(
    path: &std::path::Path,
    selector: Option<&str>,
) -> Result<(), ToolError> {
    if let Some(language) = selector {
        if language.trim().is_empty() || matches!(language, ".") {
            return Err(ToolError::new(
                "languageUnsupported",
                "language must name a registered grammar.",
            ));
        }
        let selected = crate::tools::ast_rule::language_extensions(language).ok_or_else(|| {
            ToolError::new(
                "languageUnsupported",
                format!("language \"{language}\" is not a supported structural grammar."),
            )
        })?;
        if !crate::tools::ast_rule::has_extension_in(path, &selected)
            && !cpp_header_override(path, selector)
        {
            return Err(ToolError::new(
                "languageMismatch",
                format!(
                    "{} is not a {language} source file; omit language or choose the grammar matching its extension.",
                    display_name(path)
                ),
            ));
        }
    }
    Ok(())
}

/// Row path for a descendant of a directory scope: `{root_name}/{relative}`.
/// The runtime attaches `base = parent(scope)`, so `base + path` resolves to
/// the real file for every operation (match, symbols).
pub(super) fn rooted_display(root: &std::path::Path, relative: &std::path::Path) -> String {
    let root_name = display_name(root);
    if relative.as_os_str().is_empty() {
        root_name
    } else {
        format!("{root_name}/{}", relative.to_string_lossy())
    }
}

pub type AstResult = Result<Value, ToolError>;

/// Largest source astSearch parses (match, symbols, syntaxTree). Sized for
/// real generated and monolithic sources (TypeScript's 3 MB checker.ts, the
/// 2.3 MB lib.dom.d.ts); tree-sitter and oxc parse these in well under a
/// second. Directory scans skip larger files and report them.
pub(crate) const MAX_PARSE_SOURCE_BYTES: usize = octocode_engine::signatures::MAX_PARSE_SIZE;

/// Execute one typed row. The runtime parses the validated row with its
/// shared `parse_query`, so a shape mismatch has one code across tools.
pub fn execute_ast(
    query: &AstSearchQuery,
    paths: &crate::policy::path::PathPolicy,
    security: &crate::security::ContentSecurity,
    cancellation: &dyn crate::tools::cancel::CancellationCheck,
    response_window: Option<usize>,
) -> AstResult {
    match query {
        AstSearchQuery::Symbols(query) => {
            execute_symbols(query, paths, security, cancellation, response_window)
        }
        AstSearchQuery::MatchPattern(query) => execute_match(
            MatchQuery::Pattern(query),
            paths,
            security,
            cancellation,
            response_window,
        ),
        AstSearchQuery::MatchRule(query) => execute_match(
            MatchQuery::Rule(query),
            paths,
            security,
            cancellation,
            response_window,
        ),
        AstSearchQuery::SyntaxTree(query) => {
            execute_syntax(query, paths, security, cancellation, response_window)
        }
    }
}

pub use matches::execute_match;
pub(crate) use output::Output;
pub use symbols::execute_symbols;
pub use syntax::execute_syntax;

/// A dot-named entry (`.git`, `.env`): out of view of a walk without
/// `hidden`.
pub(super) fn is_dot_entry(path: &std::path::Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with('.'))
}

#[cfg(test)]
mod tests {

    use serde_json::json;

    use super::*;
    use crate::{
        policy::path::{PathPolicy, PathPolicyConfig},
        security::ContentSecurity,
        tools::cancel::CancellationCheck,
    };

    struct Cancelled;
    impl CancellationCheck for Cancelled {
        fn check(&self) -> Result<(), String> {
            Err("cancelled by test".to_owned())
        }
    }

    /// Tests speak JSON rows; the runtime owns the typed parse.
    fn execute_row(
        query: Value,
        paths: &PathPolicy,
        security: &ContentSecurity,
        cancellation: &dyn CancellationCheck,
    ) -> AstResult {
        let query: AstSearchQuery = serde_json::from_value(query).expect("typed astSearch row");
        execute_ast(&query, paths, security, cancellation, None)
    }

    fn context() -> (PathPolicy, ContentSecurity) {
        (
            PathPolicy::new(PathPolicyConfig::default()).expect("default path policy"),
            ContentSecurity::new(),
        )
    }

    #[test]
    fn input_shape_and_cancellation_are_rejected() {
        let (paths, security) = context();
        // Shape mismatches never reach the tool: the runtime's typed parse
        // rejects them (reported as `invalidInput`).
        for row in [
            json!({"path":"."}),
            json!({"operation":"symbols","mainGoal": "test", "reasoning":"test","path":".","unknown":true}),
        ] {
            assert!(serde_json::from_value::<AstSearchQuery>(row).is_err());
        }

        let cancelled = execute_row(
            json!({"operation":"symbols","mainGoal": "test", "reasoning":"test","path":"."}),
            &paths,
            &security,
            &Cancelled,
        )
        .expect_err("cancelled before filesystem access");
        assert_eq!(cancelled.code, "cancelled");
    }

    #[test]
    fn syntax_tree_is_the_only_tree_surface() {
        let root = tempfile::tempdir().expect("fixture directory");
        let source = root.path().join("fixture.ts");
        std::fs::write(&source, "export const value = 1;\n").expect("fixture source");
        let (paths, security) = crate::tools::test_support::simple_policy(root.path());

        let syntax = execute_row(
            json!({
                "operation":"syntaxTree","mainGoal": "test", "reasoning":"test",
                "path":source.to_string_lossy()
            }),
            &paths,
            &security,
            &crate::tools::cancel::NeverCancel,
        )
        .expect("syntax tree");
        assert_eq!(syntax["operation"], "syntaxTree");
        assert!(syntax.get("treeKind").is_none(), "{syntax}");
        // One compact row per node: id, kind (an anonymous token quoted),
        // 1-based line:column span, and `^parent`. Byte offsets are
        // verbose (the verbose stage drops `returnedBytes` unless `debug`).
        let nodes = syntax["nodes"].as_array().expect("node rows");
        assert_eq!(nodes[0], "0 program 1:1-2:1", "{syntax}");
        assert_eq!(nodes[1], "1 export_statement 1:1-1:24 ^0", "{syntax}");
        assert!(syntax.get("nextOffset").is_none(), "{syntax}");
        let tokens = execute_row(
            json!({
                "operation":"syntaxTree","mainGoal": "test", "reasoning":"test",
                "path":source.to_string_lossy(),"namedOnly":false
            }),
            &paths,
            &security,
            &crate::tools::cancel::NeverCancel,
        )
        .expect("token tree");
        assert_eq!(tokens["nodes"][2], "2 \"export\" 1:1-1:7 ^1", "{tokens}");
        assert_eq!(syntax["returnedBytes"][0], "0-24", "{syntax}");
        assert_eq!(
            syntax["returnedBytes"].as_array().map(Vec::len),
            Some(nodes.len()),
            "{syntax}"
        );
        assert!(
            crate::response::extras::all_paths(crate::tools::id::ToolId::AstSearch)
                .contains(&"results[].data.returnedBytes"),
            "returnedBytes is verbose"
        );

        for retired in [
            json!({"operation":"tree","mainGoal": "test", "reasoning":"test","treeKind":"filesystem","path":root.path().to_string_lossy()}),
            json!({"operation":"tree","mainGoal": "test", "reasoning":"test","treeKind":"syntax","path":source.to_string_lossy()}),
            json!({"operation":"files","mainGoal": "test", "reasoning":"test","path":root.path().to_string_lossy()}),
            json!({"operation":"syntaxTree","mainGoal": "test", "reasoning":"test","path":source.to_string_lossy(),"entryType":"f"}),
            json!({"operation":"syntaxTree","mainGoal": "test", "reasoning":"test","path":source.to_string_lossy(),"sort":"size"}),
            json!({"operation":"topology","mainGoal": "test", "reasoning":"test","analysis":"dependencies","path":root.path().to_string_lossy(),"file":"fixture.ts"}),
        ] {
            assert!(
                serde_json::from_value::<AstSearchQuery>(retired).is_err(),
                "retired astSearch surface must be rejected"
            );
        }
    }

    #[test]
    fn policy_and_native_failures_keep_specific_codes() {
        // Path failures share the local tools' codes.
        let policy = policy_error(PolicyError::new(PolicyErrorCode::SymlinkEscape, "escape"));
        assert_eq!(policy.code, "symlinkEscape");
        let missing = policy_error(PolicyError::new(PolicyErrorCode::NotFound, "missing"));
        assert_eq!(missing.code, "pathNotFound");
        let gone = io_error(
            "src/gone.rs",
            std::io::Error::from(std::io::ErrorKind::NotFound),
        );
        assert_eq!(gone.code, "pathNotFound");
        assert_eq!(gone.message, "Path does not exist: src/gone.rs");
        use octocode_engine::error::{Error, ErrorKind};
        let engine = native_error(Error::with_kind(
            ErrorKind::NotFound,
            "Cannot access structural search path '/w/x'",
        ));
        assert_eq!(engine.code, "pathNotFound");
        assert_eq!(
            engine.message,
            "Path does not exist (Cannot access structural search path '/w/x')"
        );
        let denied = policy_error(PolicyError::new(PolicyErrorCode::PermissionDenied, "no"));
        assert_eq!(denied.code, "permissionDenied");
        assert_eq!(
            native_error(Error::new("[structural.query.compileFailed] bad pattern")).code,
            "invalidPattern"
        );
        assert_eq!(
            scan_error("[structural.query.compileFailed] bad pattern".to_owned()).code,
            "invalidPattern"
        );
        // The kind decides, never the words of the message.
        assert_eq!(
            native_error(Error::with_kind(ErrorKind::InvalidPattern, "bad")).code,
            "invalidPattern"
        );
        assert_eq!(
            native_error(Error::with_kind(ErrorKind::PermissionDenied, "no")).code,
            "permissionDenied"
        );
        assert_eq!(
            native_error(Error::new("invalid regex: unclosed group")).code,
            "executionFailed"
        );
        assert_eq!(scan_error("boom".to_owned()).code, "executionFailed");
    }
}

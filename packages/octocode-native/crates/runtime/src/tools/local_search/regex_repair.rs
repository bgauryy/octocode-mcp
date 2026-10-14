//! Pattern validation and runnable repairs for an invalid regex.

use super::types::*;
use crate::regex_repair::{close_unclosed_group, only_pcre2_compiles, repair_alternation};
use crate::tools::id::ToolId;
use crate::tools::result::Continuation;
use crate::tools::result::ToolError;
use serde_json::json;

/// An invalid pattern, classified from the engine's typed validation
/// result (not from search error text) before walking the tree.
pub(super) fn check_pattern(query: &LocalSearchQuery) -> Result<(), ToolError> {
    let mode = query.regex_mode();
    if query.multiline == LocalSearchQueryMultiline::Off
        && mode != LocalSearchQueryRegex::Pcre2
        && octocode_engine::portable::matches_line_break(
            &query.match_string,
            mode == LocalSearchQueryRegex::Literal,
        )
    {
        return Err(line_break_pattern(query));
    }
    if mode == LocalSearchQueryRegex::Literal {
        return Ok(());
    }
    let checked = octocode_engine::portable::validate_text_pattern(
        &query.match_string,
        false,
        query.regex_mode() == LocalSearchQueryRegex::Pcre2,
    );
    if checked.valid {
        Ok(())
    } else {
        Err(invalid_regex(
            query,
            regex_error_message(&query.match_string, checked.error.as_deref()),
        ))
    }
}

/// The engine compiles `matchString` inside its own wrapper group, so the raw
/// parse error echoes that internal pattern. Report the caller's pattern and
/// the parser's reason instead.
pub(super) fn regex_error_message(match_string: &str, raw: Option<&str>) -> String {
    let reason = raw
        .and_then(|raw| {
            raw.lines()
                .rev()
                .find_map(|line| line.trim().strip_prefix("error:"))
                .map(str::trim)
                .or_else(|| Some(raw.trim()))
        })
        .filter(|reason| !reason.is_empty())
        .unwrap_or("invalid regex pattern");
    format!("Invalid regex matchString `{match_string}`: {reason}")
}

/// The caller's own fields, not the runtime-normalized ones: a fresh
/// page-1 search re-derives the same view defaults (contextLines,
/// matchContentLength, pageSize), so spelling them out only adds bytes.
fn caller_fields(query: &LocalSearchQuery) -> serde_json::Value {
    let mut repaired = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    if let Some(object) = repaired.as_object_mut() {
        object.retain(|_, value| !value.is_null());
        for cursor in ["snapshot", "page", "matchPage"] {
            object.remove(cursor);
        }
    }
    repaired
}

/// `invalidPattern` for a line break in a line-by-line search: the one
/// fact (lines are searched one at a time) and the same search with
/// `multiline:"on"` as its repair.
fn line_break_pattern(query: &LocalSearchQuery) -> ToolError {
    let mut repaired = caller_fields(query);
    repaired["multiline"] = json!("on");
    ToolError {
        next: Some(Box::new(json!({
            "repair": Continuation::new(ToolId::LocalSearch, repaired).build()
        }))),
        ..ToolError::new(
            "invalidPattern",
            format!(
                "matchString `{}` matches a line break; lines are searched one at a time unless multiline:\"on\".",
                query.match_string.replace('\n', "\\n")
            ),
        )
    }
}

/// A `language` that names no ripgrep file type. Given as a file extension
/// (`rs`), the error names the type whose files carry it and the repair runs
/// the same search with that type; otherwise the engine's own error stands.
pub(super) fn check_language(query: &LocalSearchQuery) -> Result<(), ToolError> {
    let Some(language) = query
        .language
        .as_deref()
        .filter(|language| !language.is_empty())
    else {
        return Ok(());
    };
    let mut types = ignore::types::TypesBuilder::new();
    types.add_defaults();
    let definitions = types.definitions();
    if definitions
        .iter()
        .any(|definition| definition.name() == language)
    {
        return Ok(());
    }
    let extension = language.trim_start_matches("*.").trim_start_matches('.');
    let glob = format!("*.{extension}");
    let Some(name) = definitions
        .iter()
        .find(|definition| {
            definition
                .globs()
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(&glob))
        })
        .map(|definition| definition.name().to_owned())
    else {
        return Ok(());
    };
    let mut repaired = caller_fields(query);
    repaired["language"] = json!(name);
    Err(ToolError {
        next: Some(Box::new(json!({
            "repair": Continuation::new(ToolId::LocalSearch, repaired).build()
        }))),
        ..ToolError::new(
            "invalidInput",
            format!("unrecognized file type: {language}; {glob} files are type \"{name}\"."),
        )
    })
}

/// `invalidPattern` with a literal-search repair continuation.
pub(super) fn invalid_regex(query: &LocalSearchQuery, message: String) -> ToolError {
    let mut repaired = caller_fields(query);
    let pcre2 = query.regex_mode() == LocalSearchQueryRegex::Pcre2;
    // `poll_(proceed|budget` means the group `poll_(proceed|budget)`: closing
    // it keeps every alternative anchored, where escaping the `(` would turn
    // `budget` into a bare, much broader alternative. Otherwise an alternation
    // stays a regex: a literal search for `a(|b(` matches nothing, while each
    // alternative escaped finds every anchor. The message names the pattern
    // and the reason; the repaired query is the one lead.
    let mut hints = Vec::new();
    if only_pcre2_compiles([query.match_string.as_str()], pcre2) {
        // A backreference or lookaround the Rust engine lacks: the same
        // search under PCRE2 is the repair.
        repaired["regex"] = json!("pcre2");
    } else if let Some(text) = close_unclosed_group(&query.match_string, pcre2) {
        // Closing guesses the group's end; the text as written is the other
        // reading.
        hints.push(format!(
            "The repair reads matchString as `{text}`; regex:\"literal\" matches it as written."
        ));
        repaired["matchString"] = json!(text);
    } else if let Some(text) = repair_alternation(&query.match_string, pcre2) {
        repaired["matchString"] = json!(text);
    } else if reads_as_text(&query.match_string, &message) {
        repaired["regex"] = json!("literal");
    } else {
        // Well-formed regex syntax the engine refused (a size limit, an
        // unsupported construct): a literal search for it finds nothing, so
        // no repair is offered; the message names the parser's reason.
        hints.push(
            "Regex syntax the engine refused, not stray text: simplify it; a literal search would match nothing.".into(),
        );
        return ToolError {
            hints,
            ..ToolError::new("invalidPattern", message)
        };
    }
    ToolError {
        hints,
        next: Some(Box::new(json!({
            "repair": Continuation::new(ToolId::LocalSearch, repaired).build()
        }))),
        ..ToolError::new("invalidPattern", message)
    }
}

/// Whether `text` is plausibly source text with stray metacharacters, so a
/// literal search can find it: the failure is a parse error, not a compile
/// limit, and the text uses no construct only a regex spells (a class escape
/// such as `\w`, a `{n}` repetition, or a `(?` group).
fn reads_as_text(text: &str, message: &str) -> bool {
    if message.contains("size limit") || message.contains("limit exceeded") {
        return false;
    }
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                if chars
                    .next()
                    .is_some_and(|escaped| "wWdDsSbBpPAzZhHvVRXK".contains(escaped))
                {
                    return false;
                }
            }
            '(' if chars.peek() == Some(&'?') => return false,
            '{' => {
                let mut digits = 0;
                while chars.next_if(char::is_ascii_digit).is_some() {
                    digits += 1;
                }
                if digits > 0 {
                    while chars.next_if(|c| c.is_ascii_digit() || *c == ',').is_some() {}
                    if chars.peek() == Some(&'}') {
                        return false;
                    }
                }
            }
            _ => {}
        }
    }
    true
}

#[cfg(test)]
mod repair_tests {
    use super::*;

    #[test]
    fn invalid_regex_message_shows_the_callers_pattern_not_the_wrapper() {
        let message = regex_error_message(
            "(",
            Some("regex parse error:\n    (?:()\n    ^\nerror: unclosed group"),
        );
        assert_eq!(message, "Invalid regex matchString `(`: unclosed group");
        assert!(!message.contains("(?:"));
        assert_eq!(
            regex_error_message("[", None),
            "Invalid regex matchString `[`: invalid regex pattern"
        );
    }

    /// A `\n` in a line-by-line search names the one fact and
    /// repairs to `multiline:"on"`, with no generic advice.
    #[test]
    fn a_line_break_pattern_repairs_to_multiline() {
        for (text, regex) in [("\\n", "rust"), ("a\nb", "literal")] {
            let query: LocalSearchQuery = serde_json::from_value(serde_json::json!({
                "path": ".", "matchString": text, "regex": regex, "resultView": "countLines"
            }))
            .expect("query");
            let error = check_pattern(&query).expect_err("line break rejected");
            assert_eq!(error.code, "invalidPattern", "{text}");
            assert!(
                error.message.ends_with(
                    "matches a line break; lines are searched one at a time unless multiline:\"on\"."
                ),
                "{}",
                error.message
            );
            assert!(!error.message.contains('\n'), "{}", error.message);
            assert!(error.hints.is_empty(), "{:?}", error.hints);
            let next = error.next.as_ref().expect("repair");
            let row = &next["repair"]["query"]["queries"][0];
            assert_eq!(row["multiline"], "on", "{next}");
            assert_eq!(row["matchString"], text, "{next}");
            let multiline: LocalSearchQuery =
                serde_json::from_value(row.clone()).expect("repair query");
            assert!(check_pattern(&multiline).is_ok(), "{text}");
        }
    }

    #[test]
    fn invalid_regex_repair_keeps_only_caller_fields() {
        let query: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","matchString":"(unclosed","mainGoal": "test", "reasoning":"r","page":3,"pageSize":5
        }))
        .expect("query");
        let error = invalid_regex(&query, "unclosed group".into());
        let next = error.next.expect("repair");
        let repair = &next["repair"]["query"]["queries"][0];
        assert_eq!(repair["regex"], "literal");
        assert_eq!(repair["pageSize"], 5, "caller fields survive: {repair}");
        for derived in ["contextLines", "matchContentLength", "page", "matchPage"] {
            assert!(repair.get(derived).is_none(), "{derived} leaked: {repair}");
        }
        crate::contracts::validate_query("localSearch", repair.clone())
            .expect("repair query is contract-valid");
    }

    #[test]
    fn an_invalid_alternation_is_repaired_per_alternative_not_as_one_literal() {
        let query: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","mainGoal":"g","reasoning":"r",
            "matchString":"EndProcessProperty(|SetPropertyPresence(|PropertyPresence\\.None"
        }))
        .expect("query");
        let error = invalid_regex(&query, "unclosed group".into());
        let repair = &error.next.expect("repair")["repair"]["query"]["queries"][0];
        assert_eq!(
            repair["matchString"],
            "EndProcessProperty\\(|SetPropertyPresence\\(|PropertyPresence\\.None",
            "broken alternatives are escaped, valid ones kept: {repair}"
        );
        assert!(
            repair.get("regex").is_none_or(|mode| mode == "rust"),
            "{repair}"
        );
        let text = repair["matchString"].as_str().expect("text");
        assert!(octocode_engine::portable::validate_text_pattern(text, false, false).valid);
        crate::contracts::validate_query("localSearch", repair.clone())
            .expect("repair query is contract-valid");
        // A single anchor keeps the literal repair.
        let single: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":"call("
        }))
        .expect("query");
        let error = invalid_regex(&single, "unclosed group".into());
        assert_eq!(
            error.next.expect("repair")["repair"]["query"]["queries"][0]["regex"],
            "literal"
        );
    }

    #[test]
    fn an_unclosed_group_of_bare_alternatives_is_closed_not_widened() {
        let query: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":"poll_(proceed|budget","regex":"rust"
        }))
        .expect("query");
        let error = invalid_regex(&query, "unclosed group".into());
        let repair = &error.next.expect("repair")["repair"]["query"]["queries"][0];
        assert_eq!(
            repair["matchString"], "poll_(proceed|budget)",
            "the group closes; `budget` never becomes a bare alternative: {repair}"
        );
        assert!(
            error
                .hints
                .iter()
                .any(|hint| hint.contains("regex:\"literal\"")),
            "the literal reading stays one hop away: {:?}",
            error.hints
        );
        crate::contracts::validate_query("localSearch", repair.clone())
            .expect("repair query is contract-valid");
        // Alternatives that carry call syntax keep the per-alternative escape.
        for (text, expected) in [
            (
                "capture_limited|hydrate_candidate|capture_resource(",
                "capture_limited|hydrate_candidate|capture_resource\\(",
            ),
            (
                "insert_header(\"retry-after\"|append_header(\"retry-after\"|set_body_json",
                "insert_header\\(\"retry\\-after\"|append_header\\(\"retry\\-after\"|set_body_json",
            ),
        ] {
            let repaired: LocalSearchQuery = serde_json::from_value(json!({
                "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":text,"regex":"rust"
            }))
            .expect("query");
            let error = invalid_regex(&repaired, "unclosed group".into());
            assert_eq!(
                error.next.expect("repair")["repair"]["query"]["queries"][0]["matchString"],
                expected,
                "{text}"
            );
        }
    }

    /// A construct only PCRE2 spells (backreference, lookaround) repairs to
    /// the same search with `regex:"pcre2"`, as localFetch does.
    #[test]
    fn what_only_pcre2_compiles_repairs_to_the_same_search_with_pcre2() {
        for text in [r"(\w)\1", r"(?<=a)b", r"foo(?=bar)"] {
            let query: LocalSearchQuery = serde_json::from_value(json!({
                "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":text,"regex":"rust","pageSize":5
            }))
            .expect("query");
            let error = check_pattern(&query).expect_err("rust refuses it");
            assert_eq!(error.code, "invalidPattern", "{text}");
            assert!(error.hints.is_empty(), "{text}: {:?}", error.hints);
            let next = error.next.as_ref().expect("repair");
            let repair = &next["repair"]["query"]["queries"][0];
            assert_eq!(repair["regex"], "pcre2", "{text}: {repair}");
            assert_eq!(repair["matchString"], text, "{text}: {repair}");
            assert_eq!(repair["pageSize"], 5, "caller fields survive: {repair}");
            crate::contracts::validate_query("localSearch", repair.clone())
                .expect("repair query is contract-valid");
            let repaired: LocalSearchQuery =
                serde_json::from_value(repair.clone()).expect("repair query");
            assert!(check_pattern(&repaired).is_ok(), "{text}");
        }
        // Invalid in PCRE2 too: no pcre2 retry, today's hint.
        let query: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":"(?<=a+)b","regex":"rust"
        }))
        .expect("query");
        let error = check_pattern(&query).expect_err("invalid everywhere");
        assert!(error.next.is_none(), "{:?}", error.next);
        assert!(error.hints.iter().any(|hint| hint.contains("simplify")));
    }

    /// Regex syntax the engine refused gets no literal repair a
    /// literal search could never satisfy; stray-text patterns keep it.
    #[test]
    fn refused_regex_syntax_gets_no_literal_repair() {
        // Over the Rust engine's size limit but fine for PCRE2: the repair is
        // the PCRE2 retry, never a literal search.
        let sized: LocalSearchQuery = serde_json::from_value(json!({
            "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":"(\\w{100}){100}","regex":"rust"
        }))
        .expect("query");
        let error = invalid_regex(
            &sized,
            regex_error_message("(\\w{100}){100}", Some("compiled regex exceeds size limit")),
        );
        assert_eq!(
            error.next.expect("pcre2 repair")["repair"]["query"]["queries"][0]["regex"],
            "pcre2"
        );
        for (text, regex, reason) in [
            (
                "(?<=a+)b",
                "pcre2",
                "lookbehind assertion is not fixed length",
            ),
            ("(?<=a+)b", "rust", "look-around is not supported"),
        ] {
            let query: LocalSearchQuery = serde_json::from_value(json!({
                "path":"/tmp","mainGoal":"g","reasoning":"r","matchString":text,"regex":regex
            }))
            .expect("query");
            let error = invalid_regex(&query, regex_error_message(text, Some(reason)));
            assert!(error.next.is_none(), "{text}: {:?}", error.next);
            assert!(
                error.hints.iter().any(|hint| hint.contains("simplify")),
                "{text}"
            );
        }
        assert!(reads_as_text("foo[bar", "unclosed character class"));
        assert!(reads_as_text("a{b}", "x"));
        assert!(!reads_as_text("x{2,}", "x"));
    }
}

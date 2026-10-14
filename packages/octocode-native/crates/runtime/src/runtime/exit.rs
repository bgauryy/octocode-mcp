//! Exit classification: how a finished call ended, decided once from its
//! public response so every interface reports the same status.

use super::engine::{RuntimeError, ToolOutcome};
use crate::response::rows::is_invalid_input_code;
use crate::tools::id::error_class;
use crate::tools::id::error_codes::ErrorClass;
use crate::tools::result::FailureKind;
use serde_json::Value;

/// How a call ended.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExitClass {
    /// Results, whether or not a page, a partial source read or a clasify walk
    /// remains: more to read is a continuation (`next.*`, `pagination.hasMore`),
    /// never a different outcome.
    Success,
    /// Every row ran and found nothing, even when it offers a recovery call.
    Empty,
    /// The call, or any row of it, rejected the caller's input.
    InvalidInput,
    /// Nothing succeeded.
    Failed(FailureKind),
}

impl ToolOutcome {
    #[must_use]
    pub fn exit_class(&self) -> ExitClass {
        let value = &self.structured_content;
        let rows: &[Value] = value["results"].as_array().map_or(&[], Vec::as_slice);
        if self.all_failed {
            return clasify_failure(value, self.failure).unwrap_or(match self.failure {
                Some(FailureKind::Execution) if all_rows_invalid_input(value) => {
                    ExitClass::InvalidInput
                }
                Some(kind) => ExitClass::Failed(kind),
                // A refusal with no failure kind (a gate or admission-time
                // validation) is the caller's request, never success.
                None => ExitClass::InvalidInput,
            });
        }
        // Batch precedence, worst row first: a rejected row (2), a failed
        // row (its shared failure, else execution; a retryable failure is
        // still a failure), an empty batch (1), success (0). An answering row
        // never hides a failed one.
        if rows.iter().any(is_invalid_input_row) {
            ExitClass::InvalidInput
        } else if let Some(kind) = failed_rows(rows) {
            ExitClass::Failed(kind)
        } else if !rows.is_empty() && rows.iter().all(|row| row["status"] == "empty") {
            ExitClass::Empty
        } else {
            ExitClass::Success
        }
    }
}

impl ExitClass {
    /// How a call that failed with `code` ended: the contract's class of the
    /// code (`errorCodes`), whichever interface or command reports it.
    #[must_use]
    pub fn of_code(code: &str) -> Self {
        match error_class(code) {
            ErrorClass::InvalidInput => Self::InvalidInput,
            _ => Self::Failed(failure_kind(code)),
        }
    }
}

impl RuntimeError {
    #[must_use]
    pub fn exit_class(&self) -> ExitClass {
        ExitClass::of_code(&self.code)
    }
}

/// The failure an error row with `code` reports. A rejected request is an
/// execution failure here; [`ExitClass::InvalidInput`] is decided from the
/// rows (see [`is_invalid_input_row`]).
pub(crate) fn failure_kind(code: &str) -> FailureKind {
    match error_class(code) {
        ErrorClass::NotFound => FailureKind::NotFound,
        ErrorClass::Authentication => FailureKind::Authentication,
        ErrorClass::Permission => FailureKind::Permission,
        ErrorClass::RateLimited => FailureKind::RateLimited,
        ErrorClass::InvalidInput | ErrorClass::Execution => FailureKind::Execution,
    }
}

/// A clasify call in which every resource errored: the caller's request when
/// every error rejects it; when every delegated read failed alike, that read's
/// failure; else missing sources, throttling, or an execution/provider failure.
fn clasify_failure(value: &Value, failure: Option<FailureKind>) -> Option<ExitClass> {
    let queries = value["queries"].as_array().filter(|q| !q.is_empty())?;
    let mut codes = Vec::new();
    for query in queries {
        codes.extend(error_code(query));
        for resource in query["resources"].as_array().into_iter().flatten() {
            // Compact output states a single page's `error`/`answers` on the
            // resource, and hoists one error shared by every page there while
            // the pages keep their reads: the resource always counts.
            for page in
                std::iter::once(resource).chain(resource["pages"].as_array().into_iter().flatten())
            {
                codes.extend(error_code(page));
                codes.extend(
                    page["answers"]
                        .as_object()
                        .into_iter()
                        .flat_map(|answers| answers.values())
                        .filter_map(error_code),
                );
            }
        }
    }
    if codes.is_empty() {
        return None;
    }
    let all = |class: ErrorClass| codes.iter().all(|code| error_class(code) == class);
    Some(if all(ErrorClass::InvalidInput) {
        ExitClass::InvalidInput
    } else if let Some(failure) = failure {
        ExitClass::Failed(failure)
    } else if all(ErrorClass::NotFound) {
        ExitClass::Failed(FailureKind::NotFound)
    } else if all(ErrorClass::RateLimited) {
        ExitClass::Failed(FailureKind::RateLimited)
    } else {
        ExitClass::Failed(FailureKind::Execution)
    })
}

fn error_code(value: &Value) -> Option<&str> {
    value.pointer("/error/errorCode").and_then(Value::as_str)
}

/// An error row whose `errorCode` rejects the caller's input.
fn is_invalid_input_row(row: &Value) -> bool {
    row["status"] == "error"
        && row
            .pointer("/data/errorCode")
            .and_then(Value::as_str)
            .is_some_and(is_invalid_input_code)
}

/// The failure of a batch's error rows: their shared failure, else an
/// execution failure.
fn failed_rows(rows: &[Value]) -> Option<FailureKind> {
    let mut kinds = rows
        .iter()
        .filter(|row| row["status"] == "error")
        .map(|row| {
            row.pointer("/data/errorCode")
                .and_then(Value::as_str)
                .map_or(FailureKind::Execution, failure_kind)
        });
    let first = kinds.next()?;
    Some(if kinds.all(|kind| kind == first) {
        first
    } else {
        FailureKind::Execution
    })
}

fn all_rows_invalid_input(value: &Value) -> bool {
    value["results"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty() && rows.iter().all(is_invalid_input_row))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_local_path_is_not_found_other_errors_are_execution() {
        assert_eq!(failure_kind("pathNotFound"), FailureKind::NotFound);
        assert_eq!(failure_kind("notFound"), FailureKind::NotFound);
        assert_eq!(failure_kind("versionNotFound"), FailureKind::NotFound);
        assert_eq!(failure_kind("fileAccessFailed"), FailureKind::Execution);
    }

    #[test]
    fn clasify_whose_every_read_failed_exits_like_that_read() {
        let not_found = Some(ExitClass::Failed(FailureKind::NotFound));
        let execution = Some(ExitClass::Failed(FailureKind::Execution));
        let failed = |code: &str| {
            json!({"queries":[{"id":"q","resources":[{"id":"x","coverage":"error",
                "pages":[{"error":{"errorCode":code,"error":"m"}}]}]}]})
        };
        // localFetch reports a missing file as pathNotFound + NotFound.
        let missing = failed("pathNotFound");
        assert_eq!(
            clasify_failure(&missing, Some(FailureKind::NotFound)),
            not_found
        );
        assert_eq!(clasify_failure(&missing, None), not_found);
        assert_eq!(
            clasify_failure(&failed("fileAccessFailed"), None),
            execution
        );
        // Compact output: a single failed page is stated on the resource.
        let compact = |code: &str| {
            json!({"queries":[{"id":"q","resources":[{"id":"x","coverage":"error",
                "answers":{"q":{"error":{"errorCode":code,"error":"m"}}}}]}]})
        };
        assert_eq!(
            clasify_failure(&compact("classificationProviderError"), None),
            execution
        );
        assert_eq!(clasify_failure(&compact("pathNotFound"), None), not_found);
        assert_eq!(
            clasify_failure(&failed("rateLimited"), Some(FailureKind::RateLimited)),
            Some(ExitClass::Failed(FailureKind::RateLimited))
        );
        assert_eq!(
            clasify_failure(&failed("rateLimited"), None),
            Some(ExitClass::Failed(FailureKind::RateLimited))
        );
        assert_eq!(
            clasify_failure(
                &failed("classificationLocateUnsupported"),
                Some(FailureKind::NotFound)
            ),
            Some(ExitClass::InvalidInput),
            "a rejected request stays a caller error"
        );
        assert_eq!(clasify_failure(&json!({"queries":[]}), None), None);
        // Compact output hoists one shared page error to the resource
        // while pages keep their `next.read`; the resource error still counts.
        let hoisted = json!({"queries":[{"id":"q","resources":[{"id":"s",
            "error":{"errorCode":"classificationQuotaExhausted","error":"m"},
            "pages":[{"lines":[1,9],"next":{"read":{"tool":"localFetch",
                "query":{"queries":[{"path":"a.rs"}]}}}}]}]}]});
        assert_eq!(clasify_failure(&hoisted, None), execution);
    }

    /// A directory given to a file read (or a file to a listing) is
    /// the caller's mistake: exit 2, not an execution failure.
    #[test]
    fn not_a_file_and_not_a_directory_are_invalid_input() {
        for code in ["notAFile", "notADirectory"] {
            let row = json!({"results":[{"status":"error","data":{"errorCode":code}}]});
            assert!(all_rows_invalid_input(&row), "{code}");
            assert_eq!(
                outcome(row, Some(FailureKind::Execution), true).exit_class(),
                ExitClass::InvalidInput,
                "{code}"
            );
        }
    }

    /// The contract's `errorCodes` table decides every exit; one code,
    /// one class, whichever tool or runtime layer reports it.
    #[test]
    fn every_declared_code_maps_to_one_exit_class() {
        use crate::tools::id::error_codes::ALL;
        assert!(!ALL.is_empty());
        for (code, class) in ALL {
            assert!(
                code.chars().all(|c| c.is_ascii_alphanumeric())
                    && code.starts_with(|c: char| c.is_ascii_lowercase()),
                "{code} is not camelCase"
            );
            let expected = match class {
                ErrorClass::InvalidInput => ExitClass::InvalidInput,
                ErrorClass::NotFound => ExitClass::Failed(FailureKind::NotFound),
                ErrorClass::Authentication => ExitClass::Failed(FailureKind::Authentication),
                ErrorClass::Permission => ExitClass::Failed(FailureKind::Permission),
                ErrorClass::RateLimited => ExitClass::Failed(FailureKind::RateLimited),
                ErrorClass::Execution => ExitClass::Failed(FailureKind::Execution),
            };
            let row = json!({"results":[{"status":"error","data":{"errorCode":code}}]});
            assert_eq!(
                outcome(row, Some(failure_kind(code)), true).exit_class(),
                expected,
                "{code}"
            );
            let runtime = RuntimeError::new(code, "m");
            assert_eq!(runtime.exit_class(), expected, "runtime {code}");
        }
        // No suffix or prefix matching: an undeclared spelling has no class.
        for undeclared in ["ast.language.required", "x.input.invalid", "lsp.timeout"] {
            assert_eq!(failure_kind(undeclared), FailureKind::Execution);
            assert!(!is_invalid_input_code(undeclared), "{undeclared}");
        }
    }

    #[test]
    fn rows_rejecting_caller_input_are_invalid_input() {
        let rows = json!({"results":[
            {"status":"error","data":{"errorCode":"invalidPattern"}},
            {"status":"error","data":{"errorCode":"invalidInput"}}
        ]});
        assert!(all_rows_invalid_input(&rows));
        let mixed = json!({"results":[
            {"status":"error","data":{"errorCode":"invalidPattern"}},
            {"status":"error","data":{"errorCode":"fileAccessFailed"}}
        ]});
        assert!(!all_rows_invalid_input(&mixed));
        assert!(!all_rows_invalid_input(&json!({"results":[]})));
    }

    fn outcome(
        structured_content: Value,
        failure: Option<FailureKind>,
        all_failed: bool,
    ) -> ToolOutcome {
        ToolOutcome {
            structured_content,
            content: Vec::new(),
            source_digest: None,
            failure,
            all_failed,
        }
    }

    #[test]
    fn outcomes_classify_by_their_rows() {
        let row = |status: &str, code: &str| json!({"status":status,"data":{"errorCode":code}});
        let retry_row = |code: &str| {
            json!({"status":"error","data":{"errorCode":code,"retryable":true,
                "next":{"retry":{"tool":"ghSearchRepo","query":{"queries":[{}]}}}}})
        };
        let page_row = json!({"status":"success","data":{"next":{"nextPage":{
            "tool":"localSearch","query":{"queries":[{}]}}}}});
        let stale_row = json!({"results":[{"status":"error","data":{"errorCode":"staleSnapshot",
            "next":{"restart":{"tool":"localSearch","query":{}}}}}]});
        let cases = [
            (
                json!({"results":[{"data":{}}]}),
                None,
                false,
                ExitClass::Success,
            ),
            (
                json!({"results":[row("empty", "")]}),
                None,
                false,
                ExitClass::Empty,
            ),
            (
                json!({"results":[{"data":{}}, row("error", "invalidInput")]}),
                None,
                false,
                ExitClass::InvalidInput,
            ),
            (
                json!({"results":[{"data":{}}],"responsePagination":{"hasMore":true}}),
                None,
                false,
                ExitClass::Success,
            ),
            (
                json!({"results":[row("error", "invalidPattern")]}),
                Some(FailureKind::Execution),
                true,
                ExitClass::InvalidInput,
            ),
            (
                json!({"results":[row("error", "pathNotFound")]}),
                Some(FailureKind::NotFound),
                true,
                ExitClass::Failed(FailureKind::NotFound),
            ),
            (
                json!({"results":[row("error", "fileAccessFailed")]}),
                Some(FailureKind::Execution),
                true,
                ExitClass::Failed(FailureKind::Execution),
            ),
            (json!({"results":[]}), None, true, ExitClass::InvalidInput),
            // No row succeeded, so the batch failed like its error rows.
            (
                json!({"results":[row("empty", ""), row("error", "pathNotFound")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::NotFound),
            ),
            (
                json!({"results":[row("empty", ""), row("error", "pathNotFound"),
                    row("error", "fileAccessFailed")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::Execution),
            ),
            // A failed row is never hidden by an answering one, whichever
            // order the batch lists them in.
            (
                json!({"results":[{"data":{}}, row("error", "pathNotFound")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::NotFound),
            ),
            (
                json!({"results":[row("error", "pathNotFound"), {"data":{}}]}),
                None,
                false,
                ExitClass::Failed(FailureKind::NotFound),
            ),
            (
                json!({"results":[page_row.clone(), row("error", "pathNotFound")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::NotFound),
            ),
            (
                json!({"results":[{"data":{}}, row("error", "pathNotFound"),
                    row("error", "fileAccessFailed")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::Execution),
            ),
            // A rejected row outranks every failed row (the documented 2).
            (
                json!({"results":[row("error", "pathNotFound"), row("error", "invalidInput")]}),
                None,
                false,
                ExitClass::InvalidInput,
            ),
            (
                json!({"results":[row("error", "invalidInput"), row("error", "pathNotFound")]}),
                None,
                false,
                ExitClass::InvalidInput,
            ),
            // A remaining page, a partial read or a pending clasify walk
            // is success; the continuation is the page's `next.*`.
            (
                json!({"results":[{"data":{}}, page_row.clone()]}),
                None,
                false,
                ExitClass::Success,
            ),
            (
                json!({"results":[page_row.clone()]}),
                None,
                false,
                ExitClass::Success,
            ),
            (
                json!({"results":[{"status":"success","data":{"isPartial":true,"content":"x"}}]}),
                None,
                false,
                ExitClass::Success,
            ),
            (
                json!({"queries":[{"id":"b","results":[],
                    "next":{"clasify":{"queries":[{"id":"b","resources":[]}]}}}]}),
                None,
                false,
                ExitClass::Success,
            ),
            // A stale snapshot is an error row: exit 5, alone or beside
            // answering rows, even when a healthy page is offered.
            (
                stale_row.clone(),
                Some(FailureKind::Execution),
                true,
                ExitClass::Failed(FailureKind::Execution),
            ),
            (
                json!({"results":[page_row.clone(), stale_row["results"][0].clone()]}),
                None,
                false,
                ExitClass::Failed(FailureKind::Execution),
            ),
            // A retryable failure (`next.retry`) is still a failure: it keeps
            // its own exit whether the other rows answered or found nothing.
            (
                json!({"results":[{"data":{}}, retry_row("rateLimited")]}),
                None,
                false,
                ExitClass::Failed(FailureKind::RateLimited),
            ),
            (
                json!({"results":[row("empty", ""), retry_row("server")]}),
                None,
                false,
                ExitClass::Failed(failure_kind("server")),
            ),
            (
                json!({"results":[retry_row("rateLimited")]}),
                Some(FailureKind::RateLimited),
                true,
                ExitClass::Failed(FailureKind::RateLimited),
            ),
        ];
        for (value, failure, all_failed, expected) in cases {
            assert_eq!(
                outcome(value.clone(), failure, all_failed).exit_class(),
                expected,
                "{value}"
            );
        }
    }
}

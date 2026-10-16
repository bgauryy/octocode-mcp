//! Panic-safe, transport-neutral entry points shared by Rust consumers.

use crate::error::{Error, Result};
use crate::security::types::SanitizationResult;
use crate::types::{
    FileSystemQueryOptions, FileSystemQueryResult, GrammarCapability, TextSearchOptions,
    TextSearchResult, YamlConversionConfig,
};

pub use crate::search::text_pattern::{
    TextPatternValidationResult, matches_line_break, validate_text_pattern,
};
pub use crate::signatures::{
    extract_declarations, extract_declarations_with_extension, extract_graph_facts,
};
pub use crate::text::diff_parser::filter_patch;

/// Contain a panic from a fallible engine entry point at the transport-neutral
/// boundary. An unguarded panic here (deep in a parser or filesystem walk on
/// pathological input) would unwind into the caller, and across the runtime
/// addon's FFI boundary it aborts the host process. Converting it to an `Err`
/// keeps the failure catchable. Inner implementations that already guard are
/// unaffected — a nested `catch_unwind` is harmless.
fn guard_panic<T>(what: &str, call: impl FnOnce() -> Result<T>) -> Result<T> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(call))
        .unwrap_or_else(|_| Err(Error::new(format!("{what} failed on pathological input"))))
}

#[must_use]
pub fn apply_content_view_minification(content: &str, file_path: &str) -> String {
    let file_path = file_path.to_owned();
    transform_on_deep_stack(content, move |content| {
        crate::minify::apply::apply_content_view_minification_inner(content, &file_path)
    })
}

/// Run a content transform on the deep-stack pool. A panic or an unavailable
/// pool yields `None` there, so the caller gets the original content rather
/// than `String::default()`, an empty view.
fn transform_on_deep_stack(
    content: &str,
    transform: impl FnOnce(&str) -> String + Send + 'static,
) -> String {
    let shared: std::sync::Arc<str> = content.into();
    let job_content = std::sync::Arc::clone(&shared);
    crate::signatures::run_on_deep_stack(move || Some(transform(&job_content)))
        .unwrap_or_else(|| shared.to_string())
}

pub use crate::search::fs_query::{EntryFilter, Visit};

/// Walk a directory in name order under caller policy: `admit` decides each
/// descendant before it is inspected or counted (a denied directory is not
/// entered); `stop` cancels the walk (`ErrorKind::Cancelled`).
pub fn query_file_system(
    options: FileSystemQueryOptions,
    admit: &EntryFilter<'_>,
    stop: &crate::search::walk::Stop<'_>,
) -> Result<FileSystemQueryResult> {
    guard_panic("filesystem query", || {
        crate::search::fs_query::query_file_system(options, admit, stop)
    })
}

pub use crate::search::pcre2_ranges::{Pcre2RangesError, pcre2_find_ranges};
pub use crate::search::rust_ranges::{RustRangesError, rust_find_ranges};
pub use crate::search::text_search::TextSearchPathFilter;

/// Text search restricted by `path_filter` that stops walking at the next
/// entry once `cancelled` returns true; the partial result carries `capReason`
/// `cancelled`.
pub fn search_text_cancellable(
    options: TextSearchOptions,
    path_filter: std::sync::Arc<dyn TextSearchPathFilter>,
    cancelled: &(dyn Fn() -> bool + Sync),
) -> Result<TextSearchResult> {
    guard_panic("text search", || {
        crate::search::text_search::search_cancellable(options, path_filter, cancelled)
    })
}

pub fn sanitize_content(content: &str, file_path: Option<&str>) -> Result<SanitizationResult> {
    std::panic::catch_unwind(|| crate::security::sanitizer::sanitize_content(content, file_path))
        .map_err(|_| Error::new("content sanitization failed on pathological input"))
}

/// [`sanitize_content`] for a string leaf of a result about the file at
/// `source_path`: the path tells the language only, so source code is not
/// mistaken for configuration syntax while every other pattern applies exactly
/// as in the pathless output net.
pub fn sanitize_leaf(content: &str, source_path: &str) -> Result<SanitizationResult> {
    std::panic::catch_unwind(|| crate::security::sanitizer::sanitize_leaf(content, source_path))
        .map_err(|_| Error::new("content sanitization failed on pathological input"))
}

/// The symbols outline of `content`, or the typed reason it has none.
pub fn extract_signatures(
    content: &str,
    file_path: &str,
) -> std::result::Result<String, crate::signatures::OutlineUnavailable> {
    let content = content.to_owned();
    let file_path = file_path.to_owned();
    // The pool's fallback (no pool, a panic) is `None`: no tree.
    crate::signatures::run_on_deep_stack(move || {
        Some(crate::signatures::extract_signatures_inner(
            &content, &file_path,
        ))
    })
    .unwrap_or(Err(crate::signatures::OutlineUnavailable::ParseFailed))
}

/// The grammar inventory, built once.
#[must_use]
pub fn grammar_capabilities() -> &'static [GrammarCapability] {
    static CAPABILITIES: std::sync::LazyLock<Vec<GrammarCapability>> =
        std::sync::LazyLock::new(build_grammar_capabilities);
    &CAPABILITIES
}

fn build_grammar_capabilities() -> Vec<GrammarCapability> {
    crate::signatures::languages::all_entries()
        .iter()
        .map(|entry| GrammarCapability {
            language: entry.name.to_owned(),
            language_id: entry.language_id.map(str::to_owned),
            selector_aliases: entry
                .selector_aliases
                .iter()
                .map(|alias| (*alias).to_owned())
                .collect(),
            extensions: entry
                .extensions
                .iter()
                .map(|extension| (*extension).to_owned())
                .collect(),
            structural_search: true,
            signature_outline: !entry.body_query.is_empty(),
            graph_facts: !entry.body_query.is_empty(),
        })
        .collect()
}

/// Structural search of one source. `extension` selects the grammar (an
/// explicit parser for an ambiguous path); `None` takes the path's own
/// extension. The real path stays in match IDs, diagnostics and locations.
pub fn structural_search_detailed(
    content: &str,
    file_path: &str,
    extension: Option<&str>,
    pattern: Option<&str>,
    rule: Option<&str>,
) -> Result<crate::structural::StructuralSearchDetailedResult> {
    let extension = extension.map_or_else(
        || crate::text::file_extension::extension_of(file_path, true, "txt"),
        str::to_owned,
    );
    std::panic::catch_unwind(|| {
        crate::structural::search_detailed(content, file_path, &extension, pattern, rule)
    })
    .map_err(|_| Error::new("structural detailed search failed on pathological input"))
}

pub fn inspect_syntax_tree_with_extension(
    content: &str,
    file_path: &str,
    extension: Option<&str>,
    options: Option<crate::structural::SyntaxTreeInspectOptions>,
) -> Result<crate::structural::SyntaxTreeInspectResult> {
    std::panic::catch_unwind(|| {
        crate::structural::inspect_with_extension(content, file_path, extension, options)
    })
    .map_err(|_| Error::new("syntax-tree inspection failed on pathological input"))
}

#[must_use]
pub fn json_to_yaml_string(
    value: serde_json::Value,
    config: Option<YamlConversionConfig>,
) -> String {
    let sort_keys = config
        .as_ref()
        .and_then(|value| value.sort_keys)
        .unwrap_or(false);
    let priority = config
        .as_ref()
        .and_then(|value| value.keys_priority.as_deref())
        .map(<[_]>::to_vec)
        .unwrap_or_default();
    crate::text::yaml_utils::json_to_yaml_string_inner(value, sort_keys, &priority)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A transform that panics (or a pool that cannot run it)
    /// yields the original content, never an empty content view.
    #[test]
    fn failed_deep_stack_transform_returns_the_original_content() {
        let out = transform_on_deep_stack("fn keep() {}", |_| panic!("minifier bug"));
        assert_eq!(out, "fn keep() {}");
        assert_eq!(
            transform_on_deep_stack("a  b", |content| content.replace("  ", " ")),
            "a b"
        );
    }
}

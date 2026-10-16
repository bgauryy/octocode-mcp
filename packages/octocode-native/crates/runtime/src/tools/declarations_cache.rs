//! Reuse single-file extraction (and the rendered symbols view) across
//! outline pages. Authorization and source
//! decoding happen in the caller on every request; the key uses the decoded
//! content, canonical path and the parser extension actually used (none for
//! the file's own grammar), rather than mutable timestamps.

use crate::cache::{CacheClass, CacheConfig, CacheKey, Store};
use std::sync::{Arc, OnceLock};

static CACHE: OnceLock<Store<String>> = OnceLock::new();

/// The declarations `extraction` produces for `source` at `canonical_path`,
/// once per source version. `parser` is the extension whose grammar parses
/// the source; `None` is the file's own. Every override keeps its own entry.
pub(crate) fn extract(
    source: &str,
    canonical_path: &str,
    parser: Option<&str>,
    extraction: impl FnOnce() -> Option<String>,
) -> Option<Arc<String>> {
    // A parser extension never contains `/`, so `auto` cannot collide with one.
    let parser = parser.map_or_else(|| "auto".to_owned(), |extension| format!("ext/{extension}"));
    let key = CacheKey {
        namespace: "ast-declarations".into(),
        scope: format!("{parser}\0{canonical_path}"),
        resource: crate::digest::sha256(source.as_bytes()),
    };
    let cache = CACHE.get_or_init(|| {
        Store::new(
            CacheConfig {
                max_entries: 128,
                max_bytes: 32 * 1024 * 1024,
                ..CacheConfig::default()
            },
            None,
        )
    });
    if let Some(hit) = cache.get(&key) {
        return Some(hit.value);
    }
    // Extraction can block or time out. Never hold the cache lock while
    // parsing, and never retain failed extraction as a successful empty outline.
    let raw = extraction()?;
    let bytes = raw.len() + canonical_path.len() + key.resource.len();
    // Keyed by the source digest, so an entry never goes stale. The stored
    // value is the one returned: no copy, no second lookup.
    Some(cache.put(key, raw, bytes, CacheClass::Immutable))
}

/// One declaration of the engine outline, 1-based lines.
pub(crate) struct Declared {
    pub(crate) name: String,
    pub(crate) kind: String,
    pub(crate) doc_start: Option<usize>,
    /// Its name line.
    pub(crate) line: usize,
    pub(crate) start: usize,
    pub(crate) end: usize,
}

/// Every declaration the engine outlines, one-line ones included, in
/// outline order; `None` when the file type has no outline.
pub(crate) fn all_declarations(content: &str, path: &str) -> Option<Vec<Declared>> {
    // Shared with outline pages and search hits: one parse per file version.
    let raw = crate::tools::declarations_cache::extract(content, path, None, || {
        octocode_engine::portable::extract_declarations(content, path)
    })?;
    let facts: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let line = |declaration: &serde_json::Value, pointer: &str| {
        declaration
            .pointer(pointer)
            .and_then(serde_json::Value::as_u64)
            .and_then(|line| usize::try_from(line).ok())
            .map(|line| line + 1)
    };
    Some(
        facts["declarations"]
            .as_array()?
            .iter()
            .filter_map(|declaration| {
                let start = line(declaration, "/range/start/line")?;
                Some(Declared {
                    name: declaration["name"].as_str().unwrap_or_default().to_owned(),
                    kind: declaration["kind"].as_str().unwrap_or_default().to_owned(),
                    doc_start: declaration["docLine"]
                        .as_u64()
                        .and_then(|line| usize::try_from(line).ok())
                        .map(|line| line + 1),
                    line: line(declaration, "/selectionRange/start/line").unwrap_or(start),
                    start,
                    end: line(declaration, "/range/end/line")?,
                })
            })
            .collect(),
    )
}

/// The symbols view of one source version: the outline, or why it has
/// none, and the parse-recovery note the outline carries. Every field is
/// rendered from the source after secret redaction, so neither the memory
/// nor the disk tier ever holds a secret the response would redact.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SymbolsView {
    pub(crate) outline: Result<String, octocode_engine::signatures::OutlineUnavailable>,
    /// Why the outline may miss declarations (a recovered parse).
    pub(crate) warning: Option<String>,
    /// The source lines (1-based, ascending) the redaction changed, with
    /// the placeholders each gained: a page states how many it shows.
    pub(crate) redacted_lines: Vec<(usize, usize)>,
}

/// Rendered views outlive one process under persistent storage: a CLI
/// paging an outline renders it once, not once per page. Bump the version
/// when the rendered view changes shape; a release changes the scope.
/// v2: views render from redacted text (v1 files held raw secrets and are
/// never read again).
const SYMBOLS_NAMESPACE: &str = "symbols-view/v2";

static SYMBOLS: OnceLock<Store<SymbolsView>> = OnceLock::new();
static SYMBOLS_DISK: OnceLock<std::path::PathBuf> = OnceLock::new();

/// Keep rendered symbols views in `dir` too, across processes. The runtime
/// calls it once, before any read, when storage is persistent; a later
/// call (or one after the first view) changes nothing.
pub(crate) fn persist_symbols_views(dir: std::path::PathBuf) {
    let _ = SYMBOLS_DISK.set(dir);
}

/// The process's symbols views: in memory, and on disk once
/// [`persist_symbols_views`] named a directory.
pub(crate) fn symbols_store() -> &'static Store<SymbolsView> {
    SYMBOLS.get_or_init(|| {
        Store::new(
            CacheConfig {
                max_entries: 64,
                max_bytes: 32 * 1024 * 1024,
                disk_bytes: 256 * 1024 * 1024,
            },
            SYMBOLS_DISK.get().cloned(),
        )
    })
}

/// The `minify:"symbols"` view of `source` at `path` in `store`: rendered
/// once per source version and reused by every outline page. A missing
/// outline is a verdict of the same version, so it is kept too. `render`
/// must build the view from redacted text: what it returns is kept, on
/// disk too.
pub(crate) fn symbols_view(
    store: &Store<SymbolsView>,
    source: &str,
    path: &str,
    render: impl FnOnce() -> SymbolsView,
) -> Arc<SymbolsView> {
    let key = CacheKey {
        namespace: SYMBOLS_NAMESPACE.into(),
        scope: format!("{}\0{path}", env!("CARGO_PKG_VERSION")),
        resource: crate::digest::sha256(source.as_bytes()),
    };
    if let Some(hit) = store.get(&key) {
        return hit.value;
    }
    let view = render();
    let bytes = view.outline.as_ref().map_or(0, String::len)
        + view.warning.as_ref().map_or(0, String::len)
        + view.redacted_lines.len() * 2 * std::mem::size_of::<usize>()
        + path.len()
        + key.resource.len();
    store.put(key, view, bytes, CacheClass::Immutable)
}

#[cfg(test)]
mod tests {
    use super::{extract, symbols_store, symbols_view};
    use octocode_engine::signatures::OutlineUnavailable;

    /// One render per source version, a missing outline included.
    #[test]
    fn symbols_views_and_their_verdicts_render_once_per_version() {
        let calls = Cell::new(0);
        let path = format!("symbols-cache-test-{}", std::process::id());
        let render = |outline| {
            calls.set(calls.get() + 1);
            super::SymbolsView {
                outline,
                warning: None,
                redacted_lines: Vec::new(),
            }
        };
        let first = symbols_view(symbols_store(), "fn a() {}", &path, || {
            render(Ok("1\tfn a()".into()))
        });
        let again = symbols_view(symbols_store(), "fn a() {}", &path, || {
            render(Ok("other".into()))
        });
        assert!(std::sync::Arc::ptr_eq(&first, &again));
        let missing = || render(Err(OutlineUnavailable::NotSmaller));
        assert_eq!(
            symbols_view(symbols_store(), "x", &path, missing).outline,
            Err(OutlineUnavailable::NotSmaller)
        );
        assert_eq!(
            symbols_view(symbols_store(), "x", &path, missing).outline,
            Err(OutlineUnavailable::NotSmaller)
        );
        assert_eq!(calls.get(), 2);
    }

    /// A view stored on disk is read back by a fresh store (another
    /// process): the outline renders once across processes.
    #[test]
    fn symbols_views_persist_across_stores() {
        let dir = tempfile::tempdir().expect("dir");
        let store = || {
            crate::cache::Store::new(
                crate::cache::CacheConfig::default(),
                Some(dir.path().to_owned()),
            )
        };
        let calls = Cell::new(0);
        let render = || {
            calls.set(calls.get() + 1);
            super::SymbolsView {
                outline: Ok("1\tfn a()\n".into()),
                warning: Some("recovered".into()),
                redacted_lines: vec![(1, 1)],
            }
        };
        let first = super::symbols_view(&store(), "fn a() {}", "a.rs", render);
        let again = super::symbols_view(&store(), "fn a() {}", "a.rs", render);
        assert_eq!(first, again);
        assert_eq!(calls.get(), 1);
    }
    use std::cell::Cell;

    #[test]
    fn content_path_and_parser_identity_control_reuse() {
        let calls = Cell::new(0);
        let parse = || {
            calls.set(calls.get() + 1);
            Some("declarations".to_owned())
        };
        let path = format!("cache-test-{}", std::process::id());
        let first = extract("fn one() {}", &path, None, parse).unwrap();
        let second = extract("fn one() {}", &path, None, parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&first, &second));
        assert_eq!(calls.get(), 1);
        extract("fn two() {}", &path, None, parse).unwrap();
        extract("fn one() {}", &format!("{path}-other"), None, parse).unwrap();
        extract("fn one() {}", &path, Some("cpp"), parse).unwrap();
        assert_eq!(calls.get(), 4);
    }

    /// Each parser override keys its own entry: the same override reuses
    /// it, another one parses again.
    #[test]
    fn every_parser_override_keys_its_own_entry() {
        let calls = Cell::new(0);
        let parse = || {
            calls.set(calls.get() + 1);
            Some(format!("declarations{}", calls.get()))
        };
        let path = format!("override-cache-test-{}", std::process::id());
        let py = extract("x = 1", &path, Some("py"), parse).unwrap();
        let again = extract("x = 1", &path, Some("py"), parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&py, &again));
        assert_eq!(calls.get(), 1);
        let rb = extract("x = 1", &path, Some("rb"), parse).unwrap();
        assert_eq!(rb.as_str(), "declarations2");
        let own = extract("x = 1", &path, None, parse).unwrap();
        assert_eq!(own.as_str(), "declarations3");
        let cpp = extract("x = 1", &path, Some("cpp"), parse).unwrap();
        let again = extract("x = 1", &path, Some("cpp"), parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&cpp, &again));
        assert_eq!(calls.get(), 4);
    }

    #[test]
    fn failed_extraction_is_not_cached() {
        let path = format!("failed-cache-test-{}", std::process::id());
        assert!(extract("source", &path, None, || None).is_none());
        assert_eq!(
            extract("source", &path, None, || Some("retry".into()))
                .as_deref()
                .map(String::as_str),
            Some("retry")
        );
    }
}

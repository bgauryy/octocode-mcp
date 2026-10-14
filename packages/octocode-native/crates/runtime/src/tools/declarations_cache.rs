//! Reuse single-file extraction across outline pages. Authorization and source
//! decoding happen in the caller on every request; the key uses the decoded
//! content, canonical path and the parser extension actually used (none for
//! the file's own grammar), rather than mutable timestamps.

use crate::cache::{CacheClass, CacheConfig, CacheKey, Store};
use std::sync::{Arc, OnceLock};

static CACHE: OnceLock<Store<String>> = OnceLock::new();

/// Parse under the file's own grammar, or as C++ for a header override.
pub(crate) fn extract(
    source: &str,
    canonical_path: &str,
    cpp_header: bool,
    extraction: impl FnOnce() -> Option<String>,
) -> Option<Arc<String>> {
    extract_as(
        source,
        canonical_path,
        cpp_header.then_some("cpp"),
        extraction,
    )
}

/// `parser` is the extension whose grammar parses the source; `None` is the
/// file's own. Every override keeps its own entry.
pub(crate) fn extract_as(
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

#[cfg(test)]
mod tests {
    use super::{extract, extract_as};
    use std::cell::Cell;

    #[test]
    fn content_path_and_parser_identity_control_reuse() {
        let calls = Cell::new(0);
        let parse = || {
            calls.set(calls.get() + 1);
            Some("declarations".to_owned())
        };
        let path = format!("cache-test-{}", std::process::id());
        let first = extract("fn one() {}", &path, false, parse).unwrap();
        let second = extract("fn one() {}", &path, false, parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&first, &second));
        assert_eq!(calls.get(), 1);
        extract("fn two() {}", &path, false, parse).unwrap();
        extract("fn one() {}", &format!("{path}-other"), false, parse).unwrap();
        extract("fn one() {}", &path, true, parse).unwrap();
        assert_eq!(calls.get(), 4);
    }

    /// Each parser override keys its own entry: the same override reuses
    /// it, another one parses again, and the header path shares `cpp`.
    #[test]
    fn every_parser_override_keys_its_own_entry() {
        let calls = Cell::new(0);
        let parse = || {
            calls.set(calls.get() + 1);
            Some(format!("declarations{}", calls.get()))
        };
        let path = format!("override-cache-test-{}", std::process::id());
        let py = extract_as("x = 1", &path, Some("py"), parse).unwrap();
        let again = extract_as("x = 1", &path, Some("py"), parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&py, &again));
        assert_eq!(calls.get(), 1);
        let rb = extract_as("x = 1", &path, Some("rb"), parse).unwrap();
        assert_eq!(rb.as_str(), "declarations2");
        let own = extract_as("x = 1", &path, None, parse).unwrap();
        assert_eq!(own.as_str(), "declarations3");
        let cpp = extract_as("x = 1", &path, Some("cpp"), parse).unwrap();
        let header = extract("x = 1", &path, true, parse).unwrap();
        assert!(std::sync::Arc::ptr_eq(&cpp, &header));
        assert_eq!(calls.get(), 4);
    }

    #[test]
    fn failed_extraction_is_not_cached() {
        let path = format!("failed-cache-test-{}", std::process::id());
        assert!(extract("source", &path, false, || None).is_none());
        assert_eq!(
            extract("source", &path, false, || Some("retry".into()))
                .as_deref()
                .map(String::as_str),
            Some("retry")
        );
    }
}

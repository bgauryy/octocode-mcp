//! The `lspSearch` lead other tools offer for a declaration they found.
use octocode_engine::lsp::config::{
    LspDiscoveryOptions, default_server_for_file, is_command_available,
};
use octocode_engine::lsp::workspace::resolve_workspace_root_for_file;
use serde_json::{Value, json};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

type ProbeKey = (String, String, u64);
const MAX_PROBES: usize = 128;
const NEGATIVE_TTL: Duration = Duration::from_secs(5);
const POSITIVE_TTL: Duration = Duration::from_secs(300);

/// Server availability per probe: a positive answer lives
/// [`POSITIVE_TTL`], a negative one [`NEGATIVE_TTL`].
pub(crate) struct LeadProbeCache(octocode_io::memo::Memo<ProbeKey, bool>);

impl Default for LeadProbeCache {
    fn default() -> Self {
        Self(octocode_io::memo::Memo::new(
            octocode_io::memo::MemoLimits {
                max_entries: MAX_PROBES,
                max_weight: MAX_PROBES,
                keep_newest: false,
            },
        ))
    }
}

impl std::fmt::Debug for LeadProbeCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LeadProbeCache")
            .field("probes", &self.0.len())
            .finish()
    }
}

impl LeadProbeCache {
    fn get(&self, key: &ProbeKey) -> Option<bool> {
        self.0.get(key).map(|hit| *hit.value)
    }

    fn insert(&self, key: ProbeKey, available: bool, observed: Instant) {
        let ttl = if available {
            POSITIVE_TTL
        } else {
            NEGATIVE_TTL
        };
        self.0
            .insert_full(key, available, (), 1, Some(ttl), observed);
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.0.len()
    }
}

/// What a lead asks about the declaration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Verify {
    /// Its call sites, each with the enclosing caller.
    Callers,
    /// Every reference, calls or not.
    References,
}

impl Verify {
    /// `Callers` for a callable declaration kind, `References` otherwise.
    #[must_use]
    pub fn for_kind(kind: &str) -> Self {
        match kind {
            "function" | "method" | "fn" | "constructor" | "def" | "func" => Self::Callers,
            _ => Self::References,
        }
    }

    fn operation(self) -> &'static str {
        match self {
            Self::Callers => "callers",
            Self::References => "references",
        }
    }
}

/// The lead name of a [`verify_query`] row: `findCallers` or
/// `findReferences`.
pub(crate) fn lead_name(row: &Value) -> String {
    match row.get("operation").and_then(Value::as_str) {
        Some("callers") => "findCallers",
        _ => "findReferences",
    }
    .to_owned()
}

/// The `lspSearch` query row for the declaration `symbol` at one-based
/// `line` of `path`. `None` when no language server would start for the
/// file, so a lead that could only fail is never offered.
#[must_use]
pub fn verify_query(path: &str, symbol: &str, line: u64, verify: Verify) -> Option<Value> {
    server_available(path).then(|| {
        json!({
            "path": path,
            "operation": verify.operation(),
            "symbolName": symbol,
            "line": line,
        })
    })
}

/// Whether the server discovered for `path` resolves to an executable, once
/// per extension, workspace and discovery settings. A failed probe is not
/// cached, so the next lead asks again.
fn server_available(path: &str) -> bool {
    let extension = octocode_engine::text::extension_of(path, true, "");
    let workspace = resolve_workspace_root_for_file(path.to_owned()).unwrap_or_else(|_| {
        Path::new(path)
            .parent()
            .map(|parent| parent.to_string_lossy().into_owned())
            .unwrap_or_else(|| ".".into())
    });
    let discovery = discovery();
    let settings = {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        format!("{discovery:?}").hash(&mut hasher);
        hasher.finish()
    };
    let key = (extension, workspace, settings);
    let cache = LEAD_CACHE.with(|cell| cell.borrow().clone());
    if let Some(available) = cache.as_ref().and_then(|cache| cache.get(&key)) {
        return available;
    }
    let available = match default_server_for_file(path, &key.1, &discovery) {
        Some(config) => match is_command_available(&config.command) {
            Ok(available) => available,
            Err(_) => return false,
        },
        None => false,
    };
    if let Some(cache) = cache {
        cache.insert(key, available, Instant::now());
    }
    available
}

thread_local! {
    /// Discovery the runtime resolved for the request running on this
    /// thread (see [`with_lead_discovery`]).
    static LEAD_DISCOVERY: std::cell::RefCell<Option<LspDiscoveryOptions>> =
        const { std::cell::RefCell::new(None) };
    static LEAD_CACHE: std::cell::RefCell<Option<Arc<LeadProbeCache>>> =
        const { std::cell::RefCell::new(None) };
}

/// Run `run` (one local tool row, on the calling thread) with the runtime's
/// resolved LSP settings, `options`, as the discovery every lead in it probes,
/// and `cache` as the probe cache it shares. The caller authorizes
/// `options.config_path` against the path policy, as `lspSearch` itself does.
pub fn with_lead_discovery<R>(
    options: LspDiscoveryOptions,
    cache: Arc<LeadProbeCache>,
    run: impl FnOnce() -> R,
) -> R {
    struct Restore(Option<LspDiscoveryOptions>, Option<Arc<LeadProbeCache>>);
    impl Drop for Restore {
        fn drop(&mut self) {
            let previous = self.0.take();
            LEAD_DISCOVERY.with(|cell| *cell.borrow_mut() = previous);
            LEAD_CACHE.with(|cell| *cell.borrow_mut() = self.1.take());
        }
    }
    let _restore = Restore(
        LEAD_DISCOVERY.with(|cell| cell.borrow_mut().replace(options)),
        LEAD_CACHE.with(|cell| cell.borrow_mut().replace(cache)),
    );
    run()
}

/// The runtime-resolved discovery of the current request. Every dispatched
/// local row runs inside [`with_lead_discovery`]; a caller outside one (a unit
/// test) probes the built-in defaults, never the bare process environment.
fn discovery() -> LspDiscoveryOptions {
    LEAD_DISCOVERY
        .with(|cell| cell.borrow().clone())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn negative_probe_expires_and_cache_stays_bounded() {
        let cache = LeadProbeCache::default();
        let old = std::time::Instant::now() - NEGATIVE_TTL - std::time::Duration::from_secs(1);
        cache.insert(("rs".into(), "old".into(), 1), false, old);
        assert_eq!(cache.get(&("rs".into(), "old".into(), 1)), None);
        for i in 0..(MAX_PROBES + 1) {
            cache.insert(
                ("rs".into(), format!("workspace-{i}"), 1),
                true,
                std::time::Instant::now(),
            );
        }
        assert!(cache.len() <= MAX_PROBES);
    }

    #[test]
    fn leads_probe_the_runtime_resolved_discovery_inside_a_row_only() {
        let options = LspDiscoveryOptions {
            env: BTreeMap::from([("OCTOCODE_LEAD_PROBE".to_owned(), "resolved".to_owned())]),
            ..LspDiscoveryOptions::default()
        };
        let inside = with_lead_discovery(options, Arc::default(), discovery);
        assert_eq!(
            inside.env.get("OCTOCODE_LEAD_PROBE").map(String::as_str),
            Some("resolved")
        );
        let after = discovery();
        assert!(after.env.is_empty(), "{after:?}");
        assert!(after.config_path.is_none() && after.octocode_home.is_none());
    }

    /// A declaration lead runs `callers` for a callable and `references`
    /// otherwise, and is withheld when no language server would start for the
    /// file.
    #[test]
    fn verify_query_picks_the_operation_and_needs_a_server() {
        let dir = tempfile::tempdir().expect("fixture");
        let file = dir.path().join("a.ts");
        std::fs::write(&file, "export function a() {}\n").expect("file");
        let path = file.to_string_lossy().into_owned();
        let callers = verify_query(&path, "a", 1, Verify::for_kind("function")).expect("ts server");
        assert_eq!(
            callers,
            serde_json::json!({"path": path, "operation": "callers", "symbolName": "a", "line": 1})
        );
        let references = verify_query(&path, "A", 3, Verify::for_kind("class")).expect("ts server");
        assert_eq!(references["operation"], "references");
        let unknown = dir.path().join("a.unknownext");
        std::fs::write(&unknown, "a\n").expect("file");
        assert_eq!(
            verify_query(&unknown.to_string_lossy(), "a", 1, Verify::Callers),
            None,
            "no server for the extension: no lead"
        );
    }
}

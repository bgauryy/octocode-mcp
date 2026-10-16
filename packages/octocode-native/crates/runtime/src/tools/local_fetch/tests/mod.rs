use super::*;
use crate::security::scan::ContentScan;
use crate::tools::cancel::{CancellationCheck, NeverCancel};
use crate::tools::test_support::Fixture;
use sha2::Digest;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
pub(super) struct Paths(pub PathBuf);
impl PathAccess for Paths {
    fn validate_read(&self, p: &Path) -> Result<ValidatedRead, PathFailure> {
        let p = if p.is_absolute() {
            p.into()
        } else {
            self.0.join(p)
        };
        p.canonicalize()
            .map(|canonical| ValidatedRead {
                // As the workspace policy names it: relative to the root
                // when inside it.
                named: self
                    .0
                    .canonicalize()
                    .ok()
                    .and_then(|root| canonical.strip_prefix(root).ok().map(Path::to_path_buf))
                    .unwrap_or_else(|| canonical.clone())
                    .to_string_lossy()
                    .into_owned(),
                canonical,
                target: None,
                display: p.to_string_lossy().into_owned(),
            })
            .map_err(|error| PathFailure {
                code: "fileAccessFailed".into(),
                message: error.to_string(),
                safe_path: None,
                resource_missing: false,
                sparse_checkout: false,
                not_a_file: None,
                search_root: None,
                nearest_dir: None,
            })
    }
}
struct Safe;
impl ContentScan for Safe {
    fn sanitize(&self, text: &str, _: &Path) -> Result<(String, Vec<String>), (String, String)> {
        Ok((
            text.replace("SECRET", "[REDACTED]"),
            if text.contains("SECRET") {
                vec!["Secrets detected and redacted: synthetic".into()]
            } else {
                vec![]
            },
        ))
    }
}
/// Read `req` under `paths` with the redacting test scan, no cancellation,
/// default regex and no response window.
fn fetch(req: &LocalFetchQuery, paths: &impl PathAccess) -> LocalFetchResult {
    execute_local_fetch(
        req,
        paths,
        &Safe,
        &NeverCancel,
        &LocalFetchRegex,
        None,
        None,
    )
}

pub(super) fn q(path: &Path) -> LocalFetchQuery {
    LocalFetchQuery {
        path: path.to_string_lossy().parse().expect("path"),
        ..LocalFetchQuery::test_default()
    }
}
fn numbered(n: usize) -> String {
    (1..=n).map(|i| format!("l{i}\n")).collect()
}
struct Cancel(AtomicUsize);
impl CancellationCheck for Cancel {
    fn check(&self) -> Result<(), String> {
        if self.0.fetch_add(1, Ordering::SeqCst) > 0 {
            Err("cancelled".into())
        } else {
            Ok(())
        }
    }
}
/// A query built from wire JSON (fields the test does not name default).
fn qj(path: &Path, fields: serde_json::Value) -> LocalFetchQuery {
    let mut query = serde_json::json!({"path": path.to_string_lossy(), "mainGoal": "test", "reasoning": "test"});
    for (key, value) in fields.as_object().expect("object") {
        query[key] = value.clone();
    }
    serde_json::from_value(query).expect("localFetch query")
}

fn workspace_policy(root: &Path) -> crate::policy::path::PathPolicy {
    crate::policy::path::PathPolicy::new(crate::policy::path::PathPolicyConfig {
        workspace_root: Some(root.to_path_buf()),
        ..Default::default()
    })
    .expect("policy")
}

mod blocks_and_paths;
mod matches;

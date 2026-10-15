//! Response-shaping helpers: build the tool output Value from prepared rewrite data.
use super::{ExecutableReceipt, PreparedFile, PreparedMatch, RewriteError, RewriteRequest};
use crate::contracts::tool_types::ExtraKind;
use crate::tools::id::ToolId;
use serde_json::{Value, json};
use std::path::Path;

pub(super) fn success_value(
    query: &RewriteRequest,
    root: &Path,
    snapshot: &str,
    files: &[PreparedFile],
    matches: &[PreparedMatch],
    executable: &ExecutableReceipt,
    transaction: Option<Value>,
    code_covered: bool,
) -> Value {
    let apply = query.apply();
    let page = if apply { 1 } else { query.page() };
    let page_size = if apply {
        matches.len().max(1)
    } else {
        query.page_size()
    };
    let (window, pagination) = crate::response::pages::page_window(matches.len(), page, page_size);
    let shown = &matches[window];
    let has_more = pagination.has_more();
    // A preview page carries only the files its matches touch, and each
    // file's patch holds only the hunks of this page's matches, so pageSize
    // bounds the patch too. The patch applies to the original file on its
    // own; `beforeHash`/`afterHash` and `matchCount` still describe the whole
    // file, and the final page's `next.apply` guards every affected file.
    let shown_ids = shown
        .iter()
        .map(|matched| matched.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let page_files = files
        .iter()
        .filter(|file| {
            apply
                || file
                    .matches
                    .iter()
                    .any(|matched| shown_ids.contains(matched.id.as_str()))
        })
        .map(|file| {
            if apply {
                return applied_file(file);
            }
            let mut value = public_file(file, query.wants(ExtraKind::Details));
            page_patch(
                &mut value,
                file,
                &shown_ids,
                query.wants(ExtraKind::Details),
            );
            value
        })
        .collect::<Vec<_>>();
    let mut value = json!({
        "mode":if apply {"apply"} else {"preview"},
        "snapshot":snapshot,"matchCount":matches.len(),
        "affectedFiles":files.len(),
        "matches":shown.iter().map(|matched| public_match(matched, query.wants(ExtraKind::Details))).collect::<Vec<_>>(),
        "files":page_files,
        "isPartial":has_more,
        "pagination":pagination.to_value()
    });
    if apply {
        // The preview already showed the match rows and patch; the receipt
        // states only what was committed (`extras` details adds diagnostics).
        if let Some(map) = value.as_object_mut() {
            map.remove("matches");
        }
    }
    attach_receipts(&mut value, query, executable);
    attach_leads(
        &mut value,
        query,
        root,
        snapshot,
        files,
        (page, page_size, has_more),
        code_covered,
    );
    if let Some(mut transaction) = transaction {
        if let Some(map) = transaction.as_object_mut() {
            // `affectedFiles` and the file rows already name the committed files.
            map.remove("files");
        }
        value["transaction"] = transaction;
    }
    if query.wants(ExtraKind::Echo) {
        value["operation"] = json!("rewrite");
    } else if value["next"].get("apply").is_some()
        && let Some(rows) = value["files"].as_array_mut()
    {
        // next.apply.expectedHashes states each file's beforeHash once.
        for row in rows.iter_mut().filter_map(Value::as_object_mut) {
            row.remove("beforeHash");
        }
    }
    value
}

/// The next preview page; on a complete preview the guarded apply (the one
/// lead that writes, marked as such); after an apply, a read-only check.
/// `paging` is this page, its size and whether more follow.
fn attach_leads(
    value: &mut Value,
    query: &RewriteRequest,
    root: &Path,
    snapshot: &str,
    files: &[PreparedFile],
    (page, page_size, has_more): (usize, usize, bool),
    code_covered: bool,
) {
    let apply = query.apply();
    if has_more
        && let Some(next_page) =
            crate::tools::paging::next_cursor(value, ToolId::AstRewrite, None, "page", page + 1)
    {
        let mut next = continuation_query(query, root);
        next["apply"] = json!(false);
        next["page"] = json!(next_page);
        next["pageSize"] = json!(page_size);
        next["snapshot"] = json!(snapshot);
        value["next"] = json!({
            "nextPage": crate::tools::result::Continuation::new(ToolId::AstRewrite, next)
                .confidence("exact")
                .build()
        });
    }
    // A complete preview carries its own guarded apply: the same query with the
    // preview snapshot and every file's beforeHash. Running it stays the
    // caller's decision; changed sources or selections are still rejected.
    if !apply && !has_more && !files.is_empty() {
        let mut next = continuation_query(query, root);
        next["apply"] = json!(true);
        if let Some(fields) = next.as_object_mut() {
            fields.remove("page");
            fields.remove("pageSize");
        }
        next["snapshot"] = json!(snapshot);
        next["expectedHashes"] = Value::Object(
            files
                .iter()
                .map(|file| (file.shown.clone(), json!(file.before_hash)))
                .collect(),
        );
        // The one lead that writes: marked, and only ever an optional route.
        // It replays this preview exactly; the preview itself is a judgment
        // when whole-word mentions in code lie outside every match.
        let confidence = if code_covered { "exact" } else { "medium" };
        value["next"]["apply"] = crate::tools::result::Continuation::new(ToolId::AstRewrite, next)
            .confidence(confidence)
            .build();
    }
    if apply && query.pattern().is_some() {
        let mut verify = continuation_query(query, root);
        if let Some(fields) = verify.as_object_mut() {
            fields.retain(|key, _| {
                [
                    "path",
                    "language",
                    "pattern",
                    "include",
                    "exclude",
                    "defaultExcludes",
                    "includeHidden",
                    "includeIgnored",
                    "maxFiles",
                ]
                .contains(&key.as_str())
            });
        }
        verify["operation"] = json!("match");
        value["next"]["verify"] =
            crate::tools::result::Continuation::new(ToolId::AstSearch, verify)
                .confidence("high")
                .build();
    }
}

pub(super) fn continuation_query(query: &RewriteRequest, canonical_root: &Path) -> Value {
    let mut value = json!(&query.query);
    if let Some(fields) = value.as_object_mut() {
        for field in ["mainGoal", "reasoning"] {
            fields.remove(field);
        }
        fields.extend(query.rule_config_fields());
    }
    value["path"] = json!(canonical_root);
    value["language"] = json!(query.lang());
    value["apply"] = json!(query.apply());
    value["maxFiles"] = json!(query.max_files());
    value["maxMatches"] = json!(query.max_matches());
    value["page"] = json!(query.page());
    value["pageSize"] = json!(query.page_size());
    value
}

pub(super) fn selection_query(query: &RewriteRequest, canonical_root: &Path) -> Value {
    let mut value = continuation_query(query, canonical_root);
    if let Some(fields) = value.as_object_mut() {
        for field in [
            "apply",
            "page",
            "pageSize",
            "snapshot",
            "expectedHashes",
            "selectedMatchIds",
            "postconditions",
            "extras",
        ] {
            fields.remove(field);
        }
    }
    sort_keys_deep(&mut value);
    value
}

/// Identity digests hash serialized JSON, and `serde_json` keeps insertion
/// order: a caller's row and its copied continuation name the same fields in
/// different orders, so the selection is keyed in one canonical order.
fn sort_keys_deep(value: &mut Value) {
    match value {
        Value::Object(fields) => {
            fields.sort_keys();
            fields.values_mut().for_each(sort_keys_deep);
        }
        Value::Array(items) => items.iter_mut().for_each(sort_keys_deep),
        _ => {}
    }
}

/// Narrow a preview file's whole-file patch to the hunks of the page's
/// matches. A page showing every match of the file keeps the whole patch.
fn page_patch(
    value: &mut Value,
    file: &PreparedFile,
    shown: &std::collections::BTreeSet<&str>,
    details: bool,
) {
    let on_page = file
        .matches
        .iter()
        .filter(|matched| shown.contains(matched.id.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if on_page.len() == file.matches.len() {
        return;
    }
    // The full edit set already applied cleanly; a subset of it cannot fail.
    let Ok(after) = super::apply_edits(&file.before, &on_page) else {
        return;
    };
    let (Ok(before), Ok(after)) = (
        std::str::from_utf8(&file.before),
        std::str::from_utf8(&after),
    ) else {
        return;
    };
    let patch = super::create_unified_patch(file.patch_path(), before, after);
    if details {
        value["patchBytes"] = json!(patch.len());
    }
    value["patch"] = json!(patch);
    value["patchMatchCount"] = json!(on_page.len());
}

/// Hex digits of a match id shown in a preview row; `selectedMatchIds`
/// accepts any unique prefix of at least 12.
pub(super) const MATCH_ID_PREFIX: usize = 16;

/// A preview match row locates its hunk: id prefix, path and 1-based line.
/// The patch already shows the text and its replacement; `extras` details keeps the
/// full row (64-hex id, ranges, text, replacement, captures).
fn public_match(matched: &PreparedMatch, details: bool) -> Value {
    if details {
        return matched.public.clone();
    }
    json!({
        "id":&matched.id[..MATCH_ID_PREFIX.min(matched.id.len())],
        "path":matched.public["path"],
        "line":matched.public["range"]["start"]["line"]
    })
}

/// An applied file row: its edit count and the hash of the bytes now on disk.
fn applied_file(file: &PreparedFile) -> Value {
    json!({
        "path":file.absolute,"matchCount":file.matches.len(),"afterHash":file.after_hash
    })
}

/// A file row: `beforeHash` guards apply (a complete preview states it once,
/// in `next.apply.expectedHashes`) and `matchCount` sizes the edit.
/// `afterHash` (recomputed by the journal) and `patchBytes` are diagnostics
/// kept with `extras` details. `path` is absolute here; the response stage names it
/// relative to the workspace root.
pub(super) fn public_file(file: &PreparedFile, details: bool) -> Value {
    let mut value = json!({
        "path":file.absolute,"beforeHash":file.before_hash,
        "matchCount":file.matches.len(),"patch":file.patch
    });
    if details {
        value["afterHash"] = json!(file.after_hash);
        value["patchBytes"] = json!(file.patch.len());
    }
    value
}

pub(super) fn executable_value(executable: &ExecutableReceipt) -> Value {
    let mut value = json!({
        "path":executable.path,
        "version":executable.version,
        "capabilityContract":1,
        "capabilityDigest":executable.capability_digest,
        "capabilities":executable.capabilities
    });
    if !executable.sha256.is_empty() {
        value["sha256"] = json!(executable.sha256);
    }
    value
}

/// The executable and isolation receipts are diagnostics: the snapshot digest
/// already binds the executable, and nothing a caller does next depends on
/// them, so they ride only with `extras` receipts.
pub(super) fn attach_receipts(
    value: &mut Value,
    query: &RewriteRequest,
    executable: &ExecutableReceipt,
) {
    if query.wants(ExtraKind::Receipts) {
        value["executable"] = executable_value(executable);
        value["isolation"] = isolation_receipt();
    }
}

pub(super) fn isolation_receipt() -> Value {
    json!({
        "workingDirectory":"ephemeral","inheritedHome":false,
        "repositoryConfig":"not-discovered"
    })
}

pub(super) fn portable_relative(root: &Path, target: &Path) -> Result<String, RewriteError> {
    target
        .strip_prefix(root)
        .map(|path| {
            path.to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/")
        })
        .map_err(|_| RewriteError::new("pathEscape", "The rewrite escaped the requested root."))
}

/// astRewrite's answers to the shared response stages (CLI-only: its edit
/// rows are emitted as-is).
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, _query: &Value) -> &'static str {
        "Broaden the structural pattern, path, or file filters."
    }
    fn error_hint(&self, code: &str) -> Option<&'static str> {
        (code == "rootUnavailable").then_some(crate::tools::output::VERIFY_PATH_HINT)
    }
    fn evidence_kind(&self, _query: &Value, data: &Value) -> &'static str {
        let uncovered = data["partialReasons"]
            .as_array()
            .is_some_and(|reasons| reasons.iter().any(|r| r == super::UNCOVERED_CODE_POSITIONS));
        if uncovered { "syntactic" } else { "exact" }
    }
    fn path_anchor(&self) -> crate::tools::output::PathAnchor {
        crate::tools::output::PathAnchor::Workspace
    }
}

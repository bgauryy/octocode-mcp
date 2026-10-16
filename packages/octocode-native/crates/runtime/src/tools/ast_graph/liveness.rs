//! astTopology reachability and dead-code liveness: entry points, live
//! declarations through bindings and re-exports, and dead clusters.

use super::{algorithms::*, analysis::*, graph::normalize, types::*};
use octocode_engine::graph::IMPORT_USE_MODULE;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub(super) fn reachability(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    read: &dyn Fn(&std::path::Path) -> Option<String>,
) -> (Vec<Value>, Value, Vec<String>, bool) {
    let (roots, mut warnings, low) = entrypoints(b, q, read);
    if low && !roots.is_empty() {
        warnings.push(format!(
            "only test files are roots ({}): files read as reachable from tests, not from the program's entries.",
            roots.len()
        ));
    }
    if low && roots.is_empty() {
        return (
            vec![],
            json!({"entrypointsResolvedCount":0,"classifiedCount":0,"unclassifiedCount":b.nodes.len()}),
            warnings,
            true,
        );
    }
    let live = reachable(&b.nodes, &roots, false);
    // Unreachable files lead as individual rows; reachable files are packed
    // into `files` rows of one page each, so no file is dropped or repeated.
    let mut items = b
        .nodes
        .keys()
        .filter(|f| !live.contains(*f))
        .map(|f| json!({"file":f,"reachable":false,"confidence":"syntactic"}))
        .collect::<Vec<_>>();
    let reachable_files = b
        .nodes
        .keys()
        .filter(|f| live.contains(*f))
        .collect::<Vec<_>>();
    let chunk = q
        .page_size()
        .unwrap_or(super::topology_max("pageSize") as usize)
        .max(1);
    items.extend(
        reachable_files
            .chunks(chunk)
            .map(|files| json!({"files":files,"reachable":true,"confidence":"syntactic"})),
    );
    (
        items,
        json!({"entrypointsResolved":roots,"entrypointsResolvedCount":roots.len(),"reachableCount":live.len(),"unreachableCount":b.nodes.len()-live.len()}),
        warnings,
        low,
    )
}

pub(super) fn dead_code(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    read: &dyn Fn(&std::path::Path) -> Option<String>,
) -> (Vec<Value>, Value, Vec<String>, bool) {
    let (roots, mut warnings, low_entries) = entrypoints(b, q, read);
    // Hard gate: with no resolved entrypoint, reachability is undefined and
    // every export not reached from a test file would falsely read as dead.
    // Suppress the verdict rather than report the tree as dead.
    if low_entries || roots.is_empty() {
        warnings.push("dead-code verdict suppressed: no entrypoints resolved, so reachability cannot be computed and no export can be proven dead. Pass `entrypoints` explicitly to enable the analysis.".into());
        return (
            vec![],
            json!({"entrypointsResolvedCount":0,"deadClusters":[],"deadClusterCount":0,"deadExportCount":0,"suppressed":true}),
            warnings,
            true,
        );
    }
    let mut liveness = Liveness::new(b, &roots);
    let static_live = reachable(&b.nodes, &roots, true);
    let dynamic = liveness
        .live
        .difference(&static_live)
        .cloned()
        .collect::<Vec<_>>();
    if !dynamic.is_empty() {
        // The count is the disclosure; `summary.dynamicOnlyFiles` names each
        // file once.
        warnings.push(format!("{} file(s) reachable only through a dynamic import() (summary.dynamicOnlyFiles) — lower confidence than static analysis, verify with lspSearch before treating as proof.",dynamic.len()))
    }
    let (clusters, cluster_by) = dead_clusters(b, q, &liveness.live);
    let rows = dead_rows(b, q, &mut liveness, &cluster_by);
    let count = rows.len();
    let ccount = clusters.len();
    let mut summary = json!({"entrypointsResolved":roots,"entrypointsResolvedCount":roots.len(),"deadClusters":clusters,"deadClusterCount":ccount,"deadExportCount":count});
    if !dynamic.is_empty() {
        summary["dynamicOnlyFiles"] = json!(dynamic);
    }
    (
        rows,
        summary,
        warnings,
        low_entries
            || b.truncated
            || b.edges_capped
            || b.files_skipped > 0
            || !b.diagnostics.is_empty(),
    )
}

/// What the entrypoints keep alive: files, credited bindings, re-export and
/// star-re-export routes, and the live declaration ids per file.
pub(super) struct Liveness<'b> {
    live: BTreeSet<String>,
    rootset: BTreeSet<String>,
    public: BTreeSet<String>,
    real: BTreeSet<String>,
    rex: BTreeMap<String, Vec<(String, String)>>,
    star: BTreeMap<String, Vec<String>>,
    live_ids: BTreeMap<&'b str, BTreeSet<String>>,
}

impl<'b> Liveness<'b> {
    fn new(b: &'b BuiltGraph, roots: &[String]) -> Self {
        let live = reachable(&b.nodes, roots, false);
        let rootset = roots.iter().cloned().collect::<BTreeSet<_>>();
        let public = rootset
            .union(&b.namespace_targets)
            .cloned()
            .collect::<BTreeSet<_>>();
        let mut real = BTreeSet::new();
        let mut rex: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
        for (f, ff) in live.iter().filter_map(|f| Some((f, b.facts.get(f)?))) {
            // An import with known users credits its target only once one
            // of them is live (`declaration_liveness`).
            for i in ff.imports.iter().filter(|i| i.used_in.is_none()) {
                if let Some(t) = &i.target {
                    real.insert(binding(t, &i.imported_name));
                }
            }
            for r in &ff.reexports {
                if let Some(t) = &r.target {
                    rex.entry(binding(t, &r.imported_name))
                        .or_default()
                        .push((f.clone(), r.local_name.clone()));
                }
            }
        }
        let star: BTreeMap<String, Vec<String>> = b
            .star_reexporters
            .iter()
            .filter_map(|(t, rs)| {
                let v = rs
                    .iter()
                    .filter(|x| live.contains(*x))
                    .cloned()
                    .collect::<Vec<_>>();
                (!v.is_empty()).then_some((t.clone(), v))
            })
            .collect();
        let live_ids = declaration_liveness(b, &live, &public, &mut real, &rex, &star);
        Self {
            live,
            rootset,
            public,
            real,
            rex,
            star,
            live_ids,
        }
    }
}

/// Languages whose named imports link to declarations, so an export no
/// importer names can be judged unused. Rust, Go, Java and C items are
/// reached through receivers, packages and paths the syntax does not link:
/// their exports are not judged one by one (their files still are).
const NAMED_IMPORT_LANGUAGES: &[&str] = &["typescript", "tsx", "javascript", "python"];

/// Whether an export of `file` of declaration `kind` can be judged unused:
/// the one rule astTopology `deadCode` and the store's `unused-export`
/// detector read. Python has no export syntax, so only its functions and
/// classes are API.
pub(super) fn exports_judged(file: &str, kind: &str) -> bool {
    let language = super::store::tables::canonical_language(file, "");
    NAMED_IMPORT_LANGUAGES.contains(&language.as_str())
        && (language != "python" || matches!(kind, "function" | "class"))
}

/// Mutually referencing file clusters with no path from any entrypoint.
pub(super) fn dead_clusters(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    live: &BTreeSet<String>,
) -> (Vec<Value>, BTreeMap<String, usize>) {
    let mut cluster_by = BTreeMap::new();
    let mut clusters = Vec::new();
    for files in scc_unsorted(&b.nodes) {
        let report = files
            .into_iter()
            .filter(|f| q.include_tests().unwrap_or(true) || !crate::content::is_test_path(f))
            .filter(|f| !super::store::classify::is_declaration(f))
            .collect::<Vec<_>>();
        if report.is_empty() || !report.iter().all(|f| !live.contains(f)) {
            continue;
        }
        let id = clusters.len();
        for f in &report {
            cluster_by.insert(f.clone(), id);
        }
        clusters.push(json!({"id":id,"files":report,"reason":"mutually-referencing cluster with no path from any entrypoint — each file looks locally referenced by the others, but the cluster as a whole is unreachable","edgeKinds":collect_kinds(&b.nodes,&report),"confidence":"syntactic"}));
    }
    (clusters, cluster_by)
}

/// One row per exported declaration that no entrypoint keeps alive.
pub(super) fn dead_rows(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    liveness: &mut Liveness,
    cluster_by: &BTreeMap<String, usize>,
) -> Vec<Value> {
    let mut rows = Vec::new();
    for (file, ff) in &b.facts {
        if !q.include_tests().unwrap_or(true) && crate::content::is_test_path(file)
            || super::store::classify::is_declaration(file)
        {
            continue;
        }
        let rust = super::linking::Linker::of(file) == super::linking::Linker::Rust;
        let live_ids = liveness.live_ids.remove(file.as_str()).unwrap_or_else(|| {
            live_declarations(
                file,
                ff,
                &liveness.public,
                &liveness.real,
                &liveness.rex,
                &liveness.star,
            )
        });
        let file_live = liveness.live.contains(file);
        // A star re-export target is judged by name like any file: its
        // export is consumed only when a name the re-exporter passes on is
        // imported (`consumed` follows `export *` chains).
        let exported_unreferenced =
            !liveness.rootset.contains(file) && !b.namespace_targets.contains(file);
        // A `mod x;` declaration is module structure: the child file's own
        // liveness is tracked separately.
        for d in ff
            .declarations
            .iter()
            .filter(|d| d.exported && !(rust && d.kind == "module"))
        {
            let mut row = if !file_live {
                if let Some(id) = cluster_by.get(file) {
                    json!({"file":file,"name":d.name,"kind":d.kind,"line":d.line,"reason":"dead-cluster","clusterId":id})
                } else {
                    json!({"file":file,"name":d.name,"kind":d.kind,"line":d.line,"reason":"unreachable-file"})
                }
            } else if exported_unreferenced
                && !live_ids.contains(&d.id)
                && exports_judged(file, &d.kind)
            {
                let via = if d
                    .public_names()
                    .iter()
                    .any(|n| liveness.rex.contains_key(&binding(file, n)))
                {
                    "reexport-chain"
                } else {
                    ff.reference_basis.as_str()
                };
                json!({"file":file,"name":d.name,"kind":d.kind,"line":d.line,"reason":"unreferenced-export","viaHeuristic":via})
            } else {
                continue;
            };
            if !d.exported_as.is_empty() {
                row["exportedAs"] = json!(d.exported_as);
            }
            rows.push(row);
        }
    }
    rows
}

pub(super) fn binding(f: &str, n: &str) -> String {
    format!("{f}::{n}")
}

/// A credit on a re-exporting file can make the origin's export live:
/// re-exporting file → the files it re-exports from.
pub(super) fn reexport_origins<'b>(
    b: &'b BuiltGraph,
    star: &BTreeMap<String, Vec<String>>,
) -> BTreeMap<&'b str, BTreeSet<&'b str>> {
    let mut origins: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    for (file, ff) in &b.facts {
        for target in ff.reexports.iter().filter_map(|r| r.target.as_deref()) {
            origins.entry(file).or_default().insert(target);
        }
    }
    for (origin, reexporters) in star {
        if let Some((origin, _)) = b.facts.get_key_value(origin) {
            for reexporter in reexporters {
                if let Some((reexporter, _)) = b.facts.get_key_value(reexporter) {
                    origins.entry(reexporter).or_default().insert(origin);
                }
            }
        }
    }
    origins
}

/// Cross-file liveness per declaration: an import whose facts name its
/// users (`used_in`) credits the binding `(target file, name)` in `real`
/// only once one of those users is live (imports without that fact were
/// credited unconditionally by the caller). Credits can make new
/// declarations live, so files are re-evaluated in rounds until no binding
/// is added. Returns the final live declaration ids of every live file.
pub(super) fn declaration_liveness<'b>(
    b: &'b BuiltGraph,
    live: &BTreeSet<String>,
    public: &BTreeSet<String>,
    real: &mut BTreeSet<String>,
    rex: &BTreeMap<String, Vec<(String, String)>>,
    star: &BTreeMap<String, Vec<String>>,
) -> BTreeMap<&'b str, BTreeSet<String>> {
    let origins = reexport_origins(b, star);
    let mut live_ids = BTreeMap::new();
    let mut dirty = b
        .facts
        .keys()
        .filter(|f| live.contains(*f))
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    while !dirty.is_empty() {
        let mut credited = BTreeSet::new();
        for file in std::mem::take(&mut dirty) {
            let Some((file, ff)) = b.facts.get_key_value(file) else {
                continue;
            };
            let ids = live_declarations(file, ff, public, real, rex, star);
            let declared = ff
                .declarations
                .iter()
                .map(|d| d.id.as_str())
                .collect::<BTreeSet<_>>();
            let is_live = |id: &str| ids.contains(id) || !declared.contains(id);
            for import in &ff.imports {
                let (Some(target), Some(users)) = (&import.target, &import.used_in) else {
                    continue;
                };
                if users
                    .iter()
                    .any(|user| user == IMPORT_USE_MODULE || is_live(user))
                    && real.insert(binding(target, &import.imported_name))
                {
                    credited.insert(target.as_str());
                }
            }
            live_ids.insert(file.as_str(), ids);
        }
        let mut pending = credited.into_iter().collect::<Vec<_>>();
        let mut seen = BTreeSet::new();
        while let Some(file) = pending.pop() {
            if !seen.insert(file) {
                continue;
            }
            if live.contains(file) {
                dirty.insert(file);
            }
            pending.extend(origins.get(file).into_iter().flatten().copied());
        }
    }
    live_ids
}
/// Declaration ids of `file` that are live: reachable over syntactic call and
/// containment edges from the file's roots. Roots are exported declarations
/// consumed through an import or re-export chain, declarations that escape as
/// a value (syntax-aware references other than the declaration, export clauses
/// and call targets), and callees of module-level code. Identity is the
/// declaration id, so two declarations with one display name (`run` and a
/// `Calls.run` method) keep separate liveness.
pub(super) fn live_declarations(
    file: &str,
    ff: &FileFacts,
    public: &BTreeSet<String>,
    real: &BTreeSet<String>,
    rex: &BTreeMap<String, Vec<(String, String)>>,
    star: &BTreeMap<String, Vec<String>>,
) -> BTreeSet<String> {
    fn consumed(
        file: &str,
        name: &str,
        public: &BTreeSet<String>,
        real: &BTreeSet<String>,
        rex: &BTreeMap<String, Vec<(String, String)>>,
        star: &BTreeMap<String, Vec<String>>,
    ) -> bool {
        let mut seen = BTreeSet::new();
        let mut pending = vec![(file.to_owned(), name.to_owned())];
        while let Some((f, n)) = pending.pop() {
            let k = binding(&f, &n);
            if !seen.insert(k.clone()) {
                continue;
            }
            if public.contains(&f) || real.contains(&k) {
                return true;
            }
            pending.extend(rex.get(&k).cloned().unwrap_or_default());
            // `export *` never re-exports `default`.
            if n != "default" {
                pending.extend(
                    star.get(&f)
                        .into_iter()
                        .flatten()
                        .map(|x| (x.clone(), n.clone())),
                )
            }
        }
        false
    }
    /// Last path segment of a callee (`this.run` → `run`, `Self::new` → `new`).
    fn callee_name(callee: &str) -> &str {
        callee
            .rsplit(['.', ':'])
            .next()
            .filter(|n| !n.is_empty())
            .unwrap_or(callee)
    }
    let mut by_name: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    let mut children: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for d in &ff.declarations {
        by_name.entry(&d.name).or_default().push(&d.id);
        if let Some(parent) = &d.parent {
            children.entry(parent).or_default().push(&d.id);
        }
    }
    let ids = ff
        .declarations
        .iter()
        .map(|d| d.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut edges: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    let mut live = BTreeSet::new();
    let mut pending = VecDeque::new();
    fn mark(id: &str, live: &mut BTreeSet<String>, pending: &mut VecDeque<String>) {
        if live.insert(id.to_owned()) {
            pending.push_back(id.to_owned());
        }
    }
    let uses = ff
        .calls
        .iter()
        .map(|c| (c.callee.as_str(), c.caller_id.as_deref()));
    for (callee, caller_id) in uses {
        let targets = by_name
            .get(callee_name(callee))
            .map(Vec::as_slice)
            .unwrap_or_default();
        match caller_id.filter(|id| ids.contains(id)) {
            Some(caller) => edges.entry(caller).or_default().extend(targets),
            // Module-level code runs when the (live) module loads.
            None => {
                for t in targets {
                    mark(t, &mut live, &mut pending)
                }
            }
        }
    }
    for d in &ff.declarations {
        let is_consumed = d.exported
            && d.public_names()
                .iter()
                .any(|n| consumed(file, n, public, real, rex, star));
        // Counts exclude the declaration, export clauses and call targets, so
        // any remaining reference is a value escape. A missing count means the
        // producer could not count this declaration: treat it as escaping
        // rather than risk a false dead verdict.
        let escapes = ff
            .reference_counts
            .get(&d.id)
            .is_none_or(|count| *count > 0);
        if is_consumed || escapes {
            mark(&d.id, &mut live, &mut pending)
        }
    }
    while let Some(id) = pending.pop_front() {
        for t in edges
            .get(id.as_str())
            .into_iter()
            .flatten()
            .chain(children.get(id.as_str()).into_iter().flatten())
        {
            mark(t, &mut live, &mut pending)
        }
    }
    live
}

/// `read` reads a manifest (`package.json`, `Cargo.toml`) through the
/// caller's path and content policy.
pub(super) fn entrypoints(
    b: &BuiltGraph,
    q: &AstTopologyQuery,
    read: &dyn Fn(&std::path::Path) -> Option<String>,
) -> (Vec<String>, Vec<String>, bool) {
    let mut roots = Vec::new();
    let mut seen_roots = BTreeSet::new();
    let mut warnings = Vec::new();
    let mut low = false;
    if let Some(explicit) = q.entrypoints().filter(|x| !x.is_empty()) {
        for raw in explicit {
            let p = node_key(raw, &b.root, &b.nodes);
            if b.nodes.contains_key(&p) {
                push_unique(&mut roots, &mut seen_roots, p);
            } else {
                let prefix = if p == "." {
                    "".into()
                } else {
                    format!("{}/", p.trim_end_matches('/'))
                };
                let found = b
                    .nodes
                    .keys()
                    .filter(|x| x.starts_with(&prefix))
                    .cloned()
                    .collect::<Vec<_>>();
                if found.is_empty() {
                    warnings.push(format!("entrypoint not found in scan: {raw} — pass a file or dynamic asset directory relative to the scanned path, or an absolute path under it"))
                } else {
                    for file in found {
                        push_unique(&mut roots, &mut seen_roots, file);
                    }
                }
            }
        }
    } else {
        for dir in package_dirs(b) {
            let Some(v) = read(&b.root.join(&dir).join("package.json"))
                .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            else {
                continue;
            };
            for leaf in package_leaves(&v) {
                let leaf = normalize(leaf.trim_start_matches("./"));
                if let Some(x) = source_equivalent(&dir, &leaf, &b.nodes) {
                    push_unique(&mut roots, &mut seen_roots, x);
                }
            }
        }
        // Package.json is JS-only. Infer roots for the other ecosystems so a
        // Rust/Go tree does not read as entirely dead. Inferrers are additive: a
        // mixed repository can contribute roots from several ecosystems.
        infer_rust_roots(b, read, &mut roots, &mut seen_roots);
        infer_go_roots(b, &mut roots, &mut seen_roots);
        if roots.is_empty() {
            warnings.push("no entrypoints resolved for the detected languages — expected package.json main/module/types/exports/bin, a Cargo.toml target or src/main.rs|src/lib.rs|src/bin/*.rs, or a Go `func main`. Pass `entrypoints` explicitly.".into());
        }
    }
    // No entry root (none inferred, or no explicit one found): any test
    // roots below cannot stand in for the program's entries.
    low |= roots.is_empty();
    if q.include_tests().unwrap_or(true) {
        for file in b
            .nodes
            .keys()
            .filter(|x| crate::content::is_test_path(x))
            .cloned()
        {
            push_unique(&mut roots, &mut seen_roots, file);
        }
    }
    (roots, warnings, low)
}
/// Every scanned directory that can hold a `package.json` (`.` and each
/// ancestor directory of a scanned file), so a multi-package root resolves
/// each package's entrypoints, not only its own.
fn package_dirs(b: &BuiltGraph) -> BTreeSet<String> {
    let mut dirs = BTreeSet::from([".".to_owned()]);
    for key in b.nodes.keys() {
        let mut dir = key.as_str();
        while let Some((parent, _)) = dir.rsplit_once('/') {
            if !dirs.insert(parent.to_owned()) {
                break;
            }
            dir = parent;
        }
    }
    dirs
}

/// Package-relative entry files a `package.json` publishes or runs:
/// `main`, `module`, `types`/`typings`, `exports`, `bin`, and the source
/// files its `scripts` invoke.
fn package_leaves(v: &Value) -> Vec<String> {
    let mut leaves = Vec::new();
    for k in ["main", "module", "types", "typings", "exports", "bin"] {
        leaves_json(&v[k], &mut leaves)
    }
    if let Some(s) = v["scripts"].as_object() {
        for value in s.values().filter_map(Value::as_str) {
            for token in value.split_whitespace() {
                let t = token
                    .split('=')
                    .next_back()
                    .unwrap_or(token)
                    .trim_matches(['\"', '\'']);
                if super::linking::Linker::of(t) == super::linking::Linker::JsTs {
                    leaves.push(t.into())
                }
            }
        }
    }
    leaves
}

pub(super) fn push_unique(roots: &mut Vec<String>, seen: &mut BTreeSet<String>, file: String) {
    if seen.insert(file.clone()) {
        roots.push(file);
    }
}

/// Infer Rust crate entrypoints: `[[bin]]`/`[lib]` (and other) `path = "…"`
/// targets declared in a root `Cargo.toml`, plus the conventional
/// `src/main.rs`, `src/lib.rs`, and `src/bin/*.rs` targets (also matched for
/// workspace members via their path suffix). Only node keys that actually exist
/// in the scanned graph are added.
pub(super) fn infer_rust_roots(
    b: &BuiltGraph,
    read: &dyn Fn(&std::path::Path) -> Option<String>,
    roots: &mut Vec<String>,
    seen: &mut BTreeSet<String>,
) {
    let has_rust = b
        .nodes
        .keys()
        .any(|k| super::linking::Linker::of(k) == super::linking::Linker::Rust);
    if !has_rust {
        return;
    }
    if let Some(text) = read(&b.root.join("Cargo.toml")) {
        for path in cargo_target_paths(&text) {
            let key = normalize(path.trim_start_matches("./"));
            if b.nodes.contains_key(&key) {
                push_unique(roots, seen, key);
            }
        }
    }
    for key in b.nodes.keys() {
        if is_rust_conventional_root(key) {
            push_unique(roots, seen, key.clone());
        }
    }
}

/// A node key that Cargo treats as a default target: crate roots (`main.rs`,
/// `lib.rs`, at the tree root or as a `src/` child, including workspace members)
/// and binaries under a `src/bin/` directory.
pub(super) fn is_rust_conventional_root(key: &str) -> bool {
    key == "main.rs"
        || key == "lib.rs"
        || key == "src/main.rs"
        || key == "src/lib.rs"
        || key.ends_with("/main.rs")
        || key.ends_with("/lib.rs")
        || (super::linking::Linker::of(key) == super::linking::Linker::Rust
            && (key.starts_with("src/bin/") || key.contains("/src/bin/")))
}

/// Extract quoted values of `path = "…"` keys from a Cargo.toml. Kept
/// intentionally lenient (no TOML dependency): callers only add targets that
/// resolve to a real scanned node, so a stray candidate is harmless.
pub(super) fn cargo_target_paths(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix("path") else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim();
        if let Some(inner) = rest
            .strip_prefix('"')
            .and_then(|r| r.split('"').next())
            .filter(|s| !s.is_empty())
        {
            out.push(inner.to_owned());
        }
    }
    out
}

/// Infer Go entrypoints: any `.go` file that declares a `func main` — the
/// signature of a `package main` executable. Test files are excluded here (they
/// are added separately as roots when tests are included).
pub(super) fn infer_go_roots(b: &BuiltGraph, roots: &mut Vec<String>, seen: &mut BTreeSet<String>) {
    for (file, facts) in &b.facts {
        if super::linking::Linker::of(file) != super::linking::Linker::Go {
            continue;
        }
        let has_main = facts
            .declarations
            .iter()
            .any(|d| d.name == "main" && (d.kind == "function" || d.kind == "func"));
        if has_main {
            push_unique(roots, seen, file.clone());
        }
    }
}
pub(super) fn leaves_json(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(x) => out.push(x.clone()),
        Value::Array(a) => {
            for x in a {
                leaves_json(x, out)
            }
        }
        Value::Object(m) => {
            for x in m.values() {
                leaves_json(x, out)
            }
        }
        _ => {}
    }
}
/// `path` with a built JS extension swapped for the TypeScript source it is
/// built from first (`x.js` → `x.ts`, `x.mjs` → `x.mts`), when it has one.
fn ts_twin(path: &str) -> Option<String> {
    let (base, extension) = path.rsplit_once('.')?;
    let source = octocode_engine::signatures::languages::js_source_swaps(extension).first()?;
    Some(format!("{base}.{source}"))
}

/// The scanned source file for `p`, a path relative to the package
/// directory `dir` (`.` for the scan root): `p` itself, its TypeScript
/// twin, or the `src/` file a `dist/`/`build/`/`out/` output is built from.
pub(super) fn source_equivalent(
    dir: &str,
    p: &str,
    nodes: &BTreeMap<String, Node>,
) -> Option<String> {
    let within = |relative: &str| {
        if dir == "." {
            relative.to_owned()
        } else {
            normalize(&format!("{dir}/{relative}"))
        }
    };
    let mut c = vec![p.to_owned()];
    c.extend(ts_twin(p));
    for d in ["dist/", "build/", "out/"] {
        if let Some(rest) = p.strip_prefix(d) {
            c.push(format!("src/{rest}"));
            c.extend(ts_twin(rest).map(|twin| format!("src/{twin}")));
            c.push("src/index.ts".into());
        }
    }
    c.into_iter()
        .map(|x| within(&x))
        .find(|x| nodes.contains_key(x))
}

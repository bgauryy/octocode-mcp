//! Per-operation language-server requests and their row shaping, run after
//! `execute` has admitted the query, acquired a leased client, synchronized
//! the document, and resolved the anchor.

use super::LspSearchQuery;
use super::cancellable;
use super::failure::{LspFailure, empty, mark_diagnostics_unpublished, mark_partial, push_warning};
use super::heritage;
use super::importers::{self, Importers, WindowRequest};
use super::locations::{
    RECOVERED_ALIAS, items_payload, locations, public_hover, public_range, public_workspace_symbol,
    salted_locations, snapshot_changed,
};
use super::recovery::{get_locations, recover_aliases, resolve_definition_chain, snippet_identity};
use super::render::as_array;
use super::render::uri_to_path;
use super::scope::Scope;
use super::source::{SourceCache, filter_authorized_items};
use super::walk::{ImporterRecovery, hierarchy};
use crate::tools::cancel::CancellationCheck;
use crate::tools::id::ToolId;
use octocode_engine::lsp::client::{LocationRequest, NativeLspClient, SnippetReadPolicy};
use octocode_engine::lsp::config::{representative_source_for, workspace_root_languages};
use serde_json::{Value, json};
use std::collections::HashSet;

/// Label for references found from a verified importer anchor.
const RECOVERED_IMPORTER: &str = "recoveredImporter";

pub(super) const PUSH_DIAGNOSTICS_WAIT_MS: u32 = 1_500;

/// `lsp.source` of rows read from source by the heritage scan, not from the
/// language server.
const SCAN_SOURCE: &str = "native-graph-facts";

/// Partial reason of a heritage-scan answer standing in for a server that
/// did not answer.
const SERVER_UNANSWERED: &str = "serverUnanswered";

/// How `textDocument/implementation` was answered.
enum Implemented {
    Server(Vec<octocode_engine::lsp::types::JsCodeSnippet>),
    /// The heritage scan, with the note that labels it.
    Scan {
        found: Vec<octocode_engine::lsp::types::JsCodeSnippet>,
        note: String,
    },
}

/// Flag a heritage-scan row incomplete: its note states what it is, and the
/// retry asks the server again.
fn mark_scan_answer(row: &mut Value, query: &LspSearchQuery, note: String) {
    mark_partial(row, query, SERVER_UNANSWERED, &[note]);
}

/// Everything one operation needs, borrowed from `execute`.
pub(super) struct Operation<'a, 'p> {
    pub(super) client: &'a NativeLspClient,
    pub(super) query: &'a LspSearchQuery,
    pub(super) sources: &'a mut SourceCache<'p>,
    pub(super) snippet_policy: &'a SnippetReadPolicy,
    pub(super) cancel: &'a dyn CancellationCheck,
    /// Canonical file (or workspace-root directory) path of the request.
    pub(super) path: &'a str,
    /// Where lexical scans and leads search; records the answer's files.
    pub(super) scope: &'a Scope,
    /// A `workspaceRoot`-only request (no source file).
    pub(super) root_only: bool,
    /// Zero-based LSP anchor (0,0 for document-wide operations).
    pub(super) line: u32,
    pub(super) character: u32,
    /// Language of the anchor file, for server-specific recovery.
    pub(super) language_id: Option<&'a str>,
    /// Characters a page of rows may spend (see `page_windows::page_budget`).
    pub(super) budget: usize,
}

impl Operation<'_, '_> {
    pub(super) async fn run(self) -> Result<Value, LspFailure> {
        let query = self.query;
        match query.operation().as_str() {
            "definition" => self.definition().await,
            "references" => self.references().await,
            "typeDefinition" => {
                let found = self
                    .location_request(LocationRequest::TypeDefinition)
                    .await?;
                Ok(self
                    .locations("typeDefinition", "typeDefinitionProvider", found)
                    .await)
            }
            "implementation" => self.implementation().await,
            "hover" => self.hover().await,
            "documentSymbols" => {
                let mut symbols = std::sync::Arc::unwrap_or_clone(
                    cancellable(
                        self.cancel,
                        self.client.get_document_symbols(self.path.to_owned()),
                    )
                    .await??,
                );
                if self
                    .language_id
                    .is_some_and(|id| super::render::TS_LANGUAGE_IDS.contains(&id))
                    && let Some(source) = self.sources.get(self.path).await
                {
                    super::render::name_type_aliases(&mut symbols, &source.content);
                }
                Ok(items_payload(
                    query,
                    "documentSymbols",
                    symbols,
                    self.budget,
                ))
            }
            "workspaceSymbol" => self.workspace_symbol().await,
            "diagnostic" => self.diagnostic().await,
            "callers" | "callees" | "supertypes" | "subtypes" => self.hierarchy().await,
            other => Ok(empty(
                query,
                "unsupportedOperation",
                &format!("Unsupported lspSearch operation: {other}"),
                true,
            )),
        }
    }

    async fn definition(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let (found, warnings) = resolve_definition_chain(
            self.client,
            self.sources,
            self.snippet_policy,
            self.cancel,
            self.path,
            self.line,
            self.character,
        )
        .await?;
        let mut row = self
            .locations("definition", "definitionProvider", found)
            .await;
        if !warnings.is_empty() {
            super::failure::mark_partial(&mut row, query, "definitionHopFailed", &warnings);
        }
        Ok(row)
    }

    /// References from the anchor, plus alias and verified-importer
    /// recoveries, each recovered row labelled with its source. Importer
    /// page 1 lists the anchor's answer and the first importer window; a
    /// later page (`importerPage` > 1) lists only its window's recovered
    /// rows. A recovered row in a candidate file belongs to that file's
    /// window, so each row is listed once across importer pages.
    async fn references(mut self) -> Result<Value, LspFailure> {
        let query = self.query;
        let include_declaration = query.include_declaration().unwrap_or(true);
        let mut found = self
            .location_request(LocationRequest::References {
                include_declaration,
            })
            .await?;
        let recovered = recover_aliases(
            self.client,
            self.sources,
            self.snippet_policy,
            self.cancel,
            query.symbol_name(),
            include_declaration,
            self.path,
            self.line,
            self.character,
            &found,
        )
        .await?;
        let alias_scan_capped = recovered.capped;
        let recovered = recovered.snippets;
        let mut seen = found
            .iter()
            .chain(&recovered)
            .map(snippet_identity)
            .collect::<HashSet<_>>();
        let known_files = found
            .iter()
            .chain(&recovered)
            .map(|snippet| super::scope::canonical(&uri_to_path(&snippet.uri)))
            .collect::<HashSet<_>>();
        let importers = self.importers(&known_files).await?;
        if importers.as_ref().is_some_and(|importers| importers.stale) {
            return Ok(snapshot_changed(query));
        }
        let later_window = query.importer_page() > 1;
        let mut from_importers = Vec::new();
        if let Some(importers) = &importers {
            for anchor in importers.per_file() {
                let Ok(extra) = get_locations(
                    self.client,
                    self.snippet_policy,
                    self.cancel,
                    LocationRequest::References {
                        include_declaration,
                    },
                    &anchor.path,
                    anchor.line,
                    anchor.character,
                )
                .await
                else {
                    self.cancel.check().map_err(LspFailure::cancelled)?;
                    continue;
                };
                from_importers.extend(extra.into_iter().filter(|snippet| {
                    importers.owns(&super::scope::canonical(&uri_to_path(&snippet.uri)))
                        && seen.insert(snippet_identity(snippet))
                }));
            }
        }
        // Recovered references are not reported from the anchor:
        // label each so callers can weigh them as such.
        let labelled = |label: &'static str| {
            move |snippet| {
                let mut value = serde_json::to_value(snippet).unwrap_or(Value::Null);
                value["source"] = json!(label);
                value
            }
        };
        self.scope.answer(
            std::iter::once(self.path.to_owned())
                .chain(known_files)
                .chain(
                    from_importers
                        .iter()
                        .map(|snippet| uri_to_path(&snippet.uri)),
                )
                .chain(
                    importers
                        .iter()
                        .flat_map(Importers::per_file)
                        .map(|anchor| anchor.path.clone()),
                )
                .chain(importers.iter().flat_map(|found| found.rejected.clone()))
                .chain(importers.iter().flat_map(Importers::covered)),
        );
        // A later importer page leaves out the anchor's answer (listed on
        // importer page 1); it still deduplicates this window's rows.
        if later_window {
            found.clear();
        }
        let recovered = if later_window { Vec::new() } else { recovered };
        let found = found
            .drain(..)
            .map(|snippet| serde_json::to_value(snippet).unwrap_or(Value::Null))
            .chain(recovered.into_iter().map(labelled(RECOVERED_ALIAS)))
            .chain(from_importers.into_iter().map(labelled(RECOVERED_IMPORTER)))
            .collect::<Vec<_>>();
        let mut row = salted_locations(
            self.query,
            self.sources,
            "references",
            "referencesProvider",
            found,
            importers.as_ref().and_then(Importers::digest),
            self.budget,
        )
        .await;
        if let Some(importers) = &importers {
            importers.annotate(&mut row, query, self.scope);
        }
        if !later_window && alias_scan_capped && row.pointer("/coverage").is_some() {
            if let Some(name) = query.symbol_name() {
                self.scope
                    .text_files(name, self.sources.policy(), self.cancel)
                    .await?;
            }
            super::recovery::disclose_alias_cap(&mut row, query, self.scope);
        }
        Ok(row)
    }

    async fn hover(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let hover = cancellable(
            self.cancel,
            self.client
                .get_hover(self.path.to_owned(), self.line, self.character),
        )
        .await??;
        Ok(match hover {
            Value::Null => empty(
                query,
                "noHover",
                "hoverProvider returned no hover at this position",
                true,
            ),
            hover => json!({
                "lsp": { "serverAvailable": true, "provider": "hoverProvider" },
                "kind": "hover",
                "hover": public_hover(hover)
            }),
        })
    }

    /// A call or type hierarchy walk; TS/JS incoming walks also verify the
    /// importers the server's level-1 answer does not cover.
    /// `supertypes`/`subtypes` on a server with no type hierarchy: the
    /// implementation locations (subtypes) or the definitions of the
    /// declaration's heritage clause (supertypes), labelled by `lsp.source`.
    async fn type_hierarchy_without_server_support(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let kind = query.operation();
        let (found, source, note) = if kind == "subtypes" {
            // An implementation answer includes the queried declaration:
            // that is the type itself, not one of its subtypes.
            let anchor = super::scope::canonical(self.path);
            let own = |snippet: &octocode_engine::lsp::types::JsCodeSnippet| {
                snippet.range.start.line == self.line
                    && super::scope::canonical(&uri_to_path(&snippet.uri)) == anchor
            };
            match self.implemented(true).await? {
                Implemented::Server(found) => (
                    found.into_iter().filter(|snippet| !own(snippet)).collect(),
                    "implementation",
                    heritage::describe_implementation(),
                ),
                Implemented::Scan { found, note } => (
                    found.into_iter().filter(|snippet| !own(snippet)).collect(),
                    SCAN_SOURCE,
                    note,
                ),
            }
        } else {
            let content = self
                .sources
                .get(self.path)
                .await
                .map(|source| source.content.clone())
                .unwrap_or_default();
            let bases = heritage::base_types(&content, self.path, self.line);
            let mut found = Vec::new();
            for base in &bases {
                found.extend(
                    get_locations(
                        self.client,
                        self.snippet_policy,
                        self.cancel,
                        LocationRequest::Definition,
                        self.path,
                        base.line,
                        base.character,
                    )
                    .await?,
                );
            }
            (found, "heritage", heritage::describe(&bases))
        };
        let provider = heritage::fallback_provider(&kind).unwrap_or_default();
        self.scope.answer(
            std::iter::once(self.path).chain(found.iter().map(|snippet| snippet.uri.as_str())),
        );
        let mut row = self.locations(&kind, provider, found).await;
        row["lsp"]["source"] = json!(source);
        if source == SCAN_SOURCE {
            mark_scan_answer(&mut row, query, note);
        } else {
            push_warning(&mut row, note);
        }
        Ok(row)
    }

    /// `implementation`: the server's answer, or, for a type declaration the
    /// server cannot answer in time, the labelled heritage scan standing in
    /// for it. Another anchor (a member, a function) has no heritage clause
    /// a scan could read, so its failure stays the failure.
    async fn implementation(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let content = self
            .sources
            .get(self.path)
            .await
            .map(|source| source.content.clone())
            .unwrap_or_default();
        let scannable = query.symbol_name().is_some_and(|name| {
            heritage::anchors_type_declaration(&content, self.path, self.line, name)
        });
        let (found, note) = match self.implemented(scannable).await? {
            Implemented::Server(found) => (found, None),
            Implemented::Scan { found, note } => (found, Some(note)),
        };
        self.scope.answer(
            std::iter::once(self.path).chain(found.iter().map(|snippet| snippet.uri.as_str())),
        );
        let mut row = self
            .locations("implementation", "implementationProvider", found)
            .await;
        if let Some(note) = note {
            row["lsp"]["source"] = json!(SCAN_SOURCE);
            mark_scan_answer(&mut row, query, note);
        }
        Ok(row)
    }

    /// The server's `textDocument/implementation` answer. The heritage scan
    /// (when `scannable`) runs while the request is pending: a failure that
    /// has the scan as fallback takes it without a second wait, and a server
    /// still silent a grace after the scan finishes yields to it.
    async fn implemented(&self, scannable: bool) -> Result<Implemented, LspFailure> {
        let scan = async {
            if scannable {
                self.heritage_scan().await
            } else {
                Ok(None)
            }
        };
        let raced = heritage::hedged(
            self.location_request(LocationRequest::Implementation),
            scan,
            heritage::implementation_failure_has_fallback,
            |scan| matches!(scan, Ok(Some(_))).then_some(heritage::SERVER_GRACE_AFTER_SCAN),
            |wait| {
                LspFailure::overdue(format!(
                    "no answer within {} s of the syntax scan finishing",
                    wait.as_secs()
                ))
            },
        )
        .await;
        match raced {
            Ok(found) => Ok(Implemented::Server(found)),
            Err((failure, Some(scan))) => match scan? {
                Some(scan) => Ok(Implemented::Scan {
                    note: heritage::describe_scan(
                        &failure,
                        &scan.base,
                        scan.files,
                        scan.unread,
                        &self.query.operation(),
                    ),
                    found: scan.found,
                }),
                None => Err(failure),
            },
            Err((failure, None)) => Err(failure),
        }
    }

    /// Subtypes read from the heritage clauses of every workspace file that
    /// spells the queried name: the syntax answer standing by for a failed
    /// implementation request. `None` when no name is queried or the text
    /// scan of the workspace could not run.
    async fn heritage_scan(&self) -> Result<Option<heritage::HeritageScan>, LspFailure> {
        let Some(base) = self
            .query
            .symbol_name()
            .filter(|name| !name.trim().is_empty())
        else {
            return Ok(None);
        };
        let Some(files) = self
            .scope
            .text_files(base, self.sources.policy(), self.cancel)
            .await?
        else {
            return Ok(None);
        };
        let name = base.to_owned();
        let scanned = files.clone();
        let Some((found, unread)) = super::blocking_cancellable(self.cancel, move |stopped| {
            heritage::scan_subtypes(&scanned, &name, stopped)
        })
        .await?
        else {
            return Ok(None);
        };
        Ok(Some(heritage::HeritageScan {
            base: base.to_owned(),
            files: files.len(),
            found,
            unread,
        }))
    }

    async fn hierarchy(self) -> Result<Value, LspFailure> {
        let query = self.query;
        if matches!(query.operation().as_str(), "supertypes" | "subtypes")
            && !self
                .client
                .has_capability("typeHierarchyProvider".to_owned())
        {
            return self.type_hierarchy_without_server_support().await;
        }
        let recovery = match self.importer_symbol()? {
            Some(symbol) => Some(ImporterRecovery {
                symbol,
                snippet_policy: self.snippet_policy,
                window: WindowRequest::of(query),
            }),
            None => None,
        };
        let (mut row, importers) = hierarchy(
            self.client,
            query,
            self.sources,
            self.scope,
            (self.path, self.line, self.character),
            recovery,
            self.cancel,
            self.budget,
        )
        .await?;
        if let Some(importers) = &importers {
            importers.annotate(&mut row, query, self.scope);
        }
        Ok(row)
    }

    /// The symbol whose importers recovery verifies, when the server may
    /// have missed importers (TS/JS incoming operations). An `importerPage`
    /// past the first names a window only importer recovery has.
    fn importer_symbol(&self) -> Result<Option<String>, LspFailure> {
        let operation = self.query.operation();
        let symbol = (importers::applies(self.language_id, &operation) && !self.root_only)
            .then(|| self.query.symbol_name())
            .flatten()
            .filter(|name| !name.trim().is_empty())
            .map(str::to_owned);
        if symbol.is_none() && self.query.importer_page() > 1 {
            return Err(LspFailure::invalid_query(
                "importerPage pages TypeScript/JavaScript importer recovery for references and callers; copy it from that recovery's continuation.",
            ));
        }
        Ok(symbol)
    }

    /// Verified importer anchors when the server may have missed importers
    /// (TS/JS incoming operations); `None` when recovery does not apply.
    async fn importers(
        &mut self,
        known_files: &HashSet<String>,
    ) -> Result<Option<Importers>, LspFailure> {
        let Some(symbol) = self.importer_symbol()? else {
            return Ok(None);
        };
        importers::verified_anchors(
            self.client,
            self.sources,
            self.snippet_policy,
            self.cancel,
            &symbol,
            self.scope,
            self.path,
            self.line,
            self.character,
            known_files,
            WindowRequest::of(self.query),
        )
        .await
        .map(Some)
    }

    async fn location_request(
        &self,
        request: LocationRequest,
    ) -> Result<Vec<octocode_engine::lsp::types::JsCodeSnippet>, LspFailure> {
        get_locations(
            self.client,
            self.snippet_policy,
            self.cancel,
            request,
            self.path,
            self.line,
            self.character,
        )
        .await
    }

    async fn locations(
        self,
        kind: &str,
        provider: &str,
        found: Vec<octocode_engine::lsp::types::JsCodeSnippet>,
    ) -> Value {
        locations(self.query, self.sources, kind, provider, found, self.budget).await
    }

    async fn workspace_symbol(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let name = query
            .symbol_name()
            .map(str::to_owned)
            .ok_or_else(|| LspFailure::invalid_query("workspaceSymbol requires symbolName"))?;
        let symbols =
            cancellable(self.cancel, self.client.workspace_symbol(name.clone())).await??;
        // workspace/symbol URIs are server-controlled and span the whole
        // project; drop any that fall outside the read policy before emitting.
        let mut symbols = as_array(&filter_authorized_items(symbols, self.sources.policy()))
            .iter()
            .map(public_workspace_symbol)
            .collect::<Vec<_>>();
        rank_workspace_symbols(&mut symbols, &name);
        let mut row = items_payload(query, "symbols", json!(symbols), self.budget);
        if self.root_only && row.pointer("/kind").and_then(Value::as_str) == Some("empty") {
            // A source directory (`src`) has no markers: name the languages
            // of the project root it was searched from.
            let mut languages = workspace_root_languages(self.path);
            if languages.is_empty()
                && let Some(root) = self.query.workspace_root()
            {
                languages = workspace_root_languages(root);
            }
            let searched = languages
                .first()
                .map_or("unknown", |ext| language_name(ext));
            row["lsp"]["language"] = json!(searched);
            // The server answered from one representative file's project;
            // other project markers in this root name languages it never
            // searched: route to each with a real source file as uri.
            let mut others = Vec::new();
            for extension in languages.iter().skip(1) {
                let Some(file) = representative_source_for(self.path, extension) else {
                    continue;
                };
                let language = language_name(extension);
                others.push(language);
                row["next"][format!("search{}", capitalized(language))] =
                    crate::tools::result::Continuation::new(
                        ToolId::LspSearch,
                        json!({
                            "operation": "workspaceSymbol",
                            "symbolName": name,
                            "path": file
                        }),
                    )
                    .confidence("medium")
                    .build();
            }
            let hint = if others.is_empty() {
                format!(
                    "workspaceRoot-only search covered the {searched} project of one file; pass path for a source file in the symbol's project."
                )
            } else {
                format!(
                    "workspaceRoot-only search used the {searched} server; this root also holds {} unsearched projects.",
                    others.join(", ")
                )
            };
            row["hints"] = json!([hint]);
        }
        Ok(row)
    }

    async fn diagnostic(self) -> Result<Value, LspFailure> {
        let query = self.query;
        let report = if self.client.has_capability("diagnosticProvider".to_owned()) {
            Some(
                cancellable(
                    self.cancel,
                    self.client.get_diagnostics(self.path.to_owned()),
                )
                .await??,
            )
        } else {
            cancellable(
                self.cancel,
                self.client
                    .get_push_diagnostics(self.path.to_owned(), Some(PUSH_DIAGNOSTICS_WAIT_MS)),
            )
            .await??
        };
        let published = report.is_some();
        let (items, truncated) = diagnostic_items(report);
        let mut row = items_payload(query, "diagnostics", items, self.budget);
        if !published {
            mark_diagnostics_unpublished(&mut row, query, PUSH_DIAGNOSTICS_WAIT_MS);
        }
        if truncated {
            row["isPartial"] = json!(true);
            row["terminalLimit"] = json!(true);
            row["partialReasons"] = json!(["diagnosticsTruncated"]);
        }
        // Success rows drop `hints` (response hint policy), so this note is a
        // warning: it explains results, it is not a recovery step.
        if disabled_macro_diagnostics(&row["matches"]) {
            let note = json!(RUST_MACRO_NOTE);
            match row["warnings"].as_array_mut() {
                Some(warnings) => warnings.push(note),
                None => row["warnings"] = json!([note]),
            }
        }
        Ok(row)
    }
}

/// rust-analyzer codes for macros it did not expand. The engine starts it
/// headless (no build scripts or proc-macros), so these are expected noise.
const DISABLED_MACRO_CODES: &[&str] = &[
    "macro-error",
    "unresolved-proc-macro",
    "proc-macro-disabled",
];
const RUST_MACRO_NOTE: &str = "Proc-macros and build scripts are off by default (they run repository code), so rust-analyzer reports unexpanded macros; pass rustContext {buildScripts:true, procMacros:true} to expand them.";

pub(super) fn disabled_macro_diagnostics(items: &Value) -> bool {
    as_array(items).iter().any(|item| {
        item.get("code")
            .and_then(Value::as_str)
            .is_some_and(|code| DISABLED_MACRO_CODES.contains(&code))
    })
}

/// Replace the zero-based LSP `range` on a diagnostic (and on each related
/// location) with the one-based public `displayRange` every other result uses.
pub(super) fn publish_diagnostic_ranges(mut item: Value) -> Value {
    fn swap(object: &mut Value) {
        if let Some(display) = object.get("range").and_then(public_range)
            && let Some(map) = object.as_object_mut()
        {
            map.remove("range");
            map.insert("displayRange".into(), display);
        }
    }
    swap(&mut item);
    // LSP `DiagnosticSeverity` 1–4, by name like every other Octocode
    // diagnostic; an unknown number passes through unchanged.
    let label = match item.get("severity").and_then(Value::as_u64) {
        Some(1) => Some("error"),
        Some(2) => Some("warning"),
        Some(3) => Some("information"),
        Some(4) => Some("hint"),
        _ => None,
    };
    if let Some(label) = label {
        item["severity"] = json!(label);
    }
    if let Some(related) = item
        .get_mut("relatedInformation")
        .and_then(Value::as_array_mut)
    {
        for info in related {
            if let Some(location) = info.get_mut("location") {
                swap(location);
            }
        }
    }
    item
}

/// Flatten a pull (`DocumentDiagnosticReport`) or cached push report into the
/// list of diagnostics it carries, plus whether the push cache truncated it.
/// `unchanged` pull reports and absent reports carry no items.
pub(super) fn diagnostic_items(report: Option<Value>) -> (Value, bool) {
    let Some(report) = report else {
        return (json!([]), false);
    };
    let truncated = report.get("truncated").and_then(Value::as_bool) == Some(true);
    let items = match report {
        Value::Array(items) => items,
        Value::Object(mut object) => match object.remove("items") {
            Some(Value::Array(items)) => items,
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };
    (
        Value::Array(items.into_iter().map(publish_diagnostic_ranges).collect()),
        truncated,
    )
}

/// Relevance tier of a workspace symbol name for the query: exact, exact
/// ignoring case, prefix, substring, then any other (fuzzy) match.
fn match_tier(candidate: &str, query: &str) -> u8 {
    let (lower, wanted) = (candidate.to_lowercase(), query.to_lowercase());
    if candidate == query {
        0
    } else if lower == wanted {
        1
    } else if lower.starts_with(&wanted) {
        2
    } else if lower.contains(&wanted) {
        3
    } else {
        4
    }
}

fn language_name(extension: &str) -> &'static str {
    match extension {
        ".rs" => "rust",
        ".go" => "go",
        ".py" => "python",
        _ => "typescript",
    }
}

fn capitalized(word: &str) -> String {
    let mut chars = word.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

/// Servers return fuzzy matches in their own order (rust-analyzer:
/// alphabetical), which can bury the exact name past the first page. Public
/// rows are ranked by `symbolName` tier; within a tier, declarations come
/// before variable bindings (tsserver lists every `import { Scene }` as a
/// `variable` named Scene ahead of `class Scene`). Stable sort keeps server
/// order otherwise.
fn rank_workspace_symbols(symbols: &mut [Value], name: &str) {
    symbols.sort_by_key(|symbol| {
        (
            match_tier(
                symbol
                    .get("symbolName")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                name,
            ),
            binding_rank(symbol.get("kind").and_then(Value::as_str).unwrap_or("")),
        )
    });
}

/// Bindings (variables, fields, properties) rank after declarations of the
/// same name: an import alias or a property is rarely the definition sought.
fn binding_rank(kind: &str) -> u8 {
    u8::from(matches!(kind, "variable" | "field" | "property"))
}

#[cfg(test)]
mod tests {
    use super::{binding_rank, match_tier, rank_workspace_symbols};

    /// The published rows (`symbolName`, not the server's `name`) rank
    /// the exact name ahead of rust-analyzer's alphabetical fuzzy matches.
    #[test]
    fn public_workspace_symbols_rank_the_exact_name_first() {
        let raw = |name: &str| {
            serde_json::json!({"name": name, "kind": 12,
                "location": {"uri": "file:///repo/a.rs", "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 1}}}})
        };
        let mut rows = ["a_keeps_alive", "b_alive_pool", "is_alive_now", "is_alive"]
            .map(|name| super::super::locations::public_workspace_symbol(&raw(name)));
        rank_workspace_symbols(&mut rows, "is_alive");
        assert_eq!(rows[0]["symbolName"], "is_alive", "{rows:?}");
        assert_eq!(rows[1]["symbolName"], "is_alive_now", "{rows:?}");
    }

    #[test]
    fn workspace_symbols_rank_declarations_before_same_name_bindings() {
        let mut rows = [
            ("Scene", "variable"),
            ("scene", "property"),
            ("Scene", "class"),
        ];
        rows.sort_by_key(|(name, kind)| (match_tier(name, "Scene"), binding_rank(kind)));
        assert_eq!(rows[0], ("Scene", "class"));
        assert_eq!(rows[1], ("Scene", "variable"));
    }

    #[test]
    fn workspace_symbols_rank_exact_before_fuzzy() {
        let mut names = vec![
            "a_keeps_alive",
            "process_is_alive",
            "is_alive_now",
            "IS_ALIVE",
            "is_alive",
        ];
        names.sort_by_key(|name| match_tier(name, "is_alive"));
        assert_eq!(
            names,
            vec![
                "is_alive",
                "IS_ALIVE",
                "is_alive_now",
                "process_is_alive",
                "a_keeps_alive"
            ]
        );
    }
}

//! Resolved direct heritage edges for the shared bounded hierarchy walker.

use super::anchor::Position;
use super::cancellable;
use super::failure::LspFailure;
use super::heritage;
use super::recovery::{get_locations, resolve_definition_chain};
use super::render::uri_to_path;
use super::source::SourceCache;
use super::walk::{Expansion, HierarchySource, HierarchyWalk, MAX_HIERARCHY_NODES, NodeKeys, Walk};
use crate::tools::cancel::CancellationCheck;
use octocode_engine::error::Error as EngineError;
use octocode_engine::lsp::client::{LocationRequest, NativeLspClient, SnippetReadPolicy};
use octocode_engine::lsp::types::JsCodeSnippet;
use serde_json::{Value, json};
use tokio::sync::Mutex;

pub(super) struct Fallback<'a, 'p> {
    client: &'a NativeLspClient,
    sources: Mutex<&'a mut SourceCache<'p>>,
    snippet_policy: &'a SnippetReadPolicy,
    cancel: &'a dyn CancellationCheck,
    failures: Mutex<Vec<EngineError>>,
    keys: Mutex<NodeKeys<'p>>,
    bases: Mutex<std::collections::HashMap<String, Vec<Value>>>,
    documents: Mutex<
        std::collections::HashMap<
            String,
            std::sync::Arc<octocode_engine::graph::GraphFactsDocument>,
        >,
    >,
    initial: Mutex<Option<(Value, Vec<JsCodeSnippet>)>>,
    candidate_limit: std::sync::atomic::AtomicBool,
}

impl<'a, 'p> Fallback<'a, 'p> {
    pub(super) fn new(
        client: &'a NativeLspClient,
        sources: &'a mut SourceCache<'p>,
        snippet_policy: &'a SnippetReadPolicy,
        cancel: &'a dyn CancellationCheck,
    ) -> Self {
        let keys = NodeKeys::new(sources.policy());
        Self {
            client,
            sources: Mutex::new(sources),
            snippet_policy,
            cancel,
            failures: Mutex::new(Vec::new()),
            keys: Mutex::new(keys),
            bases: Mutex::new(std::collections::HashMap::new()),
            documents: Mutex::new(std::collections::HashMap::new()),
            initial: Mutex::new(None),
            candidate_limit: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub(super) fn candidate_limited(&self) -> bool {
        self.candidate_limit
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    async fn fail(&self, message: String) {
        self.failures.lock().await.push(EngineError::new(message));
    }

    async fn source(
        &self,
        path: &str,
    ) -> Result<std::sync::Arc<super::source::Source>, LspFailure> {
        let source = self.sources.lock().await.get(path).await.ok_or_else(|| {
            LspFailure::invalid_query(format!("Authorized type source unavailable: {path}"))
        })?;
        cancellable(
            self.cancel,
            self.client.open_document(path.to_owned(), &source.content),
        )
        .await??;
        Ok(source)
    }

    async fn document(
        &self,
        path: &str,
    ) -> Result<std::sync::Arc<octocode_engine::graph::GraphFactsDocument>, LspFailure> {
        let mut documents = self.documents.lock().await;
        if let Some(document) = documents.get(path).cloned() {
            return Ok(document);
        }
        let source = self.source(path).await?;
        let owned_path = path.to_owned();
        let document = super::blocking_cancellable(self.cancel, move |_| {
            heritage::type_document(&source.content, &owned_path)
        })
        .await?
        .ok_or_else(|| LspFailure::invalid_query("Type parsing worker failed"))?
        .map_err(LspFailure::invalid_query)?;
        let document = std::sync::Arc::new(document);
        documents.insert(path.to_owned(), document.clone());
        Ok(document)
    }

    async fn node(&self, path: &str, line: u32, character: u32) -> Result<Value, LspFailure> {
        let document = self.document(path).await?;
        heritage::type_node(&document, path, line, character).map_err(LspFailure::invalid_query)
    }

    async fn resolved_nodes(
        &self,
        path: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<Value>, LspFailure> {
        match self.node(path, line, character).await {
            Ok(node) => Ok(vec![node]),
            Err(failure) if failure.code == "cancelled" => Err(failure),
            Err(_) => self.definitions(path, line, character).await,
        }
    }

    async fn definitions(
        &self,
        path: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<Value>, LspFailure> {
        let mut found = get_locations(
            self.client,
            self.snippet_policy,
            self.cancel,
            LocationRequest::Definition,
            path,
            line,
            character,
        )
        .await?;
        let mut nodes = Vec::new();
        let mut unresolved = false;
        for snippet in &found {
            let target = uri_to_path(&snippet.uri);
            match self
                .node(
                    &target,
                    snippet.range.start.line,
                    snippet.range.start.character,
                )
                .await
            {
                Ok(node) => nodes.push(node),
                Err(failure) if failure.code == "cancelled" => return Err(failure),
                Err(_) => unresolved = true,
            }
        }
        if !unresolved && !nodes.is_empty() {
            return Ok(nodes);
        }
        if unresolved {
            let (resolved, warnings) = {
                let mut sources = self.sources.lock().await;
                resolve_definition_chain(
                    self.client,
                    &mut sources,
                    self.snippet_policy,
                    self.cancel,
                    path,
                    line,
                    character,
                )
                .await?
            };
            found = resolved;
            for warning in warnings {
                self.fail(warning).await;
            }
        }
        if found.is_empty() {
            self.fail(format!(
                "No definition establishes the heritage relation at {path}:{}:{}",
                line + 1,
                character + 1
            ))
            .await;
        }
        nodes.clear();
        for found in found {
            self.cancel.check().map_err(LspFailure::cancelled)?;
            let target = uri_to_path(&found.uri);
            match self
                .node(&target, found.range.start.line, found.range.start.character)
                .await
            {
                Ok(node) => nodes.push(node),
                Err(failure) if failure.code == "cancelled" => return Err(failure),
                Err(failure) => self.fail(failure.message).await,
            }
        }
        Ok(nodes)
    }

    async fn bases(&self, node: &Value) -> Result<Vec<Value>, LspFailure> {
        let key = self.keys.lock().await.key(node);
        if let Some(bases) = self.bases.lock().await.get(&key).cloned() {
            return Ok(bases);
        }
        let path = node_path(node)?;
        let source = self.source(&path).await?;
        let document = self.document(&path).await?;
        let bases = heritage::direct_bases(&document, &source.content, &path, node)
            .map_err(LspFailure::invalid_query)?;
        let mut resolved = Vec::new();
        for base in bases {
            match self.definitions(&path, base.line, base.character).await {
                Ok(nodes) => resolved.extend(nodes),
                Err(failure) if failure.code == "cancelled" => return Err(failure),
                Err(failure) => self.fail(failure.message).await,
            }
        }
        self.bases.lock().await.insert(key, resolved.clone());
        Ok(resolved)
    }

    async fn subtypes(&self, parent: &Value) -> Result<Vec<Value>, LspFailure> {
        let path = node_path(parent)?;
        let (line, character) = node_position(parent)?;
        let parent_key = self.keys.lock().await.key(parent);
        let seed = self.initial.lock().await.take();
        let candidates = match seed {
            Some((root, candidates)) if self.keys.lock().await.key(&root) == parent_key => {
                candidates
            }
            _ => {
                get_locations(
                    self.client,
                    self.snippet_policy,
                    self.cancel,
                    LocationRequest::Implementation,
                    &path,
                    line,
                    character,
                )
                .await?
            }
        };
        if candidates.len() > MAX_HIERARCHY_NODES {
            self.candidate_limit
                .store(true, std::sync::atomic::Ordering::Relaxed);
        }
        let mut direct = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for candidate in candidates.into_iter().take(MAX_HIERARCHY_NODES) {
            self.cancel.check().map_err(LspFailure::cancelled)?;
            let path = uri_to_path(&candidate.uri);
            let resolved = match self
                .resolved_nodes(
                    &path,
                    candidate.range.start.line,
                    candidate.range.start.character,
                )
                .await
            {
                Ok(resolved) => resolved,
                Err(failure) if failure.code == "cancelled" => return Err(failure),
                Err(failure) => {
                    self.fail(failure.message).await;
                    continue;
                }
            };
            let mut distinct = {
                let mut keys = self.keys.lock().await;
                let mut identities = std::collections::HashSet::new();
                resolved
                    .into_iter()
                    .filter(|node| identities.insert(keys.key(node)))
                    .collect::<Vec<_>>()
            };
            if distinct.len() > 1 {
                self.fail(format!(
                    "Implementation candidate at {path}:{}:{} resolves to {} distinct type declarations; its immediate subtype identity is ambiguous",
                    candidate.range.start.line + 1,
                    candidate.range.start.character + 1,
                    distinct.len()
                )).await;
                continue;
            }
            let Some(candidate) = distinct.pop() else {
                continue;
            };
            let identity = self.keys.lock().await.key(&candidate);
            if identity == parent_key || !seen.insert(identity) {
                continue;
            }
            match self.bases(&candidate).await {
                Ok(bases) => {
                    let mut keys = self.keys.lock().await;
                    if bases.iter().any(|base| keys.key(base) == parent_key) {
                        direct.push(candidate);
                    } else if bases.is_empty() {
                        self.fail(format!("No resolved immediate heritage establishes the implementation candidate {}", candidate["name"])).await;
                    }
                }
                Err(failure) if failure.code == "cancelled" => return Err(failure),
                Err(failure) => self.fail(failure.message).await,
            }
        }
        Ok(direct)
    }

    pub(super) async fn run(
        &self,
        anchor: Position<'_>,
        expansion: Expansion,
        depth: u32,
        initial: Option<Vec<JsCodeSnippet>>,
    ) -> Result<HierarchyWalk, LspFailure> {
        let roots = self
            .resolved_nodes(anchor.path, anchor.line, anchor.character)
            .await?;
        if let Some(initial) = initial {
            if roots.len() != 1 {
                return Err(LspFailure::invalid_query(
                    "Cannot assign implementation candidates to an ambiguous type anchor",
                ));
            }
            *self.initial.lock().await = Some((roots[0].clone(), initial));
        }
        let paths = self.sources.lock().await.policy();
        let mut walk = Walk::new(paths, &roots, expansion, depth)
            .finish(self, self.cancel)
            .await?;
        walk.failures.extend(self.failures.lock().await.drain(..));
        Ok(walk)
    }
}

impl HierarchySource for Fallback<'_, '_> {
    async fn expand(&self, expansion: Expansion, item: Value) -> Result<Value, EngineError> {
        let result = match expansion {
            Expansion::Supertypes => self.bases(&item).await,
            Expansion::Subtypes => self.subtypes(&item).await,
            _ => Err(LspFailure::invalid_query(
                "The heritage source expands only type hierarchy edges",
            )),
        };
        result.map(|nodes| json!(nodes)).map_err(|failure| {
            if failure.code == "cancelled" {
                EngineError::cancelled()
            } else {
                EngineError::new(failure.message)
            }
        })
    }
}

fn node_path(node: &Value) -> Result<String, LspFailure> {
    node.get("uri")
        .and_then(Value::as_str)
        .map(uri_to_path)
        .ok_or_else(|| LspFailure::invalid_query("Type declaration has no local URI"))
}

fn node_position(node: &Value) -> Result<(u32, u32), LspFailure> {
    let point = |field: &str| {
        node.pointer(&format!("/selectionRange/start/{field}"))
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
    };
    match (point("line"), point("character")) {
        (Some(line), Some(character)) => Ok((line, character)),
        _ => Err(LspFailure::invalid_query(
            "Type declaration has no exact anchor",
        )),
    }
}

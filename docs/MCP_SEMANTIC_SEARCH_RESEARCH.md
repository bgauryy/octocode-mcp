# MCP Semantic Code Search Tools — Research Summary

> Research conducted via Octocode GitHub tools. Covers MegaMemory, bluera-knowledge, mcp-local-rag, and cross-cutting patterns.

---

## 1. MegaMemory (0xK3vin/MegaMemory, 39 stars)

### Architecture

- **Paradigm**: Knowledge graph of **concepts** (features, modules, patterns, config, decisions, components), not code symbols.
- **Indexer**: The LLM is the indexer — no AST parsing, no static analysis. The agent reads code, writes concepts in natural language, and queries them later.
- **Storage**: SQLite (libsql) at `.megamemory/knowledge.db`, WAL mode, schema v3, soft-delete history.
- **Embeddings**: In-process via `@xenova/transformers` — `Xenova/all-MiniLM-L6-v2` (ONNX, quantized, 384 dims). No API keys, no network after first model download.

### Knowledge Graph Approach

- **Nodes**: `id`, `name`, `kind`, `summary`, `why`, `file_refs`, `parent_id`, `embedding`, `merge_group`, etc.
- **Edges**: `from_id`, `to_id`, `relation` (`connects_to`, `depends_on`, `implements`, `calls`, `configured_by`).
- **Search**: Brute-force cosine similarity over node embeddings; `findTopK()` loads all candidates and scores in memory.
- **Flow**: `understand → work → update` — agent calls `list_roots` to orient, `understand` before tasks, `create_concept` / `update_concept` after tasks.

### What’s Unique

- **LLM-as-indexer**: Concepts are agent-authored, not extracted from code.
- **Merge engine**: Two-way merge of `knowledge.db` across branches with conflict detection and AI-assisted resolution via MCP tools (`list_conflicts`, `resolve_conflict`).
- **Web explorer**: `megamemory serve` for D3-force graph visualization.
- **Timeline**: `timeline` table for audit/tool history.

### MCP Tools

| Tool | Purpose |
|------|---------|
| `understand` | Semantic search over the graph; returns matches with children, edges, parent context |
| `create_concept` | Add concept with optional edges and file refs |
| `update_concept` | Update fields; regenerates embeddings |
| `link` | Create typed relationship between two concepts |
| `remove_concept` | Soft-delete with reason |
| `list_roots` | Top-level concepts with direct children |
| `list_conflicts` | Unresolved merge conflicts |
| `resolve_conflict` | Resolve conflict with verified content |

### Code Patterns

- **Embedding text**: `embeddingText(name, kind, summary)` → `"${kind}: ${name} — ${summary}"`.
- **Similarity**: `cosineSimilarity(a, b)` in `embeddings.ts`; `findTopK()` filters candidates with embeddings and sorts by similarity.
- **Understand handler**: `embed(query)` → `getAllActiveNodesWithEmbeddings()` → `findTopK()` → `buildNodeWithContext()` for each match.

---

## 2. bluera-knowledge (blueraai/bluera-knowledge, 8 stars)

### Architecture

- **Paradigm**: Local-first knowledge base for **dependencies, docs, and local files** — all searchable offline.
- **Sources**: Git repos (dependency source), web docs (Playwright crawl), local folders.
- **Storage**: LanceDB with HuggingFace embedding functions; `src/db/lance.ts`, `lance-embedding-function.ts`.

### Embedding Model Choice

- **Default**: `Xenova/bge-small-en-v1.5` (previously `all-MiniLM-L6-v2`). Model registry in `src/models/registry.js`.
- **Config**: `EmbeddingConfig` with `model`, `batchSize`, `pooling`, `normalize`, `queryPrefix`, `docPrefix`, `maxInFlightBatches`.
- **Query prefix**: Optional `BK_QUERY_PREFIX` for query/document asymmetry.
- **Lazy init**: `EmbeddingEngine` uses `initPromise` for lazy initialization; `ensureDimensions()` probes on first use.

### Search Approach

- **Semantic vector search**: By meaning and intent.
- **Full-text search (FTS)**: Keyword and pattern matching.
- **Hybrid mode**: Merges vector + FTS with weighted ranking.
- **Direct file access**: Grep/Glob on cloned source trees.
- **Intent classification**: `QueryIntent` (how-to, implementation, conceptual, comparison, debugging) with file-type boosts (`INTENT_FILE_BOOSTS`).

### What’s Different

- **Multi-source**: Repos, docs, local files in one index.
- **Code graph**: AST-based analysis (Babel for JS/TS, Python AST, tree-sitter for Rust/Go) for calls, imports, extends.
- **Background jobs**: Long-running indexing in separate process; job IDs; progress updates.
- **Dependency analysis**: Scans imports to suggest most-used dependencies.
- **Plugin + CLI**: Claude Code plugin with slash commands; npm package for CLI/automation.

### MCP Tools

| Tool | Purpose |
|------|---------|
| `search` | Semantic vector search across stores |
| `get_full_context` | Full code context for a search result |
| `execute` | Meta-tool for store/job management commands |

---

## 3. mcp-local-rag (shinpr/mcp-local-rag, 107 stars)

### Architecture

- **Paradigm**: Local RAG for documents (PDF, DOCX, TXT, MD, HTML). Zero setup, one `npx` command.
- **Storage**: LanceDB (file-based, no server).

### Modular Design

```
src/
  index.ts
  server/
  parser/     # PDF (pdfjs-dist), DOCX (mammoth), TXT, MD
  chunker/    # semantic-chunker.ts, sentence-splitter.ts
  embedder/   # Transformers.js
  vectordb/   # LanceDB
```

### Chunker

- **Semantic chunking**: Uses embedding similarity to find topic boundaries.
- **Flow**: `splitIntoSentences()` → `embedder.embedBatch(sentences)` → `groupSentences()` by similarity.
- **Config**: `hardThreshold`, `initConst`, `c`, `minChunkLength`.
- **Logic**: `shouldAddToChunk()` compares new sentence embedding to chunk via `getMinSimilarity` / `getMaxSimilarity`; `calculateThreshold()` uses sigmoid.
- **Code blocks**: Markdown code blocks kept intact.

### Embedder

- **Lazy init**: `ensureInitialized()` with `initPromise`; first use triggers download and logs.
- **Error handling**: `EmbeddingError` with cause and suggested actions.
- **Batch**: `embedBatch()` with configurable `batchSize`.

### VectorDB

- **LanceDB**: `connect`, `createTable` / `openTable`, `add`, `delete`.
- **FTS**: `Index.fts()` with ngram config; `ensureFtsIndex()`; `rebuildFtsIndex()` after inserts.
- **Hybrid search**: Vector search first, then keyword boost on `queryText` in `applyKeywordBoost()`.
- **Grouping**: `applyGrouping()` uses relevance gaps (mean + std) to cut low-quality results.

### Index Lifecycle

- **Build**: `insertChunks()` creates table or appends.
- **Update**: Re-ingesting same file replaces old chunks via `deleteChunks(filePath)` then `insertChunks()`.
- **Invalidate**: `deleteChunks(filePath)` for a single file.

---

## 4. Common Patterns

### Across Implementations

| Pattern | MegaMemory | bluera-knowledge | mcp-local-rag |
|---------|------------|------------------|---------------|
| **Local embeddings** | Xenova/all-MiniLM-L6-v2 | bge-small-en-v1.5 | Xenova/all-MiniLM-L6-v2 |
| **Lazy model init** | `getExtractor()` | `initPromise` | `ensureInitialized()` |
| **Storage** | SQLite | LanceDB | LanceDB |
| **Hybrid search** | No | Vector + FTS | Vector + keyword boost |
| **Chunking** | N/A (concepts) | AST / code units | Semantic (embedding-based) |
| **MCP tools** | 8 tools | 3 tools | 6 tools |

### Tree-sitter + Chunk in MCP

- **cocoindex-code-mcp-server**: Tree-sitter for 20+ languages; ASTChunk; language-specific embeddings (GraphCodeBERT, UniXcoder).
- **bluera-knowledge**: Tree-sitter for Rust/Go; Babel for JS/TS, Python AST.
- **Pommel**: Tree-sitter chunker (AST-aware).
- **evilezh/codesearch**: Tree-sitter for JS/TS, Java, Go, Python, C/C++, C#, Rust, Bash, HCL, JSON, YAML, HTML, CSS, XML.
- **supermemoryai/code-chunk**: Tree-sitter chunks at semantic boundaries (functions, classes, methods) with scope chain, imports, siblings.

### Index Lifecycle

- **Build**: Initial ingest or index.
- **Update**: Re-ingest replaces (mcp-local-rag), or incremental (cocoindex, bluera).
- **Invalidate**: Per-file delete (mcp-local-rag), store delete (bluera), or full reindex (MegaMemory when model changes).

### Model Loading and Caching

- **Singleton**: One pipeline instance per process.
- **Lazy**: Load on first `embed()` / `embedQuery()`.
- **Cache dir**: `env.cacheDir` (HuggingFace) or `CACHE_DIR` env.
- **Error recovery**: Clear `initPromise` on failure; retry or manual cache clear.

### Result Formatting

- **MegaMemory**: `NodeWithContext` with `children`, `edges`, `incoming_edges`, `parent`, `similarity`.
- **mcp-local-rag**: `SearchResult` with `filePath`, `chunkIndex`, `text`, `score`, `metadata`.
- **bluera**: `SearchResult` with `CodeUnit`, `SearchConfidence`, `DetailLevel`.

### Error Handling

- **MegaMemory**: `formatError()` → `MEGAMEMORY_ERROR: ${msg}`.
- **mcp-local-rag**: `EmbeddingError`, `DatabaseError` with `cause` and suggested actions.
- **bluera**: FTS fallback on failure (`this.ftsEnabled = false`).

---

## 5. Best Practices

### What Strong Implementations Do

1. **Semantic chunking**: Use embedding similarity (mcp-local-rag) or AST boundaries (cocoindex, bluera) instead of fixed character splits.
2. **Keyword boost**: Combine vector search with FTS for exact matches (`useEffect`, error codes, class names).
3. **Quality grouping**: Filter by relevance gaps (mcp-local-rag) instead of arbitrary top-K.
4. **Lazy model init**: Defer download until first use; avoid startup delay.
5. **Structured errors**: Custom error types with `cause` and suggested actions.
6. **FTS fallback**: Graceful degradation when FTS fails.
7. **Configurable embedding**: `MODEL_NAME`, `RAG_HYBRID_WEIGHT`, `RAG_GROUPING` via env.
8. **Agent skills**: mcp-local-rag ships skills for query optimization and result interpretation.

---

## 6. Anti-patterns and Limitations

### What to Avoid

1. **Brute-force at scale**: MegaMemory admits “fast enough for graphs with <10k nodes” — not suitable for large codebases.
2. **No incremental for concepts**: MegaMemory concepts are agent-driven; no automatic sync from code changes.
3. **Model change = full reindex**: Changing `MODEL_NAME` requires deleting DB and re-ingesting (mcp-local-rag), or reindexing (bluera).
4. **Single embedding model**: Most tools use one model; cocoindex’s language-specific models are an exception.
5. **No tree-sitter**: MegaMemory uses no AST; mcp-local-rag is document-focused, not code-focused.
6. **FTS index rebuild**: mcp-local-rag rebuilds FTS after each insert; may be slow for large batches.
7. **Blocking init**: Some tools block on first use; background jobs (bluera) improve UX.

### Limitations

- **MegaMemory**: No code-level search; concepts only; merge conflicts require manual resolution.
- **bluera**: Heavy setup (Playwright, Python optional); Node 24+ not yet supported.
- **mcp-local-rag**: Document-focused; no code AST; no incremental indexing.

---

## 7. Recommendations for Octocode MCP

1. **Hybrid search**: Add keyword boost for semantic search (e.g. `RAG_HYBRID_WEIGHT`).
2. **Semantic chunking**: Consider embedding-based chunking for docs; keep AST-based for code.
3. **Lazy init**: Use `ensureInitialized()` pattern for embedder.
4. **Error types**: `EmbeddingError`, `DatabaseError` with `cause` and recovery hints.
5. **FTS fallback**: Graceful degradation when FTS fails.
6. **Config via env**: `MODEL_NAME`, `CACHE_DIR`, `DB_PATH`, search tuning.
7. **Agent skills**: Optional skills for query formulation and result interpretation.

---

## References

- [MegaMemory](https://github.com/0xK3vin/MegaMemory)
- [bluera-knowledge](https://github.com/blueraai/bluera-knowledge)
- [mcp-local-rag](https://github.com/shinpr/mcp-local-rag)
- [cocoindex-code-mcp-server](https://github.com/aanno/cocoindex-code-mcp-server) — tree-sitter + language-specific embeddings

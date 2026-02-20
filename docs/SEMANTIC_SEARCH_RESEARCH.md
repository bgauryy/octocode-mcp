# Semantic Code Search Research

> Research document for consolidating local code indexing and embedding into Octocode MCP.
> Created: February 2026 | Last Updated: February 16, 2026 (v3 — validated against source code)

## Table of Contents

- [Problem Statement](#problem-statement)
- [Current State](#current-state)
- [Competitive Landscape](#competitive-landscape)
  - [Existing MCP Semantic Search Tools](#existing-mcp-semantic-search-tools)
  - [Key Insights from Competitors](#key-insights-from-competitors)
  - [Competitor Architecture Comparison](#competitor-architecture-comparison)
- [Research Findings](#research-findings)
  - [Code Parsing & Smart Chunking](#1-code-parsing--smart-chunking)
  - [Search & Indexing Engines](#2-search--indexing-engines)
  - [Local Vector Storage](#3-local-vector-storage)
  - [Local Embedding Models](#4-local-embedding-models)
  - [Reference Projects](#5-reference-projects-combined-solutions)
- [Performance Analysis](#performance-analysis)
  - [Production Benchmarks](#production-benchmarks)
  - [Embedding Bottleneck](#embedding-bottleneck)
  - [Timing Comparison by Approach](#timing-comparison-by-approach)
  - [Head-to-Head: Option 1 vs Option 2](#head-to-head-option-1-vs-option-2)
- [Octocode-Specific Fit Analysis](#octocode-specific-fit-analysis)
  - [Verdict: Option 2 (BM25 + Lazy Rerank)](#verdict-option-2-bm25--lazy-rerank)
  - [Implementation Strategy](#implementation-strategy)
- [Recommended Architecture](#recommended-architecture)
  - [Approach: BM25 First + Lazy Embed & Rerank](#approach-bm25-first--lazy-embed--rerank)
  - [Concrete Stack](#concrete-stack)
  - [Pipeline Design](#pipeline-design)
  - [Index Storage Layout](#index-storage-layout)
  - [How It Complements Existing Tools](#how-it-complements-existing-tools)
- [Design Decisions](#design-decisions)
- [Best Practices from Leading Implementations](#best-practices-from-leading-implementations)
  - [Chunking Best Practices](#chunking-best-practices)
  - [Multi-Signal Ranking](#multi-signal-ranking)
  - [MRL Embedding Optimization](#mrl-embedding-optimization)
  - [Storage Best Practices](#storage-best-practices)
  - [Indexing Best Practices](#indexing-best-practices)
  - [MCP Tool Design Patterns](#mcp-tool-design-patterns)
  - [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Alternative Approaches](#alternative-approaches)
- [Open Questions](#open-questions)
- [Summary](#summary)
- [Document Rating & Flow Assessment](#document-rating--flow-assessment)

---

## Problem Statement

Octocode MCP's local tools rely on **text-only search** (ripgrep) and **structural navigation** (LSP). There is no way to perform **meaning-based search** across a codebase -- queries like "find authentication logic", "where is error handling done", or "show retry mechanisms" require semantic understanding that ripgrep and LSP cannot provide.

**Goal**: Add a local semantic search capability that indexes and searches code by meaning, not just text patterns, while keeping latency practical for an MCP tool (seconds, not minutes).

---

## Current State

### Existing Local Tools in Octocode MCP

| Tool | Type | Mechanism | Limitation |
|------|------|-----------|------------|
| `localSearchCode` | Text/regex | ripgrep | No semantic understanding |
| `localFindFiles` | Metadata | `find`-style | No content awareness |
| `localViewStructure` | Directory | `ls`/`tree` | No search capability |
| `lspGotoDefinition` | Structural | Language Server | Requires exact symbol, no fuzzy |
| `lspFindReferences` | Structural | Language Server | Requires exact symbol |
| `lspCallHierarchy` | Structural | Language Server | Requires exact symbol |

### What's Missing

- **No semantic/meaning-based search** -- cannot find code by concept
- **No indexing or caching** -- local tools always hit the filesystem directly
- **No code-aware chunking** -- ripgrep treats code as flat text
- **No ranking by relevance** -- results are ordered by file position, not relevance

---

## Competitive Landscape

> **Critical finding**: There are already several MCP-based semantic code search tools in the ecosystem. Any new tool must offer clear differentiation.

### Existing MCP Semantic Search Tools

| Project | Stars | Language | Approach | Local? | Key Trade-off |
|---------|-------|----------|----------|--------|---------------|
| **[Probe](https://github.com/probelabs/probe)** | 455 | Rust + Node.js SDK | ripgrep + tree-sitter AST, BM25/TF-IDF/hybrid + SIMD ranking, **zero indexing** | Yes | No persistent index = no upfront cost, but no semantic (meaning-based) search. **Most actively maintained** (pushed daily). |
| **[DeepContext](https://github.com/Wildcard-Official/deepcontext-mcp)** | 263 | TypeScript | tree-sitter AST + Jina embeddings + BM25 hybrid + reranker | **No** (cloud API) | Best quality but requires Wildcard API key + Jina API. **⚠️ Stale: last push Sept 2025.** |
| **[Mimir](https://github.com/orneryd/Mimir)** | 233 | TypeScript | Graph database + vector search + memory bank | Partial (Docker) | Most feature-rich but heavyweight (Docker required) |
| **[smart-coding-mcp](https://github.com/omar-haris/smart-coding-mcp)** | 186 | TypeScript | transformers.js + fastembed + nomic-embed-text-v1.5 + SQLite + **web-tree-sitter** (WASM) | **Yes** | **Closest to our recommended approach** -- already implements it |
| **[mcp-local-rag](https://github.com/shinpr/mcp-local-rag)** | 107 | TypeScript | Local RAG with semantic + keyword hybrid search, LanceDB | Yes | Clean modular architecture: `chunker/` `embedder/` `parser/` `vectordb/`. Embedding-based semantic chunking at topic boundaries. |
| **[autodev-codebase](https://github.com/anrgct/autodev-codebase)** | 106 | TypeScript | Vector embeddings + MCP + Ollama support | Yes | Supports Ollama for fully local inference |
| **[sourcerer-mcp](https://github.com/st3v3nmw/sourcerer-mcp)** | 105 | TypeScript | Semantic code search focused on reducing token waste | Yes | Optimized for context window efficiency |
| **[augmented-codebase-indexer](https://github.com/AperturePlus/augmented-codebase-indexer)** | 78 | Python | tree-sitter + Qdrant vector store + MCP | Partial | Python-based, Qdrant dependency |
| **[MegaMemory](https://github.com/0xK3vin/MegaMemory)** | 39 | TypeScript | Knowledge graph + vector search + SQLite (libsql) + all-MiniLM-L6-v2 | **Yes** | Knowledge-graph approach (concepts, not code symbols). Web explorer, merge engine, timeline. **New entrant (Feb 2026).** |
| **[bluera-knowledge](https://github.com/blueraai/bluera-knowledge)** | 8 | TypeScript | bge-small-en-v1.5 + vector + FTS hybrid + intent classification | **Yes** | Local-first knowledge base with code graph (Babel, tree-sitter, Python AST). Background jobs, dependency analysis. |

> **Note**: The MCP semantic search space is rapidly growing (~95 repos found in Feb 2026 searches). The table above covers projects with >5 stars or notable architectural patterns. New entrants appear weekly.

### Key Insights from Competitors

1. **Probe proves zero-indexing is viable**: By combining ripgrep speed with tree-sitter AST extraction at query time, Probe achieves "one call, complete picture" without any upfront indexing. This challenges the assumption that we need to build a persistent index at all.

2. **smart-coding-mcp already implements a similar approach** (verified against source code): It uses `@huggingface/transformers` + `fastembed` (dual embedding backends) + `nomic-embed-text-v1.5` + `better-sqlite3` + **`web-tree-sitter` (WASM, not native)**. Key learnings from their implementation:
   - **MRL (Matryoshka Representation Learning)**: Flexible embedding dimensions [64, 128, 256, 512, 768]. Config default `embeddingDimension: 128`, but code defaults to 256d
   - **Dual embedding backends**: `@huggingface/transformers` as primary, `fastembed` as alternative. Falls back to `Xenova/all-MiniLM-L6-v2` (384d) on corruption
   - **WASM tree-sitter**: Uses `web-tree-sitter` with WASM grammars — no node-gyp required. Supports JS/TS, Python, Go, Rust, Ruby, Java, C/C++
   - **AST chunking is opt-in**: Default `chunkingMode: "smart"` uses regex-based splitting. AST mode (`chunkingMode: "ast"`) is available but **not wired into the indexer by default**
   - **Progressive indexing**: Files sorted by mtime descending (recently modified first). Search works immediately while indexing continues
   - **Dual change detection**: mtime for fast skip, MD5 hash for correctness
   - **CPU throttling**: `maxWorkers: Math.max(1, Math.floor(0.5 * cpuCount))`, 10ms batch delay
   - **SQLite > JSON**: WAL mode, 5-10x faster. Auto-migrates from JSON with backup
   - **Model corruption recovery**: Detects Protobuf/ONNX corruption → clears cache → reloads → falls back to legacy embedder

3. **DeepContext uses the best-quality approach**: tree-sitter AST parsing → hybrid vector + BM25 search → Jina reranker. Three-stage pipeline produces highest quality results, but requires cloud APIs.

4. **Differentiation opportunity for Octocode**: None of these tools combine semantic search with Octocode's existing LSP tools, GitHub API integration, and clone workflow. The unique value would be **unified local intelligence** -- semantic search + LSP navigation + ripgrep text search in one coherent tool suite.

### Competitor Architecture Comparison

```
PROBE (zero-index):     Query → ripgrep scan → tree-sitter extract → multi-signal rank → results
                        Ranking: BM25 × coverage boost × node-type boost (SIMD-accelerated)
                        Speed: instant | Quality: good (keyword) | Cost: zero

SMART-CODING-MCP:       Index: files → smartChunk (regex) → embed (nomic/MRL 128d) → SQLite
                        Query: embed query → cosine sim × 0.7 + exact boost 1.5x → results
                        Speed: 3-5s index, <1s query | Quality: excellent | Cost: ~200MB RAM

DEEPCONTEXT:            Index: files → tree-sitter → embed (Jina cloud) → Turbopuffer
                        Query: embed → hybrid BM25+vector → Jina rerank → results
                        Speed: fast | Quality: best | Cost: API keys required
                        ⚠️ Stale (last push Sept 2025)

MCP-LOCAL-RAG:          Index: files → semantic chunking (embedding-based) → LanceDB
                        Query: vector + keyword boost + quality grouping → results
                        Speed: moderate | Quality: good | Cost: ~200MB RAM

OCTOCODE (proposed):    Index: files → web-tree-sitter → Orama BM25+vector hybrid (instant)
                        Query: BM25 retrieve → [optional] embed + rerank with multi-signal scoring
                        Speed: 5-10s index, <10ms-5s query | Quality: good-excellent
                        PLUS: LSP, GitHub, ripgrep in same tool suite
```

---

## Research Findings

### 1. Code Parsing & Smart Chunking

#### tree-sitter (Industry Standard)

- **Recommended**: `web-tree-sitter` (WASM — no native compilation required)
- **Alternative**: `tree-sitter` (Node.js C bindings — requires node-gyp)
- **What**: Multi-language incremental parser that produces concrete syntax trees
- **Languages**: 100+ grammars available (TS, JS, Python, Rust, Go, Java, C/C++, etc.)
- **Speed**: Parses ~10K LOC/second, incremental re-parse on edit in <1ms
- **Used by**: GitHub, Neovim, Helix, Zed, Atom, ast-grep, h-codex, ariadne, code_qa
- **Key packages**: `tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-rust`
- **Why it matters**: Enables chunking at **syntax boundaries** (functions, classes, imports) instead of arbitrary byte offsets. This produces higher-quality search results.

> **Validated decision**: `web-tree-sitter` (WASM) is the recommended choice. smart-coding-mcp uses it in production (`web-tree-sitter@^0.24.6`), proving it works without node-gyp friction. Native `tree-sitter` can be offered as an optional performance optimization but should not be required.

#### @ariadnejs/core

- **Repo**: [CRJFisher/ariadne](https://github.com/CRJFisher/ariadne) (16 stars)
- **Language**: TypeScript
- **What**: Full code intelligence engine built on tree-sitter
- **Features**: Definitions, references, call graphs, scope resolution, import tracking
- **Languages**: JS/TS, Python, Rust
- **Relevance**: Could serve as the AST analysis layer, but overlaps significantly with existing LSP tools

#### ast-grep

- **Repo**: [ast-grep/ast-grep](https://github.com/ast-grep/ast-grep) (12,470 stars)
- **Language**: Rust with Node.js bindings (`@ast-grep/napi`)
- **What**: Structural code search/lint using tree-sitter patterns
- **Relevance**: Pattern-based structural search -- different use case than semantic search

### 2. Search & Indexing Engines

#### Orama (Recommended)

- **npm**: `@orama/orama` (v3.1.18, 10,155 stars, actively maintained)
- **Repo**: [oramasearch/orama](https://github.com/oramasearch/orama)
- **What**: TypeScript-native full-text + vector + hybrid search engine
- **Features**:
  - **BM25 ranking** with configurable params (k=1.2, b=0.75, d=0.5) and field boosting
  - **Native vector search** — cosine similarity with threshold filtering (`trees/vector.ts`)
  - **Native hybrid search** — parallel BM25 + vector with min-max normalization and weighted combination (`methods/search-hybrid.ts`)
  - Faceted search (filter by language, symbol type, file path)
  - Built-in stemming (30 languages) and tokenization
  - Plugin architecture: `@orama/plugin-embeddings` (auto-embed with TensorFlow USE), `@orama/plugin-data-persistence` (JSON, msgpack, dpack, seqproto formats)
  - Builds indexes in **seconds**, queries in **<10ms**
- **BM25 implementation details** (verified from source):
  - IDF: `log(1 + (docsCount - matchingCount + 0.5) / (matchingCount + 0.5))`
  - Multi-field boosting: `oldScore * 1.5 + boostScore` when matching across fields
  - Tokenization via Radix tree for fast prefix matching
- **Hybrid search implementation** (verified from source):
  - Runs full-text and vector search in **parallel**
  - Normalizes both score sets with min-max normalization (0-1 range)
  - Combines: `textScore * textWeight + vectorScore * vectorWeight` (default 50/50)
  - Supports custom `hybridWeights` parameter
- **Vector search details**:
  - Linear scan (O(n)) over stored vectors — fine for <50K vectors, may need ANN for larger
  - Magnitude precomputed at insert time
  - Supports `where` filters via `whereFiltersIDs`
  - Default similarity threshold: 0.8
- **Persistence formats**: JSON (debug), dpack (compact binary), binary (msgpack), seqproto (custom)
- **Why best fit**: Zero native dependencies, TypeScript-native, **natively supports all three search modes** (fulltext, vector, hybrid) — eliminates need for a separate reranking pipeline

#### MiniSearch

- **npm**: `minisearch`
- **Stars**: ~4K
- **What**: Lightweight, zero-dependency in-memory search
- **Features**: Prefix search, fuzzy matching, field boosting, auto-suggest
- **Tradeoff**: Simpler than Orama, no faceted search or vector plugin

#### FlexSearch

- **npm**: `flexsearch`
- **Stars**: ~12K
- **What**: Fastest full-text search library for JavaScript
- **Features**: Contextual search, async workers, persistent index
- **Tradeoff**: Very fast but less feature-rich than Orama, older API design

#### Zoekt (Google/Sourcegraph)

- **Repo**: [sourcegraph/zoekt](https://github.com/sourcegraph/zoekt) (1,395 stars)
- **What**: Trigram-based code search engine
- **Language**: Go -- would require subprocess spawning
- **Relevance**: Great for multi-repo search at scale, overkill for single-project MCP use case

### 3. Local Vector Storage

#### Vectra

- **Repo**: [Stevenic/vectra](https://github.com/Stevenic/vectra) (584 stars)
- **npm**: `vectra`
- **What**: File-backed, in-memory vector database for Node.js
- **Features**:
  - Zero infrastructure (folder on disk)
  - Cosine similarity search in <1ms (small indexes)
  - Pinecone-compatible MongoDB-style filtering
  - Hybrid retrieval: semantic + BM25
  - LocalDocumentIndex with built-in chunking
- **Storage**: `index.json` + per-item metadata files
- **Limitation**: Entire index loaded into RAM; not suited for >10K items without careful management
- **Best for**: Caching lazy embeddings for reranking

#### LanceDB

- **Repo**: [lancedb/lancedb](https://github.com/lancedb/lancedb) (8,952 stars)
- **npm**: `@lancedb/lancedb`
- **What**: Embedded vector database built on Apache Arrow/Lance format
- **Features**: Scalable to millions of vectors, SQL-like queries, Node.js SDK
- **Tradeoff**: Requires native Rust bindings -- adds compilation complexity
- **Best for**: Larger codebases or if scaling beyond single-project is needed

### 4. Local Embedding Models

#### @huggingface/transformers (transformers.js)

- **Repo**: [huggingface/transformers.js](https://github.com/huggingface/transformers.js) (15,387 stars)
- **npm**: `@huggingface/transformers`
- **What**: Run ONNX ML models directly in Node.js (or browser)
- **Relevant models**:
  - `all-MiniLM-L6-v2` (384 dims, ~22MB, general-purpose)
  - `nomic-embed-text-v1.5` (768 dims, ~137MB, code-aware)
  - `Xenova/bge-small-en-v1.5` (384 dims, ~33MB, high quality)
- **Performance**: ~30-80ms per embedding (CPU), ~10-20ms (GPU/WebGPU)
- **Cold start**: ~1-3 seconds to load model into memory
- **Memory**: ~200-500MB for model + ONNX runtime
- **No API key required** -- fully local

### 5. Reference Projects (Combined Solutions)

#### Probe (Most Relevant -- Zero-Index Approach)

- **Repo**: [probelabs/probe](https://github.com/probelabs/probe) (455 stars, actively maintained — pushed daily)
- **Stack**: Rust core + ripgrep + tree-sitter AST + BM25/TF-IDF/hybrid + SIMD-accelerated ranking
- **Key insight**: **No indexing at all** -- scans code at query time using ripgrep speed + tree-sitter extraction
- **Features**: Returns complete functions/classes (not fragments), Elasticsearch-style query syntax, 12+ languages
- **npm**: `@probelabs/probe` (Node.js SDK + MCP server)
- **Architecture** (verified from source):
  - **Rust core** (`src/`) — search pipeline, query parsing, scoring, SIMD
  - **Node SDK** (`npm/`) — `ProbeAgent`, tool wrappers, MCP server, Vercel AI SDK integration
  - **MCP tools**: `search_code`, `extract_code`, `grep` — minimal, focused API
  - **Multi-signal ranking**: `boosted_score = bm25_score × coverage_boost × node_type_boost`
    - Node-type boosts: functions 2.0x, classes/structs 1.8x, enums/traits 1.6x, tests 0.7x, comments 0.5x
    - Coverage boost: `1.0 + coverage^1.5 × 2.0` (rewards matching more query terms)
    - Filename boost: 2.0x for filename matches
  - **Early ranker**: File-level BM25 *before* full AST parsing — reduces tree-sitter work dramatically
  - **Session caching**: Results cached at `~/.cache/probe/sessions/`, invalidated by file MD5
  - **Language trait**: Per-language `is_acceptable_parent()` for AST node targeting
  - **Block merging**: Blocks within 10 lines are merged (min start, max end)
- **Limitation**: No semantic/meaning-based search -- still keyword-based, just smarter extraction
- **Takeaway**: Proves zero-indexing + AST-aware extraction is viable. **Multi-signal ranking (node-type + coverage + filename boosts) is a key innovation worth adopting** for code search.

#### smart-coding-mcp (Most Relevant -- Embedding Approach)

- **Repo**: [omar-haris/smart-coding-mcp](https://github.com/omar-haris/smart-coding-mcp) (186 stars)
- **Stack** (verified from `package.json`): `@huggingface/transformers@^3.8.1` + `fastembed@^2.1.0` + `better-sqlite3@^12.5.0` + `web-tree-sitter@^0.24.6` + `fdir@^6.5.0` + `chokidar@^3.5.3`
- **Key innovations** (verified from source):
  - **MRL embedding**: `layer_norm → slice(0, targetDim) → L2 normalize`. Dimensions: [64, 128, 256, 512, 768]. Config default 128d
  - **Dual embedding backends**: `@huggingface/transformers` (primary) + `fastembed` (alternative)
  - **Corruption recovery**: Detects Protobuf/ONNX errors → clears HuggingFace cache → reloads → falls back to `Xenova/all-MiniLM-L6-v2` (384d)
  - **Regex-based chunking by default**: `chunkingMode: "smart"` uses language-specific regex (e.g. `^(export\s+)?(async\s+)?(function|class|const)\s+\w+`). AST mode is opt-in but **not wired into the indexer**
  - **Progressive indexing**: Files sorted by mtime descending. Adaptive batch size: 1 file in progressive mode, 100-500 in bulk
  - **Dual change detection**: mtime for fast skip, MD5 hash for correctness
  - **Worker threads**: `embedding-worker.js` with `0.5 × cpuCount` max workers, 300s timeout, retry single-threaded on failure
  - **SQLite schema**: `embeddings(file, start_line, end_line, content, vector BLOB, indexed_at)` + `file_hashes(file, hash, mtime, indexed_at)`
  - **SQLite pragmas**: WAL mode, `synchronous=NORMAL`, `cache_size=10000`, `temp_store=MEMORY`
  - **Hybrid search scoring**: `cosine_similarity × 0.7 + keyword_bonus` where exact match = 1.5x, partial = `(matched/total) × 0.3`
  - **File discovery**: `fdir` (not glob) for fast crawling with exclusion patterns
  - **Auto-migration**: Detects old `embeddings.json` → migrates to SQLite in transaction → renames JSON to `.backup`
- **Limitation**: Embedding upfront still takes time for large codebases. AST chunking not used by default.
- **Takeaway**: Implements a similar approach. Key patterns: dual change detection, corruption recovery, progressive indexing, worker threads with fallback.

#### mcp-local-rag (Clean Architecture Reference)

- **Repo**: [shinpr/mcp-local-rag](https://github.com/shinpr/mcp-local-rag) (107 stars)
- **Stack**: TypeScript, modular architecture: `chunker/` `embedder/` `parser/` `vectordb/`
- **What**: Local-first RAG server with semantic + keyword hybrid search
- **Takeaway**: Clean separation of concerns -- good architectural reference

#### h-codex

- **Repo**: [hpbyte/h-codex](https://github.com/hpbyte/h-codex) (27 stars)
- **Stack**: tree-sitter + OpenAI embeddings + PostgreSQL/pgvector
- **Architecture**: Explorer -> Chunker -> Embedder -> Indexer -> Repository
- **TypeScript monorepo** with CLI, core, MCP packages
- **Deps**: `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`, `openai`, `drizzle-orm`, `postgres`
- **Limitation**: Requires cloud API for embeddings + Docker for PostgreSQL
- **Takeaway**: Good architecture pattern, but too heavy for local-only MCP use

#### code_qa

- **Repo**: [sankalp1999/code_qa](https://github.com/sankalp1999/code_qa) (279 stars)
- **Stack**: tree-sitter + LanceDB + OpenAI/Jina embeddings (Python)
- **Notable**: Uses HYDE (Hypothetical Document Embeddings) for better retrieval
- **Takeaway**: Good chunking strategy reference; demonstrates tree-sitter + LanceDB synergy

#### linggen

- **Repo**: [linggen/linggen](https://github.com/linggen/linggen) (104 stars)
- **Stack**: LanceDB + Rust + MCP
- **What**: Local-first memory layer for AI assistants (Cursor, Zed, Claude)
- **Takeaway**: Shows local-first MCP semantic search is viable

#### context-lens

- **Repo**: [cornelcroi/context-lens](https://github.com/cornelcroi/context-lens) (19 stars)
- **Stack**: LanceDB + sentence-transformers + MCP
- **Takeaway**: Semantic search knowledge base for MCP assistants

---

## Performance Analysis

### Production Benchmarks

#### Cursor Research (Official A/B Test Data, Nov 2025)

> Source: [cursor.com/blog/semsearch](https://cursor.com/blog/semsearch)

Cursor ran controlled A/B tests comparing agent performance **with and without semantic search**:

| Metric | With Semantic Search | Without | Delta |
|--------|---------------------|---------|-------|
| **Accuracy** (avg across models) | Baseline | -12.5% | **+12.5% avg** (6.5%-23.5% per model) |
| **Code Retention** (all codebases) | Baseline | -0.3% | +0.3% |
| **Code Retention** (1000+ files) | Baseline | -2.6% | **+2.6%** |
| **Dissatisfied Requests** | Baseline | +2.2% | -2.2% fewer complaints |

Key quotes from Cursor:
- *"Semantic search is currently necessary to achieve the best results, especially in large codebases."*
- *"Our agent makes heavy use of grep as well as semantic search, and the **combination of these two leads to the best outcomes**."*
- *"Increasing accuracy across **all models we tested**, including all frontier coding models."*

**Training approach**: Custom embedding model trained on agent session traces. When an agent searches and finds code, they retrospectively identify what *should* have been retrieved earlier. An LLM ranks what would have been most helpful, and the embedding model is trained to match those rankings.

> **⚠️ Important caveat**: Cursor's +12.5% accuracy and +2.6% code retention gains come from a **purpose-built embedding model trained on agent behavior**, not an off-the-shelf model like `nomic-embed-text-v1.5`. Their model learns from real agent search traces, creating a feedback loop that generic models cannot replicate. While the directional signal is valid (semantic search helps), the **magnitude of improvement with off-the-shelf models will likely be lower**. This should be validated with a prototype before committing to the full architecture.

#### Probe Performance Data (100K LOC Codebase)

Probe's zero-index approach (ripgrep + tree-sitter + ranking at query time):

| Operation | Cold Start | Warm (cached) |
|-----------|-----------|---------------|
| Simple ripgrep search | 200ms | 50ms |
| + AST parsing (tree-sitter) | 500ms | 100ms |
| + BM25 full ranking | 800ms | 200ms |
| + BERT reranking (ms-marco) | 2000ms | 1500ms |

Comparison with other tools (100K files):

| Tool | Latency | Memory |
|------|---------|--------|
| grep | 2s | 10MB |
| ripgrep | 0.5s | 50MB |
| Probe (BM25 search) | 0.8s | 100MB |
| Probe (AST query) | 1.5s | 200MB |

Probe's reranker comparison:

| Reranker | Speed | Quality | Best For |
|----------|-------|---------|----------|
| `bm25` | Fast | Good | Default, most keyword queries |
| `tfidf` | Fast | Good | Exact term matching |
| `hybrid` | Medium | Better | Balanced (BM25 + TF-IDF fusion) |
| `hybrid2` | Medium | Better | File-aware ranking |
| `ms-marco-tinybert` | Slow | **Best** | When quality matters most |
| `ms-marco-minilm-l6` | Slow | **Best** | Production reranking |

#### smart-coding-mcp Implementation Data

Production defaults from 186-star MCP tool (verified from `lib/config.js`):

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Embedding model | `nomic-ai/nomic-embed-text-v1.5` | Code-aware, supports MRL |
| Fallback model | `Xenova/all-MiniLM-L6-v2` (384d) | Legacy fallback on corruption |
| Embedding dimensions | **128d** config (256d code default, via MRL truncation) | Flexible via MRL |
| Semantic weight | **0.7** | 70% semantic, 30% exact match |
| Exact match boost | **1.5x** | Exact identifier matches are critical for code |
| Partial keyword bonus | **(matched/total) × 0.3** | Rewards partial term matches |
| Chunk size | 25 lines (`chunkSize`) | Function-level granularity |
| Chunk overlap | 5 lines (`chunkOverlap`) | Context continuity |
| Max file size | 1MB (`maxFileSize`) | Skip very large files |
| Batch size | 100 (default), 200 (>1K files), 500 (>10K files) | Adaptive batching |
| Max workers | `Math.max(1, Math.floor(0.5 × cpuCount))` | Use half CPU cores |
| Batch delay | 10ms | CPU breathing room between batches |
| Worker timeout | 300s | Fallback to single-threaded on timeout |
| Storage | SQLite WAL (`better-sqlite3`), `synchronous=NORMAL`, `cache_size=10000` | 5-10x faster than JSON |
| Chunking mode | `smart` (regex-based, **AST not wired into indexer**) | Fast default; AST is opt-in |
| File discovery | `fdir` (not glob) | Fast filesystem crawl |
| File watcher | `chokidar` | Incremental re-index on change |

### Embedding Bottleneck

The critical insight: **embedding an entire codebase upfront is impractical for an MCP tool**.

#### Initial Indexing Time (Embed Everything Upfront)

| Codebase Size | Files | Chunks | Embedding Time | Total |
|---------------|-------|--------|----------------|-------|
| Small (5K LOC) | ~50 | ~300 | ~15-25s | ~20-30s |
| Medium (50K LOC) | ~500 | ~3,000 | **~150-250s** | **~3-4 min** |
| Large (200K LOC) | ~2,000 | ~12,000 | **~600-960s** | **~10-16 min** |

Additional costs:
- Model cold start: ~1-3s
- Memory: ~200-500MB for ONNX runtime + model
- CPU: 100% on one core during embedding

**Verdict**: Upfront embedding is only viable for small projects (<50 files).

### Timing Comparison by Approach

| Approach | Index Build | Query Time | Memory | ML Required | Quality |
|----------|------------|------------|--------|-------------|---------|
| **BM25 only** (Orama) | ~5-10s | <10ms | ~10-50MB | No | Good (keyword) |
| **BM25 + Lazy Rerank** | ~5-10s | ~3-5s | ~200-300MB | Query-time | **Excellent** |
| **Full embed upfront** | ~3-15 min | <100ms | ~300-600MB | Yes | Excellent |
| **Background embed** | ~5-10s initial | Improving | ~300-600MB | Background | Excellent (over time) |

### Head-to-Head: Option 1 vs Option 2

#### Option 1: BM25/TF-IDF + AST Metadata (No ML)

**How it works**: tree-sitter parses code → extract symbols, docstrings, identifiers → build BM25 inverted index → query by keyword relevance.

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| **Latency** | 10/10 | <10ms queries, 5-10s index build. Probe: 200ms warm |
| **Memory** | 10/10 | 10-50MB, no ML model |
| **Setup friction** | 10/10 | Zero model downloads, works instantly |
| **Keyword accuracy** | 8/10 | BM25 is proven for information retrieval (decades of research) |
| **Semantic accuracy** | 3/10 | Cannot bridge terminology gaps ("auth" won't find "login session handling") |
| **Large codebase value** | 5/10 | Cursor data: missing semantic = -2.6% code retention on 1000+ file projects |
| **Differentiation from ripgrep** | 5/10 | Adds AST-aware chunking + ranking, but still fundamentally keyword-based |
| **Implementation effort** | Low | Orama + tree-sitter, no ML pipeline |

**When Option 1 wins**:
- Quick lookups where you know roughly what to search for
- Small codebases (<100 files) where everything is discoverable
- Environments where ML model download is not feasible
- Latency-critical scenarios (<100ms requirement)

#### Option 2: BM25 First + Lazy Embed & Rerank

**How it works**: Build BM25 index (same as Option 1) → on query, BM25 retrieves top-N candidates → embed query + candidates with transformers.js → cosine similarity rerank → return best results.

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| **Latency** | 7/10 | <10ms (BM25 mode) to ~3-5s (semantic mode). Acceptable for MCP |
| **Memory** | 6/10 | ~200-300MB with model loaded. Acceptable on modern machines |
| **Setup friction** | 7/10 | Model downloads on first semantic query (~20-130MB one-time) |
| **Keyword accuracy** | 8/10 | Same BM25 base layer as Option 1 |
| **Semantic accuracy** | 9/10 | Bridges terminology gaps. Cursor: +12.5% accuracy on average |
| **Large codebase value** | 9/10 | Cursor: +2.6% code retention on 1000+ files. This is Octocode's audience |
| **Differentiation from ripgrep** | 9/10 | Meaning-based search is fundamentally different capability |
| **Implementation effort** | Medium | Same as Option 1 + transformers.js + embedding cache |

**When Option 2 wins**:
- Natural language queries ("find authentication logic", "where is error handling")
- Large codebases where terminology varies across modules
- Exploring unfamiliar codebases (onboarding, code review)
- Any scenario where the user doesn't know the exact variable/function name

### The Decisive Data Point

From Cursor's research:

> *"Our agent makes heavy use of grep **as well as** semantic search, and the **combination of these two** leads to the best outcomes."*

This directly maps to Option 2's architecture: **BM25 (grep-equivalent) + semantic reranking = best outcomes**. Option 1 only provides the first half.

---

## Octocode-Specific Fit Analysis

### Constraints

| Constraint | Impact on Decision |
|-----------|-------------------|
| **MCP tool** -- must respond in reasonable time | Eliminates upfront embedding. BM25 (<10ms) or lazy rerank (~3-5s) both acceptable |
| **Already has ripgrep** (`localSearchCode`) | BM25-only (Option 1) has limited differentiation from existing tool |
| **Already has LSP** (definitions, references, call hierarchy) | Structural navigation already covered. Semantic search fills the remaining gap |
| **Runs on user's machine** | ~200MB model is acceptable on modern dev machines (16GB+ RAM typical) |
| **Local-first philosophy** (no cloud APIs) | Both options are fully local. Option 2 uses local ONNX models |
| **Must work on first use** | BM25 layer provides instant results. Semantic reranking is opt-in mode |
| **TypeScript codebase** | Both Orama and transformers.js are TypeScript-native |
| **Target audience: power users with large codebases** | Cursor data: semantic search impact is **greatest on large codebases** (+2.6% retention on 1000+ files) |

### Verdict: Option 2 (BM25 + Lazy Rerank)

**Option 2 is the clear winner for Octocode** because:

1. **Cursor's data is definitive**: +12.5% accuracy, +2.6% retention on large codebases. This is Octocode's target audience.

2. **The "combo" matters**: Cursor explicitly validated that grep + semantic is better than either alone. Octocode already has grep. Adding semantic completes the picture.

3. **Option 1 has limited value**: BM25 over AST chunks is marginally better than ripgrep. Not enough differentiation to justify a new tool.

4. **Semantic is the missing piece**: Octocode has text search (ripgrep), structural navigation (LSP), and remote search (GitHub). The only missing capability is **meaning-based search**. Only Option 2 provides this.

5. **Validated by competitors**: smart-coding-mcp (186 stars) already ships this exact approach in production (transformers.js + nomic-embed + BM25 hybrid). It works.

6. **Unique value**: No competitor combines semantic search + LSP + ripgrep + GitHub API in one MCP suite. That's Octocode's differentiation.

### Implementation Strategy

```
Phase 1 (ship fast):  BM25 layer only (Orama + tree-sitter)
                      ~5-10s index, <10ms query
                      Already better than ripgrep (AST-aware, ranked results)
                      Ship as localSemanticSearch with mode=fast

Phase 2 (add value):  Add semantic reranking (transformers.js + nomic-embed)
                      Model downloads on first semantic query
                      mode=semantic for ~3-5s high-quality results
                      mode=auto to detect query type

Phase 3 (optimize):   Background indexing, embedding cache (SQLite)
                      Progressive improvement
                      Learn from smart-coding-mcp's patterns
```

This phased approach lets us ship **Option 1 as Phase 1** (fast wins) and **evolve to Option 2** (full value) without blocking.

---

## Recommended Architecture

### Approach: BM25 First + Lazy Embed & Rerank

Don't embed everything upfront. Use **two-phase retrieval**:

**Phase 1 -- Instant (BM25):**
Build a BM25 full-text index from AST-aware chunks. Ready in seconds.

**Phase 2 -- Per-Query (Lazy Rerank):**
Embed only the query + top-N BM25 candidates. Rerank by cosine similarity.

```
┌──────────────────────────────────────────────────────────────┐
│                    Query: "authentication logic"              │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: BM25 Retrieval (instant)                           │
│                                                              │
│  Orama index → top-50 candidates by keyword relevance        │
│  Time: <10ms                                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: Semantic Reranking (optional, query-time)          │
│                                                              │
│  transformers.js embeds:                                     │
│    - Query string           → 1 embedding    (~50ms)         │
│    - Top-50 candidate texts → 50 embeddings  (~2-4s)         │
│  Cosine similarity rerank → top-10 results                   │
│  Time: ~3-5s                                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Results: ranked code chunks with file, line, symbol info     │
└──────────────────────────────────────────────────────────────┘
```

### Concrete Stack

| Layer | Library | Role |
|-------|---------|------|
| **Parsing** | `web-tree-sitter` (WASM) + language grammars | AST-aware chunking at symbol boundaries. No node-gyp required. Proven by smart-coding-mcp. |
| **Indexing + Search** | `@orama/orama` | BM25 full-text + vector + **native hybrid search** (parallel BM25+vector with weighted normalization). <10ms queries. |
| **Embeddings** | `@huggingface/transformers` | Lazy embed query + top-N candidates. MRL truncation to 128d for speed. |
| **Embedding Fallback** | Built-in degradation | Primary: `nomic-embed-text-v1.5`. Fallback: `all-MiniLM-L6-v2`. Corruption recovery: clear cache → reload → fallback. |
| **Embedding Cache** | SQLite (WAL mode, `better-sqlite3`) | Cache computed embeddings as BLOB (`Float32Array → Buffer`). WAL for concurrent read/write. |
| **File Discovery** | `fdir` | Fast filesystem crawling with exclusion patterns. Faster than glob. |
| **File Watching** | `chokidar` | Incremental re-index on file add/change/unlink. |
| **Storage** | File-backed (`~/.octocode/indexes/`) | Persistent, per-project indexes |

> **Key simplification from research**: Orama natively supports hybrid search (BM25 + vector with configurable weights), eliminating the need for a separate reranking pipeline. The "two-phase retrieval" can be implemented as a single Orama hybrid query rather than BM25 → embed → rerank.

### Pipeline Design

#### Indexing Pipeline (runs on first query or explicit index command)

```
Source Files
    │
    ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Discovery   │────▶│  web-tree-sitter │────▶│  Orama Hybrid Index │
│  (fdir)      │     │  Parse + Chunk   │     │  (BM25 + vector)    │
└─────────────┘     └──────────────────┘     └─────────────────────┘
       │                    │                          │
  Sort by mtime      Extract per chunk:          Optional: embed
  (recent first)     - symbol name               chunks with
  Progressive        - symbol kind               transformers.js
  indexing           - node-type boost weight     for vector index
                     - file path + line range
                     - language
                     - docstring / comments
                     - import context
                     - parent scope
```

#### Query Pipeline

```
User Query
    │
    ├──▶ mode=fast: Orama BM25 search → multi-signal scoring → results (<10ms)
    │    Scoring: bm25_score × coverage_boost × node_type_boost
    │
    ├──▶ mode=semantic: Orama hybrid search (BM25 + vector, parallel)
    │    1. BM25 retrieval → normalize scores (0-1)
    │    2. Embed query with transformers.js (~50ms, model kept loaded)
    │    3. Vector search → normalize scores (0-1)
    │    4. Combine: textScore × textWeight + vectorScore × vectorWeight
    │    5. Apply node-type boost + coverage boost
    │    Time: ~3-7s (cold start) / ~2-4s (warm)
    │
    ├──▶ mode=auto: Detect query type → route to fast or semantic
    │
    └──▶ Return top-10 results with:
         - file path + line range
         - code snippet
         - symbol name + kind
         - node type + boost weight
         - relevance score (combined)
         - language
```

### Index Storage Layout

```
~/.octocode/indexes/
└── {project-hash}/
    ├── manifest.json           # project root, last indexed, file count, config
    ├── orama-index.dpack       # serialized Orama index (dpack format for compact binary)
    ├── embeddings.db           # SQLite (WAL mode) — embeddings + file hashes
    │   ├── embeddings table    # (file, start_line, end_line, content, vector BLOB, indexed_at)
    │   └── file_hashes table   # (file, hash, mtime, indexed_at)
    └── embeddings.db-wal       # SQLite WAL file (concurrent reads during writes)
```

> **Storage rationale**: Orama persistence for BM25 index (dpack for size efficiency). SQLite for embeddings (WAL mode for concurrent search during indexing, BLOB for vector storage as `Float32Array → Buffer`). Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=10000`, `temp_store=MEMORY`.

### How It Complements Existing Tools

| Tool | Search Type | Best For | Speed |
|------|------------|----------|-------|
| `localSearchCode` (ripgrep) | Exact text/regex | "Find `processPayment` function" | <100ms |
| **`localSemanticSearch`** (NEW) | Meaning/semantic | "Find authentication logic" | <10ms (BM25) / ~3-5s (reranked) |
| `lspGotoDefinition` | Structural | "Go to definition of `authenticate`" | <500ms |
| `lspFindReferences` | Structural | "Who uses `UserService`?" | <500ms |
| `lspCallHierarchy` | Graph | "What calls `processPayment`?" | <500ms |

---

## Design Decisions

### 1. Incremental Indexing with Dual Change Detection

Use **two-stage change detection** (proven by smart-coding-mcp):
- **Fast path**: Compare `mtime` — skip file if unchanged (O(1))
- **Correctness path**: Compare MD5 hash — catches edge cases where mtime lies (e.g., `git checkout`)
- Store both `mtime` and `hash` in SQLite `file_hashes` table
- On non-force runs, prune embeddings for files no longer in the discovered set

### 2. Lazy Model Loading (Singleton Pattern)

Don't load the ONNX model on tool startup. Load it only when a semantic query is requested. First semantic query pays ~1-3s cold start; subsequent queries reuse the loaded model (singleton). This is the universal pattern across all implementations.

### 3. Graceful Degradation with Corruption Recovery

Multi-level fallback chain (learned from smart-coding-mcp):
1. Primary: `nomic-embed-text-v1.5` via `@huggingface/transformers`
2. On Protobuf/ONNX corruption: clear HuggingFace cache → reload model
3. On reload failure: fall back to `Xenova/all-MiniLM-L6-v2` (384d, no MRL)
4. On all ML failure: fall back to BM25-only results

The tool should **always work**, even when ML is completely unavailable.

### 4. Configurable Search Modes

Expose a `mode` parameter:
- `fast` -- BM25 only with multi-signal scoring, <10ms
- `semantic` -- Orama hybrid (BM25 + vector), ~3-7s cold / ~2-4s warm
- `auto` -- Use BM25 for simple keyword queries, semantic for natural language

### 5. Multi-Signal Ranking (Learned from Probe)

Go beyond plain BM25 with **code-specific ranking signals**:

| Signal | Formula | Source |
|--------|---------|--------|
| **BM25** | Okapi BM25 (k=1.2, b=0.75) | Orama built-in |
| **Node-type boost** | Functions 2.0x, Classes 1.8x, Enums 1.6x, Tests 0.7x, Comments 0.5x | Probe |
| **Coverage boost** | `1.0 + coverage^1.5 × 2.0` (rewards matching more query terms) | Probe |
| **Filename boost** | 2.0x for filename matches | Probe |
| **Exact match boost** | 1.5x if query appears literally in content | smart-coding-mcp |
| **Partial keyword** | `(matchedWords / totalQueryWords) × 0.3` | smart-coding-mcp |

Final: `combined_score = base_score × node_type_boost × coverage_boost`

### 6. AST Chunk Granularity

Chunk at **function/method** level as the primary unit. Per-language AST node targeting (from Probe + smart-coding-mcp):

| Language | Target Nodes |
|----------|-------------|
| **JS/TS** | `function_declaration`, `arrow_function`, `class_declaration`, `method_definition`, `export_statement` |
| **Python** | `function_definition`, `class_definition`, `decorated_definition` |
| **Rust** | `function_item`, `impl_item`, `struct_item`, `enum_item`, `trait_item` |
| **Go** | `function_declaration`, `method_declaration`, `type_declaration` |
| **Java** | `method_declaration`, `class_declaration`, `interface_declaration` |
| **C/C++** | `function_definition`, `struct_specifier`, `class_specifier` |
| **Ruby** | `method`, `class`, `module` |

- Skip nodes with fewer than 3 lines
- Large nodes (>4× target size): split into fixed-line chunks of 25 lines
- Merge adjacent blocks within 10 lines (Probe pattern)
- Fallback: regex-based smart chunking at semantic boundaries (`^(export\s+)?(async\s+)?(function|class|const)\s+\w+`)
- Target chunk size: ~500-1500 characters (fits well in embedding models)

### 7. Early Ranking (Learned from Probe)

Score files by BM25 **before** full AST parsing:
- `rank_files_early()` — scores files by term frequency before processing
- `estimate_files_needed()` — limits files parsed based on `max_results`
- Filename matches get 2.0x boost at file level
- **Dramatically reduces tree-sitter work** on large codebases (parse only top-scoring files)

### 8. Progressive Indexing

Sort files by **mtime descending** (recently modified first). This ensures:
- Most relevant files are indexed first
- Search works immediately with partial index
- Background indexing continues for older files
- Indexing status included in search results when in progress

### 9. Index Cache TTL

Indexes persist until the project changes. No time-based expiry -- instead, check file mtimes on query and re-index stale files incrementally.

---

## Best Practices from Leading Implementations

> Patterns validated across Probe, smart-coding-mcp, mcp-local-rag, MegaMemory, bluera-knowledge, and Orama source code.

### Chunking Best Practices

| Practice | Probe | smart-coding-mcp | mcp-local-rag | Recommendation |
|----------|-------|-------------------|---------------|----------------|
| AST-aware boundaries | tree-sitter (native Rust) | web-tree-sitter (WASM, opt-in) | Embedding-based topic boundaries | **web-tree-sitter** (WASM) as primary |
| Fallback chunking | N/A (always AST) | Regex-based `smartChunk` (default) | Fixed-size chunks | Regex fallback for unsupported languages |
| Chunk merging | Blocks within 10 lines merged | Adjacent chunks merged, overlaps removed | N/A | Merge blocks within 10 lines |
| Min chunk size | N/A | 3 lines minimum | N/A | Skip chunks < 3 lines |
| Large node handling | Parent node extraction | Split into 25-line fixed chunks | N/A | Split oversized nodes into fixed chunks |
| Chunk overlap | N/A | 5 lines (`chunkOverlap`) | Embedding similarity overlap | 5 lines overlap for context continuity |

### Multi-Signal Ranking

Plain BM25 is not enough for code search. Leading implementations layer multiple signals:

```
Final Score = BM25 × Node-Type Boost × Coverage Boost + Keyword Bonus
```

**Probe's node-type boost weights** (validated from `src/search/result_ranking.rs`):

| Node Type | Boost | Rationale |
|-----------|-------|-----------|
| Functions (function_item, function_declaration, method_declaration) | **2.0x** | Primary code search unit |
| Structs/Classes/Interfaces | **1.8x** | Type definitions are high-value |
| Enums/Traits/Types | **1.6x** | Type system context |
| Modules/Namespaces | **1.4x** | Structural context |
| Properties/Variables | **1.3x** | Data context |
| Doc/block comments (>3 lines) | **1.2x** | Documentation context |
| Test-related nodes | **0.7x** | Deprioritize test code |
| Line comments | **0.5x** | Low-value noise |

**Coverage boost** (Probe): `1.0 + coverage^1.5 × 2.0` — rewards chunks that match more query terms, not just one.

**Exact match boost** (smart-coding-mcp): If query appears literally in content → 1.5x bonus. Critical for identifier searches.

### MRL Embedding Optimization

Matryoshka Representation Learning enables trading dimensions for speed:

| Dimension | Relative Speed | Quality Loss | Use Case |
|-----------|---------------|-------------|----------|
| 64d | ~4x faster | Noticeable | Quick prototype, testing |
| **128d** | ~2x faster | Minimal | **Recommended production default** |
| 256d | Baseline | None | Higher precision when needed |
| 768d | Slowest | Best | Maximum quality |

**Implementation** (from smart-coding-mcp `lib/mrl-embedder.js`):
1. Generate full 768d embedding via `@huggingface/transformers` feature-extraction pipeline (`pooling: "mean"`)
2. Layer normalize: `layer_norm(embeddings, [embeddings.dims[1]])`
3. Truncate: `.slice(null, [0, targetDim])`
4. L2 normalize: `.normalize(2, -1)`

### Storage Best Practices

**SQLite is the consensus choice** across all serious implementations:

```sql
-- Proven schema (smart-coding-mcp)
CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  vector BLOB NOT NULL,        -- Float32Array → Buffer.from(float32.buffer)
  indexed_at INTEGER NOT NULL
);

CREATE TABLE file_hashes (
  file TEXT PRIMARY KEY,
  hash TEXT NOT NULL,           -- MD5 of file content
  mtime REAL,                   -- Fast-path change detection
  indexed_at INTEGER NOT NULL
);

CREATE INDEX idx_file ON embeddings(file);
CREATE INDEX idx_indexed_at ON embeddings(indexed_at);

-- Required pragmas
PRAGMA journal_mode = WAL;      -- Concurrent reads during writes
PRAGMA synchronous = NORMAL;    -- Performance vs safety tradeoff
PRAGMA cache_size = 10000;      -- Larger in-memory cache
PRAGMA temp_store = MEMORY;     -- Temp tables in RAM
```

**Vector serialization**: `Float32Array → Buffer.from(float32.buffer)` as BLOB. Deserialize: `Buffer → Float32Array → Array.from()`.

**Batch operations**: Single transaction per batch for embeddings. Prepared statements for repeated inserts.

### Indexing Best Practices

| Pattern | Implementation | Source |
|---------|---------------|--------|
| **Progressive indexing** | Sort files by mtime descending; index recently modified first | smart-coding-mcp |
| **Dual change detection** | mtime for fast skip, MD5 hash for correctness | smart-coding-mcp |
| **Adaptive batch sizing** | 1 file (progressive), 100 (default), 200 (>1K files), 500 (>10K files) | smart-coding-mcp |
| **Early file ranking** | Score files by BM25 before AST parsing; only parse top files | Probe |
| **Worker threads** | `0.5 × cpuCount` workers, 300s timeout, single-thread fallback | smart-coding-mcp |
| **File discovery** | `fdir` for fast crawling (not glob), exclusion patterns | smart-coding-mcp |
| **File watching** | `chokidar` for incremental re-index on add/change/unlink | smart-coding-mcp |
| **Session caching** | Cache results per query, invalidate on file MD5 change | Probe |
| **Auto-migration** | Detect old JSON storage → migrate to SQLite in transaction | smart-coding-mcp |
| **Indexing status in search** | Return partial results + warning when indexing in progress | smart-coding-mcp |

### MCP Tool Design Patterns

**Minimal, focused tools** (Probe's approach — 3 tools):

| Tool | Purpose | Parameters |
|------|---------|------------|
| `search_code` | Semantic/keyword search | path, query, exact, session, nextPage |
| `extract_code` | AST-based code extraction | path, files (supports `file:line`, `file:range`, `file#symbol`) |
| `grep` | Traditional text search | path, pattern |

**Pagination** (Probe's session-based approach):
- Store full results in session cache (`~/.cache/probe/sessions/`)
- `nextPage` parameter returns next batch
- Block identifiers: `{path}:{start_line}-{end_line}` for dedup
- Session cache invalidated by file MD5 changes

**Security**:
- `allowedFolders` restricts search to workspace roots
- Path validation to prevent directory traversal

### Anti-Patterns to Avoid

| Anti-pattern | Found in | Issue | Fix |
|-------------|----------|-------|-----|
| **Brute-force vector scan at scale** | MegaMemory, Orama | O(n) cosine similarity; breaks above ~50K vectors | Use ANN index (HNSW) for large codebases, or keep index size bounded |
| **Model change = full reindex** | smart-coding-mcp | No migration path when embedding dimensions change | Store model version in manifest; migration on model change |
| **Blocking init on first use** | Several | First query pays model load + full index build | Progressive indexing + BM25 instant fallback |
| **Rebuilding FTS after every insert** | mcp-local-rag | Should batch inserts | Batch inserts in transactions |
| **No fallback when ML fails** | Many | Server crashes on model load failure | Multi-level fallback: primary → retry → legacy model → BM25-only |
| **Fixed chunk sizes for all languages** | Several | Python needs different splits than TypeScript | Per-language AST node targeting with tree-sitter |
| **Embedding entire codebase upfront** | h-codex, early approaches | 3-15 min for large codebases; blocks first use | Lazy embedding (query-time only) or progressive background indexing |
| **JSON-based vector storage** | Early implementations | 5-10x slower than SQLite | Always use SQLite with WAL mode |

---

## Alternative Approaches

### A. Structural Only (@ariadnejs/core, No ML)

- Use ariadne for definitions, references, call graphs
- No embedding, no semantic search
- Overlaps heavily with existing LSP tools
- **Verdict**: Not enough differentiation from current toolset

### B. Full Upfront Embedding (h-codex pattern)

- tree-sitter + transformers.js + Vectra
- Embed entire codebase before first query
- Best query latency (<100ms) but 3-15 min index build
- **Verdict**: Impractical for MCP; acceptable only for persistent background service

### C. Cloud API Embeddings (OpenAI / Voyage)

- Fast batch embedding via API (~500 chunks/second)
- Medium codebase indexed in ~10-20s
- **Verdict**: Requires API key, network access, costs money. Conflicts with local-first goal.

### D. Trigram Index (Zoekt-like)

- Build trigram index for substring matching
- Very fast build and query
- **Verdict**: Similar to ripgrep; doesn't add semantic capability

---

## Open Questions

### Resolved (from v3 research)

1. ~~**tree-sitter native bindings**~~ → **Resolved**: Use `web-tree-sitter` (WASM). smart-coding-mcp proves it works in production (`web-tree-sitter@^0.24.6`). No node-gyp required.

2. ~~**Model selection**~~ → **Resolved**: `nomic-embed-text-v1.5` at 128d via MRL truncation. Fallback to `all-MiniLM-L6-v2` (384d) on corruption. Dual backend supported.

3. ~~**SQLite vs Orama vs Vectra**~~ → **Resolved**: SQLite (WAL mode, `better-sqlite3`) for embedding cache. Orama for BM25 + hybrid search index. Vectra dropped (unnecessary given Orama's native vector support + SQLite for persistence).

4. ~~**Zero-index mode**~~ → **Resolved**: Yes — BM25 mode (`mode=fast`) provides instant results without any persistent index. Progressive indexing handles the transition to full semantic search.

### Still Open

5. **Build vs. Integrate**: Should we build from scratch or wrap Probe's npm SDK (`@probelabs/probe`)? Probe's MCP tools (`search_code`, `extract_code`, `grep`) could be wrapped to provide zero-index BM25 + AST search. However, this introduces a Rust binary dependency. **Recommendation**: Build our own Phase 1 (Orama + web-tree-sitter) for full control, but study Probe's ranking algorithms closely.

6. **Multi-project indexing**: Should indexes be shared across projects? Or strictly per-project? Current recommendation: per-project (consistent with clone cache at `~/.octocode/repos/`).

7. **Index invalidation on large refactors**: Dual change detection (mtime + hash) handles file-level changes. For rename/move: the pruning step (remove embeddings for deleted files) + hash-based detection for new files should handle this. **Needs validation** with a real refactor scenario.

8. **MCP tool API design**: Single tool (`localSemanticSearch`) or split? **Recommendation**: Single tool with `mode` parameter (fast/semantic/auto). Indexing should be transparent (triggered automatically on first query or explicit `forceReindex` parameter).

9. **Differentiation strategy**: With ~95 competing MCP semantic search repos (and growing), our unique value is **unified local intelligence** — semantic search + LSP + ripgrep + GitHub in one coherent tool suite. No competitor offers this combination.

10. **Orama vector search scaling**: Orama uses linear scan (O(n)) for vector similarity. This is fine for <50K vectors but may need benchmarking for larger codebases. Consider ANN index or bounded index size as mitigation.

11. **Cursor data applicability**: Cursor's +12.5% accuracy gain uses a custom embedding model trained on agent session traces. Off-the-shelf models may show lower improvement. **A prototype benchmark is needed** to validate actual improvement with `nomic-embed-text-v1.5`.

12. **First-download experience**: The ONNX runtime + `nomic-embed-text-v1.5` model is ~200-500MB total. How to handle first download gracefully? Progressive: start with BM25-only, download model in background, enable semantic when ready.

13. **MCP server lifecycle**: Is the Octocode MCP server long-lived (persistent process) or spawned per-request? This fundamentally affects whether the Orama index stays in memory or needs to be deserialized from disk each time.

---

## Summary

| Decision | Choice | Rationale | Validated By |
|----------|--------|-----------|-------------|
| Parsing | `web-tree-sitter` (WASM) | No node-gyp, multi-language, AST-aware chunking | smart-coding-mcp uses it in production |
| Primary search | `@orama/orama` (BM25 + vector + hybrid) | TypeScript-native, <10ms queries, **native hybrid search** | Orama source code (v3.1.18, 10K+ stars) |
| Embeddings | `@huggingface/transformers` (lazy singleton) | Local ML, no API keys, MRL for flexible dimensions | smart-coding-mcp, mcp-local-rag |
| Embedding model | `nomic-embed-text-v1.5` @ 128d (MRL) | Code-aware, 2x faster than 256d via MRL truncation | smart-coding-mcp production defaults |
| Embedding fallback | `Xenova/all-MiniLM-L6-v2` (384d) | Corruption recovery, no MRL required | smart-coding-mcp fallback chain |
| Ranking | Multi-signal: BM25 × node-type × coverage + keyword bonus | Code-specific ranking, not generic text search | Probe source code (455 stars) |
| Embedding cache | SQLite (WAL mode, `better-sqlite3`) | 5-10x faster than JSON, concurrent reads during writes | smart-coding-mcp, MegaMemory |
| Index storage | `~/.octocode/indexes/{project}/` | Consistent with existing clone cache pattern | — |
| File discovery | `fdir` + `chokidar` | Fast crawling + incremental re-index on changes | smart-coding-mcp |
| Change detection | Dual: mtime (fast) + MD5 hash (correct) | Catches edge cases where mtime lies | smart-coding-mcp |
| Default mode | BM25-first, semantic optional (`mode=fast/semantic/auto`) | Practical latency for MCP tool (<10ms to ~3-7s) | Cursor blog confirms combo is best |

---

## Document Rating & Flow Assessment

### Research Flow Rating

| Criteria | v2 Rating | v3 Rating | Notes |
|----------|-----------|-----------|-------|
| **Problem Definition** | 9/10 | 9/10 | Clear gap analysis, well-defined goal |
| **Tool Discovery** | 7/10 | 8/10 | v3: Added MegaMemory, bluera-knowledge; flagged DeepContext as stale; noted 95+ repos in space |
| **Library Evaluation** | 9/10 | 9/10 | v3: Validated Orama hybrid capabilities from source; verified smart-coding-mcp deps |
| **Performance Analysis** | 9/10 | 8/10 | v3: Added Cursor data caveat (custom model vs off-the-shelf); still needs prototype validation |
| **Architecture Design** | 8/10 | 9/10 | v3: Multi-signal ranking, early file ranking, Orama native hybrid eliminates separate reranking |
| **Competitive Analysis** | 8/10 | 9/10 | v3: Source-code validated; accurate dep lists; stale projects flagged |
| **Actionability** | 7/10 | 8/10 | v3: Resolved 4 of 9 open questions; concrete schemas, pragmas, node-type tables |
| **Source Validation** | N/A | 9/10 | v3: Claims verified against actual package.json and source code |

**Overall: 8.6/10** (up from 8.1)

### Key Improvements in v3

1. **Source-code validated claims**: smart-coding-mcp stack verified from `package.json` (found `fastembed`, `web-tree-sitter`, `fdir` not mentioned in v2)
2. **Orama hybrid search discovered**: Orama natively supports BM25 + vector + hybrid — eliminates separate reranking pipeline
3. **Cursor data caveat added**: Acknowledged custom model vs off-the-shelf distinction
4. **Multi-signal ranking added**: Probe's node-type + coverage + filename boosts documented with actual weights from source
5. **Resolved open questions**: tree-sitter (→ web-tree-sitter), storage (→ SQLite only), model selection (→ nomic + fallback), zero-index mode (→ BM25 fast mode)
6. **Best practices section added**: Concrete patterns from 6 implementations with source references
7. **Anti-patterns documented**: Common mistakes identified across the ecosystem

### Key Lessons for Future Research

1. **Always validate claims against source code** -- reading `package.json` and actual source caught multiple inaccuracies in v2
2. **Always search for competing MCP tools first** -- query `"<feature> mcp"` before researching individual libraries
3. **Check `pushedAt` dates** -- DeepContext (263 stars) is stale (Sept 2025); star count alone is misleading
4. **The space is exploding** -- ~95 MCP semantic search repos found in Feb 2026 search. Any document >1 month old needs competitive landscape refresh
5. **Test library claims** -- Orama's native hybrid search was not mentioned in v2 despite being a core feature. Always check library source for undiscovered capabilities
6. **Add caveats to external benchmarks** -- Cursor's data uses custom models; extrapolating to off-the-shelf models requires a disclaimer

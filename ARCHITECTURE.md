# Architecture
> High-level architecture of Octocode-MCP - A Model Context Protocol server for advanced GitHub repository analysis and code discovery

**Last Updated:** 2025-11-18  
**Version:** 7.0.7  
**Status:** Current

---

## Bird's Eye View

**What**: Octocode-MCP is an MCP (Model Context Protocol) server that provides AI assistants with powerful tools to search, analyze, and explore GitHub repositories and codebases.

**How**: Built as a TypeScript monorepo using the MCP SDK, Octokit (GitHub API), and a layered security-first architecture with intelligent caching, bulk operations, and content optimization.

**Why**: Enable AI assistants to efficiently understand codebases through progressive refinement workflows—starting broad, then narrowing focus based on findings. Emphasizes security (secret detection), performance (caching, parallel queries), and token efficiency (content minification).

---

## Entry Points

### **Primary Entry**
- **Server Initialization**: `packages/octocode-mcp/src/index.ts:23` - `startServer()` function
  - Initializes MCP server, registers tools/prompts, establishes stdio transport
  - Handles graceful shutdown (SIGINT, SIGTERM, STDIN_CLOSE)

### **Tool Registration**
- **Tool Manager**: `packages/octocode-mcp/src/tools/toolsManager.ts:6` - `registerTools()` 
  - Centralized registration of all 5 GitHub tools
  - Supports selective enable/disable via environment variables

### **Configuration**
- **Server Config**: `packages/octocode-mcp/src/serverConfig.ts:21` - `initialize()`
  - Loads GitHub token (from CLI or env vars)
  - Parses tool configuration (TOOLS_TO_RUN, ENABLE_TOOLS, DISABLE_TOOLS)

### **GitHub API Integration**
- **GitHub Client**: `packages/octocode-mcp/src/github/client.ts:13` - `getGitHubClient()`
  - Creates authenticated Octokit client with throttling

**Start Here**: Read `index.ts` to understand server lifecycle, then explore `toolsManager.ts` to see available tools, finally dive into individual tool implementations in `src/tools/`.

---

## Code Map

### `/packages/octocode-mcp/src/`
Main MCP server package with all core functionality.

#### **`index.ts`** (188 lines)
**Purpose**: MCP server entry point and lifecycle management  
**Key Functions**:
- `startServer()` - Initialize server, register tools, connect transport
- `registerAllTools()` - Validate GitHub token, register tools
- `gracefulShutdown()` - Clear cache, cleanup resources, exit cleanly

**Invariants**: 
- Must call `initialize()` before any config access
- At least one tool must register successfully or server fails to start
- All signal handlers must call `gracefulShutdown()` to prevent data loss

---

#### **`tools/`** (9 files)
**Purpose**: MCP tool implementations - the public API for AI assistants

**Key Files**:
- `toolMetadata.ts` - **Single source of truth** for all metadata (851 lines)
  - Tool names, descriptions, schema descriptions, hints
  - Structured format: PURPOSE → WORKFLOW → STRATEGY → EXAMPLES → GUARDS
  - Backward-compatible Proxy exports
- `github_search_code.ts` - Search code across GitHub repositories
- `github_search_repos.ts` - Discover and search repositories  
- `github_fetch_content.ts` - Retrieve file content (full/partial/matchString)
- `github_view_repo_structure.ts` - Explore repository directory structure
- `github_search_pull_requests.ts` - Search and analyze pull requests

**Pattern** (all tools follow this):
```typescript
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';

// 1. Register tool with MCP server
export function registerToolName(server: McpServer) {
  server.registerTool(TOOL_NAMES.TOOL_NAME, {
    description: DESCRIPTIONS[TOOL_NAMES.TOOL_NAME],
    inputSchema: ToolSchema.shape
  }, withSecurityValidation(TOOL_NAMES.TOOL_NAME, handler));
}

// 2. Handler processes bulk queries
async function handler(args, authInfo, userContext) {
  return executeBulkOperation(args.queries, processQuery, config);
}

// 3. Query processor handles individual query
async function processQuery(query) {
  const result = await githubAPI.operation(query);
  return createSuccessResult(query, result.data, hasData, 'TOOL_NAME');
}
```

**API Boundary**: All tools accept `queries: Array<QueryType>` and return structured bulk responses with status hints.

**Invariants**:
- All tools must use `withSecurityValidation` wrapper
- All must process queries via `executeBulkOperation` for parallel execution
- All must return consistent response format with status/data/hints

**Supporting Files**:
- `toolsManager.ts` - Centralized registration logic
- `toolConfig.ts` - Tool configuration (name, type, default status, registration function)
- `toolMetadata.ts` - **Single source of truth** for all tool metadata (names, descriptions, schema descriptions, hints)
- `utils.ts` - Shared formatters (createSuccessResult, handleApiError, handleCatchError)

---

#### **`github/`** (10 files)
**Purpose**: GitHub API integration layer - abstracts Octokit complexity

**Key Files**:
- `githubAPI.ts` - Unified GitHub API client with error handling and caching
- `codeSearch.ts` - Code search implementation with filtering
- `repoSearch.ts` - Repository search implementation  
- `fileOperations.ts` - File content retrieval (supports fullContent, lineRange, matchString modes)
- `pullRequestSearch.ts` - PR search and diff retrieval
- `queryBuilders.ts` - Converts structured queries to GitHub search syntax
- `client.ts` - Octokit client factory with throttling configuration
- `errors.ts` - GitHub error handling and classification
- `errorConstants.ts` - Error message catalog

**API Boundary**: Exposes high-level functions (`searchGitHubCodeAPI`, `searchGitHubReposAPI`) that accept typed query objects and return normalized results.

**Invariants**:
- All API calls must go through `githubAPI.ts` for unified error handling
- All must filter ignored files (node_modules, .git, dist, etc.) via `fileFilters.ts`
- All must use caching via `withDataCache` wrapper
- All errors must be classified via `classifyGitHubError`

---

#### **`security/`** (4 files)
**Purpose**: Multi-layer security validation and content sanitization

**Key Files**:
- `contentSanitizer.ts` - Detects and redacts secrets from content
  - `sanitizeContent()` - Main entry point for content sanitization
  - `detectSecrets()` - Pattern-based secret detection
  - `validateInputParameters()` - Parameter validation and sanitization
- `regexes.ts` - 50+ regex patterns for secret detection (AWS keys, GitHub tokens, private keys, JWT, database URLs, etc.)
- `withSecurityValidation.ts` - Security wrapper for all tool handlers
  - Validates input parameters
  - Sanitizes response content
  - Adds security warnings to responses
- `mask.ts` - Masking utilities for sensitive data

**API Boundary**: All tools must be wrapped with `withSecurityValidation`. All content from GitHub must pass through `ContentSanitizer.sanitizeContent()`.

**Invariants**:
- Parameters with `__proto__`, `constructor`, `prototype` are blocked
- String parameters limited to 10,000 characters
- Array parameters limited to 100 items
- All responses scanned for secrets before returning to client

---

#### **`scheme/`** (6 files)
**Purpose**: Zod schemas for runtime validation and type inference

**Key Files**:
- `baseSchema.ts` - Shared base query fields and bulk query schema factory (sources descriptions from `toolMetadata.ts`)
- `github_search_code.ts` - Code search query validation
- `github_search_repos.ts` - Repository search query validation
- `github_fetch_content.ts` - File content query validation (mode, lineStart, lineEnd, matchString)
- `github_view_repo_structure.ts` - Repository structure query validation
- `github_search_pull_requests.ts` - Pull request query validation

**Pattern**:
```typescript
import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';

export const ToolQuerySchema = BaseQuerySchema.extend({
  // Required fields
  keyField: z.string(),
  
  // Optional fields with validation
  limit: z.number().min(1).max(100).optional(),
});

// Create bulk query schema using factory (includes description from toolMetadata)
export const ToolBulkQuerySchema = createBulkQuerySchema(
  'toolName',
  ToolQuerySchema
);
```

**API Boundary**: All tool inputs validated with corresponding `BulkQuerySchema` before processing.

**Invariants**:
- All queries must extend `BaseQuerySchema` for research context (mainResearchGoal, researchGoal, reasoning)
- Bulk queries limited to 1-3 queries per request (via `createBulkQuerySchema` factory)
- All numeric limits must have reasonable min/max bounds
- Schema descriptions sourced from `toolMetadata.ts` for consistency

---

#### **`utils/`** (6 files)
**Purpose**: Core infrastructure utilities

**Key Files**:
- `bulkOperations.ts` - Parallel query processing with error isolation
  - `executeBulkOperation()` - Main entry point for bulk queries (max 3 concurrent)
  - `processBulkQueries()` - Parallel execution with Promise.allSettled
  - `createBulkResponse()` - Formats unified response with hints per status
- `cache.ts` - In-memory caching with NodeCache
  - `withDataCache()` - Generic cache wrapper
  - TTL configuration per API type (code: 3600s, repos: 7200s, PRs: 1800s)
  - 1000 key limit, SHA-256 hash-based keys
- `logger.ts` - Structured logging via MCP protocol
  - `Logger` class with info/error/warning methods
  - `LoggerFactory` for creating contextual loggers
- `exec.ts` - Command execution utilities
  - `getGithubCLIToken()` - Extracts token from GitHub CLI
- `fileFilters.ts` - File filtering logic
  - `shouldIgnoreFile()` - Filters node_modules, .git, dist, etc.
- `promiseUtils.ts` - Advanced promise utilities
  - `executeWithErrorIsolation()` - Parallel execution with timeout and error handling

**API Boundary**: Used by all layers. Caching is transparent via `withDataCache`. Bulk operations provide consistent parallel processing.

**Invariants**:
- Cache keys must be stable (deterministic from parameters)
- Bulk operations limited to 3 concurrent queries
- All promise operations must have timeout protection (60s default)
- File filters must block sensitive directories (.git, node_modules, etc.)

---

#### **`prompts/`** (5 files)
**Purpose**: Prompt templates for AI assistant workflows

**Key Files**:
- `prompts.ts` - Prompt registration
- `research.ts` + `research.md` - Research workflow guidance
- `use.ts` - Usage examples
- `kudos.ts` - Success celebration prompts

---

#### **Core Files**
- `types.ts` - TypeScript type definitions (15KB, 500+ lines)
- `responses.ts` - Response formatting utilities
- `serverConfig.ts` - Server configuration management
- `session.ts` - Session tracking and analytics

---

### `/packages/octocode-utils/`
Shared utilities package for content optimization.

**Key Files**:
- `src/minifier.ts` - Multi-strategy content minification
  - 6 strategies: terser (JS/TS), conservative (Python/YAML), aggressive (HTML/CSS/C), json, general, markdown
  - 50+ file type mappings
  - Comment removal patterns (c-style, hash, html, sql, lua, template, haskell)

**API Boundary**: Exported as `octocode-utils` npm package, imported by main MCP server.

---

## System Boundaries & Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (AI Assistant)                     │
│                  Claude, ChatGPT, etc.                       │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (stdio)
┌────────────────────────▼────────────────────────────────────┐
│                   MCP PROTOCOL LAYER                         │
│  • Server initialization (src/index.ts)                      │
│  • Tool registration (src/tools/toolsManager.ts)             │
│  • Stdio transport                                           │
│  • Signal handling & graceful shutdown                       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      TOOL LAYER                              │
│  • 5 GitHub tools (src/tools/*.ts)                           │
│  • Request routing & validation                              │
│  • Response formatting & hints                               │
│  • Bulk operation orchestration                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│               SECURITY & VALIDATION LAYER                    │
│  • Input validation (Zod schemas - src/scheme/)              │
│  • Security wrapper (src/security/withSecurityValidation.ts) │
│  • Content sanitization (src/security/contentSanitizer.ts)   │
│  • Secret detection (50+ patterns - src/security/regexes.ts) │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                GITHUB INTEGRATION LAYER                      │
│  • Octokit client (src/github/client.ts)                     │
│  • API wrappers (src/github/*.ts)                            │
│  • Query builders (src/github/queryBuilders.ts)              │
│  • Error handling (src/github/errors.ts)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│                   GITHUB REST API                            │
│  • Code Search API                                           │
│  • Repository API                                            │
│  • Content API                                               │
│  • Pull Request API                                          │
└─────────────────────────────────────────────────────────────┘

CROSS-CUTTING INFRASTRUCTURE (src/utils/)
┌─────────────────────────────────────────────────────────────┐
│  • Caching (cache.ts) - 24h TTL, 1000 keys                   │
│  • Bulk Operations (bulkOperations.ts) - Parallel execution  │
│  • Logging (logger.ts) - Structured MCP logging              │
│  • File Filters (fileFilters.ts) - Ignore patterns           │
│  • Promise Utils (promiseUtils.ts) - Error isolation         │
│  • Content Minification (octocode-utils package)             │
└─────────────────────────────────────────────────────────────┘
```

### **Dependency Direction**
**Rule**: Inward flow - inner layers don't depend on outer layers  
- Tools → Security → GitHub API → Utils
- No circular dependencies
- Utils are infrastructure (used by all)

### **Boundary Enforcement**
- **Public API**: MCP tools only (5 tools exposed to clients)
- **Internal**: Everything else is implementation detail
- **Security**: All inputs/outputs cross security boundary
- **GitHub**: All GitHub operations go through github/ layer

---

## Key Abstractions & Types

### **`ProcessedBulkResult<TData, TQuery>`** (`src/types.ts:210`)
Core result type for all tool operations.
```typescript
interface ProcessedBulkResult<TData, TQuery> {
  status: 'hasResults' | 'empty' | 'error';
  data?: TData;
  error?: string;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
}
```
**Used by**: All tools, bulk operations, response formatting  
**Implements**: Consistent status-based result pattern

---

### **`executeBulkOperation<TQuery, TData, R>`** (`src/utils/bulkOperations.ts:10`)
Parallel query processor with error isolation.
```typescript
async function executeBulkOperation<TQuery, TData, R>(
  queries: TQuery[],
  processor: (query: TQuery, index: number) => Promise<R>,
  config: BulkResponseConfig
): Promise<CallToolResult>
```
**Used by**: All 5 tools  
**Pattern**: Execute N queries in parallel (max 3 concurrent), collect results, format unified response

---

### **`withSecurityValidation(toolName, handler)`** (`src/security/withSecurityValidation.ts:49`)
Security wrapper for all tool handlers.
```typescript
function withSecurityValidation(
  toolName: ToolName,
  handler: (args, authInfo, userContext) => Promise<CallToolResult>
): (request: CallToolRequest) => Promise<CallToolResult>
```
**Used by**: All tool registrations  
**Pattern**: Wrapper pattern - validates inputs, sanitizes outputs, adds security warnings

---

### **`withDataCache<T>(cacheKey, operation, options)`** (`src/utils/cache.ts:60`)
Generic caching wrapper.
```typescript
async function withDataCache<T>(
  cacheKey: string,
  operation: () => Promise<T>,
  options?: { ttl?, skipCache?, forceRefresh?, shouldCache? }
): Promise<T>
```
**Used by**: All GitHub API operations  
**Pattern**: Cache-aside pattern - check cache, execute if miss, store on success

---

### **Tool Registration Pattern**
All tools follow this structure:
1. **Schema Definition** (`src/scheme/tool_name.ts`)
2. **API Function** (`src/github/tool_operation.ts`)
3. **Tool Handler** (`src/tools/tool_name.ts`)
4. **Registration** (via `toolsManager.ts`)

---

## Architectural Decisions

### **ADR-001: Bulk Operations Over Sequential Queries**
**Date**: 2024-10 | **Status**: Accepted

**Context**: AI assistants need to explore codebases progressively (broad → specific). Sequential tool calls add latency and fragment context.

**Alternatives**:
1. **Sequential single queries** - Simple but slow (3-5x latency), no cross-query analysis
2. **Streaming responses** - Complex protocol, limited MCP support
3. **Bulk parallel queries** - Chosen approach

**Decision**: All tools accept 1-5 queries per request, processed in parallel (max 3 concurrent).

**Consequences**:
- **PROS**: 3-5x faster workflows, enables progressive refinement in single call, LLM gets full context for cross-referencing
- **CONS**: Increased memory usage, more complex error handling (partial failures), larger response payloads

---

### **ADR-002: Security-First with Multi-Layer Defense**
**Date**: 2024-10 | **Status**: Accepted

**Context**: GitHub content may contain secrets (API keys, tokens). Exposing secrets to AI assistants risks credential leakage.

**Alternatives**:
1. **No sanitization** - Fast but dangerous
2. **Output-only filtering** - Misses malicious inputs
3. **Multi-layer defense** - Chosen approach (input validation + output sanitization)

**Decision**: 
- Layer 1: Zod schema validation
- Layer 2: Parameter sanitization (dangerous keys blocked)
- Layer 3: Content sanitization (50+ secret patterns)
- Layer 4: Response filtering

**Consequences**:
- **PROS**: Defense in depth, prevents secret exposure, blocks injection attacks, comprehensive coverage
- **CONS**: ~5-10ms per request overhead, false positives possible, requires pattern maintenance

---

### **ADR-003: In-Memory Caching with 24h TTL**
**Date**: 2024-10 | **Status**: Accepted

**Context**: GitHub API has rate limits (30 req/min search, 5000 req/h core). Repeated queries waste quota and add latency.

**Alternatives**:
1. **No caching** - Simple but hits rate limits quickly
2. **Redis/external cache** - Scales but adds complexity and operational burden
3. **In-memory NodeCache** - Chosen approach

**Decision**: NodeCache with 24h TTL, 1000 key limit, SHA-256 hash keys.

**Consequences**:
- **PROS**: 60-70% cache hit rate, ~200ms savings per hit, no external dependencies, automatic eviction
- **CONS**: Cache lost on restart, single-instance only (no sharing), 1000 key limit (LRU eviction), memory usage (~50-100MB)

---

### **ADR-004: Content Minification for Token Efficiency**
**Date**: 2024-10 | **Status**: Accepted

**Context**: AI models charge per token. Large code files consume quota quickly.

**Alternatives**:
1. **No minification** - Simple but expensive
2. **Aggressive minification** - Breaks indentation-sensitive languages (Python, YAML)
3. **Multi-strategy minification** - Chosen approach (6 strategies for different file types)

**Decision**: 
- JavaScript/TypeScript → Terser (advanced optimization)
- Python/YAML → Conservative (preserve indentation)
- HTML/CSS/C → Aggressive (remove all comments/whitespace)
- JSON → Parse and compact
- Markdown → Specialized (preserve structure)

**Consequences**:
- **PROS**: 30-60% token reduction, language-aware strategies, preserves functionality
- **CONS**: Processing overhead (~50-100ms), rare edge cases (generated code), requires file type detection

---

### **ADR-005: Zod for Runtime Validation**
**Date**: 2024-10 | **Status**: Accepted

**Context**: MCP clients can send arbitrary payloads. Need runtime type checking and validation.

**Alternatives**:
1. **Manual validation** - Error-prone, verbose
2. **JSON Schema** - Verbose, no type inference
3. **Zod** - Chosen approach (TypeScript integration, runtime validation, type inference)

**Decision**: All tool inputs validated with Zod schemas. Schemas define limits (1-5 queries, 1-100 results).

**Consequences**:
- **PROS**: Type safety, automatic error messages, TypeScript type inference, schema documentation
- **CONS**: Bundle size (~20KB), learning curve, schema maintenance

---

### **ADR-006: Progressive Refinement Workflow**
**Date**: 2024-10 | **Status**: Accepted

**Context**: Effective codebase exploration requires iterative narrowing from broad searches to specific files.

**Alternatives**:
1. **Single-shot queries** - Fast but often misses target
2. **Multi-round conversations** - Slow, requires many tool calls
3. **Guided progressive refinement** - Chosen approach

**Decision**: All tools provide contextual hints based on result status:
- `hasResults` → Suggests next steps (drill deeper, related queries)
- `empty` → Suggests broader searches, alternative approaches
- `error` → Suggests fixes (auth, rate limits, parameter adjustments)

**Consequences**:
- **PROS**: Faster convergence to relevant code, fewer tool calls needed, educational for users
- **CONS**: Hint maintenance burden, can be verbose, sometimes redundant

---

### **ADR-007: Single Source of Truth for Tool Metadata**
**Date**: 2024-11 | **Status**: Accepted

**Context**: Tool metadata (names, descriptions, schema descriptions, hints) was scattered across multiple files (`constants.ts`, `descriptions.ts`, `hints.ts`, `schemDescriptions.ts`). Adding or updating tools required changes in 4-5 files, increasing maintenance burden and risk of inconsistencies.

**Alternatives**:
1. **Status quo** - Separate files per concern - Simple but high maintenance, easy to miss updates
2. **JSON/YAML external config** - Non-code configuration - Loses TypeScript type safety, harder to refactor
3. **Single TypeScript file with structured data** - Chosen approach

**Decision**: Consolidate all tool metadata into `src/tools/toolMetadata.ts` with a single `METADATA_JSON` object containing:
- Tool names and IDs
- Tool descriptions (with structured format: PURPOSE, WORKFLOW, STRATEGY, EXAMPLES, GUARDS)
- Schema parameter descriptions
- Hints for hasResults/empty states
- Base schema descriptions
- Generic error hints

Export Proxy objects for backward compatibility with existing code.

**Consequences**:
- **PROS**: Single file to update when adding/modifying tools, enforces consistent description format, easier to review all tool documentation at once, TypeScript type safety maintained, backward compatible via Proxies
- **CONS**: Single large file (~850 lines), potential merge conflicts in multi-developer scenarios, requires discipline to maintain structure

---

## Cross-Cutting Concerns

### **Error Handling**

**Strategy**: Multi-layer with error classification

**Layer 1 - GitHub API Errors** (`src/github/errors.ts`):
```typescript
function classifyGitHubError(error: unknown): GitHubAPIError {
  // 401 → AUTH_ERROR
  // 403 → RATE_LIMIT or FORBIDDEN
  // 404 → NOT_FOUND
  // 422 → VALIDATION_ERROR
  // Others → UNKNOWN
}
```

**Layer 2 - Tool Errors** (`src/tools/utils.ts`):
```typescript
function handleApiError(result, query): ToolErrorResult | null {
  if (result.error) {
    return {
      status: 'error',
      error: result.error,
      hints: getErrorHintsForAPI(result.error)
    };
  }
  return null;
}
```

**Layer 3 - Bulk Operation Errors** (`src/utils/bulkOperations.ts`):
- Partial failure isolation with Promise.allSettled
- Individual query errors don't fail entire batch
- Error results include hints for recovery

**Layer 4 - Process Errors** (`src/index.ts`):
- Uncaught exceptions logged and trigger graceful shutdown
- Signal handlers (SIGINT, SIGTERM) cleanup resources

**Invariants**:
- Errors always include actionable hints
- Partial failures return successful queries + error details
- All errors logged with context (tool name, query, error type)
- No error crashes the server (error isolation)

---

### **Testing**

**Framework**: Vitest  
**Location**: `packages/octocode-mcp/tests/`  
**Run**: `yarn test` (from root or package)  
**Coverage**: `yarn test:coverage`

**Philosophy**: 
- Unit tests for utilities (cache, bulk operations, filters, sanitizers)
- Integration tests for tools (mocked GitHub API)
- Security tests for validation and sanitization
- No live API calls in tests

**Structure** (mirrors `src/` directory):
```
tests/
├── github/        # API integration tests
├── security/      # Sanitization & validation tests
├── tools/         # Tool integration tests
├── utils/         # Utility unit tests
└── fixtures/      # Test data
```

**Key Tests**:
- `security/contentSanitizer.test.ts` - Secret detection accuracy
- `utils/bulkOperations.test.ts` - Parallel processing, error isolation
- `utils/cache.test.ts` - Cache hit/miss, TTL, eviction
- `tools/github_search_code.test.ts` - Tool end-to-end with mocked GitHub

---

### **Configuration**

**Files**: 
- `.env` (optional) - Environment overrides
- `serverConfig.ts` - Configuration management

**Environment Variables**:
- `GITHUB_TOKEN` / `GH_TOKEN` - GitHub authentication (fallback to `gh` CLI)
- `TOOLS_TO_RUN` - Comma-separated tool names (exclusive mode)
- `ENABLE_TOOLS` - Comma-separated tools to enable (additive)
- `DISABLE_TOOLS` - Comma-separated tools to disable (subtractive)
- `ENABLE_LOGGING` - Enable MCP logging (`true`/`false`)
- `BETA` - Enable beta features (`true`/`1`)
- `REQUEST_TIMEOUT` - Request timeout in ms (default: 30000)
- `MAX_RETRIES` - Max retry attempts (default: 3, max: 10)
- `LOG` - Control logging output (default: enabled unless `false`)

**Precedence**: CLI args > Environment variables > Defaults

**Configuration Management**:
```typescript
// Must initialize before use
await initialize();

// Access configuration
const config = getServerConfig();
const token = await getGitHubToken();

// Feature flags
if (isBetaEnabled()) { /* beta features */ }
if (isLoggingEnabled()) { /* logging */ }
```

---

### **Security**

**Authentication**: 
- GitHub token from CLI (`gh auth token`) or environment (`GITHUB_TOKEN`)
- Token validated on startup
- No token → limited functionality warning

**Authorization**: 
- Uses GitHub token permissions (read-only recommended)
- No elevation or token modification
- All API calls made with user's token

**Data Protection**:
- **Secrets**: 50+ patterns detected and redacted
- **PII**: Not specifically detected (GitHub API responsibility)
- **Encryption**: HTTPS for GitHub API (TLS 1.2+)

**Secret Patterns** (`src/security/regexes.ts`):
- AWS Access Keys
- GitHub Personal Access Tokens
- Google API Keys
- Private SSH/RSA Keys
- JWT Tokens
- Database URLs (postgres://, mysql://, mongodb://)
- OAuth Tokens
- Stripe/Slack/Discord/Twilio API Keys
- Generic API keys (40+ char hex/base64)

**Threat Model**:
- ✅ **Secret Exposure** - Mitigated via content sanitization
- ✅ **Injection Attacks** - Mitigated via input validation
- ✅ **Rate Limit Abuse** - Mitigated via caching
- ✅ **Resource Exhaustion** - Mitigated via limits (1000 cache keys, 5 queries/request, 3 concurrent)
- ❌ **GitHub Account Compromise** - User responsibility
- ❌ **MCP Protocol Vulnerabilities** - SDK responsibility
- ❌ **Network MITM** - HTTPS assumed

---

### **Observability**

**Logging Framework**: MCP Protocol logging (`src/utils/logger.ts`)

**Levels**:
- **INFO**: Normal operations (startup, tool calls, shutdown)
- **WARNING**: Recoverable issues (cache misses, rate limit approaching, missing token)
- **ERROR**: Failures requiring attention (API errors, validation failures, crashes)

**Logged Events**:
- Server lifecycle (start, ready, shutdown)
- Tool invocations (name, query count)
- GitHub API calls (endpoint, status, cached/fresh)
- Errors (tool, API, validation, system)
- Cache statistics (hit rate, size)

**Session Tracking** (`src/session.ts`):
- Unique session ID per server instance
- Tracks tool usage patterns (not sent externally by default)
- Session analytics (anonymized)

**Debug Mode**: `yarn debug` - Runs server with MCP inspector for interactive debugging

---

## Dependencies & Build

### **Key Dependencies**

**Runtime**:
- `@modelcontextprotocol/sdk` (^1.21.0) - MCP protocol implementation
- `@octokit/rest` (^22.0.0) - GitHub REST API client
- `@octokit/plugin-throttling` (^11.0.1) - Rate limit handling
- `zod` (^3.25.26) - Runtime validation
- `node-cache` (^5.1.2) - In-memory caching
- `octocode-utils` (^5.0.0) - Content minification utilities
- `uuid` (^13.0.0) - Session ID generation

**Development**:
- `typescript` (^5.9.2) - Type checking
- `rollup` (^4.46.2) - Bundling
- `vitest` (^4.0.4) - Testing
- `eslint` (^8.57.0) + `prettier` (^3.5.3) - Code quality

### **Build Commands**

**From monorepo root** (`/`):
```bash
yarn install                # Install all dependencies
yarn build                  # Build all packages (lint + test + compile)
yarn build:dev              # Build without linting (faster)
yarn build:watch            # Watch mode for development
yarn clean                  # Clean all build artifacts

yarn test                   # Run all tests
yarn test:coverage          # Generate coverage reports
yarn test:watch             # Watch mode for tests

yarn lint                   # Lint all packages
yarn lint:fix               # Auto-fix linting issues
yarn format                 # Format code with Prettier
```

**From MCP package** (`/packages/octocode-mcp/`):
```bash
yarn build                  # Build MCP server (lint + compile + rollup)
yarn build:dev              # Build without linting
yarn build:watch            # Watch mode
yarn clean                  # Clean dist/

yarn test                   # Run tests
yarn test:coverage          # Coverage report
yarn test:ui                # Interactive test UI

yarn debug                  # Debug with MCP inspector

yarn dxt:pack               # Create DXT package
yarn dxt:release            # Full release (pack + sign + verify)
```

**Build Artifacts**:
- `dist/index.js` - Bundled MCP server (executable)
- `dist/**/*.d.ts` - TypeScript declarations
- `manifest.json` - DXT extension manifest

---

## Design Patterns & Constraints

### **Patterns Used**

#### **1. Wrapper Pattern**
**Where**: `src/security/withSecurityValidation.ts`, `src/utils/cache.ts`  
**Why**: Cross-cutting concerns (security, caching) applied uniformly without modifying tool code  
**Example**:
```typescript
// Security wrapper
export function registerTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    schema,
    withSecurityValidation(TOOL_NAME, handler) // ← Wrapper
  );
}

// Cache wrapper  
const result = await withDataCache(
  cacheKey,
  () => githubAPI.call(),  // ← Wrapped operation
  { ttl: 3600 }
);
```

#### **2. Factory Pattern**
**Where**: `src/github/client.ts`, `src/utils/logger.ts`  
**Why**: Centralized creation of configured objects  
**Example**:
```typescript
// Client factory
export function getGitHubClient(authInfo?: AuthInfo): Octokit {
  return new Octokit({
    auth: token,
    throttle: { /* config */ }
  });
}

// Logger factory
export class LoggerFactory {
  static getLogger(server: McpServer, context: string): Logger {
    return new Logger(server, context);
  }
}
```

#### **3. Builder Pattern**
**Where**: `src/github/queryBuilders.ts`  
**Why**: Construct complex GitHub search queries from structured inputs  
**Example**:
```typescript
export function buildCodeSearchQuery(query: GitHubCodeSearchQuery): string {
  const parts: string[] = [];
  parts.push(query.keywordsToSearch.join(' '));
  if (query.owner && query.repo) parts.push(`repo:${query.owner}/${query.repo}`);
  if (query.extension) parts.push(`extension:${query.extension}`);
  // ... more filters
  return parts.join(' ');
}
```

#### **4. Strategy Pattern**
**Where**: `octocode-utils/src/minifier.ts`  
**Why**: Different minification strategies per file type  
**Example**:
```typescript
const strategies = {
  'terser': minifyWithTerser,       // JS/TS
  'conservative': preserveIndent,    // Python/YAML
  'aggressive': stripAll,            // HTML/CSS
  'json': parseAndCompact,
  'markdown': preserveStructure
};

function minifyContent(content: string, filePath: string) {
  const strategy = detectStrategy(filePath);
  return strategies[strategy](content);
}
```

#### **5. Observer Pattern**
**Where**: `src/session.ts`  
**Why**: Track tool usage without coupling tools to tracking logic  
**Example**:
```typescript
// Tools notify via callback
export function registerTool(server: McpServer, callback?: ToolInvocationCallback) {
  // ...
  if (callback) {
    await callback(TOOL_NAME, queries); // ← Observer notification
  }
}
```

#### **6. Template Method Pattern**
**Where**: All tool implementations  
**Why**: Common structure with customizable steps  
**Example**:
```typescript
// Template: Register → Validate → Process → Format → Respond
async function toolHandler(args, authInfo, userContext) {
  const queries = args.queries;                    // 1. Extract
  return executeBulkOperation(                     // 2. Process (template)
    queries,
    async (query) => {                             // 3. Custom logic
      const result = await githubAPI.operation(query);
      return createSuccessResult(query, result.data, hasData, 'TOOL_NAME');
    },
    { toolName: TOOL_NAME }
  );
}
```

---

### **Anti-Patterns to Avoid**

#### **❌ DON'T: Bypass Security Validation**
**Problem**: Exposing secrets, injection vulnerabilities  
**Solution**: All tools must use `withSecurityValidation` wrapper
```typescript
// BAD
server.registerTool(name, schema, handler);

// GOOD
server.registerTool(name, schema, withSecurityValidation(name, handler));
```

#### **❌ DON'T: Direct GitHub API Calls**
**Problem**: No caching, inconsistent error handling, no file filtering  
**Solution**: Use github/ layer functions
```typescript
// BAD
const result = await octokit.rest.search.code({ q: query });

// GOOD
const result = await searchGitHubCodeAPI(query, authInfo, userContext);
```

#### **❌ DON'T: Sequential Query Processing**
**Problem**: 3-5x slower, fragments context for AI  
**Solution**: Use `executeBulkOperation` for parallel processing
```typescript
// BAD
for (const query of queries) {
  const result = await processQuery(query);
  results.push(result);
}

// GOOD
return executeBulkOperation(queries, processQuery, config);
```

#### **❌ DON'T: Skip File Filtering**
**Problem**: Returns noise (node_modules, dist, .git)  
**Solution**: Always filter with `shouldIgnoreFile`
```typescript
// BAD
return apiResult.items.map(item => ({ path: item.path }));

// GOOD
return apiResult.items
  .filter(item => !shouldIgnoreFile(item.path))
  .map(item => ({ path: item.path }));
```

#### **❌ DON'T: Unbounded Caching**
**Problem**: Memory exhaustion, stale data  
**Solution**: Use configured TTLs and key limits
```typescript
// BAD - Infinite cache
const cache = new NodeCache({ stdTTL: 0 });

// GOOD - 24h TTL, 1000 keys
const cache = new NodeCache({ 
  stdTTL: 86400, 
  maxKeys: 1000 
});
```

---

### **Assumptions**

**Scale**:
- Typical queries return 10-100 results
- Cache remains effective with 1000 key limit
- 3 concurrent queries sufficient for most workflows
- Single server instance (no distributed caching)

**Usage**:
- Primary use case: AI assistant code exploration
- Queries are exploratory (not transactional)
- Users have read-only GitHub tokens
- Rate limits respected (30 search req/min, 5000 core req/h)

**Environment**:
- Node.js ≥18.12.0
- GitHub API available (api.github.com)
- Stdio transport (no HTTP server)
- Server runs on user's machine (not cloud-hosted)

**Violations**: 
- If >1000 active repos → consider external cache (Redis)
- If >5 concurrent users → rate limits hit quickly
- If hosted centrally → need token management and auth

---

### **Constraints**

**Technical**:
- Node.js ≥18.12.0 (ESM modules, crypto APIs)
- TypeScript 5.9.2 (strict mode, type safety)
- MCP SDK ^1.21.0 (protocol compatibility)
- Stdio transport only (no HTTP/WebSocket)

**Business**:
- GitHub API rate limits (30 search/min, 5000 core/h)
- No billing/monetization (open-source MIT)
- Read-only GitHub access (no write operations)

**Operational**:
- Single-instance deployment (no clustering)
- In-memory cache (no persistence)
- Graceful shutdown required (cache cleanup)
- No external dependencies (Redis, databases)

---

## Contributors Guide

### **Bug Fixes**

#### **1. Locate the Issue**
- **Tool behavior** → `src/tools/[tool_name].ts`
- **GitHub API integration** → `src/github/[operation].ts`
- **Security/validation** → `src/security/` or `src/scheme/`
- **Caching** → `src/utils/cache.ts`
- **Bulk operations** → `src/utils/bulkOperations.ts`

#### **2. Fix & Test**
```bash
# Make changes
vim src/tools/github_search_code.ts

# Run specific test
yarn test github_search_code

# Run all tests
yarn test

# Check linting
yarn lint
```

#### **3. Add Regression Test**
```typescript
// tests/tools/github_search_code.test.ts
it('should handle empty results correctly', async () => {
  // Mock empty response
  vi.mocked(searchGitHubCodeAPI).mockResolvedValue({
    data: { items: [] }
  });
  
  const result = await searchMultipleGitHubCode([query]);
  
  expect(result.status).toBe('empty');
  expect(result.hints).toContainEqual(expect.stringMatching(/broaden/i));
});
```

---

### **New Features**

#### **Adding a New Tool**

**1. Define Schema** (`src/scheme/new_tool.ts`):
```typescript
import { z } from 'zod';
import { baseSchema } from './baseSchema.js';

export const NewToolQuerySchema = z.object({
  requiredParam: z.string(),
  optionalParam: z.number().min(1).max(100).optional(),
  ...baseSchema.shape  // Include research context
});

export const NewToolBulkQuerySchema = z.object({
  queries: z.array(NewToolQuerySchema).min(1).max(5)
});

export type NewToolQuery = z.infer<typeof NewToolQuerySchema>;
```

**2. Implement GitHub API** (`src/github/newOperation.ts`):
```typescript
export async function newGitHubOperation(
  query: NewToolQuery,
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<{ data: NewToolResult } | { error: GitHubAPIError }> {
  const cacheKey = generateCacheKey('gh-api-newtool', query);
  
  return withDataCache(cacheKey, async () => {
    const client = getGitHubClient(authInfo, userContext);
    
    try {
      const response = await client.rest.someEndpoint({
        // API call parameters
      });
      
      return { data: response.data };
    } catch (error) {
      return { error: classifyGitHubError(error) };
    }
  }, { ttl: 3600 });
}
```

**3. Create Tool** (`src/tools/new_tool.ts`):
```typescript
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { NewToolBulkQuerySchema } from '../scheme/new_tool.js';
import { newGitHubOperation } from '../github/newOperation.js';

export function registerNewTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.NEW_TOOL,
    {
      description: DESCRIPTIONS[TOOL_NAMES.NEW_TOOL],
      inputSchema: NewToolBulkQuerySchema.shape,
      annotations: {
        title: 'New Tool',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    withSecurityValidation(
      TOOL_NAMES.NEW_TOOL,
      async (args, authInfo, userContext) => {
        if (callback) {
          await callback(TOOL_NAMES.NEW_TOOL, args.queries);
        }
        
        return executeBulkOperation(
          args.queries,
          async (query) => {
            const result = await newGitHubOperation(query, authInfo, userContext);
            
            if ('error' in result) {
              return handleApiError(result, query);
            }
            
            return createSuccessResult(
              query,
              result.data,
              result.data.items.length > 0,
              'NEW_TOOL'
            );
          },
          { toolName: TOOL_NAMES.NEW_TOOL }
        );
      }
    )
  );
}
```

**4. Add Tool Metadata** (`src/tools/toolMetadata.ts`):
```typescript
// Add to METADATA_JSON.toolNames
toolNames: {
  // ... existing tools
  NEW_TOOL: 'newToolName',
},

// Add to METADATA_JSON.tools
tools: {
  // ... existing tools
  newToolName: {
    name: 'newToolName',
    description: `TOOL CATEGORY - Brief summary

PARAMS: See schema for parameter details

PURPOSE: What this tool does

USE_WHEN: When to use | Typical scenarios
AVOID: When NOT to use

WORKFLOW:
  Step 1: ...
  Step 2: ...

STRATEGY:
  - Approach 1: ...
  - Approach 2: ...

EXAMPLES:
  example1  # Comment
  example2  # Comment

GUARDS:
  condition? - action`,
    schema: {
      param1: 'Description of parameter 1',
      param2: 'Description of parameter 2',
      // Include base schema fields
      mainResearchGoal: 'Main research objective...',
      researchGoal: 'Specific information this query seeks',
      reasoning: 'Why this query helps achieve the goal',
    },
    hints: {
      hasResults: [
        'What to do when results found...',
        'Next steps with results...',
      ],
      empty: [
        'What to try when no results...',
        'Alternative approaches...',
      ],
    },
  },
}
```

**5. Add to Tool Config** (`src/tools/toolConfig.ts`):
```typescript
import { registerNewTool } from './new_tool.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';

export const NEW_TOOL: ToolConfig = {
  name: TOOL_NAMES.NEW_TOOL,
  description: DESCRIPTIONS[TOOL_NAMES.NEW_TOOL],
  isDefault: true,
  type: 'search', // or 'content', 'history', 'debug'
  fn: registerNewTool,
};

export const DEFAULT_TOOLS: ToolConfig[] = [
  // ... existing tools
  NEW_TOOL,
];
```

**6. Add Tests** (`tests/tools/new_tool.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newGitHubOperation } from '../../src/github/newOperation.js';

vi.mock('../../src/github/newOperation.js');

describe('NewTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should handle successful query', async () => {
    vi.mocked(newGitHubOperation).mockResolvedValue({
      data: { items: [{ id: 1 }] }
    });
    
    const result = await registerNewTool(mockServer);
    // Assertions...
  });
  
  it('should handle errors gracefully', async () => {
    vi.mocked(newGitHubOperation).mockResolvedValue({
      error: { type: 'NOT_FOUND', message: 'Not found' }
    });
    
    // Assertions...
  });
});
```

**7. Update Documentation**:
- Add tool description to README
- Update this ARCHITECTURE.md if significant pattern changes

---

### **Navigation Tips**

**Find X**:
- **Tool implementation** → `src/tools/[tool_name].ts`
- **GitHub API call** → `src/github/[operation].ts`
- **Validation schema** → `src/scheme/[tool_name].ts`
- **Security patterns** → `src/security/contentSanitizer.ts` or `regexes.ts`
- **Caching logic** → `src/utils/cache.ts`
- **Error handling** → `src/github/errors.ts` or `src/tools/utils.ts`

**Understand Y**:
- **How tools work** → Start with `src/tools/github_search_code.ts` (simplest example)
- **Bulk operations** → `src/utils/bulkOperations.ts` (core pattern)
- **Security flow** → `src/security/withSecurityValidation.ts` → `contentSanitizer.ts`
- **GitHub integration** → `src/github/githubAPI.ts` (unified client)

**Add Z**:
- **New validation pattern** → `src/security/regexes.ts` (add to `allRegexPatterns`)
- **New cache TTL** → `src/utils/cache.ts` (`CACHE_TTL_CONFIG`)
- **New file type minification** → `octocode-utils/src/minifier.ts` (`MINIFY_CONFIG.fileTypes`)
- **New tool metadata** → `src/tools/toolMetadata.ts` (add to `METADATA_JSON.tools`)
- **New tool** → Follow "Adding a New Tool" guide above

---

## Maintenance

**Last Updated**: 2025-11-18  
**Version**: 7.0.7  
**Review Schedule**: Quarterly or after major changes  
**Document Owner**: Guy Bary (bgauryy@gmail.com)

**Recent Updates**:
- 2025-11-18: Updated for metadata consolidation refactoring (ADR-007) - consolidated tool names, descriptions, hints, and schema descriptions into single `toolMetadata.ts` file

**Review Checklist**:
- [ ] Verify all file paths are current
- [ ] Update version numbers
- [ ] Check for new ADRs or pattern changes
- [ ] Validate code examples compile
- [ ] Update statistics (file counts, tool counts)
- [ ] Review constraints (still valid?)
- [ ] Update dependency versions

**Questions/Feedback**: https://github.com/bgauryy/octocode-mcp/issues

---

**Status**: ✅ Current - Reflects codebase as of v7.0.7


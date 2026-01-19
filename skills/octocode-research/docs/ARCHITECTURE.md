# Octocode Research Skill - Architecture Documentation

## Overview

The `octocode-research` skill is an HTTP API server that provides code research capabilities. It runs on `localhost:1987` and exposes REST endpoints that wrap the `octocode-mcp` tool functions.

**Key Design**: All tools are executed via a unified `POST /tools/call/:toolName` endpoint, NOT individual GET routes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HTTP Client (curl, fetch)                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Express Server (port 1987)                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Middleware Layer                          │ │
│  │  • requestLogger - logs all tool calls                       │ │
│  │  • express.json - parses JSON body                           │ │
│  │  • contextPropagation - maintains research session context   │ │
│  │  • errorHandler - standardizes error responses               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Route Handlers                            │
│  • /tools/*   - Tool discovery and execution (MAIN API)         │
│  • /prompts/* - Prompt discovery                                │
│  • /health    - Health check endpoint                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    octocode-mcp Package                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Tool Execution Functions                        │ │
│  │  • executeRipgrepSearch (local code search)                  │ │
│  │  • executeFetchContent (local file read)                     │ │
│  │  • executeViewStructure (directory tree)                     │ │
│  │  • executeFindFiles (file metadata search)                   │ │
│  │  • executeGotoDefinition (LSP definition)                    │ │
│  │  • executeFindReferences (LSP references)                    │ │
│  │  • executeCallHierarchy (LSP call hierarchy)                 │ │
│  │  • searchMultipleGitHubCode (GitHub code search)             │ │
│  │  • fetchMultipleGitHubFileContents (GitHub file read)        │ │
│  │  • exploreMultipleRepositoryStructures (GitHub repo tree)    │ │
│  │  • searchMultipleGitHubRepos (GitHub repo search)            │ │
│  │  • searchMultipleGitHubPullRequests (GitHub PR search)       │ │
│  │  • searchPackages (npm/PyPI search)                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Bulk Operation Processing                       │ │
│  │  • executeBulkOperation - processes query arrays             │ │
│  │  • Error isolation per query                                 │ │
│  │  • Concurrent execution with limits                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Systems                              │
│  • Local filesystem (ripgrep, grep, fs)                         │
│  • GitHub API (via Octokit)                                     │
│  • NPM Registry API                                             │
│  • PyPI API                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
octocode-research/
├── src/
│   ├── server.ts          # Express server setup, route mounting
│   ├── index.ts           # Re-exports from octocode-mcp
│   ├── mcpCache.ts        # MCP content caching
│   ├── routes/
│   │   ├── tools.ts       # /tools/* - MAIN API (list, info, call, system)
│   │   ├── prompts.ts     # /prompts/list, /prompts/info
│   │   ├── local.ts       # Handler logic (used by tools.ts TOOL_REGISTRY)
│   │   ├── lsp.ts         # Handler logic (used by tools.ts TOOL_REGISTRY)
│   │   ├── github.ts      # Handler logic (used by tools.ts TOOL_REGISTRY)
│   │   └── package.ts     # Handler logic (used by tools.ts TOOL_REGISTRY)
│   ├── middleware/
│   │   ├── queryParser.ts      # Query validation with Zod
│   │   ├── errorHandler.ts     # Error response formatting
│   │   ├── logger.ts           # Request/response logging
│   │   └── contextPropagation.ts # Shutdown cleanup
│   ├── validation/
│   │   ├── schemas.ts         # Zod schemas for all endpoints
│   │   ├── httpPreprocess.ts  # Query string conversion (string→number/boolean/array)
│   │   └── index.ts           # Schema exports
│   ├── utils/
│   │   ├── circuitBreaker.ts   # Circuit breaker pattern (3 states)
│   │   ├── colors.ts           # Console output coloring
│   │   ├── logger.ts           # File-based logging to ~/.octocode/logs/
│   │   ├── resilience.ts       # Combined circuit breaker + retry wrappers
│   │   ├── responseBuilder.ts  # Research-specific response formatting
│   │   ├── responseFactory.ts  # Safe data extraction utilities
│   │   ├── responseParser.ts   # MCP response parsing, hints extraction
│   │   ├── retry.ts            # Retry with exponential backoff
│   │   └── routeFactory.ts     # createRouteHandler() factory pattern
│   ├── types/
│       ├── express.d.ts   # Express type extensions
│       ├── toolTypes.ts   # Tool type definitions
│       ├── mcp.ts         # MCP type definitions
│       ├── responses.ts   # Response type definitions
│       └── guards.ts      # Type guard utilities
│   └── __tests__/
│       ├── integration/   # Integration tests
│       └── unit/          # Unit tests
├── scripts/               # Bundled JavaScript (tsdown)
├── docs/                  # Architecture documentation
├── references/            # Quick reference guides
├── SKILL.md              # Skill manifest & usage guide
└── package.json
```

## Data Flow

### 1. Request Processing

```
HTTP Request: POST /tools/call/localSearchCode
Body: { "queries": [{ "pattern": "foo", "path": "/src", ... }] }
        │
        ▼
┌─────────────────────────────────────────────┐
│  requestLogger middleware                    │
│  - Logs: tool, route, method, params         │
│  - Writes to ~/.octocode/logs/tools.log      │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  Route Handler (routes/tools.ts)             │
│  POST /tools/call/:toolName                  │
│                                              │
│  1. Lookup tool in TOOL_REGISTRY             │
│  2. Validate queries array (1-3 items)       │
│  3. Get resilience wrapper for category      │
│  4. Execute: resilience(() => toolFn(params))│
│  5. Parse response with parseToolResponse()  │
│  6. Return { tool, success, data, hints }    │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  octocode-mcp Tool Function                  │
│  1. executeBulkOperation(queries, processor) │
│  2. processor(query) for each query          │
│  3. Aggregate results with status tracking   │
│  4. Return CallToolResult                    │
└─────────────────────────────────────────────┘
        │
        ▼
HTTP Response (JSON)
```

### 2. Tool Registry

The `routes/tools.ts` file contains a `TOOL_REGISTRY` that maps tool names to their functions and resilience wrappers:

```typescript
const TOOL_REGISTRY: Record<string, ToolEntry> = {
  // GitHub tools
  githubSearchCode: { fn: githubSearchCode, resilience: withGitHubResilience, category: 'github' },
  githubGetFileContent: { fn: githubGetFileContent, resilience: withGitHubResilience, category: 'github' },
  // ... more github tools

  // Local tools
  localSearchCode: { fn: localSearchCode, resilience: withLocalResilience, category: 'local' },
  localGetFileContent: { fn: localGetFileContent, resilience: withLocalResilience, category: 'local' },
  // ... more local tools

  // LSP tools
  lspGotoDefinition: { fn: lspGotoDefinition, resilience: withLspResilience, category: 'lsp' },
  lspFindReferences: { fn: lspFindReferences, resilience: withLspResilience, category: 'lsp' },
  lspCallHierarchy: { fn: lspCallHierarchy, resilience: withLspResilience, category: 'lsp' },

  // Package tools
  packageSearch: { fn: packageSearch, resilience: withPackageResilience, category: 'package' },
};
```

### 3. Response Format

Tool execution returns a simplified response:

```typescript
{
  tool: "localSearchCode",
  success: true,
  data: { /* parsed tool response data */ },
  hints: ["Use lineHint for LSP tools", ...],
  research: {
    mainResearchGoal: "...",
    researchGoal: "...",
    reasoning: "..."
  }
}
```

### 4. Route Factory Pattern (for legacy route handlers)

The individual route files (`local.ts`, `lsp.ts`, etc.) use `createRouteHandler()` from `src/utils/routeFactory.ts`:

```typescript
createRouteHandler({
  schema: zodSchema,                    // Zod validation schema
  toParams: (query) => ({ queries }),   // Transform to MCP format
  toolFn: localSearchCode,              // Tool function from index.ts
  toolName: 'localSearchCode',          // For logging/resilience
  resilience: withLocalResilience,      // Circuit breaker + retry
  transform: (parsed, queries) => {     // Response transformation
    return ResearchResponse.searchResults({ ... });
  },
})
```

> **Note**: These route handlers are NOT mounted in production. They're used for tests and as reference implementations.

## Endpoint Reference

### Meta Tools (MAIN API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health, memory, circuit states |
| `/tools/list` | GET | List all available tools (concise) |
| `/tools/info/:toolName` | GET | Get tool schema and hints |
| `/tools/call/:toolName` | **POST** | **Execute any tool** |
| `/tools/system` | GET | Get system prompt |
| `/tools/metadata` | GET | Get raw metadata (advanced) |
| `/prompts/list` | GET | List available prompts |
| `/prompts/info/:promptName` | GET | Get prompt details |

### Tool Execution

**All tools are executed via POST /tools/call/:toolName**

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `localSearchCode` | Local | Search code with ripgrep |
| `localGetFileContent` | Local | Read local file content |
| `localViewStructure` | Local | View directory tree |
| `localFindFiles` | Local | Find files by metadata |
| `lspGotoDefinition` | LSP | Go to symbol definition |
| `lspFindReferences` | LSP | Find all references |
| `lspCallHierarchy` | LSP | Call hierarchy |
| `githubSearchCode` | GitHub | Search code |
| `githubGetFileContent` | GitHub | Read file |
| `githubViewRepoStructure` | GitHub | Repo tree |
| `githubSearchRepositories` | GitHub | Search repos |
| `githubSearchPullRequests` | GitHub | Search PRs |
| `packageSearch` | Package | Search npm/PyPI |

## Research Context Parameters

All tools accept these parameters for context tracking:

| Parameter | Purpose |
|-----------|---------|
| `mainResearchGoal` | Overall research objective (constant across session) |
| `researchGoal` | This specific query's goal |
| `reasoning` | Why this approach/query helps |

## Resilience Features

### 1. Combined Resilience Layer (`src/utils/resilience.ts`)

Four pre-configured resilience wrappers combine circuit breaker + retry:

```typescript
// Usage in TOOL_REGISTRY:
withGitHubResilience(operation, toolName)  // GitHub API calls
withLspResilience(operation, toolName)     // Language server protocol
withLocalResilience(operation, toolName)   // Local filesystem ops
withPackageResilience(operation, toolName) // npm/PyPI queries
```

### 2. Retry Logic (`src/utils/retry.ts`)

Exponential backoff per service category:

```typescript
const RETRY_CONFIGS = {
  lsp: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryOn: (err) => isLspNotReady(err) || isTimeout(err) || isConnectionRefused(err)
  },
  github: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 3,
    retryOn: (err) => isRateLimited(err) || isServerError(err) || isTimeout(err)
  },
  package: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    retryOn: (err) => isRateLimited(err) || isServerError(err) || isTimeout(err)
  },
  local: {
    maxAttempts: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    retryOn: (err) => isFileBusy(err) || isTimeout(err)
  }
};
```

### 3. Circuit Breaker (`src/utils/circuitBreaker.ts`)

Prevents cascading failures with three states:

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation - requests pass through, failures tracked |
| **Open** | Service unavailable - immediately reject/fallback |
| **Half-Open** | After reset timeout, allows probe request to test recovery |

**Default Configuration:**
- `failureThreshold`: 3 failures before opening
- `successThreshold`: 2 successes to close from half-open
- `resetTimeoutMs`: 30000ms (30 seconds)

**Per-Service Overrides:**
```typescript
// LSP - shorter timeout for local service
configureCircuit('lsp', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 10000,  // 10s
});

// GitHub - longer timeout for rate limits
configureCircuit('github', {
  failureThreshold: 2,
  successThreshold: 1,
  resetTimeoutMs: 60000,  // 60s
});
```

**Key Functions:**
- `withCircuitBreaker(name, operation, fallback?)` - Execute with protection
- `getCircuitState(name)` - Monitor circuit health
- `configureCircuit(name, config)` - Customize thresholds
- `resetCircuit(name)` - Manual reset
- `getAllCircuitStates()` - Health dashboard (used in /health endpoint)

### 4. Rate Limit Handling

GitHub API rate limits are tracked from response headers:
- Warns when approaching limits
- Provides reset time hints
- Suggests alternative tools when limited

### 5. Context Propagation (`src/middleware/contextPropagation.ts`)

Manages cleanup of background contexts during graceful shutdown.

### 6. Idle Auto-Restart (`src/server.ts`)

The server automatically restarts after 1 hour of inactivity to free resources and reset state.

**Configuration:**
```typescript
const MAX_IDLE_TIME_MS = 3600000;      // 1 hour
const IDLE_CHECK_INTERVAL_MS = 300000;  // Check every 5 minutes
```

**Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                     Server Lifecycle                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  START                                                          │
│    │                                                             │
│    ▼                                                             │
│  ┌──────────────────┐                                            │
│  │  Server Running  │◄──────────────────────────────────┐        │
│  └────────┬─────────┘                                   │        │
│           │                                             │        │
│           │  Every 5 minutes                            │        │
│           ▼                                             │        │
│  ┌──────────────────┐     idle < 60m      ┌───────────┐│        │
│  │ checkIdleRestart │ ─────────────────► │  Continue  ││        │
│  └────────┬─────────┘                     └───────────┘│        │
│           │                                             │        │
│           │ idle > 60m                                  │        │
│           ▼                                             │        │
│  ┌──────────────────┐                                   │        │
│  │ gracefulShutdown │                                   │        │
│  │  (IDLE_TIMEOUT)  │                                   │        │
│  └────────┬─────────┘                                   │        │
│           │                                             │        │
│           ▼                                             │        │
│  ┌──────────────────┐                                   │        │
│  │ stopIdleCheck    │                                   │        │
│  │ stopCircuitClean │                                   │        │
│  │ clearCircuits    │                                   │        │
│  │ closeHTTPServer  │                                   │        │
│  └────────┬─────────┘                                   │        │
│           │                                             │        │
│           ▼                                             │        │
│  ┌──────────────────┐       Orchestrator/PM2            │        │
│  │  process.exit(0) │ ─────────────────────────────────►│        │
│  └──────────────────┘       restarts server             │        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `checkIdleRestart()` | Periodic check (every 5m) - triggers restart if idle > 1h |
| `startIdleCheck()` | Starts the interval after server initialization |
| `stopIdleCheck()` | Stops interval during graceful shutdown |
| `gracefulShutdown(signal)` | Handles SIGTERM, SIGINT, IDLE_TIMEOUT |

**Request Handling:**
- Every incoming request resets `lastRequestTime` via middleware
- This includes `/health` checks - prevents false idle detection

**Health Endpoint Response:**
```json
{
  "status": "ok",
  "idleTimeMs": 0,
  "maxIdleTimeMs": 3600000,
  "idleCheckIntervalMs": 300000,
  ...
}
```

**Logs:**
```
⏰ Idle check enabled: restart after 60m of inactivity
⏰ Idle time: 35m / 60m                    (at 50% threshold)
⚠️ Server idle for 61m (>60m). Initiating automatic restart...
🔄 Performing automatic idle restart...
🛑 Received IDLE_TIMEOUT. Starting graceful shutdown...
✅ Idle check interval stopped
✅ Circuit cleanup interval stopped
✅ Circuit breakers cleared
✅ HTTP server closed
```

**Why Auto-Restart?**
1. **Memory cleanup** - Releases accumulated heap allocations
2. **Circuit reset** - Clears any open circuit breakers
3. **State refresh** - Reinitializes MCP content and providers
4. **Resource hygiene** - Closes any lingering file handles or connections

## Logging

Logs are written to `~/.octocode/logs/`:

| File | Contents |
|------|----------|
| `tools.log` | All tool calls with params, duration, success status |
| `errors.log` | Validation errors, server errors with details |

**Log format:**
```json
{
  "tool": "localSearchCode",
  "route": "/tools/call/localSearchCode",
  "method": "POST",
  "params": { "pattern": "function", "path": "/src" },
  "duration": 245,
  "success": true
}
```

## Notes

### GitHub Authentication

The server uses `initializeProviders()` from octocode-mcp to set up GitHub token resolution. Token is retrieved from:
1. Environment variables (`GH_TOKEN`, `GITHUB_TOKEN`)
2. GitHub CLI (`gh auth token`)
3. Octocode secure storage

If no token is available, GitHub API calls will be rate-limited and may fail.

### Response Parsing

The `responseParser.ts` module handles MCP tool responses with two strategies:
1. **Preferred:** Use `structuredContent` directly when available
2. **Fallback:** Parse YAML from `content[0].text` for legacy responses

This ensures compatibility with both structured and text-based tool outputs.

## Development

### Build
```bash
npm run build  # TypeScript compilation with tsdown
```

### Start Server
```bash
npm run server:start  # Start detached server
npm run server:stop   # Stop server
npm run server:status # Check status
```

### Test Endpoints
```bash
# Health check
curl http://localhost:1987/health

# List tools
curl http://localhost:1987/tools/list

# Get tool schema
curl http://localhost:1987/tools/info/localSearchCode

# Execute tool
curl -X POST http://localhost:1987/tools/call/localSearchCode \
  -H "Content-Type: application/json" \
  -d '{"queries": [{"mainResearchGoal": "Test", "researchGoal": "Search", "reasoning": "Testing", "pattern": "export", "path": "/src"}]}'
```

## Integration with AI Agents

The skill is invoked via the Skill tool:
```
/octocode-research
```

Or through Task agent for complex research:
```typescript
Task(subagent_type="Explore", prompt="Research how auth works")
```

The SKILL.md file contains the full prompt and workflow guidance for AI agent integration.

---

*Last validated: 2026-01-19*

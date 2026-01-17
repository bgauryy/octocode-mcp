# Octocode Research Skill - Architecture Documentation

## Overview

The `octocode-research` skill is an HTTP API server that provides code research capabilities. It runs on `localhost:1987` and exposes REST endpoints that wrap the `octocode-mcp` tool functions.

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
│  │  • queryParser - validates & transforms query params         │ │
│  │  • contextPropagation - maintains research session context   │ │
│  │  • errorHandler - standardizes error responses               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Route Handlers                            │
│  • /local*    - Local filesystem tools (localSearchCode, etc.)  │
│  • /lsp*      - Language Server Protocol tools                  │
│  • /github*   - GitHub API tools                                │
│  • /package*  - Package registry search                         │
│  • /tools/*   - Tool discovery and execution                    │
│  • /prompts/* - Prompt discovery                                │
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
│   │   ├── local.ts       # /localSearchCode, /localGetFileContent, etc.
│   │   ├── lsp.ts         # /lspGotoDefinition, /lspFindReferences, etc.
│   │   ├── github.ts      # /githubSearchCode, /githubGetFileContent, etc.
│   │   ├── package.ts     # /packageSearch
│   │   ├── tools.ts       # /tools/list, /tools/info, /tools/call
│   │   └── prompts.ts     # /prompts/list, /prompts/info
│   ├── middleware/
│   │   ├── queryParser.ts      # Query validation with Zod
│   │   ├── errorHandler.ts     # Error response formatting
│   │   ├── logger.ts           # Request/response logging
│   │   └── contextPropagation.ts # Shutdown cleanup (placeholder)
│   ├── validation/
│   │   ├── schemas.ts     # Zod schemas for all endpoints
│   │   └── index.ts       # Schema exports
│   ├── utils/
│   │   ├── circuitBreaker.ts   # Circuit breaker pattern (3 states)
│   │   ├── colors.ts           # Console output coloring
│   │   ├── logger.ts           # File-based logging to ~/.octocode/logs/
│   │   ├── resilience.ts       # Combined circuit breaker + retry wrappers
│   │   ├── responseBuilder.ts  # Research-specific response formatting
│   │   ├── responseFactory.ts  # Safe data extraction utilities
│   │   ├── responseParser.ts   # MCP response parsing, hints extraction
│   │   ├── retry.ts            # Retry with exponential backoff + jitter
│   │   └── routeFactory.ts     # createRouteHandler() factory pattern
│   └── types/
│       ├── express.d.ts   # Express type extensions
│       ├── toolTypes.ts   # Tool type definitions
│       ├── mcp.ts         # MCP type definitions
│       ├── responses.ts   # Response type definitions
│       └── guards.ts      # Type guard utilities
├── dist/                  # Compiled JavaScript
├── docs/                  # Architecture documentation
├── SKILL.md              # Skill manifest & usage guide
├── install.sh            # Install/start script
└── package.json
```

## Data Flow

### 1. Request Processing

```
HTTP Request (GET /localSearchCode?pattern=foo&path=/src)
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
│  Route Handler                               │
│  1. parseAndValidate(req.query, schema)      │
│     - Validates with Zod                     │
│     - Transforms types (string→number, etc)  │
│     - Returns: query array                   │
│  2. await toolFunction({ queries })          │
│  3. Transform result to role-based response  │
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
HTTP Response (JSON with role-based content)
```

### 2. Query Validation

The `parseAndValidate` function in `src/middleware/queryParser.ts`:

1. Accepts flat query parameters from HTTP request
2. Validates using Zod schema (type coercion, constraints)
3. Returns array format `[validatedQuery]` for bulk operation compatibility
4. Supports batch mode via JSON-encoded `queries` parameter

**Example transformations:**
- `depth=2` (string) → `2` (number)
- `caseSensitive=true` (string) → `true` (boolean)
- `keywordsToSearch=foo,bar` (string) → `["foo", "bar"]` (array)

### 3. Response Format

The skill uses a **role-based response format** with content blocks:

```typescript
{
  content: [
    {
      type: "text",
      text: "Hints:\n- Use depth=2...",
      annotations: {
        audience: ["assistant"],      // For AI processing
        priority: 1,
        role: "system"
      }
    },
    {
      type: "text",
      text: "Found 5 files matching...",
      annotations: {
        audience: ["assistant", "user"],  // For both
        priority: 0.8,
        role: "assistant"
      }
    },
    {
      type: "text",
      text: "📁 Search complete",
      annotations: {
        audience: ["user"],           // For human display
        priority: 0.6,
        role: "user"
      }
    }
  ],
  structuredContent: { ... },  // Machine-readable data
  isError: false
}
```

### 4. Route Factory Pattern

All routes use `createRouteHandler()` from `src/utils/routeFactory.ts` for consistent handling:

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

This pattern ensures:
- Consistent validation across all 13+ routes
- Unified error handling
- Applied resilience (circuit breaker + retry)
- Response transformation per route type

## Endpoint Reference

### Local Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/localSearchCode` | GET/POST | Search code with ripgrep | `pattern`, `path`, `type`, `include`, `exclude` |
| `/localGetFileContent` | GET/POST | Read file content | `path`, `startLine`, `endLine` |
| `/localViewStructure` | GET/POST | View directory tree | `path`, `depth`, `showHidden` |
| `/localFindFiles` | GET/POST | Find files by metadata | `path`, `pattern`, `type`, `maxDepth` |

### LSP Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/lspGotoDefinition` | GET/POST | Go to symbol definition | `uri`, `symbolName`, `lineHint` |
| `/lspFindReferences` | GET/POST | Find all references | `uri`, `symbolName`, `lineHint` |
| `/lspCallHierarchy` | GET/POST | Call hierarchy | `uri`, `symbolName`, `lineHint`, `direction` |

### GitHub Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/githubSearchCode` | GET/POST | Search code | `keywordsToSearch`, `owner`, `repo`, `language` |
| `/githubGetFileContent` | GET/POST | Read file | `owner`, `repo`, `path`, `branch` |
| `/githubViewRepoStructure` | GET/POST | Repo tree | `owner`, `repo`, `branch`, `path`, `depth` |
| `/githubSearchRepositories` | GET/POST | Search repos | `keywordsToSearch` or `topicsToSearch` |
| `/githubSearchPullRequests` | GET/POST | Search PRs | `owner`, `repo`, `state`, `query` |

### Package Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/packageSearch` | GET/POST | Search npm/PyPI | `name`, `ecosystem` |

### Meta Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tools/list` | GET | List all available tools |
| `/tools/info/:toolName` | GET | Get tool schema and hints |
| `/tools/call/:toolName` | POST | Execute a tool with JSON body |
| `/tools/system` | GET | Get system prompt |
| `/prompts/list` | GET | List available prompts |
| `/prompts/info/:promptName` | GET | Get prompt details |

## Research Context Parameters

All endpoints accept these optional parameters for context tracking:

| Parameter | Purpose |
|-----------|---------|
| `mainResearchGoal` | Overall research objective (constant across session) |
| `researchGoal` | This specific query's goal |
| `reasoning` | Why this approach/query helps |

These flow through to tool results and help with:
- Session correlation in logs
- Contextual hints in responses
- Research progress tracking

## Resilience Features

### 1. Combined Resilience Layer (`src/utils/resilience.ts`)

Four pre-configured resilience wrappers combine circuit breaker + retry:

```typescript
// Usage in routes:
withGitHubResilience(operation, toolName)  // GitHub API calls
withLspResilience(operation, toolName)     // Language server protocol
withLocalResilience(operation, toolName)   // Local filesystem ops
withPackageResilience(operation, toolName) // npm/PyPI queries
```

### 2. Retry Logic (`src/utils/retry.ts`)

Exponential backoff with jitter per service category:

```typescript
const RETRY_CONFIGS = {
  github: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2 },
  lsp: { maxAttempts: 4, initialDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 2 },
  local: { maxAttempts: 2, initialDelayMs: 100, maxDelayMs: 1000, backoffMultiplier: 2 },
  package: { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 3000, backoffMultiplier: 2 }
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
- `successThreshold`: 1 success to close from half-open
- `resetTimeoutMs`: 30000ms (30 seconds)

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

## Logging

Logs are written to `~/.octocode/logs/`:

| File | Contents |
|------|----------|
| `tools.log` | All tool calls with params, duration, success status |
| `errors.log` | Validation errors, server errors with details |

**Log format:**
```json
{
  "tool": "localSearch",
  "route": "/local/search",
  "method": "GET",
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
npm run build  # TypeScript compilation
```

### Start Server
```bash
./install.sh start  # Install deps + start
./install.sh health # Check if running
./install.sh logs   # Tail logs
```

### Test Endpoints
```bash
curl http://localhost:1987/health
curl "http://localhost:1987/localSearchCode?pattern=export&path=/src"
```

## Integration with Claude Code

The skill is invoked via the Skill tool:
```
/octocode-research
```

Or through Task agent for complex research:
```typescript
Task(subagent_type="Explore", prompt="Research how auth works")
```

The SKILL.md file contains the full prompt and workflow guidance for Claude Code integration.

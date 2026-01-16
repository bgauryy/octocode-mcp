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
│  • /local/*   - Local filesystem tools                          │
│  • /lsp/*     - Language Server Protocol tools                  │
│  • /github/*  - GitHub API tools                                │
│  • /package/* - Package registry search                         │
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
│   ├── routes/
│   │   ├── local.ts       # /local/* endpoints
│   │   ├── lsp.ts         # /lsp/* endpoints
│   │   ├── github.ts      # /github/* endpoints
│   │   └── package.ts     # /package/* endpoints
│   ├── middleware/
│   │   ├── queryParser.ts      # Query validation with Zod
│   │   ├── errorHandler.ts     # Error response formatting
│   │   ├── logger.ts           # Request/response logging
│   │   └── contextPropagation.ts # Session context tracking
│   ├── validation/
│   │   ├── schemas.ts     # Zod schemas for all endpoints
│   │   └── index.ts       # Schema exports
│   ├── utils/
│   │   ├── logger.ts           # File-based logging
│   │   ├── responseBuilder.ts  # Role-based response formatting
│   │   ├── retry.ts            # Retry with exponential backoff
│   │   ├── circuitBreaker.ts   # Circuit breaker pattern
│   │   └── rateLimitHandler.ts # GitHub rate limit tracking
│   └── types/
│       └── express.d.ts   # Express type extensions
├── dist/                  # Compiled JavaScript
├── references/            # Endpoint documentation
├── SKILL.md              # Skill manifest & usage guide
├── install.sh            # Install/start script
└── package.json
```

## Data Flow

### 1. Request Processing

```
HTTP Request (GET /local/search?pattern=foo&path=/src)
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

## Endpoint Reference

### Local Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/local/search` | GET | Search code with ripgrep | `pattern`, `path`, `type`, `include`, `exclude` |
| `/local/content` | GET | Read file content | `path`, `startLine`, `endLine` |
| `/local/structure` | GET | View directory tree | `path`, `depth`, `showHidden` |
| `/local/find` | GET | Find files by metadata | `path`, `pattern`, `type`, `maxDepth` |

### LSP Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/lsp/definition` | GET | Go to symbol definition | `uri`, `symbolName`, `lineHint` |
| `/lsp/references` | GET | Find all references | `uri`, `symbolName`, `lineHint` |
| `/lsp/calls` | GET | Call hierarchy | `uri`, `symbolName`, `lineHint`, `direction` |

### GitHub Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/github/search` | GET | Search code | `keywordsToSearch`, `owner`, `repo`, `language` |
| `/github/content` | GET | Read file | `owner`, `repo`, `path`, `branch` |
| `/github/structure` | GET | Repo tree | `owner`, `repo`, `branch`, `path`, `depth` |
| `/github/repos` | GET | Search repos | `keywordsToSearch` or `topicsToSearch` |
| `/github/prs` | GET | Search PRs | `owner`, `repo`, `state`, `query` |

### Package Tools

| Endpoint | Method | Description | Key Params |
|----------|--------|-------------|------------|
| `/package/search` | GET | Search npm/PyPI | `name`, `ecosystem` |

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

### 1. Retry Logic (`src/utils/retry.ts`)

```typescript
const RETRY_CONFIGS = {
  lsp: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
  github: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 3 },
  local: { maxAttempts: 2, initialDelayMs: 100, backoffMultiplier: 2 }
};
```

### 2. Circuit Breaker (`src/utils/circuitBreaker.ts`)

Prevents cascading failures by tracking error rates and temporarily disabling failing services.

### 3. Rate Limit Handling (`src/utils/rateLimitHandler.ts`)

Tracks GitHub API rate limits from response headers:
- Warns when approaching limits
- Provides reset time hints
- Suggests alternative tools when limited

### 4. Context Propagation (`src/middleware/contextPropagation.ts`)

Maintains research session context across chained calls:
- Session ID tracking
- Tool chain history
- Contextual hints based on usage patterns

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

## Known Issues

### Response Format Mismatch (CRITICAL)

**Issue:** The HTTP route handlers expect `rawResult.structuredContent` but the octocode-mcp bulk operation functions return data in `rawResult.content[0].text`.

**Location:** All route files (`src/routes/*.ts`)

**Current code:**
```typescript
const rawResult = await toolFunction({ queries } as any);
const data = (rawResult.structuredContent || {}) as StructuredData;
// data is always {} because structuredContent doesn't exist
```

**Expected from octocode-mcp:**
```typescript
{
  content: [{ type: 'text', text: JSON.stringify(data) }],
  isError: boolean
}
```

**Fix options:**
1. Parse `JSON.parse(rawResult.content[0].text)` to extract data
2. Modify octocode-mcp to include `structuredContent` in bulk response
3. Use different tool exports that return structured data directly

### GitHub Authentication

The server uses `initialize()` from octocode-mcp to set up GitHub token resolution. Token is retrieved from:
1. Environment variables (`GH_TOKEN`, `GITHUB_TOKEN`)
2. GitHub CLI (`gh auth token`)
3. Octocode secure storage

If no token is available, GitHub API calls will be rate-limited and may fail.

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
curl "http://localhost:1987/local/search?pattern=export&path=/src"
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

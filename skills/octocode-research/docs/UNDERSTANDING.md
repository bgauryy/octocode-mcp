# Understanding Octocode Research Skill

> A deep dive into how the octocode-research skill works: server, CLI, flows, and connections.

## TL;DR

The **octocode-research** skill is an HTTP API server that wraps `octocode-mcp` tools, providing:
- **Server**: Express.js on port 1987 with REST endpoints
- **CLI**: Shell wrapper + TypeScript CLI for interacting with the server
- **Tools**: 13 research tools (local, LSP, GitHub, package search)
- **Prompts**: 6 research prompts (research, research_local, reviewPR, plan, orchestrate, generate)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER / AI AGENT                              │
│              (Cursor, Claude Code, Terminal, etc.)                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌──────────────┐       ┌──────────────────┐
            │   CLI (./cli)│       │  HTTP (curl/fetch)│
            └──────────────┘       └──────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER (port 1987)                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      MIDDLEWARE LAYER                           │ │
│  │  requestLogger → queryParser → [route] → errorHandler           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                         ROUTES                                  │ │
│  │  /local* ─────────────────────────────────────────────────────▶ │ │
│  │  /lsp* ───────────────────────────────────────────────────────▶ │ │
│  │  /github* ────────────────────────────────────────────────────▶ │ │
│  │  /package* ───────────────────────────────────────────────────▶ │ │
│  │  /tools/* ────────────────────────────────────────────────────▶ │ │
│  │  /prompts/* ──────────────────────────────────────────────────▶ │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      OCTOCODE-MCP PACKAGE                            │
│  ┌───────────────────┬────────────────────┬────────────────────┐   │
│  │   Tool Functions  │  Response Builder  │   Token Manager    │   │
│  │   (14 exports)    │  (role-based)      │   (GitHub auth)    │   │
│  └───────────────────┴────────────────────┴────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │  Local FS     │   │  GitHub API   │   │  NPM / PyPI   │
    │  (ripgrep,    │   │  (Octokit)    │   │  Registry     │
    │   LSP, fs)    │   │               │   │               │
    └───────────────┘   └───────────────┘   └───────────────┘
```

---

## Part 1: The Server

### Entry Point: `src/server.ts`

The server is the heart of the skill. It:

1. **Initializes** MCP content (tools, prompts metadata) at startup
2. **Mounts routes** for all tool categories
3. **Handles graceful shutdown** with cleanup

```typescript
// Key startup sequence
await initializeMcpContent();  // Load tool schemas, prompts
await initializeProviders();    // Set up GitHub authentication
const app = express();
app.use(express.json());
app.use(requestLogger);
// Mount all routes...
app.listen(1987);
```

### Server Management: `scripts/server.ts`

The `server.ts` script provides cross-platform server lifecycle management:

| Command | Description |
|---------|-------------|
| `npm run server:start` | Start server (idempotent - safe to call repeatedly) |
| `npm run server:stop` | Stop running server |
| `npm run server restart` | Restart server |
| `npm run server status` | Check if server is running |
| `npm run server health` | JSON health check output |
| `npm run server logs` | View server logs |
| `npm run server logs -f` | Follow logs (live tail) |

**What happens on `server:start`?**

```
1. Check Node.js version (≥20 required)
2. Check if server already running → exit if yes
3. Check if port 1987 is in use → error if blocked
4. Install dependencies if missing (npm install)
5. Build if dist/server.js missing (npm run build)
6. Resolve GitHub token (env → gh cli → octocode storage)
7. Cleanup old logs
8. Spawn server process (detached, backgrounded)
9. Wait for /health endpoint (up to 15 attempts)
10. Log session install event
```

### MCP Cache: `src/mcpCache.ts`

The MCP content (tool schemas, prompts, hints) is loaded **ONCE** at startup:

```typescript
// Cached at startup
const mcpContent = {
  tools: { /* 13 tools with schemas */ },
  prompts: { /* 6 prompts with content */ },
  instructions: "## Expert Code Forensics Agent...",
  baseHints: [...],
  genericErrorHints: [...]
};

// Routes use getMcpContent() - fast synchronous access
```

---

## Part 2: The CLI

### CLI Wrapper: `./cli` (shell script)

A simple wrapper that runs the compiled CLI:

```bash
#!/bin/sh
if [ -f "dist/cli.js" ]; then
  exec node dist/cli.js "$@"
else
  exec npx tsx src/cli.ts "$@"  # Dev mode fallback
fi
```

### CLI Implementation: `src/cli.ts`

A lightweight HTTP client for the server:

```typescript
// Core structure
const BASE_URL = 'http://localhost:1987';

// Aliases for convenience
const aliases = {
  '/tools': '/tools/list',
  '/prompts': '/prompts/list',
  '/system': '/tools/system',
  '/search': '/localSearchCode',
  '/read': '/localGetFileContent',
  '/find': '/localFindFiles',
  '/structure': '/localViewStructure'
};

// Parse args, build URL, fetch, output JSON
```

### CLI Commands

| Command | Endpoint | Description |
|---------|----------|-------------|
| `./cli health` | `/health` | Server health check |
| `./cli tools` | `/tools/list` | List available tools |
| `./cli system` | `/tools/system` | Get system prompt |
| `./cli prompts` | `/prompts/list` | List available prompts |
| `./cli prompt research` | `/prompts/info/research` | Get specific prompt |
| `./cli tools/info/localSearchCode` | `/tools/info/localSearchCode` | Get tool schema |
| `./cli search pattern="foo"` | `/localSearchCode?pattern=foo` | Search code |
| `./cli read path="src/index.ts"` | `/localGetFileContent?path=src/index.ts` | Read file |

**CLI Options:**
- `--json`: Output raw JSON (for AI agents)
- `--quiet`: Suppress connection messages
- `--help`: Show usage

---

## Part 3: Routes and Tools

### Route Factory Pattern

All routes use a consistent factory pattern (`src/utils/routeFactory.ts`):

```typescript
localRoutes.get('/localSearchCode', createRouteHandler({
  schema: localSearchSchema,        // Zod validation
  toParams: toQueryParams,          // Transform to tool format
  toolFn: localSearchCode,          // Tool function
  toolName: 'localSearchCode',      // For logging
  resilience: withLocalResilience,  // Circuit breaker + retry
  transform: (parsed, queries) => { // Response transformation
    return ResearchResponse.searchResults({ ... });
  },
}));
```

### Available Routes

#### Local Tools (`src/routes/local.ts`)

| Route | Tool | Purpose |
|-------|------|---------|
| `GET /localSearchCode` | `localSearchCode` | Ripgrep-based code search |
| `GET /localGetFileContent` | `localGetFileContent` | Read file content |
| `GET /localFindFiles` | `localFindFiles` | Find files by metadata |
| `GET /localViewStructure` | `localViewStructure` | Directory tree view |

#### LSP Tools (`src/routes/lsp.ts`)

| Route | Tool | Purpose |
|-------|------|---------|
| `GET /lspGotoDefinition` | `lspGotoDefinition` | Jump to symbol definition |
| `GET /lspFindReferences` | `lspFindReferences` | Find all usages |
| `GET /lspCallHierarchy` | `lspCallHierarchy` | Call graph traversal |

#### GitHub Tools (`src/routes/github.ts`)

| Route | Tool | Purpose |
|-------|------|---------|
| `GET /githubSearchCode` | `githubSearchCode` | Search code in repos |
| `GET /githubGetFileContent` | `githubGetFileContent` | Read file from repo |
| `GET /githubSearchRepositories` | `githubSearchRepositories` | Search repos |
| `GET /githubViewRepoStructure` | `githubViewRepoStructure` | Repo tree view |
| `GET /githubSearchPullRequests` | `githubSearchPullRequests` | Search PRs |

#### Package Tools (`src/routes/package.ts`)

| Route | Tool | Purpose |
|-------|------|---------|
| `GET /packageSearch` | `packageSearch` | Search npm/PyPI |

#### Meta Routes (`src/routes/tools.ts`, `src/routes/prompts.ts`)

| Route | Purpose |
|-------|---------|
| `GET /health` | Server status, memory, circuit states |
| `GET /tools/list` | Concise tool list |
| `GET /tools/info` | All tools with details |
| `GET /tools/info/:name` | Specific tool schema |
| `GET /tools/system` | Full system prompt |
| `POST /tools/call/:name` | Execute tool with JSON body |
| `GET /prompts/list` | List all prompts |
| `GET /prompts/info/:name` | Get prompt content |

---

## Part 4: Main Flows

### Flow 1: Agent Research Session

```
1. INITIALIZE
   ./cli system → Load system prompt (defines agent behavior)

2. SELECT PROMPT
   ./cli prompts → List available prompts
   ./cli prompt research_local → Get local research instructions

3. DISCOVER
   ./cli structure path="/project" → See directory layout

4. SEARCH
   ./cli search pattern="authenticate" type="ts" → Find code

5. ANALYZE (LSP)
   GET /lspGotoDefinition → Jump to definition
   GET /lspCallHierarchy → Trace call flow

6. READ
   ./cli read path="src/auth.ts" → Examine implementation

7. OUTPUT
   Generate research doc in .octocode/research/{session}/research.md
```

### Flow 2: Tool Discovery

```
1. ./cli tools → Get list of 13 tools

2. ./cli tools/info/localSearchCode → Get full schema before calling

3. ./cli localSearchCode pattern="..." path="..." → Execute with params
```

### Flow 3: GitHub Research

```
1. GET /packageSearch?name=express&ecosystem=npm → Find package repo

2. GET /githubViewRepoStructure?owner=expressjs&repo=express → See layout

3. GET /githubSearchCode?keywordsToSearch=middleware → Find patterns

4. GET /githubGetFileContent?owner=...&path=... → Read implementation
```

### Flow 4: Server Lifecycle

```
START:
  npm run server:start
    └─▶ scripts/server.ts start
        └─▶ Check deps, build, spawn node dist/server.js
            └─▶ server.ts: createServer() → startServer()

HEALTH CHECK:
  curl localhost:1987/health
    └─▶ Returns: {status, port, version, uptime, memory, circuits}

STOP:
  npm run server:stop
    └─▶ scripts/server.ts stop
        └─▶ Read PID file, send SIGTERM
            └─▶ server.ts: gracefulShutdown()
```

---

## Part 5: Key Components

### Validation (`src/validation/schemas.ts`)

Zod schemas define and validate all endpoint parameters:

```typescript
export const localSearchSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  type: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  // ... more fields
}).transform(query => ({
  mainResearchGoal: query.mainResearchGoal,
  researchGoal: query.researchGoal,
  // ... transform to tool format
}));
```

### Resilience (`src/utils/resilience.ts`)

Each tool category has a resilience wrapper combining:
- **Circuit Breaker**: Prevents cascading failures
- **Retry**: Exponential backoff with jitter

```typescript
// Pre-configured wrappers
withGitHubResilience(operation, toolName)  // 3 retries, 30s max delay
withLspResilience(operation, toolName)     // 3 retries, LSP-specific errors
withLocalResilience(operation, toolName)   // 2 retries, fast (100ms-1s)
withPackageResilience(operation, toolName) // 3 retries, moderate (1s-15s)
```

### Response Builder (`src/utils/responseBuilder.ts`)

Creates role-based responses for AI consumption:

```typescript
ResearchResponse.searchResults({
  files: [...],
  totalMatches: 42,
  searchPattern: "foo",
  mcpHints: ["Use lineHint for LSP tools"],
  research: { mainGoal, goal, reasoning }
});

// Output includes:
// - System hints (for AI processing)
// - Human-readable summary
// - Machine-readable structuredContent
```

### Index Re-exports (`src/index.ts`)

Clean API surface for tool functions:

```typescript
// GitHub tools
export { fetchMultipleGitHubFileContents as githubGetFileContent } from 'octocode-mcp/public';
export { searchMultipleGitHubCode as githubSearchCode } from 'octocode-mcp/public';

// Local tools
export { executeRipgrepSearch as localSearchCode } from 'octocode-mcp/public';
export { executeFetchContent as localGetFileContent } from 'octocode-mcp/public';

// LSP tools
export { executeGotoDefinition as lspGotoDefinition } from 'octocode-mcp/public';
export { executeFindReferences as lspFindReferences } from 'octocode-mcp/public';
```

---

## Part 6: Data Flow Example

**Request**: `GET /localSearchCode?pattern=authenticate&path=/src&type=ts`

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. REQUEST RECEIVED                                                  │
│    method: GET, path: /localSearchCode                               │
│    query: {pattern: "authenticate", path: "/src", type: "ts"}        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. MIDDLEWARE: requestLogger                                         │
│    Log: {tool: "localSearchCode", params: {...}, timestamp}          │
│    Write to: ~/.octocode/logs/tools.log                              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. ROUTE HANDLER: createRouteHandler()                               │
│    a) parseAndValidate(query, localSearchSchema)                     │
│       - Validates types                                              │
│       - Transforms to query array: [{pattern, path, type, ...}]      │
│    b) withLocalResilience(() => localSearchCode({queries}))          │
│       - Circuit breaker check                                        │
│       - Execute with retry                                           │
│    c) parseToolResponse(rawResult)                                   │
│       - Extract data, hints, research from MCP response              │
│    d) transform(parsed, queries)                                     │
│       - Build ResearchResponse.searchResults()                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. TOOL EXECUTION: localSearchCode()                                 │
│    → executeRipgrepSearch() in octocode-mcp                          │
│    → ripgrep subprocess with pattern matching                        │
│    → Return: {files: [...], totalMatches, pagination}                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. RESPONSE                                                          │
│    {                                                                 │
│      content: [{type: "text", text: "Found 5 matches..."}],          │
│      structuredContent: {                                            │
│        status: "hasResults",                                         │
│        files: [{path, matches, line, preview}],                      │
│        totalMatches: 5,                                              │
│        hints: ["Use lineHint for LSP tools"]                         │
│      }                                                               │
│    }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: SKILL.md Role

The `SKILL.md` file serves as the **agent instructions** for using this skill:

1. **Frontmatter**: Defines when to use the skill
2. **Quick Reference**: CLI commands cheat sheet
3. **Workflow Phases**: Initialize → Prompt → Plan → Execute → Output
4. **Tool Reference**: All 13 tools with descriptions
5. **Guardrails**: Security rules, rate limits, error handling
6. **Research Patterns**: Multi-agent orchestration, parallel research

AI agents (Claude Code, etc.) read SKILL.md to understand how to use the skill effectively.

---

## Part 8: Connections Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FILE CONNECTIONS                             │
└─────────────────────────────────────────────────────────────────────┘

package.json
    ├── scripts.server:start ──▶ scripts/server.ts
    ├── scripts.start ──▶ dist/server.js
    └── bin.octocode-research-cli ──▶ dist/cli.js

src/server.ts (Entry Point)
    ├── imports ──▶ src/routes/*.ts
    ├── imports ──▶ src/middleware/*.ts
    ├── imports ──▶ src/mcpCache.ts
    └── imports ──▶ src/index.ts

src/index.ts (Tool Re-exports)
    └── imports ──▶ octocode-mcp/public (all tool functions)

src/routes/*.ts
    ├── imports ──▶ src/index.ts (tool functions)
    ├── imports ──▶ src/validation/schemas.ts
    ├── imports ──▶ src/utils/routeFactory.ts
    └── imports ──▶ src/utils/resilience.ts

src/cli.ts
    └── fetches ──▶ http://localhost:1987/* (server endpoints)

./cli (shell wrapper)
    └── exec ──▶ dist/cli.js or src/cli.ts

scripts/server.ts
    └── spawns ──▶ dist/server.js
```

---

## Quick Start

```bash
# 1. Start server
npm run server:start

# 2. Verify running
./cli health

# 3. Load context
./cli system    # System prompt
./cli prompts   # Available prompts

# 4. Research
./cli prompt research_local
./cli search pattern="auth" path="src"
./cli read path="src/auth.ts"

# 5. Stop when done
npm run server:stop
```

---

## Common Patterns

### Pattern 1: Local Code Research

```bash
# Discover structure
./cli structure path="/project"

# Search for pattern
./cli search pattern="handleAuth" type="ts"

# Trace with LSP
curl "localhost:1987/lspGotoDefinition?uri=/project/src/auth.ts&symbolName=handleAuth&lineHint=42"
curl "localhost:1987/lspCallHierarchy?uri=/project/src/auth.ts&symbolName=handleAuth&lineHint=42&direction=incoming"
```

### Pattern 2: GitHub Research

```bash
# Find package
curl "localhost:1987/packageSearch?name=express&ecosystem=npm"

# Explore repo
curl "localhost:1987/githubViewRepoStructure?owner=expressjs&repo=express&depth=2"

# Search code
curl "localhost:1987/githubSearchCode?owner=expressjs&repo=express&keywordsToSearch=middleware"
```

### Pattern 3: Tool Call via POST

```bash
# POST with JSON body (easier than URL encoding)
curl -X POST localhost:1987/tools/call/localSearchCode \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [{
      "mainResearchGoal": "Understand auth flow",
      "researchGoal": "Find auth handlers",
      "reasoning": "Need to map authentication logic",
      "pattern": "authenticate",
      "path": "/src"
    }]
  }'
```

---

*Created for the octocode-research skill. See SKILL.md for agent usage instructions.*

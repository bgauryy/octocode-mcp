# Octocode Research API Reference

> HTTP API server on `localhost:1987` wrapping octocode-mcp tools

## Quick Start

```bash
# Start server
npm start

# Health check
curl http://localhost:1987/health

# List tools
curl http://localhost:1987/tools/list

# Get tool schema (ALWAYS do this before calling a tool)
curl http://localhost:1987/tools/info/localSearchCode

# Call a tool
curl "http://localhost:1987/localSearchCode?pattern=export&path=/project&filesOnly=true"
```

---

## Routes Overview

| Category | Routes | Purpose |
|----------|--------|---------|
| Health | `/health` | Server status |
| Tools Discovery | `/tools/*` | List tools, get schemas, system prompt |
| Prompts | `/prompts/*` | List and get prompt templates |
| Local | `/local*` | Filesystem operations |
| LSP | `/lsp*` | Semantic code analysis |
| GitHub | `/github*` | GitHub API operations |
| Package | `/packageSearch` | npm/PyPI search |

---

## Health & Status

### `GET /health`

Server health check with circuit breaker status.

**Response:**
```json
{
  "status": "ok",
  "port": 1987,
  "version": "2.0.0",
  "uptime": 3600,
  "memory": { "heapUsed": 33, "heapTotal": 36, "rss": 137 },
  "circuits": {
    "github": { "state": "closed", "failures": 0, "isHealthy": true },
    "local": { "state": "closed", "failures": 0, "isHealthy": true },
    "lsp": { "state": "closed", "failures": 0, "isHealthy": true },
    "package": { "state": "closed", "failures": 0, "isHealthy": true }
  }
}
```

---

## Tools Discovery

### `GET /tools/list`

Concise list of all 13 tools.

**Response:**
```json
{
  "tools": [
    { "name": "githubSearchCode", "description": "Search code in GitHub repos" },
    { "name": "githubGetFileContent", "description": "Read file from GitHub repo" },
    { "name": "localSearchCode", "description": "Search local code with ripgrep" },
    { "name": "lspGotoDefinition", "description": "Go to symbol definition" }
    // ... 13 total
  ],
  "_hint": "GET /tools/info/{name} for full schema before calling"
}
```

### `GET /tools/info`

All tools with optional schema and hints.

**Query params:** `?schema=true&hints=true`

**Response:**
```json
{
  "structuredContent": {
    "totalTools": 13,
    "toolNames": ["githubSearchCode", "localSearchCode", "lspGotoDefinition", ...],
    "tools": [{ "name": "...", "description": "...", "schema": {...}, "hints": {...} }]
  }
}
```

### `GET /tools/info/:toolName`

**Full tool info with JSON Schema from Zod (source of truth).**

**Example:** `GET /tools/info/lspGotoDefinition`

**Response:**
```json
{
  "structuredContent": {
    "name": "lspGotoDefinition",
    "description": "## Go to symbol definition [LSP]...",
    "inputSchema": {
      "type": "object",
      "properties": {
        "uri": { "type": "string", "minLength": 1 },
        "symbolName": { "type": "string", "minLength": 1, "maxLength": 255 },
        "lineHint": { "type": "integer", "minimum": 1 },
        "contextLines": { "type": "integer", "minimum": 0, "maximum": 20, "default": 5 }
      },
      "required": ["uri", "symbolName", "lineHint"],
      "additionalProperties": false
    },
    "_schemaSource": "zod",
    "hints": {
      "hasResults": ["Use lspFindReferences for all usages"],
      "empty": ["Verify lineHint from localSearchCode"]
    }
  }
}
```

### `GET /tools/system`

Full system instructions for agent context loading.

**Response:**
```json
{
  "instructions": "## Expert Code Forensics Agent...",
  "_meta": { "charCount": 7184, "version": "2.0.0" }
}
```

### `GET /tools/metadata`

Summary of available metadata.

**Response:**
```json
{
  "structuredContent": {
    "instructions": "## Expert Code Forensics...",
    "toolCount": 13,
    "promptCount": 7,
    "hasBaseSchema": true
  }
}
```

### `POST /tools/call/:toolName`

**Direct tool execution with JSON body.**

**Example:** `POST /tools/call/localSearchCode`

**Request:**
```json
{
  "queries": [{
    "pattern": "export function",
    "path": "/project/src",
    "type": "ts",
    "filesOnly": true
  }]
}
```

**Response:**
```json
{
  "tool": "localSearchCode",
  "success": true,
  "data": { "files": [...], "totalMatches": 42 },
  "hints": ["Use lineHint for LSP tools"]
}
```

---

## Prompts Discovery

### `GET /prompts/list`

List all 7 available prompts.

**Response:**
```json
{
  "prompts": [
    { "name": "research", "description": "Investigate using Octocode tools" },
    { "name": "research_local", "description": "Local file research" },
    { "name": "plan", "description": "Research-backed planning" },
    { "name": "reviewPR", "description": "PR review with Defects-First model" },
    { "name": "generate", "description": "Scaffold new projects" },
    { "name": "init", "description": "Initialize Octocode context" },
    { "name": "help", "description": "Guide to prompts and tools" }
  ],
  "_meta": { "totalCount": 7, "version": "2.0.0" }
}
```

### `GET /prompts/info/:name`

Full prompt content and arguments.

**Example:** `GET /prompts/info/research`

**Response:**
```json
{
  "prompt": {
    "name": "research",
    "description": "Investigate anything using Octocode research tools"
  },
  "content": "# Research Agent - Code Forensics & Discovery\n\n## Flow Overview..."
}
```

---

## Local Tool Routes

All local routes accept query parameters. Research context fields are optional for HTTP.

### `GET /localSearchCode`

Search code with ripgrep.

**Key params:**
- `pattern` (required) - Search pattern
- `path` (required) - Directory to search
- `type` - File type (ts, js, py, etc.)
- `filesOnly` - Return only file paths (faster)
- `mode` - Preset: "discovery" | "paginated" | "detailed"
- `limit`, `filesPerPage`, `matchesPerPage` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "files": [
      { "path": "src/index.ts", "matches": 5, "line": 10, "preview": "export..." }
    ],
    "totalMatches": 42,
    "pagination": { "page": 1, "totalPages": 5 }
  }
}
```

### `GET /localGetFileContent`

Read file content.

**Key params:**
- `path` (required) - File path
- `startLine`, `endLine` - Line range
- `matchString` - Extract content around pattern
- `matchStringContextLines` - Lines around match

**Response:**
```json
{
  "structuredContent": {
    "path": "/project/src/index.ts",
    "content": "export function...",
    "lines": { "start": 1, "end": 50 },
    "totalLines": 200
  }
}
```

### `GET /localFindFiles`

Find files by metadata.

**Key params:**
- `path` (required) - Directory to search
- `name` - Filename pattern (glob)
- `iname` - Case-insensitive name
- `type` - File type: "file" | "directory" | "f" | "d"
- `modifiedWithin` - Time filter: "1d", "2h"
- `sizeGreater`, `sizeLess` - Size filters

**Response:**
```json
{
  "structuredContent": {
    "status": "hasResults",
    "files": [
      { "path": "src/index.ts", "size": 1234, "modified": "2024-01-15" }
    ]
  }
}
```

### `GET /localViewStructure`

View directory tree.

**Key params:**
- `path` (required) - Directory path
- `depth` - Tree depth (1-5)
- `filesOnly`, `directoriesOnly` - Filter by type
- `hidden` - Include hidden files
- `sortBy` - "name" | "size" | "time" | "extension"

**Response:**
```json
{
  "structuredContent": {
    "path": "/project/src",
    "structure": {
      "files": ["index.ts", "server.ts"],
      "folders": ["routes/", "utils/", "types/"]
    }
  }
}
```

---

## LSP Tool Routes

Semantic code analysis. **Requires `lineHint` from `localSearchCode`.**

### `GET /lspGotoDefinition`

Jump to symbol definition.

**Key params:**
- `uri` (required) - File path
- `symbolName` (required) - Symbol name (exact)
- `lineHint` (required) - Line number (1-indexed)
- `contextLines` - Lines of context (default: 5)

**Response:**
```json
{
  "structuredContent": {
    "symbol": "createServer",
    "type": "definition",
    "locations": [
      { "uri": "/project/src/server.ts", "line": 15, "preview": "export function createServer()..." }
    ]
  }
}
```

### `GET /lspFindReferences`

Find all symbol usages.

**Key params:**
- `uri`, `symbolName`, `lineHint` (required)
- `includeDeclaration` - Include definition (default: true)
- `referencesPerPage`, `page` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "symbol": "createServer",
    "type": "references",
    "locations": [
      { "uri": "/project/src/index.ts", "line": 5, "preview": "import { createServer }..." },
      { "uri": "/project/tests/server.test.ts", "line": 10, "preview": "const server = createServer()..." }
    ]
  }
}
```

### `GET /lspCallHierarchy`

Trace function call relationships.

**Key params:**
- `uri`, `symbolName`, `lineHint` (required)
- `direction` (required) - "incoming" (who calls) | "outgoing" (what it calls)
- `depth` - Call depth (1-3, default: 1)
- `callsPerPage`, `page` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "symbol": "handleRequest",
    "type": "incoming",
    "locations": [
      { "uri": "/project/src/router.ts", "line": 42, "preview": "handleRequest(req, res)" }
    ]
  }
}
```

---

## GitHub Tool Routes

GitHub API operations. Require `GITHUB_TOKEN` environment variable.

### `GET /githubSearchCode`

Search code across GitHub repositories.

**Key params:**
- `keywordsToSearch` (required) - Comma-separated keywords
- `owner`, `repo` - Scope to specific repo
- `path`, `extension`, `filename` - Filters
- `match` - "file" | "path"
- `limit`, `page` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "files": [
      { "path": "src/index.ts", "repo": "owner/repo", "matches": 3, "preview": "..." }
    ],
    "totalMatches": 100,
    "pagination": { "page": 1, "totalPages": 10 }
  }
}
```

### `GET /githubGetFileContent`

Read file from GitHub repository.

**Key params:**
- `owner`, `repo`, `path` (required)
- `branch` - Branch name (default: default branch)
- `startLine`, `endLine` - Line range
- `matchString` - Extract around pattern

**Response:**
```json
{
  "structuredContent": {
    "path": "src/index.ts",
    "content": "export function...",
    "lines": { "start": 1, "end": 100 }
  }
}
```

### `GET /githubSearchRepositories`

Search GitHub repositories.

**Key params:**
- `keywordsToSearch` or `topicsToSearch` (at least one required)
- `owner` - Filter by owner
- `stars` - Star filter: ">1000", "100..500"
- `sort` - "stars" | "forks" | "updated" | "best-match"
- `limit`, `page` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "repositories": [
      { "owner": "facebook", "repo": "react", "stars": 200000, "description": "..." }
    ]
  }
}
```

### `GET /githubViewRepoStructure`

View repository tree structure.

**Key params:**
- `owner`, `repo`, `branch` (required)
- `path` - Subdirectory path
- `depth` - Tree depth (1-2)
- `entriesPerPage`, `entryPageNumber` - Pagination

**Response:**
```json
{
  "structuredContent": {
    "path": "/",
    "structure": {
      "files": ["README.md", "package.json"],
      "folders": ["src/", "tests/", "docs/"]
    }
  }
}
```

### `GET /githubSearchPullRequests`

Search pull requests.

**Key params:**
- `owner`, `repo` - Scope to repo
- `prNumber` - Get specific PR
- `query` - Search query
- `state` - "open" | "closed"
- `merged` - Filter merged PRs
- `author`, `assignee` - User filters
- `type` - "metadata" | "fullContent" | "partialContent"
- `withComments`, `withCommits` - Include details

**Response:**
```json
{
  "structuredContent": {
    "prs": [
      { "number": 123, "title": "Fix bug", "state": "closed", "author": "user", "url": "..." }
    ],
    "pagination": { "page": 1, "totalPages": 5 }
  }
}
```

---

## Package Search

### `GET /packageSearch`

Search npm or PyPI packages.

**Key params:**
- `name` (required) - Package name
- `ecosystem` - "npm" (default) | "python"
- `searchLimit` - Max results
- `npmFetchMetadata`, `pythonFetchMetadata` - Include full metadata

**Response:**
```json
{
  "structuredContent": {
    "registry": "npm",
    "packages": [
      { "name": "express", "version": "4.18.2", "description": "...", "repository": "https://github.com/expressjs/express" }
    ]
  }
}
```

---

## Error Handling

### 404 Not Found

Unknown routes return available routes list.

```json
{
  "success": false,
  "error": {
    "message": "Route not found: GET /unknown",
    "code": "NOT_FOUND",
    "availableRoutes": ["/health", "/localSearchCode", "/tools/list", ...]
  }
}
```

### Validation Errors (400)

Invalid parameters return Zod validation errors.

```json
{
  "success": false,
  "error": {
    "message": "pattern: Required",
    "code": "VALIDATION_ERROR",
    "details": [{ "path": ["pattern"], "message": "Required" }]
  }
}
```

### Circuit Open (503)

When a service is unhealthy.

```json
{
  "success": false,
  "error": {
    "message": "Circuit github is OPEN - retry in 30s",
    "code": "CIRCUIT_OPEN"
  }
}
```

---

## Response Format

All routes return role-based content blocks:

```json
{
  "content": [
    { "type": "text", "text": "Hints: ...", "annotations": { "role": "system" } },
    { "type": "text", "text": "Summary", "annotations": { "role": "assistant" } },
    { "type": "text", "text": "✅ Status", "annotations": { "role": "user" } }
  ],
  "structuredContent": { /* actual data */ },
  "isError": false
}
```

---

## Schema Sources

All tool schemas come from **octocode-mcp/public** (Zod source of truth):

| Tool | Schema | Required Fields |
|------|--------|-----------------|
| localSearchCode | RipgrepQuerySchema | pattern, path |
| localGetFileContent | FetchContentQuerySchema | path |
| localFindFiles | FindFilesQuerySchema | path |
| localViewStructure | ViewStructureQuerySchema | path |
| lspGotoDefinition | LSPGotoDefinitionQuerySchema | uri, symbolName, lineHint |
| lspFindReferences | LSPFindReferencesQuerySchema | uri, symbolName, lineHint |
| lspCallHierarchy | LSPCallHierarchyQuerySchema | uri, symbolName, lineHint, direction |
| githubSearchCode | GitHubCodeSearchQuerySchema | keywordsToSearch |
| githubGetFileContent | FileContentQuerySchema | owner, repo, path |
| githubViewRepoStructure | GitHubViewRepoStructureQuerySchema | owner, repo, branch |
| githubSearchRepositories | GitHubReposSearchSingleQuerySchema | keywordsToSearch or topicsToSearch |
| githubSearchPullRequests | GitHubPullRequestSearchQuerySchema | (varies) |
| packageSearch | PackageSearchQuerySchema | name |

---

*Generated from octocode-research v2.0.0*

# API Reference

Complete reference for the octocode-research HTTP API endpoints.

## Base URL

```
http://localhost:1987
```

The server runs on port 1987 by default.

Reference: `octocode-research/src/server.ts:15`

## Endpoints Overview

The server exposes 12 REST endpoints organized into three categories:

1. **Health & Readiness** (1 endpoint)
2. **Tool Management** (3 endpoints)
3. **Prompt Management** (2 endpoints)
4. **Direct Tool Routes** (6 endpoints)

Reference: `octocode-research/src/server.ts:148-198`

## Health & Readiness

### GET /health

Health check endpoint to verify server is running.

**Request:**
```bash
curl http://localhost:1987/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-23T10:30:00.000Z",
  "uptime": 123.456
}
```

**Response Fields:**
- `status`: Always "ok" if server is responding
- `timestamp`: Current server time in ISO 8601 format
- `uptime`: Server uptime in seconds

Reference: `octocode-research/src/server.ts:149-160`

## Tool Management

### GET /tools/list

List all available tools with their names.

**Request:**
```bash
curl http://localhost:1987/tools/list
```

**Response:**
```json
{
  "tools": [
    "githubSearchCode",
    "githubGetFileContent",
    "githubViewRepoStructure",
    "githubSearchRepositories",
    "githubSearchPullRequests",
    "localSearchCode",
    "localGetFileContent",
    "localViewStructure",
    "localFindFiles",
    "lspGotoDefinition",
    "lspFindReferences",
    "lspCallHierarchy",
    "packageSearch"
  ],
  "count": 13
}
```

**Response Fields:**
- `tools`: Array of tool names (strings)
- `count`: Total number of available tools

Reference: `octocode-research/src/routes/tools.ts:100-140`

### GET /tools/info/:toolName

Get detailed information about a specific tool, including its JSON schema.

**Request:**
```bash
curl http://localhost:1987/tools/info/githubSearchCode
```

**Response:**
```json
{
  "tool": "githubSearchCode",
  "description": "Search GitHub code with filters",
  "schema": {
    "type": "object",
    "properties": {
      "queries": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "keywordsToSearch": { "type": "array" },
            "owner": { "type": "string" },
            "repo": { "type": "string" }
          }
        }
      }
    }
  }
}
```

**Response Fields:**
- `tool`: Tool name
- `description`: Human-readable description
- `schema`: JSON schema for tool parameters

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "message": "Tool not found: invalidTool",
    "code": "TOOL_NOT_FOUND"
  }
}
```

Reference: `octocode-research/src/routes/tools.ts:145-178`

### GET /tools/initContext

Initialize the MCP tool and prompt cache. This endpoint should be called once before executing tools to improve performance.

**Request:**
```bash
curl http://localhost:1987/tools/initContext
```

**Response:**
```json
{
  "success": true,
  "cached_tools": 13,
  "cached_prompts": 5
}
```

**Response Fields:**
- `success`: Always true if initialization succeeds
- `cached_tools`: Number of tools loaded into cache
- `cached_prompts`: Number of prompts loaded into cache

**What this does:**
- Calls MCP `listTools()` and caches the result
- Calls MCP `listPrompts()` and caches the result
- Improves performance of subsequent tool executions
- Cache persists for the lifetime of the server process

Reference: `octocode-research/src/routes/tools.ts:180-220`, `octocode-research/src/mcpCache.ts:1-50`

## Tool Execution

### POST /tools/call/:toolName

Execute a tool with the provided parameters. This is the primary endpoint for tool execution.

**Request Format:**
```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "keywordsToSearch": ["useState"],
        "owner": "facebook",
        "repo": "react"
      }
    ]
  }'
```

**Request Body Schema:**
```typescript
{
  queries: Array<QueryObject>  // 1-5 queries per request
}
```

**Single Query Response:**
```json
{
  "tool": "githubSearchCode",
  "success": true,
  "data": {
    "results": [...],
    "total_count": 150
  },
  "hints": [
    "Found 150 results matching 'useState' in facebook/react",
    "Consider narrowing the search with additional filters"
  ],
  "research": {
    "goal": "Find useState usage in React",
    "evidence": [...]
  }
}
```

**Bulk Query Response (multiple queries):**
```json
{
  "tool": "githubSearchCode",
  "bulk": true,
  "success": true,
  "instructions": "Executed 3 queries in parallel",
  "results": [
    {
      "index": 0,
      "success": true,
      "data": {...},
      "hints": [...]
    },
    {
      "index": 1,
      "success": true,
      "data": {...},
      "hints": [...]
    },
    {
      "index": 2,
      "success": false,
      "error": "Rate limit exceeded",
      "hints": [...]
    }
  ],
  "summary": {
    "total": 3,
    "successful": 2,
    "failed": 1
  }
}
```

**Response Fields (Single Query):**
- `tool`: Tool name that was executed
- `success`: Boolean indicating if execution succeeded
- `data`: Tool-specific result data (null on error)
- `hints`: Array of helpful hints for using the tool
- `research`: Optional research metadata (goal, evidence)

**Response Fields (Bulk Query):**
- `tool`: Tool name
- `bulk`: Always true for bulk queries
- `success`: Overall success (true if any query succeeded)
- `instructions`: Summary of execution
- `results`: Array of per-query results with index
- `summary`: Aggregate statistics (total, successful, failed)

Reference: `octocode-research/src/routes/tools.ts:603-690`

**Error Response (400 - Validation Error):**
```json
{
  "tool": "githubSearchCode",
  "success": false,
  "data": null,
  "hints": [
    "Validation failed: queries must be an array",
    "Expected: { queries: Array<QueryObject> }",
    "Received: { query: {...} }"
  ]
}
```

**Error Response (404 - Tool Not Found):**
```json
{
  "tool": "invalidTool",
  "success": false,
  "data": null,
  "hints": [
    "Tool not found: invalidTool",
    "Available tools: githubSearchCode, githubGetFileContent, ..."
  ]
}
```

**Error Response (500 - Server Error):**
```json
{
  "tool": "githubSearchCode",
  "success": false,
  "data": null,
  "hints": [
    "Internal server error",
    "Check logs for details"
  ]
}
```

Reference: `octocode-research/src/routes/tools.ts:620-650`

**Execution Pipeline:**

```
1. Readiness Check: Verify MCP is initialized
2. Tool Validation: Check tool exists in registry
3. Body Validation: Validate request body with Zod
4. Resilience Wrapper:
   - Timeout (60s GitHub, 30s others)
   - Circuit Breaker (fail-fast if open)
   - Retry (exponential backoff)
5. Tool Execution: Call MCP tool function
6. Response Parsing: Convert MCP response to JSON
7. Response: Send JSON with hints
```

Reference: `octocode-research/src/routes/tools.ts:67-690`, `octocode-research/src/utils/resilience.ts:109-130`

## Prompt Management

### GET /prompts/list

List all available prompts.

**Request:**
```bash
curl http://localhost:1987/prompts/list
```

**Response:**
```json
{
  "prompts": [
    {
      "name": "analyze-codebase",
      "description": "Analyze repository structure and patterns"
    },
    {
      "name": "find-implementation",
      "description": "Find implementation of a specific feature"
    }
  ],
  "count": 5
}
```

**Response Fields:**
- `prompts`: Array of prompt objects with name and description
- `count`: Total number of available prompts

Reference: `octocode-research/src/routes/prompts.ts:10-40`

### GET /prompts/info/:promptName

Get the full content of a specific prompt.

**Request:**
```bash
curl http://localhost:1987/prompts/info/analyze-codebase
```

**Response:**
```json
{
  "prompt": "analyze-codebase",
  "description": "Analyze repository structure and patterns",
  "content": "You are analyzing a codebase. Your goal is to...",
  "arguments": [
    {
      "name": "repository_path",
      "description": "Path to the repository",
      "required": true
    }
  ]
}
```

**Response Fields:**
- `prompt`: Prompt name
- `description`: Human-readable description
- `content`: Full prompt text
- `arguments`: Array of expected arguments with descriptions

Reference: `octocode-research/src/routes/prompts.ts:45-80`

## Available Tools

The following 13 tools are available through the `/tools/call/:toolName` endpoint.

### GitHub Tools

#### githubSearchCode

Search for code in GitHub repositories.

**Query Parameters:**
- `keywordsToSearch`: Array of keywords (required)
- `owner`: Repository owner (optional)
- `repo`: Repository name (optional)
- `match`: "file" or "path" (optional)
- `extension`: File extension filter (optional)
- `path`: Path prefix filter (optional)

**Example:**
```json
{
  "queries": [{
    "keywordsToSearch": ["useState"],
    "owner": "facebook",
    "repo": "react",
    "match": "file"
  }]
}
```

Reference: `octocode-research/src/routes/github.ts:10-50`

#### githubGetFileContent

Read file content from a GitHub repository.

**Query Parameters:**
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `path`: File path (required)
- `branch`: Branch name (optional, defaults to default branch)
- `matchString`: Search pattern within file (optional)
- `matchStringContextLines`: Context lines around matches (optional, default 5)

**Example:**
```json
{
  "queries": [{
    "owner": "facebook",
    "repo": "react",
    "path": "src/React.js",
    "matchString": "useState"
  }]
}
```

Reference: `octocode-research/src/routes/github.ts:55-100`

#### githubViewRepoStructure

Display GitHub repository directory structure.

**Query Parameters:**
- `owner`: Repository owner (required)
- `repo`: Repository name (required)
- `branch`: Branch name (required)
- `path`: Directory path (optional, defaults to root)
- `depth`: Recursion depth (optional, 1-2)

**Example:**
```json
{
  "queries": [{
    "owner": "facebook",
    "repo": "react",
    "branch": "main",
    "path": "packages",
    "depth": 2
  }]
}
```

Reference: `octocode-research/src/routes/github.ts:105-140`

#### githubSearchRepositories

Search for GitHub repositories.

**Query Parameters:**
- `keywordsToSearch`: Array of keywords (optional)
- `topicsToSearch`: Array of topics (optional)
- `owner`: Repository owner filter (optional)
- `stars`: Star count filter (e.g., ">1000") (optional)

**Example:**
```json
{
  "queries": [{
    "topicsToSearch": ["react", "typescript"],
    "stars": ">1000"
  }]
}
```

Reference: `octocode-research/src/routes/github.ts:145-180`

#### githubSearchPullRequests

Search for pull requests in GitHub repositories.

**Query Parameters:**
- `owner`: Repository owner (optional)
- `repo`: Repository name (optional)
- `prNumber`: Specific PR number (optional)
- `state`: "open" or "closed" (optional)
- `merged`: Boolean (optional)
- `type`: "metadata", "fullContent", or "partialContent" (optional)

**Example:**
```json
{
  "queries": [{
    "owner": "facebook",
    "repo": "react",
    "prNumber": 12345,
    "type": "metadata"
  }]
}
```

Reference: `octocode-research/src/routes/github.ts:185-230`

### Local File System Tools

#### localSearchCode

Search code in local file system using ripgrep.

**Query Parameters:**
- `pattern`: Search pattern (required)
- `path`: Directory path (required)
- `filesOnly`: Boolean - return only file names (optional)
- `type`: File type filter (e.g., "ts", "js") (optional)
- `include`: Glob patterns to include (optional)
- `exclude`: Glob patterns to exclude (optional)

**Example:**
```json
{
  "queries": [{
    "pattern": "export function",
    "path": "/path/to/project",
    "type": "ts"
  }]
}
```

Reference: `octocode-research/src/routes/local.ts:10-50`

#### localGetFileContent

Read content from a local file.

**Query Parameters:**
- `path`: File path (required)
- `matchString`: Search pattern within file (optional)
- `matchStringContextLines`: Context lines around matches (optional)
- `fullContent`: Boolean - return entire file (optional)

**Example:**
```json
{
  "queries": [{
    "path": "/path/to/file.ts",
    "matchString": "class UserService"
  }]
}
```

Reference: `octocode-research/src/routes/local.ts:55-90`

#### localViewStructure

Display local directory structure.

**Query Parameters:**
- `path`: Directory path (required)
- `depth`: Recursion depth (optional, 1-5)
- `filesOnly`: Boolean - show only files (optional)
- `directoriesOnly`: Boolean - show only directories (optional)
- `pattern`: Name filter pattern (optional)

**Example:**
```json
{
  "queries": [{
    "path": "/path/to/project",
    "depth": 2,
    "pattern": "*.ts"
  }]
}
```

Reference: `octocode-research/src/routes/local.ts:95-130`

#### localFindFiles

Find files in local file system by metadata.

**Query Parameters:**
- `path`: Starting directory (required)
- `name`: Name pattern (optional)
- `type`: File type "f", "d", or "l" (optional)
- `modifiedWithin`: Time period (e.g., "7d", "2h") (optional)
- `sizeGreater`: Size filter (e.g., "10M") (optional)

**Example:**
```json
{
  "queries": [{
    "path": "/path/to/project",
    "name": "*.test.ts",
    "modifiedWithin": "7d"
  }]
}
```

Reference: `octocode-research/src/routes/local.ts:135-170`

### LSP Semantic Tools

#### lspGotoDefinition

Find the definition of a symbol using Language Server Protocol.

**Query Parameters:**
- `uri`: File path (required)
- `symbolName`: Symbol to find (required)
- `lineHint`: Line number hint (required)
- `contextLines`: Context lines to include (optional, default 5)

**Example:**
```json
{
  "queries": [{
    "uri": "/path/to/file.ts",
    "symbolName": "UserService",
    "lineHint": 42
  }]
}
```

Reference: `octocode-research/src/routes/lsp.ts:10-45`

#### lspFindReferences

Find all references to a symbol using LSP.

**Query Parameters:**
- `uri`: File path (required)
- `symbolName`: Symbol to find (required)
- `lineHint`: Line number hint (required)
- `includeDeclaration`: Boolean (optional, default true)
- `contextLines`: Context lines to include (optional, default 2)

**Example:**
```json
{
  "queries": [{
    "uri": "/path/to/file.ts",
    "symbolName": "UserService",
    "lineHint": 42,
    "includeDeclaration": true
  }]
}
```

Reference: `octocode-research/src/routes/lsp.ts:50-90`

#### lspCallHierarchy

Find incoming or outgoing calls for a function/method using LSP.

**Query Parameters:**
- `uri`: File path (required)
- `symbolName`: Function/method name (required)
- `lineHint`: Line number hint (required)
- `direction`: "incoming" or "outgoing" (required)
- `depth`: Recursion depth (optional, 1-3)

**Example:**
```json
{
  "queries": [{
    "uri": "/path/to/file.ts",
    "symbolName": "processUser",
    "lineHint": 100,
    "direction": "incoming",
    "depth": 2
  }]
}
```

Reference: `octocode-research/src/routes/lsp.ts:95-135`

### Package Search Tools

#### packageSearch

Search for NPM or Python packages.

**Query Parameters:**
- `ecosystem`: "npm" or "python" (required)
- `name`: Package name (required)
- `searchLimit`: Number of results (optional, default 1)

**Example:**
```json
{
  "queries": [{
    "ecosystem": "npm",
    "name": "express",
    "searchLimit": 1
  }]
}
```

Reference: `octocode-research/src/routes/package.ts:10-45`

## Validation

All requests to `/tools/call/:toolName` are validated using Zod schemas.

**Request Body Schema:**
```typescript
{
  queries: z.array(z.record(z.unknown())).min(1).max(5)
}
```

**Validation Rules:**
- `queries` must be an array
- Minimum 1 query, maximum 5 queries per request
- Each query is a key-value object with tool-specific parameters

Reference: `octocode-research/src/validation/toolCallSchema.ts:1-30`

**Validation Error Response:**
```json
{
  "tool": "githubSearchCode",
  "success": false,
  "data": null,
  "hints": [
    "Validation failed: queries must be an array",
    "Expected: { queries: Array<QueryObject> }",
    "Got: { query: {...} }",
    "Field 'queries[0].keywordsToSearch': required"
  ]
}
```

Reference: `octocode-research/src/routes/tools.ts:620-650`

## Rate Limiting & Resilience

All tool executions are protected by resilience patterns:

### Timeouts

- **GitHub tools**: 60 seconds
- **Local tools**: 30 seconds
- **LSP tools**: 30 seconds
- **Package tools**: 30 seconds

Reference: `octocode-research/src/utils/resilience.ts:15-22`

### Circuit Breakers

Tools are grouped by circuit for failure isolation:

- `github:search` - GitHub Search API (2 failures → open, 60s reset)
- `github:content` - GitHub Contents API (3 failures → open, 30s reset)
- `github:pulls` - GitHub PR API (3 failures → open, 30s reset)
- `lsp:navigation` - LSP navigation (3 failures → open, 30s reset)
- `lsp:hierarchy` - LSP call hierarchy (3 failures → open, 30s reset)
- `local` - Local file operations (3 failures → open, 30s reset)
- `package` - Package search (3 failures → open, 30s reset)

Reference: `octocode-research/src/utils/resilience.ts:32-60`, `octocode-research/src/utils/circuitBreaker.ts:322-360`

### Retry

Tools automatically retry on transient errors with exponential backoff:

- **LSP**: 3 attempts, 500ms → 1s → 2s (max 5s)
- **GitHub**: 3 attempts, 1s → 3s → 9s (max 30s)
- **Package**: 3 attempts, 1s → 2s → 4s (max 15s)
- **Local**: 2 attempts, 100ms → 200ms (max 1s)

**Retryable errors:**
- Rate limiting (HTTP 429, 403)
- Server errors (HTTP 500-599)
- Timeouts
- Connection refused
- LSP not ready
- File busy

Reference: `octocode-research/src/utils/retry.ts:30-75`, `octocode-research/src/utils/retry.ts:171-210`

## Error Handling

All errors are handled by centralized middleware and returned in a standardized format.

**Error Response Format:**
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded for GitHub API",
    "code": "RATE_LIMIT_ERROR"
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` - Request validation failed (400)
- `TOOL_NOT_FOUND` - Tool doesn't exist (404)
- `CIRCUIT_OPEN` - Circuit breaker is open (503)
- `TIMEOUT_ERROR` - Operation timed out (500)
- `RATE_LIMIT_ERROR` - Rate limit exceeded (429)
- `INTERNAL_ERROR` - Server error (500)

Reference: `octocode-research/src/middleware/errorHandler.ts:15-65`

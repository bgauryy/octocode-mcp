# API Reference

Complete technical reference for all MCP tools, schemas, and response formats in octocode-mcp.

## Table of Contents

- [Overview](#overview)
- [Bulk Query Pattern](#bulk-query-pattern)
- [GitHub Tools](#github-tools)
  - [githubSearchCode](#githubsearchcode)
  - [githubGetFileContent](#githubgetfilecontent)
  - [githubViewRepoStructure](#githubviewrepostructure)
  - [githubSearchRepositories](#githubsearchrepositories)
  - [githubSearchPullRequests](#githubsearchpullrequests)
  - [packageSearch](#packagesearch)
- [Local Code Search Tools](#local-code-search-tools)
  - [localSearchCode](#localsearchcode)
  - [localGetFileContent](#localgetfilecontent)
  - [localViewStructure](#localviewstructure)
  - [localFindFiles](#localfindfiles)
- [LSP Tools](#lsp-tools)
  - [lspGotoDefinition](#lspgotodefinition)
  - [lspFindReferences](#lspfindreferences)
  - [lspCallHierarchy](#lspcallhierarchy)
- [Response Formats](#response-formats)
- [Error Handling](#error-handling)

## Overview

Octocode MCP provides 13 MCP tools organized into three categories:

1. **GitHub/GitLab Tools (6 tools):** External repository analysis and code discovery
2. **Local Code Search Tools (4 tools):** Local filesystem operations with ripgrep, find, and ls
3. **LSP Tools (3 tools):** Semantic code navigation via Language Server Protocol

All tools follow a consistent bulk query pattern, accepting 1-5 queries per invocation for parallel execution.

## Bulk Query Pattern

All tools support bulk queries to enable efficient parallel execution of multiple requests.

### Schema Structure

```typescript
{
  queries: Array<QuerySchema>  // 1-5 queries per call
}
```

### Query Limits by Tool Category

| Tool Category | Max Queries | Notes |
|--------------|-------------|-------|
| GitHub Tools | 3 | Rate limit conscious |
| Local Tools | 5 | No external API calls |
| LSP Tools (goto/references) | 5 | Fast local operations |
| LSP Tools (call hierarchy) | 3 | Expensive operation |

### Base Query Fields

All queries include context fields for research tracking:

**GitHub Tools:**
```typescript
{
  mainResearchGoal: string     // Overall research objective
  researchGoal: string          // Goal for this specific query
  reasoning: string             // Why this approach helps reach the goal
}
```

**Local Tools:**
```typescript
{
  researchGoal?: string         // Optional: Goal of the search
  reasoning?: string            // Optional: Why this approach helps
}
```

### Example: Bulk Query

```typescript
{
  "queries": [
    {
      "mainResearchGoal": "Understand authentication implementation",
      "researchGoal": "Find authentication service definition",
      "reasoning": "Need to locate the core auth logic",
      "owner": "facebook",
      "repo": "react",
      "keywordsToSearch": ["AuthService", "authenticate"],
      "extension": "ts"
    },
    {
      "mainResearchGoal": "Understand authentication implementation",
      "researchGoal": "Find authentication tests",
      "reasoning": "Tests reveal usage patterns",
      "owner": "facebook",
      "repo": "react",
      "keywordsToSearch": ["AuthService"],
      "path": "__tests__"
    }
  ]
}
```

## GitHub Tools

### githubSearchCode

Search code across GitHub repositories using keywords, file extensions, and path filters.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keywordsToSearch` | `string[]` | Yes | - | 1-5 keywords to search for |
| `owner` | `string` | No | - | Repository owner/organization |
| `repo` | `string` | No | - | Repository name |
| `extension` | `string` | No | - | File extension filter (e.g., "ts", "py") |
| `filename` | `string` | No | - | Filename pattern |
| `path` | `string` | No | - | Path prefix filter |
| `match` | `"file" \| "path"` | No | - | Match in file content or path |
| `limit` | `number` | No | 10 | Results per query (1-100) |
| `page` | `number` | No | 1 | Page number (1-10) |

#### Constraints

- Maximum 5 keywords per query
- Limit: 1-100 results
- Page: 1-10
- Use at most 1-2 filters (extension, filename, or path) to avoid GitHub API limitations

#### Example

```json
{
  "queries": [{
    "mainResearchGoal": "Find React hooks implementation",
    "researchGoal": "Locate useState source code",
    "reasoning": "Need to understand state management internals",
    "owner": "facebook",
    "repo": "react",
    "keywordsToSearch": ["useState"],
    "match": "file",
    "extension": "js",
    "limit": 10
  }]
}
```

#### Response Format

```typescript
{
  status: "success" | "error",
  results: [{
    file: string,              // File path
    repository: string,        // owner/repo
    matches: number,           // Match count
    url: string,               // GitHub URL
    text_matches?: [{          // Optional: highlighted matches
      fragment: string,
      matches: [{
        text: string,
        indices: [number, number]
      }]
    }]
  }],
  totalCount: number,
  pagination: {
    currentPage: number,
    hasMore: boolean
  },
  hints: string[]              // Next steps suggestions
}
```

### githubGetFileContent

Fetch file content from GitHub repositories with support for line ranges and string matching.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `owner` | `string` | Yes | - | Repository owner (1-200 chars) |
| `repo` | `string` | Yes | - | Repository name (1-150 chars) |
| `path` | `string` | Yes | - | File path in repository |
| `branch` | `string` | No | default | Branch name (1-255 chars) |
| `fullContent` | `boolean` | No | false | Return entire file |
| `startLine` | `number` | No | - | Start line (1-indexed) |
| `endLine` | `number` | No | - | End line (1-indexed, inclusive) |
| `matchString` | `string` | No | - | Search pattern for targeted extraction |
| `matchStringContextLines` | `number` | No | 5 | Context lines around matches (1-50) |
| `charOffset` | `number` | No | 0 | Character offset for pagination |
| `charLength` | `number` | No | - | Characters to return (50-50000) |

#### Validation Rules

- `fullContent`, `startLine/endLine`, and `matchString` are mutually exclusive
- `startLine` and `endLine` must be used together
- `startLine` must be ≤ `endLine`
- Maximum file size: 300KB

#### Example: Line Range Extraction

```json
{
  "queries": [{
    "mainResearchGoal": "Review authentication logic",
    "researchGoal": "Read auth service implementation",
    "reasoning": "Lines 50-100 contain the core logic",
    "owner": "myorg",
    "repo": "myapp",
    "path": "src/services/AuthService.ts",
    "branch": "main",
    "startLine": 50,
    "endLine": 100
  }]
}
```

#### Example: Pattern-Based Extraction

```json
{
  "queries": [{
    "mainResearchGoal": "Find export functions",
    "researchGoal": "Extract all exported functions",
    "reasoning": "matchString is token-efficient for targeted extraction",
    "owner": "facebook",
    "repo": "react",
    "path": "packages/react/src/React.js",
    "matchString": "export function",
    "matchStringContextLines": 10
  }]
}
```

#### Response Format

```typescript
{
  status: "success" | "error",
  content: string,             // File content
  encoding: "utf-8" | "base64",
  size: number,                // Content size in bytes
  sha: string,                 // Git SHA
  pagination?: {
    charOffset: number,
    charLength: number,
    totalChars: number,
    hasMore: boolean,
    nextCharOffset?: number
  },
  hints: string[]
}
```

### githubViewRepoStructure

Display repository directory structure with configurable depth and pagination.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `owner` | `string` | Yes | - | Repository owner (1-200 chars) |
| `repo` | `string` | Yes | - | Repository name (1-150 chars) |
| `branch` | `string` | Yes | - | Branch name (1-255 chars) |
| `path` | `string` | No | "" | Directory path to view |
| `depth` | `number` | No | 1 | Recursion depth (1-2) |
| `entriesPerPage` | `number` | No | 50 | Entries per page (1-200) |
| `entryPageNumber` | `number` | No | 1 | Page number (1+) |

#### Workflow

1. Start at root: `path=""`, `depth=1`
2. Explore subdirectories: `path="src"`, `depth=2`
3. Use pagination for large directories

#### Example

```json
{
  "queries": [{
    "mainResearchGoal": "Understand React project structure",
    "researchGoal": "View packages directory",
    "reasoning": "Monorepo structure requires exploring packages/",
    "owner": "facebook",
    "repo": "react",
    "branch": "main",
    "path": "packages",
    "depth": 2,
    "entriesPerPage": 50
  }]
}
```

#### Response Format

```typescript
{
  owner: string,
  repo: string,
  branch: string,
  path: string,
  structure: {
    [path: string]: {
      type: "file" | "dir",
      size?: number,
      sha?: string
    }
  },
  summary: {
    totalFiles: number,
    totalFolders: number,
    truncated: boolean
  },
  pagination?: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

### githubSearchRepositories

Search GitHub repositories by keywords, topics, stars, and other criteria.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keywordsToSearch` | `string[]` | No* | - | Keywords to search |
| `topicsToSearch` | `string[]` | No* | - | Topic filters |
| `owner` | `string` | No | - | Organization/user filter |
| `stars` | `string` | No | - | Star count (e.g., ">1000") |
| `size` | `string` | No | - | Repository size filter |
| `created` | `string` | No | - | Creation date filter |
| `updated` | `string` | No | - | Last update filter |
| `match` | `("name"\|"description"\|"readme")[]` | No | - | Search scope |
| `sort` | `"forks"\|"stars"\|"updated"\|"best-match"` | No | - | Sort order |
| `limit` | `number` | No | 10 | Results per query (1-100) |
| `page` | `number` | No | 1 | Page number (1-10) |

*At least one of `keywordsToSearch` or `topicsToSearch` is required.

#### Example

```json
{
  "queries": [{
    "mainResearchGoal": "Find popular TypeScript CLI frameworks",
    "researchGoal": "Search for CLI tools",
    "reasoning": "Topics provide better filtering than keywords",
    "topicsToSearch": ["typescript", "cli"],
    "stars": ">1000",
    "sort": "stars",
    "limit": 10
  }]
}
```

#### Response Format

```typescript
{
  repositories: [{
    name: string,
    full_name: string,
    description: string,
    stars: number,
    forks: number,
    language: string,
    topics: string[],
    updated_at: string,
    html_url: string
  }],
  totalCount: number,
  pagination: {
    currentPage: number,
    hasMore: boolean
  },
  hints: string[]
}
```

### githubSearchPullRequests

Search pull requests with filters for state, author, labels, and date ranges.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `owner` | `string` | No | - | Repository owner |
| `repo` | `string` | No | - | Repository name |
| `prNumber` | `number` | No | - | Specific PR number (ignores other filters) |
| `query` | `string` | No | - | Free-text search query |
| `state` | `"open"\|"closed"` | No | - | PR state |
| `author` | `string` | No | - | PR author username |
| `assignee` | `string` | No | - | Assignee username |
| `label` | `string\|string[]` | No | - | Label filter |
| `merged` | `boolean` | No | - | Only merged PRs |
| `draft` | `boolean` | No | - | Only draft PRs |
| `created` | `string` | No | - | Creation date (e.g., "2024-01-01..2024-12-31") |
| `updated` | `string` | No | - | Update date range |
| `type` | `"metadata"\|"fullContent"\|"partialContent"` | No | "metadata" | Response detail level |
| `withComments` | `boolean` | No | false | Include comments |
| `withCommits` | `boolean` | No | false | Include commits |
| `limit` | `number` | No | 5 | Results per query (1-10) |
| `page` | `number` | No | 1 | Page number (1-10) |

#### Response Types

- **metadata:** Basic PR information (fast)
- **fullContent:** Full PR with all files (slow)
- **partialContent:** Specific files only (use with `partialContentMetadata`)

#### Example: Find PR by Number

```json
{
  "queries": [{
    "mainResearchGoal": "Understand authentication refactor",
    "researchGoal": "Review PR #123",
    "reasoning": "Found PR reference in code comments",
    "owner": "myorg",
    "repo": "myapp",
    "prNumber": 123,
    "type": "metadata",
    "withComments": true
  }]
}
```

#### Example: Search Merged PRs

```json
{
  "queries": [{
    "mainResearchGoal": "Find authentication changes",
    "researchGoal": "Search merged PRs about auth",
    "reasoning": "Historical context for current implementation",
    "owner": "myorg",
    "repo": "myapp",
    "query": "authentication",
    "state": "closed",
    "merged": true,
    "created": ">2024-01-01",
    "limit": 5
  }]
}
```

#### Response Format

```typescript
{
  pullRequests: [{
    number: number,
    title: string,
    state: "open" | "closed",
    merged: boolean,
    author: string,
    created_at: string,
    updated_at: string,
    html_url: string,
    comments?: Array<{
      author: string,
      body: string,
      created_at: string
    }>,
    commits?: Array<{
      sha: string,
      message: string,
      author: string
    }>,
    files?: Array<{
      filename: string,
      status: "added" | "modified" | "removed",
      additions: number,
      deletions: number,
      patch?: string
    }>
  }],
  totalCount: number,
  hints: string[]
}
```

### packageSearch

Search NPM and PyPI package registries to find package information and repository URLs.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Package name to search |
| `ecosystem` | `"npm"\|"python"` | Yes | - | Package ecosystem |
| `searchLimit` | `number` | No | 1 | Max results (1-10) |
| `npmFetchMetadata` | `boolean` | No | false | Fetch full NPM metadata |
| `pythonFetchMetadata` | `boolean` | No | false | Fetch full PyPI metadata |

#### Example: NPM Package

```json
{
  "queries": [{
    "mainResearchGoal": "Research axios implementation",
    "researchGoal": "Find axios repository",
    "reasoning": "Need repository URL to explore source code",
    "name": "axios",
    "ecosystem": "npm",
    "searchLimit": 1
  }]
}
```

#### Example: Python Package

```json
{
  "queries": [{
    "mainResearchGoal": "Study requests library",
    "researchGoal": "Locate requests package",
    "reasoning": "Package metadata reveals repository",
    "name": "requests",
    "ecosystem": "python",
    "searchLimit": 1
  }]
}
```

#### Response Format

```typescript
{
  packages: [{
    name: string,
    version: string,
    description: string,
    repository?: {
      type: "git",
      url: string,
      owner?: string,      // Parsed from URL
      repo?: string        // Parsed from URL
    },
    homepage?: string,
    author?: string,
    license?: string,
    deprecated?: boolean
  }],
  hints: string[]
}
```

## Local Code Search Tools

### localSearchCode

Fast pattern search across local files using ripgrep with regex patterns, file filters, and context lines.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pattern` | `string` | Yes | - | Search pattern (regex or literal) |
| `path` | `string` | Yes | - | Root directory to search |
| `mode` | `"discovery"\|"paginated"\|"detailed"` | No | - | Workflow preset |
| `fixedString` | `boolean` | No | false | Literal string search (no regex) |
| `smartCase` | `boolean` | No | true | Case-insensitive if lowercase |
| `type` | `string` | No | - | File type (ts, py, rust, etc.) |
| `include` | `string[]` | No | - | Include glob patterns |
| `exclude` | `string[]` | No | - | Exclude glob patterns |
| `filesOnly` | `boolean` | No | false | List matching files only |
| `contextLines` | `number` | No | - | Context lines (0-50) |
| `matchesPerPage` | `number` | No | 10 | Matches per file (1-100) |
| `filesPerPage` | `number` | No | 10 | Files per page (1-20) |
| `filePageNumber` | `number` | No | 1 | File page number |

#### Workflow Modes

**discovery:** Fast file discovery
```json
{ "mode": "discovery" }
// Sets: filesOnly=true, smartCase=true
```

**paginated:** Paginated content with sensible limits
```json
{ "mode": "paginated" }
// Sets: filesPerPage=10, matchesPerPage=10, smartCase=true
```

**detailed:** Full matches with context
```json
{ "mode": "detailed" }
// Sets: contextLines=3, filesPerPage=10, matchesPerPage=20, smartCase=true
```

#### Example: Discovery Phase

```json
{
  "queries": [{
    "researchGoal": "Find all TypeScript files with AuthService",
    "reasoning": "Discovery phase: find which files to read",
    "pattern": "AuthService",
    "path": "/path/to/project",
    "mode": "discovery",
    "type": "ts"
  }]
}
```

#### Example: Detailed Search

```json
{
  "queries": [{
    "researchGoal": "Examine AuthService implementations",
    "reasoning": "Read actual code with context",
    "pattern": "class AuthService",
    "path": "/path/to/project/src",
    "type": "ts",
    "contextLines": 5,
    "matchesPerPage": 10
  }]
}
```

#### Response Format

```typescript
{
  files: [{
    path: string,
    matchCount: number,
    matches?: [{
      lineNumber: number,
      content: string,
      beforeContext?: string[],
      afterContext?: string[]
    }],
    modified?: string,
    pagination?: {
      currentPage: number,
      hasMore: boolean,
      matchesOnPage: number
    }
  }],
  stats: {
    filesSearched: number,
    filesWithMatches: number,
    totalMatches: number,
    searchTimeMs: number
  },
  pagination: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

### localGetFileContent

Read local file content with support for line ranges, string matching, and pagination.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | `string` | Yes | - | File path (absolute or relative) |
| `fullContent` | `boolean` | No | false | Return entire file |
| `startLine` | `number` | No | - | Start line (1-indexed) |
| `endLine` | `number` | No | - | End line (1-indexed, inclusive) |
| `matchString` | `string` | No | - | Pattern to match |
| `matchStringContextLines` | `number` | No | 5 | Context lines (1-50) |
| `matchStringIsRegex` | `boolean` | No | false | Treat matchString as regex |
| `matchStringCaseSensitive` | `boolean` | No | false | Case-sensitive matching |
| `charOffset` | `number` | No | 0 | Character offset for pagination |
| `charLength` | `number` | No | - | Characters to return (1-10000) |

#### Validation Rules

- `fullContent`, `startLine/endLine`, and `matchString` are mutually exclusive
- `startLine` and `endLine` must be used together
- `startLine` must be ≤ `endLine`

#### Example: Pattern-Based Extraction

```json
{
  "queries": [{
    "researchGoal": "Extract export functions",
    "reasoning": "matchString is token-efficient",
    "path": "/path/to/project/src/auth.ts",
    "matchString": "export function",
    "matchStringContextLines": 10
  }]
}
```

#### Example: Line Range

```json
{
  "queries": [{
    "researchGoal": "Read specific function",
    "reasoning": "Found function at lines 50-100",
    "path": "/path/to/project/src/utils.ts",
    "startLine": 50,
    "endLine": 100
  }]
}
```

#### Response Format

```typescript
{
  path: string,
  content: string,
  size: number,
  matches?: Array<{
    lineNumber: number,
    content: string,
    beforeContext?: string[],
    afterContext?: string[]
  }>,
  pagination?: {
    charOffset: number,
    charLength: number,
    totalChars: number,
    hasMore: boolean,
    nextCharOffset?: number
  },
  hints: string[]
}
```

### localViewStructure

Display local directory structure with file sizes, extensions, and configurable depth.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | `string` | Yes | - | Directory path |
| `depth` | `number` | No | - | Recursion depth (1-5) |
| `recursive` | `boolean` | No | false | Recursive listing |
| `details` | `boolean` | No | false | Show size/permissions |
| `hidden` | `boolean` | No | false | Include hidden files |
| `sortBy` | `"name"\|"size"\|"time"\|"extension"` | No | "time" | Sort order |
| `filesOnly` | `boolean` | No | false | Files only |
| `directoriesOnly` | `boolean` | No | false | Directories only |
| `extension` | `string` | No | - | Filter by extension |
| `extensions` | `string[]` | No | - | Multiple extensions |
| `pattern` | `string` | No | - | Name pattern (glob or substring) |
| `entriesPerPage` | `number` | No | 20 | Entries per page (1-20) |
| `entryPageNumber` | `number` | No | 1 | Page number |
| `limit` | `number` | No | - | Max entries (1-10000) |

#### Example: Overview

```json
{
  "queries": [{
    "researchGoal": "Understand project structure",
    "reasoning": "Start with root directory",
    "path": "/path/to/project",
    "depth": 1,
    "entriesPerPage": 20
  }]
}
```

#### Example: TypeScript Files

```json
{
  "queries": [{
    "researchGoal": "Find TypeScript source files",
    "reasoning": "Filter by extension for relevant files",
    "path": "/path/to/project/src",
    "extensions": ["ts", "tsx"],
    "filesOnly": true,
    "sortBy": "time"
  }]
}
```

#### Response Format

```typescript
{
  path: string,
  entries: [{
    name: string,
    type: "file" | "dir",
    size?: number,
    modified?: string,
    permissions?: string
  }],
  summary: {
    totalFiles: number,
    totalDirs: number,
    totalSize: number
  },
  pagination?: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

### localFindFiles

Find files on local filesystem by name patterns, modification time, size, and permissions.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | `string` | Yes | - | Starting directory |
| `name` | `string` | No | - | Name pattern (e.g., "*.test.ts") |
| `iname` | `string` | No | - | Case-insensitive name |
| `names` | `string[]` | No | - | Multiple patterns (OR logic) |
| `type` | `"f"\|"d"\|"l"` | No | - | File type (f=file, d=dir, l=symlink) |
| `maxDepth` | `number` | No | 5 | Max depth (1-10) |
| `minDepth` | `number` | No | - | Min depth (0-10) |
| `modifiedWithin` | `string` | No | - | Modified within (e.g., "7d", "2h") |
| `modifiedBefore` | `string` | No | - | Modified before |
| `sizeGreater` | `string` | No | - | Size > (e.g., "10M", "1G") |
| `sizeLess` | `string` | No | - | Size < |
| `permissions` | `string` | No | - | Permission pattern (e.g., "755") |
| `executable` | `boolean` | No | - | Executable files |
| `readable` | `boolean` | No | - | Readable files |
| `writable` | `boolean` | No | - | Writable files |
| `excludeDir` | `string[]` | No | - | Directories to exclude |
| `filesPerPage` | `number` | No | 20 | Files per page (1-20) |
| `filePageNumber` | `number` | No | 1 | Page number |
| `limit` | `number` | No | 1000 | Max results (1-10000) |

#### Example: Recent TypeScript Files

```json
{
  "queries": [{
    "researchGoal": "Find recently modified test files",
    "reasoning": "Recent changes indicate active development",
    "path": "/path/to/project",
    "name": "*.test.ts",
    "modifiedWithin": "7d",
    "type": "f"
  }]
}
```

#### Example: Large Files

```json
{
  "queries": [{
    "researchGoal": "Identify large files",
    "reasoning": "Large files may need optimization",
    "path": "/path/to/project/src",
    "type": "f",
    "sizeGreater": "1M",
    "excludeDir": ["node_modules", "dist"]
  }]
}
```

#### Response Format

```typescript
{
  files: [{
    path: string,
    type: "file" | "dir" | "symlink",
    size?: number,
    modified?: string,
    permissions?: string
  }],
  totalCount: number,
  pagination?: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

## LSP Tools

LSP tools provide semantic code navigation using Language Server Protocol.

### lspGotoDefinition

Navigate to symbol definitions using LSP.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uri` | `string` | Yes | - | File URI or path |
| `symbolName` | `string` | Yes | - | Symbol to find (1-255 chars) |
| `lineHint` | `number` | Yes | - | Line number hint (1-indexed) |
| `orderHint` | `number` | No | 0 | Nth occurrence on line |
| `contextLines` | `number` | No | 5 | Context lines (0-20) |

#### Example

```json
{
  "queries": [{
    "researchGoal": "Find AuthService definition",
    "reasoning": "Need to understand interface",
    "uri": "/path/to/project/src/index.ts",
    "symbolName": "AuthService",
    "lineHint": 42,
    "contextLines": 10
  }]
}
```

#### Response Format

```typescript
{
  definitions: [{
    uri: string,
    range: {
      start: { line: number, character: number },
      end: { line: number, character: number }
    },
    content: string,
    contextBefore: string[],
    contextAfter: string[]
  }],
  hints: string[]
}
```

### lspFindReferences

Find all references to a symbol using LSP.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uri` | `string` | Yes | - | File URI or path |
| `symbolName` | `string` | Yes | - | Symbol to find (1-255 chars) |
| `lineHint` | `number` | Yes | - | Line number hint (1-indexed) |
| `orderHint` | `number` | No | 0 | Nth occurrence on line |
| `includeDeclaration` | `boolean` | No | true | Include declaration |
| `contextLines` | `number` | No | 2 | Context lines (0-10) |
| `referencesPerPage` | `number` | No | 20 | References per page (1-50) |
| `page` | `number` | No | 1 | Page number |

#### Example

```json
{
  "queries": [{
    "researchGoal": "Find all uses of AuthService",
    "reasoning": "Understand usage patterns",
    "uri": "/path/to/project/src/services/AuthService.ts",
    "symbolName": "AuthService",
    "lineHint": 10,
    "referencesPerPage": 20
  }]
}
```

#### Response Format

```typescript
{
  references: [{
    uri: string,
    range: {
      start: { line: number, character: number },
      end: { line: number, character: number }
    },
    content: string,
    contextBefore: string[],
    contextAfter: string[]
  }],
  totalReferences: number,
  pagination: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

### lspCallHierarchy

Trace incoming and outgoing call relationships for functions using LSP.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uri` | `string` | Yes | - | File URI or path |
| `symbolName` | `string` | Yes | - | Function name (1-255 chars) |
| `lineHint` | `number` | Yes | - | Line number hint (1-indexed) |
| `orderHint` | `number` | No | 0 | Nth occurrence on line |
| `direction` | `"incoming"\|"outgoing"` | Yes | - | Call direction |
| `depth` | `number` | No | 1 | Hierarchy depth (1-3) |
| `contextLines` | `number` | No | 2 | Context lines (0-10) |
| `callsPerPage` | `number` | No | 15 | Calls per page (1-30) |
| `page` | `number` | No | 1 | Page number |

#### Example: Incoming Calls

```json
{
  "queries": [{
    "researchGoal": "Find callers of authenticate()",
    "reasoning": "Understand who uses authentication",
    "uri": "/path/to/project/src/services/AuthService.ts",
    "symbolName": "authenticate",
    "lineHint": 25,
    "direction": "incoming",
    "depth": 2
  }]
}
```

#### Example: Outgoing Calls

```json
{
  "queries": [{
    "researchGoal": "Understand authenticate() dependencies",
    "reasoning": "See what functions it calls",
    "uri": "/path/to/project/src/services/AuthService.ts",
    "symbolName": "authenticate",
    "lineHint": 25,
    "direction": "outgoing",
    "depth": 1
  }]
}
```

#### Response Format

```typescript
{
  calls: [{
    from: {
      name: string,
      uri: string,
      range: { start: {}, end: {} }
    },
    to: {
      name: string,
      uri: string,
      range: { start: {}, end: {} }
    },
    fromRanges: Array<{ start: {}, end: {} }>,
    content: string,
    contextBefore: string[],
    contextAfter: string[],
    depth: number
  }],
  totalCalls: number,
  pagination: {
    currentPage: number,
    totalPages: number,
    hasMore: boolean
  },
  hints: string[]
}
```

## Response Formats

All tools return responses in a consistent format:

### Success Response

```typescript
{
  status: "success",
  data: T,                    // Tool-specific result
  hints: string[]             // Contextual suggestions
}
```

### Error Response

```typescript
{
  status: "error",
  error: string,              // Error message
  code?: string,              // Error code
  hints?: string[]            // Recovery suggestions
}
```

### Bulk Response

```typescript
{
  results: Array<{
    queryIndex: number,
    status: "success" | "error",
    data?: T,
    error?: string,
    hints: string[]
  }>
}
```

## Error Handling

### Common Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `RATE_LIMIT_EXCEEDED` | GitHub API rate limit hit | Wait for reset, use local tools |
| `FILE_TOO_LARGE` | File exceeds 300KB | Use pagination with charOffset/charLength |
| `NOT_FOUND` | Resource not found | Check owner/repo/path spelling |
| `AUTHENTICATION_ERROR` | Invalid/missing token | Set GITHUB_TOKEN, run `gh auth login` |
| `INVALID_QUERY` | Malformed query | Check schema validation |
| `LSP_NOT_AVAILABLE` | Language server not found | Install language server, check PATH |
| `VALIDATION_ERROR` | Schema validation failed | Review parameter constraints |

### Rate Limiting

GitHub API rate limits:

- **Authenticated:** 5000 requests/hour
- **Unauthenticated:** 60 requests/hour
- **Search:** 30 requests/minute

Tools automatically handle rate limiting with:
- Caching (see [14-caching-pagination.md](./14-caching-pagination.md))
- Exponential backoff
- Rate limit headers in error responses

### Error Recovery Hints

Errors include contextual hints for recovery:

```typescript
{
  status: "error",
  error: "Rate limit exceeded",
  rateLimitReset: 1640995200,
  hints: [
    "GitHub API rate limit exceeded",
    "Limit resets at 2022-01-01T00:00:00Z",
    "Use local tools (localSearchCode) as alternative",
    "Results are cached for 1 hour"
  ]
}
```

## Best Practices

### 1. Use Bulk Queries Efficiently

```json
// Good: Related queries in parallel
{
  "queries": [
    { "path": "src/auth", "pattern": "authenticate" },
    { "path": "src/utils", "pattern": "validateToken" }
  ]
}

// Bad: Unrelated queries (separate calls better for error isolation)
{
  "queries": [
    { "path": "/project1", "pattern": "foo" },
    { "path": "/completely/different/project", "pattern": "bar" }
  ]
}
```

### 2. Use Appropriate Discovery Workflow

```json
// Phase 1: Discovery (fast)
{ "mode": "discovery", "pattern": "AuthService" }

// Phase 2: Targeted read (token-efficient)
{ "path": "src/auth.ts", "matchString": "class AuthService", "matchStringContextLines": 10 }

// Phase 3: Deep analysis
{ "pattern": "class AuthService", "contextLines": 5 }
```

### 3. Respect Tool Constraints

- GitHub tools: Maximum 3 queries, rate limit conscious
- Local tools: Maximum 5 queries, no external limits
- LSP tools: 3-5 queries depending on operation cost

### 4. Leverage Caching

Identical queries within TTL are served from cache:
- Code search: 1 hour
- File content: 1 hour
- Repository search: 2 hours
- Pull requests: 30 minutes

### 5. Use Hints for Next Steps

All responses include `hints` array with contextual suggestions:
- Pagination guidance
- Alternative tool recommendations
- Performance optimization tips
- Error recovery strategies

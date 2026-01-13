---
name: octocode-research
description: >-
  Research code in local and remote repositories. Use when users ask to
  search code, explore codebases, find definitions, trace call hierarchies,
  or analyze GitHub repos. Trigger phrases: "find where", "search for",
  "how is X used", "what calls", "explore the codebase", "look up package".
---

# Octocode Research Skill

Code research and discovery for local and remote codebases using octocode tools.

## When to Use This Skill

Use this skill when the user needs to:
- Search for code patterns in local or GitHub repositories
- Explore codebase structure and organization
- Find symbol definitions and references
- Trace function call hierarchies
- Research npm/PyPI packages

## How to Execute Tools

All tools are available as MCP tools through the octocode-local server. Call them directly:

```typescript
// Example: Search local code
await localSearchCode({
  queries: [{
    pattern: 'authenticate',
    path: '/project/src',
    researchGoal: 'Find auth implementation',
    reasoning: 'Understanding authentication flow',
  }]
});
```

## Response Format & Hints

**IMPORTANT**: All tool responses include hints to guide your next actions!

Every tool returns a `CallToolResult` with YAML-formatted content:

```yaml
instructions: "Bulk response with N results..."
results:
  - id: 1
    status: "hasResults" | "empty" | "error"
    data: { ... }
    mainResearchGoal: "..."
    researchGoal: "..."
    reasoning: "..."
hasResultsStatusHints:      # <-- CHECK THESE for next steps when results found
  - "Use lineHint for LSP tools"
  - "Next: lspGotoDefinition to locate definition"
emptyStatusHints:           # <-- CHECK THESE when no results
  - "Try broader terms"
  - "Remove filters one at a time"
errorStatusHints:           # <-- CHECK THESE on errors
  - "Check authentication token"
  - "Verify path exists"
```

**Always read the hints in the response** - they provide context-aware guidance for your research workflow.

---

## Tool Executions Reference

### 1. localSearchCode

Search code using ripgrep in local directories.

**When to use**: Find code patterns, get `lineHint` for LSP tools

**Input**:
```typescript
await localSearchCode({
  queries: [{
    // Required
    pattern: string,           // Regex pattern to search
    path: string,              // Directory to search in

    // Research context (recommended)
    researchGoal?: string,     // Goal of this search
    reasoning?: string,        // Why this approach

    // Options
    caseInsensitive?: boolean, // Case-insensitive search
    filesOnly?: boolean,       // Return only file paths
    include?: string[],        // Glob patterns to include ["*.ts"]
    exclude?: string[],        // Glob patterns to exclude ["*.test.ts"]
    contextLines?: number,     // Lines of context around matches
    maxFiles?: number,         // Limit number of files
    wholeWord?: boolean,       // Match whole words only
    fixedString?: boolean,     // Treat pattern as literal string
  }]
});
```

**Output**: File matches with line numbers (use as `lineHint` for LSP tools)
```yaml
results:
  - status: "hasResults"
    data:
      files:
        - path: "/project/src/service.ts"
          matches:
            - line: 42           # <-- Use this as lineHint!
              content: "export class MyService {"
              beforeContext: [...]
              afterContext: [...]
hasResultsStatusHints:
  - "OUTPUT: Use lineHint (line number) for all LSP tools"
  - "LSP? lspGotoDefinition to locate definition"
```

---

### 2. localGetFileContent

Read file content from local filesystem.

**When to use**: Read implementation details (LAST step in research flow)

**Input**:
```typescript
await localGetFileContent({
  queries: [{
    // Required
    path: string,              // Absolute file path

    // Choose ONE extraction method:
    matchString?: string,      // Search for this pattern
    matchStringContextLines?: number,  // Lines around match (default: 5)
    // OR
    startLine?: number,        // Start line (1-indexed)
    endLine?: number,          // End line
    // OR
    fullContent?: boolean,     // Read entire file (small files only)

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: File content with optional context
```yaml
results:
  - status: "hasResults"
    data:
      path: "/project/src/service.ts"
      content: "export class MyService {\n  constructor() {...}\n}"
      totalLines: 150
      extractedLines: { start: 40, end: 60 }
```

---

### 3. localFindFiles

Find files by name, type, or metadata.

**When to use**: Discover files before searching content

**Input**:
```typescript
await localFindFiles({
  queries: [{
    // Required
    path: string,              // Directory to search

    // Filters
    name?: string,             // Glob pattern for name ("*.ts")
    iname?: string,            // Case-insensitive name
    type?: "f" | "d",          // f=files, d=directories
    modifiedWithin?: string,   // Modified in timeframe ("7d", "1h")
    modifiedBefore?: string,   // Modified before date
    sizeGreater?: string,      // Size > ("1M", "100K")
    sizeLess?: string,         // Size <
    maxDepth?: number,         // Max directory depth

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: List of matching files with metadata
```yaml
results:
  - status: "hasResults"
    data:
      files:
        - path: "/project/src/auth/login.ts"
          size: 2048
          modified: "2024-01-15T10:30:00Z"
          type: "file"
```

---

### 4. localViewStructure

View directory tree structure.

**When to use**: First step - understand project layout

**Input**:
```typescript
await localViewStructure({
  queries: [{
    // Required
    path: string,              // Directory to explore

    // Options
    depth?: number,            // Max depth (default: 1)
    filesOnly?: boolean,       // Show only files
    directoriesOnly?: boolean, // Show only directories
    sortBy?: "name" | "size" | "time" | "extension",
    hidden?: boolean,          // Include hidden files

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: Directory tree
```yaml
results:
  - status: "hasResults"
    data:
      path: "/project/src"
      structuredOutput: |
        [DIR]  components/
        [DIR]  services/
        [FILE] index.ts (2.1 KB)
        [FILE] types.ts (856 B)
      totalFiles: 2
      totalDirectories: 2
hasResultsStatusHints:
  - "Next: localSearchCode(pattern) to find code and get lineHint"
  - "Drill deeper: depth=2 on specific subdirs"
```

---

### 5. lspGotoDefinition

Jump to symbol definition using LSP.

**When to use**: Find where a symbol is defined

**CRITICAL**: Requires `lineHint` from `localSearchCode` results!

**Input**:
```typescript
await lspGotoDefinition({
  queries: [{
    // Required
    uri: string,               // File URI ("file:///path/to/file.ts")
    symbolName: string,        // Symbol to find
    lineHint: number,          // Line number from search results!

    // Options
    contextLines?: number,     // Lines of context (default: 5)
    orderHint?: number,        // Which occurrence (0-indexed)

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: Definition location with code snippet
```yaml
results:
  - status: "hasResults"
    data:
      symbol: "MyService"
      definitionLocation:
        uri: "file:///project/src/services/myService.ts"
        range: { startLine: 10, endLine: 45 }
      codeSnippet: "export class MyService {\n  private db: Database;\n  ..."
      symbolKind: "class"
hasResultsStatusHints:
  - "Need callers? Use lspCallHierarchy(direction='incoming')"
  - "Need all usages? Use lspFindReferences"
emptyStatusHints:
  - "Verify lineHint from localSearchCode results"
  - "Check symbol name spelling"
```

---

### 6. lspFindReferences

Find all references to a symbol.

**When to use**: Find all usages of types, interfaces, variables, functions

**CRITICAL**: Requires `lineHint` from search results!

**Input**:
```typescript
await lspFindReferences({
  queries: [{
    // Required
    uri: string,               // File URI
    symbolName: string,        // Symbol to find
    lineHint: number,          // From search results!

    // Options
    includeDeclaration?: boolean,  // Include definition (default: true)
    contextLines?: number,     // Context lines (default: 2)
    referencesPerPage?: number, // Pagination (default: 20)
    page?: number,             // Page number

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: List of reference locations
```yaml
results:
  - status: "hasResults"
    data:
      symbol: "UserConfig"
      totalReferences: 15
      references:
        - uri: "file:///project/src/app.ts"
          line: 5
          column: 10
          context: "import { UserConfig } from './types';"
        - uri: "file:///project/src/config.ts"
          line: 20
          context: "const config: UserConfig = {...}"
      pagination: { page: 1, totalPages: 1 }
```

---

### 7. lspCallHierarchy

Trace function call relationships.

**When to use**: Find callers (incoming) or callees (outgoing) of a function

**CRITICAL**: Requires `lineHint`! Only works for functions/methods!

**Input**:
```typescript
await lspCallHierarchy({
  queries: [{
    // Required
    uri: string,               // File URI
    symbolName: string,        // Function name
    lineHint: number,          // From search results!
    direction: "incoming" | "outgoing",  // Call direction

    // Options
    depth?: number,            // Recursion depth (default: 1, max: 3)
    contextLines?: number,     // Context lines (default: 2)
    callsPerPage?: number,     // Pagination (default: 15)

    // Research context
    researchGoal?: string,
    reasoning?: string,
  }]
});
```

**Output**: Call hierarchy tree
```yaml
results:
  - status: "hasResults"
    data:
      symbol: "processRequest"
      direction: "incoming"
      calls:
        - name: "handleRoute"
          uri: "file:///project/src/router.ts"
          line: 45
          context: "await processRequest(req, res);"
        - name: "middleware"
          uri: "file:///project/src/middleware.ts"
          line: 12
hasResultsStatusHints:
  - "Chain: Follow calls with another lspCallHierarchy"
  - "Switch direction to see full flow"
emptyStatusHints:
  - "lspCallHierarchy only works on functions/methods"
  - "For types/variables, use lspFindReferences instead"
```

---

### 8. githubSearchCode

Search code across GitHub repositories.

**When to use**: External research, find patterns in open source

**Input**:
```typescript
await githubSearchCode({
  queries: [{
    // Required
    keywordsToSearch: string[],  // Keywords to search
    mainResearchGoal: string,    // Overall goal
    researchGoal: string,        // Specific goal
    reasoning: string,           // Why this approach

    // Filters (use sparingly - 1-2 max)
    owner?: string,              // Repository owner
    repo?: string,               // Repository name
    path?: string,               // Path prefix
    extension?: string,          // File extension
    filename?: string,           // Filename pattern
    match?: "file" | "path",     // Match content or paths

    // Pagination
    limit?: number,              // Results limit (default: 10)
    page?: number,               // Page number
  }]
});
```

**Output**: Code search results with text matches
```yaml
results:
  - status: "hasResults"
    data:
      totalCount: 45
      files:
        - path: "packages/react/src/ReactHooks.js"
          repository: "facebook/react"
          textMatches:
            - fragment: "export function useState(initialState) {"
              matchedLines: [15, 16]
          url: "https://github.com/facebook/react/blob/main/..."
hasResultsStatusHints:
  - "Use owner+repo for precision"
  - "Next: githubGetFileContent to read matched files"
emptyStatusHints:
  - "Start lean: single filter → verify → add filters"
  - "NEVER combine extension+filename+path"
```

---

### 9. githubGetFileContent

Read file content from GitHub repositories.

**When to use**: Read source code from GitHub repos

**Input**:
```typescript
await githubGetFileContent({
  queries: [{
    // Required
    owner: string,             // Repo owner ("facebook")
    repo: string,              // Repo name ("react")
    path: string,              // File path ("src/index.js")
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string,

    // Options
    branch?: string,           // Branch name (default: default branch)

    // Choose ONE extraction method:
    matchString?: string,      // Search for pattern
    matchStringContextLines?: number,  // Context lines (default: 5)
    // OR
    startLine?: number,        // Start line
    endLine?: number,          // End line
    // OR
    fullContent?: boolean,     // Full file (small files only!)
  }]
});
```

**Output**: File content
```yaml
results:
  - status: "hasResults"
    data:
      owner: "facebook"
      repo: "react"
      path: "packages/react/src/ReactHooks.js"
      content: "export function useState(initialState) {\n  ..."
      sha: "abc123..."
      url: "https://github.com/facebook/react/blob/main/..."
hasResultsStatusHints:
  - "Need more context? Expand matchStringContextLines"
  - "Trace imports? githubSearchCode with import path"
```

---

### 10. githubSearchRepositories

Find GitHub repositories.

**When to use**: Discover repos by topic, find popular projects

**Input**:
```typescript
await githubSearchRepositories({
  queries: [{
    // Required
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string,

    // Search options (use one or both)
    topicsToSearch?: string[], // Topics ["typescript", "cli"]
    keywordsToSearch?: string[], // Keywords in name/description

    // Filters
    owner?: string,            // Filter by owner
    stars?: string,            // Stars filter (">1000", "100..500")
    created?: string,          // Created date
    updated?: string,          // Updated date

    // Options
    match?: ("name" | "description" | "readme")[],
    sort?: "stars" | "forks" | "updated" | "best-match",
    limit?: number,
  }]
});
```

**Output**: Repository list
```yaml
results:
  - status: "hasResults"
    data:
      totalCount: 250
      repositories:
        - fullName: "expressjs/express"
          description: "Fast, unopinionated web framework"
          stars: 62000
          language: "JavaScript"
          topics: ["nodejs", "web", "framework"]
          pushedAt: "2024-01-15"
          url: "https://github.com/expressjs/express"
```

---

### 11. githubViewRepoStructure

Explore repository directory structure.

**When to use**: Understand project layout before searching

**Input**:
```typescript
await githubViewRepoStructure({
  queries: [{
    // Required
    owner: string,
    repo: string,
    branch: string,            // Branch name (NOT SHA!)
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string,

    // Options
    path?: string,             // Subdirectory (default: root "")
    depth?: number,            // Depth (1 or 2)
  }]
});
```

**Output**: Directory tree
```yaml
results:
  - status: "hasResults"
    data:
      owner: "expressjs"
      repo: "express"
      path: "lib"
      entries:
        - name: "application.js"
          type: "file"
          size: 15234
        - name: "router"
          type: "dir"
hasResultsStatusHints:
  - "Next: githubSearchCode to search in discovered dirs"
  - "Drill deeper: Set path to subdirectory"
```

---

### 12. githubSearchPullRequests

Search and analyze pull requests.

**When to use**: Code archaeology - understand WHY code was written

**Input**:
```typescript
await githubSearchPullRequests({
  queries: [{
    // Required
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string,

    // Search by PR number (ignores other filters)
    prNumber?: number,

    // OR search by filters
    owner?: string,
    repo?: string,
    query?: string,            // Search terms
    state?: "open" | "closed",
    merged?: boolean,
    author?: string,

    // Content options
    type?: "metadata" | "partialContent" | "fullContent",
    withComments?: boolean,    // Include review comments
    withCommits?: boolean,     // Include commit list

    // For partialContent type:
    partialContentMetadata?: [{
      file: string,            // File path to get diff
      additions?: number[],    // Specific added lines
      deletions?: number[],    // Specific deleted lines
    }],
  }]
});
```

**Output**: PR information
```yaml
results:
  - status: "hasResults"
    data:
      pullRequests:
        - number: 123
          title: "Add authentication middleware"
          state: "closed"
          merged: true
          author: "developer"
          body: "This PR adds JWT authentication..."
          changedFiles: 5
          additions: 250
          deletions: 30
          url: "https://github.com/org/repo/pull/123"
hasResultsStatusHints:
  - "Get file changes: type='partialContent' with partialContentMetadata"
  - "Understand decisions: withComments=true"
```

---

### 13. packageSearch

Search npm and PyPI packages.

**When to use**: Look up packages, get repo URL for source exploration

**Input**:
```typescript
await packageSearch({
  queries: [{
    // Required
    name: string,              // Package name
    ecosystem: "npm" | "python",
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string,

    // Options
    searchLimit?: number,      // Results (default: 1, use 5 for alternatives)
    npmFetchMetadata?: boolean,  // Fetch npm details
    pythonFetchMetadata?: boolean,  // Fetch PyPI details
  }]
});
```

**Output**: Package information with repository URL
```yaml
results:
  - status: "hasResults"
    data:
      packages:
        - name: "express"
          version: "4.18.2"
          description: "Fast web framework"
          repository:
            type: "git"
            url: "https://github.com/expressjs/express"  # <-- Use for source exploration
          homepage: "http://expressjs.com/"
          license: "MIT"
hasResultsStatusHints:
  - "Have repo URL? Use githubViewRepoStructure next"
  - "For alternatives: increase searchLimit"
```

---

## Research Workflow

Follow the **Funnel Method** - progressive narrowing:

```
1. DISCOVERY → 2. SEARCH → 3. LSP SEMANTIC → 4. READ
     ↓              ↓              ↓              ↓
  Structure     Pattern        Locate/       Implementation
  & Scope      Matching       Analyze        Details (LAST!)
```

### Example: "Where is authentication handled?"

```typescript
// Step 1: DISCOVERY - Understand structure
const structure = await localViewStructure({
  queries: [{ path: "/project/src", depth: 2 }]
});
// Check hints → "Next: localSearchCode to find code"

// Step 2: SEARCH - Find patterns, get lineHint
const search = await localSearchCode({
  queries: [{ pattern: "authenticate|auth", path: "/project/src" }]
});
// Results show: line 42 in /project/src/middleware/auth.ts
// Check hints → "Use lineHint for LSP tools"

// Step 3: LSP SEMANTIC - Go to definition
const definition = await lspGotoDefinition({
  queries: [{
    uri: "file:///project/src/middleware/auth.ts",
    symbolName: "authenticate",
    lineHint: 42  // From search results!
  }]
});
// Check hints → "Need callers? Use lspCallHierarchy"

// Step 4: READ - Only after locating (LAST step!)
const content = await localGetFileContent({
  queries: [{
    path: "/project/src/middleware/auth.ts",
    startLine: 40,
    endLine: 80
  }]
});
```

---

## Tool Selection Quick Reference

| Question | Tool Chain |
|----------|------------|
| "Where is X defined?" | `localSearchCode` → `lspGotoDefinition(lineHint)` |
| "Who calls function X?" | `localSearchCode` → `lspCallHierarchy(incoming, lineHint)` |
| "What does X call?" | `localSearchCode` → `lspCallHierarchy(outgoing, lineHint)` |
| "All usages of type/var X?" | `localSearchCode` → `lspFindReferences(lineHint)` |
| "Find files by name" | `localFindFiles` |
| "Project structure?" | `localViewStructure` |
| "External package info?" | `packageSearch` → `githubViewRepoStructure` → `githubSearchCode` |
| "Why was code written this way?" | `githubSearchPullRequests(merged=true)` |

---

## Critical Rules

1. **LSP tools REQUIRE `lineHint`** - Always call `localSearchCode` first!
2. **Read hints in every response** - They guide your next action
3. **Read file content LAST** - Use LSP for semantic understanding first
4. **GitHub: Use 1-2 filters max** - Never combine extension+filename+path
5. **lspCallHierarchy only works on functions** - Use lspFindReferences for types/variables

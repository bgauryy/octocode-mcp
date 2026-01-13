# Octocode Research Tool Guide

This guide provides detailed API documentation for all tools available in the octocode-research skill.

## Tool Summary Table

| Skill Export | MCP Tool Name | Internal Function | Purpose |
|--------------|---------------|-------------------|---------|
| `githubSearchCode` | `githubSearchCode` | `searchMultipleGitHubCode` | Search code on GitHub |
| `githubGetFileContent` | `githubGetFileContent` | `fetchMultipleGitHubFileContents` | Read GitHub files |
| `githubSearchRepositories` | `githubSearchRepositories` | `searchMultipleGitHubRepos` | Find GitHub repos |
| `githubViewRepoStructure` | `githubViewRepoStructure` | `exploreMultipleRepositoryStructures` | Explore repo structure |
| `githubSearchPullRequests` | `githubSearchPullRequests` | `searchMultipleGitHubPullRequests` | Search PR history |
| `localSearchCode` | `localSearchCode` | `executeRipgrepSearch` | Local ripgrep search |
| `localGetFileContent` | `localGetFileContent` | `executeFetchContent` | Read local files |
| `localFindFiles` | `localFindFiles` | `executeFindFiles` | Find files by metadata |
| `localViewStructure` | `localViewStructure` | `executeViewStructure` | View directory tree |
| `lspGotoDefinition` | `lspGotoDefinition` | `executeGotoDefinition` | Go to definition |
| `lspFindReferences` | `lspFindReferences` | `executeFindReferences` | Find all references |
| `lspCallHierarchy` | `lspCallHierarchy` | `executeCallHierarchy` | Trace call hierarchy |
| `packageSearch` | `packageSearch` | `searchPackages` | Search npm/PyPI |

## Query Structure

All tools accept a standard query structure:

```typescript
interface BaseQuery {
  mainResearchGoal: string;  // Overall research objective
  researchGoal: string;      // Specific goal for this query
  reasoning: string;         // Why this approach helps
}
```

## Response Format

All tools return `CallToolResult` from MCP SDK:

```typescript
interface CallToolResult {
  content: Array<{
    type: 'text';
    text: string;  // YAML-formatted response
  }>;
  isError: boolean;
}
```

## GitHub Tools

### githubSearchCode

Search code patterns across GitHub repositories.

```typescript
import { githubSearchCode } from 'octocode-research';

const result = await githubSearchCode({
  queries: [{
    mainResearchGoal: "Understand React hooks implementation",
    researchGoal: "Find useState implementation",
    reasoning: "Need to understand state management internals",
    keywordsToSearch: ["useState", "dispatcher"],
    owner: "facebook",
    repo: "react",
    match: "file",  // "file" for content, "path" for file names
    limit: 10,
    page: 1
  }]
});
```

### githubGetFileContent

Read file content from GitHub repositories.

```typescript
import { githubGetFileContent } from 'octocode-research';

const result = await githubGetFileContent({
  queries: [{
    mainResearchGoal: "Read React source",
    researchGoal: "Get hooks implementation",
    reasoning: "Understanding internal API",
    owner: "facebook",
    repo: "react",
    path: "packages/react/src/ReactHooks.js",
    branch: "main",
    // Choose ONE extraction method:
    matchString: "export function",  // Search for pattern
    matchStringContextLines: 20,
    // OR:
    // startLine: 1, endLine: 50  // Line range
    // OR:
    // fullContent: true  // Entire file (small files only)
  }]
});
```

### githubSearchRepositories

Find GitHub repositories by topic or keyword.

```typescript
import { githubSearchRepositories } from 'octocode-research';

const result = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: "Find TypeScript CLI tools",
    researchGoal: "Discover popular CLI frameworks",
    reasoning: "Research alternatives for our CLI",
    topicsToSearch: ["typescript", "cli"],
    stars: ">1000",
    sort: "stars",
    limit: 10
  }]
});
```

### githubViewRepoStructure

Explore repository directory structure.

```typescript
import { githubViewRepoStructure } from 'octocode-research';

const result = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: "Understand project layout",
    researchGoal: "View source directory structure",
    reasoning: "Need to locate implementation files",
    owner: "expressjs",
    repo: "express",
    branch: "master",
    path: "lib",
    depth: 2
  }]
});
```

### githubSearchPullRequests

Search and analyze pull request history.

```typescript
import { githubSearchPullRequests } from 'octocode-research';

const result = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: "Understand code change history",
    researchGoal: "Find PRs that modified auth",
    reasoning: "Understanding why code was written this way",
    owner: "expressjs",
    repo: "express",
    state: "closed",
    merged: true,
    query: "authentication",
    type: "metadata",  // "metadata", "partialContent", "fullContent"
    withComments: true
  }]
});
```

## Local Tools

### localSearchCode

Search code using ripgrep.

```typescript
import { localSearchCode } from 'octocode-research';

const result = await localSearchCode({
  queries: [{
    pattern: "export async function",
    path: "/path/to/project/src",
    researchGoal: "Find async exports",
    reasoning: "Locating API endpoints",
    // Options:
    caseInsensitive: true,
    filesOnly: true,  // Only return file paths
    include: ["*.ts", "*.tsx"],
    exclude: ["*.test.ts"],
    contextLines: 3,
    maxFiles: 100
  }]
});
```

### localGetFileContent

Read local file content.

```typescript
import { localGetFileContent } from 'octocode-research';

const result = await localGetFileContent({
  queries: [{
    path: "/path/to/project/src/index.ts",
    researchGoal: "Read main entry point",
    reasoning: "Understanding module exports",
    // Choose ONE extraction method:
    matchString: "export",
    matchStringContextLines: 10,
    // OR:
    // startLine: 1, endLine: 100
    // OR:
    // fullContent: true
  }]
});
```

### localFindFiles

Find files by name and metadata.

```typescript
import { localFindFiles } from 'octocode-research';

const result = await localFindFiles({
  queries: [{
    path: "/path/to/project",
    researchGoal: "Find test files",
    reasoning: "Locating test coverage",
    name: "*.test.ts",
    modifiedWithin: "7d",  // Modified in last 7 days
    type: "f"  // "f" for files, "d" for directories
  }]
});
```

### localViewStructure

View local directory structure.

```typescript
import { localViewStructure } from 'octocode-research';

const result = await localViewStructure({
  queries: [{
    path: "/path/to/project",
    researchGoal: "Understand project layout",
    reasoning: "Get overview of codebase",
    depth: 2,
    filesOnly: true,
    sortBy: "time"  // "name", "size", "time", "extension"
  }]
});
```

## LSP Tools

**Important**: LSP tools require `lineHint` from search results. Always search first!

### lspGotoDefinition

Jump to symbol definition.

```typescript
import { localSearchCode, lspGotoDefinition } from 'octocode-research';

// Step 1: Search to get lineHint
const search = await localSearchCode({
  queries: [{ pattern: "MyService", path: "/project/src" }]
});
// Extract lineHint from YAML result: 42

// Step 2: Go to definition
const result = await lspGotoDefinition({
  queries: [{
    uri: "file:///project/src/service.ts",
    symbolName: "MyService",
    lineHint: 42,  // REQUIRED from search
    researchGoal: "Find class definition",
    reasoning: "Need implementation details",
    contextLines: 5
  }]
});
```

### lspFindReferences

Find all references to a symbol.

```typescript
import { lspFindReferences } from 'octocode-research';

const result = await lspFindReferences({
  queries: [{
    uri: "file:///project/src/types.ts",
    symbolName: "UserConfig",
    lineHint: 15,  // From search results
    researchGoal: "Find all usages of UserConfig type",
    reasoning: "Understanding type usage patterns",
    includeDeclaration: true,
    contextLines: 2,
    referencesPerPage: 20
  }]
});
```

### lspCallHierarchy

Trace function call relationships.

```typescript
import { lspCallHierarchy } from 'octocode-research';

// Find incoming calls (who calls this function)
const incoming = await lspCallHierarchy({
  queries: [{
    uri: "file:///project/src/api.ts",
    symbolName: "processRequest",
    lineHint: 50,
    direction: "incoming",
    researchGoal: "Find callers of processRequest",
    reasoning: "Understanding entry points",
    depth: 1
  }]
});

// Find outgoing calls (what this function calls)
const outgoing = await lspCallHierarchy({
  queries: [{
    uri: "file:///project/src/api.ts",
    symbolName: "processRequest",
    lineHint: 50,
    direction: "outgoing",
    researchGoal: "Find functions called by processRequest",
    reasoning: "Understanding dependencies",
    depth: 1
  }]
});
```

## Package Tools

### packageSearch

Search npm and PyPI packages.

```typescript
import { packageSearch } from 'octocode-research';

// NPM package
const npmResult = await packageSearch({
  queries: [{
    name: "express",
    ecosystem: "npm",
    mainResearchGoal: "Research Express.js",
    researchGoal: "Get package repository URL",
    reasoning: "Need to explore source code",
    npmFetchMetadata: true
  }]
});

// Python package
const pyResult = await packageSearch({
  queries: [{
    name: "requests",
    ecosystem: "python",
    mainResearchGoal: "Research requests library",
    researchGoal: "Get package details",
    reasoning: "Evaluating HTTP clients",
    pythonFetchMetadata: true
  }]
});
```

## Error Handling

```typescript
import { githubSearchCode } from 'octocode-research';

const result = await githubSearchCode({
  queries: [{ /* ... */ }]
});

// Check for errors
if (result.isError) {
  console.error('Tool error:', result.content[0].text);
  return;
}

// Parse YAML response
const text = result.content[0].text;

// Check status in response
if (text.includes('status: "empty"')) {
  console.log('No results found');
} else if (text.includes('status: "error"')) {
  console.log('Query failed');
} else {
  console.log('Results:', text);
}
```

## Common Patterns

### Progressive Narrowing

```typescript
// 1. Start with structure
const structure = await localViewStructure({
  queries: [{ path: "/project", depth: 1 }]
});

// 2. Search for patterns
const search = await localSearchCode({
  queries: [{ pattern: "class.*Service", path: "/project/src" }]
});
// Extract lineHint: 42

// 3. Go to definition
const definition = await lspGotoDefinition({
  queries: [{
    uri: "file:///project/src/service.ts",
    symbolName: "UserService",
    lineHint: 42
  }]
});

// 4. Find all usages
const references = await lspFindReferences({
  queries: [{
    uri: "file:///project/src/service.ts",
    symbolName: "UserService",
    lineHint: 42
  }]
});

// 5. Read specific implementation (last step!)
const content = await localGetFileContent({
  queries: [{
    path: "/project/src/service.ts",
    matchString: "class UserService",
    matchStringContextLines: 50
  }]
});
```

### External Package Research

```typescript
// 1. Find package info
const pkg = await packageSearch({
  queries: [{ name: "lodash", ecosystem: "npm" }]
});
// Extract repo: lodash/lodash

// 2. Explore structure
const structure = await githubViewRepoStructure({
  queries: [{
    owner: "lodash",
    repo: "lodash",
    branch: "main",
    path: "",
    depth: 1
  }]
});

// 3. Search implementation
const code = await githubSearchCode({
  queries: [{
    keywordsToSearch: ["debounce"],
    owner: "lodash",
    repo: "lodash"
  }]
});

// 4. Read specific file
const content = await githubGetFileContent({
  queries: [{
    owner: "lodash",
    repo: "lodash",
    path: "debounce.js",
    fullContent: true
  }]
});
```

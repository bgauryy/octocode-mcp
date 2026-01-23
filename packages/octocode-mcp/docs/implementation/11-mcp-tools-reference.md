# MCP Tools Reference

Complete reference for all 13 MCP tools provided by octocode-mcp, including parameter specifications, usage patterns, and the dynamic hint system.

## Table of Contents

- [Overview](#overview)
- [Tool Categories](#tool-categories)
- [Hint System](#hint-system)
- [GitHub Tools](#github-tools)
- [Local Code Search Tools](#local-code-search-tools)
- [LSP Tools](#lsp-tools)
- [Common Patterns](#common-patterns)

## Overview

Octocode MCP provides 13 specialized tools for code exploration and analysis:

| Tool Name | Category | Max Queries | Purpose |
|-----------|----------|-------------|---------|
| `githubSearchCode` | GitHub | 3 | Search code across GitHub repositories |
| `githubGetFileContent` | GitHub | 3 | Fetch file content from GitHub |
| `githubViewRepoStructure` | GitHub | 3 | View repository directory structure |
| `githubSearchRepositories` | GitHub | 3 | Search for GitHub repositories |
| `githubSearchPullRequests` | GitHub | 3 | Search and analyze pull requests |
| `packageSearch` | GitHub | 3 | Search NPM and PyPI packages |
| `localSearchCode` | Local | 5 | Search local code with ripgrep |
| `localGetFileContent` | Local | 5 | Read local file content |
| `localViewStructure` | Local | 5 | Browse local directory structure |
| `localFindFiles` | Local | 5 | Find files by metadata |
| `lspGotoDefinition` | LSP | 5 | Navigate to symbol definitions |
| `lspFindReferences` | LSP | 5 | Find all symbol references |
| `lspCallHierarchy` | LSP | 3 | Analyze call hierarchy |

## Tool Categories

### GitHub/GitLab Tools

**Characteristics:**
- External API calls
- Rate-limited (5000/hour authenticated)
- Cached responses (1-2 hours TTL)
- Maximum 3 queries per invocation
- Require authentication (GITHUB_TOKEN or gh-cli)

**Tools:** githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchRepositories, githubSearchPullRequests, packageSearch

### Local Code Search Tools

**Characteristics:**
- Local filesystem operations
- No rate limits
- Fast execution (ripgrep, find, ls)
- Maximum 5 queries per invocation
- Subject to ALLOWED_PATHS security

**Tools:** localSearchCode, localGetFileContent, localViewStructure, localFindFiles

### LSP Tools

**Characteristics:**
- Semantic code analysis via Language Server Protocol
- Requires language servers installed
- Maximum 3-5 queries (operation-dependent)
- Graceful degradation to text fallback
- Local execution only

**Tools:** lspGotoDefinition, lspFindReferences, lspCallHierarchy

## Hint System

All tools return contextual hints to guide the next steps in research workflows.

### Hint Types

**hasResults:** Returned when query finds results
- Next step suggestions
- Performance optimization tips
- Alternative approaches

**empty:** Returned when query finds no results
- Troubleshooting suggestions
- Query refinement tips
- Alternative search strategies

**error:** Returned on errors
- Error recovery steps
- Workaround suggestions
- Alternative tools

### Hint Context

Hints are dynamic and context-aware, using:
- Number of results found
- File/match counts
- Search parameters used
- Error types encountered
- Performance characteristics

### Example Hints

**hasResults:**
```
"Found 15 matches across 5 files"
"Use localGetFileContent with matchString for targeted extraction"
"Results are paginated - use filesPerPage for next page"
"Consider parallelizing across multiple queries"
```

**empty:**
```
"Try broader terms or related concepts"
"Remove filters one at a time to find what blocks results"
"Try case-insensitive search: smartCase=true or caseInsensitive=true"
"Check path for typos or incorrect directory"
```

**error:**
```
"Rate limit exceeded - resets at 2024-01-01T00:00:00Z"
"Use local tools (localSearchCode) as alternative"
"File too large (>300KB) - use pagination with charOffset/charLength"
"Language server not found - install typescript-language-server"
```

## GitHub Tools

### githubSearchCode

Search code across GitHub repositories using keywords, file extensions, and path filters.

#### When to Use

- Finding code patterns across GitHub
- Discovering implementations of APIs/frameworks
- Researching how libraries are used
- Locating examples in open-source projects

#### When NOT to Use

- Local codebase search (use `localSearchCode`)
- Need full file content (use `githubGetFileContent` after)
- Rate limit concerns (use local tools)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `keywordsToSearch` | `string[]` | Yes | 1-5 items | Keywords to search for |
| `owner` | `string` | No | - | Repository owner/organization |
| `repo` | `string` | No | - | Repository name |
| `extension` | `string` | No | - | File extension (e.g., "ts") |
| `filename` | `string` | No | - | Filename pattern |
| `path` | `string` | No | - | Path prefix filter |
| `match` | `"file" \| "path"` | No | - | Search file content or paths |
| `limit` | `number` | No | 1-100, default 10 | Results per query |
| `page` | `number` | No | 1-10, default 1 | Page number |

#### Best Practices

**1. Use owner+repo for precision:**
```json
{
  "owner": "facebook",
  "repo": "react",
  "keywordsToSearch": ["useState"]
}
```

**2. Combine 1-2 filters maximum:**
```json
{
  "keywordsToSearch": ["AuthService"],
  "extension": "ts"
}
```

**3. Avoid filter overload:**
```json
// Bad: Too many filters (causes API errors)
{
  "extension": "ts",
  "filename": "service",
  "path": "src/auth"
}

// Good: Use 1-2 filters
{
  "extension": "ts",
  "path": "src"
}
```

#### Common Patterns

**Pattern 1: Broad discovery**
```json
{
  "keywordsToSearch": ["class UserService"],
  "match": "file",
  "limit": 10
}
```

**Pattern 2: Targeted search**
```json
{
  "owner": "expressjs",
  "repo": "express",
  "keywordsToSearch": ["middleware", "router"],
  "extension": "js",
  "limit": 20
}
```

**Pattern 3: Path-based search**
```json
{
  "keywordsToSearch": ["authenticate"],
  "path": "src/api",
  "match": "file"
}
```

#### Response Hints

**hasResults:**
- "Use githubGetFileContent to read matched files"
- "text_matches field contains highlighted context"
- "Use matchString parameter for targeted extraction"

**empty:**
- "Try synonyms: auth vs authentication, config vs configuration"
- "Remove filters to broaden search"
- "Check spelling of owner/repo/keywords"

---

### githubGetFileContent

Fetch file content from GitHub repositories with targeted extraction options.

#### When to Use

- Reading specific files after search
- Extracting function/class definitions
- Reviewing implementation details
- Getting file content with context

#### When NOT to Use

- Large files (>300KB) without pagination
- Local files (use `localGetFileContent`)
- Need directory listing (use `githubViewRepoStructure`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `owner` | `string` | Yes | 1-200 chars | Repository owner |
| `repo` | `string` | Yes | 1-150 chars | Repository name |
| `path` | `string` | Yes | - | File path in repository |
| `branch` | `string` | No | 1-255 chars | Branch name (defaults to default branch) |
| `fullContent` | `boolean` | No | default false | Return entire file |
| `startLine` | `number` | No | ≥1 | Start line (1-indexed) |
| `endLine` | `number` | No | ≥1 | End line (inclusive) |
| `matchString` | `string` | No | - | Search pattern for extraction |
| `matchStringContextLines` | `number` | No | 1-50, default 5 | Context lines around matches |
| `charOffset` | `number` | No | ≥0 | Character offset for pagination |
| `charLength` | `number` | No | 50-50000 | Characters to return |

#### Validation Rules

- `fullContent`, `startLine/endLine`, and `matchString` are **mutually exclusive**
- `startLine` and `endLine` must be used **together**
- `startLine` must be ≤ `endLine`

#### Extraction Strategies

**Strategy 1: Pattern-based (RECOMMENDED)**
```json
{
  "path": "src/services/AuthService.ts",
  "matchString": "export function",
  "matchStringContextLines": 10
}
```
✅ Token-efficient, targeted extraction

**Strategy 2: Line range**
```json
{
  "path": "src/utils.ts",
  "startLine": 50,
  "endLine": 100
}
```
✅ Precise extraction when line numbers known

**Strategy 3: Full content with pagination**
```json
{
  "path": "README.md",
  "fullContent": true,
  "charLength": 10000,
  "charOffset": 0
}
```
✅ Safe for large files with pagination

#### Response Hints

**hasResults:**
- "Content truncated - use charOffset={next} for next page"
- "Found 3 matches for pattern '{matchString}'"
- "File size: 45KB (under limit)"

**error:**
- "File too large (>300KB) - use charOffset/charLength pagination"
- "Branch 'develop' not found - try default branch or 'main'"

---

### githubViewRepoStructure

Display repository directory structure with configurable depth.

#### When to Use

- Understanding repository organization
- Discovering entry points and key files
- Exploring monorepo structure
- Finding package/module boundaries

#### When NOT to Use

- Need file contents (use `githubGetFileContent`)
- Local directories (use `localViewStructure`)
- Large directories without pagination

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `owner` | `string` | Yes | 1-200 chars | Repository owner |
| `repo` | `string` | Yes | 1-150 chars | Repository name |
| `branch` | `string` | Yes | 1-255 chars | Branch name |
| `path` | `string` | No | default "" | Directory path to view |
| `depth` | `number` | No | 1-2, default 1 | Recursion depth |
| `entriesPerPage` | `number` | No | 1-200, default 50 | Entries per page |
| `entryPageNumber` | `number` | No | ≥1, default 1 | Page number |

#### Exploration Workflow

**Phase 1: Root overview**
```json
{
  "path": "",
  "depth": 1,
  "entriesPerPage": 50
}
```

**Phase 2: Explore subdirectories**
```json
{
  "path": "packages",
  "depth": 2
}
```

**Phase 3: Deep dive**
```json
{
  "path": "packages/core/src",
  "depth": 2
}
```

#### Response Hints

**hasResults:**
- "Found {totalFiles} files, {totalFolders} folders"
- "Use depth=2 on subdirectories for deeper exploration"
- "Pagination available: entriesPerPage={50}, entryPageNumber={2}"

**large directories:**
- "Directory truncated at 200 entries - use pagination"
- "Filter by exploring specific subdirectories"

---

### githubSearchRepositories

Search GitHub repositories by keywords, topics, stars, and other criteria.

#### When to Use

- Discovering relevant projects
- Finding framework/library examples
- Research popular implementations
- Locating organization repositories

#### When NOT to Use

- Know exact repository (use githubViewRepoStructure directly)
- Need code search (use `githubSearchCode`)
- Local repository search

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `keywordsToSearch` | `string[]` | No* | - | Search keywords |
| `topicsToSearch` | `string[]` | No* | - | Topic filters |
| `owner` | `string` | No | - | Organization/user |
| `stars` | `string` | No | - | Star count (e.g., ">1000") |
| `size` | `string` | No | - | Repository size |
| `created` | `string` | No | - | Creation date |
| `updated` | `string` | No | - | Last update |
| `match` | `string[]` | No | - | Search scope (name/description/readme) |
| `sort` | `string` | No | - | Sort order (stars/forks/updated) |
| `limit` | `number` | No | 1-100, default 10 | Results per query |
| `page` | `number` | No | 1-10, default 1 | Page number |

*At least one of `keywordsToSearch` or `topicsToSearch` required

#### Search Strategies

**Strategy 1: Topic-based (RECOMMENDED)**
```json
{
  "topicsToSearch": ["typescript", "cli"],
  "stars": ">1000",
  "sort": "stars"
}
```
✅ High precision, less noise

**Strategy 2: Keyword-based**
```json
{
  "keywordsToSearch": ["authentication", "passport"],
  "stars": ">500"
}
```
✅ Broader results

**Strategy 3: Organization repos**
```json
{
  "owner": "vercel",
  "keywordsToSearch": ["framework"],
  "sort": "updated"
}
```
✅ Focused on specific org

#### Response Hints

**hasResults:**
- "Check pushedAt for recent code changes (vs updatedAt for metadata)"
- "Use githubViewRepoStructure to explore {repo}"
- "Topics: {topics} - refine search with these"

**empty:**
- "Try topics instead of keywords for better filtering"
- "Remove stars filter to see all results"
- "Try synonyms: auth/authentication, api/rest"

---

### githubSearchPullRequests

Search and analyze pull requests for code archaeology and historical context.

#### When to Use

- Understanding WHY code was written this way
- Finding PRs that introduced features
- Reviewing implementation discussions
- Tracing bug fixes

#### When NOT to Use

- Need current code (use `githubGetFileContent`)
- Local git history (use git tools)
- Large PR content without filtering

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `owner` | `string` | No | - | Repository owner |
| `repo` | `string` | No | - | Repository name |
| `prNumber` | `number` | No | >0 | Specific PR (ignores other filters) |
| `query` | `string` | No | - | Free-text search |
| `state` | `string` | No | open/closed | PR state |
| `merged` | `boolean` | No | - | Only merged PRs |
| `author` | `string` | No | - | PR author |
| `label` | `string\|string[]` | No | - | Label filters |
| `created` | `string` | No | - | Date range |
| `type` | `string` | No | metadata/fullContent/partialContent | Detail level |
| `withComments` | `boolean` | No | default false | Include comments |
| `withCommits` | `boolean` | No | default false | Include commits |
| `limit` | `number` | No | 1-10, default 5 | Results per query |

#### Workflow Patterns

**Pattern 1: Find PR by number (FAST)**
```json
{
  "prNumber": 123,
  "type": "metadata",
  "withComments": true
}
```

**Pattern 2: Search merged PRs**
```json
{
  "query": "authentication refactor",
  "state": "closed",
  "merged": true,
  "created": ">2024-01-01",
  "type": "metadata"
}
```

**Pattern 3: Deep analysis**
```json
{
  "prNumber": 456,
  "type": "partialContent",
  "partialContentMetadata": [
    { "file": "src/auth/service.ts" }
  ],
  "withComments": true
}
```

#### Response Types

| Type | Speed | Content | Use Case |
|------|-------|---------|----------|
| `metadata` | Fast | Basic info only | Initial discovery |
| `fullContent` | Slow | All files/diffs | Complete analysis |
| `partialContent` | Medium | Specific files | Targeted review |

#### Response Hints

**hasResults:**
- "Use type=partialContent to fetch specific files only"
- "PR #{number}: {title} by {author}"
- "Review comments contain implementation rationale"

**empty:**
- "Try broader date range: created>2023-01-01"
- "Remove filters to see all PRs"
- "Check repo/owner spelling"

---

### packageSearch

Search NPM and PyPI package registries to find package information and repository URLs.

#### When to Use

- Looking up package by name
- Finding repository URL for package
- Checking if package exists
- Getting version/deprecation info

#### When NOT to Use

- Already have repository URL
- Need code search (use `githubSearchCode`)
- Search across multiple packages (batch queries)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `name` | `string` | Yes | ≥1 char | Package name |
| `ecosystem` | `string` | Yes | npm/python | Package ecosystem |
| `searchLimit` | `number` | No | 1-10, default 1 | Max results |
| `npmFetchMetadata` | `boolean` | No | default false | Full NPM metadata |
| `pythonFetchMetadata` | `boolean` | No | default false | Full PyPI metadata |

#### Usage Patterns

**Pattern 1: Lookup by exact name**
```json
{
  "name": "axios",
  "ecosystem": "npm",
  "searchLimit": 1
}
```
✅ Fast, exact match

**Pattern 2: Compare alternatives**
```json
{
  "name": "lodash",
  "ecosystem": "npm",
  "searchLimit": 5
}
```
✅ See similar packages

**Pattern 3: Full metadata**
```json
{
  "name": "requests",
  "ecosystem": "python",
  "pythonFetchMetadata": true
}
```
✅ Complete package info

#### Response Format

```typescript
{
  packages: [{
    name: "axios",
    version: "1.6.0",
    description: "Promise based HTTP client",
    repository: {
      url: "https://github.com/axios/axios",
      owner: "axios",
      repo: "axios"
    },
    deprecated: false
  }]
}
```

#### Response Hints

**hasResults:**
- "Use owner={owner} repo={repo} in githubViewRepoStructure"
- "Package repository: {url}"
- "⚠️ DEPRECATED - consider alternatives"

**empty:**
- "Package not found - check spelling"
- "Try searching on npmjs.com or pypi.org directly"

---

## Local Code Search Tools

### localSearchCode

Fast pattern search across local files using ripgrep.

#### When to Use

- Searching local codebase
- Finding patterns with regex
- Discovery phase (files-only mode)
- Token-efficient content search

#### When NOT to Use

- GitHub repositories (use `githubSearchCode`)
- Need file metadata (use `localFindFiles`)
- Simple directory listing (use `localViewStructure`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `pattern` | `string` | Yes | ≥1 char | Search pattern |
| `path` | `string` | Yes | - | Root directory |
| `mode` | `string` | No | discovery/paginated/detailed | Workflow preset |
| `fixedString` | `boolean` | No | default false | Literal search (no regex) |
| `smartCase` | `boolean` | No | default true | Case-insensitive if lowercase |
| `type` | `string` | No | - | File type (ts/py/rust/etc) |
| `include` | `string[]` | No | - | Include globs |
| `filesOnly` | `boolean` | No | default false | List files only |
| `contextLines` | `number` | No | 0-50 | Context around matches |
| `matchesPerPage` | `number` | No | 1-100, default 10 | Matches per file |
| `filesPerPage` | `number` | No | 1-20, default 10 | Files per page |

#### Workflow Modes

**discovery:** Fast file discovery (25x faster)
- Sets: `filesOnly=true`, `smartCase=true`
- Use case: Initial exploration

**paginated:** Sensible defaults for content
- Sets: `filesPerPage=10`, `matchesPerPage=10`
- Use case: Balanced exploration

**detailed:** Full context
- Sets: `contextLines=3`, `matchesPerPage=20`
- Use case: Deep analysis

#### Search Strategies

**Strategy 1: Discovery → Read**
```json
// Phase 1: Find files
{
  "pattern": "AuthService",
  "path": "/project",
  "mode": "discovery",
  "type": "ts"
}

// Phase 2: Read specific files
{
  "pattern": "class AuthService",
  "path": "/project/src/auth.ts",
  "contextLines": 10
}
```

**Strategy 2: Regex patterns**
```json
{
  "pattern": "function\\s+\\w+Auth",
  "path": "/project/src",
  "type": "ts",
  "contextLines": 5
}
```

**Strategy 3: Fixed string (fastest)**
```json
{
  "pattern": "TODO: fix this",
  "path": "/project",
  "fixedString": true,
  "filesOnly": true
}
```

#### Performance Tips

1. **Use type filter:** `type="ts"` faster than `include=["*.ts"]`
2. **Consolidate globs:** `["*.{ts,tsx}"]` faster than `["*.ts", "*.tsx"]`
3. **Prefer filesOnly:** 25x faster for discovery
4. **Use smartCase:** Default behavior, no penalty

#### Response Hints

**hasResults:**
- "Found {matches} matches in {files} files"
- "Use localGetFileContent matchString for targeted extraction"
- "Parallelize queries for multiple patterns"

**empty:**
- "Try fixedString=true for literal match"
- "Remove type filter to search all files"
- "Check path for typos"

**error (size_limit):**
- "Too many results ({count} matches) - narrow pattern"
- "Add type or include filters"
- "Use filesOnly for discovery first"

---

### localGetFileContent

Read local file content with targeted extraction options.

#### When to Use

- Reading files after search
- Extracting specific patterns
- Line range extraction
- Paginated reading of large files

#### When NOT to Use

- GitHub files (use `githubGetFileContent`)
- Need file metadata (use `localFindFiles`)
- Directory listing (use `localViewStructure`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `path` | `string` | Yes | - | File path |
| `fullContent` | `boolean` | No | default false | Return entire file |
| `startLine` | `number` | No | ≥1 | Start line |
| `endLine` | `number` | No | ≥1 | End line |
| `matchString` | `string` | No | - | Search pattern |
| `matchStringContextLines` | `number` | No | 1-50, default 5 | Context lines |
| `matchStringIsRegex` | `boolean` | No | default false | Treat as regex |
| `matchStringCaseSensitive` | `boolean` | No | default false | Case-sensitive |
| `charOffset` | `number` | No | ≥0 | Character offset |
| `charLength` | `number` | No | 1-10000 | Characters to return |

#### Extraction Patterns

**Pattern 1: matchString (RECOMMENDED)**
```json
{
  "path": "/project/src/auth.ts",
  "matchString": "export function",
  "matchStringContextLines": 10
}
```
✅ Token-efficient, targeted

**Pattern 2: Line range**
```json
{
  "path": "/project/src/utils.ts",
  "startLine": 50,
  "endLine": 100
}
```
✅ Precise extraction

**Pattern 3: Pagination**
```json
{
  "path": "/project/README.md",
  "fullContent": true,
  "charLength": 5000,
  "charOffset": 0
}
```
✅ Safe for large files

#### Response Hints

**hasResults:**
- "Found {count} matches for pattern"
- "Use charOffset={next} for next page"
- "File size: {size} chars"

**error:**
- "File not found - check path"
- "Permission denied - check ALLOWED_PATHS"

---

### localViewStructure

Browse local directory structure with sorting and filtering.

#### When to Use

- Understanding project layout
- Finding specific file types
- Discovering entry points
- Exploring unfamiliar codebases

#### When NOT to Use

- GitHub repos (use `githubViewRepoStructure`)
- Need file contents (use `localGetFileContent`)
- Metadata-based search (use `localFindFiles`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `path` | `string` | Yes | - | Directory path |
| `depth` | `number` | No | 1-5 | Recursion depth |
| `sortBy` | `string` | No | name/size/time/extension, default time | Sort order |
| `filesOnly` | `boolean` | No | default false | Files only |
| `extension` | `string` | No | - | Filter by extension |
| `extensions` | `string[]` | No | - | Multiple extensions |
| `pattern` | `string` | No | - | Name filter (glob/substring) |
| `entriesPerPage` | `number` | No | 1-20, default 20 | Entries per page |
| `entryPageNumber` | `number` | No | ≥1, default 1 | Page number |
| `hidden` | `boolean` | No | default false | Include hidden files |

#### Exploration Workflow

**Phase 1: Root overview**
```json
{
  "path": "/project",
  "depth": 1,
  "entriesPerPage": 20
}
```

**Phase 2: Filter by type**
```json
{
  "path": "/project/src",
  "extensions": ["ts", "tsx"],
  "filesOnly": true,
  "sortBy": "time"
}
```

**Phase 3: Pattern matching**
```json
{
  "path": "/project",
  "pattern": "test*",
  "recursive": true
}
```

#### Response Hints

**hasResults:**
- "Found {files} files, {dirs} directories"
- "Total size: {size}"
- "Use depth=2 for deeper exploration"

---

### localFindFiles

Find files by name, time, size, and permissions.

#### When to Use

- Finding files by metadata
- Locating recent changes
- Finding large files
- Permission-based search

#### When NOT to Use

- Content search (use `localSearchCode`)
- Directory structure (use `localViewStructure`)
- GitHub files (use `githubSearchCode`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `path` | `string` | Yes | - | Starting directory |
| `name` | `string` | No | - | Name pattern (*.test.ts) |
| `iname` | `string` | No | - | Case-insensitive name |
| `type` | `string` | No | f/d/l | File type |
| `modifiedWithin` | `string` | No | - | Modified within (7d, 2h) |
| `modifiedBefore` | `string` | No | - | Modified before |
| `sizeGreater` | `string` | No | - | Size > (10M, 1G) |
| `sizeLess` | `string` | No | - | Size < |
| `maxDepth` | `number` | No | 1-10, default 5 | Max depth |
| `filesPerPage` | `number` | No | 1-20, default 20 | Files per page |

#### Search Patterns

**Pattern 1: Recent changes**
```json
{
  "path": "/project",
  "modifiedWithin": "7d",
  "type": "f",
  "name": "*.ts"
}
```

**Pattern 2: Large files**
```json
{
  "path": "/project/src",
  "sizeGreater": "1M",
  "type": "f"
}
```

**Pattern 3: Executable scripts**
```json
{
  "path": "/project/scripts",
  "executable": true,
  "type": "f"
}
```

#### Response Hints

**hasResults:**
- "Found {count} files"
- "Most recent: {modified}"
- "Total size: {size}"

---

## LSP Tools

### lspGotoDefinition

Navigate to symbol definitions using Language Server Protocol.

#### When to Use

- Finding where symbol is defined
- Understanding interfaces/types
- Jumping to implementation
- Exploring semantic relationships

#### When NOT to Use

- Language server not installed
- Finding usages (use `lspFindReferences`)
- Call analysis (use `lspCallHierarchy`)

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `uri` | `string` | Yes | - | File path or URI |
| `symbolName` | `string` | Yes | 1-255 chars | Symbol to find |
| `lineHint` | `number` | Yes | ≥1 | Line number hint |
| `orderHint` | `number` | No | ≥0, default 0 | Nth occurrence on line |
| `contextLines` | `number` | No | 0-20, default 5 | Context lines |

#### Usage Pattern

```json
{
  "uri": "/project/src/index.ts",
  "symbolName": "AuthService",
  "lineHint": 42,
  "contextLines": 10
}
```

#### Response Hints

**hasResults:**
- "Definition found in {file}"
- "Use lspFindReferences to see all usages"

**error:**
- "Language server not available - install typescript-language-server"
- "Symbol not found - check spelling"
- "Falling back to text search"

---

### lspFindReferences

Find all references to a symbol using LSP.

#### When to Use

- Finding all symbol usages
- Understanding impact of changes
- Tracing dependencies
- Refactoring preparation

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `uri` | `string` | Yes | - | File path |
| `symbolName` | `string` | Yes | 1-255 chars | Symbol to find |
| `lineHint` | `number` | Yes | ≥1 | Line hint |
| `includeDeclaration` | `boolean` | No | default true | Include definition |
| `contextLines` | `number` | No | 0-10, default 2 | Context lines |
| `referencesPerPage` | `number` | No | 1-50, default 20 | References per page |
| `page` | `number` | No | ≥1, default 1 | Page number |

#### Usage Pattern

```json
{
  "uri": "/project/src/services/AuthService.ts",
  "symbolName": "authenticate",
  "lineHint": 25,
  "referencesPerPage": 20
}
```

#### Response Hints

**hasResults:**
- "Found {count} references across {files} files"
- "Use page={next} for more results"

---

### lspCallHierarchy

Analyze call hierarchy (incoming/outgoing calls) for functions.

#### When to Use

- Understanding function dependencies
- Finding callers (incoming)
- Finding callees (outgoing)
- Impact analysis

#### Parameter Reference

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `uri` | `string` | Yes | - | File path |
| `symbolName` | `string` | Yes | 1-255 chars | Function name |
| `lineHint` | `number` | Yes | ≥1 | Line hint |
| `direction` | `string` | Yes | incoming/outgoing | Call direction |
| `depth` | `number` | No | 1-3, default 1 | Hierarchy depth |
| `contextLines` | `number` | No | 0-10, default 2 | Context lines |
| `callsPerPage` | `number` | No | 1-30, default 15 | Calls per page |

#### Direction Patterns

**Incoming: Who calls this function?**
```json
{
  "uri": "/project/src/services/auth.ts",
  "symbolName": "authenticate",
  "lineHint": 25,
  "direction": "incoming",
  "depth": 2
}
```

**Outgoing: What does this function call?**
```json
{
  "uri": "/project/src/services/auth.ts",
  "symbolName": "authenticate",
  "lineHint": 25,
  "direction": "outgoing",
  "depth": 1
}
```

#### Response Hints

**hasResults:**
- "Found {count} {direction} calls"
- "Depth {depth} - use depth={next} for deeper analysis"

---

## Common Patterns

### Discovery → Analysis Workflow

```json
// 1. Discover files (fast)
{
  "pattern": "AuthService",
  "path": "/project",
  "mode": "discovery"
}

// 2. Read specific file (targeted)
{
  "path": "/project/src/auth/AuthService.ts",
  "matchString": "class AuthService",
  "matchStringContextLines": 20
}

// 3. Understand relationships (semantic)
{
  "uri": "/project/src/auth/AuthService.ts",
  "symbolName": "authenticate",
  "lineHint": 42,
  "direction": "incoming"
}
```

### Multi-Source Research

```json
// Parallel queries across sources
{
  "queries": [
    // GitHub: Find examples
    {
      "owner": "facebook",
      "repo": "react",
      "keywordsToSearch": ["useAuth"]
    },
    // Local: Find our usage
    {
      "pattern": "useAuth",
      "path": "/project/src",
      "mode": "discovery"
    },
    // Package: Get library info
    {
      "name": "react",
      "ecosystem": "npm"
    }
  ]
}
```

### Token-Efficient Extraction

```json
// Instead of fullContent (expensive)
{
  "fullContent": true  // ❌ Returns entire file
}

// Use matchString (efficient)
{
  "matchString": "export function",  // ✅ Returns only matches
  "matchStringContextLines": 10
}
```

### Progressive Refinement

```json
// 1. Broad search
{
  "pattern": "auth",
  "filesOnly": true
}

// 2. Add filters
{
  "pattern": "auth",
  "type": "ts",
  "filesOnly": true
}

// 3. Narrow to directory
{
  "pattern": "authenticate",
  "path": "/project/src/services",
  "type": "ts",
  "contextLines": 5
}
```

### Error Recovery

```json
// If rate limit hit on GitHub
// Alternative 1: Use local tools
{
  "pattern": "same_pattern",
  "path": "/local/clone"
}

// Alternative 2: Wait and retry
// (Automatic with caching)

// Alternative 3: Use different tool
// githubSearchCode → localSearchCode
// githubGetFileContent → localGetFileContent
```

## Best Practices Summary

### Performance

1. Use `filesOnly` for discovery (25x faster)
2. Use `type` filter instead of globs
3. Use `matchString` instead of `fullContent`
4. Consolidate glob patterns: `*.{ts,tsx}`
5. Leverage workflow modes: `discovery`, `paginated`, `detailed`

### Token Efficiency

1. Prefer targeted extraction over full content
2. Use line ranges when lines known
3. Use `matchString` for pattern-based extraction
4. Paginate large results with `charOffset/charLength`
5. Limit context lines to what's needed

### Research Workflow

1. Start with discovery (files-only)
2. Narrow with filters progressively
3. Read specific files/sections
4. Use LSP for semantic understanding
5. Follow hints for next steps

### Error Handling

1. Follow hints for recovery
2. Use alternative tools on errors
3. Check ALLOWED_PATHS for local tools
4. Verify language servers for LSP
5. Enable DEBUG for troubleshooting

### Multi-Tool Strategies

1. GitHub search → Local read (after cloning)
2. Package search → Repo structure → Code search
3. Local search → LSP navigation → References
4. PR search → File content → Current code
5. Repo structure → Code search → File content

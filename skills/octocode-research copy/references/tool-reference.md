# Tool Reference

Complete parameter reference for Octocode MCP tools.

**Required Fields (ALL queries)**: `mainResearchGoal`, `researchGoal`, `reasoning`

---

## Local Tools

> **Priority**: ALWAYS prefer local tools over shell commands (`grep`, `ls`, `find`, `cat`)

### localViewStructure

Explore local directory structure with filtering and sorting.

```typescript
{
  path: string;                    // Directory path (required)
  depth?: number;                  // 1-5 (default 1)
  entriesPerPage?: number;         // ≤20
  entryPageNumber?: number;        // Pagination
  details?: boolean;               // Show file sizes
  hidden?: boolean;                // Include dotfiles
  extensions?: string[];           // Filter by extension
  pattern?: string;                // Filter by name pattern
  filesOnly?: boolean;
  directoriesOnly?: boolean;
  sortBy?: "name" | "size" | "time" | "extension";
}
```

**Tips:**
- Start `depth: 1` at root, drill with `depth: 2` on specific dirs
- Use `details: true` to see file sizes
- Check `packages/` or `apps/` for monorepos

### localSearchCode

Fast pattern search with discovery mode and pagination.

```typescript
{
  pattern: string;                 // Search pattern (required)
  path: string;                    // Search root (required)
  filesOnly?: boolean;             // Discovery mode - just list files
  type?: string;                   // "ts", "py", "js" etc
  include?: string[];              // Glob patterns to include
  exclude?: string[];              // Glob patterns to exclude
  excludeDir?: string[];           // Directories to skip
  noIgnore?: boolean;              // Search inside node_modules
  matchesPerPage?: number;         // 1-100
  filesPerPage?: number;           // ≤20
  filePageNumber?: number;         // Pagination
  contextLines?: number;           // Lines around match
  caseSensitive?: boolean;
  wholeWord?: boolean;
  multiline?: boolean;
}
```

**Tips:**
- Start with `filesOnly: true` for discovery (fast, token-efficient)
- Use `noIgnore: true` to search inside `node_modules`
- Use `type` for common file extensions
- Returns `location.charOffset/charLength` as BYTE offsets (ripgrep)

**node_modules Example:**
```typescript
{ pattern: "createContext", path: "node_modules/react", noIgnore: true }
```

### localGetFileContent

Read local file content with targeted extraction.

```typescript
{
  path: string;                    // File path (required)
  // Choose ONE strategy:
  matchString?: string;            // Pattern to find
  matchStringContextLines?: number; // 1-50 lines of context
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;
  charOffset?: number;             // BYTE offset for pagination
  charLength?: number;             // BYTES to read (1000-4000 recommended)
  startLine?: number;              // Line range
  endLine?: number;
  fullContent?: boolean;           // Small files only
}
```

**Tips:**
- Prefer `matchString` over `fullContent` for token efficiency
- `charOffset`/`charLength` are BYTES, not characters
- Use `charLength: 2000-4000` for pagination windows
- Large files require `charLength` or `matchString`

### localFindFiles

Find files by metadata (name, time, size, permissions).

```typescript
{
  path: string;                    // Search root (required)
  name?: string;                   // "*.ts" pattern
  iname?: string;                  // Case-insensitive name
  names?: string[];                // Multiple patterns
  type?: "f" | "d" | "l";          // file/directory/link
  modifiedWithin?: string;         // "7d", "2h", "30m"
  modifiedBefore?: string;
  sizeGreater?: string;            // "10M", "1K"
  sizeLess?: string;
  excludeDir?: string[];
  maxDepth?: number;               // 1-10
  filesPerPage?: number;           // ≤20
  filePageNumber?: number;
}
```

**Tips:**
- Results sorted by modified time (most recent first)
- Use `modifiedWithin: "7d"` to find recent changes
- Combine with `localGetFileContent` for content

---

## GitHub Tools

### packageSearch

Find package repo location from npm/PyPI.

```typescript
{
  name: string;                    // Package name (required)
  ecosystem: "npm" | "python";     // Registry (required)
  searchLimit?: number;            // 1-10 (npm only)
  npmFetchMetadata?: boolean;      // Get full npm metadata
  pythonFetchMetadata?: boolean;   // Get full PyPI metadata
}
```

**Tips:**
- Use `searchLimit: 1` if package name is known
- Python always returns 1 result (PyPI limitation)
- Follow with `githubViewRepoStructure` to explore the repo

### githubSearchRepositories

Discover repos by topics, keywords, stars.

```typescript
{
  keywordsToSearch?: string[];     // Search terms
  topicsToSearch?: string[];       // GitHub topics
  owner?: string;                  // Org/user filter
  stars?: string;                  // ">1000", "100..500"
  updated?: string;                // ">2024-01-01"
  sort?: "stars" | "forks" | "updated" | "best-match";
  limit?: number;                  // 1-100
  page?: number;
}
```

**Tips:**
- Use `stars: ">1000"` to filter noise in public repos
- Check `pushedAt` (last code change) > `updatedAt` (meta change)
- Archived repositories excluded automatically

### githubViewRepoStructure

Map repository directory layout.

```typescript
{
  owner: string;                   // Repo owner (required)
  repo: string;                    // Repo name (required)
  branch: string;                  // Branch (required)
  path?: string;                   // Subpath (default "")
  depth?: 1 | 2;                   // Recursion depth
  entriesPerPage?: number;         // ≤200
  entryPageNumber?: number;
}
```

**Tips:**
- Start `depth: 1` at root, drill with `depth: 2` on subdirs
- `depth: 2` is slow on large dirs - use on specific subdirectories
- Check `packages/` or `apps/` individually for monorepos
- Auto-filters 85+ directories (.git, node_modules, dist, build, etc.)

### githubSearchCode

Find code patterns across GitHub.

```typescript
{
  keywordsToSearch: string[];      // Search terms (required)
  match: "file" | "path";          // Content vs paths (required)
  owner?: string;                  // Narrow to org
  repo?: string;                   // Narrow to repo
  path?: string;                   // Directory filter (strict prefix)
  extension?: string;              // File type
  filename?: string;
  limit?: number;                  // 1-100
  page?: number;
}
```

**WARNING:** NEVER cite search results directly. Search snippets are incomplete. ALWAYS follow up with `githubGetFileContent` to verify.

**Tips:**
- `match: "path"` for finding files by name
- `match: "file"` for searching content
- Prefer specifying `owner` & `repo` for precision and cost
- Start with 1-2 filters; 3+ filters risky (may return empty)
- Path matching is strict prefix: `path: "pkg"` finds `pkg/file`, NOT `parent/pkg/file`

### githubGetFileContent

Read file content with targeted extraction.

```typescript
{
  owner: string;                   // (required)
  repo: string;                    // (required)
  path: string;                    // (required)
  branch?: string;
  // Choose ONE strategy:
  startLine?: number;              // Line range
  endLine?: number;
  matchString?: string;            // Pattern match
  matchStringContextLines?: number; // 1-50
  charOffset?: number;             // Byte offset
  charLength?: number;             // Bytes to read
  fullContent?: boolean;           // Small files only
}
```

**Tips:**
- Prefer `matchString` over `fullContent` for token efficiency
- Max file size: 300KB
- For pagination, use branch NAME (e.g., "main"), not commit SHA

### githubSearchPullRequests

Find PR history, metadata, diffs, and discussions.

```typescript
{
  owner?: string;
  repo?: string;
  prNumber?: number;               // Ignores all other filters
  query?: string;                  // Search text
  state?: "open" | "closed";
  merged?: boolean;
  author?: string;
  type?: "metadata" | "fullContent" | "partialContent";
  partialContentMetadata?: Array<{
    file: string;
    additions?: number[];
    deletions?: number[];
  }>;
  withComments?: boolean;
  withCommits?: boolean;
  limit?: number;                  // 1-10
}
```

**Tips:**
- Start with `type: "metadata"` (token-efficient)
- `prNumber` ignores all other filters
- Use `type: "partialContent"` for specific file diffs
- Avoid `type: "fullContent"` on large PRs

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| Empty results | Try semantic variants (auth → login, security, credentials) |
| Too many results | Add filters (path, extension, owner/repo, type) |
| File too large | Use `matchString` or `charLength` pagination |
| Path is directory | Use structure tool instead |
| Rate limit | Wait, try different tool |
| Local not found | Check path exists, try `hidden: true`, verify .gitignore |

## Query Batching

- GitHub tools: Max 3 queries per call
- Local tools: Max 5 queries per call
- Use parallel queries for independent searches

```typescript
{
  "queries": [
    { "pattern": "AuthService", "path": "src", "filesOnly": true },
    { "pattern": "authMiddleware", "path": "src", "filesOnly": true },
    { "pattern": "AuthUser", "path": "src", "filesOnly": true }
  ]
}
```

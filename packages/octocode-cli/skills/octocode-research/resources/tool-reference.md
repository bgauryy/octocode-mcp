# Tool Reference

Complete parameter reference for Octocode MCP tools.

---

## GitHub Tools

### packageSearch

Find package repo location from npm/PyPI.

```typescript
{
  name: string;                    // Package name
  ecosystem: "npm" | "python";     // Registry
  searchLimit?: number;            // 1-10 (npm only)
}
```

### githubSearchRepositories

Discover repos by topics, keywords, stars.

```typescript
{
  keywordsToSearch?: string[];     // Search terms
  topicsToSearch?: string[];       // GitHub topics
  owner?: string;                  // Org/user filter
  stars?: string;                  // ">1000", "100..500"
  sort?: "stars" | "forks" | "updated" | "best-match";
  limit?: number;                  // 1-10
}
```

**Tips:** Use `stars: ">1000"` to filter noise. Check `pushedAt` > `updatedAt`.

### githubViewRepoStructure

Map repository directory layout.

```typescript
{
  owner: string;                   // Repo owner
  repo: string;                    // Repo name
  branch: string;                  // Branch
  path?: string;                   // Subpath (default "/")
  depth?: 1 | 2;                   // Recursion depth
}
```

**Tips:** Start `depth: 1` at root, drill with `depth: 2`. Check `packages/` for monorepos.

### githubSearchCode

Find code patterns across GitHub.

```typescript
{
  keywordsToSearch: string[];      // Search terms
  match: "file" | "path";          // Content vs paths
  owner?: string;                  // Narrow to org
  repo?: string;                   // Narrow to repo
  path?: string;                   // Directory filter
  extension?: string;              // File type
  limit?: number;                  // 1-10
}
```

**WARNING:** NEVER cite search results directly. Search snippets are incomplete and often misleading. ALWAYS follow up with `githubGetFileContent` to verify.

**Tips:** `match: "path"` for files, `match: "file"` for content.

### githubGetFileContent

Read file content with targeted extraction.

```typescript
{
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  // Choose ONE strategy:
  startLine?: number;              // Line range
  endLine?: number;
  matchString?: string;            // Pattern match
  matchStringContextLines?: number; // 1-50
  fullContent?: boolean;           // Small files only
}
```

**Tips:** Prefer `matchString` over `fullContent`. Max 300KB.

### githubSearchPullRequests

Find PR history and discussions.

```typescript
{
  owner?: string;
  repo?: string;
  query?: string;                  // Search text
  state?: "open" | "closed";
  merged?: boolean;
  type?: "metadata" | "fullContent" | "partialContent";
  limit?: number;                  // 1-10
}
```

**Tips:** Start with `type: "metadata"`. `prNumber` ignores other filters.

---

## Local Tools

### local_view_structure

Explore local directory structure.

```typescript
{
  path: string;                    // Directory path
  depth?: number;                  // 1-5
  extensions?: string[];           // Filter types
  filesOnly?: boolean;
  hidden?: boolean;                // Include dotfiles
}
```

### local_ripgrep

Fast pattern search in local codebase.

```typescript
{
  pattern: string;                 // Search pattern
  path: string;                    // Search root
  filesOnly?: boolean;             // Discovery mode
  type?: string;                   // "ts", "py"
  excludeDir?: string[];           // Exclude dirs
  matchesPerPage?: number;         // 1-100
}
```

**Tips:** Start with `filesOnly: true` for discovery.

### local_fetch_content

Read local file content.

```typescript
{
  path: string;
  // Choose ONE:
  matchString?: string;            // Pattern
  matchStringContextLines?: number; // 1-50
  charOffset?: number;             // Byte offset
  charLength?: number;             // Bytes to read
  fullContent?: boolean;           // Small files
}
```

**Note:** `charOffset`/`charLength` are BYTES, not characters.

### local_find_files

Find files by metadata.

```typescript
{
  path: string;
  name?: string;                   // "*.ts"
  iname?: string;                  // Case-insensitive
  modifiedWithin?: string;         // "7d", "2h"
  sizeGreater?: string;            // "10M"
  type?: "f" | "d";                // file/directory
}
```

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| Empty results | Try semantic variants |
| Too many results | Add filters (path, owner, type) |
| File too large | Use matchString or line range |
| Path is directory | Use view structure tool |

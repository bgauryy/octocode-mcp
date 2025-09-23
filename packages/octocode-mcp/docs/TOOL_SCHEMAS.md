# Octocode-MCP Tools Summary

## Overview

Octocode-MCP provides 7 specialized tools for GitHub repository analysis and package discovery. Each tool supports bulk operations, progressive refinement strategies, and research-goal-driven hint generation.

## Tools Reference

### 1. GitHub Code Search (`mcp_octocode_githubSearchCode`)

**Description:** Search code across GitHub repositories with strategic query planning and progressive refinement.

**Key Features:**
- Semantic and technical code search
- Bulk queries (1-10 per request) for comprehensive research
- Progressive refinement: broad discovery → targeted search
- Content processing pipeline with sanitization and minification

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                    // Optional query identifier
      reasoning?: string,             // Optional reasoning for research
      verbose?: boolean,              // Per-query debug info

      queryTerms: string[],           // 1-5 search terms (AND logic)
      owner?: string | string[],      // Repository owner(s)
      repo?: string | string[],       // Repository name(s)
      language?: string,              // Programming language filter
      extension?: string,             // File extension filter
      filename?: string,              // Target filename
      path?: string,                  // File path prefix
      stars?: number | string,        // Stars filter: 10, ">=10", "5..50", etc.
      match?: "file" | "path" | Array<"file" | "path">, // Search scope
      limit?: number,                 // Results limit (1-20)
      minify?: boolean,               // Minify content (default: true)
      sanitize?: boolean              // Sanitize content (default: true)
    }
  ],
  verbose?: boolean                   // Global debug info
}
```

**Response Structure:**
- Repository context and file matches
- Text matches with code snippets
- Total count and pagination info
- Research-driven hints for next steps

---

### 2. GitHub File Content Fetch (`mcp_octocode_githubGetFileContent`)

**Description:** Fetch file contents from GitHub repositories with intelligent context extraction and partial access capabilities.

**Key Features:**
- Complete or partial file retrieval
- Smart context extraction with `matchString`
- Content optimization and minification
- Beta: Automatic code explanation via MCP sampling

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                       // Optional query identifier
      reasoning?: string,                // Optional reasoning for research
      verbose?: boolean,                 // Per-query debug info

      owner: string,                     // Repository owner
      repo: string,                      // Repository name
      filePath: string,                  // Exact path from repo root
      branch?: string,                   // Branch/tag/commit SHA

      // Retrieval controls
      fullContent?: boolean,             // Return entire file (default: false)
      startLine?: number,                // Start line (1-based)
      endLine?: number,                  // End line (1-based)
      matchString?: string,              // Pattern to locate; returns with context
      matchStringContextLines?: number,  // Context lines around match (0-50, default: 5)

      // Content processing
      minified?: boolean,                // Minify content (default: true)
      sanitize?: boolean                 // Sanitize content (default: true)
    }
  ],
  verbose?: boolean                      // Global debug info
}
```

**Response Structure:**
- File content with metadata
- Line boundaries and minification info
- Security warnings if applicable
- Optional code explanation (beta feature)

---

### 3. GitHub Repository Search (`mcp_octocode_githubSearchRepositories`)

**Description:** Search and discover GitHub repositories with smart filtering and bulk operations.

**Key Features:**
- Topic-based and query-term-based search
- Quality filters (stars, activity, maintenance)
- Bulk queries for comprehensive discovery
- Repository metadata and statistics

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                    // Optional query identifier
      reasoning?: string,             // Optional reasoning for research
      verbose?: boolean,              // Per-query debug info

      queryTerms?: string[],          // Search terms for name/desc/readme
      owner?: string | string[] | null,
      topics?: string | string[] | null,
      language?: string | null,
      stars?: number | string | null, // e.g., ">=100", "50..500"
      size?: string | null,           // Size filter string
      created?: string,               // YYYY-MM-DD, ranges supported
      updated?: string,               // YYYY-MM-DD, ranges supported
      match?: "name" | "description" | "readme" | Array<"name"|"description"|"readme"> | null,
      sort?: "forks" | "help-wanted-issues" | "stars" | "updated" | "best-match" | null,
      limit?: number | null           // Max results (1-20)
    }
  ],
  verbose?: boolean                   // Global debug info
}
```

**Response Structure:**
- Repository metadata and statistics
- Owner information and topics
- Activity metrics and quality indicators

---

### 4. GitHub Repository Structure View (`mcp_octocode_githubViewRepoStructure`)

**Description:** Explore GitHub repository structure with intelligent navigation and smart filtering.

**Key Features:**
- Comprehensive directory exploration
- Smart file filtering (excludes noise by default)
- Bulk repository analysis
- Access validation and error recovery

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                 // Optional query identifier
      reasoning?: string,          // Optional reasoning for research
      verbose?: boolean,           // Per-query debug info

      owner: string,               // Repository owner
      repo: string,                // Repository name
      branch: string,              // Branch/tag/commit SHA
      path?: string,               // Directory path (default: "")
      depth?: number,              // 1-2 (default: 1)
      includeIgnored?: boolean,    // Include ignored files (default: false)
      showMedia?: boolean          // Include media files (default: false)
    }
  ],
  verbose?: boolean               // Global debug info
}
```

**Response Structure:**
- File and directory structure
- File metadata (size, type, URLs)
- Summary statistics and folder organization

---

### 5. GitHub Pull Request Search (`mcp_octocode_githubSearchPullRequests`)

**Description:** Search GitHub pull requests with intelligent filtering and comprehensive analysis.

**Key Features:**
- Direct PR fetching by number
- Comprehensive filtering (state, author, labels, etc.)
- Review status and CI check filters
- Optional file changes and comments

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                       // Optional query identifier
      reasoning?: string,                // Optional reasoning for research
      verbose?: boolean,                 // Per-query debug info

      // Direct fetching or general search
      query?: string,                    // Search query for PR content
      owner?: string | string[],         // Repository owner(s)
      repo?: string | string[],          // Repository name(s)
      prNumber?: number,                 // Specific PR number (with owner/repo)

      // Filters
      state?: "open" | "closed",
      assignee?: string,
      author?: string,
      commenter?: string,
      involves?: string,
      mentions?: string,
      "review-requested"?: string,
      "reviewed-by"?: string,
      "team-mentions"?: string,
      label?: string | string[],
      "no-label"?: boolean,
      milestone?: string,
      "no-milestone"?: boolean,
      project?: string,
      "no-project"?: boolean,
      "no-assignee"?: boolean,
      head?: string,
      base?: string,
      created?: string,                  // Date/range
      updated?: string,                  // Date/range
      closed?: string,                   // Date/range
      "merged-at"?: string,             // Date/range
      comments?: number | string,        // 10, ">=10", "5..20"
      reactions?: number | string,       // 10, ">=10", "5..20"
      interactions?: number | string,    // 10, ">=10", "5..20"
      merged?: boolean,
      draft?: boolean,
      locked?: boolean,
      review?: "none" | "required" | "approved" | "changes_requested",
      checks?: "pending" | "success" | "failure",
      language?: string,
      visibility?: "public" | "private" | "internal" | Array<"public" | "private" | "internal">,
      app?: string,
      match?: Array<"title" | "body" | "comments">,

      // Sorting and limits
      sort?:
        | "comments"
        | "reactions"
        | "reactions-+1"
        | "reactions--1"
        | "reactions-smile"
        | "reactions-thinking_face"
        | "reactions-heart"
        | "reactions-tada"
        | "interactions"
        | "created"
        | "updated"
        | "best-match",
      order?: "asc" | "desc",
      limit?: number,                    // 1-100 (default: 30)

      // Expensive data
      withComments?: boolean,            // Include comments (default: false)
      getFileChanges?: boolean           // Include file changes/diffs (default: false)
    }
  ],
  verbose?: boolean                      // Global debug info
}
```

**Response Structure:**
- PR metadata and status information
- Author, assignee, and reviewer details
- Labels, milestones, and project associations
- Optional: comments and file changes

---

### 6. GitHub Commit Search (`mcp_octocode_githubSearchCommits`)

**Description:** Search GitHub commits with intelligent filtering and comprehensive analysis.

**Key Features:**
- Flexible search terms (AND/OR logic)
- Author and committer filtering
- Date range and repository filtering
- Optional commit changes/diffs

**Schema Parameters:**
```typescript
{
  queries: [
    {
      id?: string,                    // Optional query identifier
      reasoning?: string,             // Optional reasoning for research
      verbose?: boolean,              // Per-query debug info

      queryTerms?: string[],          // Search terms (AND logic)
      orTerms?: string[],             // Search terms (OR logic)
      owner?: string,                 // Repository owner
      repo?: string,                  // Repository name

      author?: string,
      'author-name'?: string,
      'author-email'?: string,
      committer?: string,
      'committer-name'?: string,
      'committer-email'?: string,

      'author-date'?: string,         // Date/range
      'committer-date'?: string,      // Date/range

      hash?: string,                  // Commit SHA (full or partial)
      parent?: string,                // Parent commit SHA
      tree?: string,                  // Tree SHA
      merge?: boolean,                // Only merge commits if true; exclude if false
      visibility?: 'public' | 'private' | 'internal',

      limit?: number,                 // 1-50 (default: 25)
      getChangesContent?: boolean,    // Include diffs (default: false)
      sort?: 'author-date' | 'committer-date',
      order?: 'asc' | 'desc'
    }
  ],
  verbose?: boolean                   // Global debug info
}
```

**Response Structure:**
- Commit metadata and SHA information
- Author and committer details
- Commit message and verification status
- Optional: file changes and statistics

---


---

## Common Schema Elements

### Base Query Schema
All tools extend the base query schema:
```typescript
{
  id?: string,                       // Optional query identifier
}
```

### Bulk Operations
All tools support bulk operations with:
- Progressive refinement strategies
- Parallel query execution  
- Intelligent error recovery
- Research-driven hint generation
- Configurable verbosity levels

### Response Format
All tools return standardized responses with:
- `data`: Main result data
- `meta`: Operation metadata  
- `hints`: Research guidance and next steps
- `isError`: Error status indicator

## Best Practices

1. **Progressive Refinement**: Start with broad queries, then narrow based on results
2. **Bulk Operations**: Use multiple queries per request for comprehensive analysis
3. **Research Goals**: Specify research context for better LLM integration
4. **Content Optimization**: Leverage minification for token efficiency
5. **Error Recovery**: Follow hint suggestions for failed queries
6. **Tool Chaining**: Combine tools strategically (repo search → structure → code search → content fetch)
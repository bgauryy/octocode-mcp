# Octocode-MCP Tools Summary

## Overview

Octocode-MCP provides 7 specialized tools for GitHub repository analysis and package discovery. Each tool supports bulk operations, progressive refinement strategies, and research-goal-driven hint generation.

## Tools Reference

### 1. GitHub Code Search (`mcp_octocode_githubSearchCode`)

**Description:** Search code across GitHub repositories with strategic query planning and progressive refinement.

**Key Features:**
- Semantic and technical code search
- Bulk queries (1-5 per request) for comprehensive research
- Progressive refinement: broad discovery → targeted search
- Content processing pipeline with sanitization and minification

**Schema Parameters:**
```typescript
{
  queries: [
    {
      queryTerms: string[],           // 1-4 search terms (AND logic)
      owner?: string | string[],      // Repository owner(s)
      repo?: string | string[],       // Repository name(s)
      language?: string,              // Programming language filter
      extension?: string,             // File extension filter
      filename?: string,              // Target filename pattern
      path?: string,                  // File path pattern
      size?: string,                  // File size filter (e.g., ">50")
      stars?: number | string,        // Minimum stars filter
      pushed?: string,                // Last push date filter
      created?: string,               // Creation date filter
      match?: "file" | "path"[],      // Search scope
      sort?: "best-match" | "indexed", // Sort method
      order?: "asc" | "desc",         // Sort order
      limit?: number,                 // Results limit (1-20)
      researchGoal?: ResearchGoal     // Research context
    }
  ],
  verbose?: boolean
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
      owner: string,                    // Repository owner
      repo: string,                     // Repository name
      filePath: string,                 // File path from root
      branch?: string,                  // Branch/tag/commit SHA
      startLine?: number,               // Start line for partial access
      endLine?: number,                 // End line for partial access
      matchString?: string,             // Exact string to find
      matchStringContextLines?: number, // Context lines around match
      minified?: boolean,               // Content optimization
      researchGoal?: ResearchGoal
    }
  ],
  verbose?: boolean
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
      queryTerms?: string[],           // Search terms for names/descriptions
      owner?: string | string[],       // Repository owner(s)
      topic?: string | string[],       // Topics/technologies
      language?: string,               // Programming language
      license?: string | string[],     // License filter
      stars?: number | string,         // Star count filter
      size?: string,                   // Repository size filter
      created?: string,                // Creation date filter
      updated?: string,                // Last update filter
      followers?: number | string,     // Owner followers count
      'good-first-issues'?: number,    // Good first issues count
      'help-wanted-issues'?: number,   // Help wanted issues count
      visibility?: "public" | "private" | "internal",
      sort?: "forks" | "stars" | "updated" | "best-match",
      order?: "asc" | "desc",
      limit?: number,                  // Results limit (1-100)
      researchGoal?: ResearchGoal
    }
  ],
  verbose?: boolean
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
      owner: string,                   // Repository owner
      repo: string,                    // Repository name
      branch: string,                  // Branch/tag/commit SHA
      path?: string,                   // Directory path (default: root)
      depth?: number,                  // Directory depth (1-2)
      includeIgnored?: boolean,        // Include config/hidden files
      showMedia?: boolean,             // Include media files
      researchGoal?: ResearchGoal
    }
  ],
  verbose?: boolean
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
      query?: string,                  // Search query text
      owner?: string | string[],       // Repository owner(s)
      repo?: string | string[],        // Repository name(s)
      prNumber?: number,               // Specific PR number
      state?: "open" | "closed",       // PR state
      assignee?: string,               // Assignee username
      author?: string,                 // Author username
      label?: string | string[],       // Labels filter
      milestone?: string,              // Milestone title
      review?: "none" | "required" | "approved" | "changes_requested",
      checks?: "pending" | "success" | "failure",
      created?: string,                // Creation date filter
      updated?: string,                // Update date filter
      merged?: boolean,                // Merged state
      draft?: boolean,                 // Draft state
      sort?: "comments" | "reactions" | "created" | "updated",
      limit?: number,                  // Results limit (1-100)
      withComments?: boolean,          // Include comments (expensive)
      getFileChanges?: boolean,        // Include diffs (expensive)
      researchGoal?: ResearchGoal
    }
  ],
  verbose?: boolean
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
  queryTerms?: string[],             // Search terms (AND logic)
  orTerms?: string[],                // Search terms (OR logic)
  owner?: string,                    // Repository owner
  repo?: string,                     // Repository name
  author?: string,                   // Author username
  'author-name'?: string,            // Author full name
  'author-email'?: string,           // Author email
  committer?: string,                // Committer username
  'committer-name'?: string,         // Committer full name
  'committer-email'?: string,        // Committer email
  'author-date'?: string,            // Author date filter
  'committer-date'?: string,         // Commit date filter
  hash?: string,                     // Commit SHA
  parent?: string,                   // Parent commit SHA
  merge?: boolean,                   // Merge commits filter
  limit?: number,                    // Results limit (1-50)
  getChangesContent?: boolean,       // Include diffs (expensive)
  sort?: "author-date" | "committer-date",
  order?: "asc" | "desc",
  researchGoal?: ResearchGoal
}
```

**Response Structure:**
- Commit metadata and SHA information
- Author and committer details
- Commit message and verification status
- Optional: file changes and statistics

---

### 7. Package Search (`mcp_octocode_packageSearch`)

**Description:** Discover NPM and Python packages with comprehensive metadata and repository analysis.

**Key Features:**
- Multi-ecosystem search (NPM + Python)
- Rich metadata extraction
- Repository link discovery
- Bulk package comparison

**Schema Parameters:**
```typescript
{
  npmPackages?: [
    {
      name: string,                    // Package name
      searchLimit?: number,            // Results limit (1-10)
      npmSearchStrategy?: "individual" | "combined",
      npmFetchMetadata?: boolean,      // Detailed metadata
      npmField?: string,               // Specific field
      npmMatch?: string | string[]     // Field matching
    }
  ],
  pythonPackages?: [
    {
      name: string,                    // Package name
      searchLimit?: number             // Results limit (1-10)
    }
  ],
  searchLimit?: number,                // Global default limit
  npmSearchStrategy?: "individual" | "combined",
  npmFetchMetadata?: boolean,          // Global metadata setting
  researchGoal?: ResearchGoal
}
```

**Response Structure:**
- Package metadata and version information
- Repository URLs and documentation links
- Download statistics and dependencies
- Cross-ecosystem comparison data

---

## Common Schema Elements

### Base Query Schema
All tools extend the base query schema:
```typescript
{
  id?: string,                       // Optional query identifier
  researchGoal?: ResearchGoal        // Research context for LLM
}
```

### Research Goals
```typescript
type ResearchGoal = 
  | "discovery"           // Broad exploration
  | "analysis"           // Deep dive analysis  
  | "debugging"          // Problem solving
  | "exploration"        // General exploration
  | "context_generation" // Context building
  | "code_generation"    // Code examples
  | "docs_generation"    // Documentation
  | "code_analysis"      // Code review
  | "code_review"        // Review process
  | "code_refactoring"   // Refactoring support
  | "code_optimization"  // Performance optimization
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
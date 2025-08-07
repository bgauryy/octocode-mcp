# Octocode MCP Tool Schemas Documentation

This document provides comprehensive documentation of all tool schemas available in the Octocode MCP (Model Context Protocol) package. These tools enable advanced GitHub repository exploration, code search, and package discovery capabilities.

## Table of Contents

1. [Base Schema Components](#base-schema-components)
2. [GitHub Code Search](#github-code-search)
3. [GitHub Repository Search](#github-repository-search)
4. [GitHub File Content Fetching](#github-file-content-fetching)
5. [GitHub Repository Structure](#github-repository-structure)
6. [GitHub Commit Search](#github-commit-search)
7. [GitHub Pull Request Search](#github-pull-request-search)
8. [Package Search](#package-search)

---

## Base Schema Components

The base schema provides foundational components used across all tools, ensuring consistency and standardization.

### Core Components

#### Research Goals
All tools support research goal specification to guide behavior and hint generation:
- `discovery` - Initial exploration and discovery
- `analysis` - Detailed analysis tasks
- `debugging` - Debugging and issue resolution
- `exploration` - General exploration
- `context_generation` - Generating contextual information
- `code_generation` - Code generation tasks
- `docs_generation` - Documentation generation
- `code_analysis` - Analyzing existing code
- `code_review` - Code review processes
- `code_refactoring` - Refactoring operations
- `code_optimization` - Performance optimization

#### Common Parameters

**BaseQuery**
- `id` (optional): Unique identifier for the query
- `researchGoal` (optional): Research goal to guide tool behavior

**Bulk Operations**
- `queries`: Array of queries for parallel execution
- `verbose` (optional, default: false): Include detailed metadata for debugging

**Pagination**
- `limit`: Maximum number of results (1-100)
- `offset`: Number of results to skip

**Sorting**
- `sort`: Field to sort by
- `order`: Sort direction (`asc` or `desc`, default: `desc`)

**Date Filters**
Format: `">YYYY-MM-DD"`, `">=YYYY-MM-DD"`, `"<YYYY-MM-DD"`, `"YYYY-MM-DD..YYYY-MM-DD"`

---

## GitHub Code Search

**Tool**: `githubSearchCode`

Search for code across GitHub repositories with strategic query planning and bulk operations.

### Key Features
- Semantic and technical search capabilities
- Progressive refinement strategy
- Quality boosting for better results
- Bulk queries (up to 5) for comprehensive discovery

### Parameters

#### Required
- `queryTerms` (array, 1-4 items): Search terms with AND logic within files
  - Use single words for exploratory search
  - Use specific code terms for better results

#### Repository Filters
- `owner`: Repository owner (single or array)
- `repo`: Repository name (single or array)
- `stars`: Minimum stars for quality results
- `pushed`: Last pushed date filter
- `created`: Repository creation date filter
- `visibility`: `public`, `private`, or `internal`

#### File Filters
- `language`: Programming language filter
- `extension`: File extension (e.g., "js", "yml")
- `filename`: Target specific filename or pattern
- `path`: File path pattern (e.g., "src/", "docs/")
- `size`: File size in KB

#### Search Configuration
- `match`: Search scope (`file` for content, `path` for filename)
- `sort`: `best-match` (default) or `indexed`
- `order`: `desc` (default) or `asc`
- `qualityBoost` (default: true): Prioritize popular repositories
- `branch`: Branch, tag, or commit SHA

#### Result Control
- `limit` (1-20): Maximum results per query
- `minify` (default: true): Optimize content for token efficiency
- `sanitize` (default: true): Remove secrets and malicious content

### Example Usage
```json
{
  "queries": [
    {
      "queryTerms": ["authenticate"],
      "owner": "facebook",
      "language": "typescript",
      "limit": 10,
      "researchGoal": "code_analysis"
    }
  ]
}
```

---

## GitHub Repository Search

**Tool**: `githubSearchRepositories`

Search GitHub repositories with smart filtering and bulk operations.

### Key Features
- Topic-based discovery
- Quality filters (stars, forks, activity)
- Excludes archived repos and forks by default
- Bulk search (up to 5 queries)

### Parameters

#### Search Terms
- `queryTerms`: Search terms for repo names/descriptions
- `topic`: Find repos by topic/technology (single or array)

#### Repository Filters
- `owner`: Repository owner/organization
- `language`: Programming language filter
- `license`: License filter (single or array)
- `visibility`: Repository visibility

#### Quality Filters
- `stars`: Star count filter
- `size`: Repository size in KB
- `created`: Creation date filter
- `updated`: Last update date filter

#### Community Filters
- `followers`: Repository owner followers
- `good-first-issues`: Good first issues count
- `help-wanted-issues`: Help wanted issues count
- `number-topics`: Number of topics

#### Search Configuration
- `match`: Search scope (`name`, `description`, `readme`)
- `sort`: Sort criteria (`stars`, `forks`, `updated`, `best-match`)
- `order`: Sort direction
- `limit` (1-100): Maximum results

### Example Usage
```json
{
  "queries": [
    {
      "topic": ["react", "typescript"],
      "stars": ">100",
      "limit": 20,
      "researchGoal": "discovery"
    }
  ]
}
```

---

## GitHub File Content Fetching

**Tool**: `githubGetFileContent`

Fetch file contents from GitHub repositories with intelligent context extraction.

### Key Features
- Complete file retrieval
- Partial access with line ranges
- Context extraction with pattern matching
- Bulk fetching (up to 10 files)

### Parameters

#### Required
- `owner`: Repository owner
- `repo`: Repository name
- `filePath`: File path from repository root (no leading slash)

#### Optional
- `branch`: Branch, tag, or commit SHA
- `startLine`: Starting line number (1-based)
- `endLine`: Ending line number (1-based)
- `matchString`: Exact string to find in file
- `matchStringContextLines` (default: 5): Context lines around matches
- `minified` (default: true): Optimize content for token efficiency

### Example Usage
```json
{
  "queries": [
    {
      "owner": "microsoft",
      "repo": "vscode",
      "filePath": "src/main.ts",
      "startLine": 100,
      "endLine": 200,
      "minified": true
    }
  ]
}
```

---

## GitHub Repository Structure

**Tool**: `githubViewRepoStructure`

Explore GitHub repository structure and validate repository access.

### Key Features
- Directory navigation with depth control
- Smart filtering of noise files
- Access validation
- Bulk exploration (up to 5 repositories)

### Parameters

#### Required
- `owner`: Repository owner
- `repo`: Repository name
- `branch`: Branch, tag, or commit SHA

#### Optional
- `path` (default: ""): Directory path within repository
- `depth` (default: 1, max: 2): Directory depth to explore
- `includeIgnored` (default: false): Include config/hidden files
- `showMedia` (default: false): Include media files

### Example Usage
```json
{
  "queries": [
    {
      "owner": "facebook",
      "repo": "react",
      "branch": "main",
      "path": "packages",
      "depth": 2,
      "researchGoal": "exploration"
    }
  ]
}
```

---

## GitHub Commit Search

**Tool**: `githubSearchCommits`

Search GitHub commits with intelligent filtering and comprehensive analysis.

### Key Features
- Search by author, message, date
- Support for merge commit filtering
- Optional commit changes retrieval
- Intelligent error recovery

### Parameters

#### Search Terms
- `queryTerms`: Search terms with AND logic
- `orTerms`: Search terms with OR logic

#### Repository Filters
- `owner`: Repository owner
- `repo`: Repository name
- `visibility`: Repository visibility

#### Author/Committer Filters
- `author`: GitHub username of author
- `author-name`: Full name of author
- `author-email`: Email of author
- `committer`: GitHub username of committer
- `committer-name`: Full name of committer
- `committer-email`: Email of committer

#### Date Filters
- `author-date`: Filter by author date
- `committer-date`: Filter by commit date

#### Commit Filters
- `hash`: Commit SHA (full or partial)
- `parent`: Parent commit SHA
- `tree`: Tree SHA
- `merge`: Only merge commits (true) or exclude (false)

#### Result Control
- `limit` (default: 25, max: 50): Maximum results
- `getChangesContent` (default: false): Fetch commit diffs (expensive!)
- `sort`: `author-date` or `committer-date`
- `order`: Sort direction

### Example Usage
```json
{
  "queryTerms": ["fix", "bug"],
  "owner": "microsoft",
  "repo": "typescript",
  "author": "RyanCavanaugh",
  "limit": 10,
  "researchGoal": "debugging"
}
```

---

## GitHub Pull Request Search

**Tool**: `githubSearchPullRequests`

Search GitHub pull requests with comprehensive filtering capabilities.

### Key Features
- Direct PR fetching by number
- Rich filtering options
- Comment and file changes retrieval
- Bulk search (up to 5 queries)

### Parameters

#### Search
- `query`: Search query for PR content
- `prNumber`: Specific PR number (with owner/repo for direct fetch)

#### Repository Filters
- `owner`: Repository owner (single or array)
- `repo`: Repository name (single or array)
- `visibility`: Repository visibility

#### PR State Filters
- `state`: `open` or `closed`
- `merged`: Merged state
- `draft`: Draft state
- `locked`: Locked conversation status

#### User Filters
- `author`: PR author username
- `assignee`: Assignee username
- `commenter`: User who commented
- `involves`: User involved in any way
- `mentions`: PRs mentioning user
- `review-requested`: User/team requested for review
- `reviewed-by`: User who reviewed

#### Label/Milestone Filters
- `label`: Labels (single or array)
- `no-label`: PRs without labels
- `milestone`: Milestone title
- `no-milestone`: PRs without milestones
- `project`: Project board owner/number
- `no-project`: PRs not in projects

#### Branch Filters
- `head`: Head branch name
- `base`: Base branch name

#### Date Filters
- `created`: Created date
- `updated`: Updated date
- `closed`: Closed date
- `merged-at`: Merged date

#### Review/CI Filters
- `review`: Review status (`none`, `required`, `approved`, `changes_requested`)
- `checks`: CI status (`pending`, `success`, `failure`)

#### Interaction Filters
- `comments`: Comment count
- `reactions`: Reaction count
- `interactions`: Total interactions

#### Result Control
- `sort`: Sort criteria (various options)
- `order`: Sort direction
- `limit` (default: 30, max: 100): Maximum results
- `withComments` (default: false): Include comment content (expensive!)
- `getFileChanges` (default: false): Include file diffs (expensive!)

### Example Usage
```json
{
  "queries": [
    {
      "owner": "rust-lang",
      "repo": "rust",
      "state": "open",
      "label": "good-first-issue",
      "limit": 15,
      "researchGoal": "discovery"
    }
  ]
}
```

---

## Package Search

**Tool**: `packageSearch`

Discover NPM and Python packages with comprehensive metadata.

### Key Features
- Multi-ecosystem search (NPM and Python)
- Repository link discovery
- Version history and statistics
- Bulk search (up to 10 packages)

### Global Parameters
- `searchLimit` (default: 1): Global results limit (1-10)
- `npmSearchStrategy` (default: "individual"): NPM search strategy
- `npmFetchMetadata` (default: false): Fetch detailed NPM metadata
- `researchGoal`: Research goal for guidance

### NPM Package Parameters
- `npmPackages`: Array of NPM package queries
  - `name`: Package name to search
  - `searchLimit`: Results limit for this query
  - `npmSearchStrategy`: Strategy override
  - `npmFetchMetadata`: Metadata fetch override
  - `npmField`: Specific field to retrieve
  - `npmMatch`: Specific field(s) to retrieve

### Python Package Parameters
- `pythonPackages`: Array of Python package queries
  - `name`: Package name to search
  - `searchLimit`: Results limit for this query

### NPM Fields Available
- `version`, `description`, `license`, `author`
- `homepage`, `repository`, `dependencies`, `devDependencies`
- `keywords`, `main`, `scripts`, `engines`
- `files`, `publishConfig`, `dist-tags`, `time`

### Example Usage
```json
{
  "npmPackages": [
    {
      "name": "express",
      "npmFetchMetadata": true,
      "searchLimit": 1
    },
    {
      "name": "react",
      "npmMatch": ["version", "repository"]
    }
  ],
  "pythonPackages": [
    {
      "name": "requests",
      "searchLimit": 1
    }
  ],
  "researchGoal": "discovery"
}
```

---

## Best Practices

### 1. Progressive Search Strategy
Start with broad queries, then narrow based on initial findings:
```json
{
  "queries": [
    { "queryTerms": ["authentication"], "limit": 20 },
    { "queryTerms": ["oauth", "login"], "owner": "facebook", "limit": 10 },
    { "queryTerms": ["OAuth2Strategy"], "language": "javascript", "limit": 5 }
  ]
}
```

### 2. Use Research Goals
Always specify research goals to get optimized hints and suggestions:
- `discovery` - Initial exploration
- `debugging` - Finding and fixing issues
- `code_analysis` - Understanding implementations
- `code_generation` - Creating new code

### 3. Leverage Bulk Operations
Execute multiple searches in parallel for efficiency:
- Code search: Up to 5 queries
- Repository search: Up to 5 queries
- File content: Up to 10 files
- Package search: Up to 10 packages

### 4. Optimize Token Usage
- Use `minify: true` for file content
- Specify line ranges for large files
- Avoid `getChangesContent` and `getFileChanges` unless necessary
- Use `matchString` for targeted content extraction

### 5. Quality Filtering
- Enable `qualityBoost` for code search
- Use star filters for repository quality
- Exclude archived repos and forks (default behavior)
- Filter by recent activity with `pushed` date

### 6. Error Recovery
Tools provide intelligent hints on failure:
- Broader search suggestions
- Semantic alternatives
- Related terms
- Alternative approaches

---

## Integration Tips

### Combining Tools
1. Use `githubSearchRepositories` to find relevant repos
2. Use `githubViewRepoStructure` to explore repository layout
3. Use `githubSearchCode` to find specific implementations
4. Use `githubGetFileContent` to examine code details
5. Use `packageSearch` to find related packages

### Workflow Example
```javascript
// 1. Find popular React TypeScript projects
const repos = await githubSearchRepositories({
  queries: [{
    topic: ["react", "typescript"],
    stars: ">1000",
    limit: 10
  }]
});

// 2. Explore structure of interesting repo
const structure = await githubViewRepoStructure({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    branch: "main",
    path: "packages",
    depth: 2
  }]
});

// 3. Search for specific patterns
const code = await githubSearchCode({
  queries: [{
    queryTerms: ["useEffect", "cleanup"],
    owner: "vercel",
    repo: "next.js",
    language: "typescript"
  }]
});

// 4. Get full file content
const content = await githubGetFileContent({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    filePath: "packages/next/src/client/index.tsx",
    matchString: "useEffect",
    matchStringContextLines: 10
  }]
});
```

---

## Notes

- All tools automatically exclude archived repositories and forks for better quality results
- Rate limiting is handled automatically with intelligent retry logic
- Security sanitization is enabled by default to remove secrets and malicious content
- Tools provide context-aware hints based on research goals
- Bulk operations are atomic - all queries in a batch succeed or fail together
# Octocode MCP Server

**Model Context Protocol Server for GitHub Code Research**

[![NPM Version](https://img.shields.io/npm/v/octocode-mcp)](https://www.npmjs.com/package/octocode-mcp)
[![License](https://img.shields.io/npm/l/octocode-mcp)](../../LICENSE)

MCP server implementation providing five specialized tools for AI-driven GitHub code research with enterprise-grade security and token optimization.

**For general overview and getting started, see the [main README](../../README.md).**

---

## Table of Contents

- [Installation](#installation)
- [API Reference](#api-reference)
  - [githubSearchCode](#githubsearchcode)
  - [githubSearchRepositories](#githubsearchrepositories)
  - [githubViewRepoStructure](#githubviewrepostructure)
  - [githubGetFileContent](#githubgetfilecontent)
  - [githubSearchPullRequests](#githubsearchpullrequests)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Advanced Usage](#advanced-usage)
- [Documentation](#documentation)

---

## Installation

### NPM

```bash
npm install octocode-mcp
```

### NPX (Recommended for MCP)

```bash
npx octocode-mcp@latest
```

### Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

**Platform-specific setup**: See [main README - Platform Setup](../../README.md#platform-specific-setup)

---

## API Reference

### githubSearchCode

Search for code implementations across GitHub repositories.

#### Parameters

```typescript
interface GithubSearchCodeParams {
  // Query parameters
  keywordsToSearch: string[];      // Required: Search terms (AND logic)

  // Filters
  owner?: string;                  // Repository owner/organization
  repo?: string;                   // Specific repository name
  path?: string;                   // Directory path filter
  filename?: string;               // Filename pattern (case-insensitive)
  extension?: string;              // File extension without dot (e.g., "ts", "js")

  // Search mode
  match?: "file" | "path";         // "file" = search IN content (default)
                                   // "path" = search file/directory names

  // Control
  limit?: number;                  // Max results: 1-20 (default: 10)
  minify?: boolean;                // Minify results (default: true)
  sanitize?: boolean;              // Sanitize secrets (default: true)
}
```

#### Response

```typescript
interface GithubSearchCodeResponse {
  results: Array<{
    path: string;                  // File path
    repository: {
      owner: string;
      name: string;
      full_name: string;
      html_url: string;
      description: string;
      stars: number;
    };
    text_matches?: Array<{         // Only when match="file"
      fragment: string;            // Code snippet with match
      matches: Array<{
        text: string;
        indices: [number, number];
      }>;
    }>;
  }>;
  total_count: number;
  incomplete_results: boolean;
}
```

#### Best Practices

- **Discovery**: Use `match="path"` for fast file location (25x faster, 20 tokens vs 500)
- **Analysis**: Use `match="file"` with low `limit` (5-10) for detailed matches
- **Scope**: Always specify `owner`/`repo` when possible to avoid rate limits
- **Keywords**: Use specific terms (function names, error messages) over generic terms

#### Examples

```typescript
// Fast discovery - find files with "auth" in path
{
  keywordsToSearch: ["auth"],
  match: "path"
}

// Detailed search - find OAuth implementations
{
  owner: "passportjs",
  repo: "passport",
  keywordsToSearch: ["OAuth2", "strategy"],
  extension: "js",
  limit: 5
}

// Targeted search - find exports in specific directory
{
  owner: "facebook",
  repo: "react",
  path: "packages/react/src",
  keywordsToSearch: ["export", "function"],
  match: "file"
}
```

---

### githubSearchRepositories

Discover GitHub repositories by topics, keywords, or metadata.

#### Parameters

```typescript
interface GithubSearchRepositoriesParams {
  // Query modes (use one or both)
  topicsToSearch?: string[];       // GitHub topic tags (exact match, curated)
  keywordsToSearch?: string[];     // Search name/description/README (AND logic)

  // Filters
  owner?: string;                  // Organization or user
  stars?: string;                  // Examples: ">1000", "100..500", "<100"
  language?: string;               // Programming language (e.g., "TypeScript")
  size?: string;                   // Repo size in KB (e.g., ">1000", "<500")
  created?: string;                // Creation date (e.g., ">=2024-01-01")
  updated?: string;                // Last update date

  // Search scope
  match?: ("name" | "description" | "readme")[];  // Fields to search (OR logic)

  // Control
  sort?: "stars" | "forks" | "updated" | "best-match";
  limit?: number;                  // Max results: 1-20 (default: 5)
}
```

#### Response

```typescript
interface GithubSearchRepositoriesResponse {
  results: Array<{
    owner: string;
    name: string;
    full_name: string;
    description: string;
    html_url: string;
    stars: number;
    forks: number;
    language: string;
    topics: string[];
    created_at: string;
    updated_at: string;
    size: number;                  // KB
  }>;
  total_count: number;
}
```

#### Best Practices

- **Discovery**: Use `topicsToSearch` for curated, high-quality results
- **Quality**: Filter with `stars=">1000"` for production-ready code
- **Maintenance**: Use `updated` filter for actively maintained projects
- **Scope**: Combine topics + stars for best results

#### Examples

```typescript
// Find quality TypeScript CLI tools
{
  topicsToSearch: ["typescript", "cli"],
  stars: ">1000",
  sort: "stars"
}

// Recent authentication libraries
{
  keywordsToSearch: ["authentication", "jwt"],
  language: "JavaScript",
  updated: ">=2024-01-01",
  limit: 10
}

// Organization's popular repos
{
  owner: "facebook",
  sort: "stars",
  limit: 20
}
```

---

### githubViewRepoStructure

Explore repository directory structure with file sizes.

#### Parameters

```typescript
interface GithubViewRepoStructureParams {
  // Required
  owner: string;                   // Repository owner
  repo: string;                    // Repository name
  branch: string;                  // Branch, tag, or SHA

  // Optional
  path?: string;                   // Directory path (default: "" = root)
  depth?: 1 | 2;                   // Exploration depth (default: 1)
                                   // 1 = current directory only
                                   // 2 = includes subdirectories
}
```

#### Response

```typescript
interface GithubViewRepoStructureResponse {
  path: string;                    // Current directory path
  files: Array<{
    name: string;
    path: string;
    size: number;                  // Bytes
    type: "file";
  }>;
  folders: Array<{
    name: string;
    path: string;
    type: "dir";
    files?: Array<...>;            // Only when depth=2
    folders?: Array<...>;          // Only when depth=2
  }>;
}
```

#### Best Practices

- **Start shallow**: Use `depth=1` for overview, then drill down
- **Navigate**: Use `path` to explore specific directories
- **Large repos**: Avoid `depth=2` on root of large repositories

#### Examples

```typescript
// Root overview
{
  owner: "facebook",
  repo: "react",
  branch: "main",
  path: "",
  depth: 1
}

// Deep dive into specific directory
{
  owner: "facebook",
  repo: "react",
  branch: "main",
  path: "packages/react/src",
  depth: 2
}
```

---

### githubGetFileContent

Read file contents with smart extraction capabilities.

#### Parameters

```typescript
interface GithubGetFileContentParams {
  // Required
  owner: string;                   // Repository owner
  repo: string;                    // Repository name
  path: string;                    // File path from repository root

  // Optional
  branch?: string;                 // Branch, tag, or SHA (default: default branch)

  // Extraction modes (choose one)
  // Mode 1: Pattern matching (most efficient)
  matchString?: string;            // Search pattern
  matchStringContextLines?: number; // Context lines around match (1-50, default: 5)

  // Mode 2: Line range
  startLine?: number;              // Start line (1-indexed)
  endLine?: number;                // End line (1-indexed)

  // Mode 3: Full content
  fullContent?: boolean;           // Return entire file (default: false)

  // Control
  minified?: boolean;              // Minify content (default: true)
  sanitize?: boolean;              // Sanitize secrets (default: true)
}
```

#### Response

```typescript
interface GithubGetFileContentResponse {
  path: string;
  content: string;                 // File content (full or extracted)
  size: number;                    // Original file size in bytes
  encoding: string;
  sha: string;
  extraction_mode: "pattern" | "range" | "full";
  matches_found?: number;          // When using matchString
}
```

#### Best Practices

- **Token efficiency**: Use `matchString` for 85% token savings vs `fullContent`
- **Large files**: Always use extraction (matchString or line range), never fullContent
- **Config files**: Set `minified=false` for JSON/YAML to preserve formatting
- **Precision**: Use `matchString` from `githubSearchCode` text_matches for accurate targeting

#### Examples

```typescript
// Extract function with context (BEST - most efficient)
{
  owner: "jaredhanson",
  repo: "passport",
  path: "lib/strategies/oauth2.js",
  matchString: "authorize",
  matchStringContextLines: 20
}

// Read specific line range
{
  owner: "facebook",
  repo: "react",
  path: "packages/react/src/React.js",
  startLine: 1,
  endLine: 50
}

// Read config file (preserve formatting)
{
  owner: "microsoft",
  repo: "TypeScript",
  path: "tsconfig.json",
  fullContent: true,
  minified: false
}
```

---

### githubSearchPullRequests

Analyze pull requests, code changes, and discussions.

**Status**: Optional tool (disabled by default)

**Enable**: Set `ENABLE_TOOLS="githubSearchPullRequests"` in environment

#### Parameters

```typescript
interface GithubSearchPullRequestsParams {
  // Identification (use one)
  owner?: string;                  // Repository owner
  repo?: string;                   // Repository name
  prNumber?: number;               // Direct PR fetch (fastest, bypasses search)

  // Search filters (when not using prNumber)
  state?: "open" | "closed";
  merged?: boolean;                // Only merged PRs (requires state="closed")
  query?: string;                  // Free-text search in title/body/comments
  match?: ("title" | "body" | "comments")[];  // Search scope

  // Author and reviewers
  author?: string;
  assignee?: string;
  reviewedBy?: string;

  // Metadata filters
  label?: string | string[];       // Label filter (OR logic if array)
  base?: string;                   // Target branch
  head?: string;                   // Source branch

  // Date filters
  created?: string;                // Creation date (e.g., ">=2024-01-01")
  updated?: string;                // Last update date
  merged?: string;                 // Merge date
  closed?: string;                 // Close date

  // Engagement filters
  comments?: number | string;      // Comment count (e.g., ">5", "10..20")
  reactions?: number | string;     // Reaction count

  // Control
  sort?: "created" | "updated" | "best-match";
  order?: "asc" | "desc";
  limit?: number;                  // Max results: 1-10 (default: 5)

  // Content inclusion (token expensive)
  withContent?: boolean;           // Include code diffs (default: false)
  withComments?: boolean;          // Include comment threads (default: false)
}
```

#### Response

```typescript
interface GithubSearchPullRequestsResponse {
  results: Array<{
    number: number;
    title: string;
    state: "open" | "closed";
    merged: boolean;
    author: string;
    html_url: string;
    created_at: string;
    updated_at: string;
    merged_at?: string;
    body: string;

    // When withContent=true
    files?: Array<{
      filename: string;
      status: "added" | "modified" | "removed";
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;              // Diff content
    }>;

    // When withComments=true
    comments?: Array<{
      author: string;
      body: string;
      created_at: string;
    }>;
  }>;
}
```

#### Best Practices

- **Direct fetch**: Use `prNumber` for 10x faster retrieval
- **Production code**: Use `state="closed"` + `merged=true` for shipped features
- **Token management**:
  - `withComments=false`: 50% token savings
  - `withContent=false`: 80% token savings
- **Analysis**: Enable content/comments only when needed for deep analysis

#### Examples

```typescript
// Fetch specific PR with diffs (direct, fastest)
{
  owner: "facebook",
  repo: "react",
  prNumber: 12345,
  withContent: true
}

// Find merged authentication PRs
{
  owner: "passportjs",
  repo: "passport",
  state: "closed",
  merged: true,
  query: "authentication",
  limit: 5
}

// Recent open PRs with discussions
{
  owner: "microsoft",
  repo: "TypeScript",
  state: "open",
  sort: "updated",
  withComments: true,
  limit: 10
}

// Author's bug fixes
{
  owner: "facebook",
  repo: "react",
  author: "gaearon",
  label: "bug",
  state: "closed",
  merged: true
}
```

---

## Configuration

### Environment Variables

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `GITHUB_TOKEN` | string | Personal Access Token | Uses `gh` CLI if not set |
| `TOOLS_TO_RUN` | string | Comma-separated tool list (exclusive mode) | All default tools |
| `ENABLE_TOOLS` | string | Comma-separated tools to enable (additive) | None |
| `DISABLE_TOOLS` | string | Comma-separated tools to disable | None |
| `BETA` | "0" \| "1" | Enable experimental features | "0" |

**Notes**:
- `TOOLS_TO_RUN` is mutually exclusive with `ENABLE_TOOLS`/`DISABLE_TOOLS`
- Default tools: `githubSearchCode`, `githubSearchRepositories`, `githubViewRepoStructure`, `githubGetFileContent`
- Optional tools: `githubSearchPullRequests`

### Tool Selection Examples

```bash
# Run only search tools (exclusive mode)
export TOOLS_TO_RUN="githubSearchCode,githubSearchRepositories"

# Enable PR search (additive mode)
export ENABLE_TOOLS="githubSearchPullRequests"

# Disable structure exploration
export DISABLE_TOOLS="githubViewRepoStructure"

# Enable experimental features
export BETA="1"
```

### MCP Configuration with Environment Variables

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "ENABLE_TOOLS": "githubSearchPullRequests",
        "BETA": "1"
      }
    }
  }
}
```

---

## Authentication

### Method 1: GitHub CLI (Recommended)

```bash
# Install GitHub CLI
brew install gh  # macOS
# or download from https://cli.github.com/

# Authenticate
gh auth login

# Verify
gh auth status
```

**Pros**: Automatic token refresh, secure credential storage
**Cons**: Requires separate installation

### Method 2: Personal Access Token

1. Create token at [github.com/settings/tokens](https://github.com/settings/tokens)
2. Required scopes:
   - `repo` - Access repositories (public and private)
   - `read:user` - Read user profile
   - `read:org` - Read organization data
3. Add to environment: `GITHUB_TOKEN=ghp_your_token_here`

**Pros**: Simple, direct control
**Cons**: Manual token management, no auto-refresh

### Rate Limits

| Authentication | Rate Limit | Recommended For |
|----------------|------------|-----------------|
| Unauthenticated | 60 req/hour | Testing only |
| Authenticated | 5,000 req/hour | Production use |
| GitHub Enterprise | Custom | Enterprise deployments |

**Built-in handling**: Server automatically retries with exponential backoff on rate limit errors.

---

## Advanced Usage

### Progressive Research Workflow

Recommended three-phase pattern for deep code understanding:

```typescript
// PHASE 1: DISCOVER - Find relevant repositories
const repos = await githubSearchRepositories({
  topicsToSearch: ["microservices", "typescript"],
  stars: ">1000"
});

// PHASE 2: EXPLORE - Understand structure
const structure = await githubViewRepoStructure({
  owner: repos.results[0].owner,
  repo: repos.results[0].name,
  branch: "main",
  path: "",
  depth: 1
});

// PHASE 3: ANALYZE - Deep dive into code
const code = await githubSearchCode({
  owner: repos.results[0].owner,
  repo: repos.results[0].name,
  keywordsToSearch: ["event", "handler"],
  path: "src/services"
});

const fileContent = await githubGetFileContent({
  owner: repos.results[0].owner,
  repo: repos.results[0].name,
  path: code.results[0].path,
  matchString: "EventHandler",
  matchStringContextLines: 30
});
```

### Token Optimization Strategies

1. **Use pattern matching over full content**
   ```typescript
   // Good: 85% token savings
   { matchString: "function", matchStringContextLines: 10 }

   // Avoid: High token cost
   { fullContent: true }
   ```

2. **Discovery before detailed search**
   ```typescript
   // Fast discovery (20 tokens)
   { keywordsToSearch: ["auth"], match: "path" }

   // Then detailed (500 tokens)
   { keywordsToSearch: ["OAuth2"], match: "file", limit: 5 }
   ```

3. **Scope searches**
   ```typescript
   // Good: Scoped
   { owner: "org", repo: "repo", path: "src" }

   // Avoid: Unscoped (slow, generic results)
   { keywordsToSearch: ["helper"] }
   ```

### Error Handling

All tools return standard error responses:

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

Common error codes:
- `RATE_LIMIT_EXCEEDED` - Wait for rate limit reset
- `AUTHENTICATION_FAILED` - Check GitHub credentials
- `NOT_FOUND` - Repository or file doesn't exist
- `VALIDATION_ERROR` - Invalid parameters
- `CONTENT_TOO_LARGE` - File exceeds size limits

### Performance Characteristics

| Operation | Typical Latency | Token Cost (avg) |
|-----------|----------------|------------------|
| `githubSearchRepositories` | 200-500ms | 100-300 tokens |
| `githubSearchCode` (path) | 300-800ms | 50-200 tokens |
| `githubSearchCode` (file) | 500-1500ms | 500-2000 tokens |
| `githubViewRepoStructure` (depth=1) | 200-400ms | 100-500 tokens |
| `githubViewRepoStructure` (depth=2) | 400-1000ms | 500-2000 tokens |
| `githubGetFileContent` (pattern) | 300-600ms | 200-800 tokens |
| `githubGetFileContent` (full) | 400-1000ms | 1000-5000 tokens |
| `githubSearchPullRequests` (no content) | 400-800ms | 200-600 tokens |
| `githubSearchPullRequests` (with content) | 800-2000ms | 2000-10000 tokens |

---

## Documentation

### Comprehensive Resources

- **[Main README](../../README.md)** - Getting started, overview, examples
- **[Usage Guide](./docs/USAGE_GUIDE.md)** - 20+ real-world examples
- **[Authentication Guide](./docs/AUTHENTICATION.md)** - Setup and troubleshooting
- **[Tool Schemas](./docs/TOOL_SCHEMAS.md)** - Complete JSON schemas
- **[Architecture](./docs/SUMMMARY.md)** - System design and internals

### External Links

- **[NPM Package](https://www.npmjs.com/package/octocode-mcp)** - Releases and changelog
- **[GitHub Repository](https://github.com/bgauryy/octocode-mcp)** - Source code
- **[Official Website](https://octocode.ai)** - Interactive tutorials
- **[YouTube Channel](https://www.youtube.com/@Octocode-ai)** - Video guides

---

## Support

- **Issues**: [github.com/bgauryy/octocode-mcp/issues](https://github.com/bgauryy/octocode-mcp/issues)
- **Discussions**: [github.com/bgauryy/octocode-mcp/discussions](https://github.com/bgauryy/octocode-mcp/discussions)

---

## License

MIT - See [LICENSE](../../LICENSE) for details.

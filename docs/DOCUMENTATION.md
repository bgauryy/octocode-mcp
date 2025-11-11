# Octocode-MCP Documentation

## Overview

**Octocode-MCP** is a Model Context Protocol (MCP) server that provides AI assistants with advanced GitHub repository analysis and code discovery capabilities. It enables powerful, research-driven exploration of codebases across GitHub with built-in security, caching, and bulk operation support.

### Key Features

- 🔍 **Advanced Code Search** - Semantic search across GitHub repositories with flexible filtering
- 📁 **Repository Analysis** - Explore repository structure and fetch file content efficiently
- 🔄 **Pull Request Analysis** - Search and analyze PRs with optional diffs and comments
-  **Bulk Operations** - Process multiple queries in parallel for maximum efficiency
- 🔒 **Security First** - Content sanitization, secret detection, and validation
- ⚡ **Performance** - Intelligent caching, rate limiting, and token optimization
- 📊 **Session Tracking** - Monitor tool usage and performance

### Version

**Version:** 7.0.0  
**License:** MIT  
**Author:** Guy Bary <bgauryy@gmail.com>  
**Homepage:** https://octocode.ai

---

## Architecture

### Directory Structure

```
packages/octocode-mcp/
├── src/
│   ├── github/          # GitHub API integration layer
│   │   ├── client.ts           # Octokit client configuration
│   │   ├── codeSearch.ts       # Code search implementation
│   │   ├── repoSearch.ts       # Repository search
│   │   ├── pullRequestSearch.ts # PR search and analysis
│   │   ├── fileOperations.ts   # File content operations
│   │   ├── queryBuilders.ts    # GitHub query builders
│   │   ├── errors.ts           # Error handling
│   │   ├── errorConstants.ts   # Error message constants
│   │   └── userInfo.ts         # User context management
│   │
│   ├── tools/           # MCP tool implementations
│   │   ├── toolsManager.ts              # Tool registration
│   │   ├── descriptions.ts              # Tool descriptions
│   │   ├── hints.ts                     # Contextual hints
│   │   ├── utils.ts                     # Tool utilities
│   │   ├── toolConfig.ts                # Tool configuration
│   │   ├── github_search_code.ts        # Code search tool
│   │   ├── github_search_repos.ts       # Repository search tool
│   │   ├── github_fetch_content.ts      # Content fetch tool
│   │   ├── github_view_repo_structure.ts # Structure view tool
│   │   └── github_search_pull_requests.ts # PR search tool
│   │
│   ├── scheme/          # Zod validation schemas
│   │   ├── baseSchema.ts                    # Base schema definitions
│   │   ├── schemDescriptions.ts             # Schema descriptions
│   │   ├── github_search_code.ts            # Code search schema
│   │   ├── github_search_repos.ts           # Repo search schema
│   │   ├── github_fetch_content.ts          # Content fetch schema
│   │   ├── github_view_repo_structure.ts    # Structure view schema
│   │   └── github_search_pull_requests.ts   # PR search schema
│   │
│   ├── security/        # Security layer
│   │   ├── contentSanitizer.ts      # Content sanitization
│   │   ├── regexes.ts               # Secret detection patterns
│   │   ├── mask.ts                  # Secret masking utilities
│   │   └── withSecurityValidation.ts # Security wrapper
│   │
│   ├── utils/           # Core utilities
│   │   ├── cache.ts              # Caching system
│   │   ├── bulkOperations.ts     # Bulk query processing
│   │   ├── logger.ts             # Logging utilities
│   │   ├── promiseUtils.ts       # Promise handling
│   │   ├── fileFilters.ts        # File filtering
│   │   └── exec.ts               # Command execution
│   │
│   ├── index.ts         # Server entry point
│   ├── constants.ts     # Global constants
│   ├── types.ts         # TypeScript type definitions
│   ├── serverConfig.ts  # Server configuration
│   ├── session.ts       # Session management
│   ├── prompts.ts       # MCP prompts
│   ├── resources.ts     # MCP resources
│   ├── sampling.ts      # LLM sampling (BETA)
│   ├── systemPrompts.ts # System prompts
│   └── responses.ts     # Response formatting
│
├── tests/               # Test suite
├── docs/                # Additional documentation
├── package.json         # Project metadata
├── manifest.json        # MCP manifest
├── tsconfig.json        # TypeScript configuration
└── rollup.config.js     # Build configuration
```

---

## Available Tools

### 1. `githubSearchCode`

Search file content or filenames/paths using keywords.

**Modes:**
- `match='file'` (default) - Search IN file content → returns files with text_matches
- `match='path'` - Search filenames/directories → returns matching file paths only

**Parameters:**
- `keywordsToSearch` (required): Array of keywords to search for
- `owner` (optional): Repository owner
- `repo` (optional): Repository name
- `extension` (optional): File extension filter (e.g., "ts", "js")
- `stars` (optional): Star count filter (e.g., ">1000")
- `filename` (optional): Filename pattern filter
- `path` (optional): Directory path filter
- `match` (optional): 'file' or 'path'
- `limit` (optional): Maximum results (default: 30, max: 100)
- `minify` (optional): Minify results (default: true)
- `sanitize` (optional): Sanitize secrets (default: true)

**Example:**
```typescript
{
  keywordsToSearch: ["async", "function"],
  owner: "facebook",
  repo: "react",
  extension: "ts",
  path: "src/hooks",
  limit: 10
}
```

**Workflow:** Search repos → Search code → Fetch content

---

### 2. `githubSearchRepositories`

Search repositories by keywords or topics with advanced filtering.

**Modes:**
- `keywordsToSearch` - Search name/description/readme (broader)
- `topicsToSearch` - Search GitHub topics (precise, best for discovery)

**Parameters:**
- `keywordsToSearch` (optional): Keywords array
- `topicsToSearch` (optional): Topics array
- `owner` (optional): Organization/user name
- `stars` (optional): Star filter (e.g., ">1000", "100..1000")
- `size` (optional): Repository size filter (KB)
- `created` (optional): Creation date (e.g., ">=2023-01-01")
- `updated` (optional): Last update date
- `match` (optional): ['name', 'description', 'readme']
- `sort` (optional): 'forks', 'stars', 'updated', 'best-match'
- `limit` (optional): Maximum results (default: 10)

**Example:**
```typescript
{
  topicsToSearch: ["mcp", "model-context-protocol"],
  stars: ">100",
  sort: "stars",
  limit: 5
}
```

**Workflow:** Search repos → View structure/Search code/Fetch content

---

### 3. `githubGetFileContent`

Retrieve file content with flexible partial reading options.

**Modes:**
- `fullContent` - Get entire file
- `startLine` + `endLine` - Get specific line range
- `matchString` + `matchStringContextLines` - Extract sections matching a pattern

**Parameters:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `path` (required): File path (verify with githubViewRepoStructure)
- `branch` (optional): Branch name (default: default branch)
- `fullContent` (optional): Fetch entire file
- `startLine` (optional): Start line number
- `endLine` (optional): End line number
- `matchString` (optional): String to find in file
- `matchStringContextLines` (optional): Context lines around match (default: 5)
- `minified` (optional): Minify content (default: true)
- `sanitize` (optional): Sanitize secrets (default: true)

**Example:**
```typescript
{
  owner: "facebook",
  repo: "react",
  path: "packages/react/src/React.js",
  matchString: "export function",
  matchStringContextLines: 10
}
```

**Workflow:** Search code/View structure → Fetch content

---

### 4. `githubViewRepoStructure`

Explore repository structure by path and depth.

**Parameters:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `branch` (required): Branch name (e.g., "main", "master")
- `path` (optional): Directory path (empty for root)
- `depth` (optional): 1 (current dir only) or 2 (includes subdirs)

**Returns:**
- `files[]` - List of files in the directory
- `folders[]` - List of subdirectories

**Example:**
```typescript
{
  owner: "facebook",
  repo: "react",
  branch: "main",
  path: "packages/react/src",
  depth: 2
}
```

**Workflow:** Search repos → View structure → Search code/Fetch content

---

### 5. `githubSearchPullRequests`

Search pull requests or fetch specific PR by number.

**Modes:**
- Direct fetch: `prNumber` - Get specific PR
- Search: Use filters - Find PRs by criteria

**Parameters:**
- `prNumber` (optional): Direct PR number
- `owner` (optional): Repository owner
- `repo` (optional): Repository name
- `query` (optional): Search query text
- `state` (optional): 'open' or 'closed'
- `merged` (optional): true for merged PRs
- `author` (optional): PR author username
- `assignee` (optional): Assignee username
- `label` (optional): Label name or array
- `head` (optional): Head branch name
- `base` (optional): Base branch name
- `created` (optional): Creation date filter
- `updated` (optional): Update date filter
- `match` (optional): ['title', 'body', 'comments']
- `sort` (optional): 'created', 'updated', 'best-match'
- `limit` (optional): Maximum results (default: 5, max: 10)
- `withComments` (optional): Include discussion threads (token expensive)
- `withContent` (optional): Include code diffs (token expensive)

**Example:**
```typescript
{
  owner: "facebook",
  repo: "react",
  state: "closed",
  merged: true,
  label: "bug",
  limit: 5
}
```

**Workflow:** Search repos → Search PRs → Analyze changes/discussions

---

## Core Features

### Bulk Operations

All tools support **bulk queries** for maximum efficiency. Process multiple related queries in a single request.

**Benefits:**
- 3-5x faster execution
- Better API utilization
- Enhanced context for AI reasoning
- Parallel processing of up to 5 queries

**Example:**
```typescript
{
  queries: [
    {
      keywordsToSearch: ["authentication"],
      extension: "ts",
      path: "src/auth"
    },
    {
      keywordsToSearch: ["middleware"],
      extension: "ts",
      path: "src/middleware"
    },
    {
      keywordsToSearch: ["validation"],
      extension: "ts",
      path: "src/utils"
    }
  ]
}
```

---

### Security Layer

#### Content Sanitization

All responses pass through the security layer to:
- **Detect secrets**: API keys, tokens, credentials
- **Mask sensitive data**: Redact detected secrets
- **Prevent injection**: Block prompt injection attempts
- **Validate content**: Ensure safe content delivery

**Detected Patterns:**
- API keys (AWS, Azure, Google, GitHub, etc.)
- Private keys (RSA, SSH, PEM)
- OAuth tokens
- Database credentials
- JWT tokens
- Webhook secrets
- Credit card numbers

#### Parameter Validation

All inputs validated with Zod schemas:
- Type checking
- Range validation
- Pattern matching
- Required field enforcement

---

### Caching System

**Features:**
- In-memory caching with NodeCache
- Automatic cache key generation (MD5)
- TTL support (24-hour default)
- Cache statistics tracking
- Graceful degradation

**Cache Keys:**
```typescript
// Format: MD5(toolName + params)
cache.get("githubSearchCode:abc123def456");
```

**Cache Stats:**
```typescript
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  totalKeys: number;
  lastReset: Date;
}
```

---

### Error Handling

**Multi-layer Error Handling:**
1. **Tool-level**: Individual tool error recovery
2. **API-level**: GitHub API error handling with retries
3. **Bulk-level**: Partial failure isolation
4. **System-level**: Graceful server shutdown

**GitHub API Errors:**
- Rate limit handling
- Authentication errors
- Not found responses
- Validation errors
- Network timeouts

**Error Response:**
```typescript
{
  status: "error",
  error: "Detailed error message",
  hints: [
    "Try broader search terms",
    "Check repository permissions",
    "Verify authentication token"
  ]
}
```

---

### Contextual Hints

Every response includes **contextual hints** based on:
- Result status (hasResults, empty, error)
- Tool type
- Query parameters
- Error conditions

**Example Hints:**
```typescript
// For empty results:
[
  " Try synonyms or variations in separate queries",
  "Broader patterns: \"error|fail|bug\" with regex",
  "Remove restrictive filters incrementally",
  "Check repository name and permissions"
]

// For successful results:
[
  " Use bulk queries for comprehensive coverage",
  "Fetch content for specific matched files",
  "Narrow scope with extension or path filters"
]
```

---

## Installation

### Prerequisites

- **Node.js**: >= 18.12.0
- **GitHub Token**: Personal access token with appropriate permissions

### Install via NPM

```bash
npm install octocode-mcp
# or
yarn add octocode-mcp
```

### Configuration

Set up environment variables:

```bash
# Required (choose one or both)
GITHUB_TOKEN=ghp_your_token_here  # Personal Access Token or GH_TOKEN

# Optional
GITHUB_API_URL=https://api.github.com  # For GitHub Enterprise: https://github.company.com/api/v3
ENABLE_LOGGING=true
BETA=true  # Enable experimental features
```

### Run Server

```bash
# Direct execution
octocode-mcp

# Debug mode (with MCP Inspector)
yarn debug

# Development with watch
yarn build:watch
```

---

## Development

### Project Setup

```bash
# Install dependencies
yarn install

# Build project
yarn build

# Development build (no linting)
yarn build:dev

# Watch mode
yarn build:watch
```

### Testing

```bash
# Run tests
yarn test

# Watch mode
yarn test:watch

# Coverage report
yarn test:coverage

# Visual test UI
yarn test:ui
```

### Code Quality

```bash
# Lint code
yarn lint

# Fix linting issues
yarn lint:fix

# Format code
yarn format

# Check formatting
yarn format:check
```

### Build & Release

```bash
# Clean build
yarn clean

# Full build with linting
yarn build

# Create DXT package
yarn dxt:pack

# Full release (build + sign + verify)
yarn dxt:release

# Validate manifest
yarn dxt:validate
```

---

## Dependencies

### Core Dependencies

- **@modelcontextprotocol/sdk**: ^1.18.1 - MCP protocol implementation
- **@octokit/rest**: ^22.0.0 - GitHub API client
- **@octokit/plugin-throttling**: ^11.0.1 - Rate limiting
- **zod**: ^3.25.26 - Schema validation
- **node-cache**: ^5.1.2 - In-memory caching
- **axios**: ^1.12.2 - HTTP client
- **dotenv**: ^16.4.5 - Environment configuration
- **async-mutex**: ^0.5.0 - Async synchronization
- **uuid**: ^13.0.0 - UUID generation
- **octocode-utils**: ^5.0.0 - Shared utilities

### Development Dependencies

- **TypeScript**: ^5.9.2
- **Vitest**: ^3.2.4 - Testing framework
- **ESLint**: ^8.57.0 - Code linting
- **Prettier**: ^3.5.3 - Code formatting
- **Rollup**: ^4.46.2 - Bundler

---

## Type Definitions

### Query Types

```typescript
// Code search query
interface GitHubCodeSearchQuery {
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  stars?: string;
  filename?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
  minify?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

// Repository search query
interface GitHubReposSearchQuery {
  keywordsToSearch?: string[];
  topicsToSearch?: string[];
  owner?: string;
  stars?: string;
  size?: string;
  created?: string;
  updated?: string;
  match?: Array<'name' | 'description' | 'readme'>;
  sort?: 'forks' | 'stars' | 'updated' | 'best-match';
  limit?: number;
  researchGoal?: string;
  reasoning?: string;
}

// File content query
interface FileContentQuery {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  minified?: boolean;
  sanitize?: boolean;
  researchGoal?: string;
  reasoning?: string;
}
```

### Result Types

```typescript
// Base result structure
interface BaseToolResult<TQuery = object> {
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

// Query execution status
type QueryStatus = 'hasResults' | 'empty' | 'error';

// Generic tool result
interface ToolResult {
  status: QueryStatus;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
  [key: string]: unknown;
}

// Bulk operation result
interface ProcessedBulkResult<TData, TQuery> {
  researchGoal?: string;
  reasoning?: string;
  data?: TData;
  error?: string | GitHubAPIError;
  status: QueryStatus;
  query?: TQuery;
  hints?: string[];
}
```

---

## API Integration

### GitHub API Client

The server uses **Octokit** with:
- REST API endpoint methods
- Throttling plugin for rate limiting
- Custom retry logic
- Error handling and recovery

**Configuration:**
```typescript
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      // Retry once on rate limit
      return options.request.retryCount === 0;
    },
    onSecondaryRateLimit: (retryAfter, options) => {
      // Handle secondary rate limits
    }
  }
});
```

### Rate Limiting

- **Search API**: 30 requests/minute
- **Core API**: 5000 requests/hour
- Automatic retry on rate limit
- Graceful degradation

---

## Session Management

Track tool usage and monitor performance:

```typescript
interface SessionData {
  sessionId: string;
  intent: 'init' | 'error' | 'tool_call';
  data: ToolCallData | ErrorData;
  timestamp: string;
  version: string;
}

interface ToolCallData {
  tool_name: string;
  repos: string[];
}
```

**Session Lifecycle:**
1. Initialize on server start
2. Track tool calls
3. Log errors
4. Clean up on shutdown

---

## Best Practices

### Progressive Refinement

1. **Discovery**: Broad search with minimal filters
2. **Context**: Analyze results and identify patterns
3. **Targeted**: Apply specific filters based on findings
4. **Deep-Dive**: Detailed analysis of specific files/sections

### Query Optimization

- Use **bulk operations** for related queries
- Start with **topicsToSearch** for repository discovery
- Use **path filters** to narrow code search scope
- Leverage **matchString** for targeted content extraction
- Apply **extension filters** for language-specific searches

### Error Recovery

- Check **hints** in error responses
- Verify authentication token
- Confirm repository permissions
- Review GitHub API rate limits
- Use broader search terms for empty results

---

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes* | - | GitHub Personal Access Token. Also recognizes `GH_TOKEN` |
| `GITHUB_API_URL` | No | `https://api.github.com` | GitHub API endpoint. Use for GitHub Enterprise Server |
| `ENABLE_LOGGING` | No | `false` | Enable detailed request/response logging |
| `BETA` | No | `false` | Enable experimental beta features |
| `REQUEST_TIMEOUT` | No | `30000` | Request timeout in milliseconds (min: 30000) |
| `MAX_RETRIES` | No | `3` | Maximum retry attempts for failed requests (0-10) |
| `LOG` | No | `true` | Global logging enable/disable flag |
| `TOOLS_TO_RUN` | No | All tools | Comma-separated list of specific tools to run |
| `ENABLE_TOOLS` | No | All tools | Comma-separated list of tools to enable |
| `DISABLE_TOOLS` | No | None | Comma-separated list of tools to disable |

*Not strictly required if using GitHub CLI authentication (`gh auth login`)

**Example Configuration:**

```bash
# Authentication (GitHub CLI recommended, or set token)
GITHUB_TOKEN=ghp_your_token_here

# GitHub Enterprise Server (optional)
GITHUB_API_URL=https://github.company.com/api/v3

# Server Configuration
ENABLE_LOGGING=true
BETA=false
REQUEST_TIMEOUT=30000
MAX_RETRIES=3

# Tool Configuration (optional)
ENABLE_TOOLS=githubSearchCode,githubGetFileContent,githubSearchRepositories
```

### Server Configuration

```typescript
interface ServerConfig {
  version: string;
  githubApiUrl: string;        // GitHub API URL (default: https://api.github.com)
  toolsToRun?: string[];       // Specific tools to run (optional)
  enableTools?: string[];      // Tools to enable (optional)
  disableTools?: string[];     // Tools to disable (optional)
  enableLogging: boolean;      // Enable detailed logging
  betaEnabled: boolean;        // Enable beta/experimental features
  timeout: number;             // Request timeout in milliseconds
  maxRetries: number;          // Maximum retry attempts
  loggingEnabled: boolean;     // Global logging flag
}
```

---

## Troubleshooting

### Common Issues

**1. Authentication Errors**
```
Error: Bad credentials
```
**Solution:** Verify GitHub token is valid and has required permissions

**2. Rate Limit Exceeded**
```
Error: API rate limit exceeded
```
**Solution:** Wait for rate limit reset or use authenticated requests

**3. Repository Not Found**
```
Error: Not Found
```
**Solution:** Check owner/repo names and repository visibility

**4. Empty Results**
```
Status: empty
```
**Solution:** Review hints, try broader search terms, remove restrictive filters

---

## Performance Tips

1. **Use bulk operations** - Process multiple queries in parallel
2. **Enable caching** - Reuse results for identical queries
3. **Partial content reads** - Use line ranges or matchString instead of fullContent
4. **Filter early** - Apply path, extension, and filename filters
5. **Limit results** - Use reasonable limit values (5-30)
6. **Minify content** - Enable minification to reduce token usage

---

## Support & Resources

- **GitHub Repository**: https://github.com/bgauryy/octocode-mcp
- **Issues**: https://github.com/bgauryy/octocode-mcp/issues
- **Homepage**: https://octocode.ai
- **Email**: bgauryy@gmail.com

---

## License

MIT License - See LICENSE for details

---

## Version History

### 7.0.0 (Current)
- Advanced GitHub integration
- Bulk operations support
- Enhanced security layer
- Session tracking
- Comprehensive error handling
- Performance optimizations

---

**Built with ❤️ for AI-powered code research**


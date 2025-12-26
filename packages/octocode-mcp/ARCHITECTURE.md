# 🏗️ octocode-mcp Architecture

MCP Server for GitHub code research AND local filesystem exploration with security-first design.

## 📁 Package Structure

```
packages/octocode-mcp/
├── src/
│   ├── index.ts              ← MCP Server entry point
│   ├── serverConfig.ts       ← Configuration & token management
│   ├── session.ts            ← Session tracking & logging
│   ├── types.ts              ← Core TypeScript types
│   ├── errorCodes.ts         ← Structured error definitions
│   ├── responses.ts          ← YAML response formatting
│   │
│   ├── github/               ← GitHub API Integration Layer
│   │   ├── client.ts         ← Octokit client with throttling
│   │   ├── codeSearch.ts     ← Code search API + filtering
│   │   ├── repoSearch.ts     ← Repository search API
│   │   ├── pullRequestSearch.ts ← PR search API (883 lines!)
│   │   ├── fileOperations.ts ← File content & structure
│   │   ├── queryBuilders.ts  ← Search query construction
│   │   └── errors.ts         ← GitHub error handling
│   │
│   ├── tools/                ← MCP Tool Implementations (11 tools)
│   │   ├── toolConfig.ts     ← Tool registry & defaults
│   │   ├── toolsManager.ts   ← Tool registration logic
│   │   ├── toolMetadata.ts   ← Descriptions, schemas & hints proxy
│   │   ├── utils.ts          ← Shared tool utilities (GitHub)
│   │   ├── hints.ts          ← Context-aware hints (Local)
│   │   │
│   │   ├── github_search_code.ts        ← GitHub code search
│   │   ├── github_fetch_content.ts      ← GitHub file content
│   │   ├── github_search_repos.ts       ← GitHub repo search
│   │   ├── github_search_pull_requests.ts ← GitHub PR search
│   │   ├── github_view_repo_structure.ts  ← GitHub repo structure
│   │   │
│   │   ├── local_ripgrep.ts      ← Local code search (ripgrep)
│   │   ├── local_fetch_content.ts ← Local file content
│   │   ├── local_find_files.ts   ← Local file finder
│   │   ├── local_view_structure.ts ← Local directory structure
│   │   │
│   │   └── package_search.ts     ← NPM/Python package search
│   │
│   ├── commands/             ← CLI Command Builders (Local Tools)
│   │   ├── BaseCommandBuilder.ts   ← Abstract base class
│   │   ├── RipgrepCommandBuilder.ts ← rg command construction
│   │   ├── FindCommandBuilder.ts   ← find command construction
│   │   └── LsCommandBuilder.ts     ← ls command construction
│   │
│   ├── scheme/               ← Zod Validation Schemas (12 schemas)
│   │   ├── baseSchema.ts           ← Shared schema utilities
│   │   ├── responsePriority.ts     ← YAML key ordering
│   │   ├── github_*.ts             ← GitHub tool schemas
│   │   ├── local_*.ts              ← Local tool schemas
│   │   └── package_search.ts       ← Package tool schema
│   │
│   ├── security/             ← Security Layer (10 modules)
│   │   ├── withSecurityValidation.ts   ← Tool handler wrapper
│   │   ├── contentSanitizer.ts         ← I/O sanitization
│   │   ├── commandValidator.ts         ← CLI command validation
│   │   ├── executionContextValidator.ts ← CWD validation
│   │   ├── pathValidator.ts            ← Path traversal prevention
│   │   ├── ignoredPathFilter.ts        ← .gitignore-like filtering
│   │   ├── regexes.ts                  ← Secret detection patterns
│   │   ├── patternsConstants.ts        ← Pattern definitions
│   │   ├── securityConstants.ts        ← Security limits
│   │   └── mask.ts                     ← Data masking utilities
│   │
│   ├── utils/                ← Shared Utilities (24+ modules)
│   │   ├── bulkOperations.ts     ← Parallel query execution
│   │   ├── promiseUtils.ts       ← Error isolation & retries
│   │   ├── cache.ts              ← Response caching
│   │   ├── constants.ts          ← Resource limits
│   │   ├── fetchWithRetries.ts   ← HTTP retry logic
│   │   ├── fileFilters.ts        ← File ignore patterns
│   │   ├── types.ts              ← Local tool types
│   │   │
│   │   ├── exec/                 ← Command Execution (Shared)
│   │   │   ├── base.ts           ← spawnWithTimeout core
│   │   │   └── index.ts          ← npm/gh CLI helpers
│   │   │
│   │   ├── exec.ts               ← Legacy exec exports
│   │   │
│   │   ├── local/utils/          ← Local Tool Utilities
│   │   │   ├── exec.ts           ← safeExec with validation
│   │   │   ├── pagination.ts     ← Char & entity pagination
│   │   │   ├── fileSize.ts       ← Human-readable sizes
│   │   │   └── toolHelpers.ts    ← Error & validation helpers
│   │   │
│   │   ├── minifier/             ← Content Minification
│   │   │   ├── index.ts          ← Async minifier
│   │   │   ├── minifierSync.ts   ← Sync minifier
│   │   │   └── jsonToYamlString.ts ← YAML conversion
│   │   │
│   │   ├── package.ts            ← Package search orchestrator
│   │   ├── npmPackage.ts         ← NPM registry API
│   │   └── pythonPackage.ts      ← PyPI registry API
│   │
│   ├── types/                ← Additional Type Definitions
│   │   ├── metadata.ts       ← Tool metadata types
│   │   └── markdown.d.ts     ← Markdown module declaration
│   │
│   └── prompts/              ← MCP Prompts
│       └── prompts.ts        ← Prompt definitions
│
└── tests/                    ← Comprehensive Test Suite (2490 tests)
    ├── tools/                ← Tool layer tests
    ├── github/               ← GitHub API tests
    ├── security/             ← Security layer tests
    ├── utils/                ← Utility tests
    ├── scheme/               ← Schema validation tests
    └── commands/             ← Command builder tests
```

---

## 🔄 Data Flow

### GitHub Tools Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Client Request                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  index.ts → StdioServerTransport → McpServer                        │
│  • Receives tool invocation                                         │
│  • Routes to registered tool handler                                │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  withSecurityValidation() wrapper                                   │
│  • ContentSanitizer.validateInputParameters()                       │
│  • Blocks prototype pollution (__proto__, constructor)              │
│  • Enforces size limits (10K chars, 100 array items)                │
│  • Sanitizes nested objects recursively                             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Tool Handler (e.g., github_search_code.ts)                         │
│  • Uses shared utils: handleApiError, createSuccessResult           │
│  • Calls executeBulkOperation() for parallel processing             │
│  • Delegates to GitHub API layer                                    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  executeBulkOperation() (utils/bulkOperations.ts)                   │
│  • Parallel query execution with error isolation                    │
│  • 60s timeout, 3 concurrent requests                               │
│  • Aggregates results with status hints                             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub API Layer (github/*.ts)                                     │
│  • getOctokit() with throttling                                     │
│  • Query building (queryBuilders.ts)                                │
│  • File filtering (shouldIgnoreFile)                                │
│  • Error handling (errors.ts)                                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Response Processing                                                │
│  • ContentSanitizer.sanitizeContent() (secrets)                     │
│  • minifyContent() (token efficiency)                               │
│  • createResponseFormat() → YAML output                             │
│  • Dynamic hints based on results                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Local Tools Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Client Request                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  toolsManager.ts → registerLocalToolsDirectly()                     │
│  • Registered when ENABLE_LOCAL=true                                │
│  • Direct registration without withSecurityValidation               │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  executeBulkOperation() wrapper                                     │
│  • Same parallel execution as GitHub tools                          │
│  • Error isolation per query                                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Local Tool Implementation (e.g., local_ripgrep.ts)                 │
│  • validateToolPath() - path security                               │
│  • Command builder pattern (RipgrepCommandBuilder)                  │
│  • safeExec() for command execution                                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Security Validation Stack                                          │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  pathValidator.validate()                                  │     │
│  │  • No path traversal (../)                                 │     │
│  │  • No absolute paths outside workspace                     │     │
│  │  • No symlink attacks                                      │     │
│  └───────────────────────────────────────────────────────────┘     │
│                            │                                        │
│                            ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  commandValidator.validateCommand()                        │     │
│  │  • Allowlist: rg, ls, find                                 │     │
│  │  • Argument validation                                     │     │
│  │  • No shell injection                                      │     │
│  └───────────────────────────────────────────────────────────┘     │
│                            │                                        │
│                            ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  executionContextValidator.validateExecutionContext()      │     │
│  │  • CWD must be within workspace                           │     │
│  │  • No system directory access                              │     │
│  └───────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  spawnWithTimeout() (utils/exec/base.ts)                            │
│  • 30s default timeout                                              │
│  • 10MB max output size                                             │
│  • NODE_OPTIONS removal                                             │
│  • Proper signal handling (SIGTERM/SIGKILL)                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Result Processing                                                  │
│  • Pagination (char-based + entity-based)                           │
│  • Context-aware hints (hints.ts)                                   │
│  • Structured output format                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tool Registration Patterns

### Pattern 1: GitHub Tools (with Security Wrapper)

```typescript
// github_search_code.ts
export function registerGitHubSearchCodeTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema,
      annotations: {
        title: 'GitHub Code Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,  // ← Network access
      },
    },
    withSecurityValidation(  // ← Security wrapper
      TOOL_NAMES.GITHUB_SEARCH_CODE,
      async (args, authInfo, sessionId) => {
        return searchMultipleGitHubCode(args.queries, authInfo, sessionId);
      }
    )
  );
}
```

### Pattern 2: Local Tools (Direct Registration)

```typescript
// toolsManager.ts
server.registerTool(
  LOCAL_TOOL_NAMES.LOCAL_RIPGREP,
  {
    description: LOCAL_RIPGREP_DESCRIPTION,
    inputSchema: BulkRipgrepQuerySchema,
    annotations: {
      title: 'Local Ripgrep Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,  // ← Local only
    },
  },
  async (args: { queries: RipgrepQuery[] }): Promise<CallToolResult> => {
    return executeBulkOperation(
      args.queries || [],
      async (query: RipgrepQuery) => searchContentRipgrep(query),
      { toolName: LOCAL_TOOL_NAMES.LOCAL_RIPGREP }
    );
  }
);
```

---

## 🔐 Security Layer

### Input Validation (`ContentSanitizer.validateInputParameters`)

| Check | Action |
|-------|--------|
| Invalid params | Return `isValid: false` |
| Prototype pollution | Block `__proto__`, `constructor`, `prototype` |
| String > 10K chars | Truncate |
| Array > 100 items | Slice |
| Nested objects | Recursive validation |

### Output Sanitization (`ContentSanitizer.sanitizeContent`)

| Pattern Type | Examples |
|--------------|----------|
| API Keys | AWS, GitHub, Stripe, Google, Azure |
| Tokens | JWT, OAuth, session, bearer tokens |
| Credentials | Passwords, connection strings, DSNs |
| Secrets | Private keys, certificates, RSA keys |
| Database | MongoDB URIs, Redis URLs, SQL creds |

Detected secrets replaced with `[REDACTED-PATTERN_NAME]`.

### Local Tool Security Stack

| Layer | Module | Protection |
|-------|--------|------------|
| Path | `pathValidator.ts` | No traversal, symlink protection |
| Command | `commandValidator.ts` | Allowlist (rg, ls, find), arg validation |
| Context | `executionContextValidator.ts` | Workspace-only execution |
| Execution | `exec/base.ts` | Timeout, output limits, env sanitization |

---

## 📊 All 11 Tools

### GitHub Tools (6)

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `githubSearchCode` | Search code across GitHub | Keywords, path/file match, extensions |
| `githubGetFileContent` | Fetch file content | Line ranges, matchString, pagination |
| `githubSearchRepositories` | Find repositories | Topics, keywords, stars filter |
| `githubSearchPullRequests` | Search PRs | State, author, labels, diff content |
| `githubViewRepoStructure` | Browse repo tree | Depth control, auto-filtering |
| `packageSearch` | NPM/PyPI lookup | Deprecation check, repo URL extraction |

### Local Tools (4) - Requires `ENABLE_LOCAL=true`

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `localSearchCode` | ripgrep search | Regex, file types, context lines |
| `localGetFileContent` | Read local files | matchString, minification, pagination |
| `localFindFiles` | Find by metadata | Time, size, permissions, name patterns |
| `localViewStructure` | Directory listing | Recursive, sorting, extensions filter |

---

## ⚙️ Configuration Options

Environment variables handled in `serverConfig.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_API_URL` | `https://api.github.com` | GitHub API endpoint |
| `GITHUB_TOKEN` | - | GitHub authentication token |
| `ENABLE_LOCAL` | `false` | Enable local filesystem tools |
| `WORKSPACE_ROOT` | `process.cwd()` | Root for local tool operations |
| `TOOLS_TO_RUN` | - | Exclusive tool whitelist |
| `ENABLE_TOOLS` | - | Additional tools to enable |
| `DISABLE_TOOLS` | - | Tools to disable |
| `REQUEST_TIMEOUT` | `30000` | Request timeout in ms |
| `MAX_RETRIES` | `3` | Maximum retry attempts |
| `LOG` | `true` | Enable session logging |

### Token Resolution Order

1. GitHub CLI (`gh auth token`)
2. `GITHUB_TOKEN` environment variable

---

## 📊 Key Types

```typescript
// Query status for all results
type QueryStatus = 'hasResults' | 'empty' | 'error';

// Base structure for all tool results
interface ToolResult {
  status: QueryStatus;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  hints?: string[];
}

// Bulk operation response (all tools)
interface ToolResponse {
  instructions: string;
  results: FlatQueryResult[];
  hasResultsStatusHints: string[];
  emptyStatusHints: string[];
  errorStatusHints: string[];
}

// Pagination (local tools)
interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  charOffset?: number;
  charLength?: number;
  totalChars?: number;
}
```

---

## 🧪 Test Coverage

**2490 tests across 118 test files**

| Area | Files | Coverage |
|------|-------|----------|
| Tools | 33 files | Tool layer integration |
| GitHub | 19 files | API layer & filtering |
| Security | 14 files | All security modules |
| Utils | 29 files | Shared utilities |
| Schemes | 4 files | Schema validation |
| Commands | 3 files | CLI builders |
| Core | 10+ files | Server, session, prompts |

---

## 📌 Design Principles

1. **Unified Security** - All GitHub tools use `withSecurityValidation()`, all local tools use triple validation (path, command, context)
2. **Bulk Operations** - All tools support `queries[]` array for batch processing with error isolation
3. **Consistent Response Format** - All results include `status`, `hints[]`, and research fields
4. **Token Efficiency** - YAML output format, content minification, smart pagination
5. **Output Sanitization** - 1000+ regex patterns for secret detection
6. **Defense in Depth** - Multiple validation layers, fail-safe defaults

---

## 🎯 Quality Metrics

- **Test Coverage**: 90%+ (enforced by vitest config)
- **TypeScript**: Strict mode, no `any` types
- **Linting**: ESLint with strict rules
- **Architecture**: Clean separation of concerns

---

## 🔗 Related

- [Configuration Guide](../../docs/CONFIGURATION.md)
- [Authentication Guide](../../docs/AUTH_GUIDE.md)
- [Root AGENTS.md](../../AGENTS.md)

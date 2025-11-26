# 🏗️ octocode-mcp Architecture

MCP Server for GitHub code research with security-first design.

## 📁 Package Structure

```
packages/octocode-mcp/
├── src/
│   ├── index.ts              ← MCP Server entry point
│   ├── serverConfig.ts       ← Configuration & token management
│   ├── session.ts            ← Session tracking & logging
│   ├── types.ts              ← 580+ lines of TypeScript types
│   ├── errorCodes.ts         ← Structured error definitions
│   ├── responses.ts          ← Response formatting utilities
│   │
│   ├── github/               ← GitHub API Integration Layer
│   │   ├── client.ts         ← Octokit client setup
│   │   ├── codeSearch.ts     ← Code search API
│   │   ├── repoSearch.ts     ← Repository search API
│   │   ├── pullRequestSearch.ts ← PR search API
│   │   ├── fileOperations.ts ← File content & structure
│   │   ├── queryBuilders.ts  ← Search query construction
│   │   └── errors.ts         ← GitHub error handling
│   │
│   ├── tools/                ← MCP Tool Implementations
│   │   ├── toolConfig.ts     ← Tool registry & defaults
│   │   ├── toolsManager.ts   ← Tool registration logic
│   │   ├── toolMetadata.ts   ← Descriptions & schemas
│   │   ├── github_search_code.ts
│   │   ├── github_fetch_content.ts
│   │   ├── github_search_repos.ts
│   │   ├── github_search_pull_requests.ts
│   │   └── github_view_repo_structure.ts
│   │
│   ├── scheme/               ← Zod Validation Schemas
│   │   ├── baseSchema.ts     ← Shared schema utilities
│   │   └── github_*.ts       ← Per-tool schemas
│   │
│   ├── security/             ← Security Layer
│   │   ├── withSecurityValidation.ts ← Validation wrapper
│   │   ├── contentSanitizer.ts ← Input/output sanitization
│   │   ├── regexes.ts        ← Secret detection patterns
│   │   └── mask.ts           ← Data masking utilities
│   │
│   └── utils/                ← Shared Utilities
│       ├── bulkOperations.ts ← Batch query execution
│       ├── cache.ts          ← Response caching
│       ├── fetchWithRetries.ts ← Retry logic
│       └── logger.ts         ← MCP logging
│
└── tests/                    ← Comprehensive test suite
```

---

## 🔄 Data Flow

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
│  • Receives sanitized args                                          │
│  • Calls executeBulkOperation() for batch processing                │
│  • Delegates to GitHub API layer                                    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub API Layer (github/*.ts)                                     │
│  • getOctokit() with throttling                                     │
│  • Query building (queryBuilders.ts)                                │
│  • Error handling (errors.ts)                                       │
│  • File filtering (shouldIgnoreFile)                                │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Response Processing                                                │
│  • ContentSanitizer.sanitizeContent() (output)                      │
│  • Secret detection via regexes.ts patterns                         │
│  • [REDACTED-*] replacement for secrets                             │
│  • Result formatting with hints                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tool Registration Pattern

All 5 tools follow the same pattern:

```typescript
// toolConfig.ts - Tool definition
export const GITHUB_SEARCH_CODE: ToolConfig = {
  name: 'githubSearchCode',
  description: getDescription('githubSearchCode'),
  isDefault: true,
  type: 'search',
  fn: registerGitHubSearchCodeTool,
};

// github_search_code.ts - Tool implementation
export function registerGitHubSearchCodeTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
      inputSchema: GitHubCodeSearchBulkQuerySchema,  // Zod schema
      annotations: { readOnlyHint: true, ... },
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
| API Keys | AWS, GitHub, Stripe, etc. |
| Tokens | JWT, OAuth, session tokens |
| Credentials | Passwords, connection strings |
| Secrets | Private keys, certificates |

Detected secrets are replaced with `[REDACTED-PATTERN_NAME]`.

---

## ⚙️ Configuration Options

Environment variables handled in `serverConfig.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_API_URL` | `https://api.github.com` | GitHub API endpoint |
| `GITHUB_TOKEN` | - | GitHub authentication token |
| `TOOLS_TO_RUN` | - | Exclusive tool whitelist (comma-separated) |
| `ENABLE_TOOLS` | - | Additional tools to enable |
| `DISABLE_TOOLS` | - | Tools to disable |
| `BETA` | `false` | Enable beta features |
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

// Code search query
interface GitHubCodeSearchQuery {
  keywordsToSearch: string[];
  owner?: string;
  repo?: string;
  extension?: string;
  path?: string;
  match?: 'file' | 'path';
  limit?: number;
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
}
```

---

## 🧪 Test Coverage

| Area | Location |
|------|----------|
| Tools | `tests/tools/` (26 files) |
| Utils | `tests/utils/` (18 files) |
| Security | `tests/security/` (6 files) |
| GitHub | `tests/github/` (12 files) |
| Core | `tests/index.*.ts`, `tests/session.*.ts` |

---

## 📌 Design Principles

1. **Unified Security** - All tools use `withSecurityValidation()` wrapper
2. **Bulk Operations** - All tools support `queries[]` array for batch processing
3. **Consistent Response Format** - All results include `status`, `hints[]`, and research fields
4. **Token Flexibility** - Supports both `gh` CLI and env var token sources
5. **Output Sanitization** - 1000+ regex patterns for secret detection

---

## 🔗 Related

- [Configuration Guide](../../docs/CONFIGURATION.md)
- [Authentication Guide](../../docs/AUTH_GUIDE.md)


# Octocode MCP Server Architecture

> Technical architecture documentation for the `octocode-mcp` Model Context Protocol server.

## Overview

Octocode MCP is a **Model Context Protocol (MCP)** server that provides AI agents with powerful code research capabilities. It offers tools for:

- **GitHub API integration** — Search code, repositories, PRs, and fetch file contents
- **Local filesystem exploration** — Search, browse, and read local codebases
- **LSP-powered code intelligence** — Go to definition, find references, call hierarchy

The server communicates via **stdio transport** and outputs **YAML-formatted responses** optimized for LLM consumption.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI Agent (Client)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ MCP Protocol (stdio)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Octocode MCP Server                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Entry Point (index.ts)                          ││
│  │  • Server initialization    • Tool registration    • Graceful shutdown  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                       │
│  ┌───────────────────────────────────┼───────────────────────────────────┐  │
│  │                        Security Layer                                  │  │
│  │  • Input validation    • Path security    • Sensitive data masking    │  │
│  └───────────────────────────────────┼───────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────┴───────────────────────────────────┐  │
│  │                          Tools Manager                                 │  │
│  │               13 Tools • Bulk Operations • Hints System                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│          │                    │                    │                         │
│          ▼                    ▼                    ▼                         │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────┐               │
│  │   GitHub     │   │      Local       │   │      LSP       │               │
│  │   Module     │   │     Module       │   │    Module      │               │
│  │              │   │                  │   │                │               │
│  │ • Octokit    │   │ • Ripgrep        │   │ • TS Server    │               │
│  │ • Throttling │   │ • Find           │   │ • Definitions  │               │
│  │ • GraphQL    │   │ • File reads     │   │ • References   │               │
│  └──────────────┘   └──────────────────┘   └────────────────┘               │
│          │                    │                    │                         │
│          └────────────────────┴────────────────────┘                         │
│                               │                                              │
│  ┌────────────────────────────┴────────────────────────────────────────────┐│
│  │                        Response Formatting                               ││
│  │   • YAML output    • Bulk responses    • Hints injection    • Minify    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌──────────┐      ┌──────────┐      ┌──────────┐
             │ GitHub   │      │ Local    │      │ Language │
             │ API      │      │ Filesystem│     │ Servers  │
             └──────────┘      └──────────┘      └──────────┘
```

## Directory Structure

```
src/
├── index.ts                    # Server entry point
├── serverConfig.ts             # Configuration & token resolution
├── session.ts                  # Session management & telemetry
├── types.ts                    # Core TypeScript types
├── errorCodes.ts               # Centralized error definitions
├── responses.ts                # Response formatting utilities
├── public.ts                   # Public API exports
│
├── tools/                      # Tool implementations
│   ├── toolsManager.ts         # Tool registration orchestrator
│   ├── toolConfig.ts           # Tool definitions & metadata
│   ├── toolMetadata.ts         # Schema & hints from API
│   ├── toolNames.ts            # Static tool name constants
│   ├── utils.ts                # Tool utilities
│   │
│   ├── github_*/               # GitHub API tools
│   │   ├── github_search_code/
│   │   ├── github_fetch_content/
│   │   ├── github_view_repo_structure/
│   │   ├── github_search_repos/
│   │   └── github_search_pull_requests/
│   │
│   ├── local_*/                # Local filesystem tools
│   │   ├── local_ripgrep/
│   │   ├── local_view_structure/
│   │   ├── local_find_files/
│   │   └── local_fetch_content/
│   │
│   ├── lsp_*/                  # LSP tools
│   │   ├── lsp_goto_definition/
│   │   ├── lsp_find_references/
│   │   └── lsp_call_hierarchy/
│   │
│   └── package_search/         # NPM/PyPI package search
│
├── github/                     # GitHub API layer
│   ├── index.ts                # Module exports
│   ├── client.ts               # Octokit client with throttling
│   ├── githubAPI.ts            # Core API functions
│   ├── codeSearch.ts           # Code search implementation
│   ├── repoSearch.ts           # Repository search
│   ├── pullRequestSearch.ts    # PR search
│   ├── fileContent.ts          # File content fetching
│   ├── repoStructure.ts        # Repository tree traversal
│   ├── queryBuilders.ts        # Search query construction
│   ├── errors.ts               # GitHub-specific errors
│   └── errorConstants.ts       # Error code definitions
│
├── lsp/                        # Language Server Protocol
│   ├── index.ts                # Module exports
│   ├── client.ts               # LSP client implementation
│   ├── manager.ts              # Client lifecycle management
│   ├── config.ts               # Language server configuration
│   ├── resolver.ts             # Symbol resolution
│   ├── symbols.ts              # Symbol kind mapping
│   ├── types.ts                # LSP type definitions
│   ├── uri.ts                  # URI utilities
│   └── validation.ts           # Server path validation
│
├── security/                   # Security layer
│   ├── withSecurityValidation.ts  # Tool handler wrapper
│   ├── contentSanitizer.ts        # Content sanitization
│   ├── pathValidator.ts           # Path traversal prevention
│   ├── commandValidator.ts        # Shell command validation
│   ├── ignoredPathFilter.ts       # Gitignore filtering
│   ├── mask.ts                    # Sensitive data masking
│   ├── regexes.ts                 # Secret detection patterns
│   ├── patternsConstants.ts       # Security patterns
│   ├── securityConstants.ts       # Security constants
│   └── executionContextValidator.ts # Context validation
│
├── hints/                      # Hint system
│   ├── index.ts                # Hint aggregation
│   ├── static.ts               # Static hints from metadata
│   ├── dynamic.ts              # Context-aware dynamic hints
│   ├── localBaseHints.ts       # Local tool base hints
│   └── types.ts                # Hint type definitions
│
├── commands/                   # Shell command builders
│   ├── BaseCommandBuilder.ts   # Abstract command builder
│   ├── RipgrepCommandBuilder.ts # ripgrep commands
│   ├── GrepCommandBuilder.ts   # grep commands
│   ├── FindCommandBuilder.ts   # find commands
│   └── LsCommandBuilder.ts     # ls commands
│
├── prompts/                    # MCP prompts
│   └── prompts.ts              # Prompt registration
│
├── scheme/                     # Base schemas
│   └── baseSchema.ts           # Shared Zod schemas
│
├── types/                      # Type definitions
│   ├── metadata.ts             # Metadata types
│   ├── toolTypes.ts            # Tool-specific types
│   └── markdown.d.ts           # Markdown type declarations
│
└── utils/                      # Utility modules
    ├── core/                   # Core utilities
    │   ├── constants.ts        # Shared constants
    │   ├── logger.ts           # MCP logging
    │   ├── promise.ts          # Promise utilities
    │   └── types.ts            # Core types
    ├── credentials/            # Token utilities
    ├── environment/            # Environment detection
    ├── exec/                   # Command execution
    │   ├── commandAvailability.ts
    │   ├── safe.ts             # Safe execution
    │   ├── spawn.ts            # Process spawning
    │   └── npm.ts              # NPM utilities
    ├── file/                   # File utilities
    │   ├── byteOffset.ts       # Byte offset calculations
    │   ├── filters.ts          # File filtering
    │   ├── size.ts             # Size utilities
    │   └── toolHelpers.ts      # Tool helpers
    ├── http/                   # HTTP utilities
    │   ├── cache.ts            # Response caching
    │   └── fetch.ts            # Fetch with retries
    ├── minifier/               # Output optimization
    │   ├── minifier.ts         # Content minification
    │   └── jsonToYamlString.ts # JSON to YAML
    ├── package/                # Package search
    │   ├── npm.ts              # NPM registry
    │   └── python.ts           # PyPI registry
    ├── pagination/             # Pagination utilities
    │   ├── core.ts             # Pagination logic
    │   ├── hints.ts            # Pagination hints
    │   └── types.ts            # Pagination types
    ├── parsers/                # Output parsers
    │   ├── diff.ts             # Diff parsing
    │   └── ripgrep.ts          # Ripgrep output parsing
    └── response/               # Response utilities
        ├── bulk.ts             # Bulk operation handling
        └── error.ts            # Error formatting
```

## Core Components

### 1. Server Initialization (`index.ts`)

The entry point orchestrates:

1. **Configuration initialization** — Load environment variables, resolve GitHub token
2. **Tool metadata loading** — Fetch tool schemas and hints from API
3. **Session initialization** — Create session for telemetry
4. **MCP server creation** — Instantiate `McpServer` with capabilities
5. **Tool registration** — Register all enabled tools
6. **Transport connection** — Connect stdio transport
7. **Graceful shutdown** — Handle SIGINT/SIGTERM, cleanup resources

```typescript
// Simplified flow
async function startServer() {
  await initialize();                    // Config + token
  const content = await loadToolContent(); // Metadata from API
  const session = initializeSession();   // Telemetry
  const server = new McpServer(config);
  await registerAllTools(server, content);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 2. Configuration (`serverConfig.ts`)

Manages server configuration with multi-source token resolution:

| Token Source | Priority | Environment Variable |
|-------------|----------|---------------------|
| `env:OCTOCODE_TOKEN` | 1 | `OCTOCODE_TOKEN` |
| `env:GH_TOKEN` | 2 | `GH_TOKEN` |
| `env:GITHUB_TOKEN` | 3 | `GITHUB_TOKEN` |
| `gh-cli` | 4 | (via `gh auth token`) |
| `octocode-storage` | 5 | (keychain/file) |

**Key Configuration Options:**

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_LOCAL` / `LOCAL` | Enable local filesystem tools | `false` |
| `TOOLS_TO_RUN` | Whitelist specific tools | All tools |
| `ENABLE_TOOLS` | Enable additional tools | — |
| `DISABLE_TOOLS` | Disable specific tools | — |
| `LOG` | Enable session telemetry | `true` |
| `REQUEST_TIMEOUT` | API timeout (ms) | `30000` |
| `MAX_RETRIES` | API retry count | `3` |

### 3. Tools System

#### Tool Structure

Each tool follows a consistent pattern:

```
tools/<tool_name>/
├── index.ts           # Re-exports
├── scheme.ts          # Zod schema definition
├── execution.ts       # Query processing logic
└── <tool_name>.ts     # Registration function
```

#### Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **GitHub** | `githubSearchCode`, `githubGetFileContent`, `githubViewRepoStructure`, `githubSearchRepositories`, `githubSearchPullRequests` | GitHub API integration |
| **Local** | `localSearchCode`, `localGetFileContent`, `localViewStructure`, `localFindFiles` | Local filesystem tools |
| **LSP** | `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy` | Code intelligence |
| **Package** | `packageSearch` | NPM/PyPI lookup |

#### Tool Registration Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ toolConfig   │────▶│ toolsManager    │────▶│ McpServer        │
│              │     │                 │     │ .tool()          │
│ ALL_TOOLS[]  │     │ registerTools() │     │                  │
└──────────────┘     └─────────────────┘     └──────────────────┘
       │                     │
       ▼                     ▼
┌──────────────┐     ┌─────────────────┐
│ Tool config  │     │ Filter enabled  │
│ • name       │     │ • isDefault     │
│ • isDefault  │     │ • isLocal       │
│ • isLocal    │     │ • ENABLE_TOOLS  │
│ • fn()       │     │ • DISABLE_TOOLS │
└──────────────┘     └─────────────────┘
```

### 4. Security Layer

All tool inputs pass through security validation:

```
┌─────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│ Tool Args   │────▶│ withSecurityValidation  │────▶│ Tool Handler │
└─────────────┘     └─────────────────────────┘     └──────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
          ┌─────────────────┐  ┌─────────────────┐
          │ ContentSanitizer│  │ Session Logging │
          │ • validateInput │  │ • logToolCall   │
          │ • sanitize      │  │ • extractRepos  │
          └─────────────────┘  └─────────────────┘
```

**Security Components:**

| Component | Purpose |
|-----------|---------|
| `ContentSanitizer` | Validate and sanitize input parameters |
| `pathValidator` | Prevent path traversal attacks |
| `commandValidator` | Validate shell commands |
| `ignoredPathFilter` | Respect `.gitignore` patterns |
| `mask` | Mask sensitive data in outputs |
| `regexes` | Detect secrets (API keys, tokens, etc.) |

### 5. GitHub Module

Provides GitHub API integration via Octokit:

```typescript
// Client with built-in throttling
const octokit = getOctokit(token);

// API functions
searchGitHubCodeAPI(query)
searchGitHubReposAPI(query)
searchGitHubPullRequestsAPI(query)
fetchGitHubFileContentAPI(owner, repo, path, branch)
viewGitHubRepositoryStructureAPI(owner, repo, branch, path)
```

**Features:**
- Automatic rate limit handling with throttling
- GraphQL for efficient file content fetching
- Search query builders with proper escaping
- Structured error handling with specific codes

### 6. LSP Module

Provides Language Server Protocol integration:

```typescript
// Get or create LSP client for a file
const client = await getOrCreateClient(filePath);

// Symbol operations
await client.gotoDefinition(uri, position);
await client.findReferences(uri, position);
await client.callHierarchy(uri, position, direction);
```

**Supported Language Servers:**

| Language | Server | Install Method |
|----------|--------|----------------|
| TypeScript/JavaScript | `typescript-language-server` | `npm install -g` |
| Python | `pylsp` | `pip install` |
| (Extensible) | User config | `~/.config/octocode/lsp.json` |

### 7. Hints System

Provides contextual guidance to AI agents:

```typescript
// Get hints for a tool result
const hints = getHints(toolName, status, context);

// Hint types
- Static hints: From tool metadata
- Dynamic hints: Based on result context (pagination, large files, etc.)
```

**Hint Categories:**

| Status | Purpose |
|--------|---------|
| `hasResults` | Guide on processing results |
| `empty` | Suggest alternative approaches |
| `error` | Recovery strategies |

### 8. Response Formatting

All responses are formatted as YAML for optimal LLM parsing:

```yaml
instructions: "Bulk response with 3 results..."
results:
  - id: 1
    status: hasResults
    data:
      path: "src/index.ts"
      content: "..."
    researchGoal: "Find main entry point"
hasResultsStatusHints:
  - "Use lspGotoDefinition for symbol navigation"
```

**Bulk Operations:**
- Process multiple queries in parallel
- Error isolation (one failure doesn't stop others)
- Aggregated hints by status type

## Data Flow

### Tool Execution Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Client sends tool_call request via MCP                            │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Security validation (withSecurityValidation)                       │
│    • Validate input parameters                                        │
│    • Sanitize content                                                 │
│    • Log tool call to session                                         │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. Bulk operation processing (if multiple queries)                    │
│    • Execute queries in parallel (concurrency: 3)                     │
│    • Isolate errors per query                                         │
│    • Timeout handling (60s)                                           │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Tool-specific execution                                            │
│    • GitHub: API call via Octokit                                     │
│    • Local: Shell command via spawn                                   │
│    • LSP: Protocol message to language server                         │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Response formatting                                                │
│    • Structure data                                                   │
│    • Add pagination info                                              │
│    • Inject hints based on status                                     │
│    • Convert to YAML                                                  │
│    • Mask sensitive data                                              │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Return CallToolResult to client                                    │
└──────────────────────────────────────────────────────────────────────┘
```

## Configuration & Extensibility

### Environment Variables

```bash
# Token Configuration
OCTOCODE_TOKEN=ghp_xxx        # Preferred token
GH_TOKEN=ghp_xxx              # Fallback 1
GITHUB_TOKEN=ghp_xxx          # Fallback 2

# Feature Flags
ENABLE_LOCAL=true             # Enable local tools
LOCAL=true                    # Alias for ENABLE_LOCAL
LOG=true                      # Enable telemetry

# Tool Filtering
TOOLS_TO_RUN=githubSearchCode,localSearchCode  # Whitelist
ENABLE_TOOLS=lspGotoDefinition                 # Enable additional
DISABLE_TOOLS=packageSearch                    # Disable specific

# Performance
REQUEST_TIMEOUT=30000         # API timeout (ms)
MAX_RETRIES=3                 # Retry count

# Advanced
GITHUB_API_URL=https://api.github.com  # Custom API URL
REDACT_ERROR_PATHS=true       # Redact paths in errors
```

### LSP Configuration

Custom language server configuration at `~/.config/octocode/lsp.json`:

```json
{
  "servers": {
    "rust": {
      "command": "rust-analyzer",
      "args": [],
      "languageIds": ["rust"]
    }
  }
}
```

## Error Handling

### Error Code Structure

Errors are organized by category in `errorCodes.ts`:

| Category | Prefix | Example |
|----------|--------|---------|
| Config | `CONFIG_` | `CONFIG_NOT_INITIALIZED` |
| Validation | `VALIDATION_` | `VALIDATION_PROMISES_NOT_ARRAY` |
| Fetch | `FETCH_` | `FETCH_FAILED_AFTER_RETRIES` |
| Tool | `TOOL_` | `TOOL_SECURITY_VALIDATION_FAILED` |
| GitHub | `GITHUB_` | `GITHUB_RATE_LIMITED` |
| LSP | `LSP_` | `LSP_SERVER_NOT_FOUND` |

### Error Recovery

The system provides hints for error recovery:

```yaml
errorStatusHints:
  - "Check API rate limits"
  - "Verify token permissions"
  - "Try narrowing search scope"
```

## Session & Telemetry

### Session Data

```typescript
interface SessionData {
  sessionId: string;
  intent: 'init' | 'error' | 'tool_call' | 'prompt_call' | 'rate_limit';
  data: ToolCallData | ErrorData | RateLimitData;
  timestamp: string;
  version: string;
}
```

### Logged Events

| Event | Data |
|-------|------|
| `init` | Session start |
| `tool_call` | Tool name, repos, research goals |
| `error` | Tool name, error code |
| `rate_limit` | Limit type, retry info |

## Public API

The `public.ts` module exports the public API for programmatic use:

```typescript
import {
  // Metadata
  initializeToolMetadata,
  loadToolContent,
  TOOL_NAMES,
  DESCRIPTIONS,
  
  // Tool registration
  registerTools,
  ALL_TOOLS,
  
  // Hints
  getToolHintsSync,
  getDynamicHints,
  
  // Config
  getTokenSource,
} from 'octocode-mcp';
```

## Dependencies

### Core Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `@octokit/rest` | GitHub REST API |
| `@octokit/graphql` | GitHub GraphQL API |
| `@octokit/plugin-throttling` | Rate limit handling |
| `zod` | Schema validation |
| `axios` | HTTP client for telemetry |

### Shared Package

The server uses `octocode-shared` for:
- Secure credential storage
- Session persistence
- Platform detection

### External Commands

| Command | Tool | Purpose |
|---------|------|---------|
| `rg` (ripgrep) | `localSearchCode` | Fast code search |
| `find` | `localFindFiles` | File discovery |
| `ls` | `localViewStructure` | Directory listing |
| `cat` | `localGetFileContent` | File reading |
| `typescript-language-server` | LSP tools | TypeScript intelligence |

## Performance Considerations

1. **Parallel query execution** — Up to 3 concurrent queries per bulk operation
2. **HTTP caching** — Response caching for repeated requests
3. **Rate limit throttling** — Automatic backoff for GitHub API
4. **LSP client pooling** — Reuse language server connections
5. **Output minification** — Reduce response size for LLM context efficiency
6. **Lazy initialization** — Tool metadata loaded on demand

## Security Model

1. **Input validation** — All parameters validated via Zod schemas
2. **Path traversal prevention** — Paths restricted to workspace
3. **Secret detection** — API keys, tokens filtered from output
4. **Command injection prevention** — Shell commands validated
5. **Sensitive data masking** — Credentials masked in logs/errors
6. **Gitignore respect** — Hidden/ignored files excluded

---

*Last updated: January 2026*

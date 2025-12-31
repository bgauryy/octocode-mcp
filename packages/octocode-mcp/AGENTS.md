# AGENTS.md - Octocode MCP Server

> **Location**: `packages/octocode-mcp/AGENTS.md`

AI agent guidance for the `octocode-mcp` package - Model Context Protocol server for GitHub and local code research.

This file **overrides** the root [`AGENTS.md`](../../AGENTS.md) for work within this package.

---

## Overview

Octocode MCP is an MCP server providing AI agents with code exploration tools:

- **GitHub Research**: Search code, repositories, PRs, view structure, fetch content
- **Local Research**: Search code with ripgrep, browse directories, find files, read content
- **Package Discovery**: Search NPM/PyPI for packages and repository URLs

**Key Docs**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) • [`README.md`](./README.md)

---

## 🛠️ Commands

All commands run from this package directory (`packages/octocode-mcp/`).

| Task | Command | Description |
|------|---------|-------------|
| **Build** | `yarn build` | Lint + clean + bundle with tsdown |
| **Build (Dev)** | `yarn build:dev` | Build without lint |
| **Build (Watch)** | `yarn build:watch` | Watch mode for development |
| **Clean** | `yarn clean` | Remove `dist/` directory |
| **Test** | `yarn test` | Run tests with coverage report |
| **Test (Quiet)** | `yarn test:quiet` | Minimal test output |
| **Test (Watch)** | `yarn test:watch` | Watch mode for tests |
| **Test (UI)** | `yarn test:ui` | Vitest UI dashboard |
| **Lint** | `yarn lint` | ESLint check |
| **Lint (Fix)** | `yarn lint:fix` | Auto-fix linting issues |
| **Format** | `yarn format` | Prettier format `src/` |
| **Format (Check)** | `yarn format:check` | Check formatting |
| **Debug** | `yarn debug` | Run with MCP Inspector |

### Binary Builds (Bun)

| Target | Command |
|--------|---------|
| Current platform | `yarn build:bin` |
| macOS ARM64 | `yarn build:bin:darwin-arm64` |
| macOS x64 | `yarn build:bin:darwin-x64` |
| Linux ARM64 | `yarn build:bin:linux-arm64` |
| Linux x64 | `yarn build:bin:linux-x64` |
| Linux x64 (musl) | `yarn build:bin:linux-x64-musl` |
| Windows x64 | `yarn build:bin:windows-x64` |
| All platforms | `yarn build:bin:all` |

### Desktop Extension (DXT)

| Task | Command |
|------|---------|
| Validate | `yarn dxt:validate` |
| Pack | `yarn dxt:pack` |
| Release | `yarn dxt:release` |

---

## 📂 Package Structure

```
src/
├── index.ts                 # Entry point - server initialization
├── serverConfig.ts          # Configuration & GitHub token management
├── session.ts               # Session tracking & telemetry
├── responses.ts             # Response formatting utilities
├── errorCodes.ts            # Centralized error definitions
├── types.ts                 # Shared TypeScript types
│
├── scheme/                  # 📐 Input validation schemas (Zod)
│   ├── baseSchema.ts        # Common schema patterns & bulk query builder
│   ├── github_*.ts          # GitHub tool schemas (5 files)
│   ├── local_*.ts           # Local tool schemas (4 files)
│   ├── package_search.ts    # Package search schema
│   └── responsePriority.ts  # Response field ordering
│
├── tools/                   # 🔧 Tool implementations
│   ├── toolConfig.ts        # Tool registry & configuration
│   ├── toolMetadata.ts      # Dynamic metadata from API
│   ├── toolNames.ts         # Static tool name constants
│   ├── toolsManager.ts      # Tool registration orchestrator
│   ├── github_*.ts          # GitHub tool implementations (5 files)
│   ├── local_*.ts           # Local tool implementations (4 files)
│   ├── package_search.ts    # Package search implementation
│   ├── utils.ts             # Tool-specific utilities
│   └── hints/               # Dynamic hint generation
│       ├── dynamic.ts       # Context-aware hints
│       ├── static.ts        # Predefined hints
│       └── types.ts         # Hint type definitions
│
├── github/                  # 🐙 GitHub API layer
│   ├── client.ts            # Octokit client with throttling
│   ├── githubAPI.ts         # Core API types & interfaces
│   ├── codeSearch.ts        # Code search operations
│   ├── fileContent.ts       # File content retrieval
│   ├── fileOperations.ts    # File operation utilities
│   ├── repoSearch.ts        # Repository search
│   ├── repoStructure.ts     # Repository tree exploration
│   ├── pullRequestSearch.ts # PR search & diff retrieval
│   ├── queryBuilders.ts     # GitHub search query construction
│   ├── errors.ts            # GitHub error handling
│   └── errorConstants.ts    # GitHub-specific error codes
│
├── security/                # 🔒 Security layer
│   ├── withSecurityValidation.ts  # Security wrapper for tools
│   ├── contentSanitizer.ts  # Secret detection & redaction
│   ├── pathValidator.ts     # Path traversal prevention
│   ├── commandValidator.ts  # Command injection prevention
│   ├── ignoredPathFilter.ts # Sensitive path filtering
│   ├── regexes.ts           # Secret detection patterns (100+)
│   ├── mask.ts              # Data masking utilities
│   ├── patternsConstants.ts # Security pattern definitions
│   └── securityConstants.ts # Security configuration
│
├── commands/                # 🖥️ CLI command builders
│   ├── BaseCommandBuilder.ts    # Abstract command builder
│   ├── RipgrepCommandBuilder.ts # ripgrep (rg) command builder
│   ├── GrepCommandBuilder.ts    # grep fallback builder
│   ├── FindCommandBuilder.ts    # find command builder
│   └── LsCommandBuilder.ts      # ls command builder
│
├── utils/                   # 🛠️ Shared utilities
│   ├── bulkOperations.ts    # Bulk query execution (1-5 queries)
│   ├── cache.ts             # Response caching
│   ├── constants.ts         # Global constants
│   ├── fetchWithRetries.ts  # HTTP fetch with retry logic
│   ├── promiseUtils.ts      # Async utilities
│   ├── logger.ts            # MCP logging integration
│   ├── errorResult.ts       # Error response formatting
│   ├── types.ts             # Utility types
│   ├── exec/                # Command execution
│   │   ├── safe.ts          # Safe command execution
│   │   └── spawn.ts         # Process spawning
│   ├── local/               # Local filesystem utilities
│   ├── minifier/            # Content minification
│   │   ├── minifier.ts      # File-type aware minification
│   │   └── jsonToYamlString.ts # YAML conversion
│   └── pagination/          # Pagination utilities
│
├── prompts/                 # 💬 MCP prompts
│   └── prompts.ts           # Prompt registration
│
└── types/                   # 📝 Type definitions
    ├── metadata.ts          # Metadata types
    └── markdown.d.ts        # Markdown type declarations
```

### Tests Structure

```
tests/
├── index.*.test.ts          # Server lifecycle tests
├── serverConfig.*.test.ts   # Configuration tests
├── session.*.test.ts        # Session/telemetry tests
├── errorCodes.test.ts       # Error codes tests
├── commands/                # Command builder tests
├── github/                  # GitHub API tests (27 files)
├── security/                # Security tests (15 files)
├── scheme/                  # Schema validation tests
├── tools/                   # Tool implementation tests (42 files)
├── utils/                   # Utility tests (33 files)
├── integration/             # End-to-end tests
├── helpers/                 # Test utilities & mocks
└── fixtures/                # Test fixtures
```

---

## 🧰 Available Tools

| Tool | Type | Local | Description |
|------|------|-------|-------------|
| `githubSearchCode` | search | ❌ | Search code across GitHub |
| `githubGetFileContent` | content | ❌ | Fetch file content from repos |
| `githubViewRepoStructure` | content | ❌ | Browse repository tree |
| `githubSearchRepositories` | search | ❌ | Search GitHub repositories |
| `githubSearchPullRequests` | history | ❌ | Search PRs and view diffs |
| `packageSearch` | search | ❌ | Search NPM/PyPI packages |
| `localSearchCode` | search | ✅ | Search code with ripgrep |
| `localViewStructure` | content | ✅ | Browse local directories |
| `localFindFiles` | search | ✅ | Find files by metadata |
| `localGetFileContent` | content | ✅ | Read local file content |

---

## 📦 Package Guidelines

These are the core principles for this MCP server:

1. **Security First**: Validate all inputs and paths. Sanitize all outputs.
2. **Bulk Operations**: Support 1-5 items per tool call for efficiency (3 for GitHub, 5 for local).
3. **Token Efficiency**: Minimize response size for LLMs via minification and YAML output.
4. **Graceful Degradation**: Always return usable results; never crash. Isolate errors per query.
5. **Research Context**: Every query requires `mainResearchGoal`, `researchGoal`, `reasoning`.

---

## 🏗️ Architecture Patterns

### Tool Registration Flow

```
Schema (Zod) → Security Wrapper → Bulk Handler → Implementation → Sanitizer → Response
```

1. **Schema Validation** (`scheme/*.ts`) - Zod validates inputs
2. **Security Wrapper** (`withSecurityValidation.ts`) - Input sanitization, secret detection
3. **Bulk Operations** (`bulkOperations.ts`) - Parallel query execution (1-5 queries)
4. **Tool Implementation** (`tools/*.ts`) - Business logic, API calls
5. **Content Sanitizer** (`contentSanitizer.ts`) - Output secret redaction
6. **Response Formatting** (`responses.ts`) - YAML output with priority ordering

### Key Design Decisions

- **Bulk Queries**: All tools accept 1-5 queries per request
- **Research Context**: Every query requires `mainResearchGoal`, `researchGoal`, `reasoning`
- **Security First**: All I/O sanitized, secrets redacted, paths validated
- **Graceful Fallback**: `ripgrep → grep`, errors isolated per query
- **Token Efficiency**: Content minification, YAML output, response prioritization

---

## 🛡️ Safety & Permissions

### Package-Level Access

| Path | Access | Description |
|------|--------|-------------|
| `src/` | ✅ FULL | Source code |
| `tests/` | ✅ FULL | Test files |
| `docs/` | ✅ EDIT | Documentation |
| `*.json`, `*.config.*` | ⚠️ ASK | Package configs |
| `dist/`, `coverage/` | ❌ NEVER | Generated files |

### Protected Files

- **Never Modify**: `dist/`, `coverage/`, `node_modules/`
- **Ask Before Modifying**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsdown.config.ts`

---

## 🧪 Testing Protocol

### Requirements

- **Coverage**: 90% required (Statements, Branches, Functions, Lines)
- **Framework**: Vitest with v8 coverage

### Test Categories

| Category | Path | Purpose |
|----------|------|---------|
| Unit | `tests/<module>.test.ts` | Individual function tests |
| Integration | `tests/integration/` | End-to-end tool tests |
| Security | `tests/security/` | Penetration & bypass tests |
| GitHub API | `tests/github/` | API mocking & validation |

### Running Tests

```bash
# Full test suite with coverage
yarn test

# Quick feedback loop
yarn test:quiet

# Development mode
yarn test:watch

# Visual debugging
yarn test:ui
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub personal access token | - |
| `GITHUB_API_URL` | GitHub API base URL | `https://api.github.com` |
| `ENABLE_LOCAL` / `LOCAL` | Enable local filesystem tools | `false` |
| `LOG` | Enable session logging | `true` |
| `REQUEST_TIMEOUT` | API request timeout (ms) | `30000` |
| `MAX_RETRIES` | Maximum retry attempts | `3` |
| `TOOLS_TO_RUN` | Comma-separated tool whitelist | - |
| `ENABLE_TOOLS` | Comma-separated tools to enable | - |
| `DISABLE_TOOLS` | Comma-separated tools to disable | - |

---

## 📚 Key Documentation

| Document | Description |
|----------|-------------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Deep dive into system design, data flows, security |
| [`README.md`](./README.md) | Installation, usage, configuration |
| [`../../AGENTS.md`](../../AGENTS.md) | Root monorepo guidelines |
| [MCP Spec](https://modelcontextprotocol.io/) | Model Context Protocol specification |
| [GitHub REST API](https://docs.github.com/en/rest) | GitHub API reference |

---

## 🔑 Key Files Reference

| Purpose | File(s) |
|---------|---------|
| Entry point | `src/index.ts` |
| Tool registration | `src/tools/toolsManager.ts`, `src/tools/toolConfig.ts` |
| Schema definitions | `src/scheme/*.ts` |
| Security wrapper | `src/security/withSecurityValidation.ts` |
| Secret detection | `src/security/contentSanitizer.ts`, `src/security/regexes.ts` |
| Path validation | `src/security/pathValidator.ts` |
| GitHub client | `src/github/client.ts` |
| Bulk operations | `src/utils/bulkOperations.ts` |
| Response formatting | `src/responses.ts` |
| Error codes | `src/errorCodes.ts` |

---

*Package-level AGENTS.md for octocode-mcp v11.x*


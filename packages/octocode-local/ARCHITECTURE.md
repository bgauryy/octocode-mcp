# Architecture
> High-level architecture of @octocode/local - MCP server for local file system research

## Bird's Eye View

**What**: An MCP (Model Context Protocol) server that provides AI assistants with fast, secure local file system exploration using native Linux commands (`rg`, `ls`, `find`).

**How**: TypeScript + Node.js ≥18, using `@modelcontextprotocol/sdk` for MCP transport, Zod for schema validation, and `spawn()` for safe command execution. Exposes 4 tools: `local_ripgrep`, `local_view_structure`, `local_find_files`, `local_fetch_content`.

**Why**: 
- **Security-first**: Whitelist-only command execution, path validation, symlink attack prevention
- **Token efficiency**: Structured pagination, minification, bulk operations (1-5 queries per call)
- **Progressive refinement**: Discovery → targeted → deep-dive workflow

## Entry Points

- **Main**: `src/index.ts:22` - `main()` function, creates McpServer, registers tools/prompts
- **Tool Registration**: `src/tools/toolsManager.ts:47` - `registerTools()` registers all 4 tools
- **Prompt Registration**: `src/tools/toolsManager.ts:116` - `registerPrompts()` registers AI guidance prompts
- **Path Security**: `src/security/pathValidator.ts:191` - Global `pathValidator` instance

**Start here**: Read `src/index.ts`, then explore `src/tools/toolsManager.ts` for tool registration pattern.

## Code Map

### `/src/tools/`
**Purpose**: Tool implementations - each file is a complete tool handler

**Key files**:
- `toolsManager.ts:47-111` - Tool registration using `server.registerTool()` pattern
- `local_ripgrep.ts:21-231` - Pattern search using ripgrep, returns structured matches with byte offsets
- `local_view_structure.ts` - Directory listing using `ls`, supports pagination and filtering
- `local_find_files.ts` - File discovery using `find`, metadata-based filtering
- `local_fetch_content.ts` - File content extraction with matchString targeting
- `hints.ts` - Context-aware hints for each tool's result status

**Invariants**: 
- All tools MUST use `validateToolPath()` before execution
- All tools MUST return `SearchContentResult | ViewStructureResult | FindFilesResult | FetchContentResult`
- All tools MUST support bulk operations via `executeBulkOperation()`

**API Boundary**: Tools are the public interface; everything else is internal.

### `/src/commands/`
**Purpose**: Safe command builders using the Builder pattern

**Key files**:
- `BaseCommandBuilder.ts:10-74` - Abstract base class with `addFlag()`, `addOption()`, `addEscapedArg()`, `build()`
- `RipgrepCommandBuilder.ts:5-288` - Builds `rg` commands from `RipgrepQuery`
- `FindCommandBuilder.ts` - Builds `find` commands from `FindFilesQuery`
- `LsCommandBuilder.ts` - Builds `ls` commands from `ViewStructureQuery`

**Invariants**:
- All user input MUST go through `addEscapedArg()` (uses `escapeShellArg()`)
- Command builders NEVER execute commands - they only build `{command, args}` tuples

### `/src/security/`
**Purpose**: Multi-layer security - path validation, command validation, execution context

**Key files**:
- `pathValidator.ts:41-191` - `PathValidator` class: validates paths against allowed roots, resolves symlinks
- `commandValidator.ts:12-181` - `validateCommand()`: whitelist check + position-aware arg validation
- `executionContextValidator.ts` - Validates cwd and execution environment
- `ignoredPathFilter.ts:11-82` - Filters sensitive paths (`.git`, `.env`, `.ssh`)
- `securityConstants.ts:12-43` - `ALLOWED_COMMANDS = ['rg', 'ls', 'find']`, `DANGEROUS_PATTERNS`
- `patternsConstants.ts` - Regex patterns for ignored files/paths

**Invariants**:
- ONLY commands in `ALLOWED_COMMANDS` can execute (`src/security/securityConstants.ts:12`)
- Symlinks are ALWAYS resolved before path validation (security requirement)
- Path must be within `allowedRoots` (set via `WORKSPACE_ROOT` env or `process.cwd()`)

### `/src/scheme/`
**Purpose**: Zod schemas for input validation and tool descriptions

**Key files**:
- `baseSchema.ts` - `BaseQuerySchema` with `researchGoal`, `reasoning` fields; `createBulkQuerySchema()`
- `local_ripgrep.ts:38-332` - `RipgrepQuerySchema` with 40+ options, `applyWorkflowMode()`, `validateRipgrepQuery()`
- `local_view_structure.ts` - `ViewStructureQuerySchema` with pagination options
- `local_find_files.ts` - `FindFilesQuerySchema` with metadata filters
- `local_fetch_content.ts` - `FetchContentQuerySchema` with matchString support
- `responsePriority.ts` - Key ordering for YAML response formatting

**Invariants**:
- All tool inputs MUST be validated against Zod schemas before processing
- Bulk schemas wrap single schemas with `queries: z.array(SingleSchema).min(1).max(5)`

### `/src/utils/`
**Purpose**: Shared utilities for execution, pagination, response formatting

**Key files**:
- `exec.ts:14-118` - `safeExec()`: spawns command with validation, timeout, output limits
- `bulkOperations.ts:76-211` - `executeBulkOperation()`: parallel query processing + response formatting
- `pagination.ts` - Character-based and entity-based pagination utilities
- `minifier.ts` - Content minification for token efficiency
- `responses.ts` - `createResponseFormat()` for YAML output
- `tokenValidation.ts` - Validates response size against MCP 25K token limit
- `toolHelpers.ts` - `validateToolPath()`, `createErrorResult()` helpers

**Invariants**:
- `safeExec()` MUST be the only way to execute shell commands
- Responses MUST be validated against token limit before returning

### `/src/errors/`
**Purpose**: Centralized error codes and typed error handling

**Key files**:
- `errorCodes.ts:15-351` - `ERROR_CODES` enum, `ToolError` class, factory functions `ToolErrors.*`

**Invariants**:
- All errors MUST use `ErrorCode` from `ERROR_CODES`
- Error results MUST include `errorCode` field for programmatic handling

### `/src/prompts/`
**Purpose**: AI guidance prompts for tool usage patterns

**Key files**:
- `research_local_explorer.md/ts` - Local exploration workflow

### `/src/constants.ts`
**Purpose**: Centralized configuration values

**Key exports** (`src/constants.ts:4-183`):
- `TOOL_NAMES` - Tool name constants
- `DEFAULTS` - Timeout (30s), max output (10MB), context lines (5)
- `RESOURCE_LIMITS` - Token limits (25K), pagination defaults, file size thresholds
- `SECURITY_DEFAULTS` - Symlink handling configuration

## System Boundaries & Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Transport                            │
│                    (StdioServerTransport)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Registration Layer                     │
│   toolsManager.ts: registerTools() + registerPrompts()          │
│   - Zod schema validation (BulkXxxQuerySchema.parse())         │
│   - Bulk operation wrapper (executeBulkOperation())            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Tool Implementation                       │
│   local_ripgrep.ts, local_view_structure.ts, etc.              │
│   - Path validation (validateToolPath())                       │
│   - Command building (XxxCommandBuilder)                       │
│   - Result formatting (structured output + hints)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Command Execution                          │
│   exec.ts: safeExec() → spawn()                                │
│   - Command validation (validateCommand())                     │
│   - Context validation (validateExecutionContext())            │
│   - Timeout + output size limits                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Security Layer                             │
│   - pathValidator: allowed roots + symlink resolution          │
│   - commandValidator: whitelist + dangerous pattern detection  │
│   - ignoredPathFilter: sensitive file filtering                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OS Commands (rg, ls, find)                  │
└─────────────────────────────────────────────────────────────────┘
```

**Rules**:
- Data flows DOWN only (no callbacks to upper layers)
- Security validation happens at EVERY layer boundary
- All external input (queries) validated by Zod before processing

**Dependency Direction**: 
- `tools/` → `commands/`, `security/`, `utils/`, `scheme/`
- `commands/` → `security/` (for `escapeShellArg`)
- `utils/exec.ts` → `security/` (for validation)
- NEVER: `security/` → `tools/` (security is foundational)

## Key Abstractions & Types

- **`McpServer`** (`@modelcontextprotocol/sdk`) - MCP server instance, used for tool/prompt registration
  - **Used by**: `src/index.ts:23`, `src/tools/toolsManager.ts:47`

- **`BaseCommandBuilder`** (`src/commands/BaseCommandBuilder.ts:10`) - Abstract builder for safe command construction
  - **Used by**: `RipgrepCommandBuilder`, `FindCommandBuilder`, `LsCommandBuilder`
  - **Extends**: None (base class)

- **`PathValidator`** (`src/security/pathValidator.ts:41`) - Validates paths against allowed roots
  - **Used by**: `validateToolPath()` in all tools
  - **Singleton**: `pathValidator` exported at line 191

- **`RipgrepQuery`** (`src/scheme/local_ripgrep.ts:332`) - Typed query for ripgrep tool (40+ options)
  - **Used by**: `searchContentRipgrep()`, `RipgrepCommandBuilder`

- **`SearchContentResult`** (`src/types.ts:84`) - Structured result with `files[]`, `pagination`, `hints`
  - **Used by**: `local_ripgrep.ts` return type

- **`ToolError`** (`src/errors/errorCodes.ts:154`) - Typed error with `errorCode`, `category`, `recoverability`
  - **Used by**: Error handling throughout

- **`BulkQuery<T>`** / **`BulkResult<T>`** (`src/types.ts:359-370`) - Generic bulk operation wrappers
  - **Used by**: `executeBulkOperation()`

## Architectural Decisions

### ADR-001: Whitelist-Only Command Execution
**Date:** 2024 | **Status:** Accepted

**Context:** MCP servers execute on user machines with AI-generated inputs. Command injection is a critical risk.

**Alternatives:**
- Blacklist dangerous patterns (incomplete, bypassable)
- Sanitize all inputs (complex, error-prone)
- Whitelist allowed commands (restrictive but safe)

**Decision:** Only `rg`, `ls`, `find` commands are allowed (`src/security/securityConstants.ts:12`). All other commands fail validation.

**Consequences:**
- PROS: Eliminates command injection risk; simple to audit; easy to extend
- CONS: Cannot add new commands without code change; limits flexibility

### ADR-002: Bulk Operations (1-5 Queries Per Call)
**Date:** 2024 | **Status:** Accepted

**Context:** AI assistants often need multiple related queries. Single-query tools waste round trips.

**Alternatives:**
- Single query per call (simple but inefficient)
- Unlimited queries (risk of abuse/timeout)
- Fixed batch size 1-5 (balanced)

**Decision:** All tools accept `queries: T[]` array with 1-5 items, processed in parallel via `Promise.allSettled()`.

**Consequences:**
- PROS: 5x reduction in round trips; parallel execution; graceful partial failures
- CONS: More complex response structure; harder to debug individual queries

### ADR-003: Symlink Resolution for Security
**Date:** 2024 | **Status:** Accepted

**Context:** Symlinks can point outside workspace, enabling path traversal attacks.

**Alternatives:**
- Block all symlinks (breaks legitimate use cases)
- Follow symlinks blindly (security hole)
- Resolve and validate targets (secure + functional)

**Decision:** `PathValidator.validate()` ALWAYS resolves symlinks via `fs.realpathSync()` before checking against allowed roots (`src/security/pathValidator.ts:111-136`).

**Consequences:**
- PROS: Prevents symlink-based attacks; transparent to users; allows legitimate symlinks within workspace
- CONS: Slight performance overhead; may confuse users when symlink target is rejected

### ADR-004: Spawn Over Shell Execution
**Date:** 2024 | **Status:** Accepted

**Context:** Node.js `exec()` uses shell, enabling injection via shell metacharacters.

**Alternatives:**
- `exec()` with shell (convenient but dangerous)
- `spawn()` without shell (safe but requires array args)
- `execFile()` (similar to spawn)

**Decision:** Use `spawn()` with args array (`src/utils/exec.ts:37`). Arguments passed directly to process, no shell interpretation.

**Consequences:**
- PROS: Shell metacharacters are harmless; no escaping needed for most args
- CONS: Cannot use shell features (pipes, redirects); must build args array manually

### ADR-005: YAML Response Format
**Date:** 2024 | **Status:** Accepted

**Context:** MCP responses need to be readable by both AI and humans.

**Alternatives:**
- JSON (verbose, hard to read)
- Plain text (unstructured)
- YAML (readable, structured)

**Decision:** Use YAML-like format via `createResponseFormat()` with key priority ordering (`src/scheme/responsePriority.ts`).

**Consequences:**
- PROS: Human-readable; preserves structure; token-efficient vs JSON
- CONS: Custom format (not standard YAML); requires priority configuration

## Cross-Cutting Concerns

### Error Handling
**Strategy**: Typed errors with `ErrorCode` enum; graceful degradation in bulk operations.

**Invariants**:
- All errors MUST include `errorCode` from `ERROR_CODES` (`src/errors/errorCodes.ts:15-35`)
- Bulk operations MUST NOT fail entirely if one query fails (use `Promise.allSettled`)
- User-facing errors MUST include actionable hints

**Examples**: `src/errors/errorCodes.ts:258-351` - `ToolErrors` factory functions

### Testing
**Framework**: Vitest | **Location**: `tests/` (mirrors `src/` structure) | **Run**: `yarn test`

**Philosophy**:
- Unit tests for commands, utils, security (`tests/commands/`, `tests/utils/`, `tests/security/`)
- Integration tests for full tool flows (`tests/integration/`)
- Security-focused tests: penetration, symlink attacks, race conditions (`tests/security/`)
- Mock filesystem operations where possible

**Coverage**: 23 test files covering all major components

### Configuration
**Files**:
- `package.json` - Dependencies, scripts, metadata
- `vitest.config.ts` - Test configuration
- `rollup.config.js` - Build configuration

**Env Vars**:
- `WORKSPACE_ROOT` - Override default workspace root (defaults to `process.cwd()`)

**Precedence**: Env vars > defaults in `src/constants.ts`

### Security
**Auth**: N/A (local tool, no network auth)

**Path Security** (`src/security/pathValidator.ts`):
- Paths validated against `allowedRoots` (workspace boundaries)
- Symlinks resolved to real paths before validation
- Ignored patterns block `.git`, `.env`, `.ssh`, etc.

**Command Security** (`src/security/commandValidator.ts`):
- Whitelist: only `rg`, `ls`, `find` allowed
- Position-aware validation: patterns vs paths treated differently
- Dangerous patterns blocked: `;&|$(){}[]<>`

**Execution Security** (`src/utils/exec.ts`):
- `spawn()` without shell (no injection via metacharacters)
- Timeout: 30s default
- Output limit: 10MB
- Context validation before execution

### Observability
**Logging**: Minimal (errors only via stderr)

**Debug**: Tools support `debug: true` option to enable verbose output

**Metrics**: `SearchStats` returned by ripgrep (`src/types.ts:112-119`): matchCount, filesSearched, bytesSearched, searchTime

## Dependencies & Build

### Key Dependencies
- **`@modelcontextprotocol/sdk`**: ^1.18.1 - MCP server/transport implementation
- **`zod`**: ^3.25.26 - Runtime schema validation
- **`octocode-utils`**: ^5.0.0 - Shared utilities (minifier, YAML formatter)

### Build Commands
```bash
yarn install              # Install dependencies
yarn build                # Lint + clean + rollup bundle
yarn build:dev            # Clean + rollup (skip lint)
yarn test                 # Run all tests
yarn test:watch           # TDD mode
yarn lint                 # ESLint check
yarn lint:fix             # Auto-fix lint issues
```

### Output
- `dist/index.js` - Single bundled file (Rollup)
- Executable via `node dist/index.js` or as MCP server

## Design Patterns & Constraints

### Patterns Used
- **Builder Pattern**: Command construction (`src/commands/BaseCommandBuilder.ts:10`)
  - Fluent API: `builder.addFlag('-l').addOption('-A', 3).build()`
- **Singleton**: `pathValidator` instance (`src/security/pathValidator.ts:191`)
- **Factory**: `ToolErrors.*` functions (`src/errors/errorCodes.ts:258`)
- **Strategy**: Workflow modes in ripgrep (`src/scheme/local_ripgrep.ts:339-374`)

### Anti-Patterns to Avoid
- **AVOID direct `exec()` calls**: Always use `safeExec()` wrapper
- **AVOID shell strings**: Use `spawn()` with args array, never `exec('cmd ' + userInput)`
- **AVOID bypassing PathValidator**: All paths MUST be validated before use
- **AVOID hardcoded limits**: Use `RESOURCE_LIMITS` constants

### Assumptions
- Node.js ≥18.0.0 available
- `rg` (ripgrep), `ls`, `find` commands available on system PATH
- Workspace root is a trusted directory
- AI assistant handles response pagination

### Constraints
**Technical**:
- MCP response limit: 25K tokens (~100K chars)
- Command timeout: 30 seconds
- Output size: 10MB max
- Bulk queries: 1-5 per call

**Security**:
- Commands restricted to whitelist
- Paths restricted to workspace root
- Symlinks resolved before validation

## Contributors Guide

### Bug Fixes
1. **Locate**: Most bugs in `src/tools/` (tool logic) or `src/security/` (validation)
2. **Fix**: Edit source file, add regression test in `tests/`
3. **Test**: `yarn test` (full) or `npx vitest run tests/path/to/file.test.ts` (single)
4. **Verify**: `yarn lint && yarn build`

### New Features
1. **Design**: Review this doc, identify affected layers
2. **Schema**: Add/modify Zod schema in `src/scheme/`
3. **Implement**: Follow pattern from existing tools (e.g., `local_ripgrep.ts`)
4. **Security**: If new command needed, add to `ALLOWED_COMMANDS` and document
5. **Test**: Add tests in `tests/tools/` and `tests/security/`
6. **Document**: Update this file if architecture changes

### Adding a New Tool
1. Create schema in `src/scheme/new_tool.ts` (extend `BaseQuerySchema`)
2. Create command builder in `src/commands/NewToolCommandBuilder.ts` (extend `BaseCommandBuilder`)
3. Create tool implementation in `src/tools/new_tool.ts`
4. Register in `src/tools/toolsManager.ts:registerTools()`
5. Add tool name to `src/constants.ts:TOOL_NAMES`
6. If new OS command needed:
   - Add to `ALLOWED_COMMANDS` in `src/security/securityConstants.ts`
   - Add position-aware validation in `src/security/commandValidator.ts:getPatternArgPositions()`
7. Add comprehensive tests in `tests/tools/new_tool.test.ts`

### Navigation Tips
- **Find tool implementation**: Look in `src/tools/local_*.ts`
- **Understand query options**: Read Zod schema in `src/scheme/local_*.ts`
- **Debug command building**: Check `src/commands/*CommandBuilder.ts`
- **Security concerns**: Start with `src/security/pathValidator.ts`
- **Add new constant**: Edit `src/constants.ts` (RESOURCE_LIMITS or DEFAULTS)

---

**Last Updated:** November 2025  
**Package Version:** 1.1.6  
**Questions:** https://github.com/bgauryy/octocode-mcp/issues


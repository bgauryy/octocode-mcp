# Architecture
> High-level architecture of local-explorer-mcp

## Bird's Eye View

**What**: An MCP (Model Context Protocol) server that provides intelligent local file system exploration capabilities for AI assistants using native Unix commands (ripgrep, find, ls).

**How**: TypeScript server exposing 4 core tools through the MCP SDK, with multi-layer security validation, bulk operations support, intelligent caching, token optimization, and structured YAML responses.

**Why**: Enable AI assistants to research codebases efficiently and securely without requiring them to read entire files or directories—pattern-based discovery with pagination and minification for token efficiency.

**Philosophy**: Security-first | Token-efficient | Unix-powered | Agent-optimized | Bulk-operation native

## Entry Points

- **Main Server**: `src/index.ts:15` - Initializes MCP server, registers tools/prompts, configures workspace root, sets up cleanup handlers
- **Tool Registration**: `src/tools/toolsManager.ts:45` - Registers all 4 tools with Zod schemas and bulk operation handlers
- **Prompt Registration**: `src/tools/toolsManager.ts:118` - Registers built-in prompts (architecture, agents, research)

**Start Here**: 
1. Read `src/index.ts` to understand server initialization and lifecycle
2. Explore `src/tools/toolsManager.ts` to see how tools are registered with MCP
3. Dive into individual tools in `src/tools/` (start with `local_ripgrep.ts` for the most complex example)
4. Review `src/security/pathValidator.ts` to understand the security model

## Code Map

### `/src/tools/` - Core MCP Tool Implementations
**Purpose**: The 4 main tools that AI assistants interact with, plus hint/connection management

**Key Files**:
- `local_ripgrep.ts` (16.7KB) - Fast pattern search using ripgrep, supports discovery mode, regex, multiline, pagination
  - **Entry**: `searchContentRipgrep()` - Main handler for pattern-based code search
  - **Modes**: Discovery (filesOnly), Paginated (10 files/page), Detailed (with context)
- `local_view_structure.ts` (16.2KB) - Directory exploration using ls/fs.readdir with sorting and filtering
  - **Entry**: `viewStructure()` - Directory listing with metadata
  - **Features**: Recursive depth, pattern matching, size calculation, tree view
- `local_fetch_content.ts` (10.3KB) - File content reading with matchString extraction and pagination
  - **Entry**: `fetchContent()` - Read files with optional pattern extraction
  - **Modes**: matchString (token-efficient), fullContent (with pagination)
- `local_find_files.ts` (5.0KB) - Metadata-based file search using find command
  - **Entry**: `findFiles()` - Search by name, size, time, permissions
- `toolsManager.ts` (3.5KB) - Tool registration hub with MCP server
- `connections.ts` (8.1KB) - Connection metadata for MCP client discovery
- `hints.ts` (10.9KB) - Contextual workflow hints for AI agents

**Invariants**:
- All tools accept bulk queries (1-5 per call) for parallel processing
- All tools return structured responses with status (`hasResults` | `empty` | `error`)
- All tools include pagination metadata and contextual hints
- All tools validate inputs using Zod schemas before processing
- All responses are formatted as YAML using `octocode-utils`

**API Boundary**: Public MCP tools exposed to AI assistants via MCP protocol

### `/src/commands/` - Safe Command Builders
**Purpose**: Construct safe Unix command invocations with type safety and validation

**Key Files**:
- `BaseCommandBuilder.ts` (1.4KB) - Abstract base class with fluent API
  - **Pattern**: Builder pattern with method chaining
  - **Security**: All arguments escaped via `escapeShellArg()`
- `RipgrepCommandBuilder.ts` (6.3KB) - Ripgrep-specific builder with 40+ flags
  - **Features**: Regex types (fixed/basic/PCRE2), context lines, file filters, JSON output
- `FindCommandBuilder.ts` (4.1KB) - Find command builder with predicate support
  - **Features**: File tests, size/time filters, regex patterns, depth limits
- `LsCommandBuilder.ts` (3.2KB) - Ls command builder for directory listing
  - **Features**: Sorting, time formats, size display, recursive options

**Invariants**:
- **NEVER** construct raw command strings directly—always use builders
- Arguments are validated and escaped before execution
- No shell interpolation—commands executed directly via `child_process.spawn()`
- Command whitelist enforced: only `rg`, `find`, `ls` allowed

**API Boundary**: Internal—used by tools to construct validated commands

### `/src/security/` - Multi-Layer Security Validation
**Purpose**: Prevent attacks and unauthorized access through comprehensive validation

**Key Files**:
- `pathValidator.ts` (5.8KB) - **CRITICAL** workspace boundary enforcement
  - **Class**: `PathValidator` (singleton)
  - **Validates**: Path within workspace, resolves symlinks, checks ignore patterns
  - **Invariant**: ALL symlinks resolved to real paths before validation
- `commandValidator.ts` (5.0KB) - Command whitelist and injection prevention
  - **Whitelist**: Only `rg`, `find`, `ls` allowed
  - **Functions**: `validateCommand()`, `escapeShellArg()`
- `executionContextValidator.ts` (3.4KB) - Resource limit enforcement
  - **Limits**: Timeout (30s), max output size (100MB), memory tracking
  - **Class**: `ExecutionContextValidator`
- `ignoredPathFilter.ts` (2.2KB) - Filters sensitive paths
  - **Patterns**: `.git`, `.env`, `node_modules`, secrets, credentials
  - **Function**: `shouldIgnore()`
- `securityConstants.ts` (1.1KB) - Whitelisted commands and security defaults
- `patternsConstants.ts` (11.9KB) - Comprehensive ignore patterns for sensitive files
  - **Categories**: Version control, dependencies, secrets, build artifacts, OS files

**Security Flow** (CRITICAL - NEVER bypass):
```
User Input
    ↓
Zod Schema Validation (src/scheme/)
    ↓
Path Validator (workspace boundaries, symlinks)
    ↓
Command Validator (whitelist, injection prevention)
    ↓
Execution Context Validator (resource limits)
    ↓
Ignored Path Filter (sensitive files)
    ↓
Command Execution (direct spawn, no shell)
```

**Invariants**:
- **ALL** paths must pass `PathValidator.validate()` before use
- **ALL** commands must be whitelisted (only `rg`, `find`, `ls`)
- **ALL** operations have timeout (30s default) and memory limits (100MB)
- Symlinks **ALWAYS** resolved to real paths for security validation
- No shell execution—commands run directly to prevent injection
- Tools DON'T follow symlinks by default (performance + safety)
- Users can opt-in to symlink following per operation

**API Boundary**: Internal—enforced by all tools before any file system access

### `/src/scheme/` - Zod Validation Schemas
**Purpose**: Type-safe validation of tool input parameters

**Key Files**:
- `local_ripgrep.ts` (14.8KB) - Comprehensive ripgrep schema with 40+ parameters
  - **Exports**: `BulkRipgrepQuerySchema`, `RipgrepQuerySchema`
  - **Features**: Pattern validation, mode selection, pagination, context lines
- `local_view_structure.ts` (3.5KB) - Directory exploration schema
- `local_find_files.ts` (4.0KB) - File metadata search schema
- `local_fetch_content.ts` (3.1KB) - Content reading schema
- `baseSchema.ts` (1.3KB) - Shared base schemas (research goals, pagination)

**Invariants**:
- All tool inputs validated before processing (fail-fast)
- Each tool has bulk schema (queries array 1-5) and single query schema
- Schemas include descriptions for MCP introspection
- Default values defined in schemas, not in tool code
- Pagination limits enforced: max 20 files/page, 100 matches/page

**API Boundary**: Public—defines tool interfaces for MCP protocol

### `/src/utils/` - Shared Utilities
**Purpose**: Common functionality for caching, pagination, token validation, minification, and responses

**Key Files**:
- `bulkOperations.ts` (8.5KB) - **CORE** parallel query processing
  - **Functions**: `executeBulkOperation()`, `processBulkQueries()`
  - **Features**: Error isolation, parallel execution, result aggregation
  - **Pattern**: Each tool wraps single query handler with bulk executor
- `cache.ts` (6.1KB) - LRU cache manager with TTL and statistics
  - **Class**: `MemoryCache`
  - **Features**: Size-aware eviction, TTL (15min default), hit/miss stats
  - **Keys**: SHA-256 hash of stable parameter strings
- `pagination.ts` (11.7KB) - Character-based pagination with line-aware slicing
  - **Functions**: `paginateContent()`, `createPaginationInfo()`
  - **Warning**: Uses byte offsets (not char offsets) for UTF-8 compatibility
- `tokenValidation.ts` (6.3KB) - Validates responses don't exceed MCP 25K token limit
  - **Function**: `validateBulkResponseTokens()`
  - **Action**: Auto-paginate if over limit
- `minifier.ts` (4.3KB) - Removes whitespace/comments for token efficiency
  - **Savings**: 30-60% token reduction
  - **Function**: `minifyContent()`
  - **Preserves**: Code structure and semantics
- `responses.ts` (4.8KB) - YAML response formatter using octocode-utils
  - **Function**: `formatYaml()`
  - **Format**: Structured YAML for AI readability
- `toolHelpers.ts` (7.0KB) - Shared tool utilities
  - **Functions**: Status detection, result creation, hint generation
- `exec.ts` (3.1KB) - Safe command execution wrapper
  - **Function**: `executeCommand()`
  - **Features**: Timeout enforcement, output limits, error handling
- `fileFilters.ts` (1.7KB) - File filtering utilities
- `fileSize.ts` (1.8KB) - File size formatting (KB, MB, GB)
- `promiseUtils.ts` (1.1KB) - Promise utilities (`settleAll` for parallel operations)

**Invariants**:
- Token validation **REQUIRED** before returning bulk responses (MCP 25K limit)
- Pagination uses character (byte) offsets for consistency with ripgrep
- Cache keys are SHA-256 hashes for collision-free keying
- Minification preserves code structure (never breaks syntax)
- All utilities are stateless except `MemoryCache`

**API Boundary**: Internal—shared across all tools

### `/src/prompts/` - Built-in Agent Prompts
**Purpose**: Self-documenting prompts for auto-generating project documentation

**Key Files**:
- `architecture.md` (16.5KB) - Prompt template for generating ARCHITECTURE.md (this file!)
  - **Phases**: Discovery → Mapping → Core arch → Cross-cutting concerns
  - **Output**: Comprehensive architecture documentation
- `agents.md` (17.9KB) - Prompt template for generating AGENTS.md
  - **Output**: Coding agent guidelines (setup, rules, patterns)
- `research.md` (6.6KB) - Prompt template for codebase research
  - **Workflows**: Bug fixes, feature additions, refactoring
- `architecture.ts` (1.0KB) - Registers architecture prompt with MCP
- `agents.ts` (1.0KB) - Registers agents prompt with MCP

**Invariants**:
- Prompts embedded as markdown files imported via Rollup plugin
- Prompts follow structured methodology (phases, decision gates, templates)
- Each prompt includes examples and DO/DON'T guidelines

**API Boundary**: Public—exposed as MCP prompts for AI assistants

### `/src/types.ts` - Core Type Definitions
**Purpose**: TypeScript type definitions for all queries, results, and internal structures

**Key Types**:
- **Query Types**: `RipgrepQuery`, `ViewStructureQuery`, `FindFilesQuery`, `FetchContentQuery`
- **Result Types**: `SearchContentResult`, `ViewStructureResult`, `FindFilesResult`, `FetchContentResult`
- **Common Types**: `PaginationInfo`, `ValidationResult`, `ExecResult`, `ToolResponse`
- **Ripgrep Types**: `RipgrepMatch`, `RipgrepFileMatches` (structured match format)

**Invariants**:
- All results include: `status`, `researchGoal?`, `reasoning?`, `hints?`, `error?`, `pagination?`
- Status values: `'hasResults'` | `'empty'` | `'error'`

### `/src/constants.ts` - Tool Names and Constants
**Purpose**: Centralized constants for tool names, defaults, and configuration

**Exports**: `TOOL_NAMES` (LOCAL_RIPGREP, LOCAL_VIEW_STRUCTURE, LOCAL_FIND_FILES, LOCAL_FETCH_CONTENT)

### `/tests/` - Comprehensive Test Suite
**Purpose**: Ensure correctness, security, and reliability across all components

**Structure**:
```
tests/
├── tools/              # Tool implementation tests (4 files, 132KB total)
│   ├── local_ripgrep.test.ts (40.8KB, 66 tests)
│   ├── local_view_structure.test.ts (43.9KB, 79 tests)
│   ├── local_find_files.test.ts (28.5KB, 66 tests)
│   └── local_fetch_content.test.ts (19.5KB, 51 tests)
├── commands/           # Command builder tests
│   └── RipgrepCommandBuilder.test.ts (12.0KB)
├── security/           # Security validation tests (CRITICAL - 33KB total)
│   ├── pathValidator.test.ts (4.6KB)
│   ├── executionContextValidator.test.ts (9.5KB)
│   ├── exec-integration.test.ts (2.0KB)
│   ├── penetration-test.test.ts (7.7KB)
│   ├── investigate-bypasses.test.ts (5.0KB)
│   ├── symlink-attack.test.ts (4.4KB)
│   └── race-condition-attack.test.ts (4.8KB)
├── integration/        # Cross-tool integration tests
│   └── all-tools-node-modules.test.ts (9.2KB)
└── utils/              # Utility function tests
    ├── pagination.test.ts (9.4KB)
    ├── fileSize.test.ts (1.0KB)
    ├── minifier.test.ts (784B)
    └── promiseUtils.test.ts (1.1KB)
```

**Invariants**:
- All security changes **MUST** include tests
- Tests run in isolation (no side effects or shared state)
- Security tests include penetration testing scenarios
- Test coverage maintained at current levels (no degradation)

**Framework**: Vitest with v8 coverage provider

### `/` - Root Configuration Files
**Purpose**: Build, test, and project configuration

**Key Files**:
- `package.json` (v1.1.0) - Dependencies, scripts, metadata
- `tsconfig.json` - TypeScript strict mode, ES2022 target, ESNext modules
- `rollup.config.js` - Build configuration (TypeScript → Rollup → Terser)
- `vitest.config.ts` - Test configuration (globals, node env, v8 coverage)
- `manifest.json` - MCP manifest for Claude Desktop integration
- `README.md` - User-facing documentation and setup guide
- `LICENSE.md` - MIT license
- `AGENTS.md` - Coding agent guidelines (auto-generated)
- `ARCHITECTURE.md` - This file (auto-generated)

## System Boundaries & Layers

```
[Client]      MCP Client (AI Assistant)
                    ↓
                MCP SDK
                    ↓
[Tools]       Tool Layer (4 tools)
                    ↓
[Validation]  Zod Schema Validation
                    ↓
[Security]    Security Layers:
              - Path Validator (workspace boundaries)
              - Command Validator (whitelist, injection)
              - Execution Context (resource limits)
              - Ignored Path Filter (sensitive files)
                    ↓
[Builders]    Command Builders (safe command construction)
                    ↓
[Execution]   Unix Commands (rg, find, ls)
                    ↓
[System]      File System (within workspace)
```

**Dependency Flow Rules**:
- **Unidirectional**: Higher layers never know about lower layer implementation details
- **Security at boundary**: All external inputs validated at the highest layer
- **Command isolation**: Commands executed directly via `spawn()`, never through shell
- **Workspace restriction**: All operations restricted to workspace root(s)
- **Stateless tools**: Tools maintain no state between calls (cache is shared utility)

**Dependency Direction**: 
- Inward flow: Core utilities (cache, pagination, exec) have no dependencies on tools or security
- Tools depend on: Security → Builders → Utils → Types
- Security layers are independent of each other (composable)

## Key Abstractions & Types

### Core Abstractions

#### Tool Pattern (`src/tools/`)
All tools follow the same pattern:
```typescript
async function toolHandler(query: QueryType): Promise<ResultType> {
  // 1. Validate path (security)
  // 2. Build command (command builder)
  // 3. Execute command (exec util)
  // 4. Parse output
  // 5. Paginate results
  // 6. Generate hints
  // 7. Return structured result
}
```
- **Used by**: All 4 main tools
- **Wrapped by**: `executeBulkOperation()` for parallel processing

#### Bulk Operation Pattern (`src/utils/bulkOperations.ts:executeBulkOperation()`)
```typescript
executeBulkOperation<TQuery, TResult>(
  queries: TQuery[],
  processor: (query: TQuery) => Promise<TResult>,
  config: { toolName: string }
): Promise<CallToolResult>
```
- **Purpose**: Process 1-5 queries in parallel with error isolation
- **Used by**: All tools via `toolsManager.ts` registration
- **Features**: Parallel execution, error boundaries, token validation, YAML formatting

#### Security Validator Pattern
All validators implement `validate()` → `ValidationResult`:
```typescript
interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedPath?: string;
}
```
- **Implemented by**: `PathValidator`, `validateCommand()`, `ExecutionContextValidator`
- **Composable**: Validators chain together in security flow

#### Command Builder Pattern (`src/commands/BaseCommandBuilder`)
Fluent API for safe command construction:
```typescript
abstract class BaseCommandBuilder {
  addFlag(flag: string): this;
  protected addOption(option: string, value: string | number): this;
  addArgument(arg: string | number): this;
  abstract build(): string[];
}
```
- **Extends**: `RipgrepCommandBuilder`, `FindCommandBuilder`, `LsCommandBuilder`
- **Security**: All arguments escaped via `escapeShellArg()`

### Type System Architecture

#### Query/Result Pairs
Each tool has a strict Query → Result contract:
- **Ripgrep**: `RipgrepQuery` → `SearchContentResult`
- **ViewStructure**: `ViewStructureQuery` → `ViewStructureResult`
- **FindFiles**: `FindFilesQuery` → `FindFilesResult`
- **FetchContent**: `FetchContentQuery` → `FetchContentResult`

#### Common Result Structure
```typescript
interface BaseResult {
  status: 'hasResults' | 'empty' | 'error';
  researchGoal?: string;
  reasoning?: string;
  hints?: readonly string[];
  error?: string;
  pagination?: PaginationInfo;
}
```

#### Pagination Type (`src/types.ts:PaginationInfo`)
Unified pagination across all tools:
- **Character-based**: `charOffset`, `charLength`, `totalChars`
- **Entity-based**: `filesPerPage`, `entriesPerPage`, `matchesPerPage`
- **Always includes**: `currentPage`, `totalPages`, `hasMore`

### Critical Singletons

#### `PathValidator` (`src/security/pathValidator.ts:PathValidator`)
**CRITICAL SECURITY COMPONENT**
- **Singleton**: One instance per server
- **Methods**: 
  - `validate(targetPath)` - Validates path within workspace
  - `addAllowedRoot(root)` - Adds workspace root
- **Always**: Resolves symlinks to real paths before validation
- **Used by**: Every tool before any file system access

#### `MemoryCache` (`src/utils/cache.ts:MemoryCache`)
- **LRU eviction**: Size-aware with TTL (15min default)
- **Keys**: SHA-256 hash of stable parameter strings
- **Stats**: Hit/miss tracking for debugging
- **Used by**: Tools for caching expensive operations (optional)

## Architectural Decisions

### ADR-001: Multi-Layer Security Validation
**Date**: 2024-11-04 | **Status**: Accepted

**Context**: MCP servers run with file system access and execute commands, creating attack surface for:
- Path traversal attacks (../../../etc/passwd)
- Command injection (input containing shell metacharacters)
- Resource exhaustion (infinite loops, memory bombs)
- Sensitive data exposure (.env, credentials)

**Alternatives Considered**:
1. **Single validation layer** - Fast but insufficient against sophisticated attacks
2. **OS-level sandboxing** - Complex setup, platform-dependent
3. **Multi-layer validation** - Defense in depth with composable layers

**Decision**: Implement 4-layer security validation:
1. **Zod Schema** - Type and format validation
2. **Path Validator** - Workspace boundaries, symlink resolution
3. **Command Validator** - Whitelist enforcement, argument escaping
4. **Execution Context** - Resource limits (timeout, memory, output size)

**Consequences**:
- ✅ PROS: Defense in depth, each layer catches different attack vectors, composable and testable
- ✅ PROS: Clear security boundaries, easy to audit and extend
- ❌ CONS: Small performance overhead (typically <10ms per operation)
- ❌ CONS: More code to maintain and test

### ADR-002: Bulk Operations as Primary Pattern
**Date**: 2024-11-04 | **Status**: Accepted

**Context**: AI assistants often need to query multiple files, patterns, or directories in a single interaction. Single-query operations require multiple round-trips (high latency).

**Alternatives Considered**:
1. **Single-query only** - Simple but high latency for batch operations
2. **Streaming responses** - Complex state management, harder error handling
3. **Bulk operations with parallel processing** - Balance between simplicity and performance

**Decision**: All tools accept 1-5 queries per call, processed in parallel with error isolation.

**Implementation**:
- Each tool implements single-query handler
- `executeBulkOperation()` wraps handler with parallel processing
- Errors in one query don't affect others
- Token validation ensures response fits within MCP limits

**Consequences**:
- ✅ PROS: 5x reduction in round-trips for multi-query operations
- ✅ PROS: Error isolation prevents one failure from breaking entire batch
- ✅ PROS: Consistent pattern across all tools
- ❌ CONS: Complexity in result aggregation and token management
- ❌ CONS: Requires careful pagination to avoid token explosion

### ADR-003: Character-Based Pagination with Byte Offsets
**Date**: 2024-11-04 | **Status**: Accepted

**Context**: Large files and search results need pagination to avoid token limits. Ripgrep returns byte offsets (not character offsets) for UTF-8 files.

**Alternatives Considered**:
1. **Line-based pagination** - Simple but poor UX for large files with long lines
2. **Character-based with conversion** - Complex UTF-8 handling, performance overhead
3. **Byte-based pagination** - Direct integration with ripgrep, fast

**Decision**: Use character (byte) offsets for pagination, accept byte vs char offset mismatch for UTF-8.

**Documentation**: Added clear warnings in `RipgrepMatch.location.charOffset` and pagination docs.

**Consequences**:
- ✅ PROS: Direct integration with ripgrep output (no conversion needed)
- ✅ PROS: Fast pagination for large files
- ✅ PROS: Works perfectly for ASCII files (byte = char)
- ❌ CONS: Byte ≠ char for UTF-8 multi-byte characters (requires conversion if needed)
- ⚠️  MITIGATION: Clear documentation of byte offset semantics

### ADR-004: Symlink Security Model
**Date**: 2024-11-05 | **Status**: Accepted

**Context**: Symlinks can be used for:
- Legitimate purposes (linking to shared code, build artifacts)
- Attack vectors (path traversal via symlinks outside workspace)
- Performance issues (circular symlinks causing infinite loops)

**Alternatives Considered**:
1. **Block all symlinks** - Safest but breaks legitimate use cases
2. **Follow all symlinks** - Convenient but unsafe
3. **Always resolve for security, optional follow for traversal** - Balance safety and usability

**Decision**: Two-phase symlink handling:
1. **Security validation**: ALWAYS resolve symlinks to real paths, validate target within workspace
2. **Tool traversal**: DON'T follow symlinks by default (performance + safety), allow opt-in via `followSymlinks=true`

**Rationale**:
- Security validation must resolve symlinks to prevent attacks
- Tool traversal defaults to NOT following (matches ripgrep/find default behavior)
- Users can opt-in per operation if needed
- Symlink targets are still validated (must be within workspace)

**Constants**:
- `SECURITY_DEFAULTS.VALIDATE_SYMLINK_TARGETS = true` (always)
- `SECURITY_DEFAULTS.DEFAULT_FOLLOW_SYMLINKS = false` (tool default)

**Consequences**:
- ✅ PROS: Prevents symlink-based path traversal attacks
- ✅ PROS: Performance improvement by not following symlinks by default
- ✅ PROS: Avoids infinite loops with circular symlinks
- ✅ PROS: Matches ripgrep and find default behavior
- ❌ CONS: Users must explicitly enable symlink following if needed
- ⚠️  MITIGATION: Clear documentation of symlink behavior in tool docs

### ADR-005: YAML Response Format via octocode-utils
**Date**: 2024-11-05 | **Status**: Accepted

**Context**: MCP responses need to be readable by AI assistants. JSON is machine-readable but verbose. YAML is human-readable and concise.

**Alternatives Considered**:
1. **JSON** - Standard but verbose, harder for AI to parse large structures
2. **Plain text** - Simple but loses structure
3. **YAML via octocode-utils** - Human-readable, structured, token-efficient

**Decision**: Use `octocode-utils` for YAML formatting of all MCP responses.

**Consequences**:
- ✅ PROS: 20-30% token reduction vs JSON
- ✅ PROS: More readable for AI assistants
- ✅ PROS: Maintains structure and type information
- ❌ CONS: Dependency on external library
- ❌ CONS: Slightly slower serialization vs JSON.stringify()

### ADR-006: Minification for Token Efficiency
**Date**: 2024-11-04 | **Status**: Accepted

**Context**: Token usage is a critical constraint for AI assistants. Large files quickly exceed token limits.

**Alternatives Considered**:
1. **No minification** - Simple but wasteful
2. **Aggressive minification** - Max savings but risks breaking code structure
3. **Conservative minification** - Balance between savings and safety

**Decision**: Implement conservative minification that removes whitespace and comments while preserving code structure.

**Implementation**: `minifier.ts` removes:
- Leading/trailing whitespace per line
- Blank lines
- Comments (language-aware)

**Consequences**:
- ✅ PROS: 30-60% token reduction
- ✅ PROS: Never breaks code structure
- ✅ PROS: Reversible (doesn't lose semantic information)
- ❌ CONS: Small processing overhead
- ❌ CONS: Makes some code slightly harder to read

### ADR-007: No ADR Directory (Inline Documentation)
**Date**: 2024-11-05 | **Status**: Accepted

**Context**: ADRs provide historical context for architectural decisions. Need to decide between separate ADR directory vs inline documentation.

**Alternatives Considered**:
1. **Separate `adr/` directory** - Standard practice, searchable, trackable
2. **Inline in ARCHITECTURE.md** - Consolidated, easier to maintain
3. **No formal ADRs** - Fast but loses context

**Decision**: Document ADRs inline in ARCHITECTURE.md for now, create separate `docs/adr/` if ADRs exceed 10.

**Consequences**:
- ✅ PROS: Consolidated documentation, easier to navigate
- ✅ PROS: Lower maintenance overhead
- ✅ PROS: Better for small/medium projects
- ❌ CONS: Harder to track ADR history over time
- ❌ CONS: May need to refactor if ADRs grow significantly

## Cross-Cutting Concerns

### Error Handling

**Strategy**: Fail-fast validation with structured error responses

**Layers**:
1. **Zod Validation**: Schema errors caught at entry point, returned as MCP errors
2. **Security Validation**: Path/command errors returned in `ValidationResult.error`
3. **Execution Errors**: Command failures returned in result `error` field with hints
4. **Unexpected Errors**: Caught by bulk operation handler, isolated per query

**Error Flow**:
```
Input → Zod → Security → Execute → Parse
  ↓       ↓       ↓         ↓        ↓
Error    Error   Error    Error    Error
  ↓       ↓       ↓         ↓        ↓
Return structured error with status='error' and hints
```

**Invariants**:
- Errors never propagate to MCP client as unhandled exceptions
- Each query in bulk operation has independent error handling
- Error messages include actionable hints for recovery
- Security errors never leak sensitive path information

**Example**:
```yaml
status: error
error: "Path validation failed: path outside workspace"
hints:
  - "Ensure path is within workspace root"
  - "Check for symlinks that escape workspace boundaries"
```

### Testing

**Framework**: Vitest (v3.2.4) with v8 coverage provider

**Configuration**: `vitest.config.ts`
- Environment: Node.js
- Globals: Enabled for convenience
- Setup: `tests/setup.ts` initializes test environment
- Coverage: Text, JSON, HTML reports

**Test Organization**:
```
tests/
├── tools/              # Tool implementation tests (262 tests)
├── commands/           # Command builder tests
├── security/           # Security validation tests (CRITICAL)
├── integration/        # Cross-tool integration tests
└── utils/              # Utility function tests
```

**Test Categories**:
1. **Unit Tests**: Individual functions and classes (tools, utils, commands)
2. **Security Tests**: Penetration testing, attack scenarios, bypasses
3. **Integration Tests**: Cross-tool workflows, real file system operations

**Philosophy**:
- **Comprehensive**: 262+ tests covering all tools and critical paths
- **Security-focused**: Dedicated security test suite with penetration tests
- **Fast**: Tests run in <10s for rapid feedback
- **Isolated**: No shared state, each test is independent

**Commands**:
```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode for TDD
yarn test:coverage     # Generate coverage report
yarn test:ui           # Interactive test UI (Vitest UI)
```

**Coverage Requirements**:
- Maintain existing coverage levels (no degradation)
- New features require unit tests
- Bug fixes require regression tests
- Security changes require comprehensive security tests

### Configuration

**Files**:
- `package.json` - Dependencies, scripts, project metadata
- `tsconfig.json` - TypeScript strict mode, ES2022 target
- `rollup.config.js` - Build pipeline configuration
- `vitest.config.ts` - Test runner configuration
- `manifest.json` - MCP manifest for Claude Desktop

**Environment Variables**:
- `WORKSPACE_ROOT` - Project root directory (defaults to `process.cwd()`)
- `DEBUG` - Enable detailed logging (default: false)
- `CACHE_TTL` - Cache duration in seconds (default: 900 = 15min)
- `MEMORY_LIMIT` - Max memory in MB (default: 100)

**Precedence**: Environment variables → Defaults (no config files)

**Rationale**: Simple configuration with sensible defaults, minimal user setup required

### Security

**Authentication**: None (MCP server runs locally, trusts MCP client)

**Authorization**: Workspace-based access control
- All operations restricted to workspace root(s)
- Symlinks resolved and validated
- Sensitive paths filtered (.env, .git, node_modules, etc.)

**Data Protection**:
- No PII collected or stored
- No network access (fully local)
- Cache cleared on server shutdown
- No persistent state between sessions

**Command Whitelist**: Only `rg`, `find`, `ls` allowed

**Attack Mitigation**:
- **Path Traversal**: Resolved symlinks, workspace boundary checks
- **Command Injection**: Argument escaping, no shell execution
- **Resource Exhaustion**: Timeout (30s), memory limits (100MB), output size limits
- **Sensitive Data**: Comprehensive ignore patterns (11.9KB of patterns)

**Security Testing**: Dedicated test suite with penetration tests:
- `pathValidator.test.ts` - Path validation edge cases
- `penetration-test.test.ts` - Common attack vectors
- `symlink-attack.test.ts` - Symlink-based attacks
- `race-condition-attack.test.ts` - Concurrent access attacks
- `investigate-bypasses.test.ts` - Potential bypass scenarios

### Observability

**Logging**: Minimal structured logging (console)
- Error conditions logged with context
- Debug mode available via `DEBUG=true` env var
- No verbose logging in production (performance)

**Metrics**: Cache statistics (hit/miss ratio)
- Available via `MemoryCache.getStats()`
- Used for debugging cache effectiveness

**Debugging**:
```bash
yarn debug  # Opens MCP inspector for real-time testing
```

**Tools**:
- `@modelcontextprotocol/inspector` - Interactive MCP tool testing
- Vitest UI - Interactive test debugging
- VSCode debugger - Attach to Node process

**Tips**:
- Use `DEBUG=true` for detailed logging
- Use MCP inspector to test tools interactively
- Check cache stats if performance degrades
- Review hints in tool responses for workflow guidance

## Dependencies & Build

### Key Dependencies

**Production** (`dependencies`):
- `@modelcontextprotocol/sdk`: ^1.18.1 - MCP server implementation
- `octocode-utils`: ^5.0.0 - YAML formatting and response utilities
- `zod`: ^3.25.26 - Runtime type validation

**Development** (`devDependencies`):
- `typescript`: ^5.9.2 - TypeScript compiler
- `rollup`: ^4.46.2 - Module bundler
- `@rollup/plugin-typescript`: ^12.1.2 - TypeScript support for Rollup
- `@rollup/plugin-terser`: ^0.4.4 - Minification
- `vitest`: ^3.2.4 - Test framework
- `eslint`: ^8.57.0 - Linting
- `prettier`: ^3.5.3 - Code formatting

**Runtime Requirements**:
- **Node.js**: >=18.0.0 (ES2022 features, native fetch)
- **ripgrep**: Required for `local_ripgrep` tool (install: `brew install ripgrep`)
- **find**: Built-in on Unix systems (macOS, Linux)
- **ls**: Built-in on Unix systems

### Build Commands

```bash
# Installation
yarn install                 # Install dependencies

# Development
yarn build:dev               # Fast build without linting
yarn build:watch             # Auto-rebuild on changes
yarn debug                   # Debug with MCP inspector

# Production
yarn build                   # Full build (lint → clean → rollup)
yarn clean                   # Remove dist/ directory

# Testing
yarn test                    # Run all tests
yarn test:watch              # Watch mode for TDD
yarn test:coverage           # Generate coverage report
yarn test:ui                 # Interactive test UI

# Code Quality
yarn lint                    # Check linting issues
yarn lint:fix                # Auto-fix linting issues
yarn format                  # Format code with Prettier
yarn format:check            # Check formatting without changes
```

### Build Process

```
TypeScript → Rollup → Terser → dist/index.js
```

**Rollup Configuration** (`rollup.config.js`):
1. **Markdown Plugin** - Imports .md files as strings (for prompts)
2. **Node Resolve** - Resolves node_modules imports
3. **CommonJS** - Converts CJS to ESM
4. **TypeScript** - Compiles TypeScript with strict mode
5. **JSON** - Imports JSON files
6. **Terser** - Minifies output, drops console/debugger

**Output**:
- Single file: `dist/index.js` (ES module)
- Shebang: `#!/usr/bin/env node` (executable)
- No source maps (production)
- No declarations (executable, not library)

**Bundle Size**: ~350KB (minified, all dependencies bundled except Node built-ins)

## Design Patterns & Constraints

### Patterns Used

#### Builder Pattern (`src/commands/BaseCommandBuilder.ts`)
**Purpose**: Construct safe command strings with fluent API

**Where**: All command builders (Ripgrep, Find, Ls)

**Why**: Type-safe command construction, prevents injection, method chaining for readability

**Example**: `src/commands/RipgrepCommandBuilder.ts:45`
```typescript
new RipgrepCommandBuilder()
  .addPattern(pattern)
  .addPath(path)
  .setCaseInsensitive()
  .setContextLines(3)
  .build();
```

#### Strategy Pattern (Tool Handlers)
**Purpose**: Interchangeable algorithms for different search/exploration strategies

**Where**: Each tool implements its own query processing strategy

**Why**: Tools have different use cases (pattern search, metadata search, content reading) but share common interface

#### Singleton Pattern (`src/security/pathValidator.ts:pathValidator`)
**Purpose**: Single source of truth for workspace boundaries

**Where**: `PathValidator` class

**Why**: Consistent validation across all tools, shared workspace configuration

#### Facade Pattern (`src/utils/bulkOperations.ts:executeBulkOperation()`)
**Purpose**: Simplified interface for complex bulk operation workflow

**Where**: Wraps validation, parallel processing, error handling, token validation, YAML formatting

**Why**: Tools only need to implement single-query handler, bulk logic is reusable

#### Template Method Pattern (Tool Structure)
**Purpose**: Define skeleton of tool operation, let tools customize steps

**Where**: All tools follow the same structure (validate → build → execute → parse → paginate → hints)

**Why**: Consistent behavior across tools, easy to add new tools

### Anti-Patterns to Avoid

#### ❌ AVOID: Constructing Raw Command Strings
**Problem**: Command injection vulnerabilities

**Solution**: ALWAYS use command builders from `src/commands/`

**Example**:
```typescript
// ❌ NEVER DO THIS
const cmd = `rg ${userInput} ${path}`; // INJECTION RISK

// ✅ DO THIS
const cmd = new RipgrepCommandBuilder()
  .addPattern(userInput)
  .addPath(path)
  .build();
```

#### ❌ AVOID: Skipping Path Validation
**Problem**: Path traversal attacks, access to sensitive files

**Solution**: ALWAYS call `pathValidator.validate()` before file system access

**Example**:
```typescript
// ❌ NEVER DO THIS
fs.readFileSync(userPath); // NO VALIDATION

// ✅ DO THIS
const validation = await pathValidator.validate(userPath);
if (!validation.isValid) return { status: 'error', error: validation.error };
fs.readFileSync(validation.sanitizedPath);
```

#### ❌ AVOID: Returning Unbounded Results
**Problem**: Token explosion, MCP client overwhelmed

**Solution**: ALWAYS paginate results with `charLength` or entity-based limits

**Example**:
```typescript
// ❌ NEVER DO THIS
return { content: fs.readFileSync(path, 'utf8') }; // UNBOUNDED

// ✅ DO THIS
const { content, pagination } = paginateContent(
  fileContent,
  charOffset,
  charLength
);
return { content, pagination };
```

#### ❌ AVOID: Using Shell Execution
**Problem**: Shell injection vulnerabilities

**Solution**: ALWAYS use `child_process.spawn()` with argument array, never `exec()` or `shell: true`

**Example**:
```typescript
// ❌ NEVER DO THIS
exec(`rg ${pattern} ${path}`); // SHELL INJECTION

// ✅ DO THIS
spawn('rg', [pattern, path], { shell: false });
```

#### ❌ AVOID: Catching Errors Without Hints
**Problem**: Users can't recover from errors

**Solution**: ALWAYS include actionable hints in error responses

**Example**:
```typescript
// ❌ AVOID THIS
return { status: 'error', error: 'Path validation failed' };

// ✅ DO THIS
return {
  status: 'error',
  error: 'Path validation failed: path outside workspace',
  hints: [
    'Ensure path is within workspace root',
    'Check for symlinks that escape workspace boundaries'
  ]
};
```

### Assumptions

**Scale**: Designed for typical codebases (<100K files, <10GB size)
- Large monorepos may require pagination and longer timeouts
- Discovery mode recommended for very large codebases

**Usage**: Single-user local development environment
- No concurrent access control (MCP client trusted)
- No authentication or authorization beyond workspace boundaries

**Environment**: Unix-like systems (macOS, Linux)
- Windows support requires WSL or native command replacements
- Requires ripgrep installed separately

**File Types**: Text files (source code, configs, docs)
- Binary files detected and skipped automatically
- Large files (>10MB) may hit pagination limits

### Constraints

**Technical**:
- Node.js >=18.0.0 required (ES2022, native fetch)
- TypeScript strict mode enforced (no unsafe operations)
- MCP token limit: 25K tokens per response (auto-paginated)
- ripgrep required for pattern search

**Business**:
- MIT license (open source, permissive)
- No telemetry or data collection
- No network access (fully local)

**Operational**:
- Timeout: 30s per command (prevents hangs)
- Memory: 100MB limit per operation (prevents exhaustion)
- Output: 100MB max per command (prevents buffer overflow)
- Cache: 15min TTL, size-aware LRU eviction

**Performance**:
- Discovery mode: 100-500ms for 10K files
- Detailed search: 1-5s for 10K files with context
- Cache hit: <1ms for repeated queries
- Pagination overhead: ~10ms per page

## Contributors Guide

### Bug Fixes

**Locate**:
1. Identify which tool is affected (ripgrep, view_structure, find_files, fetch_content)
2. Check tool implementation in `src/tools/`
3. Review command builder in `src/commands/` if command-related
4. Check security validator in `src/security/` if validation-related

**Fix**:
1. Write failing test in `tests/tools/` or `tests/security/`
2. Fix implementation in `src/`
3. Run `yarn test` to verify fix
4. Add regression test if not already covered

**Test**:
```bash
yarn test                         # Run all tests
yarn test:watch                   # TDD mode
yarn lint && yarn build           # Ensure build passes
```

### New Features

**Design**:
1. Review this ARCHITECTURE.md to understand system structure
2. Identify which layer(s) are affected (tools, security, utils)
3. Check if pattern exists in similar features (e.g., adding flag to ripgrep)
4. Design with security in mind (validate inputs, limit resources)

**Implement**:
1. **Add Zod schema** in `src/scheme/` if new parameters
2. **Update tool** in `src/tools/` with new logic
3. **Update command builder** in `src/commands/` if new command flags
4. **Add security checks** in `src/security/` if new risks
5. **Add tests** in `tests/` for new functionality
6. **Update types** in `src/types.ts` if new data structures

**Example** (adding multiline support to ripgrep):
1. Update `RipgrepQuerySchema` in `src/scheme/local_ripgrep.ts`
2. Add `setMultiline()` to `RipgrepCommandBuilder`
3. Update `searchContentRipgrep()` in `src/tools/local_ripgrep.ts`
4. Add tests in `tests/tools/local_ripgrep.test.ts`
5. Document in README.md

**Test**:
```bash
yarn test                         # Unit tests
yarn test:coverage                # Coverage check
yarn build && yarn debug          # Manual testing
```

**Document**:
- Update README.md with user-facing changes
- Update ARCHITECTURE.md if architecture changes (layers, patterns, ADRs)
- Add inline comments for complex logic

### Navigation Tips

**Find Functionality**:
- **Tool implementation**: `src/tools/local_*.ts`
- **Security validation**: `src/security/pathValidator.ts` or `commandValidator.ts`
- **Command building**: `src/commands/*CommandBuilder.ts`
- **Type definitions**: `src/types.ts` or `src/scheme/`
- **Utilities**: `src/utils/`

**Understand Patterns**:
- **Tool pattern**: Read `src/tools/local_ripgrep.ts` (most comprehensive example)
- **Security flow**: Read `src/security/pathValidator.ts` → `commandValidator.ts` → `executionContextValidator.ts`
- **Bulk operations**: Read `src/utils/bulkOperations.ts`
- **Testing patterns**: Read `tests/tools/local_ripgrep.test.ts` (262 tests across all tools)

**Add New Tool**:
1. Create schema in `src/scheme/your_tool.ts`
2. Create tool in `src/tools/your_tool.ts` (follow ripgrep pattern)
3. Add command builder in `src/commands/` if needed
4. Register in `src/tools/toolsManager.ts`
5. Add tests in `tests/tools/your_tool.test.ts`
6. Update types in `src/types.ts`

**Debug Issues**:
- **Security failures**: Check `tests/security/penetration-test.test.ts` for examples
- **Command failures**: Run `yarn debug` to test commands interactively
- **Performance issues**: Check cache stats, use discovery mode, reduce pagination
- **Token limits**: Enable minification, use smaller `charLength`, use discovery mode

## Maintenance

**Last Updated**: 2024-11-05

**Review Schedule**: 
- Quarterly review of architecture (or after major features)
- Security review after any security-related changes
- Dependency updates monthly

**Questions**: [GitHub Issues](https://github.com/bgauryy/local-explorer-mcp/issues)

**Status**: ✅ Current (actively maintained)

**Maintainers**: Octocode Team

**Contributing**: See AGENTS.md for coding guidelines and development workflow


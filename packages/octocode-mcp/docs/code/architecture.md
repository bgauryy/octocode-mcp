# Architecture

## Overview

@octocode/mcp is built with a layered architecture that separates concerns and enables maintainability.

## System Layers

### 1. Protocol Layer
- **MCP Server**: Implements the Model Context Protocol using `@modelcontextprotocol/sdk`
- **Transport**: Uses StdioServerTransport for stdin/stdout communication
- **Capabilities**: Exposes tools, prompts, resources, and logging capabilities

**Implementation**: `src/index.ts`

### 2. Tool Layer
- **Tool Manager**: Centralized tool registration and management (`src/tools/toolsManager.ts`)
- **Tool Implementations**: Individual tool handlers in `src/tools/`
- **Tool Schemas**: Zod validation schemas in `src/scheme/`

**Key Tools**:
- `github_search_repos.ts` - Repository search
- `github_search_code.ts` - Code search
- `github_fetch_content.ts` - Content fetching
- `github_view_repo_structure.ts` - Structure viewing
- `github_search_pull_requests.ts` - PR search

### 3. GitHub Integration Layer
- **GitHub Client**: Octokit REST and GraphQL client (`src/github/client.ts`)
- **API Wrappers**: Specialized GitHub API functions
  - `codeSearch.ts` - Code search operations
  - `repoSearch.ts` - Repository search
  - `pullRequestSearch.ts` - PR search
  - `fileOperations.ts` - File operations
- **Query Builders**: GraphQL query construction (`src/github/queryBuilders.ts`)

### 4. Caching Layer
- **FileCache**: Caches file contents to reduce API calls
- **RepositoryCache**: Caches repository metadata
- **TreeCache**: Caches directory structures
- **Cache Management**: `src/utils/cache.ts`

### 5. Security Layer
- **Content Sanitizer**: Removes sensitive data (`src/security/contentSanitizer.ts`)
- **Token Masking**: Masks GitHub tokens in responses (`src/security/mask.ts`)
- **Validation**: Input validation with security checks (`src/security/withSecurityValidation.ts`)

### 6. Validation Layer
- **Zod Schemas**: Input/output validation
- **Base Schema**: Common schema utilities (`src/scheme/baseSchema.ts`)
- **Tool Schemas**: Per-tool validation schemas

## Design Patterns

### Registry Pattern
Tools are registered centrally in the Tool Manager, allowing dynamic discovery and execution.

### Factory Pattern
Tool instances are created through factory functions with consistent interfaces.

### Strategy Pattern
Different GitHub API strategies (REST vs GraphQL) based on use case.

### Decorator Pattern
Security validation wraps tool execution with sanitization.

## Data Flow

```
MCP Client Request
    ↓
StdioServerTransport
    ↓
MCP Server (Protocol Handler)
    ↓
Tool Manager (Route to Tool)
    ↓
Zod Schema Validation
    ↓
Security Validation
    ↓
Cache Check
    ↓  (if miss)
GitHub API Call
    ↓
Response Sanitization
    ↓
Cache Update
    ↓
MCP Response
```

## Key Components

### Server Initialization
**File**: `src/index.ts`
- Initializes MCP server
- Registers capabilities
- Sets up transport
- Handles graceful shutdown

### Tool Registration
**File**: `src/tools/toolsManager.ts`
- Registers all GitHub tools
- Maps tool names to handlers
- Provides tool metadata

### GitHub Client
**File**: `src/github/client.ts`
- Manages Octokit instance
- Handles authentication
- Provides API abstractions

### Session Management
**File**: `src/session.ts`
- Tracks session state
- Logs session events
- Manages session lifecycle

## Configuration

**File**: `src/serverConfig.ts`
- Server configuration management
- Environment variable handling
- Beta feature flags
- GitHub token management

## Error Handling

**Files**:
- `src/github/errors.ts` - GitHub-specific errors
- `src/github/errorConstants.ts` - Error code constants

Error types:
- Network errors
- Authentication errors
- Rate limit errors
- Validation errors
- API errors

## Performance Optimizations

1. **Multi-level Caching**: Reduces redundant API calls
2. **Bulk Operations**: Batches similar requests (`src/utils/bulkOperations.ts`)
3. **Promise Management**: Efficient async handling (`src/utils/promiseUtils.ts`)
4. **Content Filtering**: Reduces response sizes (`src/utils/fileFilters.ts`)

## Technology Stack

- **Runtime**: Node.js >= 18.0.0
- **Language**: TypeScript 5.7
- **Protocol**: Model Context Protocol (@modelcontextprotocol/sdk)
- **GitHub API**: Octokit (@octokit/rest)
- **Validation**: Zod
- **Transport**: stdio (stdin/stdout)

## Directory Structure

```
src/
├── index.ts                 # Server entry point
├── serverConfig.ts          # Configuration management
├── session.ts               # Session tracking
├── prompts.ts              # MCP prompts
├── resources.ts            # MCP resources
├── sampling.ts             # Sampling capabilities (beta)
├── tools/                  # Tool implementations
│   ├── toolsManager.ts
│   ├── github_*.ts
│   └── ...
├── github/                 # GitHub integration
│   ├── client.ts
│   ├── *Search.ts
│   ├── fileOperations.ts
│   └── ...
├── scheme/                 # Zod schemas
│   ├── baseSchema.ts
│   ├── github_*.ts
│   └── ...
├── security/               # Security layer
│   ├── contentSanitizer.ts
│   ├── mask.ts
│   └── ...
└── utils/                  # Utilities
    ├── cache.ts
    ├── logger.ts
    └── ...
```

## Extension Points

The architecture supports extension through:
- Adding new tools via Tool Manager
- Custom GitHub API wrappers
- Additional caching strategies
- New security validators
- Custom prompts and resources

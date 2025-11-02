# Octocode-MCP Architecture

## System Overview

Octocode-MCP is built on a **layered architecture** with clear separation of concerns, emphasizing security, performance, and maintainability.

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Protocol Layer                        │
│  (stdio transport, tool registration, prompts, resources)   │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                    Tool Layer (5 Tools)                      │
│  githubSearchCode | githubSearchRepos | githubGetFileContent│
│  githubViewRepoStructure | githubSearchPullRequests         │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│              Security & Validation Layer                     │
│  (Zod schemas, content sanitization, secret detection)      │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│               GitHub Integration Layer                       │
│  (Octokit client, API wrappers, error handling)            │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│            Utilities & Infrastructure                        │
│  (caching, bulk operations, logging, session tracking)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. **Security First**
- All inputs validated with Zod schemas
- All outputs sanitized for secrets
- No sensitive data in responses
- Parameter validation before processing

### 2. **Performance Optimized**
- In-memory caching with TTL
- Bulk operation support (5+ parallel queries)
- Token-efficient content minification
- Connection pooling and reuse

### 3. **Resilient Design**
- Multi-layer error handling
- Graceful degradation
- Partial failure isolation
- Automatic retry logic

### 4. **Developer Experience**
- Type-safe TypeScript
- Comprehensive error messages
- Contextual hints for every response
- Clear API surface

### 5. **AI-Optimized**
- Structured, predictable responses
- Research goal tracking
- Reasoning preservation
- Bulk query support for holistic context

---

## Layer Breakdown

### 1. MCP Protocol Layer

**Location:** `src/index.ts`, `src/prompts.ts`, `src/resources.ts`, `src/sampling.ts`

**Responsibilities:**
- Server initialization and lifecycle
- MCP protocol implementation
- Tool registration and routing
- Graceful shutdown handling
- Signal management

**Key Components:**

#### Server Configuration (`src/serverConfig.ts`)
```typescript
interface ServerConfig {
  version: string;
  toolsToRun?: string[];
  enableTools?: string[];
  disableTools?: string[];
  enableLogging: boolean;
  betaEnabled: boolean;
  timeout: number;
  maxRetries: number;
}
```

#### Server Lifecycle
1. **Initialize** - Load configuration, validate token
2. **Register** - Register tools, prompts, resources
3. **Connect** - Establish stdio transport
4. **Serve** - Handle requests
5. **Shutdown** - Clean up resources, clear cache

#### Signal Handling
- `SIGINT` - Graceful shutdown
- `SIGTERM` - Graceful shutdown
- `STDIN_CLOSE` - Client disconnect
- `uncaughtException` - Error logging + shutdown
- `unhandledRejection` - Error logging + shutdown

---

### 2. Tool Layer

**Location:** `src/tools/`

**Responsibilities:**
- Tool implementation
- Request handling
- Response formatting
- Hint generation
- Error recovery

**Architecture Pattern:**

Each tool follows the same pattern:

```typescript
// 1. Register tool with MCP server
export function registerToolName(server: McpServer) {
  server.registerTool(
    TOOL_NAMES.TOOL_NAME,
    {
      description: DESCRIPTIONS[TOOL_NAMES.TOOL_NAME],
      inputSchema: ToolSchema.shape,
    },
    async (args): Promise<CallToolResult> => {
      // 2. Validate input with Zod
      const parsed = ToolSchema.parse(args);
      
      // 3. Execute bulk operation
      return executeBulkOperation<QueryType, ResultType>(
        parsed.queries,
        toolImplementation,
        { toolName: TOOL_NAMES.TOOL_NAME }
      );
    }
  );
}

// 4. Tool implementation
async function toolImplementation(
  query: QueryType
): Promise<ResultType> {
  try {
    // Business logic
    const result = await githubAPI.someOperation(query);
    
    return {
      status: 'hasResults',
      data: result,
      hints: getToolHints('TOOL_NAME', 'hasResults')
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      hints: getToolHints('TOOL_NAME', 'error')
    };
  }
}
```

**Tool Manager** (`src/tools/toolsManager.ts`):
- Centralized tool registration
- Error handling during registration
- Success/failure tracking
- Logging and metrics

**Tool Configuration** (`src/tools/toolConfig.ts`):
- Tool-specific settings
- Feature flags
- Rate limit configs
- Retry strategies

**Tool Utilities** (`src/tools/utils.ts`):
- Shared formatting functions
- Response builders
- Hint generators
- Status mappers

---

### 3. Security & Validation Layer

**Location:** `src/security/`, `src/scheme/`

#### Schema Validation (`src/scheme/`)

All inputs validated with **Zod schemas**:

```typescript
export const GitHubCodeSearchSchema = z.object({
  keywordsToSearch: z.array(z.string()),
  owner: z.string().optional(),
  repo: z.string().optional(),
  extension: z.string().optional(),
  stars: z.string().optional(),
  filename: z.string().optional(),
  path: z.string().optional(),
  match: z.enum(['file', 'path']).optional(),
  limit: z.number().min(1).max(100).optional(),
  // ... more fields
});
```

**Benefits:**
- Runtime type checking
- Automatic validation
- Type inference
- Error messages
- Schema documentation

#### Content Sanitization (`src/security/contentSanitizer.ts`)

**Multi-pattern Secret Detection:**

```typescript
export class ContentSanitizer {
  public static sanitizeContent(content: string): SanitizationResult {
    const secretsResult = this.detectAndMaskSecrets(content);
    
    return {
      content: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
      secretsDetected: secretsResult.secretsDetected,
      warnings: secretsResult.warnings,
    };
  }
  
  private static detectAndMaskSecrets(content: string) {
    let sanitizedContent = content;
    const detected: string[] = [];
    const warnings: string[] = [];
    
    for (const pattern of SECRET_PATTERNS) {
      const matches = sanitizedContent.match(pattern.regex);
      if (matches) {
        // Mask with appropriate replacement
        sanitizedContent = sanitizedContent.replace(
          pattern.regex,
          '[REDACTED]'
        );
        detected.push(pattern.name);
        warnings.push(pattern.description);
      }
    }
    
    return { sanitizedContent, hasSecrets, secretsDetected, warnings };
  }
}
```

**Detected Secret Types** (`src/security/regexes.ts`):
- AWS access keys
- GitHub tokens
- Google API keys
- Private SSH keys
- RSA private keys
- JWT tokens
- Database URLs
- OAuth tokens
- Webhook secrets
- Azure keys
- Stripe keys
- Generic API keys

#### Security Validation Wrapper (`src/security/withSecurityValidation.ts`)

Wraps all tool handlers:

```typescript
export function withSecurityValidation<T>(
  handler: (request: CallToolRequest) => Promise<CallToolResult>
): (request: CallToolRequest) => Promise<CallToolResult> {
  return async (request: CallToolRequest) => {
    try {
      // 1. Validate parameters
      const validation = validateParameters(request.params);
      if (!validation.isValid) {
        return createErrorResponse('Invalid parameters');
      }
      
      // 2. Execute handler
      const result = await handler(request);
      
      // 3. Sanitize response
      const sanitized = ContentSanitizer.sanitizeContent(
        JSON.stringify(result)
      );
      
      return JSON.parse(sanitized.content);
    } catch (error) {
      return createErrorResponse(error.message);
    }
  };
}
```

---

### 4. GitHub Integration Layer

**Location:** `src/github/`

#### Client Configuration (`src/github/client.ts`)

```typescript
export function createGitHubClient(token: string): Octokit {
  return new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        // Log warning
        // Retry once
        return options.request.retryCount === 0;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        // Log warning
        // Don't retry
      },
    },
  });
}
```

#### API Wrappers

Each GitHub API operation has a dedicated module:

**Code Search** (`src/github/codeSearch.ts`):
```typescript
export async function searchCode(
  client: Octokit,
  query: GitHubCodeSearchQuery
): Promise<SearchResult> {
  // Build search query
  const searchQuery = buildCodeSearchQuery(query);
  
  // Execute search
  const response = await client.rest.search.code({
    q: searchQuery,
    per_page: query.limit || 30,
  });
  
  // Process results
  return processCodeSearchResults(response.data, query);
}
```

**Repository Search** (`src/github/repoSearch.ts`):
```typescript
export async function searchRepositories(
  client: Octokit,
  query: GitHubReposSearchQuery
): Promise<RepoSearchResult> {
  // Build query
  const searchQuery = buildRepoSearchQuery(query);
  
  // Execute search
  const response = await client.rest.search.repos({
    q: searchQuery,
    sort: query.sort || 'best-match',
    per_page: query.limit || 10,
  });
  
  // Format results
  return formatRepositoryResults(response.data);
}
```

**File Operations** (`src/github/fileOperations.ts`):
```typescript
export async function fetchFileContent(
  client: Octokit,
  query: FileContentQuery
): Promise<ContentResult> {
  // Fetch file from GitHub
  const response = await client.rest.repos.getContent({
    owner: query.owner,
    repo: query.repo,
    path: query.path,
    ref: query.branch,
  });
  
  // Decode content
  const content = Buffer.from(response.data.content, 'base64').toString();
  
  // Apply mode (fullContent, range, matchString)
  const processed = applyContentMode(content, query);
  
  // Minify if requested
  if (query.minified) {
    processed.content = minifyContent(processed.content);
  }
  
  return processed;
}
```

**Pull Request Search** (`src/github/pullRequestSearch.ts`):
```typescript
export async function searchPullRequests(
  client: Octokit,
  query: GitHubPullRequestSearchQuery
): Promise<PullRequestSearchResult> {
  // Direct PR fetch or search
  if (query.prNumber) {
    return fetchSinglePR(client, query);
  } else {
    return searchPRs(client, query);
  }
}
```

#### Query Builders (`src/github/queryBuilders.ts`)

Convert structured queries to GitHub search syntax:

```typescript
export function buildCodeSearchQuery(
  query: GitHubCodeSearchQuery
): string {
  const parts: string[] = [];
  
  // Keywords (required)
  parts.push(query.keywordsToSearch.join(' '));
  
  // Repository scope
  if (query.owner && query.repo) {
    parts.push(`repo:${query.owner}/${query.repo}`);
  } else if (query.owner) {
    parts.push(`org:${query.owner}`);
  }
  
  // Filters
  if (query.extension) {
    parts.push(`extension:${query.extension}`);
  }
  if (query.filename) {
    parts.push(`filename:${query.filename}`);
  }
  if (query.path) {
    parts.push(`path:${query.path}`);
  }
  if (query.stars) {
    parts.push(`stars:${query.stars}`);
  }
  
  return parts.join(' ');
}
```

#### Error Handling (`src/github/errors.ts`, `src/github/errorConstants.ts`)

Comprehensive GitHub API error handling:

```typescript
export function handleGitHubError(error: unknown): GitHubAPIError {
  if (error.status === 404) {
    return {
      type: 'NOT_FOUND',
      message: 'Repository or resource not found',
      status: 404,
    };
  } else if (error.status === 403) {
    if (error.message.includes('rate limit')) {
      return {
        type: 'RATE_LIMIT',
        message: 'API rate limit exceeded',
        status: 403,
        retryAfter: error.response.headers['x-ratelimit-reset'],
      };
    }
    return {
      type: 'FORBIDDEN',
      message: 'Access forbidden',
      status: 403,
    };
  } else if (error.status === 401) {
    return {
      type: 'UNAUTHORIZED',
      message: 'Authentication required or invalid',
      status: 401,
    };
  }
  
  return {
    type: 'UNKNOWN',
    message: error.message || 'Unknown error',
    status: error.status,
  };
}
```

---

### 5. Utilities & Infrastructure

**Location:** `src/utils/`

#### Caching System (`src/utils/cache.ts`)

**In-memory caching with NodeCache:**

```typescript
class CacheManager {
  private cache: NodeCache;
  private stats: CacheStats;
  
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 86400, // 24 hours
      checkperiod: 600, // Check every 10 minutes
      maxKeys: 1000, // Prevent unbounded growth
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      totalKeys: 0,
      lastReset: new Date(),
    };
  }
  
  public get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    
    if (value) {
      this.stats.hits++;
      return value;
    } else {
      this.stats.misses++;
      return undefined;
    }
  }
  
  public set<T>(key: string, value: T, ttl?: number): boolean {
    const success = this.cache.set(key, value, ttl);
    if (success) {
      this.stats.sets++;
      this.stats.totalKeys = this.cache.keys().length;
    }
    return success;
  }
  
  public clear(): void {
    this.cache.flushAll();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      totalKeys: 0,
      lastReset: new Date(),
    };
  }
}
```

**Cache Key Generation:**
```typescript
export function generateCacheKey(
  toolName: string,
  params: Record<string, unknown>
): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return `${toolName}:${md5(normalized)}`;
}
```

#### Bulk Operations (`src/utils/bulkOperations.ts`)

**Parallel query processing with error isolation:**

```typescript
export async function executeBulkOperation<TQuery, TResult>(
  queries: TQuery[],
  handler: (query: TQuery) => Promise<TResult>,
  config: BulkResponseConfig
): Promise<CallToolResult> {
  // Execute all queries in parallel
  const results = await Promise.allSettled(
    queries.map(query => handler(query))
  );
  
  // Process results
  const processed = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return {
        query: queries[index],
        status: result.value.status,
        data: result.value.data,
        researchGoal: queries[index].researchGoal,
        reasoning: queries[index].reasoning,
      };
    } else {
      return {
        query: queries[index],
        status: 'error',
        error: result.reason.message,
        hints: getErrorHints(config.toolName),
      };
    }
  });
  
  // Format response
  return formatBulkResponse(processed, config);
}
```

**Response Formatting:**
```typescript
export function formatBulkResponse<TResult>(
  results: ProcessedBulkResult<TResult>[],
  config: BulkResponseConfig
): CallToolResult {
  const summary = {
    total: results.length,
    hasResults: results.filter(r => r.status === 'hasResults').length,
    empty: results.filter(r => r.status === 'empty').length,
    errors: results.filter(r => r.status === 'error').length,
  };
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        instructions: generateInstructions(summary, config.toolName),
        results,
        summary,
        hasResultsStatusHints: getToolHints(config.toolName, 'hasResults'),
        emptyStatusHints: getToolHints(config.toolName, 'empty'),
        errorStatusHints: getToolHints(config.toolName, 'error'),
      }, null, 2),
    }],
  };
}
```

#### Logging System (`src/utils/logger.ts`)

**Structured logging with MCP protocol:**

```typescript
export class Logger {
  constructor(
    private server: McpServer,
    private context: string
  ) {}
  
  async info(message: string, data?: Record<string, unknown>) {
    await this.server.sendLoggingMessage({
      level: 'info',
      data: {
        context: this.context,
        message,
        ...data,
      },
    });
  }
  
  async error(message: string, data?: Record<string, unknown>) {
    await this.server.sendLoggingMessage({
      level: 'error',
      data: {
        context: this.context,
        message,
        ...data,
      },
    });
  }
  
  async warning(message: string, data?: Record<string, unknown>) {
    await this.server.sendLoggingMessage({
      level: 'warning',
      data: {
        context: this.context,
        message,
        ...data,
      },
    });
  }
}

export class LoggerFactory {
  static getLogger(server: McpServer, context: string): Logger {
    return new Logger(server, context);
  }
}
```

#### Promise Utilities (`src/utils/promiseUtils.ts`)

**Advanced promise handling:**

```typescript
export async function executeBatch<T>(
  promises: Promise<T>[],
  options: PromiseExecutionOptions = {}
): Promise<PromiseResult<T>[]> {
  const {
    timeout = 30000,
    continueOnError = true,
    concurrency = 5,
    onError,
  } = options;
  
  const results: PromiseResult<T>[] = [];
  
  // Execute with concurrency control
  for (let i = 0; i < promises.length; i += concurrency) {
    const batch = promises.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((p, idx) => 
        Promise.race([
          p,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ])
      )
    );
    
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push({
          success: true,
          data: result.value,
          index: i + idx,
        });
      } else {
        if (onError) {
          onError(result.reason, i + idx);
        }
        
        results.push({
          success: false,
          error: result.reason,
          index: i + idx,
        });
        
        if (!continueOnError) {
          throw result.reason;
        }
      }
    });
  }
  
  return results;
}
```

---

## Data Flow

### Request Flow

```
1. Client Request
   ↓
2. MCP Protocol Layer
   - Parse request
   - Route to tool
   ↓
3. Tool Layer
   - Register handler
   - Invoke tool function
   ↓
4. Security Layer
   - Validate input (Zod)
   - Sanitize parameters
   ↓
5. Bulk Operations
   - Parse queries
   - Execute in parallel
   ↓
6. GitHub API Layer
   - Build query
   - Execute API call
   - Handle errors
   ↓
7. Response Processing
   - Format results
   - Generate hints
   - Detect status
   ↓
8. Security Layer
   - Sanitize content
   - Mask secrets
   - Add warnings
   ↓
9. Response Formatting
   - Structure response
   - Add metadata
   - Include hints
   ↓
10. Client Response
```

### Cache Flow

```
Request → Check Cache
            ↓
        Cache Hit? ──Yes→ Return Cached Result
            ↓ No
        Execute Operation
            ↓
        Success? ──Yes→ Cache Result (TTL: 24h)
            ↓ No
        Return Error (No Cache)
```

### Error Flow

```
Error Occurs
    ↓
Identify Error Type
    ├── GitHub API Error
    │   ├── Rate Limit → Retry with backoff
    │   ├── Not Found → Return with hints
    │   ├── Auth Error → Return with token check
    │   └── Other → Log and return
    │
    ├── Validation Error
    │   └── Return with parameter hints
    │
    ├── Network Error
    │   └── Retry with exponential backoff
    │
    └── Unknown Error
        └── Log, return generic error
```

---

## Design Patterns

### 1. **Factory Pattern**
- `LoggerFactory` - Creates contextual loggers
- `ClientFactory` - Creates configured Octokit clients

### 2. **Wrapper Pattern**
- `withSecurityValidation` - Wraps tool handlers with security
- Promise wrappers - Add timeout and error handling

### 3. **Builder Pattern**
- Query builders - Construct GitHub search queries
- Response builders - Format tool responses

### 4. **Strategy Pattern**
- Content modes - Different strategies for fetching content
- Error handling - Different strategies per error type

### 5. **Observer Pattern**
- Session tracking - Observe tool calls
- Cache statistics - Observe cache operations

### 6. **Singleton Pattern**
- Cache manager - Single instance
- GitHub client - Shared connection pool

---

## Performance Considerations

### Bottlenecks

1. **GitHub API Rate Limits**
   - Search: 30 req/min
   - Core: 5000 req/hour
   - **Mitigation**: Caching, bulk operations, retry logic

2. **Network Latency**
   - API round trips
   - **Mitigation**: Parallel queries, connection pooling

3. **Content Processing**
   - Large files
   - **Mitigation**: Partial reads, minification, streaming

4. **Memory Usage**
   - Cache growth
   - **Mitigation**: Max 1000 keys, TTL expiration

### Optimization Strategies

1. **Bulk Operations**
   - Process 5+ queries in parallel
   - Shared context for AI reasoning
   - Single network round-trip

2. **Smart Caching**
   - 24-hour TTL
   - Cache only successful operations
   - MD5 cache keys for efficiency

3. **Content Minification**
   - Remove whitespace
   - Strip comments
   - Compact JSON

4. **Partial Content Reads**
   - Line ranges instead of full files
   - Match strings for targeted extraction
   - Reduces token usage

---

## Security Model

### Defense in Depth

**Layer 1: Input Validation**
- Zod schema validation
- Type checking
- Range validation
- Pattern matching

**Layer 2: Parameter Sanitization**
- Remove dangerous characters
- Escape special chars
- Length limits

**Layer 3: Content Sanitization**
- Secret detection (50+ patterns)
- Masking/redaction
- Warning generation

**Layer 4: Output Filtering**
- Final content scan
- Security headers
- Safe JSON encoding

### Threat Model

**Threats Mitigated:**
- ✅ Secret exposure (API keys, tokens)
- ✅ Injection attacks (prompt, code)
- ✅ Rate limit abuse
- ✅ Unauthorized access
- ✅ Resource exhaustion

**Threats Not Mitigated:**
- ❌ GitHub account compromise (user responsibility)
- ❌ MCP protocol vulnerabilities (SDK responsibility)
- ❌ Network MITM (HTTPS assumed)

---

## Extensibility

### Adding New Tools

1. **Create schema** (`src/scheme/new_tool.ts`)
```typescript
export const NewToolSchema = z.object({
  // Define parameters
});
```

2. **Implement tool** (`src/tools/new_tool.ts`)
```typescript
export async function newTool(
  query: NewToolQuery
): Promise<NewToolResult> {
  // Implementation
}

export function registerNewTool(server: McpServer) {
  server.registerTool(/* ... */);
}
```

3. **Add to constants** (`src/constants.ts`)
```typescript
export const TOOL_NAMES = {
  // ...
  NEW_TOOL: 'newToolName',
};
```

4. **Register in manager** (`src/tools/toolsManager.ts`)
```typescript
import { registerNewTool } from './new_tool.js';

export function registerTools(server: McpServer) {
  // ...
  registerNewTool(server);
}
```

5. **Add descriptions** (`src/tools/descriptions.ts`)
```typescript
export const DESCRIPTIONS = {
  // ...
  [TOOL_NAMES.NEW_TOOL]: 'Tool description...',
};
```

6. **Add hints** (`src/tools/hints.ts`)
```typescript
export const TOOL_HINTS = {
  // ...
  NEW_TOOL: {
    hasResults: ['...'],
    empty: ['...'],
    error: ['...'],
  },
};
```

### Adding New GitHub Operations

1. Create module in `src/github/`
2. Implement API wrapper
3. Add error handling
4. Export from `src/github/index.ts`
5. Use in tool implementation

---

## Testing Strategy

### Unit Tests
- Individual functions
- Utilities
- Query builders
- Formatters

### Integration Tests
- Tool end-to-end
- GitHub API integration
- Security validation
- Bulk operations

### Performance Tests
- Cache efficiency
- Bulk operation speed
- Memory usage
- Rate limit handling

---

## Monitoring & Observability

### Metrics Tracked
- Tool call counts
- Error rates
- Cache hit ratio
- Response times
- GitHub API usage

### Session Tracking
- Session IDs
- Tool usage patterns
- Error frequencies
- Repository access patterns

### Logging Levels
- **INFO**: Normal operations
- **WARNING**: Recoverable issues
- **ERROR**: Failures requiring attention

---

## Future Enhancements

### Planned Features
- [ ] GraphQL API support
- [ ] Webhook integration
- [ ] Advanced search syntax
- [ ] Custom caching strategies
- [ ] Multi-user support
- [ ] Rate limit optimization
- [ ] Streaming responses

### Performance Improvements
- [ ] Connection pooling
- [ ] Request batching
- [ ] Compression
- [ ] Distributed caching

### Security Enhancements
- [ ] Additional secret patterns
- [ ] Content filtering rules
- [ ] Audit logging
- [ ] Access control

---

**Architecture Version:** 7.0.0  
**Last Updated:** October 2024

For implementation details, see source code documentation and inline comments.


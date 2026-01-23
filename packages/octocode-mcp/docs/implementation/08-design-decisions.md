# Design Decisions

This document explains the key architectural and design decisions made in octocode-mcp, including rationale, trade-offs, and alternatives considered.

## Table of Contents

1. [Overview](#overview)
2. [Provider Pattern](#provider-pattern)
3. [Bulk Query Pattern](#bulk-query-pattern)
4. [Zod for Validation](#zod-for-validation)
5. [Caching Strategy](#caching-strategy)
6. [Command Builder Pattern](#command-builder-pattern)
7. [Minification Strategy](#minification-strategy)
8. [Session Logging](#session-logging)
9. [Error Handling Design](#error-handling-design)
10. [TypeScript Configuration](#typescript-configuration)

---

## Overview

Octocode-mcp is designed as a production-ready MCP server with enterprise-grade reliability, security, and performance. Every design decision balances:

- **Developer Experience**: Easy to extend and maintain
- **Performance**: Fast responses and efficient resource usage
- **Security**: Defense in depth with minimal false positives
- **Compatibility**: Works with multiple MCP clients and platforms

---

## Provider Pattern

### Decision

Abstract code hosting platforms (GitHub, GitLab) behind a unified `ICodeHostProvider` interface with dynamic provider selection.

### Location

```
src/providers/factory.ts
src/providers/types.ts
src/providers/github/GitHubProvider.ts
src/providers/gitlab/GitLabProvider.ts
```

### Architecture

```
┌─────────────────────────────────────────────┐
│          Tool Implementation                │
│     (githubSearchCode, etc.)                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Execution Layer                     │
│     (executeProviderQuery)                  │
│     - Routing logic                         │
│     - Error handling                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Provider Factory                    │
│     (getProvider)                           │
│     - Provider registry                     │
│     - Instance caching                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      ICodeHostProvider Interface            │
│     - searchCode()                          │
│     - getFileContent()                      │
│     - searchRepositories()                  │
│     - searchPullRequests()                  │
│     - viewRepoStructure()                   │
└─────────────────────────────────────────────┘
        ↓                           ↓
┌──────────────────┐      ┌──────────────────┐
│ GitHubProvider   │      │ GitLabProvider   │
└──────────────────┘      └──────────────────┘
```

### Rationale

**Problem:**
- Need to support multiple code hosting platforms
- Each platform has different API semantics and authentication
- Tools shouldn't depend on platform-specific code

**Solution:**
- Define unified query/result types
- Abstract platform differences behind provider interface
- Route requests dynamically based on configuration or query parameter

**Benefits:**

1. **Extensibility**: Adding new platforms (Bitbucket, Azure DevOps) requires:
   - Implement `ICodeHostProvider`
   - Register in factory
   - No changes to tool code

2. **Instance Caching**: Providers cached based on `(type, baseURL, tokenHash)`
   ```typescript
   const cacheKey = `${type}:${baseURL}:${hashToken(token)}`;
   ```

3. **Dynamic Selection**: Per-query provider switching
   ```typescript
   const query = {
     provider: 'gitlab',  // Override default
     owner: 'gitlab-org',
     repo: 'gitlab'
   };
   ```

4. **Separation of Concerns**: Tool logic isolated from API details
   - Tools work with generic `CodeSearchQuery`
   - Providers handle platform specifics
   - Execution layer handles routing

### Example

**Tool Layer:**
```typescript
// Tool doesn't know about GitHub/GitLab
async function executeGitHubSearchCode(query: CodeSearchQuery) {
  return await executeProviderQuery(
    query,
    (provider) => provider.searchCode(query)
  );
}
```

**Provider Layer:**
```typescript
// GitHub implementation
class GitHubProvider implements ICodeHostProvider {
  async searchCode(query: CodeSearchQuery): Promise<CodeSearchResult> {
    // Convert generic query to GitHub API format
    const githubQuery = buildGitHubSearchQuery(query);
    const response = await this.client.search.code(githubQuery);
    // Convert GitHub response to generic format
    return formatCodeSearchResult(response);
  }
}
```

### Trade-offs

**Pros:**
- Easy to add new platforms
- Clean separation of concerns
- Testable (mock providers)
- Efficient caching

**Cons:**
- Abstraction overhead (but minimal)
- Unified types may limit platform-specific features
- Requires mapping between generic and platform-specific formats

### Alternatives Considered

1. **Direct API calls in tools**
   - Rejected: Duplicates code, hard to extend
   - Would need `githubSearchCode` + `gitlabSearchCode` + ...

2. **Strategy pattern without registry**
   - Rejected: Less flexible, harder to configure
   - Provider selection would be hardcoded

3. **Plugin system**
   - Rejected: Over-engineered for current needs
   - May revisit for community extensions

---

## Bulk Query Pattern

### Decision

All tools accept arrays of queries (1-5 for GitHub, 1-5 for local) in a single request, executing them in parallel.

### Location

```
src/scheme/baseSchema.ts (createBulkQuerySchema)
src/utils/response/bulk.ts (executeBulkOperation)
```

### Schema Structure

```typescript
// Before: Single query per request
{
  owner: "facebook",
  repo: "react",
  pattern: "useState"
}

// After: Bulk queries per request
{
  queries: [
    {
      mainResearchGoal: "...",
      researchGoal: "...",
      reasoning: "...",
      owner: "facebook",
      repo: "react",
      pattern: "useState"
    },
    {
      mainResearchGoal: "...",
      researchGoal: "...",
      reasoning: "...",
      owner: "vercel",
      repo: "next.js",
      pattern: "useEffect"
    }
  ]
}
```

### Rationale

**Problem:**
- AI research workflows require exploring multiple paths
- Sequential requests have high latency (round-trips + network)
- GitHub rate limits are per-hour, not per-request
- Users need to compare multiple repositories/patterns

**Solution:**
- Accept 1-N queries in a single tool call
- Execute queries in parallel (Promise.all)
- Return all results in a single response

**Benefits:**

1. **Reduced Latency**: 5 parallel queries vs 5 sequential requests
   ```
   Sequential: 5 × (network + processing) = 5000ms
   Parallel:   max(network + processing) = 1200ms
   ```

2. **Efficient Rate Limit Usage**
   ```typescript
   // Same rate limit cost
   5 separate tool calls = 5 API requests
   1 bulk call with 5 queries = 5 API requests
   // But bulk is much faster
   ```

3. **Research Context Preserved**
   ```typescript
   {
     mainResearchGoal: "Compare React hooks usage",
     queries: [
       { repo: "react", pattern: "useState" },
       { repo: "preact", pattern: "useState" },
       { repo: "vue", pattern: "ref" }
     ]
   }
   ```

4. **Better Error Handling**
   ```typescript
   // Per-query error tracking
   {
     results: [
       { success: true, data: {...} },
       { success: false, error: "Rate limited" },
       { success: true, data: {...} }
     ]
   }
   ```

### Implementation

**Schema Creation:**
```typescript
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T,
  options: { maxQueries?: number; descriptionPrefix?: string } = {}
) {
  const { maxQueries = 3 } = options;

  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(1)
      .max(maxQueries)
      .describe(`Queries for ${toolName} (1–${maxQueries} per call)`)
  });
}
```

**Execution:**
```typescript
export async function executeBulkOperation<Query, Result>(
  queries: Query[],
  executeFunction: (query: Query) => Promise<Result>,
  options?: BulkExecutionOptions
): Promise<BulkOperationResult<Result>> {
  const results = await Promise.allSettled(
    queries.map(query => executeFunction(query))
  );

  return {
    results: results.map(formatResult),
    totalQueries: queries.length,
    successCount: results.filter(r => r.status === 'fulfilled').length
  };
}
```

### Query Limits

| Tool Category | Max Queries | Rationale |
|--------------|-------------|-----------|
| GitHub Tools | 3 | API rate limits, network latency |
| Local Tools | 5 | No external API, faster execution |
| LSP Tools | 3-5 | Depends on complexity (call hierarchy: 3, others: 5) |

### Research Fields

Each query includes context for logging and debugging:

```typescript
interface ResearchQuery {
  mainResearchGoal?: string;  // Overall objective (shared across queries)
  researchGoal?: string;      // Specific goal for this query
  reasoning?: string;         // Why this query helps reach the goal
  // ... query-specific fields
}
```

### Trade-offs

**Pros:**
- Dramatically reduced latency for multi-query workflows
- Same rate limit cost as sequential
- Better error handling (partial success)
- Maintains research context

**Cons:**
- More complex schema validation
- Potential for resource exhaustion (limited by maxQueries)
- Larger responses (but more efficient overall)

### Alternatives Considered

1. **Single query per request**
   - Rejected: Too slow for research workflows
   - 5 queries × 1s latency = 5s vs 1.2s with bulk

2. **Unlimited queries per request**
   - Rejected: Resource exhaustion risk
   - Could overwhelm GitHub API rate limits
   - Capped at 3-5 based on tool type

3. **Streaming responses**
   - Considered: Return results as they complete
   - Rejected: MCP protocol doesn't support streaming
   - May revisit in future

---

## Zod for Validation

### Decision

Use Zod (v3.24.0) for all input validation and TypeScript type inference.

### Location

```
All scheme.ts files (e.g., src/tools/github_search_code/scheme.ts)
```

### Rationale

**Problem:**
- Need runtime validation of tool inputs
- Want compile-time type safety
- MCP requires JSON Schema for tool registration
- Tool inputs come from untrusted sources (AI, users)

**Solution:**
- Define schemas with Zod
- Infer TypeScript types from schemas
- Validate all inputs at runtime
- Convert to JSON Schema for MCP

**Benefits:**

1. **Type-Safe Runtime Validation**
   ```typescript
   const QuerySchema = z.object({
     owner: z.string().min(1).max(200),
     repo: z.string().min(1).max(150),
     pattern: z.string().min(1)
   });

   type Query = z.infer<typeof QuerySchema>;  // TypeScript type

   const query: Query = QuerySchema.parse(input);  // Runtime check
   ```

2. **Composable Schemas**
   ```typescript
   const BaseQuery = z.object({
     mainResearchGoal: z.string(),
     researchGoal: z.string(),
     reasoning: z.string()
   });

   const CodeSearchQuery = BaseQuery.extend({
     owner: z.string(),
     repo: z.string(),
     pattern: z.string()
   });
   ```

3. **Rich Validation Rules**
   ```typescript
   z.string().min(1).max(255)
   z.number().int().positive().max(100)
   z.enum(['file', 'path'])
   z.array(z.string()).max(5)
   z.object({ ... }).refine(
     data => !(data.startLine && !data.endLine),
     { message: 'endLine required when startLine is provided' }
   )
   ```

4. **Detailed Error Messages**
   ```typescript
   try {
     QuerySchema.parse(input);
   } catch (error) {
     if (error instanceof z.ZodError) {
       console.error(error.issues);
       // [
       //   { path: ['owner'], message: 'String must contain at least 1 character(s)' },
       //   { path: ['repo'], message: 'Required' }
       // ]
     }
   }
   ```

5. **JSON Schema Generation**
   ```typescript
   // Convert to MCP tool schema
   const jsonSchema = zodToJsonSchema(QuerySchema);
   server.addTool({
     name: 'toolName',
     description: '...',
     inputSchema: jsonSchema
   });
   ```

### Example Usage

**Define Schema:**
```typescript
// src/tools/github_search_code/scheme.ts
export const GitHubCodeSearchQuerySchema = z.object({
  mainResearchGoal: z.string(),
  researchGoal: z.string(),
  reasoning: z.string(),
  owner: z.string().max(200),
  repo: z.string().max(150),
  keywordsToSearch: z.array(z.string()).min(1).max(5),
  match: z.enum(['file', 'path']).optional(),
  extension: z.string().optional()
}).refine(
  // Custom validation: don't combine too many filters
  data => {
    const filterCount = [
      data.extension,
      data.path,
      data.filename
    ].filter(Boolean).length;
    return filterCount <= 2;
  },
  { message: 'Maximum 2 file filters allowed' }
);

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  'githubSearchCode',
  GitHubCodeSearchQuerySchema,
  { maxQueries: 3 }
);

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;
```

**Validate Input:**
```typescript
// Tool execution
async function executeGitHubSearchCode(input: unknown) {
  // Runtime validation
  const validated = GitHubCodeSearchBulkQuerySchema.parse(input);

  // TypeScript knows 'validated.queries' is GitHubCodeSearchQuery[]
  for (const query of validated.queries) {
    console.log(query.owner, query.repo);  // Type-safe access
  }
}
```

### Trade-offs

**Pros:**
- Single source of truth for types and validation
- Excellent TypeScript integration
- Composable and reusable schemas
- Great error messages
- JSON Schema generation

**Cons:**
- Bundle size (but acceptable for Node.js server)
- Learning curve (but good documentation)
- Some complex validations verbose (but readable)

### Alternatives Considered

1. **Manual validation**
   - Rejected: Error-prone, duplicates type definitions
   - No automatic TypeScript inference

2. **JSON Schema directly**
   - Rejected: No TypeScript integration
   - Harder to maintain
   - Verbose syntax

3. **Joi**
   - Rejected: No TypeScript inference
   - Larger bundle size
   - Less active maintenance

4. **TypeBox**
   - Considered: Good alternative
   - Rejected: Zod has better ecosystem and documentation

---

## Caching Strategy

### Decision

Use node-cache with per-prefix TTL configuration and SHA-256 hashed cache keys.

### Location

```
src/utils/http/cache.ts
```

### Configuration

```typescript
const cache = new NodeCache({
  stdTTL: 86400,        // Default: 24 hours
  checkperiod: 3600,    // Check for expired keys every 1 hour
  maxKeys: 5000,        // Maximum 5000 cached items
  deleteOnExpire: true,
  useClones: false      // Performance: return references
});

const CACHE_TTL_CONFIG = {
  'gh-api-code': 3600,              // 1 hour
  'gh-api-repos': 7200,             // 2 hours
  'gh-api-prs': 1800,               // 30 minutes
  'gh-api-file-content': 3600,      // 1 hour
  'gh-repo-structure-api': 7200,    // 2 hours
  'github-user': 900,               // 15 minutes
  'npm-search': 14400,              // 4 hours
  'pypi-search': 14400,             // 4 hours
  default: 86400                    // 24 hours
};
```

### Cache Key Strategy

```typescript
const VERSION = 'v1';  // Invalidate all caches when changed

function generateCacheKey(prefix: string, params: object): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .substring(0, 16);  // First 16 chars

  return `${VERSION}-${prefix}:${hash}`;
}

// Example keys:
// v1-gh-api-code:a3f5b8c2e1d4f6a7
// v1-npm-search:c8e2a4f6b1d3e5a7
```

### Rationale

**Problem:**
- GitHub API has rate limits (5000/hour authenticated)
- Repeated searches for same query waste resources
- File content rarely changes within short time periods
- Package metadata updates infrequently

**Solution:**
- Cache all API responses in memory
- Use versioned keys for invalidation
- Different TTLs based on data volatility
- Deduplicate concurrent identical requests

**Benefits:**

1. **Rate Limit Conservation**
   ```typescript
   // Without cache: 100 identical queries = 100 API calls
   // With cache: 100 identical queries = 1 API call + 99 cache hits
   ```

2. **Faster Responses**
   ```
   Cache hit:  <5ms
   API call:   200-1000ms
   ```

3. **Concurrent Request Deduplication**
   ```typescript
   // Two identical requests arrive simultaneously
   const pending = new Map<string, Promise<any>>();

   if (pending.has(key)) {
     return await pending.get(key);  // Reuse first request
   }

   const promise = fetchData();
   pending.set(key, promise);
   const result = await promise;
   pending.delete(key);
   cache.set(key, result);
   ```

4. **Per-Resource TTL**
   ```typescript
   function getTTL(prefix: string): number {
     return CACHE_TTL_CONFIG[prefix] ?? CACHE_TTL_CONFIG.default;
   }

   // Short TTL for volatile data (PRs, user info)
   // Long TTL for stable data (file content, package info)
   ```

### Cache Statistics

```typescript
export function getCacheStats() {
  const stats = cache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses),
    ksize: stats.ksize,  // Key count
    vsize: stats.vsize   // Value count
  };
}
```

### Cache Invalidation

**Version-Based:**
```typescript
// Change VERSION to invalidate all caches
const VERSION = 'v2';  // All v1 keys ignored
```

**Manual:**
```typescript
export function invalidateCache(prefix?: string) {
  if (prefix) {
    const keys = cache.keys().filter(k => k.includes(prefix));
    cache.del(keys);
  } else {
    cache.flushAll();
  }
}
```

**Time-Based:**
```typescript
// Automatic via node-cache TTL
// Keys expire after their configured TTL
```

### Trade-offs

**Pros:**
- Simple, no external dependencies
- Automatic expiration
- Memory-efficient (useClones: false)
- Per-prefix TTL flexibility
- Built-in statistics

**Cons:**
- In-memory only (lost on restart)
- No distributed caching (single-process)
- No persistence
- Memory usage grows with cached items (limited by maxKeys)

### Alternatives Considered

1. **Redis**
   - Rejected: Overkill for single-process MCP server
   - Adds deployment complexity
   - Slower than in-memory (network overhead)

2. **lru-cache**
   - Considered: Good alternative
   - Rejected: node-cache has better TTL support and statistics

3. **No caching**
   - Rejected: Wastes API rate limits and slows responses

4. **File-based cache**
   - Rejected: Slower than memory, adds I/O overhead
   - Would persist across restarts (not needed for MCP)

---

## Command Builder Pattern

### Decision

Use abstract `BaseCommandBuilder` class with concrete builders for each system command.

### Location

```
src/commands/BaseCommandBuilder.ts
src/commands/FindCommandBuilder.ts
src/commands/GrepCommandBuilder.ts
src/commands/RipgrepCommandBuilder.ts
src/commands/LsCommandBuilder.ts
```

### Architecture

```typescript
abstract class BaseCommandBuilder {
  protected command: string;
  protected args: string[] = [];

  addFlag(flag: string): this;
  protected addOption(option: string, value: string | number): this;
  protected addArg(arg: string): this;

  build(): { command: string; args: string[] };
  reset(): this;
}

class RipgrepCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('rg');
  }

  fromQuery(query: RipgrepQuery): this {
    // Convert query to command arguments
    if (query.caseInsensitive) this.addFlag('--ignore-case');
    if (query.lineNumbers) this.addFlag('--line-number');
    if (query.contextLines) this.addOption('--context', query.contextLines);
    // ...
    return this;
  }
}
```

### Rationale

**Problem:**
- Need to construct shell commands safely
- Prevent command injection vulnerabilities
- Support complex command options (ripgrep has 100+ flags)
- Want to test command building separately from execution

**Solution:**
- Separate command from arguments
- Builder pattern for fluent API
- No string concatenation or interpolation
- Abstract base class for common functionality

**Benefits:**

1. **Injection Prevention**
   ```typescript
   // ✅ Safe - arguments are separate
   { command: 'rg', args: ['--', userPattern, userPath] }

   // ❌ Unsafe - string concatenation
   const cmd = `rg ${userPattern} ${userPath}`;  // Injection risk!
   ```

2. **Fluent API**
   ```typescript
   const { command, args } = new RipgrepCommandBuilder()
     .fromQuery(query)
     .build();

   // Versus manual:
   const args = [];
   if (query.caseInsensitive) args.push('--ignore-case');
   if (query.lineNumbers) args.push('--line-number');
   // ... 50 more lines
   ```

3. **Reusable and Testable**
   ```typescript
   describe('RipgrepCommandBuilder', () => {
     it('should handle case insensitive search', () => {
       const builder = new RipgrepCommandBuilder();
       const { args } = builder.fromQuery({
         pattern: 'foo',
         path: '/path',
         caseInsensitive: true
       }).build();

       expect(args).toContain('--ignore-case');
     });
   });
   ```

4. **Immutable Builds**
   ```typescript
   const builder = new RipgrepCommandBuilder();
   const cmd1 = builder.fromQuery(query1).build();
   builder.reset();  // Clear previous args
   const cmd2 = builder.fromQuery(query2).build();
   ```

### Example: Ripgrep Builder

```typescript
export class RipgrepCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('rg');
  }

  fromQuery(query: RipgrepQuery): this {
    // Case sensitivity
    if (query.caseInsensitive) this.addFlag('--ignore-case');
    if (query.caseSensitive) this.addFlag('--case-sensitive');

    // Output format
    if (query.lineNumbers) this.addFlag('--line-number');
    if (query.column) this.addFlag('--column');
    if (query.jsonOutput) this.addFlag('--json');

    // Context
    if (query.contextLines) this.addOption('--context', query.contextLines);
    if (query.beforeContext) this.addOption('--before-context', query.beforeContext);
    if (query.afterContext) this.addOption('--after-context', query.afterContext);

    // File filtering
    if (query.type) this.addOption('--type', query.type);
    if (query.glob) this.addOption('--glob', query.glob);
    query.exclude?.forEach(pattern => this.addOption('--glob', `!${pattern}`));

    // Pattern and path (last, after --)
    this.addFlag('--');  // Separator for safety
    this.addArg(query.pattern);
    this.addArg(query.path);

    return this;
  }
}

// Usage
const builder = new RipgrepCommandBuilder();
const { command, args } = builder.fromQuery({
  pattern: 'TODO',
  path: '/workspace',
  caseInsensitive: true,
  lineNumbers: true,
  contextLines: 2
}).build();

// Results in:
// command: 'rg'
// args: ['--ignore-case', '--line-number', '--context', '2', '--', 'TODO', '/workspace']
```

### Safety Features

1. **Argument Separator (`--`)**
   ```typescript
   // Prevents pattern/path from being interpreted as flags
   this.addFlag('--');
   this.addArg(userPattern);  // Even if userPattern starts with '-'
   ```

2. **No Shell Execution**
   ```typescript
   // Used with spawn(), not shell execution
   spawn(command, args);  // Safe

   // Not used with:
   spawn(command, args, { shell: true });  // Unsafe!
   ```

3. **Type-Safe Values**
   ```typescript
   protected addOption(option: string, value: string | number): this {
     this.args.push(option, String(value));  // Convert to string
     return this;
   }
   ```

### Trade-offs

**Pros:**
- Prevents command injection
- Clean, readable API
- Testable separately from execution
- Reusable across tool implementations

**Cons:**
- Abstraction overhead (but minimal)
- Need separate builder for each command
- Can't handle every possible command combination (but covers needed cases)

### Alternatives Considered

1. **String templates**
   - Rejected: Injection risk, hard to test
   ```typescript
   const cmd = `rg ${flags} ${pattern} ${path}`;  // Unsafe
   ```

2. **Object-based config**
   - Rejected: Less fluent, harder to validate
   ```typescript
   const config = { caseInsensitive: true, ... };
   const args = buildArgs(config);  // Less discoverable
   ```

3. **Direct array manipulation**
   - Rejected: Error-prone, verbose
   ```typescript
   const args = [];
   if (query.caseInsensitive) args.push('--ignore-case');
   // ... repeated in every tool
   ```

---

## Minification Strategy

### Decision

Dual-mode minification: fast regex-based (sync) and quality library-based (async).

### Location

```
src/utils/minifier/minifier.ts
```

### Strategies

| Strategy | Use Case | Method | Typical Reduction |
|----------|----------|--------|-------------------|
| terser | JS/TS files | Terser library | 40-60% |
| conservative | Common langs | Regex (comments + whitespace) | 30-40% |
| aggressive | Dense langs | Regex (more aggressive) | 50-70% |
| json | JSON files | JSON.stringify | 20-30% |
| markdown | Docs | Regex (preserve structure) | 10-20% |
| general | Unknown | Safe regex | 15-25% |

### File Type Configuration

```typescript
const MINIFY_CONFIG = {
  fileTypes: {
    // JavaScript family - use terser
    js: { strategy: 'terser' },
    ts: { strategy: 'terser' },
    jsx: { strategy: 'terser' },
    tsx: { strategy: 'terser' },

    // Python, Ruby, Shell - conservative
    py: { strategy: 'conservative', comments: ['hash'] },
    rb: { strategy: 'conservative', comments: ['hash'] },
    sh: { strategy: 'conservative', comments: ['hash'] },

    // C-style languages - conservative
    c: { strategy: 'conservative', comments: ['c-style'] },
    cpp: { strategy: 'conservative', comments: ['c-style'] },
    java: { strategy: 'conservative', comments: ['c-style'] },
    go: { strategy: 'conservative', comments: ['c-style'] },
    rust: { strategy: 'conservative', comments: ['c-style'] },

    // Markup - specific strategies
    html: { strategy: 'aggressive', comments: ['html'] },
    xml: { strategy: 'aggressive', comments: ['html'] },
    md: { strategy: 'markdown' },
    json: { strategy: 'json' },

    // Unknown - safe general strategy
    default: { strategy: 'general' }
  }
};
```

### Rationale

**Problem:**
- Large file contents consume AI context tokens
- Need to reduce token usage without losing semantic meaning
- Different file types need different minification approaches
- Some files are critical (keep exact format), others tolerant

**Solution:**
- File-type-specific minification strategies
- Remove comments, excessive whitespace, blank lines
- Preserve code structure and semantics
- Use quality libraries for JS/TS (most important for AI)

**Benefits:**

1. **Token Reduction**
   ```
   Original JS file:    5000 tokens
   Minified:            2000 tokens (60% reduction)

   Original Python:     3000 tokens
   Minified:            1800 tokens (40% reduction)
   ```

2. **Semantic Preservation**
   ```typescript
   // Original
   function calculateTotal(items) {
     // Calculate the sum of all items
     return items.reduce((sum, item) => sum + item.price, 0);
   }

   // Minified
   function calculateTotal(items){return items.reduce((sum,item)=>sum+item.price,0)}

   // Semantics preserved, tokens reduced
   ```

3. **Quality vs Speed Trade-off**
   ```typescript
   // Fast (sync) - regex-based
   const minified = minifyContentSync(content, extension);

   // Quality (async) - library-based
   const minified = await minifyContent(content, extension);
   ```

### Implementation

**Async (Quality):**
```typescript
export async function minifyContent(
  content: string,
  extension: string
): Promise<MinifyResult> {
  const config = MINIFY_CONFIG.fileTypes[extension] ??
                 MINIFY_CONFIG.fileTypes.default;

  if (config.strategy === 'terser') {
    try {
      const result = await minify(content, {
        compress: { defaults: true },
        mangle: false,  // Keep names for readability
        format: { comments: false }
      });
      return {
        content: result.code || content,
        failed: false,
        type: 'terser'
      };
    } catch (error) {
      // Fallback to conservative
      return minifyConservative(content, config.comments);
    }
  }

  // ... other strategies
}
```

**Sync (Fast):**
```typescript
export function minifyContentSync(
  content: string,
  extension: string
): string {
  const config = MINIFY_CONFIG.fileTypes[extension] ??
                 MINIFY_CONFIG.fileTypes.default;

  switch (config.strategy) {
    case 'terser':
      // Fallback to aggressive for sync
      return minifyAggressiveSync(content, config.comments);

    case 'conservative':
      return minifyConservativeSync(content, config.comments);

    case 'json':
      return minifyJSON(content);

    // ... other strategies
  }
}
```

**Comment Removal:**
```typescript
function removeComments(
  content: string,
  patterns: CommentPatternGroup[]
): string {
  let result = content;

  for (const group of patterns) {
    const regexes = MINIFY_CONFIG.commentPatterns[group];
    for (const regex of regexes) {
      result = result.replace(regex, '');
    }
  }

  return result;
}
```

### Minification Modes

**1. Conservative (Safe for all languages):**
- Remove comments
- Collapse multiple blank lines to one
- Remove trailing whitespace
- Preserve indentation structure

**2. Aggressive (HTML, XML):**
- Remove ALL whitespace between tags
- Remove comments
- Collapse attributes
- Remove blank lines

**3. JSON:**
- Remove all formatting
- Use JSON.stringify()
- No spaces, no newlines

**4. Markdown:**
- Remove blank lines between paragraphs
- Preserve code blocks (critical)
- Collapse multiple newlines
- Keep structure for rendering

### Trade-offs

**Pros:**
- Significant token reduction (30-70%)
- Preserves code semantics
- Per-file-type optimization
- Fallback for unsupported types

**Cons:**
- May remove useful comments
- Some context lost (formatting, style)
- Async mode slower (but better quality)
- May break some edge cases (very rare)

### Alternatives Considered

1. **No minification**
   - Rejected: Wastes tokens, slower AI processing
   - Large files exceed context limits

2. **Aggressive minification always**
   - Rejected: Breaks code structure
   - Harder for AI to understand

3. **Client-side minification**
   - Rejected: MCP server controls content
   - Clients expect ready-to-use text

---

## Session Logging

### Decision

Optional telemetry with session persistence for analytics and debugging.

### Location

```
src/session.ts
src/serverConfig.ts (OCTOCODE_TELEMETRY_DISABLED)
```

### Configuration

```bash
# Disable telemetry
OCTOCODE_TELEMETRY_DISABLED=true

# Enable debug logging
OCTOCODE_DEBUG=true

# Enable/disable specific logging
LOG=true  # or LOG=false
```

### What's Logged

**Tool Calls:**
```typescript
{
  tool_name: string;
  repositories: string[];           // ["owner/repo", ...]
  main_research_goal?: string;
  research_goal?: string;
  reasoning?: string;
  timestamp: Date;
}
```

**Rate Limits:**
```typescript
{
  limit_type: 'primary' | 'secondary';
  retry_after_seconds?: number;
  rate_limit_remaining?: number;
  rate_limit_reset_ms?: number;
  timestamp: Date;
}
```

**Errors:**
```typescript
{
  tool_name: string;
  error_code: string;
  timestamp: Date;
}
```

### Rationale

**Problem:**
- Need to understand usage patterns
- Want to debug issues (rate limits, errors)
- Users should control data collection
- MCP doesn't provide built-in analytics

**Solution:**
- Optional session logging (disabled by default in some configs)
- Logs to local file (not sent to servers)
- Privacy-focused (no secrets, minimal PII)
- Can be disabled entirely

**Benefits:**

1. **Usage Analytics**
   ```typescript
   // Which tools are used most?
   // Which repositories are accessed?
   // How are tools chained together?
   ```

2. **Error Debugging**
   ```typescript
   // What errors occur most frequently?
   // Which tools fail and why?
   // Rate limit patterns?
   ```

3. **Research Context**
   ```typescript
   // What problems are users solving?
   // How do they approach research?
   // What query patterns work best?
   ```

### Privacy Considerations

**Logged:**
- Tool names
- Repository identifiers (owner/repo - public info)
- Research goals (user-provided context)
- Error codes
- Rate limit stats

**NOT Logged:**
- File contents
- Secrets or credentials
- Personal information
- Code snippets
- Query results

### Trade-offs

**Pros:**
- Helps improve tool design
- Enables debugging
- Provides usage insights
- Privacy-focused (local only)

**Cons:**
- Storage overhead (but minimal)
- Potential privacy concerns (mitigated by opt-out)
- Requires maintenance (log rotation, etc.)

### Alternatives Considered

1. **No logging**
   - Rejected: Blind to usage patterns and issues
   - Hard to debug problems

2. **Send to analytics service**
   - Rejected: Privacy concerns
   - Requires infrastructure

3. **Detailed logging (all I/O)**
   - Rejected: Security/privacy risk
   - Excessive storage

---

## Summary

Key design decisions in octocode-mcp:

1. **Provider Pattern**: Unified abstraction for multi-platform support
2. **Bulk Query Pattern**: Parallel execution reduces latency
3. **Zod Validation**: Type-safe runtime validation with great DX
4. **Caching Strategy**: In-memory caching with per-prefix TTLs
5. **Command Builder**: Safe shell command construction
6. **Minification**: Token-efficient content delivery
7. **Session Logging**: Optional telemetry for insights

All decisions balance developer experience, performance, security, and maintainability. The architecture is designed to be extensible while maintaining stability and reliability for production use.

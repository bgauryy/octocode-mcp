# Caching and Pagination

Complete guide to caching strategies and pagination techniques in octocode-mcp for optimal performance and token efficiency.

## Table of Contents

- [Overview](#overview)
- [Caching System](#caching-system)
  - [Cache Architecture](#cache-architecture)
  - [TTL Configuration](#ttl-configuration)
  - [Cache Key Generation](#cache-key-generation)
  - [Deduplication](#deduplication)
  - [Cache Statistics](#cache-statistics)
- [Pagination Strategies](#pagination-strategies)
  - [Character-Based Pagination](#character-based-pagination)
  - [Line-Based Pagination](#line-based-pagination)
  - [File-Level Pagination](#file-level-pagination)
  - [Match-Level Pagination](#match-level-pagination)
  - [Entry-Level Pagination](#entry-level-pagination)
- [Pagination by Tool](#pagination-by-tool)
- [Best Practices](#best-practices)
- [Performance Optimization](#performance-optimization)

## Overview

Octocode MCP uses intelligent caching and pagination to:
- **Reduce API calls:** Cached responses for identical queries
- **Optimize token usage:** Paginated content returns only what's needed
- **Improve performance:** In-memory caching with configurable TTLs
- **Handle large results:** Multiple pagination strategies for different data types

## Caching System

### Cache Architecture

**Implementation:** node-cache (in-memory)

**Configuration:**
```typescript
{
  stdTTL: 86400,        // Default: 24 hours
  checkperiod: 3600,    // Cleanup every 1 hour
  maxKeys: 5000,        // Maximum cached items
  deleteOnExpire: true,
  useClones: false      // Performance optimization
}
```

**Features:**
- Versioned cache keys (`v1-prefix:hash`)
- SHA-256 parameter hashing
- Automatic expiration
- Pending request deduplication
- Zero external dependencies

### TTL Configuration

Different resource types have optimized TTL values based on update frequency and rate limit considerations.

#### TTL by Resource Type

| Cache Prefix | TTL (seconds) | TTL (human) | Use Case |
|--------------|---------------|-------------|----------|
| `gh-api-code` | 3600 | 1 hour | GitHub code search results |
| `gh-api-repos` | 7200 | 2 hours | GitHub repository search |
| `gh-api-prs` | 1800 | 30 minutes | GitHub pull requests |
| `gh-api-file-content` | 3600 | 1 hour | GitHub file content |
| `gh-repo-structure-api` | 7200 | 2 hours | GitHub repo structure |
| `github-user` | 900 | 15 minutes | GitHub user info |
| `npm-search` | 14400 | 4 hours | NPM package search |
| `pypi-search` | 14400 | 4 hours | PyPI package search |
| `default` | 86400 | 24 hours | Everything else |

#### Rationale

**Short TTLs (15-30 minutes):**
- Frequently changing data (PRs, user info)
- Real-time requirements
- Less rate limit impact

**Medium TTLs (1-2 hours):**
- Code search results (relatively stable)
- File content (changes with commits)
- Balance between freshness and rate limits

**Long TTLs (4-24 hours):**
- Package metadata (rarely changes)
- Static content
- Maximize rate limit savings

### Cache Key Generation

Cache keys ensure uniqueness while remaining consistent for identical requests.

#### Key Format

```
{VERSION}-{PREFIX}:{HASH}
```

**Example:**
```
v1-gh-api-code:a3f5c8b9e1d2f4a6c8e0b2d4f6a8c0e2
```

#### Components

**VERSION:** `v1`
- Allows cache invalidation by version bump
- Future-proof for breaking changes

**PREFIX:** Resource type identifier
- `gh-api-code`, `npm-search`, etc.
- Determines TTL from CACHE_TTL_CONFIG
- Groups related cache entries

**HASH:** SHA-256 of normalized parameters
- Stable string representation
- Deterministic for identical queries
- No sensitive data in hash

#### Hash Generation Process

```typescript
function generateCacheKey(prefix: string, params: unknown, sessionId?: string): string {
  // 1. Create stable parameter string
  const paramString = createStableParamString(params);

  // 2. Include session ID if provided
  const finalParamString = sessionId
    ? `${sessionId}:${paramString}`
    : paramString;

  // 3. Generate SHA-256 hash
  const hash = crypto
    .createHash('sha256')
    .update(finalParamString)
    .digest('hex');

  // 4. Return versioned key
  return `${VERSION}-${prefix}:${hash}`;
}
```

#### Parameter Normalization

Parameters are normalized to ensure consistent hashing:

**Object normalization:**
```typescript
// Input: { b: 2, a: 1, c: 3 }
// Normalized: {"a":1,"b":2,"c":3}
// Keys sorted alphabetically
```

**Array normalization:**
```typescript
// Input: [3, 1, 2]
// Normalized: [3,1,2]
// Order preserved (arrays are ordered)
```

**Null/undefined handling:**
```typescript
null → "null"
undefined → "undefined"
```

**Type preservation:**
```typescript
1 → "1"
"1" → "\"1\""
true → "true"
```

#### Examples

**Same query, same key:**
```json
// Query 1
{ "owner": "facebook", "repo": "react", "keywordsToSearch": ["useState"] }

// Query 2 (different order, same parameters)
{ "keywordsToSearch": ["useState"], "owner": "facebook", "repo": "react" }

// Both generate same key:
v1-gh-api-code:7f3a8c6e9d2b4f1a8c0e2d4f6a8c0e2
```

**Different queries, different keys:**
```json
// Query 1
{ "owner": "facebook", "repo": "react" }
// Key: v1-gh-api-code:abc123...

// Query 2 (case difference)
{ "owner": "facebook", "repo": "React" }
// Key: v1-gh-api-code:def456...
```

### Deduplication

The system prevents concurrent duplicate requests through pending request tracking.

#### How It Works

```typescript
// Pending request map
interface PendingRequest {
  promise: Promise<unknown>;
  startedAt: number;
}
const pendingRequests = new Map<string, PendingRequest>();

// Deduplication logic
async function withDataCache<T>(cacheKey: string, operation: () => Promise<T>) {
  // 1. Check cache
  const cached = cache.get<T>(cacheKey);
  if (cached !== undefined) return cached;

  // 2. Check pending requests
  const existingPending = pendingRequests.get(cacheKey);
  if (existingPending) {
    return existingPending.promise as Promise<T>;  // Reuse pending request
  }

  // 3. Execute new request
  const promise = operation();
  pendingRequests.set(cacheKey, { promise, startedAt: Date.now() });

  const result = await promise;

  // 4. Cache result and cleanup
  cache.set(cacheKey, result);
  pendingRequests.delete(cacheKey);

  return result;
}
```

#### Benefits

**Prevents duplicate API calls:**
```typescript
// Concurrent requests
Promise.all([
  githubSearchCode({ owner: "facebook", repo: "react" }),
  githubSearchCode({ owner: "facebook", repo: "react" }),
  githubSearchCode({ owner: "facebook", repo: "react" })
]);

// Only 1 API call made, others wait for first
```

**Cleanup stale requests:**
```typescript
// Cleanup after 5 minutes
const PENDING_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

function cleanupStalePendingRequests(): void {
  const now = Date.now();
  for (const [key, pending] of pendingRequests.entries()) {
    if (now - pending.startedAt > PENDING_REQUEST_MAX_AGE_MS) {
      pendingRequests.delete(key);
    }
  }
}
```

### Cache Statistics

Track cache performance for monitoring and optimization.

#### Metrics Tracked

```typescript
interface CacheStats {
  hits: number;           // Cache hits
  misses: number;         // Cache misses
  sets: number;           // Items cached
  totalKeys: number;      // Current cache size
  lastReset: Date;        // Stats reset time
}
```

#### Computed Metrics

```typescript
{
  hitRate: (hits / (hits + misses)) * 100,
  cacheSize: cache.keys().length
}
```

#### Example Output

```json
{
  "hits": 450,
  "misses": 50,
  "sets": 50,
  "totalKeys": 48,
  "lastReset": "2024-01-01T00:00:00.000Z",
  "hitRate": 90.0,
  "cacheSize": 48
}
```

#### Interpreting Stats

**High hit rate (>70%):** Excellent caching performance
- Queries are repetitive
- TTLs are appropriate
- Cache is effectively reducing API calls

**Low hit rate (<30%):** Cache underutilized
- Queries are unique/varied
- Consider longer TTLs
- May indicate exploratory research

**Growing cache size:** Normal during active use
- Automatic cleanup at checkperiod (1 hour)
- maxKeys limit prevents unbounded growth

## Pagination Strategies

Octocode MCP implements five pagination strategies optimized for different data types and use cases.

### Character-Based Pagination

**Used by:** githubGetFileContent, localGetFileContent, localViewStructure, localFindFiles

**Purpose:** Paginate text content by character position

**Parameters:**
- `charOffset`: Starting character position (0-indexed)
- `charLength`: Number of characters to return

**Advantages:**
- Precise control over content size
- Token-efficient for large files
- Consistent with JavaScript string operations

**Character vs. Byte Offsets:**
- `charOffset/charLength`: Character positions (JavaScript strings)
- `byteOffset/byteLength`: Byte positions (binary/API compatibility)
- **Not interchangeable** for multi-byte UTF-8 (emojis, CJK, etc.)

#### Example: Reading Large File

```json
// Page 1: First 10,000 characters
{
  "path": "README.md",
  "fullContent": true,
  "charLength": 10000,
  "charOffset": 0
}

// Response includes pagination metadata
{
  "content": "...",
  "pagination": {
    "charOffset": 0,
    "charLength": 10000,
    "totalChars": 45000,
    "hasMore": true,
    "nextCharOffset": 10000
  }
}

// Page 2: Next 10,000 characters
{
  "path": "README.md",
  "fullContent": true,
  "charLength": 10000,
  "charOffset": 10000  // Use nextCharOffset from previous response
}
```

#### Implementation Details

**Line-aware slicing:**
- Pagination respects line boundaries
- Avoids cutting mid-line
- `actualOffset` may differ from requested `charOffset`

**Metadata returned:**
```typescript
interface PaginationMetadata {
  // Character-based (JavaScript strings)
  charOffset: number;
  charLength: number;
  totalChars: number;
  nextCharOffset?: number;

  // Byte-based (binary/API compatibility)
  byteOffset: number;
  byteLength: number;
  totalBytes: number;
  nextByteOffset?: number;

  // Common
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
  estimatedTokens?: number;
}
```

### Line-Based Pagination

**Used by:** githubGetFileContent, localGetFileContent

**Purpose:** Extract specific line ranges from files

**Parameters:**
- `startLine`: First line to include (1-indexed)
- `endLine`: Last line to include (1-indexed, inclusive)

**Advantages:**
- Natural for code files
- Precise function/class extraction
- Easy to reference in discussions

#### Example: Extract Function

```json
{
  "path": "src/auth.ts",
  "startLine": 42,
  "endLine": 75
}

// Returns lines 42-75 (inclusive)
```

#### Validation Rules

- `startLine` and `endLine` must be used together
- `startLine` must be ≤ `endLine`
- Cannot combine with `fullContent` or `matchString`

### File-Level Pagination

**Used by:** localSearchCode, localViewStructure, localFindFiles

**Purpose:** Paginate lists of files

**Parameters:**
- `filesPerPage`: Files per page (default varies by tool)
- `filePageNumber`: Page number (1-indexed)

**Advantages:**
- Controls output size
- Prevents overwhelming results
- Enables progressive exploration

#### Example: Search Results

```json
// Page 1
{
  "pattern": "AuthService",
  "path": "/project",
  "filesPerPage": 10,
  "filePageNumber": 1
}

// Response
{
  "files": [/* 10 files */],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "hasMore": true
  }
}

// Page 2
{
  "pattern": "AuthService",
  "path": "/project",
  "filesPerPage": 10,
  "filePageNumber": 2
}
```

#### Default Values

| Tool | Default filesPerPage | Max |
|------|---------------------|-----|
| `localSearchCode` | 10 | 20 |
| `localViewStructure` | 20 | 20 |
| `localFindFiles` | 20 | 20 |

### Match-Level Pagination

**Used by:** localSearchCode, lspFindReferences

**Purpose:** Paginate matches within files

**Parameters:**
- `matchesPerPage`: Matches per file
- File-level pagination (filesPerPage) for multiple files

**Advantages:**
- Two-level control (files + matches)
- Prevents match explosion
- Balanced result sets

#### Example: Two-Level Pagination

```json
{
  "pattern": "function",
  "path": "/project/src",
  "filesPerPage": 5,       // Show 5 files
  "matchesPerPage": 10     // Show 10 matches per file
}

// Response structure
{
  "files": [
    {
      "path": "file1.ts",
      "matches": [/* 10 matches */],
      "pagination": {
        "currentPage": 1,
        "hasMore": true,
        "matchesOnPage": 10
      }
    },
    // ... 4 more files
  ],
  "pagination": {
    "currentPage": 1,  // File-level page
    "totalPages": 3,
    "hasMore": true
  }
}
```

#### Interaction Between Levels

**Matches limited per file:**
- Each file shows at most `matchesPerPage` matches
- Total matches across all files: `filesPerPage × matchesPerPage`

**Example calculation:**
```
filesPerPage = 5
matchesPerPage = 10
Max total matches = 5 × 10 = 50 matches
```

### Entry-Level Pagination

**Used by:** githubViewRepoStructure, localViewStructure

**Purpose:** Paginate directory entries (files and folders)

**Parameters:**
- `entriesPerPage`: Entries per page
- `entryPageNumber`: Page number (1-indexed)

**Advantages:**
- Handles large directories
- Consistent UX across tools
- Sorted by modification time (default)

#### Example: Large Directory

```json
// Page 1
{
  "path": "/project/src",
  "entriesPerPage": 50,
  "entryPageNumber": 1
}

// Response
{
  "entries": [/* 50 entries */],
  "summary": {
    "totalFiles": 85,
    "totalDirs": 12
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "hasMore": true
  }
}

// Page 2
{
  "path": "/project/src",
  "entriesPerPage": 50,
  "entryPageNumber": 2
}
```

## Pagination by Tool

### githubSearchCode

**Pagination:** API-level (GitHub's pagination)

```json
{
  "limit": 10,    // Results per page (1-100)
  "page": 1       // Page number (1-10)
}
```

**Constraints:**
- Max 10 pages
- Max 100 results per page
- Total max 1000 results per query

### githubGetFileContent

**Pagination:** Character-based

```json
{
  "charOffset": 0,
  "charLength": 10000  // 50-50000
}
```

**Constraints:**
- File size limit: 300KB
- Use pagination for large files

### githubViewRepoStructure

**Pagination:** Entry-level

```json
{
  "entriesPerPage": 50,    // 1-200
  "entryPageNumber": 1     // 1+
}
```

**Constraints:**
- Max 200 entries per page
- Automatic truncation at 200

### githubSearchRepositories

**Pagination:** API-level

```json
{
  "limit": 10,    // 1-100
  "page": 1       // 1-10
}
```

### githubSearchPullRequests

**Pagination:** API-level

```json
{
  "limit": 5,     // 1-10
  "page": 1       // 1-10
}
```

**Note:** Lower limits due to expensive operation

### packageSearch

**Pagination:** Search limit

```json
{
  "searchLimit": 1  // 1-10
}
```

**Note:** Returns top N results, not pages

### localSearchCode

**Pagination:** Two-level (files + matches)

```json
{
  "filesPerPage": 10,      // 1-20
  "filePageNumber": 1,     // 1+
  "matchesPerPage": 10     // 1-100
}
```

**Also supports:**
- `maxMatchesPerFile`: Legacy parameter
- `maxFiles`: Hard limit on total files

### localGetFileContent

**Pagination:** Character-based

```json
{
  "charOffset": 0,
  "charLength": 5000  // 1-10000
}
```

**Also supports:** Line-based via `startLine/endLine`

### localViewStructure

**Pagination:** Entry-level with character truncation

```json
{
  "entriesPerPage": 20,    // 1-20
  "entryPageNumber": 1,    // 1+
  "charOffset": 0,         // Optional: truncate output
  "charLength": 5000       // Optional: max chars
}
```

### localFindFiles

**Pagination:** File-level with character truncation

```json
{
  "filesPerPage": 20,      // 1-20
  "filePageNumber": 1,     // 1+
  "limit": 1000,           // Hard limit: 1-10000
  "charOffset": 0,
  "charLength": 5000
}
```

### lspGotoDefinition

**Pagination:** None (returns all definitions)

**Context control:**
```json
{
  "contextLines": 5  // 0-20
}
```

### lspFindReferences

**Pagination:** Reference-level

```json
{
  "referencesPerPage": 20,  // 1-50
  "page": 1                 // 1+
}
```

### lspCallHierarchy

**Pagination:** Call-level

```json
{
  "callsPerPage": 15,  // 1-30
  "page": 1            // 1+
}
```

## Best Practices

### Choosing Pagination Strategy

**1. For large files (>50KB):**
```json
// Use character-based pagination
{
  "fullContent": true,
  "charLength": 10000,
  "charOffset": 0
}
```

**2. For search results:**
```json
// Use file-level pagination
{
  "filesPerPage": 10,
  "filePageNumber": 1
}
```

**3. For targeted extraction:**
```json
// Use matchString (no pagination needed)
{
  "matchString": "export function",
  "matchStringContextLines": 10
}
```

### Optimizing Cache Usage

**1. Reuse identical queries:**
```typescript
// Good: Reuses cached result
const query = { owner: "facebook", repo: "react" };
await githubSearchCode(query);
await githubSearchCode(query);  // Cached

// Bad: Different parameter order = different cache key
await githubSearchCode({ owner: "facebook", repo: "react" });
await githubSearchCode({ repo: "react", owner: "facebook" });  // Cache miss
```

**Note:** Parameter order doesn't matter (normalized in hash), but this example is for illustration.

**2. Batch related queries:**
```typescript
// Good: Single call with bulk queries
{
  "queries": [
    { "pattern": "auth", "path": "/project/src" },
    { "pattern": "auth", "path": "/project/tests" }
  ]
}

// Bad: Separate calls
await localSearchCode({ pattern: "auth", path: "/project/src" });
await localSearchCode({ pattern: "auth", path: "/project/tests" });
```

**3. Leverage TTLs:**
```typescript
// Repeated queries within TTL use cache
// GitHub code search: 1 hour TTL
await githubSearchCode(query);       // API call
await githubSearchCode(query);       // Cached (within 1 hour)
// ... 30 minutes later
await githubSearchCode(query);       // Cached (still within 1 hour)
// ... 2 hours later
await githubSearchCode(query);       // API call (TTL expired)
```

### Managing Token Usage

**1. Use progressive pagination:**
```json
// Start small
{ "charLength": 5000 }

// Increase if needed
{ "charLength": 10000 }
```

**2. Prefer targeted extraction:**
```json
// Instead of fullContent
{ "matchString": "pattern", "matchStringContextLines": 5 }

// Over fullContent
{ "fullContent": true, "charLength": 50000 }
```

**3. Limit context lines:**
```json
// Minimal context for discovery
{ "contextLines": 2 }

// More context for analysis
{ "contextLines": 10 }
```

### Handling Large Result Sets

**1. Use filesOnly for discovery:**
```json
// Phase 1: Find files (fast, token-efficient)
{
  "filesOnly": true,
  "pattern": "AuthService"
}

// Phase 2: Read specific files
{
  "path": "src/auth/AuthService.ts",
  "matchString": "class AuthService"
}
```

**2. Paginate aggressively:**
```json
{
  "filesPerPage": 5,     // Small pages
  "matchesPerPage": 5    // Small matches
}
```

**3. Use filters to narrow results:**
```json
{
  "pattern": "function",
  "type": "ts",          // File type filter
  "path": "/project/src" // Path filter
}
```

## Performance Optimization

### Cache Performance

**Optimize hit rate:**
- Reuse exact queries when possible
- Structure research to leverage cache
- Understand TTLs for timing

**Monitor cache stats:**
```typescript
// Internal API (for debugging)
const stats = getCacheStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Cache size: ${stats.cacheSize} keys`);
```

**Expected hit rates:**
- Research workflow: 50-70%
- Exploratory: 20-40%
- Production: 70-90%

### Pagination Performance

**Character-based pagination:**
- **Fast:** Direct string slicing with line awareness
- **Cost:** Minimal (O(n) where n = charLength)
- **Best for:** Large files, targeted extraction

**File-level pagination:**
- **Fast:** In-memory sorting and slicing
- **Cost:** Minimal (O(n log n) for sorting)
- **Best for:** Directory listings, search results

**Match-level pagination:**
- **Moderate:** Two-level pagination overhead
- **Cost:** Ripgrep execution + pagination
- **Best for:** Search results with many matches

**API pagination:**
- **Slow:** External API call per page
- **Cost:** Rate limit + network latency
- **Best for:** GitHub/GitLab tools (cached)

### Network Optimization

**Reduce API calls:**
- Use cache (automatic)
- Batch queries (bulk pattern)
- Use local tools when possible

**Manage rate limits:**
```typescript
// GitHub rate limits
Authenticated: 5000/hour
Search: 30/minute

// Cache reduces pressure
Cache hit = 0 API calls
Cache miss = 1 API call
```

**Retry strategy:**
- Exponential backoff: 1s, 2s, 4s, 8s
- Max retries: configurable (default 3)
- Only on transient errors

### Memory Optimization

**Cache size management:**
- Max keys: 5000
- Automatic cleanup: every hour
- LRU-style eviction (oldest first)

**Large content handling:**
- Use pagination (don't load entire files)
- Use matchString (targeted extraction)
- Limit context lines

**Bulk query optimization:**
- Parallel execution (independent queries)
- Sequential execution (dependent queries)
- Max queries: 3-5 depending on tool

## Troubleshooting

### Cache Issues

**Problem:** Low hit rate

**Solutions:**
1. Check if queries are truly identical
2. Verify parameter normalization
3. Review TTL appropriateness
4. Enable debug mode: `OCTOCODE_DEBUG=true`

**Problem:** Cache misses expected hits

**Solutions:**
1. Check parameter order (normalized, but verify)
2. Verify cache key generation
3. Check TTL hasn't expired
4. Clear cache and retry: `clearAllCache()`

### Pagination Issues

**Problem:** Content truncated unexpectedly

**Solutions:**
1. Check `charLength` limit
2. Use `nextCharOffset` for continuation
3. Verify file size within limits
4. Check line-aware slicing behavior

**Problem:** Pagination not working

**Solutions:**
1. Verify parameters (charOffset/charLength)
2. Check pagination metadata in response
3. Ensure `hasMore: true` before next page
4. Use correct page parameter for tool

**Problem:** Too many results

**Solutions:**
1. Reduce `filesPerPage` and `matchesPerPage`
2. Use filters (type, path, extension)
3. Use `filesOnly` for discovery
4. Set lower `limit` values

### Performance Issues

**Problem:** Slow responses

**Solutions:**
1. Enable caching (automatic)
2. Use pagination (don't fetch all at once)
3. Use targeted extraction (matchString)
4. Check network latency
5. Verify rate limits not hit

**Problem:** High token usage

**Solutions:**
1. Use pagination (smaller chunks)
2. Reduce context lines
3. Use filesOnly for discovery
4. Use matchString instead of fullContent
5. Limit results per query

## Summary

### Key Takeaways

**Caching:**
- Automatic with configurable TTLs
- Reduces API calls and improves performance
- Versioned keys for future-proof invalidation
- Deduplication prevents concurrent duplicates

**Pagination:**
- Five strategies for different data types
- Character-based for text content
- File/match/entry-level for lists
- Line-based for precise extraction

**Best Practices:**
- Use targeted extraction over full content
- Leverage cache by reusing queries
- Start with small pages, increase if needed
- Use filters to narrow results
- Monitor cache stats for optimization

**Performance:**
- Cache hit rate: aim for 70%+
- Use bulk queries for parallelization
- Prefer local tools when possible
- Respect rate limits with caching

# Octocode MCP - Request Flow Documentation

> Complete request lifecycle from input to response, covering security, validation, execution, minification, pagination, and response formatting.

---

## Table of Contents

1. [High-Level Flow Overview](#high-level-flow-overview)
2. [Server Initialization](#server-initialization)
3. [Request Processing Pipeline](#request-processing-pipeline)
4. [Security Layer](#security-layer)
5. [Schema Validation](#schema-validation)
6. [Bulk Operations](#bulk-operations)
7. [Provider Abstraction](#provider-abstraction)
8. [Content Processing](#content-processing)
9. [Pagination System](#pagination-system)
10. [Minification System](#minification-system)
11. [Hints System](#hints-system)
12. [Response Formatting](#response-formatting)
13. [Error Handling](#error-handling)
14. [Caching & Throttling](#caching--throttling)

---

## High-Level Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           OCTOCODE MCP REQUEST FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │  MCP Client  │
                              │  (AI Agent)  │
                              └──────┬───────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 1. SERVER LAYER                                                                 │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                       │
│    │   McpServer │ -> │   Session   │ -> │   Logger    │                       │
│    │   (stdio)   │    │  Tracking   │    │  (MCP Log)  │                       │
│    └─────────────┘    └─────────────┘    └─────────────┘                       │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 2. SECURITY LAYER (withSecurityValidation)                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  Input Validation  │  Secret Detection  │  Path Traversal Prevention   │ │
│    │  ─────────────────   ────────────────────   ─────────────────────────── │ │
│    │  • Parameter types   • 200+ regex patterns  • Symlink resolution        │ │
│    │  • Array limits      • AI/Cloud/Auth keys   • Allowed roots check       │ │
│    │  • String length     • Private keys         • Ignored path filter       │ │
│    │  • Dangerous keys    • Database credentials                              │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 3. SCHEMA VALIDATION (Zod)                                                     │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  BaseQuerySchema          BulkQuerySchema                               │ │
│    │  ─────────────────        ──────────────────                            │ │
│    │  • mainResearchGoal       • queries: Array[1-3]                         │ │
│    │  • researchGoal           • Tool-specific fields                        │ │
│    │  • reasoning              • Type coercion                               │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 4. BULK OPERATION HANDLER                                                      │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  executeBulkOperation()                                                 │ │
│    │  ──────────────────────                                                 │ │
│    │  • Parallel execution (concurrency: 3)                                  │ │
│    │  • Error isolation per query                                            │ │
│    │  • Timeout handling (60s)                                               │ │
│    │  • Result aggregation                                                   │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │ GitHub/GitLab│  │    Local     │  │     LSP      │
         │   Provider   │  │    Tools     │  │    Tools     │
         └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                │                 │                 │
                ▼                 ▼                 ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 5. PROVIDER/EXECUTION LAYER                                                    │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│    │ Octokit Client  │  │  ripgrep/find   │  │  LSP Client     │               │
│    │ • Throttling    │  │  • Path Valid   │  │  • JSON-RPC     │               │
│    │ • Rate limits   │  │  • Cmd Builder  │  │  • Server Mgmt  │               │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘               │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 6. CONTENT PROCESSING                                                          │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  Minification    │  Pagination     │  Sanitization                      │ │
│    │  ─────────────     ────────────      ────────────────                   │ │
│    │  • File-type       • Byte/char       • Secret redaction                 │ │
│    │    detection         modes           • [REDACTED-X]                     │ │
│    │  • terser/CSS/     • Line-aware      • Mask sensitive                   │ │
│    │    HTML minifiers  • Page tracking                                      │ │
│    │  • 50+ file types                                                       │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 7. HINTS GENERATION                                                            │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  Static Hints     │  Dynamic Hints   │  Context Hints                   │ │
│    │  ─────────────      ──────────────     ─────────────────                │ │
│    │  • Base guidance    • Status-aware    • hasOwnerRepo                    │ │
│    │  • Tool-specific    • Result-based    • matchType                       │ │
│    │  • Workflow tips    • Query context   • pagination state                │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 8. RESPONSE FORMATTING                                                         │
│    ┌─────────────────────────────────────────────────────────────────────────┐ │
│    │  YAML Output     │  Key Priority     │  Role-Based Content              │ │
│    │  ────────────      ─────────────       ──────────────────               │ │
│    │  • Token-efficient • instructions     • system (hints)                  │ │
│    │  • LLM-readable    • results          • assistant (data)                │ │
│    │  • Clean JSON obj  • hints by status  • user (summary)                  │ │
│    └─────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  MCP Client  │
                              │  (Response)  │
                              └──────────────┘
```

---

## Server Initialization

### Startup Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER INITIALIZATION                         │
└─────────────────────────────────────────────────────────────────┘

startServer()
    │
    ├─► initialize()                    // Load configuration
    │   └─► getServerConfig()           // GitHub API URL, tokens, timeouts
    │
    ├─► initializeProviders()           // Register GitHub + GitLab providers
    │   └─► ProviderRegistry.register()
    │
    ├─► loadToolContent()               // Load tool metadata & instructions
    │   └─► CompleteMetadata
    │
    ├─► initializeSession()             // Session tracking & telemetry
    │   └─► generateSessionId()
    │
    ├─► createServer()                  // McpServer instance
    │   └─► capabilities: { tools, prompts, resources, logging }
    │
    ├─► registerTools()                 // Tool registration
    │   └─► ALL_TOOLS.forEach(tool => tool.fn(server))
    │
    ├─► registerPrompts()               // MCP prompts
    │
    ├─► setupProcessHandlers()          // SIGINT, SIGTERM, uncaughtException
    │
    └─► server.connect(StdioServerTransport)
```

### Tool Registration Flow

```typescript
// toolsManager.ts - Registration Logic
for (const tool of ALL_TOOLS) {
  // 1. Check local tools enabled
  if (tool.isLocal && !localEnabled) continue;
  
  // 2. Apply filters (TOOLS_TO_RUN, ENABLE_TOOLS, DISABLE_TOOLS)
  if (!isToolEnabled(tool, localEnabled, filterConfig)) continue;
  
  // 3. Verify metadata exists
  if (!isToolInMetadata(tool.name)) continue;
  
  // 4. Register with server
  await tool.fn(server, callback);
}
```

---

## Request Processing Pipeline

### Tool Handler Registration

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      TOOL REGISTRATION PATTERN                                 │
└───────────────────────────────────────────────────────────────────────────────┘

server.tool(
  toolName,           // e.g., "githubSearchCode"
  description,        // From metadata
  zodSchema,          // Input validation schema
  withSecurityValidation(toolName, async (args) => {
    // Sanitized args passed to handler
    return await executionHandler(args);
  })
)
```

### Request Lifecycle

```
Request In ──► Zod Schema ──► Security Wrapper ──► Bulk Handler ──► Execution ──► Response
     │              │               │                   │              │            │
     │              │               │                   │              │            │
     │         VALIDATION      SANITIZATION        PARALLEL        API/LOCAL    FORMATTING
     │         • Type check    • Secrets detect    • Concur: 3     • Provider   • YAML
     │         • Required      • Input sanitize    • Timeout       • Commands   • Hints
     │         • Limits        • Path validate     • Isolate       • LSP        • Status
```

---

## Security Layer

### Security Validation Wrapper

```typescript
// withSecurityValidation.ts
export function withSecurityValidation<T>(
  toolName: string,
  handler: (sanitizedArgs: T) => Promise<CallToolResult>
): (args: unknown) => Promise<CallToolResult> {
  return async (args) => {
    // 1. Validate input parameters
    const validation = ContentSanitizer.validateInputParameters(args);
    
    if (!validation.isValid) {
      return createResult({
        error: `Security validation failed: ${validation.warnings.join('; ')}`,
        isError: true,
      });
    }
    
    // 2. Log tool call (if session enabled)
    if (isSessionEnabled()) {
      handleBulk(toolName, validation.sanitizedParams);
    }
    
    // 3. Execute with sanitized params
    return await handler(validation.sanitizedParams as T);
  };
}
```

### Content Sanitizer

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      CONTENT SANITIZATION FLOW                                 │
└───────────────────────────────────────────────────────────────────────────────┘

INPUT ──► validateInputParameters() ──► SANITIZED OUTPUT

Validation Steps:
│
├─► 1. Type Check
│   └─► params must be object
│
├─► 2. Key Validation
│   └─► Block: __proto__, constructor, prototype
│
├─► 3. String Parameters
│   ├─► Max length: 10,000 chars
│   └─► Secret Detection ──► detectSecrets()
│
├─► 4. Array Parameters
│   └─► Max length: 100 items
│
├─► 5. Nested Objects
│   └─► Recursive validation
│
└─► 6. Secret Detection (200+ patterns)
    ├─► AI Providers: OpenAI, Anthropic, Google, etc.
    ├─► Cloud: AWS, GCP, Azure, databases
    ├─► Auth: JWT, OAuth, private keys
    ├─► VCS: GitHub, GitLab tokens
    ├─► Payments: Stripe, PayPal, crypto
    └─► Communications: Slack, social media
```

### Secret Detection Patterns

```typescript
// security/regexes/index.ts
export const allRegexPatterns: SensitiveDataPattern[] = [
  ...aiProviderPatterns,      // OpenAI, Anthropic, Google AI keys
  ...awsPatterns,             // AWS access keys, secrets
  ...cloudProviderPatterns,   // GCP, Azure, DigitalOcean
  ...databasePatterns,        // PostgreSQL, MongoDB, Redis
  ...authPatterns,            // JWT, OAuth tokens
  ...privateKeyPatterns,      // RSA, SSH, PGP keys
  ...developerToolsPatterns,  // npm, Docker, CI/CD tokens
  ...versionControlPatterns,  // GitHub, GitLab tokens
  ...paymentProviderPatterns, // Stripe, PayPal keys
  ...genericSecretPatterns,   // password=, secret=, etc.
];

// Output: [REDACTED-OPENAI-API-KEY], [REDACTED-AWS-SECRET-KEY], etc.
```

### Path Validation

```typescript
// pathValidator.ts - Prevents path traversal attacks
class PathValidator {
  private allowedRoots: string[];
  
  validate(inputPath: string): PathValidationResult {
    // 1. Empty check
    if (!inputPath) return { isValid: false, error: 'Path cannot be empty' };
    
    // 2. Expand tilde (~)
    const expandedPath = this.expandTilde(inputPath);
    
    // 3. Resolve to absolute
    const absolutePath = path.resolve(expandedPath);
    
    // 4. Check against allowed roots
    const isAllowed = this.allowedRoots.some(root => 
      absolutePath === root || absolutePath.startsWith(root + path.sep)
    );
    
    // 5. Check ignored patterns
    if (shouldIgnore(absolutePath)) return { isValid: false };
    
    // 6. Resolve symlinks (SECURITY: Always resolve)
    const realPath = fs.realpathSync(absolutePath);
    
    // 7. Validate symlink target
    return { isValid: true, sanitizedPath: realPath };
  }
}
```

---

## Schema Validation

### Base Query Schema

```typescript
// scheme/baseSchema.ts
export const BaseQuerySchema = z.object({
  mainResearchGoal: z.string().describe('Primary research objective'),
  researchGoal: z.string().describe('Specific goal for this query'),
  reasoning: z.string().describe('Why this approach helps'),
});

// Local tools - optional research context
export const BaseQuerySchemaLocal = z.object({
  researchGoal: z.string().optional(),
  reasoning: z.string().optional(),
});
```

### Bulk Query Schema

```typescript
// Creates standardized bulk query schema
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T,
  options: { maxQueries?: number } = {}
) {
  const { maxQueries = 3 } = options;  // Default: 3 for GitHub, 5 for local
  
  return z.object({
    queries: z.array(singleQuerySchema)
      .min(1)
      .max(maxQueries)
      .describe(`Queries for ${toolName} (1-${maxQueries} per call)`)
  });
}
```

### Tool-Specific Schema Example

```typescript
// github_search_code/scheme.ts
const GitHubCodeSearchQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z.array(z.string()).min(1).max(5),
  owner: z.string().optional(),
  repo: z.string().optional(),
  path: z.string().optional(),
  extension: z.string().optional(),
  filename: z.string().optional(),
  match: z.enum(['file', 'path']).optional(),
  limit: z.number().min(1).max(100).default(10),
  page: z.number().min(1).max(10).default(1),
  minify: z.boolean().default(true),
  sanitize: z.boolean().default(true),
});

export const GitHubSearchCodeSchema = createBulkQuerySchema(
  'githubSearchCode',
  GitHubCodeSearchQuerySchema,
  { maxQueries: 3 }
);
```

---

## Bulk Operations

### Execution Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      BULK OPERATION EXECUTION                                  │
└───────────────────────────────────────────────────────────────────────────────┘

executeBulkOperation(queries, processor, config)
    │
    ├─► processBulkQueries()
    │   │
    │   ├─► Create promise functions for each query
    │   │
    │   └─► executeWithErrorIsolation()
    │       ├─► timeout: 60000ms
    │       ├─► continueOnError: true
    │       ├─► concurrency: 3
    │       └─► onError: capture errors per query
    │
    └─► createBulkResponse()
        │
        ├─► Aggregate results by status
        │   ├─► hasResults
        │   ├─► empty
        │   └─► error
        │
        ├─► Generate hints per status
        │
        └─► Format as YAML with key priority
```

### Bulk Response Structure

```typescript
// Response format
{
  instructions: "Bulk response with N results: X hasResults, Y empty, Z failed...",
  results: [
    {
      id: 1,                        // 1-based for LLM readability
      status: "hasResults",         // hasResults | empty | error
      data: { ... },                // Tool-specific data
      mainResearchGoal: "...",
      researchGoal: "...",
      reasoning: "..."
    },
    // ... more results
  ],
  hasResultsStatusHints: [...],     // Hints for successful results
  emptyStatusHints: [...],          // Hints for empty results
  errorStatusHints: [...]           // Hints for errors
}
```

---

## Provider Abstraction

### Provider Architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      PROVIDER ABSTRACTION LAYER                                │
└───────────────────────────────────────────────────────────────────────────────┘

Tool Request
    │
    ├─► getActiveProviderConfig()
    │   └─► { provider: 'github' | 'gitlab', baseUrl, token }
    │
    ├─► getProvider(providerType, config)
    │   │
    │   ├─► GitHubProvider
    │   │   ├─► searchCode()
    │   │   ├─► getFileContent()
    │   │   ├─► searchRepositories()
    │   │   ├─► viewStructure()
    │   │   └─► searchPullRequests()
    │   │
    │   └─► GitLabProvider
    │       ├─► searchCode()
    │       ├─► getFileContent()
    │       ├─► searchProjects()
    │       ├─► viewStructure()
    │       └─► searchMergeRequests()
    │
    └─► Unified Response Format
        └─► ProviderResult<T>
```

### GitHub Client (Octokit)

```typescript
// github/client.ts
export const OctokitWithThrottling = Octokit.plugin(throttling);

const createThrottleOptions = () => ({
  onRateLimit: (retryAfter, options, _octokit, retryCount) => {
    // Retry if under max retries and wait is reasonable
    return retryCount < MAX_RATE_LIMIT_RETRIES && 
           retryAfter < MAX_RETRY_AFTER_SECONDS;
  },
  onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
    return retryCount < MAX_RATE_LIMIT_RETRIES && 
           retryAfter < MAX_RETRY_AFTER_SECONDS;
  },
});

// Constants
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_AFTER_SECONDS = 60;
const TOKEN_TTL_MS = 5 * 60 * 1000;  // 5 min cache
```

---

## Content Processing

### Processing Pipeline

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      CONTENT PROCESSING PIPELINE                               │
└───────────────────────────────────────────────────────────────────────────────┘

Raw Content
    │
    ├─► Minification (if minify=true)
    │   └─► File-type detection ──► Strategy selection ──► Process
    │
    ├─► Pagination (if offset/length specified)
    │   └─► Byte/char mode ──► Page extraction ──► Metadata
    │
    └─► Sanitization (if sanitize=true)
        └─► Secret detection ──► [REDACTED-X] ──► Mask
```

---

## Pagination System

### Pagination Modes

```typescript
// pagination/core.ts
export function applyPagination(
  content: string,
  offset: number = 0,
  length?: number,
  options: { mode?: 'bytes' | 'characters' } = {}
): PaginationMetadata {
  const mode = options.mode ?? 'characters';
  
  // Calculate positions based on mode
  if (mode === 'bytes') {
    // Use Buffer operations for byte-accurate slicing
    const buffer = Buffer.from(content, 'utf-8');
    // ... byte-based pagination
  } else {
    // Use string operations for character-based slicing
    // ... character-based pagination
  }
  
  return {
    paginatedContent,
    // Byte fields
    byteOffset, byteLength, totalBytes, nextByteOffset,
    // Character fields
    charOffset, charLength, totalChars, nextCharOffset,
    // Common fields
    hasMore, estimatedTokens, currentPage, totalPages
  };
}
```

### Line-Aware Pagination

```typescript
// Slice by character count while respecting line boundaries
export function sliceByCharRespectLines(
  text: string,
  charOffset: number,
  charLength: number
): SliceByCharResult {
  // Find line boundaries
  const lines: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lines.push(i + 1);
  }
  
  // Snap to line boundaries
  let startLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] <= charOffset) startLineIdx = i;
    else break;
  }
  
  // Return complete lines
  return { sliced, actualOffset, actualLength, hasMore, nextOffset };
}
```

---

## Minification System

### Strategy Selection

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      MINIFICATION STRATEGIES                                   │
└───────────────────────────────────────────────────────────────────────────────┘

File Extension ──► Strategy Selection
    │
    ├─► js/jsx/mjs/cjs ─────────► terser (async) / JS regex (sync)
    │
    ├─► ts/tsx/go/java/c/cpp ───► aggressive + c-style comments
    │
    ├─► py/yaml/sh/bash ────────► conservative (preserve indentation)
    │
    ├─► html/htm/xml/svg ───────► aggressive + html-minifier (async)
    │
    ├─► css/less/scss ──────────► aggressive + clean-css (async)
    │
    ├─► json ───────────────────► JSON.stringify (compact)
    │
    ├─► md/markdown ────────────► markdown (normalize, collapse)
    │
    └─► other ──────────────────► general (whitespace cleanup)
```

### Comment Pattern Groups

```typescript
// minifier.ts
const commentPatterns = {
  'c-style': [
    /\/\*[\s\S]*?\*\//g,           // /* block comments */
    /^\s*\/\/.*$/gm,               // // line comments
    /\s+\/\/.*$/gm,                // // inline comments
  ],
  'hash': [
    /^\s*#(?!!).*$/gm,             // # comments (not shebangs)
    /\s+#.*$/gm,                   // # inline comments
  ],
  'html': [/<!--[\s\S]*?-->/g],    // <!-- HTML comments -->
  'sql': [/--.*$/gm, /\/\*[\s\S]*?\*\//g],
  'lua': [/^\s*--.*$/gm, /--\[\[[\s\S]*?\]\]/g],
  'template': [
    /\{\{!--[\s\S]*?--\}\}/g,      // Handlebars
    /<%#[\s\S]*?%>/g,              // EJS
    /\{#[\s\S]*?#\}/g,             // Twig/Jinja
  ],
  'haskell': [/^\s*--.*$/gm, /\{-[\s\S]*?-\}/g],
};
```

### Minification Functions

```typescript
// Sync version - Fast, regex-based
export function minifyContentSync(content: string, filePath: string): string {
  const config = getFileConfig(filePath);
  switch (config.strategy) {
    case 'terser':      return minifyJavaScriptCore(content);
    case 'json':        return minifyJsonCore(content).content;
    case 'conservative':return minifyConservativeCore(content, config);
    case 'aggressive':  return minifyAggressiveCore(content, config);
    case 'markdown':    return minifyMarkdownCore(content);
    default:            return minifyGeneralCore(content);
  }
}

// Async version - Uses external libs (terser, clean-css, html-minifier)
export async function minifyContent(content: string, filePath: string): Promise<MinifyResult> {
  // Uses terser for JS, clean-css for CSS, html-minifier for HTML
  // Falls back to sync version on error
}
```

---

## Hints System

### Hint Architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      HINTS SYSTEM ARCHITECTURE                                 │
└───────────────────────────────────────────────────────────────────────────────┘

Tool Result
    │
    ├─► Static Hints (hints/static.ts)
    │   └─► Generic guidance, workflow tips
    │
    ├─► Dynamic Hints (hints/dynamic.ts)
    │   │
    │   ├─► Status-aware
    │   │   ├─► hasResults: next steps, related tools
    │   │   ├─► empty: retry suggestions, alternative approaches
    │   │   └─► error: recovery strategies
    │   │
    │   └─► Context-aware
    │       ├─► hasOwnerRepo: repo-specific hints
    │       ├─► match type: file vs path hints
    │       └─► pagination: page navigation hints
    │
    └─► Tool-specific Hints (tools/<tool>/hints.ts)
        └─► Each tool defines own hint generators
```

### Hint Generation

```typescript
// hints/dynamic.ts
export function getDynamicHints(
  toolName: string,
  status: HintStatus,
  context?: HintContext
): string[] {
  const hintGenerator = HINTS[toolName]?.[status];
  if (!hintGenerator) return [];
  
  const rawHints = hintGenerator(context || {});
  return rawHints.filter((h): h is string => typeof h === 'string');
}

// Example: github_search_code hints
export const hints: ToolHintGenerators = {
  hasResults: (ctx) => [
    'githubGetFileContent to read full files',
    ctx?.hasOwnerRepo && 'Use path filter to narrow scope',
    ctx?.match === 'path' && 'Switch to match="file" for content search',
  ],
  empty: (ctx) => [
    'Try broader search terms',
    'Check repository name spelling',
    !ctx?.hasOwnerRepo && 'Narrow with owner/repo filters',
  ],
  error: () => [
    'Check GitHub token permissions',
    'Verify repository exists and is accessible',
  ],
};
```

---

## Response Formatting

### Response Builder

```typescript
// responses.ts
export function createResponseFormat(
  responseData: ToolResponse,
  keysPriority?: string[]
): string {
  // 1. Clean JSON object (remove null/undefined/NaN)
  const cleanedData = cleanJsonObject(responseData);
  
  // 2. Convert to YAML with key priority
  const yamlData = jsonToYamlString(cleanedData, {
    keysPriority: keysPriority || [
      'instructions',
      'results',
      'hasResultsStatusHints',
      'emptyStatusHints',
      'errorStatusHints',
      'mainResearchGoal',
      'researchGoal',
      'reasoning',
      'status',
      'data',
    ],
  });
  
  // 3. Sanitize output (redact secrets)
  const sanitizationResult = ContentSanitizer.sanitizeContent(yamlData);
  
  // 4. Mask any remaining sensitive data
  return maskSensitiveData(sanitizationResult.content);
}
```

### Role-Based Response API

```typescript
// New role-based content blocks
export const ContentBuilder = {
  system(text: string, priority = 1.0): RoleContentBlock {
    return {
      type: 'text', text,
      annotations: { audience: ['assistant'], priority, role: 'system' }
    };
  },
  
  assistant(text: string, priority = 0.8): RoleContentBlock {
    return {
      type: 'text', text,
      annotations: { audience: ['assistant', 'user'], priority, role: 'assistant' }
    };
  },
  
  user(text: string, priority = 0.6): RoleContentBlock {
    return {
      type: 'text', text,
      annotations: { audience: ['user'], priority, role: 'user' }
    };
  },
  
  data(data: unknown, format: 'yaml' | 'json' = 'yaml'): RoleContentBlock {
    // Serialized data block for backwards compatibility
  },
};
```

### Quick Result Helpers

```typescript
export const QuickResult = {
  success(summary: string, data: unknown, hints?: string[]): CallToolResult,
  empty(message: string, hints?: string[]): CallToolResult,
  error(error: string, details?: unknown): CallToolResult,
  paginated(summary: string, data: unknown, pagination: {...}, hints?: string[]): CallToolResult,
};
```

---

## Error Handling

### Error Code System

```typescript
// errorCodes.ts
export const TOOL_ERRORS = {
  SECURITY_VALIDATION_FAILED: { code: 'TOOL_001', message: '...' },
  INVALID_INPUT: { code: 'TOOL_002', message: '...' },
  API_ERROR: { code: 'TOOL_003', message: '...' },
  // ...
};

export const STARTUP_ERRORS = {
  NO_TOOLS_REGISTERED: { code: 'STARTUP_001', message: '...' },
  STARTUP_FAILED: { code: 'STARTUP_002', message: '...' },
  UNCAUGHT_EXCEPTION: { code: 'STARTUP_003', message: '...' },
  UNHANDLED_REJECTION: { code: 'STARTUP_004', message: '...' },
};
```

### Error Isolation

```typescript
// utils/core/promise.ts
export async function executeWithErrorIsolation<T>(
  promises: Array<() => Promise<T>>,
  options: {
    timeout?: number;
    continueOnError?: boolean;
    concurrency?: number;
    onError?: (error: Error, index: number) => void;
  }
): Promise<PromiseResult<T>[]> {
  // Execute with:
  // - Per-query timeout
  // - Error isolation (continue on failure)
  // - Concurrency limiting
  // - Error callback for logging
}
```

### Error Response Format

```yaml
results:
  - id: 1
    status: error
    data:
      error: "GitHub API rate limit exceeded"
    mainResearchGoal: "Find authentication implementation"
    researchGoal: "Search for JWT token handling"
    reasoning: "Need to understand auth flow"
errorStatusHints:
  - "Check GitHub token permissions"
  - "Wait for rate limit reset"
  - "Try with fewer queries"
```

---

## Caching & Throttling

### GitHub Client Caching

```typescript
// github/client.ts
const TOKEN_TTL_MS = 5 * 60 * 1000;  // 5 minute TTL

interface CachedInstance {
  client: InstanceType<typeof OctokitWithThrottling>;
  createdAt: number;
}

const instances = new Map<string, CachedInstance>();

export async function getOctokit(authInfo?: AuthInfo) {
  if (authInfo?.token) {
    const key = hashToken(authInfo.token);  // SHA256 hash for security
    const cached = instances.get(key);
    if (cached && !isExpired(cached)) return cached.client;
    // Create new instance...
  }
  // Handle default instance...
}
```

### HTTP Response Caching

```typescript
// utils/http/cache.ts
// LRU cache for HTTP responses
// Configurable TTL and max entries
export function clearAllCache(): void {
  // Called on shutdown
}
```

### Rate Limit Handling

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMIT FLOW                                           │
└───────────────────────────────────────────────────────────────────────────────┘

API Request
    │
    ├─► Rate Limit Hit?
    │   │
    │   ├─► No ──► Success
    │   │
    │   └─► Yes
    │       │
    │       ├─► Retry Count < 3?
    │       │   │
    │       │   ├─► Yes ──► Wait Time < 60s?
    │       │   │           │
    │       │   │           ├─► Yes ──► Wait & Retry
    │       │   │           │
    │       │   │           └─► No ──► Fail
    │       │   │
    │       │   └─► No ──► Fail
    │       │
    │       └─► Secondary Rate Limit?
    │           └─► Same logic as above
```

---

## Complete Request Example

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      COMPLETE REQUEST FLOW EXAMPLE                             │
│                      githubSearchCode Query                                    │
└───────────────────────────────────────────────────────────────────────────────┘

1. INPUT (from MCP Client)
   {
     "queries": [{
       "mainResearchGoal": "Understand authentication flow",
       "researchGoal": "Find JWT implementation",
       "reasoning": "Need to add token refresh",
       "keywordsToSearch": ["JWT", "authenticate"],
       "owner": "wix-private",
       "repo": "auth-service",
       "extension": "ts",
       "limit": 10
     }]
   }

2. SECURITY VALIDATION
   ├─► validateInputParameters() ✓
   ├─► No secrets detected ✓
   └─► Parameters sanitized ✓

3. SCHEMA VALIDATION (Zod)
   ├─► queries array: 1 item ✓
   ├─► Required fields present ✓
   └─► Types correct ✓

4. BULK EXECUTION
   └─► executeBulkOperation(queries, processor, config)
       └─► processQuery(query, 0)

5. PROVIDER EXECUTION
   ├─► getProvider('github', config)
   ├─► GitHubProvider.searchCode({
   │     keywords: ["JWT", "authenticate"],
   │     projectId: "wix-private/auth-service",
   │     extension: "ts",
   │     limit: 10
   │   })
   └─► Octokit.rest.search.code(...)

6. RESULT PROCESSING
   ├─► Transform API response to tool format
   ├─► Minify content (if enabled)
   ├─► Generate pagination hints
   └─► Generate context-aware hints

7. RESPONSE FORMATTING
   ├─► createBulkResponse()
   ├─► YAML serialization
   ├─► Content sanitization
   └─► Secret masking

8. OUTPUT (to MCP Client)
   instructions: "Bulk response with 1 results: 1 hasResults..."
   results:
     - id: 1
       status: hasResults
       data:
         files:
           - path: "src/auth/jwt.ts"
             repo: "auth-service"
             text_matches:
               - "export function authenticate(token: JWT)"
         pagination:
           currentPage: 1
           totalPages: 1
           hasMore: false
       mainResearchGoal: "Understand authentication flow"
       researchGoal: "Find JWT implementation"
       reasoning: "Need to add token refresh"
   hasResultsStatusHints:
     - "Use githubGetFileContent to read full file content"
     - "Try lspGotoDefinition for semantic analysis"
```

---

## Summary

The Octocode MCP request flow implements a comprehensive pipeline that ensures:

| Layer | Purpose | Key Features |
|-------|---------|--------------|
| **Security** | Protect against attacks | 200+ secret patterns, path validation, input sanitization |
| **Validation** | Ensure correct input | Zod schemas, research context requirements |
| **Bulk Operations** | Efficient processing | Parallel execution, error isolation, concurrency control |
| **Provider Abstraction** | Multi-platform support | GitHub + GitLab with unified interface |
| **Content Processing** | Token optimization | Minification, pagination, sanitization |
| **Hints** | Guide AI agents | Dynamic, context-aware, status-based hints |
| **Response Formatting** | LLM-friendly output | YAML format, key priority, role-based content |
| **Error Handling** | Graceful degradation | Error isolation, structured codes, recovery hints |

---

*Document version: 1.0 - Generated for octocode-mcp v11.x*

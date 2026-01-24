# Data Flows

This document describes the key data flows in the octocode-research server, focusing on server initialization and tool execution.

## Server Initialization Flow

The server initialization process uses a sophisticated mutex-based approach to prevent concurrent startups and ensure reliable initialization.

### Flow Diagram

```
Client Request: npm run server-init
    ↓
Fast Path Health Check
    ↓ If "ok" → Exit 0 (already running)
    ↓ If not "ok" → Continue
Acquire Mutex Lock (atomic file creation)
    ↓ If lock exists → Check staleness
    ↓ If stale → Delete and retry
    ↓ If not stale → Wait and retry (max 3 attempts)
    ↓ Lock acquired → Continue
Double-Check Health After Lock
    ↓ If "ok" → Release lock, Exit 0
    ↓ If not "ok" → Continue
Spawn Server Process (detached)
    ↓
Poll Health with Exponential Backoff
    ↓ 500ms → 750ms → 1125ms → ... → 2000ms
    ↓ Check health every interval
    ↓ If "ok" → Release lock, Exit 0
    ↓ If timeout (30s) → Release lock, Exit 1
```

Reference: `octocode-research/src/server-init.ts:256-280`

### Detailed Steps

#### 1. Fast Path Health Check

**Purpose**: Avoid acquiring lock if server is already running

```typescript
const initialHealth = await checkHealth();
if (initialHealth?.status === 'ok') {
  console.log('ok');
  process.exit(0);
}
```

**What checkHealth() does:**
- Makes HTTP GET request to `http://localhost:1987/health`
- Timeout: 2 seconds
- Returns `{ status: 'ok' }` if server is healthy
- Returns `null` on connection refused or timeout

Reference: `octocode-research/src/server-init.ts:256-265`

**Fast path optimization:**
- Most common case: server is already running
- No lock contention or file system operations
- Immediate exit with zero overhead

#### 2. Acquire Mutex Lock

**Purpose**: Prevent concurrent server initialization (race condition prevention)

**Lock file location**: `~/.octocode/locks/octocode-research-init.lock`

```typescript
async function acquireLock(): Promise<boolean> {
  ensureLockDir();
  for (let attempt = 0; attempt < STALE_RETRY_LIMIT; attempt++) {
    try {
      // Atomic create - fails with EEXIST if file exists
      const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      const lockData: LockData = {
        pid: process.pid,
        timestamp: Date.now(),
      };
      writeFileSync(fd, JSON.stringify(lockData), 'utf-8');
      closeSync(fd);
      return true;  // Lock acquired
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock exists - check if stale
        if (isLockStale(LOCK_FILE)) {
          console.log('[server-init] Removing stale lock...');
          unlinkSync(LOCK_FILE);
          continue;  // Retry
        }
        // Lock is valid - wait and retry
        await sleep(1000);
        continue;
      }
      throw err;  // Unexpected error
    }
  }
  return false;  // Failed to acquire lock
}
```

Reference: `octocode-research/src/server-init.ts:112-150`

**Atomic file creation:**
- Uses `O_CREAT | O_EXCL` flags
- Fails with `EEXIST` if file already exists
- Atomic operation at kernel level (no race conditions)

**Lock data structure:**
```typescript
{
  pid: 12345,           // Process ID of lock holder
  timestamp: 1234567890 // Unix timestamp when lock was created
}
```

Reference: `octocode-research/src/server-init.ts:18-22`

#### 3. Stale Lock Detection

**Purpose**: Recover from crashed initialization processes

```typescript
function isLockStale(lockPath: string): boolean {
  if (!existsSync(lockPath)) return true;

  try {
    const content = readFileSync(lockPath, 'utf-8');
    if (content && content.trim().length > 0) {
      const data: LockData = JSON.parse(content);

      // Check timestamp - stale if older than 30s
      if (Date.now() - data.timestamp > LOCK_TIMEOUT_MS) {
        return true;
      }

      // Check if process exists
      try {
        process.kill(data.pid, 0);  // Signal 0 = check existence
        return false;  // Process exists, lock is valid
      } catch {
        return true;  // Process doesn't exist, lock is stale
      }
    }
  } catch {
    return true;  // Invalid lock file
  }

  return true;
}
```

Reference: `octocode-research/src/server-init.ts:68-92`

**Staleness criteria:**
1. Lock file timestamp > 30 seconds old
2. Lock holder process (PID) no longer exists
3. Lock file is corrupted or unreadable

**Why 30 seconds?**
- Server initialization typically takes 5-10 seconds
- 30s provides generous buffer for slow systems
- Prevents premature stale detection during normal startup

Reference: `octocode-research/src/server-init.ts:15`

#### 4. Double-Check Health After Lock

**Purpose**: Avoid spawning duplicate server if another process just started it

```typescript
const healthAfterLock = await checkHealth();
if (healthAfterLock?.status === 'ok') {
  console.log('[server-init] Server started by another process');
  releaseLock();
  console.log('ok');
  process.exit(0);
}
```

Reference: `octocode-research/src/server-init.ts:268-275`

**Race condition scenario:**
```
Process A: Fast path check → server not running
Process B: Fast path check → server not running
Process A: Acquire lock → spawn server
Process B: Waiting for lock...
Process A: Release lock
Process B: Acquire lock → double-check → server IS running → exit
```

#### 5. Spawn Server Process

**Purpose**: Start server as detached background process

```typescript
function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptDir = new URL('.', import.meta.url).pathname;
    const serverScript = join(scriptDir, 'server.js');

    const child = spawn('node', [serverScript], {
      detached: true,     // Run independently of parent
      stdio: 'ignore',    // Don't pipe stdout/stderr
      cwd: scriptDir,     // Working directory
    });

    child.unref();  // Allow parent to exit without waiting

    child.on('error', reject);

    // Give server time to start
    setTimeout(resolve, 1000);
  });
}
```

Reference: `octocode-research/src/server-init.ts:199-220`

**Detached process:**
- Runs independently of parent process
- Continues running after parent exits
- No stdout/stderr piping (logs go to files)
- `unref()` prevents parent from waiting

**Server startup sequence:**
```
1. Load Express app
2. Initialize middleware
3. Register routes
4. Initialize MCP cache (5-10s)
5. Start HTTP server on port 1987
6. Send process.send('ready') to PM2
7. Log startup message
```

Reference: `octocode-research/src/server.ts:1-230`

#### 6. Poll Health with Exponential Backoff

**Purpose**: Wait for server to fully initialize and report healthy status

```typescript
async function waitForReady(): Promise<boolean> {
  const startTime = Date.now();
  let pollInterval = POLL_INTERVAL_MS;  // 500ms

  while (Date.now() - startTime < MAX_WAIT_MS) {  // 30s max
    const health = await checkHealth();

    if (health?.status === 'ok') {
      return true;  // Server is ready
    }

    if (health?.status === 'initializing') {
      console.log('[server-init] Server initializing...');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    // Gradual backoff up to 2s
    pollInterval = Math.min(pollInterval * 1.5, 2000);
  }

  return false;  // Timeout
}
```

Reference: `octocode-research/src/server-init.ts:229-250`

**Backoff progression:**
```
Attempt 1: Wait 500ms
Attempt 2: Wait 750ms  (500 * 1.5)
Attempt 3: Wait 1125ms (750 * 1.5)
Attempt 4: Wait 1687ms (1125 * 1.5)
Attempt 5: Wait 2000ms (capped)
...
Max attempts: ~20 (30 seconds / average 1.5s)
```

**Why exponential backoff?**
- Reduces load on system during initialization
- Allows MCP cache to initialize without constant polling
- Balances responsiveness with efficiency

#### 7. Release Lock and Exit

```typescript
releaseLock();
console.log('ok');
process.exit(0);
```

Reference: `octocode-research/src/server-init.ts:277-280`

**Cleanup:**
- Delete lock file
- Print "ok" for caller
- Exit with code 0 (success)

### Error Handling

**Timeout (30s):**
```typescript
if (Date.now() - startTime >= MAX_WAIT_MS) {
  console.error('[server-init] Server failed to start in 30s');
  releaseLock();
  process.exit(1);
}
```

**Spawn error:**
```typescript
child.on('error', (err) => {
  console.error('[server-init] Failed to spawn server:', err);
  releaseLock();
  process.exit(1);
});
```

**Lock acquisition failure:**
```typescript
if (!lockAcquired) {
  console.error('[server-init] Failed to acquire lock after 3 attempts');
  process.exit(1);
}
```

Reference: `octocode-research/src/server-init.ts:199-280`

## Tool Execution Flow

The tool execution flow implements a strict pipeline with validation, resilience, and error handling at each stage.

### Flow Diagram

```
HTTP POST /tools/call/:toolName
    ↓
Readiness Middleware: Check MCP Initialized
    ↓ If not ready → 503 Service Unavailable
    ↓ If ready → Continue
Parse Tool Name from Path
    ↓
Tool Validation: Check Tool Exists
    ↓ If not found → 404 Not Found
    ↓ If found → Continue
Body Validation: Validate with Zod Schema
    ↓ If invalid → 400 Bad Request with hints
    ↓ If valid → Continue
Resilience Wrapper Application
    ├─ Timeout Wrapper (60s GitHub, 30s others)
    ├─ Circuit Breaker (check state, fail-fast if open)
    └─ Retry Wrapper (exponential backoff)
        ↓
Tool Execution: Call MCP Function
    ↓ Success → Continue
    ↓ Error → Retry or fail
Response Parsing: MCP → JSON
    ↓ Single query → Single response
    ↓ Multiple queries → Bulk response
Send JSON Response
    ↓ Success → 200 OK
    ↓ Error → 500 Internal Server Error
Error Handler Middleware (if error thrown)
    ↓
Final Response with Error Format
```

Reference: `octocode-research/src/routes/tools.ts:603-690`

### Detailed Steps

#### 1. Readiness Middleware

**Purpose**: Ensure MCP tools are initialized before handling requests

```typescript
export function checkReadiness(req: Request, res: Response, next: NextFunction): void {
  if (!isMcpReady()) {
    res.status(503).json({
      success: false,
      error: {
        message: 'MCP is not initialized. Call /tools/initContext first.',
        code: 'SERVICE_UNAVAILABLE',
      },
    });
    return;
  }
  next();
}
```

Reference: `octocode-research/src/middleware/readiness.ts:10-25`

**Applied to routes:**
```typescript
toolsRoutes.use(checkReadiness);  // All /tools/* routes
```

Reference: `octocode-research/src/routes/tools.ts:67`

**MCP initialization:**
- Triggered by `/tools/initContext` endpoint
- Caches tool and prompt metadata
- Required before first tool execution
- Improves performance by avoiding repeated MCP calls

Reference: `octocode-research/src/mcpCache.ts:1-50`

#### 2. Tool Validation

**Purpose**: Verify requested tool exists in registry

```typescript
const toolEntry = TOOL_REGISTRY[toolName];
if (!toolEntry) {
  const availableTools = Object.keys(TOOL_REGISTRY);
  res.status(404).json({
    tool: toolName,
    success: false,
    data: null,
    hints: [
      `Tool not found: ${toolName}`,
      `Available tools: ${availableTools.join(', ')}`,
      `Use /tools/list to see all available tools`,
    ],
  });
  return;
}
```

Reference: `octocode-research/src/routes/tools.ts:603-620`

**Tool registry structure:**
```typescript
const TOOL_REGISTRY: Record<string, ToolEntry> = {
  githubSearchCode: {
    fn: githubSearchCode,
    resilience: withGitHubResilience,
  },
  localSearchCode: {
    fn: localSearchCode,
    resilience: withLocalResilience,
  },
  // ... 13 total tools
};
```

Reference: `octocode-research/src/routes/tools.ts:500-600`

#### 3. Body Validation

**Purpose**: Validate request body structure with Zod schema

```typescript
const validation = validateToolCallBody(req.body);
if (!validation.success) {
  res.status(400).json({
    tool: toolName,
    success: false,
    data: null,
    hints: getValidationHints(toolName, validation.error!),
  });
  return;
}
```

Reference: `octocode-research/src/routes/tools.ts:620-650`

**Validation schema:**
```typescript
const toolCallBodySchema = z.object({
  queries: z.array(z.record(z.unknown())).min(1).max(5),
});
```

**Validation rules:**
- `queries` must be an array
- Minimum 1 query, maximum 5 queries
- Each query is a key-value object

Reference: `octocode-research/src/validation/toolCallSchema.ts:1-30`

**Validation hints example:**
```json
{
  "hints": [
    "Validation failed: queries must be an array",
    "Expected: { queries: Array<QueryObject> }",
    "Received: { query: {...} }",
    "Field 'queries[0].keywordsToSearch': required"
  ]
}
```

#### 4. Resilience Wrapper Application

**Purpose**: Apply timeout, circuit breaker, and retry patterns

```typescript
const rawResult = await toolEntry.resilience(
  () => toolEntry.fn({ queries }),
  toolName
);
```

Reference: `octocode-research/src/routes/tools.ts:636-640`

**Resilience layers (innermost to outermost):**
```
Tool Function
    ↓
Retry Wrapper (exponential backoff)
    ↓
Circuit Breaker (fail-fast if open)
    ↓
Timeout Wrapper (60s GitHub, 30s others)
```

Reference: `octocode-research/src/utils/resilience.ts:109-130`

**Layer 1: Retry with Exponential Backoff**

```typescript
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  context?: RetryContext
): Promise<T> {
  let lastError: unknown;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if error type doesn't match or last attempt
      if (!config.retryOn(error) || attempt === config.maxAttempts) {
        throw error;
      }

      console.log(`⟳ Retry ${attempt}/${config.maxAttempts} in ${delay}ms`);
      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}
```

Reference: `octocode-research/src/utils/retry.ts:103-130`

**Retry configurations:**
- **LSP**: 3 attempts, 500ms → 1s → 2s (max 5s)
- **GitHub**: 3 attempts, 1s → 3s → 9s (max 30s)
- **Package**: 3 attempts, 1s → 2s → 4s (max 15s)
- **Local**: 2 attempts, 100ms → 200ms (max 1s)

Reference: `octocode-research/src/utils/retry.ts:30-75`

**Layer 2: Circuit Breaker**

```typescript
if (circuit.state === 'open') {
  // Check if we should try half-open
  if (now - circuit.lastFailure > config.resetTimeoutMs) {
    circuit.state = 'half-open';
  } else {
    // Circuit is open - fail fast
    throw new CircuitOpenError(name, circuit.lastFailure + config.resetTimeoutMs - now);
  }
}
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:166-180`

**Circuit states:**
- **CLOSED**: Normal operation, tracking failures
- **OPEN**: Fail-fast, reject all requests
- **HALF-OPEN**: Testing recovery, allow one request

**State transitions:**
```
CLOSED --[3 failures]--> OPEN
OPEN --[30-60s timeout]--> HALF-OPEN
HALF-OPEN --[success]--> CLOSED
HALF-OPEN --[failure]--> OPEN
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:49-60`

**Layer 3: Timeout Wrapper**

```typescript
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`${context} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}
```

Reference: `octocode-research/src/utils/asyncTimeout.ts:10-25`

**Timeout values:**
- GitHub tools: 60 seconds (rate limiting, large responses)
- All others: 30 seconds

Reference: `octocode-research/src/utils/resilience.ts:15-22`

#### 5. Tool Execution

```typescript
const rawResult = await toolEntry.fn({ queries });
```

**MCP tool call:**
- Calls underlying MCP function (from `octocode-mcp` package)
- Returns MCP-formatted response (array of content blocks)
- May include text, images, or error content

Reference: `octocode-research/src/routes/tools.ts:636-640`

#### 6. Response Parsing

**Purpose**: Convert MCP response format to standardized JSON

**Single query response:**
```typescript
const parsed = parseToolResponse(mcpResponse);
res.status(parsed.isError ? 500 : 200).json({
  tool: toolName,
  success: !parsed.isError,
  data: parsed.data,
  hints: parsed.hints,
  research: parsed.research,
});
```

Reference: `octocode-research/src/routes/tools.ts:679-690`

**Bulk query response:**
```typescript
if (queries.length > 1) {
  const bulkParsed = parseToolResponseBulk(mcpResponse);
  res.status(bulkParsed.isError ? 500 : 200).json({
    tool: toolName,
    bulk: true,
    success: !bulkParsed.isError,
    instructions: bulkParsed.instructions,
    results: bulkParsed.results,
    summary: {
      total: queries.length,
      successful: bulkParsed.results.filter(r => r.success).length,
      failed: bulkParsed.results.filter(r => !r.success).length,
    },
  });
}
```

Reference: `octocode-research/src/routes/tools.ts:663-677`

**Response parsing logic:**
- Extracts text content from MCP blocks
- Parses JSON data if present
- Extracts hints from error messages
- Categorizes as error or success based on content

Reference: `octocode-research/src/utils/responseParser.ts:1-150`

#### 7. Error Handler Middleware

**Purpose**: Catch any unhandled errors and standardize response format

```typescript
export function errorHandler(
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = error.statusCode ?? 500;
  const isValidationError = statusCode === 400;

  // Log error
  if (isValidationError) {
    logWarn(`[VALIDATION] ${req.method} ${req.path}: ${error.message}`, {...});
  } else {
    logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, error);
  }

  // Send standardized error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
      details: error.details,
    },
  });
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:15-65`

**Error categories:**
- **Validation errors (400)**: Invalid request format or parameters
- **Not found errors (404)**: Tool doesn't exist
- **Server errors (500)**: Tool execution failed
- **Service unavailable (503)**: MCP not initialized, circuit open

### Performance Characteristics

**Typical execution times:**
- **GitHub search**: 1-5 seconds (API latency)
- **Local search**: 100-500ms (ripgrep speed)
- **LSP operations**: 500ms-2s (language server)
- **Package search**: 1-3 seconds (NPM/PyPI API)

**Failure modes:**
- **Rate limiting**: Retry with backoff, circuit opens after 2-3 failures
- **Timeout**: Fails after 30-60s, retries if transient
- **Network error**: Retries with exponential backoff
- **Circuit open**: Fails immediately without calling tool

**Scalability:**
- Single process, single threaded (Node.js event loop)
- Handles concurrent requests via async I/O
- Circuit breaker isolates failures per tool category
- PM2 can run multiple instances with load balancing

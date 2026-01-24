# Patterns

This document describes the resilience patterns implemented in the octocode-research server, including circuit breakers, retry mechanisms, and resilience wrappers.

## Circuit Breaker Pattern

The circuit breaker pattern prevents cascading failures by detecting persistent errors and failing fast instead of repeatedly attempting doomed operations.

### Three-State Pattern

The circuit breaker implements a classic three-state machine:

```
┌─────────┐  3 failures   ┌──────┐  30-60s timeout  ┌────────────┐
│ CLOSED  │───────────────>│ OPEN │─────────────────>│ HALF-OPEN  │
└─────────┘                └──────┘                  └────────────┘
     ^                         ^                            │
     │                         │ failure                    │ success
     │                         └────────────────────────────┘
     │                                                       │
     │ 2 successes                                           │
     └───────────────────────────────────────────────────────┘
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:15`

### States

#### CLOSED (Normal Operation)

**Behavior:**
- All requests pass through to the operation
- Tracks consecutive failures
- Transitions to OPEN after `failureThreshold` failures

```typescript
if (circuit.state === 'closed') {
  // Execute operation normally
  try {
    const result = await operation();
    circuit.failures = 0;  // Reset failure counter on success
    return result;
  } catch (error) {
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= config.failureThreshold) {
      circuit.state = 'open';
      console.log(`🔴 Circuit ${name} OPENED after ${circuit.failures} failures`);
    }
    throw error;
  }
}
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:195-230`

#### OPEN (Fail-Fast)

**Behavior:**
- Immediately rejects all requests without calling operation
- Returns `CircuitOpenError` with time until next retry
- Transitions to HALF-OPEN after `resetTimeoutMs`

```typescript
if (circuit.state === 'open') {
  // Check if we should try half-open
  if (now - circuit.lastFailure > config.resetTimeoutMs) {
    circuit.state = 'half-open';
    console.log(`🟡 Circuit ${name} entering half-open state`);
  } else {
    // Circuit is open - fail fast
    const remainingMs = circuit.lastFailure + config.resetTimeoutMs - now;
    console.log(`🔴 Circuit ${name} is OPEN - ${Math.ceil(remainingMs / 1000)}s until retry`);

    if (fallback) {
      return fallback();  // Use fallback if provided
    }
    throw new CircuitOpenError(name, remainingMs);
  }
}
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:166-185`

**Why fail-fast?**
- Reduces load on failing service (gives it time to recover)
- Prevents resource exhaustion (threads, connections, memory)
- Provides faster feedback to users (no waiting for timeout)
- Cascades upward gracefully (allows callers to handle failure)

#### HALF-OPEN (Testing Recovery)

**Behavior:**
- Allows one request through to test if service has recovered
- On success: Reset counters and transition to CLOSED
- On failure: Immediately transition back to OPEN

```typescript
if (circuit.state === 'half-open') {
  try {
    const result = await operation();

    // Success in half-open
    circuit.successes++;
    if (circuit.successes >= config.successThreshold) {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.successes = 0;
      console.log(`🟢 Circuit ${name} CLOSED after recovery`);
    }
    return result;
  } catch (error) {
    // Failed in half-open - back to open
    circuit.state = 'open';
    circuit.lastFailure = Date.now();
    circuit.successes = 0;
    console.log(`🔴 Circuit ${name} back to OPEN after half-open failure`);
    throw error;
  }
}
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:187-213`

### Configuration

#### Default Configuration

```typescript
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  // 3 failures: Quick to detect persistent issues,
  // but tolerant of occasional transient errors.
  failureThreshold: 3,

  // 2 successes: Requires service to prove stability
  // before fully resuming (prevents flapping).
  successThreshold: 2,

  // 30s timeout: Allows services time to recover from
  // rate limits or temporary outages before retrying.
  resetTimeoutMs: 30000,
};
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:49-60`

**Configuration parameters:**
- `failureThreshold`: Consecutive failures before opening circuit (default: 3)
- `successThreshold`: Consecutive successes in half-open to close circuit (default: 2)
- `resetTimeoutMs`: Time to wait in open state before trying half-open (default: 30s)

#### Tool-Specific Circuits

Different tools use different circuit breakers to isolate failures:

**GitHub Search API Circuit:**
```typescript
configureCircuit('github:search', {
  failureThreshold: 2,     // 2 failures = likely rate limited
  successThreshold: 1,     // Single success proves API recovered
  resetTimeoutMs: 60000,   // 60s: Give search rate limits time to reset
});
```

**Rationale:**
- GitHub Search API has aggressive rate limiting (30 req/min)
- Lower failure threshold (2) detects rate limits faster
- Longer reset timeout (60s) aligns with rate limit window
- Single success threshold because rate limits are binary (on/off)

Reference: `octocode-research/src/utils/circuitBreaker.ts:322-328`

**GitHub Content API Circuit:**
```typescript
configureCircuit('github:content', {
  failureThreshold: 3,     // 3 failures = more tolerant
  successThreshold: 1,
  resetTimeoutMs: 30000,   // 30s: Content API recovers faster
});
```

**Rationale:**
- GitHub Contents API has higher limits than Search API
- More tolerant failure threshold (3) reduces false positives
- Shorter reset timeout (30s) for faster recovery

Reference: `octocode-research/src/utils/circuitBreaker.ts:329-335`

**GitHub PR API Circuit:**
```typescript
configureCircuit('github:pulls', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 30000,
});
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:336-342`

**LSP Navigation Circuit:**
```typescript
configureCircuit('lsp:navigation', {
  failureThreshold: 3,
  successThreshold: 2,     // 2 successes = prove LSP is stable
  resetTimeoutMs: 30000,
});
```

**Rationale:**
- LSP operations (goto definition, find references) are fast
- Higher success threshold (2) prevents flapping from unstable LSP server

Reference: `octocode-research/src/utils/circuitBreaker.ts:344-350`

**LSP Call Hierarchy Circuit:**
```typescript
configureCircuit('lsp:hierarchy', {
  failureThreshold: 2,     // 2 failures = heavier operation
  successThreshold: 2,
  resetTimeoutMs: 30000,
});
```

**Rationale:**
- Call hierarchy is heavier than simple navigation (recursive traversal)
- Lower failure threshold (2) prevents wasting resources on deep failures

Reference: `octocode-research/src/utils/circuitBreaker.ts:351-357`

**Local File System Circuit:**
```typescript
configureCircuit('local', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 15000,   // 15s: Filesystem issues usually transient
});
```

**Rationale:**
- File system failures are usually transient (disk busy, NFS timeout)
- Shorter reset timeout (15s) for quick recovery

Reference: `octocode-research/src/utils/circuitBreaker.ts:359-365`

**Package Search Circuit:**
```typescript
configureCircuit('package', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 30000,
});
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:367-373`

### Tool-to-Circuit Mapping

Tools are mapped to specific circuits to isolate failures by category:

```typescript
const TOOL_CIRCUIT_MAP: Record<string, string> = {
  // GitHub - separate by endpoint type (rate limits differ)
  githubSearchCode: 'github:search',
  githubSearchRepositories: 'github:search',
  githubSearchPullRequests: 'github:pulls',
  githubGetFileContent: 'github:content',
  githubViewRepoStructure: 'github:content',

  // LSP - per operation type (different failure modes)
  lspGotoDefinition: 'lsp:navigation',
  lspFindReferences: 'lsp:navigation',
  lspCallHierarchy: 'lsp:hierarchy',

  // Local - unified (same failure mode: filesystem)
  localSearchCode: 'local',
  localGetFileContent: 'local',
  localFindFiles: 'local',
  localViewStructure: 'local',

  // Package - unified
  packageSearch: 'package',
};
```

Reference: `octocode-research/src/utils/resilience.ts:32-60`

**Isolation benefits:**
- GitHub Search rate limit doesn't affect Content API
- LSP navigation failure doesn't block call hierarchy
- Local file operations share circuit (common failure mode)

### Circuit Cleanup

**Purpose**: Prevent memory leaks from long-running circuits

```typescript
function cleanupStaleCircuits(): void {
  const now = Date.now();
  const staleCutoff = now - CIRCUIT_TTL_MS;  // 1 hour
  let removedCount = 0;

  for (const [name, circuit] of circuits) {
    // Don't remove circuits that are currently open (still tracking failure)
    if (circuit.state !== 'open' && circuit.lastAttempt < staleCutoff) {
      circuits.delete(name);
      configs.delete(name);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} stale circuits`);
  }
}

// Cleanup every 15 minutes
setInterval(cleanupStaleCircuits, 15 * 60 * 1000);
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:407-430`

**Cleanup criteria:**
- Circuit state is not OPEN (not actively tracking failure)
- Last attempt was over 1 hour ago (circuit is idle)

**Why cleanup?**
- Long-running server may create many per-tool circuits
- Idle circuits consume memory
- Open circuits are preserved (still needed for fail-fast)

## Retry Pattern

The retry pattern handles transient failures with exponential backoff to avoid overwhelming failing services.

### Retry Configuration

```typescript
export interface RetryConfig {
  maxAttempts: number;          // Maximum retry attempts
  initialDelayMs: number;       // First retry delay
  maxDelayMs: number;           // Maximum delay cap
  backoffMultiplier: number;    // Delay multiplier per attempt
  retryOn: (error: unknown) => boolean;  // Which errors to retry
}
```

Reference: `octocode-research/src/utils/retry.ts:15-21`

### Category-Specific Configurations

#### LSP Retry Configuration

```typescript
lsp: {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryOn: (err: unknown) =>
    isLspNotReady(err) || isTimeout(err) || isConnectionRefused(err),
}
```

**Backoff progression:**
```
Attempt 1: Wait 500ms
Attempt 2: Wait 1000ms  (500 * 2)
Attempt 3: Wait 2000ms  (1000 * 2)
```

**Retryable errors:**
- LSP not ready (language server still starting)
- Timeout (operation took too long)
- Connection refused (LSP server crashed)

Reference: `octocode-research/src/utils/retry.ts:30-38`

#### GitHub Retry Configuration

```typescript
github: {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 3,
  retryOn: (err: unknown) =>
    isRateLimited(err) || isServerError(err) || isTimeout(err),
}
```

**Backoff progression:**
```
Attempt 1: Wait 1000ms
Attempt 2: Wait 3000ms  (1000 * 3)
Attempt 3: Wait 9000ms  (3000 * 3)
```

**Retryable errors:**
- Rate limited (HTTP 429, 403 with rate limit message)
- Server error (HTTP 500-599)
- Timeout

**Why aggressive backoff (3x)?**
- GitHub rate limits are time-based (60 req/hour)
- Rapid retries waste attempts
- Longer delays increase chance of rate limit reset

Reference: `octocode-research/src/utils/retry.ts:42-50`

#### Package Retry Configuration

```typescript
package: {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  backoffMultiplier: 2,
  retryOn: (err: unknown) =>
    isRateLimited(err) || isServerError(err) || isTimeout(err),
}
```

**Backoff progression:**
```
Attempt 1: Wait 1000ms
Attempt 2: Wait 2000ms  (1000 * 2)
Attempt 3: Wait 4000ms  (2000 * 2)
```

Reference: `octocode-research/src/utils/retry.ts:54-62`

#### Local Retry Configuration

```typescript
local: {
  maxAttempts: 2,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
  retryOn: (err: unknown) => isFileBusy(err) || isTimeout(err),
}
```

**Backoff progression:**
```
Attempt 1: Wait 100ms
Attempt 2: Wait 200ms  (100 * 2)
```

**Retryable errors:**
- File busy (EBUSY)
- Timeout

**Why only 2 attempts?**
- Local operations are fast (<1s)
- File system failures are rare
- Quick fail is better than long retry for local ops

Reference: `octocode-research/src/utils/retry.ts:66-74`

### Retry Implementation

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

      const toolName = context?.tool || 'unknown';
      console.log(
        `⟳ Retry ${attempt}/${config.maxAttempts} for ${toolName} in ${delay}ms`
      );

      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}
```

Reference: `octocode-research/src/utils/retry.ts:103-130`

**Key behaviors:**
1. Attempt operation
2. On error, check if error is retryable (`config.retryOn`)
3. If not retryable or last attempt, throw immediately
4. Otherwise, wait with exponential backoff
5. Multiply delay by backoff multiplier, cap at max delay
6. Retry operation

### Error Type Detection

#### Rate Limiting Detection

```typescript
function isRateLimited(err: unknown): boolean {
  // Check status codes first (more reliable)
  if (hasStatusIn(err, RATE_LIMIT_CODES)) {  // [403, 429]
    return true;
  }
  // Fall back to message patterns
  return messageMatches(err, RATE_LIMIT_PATTERNS);
}

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /api rate limit exceeded/i,
];
```

Reference: `octocode-research/src/utils/retry.ts:171-185`

#### Server Error Detection

```typescript
function isServerError(err: unknown): boolean {
  return hasStatusIn(err, SERVER_ERROR_CODES);  // [500-599]
}
```

Reference: `octocode-research/src/utils/retry.ts:187-190`

#### Timeout Detection

```typescript
function isTimeout(err: unknown): boolean {
  return messageMatches(err, TIMEOUT_PATTERNS);
}

const TIMEOUT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /deadline exceeded/i,
];
```

Reference: `octocode-research/src/utils/retry.ts:192-200`

#### LSP Not Ready Detection

```typescript
function isLspNotReady(err: unknown): boolean {
  return messageMatches(err, LSP_NOT_READY_PATTERNS);
}

const LSP_NOT_READY_PATTERNS = [
  /language server not ready/i,
  /lsp not initialized/i,
  /server is starting/i,
];
```

Reference: `octocode-research/src/utils/retry.ts:202-210`

## Resilience Wrappers

Resilience wrappers combine timeout, circuit breaker, and retry patterns into reusable functions.

### Resilience Composition

```typescript
async function withResilience<T>(
  category: ResilienceCategory,
  operation: () => Promise<T>,
  context?: { tool: string }
): Promise<T> {
  const config = RESILIENCE_CONFIGS[category];
  const timeoutMs = TIMEOUT_CONFIGS[category] || DEFAULT_TOOL_TIMEOUT_MS;
  const toolName = context?.tool || category;

  // Get tool-specific circuit name (isolates failures per tool/endpoint)
  const circuitName = TOOL_CIRCUIT_MAP[toolName] || category;

  // Timeout wraps circuit breaker wraps retry
  return withTimeout(
    () => withCircuitBreaker(circuitName, async () => {
      return withRetry(operation, config.retry, context);
    }),
    timeoutMs,
    `${toolName}:timeout`
  );
}
```

Reference: `octocode-research/src/utils/resilience.ts:109-130`

**Layer composition (outer to inner):**
```
withTimeout
  └─ withCircuitBreaker
       └─ withRetry
            └─ operation
```

**Why this order?**
1. **Timeout outermost**: Ensures total execution time is bounded
2. **Circuit breaker middle**: Can fail-fast before retry attempts
3. **Retry innermost**: Attempts operation multiple times

### Wrapper Functions

#### withGitHubResilience

```typescript
export async function withGitHubResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('github', operation, { tool: toolName });
}
```

**Configuration:**
- Timeout: 60 seconds (longest, for rate limiting)
- Retry: 3 attempts, 1s → 3s → 9s
- Circuit: Tool-specific (search/content/pulls)

**Applied to:**
- githubSearchCode
- githubGetFileContent
- githubViewRepoStructure
- githubSearchRepositories
- githubSearchPullRequests

Reference: `octocode-research/src/utils/resilience.ts:134-140`

#### withLocalResilience

```typescript
export async function withLocalResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('local', operation, { tool: toolName });
}
```

**Configuration:**
- Timeout: 30 seconds
- Retry: 2 attempts, 100ms → 200ms
- Circuit: Unified 'local' circuit

**Applied to:**
- localSearchCode
- localGetFileContent
- localViewStructure
- localFindFiles

Reference: `octocode-research/src/utils/resilience.ts:152-158`

#### withLspResilience

```typescript
export async function withLspResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('lsp', operation, { tool: toolName });
}
```

**Configuration:**
- Timeout: 30 seconds
- Retry: 3 attempts, 500ms → 1s → 2s
- Circuit: Tool-specific (navigation/hierarchy)

**Applied to:**
- lspGotoDefinition
- lspFindReferences
- lspCallHierarchy

Reference: `octocode-research/src/utils/resilience.ts:143-149`

#### withPackageResilience

```typescript
export async function withPackageResilience<T>(
  operation: () => Promise<T>,
  toolName: string
): Promise<T> {
  return withResilience('package', operation, { tool: toolName });
}
```

**Configuration:**
- Timeout: 30 seconds
- Retry: 3 attempts, 1s → 2s → 4s
- Circuit: Unified 'package' circuit

**Applied to:**
- packageSearch

Reference: `octocode-research/src/utils/resilience.ts:161-167`

### Timeout Configuration

```typescript
const TIMEOUT_CONFIGS = {
  github: 60000,   // 60s for GitHub API (rate limiting, large responses)
  local: 30000,    // 30s for local tools
  lsp: 30000,      // 30s for LSP operations
  package: 30000,  // 30s for package search
} as const;
```

Reference: `octocode-research/src/utils/resilience.ts:15-22`

**Why GitHub gets 60s?**
- GitHub API rate limits can cause delays
- Large repository responses (tree structure) can be slow
- Search API may take time to return results
- Better to wait than to timeout prematurely

## Pattern Benefits

### Cascading Failure Prevention

**Without circuit breaker:**
```
External API fails → All requests retry 3 times → Queue backs up →
Server exhausts resources → All requests fail
```

**With circuit breaker:**
```
External API fails → Circuit opens after 3 failures →
Requests fail immediately → Resources freed →
Service remains responsive for other operations
```

### Resource Protection

**Timeout pattern:**
- Prevents hanging operations from consuming threads/memory
- Bounds worst-case execution time
- Provides predictable response time limits

**Retry pattern:**
- Handles transient errors automatically
- Exponential backoff reduces load on failing services
- Selective retry (retryOn) prevents retry loops on permanent errors

### Observability

All patterns log their state changes:

```
⟳ Retry 1/3 for githubSearchCode in 1000ms
🔴 Circuit github:search OPENED after 3 failures
🟡 Circuit github:search entering half-open state
🟢 Circuit github:search CLOSED after recovery
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:166-230`, `octocode-research/src/utils/retry.ts:120-125`

### Testing Support

All patterns are fully unit tested:

- **Circuit breaker tests**: State transitions, threshold behavior, recovery
- **Retry tests**: Backoff calculation, error detection, max attempts
- **Integration tests**: Combined behavior under load

Reference: `octocode-research/src/__tests__/unit/circuitBreaker.test.ts`, `octocode-research/src/__tests__/unit/retry.test.ts`

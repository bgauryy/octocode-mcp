# Octocode Research - Issues to Fix

> Generated from comprehensive codebase evaluation on 2025-01-19
> **Validated:** 2025-01-19 using explore agents

## Validation Summary

| Issue | Status | Notes |
|-------|--------|-------|
| #1 Async Error Logging | ✅ **CONFIRMED** | All 5 locations verified; minor fix: server.ts:124 calls `logSessionInit()` not `initializeSession()` |
| #2 Logger Memory | ✅ **CONFIRMED** | safeStringify at lines 142-158, MAX_LOG_DATA_SIZE=100KB at line 32 |
| #3 Type Coercion | ✅ **CONFIRMED** | Found 7 type cast instances in retry.ts (more than documented) |
| #4 Query Validation | ✅ **CONFIRMED** | Limit hardcoded at tools.ts:517, validation scattered |
| #5 Request Cancellation | ✅ **CONFIRMED** | No AbortController/AbortSignal/req.on('close') found |
| #6 Circuit Memory Leak | ✅ **CONFIRMED** | Module-level Maps, no TTL/MAX_CIRCUITS/cleanup |
| #7 Missing Circuits | ✅ **CONFIRMED** | Only 'lsp' and 'github' pre-configured |
| #8 Error Queue API | ✅ **CONFIRMED** | errorQueue imported but not exposed in /health |
| #9 Path Validation | ✅ **CONFIRMED** | Additional gaps: no backslash/whitespace/suspicious pattern checks |
| #10 Emojis in Logs | ✅ **CONFIRMED** | 20+ emoji instances across 4+ files (more than documented) |
| #11 Test Coverage | ✅ **CONFIRMED** | No tests for queryParser.ts or errorHandler.ts |
| #12 Success Threshold | ⚠️ **BY DESIGN** | Mismatch exists but intentional for fast recovery |

---

## Summary

| Priority | Count | Categories |
|----------|-------|------------|
| Critical | 2 | Async safety, Memory |
| Major | 4 | Type safety, Validation, Cancellation, Memory leaks |
| Moderate | 4 | Configuration, Observability, Security, Logging |
| Minor | 2 | Test coverage, Documentation |

---

## Critical Issues

### 1. Unbounded Async Error Logging
**File:** `src/middleware/errorHandler.ts:38`
**Severity:** Critical
**Impact:** Unhandled promise rejections, silent failures

**Current Code:**
```typescript
logSessionError(toolName, errorCode).catch(err => errorQueue.push(err, 'logSessionError'));
```

**Problems:**
- Fire-and-forget without timeout accumulates unhandled rejections
- Errors that can't be logged are silently discarded
- No mechanism to surface persistent logging failures to monitoring

**Fix:**
```typescript
// Add timeout and proper error handling
const LOGGING_TIMEOUT_MS = 5000;

const loggingTimeout = setTimeout(() => {
  errorQueue.push(new Error('logSessionError timeout'), 'logSessionError');
}, LOGGING_TIMEOUT_MS);

logSessionError(toolName, errorCode)
  .then(() => clearTimeout(loggingTimeout))
  .catch(err => {
    clearTimeout(loggingTimeout);
    errorQueue.push(err, 'logSessionError');
  });
```

**Also affects:**
- `src/routes/tools.ts:539-545` - `logToolCall().catch()`
- `src/routes/prompts.ts:111` - `logPromptCall().catch()`
- `src/utils/circuitBreaker.ts:175, 187` - `logRateLimit().catch()`
- `src/server.ts:124` - `logSessionInit().catch()`

---

### 2. Memory Safety in Logger Stringification
**File:** `src/utils/logger.ts:140-158`
**Severity:** Critical
**Impact:** Memory spikes on large payloads, potential OOM

**Current Code:**
```typescript
function safeStringify(data: unknown): string {
  const str = JSON.stringify(data, null, 2);  // Can spike memory
  if (str.length > MAX_LOG_DATA_SIZE) {
    return JSON.stringify({...}, null, 2);  // Creates second large string!
  }
  return str;
}
```

**Problems:**
- `JSON.stringify` called twice - doubles memory for large objects
- `null, 2` formatting multiplies size (useful for dev, expensive for prod)
- No streaming option for truly large responses

**Fix:**
```typescript
function safeStringify(data: unknown, maxSize = MAX_LOG_DATA_SIZE): string {
  try {
    // First pass: estimate size without formatting
    const quickCheck = JSON.stringify(data);

    if (quickCheck.length > maxSize) {
      return JSON.stringify({
        _truncated: true,
        _originalSize: quickCheck.length,
        _maxAllowed: maxSize,
      });
    }

    // Only format if within limits
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return JSON.stringify({
      _error: 'Serialization failed',
      _message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
}
```

---

## Major Issues

### 3. Implicit Type Coercion in Error Handling
**Files:** `src/middleware/errorHandler.ts:35`, `src/utils/retry.ts:164, 167, 183, 202, 221, 230, 238, 246`
**Severity:** Major
**Impact:** Type safety bypass, potential runtime errors

**Current Code (errorHandler.ts:35-36):**
```typescript
const toolCallMatch = req.path.match(/^\/tools\/call\/(\w+)$/);
const toolName = toolCallMatch ? toolCallMatch[1] : 'unknown';
```

**Current Code (retry.ts - 7 instances found):**
```typescript
// Line 164
const error = err as { status?: number; message?: string };

// Line 167 - bypasses type checking
if (error?.status && RATE_LIMIT_CODES.includes(error.status as 403 | 429))

// Lines 183, 202, 221, 230, 238, 246 - similar patterns
const error = err as { message?: string; code?: string };
const error = err as { code?: string; message?: string };
const error = err as { status?: number };
const error = err as { code?: string };
```

**Problems:**
- No validation that `toolName` exists in TOOL_REGISTRY
- `as 403 | 429` cast bypasses type checking
- 7 separate type coercion instances in retry.ts
- Loose object casting hides potential issues

**Fix:**
```typescript
// In errorHandler.ts
import { TOOL_REGISTRY } from '../routes/tools';

const toolCallMatch = req.path.match(/^\/tools\/call\/(\w+)$/);
const extractedName = toolCallMatch?.[1];
const toolName = extractedName && extractedName in TOOL_REGISTRY
  ? extractedName
  : 'unknown';

// In retry.ts - use type guard
function isRateLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = 'status' in err ? err.status : undefined;
  return status === 403 || status === 429;
}
```

---

### 4. Query Validation Duplication
**Files:** `src/routes/tools.ts:502-514`, `src/middleware/queryParser.ts`
**Severity:** Major
**Impact:** Maintenance burden, inconsistent validation

**Current Code (tools.ts:502-514):**
```typescript
if (!body.queries || !Array.isArray(body.queries) || body.queries.length === 0) {
  res.status(400).json({ hints: ['Missing or invalid queries array'] });
  return;
}
if (body.queries.length > 3) {
  res.status(400).json({ hints: ['Too many queries (max 3)'] });
  return;
}
```

**Problems:**
- Query limit (max 3) hardcoded in route, not in schema
- No reusable validation builder
- Validation scattered across middleware and routes

**Fix:**
```typescript
// Add to middleware/queryParser.ts or validation/schemas.ts
import { z } from 'zod';

export const toolCallBodySchema = z.object({
  queries: z.array(z.record(z.unknown()))
    .min(1, 'At least one query required')
    .max(3, 'Maximum 3 queries allowed'),
});

// In routes/tools.ts
const bodyResult = toolCallBodySchema.safeParse(req.body);
if (!bodyResult.success) {
  return res.status(400).json({
    success: false,
    error: { message: bodyResult.error.message, code: 'VALIDATION_ERROR' }
  });
}
```

---

### 5. Missing Request Cancellation Handling
**File:** `src/routes/tools.ts:475-578`
**Severity:** Major
**Impact:** Wasted resources on abandoned requests

**Current Code:**
```typescript
const rawResult = await toolEntry.resilience(
  () => toolEntry.fn({ queries: body.queries! }),
  toolName
);
// No handling for client disconnection
```

**Problems:**
- If client disconnects mid-request, tool continues executing
- No AbortSignal integration
- Wasted compute on abandoned requests

**Fix:**
```typescript
toolsRoutes.post('/call/:toolName', async (req, res, next) => {
  const controller = new AbortController();

  // Cancel if client disconnects
  req.on('close', () => {
    if (!res.headersSent) {
      controller.abort();
    }
  });

  try {
    const rawResult = await toolEntry.resilience(
      () => toolEntry.fn({
        queries: body.queries!,
        signal: controller.signal
      }),
      toolName
    );
    // ... rest of handler
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      // Client disconnected, don't send response
      return;
    }
    next(e);
  }
});
```

**Note:** Requires updating tool function signatures to accept `signal?: AbortSignal`.

---

### 6. Circuit Breaker Memory Leak Potential
**File:** `src/utils/circuitBreaker.ts:58-59`
**Severity:** Major
**Impact:** Unbounded memory growth over time

**Current Code:**
```typescript
const circuits = new Map<string, CircuitRecord>();
const configs = new Map<string, CircuitBreakerConfig>();
```

**Problems:**
- Module-level state persists across requests
- Memory leak potential: circuits never auto-removed
- No TTL for stale circuits
- Test isolation issues

**Fix:**
```typescript
interface CircuitRecord {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastStateChange: number;
  createdAt: number;  // Add timestamp
}

const CIRCUIT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CIRCUITS = 100;

function cleanupStaleCircuits(): void {
  const now = Date.now();
  for (const [name, record] of circuits.entries()) {
    // Remove circuits idle for > TTL
    if (now - record.lastStateChange > CIRCUIT_TTL_MS) {
      circuits.delete(name);
      configs.delete(name);
    }
  }

  // Enforce max circuits (LRU eviction)
  if (circuits.size > MAX_CIRCUITS) {
    const sorted = [...circuits.entries()]
      .sort((a, b) => a[1].lastStateChange - b[1].lastStateChange);

    const toRemove = sorted.slice(0, circuits.size - MAX_CIRCUITS);
    for (const [name] of toRemove) {
      circuits.delete(name);
      configs.delete(name);
    }
  }
}

// Call periodically
setInterval(cleanupStaleCircuits, 60 * 60 * 1000); // Every hour
```

---

## Moderate Issues

### 7. Missing Circuit Configurations
**File:** `src/utils/circuitBreaker.ts:268-279`
**Severity:** Moderate
**Impact:** Suboptimal resilience for local/package operations

**Current State:**
- LSP: Pre-configured (3 failures, 10s timeout)
- GitHub: Pre-configured (2 failures, 60s timeout)
- Local: Uses DEFAULT_CONFIG (30s timeout - too long)
- Package: Uses DEFAULT_CONFIG (30s timeout - too long)

**Fix:**
```typescript
// Add after line 279 in circuitBreaker.ts

configureCircuit('local', {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeoutMs: 5000,  // 5s - quick recovery for file ops
});

configureCircuit('package', {
  failureThreshold: 2,
  successThreshold: 1,
  resetTimeoutMs: 60000,  // 60s - respect API rate limits
});
```

---

### 8. Error Queue Not Exposed via API
**File:** `src/server.ts:32-46`
**Severity:** Moderate
**Impact:** Limited operational visibility

**Current `/health` Response:**
```json
{
  "status": "ok",
  "circuits": { ... },
  "memory": { ... }
}
```

**Fix - Add error queue stats:**
```typescript
// In server.ts health endpoint
import { errorQueue } from './utils/errorQueue';

app.get('/health', (_req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'ok',
    port: PORT,
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
    },
    circuits: getAllCircuitStates(),
    // Add error queue visibility
    errorQueue: {
      size: errorQueue.size,
      recentErrors: errorQueue.getRecent(3).map(e => ({
        context: e.context,
        timestamp: e.timestamp,
        message: e.error instanceof Error ? e.error.message : String(e.error),
      })),
    },
  });
});
```

---

### 9. Path Validation Edge Cases
**File:** `src/validation/httpPreprocess.ts:64-72` (or similar validation file)
**Severity:** Moderate
**Impact:** Potential security bypass on Windows

**Current Code:**
```typescript
export const safePath = z.string().refine(
  (p) => {
    const normalized = path.normalize(p);
    if (normalized.includes('..')) return false;
    if (p.includes('\0')) return false;
    return true;
  },
  { message: 'Path contains invalid traversal patterns' }
);
```

**Problems:**
- `path.normalize()` on Windows converts `/` to `\` - could bypass checks
- Symlink traversal not prevented
- No suspicious pattern detection

**Fix:**
```typescript
import path from 'path';

export const safePath = z.string().refine(
  (p) => {
    // Normalize using forward slashes for consistency
    const normalized = path.normalize(p).split(path.sep).join('/');

    // Prevent directory traversal
    if (normalized.includes('..')) return false;

    // Prevent null byte injection
    if (p.includes('\0')) return false;

    // Prevent leading/trailing whitespace
    if (p !== p.trim()) return false;

    // Prevent backslash (could be Windows path injection)
    if (p.includes('\\')) return false;

    // Prevent suspicious patterns
    if (/^\/+(etc|proc|sys|dev)\//i.test(normalized)) return false;

    return true;
  },
  { message: 'Path validation failed: contains invalid patterns' }
);
```

---

### 10. Logger Uses Emojis in Production Logs
**Files:** Multiple files with 20+ instances
**Severity:** Moderate
**Impact:** Log parsing difficulties, CI/CD issues

**Affected Files:**
- `src/middleware/logger.ts:32` - ✅ ❌ status icons
- `src/utils/circuitBreaker.ts:129, 133, 152, 169, 180, 221, 295, 308` - 🟡 🔴 🟢 🔄 🧹
- `src/server.ts:80, 83, 88, 91, 137` - 🛑 ✅ ❌
- `src/utils/responseBuilder.ts:423-425` - ✅ ❌

**Current Code:**
```typescript
const statusIcon = status >= 400 ? '❌' : '✅';
console.log(`[CB] 🔴 Circuit ${name} OPENED`);
console.log(`[CB] 🟢 Circuit ${name} CLOSED after recovery`);
```

**Fix:**
```typescript
// Create structured log format without emojis
const statusIndicator = status >= 400 ? '[ERROR]' : '[OK]';

// Or use environment-aware formatting
const useEmoji = process.env.NODE_ENV === 'development';
const statusIcon = status >= 400
  ? (useEmoji ? '❌' : '[ERROR]')
  : (useEmoji ? '✅' : '[OK]');
```

---

## Minor Issues

### 11. Missing Test Coverage for Validation Layer
**Files:** `src/middleware/queryParser.ts`, `src/middleware/errorHandler.ts`
**Severity:** Minor
**Impact:** Edge cases untested

**Current Coverage:**
| Module | Tests | Coverage |
|--------|-------|----------|
| Circuit Breaker | 13 | 95%+ |
| Retry Logic | 11 | 90%+ |
| Response Builder | 8 | 85%+ |
| Validation | 0 | 0% |
| Error Handler | 0 | 0% |

**Recommended Tests:**

```typescript
// __tests__/unit/queryParser.test.ts
describe('parseAndValidate', () => {
  it('should parse single query from body', () => {});
  it('should parse batch queries from body', () => {});
  it('should reject queries exceeding max limit', () => {});
  it('should return validation errors with field paths', () => {});
  it('should handle malformed JSON in queries string', () => {});
});

// __tests__/unit/errorHandler.test.ts
describe('errorHandler', () => {
  it('should return 400 for validation errors', () => {});
  it('should return 500 for server errors', () => {});
  it('should extract tool name from path', () => {});
  it('should log to error queue on telemetry failure', () => {});
  it('should sanitize query params in logs', () => {});
});
```

---

### 12. Success Threshold Mismatch
**File:** `src/utils/circuitBreaker.ts:268-279`
**Severity:** Minor (By Design)
**Impact:** Potential circuit flapping (but optimized for fast recovery)

**Current State:**
- LSP: `successThreshold: 1` (intentional - fast recovery for local service)
- GitHub: `successThreshold: 1` (intentional - API recovered)
- DEFAULT: `successThreshold: 2`

**Analysis:** The mismatch exists but appears **intentional by design**:
- LSP is a local service that recovers quickly - single success proves recovery
- GitHub API rate limits are well-defined - single success proves limit reset
- DEFAULT uses 2 for unknown services as a safety margin

**Recommendation (Optional):**
If circuit flapping is observed in production, consider increasing thresholds:
```typescript
configureCircuit('lsp', {
  failureThreshold: 3,
  successThreshold: 2,  // Require 2 successes for stability
  resetTimeoutMs: 10000,
});

configureCircuit('github', {
  failureThreshold: 2,
  successThreshold: 2,  // Require 2 successes for stability
  resetTimeoutMs: 60000,
});
```

**Status:** ⚠️ Monitor in production before changing - current design is reasonable.

---

## Implementation Priority

### Phase 1: Critical (This Sprint)
- [ ] Issue #1: Add timeout to async logging
- [ ] Issue #2: Optimize logger memory usage

### Phase 2: Major (Next Sprint)
- [ ] Issue #3: Fix type coercion in error paths
- [ ] Issue #4: Centralize query validation
- [ ] Issue #5: Implement request cancellation
- [ ] Issue #6: Add circuit breaker TTL/cleanup

### Phase 3: Moderate (Backlog)
- [ ] Issue #7: Pre-configure local/package circuits
- [ ] Issue #8: Expose error queue in /health
- [ ] Issue #9: Strengthen path validation
- [ ] Issue #10: Remove emojis from logs

### Phase 4: Minor (As Time Permits)
- [ ] Issue #11: Add validation layer tests
- [ ] Issue #12: Adjust success thresholds

---

## References

| File | Lines | Issue |
|------|-------|-------|
| `src/middleware/errorHandler.ts` | 35-38 | #1, #3 |
| `src/utils/logger.ts` | 32, 142-158 | #2, #10 |
| `src/utils/retry.ts` | 164, 167, 183, 202, 221, 230, 238, 246 | #3 |
| `src/routes/tools.ts` | 475-578, 517, 531-545 | #1, #4, #5 |
| `src/routes/prompts.ts` | 111 | #1 |
| `src/middleware/queryParser.ts` | 31-77 | #4 |
| `src/utils/circuitBreaker.ts` | 58-59, 175, 187, 268-279 | #1, #6, #7, #10, #12 |
| `src/server.ts` | 32-46, 80-91, 124, 137 | #1, #8, #10 |
| `src/validation/httpPreprocess.ts` | 64-72 | #9 |
| `src/utils/responseBuilder.ts` | 423-425 | #10 |
| `src/__tests__/` | - | #11 |

---

*Generated by octocode-research evaluation*
*Validated: 2025-01-19 using explore agents - 11/12 issues confirmed, 1 by design*

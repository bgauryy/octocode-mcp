# Middleware Components

This document describes the Express middleware components used in the octocode-research HTTP server. The middleware chain handles request processing, validation, logging, and error handling.

## Overview

The server uses 4 middleware components:

1. **requestLogger** - Request/response logging with correlation IDs
2. **queryParser** - Complex query parameter parsing and validation
3. **readiness** - Server initialization status checking
4. **errorHandler** - Global error handling and formatting

All middleware components are located in `octocode-research/src/middleware/`.

---

## 1. Request Logger Middleware

**File**: `octocode-research/src/middleware/logger.ts`

**Purpose**: Tracks request lifecycle, generates correlation IDs, and logs request/response details to both console and tool call system.

### Features

- **Request ID Generation**: Generates or extracts `x-request-id` from headers for request correlation
- **Duration Tracking**: Measures request processing time from start to finish
- **Colored Console Output**: Uses status icons and colored formatting for visibility
- **Tool Call Logging**: Logs detailed tool execution metadata for debugging and monitoring
- **Health Endpoint Filtering**: Excludes `/health` endpoint from tool call logging to reduce noise

### Implementation

```typescript
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  const requestId = getRequestId(req);

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusIcon = status >= 400 ? '❌' : '✅';
    const success = status < 400;

    // Console logging with colors
    const resultMessage = `${statusIcon} ${req.method} ${req.path} ${status} ${duration}ms`;
    if (success) {
      console.log(resultLog(resultMessage));
    } else {
      console.log(errorLog(resultMessage));
    }

    // Tool call logging (excludes /health)
    if (req.path !== '/health') {
      logToolCall({
        tool: extractToolName(req.path),
        route: req.path,
        method: req.method,
        params: sanitizeQueryParams(req.query as Record<string, unknown>),
        duration,
        success,
        error: success ? undefined : `HTTP ${status}`,
        requestId,
      });
    }
  });

  next();
}
```

**Reference**: `octocode-research/src/middleware/logger.ts:1-55`

### Request ID Generation

The middleware generates or extracts correlation IDs:

```typescript
function getRequestId(req: Request): string {
  const existingId = req.headers['x-request-id'];
  if (typeof existingId === 'string' && existingId.length > 0) {
    return existingId;
  }
  return randomUUID();
}
```

If a client provides an `x-request-id` header, it is reused. Otherwise, a new UUID is generated.

### Status Icons

- ✅ Success (status < 400)
- ❌ Error (status >= 400)

### Logged Information

**Console output:**
- HTTP method
- Request path
- Status code
- Duration in milliseconds
- Status icon (✅/❌)

**Tool call system:**
- Tool name (extracted from path)
- Route and method
- Sanitized query parameters
- Duration
- Success status
- Error message (if applicable)
- Request ID for correlation

### Integration

The logger is applied globally in `server.ts` before other middleware:

```typescript
app.use(requestLogger);
```

---

## 2. Query Parser Middleware

**File**: `octocode-research/src/middleware/queryParser.ts`

**Purpose**: Parses and validates complex query parameters, supporting both single object and JSON array formats with comprehensive Zod schema validation.

### Features

- **Dual Format Support**: Handles both direct query params and JSON array format
- **Schema Validation**: Uses Zod for type-safe validation
- **Detailed Error Messages**: Provides field-level error reporting with path information
- **Type Safety**: Returns strongly-typed validated data
- **Response Formatting**: Includes helper for standardized tool result responses

### Query Formats

**Format 1: JSON Array (batch queries)**
```
GET /tool?queries=[{"param1":"value1"},{"param2":"value2"}]
```

The `queries` parameter contains a JSON-stringified array of query objects.

**Format 2: Direct Parameters (single query)**
```
GET /tool?param1=value1&param2=value2
```

Direct query parameters are treated as a single query object.

### Implementation

```typescript
export function parseAndValidate<T>(
  query: Record<string, unknown>,
  schema: ZodSchema<T>
): T[] {
  // Handle JSON array format
  if (query.queries && typeof query.queries === 'string') {
    try {
      const parsed = JSON.parse(query.queries);
      if (Array.isArray(parsed)) {
        const validated = parsed.map((item, index) => {
          const result = schema.safeParse(item);
          if (!result.success) {
            throw new ValidationError(
              `Validation failed for query[${index}]: ${formatZodError(result.error)}`,
              result.error.issues
            );
          }
          return result.data;
        });
        return validated;
      }
    } catch (e) {
      if (e instanceof ValidationError) throw e;
    }
  }

  // Handle direct object format
  const cleanedQuery: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'queries') {
      cleanedQuery[key] = value;
    }
  }

  const result = schema.safeParse(cleanedQuery);
  if (!result.success) {
    throw new ValidationError(
      formatZodError(result.error),
      result.error.issues
    );
  }
  return [result.data];
}
```

**Reference**: `octocode-research/src/middleware/queryParser.ts:15-50`

### Error Handling

**ValidationError class:**

```typescript
class ValidationError extends Error {
  statusCode: number;
  code: string;
  details: z.ZodIssue[];

  constructor(message: string, details: z.ZodIssue[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}
```

**Reference**: `octocode-research/src/middleware/queryParser.ts:1-14`

### Error Formatting

The `formatZodError` function creates clear, actionable error messages:

```typescript
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
```

**Example error output:**
```
Validation failed for query[1]: owner: Required; repo: Required
```

**Reference**: `octocode-research/src/middleware/queryParser.ts:45-52`

### Response Formatting Helper

```typescript
export function sendToolResult(
  res: Response,
  data: unknown,
  raw: unknown
): void {
  res.json({
    success: true,
    data,
    raw,
  });
}
```

Provides consistent response format across all tool endpoints.

### Usage Example

```typescript
// In route handler
const queries = parseAndValidate(
  req.query as Record<string, unknown>,
  githubSearchSchema
);
```

### Validation Benefits

1. **Type Safety**: Zod ensures runtime type correctness
2. **Clear Errors**: Field-level error messages with paths
3. **Batch Support**: Validates multiple queries with index tracking
4. **Schema Reuse**: Single schema validates both formats

---

## 3. Readiness Middleware

**File**: `octocode-research/src/middleware/readiness.ts`

**Purpose**: Checks if the server has completed initialization before processing requests. Prevents requests from being handled before MCP tools are ready.

### Features

- **MCP Initialization Check**: Verifies MCP tools are loaded and cached
- **503 Response**: Returns Service Unavailable when not ready
- **Helpful Error Messages**: Provides retry guidance to clients
- **Non-Blocking**: Passes control to next middleware when ready

### Implementation

```typescript
export const checkReadiness: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!isMcpInitialized()) {
    res.status(503).json({
      success: false,
      error: {
        message: 'Server is initializing',
        code: 'SERVER_INITIALIZING',
        hint: 'Please retry in a few seconds',
      },
    });
    return;
  }
  next();
};
```

**Reference**: `octocode-research/src/middleware/readiness.ts:1-20`

### Initialization Check

The middleware uses `isMcpInitialized()` from `mcpCache.ts` to determine server readiness:

```typescript
import { isMcpInitialized } from '../mcpCache.js';
```

### Response Format (Not Ready)

```json
{
  "success": false,
  "error": {
    "message": "Server is initializing",
    "code": "SERVER_INITIALIZING",
    "hint": "Please retry in a few seconds"
  }
}
```

**HTTP Status**: 503 Service Unavailable

### Integration

Applied to routes that require MCP tools:

```typescript
app.use('/tools/*', checkReadiness);
app.use('/prompts/*', checkReadiness);
```

### Initialization Flow

1. Server starts (via `server-init.ts`)
2. MCP cache initialization begins
3. Readiness middleware blocks requests with 503
4. MCP tools loaded and cached
5. `isMcpInitialized()` returns true
6. Readiness middleware allows requests through

---

## 4. Error Handler Middleware

**File**: `octocode-research/src/middleware/errorHandler.ts`

**Purpose**: Global error handling middleware that catches errors from route handlers and provides centralized error response formatting.

### Features

- **Centralized Error Handling**: Single location for error response logic
- **Consistent Formatting**: Standardized error response structure
- **Error Classification**: Handles different error types appropriately
- **Stack Trace Control**: Includes stack traces in development mode

### Implementation Details

Documentation pending - implementation details to be extracted from `octocode-research/src/middleware/errorHandler.ts`

### Integration

Applied as the last middleware in the chain:

```typescript
app.use(errorHandler);
```

Must be registered after all routes to catch errors from route handlers.

---

## Middleware Chain Order

The middleware components are applied in this order:

```
1. requestLogger        - First: tracks request start
2. express.json()       - Parse JSON bodies
3. checkReadiness       - Verify server initialization
4. Route handlers       - Process requests
5. errorHandler         - Last: catch all errors
```

**Order is critical** because:
- Logger must run first to track all requests
- Readiness check must block before route processing
- Error handler must be last to catch route errors

---

## Testing

Middleware components include comprehensive test coverage:

**Test files:**
- `octocode-research/src/__tests__/unit/queryParser.test.ts` - Query parser validation tests
- `octocode-research/src/__tests__/unit/errorHandler.test.ts` - Error handler tests
- `octocode-research/src/__tests__/unit/circuitBreaker.test.ts` - Resilience pattern tests

**Test coverage includes:**
- JSON array query parsing
- Direct parameter parsing
- Validation error handling
- Error message formatting
- Edge cases and malformed input

---

## Related Patterns

The middleware components integrate with resilience patterns:

**Circuit Breaker**: Routes wrap tool calls with circuit breaker logic (see `src/utils/circuitBreaker.ts`)

**Retry Logic**: Failed requests can be retried with exponential backoff (see `src/utils/retry.ts`)

**Timeout Handling**: Async operations have timeout wrappers (see `src/utils/asyncTimeout.ts`)

These patterns are applied at the route handler level after middleware validation completes.

---

## Related Documentation

- [04-API-REFERENCE.md](./04-API-REFERENCE.md) - HTTP endpoints and request formats
- [07-PATTERNS.md](./07-PATTERNS.md) - Resilience patterns
- [08-ERROR-HANDLING.md](./08-ERROR-HANDLING.md) - Error handling strategies
- [14-INTEGRATIONS.md](./14-INTEGRATIONS.md) - External integrations

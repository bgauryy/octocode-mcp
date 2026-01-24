# Error Handling

This document describes the centralized error handling middleware and error response formats in the octocode-research server.

## Error Handler Middleware

The server uses a centralized Express middleware to handle all errors in a consistent manner.

### Middleware Implementation

```typescript
export function errorHandler(
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = error.statusCode ?? 500;
  const isValidationError = statusCode === 400;

  // Log error with appropriate level
  if (isValidationError) {
    logWarn(`[VALIDATION] ${req.method} ${req.path}: ${error.message}`, {
      path: req.path,
      query: sanitizeQueryParams(req.query as Record<string, unknown>),
      details: error.details,
    });
  } else {
    logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, error);
  }

  // Log error to session telemetry
  const toolName = extractToolName(req.path);
  const errorCode = error.code ?? (isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
  fireAndForgetWithTimeout(
    () => logSessionError(toolName, errorCode),
    5000,
    'logSessionError'
  );

  // Send standardized error response
  const response: {
    success: false;
    error: {
      message: string;
      code: string;
      details?: z.ZodIssue[];
    };
  } = {
    success: false,
    error: {
      message: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    },
  };

  // Include validation details for 400 errors
  if (isValidationError && error.details) {
    response.error.details = error.details;
  }

  res.status(statusCode).json(response);
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:15-65`

### Middleware Registration

The error handler is registered as the **last middleware** in the Express app, ensuring it catches all unhandled errors:

```typescript
// All routes first
app.use('/tools', toolsRoutes);
app.use('/prompts', promptsRoutes);
// ... other routes

// Error handler last
app.use(errorHandler);
```

Reference: `octocode-research/src/server.ts:146`

**Why last?**
- Express error handlers must be registered after all routes
- Catches errors from any route handler or middleware
- Acts as a safety net for unhandled exceptions

## Error Types

### ApiError Interface

```typescript
interface ApiError extends Error {
  statusCode?: number;       // HTTP status code (400, 404, 500, etc.)
  code?: string;             // Error code (VALIDATION_ERROR, TOOL_NOT_FOUND, etc.)
  details?: z.ZodIssue[];    // Validation details (Zod errors)
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:5-10`

### Status Code Determination

```typescript
const statusCode = error.statusCode ?? 500;
```

**Logic:**
- If error has `statusCode` property, use it
- Otherwise, default to 500 (Internal Server Error)

Reference: `octocode-research/src/middleware/errorHandler.ts:17`

### Common Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 400 | Bad Request | Validation errors, invalid parameters |
| 404 | Not Found | Tool not found, resource not found |
| 500 | Internal Server Error | Tool execution failed, unexpected errors |
| 503 | Service Unavailable | MCP not initialized, circuit breaker open |

## Logging

### Log Levels

The error handler uses different log levels based on error type:

#### Validation Errors (400)

**Log level:** WARN
**Log format:** `[VALIDATION] {method} {path}: {message}`

```typescript
if (isValidationError) {
  logWarn(`[VALIDATION] ${req.method} ${req.path}: ${error.message}`, {
    path: req.path,
    query: sanitizeQueryParams(req.query as Record<string, unknown>),
    details: error.details,
  });
}
```

**Why WARN?**
- Validation errors are expected (user mistakes)
- Not server failures
- Don't indicate bugs or system issues

**Logged to:** `~/.octocode/logs/errors.log`

Reference: `octocode-research/src/middleware/errorHandler.ts:24-31`

#### Server Errors (500)

**Log level:** ERROR
**Log format:** `[SERVER] {method} {path}: {message}`

```typescript
else {
  logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, error);
}
```

**Why ERROR?**
- Indicates server failure or unexpected condition
- Requires investigation
- May indicate bugs or system issues

**Logged to:** `~/.octocode/logs/errors.log`

Reference: `octocode-research/src/middleware/errorHandler.ts:32-34`

### Query Parameter Sanitization

Sensitive query parameters are sanitized before logging:

```typescript
function sanitizeQueryParams(query: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...query };
  const sensitiveKeys = ['token', 'apiKey', 'password', 'secret'];

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '***';
    }
  }

  return sanitized;
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:70-85`

**Protected keys:**
- `token`
- `apiKey`
- `password`
- `secret`

### Session Telemetry

Errors are logged to session telemetry for tracking:

```typescript
const toolName = extractToolName(req.path);  // Extract from /tools/call/:toolName
const errorCode = error.code ?? (isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');

fireAndForgetWithTimeout(
  () => logSessionError(toolName, errorCode),
  5000,
  'logSessionError'
);
```

**Fire-and-forget pattern:**
- Telemetry logging is non-blocking
- 5-second timeout prevents hanging
- Errors in telemetry logging don't affect response

Reference: `octocode-research/src/middleware/errorHandler.ts:36-42`

## Error Response Format

### Standard Error Response

All errors return a standardized JSON format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:44-57`

### Validation Error Response

Validation errors include additional `details` field with Zod validation issues:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "code": "invalid_type",
        "expected": "array",
        "received": "object",
        "path": ["queries"],
        "message": "Expected array, received object"
      }
    ]
  }
}
```

Reference: `octocode-research/src/middleware/errorHandler.ts:59-62`

**Zod validation details:**
- `code`: Validation error code (invalid_type, too_small, custom, etc.)
- `path`: Field path where error occurred (e.g., ["queries", 0, "owner"])
- `message`: Human-readable error message
- `expected`: Expected value type
- `received`: Actual value type

## Error Codes

### Common Error Codes

| Code | Status | Meaning | Example |
|------|--------|---------|---------|
| `VALIDATION_ERROR` | 400 | Request validation failed | Missing required field, invalid type |
| `TOOL_NOT_FOUND` | 404 | Requested tool doesn't exist | `/tools/call/invalidTool` |
| `SERVICE_UNAVAILABLE` | 503 | MCP not initialized | MCP cache not loaded |
| `CIRCUIT_OPEN` | 503 | Circuit breaker is open | Too many failures to external API |
| `TIMEOUT_ERROR` | 500 | Operation timed out | Tool execution exceeded timeout |
| `RATE_LIMIT_ERROR` | 429 | Rate limit exceeded | GitHub API rate limit |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Unhandled exception |

### Error Code Determination

```typescript
const errorCode = error.code ?? (isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
```

**Logic:**
1. Use `error.code` if present
2. Otherwise, use `VALIDATION_ERROR` for 400 errors
3. Otherwise, use `INTERNAL_ERROR`

Reference: `octocode-research/src/middleware/errorHandler.ts:38`

## Example Error Scenarios

### Validation Error Example

**Request:**
```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{"query": {"keywords": ["useState"]}}'  # Wrong: "query" instead of "queries"
```

**Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed: queries must be an array",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "code": "invalid_type",
        "expected": "array",
        "received": "undefined",
        "path": ["queries"],
        "message": "Required"
      }
    ]
  }
}
```

**Log output:**
```
[VALIDATION] POST /tools/call/githubSearchCode: Validation failed: queries must be an array
```

Reference: `octocode-research/src/middleware/errorHandler.ts:24-31`

### Tool Not Found Example

**Request:**
```bash
curl -X POST http://localhost:1987/tools/call/invalidTool \
  -H "Content-Type: application/json" \
  -d '{"queries": [{}]}'
```

**Response (404):**
```json
{
  "success": false,
  "error": {
    "message": "Tool not found: invalidTool",
    "code": "TOOL_NOT_FOUND"
  }
}
```

**Log output:**
```
[SERVER] POST /tools/call/invalidTool: Tool not found: invalidTool
```

Reference: `octocode-research/src/middleware/errorHandler.ts:32-34`

### Timeout Error Example

**Request:**
```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{"queries": [{"keywordsToSearch": ["test"], "owner": "facebook", "repo": "react"}]}'
```

**Response (500):**
```json
{
  "success": false,
  "error": {
    "message": "githubSearchCode:timeout timed out after 60000ms",
    "code": "TIMEOUT_ERROR"
  }
}
```

**Log output:**
```
[SERVER] POST /tools/call/githubSearchCode: githubSearchCode:timeout timed out after 60000ms
Error: TimeoutError
    at withTimeout (/path/to/asyncTimeout.ts:15)
    at withResilience (/path/to/resilience.ts:110)
    ...
```

Reference: `octocode-research/src/middleware/errorHandler.ts:32-34`, `octocode-research/src/utils/asyncTimeout.ts:10-25`

### Circuit Open Error Example

**Request:**
```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{"queries": [{"keywordsToSearch": ["test"]}]}'
```

**Response (503):**
```json
{
  "success": false,
  "error": {
    "message": "Circuit github:search is OPEN. Will retry in 45 seconds",
    "code": "CIRCUIT_OPEN"
  }
}
```

**Log output:**
```
[SERVER] POST /tools/call/githubSearchCode: Circuit github:search is OPEN
🔴 Circuit github:search is OPEN - 45s until retry
```

Reference: `octocode-research/src/utils/circuitBreaker.ts:166-185`

### MCP Not Ready Example

**Request:**
```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{"queries": [{}]}'
```

**Response (503):**
```json
{
  "success": false,
  "error": {
    "message": "MCP is not initialized. Call /tools/initContext first.",
    "code": "SERVICE_UNAVAILABLE"
  }
}
```

**Log output:**
```
[SERVER] POST /tools/call/githubSearchCode: MCP is not initialized
```

Reference: `octocode-research/src/middleware/readiness.ts:10-25`

## Error Logging Files

### errors.log

**Location:** `~/.octocode/logs/errors.log`

**Content:**
- All validation errors (WARN level)
- All server errors (ERROR level)
- Includes timestamp, log level, message, and metadata

**Example entries:**
```
2024-01-23T10:30:00.000Z [WARN] [VALIDATION] POST /tools/call/githubSearchCode: Validation failed
2024-01-23T10:31:00.000Z [ERROR] [SERVER] POST /tools/call/githubSearchCode: Timeout after 60s
```

Reference: `octocode-research/src/utils/logger.ts:27`

### Log Rotation

**Rotation trigger:** File size exceeds 10MB
**Rotation format:** `errors.2024-01-23T10-30-00.log`
**Retention:** Keep 5 most recent rotations

Reference: `octocode-research/src/utils/logger.ts:28-120`

## Error Handling Best Practices

### 1. Always Include Error Code

```typescript
throw new ApiError('Rate limit exceeded', 429, 'RATE_LIMIT_ERROR');
```

**Benefits:**
- Clients can handle errors programmatically
- Easier debugging (grep for specific error codes)
- Consistent error identification

### 2. Provide Helpful Error Messages

**Good:**
```
"Validation failed: queries must be an array of 1-5 objects"
```

**Bad:**
```
"Invalid input"
```

### 3. Include Context in Logs

```typescript
logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, {
  path: req.path,
  query: req.query,
  body: req.body,
  error: error,
});
```

**Benefits:**
- Easier debugging
- Correlate errors with specific requests
- Understand error context

### 4. Sanitize Sensitive Data

Always sanitize tokens, API keys, and passwords before logging:

```typescript
const sanitized = sanitizeQueryParams(req.query);
```

Reference: `octocode-research/src/middleware/errorHandler.ts:70-85`

### 5. Use Fire-and-Forget for Non-Critical Operations

Telemetry logging should never block responses:

```typescript
fireAndForgetWithTimeout(
  () => logSessionError(toolName, errorCode),
  5000,
  'logSessionError'
);
```

Reference: `octocode-research/src/middleware/errorHandler.ts:36-42`

## Testing Error Handling

Error handler middleware is fully tested:

**Test file:** `src/__tests__/unit/errorHandler.test.ts`

**Test cases:**
- Validation errors (400) logged as WARN
- Server errors (500) logged as ERROR
- Error response format is correct
- Validation details included for 400 errors
- Query parameter sanitization works
- Default status code is 500

Reference: `octocode-research/src/__tests__/unit/errorHandler.test.ts:1-100`

**Running tests:**
```bash
npm test -- errorHandler.test.ts
```

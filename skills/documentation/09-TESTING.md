# Testing

## Overview

The octocode-research skill uses **Vitest** as its test runner with comprehensive test coverage including unit and integration tests. The testing infrastructure supports watch mode for development, coverage reporting with configurable thresholds, and HTTP integration testing with Supertest.

---

## Running Tests

### Test Commands

Execute tests using the following npm scripts defined in `octocode-research/package.json:52`:

```bash
# Run all tests once (single run)
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch
```

**Evidence:**
- `octocode-research/package.json:52` - Test scripts configuration

---

## Vitest Configuration

### Configuration File

The test configuration is defined in `octocode-research/vitest.config.ts:4`:

```typescript
test: {
  include: ['src/__tests__/**/*.test.ts'],
  globals: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: ['src/__tests__/**', 'src/types/**'],
    thresholds: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
}
```

### Key Configuration Details

- **Test Pattern:** `src/__tests__/**/*.test.ts` - All `.test.ts` files in `__tests__` directory
- **Globals Enabled:** `globals: true` - No need to import `describe`, `it`, `expect` in test files
- **Coverage Provider:** V8 engine for accurate code coverage
- **Coverage Reporters:**
  - `text` - Console output
  - `html` - HTML report for browser viewing
  - `lcov` - Standard format for CI/CD integration
- **Coverage Thresholds:**
  - Statements: 70%
  - Functions: 70%
  - Lines: 70%
  - Branches: 60% (lower threshold for complex branching logic)

**Evidence:**
- `octocode-research/vitest.config.ts:4` - Complete test configuration
- `octocode-research/package.json:79` - Vitest version 4.0.16

---

## Test Organization

### Unit Tests

Located in `src/__tests__/unit/`, unit tests verify individual components in isolation:

| Test File | Component Under Test | Purpose |
|-----------|---------------------|---------|
| `circuitBreaker.test.ts` | `src/utils/circuitBreaker.ts` | Circuit breaker state transitions, failure thresholds, recovery logic |
| `retry.test.ts` | `src/utils/retry.ts` | Retry mechanism with exponential backoff, retryable error detection |
| `errorHandler.test.ts` | `src/middleware/errorHandler.ts` | Error handling middleware response formatting |
| `logger.test.ts` | `src/utils/logger.ts` | Logging utility functions |
| `queryParser.test.ts` | `src/middleware/queryParser.ts` | Query parameter parsing and validation |
| `responseBuilder.test.ts` | `src/utils/responseBuilder.ts` | Response formatting utilities |

**Unit Test Characteristics:**
- Test individual functions and classes
- Mock external dependencies
- Fast execution (no I/O)
- High code coverage focus

**Evidence:**
- `octocode-research/src/__tests__/unit/circuitBreaker.test.ts:1` - Circuit breaker unit tests
- `octocode-research/src/__tests__/unit/retry.test.ts:1` - Retry mechanism unit tests
- `octocode-research/src/__tests__/unit/errorHandler.test.ts:1` - Error handler tests
- `octocode-research/src/__tests__/unit/logger.test.ts:1` - Logger tests
- `octocode-research/src/__tests__/unit/queryParser.test.ts:1` - Query parser tests
- `octocode-research/src/__tests__/unit/responseBuilder.test.ts:1` - Response builder tests

### Integration Tests

Located in `src/__tests__/integration/`, integration tests verify full system interactions:

| Test File | System Under Test | Purpose |
|-----------|------------------|---------|
| `routes.test.ts` | Express routes | Full HTTP request/response cycles through the Express server |
| `circuitBreaker.test.ts` | Circuit breaker system | Circuit breaker behavior across multiple sequential requests |

**Integration Test Characteristics:**
- Test complete request/response flows
- Use Supertest for HTTP assertions
- Verify middleware chain execution
- Test error handling end-to-end

**Evidence:**
- `octocode-research/src/__tests__/integration/routes.test.ts:1` - Routes integration tests
- `octocode-research/src/__tests__/integration/circuitBreaker.test.ts:1` - Circuit breaker integration tests

---

## Testing Utilities

### Primary Testing Dependencies

The project uses the following testing utilities defined in `octocode-research/package.json`:

| Package | Version | Purpose |
|---------|---------|---------|
| **vitest** | `^4.0.16` | Modern test runner with native ESM support, fast parallel execution |
| **@vitest/coverage-v8** | `^4.0.17` | Code coverage plugin using V8 JavaScript engine for accurate reporting |
| **supertest** | `^7.2.2` | HTTP assertion library for testing Express routes and middleware |
| **@types/supertest** | `^6.0.3` | TypeScript type definitions for Supertest |

**Evidence:**
- `octocode-research/package.json:79` - Vitest 4.0.16
- `octocode-research/package.json:72` - Coverage plugin V8 4.0.17
- `octocode-research/package.json:74` - Supertest 7.2.2
- `octocode-research/package.json:71` - TypeScript types for Supertest

### Vitest Features

**Globals Enabled** (`octocode-research/vitest.config.ts:6`):
- No imports needed for `describe`, `it`, `expect`
- Cleaner test file syntax
- Consistent with Jest patterns

**Native TypeScript Support:**
- `.test.ts` files run directly
- Full type checking in tests
- Type-safe test utilities

**Parallel Execution:**
- Tests run in parallel by default
- Faster test suite execution
- Isolated test environments

### Supertest for HTTP Testing

Supertest provides a high-level abstraction for testing HTTP endpoints:

```typescript
import request from 'supertest';
import app from '../server.js';

describe('GET /health', () => {
  it('should return 200 OK', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
  });
});
```

**Supertest Capabilities:**
- HTTP assertions (status codes, headers, body)
- Request chaining
- Cookie and session handling
- File uploads
- Authentication testing

**Evidence:**
- `octocode-research/package.json:74` - Supertest 7.2.2 for HTTP integration testing
- `octocode-research/vitest.config.ts:6` - Globals enabled for cleaner test syntax

---

## Test Coverage

### Coverage Thresholds

The project enforces minimum coverage thresholds to ensure code quality (`octocode-research/vitest.config.ts:4`):

- **Statements:** 70% minimum
- **Functions:** 70% minimum
- **Lines:** 70% minimum
- **Branches:** 60% minimum (lower threshold acknowledges complex branching in error handling and resilience patterns)

**Excluded from Coverage:**
- `src/__tests__/**` - Test files themselves
- `src/types/**` - Type definition files

### Coverage Reports

Three coverage report formats are generated:

1. **Text** - Console output during test runs
2. **HTML** - Interactive browser-based coverage viewer
3. **LCOV** - Standard format for CI/CD integration (e.g., Codecov, Coveralls)

**Evidence:**
- `octocode-research/vitest.config.ts:4` - Coverage configuration with thresholds and reporters

---

## Testing Best Practices

### Unit Test Guidelines

1. **Test in Isolation:** Mock external dependencies using Vitest's `vi.mock()`
2. **Clear Test Names:** Use descriptive `it()` statements that explain expected behavior
3. **Arrange-Act-Assert:** Structure tests with setup, execution, and verification phases
4. **Edge Cases:** Test boundary conditions, null values, and error states

### Integration Test Guidelines

1. **Real Middleware Chain:** Test the full Express middleware pipeline
2. **HTTP Status Codes:** Verify correct status codes for success and error cases
3. **Response Format:** Assert response body structure matches API contract
4. **Error Scenarios:** Test validation errors, authentication failures, and server errors

### Running Tests During Development

Use watch mode for rapid feedback during development:

```bash
npm run test:watch
```

**Watch Mode Features:**
- Auto-runs tests when files change
- Filters tests by file name or test name
- Shows only failed tests option
- Quick re-run of last failed tests

---

## Continuous Integration

### Coverage Integration

The LCOV reporter format enables integration with CI/CD platforms:

- **GitHub Actions:** Upload coverage to Codecov or Coveralls
- **GitLab CI:** Native coverage visualization
- **Jenkins:** Coverage trending reports

### Pre-commit Testing

Consider adding a pre-commit hook to run tests:

```bash
# .git/hooks/pre-commit
npm test
```

This ensures all committed code passes tests and meets coverage thresholds.

---

## Related Documentation

- **[07-PATTERNS.md](07-PATTERNS.md)** - Circuit breaker and retry patterns tested in unit tests
- **[08-ERROR-HANDLING.md](08-ERROR-HANDLING.md)** - Error handler middleware tested in integration tests
- **[13-MIDDLEWARE.md](13-MIDDLEWARE.md)** - Middleware components verified in integration tests
- **[10-DEPLOYMENT.md](10-DEPLOYMENT.md)** - Build and deployment processes

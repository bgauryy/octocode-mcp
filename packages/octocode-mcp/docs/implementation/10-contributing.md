# Contributing Guide

This guide provides comprehensive information for contributors to octocode-mcp, including development setup, coding standards, testing procedures, and contribution workflows.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Adding New Tools](#adding-new-tools)
6. [Testing](#testing)
7. [Code Review Process](#code-review-process)
8. [Documentation](#documentation)
9. [Release Process](#release-process)
10. [Community Guidelines](#community-guidelines)

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js >= 20.0.0** (check: `node --version`)
- **npm >= 9.0.0** (check: `npm --version`)
- **Git** (check: `git --version`)
- **GitHub Account** (for pull requests)
- **Text Editor** (VS Code, Cursor, or similar)

### Optional Tools

For full development experience:

- **ripgrep** (`brew install ripgrep` or equivalent)
- **GitHub CLI** (`brew install gh`)
- **TypeScript Language Server** (for LSP development)

### Fork and Clone

1. **Fork the repository** on GitHub

2. **Clone your fork:**
```bash
git clone https://github.com/YOUR_USERNAME/octocode-mcp.git
cd octocode-mcp
```

3. **Add upstream remote:**
```bash
git remote add upstream https://github.com/bgauryy/octocode-mcp.git
```

4. **Verify remotes:**
```bash
git remote -v
# origin    https://github.com/YOUR_USERNAME/octocode-mcp.git (fetch)
# origin    https://github.com/YOUR_USERNAME/octocode-mcp.git (push)
# upstream  https://github.com/bgauryy/octocode-mcp.git (fetch)
# upstream  https://github.com/bgauryy/octocode-mcp.git (push)
```

---

## Development Setup

### Install Dependencies

```bash
# Navigate to package directory
cd packages/octocode-mcp

# Install dependencies
npm install
```

### Build the Project

```bash
# TypeScript compilation
npm run build

# Watch mode (rebuilds on changes)
npm run dev
```

### Run the Server

```bash
# Run built server
npm start

# Or use npx directly
npx .

# With debug logging
OCTOCODE_DEBUG=true npm start
```

### Verify Installation

```bash
# Test tool registration
OCTOCODE_DEBUG=true npm start

# Look for:
# [octocode] ✓ Registered: githubSearchCode
# [octocode] ✓ Registered: localSearchCode
# [octocode] Server ready (13 tools registered)
```

---

## Project Structure

### Directory Layout

```
packages/octocode-mcp/
├── src/
│   ├── index.ts                  # Main entry point
│   ├── serverConfig.ts           # Configuration management
│   ├── responses.ts              # Response utilities
│   ├── session.ts                # Session logging
│   ├── errorCodes.ts             # Error definitions
│   │
│   ├── tools/                    # Tool implementations
│   │   ├── toolConfig.ts         # Tool registry
│   │   ├── toolsManager.ts       # Tool registration
│   │   ├── toolNames.ts          # Tool name constants
│   │   ├── toolMetadata/         # Tool metadata
│   │   │
│   │   ├── github_search_code/
│   │   │   ├── execution.ts      # Tool logic
│   │   │   ├── scheme.ts         # Zod schema
│   │   │   ├── types.ts          # TypeScript types
│   │   │   └── hints.ts          # Dynamic hints (optional)
│   │   │
│   │   └── [other tools]/
│   │
│   ├── providers/                # Provider abstraction
│   │   ├── types.ts              # ICodeHostProvider interface
│   │   ├── factory.ts            # Provider registry
│   │   ├── execute.ts            # Execution layer
│   │   ├── github/               # GitHub implementation
│   │   └── gitlab/               # GitLab implementation
│   │
│   ├── github/                   # GitHub API integration
│   │   ├── client.ts             # GitHub client
│   │   ├── codeSearch.ts         # Code search
│   │   ├── fileContent.ts        # File content
│   │   ├── repoSearch.ts         # Repository search
│   │   ├── pullRequestSearch.ts  # PR search
│   │   ├── repoStructure.ts      # Repo structure
│   │   └── errors.ts             # Error handling
│   │
│   ├── gitlab/                   # GitLab API integration
│   │   └── [similar to github]
│   │
│   ├── lsp/                      # LSP integration
│   │   ├── client.ts             # LSP client
│   │   ├── manager.ts            # Client lifecycle
│   │   ├── config.ts             # Language server config
│   │   ├── resolver.ts           # Symbol resolution
│   │   └── types.ts              # LSP types
│   │
│   ├── commands/                 # Command builders
│   │   ├── BaseCommandBuilder.ts
│   │   ├── RipgrepCommandBuilder.ts
│   │   ├── FindCommandBuilder.ts
│   │   └── LsCommandBuilder.ts
│   │
│   ├── security/                 # Security layer
│   │   ├── withSecurityValidation.ts
│   │   ├── contentSanitizer.ts
│   │   ├── pathValidator.ts
│   │   ├── patternsConstants.ts
│   │   └── regexes.ts
│   │
│   ├── utils/                    # Utilities
│   │   ├── core/                 # Core utilities
│   │   ├── exec/                 # Command execution
│   │   ├── file/                 # File operations
│   │   ├── http/                 # HTTP & caching
│   │   ├── minifier/             # Content minification
│   │   ├── package/              # Package registry
│   │   ├── pagination/           # Pagination helpers
│   │   ├── parsers/              # Response parsers
│   │   └── response/             # Response formatting
│   │
│   └── scheme/                   # Shared schemas
│       └── baseSchema.ts         # Base schema utilities
│
├── tests/                        # Test suite
│   ├── integration/              # Integration tests
│   ├── unit/                     # Unit tests
│   ├── github/                   # GitHub tests
│   ├── security/                 # Security tests
│   └── utils/                    # Utility tests
│
├── docs/                         # Documentation
├── eval_tests/                   # Evaluation tests
├── documentation/                # Generated docs
│
├── package.json                  # Package configuration
├── tsconfig.json                 # TypeScript config
├── eslint.config.js              # ESLint config
└── vitest.config.ts              # Vitest config
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Server initialization and startup |
| `src/serverConfig.ts` | Environment configuration |
| `src/tools/toolConfig.ts` | Tool registry (add new tools here) |
| `src/providers/types.ts` | Provider interface definitions |
| `src/errorCodes.ts` | Error code definitions |
| `src/scheme/baseSchema.ts` | Shared schema utilities |

---

## Coding Standards

### TypeScript Style

**Use strict TypeScript:**
```typescript
// ✅ Good - explicit types
function processQuery(query: CodeSearchQuery): Promise<CodeSearchResult> {
  // ...
}

// ❌ Bad - implicit any
function processQuery(query) {
  // ...
}
```

**Avoid `any`:**
```typescript
// ✅ Good - specific types
const results: CodeSearchResult[] = [];

// ❌ Bad - any type
const results: any[] = [];
```

**Use interfaces for objects:**
```typescript
// ✅ Good - clear contract
interface QueryOptions {
  owner: string;
  repo: string;
  pattern: string;
}

// ❌ Bad - inline type
function search(options: { owner: string; repo: string; pattern: string }) {
  // ...
}
```

### ESLint Configuration

The project uses ESLint with TypeScript support. Configuration is in `eslint.config.js`.

**Run linting:**
```bash
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Key rules:**

- **No unused variables** (`@typescript-eslint/no-unused-vars`)
- **No explicit any** (`@typescript-eslint/no-explicit-any`)
- **Consistent naming** (`@typescript-eslint/naming-convention`)
- **No console.log** (use proper logging)

**Disable rules sparingly:**
```typescript
// Only when absolutely necessary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicValue: any = parseUnknownFormat(data);
```

### Code Formatting

**Use consistent formatting:**

```typescript
// ✅ Good - consistent style
export async function executeQuery(
  query: Query,
  options?: Options
): Promise<Result> {
  const validated = validateQuery(query);
  const result = await fetchData(validated);
  return formatResult(result);
}

// ❌ Bad - inconsistent style
export async function executeQuery(query:Query,options?:Options):Promise<Result>{
const validated=validateQuery(query);
const result=await fetchData(validated);
return formatResult(result);}
```

**Formatting rules:**
- 2 spaces for indentation
- Single quotes for strings (except when double quotes needed)
- Semicolons required
- Trailing commas in multi-line objects/arrays
- Max line length: 100 characters (soft limit)

### Naming Conventions

**Files:**
```
camelCase.ts          # For most files
PascalCase.ts         # For classes (e.g., BaseCommandBuilder.ts)
kebab-case.ts         # For tool directories (e.g., github-search-code/)
SCREAMING_SNAKE.ts    # For constants files (rare)
```

**Variables and Functions:**
```typescript
const userQuery = ...;              // camelCase for variables
function processQuery() { }         // camelCase for functions
class GitHubProvider { }            // PascalCase for classes
const MAX_RETRIES = 3;              // SCREAMING_SNAKE for constants
type CodeSearchQuery = ...;         // PascalCase for types
interface ICodeHostProvider { }     // PascalCase with 'I' prefix for interfaces
```

**Exports:**
```typescript
// ✅ Good - named exports
export function createClient() { }
export class GitHubProvider { }
export const TOOL_NAMES = { };

// ❌ Bad - default exports (avoid)
export default function() { }
```

### Comments and Documentation

**JSDoc for public APIs:**
```typescript
/**
 * Searches code across GitHub repositories using keywords and filters
 *
 * @param query - The search query parameters
 * @param options - Optional configuration
 * @returns Promise resolving to search results
 * @throws {ToolError} If query validation fails
 *
 * @example
 * const results = await searchCode({
 *   owner: 'facebook',
 *   repo: 'react',
 *   pattern: 'useState'
 * });
 */
export async function searchCode(
  query: CodeSearchQuery,
  options?: SearchOptions
): Promise<CodeSearchResult> {
  // ...
}
```

**Inline comments for complex logic:**
```typescript
// Check if symlink target is within allowed roots
// This prevents symlink-based path traversal attacks
const realPath = fs.realpathSync(absolutePath);
const isRealPathAllowed = this.allowedRoots.some(root => {
  return realPath === root || realPath.startsWith(root + path.sep);
});
```

**TODOs with context:**
```typescript
// TODO(security): Add rate limiting per client
// See issue #123 for discussion
```

---

## Adding New Tools

### Tool Checklist

To add a new tool:

1. ✅ Create tool directory
2. ✅ Implement execution logic
3. ✅ Define Zod schema
4. ✅ Add to tool registry
5. ✅ Write tests
6. ✅ Add documentation
7. ✅ Update hints (optional)

### Step-by-Step Guide

#### 1. Create Tool Directory

```bash
mkdir -p src/tools/my_new_tool
cd src/tools/my_new_tool
```

#### 2. Define Schema (`scheme.ts`)

```typescript
import { z } from 'zod';
import { createBulkQuerySchema } from '../../scheme/baseSchema.js';

// Define single query schema
export const MyToolQuerySchema = z.object({
  // Research context (required for all tools)
  mainResearchGoal: z.string(),
  researchGoal: z.string(),
  reasoning: z.string(),

  // Tool-specific parameters
  param1: z.string().min(1).max(255),
  param2: z.number().int().positive().optional(),
  param3: z.enum(['option1', 'option2']).optional(),
});

// Create bulk schema (1-5 queries)
export const MyToolBulkQuerySchema = createBulkQuerySchema(
  'myNewTool',
  MyToolQuerySchema,
  { maxQueries: 5 }  // Adjust based on tool type
);

// Export TypeScript types
export type MyToolQuery = z.infer<typeof MyToolQuerySchema>;
export type MyToolBulkQuery = z.infer<typeof MyToolBulkQuerySchema>;
```

#### 3. Define Types (`types.ts`)

```typescript
export interface MyToolResult {
  items: MyToolItem[];
  totalCount: number;
  hasMore: boolean;
}

export interface MyToolItem {
  id: string;
  name: string;
  description: string;
}
```

#### 4. Implement Execution (`execution.ts`)

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../../security/withSecurityValidation.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { MyToolBulkQuerySchema, type MyToolQuery } from './scheme.js';
import type { MyToolResult } from './types.js';

/**
 * Execute a single query
 */
async function executeMyToolQuery(
  query: MyToolQuery
): Promise<MyToolResult> {
  // Implement tool logic here
  // 1. Validate input (Zod schema already validated)
  // 2. Call external API or perform operation
  // 3. Format and return results

  const items = await fetchData(query.param1);

  return {
    items,
    totalCount: items.length,
    hasMore: false
  };
}

/**
 * Execute bulk operation (handles multiple queries)
 */
export async function executeMyNewTool(
  args: unknown
): Promise<CallToolResult> {
  // Parse and validate with Zod
  const parsed = MyToolBulkQuerySchema.parse(args);

  // Execute all queries in parallel
  return await executeBulkOperation(
    parsed.queries,
    executeMyToolQuery,
    {
      formatResult: (result) => ({
        // Format result for display
        text: formatMyToolResult(result)
      })
    }
  );
}

/**
 * Format results for display
 */
function formatMyToolResult(result: MyToolResult): string {
  return `Found ${result.totalCount} items:\n\n` +
    result.items.map(item =>
      `- ${item.name}: ${item.description}`
    ).join('\n');
}

/**
 * Wrapped execution with security validation
 */
export const myNewToolHandler = withSecurityValidation(
  'myNewTool',
  executeMyNewTool
);
```

#### 5. Register Tool (`src/tools/toolConfig.ts`)

```typescript
import { myNewToolHandler } from './my_new_tool/execution.js';
import { STATIC_TOOL_NAMES } from './toolNames.ts';

export const ALL_TOOLS: ToolDefinition[] = [
  // ... existing tools

  {
    name: STATIC_TOOL_NAMES.MY_NEW_TOOL,
    description: 'Brief description of what the tool does',
    inputSchema: MyToolBulkQuerySchema,
    handler: myNewToolHandler,
    category: 'search', // or 'content', 'analysis', etc.
    tags: ['github', 'search'], // For filtering
  },
];
```

#### 6. Add Tool Name Constant (`src/tools/toolNames.ts`)

```typescript
export const STATIC_TOOL_NAMES = {
  // ... existing tools
  MY_NEW_TOOL: 'myNewTool',
} as const satisfies ToolNamesMap;
```

#### 7. Write Tests (`tests/tools/my_new_tool.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { executeMyNewTool } from '../../src/tools/my_new_tool/execution.js';

describe('myNewTool', () => {
  it('should execute successfully with valid input', async () => {
    const result = await executeMyNewTool({
      queries: [{
        mainResearchGoal: 'Test goal',
        researchGoal: 'Specific goal',
        reasoning: 'Test reasoning',
        param1: 'test value'
      }]
    });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
  });

  it('should reject invalid input', async () => {
    await expect(executeMyNewTool({
      queries: [{ param1: '' }] // Missing required fields
    })).rejects.toThrow();
  });

  it('should handle multiple queries', async () => {
    const result = await executeMyNewTool({
      queries: [
        { mainResearchGoal: 'Goal', researchGoal: 'Goal', reasoning: 'Reason', param1: 'value1' },
        { mainResearchGoal: 'Goal', researchGoal: 'Goal', reasoning: 'Reason', param1: 'value2' },
      ]
    });

    expect(result.isError).toBe(false);
    // Verify both queries executed
  });
});
```

### Tool Best Practices

1. **Use withSecurityValidation** for all tools
2. **Support bulk queries** (1-N queries per request)
3. **Include research context fields** (mainResearchGoal, researchGoal, reasoning)
4. **Validate with Zod schemas**
5. **Throw ToolError for failures**
6. **Format results clearly**
7. **Include hints** for better UX
8. **Add comprehensive tests**
9. **Document usage** with JSDoc

---

## Testing

### Test Structure

```
tests/
├── unit/                      # Unit tests
│   ├── utils/
│   └── security/
├── integration/               # Integration tests
│   └── all-tools.test.ts
├── github/                    # GitHub API tests
├── tools/                     # Tool-specific tests
└── evals/                     # Evaluation tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# UI mode (interactive)
npm run test:ui
```

### Writing Tests

**Unit Test Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { ContentSanitizer } from '../../src/security/contentSanitizer.js';

describe('ContentSanitizer', () => {
  describe('detectSecrets', () => {
    it('should detect GitHub tokens', () => {
      const content = 'TOKEN=ghp_abc123xyz';
      const result = ContentSanitizer.sanitizeContent(content);

      expect(result.hasSecrets).toBe(true);
      expect(result.secretsDetected).toContain('github_token');
      expect(result.content).toContain('[REDACTED-GITHUB_TOKEN]');
    });

    it('should handle content without secrets', () => {
      const content = 'const x = 42;';
      const result = ContentSanitizer.sanitizeContent(content);

      expect(result.hasSecrets).toBe(false);
      expect(result.secretsDetected).toHaveLength(0);
      expect(result.content).toBe(content);
    });
  });
});
```

**Integration Test Example:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { executeGitHubSearchCode } from '../../src/tools/github_search_code/execution.js';

describe('githubSearchCode integration', () => {
  beforeAll(async () => {
    // Setup: initialize config, etc.
  });

  it('should search public repositories', async () => {
    const result = await executeGitHubSearchCode({
      queries: [{
        mainResearchGoal: 'Test',
        researchGoal: 'Test',
        reasoning: 'Test',
        owner: 'facebook',
        repo: 'react',
        keywordsToSearch: ['useState']
      }]
    });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
  });
});
```

### Test Coverage Requirements

- **Unit tests**: 80%+ coverage for utilities and core logic
- **Integration tests**: Cover all tool execution paths
- **Security tests**: Test all validation and sanitization
- **Edge cases**: Test error handling, rate limits, etc.

### Mocking

Use Vitest's built-in mocking:

```typescript
import { vi } from 'vitest';

// Mock external API
vi.mock('../../src/github/client.js', () => ({
  createGitHubClient: () => ({
    search: {
      code: vi.fn().mockResolvedValue(mockData)
    }
  })
}));
```

---

## Code Review Process

### Before Submitting

**Self-review checklist:**

- [ ] Code follows style guidelines
- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] TypeScript compiles (`npm run build`)
- [ ] Added/updated tests for changes
- [ ] Updated documentation
- [ ] No sensitive data (tokens, keys) in code
- [ ] Commit messages are clear
- [ ] Branch is up-to-date with main

### Submitting a Pull Request

1. **Create feature branch:**
```bash
git checkout -b feature/my-new-feature
```

2. **Make changes and commit:**
```bash
git add .
git commit -m "feat: add new tool for X

- Implement tool logic
- Add tests
- Update documentation"
```

3. **Push to your fork:**
```bash
git push origin feature/my-new-feature
```

4. **Open Pull Request on GitHub:**
- Use clear, descriptive title
- Reference related issues
- Describe changes and motivation
- Include screenshots (if UI changes)
- Check "Allow edits from maintainers"

### PR Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Change 1
- Change 2
- Change 3

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No linting errors
- [ ] TypeScript compiles
- [ ] Self-reviewed code
```

### Review Process

1. **Automated checks run** (linting, tests, build)
2. **Code review by maintainers**
3. **Requested changes** (if needed)
4. **Approval** from at least one maintainer
5. **Merge** to main branch

---

## Documentation

### Documentation Standards

1. **Code comments** for complex logic
2. **JSDoc** for public APIs
3. **README** updates for new features
4. **Type definitions** with descriptions
5. **Example usage** in docstrings

### Updating Documentation

When adding features:

1. **Update README.md** if user-facing
2. **Update docs/** if tool-related
3. **Add JSDoc** to new functions
4. **Update CHANGELOG** (maintained by maintainers)

---

## Release Process

### Versioning

We use Semantic Versioning (semver):

- **Major** (x.0.0): Breaking changes
- **Minor** (0.x.0): New features (backward compatible)
- **Patch** (0.0.x): Bug fixes

### Release Checklist

(For maintainers)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Run full test suite
4. Build and verify
5. Tag release
6. Publish to npm
7. Create GitHub release

---

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers
- Follow project standards
- Report unacceptable behavior

### Getting Help

- **Documentation**: Read docs first
- **Issues**: Search existing issues
- **Discussions**: Ask questions in GitHub Discussions
- **Discord**: Join community chat (if available)

### Recognition

Contributors are recognized in:
- GitHub contributors list
- CHANGELOG.md
- Release notes

---

## Summary

Key points for contributors:

1. **Setup**: Fork, clone, install dependencies
2. **Standards**: Follow TypeScript/ESLint guidelines
3. **Testing**: Write tests for all changes
4. **Documentation**: Update docs for new features
5. **Review**: Self-review before submitting PR
6. **Community**: Be respectful and helpful

Thank you for contributing to octocode-mcp!

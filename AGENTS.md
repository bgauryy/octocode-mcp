# AGENTS.md - Octocode-MCP

> Guidance for autonomous coding agents (Claude, Cursor, Copilot, etc.)
> Read this before making any changes to this repository.

## TL;DR Quick Checklist

Before starting any task:
- [ ] Read relevant sections below
- [ ] Check existing code patterns in similar files
- [ ] Run tests before committing: `yarn test`
- [ ] Lint code: `yarn lint`
- [ ] Format code: `yarn format`
- [ ] Update tests for code changes

## Operating Mode

**Default:** High Autonomy - Auto-approve most changes | Protect Secrets

| Action | Approval | Notes |
|--------|----------|-------|
| Edit `packages/*/src/` | Auto | Source code - follow patterns |
| Edit `packages/*/tests/` | Auto | Tests - keep them passing |
| Edit config files | Auto | Maintain validity, no breaking changes |
| Edit `docs/` | Auto | Documentation updates allowed |
| Install dependencies | Auto | Use `yarn` workspace commands |
| Edit `.github/workflows/` | Auto | CI/CD configuration |
| Edit root `package.json` | Auto | Monorepo configuration |
| Database operations | Manual | Never auto-execute |
| Edit Secrets/Env | NEVER | Ask user to handle credentials |
| Create summary docs | Ask | Only if explicitly requested |

**Override:** Add `# agent: manual-approval` in task description for strict oversight.

## Project Overview

**Octocode-MCP** is a Model Context Protocol (MCP) server that provides AI assistants with advanced GitHub repository analysis, code discovery, and npm package exploration capabilities.

- **Type:** MCP Server / Developer Tools
- **Language:** TypeScript (Node.js >= 18.12.0)
- **Package Manager:** Yarn (workspaces/monorepo)
- **Architecture:** Research-driven, progressive refinement, security-first
- **Key Focus:** Clean architecture, token efficiency, bulk operations

### Monorepo Structure

```
octocode-mcp/                    # Root monorepo
├── packages/
│   ├── octocode-mcp/           # Main MCP server package
│   │   ├── src/                # FULL ACCESS - Source code
│   │   │   ├── tools/          # Tool implementations
│   │   │   ├── github/         # GitHub API integration
│   │   │   ├── security/       # Content sanitization
│   │   │   ├── utils/          # Core utilities
│   │   │   ├── scheme/         # Zod validation schemas
│   │   │   └── prompts/        # System prompts
│   │   ├── tests/              # FULL ACCESS - Test files
│   │   └── dist/               # NEVER - Build output
│   └── octocode-utils/         # Utilities package
│       ├── src/                # FULL ACCESS - Utility source
│       └── tests/              # FULL ACCESS - Utility tests
├── docs/                        # EDIT - Documentation
├── .github/                     # EDIT - CI/CD workflows
├── node_modules/               # NEVER - Dependencies
└── coverage/                    # NEVER - Test coverage reports
```

## Repository Structure & Access

| Path | Agent Access | Description |
|------|--------------|-------------|
| `packages/*/src/` | FULL | Source code - edit freely |
| `packages/*/tests/` | FULL | Tests - always keep passing |
| `docs/` | EDIT | Documentation |
| `packages/*/dist/` | NEVER | Build artifacts |
| `node_modules/` | NEVER | Dependencies |
| `coverage/` | NEVER | Test coverage reports |
| `.env*`, `secrets/` | NEVER | Secrets and credentials |
| `mcp.sqlite` | NEVER | Session database |
| `.github/workflows/` | EDIT | CI/CD configuration |
| `package.json` (root) | EDIT | Monorepo configuration |
| `*.config.*` | EDIT | Build/test/lint configurations |

**Legend:** FULL = Allowed, EDIT = Modify with care, NEVER = Forbidden

## Core Principles

### Senior Engineering Mindset
- **Think holistically** - Consider system-wide implications before changes
- **Check data flow** - Trace changes through all dependent files
- **Architecture-first** - Design the solution, then implement with clean patterns
- **Analyze impact** - Use `src/tools/utils/toolRelationships.ts` to understand tool dependencies

### Clean Code & Architecture
- **Prefer clean, readable code** over clever optimizations
- **Follow established patterns** - See examples in `packages/octocode-mcp/src/tools/`
- **Maintain separation of concerns** - Tools, security, caching, utilities
- **Preserve modular organization** - Don't break existing structure
- **Extend BaseCommandBuilder** for new CLI-based tools

### Development Workflow
- **Use yarn** exclusively for package management
- **Always lint** after changes: `yarn lint` (required before builds)
- **Smart automation** - Use scripts for repetitive tasks
- **Test intelligently** - Targeted changes, not blanket rewrites

## Setup & Environment

### Initial Setup
```bash
yarn install                 # Install all dependencies (monorepo)
yarn build                   # Build all packages (with linting)
yarn test                    # Run all tests to verify
```

### Required Tools
- Node.js >= 18.12.0
- Yarn (Corepack enabled)
- Git

### Environment Variables
```bash
# Optional - for GitHub API access
GITHUB_TOKEN=your_github_token
```

## Style & Formatting

### Code Style
- **Line:** Max 80 chars | **Quotes:** Single (`'`) | **Semi:** Yes (`;`) | **Indent:** 2 spaces
- **Naming:** 
  - Functions/variables: `camelCase`
  - Classes/interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Files: `camelCase.ts` or `kebab-case.ts`
- **TypeScript:**
  - Strict mode enabled
  - No `any` without explicit reasoning
  - Unused params prefixed with `_`
  - Use Zod for runtime validation

### Commands
```bash
yarn format              # Auto-format all files (Prettier)
yarn lint                # Check all packages for issues (ESLint)
yarn lint:fix            # Auto-fix linting issues
yarn build               # Lint + syncpack + build all packages
yarn build:dev           # Build without linting (faster iteration)
```

### File-Scoped Commands (for efficiency)
```bash
# TypeScript type checking - single file
cd packages/octocode-mcp
npx tsc --noEmit src/tools/myTool.ts

# Lint single file
npx eslint --fix src/tools/myTool.ts

# Test single file
npx vitest run tests/tools/myTool.test.ts
```

**Use these for quick validation** before running full builds.

### Pre-Build Checklist
✅ Lint PASS | ✅ Format PASS | ✅ Tests PASS | ✅ Syncpack PASS

### ESLint Rules
- No `console.log` (use proper error handling)
- No `var` (use `const` or `let`)
- Prefer `const` over `let`
- No unused variables (except `_` prefixed)
- No explicit `any` types
- Prettier errors treated as lint errors

## Testing

```bash
yarn test                # Run all tests (all packages)
yarn test:watch          # TDD mode (watch for changes)
yarn test:coverage       # Generate coverage reports
yarn test:ui             # Visual test interface (Vitest UI)

# Package-specific
cd packages/octocode-mcp
yarn test                # Test main package only
vitest run tests/tools/myTool.test.ts  # Single file
```

### Test Organization
- **Location:** `tests/` mirrors `src/` structure
- **Naming:** `*.test.ts` or `*.spec.ts`
- **Framework:** Vitest with coverage (v8 provider)
- **Coverage:** Include `src/**/*.ts`, exclude test files

### Test Requirements
- ✅ **Minimum coverage:** Maintain good coverage (no hard minimum)
- ✅ **New features:** Add corresponding tests
- ✅ **Bug fixes:** Add regression tests
- ✅ **Mock external APIs:** Don't hit real GitHub/NPM in tests
- ✅ **Pattern:** Use `vi.clearAllMocks()` in `beforeEach()`

### Test Pattern
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ToolName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle valid input', async () => {
    // Arrange
    const input = { /* ... */ };
    
    // Act
    const result = await tool.execute(input);
    
    // Assert
    expect(result).toMatchObject({ /* ... */ });
  });

  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

### Testing Strategy
- **After big changes:** Review implementation first, then update tests
- **Reduce test churn:** Make smart, targeted changes
- **Integration tests:** For tool workflows
- **Unit tests:** For individual functions/classes

## Commit & PR Guidelines

### Commit Format
```
type(scope): description

[optional body]

[optional footer]
```

**Types:** `feat` | `fix` | `docs` | `style` | `refactor` | `test` | `chore`

**Examples:**
```
feat(github): add commit search tool
fix(security): sanitize malicious regex patterns
docs(readme): update installation instructions
refactor(cache): optimize TTL logic
test(tools): add bulk operation tests
chore(deps): update @modelcontextprotocol/sdk to 1.21.0
```

### PR Requirements

**Automated Checks (CI):**
1. ✅ **Lint:** Code style and quality checks
2. ✅ **Build:** All packages compile successfully
3. ✅ **Tests:** Full test suite passes
4. ✅ **Package Integrity:** Validate all package.json files

**PR Checklist:**
- [ ] Title follows commit format
- [ ] Description explains what/why
- [ ] Tests added/updated
- [ ] All CI checks pass
- [ ] No breaking changes (or documented)
- [ ] Documentation updated if needed

### Branches
- `main` - Production branch (protected)
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

## Common Commands

### Development
| Task | Command | Notes |
|------|---------|-------|
| Install | `yarn install` | Install all monorepo dependencies |
| Dev (watch) | `yarn build:watch` | Watch mode for development |
| Build | `yarn build` | Full build (lint + syncpack + compile) |
| Build (fast) | `yarn build:dev` | Build without linting |
| Clean | `yarn clean` | Remove all dist directories |

### Testing
| Task | Command | Notes |
|------|---------|-------|
| Test all | `yarn test` | Run all tests (all packages) |
| Test watch | `yarn test:watch` | TDD mode |
| Coverage | `yarn test:coverage` | Generate coverage reports |
| Test UI | `yarn test:ui` | Visual test interface |

### Quality
| Task | Command | Notes |
|------|---------|-------|
| Lint | `yarn lint` | Check all packages |
| Lint fix | `yarn lint:fix` | Auto-fix issues |
| Format | `yarn format` | Format all files |
| Format check | `yarn format:check` | Check formatting |
| Syncpack | `yarn syncpack:lint` | Check dependency versions |
| Syncpack fix | `yarn syncpack:fix` | Fix version mismatches |

### Distribution (Main Package)
| Task | Command | Notes |
|------|---------|-------|
| Debug | `yarn debug` | Debug MCP server with inspector |
| DXT pack | `yarn dxt:pack` | Create desktop extension |
| DXT release | `yarn dxt:release` | Full release process |
| Publish | `yarn prepublishOnly` | Runs before npm publish |

## Architecture Patterns

### Tool Registration Pattern
```typescript
// packages/octocode-mcp/src/tools/myTool.ts
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import { TOOL_NAMES } from '../constants.js';

export function registerMyTool(server: McpServer) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ 
      name: TOOL_NAMES.MY_TOOL, 
      description: "Tool description",
      inputSchema: MyToolSchema 
    }]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, 
    withSecurityValidation(async (request) => {
      // Implementation
    })
  );
}
```

### Command Builder Pattern
```typescript
// Extend BaseCommandBuilder for CLI-based tools
import { BaseCommandBuilder } from './utils/BaseCommandBuilder.js';

export class MyToolBuilder extends BaseCommandBuilder {
  protected buildCommand(query: MyQuery): string[] {
    // Build CLI command
    return ['gh', 'api', '/search/repositories', ...];
  }
  
  // Implement other required methods
}
```

### Security Wrapper Pattern
```typescript
// Always wrap tool handlers with security validation
import { withSecurityValidation } from '../security/withSecurityValidation.js';

export const handler = withSecurityValidation(async (request) => {
  // Input sanitization happens automatically
  // Implement tool logic
  // Output filtering happens automatically
});
```

### Bulk Operations Pattern
```typescript
// Support multiple queries per tool call
const results = await Promise.allSettled(
  queries.map(query => processQuery(query))
);

// Handle partial failures gracefully
return results.map((result, index) => {
  if (result.status === 'fulfilled') {
    return { success: true, data: result.value };
  } else {
    return { success: false, error: result.reason.message };
  }
});
```

## Domain-Specific Terminology

| Term | Definition | Location |
|------|------------|----------|
| **MCP** | Model Context Protocol - standard for AI assistant tools | Throughout |
| **Tool** | An MCP-exposed function that AI assistants can call | `src/tools/` |
| **Progressive Refinement** | Research strategy: broad → context → targeted → deep-dive | Architecture |
| **Bulk Operations** | Processing multiple queries in a single tool call | `src/utils/bulkOperations.ts` |
| **Content Sanitization** | Removing secrets/sensitive data from responses | `src/security/` |
| **Token Efficiency** | Minimizing LLM token usage through minification | `src/utils/minifier.ts` |
| **BaseCommandBuilder** | Abstract base class for CLI command construction | `src/tools/utils/` |
| **Zod Schema** | Runtime type validation schemas | `src/scheme/` |
| **Security Wrapper** | `withSecurityValidation` - sanitizes inputs/outputs | `src/security/` |

## Files to NOT Modify

### Generated Files
These files are auto-generated and will be overwritten:
- `packages/*/dist/**` - Build outputs
- `coverage/**` - Test coverage reports
- `node_modules/**` - Dependencies
- `*.d.ts` files in `dist/` - TypeScript declarations

### Protected Directories
- `.git/` - Version control internals
- `node_modules/` - Dependencies
- `coverage/` - Test coverage reports
- `_docs/`, `_scripts/` - Ignored build artifacts
- `.yarn/install-state.gz` - Yarn state

### Sensitive Files
- `.env*` - Environment variables
- `mcp.sqlite` - Session database
- `*.dxt` - Desktop extension packages
- `.cursor/`, `.context/` - IDE-specific files

**Rule:** Do not read or modify these files unless explicitly asked.

## What NOT to Do

### AVOID: Documentation Mistakes
- **Don't create summary docs** unless explicitly asked - per project rules, avoid unsolicited documentation
- **Don't duplicate content** - Reference existing docs instead of copying

### AVOID: Architecture Violations
- **Don't bypass security validation** - All tools must use `withSecurityValidation`
- **Don't skip Zod validation** - All external inputs must have schemas
- **Don't add direct GitHub API calls** - Use existing `src/github/` abstractions

### AVOID: Testing Anti-Patterns
- **Don't hit real APIs** - Always mock external services in tests
- **Don't skip `vi.clearAllMocks()`** - Always clear mocks in `beforeEach()`
- **Don't test implementation details** - Test behavior, not internals

### AVOID: Code Style Mistakes
- **Don't use `console.log`** - Use proper error handling/logging
- **Don't use `any` type** - Provide explicit types or `unknown`
- **Don't ignore linter warnings** - Fix them or document why they're safe

### AVOID: Performance Issues
- **Don't load full files without minification** - Use `minifyContent()` for large responses
- **Don't implement single-query tools** - Support bulk operations for efficiency
- **Don't skip caching** - Use 24-hour cache for expensive operations

## Smart Project Rules

### When Adding New Tools
1. **Create Zod schema** in `src/scheme/` directory first
2. **Extend BaseCommandBuilder** if CLI-based
3. **Add to TOOL_NAMES** constant in `src/constants.ts`
4. **Register in** `src/index.ts`
5. **Add comprehensive tests** in `tests/tools/`
6. **Update tool relationships** in `src/tools/utils/toolRelationships.ts`
7. **Document in** relevant docs (if significant)

### When Modifying Existing Tools
1. **Analyze full system impact** - Trace through dependent files
2. **Check tool relationships** using `toolRelationships.ts`
3. **Update schemas** if parameters change
4. **Maintain backward compatibility** where possible
5. **Update related tests** intelligently
6. **Run full test suite** before committing

### When Optimizing Performance
1. **Profile first** - Identify actual bottlenecks
2. **Consider caching** - Use existing cache utility
3. **Optimize minification** - Add file type strategies
4. **Bulk operations** - Support multiple queries
5. **Token efficiency** - Minimize LLM token usage

### When Handling Security
1. **Validate all inputs** with Zod schemas
2. **Sanitize content** using existing patterns
3. **Add new regex patterns** to `src/security/regexes.ts` if needed
4. **Test security edge cases** - Malicious inputs, secrets
5. **Document security implications**

### Dependencies & Upgrades
- **Prefer existing dependencies** over adding new ones
- **Use syncpack** to keep versions aligned: `yarn syncpack:lint`
- **Test thoroughly** after dependency updates
- **Check MCP SDK compatibility** - This is a critical dependency

## Development Workflow ASCII

```
Code Change → Lint → Format → Type Check → Tests → Commit
                ↓      ↓         ↓          ↓
              Fix    Auto       Fix        Fix
                              
                              ↓
                              
                      Push → CI/CD → Build → Test → Deploy
                              ↓       ↓       ↓
                            Pass    Pass    Pass
```

### Pre-Commit Flow
```
1. Make changes to src/
2. Update tests in tests/
3. Run: yarn lint:fix (auto-fix style issues)
4. Run: yarn test (verify everything works)
5. Run: yarn build:dev (quick build check)
6. Commit with conventional commit message
7. Push (CI will run full validation)
```

---

**Last Updated:** November 19, 2025  
**Monorepo Version:** 1.0.0  
**Main Package:** octocode-mcp v7.0.12  
**Questions:** https://github.com/bgauryy/octocode-mcp/issues

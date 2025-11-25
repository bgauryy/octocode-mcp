# AGENTS.md - local-explorer-mcp

> Guidance for autonomous coding agents (Claude, Cursor, Copilot, etc.)
> Read this before making any changes to this repository.

_This file was auto-generated using the project's own `generate_agents_file` prompt._

## TL;DR Quick Checklist

Before starting any task:
- [ ] Read relevant sections below
- [ ] Check existing code in similar files
- [ ] Run tests before committing: `yarn test`
- [ ] Follow commit message format: Conventional Commits
- [ ] Update tests for code changes
- [ ] Ensure TypeScript types are correct: `yarn build`

## Operating Mode

**Default:** Auto for `src/` and `tests/` - Ask for config/build/dependencies

| Action | Approval | Notes |
|--------|----------|-------|
| Edit `src/` | Auto | Source code - edit freely, maintain security patterns |
| Edit `tests/` | Auto | Keep tests passing, add coverage for changes |
| Edit `docs/` | Auto | Update documentation as needed |
| Edit config files | Ask first | `tsconfig.json`, `rollup.config.js`, `vitest.config.ts`, etc. |
| Install dependencies | Ask first | Requires explicit approval via `yarn add` |
| Modify `dist/` | NEVER | Generated build output |
| Modify `node_modules/` | NEVER | Managed by package manager |
| Edit `.env*` | NEVER | Sensitive environment files |

**Override:** Add `# agent: auto-approve` in task description for exceptions.

## Repository Structure & Access

| Path | Agent Access | Description |
|------|--------------|-------------|
| `src/` | FULL | Source code - TypeScript files |
| `src/commands/` | FULL | CLI command builders (find, ls, ripgrep) |
| `src/tools/` | FULL | MCP tool implementations |
| `src/security/` | FULL | Security validation layers - maintain rigorously |
| `src/utils/` | FULL | Utility functions (cache, pagination, minification) |
| `src/scheme/` | FULL | Zod schemas for tool validation |
| `src/prompts/` | FULL | Built-in agent prompts (agents.md, architecture.md) |
| `tests/` | FULL | Test files - always keep green |
| `docs/` | EDIT | Documentation |
| `dist/` | NEVER | Build artifacts - auto-generated |
| `node_modules/` | NEVER | Dependencies - managed by yarn |
| `coverage/` | NEVER | Test coverage reports - generated |
| `.vscode/`, `.idea/` | NEVER | Editor settings |
| `.env*` | NEVER | Environment variables and secrets |

**Legend:** FULL = Allowed, EDIT = Modify with care, NEVER = Forbidden

## Setup & Environment

### Initial Setup
```bash
yarn install                 # Install dependencies
yarn build                   # Build project (runs lint, clean, rollup)
yarn test                    # Run tests to verify
```

### Required Tools
- **Node.js** >= 18.0.0
- **Yarn** package manager
- **ripgrep** (for development and testing)
  - macOS: `brew install ripgrep`
  - Ubuntu/Debian: `apt-get install ripgrep`
  - Windows: `choco install ripgrep`

### Environment Variables
- `WORKSPACE_ROOT` - Project root directory (defaults to CWD)
- `DEBUG` - Set to "true" for detailed logging
- `CACHE_TTL` - Cache duration in seconds (default: 900)
- `MEMORY_LIMIT` - Max memory in MB (default: 100)

## Style & Formatting

### Code Style
- **Line**: Follow TypeScript best practices | **Quotes**: Single quotes | **Semi**: Yes | **Indent**: 2 spaces
- **Naming**: Functions `camelCase`, Classes `PascalCase`, Constants `UPPER_SNAKE_CASE`, Files `kebab-case`
- **TypeScript**: Strict mode enabled, no unused locals/parameters, no implicit returns
- **Imports**: Node built-ins → External packages → Internal modules

### Commands
```bash
yarn lint                    # Check linting issues
yarn lint:fix                # Auto-fix linting issues
yarn format                  # Format code with Prettier
yarn format:check            # Check formatting without changes
```

### File-Scoped Commands (for efficiency)
```bash
npx eslint src/tools/local_ripgrep.ts --fix        # Lint single file
npx vitest run tests/tools/local_ripgrep.test.ts   # Test single file
npx tsc --noEmit src/tools/local_ripgrep.ts        # Type check single file
```

**Use these for quick validation** before running full builds.

### Pre-Commit
✅ Lint PASS | ✅ Format PASS | ✅ Tests PASS | ✅ TypeScript PASS

## Testing

### Commands
```bash
yarn test                    # Run all tests
yarn test:watch              # Watch mode for TDD
yarn test:coverage           # Generate coverage report
yarn test:ui                 # Interactive test UI
```

### Requirements
- **Coverage**: Maintain existing coverage levels
- **New features**: Must include unit tests
- **Bug fixes**: Add regression tests
- **Security changes**: Comprehensive test coverage required

### Test Organization
```
tests/
├── commands/          # Command builder tests
├── integration/       # Integration tests (cross-tool scenarios)
├── security/          # Security validation tests (CRITICAL)
├── tools/             # Tool implementation tests
└── utils/             # Utility function tests
```

### Testing Checklist
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Security tests pass (if modifying security/)
- [ ] Coverage maintained or improved
- [ ] Edge cases covered

## Build & Development

### Build Commands
| Task | Command | Notes |
|------|---------|-------|
| Install | `yarn install` | First time setup |
| Dev build | `yarn build:dev` | Fast build without linting |
| Watch mode | `yarn build:watch` | Auto-rebuild on changes |
| Production build | `yarn build` | Full build with lint + minification |
| Clean | `yarn clean` | Remove dist/ directory |
| Debug | `yarn debug` | Debug with MCP inspector |

### Build Process
```
TypeScript → Rollup → Terser (minify) → dist/index.js
```

Build includes:
- TypeScript compilation (strict mode)
- Rollup bundling (ES modules)
- Terser minification (drops console/debugger)
- Markdown import plugin (for prompts)
- Source maps disabled in production

## Commit & PR Guidelines

### Commit Format
Use Conventional Commits:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: 
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature/bug change)
- `test`: Adding or updating tests
- `chore`: Maintenance (deps, config)
- `security`: Security improvements

**Examples:**
```
feat(ripgrep): add multiline search support
fix(security): prevent path traversal in symlinks
docs(readme): update installation instructions
test(tools): add pagination edge case tests
refactor(cache): improve memory efficiency
security(validation): strengthen command injection prevention
```

### PR Requirements
1. **Title**: Clear, follows conventional commit format
2. **Description**: What changed, why, breaking changes if any
3. **Tests**: All tests pass, new tests for new features
4. **Linting**: No linting errors
5. **TypeScript**: No type errors, strict mode compliance
6. **Coverage**: Maintained or improved

### Branches
No specific branch naming enforced, but consider:
- `feature/description` - New features
- `fix/description` - Bug fixes
- `security/description` - Security improvements

## Domain-Specific Terminology

| Term | Definition | Example/Location |
|------|------------|------------------|
| **MCP** | Model Context Protocol - Standard for AI assistant tool integration | `src/index.ts` |
| **Tool** | MCP-exposed function that AI assistants can call | `src/tools/` |
| **Schema** | Zod validation schema for tool parameters | `src/scheme/` |
| **Command Builder** | Constructs safe CLI commands from user inputs | `src/commands/` |
| **Security Validator** | Multi-layer validation (path, command, context) | `src/security/` |
| **Bulk Operations** | Processing multiple queries in parallel with pagination | `src/utils/bulkOperations.ts` |
| **Token Validation** | Ensures responses fit within LLM token limits | `src/utils/tokenValidation.ts` |
| **Discovery Mode** | Fast file-only search without content (filesOnly=true) | Tool documentation |
| **Match String** | Pattern-based content extraction with context | `local_fetch_content` |
| **Pagination** | Two-level: files per page + matches per page | `src/utils/pagination.ts` |
| **Minification** | Remove whitespace/comments for token efficiency | `src/utils/minifier.ts` |

## Core Architecture Patterns

### 4 Main Tools
1. **`local_view_structure`** - Directory exploration (ls-based)
2. **`local_ripgrep`** - Fast pattern search (ripgrep-based)
3. **`local_find_files`** - Metadata search (find-based)
4. **`local_fetch_content`** - Content reading with pagination

### Security Layers (CRITICAL - Maintain rigorously)
```
User Input
    ↓
Zod Schema Validation (src/scheme/)
    ↓
Path Validator (workspace boundaries, symlinks)
    ↓
Command Validator (whitelist, injection prevention)
    ↓
Execution Context Validator (resources, timeouts)
    ↓
Ignored Path Filter (.gitignore, sensitive files)
    ↓
Command Execution (direct, no shell)
```

### Security Rules
- **NEVER** bypass validation layers
- **ALWAYS** use command builders, never construct raw commands
- **TEST** security changes thoroughly (see `tests/security/`)
- **VALIDATE** all user inputs with Zod schemas
- **RESTRICT** operations to workspace boundaries
- **WHITELIST** only allowed commands: `rg`, `find`, `ls`

## Common Commands

| Task | Command | Notes |
|------|---------|-------|
| Install | `yarn install` | First time setup |
| Build | `yarn build` | Production build (lint + rollup) |
| Build (fast) | `yarn build:dev` | Skip linting |
| Watch | `yarn build:watch` | Auto-rebuild |
| Test | `yarn test` | All tests |
| Test (watch) | `yarn test:watch` | TDD mode |
| Test (coverage) | `yarn test:coverage` | With coverage report |
| Test (UI) | `yarn test:ui` | Interactive mode |
| Lint | `yarn lint` | Check issues |
| Lint (fix) | `yarn lint:fix` | Auto-fix |
| Format | `yarn format` | Format all |
| Format (check) | `yarn format:check` | Check only |
| Clean | `yarn clean` | Remove dist/ |
| Debug | `yarn debug` | MCP inspector |

## Files to NOT Modify

### Generated Files (NEVER EDIT)
These files are auto-generated and will be overwritten:
- `dist/` - Rollup build output
- `coverage/` - Test coverage reports
- `.eslintcache` - ESLint cache
- `*.tsbuildinfo` - TypeScript build info

### Dependencies (NEVER EDIT)
- `node_modules/` - Managed by yarn
- `yarn.lock` - Package lock file (update via yarn commands only)

### Environment & Secrets (NEVER COMMIT)
- `.env` - Environment variables
- `.env.*` - Environment-specific configs
- `*.log` - Log files
- `logs/` - Log directory

### Editor/OS (NEVER COMMIT)
- `.vscode/` - VS Code settings
- `.idea/` - JetBrains IDE settings
- `.DS_Store` - macOS metadata
- `Thumbs.db` - Windows thumbnails
- `*.swp`, `*.swo` - Vim swap files

### Configuration (Ask Before Modifying)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `rollup.config.js` - Build configuration
- `vitest.config.ts` - Test configuration
- `.gitignore` - Git ignore patterns

**Rule:** If you need to modify configuration files, ask for explicit approval first.

## What NOT to Do

### ❌ AVOID: Security Bypass Attempts
- **Never** construct raw commands without command builders
- **Never** skip path validation or symlink checks
- **Never** allow command injection via user inputs
- **Why**: Security is the foundation - bypasses create vulnerabilities
- **Instead**: Use existing command builders and validators

### ❌ AVOID: Breaking Pagination
- **Never** return unbounded results without pagination
- **Never** ignore token limits or memory constraints
- **Never** use `fullContent=true` without `charLength` on large files
- **Why**: Token explosion and memory issues
- **Instead**: Use `matchString` extraction or paginate with `charLength`

### ❌ AVOID: Loose Type Safety
- **Never** use `any` types without justification
- **Never** disable TypeScript strict checks
- **Never** ignore type errors
- **Why**: Type safety catches bugs early
- **Instead**: Define proper types and interfaces

### ❌ AVOID: Test Coverage Degradation
- **Never** remove tests without replacement
- **Never** skip security test suites
- **Never** commit failing tests
- **Why**: Tests are the safety net for refactoring
- **Instead**: Maintain or improve coverage with changes

### ❌ AVOID: Hardcoded Paths
- **Never** hardcode absolute paths
- **Never** assume OS-specific path separators
- **Never** skip path normalization
- **Why**: Cross-platform compatibility breaks
- **Instead**: Use `path` module and workspace-relative paths

## Key Implementation Patterns

### Adding a New Tool
1. Define Zod schema in `src/scheme/`
2. Implement tool in `src/tools/`
3. Add command builder if needed in `src/commands/`
4. Register in `src/tools/toolsManager.ts`
5. Add comprehensive tests in `tests/tools/`
6. Document in README.md

### Modifying Security
1. **STOP**: Security changes are high-risk
2. Review existing security tests in `tests/security/`
3. Add tests for new scenarios FIRST
4. Implement change with minimal scope
5. Run full security test suite
6. Test penetration scenarios
7. Document security implications

### Performance Optimization
1. Profile with real data first
2. Use caching appropriately (see `src/utils/cache.ts`)
3. Implement pagination for large results
4. Use discovery mode (filesOnly) when possible
5. Batch operations when appropriate
6. Validate token usage stays within limits

## Debugging Tips

### Common Issues
- **"Command not found"**: Ensure ripgrep is installed
- **Path traversal errors**: Check workspace boundaries
- **Token limit exceeded**: Use pagination or matchString
- **Memory issues**: Check MEMORY_LIMIT env var
- **Test failures**: Run `yarn test:ui` for interactive debugging

### Debug Mode
```bash
DEBUG=true yarn debug
```

Opens MCP inspector for real-time tool testing.

---

**Last Updated:** November 4, 2025  
**Generated By:** `generate_agents_file` prompt (this project's own tooling)  
**Questions:** [GitHub Issues](https://github.com/bgauryy/local-explorer-mcp/issues)  
**Version:** 1.1.0


# AGENTS.md - Octocode Monorepo

> AI agent guidance for the Octocode MCP monorepo - Model Context Protocol servers for GitHub and local file system research.

## Quick Start

```bash
yarn install          # Install all dependencies
yarn build            # Build all packages
yarn test             # Test all packages
yarn lint             # Lint all packages
```

## Approval Policy

| Action | Approval | Notes |
|--------|----------|-------|
| Edit `src/`, `tests/` | ✅ Auto | Source and test files |
| Edit `docs/` | ✅ Auto | Documentation |
| Edit configs (`*.json`, `*.ts` configs) | ⚠️ Ask | tsconfig, vitest, rollup, eslint |
| Add dependencies | ⚠️ Ask | Requires `yarn add` |
| Edit `.env*`, secrets | ❌ Never | Sensitive files |
| Edit `dist/`, `node_modules/` | ❌ Never | Generated/external |

## Structure & Access

| Path | Access | Description |
|------|--------|-------------|
| `packages/octocode-mcp/` | FULL | GitHub MCP server |
| `packages/octocode-local/` | FULL | Local filesystem MCP server |
| `packages/octocode-utils/` | FULL | Shared utilities |
| `docs/` | EDIT | Documentation |
| `*.json`, `*.config.*` | ASK | Root configs |
| `.env*`, `.octocode/` | NEVER | Secrets & research docs |
| `node_modules/`, `dist/`, `coverage/` | NEVER | Generated |

## Monorepo Structure

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # GitHub API MCP server
│   ├── octocode-local/    # Local filesystem MCP server
│   └── octocode-utils/    # Shared utilities
├── docs/                  # Configuration & auth guides
└── package.json           # Workspace root
```

**Inheritance Rules:**
- Package-level AGENTS.md files override this root file
- User prompts override all AGENTS.md files
- When in doubt, follow the closest (most specific) AGENTS.md

## Commands

| Task | Command | Scope |
|------|---------|-------|
| Install | `yarn install` | All packages |
| Build all | `yarn build` | All packages |
| Test all | `yarn test` | All packages |
| Test quiet | `yarn test:quiet` | All packages |
| Lint all | `yarn lint` | All packages |

**Per-package commands:** `cd packages/<name>` then run package-specific commands.

## Style Guide

| Rule | Value |
|------|-------|
| Language | TypeScript (strict mode) |
| Semicolons | Yes |
| Quotes | Single |
| Print width | 80 |
| Tab width | 2 spaces |
| Trailing comma | ES5 |

### Naming Conventions

- Functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Files: `camelCase.ts` or `kebab-case.ts`
- Test files: `<name>.test.ts`

### Code Style

```typescript
// ✅ Good
const myFunction = (param: string): void => {
  // implementation
};

// ❌ Avoid
var myFunction = function(param) {
  // implementation
}
```

- Prefer `const` over `let`, never use `var`
- Use explicit return types
- No `any` types (enforced by ESLint)
- Use optional chaining (`?.`) and nullish coalescing (`??`)

## Testing

| Command | Purpose |
|---------|---------|
| `yarn test` | Run all tests with coverage |
| `yarn test:quiet` | Run tests with minimal output |

### Coverage Requirements

**All packages require 90% coverage:**
- Statements: 90%
- Branches: 90%
- Functions: 90%
- Lines: 90%

### Test Structure

```
packages/<name>/tests/
├── <module>.test.ts       # Unit tests
├── integration/           # Integration tests
└── security/              # Security-focused tests
```

## Dependencies

**Node.js Requirements:**
- `octocode-mcp`: >=20.0.0
- `octocode-local`: >=18.0.0
- `octocode-utils`: >=20.0.0

**Key Shared Dependencies:**
- `@modelcontextprotocol/sdk` - MCP server framework
- `zod` - Schema validation
- `vitest` - Test framework
- `rollup` - Bundler

## Protected Files

**Never modify:**
- `.env*`, `*.pem`, `*.key` - Secrets
- `node_modules/` - Dependencies
- `dist/`, `coverage/` - Build outputs
- `yarn.lock` - Dependency lock (modify via `yarn add/remove`)
- `.git/` - Git internals

**Ask before modifying:**
- `package.json` - Dependencies
- `tsconfig*.json` - TypeScript config
- `vitest.config.ts` - Test config
- `rollup.config.js` - Build config
- `.eslintrc.json` - Lint rules

## Package Guidelines

Each package follows these principles:

1. **Security First** - All inputs validated, all paths checked
2. **Bulk Operations** - Support 1-5 queries per call
3. **Token Efficiency** - Minimize response size for LLMs
4. **Graceful Degradation** - Always return usable results

See package-specific AGENTS.md for detailed conventions.

## Agent Compatibility

- **Cursor**: Reads AGENTS.md automatically
- **Claude Code**: Reads AGENTS.md as context
- **Aider**: Add `read: AGENTS.md` in `.aider.conf.yml`
- **Gemini CLI**: Set `"contextFileName": "AGENTS.md"` in `.gemini/settings.json`


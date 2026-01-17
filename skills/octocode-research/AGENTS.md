# Octocode Research Skill - Agent Development Guide

> HTTP API server wrapping `octocode-mcp` tools for code research at `localhost:1987`

## Project Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Express.js HTTP Server |
| **Port** | 1987 |
| **Package** | `octocode-research` |
| **Version** | 2.0.0 |
| **Main Dependency** | `octocode-mcp` |

---

## Quick Commands

```bash
# Development
npm run build       # Bundle with tsdown
npm start           # Run bundled server
npm run dev         # Run with tsx watch mode
npm test            # Run tests with Vitest
npm run test:watch  # Watch mode testing
npm run lint        # ESLint check
npm run lint:fix    # Auto-fix lint issues

# Server Health Check
curl http://localhost:1987/health
```

---

## Project Structure

```
octocode-research/
├── src/
│   ├── server.ts              # Express server entry point
│   ├── index.ts               # Re-exports from octocode-mcp
│   ├── routes/
│   │   ├── index.ts           # Route exports
│   │   ├── local.ts           # /local/* - filesystem operations
│   │   ├── lsp.ts             # /lsp/* - Language Server Protocol
│   │   ├── github.ts          # /github/* - GitHub API
│   │   ├── package.ts         # /package/* - npm/PyPI search
│   │   ├── tools.ts           # /tools/* - tool discovery
│   │   └── prompts.ts         # /prompts/* - prompt discovery
│   ├── middleware/
│   │   ├── index.ts           # Middleware exports
│   │   ├── contextPropagation.ts  # Research session context
│   │   ├── errorHandler.ts    # Error response formatting
│   │   ├── logger.ts          # Request/response logging
│   │   └── queryParser.ts     # Zod validation
│   ├── validation/
│   │   ├── index.ts           # Schema exports
│   │   ├── schemas.ts         # HTTP schemas (import from octocode-mcp)
│   │   └── httpPreprocess.ts  # HTTP query string preprocessing
│   ├── utils/
│   │   ├── index.ts           # Utility exports
│   │   ├── colors.ts          # Console color functions
│   │   ├── logger.ts          # File-based logging
│   │   ├── responseBuilder.ts # Role-based response formatting
│   │   ├── responseFactory.ts # Response creation helpers
│   │   ├── responseParser.ts  # MCP response parsing
│   │   ├── resilience.ts      # Resilience utilities
│   │   ├── retry.ts           # Retry with backoff
│   │   ├── circuitBreaker.ts  # Circuit breaker pattern
│   │   └── rateLimitHandler.ts# GitHub rate limit tracking
│   └── types/
│       ├── index.ts           # Type exports
│       ├── express.d.ts       # Express type extensions
│       ├── guards.ts          # Type guard functions
│       ├── mcp.ts             # MCP protocol types
│       ├── responses.ts       # Response types
│       └── toolTypes.ts       # Tool parameter types
├── __tests__/
│   └── integration/           # Integration tests
├── docs/
│   ├── API_REFERENCE.md       # Complete HTTP API reference
│   ├── ARCHITECTURE.md        # Architecture documentation
│   ├── BUG_RESPONSE_FORMAT.md # Bug tracking format
│   ├── DESIGN_LIST_TOOLS_PROMPTS.md  # API design doc
│   ├── FLOWS.md               # Main flows & connections
│   └── IMPROVEMENTS.md        # Future improvements
├── output/                    # Bundled output (server.js + server.d.ts)
├── SKILL.md                   # Skill definition for AI agents
├── AGENTS.md                  # This file
├── tsdown.config.ts           # tsdown bundler configuration
├── package.json
├── tsconfig.json
├── eslint.config.mjs
└── vitest.config.ts           # Test configuration (if exists)
```

---

## API Endpoints

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /tools/list` | List all tools (MCP format) |
| `GET /tools/info` | List all tools (simplified) |
| `GET /tools/info/:name` | Get specific tool info |
| `GET /prompts/list` | List all prompts (MCP format) |
| `GET /prompts/info/:name` | Get specific prompt info |

### Local Filesystem (`/local/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /local/search` | Code search via ripgrep |
| `GET /local/content` | Read file content |
| `GET /local/find` | Find files by metadata |
| `GET /local/structure` | View directory tree |

### LSP Tools (`/lsp/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /lsp/definition` | Go to symbol definition |
| `GET /lsp/references` | Find all references |
| `GET /lsp/calls` | Call hierarchy (incoming/outgoing) |

### GitHub Tools (`/github/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /github/search` | Search GitHub code |
| `GET /github/content` | Read GitHub files |
| `GET /github/repos` | Search repositories |
| `GET /github/structure` | View repo structure |
| `GET /github/prs` | Search pull requests |

### Package Search (`/package/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /package/search` | Search npm/PyPI packages |

---

## Key Files & Responsibilities

### Entry Points

| File | Purpose |
|------|---------|
| `src/server.ts` | Express app creation, route mounting, graceful shutdown |
| `src/index.ts` | Re-exports octocode-mcp functions with cleaner names |

### Routes

Each route file follows the pattern:
1. Import tool function from `../index.js`
2. Define Express Router
3. Apply validation middleware
4. Execute tool and format response

### Middleware

| File | Purpose |
|------|---------|
| `queryParser.ts` | Validates query params against Zod schemas |
| `errorHandler.ts` | Catches errors, formats consistent responses |
| `logger.ts` | Logs requests to console and file |
| `contextPropagation.ts` | Maintains research session context |

### Validation

Schemas are imported from `octocode-mcp/public` (source of truth) and wrapped with HTTP preprocessing.

| File | Purpose |
|------|---------|
| `schemas.ts` | HTTP-wrapped schemas importing from `octocode-mcp/public` |
| `httpPreprocess.ts` | Query string conversion (string→number/boolean/array) |

When adding/modifying endpoints:
1. Check if schema exists in `octocode-mcp/public`
2. Create HTTP wrapper in `validation/schemas.ts` with preprocessing
3. Apply schema validation in route handler

---

## Development Guidelines

### Adding a New Endpoint

1. **Add schema** in `src/validation/schemas.ts`
2. **Create route handler** in appropriate `src/routes/*.ts`
3. **Add route to server.ts** if new route group
4. **Update types** if needed
5. **Add tests** in `__tests__/`
6. **Document** in docs/ARCHITECTURE.md

### Code Style

- **TypeScript strict mode** enabled
- **Zod** for runtime validation
- **Express async handlers** - wrap with try/catch or error middleware
- **Consistent logging** - use `agentLog`, `successLog`, `errorLog` from colors.ts

### Testing

```bash
yarn test                 # Run all tests
yarn test:watch          # Watch mode
yarn test -- --coverage  # With coverage report
```

---

## Response Format

All endpoints return standardized responses:

```typescript
// Success
{
  status: "hasResults" | "empty",
  data: { ... },
  _reasoning: {
    mainResearchGoal: string,
    researchGoal: string,
    reasoning: string
  }
}

// Error
{
  status: "error",
  error: {
    message: string,
    code?: string
  }
}
```

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `octocode-mcp` | Core tool implementations |
| `express` | HTTP server framework |
| `zod` | Schema validation |
| `@modelcontextprotocol/sdk` | MCP format types |

---

## Documentation References

| Doc | Purpose |
|-----|---------|
| [SKILL.md](./SKILL.md) | How AI agents should USE this skill |
| [docs/API_REFERENCE.md](./docs/API_REFERENCE.md) | **Complete HTTP API reference with all routes** |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Detailed architecture |
| [docs/FLOWS.md](./docs/FLOWS.md) | Main flows & component connections |

---

## Console Output Colors

| Category | Color | Function |
|----------|-------|----------|
| Agent messages | 🟣 Purple | `agentLog()` |
| Tool results | 🔵 Blue | `resultLog()` |
| Success | 🟢 Green | `successLog()` |
| Errors | 🔴 Red | `errorLog()` |
| Warnings | 🟡 Yellow | `warnLog()` |
| Secondary info | Gray | `dimLog()` |

---

## Troubleshooting

### Server won't start
```bash
# Check if port 1987 is in use
lsof -i :1987

# Kill existing process
kill -9 $(lsof -ti :1987)
```

### Build errors
```bash
# Clean and rebuild
rm -rf output/
npm run build
```

### Missing dependencies
```bash
# Reinstall
rm -rf node_modules/
yarn install
```

---

## Access Control

| Path | Access |
|------|--------|
| `src/`, `__tests__/` | ✅ Auto |
| `docs/` | ✅ Auto |
| `*.json`, `*.config.*` | ⚠️ Ask first |
| `.env*`, `node_modules/`, `dist/` | ❌ Never modify |

---

*This skill wraps `octocode-mcp` tools as HTTP endpoints. For tool-specific documentation, see the [octocode-mcp package](../../packages/octocode-mcp/AGENTS.md).*

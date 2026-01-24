# Architecture

This document describes the overall system architecture and technology stack for the skills repository.

## System Architecture

The skills repository implements a **two-tier architecture** combining an HTTP REST server with an AI agent orchestration pipeline.

### Tier 1: HTTP Research Server (octocode-research)

An Express.js HTTP server that provides a REST API wrapper around MCP tools. The server runs on port 1987 and exposes 12 endpoints for tool discovery, execution, and health monitoring.

**Architecture Pattern**: Request-Response with Middleware Chain

```
Client Request
    ↓
Middleware Pipeline:
    - Logger (request logging)
    - Query Parser (complex query params)
    - Readiness Check (MCP initialized?)
    - Route Handler
    ↓
Tool Execution Pipeline:
    - Tool Validation (exists in registry?)
    - Body Validation (Zod schema)
    - Resilience Wrapper (timeout → circuit breaker → retry)
    - Tool Execution (MCP tool call)
    - Response Parsing (MCP format → JSON)
    ↓
Error Handler Middleware
    ↓
Client Response
```

Reference: `octocode-research/src/server.ts:1-230`, `octocode-research/src/routes/tools.ts:67-690`

### Tier 2: AI Agent Pipeline (octocode-documentaion-writer)

A 6-phase pipeline orchestrating 1-14 parallel AI agents to generate comprehensive documentation.

**Architecture Pattern**: Multi-Phase Pipeline with Parallel Execution

```
Phase 1: Discovery & Analysis (4 agents in parallel)
    Agent 1a: Languages & Manifests
    Agent 1b: Components & Structure
    Agent 1c: Dependencies & Libraries
    Agent 1d: Flows & APIs
    ↓ Produces: analysis.json

Phase 2: Engineer Questions (1 agent)
    ↓ Produces: questions.json (40+ questions)

Phase 3: Research (dynamic parallel agents)
    Research calls → octocode-research HTTP server
    ↓ Produces: research.json (with evidence)

Phase 4: Orchestrator (1 agent)
    File assignment with exclusive ownership
    ↓ Produces: work-assignments.json

Phase 5: Documentation Writers (1-8 agents in parallel)
    Each writer owns exclusive files
    ↓ Produces: 14 markdown documentation files

Phase 6: QA Validator (1 agent)
    LSP-powered verification
    ↓ Produces: qa-results.json
```

Reference: `octocode-documentaion-writer/SKILL.md:1-150`, `.context/work-assignments.json:1-145`

### Relationship Between Tiers

The documentation writer (Tier 2) depends on the research server (Tier 1) for evidence gathering:

- **Phase 3 Research Agents**: Make HTTP requests to `http://localhost:1987/tools/call/:toolName`
- **Tool Categories Used**: GitHub search/content, local search/content, LSP navigation, package search
- **Resilience Dependency**: Research agents benefit from server's circuit breaker and retry patterns
- **Decoupled Operation**: Research server can operate independently for other use cases

Reference: `octocode-research/src/server.ts:15`, `octocode-documentaion-writer/SKILL.md:80-100`

## Technology Stack

### Runtime & Language

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | >= 20.0.0 | JavaScript/TypeScript execution environment |
| Language | TypeScript | 5.9.3 | Primary source language with strict type checking |
| Module System | ESM | - | ES modules (import/export) for modern module loading |
| TypeScript Config | ES2022 target, ESNext module | - | Modern JavaScript features with bundler resolution |

Reference: `octocode-research/package.json:13`, `octocode-research/tsconfig.json:1-20`

### HTTP Server Framework

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Web Framework | Express.js | 4.21.2 | HTTP server and routing |
| Middleware | express.json() | - | JSON body parsing |
| Custom Middleware | logger, queryParser, readiness, errorHandler | - | Request logging, query parsing, health checks, error handling |

Reference: `octocode-research/package.json:61`, `octocode-research/src/server.ts:20-146`

### Validation & Schema

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Schema Validation | Zod | 3.24.1 | Runtime type validation for request/response |
| JSON Schema | zod-to-json-schema | 3.25.1 | Generate JSON schemas from Zod schemas for API docs |

Reference: `octocode-research/package.json:65-66`, `octocode-research/src/validation/schemas.ts:1-50`

### Build Tools

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Bundler | tsdown | 0.18.3 | TypeScript bundler with tree-shaking and minification |
| Dev Runner | tsx | 4.21.0 | TypeScript execution in development without compilation |
| Linter | ESLint | 9.27.0 | Code quality and style enforcement |
| Formatter | typescript-eslint | - | TypeScript-specific ESLint rules |

**Build Configuration**:
- Entry points: `src/server.ts`, `src/server-init.ts`
- Output: `scripts/` directory as standalone ESM bundles
- Target: Node 20
- Bundles all dependencies (noExternal)
- Generates type declarations (.d.ts)
- Adds shebang for direct execution

Reference: `octocode-research/tsdown.config.ts:1-40`, `octocode-research/package.json:70-78`

### Testing

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Test Runner | Vitest | 4.0.16 | Modern test runner with native ESM support |
| HTTP Testing | Supertest | 7.2.2 | HTTP assertion library for integration tests |
| Coverage | @vitest/coverage-v8 | 4.0.17 | Code coverage using V8 engine |

**Coverage Thresholds**:
- Statements: 70%
- Branches: 60%
- Functions: 70%
- Lines: 70%

Reference: `octocode-research/package.json:72-79`, `octocode-research/vitest.config.ts:1-25`

### Process Management

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Process Manager | PM2 | ecosystem.config.cjs | Production process management with auto-restart |

**PM2 Configuration**:
- Max memory: 500MB (auto-restart)
- Graceful shutdown: 120s kill timeout
- Wait for ready signal: 15s listen timeout
- Max restarts: 10 consecutive
- Exponential backoff on crashes

Reference: `octocode-research/ecosystem.config.cjs:1-90`, `octocode-research/package.json:44-50`

### External Integrations

| Component | Technology | Purpose |
|-----------|-----------|---------|
| MCP Tools | octocode-mcp (workspace) | Core MCP protocol tools for GitHub, local, LSP, package operations |
| Shared Utilities | octocode-shared (workspace) | Shared utilities across monorepo packages |
| YAML Parser | js-yaml 4.1.1 | Parse YAML configuration files |

Reference: `octocode-research/package.json:61-64`, `octocode-research/src/index.ts:1-50`

### Resilience Patterns

| Pattern | Implementation | Configuration |
|---------|---------------|---------------|
| Circuit Breaker | Three-state (closed/open/half-open) | Per-tool circuits with 3 failures → open, 30-60s reset |
| Retry | Exponential backoff | Category-specific: LSP (3×500ms-5s), GitHub (3×1s-30s), Local (2×100ms-1s) |
| Timeout | Async timeout wrapper | GitHub 60s, others 30s |
| Resilience Layers | Timeout → Circuit Breaker → Retry | Applied per tool category via wrappers |

Reference: `octocode-research/src/utils/circuitBreaker.ts:1-450`, `octocode-research/src/utils/retry.ts:1-240`, `octocode-research/src/utils/resilience.ts:1-180`

## Component Breakdown

### octocode-research Module Structure

```
octocode-research/
├── src/
│   ├── routes/               # HTTP endpoints
│   │   ├── tools.ts          # Tool discovery and execution
│   │   ├── prompts.ts        # Prompt listing and retrieval
│   │   ├── github.ts         # GitHub-specific routes
│   │   ├── local.ts          # Local file system routes
│   │   ├── lsp.ts            # LSP semantic routes
│   │   └── package.ts        # Package search routes
│   ├── middleware/           # Express middleware
│   │   ├── errorHandler.ts  # Centralized error handling
│   │   ├── logger.ts         # Request/response logging
│   │   ├── queryParser.ts    # Complex query param parsing
│   │   └── readiness.ts      # MCP initialization check
│   ├── utils/                # Utility modules
│   │   ├── circuitBreaker.ts # Circuit breaker implementation
│   │   ├── retry.ts          # Retry with exponential backoff
│   │   ├── resilience.ts     # Resilience wrapper composition
│   │   ├── responseBuilder.ts # JSON response formatting
│   │   ├── responseParser.ts  # MCP response parsing
│   │   ├── logger.ts         # File logging with rotation
│   │   ├── asyncTimeout.ts   # Timeout wrapper
│   │   └── errorQueue.ts     # Error aggregation
│   ├── validation/           # Request validation
│   │   ├── schemas.ts        # Zod schemas
│   │   └── toolCallSchema.ts # Tool call body schema
│   ├── server.ts             # Main Express server
│   ├── server-init.ts        # Initialization script with mutex
│   └── index.ts              # Public API exports
├── __tests__/
│   ├── unit/                 # Unit tests
│   └── integration/          # Integration tests
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── tsdown.config.ts          # Build configuration
├── vitest.config.ts          # Test configuration
├── ecosystem.config.cjs      # PM2 configuration
└── SKILL.md                  # Skill definition
```

Reference: `.context/analysis.json:56-62`

### octocode-documentaion-writer Module Structure

```
octocode-documentaion-writer/
├── references/
│   ├── agent-discovery-analysis.md    # Phase 1 agent spec
│   ├── agent-engineer-questions.md    # Phase 2 agent spec
│   ├── agent-researcher.md            # Phase 3 agent spec
│   ├── agent-orchestrator.md          # Phase 4 agent spec
│   ├── agent-documentation-writer.md  # Phase 5 agent spec
│   └── agent-qa-validator.md          # Phase 6 agent spec
├── schemas/
│   ├── analysis-schema.json           # Phase 1 output schema
│   ├── questions-schema.json          # Phase 2 output schema
│   ├── research-schema.json           # Phase 3 output schema
│   ├── work-assignments-schema.json   # Phase 4 output schema
│   ├── documentation-structure.json   # Expected documentation files
│   ├── qa-results-schema.json         # Phase 6 output schema
│   └── state-schema.json              # Pipeline state tracking
└── SKILL.md                           # Pipeline definition
```

Reference: `.context/analysis.json:63-66`

## Data Flows

### Tool Execution Flow (octocode-research)

```
1. HTTP Request arrives
2. Readiness Middleware: Check MCP initialized
3. Route Handler: Parse toolName from path
4. Tool Validation: Check tool exists in registry
5. Body Validation: Validate with Zod schema
6. Resilience Wrapper:
   a. Timeout (60s GitHub, 30s others)
   b. Circuit Breaker (check state, fail-fast if open)
   c. Retry (exponential backoff on retryable errors)
7. Tool Execution: Call MCP tool function
8. Response Parsing: MCP format → JSON with hints
9. Response: Send JSON with status code
10. Error Handler: Catch any errors, standardize format
```

Reference: `octocode-research/src/routes/tools.ts:603-690`, `octocode-research/src/utils/resilience.ts:109-130`

### Documentation Pipeline Flow (octocode-documentaion-writer)

```
Phase 1: Discovery & Analysis
- 4 parallel agents explore repository
- Each produces partial findings
- Merged into analysis.json (languages, components, dependencies, flows)

Phase 2: Engineer Questions
- Single agent reads analysis.json
- Generates 40+ targeted questions across 14 doc categories
- Outputs questions.json with priorities and research goals

Phase 3: Research
- Dynamic parallel agents (one per batch of questions)
- Each agent calls research server HTTP API
- Gathers evidence with file:line references
- Outputs research.json with answers and evidence

Phase 4: Orchestrator
- Single agent reads questions.json
- Assigns questions to 1-8 documentation files
- Distributes files to 1-8 writer agents
- Ensures exclusive file ownership (no conflicts)
- Outputs work-assignments.json

Phase 5: Documentation Writers
- 1-8 parallel agents (critical/high/medium priority)
- Each agent owns exclusive files
- Synthesizes research into markdown
- Includes file:line references
- Creates documentation/*.md files

Phase 6: QA Validator
- Single agent reads all documentation
- Uses LSP to verify code references
- Checks completeness and accuracy
- Outputs qa-results.json with issues
```

Reference: `octocode-documentaion-writer/SKILL.md:50-140`, `.context/work-assignments.json:1-145`

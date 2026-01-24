# Skills Repository Documentation

Welcome to the comprehensive documentation for the skills repository, covering the octocode-research HTTP server and octocode-documentaion-writer pipeline.

## Documentation Overview

This documentation is organized into 14 comprehensive guides covering all aspects of the skills repository:

### Core Documentation (01-08)

These documents cover the essential aspects of the octocode-research server and provide the foundation for understanding the system.

1. **[01-OVERVIEW.md](01-OVERVIEW.md)** - Repository purpose, skills overview
   - What problems the skills repository solves
   - The two main skills (octocode-research and octocode-documentaion-writer)
   - How they work together

2. **[02-ARCHITECTURE.md](02-ARCHITECTURE.md)** - System architecture, technology stack
   - Two-tier architecture (HTTP server + AI agent pipeline)
   - Technology stack (Node.js, Express, TypeScript, Vitest, PM2)
   - Component breakdown and module structure

3. **[03-GETTING-STARTED.md](03-GETTING-STARTED.md)** - Prerequisites, installation, running
   - Node.js version requirements
   - Installation and build steps
   - Running in development and production modes
   - Verification and troubleshooting

4. **[04-API-REFERENCE.md](04-API-REFERENCE.md)** - HTTP endpoints, request/response formats
   - Complete API endpoint reference
   - 13 available tools (GitHub, local, LSP, package)
   - Request/response formats with examples
   - Validation and error responses

5. **[05-CONFIGURATION.md](05-CONFIGURATION.md)** - Environment variables, PM2, port settings
   - Environment variables (NODE_ENV, OCTOCODE_PORT)
   - PM2 process manager configuration
   - Port configuration (default: 1987)
   - Log configuration and rotation

6. **[06-DATA-FLOWS.md](06-DATA-FLOWS.md)** - Server initialization, tool execution flow
   - Server initialization flow (mutex, health checks, spawning)
   - Tool execution pipeline (validation, resilience, response parsing)
   - Detailed step-by-step breakdowns

7. **[07-PATTERNS.md](07-PATTERNS.md)** - Circuit breaker, retry, resilience patterns
   - Circuit breaker pattern (three-state: closed/open/half-open)
   - Retry mechanism with exponential backoff
   - Resilience wrappers (GitHub, local, LSP, package)
   - Configuration and best practices

8. **[08-ERROR-HANDLING.md](08-ERROR-HANDLING.md)** - Error middleware, response format
   - Centralized error handler middleware
   - Error types and status codes
   - Logging (validation WARN, server ERROR)
   - Error response formats with examples

### Operational Documentation (09-11)

Documentation pending - to be written by Writer Agent 1.

9. **09-TESTING.md** - Test suite, unit tests, integration tests
10. **10-DEPLOYMENT.md** - Production build, PM2 deployment, logs
11. **11-DOCWRITER-PIPELINE.md** - 6-phase documentation generation pipeline

### Reference Documentation (12-14)

Documentation pending - to be written by Writer Agent 2.

12. **12-DOCWRITER-SCHEMAS.md** - JSON schemas for pipeline phases
13. **13-MIDDLEWARE.md** - Express middleware components
14. **14-INTEGRATIONS.md** - MCP integration, external APIs

## Quick Start

New to the skills repository? Start here:

1. **Read [01-OVERVIEW.md](01-OVERVIEW.md)** to understand what the repository does
2. **Read [03-GETTING-STARTED.md](03-GETTING-STARTED.md)** to install and run the server
3. **Read [04-API-REFERENCE.md](04-API-REFERENCE.md)** to learn about available endpoints
4. **Read [07-PATTERNS.md](07-PATTERNS.md)** to understand resilience patterns

## For Different Audiences

### For Users

If you want to **use** the octocode-research server:
- [01-OVERVIEW.md](01-OVERVIEW.md) - What can it do?
- [03-GETTING-STARTED.md](03-GETTING-STARTED.md) - How do I install and run it?
- [04-API-REFERENCE.md](04-API-REFERENCE.md) - How do I call the API?

### For Operators

If you want to **deploy and manage** the server:
- [03-GETTING-STARTED.md](03-GETTING-STARTED.md) - Installation and setup
- [05-CONFIGURATION.md](05-CONFIGURATION.md) - Environment variables and PM2
- 10-DEPLOYMENT.md - Production deployment (pending)
- [08-ERROR-HANDLING.md](08-ERROR-HANDLING.md) - Error logs and troubleshooting

### For Developers

If you want to **understand or modify** the code:
- [02-ARCHITECTURE.md](02-ARCHITECTURE.md) - System architecture
- [06-DATA-FLOWS.md](06-DATA-FLOWS.md) - How data flows through the system
- [07-PATTERNS.md](07-PATTERNS.md) - Resilience patterns (circuit breaker, retry)
- [08-ERROR-HANDLING.md](08-ERROR-HANDLING.md) - Error handling approach
- 09-TESTING.md - Test suite (pending)
- 13-MIDDLEWARE.md - Middleware components (pending)

### For Documentation Writers

If you want to **understand the documentation pipeline**:
- [01-OVERVIEW.md](01-OVERVIEW.md#octocode-documentaion-writer) - Pipeline overview
- 11-DOCWRITER-PIPELINE.md - 6-phase pipeline (pending)
- 12-DOCWRITER-SCHEMAS.md - JSON schemas (pending)

## Key Concepts

### Skills Repository

The repository contains two complementary skills:
- **octocode-research**: HTTP server (port 1987) providing code research tools via REST API
- **octocode-documentaion-writer**: 6-phase AI agent pipeline for documentation generation

Reference: [01-OVERVIEW.md](01-OVERVIEW.md)

### Resilience Patterns

The server implements three resilience patterns:
- **Circuit Breaker**: Fail-fast when external services are down
- **Retry**: Exponential backoff on transient errors
- **Timeout**: Bounded execution time (60s GitHub, 30s others)

Reference: [07-PATTERNS.md](07-PATTERNS.md)

### Tool Execution Pipeline

Every tool execution follows a strict pipeline:
1. Readiness check (MCP initialized?)
2. Tool validation (tool exists?)
3. Body validation (Zod schema)
4. Resilience wrapper (timeout → circuit breaker → retry)
5. Tool execution
6. Response parsing (MCP → JSON)

Reference: [06-DATA-FLOWS.md](06-DATA-FLOWS.md#tool-execution-flow)

### Available Tools

13 tools across 4 categories:
- **GitHub**: Search code, read files, explore repos, analyze PRs (5 tools)
- **Local**: Search code, read files, find files, view structure (4 tools)
- **LSP**: Goto definition, find references, call hierarchy (3 tools)
- **Package**: Search NPM/PyPI packages (1 tool)

Reference: [04-API-REFERENCE.md](04-API-REFERENCE.md#available-tools)

## Technology Stack

- **Runtime**: Node.js >= 20.0.0
- **Language**: TypeScript 5.9.3 (ESM modules)
- **Web Framework**: Express.js 4.21.2
- **Validation**: Zod 3.24.1
- **Testing**: Vitest 4.0.16
- **Bundler**: tsdown 0.18.3
- **Process Manager**: PM2

Reference: [02-ARCHITECTURE.md](02-ARCHITECTURE.md#technology-stack)

## Common Tasks

### Start the Server

```bash
# Development mode
npm run dev

# Production mode (with PM2)
npm run pm2:start
```

Reference: [03-GETTING-STARTED.md](03-GETTING-STARTED.md#running-the-octocode-research-server)

### Call a Tool

```bash
curl -X POST http://localhost:1987/tools/call/githubSearchCode \
  -H "Content-Type: application/json" \
  -d '{"queries": [{"keywordsToSearch": ["useState"], "owner": "facebook", "repo": "react"}]}'
```

Reference: [04-API-REFERENCE.md](04-API-REFERENCE.md#post-toolscalltoolname)

### View Logs

```bash
# Error logs
tail -f ~/.octocode/logs/errors.log

# Tool logs
tail -f ~/.octocode/logs/tools.log

# PM2 logs
npm run pm2:logs
```

Reference: [05-CONFIGURATION.md](05-CONFIGURATION.md#log-files)

### Run Tests

```bash
# Single run
npm test

# Watch mode
npm run test:watch
```

Reference: [03-GETTING-STARTED.md](03-GETTING-STARTED.md#running-tests)

## Troubleshooting

### Server won't start

1. Check Node.js version: `node --version` (must be >= 20.0.0)
2. Check port 1987: `lsof -i :1987`
3. Check logs: `tail -n 50 ~/.octocode/logs/errors.log`
4. Remove stale lock: `rm ~/.octocode/locks/octocode-research-init.lock`

Reference: [03-GETTING-STARTED.md](03-GETTING-STARTED.md#troubleshooting)

### Tool execution fails

1. Check MCP initialization: `curl http://localhost:1987/tools/initContext`
2. Check circuit breaker state: Look for "Circuit OPEN" in logs
3. Check rate limits: GitHub API has 60 req/hour for unauthenticated
4. Check timeout settings: GitHub tools timeout at 60s, others at 30s

Reference: [07-PATTERNS.md](07-PATTERNS.md), [08-ERROR-HANDLING.md](08-ERROR-HANDLING.md)

### Validation errors

Check request format:
- Body must be JSON
- Must include `queries` array (1-5 queries)
- Each query is a key-value object with tool-specific parameters

Reference: [04-API-REFERENCE.md](04-API-REFERENCE.md#validation)

## Contributing

This documentation was generated using the octocode-documentaion-writer pipeline:
- **Phase 1**: Discovery & Analysis (4 parallel agents)
- **Phase 2**: Engineer Questions (40+ questions)
- **Phase 3**: Research (evidence gathering)
- **Phase 4**: Orchestrator (file assignment)
- **Phase 5**: Documentation Writers (1-8 parallel agents)
- **Phase 6**: QA Validator (LSP-powered verification)

All documentation includes file:line references for traceability.

## License

Documentation pending - see repository LICENSE file.

## Support

For issues and questions:
- Check this documentation first
- Review error logs in `~/.octocode/logs/`
- Check circuit breaker states
- Verify MCP initialization

## Document Metadata

**Generated**: 2026-01-23
**Documentation Version**: 3.0
**Writer Agent**: 0 (Critical Writer)
**Pipeline**: octocode-documentaion-writer
**Coverage**: Questions q1-q21 (Core documentation)

---

**Navigation**: Start with [01-OVERVIEW.md](01-OVERVIEW.md) → [03-GETTING-STARTED.md](03-GETTING-STARTED.md) → [04-API-REFERENCE.md](04-API-REFERENCE.md)

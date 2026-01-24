# Overview

The skills repository contains two complementary AI-powered tools designed for code research and documentation generation. These skills work together to enable deep code exploration and automated comprehensive documentation creation.

## Repository Purpose

This repository provides intelligent code research and documentation capabilities through two main skills:

1. **octocode-research** - An HTTP-based code research server
2. **octocode-documentaion-writer** - An AI agent pipeline for documentation generation

The skills solve the following problems:

- **Deep Code Exploration**: Navigate complex codebases across GitHub repositories and local filesystems with semantic understanding
- **Implementation Research**: Answer "how does X work?" questions by tracing code flow, finding definitions, and analyzing call hierarchies
- **Automated Documentation**: Generate comprehensive, evidence-based documentation from any repository without manual writing
- **Resilient External API Integration**: Safely interact with GitHub, NPM, and PyPI APIs with built-in circuit breakers, retry logic, and timeout protection

Reference: `octocode-research/SKILL.md:1-20`, `octocode-documentaion-writer/SKILL.md:1-30`

## The Two Main Skills

### octocode-research

**Type**: HTTP server (Express.js)
**Port**: 1987
**Runtime**: Node.js >= 20.0.0

An HTTP-based code research server providing deep-dive code exploration capabilities through REST endpoints. The server wraps MCP (Model Context Protocol) tools and exposes them via a REST API for easy integration with AI agents and automation workflows.

**Key Responsibilities**:

- **Tool Discovery**: List and describe 13 available MCP tools via `/tools/list` and `/tools/info/:toolName`
- **Tool Execution**: Execute code research operations through `/tools/call/:toolName` with standardized JSON request/response
- **GitHub Integration**: Search repositories, read file contents, explore directory structures, and analyze pull requests
- **Local Code Search**: Fast ripgrep-powered search, file system navigation, and content retrieval
- **LSP Semantic Navigation**: Go to definition, find references, and call hierarchy analysis with language server support
- **Package Research**: Search NPM and PyPI packages with repository metadata
- **Resilience Management**: Automatic retry with exponential backoff, circuit breaker protection, and timeout enforcement per tool category
- **Process Management**: PM2 integration with graceful shutdown, health checks, and mutex-based initialization

Reference: `octocode-research/SKILL.md:1-54`, `octocode-research/src/server.ts:1-230`

### octocode-documentaion-writer

**Type**: AI agent pipeline
**Phases**: 6
**Writers**: 1-8 parallel agents

A sophisticated 6-phase documentation generation pipeline that uses intelligent orchestration and parallel AI agent execution to create comprehensive documentation from any repository.

**Key Responsibilities**:

- **Phase 1 - Discovery & Analysis**: 4 parallel agents analyze repository structure, languages, dependencies, and architecture patterns to generate `analysis.json`
- **Phase 2 - Engineer Questions**: Generate targeted questions (40+) across 14 documentation categories based on discovery findings
- **Phase 3 - Research**: Dynamically execute parallel research agents to gather evidence and answer all questions with file:line references
- **Phase 4 - Orchestration**: Intelligently assign exclusive file ownership to 1-8 writer agents to prevent conflicts
- **Phase 5 - Documentation Writing**: Parallel writers synthesize research into clear, evidence-based documentation with code references
- **Phase 6 - QA Validation**: LSP-powered verification ensures code references are accurate and documentation is complete

**Key Features**:

- Exclusive file ownership prevents merge conflicts
- Adaptive parallel execution scales based on workload
- Evidence-based writing with mandatory file:line citations
- Supports monorepos and polyglot environments
- JSON-driven state management across phases

Reference: `octocode-documentaion-writer/SKILL.md:1-150`, `.context/analysis.json:1-139`

## Relationship Between Skills

The two skills are designed to work together in a complementary manner:

1. **octocode-research** provides the foundational research capabilities (HTTP API)
2. **octocode-documentaion-writer** consumes those capabilities through the research server to generate documentation
3. The documentation writer's Phase 3 (Research) agents call the research server endpoints to gather evidence
4. The research server's resilience patterns ensure reliable operation even under heavy parallel agent load

Both skills share common infrastructure:
- TypeScript codebase with ESM modules
- Workspace dependencies (`octocode-mcp`, `octocode-shared`)
- Vitest for testing
- tsdown for bundling
- PM2 for process management (research server only)

Reference: `octocode-research/src/server.ts:15`, `octocode-documentaion-writer/SKILL.md:50-80`

# Octocode MCP Documentation

Welcome to the comprehensive documentation for **Octocode MCP** - a Model Context Protocol (MCP) server that provides intelligent code context for AI systems.

> **Generated with [octocode-documentation-writer](https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-documentaion-writer) skill**
>
> ```bash
> npx add-skill https://github.com/bgauryy/octocode-mcp/tree/main/skills/octocode-documentaion-writer
> ```

---

## Table of Contents

### Getting Started

1. **[Project Overview](./01-project-overview.md)**
   - What is Octocode MCP?
   - Key features and capabilities
   - The 13 MCP tools overview
   - Target users and use cases
   - Architecture philosophy

2. **[Technical Stack](./02-technical-stack.md)**
   - Core runtime and language (Node.js 20+, TypeScript 5.9)
   - Model Context Protocol SDK
   - API clients (Octokit, GitBeaker)
   - Schema validation (Zod)
   - LSP integration
   - Build tools and dependencies
   - System requirements

3. **[Architecture](./03-architecture.md)**
   - High-level architecture diagram
   - Component relationships
   - Server startup flow
   - Tool execution flow
   - Provider pattern
   - Security layer
   - LSP layer
   - Caching strategy
   - Error handling

### Deployment & Operations

6. **[Deployment Guide](./06-deployment.md)**
   - Installation methods (CLI, binary, npm, source)
   - Authentication setup (GitHub, GitLab)
   - MCP client integration (Claude Desktop, Cursor, etc.)
   - Environment configuration
   - System dependencies
   - Graceful shutdown
   - Production deployment (Docker, systemd, PM2)
   - Performance tuning
   - Troubleshooting

---

## Quick Navigation

### By Role

**For Developers:**
- Start with [Project Overview](./01-project-overview.md) to understand what Octocode MCP does
- Read [Technical Stack](./02-technical-stack.md) to understand the technology choices
- Study [Architecture](./03-architecture.md) to understand how it all fits together
- Follow [Deployment Guide](./06-deployment.md) to install and configure

**For DevOps/SRE:**
- Jump to [Deployment Guide](./06-deployment.md) for installation and operations
- Check [Technical Stack](./02-technical-stack.md) for dependencies
- Review [Architecture](./03-architecture.md) for system behavior and shutdown procedures

**For Contributors:**
- Read [Architecture](./03-architecture.md) to understand the codebase structure
- Study [Technical Stack](./02-technical-stack.md) to understand the tools and libraries
- See [Project Overview](./01-project-overview.md) for design principles

**For Users (via AI assistants):**
- Start with [Project Overview](./01-project-overview.md) to see what's possible
- Follow [Deployment Guide](./06-deployment.md) for installation
- The AI assistant will handle the rest!

### By Topic

**Installation:**
- [Quick Start Installation](./06-deployment.md#installation-methods)
- [Interactive CLI Installer](./06-deployment.md#method-1-interactive-cli-installer-recommended)
- [Standalone Binary](./06-deployment.md#method-2-standalone-binary-no-nodejs-required)
- [NPM/NPX Installation](./06-deployment.md#method-3-npmnpx-nodejs-required)

**Configuration:**
- [Authentication Setup](./06-deployment.md#authentication-setup)
- [Environment Variables](./06-deployment.md#environment-configuration)
- [MCP Client Integration](./06-deployment.md#mcp-client-integration)
- [LSP Configuration](./02-technical-stack.md#lsp-language-server-protocol)

**Architecture:**
- [Server Startup Flow](./03-architecture.md#1-mcp-server-layer-entry-point)
- [Tool Execution Flow](./03-architecture.md#tool-execution-flow)
- [Provider Pattern](./03-architecture.md#5-provider-layer)
- [Security Layer](./03-architecture.md#4-security-layer)
- [Caching Strategy](./03-architecture.md#caching-strategy)

**Tools:**
- [13 MCP Tools Overview](./01-project-overview.md#the-13-mcp-tools)
- [GitHub/GitLab Tools](./01-project-overview.md#githubgitlab-tools-6-tools)
- [Local Search Tools](./01-project-overview.md#local-code-search-tools-4-tools)
- [LSP Tools](./01-project-overview.md#lsp-tools-3-tools)

**Operations:**
- [Graceful Shutdown](./06-deployment.md#graceful-shutdown)
- [Troubleshooting](./06-deployment.md#troubleshooting)
- [Production Deployment](./06-deployment.md#production-deployment)
- [Performance Tuning](./06-deployment.md#performance-tuning)

---

## Documentation Structure

This documentation is organized into focused guides that cover specific aspects of Octocode MCP:

### 01. Project Overview
**Purpose:** Understand what Octocode MCP is and what it can do

**Topics:**
- Project purpose and problem it solves
- Key features (multi-platform support, local tools, LSP, security)
- The 13 MCP tools in detail
- Target users and integration methods
- Real-world use cases
- Comparison with alternatives

**Best for:** Product managers, developers evaluating the tool, new users

---

### 02. Technical Stack
**Purpose:** Understand the technology choices and dependencies

**Topics:**
- Node.js 20+ (runtime requirements and benefits)
- TypeScript 5.9 (type safety and modern features)
- @modelcontextprotocol/sdk (MCP implementation)
- Octokit & GitBeaker (API clients)
- Zod (schema validation)
- VSCode LSP libraries (language server protocol)
- Build tools (tsdown, vitest, eslint)
- System dependencies (ripgrep, find, language servers)

**Best for:** Developers, technical architects, contributors

---

### 03. Architecture
**Purpose:** Understand how the system is designed and how components interact

**Topics:**
- Layered architecture overview
- MCP server layer (entry point and initialization)
- Configuration layer (environment variables, token resolution)
- Tool layer (registration, execution, schemas)
- Security layer (validation, sanitization, masking)
- Provider layer (abstraction for GitHub/GitLab)
- LSP layer (language server management)
- Utility layer (caching, commands, bulk operations)
- Request flow diagrams
- Data flow patterns

**Best for:** Senior developers, architects, maintainers, contributors

---

### 06. Deployment Guide
**Purpose:** Install, configure, and operate Octocode MCP

**Topics:**
- Prerequisites and system requirements
- Installation methods (CLI, binary, npm, source)
- Authentication setup (GitHub CLI, tokens, OAuth)
- MCP client integration (Claude Desktop, Cursor, Windsurf, VS Code)
- Environment configuration (complete reference)
- System dependencies (ripgrep, language servers)
- Graceful shutdown procedures
- Troubleshooting common issues
- Production deployment (Docker, systemd, PM2)
- Performance tuning and monitoring

**Best for:** DevOps engineers, system administrators, developers setting up

---

## Feature Matrix

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **GitHub Integration** | Search code, repos, PRs, view files | [Overview](./01-project-overview.md#githubgitlab-tools-6-tools) |
| **GitLab Integration** | Search projects, code, MRs | [Overview](./01-project-overview.md#1-multi-platform-code-hosting-support) |
| **Local Code Search** | ripgrep-powered pattern search | [Overview](./01-project-overview.md#2-local-filesystem-tools) |
| **LSP Navigation** | Go-to-definition, find-references | [Overview](./01-project-overview.md#3-lsp-language-server-protocol-integration) |
| **Package Search** | NPM and PyPI package lookup | [Overview](./01-project-overview.md#4-package-registry-integration) |
| **Security Layer** | Input validation, output sanitization | [Architecture](./03-architecture.md#4-security-layer) |
| **Multi-tier Caching** | HTTP response and client caching | [Architecture](./03-architecture.md#caching-strategy) |
| **Bulk Queries** | Execute 1-5 queries per tool call | [Architecture](./03-architecture.md#7-utility-layer) |
| **Token Efficiency** | Minification and pagination | [Overview](./01-project-overview.md#6-token-efficiency-and-minification) |
| **Graceful Shutdown** | Clean resource cleanup | [Deployment](./06-deployment.md#graceful-shutdown) |

---

## Common Tasks

### Installation & Setup

**Quick Install:**
```bash
npx octocode-cli
```
→ [Full installation guide](./06-deployment.md#installation-methods)

**Manual Configuration:**
→ [MCP client integration guide](./06-deployment.md#mcp-client-integration)

**Authentication:**
→ [GitHub authentication setup](./06-deployment.md#github-authentication)
→ [GitLab authentication setup](./06-deployment.md#gitlab-authentication)

---

### Configuration

**Environment Variables:**
→ [Complete environment reference](./06-deployment.md#environment-configuration)

**Tool Configuration:**
```bash
# Enable specific tools only
TOOLS_TO_RUN="githubSearchCode,localSearchCode"

# Disable specific tools
DISABLE_TOOLS="packageSearch"
```
→ [Tool configuration guide](./06-deployment.md#tool-configuration)

**LSP Configuration:**
```bash
# Custom language server paths
OCTOCODE_TS_SERVER_PATH="/usr/local/bin/typescript-language-server"
```
→ [LSP configuration guide](./02-technical-stack.md#lsp-language-server-protocol)

---

### Troubleshooting

**Common Issues:**
- [No GitHub token available](./06-deployment.md#1-no-github-token-available)
- [Command not found: rg](./06-deployment.md#2-command-not-found-rg)
- [Tool not registered](./06-deployment.md#3-tool-not-registered)
- [Rate limit exceeded](./06-deployment.md#4-rate-limit-exceeded)
- [Language server not found](./06-deployment.md#5-language-server-not-found)

**Debug Mode:**
```bash
OCTOCODE_DEBUG=true npx octocode-mcp@latest
```
→ [Troubleshooting guide](./06-deployment.md#troubleshooting)

---

### Operations

**Production Deployment:**
→ [Docker deployment](./06-deployment.md#docker-deployment)
→ [Systemd service](./06-deployment.md#systemd-service)
→ [PM2 process manager](./06-deployment.md#pm2-process-manager)

**Monitoring:**
→ [Health checks](./06-deployment.md#health-checks)
→ [Performance tuning](./06-deployment.md#performance-tuning)

**Backup & Recovery:**
→ [Configuration backup](./06-deployment.md#backup-and-recovery)

---

## Key Concepts

### Model Context Protocol (MCP)
Standardized protocol for AI assistants to access external tools and data sources. Octocode MCP implements this protocol to provide code intelligence tools to any MCP-compatible client.

→ [MCP SDK documentation](./02-technical-stack.md#model-context-protocol)

### Provider Pattern
Abstraction layer that unifies GitHub and GitLab (and future platforms) behind a common interface. Tools don't need to know about platform-specific APIs.

→ [Provider architecture](./03-architecture.md#5-provider-layer)

### Bulk Query Pattern
Execute multiple related queries in a single tool call, enabling parallel execution and reducing latency.

→ [Bulk operations](./03-architecture.md#tool-execution-pattern)

### Security Validation
Every tool request passes through validation layers that check inputs, sanitize outputs, and mask sensitive data.

→ [Security layer architecture](./03-architecture.md#4-security-layer)

### Token Efficiency
Minimize token consumption through minification, pagination, and targeted content retrieval.

→ [Token efficiency features](./01-project-overview.md#6-token-efficiency-and-minification)

### LSP Integration
Language Server Protocol provides semantic code navigation (definitions, references, call hierarchy) for 40+ languages.

→ [LSP layer architecture](./03-architecture.md#6-lsp-layer)

---

## Examples

### Real-World Use Cases

**Feature Implementation Research:**
> "I want to add OAuth authentication to my app"
→ [Example workflow](./01-project-overview.md#1-feature-implementation-research)

**Bug Investigation:**
> "Production bug in authentication middleware"
→ [Example workflow](./01-project-overview.md#2-bug-investigation)

**Architecture Understanding:**
> "New developer joining a large codebase"
→ [Example workflow](./01-project-overview.md#3-architecture-understanding)

**Dependency Upgrade:**
> "Need to upgrade from React 17 to React 18"
→ [Example workflow](./01-project-overview.md#4-dependency-upgrade)

**Security Audit:**
> "Security review before production deployment"
→ [Example workflow](./01-project-overview.md#5-security-audit)

---

## Version Information

- **Current Version:** 11.2.2
- **MCP Protocol Version:** 1.25.2
- **Node.js Requirement:** >= 20.0.0
- **TypeScript Version:** 5.9.3

---

## Additional Resources

### Official Links
- **Homepage:** https://octocode.ai
- **GitHub Repository:** https://github.com/bgauryy/octocode-mcp
- **NPM Package:** https://www.npmjs.com/package/octocode-mcp
- **Issue Tracker:** https://github.com/bgauryy/octocode-mcp/issues

### Community
- **Discord Server:** Link in README
- **YouTube Channel:** [@Octocode-ai](https://www.youtube.com/@Octocode-ai)
- **Twitter/X:** Follow for updates

### MCP Resources
- **MCP Specification:** https://modelcontextprotocol.io/
- **MCP Quickstart:** https://modelcontextprotocol.io/quickstart/user
- **MCP Community Servers:** https://github.com/modelcontextprotocol/servers
- **Awesome MCP Servers:** https://github.com/punkpeye/awesome-mcp-servers

---

## Contributing

Interested in contributing? Start with:
1. [Architecture documentation](./03-architecture.md) to understand the codebase
2. [Technical Stack documentation](./02-technical-stack.md) to set up your environment
3. GitHub issues for contribution opportunities

---

## License

Octocode MCP is released under the MIT License. See LICENSE file for details.

---

## Support

- **Documentation Issues:** Open an issue on GitHub
- **Bug Reports:** https://github.com/bgauryy/octocode-mcp/issues
- **Feature Requests:** https://github.com/bgauryy/octocode-mcp/discussions
- **General Questions:** Discord community or GitHub discussions

---

## Next Steps

**New Users:**
1. Read [Project Overview](./01-project-overview.md)
2. Follow [Deployment Guide](./06-deployment.md) to install
3. Try example prompts in your MCP client

**Developers:**
1. Study [Architecture](./03-architecture.md)
2. Review [Technical Stack](./02-technical-stack.md)
3. Set up development environment

**DevOps:**
1. Review [Deployment Guide](./06-deployment.md)
2. Set up production deployment
3. Configure monitoring and health checks

---

**Last Updated:** 2026-01-23
**Documentation Version:** 1.0.0

# @octocode/mcp Documentation

**Version**: 0.4.3
**MCP Server for GitHub Operations**

## Overview

@octocode/mcp is a Model Context Protocol (MCP) server that provides GitHub integration tools for AI assistants. It enables searching repositories, fetching file contents, viewing repository structures, and searching pull requests through the GitHub API.

## What is Model Context Protocol (MCP)?

The Model Context Protocol is a standardized way for AI assistants to interact with external tools and resources. @octocode/mcp implements an MCP server that exposes coding-related capabilities through a well-defined protocol.

## Key Features

- **Repository Search**: Search GitHub repositories with advanced filters
- **Code Search**: Find code across GitHub repositories
- **Content Fetching**: Retrieve file contents from repositories
- **Repository Structure**: View directory trees and file structures
- **Pull Request Search**: Search and filter pull requests
- **Type-Safe**: Built with TypeScript and Zod validation
- **Caching**: Intelligent caching for performance optimization
- **Security**: Content sanitization and token masking

## Quick Start

### Installation

```bash
npm install @octocode/mcp
```

### Usage as a Library

```typescript
import { OctocodeServer } from '@octocode/mcp';

const server = new OctocodeServer({
  name: 'octocode-mcp',
  version: '0.4.3'
});

await server.start();
```

### Usage as a CLI

```bash
npx octocode-mcp
```

## Documentation Structure

### Getting Started
- [Getting Started Guide](getting-started.md) - Installation and setup
- [Configuration](configuration.md) - Server configuration options

### Core Concepts
- [Architecture](architecture.md) - System design and patterns
- [API Reference](api-reference.md) - Complete API documentation
- [Type System](type-system.md) - TypeScript types and interfaces

### Features
- [Tools Reference](tools-reference.md) - Available tools and their usage
- [Actions Reference](actions-reference.md) - Multi-step action system
- [Prompts Reference](prompts-reference.md) - AI prompt templates

### Guides
- [Usage Examples](usage-examples.md) - Common use cases
- [Best Practices](best-practices.md) - Recommended patterns
- [Error Handling](error-handling.md) - Error codes and recovery

### Development
- [Testing](testing.md) - Running and writing tests
- [Contributing](contributing.md) - How to contribute
- [Deployment](deployment.md) - Packaging and distribution

## Available Tools

| Tool | Category | Description |
|------|----------|-------------|
| `github_search_repos` | Repository | Search GitHub repositories |
| `github_search_code` | Code Search | Search code across repositories |
| `github_fetch_content` | Content | Fetch file contents from repositories |
| `github_view_repo_structure` | Structure | View repository directory structure |
| `github_search_pull_requests` | Pull Requests | Search and filter pull requests |

See [Tools Reference](tools-reference.md) for detailed documentation.

## Architecture Highlights

- **Protocol Layer**: MCP protocol implementation using `@modelcontextprotocol/sdk`
- **GitHub Integration**: Octokit REST API and GraphQL client
- **Caching Layer**: Multi-level caching (FileCache, RepositoryCache, TreeCache)
- **Security Layer**: Content sanitization and sensitive data masking
- **Validation Layer**: Zod schemas for input/output validation
- **Tool Manager**: Centralized tool registration and management

See [Architecture](architecture.md) for detailed design documentation.

## Requirements

- Node.js >= 18.0.0
- TypeScript 5.7+ (for development)

## License

MIT © Octocode

## Support

- GitHub: [octocode/mcp](https://github.com/octocode/mcp)
- Issues: [Report an issue](https://github.com/octocode/mcp/issues)
- Documentation: [Full documentation](.)

## Next Steps

1. Read the [Getting Started Guide](getting-started.md)
2. Explore [Tools Reference](tools-reference.md)
3. Check out [Usage Examples](usage-examples.md)
4. Review [Best Practices](best-practices.md)

# Octocode MCP

Model Context Protocol (MCP) server for advanced GitHub repository analysis, code discovery, and npm package exploration. Provides AI assistants with powerful tools to search, analyze, and understand codebases across GitHub and npm ecosystems.

## Features

- **GitHub Code Search**: Search across millions of repositories with advanced filtering
- **Repository Analysis**: Explore repository structure, commits, and metadata
- **Pull Request & Issue Tracking**: Find and analyze development activity
- **NPM Package Discovery**: Search and analyze npm packages with dependency information
- **Content Retrieval**: Fetch and analyze file contents with intelligent minification
- **Commit History**: Track code changes and development patterns

## DXT Extension

This project is available as a Desktop Extension (DXT) for easy installation in AI applications like Claude Desktop.

### Building the DXT Package

```bash
# Install dependencies
yarn install

# Build the DXT package
yarn dxt:pack

# Validate the manifest
yarn dxt:validate

# View package information
yarn dxt:info

# Sign the package (optional)
yarn dxt:sign
```

### DXT Scripts

- `yarn dxt:validate` - Validate the manifest.json file
- `yarn dxt:pack` - Build and package the extension as a .dxt file
- `yarn dxt:info` - Show information about the packaged extension
- `yarn dxt:sign` - Sign the package with a self-signed certificate
- `yarn dxt:verify` - Verify the signature of a signed package

The DXT package includes:
- Compiled MCP server (`dist/index.js`)
- Extension manifest (`manifest.json`)
- Package metadata (`package.json`)
- Logo and assets (`assets/logo.png`)
- Documentation (`README.md`)

### Installation

1. Build the DXT package using `yarn dxt:pack`
2. Install the generated `octocode-mcp.dxt` file in your AI application

## Tools Available

### GitHub Tools
- `githubSearchCode` - Search code across repositories
- `githubGetFileContent` - Fetch file contents from repositories
- `githubSearchRepositories` - Search for repositories
- `githubSearchCommits` - Search commit history
- `githubSearchPullRequests` - Search pull requests
- `githubSearchIssues` - Search issues
- `githubViewRepoStructure` - View repository structure

### NPM Tools
- `npmPackageSearch` - Search npm packages
- `npmViewPackage` - View package information and dependencies

### System Tools
- `apiStatusCheck` - Check GitHub and npm API status

## Installation

```bash
npm install -g octocode-mcp
```

## Usage

### As MCP Server

```bash
# Start the server
octocode-mcp

# Or with debugging
npx @modelcontextprotocol/inspector octocode-mcp
```

### Configuration

The server can be configured through environment variables or user configuration when used as a DXT extension:

- `GITHUB_TOKEN` - GitHub personal access token (optional, increases rate limits)
- `NPM_REGISTRY` - NPM registry URL (default: https://registry.npmjs.org)

## Development

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests
yarn test

# Start in development mode
yarn build:watch

# Lint and format
yarn lint
yarn format
```

## License

MIT License - see LICENSE.md for details.
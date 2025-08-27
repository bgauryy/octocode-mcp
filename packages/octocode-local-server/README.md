# Octocode Local Server

A local development server wrapper for Octocode MCP that provides enhanced local development features and easier integration for development workflows.

## Overview

`octocode-local-server` provides the same functionality as the original `octocode-mcp` server but as a local package within the workspace:

- **Full MCP Server**: Complete MCP (Model Context Protocol) server implementation
- **OAuth Integration**: GitHub OAuth authentication with session management
- **All MCP Tools**: Access to the full suite of GitHub analysis and npm exploration tools
- **Enterprise Features**: Audit logging and rate limiting support
- **Security**: Content sanitization and secure credential storage
- **Development Mode**: Additional endpoints for monitoring and debugging (optional)

## Installation

Since this is a workspace package, install dependencies from the monorepo root:

```bash
# From the monorepo root
yarn install

# Build all packages
yarn build
```

## Usage

### Development Mode

```bash
# Run in development mode with hot reload
yarn dev

# Or run directly with tsx
npx tsx src/index.ts
```

### Production Mode

```bash
# Build the package
yarn build

# Run the built server
yarn start

# Or run directly
node dist/index.js
```

### Environment Configuration

Create a `.env` file in the package root:

```env
# Server Configuration
PORT=3001
HOST=localhost
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# MCP Server Integration
MCP_SERVER_PORT=3000
START_MCP_SERVER=true

# Features
ENABLE_API_EXPLORER=true
ENABLE_METRICS=true

# MCP Configuration (passed through to octocode-mcp)
GITHUB_TOKEN=your_github_token_here
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
```

## API Endpoints

### Core Endpoints

- `GET /health` - Health check endpoint
- `GET /api/status` - Server and MCP status information

### Development Endpoints

- `GET /api/explorer` - API explorer (when `ENABLE_API_EXPLORER=true`)
- `GET /metrics` - Performance metrics (when `ENABLE_METRICS=true`)

### MCP Integration

- `/mcp/*` - Proxy endpoints to the underlying MCP server

## Features

### Health Monitoring

The server provides comprehensive health checking:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "mcpServerStatus": "running"
}
```

### Status Information

Detailed server status including environment info:

```json
{
  "localServer": {
    "status": "running",
    "port": 3001,
    "host": "localhost",
    "features": {
      "apiExplorer": true,
      "metrics": true
    }
  },
  "mcpServer": {
    "status": "running",
    "port": 3000
  },
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "arch": "x64"
  }
}
```

### Development Features

- **CORS Support**: Pre-configured for local development
- **Request Logging**: Automatic request logging in development
- **Error Handling**: Comprehensive error handling with detailed messages
- **Hot Reload**: Support for development with `tsx` or similar tools

### Security

- **Helmet Integration**: Security headers configured
- **Content Security Policy**: Restrictive CSP for security
- **Input Validation**: Request body size limits and validation
- **Environment Separation**: Different configurations for development/production

## Architecture

The local server acts as a wrapper around the core `octocode-mcp` functionality:

```
┌─────────────────────────┐
│   Frontend/Client       │
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  octocode-local-server  │
│  - Express Server       │
│  - Health Checks        │
│  - API Explorer         │
│  - Development Features │
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│     octocode-mcp        │
│  - MCP Server           │
│  - GitHub Integration   │
│  - Tool Implementations │
└─────────────────────────┘
```

## Development

### Adding New Features

1. Extend the `OctocodeLocalServer` class
2. Add new routes in `setupRoutes()` method
3. Update environment configuration as needed
4. Add tests for new functionality

### Testing

```bash
# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage
```

### Building

```bash
# Build for production
yarn build

# Build and watch for changes
yarn build:watch
```

## Dependencies

### Workspace Dependencies

- `octocode-mcp`: Core MCP server functionality (workspace:*)

### External Dependencies

- `express`: Web server framework
- `cors`: CORS middleware
- `helmet`: Security middleware
- `compression`: Response compression
- `dotenv`: Environment variable loading

## Scripts

- `build`: Build for production with linting
- `build:dev`: Build without linting
- `build:watch`: Build in watch mode
- `dev`: Run in development mode with tsx
- `start`: Run built server
- `test`: Run tests
- `lint`: Lint TypeScript files
- `format`: Format code with Prettier

## License

MIT - See LICENSE.md for details

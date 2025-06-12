# Model Context Protocol (MCP) Development Documentation

*Generated using Octocode MCP - Advanced Code Analysis Assistant*

## Overview

The **Model Context Protocol (MCP)** is a standardized way for applications to provide context to Large Language Models (LLMs), separating the concerns of providing context from the actual LLM interaction. The TypeScript SDK provides a complete implementation of the MCP specification.

**Main Repository**: https://github.com/modelcontextprotocol/typescript-sdk
**Package**: `@modelcontextprotocol/sdk`
**Language**: TypeScript
**License**: MIT
**Current Version**: 1.12.1

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) enables applications to provide context for LLMs in a secure, standardized way. It's like a web API specifically designed for LLM interactions.

### Core Capabilities

- **Resources**: Expose data (like GET endpoints for loading information into LLM context)
- **Tools**: Provide functionality (like POST endpoints for executing code or producing side effects)
- **Prompts**: Define interaction patterns (reusable templates for LLM interactions)
- **Standard Transports**: Support for stdio and Streamable HTTP
- **Protocol Compliance**: Handle all MCP protocol messages and lifecycle events

## Installation

```bash
npm install @modelcontextprotocol/sdk
```

## Quick Start

Create a simple MCP server that exposes a calculator tool and dynamic resources:

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Demo",
  version: "1.0.0"
});

// Add an addition tool
server.tool("add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);

// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [{
      uri: uri.href,
      text: `Hello, ${name}!`
    }]
  })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Core Concepts

### 1. Server

The McpServer is your core interface to the MCP protocol:

```typescript
const server = new McpServer({
  name: "My App",
  version: "1.0.0"
});
```

Key responsibilities:
- Connection management
- Protocol compliance
- Message routing
- Lifecycle event handling

### 2. Resources

Resources expose data to LLMs without side effects (similar to GET endpoints):

```typescript
// Static resource
server.resource(
  "config",
  "config://app",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: "App configuration here"
    }]
  })
);

// Dynamic resource with parameters
server.resource(
  "user-profile",
  new ResourceTemplate("users://{userId}/profile", { list: undefined }),
  async (uri, { userId }) => ({
    contents: [{
      uri: uri.href,
      text: `Profile data for user ${userId}`
    }]
  })
);
```

### 3. Tools

Tools enable LLMs to take actions with side effects:

```typescript
// Simple tool with parameters
server.tool(
  "calculate-bmi",
  {
    weightKg: z.number(),
    heightM: z.number()
  },
  async ({ weightKg, heightM }) => ({
    content: [{
      type: "text",
      text: String(weightKg / (heightM * heightM))
    }]
  })
);

// Async tool with external API call
server.tool(
  "fetch-weather",
  { city: z.string() },
  async ({ city }) => {
    const response = await fetch(`https://api.weather.com/${city}`);
    const data = await response.text();
    return {
      content: [{ type: "text", text: data }]
    };
  }
);
```

### 4. Prompts

Prompts are reusable templates for LLM interactions:

```typescript
server.prompt(
  "review-code",
  { code: z.string() },
  ({ code }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please review this code:\n\n${code}`
      }
    }]
  })
);
```

## Transport Options

### stdio Transport

For command-line tools and direct integrations:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});

// ... set up server resources, tools, and prompts ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Streamable HTTP Transport

For remote servers with session management:

```typescript
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
      }
    });

    const server = new McpServer({
      name: "example-server",
      version: "1.0.0"
    });

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request' },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

## Advanced Features

### Dynamic Servers

Add, update, or remove tools/prompts/resources after the server is connected:

```typescript
const server = new McpServer({
  name: "Dynamic Example",
  version: "1.0.0"
});

const putMessageTool = server.tool(
  "putMessage",
  { channel: z.string(), message: z.string() },
  async ({ channel, message }) => ({
    content: [{ type: "text", text: await putMessage(channel, message) }]
  })
);

// Initially disabled
putMessageTool.disable();

const upgradeAuthTool = server.tool(
  "upgradeAuth",
  { permission: z.enum(["write", "admin"]) },
  async ({ permission }) => {
    const { ok, previous } = await upgradeAuthAndStoreToken(permission);
    
    if (previous === "read") {
      putMessageTool.enable(); // Automatically emits listChanged
    }
    
    if (permission === 'admin') {
      upgradeAuthTool.remove(); // Remove this tool completely
    }
    
    return { content: [{ type: "text", text: "Auth upgraded" }] };
  }
);
```

### Low-Level Server

For fine-grained control using the low-level Server class:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "example-server", version: "1.0.0" },
  { capabilities: { prompts: {} } }
);

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{
    name: "example-prompt",
    description: "An example prompt template",
    arguments: [{
      name: "arg1",
      description: "Example argument",
      required: true
    }]
  }]
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "example-prompt") {
    throw new Error("Unknown prompt");
  }
  return {
    description: "Example prompt",
    messages: [{
      role: "user",
      content: { type: "text", text: "Example prompt text" }
    }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Writing MCP Clients

The SDK provides a high-level client interface:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"]
});

const client = new Client({
  name: "example-client",
  version: "1.0.0"
});

await client.connect(transport);

// List prompts
const prompts = await client.listPrompts();

// Get a prompt
const prompt = await client.getPrompt({
  name: "example-prompt",
  arguments: { arg1: "value" }
});

// List resources
const resources = await client.listResources();

// Read a resource
const resource = await client.readResource({
  uri: "file:///example.txt"
});

// Call a tool
const result = await client.callTool({
  name: "example-tool",
  arguments: { arg1: "value" }
});
```

## Project Structure

```
typescript-sdk/
├── src/                    # Source code
│   ├── client/            # Client implementations
│   ├── server/            # Server implementations
│   ├── shared/            # Shared utilities
│   └── types/             # TypeScript type definitions
├── examples/              # Example implementations
├── docs/                  # Additional documentation
├── tests/                 # Test suites
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
├── README.md              # Main documentation
├── CONTRIBUTING.md        # Contribution guidelines
├── CODE_OF_CONDUCT.md     # Community guidelines
├── SECURITY.md            # Security policy
└── LICENSE                # MIT license
```

## Testing and Debugging

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server:

```bash
npx @modelcontextprotocol/inspector
```

The inspector provides:
- Interactive testing of tools, resources, and prompts
- Real-time message inspection
- Connection debugging
- Protocol validation

## Available Packages in the Ecosystem

Based on npm registry search, the MCP ecosystem includes:

1. **@modelcontextprotocol/sdk** (v1.12.1) - Core TypeScript SDK
2. **@modelcontextprotocol/inspector** (v0.14.0) - Development and debugging tool
3. **figma-mcp** - ModelContextProtocol server for Figma
4. **puppeteer-mcp-server** - Browser automation using Puppeteer
5. **xcodebuildmcp** - Xcode project management tools
6. **jsonresume-mcp** - JSON Resume integration
7. **ref-tools-mcp** - Reference tools server

## Authentication and Security

### OAuth Integration

Proxy OAuth requests to external providers:

```typescript
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';

const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: "https://auth.external.com/oauth2/v1/authorize",
    tokenUrl: "https://auth.external.com/oauth2/v1/token",
    revocationUrl: "https://auth.external.com/oauth2/v1/revoke",
  },
  verifyAccessToken: async (token) => ({
    token,
    clientId: "123",
    scopes: ["openid", "email", "profile"],
  }),
  getClient: async (client_id) => ({
    client_id,
    redirect_uris: ["http://localhost:3000/callback"],
  })
});

app.use(mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL("http://auth.external.com"),
  baseUrl: new URL("http://mcp.example.com"),
  serviceDocumentationUrl: new URL("https://docs.example.com/"),
}));
```

## Backwards Compatibility

Support for both Streamable HTTP and deprecated SSE transport:

### Client-Side
```typescript
let client: Client | undefined = undefined;
const baseUrl = new URL(url);

try {
  client = new Client({ name: 'streamable-http-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(baseUrl);
  await client.connect(transport);
} catch (error) {
  // Fallback to SSE transport
  client = new Client({ name: 'sse-client', version: '1.0.0' });
  const sseTransport = new SSEClientTransport(baseUrl);
  await client.connect(sseTransport);
}
```

## Best Practices

### 1. Server Design
- Use meaningful names for tools, resources, and prompts
- Provide clear descriptions and parameter schemas
- Handle errors gracefully with descriptive messages
- Implement proper authentication and authorization

### 2. Resource Management
- Keep resources stateless when possible
- Use resource templates for parameterized resources
- Provide efficient data serialization
- Implement proper caching strategies

### 3. Tool Implementation
- Validate input parameters thoroughly
- Provide progress feedback for long-running operations
- Implement proper error handling and recovery
- Document expected behavior and side effects

### 4. Testing
- Use the MCP Inspector for development
- Write comprehensive unit tests
- Test with different transport types
- Validate protocol compliance

## Resources

### Official Documentation
- **MCP Website**: https://modelcontextprotocol.io
- **Specification**: https://spec.modelcontextprotocol.io
- **TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Example Servers**: https://github.com/modelcontextprotocol/servers

### Development Tools
- **Inspector**: https://github.com/modelcontextprotocol/inspector
- **TypeScript Types**: Included in the SDK package
- **Protocol Validation**: Built into the SDK

### Community
- **GitHub Issues**: Report bugs and request features
- **Discussions**: Community Q&A and showcase
- **Contributing**: See CONTRIBUTING.md in repositories

---

*This documentation was generated using Octocode MCP tools by analyzing the Model Context Protocol TypeScript SDK repository, package ecosystem, and community resources.* 
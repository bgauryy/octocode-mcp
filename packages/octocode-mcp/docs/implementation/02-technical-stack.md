# Technical Stack

## Overview

Octocode MCP is built on a modern Node.js/TypeScript stack with carefully chosen dependencies that enable high performance, type safety, and enterprise-grade reliability. This document details every technology choice, version requirement, and the rationale behind each decision.

---

## Core Runtime and Language

### Node.js >= 20.0.0

**Version Requirement:** `>=20.0.0`

**Why Node.js 20+:**

1. **Native ESM Support**
   - First-class `import`/`export` syntax
   - No transpilation needed for modern module system
   - Better tree-shaking and optimization
   - Cleaner package.json with `"type": "module"`

2. **Performance Improvements**
   - V8 engine updates (10% faster than Node 18)
   - Improved garbage collection
   - Better async/await performance
   - Faster JSON parsing

3. **Modern JavaScript Features**
   - Top-level await
   - Promise.allSettled improvements
   - Array.at() and String.at()
   - Error.cause for better error handling

4. **Security Updates**
   - Regular security patches
   - Updated OpenSSL version
   - Better crypto module
   - Secure by default settings

5. **Developer Experience**
   - Better stack traces
   - Improved REPL
   - Enhanced debugging with Chrome DevTools
   - Built-in test runner (used by vitest)

**Installation:**
```bash
# Check your version
node --version

# Should output: v20.x.x or higher

# Install via nvm (recommended)
nvm install 20
nvm use 20

# Or via package managers
# macOS
brew install node@20

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org/
```

**Why Not Lower Versions:**
- Node 18: Missing some ESM fixes and performance improvements
- Node 16: LTS ended, security vulnerabilities
- Node 14: EOL (End of Life), no longer supported

---

### TypeScript 5.9.3

**Version:** `^5.9.3` (devDependency)

**Why TypeScript:**

1. **Type Safety**
   ```typescript
   // Compile-time error detection
   interface ServerConfig {
     github: GitHubConfig;
     gitlab: GitLabConfig;
     tools: ToolConfig[];
   }

   // TypeScript catches this at build time
   const config: ServerConfig = {
     github: { token: "abc" },  // ✓ Valid
     gitlab: { host: 123 },     // ✗ Error: number not assignable to string
   };
   ```

2. **Self-Documenting Code**
   ```typescript
   // Function signature tells you everything
   async function getFileContent(
     query: FileContentQuery
   ): Promise<CallToolResult> {
     // Implementation
   }

   // No need to guess parameter types or return values
   ```

3. **IDE Autocomplete**
   - IntelliSense in VS Code
   - Jump to definition (Cmd/Ctrl + Click)
   - Find all references
   - Rename symbol refactoring

4. **Refactoring Safety**
   - Rename properties across entire codebase
   - Change function signatures confidently
   - Catch breaking changes immediately

5. **Modern Features**
   - Satisfies operator for exact type checking
   - Template literal types
   - Const assertions
   - Type guards and discriminated unions

**TypeScript 5.9 Specific Features Used:**

```typescript
// 1. Satisfies operator
export const TOOL_NAMES = {
  GITHUB_SEARCH_CODE: 'githubSearchCode',
  LOCAL_SEARCH_CODE: 'localSearchCode',
  // ...
} as const satisfies ToolNamesMap;

// 2. Const assertions for immutable objects
const CONFIG = {
  timeout: 30000,
  retries: 3,
} as const;
// CONFIG.timeout = 40000; // Error: Cannot assign

// 3. Template literal types
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Endpoint = `/${string}`;
type Route = `${HTTPMethod} ${Endpoint}`;
// Valid: "GET /users", "POST /auth"

// 4. Discriminated unions
type Tool =
  | { type: 'github'; provider: GitHubProvider }
  | { type: 'local'; command: string }
  | { type: 'lsp'; client: LSPClient };

function executeTool(tool: Tool) {
  switch (tool.type) {
    case 'github':
      return tool.provider.search(); // TypeScript knows provider exists
    case 'local':
      return execCommand(tool.command); // TypeScript knows command exists
    case 'lsp':
      return tool.client.request(); // TypeScript knows client exists
  }
}
```

**Configuration:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",           // Modern JS features
    "module": "ES2022",           // ESM modules
    "moduleResolution": "Bundler", // Better import resolution
    "strict": true,               // All strict checks enabled
    "skipLibCheck": true,         // Faster builds
    "esModuleInterop": true,      // Better CJS interop
    "resolveJsonModule": true     // Import JSON files
  }
}
```

---

## Model Context Protocol

### @modelcontextprotocol/sdk 1.25.2

**Version:** `^1.25.2` (devDependency)

**Purpose:** Official SDK for implementing Model Context Protocol servers.

**Why This SDK:**

1. **Official Implementation**
   - Maintained by Anthropic/MCP team
   - Follows MCP specification exactly
   - Regular updates and bug fixes
   - Community support

2. **Standardized Communication**
   ```typescript
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

   // Standard MCP server setup
   const server = new McpServer({
     name: 'octocode-mcp',
     version: '11.2.2',
   }, {
     capabilities: {
       tools: {},      // Tool support
       prompts: {},    // Prompt templates
       logging: {},    // Logging support
     },
   });

   // Stdio transport (universal compatibility)
   const transport = new StdioServerTransport();
   await server.connect(transport);
   ```

3. **Type Safety**
   ```typescript
   import { Implementation, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

   // CallToolResult type ensures proper response format
   const result: CallToolResult = {
     content: [
       {
         type: 'text',
         text: 'Search results...',
       },
     ],
   };
   ```

4. **Built-in Capabilities**
   - **Tools** - Register and handle tool calls
   - **Prompts** - Define prompt templates
   - **Resources** - Expose resources to clients
   - **Logging** - Structured logging support

5. **Transport Abstraction**
   ```typescript
   // Stdio transport for Claude Desktop, Cursor, etc.
   const stdioTransport = new StdioServerTransport();

   // Could be extended for HTTP transport
   // const httpTransport = new HttpServerTransport(port);
   ```

**MCP Protocol Benefits:**

- **Client Compatibility** - Works with any MCP-compatible client
- **Standardized API** - Consistent tool definition format
- **Versioning** - Protocol version negotiation
- **Error Handling** - Standard error codes and messages

**Core Classes Used:**

```typescript
// 1. McpServer - Main server instance
const server = new McpServer(config, options);

// 2. StdioServerTransport - Communication layer
const transport = new StdioServerTransport();

// 3. Implementation - Server metadata
interface Implementation {
  name: string;
  title: string;
  version: string;
}

// 4. CallToolResult - Tool response format
interface CallToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
  isError?: boolean;
}
```

**Tool Registration Pattern:**

```typescript
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  // Validate and execute tool
  const result = await executeTool(name, args);

  return result; // CallToolResult
});

server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'githubSearchCode',
        description: 'Search code across GitHub repositories',
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              items: { /* ... */ }
            }
          }
        }
      }
    ]
  };
});
```

---

## API Clients

### GitHub Integration

**octokit 5.0.5**
**@octokit/core 7.0.6**
**@octokit/plugin-rest-endpoint-methods 17.0.0**
**@octokit/plugin-throttling 11.0.3**

**Why Octokit:**

1. **Official GitHub Client**
   - Maintained by GitHub
   - 100% API coverage
   - Automatic updates for new endpoints

2. **Type-Safe REST API**
   ```typescript
   import { Octokit } from 'octokit';

   const octokit = new Octokit({ auth: token });

   // Type-safe methods
   const { data } = await octokit.rest.search.code({
     q: 'useState language:typescript',
     per_page: 30,
   });

   // data.items is properly typed
   data.items.forEach(item => {
     console.log(item.path);      // ✓ Type: string
     console.log(item.repository); // ✓ Type: Repository
   });
   ```

3. **Built-in Rate Limiting**
   ```typescript
   import { Octokit } from 'octokit';
   import { throttling } from '@octokit/plugin-throttling';

   const MyOctokit = Octokit.plugin(throttling);

   const octokit = new MyOctokit({
     auth: token,
     throttle: {
       onRateLimit: (retryAfter, options) => {
         console.warn(`Rate limit hit, retry after ${retryAfter}s`);
         return true; // Automatically retry
       },
       onSecondaryRateLimit: (retryAfter, options) => {
         console.warn(`Secondary rate limit hit`);
         return true;
       },
     },
   });
   ```

4. **Plugin System**
   ```typescript
   // Extend Octokit with custom functionality
   const MyOctokit = Octokit.plugin(
     throttling,           // Rate limiting
     restEndpointMethods,  // REST API methods
     paginateRest          // Pagination helpers
   );
   ```

5. **Automatic Retries**
   - 429 (Rate Limit) - Waits and retries
   - 500, 502, 503, 504 (Server Errors) - Exponential backoff
   - Network errors - Retry with backoff

**GitHub API Features Used:**

```typescript
// 1. Code Search
await octokit.rest.search.code({
  q: 'useState repo:facebook/react extension:ts',
  per_page: 30,
  page: 1,
});

// 2. Repository Search
await octokit.rest.search.repos({
  q: 'react state management stars:>1000',
  sort: 'stars',
  order: 'desc',
});

// 3. File Content
await octokit.rest.repos.getContent({
  owner: 'facebook',
  repo: 'react',
  path: 'packages/react/src/React.js',
  ref: 'main',
});

// 4. Repository Structure
await octokit.rest.git.getTree({
  owner: 'facebook',
  repo: 'react',
  tree_sha: 'main',
  recursive: 'true',
});

// 5. Pull Requests
await octokit.rest.search.issuesAndPullRequests({
  q: 'is:pr repo:facebook/react state:closed',
});

// 6. User Info (for authentication check)
await octokit.rest.users.getAuthenticated();
```

**Rate Limit Handling:**

GitHub API has rate limits:
- **Authenticated**: 5,000 requests/hour
- **Search API**: 30 requests/minute
- **Unauthenticated**: 60 requests/hour

Octokit's throttling plugin automatically:
- Monitors remaining quota
- Pauses requests when limit reached
- Resumes after reset time
- Logs warnings for debugging

---

### GitLab Integration

**@gitbeaker/rest 43.8.0**

**Why GitBeaker:**

1. **Official GitLab Client**
   - Maintained by GitLab community
   - Full API coverage
   - Regular updates

2. **Similar API to Octokit**
   ```typescript
   import { Gitlab } from '@gitbeaker/rest';

   const gitlab = new Gitlab({
     host: 'https://gitlab.com',
     token: process.env.GITLAB_TOKEN,
   });

   // Similar patterns to Octokit
   const projects = await gitlab.Projects.search('react');
   const files = await gitlab.RepositoryFiles.show(
     projectId,
     'src/App.tsx',
     'main'
   );
   ```

3. **Self-Hosted Support**
   ```typescript
   // GitLab SaaS
   const gitlab = new Gitlab({
     host: 'https://gitlab.com',
     token: token,
   });

   // Self-hosted GitLab
   const gitlab = new Gitlab({
     host: 'https://gitlab.company.com',
     token: token,
   });
   ```

4. **Comprehensive Features**
   - Project search
   - Code search
   - File operations
   - Merge request handling
   - User authentication

**GitLab API Features Used:**

```typescript
// 1. Project Search
await gitlab.Projects.search('react', {
  order_by: 'stars',
  sort: 'desc',
});

// 2. Code Search
await gitlab.Search.all('global', 'useState', {
  scope: 'blobs',
  search: 'useState',
});

// 3. File Content
await gitlab.RepositoryFiles.show(
  projectId,
  'src/components/App.tsx',
  'main'
);

// 4. Project Tree
await gitlab.Repositories.tree(projectId, {
  ref: 'main',
  recursive: true,
});

// 5. Merge Requests
await gitlab.MergeRequests.all({
  state: 'merged',
  order_by: 'updated_at',
});
```

---

## Schema Validation

### Zod 3.24.0

**Version:** `^3.24.0` (devDependency)

**Why Zod:**

1. **Runtime Type Validation**
   ```typescript
   import { z } from 'zod';

   // Define schema
   const UserSchema = z.object({
     name: z.string().min(1),
     email: z.string().email(),
     age: z.number().positive().optional(),
   });

   // Parse and validate
   const result = UserSchema.safeParse(input);
   if (result.success) {
     console.log(result.data); // Typed as { name: string; email: string; age?: number }
   } else {
     console.error(result.error.errors); // Detailed error messages
   }
   ```

2. **TypeScript Inference**
   ```typescript
   // Schema defines both runtime validation AND compile-time types
   const QuerySchema = z.object({
     owner: z.string(),
     repo: z.string(),
     path: z.string().optional(),
   });

   // Infer TypeScript type from schema
   type Query = z.infer<typeof QuerySchema>;
   // Equivalent to:
   // type Query = {
   //   owner: string;
   //   repo: string;
   //   path?: string;
   // }
   ```

3. **Composable Schemas**
   ```typescript
   // Base query schema
   const BaseQuerySchema = z.object({
     mainResearchGoal: z.string(),
     researchGoal: z.string(),
     reasoning: z.string(),
   });

   // Extend for specific tool
   const GitHubQuerySchema = BaseQuerySchema.extend({
     owner: z.string(),
     repo: z.string(),
     branch: z.string().optional(),
   });

   // Bulk query wrapper
   const BulkQuerySchema = z.object({
     queries: z.array(GitHubQuerySchema).min(1).max(3),
   });
   ```

4. **Custom Validation**
   ```typescript
   const FileContentSchema = z.object({
     path: z.string(),
     fullContent: z.boolean().optional(),
     startLine: z.number().positive().optional(),
     endLine: z.number().positive().optional(),
   }).refine(
     data => {
       // Custom validation: if startLine is set, endLine must also be set
       if (data.startLine && !data.endLine) {
         return false;
       }
       return true;
     },
     {
       message: 'endLine required when startLine is provided',
       path: ['endLine'],
     }
   );
   ```

5. **Transformations**
   ```typescript
   const DateSchema = z.string().transform(str => new Date(str));

   const input = { createdAt: '2024-01-01' };
   const result = DateSchema.parse(input.createdAt);
   // result is Date object, not string
   ```

**Zod in Octocode MCP:**

Every tool uses Zod for input validation:

```typescript
// src/tools/github/codeSearch/scheme.ts
export const GitHubCodeSearchQuerySchema = z.object({
  mainResearchGoal: z.string(),
  researchGoal: z.string(),
  reasoning: z.string(),
  keywordsToSearch: z.array(z.string()).min(1).max(5),
  owner: z.string().optional(),
  repo: z.string().optional(),
  path: z.string().optional(),
  extension: z.string().optional(),
  filename: z.string().optional(),
  match: z.enum(['file', 'path']).optional(),
  limit: z.number().min(1).max(100).default(10),
  page: z.number().min(1).max(10).default(1),
});

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  'githubSearchCode',
  GitHubCodeSearchQuerySchema,
  { maxQueries: 3 }
);

// Usage in tool
const parsed = GitHubCodeSearchBulkQuerySchema.safeParse(args);
if (!parsed.success) {
  return {
    content: [{
      type: 'text',
      text: `Validation error: ${parsed.error.message}`,
    }],
    isError: true,
  };
}
```

**Benefits Over Alternatives:**

vs **Joi**: Zod has better TypeScript integration
vs **Yup**: Zod is more performant and type-safe
vs **Ajv**: Zod is more developer-friendly for TS projects
vs **io-ts**: Zod has simpler API and better error messages

---

## LSP (Language Server Protocol)

### vscode-languageserver-protocol 3.17.5
### vscode-jsonrpc 8.2.1
### vscode-uri 3.1.0
### typescript-language-server 5.1.3

**Why These Packages:**

1. **Standard LSP Implementation**
   ```typescript
   import { createProtocolConnection } from 'vscode-jsonrpc/node.js';
   import {
     InitializeRequest,
     DefinitionRequest,
     ReferencesRequest,
   } from 'vscode-languageserver-protocol';

   // Standard LSP communication
   const connection = createProtocolConnection(reader, writer, logger);

   // Send standard LSP requests
   const result = await connection.sendRequest(DefinitionRequest.type, {
     textDocument: { uri: fileUri },
     position: { line: 10, character: 5 },
   });
   ```

2. **Universal Language Support**
   - TypeScript/JavaScript (typescript-language-server)
   - Python (pylsp)
   - Go (gopls)
   - Rust (rust-analyzer)
   - 40+ other languages

3. **Semantic Code Intelligence**
   ```typescript
   // Go to Definition
   const definitions = await connection.sendRequest(DefinitionRequest.type, {
     textDocument: { uri: 'file:///path/to/file.ts' },
     position: { line: 10, character: 5 },
   });
   // Returns: Definition locations with file and position

   // Find References
   const references = await connection.sendRequest(ReferencesRequest.type, {
     textDocument: { uri: 'file:///path/to/file.ts' },
     position: { line: 10, character: 5 },
     context: { includeDeclaration: true },
   });
   // Returns: All usage locations

   // Call Hierarchy
   const calls = await connection.sendRequest(CallHierarchyIncomingCallsRequest.type, {
     item: callHierarchyItem,
   });
   // Returns: Functions that call this function
   ```

4. **Process Management**
   ```typescript
   import { spawn } from 'child_process';

   // Spawn language server as subprocess
   const serverProcess = spawn('typescript-language-server', ['--stdio']);

   // Create connection over stdio
   const connection = createProtocolConnection(
     new StreamMessageReader(serverProcess.stdout),
     new StreamMessageWriter(serverProcess.stdin),
     logger
   );

   // Clean shutdown
   await connection.sendRequest('shutdown', null);
   await connection.sendNotification('exit', null);
   serverProcess.kill();
   ```

**Supported Language Servers:**

```typescript
// src/lsp/config.ts
export const LANGUAGE_SERVER_COMMANDS: Record<string, LanguageServerCommand> = {
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },
  '.go': {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
    envVar: 'OCTOCODE_GO_SERVER_PATH',
  },
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
    envVar: 'OCTOCODE_RUST_SERVER_PATH',
  },
  // ... 40+ more languages
};
```

---

## HTTP Client and Utilities

### axios 1.13.2

**Version:** `^1.13.2` (devDependency)

**Why Axios:**

1. **Promise-Based API**
   ```typescript
   import axios from 'axios';

   // Simple GET request
   const { data } = await axios.get('https://api.github.com/repos/facebook/react');

   // POST with data
   const { data } = await axios.post('https://api.example.com/users', {
     name: 'John',
     email: 'john@example.com',
   });
   ```

2. **Request/Response Interceptors**
   ```typescript
   // Add auth token to all requests
   axios.interceptors.request.use(config => {
     config.headers.Authorization = `Bearer ${token}`;
     return config;
   });

   // Handle errors globally
   axios.interceptors.response.use(
     response => response,
     error => {
       if (error.response?.status === 401) {
         // Handle unauthorized
       }
       throw error;
     }
   );
   ```

3. **Automatic Retries**
   ```typescript
   import axios from 'axios';
   import axiosRetry from 'axios-retry';

   axiosRetry(axios, {
     retries: 3,
     retryDelay: axiosRetry.exponentialDelay,
     retryCondition: error => {
       return error.response?.status >= 500;
     },
   });
   ```

4. **Timeout Support**
   ```typescript
   const { data } = await axios.get('https://api.example.com/slow', {
     timeout: 30000, // 30 seconds
   });
   ```

**Used For:**
- NPM package registry API calls
- PyPI package registry API calls
- External API requests (non-Octokit/GitBeaker)

---

### node-cache 5.1.2

**Version:** `^5.1.2` (devDependency)

**Why node-cache:**

1. **Simple In-Memory Caching**
   ```typescript
   import NodeCache from 'node-cache';

   const cache = new NodeCache({
     stdTTL: 3600,      // Default 1 hour TTL
     checkperiod: 600,  // Check for expired keys every 10 minutes
     useClones: false,  // Performance optimization
   });

   // Set with custom TTL
   cache.set('key', value, 7200); // 2 hours

   // Get
   const value = cache.get('key');

   // Check existence
   if (cache.has('key')) {
     // ...
   }
   ```

2. **Automatic Expiration**
   - Keys expire after TTL
   - Background cleanup process
   - No manual expiration handling needed

3. **TTL Per Cache Prefix**
   ```typescript
   const CACHE_TTL_CONFIG = {
     'gh-api-code': 3600,              // 1 hour
     'gh-api-repos': 7200,             // 2 hours
     'gh-api-prs': 1800,               // 30 minutes
     'gh-api-file-content': 3600,      // 1 hour
     'npm-search': 14400,              // 4 hours
     'pypi-search': 14400,             // 4 hours
     'default': 86400,                 // 24 hours
   };

   function getTTL(prefix: string): number {
     return CACHE_TTL_CONFIG[prefix] ?? CACHE_TTL_CONFIG.default;
   }
   ```

4. **Statistics**
   ```typescript
   const stats = cache.getStats();
   console.log({
     hits: stats.hits,
     misses: stats.misses,
     keys: stats.keys,
     hitRate: stats.hits / (stats.hits + stats.misses),
   });
   ```

**Cache Strategy:**

```typescript
// src/utils/http/cache.ts
const VERSION = 'v1';

// Version-prefixed keys for cache invalidation
function getCacheKey(prefix: string, params: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');
  return `${VERSION}-${prefix}:${hash}`;
}

// Deduplication of pending requests
const pendingRequests = new Map<string, Promise<any>>();

export async function cachedRequest<T>(
  prefix: string,
  params: unknown,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = getCacheKey(prefix, params);

  // Check cache first
  const cached = cache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  // Check pending requests (deduplication)
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending;
  }

  // Execute request
  const promise = fetcher();
  pendingRequests.set(key, promise);

  try {
    const result = await promise;
    cache.set(key, result, getTTL(prefix));
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}
```

---

## Content Processing

### terser 5.44.1
### clean-css 5.3.3
### html-minifier-terser 7.2.0

**Why Minification:**

Token reduction for AI assistants. Every character saved = reduced API costs and faster responses.

**1. JavaScript/TypeScript Minification (Terser)**

```typescript
import { minify } from 'terser';

const original = `
function calculateTotal(items) {
  // Calculate the total price
  return items.reduce((sum, item) => {
    return sum + item.price;
  }, 0);
}
`;

const { code } = await minify(original, {
  compress: {
    dead_code: true,
    drop_console: false,
    drop_debugger: true,
  },
  mangle: {
    toplevel: true,
  },
});

// Result: "function calculateTotal(e){return e.reduce(((e,t)=>e+t.price),0)}"
```

**Benefits:**
- Removes comments (documentation stays in original)
- Removes whitespace
- Shortens variable names (when safe)
- Removes dead code
- **Token Reduction: 40-60%**

**2. CSS Minification (CleanCSS)**

```typescript
import CleanCSS from 'clean-css';

const original = `
.button {
  padding: 10px 20px;
  background-color: #007bff;
  border: none;
  border-radius: 4px;
}
`;

const output = new CleanCSS({}).minify(original);
// Result: ".button{padding:10px 20px;background-color:#007bff;border:none;border-radius:4px}"
```

**3. HTML Minification (html-minifier-terser)**

```typescript
import { minify } from 'html-minifier-terser';

const original = `
<div class="container">
  <h1>Hello World</h1>
  <p>This is a paragraph.</p>
</div>
`;

const result = await minify(original, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
});
// Result: "<div class=container><h1>Hello World</h1><p>This is a paragraph.</p></div>"
```

**Configuration:**

```typescript
// src/utils/minifier/index.ts
export async function minifyContent(
  content: string,
  type: 'js' | 'ts' | 'css' | 'html'
): Promise<string> {
  switch (type) {
    case 'js':
    case 'ts':
      return minifyJavaScript(content);
    case 'css':
      return minifyCSS(content);
    case 'html':
      return minifyHTML(content);
    default:
      return content;
  }
}
```

---

### js-yaml 4.1.1

**Why js-yaml:**

1. **YAML Parsing**
   ```typescript
   import yaml from 'js-yaml';

   // Parse YAML to JavaScript object
   const config = yaml.load(`
     github:
       token: ${process.env.GITHUB_TOKEN}
       timeout: 30000
     gitlab:
       host: https://gitlab.com
   `);
   ```

2. **YAML Output**
   ```typescript
   // Format results as YAML (more readable than JSON for AI)
   const output = yaml.dump({
     results: searchResults,
     metadata: {
       total: 100,
       page: 1,
     },
   });
   ```

3. **LSP Config Files**
   ```yaml
   # .octocode/lsp-servers.json (actually YAML)
   languageServers:
     .ts:
       command: /usr/local/bin/typescript-language-server
       args:
         - --stdio
       languageId: typescript
   ```

---

## Build Tools

### tsdown 0.18.3

**Version:** `^0.18.3` (devDependency)

**Why tsdown:**

1. **Fast TypeScript Bundler**
   - Powered by esbuild
   - 10-100x faster than tsc
   - Zero config for most projects

2. **Single File Output**
   ```bash
   tsdown src/index.ts
   # Produces: dist/index.js (single file with all dependencies)
   ```

3. **Multiple Entry Points**
   ```json
   {
     "scripts": {
       "build": "tsdown"
     },
     "tsdown": {
       "entry": ["src/index.ts", "src/public.ts"]
     }
   }
   ```

4. **Format Support**
   - ESM (import/export)
   - CommonJS (require/module.exports)
   - IIFE (browser bundles)

**Build Process:**

```bash
# 1. Lint
eslint src tests

# 2. Type check
tsc --noEmit

# 3. Test
vitest run --coverage

# 4. Clean
rm -rf dist/

# 5. Bundle
tsdown

# 6. Generate type definitions
tsc -p tsconfig.build.json

# Result:
# dist/index.js - Main entry point (bundled)
# dist/public.js - Public API (bundled)
# dist/*.d.ts - Type definitions
```

---

### vitest 4.0.16

**Version:** `^4.0.16` (devDependency)

**Why Vitest:**

1. **Vite-Powered Testing**
   - Extremely fast (uses Vite's transform pipeline)
   - ESM native (no transpilation needed)
   - TypeScript support out of the box

2. **Jest-Compatible API**
   ```typescript
   import { describe, it, expect, beforeEach, vi } from 'vitest';

   describe('GitHubProvider', () => {
     let provider: GitHubProvider;

     beforeEach(() => {
       provider = new GitHubProvider(config);
     });

     it('should search code', async () => {
       const results = await provider.searchCode(query);
       expect(results).toHaveLength(10);
     });

     it('should handle errors', async () => {
       vi.spyOn(octokit, 'search').mockRejectedValue(new Error('API Error'));
       await expect(provider.searchCode(query)).rejects.toThrow('API Error');
     });
   });
   ```

3. **Coverage Reports**
   ```bash
   vitest run --coverage
   # Generates coverage/index.html
   ```

4. **Watch Mode**
   ```bash
   vitest --watch
   # Re-runs tests on file changes
   ```

5. **UI Mode**
   ```bash
   vitest --ui
   # Opens browser with test results visualization
   ```

---

### eslint 9.18.0

**Version:** `^9.18.0` (devDependency)

**Why ESLint:**

1. **Code Quality**
   - Catches common bugs
   - Enforces best practices
   - Consistent code style

2. **TypeScript Support**
   ```javascript
   // eslint.config.js
   import tseslint from '@typescript-eslint/eslint-plugin';

   export default [
     {
       files: ['**/*.ts'],
       plugins: { '@typescript-eslint': tseslint },
       rules: {
         '@typescript-eslint/no-unused-vars': 'error',
         '@typescript-eslint/no-explicit-any': 'warn',
       },
     },
   ];
   ```

3. **Auto-Fix**
   ```bash
   eslint --fix src/
   # Automatically fixes issues like:
   # - Missing semicolons
   # - Incorrect indentation
   # - Unused imports
   ```

---

## System Dependencies

### Required (for local tools)

**1. ripgrep (rg)**
```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep

# Windows
choco install ripgrep

# Check installation
rg --version
```

Used by: `localSearchCode` tool

**2. find command**
```bash
# Usually pre-installed on Unix/Linux/macOS
# Windows: Use Git Bash or WSL

# Check installation
find --version
```

Used by: `localFindFiles` tool

### Optional (for LSP tools)

**Language Servers (install as needed):**

```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer

# Check installation
typescript-language-server --version
pylsp --version
gopls version
rust-analyzer --version
```

---

## Version Management

### Package Lock Files

**package.json** - Main dependency manifest
**yarn.lock** / **package-lock.json** - Exact versions

```json
{
  "engines": {
    "node": ">=20.0.0"
  },
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^1.25.2",  // Caret: Minor updates allowed
    "octokit": "^5.0.5",                      // Caret: Minor updates allowed
    "typescript": "^5.9.3",                   // Caret: Minor updates allowed
    "zod": "^3.24.0"                          // Caret: Minor updates allowed
  }
}
```

**Update Strategy:**
- **Patch updates** (5.0.5 → 5.0.6): Automatic (bug fixes only)
- **Minor updates** (5.0.5 → 5.1.0): Automatic (new features, backward compatible)
- **Major updates** (5.0.5 → 6.0.0): Manual (breaking changes)

---

## Dependency Rationale Summary

| Dependency | Purpose | Why This One? |
|------------|---------|---------------|
| Node.js 20+ | Runtime | ESM support, performance, security |
| TypeScript 5.9 | Type safety | Best-in-class type system |
| MCP SDK 1.25 | MCP protocol | Official implementation |
| Octokit 5.0 | GitHub API | Official client, type-safe |
| GitBeaker 43.8 | GitLab API | Comprehensive, similar to Octokit |
| Zod 3.24 | Validation | TypeScript inference, composability |
| vscode-lsp | LSP protocol | Standard implementation |
| Axios 1.13 | HTTP client | Promise-based, interceptors |
| node-cache 5.1 | Caching | Simple, TTL support, statistics |
| Terser 5.44 | JS minification | Token reduction for AI |
| tsdown 0.18 | Build tool | Fast, single-file bundles |
| Vitest 4.0 | Testing | Fast, ESM native, Jest-compatible |
| ESLint 9.18 | Linting | Industry standard, TypeScript support |

---

## Installation Requirements

### Minimum System Requirements

- **Operating System**: macOS, Linux, Windows (WSL recommended)
- **Node.js**: >= 20.0.0
- **Memory**: 512 MB RAM (recommended: 1 GB)
- **Disk Space**: 200 MB for dependencies

### Optional System Requirements

- **ripgrep**: For local code search (localSearchCode)
- **find**: For local file finding (localFindFiles)
- **Language Servers**: For LSP tools (lspGotoDefinition, lspFindReferences, lspCallHierarchy)
- **GitHub CLI**: For GitHub authentication (recommended)

---

## Future Technology Considerations

### Potential Additions

**PostgreSQL/Redis** - Persistent caching
- Pro: Survives server restarts
- Con: Additional infrastructure required

**WebSocket Transport** - Alternative to stdio
- Pro: Better for web-based clients
- Con: MCP spec currently focuses on stdio

**gRPC** - High-performance RPC
- Pro: Faster than JSON-RPC
- Con: More complex, not standard for MCP

**Docker** - Containerized deployment
- Pro: Easy distribution, isolated environment
- Con: Overhead, less flexible

### Potential Removals

**Axios** - Could be replaced with native fetch
- Pro: One less dependency
- Con: Fetch API lacks some features (interceptors)

**js-yaml** - Could use JSON-only output
- Pro: Simpler
- Con: YAML is more readable for AI

---

## Conclusion

Octocode MCP's technical stack is carefully curated for:

1. **Performance** - Fast builds, efficient execution, intelligent caching
2. **Type Safety** - TypeScript + Zod catch errors at compile time and runtime
3. **Developer Experience** - Modern tools, great debugging, comprehensive documentation
4. **Reliability** - Battle-tested libraries, proper error handling, graceful degradation
5. **Extensibility** - Clean abstractions, plugin patterns, configurable components

Every dependency serves a specific purpose and has been chosen over alternatives for clear technical reasons. The stack enables Octocode MCP to be a robust, maintainable, and performant MCP server for AI assistants.

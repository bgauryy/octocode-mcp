# Octocode Local Server

Local MCP server with OAuth authentication for GitHub code analysis tools.

## 🚀 TL;DR

**What**: HTTP-based MCP server that provides authenticated GitHub API access through OAuth  
**Why**: Bypass GitHub API rate limits (5K/hour → 60K/hour) + private repo access  
**How**: Express server + OAuth middleware + MCP protocol integration  

**Quick Start**:
```bash
yarn install && yarn build && yarn dev  # → http://localhost:3000
```

**Features**: Full GitHub analysis suite • OAuth via [`mcp-s-oauth`](https://www.npmjs.com/package/mcp-s-oauth) • Express endpoints • Enterprise features

### References
- **MCP Protocol**: [Model Context Protocol](https://modelcontextprotocol.io)
- **OAuth Library**: [`mcp-s-oauth`](https://www.npmjs.com/package/mcp-s-oauth) - Universal OAuth middleware
- **Core Tools**: [`octocode-mcp`](../octocode-mcp) - GitHub analysis tools
- **Authentication**: GitHub OAuth App ([setup guide](#oauth-setup))

## Configuration

### Environment Variables (`.env`)

```env
# Server
PORT=3000
HOST=localhost
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# GitHub OAuth (optional - enables higher API limits)
GITHUB_CLIENT_ID=your_oauth_client_id  # From https://github.com/settings/developers
GITHUB_CLIENT_SECRET=your_oauth_secret
BASE_URL=http://localhost:3000         # OAuth callback base
REQUIRE_OAUTH=false                    # Enforce OAuth (default: false)

# Optional Features
ENABLE_API_EXPLORER=true               # Development endpoints
ENABLE_METRICS=true
BETA=false                             # Enable sampling capabilities
NODE_ENV=development

# Enterprise (optional)
AUDIT_ALL_ACCESS=false
RATE_LIMIT_API_HOUR=1000
RATE_LIMIT_AUTH_HOUR=100
RATE_LIMIT_TOKEN_HOUR=500
```

### MCP Client Configuration

Configure your MCP client to connect to the local server:

```json
// ~/.cursor/mcp.json or similar
{
  "mcpServers": {
    "octocode-local": {
      "url": "http://localhost:3000"
    }
  }
}
```

**With OAuth enabled**, the client handles the OAuth flow automatically:
- First request → GitHub OAuth redirect
- After auth → normal MCP operations with authenticated GitHub API access

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/status` | Server status + environment info |
| `GET /api/explorer` | API documentation (dev mode) |
| `GET /metrics` | Performance metrics (dev mode) |
| `POST /` | **MCP Protocol** (OAuth protected if enabled) |
| `GET /auth/github` | Start OAuth flow |
| `GET /auth/github/callback` | OAuth callback |

### OAuth Setup

1. **GitHub OAuth App**: Create at https://github.com/settings/developers
   - Callback URL: `http://localhost:3000/oauth/callback`
2. **Environment**: Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env`
3. **Benefits**: Higher API rate limits (60K/hour) + private repo access

## Development

### Scripts
```bash
yarn build          # Production build with linting
yarn build:dev      # Development build
yarn build:watch    # Watch mode
yarn dev           # Development server
yarn test          # Run tests
yarn lint          # Lint code
```

### Dependencies
- **Core**: `octocode-mcp` (workspace), `@modelcontextprotocol/sdk`
- **OAuth**: `mcp-s-oauth` 
- **Server**: `express`, `cors`, `helmet`, `compression`

### Adding Features
1. Extend server routes in `setupRoutes()`
2. Update environment config
3. Add tests

---

# 🔧 Advanced Configuration & Technical Deep-Dive

> **Note**: This section covers advanced configuration, architecture details, and enterprise deployment. For basic usage, see sections above.

### Advanced Environment Variables

```env
# =============================================================================
# ADVANCED SERVER CONFIGURATION
# =============================================================================

# Express server tuning
EXPRESS_TRUST_PROXY=false                    # Trust proxy headers
REQUEST_BODY_LIMIT=10mb                      # Max request body size
REQUEST_TIMEOUT=30000                        # Request timeout (ms)
KEEP_ALIVE_TIMEOUT=5000                      # Keep-alive timeout

# Security hardening
CSP_DIRECTIVES={"defaultSrc":["'self'"]}     # Custom CSP directives
RATE_LIMIT_WINDOW_MS=3600000                 # Rate limit window (1 hour)
RATE_LIMIT_SKIP_FAILED_REQUESTS=true        # Skip failed requests in count

# Session management
SESSION_CLEANUP_INTERVAL=300000              # Session cleanup interval (5 min)
SESSION_MAX_AGE=86400000                     # Max session age (24 hours)
TOKEN_REFRESH_THRESHOLD=300000               # Refresh tokens 5min before expiry

# Performance optimization
CACHE_TTL=86400000                           # Cache TTL (24 hours)
CACHE_MAX_KEYS=1000                          # Maximum cache entries
ENABLE_GZIP=true                             # Enable gzip compression
ENABLE_ETAG=true                             # Enable ETag headers
```

## Technical Architecture

### System Architecture
- **Transport**: `StreamableHTTPServerTransport` with session-based connection management
- **Server Implementation**: Full MCP server with tool registration and request handling  
- **Session Persistence**: OAuth sessions maintained in memory with automatic cleanup
- **Protocol Compliance**: Implements MCP 1.0 specification with streaming HTTP transport

### OAuth Implementation (mcp-s-oauth)
```typescript
// Core OAuth configuration
const oauthConfig: McpOAuthConfig = {
  baseUrl: process.env.BASE_URL || `http://${host}:${port}`,
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  connector: githubConnector
};

// Session-based MCP handler
const mcpHandler = async (req: express.Request, res: express.Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: sessionId => {
      transports[sessionId] = transport;
    }
  });
  
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
};
```

### Tool Registration & Execution
- **Dynamic Registration**: Tools registered via `octocodeRegisterAllTools(server)`
- **Request Processing**: `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
- **Authentication Context**: OAuth tokens passed to tool implementations
- **Error Handling**: Comprehensive error recovery with graceful degradation

### mcp-s-oauth Integration

Uses [mcp-s-oauth](https://www.npmjs.com/package/mcp-s-oauth) - Universal OAuth middleware for MCP servers.

**Key Features**:
- Universal OAuth support (20+ providers including GitHub, Google, Slack)
- Session management via MCP SDK
- Automatic token refresh
- Minimal OAuth scopes for security

**Implementation**:
```typescript
import { McpOAuth, githubConnector } from 'mcp-s-oauth';

const config = {
  baseUrl: process.env.BASE_URL,
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  connector: githubConnector
};

const mcpOAuth = McpOAuth(config, mcpHandler);
app.use('/', mcpOAuth.router);
```

### Custom OAuth Connectors

Create custom OAuth connectors for additional providers:

```typescript
import type { Connector } from 'mcp-s-oauth';

const customConnector: Connector = {
  authUrl: "https://provider.com/oauth/authorize",
  tokenUrl: "https://provider.com/oauth/token", 
  refreshTokenUrl: "https://provider.com/oauth/refresh",
  scopes: ["read", "write"],
  codeExchangeConfig: {
    isForm: true,
    modelCredentialsMapping: (tokenResponse) => ({
      access_token: tokenResponse.access_token,
      expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
      refresh_token: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
      token_type: "Bearer"
    })
  },
  authInitUrlParams: {
    prompt: "consent",
    access_type: "offline"
  }
};
```

### Advanced Security Configuration

#### Content Security Policy
```typescript
// Custom CSP configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));
```

#### Rate Limiting Strategy
```typescript
// Advanced rate limiting
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000,
  max: {
    api: parseInt(process.env.RATE_LIMIT_API_HOUR) || 1000,
    auth: parseInt(process.env.RATE_LIMIT_AUTH_HOUR) || 100,
    token: parseInt(process.env.RATE_LIMIT_TOKEN_HOUR) || 500
  },
  keyGenerator: (req) => `${req.ip}:${req.path}`,
  skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS === 'true'
});
```

### Performance Optimization

#### Caching Strategy
```typescript
// Multi-layer caching
const cacheConfig = {
  // L1: In-memory cache for frequently accessed data
  memory: {
    ttl: 300000,  // 5 minutes
    maxKeys: 100
  },
  // L2: Longer-term cache for expensive operations
  persistent: {
    ttl: 86400000,  // 24 hours
    maxKeys: 1000
  }
};
```

#### Connection Pooling
```typescript
// GitHub API connection pooling
const githubApiConfig = {
  timeout: 30000,
  pool: {
    maxSockets: 50,
    keepAlive: true,
    keepAliveMsecs: 1000
  },
  retry: {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000
  }
};
```

### Monitoring & Observability

#### Health Check Configuration
```typescript
// Advanced health checks
const healthChecks = {
  database: async () => {
    // Check database connectivity
    return { status: 'up', responseTime: '< 10ms' };
  },
  github: async () => {
    // Check GitHub API availability
    const start = Date.now();
    await fetch('https://api.github.com/rate_limit');
    return { status: 'up', responseTime: `${Date.now() - start}ms` };
  },
  memory: () => {
    const usage = process.memoryUsage();
    return {
      status: usage.heapUsed < 500 * 1024 * 1024 ? 'up' : 'degraded',
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
    };
  }
};
```

#### Metrics Collection
```typescript
// Custom metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requests: {
      total: requestCounter.total,
      success: requestCounter.success,
      errors: requestCounter.errors
    },
    oauth: {
      activeSessions: Object.keys(transports).length,
      tokenRefreshes: oauthMetrics.refreshes,
      authFailures: oauthMetrics.failures
    },
    github: {
      apiCalls: githubMetrics.calls,
      rateLimitRemaining: githubMetrics.rateLimit,
      cacheHitRate: githubMetrics.cacheHitRate
    },
    performance: {
      avgResponseTime: performanceMetrics.avgResponseTime,
      p95ResponseTime: performanceMetrics.p95ResponseTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
  };
  res.json(metrics);
});
```

### Integration Patterns

#### Docker Deployment
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY .env ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

USER node
CMD ["node", "dist/server.js"]
```

#### Kubernetes Configuration
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: octocode-local-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: octocode-local-server
  template:
    spec:
      containers:
      - name: server
        image: octocode-local-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: GITHUB_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: oauth-credentials
              key: client-id
        - name: GITHUB_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: oauth-credentials
              key: client-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Troubleshooting & Debugging

#### Debug Mode
```bash
# Enable comprehensive debugging
DEBUG=mcp:*,oauth:*,express:* NODE_ENV=development yarn dev

# GitHub API debugging
DEBUG=github:api,github:auth yarn dev

# OAuth flow debugging
DEBUG=oauth:flow,oauth:session yarn dev
```

#### Common Issues & Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| OAuth callback mismatch | `redirect_uri_mismatch` error | Verify callback URL matches GitHub OAuth app |
| Session not persisting | Re-authentication on every request | Check `BASE_URL` and cookie settings |
| Rate limit exceeded | `403 Forbidden` from GitHub | Implement exponential backoff or use OAuth |
| Memory leaks | Increasing memory usage | Enable session cleanup and connection pooling |
| Slow response times | High latency | Optimize caching and connection pooling |

#### Production Monitoring
```typescript
// Production error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // 1. Stop accepting new connections
  server.close();
  
  // 2. Close all MCP transports
  await Promise.all(Object.values(transports).map(t => t.close()));
  
  // 3. Clear caches and cleanup
  clearAllCache();
  SecureCredentialStore.clearAll();
  
  // 4. Exit process
  process.exit(0);
};
```

### Security Best Practices

#### OAuth Security
- **Minimal Scopes**: Request only necessary GitHub scopes
- **Token Rotation**: Implement automatic token refresh
- **Secure Storage**: Store tokens securely with encryption
- **PKCE Support**: Use PKCE for public OAuth clients

#### API Security
- **Input Validation**: Validate all MCP requests and parameters
- **Output Sanitization**: Sanitize all API responses
- **Rate Limiting**: Implement per-client rate limiting
- **Audit Logging**: Log all authentication and API access events

#### Infrastructure Security
- **TLS Termination**: Use HTTPS in production
- **Secret Management**: Use environment variables or secret management systems
- **Network Security**: Implement firewall rules and VPN access
- **Regular Updates**: Keep dependencies and base images updated

---
**License**: MIT

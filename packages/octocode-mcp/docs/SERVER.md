# 🌐 HTTP Server Mode Guide

**Octocode-MCP HTTP Server** provides a production-ready web server with OAuth 2.0 authentication, session management, and scalable multi-user support. This guide covers everything you need to know about deploying and using the HTTP server mode.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [OAuth 2.0 Integration](#oauth-20-integration)
- [Session Management](#session-management)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Security](#security)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The HTTP server mode (`server.ts`) transforms Octocode-MCP into a web-ready service with:

- **🔐 OAuth 2.0 Authentication**: Seamless GitHub OAuth integration via `mcp-s-oauth`
- **👥 Multi-User Support**: Session-based user management
- **🌐 Web-Ready**: Express.js server with HTTP/WebSocket transport
- **🔄 Auto Token Refresh**: Automatic OAuth token renewal
- **📊 Session Tracking**: Comprehensive audit logging and session management
- **⚡ Production Ready**: Enterprise-grade security and monitoring

### Key Differences from Stdio Mode

| Feature | Stdio Mode | HTTP Mode |
|---------|------------|-----------|
| **Transport** | stdin/stdout | HTTP/WebSocket |
| **Authentication** | Token fallback chain | OAuth 2.0 flow |
| **Users** | Single user | Multi-user sessions |
| **Setup** | Simple CLI | Web server configuration |
| **UI** | Terminal/CLI | Web-based OAuth flow |
| **Scalability** | Local only | Cloud/production ready |

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### 2. GitHub OAuth App Setup

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Configure your app:
   - **Application name**: `Your App Name`
   - **Homepage URL**: `https://yourapp.com` (or `http://localhost:3000` for local)
   - **Authorization callback URL**: `https://yourapp.com/auth/callback`

### 3. Environment Configuration

```bash
# Required OAuth credentials
export GITHUB_CLIENT_ID="your_github_client_id"
export GITHUB_CLIENT_SECRET="your_github_client_secret"

# Optional configuration
export BASE_URL="https://yourapp.com"  # Default: http://localhost:3000
export PORT="3000"                     # Default: 3000

# Enterprise features (optional)
export AUDIT_ALL_ACCESS="true"
export GITHUB_ORGANIZATION="your-org"
```

### 4. Start the Server

```bash
# Start HTTP server
npx octocode-mcp-server
# or
node dist/server.js

# Server will be available at:
# http://localhost:3000/
```

### 5. Test OAuth Flow

1. Visit `http://localhost:3000/`
2. You'll be redirected to GitHub for authorization
3. After authorization, you'll be redirected back with an active session
4. The MCP server is now ready to handle requests with your GitHub token

## 🏗️ Architecture

### Core Components

```mermaid
graph TD
    A[Express App] --> B[mcp-s-oauth Middleware]
    B --> C[OAuth Flow Handler]
    C --> D[Session Manager]
    D --> E[MCP Server Instance]
    E --> F[Tool Registration]
    F --> G[StreamableHTTPServerTransport]
    
    B --> B1[GitHub OAuth Connector]
    B --> B2[Token Storage]
    B --> B3[Session Persistence]
    
    E --> E1[GitHub Search Code]
    E --> E2[GitHub Fetch Content]
    E --> E3[GitHub Search Repos]
    E --> E4[Package Search]
    E --> E5[All Other Tools]
```

### Complete Request Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant E as Express Server
    participant O as mcp-s-oauth
    participant G as GitHub OAuth
    participant S as SecureCredentialStore
    participant T as StreamableHTTPServerTransport
    participant M as MCP Server
    participant Tools as GitHub Tools

    Note over U,Tools: Initial Authentication Flow
    U->>E: GET /
    E->>O: Check authentication status
    O-->>U: Redirect to GitHub OAuth (if not authenticated)
    U->>G: Authorize application
    G->>O: OAuth callback with authorization code
    O->>G: Exchange code for access token
    G->>O: Return access token + refresh token
    O->>S: Store encrypted tokens
    
    Note over U,Tools: MCP Session Creation
    O->>E: Authentication complete
    E->>T: Create StreamableHTTPServerTransport
    T->>T: Generate UUID session ID
    T->>M: Create new MCP Server instance
    M->>M: Register all GitHub tools
    M->>T: Connect server to transport
    
    Note over U,Tools: MCP Tool Execution
    U->>E: POST /mcp (with session header)
    E->>T: Route to session transport
    T->>M: Forward MCP request
    M->>Tools: Execute tool with session context
    Tools->>S: Retrieve encrypted GitHub token
    S->>Tools: Return decrypted token
    Tools->>G: Make authenticated GitHub API call
    G->>Tools: Return API response
    Tools->>M: Return processed results
    M->>T: Send MCP response
    T->>E: HTTP response
    E->>U: Return results
    
    Note over U,Tools: Token Refresh (when needed)
    Tools->>S: Check token expiration
    S->>O: Trigger token refresh
    O->>G: Use refresh token
    G->>O: Return new access token
    O->>S: Store new encrypted token
```

## 🔐 OAuth 2.0 Integration

### mcp-s-oauth Package

The HTTP server uses the [`mcp-s-oauth`](https://www.npmjs.com/package/mcp-s-oauth) package for seamless OAuth integration. This package provides a complete OAuth 2.0 middleware solution that handles the entire authentication flow automatically.

```typescript
import { McpOAuth, type McpOAuthConfig, githubConnector } from 'mcp-s-oauth';

// Minimal OAuth configuration required
const config: McpOAuthConfig = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  connector: githubConnector,  // Pre-configured GitHub connector
};

// Create OAuth middleware with MCP handler
const mcpOAuth = McpOAuth(config, mcpHandler);

// Mount OAuth middleware - handles all OAuth routes automatically
app.use('/', mcpOAuth.router);
```

### OAuth Configuration Details

| Property | Required | Description | Example |
|----------|----------|-------------|---------|
| `baseUrl` | Yes | Your application's base URL | `https://yourapp.com` |
| `clientId` | Yes | GitHub OAuth App Client ID | From GitHub OAuth App settings |
| `clientSecret` | Yes | GitHub OAuth App Client Secret | From GitHub OAuth App settings |
| `connector` | Yes | OAuth provider connector | `githubConnector` (pre-configured) |

### Detailed Setup Guide

#### 1. Register GitHub OAuth App

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Configure your app:
   - **Application name**: Your app name
   - **Homepage URL**: `https://yourapp.com` (or `http://localhost:3000` for local)
   - **Authorization callback URL**: `https://yourapp.com/auth/callback`

#### 2. Configure Environment Variables

```bash
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"
export BASE_URL="https://yourapp.com"  # Your app's base URL
export PORT="3000"  # Optional: server port (default: 3000)
```

#### 3. Start HTTP Server

```bash
# The server.ts automatically configures mcp-s-oauth
npx octocode-mcp-server
# or
node dist/server.js

# Server will be available at:
# - Main app: http://localhost:3000/
# - OAuth flow: http://localhost:3000/auth/login
# - Callback: http://localhost:3000/auth/callback
```

#### 4. OAuth Flow is Automatic

The `mcp-s-oauth` package handles the complete OAuth flow:
- User visits your app
- Redirected to GitHub for authorization
- GitHub redirects back with authorization code
- Token exchange happens automatically
- User session is established with MCP server

#### OAuth Authorization Code with PKCE Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client (Your App)
    participant G as GitHub OAuth Server

    C->>C: Generate state + PKCE (code_verifier, code_challenge)
    C->>U: Redirect to GitHub authorize URL
    U->>G: Authorize application
    G-->>U: Redirect back with code (+ state)
    U-->>C: Browser sends code to redirect_uri
    C->>C: Validate state
    C->>G: Exchange code + code_verifier for tokens
    G-->>C: Access token (+ refresh token)
    C->>C: Store tokens securely (SecureCredentialStore)
    C->>GitHub API: Call API with Bearer access_token
    GitHub API-->>C: Protected resources
    C-->>U: Operation successful
```

### OAuth Endpoints

The `mcp-s-oauth` package automatically provides these endpoints:

| Endpoint | Method | Purpose | Description |
|----------|--------|---------|-------------|
| `/` | GET | Main entry | Redirects to OAuth if not authenticated |
| `/auth/login` | GET | OAuth initiation | Starts GitHub OAuth flow |
| `/auth/callback` | GET | OAuth callback | Handles GitHub OAuth response |
| `/auth/logout` | GET/POST | Logout | Clears session and tokens |
| `/mcp` | POST | MCP requests | Handles authenticated MCP tool requests |

### Token Management & Security

OAuth tokens are managed through a sophisticated multi-layer security system:

#### **Secure Token Storage**
- **Encryption**: AES-256-GCM encryption for all stored tokens
- **Memory Protection**: Encrypted storage prevents plain-text exposure
- **Automatic Cleanup**: Tokens cleared on process exit
- **Unique Identifiers**: UUID-based credential identification

#### **Token Lifecycle**
- **Acquisition**: Automatic token exchange during OAuth callback
- **Storage**: Encrypted storage in `SecureCredentialStore`
- **Refresh**: Automatic token refresh before expiration
- **Validation**: Token validation on each MCP request
- **Cleanup**: Automatic cleanup of expired tokens

#### **GitHub Scopes**
The system automatically requests these GitHub scopes:
- `repo`: Full repository access (read/write)
- `read:user`: User profile information
- `read:org`: Organization membership (for enterprise features)

### Complete OAuth 2.0 Token Flow

#### **1. Authorization Code Flow**
```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant A as Your App
    participant G as GitHub
    participant S as SecureCredentialStore

    Note over U,S: OAuth 2.0 Authorization Code Flow
    U->>B: Visit your app
    B->>A: GET /
    A->>A: Check authentication
    A-->>B: Redirect to GitHub OAuth
    B->>G: GET /login/oauth/authorize
    Note over G: User sees GitHub authorization page
    U->>G: Authorize application
    G->>B: Redirect with authorization code
    B->>A: GET /auth/callback?code=...
    A->>G: POST /login/oauth/access_token
    Note over A,G: Exchange code for tokens
    G->>A: Return access_token + refresh_token
    A->>S: Store encrypted tokens
    A->>B: Authentication complete
```

#### **2. Token Storage & Encryption**
```typescript
// Tokens are stored with AES-256-GCM encryption
interface StoredCredential {
  encrypted: string;      // AES-256-GCM encrypted token
  iv: string;            // Initialization vector
  authTag: string;       // Authentication tag
  timestamp: number;     // Storage timestamp
}

// Token storage process
const credentialId = crypto.randomUUID();
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
cipher.setAAD(Buffer.from(credentialId));
const encrypted = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
const authTag = cipher.getAuthTag();
```

#### **3. Token Retrieval & Validation**
```typescript
// Token retrieval for API calls
async function getGitHubToken(): Promise<string> {
  // 1. Retrieve encrypted token from SecureCredentialStore
  const tokenInfo = await tryGetOAuthToken();
  
  // 2. Check expiration
  if (tokenInfo.expiresAt <= new Date()) {
    // 3. Refresh if expired
    const refreshed = await refreshOAuthToken(tokenInfo.refreshToken);
    return refreshed.accessToken;
  }
  
  // 4. Return valid token
  return tokenInfo.accessToken;
}
```

#### **4. Automatic Token Refresh**
```typescript
// Automatic refresh before expiration
async function refreshOAuthToken(refreshToken: string): Promise<OAuthTokenInfo> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      client_id: config.oauth.clientId,
      client_secret: config.oauth.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  const data = await response.json();
  
  // Store new tokens securely
  await storeOAuthTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scopes: data.scope ? data.scope.split(' ') : [],
  });
}
```

#### **5. Token Security Features**
- **Memory Protection**: Tokens never stored in plain text
- **Process Isolation**: Each session has isolated token storage
- **Automatic Cleanup**: Tokens cleared on process exit
- **Audit Logging**: All token operations logged in enterprise mode
- **Expiration Handling**: Automatic refresh before expiration
- **Error Recovery**: Graceful handling of refresh failures

## 👥 Session Management

### Session Architecture

The HTTP server implements a sophisticated session management system using **StreamableHTTPServerTransport** for each user session:

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated
    Unauthenticated --> OAuth_Flow : User visits app
    OAuth_Flow --> GitHub_Auth : Redirect to GitHub
    GitHub_Auth --> Token_Exchange : User authorizes
    Token_Exchange --> Session_Created : mcp-s-oauth stores tokens
    Session_Created --> Transport_Created : Create StreamableHTTPServerTransport
    Transport_Created --> MCP_Server_Instance : New McpServer per session
    MCP_Server_Instance --> Tools_Registered : Register all tools
    Tools_Registered --> MCP_Ready : Ready for requests
    MCP_Ready --> Tool_Execution : Handle MCP requests
    Tool_Execution --> MCP_Ready : Return results
    MCP_Ready --> Token_Refresh : Token expires
    Token_Refresh --> MCP_Ready : Continue with new token
    MCP_Ready --> [*] : Session closed/logout
```

### Session Implementation Details

#### **Transport-Based Sessions**
```typescript
// Each session gets its own transport and MCP server
const transports: Record<string, StreamableHTTPServerTransport> = {};

const mcpHandler = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  
  if (sessionId && transports[sessionId]) {
    // Reuse existing transport for this session
    transport = transports[sessionId];
  } else {
    // Create new transport with UUID session ID
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sessionId => {
        transports[sessionId] = transport;
      },
    });
  }
};
```

#### **Session Storage & Lifecycle**
- **Session ID**: UUID-based unique identifiers (`randomUUID()`)
- **Transport Storage**: In-memory transport registry by session ID
- **Token Storage**: Encrypted storage via `SecureCredentialStore`
- **Automatic Cleanup**: Transport cleanup on session close
- **Audit Logging**: Session events logged for enterprise mode

#### **Multi-User Isolation**
Each authenticated user receives:
- **Dedicated MCP Server**: Individual `McpServer` instance per session
- **Isolated Transport**: Separate `StreamableHTTPServerTransport`
- **Private Token Storage**: User-specific encrypted token storage
- **Independent Tool Registration**: Full tool suite per session
- **Session-Scoped Caching**: Isolated cache per user session

### Session Security

#### **Session Identification**
- **Header-Based**: Sessions identified via `mcp-session-id` header
- **UUID Generation**: Cryptographically secure session IDs
- **No Cross-Session Access**: Complete isolation between users

#### **Token Association**
- **Per-Session Tokens**: Each session has its own GitHub tokens
- **Encrypted Storage**: All tokens encrypted with AES-256-GCM
- **Automatic Refresh**: Token refresh handled transparently
- **Secure Cleanup**: Tokens cleared on session termination

## ⚙️ Configuration

### Environment Variables

#### **Required for OAuth**
```bash
# GitHub OAuth App credentials (from GitHub Developer Settings)
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"
```

#### **Server Configuration**
```bash
# Server settings
BASE_URL="https://yourapp.com"    # Default: http://localhost:3000
PORT="3000"                       # Default: 3000

# Tool selection (optional)
TOOLS_TO_RUN="github_search_code,github_fetch_content"  # Comma-separated tool names
```

#### **Stdio OAuth Configuration (for stdio mode)**
```bash
# OAuth App credentials for stdio mode
GITHUB_OAUTH_CLIENT_ID="Iv1.a629723d4c8a5678"          # OAuth App Client ID
GITHUB_OAUTH_CLIENT_SECRET="abc123..."                   # OAuth App Secret
GITHUB_OAUTH_REDIRECT_URI="http://localhost:3000/auth/callback"  # Callback URL
GITHUB_OAUTH_SCOPES="repo,read:user,read:org"           # Requested scopes (comma-separated)
GITHUB_OAUTH_ENABLED="true"                             # Enable OAuth
```

> **Note**: HTTP server uses `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` via `mcp-s-oauth`. Stdio mode uses `GITHUB_OAUTH_*` via `src/config/serverConfig.ts`.

#### **GitHub App Configuration (Enterprise)**
```bash
# GitHub App credentials
GITHUB_APP_ID="123456"                                   # GitHub App ID
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"  # Private key content
GITHUB_APP_INSTALLATION_ID="12345678"                   # Installation ID (optional)
GITHUB_APP_ENABLED="true"                               # Enable GitHub App authentication
```

**GitHub App Setup Process:**
1. **Create GitHub App**: Go to [GitHub Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
2. **Generate Private Key**: Download the `.pem` file from your GitHub App settings
3. **Install App**: Install on your organization/repositories and note the Installation ID
4. **Configure Environment**: Set the variables above

#### **Enterprise Security Features**
```bash
# Audit logging
AUDIT_ALL_ACCESS="true"           # Enable comprehensive audit logging

# Rate limiting
RATE_LIMIT_API_HOUR="5000"       # GitHub API calls per hour
RATE_LIMIT_AUTH_HOUR="1000"      # Authentication attempts per hour  
RATE_LIMIT_TOKEN_HOUR="100"      # Token operations per hour

# Organization validation
GITHUB_ORGANIZATION="your-org"    # Restrict access to organization members
GITHUB_SSO_ENFORCEMENT="true"     # Enforce SSO for organization
```

#### **GitHub Enterprise Support**
```bash
# GitHub Enterprise Server
GITHUB_HOST="github.company.com"  # Enterprise GitHub URL
GITHUB_API_URL="https://github.company.com/api/v3"  # Enterprise API URL
```

#### **Beta Features**
```bash
# Enable experimental features
BETA="1"                          # Enable beta features (sampling, etc.)
```

### Configuration Validation

The server validates configuration on startup:

```typescript
// Required OAuth credentials check
if (!config.clientId || !config.clientSecret) {
  throw new Error(
    'GitHub OAuth credentials are required. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
  );
}

// Enterprise features initialization
if (process.env.AUDIT_ALL_ACCESS === 'true') {
  AuditLogger.initialize();
}

if (process.env.RATE_LIMIT_API_HOUR || 
    process.env.RATE_LIMIT_AUTH_HOUR || 
    process.env.RATE_LIMIT_TOKEN_HOUR) {
  RateLimiter.initialize();
}
```

### OAuth Scopes

The server automatically requests these GitHub scopes:
- `repo`: Access to repository contents and metadata
- `read:user`: User profile information
- `read:org`: Organization membership (for enterprise features)

### Security Configuration

```bash
# Enable comprehensive security features
export AUDIT_ALL_ACCESS="true"
export GITHUB_SSO_ENFORCEMENT="true"
export GITHUB_TOKEN_VALIDATION="true"
export GITHUB_PERMISSION_VALIDATION="true"
```

## 🚀 Deployment

### Local Development

```bash
# Development with hot reload
npm run build:watch

# Start server in development mode
NODE_ENV=development npx octocode-mcp-server
# or
NODE_ENV=development node dist/server.js
```

### Production Deployment

#### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY package.json ./

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```bash
# Build and run
docker build -t octocode-mcp .
docker run -p 3000:3000 \
  -e GITHUB_CLIENT_ID="your_client_id" \
  -e GITHUB_CLIENT_SECRET="your_client_secret" \
  -e BASE_URL="https://yourapp.com" \
  octocode-mcp
```

#### Cloud Deployment

**Heroku**:
```bash
# Set environment variables
heroku config:set GITHUB_CLIENT_ID="your_client_id"
heroku config:set GITHUB_CLIENT_SECRET="your_client_secret"
heroku config:set BASE_URL="https://yourapp.herokuapp.com"

# Deploy
git push heroku main
```

**AWS/GCP/Azure**:
- Use environment variables for configuration
- Ensure HTTPS for OAuth callbacks
- Configure load balancer for scaling
- Use secrets management for credentials

### Reverse Proxy Configuration

**Nginx**:
```nginx
server {
    listen 80;
    server_name yourapp.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📡 API Reference

### MCP Tool Requests

All MCP tools are available via HTTP POST to `/mcp`:

```bash
# Example: Search GitHub code
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "mcp_octocode-local_githubSearchCode",
      "arguments": {
        "queries": [{
          "queryTerms": ["authentication"],
          "owner": "microsoft",
          "repo": "vscode"
        }]
      }
    }
  }'
```

### Session Management

```bash
# Check authentication status
curl http://localhost:3000/auth/status

# Logout
curl -X POST http://localhost:3000/auth/logout
```

### Health Check

```bash
# Server health
curl http://localhost:3000/health

# OAuth configuration
curl http://localhost:3000/auth/config
```

## 🔒 Security

### OAuth Security

- **HTTPS Required**: OAuth callbacks must use HTTPS in production
- **State Parameter**: CSRF protection via state parameter
- **Secure Cookies**: Session cookies with secure flags
- **Token Encryption**: OAuth tokens encrypted at rest

### Session Security

- **Session Isolation**: Each user has isolated session data
- **Token Scoping**: Minimal required GitHub scopes
- **Automatic Cleanup**: Expired sessions automatically removed
- **Audit Logging**: All authentication events logged

### Network Security

```bash
# Enable security headers
export SECURITY_HEADERS="true"

# Content Security Policy
export CSP_POLICY="default-src 'self'; script-src 'self' 'unsafe-inline'"

# HTTPS enforcement
export FORCE_HTTPS="true"
```

## 📊 Monitoring & Logging

### Audit Logging

When `AUDIT_ALL_ACCESS=true`:

```json
{
  "eventId": "uuid",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "userId": "github_user_id",
  "sessionId": "session_uuid",
  "action": "oauth_token_refresh",
  "outcome": "success",
  "source": "oauth_manager",
  "details": {
    "tokenExpiresAt": "2024-01-15T18:30:45.123Z",
    "scopes": ["repo", "read:user", "read:org"]
  }
}
```

### Metrics

Monitor these key metrics:
- **Active Sessions**: Number of concurrent user sessions
- **Token Refresh Rate**: OAuth token refresh frequency
- **Tool Usage**: MCP tool execution statistics
- **Error Rates**: Authentication and tool execution errors

### Health Monitoring

```bash
# Server health endpoint
curl http://localhost:3000/health

# Response
{
  "status": "healthy",
  "uptime": 3600,
  "sessions": 5,
  "memory": "45.2 MB",
  "oauth": "configured"
}
```

## 🔧 Troubleshooting

### Common Issues

#### 1. OAuth Configuration Errors

```bash
# Error: Missing OAuth credentials
Error: GitHub OAuth credentials are required. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.

# Solution: Set required environment variables
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"
```

#### 2. Callback URL Mismatch

```bash
# Error: OAuth callback URL mismatch
# GitHub returns: "The redirect_uri MUST match the registered callback URL"

# Solution: Ensure BASE_URL matches your OAuth app configuration
export BASE_URL="https://yourapp.com"  # Must match GitHub OAuth app
```

#### 3. Session Issues

```bash
# Error: Session not found or expired
# User gets redirected to OAuth flow repeatedly

# Solution: Check session storage and cookie configuration
# Ensure cookies are properly configured for your domain
```

#### 4. Token Refresh Failures

```bash
# Error: Token refresh failed
# Tools return authentication errors

# Solution: Check OAuth app permissions and token scopes
# Ensure refresh tokens are properly stored
```

### Health Check & Status

```bash
# Check authentication status (HTTP mode)
curl -s http://localhost:3000/auth/status | jq

# Server health
curl -s http://localhost:3000/health | jq
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG="mcp:oauth,mcp:session,mcp:auth"
export NODE_ENV="development"

# Start server with debug output
npx octocode-mcp-server
# or
node dist/server.js
```

### Log Analysis

```bash
# View OAuth events
grep '"source":"oauth_manager"' logs/audit/*.jsonl

# Monitor session activity
grep '"action":"mcp_session"' logs/audit/*.jsonl

# Check token refresh patterns
grep '"action":"oauth_token_refresh"' logs/audit/*.jsonl
```

## 🎯 Best Practices

### Production Deployment

1. **Use HTTPS**: Always use HTTPS for OAuth callbacks
2. **Environment Variables**: Store secrets in environment variables
3. **Session Security**: Configure secure session cookies
4. **Monitoring**: Enable audit logging and health checks
5. **Scaling**: Use load balancers for multiple instances

### Development

1. **Local Testing**: Use `http://localhost:3000` for local development
2. **Environment Files**: Use `.env` files for local configuration
3. **Debug Logging**: Enable debug mode for troubleshooting
4. **Hot Reload**: Use `npm run build:watch` for development

### Security

1. **Minimal Scopes**: Request only necessary GitHub scopes
2. **Token Rotation**: Monitor and rotate OAuth credentials regularly
3. **Audit Logging**: Enable comprehensive audit logging
4. **Access Control**: Use organization validation for enterprise

---

## 📚 Additional Resources

- **[mcp-s-oauth Documentation](https://www.npmjs.com/package/mcp-s-oauth)**
- **[GitHub OAuth Apps Guide](https://docs.github.com/en/developers/apps/building-oauth-apps)**
- **[Express.js Documentation](https://expressjs.com/)**
- **[MCP Protocol Specification](https://modelcontextprotocol.io/)**

## 🆘 Support

For HTTP server specific issues:

1. **Check OAuth Configuration**: Verify GitHub OAuth app settings
2. **Review Logs**: Check audit logs for authentication events
3. **Test Locally**: Start with local development setup
4. **Verify Environment**: Ensure all required environment variables are set
5. **Monitor Sessions**: Check session management and token refresh

---

**🌐 Ready to deploy!** The Octocode-MCP HTTP server provides a robust, scalable foundation for web-based GitHub repository analysis with seamless OAuth authentication.

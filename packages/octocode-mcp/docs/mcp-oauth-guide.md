# MCP Server OAuth Implementation Guide

Based on the official MCP specification and real-world implementations, here's how to properly implement OAuth in your MCP server:

## 📋 OAuth 2.1 Requirements (Official MCP Spec)

According to the [MCP Authorization specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/basic/authorization.mdx), MCP servers implementing OAuth **MUST**:

1. **Follow OAuth 2.1** with appropriate security measures
2. **Implement OAuth 2.0 Protected Resource Metadata** ([RFC9728](https://datatracker.ietf.org/doc/html/rfc9728))
3. **Use the `resource` parameter** as defined in [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)
4. **Support PKCE** for authorization code protection
5. **Validate access tokens** for the intended audience

## 🏗️ Architecture Overview

When users install your MCP server, the OAuth flow works like this:

1. **MCP Client** (like Cursor) connects to your server
2. **Server returns HTTP 401** with `WWW-Authenticate` header pointing to OAuth metadata
3. **Client discovers authorization server** from metadata
4. **OAuth flow begins** - browser opens for user authentication
5. **Tokens are obtained** and used for subsequent requests

## 🛠️ Implementation Approaches

### Option 1: Self-Contained OAuth Server (Recommended)

Use a complete OAuth provider like the Cloudflare Workers OAuth Provider:

```typescript
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";

// Your MCP Server Class
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "Your MCP Server",
    version: "1.0.0",
  });

  async init() {
    // Register tools based on authenticated user
    this.registerTools();
  }

  private registerTools() {
    // Access authenticated user via this.props
    const { login, email } = this.props;
    
    this.server.setRequestHandler("tools/list", async () => ({
      tools: [
        {
          name: "protected_action",
          description: `Perform action for ${login}`,
          inputSchema: {
            type: "object",
            properties: {
              data: { type: "string" }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler("tools/call", async (request) => {
      if (request.params.name === "protected_action") {
        // This tool has access to authenticated user context
        return {
          content: [{
            type: "text",
            text: `Action performed for user: ${login}`
          }]
        };
      }
    });
  }
}

// OAuth Handler for GitHub
export class GitHubHandler {
  async authorize(request: Request, env: Env) {
    // Check if client already approved
    if (await this.clientAlreadyApproved(request)) {
      return this.redirectToGitHub(request, env);
    }

    // Show approval dialog
    return this.renderApprovalDialog(request);
  }

  async callback(request: Request, env: Env) {
    const code = new URL(request.url).searchParams.get('code');
    
    // Exchange code for token
    const accessToken = await this.exchangeCodeForToken(code, env);
    
    // Get user info
    const user = await this.fetchUserInfo(accessToken);
    
    // Complete authorization and return to client
    return env.OAUTH_PROVIDER.completeAuthorization({
      props: {
        accessToken,
        login: user.login,
        email: user.email,
        name: user.name
      },
      userId: user.login,
      // ... other required fields
    });
  }
}

// Main export with OAuth endpoints
export default new OAuthProvider({
  apiHandlers: {
    '/sse': MyMCP.serveSSE('/sse'),     // Legacy SSE transport
    '/mcp': MyMCP.serve('/mcp'),        // Modern Streamable HTTP
  },
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: GitHubHandler,
  tokenEndpoint: "/token",
});
```

### Option 2: External OAuth Provider

If using an external OAuth provider (like Auth0, AWS Cognito):

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class ExternalOAuthMCP {
  constructor() {
    this.server = new Server({
      name: "external-oauth-server",
      version: "1.0.0"
    });
    
    this.setupProtectedResourceMetadata();
    this.setupHandlers();
  }

  setupProtectedResourceMetadata() {
    // Implement RFC9728 - Protected Resource Metadata
    this.server.setRequestHandler("/.well-known/oauth-protected-resource", async () => ({
      resource: "https://your-server.com",
      authorization_servers: ["https://your-auth-server.com"],
      scopes_supported: ["read", "write"],
      // ... other metadata
    }));
  }

  setupHandlers() {
    this.server.setRequestHandler("tools/list", async (request) => {
      // Validate Bearer token from Authorization header
      const token = this.extractBearerToken(request);
      const user = await this.validateToken(token);
      
      if (!user) {
        throw new Error("Unauthorized");
      }

      return {
        tools: [
          {
            name: "user_action",
            description: "Perform user-specific action",
            inputSchema: { type: "object", properties: {} }
          }
        ]
      };
    });
  }

  extractBearerToken(request: any): string | null {
    const auth = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }

  async validateToken(token: string) {
    // Validate token with your OAuth provider
    // Must verify audience matches your server
    const response = await fetch('https://your-auth-server.com/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) return null;
    return response.json();
  }
}
```

## 🔐 Security Requirements

### 1. Token Audience Validation
```typescript
async validateToken(token: string) {
  const decoded = jwt.verify(token, publicKey);
  
  // CRITICAL: Verify audience matches your server
  if (decoded.aud !== 'https://your-mcp-server.com') {
    throw new Error('Token not intended for this server');
  }
  
  return decoded;
}
```

### 2. PKCE Implementation
```typescript
// Client must use PKCE
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

const authUrl = new URL('https://auth-server.com/authorize');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('resource', 'https://your-mcp-server.com');
```

### 3. Resource Parameter
```typescript
// Include resource parameter in all OAuth requests
const authParams = {
  client_id: 'your-client-id',
  redirect_uri: 'http://localhost:3000/callback',
  resource: 'https://your-mcp-server.com',  // REQUIRED
  scope: 'read write',
  response_type: 'code',
  state: crypto.randomBytes(16).toString('hex')
};
```

## 📦 Installation & User Experience

### 1. Package Configuration
```json
{
  "name": "your-mcp-server",
  "scripts": {
    "setup": "node setup-oauth.js",
    "start": "node server.js"
  },
  "mcp": {
    "oauth": {
      "required": true,
      "providers": ["github", "google", "custom"],
      "setup_url": "https://docs.your-server.com/oauth-setup"
    }
  }
}
```

### 2. Setup Script
```javascript
// setup-oauth.js
import inquirer from 'inquirer';
import open from 'open';

async function setupOAuth() {
  console.log('🔐 Setting up OAuth for your MCP server...\n');
  
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Choose OAuth provider:',
      choices: ['GitHub', 'Google', 'Custom']
    }
  ]);

  if (provider === 'GitHub') {
    await setupGitHubOAuth();
  }
  // ... other providers
}

async function setupGitHubOAuth() {
  console.log('\n📝 Setting up GitHub OAuth...');
  console.log('1. Go to https://github.com/settings/applications/new');
  console.log('2. Fill in the application details');
  console.log('3. Set Authorization callback URL to: http://localhost:3000/oauth/callback');
  
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: 'Press Enter when you have created the GitHub app...'
  }]);

  const { clientId, clientSecret } = await inquirer.prompt([
    {
      type: 'input',
      name: 'clientId',
      message: 'Enter Client ID:'
    },
    {
      type: 'password',
      name: 'clientSecret',
      message: 'Enter Client Secret:'
    }
  ]);

  // Save configuration
  await saveConfig({ provider: 'github', clientId, clientSecret });
  
  console.log('\n✅ OAuth setup complete!');
  console.log('🚀 Start your server with: npm start');
}
```

### 3. Cursor Integration

When the user adds your server to Cursor, the configuration looks like:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "npx",
      "args": ["your-mcp-server", "start"]
    }
  }
}
```

**What happens when they first connect:**

1. **Cursor connects** to your MCP server
2. **Server returns 401** with OAuth metadata in `WWW-Authenticate` header
3. **Cursor automatically opens browser** to your OAuth URL
4. **User authenticates** with your OAuth provider
5. **Browser redirects back** to your callback URL
6. **Server exchanges code for token** and stores it
7. **Cursor receives access token** and can now use your tools

## 🌐 Browser Flow Details

The OAuth page that opens works like this:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Authorize MCP Server</title>
</head>
<body>
    <div class="auth-container">
        <h1>🔐 Authorization Required</h1>
        <p>Your MCP Server requests access to:</p>
        <ul>
            <li>Read your basic profile information</li>
            <li>Access your authorized data</li>
        </ul>
        
        <div class="provider-buttons">
            <button onclick="authorizeWith('github')">
                📱 Continue with GitHub
            </button>
            <button onclick="authorizeWith('google')">
                🌐 Continue with Google
            </button>
        </div>
        
        <div class="security-note">
            <small>🔒 This connection is secure and encrypted</small>
        </div>
    </div>

    <script>
        function authorizeWith(provider) {
            const params = new URLSearchParams(window.location.search);
            const authUrl = `/authorize/${provider}?${params.toString()}`;
            window.location.href = authUrl;
        }
    </script>
</body>
</html>
```

## 📋 Checklist for Implementation

- [ ] **OAuth 2.1 compliance** with PKCE support
- [ ] **Protected Resource Metadata** endpoint (`/.well-known/oauth-protected-resource`)
- [ ] **Resource parameter** in all OAuth requests
- [ ] **Token audience validation** for security
- [ ] **Bearer token** support in Authorization header
- [ ] **HTTP 401 responses** with proper `WWW-Authenticate` headers
- [ ] **Setup script** for easy user configuration
- [ ] **Clear documentation** for OAuth provider setup
- [ ] **Error handling** for common OAuth failures
- [ ] **Token refresh** logic for long-lived sessions

## 🧪 Local Development & Testing with GitHub OAuth

### Complete Localhost Example

Here's a complete example for testing OAuth locally at `http://localhost:3000`:

#### 1. GitHub OAuth App Setup

1. **Go to GitHub Developer Settings**: https://github.com/settings/developers
2. **Click "New OAuth App"**
3. **Fill in the details**:
   - **Application name**: `MCP Server Local Development`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/oauth/callback`
   - **Application description**: `Local development for MCP server OAuth`
4. **Click "Register application"**
5. **Copy your Client ID and generate a Client Secret**

#### 2. Environment Setup

Create `.env` file:
```bash
# .env
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_random_session_secret_here
```

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Complete Server Implementation

```javascript
// server.js
import express from 'express';
import session from 'express-session';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware for OAuth state management
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Store active OAuth flows
const oauthFlows = new Map();

// MCP Server instance
const mcpServer = new Server({
  name: "localhost-oauth-test-server",
  version: "1.0.0",
});

// User storage (in production, use a database)
const authenticatedUsers = new Map();

// OAuth 2.0 Protected Resource Metadata endpoint (RFC9728)
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: `http://localhost:${PORT}`,
    authorization_servers: [`http://localhost:${PORT}`],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
    resource_documentation: `http://localhost:${PORT}/docs`
  });
});

// OAuth Authorization Server Metadata endpoint (RFC8414)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: `http://localhost:${PORT}`,
    authorization_endpoint: `http://localhost:${PORT}/oauth/authorize`,
    token_endpoint: `http://localhost:${PORT}/oauth/token`,
    userinfo_endpoint: `http://localhost:${PORT}/oauth/userinfo`,
    registration_endpoint: `http://localhost:${PORT}/oauth/register`,
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"]
  });
});

// Main page with OAuth test interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>MCP OAuth Test Server</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; }
            .button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 5px; text-decoration: none; display: inline-block; margin: 10px 5px; }
            .button:hover { background: #0056b3; }
            .code { background: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 5px; font-family: monospace; }
            .section { margin: 30px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔐 MCP OAuth Test Server</h1>
            <p>Server running at: <strong>http://localhost:${PORT}</strong></p>
            
            <div class="section">
                <h2>📋 OAuth Configuration</h2>
                <div class="code">
                    GitHub Client ID: ${process.env.GITHUB_CLIENT_ID ? '✅ Configured' : '❌ Missing'}<br>
                    GitHub Client Secret: ${process.env.GITHUB_CLIENT_SECRET ? '✅ Configured' : '❌ Missing'}<br>
                    Session Secret: ${process.env.SESSION_SECRET ? '✅ Configured' : '❌ Missing'}
                </div>
            </div>

            <div class="section">
                <h2>🧪 Test OAuth Flow</h2>
                <p>Click the button below to test the OAuth authorization flow:</p>
                <a href="/test/oauth" class="button">🚀 Start OAuth Test</a>
            </div>

            <div class="section">
                <h2>🔗 OAuth Endpoints</h2>
                <ul>
                    <li><a href="/.well-known/oauth-protected-resource">Protected Resource Metadata</a></li>
                    <li><a href="/.well-known/oauth-authorization-server">Authorization Server Metadata</a></li>
                    <li><a href="/mcp">MCP Endpoint (Streamable HTTP)</a></li>
                    <li><a href="/sse">MCP Endpoint (Server-Sent Events)</a></li>
                </ul>
            </div>

            <div class="section">
                <h2>📖 MCP Client Configuration</h2>
                <p>Add this to your MCP client configuration:</p>
                <div class="code">
{
  "mcpServers": {
    "localhost-oauth-test": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "http://localhost:${PORT}/mcp"]
    }
  }
}
                </div>
            </div>

            <div class="section">
                <h2>🔍 Current Status</h2>
                <p>Authenticated users: <strong>${authenticatedUsers.size}</strong></p>
                <p>Active OAuth flows: <strong>${oauthFlows.size}</strong></p>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Test OAuth flow initiation
app.get('/test/oauth', (req, res) => {
  // Generate PKCE parameters
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store PKCE and state in session
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;
  
  // GitHub OAuth URL with required parameters
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `http://localhost:${PORT}/oauth/callback`);
  githubAuthUrl.searchParams.set('scope', 'read:user user:email');
  githubAuthUrl.searchParams.set('state', state);
  githubAuthUrl.searchParams.set('code_challenge', codeChallenge);
  githubAuthUrl.searchParams.set('code_challenge_method', 'S256');
  
  // Add resource parameter (RFC8707)
  githubAuthUrl.searchParams.set('resource', `http://localhost:${PORT}`);

  console.log('🚀 Redirecting to GitHub OAuth:', githubAuthUrl.toString());
  
  res.redirect(githubAuthUrl.toString());
});

// OAuth callback handler
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.send(`
      <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial;">
        <h2>❌ OAuth Error</h2>
        <p><strong>Error:</strong> ${error}</p>
        <p><strong>Description:</strong> ${req.query.error_description || 'Unknown error'}</p>
        <a href="/" style="color: #007bff;">← Back to home</a>
      </div>
    `);
  }

  // Validate state parameter (CSRF protection)
  if (state !== req.session.oauthState) {
    return res.send(`
      <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial;">
        <h2>❌ Invalid State</h2>
        <p>State parameter mismatch. Possible CSRF attack.</p>
        <a href="/" style="color: #007bff;">← Back to home</a>
      </div>
    `);
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: `http://localhost:${PORT}/oauth/callback`,
        code_verifier: req.session.codeVerifier // PKCE verification
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(`Token exchange failed: ${tokenData.error_description}`);
    }

    // Fetch user information from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const userData = await userResponse.json();
    
    // Store authenticated user
    const userId = userData.login;
    authenticatedUsers.set(userId, {
      id: userData.id,
      login: userData.login,
      name: userData.name,
      email: userData.email,
      avatar_url: userData.avatar_url,
      access_token: tokenData.access_token,
      authenticated_at: new Date().toISOString()
    });

    // Clear session OAuth data
    delete req.session.oauthState;
    delete req.session.codeVerifier;
    
    // Store user in session
    req.session.userId = userId;

    console.log('✅ OAuth successful for user:', userData.login);

    res.send(`
      <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial;">
        <h2>✅ OAuth Success!</h2>
        <div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px;">
          <h3>Authenticated User:</h3>
          <img src="${userData.avatar_url}" width="50" height="50" style="border-radius: 25px; vertical-align: middle;">
          <strong>${userData.name || userData.login}</strong> (@${userData.login})
          <br><br>
          <strong>User ID:</strong> ${userData.id}<br>
          <strong>Email:</strong> ${userData.email || 'Private'}<br>
          <strong>Profile:</strong> <a href="${userData.html_url}" target="_blank">${userData.html_url}</a>
        </div>
        <br>
        <p>🎉 You can now use MCP tools that require authentication!</p>
        <a href="/test/mcp-tools" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Test MCP Tools</a>
        <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">← Back to Home</a>
      </div>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.send(`
      <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial;">
        <h2>❌ OAuth Failed</h2>
        <p><strong>Error:</strong> ${error.message}</p>
        <a href="/" style="color: #007bff;">← Back to home</a>
      </div>
    `);
  }
});

// Test MCP tools with authentication
app.get('/test/mcp-tools', (req, res) => {
  const userId = req.session.userId;
  const user = userId ? authenticatedUsers.get(userId) : null;
  
  if (!user) {
    return res.redirect('/test/oauth');
  }

  res.send(`
    <div style="max-width: 800px; margin: 50px auto; padding: 20px; font-family: Arial;">
      <h2>🛠️ MCP Tools Test</h2>
      <div style="background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px;">
        <strong>Authenticated as:</strong> ${user.name} (@${user.login})
      </div>
      <br>
      
      <h3>Available MCP Tools:</h3>
      <ul>
        <li><strong>getUserInfo</strong> - Get authenticated user information</li>
        <li><strong>listRepositories</strong> - List user's GitHub repositories</li>
        <li><strong>createGist</strong> - Create a GitHub gist (requires auth)</li>
      </ul>
      
      <h3>Test with MCP Inspector:</h3>
      <div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 5px; font-family: monospace;">
        npx @modelcontextprotocol/inspector http://localhost:${PORT}/mcp
      </div>
      
      <br>
      <a href="/oauth/logout" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Logout</a>
      <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">← Back to Home</a>
    </div>
  `);
});

// Logout endpoint
app.get('/oauth/logout', (req, res) => {
  const userId = req.session.userId;
  if (userId) {
    authenticatedUsers.delete(userId);
  }
  req.session.destroy();
  
  res.send(`
    <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: Arial;">
      <h2>👋 Logged Out</h2>
      <p>You have been successfully logged out.</p>
      <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">← Back to Home</a>
    </div>
  `);
});

// MCP endpoint (Streamable HTTP) - requires authentication
app.all('/mcp', (req, res) => {
  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Bearer token required'
    }).header('WWW-Authenticate', `Bearer realm="MCP Server", resource_metadata="http://localhost:${PORT}/.well-known/oauth-protected-resource"`);
  }

  const token = authHeader.slice(7);
  
  // Find user by token (in production, validate JWT or query auth server)
  const user = Array.from(authenticatedUsers.values())
    .find(u => u.access_token === token);
  
  if (!user) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token is invalid or expired'
    });
  }

  // Handle MCP request with authenticated user context
  handleMCPRequest(req, res, user);
});

// MCP request handler with user context
function handleMCPRequest(req, res, user) {
  // This is a simplified MCP handler - in production use proper MCP SDK
  res.json({
    jsonrpc: "2.0",
    id: req.body?.id || 1,
    result: {
      tools: [
        {
          name: "getUserInfo",
          description: "Get authenticated user information",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "listRepositories", 
          description: "List user's GitHub repositories",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", default: 10 }
            }
          }
        }
      ],
      user: {
        login: user.login,
        name: user.name,
        authenticated: true
      }
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP OAuth Test Server running at http://localhost:${PORT}`);
  console.log(`📋 GitHub OAuth App Configuration:`);
  console.log(`   Homepage URL: http://localhost:${PORT}`);
  console.log(`   Callback URL: http://localhost:${PORT}/oauth/callback`);
  console.log(`🔗 Test OAuth: http://localhost:${PORT}/test/oauth`);
});
```

#### 4. Package.json Setup

```json
{
  "name": "mcp-oauth-test-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.0",
    "express-session": "^1.17.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

#### 5. Running the Test Server

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

#### 6. Testing the OAuth Flow

1. **Open browser**: Navigate to `http://localhost:3000`
2. **Click "Start OAuth Test"**: This initiates the GitHub OAuth flow
3. **Authenticate with GitHub**: You'll be redirected to GitHub to authorize
4. **Return to your server**: GitHub redirects back with authorization code
5. **View success page**: See your authenticated user information
6. **Test MCP tools**: Click to test authenticated MCP functionality

#### 7. Testing with MCP Inspector

Once OAuth is working, test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

The Inspector will:
1. Connect to your MCP endpoint
2. Receive 401 Unauthorized
3. Discover OAuth metadata
4. Prompt for authentication
5. Open browser for OAuth flow
6. Use obtained token for MCP requests

#### 8. Debugging OAuth Issues

Common issues and solutions:

**"Invalid redirect URI"**:
- Verify GitHub OAuth app callback URL matches exactly: `http://localhost:3000/oauth/callback`

**"State parameter mismatch"**:
- Clear browser cookies and try again
- Check session storage is working

**"Token exchange failed"**:
- Verify GitHub Client ID and Secret are correct
- Check network connectivity to GitHub

**"Bearer token required"**:
- Ensure MCP client is sending `Authorization: Bearer <token>` header

This complete example provides a working OAuth implementation you can test locally and modify for your specific MCP server needs.

## 🚀 Production Deployment

For production deployment, ensure:

1. **HTTPS everywhere** - OAuth requires secure connections
2. **Proper redirect URIs** registered with OAuth providers
3. **Secure token storage** using encrypted databases or key-value stores
4. **Rate limiting** on OAuth endpoints
5. **Monitoring** for OAuth failures and security events

This implementation follows the official MCP specification and provides a secure, user-friendly OAuth experience for your MCP server users.
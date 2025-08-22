const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// OAuth state storage (in production, use Redis or database)
const oauthStates = new Map();
const authenticatedTokens = new Map(); // token -> user info

// Middleware
app.use(express.static('public'));
app.use(express.json());

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_HOST = process.env.GITHUB_HOST || 'https://github.com';
const REDIRECT_URI = `http://localhost:${PORT}/api/auth/callback/github`;

// Debug environment loading
console.log('🔧 Environment variables loaded:');
console.log(`   GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID ? `${GITHUB_CLIENT_ID.substring(0, 8)}...` : '❌ Not set'}`);
console.log(`   GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET ? '✅ Set' : '❌ Not set'}`);
console.log(`   GITHUB_HOST: ${GITHUB_HOST}`);
console.log(`   .env file path: ${path.join(__dirname, '.env')}`);

// Check if .env file exists
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('\n❌ .env file not found!');
  console.error('   Please copy env.example to .env and configure your GitHub OAuth App:');
  console.error(`   cp ${path.join(__dirname, 'env.example')} ${envPath}`);
  console.error('\n📋 Then edit .env and set your GitHub OAuth App credentials:');
  console.error('   GITHUB_CLIENT_ID=your_actual_client_id');
  console.error('   GITHUB_CLIENT_SECRET=your_actual_client_secret');
  console.error('\n🔗 Create OAuth App at: https://github.com/settings/applications/new');
  process.exit(1);
}

// Validate required environment variables
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.error('\n❌ Missing required environment variables:');
  console.error('   GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required');
  console.error('   Please edit your .env file and set the correct values');
  console.error(`   .env location: ${envPath}`);
  console.error('\n🔗 Create OAuth App at: https://github.com/settings/applications/new');
  process.exit(1);
}

// Additional validation for placeholder values
if (GITHUB_CLIENT_ID === 'your_github_client_id_here' || GITHUB_CLIENT_SECRET === 'your_github_client_secret_here') {
  console.error('\n❌ Placeholder values detected in environment variables!');
  console.error('   Please replace the placeholder values in your .env file with actual GitHub OAuth App credentials');
  console.error(`   .env location: ${envPath}`);
  console.error('\n📋 Steps to fix:');
  console.error('   1. Go to https://github.com/settings/applications/new');
  console.error('   2. Create a new OAuth App with these settings:');
  console.error('      - Homepage URL: http://localhost:3000');
  console.error('      - Authorization callback URL: http://localhost:3000/api/auth/callback/github');
  console.error('   3. Copy the Client ID and Client Secret to your .env file');
  process.exit(1);
}

// OAuth 2.0 Protected Resource Metadata endpoint (RFC9728)
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: `http://localhost:${PORT}`,
    authorization_servers: [`http://localhost:${PORT}`],
    scopes_supported: ["repo", "read:user", "read:org"],
    bearer_methods_supported: ["header"],
    resource_documentation: `http://localhost:${PORT}/docs`,
    resource_policy_uri: `http://localhost:${PORT}/policy`
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
    scopes_supported: ["repo", "read:user", "read:org"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"]
  });
});

// MCP Server endpoints with OAuth protection
app.all('/mcp', handleMCPRequest);
app.get('/mcp/sse', handleMCPSSE);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GitHub OAuth login
app.get('/api/auth/github', (req, res) => {
  const scopes = 'repo read:user read:org';
  const state = Math.random().toString(36).substring(2, 15);
  
  const authUrl = `${GITHUB_HOST}/login/oauth/authorize?` +
    `client_id=${GITHUB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}`;
  
  // Store state in session (simplified for demo)
  req.session = { state };
  
  res.redirect(authUrl);
});

// GitHub OAuth callback
app.get('/api/auth/callback/github', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).send('❌ Authorization code not provided');
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(`${GITHUB_HOST}/login/oauth/access_token`, {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    const { access_token, scope, token_type } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('No access token received');
    }
    
    // Get user info
    const apiBase = GITHUB_HOST === 'https://github.com' ? 'https://api.github.com' : `${GITHUB_HOST}/api/v3`;
    const userResponse = await axios.get(`${apiBase}/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const user = userResponse.data;
    
    // Success page with token info
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Success - Octocode MCP Demo</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .token-box { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; font-family: monospace; word-break: break-all; }
          .config-box { background: #e7f3ff; border: 1px solid #b8daff; padding: 15px; border-radius: 5px; margin: 20px 0; }
          pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>🎉 OAuth Success!</h1>
        
        <div class="success">
          <strong>Successfully authenticated with GitHub!</strong><br>
          Welcome, <strong>${user.login}</strong> (${user.name || 'No name set'})
        </div>
        
        <h2>📋 Token Information</h2>
        <p><strong>Scopes granted:</strong> ${scope}</p>
        <p><strong>Token type:</strong> ${token_type}</p>
        
        <div class="token-box">
          <strong>Access Token:</strong><br>
          ${access_token}
        </div>
        
        <div class="config-box">
          <h3>🔧 Configure Octocode MCP</h3>
          <p>Add this token to your environment:</p>
          <pre>export GITHUB_TOKEN="${access_token}"</pre>
          
          <p>Or for OAuth configuration:</p>
          <pre>GITHUB_OAUTH_CLIENT_ID="${GITHUB_CLIENT_ID}"
GITHUB_OAUTH_CLIENT_SECRET="${GITHUB_CLIENT_SECRET}"
GITHUB_OAUTH_REDIRECT_URI="${REDIRECT_URI}"
GITHUB_OAUTH_SCOPES="repo,read:user,read:org"
GITHUB_OAUTH_ENABLED=true</pre>

          <h4>📋 MCP Client Configuration</h4>
          <p>For Claude Desktop (~/.claude_desktop_config.json):</p>
          <pre>{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "${access_token}"
      }
    }
  }
}</pre>

          <p>For OAuth-based configuration:</p>
          <pre>{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "${GITHUB_CLIENT_ID}",
        "GITHUB_OAUTH_CLIENT_SECRET": "${GITHUB_CLIENT_SECRET}",
        "GITHUB_OAUTH_REDIRECT_URI": "${REDIRECT_URI}",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_OAUTH_ENABLED": "true"
      }
    }
  }
}</pre>
        </div>
        
        <h3>🚀 Next Steps</h3>
        <ol>
          <li>Copy the token above and set it as <code>GITHUB_TOKEN</code> in your environment</li>
          <li>Run Octocode MCP: <code>npx octocode-mcp</code></li>
          <li>The MCP server will use your authenticated token automatically</li>
        </ol>
        
        <p><a href="/">← Back to demo</a></p>
        
        <hr>
        <p><small>This demo shows how OAuth works with Octocode MCP. In production, tokens should be stored securely and refreshed automatically.</small></p>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send(`
      <h1>❌ OAuth Error</h1>
      <p>Failed to complete OAuth flow: ${error.message}</p>
      <p><a href="/">← Back to demo</a></p>
    `);
  }
});

// MCP request handler with OAuth protection
function handleMCPRequest(req, res) {
  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Return 401 with OAuth challenge as required by MCP Authorization Protocol
    return res.status(401)
      .header('WWW-Authenticate', `Bearer realm="MCP Server", resource_metadata="http://localhost:${PORT}/.well-known/oauth-protected-resource"`)
      .json({
        error: 'unauthorized',
        error_description: 'Bearer token required for MCP access'
      });
  }

  const token = authHeader.slice(7);
  const user = authenticatedTokens.get(token);
  
  if (!user) {
    return res.status(401)
      .header('WWW-Authenticate', `Bearer realm="MCP Server", error="invalid_token", resource_metadata="http://localhost:${PORT}/.well-known/oauth-protected-resource"`)
      .json({
        error: 'invalid_token',
        error_description: 'Token is invalid or expired'
      });
  }

  // Handle MCP request with authenticated user context
  if (req.method === 'GET' || req.body?.method === 'tools/list') {
    return res.json({
      jsonrpc: "2.0",
      id: req.body?.id || 1,
      result: {
        tools: [
          {
            name: "getUserInfo",
            description: `Get GitHub user information for ${user.login}`,
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "listRepositories", 
            description: `List GitHub repositories for ${user.login}`,
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number", default: 10 },
                type: { type: "string", enum: ["all", "owner", "member"], default: "owner" }
              }
            }
          },
          {
            name: "searchCode",
            description: "Search code across GitHub repositories",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" },
                repo: { type: "string", description: "Repository to search in (optional)" }
              },
              required: ["query"]
            }
          }
        ]
      }
    });
  }
  
  if (req.body?.method === 'tools/call') {
    const toolName = req.body.params?.name;
    
    if (toolName === 'getUserInfo') {
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          content: [{
            type: "text",
            text: `Authenticated GitHub User:\n\nLogin: ${user.login}\nName: ${user.name || 'Not set'}\nEmail: ${user.email || 'Not public'}\nAvatar: ${user.avatar_url}`
          }]
        }
      });
    }
    
    if (toolName === 'listRepositories') {
      // In a real implementation, you'd use the user's token to fetch repos
      return res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: {
          content: [{
            type: "text",
            text: `This would list repositories for ${user.login} using their GitHub token.\n\nIn a complete implementation, this would make authenticated requests to GitHub API using the stored access token.`
          }]
        }
      });
    }
  }
  
  // Default response for unknown methods
  res.json({
    jsonrpc: "2.0",
    id: req.body?.id || 1,
    error: {
      code: -32601,
      message: "Method not found"
    }
  });
}

// MCP Server-Sent Events endpoint (alternative transport)
function handleMCPSSE(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401)
      .header('WWW-Authenticate', `Bearer realm="MCP Server", resource_metadata="http://localhost:${PORT}/.well-known/oauth-protected-resource"`)
      .json({
        error: 'unauthorized',
        error_description: 'Bearer token required for MCP SSE access'
      });
  }

  const token = authHeader.slice(7);
  const user = authenticatedTokens.get(token);
  
  if (!user) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token is invalid or expired'
    });
  }

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write(`data: {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n\n`);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`data: {"jsonrpc":"2.0","method":"ping"}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}

// OAuth token endpoint for exchanging authorization codes
app.post('/oauth/token', async (req, res) => {
  const { code, client_id, client_secret, code_verifier, redirect_uri } = req.body;
  
  if (client_id !== GITHUB_CLIENT_ID || client_secret !== GITHUB_CLIENT_SECRET) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials'
    });
  }
  
  try {
    // Exchange code with GitHub
    const tokenResponse = await axios.post(`${GITHUB_HOST}/login/oauth/access_token`, {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: redirect_uri
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    const { access_token, scope, token_type } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('No access token received from GitHub');
    }
    
    // Get user info from GitHub
    const apiBase = GITHUB_HOST === 'https://github.com' ? 'https://api.github.com' : `${GITHUB_HOST}/api/v3`;
    const userResponse = await axios.get(`${apiBase}/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const user = userResponse.data;
    
    // Generate our own access token for MCP
    const mcpToken = crypto.randomBytes(32).toString('base64url');
    
    // Store token -> user mapping
    authenticatedTokens.set(mcpToken, {
      ...user,
      github_token: access_token,
      scopes: scope ? scope.split(',') : ['repo', 'read:user', 'read:org'],
      authenticated_at: new Date().toISOString()
    });
    
    res.json({
      access_token: mcpToken,
      token_type: 'Bearer',
      scope: scope,
      expires_in: 3600 // 1 hour
    });
    
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code exchange failed'
    });
  }
});

// OAuth authorization endpoint
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, response_type } = req.query;
  
  if (client_id !== GITHUB_CLIENT_ID) {
    return res.status(400).json({
      error: 'invalid_client',
      error_description: 'Unknown client_id'
    });
  }
  
  if (response_type !== 'code') {
    return res.status(400).json({
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported'
    });
  }
  
  // Store PKCE challenge and state
  if (state && code_challenge) {
    oauthStates.set(state, {
      client_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method,
      created_at: Date.now()
    });
  }
  
  // Redirect to GitHub OAuth
  const githubAuthUrl = new URL(`${GITHUB_HOST}/login/oauth/authorize`);
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  githubAuthUrl.searchParams.set('scope', scope || 'repo read:user read:org');
  githubAuthUrl.searchParams.set('state', state);
  
  if (code_challenge && code_challenge_method) {
    githubAuthUrl.searchParams.set('code_challenge', code_challenge);
    githubAuthUrl.searchParams.set('code_challenge_method', code_challenge_method);
  }
  
  res.redirect(githubAuthUrl.toString());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config: {
      github_host: GITHUB_HOST,
      client_id: GITHUB_CLIENT_ID ? `${GITHUB_CLIENT_ID.substring(0, 8)}...` : 'not set',
      redirect_uri: REDIRECT_URI
    },
    oauth: {
      authenticated_users: authenticatedTokens.size,
      active_states: oauthStates.size
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 OAuth-Enabled MCP Server running at http://localhost:${PORT}`);
  console.log(`📋 GitHub OAuth App Configuration:`);
  console.log(`   Homepage URL: http://localhost:${PORT}`);
  console.log(`   Authorization callback URL: ${REDIRECT_URI}`);
  console.log(`\n🔧 Environment:`);
  console.log(`   GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GITHUB_HOST: ${GITHUB_HOST}`);
  
  console.log(`\n🔗 OAuth Metadata Endpoints:`);
  console.log(`   /.well-known/oauth-protected-resource`);
  console.log(`   /.well-known/oauth-authorization-server`);
  console.log(`\n🔐 MCP Endpoints (OAuth Protected):`);
  console.log(`   POST /mcp - Main MCP endpoint (requires Bearer token)`);
  console.log(`   GET  /mcp/sse - Server-Sent Events transport`);
  
  console.log(`\n📋 MCP Client Configuration (Local OAuth Endpoint):`);
  console.log(`\n   🎯 Claude Desktop (~/.claude_desktop_config.json):`);
  console.log(`   {`);
  console.log(`     "mcpServers": {`);
  console.log(`       "local-oauth-demo": {`);
  console.log(`         "command": "node",`);
  console.log(`         "args": ["http://localhost:${PORT}/mcp"],`);
  console.log(`         "transport": {`);
  console.log(`           "type": "http"`);
  console.log(`         }`);
  console.log(`       }`);
  console.log(`     }`);
  console.log(`   }`);
  
  console.log(`\n   🎯 OR with MCP Inspector for testing:`);
  console.log(`   npx @modelcontextprotocol/inspector http://localhost:${PORT}/mcp`);
  
  console.log(`\n   🎯 OR integrate with Octocode MCP Server:`);
  console.log(`   {`);
  console.log(`     "mcpServers": {`);
  console.log(`       "octocode-with-local-oauth": {`);
  console.log(`         "command": "npx",`);
  console.log(`         "args": ["octocode-mcp"],`);
  console.log(`         "env": {`);
  console.log(`           "GITHUB_OAUTH_CLIENT_ID": "${GITHUB_CLIENT_ID || 'your_client_id'}",`);
  console.log(`           "GITHUB_OAUTH_CLIENT_SECRET": "${GITHUB_CLIENT_SECRET ? '[REDACTED]' : 'your_client_secret'}",`);
  console.log(`           "GITHUB_OAUTH_REDIRECT_URI": "${REDIRECT_URI}",`);
  console.log(`           "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",`);
  console.log(`           "GITHUB_OAUTH_ENABLED": "true",`);
  console.log(`           "MCP_SERVER_RESOURCE_URI": "http://localhost:${PORT}"`);
  console.log(`         }`);
  console.log(`       }`);
  console.log(`     }`);
  console.log(`   }`);
  
  console.log(`\n🌊 OAuth Flow:`);
  console.log(`   1. MCP client connects to /mcp without token`);
  console.log(`   2. Server returns HTTP 401 with WWW-Authenticate header`);
  console.log(`   3. Client discovers OAuth endpoints from metadata`);
  console.log(`   4. Browser opens for GitHub authentication`);
  console.log(`   5. User authorizes, GitHub redirects with code`);
  console.log(`   6. Token exchange happens automatically`);
  console.log(`   7. Client uses Bearer token for all MCP requests`);
  
  console.log(`\n🧪 Test the OAuth flow:`);
  console.log(`   1. Visit http://localhost:${PORT} for traditional demo`);
  console.log(`   2. Test MCP endpoint: curl -X POST http://localhost:${PORT}/mcp`);
  console.log(`   3. Should get 401 with OAuth challenge`);
  console.log(`   4. Use MCP Inspector to test full OAuth flow`);
});

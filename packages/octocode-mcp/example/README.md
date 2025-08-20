# OAuth-Enabled MCP Server

A complete OAuth-enabled Model Context Protocol (MCP) server with GitHub authentication. This server implements the full MCP Authorization Protocol and provides a local OAuth endpoint that MCP clients can use for secure GitHub integration.

## ✨ Features

- **Complete MCP Authorization Protocol** implementation
- **OAuth 2.1 with PKCE** support
- **GitHub OAuth integration** for secure authentication  
- **Protected Resource Metadata** endpoints (RFC 9728)
- **Authorization Server Metadata** endpoints (RFC 8414)
- **Bearer token authentication** for MCP endpoints
- **Multiple transport methods** (HTTP, Server-Sent Events)
- **Development-friendly** with comprehensive logging and testing tools

## 🚀 Quick Start

### 1. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/applications/new)
2. Fill in the application details:
   - **Application name**: `MCP OAuth Server` (or any name you prefer)
   - **Homepage URL**: `http://localhost:3000`  
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Click "Register application"
4. Note down your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cd example/
cp env.example .env
# Edit .env and add your GitHub OAuth App credentials
```

Your `.env` file should contain:
```bash
GITHUB_CLIENT_ID=Iv1.your_actual_client_id
GITHUB_CLIENT_SECRET=your_actual_client_secret
```

⚠️ **Important**: Replace the placeholder values with your actual GitHub OAuth App credentials. The server will detect and reject placeholder values like `your_github_client_id_here`.

### 3. Install and Run

```bash
npm install
npm start
```

### 4. Test the Server

1. **Web Interface**: Navigate to http://localhost:3000
2. **OAuth Endpoints**: Check http://localhost:3000/.well-known/oauth-protected-resource
3. **MCP Endpoint**: Test with `curl -X POST http://localhost:3000/mcp` (should return 401)
4. **MCP Inspector**: `npx @modelcontextprotocol/inspector http://localhost:3000/mcp`

## 🔧 MCP Client Configuration

This server can be used in two ways:

### Option 1: Direct MCP Client Connection

Connect your MCP client directly to this OAuth-enabled server:

```json
{
  "mcpServers": {
    "local-oauth-server": {
      "command": "node", 
      "args": ["http://localhost:3000/mcp"],
      "transport": {
        "type": "http"
      }
    }
  }
}
```

### Option 2: Integrate with Octocode MCP Server

Use your OAuth credentials with the full Octocode MCP server:

```json
{
  "mcpServers": {
    "octocode-with-oauth": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "your_client_id",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret", 
        "GITHUB_OAUTH_REDIRECT_URI": "http://localhost:3000/api/auth/callback/github",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_OAUTH_ENABLED": "true",
        "MCP_SERVER_RESOURCE_URI": "http://localhost:3000"
      }
    }
  }
}
```

## 📋 Environment Variables

```bash
# Required: GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Optional: GitHub Enterprise Server (default: https://github.com)
GITHUB_HOST=https://github.enterprise.com

# Optional: Custom port (default: 3000) 
PORT=3000
```

## 🌊 OAuth Flow

The server implements the complete MCP Authorization Protocol:

1. **MCP client connects** to `/mcp` endpoint without token
2. **Server returns HTTP 401** with `WWW-Authenticate` header containing OAuth metadata
3. **Client discovers** OAuth endpoints from `/.well-known/oauth-protected-resource`
4. **Browser opens** for GitHub authentication
5. **User authorizes** application with requested scopes
6. **Token exchange** happens automatically via `/oauth/token` endpoint
7. **Client uses Bearer token** for all subsequent MCP requests

## 🔗 API Endpoints

### OAuth Metadata Endpoints
- `GET /.well-known/oauth-protected-resource` - Protected resource metadata (RFC 9728)
- `GET /.well-known/oauth-authorization-server` - Authorization server metadata (RFC 8414)

### OAuth Flow Endpoints  
- `GET /oauth/authorize` - OAuth authorization endpoint (with PKCE)
- `POST /oauth/token` - Token exchange endpoint
- `GET /api/auth/github` - GitHub OAuth initiation (for demo)
- `GET /api/auth/callback/github` - GitHub OAuth callback handler

### MCP Endpoints (OAuth Protected)
- `POST /mcp` - Main MCP endpoint (requires `Authorization: Bearer <token>`)
- `GET /mcp/sse` - Server-Sent Events transport
- `GET /health` - Server health check and configuration status

### Web Interface
- `GET /` - Interactive web interface for testing and configuration

## 🏢 GitHub Enterprise Server

For GitHub Enterprise Server, set the `GITHUB_HOST` environment variable:

```bash
GITHUB_HOST=https://github.enterprise.com
```

The server will automatically use the correct OAuth endpoints for your GHES instance.

## 📊 Scopes Requested

This server requests the following GitHub scopes:

- `repo` - Access to repository contents and metadata
- `read:user` - Read user profile information  
- `read:org` - Read organization membership and team information

These are the minimum recommended scopes for full GitHub integration functionality.

## 🧪 Testing & Development

### Test OAuth Challenge

```bash
# Test MCP endpoint without token (should return 401)
curl -X POST http://localhost:3000/mcp

# Check OAuth metadata
curl http://localhost:3000/.well-known/oauth-protected-resource
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

The Inspector will:
1. Connect to your MCP endpoint
2. Receive 401 Unauthorized with OAuth metadata
3. Discover OAuth endpoints automatically
4. Prompt for authentication with browser
5. Complete OAuth flow and use token for MCP requests

### Available MCP Tools

When authenticated, the server provides these MCP tools:

- `getUserInfo` - Get authenticated GitHub user information
- `listRepositories` - List user's GitHub repositories  
- `searchCode` - Search code across repositories

## 🛠️ Architecture

The server implements:

- **Express.js server** - Handles HTTP requests and OAuth flow
- **OAuth 2.1 with PKCE** - Secure authorization code flow
- **GitHub OAuth integration** - Exchanges codes for GitHub access tokens
- **MCP Protocol implementation** - JSON-RPC over HTTP with Bearer tokens
- **Protected Resource Metadata** - RFC 9728 compliant resource discovery
- **Authorization Server Metadata** - RFC 8414 compliant server discovery
- **Token management** - Secure token storage and validation
- **Multiple transports** - HTTP and Server-Sent Events support

## 🔒 Security Features

This server implements production-ready security practices:

- **OAuth 2.1 with PKCE** - Prevents authorization code interception attacks
- **State parameter validation** - Cryptographically secure CSRF protection
- **Bearer token authentication** - Secure token-based MCP access
- **Token audience validation** - Ensures tokens are intended for this server
- **Encrypted token storage** - Secure in-memory token management
- **Comprehensive input validation** - Sanitizes all OAuth parameters
- **RFC-compliant metadata** - Standard OAuth discovery endpoints

### Production Hardening

For production deployment, consider:

- Use Redis or database for token storage instead of in-memory maps
- Implement token refresh and expiration handling
- Add rate limiting on OAuth endpoints
- Use HTTPS for all OAuth flows (required by OAuth 2.1)
- Set up proper logging and monitoring
- Implement session management for web interface

## 📚 Related Documentation

- [Octocode MCP Installation Guide](../docs/INSTALLATION.md)
- [MCP OAuth Implementation Guide](../docs/mcp-oauth-guide.md)  
- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)

## 🐛 Troubleshooting

### Environment Variables
**"Missing required environment variables"**
- Copy `env.example` to `.env` in the `example/` directory
- Add your GitHub OAuth App Client ID and Secret
- Check startup logs for which variables are loaded

**"Bad URL with placeholder values (your_github_client_id_here)"**
- This means the `.env` file either doesn't exist or contains placeholder values
- Run: `cp env.example .env` to create the file
- Edit `.env` and replace all placeholder values with actual GitHub OAuth App credentials
- The server will detect and reject placeholder values for security

### OAuth Configuration  
**"OAuth redirect_uri mismatch"**
- Verify your OAuth App's callback URL matches exactly: `http://localhost:3000/api/auth/callback/github`
- No trailing slashes, exact port numbers required

**"OAuth state parameter mismatch"** 
- Clear browser cookies and restart OAuth flow
- State parameters expire after 15 minutes for security

### MCP Connection
**"401 Unauthorized from /mcp endpoint"**
- This is correct behavior - server is requesting OAuth authentication
- Use MCP Inspector or proper MCP client to complete OAuth flow
- Manual curl requests need `Authorization: Bearer <token>` header

**"MCP client can't discover OAuth endpoints"**
- Check that `/.well-known/oauth-protected-resource` returns valid JSON
- Ensure client supports MCP Authorization Protocol
- Try connecting directly with MCP Inspector for testing

### Token Issues
**"Token exchange failed"**
- Verify GitHub Client ID and Secret are correct
- Check network connectivity to GitHub OAuth endpoints
- Review GitHub OAuth app configuration and permissions

**"GitHub authentication works but MCP tools fail"**
- Check that scopes include `repo`, `read:user`, `read:org`
- Verify token hasn't expired (1 hour default)
- Review server logs for detailed error messages

## 📄 License

This demo is part of the Octocode MCP project and follows the same license terms.

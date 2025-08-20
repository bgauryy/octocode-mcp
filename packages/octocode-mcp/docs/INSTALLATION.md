# Octocode MCP Installation & Configuration Guide

## Table of Contents

- [Quick Start](#quick-start)
- [Authentication Overview](#authentication-overview)
- [OAuth 2.1 Setup](#oauth-21-setup)
- [GitHub App Setup](#github-app-setup)
- [Local Development Authentication](#local-development-authentication)
- [Enterprise Features](#enterprise-features)
- [MCP Client Configuration](#mcp-client-configuration)
- [GitHub Enterprise Server](#github-enterprise-server)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Quick Start

### Installation

```bash
# Install globally
npm install -g octocode-mcp

# Or run directly
npx octocode-mcp

# Docker deployment
docker run -i --rm -e GITHUB_TOKEN=your_token octocode/octocode-mcp:latest
```

### Minimum Requirements

The server requires at least one authentication method configured at startup:
- OAuth 2.1 credentials (recommended for production)
- GitHub App credentials (enterprise environments)
- Personal Access Token (development/testing)
- GitHub CLI authentication (local development only)

### Quick Local Development Setup

**For immediate local testing (no configuration needed):**
```bash
# 1. Install and authenticate GitHub CLI
brew install gh
gh auth login

# 2. Run MCP server directly
npx octocode-mcp
# ✅ Should work immediately with CLI token

# 3. Or use Personal Access Token
export GITHUB_TOKEN="ghp_your_token_here"
npx octocode-mcp
```

**Local development features:**
- ✅ GitHub CLI tokens work automatically (unless Enterprise mode is enabled)
- ✅ No organization validation required
- ✅ All tools available immediately
- ✅ Fallback token resolution: `GITHUB_TOKEN` → `GH_TOKEN` → CLI → `Authorization`

### Enterprise Mode Detection

**Important:** Enterprise mode is automatically enabled when ANY of these environment variables are set:
- `GITHUB_ORGANIZATION` (any value)
- `AUDIT_ALL_ACCESS=true`  
- `GITHUB_SSO_ENFORCEMENT=true`
- `RATE_LIMIT_API_HOUR` (any value)
- `RATE_LIMIT_AUTH_HOUR` (any value)
- `RATE_LIMIT_TOKEN_HOUR` (any value)

When Enterprise mode is enabled, GitHub CLI authentication is automatically disabled for security.

## Authentication Overview

The MCP server supports multiple authentication methods with automatic fallback. Authentication sources are evaluated in the following priority order:

### Token Resolution Priority

1. **OAuth 2.1 Access Token** - Stored securely with automatic refresh
2. **GitHub App Installation Token** - Auto-refresh via JWT authentication
3. **GITHUB_TOKEN Environment Variable** - Personal Access Token
4. **GH_TOKEN Environment Variable** - Alternative PAT variable
5. **GitHub CLI Token** - From `gh auth token` (**automatically disabled in Enterprise mode**)
6. **Authorization Environment Variable** - Bearer token format

**Note:** When Enterprise mode is enabled (see [Enterprise Features](#enterprise-features)), GitHub CLI token resolution is automatically disabled for security reasons.

### Required GitHub Permissions

The following scopes are required for full functionality:

| Scope | Purpose | Required For |
|-------|---------|--------------|
| `repo` | Access to repository contents and metadata | Code search, file fetch, private repositories |
| `read:user` | User identity and token validation | Authentication validation, rate limits |
| `read:org` | Organization membership verification | Enterprise features, team validation |

For fine-grained Personal Access Tokens, grant these permissions:
- Contents: Read
- Metadata: Read  
- Pull requests: Read

## OAuth 2.1 Setup

OAuth 2.1 with PKCE provides the most secure authentication method for production deployments. The implementation is fully compliant with MCP Authorization Protocol requirements.

### MCP Authorization Protocol Compliance

- **RFC 8707**: Resource parameter in all OAuth requests
- **RFC 9728**: Protected Resource Metadata endpoint
- **RFC 6750**: Bearer token authentication with WWW-Authenticate headers
- **RFC 7636**: PKCE (Proof Key for Code Exchange) with S256 challenge method
- **OAuth 2.1**: Modern security practices and automatic token refresh

### Environment Configuration

Configure the following environment variables for OAuth:

```bash
# Required OAuth Configuration
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_OAUTH_REDIRECT_URI=http://127.0.0.1:8765/auth/callback
GITHUB_OAUTH_SCOPES=repo,read:user,read:org
GITHUB_OAUTH_ENABLED=true

# MCP Server Resource URI (RFC 8707 compliance - required)
MCP_SERVER_RESOURCE_URI=https://api.github.com/mcp-server

# Optional: GitHub Enterprise Server
GITHUB_HOST=https://github.enterprise.com
GITHUB_OAUTH_AUTH_URL=https://github.enterprise.com/login/oauth/authorize
GITHUB_OAUTH_TOKEN_URL=https://github.enterprise.com/login/oauth/access_token
```

### OAuth Callback Methods

Three callback methods are supported for different deployment scenarios:

#### Local Server Method (Recommended)

The server starts a temporary HTTP server to capture the OAuth callback automatically.

```json
{
  "callbackMethod": "local_server",
  "callbackPort": 8765,
  "scopes": ["repo", "read:user", "read:org"]
}
```

**Process:**
1. MCP server starts temporary HTTP server on localhost:8765
2. User visits authorization URL in browser  
3. GitHub redirects to http://localhost:8765/auth/callback
4. Server captures authorization code automatically
5. Token exchange happens in background
6. Callback server shuts down automatically

**Best for:** Desktop MCP clients, local development

#### Manual Method

User manually provides the authorization code from the callback URL.

```json
{
  "callbackMethod": "manual",
  "scopes": ["repo", "read:user"]
}
```

**Process:**
1. User visits authorization URL in browser
2. GitHub redirects to configured callback URL
3. User copies code and state parameters from URL
4. User provides these to oauthCallback tool
5. Token exchange completes

**Best for:** Headless servers, CI/CD environments

#### Deep Link Method

Advanced integration for MCP gateways with built-in callback support.

```json
{
  "callbackMethod": "deep_link",
  "scopes": ["repo", "read:user", "read:org"]  
}
```

**Requirements:**
- Set `ALLOW_OAUTH_DEEP_LINK=true`
- MCP client must support deep link callbacks
- Advanced integration scenarios only

### PKCE Authorization Code Flow

```mermaid
sequenceDiagram
  participant U as User
  participant C as MCP Client
  participant S as Octocode MCP
  participant G as GitHub OAuth Server

  C->>S: oauthInitiate (scopes, method)
  S->>S: Generate state + PKCE (code_verifier/challenge)
  S-->>C: authorizationUrl + state
  C->>U: Open authorizationUrl
  U->>G: Authorize application
  G-->>U: Redirect to redirect_uri with code + state
  U-->>C: Provide code + state (manual/local_server/deep_link)
  C->>S: oauthCallback(code, state)
  S->>G: Exchange code + verifier for tokens
  G-->>S: access_token (+ refresh_token)
  S->>S: Store tokens securely (auto-refresh)
  S-->>C: Success (scopes, metadata)
```

### OAuth Security Features

The implementation includes enterprise-grade security features:

- **PKCE Protection**: S256 code challenge method prevents authorization code interception
- **State Validation**: Cryptographically secure state parameters with timing-safe comparison
- **Token Security**: AES-256-GCM encrypted storage with automatic refresh
- **Audience Validation**: Proper token audience checking per MCP specification
- **Scope Management**: Runtime scope override with least-privilege principle

## GitHub App Setup

GitHub Apps provide enterprise-grade authentication with fine-grained permissions and automatic token refresh.

### Environment Configuration

```bash
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_APP_ENABLED=true

# Optional: GitHub Enterprise Server
GITHUB_HOST=https://github.enterprise.com
```

### Features

- **Automatic Token Refresh**: Installation tokens refreshed via JWT
- **Fine-grained Permissions**: Repository and organization level access control  
- **Enterprise Integration**: Full audit logging and organization management
- **High Rate Limits**: Higher API rate limits compared to Personal Access Tokens

## Local Development Authentication  

For local development and testing, several simpler authentication methods are available.

### Personal Access Tokens

Create a Personal Access Token and set it as an environment variable:

```bash
# Classic Personal Access Token
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Or alternative variable name
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Or Authorization header format
export Authorization="Bearer ghp_xxxxxxxxxxxxxxxxxxxx"
```

Create tokens at:
- [Fine-grained PAT](https://github.com/settings/personal-access-tokens/new) (recommended)
- [Classic PAT](https://github.com/settings/tokens/new)

### GitHub CLI Authentication

**WARNING: GitHub CLI authentication is automatically disabled when Enterprise mode is enabled**

For local development only (when Enterprise mode is NOT enabled):

```bash
# macOS installation
brew install gh

# Authenticate with GitHub
gh auth login
gh auth status

# Verify token (first 5 characters only)
gh auth token | head -c 5 && echo '*****'
```

**Enterprise Mode Check:** If you have set any of these variables, CLI authentication will be disabled:
- `GITHUB_ORGANIZATION`, `AUDIT_ALL_ACCESS=true`, `GITHUB_SSO_ENFORCEMENT=true`, or any `RATE_LIMIT_*` variables

Use Personal Access Tokens, OAuth, or GitHub App authentication instead in Enterprise mode.

### Environment File

Create a `.env` file for development:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_HOST=github.com
# GITHUB_ORGANIZATION=your-org  # Uncomment to enable Enterprise mode
```

### Testing Local Authentication

You can verify your local authentication setup works correctly:

```bash
# Test GitHub CLI authentication
gh auth status

# Test token access (shows first 10 characters only)
gh auth token | head -c 10 && echo "..."

# Test MCP server startup with local auth
npx octocode-mcp
# Should show: [AUDIT] token_detected: {"outcome":"success"...}
```

**Expected behavior in local development mode:**
- ✅ GitHub CLI tokens are **enabled** (no enterprise restrictions)
- ✅ Token resolution follows priority: `GITHUB_TOKEN` → `GH_TOKEN` → CLI → `Authorization`
- ✅ All MCP tools should be available immediately
- ✅ No organization validation or audit logging (unless explicitly enabled)

## Enterprise Features

### When Enterprise Mode is Enabled

**Enterprise mode is automatically enabled when ANY of these environment variables are set:**

| Environment Variable | Trigger Condition | Effect |
|---------------------|------------------|--------|
| `GITHUB_ORGANIZATION` | Any value | Organization-based access control |
| `AUDIT_ALL_ACCESS` | Must equal `true` | Audit logging enabled |
| `GITHUB_SSO_ENFORCEMENT` | Must equal `true` | SSO authentication required |
| `RATE_LIMIT_API_HOUR` | Any value | API rate limiting enabled |
| `RATE_LIMIT_AUTH_HOUR` | Any value | Auth rate limiting enabled |
| `RATE_LIMIT_TOKEN_HOUR` | Any value | Token rate limiting enabled |

**Important:** Setting **any one** of these variables enables Enterprise mode. Once enabled:
- GitHub CLI token resolution is automatically disabled for security
- Enterprise security policies are enforced
- Additional organization validation occurs
- Audit logging becomes available (if `AUDIT_ALL_ACCESS=true`)
- Rate limiting becomes available (if any `RATE_LIMIT_*` variables are set)

### Core Enterprise Features

#### Organization Management
```bash
GITHUB_ORGANIZATION=your-org
RESTRICT_TO_MEMBERS=true
GITHUB_REQUIRED_TEAMS=developers,security
GITHUB_ADMIN_USERS=admin1,admin2
```

#### Audit Logging
```bash
AUDIT_ALL_ACCESS=true
AUDIT_LOG_DIR=./logs/audit
```

Logs are written in JSONL format with daily rotation. All access attempts, token usage, and API calls are logged with sanitized content.

#### Rate Limiting
```bash
RATE_LIMIT_API_HOUR=1000
RATE_LIMIT_AUTH_HOUR=100
RATE_LIMIT_TOKEN_HOUR=50
```

Per-user rate limiting with automatic cleanup and configurable limits.

#### SSO Enforcement
```bash
GITHUB_SSO_ENFORCEMENT=true
```

Enforces Single Sign-On authentication and blocks CLI tokens in SSO-enabled organizations.

### Security Policies

Enterprise mode includes built-in security policies:
- Organization membership validation
- Team-based access control
- MFA requirement enforcement
- Repository access restrictions
- Token validation and rotation

## MCP Client Configuration

### Claude Desktop Configuration

**OAuth-enabled setup** (Recommended for production):
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "Iv1.a629723d4c8a5678",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret_here",
        "GITHUB_OAUTH_REDIRECT_URI": "http://127.0.0.1:8765/auth/callback",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_OAUTH_ENABLED": "true",
        "MCP_SERVER_RESOURCE_URI": "https://api.github.com/mcp-server",
        "GITHUB_ORGANIZATION": "your-org"
      }
    }
  }
}
```

**PAT-based setup** (Quick development):
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx", 
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### MCP Gateway Configuration

**YAML format** for gateway deployments:
```yaml
servers:
  - name: octocode
    command: ["npx", "octocode-mcp"]
    environment:
      # OAuth Configuration
      GITHUB_OAUTH_CLIENT_ID: "Iv1.a629723d4c8a5678"
      GITHUB_OAUTH_CLIENT_SECRET: "your_client_secret_here"
      GITHUB_OAUTH_REDIRECT_URI: "https://your-gateway.com/auth/callback"
      GITHUB_OAUTH_SCOPES: "repo,read:user,read:org"
      GITHUB_OAUTH_ENABLED: "true"
      MCP_SERVER_RESOURCE_URI: "https://your-gateway.com/mcp-server"
      
      # Enterprise Features
      GITHUB_ORGANIZATION: "your-org"
      AUDIT_ALL_ACCESS: "true"
      RATE_LIMIT_API_HOUR: "5000"
      
      # Security Settings  
      ALLOW_OAUTH_DEEP_LINK: "true"
      START_METADATA_SERVER: "true"
```

### First-Time OAuth Setup

When you first connect with OAuth configured:

1. **Client connects** to your MCP server
2. **Server returns 401** with `WWW-Authenticate` header containing OAuth metadata
3. **Client discovers** authorization server from `.well-known/oauth-protected-resource`
4. **Browser opens** automatically to GitHub OAuth authorization page
5. **User authorizes** your application with requested scopes
6. **GitHub redirects** back to callback URL with authorization code
7. **Token exchange** happens automatically (PKCE verification)
8. **Client receives** access token and can now use all MCP tools

The entire flow is seamless for users - they just see a browser window for GitHub login once.

## GitHub Enterprise Server

When using GitHub Enterprise Server, configure these variables to target your instance:

```bash
GITHUB_HOST=https://github.enterprise.com

# OAuth endpoints (optional - derived from GITHUB_HOST if not specified)
GITHUB_OAUTH_AUTH_URL=https://github.enterprise.com/login/oauth/authorize
GITHUB_OAUTH_TOKEN_URL=https://github.enterprise.com/login/oauth/access_token
```

**Effects:**
- Authorization URL and token URL use GHES host
- API base is `${GITHUB_HOST}/api/v3`
- All GitHub App and OAuth flows target your enterprise instance

## Configuration Reference

### Core Authentication Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No* | `ghp_xxxxxxxxxxxx` | Personal Access Token |
| `GH_TOKEN` | No* | `ghp_xxxxxxxxxxxx` | Alternative PAT variable |
| `Authorization` | No* | `Bearer ghp_xxx` | Authorization header format |
| `GITHUB_HOST` | No | `https://github.company.com` | GitHub Enterprise Server URL |

### OAuth Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_OAUTH_CLIENT_ID` | Yes† | `Iv1.a629723d4c8a5678` | GitHub OAuth App Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes† | `abc123...` | GitHub OAuth App Client Secret |
| `GITHUB_OAUTH_REDIRECT_URI` | Yes† | `https://yourapp.com/auth/callback` | OAuth callback URL |
| `GITHUB_OAUTH_SCOPES` | No | `repo,read:user,read:org` | Comma-separated scopes |
| `GITHUB_OAUTH_ENABLED` | No | `true` | Enable OAuth authentication |
| `MCP_SERVER_RESOURCE_URI` | Yes† | `https://yourapp.com/mcp-server` | MCP resource identifier (RFC 8707) |

### GitHub App Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_APP_ID` | Yes‡ | `123456` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes‡ | `-----BEGIN RSA...` | GitHub App private key |
| `GITHUB_APP_INSTALLATION_ID` | No | `12345678` | Installation ID |
| `GITHUB_APP_ENABLED` | No | `true` | Enable GitHub App authentication |

### Enterprise Configuration

| Variable | Default | Example | Description |
|----------|---------|---------|-------------|
| `GITHUB_ORGANIZATION` | - | `my-company` | Organization name for validation |
| `AUDIT_ALL_ACCESS` | `false` | `true` | Enable audit logging |
| `GITHUB_SSO_ENFORCEMENT` | `false` | `true` | Enforce SSO authentication |
| `RESTRICT_TO_MEMBERS` | `false` | `true` | Restrict access to org members |
| `REQUIRE_MFA` | `false` | `true` | Require multi-factor authentication |
| `RATE_LIMIT_API_HOUR` | - | `1000` | API requests per hour per user |
| `RATE_LIMIT_AUTH_HOUR` | - | `100` | Auth requests per hour per user |
| `RATE_LIMIT_TOKEN_HOUR` | - | `50` | Token requests per hour per user |

### Server Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `START_METADATA_SERVER` | No | `true` | Start metadata server for strict enterprises |
| `ALLOW_OAUTH_DEEP_LINK` | No | `true` | Enable deep link OAuth callbacks |

**Footnotes:** *At least one authentication method required. †Required for OAuth. ‡Required for GitHub App.

## Troubleshooting

### OAuth Issues

**"OAuth redirect_uri mismatch"**
- Callback URL in GitHub OAuth App must exactly match `GITHUB_OAUTH_REDIRECT_URI`
- For local development: `http://127.0.0.1:8765/auth/callback`
- For production: `https://yourapp.com/auth/callback`
- No trailing slashes, exact port numbers required

**"OAuth state parameter mismatch"**
- Clear browser cookies and restart OAuth flow
- Check that `oauthCallback` is called within 15 minutes of `oauthInitiate`
- Verify session storage is working properly

**"Token exchange failed"**
- Verify GitHub Client ID and Secret are correct
- Check network connectivity to GitHub OAuth endpoints
- Ensure `MCP_SERVER_RESOURCE_URI` is set correctly
- Review GitHub OAuth app permissions and settings

**"Missing resource parameter"**
- Ensure you're using the latest version with RFC 8707 compliance
- Set `MCP_SERVER_RESOURCE_URI` environment variable
- Should be automatically included in OAuth requests

### Token Issues

**"No token found at startup"**
- Ensure one of: OAuth configured, GitHub App configured, `GITHUB_TOKEN`/`GH_TOKEN`, CLI (non-enterprise), or `Authorization` env
- Check token precedence: OAuth → GitHub App → ENV → CLI → Authorization header

**Testing Local Development Authentication:**
```bash
# 1. Check if Enterprise mode would be enabled
env | grep -E "(GITHUB_ORGANIZATION|AUDIT_ALL_ACCESS|GITHUB_SSO_ENFORCEMENT|RATE_LIMIT_)" || echo "✅ Local development mode"

# 2. Test GitHub CLI authentication
gh auth status
gh auth token | head -c 10 && echo "..." # Shows first 10 chars

# 3. Test different token methods (in priority order)
export GITHUB_TOKEN="your_pat_token"     # Highest priority
export GH_TOKEN="your_alt_pat_token"     # Alternative PAT
# CLI token used automatically if no env vars set
export Authorization="Bearer your_token"  # Lowest priority

# 4. Test server startup
npx octocode-mcp
# Look for: [AUDIT] token_detected: {"outcome":"success"...}
```

**"CLI token ignored"**
- Enterprise mode automatically disables CLI tokens for security
- **Check if you have Enterprise mode enabled:** Look for any of these variables: `GITHUB_ORGANIZATION`, `AUDIT_ALL_ACCESS=true`, `GITHUB_SSO_ENFORCEMENT=true`, or any `RATE_LIMIT_*` variables
- Use Personal Access Tokens, OAuth, or GitHub App authentication instead

**"Token expired"**
- OAuth and GitHub App tokens auto-refresh automatically
- PATs require manual renewal when expired
- Check token expiration with `oauthStatus` tool

**"Missing scopes"**
- Add `read:org` to `GITHUB_OAUTH_SCOPES` or PAT scopes
- For private repos: ensure `repo` scope is granted
- Scopes must be comma-separated in environment: `repo,read:user,read:org`

### Network Issues

**"401 Unauthorized with `WWW-Authenticate` header"**
- Server correctly signals `missing_token` or `invalid_token`
- Include valid `Authorization: Bearer <token>` in requests
- OAuth clients should automatically handle this challenge
- Resource metadata URL points to `.well-known/oauth-protected-resource`

**"Connection refused on localhost:8765"**
- OAuth callback server may not have started
- Check if port is available and not blocked by firewall
- Try different port with `callbackPort` parameter

**"GitHub API rate limits exceeded"**
- Configure rate limiting with `RATE_LIMIT_*` environment variables
- Use OAuth tokens (higher rate limits) instead of PATs
- Check current rate limit with GitHub API

### Enterprise Issues

**"Organization membership validation failed"**
- Ensure user is member of configured `GITHUB_ORGANIZATION`
- Check that OAuth token has `read:org` scope
- Verify organization name is correct (case-sensitive)

**"Audit logging not working"**
- Ensure `AUDIT_ALL_ACCESS=true` is set
- Check that `AUDIT_LOG_DIR` is writable
- Logs are buffered and flushed every 5 minutes

**"SSO enforcement blocking access"**
- Set `GITHUB_SSO_ENFORCEMENT=true` only in SSO-enabled orgs
- Use OAuth or GitHub App tokens (not CLI tokens)
- Ensure SSO is configured properly in organization settings

## Security Best Practices

### Token Management
- Prefer OAuth/GitHub App with automatic rotation for long-lived deployments
- Keep Personal Access Token scopes minimal and rotate periodically
- Never log tokens or paste them in chats/issue trackers
- Use HTTPS for OAuth callbacks and validate redirect URIs

### Enterprise Security
- Enable audit logging and rate limiting in enterprise deployments
- Use organization membership validation and team-based access control
- Enforce SSO authentication where required
- Implement MFA requirements for sensitive operations

### Network Security
- Use TLS/HTTPS for all OAuth callback URLs
- Validate redirect URIs strictly
- Implement proper CORS policies for web-based callbacks
- Monitor and log all authentication attempts

### Operational Security  
- Regularly rotate secrets and tokens
- Monitor audit logs for suspicious activity
- Implement proper backup and disaster recovery for credential stores
- Use environment-specific configurations (dev/staging/prod)

This installation guide provides comprehensive coverage of all authentication methods and deployment scenarios supported by Octocode MCP.
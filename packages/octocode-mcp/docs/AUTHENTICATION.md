# 🔐 Authentication & Token Management Guide

**Octocode-MCP** provides a comprehensive authentication system supporting multiple token sources and enterprise-grade security. This guide covers everything developers need to know about authentication, from local development to production deployment.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Server Modes](#server-modes)
- [Authentication Flow](#authentication-flow)
- [Token Sources & Priority](#token-sources--priority)
- [Local Development Setup (Stdio)](#local-development-setup-stdio)
- [Production/Hosted Setup (HTTP)](#productionhosted-setup-http)
- [Enterprise Features](#enterprise-features)
- [OAuth 2.0 Integration](#oauth-20-integration)
- [GitHub App Authentication](#github-app-authentication)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

> For the complete HTTP server flow, OAuth routes, and session lifecycle, see [SERVER.md](./SERVER.md).

## 🚀 Quick Start

### For Local Development (Stdio Mode)
```bash
# Option 1: Using GitHub CLI (Recommended for local dev)
gh auth login

# Option 2: Using Personal Access Token
export GITHUB_TOKEN="your_github_token_here"

# Option 3: Using GH_TOKEN (alternative)
export GH_TOKEN="your_github_token_here"

# Start stdio server
npx octocode-mcp
```

### For Production/Hosted (HTTP Mode)
```bash
# Option 1: OAuth with mcp-s-oauth (Recommended for hosted services)
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"
export BASE_URL="https://yourapp.com"

# Option 2: GitHub App (Enterprise)
export GITHUB_APP_ID="your_app_id"
export GITHUB_APP_PRIVATE_KEY="your_private_key"
export GITHUB_APP_INSTALLATION_ID="installation_id"
export GITHUB_APP_ENABLED="true"

# Start HTTP server
npx octocode-mcp-server
# or
node dist/server.js
```

## 🖥️ Server Modes

Octocode-MCP supports **two distinct server modes**, each optimized for different use cases:

### 📡 **Stdio Mode** (`index.ts`)
- **Transport**: `StdioServerTransport` - communicates via stdin/stdout
- **Best for**: Local development, CLI tools, desktop applications
- **Authentication**: Token Manager with comprehensive fallback chain
- **Usage**: `npx octocode-mcp` or direct Node.js execution
- **Benefits**: 
  - Simple setup for local development
  - Works with GitHub CLI authentication
  - No network configuration required
  - Perfect for MCP client integrations

### 🌐 **HTTP Mode** (`server.ts`)
- **Transport**: `StreamableHTTPServerTransport` - HTTP/WebSocket server
- **Best for**: Web applications, hosted services, production deployments
- **Authentication**: `mcp-s-oauth` with GitHub OAuth 2.0 flow
- **Usage**: `npx octocode-mcp-server`

> 📖 **Complete HTTP Server Guide**: For setup, OAuth configuration, session management, and deployment, see **[SERVER.md](./SERVER.md)**

### 🔄 **Mode Selection**

| Feature | Stdio Mode | HTTP Mode |
|---------|------------|-----------|
| **Setup Complexity** | ⭐ Simple | ⭐⭐⭐ Moderate |
| **Authentication** | Token fallback chain | OAuth 2.0 flow |
| **User Experience** | CLI-based | Web-based |
| **Scalability** | Single user | Multi-user |
| **Production Ready** | Local/Desktop | Web/Cloud |
| **Network Requirements** | None | HTTP server |

Both modes share the **same tool ecosystem** and security features, ensuring consistent functionality regardless of transport method.

## 🔐 Required GitHub Scopes (and Why)

Octocode MCP performs read-only analysis across repositories. It never writes to GitHub.

Recommended minimum scopes:

| Scope | Why it's needed | Features enabled |
|------|------------------|------------------|
| `repo` (or fine‑grained: Contents: Read, Metadata: Read, Pull requests: Read) | Read private repository contents and metadata | Code search, file fetch, repo structure, PR/commit search for private repos |
| `read:user` | Identify the authenticated user and validate token | User context, rate limit checks, token validation |
| `read:org` | Verify organization membership and team policies | Enterprise org/teams validation, policy enforcement |

Notes:
- For classic PATs, use `repo` + `read:user` + `read:org`.
- For Fine‑grained PATs, prefer read‑only permissions: Repository contents (Read), Metadata (Read), Pull requests (Read). Do not grant write scopes.
- OAuth apps should request the same read scopes; see the `GITHUB_OAUTH_SCOPES` example below.

---

## 🔄 Authentication Flow

Octocode-MCP uses a **unified authentication system** that adapts to both server modes:

### Stdio Mode Flow (`index.ts`)
```mermaid
graph TD
    A[Stdio Server Startup] --> B[Initialize Authentication Manager]
    B --> C[Initialize Token Manager]
    C --> D[Initialize Enterprise Features]
    D --> E[Register Tools]
    E --> F[Connect StdioServerTransport]
    F --> G[Server Ready - stdin/stdout]
    
    C --> C1[OAuth Token Check]
    C --> C2[GitHub App Token Check]
    C --> C3[Environment Variables]
    C --> C4[GitHub CLI Token]
    C --> C5[Authorization Header]
```

### HTTP Mode Flow (`server.ts`)
```mermaid
graph TD
    A[HTTP Server Startup] --> B[Initialize Express App]
    B --> C[Configure mcp-s-oauth]
    C --> D[Initialize Enterprise Features]
    D --> E[Create MCP Handler]
    E --> F[Register Tools per Session]
    F --> G[Start HTTP Server]
    G --> H[Server Ready - OAuth Flow]
    
    C --> C1[GitHub OAuth Connector]
    C --> C2[Session Management]
    C --> C3[Token Storage]
    C --> C4[Automatic Refresh]
```

> 📖 **Complete HTTP Flow Details**: For detailed sequence diagrams, session management, and token flow explanations, see **[SERVER.md - Complete Request Flow](./SERVER.md#complete-request-flow)**

### Key Components

1. **[AuthenticationManager](../src/auth/authenticationManager.ts)** - Single entry point for all auth
2. **[TokenManager](../src/mcp/tools/utils/tokenManager.ts)** - Handles token resolution and caching
3. **[ServerConfig](../src/config/serverConfig.ts)** - Configuration management
4. **[EnterpriseUtils](../src/utils/enterpriseUtils.ts)** - Enterprise feature detection
5. **[SecurityValidation](../src/mcp/tools/utils/withSecurityValidation.ts)** - Request validation

## 🔑 Token Sources & Priority

Octocode-MCP resolves tokens in the following **priority order**:

### 1. **OAuth Token** (Highest Priority)
- **Best for**: Hosted services, web applications
- **Storage**: Secure credential store with automatic refresh
- **Expiration**: Automatic token refresh using refresh tokens

### 2. **GitHub App Token**
- **Best for**: Enterprise installations, organization-wide access
- **Storage**: Secure credential store with automatic refresh
- **Expiration**: Automatic token refresh using JWT

### 3. **Environment Variables**
- **`GITHUB_TOKEN`** (preferred)
- **`GH_TOKEN`** (fallback)
- **Best for**: CI/CD, production environments
- **Storage**: Environment variables

### 4. **GitHub CLI**
- **Best for**: Local development
- **Command**: `gh auth token`
- **Note**: Disabled in enterprise mode for security

### 5. **Authorization Header**
- **Best for**: Direct API calls
- **Format**: `Authorization: Bearer <token>`
- **Note**: Lowest priority fallback

### Token Selection & Fallback Flow

```mermaid
flowchart TD
    Start([Start Token Resolution]) --> CheckOAuth{OAuth token
available?}
    CheckOAuth -- Yes --> ValidateOAuth{Token expired?}
    ValidateOAuth -- No --> UseOAuth[Use OAuth access token]
    ValidateOAuth -- Yes --> RefreshOAuth{Refresh token
available?}
    RefreshOAuth -- Yes --> DoRefresh[Refresh OAuth token]
    RefreshOAuth -- No --> ClearOAuth[Clear expired token]
    DoRefresh --> UseOAuth
    ClearOAuth --> CheckApp
    
    CheckOAuth -- No --> CheckApp{GitHub App token
available?}
    CheckApp -- Yes --> ValidateApp{Token expired?}
    ValidateApp -- No --> UseApp[Use GitHub App installation token]
    ValidateApp -- Yes --> RefreshApp[Refresh GitHub App token]
    RefreshApp --> UseApp
    
    CheckApp -- No --> CheckEnv{Env token
available?}
    CheckEnv -- GITHUB_TOKEN --> UseEnv1[Use GITHUB_TOKEN]
    CheckEnv -- GH_TOKEN --> UseEnv2[Use GH_TOKEN]
    CheckEnv -- None --> CheckEnterprise{Enterprise mode?}
    CheckEnterprise -- No --> TryCLI{GitHub CLI token
available?}
    TryCLI -- Yes --> UseCLI[Use gh auth token]
    TryCLI -- No --> CheckAuthHeader{Authorization header
available?}
    CheckEnterprise -- Yes --> SkipCLI[Skip CLI for security]
    SkipCLI --> CheckAuthHeader
    CheckAuthHeader -- Yes --> UseHeader[Use Authorization header token]
    CheckAuthHeader -- No --> Fail[No token found → error]

    %% Success nodes converge
    UseOAuth --> CacheToken[Cache token with metadata]
    UseApp --> CacheToken
    UseEnv1 --> CacheToken
    UseEnv2 --> CacheToken
    UseCLI --> CacheToken
    UseHeader --> CacheToken
    CacheToken --> Done([Token ready])
```

### Enterprise-Aware Fallback Decision

```mermaid
flowchart LR
    A[Enterprise mode detected] --> B{CLI token allowed?}
    B -- No --> C[Skip CLI to prevent insecure auth]
    C --> D[Require OAuth/GitHub App/Env tokens]
    B -- Yes --> E[Allow CLI for local/dev only]
```

## 💻 Local Development Setup (Stdio)

### Method 1: GitHub CLI (Recommended)

The easiest way for local development:

```bash
# Install GitHub CLI
brew install gh  # macOS
# or
sudo apt install gh  # Ubuntu

# Authenticate
gh auth login

# Verify authentication
gh auth status

# Start Octocode-MCP
npx octocode-mcp
```

### Method 2: Personal Access Token

1. **Create a Personal Access Token**:
   - Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `read:user`, `read:org`
   - Copy the token

2. **Set Environment Variable**:
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
# or
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

3. **Make it Persistent** (Optional):
```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
echo 'export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"' >> ~/.zshrc
source ~/.zshrc
```

### Method 3: Development with .env File

Create a `.env` file in your project root:

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_HOST=github.com  # Optional: for GitHub Enterprise
GITHUB_ORGANIZATION=my-org  # Optional: for organization access
```

## 🏢 Production/Hosted Setup (HTTP)

For web applications and hosted services:

> 📖 **Complete HTTP Server Setup Guide**: For detailed OAuth configuration, deployment instructions, and production best practices, see **[SERVER.md](./SERVER.md)**

**Quick Start:**
```bash
# Required OAuth credentials
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"
export BASE_URL="https://yourapp.com"

# Start HTTP server
npx octocode-mcp-server
```

The HTTP server uses the `mcp-s-oauth` package for seamless OAuth 2.0 integration with automatic token management and session handling.

### GitHub App Setup (Enterprise)

For organization-wide installations:

```bash
export GITHUB_APP_ID="123456"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
export GITHUB_APP_INSTALLATION_ID="12345678"
export GITHUB_APP_ENABLED="true"
```

> 📖 **Complete GitHub App Setup**: For detailed GitHub App creation, private key generation, and configuration steps, see **[SERVER.md - GitHub App Configuration](./SERVER.md#github-app-configuration-enterprise)**

### Simple Token Setup

For basic production environments:

```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

## 🏢 Enterprise Features

> 📖 **Enterprise Deployment Guide**: For complete enterprise setup, security configuration, and monitoring, see **[SERVER.md - Security](./SERVER.md#security)** and **[SERVER.md - Monitoring & Logging](./SERVER.md#monitoring--logging)**

Enable enterprise features for enhanced security and compliance:

```bash
# Enterprise Configuration
export GITHUB_ORGANIZATION="your-org"
export AUDIT_ALL_ACCESS="true"
export GITHUB_SSO_ENFORCEMENT="true"
export GITHUB_TOKEN_VALIDATION="true"
export GITHUB_PERMISSION_VALIDATION="true"

# Rate Limiting
export RATE_LIMIT_API_HOUR="5000"
export RATE_LIMIT_AUTH_HOUR="1000"
export RATE_LIMIT_TOKEN_HOUR="100"
```

### Enterprise Features Include:

- **🔍 Audit Logging**: Complete audit trail of all operations
- **⚡ Rate Limiting**: Configurable rate limits per user/organization
- **🏢 Organization Validation**: Restrict access to organization members
- **🔒 SSO Enforcement**: Require SSO authentication
- **🛡️ Token Validation**: Enhanced token security checks
- **📊 Permission Validation**: Granular permission checking

### 📋 What Gets Logged (Audit Trail)

When `AUDIT_ALL_ACCESS=true` is enabled, Octocode-MCP logs comprehensive security and operational events:

#### **🔐 Authentication Events**
- **Token Resolution**: Which token source was used (OAuth, GitHub App, env, CLI)
- **Token Validation**: Success/failure of token validation checks
- **Token Rotation**: Automatic token refresh operations
- **Authentication Failures**: Failed authentication attempts with details

#### **🛠️ Tool Execution Events**
- **Tool Calls**: Every MCP tool execution with parameters (sanitized)
- **API Requests**: GitHub API calls made by tools
- **Resource Access**: File content fetching and repository access
- **Search Operations**: Code search, repository search, and commit search activities

#### **🏢 Organization & Access Control**
- **Membership Validation**: Organization membership checks
- **Access Grants/Denials**: Permission-based access decisions
- **SSO Enforcement**: Single sign-on requirement validations
- **Policy Violations**: Security policy enforcement actions

#### **🚨 Security Events**
- **Rate Limit Hits**: When rate limits are exceeded
- **Suspicious Activity**: Unusual access patterns or requests
- **Content Sanitization**: When sensitive content is filtered
- **Command Validation**: Security validation of user inputs

#### **📊 System Events**
- **Server Startup/Shutdown**: System lifecycle events
- **Configuration Changes**: Runtime configuration updates
- **Error Conditions**: System errors and recovery actions
- **Performance Metrics**: Token usage and API call statistics

#### **📁 Log Storage & Format**

**Development Mode** (`NODE_ENV !== 'production'`):
- Logs to `stderr` in real-time for debugging
- Format: `[AUDIT] action_name: {"outcome":"success","userId":"user123",...}`

**Production Mode** (`AUDIT_ALL_ACCESS=true`):
- **File Location**: `./logs/audit/audit-YYYY-MM-DD.jsonl` (configurable via `AUDIT_LOG_DIR`)
- **Format**: JSONL (JSON Lines) for easy parsing and analysis
- **Buffering**: Events are buffered and flushed every 5 minutes or 1000 events
- **Rotation**: Daily log files with automatic cleanup

**Sample Log Entry**:
```json
{
  "eventId": "a1b2c3d4e5f6g7h8",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "userId": "user123",
  "organizationId": "my-org",
  "action": "tool_github_search_code",
  "outcome": "success",
  "resource": "microsoft/vscode",
  "source": "tool_execution",
  "ipAddress": "192.168.1.100",
  "details": {
    "queryTerms": ["authentication"],
    "resultCount": 42,
    "rateLimitRemaining": 4950
  }
}
```

#### **🔒 Privacy & Security**
- **Sensitive Data**: Tokens, secrets, and PII are automatically redacted
- **Content Filtering**: Repository content is sanitized before logging
- **Access Control**: Log files require appropriate file system permissions
- **Compliance**: Structured format supports SOC2, GDPR, and other compliance requirements

#### **📈 Log Analysis**
Use standard tools to analyze audit logs:
```bash
# View today's authentication events
grep '"source":"token_manager"' logs/audit/audit-$(date +%Y-%m-%d).jsonl

# Count tool executions by type
grep '"source":"tool_execution"' logs/audit/*.jsonl | jq -r '.action' | sort | uniq -c

# Find failed operations
grep '"outcome":"failure"' logs/audit/*.jsonl | jq '.action, .details'

# Monitor rate limit usage
grep 'rate_limit' logs/audit/*.jsonl | jq '.details.rateLimitRemaining'
```

## 🔐 OAuth 2.0 Integration

> 📖 **Complete OAuth Implementation**: For detailed OAuth 2.0 implementation, token management, session handling, and security features, see **[SERVER.md - OAuth 2.0 Integration](./SERVER.md#oauth-20-integration)**

OAuth 2.0 is used in HTTP server mode for web-based authentication. The `mcp-s-oauth` package provides automatic token management, secure storage, and session handling.

## 📱 GitHub App Authentication

### GitHub App Tokens

Installation tokens are generated and refreshed automatically. Internal implementation: `src/auth/githubAppManager.ts` and `src/mcp/tools/utils/tokenManager.ts`.

## 🔧 Environment Variables Reference

### Core Authentication (Both Modes)
| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` | Personal Access Token | No* | `ghp_xxxxxxxxxxxx` |
| `GH_TOKEN` | Alternative PAT | No* | `ghp_xxxxxxxxxxxx` |
| `GITHUB_HOST` | GitHub Enterprise URL | No | `github.company.com` |

*At least one authentication method required for Stdio mode

### HTTP Server Configuration
> For complete HTTP server environment variables, see **[SERVER.md - Configuration](./SERVER.md#configuration)**

### GitHub App Configuration
| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GITHUB_APP_ID` | GitHub App ID | Yes‡ | `123456` |
| `GITHUB_APP_PRIVATE_KEY` | Private key content | Yes‡ | `-----BEGIN RSA...` |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID | No | `12345678` |
| `GITHUB_APP_ENABLED` | Enable GitHub App | No | `true` |

‡Required for GitHub App

### Enterprise Configuration
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_ORGANIZATION` | Organization name | - | `my-company` |
| `AUDIT_ALL_ACCESS` | Enable audit logging | `false` | `true` |
| `GITHUB_SSO_ENFORCEMENT` | Require SSO | `false` | `true` |
| `GITHUB_TOKEN_VALIDATION` | Enhanced token validation | `false` | `true` |
| `GITHUB_PERMISSION_VALIDATION` | Permission checking | `false` | `true` |

Notes:
- Enterprise mode is considered active if ANY of the following are set: `GITHUB_ORGANIZATION`, `AUDIT_ALL_ACCESS`, `GITHUB_SSO_ENFORCEMENT`, or any of the `RATE_LIMIT_*` variables.
- If `AUDIT_ALL_ACCESS=true` is set without `GITHUB_ORGANIZATION`, the server will warn that some features may not work optimally.

#### Server Startup Behavior (Enterprise)

When enterprise-related environment variables are present, Octocode‑MCP automatically initializes enterprise modules at server startup:

- If `AUDIT_ALL_ACCESS=true` is set, the Audit Logger is initialized and will buffer events and flush to `./logs/audit/audit-YYYY-MM-DD.jsonl` in production mode.
- If any of `RATE_LIMIT_API_HOUR`, `RATE_LIMIT_AUTH_HOUR`, or `RATE_LIMIT_TOKEN_HOUR` are set, the Enterprise Rate Limiter is initialized with those limits (validated as positive integers). If unset, internal safe defaults are used.
- Initialization failures of enterprise modules are non-fatal by design and will not block the server from starting.

No additional configuration is required beyond setting the environment variables above.

### Rate Limiting
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_API_HOUR` | API calls per hour | - | `5000` |
| `RATE_LIMIT_AUTH_HOUR` | Auth calls per hour | - | `1000` |
| `RATE_LIMIT_TOKEN_HOUR` | Token calls per hour | - | `100` |

Notes:
- Setting any `RATE_LIMIT_*` variable automatically enables enterprise rate limiting.
- Values are validated to be positive integers. If unset, internal safe defaults are used (API: 1000/h, Auth: 10/h, Token: 50/h).

## 🔍 Troubleshooting

### Common Issues

#### 1. "No GitHub token found"
```bash
# Check token availability
gh auth status

# Or check environment variables
echo $GITHUB_TOKEN
echo $GH_TOKEN

# Solution: Set up authentication using any method above
```

#### 2. "CLI token resolution disabled in enterprise mode"
```bash
# In enterprise mode, CLI tokens are disabled for security
# Use environment variables or OAuth instead
export GITHUB_TOKEN="your_token"
```

#### 3. "OAuth token expired"
```bash
# Tokens are automatically refreshed, but if manual refresh is needed:
# Check token metadata
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
```

#### 4. "Rate limit exceeded"
```bash
# Check current rate limit status
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit

# Solution: Wait for reset or use different authentication method
```

### Debug Mode

Enable debug logging:

```bash
export DEBUG="octocode:auth,octocode:token"
export ENABLE_COMMAND_LOGGING="true"
export LOG_FILE_PATH="./octocode-debug.log"
```

### Health Check

Verify authentication is working:

```javascript
import { getTokenMetadata } from '@octocode/mcp/tokenManager';

async function checkAuth() {
  try {
    const metadata = await getTokenMetadata();
    console.log('✅ Authentication working');
    console.log('Token source:', metadata.source);
    console.log('Expires:', metadata.expiresAt);
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
  }
}

checkAuth();
```

## 🛡️ Security Best Practices

### 1. **Token Storage**
- ✅ Use environment variables in production
- ✅ Use secrets management services (AWS Secrets Manager, etc.)
- ❌ Never commit tokens to version control
- ❌ Never log tokens in plain text

### 2. **Token Scopes**
- ✅ Use minimal required scopes
- ✅ Regular scope auditing
- ❌ Avoid broad scopes like `admin:org`

### 3. **Token Rotation**
- ✅ Enable automatic token refresh (OAuth/GitHub App)
- ✅ Regular manual token rotation for PATs
- ✅ Monitor token expiration

### 4. **Enterprise Security**
- ✅ Enable audit logging
- ✅ Use organization validation
- ✅ Implement rate limiting
- ✅ Enable SSO enforcement

### 5. **Network Security**
- ✅ Use HTTPS for all OAuth callbacks
- ✅ Validate redirect URIs
- ✅ Use secure cookies for session management

## 📚 Additional Resources

- **[GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)**
- **[GitHub App Documentation](https://docs.github.com/en/developers/apps/building-github-apps)**
- **[Personal Access Token Guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)**
- **[GitHub CLI Documentation](https://cli.github.com/manual/)**
- **[GitHub Enterprise Server](https://docs.github.com/en/enterprise-server)**

## 🆘 Support

If you encounter issues:

1. **Check this documentation** for common solutions
2. **Enable debug logging** to get more information
3. **Verify token permissions** using GitHub's API
4. **Test with minimal configuration** first
5. **Check enterprise settings** if in enterprise mode

---

**Happy coding! 🚀** The Octocode-MCP authentication system is designed to be flexible, secure, and developer-friendly. Choose the authentication method that best fits your use case and environment.

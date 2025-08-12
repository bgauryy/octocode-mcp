# 🔐 Authentication & Token Management Guide

**Octocode-MCP** provides a comprehensive authentication system supporting multiple token sources and enterprise-grade security. This guide covers everything developers need to know about authentication, from local development to production deployment.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Authentication Flow](#authentication-flow)
- [Token Sources & Priority](#token-sources--priority)
- [Local Development Setup](#local-development-setup)
- [Production/Hosted Setup](#productionhosted-setup)
- [Enterprise Features](#enterprise-features)
- [OAuth 2.0 Integration](#oauth-20-integration)
- [GitHub App Authentication](#github-app-authentication)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## 🚀 Quick Start

### For Local Development
```bash
# Option 1: Using GitHub CLI (Recommended for local dev)
gh auth login

# Option 2: Using Personal Access Token
export GITHUB_TOKEN="your_github_token_here"

# Option 3: Using GH_TOKEN (alternative)
export GH_TOKEN="your_github_token_here"
```

### For Production/Hosted
```bash
# Option 1: OAuth (Recommended for hosted services)
export GITHUB_OAUTH_CLIENT_ID="your_client_id"
export GITHUB_OAUTH_CLIENT_SECRET="your_client_secret"
export GITHUB_OAUTH_ENABLED="true"

# Option 2: GitHub App (Enterprise)
export GITHUB_APP_ID="your_app_id"
export GITHUB_APP_PRIVATE_KEY="your_private_key"
export GITHUB_APP_INSTALLATION_ID="installation_id"
export GITHUB_APP_ENABLED="true"

# Option 3: Environment Token (Simple)
export GITHUB_TOKEN="your_github_token_here"
```

## 🔄 Authentication Flow

Octocode-MCP uses a **unified authentication system** with the following initialization flow:

```mermaid
graph TD
    A[Server Startup] --> B[Initialize Authentication Manager]
    B --> C[Initialize Auth Protocols]
    C --> D[Initialize Enterprise Features]
    D --> E[Initialize Token Management]
    E --> F[Register Tools]
    F --> G[Server Ready]
    
    C --> C1[OAuth Manager]
    C --> C2[GitHub App Manager]
    C --> C3[MCP Auth Protocol]
    
    D --> D1[Audit Logger]
    D --> D2[Rate Limiter]
    D --> D3[Organization Manager]
    D --> D4[Policy Manager]
```

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

## 💻 Local Development Setup

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
npx @octocode/mcp
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

## 🏢 Production/Hosted Setup

### OAuth 2.0 Setup (Recommended)

Perfect for web applications and hosted services:

1. **Register GitHub OAuth App**:
   - Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
   - Click "New OAuth App"
   - Fill in details:
     - **Application name**: Your app name
     - **Homepage URL**: `https://yourapp.com`
     - **Authorization callback URL**: `https://yourapp.com/auth/callback`

2. **Configure Environment Variables**:
```bash
export GITHUB_OAUTH_CLIENT_ID="your_client_id"
export GITHUB_OAUTH_CLIENT_SECRET="your_client_secret"
export GITHUB_OAUTH_REDIRECT_URI="https://yourapp.com/auth/callback"
export GITHUB_OAUTH_SCOPES="repo,read:user,read:org"
export GITHUB_OAUTH_ENABLED="true"
```

3. **Implement OAuth Flow**:
```javascript
// Example OAuth flow
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,read:user&redirect_uri=${redirectUri}`;

// After user authorizes, exchange code for token
const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
  method: 'POST',
  headers: { 'Accept': 'application/json' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
  }),
});
```

### GitHub App Setup (Enterprise)

Best for organization-wide installations:

1. **Create GitHub App**:
   - Go to [GitHub Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
   - Click "New GitHub App"
   - Configure permissions and events

2. **Generate Private Key**:
   - In your GitHub App settings, click "Generate a private key"
   - Download the `.pem` file

3. **Install App**:
   - Install the app on your organization/repositories
   - Note the Installation ID from the URL

4. **Configure Environment Variables**:
```bash
export GITHUB_APP_ID="123456"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
export GITHUB_APP_INSTALLATION_ID="12345678"
export GITHUB_APP_ENABLED="true"
```

### Simple Token Setup

For basic production environments:

```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

**⚠️ Security Note**: Store tokens securely using secrets management (AWS Secrets Manager, Azure Key Vault, etc.)

## 🏢 Enterprise Features

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

## 🔐 OAuth 2.0 Integration

### Complete OAuth Flow

```javascript
// 1. Redirect user to GitHub
const authUrl = new URL('https://github.com/login/oauth/authorize');
authUrl.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID);
authUrl.searchParams.set('scope', 'repo,read:user,read:org');
authUrl.searchParams.set('redirect_uri', process.env.GITHUB_OAUTH_REDIRECT_URI);

// 2. Handle callback and exchange code for token
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  
  const tokenData = await tokenResponse.json();
  
  // Store token securely
  // Octocode-MCP will automatically use OAuth tokens when available
});
```

### OAuth Token Refresh

Octocode-MCP automatically handles token refresh:

```javascript
// Tokens are automatically refreshed 5 minutes before expiration
// Manual refresh is also available:
import { refreshCurrentToken } from '@octocode/mcp/tokenManager';

try {
  const newToken = await refreshCurrentToken();
  console.log('Token refreshed successfully');
} catch (error) {
  console.error('Token refresh failed:', error);
}
```

## 📱 GitHub App Authentication

### JWT Generation for GitHub Apps

Octocode-MCP handles JWT generation automatically, but here's how it works:

```javascript
// Automatic JWT generation and token refresh
// No manual implementation needed

// Get current token metadata
import { getTokenMetadata } from '@octocode/mcp/tokenManager';

const metadata = await getTokenMetadata();
console.log('Token source:', metadata.source);
console.log('Expires at:', metadata.expiresAt);
console.log('Permissions:', metadata.permissions);
```

## 🔧 Environment Variables Reference

### Core Authentication
| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` | Personal Access Token | No* | `ghp_xxxxxxxxxxxx` |
| `GH_TOKEN` | Alternative PAT | No* | `ghp_xxxxxxxxxxxx` |
| `GITHUB_HOST` | GitHub Enterprise URL | No | `github.company.com` |

*At least one authentication method required

### OAuth Configuration
| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App Client ID | Yes† | `Iv1.a629723d4c8a5678` |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App Secret | Yes† | `abc123...` |
| `GITHUB_OAUTH_REDIRECT_URI` | Callback URL | No | `http://localhost:3000/callback` |
| `GITHUB_OAUTH_SCOPES` | Requested scopes | No | `repo,read:user,read:org` |
| `GITHUB_OAUTH_ENABLED` | Enable OAuth | No | `true` |

†Required for OAuth

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

### Rate Limiting
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_API_HOUR` | API calls per hour | - | `5000` |
| `RATE_LIMIT_AUTH_HOUR` | Auth calls per hour | - | `1000` |
| `RATE_LIMIT_TOKEN_HOUR` | Token calls per hour | - | `100` |

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

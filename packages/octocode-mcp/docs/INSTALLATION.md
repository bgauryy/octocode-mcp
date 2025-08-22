# Octocode MCP Installation & Complete Authentication Guide

**🔐 Complete guide for installation and authentication setup covering all deployment scenarios: local development, organizations, enterprises, and hosted services.**

---

## Table of Contents

### Quick Start & Installation
- [Installation Options](#installation-options)
- [Installation Method Guide by Use Case](#-installation-method-guide-by-use-case)
- [Minimum Requirements](#minimum-requirements)

### Authentication Levels & Methods
- [🚀 Level 1: Local Development](#-level-1-local-development)
- [🔐 Level 2: Organizations & Production](#-level-2-organizations--production)
- [🏢 Level 3: Enterprise Security](#-level-3-enterprise-security)
- [☁️ Level 4: Hosted Services](#-level-4-hosted-services)
- [🤖 Advanced: GitHub App Authentication](#-advanced-github-app-authentication)

### Complete Configuration Guide
- [Authentication Decision Flow](#authentication-decision-flow)
- [Configuration Reference](#configuration-reference)
- [MCP Client Configuration](#mcp-client-configuration)
- [Tool Registration Logic](#tool-registration-logic)
- [Testing & Verification](#testing--verification)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)
- [Migration & Comparison](#migration--comparison)

---

## Installation Options


## 🎯 Installation Method Guide by Use Case

**Choose your installation method based on your deployment scenario:**

### For Individual Developers (Local Development)
- **Method**: GitHub CLI or Personal Access Token
- **Security**: Basic
- **Best For**: Learning, testing, personal projects

### For Teams & Organizations (Production)
- **Method**: OAuth 2.1 with Device Flow
- **Security**: High
- **Best For**: Shared environments, team collaboration

### For Large Enterprises (Compliance)
- **Method**: OAuth + Enterprise Features
- **Security**: Maximum
- **Best For**: Audit requirements, compliance, governance

### For Hosted Services (Cloud/SaaS)
- **Method**: OAuth with callback URLs or Docker
- **Security**: High
- **Best For**: Web apps, cloud platforms, containerized services

### For Advanced Enterprise (Maximum Control)
- **Method**: GitHub App Authentication
- **Security**: Maximum
- **Best For**: Fine-grained permissions, automated workflows


## Minimum Requirements

**At least one authentication method must be configured at startup:**

| Method | Use Case | Setup Required | MCP Configuration |
|--------|----------|----------------|-------------------|
| **GitHub CLI** | Local development | `gh auth login` | ```json<br/>{"mcpServers": {"octocode": {<br/>&nbsp;&nbsp;"command": "npx",<br/>&nbsp;&nbsp;"args": ["octocode-mcp"]<br/>}}}``` |
| **Personal Access Token** | Development/CI/CD | `GITHUB_TOKEN=ghp_xxx` | ```json<br/>{"mcpServers": {"octocode": {<br/>&nbsp;&nbsp;"command": "npx",<br/>&nbsp;&nbsp;"args": ["octocode-mcp"],<br/>&nbsp;&nbsp;"env": {<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_TOKEN": "ghp_xxx"<br/>&nbsp;&nbsp;}<br/>}}}``` |
| **OAuth 2.1** | Production/Organizations | `GITHUB_OAUTH_CLIENT_ID`<br/>+ `GITHUB_OAUTH_CLIENT_SECRET` | ```json<br/>{"mcpServers": {"octocode": {<br/>&nbsp;&nbsp;"command": "npx",<br/>&nbsp;&nbsp;"args": ["octocode-mcp"],<br/>&nbsp;&nbsp;"env": {<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_OAUTH_CLIENT_ID": "your_id",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_OAUTH_CLIENT_SECRET": "your_secret"<br/>&nbsp;&nbsp;}<br/>}}}``` |
| **GitHub App** | Enterprise environments | `GITHUB_APP_ID`<br/>+ `GITHUB_APP_PRIVATE_KEY`<br/>+ `GITHUB_APP_ENABLED=true` | ```json<br/>{"mcpServers": {"octocode": {<br/>&nbsp;&nbsp;"command": "npx",<br/>&nbsp;&nbsp;"args": ["octocode-mcp"],<br/>&nbsp;&nbsp;"env": {<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_APP_ID": "123456",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_APP_PRIVATE_KEY": "-----BEGIN...",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"GITHUB_APP_ENABLED": "true"<br/>&nbsp;&nbsp;}<br/>}}}``` |

---

## 🚀 Level 1: Local Development

**Perfect for:** Individual developers, learning, testing, local development environments

**Security Level:** Basic | **Complexity:** Minimal | **Setup Time:** < 2 minutes

### Method 1: GitHub CLI (Zero Configuration) ⭐ Recommended

```bash
# 1. Install GitHub CLI - visit https://cli.github.com/
brew install gh          # macOS
sudo apt install gh      # Ubuntu
winget install --id GitHub.cli  # Windows

# 2. Authenticate once
gh auth login

# 3. Configure MCP client - works immediately!
# Add to your MCP client configuration (see MCP Configuration section below)
# ✅ CLI token detected automatically
```

**Why this works:**
- GitHub CLI stores authenticated tokens locally
- MCP server automatically discovers CLI tokens 
- No configuration files or environment variables needed
- Full access to private repositories you have access to
- Perfect for individual developers and local testing

### Method 2: Personal Access Token

```bash
# 1. Create token at https://github.com/settings/tokens
# Required scopes: repo, read:user, read:org

# 2. Configure MCP client with token
# Add GITHUB_TOKEN to your MCP client configuration
# ✅ PAT token detected
```

**Create tokens at:**
- [Fine-grained PAT](https://github.com/settings/personal-access-tokens/new) (recommended)
- [Classic PAT](https://github.com/settings/tokens/new)

### Local Development .env Setup

```bash
# .env file for local development
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_HOST=github.com

# Optional: Test OAuth locally
# GITHUB_OAUTH_CLIENT_ID=your_client_id
# GITHUB_OAUTH_CLIENT_SECRET=your_client_secret

# Optional: Test Enterprise features
# GITHUB_ORGANIZATION=your-org
# AUDIT_ALL_ACCESS=true
```

#### MCP Client Configuration (.env Setup)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx",
        "GITHUB_HOST": "github.com"
      }
    }
  }
}
```
*For testing OAuth or Enterprise features, add the respective environment variables from the .env file*

### When CLI Authentication is Available

| Configuration State | CLI Status | Reason |
|---------------------|------------|--------|
| 🟢 **Pure Local Development** | ✅ **ENABLED** | No OAuth/GitHub App/Enterprise config |
| 🔴 **OAuth Configured** | ❌ **DISABLED** | Use OAuth instead for security |
| 🔴 **GitHub App Configured** | ❌ **DISABLED** | Use GitHub App tokens instead |
| 🔴 **Enterprise Mode** | ❌ **DISABLED** | Security policy enforcement |

**Why CLI gets disabled:** When production authentication methods are configured, CLI tokens are automatically disabled for security to prevent accidental use of personal tokens in production environments.

---

## 🔐 Level 2: Organizations & Production

**Perfect for:** Organizations, production deployments, teams, secure multi-user environments

**Security Level:** High | **Complexity:** Low | **Setup Time:** 10 minutes

OAuth 2.1 with Device Flow provides enterprise-grade security with user-friendly authentication. No callback URLs needed, works everywhere.

### Step 1: Create GitHub OAuth App

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in details:
   - **Application name**: Your organization name (e.g., "Acme Corp MCP")
   - **Homepage URL**: Your organization website
   - **Authorization callback URL**: `http://127.0.0.1:8765/auth/callback` (for testing)
4. **✅ Enable "Device Flow"** (Required for simple OAuth)
5. Click **"Register application"**
6. Copy **Client ID** and generate **Client Secret**

**Production Callback URLs:**
- Local testing: `http://127.0.0.1:8765/auth/callback`
- Production: `https://yourapp.com/auth/callback`
- MCP Gateway: `https://your-gateway.com/auth/callback`

### Step 2: Environment Configuration

```bash
# Required OAuth Configuration
export GITHUB_OAUTH_CLIENT_ID=Iv1.a629723d4c8a5678
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret_here
export GITHUB_OAUTH_SCOPES=repo,read:user,read:org
export GITHUB_OAUTH_ENABLED=true

# Configure MCP client with OAuth credentials
# Add to your MCP client configuration (see examples below)
# ✅ OAuth configured - simpleOAuth tool available
```

### Step 3: Authenticate Users (Simple OAuth Tool)

Once configured, users authenticate through the MCP client using the simple OAuth tool:

```json
{
  "tool": "simpleOAuth",
  "arguments": {
    "action": "authenticate"
  }
}
```

**Response:**
```json
{
  "userCode": "ABCD-1234",
  "verificationUrl": "https://github.com/login/device",
  "instructions": "Visit the URL and enter the code",
  "expiresIn": 900
}
```

**User Flow (Device Flow):**
1. User visits `github.com/login/device`
2. Enters code `ABCD-1234`
3. Authorizes your application
4. Authentication completes automatically (polling happens in background)
5. Secure token storage with automatic refresh
6. All GitHub API tools now work with user's authenticated token

### Simple OAuth Management

```json
// Check authentication status
{
  "tool": "simpleOAuth",
  "arguments": {
    "action": "status"
  }
}

// Revoke and clear tokens
{
  "tool": "simpleOAuth",
  "arguments": {
    "action": "revoke"
  }
}

// Authenticate with custom scopes
{
  "tool": "simpleOAuth",
  "arguments": {
    "action": "authenticate",
    "scopes": ["repo", "read:user", "read:org", "gist"]
  }
}
```

### Why Simple OAuth is Best

- ✅ **No callback URLs needed** - Works anywhere
- ✅ **Device Flow** - User-friendly, no complex redirects
- ✅ **Automatic token refresh** - Handles expiration automatically
- ✅ **Secure token storage** - AES-256-GCM encrypted at rest
- ✅ **Works everywhere** - Cloud, local, containers, CI/CD
- ✅ **One tool for everything** - Simple interface

### OAuth Security Features

The OAuth implementation includes enterprise-grade security:

- **PKCE Protection**: S256 code challenge method prevents authorization code interception
- **State Validation**: Cryptographically secure state parameters with timing-safe comparison
- **Token Security**: AES-256-GCM encrypted storage with automatic refresh
- **Audience Validation**: Proper token audience checking per MCP specification
- **Scope Management**: Runtime scope override with least-privilege principle

---

## 🏢 Level 3: Enterprise Security

**Perfect for:** Large organizations, compliance requirements, audit logging, centralized management, regulatory environments

**Security Level:** Maximum | **Complexity:** Medium | **Setup Time:** 30 minutes

Enterprise mode provides comprehensive security with audit logging, rate limiting, organization validation, SSO enforcement, and team-based access control.

### Enterprise Mode Auto-Detection

Enterprise mode is **automatically enabled** when ANY of these environment variables are set:

| Variable | Trigger Condition | Enterprise Features Enabled |
|----------|------------------|---------------------------|
| `GITHUB_ORGANIZATION` | Any value | Organization validation, team access control |
| `AUDIT_ALL_ACCESS=true` | Must be `true` | Comprehensive audit logging |
| `GITHUB_SSO_ENFORCEMENT=true` | Must be `true` | SSO authentication requirements |
| `RATE_LIMIT_API_HOUR` | Any positive integer | API rate limiting |
| `RATE_LIMIT_AUTH_HOUR` | Any positive integer | Authentication rate limiting |
| `RATE_LIMIT_TOKEN_HOUR` | Any positive integer | Token operation rate limiting |

**Important:** Setting ANY ONE of these variables enables Enterprise mode and automatically disables GitHub CLI authentication for security.

### Complete Enterprise Configuration

```bash
# Core Enterprise Settings
export GITHUB_ORGANIZATION=your-enterprise
export AUDIT_ALL_ACCESS=true
export GITHUB_SSO_ENFORCEMENT=true

# Authentication Method (Choose OAuth or GitHub App)
# Option 1: OAuth (Recommended for most enterprises)
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
export GITHUB_OAUTH_SCOPES=repo,read:user,read:org

# Option 2: GitHub App (Advanced enterprise environments)
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export GITHUB_APP_INSTALLATION_ID=12345678
export GITHUB_APP_ENABLED=true

# Access Control & Security
export RESTRICT_TO_MEMBERS=true
export GITHUB_REQUIRED_TEAMS=developers,security,admins
export GITHUB_ADMIN_USERS=admin1,admin2,security-team
export REQUIRE_MFA=true

# Rate Limiting (requests per hour per user)
export RATE_LIMIT_API_HOUR=5000
export RATE_LIMIT_AUTH_HOUR=1000
export RATE_LIMIT_TOKEN_HOUR=100

# Audit Logging
export AUDIT_LOG_DIR=./logs/audit

# Optional: GitHub Enterprise Server
export GITHUB_HOST=https://github.enterprise.com
```

### Enterprise Authentication Flow

```mermaid
flowchart TD
    User[👤 User] --> Auth{Authentication Method?}
    
    Auth -->|OAuth| OAuth[🔐 OAuth Device Flow<br/>• Visit github.com/login/device<br/>• Enter provided code<br/>• Automatic token refresh]
    
    Auth -->|GitHub App| GitHubApp[🤖 GitHub App<br/>• JWT-based authentication<br/>• Fine-grained permissions<br/>• Automatic token refresh]
    
    Auth -->|PAT| PAT[📝 Personal Access Token<br/>• GITHUB_TOKEN environment<br/>• Manual token management]
    
    OAuth --> Validation{Organization<br/>Validation}
    GitHubApp --> Validation
    PAT --> Validation
    
    Validation -->|✅ Member| Access[✅ Authorized Access<br/>• All tools available<br/>• Audit logging active<br/>• Rate limiting enforced]
    
    Validation -->|❌ Not Member| Denied[❌ Access Denied<br/>• Organization membership required<br/>• Contact admin]
    
    Access --> Tools[🛠️ Available Tools:<br/>• All GitHub API tools<br/>• Organization management<br/>• Advanced OAuth controls]
```

### Enterprise Audit Logging

When `AUDIT_ALL_ACCESS=true`, comprehensive events are logged:

**🔐 Authentication Events**
- Token resolution attempts and sources  
- Authentication success/failure
- Token refresh operations
- SSO enforcement actions
- Organization membership validation

**🛠️ Tool Execution Events**
- All MCP tool calls with sanitized parameters
- GitHub API requests and responses (sanitized)
- Resource access patterns
- Rate limit utilization tracking

**🏢 Organization & Security Events**
- Membership validation results
- Team access control decisions
- Policy enforcement actions
- Security violations and violations attempts
- Administrative operations

**📁 Log Format & Storage**
- **Development**: Real-time JSON to stderr
- **Production**: Daily JSONL files in `${AUDIT_LOG_DIR}/audit-YYYY-MM-DD.jsonl`
- **Retention**: Configurable rotation and cleanup
- **Security**: Automatic PII and token redaction

### Team-Based Access Control

```bash
# Require specific teams for access
export GITHUB_REQUIRED_TEAMS=developers,security

# Define admin users with elevated privileges
export GITHUB_ADMIN_USERS=admin1,admin2,security-lead

# Restrict to organization members only
export RESTRICT_TO_MEMBERS=true

# Require multi-factor authentication
export REQUIRE_MFA=true
```

### Enterprise Rate Limiting

```bash
# API requests per hour per user
export RATE_LIMIT_API_HOUR=5000

# Authentication requests per hour per user  
export RATE_LIMIT_AUTH_HOUR=1000

# Token operations per hour per user
export RATE_LIMIT_TOKEN_HOUR=100
```

Rate limiting features:
- Per-user tracking with automatic cleanup
- Configurable limits per operation type
- Graceful degradation when limits exceeded
- Integration with audit logging

---

## 🤖 Advanced: GitHub App Authentication

**Perfect for:** Enterprise environments requiring fine-grained permissions, high rate limits, automated workflows, and advanced security

**Security Level:** Maximum | **Complexity:** High | **Setup Time:** 45 minutes

GitHub Apps provide the most sophisticated authentication method with fine-grained permissions, JWT-based token refresh, and enterprise-grade security features.

### Step 1: Create GitHub App

1. Go to [GitHub Settings → Developer settings → GitHub Apps](https://github.com/settings/apps)
2. Click **"New GitHub App"**
3. Configure basic information:
   - **GitHub App name**: Your app name
   - **Homepage URL**: Your application URL
   - **Webhook URL**: Optional for this use case
4. **Set Permissions** (minimum required):
   - **Repository permissions:**
     - Contents: **Read**
     - Metadata: **Read**  
     - Pull requests: **Read**
   - **Organization permissions:**
     - Members: **Read** (for enterprise features)
5. **Generate private key** - Download `.pem` file
6. **Install app** on your organization/repositories

### Step 2: Environment Configuration

```bash
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...
-----END RSA PRIVATE KEY-----"
export GITHUB_APP_INSTALLATION_ID=12345678
export GITHUB_APP_ENABLED=true

# Optional: Organization management
export GITHUB_ORGANIZATION=your-org
export RESTRICT_TO_MEMBERS=true

# Optional: GitHub Enterprise Server
export GITHUB_HOST=https://github.enterprise.com
```

#### MCP Client Configuration (GitHub App)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_APP_ID": "123456",
        "GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...\\n-----END RSA PRIVATE KEY-----",
        "GITHUB_APP_INSTALLATION_ID": "12345678",
        "GITHUB_APP_ENABLED": "true",
        "GITHUB_ORGANIZATION": "your-org",
        "RESTRICT_TO_MEMBERS": "true",
        "GITHUB_HOST": "https://github.enterprise.com"
      }
    }
  }
}
```
*Note: Replace with your actual private key and installation details*

### GitHub App Features

- **Automatic Token Refresh**: Installation tokens refreshed via JWT authentication
- **Fine-grained Permissions**: Repository and organization level access control
- **High Rate Limits**: 5,000 requests/hour vs 1,000 for personal tokens
- **Enterprise Integration**: Full audit logging and organization management
- **Security**: Tokens are scoped to specific installations and permissions

### GitHub App + Enterprise Mode

```bash
# Complete GitHub App Enterprise setup
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export GITHUB_APP_INSTALLATION_ID=12345678
export GITHUB_APP_ENABLED=true

# Enable enterprise features
export GITHUB_ORGANIZATION=your-enterprise
export AUDIT_ALL_ACCESS=true
export RATE_LIMIT_API_HOUR=5000
export GITHUB_SSO_ENFORCEMENT=true

# Configure MCP client with GitHub App
# Add to your MCP client configuration (see examples below)
# ✅ GitHub App + Enterprise mode active
```

---

## ☁️ Level 4: Hosted Services

**Perfect for:** SaaS applications, web services, MCP gateways, cloud platforms, containerized deployments

**Security Level:** High | **Complexity:** Medium | **Setup Time:** 20 minutes

Hosted OAuth with callback URLs, MCP compliance, and production-ready containerization for web applications and cloud services.

### OAuth for Web Applications

```bash
# OAuth Configuration for Web Apps
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
export GITHUB_OAUTH_REDIRECT_URI=https://yourapp.com/auth/callback
export GITHUB_OAUTH_SCOPES=repo,read:user,read:org
export GITHUB_OAUTH_ENABLED=true

# MCP Compliance (RFC 8707)
export MCP_SERVER_RESOURCE_URI=https://yourapp.com/mcp-server

# Optional: Organization restrictions  
export GITHUB_ORGANIZATION=your-org
export AUDIT_ALL_ACCESS=true
```

#### MCP Client Configuration (OAuth for Web Applications)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "your_client_id",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret",
        "GITHUB_OAUTH_REDIRECT_URI": "https://yourapp.com/auth/callback",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_OAUTH_ENABLED": "true",
        "MCP_SERVER_RESOURCE_URI": "https://yourapp.com/mcp-server",
        "GITHUB_ORGANIZATION": "your-org",
        "AUDIT_ALL_ACCESS": "true"
      }
    }
  }
}
```

### MCP Gateway Configuration (YAML)

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

*This YAML configuration is already in MCP Gateway format - use directly with your MCP gateway service*

### Docker Deployment

```bash
# OAuth-enabled container
docker run -i --rm \
  -e GITHUB_OAUTH_CLIENT_ID=your_client_id \
  -e GITHUB_OAUTH_CLIENT_SECRET=your_client_secret \
  -e GITHUB_OAUTH_ENABLED=true \
  -e GITHUB_ORGANIZATION=your-org \
  -e AUDIT_ALL_ACCESS=true \
  octocode/octocode-mcp:latest

# PAT-based container (simpler)
docker run -i --rm \
  -e GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx \
  octocode/octocode-mcp:latest

# Complete enterprise container
docker run -i --rm \
  -e GITHUB_OAUTH_CLIENT_ID=your_client_id \
  -e GITHUB_OAUTH_CLIENT_SECRET=your_client_secret \
  -e GITHUB_ORGANIZATION=your-enterprise \
  -e AUDIT_ALL_ACCESS=true \
  -e RATE_LIMIT_API_HOUR=5000 \
  -e GITHUB_SSO_ENFORCEMENT=true \
  -v ./logs:/app/logs \
  octocode/octocode-mcp:latest
```

#### MCP Client Configuration (Docker Deployment)

**For OAuth-enabled container:**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "docker",
      "args": ["run", "-i", "--rm", 
                "-e", "GITHUB_OAUTH_CLIENT_ID=your_client_id",
                "-e", "GITHUB_OAUTH_CLIENT_SECRET=your_client_secret",
                "-e", "GITHUB_OAUTH_ENABLED=true",
                "-e", "GITHUB_ORGANIZATION=your-org",
                "-e", "AUDIT_ALL_ACCESS=true",
                "octocode/octocode-mcp:latest"]
    }
  }
}
```

**For PAT-based container:**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
                "-e", "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx",
                "octocode/octocode-mcp:latest"]
    }
  }
}
```

**For complete enterprise container:**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
                "-e", "GITHUB_OAUTH_CLIENT_ID=your_client_id",
                "-e", "GITHUB_OAUTH_CLIENT_SECRET=your_client_secret",
                "-e", "GITHUB_ORGANIZATION=your-enterprise",
                "-e", "AUDIT_ALL_ACCESS=true",
                "-e", "RATE_LIMIT_API_HOUR=5000",
                "-e", "GITHUB_SSO_ENFORCEMENT=true",
                "-v", "./logs:/app/logs",
                "octocode/octocode-mcp:latest"]
    }
  }
}
```

#### MCP Client Configuration (Hosted Services)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "your_client_id",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret",
        "GITHUB_OAUTH_REDIRECT_URI": "https://yourapp.com/auth/callback",
        "MCP_SERVER_RESOURCE_URI": "https://yourapp.com/mcp-server",
        "GITHUB_OAUTH_ENABLED": "true",
        "GITHUB_ORGANIZATION": "your-org"
      }
    }
  }
}
```
*Hosted OAuth with callback URLs and MCP compliance*

---

## Authentication Decision Flow

### How Authentication Method is Chosen

The system automatically detects your deployment scenario and selects the appropriate authentication method:

```
🎯 Authentication Level Selection
│
├─ 🚀 Level 1: Local Development
│   └─ Triggered by: No OAuth/GitHub App/Enterprise config
│   └─ Methods: GitHub CLI → PAT → Authorization header
│
├─ 🔐 Level 2: Organizations & Production  
│   └─ Triggered by: GITHUB_OAUTH_CLIENT_ID + SECRET configured
│   └─ Methods: OAuth tokens → PAT → CLI disabled for security
│
├─ 🏢 Level 3: Enterprise Security
│   └─ Triggered by: GITHUB_ORGANIZATION or AUDIT_ALL_ACCESS=true
│   └─ Methods: OAuth/GitHub App → PAT → CLI disabled for security
│
├─ ☁️ Level 4: Hosted Services
│   └─ Triggered by: OAuth + GITHUB_OAUTH_REDIRECT_URI configured
│   └─ Methods: OAuth with callbacks → PAT → CLI disabled
│
└─ 🤖 Advanced: GitHub App
    └─ Triggered by: GITHUB_APP_ID + PRIVATE_KEY + ENABLED=true
    └─ Methods: GitHub App tokens → PAT → CLI disabled
```

### Token Resolution Priority

Within each level, tokens are resolved in this **exact priority order**:

```
🔍 Token Priority (Highest → Lowest)
│
├─ 1️⃣ OAuth 2.1 Access Token (Levels 2, 3, 4)
│   ├─ Source: Secure encrypted credential store
│   ├─ Features: Auto-refresh, PKCE, state validation, device flow
│   └─ Security: Highest - enterprise grade with audit logging
│
├─ 2️⃣ GitHub App Installation Token (Level 3, Advanced)
│   ├─ Source: JWT-based token refresh
│   ├─ Features: Fine-grained permissions, 5000 req/hour rate limits
│   └─ Security: Maximum - scoped installations, automated refresh
│
├─ 3️⃣ Personal Access Token - GITHUB_TOKEN (All levels)
│   ├─ Source: Environment variable
│   ├─ Features: Simple, universal compatibility, CI/CD friendly
│   └─ Security: Medium - manual rotation, scope management required
│
├─ 4️⃣ Personal Access Token - GH_TOKEN (All levels)
│   ├─ Source: Alternative environment variable
│   ├─ Features: Fallback for different tooling setups
│   └─ Security: Medium - same as GITHUB_TOKEN
│
├─ 5️⃣ GitHub CLI Token (Level 1 only)
│   ├─ Source: `gh auth token` command output
│   ├─ Features: Zero-config local development, automatic discovery
│   └─ Security: Medium - disabled in production for security
│
└─ 6️⃣ Authorization Header (All levels)
    ├─ Source: Authorization environment variable
    ├─ Features: Custom integration support, Bearer token format
    └─ Security: Medium - lowest priority fallback method
```

### Authentication Decision Flow

```mermaid
flowchart TD
    Start([🚀 Server Startup]) --> CheckOAuth{OAuth Credentials<br/>Configured?}
    
    CheckOAuth -->|Yes: CLIENT_ID + SECRET| EnableOAuth[🔐 Enable OAuth Tools<br/>• simpleOAuth<br/>• Advanced OAuth<br/>• Disable CLI]
    
    CheckOAuth -->|No| CheckApp{GitHub App<br/>Configured?}
    
    CheckApp -->|Yes: APP_ID + KEY + ENABLED| EnableApp[🤖 Enable GitHub App<br/>• Advanced OAuth<br/>• JWT refresh<br/>• Disable CLI]
    
    CheckApp -->|No| CheckEnterprise{Enterprise Config<br/>Present?}
    
    CheckEnterprise -->|Yes: ORG or AUDIT or RATE_LIMIT| EnableEnterprise[🏢 Enable Enterprise<br/>• Audit logging<br/>• Rate limiting<br/>• Disable CLI]
    
    CheckEnterprise -->|No| EnableLocal[💻 Local Development<br/>• Enable CLI<br/>• All fallbacks<br/>• No restrictions]
    
    EnableOAuth --> RegisterTools[📝 Register Appropriate Tools]
    EnableApp --> RegisterTools
    EnableEnterprise --> RegisterTools
    EnableLocal --> RegisterTools
    
    RegisterTools --> ServerReady[🚀 Server Ready]
```

**Why authentication methods get disabled:**
- **CLI disabled in production**: When OAuth/GitHub App/Enterprise is configured, CLI tokens are disabled to prevent accidentally using personal tokens in production
- **Security-first approach**: Higher security methods take precedence over convenience methods
- **Configuration-based**: The system automatically detects your intended deployment mode

---

## MCP Client Configuration

### Claude Desktop Configuration Examples

#### Local Development Setup (GitHub CLI)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"]
    }
  }
}
```
*No environment variables needed - uses GitHub CLI automatically*

#### Personal Access Token Setup
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

#### OAuth Production Setup
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "Iv1.a629723d4c8a5678",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret_here",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_OAUTH_ENABLED": "true"
      }
    }
  }
}
```

#### Enterprise Setup
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "Iv1.a629723d4c8a5678",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret_here",
        "GITHUB_ORGANIZATION": "your-enterprise",
        "AUDIT_ALL_ACCESS": "true",
        "RATE_LIMIT_API_HOUR": "5000",
        "GITHUB_SSO_ENFORCEMENT": "true"
      }
    }
  }
}
```

#### GitHub App Enterprise Setup
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_APP_ID": "123456",
        "GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----",
        "GITHUB_APP_INSTALLATION_ID": "12345678",
        "GITHUB_APP_ENABLED": "true",
        "GITHUB_ORGANIZATION": "your-enterprise",
        "AUDIT_ALL_ACCESS": "true",
        "RATE_LIMIT_API_HOUR": "5000"
      }
    }
  }
}
```

### First-Time OAuth Setup Flow

When you first connect with OAuth configured:

1. **Client connects** to your MCP server
2. **Server returns 401** with `WWW-Authenticate` header containing OAuth metadata  
3. **Client discovers** authorization server from `.well-known/oauth-protected-resource`
4. **User uses simpleOAuth tool** to start authentication
5. **Device flow starts** - user visits github.com/login/device
6. **User enters code** provided by the tool
7. **GitHub authorizes** your application with requested scopes
8. **Token exchange** happens automatically with PKCE verification
9. **Client receives** access token and can now use all MCP tools

The entire flow is secure and user-friendly - users just need to visit one URL and enter a code once.

---

## Configuration Reference

### Core Authentication Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No* | `ghp_xxxxxxxxxxxx` | Personal Access Token |
| `GH_TOKEN` | No* | `ghp_xxxxxxxxxxxx` | Alternative PAT variable |
| `Authorization` | No* | `Bearer ghp_xxx` | Authorization header format |
| `GITHUB_HOST` | No | `https://github.company.com` | GitHub Enterprise Server URL |

*At least one authentication method required

### OAuth 2.1 Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_OAUTH_CLIENT_ID` | Yes† | `Iv1.a629723d4c8a5678` | GitHub OAuth App Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes† | `abc123...` | GitHub OAuth App Client Secret |
| `GITHUB_OAUTH_REDIRECT_URI` | No | `https://yourapp.com/auth/callback` | OAuth callback URL (optional for device flow) |
| `GITHUB_OAUTH_SCOPES` | No | `repo,read:user,read:org` | Comma-separated scopes |
| `GITHUB_OAUTH_ENABLED` | No | `true` | Enable OAuth authentication |
| `MCP_SERVER_RESOURCE_URI` | No | `https://yourapp.com/mcp-server` | MCP resource identifier (RFC 8707) |

†Required for OAuth

### GitHub App Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_APP_ID` | Yes‡ | `123456` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes‡ | `-----BEGIN RSA...` | GitHub App private key |
| `GITHUB_APP_INSTALLATION_ID` | No | `12345678` | Installation ID (auto-detected if not provided) |
| `GITHUB_APP_ENABLED` | Yes‡ | `true` | Enable GitHub App authentication |

‡Required for GitHub App

### Enterprise Configuration

| Variable | Default | Example | Description |
|----------|---------|---------|-------------|
| `GITHUB_ORGANIZATION` | - | `my-company` | Organization name (triggers Enterprise mode) |
| `AUDIT_ALL_ACCESS` | `false` | `true` | Enable comprehensive audit logging |
| `GITHUB_SSO_ENFORCEMENT` | `false` | `true` | Enforce SSO authentication |
| `RESTRICT_TO_MEMBERS` | `false` | `true` | Restrict access to org members only |
| `GITHUB_REQUIRED_TEAMS` | - | `developers,security` | Required teams for access |
| `GITHUB_ADMIN_USERS` | - | `admin1,admin2` | Admin users with elevated privileges |
| `REQUIRE_MFA` | `false` | `true` | Require multi-factor authentication |
| `RATE_LIMIT_API_HOUR` | - | `5000` | API requests per hour per user |
| `RATE_LIMIT_AUTH_HOUR` | - | `1000` | Auth requests per hour per user |
| `RATE_LIMIT_TOKEN_HOUR` | - | `100` | Token requests per hour per user |
| `AUDIT_LOG_DIR` | `./logs/audit` | `/var/log/octocode` | Audit log directory |

### GitHub Enterprise Server

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GITHUB_HOST` | Yes | `https://github.enterprise.com` | GitHub Enterprise Server URL |
| `GITHUB_OAUTH_AUTH_URL` | No | `https://github.enterprise.com/login/oauth/authorize` | OAuth authorization URL (auto-derived) |
| `GITHUB_OAUTH_TOKEN_URL` | No | `https://github.enterprise.com/login/oauth/access_token` | OAuth token URL (auto-derived) |

### Server Configuration

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `START_METADATA_SERVER` | No | `true` | Start metadata server for strict enterprises |
| `ALLOW_OAUTH_DEEP_LINK` | No | `true` | Enable deep link OAuth callbacks |

---

## Tool Registration Logic

The server conditionally registers authentication tools based on configuration. This implements the principle: **"no auth params → no auth tools!"**

### Tool Registration Matrix

As implemented in [src/index.ts:589-720], tools are registered conditionally:

| Configuration State | simpleOAuth | Advanced OAuth | Organization Tools | CLI Status |
|-------------------|-------------|----------------|-------------------|-----------| 
| **No Auth Config** | ❌ Not registered | ❌ Not registered | ❌ Not registered | ✅ **Enabled** |
| **OAuth Only** | ✅ **Registered** | ✅ **Registered** | ❌ Not registered | ❌ **Disabled** |
| **GitHub App Only** | ❌ Not registered | ✅ **Registered** | ❌ Not registered | ❌ **Disabled** |
| **Enterprise Only** | ❌ Not registered | ❌ Not registered | ✅ **Registered** | ❌ **Disabled** |
| **OAuth + Enterprise** | ✅ **Registered** | ✅ **Registered** | ✅ **Registered** | ❌ **Disabled** |
| **GitHub App + Enterprise** | ❌ Not registered | ✅ **Registered** | ✅ **Registered** | ❌ **Disabled** |

### Registration Logic Implementation

```typescript
// From src/index.ts - Exact implementation
const hasOAuthCredentials = !!(
  process.env.GITHUB_OAUTH_CLIENT_ID && 
  process.env.GITHUB_OAUTH_CLIENT_SECRET
);

const hasGitHubAppCredentials = !!(
  process.env.GITHUB_APP_ID && 
  process.env.GITHUB_APP_PRIVATE_KEY && 
  process.env.GITHUB_APP_ENABLED === 'true'
);

const hasEnterpriseConfig = !!(
  process.env.GITHUB_ORGANIZATION ||
  process.env.AUDIT_ALL_ACCESS === 'true' ||
  process.env.GITHUB_SSO_ENFORCEMENT === 'true' ||
  process.env.RATE_LIMIT_API_HOUR ||
  process.env.RATE_LIMIT_AUTH_HOUR ||
  process.env.RATE_LIMIT_TOKEN_HOUR
);

// Register simple OAuth tool ONLY when OAuth credentials configured
if (hasOAuthCredentials) {
  registerSimpleOAuthTool(server);
}

// Register advanced OAuth tools when OAuth OR GitHub App configured  
if (hasOAuthCredentials || hasGitHubAppCredentials) {
  registerAllOAuthTools(server);
}

// Register organization tools when auth config + enterprise features present
if (hasAnyAuthConfig && hasEnterpriseConfig) {
  registerAllOrganizationTools(server);
}
```

### Available Authentication Tools

#### Simple OAuth Tools (OAuth credentials required)
- **`simpleOAuth`**: One tool, three actions (authenticate, status, revoke)
  - Uses GitHub Device Flow 
  - No callback URLs needed
  - Automatic token refresh

#### Advanced OAuth Tools (OAuth or GitHub App required)
- **`oauthInitiate`**: Start OAuth flow with advanced options
- **`oauthCallback`**: Complete authorization code flow
- **`oauthStatus`**: Detailed authentication status and metadata
- **`oauthRevoke`**: Token revocation with options

#### Organization Tools (Enterprise config required)  
- **`checkOrganizationMembership`**: Validate user membership
- **`listUserOrganizations`**: List user's organizations
- **`checkTeamMembership`**: Validate team membership  
- **Enhanced GitHub tools**: With organization context and audit logging

---

## Testing & Verification

### Authentication Configuration Checker

Save this as `check-auth-config.sh` and run `bash check-auth-config.sh`:

```bash
#!/bin/bash

echo "🔍 Octocode MCP Authentication Configuration Checker"
echo "=================================================="
echo

# Check OAuth configuration
echo "1. OAuth Configuration:"
if [[ -n "$GITHUB_OAUTH_CLIENT_ID" && -n "$GITHUB_OAUTH_CLIENT_SECRET" ]]; then
  echo "   ✅ OAuth credentials configured"
  echo "   🔐 simpleOAuth tool will be available"
  echo "   ❌ GitHub CLI disabled (use OAuth instead)"
else
  echo "   ❌ OAuth not configured"
  echo "   💡 Set GITHUB_OAUTH_CLIENT_ID + GITHUB_OAUTH_CLIENT_SECRET to enable"
fi

# Check GitHub App configuration
echo
echo "2. GitHub App Configuration:"
if [[ -n "$GITHUB_APP_ID" && -n "$GITHUB_APP_PRIVATE_KEY" && "$GITHUB_APP_ENABLED" == "true" ]]; then
  echo "   ✅ GitHub App configured"
  echo "   🤖 Advanced OAuth tools available"
  echo "   ❌ GitHub CLI disabled (use GitHub App instead)"
else
  echo "   ❌ GitHub App not configured"
  echo "   💡 Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_ENABLED=true"
fi

# Check Enterprise configuration
echo
echo "3. Enterprise Configuration:"
if [[ -n "$GITHUB_ORGANIZATION" || "$AUDIT_ALL_ACCESS" == "true" || -n "$RATE_LIMIT_API_HOUR" ]]; then
  echo "   ✅ Enterprise mode active"
  echo "   🏢 Organization tools available"
  echo "   📋 Audit logging: $(if [[ "$AUDIT_ALL_ACCESS" == "true" ]]; then echo "Enabled"; else echo "Disabled"; fi)"
  echo "   ⚡ Rate limiting: $(if [[ -n "$RATE_LIMIT_API_HOUR" ]]; then echo "Enabled ($RATE_LIMIT_API_HOUR/hour)"; else echo "Disabled"; fi)"
  echo "   ❌ GitHub CLI disabled (security policy)"
else
  echo "   ❌ Enterprise mode inactive"
  echo "   💡 Set GITHUB_ORGANIZATION or AUDIT_ALL_ACCESS=true to enable"
fi

# Check fallback authentication
echo
echo "4. Fallback Authentication:"
echo "   GITHUB_TOKEN: $(if [[ -n "$GITHUB_TOKEN" ]]; then echo "✅ Set"; else echo "❌ Not set"; fi)"
echo "   GH_TOKEN: $(if [[ -n "$GH_TOKEN" ]]; then echo "✅ Set"; else echo "❌ Not set"; fi)"
echo "   GitHub CLI: $(if command -v gh &> /dev/null && gh auth status &> /dev/null 2>&1; then echo "✅ Authenticated"; else echo "❌ Not authenticated"; fi)"

# Summary
echo
echo "5. Summary:"
if [[ (-n "$GITHUB_OAUTH_CLIENT_ID" && -n "$GITHUB_OAUTH_CLIENT_SECRET") || (-n "$GITHUB_APP_ID" && -n "$GITHUB_APP_PRIVATE_KEY") || -n "$GITHUB_ORGANIZATION" ]]; then
  echo "   🔒 Enhanced authentication mode"
  echo "   🚫 GitHub CLI disabled for security"
  echo "   🛠️ Authentication tools available"
else
  echo "   💻 Local development mode"
  echo "   ✅ GitHub CLI enabled" 
  echo "   🔧 Fallback token resolution only"
fi

echo
echo "💡 To test: Configure MCP client and check tool registration"
echo "Look for authentication tool registration messages in client logs"
```

### Complete Authentication Test Script

Save this as `test-auth.sh` and run `bash test-auth.sh`:

```bash
#!/bin/bash

echo "🧪 Testing Octocode MCP Authentication..."
echo "========================================="
echo

# Test 1: Check configuration
echo "1. Configuration Detection:"
./check-auth-config.sh

echo
echo "2. Token Availability Test:"

# Test GITHUB_TOKEN
if [[ -n "$GITHUB_TOKEN" ]]; then
  echo "   Testing GITHUB_TOKEN..."
  if curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | jq -r '.login' &>/dev/null; then
    echo "   ✅ GITHUB_TOKEN valid"
  else
    echo "   ❌ GITHUB_TOKEN invalid or expired"
  fi
else
  echo "   ⏭️ GITHUB_TOKEN not set"
fi

# Test GitHub CLI
if command -v gh &> /dev/null; then
  echo "   Testing GitHub CLI..."
  if gh auth status &>/dev/null; then
    echo "   ✅ GitHub CLI authenticated"
    echo "   👤 User: $(gh api user | jq -r .login)"
  else
    echo "   ❌ GitHub CLI not authenticated"
  fi
else
  echo "   ⏭️ GitHub CLI not installed"
fi

echo
echo "3. MCP Configuration Test:"
echo "   Configure MCP client and check startup logs..."
echo "   Look for authentication method detection and tool registration"

echo
echo "✅ Authentication test complete"
echo "💡 Check the output above for authentication method used"
```

### Verify Tool Registration

```bash
# Check which tools are registered in your MCP client logs
# Expected outputs by configuration:
# Local Mode: "✅ GitHub CLI enabled" 
# OAuth Mode: "🔐 simpleOAuth tool registered"
# Enterprise Mode: "🏢 Enterprise mode active"
```

### Run Authentication Tests

```bash
# Run comprehensive authentication priority tests
npm test -- tests/auth/authenticationPriority.test.ts

# Run tool registration tests  
npm test -- tests/auth/toolRegistration.test.ts

# Run all authentication tests
npm test -- tests/auth/
```

---

## Troubleshooting  

### Common Issues & Solutions

#### ❌ "No GitHub token found at startup"

**Diagnosis:**
```bash
# Check available authentication methods
echo "GITHUB_TOKEN: $([[ -n "$GITHUB_TOKEN" ]] && echo "Set" || echo "Not set")"
echo "GH_TOKEN: $([[ -n "$GH_TOKEN" ]] && echo "Set" || echo "Not set")"
echo "OAuth: $([[ -n "$GITHUB_OAUTH_CLIENT_ID" && -n "$GITHUB_OAUTH_CLIENT_SECRET" ]] && echo "Configured" || echo "Not configured")"
echo "GitHub App: $([[ -n "$GITHUB_APP_ID" && -n "$GITHUB_APP_PRIVATE_KEY" && "$GITHUB_APP_ENABLED" == "true" ]] && echo "Configured" || echo "Not configured")"
echo "CLI: $(gh auth status 2>/dev/null && echo "Authenticated" || echo "Not authenticated")"
```

**Solutions (in order of preference):**
1. **Quick fix**: `export GITHUB_TOKEN=ghp_your_token`
2. **OAuth setup**: Configure CLIENT_ID + CLIENT_SECRET, then use simpleOAuth tool
3. **GitHub App**: Configure GitHub App credentials
4. **CLI setup**: `gh auth login` (only works in local development mode)

#### ❌ "CLI token ignored / disabled"

**Diagnosis:**
```bash
# Check why CLI is disabled
if [[ -n "$GITHUB_OAUTH_CLIENT_ID" && -n "$GITHUB_OAUTH_CLIENT_SECRET" ]]; then
  echo "🔐 CLI disabled: OAuth credentials configured"
  echo "   → Use simpleOAuth tool for authentication"
elif [[ -n "$GITHUB_APP_ID" && -n "$GITHUB_APP_PRIVATE_KEY" && "$GITHUB_APP_ENABLED" == "true" ]]; then
  echo "🤖 CLI disabled: GitHub App configured"
  echo "   → GitHub App tokens used automatically"
elif [[ -n "$GITHUB_ORGANIZATION" || "$AUDIT_ALL_ACCESS" == "true" || -n "$RATE_LIMIT_API_HOUR" ]]; then
  echo "🏢 CLI disabled: Enterprise mode active"
  echo "   → Security policy prevents CLI token usage"
else
  echo "✅ CLI should be enabled - check 'gh auth status'"
fi
```

**Solutions:**
1. **Use OAuth**: Configure OAuth and use simpleOAuth tool
2. **Use PAT**: Set `GITHUB_TOKEN` environment variable  
3. **Remove config**: Unset OAuth/GitHub App/Enterprise variables to re-enable CLI
4. **Check CLI**: Run `gh auth login` to authenticate CLI

#### ❌ "No authentication tools available"

**Problem:** No OAuth, GitHub App, or Enterprise configuration detected.

**Solutions:**
```bash
# Option 1: Enable OAuth
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret

# Option 2: Enable GitHub App  
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
export GITHUB_APP_ENABLED=true

# Option 3: Enable Enterprise features
export GITHUB_ORGANIZATION=your-org
export AUDIT_ALL_ACCESS=true
```

#### ❌ OAuth Issues

**"OAuth redirect_uri mismatch"**
- Ensure callback URL in GitHub OAuth App exactly matches `GITHUB_OAUTH_REDIRECT_URI`
- For local development: `http://127.0.0.1:8765/auth/callback`  
- For production: `https://yourapp.com/auth/callback`
- No trailing slashes, exact port numbers required

**"Device flow not supported"**
- Enable **"Device Flow"** checkbox in GitHub OAuth App settings
- This is required for the simpleOAuth tool

**"OAuth state parameter mismatch"**
- Clear browser cookies and restart OAuth flow
- Check that `oauthCallback` is called within 15 minutes of `oauthInitiate`

**"Token exchange failed"**
- Verify GitHub Client ID and Secret are correct
- Check network connectivity to GitHub OAuth endpoints  
- Ensure GitHub OAuth App has correct permissions

#### ❌ Enterprise Issues

**"Organization membership validation failed"**
- Ensure user is member of configured `GITHUB_ORGANIZATION`
- Add `read:org` scope to OAuth token or PAT
- Verify organization name is correct (case-sensitive)

**"Audit logging not working"**  
- Ensure `AUDIT_ALL_ACCESS=true` is set
- Check that `AUDIT_LOG_DIR` directory exists and is writable
- Logs are buffered and flushed every 5 minutes

**"SSO enforcement blocking access"**
- Set `GITHUB_SSO_ENFORCEMENT=true` only in SSO-enabled organizations
- Use OAuth or GitHub App tokens (not CLI tokens) 
- Ensure SSO is configured properly in organization settings

#### ❌ GitHub Enterprise Server Issues

**"Connection refused to GitHub Enterprise Server"**
```bash
# Test connectivity to your GHES instance
curl -I https://github.enterprise.com/api/v3

# Verify environment variables
echo "GITHUB_HOST: $GITHUB_HOST"
echo "API Base: ${GITHUB_HOST}/api/v3"
```

**"OAuth endpoints not found"**
```bash
# Set explicit OAuth URLs for GHES
export GITHUB_OAUTH_AUTH_URL=https://github.enterprise.com/login/oauth/authorize
export GITHUB_OAUTH_TOKEN_URL=https://github.enterprise.com/login/oauth/access_token
```

### Debug Mode

Enable comprehensive debug logging:

```bash
export DEBUG=octocode:auth,octocode:token
export ENABLE_COMMAND_LOGGING=true
export LOG_FILE_PATH=./debug.log
npx octocode-mcp
```

This will show detailed information about:
- Authentication method detection
- Token resolution process
- Tool registration decisions  
- API calls and responses

---

## Security Best Practices

### 🔐 Token Security

**Storage & Handling**
- ✅ Use OAuth with automatic refresh for production deployments
- ✅ Store tokens in secure environment variables or secrets management systems
- ✅ Never commit tokens to version control (.env files in .gitignore)
- ✅ Never log tokens in plain text or error messages
- ✅ Rotate tokens regularly (OAuth handles this automatically)

**Scope Management**
- ✅ Use minimal required scopes for your use case
- ✅ Regular scope auditing and cleanup
- ✅ Prefer fine-grained PATs over classic PATs
- ❌ Avoid excessive permissions like `admin:org` unless necessary

### 🏢 Enterprise Security

**Access Control**
- ✅ Enable organization membership validation
- ✅ Use team-based access control with `GITHUB_REQUIRED_TEAMS`
- ✅ Implement SSO enforcement where required
- ✅ Require MFA for sensitive operations
- ✅ Use GitHub App permissions for fine-grained control

**Monitoring & Logging**
- ✅ Enable comprehensive audit logging with `AUDIT_ALL_ACCESS=true`
- ✅ Monitor authentication patterns and unusual activity
- ✅ Set up appropriate rate limiting
- ✅ Regular security reviews of access patterns
- ✅ Automated alerting on policy violations

**Configuration Security**
- ✅ Use environment-specific configurations (dev/staging/prod)
- ✅ Implement proper secrets rotation procedures  
- ✅ Monitor for unauthorized configuration changes
- ✅ Use infrastructure as code for configuration management

### 🌐 Network Security

**OAuth Callbacks**
- ✅ Use HTTPS for all OAuth callback URLs in production
- ✅ Validate redirect URIs strictly - no wildcards
- ✅ Implement proper CORS policies for web-based callbacks
- ✅ Use secure session management for stateful flows

**API Communication**
- ✅ Always use TLS/HTTPS for GitHub API communication
- ✅ Validate SSL/TLS certificates properly
- ✅ Implement proper timeout and retry logic
- ✅ Monitor for suspicious API usage patterns

### 🛡️ Operational Security

**Infrastructure**
- ✅ Use environment-specific configurations
- ✅ Implement proper backup and disaster recovery for credential stores
- ✅ Monitor for suspicious activity and policy violations
- ✅ Regular security audits and penetration testing
- ✅ Incident response procedures for security breaches

**Development Practices**
- ✅ Code review for authentication-related changes
- ✅ Security-focused testing (covered by our test suite)
- ✅ Regular dependency updates and vulnerability scanning
- ✅ Security training for developers working with authentication

---

## Quick Reference Cards

### 💻 Local Development (Fastest)
```bash
gh auth login              # One-time setup
# Then configure MCP client (no env vars needed)
```
**When it works:** No OAuth/GitHub App/Enterprise config  
**Features:** Zero configuration, all tools available immediately

### 📝 Personal Access Token (Universal)
```bash
# Add GITHUB_TOKEN to MCP client configuration
# Works in any environment
```
**When to use:** CI/CD, containers, development, simple setups  
**Features:** Universal compatibility, simple configuration

### 🔐 OAuth Setup (Production)
```bash
# Add OAuth credentials to MCP client configuration
# Use simpleOAuth tool in your MCP client for authentication
```  
**When to use:** Production deployments, shared environments, organizations  
**Features:** Most secure, automatic token refresh, user-friendly

### 🤖 GitHub App (Advanced)  
```bash
# Add GitHub App credentials to MCP client configuration
# Automatic JWT-based authentication
```
**When to use:** Enterprise environments, fine-grained permissions  
**Features:** High rate limits, fine-grained permissions, automatic refresh

### 🏢 Enterprise (Complete Security)
```bash
# Add enterprise configuration to MCP client
# Includes OAuth + organization validation + audit logging
```
**When to use:** Large organizations, compliance requirements  
**Features:** Audit logging, rate limiting, organization validation, SSO

---

## Migration & Comparison

### Authentication Method Comparison

| Feature | Level 1<br/>Local Dev | Level 2<br/>Organizations | Level 3<br/>Enterprise | Level 4<br/>Hosted | Advanced<br/>GitHub App |
|---------|----------------------|-------------------------|----------------------|-------------------|------------------------|
| **Setup Time** | < 2 min | 10 min | 30 min | 20 min | 45 min |
| **Security Level** | Basic | High | Maximum | High | Maximum |
| **Token Refresh** | Manual | Automatic | Automatic | Automatic | Automatic |
| **Audit Logging** | ❌ | ❌ | ✅ Full | ❌ | ✅ Full |
| **Rate Limits** | 1000/hr | 5000/hr | Configurable | 5000/hr | 5000/hr |
| **Organization Control** | ❌ | ❌ | ✅ Full | ❌ | ✅ Full |
| **CLI Authentication** | ✅ Enabled | ❌ Disabled | ❌ Disabled | ❌ Disabled | ❌ Disabled |
| **Best For** | Individual devs | Teams, orgs | Compliance | SaaS, cloud | Enterprise |

### Migration Paths

#### From Local Development to Production
```bash
# Current: GitHub CLI
gh auth login

# Migrate to: OAuth
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
# CLI automatically disabled for security
```

#### From PAT to OAuth
```bash
# Current: Personal Access Token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Migrate to: OAuth (more secure)
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
# Use simpleOAuth tool for user authentication
```

#### From OAuth to Enterprise
```bash
# Current: Basic OAuth
export GITHUB_OAUTH_CLIENT_ID=your_client_id
export GITHUB_OAUTH_CLIENT_SECRET=your_client_secret

# Upgrade to: Enterprise
export GITHUB_ORGANIZATION=your-org
export AUDIT_ALL_ACCESS=true
export RATE_LIMIT_API_HOUR=5000
# Enterprise features automatically enabled
```

### Quick Configuration Reference

#### 🚀 Level 1: Local Development
```bash
# Zero configuration - just authenticate CLI
gh auth login
# Then add basic MCP configuration (no env vars needed)
```

#### 🔐 Level 2: Organizations
```bash
# Add OAuth credentials to MCP client configuration
# Use simpleOAuth tool for user authentication
```

#### 🏢 Level 3: Enterprise
```bash
# Add enterprise OAuth + organization settings to MCP client
# Includes audit logging and rate limiting
```

#### ☁️ Level 4: Hosted Services
```bash
# Add OAuth with callback URLs to MCP client or Docker configuration
# Includes MCP compliance and web app integration
```

#### 🤖 Advanced: GitHub App
```bash
# Add GitHub App credentials to MCP client configuration
# Includes enterprise organization validation
```

---

## Summary

### 🎯 Key Takeaways

1. **Start Simple**: Begin with Level 1 (GitHub CLI) for immediate productivity
2. **Scale Securely**: Move to Level 2 (OAuth) when sharing with teams
3. **Enterprise Ready**: Level 3 provides full compliance and audit capabilities
4. **Cloud Native**: Level 4 supports modern SaaS and containerized deployments
5. **Maximum Control**: GitHub Apps offer fine-grained permissions and enterprise features

### 🛠️ Automatic Configuration Detection

The system intelligently detects your deployment scenario:
- **No auth config** → Level 1: CLI enabled, local development mode
- **OAuth credentials** → Level 2: Simple OAuth tools, CLI disabled for security
- **Enterprise variables** → Level 3: Full audit logging, organization controls
- **Hosted configuration** → Level 4: Callback handling, MCP compliance
- **GitHub App credentials** → Advanced: Fine-grained permissions, JWT refresh

### 🔒 Security by Design

- **Progressive Security**: Each level adds appropriate security features
- **Automatic CLI Protection**: CLI tokens disabled in production configurations
- **Comprehensive Audit Trails**: Enterprise logging with PII redaction
- **Token Priority System**: Most secure available method used automatically
- **Built-in Compliance**: Follows OAuth 2.1, PKCE, and MCP standards

**Choose the authentication level that matches your deployment requirements. The system automatically provides appropriate security and features for each scenario.**

---

*For additional help, troubleshooting, or to report issues, visit our [GitHub repository](https://github.com/anthropics/octocode-mcp) for the latest updates and community support.*
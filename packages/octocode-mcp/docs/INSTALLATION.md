# Octocode MCP Installation Guide

Comprehensive installation and configuration guide for Octocode MCP Server. Supports individual developers, teams, and enterprise deployments with advanced security features.

## Quick Start

```bash
# Install globally
npm install -g octocode-mcp

# Or run directly  
npx octocode-mcp

# With Docker
docker run -i --rm -e GITHUB_TOKEN octocode/octocode-mcp:latest
```

Octocode requires a GitHub token at startup. If no token is available, it will fail fast during initialization.

How Octocode resolves your token (priority order):
- `GITHUB_TOKEN`
- `GH_TOKEN`
- GitHub CLI token from `gh auth token` (**disabled in Enterprise mode**)
- `Authorization` environment variable (Bearer or token prefix)

Implementation reference: `src/mcp/utils/tokenManager.ts` (`resolveToken`, `getToken`) and `src/index.ts` (bootstrap and enterprise initialization).

## Tool Configuration

Octocode MCP provides simple tool management through environment variables. The system uses default tools with optional enable/disable lists.

### Default Tools (Always Available)

The following tools are **enabled by default** and require no configuration:

**Core GitHub Tools:**
- ✅ `github_search_code` - Semantic code search across repositories  
- ✅ `github_fetch_content` - File content retrieval with partial access
- ✅ `github_view_repo_structure` - Repository structure exploration
- ✅ `github_search_repositories` - Repository discovery and exploration

### Optional Tools (Disabled by Default)

The following tools are **disabled by default** but can be enabled:

**Extended GitHub Tools:**
- ➕ `github_search_commits` - Commit history and change analysis
- ➕ `github_search_pull_requests` - Pull request analysis with diff content  

**Package Management Tools:**
- ➕ `package_search` - NPM and Python package discovery

### Tool Control

```bash
# Enable additional tools (adds to default tools)
export ENABLE_TOOLS="github_search_commits,package_search"

# Disable default tools (removes from default tools)
export DISABLE_TOOLS="github_view_repo_structure"
```

### Configuration Examples

```bash
# Default setup (no configuration needed)
# Runs: github_search_code, github_fetch_content, github_view_repo_structure, github_search_repositories

# Add commit search
export ENABLE_TOOLS="github_search_commits"
# Runs: all default tools + github_search_commits

# Remove repository structure tool
export DISABLE_TOOLS="github_view_repo_structure" 
# Runs: github_search_code, github_fetch_content, github_search_repositories

# Full GitHub + package search
export ENABLE_TOOLS="github_search_commits,github_search_pull_requests,package_search"
# Runs: all default tools + extended GitHub tools + package search

# Minimal code research setup
export DISABLE_TOOLS="github_search_repositories"
export ENABLE_TOOLS="github_search_commits"
# Runs: github_search_code, github_fetch_content, github_view_repo_structure + github_search_commits
```

### Tool Priority

1. **Default tools** are enabled automatically
2. **ENABLE_TOOLS** adds additional tools to the default set
3. **DISABLE_TOOLS** removes tools from the final set (takes priority)

**Note**: Tool changes require restarting the MCP server.

## 1) Individual Developers

Goal: Make a token available to Octocode locally and configure tools as needed.

### GitHub CLI Setup (Recommended for Individual Developers)

The GitHub CLI provides the easiest authentication method for local development:

**Installation:**
```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt update
sudo apt install gh

# Windows (winget)
winget install GitHub.cli

# Windows (scoop)
scoop install gh

# Manual installation: https://github.com/cli/cli#installation
```

**Authentication and Setup:**
```bash
# Authenticate with GitHub
gh auth login
# Choose: GitHub.com → HTTPS → Yes (Git credential helper) → Login via web browser

# Verify authentication
gh auth status
# Should show: ✓ Logged in to github.com as <username>

# Test token access (shows first 5 chars for security)
gh auth token | head -c 5 && echo '*****'

# Verify API access
gh api user --jq '.login'
```

**Post-Authentication Configuration:**
```bash
# Optional: Enable additional tools (default tools run automatically)
export ENABLE_TOOLS="github_search_commits,package_search"

# Optional: Performance tuning
export REQUEST_TIMEOUT=30000   # 30 seconds (default)
export MAX_RETRIES=3          # Default retry count

# Optional: Enable beta features
export BETA=true              # Enables experimental features
```

**Complete Individual Developer Setup:**
```bash
# 1. Install and authenticate GitHub CLI
gh auth login

# 2. Verify access
gh auth status && gh api user --jq '.login'

# 3. (Optional) Enable additional tools
export ENABLE_TOOLS="github_search_commits,package_search"
export BETA=true

# 4. Run Octocode MCP
npx octocode-mcp
```

**⚠️ Note**: GitHub CLI token resolution is **disabled in Enterprise mode** for security reasons. Enterprise deployments must use environment variables.

Alternative: Environment variable
```bash
# macOS/Linux (bash/zsh)
export GITHUB_TOKEN="<your_personal_access_token>"

# Windows PowerShell
$env:GITHUB_TOKEN = "<your_personal_access_token>"
```

Notes that match the code:
- Octocode will first read `GITHUB_TOKEN`, then `GH_TOKEN`, then fall back to the GitHub CLI token.
- Tokens may be provided with prefixes like "Bearer" or "token"; Octocode normalizes them internally.
- On startup, Octocode calls `getToken()` and will exit if no token is found.

## 2) Organizations (Enterprise)

Goal: Provide a token with the right scopes and identify your organization so Octocode can enable org-aware features.

Required token scopes for private org work:
```
repo, read:org, read:user
```

Create a Personal Access Token (PAT):
1. Go to GitHub Settings → Developer settings → Personal access tokens (classic)
2. Generate a new token with scopes: `repo`, `read:org`, `read:user`
3. Copy the token (store it securely)

Provide the token via environment variables (CLI is disabled in enterprise mode):
```bash
# Required: environment variable (CLI authentication disabled for security)
export GITHUB_TOKEN="<enterprise_pat_with_scopes>"
```

**🔒 Enterprise Security**: CLI token resolution is disabled in enterprise mode. You must use environment variables (`GITHUB_TOKEN` or `GH_TOKEN`) for authentication.

Identify your organization to enable enterprise features:
```bash
export GITHUB_ORGANIZATION="your-org"
```

What this does (per implementation in `src/index.ts`):
- If `GITHUB_ORGANIZATION` is set: initializes `OrganizationManager` and `PolicyManager`, and configures `tokenManager.initialize` with org context.
- If `AUDIT_ALL_ACCESS=true`: initializes `AuditLogger` with periodic flush and secure JSONL logging.
- If any `RATE_LIMIT_*` env is set: initializes `RateLimiter` with configured per-hour limits.
- All these are progressive: only enabled when their envs are present. Core behavior continues without them.

Optional enterprise environment variables:
```bash
# Organization identity (enables org validation)
export GITHUB_ORGANIZATION="your-org"                 # REQUIRED to enable org-aware features
export GITHUB_ORGANIZATION_NAME="Your Organization"   # Optional display name

# Access controls (enforced by Policy/Organization Managers)
export GITHUB_ALLOWED_USERS="user1,user2"             # Limit to specific usernames (optional)
export GITHUB_REQUIRED_TEAMS="developers,security"     # Require membership in ALL listed teams (optional)
export GITHUB_ADMIN_USERS="admin1,admin2"             # Admin users with elevated allowances (optional)

# Security policies
export RESTRICT_TO_MEMBERS=true                        # Deny non-org members (optional)
export REQUIRE_MFA=true                                # Enforce MFA requirement (optional)

# Audit logging
export AUDIT_ALL_ACCESS=true                           # Enable comprehensive audit logging (optional)
export AUDIT_LOG_DIR=./logs/audit                      # Custom log directory (optional)

# Per-user rate limits (per hour)
export RATE_LIMIT_API_HOUR=1000
export RATE_LIMIT_AUTH_HOUR=10
export RATE_LIMIT_TOKEN_HOUR=50
```

Step-by-step (enterprise):
```bash
# 1) Create PAT with scopes: repo, read:org, read:user
export GITHUB_TOKEN="<enterprise_pat>"

# 2) Set your organization
export GITHUB_ORGANIZATION="your-org"

# 3) (Optional) Enable enterprise modules
export AUDIT_ALL_ACCESS=true
export GITHUB_REQUIRED_TEAMS="developers,security"
export RATE_LIMIT_API_HOUR=1000

# 4) Run Octocode (from your assistant or shell)
npx octocode-mcp
```

Verification tips:
```bash
# Confirm your token works with GitHub
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user | jq .login

# Confirm org membership endpoint is accessible with your scopes
curl -I -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/orgs/<your-org>/members/<your-username>

# If using required teams, verify team membership via GitHub UI/API
# Ensure the PAT owner is a member of ALL teams in GITHUB_REQUIRED_TEAMS
```

Security behavior (aligned with code):
- Token is resolved once and cached in memory; if present, it is stored via the in-memory credential store (`SecureCredentialStore`).
- Source tracking is kept (`env`, `cli`, or `authorization`).
- If you rotate tokens, restart Octocode or use internal rotation APIs if integrated.

Troubleshooting (org auth):
- 403/404 on org membership endpoint: token missing `read:org` or membership is private; use a PAT with `read:org`.
- No enterprise features active: confirm `GITHUB_ORGANIZATION` is set (and `AUDIT_ALL_ACCESS`, `RATE_LIMIT_*` if desired).
- Required teams failing: user must be in ALL teams listed in `GITHUB_REQUIRED_TEAMS`.
- Check logs directory when `AUDIT_ALL_ACCESS=true` and ensure write permissions to `AUDIT_LOG_DIR`.

## 3) Advanced Configuration

### OAuth Configuration (Alternative Authentication)

For applications requiring OAuth flow instead of token-based authentication:

```bash
# OAuth Setup
export GITHUB_OAUTH_ENABLED=true                    # Enable OAuth (default: true if client configured)
export GITHUB_OAUTH_CLIENT_ID="your_client_id"      # Required for OAuth
export GITHUB_OAUTH_CLIENT_SECRET="your_secret"     # Required for OAuth
export GITHUB_OAUTH_REDIRECT_URI="http://localhost:3000/auth/callback"  # Default callback
export GITHUB_OAUTH_SCOPES="repo,read:user"         # Default scopes
export GITHUB_OAUTH_AUTH_URL="https://github.com/login/oauth/authorize"  # Custom auth URL
export GITHUB_OAUTH_TOKEN_URL="https://github.com/login/oauth/access_token"  # Custom token URL
```

### GitHub App Configuration

For GitHub App authentication (advanced use cases):

```bash
# GitHub App Setup  
export GITHUB_APP_ENABLED=true                      # Enable GitHub App auth
export GITHUB_APP_ID="123456"                       # Your GitHub App ID
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."  # Private key content
export GITHUB_APP_INSTALLATION_ID="12345678"        # Installation ID (optional)
export GITHUB_HOST="github.company.com"             # For GitHub Enterprise Server
```

### GitHub Enterprise Server

For GitHub Enterprise Server deployments:

```bash
# Enterprise Server Configuration
export GITHUB_HOST="github.company.com"             # Your GHE server hostname
export GITHUB_TOKEN="your_enterprise_token"         # Token for your GHE instance

# API URLs are automatically configured based on GITHUB_HOST:
# - API Base: https://github.company.com/api/v3
# - Auth URL: https://github.company.com/login/oauth/authorize  
# - Token URL: https://github.company.com/login/oauth/access_token
```

### Performance & Reliability

```bash
# Request Configuration
export REQUEST_TIMEOUT=30000                        # Request timeout in ms (default: 30000)
export MAX_RETRIES=3                                # Max retry attempts (default: 3)

# Command Logging (for debugging)
export ENABLE_COMMAND_LOGGING=true                  # Log all CLI commands
export LOG_FILE_PATH="/path/to/logfile.log"         # Custom log file location
```

### Beta Features

```bash
# Beta Feature Access
export BETA=true                                    # Enable all beta features
# When enabled, provides access to:
# - Advanced sampling capabilities
# - Experimental tool features  
# - Enhanced debugging information
```

### Complete Configuration Reference

Environment variables are processed in this order:

1. **Authentication** (required):
   - `GITHUB_TOKEN` or `GH_TOKEN` or GitHub CLI token
   
2. **Tool Management** (optional):
   - `ENABLE_TOOLS="tool1,tool2"` (adds to default tools)
   - `DISABLE_TOOLS="tool3,tool4"` (removes from default tools)

3. **Enterprise Features** (optional):
   - `GITHUB_ORGANIZATION="your-org"`
   - `AUDIT_ALL_ACCESS=true`
   - `RATE_LIMIT_API_HOUR=1000`
   - `RESTRICT_TO_MEMBERS=true`
   - `REQUIRE_MFA=true`

4. **Advanced Authentication** (optional):
   - OAuth: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`
   - GitHub App: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`

5. **Performance Tuning** (optional):
   - `REQUEST_TIMEOUT=30000`
   - `MAX_RETRIES=3`
   - `BETA=true`

**Configuration Validation**: Invalid configurations are automatically corrected with warnings logged to stderr. The server will continue to operate with safe defaults.

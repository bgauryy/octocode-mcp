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

Implementation reference: `src/mcp/tools/utils/tokenManager.ts` (`resolveToken`, `getToken`) and `src/index.ts` (bootstrap and enterprise initialization).

## 1) Individual Developers

Goal: Make a token available to Octocode locally.

Recommended: GitHub CLI (Individual developers only)
```bash
# Install GitHub CLI (examples)
# macOS: brew install gh
# Ubuntu/Debian: sudo apt install gh
# Windows: winget install GitHub.cli

# Authenticate
gh auth login

# Verify token is available
gh auth status
gh auth token | head -c 5 && echo '*****'
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

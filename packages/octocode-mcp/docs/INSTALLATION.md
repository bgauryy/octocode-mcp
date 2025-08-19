# Octocode MCP Installation & Configuration Guide

## Table of Contents

- [Quick Start](#quick-start)
- [Local Authentication (dev-first)](#local-authentication-dev-first)
  - [Token sources (priority order)](#token-sources-priority-order)
  - [How Octocode chooses a token (fallback system)](#how-octocode-chooses-a-token-fallback-system)
- [Required GitHub Permissions (Scopes)](#required-github-permissions-scopes)
- [Authentication Sources & Fallback Order](#authentication-sources--fallback-order)
- [OAuth 2.0/2.1 (PKCE) Setup](#oauth-2021-pkce-setup)
  - [Configure environment](#configure-environment)
  - [Flow methods (all supported)](#flow-methods-all-supported)
  - [PKCE Authorization Code flow](#pkce-authorization-code-flow)
  - [Using a custom auth page (manual method)](#using-a-custom-auth-page-manual-method)
  - [Local server method](#local-server-method)
- [MCP Resource Metadata Server (optional)](#mcp-resource-metadata-server-optional)
- [GitHub App (Enterprise)](#github-app-enterprise)
- [Enterprise Features](#enterprise-features)
- [MCP Client Examples](#mcp-client-examples)
- [Verification & Health](#verification--health)
- [Troubleshooting](#troubleshooting)
- [Configuration Reference](#configuration-reference)
- [GitHub Enterprise Server (GHES) Setup](#github-enterprise-server-ghes-setup)
- [Organization Security Profiles (examples)](#organization-security-profiles-examples)
- [Docker Deployment Examples](#docker-deployment-examples)
- [Security Best Practices](#security-best-practices)
- [FAQ](#faq)

## Quick Start

```bash
# Install globally
npm install -g octocode-mcp

# Or run directly
npx octocode-mcp

# With Docker
docker run -i --rm -e GITHUB_TOKEN octocode/octocode-mcp:latest
```

Startup behavior (validated): the server calls `getToken()` at startup and will exit if no usable token source is available.

## Local Authentication (dev-first)

Use these options first when developing locally. Enterprise mode changes behavior (CLI disabled) – see Enterprise section.

### Token sources (priority order)

- GITHUB_TOKEN or GH_TOKEN
- GitHub CLI token (gh auth token) [disabled in enterprise]
- Authorization environment variable (Bearer/token)

Examples:

```bash
# PAT (Preferred for local dev)
export GITHUB_TOKEN="ghp_xxx"

# CLI (non-enterprise only)
gh auth login
gh auth status

# Authorization env (fallback)
export Authorization="Bearer ghp_xxx"
```

Helpful links:
- Install GitHub CLI: [GitHub CLI](https://cli.github.com/)
- Create a personal access token: [Fine‑grained PAT](https://github.com/settings/personal-access-tokens/new) or [Classic PAT](https://github.com/settings/tokens/new)

### How Octocode chooses a token (fallback system)

```mermaid
flowchart TD
  A([Start]) --> B{OAuth token available?}
  B -- Yes --> B1[Use OAuth access token]
  B -- No --> C{GitHub App token available?}
  C -- Yes --> C1[Use installation token]
  C -- No --> D{Env tokens present?}
  D -- GITHUB_TOKEN --> D1[Use GITHUB_TOKEN]
  D -- GH_TOKEN --> D2[Use GH_TOKEN]
  D -- None --> E{Enterprise mode?}
  E -- Yes --> E1[Skip CLI for security]
  E1 --> F{Authorization env?}
  E -- No --> G{CLI token available?}
  G -- Yes --> G1[Use gh auth token]
  G -- No --> F
  F -- Yes --> F1[Use Authorization env token]
  F -- No --> Z[[Fail: no token found]]
  B1 --> DONE([Token ready])
  C1 --> DONE
  D1 --> DONE
  D2 --> DONE
  G1 --> DONE
  F1 --> DONE
```

## Required GitHub Permissions (Scopes)

Use read-only scopes. Minimum recommended for private repos and org-aware features:

| Scope | Why | Features |
|------|-----|----------|
| `repo` (or fine-grained: Contents: Read, Metadata: Read, Pull requests: Read) | Read private repository contents and metadata | Code search, file fetch, repo structure, PR/commit search |
| `read:user` | Identify the authenticated user and validate token | Token validation, rate limit checks |
| `read:org` | Verify organization membership and team policies | Enterprise org/teams validation |

Notes:
- Fine‑grained PATs: prefer read-only permissions for Contents, Metadata, Pull requests.
- OAuth apps should request the same read scopes; see `GITHUB_OAUTH_SCOPES`.

## Authentication Sources & Fallback Order

Exact priority implemented in `tokenManager.ts`:

1) OAuth token (stored securely, auto-refresh)
2) GitHub App installation token (auto-refresh via JWT)
3) `GITHUB_TOKEN`
4) `GH_TOKEN`
5) GitHub CLI token from `gh auth token` (disabled in Enterprise mode)
6) `Authorization` environment variable (supports `Bearer <token>` or `token <token>`)

Enterprise mode detection (code): enabled if any of `GITHUB_ORGANIZATION`, `AUDIT_ALL_ACCESS=true`, or any `RATE_LIMIT_*` env is set. In enterprise mode, CLI token resolution is disabled.

### getToken() resolution (implementation view)

```mermaid
flowchart LR
  A[getToken()] --> B[resolveTokenWithOAuth()]
  B --> C{tryGetOAuthToken()}
  C -- token --> Z[return OAuth token]
  C -- none --> D{tryGetGitHubAppToken()}
  D -- token --> Z
  D -- none --> E[resolveToken()]
  E --> F{GITHUB_TOKEN?}
  F -- yes --> Z
  F -- no --> G{GH_TOKEN?}
  G -- yes --> Z
  G -- no --> H{Enterprise mode?}
  H -- yes --> I[Skip CLI]
  H -- no --> J{gh CLI token?}
  J -- yes --> Z
  J -- no --> K{Authorization env?}
  I --> K
  K -- yes --> Z
  K -- no --> X[[throw Error: no token]]
```

Notes:
- CLI token resolution is skipped in enterprise mode.
- `Authorization` supports `Bearer <token>` or `token <token>` and is normalized.
- On success, tokens are cached and refresh is scheduled when applicable.

## Local Usage Options

Choose one of the following for development:

- GitHub CLI (recommended for local dev; disabled in enterprise)
  ```bash
  brew install gh   # macOS
  gh auth login
  gh auth status
  gh auth token | head -c 5 && echo '*****'
  ```

- Environment variable PAT
  ```bash
  export GITHUB_TOKEN="<your_pat>"
  # or
  export GH_TOKEN="<your_pat>"
  ```

- Authorization environment variable (last resort)
  ```bash
  # Supports Bearer/token prefixes; normalized internally
  export Authorization="Bearer <your_pat>"
  ```

- .env (when launching via an orchestrator that loads env files)
  ```bash
  GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
  GITHUB_HOST=github.com
  ```

Behavior details (validated): tokens are cached in memory and stored via `SecureCredentialStore`. Prefixes `Bearer` and `token` are normalized.

## OAuth 2.0/2.1 (PKCE) Setup

Best for hosted services or when you want user sign-in with scoped access. Fully implemented via `OAuthManager` with PKCE, secure state, refresh, and GitHub Enterprise support.

Notes:
- Scopes precedence: `oauthInitiate.scopes` passed at runtime overrides default `GITHUB_OAUTH_SCOPES` so each flow requests exactly the needed permissions (least privilege).
- Deep-link policy: deep-link callback is disabled by default. Enable with `ALLOW_OAUTH_DEEP_LINK=true` only in environments where the MCP client supports it.

### Configure environment

```bash
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
GITHUB_OAUTH_REDIRECT_URI=https://yourapp.com/auth/callback   # or http://127.0.0.1:8765/auth/callback for local
GITHUB_OAUTH_SCOPES=repo,read:user,read:org
GITHUB_OAUTH_ENABLED=true

# Optional for GitHub Enterprise Server
GITHUB_HOST=https://github.enterprise.com
GITHUB_OAUTH_AUTH_URL=https://github.enterprise.com/login/oauth/authorize
GITHUB_OAUTH_TOKEN_URL=https://github.enterprise.com/login/oauth/access_token
```

Callback URL must exactly match your OAuth app configuration.

### Flow methods (all supported)

- local_server (desktop/dev; built-in callback server)
  ```json
  { "callbackMethod": "local_server", "callbackPort": 8765 }
  ```

- manual (custom callback page; headless/server)
  ```json
  { "callbackMethod": "manual" }
  ```

- deep_link (for MCP gateways)
  ```json
  { "callbackMethod": "deep_link" }
  ```

  Deep-link requires client support and is disabled by default for security. Set `ALLOW_OAUTH_DEEP_LINK=true` to enable.

### PKCE Authorization Code flow

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

### Using a custom auth page (manual method)

Your page at `https://yourapp.com/auth/callback` only needs to read `code` and `state` from the URL and present them to the user (or deep-link back to the client). The token exchange occurs inside Octocode MCP.

### Local server method

Octocode can run a temporary local callback server (`http://127.0.0.1:8765/auth/callback`) to capture the code/state automatically. See `src/http/oauthCallbackServer.ts`.

## MCP Resource Metadata Server (optional)

Strict enterprises can host a local MCP resource metadata endpoint to back the `WWW-Authenticate` header’s `resource_metadata` URL.

- Enable with: `START_METADATA_SERVER=true`
- Default bind: `127.0.0.1:8787`
- Endpoint: `/.well-known/mcp-resource-metadata`

This returns the same protected resource metadata as `mcpAuthProtocol.getProtectedResourceMetadata()` and shuts down gracefully with the main server.

## GitHub App (Enterprise)

Use when your organization installs a GitHub App for broader access. Octocode will refresh the installation token automatically via App JWT.

```bash
GITHUB_APP_ID="123456"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID="12345678"
GITHUB_APP_ENABLED=true
```

Behavior (validated): installation tokens are stored securely and refreshed proactively (approximately 10 minutes before expiry due to conservative scheduling).

## Enterprise Features

Enterprise mode is enabled if ANY of the following are set:
- `GITHUB_ORGANIZATION`
- `AUDIT_ALL_ACCESS=true`
- any of `RATE_LIMIT_API_HOUR`, `RATE_LIMIT_AUTH_HOUR`, `RATE_LIMIT_TOKEN_HOUR`

Effects:
- GitHub CLI token resolution is disabled
- Optional modules initialize automatically at startup:
  - Audit logging (JSONL, buffered, daily rotation)
  - Rate limiting (per-hour)
  - SSO enforcement (optional via `GITHUB_SSO_ENFORCEMENT=true`): CLI tokens are blocked at tool entry; use OAuth, GitHub App, or env tokens instead.

Example configuration:
```bash
GITHUB_ORGANIZATION="your-org"
AUDIT_ALL_ACCESS=true
RATE_LIMIT_API_HOUR=1000
RATE_LIMIT_AUTH_HOUR=100
RATE_LIMIT_TOKEN_HOUR=50
```

Audit logging details:
- Location: `./logs/audit/audit-YYYY-MM-DD.jsonl` by default, or `AUDIT_LOG_DIR` if provided
- Format: JSONL, buffered, daily rotation
- Safety: tokens redacted and content sanitized

Rate limiting:
- Per-user/hour; set via `RATE_LIMIT_*` envs
- If unset, safe internal defaults apply

## MCP Client Examples

Claude Desktop:
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_OAUTH_CLIENT_ID": "your_client_id",
        "GITHUB_OAUTH_CLIENT_SECRET": "your_client_secret",
        "GITHUB_OAUTH_SCOPES": "repo,read:user,read:org",
        "GITHUB_ORGANIZATION": "your-org"
      }
    }
  }
}
```

MCP Gateway (YAML):
```yaml
servers:
  - name: octocode
    command: ["npx", "octocode-mcp"]
    environment:
      GITHUB_OAUTH_CLIENT_ID: "your_client_id"
      GITHUB_OAUTH_CLIENT_SECRET: "your_client_secret"
      GITHUB_OAUTH_SCOPES: "repo,read:user,read:org"
      GITHUB_ORGANIZATION: "your-org"
```

## Verification & Health

Check PAT works:
```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user | jq .login
```

Check rate limit:
```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit | jq .
```

Enable debug logs:
```bash
export DEBUG="octocode:auth,octocode:token"
export ENABLE_COMMAND_LOGGING="true"
export LOG_FILE_PATH="./octocode-debug.log"
```

Programmatic check:
```javascript
import { getTokenMetadata } from '@octocode/mcp/tokenManager';

const meta = await getTokenMetadata();
console.log(meta.source, meta.expiresAt);
```

Notes on scopes formatting:
- `GITHUB_OAUTH_SCOPES` is comma-separated in the environment (e.g., `repo,read:user,read:org`).
- The server automatically converts those to space-separated when building the authorization URL.

## Troubleshooting

- No token found at startup
  - Ensure one of: OAuth configured, GitHub App configured, `GITHUB_TOKEN`/`GH_TOKEN`, CLI (non‑enterprise), or `Authorization` env

- CLI token ignored
  - Enterprise mode disables CLI tokens by design

- OAuth redirect_uri mismatch
  - Callback URL in GitHub OAuth App must exactly match `GITHUB_OAUTH_REDIRECT_URI`

- Missing `read:org` scope
  - Add `read:org` to `GITHUB_OAUTH_SCOPES` or PAT scopes

- Token expired
  - OAuth and GitHub App tokens auto‑refresh; PATs do not
 
- 401 with `WWW-Authenticate`
  - Server signals `missing_token` or `invalid_token`; include a valid `Authorization: Bearer <token>` or configure OAuth/PAT
  - Resource metadata URL points to provider metadata

## Configuration Reference

Core authentication:
| Variable | Required | Example |
|----------|----------|---------|
| `GITHUB_TOKEN` | No* | `ghp_xxxxxxxxxxxx` |
| `GH_TOKEN` | No* | `ghp_xxxxxxxxxxxx` |
| `Authorization` | No* | `Bearer ghp_xxx` |
| `GITHUB_HOST` | No | `https://github.company.com` |

Server/runtime (optional):
| Variable | Required | Example |
|----------|----------|---------|
| `START_METADATA_SERVER` | No | `true` |
| `ALLOW_OAUTH_DEEP_LINK` | No | `true` |

OAuth:
| Variable | Required | Example |
|----------|----------|---------|
| `GITHUB_OAUTH_CLIENT_ID` | Yes† | `Iv1.a629723d4c8a5678` |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes† | `abc123...` |
| `GITHUB_OAUTH_REDIRECT_URI` | Yes† | `https://yourapp.com/auth/callback` |
| `GITHUB_OAUTH_SCOPES` | No | `repo,read:user,read:org` (comma-separated) |
| `GITHUB_OAUTH_ENABLED` | No | `true` |

GitHub App:
| Variable | Required | Example |
|----------|----------|---------|
| `GITHUB_APP_ID` | Yes‡ | `123456` |
| `GITHUB_APP_PRIVATE_KEY` | Yes‡ | `-----BEGIN RSA...` |
| `GITHUB_APP_INSTALLATION_ID` | No | `12345678` |
| `GITHUB_APP_ENABLED` | No | `true` |

Enterprise:
| Variable | Default | Example |
|----------|---------|---------|
| `GITHUB_ORGANIZATION` | - | `my-company` |
| `AUDIT_ALL_ACCESS` | `false` | `true` |
| `GITHUB_SSO_ENFORCEMENT` | `false` | `true` |
| `GITHUB_TOKEN_VALIDATION` | `false` | `true` |
| `GITHUB_PERMISSION_VALIDATION` | `false` | `true` |
| `RESTRICT_TO_MEMBERS` | `false` | `true` |
| `REQUIRE_MFA` | `false` | `true` |
| `RATE_LIMIT_API_HOUR` | - | `1000` |
| `RATE_LIMIT_AUTH_HOUR` | - | `100` |
| `RATE_LIMIT_TOKEN_HOUR` | - | `50` |

Access control (optional):
| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_ORGANIZATION_NAME` | Display name for organization | `Your Organization` |
| `GITHUB_ALLOWED_USERS` | Comma-separated usernames allowed | `user1,user2` |
| `GITHUB_REQUIRED_TEAMS` | Require membership in ALL listed teams | `developers,security` |
| `GITHUB_ADMIN_USERS` | Admin users with elevated allowances | `admin1,admin2` |

Tool management (optional):
| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_TOOLSETS` | Comma-separated toolsets to enable | `all` |
| `GITHUB_DYNAMIC_TOOLSETS` | Enable dynamic toolsets | `true` |
| `GITHUB_READ_ONLY` | Force read-only mode | `true` |

Footnotes: *At least one authentication method required. †Required for OAuth. ‡Required for GitHub App.

---

This guide consolidates all authentication and OAuth details into a single document, aligned with the implementation and ready for both local and enterprise deployments.

## GitHub Enterprise Server (GHES) Setup

When using GHES, set these variables so OAuth and API calls target your instance:

```bash
GITHUB_HOST=https://github.enterprise.com
# Optional explicit OAuth endpoints (otherwise derived from GITHUB_HOST)
GITHUB_OAUTH_AUTH_URL=https://github.enterprise.com/login/oauth/authorize
GITHUB_OAUTH_TOKEN_URL=https://github.enterprise.com/login/oauth/access_token
```

Effects (validated):
- Authorization URL and token URL use GHES host
- API base is `${GITHUB_HOST}/api/v3`

## OAuth Callback Methods Explained

- local_server: Starts a short-lived HTTP server on `127.0.0.1:8765` to receive `code` and `state` automatically. Ideal for desktop/dev.
- manual: Your hosted callback page displays `code` and `state` to paste back (or deep-link). Works in headless/server environments.
- deep_link: When integrated via an MCP gateway, uses the gateway’s deep link channel to deliver `code` and `state` back to the server.

Tokens are securely persisted via `SecureCredentialStore`; refresh is scheduled automatically (~5 minutes before expiry).

## Organization Security Profiles (examples)

Use these environment sets to configure different security postures for an organization deployment.

### Basic (org-aware, minimal restrictions)
```bash
GITHUB_ORGANIZATION="your-org"
AUDIT_ALL_ACCESS=false
RESTRICT_TO_MEMBERS=false
GITHUB_SSO_ENFORCEMENT=false
ALLOW_OAUTH_DEEP_LINK=false
```

### Standard (members-only, audit + rate limits)
```bash
GITHUB_ORGANIZATION="your-org"
RESTRICT_TO_MEMBERS=true
AUDIT_ALL_ACCESS=true
RATE_LIMIT_API_HOUR=1000
RATE_LIMIT_AUTH_HOUR=100
RATE_LIMIT_TOKEN_HOUR=50
GITHUB_SSO_ENFORCEMENT=true
ALLOW_OAUTH_DEEP_LINK=false
```

### Strict (SSO enforced, hosted metadata, OAuth-only)
```bash
GITHUB_ORGANIZATION="your-org"
RESTRICT_TO_MEMBERS=true
AUDIT_ALL_ACCESS=true
GITHUB_SSO_ENFORCEMENT=true
START_METADATA_SERVER=true
# Disable CLI by enterprise mode; prefer OAuth or GitHub App
GITHUB_OAUTH_ENABLED=true
ALLOW_OAUTH_DEEP_LINK=false
```

## Scope-to-Feature Matrix

| Scope | Feature Areas |
|-------|----------------|
| `repo` (or fine‑grained: Contents: Read, Metadata: Read, Pull requests: Read) | Code search, file fetch, repo structure, PR/commit search on private repos |
| `read:user` | Token validation, user identity, rate limit checks |
| `read:org` | Organization membership/teams validation for enterprise flows |

For public-only usage, `repo` may be omitted, but features against private repos require it.

## Docker Deployment Examples

Basic PAT run:
```bash
docker run -i --rm \
  -e GITHUB_TOKEN \
  octocode/octocode-mcp:latest
```

Enterprise with audit logs and OAuth callback (local_server):
```bash
docker run -i --rm \
  -e GITHUB_ORGANIZATION=your-org \
  -e AUDIT_ALL_ACCESS=true \
  -e GITHUB_OAUTH_CLIENT_ID=xxx \
  -e GITHUB_OAUTH_CLIENT_SECRET=yyy \
  -e GITHUB_OAUTH_SCOPES=repo,read:user,read:org \
  -e GITHUB_OAUTH_ENABLED=true \
  -e AUDIT_LOG_DIR=/data/logs/audit \
  -v $(pwd)/data:/data \
  -p 8765:8765 \
  octocode/octocode-mcp:latest
```

Notes:
- Map a persistent volume for logs/secrets if desired (`/data`).
- Expose `8765` only if using the local OAuth callback server from inside the container.

## Security Best Practices

- Prefer OAuth/GitHub App with automatic rotation for long-lived deployments
- Keep PAT scopes minimal; rotate periodically
- Never log tokens; avoid pasting tokens into chats or issue trackers
- Use HTTPS for OAuth callbacks and validate redirect URIs
- In enterprise, enable audit logging and rate limiting

## FAQ

- Which token source will be used?
  - The server picks in this order: OAuth → GitHub App → `GITHUB_TOKEN` → `GH_TOKEN` → CLI (non‑enterprise) → `Authorization` env.

- Why is my CLI token ignored?
  - Enterprise mode disables CLI token resolution for security. Use env vars or OAuth instead.

- Do fine‑grained PATs work?
  - Yes. Grant Contents: Read, Metadata: Read, Pull requests: Read. Match repo visibility requirements.

- Can I point to GHES?
  - Yes; set `GITHUB_HOST` and optional explicit OAuth endpoints.

# Bitbucket Setup Guide

> Complete guide for using Octocode MCP with Bitbucket Cloud — authentication, available tools, parameter mapping, and troubleshooting.

---

## Quick Start

```bash
# 1. Set your Bitbucket app password (or OAuth token)
export BITBUCKET_TOKEN="your-app-password-or-oauth-token"

# 2. (Optional) Set your Bitbucket username for Basic auth
export BITBUCKET_USERNAME="your-username"

# 3. Start Octocode MCP — Bitbucket mode activates automatically
npx octocode-mcp
```

When `BITBUCKET_TOKEN` (or `BB_TOKEN`) is detected and no GitLab token is set, Octocode switches to **Bitbucket mode** automatically. No other configuration is needed.

---

## Authentication

### Two Auth Modes

Bitbucket supports two authentication modes, selected automatically based on whether `BITBUCKET_USERNAME` is set:

| Mode | When | Header |
|------|------|--------|
| **Basic Auth** | `BITBUCKET_USERNAME` is set | `Basic base64(username:token)` |
| **Bearer Auth** | `BITBUCKET_USERNAME` is not set | `Bearer token` |

### Option 1: App Password + Username (Basic Auth — Recommended)

1. Go to **Personal Settings → App passwords** in Bitbucket:
   - [https://bitbucket.org/account/settings/app-passwords/](https://bitbucket.org/account/settings/app-passwords/)
2. Create an app password with these permissions:
   - **Repositories**: Read
   - **Pull requests**: Read
   - **Account**: Read (optional, for user info)
3. Set both the token and your Bitbucket username:

**A. Shell Environment:**

```bash
export BITBUCKET_TOKEN="your-app-password"
export BITBUCKET_USERNAME="your-username"
```

**B. MCP Client Configuration (Cursor / VS Code / Claude Desktop):**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "BITBUCKET_TOKEN": "your-app-password",
        "BITBUCKET_USERNAME": "your-username"
      }
    }
  }
}
```

### Option 2: OAuth Token (Bearer Auth)

If you have an OAuth 2.0 access token (e.g., from an OAuth consumer or Bitbucket Pipelines), set only the token:

```bash
export BITBUCKET_TOKEN="your-oauth-access-token"
```

### Token Priority

| Priority | Variable | Notes |
|----------|----------|-------|
| 1 (highest) | `BITBUCKET_TOKEN` | Primary Bitbucket token |
| 2 (fallback) | `BB_TOKEN` | Alternative (e.g., CI compatibility) |

Setting either token (when no GitLab token is set) activates **Bitbucket mode**.

> **Note:** Bitbucket Cloud (`api.bitbucket.org`) is the default. Self-hosted Bitbucket Server/Data Center uses a different API and is **not yet supported**.

---

## Available Tools

All tools use the `github*` prefix but work with Bitbucket when in Bitbucket mode:

| Tool | Bitbucket Support | Notes |
|------|------------------|-------|
| `githubSearchCode` | Full | Workspace-scoped (workspace + repo slug required) |
| `githubSearchRepositories` | Full | Search repos within a workspace |
| `githubSearchPullRequests` | Full | Maps to Bitbucket Pull Requests |
| `githubGetFileContent` | Full | Branch auto-detected if omitted |
| `githubViewRepoStructure` | Full | Browse repository file tree |
| `githubCloneRepo` | Not supported | Clone/directory fetch is GitHub only |
| `packageSearch` | N/A | Works independently (NPM/PyPI lookup) |

---

## Parameter Mapping

Bitbucket uses different terminology. Octocode translates automatically:

| Unified Parameter | GitHub | Bitbucket |
|-------------------|--------|-----------|
| `owner` | Organization / User | Workspace |
| `repo` | Repository | Repository slug |
| `owner/repo` | `owner/repo` | `workspace/repo_slug` |
| `branch` | Branch name | Branch name (or commit SHA) |
| `prNumber` | Pull Request # | Pull Request ID |
| `state: "open"` | Open PRs | `OPEN` PRs |
| `state: "closed"` | Closed PRs | `DECLINED` PRs |
| `merged=true` | Merged filter | `MERGED` PRs |

---

## Bitbucket-Specific Behavior

### Workspace-Scoped Code Search

Bitbucket code search is scoped to a **workspace**. You must provide `owner` (workspace):

```
githubSearchCode(owner="my-workspace", keywordsToSearch=["middleware"])
```

To scope to a specific repository, also provide `repo`:

```
githubSearchCode(owner="my-workspace", repo="my-repo", keywordsToSearch=["middleware"])
```

### Branch/Ref Auto-Detection

The default branch is auto-detected via the Bitbucket API. Providing `branch` explicitly avoids an extra API call:

```
githubGetFileContent(owner="workspace", repo="repo-slug", path="src/main.ts", branch="main")
```

### No Star Counts

Bitbucket does not expose star/watch counts in its API. Repository search results will show `stars: 0` for all Bitbucket repositories.

### Pull Request States

Bitbucket uses different PR state names:

| Unified State | Bitbucket State |
|---------------|-----------------|
| `open` | `OPEN` |
| `closed` | `DECLINED` |
| `merged` (filter) | `MERGED` |

---

## Known Limitations

1. **`githubCloneRepo`** — Clone/directory fetch is not available for Bitbucket.
2. **`githubGetFileContent` directory mode** — `type: "directory"` is GitHub only.
3. **Per-request provider switching** — Provider is set globally via environment variables, not per tool call.
4. **Bitbucket Server/Data Center** — Only Bitbucket Cloud (api.bitbucket.org) is supported.
5. **OAuth flow** — Only app passwords and manual OAuth tokens are supported (no interactive OAuth).

### Rate Limits

| Tier | Limit |
|------|-------|
| Bitbucket Cloud | 1000 requests/hour (per user) |

When rate-limited, Bitbucket returns `429 Too Many Requests`. Octocode surfaces this in error responses but does not auto-retry.

### Query Fields Not Yet Mapped

Some advanced query parameters from the unified interface are not yet mapped to Bitbucket:

- **Code search**: `extension`, `filename`, `match` (file vs path mode) — Bitbucket uses full-text search queries
- **Repo search**: `stars`, `size`, `created`, `updated` range filters
- **PR search**: `commenter`, `involves`, `mentions`, `review-requested`, `draft`, `withCommits`
- **File content**: Server-side `matchString` — client-side matching is used instead

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `BITBUCKET_TOKEN` | — | Bitbucket app password or OAuth token (primary) |
| `BB_TOKEN` | — | Bitbucket token (fallback) |
| `BITBUCKET_USERNAME` | — | Bitbucket username (enables Basic auth) |
| `BITBUCKET_HOST` | `https://api.bitbucket.org/2.0` | Bitbucket Cloud API endpoint |

For complete configuration options, see the [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md).

---

## Troubleshooting

### "Bitbucket token not found"

```
Error: Bitbucket token not found. Set BITBUCKET_TOKEN or BB_TOKEN environment variable.
```

**Fix:** Ensure the token is set in your MCP client config or shell environment:
```bash
echo $BITBUCKET_TOKEN   # Should print your token
```

### 401 Unauthorized

- Verify your app password is valid.
- If using Basic auth, ensure `BITBUCKET_USERNAME` matches your Bitbucket username.
- Check that the app password hasn't been revoked.

### 403 Forbidden

- Your token may lack the required permissions. Create a new app password with `Repositories: Read` and `Pull requests: Read`.
- Check workspace/repository access — private repos require proper permissions.

### 404 Not Found

- Verify `owner/repo` maps correctly to the Bitbucket workspace/repo_slug.
- Check repository visibility — private repositories require proper token permissions.
- Ensure the workspace name is correct (case-sensitive).

### 429 Too Many Requests

- You've hit the rate limit. Wait before retrying.
- Reduce query concurrency.

### Empty Code Search Results

- Bitbucket code search requires workspace scope. Always provide `owner` (workspace).
- Try simpler or broader keywords.
- Ensure the repository has been indexed by Bitbucket's search engine.

### GitLab Token Overriding Bitbucket

If you have both `GITLAB_TOKEN` and `BITBUCKET_TOKEN` set, GitLab takes priority. Remove the GitLab token to use Bitbucket:

```bash
unset GITLAB_TOKEN
unset GL_TOKEN
```

---

## See Also

- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) — Overview of all provider authentication
- [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) — Full tool documentation
- [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) — All configuration options
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) — General troubleshooting guide

---
Created by Octocode MCP https://octocode.ai

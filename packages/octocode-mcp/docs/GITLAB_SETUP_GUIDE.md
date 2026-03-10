# GitLab Setup Guide

> Complete guide for using Octocode MCP with GitLab — authentication, self-hosted instances, available tools, tier limitations, and troubleshooting.

---

## Quick Start

```bash
# 1. Set your GitLab token
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"

# 2. (Optional) For self-hosted GitLab
export GITLAB_HOST="https://gitlab.your-company.com"

# 3. Start Octocode MCP — GitLab mode activates automatically
npx octocode-mcp
```

When `GITLAB_TOKEN` (or `GL_TOKEN`) is detected, Octocode switches to **GitLab mode** automatically. No other configuration is needed.

---

## Authentication

### Token Creation

1. Go to **Settings → Access Tokens** in your GitLab instance:
   - gitlab.com: [https://gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
   - Self-hosted: `https://<your-host>/-/user_settings/personal_access_tokens`
2. Create a token with **`api`** scope (required for full functionality).
3. Recommended: set an expiration date and descriptive name (e.g., `octocode-mcp`).

### Setting the Token

**A. Shell Environment:**

```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
```

**B. MCP Client Configuration (Cursor / VS Code / Claude Desktop):**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_HOST": "https://gitlab.com"
      }
    }
  }
}
```

### Token Priority

| Priority | Variable | Notes |
|----------|----------|-------|
| 1 (highest) | `GITLAB_TOKEN` | Primary GitLab token |
| 2 (fallback) | `GL_TOKEN` | Alternative (e.g., GitLab CI compatibility) |

Setting either token activates **GitLab mode** — Octocode will use GitLab APIs instead of GitHub.

### Self-Hosted GitLab

Set `GITLAB_HOST` to your instance URL:

```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
export GITLAB_HOST="https://gitlab.your-company.com"
```

The default is `https://gitlab.com` if `GITLAB_HOST` is not set.

> **Note:** The GitLab client reads `GITLAB_HOST` from environment variables. Use the env var for reliability.

---

## Available Tools

All tools use the `github*` prefix but work with GitLab when in GitLab mode:

| Tool | GitLab Support | Notes |
|------|---------------|-------|
| `githubSearchCode` | Full | Scoped to project (group + project required) |
| `githubSearchRepositories` | Full | Search projects by keyword/topic |
| `githubSearchPullRequests` | Full | Maps to Merge Requests (MR IID) |
| `githubGetFileContent` | Full | `branch` (ref) recommended to avoid extra API call |
| `githubViewRepoStructure` | Full | Browse project file tree |
| `githubCloneRepo` | Not supported | Clone/directory fetch is GitHub only |
| `packageSearch` | N/A | Works independently (NPM/PyPI lookup) |

---

## Parameter Mapping

GitLab uses different terminology. Octocode translates automatically:

| Unified Parameter | GitHub | GitLab |
|-------------------|--------|--------|
| `owner` | Organization / User | Group / Namespace |
| `repo` | Repository | Project name |
| `owner/repo` | `owner/repo` | `group/project` (or numeric Project ID) |
| `branch` | Branch name | Ref (branch, tag, or commit SHA) |
| `prNumber` | Pull Request # | Merge Request IID |
| `state: "open"` | Open PRs | `opened` MRs |
| `state: "closed"` | Closed PRs | `closed` MRs |
| `state: "merged"` | N/A (closed + merged) | `merged` MRs |

---

## GitLab-Specific Behavior

### Project-Scoped Code Search

GitLab code search requires project scope. Always provide both `owner` and `repo`:

```
githubSearchCode(owner="my-group", repo="my-project", keywordsToSearch=["middleware"])
```

### Branch/Ref is Recommended

While the default branch is auto-detected, providing `branch` explicitly avoids an extra API call:

```
githubGetFileContent(owner="group", repo="project", path="src/main.ts", branch="main")
```

### Merge Request States

GitLab supports an additional `merged` state that GitHub doesn't have. Use `state: "merged"` to find only merged MRs.

---

## Tier Limitations

Some features depend on your GitLab tier:

| Feature | Free | Premium | Ultimate |
|---------|------|---------|----------|
| Project code search | Limited | Full | Full |
| Global code search | Not available | Available | Available |
| Advanced search (Elasticsearch) | Not available | Available | Available |
| Group-level search | Limited | Full | Full |

If code search returns empty results on a Free tier, try scoping to a specific project.

---

## Known Limitations

1. **`githubCloneRepo`** — Clone/directory fetch is not available for GitLab.
2. **`githubGetFileContent` directory mode** — `type: "directory"` is GitHub only.
3. **Per-request provider switching** — Provider is set globally via environment variables, not per tool call.
4. **OAuth flow** — Only personal access tokens are supported (no interactive OAuth).

### Rate Limits

| Instance | Default Limit |
|----------|--------------|
| gitlab.com (Free) | 300 requests/minute (unauthenticated), 2000/minute (authenticated) |
| gitlab.com (Premium) | Higher limits |
| Self-hosted | Configured by admin (`/admin/application_settings`) |

When rate-limited, GitLab returns `429 Too Many Requests` with a `Retry-After` header. Octocode surfaces this in error responses but does not auto-retry.

### Query Fields Not Yet Mapped

Some advanced query parameters from the unified interface are not yet mapped to GitLab:

- **Code search**: `match` (file vs path mode)
- **Repo search**: `stars`, `size`, `created`, `updated` filters
- **MR search**: `commenter`, `involves`, `mentions`, `reviewRequested`, `draft`, `withCommits`
- **File content**: `charOffset`, `charLength`, `fullContent`, `matchStringContextLines`

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GITLAB_TOKEN` | — | GitLab personal access token (primary) |
| `GL_TOKEN` | — | GitLab token (fallback) |
| `GITLAB_HOST` | `https://gitlab.com` | GitLab instance URL |

For complete configuration options, see the [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md).

---

## Troubleshooting

### "GitLab token not found"

```
Error: GitLab token not found. Set GITLAB_TOKEN or GL_TOKEN environment variable
```

**Fix:** Ensure the token is set in your MCP client config or shell environment:
```bash
echo $GITLAB_TOKEN   # Should print your token
```

### 401 Unauthorized

- Verify your token is valid: `curl -H "PRIVATE-TOKEN: $GITLAB_TOKEN" https://gitlab.com/api/v4/user`
- Check the token hasn't expired.
- Ensure the `api` scope is granted.

### 403 Forbidden

- Your token may lack the required scope. Create a new token with `api` scope.
- For self-hosted: check if your account has access to the project/group.

### 404 Not Found

- Verify `owner/repo` maps correctly to the GitLab namespace/project.
- Check project visibility — private projects require proper token scope.
- For subgroups, use the full path: `owner="parent-group/sub-group"`, `repo="project"`.

### 429 Too Many Requests

- You've hit the rate limit. Wait for the `Retry-After` period.
- For self-hosted instances, contact your GitLab admin about rate limit settings.

### Empty Search Results

- **Free tier**: Global/group code search may not be available. Scope to a specific project.
- **Advanced search**: Requires Elasticsearch, typically Premium+.
- Try simpler keywords — GitLab search is less flexible than GitHub's.

### Self-Hosted Connection Issues

- Verify `GITLAB_HOST` includes the protocol: `https://gitlab.example.com` (not just `gitlab.example.com`).
- Check if your GitLab instance requires VPN or has IP allowlists.
- Test connectivity: `curl -I $GITLAB_HOST/api/v4/version`

---

## See Also

- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) — Overview of all provider authentication
- [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) — Full tool documentation
- [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) — All configuration options
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) — General troubleshooting guide

---
Created by Octocode MCP https://octocode.ai

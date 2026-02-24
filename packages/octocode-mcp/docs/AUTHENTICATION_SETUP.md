# Authentication Setup

> How to authenticate Octocode MCP with GitHub, GitLab, or Bitbucket.

## Overview

Octocode MCP needs a token to access code repositories. You can authenticate with **GitHub**, **GitLab**, or **Bitbucket** (one provider active at a time).

### Provider Priority

When multiple provider tokens are set, Octocode selects the active provider in this order:

```
GitLab (highest) → Bitbucket → GitHub (default)
```

- If `GITLAB_TOKEN` is set → **GitLab** is active (regardless of other tokens).
- If `BITBUCKET_TOKEN` is set (and no GitLab token) → **Bitbucket** is active.
- Otherwise → **GitHub** is the default.

To switch providers, change which token environment variables are set and restart the MCP server.

---

## Provider Setup Guides

Each provider has a dedicated setup guide with authentication methods, configuration, available tools, and troubleshooting:

| Provider | Guide | Quick Auth |
|----------|-------|------------|
| **GitHub** | [GitHub Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_SETUP_GUIDE.md) | `npx octocode-cli` or set `GITHUB_TOKEN` |
| **GitLab** | [GitLab Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITLAB_SETUP_GUIDE.md) | Set `GITLAB_TOKEN` (+ `GITLAB_HOST` for self-hosted) |
| **Bitbucket** | [Bitbucket Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/BITBUCKET_SETUP_GUIDE.md) | Set `BITBUCKET_TOKEN` (+ `BITBUCKET_USERNAME` for app passwords) |

---

## Token Summary

### GitHub

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `OCTOCODE_TOKEN` | Octocode-specific token |
| 2 | `GH_TOKEN` | GitHub CLI compatible |
| 3 | `GITHUB_TOKEN` | GitHub Actions compatible |
| 4 | `~/.octocode/credentials.json` | Stored by `npx octocode-cli` |
| 5 | `gh auth token` | GitHub CLI fallback |

### GitLab

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `GITLAB_TOKEN` | Primary GitLab token |
| 2 | `GL_TOKEN` | CI/CD fallback |

### Bitbucket

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `BITBUCKET_TOKEN` | App password or OAuth token |
| 2 | `BB_TOKEN` | CI/CD fallback |

> **Important:** Auth tokens are **environment-variable only** — never store tokens in `.octocoderc` or commit them to version control.

---

## Quick Examples

### GitHub (simplest)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

### GitLab (self-hosted)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxx",
        "GITLAB_HOST": "https://gitlab.mycompany.com"
      }
    }
  }
}
```

### Bitbucket (app password)

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

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No GitHub token found" | Run `npx octocode-cli` or set `GITHUB_TOKEN` / `GH_TOKEN` |
| "GitLab token not found" | Set `GITLAB_TOKEN` or `GL_TOKEN` in MCP `"env"` block |
| "Bitbucket token not found" | Set `BITBUCKET_TOKEN` or `BB_TOKEN` in MCP `"env"` block |
| Token expired | Re-run `npx octocode-cli` or regenerate your token |
| Wrong provider active | Check which tokens are set — GitLab takes priority over Bitbucket over GitHub |
| Bitbucket ignored when GitLab set | Remove `GITLAB_TOKEN` and `GL_TOKEN` to activate Bitbucket |

For provider-specific troubleshooting, see the individual setup guides linked above.

---

## See Also

- [GitHub Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_SETUP_GUIDE.md) — GitHub auth, Enterprise, clone tools
- [GitLab Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITLAB_SETUP_GUIDE.md) — GitLab auth, self-hosted, tier limits
- [Bitbucket Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/BITBUCKET_SETUP_GUIDE.md) — Bitbucket auth, app passwords, OAuth
- [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md) — All env vars and `.octocoderc` options
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) — Node.js, npm, and MCP connection issues

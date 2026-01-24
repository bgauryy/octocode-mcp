# Octocode Configuration Reference

Configure Octocode to work with your GitHub/GitLab accounts, enable local code analysis, and customize tool behavior.

---

## Quick Start

Most users only need to set an authentication token:

```bash
# GitHub (choose one)
export GITHUB_TOKEN="ghp_your_token_here"
# or
export GH_TOKEN="ghp_your_token_here"

# GitLab (if using GitLab)
export GITLAB_TOKEN="glpat_your_token_here"
```

For persistent configuration, create `~/.octocode/.octocoderc`:

```jsonc
{
  "version": 1,
  "github": {
    "defaultOrg": "your-org"  // Skip typing org name in searches
  },
  "local": {
    "enabled": true  // Enable local code analysis
  }
}
```

---

## Configuration by Use Case

### Connect to GitHub

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `OCTOCODE_TOKEN` | GitHub token (highest priority) |
| `GH_TOKEN` | GitHub CLI compatible token |
| `GITHUB_TOKEN` | Standard GitHub token |
| `GITHUB_API_URL` | API URL for GitHub Enterprise (default: `https://api.github.com`) |

**Config File:**

```jsonc
{
  "github": {
    "apiUrl": "https://github.mycompany.com/api/v3",  // For GHE
    "defaultOrg": "my-org"  // Default organization for searches
  }
}
```

### Connect to GitLab

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `GITLAB_TOKEN` | GitLab Personal Access Token |
| `GL_TOKEN` | GitLab token (fallback) |
| `GITLAB_HOST` | GitLab instance URL (default: `https://gitlab.com`) |

**Config File:**

```jsonc
{
  "gitlab": {
    "host": "https://gitlab.mycompany.com",
    "defaultGroup": "my-group"
  },
  "research": {
    "defaultProvider": "gitlab"  // Use GitLab as default instead of GitHub
  }
}
```

### Enable Local Code Analysis

Analyze code on your local filesystem with LSP-powered features.

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `ENABLE_LOCAL` or `LOCAL` | Set to `true` to enable local tools |
| `ALLOWED_PATHS` | Comma-separated allowed paths (e.g., `/home/me/projects,/tmp/code`) |
| `WORKSPACE_ROOT` | Override workspace root detection |

**Config File:**

```jsonc
{
  "local": {
    "enabled": true,
    "allowedPaths": ["/Users/me/projects", "/tmp/sandbox"],  // Restrict access
    "excludePaths": ["vendor", "build"]  // Additional folders to skip
  }
}
```

> **Default excludes:** `node_modules`, `.git`, `dist`, `coverage`, `__pycache__`, `.venv`, `venv`

### Control Which Tools Are Available

Enable only specific tools or disable unwanted ones.

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `TOOLS_TO_RUN` | Whitelist: only run these tools (comma-separated) |
| `ENABLE_TOOLS` | Enable specific tools |
| `DISABLE_TOOLS` | Disable specific tools |

**Config File:**

```jsonc
{
  "tools": {
    // Whitelist mode: only these tools are available
    "enabled": ["githubSearchCode", "githubGetFileContent"],

    // OR blacklist mode: hide specific tools
    "disabled": ["githubSearchPullRequests"]
  }
}
```

### Tune Network Performance

Adjust timeouts and retries for slow networks or large requests.

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUEST_TIMEOUT` | `30000` | Request timeout in ms (min 5000, max 300000) |
| `MAX_RETRIES` | `3` | Retry attempts for failed requests (0-10) |

**Config File:**

```jsonc
{
  "network": {
    "timeout": 60000,   // 60 seconds
    "maxRetries": 5
  }
}
```

### Configure LSP (Language Server Protocol)

Customize language server behavior for local code analysis.

**Config File:**

```jsonc
{
  "lsp": {
    "enabled": true,
    "timeout": 15000,  // LSP request timeout (1000-60000 ms)
    "languages": {
      "python": {
        "serverPath": "/usr/local/bin/pylsp"  // Custom server path
      },
      "typescript": {
        "serverPath": null  // Use bundled server
      }
    }
  }
}
```

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `OCTOCODE_LSP_CONFIG` | Path to custom LSP servers config file |
| `ENABLE_LSP_TOOL` | Set to `1` when native Claude Code LSP is available |
| `OCTOCODE_FORCE_LSP` | Set to `1` to force Octocode LSP even if native is available |

### Research Settings

Control how code searches are executed.

**Config File:**

```jsonc
{
  "research": {
    "defaultProvider": "github",  // or "gitlab"
    "maxQueriesPerBatch": 3,      // Parallel queries (1-10)
    "maxResultsPerQuery": 10      // Results per query (1-100)
  }
}
```

---

## Privacy & Telemetry

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `OCTOCODE_TELEMETRY_DISABLED` | Set to `1` or `true` to disable telemetry |
| `LOG` | Set to `false` to disable session logging |
| `REDACT_ERROR_PATHS` | Set to `true` to redact file paths in error messages |

**Config File:**

```jsonc
{
  "telemetry": {
    "enabled": false,   // Disable anonymous usage stats
    "logging": false    // Disable debug logging
  }
}
```

---

## Full Example Configuration

```jsonc
{
  "version": 1,

  "github": {
    "apiUrl": "https://api.github.com",
    "defaultOrg": "my-company"
  },

  "gitlab": {
    "host": "https://gitlab.com",
    "defaultGroup": "my-group"
  },

  "local": {
    "enabled": true,
    "allowedPaths": ["/Users/me/projects"],
    "excludePaths": ["node_modules", "dist", "vendor"]
  },

  "tools": {
    "disabled": ["githubSearchPullRequests"]
  },

  "network": {
    "timeout": 30000,
    "maxRetries": 3
  },

  "lsp": {
    "enabled": true,
    "timeout": 10000
  },

  "research": {
    "defaultProvider": "github",
    "maxQueriesPerBatch": 3,
    "maxResultsPerQuery": 10
  },

  "telemetry": {
    "enabled": true,
    "logging": true
  }
}
```

---

## Configuration Hierarchy

Settings are resolved in this order (highest priority first):

1. **Environment Variables** — Override all other settings
2. **Config File** — `~/.octocode/.octocoderc` (JSON5 format with comments)
3. **Defaults** — Built-in fallback values

---

## Config File Location

| OS | Path |
|----|------|
| macOS/Linux | `~/.octocode/.octocoderc` |
| Windows | `%USERPROFILE%\.octocode\.octocoderc` |

The config file uses **JSON5** format, which supports:
- Comments: `//` and `/* */`
- Trailing commas
- Unquoted keys

---

## Defaults Reference

| Setting | Default |
|---------|---------|
| `github.apiUrl` | `https://api.github.com` |
| `gitlab.host` | `https://gitlab.com` |
| `local.enabled` | `true` |
| `local.allowedPaths` | `[]` (all paths allowed) |
| `local.excludePaths` | `['node_modules', '.git', 'dist', 'coverage', '__pycache__', '.venv', 'venv']` |
| `tools.enabled` | `null` (all tools available) |
| `tools.disabled` | `null` (no tools disabled) |
| `network.timeout` | `30000` (30s) |
| `network.maxRetries` | `3` |
| `lsp.enabled` | `true` |
| `lsp.timeout` | `10000` (10s) |
| `research.defaultProvider` | `'github'` |
| `research.maxQueriesPerBatch` | `3` |
| `research.maxResultsPerQuery` | `10` |
| `telemetry.enabled` | `true` |
| `telemetry.logging` | `true` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Token not found** | Set `GITHUB_TOKEN` or `GH_TOKEN`. Or run `gh auth login` for GitHub CLI. |
| **Local tools disabled** | Set `ENABLE_LOCAL=true` or add `"local": { "enabled": true }` to config |
| **GitLab not working** | Set `GITLAB_TOKEN`. For self-hosted, also set `GITLAB_HOST`. |
| **Timeout errors** | Increase `REQUEST_TIMEOUT` env var or `network.timeout` in config (max 300000ms) |
| **Tool not available** | Check it's not in `tools.disabled`. If using whitelist, add to `tools.enabled`. |
| **Config not loading** | Check JSON syntax. JSON5 allows comments but not other syntax errors. |

### Debug Commands

```bash
# Check if config exists
cat ~/.octocode/.octocoderc

# Verify environment
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:+set}"
echo "ENABLE_LOCAL: ${ENABLE_LOCAL:-not set}"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:+set}"
```

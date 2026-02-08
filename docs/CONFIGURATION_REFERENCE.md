# Octocode MCP — Configuration Reference

Complete reference for all Octocode configuration options.

**Two ways to configure:**
1. **Environment variables** — per-session, highest priority
2. **Global config file** (`.octocoderc`) — persistent defaults

| Platform | Config Path |
|----------|-------------|
| macOS / Linux | `~/.octocode/.octocoderc` |
| Windows | `%USERPROFILE%\.octocode\.octocoderc` |

> For `.octocoderc` setup and examples, see [Global Config](./GLOBAL_CONFIG.md).

---

## Resolution Priority

```
Environment Variable → .octocoderc File → Hardcoded Default
     (wins)              (fallback)           (last resort)
```

---

## Authentication

### GitHub Tokens

| Env Variable | Description |
|---|---|
| `OCTOCODE_TOKEN` | GitHub token (highest priority) |
| `GH_TOKEN` | GitHub CLI compatible token |
| `GITHUB_TOKEN` | GitHub Actions token (lowest priority) |

**Resolution order:** `OCTOCODE_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > `~/.octocode/credentials.json` > `gh auth token`

### GitLab Tokens

| Env Variable | Description |
|---|---|
| `GITLAB_TOKEN` | GitLab personal access token (primary) |
| `GL_TOKEN` | GitLab token (fallback) |

> Setting `GITLAB_TOKEN` or `GL_TOKEN` activates GitLab as the provider instead of GitHub.

**Note:** Auth tokens have no `.octocoderc` equivalent — secrets should not be stored in config files.

---

## All Configuration Options

### GitHub

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| API URL | `GITHUB_API_URL` | `github.apiUrl` | `https://api.github.com` |

### GitLab

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| Host URL | `GITLAB_HOST` | `gitlab.host` | `https://gitlab.com` |

### Local Filesystem

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| Enable local tools | `ENABLE_LOCAL` | `local.enabled` | `true` |
| Workspace root | `WORKSPACE_ROOT` | `local.workspaceRoot` | Current working directory (runtime fallback) |
| Allowed paths | `ALLOWED_PATHS` | `local.allowedPaths` | `[]` (all paths) |

> Note: If `local.workspaceRoot` is not set, runtime components fall back to the current working directory (and some tools also honor `WORKSPACE_ROOT` directly).

### Tools

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| Tool whitelist | `TOOLS_TO_RUN` | `tools.enabled` | `null` (all tools) |
| Additional tools | `ENABLE_TOOLS` | `tools.enableAdditional` | `null` |
| Disabled tools | `DISABLE_TOOLS` | `tools.disabled` | `null` |
| Disable prompts | `DISABLE_PROMPTS` | `tools.disablePrompts` | `false` |

**Tool filtering priority:**
1. `enabled`/`TOOLS_TO_RUN` — strict whitelist (ignores other settings)
2. `disabled`/`DISABLE_TOOLS` — removes from available set
3. `enableAdditional`/`ENABLE_TOOLS` — adds to default set

> **Warning:** `TOOLS_TO_RUN` cannot be combined with `ENABLE_TOOLS`/`DISABLE_TOOLS`.

### Network

| Option | Env Variable | `.octocoderc` Field | Default | Range |
|---|---|---|---|---|
| Request timeout (ms) | `REQUEST_TIMEOUT` | `network.timeout` | `30000` | 5000–300000 |
| Max retries | `MAX_RETRIES` | `network.maxRetries` | `3` | 0–10 |

### Telemetry

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| Logging | `LOG` | `telemetry.logging` | `true` |

### LSP (Language Server)

| Option | Env Variable | `.octocoderc` Field | Default |
|---|---|---|---|
| Config file path | `OCTOCODE_LSP_CONFIG` | `lsp.configPath` | — |

> Optional. Set only if you want a custom LSP server config file path. If unset, Octocode falls back to workspace and home `.octocode/lsp-servers.json`.


> Note: Paths in errors are always redacted for security; there is no configuration toggle.

## MCP Client Examples

### Claude Desktop / Cursor — Basic

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

### GitHub Enterprise

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "GITHUB_API_URL": "https://github.mycompany.com/api/v3"
      }
    }
  }
}
```

### GitLab

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

### Local Tools Disabled

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "false"
      }
    }
  }
}
```

### Tool Whitelist

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent,githubViewRepoStructure"
      }
    }
  }
}
```

### Network Tuning

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "REQUEST_TIMEOUT": "60000",
        "MAX_RETRIES": "5"
      }
    }
  }
}
```

### Production (No Logging)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "LOG": "false"
      }
    }
  }
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token not found | Set `GITHUB_TOKEN` or `GH_TOKEN` in env |
| Local tools disabled | Set `ENABLE_LOCAL=true` |
| GitLab not working | Set `GITLAB_TOKEN` and `GITLAB_HOST` for self-hosted |
| Timeout errors | Increase `REQUEST_TIMEOUT` (max 300000) |
| Tool not available | Check `TOOLS_TO_RUN` whitelist or `DISABLE_TOOLS` blacklist |

### Verify Environment

```bash
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:+set}"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:+set}"
echo "ENABLE_LOCAL: ${ENABLE_LOCAL:-not set}"
echo "LOG: ${LOG:-not set}"
```

---

## See Also

- [Global Config](./GLOBAL_CONFIG.md) — `.octocoderc` file setup and examples
- [Troubleshooting](./TROUBLESHOOTING.md) — Common issues and solutions

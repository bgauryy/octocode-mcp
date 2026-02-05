# Octocode Configuration Reference

All configuration is done via environment variables in your MCP client settings.

---

## Authentication

### GitHub

| Variable | Description |
|----------|-------------|
| `OCTOCODE_TOKEN` | GitHub token (highest priority) |
| `GH_TOKEN` | GitHub CLI compatible token |
| `GITHUB_TOKEN` | GitHub Actions token (lowest priority) |
| `GITHUB_API_URL` | GitHub Enterprise URL (default: `https://api.github.com`) |

**Token Resolution Order:** `OCTOCODE_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN` → `~/.octocode/credentials.json` → `gh auth token`

### GitLab

| Variable | Description |
|----------|-------------|
| `GITLAB_TOKEN` | GitLab personal access token (primary) |
| `GL_TOKEN` | GitLab token (fallback) |
| `GITLAB_HOST` | GitLab instance URL (default: `https://gitlab.com`) |

> Setting `GITLAB_TOKEN` or `GL_TOKEN` makes GitLab the active provider instead of GitHub.

---

## Local Code Analysis

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_LOCAL` | `true` | Enable local filesystem tools |
| `WORKSPACE_ROOT` | Current directory | Root directory for path validation |
| `ALLOWED_PATHS` | All paths | Comma-separated allowed directories |

---

## Tools

| Variable | Description |
|----------|-------------|
| `TOOLS_TO_RUN` | Whitelist: only these tools are available (comma-separated). Takes full precedence over other filters. |
| `ENABLE_TOOLS` | Enable specific tools in addition to defaults (comma-separated). Ignored if `TOOLS_TO_RUN` is set. |
| `DISABLE_TOOLS` | Blacklist: hide these tools (comma-separated). Takes precedence over `ENABLE_TOOLS`. |
| `DISABLE_PROMPTS` | Set `true` to disable MCP prompts/slash commands |

**Tool Filtering Priority:**
1. `TOOLS_TO_RUN` — strict whitelist (only listed tools, ignores everything else)
2. `DISABLE_TOOLS` — removes tools from available set
3. `ENABLE_TOOLS` — adds tools to default set

> **Warning**: `TOOLS_TO_RUN` cannot be used together with `ENABLE_TOOLS`/`DISABLE_TOOLS`. If set, `TOOLS_TO_RUN` is used exclusively.

---

## Network

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `REQUEST_TIMEOUT` | `30000` | 5000-300000 | Request timeout in milliseconds |
| `MAX_RETRIES` | `3` | 0-10 | Retry attempts for failed requests |

---

## LSP (Language Server)

| Variable | Description |
|----------|-------------|
| `OCTOCODE_LSP_CONFIG` | Path to custom LSP servers config file |
| `OCTOCODE_FORCE_LSP` | Set `1` to force octocode-mcp LSP tools in Claude Code (overrides native LSP) |

---

## Telemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG` | `true` | Enable anonymous telemetry |

---

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `REDACT_ERROR_PATHS` | `false` | Set `true` to redact filesystem paths in error messages |

> **Production Tip**: Enable `REDACT_ERROR_PATHS=true` to hide workspace structure in error messages.

---

## MCP Configuration Examples

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "SOME_TOKEN"
      }
    }
  }
}
```

### With GitLab

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "SOME_TOKEN",
        "GITLAB_HOST": "https://gitlab.mycompany.com"
      }
    }
  }
}
```

### With Local Tools Disabled

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "SOME_TOKEN",
        "ENABLE_LOCAL": "false"
      }
    }
  }
}
```

### With Tool Filtering

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "SOME_TOKEN",
        "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent",
        "DISABLE_PROMPTS": "true"
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
        "GITHUB_TOKEN": "SOME_TOKEN",
        "GITHUB_API_URL": "https://github.mycompany.com/api/v3"
      }
    }
  }
}
```

### With Network Tuning

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "SOME_TOKEN",
        "REQUEST_TIMEOUT": "60000",
        "MAX_RETRIES": "5"
      }
    }
  }
}
```

### With Telemetry Disabled

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "SOME_TOKEN",
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
| GitLab not working | Set `GITLAB_TOKEN`, and `GITLAB_HOST` for self-hosted |
| Timeout errors | Increase `REQUEST_TIMEOUT` (max 300000) |
| Tool not available | Check `TOOLS_TO_RUN` whitelist or `DISABLE_TOOLS` blacklist |

### Verify Environment

```bash
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:+set}"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:+set}"
echo "ENABLE_LOCAL: ${ENABLE_LOCAL:-not set}"
echo "LOG: ${LOG:-not set}"
```

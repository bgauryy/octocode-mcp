# Octocode — Configuration

## How Configuration Works

Every setting can be configured in two ways:

| Method | Best for | Priority |
|--------|----------|----------|
| **Environment variables** | Per-session, CI/CD, MCP client config | Highest (wins) |
| **Config file** (`.octocoderc`) | Machine-wide persistent defaults | Fallback |

If neither is set, the built-in default is used:

```
Environment Variable  →  .octocoderc File  →  Default
     (wins)                (fallback)        (last resort)
```

---

## All Configuration Options

| Section | Option | Env Variable | `.octocoderc` Field | Type | Default |
|---------|--------|-------------|---------------------|------|---------|
| **GitHub** | API URL | `GITHUB_API_URL` | `github.apiUrl` | string | `https://api.github.com` |
| **GitLab** | Host URL | `GITLAB_HOST` | `gitlab.host` | string | `https://gitlab.com` |
| **Local** | Enable local tools | `ENABLE_LOCAL` | `local.enabled` | boolean | `true` |
| **Local** | Workspace root | `WORKSPACE_ROOT` | `local.workspaceRoot` | string | Current working directory |
| **Local** | Allowed paths | `ALLOWED_PATHS` | `local.allowedPaths` | list | `[]` (all paths) |
| **Tools** | Tool whitelist | `TOOLS_TO_RUN` | `tools.enabled` | list | All tools |
| **Tools** | Additional tools | `ENABLE_TOOLS` | `tools.enableAdditional` | list | — |
| **Tools** | Disabled tools | `DISABLE_TOOLS` | `tools.disabled` | list | — |
| **Tools** | Disable prompts | `DISABLE_PROMPTS` | `tools.disablePrompts` | boolean | `false` |
| **Network** | Request timeout (ms) | `REQUEST_TIMEOUT` | `network.timeout` | number | `30000` (5,000–300,000) |
| **Network** | Max retries | `MAX_RETRIES` | `network.maxRetries` | number | `3` (0–10) |
| **Telemetry** | Logging  | `LOG` | `telemetry.logging` | logging | `true` |
| **LSP** | Config file path | `OCTOCODE_LSP_CONFIG` | `lsp.configPath` | string | — |

### Authentication (env only — no config file equivalent)

| Env Variable | Description | Priority |
|---|---|---|
| `OCTOCODE_TOKEN` | Octocode-specific GitHub token | 1 (highest) |
| `GH_TOKEN` | GitHub CLI compatible token | 2 |
| `GITHUB_TOKEN` | GitHub Actions token | 3 |
| `GITLAB_TOKEN` | GitLab personal access token | — |
| `GL_TOKEN` | GitLab token (fallback) | — |

If no GitHub env token is set, Octocode falls back to `~/.octocode/credentials.json`, then `gh auth token`.
Setting `GITLAB_TOKEN` or `GL_TOKEN` activates GitLab mode instead of GitHub.

Auth tokens should not be stored in `.octocoderc`.

### Notes

- **Tool filtering:** `TOOLS_TO_RUN` is a strict whitelist (ignores `ENABLE_TOOLS`/`DISABLE_TOOLS`). When not set, `DISABLE_TOOLS` removes tools and `ENABLE_TOOLS` adds tools.
- **Network values** outside the range are clamped, not rejected.
- **Logging:** `LOG` controls whether tool calls and errors are sent to the telemetry endpoint. Session init (with session ID) is **always** logged regardless of the `LOG` setting.
- **LSP** is optional. If unset, Octocode uses `.octocode/lsp-servers.json` in the workspace or home directory. LSP tools require local tools to be enabled.

---

## Types

How environment variable values are parsed:

| Type | Accepted values | Unrecognized values |
|------|----------------|---------------------|
| **boolean** | `true`, `1` = on; `false`, `0` = off | Ignored (default used) |
| **logging** | `false`, `0` = off; everything else = on | Treated as on |
| **number** | Integer, clamped to valid range | Ignored (default used) |
| **list** | Comma-separated (e.g., `a,b,c`) | — |
| **string** | Any value | — |

All values are case-insensitive and leading/trailing whitespace is trimmed.

---

## The `.octocoderc` Config File

A JSON file for persistent machine-wide defaults. Supports comments and trailing commas.

### File Location

| Platform | Path |
|----------|------|
| macOS / Linux | `~/.octocode/.octocoderc` |
| Windows | `%USERPROFILE%\.octocode\.octocoderc` |

### Quick Setup

**macOS / Linux:**

```bash
mkdir -p ~/.octocode
cat > ~/.octocode/.octocoderc << 'EOF'
{
  "github": {
    "apiUrl": "https://api.github.com"
  }
}
EOF
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.octocode"
@'
{
  "github": {
    "apiUrl": "https://api.github.com"
  }
}
'@ | Out-File -Encoding utf8 "$env:USERPROFILE\.octocode\.octocoderc"
```

### Complete Schema

```jsonc
{
  "version": 1,

  "github": {
    "apiUrl": "https://api.github.com"
  },

  "gitlab": {
    "host": "https://gitlab.com"
  },

  "local": {
    "enabled": true,
    "workspaceRoot": "/path/to/workspace",
    "allowedPaths": []
  },

  "tools": {
    "enabled": null,            // null = all tools
    "enableAdditional": null,
    "disabled": null,
    "disablePrompts": false
  },

  "network": {
    "timeout": 30000,           // 5000–300000
    "maxRetries": 3             // 0–10
  },

  "telemetry": {
    "logging": true
  },

  "lsp": {
    "configPath": null          // optional
  }
}
```

### Validation

The file is validated on load. Invalid values don't prevent startup — defaults are used instead.

- URLs must start with `http://` or `https://`
- Numbers are clamped to their valid range
- Unknown keys are ignored (with a warning)
- Parse errors skip the entire file (with a warning)

---

## Examples

### MCP Client — Basic

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

### MCP Client — GitHub Enterprise

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

### MCP Client — GitLab

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

### MCP Client — Custom Setup

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "false",
        "REQUEST_TIMEOUT": "60000",
        "MAX_RETRIES": "5",
        "LOG": "false"
      }
    }
  }
}
```

### `.octocoderc` — GitHub Enterprise

```jsonc
{
  "github": {
    "apiUrl": "https://github.mycompany.com/api/v3"
  }
}
```

### `.octocoderc` — Restricted Workspace

```jsonc
{
  "local": {
    "workspaceRoot": "/Users/me/projects/main",
    "allowedPaths": ["/Users/me/projects"]
  }
}
```

### `.octocoderc` — Only GitHub Tools

```jsonc
{
  "tools": {
    "enabled": [
      "githubSearchCode",
      "githubGetFileContent",
      "githubViewRepoStructure"
    ]
  }
}
```

### `.octocoderc` — Production Hardening

```jsonc
{
  "network": {
    "timeout": 60000,
    "maxRetries": 5
  },
  "telemetry": {
    "logging": false
  }
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token not found | Set `GITHUB_TOKEN` or `GH_TOKEN`, or run `npx octocode-cli` |
| Local tools disabled | Set `ENABLE_LOCAL=true` |
| GitLab not working | Set `GITLAB_TOKEN` and `GITLAB_HOST` for self-hosted |
| Timeout errors | Increase `REQUEST_TIMEOUT` (max 300,000) |
| Tool not available | Check `TOOLS_TO_RUN` or `DISABLE_TOOLS` |
| Config file ignored | Env variables always override `.octocoderc` |
| Config changes not applied | Restart the MCP server (config is read at startup) |

### Verify Your Setup

```bash
# Check env vars
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:+set}"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:+set}"
echo "ENABLE_LOCAL: ${ENABLE_LOCAL:-not set}"
echo "LOG: ${LOG:-not set}"

# Check config file
ls -la ~/.octocode/.octocoderc
cat ~/.octocode/.octocoderc | python3 -c "import sys,json; json.load(sys.stdin)"
```

---

## See Also

- [Authentication Setup](../packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) — GitHub and GitLab auth guide
- [Troubleshooting](./TROUBLESHOOTING.md) — Node.js, npm, and connection issues

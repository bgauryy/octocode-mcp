# Configuration Reference

> Complete guide to configuring Octocode MCP — where to set options, what each option does, and how they interact.

## Two Ways to Configure

Octocode reads configuration from **two sources**. You can use either or both:

### 1. Environment Variables (in your MCP client settings)

Your MCP client (Cursor, VS Code, Claude Desktop, etc.) has a settings file where you declare MCP servers. Environment variables go in the `"env"` block of your server config:

**Cursor / VS Code** — `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "true"
      }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "true"
      }
    }
  }
}
```

Environment variables are ideal for per-project or per-session settings — especially auth tokens and feature flags.

### 2. The `.octocoderc` Config File (persistent defaults)

A JSON file stored on your machine that applies to **all** sessions. Supports comments and trailing commas. Ideal for machine-wide defaults that don't change between projects (API URLs, network tuning, tool preferences).

| Platform | Path |
|----------|------|
| macOS / Linux | `~/.octocode/.octocoderc` |
| Windows | `%USERPROFILE%\.octocode\.octocoderc` |

**Quick setup (macOS / Linux):**

```bash
mkdir -p ~/.octocode
cat > ~/.octocode/.octocoderc << 'EOF'
{
  "github": {
    "apiUrl": "https://api.github.com"
  },
  "local": {
    "enabled": true
  }
}
EOF
```

**Quick setup (Windows PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.octocode"
@'
{
  "github": {
    "apiUrl": "https://api.github.com"
  },
  "local": {
    "enabled": true
  }
}
'@ | Out-File -Encoding utf8 "$env:USERPROFILE\.octocode\.octocoderc"
```

**Complete schema:**

```jsonc
{
  "version": 1,

  "github": {
    "apiUrl": "https://api.github.com"       // GitHub API endpoint
  },

  "gitlab": {
    "host": "https://gitlab.com"             // GitLab instance URL
  },

  "local": {
    "enabled": false,                        // Enable local filesystem + LSP tools
    "enableClone": false,                    // Enable repo cloning (requires enabled=true)
    "workspaceRoot": "/path/to/workspace",   // Root for local operations
    "allowedPaths": []                       // Restrict to these paths (empty = all)
  },

  "tools": {
    "enabled": null,                         // Strict whitelist (null = all tools)
    "enableAdditional": null,                // Add extra tools
    "disabled": null,                        // Remove specific tools
    "disablePrompts": false                  // Disable MCP prompts registration
  },

  "network": {
    "timeout": 30000,                        // Request timeout in ms (5000–300000)
    "maxRetries": 3                          // Retry attempts (0–10)
  },

  "telemetry": {
    "logging": true                          // Telemetry
  },

  "lsp": {
    "configPath": null                       // Custom LSP config file path
  }
}
```

**Validation:** The file is validated on load. Invalid values don't prevent startup — defaults are used instead. URLs must start with `http://` or `https://`. Numbers are clamped to valid range. Unknown keys are ignored with a warning. Parse errors skip the entire file with a warning.

### Resolution Order

When both sources set the same option, environment variables always win:

```
Environment Variable  >  .octocoderc File  >  Built-in Default
     (highest)             (fallback)          (last resort)
```

This means you can set sensible defaults in `.octocoderc` and override specific values per-project in your MCP client config.

---

## Authentication

Auth tokens are **environment-variable only** — never store tokens in `.octocoderc`.

### GitHub Token Resolution

Octocode checks these sources in order and uses the **first one found**:

| Priority | Source | How to set |
|----------|--------|------------|
| 1 | `OCTOCODE_TOKEN` env var | Octocode-specific token. Set in MCP client `"env"` block. |
| 2 | `GH_TOKEN` env var | Compatible with GitHub CLI. Set in MCP client `"env"` block. |
| 3 | `GITHUB_TOKEN` env var | Compatible with GitHub Actions. Set in MCP client `"env"` block. |
| 4 | `~/.octocode/credentials.json` | Stored by `npx octocode-cli` during interactive auth (OAuth device flow). |
| 5 | `gh auth token` | Reads from GitHub CLI if installed and authenticated. |

**Minimum required scopes:** `repo`, `read:user`, `read:org`.

### GitLab Token Resolution

| Priority | Source | How to set |
|----------|--------|------------|
| 1 | `GITLAB_TOKEN` env var | GitLab personal access token. Set in MCP client `"env"` block. |
| 2 | `GL_TOKEN` env var | Fallback GitLab token. Set in MCP client `"env"` block. |

Setting either GitLab token **activates GitLab mode** — Octocode will use GitLab APIs instead of GitHub.

### Example — GitHub Auth

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

### Example — GitLab Auth

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

For the full authentication guide, see [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md).

---

## All Configuration Options

| # | Env Variable | `.octocoderc` Field | Type | Default | Description |
|---|---|---|---|---|---|
| | **GitHub** | | | | |
| 1 | `GITHUB_API_URL` | `github.apiUrl` | string | `https://api.github.com` | GitHub API endpoint. Change for GitHub Enterprise. |
| | **GitLab** | | | | |
| 2 | `GITLAB_HOST` | `gitlab.host` | string | `https://gitlab.com` | GitLab instance URL. Change for self-hosted GitLab. Use env var for reliability (see note below). |
| | **Local Tools** | | | | |
| 3 | `ENABLE_LOCAL` | `local.enabled` | boolean | `false` | Enable local filesystem + LSP tools. **Off by default — you must opt in.** |
| 4 | `ENABLE_CLONE` | `local.enableClone` | boolean | `false` | Enable repo cloning (`githubCloneRepo`) and directory fetch. **Requires `ENABLE_LOCAL=true`.** |
| 5 | `WORKSPACE_ROOT` | `local.workspaceRoot` | string | `process.cwd()` | Root directory for local tool operations. |
| 6 | `ALLOWED_PATHS` | `local.allowedPaths` | list | `[]` (all) | Restrict local tools to these directory paths. Empty = unrestricted. |
| | **Tool Filtering** | | | | |
| 7 | `TOOLS_TO_RUN` | `tools.enabled` | list | `null` (all) | **Strict whitelist.** When set, only these tools are available. Overrides #8 and #9. |
| 8 | `ENABLE_TOOLS` | `tools.enableAdditional` | list | `null` | Add extra tools to the default set. Ignored when #7 is set. |
| 9 | `DISABLE_TOOLS` | `tools.disabled` | list | `null` | Remove tools from the default set. Ignored when #7 is set. |
| 10 | `DISABLE_PROMPTS` | `tools.disablePrompts` | boolean | `false` | Disable MCP prompts registration (slash commands / agent instructions). Does not affect tool descriptions. |
| | **Network** | | | | |
| 11 | `REQUEST_TIMEOUT` | `network.timeout` | number | `30000` | Request timeout in ms. Range: 5,000–300,000. Values outside range are clamped. |
| 12 | `MAX_RETRIES` | `network.maxRetries` | number | `3` | Max retry attempts. Range: 0–10. Clamped. **Note:** Currently parsed but not wired to HTTP clients (retry logic uses hardcoded values). Reserved for future use. |
| | **Telemetry** | | | | |
| 13 | `LOG` | `telemetry.logging` | logging | `true` | telemetry. disabled with `false`/`0`   |
| | **LSP** | | | | |
| 14 | `OCTOCODE_LSP_CONFIG` | `lsp.configPath` | string | `null` | Custom LSP config file path. Auto-detects `.octocode/lsp-servers.json` when unset. Requires `ENABLE_LOCAL=true`. |
| | **Authentication** (env only) | | | | |
| 15 | `OCTOCODE_TOKEN` | — | string | — | GitHub token (priority 1). |
| 16 | `GH_TOKEN` | — | string | — | GitHub CLI token (priority 2). |
| 17 | `GITHUB_TOKEN` | — | string | — | GitHub Actions token (priority 3). |
| 18 | `GITLAB_TOKEN` | — | string | — | GitLab personal access token (priority 1). Setting this activates GitLab mode. |
| 19 | `GL_TOKEN` | — | string | — | GitLab token fallback (priority 2). Setting this activates GitLab mode. |
| | **Advanced** (env only) | | | | |
| 20 | `OCTOCODE_BULK_QUERY_TIMEOUT_MS` | — | number | `60000` | Timeout for bulk/multi-query tool calls (ms). |
| 21 | `OCTOCODE_COMMAND_CHECK_TIMEOUT_MS` | — | number | `5000` | Timeout for checking system command availability (ms). |
| 22 | `OCTOCODE_CACHE_TTL_MS` | — | number | `86400000` | Cache TTL for cloned repos (ms). Default is 24 hours. Must be a positive integer. |

**Type parsing (all values are case-insensitive, whitespace is trimmed):**

| Type | Accepted values | Invalid input |
|------|----------------|---------------|
| **boolean** | `true`, `1` = on; `false`, `0` = off | Ignored (default used) |
| **logging** | `false`, `0` = off; everything else = on | Treated as on |
| **number** | Integer string, clamped to valid range | Ignored (default used) |
| **list** | Comma-separated (e.g., `"a,b,c"`) | — |
| **string** | Any value | — |

### Notes

- **GitLab host:** The GitLab client reads `GITLAB_HOST` from environment only. Setting `gitlab.host` in `.octocoderc` is accepted but may not take effect for all operations. Use the env variable.
- **Tool filtering:** `TOOLS_TO_RUN` is a strict whitelist that overrides both `ENABLE_TOOLS` and `DISABLE_TOOLS`. When `TOOLS_TO_RUN` is not set, start with all tools, remove `DISABLE_TOOLS`, then add `ENABLE_TOOLS`.
- **Clone:** Requires both `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`.
- **LSP:** Requires `ENABLE_LOCAL=true`. When `OCTOCODE_LSP_CONFIG` is unset, Octocode checks `<workspace>/.octocode/lsp-servers.json` then `~/.octocode/lsp-servers.json`.
- **WORKSPACE_ROOT and LSP:** LSP tools read `WORKSPACE_ROOT` from the environment only (not `.octocoderc`). Set it as an env variable in your MCP client if you use LSP tools.
- **Auth tokens:** Never store in `.octocoderc`. GitHub fallback chain: env vars > `~/.octocode/credentials.json` > `gh auth token`.

---

## How to Set Each Option

Every option from the table above (except auth-only and advanced-only) can be set in **two places**. Here is each option shown in both formats.

### In MCP Client Settings (`mcp.json` / `claude_desktop_config.json`)

All values are strings in the `"env"` block:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "GITHUB_API_URL": "https://api.github.com",
        "GITLAB_HOST": "https://gitlab.com",
        "ENABLE_LOCAL": "true",
        "ENABLE_CLONE": "true",
        "WORKSPACE_ROOT": "/Users/me/projects",
        "ALLOWED_PATHS": "/Users/me/projects,/Users/me/libs",
        "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent",
        "ENABLE_TOOLS": "localSearchCode",
        "DISABLE_TOOLS": "packageSearch",
        "DISABLE_PROMPTS": "false",
        "REQUEST_TIMEOUT": "30000",
        "MAX_RETRIES": "3",
        "LOG": "true",
        "OCTOCODE_LSP_CONFIG": "/Users/me/.octocode/lsp-servers.json"
      }
    }
  }
}
```

### In `.octocoderc` Config File (`~/.octocode/.octocoderc`)

Values use native JSON types (booleans, numbers, arrays — not strings):

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
    "enableClone": true,
    "workspaceRoot": "/Users/me/projects",
    "allowedPaths": ["/Users/me/projects", "/Users/me/libs"]
  },

  "tools": {
    "enabled": ["githubSearchCode", "githubGetFileContent"],
    "enableAdditional": ["localSearchCode"],
    "disabled": ["packageSearch"],
    "disablePrompts": false
  },

  "network": {
    "timeout": 30000,
    "maxRetries": 3
  },

  "telemetry": {
    "logging": true
  },

  "lsp": {
    "configPath": "/Users/me/.octocode/lsp-servers.json"
  }
}
```

### Key Differences Between the Two Formats

| | MCP env (`"env"` block) | `.octocoderc` file |
|---|---|---|
| **All values are** | Strings (`"true"`, `"30000"`, `"a,b,c"`) | Native JSON types (`true`, `30000`, `["a","b","c"]`) |
| **Lists** | Comma-separated string: `"a,b,c"` | JSON array: `["a", "b", "c"]` |
| **Booleans** | `"true"` / `"false"` | `true` / `false` |
| **Numbers** | `"30000"` | `30000` |
| **Auth tokens** | Supported | Not supported (never store tokens here) |
| **Scope** | Per-project / per-session | Machine-wide (all sessions) |
| **Priority** | Highest (always wins) | Fallback |

---

## Full Examples

### Minimal Setup (GitHub + remote tools only)

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

### Full-Featured Setup (local + clone + LSP)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "true",
        "ENABLE_CLONE": "true"
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

### Production Hardening

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "ENABLE_LOCAL": "true",
        "REQUEST_TIMEOUT": "60000",
        "MAX_RETRIES": "5",
        "LOG": "false"
      }
    }
  }
}
```

### Restricted Tool Set (only GitHub search tools)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent,githubViewRepoStructure,githubSearchRepositories"
      }
    }
  }
}
```

### Combining MCP env + `.octocoderc`

Set persistent defaults in `.octocoderc`:

```jsonc
// ~/.octocode/.octocoderc
{
  "network": { "timeout": 60000, "maxRetries": 5 },
  "local": { "enabled": true, "allowedPaths": ["/Users/me/projects"] }
}
```

Then override per-project in your MCP client:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx",
        "WORKSPACE_ROOT": "/Users/me/projects/my-app",
        "ENABLE_CLONE": "true"
      }
    }
  }
}
```

The env values override `.octocoderc` where they overlap; `.octocoderc` fills in the rest.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token not found | Set `GITHUB_TOKEN` or `GH_TOKEN` in MCP `"env"`, or run `npx octocode-cli` for interactive auth |
| Local tools not showing | Set `ENABLE_LOCAL=true` in MCP `"env"` |
| Clone/directory tools disabled | Set both `ENABLE_LOCAL=true` and `ENABLE_CLONE=true` |
| GitLab not working | Set `GITLAB_TOKEN` and `GITLAB_HOST` in MCP `"env"` (not `.octocoderc`) |
| Timeout errors | Increase `REQUEST_TIMEOUT` (max `300000`) |
| Tool not available | Check if `TOOLS_TO_RUN` or `DISABLE_TOOLS` is filtering it out |
| Config file ignored | Env variables always override `.octocoderc` — check your MCP `"env"` block |
| Config changes not applied | Restart the MCP server (config is read at startup) |

### Verify Your Setup

```bash
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:+set}"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:+set}"
echo "ENABLE_LOCAL: ${ENABLE_LOCAL:-not set}"
echo "LOG: ${LOG:-not set}"

ls -la ~/.octocode/.octocoderc
cat ~/.octocode/.octocoderc | python3 -c "import sys,json; json.load(sys.stdin)"
```

---

## See Also

- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) — GitHub and GitLab auth guide
- [Local & LSP Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) — Local tools (requires `ENABLE_LOCAL=true`)
- [GitHub & GitLab Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md) — Remote code research tools
- [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) — Node.js, npm, and connection issues

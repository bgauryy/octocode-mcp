# Octocode — Global Config (`.octocoderc`)

Persistent configuration file for machine-wide defaults.

**Format:** JSON5 (supports comments and trailing commas)

**Location by platform:**

| Platform | Path |
|----------|------|
| macOS | `~/.octocode/.octocoderc` |
| Linux | `~/.octocode/.octocoderc` |
| Windows | `%USERPROFILE%\.octocode\.octocoderc` (e.g., `C:\Users\<you>\.octocode\.octocoderc`) |

---

## Quick Setup

**macOS / Linux:**
```bash
mkdir -p ~/.octocode
cat > ~/.octocode/.octocoderc << 'CONFIGEOF'
{
  "github": {
    "apiUrl": "https://api.github.com"
  }
}
CONFIGEOF
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

---

## How It Works

When the MCP server starts, settings resolve in this order:

1. **Environment variable** — highest priority (per-session override)
2. **`.octocoderc` file** — persistent defaults (this file)
3. **Hardcoded defaults** — fallback

Use `.octocoderc` for settings that rarely change between sessions. Use environment variables for per-project or CI/CD overrides.

> See [Configuration Reference](./CONFIGURATION_REFERENCE.md) for all available options and their env variable mappings.

---

## Complete Schema

```jsonc
{
  "$schema": "https://octocode.dev/schemas/octocoderc.json",
  "version": 1,

  "github": {
    "apiUrl": "https://api.github.com"    // GITHUB_API_URL env override
  },

  "gitlab": {
    "host": "https://gitlab.com"          // GITLAB_HOST env override
  },

  "local": {
    "enabled": true,                       // ENABLE_LOCAL env override
    "workspaceRoot": "/path/to/workspace", // WORKSPACE_ROOT env override
    "allowedPaths": []                     // ALLOWED_PATHS env override
  },

  "tools": {
    "enabled": null,                       // TOOLS_TO_RUN env override
    "enableAdditional": null,              // ENABLE_TOOLS env override
    "disabled": null,                      // DISABLE_TOOLS env override
    "disablePrompts": false                // DISABLE_PROMPTS env override
  },

  "network": {
    "timeout": 30000,                      // REQUEST_TIMEOUT env override (5000-300000)
    "maxRetries": 3                        // MAX_RETRIES env override (0-10)
  },

  "telemetry": {
    "logging": true                        // LOG env override
  },

  "lsp": {
    "configPath": null,                    // OCTOCODE_LSP_CONFIG env override (no default)
    "forceMcpLsp": false                   // OCTOCODE_FORCE_LSP env override (set to "1")
  },

  "security": {
    "redactErrorPaths": false              // REDACT_ERROR_PATHS env override
  }
}
```

---

## Common Configurations

### GitHub Enterprise

```jsonc
{
  "github": {
    "apiUrl": "https://github.mycompany.com/api/v3"
  }
}
```

### Self-hosted GitLab

```jsonc
{
  "gitlab": {
    "host": "https://gitlab.mycompany.com"
  }
}
```

### Restricted Workspace

```jsonc
{
  "local": {
    "workspaceRoot": "/Users/me/projects/main",
    "allowedPaths": ["/Users/me/projects"]
  }
}
```

### Only GitHub Tools

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

### Quiet Mode

```jsonc
{
  "telemetry": {
    "logging": false
  }
}
```

### Production Hardening

```jsonc
{
  "security": {
    "redactErrorPaths": true
  },
  "network": {
    "timeout": 60000,
    "maxRetries": 5
  }
}
```

---

## Validation

The config file is validated on load. Invalid values generate warnings but don't prevent startup — defaults are used instead.

**Rules:**
- URLs must be valid `http://` or `https://`
- Numbers are clamped to valid ranges
- Unknown keys generate warnings but are ignored
- Parse errors skip the entire file with a warning

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Config not loading | Check file exists (see commands below) |
| Syntax error | Validate JSON (see commands below) |
| Settings ignored | Env variables override `.octocoderc` — check your MCP client env config |
| Changes not applied | Restart the MCP server (config is cached) |

**Verify config file (macOS/Linux):**
```bash
ls -la ~/.octocode/.octocoderc
cat ~/.octocode/.octocoderc | python3 -c "import sys,json; json.load(sys.stdin)"
```

**Verify config file (Windows PowerShell):**
```powershell
Test-Path "$env:USERPROFILE\.octocode\.octocoderc"
Get-Content "$env:USERPROFILE\.octocode\.octocoderc" | python -c "import sys,json; json.load(sys.stdin)"
```

---

## See Also

- [Configuration Reference](./CONFIGURATION_REFERENCE.md) — All options with env variable mappings
- [Troubleshooting](./TROUBLESHOOTING.md) — Common issues and solutions

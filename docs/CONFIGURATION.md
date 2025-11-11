## Octocode MCP Configuration

Centralized reference for configuring the Octocode MCP server, including
authentication, GitHub Enterprise support, environment variables,
timeouts/retries, and tool selection.

### How to supply configuration
- MCP clients: add `env` under your server config
- Shell/OS: export environment variables before launching your client
- Authentication can be via GitHub CLI or a Personal Access Token (PAT)

Example MCP client config (minimal):

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

---

## Authentication

Octocode supports two methods:

1) GitHub CLI (recommended)
```bash
brew install gh
gh auth login
```
- No token needs to be set in your MCP config
- Internally, Octocode calls `gh auth token`

2) Personal Access Token (PAT)
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```
- Scopes: `repo`, `read:user`, `read:org`
- Also recognized: `GH_TOKEN` as an alternative token variable

Verification messages at startup:
- “GitHub token ready” → authenticated
- “No GitHub token - limited functionality” → unauthenticated (lower rate limits)

---

## GitHub Enterprise Support

Use a custom API base URL with `GITHUB_API_URL`.

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "your_token",
        "GITHUB_API_URL": "https://github.company.com/api/v3"
      }
    }
  }
}
```

- Default (public GitHub): `https://api.github.com`
- Ensure your enterprise token has the same scopes as above

---

## Environment Variables Reference

| Variable         | Type               | Default                   | Description |
|------------------|--------------------|---------------------------|-------------|
| `GITHUB_TOKEN`   | string             | none                      | Personal Access Token (used if available; the CLI token is used if this is not set). |
| `GH_TOKEN`       | string             | none                      | Alternative token variable (used when `GITHUB_TOKEN` is not present). |
| `GITHUB_API_URL` | string             | `https://api.github.com`  | Base API URL (set for GitHub Enterprise). |
| `TOOLS_TO_RUN`   | string (CSV)       | none                      | Exclusive list of tools to register. Mutually exclusive with `ENABLE_TOOLS`/`DISABLE_TOOLS`. |
| `ENABLE_TOOLS`   | string (CSV)       | none                      | Additive list of tools to enable. Ignored if `TOOLS_TO_RUN` is set. |
| `DISABLE_TOOLS`  | string (CSV)       | none                      | List of tools to disable. Ignored if `TOOLS_TO_RUN` is set. |
| `BETA`           | "0" \| "1" \| "true"/"false" | "0"/false          | Enable experimental features. |
| `LOG`            | "true" \| "false"  | "true"                    | - |
| `REQUEST_TIMEOUT`| number (ms)        | 30000 (min 30000)         | Per-request timeout. Values lower than 30000 are clamped to 30000. |
| `MAX_RETRIES`    | number             | 3 (range 0..10)           | Max retry attempts for transient errors; clamped between 0 and 10. |

Notes:
- CSV parsing is whitespace-tolerant (e.g., `" githubSearchCode , githubGetFileContent "` is valid).
- Default tools (enabled automatically when not disabled): `githubSearchCode`, `githubSearchRepositories`, `githubViewRepoStructure`, `githubGetFileContent`, `githubSearchPullRequests`.

---

## Tool Selection Examples

Run only search tools (exclusive mode):
```bash
export TOOLS_TO_RUN="githubSearchCode,githubSearchRepositories"
```

Disable PR search:
```bash
export DISABLE_TOOLS="githubSearchPullRequests"
```

Disable structure exploration:
```bash
export DISABLE_TOOLS="githubViewRepoStructure"
```

Enable experimental features:
```bash
export BETA="1"
```

MCP config with env:
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "DISABLE_TOOLS": "githubSearchPullRequests",
        "BETA": "1"
      }
    }
  }
}
```

---

## Timeouts and Retries

Advanced controls sourced from the server configuration:
- `REQUEST_TIMEOUT` (ms): default `30000`; values below `30000` are raised to `30000`.
- `MAX_RETRIES`: default `3`; bounded to `0..10`.

Examples:
```bash
export REQUEST_TIMEOUT="45000"
export MAX_RETRIES="5"
```

---

## Quick MCP Configuration (with Enterprise)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "GITHUB_API_URL": "https://github.company.com/api/v3",
        "REQUEST_TIMEOUT": "45000",
        "MAX_RETRIES": "5"
      }
    }
  }
}
```



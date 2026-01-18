# Octocode Configuration Reference

This document details the configuration system for Octocode, explaining how to configure the MCP server and CLI using environment variables and the global configuration file.

## Configuration Hierarchy

Octocode resolves configuration in the following order (highest priority first):

1.  **Environment Variables**: Override all other settings.
2.  **Global Configuration File**: `~/.octocode/.octocoderc` (User-specific settings).
3.  **Default Values**: Hardcoded fallbacks in the application.

---

## 1. Environment Variables

Environment variables are the primary way to configure secrets (tokens) and runtime overrides.

### Authentication (Tokens)

| Variable | Priority | Description |
|----------|----------|-------------|
| `OCTOCODE_TOKEN` | 1 | Octocode-specific GitHub token (Recommended). |
| `GH_TOKEN` | 2 | GitHub CLI compatible token. |
| `GITHUB_TOKEN` | 3 | Standard GitHub token. |
| `GITLAB_TOKEN` | 1 | GitLab Personal Access Token. |
| `GL_TOKEN` | 2 | GitLab token fallback. |

> **Note**: If `GITLAB_TOKEN` is present, Octocode defaults to GitLab mode unless specified otherwise.

### Connectivity & Platform

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_API_URL` | `https://api.github.com` | Base URL for GitHub API (useful for GHE). |
| `GITLAB_HOST` | `https://gitlab.com` | Base URL for GitLab instance. |
| `REQUEST_TIMEOUT` | `30000` | HTTP request timeout in milliseconds (min 5000). |
| `MAX_RETRIES` | `3` | Maximum HTTP retry attempts (0-10). |

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_LOCAL` / `LOCAL` | `false` | Enable local filesystem tools (`local*`, `lsp*`). |
| `LOG` | `true` | Enable session logging (unless telemetry disabled). |
| `OCTOCODE_TELEMETRY_DISABLED` | `false` | Set to `1` or `true` to completely disable telemetry. |

### Tool Control

| Variable | Description |
|----------|-------------|
| `TOOLS_TO_RUN` | Comma-separated list of tools to run (whitelist). |
| `ENABLE_TOOLS` | Comma-separated list of tools to enable. |
| `DISABLE_TOOLS` | Comma-separated list of tools to disable. |

---

## 2. Global Configuration File (`.octocoderc`)

The `.octocoderc` file is located at `~/.octocode/.octocoderc`. It uses **JSON5** format, which supports comments (`//`, `/* */`) and trailing commas.

### Example Configuration

```jsonc
{
  "version": 1,
  
  // GitHub Settings
  "github": {
    "apiUrl": "https://api.github.com",
    "defaultOrg": "wix-private"
  },

  // GitLab Settings
  "gitlab": {
    "host": "https://gitlab.com",
    "defaultGroup": "my-group"
  },

  // Local Filesystem Tools
  "local": {
    "enabled": true,
    "allowedPaths": ["/Users/me/projects"], // Restrict access
    "excludePaths": ["node_modules", "dist"] // Extra excludes
  },

  // Tool Availability
  "tools": {
    // "enabled": ["githubSearchCode"], // Whitelist mode (null = all)
    "disabled": ["githubSearchPullRequests"] // Blacklist mode
  },

  // Network & Performance
  "network": {
    "timeout": 30000,
    "maxRetries": 3
  },

  // LSP Settings
  "lsp": {
    "enabled": true,
    "timeout": 10000,
    "languages": {
      "python": {
        "serverPath": "/usr/local/bin/pylsp"
      }
    }
  },

  // Research Defaults
  "research": {
    "defaultProvider": "github",
    "maxQueriesPerBatch": 3, // Max parallel queries
    "maxResultsPerQuery": 10
  }
}
```

### Section Reference

#### `github`
*   `apiUrl` (string): GitHub API URL.
*   `defaultOrg` (string): Default organization to search if none specified.

#### `gitlab`
*   `host` (string): GitLab instance URL.
*   `defaultGroup` (string): Default group to search.

#### `local`
*   `enabled` (boolean): Enable local filesystem tools.
*   `allowedPaths` (string[]): Whitelist of allowed absolute paths. If empty, all paths are allowed.
*   `excludePaths` (string[]): Paths to always exclude from search/traversal.

#### `tools`
*   `enabled` (string[] | null): Whitelist of tool names. If set, ONLY these tools are available.
*   `disabled` (string[] | null): Blacklist of tool names to hide.

#### `network`
*   `timeout` (number): Request timeout in ms (Min: 5000, Max: 300000).
*   `maxRetries` (number): Max retries for failed requests (Min: 0, Max: 10).

#### `telemetry`
*   `enabled` (boolean): Enable anonymous usage stats.
*   `logging` (boolean): Enable debug logging.

#### `lsp`
*   `enabled` (boolean): Enable LSP features.
*   `timeout` (number): LSP request timeout in ms.
*   `languages` (object): Per-language server config. Keys are language IDs (e.g., `python`, `typescript`).
    *   `serverPath` (string): Absolute path to language server binary.

#### `research`
*   `defaultProvider` ("github" | "gitlab"): Default search provider.
*   `maxQueriesPerBatch` (number): Max parallel sub-queries (1-10).
*   `maxResultsPerQuery` (number): Max results per individual query (1-100).

---

## 3. Defaults

If configuration is missing, Octocode uses these defaults:

| Setting | Default Value |
|---------|---------------|
| `network.timeout` | `30000` (30s) |
| `network.maxRetries` | `3` |
| `local.enabled` | `false` |
| `local.excludePaths` | `['node_modules', '.git', 'dist', 'coverage', '__pycache__', '.venv', 'venv']` |
| `research.maxQueriesPerBatch` | `3` |
| `research.maxResultsPerQuery` | `10` |
| `lsp.timeout` | `10000` (10s) |

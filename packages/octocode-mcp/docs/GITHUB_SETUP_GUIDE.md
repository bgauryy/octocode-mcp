# GitHub Setup Guide

> Complete guide for using Octocode MCP with GitHub  -  authentication, GitHub Enterprise, available tools, and troubleshooting.

---

## Quick Start

```bash
# Option A: Interactive login (recommended)
npx octocode-cli
# → Select "Login to GitHub" from the menu

# Option B: Set a token manually
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"

# Start Octocode MCP  -  GitHub is the default provider
npx octocode-mcp
```

GitHub is the **default provider**. When no GitLab or Bitbucket token is set, Octocode uses GitHub automatically.

---

## Authentication

Choose **one** of the following methods (listed from easiest to most manual):

### Option 1: Octocode CLI (Recommended)

The easiest way  -  handles secure OAuth login for you:

```bash
npx octocode-cli
# → Select "Login to GitHub" from the menu
```

This opens a browser window to authorize Octocode safely. The token is stored securely in your system keychain.

### Option 2: GitHub CLI (`gh`)

If you already use the [GitHub CLI](https://cli.github.com/), Octocode automatically detects your credentials:

```bash
gh auth login
```

That's it  -  no additional setup needed.

### Option 3: Manual Token (Environment Variable)

Create a [GitHub Personal Access Token](https://github.com/settings/tokens) (Classic) with `repo` scope, then set it in one of these places:

**A. Shell Environment:**

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

**B. MCP Client Configuration (Cursor / VS Code / Claude Desktop):**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

### Token Priority

When multiple tokens are available, Octocode uses the **first one found**:

| Priority | Source | How to set |
|----------|--------|------------|
| 1 (highest) | `OCTOCODE_TOKEN` env var | Octocode-specific token. Set in MCP client `"env"` block. |
| 2 | `GH_TOKEN` env var | Compatible with GitHub CLI. Set in MCP client `"env"` block. |
| 3 | `GITHUB_TOKEN` env var | Compatible with GitHub Actions. Set in MCP client `"env"` block. |
| 4 | `~/.octocode/credentials.json` | Stored by `npx octocode-cli` during interactive auth (OAuth device flow). |
| 5 | `gh auth token` | Reads from GitHub CLI if installed and authenticated. |

**Minimum required scopes:** `repo`, `read:user`, `read:org`.

---

## GitHub Enterprise

For GitHub Enterprise Server, set the API URL alongside your token:

**Shell:**

```bash
export GITHUB_TOKEN="ghp_your_token_here"
export GITHUB_API_URL="https://github.mycompany.com/api/v3"
```

**MCP Client Configuration:**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y", "octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "GITHUB_API_URL": "https://github.mycompany.com/api/v3"
      }
    }
  }
}
```

The default is `https://api.github.com` if `GITHUB_API_URL` is not set.

---

## Available Tools

All tools are available when GitHub is the active provider:

| Tool | Description |
|------|-------------|
| `githubSearchCode` | Search code patterns across repositories |
| `githubSearchRepositories` | Discover repositories by keywords or topics |
| `githubSearchPullRequests` | Search pull requests with extensive filters |
| `githubGetFileContent` | Read file content or fetch a directory to disk |
| `githubViewRepoStructure` | Browse repository file tree |
| `githubCloneRepo` | Clone a repo locally for deep analysis with local + LSP tools |
| `packageSearch` | Lookup NPM/PyPI packages (works with all providers) |

### GitHub-Only Features

These features are exclusive to GitHub and not available with GitLab or Bitbucket:

* **`githubCloneRepo`**  -  Clone repositories (or subdirectories via sparse checkout) for local + LSP analysis. Requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`.
* **`githubGetFileContent` directory mode**  -  Fetch an entire directory to disk (`type: "directory"`). Same requirements as clone.

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` |  -  | GitHub personal access token (or use `OCTOCODE_TOKEN` / `GH_TOKEN`) |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub API endpoint (change for GitHub Enterprise) |
| `ENABLE_LOCAL` | `false` | Enable local filesystem + LSP tools |
| `ENABLE_CLONE` | `false` | Enable `githubCloneRepo` and directory fetch (requires `ENABLE_LOCAL=true`) |

For complete configuration options, see the [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md).

---

## Troubleshooting

### "No GitHub token found"

* Run `npx octocode-cli` and select **"Check GitHub Auth Status"**.
* Ensure you have run `gh auth login` if using the GitHub CLI.
* Check if your environment variable is set: `echo $GITHUB_TOKEN`.

### 401 Unauthorized

* Verify your token is valid and hasn't expired.
* Check that the token has `repo` scope.
* For GitHub Enterprise: verify the API URL is correct.

### Token Expired

* Run `npx octocode-cli` and select **"Login to GitHub"** again to refresh it.
* Or run `gh auth refresh` if using the GitHub CLI.

### Switching Accounts

* Run `npx octocode-cli` and login with the new account. Octocode picks up the change immediately (no restart needed).

### Clone/Directory Tools Disabled

* Set both `ENABLE_LOCAL=true` and `ENABLE_CLONE=true` in your MCP client `"env"` block.

---

## See Also

* [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)  -  Overview of all provider authentication
* [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md)  -  Full tool documentation
* [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)  -  All configuration options
* [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md)  -  General troubleshooting guide

---
Created by Octocode MCP https://octocode.ai

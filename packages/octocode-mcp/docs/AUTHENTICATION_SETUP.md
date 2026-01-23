# Authentication Setup

> How to authenticate Octocode with GitHub or GitLab

## Overview

The Octocode MCP server needs access to your code repositories to work. You can authenticate with either **GitHub** or **GitLab**.

---

## 🐙 GitHub Authentication

Choose **ONE** of the following methods (listed in order of ease):

### Option 1: Octocode CLI (Recommended)

The easiest way is to use our installer, which handles the secure OAuth login for you.

```bash
# Run the installer
npx octocode-cli

# Select "Login to GitHub" from the menu
```
This will open a browser window to authorize Octocode safely. The token is stored securely in your system keychain.

### Option 2: GitHub CLI (`gh`)

If you already use the [GitHub CLI](https://cli.github.com/), Octocode will automatically use your existing credentials!

```bash
# If you are already logged in here:
gh auth login
```
**That's it!** Octocode will automatically detect your `gh` credentials.

### Option 3: Manual Token (Environment Variable)

You can manually provide a Personal Access Token (PAT). This is great for CI/CD or if you prefer manual configuration.

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) (Classic) with `repo` scopes.
2. Set the `GITHUB_TOKEN` variable in **one** of these places:

**A. Global Environment (Shell)**
Add to your shell configuration (e.g., `~/.zshrc`):
```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

**B. MCP Client Configuration (e.g., Cursor/Claude)**
Add to your MCP settings file (usually `claude_desktop_config.json` or similar):
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

---

## 🦊 GitLab Authentication

To use GitLab, you simply need to set an environment variable.

### Option 1: Personal Access Token

1. Create a [GitLab Personal Access Token](https://gitlab.com/-/profile/personal_access_tokens) with `api` scope.
2. Set the `GITLAB_TOKEN` variable in **one** of these places:

**A. Global Environment (Shell)**
```bash
export GITLAB_TOKEN="glpat_your_token_here"
```

**B. MCP Client Configuration**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp"],
      "env": {
        "GITLAB_TOKEN": "glpat_your_token_here",
        "GITLAB_HOST": "gitlab_host"
      }
    }
  }
}
```

**Note:** When `GITLAB_TOKEN` is detected, Octocode switches to GitLab mode automatically.

### Self-Hosted GitLab

If you are using a self-hosted instance, add the host URL variable (`GITLAB_HOST`) alongside the token:

```bash
# Shell example
export GITLAB_TOKEN="glpat_your_token_here"
export GITLAB_HOST="https://gitlab.your-company.com"
```

---

## ❓ Troubleshooting

### "No GitHub token found"
- Run `npx octocode-cli` and select **"Check GitHub Auth Status"**.
- Ensure you have run `gh auth login` if using the GitHub CLI.
- Check if your environment variables are set: `echo $GITHUB_TOKEN`.

### "Token expired"
- Simply run `npx octocode-cli` and select **"Login to GitHub"** again to refresh it.
- Or run `gh auth refresh` if using the GitHub CLI.

### Switching Accounts
- Just run `npx octocode-cli` and login with the new account. Octocode picks up the change immediately (no restart needed).

---

> **For other issues** (npm registry, Node.js version, MCP connection): See the [Troubleshooting Guide](../../../docs/TROUBLESHOOTING.md)

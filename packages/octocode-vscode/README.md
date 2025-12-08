# Octocode Extension

**Intelligent Code Context for AI Systems**

[Octocode.ai](https://octocode.ai) • [GitHub Repository](https://github.com/bgauryy/octocode-mcp) • [Report Issues](https://github.com/bgauryy/octocode-mcp/issues)

---

## Overview

Octocode for VS Code is a management extension for the **Octocode Model Context Protocol (MCP) Server**. It bridges the gap between your AI editor (Cursor, Windsurf, VS Code) and the GitHub ecosystem, enabling your AI assistant to perform deep research, code analysis, and pattern discovery across millions of repositories.

### About Model Context Protocol (MCP)

The Model Context Protocol (MCP) is an open standard that enables AI models to interact with external tools and data sources. This extension automatically configures the **Octocode MCP Server** as a local agent, allowing your editor's AI to securely execute specialized GitHub research commands.

## Features

-   **Automated MCP Configuration**: Detects your editor environment (Cursor, Windsurf, VS Code) and injects the necessary MCP server configuration.
-   **Process Management**: Manages the lifecycle of the local `octocode-mcp` Node.js process.
-   **Token Management**: Securely handles GitHub Personal Access Tokens (PAT) for increased API rate limits.
-   **Status Monitoring**: Provides real-time server status and connection diagnostics via the VS Code status bar.

## Capabilities

Once installed, your AI assistant gains access to the following MCP tools:

-   **githubSearchCode**: Semantic and exact-match code search across the entire GitHub corpus.
-   **githubSearchRepositories**: Discovery of repositories by technology, topic, or keyword.
-   **githubViewRepoStructure**: Analysis of repository architecture and file layouts.
-   **githubGetFileContent**: Context-aware file reading with smart token optimization.
-   **githubSearchPullRequests**: Historical analysis of code changes, diffs, and discussions.
-   **packageSearch**: Dependency metadata resolution for NPM and Python packages.

## Installation & Setup

1.  **Install the Extension**: Download "Octocode MCP" from the VS Code Marketplace.
2.  **Restart Editor**: A full restart is required for the editor to load the new MCP configuration.
3.  **Verification**: The status bar will show "Octocode MCP: Running".

## Authentication

**[See Full Installation Guide](https://octocode.ai/#installation)**

To perform searches, you need to authenticate.

### Option 1: GitHub CLI (Recommended)

If you have the [GitHub CLI](https://cli.github.com/) (`gh`) installed, simply run:

```bash
gh auth login
```

Octocode will automatically use your CLI credentials. No further configuration is needed.

### Option 2: GitHub Token

If you don't have the CLI, or prefer using a token, you can provide a `GITHUB_TOKEN`. You only need **`repo`** (read-only) permissions.

1.  **Create Token**:
    *   **[Classic Token](https://github.com/settings/tokens/new?scopes=repo&description=Octocode%20MCP)** (Select `repo` scope)
    *   **[Fine-grained Token](https://github.com/settings/personal-access-tokens/new)** (Select "All repositories" and "Contents: Read")
2.  **Configure**:
    *   Open VS Code Settings (`Cmd+,` or `Ctrl+,`).
    *   Search for `Octocode`.
    *   Paste your token into `Octocode: Github Token`.

### Manual Configuration

If you prefer to configure the MCP server manually (e.g., in `~/.cursor/mcp.json`) and are **not** using the GitHub CLI:

```json
{
  "octocode": {
    "command": "npx",
    "args": [
      "octocode-mcp@latest"
    ],
    "env": {
      "GITHUB_TOKEN": "ghp_your_token_here"
    }
  }
}
```

## Supported Environments

This extension supports editors that implement the MCP client specification:

-   **Cursor**: Writes configuration to `~/.cursor/mcp.json`.
-   **Windsurf**: Writes configuration to `~/.codeium/windsurf/mcp_config.json`.
-   **VS Code**: Compatible with MCP-enabled extensions like GitHub Copilot (preview) or Claude Desktop.

---

<div align="center">
  <p>Powered by <a href="https://octocode.ai"><b>Octocode.ai</b></a></p>
  <p><i>The AI Research Agent for Code</i></p>
</div>

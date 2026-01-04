# 🐙 Octocode CLI

**The easiest way to set up [octocode-mcp](https://www.npmjs.com/package/octocode-mcp) for your AI coding assistant.**

One command. Interactive setup. Done in seconds.

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI" width="700">
</p>

## ⚡ Quick Start

```bash
npx octocode-cli
```

That's it! The interactive wizard will guide you through everything.

## 🎯 Main Menu

| Option | Description |
|--------|-------------|
| **🐙 Octocode Configuration** | Install, configure, and manage GitHub authentication |
| **🤖 Run Agent** | AI agent with Octocode tools |
| **🧠 Manage System Skills** | Install and manage Octocode skills for Claude Code |
| **⚡ Manage System MCP** | Sync configs, browse MCP marketplace, open config files |

## ✨ Features

- 🎯 **Zero Config** - Interactive prompts handle everything
- 🔍 **Auto-Detection** - Finds installed IDEs automatically
- 🔐 **Built-in Auth** - GitHub OAuth authentication included
- 🛡️ **Safe Updates** - Preserves existing MCP configurations
- 🔌 **MCP Marketplace** - Browse & install 70+ community MCP servers

## 📦 Installation

### Run Directly (Recommended)

No installation needed - just run:

```bash
npx octocode-cli
```

### Global Install

For frequent use:

```bash
npm install -g octocode-cli
octocode
```

## 🔌 MCP Marketplace

Easily browse and install from **70+ community MCP servers** directly to your IDE.

### Features

- 🔍 **Search** - Find MCPs by name, description, or tags
- 📂 **Browse by Category** - 19 categories (databases, browser automation, AI services, etc.)
- ⭐ **Popular MCPs** - Quick access to top 20 most popular servers
- 📋 **Full List (A-Z)** - Browse all MCPs sorted alphabetically
- ⚙️ **Easy Setup** - Configure required API keys/tokens during install
- ↩️ **Back Navigation** - Go back at any step to change your selection

### Available Categories

| Category | Examples |
|----------|----------|
| Browser Automation | Playwright, Puppeteer, Firecrawl |
| Databases | PostgreSQL, MongoDB, Redis, Supabase |
| Cloud Platforms | AWS, Cloudflare, Vercel, Docker |
| Developer Tools | Sentry, Figma, Context7 |
| Communication | Slack, Discord, Linear, Atlassian |
| AI Services | OpenAI, LlamaCloud, HuggingFace |
| And more... | 70+ servers across 19 categories |

### How to Use

1. Run `npx octocode-cli`
2. Select **"⚡ Manage System MCP"** from the main menu
3. Select **"🔌 MCP Marketplace"**
4. Choose your target IDE
5. Search or browse for an MCP
6. Configure any required environment variables
7. Confirm and install!

## 🖥️ Supported Clients

| Client | Description | Status |
|--------|-------------|--------|
| **Cursor** | AI-first code editor | ✅ Supported |
| **Claude Desktop** | Anthropic's desktop app | ✅ Supported |
| **Claude Code** | Claude CLI for terminal | ✅ Supported |
| **Windsurf** | Codeium AI IDE | ✅ Supported |
| **Zed** | High-performance editor | ✅ Supported |
| **Cline** | VS Code AI extension | ✅ Supported |

## 🔧 CLI Mode

For automation or CI/CD, use CLI flags:

```bash
# Install for Cursor using NPX method
octocode-cli install --ide cursor --method npx

# Install for Claude Desktop
octocode-cli install --ide claude --method direct

# Force overwrite existing config
octocode-cli install --ide cursor --method npx --force

# Check GitHub authentication status
octocode-cli status

# Get your GitHub token (for scripting)
octocode-cli token                   # From octocode-cli (default)
octocode-cli token --type=gh         # From gh CLI
octocode-cli token --type=auto       # Try both, octocode first

# Manage GitHub authentication
octocode-cli auth
```

### Commands

| Command | Description |
|---------|-------------|
| `install` | Install octocode-mcp for an IDE |
| `auth` | Manage GitHub authentication (interactive) |
| `login` | Sign in to GitHub |
| `logout` | Sign out from GitHub |
| `status` | Show GitHub authentication status |
| `token` | Print the stored GitHub OAuth token (see `--type`) |

### Options

| Option | Description |
|--------|-------------|
| `--ide <ide>` | IDE to configure: `cursor`, `claude`, `claude-code`, `windsurf`, `zed`, `cline` |
| `--method <method>` | Installation method: `npx` or `direct` |
| `--hostname <host>` | GitHub Enterprise hostname (default: `github.com`) |
| `--type <type>` | Token source for `token` command: `octocode`, `gh`, `auto` |
| `-f, --force` | Overwrite existing configuration |
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |

## 📁 Configuration Files

The CLI automatically updates the correct config file for each IDE:

| IDE | macOS | Windows |
|-----|-------|---------|
| Cursor | `~/.cursor/mcp.json` | `%APPDATA%\Cursor\mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | `~/.claude.json` | `%USERPROFILE%\.claude.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `%APPDATA%\Codeium\windsurf\mcp_config.json` |
| Zed | `~/.config/zed/settings.json` | `%APPDATA%\Zed\settings.json` |
| Cline | VS Code settings | VS Code settings |

## 🔐 GitHub Authentication

Octocode CLI includes built-in GitHub OAuth authentication with **secure encrypted storage**.

### Quick Auth Commands

```bash
# Sign in to GitHub (opens browser for OAuth)
octocode-cli login

# Check your auth status
octocode-cli status

# Interactive auth menu (sign in/out/switch)
octocode-cli auth

# Get your token (useful for scripts)
octocode-cli token

# Sign out from GitHub
octocode-cli logout

# For GitHub Enterprise
octocode-cli login --hostname github.mycompany.com
octocode-cli status --hostname github.mycompany.com
```

### Authentication Methods

During installation, you can choose how to authenticate:

| Method | Description | Best For |
|--------|-------------|----------|
| **gh CLI** (Recommended) | Uses existing `gh auth` credentials | Users with GitHub CLI installed |
| **OAuth Device Flow** | Opens browser for secure login | Most users |
| **Personal Access Token** | Manual PAT entry | Automation, CI/CD |
| **Skip** | Configure manually later | Advanced users |

### Secure Credential Storage

Your credentials are **encrypted at rest** using AES-256-GCM:

```
~/.octocode/
├── credentials.json   # Encrypted credentials (per hostname)
└── .key               # Encryption key (mode 0600)
```

- Credentials are stored per hostname (supports multiple GitHub instances)
- Tokens auto-refresh when expired (if refresh token available)
- File permissions are set to user-only (mode 0600/0700)

### Token Management

```bash
# Check if token is valid and not expired
octocode-cli status

# Get your token (defaults to octocode-cli)
octocode-cli token

# Get token from specific source
octocode-cli token --type=octocode    # From octocode-cli only
octocode-cli token --type=gh          # From gh CLI only
octocode-cli token --type=auto        # Try octocode-cli first, then gh CLI

# Show token with source info
octocode-cli token --source

# Force re-authentication
octocode-cli logout && octocode-cli login

# Switch GitHub accounts
octocode-cli auth  # Select "Switch account"
```

### Token Sources

Octocode CLI manages its own tokens separately from the `gh` CLI:

| Source | Description | When to Use |
|--------|-------------|-------------|
| `octocode` (default) | Token stored by `octocode-cli login` | Most users |
| `gh` | Token from `gh auth login` | If using gh CLI already |
| `auto` | Tries octocode first, falls back to gh CLI | Scripting/automation |

### Required Scopes

The OAuth flow requests these GitHub scopes:
- `repo` - Full repository access
- `read:org` - Read organization membership
- `gist` - Gist access

## 📋 Requirements

- **Node.js** >= 18.0.0

## 🔧 Troubleshooting

### Node.js Issues

If you encounter issues with Node.js or npm, run the following command to diagnose problems:

```bash
npx node-doctor
```

This will check your Node.js environment and help identify common issues with your installation.

### Authentication Issues

| Issue | Solution |
|-------|----------|
| "Token expired" | Run `octocode-cli login` to re-authenticate |
| "Not authenticated" | Run `octocode-cli login` |
| "Refresh token expired" | Run `octocode-cli logout && octocode-cli login` |
| Browser doesn't open | Copy the URL shown in terminal and open manually |
| GitHub Enterprise issues | Use `--hostname your-ghe.com` flag |

**Reset credentials completely:**

```bash
# Remove stored credentials
rm -rf ~/.octocode

# Re-authenticate
octocode-cli login
```

**Check credential file location:**

```bash
octocode-cli status
# Shows: Credentials: ~/.octocode/credentials.json
```

## 🔗 Links

- [Octocode Website](https://octocode.ai)
- [octocode-cli on NPM](https://www.npmjs.com/package/octocode-cli)
- [octocode-mcp on NPM](https://www.npmjs.com/package/octocode-mcp)
- [GitHub Repository](https://github.com/bgauryy/octocode-mcp)

## 📄 License

PolyForm-Small-Business-1.0.0

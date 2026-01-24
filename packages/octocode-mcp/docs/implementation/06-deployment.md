# Deployment Guide

## Overview

This guide covers installation, configuration, deployment, and operational considerations for Octocode MCP. Whether you're a developer setting up locally or deploying for a team, this documentation provides complete instructions for all deployment scenarios.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [Authentication Setup](#authentication-setup)
4. [MCP Client Integration](#mcp-client-integration)
5. [Environment Configuration](#environment-configuration)
6. [System Dependencies](#system-dependencies)
7. [Graceful Shutdown](#graceful-shutdown)
8. [Troubleshooting](#troubleshooting)
9. [Production Deployment](#production-deployment)
10. [Performance Tuning](#performance-tuning)

---

## Prerequisites

### Minimum Requirements

**Operating System:**
- macOS 10.15+ (Catalina or later)
- Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)
- Windows 10/11 (WSL2 recommended for best experience)

**Node.js:**
- **Version:** >= 20.0.0 (LTS recommended)
- **Why:** Native ESM support, performance improvements, security updates

**Memory:**
- **Minimum:** 512 MB RAM
- **Recommended:** 1 GB RAM for better performance
- **Peak usage:** ~150 MB under normal load

**Disk Space:**
- **Installation:** ~50 MB for Octocode MCP
- **Dependencies:** ~150 MB for node_modules
- **Total:** ~200 MB

**Network:**
- Internet connection required for:
  - GitHub/GitLab API access
  - NPM/PyPI package lookups
  - Initial installation (npm/npx)

### Verify Prerequisites

```bash
# Check Node.js version
node --version
# Should output: v20.x.x or higher

# Check npm version
npm --version
# Should output: v10.x.x or higher

# Check system memory
# macOS/Linux
free -h
# Windows (PowerShell)
systeminfo | findstr "Memory"

# Check disk space
df -h .
```

---

## Installation Methods

### Method 1: Interactive CLI Installer (Recommended)

The easiest and most reliable installation method.

**What it does:**
- Detects installed MCP clients (Claude Desktop, Cursor, Windsurf, etc.)
- Verifies Node.js version and environment
- Configures MCP server for each detected client
- Handles GitHub authentication via OAuth
- Validates configuration

**Installation:**

```bash
npx octocode-cli
```

**Interactive Flow:**

```
┌─────────────────────────────────────────────────┐
│  Welcome to Octocode MCP Installer              │
└─────────────────────────────────────────────────┘

✓ Node.js v20.10.0 detected
✓ npm v10.2.3 detected

Detecting installed MCP clients...
✓ Found: Claude Desktop
✓ Found: Cursor IDE
✓ Found: Windsurf

Select clients to configure:
  [x] Claude Desktop
  [x] Cursor IDE
  [ ] Windsurf

Checking authentication...
  [ ] GitHub CLI (gh)
  [ ] Environment variable (GITHUB_TOKEN)
  [ ] Octocode OAuth

Choose authentication method:
  > Octocode OAuth (Recommended)
    GitHub CLI
    Manual token entry

Configuring Octocode OAuth...
✓ Opening browser for authentication
✓ Authorization complete
✓ Token stored securely

Configuring Claude Desktop...
✓ Config written to: ~/Library/Application Support/Claude/claude_desktop_config.json

Configuring Cursor IDE...
✓ Config written to: ~/.cursor/config/mcp.json

Installation complete!

Next steps:
  1. Restart your MCP clients
  2. Check for "octocode" in the tools list
  3. Try: "Search for React hooks in facebook/react"
```

**Benefits:**
- Zero manual configuration
- Handles edge cases automatically
- Validates setup before completion
- Most reliable method

---

### Method 2: Standalone Binary (No Node.js Required)

For environments without Node.js or for maximum portability.

**Installation Script:**

```bash
curl -fsSL https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/install/install.sh | sh
```

**What the script does:**

1. Detects your operating system and architecture
2. Downloads the appropriate binary:
   - `octocode-mcp-darwin-arm64` (macOS Apple Silicon)
   - `octocode-mcp-darwin-x64` (macOS Intel)
   - `octocode-mcp-linux-x64` (Linux x86_64)
   - `octocode-mcp-linux-arm64` (Linux ARM64)
   - `octocode-mcp-windows-x64.exe` (Windows)
3. Installs to `~/.local/bin/octocode-mcp`
4. Makes executable
5. Adds to PATH if needed

**Manual Binary Installation:**

```bash
# Download binary for your platform
# macOS ARM64 (M1/M2/M3)
curl -L https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-arm64 -o octocode-mcp

# macOS x64 (Intel)
curl -L https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-x64 -o octocode-mcp

# Linux x64
curl -L https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-linux-x64 -o octocode-mcp

# Make executable
chmod +x octocode-mcp

# Move to PATH
sudo mv octocode-mcp /usr/local/bin/

# Verify installation
octocode-mcp --version
```

**Binary Configuration:**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "/usr/local/bin/octocode-mcp",
      "args": []
    }
  }
}
```

**Benefits:**
- No Node.js dependency
- Smaller download size
- Faster startup time
- Self-contained executable

---

### Method 3: NPM/NPX (Node.js Required)

Standard Node.js package installation.

**NPX (Recommended for always-latest):**

```bash
# Uses the latest version every time
npx octocode-mcp@latest
```

**Global Installation:**

```bash
# Install globally
npm install -g octocode-mcp

# Run
octocode-mcp

# Update
npm update -g octocode-mcp

# Uninstall
npm uninstall -g octocode-mcp
```

**Local Installation (Development):**

```bash
# Install in project
npm install octocode-mcp

# Add to package.json scripts
{
  "scripts": {
    "mcp": "octocode-mcp"
  }
}

# Run
npm run mcp
```

**Benefits:**
- Easy updates
- Version management
- Integration with npm ecosystem

---

### Method 4: From Source (Development)

For contributors or developers needing the latest changes.

**Clone and Build:**

```bash
# Clone repository
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp

# Install dependencies
yarn install

# Build
yarn build

# Run
node packages/octocode-mcp/dist/index.js

# Or use development mode
cd packages/octocode-mcp
yarn build:watch  # Rebuild on changes
```

**Development Scripts:**

```bash
# Lint
yarn lint

# Type check
yarn typecheck

# Run tests
yarn test

# Run with coverage
yarn test:coverage

# Debug mode
OCTOCODE_DEBUG=true node dist/index.js
```

**Benefits:**
- Latest features
- Development workflow
- Contribution capability

---

## Authentication Setup

### GitHub Authentication

**Option 1: GitHub CLI (Recommended)**

```bash
# Install GitHub CLI
# macOS
brew install gh

# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
  sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" | \
  sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Windows
choco install gh

# Authenticate
gh auth login

# Follow prompts:
# ? What account do you want to log into? GitHub.com
# ? What is your preferred protocol for Git operations? HTTPS
# ? Authenticate Git with your GitHub credentials? Yes
# ? How would you like to authenticate GitHub CLI? Login with a web browser

# Verify
gh auth status
```

**Option 2: Personal Access Token**

```bash
# 1. Create token at: https://github.com/settings/tokens
# 2. Required scopes:
#    - repo (Full control of private repositories)
#    - read:user (Read user profile data)
#    - read:org (Read org and team membership)

# 3. Set environment variable
export GITHUB_TOKEN="ghp_your_token_here"

# 4. Add to shell profile (permanent)
# ~/.bashrc or ~/.zshrc
echo 'export GITHUB_TOKEN="ghp_your_token_here"' >> ~/.bashrc
source ~/.bashrc
```

**Option 3: Octocode CLI OAuth (Most Secure)**

```bash
# Run installer
npx octocode-cli

# Select "Octocode OAuth" authentication
# Browser opens for GitHub authorization
# Tokens stored securely in system keychain
```

**Token Resolution Priority:**

```
1. Octocode storage (from octocode-cli OAuth)
   ↓ (if not found)
2. GITHUB_TOKEN environment variable
   ↓ (if not found)
3. GitHub CLI (gh auth token)
   ↓ (if not found)
4. No authentication (limited functionality)
```

**Verify Authentication:**

```bash
# With GitHub CLI
gh auth status

# With Octocode CLI
npx octocode-cli
# Select "Check GitHub Auth Status"

# Manual check
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user
```

---

### GitLab Authentication

**For GitLab SaaS (gitlab.com):**

```bash
# 1. Create Personal Access Token
# Visit: https://gitlab.com/-/profile/personal_access_tokens
# Scopes: api, read_api, read_user, read_repository

# 2. Set environment variable
export GITLAB_TOKEN="glpat_your_token_here"

# 3. Add to shell profile
echo 'export GITLAB_TOKEN="glpat_your_token_here"' >> ~/.bashrc
```

**For Self-Hosted GitLab:**

```bash
# 1. Create token on your GitLab instance
# Visit: https://gitlab.your-company.com/-/profile/personal_access_tokens

# 2. Set token and host
export GITLAB_TOKEN="glpat_your_token_here"
export GITLAB_HOST="https://gitlab.your-company.com"

# 3. Add to shell profile
echo 'export GITLAB_TOKEN="glpat_your_token_here"' >> ~/.bashrc
echo 'export GITLAB_HOST="https://gitlab.your-company.com"' >> ~/.bashrc
```

**GitLab Configuration Example:**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat_your_token_here",
        "GITLAB_HOST": "https://gitlab.your-company.com"
      }
    }
  }
}
```

---

## MCP Client Integration

### Claude Desktop

**Configuration File Location:**

```bash
# macOS
~/Library/Application Support/Claude/claude_desktop_config.json

# Windows
%APPDATA%/Claude/claude_desktop_config.json

# Linux
~/.config/Claude/claude_desktop_config.json
```

**Basic Configuration:**

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

**With Environment Variables:**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "OCTOCODE_DEBUG": "false"
      }
    }
  }
}
```

**Restart Claude Desktop:**

```bash
# macOS
killall Claude && open -a Claude

# Windows
# Close Claude from system tray, then reopen

# Linux
pkill claude && claude
```

**Verification:**

1. Open Claude Desktop
2. Start a new conversation
3. Look for tool availability indicator
4. Try: "Search for useState in facebook/react"
5. Claude should use octocode MCP tools

---

### Cursor IDE

**Configuration Location:**

```bash
# macOS
~/.cursor/config/mcp.json

# Windows
%USERPROFILE%\.cursor\config\mcp.json

# Linux
~/.cursor/config/mcp.json
```

**Configuration:**

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

**Quick Install Button:**

Visit Cursor marketplace or use the install button in README:
```
[Install in Cursor] → Automatically configures MCP server
```

**Verification:**

1. Restart Cursor IDE
2. Open command palette (Cmd/Ctrl + Shift + P)
3. Type "MCP" to see available commands
4. Check MCP status in status bar

---

### Windsurf

**Configuration:**

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

**Installation Steps:**

1. Open Windsurf settings
2. Navigate to MCP section
3. Add new server with above configuration
4. Restart Windsurf

---

### VS Code (with Cline/Roo-Cline)

**Install Cline Extension:**

```bash
# Search in VS Code extensions
# Install: "Cline" by Anthropic

# Or via command line
code --install-extension anthropic.cline
```

**Configure MCP:**

1. Open Cline settings
2. Add MCP server configuration
3. Restart VS Code

**Configuration:**

```json
{
  "cline.mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

---

### Command Line Tools

**Claude Code CLI:**

```bash
# Add MCP server
claude mcp add octocode npx octocode-mcp@latest

# List servers
claude mcp list

# Remove server
claude mcp remove octocode

# Test connection
claude mcp test octocode
```

**Amp CLI:**

```bash
# Add server
amp mcp add octocode -- npx octocode-mcp@latest

# List
amp mcp list

# Remove
amp mcp remove octocode
```

**Codex CLI:**

```bash
# Add server
codex mcp add octocode npx "octocode-mcp@latest"

# List
codex mcp list

# Remove
codex mcp remove octocode
```

---

## Environment Configuration

### Complete Environment Variables Reference

**GitHub Configuration:**

```bash
# Authentication
GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Custom API endpoint (for GitHub Enterprise)
GITHUB_API_URL="https://github.company.com/api/v3"
```

**GitLab Configuration:**

```bash
# Authentication
GITLAB_TOKEN="glpat_xxxxxxxxxxxxxxxxxxxxx"
# Alternative variable name
GL_TOKEN="glpat_xxxxxxxxxxxxxxxxxxxxx"

# Custom host (for self-hosted GitLab)
GITLAB_HOST="https://gitlab.company.com"
```

**Tool Configuration:**

```bash
# Exclusive mode: ONLY enable these tools
TOOLS_TO_RUN="githubSearchCode,localSearchCode,lspGotoDefinition"

# Additive mode: ADD these tools to defaults
ENABLE_TOOLS="lspFindReferences,lspCallHierarchy"

# Subtractive mode: REMOVE these tools from enabled
DISABLE_TOOLS="githubSearchRepositories,packageSearch"
```

**Network Configuration:**

```bash
# Request timeout (milliseconds, min: 5000, max: 300000)
REQUEST_TIMEOUT="30000"  # 30 seconds

# Max retries for failed requests (min: 0, max: 10)
MAX_RETRIES="3"
```

**Telemetry & Logging:**

```bash
# Disable telemetry
OCTOCODE_TELEMETRY_DISABLED="true"  # or "false", "1", "0"

# Enable/disable logging
LOG="true"  # or "false", "1", "0"

# Enable debug logging
OCTOCODE_DEBUG="true"
# Alternative debug flag
DEBUG="octocode:*"
```

**Security Configuration:**

```bash
# Additional allowed root paths (comma-separated)
ALLOWED_PATHS="/custom/path1,/custom/path2,/opt/projects"
```

**LSP Configuration:**

```bash
# Per-language language server paths
OCTOCODE_TS_SERVER_PATH="/usr/local/bin/typescript-language-server"
OCTOCODE_PYTHON_SERVER_PATH="/usr/local/bin/pylsp"
OCTOCODE_GO_SERVER_PATH="/usr/local/bin/gopls"
OCTOCODE_RUST_SERVER_PATH="/usr/local/bin/rust-analyzer"
# ... 40+ more language-specific variables

# Custom LSP config file
OCTOCODE_LSP_CONFIG="/path/to/lsp-servers.json"
```

**Example .env File:**

```bash
# .env
# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GitLab (optional)
GITLAB_TOKEN=glpat_xxxxxxxxxxxxxxxxxxxxx
GITLAB_HOST=https://gitlab.company.com

# Tools
DISABLE_TOOLS=packageSearch

# Network
REQUEST_TIMEOUT=30000
MAX_RETRIES=3

# Debugging
OCTOCODE_DEBUG=false
LOG=true

# Security
ALLOWED_PATHS=/Users/username/projects,/opt/repos
```

**Loading .env in MCP Config:**

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "GITLAB_TOKEN": "${GITLAB_TOKEN}"
      }
    }
  }
}
```

---

## System Dependencies

### Required Dependencies

**ripgrep (rg)** - For `localSearchCode` tool

```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep

# Fedora/RHEL
sudo dnf install ripgrep

# Arch Linux
sudo pacman -S ripgrep

# Windows
choco install ripgrep
# Or via Scoop
scoop install ripgrep

# Verify
rg --version
```

**find command** - For `localFindFiles` tool

```bash
# Usually pre-installed on Unix/Linux/macOS
which find
# Should output: /usr/bin/find

# Windows: Use Git Bash or WSL2
```

### Optional Dependencies (LSP)

**TypeScript/JavaScript:**

```bash
# Install TypeScript Language Server
npm install -g typescript-language-server typescript

# Verify
typescript-language-server --version
```

**Python:**

```bash
# Install Python LSP Server
pip install python-lsp-server[all]

# Or with specific plugins
pip install "python-lsp-server[rope,pyflakes,mccabe]"

# Verify
pylsp --version
```

**Go:**

```bash
# Install gopls
go install golang.org/x/tools/gopls@latest

# Add to PATH if needed
export PATH="$PATH:$(go env GOPATH)/bin"

# Verify
gopls version
```

**Rust:**

```bash
# Install rust-analyzer (via rustup)
rustup component add rust-analyzer

# Or standalone
cargo install rust-analyzer

# Verify
rust-analyzer --version
```

**Java:**

```bash
# Install Eclipse JDT Language Server
# Download from: https://github.com/eclipse/eclipse.jdt.ls

# Or via Homebrew (macOS)
brew install jdtls

# Verify
jdtls --version
```

**Other Languages:**

See [LSP Tools Documentation](./05-lsp-tools.md) for complete list of supported language servers and installation instructions.

---

## Graceful Shutdown

Octocode MCP implements graceful shutdown to ensure:
- All resources are cleaned up
- Caches are flushed
- API clients are closed properly
- No data loss or corruption

### Shutdown Triggers

**1. SIGINT (Ctrl+C):**

```bash
# User presses Ctrl+C in terminal
^C
[octocode] Shutting down (signal: SIGINT)
[octocode] Memory at shutdown: 145MB heap, 180MB RSS
[octocode] Clearing caches...
[octocode] Closing API clients...
[octocode] Shutdown complete
```

**2. SIGTERM (Kill signal):**

```bash
# System sends termination signal
kill <pid>
# Or
killall octocode-mcp

[octocode] Shutting down (signal: SIGTERM)
[octocode] Shutdown complete
```

**3. STDIN_CLOSE (Client disconnect):**

```bash
# MCP client closes connection
[octocode] Shutting down (signal: STDIN_CLOSE)
[octocode] Client disconnected, cleaning up...
[octocode] Shutdown complete
```

**4. Uncaught Exception:**

```bash
# Unexpected error occurs
[octocode] Uncaught exception: <error message>
[octocode] Shutting down (signal: UNCAUGHT_EXCEPTION)
[octocode] Shutdown complete
```

**5. Unhandled Rejection:**

```bash
# Promise rejection not handled
[octocode] Unhandled rejection: <reason>
[octocode] Shutting down (signal: UNHANDLED_REJECTION)
[octocode] Shutdown complete
```

### Shutdown Sequence

```mermaid
sequenceDiagram
    participant S as Signal Handler
    participant GS as Graceful Shutdown
    participant C as Cache
    participant O as Octokit Clients
    participant MCP as MCP Server
    participant P as Process

    S->>GS: Trigger shutdown
    GS->>GS: Set inProgress flag
    GS->>GS: Start 5s timeout
    GS->>GS: Log memory usage
    GS->>C: clearAllCache()
    C-->>GS: Caches cleared
    GS->>O: clearOctokitInstances()
    O-->>GS: Clients closed
    GS->>MCP: server.close()
    MCP-->>GS: Server closed
    GS->>GS: Clear timeout
    GS->>P: process.exit(0)
```

### Shutdown Timeout

```typescript
const SHUTDOWN_TIMEOUT_MS = 5000; // 5 seconds

// If cleanup takes longer than 5 seconds, force exit
setTimeout(() => {
  console.error('Shutdown timeout exceeded');
  process.exit(1);
}, SHUTDOWN_TIMEOUT_MS);
```

### Cleanup Operations

**1. Cache Cleanup:**

```typescript
// Clear all HTTP response caches
clearAllCache();
// - Removes all cached API responses
// - Frees memory
// - No data loss (cache is transient)
```

**2. Client Cleanup:**

```typescript
// Close all Octokit instances
clearOctokitInstances();
// - Closes HTTP connections
// - Cancels pending requests
// - Releases resources
```

**3. Config Cleanup:**

```typescript
// Cleanup configuration
cleanup();
// - Resets config state
// - Clears sensitive data from memory
```

**4. MCP Server Close:**

```typescript
// Close MCP server gracefully
await server.close();
// - Closes stdio transport
// - Notifies clients of shutdown
// - Waits for pending responses
```

### Memory Usage Logging

During shutdown, memory usage is logged for debugging:

```javascript
const memUsage = process.memoryUsage();
console.log({
  heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
  heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
  rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
});

// Example output:
// Memory at shutdown: { heapUsed: 145MB, heapTotal: 180MB, rss: 220MB }
```

---

## Troubleshooting

### Common Issues

**1. "No GitHub token available"**

```bash
# Check if token is set
echo $GITHUB_TOKEN
# Empty? Set it:
export GITHUB_TOKEN="ghp_xxxxx"

# Or use GitHub CLI
gh auth login

# Or use Octocode CLI
npx octocode-cli
```

**2. "Command not found: rg"**

```bash
# Install ripgrep
brew install ripgrep        # macOS
sudo apt install ripgrep    # Ubuntu/Debian
```

**3. "Tool not registered"**

```bash
# Check tool configuration
# Is tool disabled?
echo $DISABLE_TOOLS

# Enable specific tool
export ENABLE_TOOLS="localSearchCode"
```

**4. "Rate limit exceeded"**

```bash
# Check rate limit status
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Wait for reset, or use authenticated requests
# Authenticated: 5000/hour
# Unauthenticated: 60/hour
```

**5. "Language server not found"**

```bash
# Check if language server is installed
which typescript-language-server
which pylsp
which gopls

# Install missing server
npm install -g typescript-language-server

# Override path
export OCTOCODE_TS_SERVER_PATH="/usr/local/bin/typescript-language-server"
```

**6. "Permission denied" errors**

```bash
# Check file permissions
ls -la $(which octocode-mcp)

# Make executable
chmod +x /path/to/octocode-mcp

# Check PATH
echo $PATH
```

**7. "Module not found" errors**

```bash
# Reinstall dependencies
npm install -g octocode-mcp

# Or use npx to always get latest
npx octocode-mcp@latest
```

### Debug Mode

```bash
# Enable debug logging
export OCTOCODE_DEBUG=true

# Or use DEBUG flag
export DEBUG="octocode:*"

# Run with debug
npx octocode-mcp@latest

# Output will include:
# - Detailed request/response logs
# - Cache hit/miss information
# - Provider selection logic
# - Tool execution traces
```

### Logs Location

```bash
# Session logs (if telemetry enabled)
~/.octocode/logs/

# MCP client logs
# Claude Desktop
~/Library/Logs/Claude/

# Cursor
~/.cursor/logs/

# Check MCP client logs for connection issues
```

---

## Production Deployment

### Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache ripgrep git

# Install language servers (optional)
RUN npm install -g typescript-language-server typescript

# Install octocode-mcp
RUN npm install -g octocode-mcp@latest

# Set working directory
WORKDIR /app

# Expose environment variables
ENV GITHUB_TOKEN=""

# Run MCP server
CMD ["octocode-mcp"]
```

**Build and Run:**

```bash
# Build image
docker build -t octocode-mcp:latest .

# Run container
docker run -d \
  --name octocode-mcp \
  -e GITHUB_TOKEN="${GITHUB_TOKEN}" \
  -v /path/to/code:/workspace:ro \
  octocode-mcp:latest

# Check logs
docker logs octocode-mcp

# Stop container
docker stop octocode-mcp
```

### Systemd Service

**Service file:** `/etc/systemd/system/octocode-mcp.service`

```ini
[Unit]
Description=Octocode MCP Server
After=network.target

[Service]
Type=simple
User=octocode
Group=octocode
WorkingDirectory=/opt/octocode-mcp
Environment="GITHUB_TOKEN=ghp_xxxxx"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npx octocode-mcp@latest
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable octocode-mcp

# Start service
sudo systemctl start octocode-mcp

# Check status
sudo systemctl status octocode-mcp

# View logs
sudo journalctl -u octocode-mcp -f
```

### PM2 Process Manager

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'octocode-mcp',
    script: 'npx',
    args: 'octocode-mcp@latest',
    env: {
      GITHUB_TOKEN: 'ghp_xxxxx',
      NODE_ENV: 'production'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup PM2 startup script
pm2 startup

# View logs
pm2 logs octocode-mcp

# Monitor
pm2 monit

# Restart
pm2 restart octocode-mcp
```

---

## Performance Tuning

### Memory Optimization

```bash
# Limit Node.js heap size
NODE_OPTIONS="--max-old-space-size=512" npx octocode-mcp@latest

# Monitor memory usage
watch -n 5 'ps aux | grep octocode-mcp'
```

### Cache Configuration

```bash
# Adjust cache TTLs via code
# src/utils/http/cache.ts
const CACHE_TTL_CONFIG = {
  'gh-api-code': 7200,      // Increase to 2 hours
  'gh-api-repos': 14400,    // Increase to 4 hours
  // ...
};
```

### Request Optimization

```bash
# Increase timeout for slow networks
REQUEST_TIMEOUT="60000"  # 60 seconds

# Reduce retries for faster failures
MAX_RETRIES="1"
```

### Concurrent Requests

```bash
# Default: Sequential bulk operations
# For better performance, tools execute queries in parallel internally

# Example: 3 queries execute concurrently
{
  "queries": [
    { "owner": "facebook", "repo": "react" },
    { "owner": "vuejs", "repo": "vue" },
    { "owner": "angular", "repo": "angular" }
  ]
}
```

---

## Health Checks

### Manual Health Check

```bash
# Test MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx octocode-mcp@latest

# Should output list of tools
```

### Automated Health Check Script

```bash
#!/bin/bash
# health-check.sh

# Check if process is running
if ! pgrep -f "octocode-mcp" > /dev/null; then
  echo "ERROR: Octocode MCP not running"
  exit 1
fi

# Check memory usage
MEM=$(ps aux | grep octocode-mcp | grep -v grep | awk '{print $6}')
MAX_MEM=500000  # 500MB in KB

if [ "$MEM" -gt "$MAX_MEM" ]; then
  echo "WARNING: Memory usage high: ${MEM}KB"
fi

# Check GitHub API access
if ! curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user > /dev/null; then
  echo "ERROR: GitHub API not accessible"
  exit 1
fi

echo "OK: Octocode MCP healthy"
exit 0
```

---

## Backup and Recovery

### Configuration Backup

```bash
# Backup MCP configs
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json \
   ~/backups/claude_config_$(date +%Y%m%d).json

# Backup environment
env | grep -E "GITHUB|GITLAB|OCTOCODE" > ~/backups/env_$(date +%Y%m%d).txt
```

### Recovery

```bash
# Restore config
cp ~/backups/claude_config_20240101.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Restart client
killall Claude && open -a Claude
```

---

## Conclusion

Octocode MCP deployment is straightforward with multiple installation methods to suit different environments. The system is designed for:

- **Easy installation** - Interactive CLI, standalone binary, or npm
- **Flexible authentication** - Multiple token sources with fallback
- **Universal compatibility** - Works with any MCP-compatible client
- **Graceful operation** - Proper shutdown and resource cleanup
- **Production ready** - Docker, systemd, PM2 support
- **Developer friendly** - Debug mode, comprehensive logging

For issues or questions:
- GitHub Issues: https://github.com/bgauryy/octocode-mcp/issues
- Documentation: https://octocode.ai/docs
- Community: Discord server (link in README)

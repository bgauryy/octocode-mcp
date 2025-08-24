# Octocode MCP Installation Guide

Comprehensive installation and configuration guide for Octocode MCP Server.

## Quick Start

```bash
# Install globally
npm install -g octocode-mcp

# Or run directly  
npx octocode-mcp

# With Docker
docker run -i --rm -e GITHUB_TOKEN=your_token octocode/octocode-mcp:latest
```

Octocode requires a GitHub token at startup. If no token is available, it will fail fast during initialization.

## Authentication Methods

Octocode resolves your token in the following priority order:

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable  
3. GitHub CLI token (`gh auth token`)
4. `Authorization` environment variable (with Bearer or token prefix)

## Available Tools

Octocode MCP provides 7 tools organized into default and optional categories:

### Default Tools (Enabled Automatically)

These tools are enabled by default and require no configuration:

- ✅ **`githubSearchCode`** - Semantic code search across repositories
- ✅ **`githubGetFileContent`** - File content retrieval with partial access  
- ✅ **`githubViewRepoStructure`** - Repository structure exploration
- ✅ **`githubSearchRepositories`** - Repository discovery and exploration

### Optional Tools (Disabled by Default)

These tools can be enabled using `ENABLE_TOOLS`:

- ➕ **`githubSearchCommits`** - Commit history and change analysis
- ➕ **`githubSearchPullRequests`** - Pull request analysis with diff content
- ➕ **`packageSearch`** - NPM and Python package discovery

## Tool Configuration

Control which tools are active using environment variables:

```bash
# Enable additional tools (adds to default tools)
export ENABLE_TOOLS="githubSearchCommits,packageSearch"

# Disable default tools (removes from enabled tools)  
export DISABLE_TOOLS="githubViewRepoStructure"

# Legacy support (backward compatibility)
export TOOLS_TO_RUN="githubSearchCode,githubGetFileContent"
```

### Configuration Examples

```bash
# Default setup (no configuration needed)
# Active: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchRepositories

# Add commit and package search
export ENABLE_TOOLS="githubSearchCommits,packageSearch"
# Active: all default tools + githubSearchCommits + packageSearch

# Remove repository structure tool
export DISABLE_TOOLS="githubViewRepoStructure"
# Active: githubSearchCode, githubGetFileContent, githubSearchRepositories

# Full feature set
export ENABLE_TOOLS="githubSearchCommits,githubSearchPullRequests,packageSearch"
# Active: all tools enabled

# Minimal code-focused setup
export DISABLE_TOOLS="githubSearchRepositories"
export ENABLE_TOOLS="githubSearchCommits"
# Active: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchCommits
```

### Tool Priority Logic

1. **Default tools** are enabled automatically (isDefault: true)
2. **ENABLE_TOOLS** adds additional tools to the active set
3. **DISABLE_TOOLS** removes tools from the final set (takes priority)

**Note**: Tool configuration changes require restarting the MCP server.

## Setup Methods

### Method 1: GitHub CLI (Recommended for Development)

The GitHub CLI provides the easiest authentication for local development:

**Installation:**
```bash
# macOS
brew install gh

# Ubuntu/Debian  
sudo apt update && sudo apt install gh

# Windows (winget)
winget install GitHub.cli

# Windows (scoop)
scoop install gh

# Other platforms: https://github.com/cli/cli#installation
```

**Authentication:**
```bash
# Authenticate with GitHub
gh auth login
# Choose: GitHub.com → HTTPS → Yes (Git credential helper) → Login via web browser

# Verify authentication
gh auth status
# Should show: ✓ Logged in to github.com as <username>

# Test token (shows first 5 characters)
gh auth token | head -c 5 && echo '*****'

# Verify API access
gh api user --jq '.login'
```

**Complete CLI Setup:**
```bash
# 1. Install and authenticate GitHub CLI
gh auth login && gh auth status

# 2. Optional: Enable additional tools  
export ENABLE_TOOLS="githubSearchCommits,packageSearch"

# 3. Optional: Enable beta features
export BETA=true

# 4. Run Octocode MCP
npx octocode-mcp
```

### Method 2: Environment Variables

For production deployments and advanced use cases:

```bash
# Create Personal Access Token at:
# GitHub Settings → Developer settings → Personal access tokens (classic)

# Set environment variable
export GITHUB_TOKEN="ghp_your_personal_access_token_here"

# Verify token works
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user | jq .login
```

**Required Token Scopes:**
- `public_repo` (for public repositories)
- `repo` (for private repositories)  
- `read:org` (for organization repositories)
- `read:user` (for user information)

### Method 3: Authorization Header

Alternative environment variable format:

```bash
# With Bearer prefix
export Authorization="Bearer ghp_your_token_here"

# With token prefix  
export Authorization="token ghp_your_token_here"

# Without prefix (automatically detected)
export Authorization="ghp_your_token_here"
```

## Complete Configuration Reference

### Authentication Variables

```bash
# Primary token sources (priority order)
export GITHUB_TOKEN="your_github_token"        # Highest priority
export GH_TOKEN="your_github_token"            # Alternative env var
# GitHub CLI: gh auth token                     # Automatic fallback
export Authorization="Bearer your_token"       # Alternative format
```

### Tool Management Variables

```bash
# Tool configuration
export ENABLE_TOOLS="githubSearchCommits,packageSearch"           # Add tools
export DISABLE_TOOLS="githubViewRepoStructure"                    # Remove tools
export TOOLS_TO_RUN="githubSearchCode,githubGetFileContent"       # Legacy support
```

### Performance & Reliability Variables

```bash
# Request configuration
export REQUEST_TIMEOUT=30000                   # Request timeout in ms (1000-300000)
export MAX_RETRIES=3                          # Max retry attempts (0-10)
```

### Logging & Debugging Variables

```bash
# Audit logging
export ENABLE_LOGGING=true                    # Enable audit logging
export AUDIT_LOG_DIR="./logs/audit"          # Custom log directory
```

### Beta Features Variables

```bash
# Experimental features
export BETA=true                              # Enable all beta features
# When enabled provides:
# - Advanced sampling capabilities  
# - Experimental tool features
# - Enhanced debugging information
```

### Application Variables

```bash
# Environment control
export NODE_ENV="production"                  # Node.js environment
```

## Validation & Troubleshooting

### Token Validation

```bash
# Test GitHub API access
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Test CLI token
gh auth status && gh api user --jq '.login'

# Check token scopes
curl -I -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user \
  | grep -i x-oauth-scopes
```

### Configuration Validation

Invalid configurations are automatically corrected with warnings:
- Request timeout below 1000ms → reset to 30000ms
- Max retries outside 0-10 range → reset to 3
- Invalid tool names → ignored with warnings

### Common Issues

**Authentication Errors:**
```bash
# 401 Unauthorized - Invalid token
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# 403 Forbidden - Insufficient scopes  
# Solution: Regenerate token with required scopes

# No token found
# Solution: Set GITHUB_TOKEN or authenticate with GitHub CLI
```

**Tool Registration Errors:**
```bash
# Check tool configuration
echo "Enabled: $ENABLE_TOOLS"  
echo "Disabled: $DISABLE_TOOLS"

# Valid tool names:
# githubSearchCode, githubGetFileContent, githubViewRepoStructure,
# githubSearchRepositories, githubSearchCommits, githubSearchPullRequests, packageSearch
```

**Performance Issues:**
```bash
# Increase timeout for slow connections
export REQUEST_TIMEOUT=60000

# Adjust retry behavior
export MAX_RETRIES=5
```

## Production Deployment

### Docker

```bash
# Basic container
docker run -i --rm \
  -e GITHUB_TOKEN=your_token \
  octocode/octocode-mcp:latest

# With custom configuration
docker run -i --rm \
  -e GITHUB_TOKEN=your_token \
  -e ENABLE_TOOLS="githubSearchCommits,packageSearch" \
  -e REQUEST_TIMEOUT=60000 \
  -e BETA=true \
  octocode/octocode-mcp:latest
```

### Environment Files

```bash
# .env file
GITHUB_TOKEN=your_github_token_here
ENABLE_TOOLS=githubSearchCommits,packageSearch
REQUEST_TIMEOUT=45000
MAX_RETRIES=5
BETA=true
ENABLE_LOGGING=true
AUDIT_LOG_DIR=./logs/audit

# Load and run
set -a && source .env && set +a
npx octocode-mcp
```

### Recommended Production Settings

```bash
# Security
export GITHUB_TOKEN="your_production_token"    # Use environment variable, not CLI
                                               
# Performance  
export REQUEST_TIMEOUT=45000                   # 45 second timeout
export MAX_RETRIES=5                          # Higher retry count

# Monitoring
export ENABLE_LOGGING=true                    # Enable audit logs
export AUDIT_LOG_DIR="/var/log/octocode"     # Centralized logging

# Features (optional)
export ENABLE_TOOLS="githubSearchCommits,packageSearch"
export BETA=false                            # Disable experimental features
```

This configuration provides comprehensive coverage of all available options based on the actual source code implementation.

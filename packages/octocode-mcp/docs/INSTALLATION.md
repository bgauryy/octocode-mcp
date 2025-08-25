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

Octocode MCP supports three distinct configuration modes for controlling which tools are active:

### Configuration Modes

#### Mode 1: Default Configuration (No Custom Settings)
When no tool configuration is provided, only default tools are enabled:

```bash
# No configuration needed - runs default tools automatically
# Active: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchRepositories
```

#### Mode 2: Exclusive Mode (TOOLS_TO_RUN)
Run ONLY the specified tools, ignoring all defaults and other settings:

```bash
# Run ONLY these tools (truly exclusive)
export TOOLS_TO_RUN="githubSearchCode,packageSearch"
# Active: ONLY githubSearchCode and packageSearch
# Note: ENABLE_TOOLS and DISABLE_TOOLS are completely ignored in this mode
```

#### Mode 3: Additive/Subtractive Mode (ENABLE_TOOLS/DISABLE_TOOLS)
Modify the default tool set by adding or removing specific tools:

```bash
# Add tools to defaults
export ENABLE_TOOLS="githubSearchCommits,packageSearch"
# Active: all default tools + githubSearchCommits + packageSearch

# Remove tools from defaults
export DISABLE_TOOLS="githubViewRepoStructure"
# Active: all default tools except githubViewRepoStructure

# Combined: add some, remove others
export ENABLE_TOOLS="githubSearchCommits"
export DISABLE_TOOLS="githubSearchRepositories"
# Active: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchCommits
```

### Configuration Examples

```bash
# Example 1: Default setup
# (no environment variables)
# Result: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchRepositories

# Example 2: Exclusive mode - only code search and package search
export TOOLS_TO_RUN="githubSearchCode,packageSearch"
# Result: ONLY githubSearchCode, packageSearch

# Example 3: Exclusive mode - minimal setup
export TOOLS_TO_RUN="githubSearchCode,githubGetFileContent"
# Result: ONLY githubSearchCode, githubGetFileContent

# Example 4: Additive mode - add commit search
export ENABLE_TOOLS="githubSearchCommits"
# Result: all defaults + githubSearchCommits

# Example 5: Subtractive mode - remove repo structure
export DISABLE_TOOLS="githubViewRepoStructure"
# Result: all defaults except githubViewRepoStructure

# Example 6: Combined additive/subtractive
export ENABLE_TOOLS="githubSearchCommits,packageSearch"
export DISABLE_TOOLS="githubSearchRepositories"
# Result: githubSearchCode, githubGetFileContent, githubViewRepoStructure, githubSearchCommits, packageSearch

# Example 7: Full feature set (additive mode)
export ENABLE_TOOLS="githubSearchCommits,githubSearchPullRequests,packageSearch"
# Result: all 7 tools enabled
```

### Configuration Mode Priority

1. **TOOLS_TO_RUN** (Mode 2): If set, runs ONLY these tools. All other configuration is ignored.
2. **ENABLE_TOOLS/DISABLE_TOOLS** (Mode 3): If TOOLS_TO_RUN is not set, modifies default tools.
3. **Default Mode** (Mode 1): If no configuration is provided, runs default tools only.

### Important Notes

- **Mode 2 is truly exclusive**: When `TOOLS_TO_RUN` is set, `ENABLE_TOOLS` and `DISABLE_TOOLS` are completely ignored.
- **Tool names must be exact**: Use the exact tool names listed in the Available Tools section.
- **Configuration changes require restart**: Tool configuration is read at server startup.
- **Invalid tool names are ignored**: Misspelled or non-existent tool names are silently ignored.

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
# Mode 2: Exclusive mode - run ONLY these tools (ignores all other configuration)
export TOOLS_TO_RUN="githubSearchCode,packageSearch"             # Exclusive tool list

# Mode 3: Additive/subtractive mode - modify default tools (only works when TOOLS_TO_RUN is not set)
export ENABLE_TOOLS="githubSearchCommits,packageSearch"           # Add tools to defaults
export DISABLE_TOOLS="githubViewRepoStructure"                    # Remove tools from defaults
```

### Performance & Reliability Variables

```bash
# Request configuration
export REQUEST_TIMEOUT=30000                   # Request timeout in ms (1000-300000)
export MAX_RETRIES=3                          # Max retry attempts (0-10)
```

### Logging & Debugging Variables

```bash
# Logging
export ENABLE_LOGGING=true                    # Enable logging
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
export ENABLE_LOGGING=true                    # Enable logs

# Features (optional)
export ENABLE_TOOLS="githubSearchCommits,packageSearch"
export BETA=false                            # Disable experimental features
```

This configuration provides comprehensive coverage of all available options based on the actual source code implementation.

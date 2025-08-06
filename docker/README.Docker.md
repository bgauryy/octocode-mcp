# Docker Setup for Octocode MCP

This guide explains how to run Octocode MCP in a Docker container with proper **GitHub authentication** and **npm package research** capabilities for both development and CI/CD environments.

## Table of Contents
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Authentication Setup](#authentication-setup)
  - [GitHub Authentication](#github-authentication)
  - [NPM Authentication](#npm-authentication)
- [Installation & Building](#installation--building)
- [Running Options](#running-options)
  - [Option 1: Helper Script (Recommended)](#option-1-helper-script-recommended)
  - [Option 2: Docker Compose](#option-2-docker-compose)
  - [Option 3: Manual Docker Run](#option-3-manual-docker-run)
- [MCP Server Integration](#mcp-server-integration)
- [CI/CD Integration](#cicd-integration)
- [Configuration Files](#configuration-files)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

For the impatient, here's the fastest way to get started:

```bash
# 1. Set GitHub token (get one at https://github.com/settings/tokens)
export GITHUB_TOKEN="your_github_token_here"

# 2. Clone and build
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp

# 3. Run with helper script
chmod +x docker/docker-run.sh
./docker/docker-run.sh
```

---

## Prerequisites

Ensure you have the following installed and configured:

### Required
- **Docker** (version 20.10+)
  ```bash
  docker --version
  ```

### Optional but Recommended
- **Node.js 18+** (for local development)
  ```bash
  node --version
  ```

- **GitHub Personal Access Token** (for GitHub API access)
  - Create at: https://github.com/settings/tokens
  - Required permissions: `repo`, `read:org`, `read:user`

- **NPM authentication** (for package research)
  ```bash
  npm whoami
  ```

---

## Authentication Setup

### GitHub Authentication

GitHub authentication is handled via Personal Access Tokens:

#### Creating a GitHub Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Select the following permissions:
   - `repo` (for private repositories)
   - `read:org` (for organization access)
   - `read:user` (for user information)
4. Copy the generated token

#### Using the Token
Set the token as an environment variable:

```bash
# Export for current session
export GITHUB_TOKEN="ghp_yourtoken"

# Or add to your shell profile
echo 'export GITHUB_TOKEN="ghp_yourtoken"' >> ~/.bashrc

# For Docker run
docker run -e GITHUB_TOKEN=ghp_yourtoken ...

# For environment file
echo "GITHUB_TOKEN=ghp_yourtoken" > .env
```

### NPM Authentication

For npm package research functionality:

#### Local Setup
```bash
# Create npm token at https://www.npmjs.com/settings/tokens
export NPM_TOKEN="your_npm_token"
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
chmod 600 ~/.npmrc
```

#### Container Setup
The `.npmrc` file is automatically mounted at runtime:
```bash
-v ~/.npmrc:/home/nodejs/.npmrc:ro
```

---

## Installation & Building

### Clone Repository
```bash
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp
```

### Build Docker Image
```bash
docker build -t octocode-mcp:latest -f docker/Dockerfile .
```

**Build Arguments** (optional):
```bash
docker build \
  --build-arg NODE_ENV=production \
  -t octocode-mcp:latest \
  -f docker/Dockerfile .
```

---

## Running Options

### Option 1: Helper Script (Recommended)

The helper script automatically handles token validation and container setup:

```bash
# Set your GitHub token first
export GITHUB_TOKEN="your_token_here"

chmod +x docker/docker-run.sh
./docker/docker-run.sh
```

**Features:**
- ✅ Validates GitHub token availability
- ✅ Builds Docker image if needed
- ✅ Passes environment variables securely
- ✅ Provides colored output and error handling

### Option 2: Docker Compose

For persistent container management:

```bash
# Start the service
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# Stop the service
docker-compose -f docker/docker-compose.yml down
```

**Environment Variables:**
```bash
# Create .env file for docker-compose
echo "GITHUB_TOKEN=your_github_token" > .env
echo "NPM_TOKEN=your_npm_token" >> .env
```

### Option 3: Manual Docker Run

For full control over container execution:

```bash
docker run -it --rm \
    --name octocode-mcp \
    -e GITHUB_TOKEN="your_github_token" \
    -e NPM_TOKEN="your_npm_token" \
    -v ~/.npmrc:/home/nodejs/.npmrc:ro \
    -v ~/.gitconfig:/home/nodejs/.gitconfig:ro \
    -v ~/.ssh:/home/nodejs/.ssh:ro \
    --network host \
    -e NODE_ENV=production \
    octocode-mcp:latest
```

**Configuration Explained:**
- `-e GITHUB_TOKEN` - GitHub API authentication
- `-e NPM_TOKEN` - NPM authentication (optional)
- `~/.npmrc` - NPM configuration file
- `~/.gitconfig` - Git configuration
- `~/.ssh` - SSH keys for private repositories

---

## MCP Server Integration

### Using the MCP Wrapper Script

The wrapper script integrates Octocode MCP with Claude Desktop. Set your tokens first:

```bash
# Set environment variables for the wrapper
export GITHUB_TOKEN="your_github_token"
export NPM_TOKEN="your_npm_token"  # optional

chmod +x docker/mcp-docker-wrapper.sh
```

### Claude Desktop Configuration

#### Automatic Setup
```bash
claude mcp add octocode-docker ./docker/mcp-docker-wrapper.sh
```

#### Manual Configuration
Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "octocode-docker": {
      "command": "/absolute/path/to/octocode-mcp/docker/mcp-docker-wrapper.sh"
    }
  }
}
```

#### Alternative JSON Configuration
Use the provided configuration file (requires environment variables to be set):

```json
{
  "octocode-mcp-docker": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm",
      "-e", "GITHUB_TOKEN",
      "-e", "GH_TOKEN", 
      "-e", "NPM_TOKEN",
      "-v", "${HOME}/.gitconfig:/home/nodejs/.gitconfig:ro",
      "-v", "${HOME}/.ssh:/home/nodejs/.ssh:ro",
      "-v", "${HOME}/.npmrc:/home/nodejs/.npmrc:ro",
      "--network", "host",
      "octocode-mcp:latest"
    ]
  }
}
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Octocode MCP Docker
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup NPM authentication
        run: |
          echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
      
      - name: Build Docker image
        run: docker build -t octocode-mcp:latest -f docker/Dockerfile .
      
      - name: Run tests in container
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          docker run --rm \
            -e GITHUB_TOKEN \
            -e NPM_TOKEN \
            -v ~/.npmrc:/home/nodejs/.npmrc:ro \
            octocode-mcp:latest npm test
```

### Required Secrets
Add these secrets to your repository:
- `GITHUB_TOKEN` - GitHub personal access token
- `NPM_TOKEN` - NPM authentication token

---

## Configuration Files

### Dockerfile
- **Base Image:** `node:18-alpine`
- **Installed Tools:** Git, Bash (GitHub CLI removed)
- **User:** Non-root `nodejs` user (UID 1001)
- **Port:** 3000 (configurable)
- **Authentication:** Token-based via environment variables

### docker-compose.yml
- **Service Name:** `octocode-mcp`
- **Network Mode:** Host (for compatibility)
- **Restart Policy:** `unless-stopped`
- **Authentication:** Environment variables for tokens

### Helper Scripts
- `docker-run.sh` - Interactive development runner
- `mcp-docker-wrapper.sh` - MCP server integration
- `docker-mcp-config.json` - Claude Desktop configuration

---

## Security Best Practices

### File Permissions
```bash
# Secure npm configuration
chmod 600 ~/.npmrc

# Secure SSH keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
```

### Container Security
- ✅ Uses non-root user (`nodejs`)
- ✅ Read-only mounts for sensitive configs (`:ro`)
- ✅ Minimal base image (`alpine`)
- ✅ No hardcoded secrets in Dockerfile

### Token Management
- 🔄 Rotate tokens regularly (every 90 days)
- 🔒 Use repository secrets for CI/CD
- 🚫 Never commit tokens to version control
- 📝 Use minimal required permissions

### Network Security
- Uses `--network host` for compatibility
- Consider using custom networks for production deployments
- Firewall rules should restrict container access

---

## Troubleshooting

### Common Issues

#### GitHub Authentication Fails
```bash
# Check if token is set
echo $GITHUB_TOKEN

# Test token validity
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Verify token permissions at:
# https://github.com/settings/tokens
```

#### NPM Token Issues
```bash
# Check npm authentication
npm whoami

# Verify .npmrc file
cat ~/.npmrc

# Test token validity
npm view lodash version
```

#### Container Build Fails
```bash
# Clear Docker cache
docker system prune -f

# Rebuild with no cache
docker build --no-cache -t octocode-mcp:latest -f docker/Dockerfile .

# Check Docker disk space
docker system df
```

#### MCP Server Not Detected
```bash
# Verify wrapper script permissions
ls -la docker/mcp-docker-wrapper.sh
chmod +x docker/mcp-docker-wrapper.sh

# Test wrapper script manually
./docker/mcp-docker-wrapper.sh

# Check Claude Desktop logs
tail -f ~/.config/claude/logs/claude_desktop.log
```

#### Container Networking Issues
```bash
# Test without host networking
docker run --rm octocode-mcp:latest ping google.com

# Check port conflicts
netstat -tulpn | grep :3000

# Use bridge networking if host mode fails
docker run --rm -p 3000:3000 octocode-mcp:latest
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment
export DEBUG=octocode:*
export NODE_ENV=development

# Run with debug output
docker run --rm \
  -e DEBUG \
  -e NODE_ENV \
  octocode-mcp:latest
```

### Getting Help

1. **Check logs:** `docker logs octocode-mcp`
2. **Verify configuration:** Review mounted volumes and environment variables
3. **Test authentication:** Run auth commands inside container
4. **Create issue:** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)

---

This comprehensive setup ensures secure, reliable operation of Octocode MCP in containerized environments with token-based GitHub authentication and NPM integration for both development and production workflows.
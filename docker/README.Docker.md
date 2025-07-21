# Docker Setup for Octocode MCP

This comprehensive guide explains how to run Octocode MCP in a Docker container while maintaining full access to your host machine's GitHub CLI authentication, and how to integrate it with MCP clients like Claude Desktop.

## Table of Contents
- [Prerequisites](#prerequisites)
- [How GitHub CLI Works with Docker](#how-github-cli-works-with-docker)
- [Installation](#installation)
- [Running Octocode MCP in Docker](#running-octocode-mcp-in-docker)
- [Installing as MCP Server](#installing-as-mcp-server)
- [Understanding the Architecture](#understanding-the-architecture)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

Before you begin, ensure you have:

1. **Docker installed** on your host machine
   ```bash
   # Verify Docker installation
   docker --version
   ```

2. **GitHub CLI authenticated** on your host
   ```bash
   # Check authentication status
   gh auth status
   
   # If not authenticated, login first
   gh auth login
   ```

3. **Git configured** (for repository access)
   ```bash
   git config --global user.name
   git config --global user.email
   ```

4. **NPM authenticated** (optional, for package searches)
   ```bash
   npm whoami
   ```

## How GitHub CLI Works with Docker

The Docker container **cannot** directly execute the `gh` command from your host machine due to container isolation. Instead, our setup:

1. **Installs GitHub CLI inside the container** - The container has its own `gh` binary
2. **Mounts your host's GitHub credentials** - We share `~/.config/gh` which contains your authentication tokens
3. **Preserves your authentication** - The container's `gh` uses your host's tokens, maintaining all your permissions

This approach means:
- ✅ Full access to your private repositories
- ✅ Organization permissions are preserved
- ✅ No need to re-authenticate inside the container
- ✅ Secure, read-only access to credentials

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp
```

### Step 2: Build the Docker Image

```bash
# Build the Docker image with Node.js 18 (< 20 as required)
# Run from the project root directory
docker build -t octocode-mcp:latest -f docker/Dockerfile .

# Or from the docker directory
cd docker
docker build -t octocode-mcp:latest -f Dockerfile ..
```

This creates a Docker image that:
- Uses Node.js 18 Alpine (lightweight and secure)
- Installs GitHub CLI inside the container
- Builds the Octocode MCP server
- Runs as a non-root user for security

## Running Octocode MCP in Docker

You have three options to run the container:

### Option 1: Using the Helper Script (Recommended)

```bash
# Make the script executable (first time only)
chmod +x docker/docker-run.sh

# Run the container
./docker/docker-run.sh
```

The script automatically:
- Checks if GitHub CLI is authenticated
- Builds the image if needed
- Mounts all necessary configurations
- Provides colored output for better visibility

### Option 2: Using Docker Compose

```bash
# From project root
docker-compose -f docker/docker-compose.yml up --build

# Or from docker directory
cd docker
docker-compose up --build

# Run in background
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# Stop the service
docker-compose -f docker/docker-compose.yml down
```

### Option 3: Manual Docker Command

```bash
docker run -it \
    --name octocode-mcp \
    --rm \
    -v ~/.config/gh:/home/nodejs/.config/gh:ro \
    -v ~/.gitconfig:/home/nodejs/.gitconfig:ro \
    -v ~/.ssh:/home/nodejs/.ssh:ro \
    -v ~/.npmrc:/home/nodejs/.npmrc:ro \
    --network host \
    octocode-mcp:latest
```

## Installing as MCP Server

To use the Docker version with Claude Desktop or other MCP clients:

### Step 1: Create the MCP Wrapper Script

The repository includes `docker/mcp-docker-wrapper.sh` which handles the Docker integration:

```bash
#!/bin/bash
# This script is already included in the docker directory

# Make it executable
chmod +x docker/mcp-docker-wrapper.sh
```

### Step 2: Install in Claude Desktop

#### Option A: Using Claude CLI (Recommended)

```bash
# Navigate to the octocode-mcp directory
cd /path/to/octocode-mcp

# Add to Claude Desktop
claude mcp add octocode-docker ./docker/mcp-docker-wrapper.sh
```

#### Option B: Manual Configuration

Add to your MCP configuration file (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "octocode-docker": {
      "command": "/absolute/path/to/octocode-mcp/docker/mcp-docker-wrapper.sh"
    }
  }
}
```

### Step 3: Restart Claude Desktop

After adding the configuration, restart Claude Desktop to load the new MCP server.

### Step 4: Verify Installation

In Claude Desktop, you should see "octocode-docker" in your available MCP servers. Test it by asking:
- "Check octocode MCP status"
- "Search for React hooks implementations on GitHub"

## Understanding the Architecture

### Container Structure

```
Docker Container
├── Node.js 18 Runtime
├── GitHub CLI (installed in container)
├── Octocode MCP Server (built from source)
└── Mounted Volumes (read-only)
    ├── ~/.config/gh → /home/nodejs/.config/gh
    ├── ~/.gitconfig → /home/nodejs/.gitconfig
    ├── ~/.ssh → /home/nodejs/.ssh
    └── ~/.npmrc → /home/nodejs/.npmrc
```

### Communication Flow

```
Claude Desktop → MCP Protocol → Docker Container → GitHub CLI (in container)
                                                 ↓
                                          Uses mounted credentials
                                                 ↓
                                            GitHub API
```

### Volume Mounts Explained

1. **`~/.config/gh`**: Contains GitHub OAuth tokens
   - Required for API authentication
   - Mounted read-only for security

2. **`~/.gitconfig`**: Git configuration
   - User identity for commits
   - Repository-specific settings

3. **`~/.ssh`**: SSH keys (optional)
   - For private repository access via SSH
   - Only needed if using SSH URLs

4. **`~/.npmrc`**: NPM configuration
   - For authenticated package searches
   - Optional, only if using NPM features

## Security Considerations

### Built-in Security Features

1. **Read-only mounts**: All configuration files are mounted as read-only (`:ro`)
2. **Non-root user**: Container runs as `nodejs` user (UID 1001)
3. **No credential storage**: No secrets are baked into the image
4. **Network isolation options**: Can be configured without `--network host` if using PATs

### Best Practices

1. **Regular Updates**
   ```bash
   # Pull latest changes
   git pull
   
   # Rebuild image (from project root)
   docker build -t octocode-mcp:latest -f docker/Dockerfile .
   ```

2. **Credential Rotation**
   - Regularly refresh GitHub tokens: `gh auth refresh`
   - Update npm tokens when needed

3. **Access Control**
   - Ensure proper file permissions:
   ```bash
   chmod 600 ~/.ssh/id_*
   chmod 644 ~/.ssh/*.pub
   chmod 600 ~/.npmrc
   chmod 600 ~/.config/gh/hosts.yml
   ```

## Troubleshooting

### Common Issues and Solutions

#### 1. GitHub CLI Authentication Errors

**Symptom**: "Error: GitHub CLI is not authenticated"

**Solution**:
```bash
# On host machine
gh auth status
gh auth login  # If not authenticated
```

#### 2. Permission Denied Errors

**Symptom**: "Permission denied" when accessing mounted files

**Solution**:
```bash
# Fix file permissions
chmod -R 600 ~/.config/gh
chmod 644 ~/.gitconfig
```

#### 3. Container Can't Connect to GitHub

**Symptom**: Network errors when accessing GitHub

**Solution**:
- Ensure `--network host` is used (for OAuth flow)
- Or use Personal Access Token:
```bash
docker run -it \
    -e GH_TOKEN=ghp_yourtoken \
    ... (other options)
```

#### 4. MCP Connection Failed

**Symptom**: Claude Desktop can't connect to the server

**Solution**:
- Check wrapper script is executable: `chmod +x docker/mcp-docker-wrapper.sh`
- Verify absolute paths in configuration
- Check Docker daemon is running: `docker ps`

### Debug Mode

To debug issues, run with verbose output:

```bash
# Modify wrapper script temporarily
docker run -i --rm \
    -e DEBUG=1 \
    -e NODE_ENV=development \
    ... (other options)
```

## Advanced Configuration

### Using Environment Variables

Create a `.env` file for custom configuration:

```bash
# .env
GH_TOKEN=ghp_yourtoken
NPM_TOKEN=npm_yourtoken
NODE_ENV=production
```

Then use with Docker:
```bash
docker run -it \
    --env-file .env \
    ... (other options)
```

### Resource Limits

For production environments:

```bash
docker run -it \
    --memory="1g" \
    --cpus="1.0" \
    --pids-limit 100 \
    ... (other options)
```

### Custom Networks

For enhanced security without host network:

```bash
# Create custom network
docker network create octocode-net

# Run with custom network
docker run -it \
    --network octocode-net \
    -e GH_TOKEN=ghp_yourtoken \
    ... (other options)
```

### Multi-Architecture Support

Build for different architectures:

```bash
# Build for ARM64 (Apple Silicon)
docker buildx build --platform linux/arm64 -t octocode-mcp:arm64 .

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 -t octocode-mcp:latest .
```

## FAQ

**Q: Can I use this without mounting my GitHub config?**
A: Yes, use environment variables with Personal Access Tokens instead of OAuth.

**Q: Is my GitHub token exposed to the container?**
A: The token is accessible inside the container but mounted read-only. The container runs as non-root for additional security.

**Q: Can I use this with GitHub Enterprise?**
A: Yes, ensure your `gh` CLI is configured for your enterprise instance before mounting.

**Q: How do I update to the latest version?**
A: Pull the latest code and rebuild: `git pull && docker build -t octocode-mcp:latest -f docker/Dockerfile .`

## Support

- **Issues**: [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **Documentation**: [Main README](./README.md)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)

---

*This Docker setup ensures Octocode MCP runs consistently across different environments while maintaining secure access to your GitHub resources.*
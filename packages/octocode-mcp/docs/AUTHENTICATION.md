# 🔐 Authentication Guide

**Octocode-MCP** authentication setup guide.

## 🔐 Required GitHub Scopes (and Why)

Octocode MCP performs read-only analysis across repositories. It never writes to GitHub.

Recommended minimum scopes:

| Scope | Why it's needed | Features enabled |
|------|------------------|------------------|
| `repo` (or fine‑grained: Contents: Read, Metadata: Read, Pull requests: Read) | Read private repository contents and metadata | Code search, file fetch, repo structure, PR search for private repos |
| `read:user` | Identify the authenticated user and validate token | User context, rate limit checks, token validation |
| `read:org` | Verify organization membership and team policies | Enterprise org/teams validation, policy enforcement |

Notes:
- For classic PATs, use `repo` + `read:user` + `read:org`.
- For Fine‑grained PATs, prefer read‑only permissions: Repository contents (Read), Metadata (Read), Pull requests (Read). Do not grant write scopes.

## 🔧 Local Setup (Requires Node.js > 20)

### Option 1: GitHub CLI (Recommended)

Install and authenticate with GitHub CLI ([Installation Guide](https://github.com/cli/cli#installation)):

```bash
# Install GitHub CLI
brew install gh  # macOS
# or
sudo apt install gh  # Ubuntu
# or
winget install --id GitHub.cli  # Windows

# Authenticate with GitHub
gh auth login

# Verify authentication
gh auth status
```

Add to your MCP client configuration:
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

### Option 2: GitHub Personal Access Token

1. **Create a Personal Access Token**:
   - Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `read:user`, `read:org`
   - Copy the token

2. **Add to MCP configuration**:
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```
# 🔐 Authentication Guide

**Octocode-MCP** authentication setup and troubleshooting guide.

---

## 🔐 Required GitHub Scopes (and Why)

Octocode MCP performs **read-only analysis** across repositories. It never writes to GitHub.

### Recommended Minimum Scopes

| Scope | Why it's needed | Features enabled |
|------|------------------|------------------|
| `repo` (or fine‑grained: Contents: Read, Metadata: Read, Pull requests: Read) | Read private repository contents and metadata | Code search, file fetch, repo structure, PR search for private repos |
| `read:user` | Identify the authenticated user and validate token | User context, rate limit checks, token validation |
| `read:org` | Verify organization membership and team policies | Enterprise org/teams validation, policy enforcement |

### Notes

- **For Classic PATs**: Use `repo` + `read:user` + `read:org`
- **For Fine‑grained PATs**: Prefer read‑only permissions: Repository contents (Read), Metadata (Read), Pull requests (Read). **Do not grant write scopes.**
- **Public repositories only**: If you only need to search public repos, `public_repo` scope is sufficient instead of full `repo`

---

## 🔧 Setup Options

### Option 1: GitHub CLI (Recommended)

The GitHub CLI provides the easiest authentication method with automatic token management.

#### Install GitHub CLI

```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt install gh

# Windows
winget install --id GitHub.cli

# Other platforms
# See: https://github.com/cli/cli#installation
```

#### Authenticate

```bash
# Login to GitHub
gh auth login

# Follow the prompts:
# 1. Select "GitHub.com"
# 2. Choose "HTTPS" protocol
# 3. Authenticate via web browser
# 4. Complete authentication

# Verify authentication
gh auth status

# Expected output:
# ✓ Logged in to github.com as YOUR_USERNAME
# ✓ Git operations for github.com configured to use https protocol
# ✓ Token: *******************
```

#### Add to MCP Configuration

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

The server will automatically use the GitHub CLI token.

---

### Option 2: Personal Access Token (PAT)

For environments where GitHub CLI is not available or for CI/CD pipelines.

#### Create a Personal Access Token

1. **Go to GitHub Settings**:
   - Visit: https://github.com/settings/tokens
   - Or navigate: Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Generate New Token**:
   - Click "Generate new token (classic)"
   - Give it a descriptive name (e.g., "Octocode MCP - MacBook")
   - Set expiration (recommended: 90 days, not "No expiration")
   
3. **Select Scopes**:
   - ✅ `repo` (Full control of private repositories)
     - Or just `public_repo` if only accessing public repos
   - ✅ `read:user` (Read user profile data)
   - ✅ `read:org` (Read organization data)

4. **Generate and Copy Token**:
   - Click "Generate token"
   - **⚠️ IMPORTANT**: Copy the token immediately - you won't see it again!
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Add to MCP Configuration

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

#### Alternative: Environment Variable (for development)

```bash
# Add to ~/.zshrc or ~/.bashrc
export GITHUB_TOKEN="ghp_your_token_here"

# Reload shell
source ~/.zshrc  # or source ~/.bashrc

# Verify
echo $GITHUB_TOKEN
```

---

## 🔍 Authentication Priority

The server checks for authentication in this order:

1. **GitHub CLI** (via `gh auth token`)
   - Automatic, secure, recommended
   - No manual token management needed
   - Uses GitHub's native authentication

2. **GITHUB_TOKEN environment variable**
   - Explicit token setting
   - Good for CI/CD and automation
   - Also recognizes `GH_TOKEN` (GitHub standard variable)

If no authentication is found, the server will start but with **limited functionality** (unauthenticated rate limits apply).

---

## ✅ Testing Your Authentication

### Method 1: Start the Server

```bash
npx octocode-mcp@latest
```

Look for these log messages:
- ✅ `GitHub token ready` - Authentication successful
- ⚠️ `No GitHub token - limited functionality` - No authentication found

### Method 2: Use GitHub CLI

```bash
# Check authentication status
gh auth status

# Test API access
gh api user

# Expected: Your GitHub user information in JSON
```

### Method 3: Test with MCP Inspector

```bash
# In the octocode-mcp directory
npm install
npm run debug
```

This opens the MCP Inspector to test tools interactively.

---

## 📊 Rate Limits

Understanding GitHub API rate limits is crucial for optimal usage.

### Authenticated vs Unauthenticated

| Endpoint | Unauthenticated | Authenticated (Personal Token) | Authenticated (GitHub App) |
|----------|-----------------|-------------------------------|---------------------------|
| Search API | 10 req/min | 30 req/min | 30 req/min |
| Core API | 60 req/hour | 5,000 req/hour | 15,000 req/hour |
| GraphQL API | Not available | 5,000 points/hour | 5,000 points/hour |

### Checking Your Rate Limit

```bash
# Using GitHub CLI
gh api rate_limit

# Expected output shows remaining requests
```

### Rate Limit Best Practices

1. **Always authenticate** - 80x more requests for Core API
2. **Use bulk operations** - Process multiple queries in one request
3. **Enable caching** - Octocode MCP caches results for 24 hours
4. **Monitor usage** - Check rate limit headers in responses
5. **Schedule heavy operations** - Distribute large research tasks over time

---

## 🐛 Troubleshooting

### Problem: "No GitHub token found"

**Error Message:**
```
No GitHub token found. Please authenticate with GitHub CLI (gh auth login) or set GITHUB_TOKEN environment variable
```

**Solutions:**

1. **Check GitHub CLI authentication**:
   ```bash
   gh auth status
   # If not logged in:
   gh auth login
   ```

2. **Verify GITHUB_TOKEN**:
   ```bash
   echo $GITHUB_TOKEN
   # Should output: ghp_xxxx...
   ```

3. **Check MCP configuration**:
   - Ensure `env.GITHUB_TOKEN` is set in your MCP client config
   - Verify no typos in environment variable name

---

### Problem: "Bad credentials" or 401 Unauthorized

**Possible Causes:**

1. **Token expired** - Personal access tokens have expiration dates
2. **Token revoked** - Check https://github.com/settings/tokens
3. **Invalid token** - Token may be corrupted or incorrectly copied

**Solutions:**

1. **Regenerate token**:
   - Go to https://github.com/settings/tokens
   - Delete old token
   - Generate new token with same scopes
   - Update environment variable or MCP config

2. **Re-authenticate GitHub CLI**:
   ```bash
   gh auth logout
   gh auth login
   ```

---

### Problem: "API rate limit exceeded" or 403 Forbidden

**Error Message:**
```
API rate limit exceeded. Please wait before making more requests.
```

**Solutions:**

1. **Wait for rate limit reset**:
   ```bash
   gh api rate_limit
   # Check "reset" timestamp
   ```

2. **Ensure you're authenticated** - Authenticated limits are 80x higher

3. **Use bulk operations** - Reduce number of API calls

4. **Enable caching** - Octocode MCP caches results by default

---

### Problem: "Resource not found" or 404

**Possible Causes:**

1. **Repository is private** - Token needs `repo` scope
2. **Repository doesn't exist** - Check owner/repo names
3. **Organization access** - May need `read:org` scope

**Solutions:**

1. **Verify token scopes**:
   ```bash
   # Check token permissions
   gh auth status
   ```

2. **Check repository exists**:
   ```bash
   gh repo view owner/repo
   ```

3. **Confirm access permissions** - Ensure you have access to the repository

---

### Problem: Server starts but tools don't work

**Symptoms:**
- Server starts successfully
- Tools return empty results or errors
- "Limited functionality" warning

**Solutions:**

1. **Check token in environment**:
   ```bash
   # See what the server sees
   env | grep GITHUB_TOKEN
   ```

2. **Restart MCP client** - After setting environment variables

3. **Clear cache**:
   ```bash
   # The server caches tokens
   # Restart to pick up new token
   ```

---

## 🏢 Enterprise GitHub Setup

### GitHub Enterprise Server

If using GitHub Enterprise Server (not GitHub.com):

1. **Set Enterprise URL**:
   ```json
   {
     "mcpServers": {
       "octocode": {
         "command": "npx",
         "args": ["octocode-mcp@latest"],
         "env": {
           "GITHUB_TOKEN": "your_token",
           "GITHUB_API_URL": "https://github.your-company.com/api/v3"
         }
       }
     }
   }
   ```

2. **Use Enterprise token** - Generate token from your Enterprise instance

3. **Check connectivity** - Ensure network access to Enterprise server

---

## 🔒 Security Best Practices

### Token Security

1. **Never commit tokens** - Add `.env` to `.gitignore`
2. **Use environment variables** - Don't hardcode tokens in scripts
3. **Rotate tokens regularly** - Set 90-day expiration
4. **Use minimal scopes** - Only grant necessary permissions
5. **Revoke unused tokens** - Clean up old tokens at https://github.com/settings/tokens

### Token Storage

✅ **Good:**
- GitHub CLI (most secure, managed by GitHub)
- Environment variables in shell config
- MCP client configuration (if file is secured)
- Secret management tools (1Password, Vault)

❌ **Avoid:**
- Committing to version control
- Hardcoding in scripts
- Storing in plain text files
- Sharing via chat/email

---

## 📚 Additional Resources

### Documentation
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub CLI Authentication](https://cli.github.com/manual/gh_auth_login)
- [GitHub API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [Fine-grained Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)

### Support
- **Issues**: https://github.com/bgauryy/octocode-mcp/issues
- **Discussions**: https://github.com/bgauryy/octocode-mcp/discussions
- **Email**: bgauryy@gmail.com

---

## ✨ Quick Reference

### Check Authentication Status
```bash
# GitHub CLI
gh auth status

# API test
gh api user

# Rate limits
gh api rate_limit
```

### Environment Variables
```bash
# Primary token source (choose one)
export GITHUB_TOKEN="ghp_xxxx..."
# or
export GH_TOKEN="ghp_xxxx..."

# Verify
echo $GITHUB_TOKEN
```

### MCP Configuration
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxx...",
        "GITHUB_API_URL": "https://api.github.com"  // Optional: For GitHub Enterprise
      }
    }
  }
}
```

---

**Version:** 7.0.0  
**Last Updated:** October 2024  
**Node.js Requirement:** ≥ 18.12.0

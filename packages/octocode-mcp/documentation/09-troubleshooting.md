# Troubleshooting Guide

This document provides comprehensive troubleshooting information for common issues with octocode-mcp, including error codes, diagnostic procedures, and solutions.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Error Codes and Categories](#error-codes-and-categories)
3. [ToolError Class](#toolerror-class)
4. [Common Issues](#common-issues)
5. [GitHub Issues](#github-issues)
6. [GitLab Issues](#gitlab-issues)
7. [Local Tool Issues](#local-tool-issues)
8. [LSP Issues](#lsp-issues)
9. [Authentication Issues](#authentication-issues)
10. [Performance Issues](#performance-issues)
11. [Debug Mode](#debug-mode)

---

## Quick Diagnostics

### Check Server Status

```bash
# Test if server starts
npx octocode-mcp@latest

# Should see output like:
# Octocode MCP Server v11.2.2
# Listening on stdio...
```

### Check Authentication

```bash
# Interactive CLI
npx octocode-cli

# Select: Check GitHub Auth Status
# Should show token source and scopes
```

### Check Environment

```bash
# Node.js version (must be >= 18.12.0)
node --version

# GitHub CLI (optional but recommended)
gh --version

# For local tools
rg --version   # ripgrep

# For LSP tools (language-specific)
typescript-language-server --version
pylsp --version
```

### Enable Debug Logging

```bash
# Set environment variable
export OCTOCODE_DEBUG=true

# Run tool
npx octocode-mcp@latest

# Or in MCP config:
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "OCTOCODE_DEBUG": "true"
      }
    }
  }
}
```

---

## Error Codes and Categories

### Error Code Structure

Octocode-mcp uses structured error codes with categories for easy diagnosis:

```typescript
interface LocalToolErrorCode {
  code: string;              // Unique identifier (camelCase)
  category: ErrorCategory;   // Functional grouping
  description: string;       // Human-readable explanation
  recoverability: 'recoverable' | 'unrecoverable' | 'user-action-required';
}
```

### Error Categories

#### 1. FILE_SYSTEM Errors

File access and I/O errors.

| Code | Description | Recoverability | Common Cause |
|------|-------------|----------------|--------------|
| `fileAccessFailed` | Cannot access file | unrecoverable | File doesn't exist, no permission |
| `fileReadFailed` | Failed to read file | unrecoverable | I/O error, corrupted file |
| `fileTooLarge` | File exceeds size limit | user-action-required | Use line ranges or search instead |

**Example:**
```
Error: fileAccessFailed
Message: File not found: /workspace/missing.ts. Verify the path exists using localFindFiles.
Context: { path: "/workspace/missing.ts", errorCode: "ENOENT" }
```

#### 2. VALIDATION Errors

Input validation and parameter errors.

| Code | Description | Recoverability | Common Cause |
|------|-------------|----------------|--------------|
| `pathValidationFailed` | Path validation failed | user-action-required | Path outside workspace, symlink issue |

**Example:**
```
Error: pathValidationFailed
Message: Path '/etc/passwd' is outside allowed directories. Allowed roots: /workspace, /home/user
Context: { path: "/etc/passwd" }
```

#### 3. SEARCH Errors

Pattern matching and search errors.

| Code | Description | Recoverability | Common Cause |
|------|-------------|----------------|--------------|
| `noMatches` | Search pattern found no matches | user-action-required | Wrong pattern, wrong directory |

**Example:**
```
Error: noMatches
Message: No matches found for pattern 'nonexistent'
Context: { pattern: "nonexistent", path: "/workspace" }
```

#### 4. PAGINATION Errors

Output size and pagination errors.

| Code | Description | Recoverability | Common Cause |
|------|-------------|----------------|--------------|
| `outputTooLarge` | Output exceeds size limit | user-action-required | Too many results, need pagination |

**Example:**
```
Error: outputTooLarge
Message: Output too large: 150000 (limit: 100000)
Context: { size: 150000, limit: 100000 }
```

#### 5. EXECUTION Errors

Command execution and system errors.

| Code | Description | Recoverability | Common Cause |
|------|-------------|----------------|--------------|
| `commandNotAvailable` | Required command not installed | user-action-required | Missing dependency (rg, find) |
| `commandExecutionFailed` | Command execution failed | unrecoverable | System error, invalid arguments |
| `commandTimeout` | Command timed out | user-action-required | Large directory, slow filesystem |
| `toolExecutionFailed` | Generic tool failure | unrecoverable | Internal error |

**Example:**
```
Error: commandNotAvailable
Message: Command 'rg' is not available. Please install ripgrep and ensure it is in your PATH.
Context: { command: "rg", installHint: "brew install ripgrep (macOS) or apt-get install ripgrep (Linux)" }
```

### Domain-Specific Error Constants

#### Configuration Errors

```typescript
CONFIG_NOT_INITIALIZED
// Call initialize() before getServerConfig()
```

#### Fetch Errors

```typescript
FETCH_FAILED_AFTER_RETRIES
// Network issue, exceeded retry limit

FETCH_HTTP_ERROR
// HTTP error status (4xx, 5xx)
```

#### Repository Errors

```typescript
REPO_NOT_FOUND
// Repository doesn't exist or not accessible

REPO_PATH_NOT_FOUND
// File/directory doesn't exist in repository

REPO_ACCESS_FAILED
// Authentication or permission issue
```

---

## ToolError Class

### Usage

All tools should throw or return `ToolError` instances:

```typescript
throw new ToolError(
  LOCAL_TOOL_ERROR_CODES.FILE_ACCESS_FAILED,
  'Cannot access file',
  { path: filePath, errorCode: 'ENOENT' },
  originalError
);
```

### Properties

```typescript
class ToolError extends Error {
  errorCode: LocalToolErrorCode;
  category: LocalToolErrorCategory;
  recoverability: 'recoverable' | 'unrecoverable' | 'user-action-required';
  context?: Record<string, unknown>;
}
```

### Methods

```typescript
// Check if error is recoverable
error.isRecoverable(): boolean

// Check if user action is required
error.requiresUserAction(): boolean

// Convert to JSON for logging
error.toJSON(): object
```

### Factory Functions

```typescript
import { ToolErrors } from './errorCodes.js';

// Path validation error
throw ToolErrors.pathValidationFailed(
  '/etc/passwd',
  'Path outside workspace'
);

// File access error
throw ToolErrors.fileAccessFailed(
  filePath,
  new Error('ENOENT: no such file'),
  workspaceRoot
);

// File too large
throw ToolErrors.fileTooLarge(
  filePath,
  1024,  // size in KB
  100    // limit in KB
);

// Command not available
throw ToolErrors.commandNotAvailable(
  'rg',
  'Install with: brew install ripgrep'
);
```

### Error Context

All ToolErrors include context for debugging:

```typescript
try {
  const content = await fs.readFile(path);
} catch (error) {
  throw ToolErrors.fileAccessFailed(
    path,
    error as Error,
    workspaceRoot
  );
  // Context automatically includes:
  // - path
  // - errorCode (ENOENT, EACCES, etc.)
  // - Original error stack trace
}
```

---

## Common Issues

### Issue: "Configuration not initialized"

**Error Message:**
```
CONFIG_NOT_INITIALIZED: Configuration not initialized. Call initialize() and await its completion before calling getServerConfig().
```

**Cause:** Server configuration accessed before initialization complete.

**Solution:**
```typescript
// Ensure initialization completes
await initialize();

// Then access config
const config = getServerConfig();
```

### Issue: "No tools were successfully registered"

**Error Message:**
```
STARTUP_NO_TOOLS_REGISTERED: No tools were successfully registered
```

**Causes:**
1. All tools disabled via environment variables
2. GitHub token issues preventing GitHub tools
3. Missing system dependencies (rg, find)

**Diagnosis:**
```bash
# Check which tools are enabled
OCTOCODE_DEBUG=true npx octocode-mcp@latest

# Look for registration messages:
# ✓ Registered: githubSearchCode
# ✗ Skipped: localSearchCode (disabled)
```

**Solutions:**

1. **Enable tools:**
```bash
ENABLE_TOOLS="githubSearchCode,localSearchCode"
```

2. **Check authentication:**
```bash
npx octocode-cli
# Select: Check GitHub Auth Status
```

3. **Install dependencies:**
```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
apt-get install ripgrep

# Windows
choco install ripgrep
```

### Issue: "Security validation failed"

**Error Message:**
```
Security validation failed: Secrets detected in apiKey: github_token
```

**Cause:** Tool input contains detected secrets.

**Solution:**
Don't pass secrets in tool parameters. Secrets should be in environment variables or secure storage:

```json
// ❌ Bad
{
  "query": "SELECT * FROM users",
  "apiKey": "ghp_abc123xyz"
}

// ✅ Good (use environment)
{
  "query": "SELECT * FROM users"
}
```

Set secrets via environment:
```json
{
  "mcpServers": {
    "octocode": {
      "env": {
        "GITHUB_TOKEN": "ghp_abc123xyz"
      }
    }
  }
}
```

---

## GitHub Issues

### Issue: GitHub Rate Limiting

#### Primary Rate Limit

**Error Message:**
```
GitHub API rate limit exceeded. Limit resets at 2024-01-23T15:30:00.000Z (retry in 1800 seconds).

Suggestion: Authenticated requests get 5000/hour vs 60/hour for unauthenticated.
Authenticate using GitHub CLI (gh auth login) or set GITHUB_TOKEN.
```

**Causes:**
1. Too many requests in short time
2. Using unauthenticated requests (60/hour)
3. Shared IP address rate limiting

**Solutions:**

1. **Authenticate** (increases limit to 5000/hour):
```bash
gh auth login
```

2. **Check remaining quota:**
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/rate_limit
```

3. **Wait for reset** (check reset time in error message)

4. **Use caching** (enabled by default, check cache hits):
```typescript
import { getCacheStats } from './utils/http/cache.js';
console.log(getCacheStats());
```

#### Secondary Rate Limit

**Error Message:**
```
GitHub secondary rate limit triggered. Retry after 60 seconds.

Suggestion: You're making too many requests too quickly. Space out your requests or reduce concurrency.
```

**Causes:**
1. Too many concurrent requests
2. Too many writes (creating issues, PRs)
3. Heavy search queries

**Solutions:**

1. **Reduce bulk query count:**
```typescript
// Instead of 5 queries
{ queries: [q1, q2, q3, q4, q5] }

// Use 2-3 queries
{ queries: [q1, q2, q3] }
```

2. **Space out requests** (wait between tool calls)

3. **Use more specific queries** (reduces API load)

### GitHub Error Codes

| HTTP | Error Code | Meaning | Solution |
|------|------------|---------|----------|
| 401 | UNAUTHORIZED | Invalid or missing token | Check GITHUB_TOKEN, re-authenticate |
| 403 | FORBIDDEN_PERMISSIONS | Insufficient token scopes | Add required scopes (repo, read:user, read:org) |
| 403 | RATE_LIMIT_PRIMARY | Rate limit exceeded | Wait for reset or authenticate |
| 403 | RATE_LIMIT_SECONDARY | Too many requests too fast | Reduce request frequency |
| 404 | NOT_FOUND | Repository or file not found | Check owner/repo spelling, check permissions |
| 422 | VALIDATION_FAILED | Invalid query parameters | Check query syntax, filter combinations |

### Issue: Repository Not Found

**Error Message:**
```
Repository "owner/repo" not found or not accessible: 404 Not Found
```

**Causes:**
1. Repository doesn't exist
2. Repository is private (no access)
3. Typo in owner or repo name

**Diagnosis:**
```bash
# Check if repo exists and is accessible
gh repo view owner/repo

# Or via API
curl https://api.github.com/repos/owner/repo
```

**Solutions:**

1. **Verify repository name:**
```bash
# List user's repositories
gh repo list owner

# Search for repository
gh search repos "repo name"
```

2. **Check token permissions:**
```bash
# For private repositories, token needs 'repo' scope
gh auth status
```

3. **Use correct casing** (GitHub is case-sensitive):
```
facebook/React  ❌
facebook/react  ✅
```

### Issue: File Not Found in Repository

**Error Message:**
```
Path "src/missing.ts" not found in repository "owner/repo" on branch "main"
```

**Causes:**
1. File doesn't exist on specified branch
2. Wrong branch specified
3. Typo in file path

**Solutions:**

1. **Search for file first:**
```typescript
await githubSearchCode({
  queries: [{
    owner: 'owner',
    repo: 'repo',
    match: 'path',
    keywordsToSearch: ['missing']
  }]
});
```

2. **View repository structure:**
```typescript
await githubViewRepoStructure({
  queries: [{
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    path: 'src',
    depth: 2
  }]
});
```

3. **Try common branch names:**
- main (default)
- master
- develop
- dev

---

## GitLab Issues

### Issue: GitLab Authentication Failed

**Error Message:**
```
GitLab authentication failed: Invalid token
```

**Solutions:**

1. **Create Personal Access Token:**
- Go to GitLab → Preferences → Access Tokens
- Create token with 'api' scope
- Set in environment:
```bash
export GITLAB_TOKEN="glpat_your_token"
```

2. **For self-hosted GitLab:**
```bash
export GITLAB_HOST="https://gitlab.company.com"
export GITLAB_TOKEN="glpat_your_token"
```

3. **Verify token:**
```bash
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_HOST/api/v4/user"
```

### GitLab vs GitHub Differences

| Feature | GitHub | GitLab | Notes |
|---------|--------|--------|-------|
| Token Prefix | `ghp_`, `gho_` | `glpat_` | Different formats |
| Default Host | github.com | gitlab.com | GitLab can be self-hosted |
| Auth Method | OAuth, PAT, gh CLI | PAT only | GitLab simpler auth |
| Rate Limits | 5000/hour | Varies by plan | GitLab more flexible |

---

## Local Tool Issues

### Issue: "Command 'rg' is not available"

**Error Message:**
```
commandNotAvailable: Command 'rg' is not available. Please install ripgrep and ensure it is in your PATH.
```

**Solution:**

```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
apt-get install ripgrep

# Fedora
dnf install ripgrep

# Windows
choco install ripgrep
# or
scoop install ripgrep

# Verify installation
rg --version
# ripgrep 14.0.0
```

### Issue: "Path validation failed"

**Error Message:**
```
pathValidationFailed: Path '/etc/passwd' is outside allowed directories. Allowed roots: /workspace, /home/user
```

**Causes:**
1. Path outside workspace or home directory
2. Trying to access system directories
3. Symlink target outside allowed roots

**Solutions:**

1. **Add allowed path:**
```bash
ALLOWED_PATHS="/path/to/allow,/another/path" npx octocode-mcp@latest
```

Or in MCP config:
```json
{
  "mcpServers": {
    "octocode": {
      "env": {
        "ALLOWED_PATHS": "/path/to/allow,/another/path"
      }
    }
  }
}
```

2. **Check current workspace:**
```bash
# Server runs from CWD
pwd
```

3. **Use relative paths** (converted to absolute automatically):
```typescript
// Instead of absolute
path: "/etc/passwd"

// Use relative (within workspace)
path: "./src/file.ts"
```

### Issue: "File too large"

**Error Message:**
```
fileTooLarge: File too large: 5000KB (limit: 1000KB)
```

**Solutions:**

1. **Use line ranges:**
```typescript
await localGetFileContent({
  queries: [{
    path: '/workspace/large.log',
    startLine: 1,
    endLine: 100
  }]
});
```

2. **Use matchString for targeted reading:**
```typescript
await localGetFileContent({
  queries: [{
    path: '/workspace/large.log',
    matchString: 'ERROR',
    matchStringContextLines: 10
  }]
});
```

3. **Use search instead:**
```typescript
await localSearchCode({
  queries: [{
    pattern: 'ERROR',
    path: '/workspace',
    filesOnly: true  // Just find files, don't read them
  }]
});
```

### Issue: "No matches found"

**Error Message:**
```
noMatches: No matches found for pattern 'nonexistent'
```

**Diagnosis Steps:**

1. **Verify pattern syntax:**
```typescript
// Regex requires proper escaping
pattern: 'function\s+\w+'  ✅
pattern: 'function \w+'    ❌ (literal space in regex)
```

2. **Check case sensitivity:**
```typescript
// Try case-insensitive
caseInsensitive: true
```

3. **Verify path:**
```typescript
// List directory first
await localViewStructure({
  queries: [{ path: '/workspace' }]
});
```

4. **Broaden search:**
```typescript
// Remove filters
// Before:
{ pattern: 'foo', path: '/workspace/src', extension: 'ts' }

// After:
{ pattern: 'foo', path: '/workspace' }
```

---

## LSP Issues

### Issue: "LSP not available for this file"

**Error Message:**
```
LSP server not available for TypeScript files. Install with: npm install -g typescript-language-server
```

**Causes:**
1. Language server not installed
2. Language server not in PATH
3. Unsupported file type

**Solutions:**

1. **Install language server:**

```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer

# Java
# Download from https://download.eclipse.org/jdtls/snapshots/

# And 30+ more languages (see LSP_TOOLS.md)
```

2. **Verify PATH:**
```bash
which typescript-language-server
# Should show path to executable
```

3. **Custom server path:**
```bash
export OCTOCODE_TS_SERVER_PATH="/custom/path/to/typescript-language-server"
```

Or create config file `~/.octocode/lsp-servers.json`:
```json
{
  "languageServers": {
    ".ts": {
      "command": "/custom/path/to/typescript-language-server",
      "args": ["--stdio"],
      "languageId": "typescript"
    }
  }
}
```

### Issue: LSP timeout

**Error Message:**
```
LSP request timed out after 30000ms
```

**Causes:**
1. Large file being analyzed
2. Language server initializing
3. Heavy computation (e.g., finding all references in large project)

**Solutions:**

1. **Wait for initialization** (first request may be slow)

2. **Check if language server is stuck:**
```bash
# Find LSP processes
ps aux | grep "language-server"

# Kill stuck process (it will restart)
kill <pid>
```

3. **Use fallback text search** (automatic fallback if LSP fails)

### Issue: "Symbol not found"

**Error Message:**
```
Symbol 'MyFunction' not found at line 42
```

**Causes:**
1. Symbol name typo
2. Symbol defined elsewhere (import)
3. Dynamic/runtime symbol (not statically analyzable)

**Diagnosis:**

1. **Verify symbol name:**
```typescript
// Check exact spelling and casing
symbolName: 'MyFunction'  // Case-sensitive
```

2. **Check line number:**
```typescript
// Line must contain the symbol definition or usage
lineHint: 42
```

3. **Try text-based search:**
```typescript
await localSearchCode({
  queries: [{
    pattern: 'MyFunction',
    path: '/workspace'
  }]
});
```

---

## Authentication Issues

### Issue: "GitHub token not found"

**Error Message:**
```
GitHub authentication required. No token found.
```

**Resolution Order:**

Octocode-mcp checks for tokens in this order:

1. **Octocode Storage** (from `npx octocode-cli` OAuth)
2. **Environment Variable** (`GITHUB_TOKEN`)
3. **GitHub CLI** (`gh auth login`)
4. **Legacy File Storage**

**Solutions:**

1. **GitHub CLI (Recommended):**
```bash
gh auth login
# Follow prompts
# Supports 2FA and SSO
```

2. **Environment Variable:**
```json
{
  "mcpServers": {
    "octocode": {
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

3. **Octocode CLI:**
```bash
npx octocode-cli
# Select: Setup GitHub Authentication
# Follow OAuth flow
```

### Issue: "Insufficient token scopes"

**Error Message:**
```
GitHub token lacks required permissions. Your token has scopes: read:user.
Required scopes: repo, read:user, read:org
```

**Solution:**

1. **Create new token** with correct scopes:
- Go to https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scopes:
  - ✅ repo (Full control of private repositories)
  - ✅ read:user (Read user profile data)
  - ✅ read:org (Read org and team membership)
- Generate and save token

2. **Re-authenticate GitHub CLI:**
```bash
gh auth logout
gh auth login
# Select all scopes when prompted
```

---

## Performance Issues

### Issue: Slow responses

**Symptoms:**
- Tool calls take >5 seconds
- Rate limit not hit
- Network connectivity OK

**Diagnosis:**

1. **Check cache hit rate:**
```typescript
import { getCacheStats } from './utils/http/cache.js';
console.log(getCacheStats());
// Look for hitRate > 0.5 (50%)
```

2. **Enable debug logging:**
```bash
OCTOCODE_DEBUG=true
# Look for slow operations
```

3. **Check concurrency:**
```bash
# Too many concurrent requests?
# Reduce bulk query count
```

**Solutions:**

1. **Use caching** (automatic, but verify it's working)

2. **Reduce query scope:**
```typescript
// Instead of searching entire org
owner: 'microsoft'

// Search specific repo
owner: 'microsoft', repo: 'vscode'
```

3. **Use filesOnly for discovery:**
```typescript
// Fast: just find matching files
filesOnly: true

// Slow: read all matching files
filesOnly: false
```

4. **Increase request timeout:**
```bash
REQUEST_TIMEOUT=60000  # 60 seconds (default: 30s)
```

### Issue: High memory usage

**Symptoms:**
- Process using >1GB RAM
- Out of memory errors

**Causes:**
1. Large cache (maxKeys: 5000)
2. Many open LSP clients
3. Large file operations

**Solutions:**

1. **Restart server** (clears cache)

2. **Reduce cache size:**
```typescript
// Modify cache.ts
const cache = new NodeCache({
  maxKeys: 1000  // Reduced from 5000
});
```

3. **Close unused LSP clients:**
```typescript
// LSP clients auto-close after inactivity
// But can force cleanup
```

---

## Debug Mode

### Enable Debug Logging

**Environment Variable:**
```bash
OCTOCODE_DEBUG=true
```

**MCP Configuration:**
```json
{
  "mcpServers": {
    "octocode": {
      "env": {
        "OCTOCODE_DEBUG": "true"
      }
    }
  }
}
```

### What Gets Logged

With `OCTOCODE_DEBUG=true`:

1. **Token Resolution:**
```
[octocode] Resolving GitHub token...
[octocode] Token source: gh-cli
[octocode] Token scopes: repo, read:user, read:org
```

2. **Configuration:**
```
[octocode] Server config initialized
[octocode] Workspace root: /Users/dev/project
[octocode] Allowed roots: ["/Users/dev/project", "/Users/dev"]
[octocode] GitHub API URL: https://api.github.com
```

3. **Tool Registration:**
```
[octocode] Registering tools...
[octocode] ✓ Registered: githubSearchCode
[octocode] ✓ Registered: localSearchCode
[octocode] ✗ Skipped: lspGotoDefinition (LSP not available)
```

4. **Provider Creation:**
```
[octocode] Creating provider: github
[octocode] Provider cache key: github:https://api.github.com:a3f5b8c2
[octocode] Provider cached: true
```

5. **Cache Operations:**
```
[octocode] Cache lookup: v1-gh-api-code:a3f5b8c2e1d4f6a7
[octocode] Cache hit: true
[octocode] Cache stats: { hits: 45, misses: 12, hitRate: 0.789 }
```

6. **Error Handling:**
```
[octocode] Token resolution failed: Invalid token
[octocode] Security validation failed: Secrets detected in apiKey
[octocode] Path validation failed: /etc/passwd outside allowed roots
```

### Verbose Logging

For even more detail, combine with `LOG=true`:

```bash
OCTOCODE_DEBUG=true LOG=true npx octocode-mcp@latest
```

This enables:
- Session logging
- All tool calls logged with parameters
- Rate limit events
- Error events

### Reading Logs

**Session Logs Location:**
```
~/.octocode/sessions/
```

**Log Format:**
```json
{
  "timestamp": "2024-01-23T12:00:00.000Z",
  "type": "tool_call",
  "tool_name": "githubSearchCode",
  "repositories": ["facebook/react"],
  "research_goal": "Find useState implementation"
}
```

---

## Getting Help

### Before Filing an Issue

1. **Enable debug mode** and capture logs
2. **Check this troubleshooting guide**
3. **Search existing issues:** https://github.com/bgauryy/octocode-mcp/issues
4. **Verify versions:**
   ```bash
   node --version
   npx octocode-mcp@latest --version
   ```

### Filing an Issue

Include:

1. **Environment:**
   - OS and version
   - Node.js version
   - MCP client (Claude Desktop, Cursor, etc.)

2. **Configuration:**
   - MCP config (remove tokens!)
   - Environment variables (remove tokens!)

3. **Error Details:**
   - Full error message
   - Error code
   - Stack trace (if available)

4. **Debug Logs:**
   - Output with `OCTOCODE_DEBUG=true`
   - Session logs (remove sensitive info)

5. **Reproduction:**
   - Minimal steps to reproduce
   - Example query that fails
   - Expected vs actual behavior

### Community Support

- **GitHub Issues:** https://github.com/bgauryy/octocode-mcp/issues
- **Documentation:** https://github.com/bgauryy/octocode-mcp/tree/main/docs
- **MCP Docs:** https://modelcontextprotocol.io

---

## Summary

Common solutions:

1. **Authentication:** Use `gh auth login` or set `GITHUB_TOKEN`
2. **Rate Limits:** Authenticate for higher limits, reduce concurrency
3. **Path Errors:** Use `ALLOWED_PATHS` to allow additional directories
4. **Missing Commands:** Install ripgrep (`brew install ripgrep`)
5. **LSP Issues:** Install language servers (`npm i -g typescript-language-server`)
6. **Debug:** Enable `OCTOCODE_DEBUG=true` for detailed logging

Most issues are configuration-related. Check authentication first, then verify system dependencies, then enable debug logging to diagnose further.

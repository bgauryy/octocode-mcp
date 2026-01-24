# Configuration Reference

Complete guide to configuring octocode-mcp through environment variables, token management, tool filtering, and LSP server customization.

## Table of Contents

- [Overview](#overview)
- [GitHub Authentication](#github-authentication)
  - [Token Resolution Strategy](#token-resolution-strategy)
  - [Token Sources](#token-sources)
  - [Configuration Examples](#configuration-examples)
- [GitLab Configuration](#gitlab-configuration)
- [Tool Filtering](#tool-filtering)
  - [TOOLS_TO_RUN (Exclusive Mode)](#tools_to_run-exclusive-mode)
  - [ENABLE_TOOLS (Additive Mode)](#enable_tools-additive-mode)
  - [DISABLE_TOOLS (Subtractive Mode)](#disable_tools-subtractive-mode)
  - [ENABLE_LOCAL (Local Tools Toggle)](#enable_local-local-tools-toggle)
- [LSP Configuration](#lsp-configuration)
  - [Environment Variable Override](#environment-variable-override)
  - [User Configuration File](#user-configuration-file)
  - [Default Configuration](#default-configuration)
  - [Supported Languages](#supported-languages)
- [Network Configuration](#network-configuration)
- [Telemetry and Logging](#telemetry-and-logging)
- [Path Security](#path-security)
- [Complete Reference](#complete-reference)

## Overview

Octocode MCP is configured entirely through environment variables, with sensible defaults for most use cases. Configuration is read during server initialization and cannot be changed at runtime.

### Configuration Priority

1. Environment variables (highest priority)
2. User configuration files (for LSP only)
3. GitHub CLI credentials (for authentication)
4. Octocode storage (OAuth tokens)
5. Default values (lowest priority)

## GitHub Authentication

GitHub authentication is required for all GitHub tools (githubSearchCode, githubGetFileContent, etc.). The system uses a multi-source fallback strategy to find credentials.

### Token Resolution Strategy

**Resolution Order (in priority):**

1. **Octocode Storage** - Tokens from `npx octocode-cli` OAuth flow (most secure)
2. **Environment Variables** - `GITHUB_TOKEN` environment variable
3. **GitHub CLI** - Credentials from `gh auth login` command
4. **File-based** - Legacy file-based token storage (deprecated)

### Token Sources

The resolved token includes a source identifier for debugging:

| Source | Description | Priority |
|--------|-------------|----------|
| `octocode-storage` | From octocode-cli OAuth flow | 1 (highest) |
| `env:GITHUB_TOKEN` | From GITHUB_TOKEN environment variable | 2 |
| `env:*` | From other environment variables | 2 |
| `gh-cli` | From GitHub CLI authentication | 3 |
| `none` | No token found | 4 (lowest) |

### Configuration Examples

#### Method 1: GitHub CLI (Recommended for Development)

```bash
# Authenticate with GitHub CLI
gh auth login

# MCP config (no env vars needed)
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

**Advantages:**
- Simple setup
- Automatic token refresh
- Works across all GitHub tools

#### Method 2: Environment Variable

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token_here"
      }
    }
  }
}
```

**Token Scopes Required:**
- `repo` - Full access to repositories
- `read:user` - Read user profile data
- `read:org` - Read organization data

**Create Token:** https://github.com/settings/tokens

#### Method 3: Octocode CLI OAuth (Most Secure)

```bash
# Run interactive setup
npx octocode-cli

# Select "Authenticate with GitHub"
# Tokens stored securely in system keychain
```

**Advantages:**
- No token in config files
- Secure system keychain storage
- Automatic refresh
- Best for production

#### Method 4: Custom GitHub API URL

For GitHub Enterprise or custom instances:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token",
        "GITHUB_API_URL": "https://github.your-company.com/api/v3"
      }
    }
  }
}
```

### Token Resolution Implementation

```typescript
// Internal resolution process
async function resolveGitHubToken(): Promise<TokenResolutionResult> {
  // 1. Check legacy resolver (backward compatibility)
  if (_legacyResolveToken) {
    const resolved = await _legacyResolveToken();
    if (resolved?.token) {
      return { token: resolved.token, source: mapSharedSourceToInternal(resolved.source) };
    }
  }

  // 2. Attempt full token resolution (Octocode storage, env, gh-cli)
  const result = await _resolveTokenFull({
    hostname: 'github.com',
    getGhCliToken: _getGithubCLIToken,
  });

  if (result?.token) {
    return { token: result.token, source: mapSharedSourceToInternal(result.source) };
  }

  // 3. No token found
  return { token: null, source: 'none' };
}
```

### Debugging Authentication

Enable debug logging to troubleshoot authentication:

```bash
OCTOCODE_DEBUG=true npx octocode-mcp
```

Debug output shows:
- Token resolution attempts
- Resolved source
- Masked token (for security)

## GitLab Configuration

GitLab support is automatically enabled when a GitLab token is detected. All GitHub tools become GitLab tools (same API, different provider).

### Required Environment Variables

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat_your_gitlab_token_here"
      }
    }
  }
}
```

**Token Scopes Required:**
- `api` - Full API access

**Create Token:** https://gitlab.com/-/profile/personal_access_tokens

### Self-Hosted GitLab

For self-hosted instances:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat_your_token",
        "GITLAB_HOST": "https://gitlab.your-company.com"
      }
    }
  }
}
```

### Provider Selection Logic

```typescript
// Automatic provider selection
function getActiveProvider(): "github" | "gitlab" {
  if (process.env.GITLAB_TOKEN || process.env.GL_TOKEN) {
    return "gitlab";
  }
  return "github"; // default
}
```

### GitLab Client Caching

GitLab clients are cached with a 5-minute TTL:
- Cache key: `${host}:${sha256(token)}`
- Multiple clients supported (different hosts/tokens)
- Automatic cleanup of expired clients

## Tool Filtering

Control which tools are available through four environment variables: `TOOLS_TO_RUN`, `ENABLE_TOOLS`, `DISABLE_TOOLS`, and `ENABLE_LOCAL`.

### Tool Names Reference

**GitHub Tools:**
- `githubSearchCode`
- `githubGetFileContent`
- `githubViewRepoStructure`
- `githubSearchRepositories`
- `githubSearchPullRequests`
- `packageSearch`

**Local Tools:**
- `localSearchCode`
- `localGetFileContent`
- `localViewStructure`
- `localFindFiles`

**LSP Tools:**
- `lspGotoDefinition`
- `lspFindReferences`
- `lspCallHierarchy`

### TOOLS_TO_RUN (Exclusive Mode)

**Behavior:** When set, ONLY these tools are enabled (all others disabled).

**Use Case:** Lock down to specific tools for security or simplicity.

```json
{
  "env": {
    "TOOLS_TO_RUN": "githubSearchCode,localSearchCode"
  }
}
```

**Result:** Only `githubSearchCode` and `localSearchCode` are available.

### ENABLE_TOOLS (Additive Mode)

**Behavior:** Adds tools to the default enabled set.

**Use Case:** Enable additional tools beyond defaults.

```json
{
  "env": {
    "ENABLE_TOOLS": "lspGotoDefinition,lspFindReferences"
  }
}
```

**Result:** Default tools + LSP tools are available.

### DISABLE_TOOLS (Subtractive Mode)

**Behavior:** Removes specific tools from the enabled set.

**Use Case:** Disable problematic or unwanted tools.

```json
{
  "env": {
    "DISABLE_TOOLS": "githubSearchRepositories,packageSearch"
  }
}
```

**Result:** All default tools except `githubSearchRepositories` and `packageSearch`.

### ENABLE_LOCAL (Local Tools Toggle)

**Behavior:** Enable/disable ALL local tools collectively.

**Values:** `true`, `false`, `1`, `0`

**Alternative:** `LOCAL` (same behavior)

```json
{
  "env": {
    "ENABLE_LOCAL": "false"
  }
}
```

**Result:** Local tools (localSearchCode, localGetFileContent, localViewStructure, localFindFiles) are disabled.

**Affected Tools:**
- `localSearchCode`
- `localGetFileContent`
- `localViewStructure`
- `localFindFiles`

**Not Affected:** LSP tools (these are separate)

### Configuration Priority

The filtering logic applies in this order:

1. **If `TOOLS_TO_RUN` is set:** ONLY those tools are enabled (exclusive mode)
2. **Else:**
   - Start with default enabled tools from global config
   - Add tools from `ENABLE_TOOLS`
   - Remove tools from `DISABLE_TOOLS`
   - Apply `ENABLE_LOCAL` filter

### Examples

#### Example 1: GitHub-Only Mode

```json
{
  "env": {
    "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent,githubViewRepoStructure"
  }
}
```

Only GitHub code exploration tools, no local or LSP tools.

#### Example 2: Local Development Mode

```json
{
  "env": {
    "ENABLE_LOCAL": "true",
    "ENABLE_TOOLS": "lspGotoDefinition,lspFindReferences",
    "DISABLE_TOOLS": "githubSearchRepositories"
  }
}
```

All local tools + LSP navigation, but no repository search.

#### Example 3: Security-Conscious Mode

```json
{
  "env": {
    "ENABLE_LOCAL": "false",
    "DISABLE_TOOLS": "packageSearch"
  }
}
```

Only GitHub tools (no local filesystem access, no external package registries).

## LSP Configuration

Language Server Protocol (LSP) tools require language servers to be installed. Configuration is hierarchical: environment variables override config files, which override defaults.

### Configuration Methods

| Method | Priority | Use Case |
|--------|----------|----------|
| Environment Variables | Highest | Per-installation customization |
| User Config File | Medium | User-wide preferences |
| Default Config | Lowest | Built-in defaults |

### Environment Variable Override

Each language has a dedicated environment variable for server path:

**Format:** `OCTOCODE_<LANGUAGE>_SERVER_PATH`

**Examples:**

```json
{
  "env": {
    "OCTOCODE_TS_SERVER_PATH": "/usr/local/bin/typescript-language-server",
    "OCTOCODE_PYTHON_SERVER_PATH": "/opt/homebrew/bin/pylsp",
    "OCTOCODE_RUST_SERVER_PATH": "/usr/local/bin/rust-analyzer"
  }
}
```

**Available Variables:**

| Language | Environment Variable |
|----------|---------------------|
| TypeScript/JavaScript | `OCTOCODE_TS_SERVER_PATH` |
| Python | `OCTOCODE_PYTHON_SERVER_PATH` |
| Go | `OCTOCODE_GO_SERVER_PATH` |
| Rust | `OCTOCODE_RUST_SERVER_PATH` |
| Java | `OCTOCODE_JAVA_SERVER_PATH` |
| Kotlin | `OCTOCODE_KOTLIN_SERVER_PATH` |
| C/C++ | `OCTOCODE_CPP_SERVER_PATH` |
| C# | `OCTOCODE_CSHARP_SERVER_PATH` |
| Ruby | `OCTOCODE_RUBY_SERVER_PATH` |
| PHP | `OCTOCODE_PHP_SERVER_PATH` |
| Swift | `OCTOCODE_SWIFT_SERVER_PATH` |
| Dart | `OCTOCODE_DART_SERVER_PATH` |
| Lua | `OCTOCODE_LUA_SERVER_PATH` |
| Zig | `OCTOCODE_ZIG_SERVER_PATH` |
| Elixir | `OCTOCODE_ELIXIR_SERVER_PATH` |
| Scala | `OCTOCODE_SCALA_SERVER_PATH` |
| Haskell | `OCTOCODE_HASKELL_SERVER_PATH` |
| OCaml | `OCTOCODE_OCAML_SERVER_PATH` |
| Clojure | `OCTOCODE_CLOJURE_SERVER_PATH` |
| Vue | `OCTOCODE_VUE_SERVER_PATH` |
| Svelte | `OCTOCODE_SVELTE_SERVER_PATH` |
| YAML | `OCTOCODE_YAML_SERVER_PATH` |
| TOML | `OCTOCODE_TOML_SERVER_PATH` |
| JSON | `OCTOCODE_JSON_SERVER_PATH` |
| HTML | `OCTOCODE_HTML_SERVER_PATH` |
| CSS | `OCTOCODE_CSS_SERVER_PATH` |
| Bash | `OCTOCODE_BASH_SERVER_PATH` |
| SQL | `OCTOCODE_SQL_SERVER_PATH` |
| GraphQL | `OCTOCODE_GRAPHQL_SERVER_PATH` |
| Terraform | `OCTOCODE_TERRAFORM_SERVER_PATH` |

### User Configuration File

Create a JSON configuration file for user-wide settings.

**Locations (in priority order):**

1. Path specified in `OCTOCODE_LSP_CONFIG` environment variable
2. `<workspace>/.octocode/lsp-servers.json` (workspace-specific)
3. `~/.octocode/lsp-servers.json` (user global)

**Format:**

```json
{
  "languageServers": {
    ".ts": {
      "command": "/custom/path/to/typescript-language-server",
      "args": ["--stdio"],
      "languageId": "typescript"
    },
    ".tsx": {
      "command": "/custom/path/to/typescript-language-server",
      "args": ["--stdio"],
      "languageId": "typescriptreact"
    },
    ".py": {
      "command": "/opt/homebrew/bin/pylsp",
      "args": [],
      "languageId": "python"
    }
  }
}
```

**Schema:**

```typescript
interface LSPConfig {
  languageServers: {
    [extension: string]: {
      command: string;        // Executable name or path
      args: string[];         // Command-line arguments
      languageId: string;     // LSP language identifier
    }
  }
}
```

**Example: Custom Config Path**

```json
{
  "env": {
    "OCTOCODE_LSP_CONFIG": "/etc/octocode/lsp-servers.json"
  }
}
```

### Default Configuration

Built-in defaults cover 40+ languages. These are used when no override is provided.

**TypeScript/JavaScript:**
```typescript
{
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescript',
    envVar: 'OCTOCODE_TS_SERVER_PATH'
  }
}
```

**Python:**
```typescript
{
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH'
  }
}
```

**Go:**
```typescript
{
  '.go': {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
    envVar: 'OCTOCODE_GO_SERVER_PATH'
  }
}
```

**Rust:**
```typescript
{
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
    envVar: 'OCTOCODE_RUST_SERVER_PATH'
  }
}
```

### Supported Languages

**40+ Languages with LSP Support:**

| Language | Default Command | Extension(s) |
|----------|----------------|--------------|
| TypeScript | `typescript-language-server` | `.ts`, `.tsx`, `.mts`, `.cts` |
| JavaScript | `typescript-language-server` | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `pylsp` | `.py`, `.pyi` |
| Go | `gopls` | `.go` |
| Rust | `rust-analyzer` | `.rs` |
| Java | `jdtls` | `.java` |
| Kotlin | `kotlin-language-server` | `.kt`, `.kts` |
| C/C++ | `clangd` | `.c`, `.cpp`, `.cc`, `.h`, `.hpp` |
| C# | `csharp-ls` | `.cs` |
| Ruby | `solargraph` | `.rb` |
| PHP | `intelephense` | `.php` |
| Swift | `sourcekit-lsp` | `.swift` |
| Dart | `dart` | `.dart` |
| Lua | `lua-language-server` | `.lua` |
| Zig | `zls` | `.zig` |
| Elixir | `elixir-ls` | `.ex`, `.exs` |
| Scala | `metals` | `.scala`, `.sc` |
| Haskell | `haskell-language-server` | `.hs` |
| OCaml | `ocamllsp` | `.ml`, `.mli` |
| Clojure | `clojure-lsp` | `.clj`, `.cljs` |
| Vue | `vls` | `.vue` |
| Svelte | `svelteserver` | `.svelte` |
| YAML | `yaml-language-server` | `.yaml`, `.yml` |
| TOML | `taplo` | `.toml` |
| JSON | `vscode-json-languageserver` | `.json` |
| HTML | `vscode-html-languageserver` | `.html`, `.htm` |
| CSS | `vscode-css-languageserver` | `.css`, `.scss`, `.less` |
| Bash | `bash-language-server` | `.sh`, `.bash` |
| SQL | `sql-language-server` | `.sql` |
| GraphQL | `graphql-lsp` | `.graphql`, `.gql` |
| Terraform | `terraform-ls` | `.tf` |

**Installation Examples:**

```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer

# Ruby
gem install solargraph
```

### Resolution Order

For each file, the system resolves the language server in this order:

1. Check `OCTOCODE_<LANGUAGE>_SERVER_PATH` environment variable
2. Check user config file at `OCTOCODE_LSP_CONFIG` or default locations
3. Use default configuration from `LANGUAGE_SERVER_COMMANDS`
4. For TypeScript, try to resolve bundled server from `node_modules`
5. If not found, LSP tools gracefully degrade (text-based fallback)

### LSP Client Lifecycle

**Client Creation:**
- Spawned as child process when needed
- Communication via stdio (JSON-RPC)
- Separate client per file/language

**Client Caching:**
- Clients are NOT cached (new client per request)
- This ensures clean state and avoids memory leaks
- Overhead is minimal (~50-200ms startup)

**Graceful Degradation:**
- If language server not found: text-based fallback (regex matching)
- Fallback provides basic functionality without semantic understanding
- Hints indicate LSP availability status

## Network Configuration

### Request Timeout

**Default:** 120000ms (2 minutes)

```json
{
  "env": {
    "REQUEST_TIMEOUT": "60000"
  }
}
```

**Constraints:**
- Minimum: 5000ms (5 seconds)
- Maximum: 300000ms (5 minutes)

**Applies To:** All HTTP requests (GitHub API, GitLab API, package registries)

### Max Retries

**Default:** 3 retries

```json
{
  "env": {
    "MAX_RETRIES": "5"
  }
}
```

**Constraints:**
- Minimum: 0 (no retries)
- Maximum: 10 retries

**Retry Strategy:**
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, ...
- Only retries on transient errors (network, 5xx)
- Respects rate limit headers

## Telemetry and Logging

### Telemetry Control

**Default:** Enabled (from global config)

```json
{
  "env": {
    "OCTOCODE_TELEMETRY_DISABLED": "true"
  }
}
```

**Values:** `true`, `false`, `1`, `0`

**What's Disabled:**
- Anonymous usage analytics
- Error reporting
- Performance metrics

**Not Disabled:**
- Logging to stderr
- Error messages to user

### Logging

**Default:** Follows telemetry setting

```json
{
  "env": {
    "LOG": "false"
  }
}
```

**Values:** `true`, `false`, `1`, `0`

**Controls:**
- Session logging
- Tool invocation logs
- Cache statistics

### Debug Mode

**Default:** Disabled

```json
{
  "env": {
    "OCTOCODE_DEBUG": "true"
  }
}
```

**Alternative:** `DEBUG=octocode`

**Enables:**
- Verbose logging
- Token resolution debugging (masked)
- Cache hit/miss logging
- LSP client lifecycle logging
- Command execution logging

**Security Note:** Token values are always masked in logs, even in debug mode.

## Path Security

### Allowed Paths

**Default:** User's home directory and common project locations

```json
{
  "env": {
    "ALLOWED_PATHS": "/custom/project1,/custom/project2"
  }
}
```

**Format:** Comma-separated list of absolute paths

**Behavior:**
- Local tools can only access files under allowed paths
- Prevents directory traversal attacks
- Subdirectories are allowed recursively

**Default Allowed Paths:**
- `$HOME` (user home directory)
- `/tmp` (temporary files)
- Current working directory

### Path Validation

All local tool paths are validated against:
- Allowed paths whitelist
- No parent directory traversal (`..`)
- No symlink escape attempts
- Absolute path resolution

**Example Error:**

```typescript
{
  status: "error",
  error: "Path '/etc/passwd' is not allowed",
  code: "PATH_NOT_ALLOWED",
  hints: [
    "Set ALLOWED_PATHS environment variable to allow this path",
    "Example: ALLOWED_PATHS=/etc,/var/log"
  ]
}
```

## Complete Reference

### Environment Variables Summary

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GITHUB_TOKEN` | `string` | - | GitHub personal access token |
| `GITHUB_API_URL` | `string` | `https://api.github.com` | GitHub API base URL |
| `GITLAB_TOKEN` | `string` | - | GitLab personal access token |
| `GL_TOKEN` | `string` | - | Alternative GitLab token variable |
| `GITLAB_HOST` | `string` | `https://gitlab.com` | GitLab host URL |
| `TOOLS_TO_RUN` | `string` | - | Comma-separated list of tools (exclusive) |
| `ENABLE_TOOLS` | `string` | - | Comma-separated list to enable (additive) |
| `DISABLE_TOOLS` | `string` | - | Comma-separated list to disable (subtractive) |
| `ENABLE_LOCAL` | `boolean` | `true` | Enable/disable local tools |
| `LOCAL` | `boolean` | - | Alternative to ENABLE_LOCAL |
| `REQUEST_TIMEOUT` | `number` | `120000` | HTTP timeout in milliseconds (5000-300000) |
| `MAX_RETRIES` | `number` | `3` | Max retry attempts (0-10) |
| `OCTOCODE_TELEMETRY_DISABLED` | `boolean` | `false` | Disable telemetry |
| `LOG` | `boolean` | - | Enable/disable logging |
| `OCTOCODE_DEBUG` | `boolean` | `false` | Enable debug logging |
| `DEBUG` | `string` | - | Alternative debug flag (must include 'octocode') |
| `ALLOWED_PATHS` | `string` | - | Comma-separated allowed paths |
| `OCTOCODE_LSP_CONFIG` | `string` | - | Path to LSP config file |
| `OCTOCODE_*_SERVER_PATH` | `string` | - | Language server path (per language) |

### Example: Complete Configuration

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "GITHUB_API_URL": "https://api.github.com",

        "ENABLE_LOCAL": "true",
        "ENABLE_TOOLS": "lspGotoDefinition,lspFindReferences",
        "DISABLE_TOOLS": "packageSearch",

        "OCTOCODE_TS_SERVER_PATH": "/usr/local/bin/typescript-language-server",
        "OCTOCODE_PYTHON_SERVER_PATH": "/opt/homebrew/bin/pylsp",
        "OCTOCODE_RUST_SERVER_PATH": "/usr/local/bin/rust-analyzer",

        "REQUEST_TIMEOUT": "90000",
        "MAX_RETRIES": "5",

        "OCTOCODE_TELEMETRY_DISABLED": "false",
        "LOG": "true",
        "OCTOCODE_DEBUG": "false",

        "ALLOWED_PATHS": "/Users/username/projects,/tmp"
      }
    }
  }
}
```

### Example: Minimal Configuration

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

With GitHub CLI (`gh auth login`) already configured, this is sufficient for full functionality.

### Example: GitLab Configuration

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITLAB_TOKEN": "glpat_xxxxxxxxxxxxxxxxxxxx",
        "GITLAB_HOST": "https://gitlab.your-company.com"
      }
    }
  }
}
```

### Example: Security-Hardened Configuration

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

        "ENABLE_LOCAL": "false",
        "TOOLS_TO_RUN": "githubSearchCode,githubGetFileContent,githubViewRepoStructure",

        "OCTOCODE_TELEMETRY_DISABLED": "true",
        "LOG": "false",

        "REQUEST_TIMEOUT": "30000",
        "MAX_RETRIES": "2"
      }
    }
  }
}
```

Only GitHub code exploration, no local filesystem access, minimal network exposure.

## Troubleshooting

### Authentication Issues

**Problem:** "Authentication required" error

**Solutions:**
1. Run `gh auth login` for GitHub CLI authentication
2. Set `GITHUB_TOKEN` environment variable
3. Run `npx octocode-cli` for OAuth flow
4. Enable debug: `OCTOCODE_DEBUG=true` to see token resolution

### Tool Not Available

**Problem:** Tool not showing in MCP client

**Solutions:**
1. Check `TOOLS_TO_RUN` isn't too restrictive
2. Verify tool not in `DISABLE_TOOLS`
3. For local tools: ensure `ENABLE_LOCAL=true`
4. Check tool name spelling (case-sensitive)

### LSP Not Working

**Problem:** LSP tools return text fallback

**Solutions:**
1. Install language server: `npm install -g typescript-language-server`
2. Check server in PATH: `which typescript-language-server`
3. Set explicit path: `OCTOCODE_TS_SERVER_PATH=/path/to/server`
4. Create config file: `~/.octocode/lsp-servers.json`
5. Enable debug: `OCTOCODE_DEBUG=true`

### Rate Limit Exceeded

**Problem:** GitHub API rate limit hit

**Solutions:**
1. Use authenticated requests (set `GITHUB_TOKEN`)
2. Wait for rate limit reset (check error message)
3. Use local tools as alternative
4. Responses are cached (identical queries reuse cache)

### Path Not Allowed

**Problem:** "Path not allowed" error for local tools

**Solutions:**
1. Set `ALLOWED_PATHS`: comma-separated allowed directories
2. Use absolute paths, not relative
3. Ensure path doesn't escape allowed roots via `..`

## Best Practices

### Security

1. **Never commit tokens to version control**
   - Use environment variables or secure storage
   - Add config files to `.gitignore`

2. **Use minimal token scopes**
   - GitHub: `repo`, `read:user`, `read:org` only
   - GitLab: `api` only

3. **Restrict tool access**
   - Use `TOOLS_TO_RUN` for locked-down environments
   - Disable local tools if not needed

4. **Configure allowed paths**
   - Restrict local tools to specific directories
   - Prevent access to sensitive system files

### Performance

1. **Use GitHub CLI for development**
   - Automatic token refresh
   - Better caching behavior

2. **Leverage caching**
   - Identical queries reuse cached responses
   - See [14-caching-pagination.md](./14-caching-pagination.md)

3. **Set appropriate timeouts**
   - Lower timeout for fast-fail behavior
   - Higher for large file operations

### Reliability

1. **Enable retries**
   - Set `MAX_RETRIES=5` for flaky networks
   - Exponential backoff prevents overwhelming servers

2. **Monitor rate limits**
   - Use authenticated requests for higher limits
   - Check error responses for rate limit info

3. **Test LSP setup**
   - Verify language servers before production use
   - Use debug mode to troubleshoot

### Logging

1. **Enable logging for debugging**
   - `LOG=true` for session logs
   - `OCTOCODE_DEBUG=true` for verbose output

2. **Disable in production**
   - `OCTOCODE_TELEMETRY_DISABLED=true` to opt out
   - `LOG=false` to reduce noise

3. **Use structured logging**
   - Logs include timestamps and context
   - Easy to parse for monitoring tools

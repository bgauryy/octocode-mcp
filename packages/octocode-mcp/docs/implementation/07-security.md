# Security Architecture

This document details the comprehensive security architecture of octocode-mcp, including validation layers, secret detection, path traversal prevention, and content sanitization.

## Table of Contents

1. [Overview](#overview)
2. [Security Layers](#security-layers)
3. [withSecurityValidation HOF](#withsecurityvalidation-hof)
4. [ContentSanitizer](#contentsanitizer)
5. [Secret Detection](#secret-detection)
6. [PathValidator](#pathvalidator)
7. [Ignored Path Patterns](#ignored-path-patterns)
8. [Dangerous Key Blocking](#dangerous-key-blocking)
9. [Security Best Practices](#security-best-practices)

---

## Overview

Octocode-mcp implements a defense-in-depth security strategy with multiple layers of validation and sanitization. The security architecture is designed to:

- **Prevent injection attacks** (path traversal, command injection)
- **Detect and redact secrets** (API keys, tokens, credentials)
- **Validate all inputs** before processing
- **Block access to sensitive files** and directories
- **Fail securely** when errors occur

### Security Principles

1. **Fail-Closed**: When security detection fails, assume content is sensitive
2. **Defense in Depth**: Multiple independent security layers
3. **Minimal Blocking**: Only block actual secrets, allow code exploration
4. **User Control**: Users control their local machines, block actual threats
5. **Transparency**: Clear error messages about what was blocked and why

---

## Security Layers

The security architecture consists of four primary layers:

```
┌─────────────────────────────────────────────┐
│     1. Input Validation Layer               │
│     (withSecurityValidation HOF)            │
│     - Validates parameter types             │
│     - Blocks dangerous keys                 │
│     - Enforces size limits                  │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│     2. Content Sanitization Layer           │
│     (ContentSanitizer)                      │
│     - Detects secrets in content            │
│     - Redacts sensitive patterns            │
│     - Validates nested objects              │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│     3. Path Validation Layer                │
│     (PathValidator)                         │
│     - Prevents path traversal               │
│     - Validates against allowed roots       │
│     - Resolves symlinks safely              │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│     4. File Access Layer                    │
│     (Ignored Patterns)                      │
│     - Blocks sensitive directories          │
│     - Filters credential files              │
│     - Allows code exploration               │
└─────────────────────────────────────────────┘
```

---

## withSecurityValidation HOF

The `withSecurityValidation` higher-order function wraps all tool handlers with input validation and session logging.

### Location

```
src/security/withSecurityValidation.ts
```

### How It Works

```typescript
export function withSecurityValidation<T extends Record<string, unknown>>(
  toolName: string,
  toolHandler: (sanitizedArgs: T, authInfo?: AuthInfo, sessionId?: string)
    => Promise<CallToolResult>
): (args: unknown, context: { authInfo?: AuthInfo; sessionId?: string })
    => Promise<CallToolResult>
```

### Security Checks

1. **Input Parameter Validation**
   - Validates that args is an object
   - Calls `ContentSanitizer.validateInputParameters()`
   - Returns error if validation fails

2. **Secret Detection**
   - Scans all string values for secrets
   - Redacts detected secrets with `[REDACTED-TYPE]`
   - Tracks which secret types were found

3. **Parameter Sanitization**
   - Truncates long strings (>10,000 characters)
   - Limits array sizes (max 100 items)
   - Recursively validates nested objects
   - Blocks dangerous keys (`__proto__`, `constructor`, `prototype`)

4. **Session Logging** (if enabled)
   - Logs tool calls with repository and research context
   - Extracts owner/repo from queries
   - Aggregates research goals and reasoning
   - Logs errors for monitoring

### Usage Example

```typescript
// Tool registration
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'githubSearchCode') {
    return await withSecurityValidation(
      'githubSearchCode',
      async (sanitizedArgs) => {
        // Tool implementation receives sanitized args
        return await executeGitHubSearchCode(sanitizedArgs);
      }
    )(request.params.arguments, {
      authInfo: request.params.authInfo,
      sessionId: request.params.sessionId
    });
  }
});
```

### Error Handling

If validation fails:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Security validation failed: Secrets detected in query: github_token"
    }
  ]
}
```

---

## ContentSanitizer

The `ContentSanitizer` class provides static methods for detecting and redacting secrets in content and parameters.

### Location

```
src/security/contentSanitizer.ts
```

### Methods

#### 1. sanitizeContent(content: string)

Scans content for secrets and returns sanitized version.

```typescript
const result = ContentSanitizer.sanitizeContent(fileContent);

// Returns:
{
  content: string;           // Sanitized content with [REDACTED-TYPE] markers
  hasSecrets: boolean;       // True if secrets were found
  secretsDetected: string[]; // Array of secret type names
  warnings: string[];        // Same as secretsDetected (backward compat)
}
```

**Example:**

```typescript
const content = "API_KEY=sk_live_abc123def456";
const result = ContentSanitizer.sanitizeContent(content);

console.log(result.hasSecrets); // true
console.log(result.secretsDetected); // ['stripe_secret_key']
console.log(result.content); // "API_KEY=[REDACTED-STRIPE_SECRET_KEY]"
```

#### 2. validateInputParameters(params: Record<string, unknown>)

Validates and sanitizes tool input parameters.

```typescript
const validation = ContentSanitizer.validateInputParameters(args);

// Returns:
{
  sanitizedParams: Record<string, unknown>; // Cleaned parameters
  isValid: boolean;                         // False if validation errors
  hasSecrets: boolean;                      // True if secrets found
  warnings: string[];                       // List of validation warnings
}
```

**Validation Rules:**

- **String values**: Checked for secrets, truncated if >10,000 chars
- **Array values**: Limited to 100 items
- **Object values**: Recursively validated
- **Dangerous keys**: Blocked (`__proto__`, `constructor`, `prototype`)
- **Empty keys**: Rejected

**Example:**

```typescript
const params = {
  query: "SELECT * FROM users",
  apiKey: "ghp_abc123xyz",  // GitHub token
  filters: ["file1.ts", "file2.ts"]
};

const validation = ContentSanitizer.validateInputParameters(params);

console.log(validation.isValid); // true
console.log(validation.hasSecrets); // true
console.log(validation.warnings);
// ["Secrets detected in apiKey: github_token"]
console.log(validation.sanitizedParams.apiKey);
// "[REDACTED-GITHUB_TOKEN]"
```

### Fail-Closed Behavior

If secret detection itself fails (exception during regex matching):

```typescript
{
  hasSecrets: true,
  secretsDetected: ['detection-error'],
  sanitizedContent: '[CONTENT-REDACTED-DETECTION-ERROR]'
}
```

This ensures that detection failures don't accidentally leak secrets.

---

## Secret Detection

Octocode-mcp uses comprehensive regex patterns to detect various secret types.

### Location

```
src/security/regexes.ts
src/security/patternsConstants.ts
src/security/mask.ts
```

### Secret Categories

#### 1. **AI/ML Service Tokens**
- OpenAI API keys (`sk-`, `sk_live_`, `sk_test_`)
- Anthropic API keys (`sk-ant-`)
- Hugging Face tokens
- Google AI API keys
- Azure OpenAI keys

#### 2. **Cloud Provider Credentials**
- AWS Access Keys (`AKIA`, `ASIA`)
- AWS Secret Keys (40-char base64)
- Google Cloud service accounts (JSON)
- Azure connection strings
- DigitalOcean tokens

#### 3. **Authentication & OAuth**
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `ghr_`)
- GitLab tokens (`glpat_`)
- JWT tokens (3-part base64)
- OAuth Bearer tokens
- Basic Auth credentials

#### 4. **Payment & Financial**
- Stripe Secret Keys (`sk_live_`, `sk_test_`)
- Stripe Publishable Keys (`pk_live_`, `pk_test_`)
- PayPal credentials
- Square access tokens

#### 5. **Database Credentials**
- PostgreSQL connection strings
- MySQL connection strings
- MongoDB connection strings
- Redis URLs
- Database passwords in configs

#### 6. **Private Keys & Certificates**
- RSA private keys (`-----BEGIN RSA PRIVATE KEY-----`)
- SSH private keys (Ed25519, ECDSA)
- PGP private keys
- Certificate files (.pem, .key)

### Pattern Accuracy Levels

Each pattern has an accuracy level indicating reliability:

```typescript
interface SensitiveDataPattern {
  name: string;
  regex: RegExp;
  matchAccuracy: 'high' | 'medium';
}
```

- **high**: Very specific patterns with low false positives (e.g., `ghp_` prefix for GitHub tokens)
- **medium**: More generic patterns that may have false positives (e.g., generic API key formats)

### Secret Masking

The `maskSensitiveData()` function masks secrets in error messages:

```typescript
export function maskSensitiveData(text: string): string
```

**Masking Strategy:**
- Finds all secret matches using combined regex
- Handles overlapping matches
- Masks every other character: `ghp_abc123` → `g*p*a*c*2*`
- Preserves odd-indexed characters for readability

**Example:**

```typescript
const error = "Authentication failed with token ghp_1234567890abcdef";
const masked = maskSensitiveData(error);
console.log(masked);
// "Authentication failed with token g*p*1*3*5*7*9*a*c*e*"
```

---

## PathValidator

The `PathValidator` class prevents path traversal attacks and enforces access boundaries.

### Location

```
src/security/pathValidator.ts
```

### Configuration

```typescript
interface PathValidatorOptions {
  workspaceRoot?: string;      // Primary workspace (default: CWD)
  additionalRoots?: string[];  // Extra allowed paths
  includeHomeDir?: boolean;    // Allow home directory (default: true)
}

const validator = new PathValidator({
  workspaceRoot: '/Users/dev/project',
  additionalRoots: ['/opt/code'],
  includeHomeDir: true
});
```

### Allowed Roots

Paths are allowed if they start with any of:

1. **Workspace Root**: Primary project directory (default: `process.cwd()`)
2. **Home Directory**: User's home directory (`os.homedir()`)
3. **Additional Roots**: Custom paths via `additionalRoots` option
4. **Environment Paths**: Comma-separated paths from `ALLOWED_PATHS` env var

**Example:**

```bash
# Allow multiple project directories
ALLOWED_PATHS="/Users/dev/project1,/Users/dev/project2,/opt/shared"
```

### Path Validation

```typescript
validate(inputPath: string): PathValidationResult
```

**Validation Steps:**

1. **Empty Path Check**: Reject empty strings
2. **Tilde Expansion**: Expand `~` to home directory
3. **Absolute Resolution**: Convert to absolute path
4. **Root Check**: Verify path starts with an allowed root
5. **Ignore Pattern Check**: Reject ignored directories (`.git`, `.ssh`, etc.)
6. **Symlink Resolution**: Resolve to real path using `fs.realpathSync()`
7. **Target Validation**: Verify symlink target is also within allowed roots
8. **Target Ignore Check**: Verify symlink target isn't ignored

**Return Type:**

```typescript
interface PathValidationResult {
  isValid: boolean;
  sanitizedPath?: string;  // Resolved absolute path (if valid)
  error?: string;          // Error message (if invalid)
}
```

### Symlink Behavior

**Important distinction:**

- **Path Validation (Security)**: ALWAYS resolves symlinks to prevent attacks
- **Tool Traversal (Performance)**: By default, DON'T follow symlinks (configurable)

**Security Rationale:**

```typescript
// Security validation MUST resolve symlinks
const result = validator.validate('/workspace/link');
// Even if 'link' points to '/etc/passwd', validation will:
// 1. Resolve to real path: /etc/passwd
// 2. Check if /etc/passwd is in allowed roots
// 3. Reject (outside workspace)
```

**Performance Rationale:**

```typescript
// Tool traversal defaults to NOT following symlinks
await localSearchCode({
  path: '/workspace',
  pattern: 'TODO',
  followSymlinks: false  // Default: avoid infinite loops, faster search
});
```

### Error Codes

```typescript
// Path doesn't exist yet (allowed if within roots)
{ code: 'ENOENT' } → { isValid: true, sanitizedPath: absolutePath }

// Permission denied
{ code: 'EACCES' } → { isValid: false, error: 'Permission denied...' }

// Circular symlink
{ code: 'ELOOP' } → { isValid: false, error: 'Symlink loop detected...' }

// Path name too long
{ code: 'ENAMETOOLONG' } → { isValid: false, error: 'Path name too long...' }

// Unknown error (fail-closed)
{ error } → { isValid: false, error: 'Unexpected error...' }
```

### Usage Examples

**Basic Validation:**

```typescript
const validator = new PathValidator();
const result = validator.validate('/Users/dev/project/src/index.ts');

if (result.isValid) {
  const content = await fs.readFile(result.sanitizedPath, 'utf-8');
} else {
  console.error(result.error);
}
```

**Custom Roots:**

```typescript
const validator = new PathValidator({
  workspaceRoot: '/opt/app',
  additionalRoots: ['/var/data', '/tmp/workspace'],
  includeHomeDir: false  // Disable home dir access
});
```

**Check File Type:**

```typescript
const type = await validator.getType('/path/to/file');
// Returns: 'file' | 'directory' | 'symlink' | null
```

---

## Ignored Path Patterns

The system blocks access to sensitive directories and files that typically contain credentials.

### Location

```
src/security/patternsConstants.ts
src/security/ignoredPathFilter.ts
```

### Philosophy: Minimal Blocking

**Block ONLY:**
- Actual secret files (private keys, credentials, tokens)
- Sensitive user data (password managers, cryptocurrency wallets)
- Credential stores (browser passwords, cloud provider keys)

**ALLOW for code exploration:**
- Config files (`config.json`, `settings.json`)
- Log files (`*.log`)
- Database schema files (`*.sql`)
- SQLite databases (content is sanitized)
- Backups (`*.bak`, `*.old`)
- Public certificates (`*.crt`, `*.cer`)
- Jupyter notebooks (`*.ipynb`)
- CI/CD configs (visible in repos anyway)

### Ignored Directories

```typescript
export const IGNORED_PATH_PATTERNS: RegExp[] = [
  // Version control
  /^\.git$/,
  /\/\.git\//,

  // SSH keys
  /^\.ssh$/,
  /\/\.ssh\//,

  // Cloud providers
  /^\.aws$/,      // AWS credentials
  /^\.docker$/,   // Docker credentials
  /^\.azure$/,    // Azure credentials
  /^\.kube$/,     // Kubernetes configs

  // Password managers
  /^\.password-store$/,  // Unix pass

  // Browser credential storage
  /\.mozilla\/firefox\//,
  /\.config\/chromium\//,
  /Library\/Application Support\/Google\/Chrome\//,

  // Cryptocurrency wallets
  /^\.bitcoin$/,
  /^\.ethereum$/,
  /^\.electrum$/,

  // Sensitive directories
  /^secrets$/,
  /^private$/,
  /\/secrets\//,
  /\/private\//,
];
```

### Ignored Files

```typescript
export const IGNORED_FILE_PATTERNS: RegExp[] = [
  // Environment files with secrets
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\..+$/,

  // Credential files
  /^\.npmrc$/,
  /^\.pypirc$/,
  /^\.netrc$/,
  /^credentials$/,
  /^\.aws\/credentials$/,

  // SSH keys
  /^id_rsa$/,
  /^id_ed25519$/,
  /.*_rsa$/,
  /.*_ed25519$/,

  // Private keys and certificates
  /^private.*\.key$/,
  /^private.*\.pem$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,    // Certificate stores
  /\.pfx$/,
  /\.jks$/,
  /\.ppk$/,    // PuTTY keys

  // Cloud provider credentials
  /^service[-_]account.*\.json$/,
  /^application[-_]default[-_]credentials\.json$/,

  // Kubernetes
  /^kubeconfig$/,
  /^\.kube\/config$/,

  // Token files
  /^\.token$/,
  /^token\.txt$/,
  /^access_token$/,
  /^bearer_token$/,

  // Password files
  /^\.password$/,
  /^password\.txt$/,
  /^passwords\.txt$/,

  // Shell history (contains typed passwords)
  /^\.bash_history$/,
  /^\.zsh_history$/,
  /^\.history$/,

  // Database history (contains credentials in queries)
  /^\.mysql_history$/,
  /^\.psql_history$/,

  // Browser credential storage (CRITICAL)
  /^Login Data$/,
  /^Cookies$/,
  /\/logins\.json$/,
  /\/key[34]\.db$/,

  // Password manager databases (CRITICAL)
  /\.kdbx$/,    // KeePass
  /\.kdb$/,
  /^1Password.*\.sqlite$/,
  /\.agilekeychain\//,
  /\.opvault\//,

  // Cryptocurrency wallets (CRITICAL)
  /^wallet\.dat$/,
  /^default_wallet$/,
  /\/keystore\/UTC--.*$/,

  // Core dumps (contain memory with secrets)
  /^core$/,
  /^core\.\d+$/,
  /\.dmp$/,     // Windows crash dump
  /\.mdmp$/,    // Windows minidump
];
```

### Examples of ALLOWED Files

These files are explicitly allowed despite potentially containing configuration:

```typescript
// Config files - ALLOWED
config.json
settings.json
app.config
appsettings.json
*.conf (except VPN configs)

// Log files - ALLOWED (sanitizer handles secrets)
*.log
debug.log
error.log

// Database files - ALLOWED (sanitizer handles secrets)
*.sql (schema files)
*.db
*.sqlite
*.sqlite3

// Backups - ALLOWED
*.bak
*.backup
*.old
*~

// CI/CD - ALLOWED (public in repos)
.travis.yml
.gitlab-ci.yml
.github/workflows/*.yml
Jenkinsfile

// Notebooks - ALLOWED (sanitizer handles secrets)
*.ipynb
```

### Testing Ignored Patterns

```typescript
import { shouldIgnore } from './security/ignoredPathFilter.js';

// Returns true if path should be blocked
shouldIgnore('/home/user/.ssh/id_rsa');        // true
shouldIgnore('/home/user/.env');               // true
shouldIgnore('/home/user/project/config.json'); // false
shouldIgnore('/home/user/project/src/app.ts'); // false
```

---

## Dangerous Key Blocking

### Prototype Pollution Prevention

The system blocks JavaScript object prototype pollution attacks:

```typescript
const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

if (dangerousKeys.includes(key)) {
  hasValidationErrors = true;
  warnings.add(`Dangerous parameter key blocked: ${key}`);
  continue;
}
```

**Attack Example (BLOCKED):**

```json
{
  "__proto__": {
    "isAdmin": true
  }
}
```

**Why This Matters:**

Prototype pollution allows attackers to modify the behavior of all objects in the application, potentially leading to:
- Authentication bypasses
- Privilege escalation
- Remote code execution

---

## Security Best Practices

### For Users

1. **Use GitHub CLI Authentication**
   - Automatic token rotation
   - Works with 2FA and SSO
   - Better than environment variables

2. **Limit Workspace Access**
   - Use `ALLOWED_PATHS` to restrict tool access
   - Don't run in directories with sensitive files
   - Consider separate workspace for MCP tools

3. **Review Logs**
   - Check session logs for unusual activity
   - Monitor which repositories are accessed
   - Look for failed access attempts

4. **Keep Tokens Secure**
   - Never commit tokens to git
   - Use `.env` files (which are blocked by default)
   - Rotate tokens regularly

### For Developers

1. **Always Use withSecurityValidation**
   ```typescript
   // ✅ Good
   return await withSecurityValidation(
     'toolName',
     async (sanitizedArgs) => { /* ... */ }
   )(args, context);

   // ❌ Bad - bypasses security
   return await directToolImplementation(args);
   ```

2. **Validate Tool-Specific Paths**
   ```typescript
   // Validate before accessing filesystem
   const validation = pathValidator.validate(inputPath);
   if (!validation.isValid) {
     throw new ToolError(
       LOCAL_TOOL_ERROR_CODES.PATH_VALIDATION_FAILED,
       validation.error
     );
   }
   const safePath = validation.sanitizedPath!;
   ```

3. **Sanitize Output Content**
   ```typescript
   // Sanitize before returning to user
   const result = ContentSanitizer.sanitizeContent(fileContent);
   if (result.hasSecrets) {
     console.warn('Secrets detected:', result.secretsDetected);
   }
   return result.content;
   ```

4. **Use ToolError for Exceptions**
   ```typescript
   // Provides error codes and recoverability info
   throw new ToolError(
     LOCAL_TOOL_ERROR_CODES.FILE_ACCESS_FAILED,
     'Cannot read file',
     { path: filePath },
     originalError
   );
   ```

5. **Log Security Events**
   ```typescript
   // Track security-relevant operations
   await logSessionError(toolName, errorCode);
   await logRateLimit({ limit_type: 'primary', retry_after_seconds: 60 });
   ```

### Testing Security

```typescript
// Test input validation
describe('Security Validation', () => {
  it('should block dangerous keys', () => {
    const result = ContentSanitizer.validateInputParameters({
      '__proto__': { isAdmin: true }
    });
    expect(result.isValid).toBe(false);
    expect(result.warnings).toContain('Dangerous parameter key blocked: __proto__');
  });

  it('should detect secrets', () => {
    const result = ContentSanitizer.sanitizeContent('TOKEN=ghp_abc123');
    expect(result.hasSecrets).toBe(true);
    expect(result.secretsDetected).toContain('github_token');
  });

  it('should reject path traversal', () => {
    const validator = new PathValidator();
    const result = validator.validate('../../etc/passwd');
    expect(result.isValid).toBe(false);
  });
});
```

---

## Summary

Octocode-mcp's security architecture provides comprehensive protection through:

1. **Input Validation**: All tool inputs validated and sanitized via `withSecurityValidation`
2. **Secret Detection**: 50+ secret patterns detected and redacted automatically
3. **Path Validation**: Strict path boundaries enforced, symlinks resolved safely
4. **File Filtering**: Sensitive directories and credential files blocked by default
5. **Fail-Closed Design**: Security failures result in denial, not exposure

The system balances security with usability, blocking actual threats while allowing legitimate code exploration. All security measures are transparent with clear error messages explaining what was blocked and why.

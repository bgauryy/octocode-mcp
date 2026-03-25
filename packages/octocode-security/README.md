# @octocode/security

Security toolkit for Node.js — path traversal protection, command injection prevention, secret detection, content sanitization, and sensitive-data masking.

Zero runtime dependencies. Framework-agnostic. Works with MCP, Express, Fastify, CLI tools, or anything else.

## Install

```bash
npm install @octocode/security
```

## Quick Start

```typescript
import {
  PathValidator,
  ContentSanitizer,
  maskSensitiveData,
  validateCommand,
  validateExecutionContext,
} from '@octocode/security';

// Block path traversal attacks
const validator = new PathValidator({ workspaceRoot: '/app' });
const result = validator.validate('../../etc/passwd');
// → { isValid: false, error: "Path '../../etc/passwd' is outside allowed directories" }

// Strip secrets from user input
const { content } = ContentSanitizer.sanitizeContent('key: ghp_abc123xyz');
// → { content: 'key: [REDACTED-GITHUB-PAT]', hasSecrets: true, ... }

// Mask secrets in logs (preserves partial visibility)
maskSensitiveData('token: sk-proj-abc123');
// → 'token: *k*p*o*-*b*1*3'

// Prevent command injection
validateCommand('rg', ['pattern', './src']);
// → { isValid: true }

// Validate working directory before exec
validateExecutionContext('/app/packages/core');
// → { isValid: true, sanitizedPath: '/app/packages/core' }
```

## Table of Contents

- [PathValidator](#pathvalidator) — file path validation with symlink resolution
- [ContentSanitizer](#contentsanitizer) — secret detection and removal from strings/objects
- [maskSensitiveData](#masksensitivedata) — partial masking for logs and error messages
- [validateCommand](#validatecommand) — command whitelist enforcement
- [withSecurityValidation](#withsecurityvalidation) — security wrapper for tool handlers
- [validateExecutionContext](#validateexecutioncontext) — working directory validation
- [resolveWorkspaceRoot](#resolveworkspaceroot) — workspace root resolution
- [Ignored Path Filters](#ignored-path-filters) — filter sensitive files and directories
- [Regex Patterns](#regex-patterns) — 200+ secret detection patterns
- [Path Utilities](#path-utilities) — path redaction for error messages
- [Security Constants](#security-constants) — allowed commands and dangerous patterns
- [Types](#types) — TypeScript interfaces
- [Environment Variables](#environment-variables)
- [Framework Adapters](#framework-adapters)
- [Sub-path Exports](#sub-path-exports)

---

## PathValidator

Multi-layer path validation: boundary checking, traversal protection, symlink resolution, and ignored-path filtering.

### Constructor

```typescript
new PathValidator(options?: {
  workspaceRoot?: string;       // primary allowed root (default: cwd)
  additionalRoots?: string[];   // extra allowed directories
  includeHomeDir?: boolean;     // allow home dir access (default: true)
})
```

Automatically includes `OCTOCODE_HOME` (`~/.octocode`) and paths from the `ALLOWED_PATHS` env var.

### `validate(path): PathValidationResult`

Resolves symlinks and checks the path is within allowed roots.

```typescript
const v = new PathValidator({ workspaceRoot: '/home/user/project' });

v.validate('/home/user/project/src/index.ts');
// → { isValid: true, sanitizedPath: '/home/user/project/src/index.ts' }

v.validate('/etc/shadow');
// → { isValid: false, error: "Path '/etc/shadow' is outside allowed directories" }

v.validate('');
// → { isValid: false, error: 'Path cannot be empty' }
```

### `exists(path): Promise<boolean>`

Validates and checks if the path exists and is readable.

```typescript
await v.exists('/home/user/project/src/index.ts'); // true
await v.exists('/etc/shadow');                      // false (outside root)
await v.exists('/home/user/project/missing.ts');    // false (doesn't exist)
```

### `getType(path): Promise<'file' | 'directory' | 'symlink' | null>`

Returns the path type after validation.

```typescript
await v.getType('/home/user/project/src');          // 'directory'
await v.getType('/home/user/project/src/index.ts'); // 'file'
await v.getType('/etc/passwd');                      // null (outside root)
```

### `addAllowedRoot(root): void`

Dynamically add an allowed root directory.

```typescript
v.addAllowedRoot('/tmp/builds');
v.validate('/tmp/builds/output.js');
// → { isValid: true, sanitizedPath: '/tmp/builds/output.js' }
```

### `getAllowedRoots(): readonly string[]`

Returns the current list of allowed root directories.

```typescript
v.getAllowedRoots();
// → ['/home/user/project', '/home/user', '/home/user/.octocode', '/tmp/builds']
```

### Global instance

A pre-configured singleton is exported for convenience:

```typescript
import { pathValidator, reinitializePathValidator } from '@octocode/security';

pathValidator.validate('./src/index.ts');

// Reconfigure at runtime (e.g., in tests)
reinitializePathValidator({ workspaceRoot: '/tmp/test', includeHomeDir: false });
```

---

## ContentSanitizer

Detects and replaces secrets in strings and nested objects using 200+ regex patterns.

All methods are static — no instantiation needed.

### `sanitizeContent(content, filePath?, patterns?): SanitizationResult`

Scans a string for secrets and replaces them with `[REDACTED-*]` tokens.

```typescript
import { ContentSanitizer } from '@octocode/security';

ContentSanitizer.sanitizeContent('Authorization: Bearer ghp_a1b2c3d4e5f6');
// → {
//     content: 'Authorization: Bearer [REDACTED-GITHUB-PAT]',
//     hasSecrets: true,
//     secretsDetected: ['GitHub-PAT'],
//     warnings: ['GitHub-PAT']
//   }

ContentSanitizer.sanitizeContent('just normal text');
// → { content: 'just normal text', hasSecrets: false, secretsDetected: [], warnings: [] }
```

Pass `filePath` for context-sensitive patterns (some patterns only trigger in specific file types):

```typescript
ContentSanitizer.sanitizeContent('DB_PASSWORD=hunter2', '.env');
```

### `validateInputParameters(params): ValidationResult`

Recursively sanitizes a params object — strips secrets, blocks prototype pollution, enforces size limits.

```typescript
const result = ContentSanitizer.validateInputParameters({
  query: 'search term',
  token: 'sk-proj-abc123xyz',
  nested: { apiKey: 'AKIA1234567890ABCDEF' },
});

result.isValid;          // true (structure is valid)
result.hasSecrets;       // true (secrets found and redacted)
result.sanitizedParams;  // { query: 'search term', token: '[REDACTED-...]', nested: { ... } }
result.warnings;         // ['Secrets detected in token: ...', ...]
```

Built-in protections:
- Blocks `__proto__`, `constructor`, `prototype` keys
- Truncates strings > 10,000 chars
- Truncates arrays > 100 items
- Detects circular references
- Max nesting depth of 20

---

## maskSensitiveData

Partially masks secrets — keeps every other character visible for debugging while hiding the full value.

```typescript
import { maskSensitiveData } from '@octocode/security';

maskSensitiveData('export GITHUB_TOKEN=ghp_abc123xyz');
// → 'export GITHUB_TOKEN=*h*_*b*1*3*y*'

maskSensitiveData('no secrets here');
// → 'no secrets here' (unchanged)
```

**Difference from `ContentSanitizer`:** sanitization replaces secrets with `[REDACTED-*]` tokens (for storage/output). Masking partially hides them (for logs/debugging where you need a hint of the original value).

```typescript
// Use maskSensitiveData for logs
function maskSensitiveData(
  text: string,
  patterns?: SensitiveDataPattern[]  // default: allRegexPatterns
): string
```

---

## validateCommand

Whitelist-based command validation with per-command argument rules. Prevents shell injection.

```typescript
import { validateCommand } from '@octocode/security';

validateCommand('rg', ['--json', 'pattern', './src']);
// → { isValid: true }

validateCommand('rm', ['-rf', '/']);
// → { isValid: false, error: "Command 'rm' is not allowed. Allowed commands: rg, ls, find, grep, git" }

validateCommand('rg', ['--pre', 'evil-script', 'pattern']);
// → { isValid: false, error: "rg option '--pre' is not allowed." }

validateCommand('find', ['.', '-exec', 'rm', '{}', ';']);
// → { isValid: false, error: "find operator '-exec' is not allowed." }

validateCommand('git', ['push', '--force']);
// → { isValid: false, error: "git subcommand 'push' is not allowed. Allowed: clone, sparse-checkout" }
```

```typescript
function validateCommand(
  command: string,
  args: string[]
): { isValid: boolean; error?: string }
```

**Allowed commands:** `rg`, `ls`, `find`, `grep`, `git`

Each command has specific argument validation:
- **rg** — whitelisted flags only; blocks `--pre` and other dangerous options
- **find** — blocks `-exec`, `-delete`, `-printf` and other write/execute operators
- **git** — only `clone` (with safe flags) and `sparse-checkout`
- All commands — blocks shell metacharacters (`;`, `|`, `` ` ``, `$()`, `${}`) in non-pattern arguments

---

## withSecurityValidation

Higher-order function that wraps any async handler with input sanitization, timeout, and optional telemetry.

### For remote/authenticated tools

```typescript
import { withSecurityValidation, configureSecurity } from '@octocode/security';
import type { ToolResult } from '@octocode/security';

// Optional: configure telemetry once at startup
configureSecurity({
  logToolCall: async (toolName, repos, goal) => {
    console.log(`[${toolName}] repos=${repos} goal=${goal}`);
  },
  logSessionError: async (toolName, errorCode) => {
    console.error(`[${toolName}] error=${errorCode}`);
  },
  isLoggingEnabled: () => true,
  isLocalTool: (name) => name.startsWith('local'),
});

// Wrap a tool handler
const searchCode = withSecurityValidation<{ query: string; repo: string }>(
  'github_search_code',
  async (args, authInfo, sessionId) => {
    // args are already sanitized — secrets replaced with [REDACTED-*]
    const results = await githubApi.search(args.query, args.repo);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }
);

// Call it — input is automatically sanitized, 60s timeout applied
const result = await searchCode(
  { query: 'password', repo: 'myorg/myrepo' },
  { authInfo: myAuth, sessionId: 'session-123' }
);
```

```typescript
function withSecurityValidation<T, TAuth = unknown>(
  toolName: string,
  handler: (sanitizedArgs: T, authInfo?: TAuth, sessionId?: string) => Promise<ToolResult>
): (args: unknown, extra: { authInfo?: TAuth; sessionId?: string; signal?: AbortSignal }) => Promise<ToolResult>
```

### For local tools (no auth needed)

```typescript
import { withBasicSecurityValidation } from '@octocode/security';

const readFile = withBasicSecurityValidation<{ path: string }>(
  async (args) => {
    const content = await fs.promises.readFile(args.path, 'utf-8');
    return { content: [{ type: 'text', text: content }] };
  },
  'local_read_file'  // optional name for logging
);

const result = await readFile({ path: './src/index.ts' });
```

```typescript
function withBasicSecurityValidation<T>(
  handler: (sanitizedArgs: T) => Promise<ToolResult>,
  toolName?: string
): (args: unknown, extra?: { signal?: AbortSignal }) => Promise<ToolResult>
```

### configureSecurity

Inject logging and tool classification once at app startup:

```typescript
function configureSecurity(deps: {
  logToolCall?: (toolName: string, repos: string[], goal?: string, rGoal?: string, reasoning?: string) => Promise<void>;
  logSessionError?: (toolName: string, errorCode: string) => Promise<void>;
  isLoggingEnabled?: () => boolean;
  isLocalTool?: (name: string) => boolean;
}): void
```

### Helper exports

```typescript
import { extractResearchFields, extractRepoOwnerFromParams } from '@octocode/security';

// Extract research context from bulk query params
extractResearchFields({ queries: [{ researchGoal: 'find auth flow', reasoning: 'tracing login' }] });
// → { researchGoal: 'find auth flow', reasoning: 'tracing login' }

// Extract repo identifiers from params
extractRepoOwnerFromParams({ owner: 'facebook', repo: 'react' });
// → ['facebook/react']
```

---

## validateExecutionContext

Ensures a working directory is within the workspace before running commands.

```typescript
import { validateExecutionContext } from '@octocode/security';

validateExecutionContext('/app/packages/core');
// → { isValid: true, sanitizedPath: '/app/packages/core' }

validateExecutionContext('/etc');
// → { isValid: false, error: 'Can only execute commands within the configured workspace directory' }

validateExecutionContext(undefined);
// → { isValid: true } (no cwd = no restriction)

validateExecutionContext('');
// → { isValid: false, error: 'Execution context (cwd) cannot be empty' }
```

```typescript
function validateExecutionContext(
  cwd: string | undefined,
  workspaceRoot?: string     // override workspace root
): PathValidationResult
```

Allowed roots: workspace root + `OCTOCODE_HOME` (default `~/.octocode`). Resolves symlinks to prevent escape.

---

## resolveWorkspaceRoot

Determines the workspace root with a clear priority chain.

```typescript
import { resolveWorkspaceRoot } from '@octocode/security';

resolveWorkspaceRoot('/explicit/path');  // → '/explicit/path'
resolveWorkspaceRoot();                  // → WORKSPACE_ROOT env var, or process.cwd()
```

```typescript
function resolveWorkspaceRoot(explicit?: string): string
```

**Priority:** explicit parameter > `WORKSPACE_ROOT` env var > `process.cwd()`

---

## Ignored Path Filters

Filter out sensitive directories and files (`.env`, `.git`, `.ssh`, `.aws`, etc.).

```typescript
import { shouldIgnore, shouldIgnorePath, shouldIgnoreFile } from '@octocode/security';

shouldIgnore('/app/.git/config');      // true
shouldIgnore('/app/.env');             // true
shouldIgnore('/app/src/index.ts');     // false

shouldIgnorePath('.aws/credentials');  // true
shouldIgnorePath('.ssh/id_rsa');      // true

shouldIgnoreFile('.env.local');        // true
shouldIgnoreFile('package.json');      // false
```

```typescript
function shouldIgnore(fullPath: string): boolean      // combined path + file check
function shouldIgnorePath(pathToCheck: string): boolean // directory patterns only
function shouldIgnoreFile(fileName: string): boolean    // file patterns only
```

Access the raw pattern lists:

```typescript
import { IGNORED_PATH_PATTERNS } from '@octocode/security';  // RegExp[]
import { IGNORED_FILE_PATTERNS } from '@octocode/security';  // RegExp[]
```

---

## Regex Patterns

200+ patterns across 13 categories for detecting API keys, tokens, credentials, and secrets.

```typescript
import { allRegexPatterns } from '@octocode/security';

// Scan content for secrets
for (const pattern of allRegexPatterns) {
  if (pattern.regex.test(content)) {
    console.warn(`Found ${pattern.name}: ${pattern.description}`);
  }
}
```

Each pattern has this shape:

```typescript
interface SensitiveDataPattern {
  name: string;                          // e.g. 'GitHub-PAT'
  description: string;                   // human-readable description
  regex: RegExp;                         // the detection pattern
  fileContext?: RegExp;                   // only match in specific file types
  matchAccuracy?: 'high' | 'medium';     // confidence level
}
```

**Categories:** AI providers (OpenAI, Anthropic, ...), AWS, auth/crypto, analytics, cloud providers (GCP, Azure, ...), communications (Slack, Twilio, ...), databases (MongoDB, Redis, ...), dev tools (npm, Docker, ...), monitoring (Datadog, Sentry, ...), payments (Stripe, PayPal, ...), VCS tokens (GitHub, GitLab, Bitbucket), and more.

---

## Path Utilities

### `redactPath`

Replaces absolute paths with safe relative versions for error messages.

```typescript
import { redactPath } from '@octocode/security';

// Within workspace → project-relative
redactPath('/home/alice/project/src/index.ts', '/home/alice/project');
// → 'src/index.ts'

// Within home dir → ~/...
redactPath('/home/alice/.config/secrets.json');
// → '~/.config/secrets.json'

// Outside all known roots → filename only
redactPath('/opt/system/config.yaml');
// → 'config.yaml'
```

```typescript
function redactPath(absolutePath: string, workspaceRoot?: string): string
```

---

## Security Constants

```typescript
import { ALLOWED_COMMANDS, DANGEROUS_PATTERNS, PATTERN_DANGEROUS_PATTERNS } from '@octocode/security';

ALLOWED_COMMANDS;
// → ['rg', 'ls', 'find', 'grep', 'git']

DANGEROUS_PATTERNS;
// → [/[;&|`$(){}[\]<>]/, /\${/, /\$\(/]  — for path/filename arguments

PATTERN_DANGEROUS_PATTERNS;
// → [/\${/, /\$\(/, /`/, /;/]  — more permissive, for search patterns
```

---

## Types

All types are exported from the main entry point and from `@octocode/security/types`:

```typescript
import type {
  SanitizationResult,
  ValidationResult,
  PathValidationResult,
  ToolResult,
  SensitiveDataPattern,
} from '@octocode/security';
```

```typescript
interface SanitizationResult {
  content: string;
  hasSecrets: boolean;
  secretsDetected: string[];
  warnings: string[];
}

interface ValidationResult {
  sanitizedParams: Record<string, unknown>;
  isValid: boolean;
  hasSecrets: boolean;
  warnings: string[];
}

interface PathValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedPath?: string;
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface SecurityDepsConfig {
  logToolCall?: (toolName: string, repos: string[], goal?: string, rGoal?: string, reasoning?: string) => Promise<void>;
  logSessionError?: (toolName: string, errorCode: string) => Promise<void>;
  isLoggingEnabled?: () => boolean;
  isLocalTool?: (name: string) => boolean;
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCTOCODE_HOME` | `~/.octocode` | Additional allowed root for data files and cloned repos |
| `WORKSPACE_ROOT` | `process.cwd()` | Workspace root when not passed explicitly |
| `ALLOWED_PATHS` | — | Comma-separated extra allowed paths for `PathValidator` |

---

## Framework Adapters

`ToolResult` is intentionally generic. Bridge it to your framework with a thin wrapper:

**MCP SDK example:**

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  withSecurityValidation as _wsv,
  configureSecurity,
} from '@octocode/security';

export { configureSecurity };

export function withSecurityValidation<T extends Record<string, unknown>>(
  toolName: string,
  handler: (args: T, auth?: AuthInfo, sessionId?: string) => Promise<CallToolResult>
) {
  return _wsv<T, AuthInfo>(toolName, handler as any) as unknown as
    (args: unknown, extra: { authInfo?: AuthInfo; sessionId?: string }) => Promise<CallToolResult>;
}
```

**Express middleware example:**

```typescript
import { ContentSanitizer, maskSensitiveData } from '@octocode/security';

app.use((req, res, next) => {
  const { sanitizedParams, isValid, warnings } =
    ContentSanitizer.validateInputParameters(req.body);

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid input', warnings });
  }

  req.body = sanitizedParams;
  next();
});
```

---

## Sub-path Exports

Every module is available as a direct import for tree shaking:

```typescript
import { PathValidator }              from '@octocode/security/pathValidator';
import { ContentSanitizer }           from '@octocode/security/contentSanitizer';
import { withSecurityValidation }     from '@octocode/security/withSecurityValidation';
import { maskSensitiveData }          from '@octocode/security/mask';
import { validateCommand }            from '@octocode/security/commandValidator';
import { validateExecutionContext }    from '@octocode/security/executionContextValidator';
import { resolveWorkspaceRoot }       from '@octocode/security/workspaceRoot';
import { shouldIgnore }               from '@octocode/security/ignoredPathFilter';
import { redactPath }                 from '@octocode/security/pathUtils';
import { allRegexPatterns }           from '@octocode/security/regexes';
import type { ToolResult }            from '@octocode/security/types';
```

---

## License

MIT

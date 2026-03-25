# @octocode/security

<p align="center">
  <img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-security/assets/security_logo.png" alt="@octocode/security" width="480" height="408" />
</p>

Security layer for Node.js tool servers — the kind that run commands, read files, and call APIs on behalf of AI agents.

Zero runtime dependencies. Framework-agnostic. Works with MCP servers, Express, Fastify, CLI tools, or anything else.

```bash
npm install @octocode/security
```

## Why This Exists

AI tool servers (MCP, function-calling backends, agent frameworks) accept structured input from language models and execute it against real systems — filesystems, shells, APIs. The model is the user, and models can be manipulated.

This creates attack surface that traditional web security doesn't cover:

- **Path traversal** — a model asks to read `../../etc/passwd` or follows a symlink outside the workspace
- **Command injection** — arguments contain shell metacharacters (`; rm -rf /`) that escape into exec calls
- **Secret exfiltration** — model output includes API keys, tokens, or credentials found in file content
- **Prompt injection via secrets** — user input contains embedded credentials that leak through logs or error messages

`@octocode/security` is a single package that handles all of these. Every function is designed for the specific threat model of "untrusted structured input executed with real privileges."

## What's In the Box

| Module | What it does | Import |
|--------|-------------|--------|
| [PathValidator](#pathvalidator) | Confine file access to allowed directories. Resolves symlinks. | `@octocode/security/pathValidator` |
| [ContentSanitizer](#contentsanitizer) | Find and replace secrets in strings and objects (200+ patterns) | `@octocode/security/contentSanitizer` |
| [maskSensitiveData](#masksensitivedata) | Partially mask secrets for logs (keeps partial visibility) | `@octocode/security/mask` |
| [validateCommand](#validatecommand) | Whitelist-based command validation with per-command arg rules | `@octocode/security/commandValidator` |
| [validateExecutionContext](#validateexecutioncontext) | Validate working directory before spawning processes | `@octocode/security/executionContextValidator` |
| [withSecurityValidation](#withsecurityvalidation) | Wrap any tool handler with sanitization + timeout + telemetry | `@octocode/security/withSecurityValidation` |
| [SecurityRegistry](#securityregistry) | Extend all security rules at runtime (patterns, commands, paths) | `@octocode/security/registry` |
| [Ignored Path Filters](#ignored-path-filters) | Filter out `.env`, `.git`, `.ssh`, `.aws`, and similar paths | `@octocode/security/ignoredPathFilter` |
| [Regex Patterns](#regex-patterns) | 200+ secret detection patterns across 13 categories | `@octocode/security/regexes` |
| [Path Utilities](#path-utilities) | Redact absolute paths in error messages | `@octocode/security/pathUtils` |
| [resolveWorkspaceRoot](#resolveworkspaceroot) | Determine workspace root from env/args/cwd | `@octocode/security/workspaceRoot` |
| [Security Constants](#security-constants) | Allowed commands, dangerous shell patterns | (via main export) |
| [Param Extractors](#param-extractors) | Pull research metadata and repo identifiers from tool params | `@octocode/security/paramExtractors` |
| [Types](#types) | All TypeScript interfaces | `@octocode/security/types` |

Everything is also available from the main `@octocode/security` entry point.

---

## Quick Start

```typescript
import {
  PathValidator,
  ContentSanitizer,
  maskSensitiveData,
  validateCommand,
  validateExecutionContext,
} from '@octocode/security';

// Block path traversal
const validator = new PathValidator({ workspaceRoot: '/app' });
validator.validate('../../etc/passwd');
// → { isValid: false, error: "Path '../../etc/passwd' is outside allowed directories" }

// Strip secrets from content before returning to a model
ContentSanitizer.sanitizeContent('key: ghp_abc123xyz');
// → { content: 'key: [REDACTED-GITHUB-PAT]', hasSecrets: true, ... }

// Mask secrets in logs (partial visibility for debugging)
maskSensitiveData('token: sk-proj-abc123');
// → 'token: *k*p*o*-*b*1*3'

// Validate commands before exec
validateCommand('rg', ['pattern', './src']);
// → { isValid: true }

// Validate working directory
validateExecutionContext('/app/packages/core');
// → { isValid: true, sanitizedPath: '/app/packages/core' }
```

---

## PathValidator

**Problem:** A model requests file reads/writes using paths it constructed. Those paths might escape the workspace via `../`, symlinks, or absolute paths pointing elsewhere.

**Solution:** Multi-layer validation — boundary checking, traversal detection, symlink resolution, and configurable allowed roots.

### Constructor

```typescript
new PathValidator(options?: {
  workspaceRoot?: string;       // primary allowed root (default: cwd)
  additionalRoots?: string[];   // extra allowed directories
  includeHomeDir?: boolean;     // allow home dir access (default: true)
})
```

Automatically includes `OCTOCODE_HOME` (`~/.octocode`) and any paths from the `ALLOWED_PATHS` env var.

### `validate(path): PathValidationResult`

Resolves symlinks and checks the real path is within allowed roots.

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

Validates the path, then checks if it exists and is readable.

```typescript
await v.exists('/home/user/project/src/index.ts'); // true
await v.exists('/etc/shadow');                      // false (outside root)
await v.exists('/home/user/project/missing.ts');    // false (doesn't exist)
```

### `getType(path): Promise<'file' | 'directory' | 'symlink' | null>`

```typescript
await v.getType('/home/user/project/src');          // 'directory'
await v.getType('/home/user/project/src/index.ts'); // 'file'
await v.getType('/etc/passwd');                      // null (outside root)
```

### `addAllowedRoot(root): void`

Add an allowed root at runtime (e.g., after cloning a repo to a temp directory).

```typescript
v.addAllowedRoot('/tmp/builds');
v.validate('/tmp/builds/output.js');
// → { isValid: true, sanitizedPath: '/tmp/builds/output.js' }
```

### `getAllowedRoots(): readonly string[]`

```typescript
v.getAllowedRoots();
// → ['/home/user/project', '/home/user', '/home/user/.octocode', '/tmp/builds']
```

### Global Instance

A pre-configured singleton for convenience:

```typescript
import { pathValidator, reinitializePathValidator } from '@octocode/security';

pathValidator.validate('./src/index.ts');

// Reconfigure (e.g., in tests)
reinitializePathValidator({ workspaceRoot: '/tmp/test', includeHomeDir: false });
```

---

## ContentSanitizer

**Problem:** File contents, API responses, and user inputs may contain API keys, tokens, or credentials. If these reach model output or logs, they're compromised.

**Solution:** 200+ regex patterns that detect and replace secrets with `[REDACTED-*]` tokens. Works on strings and deeply nested objects.

All methods are static.

### `sanitizeContent(content, filePath?, patterns?): SanitizationResult`

```typescript
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

Pass `filePath` for context-sensitive matching (some patterns only trigger in `.env` files, etc.):

```typescript
ContentSanitizer.sanitizeContent('DB_PASSWORD=hunter2', '.env');
```

### `validateInputParameters(params): ValidationResult`

Recursively sanitizes an object — strips secrets, blocks prototype pollution, enforces size limits.

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

Built-in structural protections:
- Blocks `__proto__`, `constructor`, `prototype` keys (prototype pollution)
- Truncates strings > 10,000 chars
- Truncates arrays > 100 items
- Detects circular references
- Max nesting depth: 20

---

## maskSensitiveData

**Problem:** You want secrets partially visible in logs for debugging, but not fully exposed.

**Solution:** Alternating character masking — every other character replaced with `*`. Enough to identify what was there, not enough to use it.

```typescript
import { maskSensitiveData } from '@octocode/security';

maskSensitiveData('export GITHUB_TOKEN=ghp_abc123xyz');
// → 'export GITHUB_TOKEN=*h*_*b*1*3*y*'

maskSensitiveData('no secrets here');
// → 'no secrets here' (unchanged)
```

**When to use which:** `ContentSanitizer` replaces secrets with `[REDACTED-*]` tokens — use for storage and model output. `maskSensitiveData` partially hides them — use for debug logs where you need a hint of the original value.

```typescript
function maskSensitiveData(
  text: string,
  patterns?: SensitiveDataPattern[]  // default: allRegexPatterns
): string
```

---

## validateCommand

**Problem:** Tool servers spawn subprocesses. If arguments aren't validated, a model can inject shell commands through carefully crafted args.

**Solution:** Whitelist-based command validation. Only allowed commands can run. Each command has its own argument ruleset.

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

**Default allowed commands:** `rg`, `ls`, `find`, `grep`, `git`

Per-command rules:
- **rg** — whitelisted flags only; blocks `--pre` and other exec-capable options
- **find** — blocks `-exec`, `-delete`, `-printf` and other write/execute operators
- **git** — only `clone` (with safe flags) and `sparse-checkout`
- **All commands** — blocks shell metacharacters (`;`, `|`, `` ` ``, `$()`, `${}`) in non-pattern arguments

Extend the allowed command list via the [SecurityRegistry](#securityregistry).

---

## withSecurityValidation

**Problem:** Every tool handler needs the same boilerplate — sanitize input, enforce timeouts, redact secrets from output, log telemetry. Writing this per-tool is error-prone.

**Solution:** Higher-order functions that wrap any async handler. Two variants: one for remote/authenticated tools, one for local tools.

### For remote/authenticated tools

```typescript
import { withSecurityValidation, configureSecurity } from '@octocode/security';
import type { ToolResult } from '@octocode/security';

const searchCode = withSecurityValidation<{ query: string; repo: string }>(
  'github_search_code',
  async (args, authInfo, sessionId) => {
    // args are already sanitized — secrets replaced with [REDACTED-*]
    const results = await githubApi.search(args.query, args.repo);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }
);

// Input sanitized, 60s timeout applied, output scanned for secrets
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

What it does:
1. Sanitizes all input parameters (secrets replaced, prototype pollution blocked)
2. Passes sanitized args + auth to your handler
3. Applies a 60-second timeout (returns error result, doesn't throw)
4. Scans handler output for secrets and redacts them
5. Logs telemetry if configured via `configureSecurity`

### For local tools (no auth)

```typescript
import { withBasicSecurityValidation } from '@octocode/security';

const readFile = withBasicSecurityValidation<{ path: string }>(
  async (args) => {
    const content = await fs.promises.readFile(args.path, 'utf-8');
    return { content: [{ type: 'text', text: content }] };
  },
  'local_read_file'
);

const result = await readFile({ path: './src/index.ts' });
```

```typescript
function withBasicSecurityValidation<T>(
  handler: (sanitizedArgs: T) => Promise<ToolResult>,
  toolName?: string
): (args: unknown, extra?: { signal?: AbortSignal }) => Promise<ToolResult>
```

Same as above minus auth passthrough and session logging.

### configureSecurity

Inject logging, tool classification, and custom sanitizer once at app startup:

```typescript
configureSecurity({
  logToolCall: async (toolName, repos, goal, rGoal, reasoning) => {
    console.log(`[${toolName}] repos=${repos} goal=${goal}`);
  },
  logSessionError: async (toolName, errorCode) => {
    console.error(`[${toolName}] error=${errorCode}`);
  },
  isLoggingEnabled: () => true,
  isLocalTool: (name) => name.startsWith('local'),
  sanitizer: customSanitizer,  // optional: replace ContentSanitizer
});
```

```typescript
function configureSecurity(deps: SecurityDepsConfig): void

interface SecurityDepsConfig {
  sanitizer?: ISanitizer;
  logToolCall?: (toolName: string, repos: string[], goal?: string, rGoal?: string, reasoning?: string) => Promise<void>;
  logSessionError?: (toolName: string, errorCode: string) => Promise<void>;
  isLoggingEnabled?: () => boolean;
  isLocalTool?: (name: string) => boolean;
}
```

---

## SecurityRegistry

**Problem:** The built-in security rules won't match every environment. You need to add company-specific secret patterns, allow custom CLI tools, or ignore internal directories — without forking the package.

**Solution:** A global, mutable registry that all security APIs read from at call time. Register extensions once at startup; every subsequent call to `ContentSanitizer`, `validateCommand`, `shouldIgnore`, etc. picks them up automatically.

```typescript
import { securityRegistry } from '@octocode/security';

// Detect company-internal tokens
securityRegistry.addSecretPatterns([{
  name: 'myInternalToken',
  description: 'Internal service token',
  regex: /\bMYCORP_[A-Z0-9]{32}\b/g,
  matchAccuracy: 'high',
}]);

// Allow additional CLI tools
securityRegistry.addAllowedCommands(['jq', 'yq']);

// Allow additional root directories
securityRegistry.addAllowedRoots(['/data/repos']);

// Ignore company-specific sensitive paths
securityRegistry.addIgnoredPathPatterns([/^\.vault$/]);
securityRegistry.addIgnoredFilePatterns([/^internal[-_]secrets\.ya?ml$/]);

// Reset everything (useful in tests)
securityRegistry.reset();
```

The singleton uses `globalThis` to survive module duplication (vitest transforms, dual ESM/CJS loading, bundler code-splitting).

### Full Interface

```typescript
interface ISecurityRegistry {
  readonly extraSecretPatterns: readonly SensitiveDataPattern[];
  readonly extraAllowedCommands: readonly string[];
  readonly extraAllowedRoots: readonly string[];
  readonly extraIgnoredPathPatterns: readonly RegExp[];
  readonly extraIgnoredFilePatterns: readonly RegExp[];
  addSecretPatterns(patterns: SensitiveDataPattern[]): void;
  addAllowedCommands(commands: string[]): void;
  addAllowedRoots(roots: string[]): void;
  addIgnoredPathPatterns(patterns: RegExp[]): void;
  addIgnoredFilePatterns(patterns: RegExp[]): void;
  reset(): void;
}
```

Exports: `SecurityRegistry` (class), `securityRegistry` (singleton), `ISecurityRegistry` (interface).

---

## validateExecutionContext

**Problem:** Before spawning a subprocess, you need to confirm its working directory is inside the workspace — not `/etc` or someone's home directory.

**Solution:** Validates the `cwd` against workspace root + `OCTOCODE_HOME`, with symlink resolution.

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
  workspaceRoot?: string
): PathValidationResult
```

---

## resolveWorkspaceRoot

Determines the workspace root with a clear priority chain:

1. Explicit parameter (highest)
2. `WORKSPACE_ROOT` env var
3. `process.cwd()` (fallback)

```typescript
import { resolveWorkspaceRoot } from '@octocode/security';

resolveWorkspaceRoot('/explicit/path');  // → '/explicit/path'
resolveWorkspaceRoot();                  // → WORKSPACE_ROOT env var, or process.cwd()
```

```typescript
function resolveWorkspaceRoot(explicit?: string): string
```

---

## Ignored Path Filters

**Problem:** Tool servers shouldn't expose `.env`, `.git/config`, `.ssh/id_rsa`, or `.aws/credentials` — even if they're inside the workspace root.

**Solution:** Pattern-based filtering for sensitive directories and files.

```typescript
import { shouldIgnore, shouldIgnorePath, shouldIgnoreFile } from '@octocode/security';

shouldIgnore('/app/.git/config');      // true
shouldIgnore('/app/.env');             // true
shouldIgnore('/app/src/index.ts');     // false

shouldIgnorePath('.aws/credentials');  // true
shouldIgnorePath('.ssh/id_rsa');       // true

shouldIgnoreFile('.env.local');        // true
shouldIgnoreFile('package.json');      // false
```

```typescript
function shouldIgnore(fullPath: string): boolean      // combined path + file check
function shouldIgnorePath(pathToCheck: string): boolean // directory patterns only
function shouldIgnoreFile(fileName: string): boolean    // file patterns only
```

Access the raw patterns:

```typescript
import { IGNORED_PATH_PATTERNS } from '@octocode/security';  // RegExp[]
import { IGNORED_FILE_PATTERNS } from '@octocode/security';  // RegExp[]
```

Extend with the [SecurityRegistry](#securityregistry):

```typescript
securityRegistry.addIgnoredPathPatterns([/^\.internal$/]);
securityRegistry.addIgnoredFilePatterns([/^secrets\.ya?ml$/]);
```

---

## Regex Patterns

200+ patterns across 13 categories: AI providers (OpenAI, Anthropic, ...), AWS, auth/crypto, analytics, cloud (GCP, Azure, ...), communications (Slack, Twilio, ...), databases (MongoDB, Redis, ...), dev tools (npm, Docker, ...), monitoring (Datadog, Sentry, ...), payments (Stripe, PayPal, ...), VCS tokens (GitHub, GitLab, Bitbucket), and more.

```typescript
import { allRegexPatterns } from '@octocode/security';

for (const pattern of allRegexPatterns) {
  if (pattern.regex.test(content)) {
    console.warn(`Found ${pattern.name}: ${pattern.description}`);
  }
}
```

Each pattern:

```typescript
interface SensitiveDataPattern {
  name: string;                          // e.g. 'GitHub-PAT'
  description: string;                   // human-readable description
  regex: RegExp;                         // the detection pattern
  fileContext?: RegExp;                   // only match in specific file types
  matchAccuracy?: 'high' | 'medium';     // confidence level
}
```

Add custom patterns via the [SecurityRegistry](#securityregistry).

---

## Param Extractors

Utilities for extracting structured metadata from tool parameters. Handles both single-operation and batched (`queries[]`) formats.

```typescript
import { extractResearchFields, extractRepoOwnerFromParams } from '@octocode/security';

// Extract research context from bulk query params
extractResearchFields({
  queries: [{ researchGoal: 'find auth flow', reasoning: 'tracing login' }]
});
// → { researchGoal: 'find auth flow', reasoning: 'tracing login' }

// Extract repo identifiers
extractRepoOwnerFromParams({ owner: 'facebook', repo: 'react' });
// → ['facebook/react']

extractRepoOwnerFromParams({ repository: 'facebook/react' });
// → ['facebook/react']

// Batched format
extractRepoOwnerFromParams({
  queries: [
    { owner: 'facebook', repo: 'react' },
    { owner: 'vercel', repo: 'next.js' },
  ]
});
// → ['facebook/react', 'vercel/next.js']
```

These are used internally by `withSecurityValidation` for telemetry logging.

---

## Path Utilities

### `redactPath`

Replaces absolute paths with safe relative versions for error messages — prevents leaking filesystem structure.

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
// → [/\${/, /\$\(/, /`/, /;/]  — more permissive, for search patterns (allows regex chars)
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
  ISanitizer,
  IWorkspaceRootResolver,
} from '@octocode/security';

import type { SecurityDepsConfig } from '@octocode/security/withSecurityValidation';
import type { ISecurityRegistry } from '@octocode/security/registry';
import type { ResearchFields } from '@octocode/security/paramExtractors';
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

interface ISanitizer {
  sanitizeContent(content: string, filePath?: string): SanitizationResult;
  validateInputParameters(params: Record<string, unknown>): ValidationResult;
}

interface IWorkspaceRootResolver {
  (explicit?: string): string;
}

interface SecurityDepsConfig {
  sanitizer?: ISanitizer;
  logToolCall?: (toolName: string, repos: string[], goal?: string, rGoal?: string, reasoning?: string) => Promise<void>;
  logSessionError?: (toolName: string, errorCode: string) => Promise<void>;
  isLoggingEnabled?: () => boolean;
  isLocalTool?: (name: string) => boolean;
}

interface ISecurityRegistry {
  readonly extraSecretPatterns: readonly SensitiveDataPattern[];
  readonly extraAllowedCommands: readonly string[];
  readonly extraAllowedRoots: readonly string[];
  readonly extraIgnoredPathPatterns: readonly RegExp[];
  readonly extraIgnoredFilePatterns: readonly RegExp[];
  addSecretPatterns(patterns: SensitiveDataPattern[]): void;
  addAllowedCommands(commands: string[]): void;
  addAllowedRoots(roots: string[]): void;
  addIgnoredPathPatterns(patterns: RegExp[]): void;
  addIgnoredFilePatterns(patterns: RegExp[]): void;
  reset(): void;
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCTOCODE_HOME` | `~/.octocode` | Additional allowed root for data files and cloned repos |
| `WORKSPACE_ROOT` | `process.cwd()` | Workspace root when not passed explicitly |
| `ALLOWED_PATHS` | — | Comma-separated extra allowed paths for PathValidator |

---

## Framework Adapters

`ToolResult` is intentionally generic (`{ type: string; text?: string }`). Bridge it to your framework:

**MCP SDK:**

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

**Express middleware:**

```typescript
import { ContentSanitizer } from '@octocode/security';

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

## Complete Export Map

Every module is available as a direct import for tree-shaking:

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
import { SecurityRegistry }           from '@octocode/security/registry';
import { extractResearchFields }      from '@octocode/security/paramExtractors';
import type { ToolResult }            from '@octocode/security/types';
```

---

## License

MIT

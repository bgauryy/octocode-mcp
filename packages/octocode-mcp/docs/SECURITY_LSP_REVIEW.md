# Security & LSP Tools Review

**Date:** 2026-01-07
**Scope:** `packages/octocode-mcp`
**Status:** Action Required

---

## Executive Summary

Comprehensive review of LSP tool implementations and security of shared functionality. The codebase demonstrates solid architectural patterns with dedicated security modules, but several critical issues require attention.

**Overall Assessment:** MEDIUM risk - good foundations with implementation gaps

---

## LSP Tools Implementation Review

### Ratings Summary

| Tool | Score | Status |
|------|-------|--------|
| lspGotoDefinition | 7.5/10 | Good |
| lspFindReferences | 7/10 | Good |
| lspCallHierarchy | 5.5/10 | Needs Work |
| SymbolResolver (shared) | 9/10 | Excellent |
| **Overall** | **6.75/10** | Acceptable |

### lspGotoDefinition (7.5/10)

**Strengths:**
- Clean separation between LSP-based lookup and text-based fallback
- Well-structured error handling with custom `SymbolResolutionError`
- Proper context extraction with line numbering

**Symbol Resolution:**
- Searches exact line first, then alternating pattern (-1, +1, -2, +2)
- Word boundary checking via `isIdentifierChar()`
- Respects `orderHint` for multiple occurrences on same line

**Issues:**
- Silent fallback when LSP fails (no user notification)
- No validation that `contextLines` is non-negative

**Testing Plan:**
- [ ] Test LSP-based definition lookup for functions, classes, variables, types
- [ ] Test text-based fallback when LSP unavailable/fails
- [ ] Verify alternating search pattern (-1, +1, -2, +2) finds symbols within tolerance
- [ ] Test `orderHint` correctly selects Nth occurrence on same line
- [ ] Test word boundary detection with adjacent identifiers (e.g., `fooBar` vs `foo`)
- [ ] Test with negative `contextLines` (should validate or clamp)
- [ ] Test cross-file definition resolution (imports/exports)
- [ ] Test with unicode identifiers and special characters
- [ ] Verify error messages when symbol not found

### lspFindReferences (7/10)

**Strengths:**
- Dual-path approach: LSP semantic lookup vs text-based fallback (ripgrep/grep)
- Good pagination support (`referencesPerPage`, `page`)
- Proper distinction between definitions and references

**Issues:**
- `isLikelyDefinition()` heuristics are overly simplistic
  - Won't detect definitions with decorators/comments above
  - May fail for multi-line definitions
- Duplication between ripgrep and grep implementations
- Regex escaping could be fragile with complex symbol names

**Testing Plan:**
- [ ] Test LSP-based reference lookup across multiple files
- [ ] Test text-based fallback (ripgrep path) when LSP unavailable
- [ ] Test text-based fallback (grep path) when ripgrep unavailable
- [ ] Verify pagination with `referencesPerPage` and `page` parameters
- [ ] Test `includeDeclaration` flag correctly includes/excludes definitions
- [ ] Test `isLikelyDefinition()` with decorators above definition
- [ ] Test `isLikelyDefinition()` with multi-line function signatures
- [ ] Test symbol names with regex special characters (e.g., `$scope`, `__init__`)
- [ ] Test large result sets (100+ references) with pagination
- [ ] Verify no duplicates between ripgrep and grep results

### lspCallHierarchy (5.5/10)

**Critical Bug:** `depth` parameter is documented but **NOT IMPLEMENTED**

```typescript
// Parameter flows through but never used recursively:
depth ?? 1  // Assigned to results but no recursive calls with depth - 1
```

Users expect transitive call chains but only receive direct calls regardless of depth setting.

**Other Issues:**
- Pattern matching too broad (misses method calls, callbacks)
- No caching of results
- Significant code duplication between incoming/outgoing search

**Testing Plan:**
- [ ] Test `depth=1` returns only direct callers/callees
- [ ] Test `depth=2` returns transitive call chains (when implemented)
- [ ] Test `depth=3` with cycle detection (A→B→A should not infinite loop)
- [ ] Test incoming calls: find all callers of a function
- [ ] Test outgoing calls: find all functions called by a function
- [ ] Test method calls (`obj.method()`) are detected
- [ ] Test callback patterns (`arr.map(fn)`) are detected
- [ ] Test pagination with `callsPerPage` and `page` parameters
- [ ] Verify `contextLines` returns correct surrounding code
- [ ] Test with deeply nested call hierarchies
- [ ] Test performance with large codebases (timeout handling)
- [ ] Verify no duplicates in flattened results

### SymbolResolver (9/10)

**Excellent implementation:**
- 30+ test cases covering edge cases
- Proper word boundary detection
- Handles CRLF, empty lines, Unicode
- Default search radius of 2 is reasonable

**Testing Plan:**
- [ ] Maintain coverage of existing 30+ test cases
- [ ] Test word boundaries with underscore identifiers (`_private`, `__dunder__`)
- [ ] Test word boundaries with dollar sign identifiers (`$scope`, `jQuery$`)
- [ ] Test CRLF line endings (Windows files)
- [ ] Test mixed line endings (LF + CRLF in same file)
- [ ] Test empty lines within search radius
- [ ] Test Unicode identifiers (e.g., `变量`, `переменная`)
- [ ] Test search radius edge cases (symbol at line 1 or last line)
- [ ] Test `orderHint` with 3+ occurrences on same line
- [ ] Fuzz test with random character sequences

---

## Security Audit Findings

### Critical Severity

#### 1. Insufficient Command Argument Validation
**File:** `src/security/commandValidator.ts`

Pattern arguments (like `-g`, `--glob`) are completely skipped from dangerous pattern validation.

```typescript
// Current: Pattern args bypass validation
export const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/,
  /\${/,
  /\$\(/,
];
```

**Risk:** Shell injection via pattern arguments
**Remediation:** Validate all arguments, not just non-pattern ones

**Testing Plan:**
- [ ] Test shell injection via `-g` glob pattern (e.g., `-g '$(whoami)'`)
- [ ] Test command chaining in pattern args (e.g., `pattern; rm -rf /`)
- [ ] Test backtick execution in pattern (e.g., `` `id` ``)
- [ ] Test variable expansion in pattern (e.g., `${PATH}`)
- [ ] Verify legitimate regex patterns still work after fix
- [ ] Fuzz test with malformed/malicious pattern strings

#### 2. LSP Server Path Validation Missing
**File:** `src/lsp/client.ts:550-650`

LSP server resolution uses `process.execPath` and user-provided paths without validation:

```typescript
const binPath = path.join(path.dirname(pkgPath), pkg.bin['typescript-language-server']);
return { command: process.execPath, args: [binPath, ...config.args] };
```

**Risk:** Arbitrary code execution via manipulated package.json
**Remediation:** Use PathValidator for all resolved binary paths

**Testing Plan:**
- [ ] Test path traversal in `pkg.bin` entry (e.g., `"../../malicious"`)
- [ ] Test symlink pointing outside workspace
- [ ] Test non-existent binary path handling
- [ ] Test malformed package.json (missing/invalid `bin` field)
- [ ] Test path with null bytes or special characters
- [ ] Verify PathValidator is called before any spawn

#### 3. Token Caching Without Expiration
**File:** `src/github/client.ts`

GitHub tokens cached indefinitely without validation:

```typescript
let cachedToken: string | null = null;
// No expiration, no refresh, no invalidation
```

**Risk:** Stale/compromised tokens remain in cache
**Remediation:** Implement token expiration checks (1-hour timeout)

**Testing Plan:**
- [ ] Test instance reuse within TTL window (should reuse)
- [ ] Test instance recreation after TTL expires (should create new)
- [ ] Test `clearExpiredTokens()` removes only expired entries
- [ ] Test multiple tokens with different expiration times
- [ ] Test token invalidation on 401 response from GitHub
- [ ] Verify no memory leak from accumulated expired entries

### High Severity

#### 4. Rate Limiting Disabled
**File:** `src/github/client.ts:27-40`

```typescript
onRateLimit: (...) => false,  // Always refuses retry
onSecondaryRateLimit: (...) => false,
```

**Risk:** Requests fail immediately on rate limit instead of retrying
**Remediation:** Return `true` and implement exponential backoff

**Testing Plan:**
- [ ] Mock 429 rate limit response, verify retry occurs
- [ ] Test max retries exceeded (should fail gracefully)
- [ ] Test very long `retryAfter` (>60s) is refused
- [ ] Test secondary rate limit handling
- [ ] Verify exponential backoff timing between retries
- [ ] Test concurrent requests during rate limit window

#### 5. TOCTOU Race Conditions
**Files:** All LSP tools

```typescript
// Time 1: Validation
const pathValidation = validateToolPath({...});

// Time 2: File read (race window)
content = await readFile(absolutePath, 'utf-8');
```

**Risk:** File replaced with symlink between validation and read
**Remediation:** Atomic operations or stat-then-read verification

**Testing Plan:**
- [ ] Rapidly swap file with symlink during read operation
- [ ] Test symlink pointing outside workspace after validation
- [ ] Test file deletion between validation and read
- [ ] Test file replacement with different content
- [ ] Verify atomic open+stat+read pattern prevents race
- [ ] Stress test with concurrent file operations

#### 6. GitHub API Error Message Exposure
**File:** `src/github/errors.ts`

Raw GitHub API error messages passed through unchanged, potentially exposing:
- Repository paths
- Usernames
- Internal structure details

**Remediation:** Map errors to generic user-facing messages

**Testing Plan:**
- [ ] Trigger various GitHub API errors (404, 403, 500, etc.)
- [ ] Verify error messages don't expose repository paths
- [ ] Verify error messages don't expose usernames
- [ ] Verify error messages don't expose internal structure
- [ ] Test error mapping covers all common API error codes
- [ ] Verify original error logged server-side for debugging

### Medium Severity

#### 7. Missing Input Length Validation
**File:** `src/security/contentSanitizer.ts`

No limits on nested array items or object depth:

```typescript
// 100 items × 10K chars each = 1MB per parameter
```

**Remediation:** Add total payload size limit (1MB), nesting depth limit (5)

**Testing Plan:**
- [ ] Send 1MB+ payload, verify rejection
- [ ] Test 100 items × 10K chars each (edge case)
- [ ] Test deeply nested arrays (depth > 5), verify rejection
- [ ] Test deeply nested objects (depth > 5), verify rejection
- [ ] Verify legitimate large payloads still work (< 1MB)
- [ ] Test memory usage during validation of large payloads

#### 8. Symbol Name No Length Limit
**Files:** LSP tool schemas

Symbol names have no maximum length validation.

**Remediation:** Add `max(255)` to symbol name schemas

**Testing Plan:**
- [ ] Test 256-char symbol name, verify rejection
- [ ] Test 255-char symbol name, verify acceptance
- [ ] Verify validation error message is clear
- [ ] Test all LSP tool schemas have consistent limits
- [ ] Test empty symbol name (should be rejected by min(1))

#### 9. Path Information in Error Messages
**File:** `src/errorCodes.ts`

Full absolute paths exposed in error messages:

```typescript
`File not found: ${path}. Verify the path exists...`
```

**Risk:** Workspace structure disclosure
**Remediation:** Add configurable path redaction for production

**Testing Plan:**
- [ ] Set `REDACT_ERROR_PATHS=true`, verify full paths hidden
- [ ] Verify relative paths shown when inside workspace
- [ ] Verify `~` used for home directory paths
- [ ] Test paths completely outside workspace (show filename only)
- [ ] Verify redaction disabled by default for development
- [ ] Test error messages remain useful after redaction

---

## Remediation Roadmap

### Phase 1: Critical (Immediate)

| # | Issue | File | Effort |
|---|-------|------|--------|
| 1 | Implement `depth` recursion or remove parameter | `lsp_call_hierarchy.ts` | Medium |
| 2 | Validate LSP server paths before spawn | `lsp/client.ts` | Low |
| 3 | Add token expiration checks | `github/client.ts` | Medium |

### Phase 2: High Priority (This Sprint)

| # | Issue | File | Effort |
|---|-------|------|--------|
| 4 | Validate pattern arguments in command validator | `commandValidator.ts` | Low |
| 5 | Enable rate limiting (return `true`) | `github/client.ts` | Low |
| 6 | Add symbol name length limits | LSP tool schemas | Low |

### Phase 3: Medium Priority (Next Sprint)

| # | Issue | File | Effort |
|---|-------|------|--------|
| 7 | Mitigate TOCTOU with atomic verification | LSP tools | Medium |
| 8 | Add configurable error path redaction | `errorCodes.ts` | Low |
| 9 | Implement transitive call graph traversal | `lsp_call_hierarchy.ts` | High |

---

## Security Strengths

The codebase has solid security foundations:

- **Dedicated Security Modules:** `security/` directory with PathValidator, ContentSanitizer, CommandValidator
- **Path Validation:** Comprehensive symlink resolution and boundary checking
- **Secret Detection:** 20+ regex patterns for credential detection
- **Input Sanitization:** Automatic removal of detected secrets from responses
- **Token Hashing:** GitHub tokens hashed for cache keys (not stored raw)
- **Timeout Protection:** Most spawn operations have timeout limits
- **Workspace Isolation:** ExecutionContextValidator restricts operations

---

## Testing Recommendations

1. **Fuzzing:** Test command validators with malformed inputs
2. **Path Traversal:** Test symlink attacks and race conditions
3. **Token Expiration:** Test behavior when cached tokens expire
4. **Rate Limit Simulation:** Mock GitHub rate limit responses
5. **Input Size:** Send oversized payloads to all validators
6. **TOCTOU:** Rapidly change symlinks during operations
7. **Depth Parameter:** Verify transitive calls work when implemented

---

## Appendix: Files Reviewed

### LSP Implementation
- `src/lsp/client.ts` - Language server management
- `src/lsp/resolver.ts` - Symbol resolution logic
- `src/lsp/types.ts` - Type definitions
- `src/tools/lsp_goto_definition.ts` - Goto definition tool
- `src/tools/lsp_find_references.ts` - Find references tool
- `src/tools/lsp_call_hierarchy.ts` - Call hierarchy tool

### Security Modules
- `src/security/pathValidator.ts` - Path boundary enforcement
- `src/security/commandValidator.ts` - Command injection prevention
- `src/security/contentSanitizer.ts` - Secret removal
- `src/security/regexes.ts` - Secret detection patterns
- `src/security/mask.ts` - Sensitive data masking

### Shared Utilities
- `src/utils/file/toolHelpers.ts` - Path validation helpers
- `src/utils/exec/spawn.ts` - Command execution
- `src/github/client.ts` - GitHub API client
- `src/github/errors.ts` - Error handling
- `src/errorCodes.ts` - Error message generation

---

## Implementation Plan

Detailed technical specifications for each remediation item, based on codebase analysis.

### Phase 1: Critical Fixes

#### Issue 1: Implement `depth` Recursion in Call Hierarchy

**File:** `src/tools/lsp_call_hierarchy.ts`

**Current State (Verified):**
- `depth` parameter accepted in query schema (lines 192, 224, 253, etc.)
- Value stored in results but never used for recursive traversal
- Functions `findIncomingCallsWithPatternMatching` and `findOutgoingCallsWithPatternMatching` don't recurse

**Implementation:**

```typescript
// Option A: Implement recursive traversal (Recommended)
async function findIncomingCallsWithPatternMatching(
  query: LSPCallHierarchyQuery,
  targetFilePath: string,
  targetItem: CallHierarchyItem,
  depth: number,  // Use this!
  callsPerPage: number,
  page: number,
  contextLines: number,
  visited: Set<string> = new Set()  // Prevent cycles
): Promise<CallHierarchyResult> {
  // ... existing search logic ...
  
  if (depth > 1 && callSites.length > 0) {
    // Recursively find callers of callers
    for (const site of callSites) {
      const key = `${site.filePath}:${site.lineNumber}`;
      if (visited.has(key)) continue;
      visited.add(key);
      
      const nestedResult = await findIncomingCallsWithPatternMatching(
        { ...query, symbolName: site.callerName },
        site.filePath,
        site.item,
        depth - 1,
        callsPerPage,
        1, // Reset pagination for nested
        contextLines,
        visited
      );
      // Merge nested results
    }
  }
}

// Option B: Remove parameter (Simpler, less useful)
// Remove `depth` from schema entirely and document as "direct calls only"
```

**Tests to Add:**
- `lsp_call_hierarchy.depth.test.ts` - Verify depth=2 returns transitive calls
- Test cycle detection (A calls B calls A)
- Test depth limit (max 3)

**Effort:** Medium (8-12 hours)

---

#### Issue 2: Validate LSP Server Paths

**File:** `src/lsp/client.ts` (lines 570-590)

**Current State (Verified):**
```typescript
const binPath = path.join(
  path.dirname(pkgPath),
  pkg.bin['typescript-language-server']
);
return { command: process.execPath, args: [binPath, ...config.args] };
```

**Implementation:**

```typescript
import { validateToolPath } from '../security/pathValidator.js';

function resolveLanguageServer(config: { command: string; args: string[]; envVar: string }) {
  // ... existing env var check ...

  if (config.command === 'typescript-language-server') {
    try {
      const pkgPath = require.resolve('typescript-language-server/package.json');
      const pkg = require(pkgPath);
      const binRelativePath = pkg.bin?.['typescript-language-server'];
      
      if (!binRelativePath || typeof binRelativePath !== 'string') {
        throw new Error('Invalid bin entry in package.json');
      }
      
      const binPath = path.join(path.dirname(pkgPath), binRelativePath);
      
      // NEW: Validate resolved path
      const validation = validateToolPath({
        inputPath: binPath,
        workspaceRoot: process.cwd(),
        allowAbsolute: true,
        purpose: 'lsp_server_binary'
      });
      
      if (!validation.isValid) {
        throw new Error(`LSP server path validation failed: ${validation.error}`);
      }
      
      // Verify it's actually a file
      if (!fs.existsSync(validation.absolutePath)) {
        throw new Error(`LSP server binary not found: ${validation.absolutePath}`);
      }
      
      return { command: process.execPath, args: [validation.absolutePath, ...config.args] };
    } catch (e) {
      console.debug('Could not resolve bundled typescript-language-server:', e);
    }
  }
  // ... fallback ...
}
```

**Tests to Add:**
- Test path traversal in `pkg.bin` (e.g., `"../../malicious"`)
- Test symlink resolution
- Test non-existent binary path

**Effort:** Low (2-4 hours)

---

#### Issue 3: Token Expiration Checks

**File:** `src/github/client.ts`

**Current State (Verified):**
- `instances` Map stores Octokit instances keyed by hashed token
- No expiration, no TTL, no invalidation mechanism

**Implementation:**

```typescript
interface CachedInstance {
  client: InstanceType<typeof OctokitWithThrottling>;
  createdAt: number;
}

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const instances = new Map<string, CachedInstance>();

function isExpired(cached: CachedInstance): boolean {
  return Date.now() - cached.createdAt > TOKEN_TTL_MS;
}

export async function getOctokit(
  authInfo?: AuthInfo
): Promise<InstanceType<typeof OctokitWithThrottling>> {
  if (authInfo?.token) {
    const key = hashToken(authInfo.token);
    const cached = instances.get(key);
    
    if (cached && !isExpired(cached)) {
      return cached.client;
    }
    
    // Expired or not cached - create new instance
    const newInstance = createOctokitInstance(authInfo.token, authInfo.apiUrl);
    instances.set(key, { client: newInstance, createdAt: Date.now() });
    return newInstance;
  }
  // ... rest of function ...
}

// Optional: Add cache cleanup
export function clearExpiredTokens(): void {
  for (const [key, cached] of instances.entries()) {
    if (isExpired(cached)) {
      instances.delete(key);
    }
  }
}
```

**Tests to Add:**
- Test instance reuse within TTL
- Test instance recreation after TTL
- Test `clearExpiredTokens()` function

**Effort:** Medium (4-6 hours)

---

### Phase 2: High Priority Fixes

#### Issue 4: Validate Pattern Arguments

**File:** `src/security/commandValidator.ts`

**Current State (Verified):**
```typescript
const isPattern = patternPositions.has(i);
if (isPattern) {
  continue;  // ← Skips ALL validation for pattern args!
}
```

**Implementation:**

```typescript
// Pattern-specific dangerous patterns (subset - allow regex chars but not shell injection)
const PATTERN_DANGEROUS = [
  /\$\{/,      // Variable expansion
  /\$\(/,      // Command substitution
  /`/,         // Backtick substitution
  /[;&|]/,     // Command chaining (but allow in regex)
] as const;

function validateCommandArgs(command: string, args: string[]): CommandValidationResult {
  const patternPositions = getPatternArgPositions(command, args);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const isPattern = patternPositions.has(i);
    
    // Use appropriate validation set
    const dangerousPatterns = isPattern ? PATTERN_DANGEROUS : DANGEROUS_PATTERNS;
    
    for (const dangerousPattern of dangerousPatterns) {
      if (dangerousPattern.test(arg)) {
        return {
          isValid: false,
          error: `Dangerous pattern detected in ${isPattern ? 'search pattern' : 'argument'}: '${arg}'`,
        };
      }
    }
  }
  return { isValid: true };
}
```

**Tests to Add:**
- Test shell injection in `-g` glob pattern
- Test backtick execution in pattern
- Test legitimate regex patterns still work

**Effort:** Low (2-3 hours)

---

#### Issue 5: Enable Rate Limiting

**File:** `src/github/client.ts` (lines 27-40)

**Current State (Verified):**
```typescript
onRateLimit: (...) => false,
onSecondaryRateLimit: (...) => false,
```

**Implementation:**

```typescript
const MAX_RETRIES = 3;

const createThrottleOptions = () => ({
  onRateLimit: (
    retryAfter: number,
    options: { method: string; url: string },
    _octokit: Octokit,
    retryCount: number
  ) => {
    console.warn(
      `Rate limit hit for ${options.method} ${options.url}, ` +
      `retry ${retryCount + 1}/${MAX_RETRIES} after ${retryAfter}s`
    );
    // Retry if under max retries and wait is reasonable (< 60s)
    return retryCount < MAX_RETRIES && retryAfter < 60;
  },
  onSecondaryRateLimit: (
    retryAfter: number,
    options: { method: string; url: string },
    _octokit: Octokit,
    retryCount: number
  ) => {
    console.warn(
      `Secondary rate limit hit for ${options.method} ${options.url}, ` +
      `retry ${retryCount + 1}/${MAX_RETRIES} after ${retryAfter}s`
    );
    return retryCount < MAX_RETRIES && retryAfter < 60;
  },
});
```

**Tests to Add:**
- Mock rate limit response, verify retry
- Test max retries exceeded
- Test very long retry-after is refused

**Effort:** Low (1-2 hours)

---

#### Issue 6: Symbol Name Length Limits

**Files:** 
- `src/scheme/lsp_goto_definition.ts`
- `src/scheme/lsp_find_references.ts`
- `src/scheme/lsp_call_hierarchy.ts`

**Current State (Verified):**
```typescript
symbolName: z.string().min(1).describe(...)
// No max() - accepts unlimited length
```

**Implementation:**

```typescript
// In each schema file, update symbolName validation:
symbolName: z
  .string()
  .min(1)
  .max(255)  // Add this
  .describe(FIELD_DESCRIPTIONS.symbolName),
```

**Tests to Add:**
- Test 256-char symbol name rejected
- Test 255-char symbol name accepted
- Test validation error message

**Effort:** Low (30 minutes)

---

### Phase 3: Medium Priority Fixes

#### Issue 7: TOCTOU Mitigation

**Files:** LSP tool implementations

**Implementation Strategy:**

```typescript
import { openSync, fstatSync, readFileSync, closeSync } from 'fs';

async function readFileWithVerification(
  absolutePath: string,
  expectedWorkspaceRoot: string
): Promise<string> {
  // Open file descriptor
  const fd = openSync(absolutePath, 'r');
  
  try {
    // Stat the open file (not the path - immune to symlink swap)
    const stats = fstatSync(fd);
    
    // Verify it's a regular file
    if (!stats.isFile()) {
      throw new Error('Path is not a regular file');
    }
    
    // Read from the same file descriptor
    const content = readFileSync(fd, 'utf-8');
    return content;
  } finally {
    closeSync(fd);
  }
}
```

**Effort:** Medium (4-6 hours)

---

#### Issue 8: Error Path Redaction

**File:** `src/errorCodes.ts`

**Current State (Verified):**
```typescript
`Cannot access file: ${path}`  // Full absolute path exposed
```

**Implementation:**

```typescript
// Add at top of file
const REDACT_PATHS = process.env.REDACT_ERROR_PATHS === 'true';

function redactPath(absolutePath: string, workspaceRoot?: string): string {
  if (!REDACT_PATHS) return absolutePath;
  
  if (workspaceRoot && absolutePath.startsWith(workspaceRoot)) {
    return absolutePath.slice(workspaceRoot.length).replace(/^\//, '');
  }
  
  // Redact home directory
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length);
  }
  
  // Last resort: just filename
  return path.basename(absolutePath);
}

// Update error functions:
fileAccessFailed: (filePath: string, cause?: Error, workspaceRoot?: string) => {
  const displayPath = redactPath(filePath, workspaceRoot);
  let message = `Cannot access file: ${displayPath}`;
  // ...
}
```

**Effort:** Low (2-3 hours)

---

#### Issue 9: Transitive Call Graph

**File:** `src/tools/lsp_call_hierarchy.ts`

This is a more complex version of Issue 1, adding full transitive traversal with:
- Cycle detection via visited set
- Configurable max depth (cap at 3)
- Result aggregation and deduplication
- Proper pagination across all levels

See Issue 1 implementation for core approach.

**Additional Considerations:**
- Memory limits for large call graphs
- Timeout handling for deep traversal
- Progress indication for long operations

**Effort:** High (12-16 hours)

---

## Verification Checklist

After implementation, verify each fix:

| # | Fix | Verification |
|---|-----|--------------|
| 1 | Depth recursion | Run `lspCallHierarchy` with depth=2, verify transitive results |
| 2 | LSP path validation | Attempt to spawn with `../../malicious` path |
| 3 | Token expiration | Create instance, wait 1hr, verify new instance created |
| 4 | Pattern validation | Run ripgrep with `\`whoami\`` in glob |
| 5 | Rate limiting | Mock 429 response, verify retry |
| 6 | Symbol length | Send 256-char symbol, verify rejection |
| 7 | TOCTOU | Swap symlink during read, verify failure |
| 8 | Path redaction | Set `REDACT_ERROR_PATHS=true`, verify paths hidden |
| 9 | Call graph | Run depth=3 query, verify 3 levels returned |

---

## Timeline Estimate

| Phase | Issues | Total Effort |
|-------|--------|--------------|
| Phase 1 (Critical) | #1, #2, #3 | 14-22 hours |
| Phase 2 (High) | #4, #5, #6 | 3.5-5.5 hours |
| Phase 3 (Medium) | #7, #8, #9 | 18-25 hours |
| **Total** | 9 issues | **35.5-52.5 hours** |

---

*Report generated from automated security analysis*
*Implementation plan added: 2026-01-07*

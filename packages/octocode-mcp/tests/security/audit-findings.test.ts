/**
 * Security Audit Validation Tests
 * GitHub Issue #321 — AgentAudit Report #112
 *
 * These tests validate the findings from the security audit and
 * serve as regression tests once fixes are applied.
 *
 * Findings covered:
 *   Finding 1 — HIGH: Shell injection via exec() in lspReferencesPatterns.ts
 *   Finding 2 — MEDIUM: Telemetry sends repo names and research goals
 *   Finding 6 — LOW: Credential env vars passed to child processes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Finding 1 — HIGH: Shell injection via exec() bypasses safe spawn() pattern
// File: packages/octocode-mcp/src/tools/lsp_find_references/lspReferencesPatterns.ts
// =============================================================================

describe('Finding 1 — Shell injection via exec() in lspReferencesPatterns.ts', () => {
  const sourceFile = resolve(
    __dirname,
    '../../src/tools/lsp_find_references/lspReferencesPatterns.ts'
  );
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should NOT use child_process.exec() — must use spawn() instead', () => {
    // exec() interprets shell metacharacters; spawn() does not.
    // The file lazy-loads exec via getExecAsync.
    const usesExec =
      sourceCode.includes("import('child_process')") &&
      sourceCode.includes('promisify(exec)');

    expect(usesExec).toBe(false);
  });

  it('should NOT construct shell command strings with template literals for rg', () => {
    // Pattern: execAsync(`rg ${rgArgs.map(...)...}`)
    // This is shell string interpolation — vulnerable to injection.
    const hasRgShellInterpolation = /execAsync\s*\(\s*`rg\s/.test(sourceCode);

    expect(hasRgShellInterpolation).toBe(false);
  });

  it('should NOT construct shell command strings with template literals for grep', () => {
    // Pattern: execAsync(`grep -rn ...`)
    // This is shell string interpolation — vulnerable to injection.
    const hasGrepShellInterpolation = /execAsync\s*\(\s*`grep\s/.test(
      sourceCode
    );

    expect(hasGrepShellInterpolation).toBe(false);
  });

  it('should NOT wrap args in single quotes for shell execution (quote-breakout risk)', () => {
    // Pattern: rgArgs.map(a => `'${a}'`)
    // A symbol containing ' would break out of quoting.
    const hasSingleQuoteWrapping = /map\s*\(\s*\w+\s*=>\s*`'/.test(sourceCode);

    expect(hasSingleQuoteWrapping).toBe(false);
  });

  it('should use spawn() not child_process.exec() for command execution', () => {
    // If child_process.exec/execAsync is used to run commands, shell injection is possible
    // even with regex-escaping, since regex escaping doesn't cover shell metacharacters.
    // The fix is to use spawn() which bypasses shell interpretation entirely.
    // Note: importing child_process for spawn is fine; promisify(exec) is the vulnerability.
    const usesExecForCommands =
      sourceCode.includes('execAsync(') ||
      sourceCode.includes('promisify(exec)') ||
      sourceCode.includes('getExecAsync');

    expect(usesExecForCommands).toBe(false);
  });
});

// =============================================================================
// Finding 2 — MEDIUM: Telemetry sends repo names and research goals
// File: packages/octocode-mcp/src/session.ts
// =============================================================================

describe('Finding 2 — Telemetry data exfiltration in session.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/session.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should NOT spread mainResearchGoal into telemetry data objects', () => {
    // Research goals may contain sensitive business context.
    // Pattern to detect: ...(mainResearchGoal && { mainResearchGoal })
    // This was the original vulnerable pattern for spreading into data.
    const hasConditionalSpread =
      sourceCode.includes('mainResearchGoal &&') &&
      sourceCode.includes('{ mainResearchGoal }');

    expect(hasConditionalSpread).toBe(false);
  });

  it('should NOT spread researchGoal into telemetry data objects', () => {
    const hasConditionalSpread =
      sourceCode.includes('researchGoal &&') &&
      sourceCode.includes('{ researchGoal }');

    expect(hasConditionalSpread).toBe(false);
  });

  it('should NOT spread reasoning into telemetry data objects', () => {
    const hasConditionalSpread =
      sourceCode.includes('reasoning &&') &&
      sourceCode.includes('{ reasoning }');

    expect(hasConditionalSpread).toBe(false);
  });

  it('session init should respect the LOG gate (not bypass it)', () => {
    // Current: if (intent !== 'init' && !isLoggingEnabled()) return;
    // Expected: ALL intents should respect the LOG gate
    const initBypassesGate =
      /intent\s*!==\s*['"]init['"]/.test(sourceCode) &&
      sourceCode.includes('isLoggingEnabled');

    expect(initBypassesGate).toBe(false);
  });

  it('should redact or hash repository names before transmission', () => {
    // Repo names may reveal proprietary project names.
    // They should be hashed or redacted before being sent to the telemetry endpoint.
    const hasRedactionOrHashing =
      sourceCode.includes('[redacted]') ||
      sourceCode.includes('createHash') ||
      sourceCode.includes('hash(');

    expect(hasRedactionOrHashing).toBe(true);
  });
});

// =============================================================================
// Finding 6 — LOW: Credential env vars passed to child processes
// File: packages/octocode-mcp/src/utils/exec/spawn.ts
// =============================================================================

describe('Finding 6 — Credential env vars leaked to child processes in spawn.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/exec/spawn.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should include GITHUB_TOKEN in sensitive env vars removal list', () => {
    // GITHUB_TOKEN should not be passed to rg, find, ls, etc.
    const removesGithubToken =
      sourceCode.includes("'GITHUB_TOKEN'") &&
      sourceCode.includes('SENSITIVE_ENV_VARS');

    expect(removesGithubToken).toBe(true);
  });

  it('should include GH_TOKEN in sensitive env vars removal list', () => {
    const removesGhToken =
      sourceCode.includes("'GH_TOKEN'") &&
      sourceCode.includes('SENSITIVE_ENV_VARS');

    expect(removesGhToken).toBe(true);
  });

  it('should include GITLAB_TOKEN in sensitive env vars removal list', () => {
    const removesGitlabToken =
      sourceCode.includes("'GITLAB_TOKEN'") &&
      sourceCode.includes('SENSITIVE_ENV_VARS');

    expect(removesGitlabToken).toBe(true);
  });

  it('should include OCTOCODE_TOKEN in sensitive env vars removal list', () => {
    const removesOctocodeToken =
      sourceCode.includes("'OCTOCODE_TOKEN'") &&
      sourceCode.includes('SENSITIVE_ENV_VARS');

    expect(removesOctocodeToken).toBe(true);
  });

  it('should use allowlist-based env propagation by default (opt-in)', () => {
    const usesAllowlistDefaults =
      sourceCode.includes('DEFAULT_ALLOWED_ENV_VARS') &&
      sourceCode.includes('buildChildProcessEnv');
    expect(usesAllowlistDefaults).toBe(true);
  });

  it('should keep proxy vars out of default local allowlist', () => {
    expect(
      sourceCode.includes(
        'export const DEFAULT_ALLOWED_ENV_VARS = CORE_ALLOWED_ENV_VARS;'
      )
    ).toBe(true);

    const coreAllowlistBlock =
      sourceCode.match(
        /export const CORE_ALLOWED_ENV_VARS =[\s\S]*?\] as const;/
      )?.[0] ?? '';
    expect(coreAllowlistBlock.includes('HTTP_PROXY')).toBe(false);
    expect(coreAllowlistBlock.includes('HTTPS_PROXY')).toBe(false);
    expect(coreAllowlistBlock.includes('NO_PROXY')).toBe(false);
  });

  it('should enforce bounded output size by default to limit memory growth', () => {
    expect(sourceCode.includes('DEFAULT_MAX_OUTPUT_SIZE_BYTES')).toBe(true);
    expect(sourceCode.includes('10 * 1024 * 1024')).toBe(true);
  });
});

describe('Finding 7 — safeExec should not override sensitive env stripping', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/exec/safe.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should not override removeEnvVars with NODE_OPTIONS-only list', () => {
    const hasUnsafeOverride =
      sourceCode.includes("removeEnvVars: ['NODE_OPTIONS']") ||
      sourceCode.includes('removeEnvVars:["NODE_OPTIONS"]');

    expect(hasUnsafeOverride).toBe(false);
  });
});

describe('Finding 8 — LSP child processes should not inherit sensitive env vars', () => {
  const sourceFile = resolve(__dirname, '../../src/lsp/client.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should not pass process.env directly to LSP spawn', () => {
    expect(sourceCode.includes('env: process.env')).toBe(false);
  });

  it('should use allowlist env builder when spawning LSP server', () => {
    const usesAllowlistBuilder =
      sourceCode.includes('buildChildProcessEnv') &&
      sourceCode.includes('TOOLING_ALLOWED_ENV_VARS');
    expect(usesAllowlistBuilder).toBe(true);
  });
});

describe('Finding 9 — LSP config schema should enforce safer command input', () => {
  const sourceFile = resolve(__dirname, '../../src/lsp/schemas.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should require non-empty command with max length', () => {
    const hasCommandConstraints =
      sourceCode.includes('command: z') &&
      sourceCode.includes('.min(1)') &&
      sourceCode.includes('.max(');

    expect(hasCommandConstraints).toBe(true);
  });

  it('should validate extension keys using a regex pattern', () => {
    expect(sourceCode.includes('EXTENSION_KEY_PATTERN')).toBe(true);
  });
});

describe('Finding 10 — Local tool schemes should enforce defensive input bounds', () => {
  const fetchSchemeFile = resolve(
    __dirname,
    '../../src/tools/local_fetch_content/scheme.ts'
  );
  const ripgrepSchemeFile = resolve(
    __dirname,
    '../../src/tools/local_ripgrep/scheme.ts'
  );
  const viewStructureSchemeFile = resolve(
    __dirname,
    '../../src/tools/local_view_structure/scheme.ts'
  );
  let fetchSchemeCode: string;
  let ripgrepSchemeCode: string;
  let viewStructureSchemeCode: string;

  beforeEach(() => {
    fetchSchemeCode = readFileSync(fetchSchemeFile, 'utf-8');
    ripgrepSchemeCode = readFileSync(ripgrepSchemeFile, 'utf-8');
    viewStructureSchemeCode = readFileSync(viewStructureSchemeFile, 'utf-8');
  });

  it('should cap regex/path input sizes in local_fetch_content schema', () => {
    const hasBounds =
      fetchSchemeCode.includes('.max(4096)') &&
      fetchSchemeCode.includes('.max(2000)') &&
      fetchSchemeCode.includes('max 1000 chars in regex mode');

    expect(hasBounds).toBe(true);
  });

  it('should cap pattern/path/glob sizes in local_ripgrep schema', () => {
    const hasBounds =
      ripgrepSchemeCode.includes('.max(2000)') &&
      ripgrepSchemeCode.includes('.max(4096)') &&
      ripgrepSchemeCode.includes('.max(256)') &&
      ripgrepSchemeCode.includes('.max(100)');

    expect(hasBounds).toBe(true);
  });

  it('should cap pattern/path filter sizes in local_view_structure schema', () => {
    const hasBounds =
      viewStructureSchemeCode.includes('.max(4096)') &&
      viewStructureSchemeCode.includes('.max(512)') &&
      viewStructureSchemeCode.includes('.max(50)');

    expect(hasBounds).toBe(true);
  });
});

describe('Finding 11 — LSP user config should reject shell interpreter commands', () => {
  const sourceFile = resolve(__dirname, '../../src/lsp/config.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should define a dangerous shell command denylist', () => {
    const hasShellDenylist =
      sourceCode.includes('DANGEROUS_SHELL_COMMANDS') &&
      sourceCode.includes("'bash'") &&
      sourceCode.includes("'sh'") &&
      sourceCode.includes("'powershell'");

    expect(hasShellDenylist).toBe(true);
  });

  it('should sanitize user language server config before returning it', () => {
    expect(sourceCode.includes('sanitizeUserLanguageServers')).toBe(true);
  });
});

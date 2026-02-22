/**
 * Security Audit Regression Tests — Issue #321 (AgentAudit Report #112)
 *
 * Each test calls REAL code. No source-code string matching.
 *
 * Mocking strategy:
 *   - axios: mocked globally (external HTTP, see setup.ts)
 *   - child_process: mocked globally (external OS, see setup.ts)
 *   - Everything else: REAL imports, REAL execution
 *
 * Coverage unique to this file (not duplicated elsewhere):
 *   Finding 1 — escapeForRegex + command-arg builders (pure functions)
 *   Finding 2 — logToolCall telemetry payload (real session + mocked axios)
 *   Finding 6 — buildChildProcessEnv value leakage (pure function)
 *
 * Full buildChildProcessEnv key/allowlist tests → security-resilience.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  initializeSession,
  resetSessionManager,
  logToolCall,
} from '../../src/session.js';
import { initialize, cleanup } from '../../src/serverConfig.js';
import {
  buildChildProcessEnv,
  SENSITIVE_ENV_VARS,
} from '../../src/utils/exec/spawn.js';
import {
  escapeForRegex,
  buildRipgrepSearchArgs,
  buildGrepSearchArgs,
  buildGrepFilterArgsArray,
} from '../../src/tools/lsp_find_references/lspReferencesPatterns.js';

// =============================================================================
// Finding 1 — HIGH: Shell injection via exec()
//
// escapeForRegex is a pure function — no mocks needed.
// build*Args functions return arrays for spawn() — no shell interpretation.
// =============================================================================

describe('Finding 1 — escapeForRegex + command args safety', () => {
  it('leaves shell metacharacters alone (safe because spawn bypasses shell)', () => {
    expect(escapeForRegex("'; rm -rf / #")).toBe("'; rm -rf / #");
    expect(escapeForRegex('`id`')).toBe('`id`');
  });

  it('escapes every regex metacharacter', () => {
    const meta = '.*+?^${}()|[]\\';
    const escaped = escapeForRegex(meta);
    for (const ch of [
      '*',
      '+',
      '?',
      '^',
      '$',
      '{',
      '}',
      '(',
      ')',
      '|',
      '[',
      ']',
    ]) {
      expect(escaped).toContain(`\\${ch}`);
    }
  });

  it('buildRipgrepSearchArgs returns an array (safe for spawn)', () => {
    const malicious = "'; rm -rf / ; echo '";
    const args = buildRipgrepSearchArgs('/workspace', malicious);

    expect(Array.isArray(args)).toBe(true);
    args.forEach(a => expect(typeof a).toBe('string'));

    // Malicious payload is ONE element, not shell-split
    const hits = args.filter(a => a.includes('rm'));
    expect(hits).toHaveLength(1);
  });

  it('buildGrepSearchArgs returns an array (safe for spawn)', () => {
    const args = buildGrepSearchArgs('/workspace', '$(cat /etc/passwd)');

    expect(Array.isArray(args)).toBe(true);
    args.forEach(a => expect(typeof a).toBe('string'));
  });

  it('buildGrepFilterArgsArray returns a flat string array', () => {
    const args = buildGrepFilterArgsArray(['.ts', '.js']);

    expect(Array.isArray(args)).toBe(true);
    args.forEach(a => expect(typeof a).toBe('string'));
  });

  it('pipe in malicious input is regex-escaped inside the rg pattern arg', () => {
    const args = buildRipgrepSearchArgs('/workspace', 'foo | bash');
    const patternArg = args.find(a => a.includes('foo') && a.includes('bash'));
    expect(patternArg).toBeDefined();
    expect(patternArg).toContain('\\|');
  });
});

// =============================================================================
// Finding 2 — MEDIUM: Telemetry sends repo names and research goals
//
// Mock: axios (external HTTP) — already mocked in setup.ts
// Real: initializeSession, logToolCall, initialize, cleanup
// =============================================================================

describe('Finding 2 — Telemetry excludes sensitive data', () => {
  let savedLog: string | undefined;

  beforeEach(async () => {
    savedLog = process.env.LOG;
    process.env.LOG = 'true';
    cleanup();
    vi.clearAllMocks();
    resetSessionManager();
    vi.mocked(axios.post).mockResolvedValue({ data: 'ok' });
    await initialize();
    initializeSession();
  });

  afterEach(() => {
    if (savedLog === undefined) delete process.env.LOG;
    else process.env.LOG = savedLog;
    cleanup();
    resetSessionManager();
  });

  it('payload contains NONE of mainResearchGoal / researchGoal / reasoning', async () => {
    await logToolCall(
      'githubSearchCode',
      ['facebook/react'],
      'SECRET BUSINESS GOAL',
      'find vulnerable endpoints',
      'because the CEO told me to'
    );

    expect(axios.post).toHaveBeenCalled();
    const call = vi.mocked(axios.post).mock.calls[0];
    const payload = JSON.stringify(call?.[1]);

    expect(payload).not.toContain('SECRET BUSINESS GOAL');
    expect(payload).not.toContain('find vulnerable endpoints');
    expect(payload).not.toContain('because the CEO told me to');
  });

  it('redacts repo names for non-local tools', async () => {
    await logToolCall(
      'githubSearchCode',
      ['wix-private/billing-service', 'wix-private/payments-core'],
      'g',
      'r',
      'r'
    );

    const data = (
      vi.mocked(axios.post).mock.calls[0]?.[1] as Record<string, any>
    )?.data;
    expect(data.repos).toEqual(['[redacted]', '[redacted]']);
  });

  it('sends empty repos for local tools', async () => {
    await logToolCall('localSearchCode', ['/Users/me/secret'], 'g', 'r', 'r');

    const data = (
      vi.mocked(axios.post).mock.calls[0]?.[1] as Record<string, any>
    )?.data;
    expect(data.repos).toEqual([]);
  });

  it('LOG=false blocks ALL telemetry (tool_call + init)', async () => {
    cleanup();
    process.env.LOG = 'false';
    await initialize();
    resetSessionManager();
    vi.mocked(axios.post).mockClear();

    const session = initializeSession();
    await session.logInit();
    await logToolCall('githubSearchCode', ['repo'], 'g', 'r', 'r');

    expect(axios.post).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Finding 6 — LOW: Credential env vars passed to child processes
//
// buildChildProcessEnv is pure — no mocks needed.
// Key/allowlist tests are in security-resilience.test.ts.
// This file tests VALUE leakage: do secret strings appear anywhere in output?
// =============================================================================

describe('Finding 6 — No secret values leak to child env', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [...SENSITIVE_ENV_VARS, 'PATH']) {
      savedEnv[key] = process.env[key];
    }
    // Set every sensitive var to a unique recognizable value
    for (const v of SENSITIVE_ENV_VARS) {
      process.env[v] = `LEAK_${v}_LEAK`;
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('no SENSITIVE_ENV_VARS value appears in any child env entry', () => {
    const env = buildChildProcessEnv();
    const allValues = Object.values(env).filter(Boolean).join('\n');

    for (const v of SENSITIVE_ENV_VARS) {
      expect(allValues, `value of ${v} leaked`).not.toContain(`LEAK_${v}_LEAK`);
    }
  });

  it('non-allowlisted override is silently rejected', () => {
    const env = buildChildProcessEnv({ GITHUB_TOKEN: 'injected-token' });
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(Object.values(env).join('\n')).not.toContain('injected-token');
  });
});

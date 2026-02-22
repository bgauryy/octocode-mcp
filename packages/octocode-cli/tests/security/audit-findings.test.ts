/**
 * Security Audit Regression Tests — CLI Package
 * Issue #321 (AgentAudit Report #112)
 *
 * Each test calls REAL code. No source-code string matching.
 *
 * Mocking strategy:
 *   - global.fetch: mocked (external HTTP) — Finding 5 only
 *   - Everything else: REAL imports, REAL execution
 *
 * Findings covered:
 *   Finding 3 — writeFileContent/writeJsonFile file permissions (real fs)
 *   Finding 4 — getOctocodeServerConfig temp directory safety (pure function)
 *   Finding 5 — fetchRawContent size guardrails (mocked fetch)
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { statSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileContent, writeJsonFile } from '../../src/utils/fs.js';
import {
  getOctocodeServerConfig,
  getOctocodeServerConfigWindows,
} from '../../src/utils/mcp-config.js';
import { fetchRawContent } from '../../src/utils/skills-fetch.js';

// =============================================================================
// Finding 3 — MEDIUM: CLI config files written with world-readable perms
//
// Real fs: writes temp files, checks permissions with statSync
// No mocks.
// =============================================================================

describe('Finding 3 — writeFileContent uses restrictive permissions', () => {
  const testDir = join(tmpdir(), `octocode-audit-f3-${Date.now()}`);

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('files created with mode 0o600 (owner read/write only)', () => {
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, 'config.json');

    expect(writeFileContent(testFile, '{"token":"secret"}')).toBe(true);

    const mode = statSync(testFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('no group/other bits set (not world-readable)', () => {
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, 'sensitive.json');
    writeFileContent(testFile, 'sensitive data');

    const mode = statSync(testFile).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it('writeJsonFile also uses 0o600', () => {
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, 'data.json');

    expect(writeJsonFile(testFile, { key: 'value' })).toBe(true);
    expect(statSync(testFile).mode & 0o777).toBe(0o600);
  });

  it('parent directories created with mode 0o700', () => {
    const nestedFile = join(testDir, 'subdir', 'nested', 'file.txt');
    writeFileContent(nestedFile, 'data');

    const parentMode = statSync(join(testDir, 'subdir')).mode & 0o777;
    expect(parentMode).toBe(0o700);
  });
});

// =============================================================================
// Finding 4 — MEDIUM: Predictable temp file path (/tmp/index.js)
//
// Pure functions: getOctocodeServerConfig, getOctocodeServerConfigWindows
// No mocks.
// =============================================================================

describe('Finding 4 — Direct installer uses unique temp directory', () => {
  it('Linux direct install: mktemp, trap, strict mode, no hardcoded /tmp', () => {
    const config = getOctocodeServerConfig('direct');
    const cmd = config.args!.join(' ');

    expect(cmd).toContain('mktemp -d');
    expect(cmd).toContain('set -euo pipefail');
    expect(cmd).toContain('trap');
    expect(cmd).toContain('rm -rf');
    expect(cmd).toContain('curl -fsSL');
    expect(cmd).not.toContain('/tmp/index.js');
  });

  it('Windows direct install: GetRandomFileName, cleanup, no hardcoded path', () => {
    const config = getOctocodeServerConfigWindows('direct');
    const cmd = config.args!.join(' ');

    expect(cmd).toContain('GetRandomFileName');
    expect(cmd).toContain('Remove-Item');
    expect(cmd).not.toContain('/tmp/index.js');
  });

  it('npx method has no temp files at all', () => {
    const config = getOctocodeServerConfig('npx');
    expect(config.command).toBe('npx');
    expect(config.args).toEqual(['octocode-mcp@latest']);
  });
});

// =============================================================================
// Finding 5 — LOW: Skills marketplace downloads without integrity verification
//
// Mock: global.fetch (external HTTP)
// Real: fetchRawContent (size checks, error handling)
// =============================================================================

describe('Finding 5 — Skills download guardrails', () => {
  const source = {
    id: 'test',
    name: 'Test',
    type: 'github' as const,
    owner: 'test',
    repo: 'test',
    branch: 'main',
    skillsPath: '',
    skillPattern: 'flat-md' as const,
    description: 'test',
    url: 'https://github.com/test/test',
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects body exceeding MAX_CONTENT_SIZE (2MB > 1MB limit)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve('x'.repeat(2 * 1024 * 1024)),
    });

    await expect(fetchRawContent(source, 'SKILL.md')).rejects.toThrow(
      /Content too large/
    );
  });

  it('rejects when Content-Length header exceeds limit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h === 'Content-Length' ? '5000000' : null),
      },
      text: () => Promise.resolve('small'),
    });

    await expect(fetchRawContent(source, 'SKILL.md')).rejects.toThrow(
      /Content too large/
    );
  });

  it('throws on non-OK HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(fetchRawContent(source, 'SKILL.md')).rejects.toThrow(
      /Failed to fetch/
    );
  });

  it('returns content when within size limits', async () => {
    const content = '# My Skill\nValid content.';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve(content),
    });

    expect(await fetchRawContent(source, 'SKILL.md')).toBe(content);
  });
});

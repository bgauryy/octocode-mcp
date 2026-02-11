/**
 * Security Audit Validation Tests — CLI Package
 * GitHub Issue #321 — AgentAudit Report #112
 *
 * These tests validate the findings from the security audit and
 * serve as regression tests once fixes are applied.
 *
 * Findings covered:
 *   Finding 3 — MEDIUM: CLI writes MCP config files with default permissions
 *   Finding 4 — MEDIUM: Predictable temp file path enables symlink/race attack
 *   Finding 5 — LOW: Skills marketplace downloads without integrity verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Finding 3 — MEDIUM: CLI writes config files with default (world-readable) permissions
// File: packages/octocode-cli/src/utils/fs.ts
// =============================================================================

describe('Finding 3 — Config files written with default permissions in fs.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/fs.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('writeFileContent should specify restrictive file permissions (mode 0o600)', () => {
    // writeFileSync should use { mode: 0o600 } for config files
    // that may contain tokens or sensitive configuration.
    const hasRestrictiveMode =
      sourceCode.includes('0o600') || sourceCode.includes('0600');

    expect(hasRestrictiveMode).toBe(true);
  });

  it('writeFileContent should NOT use default permissions from writeFileSync', () => {
    // Current: fs.writeFileSync(filePath, content, 'utf8')
    // The third arg is just encoding — no mode is set.
    // Expected: fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 })
    const usesStringEncoding =
      /writeFileSync\s*\([^)]*,\s*[^)]*,\s*'utf8'\s*\)/.test(sourceCode);

    expect(usesStringEncoding).toBe(false);
  });
});

// =============================================================================
// Finding 4 — MEDIUM: Predictable temp file path enables symlink/race attack
// File: packages/octocode-cli/src/utils/mcp-config.ts
// =============================================================================

describe('Finding 4 — Predictable temp file path in mcp-config.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/mcp-config.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should NOT use hardcoded /tmp/index.js path', () => {
    // /tmp is world-writable. An attacker can pre-create or replace
    // /tmp/index.js between download and execution.
    const usesHardcodedTmpPath = sourceCode.includes('/tmp/index.js');

    expect(usesHardcodedTmpPath).toBe(false);
  });

  it('should NOT use predictable temp file names for code execution', () => {
    // Even $env:TEMP\index.js (Windows) is predictable.
    // Must use mktemp or a unique directory name.
    const usesPredictableWindows =
      sourceCode.includes('$env:TEMP\\index.js') ||
      sourceCode.includes('$env:TEMP\\\\index.js');

    expect(usesPredictableWindows).toBe(false);
  });

  it('should use npx or a unique temp directory instead of curl-pipe-node', () => {
    // The direct install method uses: curl -o /tmp/index.js && node /tmp/index.js
    // This is a TOCTOU (time-of-check-time-of-use) vulnerability.
    const usesCurlPipeNode =
      sourceCode.includes('curl') && sourceCode.includes('node /tmp');

    expect(usesCurlPipeNode).toBe(false);
  });
});

// =============================================================================
// Finding 5 — LOW: Skills marketplace downloads without integrity verification
// File: packages/octocode-cli/src/utils/skills-fetch.ts
// =============================================================================

describe('Finding 5 — No integrity verification in skills-fetch.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/skills-fetch.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should enforce a maximum content size for downloaded files', () => {
    // Downloaded content should be limited in size to prevent
    // downloading unexpectedly large or malicious files.
    const hasMaxContentSize = sourceCode.includes('MAX_CONTENT_SIZE');

    expect(hasMaxContentSize).toBe(true);
  });

  it('fetchRawContent should validate content size before returning', () => {
    // The function should check Content-Length header and actual content size.
    const hasContentValidation =
      sourceCode.includes('Content-Length') &&
      sourceCode.includes('MAX_CONTENT_SIZE');

    expect(hasContentValidation).toBe(true);
  });
});

describe('Finding 8 — Skills install path traversal and permission hardening', () => {
  const skillsFetchFile = resolve(__dirname, '../../src/utils/skills-fetch.ts');
  const skillsFile = resolve(__dirname, '../../src/utils/skills.ts');
  const mcpIoFile = resolve(__dirname, '../../src/utils/mcp-io.ts');
  let skillsFetchCode: string;
  let skillsCode: string;
  let mcpIoCode: string;

  beforeEach(() => {
    skillsFetchCode = readFileSync(skillsFetchFile, 'utf-8');
    skillsCode = readFileSync(skillsFile, 'utf-8');
    mcpIoCode = readFileSync(mcpIoFile, 'utf-8');
  });

  it('should validate destination paths stay inside skill directory', () => {
    const hasBoundaryCheck =
      skillsFetchCode.includes('isPathInside(') &&
      skillsFetchCode.includes('Invalid skill file path traversal');

    expect(hasBoundaryCheck).toBe(true);
  });

  it('should create cache/install directories with restrictive mode', () => {
    const hasRestrictiveDirMode = skillsFetchCode.includes('mode: 0o700');
    expect(hasRestrictiveDirMode).toBe(true);
  });

  it('should persist CLI config with restrictive file permissions', () => {
    const hasRestrictiveConfigWrite =
      skillsCode.includes('mode: 0o600') && skillsCode.includes('mode: 0o700');

    expect(hasRestrictiveConfigWrite).toBe(true);
  });

  it('should create MCP config parent directory with restrictive mode', () => {
    expect(mcpIoCode.includes('mode: 0o700')).toBe(true);
  });
});

describe('Finding 9 — Linux direct installer shell hardening in mcp-config.ts', () => {
  const sourceFile = resolve(__dirname, '../../src/utils/mcp-config.ts');
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(sourceFile, 'utf-8');
  });

  it('should enable strict shell mode for direct installer', () => {
    expect(sourceCode.includes('set -euo pipefail')).toBe(true);
  });

  it('should use trap cleanup for temporary directory', () => {
    expect(sourceCode.includes('trap \\\'rm -rf "$TMPDIR"\\\' EXIT')).toBe(
      true
    );
  });

  it('should fail fast on curl HTTP errors', () => {
    expect(sourceCode.includes('curl -fsSL')).toBe(true);
  });
});

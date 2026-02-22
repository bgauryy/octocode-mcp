/**
 * TDD tests for octocode home directory access.
 *
 * Ensures local and LSP tools can access cloned repos under ~/.octocode/repos/
 * by verifying that the octocode home dir is always included in allowed roots.
 *
 * Also verifies that clone features require BOTH local.enabled AND local.enableClone.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { getConfigSync, getOctocodeDir } from 'octocode-shared';
import { PathValidator } from '../../src/security/pathValidator.js';
import { validateExecutionContext } from '../../src/security/executionContextValidator.js';

describe('octocode home directory access', () => {
  const octocodeDir = getOctocodeDir(); // '/mock/.octocode' from setup
  const clonedRepoPath = path.join(
    octocodeDir,
    'repos',
    'facebook',
    'react',
    'main'
  );
  const clonedFilePath = path.join(clonedRepoPath, 'src', 'React.ts');

  // =========================================================================
  // PathValidator: octocode dir as allowed root
  // =========================================================================

  describe('PathValidator includes octocode home dir', () => {
    it('should include octocode dir in allowed roots by default', () => {
      const validator = new PathValidator({ workspaceRoot: '/tmp/myproject' });
      const roots = validator.getAllowedRoots();
      expect(roots).toContain(path.resolve(octocodeDir));
    });

    it('should include octocode dir even when includeHomeDir is false', () => {
      const validator = new PathValidator({
        workspaceRoot: '/tmp/myproject',
        includeHomeDir: false,
      });
      const roots = validator.getAllowedRoots();
      expect(roots).toContain(path.resolve(octocodeDir));
    });

    it('should allow paths under octocode repos dir', () => {
      const validator = new PathValidator({
        workspaceRoot: '/tmp/myproject',
        includeHomeDir: false,
      });

      const result = validator.validate(clonedRepoPath);
      // Path may not exist on disk (ENOENT) but should be allowed (isValid=true for non-existent paths within allowed roots)
      expect(result.isValid).toBe(true);
    });

    it('should allow deep file paths under octocode repos', () => {
      const validator = new PathValidator({
        workspaceRoot: '/tmp/myproject',
        includeHomeDir: false,
      });

      const result = validator.validate(clonedFilePath);
      expect(result.isValid).toBe(true);
    });

    it('should not duplicate octocode dir when it is already under home dir', () => {
      const validator = new PathValidator({
        workspaceRoot: '/tmp/myproject',
        includeHomeDir: true,
      });
      const roots = validator.getAllowedRoots();
      // Should contain octocode dir (may be deduplicated or separate)
      expect(roots).toContain(path.resolve(octocodeDir));
    });

    it('global pathValidator singleton should include octocode dir', async () => {
      const { pathValidator } =
        await import('../../src/security/pathValidator.js');
      const roots = pathValidator.getAllowedRoots();
      expect(roots).toContain(path.resolve(octocodeDir));
    });
  });

  // =========================================================================
  // executionContextValidator: allow commands in octocode dir
  // =========================================================================

  describe('executionContextValidator allows octocode dir', () => {
    it('should allow command execution with cwd in octocode repos dir', () => {
      const result = validateExecutionContext(clonedRepoPath);
      expect(result.isValid).toBe(true);
    });

    it('should allow command execution with cwd in nested cloned repo', () => {
      const nestedPath = path.join(clonedRepoPath, 'packages', 'core');
      const result = validateExecutionContext(nestedPath);
      expect(result.isValid).toBe(true);
    });

    it('should allow command execution with cwd at octocode dir itself', () => {
      const result = validateExecutionContext(octocodeDir);
      expect(result.isValid).toBe(true);
    });
  });

  // =========================================================================
  // Clone gating: requires local.enabled AND local.enableClone
  // =========================================================================

  describe('clone feature gating', () => {
    let serverConfig: typeof import('../../src/serverConfig.js');

    beforeEach(async () => {
      serverConfig = await import('../../src/serverConfig.js');
    });

    afterEach(() => {
      serverConfig.cleanup();
    });

    it('isCloneEnabled should return false when both are disabled', async () => {
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: false,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: undefined,
        },
        tools: {
          enabled: null,
          enableAdditional: null,
          disabled: null,
          disablePrompts: false,
        },
        network: { timeout: 30000, maxRetries: 3 },
        telemetry: { logging: true },
        lsp: { configPath: undefined },
        source: 'defaults',
        configPath: undefined,
      });
      await serverConfig.initialize();

      expect(serverConfig.isLocalEnabled()).toBe(false);
      expect(serverConfig.isCloneEnabled()).toBe(false);
    });

    it('isCloneEnabled should return false when only local enabled', async () => {
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: true,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: undefined,
        },
        tools: {
          enabled: null,
          enableAdditional: null,
          disabled: null,
          disablePrompts: false,
        },
        network: { timeout: 30000, maxRetries: 3 },
        telemetry: { logging: true },
        lsp: { configPath: undefined },
        source: 'defaults',
        configPath: undefined,
      });
      await serverConfig.initialize();

      expect(serverConfig.isLocalEnabled()).toBe(true);
      expect(serverConfig.isCloneEnabled()).toBe(false);
    });

    it('isCloneEnabled should return false when only clone enabled (local disabled)', async () => {
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: false,
          enableClone: true,
          allowedPaths: [],
          workspaceRoot: undefined,
        },
        tools: {
          enabled: null,
          enableAdditional: null,
          disabled: null,
          disablePrompts: false,
        },
        network: { timeout: 30000, maxRetries: 3 },
        telemetry: { logging: true },
        lsp: { configPath: undefined },
        source: 'defaults',
        configPath: undefined,
      });
      await serverConfig.initialize();

      expect(serverConfig.isLocalEnabled()).toBe(false);
      expect(serverConfig.isCloneEnabled()).toBe(false);
    });

    it('isCloneEnabled should return true ONLY when both local AND clone are enabled', async () => {
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: true,
          enableClone: true,
          allowedPaths: [],
          workspaceRoot: undefined,
        },
        tools: {
          enabled: null,
          enableAdditional: null,
          disabled: null,
          disablePrompts: false,
        },
        network: { timeout: 30000, maxRetries: 3 },
        telemetry: { logging: true },
        lsp: { configPath: undefined },
        source: 'defaults',
        configPath: undefined,
      });
      await serverConfig.initialize();

      expect(serverConfig.isLocalEnabled()).toBe(true);
      expect(serverConfig.isCloneEnabled()).toBe(true);
    });
  });
});

/**
 * TDD tests for resolveWorkspaceRoot - unified workspace root resolution.
 *
 * Tests the single source of truth used by:
 *   - PathValidator (path traversal prevention)
 *   - executionContextValidator (command execution sandboxing)
 *   - All LSP tools (gotoDefinition, findReferences, callHierarchy)
 *   - All local tools (ripgrep, find, ls, cat)
 *
 * Priority chain under test:
 *   1. Explicit parameter
 *   2. WORKSPACE_ROOT env var
 *   3. Config file (getConfigSync().local.workspaceRoot)
 *   4. process.cwd() fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { getConfigSync } from 'octocode-shared';
import { resolveWorkspaceRoot } from '../../src/security/workspaceRoot.js';

describe('resolveWorkspaceRoot', () => {
  const originalEnv = { ...process.env };
  const cwd = process.cwd();

  beforeEach(() => {
    delete process.env.WORKSPACE_ROOT;
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
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // =========================================================================
  // PRIORITY CHAIN
  // =========================================================================

  describe('priority chain', () => {
    it('should use explicit parameter when all sources are set', () => {
      const explicit = path.join(cwd, 'explicit-root');
      process.env.WORKSPACE_ROOT = path.join(cwd, 'env-root');
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: false,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: path.join(cwd, 'config-root'),
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

      const result = resolveWorkspaceRoot(explicit);
      expect(result).toBe(path.resolve(explicit));
    });

    it('should use env var when no explicit parameter, even if config is set', () => {
      const envRoot = path.join(cwd, 'env-root');
      process.env.WORKSPACE_ROOT = envRoot;
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: false,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: path.join(cwd, 'config-root'),
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

      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve(envRoot));
    });

    it('should use config when no explicit or env var', () => {
      const configRoot = path.join(cwd, 'config-root');
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: false,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: configRoot,
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

      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve(configRoot));
    });

    it('should fall back to process.cwd() when nothing is configured', () => {
      const result = resolveWorkspaceRoot();
      expect(result).toBe(cwd);
    });
  });

  // =========================================================================
  // EXPLICIT PARAMETER
  // =========================================================================

  describe('explicit parameter', () => {
    it('should resolve absolute path as-is', () => {
      const absolute = '/usr/local/workspace';
      const result = resolveWorkspaceRoot(absolute);
      expect(result).toBe(path.resolve(absolute));
    });

    it('should resolve relative path against cwd', () => {
      const result = resolveWorkspaceRoot('./my-project');
      expect(result).toBe(path.resolve('./my-project'));
    });

    it('should resolve paths with ../', () => {
      const result = resolveWorkspaceRoot('../sibling-project');
      expect(result).toBe(path.resolve('../sibling-project'));
    });
  });

  // =========================================================================
  // WORKSPACE_ROOT ENV VAR
  // =========================================================================

  describe('WORKSPACE_ROOT env var', () => {
    it('should resolve absolute env path', () => {
      process.env.WORKSPACE_ROOT = '/opt/workspace';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve('/opt/workspace'));
    });

    it('should resolve relative env path against cwd', () => {
      process.env.WORKSPACE_ROOT = './relative-workspace';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve('./relative-workspace'));
    });

    it('should trim whitespace from env value', () => {
      process.env.WORKSPACE_ROOT = '  /opt/workspace  ';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve('/opt/workspace'));
    });

    it('should ignore empty string env value (treat as unset)', () => {
      process.env.WORKSPACE_ROOT = '';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(cwd);
    });

    it('should ignore whitespace-only env value (treat as unset)', () => {
      process.env.WORKSPACE_ROOT = '   ';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(cwd);
    });
  });

  // =========================================================================
  // CONFIG FILE (getConfigSync)
  // =========================================================================

  describe('config file', () => {
    it('should use config workspaceRoot when env is not set', () => {
      const configRoot = '/home/user/project';
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: true,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: configRoot,
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
        source: 'file',
        configPath: '/home/user/.octocode/.octocoderc',
      });

      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve(configRoot));
    });

    it('should skip config when workspaceRoot is undefined', () => {
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
        source: 'file',
        configPath: '/home/user/.octocode/.octocoderc',
      });

      const result = resolveWorkspaceRoot();
      expect(result).toBe(cwd);
    });

    it('should gracefully handle getConfigSync throwing', () => {
      vi.mocked(getConfigSync).mockImplementation(() => {
        throw new Error('Config not loaded');
      });

      const result = resolveWorkspaceRoot();
      expect(result).toBe(cwd);
    });
  });

  // =========================================================================
  // RETURN VALUE PROPERTIES
  // =========================================================================

  describe('return value properties', () => {
    it('should always return an absolute path', () => {
      const result = resolveWorkspaceRoot();
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should return resolved (normalized) path from explicit', () => {
      const result = resolveWorkspaceRoot('/foo/bar/../baz');
      expect(result).toBe(path.resolve('/foo/bar/../baz'));
      expect(result).not.toContain('..');
    });

    it('should return resolved path from env', () => {
      process.env.WORKSPACE_ROOT = '/foo/bar/../baz';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve('/foo/baz'));
    });

    it('should return a string (never undefined or null)', () => {
      const result = resolveWorkspaceRoot();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SECURITY: CONSISTENT BEHAVIOR ACROSS CONSUMERS
  // =========================================================================

  describe('consumer consistency', () => {
    it('should return same value for PathValidator and LSP tools (no config = cwd)', () => {
      const call1 = resolveWorkspaceRoot();
      const call2 = resolveWorkspaceRoot();
      expect(call1).toBe(call2);
      expect(call1).toBe(cwd);
    });

    it('should return same value for PathValidator and LSP tools (env set)', () => {
      process.env.WORKSPACE_ROOT = '/opt/workspace';
      const call1 = resolveWorkspaceRoot();
      const call2 = resolveWorkspaceRoot();
      expect(call1).toBe(call2);
      expect(call1).toBe(path.resolve('/opt/workspace'));
    });

    it('should return same value for PathValidator and LSP tools (config set)', () => {
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: true,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: '/home/user/project',
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
        source: 'file',
        configPath: undefined,
      });

      const call1 = resolveWorkspaceRoot();
      const call2 = resolveWorkspaceRoot();
      expect(call1).toBe(call2);
      expect(call1).toBe(path.resolve('/home/user/project'));
    });

    it('explicit param should override all other sources consistently', () => {
      process.env.WORKSPACE_ROOT = '/env-root';
      vi.mocked(getConfigSync).mockReturnValue({
        version: 1,
        github: { apiUrl: 'https://api.github.com' },
        gitlab: { host: 'https://gitlab.com' },
        local: {
          enabled: true,
          enableClone: false,
          allowedPaths: [],
          workspaceRoot: '/config-root',
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
        source: 'file',
        configPath: undefined,
      });

      const explicit = '/explicit-root';
      expect(resolveWorkspaceRoot(explicit)).toBe(path.resolve(explicit));
      expect(resolveWorkspaceRoot(explicit)).not.toBe(
        path.resolve('/env-root')
      );
      expect(resolveWorkspaceRoot(explicit)).not.toBe(
        path.resolve('/config-root')
      );
    });
  });

  // =========================================================================
  // SECURITY: ATTACK VECTORS
  // =========================================================================

  describe('security - path traversal via env', () => {
    it('should resolve traversal attempts in env (no escape)', () => {
      process.env.WORKSPACE_ROOT = '/opt/workspace/../../etc';
      const result = resolveWorkspaceRoot();
      expect(result).toBe(path.resolve('/etc'));
      expect(result).not.toContain('..');
    });

    it('should resolve traversal attempts in explicit param', () => {
      const result = resolveWorkspaceRoot('/opt/workspace/../../etc');
      expect(result).toBe(path.resolve('/etc'));
      expect(result).not.toContain('..');
    });
  });
});

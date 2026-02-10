/**
 * Configuration Resolver Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  getConfig,
  getConfigSync,
  reloadConfig,
  resolveConfigSync,
  invalidateConfigCache,
  getConfigValue,
  _resetConfigCache,
  _getCacheState,
} from '../../src/config/resolver.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('config/resolver', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetConfigCache();
    // Reset ALL config-related env vars (must match resolver.ts env var checks)
    delete process.env.GITHUB_API_URL;
    delete process.env.GITLAB_HOST;
    delete process.env.ENABLE_LOCAL;
    delete process.env.WORKSPACE_ROOT;
    delete process.env.ALLOWED_PATHS;
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;
    delete process.env.DISABLE_PROMPTS;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.MAX_RETRIES;
    delete process.env.LOG;
    delete process.env.OCTOCODE_LSP_CONFIG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('resolveConfigSync', () => {
    it('returns defaults when no config file exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = resolveConfigSync();

      expect(config.version).toBe(DEFAULT_CONFIG.version);
      expect(config.github.apiUrl).toBe(DEFAULT_CONFIG.github.apiUrl);
      expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
      expect(config.source).toBe('defaults');
    });

    it('loads config from file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: 1,
          github: { apiUrl: 'https://github.example.com/api/v3' },
          local: { enabled: true },
        })
      );

      const config = resolveConfigSync();

      expect(config.github.apiUrl).toBe('https://github.example.com/api/v3');
      expect(config.local.enabled).toBe(true);
      expect(config.source).toBe('file');
    });

    it('env vars override file config', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          github: { apiUrl: 'https://github.example.com/api/v3' },
          local: { enabled: false },
        })
      );

      process.env.GITHUB_API_URL = 'https://env.github.com/api/v3';
      process.env.ENABLE_LOCAL = 'true';

      const config = resolveConfigSync();

      expect(config.github.apiUrl).toBe('https://env.github.com/api/v3');
      expect(config.local.enabled).toBe(true);
      expect(config.source).toBe('mixed');
    });

    it('env vars override defaults when no file', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      process.env.ENABLE_LOCAL = '1';
      process.env.REQUEST_TIMEOUT = '60000';

      const config = resolveConfigSync();

      expect(config.local.enabled).toBe(true);
      expect(config.network.timeout).toBe(60000);
    });

    describe('environment variable parsing', () => {
      beforeEach(() => {
        vi.mocked(existsSync).mockReturnValue(false);
      });

      it('parses GITHUB_API_URL', () => {
        process.env.GITHUB_API_URL = 'https://custom.github.com/api';
        const config = resolveConfigSync();
        expect(config.github.apiUrl).toBe('https://custom.github.com/api');
      });

      it('parses GITLAB_HOST', () => {
        process.env.GITLAB_HOST = 'https://gitlab.example.com';
        const config = resolveConfigSync();
        expect(config.gitlab.host).toBe('https://gitlab.example.com');
      });

      it('parses ENABLE_LOCAL as boolean', () => {
        process.env.ENABLE_LOCAL = 'true';
        expect(resolveConfigSync().local.enabled).toBe(true);

        _resetConfigCache();
        process.env.ENABLE_LOCAL = '1';
        expect(resolveConfigSync().local.enabled).toBe(true);

        _resetConfigCache();
        process.env.ENABLE_LOCAL = 'false';
        expect(resolveConfigSync().local.enabled).toBe(false);

        _resetConfigCache();
        process.env.ENABLE_LOCAL = '0';
        expect(resolveConfigSync().local.enabled).toBe(false);
      });

      it('parses TOOLS_TO_RUN as string array', () => {
        process.env.TOOLS_TO_RUN = 'githubSearchCode,packageSearch';
        const config = resolveConfigSync();
        expect(config.tools.enabled).toEqual([
          'githubSearchCode',
          'packageSearch',
        ]);
      });

      it('parses ENABLE_TOOLS as string array', () => {
        process.env.ENABLE_TOOLS = 'localSearchCode, localViewStructure';
        const config = resolveConfigSync();
        expect(config.tools.enableAdditional).toEqual([
          'localSearchCode',
          'localViewStructure',
        ]);
      });

      it('parses DISABLE_TOOLS as string array', () => {
        process.env.DISABLE_TOOLS = 'packageSearch';
        const config = resolveConfigSync();
        expect(config.tools.disabled).toEqual(['packageSearch']);
      });

      it('parses REQUEST_TIMEOUT as number', () => {
        process.env.REQUEST_TIMEOUT = '45000';
        const config = resolveConfigSync();
        expect(config.network.timeout).toBe(45000);
      });

      it('clamps timeout to valid range', () => {
        process.env.REQUEST_TIMEOUT = '1000'; // Below minimum
        expect(resolveConfigSync().network.timeout).toBe(5000);

        _resetConfigCache();
        process.env.REQUEST_TIMEOUT = '999999'; // Above maximum
        expect(resolveConfigSync().network.timeout).toBe(300000);
      });

      it('clamps REQUEST_TIMEOUT=0 to MIN_TIMEOUT (5000)', () => {
        process.env.REQUEST_TIMEOUT = '0';
        expect(resolveConfigSync().network.timeout).toBe(5000);
      });

      it('parses MAX_RETRIES as number', () => {
        process.env.MAX_RETRIES = '5';
        const config = resolveConfigSync();
        expect(config.network.maxRetries).toBe(5);
      });

      it('clamps maxRetries to valid range', () => {
        process.env.MAX_RETRIES = '-1';
        expect(resolveConfigSync().network.maxRetries).toBe(0);

        _resetConfigCache();
        process.env.MAX_RETRIES = '99';
        expect(resolveConfigSync().network.maxRetries).toBe(10);
      });

      it('allows MAX_RETRIES=0 (valid value, no retries)', () => {
        process.env.MAX_RETRIES = '0';
        expect(resolveConfigSync().network.maxRetries).toBe(0);
      });

      it('parses LOG=false as false', () => {
        process.env.LOG = 'false';
        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(false);
      });

      it('parses LOG=yes as true (default-to-true semantics)', () => {
        process.env.LOG = 'yes';
        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(true);
      });

      it('parses LOG=anything as true (default-to-true semantics)', () => {
        process.env.LOG = 'anything';
        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(true);
      });

      it('parses WORKSPACE_ROOT', () => {
        process.env.WORKSPACE_ROOT = '/custom/workspace';
        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe('/custom/workspace');
      });

      it('trims whitespace from WORKSPACE_ROOT', () => {
        process.env.WORKSPACE_ROOT = '  /custom/workspace  ';
        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe('/custom/workspace');
      });

      it('ignores empty WORKSPACE_ROOT', () => {
        process.env.WORKSPACE_ROOT = '   ';
        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe(
          DEFAULT_CONFIG.local.workspaceRoot
        );
      });

      it('parses ALLOWED_PATHS as comma-separated array', () => {
        process.env.ALLOWED_PATHS = '/path/a,/path/b,/path/c';
        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual([
          '/path/a',
          '/path/b',
          '/path/c',
        ]);
      });

      it('trims whitespace from ALLOWED_PATHS entries', () => {
        process.env.ALLOWED_PATHS = ' /path/a , /path/b ';
        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual(['/path/a', '/path/b']);
      });

      it('filters empty entries from ALLOWED_PATHS', () => {
        process.env.ALLOWED_PATHS = '/path/a,,/path/b,';
        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual(['/path/a', '/path/b']);
      });

      it('parses DISABLE_PROMPTS as boolean', () => {
        process.env.DISABLE_PROMPTS = 'true';
        expect(resolveConfigSync().tools.disablePrompts).toBe(true);

        _resetConfigCache();
        process.env.DISABLE_PROMPTS = '1';
        expect(resolveConfigSync().tools.disablePrompts).toBe(true);

        _resetConfigCache();
        process.env.DISABLE_PROMPTS = 'false';
        expect(resolveConfigSync().tools.disablePrompts).toBe(false);

        _resetConfigCache();
        process.env.DISABLE_PROMPTS = '0';
        expect(resolveConfigSync().tools.disablePrompts).toBe(false);
      });

      it('parses OCTOCODE_LSP_CONFIG', () => {
        process.env.OCTOCODE_LSP_CONFIG = '/custom/lsp-config.json';
        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe('/custom/lsp-config.json');
      });

      it('trims whitespace from OCTOCODE_LSP_CONFIG', () => {
        process.env.OCTOCODE_LSP_CONFIG = '  /custom/lsp-config.json  ';
        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe('/custom/lsp-config.json');
      });

      it('ignores empty OCTOCODE_LSP_CONFIG', () => {
        process.env.OCTOCODE_LSP_CONFIG = '   ';
        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe(DEFAULT_CONFIG.lsp.configPath);
      });

      it('ignores invalid boolean env vars and falls back to default', () => {
        process.env.ENABLE_LOCAL = 'notabool';
        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
      });

      it('ignores invalid number env vars and falls back to default', () => {
        process.env.REQUEST_TIMEOUT = 'notanumber';
        const config = resolveConfigSync();
        expect(config.network.timeout).toBe(DEFAULT_CONFIG.network.timeout);
      });

      it('ignores empty string array env vars', () => {
        process.env.TOOLS_TO_RUN = '';
        const config = resolveConfigSync();
        expect(config.tools.enabled).toBe(DEFAULT_CONFIG.tools.enabled);
      });
    });
  });

  // ============================================================================
  // COMPREHENSIVE FALLBACK CHAIN TESTS: env → file → default
  // ============================================================================

  describe('fallback chain: env → file → default', () => {
    describe('github.apiUrl', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            github: { apiUrl: 'https://file.github.com/api/v3' },
          })
        );
        process.env.GITHUB_API_URL = 'https://env.github.com/api/v3';

        const config = resolveConfigSync();
        expect(config.github.apiUrl).toBe('https://env.github.com/api/v3');
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            github: { apiUrl: 'https://file.github.com/api/v3' },
          })
        );

        const config = resolveConfigSync();
        expect(config.github.apiUrl).toBe('https://file.github.com/api/v3');
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.github.apiUrl).toBe(DEFAULT_CONFIG.github.apiUrl);
      });
    });

    describe('gitlab.host', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            gitlab: { host: 'https://file.gitlab.com' },
          })
        );
        process.env.GITLAB_HOST = 'https://env.gitlab.com';

        const config = resolveConfigSync();
        expect(config.gitlab.host).toBe('https://env.gitlab.com');
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            gitlab: { host: 'https://file.gitlab.com' },
          })
        );

        const config = resolveConfigSync();
        expect(config.gitlab.host).toBe('https://file.gitlab.com');
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.gitlab.host).toBe(DEFAULT_CONFIG.gitlab.host);
      });
    });

    describe('local.enabled', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ local: { enabled: true } })
        );
        process.env.ENABLE_LOCAL = 'false';

        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(false);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ local: { enabled: false } })
        );

        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(false);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
      });
    });

    describe('local.workspaceRoot', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            local: { workspaceRoot: '/file/workspace' },
          })
        );
        process.env.WORKSPACE_ROOT = '/env/workspace';

        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe('/env/workspace');
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            local: { workspaceRoot: '/file/workspace' },
          })
        );

        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe('/file/workspace');
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.local.workspaceRoot).toBe(
          DEFAULT_CONFIG.local.workspaceRoot
        );
      });
    });

    describe('local.allowedPaths', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            local: { allowedPaths: ['/file/path'] },
          })
        );
        process.env.ALLOWED_PATHS = '/env/path1,/env/path2';

        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual(['/env/path1', '/env/path2']);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            local: { allowedPaths: ['/file/path1', '/file/path2'] },
          })
        );

        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual([
          '/file/path1',
          '/file/path2',
        ]);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.local.allowedPaths).toEqual(
          DEFAULT_CONFIG.local.allowedPaths
        );
      });
    });

    describe('tools.enabled (TOOLS_TO_RUN)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { enabled: ['fileTool'] },
          })
        );
        process.env.TOOLS_TO_RUN = 'envTool1,envTool2';

        const config = resolveConfigSync();
        expect(config.tools.enabled).toEqual(['envTool1', 'envTool2']);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { enabled: ['fileTool'] },
          })
        );

        const config = resolveConfigSync();
        expect(config.tools.enabled).toEqual(['fileTool']);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.tools.enabled).toBe(DEFAULT_CONFIG.tools.enabled);
      });
    });

    describe('tools.enableAdditional (ENABLE_TOOLS)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { enableAdditional: ['fileTool'] },
          })
        );
        process.env.ENABLE_TOOLS = 'envTool';

        const config = resolveConfigSync();
        expect(config.tools.enableAdditional).toEqual(['envTool']);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { enableAdditional: ['fileTool'] },
          })
        );

        const config = resolveConfigSync();
        expect(config.tools.enableAdditional).toEqual(['fileTool']);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.tools.enableAdditional).toBe(
          DEFAULT_CONFIG.tools.enableAdditional
        );
      });
    });

    describe('tools.disabled (DISABLE_TOOLS)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { disabled: ['fileTool'] },
          })
        );
        process.env.DISABLE_TOOLS = 'envTool';

        const config = resolveConfigSync();
        expect(config.tools.disabled).toEqual(['envTool']);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { disabled: ['fileTool'] },
          })
        );

        const config = resolveConfigSync();
        expect(config.tools.disabled).toEqual(['fileTool']);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.tools.disabled).toBe(DEFAULT_CONFIG.tools.disabled);
      });
    });

    describe('tools.disablePrompts (DISABLE_PROMPTS)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { disablePrompts: false },
          })
        );
        process.env.DISABLE_PROMPTS = 'true';

        const config = resolveConfigSync();
        expect(config.tools.disablePrompts).toBe(true);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            tools: { disablePrompts: true },
          })
        );

        const config = resolveConfigSync();
        expect(config.tools.disablePrompts).toBe(true);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.tools.disablePrompts).toBe(
          DEFAULT_CONFIG.tools.disablePrompts
        );
      });
    });

    describe('network.timeout (REQUEST_TIMEOUT)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ network: { timeout: 20000 } })
        );
        process.env.REQUEST_TIMEOUT = '60000';

        const config = resolveConfigSync();
        expect(config.network.timeout).toBe(60000);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ network: { timeout: 15000 } })
        );

        const config = resolveConfigSync();
        expect(config.network.timeout).toBe(15000);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.network.timeout).toBe(DEFAULT_CONFIG.network.timeout);
      });
    });

    describe('network.maxRetries (MAX_RETRIES)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ network: { maxRetries: 2 } })
        );
        process.env.MAX_RETRIES = '7';

        const config = resolveConfigSync();
        expect(config.network.maxRetries).toBe(7);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ network: { maxRetries: 5 } })
        );

        const config = resolveConfigSync();
        expect(config.network.maxRetries).toBe(5);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.network.maxRetries).toBe(
          DEFAULT_CONFIG.network.maxRetries
        );
      });
    });

    describe('telemetry.logging (LOG)', () => {
      it('LOG=false overrides file logging: true', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ telemetry: { logging: true } })
        );
        process.env.LOG = 'false';

        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(false);
      });

      it('LOG=yes overrides file logging: false (default-to-true semantics)', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ telemetry: { logging: false } })
        );
        process.env.LOG = 'yes';

        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(true);
      });

      it('LOG=anything overrides file logging: false', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ telemetry: { logging: false } })
        );
        process.env.LOG = 'enabled';

        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(true);
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({ telemetry: { logging: false } })
        );

        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(false);
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(DEFAULT_CONFIG.telemetry.logging);
      });
    });

    describe('lsp.configPath (OCTOCODE_LSP_CONFIG)', () => {
      it('env overrides file', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            lsp: { configPath: '/file/lsp-config.json' },
          })
        );
        process.env.OCTOCODE_LSP_CONFIG = '/env/lsp-config.json';

        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe('/env/lsp-config.json');
      });

      it('file overrides default', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(
          JSON.stringify({
            lsp: { configPath: '/file/lsp-config.json' },
          })
        );

        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe('/file/lsp-config.json');
      });

      it('falls back to default when neither env nor file', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const config = resolveConfigSync();
        expect(config.lsp.configPath).toBe(DEFAULT_CONFIG.lsp.configPath);
      });
    });
  });

  // ============================================================================
  // SOURCE DETECTION TESTS
  // ============================================================================

  describe('source detection', () => {
    it('source is "defaults" when no file and no env', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = resolveConfigSync();
      expect(config.source).toBe('defaults');
    });

    it('source is "file" when file exists and no env overrides', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));

      const config = resolveConfigSync();
      expect(config.source).toBe('file');
    });

    it('source is "mixed" when file exists and env overrides are set', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));
      process.env.LOG = 'false';

      const config = resolveConfigSync();
      expect(config.source).toBe('mixed');
    });

    it('source is "defaults" when no file even with env overrides', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.WORKSPACE_ROOT = '/some/path';

      const config = resolveConfigSync();
      // No file → source is 'defaults' even though env overrides exist
      expect(config.source).toBe('defaults');
    });

    it('detects WORKSPACE_ROOT as env override for mixed source', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));
      process.env.WORKSPACE_ROOT = '/env/workspace';

      const config = resolveConfigSync();
      expect(config.source).toBe('mixed');
    });

    it('detects ALLOWED_PATHS as env override for mixed source', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));
      process.env.ALLOWED_PATHS = '/path/a';

      const config = resolveConfigSync();
      expect(config.source).toBe('mixed');
    });

    it('detects DISABLE_PROMPTS as env override for mixed source', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));
      process.env.DISABLE_PROMPTS = 'true';

      const config = resolveConfigSync();
      expect(config.source).toBe('mixed');
    });

    it('detects OCTOCODE_LSP_CONFIG as env override for mixed source', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));
      process.env.OCTOCODE_LSP_CONFIG = '/path/to/config.json';

      const config = resolveConfigSync();
      expect(config.source).toBe('mixed');
    });
  });

  describe('getConfigSync', () => {
    it('returns cached config on subsequent calls', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config1 = getConfigSync();
      const callsAfterFirst = vi.mocked(existsSync).mock.calls.length;

      const config2 = getConfigSync();
      const callsAfterSecond = vi.mocked(existsSync).mock.calls.length;

      expect(config1).toBe(config2); // Same reference
      expect(callsAfterSecond).toBe(callsAfterFirst); // No additional calls on second get
    });

    it('respects cache TTL', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      getConfigSync();
      expect(_getCacheState().cached).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('returns same result as getConfigSync', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const asyncConfig = await getConfig();
      _resetConfigCache();
      const syncConfig = getConfigSync();

      expect(asyncConfig.version).toBe(syncConfig.version);
      expect(asyncConfig.github.apiUrl).toBe(syncConfig.github.apiUrl);
    });
  });

  describe('reloadConfig', () => {
    it('invalidates cache and reloads', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        '{"version": 1, "local": {"enabled": false}}'
      );

      const config1 = getConfigSync();
      expect(config1.local.enabled).toBe(false);

      // Change the file content
      vi.mocked(readFileSync).mockReturnValue(
        '{"version": 1, "local": {"enabled": true}}'
      );

      // Without reload, still returns cached
      const config2 = getConfigSync();
      expect(config2.local.enabled).toBe(false);

      // After reload, returns new value
      const config3 = await reloadConfig();
      expect(config3.local.enabled).toBe(true);
    });
  });

  describe('invalidateConfigCache', () => {
    it('clears the cache', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      getConfigSync();
      expect(_getCacheState().cached).toBe(true);

      invalidateConfigCache();
      expect(_getCacheState().cached).toBe(false);
    });
  });

  describe('getConfigValue', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: 1,
          github: { apiUrl: 'https://api.github.com' },
          local: { enabled: true },
        })
      );
    });

    it('gets top-level value', () => {
      expect(getConfigValue('version')).toBe(1);
    });

    it('gets nested value', () => {
      expect(getConfigValue('github.apiUrl')).toBe('https://api.github.com');
      expect(getConfigValue('local.enabled')).toBe(true);
    });

    it('returns undefined for non-existent path', () => {
      expect(getConfigValue('nonexistent')).toBeUndefined();
      expect(getConfigValue('github.nonexistent')).toBeUndefined();
      expect(getConfigValue('a.b.c.d')).toBeUndefined();
    });
  });

  describe('file config with defaults', () => {
    it('merges file config with defaults', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          github: { apiUrl: 'https://custom.github.com/api/v3' },
          // local not specified - should use defaults
        })
      );

      const config = resolveConfigSync();

      // File value
      expect(config.github.apiUrl).toBe('https://custom.github.com/api/v3');
      // Default value (not in file)
      expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
    });
  });

  describe('error handling', () => {
    it('falls back to defaults on parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{ invalid json }');

      // Should not throw, should return defaults
      const config = resolveConfigSync();
      expect(config.source).toBe('defaults');
      expect(config.github.apiUrl).toBe(DEFAULT_CONFIG.github.apiUrl);
    });

    it('falls back to defaults when config has validation errors', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: 1,
          github: { apiUrl: 'not-a-valid-url' },
          local: { enabled: true },
        })
      );

      const config = resolveConfigSync();

      // Invalid config is dropped entirely — falls back to defaults
      expect(config.source).toBe('defaults');
      expect(config.github.apiUrl).toBe(DEFAULT_CONFIG.github.apiUrl);
      expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
    });

    it('loads config normally when validation has only warnings', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: 1,
          local: { enabled: false },
          unknownKey: 'triggers warning but not error',
        })
      );

      const config = resolveConfigSync();

      // Warnings don't prevent config from loading
      expect(config.source).toBe('file');
      expect(config.local.enabled).toBe(false);
    });

    it('env overrides still apply when invalid config falls back to defaults', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          version: 1,
          network: { timeout: -999 },
        })
      );
      process.env.ENABLE_LOCAL = 'false';

      const config = resolveConfigSync();

      // Invalid config dropped, but env override still applies
      expect(config.local.enabled).toBe(false);
      expect(config.network.timeout).toBe(DEFAULT_CONFIG.network.timeout);
    });
  });
});

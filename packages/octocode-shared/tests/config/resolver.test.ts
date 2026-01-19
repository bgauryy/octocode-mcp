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
    // Reset relevant env vars
    delete process.env.GITHUB_API_URL;
    delete process.env.GITLAB_HOST;
    delete process.env.ENABLE_LOCAL;
    delete process.env.LOCAL;
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.MAX_RETRIES;
    delete process.env.LOG;
    delete process.env.OCTOCODE_TELEMETRY_DISABLED;
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

      it('parses LOCAL as fallback for ENABLE_LOCAL', () => {
        process.env.LOCAL = 'true';
        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(true);
      });

      it('ENABLE_LOCAL takes precedence over LOCAL', () => {
        process.env.ENABLE_LOCAL = 'false';
        process.env.LOCAL = 'true';
        const config = resolveConfigSync();
        expect(config.local.enabled).toBe(false);
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
        expect(config.tools.enabled).toEqual([
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

      it('parses LOG as boolean', () => {
        process.env.LOG = 'false';
        const config = resolveConfigSync();
        expect(config.telemetry.logging).toBe(false);
      });

      it('parses OCTOCODE_TELEMETRY_DISABLED (inverted)', () => {
        process.env.OCTOCODE_TELEMETRY_DISABLED = 'true';
        const config = resolveConfigSync();
        expect(config.telemetry.enabled).toBe(false);

        _resetConfigCache();
        process.env.OCTOCODE_TELEMETRY_DISABLED = 'false';
        expect(resolveConfigSync().telemetry.enabled).toBe(true);
      });
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
          github: { apiUrl: 'https://api.github.com', defaultOrg: 'my-org' },
          local: { enabled: true },
        })
      );
    });

    it('gets top-level value', () => {
      expect(getConfigValue('version')).toBe(1);
    });

    it('gets nested value', () => {
      expect(getConfigValue('github.apiUrl')).toBe('https://api.github.com');
      expect(getConfigValue('github.defaultOrg')).toBe('my-org');
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
          github: { defaultOrg: 'my-org' },
          // local not specified - should use defaults
        })
      );

      const config = resolveConfigSync();

      // File value
      expect(config.github.defaultOrg).toBe('my-org');
      // Default value (not in file)
      expect(config.github.apiUrl).toBe(DEFAULT_CONFIG.github.apiUrl);
      expect(config.local.enabled).toBe(DEFAULT_CONFIG.local.enabled);
      expect(config.local.excludePaths).toEqual(
        DEFAULT_CONFIG.local.excludePaths
      );
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
  });
});

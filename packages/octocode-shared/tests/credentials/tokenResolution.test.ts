/**
 * TDD: tokenResolution — initTokenResolution, resolveToken, resolveTokenWithRefresh, resolveTokenFull
 *
 * Fills gap: uninitialized resolution error path, isolated DI init, gh-cli fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_VARS = ['OCTOCODE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;
const savedEnv: Record<string, string | undefined> = {};

function saveAndClearEnv() {
  for (const v of ENV_VARS) {
    savedEnv[v] = process.env[v];
    delete process.env[v];
  }
}

function restoreEnv() {
  for (const v of ENV_VARS) {
    if (savedEnv[v] !== undefined) {
      process.env[v] = savedEnv[v];
    } else {
      delete process.env[v];
    }
  }
}

describe('tokenResolution', () => {
  beforeEach(() => {
    saveAndClearEnv();
    vi.resetModules();
  });

  afterEach(restoreEnv);

  async function loadModule() {
    return import('../../src/credentials/tokenResolution.js');
  }

  describe('initTokenResolution', () => {
    it('throws when resolveToken called before init', async () => {
      const mod = await loadModule();
      await expect(mod.resolveToken()).rejects.toThrow(
        'Token resolution not initialized'
      );
    });

    it('succeeds after initTokenResolution is called', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn().mockResolvedValue(null),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });
      const result = await mod.resolveToken();
      expect(result).toBeNull();
    });
  });

  describe('resolveToken', () => {
    it('returns env token with highest priority', async () => {
      process.env.OCTOCODE_TOKEN = 'env-token';
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn(),
      });

      const result = await mod.resolveToken();
      expect(result).toEqual({
        token: 'env-token',
        source: 'env:OCTOCODE_TOKEN',
      });
    });

    it('falls back to storage when no env token', async () => {
      const mod = await loadModule();
      const getToken = vi.fn().mockResolvedValue('stored-token');
      mod.initTokenResolution({
        getToken,
        getTokenWithRefresh: vi.fn(),
      });

      const result = await mod.resolveToken('github.com');
      expect(result).toEqual({ token: 'stored-token', source: 'file' });
      expect(getToken).toHaveBeenCalledWith('github.com');
    });

    it('returns null when neither env nor storage has token', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn().mockResolvedValue(null),
        getTokenWithRefresh: vi.fn(),
      });

      expect(await mod.resolveToken()).toBeNull();
    });
  });

  describe('resolveTokenWithRefresh', () => {
    it('returns env token without refresh', async () => {
      process.env.GH_TOKEN = 'env-gh';
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn(),
      });

      const result = await mod.resolveTokenWithRefresh();
      expect(result).toMatchObject({
        token: 'env-gh',
        source: 'env:GH_TOKEN',
        wasRefreshed: false,
      });
    });

    it('returns file token with wasRefreshed=false when not refreshed', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn().mockResolvedValue({
          token: 'stored',
          source: 'cache',
          username: 'user1',
        }),
      });

      const result = await mod.resolveTokenWithRefresh();
      expect(result).toMatchObject({
        token: 'stored',
        source: 'file',
        wasRefreshed: false,
        username: 'user1',
      });
    });

    it('returns wasRefreshed=true when token was refreshed', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn().mockResolvedValue({
          token: 'refreshed-tok',
          source: 'refreshed',
          username: 'user1',
        }),
      });

      const result = await mod.resolveTokenWithRefresh();
      expect(result?.wasRefreshed).toBe(true);
    });

    it('returns refreshError when refresh fails', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn().mockResolvedValue({
          token: null,
          source: null,
          refreshError: 'API timeout',
        }),
      });

      const result = await mod.resolveTokenWithRefresh();
      expect(result).toMatchObject({
        token: '',
        source: null,
        refreshError: 'API timeout',
      });
    });

    it('returns null when no token and no refresh error', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      expect(await mod.resolveTokenWithRefresh()).toBeNull();
    });
  });

  describe('resolveTokenFull', () => {
    it('prefers env over storage over gh-cli', async () => {
      process.env.GITHUB_TOKEN = 'env-val';
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn(),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: vi.fn().mockReturnValue('gh-cli-val'),
      });
      expect(result?.source).toBe('env:GITHUB_TOKEN');
    });

    it('falls back to gh-cli when storage has no token', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: vi.fn().mockReturnValue('gh-cli-token'),
      });
      expect(result).toMatchObject({
        token: 'gh-cli-token',
        source: 'gh-cli',
      });
    });

    it('trims gh-cli token', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: () => '  spaced  ',
      });
      expect(result?.token).toBe('spaced');
    });

    it('handles gh-cli throwing error gracefully', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: () => {
          throw new Error('gh not found');
        },
      });
      expect(result).toBeNull();
    });

    it('returns refreshError from storage when gh-cli also fails', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi.fn().mockResolvedValue({
          token: null,
          source: null,
          refreshError: 'token expired',
        }),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: () => null,
      });
      expect(result).toMatchObject({
        token: '',
        source: null,
        refreshError: 'token expired',
      });
    });

    it('returns null when no token source available and no getGhCliToken', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      expect(await mod.resolveTokenFull()).toBeNull();
    });

    it('passes hostname to gh-cli getter', async () => {
      const mod = await loadModule();
      const ghCliGetter = vi.fn().mockReturnValue(null);
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      await mod.resolveTokenFull({
        hostname: 'enterprise.example.com',
        getGhCliToken: ghCliGetter,
      });
      expect(ghCliGetter).toHaveBeenCalledWith('enterprise.example.com');
    });

    it('supports async gh-cli getter', async () => {
      const mod = await loadModule();
      mod.initTokenResolution({
        getToken: vi.fn(),
        getTokenWithRefresh: vi
          .fn()
          .mockResolvedValue({ token: null, source: null }),
      });

      const result = await mod.resolveTokenFull({
        getGhCliToken: async () => 'async-gh-token',
      });
      expect(result?.token).toBe('async-gh-token');
    });
  });
});

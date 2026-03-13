import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, initialize, getServerConfig } from '../src/serverConfig.js';
import {
  getBitbucketConfig,
  getBitbucketHost,
  getBitbucketToken,
  getBitbucketTokenSource,
  getBitbucketUsername,
  isBitbucketConfigured,
} from '../src/bitbucketConfig.js';
import {
  _setTokenResolvers,
  _resetTokenResolvers,
} from '../src/serverConfig.js';

describe('BitbucketConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    delete process.env.BITBUCKET_TOKEN;
    delete process.env.BB_TOKEN;
    delete process.env.BITBUCKET_HOST;
    delete process.env.BITBUCKET_USERNAME;

    _setTokenResolvers({ resolveTokenFull: vi.fn(async () => null) });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    cleanup();
    _resetTokenResolvers();
  });

  describe('Host resolution via shared config (RFC fix)', () => {
    it('should return default host when no env var or config file is set', () => {
      const host = getBitbucketHost();
      expect(host).toBe('https://api.bitbucket.org/2.0');
    });

    it('should use BITBUCKET_HOST env var when set', () => {
      process.env.BITBUCKET_HOST = 'https://bitbucket.mycompany.com/2.0';
      const host = getBitbucketHost();
      expect(host).toBe('https://bitbucket.mycompany.com/2.0');
    });

    it('should propagate host into full config object', () => {
      process.env.BITBUCKET_HOST = 'https://custom-bb.example.com';
      process.env.BITBUCKET_TOKEN = 'test-token';
      const config = getBitbucketConfig();
      expect(config.host).toBe('https://custom-bb.example.com');
      expect(config.token).toBe('test-token');
      expect(config.isConfigured).toBe(true);
    });

    it('should reach ServerConfig.bitbucket.host via initialize()', async () => {
      process.env.BITBUCKET_HOST = 'https://bb-from-env.example.com';
      process.env.BITBUCKET_TOKEN = 'bb-tok';
      await initialize();
      const serverConfig = getServerConfig();
      expect(serverConfig.bitbucket?.host).toBe(
        'https://bb-from-env.example.com'
      );
    });

    it('should use default host in ServerConfig when no env var is set', async () => {
      process.env.BITBUCKET_TOKEN = 'bb-tok';
      await initialize();
      const serverConfig = getServerConfig();
      expect(serverConfig.bitbucket?.host).toBe(
        'https://api.bitbucket.org/2.0'
      );
    });
  });

  describe('Token resolution', () => {
    it('should prefer BITBUCKET_TOKEN over BB_TOKEN', () => {
      process.env.BITBUCKET_TOKEN = 'primary';
      process.env.BB_TOKEN = 'fallback';
      expect(getBitbucketToken()).toBe('primary');
      expect(getBitbucketTokenSource()).toBe('env:BITBUCKET_TOKEN');
    });

    it('should fall back to BB_TOKEN', () => {
      process.env.BB_TOKEN = 'fallback';
      expect(getBitbucketToken()).toBe('fallback');
      expect(getBitbucketTokenSource()).toBe('env:BB_TOKEN');
    });

    it('should return null when no token is set', () => {
      expect(getBitbucketToken()).toBeNull();
      expect(getBitbucketTokenSource()).toBe('none');
      expect(isBitbucketConfigured()).toBe(false);
    });

    it('should trim whitespace from token', () => {
      process.env.BITBUCKET_TOKEN = '  trimmed-token  ';
      expect(getBitbucketToken()).toBe('trimmed-token');
    });
  });

  describe('Username resolution', () => {
    it('should return username when set', () => {
      process.env.BITBUCKET_USERNAME = 'myuser';
      expect(getBitbucketUsername()).toBe('myuser');
    });

    it('should return null when not set', () => {
      expect(getBitbucketUsername()).toBeNull();
    });

    it('should trim whitespace from username', () => {
      process.env.BITBUCKET_USERNAME = '  myuser  ';
      expect(getBitbucketUsername()).toBe('myuser');
    });
  });

  describe('Full config shape', () => {
    it('should return complete config when fully configured', () => {
      process.env.BITBUCKET_TOKEN = 'my-token';
      process.env.BITBUCKET_USERNAME = 'myuser';
      process.env.BITBUCKET_HOST = 'https://custom.bb.com';

      const config = getBitbucketConfig();
      expect(config).toEqual({
        host: 'https://custom.bb.com',
        token: 'my-token',
        username: 'myuser',
        tokenSource: 'env:BITBUCKET_TOKEN',
        isConfigured: true,
      });
    });

    it('should return unconfigured shape when no token', () => {
      const config = getBitbucketConfig();
      expect(config.token).toBeNull();
      expect(config.isConfigured).toBe(false);
      expect(config.tokenSource).toBe('none');
      expect(config.host).toBe('https://api.bitbucket.org/2.0');
    });
  });
});

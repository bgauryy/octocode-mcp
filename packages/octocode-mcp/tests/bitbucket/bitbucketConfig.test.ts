import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBitbucketConfig,
  getBitbucketToken,
  getBitbucketHost,
  getBitbucketUsername,
  getBitbucketTokenSource,
  isBitbucketConfigured,
} from '../../src/bitbucketConfig.js';

describe('bitbucketConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BITBUCKET_TOKEN;
    delete process.env.BB_TOKEN;
    delete process.env.BITBUCKET_HOST;
    delete process.env.BITBUCKET_USERNAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getBitbucketToken', () => {
    it('should return BITBUCKET_TOKEN when set', () => {
      process.env.BITBUCKET_TOKEN = 'primary-token';
      expect(getBitbucketToken()).toBe('primary-token');
    });

    it('should fall back to BB_TOKEN', () => {
      process.env.BB_TOKEN = 'fallback-token';
      expect(getBitbucketToken()).toBe('fallback-token');
    });

    it('should prefer BITBUCKET_TOKEN over BB_TOKEN', () => {
      process.env.BITBUCKET_TOKEN = 'primary';
      process.env.BB_TOKEN = 'fallback';
      expect(getBitbucketToken()).toBe('primary');
    });

    it('should return null when no token is set', () => {
      expect(getBitbucketToken()).toBeNull();
    });

    it('should trim whitespace from token', () => {
      process.env.BITBUCKET_TOKEN = '  spaced-token  ';
      expect(getBitbucketToken()).toBe('spaced-token');
    });
  });

  describe('getBitbucketHost', () => {
    it('should return default host when BITBUCKET_HOST is not set', () => {
      expect(getBitbucketHost()).toBe('https://api.bitbucket.org/2.0');
    });

    it('should return custom host when BITBUCKET_HOST is set', () => {
      process.env.BITBUCKET_HOST = 'https://my-bb.example.com';
      expect(getBitbucketHost()).toBe('https://my-bb.example.com');
    });

    it('should trim whitespace from host', () => {
      process.env.BITBUCKET_HOST = '  https://custom.bb.com  ';
      expect(getBitbucketHost()).toBe('https://custom.bb.com');
    });
  });

  describe('getBitbucketUsername', () => {
    it('should return null when BITBUCKET_USERNAME is not set', () => {
      expect(getBitbucketUsername()).toBeNull();
    });

    it('should return username when set', () => {
      process.env.BITBUCKET_USERNAME = 'myuser';
      expect(getBitbucketUsername()).toBe('myuser');
    });

    it('should trim whitespace from username', () => {
      process.env.BITBUCKET_USERNAME = '  user  ';
      expect(getBitbucketUsername()).toBe('user');
    });
  });

  describe('getBitbucketTokenSource', () => {
    it('should return env:BITBUCKET_TOKEN when BITBUCKET_TOKEN is set', () => {
      process.env.BITBUCKET_TOKEN = 'token';
      expect(getBitbucketTokenSource()).toBe('env:BITBUCKET_TOKEN');
    });

    it('should return env:BB_TOKEN when BB_TOKEN is set', () => {
      process.env.BB_TOKEN = 'token';
      expect(getBitbucketTokenSource()).toBe('env:BB_TOKEN');
    });

    it('should return none when no token is set', () => {
      expect(getBitbucketTokenSource()).toBe('none');
    });
  });

  describe('isBitbucketConfigured', () => {
    it('should return true when token is available', () => {
      process.env.BITBUCKET_TOKEN = 'token';
      expect(isBitbucketConfigured()).toBe(true);
    });

    it('should return false when no token is available', () => {
      expect(isBitbucketConfigured()).toBe(false);
    });
  });

  describe('getBitbucketConfig', () => {
    it('should return full config with BITBUCKET_TOKEN', () => {
      process.env.BITBUCKET_TOKEN = 'my-token';
      process.env.BITBUCKET_USERNAME = 'myuser';

      const config = getBitbucketConfig();
      expect(config.token).toBe('my-token');
      expect(config.username).toBe('myuser');
      expect(config.tokenSource).toBe('env:BITBUCKET_TOKEN');
      expect(config.isConfigured).toBe(true);
      expect(config.host).toBe('https://api.bitbucket.org/2.0');
    });

    it('should return full config with BB_TOKEN fallback', () => {
      process.env.BB_TOKEN = 'bb-token';

      const config = getBitbucketConfig();
      expect(config.token).toBe('bb-token');
      expect(config.tokenSource).toBe('env:BB_TOKEN');
      expect(config.isConfigured).toBe(true);
    });

    it('should return unconfigured state when no token', () => {
      const config = getBitbucketConfig();
      expect(config.token).toBeNull();
      expect(config.tokenSource).toBe('none');
      expect(config.isConfigured).toBe(false);
    });

    it('should use custom BITBUCKET_HOST', () => {
      process.env.BITBUCKET_TOKEN = 'token';
      process.env.BITBUCKET_HOST = 'https://custom.bb.com';

      const config = getBitbucketConfig();
      expect(config.host).toBe('https://custom.bb.com');
    });
  });
});

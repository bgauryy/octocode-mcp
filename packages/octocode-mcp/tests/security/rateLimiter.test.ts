import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  checkApiLimit,
  checkAuthLimit,
  checkTokenLimit,
} from '../../src/security/rateLimiter';

describe('RateLimiter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    RateLimiter.resetAllLimits();

    // Reset initialization state
    RateLimiter['initialized'] = false;
    if (RateLimiter['cleanupInterval']) {
      clearInterval(RateLimiter['cleanupInterval']);
      RateLimiter['cleanupInterval'] = null;
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    RateLimiter.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      RateLimiter.initialize();

      const config = RateLimiter.getConfig();
      expect(config.apiRequestsPerHour).toBe(1000);
      expect(config.authAttemptsPerHour).toBe(10);
      expect(config.tokenRequestsPerHour).toBe(50);

      const stats = RateLimiter.getStats();
      expect(stats.initialized).toBe(true);
    });

    it('should initialize with custom configuration from environment', () => {
      process.env.RATE_LIMIT_API_HOUR = '2000';
      process.env.RATE_LIMIT_AUTH_HOUR = '20';
      process.env.RATE_LIMIT_TOKEN_HOUR = '100';

      RateLimiter.initialize();

      const config = RateLimiter.getConfig();
      expect(config.apiRequestsPerHour).toBe(2000);
      expect(config.authAttemptsPerHour).toBe(20);
      expect(config.tokenRequestsPerHour).toBe(100);
    });

    it('should handle invalid environment values', () => {
      process.env.RATE_LIMIT_API_HOUR = 'invalid';
      process.env.RATE_LIMIT_AUTH_HOUR = '-10';

      RateLimiter.initialize();

      const config = RateLimiter.getConfig();
      expect(config.apiRequestsPerHour).toBe(1000); // Falls back to default
      expect(config.authAttemptsPerHour).toBe(1); // Math.max(1, -10) = 1
    });

    it('should be safe to call initialize multiple times', () => {
      RateLimiter.initialize();
      RateLimiter.initialize();

      const stats = RateLimiter.getStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('checkLimit', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should allow requests within limits', async () => {
      const result = await RateLimiter.checkLimit('test-user', 'api');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999); // 1000 - 1
      expect(result.limit).toBe(1000);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should deny requests exceeding limits', async () => {
      // Set a low limit for testing
      RateLimiter.updateConfig({ apiRequestsPerHour: 2 });

      // First request should be allowed
      const result1 = await RateLimiter.checkLimit('test-user', 'api');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(1);

      // Second request should be allowed
      const result2 = await RateLimiter.checkLimit('test-user', 'api');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(0);

      // Third request should be denied
      const result3 = await RateLimiter.checkLimit('test-user', 'api');
      expect(result3.allowed).toBe(false);
      expect(result3.remaining).toBe(0);
    });

    it('should handle different action types', async () => {
      const apiResult = await RateLimiter.checkLimit('test-user', 'api');
      const authResult = await RateLimiter.checkLimit('test-user', 'auth');
      const tokenResult = await RateLimiter.checkLimit('test-user', 'token');

      expect(apiResult.allowed).toBe(true);
      expect(authResult.allowed).toBe(true);
      expect(tokenResult.allowed).toBe(true);

      expect(apiResult.limit).toBe(1000);
      expect(authResult.limit).toBe(10);
      expect(tokenResult.limit).toBe(50);
    });

    it('should handle check without incrementing', async () => {
      const result1 = await RateLimiter.checkLimit('test-user', 'api', {
        increment: false,
      });
      const result2 = await RateLimiter.checkLimit('test-user', 'api', {
        increment: false,
      });

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(result2.remaining); // Should be the same
    });

    it('should handle custom limits', async () => {
      const result = await RateLimiter.checkLimit('test-user', 'api', {
        customLimit: 5,
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(4);
    });

    it('should reset window after expiry', async () => {
      // Set a very short window for testing
      const userLimits = RateLimiter['getUserLimits']('test-user');
      userLimits.api.windowSize = 100; // 100ms
      userLimits.api.requests = 999; // Almost at limit

      const result1 = await RateLimiter.checkLimit('test-user', 'api');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(0);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const result2 = await RateLimiter.checkLimit('test-user', 'api');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(999); // Reset
    });

    it('should isolate limits between users', async () => {
      RateLimiter.updateConfig({ apiRequestsPerHour: 1 });

      const result1 = await RateLimiter.checkLimit('user1', 'api');
      const result2 = await RateLimiter.checkLimit('user2', 'api');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);

      // Both users should be at their limit now
      const result3 = await RateLimiter.checkLimit('user1', 'api');
      const result4 = await RateLimiter.checkLimit('user2', 'api');

      expect(result3.allowed).toBe(false);
      expect(result4.allowed).toBe(false);
    });

    it('should allow all requests when not initialized', async () => {
      // Don't initialize
      const result = await RateLimiter.checkLimit('test-user', 'api');

      expect(result.allowed).toBe(true);
    });
  });

  describe('recordAction', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should increment counter', () => {
      RateLimiter.recordAction('test-user', 'api');

      const usage = RateLimiter.getUsage('test-user');
      expect(usage.api.current).toBe(1);
      expect(usage.auth.current).toBe(0);
      expect(usage.token.current).toBe(0);
    });

    it('should handle different action types', () => {
      RateLimiter.recordAction('test-user', 'api');
      RateLimiter.recordAction('test-user', 'auth');
      RateLimiter.recordAction('test-user', 'token');

      const usage = RateLimiter.getUsage('test-user');
      expect(usage.api.current).toBe(1);
      expect(usage.auth.current).toBe(1);
      expect(usage.token.current).toBe(1);
    });

    it('should reset window when expired', () => {
      const userLimits = RateLimiter['getUserLimits']('test-user');
      userLimits.api.windowSize = 50; // 50ms
      userLimits.api.requests = 5;

      // Wait for window to expire
      setTimeout(() => {
        RateLimiter.recordAction('test-user', 'api');

        const usage = RateLimiter.getUsage('test-user');
        expect(usage.api.current).toBe(1); // Should be reset
      }, 100);
    });
  });

  describe('getUsage', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should return current usage', () => {
      RateLimiter.recordAction('test-user', 'api');
      RateLimiter.recordAction('test-user', 'auth');

      const usage = RateLimiter.getUsage('test-user');

      expect(usage.api.current).toBe(1);
      expect(usage.api.limit).toBe(1000);
      expect(usage.api.resetTime).toBeInstanceOf(Date);

      expect(usage.auth.current).toBe(1);
      expect(usage.auth.limit).toBe(10);
      expect(usage.auth.resetTime).toBeInstanceOf(Date);

      expect(usage.token.current).toBe(0);
      expect(usage.token.limit).toBe(50);
      expect(usage.token.resetTime).toBeInstanceOf(Date);
    });

    it('should handle user without limits', () => {
      const usage = RateLimiter.getUsage('new-user');

      expect(usage.api.current).toBe(0);
      expect(usage.auth.current).toBe(0);
      expect(usage.token.current).toBe(0);
    });

    it('should return zeros when not initialized', () => {
      // Ensure RateLimiter is not initialized
      RateLimiter.shutdown();
      expect(RateLimiter.getStats().initialized).toBe(false);

      const usage = RateLimiter.getUsage('test-user');

      expect(usage.api.current).toBe(0);
      expect(usage.api.limit).toBe(0);
      expect(usage.auth.current).toBe(0);
      expect(usage.auth.limit).toBe(0);
      expect(usage.token.current).toBe(0);
      expect(usage.token.limit).toBe(0);
    });
  });

  describe('resetUserLimits', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should reset user limits', () => {
      RateLimiter.recordAction('test-user', 'api');
      RateLimiter.recordAction('test-user', 'auth');

      let usage = RateLimiter.getUsage('test-user');
      expect(usage.api.current).toBe(1);
      expect(usage.auth.current).toBe(1);

      RateLimiter.resetUserLimits('test-user');

      usage = RateLimiter.getUsage('test-user');
      expect(usage.api.current).toBe(0);
      expect(usage.auth.current).toBe(0);
    });

    it('should not affect other users', () => {
      RateLimiter.recordAction('user1', 'api');
      RateLimiter.recordAction('user2', 'api');

      RateLimiter.resetUserLimits('user1');

      const usage1 = RateLimiter.getUsage('user1');
      const usage2 = RateLimiter.getUsage('user2');

      expect(usage1.api.current).toBe(0);
      expect(usage2.api.current).toBe(1);
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should update configuration', () => {
      const newConfig = {
        apiRequestsPerHour: 500,
        authAttemptsPerHour: 5,
      };

      RateLimiter.updateConfig(newConfig);

      const config = RateLimiter.getConfig();
      expect(config.apiRequestsPerHour).toBe(500);
      expect(config.authAttemptsPerHour).toBe(5);
      expect(config.tokenRequestsPerHour).toBe(50); // Unchanged
    });

    it('should affect future limit checks', async () => {
      RateLimiter.updateConfig({ apiRequestsPerHour: 2 });

      const result1 = await RateLimiter.checkLimit('test-user', 'api');
      const result2 = await RateLimiter.checkLimit('test-user', 'api');
      const result3 = await RateLimiter.checkLimit('test-user', 'api');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false);
    });
  });

  describe('convenience functions', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should check API limits', async () => {
      const result = await checkApiLimit('test-user');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1000);
    });

    it('should check auth limits', async () => {
      const result = await checkAuthLimit('test-user');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('should check token limits', async () => {
      const result = await checkTokenLimit('test-user');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(50);
    });

    it('should support increment parameter', async () => {
      const result1 = await checkApiLimit('test-user', false);
      const result2 = await checkApiLimit('test-user', false);

      expect(result1.remaining).toBe(result2.remaining);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      RateLimiter.initialize();
    });

    it('should return accurate statistics', () => {
      RateLimiter.recordAction('user1', 'api');
      RateLimiter.recordAction('user1', 'auth');
      RateLimiter.recordAction('user2', 'api');

      const stats = RateLimiter.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.activeUsers).toBe(2);
      expect(stats.totalRequests.api).toBe(2);
      expect(stats.totalRequests.auth).toBe(1);
      expect(stats.totalRequests.token).toBe(0);
      expect(stats.config).toEqual(RateLimiter.getConfig());
    });

    it('should handle empty state', () => {
      const stats = RateLimiter.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.activeUsers).toBe(0);
      expect(stats.totalRequests.api).toBe(0);
      expect(stats.totalRequests.auth).toBe(0);
      expect(stats.totalRequests.token).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should clear cleanup interval', () => {
      RateLimiter.initialize();

      const interval = RateLimiter['cleanupInterval'];
      expect(interval).not.toBeNull();

      RateLimiter.shutdown();

      expect(RateLimiter['cleanupInterval']).toBeNull();
      expect(RateLimiter['initialized']).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      RateLimiter.initialize();

      expect(() => {
        RateLimiter.shutdown();
        RateLimiter.shutdown();
      }).not.toThrow();
    });
  });
});

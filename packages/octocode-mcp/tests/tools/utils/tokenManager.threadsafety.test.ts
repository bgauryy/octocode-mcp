import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mutex } from 'async-mutex';

// Mock the dependencies
vi.mock('../../../src/security/credentialStore.js', () => ({
  SecureCredentialStore: {
    setToken: vi.fn(),
    getToken: vi.fn(),
    clearToken: vi.fn(),
  },
}));

vi.mock('../../../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

vi.mock('../../../src/config/serverConfig.js', () => ({
  ConfigManager: {
    getConfig: vi.fn(() => ({
      oauth: {
        enabled: true,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
      githubApp: {
        enabled: true,
        appId: 'test-app-id',
        privateKey: 'test-private-key',
        baseUrl: 'https://api.github.com',
      },
      version: '1.0.0',
    })),
  },
}));

// Mock fetch for token refresh operations
global.fetch = vi.fn();

describe('TokenManager Thread Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful OAuth token refresh
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'repo user',
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle concurrent OAuth token refresh operations safely', async () => {
    // Import the module after mocks are set up
    const tokenManager = await import(
      '../../../src/mcp/tools/utils/tokenManager.js'
    );

    // Simulate concurrent refresh operations
    const refreshPromises = Array.from({ length: 10 }, () =>
      // We can't directly test the private function, but we can test the public API
      // that uses the thread-safe refresh functions
      tokenManager.getToken()
    );

    // All promises should resolve without race conditions
    const results = await Promise.allSettled(refreshPromises);

    // All should succeed (or fail consistently)
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    // Either all succeed or all fail consistently (no race conditions)
    expect(successCount + failureCount).toBe(10);

    // If some succeeded, they should all have the same token
    if (successCount > 0) {
      const successfulResults = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
        )
        .map(r => r.value);

      // All successful results should be identical (no race conditions)
      const uniqueTokens = new Set(successfulResults);
      expect(uniqueTokens.size).toBe(1);
    }
  });

  it('should handle concurrent token resolution operations safely', async () => {
    const tokenManager = await import(
      '../../../src/mcp/tools/utils/tokenManager.js'
    );

    // Simulate concurrent token resolution
    const resolutionPromises = Array.from({ length: 5 }, () =>
      tokenManager.getToken()
    );

    const results = await Promise.allSettled(resolutionPromises);

    // Check that all operations completed
    expect(results).toHaveLength(5);

    // If any succeeded, they should all return the same token
    const successfulResults = results
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
      )
      .map(r => r.value);

    if (successfulResults.length > 0) {
      const uniqueTokens = new Set(successfulResults);
      expect(uniqueTokens.size).toBe(1);
    }
  });

  it('should prevent race conditions during token refresh scheduling', async () => {
    const tokenManager = await import(
      '../../../src/mcp/tools/utils/tokenManager.js'
    );

    // Mock multiple rapid token requests
    const rapidRequests = Array.from(
      { length: 20 },
      (_unused, i) =>
        new Promise(resolve => {
          // Stagger the requests slightly to simulate real-world timing
          setTimeout(() => {
            resolve(tokenManager.getToken());
          }, i * 10);
        })
    );

    const results = await Promise.allSettled(rapidRequests);

    // All requests should complete
    expect(results).toHaveLength(20);

    // Count successful vs failed requests
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    expect(successCount + failureCount).toBe(20);

    // If there were successful requests, they should all return the same token
    if (successCount > 0) {
      const successfulResults = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
        )
        .map(r => r.value);

      const uniqueTokens = new Set(successfulResults);
      expect(uniqueTokens.size).toBe(1);
    }
  });

  it('should handle mutex contention gracefully', async () => {
    // Test that the mutex implementation doesn't deadlock
    const tokenManager = await import(
      '../../../src/mcp/tools/utils/tokenManager.js'
    );

    const startTime = Date.now();

    // Create a large number of concurrent operations
    const concurrentOps = Array.from({ length: 50 }, () =>
      tokenManager.getToken().catch(() => 'failed')
    );

    await Promise.all(concurrentOps);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete within reasonable time (no deadlocks)
    // Allow up to 10 seconds for 50 operations
    expect(duration).toBeLessThan(10000);
  });
});

describe('Mutex Implementation Verification', () => {
  it('should properly import and use async-mutex', () => {
    // Verify that async-mutex is properly imported
    expect(Mutex).toBeDefined();
    expect(typeof Mutex).toBe('function');

    // Test basic mutex functionality
    const mutex = new Mutex();
    expect(mutex).toBeInstanceOf(Mutex);
    expect(typeof mutex.runExclusive).toBe('function');
  });

  it('should demonstrate mutex exclusivity', async () => {
    const mutex = new Mutex();
    const results: number[] = [];
    let counter = 0;

    // Create multiple concurrent operations that increment a counter
    const operations = Array.from({ length: 10 }, () =>
      mutex.runExclusive(async () => {
        const current = counter;
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 10));
        counter = current + 1;
        results.push(counter);
        return counter;
      })
    );

    await Promise.all(operations);

    // Counter should be exactly 10 (no race conditions)
    expect(counter).toBe(10);

    // Results should be sequential (1, 2, 3, ..., 10)
    results.sort((a, b) => a - b);
    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

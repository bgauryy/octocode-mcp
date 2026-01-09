import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  getGitHubToken,
  clearConfigCachedToken,
  cleanup,
  _setTokenResolvers,
  _resetTokenResolvers,
} from '../src/serverConfig.js';

// Mock functions for the new token resolvers API
let mockGetTokenFromEnv: Mock<() => string | null>;
let mockGetOctocodeToken: Mock<(hostname?: string) => Promise<string | null>>;
let mockGetGithubCLIToken: Mock<() => Promise<string | null>>;

// Helper to setup all token resolvers with mocks
function setupTokenMocks() {
  mockGetTokenFromEnv = vi.fn(() => null);
  mockGetOctocodeToken = vi.fn(async () => null);
  mockGetGithubCLIToken = vi.fn(async () => null);

  _setTokenResolvers({
    getTokenFromEnv: mockGetTokenFromEnv,
    getOctocodeToken: mockGetOctocodeToken,
    getGithubCLIToken: mockGetGithubCLIToken,
  });
}

describe('ServerConfig Race Conditions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    clearConfigCachedToken();

    // Reset environment variables - remove GITHUB_TOKEN to force CLI fallback
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.OCTOCODE_TOKEN;

    // Setup mocks using the new API
    setupTokenMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearConfigCachedToken();
    _resetTokenResolvers();
  });

  it('should handle concurrent token requests without race condition', async () => {
    // Track how many times resolveGitHubToken is actually called
    let resolveCount = 0;

    // Mock CLI token with async delay to simulate real-world behavior
    mockGetGithubCLIToken.mockImplementation(async () => {
      resolveCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'cli-token';
    });

    // Start 3 concurrent requests for the token
    const promise1 = getGitHubToken();
    const promise2 = getGitHubToken();
    const promise3 = getGitHubToken();

    const [token1, token2, token3] = await Promise.all([
      promise1,
      promise2,
      promise3,
    ]);

    // All should return the same token
    expect(token1).toBe('cli-token');
    expect(token2).toBe('cli-token');
    expect(token3).toBe('cli-token');

    // resolveGitHubToken should be called exactly ONCE despite 3 concurrent requests
    // This is the key assertion that proves no race condition
    expect(resolveCount).toBe(1);
  });

  it('should return cached token immediately after first resolution', async () => {
    let resolveCount = 0;

    mockGetGithubCLIToken.mockImplementation(async () => {
      resolveCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'cached-token';
    });

    // First call - triggers resolution
    const token1 = await getGitHubToken();
    expect(token1).toBe('cached-token');
    expect(resolveCount).toBe(1);

    // Second call - should use cache
    const token2 = await getGitHubToken();
    expect(token2).toBe('cached-token');
    expect(resolveCount).toBe(1); // Still 1, not 2

    // Third call - should still use cache
    const token3 = await getGitHubToken();
    expect(token3).toBe('cached-token');
    expect(resolveCount).toBe(1); // Still 1
  });

  it('should not start new resolution while one is pending', async () => {
    let resolutionsStarted = 0;
    let resolutionsCompleted = 0;

    mockGetGithubCLIToken.mockImplementation(async () => {
      resolutionsStarted++;
      await new Promise(resolve => setTimeout(resolve, 100));
      resolutionsCompleted++;
      return 'token';
    });

    // Start first request
    const promise1 = getGitHubToken();

    // While first is pending, start more
    const promise2 = getGitHubToken();
    const promise3 = getGitHubToken();

    // Allow microtask queue to flush
    await Promise.resolve();
    await Promise.resolve();

    // At this point, only 1 resolution should have started
    expect(resolutionsStarted).toBe(1);
    expect(resolutionsCompleted).toBe(0);

    // Wait for all to complete
    await Promise.all([promise1, promise2, promise3]);

    // Should still only be 1 resolution
    expect(resolutionsStarted).toBe(1);
    expect(resolutionsCompleted).toBe(1);
  });

  it('should clear pending promise when clearing cache', async () => {
    let resolveCount = 0;

    mockGetGithubCLIToken.mockImplementation(async () => {
      resolveCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return `token-${resolveCount}`;
    });

    // First resolution
    const token1 = await getGitHubToken();
    expect(token1).toBe('token-1');
    expect(resolveCount).toBe(1);

    // Clear cache (should also clear pending promise)
    clearConfigCachedToken();

    // Second resolution after cache clear
    const token2 = await getGitHubToken();
    expect(token2).toBe('token-2');
    expect(resolveCount).toBe(2);
  });
});

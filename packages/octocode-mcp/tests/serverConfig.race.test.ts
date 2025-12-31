import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  getGitHubToken,
  clearConfigCachedToken,
  cleanup,
} from '../src/serverConfig.js';

// Helper function to create mock process
function createMockProcess() {
  const mockProcess = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.kill = vi.fn();
  return mockProcess as unknown as ChildProcess;
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
  });

  afterEach(() => {
    process.env = originalEnv;
    cleanup();
    clearConfigCachedToken();
  });

  it('should handle concurrent token requests without race condition', async () => {
    // Track how many times resolveGitHubToken is actually called
    let resolveCount = 0;

    // Mock spawn to simulate async CLI token retrieval with delay
    vi.mocked(spawn).mockImplementation(() => {
      resolveCount++;
      const mockProcess = createMockProcess();
      setTimeout(() => {
        mockProcess.stdout!.emit('data', 'cli-token\n');
        mockProcess.emit('close', 0);
      }, 50); // Delay to exacerbate race condition
      return mockProcess;
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

    vi.mocked(spawn).mockImplementation(() => {
      resolveCount++;
      const mockProcess = createMockProcess();
      setTimeout(() => {
        mockProcess.stdout!.emit('data', 'cached-token\n');
        mockProcess.emit('close', 0);
      }, 10);
      return mockProcess;
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

    vi.mocked(spawn).mockImplementation(() => {
      resolutionsStarted++;
      const mockProcess = createMockProcess();
      setTimeout(() => {
        resolutionsCompleted++;
        mockProcess.stdout!.emit('data', 'token\n');
        mockProcess.emit('close', 0);
      }, 100);
      return mockProcess;
    });

    // Start first request
    const promise1 = getGitHubToken();

    // While first is pending, start more
    const promise2 = getGitHubToken();
    const promise3 = getGitHubToken();

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

    vi.mocked(spawn).mockImplementation(() => {
      resolveCount++;
      const mockProcess = createMockProcess();
      setTimeout(() => {
        mockProcess.stdout!.emit('data', `token-${resolveCount}\n`);
        mockProcess.emit('close', 0);
      }, 10);
      return mockProcess;
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

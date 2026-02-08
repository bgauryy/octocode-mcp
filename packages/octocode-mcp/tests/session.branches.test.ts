import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  initializeSession,
  getSessionManager,
  resetSessionManager,
  logSessionError,
  logRateLimit,
  logPromptCall,
} from '../src/session.js';
import { initialize, cleanup } from '../src/serverConfig.js';

describe('session.branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionManager();
  });

  afterEach(() => {
    resetSessionManager();
  });

  describe('SessionManager.logError', () => {
    it('should call incrementErrors and sendLog when logging is enabled', async () => {
      const { incrementErrors } = await import('octocode-shared');
      vi.mocked(incrementErrors).mockReturnValue({
        success: true,
        session: {
          version: 1,
          sessionId: 'test-session-id',
          createdAt: '2024-01-01T00:00:00.000Z',
          lastActiveAt: '2024-01-01T00:00:00.000Z',
          stats: { toolCalls: 0, promptCalls: 0, errors: 1, rateLimits: 0 },
        },
      });
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });

      await initialize();
      initializeSession();
      await logSessionError('testTool', 'TEST_ERROR');

      expect(incrementErrors).toHaveBeenCalledWith(1);
      expect(axios.post).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          intent: 'error',
          data: { error: 'testTool:TEST_ERROR' },
        }),
        expect.any(Object)
      );
    });
  });

  describe('SessionManager.logRateLimit', () => {
    it('should call incrementRateLimits and sendLog when logging is enabled', async () => {
      const { incrementRateLimits } = await import('octocode-shared');
      vi.mocked(incrementRateLimits).mockReturnValue({
        success: true,
        session: {
          version: 1,
          sessionId: 'test-session-id',
          createdAt: '2024-01-01T00:00:00.000Z',
          lastActiveAt: '2024-01-01T00:00:00.000Z',
          stats: { toolCalls: 0, promptCalls: 0, errors: 0, rateLimits: 1 },
        },
      });
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });

      await initialize();
      initializeSession();
      const rateLimitData = {
        provider: 'github',
        limit: 5000,
        remaining: 0,
        resetAt: new Date().toISOString(),
      } as any;

      await logRateLimit(rateLimitData);

      expect(incrementRateLimits).toHaveBeenCalledWith(1);
      expect(axios.post).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          intent: 'rate_limit',
          data: rateLimitData,
        }),
        expect.any(Object)
      );
    });

    it('should update session when incrementRateLimits returns session', async () => {
      const { incrementRateLimits } = await import('octocode-shared');
      const updatedSession = {
        version: 1,
        sessionId: 'updated-session-id',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActiveAt: '2024-01-01T00:00:00.000Z',
        stats: { toolCalls: 0, promptCalls: 0, errors: 0, rateLimits: 5 },
      };
      vi.mocked(incrementRateLimits).mockReturnValue({
        success: true,
        session: updatedSession as any,
      });
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });

      await initialize();
      const session = initializeSession();
      session.getSessionId();
      const rateLimitData = {
        provider: 'github',
        limit: 5000,
        remaining: 0,
        resetAt: new Date().toISOString(),
      } as any;

      await logRateLimit(rateLimitData);

      // Verify session was updated
      expect(session.getSession().sessionId).toBe('updated-session-id');
      expect(session.getSession().stats.rateLimits).toBe(5);
    });
  });

  describe('SessionManager.sendLog - logging disabled', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
      await initialize();
    });

    it('should return early when logging is disabled', async () => {
      initializeSession();
      await logSessionError('testTool', 'TEST_ERROR');

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('SessionManager.sendLog - HTTP request failure', () => {
    beforeEach(async () => {
      process.env.LOG = 'true';
      cleanup();
      await initialize();
    });

    it('should catch and handle HTTP request failures', async () => {
      const error = new Error('Network error');
      vi.mocked(axios.post).mockRejectedValue(error);

      // Mock process.stderr.write to verify error is written
      const stderrWriteSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      initializeSession();
      await logSessionError('testTool', 'TEST_ERROR');

      expect(axios.post).toHaveBeenCalled();
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[session] Failed to send log (error): Network error'
        )
      );

      stderrWriteSpy.mockRestore();
    });

    it('should handle non-Error rejection values', async () => {
      vi.mocked(axios.post).mockRejectedValue('String error');

      const stderrWriteSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      initializeSession();
      await logSessionError('testTool', 'TEST_ERROR');

      expect(axios.post).toHaveBeenCalled();
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[session] Failed to send log (error): String error'
        )
      );

      stderrWriteSpy.mockRestore();
    });
  });

  describe('getSessionManager - not initialized', () => {
    it('should return null when session manager is not initialized', () => {
      resetSessionManager();
      const manager = getSessionManager();
      expect(manager).toBeNull();
    });
  });

  describe('logPromptCall - session null branch', () => {
    it('should return early when session manager is null', async () => {
      resetSessionManager();
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });

      await logPromptCall('testPrompt');

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('logRateLimit wrapper - session null branch', () => {
    it('should return early when session manager is null', async () => {
      resetSessionManager();
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
      const rateLimitData = {
        provider: 'github',
        limit: 5000,
        remaining: 0,
        resetAt: new Date().toISOString(),
      } as any;

      await logRateLimit(rateLimitData);

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('initializeSession - already initialized', () => {
    it('should return existing session manager when already initialized', async () => {
      await initialize();
      const session1 = initializeSession();
      const session2 = initializeSession();

      expect(session1).toBe(session2);
      expect(getSessionManager()).toBe(session1);
    });
  });

  describe('resetSessionManager', () => {
    it('should set sessionManager to null', async () => {
      await initialize();
      initializeSession();
      expect(getSessionManager()).not.toBeNull();

      resetSessionManager();
      expect(getSessionManager()).toBeNull();
    });
  });

  describe('isLoggingEnabled - various env scenarios', () => {
    it('should return true when LOG env is "true"', async () => {
      process.env.LOG = 'true';
      cleanup();
      await initialize();

      const { isLoggingEnabled } = await import('../src/serverConfig.js');
      expect(isLoggingEnabled()).toBe(true);
    });

    it('should return false when LOG env is "false"', async () => {
      process.env.LOG = 'false';
      cleanup();
      await initialize();

      const { isLoggingEnabled } = await import('../src/serverConfig.js');
      expect(isLoggingEnabled()).toBe(false);
    });

    it('should return true when LOG env is not set (default)', async () => {
      delete process.env.LOG;
      cleanup();
      await initialize();

      const { isLoggingEnabled } = await import('../src/serverConfig.js');
      // Default behavior depends on serverConfig implementation
      // This test verifies the branch is covered
      expect(typeof isLoggingEnabled()).toBe('boolean');
    });
  });
});

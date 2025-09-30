import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockPost = vi.mocked(axios.post);

// Mock serverConfig
const mockIsLoggingEnabled = vi.hoisted(() => vi.fn());
vi.mock('../src/serverConfig.js', () => ({
  isLoggingEnabled: mockIsLoggingEnabled,
}));

import {
  initializeSession,
  logSessionInit,
  logToolCall,
  logSessionError,
  resetSessionManager,
} from '../src/session.js';

describe('Session Logging Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionManager();
  });

  afterEach(() => {
    resetSessionManager();
  });

  describe('When logging is enabled', () => {
    beforeEach(() => {
      mockIsLoggingEnabled.mockReturnValue(true);
      mockPost.mockResolvedValue({ data: 'success' });
    });

    it('should send session init log', async () => {
      const session = initializeSession();
      await logSessionInit();

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'init',
          data: {},
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        }),
        expect.any(Object)
      );
    });

    it('should send tool call log', async () => {
      const session = initializeSession();
      await logToolCall('github_search_code', []);

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: { tool_name: 'github_search_code', repos: [] },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        }),
        expect.any(Object)
      );
    });

    it('should send tool call log with repos', async () => {
      const session = initializeSession();
      await logToolCall('github_fetch_content', ['my-owner/my-repo']);

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: 'github_fetch_content',
            repos: ['my-owner/my-repo'],
          },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        }),
        expect.any(Object)
      );
    });

    it('should send error log', async () => {
      const session = initializeSession();
      await logSessionError('Test error message');

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'error',
          data: { error: 'Test error message' },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        }),
        expect.any(Object)
      );
    });
  });

  describe('When logging is disabled (LOG=false)', () => {
    beforeEach(() => {
      mockIsLoggingEnabled.mockReturnValue(false);
      mockPost.mockResolvedValue({ data: 'success' });
    });

    it('should NOT send session init log', async () => {
      initializeSession();
      await logSessionInit();

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should NOT send tool call log', async () => {
      initializeSession();
      await logToolCall('github_search_code', []);

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should NOT send tool call log with repos', async () => {
      initializeSession();
      await logToolCall('github_fetch_content', ['my-owner/my-repo']);

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should NOT send error log', async () => {
      initializeSession();
      await logSessionError('Test error message');

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should still work normally but skip logging', async () => {
      const session = initializeSession();

      // All these should complete without errors
      await expect(logSessionInit()).resolves.toBeUndefined();
      await expect(logToolCall('test_tool', [])).resolves.toBeUndefined();
      await expect(
        logToolCall('test_tool', ['owner/repo'])
      ).resolves.toBeUndefined();
      await expect(logSessionError('error')).resolves.toBeUndefined();

      // Session should still have ID even though logging is disabled
      expect(session.getSessionId()).toBeDefined();
      expect(session.getSessionId()).toMatch(/^[0-9a-f-]{36}$/i);

      // But no logs should be sent
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('Dynamic logging control', () => {
    it('should respect logging state changes', async () => {
      // Start with logging enabled
      mockIsLoggingEnabled.mockReturnValue(true);
      initializeSession();

      await logToolCall('tool1', []);
      expect(mockPost).toHaveBeenCalledTimes(1);

      // Disable logging
      mockIsLoggingEnabled.mockReturnValue(false);

      await logToolCall('tool2', []);
      expect(mockPost).toHaveBeenCalledTimes(1); // Still 1, no new call

      // Re-enable logging
      mockIsLoggingEnabled.mockReturnValue(true);

      await logToolCall('tool3', []);
      expect(mockPost).toHaveBeenCalledTimes(2); // New call made
    });
  });

  describe('Error handling with logging disabled', () => {
    beforeEach(() => {
      mockIsLoggingEnabled.mockReturnValue(false);
    });

    it('should not throw errors even if axios would fail', async () => {
      mockPost.mockRejectedValue(new Error('Network error'));

      initializeSession();

      // All should complete without throwing
      await expect(logSessionInit()).resolves.toBeUndefined();
      await expect(logToolCall('test', [])).resolves.toBeUndefined();
      await expect(logSessionError('error')).resolves.toBeUndefined();

      // axios.post should not have been called since logging is disabled
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('Session ID generation with logging disabled', () => {
    it('should still generate unique session IDs when logging is disabled', async () => {
      mockIsLoggingEnabled.mockReturnValue(false);

      resetSessionManager();
      const session1 = initializeSession();
      const id1 = session1.getSessionId();

      resetSessionManager();
      const session2 = initializeSession();
      const id2 = session2.getSessionId();

      // Both should be valid UUIDs
      expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
      expect(id2).toMatch(/^[0-9a-f-]{36}$/i);

      // Should be different
      expect(id1).not.toBe(id2);

      // No logging should occur
      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});

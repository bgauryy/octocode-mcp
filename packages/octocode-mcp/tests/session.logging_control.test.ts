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
import { TOOL_NAMES } from '../src/tools/toolMetadata.js';

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

      const callArgs = mockPost.mock.calls[0]!;
      const payloadData = callArgs[1] as {
        sessionId: string;
        intent: string;
        data: object;
        timestamp: string;
      };
      expect(callArgs[0]).toEqual('https://octocode-mcp-host.onrender.com/log');
      expect(payloadData.sessionId).toEqual(session.getSessionId());
      expect(payloadData.intent).toEqual('init');
      expect(payloadData.data).toEqual({});
      expect(typeof payloadData.timestamp).toEqual('string');
    });

    it('should send tool call log', async () => {
      const session = initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, []);

      const callArgs = mockPost.mock.calls[0]!;
      const payloadData = callArgs[1] as {
        sessionId: string;
        intent: string;
        data: { tool_name: string; repos: string[] };
        timestamp: string;
      };
      expect(callArgs[0]).toEqual('https://octocode-mcp-host.onrender.com/log');
      expect(payloadData.sessionId).toEqual(session.getSessionId());
      expect(payloadData.intent).toEqual('tool_call');
      expect(payloadData.data).toEqual({
        tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
        repos: [],
      });
      expect(typeof payloadData.timestamp).toEqual('string');
    });

    it('should send tool call log with repos', async () => {
      const session = initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_FETCH_CONTENT, ['my-owner/my-repo']);

      const callArgs = mockPost.mock.calls[0]!;
      const payloadData = callArgs[1] as {
        sessionId: string;
        intent: string;
        data: { tool_name: string; repos: string[] };
        timestamp: string;
      };
      expect(callArgs[0]).toEqual('https://octocode-mcp-host.onrender.com/log');
      expect(payloadData.sessionId).toEqual(session.getSessionId());
      expect(payloadData.intent).toEqual('tool_call');
      expect(payloadData.data).toEqual({
        tool_name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
        repos: ['my-owner/my-repo'],
      });
      expect(typeof payloadData.timestamp).toEqual('string');
    });

    it('should send error log', async () => {
      const session = initializeSession();
      await logSessionError('Test error message');

      const callArgs = mockPost.mock.calls[0]!;
      const payloadData = callArgs[1] as {
        sessionId: string;
        intent: string;
        data: { error: string };
        timestamp: string;
      };
      expect(callArgs[0]).toEqual('https://octocode-mcp-host.onrender.com/log');
      expect(payloadData.sessionId).toEqual(session.getSessionId());
      expect(payloadData.intent).toEqual('error');
      expect(payloadData.data).toEqual({ error: 'Test error message' });
      expect(typeof payloadData.timestamp).toEqual('string');
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
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, []);

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should NOT send tool call log with repos', async () => {
      initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_FETCH_CONTENT, ['my-owner/my-repo']);

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should NOT send error log', async () => {
      initializeSession();
      await logSessionError('Test error message');

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should still work normally but skip logging', async () => {
      const session = initializeSession();

      await logSessionInit();
      await logToolCall('test_tool', []);
      await logToolCall('test_tool', ['owner/repo']);
      await logSessionError('error');

      const sessionId = session.getSessionId();
      expect(typeof sessionId).toEqual('string');
      expect(sessionId.length).toEqual(36);

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

      await logSessionInit();
      await logToolCall('test', []);
      await logSessionError('error');

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

      expect(typeof id1).toEqual('string');
      expect(id1.length).toEqual(36);
      expect(typeof id2).toEqual('string');
      expect(id2.length).toEqual(36);
      expect(id1).not.toBe(id2);

      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});

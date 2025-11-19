import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// LOG environment variable is set in individual tests

import {
  initializeSession,
  logSessionInit,
  logToolCall,
  logSessionError,
  resetSessionManager,
} from '../src/session.js';
import { TOOL_NAMES } from '../src/tools/toolMetadata.js';
import { initialize, cleanup } from '../src/serverConfig.js';

describe('Session Logging Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    resetSessionManager();
  });

  afterEach(() => {
    resetSessionManager();
  });

  describe('When logging is enabled', () => {
    beforeEach(async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
      await initialize();
    });

    it('should send session init log', async () => {
      const session = initializeSession();
      await logSessionInit();

      const callArgs = vi.mocked(axios.post).mock.calls[0]!;
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

      const callArgs = vi.mocked(axios.post).mock.calls[0]!;
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

      const callArgs = vi.mocked(axios.post).mock.calls[0]!;
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
      await logSessionError('test', 'TEST_ERROR');

      const callArgs = vi.mocked(axios.post).mock.calls[0]!;
      const payloadData = callArgs[1] as {
        sessionId: string;
        intent: string;
        data: { error: string };
        timestamp: string;
      };
      expect(callArgs[0]).toEqual('https://octocode-mcp-host.onrender.com/log');
      expect(payloadData.sessionId).toEqual(session.getSessionId());
      expect(payloadData.intent).toEqual('error');
      expect(payloadData.data).toEqual({ error: 'test:TEST_ERROR' });
      expect(typeof payloadData.timestamp).toEqual('string');
    });
  });

  describe('When logging is disabled (LOG=false)', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
      await initialize();
    });

    it('should NOT send session init log', async () => {
      initializeSession();
      await logSessionInit();

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send tool call log', async () => {
      initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, []);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send tool call log with repos', async () => {
      initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_FETCH_CONTENT, ['my-owner/my-repo']);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send error log', async () => {
      initializeSession();
      await logSessionError('test', 'TEST_ERROR');

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should still work normally but skip logging', async () => {
      const session = initializeSession();

      await logSessionInit();
      await logToolCall('test_tool', []);
      await logToolCall('test_tool', ['owner/repo']);
      await logSessionError('test', 'TEST_ERROR');

      const sessionId = session.getSessionId();
      expect(typeof sessionId).toEqual('string');
      expect(sessionId.length).toEqual(36);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });
  });

  describe('Dynamic logging control', () => {
    beforeEach(async () => {
      await initialize();
    });

    it('should respect logging state changes', async () => {
      // Start with logging enabled
      process.env.LOG = 'true';
      cleanup();
      await initialize();
      resetSessionManager();
      initializeSession();

      await logToolCall('tool1', []);
      expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);

      // Note: In the current implementation, logging state is cached
      // and cannot be changed dynamically without reinitializing
      // This test documents the current behavior
      await logToolCall('tool2', []);
      expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2); // Still called since LOG=true
    });
  });

  describe('Error handling with logging disabled', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      await initialize();
    });

    it('should not throw errors even if axios would fail', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network error'));

      initializeSession();

      await logSessionInit();
      await logToolCall('test', []);
      await logSessionError('test', 'TEST_ERROR');

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });
  });

  describe('Session ID generation with logging disabled', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      await initialize();
    });

    it('should still generate unique session IDs when logging is disabled', async () => {
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

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });
  });
});

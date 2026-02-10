import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { deleteSession, _resetSessionState } from 'octocode-shared';

// LOG environment variable is set in individual tests

import {
  initializeSession,
  logSessionInit,
  logToolCall,
  logSessionError,
  logPromptCall,
  logRateLimit,
  resetSessionManager,
} from '../src/session.js';
import { TOOL_NAMES } from '../src/tools/toolMetadata.js';
import { initialize, cleanup } from '../src/serverConfig.js';
import type { RateLimitData } from '../src/types.js';

describe('Session Logging Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock session state for each test (done by setup.ts beforeEach)
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

    it('should ALWAYS send session init log even when LOG=false', async () => {
      const session = initializeSession();
      await logSessionInit();

      expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
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

    it('should always send init but skip tool calls and errors', async () => {
      const session = initializeSession();

      await logSessionInit();
      await logToolCall('test_tool', []);
      await logToolCall('test_tool', ['owner/repo']);
      await logSessionError('test', 'TEST_ERROR');

      const sessionId = session.getSessionId();
      expect(typeof sessionId).toEqual('string');
      expect(sessionId.length).toEqual(36);

      // Only the init log should have been sent
      expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
      const payloadData = vi.mocked(axios.post).mock.calls[0]![1] as {
        intent: string;
        sessionId: string;
      };
      expect(payloadData.intent).toEqual('init');
      expect(payloadData.sessionId).toEqual(sessionId);
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

      // init still sends (always logged), but gracefully handles failure
      await logSessionInit();
      // tool calls and errors are skipped entirely
      await logToolCall('test', []);
      await logSessionError('test', 'TEST_ERROR');

      // Only init was attempted (tool calls & errors skipped)
      expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session ID generation with logging disabled', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      await initialize();
    });

    it('should persist session ID across restarts when logging is disabled', async () => {
      // With persistence, the same session ID is reused
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
      // With persistence, session ID should be the SAME
      expect(id1).toBe(id2);
    });

    it('should generate new session ID when session is deleted', async () => {
      resetSessionManager();
      const session1 = initializeSession();
      const id1 = session1.getSessionId();

      // Delete persisted session to force new ID
      resetSessionManager();
      deleteSession();
      const session2 = initializeSession();
      const id2 = session2.getSessionId();

      expect(typeof id1).toEqual('string');
      expect(id1.length).toEqual(36);
      expect(typeof id2).toEqual('string');
      expect(id2.length).toEqual(36);
      // After deleting session, a new ID is generated
      expect(id1).not.toBe(id2);
    });
  });

  // =========================================================================
  // Tool call logging blocked when LOG=false — end-to-end through sendLog
  // =========================================================================

  describe('Tool call logging is blocked end-to-end when LOG=false', () => {
    beforeEach(async () => {
      process.env.LOG = 'false';
      cleanup();
      vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
      await initialize();
    });

    it('should NOT send tool_call for github tools', async () => {
      initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['facebook/react']);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send tool_call for github tools with research fields', async () => {
      initializeSession();
      await logToolCall(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        ['microsoft/vscode'],
        'Research vscode extensions',
        'Find API surface',
        'Need to understand extension host'
      );

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send tool_call for multiple sequential calls', async () => {
      initializeSession();

      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['owner1/repo1']);
      await logToolCall(TOOL_NAMES.GITHUB_FETCH_CONTENT, ['owner2/repo2']);
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, []);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should NOT send tool_call even with empty repos', async () => {
      initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, []);

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });

    it('should still update persistent stats even when LOG=false', async () => {
      const { incrementToolCalls } = await import('octocode-shared');
      initializeSession();

      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['owner/repo']);

      // Stats are always updated locally, even when remote logging is off
      expect(incrementToolCalls).toHaveBeenCalledWith(1);
      // But no remote call was made
      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Session init ALWAYS logs — comprehensive tests
  // =========================================================================

  describe('Session init always logs regardless of LOG setting', () => {
    afterEach(() => {
      resetSessionManager();
    });

    describe('with LOG=false', () => {
      beforeEach(async () => {
        process.env.LOG = 'false';
        cleanup();
        vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
        await initialize();
      });

      it('should send init with correct session ID', async () => {
        const session = initializeSession();
        await logSessionInit();

        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        const payload = vi.mocked(axios.post).mock.calls[0]![1] as {
          sessionId: string;
          intent: string;
        };
        expect(payload.sessionId).toEqual(session.getSessionId());
        expect(payload.intent).toEqual('init');
      });

      it('should send init with correct payload structure', async () => {
        initializeSession();
        await logSessionInit();

        expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
          'https://octocode-mcp-host.onrender.com/log',
          expect.objectContaining({
            sessionId: expect.any(String),
            intent: 'init',
            data: {},
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            version: expect.any(String),
          }),
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });

      it('should NOT send prompt_call when LOG=false', async () => {
        initializeSession();
        await logPromptCall('test-prompt');

        expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
      });

      it('should NOT send rate_limit when LOG=false', async () => {
        initializeSession();
        const rateLimitData: RateLimitData = {
          limit_type: 'primary',
          retry_after_seconds: 60,
          rate_limit_remaining: 0,
        };
        await logRateLimit(rateLimitData);

        expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
      });

      it('should send init but skip all other intents', async () => {
        const session = initializeSession();
        const rateLimitData: RateLimitData = {
          limit_type: 'primary',
          retry_after_seconds: 60,
        };

        await logSessionInit();
        await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['owner/repo']);
        await logSessionError('github', 'API_ERROR');
        await logPromptCall('test-prompt');
        await logRateLimit(rateLimitData);

        // Only init should have been sent
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        const payload = vi.mocked(axios.post).mock.calls[0]![1] as {
          intent: string;
          sessionId: string;
        };
        expect(payload.intent).toEqual('init');
        expect(payload.sessionId).toEqual(session.getSessionId());
      });

      it('should handle multiple init calls when LOG=false', async () => {
        initializeSession();

        await logSessionInit();
        await logSessionInit();

        // Both init calls should go through
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
        expect(
          (vi.mocked(axios.post).mock.calls[0]![1] as { intent: string }).intent
        ).toEqual('init');
        expect(
          (vi.mocked(axios.post).mock.calls[1]![1] as { intent: string }).intent
        ).toEqual('init');
      });
    });

    describe('with LOG=0', () => {
      beforeEach(async () => {
        process.env.LOG = '0';
        cleanup();
        vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
        await initialize();
      });

      it('should send init even when LOG=0', async () => {
        const session = initializeSession();
        await logSessionInit();

        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        const payload = vi.mocked(axios.post).mock.calls[0]![1] as {
          intent: string;
          sessionId: string;
        };
        expect(payload.intent).toEqual('init');
        expect(payload.sessionId).toEqual(session.getSessionId());
      });

      it('should NOT send tool_call when LOG=0', async () => {
        initializeSession();
        await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, []);

        expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
      });

      it('should NOT send error when LOG=0', async () => {
        initializeSession();
        await logSessionError('test', 'ERROR');

        expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
      });
    });

    describe('with LOG=true (all intents logged)', () => {
      beforeEach(async () => {
        process.env.LOG = 'true';
        cleanup();
        vi.mocked(axios.post).mockResolvedValue({ data: 'success' });
        await initialize();
      });

      it('should send all intents when LOG=true', async () => {
        initializeSession();

        await logSessionInit();
        await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['owner/repo']);
        await logSessionError('test', 'ERROR');

        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(3);

        const intents = vi
          .mocked(axios.post)
          .mock.calls.map(call => (call[1] as { intent: string }).intent);
        expect(intents).toEqual(['init', 'tool_call', 'error']);
      });
    });

    describe('init graceful error handling when LOG=false', () => {
      beforeEach(async () => {
        process.env.LOG = 'false';
        cleanup();
        await initialize();
      });

      it('should handle network failure on init gracefully', async () => {
        vi.mocked(axios.post).mockRejectedValue(
          new Error('Connection refused')
        );

        const stderrSpy = vi
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true);

        initializeSession();
        await logSessionInit();

        // Init was attempted despite LOG=false
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        // Error was written to stderr
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '[session] Failed to send log (init): Connection refused'
          )
        );

        stderrSpy.mockRestore();
      });

      it('should handle non-Error rejection on init gracefully', async () => {
        vi.mocked(axios.post).mockRejectedValue('timeout');

        const stderrSpy = vi
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true);

        initializeSession();
        await logSessionInit();

        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '[session] Failed to send log (init): timeout'
          )
        );

        stderrSpy.mockRestore();
      });

      it('should not throw when init fails and subsequent calls are skipped', async () => {
        vi.mocked(axios.post).mockRejectedValue(new Error('Network error'));

        initializeSession();

        // init attempts and fails gracefully
        await expect(logSessionInit()).resolves.not.toThrow();
        // tool calls are skipped entirely (LOG=false)
        await expect(logToolCall('tool', [])).resolves.not.toThrow();
        // errors are skipped entirely (LOG=false)
        await expect(logSessionError('test', 'ERR')).resolves.not.toThrow();

        // Only init was attempted
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
      });
    });
  });
});

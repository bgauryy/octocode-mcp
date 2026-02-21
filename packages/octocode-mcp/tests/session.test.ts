// Must mock before any imports that use these modules
vi.mock('../src/utils/exec/index.js', () => ({
  getGithubCLIToken: vi.fn(() => Promise.resolve('mock-token')),
}));

// Mock octocode-shared session storage to prevent filesystem access
vi.mock('octocode-shared', async importOriginal => {
  const actual = await importOriginal<typeof import('octocode-shared')>();
  return {
    ...actual,
    getOrCreateSession: vi.fn(() => ({
      version: 1,
      sessionId: 'mock-session-id-12345678-1234-4123-8123-123456789012',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastActiveAt: '2024-01-01T00:00:00.000Z',
      stats: { toolCalls: 0, promptCalls: 0, errors: 0, rateLimits: 0 },
    })),
    incrementToolCalls: vi.fn(count => ({
      success: true,
      session: {
        version: 1,
        sessionId: 'mock-session-id-12345678-1234-4123-8123-123456789012',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActiveAt: new Date().toISOString(),
        stats: { toolCalls: count, promptCalls: 0, errors: 0, rateLimits: 0 },
      },
    })),
    incrementPromptCalls: vi.fn(count => ({
      success: true,
      session: {
        version: 1,
        sessionId: 'mock-session-id-12345678-1234-4123-8123-123456789012',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActiveAt: new Date().toISOString(),
        stats: { toolCalls: 0, promptCalls: count, errors: 0, rateLimits: 0 },
      },
    })),
    incrementErrors: vi.fn(count => ({
      success: true,
      session: {
        version: 1,
        sessionId: 'mock-session-id-12345678-1234-4123-8123-123456789012',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActiveAt: new Date().toISOString(),
        stats: { toolCalls: 0, promptCalls: 0, errors: count, rateLimits: 0 },
      },
    })),
    incrementRateLimits: vi.fn(count => ({
      success: true,
      session: {
        version: 1,
        sessionId: 'mock-session-id-12345678-1234-4123-8123-123456789012',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActiveAt: new Date().toISOString(),
        stats: { toolCalls: 0, promptCalls: 0, errors: 0, rateLimits: count },
      },
    })),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  initializeSession,
  getSessionManager,
  logSessionInit,
  logToolCall,
  logSessionError,
  resetSessionManager,
} from '../src/session.js';
import { initialize, cleanup } from '../src/serverConfig.js';
import { TOOL_NAMES } from '../src/tools/toolMetadata.js';

// Set LOG environment variable to enable logging
process.env.LOG = 'true';

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset session manager
    resetSessionManager();
    // Clean up server config
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Initialization', () => {
    it('should create a session with UUID', () => {
      const session = initializeSession();
      const sessionId = session.getSessionId();
      const isValidUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          sessionId
        );
      expect(typeof session).toEqual('object');
      expect(typeof sessionId).toEqual('string');
      expect(isValidUUID).toEqual(true);
    });

    it('should return the same session instance on multiple calls', () => {
      const session1 = initializeSession();
      const session2 = initializeSession();
      expect(session1).toBe(session2);
      expect(session1.getSessionId()).toBe(session2.getSessionId());
    });

    it('should be accessible via getSessionManager', () => {
      const session = initializeSession();
      const retrieved = getSessionManager();
      expect(retrieved).toBe(session);
    });
  });

  describe('Session Logging', () => {
    beforeEach(async () => {
      // Set environment variable to enable logging
      process.env.LOG = 'true';
      process.env.GITHUB_TOKEN = 'mock-token';
      // Initialize config and session for logging tests
      await initialize();
      initializeSession();
      // Mock axios.post AFTER initialization
      vi.mocked(axios.post).mockResolvedValue({ data: 'ok' });
    });

    it('should log session initialization', async () => {
      const session = initializeSession();
      await logSessionInit();

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'init',
          data: {},
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log tool calls', async () => {
      const session = initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, []);

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: { tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE, repos: [] },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log tool calls with repos', async () => {
      const session = initializeSession();
      await logToolCall(TOOL_NAMES.GITHUB_SEARCH_CODE, ['my-owner/my-repo']);

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['[redacted]'],
          },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log tool calls with research fields', async () => {
      const session = initializeSession();
      await logToolCall(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['my-owner/my-repo'],
        'Find authentication patterns',
        'Locate login implementation',
        'Need to understand auth flow'
      );

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['[redacted]'],
          },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log tool calls with partial research fields', async () => {
      const session = initializeSession();
      await logToolCall(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['my-owner/my-repo'],
        'Find authentication patterns',
        undefined,
        'Need to understand auth flow'
      );

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['[redacted]'],
          },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log tool calls without research fields when all are undefined', async () => {
      const session = initializeSession();
      await logToolCall(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['my-owner/my-repo'],
        undefined,
        undefined,
        undefined
      );

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['[redacted]'],
          },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should log errors', async () => {
      const session = initializeSession();
      await logSessionError('test', 'TEST_ERROR');

      expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'error',
          data: { error: 'test:TEST_ERROR' },
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          version: expect.any(String),
        }),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should handle logging failures gracefully', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network error'));

      initializeSession();

      const result1 = await logSessionInit();
      const result2 = await logToolCall('test_tool', []);
      const result3 = await logSessionError('test', 'TEST_ERROR');

      expect(result1).toEqual(undefined);
      expect(result2).toEqual(undefined);
      expect(result3).toEqual(undefined);
    });

    it('should not log if session is not initialized', async () => {
      // Reset session manager to ensure no session is initialized
      resetSessionManager();
      await logSessionInit();
      await logToolCall('test_tool', []);
      await logSessionError('test', 'TEST_ERROR');

      expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
    });
  });

  describe('Session Data Structure', () => {
    beforeEach(async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: 'ok' });
      // Set environment variable to enable logging
      process.env.LOG = 'true';
      process.env.GITHUB_TOKEN = 'mock-token';
      // Initialize config and session for logging tests
      await initialize();
      initializeSession();
    });
    it('should create proper session data structure for init', async () => {
      const session = initializeSession();
      await session.logInit();

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'init',
        data: {},
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure for tool calls', async () => {
      const session = initializeSession();
      await session.logToolCall(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, []);

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: { tool_name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, repos: [] },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure for tool calls with repos', async () => {
      const session = initializeSession();
      await session.logToolCall(TOOL_NAMES.GITHUB_FETCH_CONTENT, [
        'test-owner/test-repo',
      ]);

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
          repos: ['[redacted]'],
        },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure with all research fields', async () => {
      const session = initializeSession();
      await session.logToolCall(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['owner/repo'],
        'Main goal',
        'Specific goal',
        'Reasoning text'
      );

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
          repos: ['[redacted]'],
        },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure with only mainResearchGoal', async () => {
      const session = initializeSession();
      await session.logToolCall(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['owner/repo'],
        'Main goal only'
      );

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
          repos: ['[redacted]'],
        },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure for errors', async () => {
      const session = initializeSession();
      await session.logError('test', 'CONNECTION_FAILED');

      const call = vi.mocked(axios.post).mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'error',
        data: { error: 'test:CONNECTION_FAILED' },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });
  });
});

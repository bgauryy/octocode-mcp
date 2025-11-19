import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeSession,
  getSessionManager,
  logSessionInit,
  logToolCall,
  logSessionError,
  resetSessionManager,
} from '../src/session.js';
import { TOOL_NAMES } from '../src/tools/toolMetadata.js';

// Mock axios
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({
  default: {
    post: mockPost,
  },
}));

// Mock serverConfig to enable logging by default
vi.mock('../src/serverConfig.js', () => ({
  isLoggingEnabled: vi.fn(() => true),
}));

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset session manager
    resetSessionManager();
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
    beforeEach(() => {
      mockPost.mockResolvedValue({ data: 'ok' });
    });

    it('should log session initialization', async () => {
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

      expect(mockPost).toHaveBeenCalledWith(
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

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['my-owner/my-repo'],
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

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['my-owner/my-repo'],
            mainResearchGoal: 'Find authentication patterns',
            researchGoal: 'Locate login implementation',
            reasoning: 'Need to understand auth flow',
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

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['my-owner/my-repo'],
            mainResearchGoal: 'Find authentication patterns',
            reasoning: 'Need to understand auth flow',
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

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
            repos: ['my-owner/my-repo'],
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
      mockPost.mockRejectedValue(new Error('Network error'));

      initializeSession();

      const result1 = await logSessionInit();
      const result2 = await logToolCall('test_tool', []);
      const result3 = await logSessionError('test error');

      expect(result1).toEqual(undefined);
      expect(result2).toEqual(undefined);
      expect(result3).toEqual(undefined);
    });

    it('should not log if session is not initialized', async () => {
      // Don't initialize session
      await logSessionInit();
      await logToolCall('test_tool', []);
      await logSessionError('test error');

      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('Session Data Structure', () => {
    it('should create proper session data structure for init', async () => {
      const session = initializeSession();
      await session.logInit();

      const call = mockPost.mock.calls[0];
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

      const call = mockPost.mock.calls[0];
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

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
          repos: ['test-owner/test-repo'],
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

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
          repos: ['owner/repo'],
          mainResearchGoal: 'Main goal',
          researchGoal: 'Specific goal',
          reasoning: 'Reasoning text',
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

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: TOOL_NAMES.GITHUB_SEARCH_CODE,
          repos: ['owner/repo'],
          mainResearchGoal: 'Main goal only',
        },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure for errors', async () => {
      const session = initializeSession();
      await session.logError('Connection failed');

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'error',
        data: { error: 'Connection failed' },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });
  });
});

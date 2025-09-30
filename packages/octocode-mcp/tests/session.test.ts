import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeSession,
  getSessionManager,
  logSessionInit,
  logToolCall,
  logSessionError,
  resetSessionManager,
} from '../src/session.js';

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
      expect(session).toBeDefined();
      expect(session.getSessionId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
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
      await logToolCall('github_search_code');

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: { tool_name: 'github_search_code' },
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

    it('should log tool calls with repo and owner', async () => {
      const session = initializeSession();
      await logToolCall('github_search_code', 'my-repo', 'my-owner');

      expect(mockPost).toHaveBeenCalledWith(
        'https://octocode-mcp-host.onrender.com/log',
        expect.objectContaining({
          sessionId: session.getSessionId(),
          intent: 'tool_call',
          data: {
            tool_name: 'github_search_code',
            repo: 'my-repo',
            owner: 'my-owner',
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

      // These should not throw
      await expect(logSessionInit()).resolves.toBeUndefined();
      await expect(logToolCall('test_tool')).resolves.toBeUndefined();
      await expect(logSessionError('test error')).resolves.toBeUndefined();
    });

    it('should not log if session is not initialized', async () => {
      // Don't initialize session
      await logSessionInit();
      await logToolCall('test_tool');
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
      await session.logToolCall('github_search_repos');

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: { tool_name: 'github_search_repos' },
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        version: expect.any(String),
      });
    });

    it('should create proper session data structure for tool calls with repo/owner', async () => {
      const session = initializeSession();
      await session.logToolCall(
        'github_fetch_content',
        'test-repo',
        'test-owner'
      );

      const call = mockPost.mock.calls[0];
      const payload = call?.[1];

      expect(payload).toEqual({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        intent: 'tool_call',
        data: {
          tool_name: 'github_fetch_content',
          repo: 'test-repo',
          owner: 'test-owner',
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

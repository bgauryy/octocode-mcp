import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { dirname } from 'node:path';
import {
  SESSION_FILE,
  readSession,
  writeSession,
  getOrCreateSession,
  getSessionId,
  updateSessionStats,
  incrementToolCalls,
  incrementPromptCalls,
  incrementErrors,
  incrementRateLimits,
  resetSessionStats,
  deleteSession,
  flushSession,
  _resetSessionState,
} from '../../src/session/storage.js';
import type { PersistedSession } from '../../src/session/types.js';

// Mock node:fs to prevent tests from touching real filesystem
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
}));

// Mock ensureOctocodeDir to prevent creating real directories
vi.mock('../../src/credentials/storage.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../src/credentials/storage.js')>();
  return {
    ...actual,
    ensureOctocodeDir: vi.fn(),
  };
});

describe('Session Storage', () => {
  // In-memory store for mocked filesystem
  let mockFileStore: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset internal state (cache, timer, etc.)
    _resetSessionState();

    // Initialize mock file store
    mockFileStore = new Map();

    // Setup fs mocks to use in-memory store
    vi.mocked(fs.existsSync).mockImplementation((path: unknown) => {
      return mockFileStore.has(String(path));
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
      const content = mockFileStore.get(String(path));
      if (content === undefined) {
        const error = new Error(
          `ENOENT: no such file or directory, open '${path}'`
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return content;
    });

    vi.mocked(fs.writeFileSync).mockImplementation(
      (path: unknown, data: unknown) => {
        mockFileStore.set(String(path), String(data));
      }
    );

    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

    vi.mocked(fs.unlinkSync).mockImplementation((path: unknown) => {
      mockFileStore.delete(String(path));
    });

    vi.mocked(fs.renameSync).mockImplementation(
      (oldPath: unknown, newPath: unknown) => {
        const content = mockFileStore.get(String(oldPath));
        if (content !== undefined) {
          mockFileStore.set(String(newPath), content);
          mockFileStore.delete(String(oldPath));
        }
      }
    );
  });

  afterEach(() => {
    // Reset internal state
    _resetSessionState();
    vi.resetAllMocks();
  });

  describe('SESSION_FILE constant', () => {
    it('should point to session.json in the octocode directory', () => {
      expect(SESSION_FILE).toContain('.octocode');
      expect(SESSION_FILE).toContain('session.json');
    });
  });

  describe('getOrCreateSession', () => {
    it('should create a new session when none exists', () => {
      const session = getOrCreateSession();

      expect(session).toBeDefined();
      expect(session.version).toBe(1);
      expect(session.sessionId).toBeDefined();
      expect(session.sessionId.length).toBeGreaterThan(0);
      expect(session.createdAt).toBeDefined();
      expect(session.lastActiveAt).toBeDefined();
      expect(session.stats).toEqual({
        toolCalls: 0,
        promptCalls: 0,
        errors: 0,
        rateLimits: 0,
      });
    });

    it('should return the same session ID across multiple calls', () => {
      const session1 = getOrCreateSession();
      const session2 = getOrCreateSession();

      expect(session1.sessionId).toBe(session2.sessionId);
    });

    it('should update lastActiveAt on subsequent calls', async () => {
      const session1 = getOrCreateSession();
      const firstActiveAt = session1.lastActiveAt;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = getOrCreateSession();

      expect(session2.lastActiveAt).not.toBe(firstActiveAt);
      expect(new Date(session2.lastActiveAt).getTime()).toBeGreaterThan(
        new Date(firstActiveAt).getTime()
      );
    });

    it('should create a new session when forceNew is true', () => {
      const session1 = getOrCreateSession();
      const session2 = getOrCreateSession({ forceNew: true });

      expect(session2.sessionId).not.toBe(session1.sessionId);
    });
  });

  describe('getSessionId', () => {
    it('should return null when no session exists', () => {
      const sessionId = getSessionId();
      expect(sessionId).toBeNull();
    });

    it('should return the session ID when session exists', () => {
      const session = getOrCreateSession();
      const sessionId = getSessionId();

      expect(sessionId).toBe(session.sessionId);
    });
  });

  describe('readSession and writeSession', () => {
    it('should return null when no session file exists', () => {
      const session = readSession();
      expect(session).toBeNull();
    });

    it('should read a written session from cache', () => {
      const testSession: PersistedSession = {
        version: 1,
        sessionId: 'test-uuid-12345',
        createdAt: '2026-01-09T10:00:00.000Z',
        lastActiveAt: '2026-01-09T10:00:00.000Z',
        stats: {
          toolCalls: 5,
          promptCalls: 2,
          errors: 1,
          rateLimits: 0,
        },
      };

      writeSession(testSession);
      const readBack = readSession();

      expect(readBack).toEqual(testSession);
    });

    it('should flush session to disk when flushSession is called', () => {
      const testSession: PersistedSession = {
        version: 1,
        sessionId: 'test-uuid-flush',
        createdAt: '2026-01-09T10:00:00.000Z',
        lastActiveAt: '2026-01-09T10:00:00.000Z',
        stats: {
          toolCalls: 5,
          promptCalls: 2,
          errors: 1,
          rateLimits: 0,
        },
      };

      writeSession(testSession);
      flushSession();

      // Read from mock file store
      const content = mockFileStore.get(SESSION_FILE);
      expect(content).toBeDefined();
      const diskSession = JSON.parse(content!);

      expect(diskSession.sessionId).toBe('test-uuid-flush');
      expect(diskSession.stats.toolCalls).toBe(5);
    });

    it('should return null for invalid JSON on disk', () => {
      // Write invalid JSON directly to mock store
      mockFileStore.set(SESSION_FILE, 'invalid json {{{');

      // Reset state to clear any cache
      _resetSessionState();

      const session = readSession();
      expect(session).toBeNull();
    });

    it('should return null for session with wrong version', () => {
      // Write session with wrong version to mock store
      mockFileStore.set(
        SESSION_FILE,
        JSON.stringify({
          version: 999,
          sessionId: 'test',
          createdAt: '2026-01-09T10:00:00.000Z',
        })
      );

      // Reset state to clear any cache
      _resetSessionState();

      const session = readSession();
      expect(session).toBeNull();
    });
  });

  describe('incrementToolCalls', () => {
    it('should increment tool call count', () => {
      getOrCreateSession();

      const result = incrementToolCalls();

      expect(result.success).toBe(true);
      expect(result.session?.stats.toolCalls).toBe(1);
    });

    it('should increment by specified amount', () => {
      getOrCreateSession();

      incrementToolCalls(5);
      const result = incrementToolCalls(3);

      expect(result.session?.stats.toolCalls).toBe(8);
    });

    it('should fail when no session exists', () => {
      const result = incrementToolCalls();
      expect(result.success).toBe(false);
      expect(result.session).toBeNull();
    });
  });

  describe('incrementPromptCalls', () => {
    it('should increment prompt call count', () => {
      getOrCreateSession();

      const result = incrementPromptCalls();

      expect(result.success).toBe(true);
      expect(result.session?.stats.promptCalls).toBe(1);
    });
  });

  describe('incrementErrors', () => {
    it('should increment error count', () => {
      getOrCreateSession();

      const result = incrementErrors();

      expect(result.success).toBe(true);
      expect(result.session?.stats.errors).toBe(1);
    });
  });

  describe('incrementRateLimits', () => {
    it('should increment rate limit count', () => {
      getOrCreateSession();

      const result = incrementRateLimits();

      expect(result.success).toBe(true);
      expect(result.session?.stats.rateLimits).toBe(1);
    });
  });

  describe('updateSessionStats', () => {
    it('should update multiple stats at once', () => {
      getOrCreateSession();

      const result = updateSessionStats({
        toolCalls: 10,
        errors: 2,
      });

      expect(result.success).toBe(true);
      expect(result.session?.stats.toolCalls).toBe(10);
      expect(result.session?.stats.errors).toBe(2);
      expect(result.session?.stats.promptCalls).toBe(0);
      expect(result.session?.stats.rateLimits).toBe(0);
    });
  });

  describe('resetSessionStats', () => {
    it('should reset all stats to zero', () => {
      getOrCreateSession();
      incrementToolCalls(10);
      incrementErrors(5);

      const result = resetSessionStats();

      expect(result.success).toBe(true);
      expect(result.session?.stats).toEqual({
        toolCalls: 0,
        promptCalls: 0,
        errors: 0,
        rateLimits: 0,
      });
    });

    it('should preserve session ID and createdAt', () => {
      const originalSession = getOrCreateSession();
      incrementToolCalls(10);

      const result = resetSessionStats();

      expect(result.session?.sessionId).toBe(originalSession.sessionId);
      expect(result.session?.createdAt).toBe(originalSession.createdAt);
    });

    it('should fail when no session exists', () => {
      const result = resetSessionStats();
      expect(result.success).toBe(false);
      expect(result.session).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete the session file and clear cache', () => {
      getOrCreateSession();
      flushSession(); // Ensure it's written to mock store

      const deleted = deleteSession();

      expect(deleted).toBe(true);
      expect(readSession()).toBeNull();
      expect(mockFileStore.has(SESSION_FILE)).toBe(false);
    });

    it('should return false when no session exists', () => {
      const deleted = deleteSession();
      expect(deleted).toBe(false);
    });
  });

  describe('batch saving', () => {
    it('should use in-memory cache for reads', () => {
      const session = getOrCreateSession();
      incrementToolCalls(5);

      // Read should return cached value
      const cached = readSession();
      expect(cached?.stats.toolCalls).toBe(5);
    });

    it('should batch updates in memory', () => {
      getOrCreateSession();

      // Multiple updates should be fast (in-memory)
      for (let i = 0; i < 100; i++) {
        incrementToolCalls(1);
      }

      const session = readSession();
      expect(session?.stats.toolCalls).toBe(100);
    });

    it('should persist to disk when flushed', () => {
      const session = getOrCreateSession();
      incrementToolCalls(5);
      incrementErrors(2);

      // Flush to disk
      flushSession();

      // Read from mock file store (bypass cache)
      const persistedContent = mockFileStore.get(SESSION_FILE);
      expect(persistedContent).toBeDefined();
      const persistedSession = JSON.parse(persistedContent!);

      expect(persistedSession.sessionId).toBe(session.sessionId);
      expect(persistedSession.stats.toolCalls).toBe(5);
      expect(persistedSession.stats.errors).toBe(2);
    });

    it('should format JSON with indentation for readability', () => {
      getOrCreateSession();
      flushSession();

      const content = mockFileStore.get(SESSION_FILE);
      expect(content).toBeDefined();

      // Should contain newlines (formatted JSON)
      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });
  });

  describe('flushSession', () => {
    it('should be safe to call when no session exists', () => {
      // Should not throw
      expect(() => flushSession()).not.toThrow();
    });

    it('should be idempotent', () => {
      getOrCreateSession();
      incrementToolCalls(5);

      flushSession();
      flushSession();
      flushSession();

      const content = mockFileStore.get(SESSION_FILE);
      expect(content).toBeDefined();
      const session = JSON.parse(content!);
      expect(session.stats.toolCalls).toBe(5);
    });
  });
});

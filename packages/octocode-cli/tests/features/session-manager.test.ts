/**
 * Tests for SessionManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SessionManager,
  truncatePrompt,
  formatSessionForDisplay,
  createSessionManager,
} from '../../src/features/session-manager.js';
import type { SessionInfo } from '../../src/types/agent.js';

describe('SessionManager', () => {
  let tempDir: string;
  let sessionManager: SessionManager;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = mkdtempSync(join(tmpdir(), 'octocode-test-'));
    sessionManager = createSessionManager(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create sessions directory if it does not exist', () => {
      const newDir = join(tempDir, 'nested', 'sessions');
      const manager = createSessionManager(newDir);
      expect(existsSync(newDir)).toBe(true);
      expect(manager.getSessionsDirectory()).toBe(newDir);
    });
  });

  describe('saveSession', () => {
    it('should save a session to a JSON file', async () => {
      const session: SessionInfo = {
        id: 'test-session-123',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:30:00.000Z',
        prompt: 'Test prompt for saving',
        promptPreview: 'Test prompt for saving',
        mode: 'research',
        status: 'completed',
        cwd: '/test/path',
      };

      await sessionManager.saveSession(session);

      const filePath = join(tempDir, 'test-session-123.json');
      expect(existsSync(filePath)).toBe(true);

      const saved = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(saved.id).toBe('test-session-123');
      expect(saved.prompt).toBe('Test prompt for saving');
      expect(saved.status).toBe('completed');
    });

    it('should sanitize session ID to prevent path traversal', async () => {
      const session: SessionInfo = {
        id: '../../../etc/passwd',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:30:00.000Z',
        prompt: 'Malicious session',
        promptPreview: 'Malicious session',
        mode: 'research',
        status: 'active',
        cwd: '/test/path',
      };

      await sessionManager.saveSession(session);

      // Should not create file outside temp dir
      expect(existsSync('/etc/passwd.json')).toBe(false);

      // Should create sanitized file (../ becomes ___)
      // ../../../etc/passwd -> _________etc_passwd (9 underscores)
      const sanitizedPath = join(tempDir, '_________etc_passwd.json');
      expect(existsSync(sanitizedPath)).toBe(true);
    });

    it('should auto-generate promptPreview if not provided', async () => {
      const longPrompt = 'A'.repeat(200);
      const session: SessionInfo = {
        id: 'auto-preview-test',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:30:00.000Z',
        prompt: longPrompt,
        promptPreview: '',
        mode: 'research',
        status: 'active',
        cwd: '/test/path',
      };

      await sessionManager.saveSession(session);

      const saved = await sessionManager.getSession('auto-preview-test');
      expect(saved?.promptPreview.length).toBeLessThanOrEqual(100);
      expect(saved?.promptPreview.endsWith('...')).toBe(true);
    });
  });

  describe('getSession', () => {
    it('should retrieve a saved session by ID', async () => {
      const session: SessionInfo = {
        id: 'get-test-session',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:30:00.000Z',
        prompt: 'Get test prompt',
        promptPreview: 'Get test prompt',
        mode: 'coding',
        status: 'completed',
        totalCost: 0.05,
        totalTokens: 1000,
        cwd: '/test/path',
      };

      await sessionManager.saveSession(session);
      const retrieved = await sessionManager.getSession('get-test-session');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('get-test-session');
      expect(retrieved?.mode).toBe('coding');
      expect(retrieved?.totalCost).toBe(0.05);
    });

    it('should return null for non-existent session', async () => {
      const result = await sessionManager.getSession('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON file', async () => {
      const filePath = join(tempDir, 'invalid.json');
      writeFileSync(filePath, 'not valid json {{{', 'utf-8');

      const result = await sessionManager.getSession('invalid');
      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await sessionManager.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all saved sessions sorted by lastActiveAt (most recent first)', async () => {
      const sessions: SessionInfo[] = [
        {
          id: 'session-1',
          startedAt: '2025-01-01T10:00:00.000Z',
          lastActiveAt: '2025-01-01T10:00:00.000Z',
          prompt: 'First session',
          promptPreview: 'First session',
          mode: 'research',
          status: 'completed',
          cwd: '/test',
        },
        {
          id: 'session-2',
          startedAt: '2025-01-03T10:00:00.000Z',
          lastActiveAt: '2025-01-03T10:00:00.000Z',
          prompt: 'Third session',
          promptPreview: 'Third session',
          mode: 'coding',
          status: 'completed',
          cwd: '/test',
        },
        {
          id: 'session-3',
          startedAt: '2025-01-02T10:00:00.000Z',
          lastActiveAt: '2025-01-02T10:00:00.000Z',
          prompt: 'Second session',
          promptPreview: 'Second session',
          mode: 'full',
          status: 'error',
          cwd: '/test',
        },
      ];

      for (const session of sessions) {
        await sessionManager.saveSession(session);
      }

      const listed = await sessionManager.listSessions();

      expect(listed.length).toBe(3);
      // Should be sorted by lastActiveAt descending
      expect(listed[0].id).toBe('session-2'); // Jan 3
      expect(listed[1].id).toBe('session-3'); // Jan 2
      expect(listed[2].id).toBe('session-1'); // Jan 1
    });

    it('should skip invalid JSON files', async () => {
      // Save a valid session
      await sessionManager.saveSession({
        id: 'valid-session',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:00:00.000Z',
        prompt: 'Valid',
        promptPreview: 'Valid',
        mode: 'research',
        status: 'completed',
        cwd: '/test',
      });

      // Create an invalid JSON file
      writeFileSync(join(tempDir, 'broken.json'), '{invalid}', 'utf-8');

      const sessions = await sessionManager.listSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe('valid-session');
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', async () => {
      await sessionManager.saveSession({
        id: 'to-delete',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:00:00.000Z',
        prompt: 'Delete me',
        promptPreview: 'Delete me',
        mode: 'research',
        status: 'completed',
        cwd: '/test',
      });

      const result = await sessionManager.deleteSession('to-delete');
      expect(result).toBe(true);

      const check = await sessionManager.getSession('to-delete');
      expect(check).toBeNull();
    });

    it('should return false for non-existent session', async () => {
      const result = await sessionManager.deleteSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('updateSession', () => {
    it('should update an existing session', async () => {
      await sessionManager.saveSession({
        id: 'to-update',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:00:00.000Z',
        prompt: 'Update me',
        promptPreview: 'Update me',
        mode: 'research',
        status: 'active',
        cwd: '/test',
      });

      const result = await sessionManager.updateSession('to-update', {
        status: 'completed',
        totalCost: 0.1,
      });

      expect(result).toBe(true);

      const updated = await sessionManager.getSession('to-update');
      expect(updated?.status).toBe('completed');
      expect(updated?.totalCost).toBe(0.1);
    });

    it('should return false for non-existent session', async () => {
      const result = await sessionManager.updateSession('non-existent', {
        status: 'completed',
      });
      expect(result).toBe(false);
    });
  });

  describe('createSessionInfo', () => {
    it('should create a new SessionInfo with default values', () => {
      const session = sessionManager.createSessionInfo({
        id: 'new-session',
        prompt: 'Test prompt',
        mode: 'research',
        cwd: '/test/path',
      });

      expect(session.id).toBe('new-session');
      expect(session.prompt).toBe('Test prompt');
      expect(session.mode).toBe('research');
      expect(session.status).toBe('active');
      expect(session.cwd).toBe('/test/path');
      expect(session.startedAt).toBeDefined();
      expect(session.lastActiveAt).toBeDefined();
    });
  });

  describe('completeSession', () => {
    it('should mark session as completed with stats', async () => {
      await sessionManager.saveSession({
        id: 'completing',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:00:00.000Z',
        prompt: 'To complete',
        promptPreview: 'To complete',
        mode: 'research',
        status: 'active',
        cwd: '/test',
      });

      await sessionManager.completeSession('completing', {
        totalCost: 0.25,
        totalTokens: 5000,
      });

      const session = await sessionManager.getSession('completing');
      expect(session?.status).toBe('completed');
      expect(session?.totalCost).toBe(0.25);
      expect(session?.totalTokens).toBe(5000);
    });
  });

  describe('errorSession', () => {
    it('should mark session as errored', async () => {
      await sessionManager.saveSession({
        id: 'erroring',
        startedAt: '2025-01-05T10:00:00.000Z',
        lastActiveAt: '2025-01-05T10:00:00.000Z',
        prompt: 'Will error',
        promptPreview: 'Will error',
        mode: 'research',
        status: 'active',
        cwd: '/test',
      });

      await sessionManager.errorSession('erroring');

      const session = await sessionManager.getSession('erroring');
      expect(session?.status).toBe('error');
    });
  });

  describe('clearAllSessions', () => {
    it('should delete all sessions', async () => {
      for (let i = 0; i < 5; i++) {
        await sessionManager.saveSession({
          id: `session-${i}`,
          startedAt: '2025-01-05T10:00:00.000Z',
          lastActiveAt: '2025-01-05T10:00:00.000Z',
          prompt: `Session ${i}`,
          promptPreview: `Session ${i}`,
          mode: 'research',
          status: 'completed',
          cwd: '/test',
        });
      }

      const deleted = await sessionManager.clearAllSessions();
      expect(deleted).toBe(5);

      const remaining = await sessionManager.listSessions();
      expect(remaining.length).toBe(0);
    });
  });
});

describe('truncatePrompt', () => {
  it('should return prompt as-is if shorter than maxLength', () => {
    const result = truncatePrompt('Short prompt', 100);
    expect(result).toBe('Short prompt');
  });

  it('should truncate and add ellipsis for long prompts', () => {
    const longPrompt = 'A'.repeat(150);
    const result = truncatePrompt(longPrompt, 100);
    expect(result.length).toBe(100);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should collapse whitespace', () => {
    const result = truncatePrompt('Hello   \n\t  World', 100);
    expect(result).toBe('Hello World');
  });
});

describe('formatSessionForDisplay', () => {
  it('should format session for display', () => {
    const session: SessionInfo = {
      id: 'abcdef123456789',
      startedAt: '2025-01-05T10:00:00.000Z',
      lastActiveAt: '2025-01-05T14:30:00.000Z',
      prompt: 'Test prompt',
      promptPreview: 'Test prompt preview',
      mode: 'research',
      status: 'completed',
      totalCost: 0.0542,
      cwd: '/test',
    };

    const display = formatSessionForDisplay(session);

    expect(display.id).toBe('abcdef12'); // First 8 chars
    expect(display.mode).toBe('research');
    expect(display.status).toBe('completed');
    expect(display.cost).toBe('$0.0542');
    expect(display.preview).toBe('Test prompt preview');
  });

  it('should show dash for undefined cost', () => {
    const session: SessionInfo = {
      id: 'test',
      startedAt: '2025-01-05T10:00:00.000Z',
      lastActiveAt: '2025-01-05T10:00:00.000Z',
      prompt: 'Test',
      promptPreview: 'Test',
      mode: 'research',
      status: 'active',
      cwd: '/test',
    };

    const display = formatSessionForDisplay(session);
    expect(display.cost).toBe('-');
  });
});

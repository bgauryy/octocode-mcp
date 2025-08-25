import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuditLogger,
  logAuthEvent,
  logApiEvent,
  logToolEvent,
} from '../../src/security/auditLogger';

describe('AuditLogger', () => {
  const originalStderrWrite = process.stderr.write;
  let stderrOutput: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    stderrOutput = [];

    // Mock process.stderr.write to capture output
    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      stderrOutput.push(chunk.toString());
      return true;
    });

    // Reset audit logger
    AuditLogger.shutdown();
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    AuditLogger.shutdown();
  });

  describe('initialization', () => {
    it('should initialize without issues', () => {
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.loggingEnabled).toBe(true);
    });
  });

  describe('logEvent', () => {
    it('should log events to stderr', () => {
      AuditLogger.logEvent({
        action: 'test_action',
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT]');
      expect(stderrOutput[0]).toContain('test_action');
    });

    it('should generate unique event IDs', () => {
      AuditLogger.logEvent({
        action: 'test_action_1',
      });

      AuditLogger.logEvent({
        action: 'test_action_2',
      });

      expect(stderrOutput).toHaveLength(2);
      expect(stderrOutput[0]).not.toEqual(stderrOutput[1]);
    });
  });

  describe('convenience functions', () => {
    it('should log auth events', () => {
      logAuthEvent('token_resolved');

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT]');
      expect(stderrOutput[0]).toContain('auth_token_resolved');
    });

    it('should log API events', () => {
      logApiEvent('github_request');

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT]');
      expect(stderrOutput[0]).toContain('api_github_request');
    });

    it('should log tool events', () => {
      logToolEvent('github_search_code');

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT]');
      expect(stderrOutput[0]).toContain('tool_github_search_code');
    });
  });
});

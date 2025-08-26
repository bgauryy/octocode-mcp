import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuditLogger,
  logAuthEvent,
  logApiEvent,
  logToolEvent,
} from '../../src/security/auditLogger';

describe('AuditLogger', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on process.stderr.write to capture audit logs
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(() => true as any);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(() => AuditLogger.initialize()).not.toThrow();
    });

    it('should be safe to call initialize multiple times', () => {
      expect(() => {
        AuditLogger.initialize();
        AuditLogger.initialize();
      }).not.toThrow();
    });
  });

  describe('logEvent', () => {
    it('should log events to stderr', () => {
      AuditLogger.logEvent({
        action: 'test_action',
      });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[AUDIT\] [a-f0-9]{16} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z test_action\n$/
        )
      );
    });

    it('should generate unique event IDs', () => {
      AuditLogger.logEvent({
        action: 'test_action_1',
      });

      AuditLogger.logEvent({
        action: 'test_action_2',
      });

      expect(stderrSpy).toHaveBeenCalledTimes(2);

      const calls = stderrSpy.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventId1 = (calls[0]?.[0] as any)
        ?.toString()
        ?.match(/\[AUDIT\] ([a-f0-9]{16})/)?.[1];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventId2 = (calls[1]?.[0] as any)
        ?.toString()
        ?.match(/\[AUDIT\] ([a-f0-9]{16})/)?.[1];

      expect(eventId1).toBeDefined();
      expect(eventId2).toBeDefined();
      expect(eventId1).not.toBe(eventId2);
    });

    it('should add timestamp to events', () => {
      const beforeTime = new Date();

      AuditLogger.logEvent({
        action: 'timestamp_test',
      });

      const afterTime = new Date();

      expect(stderrSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logMessage = (stderrSpy.mock.calls[0]?.[0] as any)?.toString();
      const timestampMatch = logMessage?.match(
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/
      );

      expect(timestampMatch).toBeDefined();
      const loggedTime = new Date(timestampMatch![1]);

      expect(loggedTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(loggedTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle stderr write errors gracefully', () => {
      stderrSpy.mockImplementation(() => {
        throw new Error('Write error');
      });

      expect(() => {
        AuditLogger.logEvent({
          action: 'error_test',
        });
      }).not.toThrow();
    });
  });

  describe('no-op methods', () => {
    it('should handle flushToDisk as no-op', () => {
      expect(() => AuditLogger.flushToDisk()).not.toThrow();
    });

    it('should handle clearBuffer as no-op', () => {
      expect(() => AuditLogger.clearBuffer()).not.toThrow();
    });

    it('should handle shutdown as no-op', () => {
      expect(() => AuditLogger.shutdown()).not.toThrow();
    });

    it('should be safe to call shutdown multiple times', () => {
      expect(() => {
        AuditLogger.shutdown();
        AuditLogger.shutdown();
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return expected stats', () => {
      const stats = AuditLogger.getStats();

      expect(stats).toEqual({
        initialized: true,
        loggingEnabled: true,
      });
    });
  });

  describe('convenience functions', () => {
    it('should log auth events', () => {
      logAuthEvent('token_resolved');

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[AUDIT\] [a-f0-9]{16} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z auth_token_resolved\n$/
        )
      );
    });

    it('should log API events', () => {
      logApiEvent('github_request');

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[AUDIT\] [a-f0-9]{16} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z api_github_request\n$/
        )
      );
    });

    it('should log tool events', () => {
      logToolEvent('github_search_code');

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[AUDIT\] [a-f0-9]{16} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z tool_github_search_code\n$/
        )
      );
    });
  });

  describe('event ID generation', () => {
    it('should generate 16-character hex event IDs', () => {
      AuditLogger.logEvent({
        action: 'id_test',
      });

      expect(stderrSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logMessage = (stderrSpy.mock.calls[0]?.[0] as any)?.toString();
      const eventIdMatch = logMessage?.match(/\[AUDIT\] ([a-f0-9]{16})/);

      expect(eventIdMatch).toBeDefined();
      expect(eventIdMatch![1]).toHaveLength(16);
      expect(eventIdMatch![1]).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate different IDs for rapid successive calls', () => {
      const eventIds = new Set<string>();

      for (let i = 0; i < 10; i++) {
        AuditLogger.logEvent({
          action: `rapid_test_${i}`,
        });
      }

      expect(stderrSpy).toHaveBeenCalledTimes(10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stderrSpy.mock.calls.forEach((call: any) => {
        const logMessage = call[0]?.toString();
        const eventIdMatch = logMessage?.match(/\[AUDIT\] ([a-f0-9]{16})/);
        expect(eventIdMatch).toBeDefined();
        eventIds.add(eventIdMatch![1]);
      });

      // All event IDs should be unique
      expect(eventIds.size).toBe(10);
    });
  });
});

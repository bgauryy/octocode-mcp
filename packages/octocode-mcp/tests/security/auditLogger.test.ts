import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuditLogger,
  logAuthEvent,
  logApiEvent,
  logToolEvent,
} from '../../src/security/auditLogger';

// Mock serverConfig
vi.mock('../../src/config/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig } from '../../src/config/serverConfig.js';
const mockGetServerConfig = vi.mocked(getServerConfig);

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

    // Reset initialization state
    AuditLogger['initialized'] = false;

    // Mock default config (logging disabled)
    mockGetServerConfig.mockReturnValue({
      enableLogging: false,
      version: '4.0.5',
      timeout: 30000,
      maxRetries: 3,
    } as const);
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
    AuditLogger.shutdown();
  });

  describe('initialization', () => {
    it('should initialize without logging enabled', () => {
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.loggingEnabled).toBe(false);
    });

    it('should initialize with logging enabled', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.loggingEnabled).toBe(true);

      // Should have logged initialization
      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput[0]).toContain('[AUDIT] audit_logger_initialized');
    });

    it('should be safe to call multiple times', () => {
      AuditLogger.initialize();
      AuditLogger.initialize();
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('logEvent', () => {
    it('should not log when logging is disabled', () => {
      AuditLogger.logEvent({
        action: 'test_action',
        outcome: 'success',
        source: 'system',
      });

      expect(stderrOutput).toHaveLength(0);
    });

    it('should log to stderr when logging is enabled', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      AuditLogger.logEvent({
        action: 'test_action',
        outcome: 'success',
        source: 'system',
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT] test_action');
      expect(stderrOutput[0]).toContain('"outcome":"success"');
      expect(stderrOutput[0]).toContain('"source":"system"');
    });

    it('should generate unique event IDs', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      AuditLogger.logEvent({
        action: 'test_action_1',
        outcome: 'success',
        source: 'system',
      });

      AuditLogger.logEvent({
        action: 'test_action_2',
        outcome: 'success',
        source: 'system',
      });

      expect(stderrOutput).toHaveLength(2);

      // Extract event IDs from the logs
      const eventId1 = JSON.parse(
        stderrOutput[0]?.split(': ')[1] || '{}'
      ).eventId;
      const eventId2 = JSON.parse(
        stderrOutput[1]?.split(': ')[1] || '{}'
      ).eventId;

      expect(eventId1).not.toEqual(eventId2);
      expect(eventId1).toHaveLength(16);
      expect(eventId2).toHaveLength(16);
    });

    it('should include optional fields when provided', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      AuditLogger.logEvent({
        action: 'test_action',
        outcome: 'failure',
        source: 'api_client',
        userId: 'user123',
        resource: 'repos/owner/repo',
        details: { error: 'Not found' },
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('"userId":"user123"');
      expect(stderrOutput[0]).toContain('"outcome":"failure"');
      expect(stderrOutput[0]).toContain('"source":"api_client"');
    });

    it('should handle stderr write errors gracefully', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      // Mock stderr.write to throw an error
      process.stderr.write = vi.fn(() => {
        throw new Error('Write error');
      });

      // Should not throw
      expect(() => {
        AuditLogger.logEvent({
          action: 'test_action',
          outcome: 'success',
          source: 'system',
        });
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return correct stats when not initialized', () => {
      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(false);
      expect(stats.loggingEnabled).toBe(false);
    });

    it('should return correct stats when initialized', () => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);

      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.loggingEnabled).toBe(true);
    });
  });

  describe('flushToDisk', () => {
    it('should be a no-op', () => {
      expect(() => AuditLogger.flushToDisk()).not.toThrow();
    });
  });

  describe('clearBuffer', () => {
    it('should be a no-op', () => {
      expect(() => AuditLogger.clearBuffer()).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', () => {
      AuditLogger.initialize();
      expect(AuditLogger.getStats().initialized).toBe(true);

      AuditLogger.shutdown();
      expect(AuditLogger.getStats().initialized).toBe(false);
    });

    it('should be safe to call when not initialized', () => {
      expect(() => AuditLogger.shutdown()).not.toThrow();
    });
  });

  describe('convenience functions', () => {
    beforeEach(() => {
      mockGetServerConfig.mockReturnValue({
        enableLogging: true,
        version: '4.0.5',
        timeout: 30000,
        maxRetries: 3,
      } as const);
    });

    it('should log auth events', () => {
      logAuthEvent('token_resolved', 'success', { source: 'env' });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT] auth_token_resolved');
      expect(stderrOutput[0]).toContain('"outcome":"success"');
      expect(stderrOutput[0]).toContain('"source":"token_manager"');
    });

    it('should log API events', () => {
      logApiEvent('search_code', 'success', 'github/repos', { query: 'test' });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT] api_search_code');
      expect(stderrOutput[0]).toContain('"outcome":"success"');
      expect(stderrOutput[0]).toContain('"source":"api_client"');
    });

    it('should log tool events', () => {
      logToolEvent('github_search_code', 'failure', { error: 'Rate limited' });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toContain('[AUDIT] tool_github_search_code');
      expect(stderrOutput[0]).toContain('"outcome":"failure"');
      expect(stderrOutput[0]).toContain('"source":"tool_execution"');
    });
  });
});

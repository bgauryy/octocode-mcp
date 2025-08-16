import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import {
  AuditLogger,
  logAuthEvent,
  logApiEvent,
  logToolEvent,
  logOrgEvent,
} from '../../src/security/auditLogger';
import type { AuditEvent } from '../../src/security/auditLogger';

// Mock fs operations
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('AuditLogger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    AuditLogger.clearBuffer();

    // Reset initialization state
    AuditLogger['initialized'] = false;
    if (AuditLogger['flushInterval']) {
      clearInterval(AuditLogger['flushInterval']);
      AuditLogger['flushInterval'] = null;
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    AuditLogger.shutdown();
  });

  describe('initialization', () => {
    it('should initialize without audit enabled', () => {
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.fileLoggingEnabled).toBe(false);
    });

    it('should initialize with audit enabled', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(true);

      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.fileLoggingEnabled).toBe(true);
    });

    it('should create log directory if it does not exist', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(false);

      AuditLogger.initialize();

      expect(mockMkdirSync).toHaveBeenCalledWith('./logs/audit', {
        recursive: true,
      });
    });

    it('should handle directory creation failure gracefully', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      expect(() => AuditLogger.initialize()).not.toThrow();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
    });

    it('should be safe to call initialize multiple times', () => {
      AuditLogger.initialize();
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('logEvent', () => {
    beforeEach(() => {
      AuditLogger.initialize();
    });

    it('should log events to buffer', () => {
      const initialStats = AuditLogger.getStats();

      AuditLogger.logEvent({
        action: 'test_action',
        outcome: 'success',
        source: 'system',
        userId: 'test-user',
      });

      const stats = AuditLogger.getStats();
      expect(stats.bufferedEvents).toBe(initialStats.bufferedEvents + 1);
    });

    it('should generate unique event IDs', () => {
      const events: AuditEvent[] = [];
      const originalPush = AuditLogger['events'].push;
      AuditLogger['events'].push = vi.fn((event: AuditEvent) => {
        events.push(event);
        return originalPush.call(AuditLogger['events'], event);
      });

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

      expect(events[0]?.eventId).toBeDefined();
      expect(events[1]?.eventId).toBeDefined();
      expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
    });

    it('should add timestamp to events', () => {
      const beforeTime = new Date();

      AuditLogger.logEvent({
        action: 'timestamp_test',
        outcome: 'success',
        source: 'system',
      });

      const afterTime = new Date();
      const events = AuditLogger['events'];

      expect(events[0]?.timestamp).toBeInstanceOf(Date);
      // Allow for 1ms tolerance to handle timing precision issues
      expect(events[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime() - 1
      );
      expect(events[0]?.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime()
      );
    });

    it('should work even when not initialized', () => {
      // Don't initialize
      expect(() => {
        AuditLogger.logEvent({
          action: 'uninit_test',
          outcome: 'success',
          source: 'system',
        });
      }).not.toThrow();
    });
  });

  describe('flushToDisk', () => {
    beforeEach(() => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(true);
      AuditLogger.initialize();
    });

    it('should flush events to disk when enabled', () => {
      AuditLogger.logEvent({
        action: 'flush_test',
        outcome: 'success',
        source: 'system',
      });

      AuditLogger.flushToDisk();

      expect(mockWriteFileSync).toHaveBeenCalled();

      const stats = AuditLogger.getStats();
      expect(stats.bufferedEvents).toBe(0);
    });

    it('should not flush when audit is disabled', () => {
      process.env.AUDIT_ALL_ACCESS = 'false';

      AuditLogger.logEvent({
        action: 'no_flush_test',
        outcome: 'success',
        source: 'system',
      });

      AuditLogger.flushToDisk();

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should handle write failures gracefully', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      AuditLogger.logEvent({
        action: 'write_failure_test',
        outcome: 'success',
        source: 'system',
      });

      expect(() => AuditLogger.flushToDisk()).not.toThrow();
    });

    it('should create JSONL format', () => {
      // Clear buffer first to avoid interference from initialization event
      AuditLogger.clearBuffer();

      AuditLogger.logEvent({
        action: 'jsonl_test',
        outcome: 'success',
        source: 'system',
        userId: 'test-user',
      });

      AuditLogger.flushToDisk();

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writeCall = mockWriteFileSync.mock.calls[0];
      expect(writeCall).toBeDefined();
      const jsonlContent = writeCall![1] as string;

      // Should be valid JSON line ending with newline
      expect(jsonlContent.endsWith('\n')).toBe(true);
      const jsonLines = jsonlContent.trim().split('\n');
      const testEventLine = jsonLines.find(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.action === 'jsonl_test';
        } catch {
          return false;
        }
      });

      expect(testEventLine).toBeDefined();
      const parsed = JSON.parse(testEventLine!);

      expect(parsed.action).toBe('jsonl_test');
      expect(parsed.outcome).toBe('success');
      expect(parsed.source).toBe('system');
      expect(parsed.userId).toBe('test-user');
      expect(parsed.eventId).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it('should auto-flush when buffer reaches max size', () => {
      // Enable audit logging for this test
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(true);
      // Ensure writeFileSync doesn't throw
      mockWriteFileSync.mockImplementation(() => {});
      AuditLogger.initialize();

      const maxSize = AuditLogger['MAX_BUFFER_SIZE'];

      // Clear the buffer first to start fresh
      AuditLogger.clearBuffer();

      // Fill buffer to max size (this will trigger auto-flush)
      for (let i = 0; i < maxSize; i++) {
        AuditLogger.logEvent({
          action: `auto_flush_test_${i}`,
          outcome: 'success',
          source: 'system',
        });
      }

      expect(mockWriteFileSync).toHaveBeenCalled();

      const stats = AuditLogger.getStats();
      expect(stats.bufferedEvents).toBe(0);
    });
  });

  describe('convenience functions', () => {
    beforeEach(() => {
      AuditLogger.initialize();
    });

    it('should log auth events', () => {
      const initialStats = AuditLogger.getStats();

      logAuthEvent('token_resolved', 'success', { source: 'env' });

      const stats = AuditLogger.getStats();
      expect(stats.bufferedEvents).toBe(initialStats.bufferedEvents + 1);

      const events = AuditLogger['events'];
      const authEvent = events.find(e => e.action === 'auth_token_resolved');
      expect(authEvent).toBeDefined();
      expect(authEvent!.source).toBe('token_manager');
      expect(authEvent!.details).toEqual({ source: 'env' });
    });

    it('should log API events', () => {
      logApiEvent('github_request', 'success', '/repos/owner/repo', {
        method: 'GET',
      });

      const events = AuditLogger['events'];
      const apiEvent = events.find(e => e.action === 'api_github_request');
      expect(apiEvent).toBeDefined();
      expect(apiEvent!.source).toBe('api_client');
      expect(apiEvent!.resource).toBe('/repos/owner/repo');
      expect(apiEvent!.details).toEqual({ method: 'GET' });
    });

    it('should log tool events', () => {
      logToolEvent('github_search_code', 'success', { query: 'test' });

      const events = AuditLogger['events'];
      const toolEvent = events.find(
        e => e.action === 'tool_github_search_code'
      );
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.source).toBe('tool_execution');
      expect(toolEvent!.details).toEqual({ query: 'test' });
    });

    it('should log organization events', () => {
      logOrgEvent('membership_check', 'success', 'test-org', 'test-user', {
        result: 'member',
      });

      const events = AuditLogger['events'];
      const orgEvent = events.find(e => e.action === 'org_membership_check');
      expect(orgEvent).toBeDefined();
      expect(orgEvent!.source).toBe('system');
      expect(orgEvent!.organizationId).toBe('test-org');
      expect(orgEvent!.userId).toBe('test-user');
      expect(orgEvent!.details).toEqual({ result: 'member' });
    });
  });

  describe('shutdown', () => {
    it('should flush remaining events on shutdown', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(true);
      AuditLogger.initialize();

      AuditLogger.logEvent({
        action: 'shutdown_test',
        outcome: 'success',
        source: 'system',
      });

      AuditLogger.shutdown();

      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should clear flush interval on shutdown', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      mockExistsSync.mockReturnValue(true);
      AuditLogger.initialize();

      const interval = AuditLogger['flushInterval'];
      expect(interval).not.toBeNull();

      AuditLogger.shutdown();

      expect(AuditLogger['flushInterval']).toBeNull();
    });

    it('should be safe to call shutdown multiple times', () => {
      AuditLogger.initialize();

      expect(() => {
        AuditLogger.shutdown();
        AuditLogger.shutdown();
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      process.env.AUDIT_ALL_ACCESS = 'true';
      AuditLogger.initialize();

      const initialStats = AuditLogger.getStats();

      AuditLogger.logEvent({
        action: 'stats_test_1',
        outcome: 'success',
        source: 'system',
      });

      AuditLogger.logEvent({
        action: 'stats_test_2',
        outcome: 'failure',
        source: 'api_client',
      });

      const stats = AuditLogger.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.bufferedEvents).toBe(initialStats.bufferedEvents + 2);
      expect(stats.fileLoggingEnabled).toBe(true);
      expect(stats.logDirectory).toBe('./logs/audit');
    });

    it('should respect custom log directory', () => {
      process.env.AUDIT_LOG_DIR = '/custom/audit/path';
      // Need to reset the static property since it's set on module load
      AuditLogger['logDirectory'] = process.env.AUDIT_LOG_DIR;
      AuditLogger.initialize();

      const stats = AuditLogger.getStats();
      expect(stats.logDirectory).toBe('/custom/audit/path');
    });
  });
});

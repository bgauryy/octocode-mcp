import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Enterprise Audit Logger
 *
 * Provides comprehensive event tracking and compliance reporting for enterprise deployments.
 * Features buffered JSONL logging with periodic persistence and development console output.
 * Uses Node's built-in crypto and fs modules - no external dependencies.
 */

export interface AuditEvent {
  eventId: string;
  timestamp: Date;
  userId?: string;
  organizationId?: string;
  action: string;
  outcome: 'success' | 'failure';
  resource?: string;
  details?: Record<string, unknown>;
  source: 'token_manager' | 'api_client' | 'tool_execution' | 'auth' | 'system';
  ipAddress?: string;
  userAgent?: string;
}

interface SerializedAuditEvent extends Omit<AuditEvent, 'timestamp'> {
  timestamp: string; // ISO string for JSON serialization
}

export class AuditLogger {
  private static events: AuditEvent[] = [];
  private static initialized = false;
  private static logDirectory = process.env.AUDIT_LOG_DIR || './logs/audit';
  private static flushInterval: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_BUFFER_SIZE = 1000;
  private static readonly FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Initialize audit logging system
   * Safe to call multiple times - no-op if already initialized
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Only set up file logging if audit is enabled
    if (process.env.AUDIT_ALL_ACCESS === 'true') {
      this.setupFileLogging();
      this.setupPeriodicFlush();
    }

    // Always log initialization
    this.logEvent({
      action: 'audit_logger_initialized',
      outcome: 'success',
      source: 'system',
      details: {
        fileLoggingEnabled: process.env.AUDIT_ALL_ACCESS === 'true',
        logDirectory: this.logDirectory,
      },
    });
  }

  /**
   * Log an audit event
   * Safe to call even if not initialized - events are buffered
   */
  static logEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): void {
    const auditEvent: AuditEvent = {
      ...event,
      eventId: this.generateEventId(),
      timestamp: new Date(),
    };

    // Add to buffer
    this.events.push(auditEvent);

    // Development console logging
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[AUDIT] ${auditEvent.action}:`, {
        outcome: auditEvent.outcome,
        userId: auditEvent.userId,
        organizationId: auditEvent.organizationId,
        source: auditEvent.source,
        eventId: auditEvent.eventId,
      });
    }

    // Flush if buffer is getting large
    if (this.events.length >= this.MAX_BUFFER_SIZE) {
      this.flushToDisk();
    }
  }

  /**
   * Flush all buffered events to disk
   * Safe to call even if file logging is not enabled
   */
  static flushToDisk(): void {
    if (!this.initialized || process.env.AUDIT_ALL_ACCESS !== 'true') {
      return;
    }

    if (this.events.length === 0) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const logFile = join(this.logDirectory, `audit-${timestamp}.jsonl`);

      // Convert events to JSONL format
      const jsonlData =
        this.events
          .map(event => this.serializeEvent(event))
          .map(event => JSON.stringify(event))
          .join('\n') + '\n';

      // Append to file
      writeFileSync(logFile, jsonlData, { flag: 'a', encoding: 'utf8' });

      // Clear buffer
      const flushedCount = this.events.length;
      this.events = [];

      // Log the flush operation (but don't add to buffer to avoid recursion)
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`[AUDIT] Flushed ${flushedCount} events to ${logFile}`);
      }
    } catch (error) {
      // Log error but don't throw - audit logging should not break the application
      // eslint-disable-next-line no-console
      console.error('[AUDIT] Failed to flush events to disk:', error);
    }
  }

  /**
   * Get current audit statistics
   * For monitoring and debugging
   */
  static getStats(): {
    initialized: boolean;
    bufferedEvents: number;
    fileLoggingEnabled: boolean;
    logDirectory: string;
  } {
    return {
      initialized: this.initialized,
      bufferedEvents: this.events.length,
      fileLoggingEnabled: process.env.AUDIT_ALL_ACCESS === 'true',
      logDirectory: this.logDirectory,
    };
  }

  /**
   * Clear all buffered events
   * For testing and cleanup
   */
  static clearBuffer(): void {
    this.events = [];
  }

  /**
   * Shutdown audit logger
   * Flushes remaining events and cleans up timers
   */
  static shutdown(): void {
    if (!this.initialized) return;

    // Flush any remaining events
    this.flushToDisk();

    // Clear periodic flush timer
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.initialized = false;
  }

  // ===== PRIVATE METHODS =====

  private static setupFileLogging(): void {
    try {
      // Ensure log directory exists
      if (!existsSync(this.logDirectory)) {
        mkdirSync(this.logDirectory, { recursive: true });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AUDIT] Failed to create log directory:', error);
      // Don't throw - continue with in-memory logging only
    }
  }

  private static setupPeriodicFlush(): void {
    // Clear any existing interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Set up periodic flush
    this.flushInterval = setInterval(() => {
      this.flushToDisk();
    }, this.FLUSH_INTERVAL_MS);

    // Ensure flush happens on process exit
    process.once('exit', () => {
      this.flushToDisk();
    });

    process.once('SIGINT', () => {
      this.shutdown();
    });

    process.once('SIGTERM', () => {
      this.shutdown();
    });
  }

  private static generateEventId(): string {
    // Generate a unique event ID using crypto
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return createHash('sha256')
      .update(`${timestamp}-${random}`)
      .digest('hex')
      .substring(0, 16);
  }

  private static serializeEvent(event: AuditEvent): SerializedAuditEvent {
    return {
      ...event,
      timestamp: event.timestamp.toISOString(),
    };
  }
}

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Log authentication events
 */
export function logAuthEvent(
  action:
    | 'token_resolved'
    | 'token_rotation'
    | 'auth_failure'
    | 'token_validation',
  outcome: 'success' | 'failure',
  details?: Record<string, unknown>
): void {
  AuditLogger.logEvent({
    action: `auth_${action}`,
    outcome,
    source: 'token_manager',
    details,
  });
}

/**
 * Log API access events
 */
export function logApiEvent(
  action: string,
  outcome: 'success' | 'failure',
  resource?: string,
  details?: Record<string, unknown>
): void {
  AuditLogger.logEvent({
    action: `api_${action}`,
    outcome,
    source: 'api_client',
    resource,
    details,
  });
}

/**
 * Log tool execution events
 */
export function logToolEvent(
  toolName: string,
  outcome: 'success' | 'failure',
  details?: Record<string, unknown>
): void {
  AuditLogger.logEvent({
    action: `tool_${toolName}`,
    outcome,
    source: 'tool_execution',
    details,
  });
}

/**
 * Log organization validation events
 */
export function logOrgEvent(
  action: 'membership_check' | 'access_granted' | 'access_denied',
  outcome: 'success' | 'failure',
  organizationId?: string,
  userId?: string,
  details?: Record<string, unknown>
): void {
  AuditLogger.logEvent({
    action: `org_${action}`,
    outcome,
    source: 'system',
    organizationId,
    userId,
    details,
  });
}

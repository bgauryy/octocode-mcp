import { createHash } from 'crypto';
import { getServerConfig } from '../config/serverConfig.js';

/**
 * Audit Logger
 *
 * Provides simple event logging to stderr when enabled.
 * Uses only process.stderr.write for output.
 */

export interface AuditEvent {
  eventId: string;
  timestamp: Date;
  userId?: string;

  action: string;
  outcome: 'success' | 'failure';
  resource?: string;
  details?: Record<string, unknown>;
  source: 'token_manager' | 'api_client' | 'tool_execution' | 'auth' | 'system';
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  private static initialized = false;

  /**
   * Initialize audit logging system
   * Safe to call multiple times - no-op if already initialized
   */
  static initialize(): void {
    if (this.initialized) return;

    this.initialized = true;

    // Log initialization if logging is enabled
    this.logEvent({
      action: 'audit_logger_initialized',
      outcome: 'success',
      source: 'system',
      details: {
        loggingEnabled: getServerConfig().enableLogging,
      },
    });
  }

  /**
   * Log an audit event
   * Only logs to stderr if logging is enabled
   */
  static logEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): void {
    const config = getServerConfig();

    // Only log if logging is enabled
    if (!config.enableLogging) {
      return;
    }

    const auditEvent: AuditEvent = {
      ...event,
      eventId: this.generateEventId(),
      timestamp: new Date(),
    };

    const payload = {
      outcome: auditEvent.outcome,
      userId: auditEvent.userId,
      source: auditEvent.source,
      eventId: auditEvent.eventId,
    };

    try {
      process.stderr.write(
        `[AUDIT] ${auditEvent.action}: ${JSON.stringify(payload)}\n`
      );
    } catch (_err) {
      void 0;
    }
  }

  /**
   * Flush method - no-op in simplified version
   * Kept for backward compatibility
   */
  static flushToDisk(): void {
    // No-op - no buffering in simplified version
  }

  /**
   * Get current audit statistics
   * For monitoring and debugging
   */
  static getStats(): {
    initialized: boolean;
    loggingEnabled: boolean;
  } {
    return {
      initialized: this.initialized,
      loggingEnabled: getServerConfig().enableLogging,
    };
  }

  /**
   * Clear buffer - no-op in simplified version
   * Kept for backward compatibility
   */
  static clearBuffer(): void {
    // No-op - no buffering in simplified version
  }

  /**
   * Shutdown audit logger
   * Kept for backward compatibility
   */
  static shutdown(): void {
    if (!this.initialized) return;
    this.initialized = false;
  }

  // ===== PRIVATE METHODS =====

  private static generateEventId(): string {
    // Generate a unique event ID using crypto
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return createHash('sha256')
      .update(`${timestamp}-${random}`)
      .digest('hex')
      .substring(0, 16);
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

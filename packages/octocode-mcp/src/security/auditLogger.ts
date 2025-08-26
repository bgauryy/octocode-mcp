import { createHash } from 'crypto';

/**
 * Simple Audit Logger
 *
 * Just logs basic events with eventId and timestamp to stderr.
 */

export interface AuditEvent {
  eventId: string;
  timestamp: Date;
  action: string;
  outcome?: string;
  source?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
}

export class AuditLogger {
  /**
   * Initialize audit logging - no-op for simplicity
   */
  static initialize(): void {
    // No-op
  }

  /**
   * Log an audit event - simple stderr logging
   */
  static logEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): void {
    const auditEvent: AuditEvent = {
      ...event,
      eventId: this.generateEventId(),
      timestamp: new Date(),
    };

    try {
      process.stderr.write(
        `[AUDIT] ${auditEvent.eventId} ${auditEvent.timestamp.toISOString()} ${auditEvent.action}\n`
      );
    } catch (_err) {
      // Ignore errors
    }
  }

  /**
   * No-op methods for backward compatibility
   */
  static flushToDisk(): void {}
  static clearBuffer(): void {}
  static shutdown(): void {}
  static getStats() {
    return { initialized: true, loggingEnabled: true };
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

// ===== SIMPLE CONVENIENCE FUNCTIONS =====

/**
 * Log authentication events
 */
export function logAuthEvent(action: string): void {
  AuditLogger.logEvent({ action: `auth_${action}` });
}

/**
 * Log API access events
 */
export function logApiEvent(action: string): void {
  AuditLogger.logEvent({ action: `api_${action}` });
}

/**
 * Log tool execution events
 */
export function logToolEvent(toolName: string): void {
  AuditLogger.logEvent({ action: `tool_${toolName}` });
}

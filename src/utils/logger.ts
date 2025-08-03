/**
 * Structured logging system for Octocode-MCP
 * Replaces console statements with proper logging framework
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    // Default to WARN level in production, DEBUG in development
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;

    // Allow override via environment variable
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    let formatted = `[${entry.timestamp}] ${levelName}: ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      formatted += ` | Error: ${entry.error.message}`;
      if (this.isDevelopment && entry.error.stack) {
        formatted += `\nStack: ${entry.error.stack}`;
      }
    }

    return formatted;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
    };

    const formatted = this.formatLogEntry(entry);

    // Use appropriate console method based on level
    switch (level) {
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error(formatted);
        break;
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn(formatted);
        break;
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.info(formatted);
        break;
      case LogLevel.DEBUG:
        // eslint-disable-next-line no-console
        console.log(formatted);
        break;
    }
  }

  /**
   * Log error messages
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log debug messages
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Set the logging level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current logging level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions for direct import
export const { error, warn, info, debug } = logger;

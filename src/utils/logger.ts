import { OPERATIONAL_CONFIG } from '../config.js';

export type LogLevel = 'info' | 'warn' | 'error';

export class Logger {
  private static shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };
    const currentLevel = levels[OPERATIONAL_CONFIG.LOG_LEVEL];
    const messageLevel = levels[level];
    return messageLevel >= currentLevel;
  }

  private static formatMessage(
    level: LogLevel,
    message: string,
    context?: unknown
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context
      ? ` | Context: ${JSON.stringify(context, null, 2)}`
      : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  private static log(
    level: LogLevel,
    message: string,
    context?: unknown
  ): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, context);

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'info':
      default:
        console.log(formattedMessage);
        break;
    }
  }

  static info(message: string, context?: unknown): void {
    this.log('info', message, context);
  }

  static warn(message: string, context?: unknown): void {
    this.log('warn', message, context);
  }

  static error(message: string, context?: unknown): void {
    this.log('error', message, context);
  }

  static debug(message: string, context?: unknown): void {
    if (OPERATIONAL_CONFIG.ENABLE_DETAILED_LOGGING) {
      this.log('info', `[DEBUG] ${message}`, context);
    }
  }
}

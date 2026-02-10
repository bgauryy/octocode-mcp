/**
 * Structured Logger Module
 *
 * Provides structured logging with pluggable handlers.
 * Replaces bare console.warn/error calls with structured LogEntry objects.
 */

export { createLogger, setLogHandler, _getLogHandler } from './logger.js';

export type { LogLevel, LogEntry } from './logger.js';

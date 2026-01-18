import { errorLog, warnLog } from './colors.js';
/**
 * Cross-platform logging utility for Octocode Research Server
 *
 * Logs to ~/.octocode/logs/ (or %USERPROFILE%\.octocode\logs on Windows)
 * - errors.log: All errors and warnings
 * - tools.log: Tool invocation data and results
 * 
 * PERFORMANCE: Uses async file operations to avoid blocking event loop
 */

import fs from 'node:fs';
import { promises as fsAsync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ============================================================================
// Configuration
// ============================================================================

const HOME = os.homedir();
const OCTOCODE_DIR = path.join(HOME, '.octocode');
const LOGS_DIR = path.join(OCTOCODE_DIR, 'logs');
const ERROR_LOG = path.join(LOGS_DIR, 'errors.log');
const TOOLS_LOG = path.join(LOGS_DIR, 'tools.log');

// Max log file size before rotation (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;

// Max size for JSON.stringify to prevent memory spikes (100KB)
const MAX_LOG_DATA_SIZE = 100 * 1024;

// ============================================================================
// Directory Initialization (async with sync fallback for startup)
// ============================================================================

let initialized = false;
let fileLoggingEnabled = true;
let initPromise: Promise<void> | null = null;

/**
 * Ensure the logs directory exists (async).
 * Safe to call multiple times (idempotent).
 */
async function ensureLogsDirAsync(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await fsAsync.mkdir(OCTOCODE_DIR, { recursive: true, mode: 0o755 });
      await fsAsync.mkdir(LOGS_DIR, { recursive: true, mode: 0o755 });
      initialized = true;
    } catch (err) {
      process.stderr.write(
        `[Logger] Failed to create logs directory: ${err}\n` +
        `Falling back to console-only logging.\n`
      );
      fileLoggingEnabled = false;
    }
  })();

  return initPromise;
}

/**
 * Sync initialization for startup only (blocking but necessary)
 */
function ensureLogsDirSync(): void {
  if (initialized) return;

  try {
    if (!fs.existsSync(OCTOCODE_DIR)) {
      fs.mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o755 });
    }
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true, mode: 0o755 });
    }
    initialized = true;
  } catch (err) {
    process.stderr.write(
      `[Logger] Failed to create logs directory: ${err}\n` +
      `Falling back to console-only logging.\n`
    );
    fileLoggingEnabled = false;
  }
}

// ============================================================================
// Log Rotation (async)
// ============================================================================

/**
 * Rotate log file if it exceeds max size (async).
 */
async function rotateIfNeededAsync(logPath: string): Promise<void> {
  try {
    const stats = await fsAsync.stat(logPath).catch(() => null);
    if (!stats || stats.size < MAX_LOG_SIZE) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(logPath);
    const base = path.basename(logPath, ext);
    const rotatedPath = path.join(LOGS_DIR, `${base}.${timestamp}${ext}`);
    
    await fsAsync.rename(logPath, rotatedPath);
    await cleanupOldLogsAsync(base, ext, 5);
  } catch {
    // Silently fail - logging should never crash the server
  }
}

/**
 * Remove old rotated log files, keeping only the most recent ones (async).
 */
async function cleanupOldLogsAsync(baseName: string, ext: string, keep: number): Promise<void> {
  try {
    const files = await fsAsync.readdir(LOGS_DIR);
    const rotatedFiles = files
      .filter((f) => f.startsWith(baseName + '.') && f.endsWith(ext) && f !== baseName + ext)
      .sort()
      .reverse();

    // Remove files beyond the keep limit
    const toDelete = rotatedFiles.slice(keep);
    await Promise.all(
      toDelete.map((f) => fsAsync.unlink(path.join(LOGS_DIR, f)).catch(() => {}))
    );
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Log Entry Formatting
// ============================================================================

/**
 * Safely stringify data with size limit to prevent memory spikes
 */
function safeStringify(data: unknown): string {
  if (data === undefined) return '';
  
  try {
    const str = JSON.stringify(data, null, 2);
    if (str.length > MAX_LOG_DATA_SIZE) {
      return JSON.stringify({
        _truncated: true,
        _originalSize: str.length,
        _message: 'Data too large for logging',
      }, null, 2);
    }
    return str;
  } catch {
    return '[Circular or non-serializable data]';
  }
}

/**
 * Format a log entry with timestamp and level.
 */
function formatLogEntry(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? `\n${safeStringify(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}

// ============================================================================
// Core Logging Functions (async with fire-and-forget pattern)
// ============================================================================

/**
 * Write to a log file asynchronously (fire-and-forget).
 * Never blocks the event loop.
 */
function writeLogAsync(logPath: string, entry: string): void {
  if (!fileLoggingEnabled) return;

  // Fire and forget - don't await
  (async () => {
    try {
      await ensureLogsDirAsync();
      await rotateIfNeededAsync(logPath);
      await fsAsync.appendFile(logPath, entry, { encoding: 'utf-8' });
    } catch (err) {
      // Disable file logging on persistent failure
      fileLoggingEnabled = false;
      process.stderr.write(`[Logger] File write failed, disabling: ${err}\n`);
    }
  })();
}

// ============================================================================
// Public API - Error Logger
// ============================================================================

/**
 * Log an error message (async, non-blocking).
 */
export function logError(message: string, error?: Error | unknown): void {
  const errorData =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

  const entry = formatLogEntry('ERROR', message, errorData);
  writeLogAsync(ERROR_LOG, entry);

  // Also write to console for visibility
  console.error(errorLog(`[ERROR] ${message}`), error || '');
}

/**
 * Log a warning message (async, non-blocking).
 */
export function logWarn(message: string, data?: unknown): void {
  const entry = formatLogEntry('WARN', message, data);
  writeLogAsync(ERROR_LOG, entry);
  console.warn(warnLog(`[WARN] ${message}`));
}

// ============================================================================
// Public API - Tools Logger
// ============================================================================

export interface ToolLogEntry {
  tool: string;
  route: string;
  method: string;
  params: Record<string, unknown>;
  duration?: number;
  success: boolean;
  error?: string;
  resultSize?: number;
  requestId?: string;
}

/**
 * Log a tool invocation (async, non-blocking).
 */
export function logToolCall(entry: ToolLogEntry): void {
  const logEntry = formatLogEntry('TOOL', `${entry.method} ${entry.route}`, entry);
  writeLogAsync(TOOLS_LOG, logEntry);
}

/**
 * Log a successful tool result.
 */
export function logToolSuccess(
  tool: string,
  route: string,
  method: string,
  params: Record<string, unknown>,
  duration: number,
  resultSize: number
): void {
  logToolCall({
    tool,
    route,
    method,
    params,
    duration,
    success: true,
    resultSize,
  });
}

/**
 * Log a failed tool invocation.
 */
export function logToolError(
  tool: string,
  route: string,
  method: string,
  params: Record<string, unknown>,
  duration: number,
  error: string
): void {
  logToolCall({
    tool,
    route,
    method,
    params,
    duration,
    success: false,
    error,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the path to the logs directory.
 */
export function getLogsPath(): string {
  return LOGS_DIR;
}

/**
 * Get the path to the errors log file.
 */
export function getErrorLogPath(): string {
  return ERROR_LOG;
}

/**
 * Get the path to the tools log file.
 */
export function getToolsLogPath(): string {
  return TOOLS_LOG;
}

/**
 * Initialize logger synchronously (call at startup).
 * After startup, all operations are async.
 */
export function initializeLogger(): void {
  ensureLogsDirSync();
}

// ============================================================================
// Express Middleware Integration
// ============================================================================

/**
 * Create a logging middleware that logs tool invocations.
 * Use this to wrap route handlers for automatic logging.
 */
export function createToolLogger(toolName: string) {
  return (
    req: { method: string; path: string; query: unknown },
    res: { statusCode: number; on: (event: string, cb: () => void) => void },
    next: () => void
  ): void => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const success = res.statusCode < 400;

      logToolCall({
        tool: toolName,
        route: req.path,
        method: req.method,
        params: req.query as Record<string, unknown>,
        duration,
        success,
        error: success ? undefined : `HTTP ${res.statusCode}`,
      });
    });

    next();
  };
}

// ============================================================================
// Security Utilities
// ============================================================================

const SENSITIVE_KEYS = ['token', 'key', 'secret', 'password', 'auth', 'credential', 'api_key', 'apikey'];

/**
 * Sanitize query parameters by redacting sensitive values.
 * Prevents accidental exposure of secrets in logs.
 */
export function sanitizeQueryParams(query: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    const isSensitive = SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s));
    sanitized[key] = isSensitive ? '[REDACTED]' : value;
  }

  return sanitized;
}

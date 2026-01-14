/**
 * Cross-platform logging utility for Octocode Research Server
 *
 * Logs to ~/.octocode/logs/ (or %USERPROFILE%\.octocode\logs on Windows)
 * - errors.log: All errors and warnings
 * - tools.log: Tool invocation data and results
 */

import fs from 'node:fs';
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

// ============================================================================
// Directory Initialization
// ============================================================================

let initialized = false;

/**
 * Ensure the logs directory exists.
 * Creates ~/.octocode/logs if it doesn't exist.
 */
function ensureLogsDir(): void {
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
    // Silently fail - logging should never crash the server
    console.error('[Logger] Failed to create logs directory:', err);
  }
}

// ============================================================================
// Log Rotation
// ============================================================================

/**
 * Rotate log file if it exceeds max size.
 * Renames current log to {name}.{timestamp}.log
 */
function rotateIfNeeded(logPath: string): void {
  try {
    if (!fs.existsSync(logPath)) return;

    const stats = fs.statSync(logPath);
    if (stats.size >= MAX_LOG_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(logPath);
      const base = path.basename(logPath, ext);
      const rotatedPath = path.join(LOGS_DIR, `${base}.${timestamp}${ext}`);
      fs.renameSync(logPath, rotatedPath);

      // Clean up old rotated logs (keep last 5)
      cleanupOldLogs(base, ext, 5);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Remove old rotated log files, keeping only the most recent ones.
 */
function cleanupOldLogs(baseName: string, ext: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(LOGS_DIR)
      .filter((f) => f.startsWith(baseName + '.') && f.endsWith(ext) && f !== baseName + ext)
      .sort()
      .reverse();

    // Remove files beyond the keep limit
    files.slice(keep).forEach((f) => {
      fs.unlinkSync(path.join(LOGS_DIR, f));
    });
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Log Entry Formatting
// ============================================================================

/**
 * Format a log entry with timestamp and level.
 */
function formatLogEntry(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? `\n${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}

// ============================================================================
// Core Logging Functions
// ============================================================================

/**
 * Write to a log file with rotation support.
 */
function writeLog(logPath: string, entry: string): void {
  ensureLogsDir();
  rotateIfNeeded(logPath);

  try {
    fs.appendFileSync(logPath, entry, { encoding: 'utf-8' });
  } catch (err) {
    console.error('[Logger] Failed to write log:', err);
  }
}

// ============================================================================
// Public API - Error Logger
// ============================================================================

/**
 * Log an error message.
 */
export function logError(message: string, error?: Error | unknown): void {
  const errorData =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

  const entry = formatLogEntry('ERROR', message, errorData);
  writeLog(ERROR_LOG, entry);

  // Also write to console for visibility
  console.error(`[ERROR] ${message}`, error || '');
}

/**
 * Log a warning message.
 */
export function logWarn(message: string, data?: unknown): void {
  const entry = formatLogEntry('WARN', message, data);
  writeLog(ERROR_LOG, entry);
  console.warn(`[WARN] ${message}`);
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
}

/**
 * Log a tool invocation.
 */
export function logToolCall(entry: ToolLogEntry): void {
  const logEntry = formatLogEntry('TOOL', `${entry.method} ${entry.route}`, entry);
  writeLog(TOOLS_LOG, logEntry);
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

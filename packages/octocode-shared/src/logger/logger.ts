/**
 * Structured Logger
 *
 * Provides structured logging for octocode-shared instead of bare console.warn/error.
 * Consumers (MCP server, CLI) can plug in a custom handler via setLogHandler().
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

type LogHandler = (entry: LogEntry) => void;

let customHandler: LogHandler | null = null;

/**
 * Default handler that writes to stderr.
 *
 * IMPORTANT: This package is consumed by stdio MCP servers where stdout
 * is reserved for JSON-RPC protocol messages. Using console.log (stdout)
 * would corrupt the MCP transport. All log output MUST go to stderr.
 */
function defaultHandler(entry: LogEntry): void {
  const prefix = `[${entry.module}]`;
  const dataStr =
    entry.data && Object.keys(entry.data).length > 0
      ? ` ${JSON.stringify(entry.data)}`
      : '';
  process.stderr.write(
    `${prefix} ${entry.level}: ${entry.message}${dataStr}\n`
  );
}

/**
 * Set a custom log handler. Pass null to reset to default.
 * Consumers (e.g. MCP server) can route shared-package logs
 * through their own structured logging pipeline.
 *
 * @param handler - Custom log handler or null to reset
 */
export function setLogHandler(handler: LogHandler | null): void {
  customHandler = handler;
}

/**
 * Get the current log handler (for testing).
 * @internal
 */
export function _getLogHandler(): LogHandler | null {
  return customHandler;
}

/**
 * Create a logger scoped to a module name.
 *
 * @param module - Module name prefix (e.g. 'octocode-config', 'token-storage')
 * @returns Logger with debug/info/warn/error methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('octocode-config');
 * logger.warn('Validation error', { field: 'github.apiUrl' });
 * logger.error('Failed to load config', { path: '/home/.octocode/.octocoderc' });
 * ```
 */
export function createLogger(module: string) {
  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ) {
    const entry: LogEntry = { level, module, message, ...(data && { data }) };
    (customHandler ?? defaultHandler)(entry);
  }

  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) =>
      log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      log('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) =>
      log('error', message, data),
  };
}

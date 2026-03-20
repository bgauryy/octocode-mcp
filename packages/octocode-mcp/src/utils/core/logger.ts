import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { version } from '../../../package.json';

/**
 * Simple, reliable logger for Octocode MCP
 */
export type Logger = OctocodeLogger;

export class OctocodeLogger {
  private readonly prefix: string;
  private readonly server: McpServer;

  constructor(server: McpServer, component: string = 'core') {
    this.server = server;
    this.prefix = `Octocode-${version}:${component}`;
  }

  /**
   * Log info message
   */
  async info(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  async warning(
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.log('warning', message, data);
  }

  /**
   * Log error message
   */
  async error(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('error', message, data);
  }

  /**
   * Log debug message
   */
  async debug(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('debug', message, data);
  }

  /**
   * Core logging method - simple and reliable
   */
  private async log(
    level: LoggingLevel,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const sanitizedData = sanitizeLogData(data);
    const safeData =
      sanitizedData &&
      typeof sanitizedData === 'object' &&
      !Array.isArray(sanitizedData)
        ? (sanitizedData as Record<string, unknown>)
        : {};
    const logData = {
      message: sanitizeLogString(message),
      timestamp: new Date().toISOString(),
      ...safeData,
    };

    try {
      if (this.server.isConnected()) {
        await this.server.sendLoggingMessage({
          level,
          logger: this.prefix,
          data: logData,
        });
      }
    } catch {
      // MCP logging must not break tool execution; ignore sendLoggingMessage failures.
    }
  }
}

const REDACTED_PATH = '[REDACTED_LOCAL_PATH]';
const PATH_KEY_PATTERN = /(path|file|dir|directory|cwd|workspace|root)/i;
const URL_PATTERN = /^[a-z]+:\/\//i;
const ABSOLUTE_PATH_PATTERN = /^(~\/|\/|[a-zA-Z]:[\\/]).+/;
const RELATIVE_PATH_PATTERN = /^(\.{1,2}[\\/])?[\w.-]+([\\/][\w.-]+)+(\/)?$/;
const INLINE_PATH_PATTERN =
  /(~\/[^\s'"]+|[a-zA-Z]:[\\/][^\s'"]+|\/(?:[^/\s'"]+\/)*[^/\s'"]+|(?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])+[\w.-]+)/g;

function sanitizeLogData(
  value: unknown,
  parentKey?: string,
  visited = new WeakSet<object>()
): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    if (parentKey && PATH_KEY_PATTERN.test(parentKey)) {
      return REDACTED_PATH;
    }
    return sanitizeLogString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return '[CIRCULAR]';
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogData(item, parentKey, visited));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    sanitized[key] = sanitizeLogData(childValue, key, visited);
  }
  return sanitized;
}

function sanitizeLogString(input: string): string {
  if (!input) {
    return input;
  }
  const trimmed = input.trim();
  if (isLikelyLocalPath(trimmed)) {
    return REDACTED_PATH;
  }
  return input.replace(INLINE_PATH_PATTERN, match =>
    isLikelyLocalPath(match) ? REDACTED_PATH : match
  );
}

function isLikelyLocalPath(value: string): boolean {
  if (!value || URL_PATTERN.test(value)) {
    return false;
  }
  return ABSOLUTE_PATH_PATTERN.test(value) || RELATIVE_PATH_PATTERN.test(value);
}

/**
 * Create a simple logger instance
 */
export function createLogger(
  server: McpServer,
  component?: string
): OctocodeLogger {
  return new OctocodeLogger(server, component);
}

/**
 * Simple logger factory
 */
export class LoggerFactory {
  private static loggers = new Map<string, OctocodeLogger>();

  static getLogger(server: McpServer, component: string): OctocodeLogger {
    if (!this.loggers.has(component)) {
      this.loggers.set(component, new OctocodeLogger(server, component));
    }
    return this.loggers.get(component)!;
  }
}

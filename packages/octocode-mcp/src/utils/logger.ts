import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { version } from '../../package.json';

/**
 * Simple, reliable logger for Octocode MCP
 */
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
    const logData = {
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };

    try {
      if (this.server.isConnected()) {
        await this.server.sendLoggingMessage({
          level,
          logger: this.prefix,
          data: logData,
        });
      }
      // eslint-disable-next-line no-empty
    } catch {}
  }
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

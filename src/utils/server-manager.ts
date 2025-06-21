import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from '../mcp/systemPrompts.js';
import {
  SERVER_CONFIG,
  SERVER_CAPABILITIES,
  OPERATIONAL_CONFIG,
} from '../config.js';
import { Logger } from './logger.js';
import { ToolRegistry } from './tool-registry.js';

export class ServerManager {
  private server: McpServer | null = null;
  private shutdownInProgress = false;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Create and configure the MCP server
   */
  private createServer(): McpServer {
    Logger.debug('Creating MCP server instance');

    const server = new McpServer(SERVER_CONFIG, {
      capabilities: SERVER_CAPABILITIES,
      instructions: PROMPT_SYSTEM_PROMPT,
    });

    // Register all tools
    this.toolRegistry.registerAllTools(server);

    return server;
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signalHandler = (signal: string) => () => this.shutdown(signal);

    // Standard POSIX signals
    process.on('SIGINT', signalHandler('SIGINT'));
    process.on('SIGTERM', signalHandler('SIGTERM'));
    process.on('SIGUSR2', signalHandler('SIGUSR2')); // PM2/nodemon support

    // MCP protocol specific
    process.stdin.on('close', () => this.shutdown('STDIN_CLOSE'));

    // Error handling
    process.on('uncaughtException', error => {
      Logger.error('Uncaught exception', error);
      this.shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      Logger.error('Unhandled rejection at promise', { reason, promise });
      this.shutdown('UNHANDLED_REJECTION');
    });

    Logger.debug('Signal handlers configured');
  }

  /**
   * Perform graceful shutdown with timeout
   */
  async shutdown(signal: string): Promise<void> {
    if (this.shutdownInProgress) {
      Logger.warn(`Shutdown already in progress, ignoring signal: ${signal}`);
      return;
    }

    this.shutdownInProgress = true;
    Logger.info(`Initiating graceful shutdown (signal: ${signal})`);

    try {
      if (this.server) {
        // Set a timeout for server shutdown
        const shutdownPromise = this.server.close();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Shutdown timeout')),
            OPERATIONAL_CONFIG.SHUTDOWN_TIMEOUT
          );
        });

        await Promise.race([shutdownPromise, timeoutPromise]);
        Logger.info('Server shutdown completed successfully');
      }

      process.exit(0);
    } catch (error) {
      Logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      Logger.info('Starting MCP server...');

      // Create server instance
      this.server = this.createServer();

      // Setup signal handlers
      this.setupSignalHandlers();

      // Connect to transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      Logger.info('MCP server started successfully');
    } catch (error) {
      Logger.error('Failed to start server', error);
      throw error;
    }
  }
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerSampling } from './sampling.js';
import { clearAllCache } from './utils/cache.js';
import { registerTools } from './tools/toolsManager.js';
import {
  isBetaEnabled,
  initialize,
  cleanup,
  getGitHubToken,
} from './serverConfig.js';
import { createLogger, LoggerFactory } from './utils/logger.js';
import {
  initializeSession,
  logSessionInit,
  logSessionError,
} from './session.js';
import { version, name } from '../package.json';

const SERVER_CONFIG: Implementation = {
  name: `${name}_${version}`,
  title: 'Octocode MCP',
  version: version,
};

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;
  let logger: ReturnType<typeof createLogger> | null = null;

  try {
    await initialize();

    // Initialize session tracking
    const session = initializeSession();

    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
        logging: {},
        ...(isBetaEnabled() && { sampling: {} }),
      },
    });
    logger = createLogger(server, 'server');
    await logger.info('Server starting', { sessionId: session.getSessionId() });

    await registerAllTools(server);

    // Register prompts
    registerPrompts(server);
    await logger.info('Prompts ready');

    // Register resources
    registerResources(server);
    await logger.info('Resources ready');

    // Register sampling capabilities only if BETA features are enabled
    if (isBetaEnabled()) {
      registerSampling(server);
      await logger.info('Sampling ready (BETA)');
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    await logger.info('Server ready', {
      pid: process.pid,
      sessionId: session.getSessionId(),
    });

    // Log session initialization (fire-and-forget)
    logSessionInit().catch(() => {
      // Silently ignore logging errors
    });

    // Ensure all buffered output is sent
    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async (signal?: string) => {
      // Prevent multiple shutdown attempts
      if (shutdownInProgress) {
        return;
      }

      shutdownInProgress = true;

      try {
        if (logger) {
          await logger.info('Shutting down', { signal });
        }

        // Clear any existing shutdown timeout
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        // Set a new shutdown timeout
        shutdownTimeout = setTimeout(() => {
          process.exit(1);
        }, 5000);

        // Clear cache and credentials (fastest operations)
        clearAllCache();
        cleanup();

        // Close server
        try {
          await server.close();
        } catch {
          // Ignore close errors
        }

        // Clear the timeout since we completed successfully
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        if (logger) {
          await logger.info('Shutdown complete');
        }

        process.exit(0);
      } catch {
        // Clear timeout on error
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        process.exit(1);
      }
    };

    // Handle process signals - only register once
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle stdin close (important for MCP)
    process.stdin.once('close', () => {
      gracefulShutdown('STDIN_CLOSE');
    });

    // Handle uncaught errors - prevent multiple handlers
    process.once('uncaughtException', error => {
      if (logger) {
        logger.error('Uncaught exception', { error: error.message });
      }
      logSessionError(`Uncaught exception: ${error.message}`).catch(() => {
        // Silently ignore logging errors
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', reason => {
      if (logger) {
        logger.error('Unhandled rejection', { reason: String(reason) });
      }
      logSessionError(`Unhandled rejection: ${String(reason)}`).catch(() => {
        // Silently ignore logging errors
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Keep process alive
    process.stdin.resume();
  } catch (startupError) {
    if (logger) {
      await logger.error('Startup failed', { error: String(startupError) });
    }
    logSessionError(`Startup failed: ${String(startupError)}`).catch(() => {
      // Silently ignore logging errors
    });
    process.exit(1);
  }
}

export async function registerAllTools(server: McpServer) {
  const logger = LoggerFactory.getLogger(server, 'tools');

  // Ensure token is available (simple check)
  const token = await getGitHubToken();
  if (!token) {
    await logger.warning('No GitHub token - limited functionality');
    process.stderr.write(
      '⚠️  No GitHub token available - some features may be limited\n'
    );
  } else {
    await logger.info('GitHub token ready');
  }

  const { successCount } = registerTools(server);
  await logger.info('Tools registered', { count: successCount });

  if (successCount === 0) {
    const error = new Error('No tools were successfully registered');
    await logger.error('Tool registration failed');
    throw error;
  }
}

startServer().catch(() => {
  process.exit(1);
});

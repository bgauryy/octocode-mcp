import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './prompts/prompts.js';
import { clearAllCache } from './utils/cache.js';
import { initialize, cleanup, getGitHubToken } from './serverConfig.js';
import { createLogger, LoggerFactory } from './utils/logger.js';
import {
  initializeSession,
  logSessionInit,
  logSessionError,
} from './session.js';
import { loadToolContent } from './tools/toolMetadata.js';
import { registerTools } from './tools/toolsManager.js';
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
    const content = await loadToolContent();

    const session = initializeSession();

    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
        logging: {},
      },
      instructions: content.instructions,
    });
    logger = createLogger(server, 'server');
    await logger.info('Server starting', { sessionId: session.getSessionId() });

    await registerAllTools(server, content);

    registerPrompts(server, content);
    await logger.info('Prompts ready');
    await logger.info('Resources ready');

    const transport = new StdioServerTransport();
    await server.connect(transport);
    await logger.info('Server ready', {
      pid: process.pid,
      sessionId: session.getSessionId(),
    });

    logSessionInit().catch(() => {});

    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async (signal?: string) => {
      if (shutdownInProgress) {
        return;
      }

      shutdownInProgress = true;

      try {
        if (logger) {
          await logger.info('Shutting down', { signal });
        }

        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        shutdownTimeout = setTimeout(() => {
          process.exit(1);
        }, 5000);

        clearAllCache();
        cleanup();

        try {
          await server.close();
        } catch {
          // ignore
        }

        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        if (logger) {
          await logger.info('Shutdown complete');
        }

        process.exit(0);
      } catch {
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        process.exit(1);
      }
    };

    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.stdin.once('close', () => {
      gracefulShutdown('STDIN_CLOSE');
    });

    process.once('uncaughtException', error => {
      if (logger) {
        logger.error('Uncaught exception', { error: error.message });
      }
      logSessionError(`Uncaught exception: ${error.message}`).catch(() => {});
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', reason => {
      if (logger) {
        logger.error('Unhandled rejection', { reason: String(reason) });
      }
      logSessionError(`Unhandled rejection: ${String(reason)}`).catch(() => {});
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    process.stdin.resume();
  } catch (startupError) {
    if (logger) {
      await logger.error('Startup failed', { error: String(startupError) });
    }
    logSessionError(`Startup failed: ${String(startupError)}`).catch(() => {});
    process.exit(1);
  }
}

export async function registerAllTools(
  server: McpServer,
  _content: import('./tools/toolMetadata.js').CompleteMetadata
) {
  const logger = LoggerFactory.getLogger(server, 'tools');

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

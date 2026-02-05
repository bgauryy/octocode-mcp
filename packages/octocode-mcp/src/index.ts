import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';

import { registerPrompts } from './prompts/prompts.js';
import { clearAllCache } from './utils/http/cache.js';
import { clearOctokitInstances } from './github/client.js';
import {
  initialize,
  cleanup,
  getGitHubToken,
  arePromptsEnabled,
} from './serverConfig.js';
import { initializeProviders } from './providers/factory.js';
import { createLogger, LoggerFactory, Logger } from './utils/core/logger.js';
import {
  initializeSession,
  logSessionInit,
  logSessionError,
} from './session.js';
import { loadToolContent, CompleteMetadata } from './tools/toolMetadata.js';
import { registerTools } from './tools/toolsManager.js';
import { version, name } from '../package.json';
import { STARTUP_ERRORS } from './errorCodes.js';

interface ShutdownState {
  inProgress: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
}

const SERVER_CONFIG: Implementation = {
  name: `${name}_${version}`,
  title: 'Octocode MCP',
  version,
};

const SHUTDOWN_TIMEOUT_MS = 5000;

// =============================================================================
// Shutdown Handler
// =============================================================================

function createShutdownHandler(
  server: McpServer,
  logger: Logger | null,
  state: ShutdownState
) {
  return async (signal?: string) => {
    if (state.inProgress) return;
    state.inProgress = true;

    try {
      await logger?.info('Shutting down', { signal });

      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      state.timeout = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);

      // Log memory usage for debugging
      const memUsage = process.memoryUsage();
      await logger?.info('Memory at shutdown', {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      });

      // Cleanup all caches and instances
      clearAllCache();
      clearOctokitInstances();
      cleanup();

      try {
        await server.close();
      } catch {
        // Server close may fail if already disconnected - safe to ignore
      }

      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      await logger?.info('Shutdown complete');
      process.exit(0);
    } catch {
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
      process.exit(1);
    }
  };
}

// =============================================================================
// Process Signal Handlers
// =============================================================================

function setupProcessHandlers(
  gracefulShutdown: (signal?: string) => Promise<void>,
  logger: Logger | null
) {
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.stdin.once('close', () => gracefulShutdown('STDIN_CLOSE'));

  process.once('uncaughtException', error => {
    logger?.error('Uncaught exception', { error: error.message });
    logSessionError('startup', STARTUP_ERRORS.UNCAUGHT_EXCEPTION.code).catch(
      () => {}
    );
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.once('unhandledRejection', reason => {
    logger?.error('Unhandled rejection', { reason: String(reason) });
    logSessionError('startup', STARTUP_ERRORS.UNHANDLED_REJECTION.code).catch(
      () => {}
    );
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

// =============================================================================
// Tool Registration
// =============================================================================

export async function registerAllTools(
  server: McpServer,
  _content: CompleteMetadata
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

  const { successCount } = await registerTools(server);
  await logger.info('Tools registered', { count: successCount });

  if (successCount === 0) {
    await logSessionError('startup', STARTUP_ERRORS.NO_TOOLS_REGISTERED.code);
    await logger.error('Tool registration failed');
    throw new Error(STARTUP_ERRORS.NO_TOOLS_REGISTERED.message);
  }
}

// =============================================================================
// Server Initialization
// =============================================================================

async function createServer(content: CompleteMetadata): Promise<McpServer> {
  const capabilities: {
    prompts?: Record<string, never>;
    tools: Record<string, never>;
    logging: Record<string, never>;
  } = {
    tools: {},
    logging: {},
  };

  if (arePromptsEnabled()) {
    capabilities.prompts = {};
  }

  return new McpServer(SERVER_CONFIG, {
    capabilities,
    instructions: content.instructions,
  });
}

async function startServer() {
  const shutdownState: ShutdownState = { inProgress: false, timeout: null };
  let logger: Logger | null = null;

  try {
    // Initialize configuration
    await initialize();

    // Initialize provider registry (GitHub + GitLab)
    await initializeProviders();
    const content = await loadToolContent();

    // Initialize session tracking
    const session = initializeSession();

    // Create and configure server
    const server = await createServer(content);
    logger = createLogger(server, 'server');
    await logger.info('Server starting', { sessionId: session.getSessionId() });

    // Register tools and prompts
    await registerAllTools(server, content);
    if (arePromptsEnabled()) {
      registerPrompts(server, content);
      await logger.info('Prompts ready');
    } else {
      await logger.info('Prompts disabled via DISABLE_PROMPTS');
    }

    // Setup shutdown handling
    const gracefulShutdown = createShutdownHandler(
      server,
      logger,
      shutdownState
    );
    setupProcessHandlers(gracefulShutdown, logger);

    // Connect transport and start
    const transport = new StdioServerTransport();
    await server.connect(transport);
    await logger.info('Server ready', {
      pid: process.pid,
      sessionId: session.getSessionId(),
    });

    // Background session logging
    logSessionInit().catch(() => {});

    // Enable output streams
    process.stdout.uncork();
    process.stderr.uncork();
    process.stdin.resume();
  } catch (startupError) {
    await logger?.error('Startup failed', { error: String(startupError) });
    await logSessionError('startup', STARTUP_ERRORS.STARTUP_FAILED.code);
    process.exit(1);
  }
}

// =============================================================================
// Entry Point
// =============================================================================

startServer().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error || 'Unknown error');
  process.stderr.write(`❌ Startup failed: ${message}\n`);
  process.exit(1);
});

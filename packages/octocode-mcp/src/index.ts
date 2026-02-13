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
import {
  initializeProviders,
  clearProviderCache,
} from './providers/factory.js';
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
  getLogger: () => Logger | null,
  state: ShutdownState
) {
  return async (signal?: string) => {
    if (state.inProgress) return;
    state.inProgress = true;

    try {
      const logger = getLogger();

      // Log while transport is still connected
      await logger?.info('Shutting down', { signal });

      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

      // Force-exit safety net: if cleanup hangs, exit after timeout
      state.timeout = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);

      // Cleanup all caches and instances
      clearAllCache();
      clearOctokitInstances();
      clearProviderCache();
      cleanup();

      // Close server transport — after this, logger calls are no-ops
      try {
        await server.close();
      } catch {
        // Server close may fail if already disconnected - safe to ignore
      }

      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }

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
  getLogger: () => Logger | null
) {
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.stdin.once('close', () => gracefulShutdown('STDIN_CLOSE'));

  process.once('uncaughtException', error => {
    // Resolve logger lazily — may be null if crash is during startup
    getLogger()?.error('Uncaught exception', { error: error.message });
    logSessionError('startup', STARTUP_ERRORS.UNCAUGHT_EXCEPTION.code).catch(
      () => {}
    );
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.once('unhandledRejection', reason => {
    getLogger()?.error('Unhandled rejection', { reason: String(reason) });
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

  // Lazy getter: shutdown/error handlers always get the current logger
  // (null before connect, valid after connect, works during the server lifetime)
  const getLogger = () => logger;

  try {
    // Phase 1: Initialize configuration & providers
    await initialize();
    await initializeProviders();
    const content = await loadToolContent();
    const session = initializeSession();

    // Phase 2: Create server, register tools & prompts (pre-connect)
    const server = await createServer(content);
    await registerAllTools(server, content);
    if (arePromptsEnabled()) {
      registerPrompts(server, content);
    }

    // Phase 3: Setup shutdown/crash handlers BEFORE connect
    // Uses lazy getLogger() so handlers work both with and without a logger
    const gracefulShutdown = createShutdownHandler(
      server,
      getLogger,
      shutdownState
    );
    setupProcessHandlers(gracefulShutdown, getLogger);

    // Phase 4: Connect transport — server is now live on stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Phase 5: Logger works NOW (transport connected, isConnected() = true)
    logger = createLogger(server, 'server');
    await logger.info('Server ready', {
      pid: process.pid,
      sessionId: session.getSessionId(),
    });

    // Background session logging
    logSessionInit().catch(() => {});
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './mcp/prompts.js';
import { registerResources } from './mcp/resources.js';
import { registerSampling } from './mcp/sampling.js';
import { clearAllCache } from './mcp/utils/cache.js';
import { registerTools } from './mcp/tools/toolsManager.js';

import { getToken, isAdvancedTokenManager } from './mcp/utils/tokenManager.js';
import { isBetaEnabled } from '../config.js';
import { version, name } from '../package.json';

const SERVER_CONFIG: Implementation = {
  name: `${name}_${version}`,
  title: 'Octocode MCP',
  version: version,
};

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
        ...(isBetaEnabled() && { sampling: {} }),
      },
    });

    // Initialize advanced components if configured
    try {
      const { AuditLogger } = await import('./security/auditLogger.js');
      AuditLogger.initialize();
    } catch (_advancedInitError) {
      // Ignore advanced initialization errors to avoid blocking startup
    }

    await registerAllTools(server);

    // Register prompts
    registerPrompts(server);

    // Register resources
    registerResources(server);

    // Register sampling capabilities only if BETA features are enabled
    if (isBetaEnabled()) {
      registerSampling(server);
    }

    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Ensure all buffered output is sent
    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async (_signal?: string) => {
      // Prevent multiple shutdown attempts
      if (shutdownInProgress) {
        return;
      }

      shutdownInProgress = true;

      try {
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

        // Shutdown advanced modules gracefully
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.shutdown();
        } catch (error) {
          // Ignore shutdown errors
        }

        // Close server with timeout protection
        try {
          await server.close();
        } catch (closeError) {
          // Error closing server
        }

        // Clear the timeout since we completed successfully
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        process.exit(0);
      } catch (_error) {
        // Error during graceful shutdown

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
    process.once('uncaughtException', _error => {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (_reason, _promise) => {
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Keep process alive
    process.stdin.resume();
  } catch (_error) {
    process.exit(1);
  }
}

export async function registerAllTools(server: McpServer) {
  // Ensure token exists and is stored securely (existing behavior)
  await getToken();

  // Info message for audit logging
  if (isAdvancedTokenManager()) {
    process.stderr.write('📊 Audit logging enabled\n');
  }

  const { successCount } = registerTools(server);

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

startServer().catch(() => {
  process.exit(1);
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './mcp/prompts.js';
import { registerResources } from './mcp/resources.js';
import { registerSampling } from './mcp/sampling.js';
import { clearAllCache } from './mcp/utils/cache.js';
import { registerTools } from './mcp/tools/toolsManager.js';
import { SecureCredentialStore } from './security/credentialStore.js';
import {
  getToken,
  isEnterpriseTokenManager,
  isCliTokenResolutionEnabled,
} from './mcp/utils/tokenManager.js';
import {
  isBetaEnabled,
  isAuditingEnabled,
  isRateLimitingEnabled,
} from '../config.js';
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

    // Initialize enterprise components if configured
    try {
      if (isAuditingEnabled()) {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.initialize();
      }

      if (isRateLimitingEnabled()) {
        const { RateLimiter } = await import('./security/rateLimiter.js');
        RateLimiter.initialize();
      }
    } catch (_enterpriseInitError) {
      // Ignore enterprise initialization errors to avoid blocking startup
    }

    // Initialize OAuth/GitHub App authentication
    await initializeAuthentication();

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
        SecureCredentialStore.clearAll();

        // Shutdown enterprise modules gracefully
        try {
          if (isAuditingEnabled()) {
            const { AuditLogger } = await import('./security/auditLogger.js');
            AuditLogger.shutdown();
          }

          if (isRateLimitingEnabled()) {
            const { RateLimiter } = await import('./security/rateLimiter.js');
            RateLimiter.shutdown();
          }
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

/**
 * Initialize unified authentication system
 */
async function initializeAuthentication(): Promise<void> {
  try {
    const { AuthenticationManager } = await import(
      './auth/authenticationManager.js'
    );
    const authManager = AuthenticationManager.getInstance();
    await authManager.initialize();
  } catch (error) {
    // Log error but don't fail startup - fall back to existing authentication
    process.stderr.write(
      `Warning: Failed to initialize authentication: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
  }
}

export async function registerAllTools(server: McpServer) {
  // Ensure token exists and is stored securely (existing behavior)
  await getToken();

  // Warn about CLI restrictions in enterprise mode
  if (isEnterpriseTokenManager() && !isCliTokenResolutionEnabled()) {
    // Use stderr for enterprise mode notification to avoid console linter issues
    process.stderr.write(
      '🔒 Enterprise mode active: CLI token resolution disabled for security\n'
    );
  }

  const { successCount } = registerTools(server);

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

startServer().catch(() => {
  process.exit(1);
});

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// import { Implementation } from '@modelcontextprotocol/sdk/types.js';
// import { registerPrompts } from './prompts.js';
// import { registerResources } from './resources.js';
// import { registerSampling } from './sampling.js';
// import { clearAllCache } from './utils/cache.js';
import { registerTools } from './tools/toolsManager.js';
import {
  initialize,
  // cleanup,
  getGitHubToken,
  // isBetaEnabled,
} from './serverConfig.js';
//import { createLogger, LoggerFactory } from './utils/logger.js';
import { LoggerFactory } from './utils/logger.js';
import { version, name } from '../package.json';

async function startServer() {
  // let shutdownInProgress = false;
  // let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;
  // const logger: ReturnType<typeof createLogger> | null = null;

  // try {
  await initialize();
  const server = new Server(
    {
      name: `${name}`,
      title: 'Octocode MCP Server',
      version,
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
        logging: {},
        completions: {},
      },
      instructions:
        'Octocode MCP: Advanced GitHub repository analysis and code discovery tools',
    }
  );
  //logger = createLogger(server, 'server');
  //await logger.info('Server starting');

  await registerAllTools(server);

  // Register prompts
  //registerPrompts(server);
  //await logger.info('Prompts ready');

  // Register resources
  //registerResources(server);
  //await logger.info('Resources ready');

  // Register sampling capabilities only if BETA features are enabled
  // if (isBetaEnabled()) {
  //   registerSampling(server);
  //   await logger.info('Sampling ready (BETA)');
  // }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  //await logger.info('Server ready', { pid: process.pid });

  //   const gracefulShutdown = async (_signal?: string) => {
  //     // Prevent multiple shutdown attempts
  //     if (shutdownInProgress) {
  //       return;
  //     }

  //     shutdownInProgress = true;

  //     try {
  //       if (logger) {
  //         //await logger.info('Shutting down', { signal });
  //       }

  //       // Clear any existing shutdown timeout
  //       if (shutdownTimeout) {
  //         clearTimeout(shutdownTimeout);
  //         shutdownTimeout = null;
  //       }

  //       // Set a new shutdown timeout
  //       shutdownTimeout = setTimeout(() => {
  //         process.exit(1);
  //       }, 5000);

  //       // Clear cache and credentials (fastest operations)
  //       clearAllCache();
  //       cleanup();

  //       // Close server
  //       try {
  //         await server.close();
  //       } catch {
  //         // Ignore close errors
  //       }

  //       // Clear the timeout since we completed successfully
  //       if (shutdownTimeout) {
  //         clearTimeout(shutdownTimeout);
  //         shutdownTimeout = null;
  //       }

  //       if (logger) {
  //         //await logger.info('Shutdown complete');
  //       }

  //       process.exit(0);
  //     } catch {
  //       // Clear timeout on error
  //       if (shutdownTimeout) {
  //         clearTimeout(shutdownTimeout);
  //         shutdownTimeout = null;
  //       }

  //       process.exit(1);
  //     }
  //   };

  //   // Handle process signals - only register once
  //   process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  //   process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

  //   // Handle stdin close (important for MCP)
  //   process.stdin.once('close', () => {
  //     gracefulShutdown('STDIN_CLOSE');
  //   });

  //   // Handle uncaught errors - prevent multiple handlers
  //   process.once('uncaughtException', _error => {
  //     if (logger) {
  //       //logger.error('Uncaught exception', { error: error.message });
  //     }
  //     gracefulShutdown('UNCAUGHT_EXCEPTION');
  //   });

  //   process.once('unhandledRejection', _reason => {
  //     if (logger) {
  //       //logger.error('Unhandled rejection', { reason: String(reason) });
  //     }
  //     gracefulShutdown('UNHANDLED_REJECTION');
  //   });

  //   // Keep process alive
  //   process.stdin.resume();
  // }
  // } catch (startupError) {
  //   if (logger) {
  //     //await logger.error('Startup failed', { error: String(startupError) });
  //   }
  //   process.exit(1);
  // }
}

export async function registerAllTools(server: Server) {
  const logger = LoggerFactory.getLogger(server, 'tools');

  // Ensure token is available (simple check)
  const token = await getGitHubToken();
  if (!token) {
    await logger.warning(
      'No GitHub token available - some features may be limited'
    );
  } else {
    //await logger.info('GitHub token ready');
  }

  const { successCount, failedTools } = registerTools(server);
  //await logger.info('Tools registered', {
  //count: successCount,
  //failed: failedTools.length,
  //});

  if (failedTools.length > 0) {
    await logger.warning('Some tools failed to register', { failedTools });
  }

  if (successCount === 0) {
    const error = new Error('No tools were successfully registered');
    await logger.error('Tool registration failed', { failedTools });
    throw error;
  }
}

startServer().catch(() => {
  process.exit(1);
});

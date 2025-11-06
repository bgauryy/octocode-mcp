import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './prompts/prompts.js';
//import { registerResources } from './resources.js';
import { clearAllCache } from './utils/cache.js';
import { registerTools } from './tools/toolsManager.js';
import { initialize, cleanup, getGitHubToken } from './serverConfig.js';
import { createLogger, LoggerFactory } from './utils/logger.js';
import {
  initializeSession,
  logSessionInit,
  logSessionError,
} from './session.js';
import { version, name } from '../package.json';

const INSTRUCTIONS = `Purpose: Understand and discover code and flows using Github research

AVAILABLE TOOLS:

1. githubSearchRepositories - DISCOVER REPOSITORIES
2. githubSearchCode - FIND CODE PATTERNS  
3. githubViewRepoStructure - EXPLORE DIRECTORY STRUCTURE
4. githubGetFileContent - READ FILE CONTENTS
5. githubSearchPullRequests - ANALYZE PULL REQUESTS

RECOMMENDED WORKFLOW (Progressive Research):
Phase 1: DISCOVER → githubSearchRepositories (find relevant repos)
Phase 2: EXPLORE → githubViewRepoStructure (understand organization)  
Phase 3: SEARCH → githubSearchCode (locate specific code)
Phase 4: ANALYZE → githubGetFileContent (read implementations)

BASIC FLOW:
- Use the available tools in alignment with your research goal
- The workflow is flexible. Choose the most appropriate tool based on your research goals and the current context
- Let the researchGoal and your reasoning direct each query
- Analyze results, context and hints before planning your next action
- For complex problems, request clarification from the user when needed

KEY PRINCIPLES:
- All tools support bulk operations (multiple queries per call 1-3)
- Always restrict searches with owner/repo scoping to conserve rate limits
- Work efficiently to minimize rate limit usage; explore alternatives as necessary
- After each step, reflect on the outcome and plan your next action thoughtfully
`;

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

    const session = initializeSession();

    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
        logging: {},
      },
      instructions: INSTRUCTIONS,
    });
    logger = createLogger(server, 'server');
    await logger.info('Server starting', { sessionId: session.getSessionId() });

    await registerAllTools(server);

    registerPrompts(server);
    await logger.info('Prompts ready');

    //registerResources(server);
    await logger.info('Resources ready');

    const transport = new StdioServerTransport();
    await server.connect(transport);
    await logger.info('Server ready', {
      pid: process.pid,
      sessionId: session.getSessionId(),
    });

    // Log session initialization (fire-and-forget)
    logSessionInit().catch(() => {
      // Silently ignore logging errors to avoid breaking MCP protocol
    });

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

        // Clear any existing shutdown timeout
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        // Set a new shutdown timeout
        shutdownTimeout = setTimeout(() => {
          process.exit(1);
        }, 5000);

        clearAllCache();
        cleanup();

        try {
          await server.close();
        } catch {
          //ignore
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

    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.stdin.once('close', () => {
      gracefulShutdown('STDIN_CLOSE');
    });

    process.once('uncaughtException', error => {
      if (logger) {
        logger.error('Uncaught exception', { error: error.message });
      }
      logSessionError(`Uncaught exception: ${error.message}`).catch(() => {
        // Silently ignore logging errors to avoid breaking shutdown
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', reason => {
      if (logger) {
        logger.error('Unhandled rejection', { reason: String(reason) });
      }
      logSessionError(`Unhandled rejection: ${String(reason)}`).catch(() => {
        // Silently ignore logging errors to avoid breaking shutdown
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
      // Silently ignore logging errors to avoid breaking shutdown
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

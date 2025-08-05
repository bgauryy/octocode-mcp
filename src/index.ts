import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { clearAllCache } from './utils/cache.js';
import { registerGitHubSearchCodeTool } from './mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from './mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from './mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from './mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from './mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from './mcp/tools/package_search.js';
import { registerViewGitHubRepoStructureTool } from './mcp/tools/github_view_repo_structure.js';
import { getNPMUserDetails } from './mcp/tools/utils/APIStatus.js';
import { version } from '../package.json';
import { TOOL_NAMES, ToolOptions } from './mcp/tools/utils/toolConstants.js';
import { getGithubCLIToken } from './utils/exec.js';
import { logger } from './utils/logger.js';

async function getToken(): Promise<string> {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    (await getGithubCLIToken());

  if (!token) {
    throw new Error(
      'No GitHub token found. Please set GITHUB_TOKEN or GH_TOKEN environment variable or authenticate with GitHub CLI'
    );
  }

  return token;
}

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version,
  description: PROMPT_SYSTEM_PROMPT,
};

async function registerAllTools(server: McpServer) {
  // Get the token first
  const token = await getToken();

  // Check NPM availability during initialization
  let npmEnabled = false;
  try {
    const npmDetails = await getNPMUserDetails();
    npmEnabled = npmDetails.npmConnected;
  } catch (error) {
    logger.warn('NPM availability check failed, disabling NPM features', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    npmEnabled = false;
  }

  // Unified options for all tools
  const toolOptions: ToolOptions = {
    npmEnabled,
    ghToken: token,
  };

  const toolRegistrations = [
    {
      name: TOOL_NAMES.GITHUB_SEARCH_CODE,
      fn: registerGitHubSearchCodeTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      fn: registerSearchGitHubReposTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      fn: registerFetchGitHubFileContentTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      fn: registerViewGitHubRepoStructureTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
      fn: registerSearchGitHubCommitsTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      fn: registerSearchGitHubPullRequestsTool,
      opts: toolOptions,
    },
    {
      name: TOOL_NAMES.PACKAGE_SEARCH,
      fn: registerPackageSearchTool,
      opts: toolOptions,
    },
  ];

  let successCount = 0;
  const failedTools: string[] = [];

  for (const tool of toolRegistrations) {
    try {
      if ('opts' in tool && tool.opts) {
        tool.fn(server, tool.opts);
      } else {
        tool.fn(server);
      }
      successCount++;
    } catch (error) {
      // Log the error but continue with other tools
      failedTools.push(tool.name);
    }
  }

  if (failedTools.length > 0) {
    logger.warn('Some tools failed to register', {
      failedTools,
      successCount,
      totalTools: toolRegistrations.length,
    });
  }

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const server = new McpServer(SERVER_CONFIG);

    await registerAllTools(server);

    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Ensure all buffered output is sent
    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async (signal?: string) => {
      // Prevent multiple shutdown attempts
      if (shutdownInProgress) {
        logger.warn(
          'Shutdown already in progress, ignoring additional signal',
          { signal }
        );
        return;
      }

      shutdownInProgress = true;
      logger.info('Starting graceful shutdown', { signal });

      try {
        // Clear any existing shutdown timeout
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        // Set a new shutdown timeout
        shutdownTimeout = setTimeout(() => {
          logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 5000);

        // Clear cache first (fastest operation)
        clearAllCache();

        // Close server with timeout protection
        try {
          await server.close();
          logger.info('Server closed successfully');
        } catch (closeError) {
          logger.error(
            'Error closing server',
            closeError instanceof Error ? closeError : undefined
          );
        }

        // Clear the timeout since we completed successfully
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error(
          'Error during graceful shutdown',
          error instanceof Error ? error : undefined
        );

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
      logger.error('Uncaught exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (reason, _promise) => {
      logger.error(
        'Unhandled rejection',
        reason instanceof Error ? reason : new Error(String(reason))
      );
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Keep process alive
    process.stdin.resume();

    logger.info('MCP Server started successfully');
  } catch (error) {
    logger.error(
      'Failed to start server',
      error instanceof Error ? error : undefined
    );
    process.exit(1);
  }
}

startServer().catch(() => {
  process.exit(1);
});

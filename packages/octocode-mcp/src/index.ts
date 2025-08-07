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
import { registerPackageSearchTool } from './mcp/tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from './mcp/tools/github_view_repo_structure.js';
import { getNPMUserDetails } from './mcp/tools/utils/APIStatus.js';
import { version } from '../package.json';
import { TOOL_NAMES, ToolOptions } from './mcp/tools/utils/toolConstants.js';
import { getGithubCLIToken } from './utils/exec.js';

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
  name: 'octocode',
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
      tool.fn(server, tool.opts);
      successCount++;
    } catch (error) {
      // Log the error but continue with other tools
      failedTools.push(tool.name);
    }
  }

  if (failedTools.length > 0) {
    // Tools failed to register
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

        // Clear cache first (fastest operation)
        clearAllCache();

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

startServer().catch(() => {
  process.exit(1);
});

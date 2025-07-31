import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { clearAllCache } from './utils/cache.js';
import { registerGitHubSearchCodeTool } from './mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from './mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from './mcp/tools/github_search_repos.js';
import { registerGitHubSearchCommitsTool } from './mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from './mcp/tools/github_search_pull_requests.js';
import {
  NPM_PACKAGE_SEARCH_TOOL_NAME,
  registerNpmSearchTool,
} from './mcp/tools/package_search.js';
import {
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  registerViewRepositoryStructureTool,
} from './mcp/tools/github_view_repo_structure.js';
import { registerSearchGitHubIssuesTool } from './mcp/tools/github_search_issues.js';
import { version } from '../package.json';
import {
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  GITHUB_SEARCH_COMMITS_TOOL_NAME,
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  GITHUB_SEARCH_CODE_TOOL_NAME,
  GitHubToolOptions,
} from './mcp/tools/utils/toolConstants.js';

const API_TYPE: GitHubToolOptions['apiType'] = 'octokit';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version,
  description: PROMPT_SYSTEM_PROMPT,
};

function registerAllTools(server: McpServer) {
  const toolRegistrations = [
    {
      name: GITHUB_SEARCH_CODE_TOOL_NAME,
      fn: registerGitHubSearchCodeTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
      fn: registerSearchGitHubReposTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
      fn: registerFetchGitHubFileContentTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
      fn: registerViewRepositoryStructureTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_SEARCH_COMMITS_TOOL_NAME,
      fn: registerGitHubSearchCommitsTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
      fn: registerSearchGitHubPullRequestsTool,
      opts: { apiType: API_TYPE },
    },
    {
      name: GITHUB_SEARCH_ISSUES_TOOL_NAME,
      fn: registerSearchGitHubIssuesTool,
    },
    { name: NPM_PACKAGE_SEARCH_TOOL_NAME, fn: registerNpmSearchTool },
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
      // eslint-disable-next-line no-console
      console.error(`Failed to register tool '${tool.name}':`, error);
      failedTools.push(tool.name);
    }
  }

  if (failedTools.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: ${failedTools.length} tools failed to register: ${failedTools.join(', ')}`
    );
  }

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

async function startServer() {
  try {
    const server = new McpServer(SERVER_CONFIG);

    registerAllTools(server);

    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Ensure all buffered output is sent
    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async () => {
      try {
        clearAllCache();

        // Create promises for server close and timeout
        const closePromise = server.close();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Server close timeout after 5 seconds')),
            5000
          )
        );

        try {
          // Race between close and timeout
          await Promise.race([closePromise, timeoutPromise]);
          // If we reach here, server closed successfully
          process.exit(0);
        } catch (timeoutError) {
          // eslint-disable-next-line no-console
          console.error(
            'Server close timed out, forcing shutdown:',
            timeoutError
          );
          // Exit with error code when timeout occurs
          process.exit(1);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle process signals
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    // Handle stdin close (important for MCP)
    process.stdin.on('close', async () => {
      await gracefulShutdown();
    });

    // Handle uncaught errors
    process.on('uncaughtException', error => {
      // eslint-disable-next-line no-console
      console.error('Uncaught exception:', error);
      gracefulShutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      gracefulShutdown().finally(() => process.exit(1));
    });

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    process.exit(1);
  }
}

startServer().catch(() => {
  process.exit(1);
});

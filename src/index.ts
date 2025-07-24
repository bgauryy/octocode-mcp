import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { clearAllCache } from './utils/cache.js';
import {
  API_STATUS_CHECK_TOOL_NAME,
  registerApiStatusCheckTool,
} from './mcp/tools/api_status_check.js';
import {
  GITHUB_SEARCH_CODE_TOOL_NAME,
  registerGitHubSearchCodeTool,
} from './mcp/tools/github_search_code.js';
import {
  GITHUB_GET_FILE_CONTENT_TOOL_NAME,
  registerFetchGitHubFileContentTool,
} from './mcp/tools/github_fetch_content.js';
import {
  GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
  registerSearchGitHubReposTool,
} from './mcp/tools/github_search_repos.js';
import {
  GITHUB_SEARCH_COMMITS_TOOL_NAME,
  registerGitHubSearchCommitsTool,
} from './mcp/tools/github_search_commits.js';
import {
  GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
  registerSearchGitHubPullRequestsTool,
} from './mcp/tools/github_search_pull_requests.js';
import {
  NPM_PACKAGE_SEARCH_TOOL_NAME,
  registerNpmSearchTool,
} from './mcp/tools/package_search.js';
import {
  GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
  registerViewRepositoryStructureTool,
} from './mcp/tools/github_view_repo_structure.js';
import {
  GITHUB_SEARCH_ISSUES_TOOL_NAME,
  registerSearchGitHubIssuesTool,
} from './mcp/tools/github_search_issues.js';
import {
  NPM_VIEW_PACKAGE_TOOL_NAME,
  registerNpmViewPackageTool,
} from './mcp/tools/npm_view_package.js';
import { version } from '../package.json';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version,
  description: PROMPT_SYSTEM_PROMPT,
};

function registerAllTools(server: McpServer) {
  const toolRegistrations = [
    { name: API_STATUS_CHECK_TOOL_NAME, fn: registerApiStatusCheckTool },
    { name: GITHUB_SEARCH_CODE_TOOL_NAME, fn: registerGitHubSearchCodeTool },
    {
      name: GITHUB_GET_FILE_CONTENT_TOOL_NAME,
      fn: registerFetchGitHubFileContentTool,
    },
    {
      name: GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
      fn: registerSearchGitHubReposTool,
    },
    {
      name: GITHUB_SEARCH_COMMITS_TOOL_NAME,
      fn: registerGitHubSearchCommitsTool,
    },
    {
      name: GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME,
      fn: registerSearchGitHubPullRequestsTool,
    },
    { name: NPM_PACKAGE_SEARCH_TOOL_NAME, fn: registerNpmSearchTool },
    {
      name: GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME,
      fn: registerViewRepositoryStructureTool,
    },
    {
      name: GITHUB_SEARCH_ISSUES_TOOL_NAME,
      fn: registerSearchGitHubIssuesTool,
    },
    { name: NPM_VIEW_PACKAGE_TOOL_NAME, fn: registerNpmViewPackageTool },
  ];

  let successCount = 0;
  for (const tool of toolRegistrations) {
    try {
      tool.fn(server);
      successCount++;
    } catch (error) {
      // Continue with other tools instead of failing completely
    }
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

        // Give server time to close properly
        await Promise.race([
          server.close(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Server close timeout')), 5000)
          ),
        ]);

        process.exit(0);
      } catch (error) {
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
    process.on('uncaughtException', () => {
      gracefulShutdown();
    });

    process.on('unhandledRejection', () => {
      gracefulShutdown();
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

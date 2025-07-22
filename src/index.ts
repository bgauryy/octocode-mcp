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

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
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
  const failedTools: Array<{ name: string; error: string }> = [];

  for (const tool of toolRegistrations) {
    try {
      tool.fn(server);
      successCount++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      failedTools.push({ name: tool.name, error: errorMessage });
      // Log registration failure for debugging
      // TODO: log
    }
  }

  if (successCount === 0) {
    const errorDetails = failedTools
      .map(f => `${f.name}: ${f.error}`)
      .join('; ');
    throw new Error(
      `No tools were successfully registered. Failures: ${errorDetails}`
    );
  }

  if (failedTools.length > 0) {
    // TODO: log
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

    // Handle uncaught errors with proper logging
    process.on('uncaughtException', _error => {
      // TODO: log
      gracefulShutdown();
    });

    process.on('unhandledRejection', (_reason, _promise) => {
      // TODO: log
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

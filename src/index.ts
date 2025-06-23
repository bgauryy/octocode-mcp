import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { registerApiStatusCheckTool } from './mcp/tools/api_status_check.js';
import { registerGitHubSearchCodeTool } from './mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from './mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from './mcp/tools/github_search_repos.js';
import { registerGitHubSearchCommitsTool } from './mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from './mcp/tools/github_search_pull_requests.js';
import { registerNpmSearchTool } from './mcp/tools/npm_package_search.js';
import { registerViewRepositoryStructureTool } from './mcp/tools/github_view_repo_structure.js';
import { registerSearchGitHubIssuesTool } from './mcp/tools/github_search_issues.js';
import { registerNpmViewPackageTool } from './mcp/tools/npm_view_package.js';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
  description: `Comprehensive code analysis assistant: Deep exploration and understanding of complex implementations in GitHub repositories and npm packages.
       Specialized in architectural analysis, algorithm explanations, and complete technical documentation.`,
};

function registerAllTools(server: McpServer) {
  const toolRegistrations = [
    { name: 'ApiStatusCheck', fn: registerApiStatusCheckTool },
    { name: 'GitHubSearchCode', fn: registerGitHubSearchCodeTool },
    {
      name: 'FetchGitHubFileContent',
      fn: registerFetchGitHubFileContentTool,
    },
    { name: 'SearchGitHubRepos', fn: registerSearchGitHubReposTool },
    { name: 'SearchGitHubCommits', fn: registerGitHubSearchCommitsTool },
    {
      name: 'SearchGitHubPullRequests',
      fn: registerSearchGitHubPullRequestsTool,
    },
    { name: 'NpmSearch', fn: registerNpmSearchTool },
    {
      name: 'ViewRepositoryStructure',
      fn: registerViewRepositoryStructureTool,
    },
    { name: 'SearchGitHubIssues', fn: registerSearchGitHubIssuesTool },
    { name: 'NpmViewPackage', fn: registerNpmViewPackageTool },
  ];

  for (const tool of toolRegistrations) {
    try {
      tool.fn(server);
    } catch (error) {
      // ignore
    }
  }
}

async function startServer() {
  try {
    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: `
    ${PROMPT_SYSTEM_PROMPT}
  `,
    });

    registerAllTools(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const gracefulShutdown = async (_signal: string) => {
      try {
        await server.close();
        process.exit(0);
      } catch (error) {
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.stdin.on('close', async () => {
      await gracefulShutdown('STDIN_CLOSE');
    });

    process.on('uncaughtException', () => {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', () => {
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  } catch (error) {
    process.exit(1);
  }
}

startServer().catch(() => {
  process.exit(1);
});

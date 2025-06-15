import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Tools from './mcp/tools/index.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
  description: `Code question assistant: Find, analyze, and explore any code in GitHub repositories and npm packages.
       Use for code examples, implementations, debugging, and understanding how libraries work.`,
};

function registerAllTools(server: McpServer) {
  const toolRegistrations = [
    { name: 'ApiStatusCheck', fn: Tools.registerApiStatusCheckTool },
    { name: 'GitHubSearchCode', fn: Tools.registerGitHubSearchCodeTool },
    {
      name: 'FetchGitHubFileContent',
      fn: Tools.registerFetchGitHubFileContentTool,
    },
    { name: 'SearchGitHubRepos', fn: Tools.registerSearchGitHubReposTool },
    { name: 'SearchGitHubCommits', fn: Tools.registerSearchGitHubCommitsTool },
    {
      name: 'SearchGitHubPullRequests',
      fn: Tools.registerSearchGitHubPullRequestsTool,
    },
    {
      name: 'GetUserOrganizations',
      fn: Tools.registerGetUserOrganizationsTool,
    },
    { name: 'NpmSearch', fn: Tools.registerNpmSearchTool },
    {
      name: 'ViewRepositoryStructure',
      fn: Tools.registerViewRepositoryStructureTool,
    },
    { name: 'SearchGitHubIssues', fn: Tools.registerSearchGitHubIssuesTool },
    { name: 'SearchGitHubTopics', fn: Tools.registerSearchGitHubTopicsTool },
    { name: 'SearchGitHubUsers', fn: Tools.registerSearchGitHubUsersTool },
    {
      name: 'NpmDependencyAnalysis',
      fn: Tools.registerNpmDependencyAnalysisTool,
    },
    { name: 'NpmGetDependencies', fn: Tools.registerNpmGetDependenciesTool },

    { name: 'NpmGetReleases', fn: Tools.registerNpmGetReleasesTool },
    { name: 'NpmGetExports', fn: Tools.registerNpmGetExportsTool },
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
    #PROMPT_SYSTEM_PROMPT
    ${PROMPT_SYSTEM_PROMPT}`,
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

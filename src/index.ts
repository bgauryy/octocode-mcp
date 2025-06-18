import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Tools from './mcp/tools/index.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
  description: `Comprehensive code analysis assistant: Deep exploration and understanding of complex implementations in GitHub repositories and npm packages.
       Specialized in architectural analysis, algorithm explanations, and complete technical documentation.`,
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
    { name: 'NpmSearch', fn: Tools.registerNpmSearchTool },
    {
      name: 'ViewRepositoryStructure',
      fn: Tools.registerViewRepositoryStructureTool,
    },
    { name: 'SearchGitHubIssues', fn: Tools.registerSearchGitHubIssuesTool },
    { name: 'SearchGitHubTopics', fn: Tools.registerSearchGitHubTopicsTool },
    { name: 'NpmViewPackage', fn: Tools.registerNpmViewPackageTool },
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

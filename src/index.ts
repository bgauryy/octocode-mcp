import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './prompts/systemPrompt';
import { registerSearchGitHubCodeTool } from './tools/searchGitHubCode';
import { registerFetchGitHubFileContentTool } from './tools/fetchGitHubFileContent';
import { registerViewRepositoryTool } from './tools/viewRepository';
import { registerNpmViewTool } from './tools/npmView';
import { registerSearchGitHubReposTool } from './tools/searchGitHubRepos';
import { registerSearchGitHubCommitsTool } from './tools/searchGitHubCommits';
import { registerSearchGitHubPullRequestsTool } from './tools/searchGitHubPullRequests';
import { registerGetUserOrganizationsTool } from './tools/getUserOrganizations';
import { registerNpmSearchTool } from './tools/npmSearch';
import { registerViewRepositoryStructureTool } from './tools/viewRepositoryStructure';
import { registerSearchGitHubIssuesTool } from './tools/searchGitHubIssues';
import { registerSearchGitHubDiscussionsTool } from './tools/searchGitHubDiscussions';
import { registerSearchGitHubTopicsTool } from './tools/searchGitHubTopics';
import { registerSearchGitHubUsersTool } from './tools/searchGitHubUsers';

const server = new McpServer(
  {
    name: 'octocode-mcp',
    version: '1.0.0',
    description: `Code question assistant: Find, analyze, and explore any code in GitHub repositories and npm packages.
       Use for code examples, implementations, debugging, and understanding how libraries work.`,
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: `
    #PROMPT_SYSTEM_PROMPT
    ${PROMPT_SYSTEM_PROMPT}`,
  }
);

registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  process.exit(0);
});

process.stdin.on('close', async () => {
  server.close();
});

function registerAllTools(server: McpServer) {
  registerSearchGitHubCodeTool(server);
  registerFetchGitHubFileContentTool(server);
  registerViewRepositoryTool(server);
  registerNpmViewTool(server);
  registerSearchGitHubReposTool(server);
  registerSearchGitHubCommitsTool(server);
  registerSearchGitHubPullRequestsTool(server);
  registerGetUserOrganizationsTool(server);
  registerNpmSearchTool(server);
  registerViewRepositoryStructureTool(server);
  registerSearchGitHubIssuesTool(server);
  registerSearchGitHubDiscussionsTool(server);
  registerSearchGitHubTopicsTool(server);
  registerSearchGitHubUsersTool(server);
}

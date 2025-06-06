import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/tools/descriptions/systemPrompt';
import { registerSearchGitHubCodeTool } from './mcp/tools/searchGitHubCode';
import { registerFetchGitHubFileContentTool } from './mcp/tools/fetchGitHubFileContent';
import { registerViewRepositoryTool } from './mcp/tools/viewRepository';
import { registerNpmViewTool } from './mcp/tools/npmView';
import { registerSearchGitHubReposTool } from './mcp/tools/searchGitHubRepos';
import { registerSearchGitHubCommitsTool } from './mcp/tools/searchGitHubCommits';
import { registerSearchGitHubPullRequestsTool } from './mcp/tools/searchGitHubPullRequests';
import { registerGetUserOrganizationsTool } from './mcp/tools/getUserOrganizations';
import { registerNpmSearchTool } from './mcp/tools/npmSearch';
import { registerViewRepositoryStructureTool } from './mcp/tools/viewRepositoryStructure';
import { registerSearchGitHubIssuesTool } from './mcp/tools/searchGitHubIssues';
import { registerSearchGitHubDiscussionsTool } from './mcp/tools/searchGitHubDiscussions';
import { registerSearchGitHubTopicsTool } from './mcp/tools/searchGitHubTopics';
import { registerSearchGitHubUsersTool } from './mcp/tools/searchGitHubUsers';
import { registerAnalyzeCodePrompt } from './mcp/prompts/analyzeCode';
import { registerComparePackagesPrompt } from './mcp/prompts/comparePackages';
import {
  registerGithubStatusResource,
  registerGithubRateLimitResource,
} from './mcp/resources/githubStatus';
import { registerNpmStatusResource } from './mcp/resources/npmStatus';
import { registerUsageGuideResource } from './mcp/resources/usageGuide';
import { registerSearchGitHubCodeInstructionsResource } from './mcp/resources/searchGitHubCodeInstructions';

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
      resources: {},
      prompts: {},
    },
    instructions: `
    #PROMPT_SYSTEM_PROMPT
    ${PROMPT_SYSTEM_PROMPT}`,
  }
);

registerAllTools(server);
registerResources(server);
registerPrompts(server);

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

function registerPrompts(server: McpServer) {
  registerAnalyzeCodePrompt(server);
  registerComparePackagesPrompt(server);
}

function registerResources(server: McpServer) {
  registerGithubStatusResource(server);
  registerGithubRateLimitResource(server);
  registerNpmStatusResource(server);
  registerUsageGuideResource(server);
  registerSearchGitHubCodeInstructionsResource(server);
}

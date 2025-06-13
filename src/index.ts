import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts/instructions';
import * as Tools from './mcp/tools/index.js';
import * as Resources from './mcp/resources/index.js';

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

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  process.exit(0);
});

process.stdin.on('close', async () => {
  server.close();
});

// Register all tools
function registerAllTools(server: McpServer) {
  // System & API Status - CRITICAL FIRST STEP
  Tools.registerApiStatusCheckTool(server);

  Tools.registerGitHubSearchCodeTool(server);
  Tools.registerFetchGitHubFileContentTool(server);
  Tools.registerViewRepositoryTool(server);
  //Tools.registerNpmViewTool(server);
  Tools.registerSearchGitHubReposTool(server);
  Tools.registerSearchGitHubCommitsTool(server);
  Tools.registerSearchGitHubPullRequestsTool(server);
  Tools.registerGetUserOrganizationsTool(server);
  Tools.registerNpmSearchTool(server);
  Tools.registerViewRepositoryStructureTool(server);
  Tools.registerSearchGitHubIssuesTool(server);
  Tools.registerSearchGitHubTopicsTool(server);
  Tools.registerSearchGitHubUsersTool(server);
  // Focused NPM tools for minimal token usage
  Tools.registerNpmDependencyAnalysisTool(server);
  Tools.registerNpmGetRepositoryTool(server);
  Tools.registerNpmGetDependenciesTool(server);
  Tools.registerNpmGetVersionsTool(server);
  Tools.registerNpmGetReleasesTool(server);
  Tools.registerNpmGetExportsTool(server);
}

// Register all resources
function registerResources(server: McpServer) {
  Resources.registerUsageGuideResource(server);
  Resources.registerGithubStatusResource(server);
  Resources.registerNpmStatusResource(server);
  Resources.registerRepositoryIntelligenceResource(server);
}

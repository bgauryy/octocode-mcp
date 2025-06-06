import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchGitHubCodeTool } from './searchGitHubCode';
import { registerFetchGitHubFileContentTool } from './fetchGitHubFileContent';
import { registerViewRepositoryTool } from './viewRepository';
import { registerNpmViewTool } from './npmView';
import { registerSearchGitHubReposTool } from './searchGitHubRepos';
import { registerSearchGitHubCommitsTool } from './searchGitHubCommits';
import { registerSearchGitHubPullRequestsTool } from './searchGitHubPullRequests';
import { registerGetUserOrganizationsTool } from './getUserOrganizations';
import { registerNpmSearchTool } from './npmSearch';
import { registerViewRepositoryStructureTool } from './viewRepositoryStructure';
import { registerSearchGitHubIssuesTool } from './searchGitHubIssues';
import { registerSearchGitHubDiscussionsTool } from './searchGitHubDiscussions';
import { registerSearchGitHubTopicsTool } from './searchGitHubTopics';
import { registerSearchGitHubUsersTool } from './searchGitHubUsers';

export function registerAllTools(server: McpServer) {
  // Register all tools
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

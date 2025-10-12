import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../constants.js';
import { registerGitHubSearchCodeTool } from './github_search_code.js';
import { registerFetchGitHubFileContentTool } from './github_fetch_content.js';
import { registerSearchGitHubReposTool } from './github_search_repos.js';
import { registerSearchGitHubPullRequestsTool } from './github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from './github_view_repo_structure.js';

export interface ToolConfig {
  name: string;
  description: string;
  isDefault: boolean;
  type: 'search' | 'content' | 'history' | 'debug';
  fn: (server: McpServer) => RegisteredTool;
}

export const GITHUB_SEARCH_CODE: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_CODE,
  description: 'Search code across GitHub repositories',
  isDefault: true,
  type: 'search',
  fn: registerGitHubSearchCodeTool,
};

export const GITHUB_FETCH_CONTENT: ToolConfig = {
  name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
  description: 'Fetch file content from GitHub repositories',
  isDefault: true,
  type: 'content',
  fn: registerFetchGitHubFileContentTool,
};

export const GITHUB_VIEW_REPO_STRUCTURE: ToolConfig = {
  name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  description: 'View GitHub repository structure and navigation',
  isDefault: true,
  type: 'content',
  fn: registerViewGitHubRepoStructureTool,
};

export const GITHUB_SEARCH_REPOSITORIES: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  description: 'Search and discover GitHub repositories',
  isDefault: true,
  type: 'search',
  fn: registerSearchGitHubReposTool,
};

export const GITHUB_SEARCH_PULL_REQUESTS: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
  description: 'Search GitHub pull requests and code reviews',
  isDefault: false,
  type: 'history',
  fn: registerSearchGitHubPullRequestsTool,
};

export const DEFAULT_TOOLS: ToolConfig[] = [
  GITHUB_SEARCH_CODE,
  GITHUB_FETCH_CONTENT,
  GITHUB_VIEW_REPO_STRUCTURE,
  GITHUB_SEARCH_REPOSITORIES,
  GITHUB_SEARCH_PULL_REQUESTS,
];

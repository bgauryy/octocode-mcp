import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../utils/toolConstants.js';
import { registerGitHubSearchCodeTool } from '../tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../tools/github_view_repo_structure.js';

export interface ToolsetConfig {
  name: string;
  description: string;
  isDefault: boolean;
  type: 'search' | 'content' | 'history' | 'npm';
  fn: (server: McpServer) => RegisteredTool;
}

export const GITHUB_SEARCH_CODE_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_CODE,
  description: 'Search code across GitHub repositories',
  isDefault: true,
  type: 'search',
  fn: registerGitHubSearchCodeTool,
};

export const GITHUB_FETCH_CONTENT_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
  description: 'Fetch file content from GitHub repositories',
  isDefault: true,
  type: 'content',
  fn: registerFetchGitHubFileContentTool,
};

export const GITHUB_VIEW_REPO_STRUCTURE_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  description: 'View GitHub repository structure and navigation',
  isDefault: true,
  type: 'content',
  fn: registerViewGitHubRepoStructureTool,
};

export const GITHUB_SEARCH_REPOSITORIES_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  description: 'Search and discover GitHub repositories',
  isDefault: true,
  type: 'search',
  fn: registerSearchGitHubReposTool,
};

export const GITHUB_SEARCH_COMMITS_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
  description: 'Search GitHub commits and change history',
  isDefault: false,
  type: 'history',
  fn: registerSearchGitHubCommitsTool,
};

export const GITHUB_SEARCH_PULL_REQUESTS_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
  description: 'Search GitHub pull requests and code reviews',
  isDefault: false,
  type: 'history',
  fn: registerSearchGitHubPullRequestsTool,
};

export const PACKAGE_SEARCH_TOOLSET: ToolsetConfig = {
  name: TOOL_NAMES.PACKAGE_SEARCH,
  description: 'Search NPM and Python package registries',
  isDefault: false,
  type: 'npm',
  fn: registerPackageSearchTool,
};

export const DEFAULT_TOOLSETS: ToolsetConfig[] = [
  GITHUB_SEARCH_CODE_TOOLSET,
  GITHUB_FETCH_CONTENT_TOOLSET,
  GITHUB_VIEW_REPO_STRUCTURE_TOOLSET,
  GITHUB_SEARCH_REPOSITORIES_TOOLSET,
  GITHUB_SEARCH_COMMITS_TOOLSET,
  GITHUB_SEARCH_PULL_REQUESTS_TOOLSET,
  PACKAGE_SEARCH_TOOLSET,
];

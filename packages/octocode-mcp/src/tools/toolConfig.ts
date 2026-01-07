import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { ToolInvocationCallback } from '../types.js';
import { registerGitHubSearchCodeTool } from './github_search_code.js';
import { registerFetchGitHubFileContentTool } from './github_fetch_content.js';
import { registerSearchGitHubReposTool } from './github_search_repos.js';
import { registerSearchGitHubPullRequestsTool } from './github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from './github_view_repo_structure.js';
import { registerPackageSearchTool } from './package_search.js';
import { registerLocalRipgrepTool } from './local_ripgrep.js';
import { registerLocalViewStructureTool } from './local_view_structure.js';
import { registerLocalFindFilesTool } from './local_find_files.js';
import { registerLocalFetchContentTool } from './local_fetch_content.js';
import { registerLSPGotoDefinitionTool } from './lsp_goto_definition.js';
import { registerLSPFindReferencesTool } from './lsp_find_references.js';
import { registerLSPCallHierarchyTool } from './lsp_call_hierarchy.js';

export interface ToolConfig {
  name: string;
  description: string;
  isDefault: boolean;
  isLocal: boolean;
  type: 'search' | 'content' | 'history' | 'debug';
  fn: (
    server: McpServer,
    callback?: ToolInvocationCallback
  ) => RegisteredTool | Promise<RegisteredTool | null>;
}

const getDescription = (toolName: string): string => {
  // DESCRIPTIONS Proxy already returns '' for unknown keys
  return DESCRIPTIONS[toolName];
};

// GitHub Tools (isLocal: false)
export const GITHUB_SEARCH_CODE: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_CODE,
  description: getDescription(TOOL_NAMES.GITHUB_SEARCH_CODE),
  isDefault: true,
  isLocal: false,
  type: 'search',
  fn: registerGitHubSearchCodeTool,
};

export const GITHUB_FETCH_CONTENT: ToolConfig = {
  name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
  description: getDescription(TOOL_NAMES.GITHUB_FETCH_CONTENT),
  isDefault: true,
  isLocal: false,
  type: 'content',
  fn: registerFetchGitHubFileContentTool,
};

export const GITHUB_VIEW_REPO_STRUCTURE: ToolConfig = {
  name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  description: getDescription(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE),
  isDefault: true,
  isLocal: false,
  type: 'content',
  fn: registerViewGitHubRepoStructureTool,
};

export const GITHUB_SEARCH_REPOSITORIES: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  description: getDescription(TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES),
  isDefault: true,
  isLocal: false,
  type: 'search',
  fn: registerSearchGitHubReposTool,
};

export const GITHUB_SEARCH_PULL_REQUESTS: ToolConfig = {
  name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
  description: getDescription(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS),
  isDefault: true,
  isLocal: false,
  type: 'history',
  fn: registerSearchGitHubPullRequestsTool,
};

export const PACKAGE_SEARCH: ToolConfig = {
  name: TOOL_NAMES.PACKAGE_SEARCH,
  description: getDescription(TOOL_NAMES.PACKAGE_SEARCH),
  isDefault: true,
  isLocal: false,
  type: 'search',
  fn: registerPackageSearchTool,
};

// Local Tools (isLocal: true) - only registered when ENABLE_LOCAL is true
export const LOCAL_RIPGREP: ToolConfig = {
  name: TOOL_NAMES.LOCAL_RIPGREP,
  description: getDescription(TOOL_NAMES.LOCAL_RIPGREP),
  isDefault: true,
  isLocal: true,
  type: 'search',
  fn: registerLocalRipgrepTool,
};

export const LOCAL_VIEW_STRUCTURE: ToolConfig = {
  name: TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  description: getDescription(TOOL_NAMES.LOCAL_VIEW_STRUCTURE),
  isDefault: true,
  isLocal: true,
  type: 'content',
  fn: registerLocalViewStructureTool,
};

export const LOCAL_FIND_FILES: ToolConfig = {
  name: TOOL_NAMES.LOCAL_FIND_FILES,
  description: getDescription(TOOL_NAMES.LOCAL_FIND_FILES),
  isDefault: true,
  isLocal: true,
  type: 'search',
  fn: registerLocalFindFilesTool,
};

export const LOCAL_FETCH_CONTENT: ToolConfig = {
  name: TOOL_NAMES.LOCAL_FETCH_CONTENT,
  description: getDescription(TOOL_NAMES.LOCAL_FETCH_CONTENT),
  isDefault: true,
  isLocal: true,
  type: 'content',
  fn: registerLocalFetchContentTool,
};

// LSP Tools (isLocal: true) - semantic code intelligence
export const LSP_GOTO_DEFINITION: ToolConfig = {
  name: TOOL_NAMES.LSP_GOTO_DEFINITION,
  description: getDescription(TOOL_NAMES.LSP_GOTO_DEFINITION),
  isDefault: true,
  isLocal: true,
  type: 'content',
  fn: registerLSPGotoDefinitionTool,
};

export const LSP_FIND_REFERENCES: ToolConfig = {
  name: TOOL_NAMES.LSP_FIND_REFERENCES,
  description: getDescription(TOOL_NAMES.LSP_FIND_REFERENCES),
  isDefault: true,
  isLocal: true,
  type: 'search',
  fn: registerLSPFindReferencesTool,
};

export const LSP_CALL_HIERARCHY: ToolConfig = {
  name: TOOL_NAMES.LSP_CALL_HIERARCHY,
  description: getDescription(TOOL_NAMES.LSP_CALL_HIERARCHY),
  isDefault: true,
  isLocal: true,
  type: 'content',
  fn: registerLSPCallHierarchyTool,
};

/**
 * All tools in ONE place - the single source of truth for tool registration.
 * GitHub tools first, then local tools.
 *
 * Local tools (isLocal: true) are only registered when ENABLE_LOCAL config is true.
 */
export const ALL_TOOLS: ToolConfig[] = [
  // GitHub tools (6 tools)
  GITHUB_SEARCH_CODE,
  GITHUB_FETCH_CONTENT,
  GITHUB_VIEW_REPO_STRUCTURE,
  GITHUB_SEARCH_REPOSITORIES,
  GITHUB_SEARCH_PULL_REQUESTS,
  PACKAGE_SEARCH,
  // Local tools (4 tools)
  LOCAL_RIPGREP,
  LOCAL_VIEW_STRUCTURE,
  LOCAL_FIND_FILES,
  LOCAL_FETCH_CONTENT,
  // LSP tools (3 tools)
  LSP_GOTO_DEFINITION,
  LSP_FIND_REFERENCES,
  LSP_CALL_HIERARCHY,
];

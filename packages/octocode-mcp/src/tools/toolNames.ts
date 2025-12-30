import type { ToolNames } from '../types/metadata.js';

type ToolNamesValue = ToolNames[keyof ToolNames];
type ToolNamesMap = Record<string, ToolNamesValue>;

/**
 * Static tool name constants - use for computed property keys
 * The Proxy TOOL_NAMES should only be used for runtime access, not object literals
 */
export const STATIC_TOOL_NAMES = {
  GITHUB_FETCH_CONTENT: 'githubGetFileContent',
  GITHUB_SEARCH_CODE: 'githubSearchCode',
  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
  PACKAGE_SEARCH: 'packageSearch',
  LOCAL_RIPGREP: 'localSearchCode',
  LOCAL_FETCH_CONTENT: 'localGetFileContent',
  LOCAL_FIND_FILES: 'localFindFiles',
  LOCAL_VIEW_STRUCTURE: 'localViewStructure',
} as const satisfies ToolNamesMap;

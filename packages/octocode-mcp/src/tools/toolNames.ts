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
  // LSP Tools
  LSP_GOTO_DEFINITION: 'lspGotoDefinition',
  LSP_FIND_REFERENCES: 'lspFindReferences',
  LSP_CALL_HIERARCHY: 'lspCallHierarchy',
} as const satisfies ToolNamesMap;

/**
 * Set of local tool names for quick lookup.
 * Used to filter GitHub-specific hints from local tool responses.
 */
const LOCAL_TOOL_NAMES_SET = new Set<string>([
  STATIC_TOOL_NAMES.LOCAL_RIPGREP,
  STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
  STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
  STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
  // LSP Tools (operate on local files)
  STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
  STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
  STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
]);

/**
 * Check if a tool is a local filesystem tool.
 * Local tools don't have GitHub-specific fields (owner, repo, branch).
 */
export function isLocalTool(toolName: string): boolean {
  return LOCAL_TOOL_NAMES_SET.has(toolName);
}

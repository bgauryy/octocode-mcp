import { toolNames } from '../toolContract/input/resources/global.js';

export const AST_SEARCH_TOOL_NAME = toolNames.AST_SEARCH;
export const LOCAL_SEARCH_TOOL_NAME = 'localSearch';
export const GITHUB_SEARCH_TOOL_NAME = toolNames.GITHUB_SEARCH;
export const GITHUB_SEARCH_HISTORY_TOOL_NAME = 'ghSearchHistory';
export const GITHUB_GET_HISTORY_ITEM_TOOL_NAME = 'ghGetHistoryItem';

export const STATIC_TOOL_NAMES = {
  GITHUB_SEARCH: toolNames.GITHUB_SEARCH,
  GITHUB_FETCH_CONTENT: toolNames.GITHUB_FETCH_CONTENT,
  PACKAGE_SEARCH: toolNames.PACKAGE_SEARCH,
  GITHUB_CLONE_REPO: toolNames.GITHUB_CLONE_REPO,
  LOCAL_FETCH_CONTENT: toolNames.LOCAL_FETCH_CONTENT,
  AST_SEARCH: toolNames.AST_SEARCH,
  LSP_SEARCH: toolNames.LSP_SEARCH,
  GITHUB_SEARCH_HISTORY: GITHUB_SEARCH_HISTORY_TOOL_NAME,
  GITHUB_GET_HISTORY_ITEM: GITHUB_GET_HISTORY_ITEM_TOOL_NAME,
} as const;

// Derived from the shared core contract — single source of truth.
export const LSP_SEARCH_TOOL_NAME = STATIC_TOOL_NAMES.LSP_SEARCH;

const LOCAL_TOOL_NAMES_SET = new Set<string>([
  LOCAL_SEARCH_TOOL_NAME,
  STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
  AST_SEARCH_TOOL_NAME,
  LSP_SEARCH_TOOL_NAME,
]);

export function isLocalTool(toolName: string): boolean {
  return LOCAL_TOOL_NAMES_SET.has(toolName);
}

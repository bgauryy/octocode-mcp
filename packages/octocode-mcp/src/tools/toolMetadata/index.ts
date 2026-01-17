/**
 * Tool Metadata Module
 *
 * Provides centralized access to tool metadata fetched from the remote API.
 * Includes tool names, descriptions, schema fields, and hints.
 *
 * @example
 * ```typescript
 * import {
 *   initializeToolMetadata,
 *   getMetadata,
 *   TOOL_NAMES,
 *   DESCRIPTIONS,
 *   getToolHintsSync
 * } from './toolMetadata/index.js';
 *
 * // Initialize at startup
 * await initializeToolMetadata();
 *
 * // Access tool names
 * const toolName = TOOL_NAMES.GITHUB_SEARCH_CODE;
 *
 * // Get tool description
 * const desc = DESCRIPTIONS[toolName];
 *
 * // Get hints for results
 * const hints = getToolHintsSync(toolName, 'hasResults');
 * ```
 */

// Re-export types
export type { CompleteMetadata } from '../../types/metadata.js';
export type { ToolName } from './types.js';

// Re-export state management
export {
  initializeToolMetadata,
  getMetadata,
  loadToolContent,
  _resetMetadataState,
} from './state.js';

// Re-export static tool names
export { STATIC_TOOL_NAMES } from '../toolNames.js';

// Re-export proxies
export {
  TOOL_NAMES,
  BASE_SCHEMA,
  GENERIC_ERROR_HINTS,
  DESCRIPTIONS,
  TOOL_HINTS,
  isToolInMetadata,
  getToolHintsSync,
  getGenericErrorHintsSync,
  getDynamicHints,
} from './proxies.js';

// Re-export schema helpers
export {
  GITHUB_FETCH_CONTENT,
  GITHUB_SEARCH_CODE,
  GITHUB_SEARCH_REPOS,
  GITHUB_SEARCH_PULL_REQUESTS,
  GITHUB_VIEW_REPO_STRUCTURE,
  PACKAGE_SEARCH,
  LOCAL_RIPGREP,
  LOCAL_FETCH_CONTENT,
  LOCAL_FIND_FILES,
  LOCAL_VIEW_STRUCTURE,
  LSP_GOTO_DEFINITION,
  LSP_FIND_REFERENCES,
  LSP_CALL_HIERARCHY,
} from './schemaHelpers.js';

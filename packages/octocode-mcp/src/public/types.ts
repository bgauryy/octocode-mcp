/**
 * Public API — Type definitions, tool names, and metadata utilities.
 */

export type {
  CompleteMetadata,
  RawCompleteMetadata,
  ToolMetadata,
  ToolNames,
  BaseSchema,
  PromptMetadata,
  PromptArgument,
  HintStatus,
  HintContext,
  HintGenerator,
  ToolHintGenerators,
} from '../types/metadata.js';

export { STATIC_TOOL_NAMES } from '../tools/toolNames.js';

export {
  initializeToolMetadata,
  loadToolContent,
  getMetadata,
  TOOL_NAMES,
  BASE_SCHEMA,
  DESCRIPTIONS,
  TOOL_HINTS,
  GENERIC_ERROR_HINTS,
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
  isToolInMetadata,
  getToolHintsSync,
  getGenericErrorHintsSync,
  getDynamicHints,
} from '../tools/toolMetadata.js';

export type { ToolName } from '../tools/toolMetadata.js';

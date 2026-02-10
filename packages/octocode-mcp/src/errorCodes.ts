/**
 * Centralized error codes and types for all tools
 * Split into focused modules under errors/ — this barrel re-exports everything.
 */
export {
  redactPath,
  CONFIG_ERRORS,
  VALIDATION_ERRORS,
  FETCH_ERRORS,
  TOOL_METADATA_ERRORS,
  FILE_OPERATION_ERRORS,
  REPOSITORY_ERRORS,
  SEARCH_ERRORS,
  STARTUP_ERRORS,
  PROMISE_ERRORS,
  TOOL_ERRORS,
  ALL_ERROR_CODES,
  LOCAL_TOOL_ERROR_CODES,
  type LocalToolErrorCode,
  LocalToolErrorCategory,
  LOCAL_TOOL_ERROR_REGISTRY,
  ToolError,
  isToolError,
  toToolError,
  ToolErrors,
} from './errors/index.js';

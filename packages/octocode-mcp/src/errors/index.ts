/**
 * Centralized error codes and types for all tools.
 * This barrel re-exports from focused submodules.
 */
export { redactPath } from './pathUtils.js';
export {
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
} from './domainErrors.js';
export {
  LOCAL_TOOL_ERROR_CODES,
  type LocalToolErrorCode,
  LocalToolErrorCategory,
  LOCAL_TOOL_ERROR_REGISTRY,
} from './localToolErrors.js';
export { ToolError, isToolError, toToolError } from './ToolError.js';
export { ToolErrors } from './errorFactories.js';

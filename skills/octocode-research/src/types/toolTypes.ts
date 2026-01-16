/**
 * Type adapters for converting validated query inputs to MCP tool parameters.
 * This eliminates the need for 'as any' casts in route files by centralizing type conversion.
 *
 * The MCP tools expect { queries: T[] } where T matches their specific query type.
 * The validation schemas produce types with preprocessed fields (unknown types).
 * These adapters bridge that gap by accepting loose input types and returning any.
 *
 * @module types/toolTypes
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Local Tool Adapters
// =============================================================================

/**
 * Convert validated local search query to MCP tool format
 */
export function toLocalSearchParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated local content query to MCP tool format
 */
export function toLocalContentParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated local find query to MCP tool format
 */
export function toLocalFindParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated local structure query to MCP tool format
 */
export function toLocalStructureParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

// =============================================================================
// GitHub Tool Adapters
// =============================================================================

/**
 * Convert validated GitHub search query to MCP tool format
 */
export function toGitHubSearchParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated GitHub content query to MCP tool format
 */
export function toGitHubContentParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated GitHub repos query to MCP tool format
 */
export function toGitHubReposParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated GitHub structure query to MCP tool format
 */
export function toGitHubStructureParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated GitHub PRs query to MCP tool format
 */
export function toGitHubPRsParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

// =============================================================================
// LSP Tool Adapters
// =============================================================================

/**
 * Convert validated LSP definition query to MCP tool format
 */
export function toLspDefinitionParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated LSP references query to MCP tool format
 */
export function toLspReferencesParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Convert validated LSP calls query to MCP tool format
 */
export function toLspCallsParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

// =============================================================================
// Package Tool Adapters
// =============================================================================

/**
 * Convert validated package search query to MCP tool format
 */
export function toPackageSearchParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

/**
 * Type adapter for converting validated query inputs to MCP tool parameters.
 * All MCP tools expect { queries: T[] } format.
 *
 * @module types/toolTypes
 */

/**
 * Base query parameters that all tool queries may include.
 */
export interface BaseQueryParams {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  [key: string]: unknown;
}

/**
 * Result type for tool query parameters.
 */
export interface QueryParamsResult<T extends BaseQueryParams = BaseQueryParams> {
  queries: T[];
}

/**
 * Convert validated query to MCP tool format.
 * Works for all tools - local, GitHub, LSP, and package search.
 */
export function toQueryParams<T extends BaseQueryParams>(
  validated: T | T[]
): QueryParamsResult<T> {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

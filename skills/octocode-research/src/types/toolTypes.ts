/**
 * Type adapter for converting validated query inputs to MCP tool parameters.
 * All MCP tools expect { queries: T[] } format.
 *
 * @module types/toolTypes
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Convert validated query to MCP tool format.
 * Works for all tools - local, GitHub, LSP, and package search.
 */
export function toQueryParams(validated: any): any {
  const queries = Array.isArray(validated) ? validated : [validated];
  return { queries };
}

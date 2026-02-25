/**
 * Tool Type Utilities
 *
 * Provides type-safe patterns for MCP tool registration that avoid
 * TypeScript's exponential type inference when combining complex Zod schemas
 * with MCP SDK's Zod v3/v4 compatibility layer.
 *
 * @see .octocode/research/type-recursion/research.md for background
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';

export type { AnySchema };

/**
 * Casts a Zod schema to MCP's AnySchema for tool registration.
 * MCP SDK expects Zod v3/v4 compatible schemas; this centralizes the cast
 * instead of scattering "as unknown as AnySchema" across tool registrations.
 */
export function toMCPSchema<T extends object>(schema: T): AnySchema {
  return schema as unknown as AnySchema;
}

/**
 * Generic bulk query args wrapper
 * All MCP tools accept bulk queries for efficiency
 */
export interface BulkQueryArgs<TQuery> {
  queries: TQuery[];
}

/**
 * Type-safe tool executor signature
 * Use this to explicitly type execution functions when the generic
 * inference is broken by AnySchema casts
 */
export type ToolExecutor<TQuery> = (
  args: BulkQueryArgs<TQuery>
) => Promise<CallToolResult>;

/**
 * Generic standardized response structure for all MCP tools
 *
 * This provides a consistent format across all tools:
 * - data: The actual results/content from the tool operation
 * - meta: Metadata about the operation (counts, context, research info)
 * - hints: Actionable guidance for next steps or improvements
 *
 * Benefits:
 * - Consistent UX across all tools
 * - Predictable response parsing
 * - Standardized metadata and hint patterns
 * - Easy to extend with tool-specific meta fields
 */

/**
 * Base metadata that all tools should include
 */
export interface BaseToolMeta {
  /** Research goal driving this operation - helps guide tool behavior and hints */
  researchGoal: string;
  /** Total number of queries/operations performed */
  totalOperations: number;
  /** Number of successful operations */
  successfulOperations: number;
  /** Number of failed operations */
  failedOperations: number;
  /** Any errors that occurred during processing */
  errors?: Array<{
    operationId?: string;
    error: string;
    hints?: string[];
  }>;
}

/**
 * Generic response structure for all MCP tools
 *
 * @template TData - The type of data returned by the specific tool
 * @template TMeta - Additional metadata specific to the tool (extends BaseToolMeta)
 */
export interface GenericToolResponse<
  TData = unknown,
  TMeta extends BaseToolMeta = BaseToolMeta,
> {
  /** The actual results/content from the tool operation */
  data: TData[];

  /** Metadata about the operation and context */
  meta: TMeta;

  /** Actionable guidance for next steps, improvements, or tool usage */
  hints: string[];
}

/**
 * Helper type for tools that don't need additional metadata beyond the base
 */
export type SimpleToolResponse<TData = unknown> = GenericToolResponse<
  TData,
  BaseToolMeta
>;

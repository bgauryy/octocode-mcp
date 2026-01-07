import { z } from 'zod';
import { BASE_SCHEMA } from '../tools/toolMetadata.js';

export const BaseQuerySchema = z.object({
  mainResearchGoal: z.string().describe(BASE_SCHEMA.mainResearchGoal),
  researchGoal: z.string().describe(BASE_SCHEMA.researchGoal),
  reasoning: z.string().describe(BASE_SCHEMA.reasoning),
});

/**
 * Base query schema for local tools with optional research context
 */
export const BaseQuerySchemaLocal = z.object({
  researchGoal: z.string().optional().describe('Goal of the search'),
  reasoning: z
    .string()
    .optional()
    .describe('Why this approach helps reach the goal'),
});

/**
 * Options for bulk query schema creation
 */
export interface BulkQuerySchemaOptions {
  /** Maximum number of queries allowed (default: 3 for GitHub tools) */
  maxQueries?: number;
  /** Custom description prefix (default: uses BASE_SCHEMA.bulkQuery for GitHub) */
  descriptionPrefix?: string;
}

/**
 * Creates a bulk query schema with configurable max queries
 * @param toolName - Name of the tool for description
 * @param singleQuerySchema - Schema for a single query
 * @param options - Configuration options (maxQueries defaults to 3)
 */
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T,
  options: BulkQuerySchemaOptions = {}
) {
  const { maxQueries = 3, descriptionPrefix } = options;
  const description =
    descriptionPrefix ??
    (maxQueries === 3
      ? BASE_SCHEMA.bulkQuery(toolName)
      : `Queries for ${toolName} (1–${maxQueries} per call). Review schema before use.`);

  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(1)
      .max(maxQueries)
      .describe(description),
  });
}

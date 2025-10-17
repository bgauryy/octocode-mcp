/**
 * Base query schema (inherited from octocode-mcp pattern)
 */

import { z } from 'zod';

/**
 * Base query schema with research context
 * This provides LLMs with essential context for query planning
 */
export const BaseQuerySchema = z.object({
  researchGoal: z
    .string()
    .optional()
    .describe('What you want to find or understand'),
  reasoning: z
    .string()
    .optional()
    .describe('Why this query helps achieve the goal'),
});

/**
 * Creates a bulk query schema for a tool
 * Standardizes the queries array structure across all tools
 */
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T
) {
  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(1)
      .max(10)
      .describe(
        `Research queries for ${toolName}. Review tool schema and descriptions before creating queries for optimal results`
      ),
  });
}

export type BaseQuery = z.infer<typeof BaseQuerySchema>;

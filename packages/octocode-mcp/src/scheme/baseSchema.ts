import { z } from 'zod';

export const BaseQuerySchema = z.object({
  mainResearchGoal: z
    .string()
    .optional()
    .describe(
      'Main research objective (multiple queries can share the same main goal for semantic grouping and session tracking)'
    ),
  researchGoal: z
    .string()
    .optional()
    .describe('Specific information this query seeks'),
  reasoning: z
    .string()
    .optional()
    .describe('Why this query helps achieve the goal'),
});

export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T
) {
  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(1)
      .max(3)
      .describe(
        `Research queries for ${toolName} (1-3 queries per call for optimal resource management). Review schema before use for optimal results`
      ),
  });
}

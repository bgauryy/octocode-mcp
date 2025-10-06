import { z } from 'zod';
import { GENERAL } from './schemDescriptions';

export const BaseQuerySchema = z.object({
  researchGoal: z.string().optional().describe(GENERAL.base.researchGoal),
  reasoning: z.string().optional().describe(GENERAL.base.reasoning),
  researchSuggestions: z
    .array(z.string())
    .optional()
    .describe(GENERAL.base.suggestions),
});

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

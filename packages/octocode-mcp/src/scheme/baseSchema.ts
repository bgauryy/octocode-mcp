import { z } from 'zod';
import { GENERAL } from './schemDescriptions';

export const BaseQuerySchema = z.object({
  researchGoal: z.string().optional().describe(GENERAL.base.researchGoal),
  reasoning: z.string().optional().describe(GENERAL.base.reasoning),
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
        `Research queries for tool: ${toolName}. Before creating queries: check context and validate tool scheme and descriptions to generate the most effective queries`
      ),
  });
}

import { z } from 'zod';
import { BASE_SCHEMA } from '../tools/toolMetadata.js';

export const BaseQuerySchema = z.object({
  mainResearchGoal: z
    .string()
    .optional()
    .describe(BASE_SCHEMA.mainResearchGoal),
  researchGoal: z.string().optional().describe(BASE_SCHEMA.researchGoal),
  reasoning: z.string().optional().describe(BASE_SCHEMA.reasoning),
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
      .describe(BASE_SCHEMA.bulkQuery(toolName)),
  });
}

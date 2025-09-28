import { z } from 'zod';
import { GENERAL } from './schemDescriptions';

export const BaseQuerySchema = z.object({
  id: z.string().optional().describe(GENERAL.base.id),
  reasoning: z.string().optional().describe(GENERAL.base.reasoning),
});

export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  singleQuerySchema: T,
  description: string
) {
  return z.object({
    queries: z.array(singleQuerySchema).min(1).max(10).describe(description),
  });
}

import { z } from 'zod';
import { SCHEME_DESCRIPTIONS_STRUCTURED } from './schemDescriptions';

export const BaseQuerySchema = z.object({
  id: z
    .string()
    .optional()
    .describe(SCHEME_DESCRIPTIONS_STRUCTURED.GENERAL.base.id),
  reasoning: z
    .string()
    .optional()
    .describe(SCHEME_DESCRIPTIONS_STRUCTURED.GENERAL.base.reasoning),
});

export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  singleQuerySchema: T,
  description: string
) {
  return z.object({
    queries: z.array(singleQuerySchema).min(1).max(10).describe(description),
  });
}

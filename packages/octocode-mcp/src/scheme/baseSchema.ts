import { z } from 'zod';

export const BaseQuerySchema = z.object({
  id: z.string().optional().describe('query id'),
  reasoning: z
    .string()
    .optional()
    .describe('Explanation or reasoning behind the query for the research'),
});

export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  singleQuerySchema: T,
  description: string
) {
  return z.object({
    queries: z.array(singleQuerySchema).min(1).max(10).describe(description),
  });
}

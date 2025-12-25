import { z } from 'zod';

/**
 * Base query schema with research context
 */
export const BaseQuerySchema = z.object({
  researchGoal: z.string().optional().describe('Goal of the search'),
  reasoning: z
    .string()
    .optional()
    .describe('Why this approach helps reach the goal'),
});

/**
 * Creates bulk query schema (1-5 queries per call)
 */
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  toolName: string,
  singleQuerySchema: T
) {
  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(1)
      .max(5)
      .describe(
        `Queries for ${toolName} (1–5 per call). Review schema before use.`
      ),
  });
}

export type BaseQuery = z.infer<typeof BaseQuerySchema>;

/**
 * Common pagination parameter descriptions
 * Used across all tools for consistency
 */
export const COMMON_PAGINATION_DESCRIPTIONS = {
  charOffset: 'Start offset for pagination (default 0)',
  charLength: 'Max characters to return (recommend ≤10,000 for large results)',
  filesPerPage: 'Files per page. See tool schema for defaults/max.',
  filePageNumber: 'File page (1-based, default 1). Use with filesPerPage.',
  entriesPerPage: 'Entries per page. See tool schema for defaults/max.',
  entryPageNumber: 'Entry page (1-based, default 1). Use with entriesPerPage.',
} as const;

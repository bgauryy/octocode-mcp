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

/**
 * Creates bulk query schema for local tools (1-5 queries per call)
 */
export function createBulkQuerySchemaLocal<T extends z.ZodTypeAny>(
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
export type BaseQueryLocal = z.infer<typeof BaseQuerySchemaLocal>;

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

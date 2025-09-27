import { z } from 'zod';

export const queryIdSchema = z.string().optional().describe('query id');

export const lockedSchema = z.boolean().optional().describe('Locked');

export const draftSchema = z.boolean().optional().describe('Draft');

// Single base schema for all queries
export const BaseQuerySchema = z.object({
  id: queryIdSchema,
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

export const SortingSchema = z.object({
  sort: z.string().optional().describe('Sort field'),

  order: z.enum(['asc', 'desc']).optional().default('desc').describe('Order'),
});

export const GitHubOwnerSchema = z
  .string()
  .min(1)
  .max(200)
  .describe('Repo owner/org');

export const GitHubRepoSchema = z
  .string()
  .min(1)
  .max(150)
  .describe('Repo name');

export const GitHubBranchSchema = z
  .string()
  .min(1)
  .max(255)
  .describe('Github Branch/tag/SHA');

export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(20)
  .optional()
  .describe('Max');

export const MinifySchema = z
  .boolean()
  .optional()
  .default(true)
  .describe('minify content');

export const SanitizeSchema = z
  .boolean()
  .optional()
  .default(true)
  .describe('sanitize content');

export const SimpleArraySchema = {
  /** Simple string or array of strings - no nulls */
  stringOrArray: z.union([z.string(), z.array(z.string())]).optional(),

  /** Numeric range - number or string pattern */
  numberOrStringRange: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional(),
};

export const PRMatchScopeSchema = z
  .array(z.enum(['title', 'body', 'comments']))
  .optional()
  .describe('Fields');

export const DateRangeSchema = z.object({
  created: z
    .string()
    .optional()
    .describe('Created date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)'),
  updated: z
    .string()
    .optional()
    .describe('Updated date (YYYY-MM-DD, >=YYYY-MM-DD, etc.)'),
});

export interface BaseResult {
  queryId?: string;
  reasoning?: string;
  failed?: boolean;
  hints?: string[];
}

import { z } from 'zod';

export const queryIdSchema = z.string().optional().describe('query id');

export const queryDescriptionSchema = z
  .string()
  .optional()
  .describe('query description');

export const verboseSchema = z
  .boolean()
  .optional()
  .default(false)
  .describe('add debug info');

export const lockedSchema = z.boolean().optional().describe('Locked');

export const draftSchema = z.boolean().optional().describe('Draft');

export const BaseQuerySchema = z.object({
  id: queryIdSchema,
  queryDescription: queryDescriptionSchema,
  verbose: verboseSchema,
});

export function extendBaseQuerySchema<T extends z.ZodRawShape>(
  toolSpecificSchema: T
) {
  return BaseQuerySchema.extend(toolSpecificSchema);
}

export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  singleQuerySchema: T,
  description: string
) {
  return z.object({
    queries: z.array(singleQuerySchema).min(1).max(10).describe(description),
    verbose: verboseSchema,
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

export const GitHubFilePathSchema = z.string().describe('Github File Path');

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

export const FileMatchScopeSchema = z
  .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
  .optional()
  .describe('Scope');

export const PRMatchScopeSchema = z
  .array(z.enum(['title', 'body', 'comments']))
  .optional()
  .describe('Fields');

export const DateRangeSchema = z.object({
  created: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe('Created'),

  updated: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe('Updated'),
});

/**
 * Common numeric range filter schema
 */
export const NumericRangeSchema = z.object({
  stars: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe('Stars'),
});

export const FlexibleArraySchema = {
  stringOrArray: z.union([z.string(), z.array(z.string())]).optional(),
  stringOrArrayOrNull: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional(),
  numberOrStringRange: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional(),
  numberOrStringRangeOrNull: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional(),
};

export interface BaseResult {
  queryId?: string;
  failed?: boolean;
  hints?: string[];
}

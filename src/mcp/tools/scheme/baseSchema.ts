/**
 * Base schema definitions for all MCP tools
 * Provides consistent foundation for research goal integration and LLM reasoning
 */

import { z } from 'zod';
import { ResearchGoalEnum } from '../utils/toolConstants';

/**
 * Base query schema that all tool queries should extend
 * Ensures consistent research goal integration across all tools
 */
export const BaseQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),

  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe(
      'Research goal to guide tool behavior and hint generation for enhanced LLM reasoning and context-aware responses'
    ),
});

/**
 * Base query interface for TypeScript
 */
export interface BaseQuery {
  id?: string;
  researchGoal?: (typeof ResearchGoalEnum)[number];
}

/**
 * Base bulk operation schema for tools supporting multiple queries
 */
export const BaseBulkQuerySchema = z.object({
  queries: z
    .array(BaseQuerySchema)
    .min(1)
    .describe('Array of queries for bulk execution'),

  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include detailed metadata for debugging. Default: false for cleaner responses'
    ),
});

/**
 * Base bulk operation interface
 */
export interface BaseBulkQuery {
  queries: BaseQuery[];
  verbose?: boolean;
}

/**
 * Standard meta interface for all tool responses
 */
export interface BaseToolMeta {
  researchGoal?: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  errors?: Array<{
    operationId: string;
    error: string;
    hints?: string[];
  }>;
}

/**
 * Standard result interface for failed queries
 */
export interface BaseFailedResult {
  queryId: string;
  failed: true;
  researchGoal?: string;
  hints: string[];
  meta: {
    queryArgs: Record<string, unknown>;
    error?: string;
    searchType?: string;
    suggestions?: Record<string, unknown>;
  };
}

/**
 * Helper function to extend base query schema with tool-specific fields
 */
export function extendBaseQuerySchema<T extends z.ZodRawShape>(
  toolSpecificSchema: T
) {
  return BaseQuerySchema.extend(toolSpecificSchema);
}

/**
 * Helper function to create bulk query schema for any tool
 */
export function createBulkQuerySchema<T extends z.ZodTypeAny>(
  singleQuerySchema: T,
  minQueries: number = 1,
  maxQueries: number = 10,
  description?: string
) {
  return z.object({
    queries: z
      .array(singleQuerySchema)
      .min(minQueries)
      .max(maxQueries)
      .describe(
        description ||
          `Array of ${minQueries}-${maxQueries} queries for bulk execution`
      ),

    verbose: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Include detailed metadata for debugging. Default: false for cleaner responses'
      ),
  });
}

/**
 * Research goal validation helper
 */
export function validateResearchGoal(
  goal?: string
): goal is (typeof ResearchGoalEnum)[number] {
  if (!goal) return true; // Optional field
  return ResearchGoalEnum.includes(goal as (typeof ResearchGoalEnum)[number]);
}

/**
 * Helper to ensure query has research goal for LLM reasoning
 */
export function ensureResearchGoal<T extends BaseQuery>(
  query: T,
  defaultGoal: (typeof ResearchGoalEnum)[number] = 'discovery'
): T & { researchGoal: (typeof ResearchGoalEnum)[number] } {
  return {
    ...query,
    researchGoal: query.researchGoal || defaultGoal,
  };
}

/**
 * Common pagination schema for tools that support it
 */
export const PaginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum number of results to return'),

  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of results to skip'),
});

/**
 * Common sorting schema
 */
export const SortingSchema = z.object({
  sort: z.string().optional().describe('Field to sort by'),

  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort order direction'),
});

/**
 * Common filter schema for text search
 */
export const TextSearchSchema = z.object({
  query: z.string().min(1).optional().describe('Search query text'),

  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Multiple search terms with AND logic'),
});

/**
 * Common repository filter schema
 */
export const RepositoryFilterSchema = z.object({
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner/organization name(s)'),

  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository name(s)'),

  language: z.string().optional().describe('Programming language filter'),

  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),
});

/**
 * Common GitHub repository owner validation schema
 */
export const GitHubOwnerSchema = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/)
  .describe(
    'Repository owner/organization name (e.g., "facebook", "microsoft"). Do NOT include repository name here.'
  );

/**
 * Common GitHub repository name validation schema
 */
export const GitHubRepoSchema = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .describe(
    'Repository name only (e.g., "react", "vscode"). Do NOT include owner/org prefix.'
  );

/**
 * Common GitHub branch validation schema
 */
export const GitHubBranchSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s]+$/)
  .describe(
    'Branch name, tag name, OR commit SHA. Uses default branch if not provided.'
  );

/**
 * Common file path validation schema
 */
export const GitHubFilePathSchema = z
  .string()
  .min(1)
  .describe(
    'File path from repository root (e.g., "src/index.js", "README.md", "docs/api.md"). Do NOT start with slash.'
  );

/**
 * Common limit schema for pagination
 */
export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Maximum number of results to return');

/**
 * Common boolean optimization flags
 */
export const OptimizationFlagsSchema = z.object({
  minify: z
    .boolean()
    .optional()
    .default(true)
    .describe('Optimize content for token efficiency (default: true)'),

  sanitize: z
    .boolean()
    .optional()
    .default(true)
    .describe('Remove secrets and malicious content (default: true)'),
});

/**
 * Common date range filter schema
 */
export const DateRangeSchema = z.object({
  created: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Creation date filter. Format: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "2020-01-01..2023-12-31"'
    ),

  updated: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Last updated date filter. Format: ">2024-01-01", ">=2024-01-01", "<2022-01-01", "2023-01-01..2024-12-31"'
    ),
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
    .describe('Star count filter. Format: ">N", "<N", "N..M", or exact number'),
});

/**
 * Common boolean state filters
 */
export const StateFilterSchema = z.object({
  // archived and fork parameters removed - always optimized to exclude archived repositories and forks for better quality
  locked: z.boolean().optional().describe('Conversation locked status'),

  draft: z.boolean().optional().describe('Draft state filter'),
});

/**
 * Common array field schema with flexible types
 */
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

/**
 * Standard result interfaces
 */
export interface BaseResult {
  queryId: string;
  researchGoal?: string;
  failed?: boolean;
  hints?: string[];
}

export interface BaseSuccessResult extends BaseResult {
  failed?: false;
}

export interface BaseFailureResult extends BaseResult {
  failed: true;
  error: string;
  suggestions?: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    relatedTerms?: string[];
  };
}

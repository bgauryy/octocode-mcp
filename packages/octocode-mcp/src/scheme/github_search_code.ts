import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  FlexibleArraySchema,
  LimitSchema,
  OptimizationFlagsSchema,
  FileMatchScopeSchema,
  DateRangeSchema,
  NumericRangeSchema,
} from './baseSchema';

// ============================================================================
// CODE SEARCH QUERY SCHEMA
// ============================================================================

export const GitHubCodeSearchQuerySchema = extendBaseQuerySchema({
  // Search terms (required)
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe(
      `Search terms for code content in a file (AND logic). Use single term for exploration and several terms for specific search
      Use in bulk for better research data from different angles`
    ),
  owner: FlexibleArraySchema.stringOrArray.describe(
    'Repository owner name (user or organization)'
  ),
  repo: FlexibleArraySchema.stringOrArray.describe(
    'Repository name (use with owner for specific repo)'
  ),

  language: z.string().optional().describe('Programming language filter'),
  extension: z.string().optional().describe('File extension filter'),
  filename: z
    .string()
    .optional()
    .describe('Target specific filename or pattern'),
  path: z.string().optional().describe('Filter on file path pattern'),
  stars: NumericRangeSchema.shape.stars,
  pushed: DateRangeSchema.shape.updated.describe(
    'Last pushed date filter for active repositories (e.g., ">2023-01-01", ">=2024-01-01")'
  ),
  match: FileMatchScopeSchema,
  limit: LimitSchema,
  minify: OptimizationFlagsSchema.shape.minify,
  sanitize: OptimizationFlagsSchema.shape.sanitize,

  // Note: GitHub code search only searches the default branch
  // branch parameter is not supported by the GitHub API
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

// Bulk schema for tools that need it
export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCodeSearchQuerySchema,
  1,
  5,
  'Array of search queries. use several queries for better research data from different angles (use filters and queryTerms using semantic words and patterns searching)'
);

// ============================================================================
// PROCESSED RESULT TYPES
// ============================================================================

export interface ProcessedCodeSearchResult {
  files?: Array<{
    path: string;
    text_matches: string[]; // Array of fragment strings only
  }>;
  totalCount?: number;
  repository?: string;
  query?: Record<string, unknown>; // Include original query when verbose or no results
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>; // Required for bulk operations compatibility
}

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
  queryTerms: z.array(z.string()).min(1).max(4).describe('Terms (AND)'),
  owner: FlexibleArraySchema.stringOrArray.describe('Owner'),
  repo: FlexibleArraySchema.stringOrArray.describe('Repo'),

  language: z.string().optional().describe('Language'),
  extension: z.string().optional().describe('Extension'),
  filename: z.string().optional().describe('Filename'),
  path: z.string().optional().describe('Path'),
  stars: NumericRangeSchema.shape.stars,
  pushed: DateRangeSchema.shape.updated.describe('Pushed'),
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
  'Queries'
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

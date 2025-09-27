import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
  LimitSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

// Simplified repository type for search results
export interface SimplifiedRepository {
  repository: string;
  stars: number;
  description: string;
  url: string;
  updatedAt: string;
}

const GitHubReposSearchSingleQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .optional()
    .describe(
      'terms for searching repos by name, description, README files, documentation files, and source code files'
    ),
  topicsToSearch: z
    .array(z.string())
    .optional()
    .describe(
      'terms for searching repos by github topics- tag used to categorize repo'
    ),
  owner: z.string().optional().describe('Repository owner'),
  language: z
    .string()
    .optional()
    .describe('Language - DO NOT USE ON EXPLORATORY SEARCHES'),
  stars: z
    .string()
    .optional()
    .describe('Stars filter (e.g., ">100", ">=1000")'),
  size: z
    .string()
    .optional()
    .describe('Repository size filter in KB (e.g., ">1000", "<500")'),
  created: z
    .string()
    .optional()
    .describe(
      'Repository creation date filter (YYYY-MM-DD, >=YYYY-MM-DD, <=YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD)'
    ),
  updated: z
    .string()
    .optional()
    .describe(
      'Repository last update date filter (YYYY-MM-DD, >=YYYY-MM-DD, <=YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD)'
    ),
  match: z
    .array(z.enum(['name', 'description', 'readme']))
    .optional()
    .describe(
      'Restricts search scope - filters WHERE to search: "name" (repository names only), "description" (description field only), "readme" (README files only). Combinations work as OR. Default (no match) searches ALL fields. Use to reduce noise and focus results.'
    ),
  sort: z
    .enum(['forks', 'stars', 'updated', 'best-match'])
    .optional()
    .describe(
      'Sort results by: "forks", "stars", "updated" (last update), "best-match" (relevance)'
    ),

  limit: LimitSchema,
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchSingleQuerySchema
>;

// Bulk schema for tool registration
export const GitHubReposSearchQuerySchema = createBulkQuerySchema(
  GitHubReposSearchSingleQuerySchema,
  'Repository search queries'
);

// ============================================================================
// Simple Input/Output Types
// ============================================================================

/**
 * Tool input - bulk repository search queries
 */
export interface GitHubSearchReposInput {
  queries: GitHubReposSearchQuery[];
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubSearchReposOutput extends ToolResponse {
  /** Primary data payload - array of repository search results */
  data: RepoSearchResult[];
}

/**
 * Individual repository search result
 */
export interface RepoSearchResult {
  queryId?: string;
  reasoning?: string;
  repositories: SimplifiedRepository[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  metadata?: Record<string, unknown>; // Internal use
}

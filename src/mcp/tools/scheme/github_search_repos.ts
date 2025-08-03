import { z } from 'zod';
import { ResearchGoalEnum } from '../utils/toolConstants';
import { BaseSearchParams, OrderSort } from '../../../types';
import { GenericToolResponse, BaseToolMeta } from '../../types/genericResponse';

// Define the repository search query schema for bulk operations
export const GitHubReposSearchQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  exactQuery: z.string().optional().describe('Single exact phrase/word search'),
  queryTerms: z
    .array(z.string())
    .optional()
    .describe('Multiple search terms for broader coverage'),

  // CORE FILTERS (GitHub CLI flags) - Allow null values
  owner: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe(
      'Repository owner/organization name(s). Search within specific organizations or users.'
    ),
  language: z
    .union([z.string(), z.null()])
    .optional()
    .describe(
      'Programming language filter. Filters repositories by primary language.'
    ),
  stars: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Star count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
    ),
  topic: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Find repositories by technology/subject'),
  forks: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Fork count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
    ),

  // Match CLI parameter name exactly
  'number-topics': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Number of topics filter. Format: ">5" (many topics), ">=3" (at least 3), "<10" (few topics), "1..3" (range), "5" (exact).'
    ),

  // QUALITY & STATE FILTERS
  license: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('License filter. Filter repositories by license type.'),
  archived: z
    .union([z.boolean(), z.null()])
    .optional()
    .describe(
      'Archive status filter. false (active repos only), true (archived repos only).'
    ),
  'include-forks': z
    .union([z.enum(['false', 'true', 'only']), z.null()])
    .optional()
    .describe(
      'Fork inclusion. "false" (exclude forks), "true" (include forks), "only" (forks only).'
    ),
  visibility: z
    .union([z.enum(['public', 'private', 'internal']), z.null()])
    .optional()
    .describe('Repository visibility.'),

  // DATE & SIZE FILTERS
  created: z
    .union([
      z
        .string()
        .regex(
          /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
        ),
      z.null(),
    ])
    .optional()
    .describe(
      'Repository creation date filter. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "<=2023-12-31" (on or before), "2020-01-01..2023-12-31" (range), "2023-01-01" (exact).'
    ),
  updated: z
    .union([
      z
        .string()
        .regex(
          /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
        ),
      z.null(),
    ])
    .optional()
    .describe(
      'Last updated date filter. Format: ">2024-01-01" (recently updated), ">=2024-01-01" (on or after), "<2022-01-01" (not recently updated), "2023-01-01..2024-12-31" (range).'
    ),
  size: z
    .union([z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/), z.null()])
    .optional()
    .describe(
      'Repository size filter in KB. Format: ">1000" (large projects), ">=500" (medium-large), "<100" (small projects), "<=50" (tiny), "100..1000" (medium range), "500" (exact).'
    ),

  // COMMUNITY FILTERS - Match CLI parameter names exactly
  'good-first-issues': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Good first issues count. Format: ">5" (many beginner issues), "1..10" (some beginner issues).'
    ),
  'help-wanted-issues': z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Help wanted issues count. Format: ">10" (many help wanted), "1..5" (some help wanted).'
    ),
  followers: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
      z.null(),
    ])
    .optional()
    .describe(
      'Repository owner followers count. Format: ">1000" (popular developers), ">=500" (established developers), "<100" (smaller developers), "100..1000" (range).'
    ),

  // SEARCH SCOPE - Match CLI exactly
  match: z
    .union([
      z.enum(['name', 'description', 'readme']),
      z.array(z.enum(['name', 'description', 'readme'])),
      z.null(),
    ])
    .optional()
    .describe(
      'Search scope. Where to search: name, description, or readme content.'
    ),

  // SORTING & LIMITS - Match CLI defaults exactly
  sort: z
    .union([
      z.enum(['forks', 'help-wanted-issues', 'stars', 'updated', 'best-match']),
      z.null(),
    ])
    .optional()
    .describe(
      'Sort criteria. RECOMMENDED: Use "stars" for token optimization to get most popular/relevant repositories first.'
    ),
  order: z
    .union([z.enum(['asc', 'desc']), z.null()])
    .optional()
    .describe('Sort order direction.'),
  limit: z
    .union([z.number().int().min(1).max(100), z.null()])
    .optional()
    .describe(
      'Maximum number of repositories to return (1-100). TOKEN OPTIMIZATION: Use 1 for specific repository searches, 10-20 for exploratory discovery. For multiple specific repositories, create separate queries with limit=1 each.'
    ),
  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation'),
});

export type GitHubReposSearchQuery = z.infer<
  typeof GitHubReposSearchQuerySchema
>;

export interface GitHubReposSearchResult {
  total_count: number;
  repositories: Array<{
    name: string;
    stars: number;
    description: string;
    language: string;
    url: string;
    forks: number;
    updatedAt: string;
    owner: string;
  }>;
}

export interface GitHubReposSearchQueryResult {
  queryId: string;
  result: GitHubReposSearchResult;
  apiResult?: GitHubReposSearchResult;
  error?: string;
  apiError?: string;
}

export interface GitHubReposResponse {
  data: GitHubReposSearchResult['repositories'];
  apiResults: Array<{
    queryId: string;
    data: GitHubReposSearchResult;
    error?: string;
  }>;
  hints: string[];
  metadata?: {
    queries: GitHubReposSearchQueryResult[];
    summary: {
      totalQueries: number;
      cli: {
        successfulQueries: number;
        failedQueries: number;
      };
      api: {
        successfulQueries: number;
        failedQueries: number;
      };
      totalRepositories: number;
    };
  };
}
export interface GitHubReposSearchParams
  extends Omit<BaseSearchParams, 'query'>,
    OrderSort {
  exactQuery?: string; // Exact phrase/word to search for
  queryTerms?: string[]; // Array of search terms (AND logic)

  // PRIMARY FILTERS (work alone)
  language?: string;
  forks?: string | number; // Support both string ranges and numbers
  stars?: string | number; // Support both string ranges and numbers
  topic?: string | string[]; // Support both single and array
  'number-topics'?: string | number; // Support both string ranges and numbers

  // SECONDARY FILTERS (require query or primary filter)
  archived?: boolean;
  created?: string;
  'include-forks'?: 'false' | 'true' | 'only';
  license?: string | string[]; // Support both single and array
  match?:
    | 'name'
    | 'description'
    | 'readme'
    | ('name' | 'description' | 'readme')[];
  updated?: string;
  visibility?: 'public' | 'private' | 'internal';
  'good-first-issues'?: string | number; // Support both string ranges and numbers
  'help-wanted-issues'?: string | number; // Support both string ranges and numbers
  followers?: string | number; // Support both string ranges and numbers
  size?: string; // Format: ">100", "<50", "10..100"

  // ADDITIONAL ENHANCED PARAMETERS
  pushed?: string; // Last push date filter - Format: ">2020-01-01", "2020-01-01..2023-12-31"
  template?: boolean; // Filter for template repositories
  mirror?: boolean; // Filter for mirror repositories
  sponsor?: boolean; // Filter for repositories that can be sponsored
  'has-issues'?: boolean; // Filter repositories with issues enabled
  'has-projects'?: boolean; // Filter repositories with projects enabled
  'has-wiki'?: boolean; // Filter repositories with wiki enabled
  'has-pages'?: boolean; // Filter repositories with GitHub Pages enabled
  'has-downloads'?: boolean; // Filter repositories with downloads enabled
  'has-discussions'?: boolean; // Filter repositories with discussions enabled

  // SORTING AND LIMITS
  limit?: number;
  sort?: 'forks' | 'help-wanted-issues' | 'stars' | 'updated' | 'best-match';
  page?: number; // For pagination support
}

/**
 * Simplified repository result for the standardized response
 */
export interface ProcessedRepositoryResult {
  queryId: string;
  name: string;
  stars: number;
  description: string;
  language: string;
  url: string;
  forks: number;
  updatedAt: string;
  owner: string;
  researchGoal: string;
}

/**
 * GitHub Repository Search specific metadata extending the base
 */
export interface GitHubReposSearchMeta extends BaseToolMeta {
  /** Total repositories found across all queries */
  totalRepositories: number;
  /** Language distribution in results */
  languageDistribution?: Record<string, number>;
  /** Star range statistics */
  starStatistics?: {
    min: number;
    max: number;
    average: number;
  };
}

/**
 * Standardized GitHub Repository Search response
 */
export type GitHubRepositorySearchResponse = GenericToolResponse<
  ProcessedRepositoryResult,
  GitHubReposSearchMeta
>;

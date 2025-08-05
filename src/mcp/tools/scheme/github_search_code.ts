import { z } from 'zod';
import { extendBaseQuerySchema, createBulkQuerySchema } from './baseSchema';

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
      'Search terms (AND logic). Returns actual code snippets with context.'
    ),

  // Repository filters
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner name (user or organization)'),
  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository name (use with owner for specific repo)'),

  // File filters
  language: z
    .string()
    .optional()
    .describe(
      'Programming language filter (e.g., "language-name", "script-language", "compiled-language")'
    ),
  extension: z
    .string()
    .optional()
    .describe('File extension filter (e.g., "md", "js", "yml")'),
  filename: z
    .string()
    .optional()
    .describe(
      'Target specific filename or pattern (e.g., "README", "test", ".env")'
    ),
  path: z
    .string()
    .optional()
    .describe('Filter on file path pattern (e.g., "src/", "docs/", "config/")'),
  size: z
    .string()
    .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
    .optional()
    .describe(
      'File size filter in KB. Use ">50" for substantial files, "<10" for simple examples'
    ),

  // Repository properties
  fork: z
    .enum(['true', 'false', 'only'])
    .optional()
    .describe(
      'Include forks: "true" (include all), "false" (exclude forks), "only" (forks only)'
    ),
  archived: z
    .boolean()
    .optional()
    .describe(
      'Filter by archived status: true (archived only), false (exclude archived)'
    ),
  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),

  // NEW: Repository quality filters for better relevance
  stars: z
    .union([z.number(), z.string()])
    .optional()
    .describe(
      'Minimum repository stars for better quality results (e.g., ">100", ">=500", "1000..5000")'
    ),
  forks: z
    .union([z.number(), z.string()])
    .optional()
    .describe(
      'Minimum repository forks for better quality results (e.g., ">10", ">=50")'
    ),
  pushed: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Last pushed date filter for active repositories (e.g., ">2023-01-01", ">=2024-01-01")'
    ),
  created: z
    .string()
    .regex(
      /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/
    )
    .optional()
    .describe(
      'Repository creation date filter (e.g., ">2020-01-01", ">=2018-01-01")'
    ),

  // NEW: Search scope and relevance controls
  match: z
    .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
    .optional()
    .describe(
      'Search scope: "file" (content search - default), "path" (filename search)'
    ),

  // NEW: Sort and order for better relevance
  sort: z
    .enum(['indexed', 'best-match'])
    .optional()
    .default('best-match')
    .describe(
      'Sort results: "best-match" (relevance - default), "indexed" (recently indexed)'
    ),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort order: "desc" (default), "asc"'),

  // NEW: Quality boost parameters
  qualityBoost: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Enable quality boosting: prioritize popular, well-maintained repositories (default: true)'
    ),
  excludeArchived: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Exclude archived repositories for better relevance (default: true)'
    ),
  excludeForks: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Exclude forks to focus on original repositories (default: false)'
    ),

  // Result control
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Maximum results per query (1-20). Higher limits for discovery, lower for targeted searches'
    ),
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

  // Advanced options
  branch: z
    .string()
    .optional()
    .describe(
      'Branch name, tag name, OR commit SHA. Uses default branch if not provided.'
    ),
});

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

// Bulk schema for tools that need it
export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  GitHubCodeSearchQuerySchema,
  1,
  5,
  'Array of 1-5 progressive refinement queries, starting broad then narrowing. PROGRESSIVE STRATEGY: Query 1 should be broad (queryTerms + owner/repo only), then progressively add filters based on initial findings.'
);

// ============================================================================
// PROCESSED RESULT TYPES
// ============================================================================

export interface ProcessedCodeSearchResult {
  queryId: string;
  data?: {
    files?: Array<{
      path: string;
      text_matches: string[]; // Array of fragment strings only
    }>;
    totalCount?: number;
    repository?: string;
  };
  error?: string;
  hints?: string[];
  metadata: Record<string, unknown>;
}

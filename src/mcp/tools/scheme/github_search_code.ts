import z from 'zod';
import { OptimizedCodeSearchResult } from '../../../types';
import { ResearchGoalEnum } from '../utils/toolConstants';

export type GitHubCodeSearchQuery = z.infer<typeof GitHubCodeSearchQuerySchema>;

export interface GitHubCodeSearchQueryResult {
  queryId: string;
  originalQuery: GitHubCodeSearchQuery;
  result: OptimizedCodeSearchResult;
  apiResult?: OptimizedCodeSearchResult;
  error?: string;
  apiError?: string;
}
export interface ProcessedCodeSearchResult {
  queryId: string;
  repository: string;
  path: string;
  matches: string[];
  repositoryInfo: {
    nameWithOwner: string;
  };
}

export interface GitHubCodeSearchItem {
  path: string;
  repository: {
    id: string;
    nameWithOwner: string;
    url: string;
    isFork: boolean;
    isPrivate: boolean;
  };
  sha: string;
  textMatches: GitHubCodeTextMatch[];
  url: string;
}

export interface GitHubCodeTextMatch {
  fragment: string;
  matches: GitHubCodeSearchMatch[];
}

// Optimized GitHub Search Code Types
export interface GitHubCodeSearchMatch {
  text: string;
  indices: [number, number];
}

export const GitHubCodeSearchQuerySchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      'Query description/purpose (e.g., "core-implementation", "documentation-guide", "config-files")'
    ),
  queryTerms: z
    .array(z.string())
    .min(1)
    .max(4)
    .optional()
    .describe(
      'Search terms with AND logic - ALL terms must appear in same file'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Programming language filter (e.g., "language-name", "script-language", "compiled-language")'
    ),
  owner: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository owner name (user or organization)'),
  user: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Filter by specific user account (individual user)'),
  org: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Filter by specific organization account'),
  repo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Repository name (use with owner for specific repo)'),
  filename: z
    .string()
    .optional()
    .describe(
      'Target specific filename or pattern (e.g., "README", "test", ".env")'
    ),
  extension: z
    .string()
    .optional()
    .describe('File extension filter (e.g., "md", "js", "yml")'),
  path: z
    .string()
    .optional()
    .describe('Filter on file path pattern (e.g., "src/", "docs/", "config/")'),
  match: z
    .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
    .optional()
    .describe(
      'Search scope: "file" (content search - default), "path" (filename search)'
    ),
  size: z
    .string()
    .regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/)
    .optional()
    .describe(
      'File size filter in KB. Use ">50" for substantial files, "<10" for simple examples'
    ),
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Maximum results per query (1-20). Higher limits for discovery, lower for targeted searches'
    ),
  visibility: z
    .enum(['public', 'private', 'internal'])
    .optional()
    .describe('Repository visibility'),
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
  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation'),
});

export interface GitHubBulkCodeSearchResult {
  results: Array<{
    queryId?: string;
    originalQuery: GitHubCodeSearchQuery;
    result: OptimizedCodeSearchResult;
    fallbackTriggered: boolean;
    fallbackQuery?: GitHubCodeSearchQuery;
    error?: string;
  }>;
  totalQueries: number;
  successfulQueries: number;
  queriesWithFallback: number;
}

import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubBranchSchema,
  MinifySchema,
  SanitizeSchema,
} from './baseSchema';
import { ToolResponse } from '../responses.js';

export const FileContentQuerySchema = BaseQuerySchema.extend({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  minified: MinifySchema,
  sanitize: SanitizeSchema,
  path: z
    .string()
    .describe(
      'Github File Path - MUST be exact absolute path from repo. Use github_view_repo_structure or github_search_code first to verify correct paths exist.'
    ),
  branch: GitHubBranchSchema.optional(),
  fullContent: z.boolean().default(false).describe('Return entire file'),
  startLine: z.number().int().min(1).optional().describe('Start line in file'),
  endLine: z.number().int().min(1).optional().describe('End line in file'),
  matchString: z.string().optional().describe('Pattern to search in file'),
  matchStringContextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe('Lines before and after matchString'),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

// Bulk schema for multiple file content queries
export const FileContentBulkQuerySchema = createBulkQuerySchema(
  FileContentQuerySchema,
  'File content fetch queries - Use github_view_repo_structure or github_search_code first to find correct file paths'
);

/**
 * Tool input - bulk file content queries
 */
export interface GitHubFetchContentInput {
  queries: FileContentQuery[];
}

/**
 * Tool output - extends standardized ToolResponse format
 */
export interface GitHubFetchContentOutput extends ToolResponse {
  /** Primary data payload - array of file content results */
  data: ContentResult[];
}

/**
 * Individual file content result
 */
export interface ContentResult {
  queryId?: string;
  reasoning?: string;
  repository?: string;
  path?: string;
  contentLength?: number;
  content?: string;
  branch?: string;
  startLine?: number;
  endLine?: number;
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?: string;
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>; // Only on error
  originalQuery?: Record<string, unknown>; // Only on error
  securityWarnings?: string[];
  sampling?: Record<string, unknown>; // Beta feature
}

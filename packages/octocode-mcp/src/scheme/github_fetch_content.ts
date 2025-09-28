import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_FETCH_CONTENT } from './schemDescriptions';
import { ToolResponse } from '../responses.js';
import { TOOL_NAMES } from '../constants';

export const FileContentQuerySchema = BaseQuerySchema.extend({
  owner: z.string().min(1).max(200).describe(GITHUB_FETCH_CONTENT.scope.owner),
  repo: z.string().min(1).max(150).describe(GITHUB_FETCH_CONTENT.scope.repo),
  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.minified),
  sanitize: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.sanitize),
  path: z.string().describe(GITHUB_FETCH_CONTENT.scope.path),
  branch: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.scope.branch),
  fullContent: z
    .boolean()
    .default(false)
    .describe(GITHUB_FETCH_CONTENT.range.fullContent),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.startLine),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.endLine),
  matchString: z
    .string()
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.matchString),
  matchStringContextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe(GITHUB_FETCH_CONTENT.range.matchStringContextLines),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export const FileContentBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_FETCH_CONTENT,
  FileContentQuerySchema
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

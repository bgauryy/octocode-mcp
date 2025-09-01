import { z } from 'zod';
import {
  extendBaseQuerySchema,
  createBulkQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubFilePathSchema,
  GitHubBranchSchema,
} from './baseSchema';

export const FileContentQuerySchema = extendBaseQuerySchema({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  filePath: GitHubFilePathSchema.describe(
    `File path to fetch relative to the repository root. Do NOT start with slash (e.g., 'src/index.js', 'README.md', 'docs/api.md'). path must be verified before fetching`
  ),
  branch: GitHubBranchSchema.optional(),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Starting line number for partial file access.`),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Ending line number for partial file access.`),
  matchString: z
    .string()
    .optional()
    .describe(
      `Exact string to find in file. Returns surrounding context with matchStringContextLines.`
    ),
  matchStringContextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe(
      'Number of lines to include above and below a matched string. Only used when matchString is provided.'
    ),
  minified: z
    .boolean()
    .default(true)
    .describe(`Optimize content for token efficiency`),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

// Bulk schema for multiple file content queries
export const FileContentBulkQuerySchema = createBulkQuerySchema(
  FileContentQuerySchema,
  1,
  10,
  'Array of up to 10 file content queries for parallel execution'
);

export interface FileContentQueryResult {
  queryId?: string; // Sequential query ID (file-content_1, file-content_2, etc.)
  queryDescription?: string;
  researchGoal?: string;
  originalQuery?: FileContentQuery; // Only included on error or not found
  result: GitHubFileContentResponse | { error: string; hints?: string[] };
  error?: string;
  sampling?: {
    codeExplanation: string;
    filePath: string;
    repo: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    stopReason?: string;
  }; // Beta feature: LLM explanation of what the code is doing
}
export interface GitHubFileContentResponse {
  filePath: string;
  owner: string;
  repo: string;
  branch: string;
  content: string;
  // Actual content boundaries (with context applied)
  startLine?: number;
  endLine?: number;
  totalLines: number; // Always returned - total lines in the file
  isPartial?: boolean;
  minified?: boolean;
  minificationFailed?: boolean;
  minificationType?:
    | 'terser'
    | 'conservative'
    | 'aggressive'
    | 'json'
    | 'general'
    | 'markdown'
    | 'failed'
    | 'none';
  // Security metadata
  securityWarnings?: string[];
}

export interface GithubFetchRequestParams {
  owner: string;
  repo: string;
  branch?: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  minified: boolean;
}

export interface GitHubFileContentError {
  error: string;
  status?: number;
  hints?: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type?: 'http' | 'graphql' | 'network' | 'unknown';
}

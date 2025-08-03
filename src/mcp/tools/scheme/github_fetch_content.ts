import { z } from 'zod';
import {
  extendBaseQuerySchema,
  GitHubOwnerSchema,
  GitHubRepoSchema,
  GitHubFilePathSchema,
  GitHubBranchSchema,
} from './baseSchema';

export const FileContentQuerySchema = extendBaseQuerySchema({
  owner: GitHubOwnerSchema,
  repo: GitHubRepoSchema,
  filePath: GitHubFilePathSchema.describe(
    `File path from repository root (e.g., 'src/index.js', 'README.md', 'docs/api.md'). Do NOT start with slash.
        
        CRITICAL: Always verify file paths using githubViewRepoStructure and githubSearchCode before fetching to ensure accurate research results.`
  ),
  branch: GitHubBranchSchema.optional(),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Starting line number (1-based) for partial file access. Recommended to save tokens.`
    ),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Ending line number (1-based) for partial file access. Use with startLine to fetch only specific sections and save tokens.`
    ),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe(`Context lines around target range. Default: 5.`),
  matchString: z
    .string()
    .optional()
    .describe(
      `Exact string to find in file. Returns surrounding context with contextLines.`
    ),
  minified: z
    .boolean()
    .default(true)
    .describe(
      `Optimize content for token efficiency (enabled by default). Applies basic formatting optimizations that may reduce token usage. Set to false only when exact formatting is required.`
    ),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export interface FileContentQueryResult {
  queryId?: string;
  researchGoal?: string;
  originalQuery?: FileContentQuery; // Only included on error or not found
  result: GitHubFileContentResponse | { error: string; hints?: string[] };
  error?: string;
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
  // Original request parameters for LLM context
  requestedStartLine?: number;
  requestedEndLine?: number;
  requestedContextLines?: number;
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
  contextLines?: number;
  matchString?: string;
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

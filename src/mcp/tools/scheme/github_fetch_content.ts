import { ResearchGoalEnum } from '../utils/toolConstants';
import { z } from 'zod';

export const FileContentQuerySchema = z.object({
  id: z.string().optional().describe('Optional identifier for the query'),
  owner: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/)
    .describe(
      `Repository owner/organization name (e.g., 'facebook', 'microsoft'). Do NOT include repository name here.`
    ),
  repo: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .describe(
      `Repository name only (e.g., 'react', 'vscode'). Do NOT include owner/org prefix.`
    ),
  filePath: z
    .string()
    .min(1)
    .describe(
      `File path from repository root (e.g., 'src/index.js', 'README.md', 'docs/api.md'). Do NOT start with slash.
        
        CRITICAL: Always verify file paths using githubViewRepoStructure and githubSearchCode before fetching to ensure accurate research results.`
    ),
  branch: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\s]+$/)
    .optional()
    .describe(
      `Branch name, tag name, OR commit SHA. Uses default branch if not provided.`
    ),
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
  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation'),
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export interface FileContentQueryResult {
  queryId?: string;
  originalQuery: FileContentQuery;
  result: any;
  apiResult?: any;
  fallbackTriggered: boolean;
  error?: string;
  apiError?: string;
}

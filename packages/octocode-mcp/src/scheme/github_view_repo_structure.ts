import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_VIEW_REPO_STRUCTURE } from './schemDescriptions';
import { ToolResponse } from '../responses.js';
import { TOOL_NAMES } from '../constants';

export const GitHubViewRepoStructureQuerySchema = BaseQuerySchema.extend({
  owner: z
    .string()
    .min(1)
    .max(200)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.owner),
  repo: z
    .string()
    .min(1)
    .max(150)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.repo),
  branch: z
    .string()
    .min(1)
    .max(255)
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.branch),
  path: z
    .string()
    .default('')
    .optional()
    .describe(GITHUB_VIEW_REPO_STRUCTURE.scope.path),
  depth: z
    .number()
    .min(1)
    .max(2)
    .default(1)
    .optional()
    .describe(GITHUB_VIEW_REPO_STRUCTURE.range.depth),
});

export type GitHubViewRepoStructureQuery = z.infer<
  typeof GitHubViewRepoStructureQuerySchema
>;

export const GitHubViewRepoStructureBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  GitHubViewRepoStructureQuerySchema
);

export interface GitHubApiFileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

export interface GitHubRepositoryContentsResult {
  path: string;
  baseUrl: string;
  files: Array<{
    name: string;
    size: number;
    url: string;
  }>;
  folders: string[];
  branchFallback?: {
    requested: string;
    used: string;
    message: string;
  };
}

export interface GitHubRepositoryStructureResult {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  apiSource: boolean;
  summary: {
    totalFiles: number;
    totalFolders: number;
    truncated: boolean;
    filtered: boolean;
    originalCount: number;
  };
  files: Array<{
    path: string;
    size?: number;
    url: string;
  }>;
  folders: {
    count: number;
    folders: Array<{
      path: string;
      url: string;
    }>;
  };
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface GitHubViewRepoStructureInput {
  queries: GitHubViewRepoStructureQuery[];
}

export interface GitHubViewRepoStructureOutput extends ToolResponse {
  data: RepoStructureResult[];
}

export interface RepoStructureResult {
  researchGoal?: string;
  reasoning?: string;
  owner?: string;
  repo?: string;
  path?: string;
  files?: string[];
  folders?: string[];
  error?: string;
  hints?: string[];
  query?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_VIEW_REPO_STRUCTURE, TOOL_NAMES } from '../tools/toolMetadata';
import type { DirectoryEntry, PaginationInfo } from '../types.js';

/** Default entries per page for GitHub repo structure pagination */
export const GITHUB_STRUCTURE_DEFAULTS = {
  ENTRIES_PER_PAGE: 50,
  MAX_ENTRIES_PER_PAGE: 200,
} as const;

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
  entriesPerPage: z
    .number()
    .min(1)
    .max(GITHUB_STRUCTURE_DEFAULTS.MAX_ENTRIES_PER_PAGE)
    .default(GITHUB_STRUCTURE_DEFAULTS.ENTRIES_PER_PAGE)
    .optional()
    .describe(
      'Number of entries (files + folders) per page. Default: 50, Max: 200'
    ),
  entryPageNumber: z
    .number()
    .min(1)
    .default(1)
    .optional()
    .describe('Page number to retrieve (1-based). Default: 1'),
});

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
  structure: Record<string, DirectoryEntry>;
  /** Pagination info when results are paginated */
  pagination?: PaginationInfo;
  /** Hints for next steps (including pagination hints) */
  hints?: string[];
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_VIEW_REPO_STRUCTURE, TOOL_NAMES } from '../tools/toolMetadata';
import type { DirectoryEntry, PaginationInfo } from '../types.js';
import type { ContentDirectoryEntry } from '../github/githubAPI.js';

/** Default entries per page for GitHub repo structure pagination */
export const GITHUB_STRUCTURE_DEFAULTS = {
  ENTRIES_PER_PAGE: 50,
  MAX_ENTRIES_PER_PAGE: 200,
} as const;

const GitHubViewRepoStructureQuerySchema = BaseQuerySchema.extend({
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
    .describe(GITHUB_VIEW_REPO_STRUCTURE.pagination.entriesPerPage),
  entryPageNumber: z
    .number()
    .min(1)
    .default(1)
    .optional()
    .describe(GITHUB_VIEW_REPO_STRUCTURE.pagination.entryPageNumber),
});

export const GitHubViewRepoStructureBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
  GitHubViewRepoStructureQuerySchema
);

/**
 * GitHub API file/directory item from content listing.
 * Re-exported from Octokit's OpenAPI types for proper type safety.
 * Schema: components['schemas']['content-directory'][number]
 */
export type GitHubApiFileItem = ContentDirectoryEntry;

/** Internal item for caching (pre-pagination) */
interface CachedStructureItem {
  path: string;
  type: 'file' | 'dir';
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
  /** Internal: raw items for post-cache pagination (not serialized in responses) */
  _cachedItems?: CachedStructureItem[];
}

export interface GitHubRepositoryStructureError {
  error: string;
  status?: number;
  triedBranches?: string[];
  defaultBranch?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

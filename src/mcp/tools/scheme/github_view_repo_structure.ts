import { ResearchGoalEnum } from '../utils/toolConstants';
import { z } from 'zod';

export interface GitHubRepositoryStructureParams {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  depth?: number;
  includeIgnored?: boolean; // If true, show all files/folders including normally ignored ones
  showMedia?: boolean; // If true, show media files (images, videos, audio). Default: false
  researchGoal?: string; // Research goal to guide tool behavior and hint generation
}

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

export const GitHubRepositoryStructureParamsSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(150)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
      'Invalid GitHub username/org format'
    )
    .describe('Repository owner or organization name'),

  repo: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')
    .describe('Repository name only'),

  branch: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\s]+$/, 'Branch name cannot contain spaces')
    .describe('Branch name'),

  path: z
    .string()
    .optional()
    .default('')
    .refine(path => !path.includes('..'), 'Path traversal not allowed')
    .refine(path => path.length <= 500, 'Path too long')
    .describe(
      'Directory path within repository. Start empty for root for exploration'
    ),

  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .describe(
      'Directory depth to explore (higher values increase response time)'
    ),

  includeIgnored: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include config files, lock files, hidden directories. Default false for optimization'
    ),

  showMedia: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include media files. Default false for optimization'),

  researchGoal: z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation'),
});

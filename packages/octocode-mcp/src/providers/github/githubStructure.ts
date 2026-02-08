/**
 * GitHub Repository Structure
 *
 * Extracted from GitHubProvider for better modularity.
 *
 * @module providers/github/githubStructure
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  ProviderResponse,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';

import { viewGitHubRepositoryStructureAPI } from '../../github/repoStructure.js';

import type { GitHubViewRepoStructureQuery } from '../../tools/github_view_repo_structure/types.js';
import type { GitHubRepositoryStructureResult } from '../../tools/github_view_repo_structure/scheme.js';

/**
 * Parse a unified projectId into owner and repo.
 * GitHub format: 'owner/repo'
 */
export function parseGitHubProjectId(projectId?: string): {
  owner?: string;
  repo?: string;
} {
  if (!projectId) {
    return { owner: undefined, repo: undefined };
  }

  const parts = projectId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid GitHub projectId format: '${projectId}'. Expected 'owner/repo'.`
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

/**
 * Transform GitHub repository structure result to unified format.
 */
export function transformRepoStructureResult(
  data: GitHubRepositoryStructureResult
): RepoStructureResult {
  return {
    projectPath: `${data.owner}/${data.repo}`,
    branch: data.branch || '',
    path: data.path || '/',
    structure: data.structure || {},
    summary: {
      totalFiles: data.summary?.totalFiles || 0,
      totalFolders: data.summary?.totalFolders || 0,
      truncated: data.summary?.truncated || false,
    },
    pagination: data.pagination,
    hints: data.hints,
  };
}

/**
 * Get repository structure from GitHub.
 */
export async function getRepoStructure(
  query: RepoStructureQuery,
  authInfo?: AuthInfo,
  parseProjectId: (projectId?: string) => {
    owner?: string;
    repo?: string;
  } = parseGitHubProjectId
): Promise<ProviderResponse<RepoStructureResult>> {
  const { owner, repo } = parseProjectId(query.projectId);

  if (!owner || !repo) {
    return {
      error: 'Project ID is required for repository structure',
      status: 400,
      provider: 'github',
    };
  }

  const githubQuery: GitHubViewRepoStructureQuery = {
    owner,
    repo,
    branch: query.ref || 'HEAD',
    path: query.path,
    depth: query.depth,
    entriesPerPage: query.entriesPerPage,
    entryPageNumber: query.entryPageNumber,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
  };

  const result = await viewGitHubRepositoryStructureAPI(githubQuery, authInfo);

  if ('error' in result) {
    const errorResult = result as {
      error: string | { toString(): string };
      status?: number;
      hints?: string[];
    };
    return {
      error:
        typeof errorResult.error === 'string'
          ? errorResult.error
          : String(errorResult.error),
      status: errorResult.status || 500,
      provider: 'github',
      hints: errorResult.hints,
    };
  }

  return {
    data: transformRepoStructureResult(result),
    status: 200,
    provider: 'github',
  };
}

/**
 * GitLab Repository Structure
 *
 * Extracted from GitLabProvider for better modularity.
 *
 * @module providers/gitlab/gitlabStructure
 */

import type {
  ProviderResponse,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';

import { viewGitLabRepositoryStructureAPI } from '../../gitlab/repoStructure.js';

/**
 * Parse a unified projectId into GitLab format.
 * GitLab accepts: numeric ID or URL-encoded path
 */
export function parseGitLabProjectId(projectId?: string): number | string {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Check if it's a numeric ID
  const numId = parseInt(projectId, 10);
  if (!isNaN(numId) && String(numId) === projectId) {
    return numId;
  }

  // URL-encode the path for GitLab API
  return encodeURIComponent(projectId);
}

/**
 * Get repository structure from GitLab.
 */
export async function getRepoStructure(
  query: RepoStructureQuery,
  parseProjectId: (projectId?: string) => number | string = parseGitLabProjectId
): Promise<ProviderResponse<RepoStructureResult>> {
  const projectId = parseProjectId(query.projectId);

  const gitlabQuery = {
    projectId,
    ref: query.ref,
    path: query.path,
    recursive: query.recursive,
    perPage: query.entriesPerPage,
    page: query.entryPageNumber,
  };

  const result = await viewGitLabRepositoryStructureAPI(gitlabQuery);

  if ('error' in result && result.error) {
    return {
      error: result.error,
      status: result.status || 500,
      provider: 'gitlab',
      hints: 'hints' in result ? result.hints : undefined,
    };
  }

  if (!('data' in result) || !result.data) {
    return {
      error: 'No data returned from GitLab API',
      status: 500,
      provider: 'gitlab',
    };
  }

  return {
    data: {
      projectPath: result.data.projectPath,
      branch: result.data.branch,
      path: result.data.path,
      structure: result.data.structure,
      summary: result.data.summary,
      pagination: result.data.pagination,
      hints: result.data.hints,
    },
    status: 200,
    provider: 'gitlab',
  };
}

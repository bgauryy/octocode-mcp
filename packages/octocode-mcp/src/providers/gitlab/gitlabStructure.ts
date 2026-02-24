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
import { parseGitLabProjectId, extractGitLabRateLimit } from './utils.js';
export { parseGitLabProjectId };

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
      rateLimit: extractGitLabRateLimit(result),
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

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
import { handleGitLabAPIResponse, parseGitLabProjectId } from './utils.js';
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
  return handleGitLabAPIResponse(result, 'gitlab', data => ({
    projectPath: data.projectPath,
    branch: data.branch,
    path: data.path,
    structure: data.structure,
    summary: data.summary,
    pagination: data.pagination,
    hints: data.hints,
  }));
}

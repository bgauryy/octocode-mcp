/**
 * GitLab File Content Fetching
 *
 * Extracted from GitLabProvider for better modularity.
 *
 * @module providers/gitlab/gitlabContent
 */

import type {
  ProviderResponse,
  FileContentQuery,
  FileContentResult,
} from '../types.js';

import {
  fetchGitLabFileContentAPI,
  getGitLabDefaultBranch,
} from '../../gitlab/fileContent.js';
import type {
  GitLabFileContentQuery,
  GitLabFileContent,
} from '../../gitlab/types.js';

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
 * Transform GitLab file content result to unified format.
 */
export function transformFileContentResult(
  data: GitLabFileContent,
  query: FileContentQuery
): FileContentResult {
  return {
    path: data.file_path || query.path,
    content: data.content || '',
    encoding: (data.encoding === 'base64' ? 'base64' : 'utf-8') as
      | 'utf-8'
      | 'base64',
    size: data.size || 0,
    ref: data.ref || query.ref || '',
    lastCommitSha: data.last_commit_id,
    lastModifiedBy: undefined, // GitLab doesn't provide this in file content API
    pagination: undefined, // GitLab file content doesn't support pagination
    isPartial: query.startLine !== undefined || query.endLine !== undefined,
    startLine: query.startLine,
    endLine: query.endLine,
  };
}

/**
 * Get file content from GitLab.
 */
export async function getFileContent(
  query: FileContentQuery,
  parseProjectId: (projectId?: string) => number | string = parseGitLabProjectId
): Promise<ProviderResponse<FileContentResult>> {
  const projectId = parseProjectId(query.projectId);

  // If no ref provided, fetch default branch
  let ref = query.ref;
  if (!ref) {
    ref = await getGitLabDefaultBranch(projectId);
  }

  const gitlabQuery: GitLabFileContentQuery = {
    projectId,
    path: query.path,
    ref,
    startLine: query.startLine,
    endLine: query.endLine,
  };

  const result = await fetchGitLabFileContentAPI(gitlabQuery);

  if ('error' in result && result.error) {
    return {
      error:
        typeof result.error === 'string' ? result.error : String(result.error),
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
    data: transformFileContentResult(result.data, query),
    status: 200,
    provider: 'gitlab',
  };
}

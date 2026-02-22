/**
 * GitHub File Content Fetching
 *
 * Extracted from GitHubProvider for better modularity.
 *
 * @module providers/github/githubContent
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  ProviderResponse,
  FileContentQuery,
  FileContentResult,
} from '../types.js';

import { fetchGitHubFileContentAPI } from '../../github/fileContent.js';

import type { FileContentQuery as GHFileContentQuery } from '../../tools/github_fetch_content/types.js';
import type { ContentResultData } from '../../tools/github_fetch_content/types.js';
import { isGitHubAPIError } from '../../github/githubAPI.js';

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
 * Transform GitHub file content result to unified format.
 */
export function transformFileContentResult(
  data: ContentResultData,
  query: FileContentQuery
): FileContentResult {
  return {
    path: data.path || query.path,
    content: data.content || '',
    encoding: 'utf-8',
    size: data.content?.length || 0,
    ref: data.branch || query.ref || '',
    lastModified: data.lastModified,
    lastModifiedBy: data.lastModifiedBy,
    pagination: data.pagination,
    isPartial: data.isPartial,
    startLine: data.startLine,
    endLine: data.endLine,
  };
}

/**
 * Get file content from GitHub.
 */
export async function getFileContent(
  query: FileContentQuery,
  authInfo?: AuthInfo,
  parseProjectId: (projectId?: string) => {
    owner?: string;
    repo?: string;
  } = parseGitHubProjectId
): Promise<ProviderResponse<FileContentResult>> {
  const { owner, repo } = parseProjectId(query.projectId);

  if (!owner || !repo) {
    return {
      error: 'Project ID is required for file content',
      status: 400,
      provider: 'github',
    };
  }

  const githubQuery: GHFileContentQuery = {
    owner,
    repo,
    path: query.path,
    branch: query.ref,
    startLine: query.startLine,
    endLine: query.endLine,
    matchString: query.matchString,
    matchStringContextLines: query.matchStringContextLines,
    charOffset: query.charOffset,
    charLength: query.charLength,
    fullContent: query.fullContent,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
  };

  const result = await fetchGitHubFileContentAPI(githubQuery, authInfo);

  // Check for error using type guard
  if (isGitHubAPIError(result)) {
    return {
      error: result.error,
      status: result.status || 500,
      provider: 'github',
      hints: result.hints,
    };
  }

  if (!result.data) {
    return {
      error: 'No data returned from GitHub API',
      status: 500,
      provider: 'github',
    };
  }

  return {
    data: transformFileContentResult(result.data, query),
    status: 200,
    provider: 'github',
  };
}

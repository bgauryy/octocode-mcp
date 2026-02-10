/**
 * GitHub File Content Operations
 * Orchestrates fetching and processing file content from GitHub repositories.
 * Split into focused modules:
 *   - fileContentRaw.ts: raw API fetching, branch fallback, base64 decode
 *   - fileContentProcess.ts: line extraction, match search, sanitization, minification
 */
import type { GitHubAPIResponse } from './githubAPI';
import type {
  FileContentQuery,
  ContentResult,
} from '../tools/github_fetch_content/types.js';
import { getOctokit } from './client';
import { generateCacheKey, withDataCache } from '../utils/http/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

// Re-export from split modules
export {
  clearDefaultBranchCache,
  type RawContentResult,
} from './fileContentRaw.js';
import {
  fetchRawGitHubFileContent,
  type RawContentResult,
} from './fileContentRaw.js';
import {
  applyContentPagination,
  fetchFileTimestamp,
  processFileContentAPI,
} from './fileContentProcess.js';

export async function fetchGitHubFileContentAPI(
  params: FileContentQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubAPIResponse<ContentResult>> {
  const cacheKey = generateCacheKey(
    'gh-api-file-content',
    {
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      branch: params.branch,
    },
    sessionId
  );

  const rawResult = await withDataCache<GitHubAPIResponse<RawContentResult>>(
    cacheKey,
    async () => {
      return await fetchRawGitHubFileContent(params, authInfo);
    },
    {
      shouldCache: (value: GitHubAPIResponse<RawContentResult>) =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  if (!('data' in rawResult) || !rawResult.data) {
    return rawResult as GitHubAPIResponse<ContentResult>;
  }

  const branchForProcessing =
    rawResult.data.branch || rawResult.data.resolvedRef || params.branch || '';

  const processedResult = await processFileContentAPI(
    rawResult.data.rawContent,
    params.owner,
    params.repo,
    branchForProcessing,
    params.path,
    params.fullContent || false,
    params.startLine,
    params.endLine,
    params.matchStringContextLines ?? 5,
    params.matchString
  );

  if ('error' in processedResult) {
    return {
      error: processedResult.error || 'Unknown error',
      status: 500,
      type: 'unknown' as const,
    };
  }

  if (!params.noTimestamp) {
    try {
      const octokit = await getOctokit(authInfo);
      const timestampInfo = await fetchFileTimestamp(
        octokit,
        params.owner,
        params.repo,
        params.path,
        params.branch
      );
      if (timestampInfo) {
        processedResult.lastModified = timestampInfo.lastModified;
        processedResult.lastModifiedBy = timestampInfo.lastModifiedBy;
      }
    } catch {
      // Ignore timestamp fetch errors
    }
  }

  if (processedResult.content) {
    const paginatedResult = applyContentPagination(
      processedResult,
      params.charOffset ?? 0,
      params.charLength
    );
    return {
      data: paginatedResult,
      status: 200,
    };
  }

  return {
    data: processedResult,
    status: 200,
  };
}

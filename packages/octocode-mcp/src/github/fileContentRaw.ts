/**
 * Raw GitHub file content fetching — handles API calls, branch fallback, base64 decoding.
 * Extracted from fileContent.ts to isolate the raw fetch logic.
 */
import { RequestError } from 'octokit';
import type { GetContentParameters, GitHubAPIResponse } from './githubAPI';
import type { FileContentQuery } from '../tools/github_fetch_content/types.js';
import type { GitHubApiFileItem } from '../tools/github_view_repo_structure/scheme.js';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { FILE_OPERATION_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import NodeCache from 'node-cache';

/** Raw content result for caching (before line/match processing) */
export interface RawContentResult {
  rawContent: string;
  branch?: string;
  resolvedRef: string;
}

const defaultBranchCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 600,
  useClones: false,
});

export function clearDefaultBranchCache(): void {
  defaultBranchCache.flushAll();
}

async function getDefaultBranch(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string
): Promise<string> {
  const cacheKey = `${owner}/${repo}`;
  const cached = defaultBranchCache.get<string>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const branch = repoInfo.data.default_branch || 'main';
    defaultBranchCache.set(cacheKey, branch);
    return branch;
  } catch {
    return 'main';
  }
}

/**
 * Fetch RAW file content from GitHub API (for caching)
 * Does NOT apply startLine/endLine/matchString processing - that's done post-cache
 */
export async function fetchRawGitHubFileContent(
  params: FileContentQuery,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<RawContentResult>> {
  try {
    const octokit = await getOctokit(authInfo);
    const { owner, repo, path: filePath, branch } = params;

    const contentParams: GetContentParameters = {
      owner,
      repo,
      path: filePath,
      ...(branch && { ref: branch }),
    };

    let result;
    let actualBranch = branch;
    try {
      result = await octokit.rest.repos.getContent(contentParams);
    } catch (error: unknown) {
      if (error instanceof RequestError && error.status === 404 && branch) {
        // Smart Fallback Logic
        const defaultBranch = await getDefaultBranch(octokit, owner, repo);

        const isCommonDefaultGuess = branch === 'main' || branch === 'master';

        if (isCommonDefaultGuess && branch !== defaultBranch) {
          try {
            result = await octokit.rest.repos.getContent({
              ...contentParams,
              ref: defaultBranch,
            });
            actualBranch = defaultBranch;
          } catch {
            throw error; // Fallback failed, throw original error
          }
        } else {
          const apiError = handleGitHubAPIError(error);
          const suggestion =
            branch === defaultBranch
              ? undefined
              : `Branch '${branch}' not found. Default branch is '${defaultBranch}'. Ask user: Do you want to get the file from '${defaultBranch}' instead?`;

          const pathSuggestions = await findPathSuggestions(
            octokit,
            owner,
            repo,
            filePath,
            branch || defaultBranch
          );

          if (pathSuggestions.length > 0) {
            const hint = `Did you mean: ${pathSuggestions.join(', ')}?`;
            apiError.hints = [...(apiError.hints || []), hint];
          }

          return {
            ...apiError,
            ...(suggestion && { scopesSuggestion: suggestion }),
          };
        }
      } else {
        if (error instanceof RequestError && error.status === 404) {
          const apiError = handleGitHubAPIError(error);
          const pathSuggestions = await findPathSuggestions(
            octokit,
            owner,
            repo,
            filePath,
            branch || 'main'
          );
          if (pathSuggestions.length > 0) {
            const hint = `Did you mean: ${pathSuggestions.join(', ')}?`;
            apiError.hints = [...(apiError.hints || []), hint];
          }
          return apiError;
        }

        throw error;
      }
    }

    const data = result.data;

    if (Array.isArray(data)) {
      await logSessionError(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        FILE_OPERATION_ERRORS.PATH_IS_DIRECTORY.code
      );
      return {
        error: FILE_OPERATION_ERRORS.PATH_IS_DIRECTORY.message(
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
        ),
        type: 'unknown' as const,
        status: 400,
      };
    }

    if ('content' in data && data.type === 'file') {
      const fileSize = data.size || 0;
      const MAX_FILE_SIZE = 300 * 1024;

      if (fileSize > MAX_FILE_SIZE) {
        const fileSizeKB = Math.round(fileSize / 1024);
        const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

        await logSessionError(
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          FILE_OPERATION_ERRORS.FILE_TOO_LARGE.code
        );
        return {
          error: FILE_OPERATION_ERRORS.FILE_TOO_LARGE.message(
            fileSizeKB,
            maxSizeKB,
            TOOL_NAMES.GITHUB_SEARCH_CODE
          ),
          type: 'unknown' as const,
          status: 413,
        };
      }

      if (!data.content) {
        await logSessionError(
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          FILE_OPERATION_ERRORS.FILE_EMPTY.code
        );
        return {
          error: FILE_OPERATION_ERRORS.FILE_EMPTY.message,
          type: 'unknown' as const,
          status: 404,
        };
      }

      const base64Content = data.content.replace(/\s/g, '');

      if (!base64Content) {
        await logSessionError(
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          FILE_OPERATION_ERRORS.FILE_EMPTY.code
        );
        return {
          error: FILE_OPERATION_ERRORS.FILE_EMPTY.message,
          type: 'unknown' as const,
          status: 404,
        };
      }

      let decodedContent: string;
      try {
        const buffer = Buffer.from(base64Content, 'base64');

        if (buffer.indexOf(0) !== -1) {
          await logSessionError(
            TOOL_NAMES.GITHUB_FETCH_CONTENT,
            FILE_OPERATION_ERRORS.BINARY_FILE.code
          );
          return {
            error: FILE_OPERATION_ERRORS.BINARY_FILE.message,
            type: 'unknown' as const,
            status: 415,
          };
        }

        decodedContent = buffer.toString('utf-8');
      } catch {
        await logSessionError(
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          FILE_OPERATION_ERRORS.DECODE_FAILED.code
        );
        return {
          error: FILE_OPERATION_ERRORS.DECODE_FAILED.message,
          type: 'unknown' as const,
          status: 422,
        };
      }

      return {
        data: {
          rawContent: decodedContent,
          // Only set branch when we know the actual branch name (not a SHA)
          branch: actualBranch || undefined,
          // resolvedRef is what was actually used to fetch - either the resolved branch or the original request
          resolvedRef: actualBranch || branch || 'HEAD',
        },
        status: 200,
      };
    }

    await logSessionError(
      TOOL_NAMES.GITHUB_FETCH_CONTENT,
      FILE_OPERATION_ERRORS.UNSUPPORTED_TYPE.code
    );
    return {
      error: FILE_OPERATION_ERRORS.UNSUPPORTED_TYPE.message(data.type),
      type: 'unknown' as const,
      status: 415,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return apiError;
  }
}

async function findPathSuggestions(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<string[]> {
  try {
    const parentPath = filePath.split('/').slice(0, -1).join('/');
    const targetName = filePath.split('/').pop();

    if (!targetName) return [];

    const parentContent = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: parentPath,
      ref: branch,
    });

    if (!Array.isArray(parentContent.data)) return [];

    const files = parentContent.data as GitHubApiFileItem[];
    const suggestions: string[] = [];

    // 1. Case insensitive match
    const caseMatch = files.find(
      f => f.name.toLowerCase() === targetName.toLowerCase()
    );
    if (caseMatch) suggestions.push(caseMatch.path);

    // 2. Common extensions (ts <-> js, tsx <-> jsx, etc)
    const nameNoExt = targetName.replace(/\.[^/.]+$/, '');
    const extMatches = files.filter(f => {
      if (f.name === targetName) return false;
      if (f.name.startsWith(nameNoExt + '.')) return true;
      return false;
    });

    extMatches.forEach(f => suggestions.push(f.path));

    return Array.from(new Set(suggestions)).slice(0, 3);
  } catch {
    return [];
  }
}

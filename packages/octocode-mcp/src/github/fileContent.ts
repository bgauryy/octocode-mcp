/**
 * GitHub File Content Operations
 * Handles fetching and processing file content from GitHub repositories
 */
import { RequestError } from 'octokit';
import type { GetContentParameters, GitHubAPIResponse } from './githubAPI';
import type { FileContentQuery, ContentResult } from '../types';
import type { GitHubApiFileItem } from '../scheme/github_view_repo_structure';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContent } from '../utils/minifier/index.js';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import { generateCacheKey, withDataCache } from '../utils/cache';
import {
  applyPagination,
  createPaginationInfo,
  generateGitHubPaginationHints,
} from '../utils/pagination/index.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { FILE_OPERATION_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

import NodeCache from 'node-cache';

/** Pagination constants for GitHub content fetching */
const GITHUB_PAGINATION = {
  /** Max chars before auto-pagination (~5K tokens) */
  MAX_CHARS_BEFORE_PAGINATION: 20000,
  /** Default page size in characters */
  DEFAULT_PAGE_SIZE: 20000,
  /** Chars per token estimate */
  CHARS_PER_TOKEN: 4,
} as const;

interface FileTimestampInfo {
  lastModified: string;
  lastModifiedBy: string;
}

/** Raw content result for caching (before line/match processing) */
interface RawContentResult {
  rawContent: string;
  branch?: string;
}

/**
 * Cache for default branch names with TTL.
 * TTL of 1 hour ensures we pick up branch changes reasonably quickly
 * while still providing good performance.
 */
const defaultBranchCache = new NodeCache({
  stdTTL: 3600, // 1 hour TTL
  checkperiod: 600, // Check for expired keys every 10 minutes
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
  if (cached !== undefined) {
    return cached;
  }
  try {
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const branch = repoInfo.data.default_branch || 'main';
    defaultBranchCache.set(cacheKey, branch);
    return branch;
  } catch {
    return 'main'; // Fallback default if we can't get it
  }
}

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

  const processedResult = await processFileContentAPI(
    rawResult.data.rawContent,
    params.owner,
    params.repo,
    rawResult.data.branch || params.branch || '',
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

/**
 * Fetch RAW file content from GitHub API (for caching)
 * Does NOT apply startLine/endLine/matchString processing - that's done post-cache
 */
async function fetchRawGitHubFileContent(
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

        // If user requested 'main' or 'master' but it's not the default, try the default
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
          branch: actualBranch || data.sha,
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

/**
 * Apply pagination to content result (post-cache operation)
 */
function applyContentPagination(
  data: ContentResult,
  charOffset: number,
  charLength?: number
): ContentResult {
  const content = data.content ?? '';
  const maxChars = charLength ?? GITHUB_PAGINATION.MAX_CHARS_BEFORE_PAGINATION;

  // Optimization: No pagination needed if content fits in one page and we are at start
  const totalBytes = Buffer.byteLength(content, 'utf-8');
  if (totalBytes <= maxChars && charOffset === 0) {
    return data;
  }

  const paginationMeta = applyPagination(content, charOffset, maxChars, {
    mode: 'bytes',
  });
  const paginationInfo = createPaginationInfo(paginationMeta);

  const paginationHints = generateGitHubPaginationHints(paginationInfo, {
    owner: data.owner ?? '',
    repo: data.repo ?? '',
    path: data.path ?? '',
    branch: data.branch,
  });

  return {
    ...data,
    content: paginationMeta.paginatedContent,
    contentLength: paginationMeta.paginatedContent.length,
    pagination: paginationInfo,
    hints: paginationHints,
  };
}

/**
 * Fetch the last modification timestamp for a file via commits API
 */
async function fetchFileTimestamp(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  path: string,
  branch?: string
): Promise<FileTimestampInfo | null> {
  try {
    const commits = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path,
      per_page: 1,
      ...(branch && { sha: branch }),
    });

    if (commits.data.length > 0) {
      const lastCommit = commits.data[0];
      const commitDate = lastCommit?.commit?.committer?.date;
      const authorName =
        lastCommit?.commit?.author?.name ||
        lastCommit?.author?.login ||
        'Unknown';

      return {
        lastModified: commitDate || 'Unknown',
        lastModifiedBy: authorName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function processFileContentAPI(
  decodedContent: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  fullContent: boolean,
  startLine?: number,
  endLine?: number,
  matchStringContextLines: number = 5,
  matchString?: string
): Promise<ContentResult> {
  const matchLocationsSet = new Set<string>();

  // IMPORTANT: Search on ORIGINAL content first, sanitize OUTPUT later
  // This prevents false "not found" when searching for patterns that get redacted
  const originalContent = decodedContent;
  const originalLines = originalContent.split('\n');
  const totalLines = originalLines.length;

  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;

  if (fullContent) {
    finalContent = decodedContent;
  } else if (matchString) {
    const matchingLines: number[] = [];

    // Search on ORIGINAL content (before sanitization) with case-insensitive option
    const searchLower = matchString.toLowerCase();
    for (let i = 0; i < originalLines.length; i++) {
      // Case-insensitive search for better UX
      if (originalLines[i]?.toLowerCase().includes(searchLower)) {
        matchingLines.push(i + 1);
      }
    }

    if (matchingLines.length === 0) {
      // Return success with matchNotFound flag - this is NOT an error,
      // just a normal scenario where the search pattern wasn't found
      return {
        owner,
        repo,
        path: filePath,
        content: '',
        contentLength: 0,
        branch,
        matchNotFound: true,
        searchedFor: matchString,
        hints: [
          `Pattern "${matchString}" not found in file. Try broader search or verify path.`,
        ],
      } as ContentResult;
    }

    const firstMatch = matchingLines[0]!;
    const matchStartLine = Math.max(1, firstMatch - matchStringContextLines);
    const matchEndLine = Math.min(
      totalLines,
      firstMatch + matchStringContextLines
    );

    startLine = matchStartLine;
    endLine = matchEndLine;

    // Extract from ORIGINAL content (before sanitization)
    const selectedLines = originalLines.slice(matchStartLine - 1, matchEndLine);
    finalContent = selectedLines.join('\n');

    actualStartLine = matchStartLine;
    actualEndLine = matchEndLine;
    isPartial = true;

    matchLocationsSet.add(
      `Found "${matchString}" on line ${firstMatch}${matchingLines.length > 1 ? ` (and ${matchingLines.length - 1} other locations)` : ''}`
    );
  } else if (startLine !== undefined || endLine !== undefined) {
    const effectiveStartLine = startLine || 1;

    const effectiveEndLine = endLine || totalLines;

    if (effectiveStartLine < 1 || effectiveStartLine > totalLines) {
      finalContent = decodedContent;
    } else if (effectiveEndLine < effectiveStartLine) {
      finalContent = decodedContent;
    } else {
      const adjustedStartLine = Math.max(1, effectiveStartLine);
      const adjustedEndLine = Math.min(totalLines, effectiveEndLine);

      // Extract from ORIGINAL content (before sanitization)
      const selectedLines = originalLines.slice(
        adjustedStartLine - 1,
        adjustedEndLine
      );

      actualStartLine = adjustedStartLine;
      actualEndLine = adjustedEndLine;
      isPartial = true;

      finalContent = selectedLines.join('\n');

      if (effectiveEndLine > totalLines) {
        matchLocationsSet.add(
          `Requested endLine ${effectiveEndLine} adjusted to ${totalLines} (file end)`
        );
      }
    }
  }

  // NOW sanitize the OUTPUT content (after extraction, before return)
  const sanitizationResult = ContentSanitizer.sanitizeContent(finalContent);
  finalContent = sanitizationResult.content;

  if (sanitizationResult.hasSecrets) {
    matchLocationsSet.add(
      `Secrets detected and redacted: ${sanitizationResult.secretsDetected.join(', ')}`
    );
  }
  if (sanitizationResult.warnings.length > 0) {
    sanitizationResult.warnings.forEach(warning =>
      matchLocationsSet.add(warning)
    );
  }

  const minifyResult = await minifyContent(finalContent, filePath);
  finalContent = minifyResult.content;
  const minificationFailed = minifyResult.failed;
  const minificationType = minifyResult.type;

  const matchLocations = Array.from(matchLocationsSet);

  return {
    owner,
    repo,
    path: filePath,
    contentLength: finalContent.length,
    content: finalContent,
    branch,
    ...(isPartial && {
      startLine: actualStartLine,
      endLine: actualEndLine,
      isPartial,
    }),
    minified: !minificationFailed,
    minificationFailed: minificationFailed,
    minificationType: minificationType,
    ...(matchLocations.length > 0 && {
      matchLocations,
    }),
  } as ContentResult;
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

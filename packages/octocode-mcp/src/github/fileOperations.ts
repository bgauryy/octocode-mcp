import { RequestError } from 'octokit';
import type { GetContentParameters, GitHubAPIResponse } from './githubAPI';
import type {
  FileContentQuery,
  ContentResult,
  GitHubViewRepoStructureQuery,
} from '../types';
import type {
  GitHubApiFileItem,
  GitHubRepositoryStructureResult,
  GitHubRepositoryStructureError,
} from '../scheme/github_view_repo_structure';
import { GITHUB_STRUCTURE_DEFAULTS as STRUCTURE_DEFAULTS } from '../scheme/github_view_repo_structure';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContent } from '../utils/minifier/index.js';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import { generateCacheKey, withDataCache } from '../utils/cache';
import {
  applyPagination,
  createPaginationInfo,
  generateGitHubPaginationHints,
  generateStructurePaginationHints,
} from '../utils/pagination/index.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreDir, shouldIgnoreFile } from '../utils/fileFilters';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { FILE_OPERATION_ERRORS, REPOSITORY_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

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

// Cache default branch per repo to avoid repeated API calls
const defaultBranchCache = new Map<string, string>();

export function clearDefaultBranchCache(): void {
  defaultBranchCache.clear();
}

async function getDefaultBranch(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string
): Promise<string> {
  const cacheKey = `${owner}/${repo}`;
  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
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
  // Cache key excludes charOffset/charLength - pagination is post-cache
  const cacheKey = generateCacheKey(
    'gh-api-file-content',
    {
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      branch: params.branch,
      ...(params.fullContent && { fullContent: params.fullContent }),
      startLine: params.startLine,
      endLine: params.endLine,
      matchString: params.matchString,
      matchStringContextLines: params.matchStringContextLines,
      noTimestamp: params.noTimestamp,
    },
    sessionId
  );

  const result = await withDataCache<GitHubAPIResponse<ContentResult>>(
    cacheKey,
    async () => {
      return await fetchGitHubFileContentAPIInternal(params, authInfo);
    },
    {
      shouldCache: (value: GitHubAPIResponse<ContentResult>) =>
        'data' in value && !(value as { error?: unknown }).error,
    }
  );

  // Apply pagination AFTER cache retrieval
  if ('data' in result && result.data && result.data.content) {
    const paginatedResult = applyContentPagination(
      result.data,
      params.charOffset ?? 0,
      params.charLength
    );
    return {
      ...result,
      data: paginatedResult,
    };
  }

  return result;
}

async function fetchGitHubFileContentAPIInternal(
  params: FileContentQuery,
  authInfo?: AuthInfo
): Promise<GitHubAPIResponse<ContentResult>> {
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
          } catch {
            throw error; // Fallback failed, throw original error
          }
        } else {
          const apiError = handleGitHubAPIError(error);
          const suggestion =
            branch === defaultBranch
              ? undefined
              : `Branch '${branch}' not found. Default branch is '${defaultBranch}'. Ask user: Do you want to get the file from '${defaultBranch}' instead?`;

          // Check for similar files in parent directory
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
        // Check for similar files in parent directory for non-branch 404s (e.g. wrong path on valid branch)
        if (error instanceof RequestError && error.status === 404) {
          const apiError = handleGitHubAPIError(error);
          const pathSuggestions = await findPathSuggestions(
            octokit,
            owner,
            repo,
            filePath,
            branch || 'main' // fallback if undefined
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

      const result = await processFileContentAPI(
        decodedContent,
        owner,
        repo,
        branch || data.sha,
        filePath,
        params.fullContent || false,
        params.startLine,
        params.endLine,
        params.matchStringContextLines ?? 5,
        params.matchString
      );

      if ('error' in result) {
        return {
          error: result.error || 'Unknown error',
          status: 500,
          type: 'unknown' as const,
        };
      }

      if (!params.noTimestamp) {
        const timestampInfo = await fetchFileTimestamp(
          octokit,
          owner,
          repo,
          filePath,
          branch
        );
        if (timestampInfo) {
          result.lastModified = timestampInfo.lastModified;
          result.lastModifiedBy = timestampInfo.lastModifiedBy;
        }
      }

      return {
        data: result,
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

  // Generate pagination hints
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
  const securityWarningsSet = new Set<string>();

  const sanitizationResult = ContentSanitizer.sanitizeContent(decodedContent);
  decodedContent = sanitizationResult.content;

  if (sanitizationResult.hasSecrets) {
    securityWarningsSet.add(
      `Secrets detected and redacted: ${sanitizationResult.secretsDetected.join(', ')}`
    );
  }
  if (sanitizationResult.warnings.length > 0) {
    sanitizationResult.warnings.forEach(warning =>
      securityWarningsSet.add(warning)
    );
  }
  const securityWarnings = Array.from(securityWarningsSet);

  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;

  const lines = decodedContent.split('\n');
  const totalLines = lines.length;

  if (fullContent) {
    finalContent = decodedContent;
  } else if (matchString) {
    const matchingLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(matchString)) {
        matchingLines.push(i + 1);
      }
    }

    if (matchingLines.length === 0) {
      await logSessionError(
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        FILE_OPERATION_ERRORS.MATCH_STRING_NOT_FOUND.code
      );
      return {
        error:
          FILE_OPERATION_ERRORS.MATCH_STRING_NOT_FOUND.message(matchString),
        hints: [
          FILE_OPERATION_ERRORS.MATCH_STRING_NOT_FOUND.message(matchString),
        ],
      };
    }

    const firstMatch = matchingLines[0]!;
    const matchStartLine = Math.max(1, firstMatch - matchStringContextLines);
    const matchEndLine = Math.min(
      totalLines,
      firstMatch + matchStringContextLines
    );

    startLine = matchStartLine;
    endLine = matchEndLine;

    const selectedLines = lines.slice(matchStartLine - 1, matchEndLine);
    finalContent = selectedLines.join('\n');

    actualStartLine = matchStartLine;
    actualEndLine = matchEndLine;
    isPartial = true;

    securityWarnings.push(
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

      const selectedLines = lines.slice(adjustedStartLine - 1, adjustedEndLine);

      actualStartLine = adjustedStartLine;
      actualEndLine = adjustedEndLine;
      isPartial = true;

      finalContent = selectedLines.join('\n');

      if (effectiveEndLine > totalLines) {
        securityWarnings.push(
          `Requested endLine ${effectiveEndLine} adjusted to ${totalLines} (file end)`
        );
      }
    }
  }

  const minifyResult = await minifyContent(finalContent, filePath);
  finalContent = minifyResult.content;
  const minificationFailed = minifyResult.failed;
  const minificationType = minifyResult.type;

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
    ...(securityWarnings.length > 0 && {
      securityWarnings,
    }),
  } as ContentResult;
}

export async function viewGitHubRepositoryStructureAPI(
  params: GitHubViewRepoStructureQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  const cacheKey = generateCacheKey('gh-repo-structure-api', params, sessionId);

  const result = await withDataCache<
    GitHubRepositoryStructureResult | GitHubRepositoryStructureError
  >(
    cacheKey,
    async () => {
      return await viewGitHubRepositoryStructureAPIInternal(params, authInfo);
    },
    {
      shouldCache: value => !('error' in value),
    }
  );

  return result;
}

async function viewGitHubRepositoryStructureAPIInternal(
  params: GitHubViewRepoStructureQuery,
  authInfo?: AuthInfo
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  try {
    const octokit = await getOctokit(authInfo);
    const { owner, repo, branch, path = '', depth = 1 } = params;

    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    let result;
    let workingBranch = branch;
    try {
      result = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: cleanPath || undefined,
        ref: branch,
      });
    } catch (error: unknown) {
      if (error instanceof RequestError && error.status === 404) {
        let defaultBranch = 'main';
        try {
          const repoInfo = await octokit.rest.repos.get({ owner, repo });
          defaultBranch = repoInfo.data.default_branch || 'main';
        } catch (repoError) {
          const apiError = handleGitHubAPIError(repoError);
          await logSessionError(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            REPOSITORY_ERRORS.NOT_FOUND.code
          );
          return {
            error: REPOSITORY_ERRORS.NOT_FOUND.message(
              owner,
              repo,
              apiError.error
            ),
            status: apiError.status,
          };
        }

        if (defaultBranch !== branch) {
          try {
            result = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: cleanPath || undefined,
              ref: defaultBranch,
            });
            workingBranch = defaultBranch;
          } catch {
            const commonBranches = ['main', 'master', 'develop'];
            let foundBranch = null;

            for (const tryBranch of commonBranches) {
              if (tryBranch === branch || tryBranch === defaultBranch) continue;

              try {
                result = await octokit.rest.repos.getContent({
                  owner,
                  repo,
                  path: cleanPath || undefined,
                  ref: tryBranch,
                });
                foundBranch = tryBranch;
                workingBranch = tryBranch;
                break;
                // eslint-disable-next-line no-empty
              } catch {}
            }

            if (!foundBranch) {
              const apiError = handleGitHubAPIError(error);
              await logSessionError(
                TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
                REPOSITORY_ERRORS.PATH_NOT_FOUND_ANY_BRANCH.code
              );
              return {
                error: REPOSITORY_ERRORS.PATH_NOT_FOUND_ANY_BRANCH.message(
                  cleanPath,
                  owner,
                  repo
                ),
                status: apiError.status,
                triedBranches: [branch, defaultBranch, ...commonBranches],
                defaultBranch,
              };
            }
          }
        } else {
          const apiError = handleGitHubAPIError(error);
          await logSessionError(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            REPOSITORY_ERRORS.PATH_NOT_FOUND.code
          );
          return {
            error: REPOSITORY_ERRORS.PATH_NOT_FOUND.message(
              cleanPath,
              owner,
              repo,
              branch
            ),
            status: apiError.status,
          };
        }
      } else {
        const apiError = handleGitHubAPIError(error);
        await logSessionError(
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
          REPOSITORY_ERRORS.ACCESS_FAILED.code
        );
        return {
          error: REPOSITORY_ERRORS.ACCESS_FAILED.message(
            owner,
            repo,
            apiError.error
          ),
          status: apiError.status,
          rateLimitRemaining: apiError.rateLimitRemaining,
          rateLimitReset: apiError.rateLimitReset,
        };
      }
    }

    const items = Array.isArray(result.data) ? result.data : [result.data];

    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    let allItems = apiItems;
    if (depth > 1) {
      const recursiveItems = await fetchDirectoryContentsRecursivelyAPI(
        octokit,
        owner,
        repo,
        workingBranch,
        cleanPath,
        1,
        depth
      );

      const combinedItems = [...apiItems, ...recursiveItems];
      allItems = combinedItems.filter(
        (item, index, array) =>
          array.findIndex(i => i.path === item.path) === index
      );
    }

    const filteredItems = allItems.filter(item => {
      if (item.type === 'dir') {
        return !shouldIgnoreDir(item.name);
      }
      return !shouldIgnoreFile(item.path);
    });

    // Sort all items first for consistent pagination
    filteredItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }

      const aDepth = a.path.split('/').length;
      const bDepth = b.path.split('/').length;

      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }

      return a.path.localeCompare(b.path);
    });

    // Apply pagination
    const entriesPerPage =
      params.entriesPerPage ?? STRUCTURE_DEFAULTS.ENTRIES_PER_PAGE;
    const entryPageNumber = params.entryPageNumber ?? 1;
    const totalEntries = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
    const startIdx = (entryPageNumber - 1) * entriesPerPage;
    const endIdx = Math.min(startIdx + entriesPerPage, totalEntries);

    const paginatedItems = filteredItems.slice(startIdx, endIdx);

    const structure: Record<string, { files: string[]; folders: string[] }> =
      {};
    const basePath = cleanPath || '';

    const getRelativeParent = (itemPath: string): string => {
      let relativePath = itemPath;
      if (basePath && itemPath.startsWith(basePath)) {
        relativePath = itemPath.slice(basePath.length);
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }
      }

      const lastSlash = relativePath.lastIndexOf('/');
      if (lastSlash === -1) {
        return '.'; // Root level
      }
      return relativePath.slice(0, lastSlash);
    };

    const getItemName = (itemPath: string): string => {
      const lastSlash = itemPath.lastIndexOf('/');
      return lastSlash === -1 ? itemPath : itemPath.slice(lastSlash + 1);
    };

    for (const item of paginatedItems) {
      const parentDir = getRelativeParent(item.path);

      if (!structure[parentDir]) {
        structure[parentDir] = { files: [], folders: [] };
      }

      const itemName = getItemName(item.path);
      if (item.type === 'file') {
        structure[parentDir].files.push(itemName);
      } else {
        structure[parentDir].folders.push(itemName);
      }
    }

    for (const dir of Object.keys(structure)) {
      structure[dir]!.files.sort();
      structure[dir]!.folders.sort();
    }

    const sortedStructure: Record<
      string,
      { files: string[]; folders: string[] }
    > = {};
    const sortedKeys = Object.keys(structure).sort((a, b) => {
      if (a === '.') return -1;
      if (b === '.') return 1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      sortedStructure[key] = structure[key]!;
    }

    const pageFiles = paginatedItems.filter(i => i.type === 'file').length;
    const pageFolders = paginatedItems.filter(i => i.type === 'dir').length;
    const allFiles = filteredItems.filter(i => i.type === 'file').length;
    const allFolders = filteredItems.filter(i => i.type === 'dir').length;

    // Build pagination info
    const hasMore = entryPageNumber < totalPages;
    const paginationInfo = {
      currentPage: entryPageNumber,
      totalPages,
      hasMore,
      entriesPerPage,
      totalEntries,
    };

    // Generate pagination hints
    const hints = generateStructurePaginationHints(paginationInfo, {
      owner,
      repo,
      branch: workingBranch,
      path: cleanPath,
      depth,
      pageFiles,
      pageFolders,
      allFiles,
      allFolders,
    });

    return {
      owner,
      repo,
      branch: workingBranch,
      path: cleanPath || '/',
      apiSource: true,
      summary: {
        totalFiles: allFiles,
        totalFolders: allFolders,
        truncated: hasMore,
        filtered: true,
        originalCount: filteredItems.length,
      },
      structure: sortedStructure,
      pagination: paginationInfo,
      hints,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    await logSessionError(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      REPOSITORY_ERRORS.STRUCTURE_EXPLORATION_FAILED.code
    );
    return {
      error: REPOSITORY_ERRORS.STRUCTURE_EXPLORATION_FAILED.message,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
    };
  }
}

/**
 * Recursively fetch directory contents using API
 */
async function fetchDirectoryContentsRecursivelyAPI(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string> = new Set()
): Promise<GitHubApiFileItem[]> {
  if (currentDepth > maxDepth || visitedPaths.has(path)) {
    return [];
  }

  visitedPaths.add(path);

  try {
    const result = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: path || undefined,
      ref: branch,
    });

    const items = Array.isArray(result.data) ? result.data : [result.data];
    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    const allItems: GitHubApiFileItem[] = [...apiItems];

    if (currentDepth < maxDepth) {
      const directories = apiItems.filter(item => item.type === 'dir');

      const concurrencyLimit = 3;
      for (let i = 0; i < directories.length; i += concurrencyLimit) {
        const batch = directories.slice(i, i + concurrencyLimit);

        const promises = batch.map(async dir => {
          try {
            const subItems = await fetchDirectoryContentsRecursivelyAPI(
              octokit,
              owner,
              repo,
              branch,
              dir.path,
              currentDepth + 1,
              maxDepth,
              visitedPaths // Pass reference, not copy
            );
            return subItems;
          } catch {
            return [];
          }
        });

        const results = await Promise.all(promises);
        results.forEach(subItems => {
          allItems.push(...subItems);
        });
      }
    }

    return allItems;
  } catch {
    return [];
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

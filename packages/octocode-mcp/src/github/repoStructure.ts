/**
 * GitHub Repository Structure Operations
 * Handles viewing and navigating repository directory structures
 */
import { RequestError } from 'octokit';
import type { GitHubViewRepoStructureQuery } from '../types';
import type {
  GitHubApiFileItem,
  GitHubRepositoryStructureResult,
  GitHubRepositoryStructureError,
} from '../scheme/github_view_repo_structure';
import { GITHUB_STRUCTURE_DEFAULTS as STRUCTURE_DEFAULTS } from '../scheme/github_view_repo_structure';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { generateStructurePaginationHints } from '../utils/pagination/index.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreDir, shouldIgnoreFile } from '../utils/fileFilters';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { REPOSITORY_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

/**
 * Apply pagination to cached structure result
 * Rebuilds structure from cached items based on pagination params
 */
function applyStructurePagination(
  cachedResult: GitHubRepositoryStructureResult,
  params: GitHubViewRepoStructureQuery
): GitHubRepositoryStructureResult {
  const cachedItems = cachedResult._cachedItems;

  if (!cachedItems || cachedItems.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _cachedItems, ...result } = cachedResult;
    return result;
  }

  const entriesPerPage =
    params.entriesPerPage ?? STRUCTURE_DEFAULTS.ENTRIES_PER_PAGE;
  const entryPageNumber = params.entryPageNumber ?? 1;
  const totalEntries = cachedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
  const startIdx = (entryPageNumber - 1) * entriesPerPage;
  const endIdx = Math.min(startIdx + entriesPerPage, totalEntries);

  const paginatedItems = cachedItems.slice(startIdx, endIdx);

  const structure: Record<string, { files: string[]; folders: string[] }> = {};
  const basePath = cachedResult.path === '/' ? '' : cachedResult.path;

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
  const allFiles = cachedItems.filter(i => i.type === 'file').length;
  const allFolders = cachedItems.filter(i => i.type === 'dir').length;

  const hasMore = entryPageNumber < totalPages;
  const paginationInfo = {
    currentPage: entryPageNumber,
    totalPages,
    hasMore,
    entriesPerPage,
    totalEntries,
  };

  const hints = generateStructurePaginationHints(paginationInfo, {
    owner: cachedResult.owner,
    repo: cachedResult.repo,
    branch: cachedResult.branch,
    path: basePath,
    depth: params.depth ?? 1,
    pageFiles,
    pageFolders,
    allFiles,
    allFolders,
  });

  return {
    owner: cachedResult.owner,
    repo: cachedResult.repo,
    branch: cachedResult.branch,
    path: cachedResult.path,
    apiSource: cachedResult.apiSource,
    summary: {
      totalFiles: allFiles,
      totalFolders: allFolders,
      truncated: hasMore,
      filtered: true,
      originalCount: totalEntries,
    },
    structure: sortedStructure,
    pagination: paginationInfo,
    hints,
  };
}

export async function viewGitHubRepositoryStructureAPI(
  params: GitHubViewRepoStructureQuery,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  const cacheKey = generateCacheKey(
    'gh-repo-structure-api',
    {
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      path: params.path,
      depth: params.depth,
    },
    sessionId
  );

  const result = await withDataCache<
    GitHubRepositoryStructureResult | GitHubRepositoryStructureError
  >(
    cacheKey,
    async () => {
      return await viewGitHubRepositoryStructureAPIInternal(
        { ...params, entriesPerPage: undefined, entryPageNumber: undefined },
        authInfo
      );
    },
    {
      shouldCache: value => !('error' in value),
    }
  );

  if (!('error' in result) && result.structure) {
    return applyStructurePagination(result, params);
  }

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

    const hasMore = entryPageNumber < totalPages;
    const paginationInfo = {
      currentPage: entryPageNumber,
      totalPages,
      hasMore,
      entriesPerPage,
      totalEntries,
    };

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

    const noPaginationRequested =
      params.entriesPerPage === undefined &&
      params.entryPageNumber === undefined;

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
      // Include cached items for post-cache pagination
      ...(noPaginationRequested && {
        _cachedItems: filteredItems.map(item => ({
          path: item.path,
          type: item.type as 'file' | 'dir',
        })),
      }),
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

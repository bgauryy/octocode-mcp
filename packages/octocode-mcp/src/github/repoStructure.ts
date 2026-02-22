/**
 * GitHub Repository Structure Operations
 * Orchestrates viewing and navigating repository directory structures.
 * Split into focused modules:
 *   - repoStructurePagination.ts: post-cache pagination application
 *   - repoStructureRecursive.ts: recursive directory content fetching
 */
import { RequestError } from 'octokit';
import type { GitHubViewRepoStructureQuery } from '../tools/github_view_repo_structure/types.js';
import type {
  GitHubApiFileItem,
  GitHubRepositoryStructureResult,
  GitHubRepositoryStructureError,
} from '../tools/github_view_repo_structure/scheme.js';
import { GITHUB_STRUCTURE_DEFAULTS as STRUCTURE_DEFAULTS } from '../tools/github_view_repo_structure/scheme.js';
import { getOctokit, resolveDefaultBranch } from './client';
import { handleGitHubAPIError } from './errors';
import { generateCacheKey, withDataCache } from '../utils/http/cache';
import { generateStructurePaginationHints } from '../utils/pagination/index.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { shouldIgnoreDir, shouldIgnoreFile } from '../utils/file/filters';
import { TOOL_NAMES } from '../tools/toolMetadata/index.js';
import { REPOSITORY_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

import { applyStructurePagination } from './repoStructurePagination.js';
import { fetchDirectoryContentsRecursivelyAPI } from './repoStructureRecursive.js';

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

    const cleanPath = path.replace(/^\/+|\/+$/g, '');

    let result;
    let workingBranch = branch;
    let repoDefaultBranch: string | undefined;
    try {
      result = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: cleanPath || undefined,
        ref: branch,
      });
    } catch (error: unknown) {
      if (error instanceof RequestError && error.status === 404) {
        let defaultBranch: string;
        try {
          defaultBranch = await resolveDefaultBranch(owner, repo, authInfo);
          repoDefaultBranch = defaultBranch;
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
              } catch {
                // Branch not found - try next one in the list
              }
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
        return '.';
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
      const entry = structure[dir];
      if (entry) {
        entry.files.sort();
        entry.folders.sort();
      }
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
      const entry = structure[key];
      if (entry) {
        sortedStructure[key] = entry;
      }
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
      ...(repoDefaultBranch !== undefined && {
        defaultBranch: repoDefaultBranch,
      }),
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

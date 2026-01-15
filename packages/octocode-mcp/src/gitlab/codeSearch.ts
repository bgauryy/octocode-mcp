/**
 * GitLab Code Search
 *
 * Search for code within GitLab projects.
 * Note: Global/group search requires GitLab Premium.
 *
 * @module gitlab/codeSearch
 */

import type {
  GitLabAPIResponse,
  GitLabCodeSearchQuery,
  GitLabCodeSearchResult,
  GitLabCodeSearchItem,
} from './types.js';
import { getGitlab } from './client.js';
import { handleGitLabAPIError, createGitLabError } from './errors.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

// ============================================================================
// CODE SEARCH
// ============================================================================

/**
 * Search for code in GitLab.
 *
 * @param params - Search parameters
 * @param sessionId - Optional session ID for caching
 * @returns Search results
 */
export async function searchGitLabCodeAPI(
  params: GitLabCodeSearchQuery,
  sessionId?: string
): Promise<GitLabAPIResponse<GitLabCodeSearchResult>> {
  // Validate required parameters
  if (!params.search || !params.search.trim()) {
    return createGitLabError('Search query is required', 400);
  }

  if (!params.projectId && !params.groupId) {
    return createGitLabError(
      'Project ID or Group ID is required for GitLab code search',
      400,
      ['Global code search requires GitLab Premium tier.']
    );
  }

  // Generate cache key
  const cacheKey = generateCacheKey(
    'gl-api-code',
    {
      search: params.search,
      projectId: params.projectId,
      groupId: params.groupId,
      path: params.path,
      filename: params.filename,
      extension: params.extension,
      ref: params.ref,
      perPage: params.perPage,
      page: params.page,
    },
    sessionId
  );

  return withDataCache<GitLabAPIResponse<GitLabCodeSearchResult>>(
    cacheKey,
    async () => searchGitLabCodeAPIInternal(params),
    {
      shouldCache: value => 'data' in value && !('error' in value),
    }
  );
}

async function searchGitLabCodeAPIInternal(
  params: GitLabCodeSearchQuery
): Promise<GitLabAPIResponse<GitLabCodeSearchResult>> {
  try {
    const gitlab = await getGitlab();

    const perPage = Math.min(params.perPage || 20, 100);
    const page = params.page || 1;

    // Build search string with filters
    let searchQuery = params.search;

    if (params.path) {
      searchQuery += ` path:${params.path}`;
    }
    if (params.filename) {
      searchQuery += ` filename:${params.filename}`;
    }
    if (params.extension) {
      searchQuery += ` extension:${params.extension}`;
    }

    let items: GitLabCodeSearchItem[];

    // Type assertion for Search API which is not fully typed in gitbeaker
    type SearchAPI = {
      all: (
        scope: string,
        query: string,
        options: Record<string, unknown>
      ) => Promise<unknown>;
    };
    const search = (gitlab as unknown as { Search: SearchAPI }).Search;

    if (params.projectId) {
      // Project-scoped search using the project search endpoint
      const results = await search.all('blobs', searchQuery, {
        projectId: params.projectId,
        ref: params.ref,
        perPage,
        page,
      });

      items = results as unknown as GitLabCodeSearchItem[];
    } else if (params.groupId) {
      // Group-scoped search (Premium)
      const results = await search.all('blobs', searchQuery, {
        groupId: params.groupId,
        perPage,
        page,
      });

      items = results as unknown as GitLabCodeSearchItem[];
    } else {
      // Global search (Premium)
      const results = await search.all('blobs', searchQuery, {
        perPage,
        page,
      });

      items = results as unknown as GitLabCodeSearchItem[];
    }

    // Check if we have more results
    const hasMore = items.length === perPage;

    return {
      data: {
        items,
        totalCount: items.length,
        pagination: {
          currentPage: page,
          totalPages: hasMore ? page + 1 : page,
          perPage,
          hasMore,
        },
      },
      status: 200,
    };
  } catch (error) {
    return handleGitLabAPIError(error);
  }
}

/**
 * Transform GitLab code search results to unified format.
 */
export function transformGitLabCodeSearchItem(
  item: GitLabCodeSearchItem,
  projectPath?: string
): {
  path: string;
  content: string;
  lineNumber: number;
  repository: {
    id: string;
    name: string;
  };
} {
  return {
    path: item.path,
    content: item.data,
    lineNumber: item.startline,
    repository: {
      id: String(item.project_id),
      name: projectPath || String(item.project_id),
    },
  };
}

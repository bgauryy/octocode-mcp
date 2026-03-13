/**
 * Bitbucket Code Search
 *
 * Search for code within a Bitbucket workspace.
 * Bitbucket scopes code search to workspace level, not individual repos.
 *
 * @module bitbucket/codeSearch
 */

import { getBitbucketClient } from './client.js';
import { handleBitbucketAPIError, createBitbucketError } from './errors.js';
import type {
  BitbucketAPIResponse,
  BitbucketCodeSearchResult,
  BitbucketCodeSearchItem,
} from './types.js';
import { getBitbucketRepositoryIdentity } from './searchUtils.js';

export interface BitbucketCodeSearchQuery {
  workspace: string;
  repoSlug?: string;
  searchQuery: string;
  path?: string;
  filename?: string;
  extension?: string;
  page?: number;
  limit?: number;
}

function quoteSearchModifier(
  value: string,
  forceQuote: boolean = false
): string {
  return forceQuote || /[\s"]/u.test(value)
    ? `"${value.replaceAll('"', '\\"')}"`
    : value;
}

function buildSearchQuery(params: BitbucketCodeSearchQuery): string {
  const queryParts = [params.searchQuery.trim()];

  if (params.repoSlug) {
    queryParts.push(`repo:${quoteSearchModifier(params.repoSlug)}`);
  }

  if (params.path) {
    queryParts.push(`path:${quoteSearchModifier(params.path, true)}`);
  }

  return queryParts.join(' ');
}

function filterSearchResults(
  items: BitbucketCodeSearchItem[],
  params: BitbucketCodeSearchQuery
): BitbucketCodeSearchItem[] {
  return items.filter(item => {
    const filePath = item.file?.path || '';
    const fileName = filePath.split('/').pop() || '';
    const repositoryIdentity = getBitbucketRepositoryIdentity(item);

    if (
      params.repoSlug &&
      repositoryIdentity &&
      repositoryIdentity.repoSlug !== params.repoSlug
    ) {
      return false;
    }

    if (params.path && !filePath.startsWith(params.path)) {
      return false;
    }

    if (params.filename && fileName !== params.filename) {
      return false;
    }

    if (params.extension && !fileName.endsWith(`.${params.extension}`)) {
      return false;
    }

    return true;
  });
}

export async function searchBitbucketCodeAPI(
  params: BitbucketCodeSearchQuery
): Promise<BitbucketAPIResponse<BitbucketCodeSearchResult>> {
  if (!params.workspace) {
    return createBitbucketError(
      'Workspace is required for Bitbucket code search. Provide a projectId in the format "workspace/repo_slug".',
      400,
      [
        'Bitbucket code search is scoped to a workspace.',
        'Provide owner parameter as "workspace" or projectId as "workspace/repo".',
      ]
    );
  }

  if (!params.searchQuery?.trim()) {
    return createBitbucketError('Search query is required.', 400);
  }

  try {
    const client = getBitbucketClient();

    const queryParams = {
      search_query: buildSearchQuery(params),
      page: params.page || 1,
      pagelen: params.limit || 20,
    };
    const { data } = await client.GET('/workspaces/{workspace}/search/code', {
      params: {
        path: { workspace: params.workspace },
        query: queryParams as typeof queryParams & Record<string, string>,
      },
    });

    const rawValues = (data as Record<string, unknown>)?.values;
    const values = Array.isArray(rawValues) ? rawValues : [];
    const rawSize = (data as Record<string, unknown>)?.size;
    const size = typeof rawSize === 'number' ? rawSize : values.length;
    const rawNext = (data as Record<string, unknown>)?.next;
    const next = typeof rawNext === 'string' ? rawNext : undefined;
    const rawPage = (data as Record<string, unknown>)?.page;
    const page = typeof rawPage === 'number' ? rawPage : params.page || 1;
    const pagelen = params.limit || 20;

    let items: BitbucketCodeSearchItem[] = values.map(
      (item: Record<string, unknown>) => {
        const file = (item.file || {}) as Record<string, unknown>;
        const contentMatches = Array.isArray(item.content_matches)
          ? item.content_matches
          : [];
        const pathMatches = Array.isArray(item.path_matches)
          ? item.path_matches
          : [];

        return {
          type: String(item.type || ''),
          content_matches: contentMatches,
          path_matches: pathMatches.length > 0 ? pathMatches : undefined,
          file: {
            path: String(file.path || ''),
            type: String(file.type || ''),
            links: file.links as BitbucketCodeSearchItem['file']['links'],
          },
        };
      }
    );

    items = filterSearchResults(items, params);

    return {
      data: {
        items,
        totalCount: size,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(size / pagelen),
          hasMore: !!next,
          totalMatches: size,
        },
      },
      status: 200,
    };
  } catch (error) {
    return handleBitbucketAPIError(
      error
    ) as BitbucketAPIResponse<BitbucketCodeSearchResult>;
  }
}

/**
 * GitLab Code Search and Repository Search
 *
 * Extracted from GitLabProvider for better modularity.
 *
 * @module providers/gitlab/gitlabSearch
 */

import type {
  ProviderResponse,
  CodeSearchQuery,
  CodeSearchResult,
  CodeSearchItem,
  RepoSearchQuery,
  RepoSearchResult,
  UnifiedRepository,
} from '../types.js';

import { searchGitLabCodeAPI } from '../../gitlab/codeSearch.js';
import { searchGitLabProjectsAPI } from '../../gitlab/projectsSearch.js';

import type {
  GitLabCodeSearchItem,
  GitLabProject,
} from '../../gitlab/types.js';

interface GitLabPaginationData {
  currentPage?: number;
  totalPages?: number;
  hasMore?: boolean;
  totalMatches?: number;
}

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
 * Transform GitLab code search result to unified format.
 */
export function transformCodeSearchResult(
  items: GitLabCodeSearchItem[],
  query: CodeSearchQuery
): CodeSearchResult {
  const transformedItems: CodeSearchItem[] = items.map(item => ({
    path: item.path,
    matches: [
      {
        context: item.data,
        positions: [] as [number, number][],
      },
    ],
    url: '', // GitLab code search doesn't return URL directly
    repository: {
      id: String(item.project_id),
      name: String(item.project_id),
      url: '',
    },
  }));

  return {
    items: transformedItems,
    totalCount: items.length,
    pagination: {
      currentPage: query.page || 1,
      totalPages: 1,
      hasMore: items.length === (query.limit || 20),
    },
  };
}

/**
 * Transform GitLab repo search result to unified format.
 */
export function transformRepoSearchResult(
  projects: GitLabProject[],
  pagination: GitLabPaginationData | undefined
): RepoSearchResult {
  const repositories: UnifiedRepository[] = projects.map(project => ({
    id: String(project.id),
    name: project.name,
    fullPath: project.path_with_namespace,
    description: project.description,
    url: project.web_url,
    cloneUrl: project.http_url_to_repo,
    defaultBranch: project.default_branch,
    stars: project.star_count,
    forks: project.forks_count,
    visibility: project.visibility,
    topics: project.topics || project.tag_list || [],
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    lastActivityAt: project.last_activity_at,
    openIssuesCount: project.open_issues_count,
    archived: project.archived,
  }));

  return {
    repositories,
    totalCount: pagination?.totalMatches || repositories.length,
    pagination: {
      currentPage: pagination?.currentPage || 1,
      totalPages: pagination?.totalPages || 1,
      hasMore: pagination?.hasMore || false,
      totalMatches: pagination?.totalMatches,
    },
  };
}

/**
 * Map sort field to GitLab format.
 */
export function mapSortField(
  sort?: string
):
  | 'id'
  | 'name'
  | 'path'
  | 'created_at'
  | 'updated_at'
  | 'last_activity_at'
  | 'similarity'
  | 'star_count'
  | undefined {
  const mapping: Record<
    string,
    | 'id'
    | 'name'
    | 'path'
    | 'created_at'
    | 'updated_at'
    | 'last_activity_at'
    | 'similarity'
    | 'star_count'
  > = {
    stars: 'star_count',
    updated: 'updated_at',
    created: 'created_at',
  };
  return sort ? mapping[sort] : undefined;
}

/**
 * Search code on GitLab.
 */
export async function searchCode(
  query: CodeSearchQuery,
  parseProjectId: (projectId?: string) => number | string = parseGitLabProjectId
): Promise<ProviderResponse<CodeSearchResult>> {
  const projectId = parseProjectId(query.projectId);

  const gitlabQuery = {
    search: query.keywords.join(' '),
    projectId,
    path: query.path,
    filename: query.filename,
    extension: query.extension,
    ref: query.ref,
    perPage: query.limit,
    page: query.page,
  };

  const result = await searchGitLabCodeAPI(gitlabQuery);

  if ('error' in result && result.error) {
    return {
      error: result.error,
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
    data: transformCodeSearchResult(result.data.items, query),
    status: 200,
    provider: 'gitlab',
  };
}
/**
 * Search repositories on GitLab.
 */
export async function searchRepos(
  query: RepoSearchQuery,
  mapSortFieldFn: (
    sort?: string
  ) =>
    | 'id'
    | 'name'
    | 'path'
    | 'created_at'
    | 'updated_at'
    | 'last_activity_at'
    | 'similarity'
    | 'star_count'
    | undefined = mapSortField
): Promise<ProviderResponse<RepoSearchResult>> {
  const gitlabQuery = {
    search: query.keywords?.join(' '),
    topic: query.topics?.[0], // GitLab only supports single topic
    visibility: query.visibility,
    minStars: query.minStars,
    orderBy: mapSortFieldFn(query.sort),
    sort: query.order,
    perPage: query.limit,
    page: query.page,
  };

  const result = await searchGitLabProjectsAPI(gitlabQuery);

  if ('error' in result && result.error) {
    return {
      error: result.error,
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
    data: transformRepoSearchResult(
      result.data.projects,
      result.data.pagination
    ),
    status: 200,
    provider: 'gitlab',
  };
}

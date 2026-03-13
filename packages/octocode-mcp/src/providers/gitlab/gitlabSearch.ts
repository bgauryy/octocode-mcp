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
import {
  handleGitLabAPIResponse,
  mapGitLabRepoSortField,
  parseGitLabProjectId,
} from './utils.js';
export { mapGitLabRepoSortField as mapSortField, parseGitLabProjectId };

interface GitLabPaginationData {
  currentPage?: number;
  totalPages?: number;
  hasMore?: boolean;
  totalMatches?: number;
}

/**
 * Transform GitLab code search result to unified format.
 */
export function transformCodeSearchResult(
  items: GitLabCodeSearchItem[],
  query: CodeSearchQuery
): CodeSearchResult {
  const repositoryName =
    query.projectId && Number.isNaN(Number(query.projectId))
      ? query.projectId
      : undefined;

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
      name: repositoryName || String(item.project_id),
      url: '',
    },
  }));

  const repositoryContext =
    repositoryName && repositoryName.includes('/')
      ? {
          owner: repositoryName.substring(0, repositoryName.lastIndexOf('/')),
          repo: repositoryName.substring(repositoryName.lastIndexOf('/') + 1),
        }
      : undefined;

  return {
    items: transformedItems,
    totalCount: items.length,
    pagination: {
      currentPage: query.page || 1,
      totalPages: 1,
      hasMore: items.length === (query.limit || 20),
    },
    repositoryContext,
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
  return handleGitLabAPIResponse(result, 'gitlab', data =>
    transformCodeSearchResult(data.items, query)
  );
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
    | undefined = mapGitLabRepoSortField
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
  return handleGitLabAPIResponse(result, 'gitlab', data =>
    transformRepoSearchResult(data.projects, data.pagination)
  );
}

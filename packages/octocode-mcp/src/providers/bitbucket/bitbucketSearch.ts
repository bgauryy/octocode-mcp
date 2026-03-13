import type {
  CodeSearchItem,
  CodeSearchQuery,
  CodeSearchResult,
  ProviderResponse,
  RepoSearchQuery,
  RepoSearchResult,
  UnifiedRepository,
} from '../types.js';
import { searchBitbucketCodeAPI } from '../../bitbucket/codeSearch.js';
import { searchBitbucketReposAPI } from '../../bitbucket/repoSearch.js';
import type {
  BitbucketCodeSearchItem,
  BitbucketRepository,
} from '../../bitbucket/types.js';
import {
  formatBitbucketRepositoryIdentity,
  getBitbucketRepositoryIdentity,
} from '../../bitbucket/searchUtils.js';
import {
  handleBitbucketAPIResponse,
  parseBitbucketProjectId,
} from './utils.js';

function extractContextFromMatches(item: BitbucketCodeSearchItem): string {
  const lines: string[] = [];
  for (const match of item.content_matches || []) {
    for (const line of match.lines || []) {
      const text = (line.segments || []).map(s => s.text).join('');
      lines.push(text);
    }
  }
  return lines.join('\n');
}

function parseRepositoryName(
  item: BitbucketCodeSearchItem,
  query: CodeSearchQuery
): string {
  if (query.projectId) {
    return query.projectId;
  }

  return formatBitbucketRepositoryIdentity(
    getBitbucketRepositoryIdentity(item)
  );
}

export function transformCodeSearchResult(
  items: BitbucketCodeSearchItem[],
  query: CodeSearchQuery
): CodeSearchResult {
  const transformedItems: CodeSearchItem[] = items.map(item => {
    const repositoryName = parseRepositoryName(item, query);

    return {
      path: item.file.path,
      matches: [
        {
          context: extractContextFromMatches(item),
          positions: [] as [number, number][],
        },
      ],
      url: item.file.links?.self?.href || '',
      repository: {
        id: repositoryName,
        name: repositoryName,
        url: '',
      },
    };
  });

  const repositoryContext = query.projectId
    ? (() => {
        const parsed = parseBitbucketProjectId(query.projectId);
        return {
          owner: parsed.workspace,
          repo: parsed.repoSlug,
        };
      })()
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

export function transformRepoSearchResult(
  repos: BitbucketRepository[],
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches?: number;
  }
): RepoSearchResult {
  const repositories: UnifiedRepository[] = repos.map(repo => {
    const cloneLink = repo.links?.clone?.find(l => l.name === 'https');

    return {
      id: repo.uuid,
      name: repo.name,
      fullPath: repo.full_name,
      description: repo.description || '',
      url: repo.links?.html?.href || '',
      cloneUrl: cloneLink?.href || '',
      defaultBranch: repo.mainbranch?.name || 'main',
      stars: 0,
      forks: repo.forks_count || 0,
      visibility: repo.is_private ? 'private' : 'public',
      topics: [],
      createdAt: repo.created_on,
      updatedAt: repo.updated_on,
      lastActivityAt: repo.updated_on,
      archived: false,
    };
  });

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

export async function searchCode(
  query: CodeSearchQuery
): Promise<ProviderResponse<CodeSearchResult>> {
  let workspace = '';
  let repoSlug: string | undefined;

  if (query.projectId) {
    const parsed = parseBitbucketProjectId(query.projectId);
    workspace = parsed.workspace;
    repoSlug = parsed.repoSlug;
  }

  if (!workspace) {
    return {
      error:
        'Workspace is required for Bitbucket code search. Provide projectId as "workspace/repo_slug".',
      status: 400,
      provider: 'bitbucket',
      hints: [
        'Bitbucket code search is workspace-scoped.',
        'Use owner="workspace" or provide a full projectId.',
      ],
    };
  }

  const result = await searchBitbucketCodeAPI({
    workspace,
    repoSlug,
    searchQuery: query.keywords.join(' '),
    path: query.path,
    filename: query.filename,
    extension: query.extension,
    page: query.page,
    limit: query.limit,
  });

  return handleBitbucketAPIResponse(result, data =>
    transformCodeSearchResult(data.items, query)
  );
}

export async function searchRepos(
  query: RepoSearchQuery
): Promise<ProviderResponse<RepoSearchResult>> {
  const workspace = query.owner;

  if (!workspace) {
    return {
      error: 'Workspace (owner) is required for Bitbucket repository search.',
      status: 400,
      provider: 'bitbucket',
      hints: ['Provide the owner parameter as your Bitbucket workspace slug.'],
    };
  }

  const result = await searchBitbucketReposAPI({
    workspace,
    keywords: query.keywords,
    topics: query.topics,
    visibility: query.visibility,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  });

  return handleBitbucketAPIResponse(result, data =>
    transformRepoSearchResult(data.repositories, data.pagination)
  );
}

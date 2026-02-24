/**
 * Bitbucket Provider
 *
 * Implements the ICodeHostProvider interface for Bitbucket Cloud.
 * Calls Bitbucket API functions directly and transforms results to unified types.
 *
 * @module providers/bitbucket/BitbucketProvider
 */

import type {
  ICodeHostProvider,
  ProviderConfig,
  ProviderResponse,
  CodeSearchQuery,
  CodeSearchResult,
  CodeSearchItem,
  FileContentQuery,
  FileContentResult,
  RepoSearchQuery,
  RepoSearchResult,
  UnifiedRepository,
  PullRequestQuery,
  PullRequestSearchResult,
  PullRequestItem,
  RepoStructureQuery,
  RepoStructureResult,
  DirectoryEntry,
} from '../types.js';

import { searchBitbucketCodeAPI } from '../../bitbucket/codeSearch.js';
import { searchBitbucketReposAPI } from '../../bitbucket/repoSearch.js';
import {
  fetchBitbucketFileContentAPI,
  getBitbucketDefaultBranch,
} from '../../bitbucket/fileContent.js';
import { searchBitbucketPRsAPI } from '../../bitbucket/pullRequestSearch.js';
import { viewBitbucketRepoStructureAPI } from '../../bitbucket/repoStructure.js';
import { handleBitbucketAPIError } from '../../bitbucket/errors.js';
import type {
  BitbucketAPIError,
  BitbucketCodeSearchItem,
  BitbucketRepository,
  BitbucketPullRequest,
  BitbucketPRComment,
  BitbucketTreeEntry,
  BitbucketFileContentResult,
} from '../../bitbucket/types.js';
import { logRateLimit } from '../../session.js';

// ============================================================================
// PROJECT ID PARSING
// ============================================================================

interface BitbucketProjectId {
  workspace: string;
  repoSlug: string;
}

export function parseBitbucketProjectId(
  projectId?: string
): BitbucketProjectId {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const parts = projectId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid Bitbucket projectId: '${projectId}'. Expected 'workspace/repo_slug'.`
    );
  }

  return { workspace: parts[0], repoSlug: parts[1] };
}

// ============================================================================
// RESULT TRANSFORMERS
// ============================================================================

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

export function transformCodeSearchResult(
  items: BitbucketCodeSearchItem[],
  query: CodeSearchQuery
): CodeSearchResult {
  const transformedItems: CodeSearchItem[] = items.map(item => ({
    path: item.file.path,
    matches: [
      {
        context: extractContextFromMatches(item),
        positions: [] as [number, number][],
      },
    ],
    url: item.file.links?.self?.href || '',
    repository: {
      id: '',
      name: '',
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

export function transformFileContentResult(
  data: BitbucketFileContentResult,
  query: FileContentQuery
): FileContentResult {
  let content = data.content;

  if (query.startLine || query.endLine) {
    const lines = content.split('\n');
    const start = (query.startLine || 1) - 1;
    const end = query.endLine || lines.length;
    content = lines.slice(start, end).join('\n');
  }

  return {
    path: data.path || query.path,
    content,
    encoding: 'utf-8',
    size: data.size || 0,
    ref: data.ref || query.ref || '',
    lastCommitSha: data.lastCommitSha,
    pagination: undefined,
    isPartial: query.startLine !== undefined || query.endLine !== undefined,
    startLine: query.startLine,
    endLine: query.endLine,
  };
}

type BitbucketPRState = 'OPEN' | 'MERGED' | 'DECLINED' | undefined;

export function mapPRState(state?: string): BitbucketPRState {
  const mapping: Record<string, 'OPEN' | 'MERGED' | 'DECLINED'> = {
    open: 'OPEN',
    closed: 'DECLINED',
    merged: 'MERGED',
  };
  return state ? mapping[state] : undefined;
}

function mapUnifiedState(bbState: string): 'open' | 'closed' | 'merged' {
  if (bbState === 'MERGED') return 'merged';
  if (bbState === 'DECLINED' || bbState === 'SUPERSEDED') return 'closed';
  return 'open';
}

export function transformPullRequestResult(
  pullRequests: BitbucketPullRequest[],
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches?: number;
  },
  comments?: BitbucketPRComment[]
): PullRequestSearchResult {
  const items: PullRequestItem[] = pullRequests.map(pr => ({
    number: pr.id,
    title: pr.title,
    body: pr.description ?? null,
    url: pr.links?.html?.href || '',
    state: mapUnifiedState(pr.state),
    draft: false,
    author: pr.author?.username || pr.author?.display_name || '',
    assignees: [],
    labels: [],
    sourceBranch: pr.source?.branch?.name || '',
    targetBranch: pr.destination?.branch?.name || '',
    sourceSha: pr.source?.commit?.hash,
    targetSha: pr.destination?.commit?.hash,
    createdAt: pr.created_on || '',
    updatedAt: pr.updated_on || '',
    closedAt: undefined,
    mergedAt: pr.state === 'MERGED' ? pr.updated_on : undefined,
    commentsCount: pr.comment_count,
    comments: comments?.map(c => ({
      id: String(c.id),
      author: c.user?.username || c.user?.display_name || '',
      body: c.content?.raw || '',
      createdAt: c.created_on || '',
      updatedAt: c.updated_on || '',
    })),
  }));

  return {
    items,
    totalCount: pagination.totalMatches || items.length,
    pagination,
  };
}

function buildStructureFromEntries(
  entries: BitbucketTreeEntry[],
  basePath: string
): Record<string, DirectoryEntry> {
  const structure: Record<string, DirectoryEntry> = {};
  const normalizedBase = basePath === '' || basePath === '/' ? '' : basePath;

  const getRelativeParent = (itemPath: string): string => {
    let relativePath = itemPath;
    if (normalizedBase && itemPath.startsWith(normalizedBase)) {
      relativePath = itemPath.slice(normalizedBase.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }
    }
    const lastSlash = relativePath.lastIndexOf('/');
    return lastSlash === -1 ? '.' : relativePath.slice(0, lastSlash);
  };

  const getItemName = (itemPath: string): string => {
    const lastSlash = itemPath.lastIndexOf('/');
    return lastSlash === -1 ? itemPath : itemPath.slice(lastSlash + 1);
  };

  for (const entry of entries) {
    const parentDir = getRelativeParent(entry.path);
    if (!structure[parentDir]) {
      structure[parentDir] = { files: [], folders: [] };
    }
    const itemName = getItemName(entry.path);
    if (entry.type === 'commit_file') {
      structure[parentDir].files.push(itemName);
    } else {
      structure[parentDir].folders.push(itemName);
    }
  }

  return structure;
}

// ============================================================================
// API RESPONSE HANDLING
// ============================================================================

function handleAPIResponse<TData, TRaw>(
  result: { error?: string; status?: number; hints?: string[]; data?: TRaw },
  transform: (data: TRaw) => TData
): ProviderResponse<TData> {
  if ('error' in result && result.error) {
    return {
      error:
        typeof result.error === 'string' ? result.error : String(result.error),
      status: result.status || 500,
      provider: 'bitbucket',
      hints: 'hints' in result ? result.hints : undefined,
    };
  }

  if (!('data' in result) || !result.data) {
    return {
      error: 'No data returned from Bitbucket API',
      status: 500,
      provider: 'bitbucket',
    };
  }

  return {
    data: transform(result.data),
    status: 200,
    provider: 'bitbucket',
  };
}

// ============================================================================
// PROVIDER
// ============================================================================

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket' as const;

  constructor(_config?: ProviderConfig) {}

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
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
        page: query.page,
        limit: query.limit,
      });

      return handleAPIResponse(result, data =>
        transformCodeSearchResult(data.items, query)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      const { workspace, repoSlug } = parseBitbucketProjectId(query.projectId);

      let ref = query.ref;
      if (!ref) {
        ref = await getBitbucketDefaultBranch(workspace, repoSlug);
      }

      const result = await fetchBitbucketFileContentAPI({
        workspace,
        repoSlug,
        path: query.path,
        ref,
      });

      return handleAPIResponse(result, data =>
        transformFileContentResult(data, query)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    try {
      const workspace = query.owner;

      if (!workspace) {
        return {
          error:
            'Workspace (owner) is required for Bitbucket repository search.',
          status: 400,
          provider: 'bitbucket',
          hints: [
            'Provide the owner parameter as your Bitbucket workspace slug.',
          ],
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

      return handleAPIResponse(result, data =>
        transformRepoSearchResult(data.repositories, data.pagination)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      if (!query.projectId) {
        return {
          error:
            'Project ID (workspace/repo_slug) is required for Bitbucket PR search.',
          status: 400,
          provider: 'bitbucket',
        };
      }

      const { workspace, repoSlug } = parseBitbucketProjectId(query.projectId);

      const result = await searchBitbucketPRsAPI({
        workspace,
        repoSlug,
        prNumber: query.number,
        state: mapPRState(query.state),
        author: query.author,
        baseBranch: query.baseBranch,
        headBranch: query.headBranch,
        sort: query.sort,
        page: query.page,
        limit: query.limit,
        withComments: query.withComments,
        withDiff: query.type === 'fullContent',
        withDiffstat: query.type === 'partialContent',
      });

      return handleAPIResponse(result, data =>
        transformPullRequestResult(
          data.pullRequests,
          data.pagination,
          data.comments
        )
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      const { workspace, repoSlug } = parseBitbucketProjectId(query.projectId);

      const result = await viewBitbucketRepoStructureAPI({
        workspace,
        repoSlug,
        ref: query.ref,
        path: query.path,
        depth: query.depth,
        entriesPerPage: query.entriesPerPage,
        entryPageNumber: query.entryPageNumber,
      });

      return handleAPIResponse(result, data => {
        const structure = buildStructureFromEntries(data.entries, data.path);
        const totalFiles = data.entries.filter(
          e => e.type === 'commit_file'
        ).length;
        const totalFolders = data.entries.filter(
          e => e.type === 'commit_directory'
        ).length;

        return {
          projectPath: `${workspace}/${repoSlug}`,
          branch: data.branch,
          path: data.path || '',
          structure,
          summary: {
            totalFiles,
            totalFolders,
            truncated: data.pagination.hasMore,
          },
          pagination: data.pagination,
        };
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveDefaultBranch(projectId: string): Promise<string> {
    try {
      const { workspace, repoSlug } = parseBitbucketProjectId(projectId);
      return await getBitbucketDefaultBranch(workspace, repoSlug);
    } catch {
      return 'main';
    }
  }

  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleBitbucketAPIError(error);
    const rateLimit = this.extractRateLimit(apiError);

    if (rateLimit) {
      void logRateLimit({
        limit_type: 'primary',
        retry_after_seconds: rateLimit.retryAfter,
        rate_limit_remaining: rateLimit.remaining,
        rate_limit_reset_ms: rateLimit.reset * 1000,
        provider: 'bitbucket',
      });
    }

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'bitbucket',
      hints: apiError.hints,
      rateLimit,
    };
  }

  private extractRateLimit(
    apiError: BitbucketAPIError
  ): ProviderResponse<never>['rateLimit'] {
    if (
      apiError.rateLimitRemaining === undefined &&
      apiError.retryAfter === undefined &&
      apiError.rateLimitReset === undefined
    ) {
      return undefined;
    }

    return {
      remaining: apiError.rateLimitRemaining ?? 0,
      reset:
        apiError.rateLimitReset ??
        Math.floor(Date.now() / 1000) + (apiError.retryAfter ?? 60),
      retryAfter: apiError.retryAfter,
    };
  }
}

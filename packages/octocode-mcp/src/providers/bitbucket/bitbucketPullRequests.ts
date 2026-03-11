import type {
  ProviderResponse,
  PullRequestItem,
  PullRequestQuery,
  PullRequestSearchResult,
} from '../types.js';
import { searchBitbucketPRsAPI } from '../../bitbucket/pullRequestSearch.js';
import type {
  BitbucketPRComment,
  BitbucketPullRequest,
} from '../../bitbucket/types.js';
import {
  handleBitbucketAPIResponse,
  parseBitbucketProjectId,
} from './utils.js';

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

export async function searchPullRequests(
  query: PullRequestQuery
): Promise<ProviderResponse<PullRequestSearchResult>> {
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

  return handleBitbucketAPIResponse(result, data =>
    transformPullRequestResult(
      data.pullRequests,
      data.pagination,
      data.comments
    )
  );
}

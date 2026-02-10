/**
 * GitLab Merge Request Search
 *
 * Extracted from GitLabProvider for better modularity.
 *
 * @module providers/gitlab/gitlabPullRequests
 */

import type {
  ProviderResponse,
  PullRequestQuery,
  PullRequestSearchResult,
  PullRequestItem,
} from '../types.js';

import {
  searchGitLabMergeRequestsAPI,
  getGitLabMRNotes,
} from '../../gitlab/mergeRequests.js';

interface GitLabPaginationData {
  currentPage?: number;
  totalPages?: number;
  hasMore?: boolean;
  totalMatches?: number;
}

interface GitLabMRAssignee {
  username?: string;
}

interface GitLabMRNote {
  id: string | number;
  author?: { username?: string };
  body?: string;
  created_at?: string;
  updated_at?: string;
}

interface GitLabMRData {
  iid: number;
  title: string;
  description?: string;
  web_url: string;
  state: string;
  draft?: boolean;
  work_in_progress?: boolean;
  author?: { username?: string };
  assignees?: GitLabMRAssignee[];
  labels?: string[];
  source_branch: string;
  target_branch: string;
  diff_refs?: { head_sha?: string; base_sha?: string };
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  merged_at?: string;
  user_notes_count?: number;
  _notes?: GitLabMRNote[];
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
 * Map MR state to GitLab format.
 */
export function mapMRState(
  state?: string
): 'opened' | 'closed' | 'merged' | 'all' | undefined {
  const mapping: Record<string, 'opened' | 'closed' | 'merged' | 'all'> = {
    open: 'opened',
    closed: 'closed',
    merged: 'merged',
    all: 'all',
  };
  return state ? mapping[state] : undefined;
}

/**
 * Transform GitLab merge request result to unified format.
 */
export function transformPullRequestResult(
  mergeRequests: GitLabMRData[],
  pagination: GitLabPaginationData | undefined,
  _query: PullRequestQuery
): PullRequestSearchResult {
  const items: PullRequestItem[] = mergeRequests.map(mr => {
    // Map GitLab state to unified state
    let state: 'open' | 'closed' | 'merged';
    if (mr.state === 'merged') {
      state = 'merged';
    } else if (mr.state === 'closed') {
      state = 'closed';
    } else {
      state = 'open';
    }

    return {
      number: mr.iid,
      title: mr.title,
      body: mr.description ?? null,
      url: mr.web_url,
      state,
      draft: mr.draft || mr.work_in_progress || false,
      author: mr.author?.username || '',
      assignees: mr.assignees?.map(a => a.username ?? '') || [],
      labels: mr.labels || [],
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      sourceSha: mr.diff_refs?.head_sha,
      targetSha: mr.diff_refs?.base_sha,
      createdAt: mr.created_at ?? '',
      updatedAt: mr.updated_at ?? '',
      closedAt: mr.closed_at ?? undefined,
      mergedAt: mr.merged_at ?? undefined,
      commentsCount: mr.user_notes_count,
      comments: mr._notes?.map(note => ({
        id: String(note.id),
        author: note.author?.username || '',
        body: note.body ?? '',
        createdAt: note.created_at ?? '',
        updatedAt: note.updated_at ?? '',
      })),
    };
  });

  return {
    items,
    totalCount: pagination?.totalMatches || items.length,
    pagination: {
      currentPage: pagination?.currentPage || 1,
      totalPages: pagination?.totalPages || 1,
      hasMore: pagination?.hasMore || false,
      totalMatches: pagination?.totalMatches,
    },
  };
}

/**
 * Search merge requests on GitLab.
 */
export async function searchPullRequests(
  query: PullRequestQuery,
  parseProjectId: (
    projectId?: string
  ) => number | string = parseGitLabProjectId,
  mapMRStateFn: (
    state?: string
  ) => 'opened' | 'closed' | 'merged' | 'all' | undefined = mapMRState
): Promise<ProviderResponse<PullRequestSearchResult>> {
  const projectId = query.projectId
    ? parseProjectId(query.projectId)
    : undefined;

  const gitlabQuery = {
    projectId,
    iid: query.number, // GitLab uses iid for project-scoped MR number
    state: mapMRStateFn(query.state),
    authorUsername: query.author,
    assigneeUsername: query.assignee,
    labels: query.labels,
    sourceBranch: query.headBranch,
    targetBranch: query.baseBranch,
    createdAfter: query.created,
    updatedAfter: query.updated,
    orderBy: (query.sort === 'created'
      ? 'created_at'
      : query.sort === 'updated'
        ? 'updated_at'
        : undefined) as 'created_at' | 'updated_at' | undefined,
    sort: query.order,
    perPage: query.limit,
    page: query.page,
  };

  const result = await searchGitLabMergeRequestsAPI(gitlabQuery);

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

  // Optionally fetch comments
  let mergeRequests = result.data.mergeRequests;
  if (query.withComments && projectId && mergeRequests.length > 0) {
    mergeRequests = await Promise.all(
      mergeRequests.map(async mr => {
        try {
          const notesResult = await getGitLabMRNotes(projectId, mr.iid);
          if ('data' in notesResult && notesResult.data) {
            return {
              ...mr,
              _notes: notesResult.data,
            };
          }
        } catch {
          // Ignore errors fetching notes
        }
        return mr;
      })
    );
  }

  return {
    data: transformPullRequestResult(
      mergeRequests as GitLabMRData[],
      result.data.pagination,
      query
    ),
    status: 200,
    provider: 'gitlab',
  };
}

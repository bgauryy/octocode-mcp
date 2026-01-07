import {
  GitHubPullRequestsSearchParams,
  GitHubPullRequestItem,
  PRCommentItem,
  CommitInfo,
  DiffEntry,
  CommitFileInfo,
  IssueSearchResultItem,
  PullRequestSimple,
  PullRequestItem,
  IssueComment,
} from './githubAPI';
import type { PullRequestSearchResult } from '../types';
import { SEARCH_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { filterPatch } from '../utils/parsers/diff.js';
import { ContentSanitizer } from '../security/contentSanitizer';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import {
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/http/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

export async function searchGitHubPullRequestsAPI(
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<PullRequestSearchResult> {
  // Cache key excludes context fields (mainResearchGoal, researchGoal, reasoning)
  // as they don't affect the API response
  const cacheKey = generateCacheKey(
    'gh-api-prs',
    {
      query: params.query,
      owner: params.owner,
      repo: params.repo,
      prNumber: params.prNumber,
      state: params.state,
      draft: params.draft,
      merged: params.merged,
      author: params.author,
      assignee: params.assignee,
      mentions: params.mentions,
      commenter: params.commenter,
      involves: params.involves,
      'reviewed-by': params['reviewed-by'],
      'review-requested': params['review-requested'],
      head: params.head,
      base: params.base,
      created: params.created,
      updated: params.updated,
      'merged-at': params['merged-at'],
      closed: params.closed,
      comments: params.comments,
      reactions: params.reactions,
      interactions: params.interactions,
      label: params.label,
      'no-assignee': params['no-assignee'],
      'no-label': params['no-label'],
      'no-milestone': params['no-milestone'],
      'no-project': params['no-project'],
      match: params.match,
      sort: params.sort,
      order: params.order,
      limit: params.limit,
      page: params.page,
      withComments: params.withComments,
      withCommits: params.withCommits,
      type: params.type,
      partialContentMetadata: params.partialContentMetadata,
    },
    sessionId
  );

  const result = await withDataCache<PullRequestSearchResult>(
    cacheKey,
    async () => {
      return await searchGitHubPullRequestsAPIInternal(
        params,
        authInfo,
        sessionId
      );
    },
    {
      shouldCache: (value: PullRequestSearchResult) => !value.error,
    }
  );

  return result;
}

async function searchGitHubPullRequestsAPIInternal(
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo,
  _sessionId?: string
): Promise<PullRequestSearchResult> {
  try {
    if (
      params.prNumber &&
      params.owner &&
      params.repo &&
      !Array.isArray(params.owner) &&
      !Array.isArray(params.repo)
    ) {
      return await fetchGitHubPullRequestByNumberAPIInternal(params, authInfo);
    }

    const octokit = await getOctokit(authInfo);

    const shouldUseSearch = shouldUseSearchForPRs(params);

    if (
      !shouldUseSearch &&
      params.owner &&
      params.repo &&
      !Array.isArray(params.owner) &&
      !Array.isArray(params.repo)
    ) {
      return await searchPullRequestsWithREST(octokit, params);
    }

    const searchQuery = buildPullRequestSearchQuery(params);

    if (!searchQuery) {
      await logSessionError(
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        SEARCH_ERRORS.NO_VALID_PARAMETERS.code
      );
      return {
        pull_requests: [],
        total_count: 0,
        error: SEARCH_ERRORS.NO_VALID_PARAMETERS.message,
        hints: ['Provide search query or filters like owner/repo'],
      };
    }

    const sortValue =
      params.sort && params.sort !== 'best-match' && params.sort !== 'created'
        ? params.sort
        : undefined;

    const perPage = Math.min(params.limit || 30, 100);
    const currentPage = params.page || 1;

    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort: sortValue as
        | 'comments'
        | 'reactions'
        | 'created'
        | 'updated'
        | undefined,
      order: params.order || 'desc',
      per_page: perPage,
      page: currentPage,
    });

    const pullRequests = (searchResult.data.items?.filter(
      (item: IssueSearchResultItem) => !!item.pull_request
    ) || []) as IssueSearchResultItem[];

    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      pullRequests.map(async (item: IssueSearchResultItem) => {
        return await transformPullRequestItemFromSearch(item, params, octokit);
      })
    );

    const formattedPRs = transformedPRs.map(formatPRForResponse);

    // GitHub caps at 1000 total results
    const totalMatches = Math.min(searchResult.data.total_count, 1000);
    const totalPages = Math.min(Math.ceil(totalMatches / perPage), 10);
    const hasMore = currentPage < totalPages;

    return {
      pull_requests: formattedPRs,
      total_count: searchResult.data.total_count,
      ...(searchResult.data.incomplete_results && { incomplete_results: true }),
      pagination: {
        currentPage,
        totalPages,
        perPage,
        totalMatches,
        hasMore,
      },
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    await logSessionError(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      SEARCH_ERRORS.PULL_REQUEST_SEARCH_FAILED.code
    );
    return {
      pull_requests: [],
      total_count: 0,
      error: SEARCH_ERRORS.PULL_REQUEST_SEARCH_FAILED.message(apiError.error),
      hints: [`Verify authentication and search parameters`],
    };
  }
}

async function searchPullRequestsWithREST(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  params: GitHubPullRequestsSearchParams
): Promise<PullRequestSearchResult> {
  try {
    const owner = params.owner as string;
    const repo = params.repo as string;

    const perPage = Math.min(params.limit || 30, 100);
    const currentPage = params.page || 1;

    const result = await octokit.rest.pulls.list({
      owner,
      repo,
      state: params.state || 'open',
      per_page: perPage,
      page: currentPage,
      sort: params.sort === 'updated' ? 'updated' : 'created',
      direction: params.order || 'desc',
      ...(params.head && { head: params.head }),
      ...(params.base && { base: params.base }),
    });

    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      result.data.map(async (item: PullRequestSimple) => {
        return await transformPullRequestItemFromREST(item, params, octokit);
      })
    );

    const formattedPRs = transformedPRs.map(formatPRForResponse);

    // REST API doesn't provide total count, estimate from response
    // If we got full page, there might be more pages
    const hasMore = result.data.length === perPage;

    return {
      pull_requests: formattedPRs,
      total_count: formattedPRs.length,
      pagination: {
        currentPage,
        totalPages: hasMore ? currentPage + 1 : currentPage, // Estimate based on current results
        perPage,
        totalMatches: formattedPRs.length,
        hasMore,
      },
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    await logSessionError(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      SEARCH_ERRORS.PULL_REQUEST_LIST_FAILED.code
    );
    return {
      pull_requests: [],
      total_count: 0,
      error: SEARCH_ERRORS.PULL_REQUEST_LIST_FAILED.message(apiError.error),
      hints: [`Verify repository access and authentication`],
    };
  }
}

/**
 * Common interface for raw PR data from either Search API or REST API.
 * This enables a unified transformation function that handles both sources.
 */
interface RawPRData {
  number: number;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  user?: { login: string } | null;
  labels?: (string | { name?: string | null })[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
  html_url: string;
  draft?: boolean | null;
  merged_at?: string | null;
  // REST-specific fields (optional - not present in Search API)
  head?: { ref?: string; sha?: string };
  base?: { ref?: string; sha?: string };
}

/**
 * Unified PR transformation function that handles both Search API and REST API responses.
 * The head/base refs will be undefined for Search API items (fetched separately from PR details).
 */
function createBasePRTransformation(item: RawPRData): {
  prData: GitHubPullRequestItem;
  sanitizationWarnings: Set<string>;
} {
  const titleSanitized = ContentSanitizer.sanitizeContent(item.title ?? '');
  const bodySanitized = item.body
    ? ContentSanitizer.sanitizeContent(item.body)
    : { content: undefined, warnings: [] };

  const sanitizationWarnings = new Set<string>([
    ...titleSanitized.warnings,
    ...bodySanitized.warnings,
  ]);

  // GitHub PRs can only be 'open' or 'closed'. Default to 'open' if undefined.
  const normalizedState = item.state?.toLowerCase();
  const validState: 'open' | 'closed' =
    normalizedState === 'closed' ? 'closed' : 'open';

  const prData: GitHubPullRequestItem = {
    number: item.number,
    title: titleSanitized.content,
    body: bodySanitized.content,
    state: validState,
    author: item.user?.login ?? '',
    labels:
      item.labels?.map(l => (typeof l === 'string' ? l : (l.name ?? ''))) ?? [],
    created_at: item.created_at ?? '',
    updated_at: item.updated_at ?? '',
    closed_at: item.closed_at ?? null,
    url: item.html_url,
    comments: [],
    reactions: 0,
    draft: item.draft ?? false,
    // Include head/base if available (REST API), undefined otherwise (Search API)
    head: item.head?.ref,
    head_sha: item.head?.sha,
    base: item.base?.ref,
    base_sha: item.base?.sha,
    ...(item.merged_at && { merged_at: item.merged_at }),
  };

  return { prData, sanitizationWarnings };
}

/**
 * Format a transformed PR item for API response output.
 * Standardizes the output format across all PR search/fetch methods.
 */
export function formatPRForResponse(pr: GitHubPullRequestItem) {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state as 'open' | 'closed',
    draft: pr.draft ?? false,
    merged: pr.state === 'closed' && !!pr.merged_at,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    closed_at: pr.closed_at ?? undefined,
    merged_at: pr.merged_at,
    author: pr.author,
    head_ref: pr.head || '',
    head_sha: pr.head_sha || '',
    base_ref: pr.base || '',
    base_sha: pr.base_sha || '',
    body: pr.body,
    comments: pr.comments?.length || 0,
    commits: pr.commits?.length || 0,
    additions:
      pr.file_changes?.files.reduce((sum, file) => sum + file.additions, 0) ||
      0,
    deletions:
      pr.file_changes?.files.reduce((sum, file) => sum + file.deletions, 0) ||
      0,
    changed_files: pr.file_changes?.total_count || 0,
    ...(pr.file_changes && {
      file_changes: pr.file_changes.files?.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
      })),
    }),
    ...(pr.commits && {
      commit_details: pr.commits,
    }),
    ...(pr.comments &&
      pr.comments.length > 0 && {
        comment_details: pr.comments,
      }),
    ...(pr._sanitization_warnings && {
      _sanitization_warnings: pr._sanitization_warnings,
    }),
  };
}

async function fetchPRComments(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRCommentItem[]> {
  try {
    const commentsResult = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return commentsResult.data.map(
      (comment: IssueComment): PRCommentItem => ({
        id: String(comment.id),
        user: comment.user?.login ?? 'unknown',
        body: ContentSanitizer.sanitizeContent(comment.body ?? '').content,
        created_at: comment.created_at ?? '',
        updated_at: comment.updated_at ?? '',
      })
    );
  } catch {
    return [];
  }
}

function normalizeOwnerRepo(params: GitHubPullRequestsSearchParams): {
  owner: string | undefined;
  repo: string | undefined;
} {
  const owner = Array.isArray(params.owner)
    ? params.owner[0] || undefined
    : params.owner;
  const repo = Array.isArray(params.repo)
    ? params.repo[0] || undefined
    : params.repo;
  return { owner, repo };
}

function applyPartialContentFilter(
  files: (DiffEntry | CommitFileInfo)[],
  params: GitHubPullRequestsSearchParams
): (DiffEntry | CommitFileInfo)[] {
  const type = params.type || 'metadata';
  const metadataMap = new Map(
    params.partialContentMetadata?.map(m => [m.file, m]) || []
  );

  if (type === 'metadata') {
    return files.map(file => ({
      ...file,
      patch: undefined,
    }));
  } else if (type === 'partialContent') {
    return files
      .filter(file => metadataMap.has(file.filename))
      .map(file => {
        const meta = metadataMap.get(file.filename);
        return {
          ...file,
          patch: file.patch
            ? filterPatch(file.patch, meta?.additions, meta?.deletions)
            : undefined,
        };
      });
  }
  return files;
}

async function transformPullRequestItemFromSearch(
  item: IssueSearchResultItem,
  params: GitHubPullRequestsSearchParams,
  octokit: InstanceType<typeof OctokitWithThrottling>
): Promise<GitHubPullRequestItem> {
  // Cast to RawPRData - Search API items may have merged_at in extended response
  const rawItem = item as IssueSearchResultItem & { merged_at?: string | null };
  const { prData: result, sanitizationWarnings } =
    createBasePRTransformation(rawItem);

  if (sanitizationWarnings.size > 0) {
    result._sanitization_warnings = Array.from(sanitizationWarnings);
  }

  const type = params.type || 'metadata';
  const shouldFetchContent =
    type === 'fullContent' || type === 'partialContent' || type === 'metadata';

  if (shouldFetchContent || item.pull_request) {
    try {
      const { owner, repo } = normalizeOwnerRepo(params);

      if (owner && repo) {
        const prDetails = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: item.number,
        });

        if (prDetails.data) {
          result.head = prDetails.data.head?.ref;
          result.head_sha = prDetails.data.head?.sha;
          result.base = prDetails.data.base?.ref;
          result.base_sha = prDetails.data.base?.sha;
          result.draft = prDetails.data.draft ?? false;

          if (prDetails.data.merged_at) {
            result.merged_at = prDetails.data.merged_at;
          }

          if (shouldFetchContent) {
            const fileChanges = await fetchPRFileChangesAPI(
              owner,
              repo,
              item.number
            );

            if (fileChanges) {
              fileChanges.files = applyPartialContentFilter(
                fileChanges.files,
                params
              ) as DiffEntry[];

              result.file_changes = fileChanges;
            }
          }
        }
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
      result._sanitization_warnings = [
        ...(result._sanitization_warnings || []),
        `Partial Data: Failed to fetch details (files): ${e instanceof Error ? e.message : String(e)}`,
      ];
    }
  }

  if (params.withComments) {
    const { owner, repo } = normalizeOwnerRepo(params);
    if (owner && repo) {
      result.comments = await fetchPRComments(
        octokit,
        owner,
        repo,
        item.number
      );
    }
  }

  if (params.withCommits) {
    try {
      const { owner, repo } = normalizeOwnerRepo(params);
      if (owner && repo) {
        const commits = await fetchPRCommitsWithFiles(
          owner,
          repo,
          item.number,
          params
        );
        if (commits) {
          result.commits = commits;
        }
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
      result._sanitization_warnings = [
        ...(result._sanitization_warnings || []),
        `Partial Data: Failed to fetch details (commits): ${e instanceof Error ? e.message : String(e)}`,
      ];
    }
  }

  return result;
}

async function fetchPRFileChangesAPI(
  owner: string,
  repo: string,
  prNumber: number,
  authInfo?: AuthInfo
): Promise<{ total_count: number; files: DiffEntry[] } | null> {
  const octokit = await getOctokit(authInfo);
  const allFiles: DiffEntry[] = [];
  let page = 1;
  let keepFetching = true;

  do {
    const result = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
      page: page,
    });

    allFiles.push(...result.data);
    keepFetching = result.data.length === 100;
    page++;
  } while (keepFetching);

  return {
    total_count: allFiles.length,
    files: allFiles,
  };
}

interface CommitListItem {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    } | null;
  };
}

async function fetchPRCommitsAPI(
  owner: string,
  repo: string,
  prNumber: number,
  authInfo?: AuthInfo
): Promise<CommitListItem[] | null> {
  const octokit = await getOctokit(authInfo);
  const result = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
  });

  return result.data as CommitListItem[];
}

async function fetchCommitFilesAPI(
  owner: string,
  repo: string,
  sha: string,
  authInfo?: AuthInfo
): Promise<CommitFileInfo[] | null> {
  try {
    const octokit = await getOctokit(authInfo);
    const result = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    return (result.data.files || []) as CommitFileInfo[];
  } catch {
    return null;
  }
}

async function fetchPRCommitsWithFiles(
  owner: string,
  repo: string,
  prNumber: number,
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo
): Promise<CommitInfo[] | null> {
  const commits = await fetchPRCommitsAPI(owner, repo, prNumber, authInfo);
  if (!commits) return null;

  const sortedCommits = [...commits].sort((a, b) => {
    const dateA = a.commit.author?.date
      ? new Date(a.commit.author.date).getTime()
      : 0;
    const dateB = b.commit.author?.date
      ? new Date(b.commit.author.date).getTime()
      : 0;
    return dateB - dateA;
  });

  const commitInfos: CommitInfo[] = await Promise.all(
    sortedCommits.map(async commit => {
      const files = await fetchCommitFilesAPI(
        owner,
        repo,
        commit.sha,
        authInfo
      );

      let processedFiles: CommitInfo['files'] = [];

      if (files) {
        processedFiles = applyPartialContentFilter(
          files,
          params
        ) as CommitFileInfo[];
      }

      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'unknown',
        date: commit.commit.author?.date || '',
        files: processedFiles,
      };
    })
  );

  return commitInfos;
}

export async function transformPullRequestItemFromREST(
  item: PullRequestSimple | PullRequestItem,
  params: GitHubPullRequestsSearchParams,
  octokit: InstanceType<typeof OctokitWithThrottling>,
  authInfo?: AuthInfo
): Promise<GitHubPullRequestItem> {
  const { prData: result, sanitizationWarnings } =
    createBasePRTransformation(item);

  if (sanitizationWarnings.size > 0) {
    result._sanitization_warnings = Array.from(sanitizationWarnings);
  }

  const type = params.type || 'metadata';
  const shouldFetchContent =
    type === 'fullContent' || type === 'partialContent' || type === 'metadata';

  // Owner and repo are guaranteed to be strings for REST API calls
  const owner = params.owner as string;
  const repo = params.repo as string;

  if (shouldFetchContent) {
    try {
      const fileChanges = await fetchPRFileChangesAPI(
        owner,
        repo,
        item.number,
        authInfo
      );
      if (fileChanges) {
        fileChanges.files = applyPartialContentFilter(
          fileChanges.files,
          params
        ) as DiffEntry[];
        result.file_changes = fileChanges;
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
      result._sanitization_warnings = [
        ...(result._sanitization_warnings || []),
        `Partial Data: Failed to fetch details (files): ${e instanceof Error ? e.message : String(e)}`,
      ];
    }
  }

  if (params.withComments) {
    result.comments = await fetchPRComments(octokit, owner, repo, item.number);
  }

  if (params.withCommits) {
    try {
      const commits = await fetchPRCommitsWithFiles(
        owner,
        repo,
        item.number,
        params,
        authInfo
      );
      if (commits) {
        result.commits = commits;
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
      result._sanitization_warnings = [
        ...(result._sanitization_warnings || []),
        `Partial Data: Failed to fetch details (commits): ${e instanceof Error ? e.message : String(e)}`,
      ];
    }
  }

  return result;
}

export async function fetchGitHubPullRequestByNumberAPI(
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<PullRequestSearchResult> {
  const cacheKey = generateCacheKey(
    'gh-api-prs',
    {
      owner: params.owner,
      repo: params.repo,
      prNumber: params.prNumber,
      type: params.type,
      partialContentMetadata: params.partialContentMetadata,
      withComments: params.withComments,
    },
    sessionId
  );

  const result = await withDataCache<PullRequestSearchResult>(
    cacheKey,
    async () => {
      return await fetchGitHubPullRequestByNumberAPIInternal(params, authInfo);
    },
    {
      shouldCache: (value: PullRequestSearchResult) => !value.error,
    }
  );

  return result;
}

async function fetchGitHubPullRequestByNumberAPIInternal(
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo
): Promise<PullRequestSearchResult> {
  const { owner, repo, prNumber } = params;

  if (!owner || !repo || !prNumber) {
    await logSessionError(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      SEARCH_ERRORS.PR_REQUIRED_PARAMS.code
    );
    return {
      pull_requests: [],
      total_count: 0,
      error: SEARCH_ERRORS.PR_REQUIRED_PARAMS.message,
      hints: ['Provide owner, repo, and prNumber'],
    };
  }

  if (Array.isArray(owner) || Array.isArray(repo)) {
    await logSessionError(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      SEARCH_ERRORS.PR_SINGLE_VALUES.code
    );
    return {
      pull_requests: [],
      total_count: 0,
      error: SEARCH_ERRORS.PR_SINGLE_VALUES.message,
      hints: ['Do not use array for owner or repo when fetching by number'],
    };
  }

  try {
    const octokit = await getOctokit(authInfo);

    const result = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const pr = result.data;

    const transformedPR: GitHubPullRequestItem =
      await transformPullRequestItemFromREST(pr, params, octokit, authInfo);

    const formattedPR = formatPRForResponse(transformedPR);

    return {
      pull_requests: [formattedPR],
      total_count: 1,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);

    await logSessionError(
      TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      SEARCH_ERRORS.PULL_REQUEST_FETCH_FAILED.code
    );
    return {
      pull_requests: [],
      total_count: 0,
      error: SEARCH_ERRORS.PULL_REQUEST_FETCH_FAILED.message(
        prNumber,
        apiError.error
      ),
      hints: [
        `Verify that pull request #${prNumber} exists in ${owner}/${repo}`,
        'Check if you have access to this repository',
        'Ensure the PR number is correct',
      ],
    };
  }
}

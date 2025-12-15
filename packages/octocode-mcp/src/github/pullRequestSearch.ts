import {
  GitHubPullRequestsSearchParams,
  GitHubPullRequestItem,
  CommitInfo,
  DiffEntry,
  CommitFileItem,
} from './githubAPI';
import type { PullRequestSearchResult } from '../types';
import { SEARCH_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import { filterPatch } from '../utils/diffParser.js';

// GitHub API types for pull request files
import { ContentSanitizer } from '../security/contentSanitizer';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import {
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from './queryBuilders';
import { generateCacheKey, withDataCache } from '../utils/cache';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

export async function searchGitHubPullRequestsAPI(
  params: GitHubPullRequestsSearchParams,
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<PullRequestSearchResult> {
  const cacheKey = generateCacheKey('gh-api-prs', params, sessionId);

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
      // Use REST API for simple repository-specific searches (like gh pr list)
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

    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort: sortValue as
        | 'comments'
        | 'reactions'
        | 'created'
        | 'updated'
        | undefined,
      order: params.order || 'desc',
      per_page: Math.min(params.limit || 30, 100),
    });

    const pullRequests =
      searchResult.data.items?.filter(
        (item: Record<string, unknown>) => item.pull_request
      ) || [];

    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      pullRequests.map(async (item: Record<string, unknown>) => {
        return await transformPullRequestItem(item, params, octokit);
      })
    );

    const owner = Array.isArray(params.owner)
      ? params.owner[0] || ''
      : params.owner || '';
    const repo = Array.isArray(params.repo)
      ? params.repo[0] || ''
      : params.repo || '';

    const formattedPRs = transformedPRs.map(pr => ({
      id: 0, // We don't have this in our format
      number: pr.number,
      title: pr.title,
      url: pr.url,
      html_url: pr.url,
      state: pr.state as 'open' | 'closed',
      draft: pr.draft ?? false,
      merged: pr.state === 'closed' && !!pr.merged_at,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at ?? undefined,
      merged_at: pr.merged_at,
      author: {
        login: pr.author,
        id: 0,
        avatar_url: '',
        html_url: `https://github.com/${pr.author}`,
      },
      head: {
        ref: pr.head || '',
        sha: pr.head_sha || '',
        repo: owner && repo ? `${owner}/${repo}` : '',
      },
      base: {
        ref: pr.base || '',
        sha: pr.base_sha || '',
        repo: owner && repo ? `${owner}/${repo}` : '',
      },
      body: pr.body,
      comments: pr.comments?.length || 0,
      review_comments: 0,
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
    }));

    return {
      pull_requests: formattedPRs,
      total_count: searchResult.data.total_count,
      incomplete_results: searchResult.data.incomplete_results,
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

    const listParams: Record<string, unknown> = {
      owner,
      repo,
      state: params.state || 'open',
      per_page: Math.min(params.limit || 30, 100),
      sort: params.sort === 'updated' ? 'updated' : 'created',
      direction: params.order || 'desc',
    };

    if (params.head) listParams.head = params.head;
    if (params.base) listParams.base = params.base;

    const result = await octokit.rest.pulls.list(listParams);

    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      result.data.map(async (item: Record<string, unknown>) => {
        return await transformPullRequestItemFromREST(item, params, octokit);
      })
    );

    const formattedPRs = transformedPRs.map(pr => ({
      id: 0,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      html_url: pr.url,
      state: pr.state as 'open' | 'closed',
      draft: pr.draft ?? false,
      merged: pr.state === 'closed' && !!pr.merged_at,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at ?? undefined,
      merged_at: pr.merged_at,
      author: {
        login: pr.author,
        id: 0,
        avatar_url: '',
        html_url: `https://github.com/${pr.author}`,
      },
      head: {
        ref: pr.head || '',
        sha: pr.head_sha || '',
        repo: `${owner}/${repo}`,
      },
      base: {
        ref: pr.base || '',
        sha: pr.base_sha || '',
        repo: `${owner}/${repo}`,
      },
      body: pr.body,
      comments: pr.comments?.length || 0,
      review_comments: 0,
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
    }));

    return {
      pull_requests: formattedPRs,
      total_count: formattedPRs.length,
      incomplete_results: false,
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

function createBasePRTransformation(item: Record<string, unknown>): {
  prData: GitHubPullRequestItem;
  sanitizationWarnings: Set<string>;
} {
  const titleSanitized = ContentSanitizer.sanitizeContent(
    (item.title as string) || ''
  );
  const bodySanitized = item.body
    ? ContentSanitizer.sanitizeContent(item.body as string)
    : { content: undefined, warnings: [] };

  const sanitizationWarnings = new Set<string>([
    ...titleSanitized.warnings,
    ...bodySanitized.warnings,
  ]);

  const prData: GitHubPullRequestItem = {
    number: item.number as number,
    title: titleSanitized.content,
    body: bodySanitized.content,
    state: ((item.state as string)?.toLowerCase() || 'unknown') as
      | 'open'
      | 'closed',
    author: ((item.user as Record<string, unknown>)?.login as string) || '',
    labels:
      (item.labels as Array<Record<string, unknown>>)?.map(
        (l: Record<string, unknown>) => l.name as string
      ) || [],
    created_at: item.created_at
      ? new Date(item.created_at as string).toLocaleDateString('en-GB')
      : '',
    updated_at: item.updated_at
      ? new Date(item.updated_at as string).toLocaleDateString('en-GB')
      : '',
    closed_at: item.closed_at
      ? new Date(item.closed_at as string).toLocaleDateString('en-GB')
      : null,
    url: item.html_url as string,
    comments: [], // Will be populated if withComments is true
    reactions: 0, // REST API doesn't provide reactions in list
    draft: (item.draft as boolean) ?? false,
    head: (item.head as Record<string, unknown>)?.ref as string,
    head_sha: (item.head as Record<string, unknown>)?.sha as string,
    base: (item.base as Record<string, unknown>)?.ref as string,
    base_sha: (item.base as Record<string, unknown>)?.sha as string,
  };

  if (item.merged_at) {
    prData.merged_at = new Date(item.merged_at as string).toLocaleDateString(
      'en-GB'
    );
  }

  return { prData, sanitizationWarnings };
}

async function fetchPRComments(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPullRequestItem['comments']> {
  try {
    const commentsResult = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return commentsResult.data.map((comment: Record<string, unknown>) => ({
      id: comment.id as string,
      user:
        ((comment.user as Record<string, unknown>)?.login as string) ||
        'unknown',
      body: ContentSanitizer.sanitizeContent((comment.body as string) || '')
        .content,
      created_at: new Date(comment.created_at as string).toLocaleDateString(
        'en-GB'
      ),
      updated_at: new Date(comment.updated_at as string).toLocaleDateString(
        'en-GB'
      ),
    }));
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
  files: (DiffEntry | CommitFileItem)[],
  params: GitHubPullRequestsSearchParams
): (DiffEntry | CommitFileItem)[] {
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
  // fullContent: keep as is
  return files;
}

async function transformPullRequestItem(
  item: Record<string, unknown>,
  params: GitHubPullRequestsSearchParams,
  octokit: InstanceType<typeof OctokitWithThrottling>
): Promise<GitHubPullRequestItem> {
  const { prData: result, sanitizationWarnings } =
    createBasePRTransformation(item);

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
          pull_number: item.number as number,
        });

        if (prDetails.data) {
          result.head = prDetails.data.head?.ref;
          result.head_sha = prDetails.data.head?.sha;
          result.base = prDetails.data.base?.ref;
          result.base_sha = prDetails.data.base?.sha;
          result.draft = prDetails.data.draft ?? false;

          if (shouldFetchContent) {
            const fileChanges = await fetchPRFileChangesAPI(
              owner,
              repo,
              item.number as number
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
    }
  }

  if (params.withComments) {
    const { owner, repo } = normalizeOwnerRepo(params);
    if (owner && repo) {
      result.comments = await fetchPRComments(
        octokit,
        owner,
        repo,
        item.number as number
      );
    }
  }

  // Fetch commits only if requested
  if (params.withCommits) {
    try {
      const { owner, repo } = normalizeOwnerRepo(params);
      if (owner && repo) {
        const commits = await fetchPRCommitsWithFiles(
          owner,
          repo,
          item.number as number,
          params
        );
        if (commits) {
          result.commits = commits;
        }
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
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
  try {
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
  } catch {
    return null;
  }
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
  try {
    const octokit = await getOctokit(authInfo);
    const result = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    return result.data as CommitListItem[];
  } catch {
    return null;
  }
}

async function fetchCommitFilesAPI(
  owner: string,
  repo: string,
  sha: string,
  authInfo?: AuthInfo
): Promise<CommitFileItem[] | null> {
  try {
    const octokit = await getOctokit(authInfo);
    const result = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    return (result.data.files || []) as CommitFileItem[];
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

  // Sort commits by date descending (most recent first)
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
        ) as CommitFileItem[];
      }

      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'unknown',
        date: commit.commit.author?.date
          ? new Date(commit.commit.author.date).toLocaleDateString('en-GB')
          : '',
        files: processedFiles,
      };
    })
  );

  return commitInfos;
}

export async function transformPullRequestItemFromREST(
  item: Record<string, unknown>,
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

  if (shouldFetchContent) {
    const fileChanges = await fetchPRFileChangesAPI(
      params.owner as string,
      params.repo as string,
      item.number as number,
      authInfo
    );
    if (fileChanges) {
      fileChanges.files = applyPartialContentFilter(
        fileChanges.files,
        params
      ) as DiffEntry[];
      result.file_changes = fileChanges;
    }
  }

  if (params.withComments) {
    result.comments = await fetchPRComments(
      octokit,
      params.owner as string,
      params.repo as string,
      item.number as number
    );
  }

  // Fetch commits only if requested
  if (params.withCommits) {
    try {
      const commits = await fetchPRCommitsWithFiles(
        params.owner as string,
        params.repo as string,
        item.number as number,
        params,
        authInfo
      );
      if (commits) {
        result.commits = commits;
      }
    } catch (e) {
      logSessionError(TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, String(e));
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
      // Only cache successful responses
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

    // Use REST API to get specific PR by number
    const result = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const pr = result.data;

    const transformedPR: GitHubPullRequestItem =
      await transformPullRequestItemFromREST(pr, params, octokit, authInfo);

    const repoFullName = `${params.owner}/${params.repo}`;

    const formattedPR = {
      id: 0,
      number: transformedPR.number,
      title: transformedPR.title,
      url: transformedPR.url,
      html_url: transformedPR.url,
      state: transformedPR.state as 'open' | 'closed',
      draft: transformedPR.draft ?? false, // Default to false if undefined
      merged: transformedPR.state === 'closed' && !!transformedPR.merged_at,
      created_at: transformedPR.created_at,
      updated_at: transformedPR.updated_at,
      closed_at: transformedPR.closed_at ?? undefined,
      merged_at: transformedPR.merged_at,
      author: {
        login: transformedPR.author,
        id: 0,
        avatar_url: '',
        html_url: `https://github.com/${transformedPR.author}`,
      },
      head: {
        ref: transformedPR.head || '',
        sha: transformedPR.head_sha || '',
        repo: repoFullName,
      },
      base: {
        ref: transformedPR.base || '',
        sha: transformedPR.base_sha || '',
        repo: repoFullName,
      },
      body: transformedPR.body,
      comments: transformedPR.comments?.length || 0,
      review_comments: 0,
      commits: transformedPR.commits?.length || 0,
      additions:
        transformedPR.file_changes?.files.reduce(
          (sum, file) => sum + file.additions,
          0
        ) || 0,
      deletions:
        transformedPR.file_changes?.files.reduce(
          (sum, file) => sum + file.deletions,
          0
        ) || 0,
      changed_files: transformedPR.file_changes?.total_count || 0,
      // Include file_changes if it was requested and fetched
      ...(transformedPR.file_changes && {
        file_changes: transformedPR.file_changes.files?.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        })),
      }),
      // Include commits breakdown
      ...(transformedPR.commits && {
        commit_details: transformedPR.commits,
      }),
    };

    return {
      pull_requests: [formattedPR],
      total_count: 1,
      incomplete_results: false,
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
